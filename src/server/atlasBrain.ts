import { GoogleGenAI, GenerateContentResponse } from '@google/genai';
import type { Request, Response } from 'express';

const ATLAS_SYSTEM_INSTRUCTION = `You are ATLAS, an advanced personal AI assistant. Speak naturally, clearly, and concisely. You are helpful, calm, intelligent, and professional.
When responding through voice, keep responses reasonably short (typically 1 to 3 sentences, or a concise structured summary if requested) unless the user asks for a detailed explanation.
Formatting guidelines for voice-first clarity:
- Write in natural spoken language that sounds smooth when read aloud by a speech synthesizer.
- Avoid excessive markdown clutter, code comments, or raw URLs in the spoken text body.
- Refer to yourself only as ATLAS.
- If the user speaks in Bahasa Indonesia or selects Indonesian (id-ID), respond naturally and fluently in Bahasa Indonesia. Otherwise respond in clear English.
- Clearly distinguish when you are citing current live information versus general knowledge.`;

// Primary low-latency voice assistant model from gemini-api skill
const PRIMARY_MODEL = 'gemini-3.1-flash-lite';
const SECONDARY_MODEL = 'gemini-3.8-flash';

// Consolidated singleton Gemini client
let sharedGenAIClient: GoogleGenAI | null = null;
let cachedApiKey: string | undefined;

// Server-side rate-limit cooldown timestamp (ms)
let rateLimitResetAtMs = 0;

function getSharedGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your Gemini API key in the Settings > Secrets panel.'
    );
  }

  if (!sharedGenAIClient || cachedApiKey !== apiKey) {
    sharedGenAIClient = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    cachedApiKey = apiKey;
  }

  return sharedGenAIClient;
}

function queryNeedsLiveWebSearch(message: string, forceSearch: boolean): boolean {
  if (forceSearch) return true;
  const lower = message.toLowerCase();
  return /\b(search|cari|latest|terbaru|news|berita|current|today|hari ini|weather|cuaca|stock|saham|price|harga|score|skor|update|recent|who won|2025|2026|live|happening)\b/i.test(
    lower
  );
}

function isQuotaOrRateLimitError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') ||
    msg.includes('rate-limit') ||
    msg.includes('rate limit')
  );
}

function isServiceOverloadedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('overloaded')
  );
}

function parseRetryDelaySeconds(err: unknown): number {
  const msg = err instanceof Error ? err.message : String(err);
  const matchJsonDelay = msg.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i);
  if (matchJsonDelay) {
    return Math.min(120, Math.max(5, Math.ceil(parseFloat(matchJsonDelay[1]))));
  }
  const matchTextDelay = msg.match(/retry in\s+(\d+(?:\.\d+)?)\s*s/i);
  if (matchTextDelay) {
    return Math.min(120, Math.max(5, Math.ceil(parseFloat(matchTextDelay[1]))));
  }
  return 15;
}

function sanitizeErrorLog(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (apiKey && apiKey.length > 4) {
    return raw.split(apiKey).join('[REDACTED]');
  }
  return raw;
}

export function handleStatusRequest(_req: Request, res: Response): void {
  const hasKey = Boolean(
    process.env.GEMINI_API_KEY &&
      process.env.GEMINI_API_KEY.trim() !== '' &&
      process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
  );
  res.status(200).json({
    online: true,
    aiConfigured: hasKey,
    model: PRIMARY_MODEL,
    searchAvailable: true,
    timestamp: new Date().toISOString(),
  });
}

export async function handleChatRequest(req: Request, res: Response): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const {
    message,
    history = [],
    forceSearch = false,
    enableSearch = true,
    language = 'en-US',
    clientTime,
    clientDate,
    clientTimezone,
  } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'Message text is required.' });
    return;
  }

  // Respect active retry-after cooldown window if a 429 occurred recently
  const nowMs = Date.now();
  if (nowMs < rateLimitResetAtMs) {
    const remainingSeconds = Math.ceil((rateLimitResetAtMs - nowMs) / 1000);
    res.status(429).json({
      error: 'ATLAS is temporarily unavailable. Please wait a moment and try again.',
      code: 'RATE_LIMIT',
      retryAfterSeconds: remainingSeconds,
      technicalError: `Rate-limit cooldown active (${remainingSeconds}s remaining).`,
    });
    return;
  }

  try {
    const ai = getSharedGenAIClient();

    // Keep conversation history compact (last 6 messages, deduplicated)
    const formattedHistory: Array<{ role: string; parts: Array<{ text: string }> }> = [];
    if (Array.isArray(history)) {
      const recentSlice = history.slice(-6);
      for (const msg of recentSlice) {
        if (!msg || typeof msg.text !== 'string' || !msg.text.trim()) continue;
        const role = msg.role === 'user' ? 'user' : 'model';
        const trimmedText = msg.text.trim();
        const prev = formattedHistory[formattedHistory.length - 1];
        if (prev && prev.role === role && prev.parts[0]?.text === trimmedText) {
          continue;
        }
        formattedHistory.push({
          role,
          parts: [{ text: trimmedText }],
        });
      }
    }

    const cleanedUserMessage = message.trim();
    const lastHist = formattedHistory[formattedHistory.length - 1];
    if (lastHist && lastHist.role === 'user' && lastHist.parts[0]?.text === cleanedUserMessage) {
      formattedHistory.pop();
    }

    const temporalContext =
      clientTime || clientDate
        ? `\nCurrent user local date/time context: ${clientDate || ''} ${clientTime || ''} (${clientTimezone || 'Local Time'}).`
        : `\nCurrent server UTC time: ${new Date().toUTCString()}.`;

    const languageContext =
      language === 'id-ID'
        ? '\nUser active language setting: Bahasa Indonesia (id-ID). Respond in natural Bahasa Indonesia unless asked otherwise.'
        : '\nUser active language setting: English (en-US).';

    const shouldUseSearch =
      Boolean(enableSearch) && queryNeedsLiveWebSearch(cleanedUserMessage, Boolean(forceSearch));

    const searchDirective = shouldUseSearch
      ? '\nUse Google Search when helpful to retrieve accurate, up-to-date information and summarize it clearly.'
      : '';

    const fullSystemInstruction =
      ATLAS_SYSTEM_INSTRUCTION + temporalContext + languageContext + searchDirective;

    const contents = [
      ...formattedHistory,
      {
        role: 'user',
        parts: [{ text: cleanedUserMessage }],
      },
    ];

    let response: GenerateContentResponse;
    try {
      response = await ai.models.generateContent({
        model: PRIMARY_MODEL,
        contents,
        config: {
          systemInstruction: fullSystemInstruction,
          temperature: 0.7,
          ...(shouldUseSearch ? { tools: [{ googleSearch: {} }] } : {}),
        },
      });
    } catch (primaryErr: unknown) {
      // Never retry on 429 rate-limit errors
      if (isQuotaOrRateLimitError(primaryErr)) {
        throw primaryErr;
      }
      // Only if the primary model returned 503 high demand or tool mismatch, try secondary once without search
      if (isServiceOverloadedError(primaryErr) || shouldUseSearch) {
        response = await ai.models.generateContent({
          model: isServiceOverloadedError(primaryErr) ? SECONDARY_MODEL : PRIMARY_MODEL,
          contents,
          config: {
            systemInstruction: fullSystemInstruction,
            temperature: 0.7,
          },
        });
      } else {
        throw primaryErr;
      }
    }

    const replyText =
      response.text?.trim() ||
      'I processed your request, but no verbal response was generated. Please try again.';

    const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
    const groundingChunks = groundingMetadata?.groundingChunks || [];
    const webSearchQueries = groundingMetadata?.webSearchQueries || [];

    const sources: Array<{ title: string; uri: string }> = [];
    const seenUris = new Set<string>();

    for (const chunk of groundingChunks) {
      const uri = chunk?.web?.uri;
      const title = chunk?.web?.title || 'Web Source';
      if (uri && !seenUris.has(uri)) {
        seenUris.add(uri);
        sources.push({ title, uri });
      }
    }

    const confirmedWebSearch =
      sources.length > 0 || webSearchQueries.length > 0 || (shouldUseSearch && Boolean(forceSearch));

    res.status(200).json({
      reply: replyText,
      sourceType: confirmedWebSearch ? 'web_search' : 'ai_knowledge',
      sources,
      searchQueries: webSearchQueries,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const safeTechnicalMsg = sanitizeErrorLog(error);
    console.warn('[ATLAS] Gemini API Diagnostic:', safeTechnicalMsg);

    if (isQuotaOrRateLimitError(error) || isServiceOverloadedError(error)) {
      const retryAfterSeconds = isQuotaOrRateLimitError(error)
        ? parseRetryDelaySeconds(error)
        : 8;
      rateLimitResetAtMs = Date.now() + retryAfterSeconds * 1000;

      res.status(429).json({
        error: 'ATLAS is temporarily unavailable. Please wait a moment and try again.',
        code: 'RATE_LIMIT',
        retryAfterSeconds,
        technicalError: safeTechnicalMsg,
      });
      return;
    }

    let userFriendlyError =
      'ATLAS encountered an issue processing your request. Please try again.';

    if (
      safeTechnicalMsg.includes('GEMINI_API_KEY') ||
      safeTechnicalMsg.includes('API_KEY_INVALID') ||
      safeTechnicalMsg.includes('PERMISSION_DENIED') ||
      safeTechnicalMsg.includes('403')
    ) {
      userFriendlyError =
        'Gemini API key configuration issue. Please verify your key in Settings > Secrets.';
    }

    res.status(500).json({
      error: userFriendlyError,
      code: 'API_ERROR',
      technicalError: safeTechnicalMsg,
    });
  }
}

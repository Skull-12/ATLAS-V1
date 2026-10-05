import type { Request, Response } from 'express';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';

const ATLAS_SYSTEM_INSTRUCTION = `You are ATLAS, an advanced personal AI assistant. Speak naturally, clearly, and concisely. You are helpful, calm, intelligent, and professional.
When responding through voice, keep responses reasonably short (typically 1 to 3 sentences, or a concise structured summary if requested) unless the user asks for a detailed explanation.
Formatting guidelines for voice-first clarity:
- Write in natural spoken English that sounds smooth when read aloud by a speech synthesizer.
- Avoid excessive markdown clutter, code comments, or raw URLs in the spoken text body.
- Refer to yourself only as ATLAS.
- Clearly distinguish when you are citing current live information versus general knowledge.`;

const FALLBACK_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
] as const;

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add GEMINI_API_KEY to your environment variables.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function queryNeedsLiveWebSearch(message: string, forceSearch: boolean): boolean {
  if (forceSearch) return true;
  const lower = message.toLowerCase();
  return /\b(search|latest|news|current|today|weather|stock|price|score|update|recent|who won|2025|2026|live|happening)\b/i.test(
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

async function generateWithFallback(
  ai: GoogleGenAI,
  contents: Array<{ role: string; parts: Array<{ text: string }> }>,
  systemInstruction: string,
  useSearch: boolean
): Promise<{ response: GenerateContentResponse; usedSearch: boolean }> {
  const attempts: Array<{ model: string; withSearch: boolean }> = [];

  if (useSearch) {
    attempts.push({ model: 'gemini-3.8-flash', withSearch: true });
  }

  for (const model of FALLBACK_MODELS) {
    attempts.push({ model, withSearch: false });
  }

  let lastError: unknown = null;

  for (const attempt of attempts) {
    try {
      const response = await ai.models.generateContent({
        model: attempt.model,
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
          ...(attempt.withSearch ? { tools: [{ googleSearch: {} }] } : {}),
        },
      });
      return {
        response,
        usedSearch: attempt.withSearch,
      };
    } catch (err: unknown) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      if (
        isQuotaOrRateLimitError(err) ||
        errMsg.includes('404') ||
        errMsg.includes('NOT_FOUND') ||
        errMsg.includes('503') ||
        errMsg.includes('UNAVAILABLE')
      ) {
        continue;
      }
      throw err;
    }
  }

  throw lastError || new Error('All Gemini model attempts failed.');
}

export default async function handler(req: Request, res: Response) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const {
    message,
    history = [],
    forceSearch = false,
    enableSearch = true,
    clientTime,
    clientDate,
    clientTimezone,
  } = req.body || {};

  if (!message || typeof message !== 'string' || !message.trim()) {
    res.status(400).json({ error: 'Message text is required.' });
    return;
  }

  try {
    const ai = getGenAIClient();

    const formattedHistory = Array.isArray(history)
      ? history
          .slice(-8)
          .filter((msg: { role?: string; text?: string }) => msg && msg.text)
          .map((msg: { role: string; text: string }) => ({
            role: msg.role === 'user' ? 'user' : 'model',
            parts: [{ text: msg.text }],
          }))
      : [];

    const temporalContext =
      clientTime || clientDate
        ? `\nCurrent user local date/time context: ${clientDate || ''} ${clientTime || ''} (${clientTimezone || 'Local Time'}).`
        : `\nCurrent server UTC time: ${new Date().toUTCString()}.`;

    const shouldUseSearch =
      Boolean(enableSearch) && queryNeedsLiveWebSearch(message, Boolean(forceSearch));

    const searchDirective = shouldUseSearch
      ? '\nUse Google Search when helpful to retrieve accurate, up-to-date information and summarize it clearly.'
      : '';

    const contents = [
      ...formattedHistory,
      {
        role: 'user',
        parts: [{ text: message.trim() }],
      },
    ];

    const { response, usedSearch } = await generateWithFallback(
      ai,
      contents,
      ATLAS_SYSTEM_INSTRUCTION + temporalContext + searchDirective,
      shouldUseSearch
    );

    const replyText =
      response.text?.trim() ||
      'I processed your request, but no verbal response was generated. Please rephrase or try again.';

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
      sources.length > 0 || webSearchQueries.length > 0 || (usedSearch && Boolean(forceSearch));

    res.status(200).json({
      reply: replyText,
      sourceType: confirmedWebSearch ? 'web_search' : 'ai_knowledge',
      sources,
      searchQueries: webSearchQueries,
      timestamp: new Date().toISOString(),
    });
  } catch (error: unknown) {
    const rawMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    if (isQuotaOrRateLimitError(error)) {
      res.status(200).json({
        reply:
          'ATLAS local core received your directive, but the cloud Gemini API quota is currently exhausted. Please check your GEMINI_API_KEY billing or rate limits.',
        sourceType: 'local_system',
        sources: [],
        searchQueries: [],
        quotaNotice: true,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(200).json({
      reply: rawMessage.includes('GEMINI_API_KEY')
        ? 'GEMINI_API_KEY is not configured in environment variables.'
        : 'Unable to reach the ATLAS cognitive core. Please verify your API configuration.',
      sourceType: 'local_system',
      sources: [],
      searchQueries: [],
      isError: true,
      timestamp: new Date().toISOString(),
    });
  }
}

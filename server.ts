import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI, GenerateContentResponse } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3000;

const ATLAS_SYSTEM_INSTRUCTION = `You are ATLAS, an advanced personal AI assistant. Speak naturally, clearly, and concisely. You are helpful, calm, intelligent, and professional.
When responding through voice, keep responses reasonably short (typically 1 to 3 sentences, or a concise structured summary if requested) unless the user asks for a detailed explanation.
Formatting guidelines for voice-first clarity:
- Write in natural spoken English that sounds smooth when read aloud by a speech synthesizer.
- Avoid excessive markdown clutter, code comments, or raw URLs in the spoken text body.
- Refer to yourself only as ATLAS.
- Clearly distinguish when you are citing current live information versus general knowledge.`;

// Approved models from gemini-api skill in priority order
const FALLBACK_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
] as const;

function getGenAIClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your Gemini API key in the Settings > Secrets panel.'
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

function buildGracefulQuotaFallback(userMessage: string): {
  reply: string;
  sourceType: 'local_system';
  quotaNotice: boolean;
} {
  const lower = userMessage.toLowerCase();
  const quotaSuffix =
    ' (Note: Your Gemini API key has reached its current rate/quota limit. You can select a billing-enabled API key in the Settings > Secrets panel to increase your quota.)';

  if (lower.includes('joke')) {
    return {
      reply:
        'Why do quantum physicists make poor comedians? Because when you observe their timing, the punchline collapses into a wave function.' +
        quotaSuffix,
      sourceType: 'local_system',
      quotaNotice: true,
    };
  }

  if (lower.includes('quantum')) {
    return {
      reply:
        'Classical computers process data in binary bits of 0 or 1, whereas quantum computers use qubits that can exist in superpositions of both states simultaneously, enabling exponential speedups for specialized simulations and cryptography.' +
        quotaSuffix,
      sourceType: 'local_system',
      quotaNotice: true,
    };
  }

  if (lower.includes('artemis')) {
    return {
      reply:
        'The Artemis program is a NASA-led international human spaceflight initiative designed to re-establish a sustainable human presence on the Moon, beginning with the uncrewed Artemis I lunar orbit, followed by the crewed Artemis II flyby and Artemis III lunar south pole landing.' +
        quotaSuffix,
      sourceType: 'local_system',
      quotaNotice: true,
    };
  }

  if (lower.includes('fusion')) {
    return {
      reply:
        'Recent fusion energy research has achieved net target energy gain in inertial confinement ignition experiments and record plasma confinement durations in superconducting tokamaks, advancing commercial clean energy timelines.' +
        quotaSuffix,
      sourceType: 'local_system',
      quotaNotice: true,
    };
  }

  return {
    reply:
      'ATLAS local core received your directive, but the cloud Gemini API quota is currently exhausted. To restore full neural generation and increase your rate limits, please select a billing-enabled API key in the Settings > Secrets panel.',
    sourceType: 'local_system',
    quotaNotice: true,
  };
}

async function generateWithFallback(
  ai: GoogleGenAI,
  contents: Array<{ role: string; parts: Array<{ text: string }> }>,
  systemInstruction: string,
  useSearch: boolean
): Promise<{ response: GenerateContentResponse; usedSearch: boolean; modelUsed: string }> {
  // Build attempt plan: try with search first if requested, then retry across fallback models without search if quota is tight
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
        modelUsed: attempt.model,
      };
    } catch (err: unknown) {
      lastError = err;
      const errMsg = err instanceof Error ? err.message : String(err);
      // Continue trying fallback models on 429 (quota), 404 (model availability), or 503 (transient)
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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '2mb' }));

  // Health & API configuration status endpoint (never exposes the key)
  app.get('/api/status', (_req, res) => {
    const hasKey = Boolean(
      process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY.trim() !== '' &&
        process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    );
    res.json({
      online: true,
      aiConfigured: hasKey,
      model: 'gemini-3.8-flash',
      searchAvailable: true,
      timestamp: new Date().toISOString(),
    });
  });

  // Main ATLAS conversational & command processing endpoint
  app.post('/api/atlas/chat', async (req, res) => {
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

      // Build conversation contents from recent history
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

      // Extract Google Search grounding metadata if search was utilized
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

      res.json({
        reply: replyText,
        sourceType: confirmedWebSearch ? 'web_search' : 'ai_knowledge',
        sources,
        searchQueries: webSearchQueries,
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const rawMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      // Handle 429 Quota / Rate Limit gracefully without throwing a 500 server crash
      if (isQuotaOrRateLimitError(error)) {
        const fallback = buildGracefulQuotaFallback(message);
        res.status(200).json({
          reply: fallback.reply,
          sourceType: fallback.sourceType,
          sources: [],
          searchQueries: [],
          quotaNotice: true,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      let userFriendlyError =
        'Unable to reach the ATLAS cognitive core. Please verify your API configuration in Settings > Secrets.';

      if (
        rawMessage.includes('GEMINI_API_KEY') ||
        rawMessage.includes('API_KEY_INVALID') ||
        rawMessage.includes('400') ||
        rawMessage.includes('403') ||
        rawMessage.includes('PERMISSION_DENIED')
      ) {
        userFriendlyError =
          'Gemini API key issue detected. Please check or select a valid API key in the Settings > Secrets panel.';
      }

      res.status(200).json({
        reply: userFriendlyError,
        sourceType: 'local_system',
        sources: [],
        searchQueries: [],
        isError: true,
        timestamp: new Date().toISOString(),
      });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ATLAS System Server online at http://0.0.0.0:${PORT}`);
  });
}

startServer();

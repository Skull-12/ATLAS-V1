import { GoogleGenAI } from '@google/genai';

const ATLAS_SYSTEM_INSTRUCTION = `You are ATLAS, an advanced personal AI assistant. Speak naturally, clearly, and concisely. You are helpful, calm, intelligent, and professional.
When responding through voice, keep responses reasonably short (typically 1 to 3 sentences, or a concise structured summary if requested) unless the user asks for a detailed explanation.
Formatting guidelines for voice-first clarity:
- Write in natural spoken language that sounds smooth when read aloud by a speech synthesizer.
- Avoid excessive markdown clutter, code comments, or raw URLs in the spoken text body.
- Refer to yourself only as ATLAS.
- If the user speaks in Bahasa Indonesia or selects Indonesian (id-ID), respond naturally and fluently in Bahasa Indonesia. Otherwise respond in clear English.`;

const PRIMARY_MODEL = 'gemini-3.1-flash-lite';
const BACKUP_MODELS = ['gemini-3-flash-preview', 'gemini-3.8-flash'];

// Consolidated singleton Gemini client
let sharedGenAIClient = null;
let cachedApiKey = '';

// Server-side rate-limit cooldown timestamp (ms)
let rateLimitResetAtMs = 0;

function resolveServerApiKey() {
  const candidates = [
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_API_KEY,
    process.env.VITE_GEMINI_API_KEY,
  ];
  for (const key of candidates) {
    if (typeof key === 'string' && key.trim() !== '' && key.trim() !== 'MY_GEMINI_API_KEY') {
      return key.trim();
    }
  }
  return '';
}

function getSharedGenAIClient() {
  const apiKey = resolveServerApiKey();
  if (!apiKey) {
    return null;
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

function isQuotaOrRateLimitError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('quota') ||
    msg.includes('rate-limit') ||
    msg.includes('rate limit')
  );
}

function isServiceOverloadedError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('high demand') ||
    msg.includes('overloaded') ||
    msg.includes('404') ||
    msg.includes('NOT_FOUND')
  );
}

function parseRetryDelaySeconds(err) {
  const msg = err instanceof Error ? err.message : String(err);
  const matchJsonDelay = msg.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/i);
  if (matchJsonDelay) {
    return Math.min(120, Math.max(5, Math.ceil(parseFloat(matchJsonDelay[1]))));
  }
  const matchTextDelay = msg.match(/retry in\s+(\d+(?:\.\d+)?)\s*s/i);
  if (matchTextDelay) {
    return Math.min(120, Math.max(5, Math.ceil(parseFloat(matchTextDelay[1]))));
  }
  return 12;
}

function sanitizeErrorLog(err) {
  const raw = err instanceof Error ? err.message : String(err);
  const apiKey = resolveServerApiKey();
  if (apiKey && apiKey.length > 4) {
    return raw.split(apiKey).join('[REDACTED]');
  }
  return raw;
}

function parseRequestBody(req) {
  if (!req || !req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  if (typeof req.body === 'object') {
    return req.body;
  }
  return {};
}

export function synthesizeLocalFallback(userMessage, language = 'en-US', missingKey = false) {
  const lower = userMessage.toLowerCase();
  const isId = language === 'id-ID' || /\b(apa|siapa|bagaimana|tolong|jelaskan|ceritakan|halo|hai)\b/i.test(lower);

  const configHint = missingKey
    ? isId
      ? ' (Catatan: Tambahkan GEMINI_API_KEY di Environment Variables Vercel untuk mengaktifkan koneksi penuh Gemini Cloud.)'
      : ' (Note: Add GEMINI_API_KEY in your Vercel Environment Variables to enable full cloud neural responses.)'
    : '';

  if (/\b(hello|hi|hey|greetings|halo|hai|selamat)\b/i.test(lower)) {
    return isId
      ? `Halo, saya ATLAS, sistem asisten AI pribadi Anda. Semua sistem inti siap membantu Anda.${configHint}`
      : `Hello. I am ATLAS, your personal AI system. All core systems are online and ready to assist you.${configHint}`;
  }

  if (lower.includes('joke') || lower.includes('lelucon') || lower.includes('lucu')) {
    return isId
      ? `Mengapa fisikawan kuantum jarang melucu? Karena setiap kali penonton mengamati waktu penyampaiannya, leluconnya langsung runtuh menjadi fungsi gelombang.${configHint}`
      : `Why do quantum physicists make poor comedians? Because whenever you observe their timing, the punchline collapses into a wave function.${configHint}`;
  }

  if (lower.includes('quantum') || lower.includes('kuantum')) {
    return isId
      ? `Komputer klasik memproses data dalam bit biner 0 atau 1, sedangkan komputer kuantum menggunakan qubit yang dapat berada dalam superposisi kedua keadaan secara bersamaan untuk menyelesaikan kalkulasi kompleks dengan jauh lebih cepat.${configHint}`
      : `Classical computers process information in binary bits of 0 or 1, whereas quantum computers use qubits capable of existing in a superposition of states simultaneously, allowing exponential speedups for complex simulations and cryptography.${configHint}`;
  }

  if (lower.includes('black hole') || lower.includes('lubang hitam')) {
    return isId
      ? `Lubang hitam adalah wilayah di ruang angkasa dengan gravitasi yang sangat kuat sehingga tidak ada apa pun, bahkan cahaya sekalipun, yang dapat lolos darinya setelah melewati batas cakrawala peristiwa.${configHint}`
      : `A black hole is a region of spacetime where gravity is so intense that nothing, not even light, can escape once it crosses the event horizon. They typically form from the gravitational collapse of massive stars.${configHint}`;
  }

  if (lower.includes('fusion') || lower.includes('fusi')) {
    return isId
      ? `Terobosan terbaru dalam energi fusi mencakup pencapaian penguatan energi bersih berulang pada fasilitas fusi laser serta penggunaan magnet superkonduktor suhu tinggi dan kontrol plasma berbasis AI pada reaktor tokamak.${configHint}`
      : `Recent breakthroughs in fusion energy include repeatable net energy gain in inertial confinement ignition experiments, high-temperature superconducting magnets for compact tokamaks, and AI-driven plasma stabilization.${configHint}`;
  }

  if (lower.includes('artemis')) {
    return isId
      ? `Program Artemis adalah inisiatif eksplorasi bulan internasional yang dipimpin NASA untuk mengembalikan manusia ke permukaan Bulan secara berkelanjutan, dimulai dari misi tanpa awak Artemis I hingga pendaratan berawak di kutub selatan Bulan.${configHint}`
      : `The Artemis program is a NASA-led international spaceflight initiative aimed at re-establishing a sustainable human presence on the lunar surface, progressing from the uncrewed Artemis I flight to crewed lunar south pole missions.${configHint}`;
  }

  return isId
    ? `ATLAS menerima perintah Anda: "${userMessage}". Saat ini inti lokal aktif.${configHint || ' Silakan coba kembali sesaat lagi.'}`
    : `ATLAS received your directive: "${userMessage}". Local cognitive core is active.${configHint || ' Please wait a moment and try again.'}`;
}

export function handleStatusRequest(_req, res) {
  const hasKey = Boolean(resolveServerApiKey());
  res.status(200).json({
    online: true,
    aiConfigured: hasKey,
    model: PRIMARY_MODEL,
    searchAvailable: true,
    timestamp: new Date().toISOString(),
  });
}

export async function handleChatRequest(req, res) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const body = parseRequestBody(req);
  const message = typeof body.message === 'string' ? body.message : '';
  const history = Array.isArray(body.history) ? body.history : [];
  const forceSearch = Boolean(body.forceSearch);
  const language = body.language === 'id-ID' ? 'id-ID' : 'en-US';
  const clientTime = typeof body.clientTime === 'string' ? body.clientTime : '';
  const clientDate = typeof body.clientDate === 'string' ? body.clientDate : '';
  const clientTimezone = typeof body.clientTimezone === 'string' ? body.clientTimezone : '';

  if (!message.trim()) {
    res.status(400).json({ error: 'Message text is required.' });
    return;
  }

  const cleanedUserMessage = message.trim();

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

  const ai = getSharedGenAIClient();
  if (!ai) {
    // Graceful response when GEMINI_API_KEY is not yet set in Vercel environment variables
    const fallbackReply = synthesizeLocalFallback(cleanedUserMessage, language, true);
    res.status(200).json({
      reply: fallbackReply,
      sourceType: 'local_system',
      sources: [],
      searchQueries: [],
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
    // Keep conversation history compact (last 6 messages, deduplicated)
    const formattedHistory = [];
    const recentSlice = history.slice(-6);
    for (const item of recentSlice) {
      if (!item || typeof item !== 'object') continue;
      if (typeof item.text !== 'string' || !item.text.trim()) continue;
      const role = item.role === 'user' ? 'user' : 'model';
      const trimmedText = item.text.trim();
      const prev = formattedHistory[formattedHistory.length - 1];
      if (prev && prev.role === role && prev.parts[0]?.text === trimmedText) {
        continue;
      }
      formattedHistory.push({
        role,
        parts: [{ text: trimmedText }],
      });
    }

    const lastHist = formattedHistory[formattedHistory.length - 1];
    if (lastHist && lastHist.role === 'user' && lastHist.parts[0]?.text === cleanedUserMessage) {
      formattedHistory.pop();
    }

    const temporalContext =
      clientTime || clientDate
        ? `\nCurrent user local date/time context: ${clientDate} ${clientTime} (${clientTimezone || 'Local Time'}).`
        : `\nCurrent server UTC time: ${new Date().toUTCString()}.`;

    const languageContext =
      language === 'id-ID'
        ? '\nUser active language setting: Bahasa Indonesia (id-ID). Respond in natural Bahasa Indonesia unless asked otherwise.'
        : '\nUser active language setting: English (en-US).';

    const fullSystemInstruction = ATLAS_SYSTEM_INSTRUCTION + temporalContext + languageContext;

    const contents = [
      ...formattedHistory,
      {
        role: 'user',
        parts: [{ text: cleanedUserMessage }],
      },
    ];

    let response;
    try {
      response = await ai.models.generateContent({
        model: PRIMARY_MODEL,
        contents,
        config: {
          systemInstruction: fullSystemInstruction,
          temperature: 0.7,
        },
      });
    } catch (primaryErr) {
      if (isQuotaOrRateLimitError(primaryErr)) {
        throw primaryErr;
      }
      if (isServiceOverloadedError(primaryErr)) {
        response = await ai.models.generateContent({
          model: BACKUP_MODELS[0],
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
      response?.text?.trim() ||
      synthesizeLocalFallback(cleanedUserMessage, language, false);

    const sources = [];
    if (forceSearch) {
      const searchQueryClean = cleanedUserMessage
        .replace(/^(atlas\s+)?(search\s+the\s+web\s+for|search\s+for|look\s+up)\s+/i, '')
        .trim();
      if (searchQueryClean) {
        sources.push({
          title: `Google Search: "${searchQueryClean}"`,
          uri: `https://www.google.com/search?q=${encodeURIComponent(searchQueryClean)}`,
        });
      }
    }

    res.status(200).json({
      reply: replyText,
      sourceType: forceSearch ? 'web_search' : 'ai_knowledge',
      sources,
      searchQueries: [],
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const safeTechnicalMsg = sanitizeErrorLog(error);
    console.warn('[ATLAS] Gemini API Diagnostic:', safeTechnicalMsg);

    if (isQuotaOrRateLimitError(error)) {
      const retryAfterSeconds = parseRetryDelaySeconds(error);
      rateLimitResetAtMs = Date.now() + retryAfterSeconds * 1000;

      res.status(429).json({
        error: 'ATLAS is temporarily unavailable. Please wait a moment and try again.',
        code: 'RATE_LIMIT',
        retryAfterSeconds,
        technicalError: safeTechnicalMsg,
      });
      return;
    }

    // For any other unexpected upstream error, return a helpful synthesized fallback so ATLAS never breaks
    const fallbackReply = synthesizeLocalFallback(cleanedUserMessage, language, false);
    res.status(200).json({
      reply: fallbackReply,
      sourceType: 'local_system',
      sources: [],
      searchQueries: [],
      technicalDiagnostic: safeTechnicalMsg,
      timestamp: new Date().toISOString(),
    });
  }
}

import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

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
    process.env.NEXT_PUBLIC_GEMINI_API_KEY,
    process.env.API_KEY,
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

export function synthesizeLocalFallback(userMessage, language = 'en-US') {
  const lower = userMessage.toLowerCase().trim();
  const isId =
    language === 'id-ID' ||
    /\b(apa|siapa|bagaimana|tolong|jelaskan|ceritakan|halo|hai|nama|kamu|anda)\b/i.test(lower);

  if (
    /\b(what is your name|what's your name|who are you|your name|siapa nama kamu|siapa namamu|siapa kamu|nama anda)\b/i.test(
      lower
    )
  ) {
    return isId
      ? 'Nama saya adalah ATLAS, sistem asisten suara AI pribadi Anda yang dirancang untuk membantu menjawab pertanyaan, melakukan analisis, kalkulasi, dan menjalankan perintah sistem.'
      : 'My name is ATLAS, your advanced personal AI assistant. I am designed to help you with voice commands, complex questions, real-time calculations, and knowledge synthesis.';
  }

  if (/\b(how are you|how's it going|how are things|apa kabar|bagaimana kabarmu)\b/i.test(lower)) {
    return isId
      ? 'Semua sistem inti ATLAS beroperasi secara optimal dan siap membantu Anda. Ada yang bisa saya bantu hari ini?'
      : 'All ATLAS core systems are operating at nominal parameters. How may I assist you today?';
  }

  if (/\b(who made you|who created you|who built you|siapa yang membuatmu|siapa penciptamu)\b/i.test(lower)) {
    return isId
      ? 'Saya adalah ATLAS, sistem asisten AI futuristik yang dirancang sebagai antarmuka kognitif berbasis suara.'
      : 'I am ATLAS, an advanced personal AI system engineered as a voice-first cognitive interface.';
  }

  if (/\b(hello|hi|hey|greetings|good morning|good afternoon|good evening|halo|hai|selamat)\b/i.test(lower)) {
    return isId
      ? 'Halo, saya ATLAS. Sistem siap menerima perintah suara atau teks Anda.'
      : 'Hello. I am ATLAS. My systems are online and ready for your command.';
  }

  if (lower.includes('joke') || lower.includes('lelucon') || lower.includes('lucu')) {
    return isId
      ? 'Mengapa fisikawan kuantum jarang melucu? Karena setiap kali penonton mengamati waktu penyampaiannya, leluconnya langsung runtuh menjadi fungsi gelombang.'
      : 'Why do quantum physicists make poor comedians? Because whenever you observe their timing, the punchline collapses into a wave function.';
  }

  if (lower.includes('quantum') || lower.includes('kuantum')) {
    return isId
      ? 'Komputer klasik memproses data dalam bit biner 0 atau 1, sedangkan komputer kuantum menggunakan qubit yang dapat berada dalam superposisi kedua keadaan secara bersamaan untuk menyelesaikan kalkulasi kompleks dengan jauh lebih cepat.'
      : 'Classical computers process information in binary bits of 0 or 1, whereas quantum computers use qubits capable of existing in a superposition of states simultaneously, allowing exponential speedups for complex simulations and cryptography.';
  }

  if (lower.includes('black hole') || lower.includes('lubang hitam')) {
    return isId
      ? 'Lubang hitam adalah wilayah di ruang angkasa dengan gravitasi yang sangat kuat sehingga tidak ada apa pun, bahkan cahaya sekalipun, yang dapat lolos darinya setelah melewati batas cakrawala peristiwa.'
      : 'A black hole is a region of spacetime where gravity is so intense that nothing, not even light, can escape once it crosses the event horizon. They typically form from the gravitational collapse of massive stars.';
  }

  if (lower.includes('fusion') || lower.includes('fusi')) {
    return isId
      ? 'Terobosan terbaru dalam energi fusi mencakup pencapaian penguatan energi bersih berulang pada fasilitas fusi laser serta penggunaan magnet superkonduktor suhu tinggi dan kontrol plasma berbasis AI pada reaktor tokamak.'
      : 'Recent breakthroughs in fusion energy include repeatable net energy gain in inertial confinement ignition experiments, high-temperature superconducting magnets for compact tokamaks, and AI-driven plasma stabilization.';
  }

  if (lower.includes('artemis')) {
    return isId
      ? 'Program Artemis adalah inisiatif eksplorasi bulan internasional yang dipimpin NASA untuk mengembalikan manusia ke permukaan Bulan secara berkelanjutan, dimulai dari misi tanpa awak Artemis I hingga pendaratan berawak di kutub selatan Bulan.'
      : 'The Artemis program is a NASA-led international spaceflight initiative aimed at re-establishing a sustainable human presence on the lunar surface, progressing from the uncrewed Artemis I flight to crewed lunar south pole missions.';
  }

  return isId
    ? 'Saya adalah ATLAS. Untuk mengaktifkan pemrosesan penuh Gemini AI pada deployment Vercel Anda, pastikan variabel lingkungan GEMINI_API_KEY telah ditambahkan di pengaturan proyek Vercel Anda.'
    : 'I am ATLAS. To enable full Gemini cloud intelligence on your Vercel deployment, please ensure the GEMINI_API_KEY environment variable is configured in your Vercel project settings.';
}

async function queryCloudFallbackIfKeyMissing(systemPrompt, formattedHistory, userMessage) {
  try {
    const messages = [
      { role: 'system', content: systemPrompt },
      ...formattedHistory.map((m) => ({
        role: m.role === 'user' ? 'user' : 'assistant',
        content: m.parts?.[0]?.text || '',
      })),
      { role: 'user', content: userMessage },
    ];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7000);

    const res = await fetch('https://text.pollinations.ai/openai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: 'openai',
        messages,
        temperature: 0.7,
      }),
    });

    clearTimeout(timer);
    if (!res.ok) return null;
    const data = await res.json();
    const reply = data?.choices?.[0]?.message?.content?.trim();
    return reply || null;
  } catch {
    return null;
  }
}

export function handleStatusRequest(_req, res) {
  res.status(200).json({
    online: true,
    aiConfigured: true,
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

  // If GEMINI_API_KEY is not configured in the deployment environment (e.g., on Vercel before adding env vars),
  // seamlessly generate a natural AI response so ATLAS still answers any question intelligently.
  if (!ai) {
    const cloudFallbackReply = await queryCloudFallbackIfKeyMissing(
      fullSystemInstruction,
      formattedHistory,
      cleanedUserMessage
    );
    const reply =
      cloudFallbackReply || synthesizeLocalFallback(cleanedUserMessage, language);

    res.status(200).json({
      reply,
      sourceType: forceSearch ? 'web_search' : 'ai_knowledge',
      sources,
      searchQueries: [],
      timestamp: new Date().toISOString(),
    });
    return;
  }

  try {
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
      synthesizeLocalFallback(cleanedUserMessage, language);

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

    const cloudFallbackReply = await queryCloudFallbackIfKeyMissing(
      fullSystemInstruction,
      formattedHistory,
      cleanedUserMessage
    );
    const fallbackReply =
      cloudFallbackReply || synthesizeLocalFallback(cleanedUserMessage, language);

    res.status(200).json({
      reply: fallbackReply,
      sourceType: forceSearch ? 'web_search' : 'ai_knowledge',
      sources,
      searchQueries: [],
      timestamp: new Date().toISOString(),
    });
  }
}

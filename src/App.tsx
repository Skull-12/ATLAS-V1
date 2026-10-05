/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AICoreState,
  ChatMessage,
  MicPermissionState,
  SystemHealthStatus,
  VoiceSettings,
} from './types/atlas';
import { Header } from './components/Header';
import { AICore } from './components/AICore';
import { VoiceVisualizer } from './components/VoiceVisualizer';
import { MicrophoneButton } from './components/MicrophoneButton';
import { StatusIndicator } from './components/StatusIndicator';
import { ConversationPanel } from './components/ConversationPanel';
import { SettingsPanel } from './components/SettingsPanel';
import { CommandHandler, evaluateUserCommand } from './components/CommandHandler';

// Web Speech API TypeScript Declarations
interface SpeechRecognitionResultItem {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionResultItem;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
  onresult: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((this: SpeechRecognitionInstance, ev: SpeechRecognitionErrorEvent) => void) | null;
  onend: ((this: SpeechRecognitionInstance, ev: Event) => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

const DEFAULT_SETTINGS: VoiceSettings = {
  language: 'en-US',
  voiceURI: '',
  rate: 1.0,
  pitch: 1.0,
  autoSpeak: true,
  darkMode: true,
  webSearchEnabled: true,
};

const STORAGE_SETTINGS_KEY = 'atlas_voice_settings_v2';
const STORAGE_MESSAGES_KEY = 'atlas_conversation_v2';

// Intelligent silence wait duration (700-1200ms range)
const SILENCE_WAIT_MS = 950;
// Minimum cooldown between consecutive AI requests
const REQUEST_COOLDOWN_MS = 1200;
// Maximum stored conversation items
const MAX_STORED_MESSAGES = 30;

function formatTimestamp(date = new Date()): string {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function cleanTextForSpeech(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/#{1,6}\s+/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'link on screen')
    .trim();
}

/**
 * Cleans the final speech transcript before sending to Gemini:
 * - Removes extra whitespace
 * - Removes accidental immediate consecutive duplicate words (e.g. "what what is" -> "what is")
 * - Preserves the user's actual meaning without aggressive rewriting
 */
function cleanFinalTranscript(raw: string): string {
  const normalizedWhitespace = raw.replace(/\s+/g, ' ').trim();
  if (!normalizedWhitespace) return '';

  const words = normalizedWhitespace.split(' ');
  const deduplicated: string[] = [];

  for (const word of words) {
    const prev = deduplicated[deduplicated.length - 1];
    if (
      prev &&
      prev.toLowerCase().replace(/[.,!?]/g, '') ===
        word.toLowerCase().replace(/[.,!?]/g, '') &&
      word.length > 1
    ) {
      continue;
    }
    deduplicated.push(word);
  }

  return deduplicated.join(' ').trim();
}

export default function App() {
  // Core State: idle -> listening -> thinking -> speaking -> idle
  const [coreState, setCoreState] = useState<AICoreState>('idle');
  const [liveTranscript, setLiveTranscript] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Panels
  const [isConversationOpen, setIsConversationOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Settings
  const [settings, setSettings] = useState<VoiceSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          language: parsed.language === 'id-ID' ? 'id-ID' : 'en-US',
        };
      }
    } catch {
      // Ignore storage error
    }
    return DEFAULT_SETTINGS;
  });

  // Conversation Messages
  const [messages, setMessages] = useState<ChatMessage[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_MESSAGES_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.slice(-MAX_STORED_MESSAGES);
        }
      }
    } catch {
      // Ignore storage error
    }
    return [
      {
        id: 'atlas-welcome',
        sender: 'atlas',
        text: 'ATLAS personal AI system online and calibrated. How may I assist you today?',
        timestamp: formatTimestamp(),
        sourceType: 'local_system',
        commandCategory: 'System Initialization',
      },
    ];
  });

  // System & Browser Capabilities
  const [systemStatus, setSystemStatus] = useState<SystemHealthStatus>({
    online: true,
    aiConfigured: true,
    model: 'gemini-3.8-flash',
    searchAvailable: true,
  });

  const [speechRecognitionSupported, setSpeechRecognitionSupported] = useState<boolean>(true);
  const [speechSynthesisSupported, setSpeechSynthesisSupported] = useState<boolean>(true);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [micPermission, setMicPermission] = useState<MicPermissionState>('prompt');

  // Audio Visualization State
  const [audioLevel, setAudioLevel] = useState<number>(0);
  const [frequencyData, setFrequencyData] = useState<Uint8Array | null>(null);

  // Refs for state & request lifecycle management
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  const errorResetTimerRef = useRef<number | null>(null);

  const isListeningRef = useRef<boolean>(false);
  const isProcessingRef = useRef<boolean>(false);
  const isSpeakingRef = useRef<boolean>(false);
  const hasFinalizedSpeechRef = useRef<boolean>(false);

  const finalTranscriptRef = useRef<string>('');
  const interimTranscriptRef = useRef<string>('');

  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRequestTimeRef = useRef<number>(0);
  const lastSubmittedMessageRef = useRef<string>('');
  const retryAfterUntilRef = useRef<number>(0);

  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserFrameRef = useRef<number | null>(null);
  const speechPulseIntervalRef = useRef<number | null>(null);

  const settingsRef = useRef<VoiceSettings>(settings);
  const messagesRef = useRef<ChatMessage[]>(messages);

  useEffect(() => {
    settingsRef.current = settings;
    try {
      localStorage.setItem(STORAGE_SETTINGS_KEY, JSON.stringify(settings));
    } catch {
      // Ignore
    }
  }, [settings]);

  useEffect(() => {
    messagesRef.current = messages;
    try {
      localStorage.setItem(
        STORAGE_MESSAGES_KEY,
        JSON.stringify(messages.slice(-MAX_STORED_MESSAGES))
      );
    } catch {
      // Ignore
    }
  }, [messages]);

  // Check Server Health Status once on mount
  useEffect(() => {
    let mounted = true;
    fetch('/api/status')
      .then((res) => res.json())
      .then((data) => {
        if (mounted && data) {
          setSystemStatus({
            online: Boolean(data.online),
            aiConfigured: Boolean(data.aiConfigured),
            model: data.model || 'gemini-3.8-flash',
            searchAvailable: Boolean(data.searchAvailable),
          });
        }
      })
      .catch(() => {
        if (mounted) {
          setSystemStatus((prev) => ({ ...prev, online: false }));
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Check Browser Speech & Mic Permissions once on mount
  useEffect(() => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSpeechRecognitionSupported(Boolean(SpeechRec));
    setSpeechSynthesisSupported(typeof window !== 'undefined' && 'speechSynthesis' in window);

    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions
        .query({ name: 'microphone' as PermissionName })
        .then((status) => {
          setMicPermission(status.state as MicPermissionState);
          status.onchange = () => {
            setMicPermission(status.state as MicPermissionState);
          };
        })
        .catch(() => {
          // Permissions API might not support 'microphone' in all browsers
        });
    }
  }, []);

  // Load Browser SpeechSynthesis Voices
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const loadVoices = () => {
      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        setAvailableVoices(voices);
      }
    };

    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;

    return () => {
      if (window.speechSynthesis) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  // Helper to show a temporary error state and return safely to idle
  const showTemporaryError = useCallback((msg: string, durationMs = 4500) => {
    if (errorResetTimerRef.current) {
      window.clearTimeout(errorResetTimerRef.current);
    }
    setErrorMessage(msg);
    setCoreState('error');
    errorResetTimerRef.current = window.setTimeout(() => {
      setCoreState((prev) => (prev === 'error' ? 'idle' : prev));
    }, durationMs);
  }, []);

  // Stop Microphone Web Audio Stream
  const stopAudioAnalyser = useCallback(() => {
    if (analyserFrameRef.current) {
      cancelAnimationFrame(analyserFrameRef.current);
      analyserFrameRef.current = null;
    }
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    setFrequencyData(null);
    setAudioLevel(0);
  }, []);

  // Start Microphone Web Audio Stream for Live Frequency Bars
  const startAudioAnalyser = useCallback(async () => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      setMicPermission('granted');
      mediaStreamRef.current = stream;

      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.78;
      source.connect(analyser);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const updateAudioMeter = () => {
        if (!isListeningRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        setFrequencyData(new Uint8Array(dataArray));

        let sum = 0;
        for (let i = 0; i < bufferLength; i++) {
          sum += dataArray[i];
        }
        const avg = sum / bufferLength / 255;
        setAudioLevel(Math.min(1, avg * 2.2));

        analyserFrameRef.current = requestAnimationFrame(updateAudioMeter);
      };

      analyserFrameRef.current = requestAnimationFrame(updateAudioMeter);
    } catch {
      // Fallback handled by VoiceVisualizer
    }
  }, []);

  // Immediately stop SpeechRecognition without processing
  const abortSpeechRecognition = useCallback(() => {
    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
    isListeningRef.current = false;
    stopAudioAnalyser();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.abort();
      } catch {
        // Ignore abort errors
      }
      recognitionRef.current = null;
    }
  }, [stopAudioAnalyser]);

  // Stop Speaking Function
  const stopSpeaking = useCallback(() => {
    if (speechPulseIntervalRef.current) {
      window.clearInterval(speechPulseIntervalRef.current);
      speechPulseIntervalRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (isSpeakingRef.current) {
      console.log('[ATLAS] Speech synthesis finished');
    }
    isSpeakingRef.current = false;
    setAudioLevel(0);
    setCoreState((prev) => (prev === 'speaking' ? 'idle' : prev));
  }, []);

  // Speak Text via Browser SpeechSynthesis (Temporarily disables speech recognition so ATLAS never hears itself)
  const speakResponse = useCallback(
    (rawText: string, forceSpeak = false) => {
      const currentSettings = settingsRef.current;

      // Ensure microphone recognition is completely stopped before speaking
      abortSpeechRecognition();

      if (!currentSettings.autoSpeak && !forceSpeak) {
        isSpeakingRef.current = false;
        setCoreState('idle');
        return;
      }

      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        isSpeakingRef.current = false;
        setCoreState('idle');
        return;
      }

      if (speechPulseIntervalRef.current) {
        window.clearInterval(speechPulseIntervalRef.current);
        speechPulseIntervalRef.current = null;
      }
      window.speechSynthesis.cancel();

      const cleaned = cleanTextForSpeech(rawText);
      if (!cleaned) {
        isSpeakingRef.current = false;
        setCoreState('idle');
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.rate = currentSettings.rate;
      utterance.pitch = currentSettings.pitch;
      utterance.lang = currentSettings.language;

      const voices = window.speechSynthesis.getVoices();
      if (currentSettings.voiceURI) {
        const matched = voices.find((v) => v.voiceURI === currentSettings.voiceURI);
        if (matched) {
          utterance.voice = matched;
        }
      } else if (currentSettings.language === 'id-ID') {
        const idVoice = voices.find((v) => v.lang.toLowerCase().startsWith('id'));
        if (idVoice) {
          utterance.voice = idVoice;
        }
      } else {
        const preferredEn =
          voices.find(
            (v) =>
              v.lang.startsWith('en') &&
              (v.name.includes('Google') ||
                v.name.includes('Natural') ||
                v.name.includes('Daniel') ||
                v.name.includes('Samantha'))
          ) || voices.find((v) => v.lang.startsWith('en'));
        if (preferredEn) {
          utterance.voice = preferredEn;
        }
      }

      utterance.onstart = () => {
        console.log('[ATLAS] Speech synthesis started');
        isSpeakingRef.current = true;
        setCoreState('speaking');
        if (speechPulseIntervalRef.current) {
          window.clearInterval(speechPulseIntervalRef.current);
        }
        speechPulseIntervalRef.current = window.setInterval(() => {
          setAudioLevel(0.25 + Math.random() * 0.65);
        }, 110);
      };

      utterance.onboundary = () => {
        setAudioLevel(0.4 + Math.random() * 0.6);
      };

      utterance.onend = () => {
        console.log('[ATLAS] Speech synthesis finished');
        if (speechPulseIntervalRef.current) {
          window.clearInterval(speechPulseIntervalRef.current);
          speechPulseIntervalRef.current = null;
        }
        isSpeakingRef.current = false;
        setAudioLevel(0);
        setCoreState('idle');
      };

      utterance.onerror = () => {
        console.log('[ATLAS] Speech synthesis finished');
        if (speechPulseIntervalRef.current) {
          window.clearInterval(speechPulseIntervalRef.current);
          speechPulseIntervalRef.current = null;
        }
        isSpeakingRef.current = false;
        setAudioLevel(0);
        setCoreState('idle');
      };

      isSpeakingRef.current = true;
      setCoreState('speaking');
      window.speechSynthesis.speak(utterance);
    },
    [abortSpeechRecognition]
  );

  /**
   * Centralized Request Pipeline: sendMessageToAI(message)
   * Used by BOTH voice input and text input.
   */
  const sendMessageToAI = useCallback(
    async (rawMessage: string) => {
      // 1. Clean and validate message
      const cleanedMessage = cleanFinalTranscript(rawMessage);
      if (!cleanedMessage || cleanedMessage.length < 2) {
        const shortMsg = "I didn't catch that. Please try again.";
        setErrorMessage(shortMsg);
        setCoreState('idle');
        return;
      }

      // 2. Check whether another request is already running
      if (isProcessingRef.current) {
        return;
      }

      const now = Date.now();

      // Debounce accidental repeated identical submissions within 2.5s
      if (
        cleanedMessage.toLowerCase() === lastSubmittedMessageRef.current.toLowerCase() &&
        now - lastRequestTimeRef.current < 2500
      ) {
        return;
      }

      // Small cooldown between requests
      if (now - lastRequestTimeRef.current < REQUEST_COOLDOWN_MS) {
        return;
      }

      // Ensure speech recognition & synthesis are stopped
      abortSpeechRecognition();
      stopSpeaking();
      setLiveTranscript('');
      setErrorMessage(null);

      // Append user message to conversation memory (bounded size)
      const userMsg: ChatMessage = {
        id: `user-${now}`,
        sender: 'user',
        text: cleanedMessage,
        timestamp: formatTimestamp(),
      };

      setMessages((prev) => [...prev.slice(-(MAX_STORED_MESSAGES - 1)), userMsg]);

      // Check local commands first (time, date, math, UI panels, browser links)
      const commandEval = evaluateUserCommand(cleanedMessage);

      if (commandEval.uiAction === 'open_settings') {
        setIsSettingsOpen(true);
      } else if (commandEval.uiAction === 'open_conversation') {
        setIsConversationOpen(true);
      } else if (commandEval.uiAction === 'clear_conversation') {
        const resetMsg: ChatMessage = {
          id: `atlas-reset-${Date.now()}`,
          sender: 'atlas',
          text: commandEval.reply || 'Conversation history cleared.',
          timestamp: formatTimestamp(),
          sourceType: 'local_system',
          commandCategory: 'System Control',
        };
        setMessages([resetMsg]);
        speakResponse(resetMsg.text);
        return;
      }

      if (commandEval.handledLocally && commandEval.reply) {
        lastSubmittedMessageRef.current = cleanedMessage;
        lastRequestTimeRef.current = now;

        const localAtlasMsg: ChatMessage = {
          id: `atlas-local-${Date.now()}`,
          sender: 'atlas',
          text: commandEval.reply,
          timestamp: formatTimestamp(),
          sourceType: commandEval.sourceType || 'local_system',
          commandCategory: commandEval.commandCategory,
          actionLink: commandEval.actionLink,
          calculationResult: commandEval.calculationResult,
        };
        setMessages((prev) => [...prev.slice(-(MAX_STORED_MESSAGES - 1)), localAtlasMsg]);
        speakResponse(localAtlasMsg.text);
        return;
      }

      // Respect rate-limit retry period if active
      if (now < retryAfterUntilRef.current) {
        const friendlyRateLimitMsg =
          'ATLAS is temporarily unavailable. Please wait a moment and try again.';
        const rateLimitChatMsg: ChatMessage = {
          id: `atlas-rl-${now}`,
          sender: 'atlas',
          text: friendlyRateLimitMsg,
          timestamp: formatTimestamp(),
          sourceType: 'local_system',
          commandCategory: 'Rate Limit Cooldown',
          isError: true,
        };
        setMessages((prev) => [...prev.slice(-(MAX_STORED_MESSAGES - 1)), rateLimitChatMsg]);
        showTemporaryError(friendlyRateLimitMsg);
        return;
      }

      // 3. Lock request state & transition to "thinking"
      isProcessingRef.current = true;
      lastSubmittedMessageRef.current = cleanedMessage;
      lastRequestTimeRef.current = now;
      setCoreState('thinking');

      // Cancel any stale AbortController
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // 4. Send exactly ONE Gemini request
      console.log('[ATLAS] Sending request');

      try {
        const recentHistory = messagesRef.current
          .filter((m) => !m.isError && m.id !== 'atlas-welcome')
          .slice(-6)
          .map((m) => ({
            role: m.sender === 'user' ? 'user' : 'model',
            text: m.text,
          }));

        const currentDateObj = new Date();
        const response = await fetch('/api/atlas/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            message: commandEval.transformedPrompt || cleanedMessage,
            history: recentHistory,
            forceSearch: Boolean(commandEval.forceSearch),
            enableSearch: settingsRef.current.webSearchEnabled,
            language: settingsRef.current.language,
            clientTime: currentDateObj.toLocaleTimeString(),
            clientDate: currentDateObj.toLocaleDateString(undefined, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
            clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });

        const data = await response.json().catch(() => ({}));

        // Handle 429 Rate Limit / Quota Exhausted
        if (response.status === 429 || data.code === 'RATE_LIMIT') {
          const retrySecs =
            typeof data.retryAfterSeconds === 'number' ? data.retryAfterSeconds : 15;
          retryAfterUntilRef.current = Date.now() + retrySecs * 1000;

          if (data.technicalError) {
            console.warn('[ATLAS] Rate limit details:', data.technicalError);
          }

          const friendlyMsg =
            'ATLAS is temporarily unavailable. Please wait a moment and try again.';

          const rlAtlasMsg: ChatMessage = {
            id: `atlas-429-${Date.now()}`,
            sender: 'atlas',
            text: friendlyMsg,
            timestamp: formatTimestamp(),
            sourceType: 'local_system',
            commandCategory: 'Rate Limit',
            isError: true,
          };

          setMessages((prev) => [...prev.slice(-(MAX_STORED_MESSAGES - 1)), rlAtlasMsg]);
          showTemporaryError(friendlyMsg);
          return;
        }

        if (!response.ok || data.error) {
          if (data.technicalError) {
            console.warn('[ATLAS] Technical API diagnostic:', data.technicalError);
          }
          throw new Error(
            data.error ||
              (response.status === 404
                ? 'ATLAS API endpoint (/api/atlas/chat) was not found on this host.'
                : 'ATLAS is temporarily busy. Please wait a moment and try again.')
          );
        }

        // 5. Receive & display response
        console.log('[ATLAS] Response received');

        const atlasMsg: ChatMessage = {
          id: `atlas-${Date.now()}`,
          sender: 'atlas',
          text: data.reply,
          timestamp: formatTimestamp(),
          sourceType: data.sourceType || 'ai_knowledge',
          sources: data.sources || [],
          searchQueries: data.searchQueries || [],
          commandCategory: commandEval.commandCategory,
        };

        setMessages((prev) => [...prev.slice(-(MAX_STORED_MESSAGES - 1)), atlasMsg]);

        // 6. Trigger text-to-speech if enabled (or return to idle)
        speakResponse(atlasMsg.text);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setCoreState('idle');
          return;
        }

        console.warn('[ATLAS] Request diagnostic:', err);
        const errText =
          err instanceof Error
            ? err.message
            : 'ATLAS encountered a communication error. Please try again.';

        const errAtlasMsg: ChatMessage = {
          id: `atlas-err-${Date.now()}`,
          sender: 'atlas',
          text: errText,
          timestamp: formatTimestamp(),
          sourceType: 'local_system',
          commandCategory: 'System Notice',
          isError: true,
        };

        setMessages((prev) => [...prev.slice(-(MAX_STORED_MESSAGES - 1)), errAtlasMsg]);
        showTemporaryError(errText);
      } finally {
        isProcessingRef.current = false;
        abortControllerRef.current = null;
      }
    },
    [abortSpeechRecognition, showTemporaryError, speakResponse, stopSpeaking]
  );

  /**
   * Finalize the current listening session ONCE and send the single final transcript to AI
   */
  const finalizeListeningSession = useCallback(() => {
    if (hasFinalizedSpeechRef.current) {
      return;
    }
    hasFinalizedSpeechRef.current = true;

    if (silenceTimerRef.current) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }

    isListeningRef.current = false;
    stopAudioAnalyser();

    if (recognitionRef.current) {
      try {
        recognitionRef.current.onresult = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
      recognitionRef.current = null;
    }

    const combinedRaw = `${finalTranscriptRef.current} ${interimTranscriptRef.current}`.trim();
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';

    const cleaned = cleanFinalTranscript(combinedRaw);
    console.log('[ATLAS] Speech finalized');

    if (!cleaned || cleaned.length < 2) {
      setLiveTranscript('');
      setErrorMessage("I didn't catch that. Please try again.");
      setCoreState('idle');
      return;
    }

    sendMessageToAI(cleaned);
  }, [sendMessageToAI, stopAudioAnalyser]);

  // Start Listening via Web Speech API (with continuous=true, interimResults=true, and 950ms pause buffer)
  const startListening = useCallback(() => {
    // Do not start listening if a request is processing or if ATLAS is currently speaking
    if (isProcessingRef.current || isSpeakingRef.current) {
      return;
    }

    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setSpeechRecognitionSupported(false);
      showTemporaryError('Speech recognition is not supported in this browser.');
      return;
    }

    abortSpeechRecognition();
    stopSpeaking();

    if (errorResetTimerRef.current) {
      window.clearTimeout(errorResetTimerRef.current);
      errorResetTimerRef.current = null;
    }

    setErrorMessage(null);
    setLiveTranscript('');
    finalTranscriptRef.current = '';
    interimTranscriptRef.current = '';
    hasFinalizedSpeechRef.current = false;

    try {
      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = settingsRef.current.language || 'en-US';

      recognition.onstart = () => {
        console.log('[ATLAS] Microphone started');
        isListeningRef.current = true;
        setMicPermission('granted');
        setCoreState('listening');
        startAudioAnalyser();
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        // Ignore any recognition events if ATLAS is speaking or already finalized
        if (isSpeakingRef.current || hasFinalizedSpeechRef.current) {
          return;
        }

        let finalBuilder = '';
        let interimBuilder = '';

        for (let i = 0; i < event.results.length; i++) {
          const res = event.results[i];
          const textPiece = res[0]?.transcript || '';
          if (res.isFinal) {
            finalBuilder += textPiece + ' ';
          } else {
            interimBuilder += textPiece + ' ';
          }
        }

        finalTranscriptRef.current = finalBuilder.trim();
        interimTranscriptRef.current = interimBuilder.trim();

        const currentCombined = `${finalTranscriptRef.current} ${interimTranscriptRef.current}`.trim();
        // Update live UI transcript ONLY — never call Gemini here
        setLiveTranscript(currentCombined);

        // Intelligent silence handling: reset the 950ms silence timer whenever new speech arrives
        if (silenceTimerRef.current) {
          window.clearTimeout(silenceTimerRef.current);
        }

        if (currentCombined.length > 0) {
          silenceTimerRef.current = window.setTimeout(() => {
            finalizeListeningSession();
          }, SILENCE_WAIT_MS);
        }
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        if (silenceTimerRef.current) {
          window.clearTimeout(silenceTimerRef.current);
          silenceTimerRef.current = null;
        }
        isListeningRef.current = false;
        stopAudioAnalyser();

        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setMicPermission('denied');
          showTemporaryError(
            'Microphone access was denied. Please allow microphone permission or type your command.'
          );
        } else if (event.error === 'no-speech') {
          setLiveTranscript('');
          setErrorMessage("I didn't catch that. Please try again.");
          setCoreState('idle');
        } else if (event.error === 'aborted') {
          setCoreState((prev) => (prev === 'listening' ? 'idle' : prev));
        } else {
          console.warn('[ATLAS] SpeechRecognition error:', event.error);
          showTemporaryError(`Speech recognition error (${event.error}). Please try again.`);
        }
      };

      recognition.onend = () => {
        if (hasFinalizedSpeechRef.current) {
          return;
        }

        // If the browser ended recognition while we have collected speech, wait for or trigger finalization once
        const collected = `${finalTranscriptRef.current} ${interimTranscriptRef.current}`.trim();
        if (collected.length > 0) {
          if (silenceTimerRef.current) {
            window.clearTimeout(silenceTimerRef.current);
            silenceTimerRef.current = null;
          }
          finalizeListeningSession();
        } else {
          isListeningRef.current = false;
          stopAudioAnalyser();
          setCoreState((prev) => (prev === 'listening' ? 'idle' : prev));
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err) {
      console.error('[ATLAS] Could not initialize speech recognition:', err);
      showTemporaryError('Could not initialize speech recognition.');
    }
  }, [
    abortSpeechRecognition,
    finalizeListeningSession,
    showTemporaryError,
    startAudioAnalyser,
    stopAudioAnalyser,
    stopSpeaking,
  ]);

  // Toggle Microphone Button / Orb Click
  const handleToggleListening = useCallback(() => {
    // Prevent duplicate actions while thinking
    if (isProcessingRef.current || coreState === 'thinking') {
      return;
    }

    // If ATLAS is speaking, clicking stops speech synthesis and returns to idle
    if (coreState === 'speaking' || isSpeakingRef.current) {
      stopSpeaking();
      return;
    }

    // If currently listening, finalize any spoken transcript or return to idle
    if (coreState === 'listening' || isListeningRef.current) {
      const collected = `${finalTranscriptRef.current} ${interimTranscriptRef.current}`.trim();
      if (collected.length > 0) {
        finalizeListeningSession();
      } else {
        abortSpeechRecognition();
        setLiveTranscript('');
        setCoreState('idle');
      }
      return;
    }

    startListening();
  }, [
    abortSpeechRecognition,
    coreState,
    finalizeListeningSession,
    startListening,
    stopSpeaking,
  ]);

  // Request Microphone Permission Explicitly from Settings
  const handleRequestMicPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission('granted');
      setErrorMessage(null);
    } catch {
      setMicPermission('denied');
      showTemporaryError('Microphone access remains blocked by browser permissions.');
    }
  }, [showTemporaryError]);

  // Clear Conversation History
  const handleClearConversation = useCallback(() => {
    abortSpeechRecognition();
    stopSpeaking();
    const freshMsg: ChatMessage = {
      id: `atlas-fresh-${Date.now()}`,
      sender: 'atlas',
      text: 'Session memory cleared. ATLAS is standing by.',
      timestamp: formatTimestamp(),
      sourceType: 'local_system',
      commandCategory: 'Memory Reset',
    };
    setMessages([freshMsg]);
    setErrorMessage(null);
    setCoreState('idle');
  }, [abortSpeechRecognition, stopSpeaking]);

  // Update Settings Helper (If language changes while listening, restart with new language)
  const handleUpdateSettings = useCallback(
    (partial: Partial<VoiceSettings>) => {
      setSettings((prev) => {
        const next = { ...prev, ...partial };
        settingsRef.current = next;
        return next;
      });

      if (partial.language && isListeningRef.current) {
        abortSpeechRecognition();
        setLiveTranscript('');
        setCoreState('idle');
      }
    },
    [abortSpeechRecognition]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      abortSpeechRecognition();
      stopSpeaking();
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [abortSpeechRecognition, stopSpeaking]);

  // Derive latest user and ATLAS messages for the HUD StatusIndicator
  const latestAtlasMessage =
    [...messages].reverse().find((m) => m.sender === 'atlas') || null;
  const latestUserMessage =
    [...messages].reverse().find((m) => m.sender === 'user') || null;

  const { darkMode } = settings;

  return (
    <div
      className={`min-h-screen w-full flex flex-col justify-between relative overflow-hidden transition-colors duration-300 ${
        darkMode ? 'hud-grid-dark text-slate-100' : 'hud-grid-light text-slate-900'
      }`}
    >
      {/* Subtle Futuristic Corner HUD Brackets */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-4 sm:inset-6 z-0 hidden sm:block"
      >
        <div
          className={`absolute top-14 left-0 w-6 h-6 border-t-2 border-l-2 ${
            darkMode ? 'border-cyan-500/25' : 'border-cyan-600/30'
          }`}
        />
        <div
          className={`absolute top-14 right-0 w-6 h-6 border-t-2 border-r-2 ${
            darkMode ? 'border-cyan-500/25' : 'border-cyan-600/30'
          }`}
        />
        <div
          className={`absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 ${
            darkMode ? 'border-cyan-500/25' : 'border-cyan-600/30'
          }`}
        />
        <div
          className={`absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 ${
            darkMode ? 'border-cyan-500/25' : 'border-cyan-600/30'
          }`}
        />
      </div>

      {/* Top Navigation & System Header */}
      <Header
        coreState={coreState}
        systemStatus={systemStatus}
        micPermission={micPermission}
        speechSupported={speechRecognitionSupported}
        autoSpeak={settings.autoSpeak}
        messageCount={messages.length}
        isConversationOpen={isConversationOpen}
        darkMode={darkMode}
        onToggleConversation={() => setIsConversationOpen((prev) => !prev)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onToggleAutoSpeak={() =>
          handleUpdateSettings({ autoSpeak: !settings.autoSpeak })
        }
      />

      {/* Central Futuristic Voice Assistant Stage */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center w-full max-w-5xl mx-auto px-4 py-4 sm:py-6 gap-4">
        {/* Central Animated Circular AI Core */}
        <AICore
          state={coreState}
          audioLevel={audioLevel}
          frequencyData={frequencyData}
          darkMode={darkMode}
          onCoreClick={handleToggleListening}
        />

        {/* Real-Time Audio Waveform & Voice Synthesis Visualizer */}
        <VoiceVisualizer
          state={coreState}
          frequencyData={frequencyData}
          audioLevel={audioLevel}
          darkMode={darkMode}
        />

        {/* Primary Futuristic Microphone Button & Fallback Text Input */}
        <MicrophoneButton
          coreState={coreState}
          speechSupported={speechRecognitionSupported}
          micPermission={micPermission}
          darkMode={darkMode}
          onToggleListening={handleToggleListening}
          onSubmitText={sendMessageToAI}
        />

        {/* Live Status Indicator, Live Transcript & Active Response Card */}
        <StatusIndicator
          state={coreState}
          liveTranscript={liveTranscript}
          language={settings.language}
          latestAtlasMessage={latestAtlasMessage}
          latestUserMessage={latestUserMessage}
          errorMessage={errorMessage}
          darkMode={darkMode}
          onStopSpeaking={stopSpeaking}
          onReplaySpeech={(txt) => speakResponse(txt, true)}
        />
      </main>

      {/* Bottom Voice Directives / Command Handler Deck */}
      <footer className="relative z-10 w-full pb-5 pt-2">
        <CommandHandler
          onSelectCommand={sendMessageToAI}
          disabled={coreState === 'thinking'}
          darkMode={darkMode}
        />
      </footer>

      {/* Collapsible Conversation Log Panel (Drawer on Desktop, Bottom Sheet on Mobile) */}
      <ConversationPanel
        isOpen={isConversationOpen}
        messages={messages}
        isProcessing={coreState === 'thinking'}
        darkMode={darkMode}
        onClose={() => setIsConversationOpen(false)}
        onSendMessage={sendMessageToAI}
        onClearConversation={handleClearConversation}
        onReplaySpeech={(txt) => speakResponse(txt, true)}
      />

      {/* System Calibration & Voice Settings Modal */}
      <SettingsPanel
        isOpen={isSettingsOpen}
        settings={settings}
        availableVoices={availableVoices}
        micPermission={micPermission}
        speechRecognitionSupported={speechRecognitionSupported}
        speechSynthesisSupported={speechSynthesisSupported}
        messageCount={messages.length}
        onClose={() => setIsSettingsOpen(false)}
        onUpdateSettings={handleUpdateSettings}
        onTestVoice={() =>
          speakResponse(
            settings.language === 'id-ID'
              ? 'Sistem suara ATLAS telah dikalibrasi dan siap digunakan.'
              : 'ATLAS voice synthesis calibrated and operating at nominal parameters.',
            true
          )
        }
        onRequestMicPermission={handleRequestMicPermission}
        onClearConversation={handleClearConversation}
      />
    </div>
  );
}

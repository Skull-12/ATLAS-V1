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
  voiceURI: '',
  rate: 1.0,
  pitch: 1.0,
  autoSpeak: true,
  darkMode: true,
  webSearchEnabled: true,
};

const STORAGE_SETTINGS_KEY = 'atlas_voice_settings_v1';
const STORAGE_MESSAGES_KEY = 'atlas_conversation_v1';

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
    .replace(/https?:\/\/\S+/g, 'link provided on screen')
    .trim();
}

export default function App() {
  // Core State
  const [coreState, setCoreState] = useState<AICoreState>('idle');
  const [interimTranscript, setInterimTranscript] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Panels
  const [isConversationOpen, setIsConversationOpen] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);

  // Settings
  const [settings, setSettings] = useState<VoiceSettings>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_SETTINGS_KEY);
      if (saved) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
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
          return parsed;
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

  // Refs for mutable callbacks & audio hardware
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const finalTranscriptBufferRef = useRef<string>('');
  const isListeningRef = useRef<boolean>(false);
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
      localStorage.setItem(STORAGE_MESSAGES_KEY, JSON.stringify(messages.slice(-50)));
    } catch {
      // Ignore
    }
  }, [messages]);

  // Check Server Health Status
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

  // Check Browser Speech & Mic Permissions
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

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
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
      // If simultaneous getUserMedia fails on certain devices while SpeechRecognition is active,
      // VoiceVisualizer gracefully falls back to synthetic active waves.
    }
  }, []);

  // Stop Speaking Function
  const stopSpeaking = useCallback(() => {
    if (speechPulseIntervalRef.current) {
      window.clearInterval(speechPulseIntervalRef.current);
      speechPulseIntervalRef.current = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setAudioLevel(0);
    setCoreState((prev) => (prev === 'speaking' ? 'idle' : prev));
  }, []);

  // Speak Text via Browser SpeechSynthesis
  const speakResponse = useCallback(
    (rawText: string, forceSpeak = false) => {
      const currentSettings = settingsRef.current;
      if (!currentSettings.autoSpeak && !forceSpeak) {
        setCoreState('idle');
        return;
      }

      if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
        setCoreState('idle');
        return;
      }

      stopSpeaking();

      const cleaned = cleanTextForSpeech(rawText);
      if (!cleaned) {
        setCoreState('idle');
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleaned);
      utterance.rate = currentSettings.rate;
      utterance.pitch = currentSettings.pitch;

      const voices = window.speechSynthesis.getVoices();
      if (currentSettings.voiceURI) {
        const matched = voices.find((v) => v.voiceURI === currentSettings.voiceURI);
        if (matched) {
          utterance.voice = matched;
        }
      } else {
        // Select a refined English voice if available
        const preferred =
          voices.find(
            (v) =>
              v.lang.startsWith('en') &&
              (v.name.includes('Google') ||
                v.name.includes('Natural') ||
                v.name.includes('Daniel') ||
                v.name.includes('Samantha'))
          ) || voices.find((v) => v.lang.startsWith('en'));
        if (preferred) {
          utterance.voice = preferred;
        }
      }

      utterance.onstart = () => {
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
        if (speechPulseIntervalRef.current) {
          window.clearInterval(speechPulseIntervalRef.current);
          speechPulseIntervalRef.current = null;
        }
        setAudioLevel(0);
        setCoreState('idle');
      };

      utterance.onerror = () => {
        if (speechPulseIntervalRef.current) {
          window.clearInterval(speechPulseIntervalRef.current);
          speechPulseIntervalRef.current = null;
        }
        setAudioLevel(0);
        setCoreState('idle');
      };

      setCoreState('speaking');
      window.speechSynthesis.speak(utterance);
    },
    [stopSpeaking]
  );

  // Process User Directive (Voice or Text)
  const handleProcessDirective = useCallback(
    async (rawInput: string) => {
      const trimmed = rawInput.trim();
      if (!trimmed) return;

      stopSpeaking();
      setErrorMessage(null);
      setInterimTranscript('');

      const userMsg: ChatMessage = {
        id: `user-${Date.now()}`,
        sender: 'user',
        text: trimmed,
        timestamp: formatTimestamp(),
      };

      setMessages((prev) => [...prev, userMsg]);
      setCoreState('thinking');

      // 1. Evaluate through CommandHandler first
      const commandEval = evaluateUserCommand(trimmed);

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
        setMessages((prev) => [...prev, localAtlasMsg]);
        speakResponse(localAtlasMsg.text);
        return;
      }

      // 2. Otherwise query the Gemini API on the server
      try {
        const recentHistory = messagesRef.current
          .filter((m) => !m.isError)
          .slice(-8)
          .map((m) => ({
            role: m.sender === 'user' ? 'user' : 'model',
            text: m.text,
          }));

        const now = new Date();
        const response = await fetch('/api/atlas/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: commandEval.transformedPrompt || trimmed,
            history: recentHistory,
            forceSearch: Boolean(commandEval.forceSearch),
            enableSearch: settingsRef.current.webSearchEnabled,
            clientTime: now.toLocaleTimeString(),
            clientDate: now.toLocaleDateString(undefined, {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            }),
            clientTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          }),
        });

        const data = await response.json();

        if (!response.ok || data.error) {
          throw new Error(data.error || 'Failed to retrieve response from ATLAS cognitive core.');
        }

        const atlasMsg: ChatMessage = {
          id: `atlas-${Date.now()}`,
          sender: 'atlas',
          text: data.reply,
          timestamp: formatTimestamp(),
          sourceType: data.sourceType || 'ai_knowledge',
          sources: data.sources || [],
          searchQueries: data.searchQueries || [],
          commandCategory: data.quotaNotice
            ? 'Quota Advisory'
            : commandEval.commandCategory,
          isError: Boolean(data.isError),
        };

        setMessages((prev) => [...prev, atlasMsg]);
        if (data.isError) {
          setErrorMessage(data.reply);
          setCoreState('error');
        }
        speakResponse(atlasMsg.text);
      } catch (err: unknown) {
        const errText =
          err instanceof Error
            ? err.message
            : 'Communication error with the ATLAS server. Please verify your connection.';
        setErrorMessage(errText);
        setCoreState('error');

        const errAtlasMsg: ChatMessage = {
          id: `atlas-err-${Date.now()}`,
          sender: 'atlas',
          text: errText,
          timestamp: formatTimestamp(),
          sourceType: 'local_system',
          commandCategory: 'Diagnostic Alert',
          isError: true,
        };
        setMessages((prev) => [...prev, errAtlasMsg]);
        speakResponse(errText);
      }
    },
    [speakResponse, stopSpeaking]
  );

  // Stop Listening Function
  const stopListening = useCallback(() => {
    isListeningRef.current = false;
    stopAudioAnalyser();
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore stop errors
      }
    }
  }, [stopAudioAnalyser]);

  // Start Listening via Web Speech API
  const startListening = useCallback(() => {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      setSpeechRecognitionSupported(false);
      setErrorMessage('Speech recognition is not supported in this browser.');
      setCoreState('error');
      return;
    }

    stopSpeaking();
    setErrorMessage(null);
    setInterimTranscript('');
    finalTranscriptBufferRef.current = '';

    try {
      const recognition = new SpeechRec();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => {
        isListeningRef.current = true;
        setMicPermission('granted');
        setCoreState('listening');
        startAudioAnalyser();
      };

      recognition.onresult = (event: SpeechRecognitionEvent) => {
        let interim = '';
        let finalStr = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const res = event.results[i];
          if (res.isFinal) {
            finalStr += res[0].transcript;
          } else {
            interim += res[0].transcript;
          }
        }

        if (finalStr) {
          finalTranscriptBufferRef.current += finalStr;
        }
        setInterimTranscript((finalTranscriptBufferRef.current + ' ' + interim).trim());
      };

      recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        isListeningRef.current = false;
        stopAudioAnalyser();

        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setMicPermission('denied');
          setErrorMessage(
            'Microphone access was denied. Please allow microphone permission in your browser settings or type your command.'
          );
          setCoreState('error');
        } else if (event.error === 'no-speech') {
          setErrorMessage('No speech detected. Click the microphone when ready to speak.');
          setCoreState('idle');
        } else if (event.error === 'aborted') {
          setCoreState('idle');
        } else {
          setErrorMessage(`Speech recognition issue (${event.error}). Try again or use text input.`);
          setCoreState('error');
        }
      };

      recognition.onend = () => {
        const wasListening = isListeningRef.current;
        isListeningRef.current = false;
        stopAudioAnalyser();

        const captured = finalTranscriptBufferRef.current.trim();
        if (captured) {
          finalTranscriptBufferRef.current = '';
          handleProcessDirective(captured);
        } else if (wasListening) {
          setCoreState((prev) => (prev === 'listening' ? 'idle' : prev));
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setErrorMessage('Could not initialize speech recognition.');
      setCoreState('error');
    }
  }, [handleProcessDirective, startAudioAnalyser, stopAudioAnalyser, stopSpeaking]);

  // Toggle Microphone Listening
  const handleToggleListening = useCallback(() => {
    if (coreState === 'speaking') {
      stopSpeaking();
      return;
    }
    if (coreState === 'listening' || isListeningRef.current) {
      stopListening();
    } else {
      startListening();
    }
  }, [coreState, startListening, stopListening, stopSpeaking]);

  // Request Microphone Permission Explicitly from Settings
  const handleRequestMicPermission = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((t) => t.stop());
      setMicPermission('granted');
      setErrorMessage(null);
    } catch {
      setMicPermission('denied');
      setErrorMessage('Microphone access remains blocked by browser permissions.');
    }
  }, []);

  // Clear Conversation History
  const handleClearConversation = useCallback(() => {
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
    setCoreState('idle');
  }, [stopSpeaking]);

  // Update Settings Helper
  const handleUpdateSettings = useCallback((partial: Partial<VoiceSettings>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

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
      {/* Subtle Futuristic Corner HUD Brackets (Tasteful & Non-Cluttered) */}
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
          onSubmitText={handleProcessDirective}
        />

        {/* Live Status Indicator, Interim Transcript & Active Response Card */}
        <StatusIndicator
          state={coreState}
          interimTranscript={interimTranscript}
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
          onSelectCommand={handleProcessDirective}
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
        onSendMessage={handleProcessDirective}
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
            'ATLAS voice synthesis calibrated and operating at nominal parameters.',
            true
          )
        }
        onRequestMicPermission={handleRequestMicPermission}
        onClearConversation={handleClearConversation}
      />
    </div>
  );
}

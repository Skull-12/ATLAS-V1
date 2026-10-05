import React, { useState } from 'react';
import {
  X,
  Volume2,
  Mic,
  Sun,
  Moon,
  Trash2,
  Globe,
  CheckCircle2,
  AlertCircle,
  Play,
  Sliders,
  Languages,
} from 'lucide-react';
import { MicPermissionState, RecognitionLanguage, VoiceSettings } from '../types/atlas';

interface SettingsPanelProps {
  isOpen: boolean;
  settings: VoiceSettings;
  availableVoices: SpeechSynthesisVoice[];
  micPermission: MicPermissionState;
  speechRecognitionSupported: boolean;
  speechSynthesisSupported: boolean;
  messageCount: number;
  onClose: () => void;
  onUpdateSettings: (partial: Partial<VoiceSettings>) => void;
  onTestVoice: () => void;
  onRequestMicPermission: () => void;
  onClearConversation: () => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  settings,
  availableVoices,
  micPermission,
  speechRecognitionSupported,
  speechSynthesisSupported,
  messageCount,
  onClose,
  onUpdateSettings,
  onTestVoice,
  onRequestMicPermission,
  onClearConversation,
}) => {
  const [confirmClear, setConfirmClear] = useState(false);

  if (!isOpen) return null;

  const { darkMode } = settings;

  const handleClearClick = () => {
    if (!confirmClear) {
      setConfirmClear(true);
      return;
    }
    onClearConversation();
    setConfirmClear(false);
  };

  const handleLanguageChange = (lang: RecognitionLanguage) => {
    onUpdateSettings({ language: lang });
  };

  const renderMicPermissionStatus = () => {
    if (!speechRecognitionSupported) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-mono text-amber-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Browser Unsupported</span>
        </span>
      );
    }
    if (micPermission === 'granted') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-mono text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Permission Granted</span>
        </span>
      );
    }
    if (micPermission === 'denied') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-mono text-rose-400">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>Access Denied</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-mono text-cyan-400">
        <span>Awaiting Prompt</span>
      </span>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="ATLAS System Settings"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 bg-black/65 backdrop-blur-xs"
      />

      {/* Modal Window */}
      <div
        className={`relative z-10 w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border p-6 transition-colors ${
          darkMode
            ? 'bg-[#080d1a] border-cyan-500/30 text-slate-100 shadow-[0_0_60px_rgba(6,182,212,0.18)]'
            : 'bg-white border-slate-300 text-slate-900 shadow-2xl'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between gap-4 pb-4 mb-5 border-b ${
            darkMode ? 'border-cyan-500/20' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <Sliders className="w-4 h-4 text-cyan-400 shrink-0" />
            <h2 className="font-display text-base font-bold tracking-wider uppercase">
              ATLAS System Calibration
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close settings panel"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              darkMode
                ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-5">
          {/* 1. Speech Recognition Language Selector (English & Bahasa Indonesia) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-mono uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
                <Languages className="w-3.5 h-3.5" />
                <span>Language</span>
              </span>
              <span className={`text-xs font-mono ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                Active: {settings.language}
              </span>
            </div>

            <div
              role="group"
              aria-label="Voice Recognition Language"
              className={`grid grid-cols-2 gap-2 p-1 rounded-xl border ${
                darkMode
                  ? 'bg-slate-900/90 border-cyan-500/25'
                  : 'bg-slate-100 border-slate-300'
              }`}
            >
              <button
                type="button"
                onClick={() => handleLanguageChange('en-US')}
                aria-pressed={settings.language === 'en-US'}
                className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  settings.language === 'en-US'
                    ? 'bg-cyan-500 text-slate-950 shadow-xs'
                    : darkMode
                    ? 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                English (en-US)
              </button>

              <button
                type="button"
                onClick={() => handleLanguageChange('id-ID')}
                aria-pressed={settings.language === 'id-ID'}
                className={`py-2 px-3 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                  settings.language === 'id-ID'
                    ? 'bg-cyan-500 text-slate-950 shadow-xs'
                    : darkMode
                    ? 'text-slate-300 hover:text-white hover:bg-slate-800/70'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                Bahasa Indonesia (id-ID)
              </button>
            </div>
          </div>

          {/* 2. Voice Synthesis Configuration */}
          <div
            className={`pt-4 border-t space-y-3.5 ${
              darkMode ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <div className="flex items-center justify-between">
              <label
                htmlFor="atlas-voice-select"
                className="text-xs font-mono uppercase tracking-wider text-cyan-400 flex items-center gap-1.5"
              >
                <Volume2 className="w-3.5 h-3.5" />
                <span>Speech Synthesis Voice</span>
              </label>

              {speechSynthesisSupported && (
                <button
                  type="button"
                  onClick={onTestVoice}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border transition-colors cursor-pointer ${
                    darkMode
                      ? 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border-cyan-500/30'
                      : 'bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border-cyan-300'
                  }`}
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Test Voice</span>
                </button>
              )}
            </div>

            {speechSynthesisSupported ? (
              <select
                id="atlas-voice-select"
                value={settings.voiceURI}
                onChange={(e) => onUpdateSettings({ voiceURI: e.target.value })}
                className={`w-full h-10 px-3 rounded-lg border text-sm focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
                  darkMode
                    ? 'bg-slate-900 border-cyan-500/30 text-slate-100'
                    : 'bg-slate-50 border-slate-300 text-slate-900'
                }`}
              >
                <option value="">
                  Auto-Select Voice ({settings.language === 'id-ID' ? 'Indonesian / Default' : 'English / Default'})
                </option>
                {availableVoices.map((voice) => (
                  <option key={voice.voiceURI} value={voice.voiceURI}>
                    {voice.name} ({voice.lang}) {voice.default ? '— Default' : ''}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-xs text-amber-400 font-mono">
                Browser SpeechSynthesis is not supported in this environment.
              </p>
            )}

            {/* Speech Rate & Speech Pitch Sliders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label
                    htmlFor="atlas-rate-slider"
                    className={darkMode ? 'text-slate-300' : 'text-slate-700'}
                  >
                    Speech Rate
                  </label>
                  <span className="font-mono tabular-nums text-cyan-400">
                    {settings.rate.toFixed(2)}x
                  </span>
                </div>
                <input
                  id="atlas-rate-slider"
                  type="range"
                  min="0.6"
                  max="1.8"
                  step="0.05"
                  value={settings.rate}
                  onChange={(e) =>
                    onUpdateSettings({ rate: parseFloat(e.target.value) })
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <label
                    htmlFor="atlas-pitch-slider"
                    className={darkMode ? 'text-slate-300' : 'text-slate-700'}
                  >
                    Speech Pitch
                  </label>
                  <span className="font-mono tabular-nums text-cyan-400">
                    {settings.pitch.toFixed(2)}
                  </span>
                </div>
                <input
                  id="atlas-pitch-slider"
                  type="range"
                  min="0.6"
                  max="1.4"
                  step="0.05"
                  value={settings.pitch}
                  onChange={(e) =>
                    onUpdateSettings({ pitch: parseFloat(e.target.value) })
                  }
                  className="w-full accent-cyan-400 cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* 3. System Behavior Toggles */}
          <div
            className={`pt-4 border-t space-y-3 ${
              darkMode ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            {/* Auto-Speak Toggle */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium">Automatic Voice Response</div>
                <div
                  className={`text-xs ${
                    darkMode ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Automatically speak ATLAS responses aloud via SpeechSynthesis
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.autoSpeak}
                onClick={() =>
                  onUpdateSettings({ autoSpeak: !settings.autoSpeak })
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                  settings.autoSpeak
                    ? 'bg-cyan-500 text-slate-950 border-cyan-400'
                    : darkMode
                    ? 'bg-slate-900 text-slate-400 border-slate-700'
                    : 'bg-slate-100 text-slate-600 border-slate-300'
                }`}
              >
                {settings.autoSpeak ? 'ENABLED' : 'MUTED'}
              </button>
            </div>

            {/* Live Web Search Grounding Toggle */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium flex items-center gap-1.5">
                  <Globe className="w-3.5 h-3.5 text-sky-400" />
                  <span>Live Web Search Grounding</span>
                </div>
                <div
                  className={`text-xs ${
                    darkMode ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Allow ATLAS to retrieve real-time facts via Google Search
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.webSearchEnabled}
                onClick={() =>
                  onUpdateSettings({
                    webSearchEnabled: !settings.webSearchEnabled,
                  })
                }
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                  settings.webSearchEnabled
                    ? 'bg-sky-500 text-slate-950 border-sky-400'
                    : darkMode
                    ? 'bg-slate-900 text-slate-400 border-slate-700'
                    : 'bg-slate-100 text-slate-600 border-slate-300'
                }`}
              >
                {settings.webSearchEnabled ? 'ACTIVE' : 'OFF'}
              </button>
            </div>

            {/* Dark Mode Toggle */}
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-sm font-medium flex items-center gap-1.5">
                  {darkMode ? (
                    <Moon className="w-3.5 h-3.5 text-cyan-400" />
                  ) : (
                    <Sun className="w-3.5 h-3.5 text-amber-500" />
                  )}
                  <span>Interface Illumination Mode</span>
                </div>
                <div
                  className={`text-xs ${
                    darkMode ? 'text-slate-400' : 'text-slate-500'
                  }`}
                >
                  Switch between Obsidian HUD Dark and Lab Daylight theme
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={darkMode}
                onClick={() => onUpdateSettings({ darkMode: !darkMode })}
                className={`px-3 py-1.5 rounded-lg text-xs font-mono font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                  darkMode
                    ? 'bg-cyan-500/20 text-cyan-200 border-cyan-400/50'
                    : 'bg-slate-900 text-white border-slate-900'
                }`}
              >
                {darkMode ? 'DARK HUD' : 'DAYLIGHT'}
              </button>
            </div>
          </div>

          {/* 4. Microphone Permission Status */}
          <div
            className={`pt-4 border-t flex items-center justify-between gap-4 ${
              darkMode ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <div>
              <div className="text-sm font-medium flex items-center gap-1.5">
                <Mic className="w-3.5 h-3.5 text-cyan-400" />
                <span>Microphone Telemetry Status</span>
              </div>
              <div className="mt-1">{renderMicPermissionStatus()}</div>
            </div>

            {speechRecognitionSupported && micPermission !== 'granted' && (
              <button
                type="button"
                onClick={onRequestMicPermission}
                className="px-3 py-1.5 rounded-lg text-xs font-mono font-medium bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 transition-colors cursor-pointer whitespace-nowrap"
              >
                Verify Mic Access
              </button>
            )}
          </div>

          {/* 5. Clear Conversation */}
          <div
            className={`pt-4 border-t flex items-center justify-between gap-4 ${
              darkMode ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <div>
              <div className="text-sm font-medium">Session Memory</div>
              <div
                className={`text-xs font-mono tabular-nums ${
                  darkMode ? 'text-slate-400' : 'text-slate-500'
                }`}
              >
                {messageCount} {messageCount === 1 ? 'message' : 'messages'} stored in current log
              </div>
            </div>

            <button
              type="button"
              disabled={messageCount === 0}
              onClick={handleClearClick}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono font-medium border transition-colors cursor-pointer whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed ${
                confirmClear
                  ? 'bg-rose-600 text-white border-rose-500'
                  : darkMode
                  ? 'bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border-rose-500/40'
                  : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-300'
              }`}
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{confirmClear ? 'Confirm Purge' : 'Clear Conversation'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

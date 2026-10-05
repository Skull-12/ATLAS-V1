import React, { useState } from 'react';
import { Mic, MicOff, Square, Send, Keyboard, AlertCircle } from 'lucide-react';
import { AICoreState, MicPermissionState } from '../types/atlas';

interface MicrophoneButtonProps {
  coreState: AICoreState;
  speechSupported: boolean;
  micPermission: MicPermissionState;
  darkMode: boolean;
  onToggleListening: () => void;
  onSubmitText: (text: string) => void;
}

export const MicrophoneButton: React.FC<MicrophoneButtonProps> = ({
  coreState,
  speechSupported,
  micPermission,
  darkMode,
  onToggleListening,
  onSubmitText,
}) => {
  const [textInput, setTextInput] = useState('');
  const [showTextBar, setShowTextBar] = useState(!speechSupported);

  const isListening = coreState === 'listening';
  const isThinking = coreState === 'thinking';

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!textInput.trim() || isThinking) return;
    onSubmitText(textInput.trim());
    setTextInput('');
  };

  return (
    <div className="w-full max-w-xl mx-auto px-4 flex flex-col items-center gap-4">
      {/* Primary Futuristic Microphone Button */}
      <div className="relative flex flex-col items-center">
        {/* Outer Glow Aura when Active */}
        {isListening && (
          <div
            aria-hidden="true"
            className="absolute -inset-3 rounded-full bg-cyan-400/25 blur-md animate-pulse pointer-events-none"
          />
        )}

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleListening}
            disabled={!speechSupported || isThinking}
            aria-label={
              !speechSupported
                ? 'Speech recognition unavailable in this browser'
                : isListening
                ? 'Stop listening'
                : 'Start listening with microphone'
            }
            aria-pressed={isListening}
            className={`group relative flex items-center justify-center w-20 h-20 rounded-full border-2 transition-all duration-200 cursor-pointer active:scale-95 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400 disabled:opacity-45 disabled:cursor-not-allowed ${
              isListening
                ? 'bg-cyan-500 text-slate-950 border-cyan-200 shadow-[0_0_40px_rgba(34,211,238,0.75)]'
                : !speechSupported || micPermission === 'denied'
                ? darkMode
                  ? 'bg-slate-900/80 text-rose-400 border-rose-500/40 hover:border-rose-400'
                  : 'bg-slate-100 text-rose-600 border-rose-300'
                : darkMode
                ? 'bg-slate-900/90 hover:bg-cyan-950/80 text-cyan-300 hover:text-cyan-100 border-cyan-400/50 hover:border-cyan-300 shadow-[0_0_25px_rgba(6,182,212,0.28)] hover:shadow-[0_0_35px_rgba(34,211,238,0.5)]'
                : 'bg-white hover:bg-cyan-50 text-cyan-700 border-cyan-500/60 shadow-md hover:shadow-lg'
            }`}
          >
            {/* Subtle Rotating Inner Ring on Hover */}
            <span
              aria-hidden="true"
              className={`absolute inset-1.5 rounded-full border border-dashed transition-transform duration-500 group-hover:rotate-45 ${
                isListening
                  ? 'border-slate-950/40 animate-spin-slow'
                  : darkMode
                  ? 'border-cyan-400/30'
                  : 'border-cyan-600/30'
              }`}
            />

            {!speechSupported || micPermission === 'denied' ? (
              <MicOff className="w-8 h-8 relative z-10" />
            ) : isListening ? (
              <Square className="w-7 h-7 fill-current relative z-10" />
            ) : (
              <Mic className="w-8 h-8 relative z-10 transition-transform duration-200 group-hover:scale-110" />
            )}
          </button>
        </div>

        {/* Button Caption & Keyboard Toggle */}
        <div className="mt-2.5 flex items-center gap-3 text-xs font-mono">
          <span className={darkMode ? 'text-slate-300' : 'text-slate-700'}>
            {!speechSupported
              ? 'Speech API Unsupported'
              : micPermission === 'denied'
              ? 'Microphone Permission Blocked'
              : isListening
              ? 'Active — Click to Stop'
              : 'Click Orb or Mic to Speak'}
          </span>

          <span aria-hidden="true" className={darkMode ? 'text-slate-600' : 'text-slate-400'}>
            ·
          </span>

          <button
            type="button"
            onClick={() => setShowTextBar((prev) => !prev)}
            className={`inline-flex items-center gap-1 underline-offset-4 hover:underline cursor-pointer ${
              darkMode ? 'text-cyan-400 hover:text-cyan-300' : 'text-cyan-700 hover:text-cyan-900'
            }`}
          >
            <Keyboard className="w-3.5 h-3.5" />
            <span>{showTextBar ? 'Hide Console Input' : 'Type Command'}</span>
          </button>
        </div>
      </div>

      {/* Fallback Warning Banner if Speech Recognition is Unavailable or Blocked */}
      {(!speechSupported || micPermission === 'denied') && (
        <div
          role="alert"
          className={`w-full flex items-center gap-2.5 px-3.5 py-2.5 rounded-lg border text-xs ${
            darkMode
              ? 'bg-amber-950/35 border-amber-500/40 text-amber-200'
              : 'bg-amber-50 border-amber-300 text-amber-900'
          }`}
        >
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            {!speechSupported
              ? 'Browser Web Speech API is not available in this browser. Use the command input below to communicate with ATLAS.'
              : 'Microphone access was denied by the browser. Allow microphone access in browser site settings or type below.'}
          </span>
        </div>
      )}

      {/* Direct Text Input Bar (Always shown if speech is unavailable/blocked, or toggled on demand) */}
      {(!speechSupported || micPermission === 'denied' || showTextBar) && (
        <form onSubmit={handleFormSubmit} className="w-full flex items-center gap-2">
          <label htmlFor="atlas-console-input" className="sr-only">
            Transmit text command to ATLAS
          </label>
          <input
            id="atlas-console-input"
            type="text"
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            disabled={isThinking}
            placeholder="Transmit command or query to ATLAS (e.g., 'Search the web for...')"
            className={`flex-1 h-11 px-4 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
              darkMode
                ? 'bg-slate-900/85 border-cyan-500/30 text-slate-100 placeholder:text-slate-500'
                : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400 shadow-xs'
            }`}
          />
          <button
            type="submit"
            disabled={!textInput.trim() || isThinking}
            aria-label="Send command to ATLAS"
            className="h-11 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>Send</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      )}
    </div>
  );
};

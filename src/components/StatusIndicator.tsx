import React from 'react';
import {
  CheckCircle2,
  Radio,
  Loader2,
  Volume2,
  AlertTriangle,
  Globe,
  Cpu,
  Terminal,
  ExternalLink,
  Calculator,
  VolumeX,
} from 'lucide-react';
import { AICoreState, ChatMessage } from '../types/atlas';

interface StatusIndicatorProps {
  state: AICoreState;
  interimTranscript: string;
  latestAtlasMessage: ChatMessage | null;
  latestUserMessage: ChatMessage | null;
  errorMessage: string | null;
  darkMode: boolean;
  onStopSpeaking: () => void;
  onReplaySpeech: (text: string) => void;
}

export const StatusIndicator: React.FC<StatusIndicatorProps> = ({
  state,
  interimTranscript,
  latestAtlasMessage,
  latestUserMessage,
  errorMessage,
  darkMode,
  onStopSpeaking,
  onReplaySpeech,
}) => {
  const getStateMeta = () => {
    switch (state) {
      case 'listening':
        return {
          title: 'Listening...',
          subtitle: 'Speak your command or question clearly into the microphone',
          icon: <Radio className="w-4 h-4 text-cyan-400 animate-pulse shrink-0" />,
          tone: darkMode ? 'text-cyan-300' : 'text-cyan-700',
        };
      case 'thinking':
        return {
          title: 'Thinking...',
          subtitle: 'Processing neural inference & verifying telemetry',
          icon: <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />,
          tone: darkMode ? 'text-sky-300' : 'text-sky-700',
        };
      case 'speaking':
        return {
          title: 'Speaking...',
          subtitle: 'Voice synthesis active',
          icon: <Volume2 className="w-4 h-4 text-cyan-400 animate-bounce shrink-0" />,
          tone: darkMode ? 'text-cyan-300' : 'text-cyan-700',
        };
      case 'error':
        return {
          title: 'System Alert',
          subtitle: errorMessage || 'An unexpected interruption occurred',
          icon: <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />,
          tone: darkMode ? 'text-rose-300' : 'text-rose-700',
        };
      default:
        return {
          title: 'Ready',
          subtitle: 'Awaiting voice command or text directive',
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />,
          tone: darkMode ? 'text-emerald-300' : 'text-emerald-700',
        };
    }
  };

  const meta = getStateMeta();

  const renderSourceAttribution = (msg: ChatMessage) => {
    if (msg.sourceType === 'web_search') {
      return (
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs font-mono text-sky-400">
          <Globe className="w-3.5 h-3.5 shrink-0" />
          <span>Current Information · Grounded via Google Search</span>
        </div>
      );
    }
    if (msg.sourceType === 'local_system') {
      return (
        <div className="flex flex-wrap items-center justify-center gap-1.5 text-xs font-mono text-emerald-400">
          <Terminal className="w-3.5 h-3.5 shrink-0" />
          <span>
            Local System Execution
            {msg.commandCategory ? ` · ${msg.commandCategory}` : ''}
          </span>
        </div>
      );
    }
    return (
      <div
        className={`flex flex-wrap items-center justify-center gap-1.5 text-xs font-mono ${
          darkMode ? 'text-cyan-400/80' : 'text-cyan-700'
        }`}
      >
        <Cpu className="w-3.5 h-3.5 shrink-0" />
        <span>
          Knowledge from ATLAS AI
          {msg.commandCategory ? ` · ${msg.commandCategory}` : ''}
        </span>
      </div>
    );
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="w-full max-w-2xl mx-auto px-4 flex flex-col items-center text-center gap-3"
    >
      {/* Primary State Readout Line (Unboxed clean metadata with typographic separator) */}
      <div className="flex flex-wrap items-center justify-center gap-2 text-sm font-mono">
        <div className="flex items-center gap-1.5 font-semibold">
          {meta.icon}
          <span className={meta.tone}>{meta.title}</span>
        </div>
        <span aria-hidden="true" className={darkMode ? 'text-slate-600' : 'text-slate-400'}>
          ·
        </span>
        <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          {meta.subtitle}
        </span>

        {state === 'speaking' && (
          <button
            type="button"
            onClick={onStopSpeaking}
            className="ml-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-mono bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30 transition-colors cursor-pointer whitespace-nowrap"
          >
            <VolumeX className="w-3.5 h-3.5" />
            <span>Stop Audio</span>
          </button>
        )}
      </div>

      {/* Live Interim Speech Transcript Box (While Listening) */}
      {state === 'listening' && interimTranscript && (
        <div
          className={`w-full rounded-xl border px-4 py-3 backdrop-blur-md transition-all ${
            darkMode
              ? 'bg-cyan-950/35 border-cyan-400/40 text-cyan-100'
              : 'bg-cyan-50/90 border-cyan-500/40 text-slate-900'
          }`}
        >
          <div className="text-[11px] font-mono text-cyan-400 mb-1">
            LIVE VOICE CAPTURE
          </div>
          <p className="text-base font-medium leading-relaxed">
            &ldquo;{interimTranscript}&rdquo;
          </p>
        </div>
      )}

      {/* Active HUD Response Display (Shows latest exchange clearly on main screen) */}
      {state !== 'listening' && latestAtlasMessage && (
        <div
          className={`w-full rounded-xl border p-4 sm:p-5 backdrop-blur-md transition-all text-left ${
            latestAtlasMessage.isError
              ? darkMode
                ? 'bg-rose-950/30 border-rose-500/40 text-rose-100'
                : 'bg-rose-50 border-rose-300 text-rose-900'
              : darkMode
              ? 'bg-slate-900/65 border-cyan-500/25 text-slate-100 shadow-[0_8px_32px_rgba(0,0,0,0.4)]'
              : 'bg-white/90 border-slate-200 text-slate-900 shadow-sm'
          }`}
        >
          {/* User Prompt Kicker */}
          {latestUserMessage && (
            <div
              className={`text-xs font-mono mb-2 pb-2 border-b flex items-center justify-between gap-2 ${
                darkMode
                  ? 'border-slate-800 text-slate-400'
                  : 'border-slate-200 text-slate-500'
              }`}
            >
              <span className="truncate">
                USER: &ldquo;{latestUserMessage.text}&rdquo;
              </span>
              <span className="tabular-nums shrink-0">{latestUserMessage.timestamp}</span>
            </div>
          )}

          {/* Source Type Header + Replay Button */}
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            {renderSourceAttribution(latestAtlasMessage)}
            <button
              type="button"
              onClick={() => onReplaySpeech(latestAtlasMessage.text)}
              aria-label="Speak ATLAS response aloud"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono transition-colors cursor-pointer whitespace-nowrap ${
                darkMode
                  ? 'text-cyan-300 hover:bg-cyan-500/15 border border-cyan-500/25'
                  : 'text-cyan-700 hover:bg-cyan-50 border border-cyan-500/30'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
              <span>Speak</span>
            </button>
          </div>

          {/* Calculation Readout if Present */}
          {latestAtlasMessage.calculationResult && (
            <div
              className={`my-2.5 p-3 rounded-lg border font-mono flex items-center justify-between gap-3 ${
                darkMode
                  ? 'bg-slate-950/80 border-emerald-500/30 text-emerald-300'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-900'
              }`}
            >
              <div className="flex items-center gap-2 text-xs">
                <Calculator className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{latestAtlasMessage.calculationResult.expression}</span>
              </div>
              <span className="text-lg font-bold tabular-nums">
                = {latestAtlasMessage.calculationResult.result}
              </span>
            </div>
          )}

          {/* Main Spoken Text Response */}
          <p
            className={`text-sm sm:text-base leading-relaxed ${
              darkMode ? 'text-slate-100' : 'text-slate-800'
            }`}
          >
            {latestAtlasMessage.text}
          </p>

          {/* Staged Browser Action Link (For "Open..." commands) */}
          {latestAtlasMessage.actionLink && (
            <div className="mt-3 pt-3 border-t border-cyan-500/20 flex items-center justify-between gap-3">
              <span className="text-xs font-mono text-cyan-400">
                Verified Target: {latestAtlasMessage.actionLink.domain}
              </span>
              <a
                href={latestAtlasMessage.actionLink.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors whitespace-nowrap"
              >
                <span>Launch {latestAtlasMessage.actionLink.label}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            </div>
          )}

          {/* Grounding Web Search Sources if Present */}
          {latestAtlasMessage.sources && latestAtlasMessage.sources.length > 0 && (
            <div
              className={`mt-3 pt-2.5 border-t ${
                darkMode ? 'border-slate-800' : 'border-slate-200'
              }`}
            >
              <div className="text-[11px] font-mono text-sky-400 mb-1.5">
                Live Web Sources:
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {latestAtlasMessage.sources.slice(0, 4).map((source, idx) => (
                  <a
                    key={`${source.uri}-${idx}`}
                    href={source.uri}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline max-w-[220px] truncate ${
                      darkMode ? 'text-sky-300 hover:text-sky-200' : 'text-sky-700 hover:text-sky-900'
                    }`}
                  >
                    <ExternalLink className="w-3 h-3 shrink-0" />
                    <span className="truncate">{source.title}</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

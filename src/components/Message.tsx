import React from 'react';
import {
  Volume2,
  Globe,
  Cpu,
  Terminal,
  ExternalLink,
  Calculator,
  AlertTriangle,
} from 'lucide-react';
import { ChatMessage } from '../types/atlas';

interface MessageProps {
  message: ChatMessage;
  darkMode: boolean;
  onReplaySpeech: (text: string) => void;
}

export const Message: React.FC<MessageProps> = ({
  message,
  darkMode,
  onReplaySpeech,
}) => {
  const isUser = message.sender === 'user';

  const renderSourceTag = () => {
    if (isUser) return null;

    if (message.isError) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-rose-400">
          <AlertTriangle className="w-3 h-3 shrink-0" />
          <span>System Alert</span>
        </span>
      );
    }

    if (message.sourceType === 'web_search') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-sky-400">
          <Globe className="w-3 h-3 shrink-0" />
          <span>Web Search Grounded</span>
        </span>
      );
    }

    if (message.sourceType === 'local_system') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-mono text-emerald-400">
          <Terminal className="w-3 h-3 shrink-0" />
          <span>{message.commandCategory || 'Local System'}</span>
        </span>
      );
    }

    return (
      <span
        className={`inline-flex items-center gap-1 text-[11px] font-mono ${
          darkMode ? 'text-cyan-400/80' : 'text-cyan-700'
        }`}
      >
        <Cpu className="w-3 h-3 shrink-0" />
        <span>AI Knowledge</span>
      </span>
    );
  };

  return (
    <article
      className={`rounded-xl border p-3.5 transition-all ${
        isUser
          ? darkMode
            ? 'bg-slate-900/50 border-slate-800 text-slate-200 ml-4'
            : 'bg-slate-100 border-slate-200 text-slate-800 ml-4'
          : message.isError
          ? darkMode
            ? 'bg-rose-950/30 border-rose-500/40 text-rose-100 mr-2'
            : 'bg-rose-50 border-rose-300 text-rose-900 mr-2'
          : darkMode
          ? 'bg-cyan-950/20 border-cyan-500/25 text-slate-100 mr-2'
          : 'bg-white border-cyan-500/30 text-slate-900 mr-2 shadow-xs'
      }`}
    >
      {/* Sender Header Row: USER: or ATLAS: */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2">
          <span
            className={`font-display text-xs font-bold tracking-wider ${
              isUser
                ? darkMode
                  ? 'text-slate-400'
                  : 'text-slate-600'
                : 'text-cyan-400'
            }`}
          >
            {isUser ? 'USER:' : 'ATLAS:'}
          </span>

          {!isUser && (
            <>
              <span aria-hidden="true" className={darkMode ? 'text-slate-700' : 'text-slate-300'}>
                ·
              </span>
              {renderSourceTag()}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`font-mono text-[11px] tabular-nums ${
              darkMode ? 'text-slate-500' : 'text-slate-400'
            }`}
          >
            {message.timestamp}
          </span>

          {!isUser && (
            <button
              type="button"
              onClick={() => onReplaySpeech(message.text)}
              aria-label="Replay ATLAS voice response"
              title="Speak response"
              className={`p-1 rounded-md transition-colors cursor-pointer ${
                darkMode
                  ? 'text-cyan-400/80 hover:text-cyan-200 hover:bg-cyan-500/15'
                  : 'text-cyan-700 hover:text-cyan-900 hover:bg-cyan-50'
              }`}
            >
              <Volume2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Calculation Readout if Present */}
      {message.calculationResult && (
        <div
          className={`my-2 px-3 py-2 rounded-lg border font-mono text-xs flex items-center justify-between gap-2 ${
            darkMode
              ? 'bg-slate-950/75 border-emerald-500/30 text-emerald-300'
              : 'bg-emerald-50 border-emerald-300 text-emerald-900'
          }`}
        >
          <span className="flex items-center gap-1.5">
            <Calculator className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <span>{message.calculationResult.expression}</span>
          </span>
          <span className="font-bold tabular-nums">
            = {message.calculationResult.result}
          </span>
        </div>
      )}

      {/* Message Body */}
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.text}</p>

      {/* Action Link if Present */}
      {message.actionLink && (
        <div className="mt-2.5 pt-2.5 border-t border-cyan-500/20 flex items-center justify-between gap-2">
          <span className="text-[11px] font-mono text-cyan-400 truncate">
            {message.actionLink.domain}
          </span>
          <a
            href={message.actionLink.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition-colors whitespace-nowrap shrink-0"
          >
            <span>Open {message.actionLink.label}</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* Grounded Web Search Citations */}
      {message.sources && message.sources.length > 0 && (
        <div
          className={`mt-2.5 pt-2 border-t ${
            darkMode ? 'border-slate-800/80' : 'border-slate-200'
          }`}
        >
          <div className="text-[10px] font-mono text-sky-400 mb-1">
            Verified Search Sources:
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {message.sources.map((src, idx) => (
              <a
                key={`${src.uri}-${idx}`}
                href={src.uri}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline max-w-[200px] truncate ${
                  darkMode ? 'text-sky-300 hover:text-sky-200' : 'text-sky-700 hover:text-sky-900'
                }`}
              >
                <ExternalLink className="w-3 h-3 shrink-0" />
                <span className="truncate">{src.title}</span>
              </a>
            ))}
          </div>
        </div>
      )}
    </article>
  );
};

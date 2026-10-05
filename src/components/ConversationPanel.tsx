import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Send,
  Trash2,
  MessageSquare,
  Sparkles,
} from 'lucide-react';
import { ChatMessage } from '../types/atlas';
import { Message } from './Message';

interface ConversationPanelProps {
  isOpen: boolean;
  messages: ChatMessage[];
  isProcessing: boolean;
  darkMode: boolean;
  onClose: () => void;
  onSendMessage: (text: string) => void;
  onClearConversation: () => void;
  onReplaySpeech: (text: string) => void;
}

export const ConversationPanel: React.FC<ConversationPanelProps> = ({
  isOpen,
  messages,
  isProcessing,
  darkMode,
  onClose,
  onSendMessage,
  onClearConversation,
  onReplaySpeech,
}) => {
  const [inputText, setInputText] = useState('');
  const scrollEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      scrollEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || isProcessing) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end items-end md:items-stretch pointer-events-none"
      role="dialog"
      aria-label="ATLAS Conversation Log"
    >
      {/* Subtle Backdrop Scrim on Mobile */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px] md:bg-transparent md:backdrop-blur-none pointer-events-auto"
      />

      {/* Responsive Panel: Bottom Sheet on Mobile, Right HUD Drawer on Desktop */}
      <aside
        className={`relative z-10 pointer-events-auto w-full md:w-[420px] lg:w-[460px] h-[78vh] md:h-full md:pt-16 flex flex-col rounded-t-2xl md:rounded-none border-t md:border-t-0 md:border-l backdrop-blur-xl transition-all duration-200 ${
          darkMode
            ? 'bg-[#070b17]/95 border-cyan-500/25 text-slate-100 shadow-[-16px_0_48px_rgba(0,0,0,0.65)]'
            : 'bg-white/95 border-slate-200 text-slate-900 shadow-2xl'
        }`}
      >
        {/* Mobile Drag Handle Visual */}
        <div className="flex md:hidden justify-center pt-2.5 pb-1">
          <div className="w-10 h-1 rounded-full bg-cyan-500/40" />
        </div>

        {/* Panel Header */}
        <div
          className={`px-5 py-3.5 border-b flex items-center justify-between gap-3 ${
            darkMode ? 'border-cyan-500/15' : 'border-slate-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <MessageSquare className="w-4 h-4 text-cyan-400 shrink-0" />
            <h2 className="font-display text-sm font-bold tracking-wider uppercase">
              Conversation Log
            </h2>
            <span
              className={`font-mono text-xs tabular-nums ${
                darkMode ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              · {messages.length} {messages.length === 1 ? 'entry' : 'entries'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {messages.length > 0 && (
              <button
                type="button"
                onClick={onClearConversation}
                aria-label="Clear conversation history"
                title="Clear conversation"
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-mono transition-colors cursor-pointer whitespace-nowrap ${
                  darkMode
                    ? 'text-slate-400 hover:text-rose-300 hover:bg-rose-500/15'
                    : 'text-slate-600 hover:text-rose-600 hover:bg-rose-50'
                }`}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              aria-label="Close conversation panel"
              className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                darkMode
                  ? 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Message List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-6 py-12">
              <div
                className={`w-12 h-12 rounded-full border flex items-center justify-center mb-3 ${
                  darkMode
                    ? 'bg-cyan-950/40 border-cyan-500/30 text-cyan-400'
                    : 'bg-cyan-50 border-cyan-300 text-cyan-600'
                }`}
              >
                <Sparkles className="w-5 h-5" />
              </div>
              <p className="font-display text-sm font-semibold mb-1">
                No Active Transmissions
              </p>
              <p
                className={`text-xs leading-relaxed max-w-xs ${
                  darkMode ? 'text-slate-400' : 'text-slate-600'
                }`}
              >
                Activate the central microphone or type a directive below to initiate conversation with ATLAS.
              </p>
            </div>
          ) : (
            messages.map((msg) => (
              <Message
                key={msg.id}
                message={msg}
                darkMode={darkMode}
                onReplaySpeech={onReplaySpeech}
              />
            ))
          )}
          <div ref={scrollEndRef} />
        </div>

        {/* Bottom Text Input Form */}
        <form
          onSubmit={handleSubmit}
          className={`p-3.5 border-t flex items-center gap-2 ${
            darkMode ? 'border-cyan-500/15 bg-slate-950/70' : 'border-slate-200 bg-slate-50'
          }`}
        >
          <label htmlFor="conversation-panel-input" className="sr-only">
            Message ATLAS
          </label>
          <input
            id="conversation-panel-input"
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isProcessing}
            placeholder="Message ATLAS..."
            className={`flex-1 h-10 px-3.5 rounded-lg border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-cyan-400 ${
              darkMode
                ? 'bg-slate-900 border-cyan-500/25 text-slate-100 placeholder:text-slate-500'
                : 'bg-white border-slate-300 text-slate-900 placeholder:text-slate-400'
            }`}
          />
          <button
            type="submit"
            disabled={!inputText.trim() || isProcessing}
            aria-label="Send message"
            className="h-10 px-3.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <span>Send</span>
            <Send className="w-3.5 h-3.5" />
          </button>
        </form>
      </aside>
    </div>
  );
};

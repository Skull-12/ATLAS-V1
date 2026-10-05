import React from 'react';
import {
  Mic,
  MicOff,
  Settings,
  MessageSquare,
  Wifi,
  WifiOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { AICoreState, MicPermissionState, SystemHealthStatus } from '../types/atlas';

interface HeaderProps {
  coreState: AICoreState;
  systemStatus: SystemHealthStatus;
  micPermission: MicPermissionState;
  speechSupported: boolean;
  autoSpeak: boolean;
  messageCount: number;
  isConversationOpen: boolean;
  darkMode: boolean;
  onToggleConversation: () => void;
  onOpenSettings: () => void;
  onToggleAutoSpeak: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  coreState,
  systemStatus,
  micPermission,
  speechSupported,
  autoSpeak,
  messageCount,
  isConversationOpen,
  darkMode,
  onToggleConversation,
  onOpenSettings,
  onToggleAutoSpeak,
}) => {
  const getMicStatusDisplay = () => {
    if (!speechSupported) {
      return {
        label: 'Voice Unavailable',
        icon: <MicOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />,
        textColor: darkMode ? 'text-amber-300' : 'text-amber-700',
      };
    }
    if (micPermission === 'denied') {
      return {
        label: 'Mic Blocked',
        icon: <MicOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />,
        textColor: darkMode ? 'text-rose-300' : 'text-rose-700',
      };
    }
    if (coreState === 'listening') {
      return {
        label: 'Mic Active',
        icon: <Mic className="w-3.5 h-3.5 text-cyan-400 animate-pulse shrink-0" />,
        textColor: darkMode ? 'text-cyan-300' : 'text-cyan-700',
      };
    }
    return {
      label: 'Mic Standby',
      icon: <Mic className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
      textColor: darkMode ? 'text-slate-300' : 'text-slate-700',
    };
  };

  const micInfo = getMicStatusDisplay();

  return (
    <header
      className={`w-full border-b backdrop-blur-md transition-colors z-30 ${
        darkMode
          ? 'bg-[#050811]/80 border-cyan-500/15 text-slate-100'
          : 'bg-white/85 border-slate-200 text-slate-900'
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Top-left: ATLAS Branding & Small Subtitle */}
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className={`relative flex items-center justify-center w-9 h-9 rounded-lg border shrink-0 ${
              darkMode
                ? 'bg-cyan-950/50 border-cyan-400/40 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                : 'bg-cyan-50 border-cyan-500/40'
            }`}
            aria-hidden="true"
          >
            <div
              className={`w-3 h-3 rounded-full ${
                coreState === 'listening'
                  ? 'bg-cyan-400 animate-ping'
                  : coreState === 'speaking'
                  ? 'bg-sky-400 animate-pulse'
                  : coreState === 'error'
                  ? 'bg-rose-500'
                  : 'bg-cyan-400'
              }`}
            />
            <div className="absolute inset-1 rounded-md border border-cyan-400/30 animate-spin-slow" />
          </div>

          <div className="flex flex-col">
            <span className="font-display text-lg sm:text-xl font-bold tracking-widest leading-none text-cyan-400">
              ATLAS
            </span>
            <span
              className={`font-mono text-[10px] tracking-[0.22em] mt-1 leading-none whitespace-nowrap ${
                darkMode ? 'text-slate-400' : 'text-slate-500'
              }`}
            >
              PERSONAL AI SYSTEM
            </span>
          </div>
        </div>

        {/* Top-right: Connection status, Microphone status, Conversation toggle, Settings button */}
        <div className="flex items-center gap-2 sm:gap-4">
          {/* Status Telemetry Readout (Unboxed clean metadata per design guidelines) */}
          <div className="hidden md:flex items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-1.5 whitespace-nowrap">
              {systemStatus.online && systemStatus.aiConfigured ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className={darkMode ? 'text-emerald-300' : 'text-emerald-700'}>
                    SYSTEM ONLINE
                  </span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className={darkMode ? 'text-amber-300' : 'text-amber-700'}>
                    STANDBY MODE
                  </span>
                </>
              )}
            </div>

            <span aria-hidden="true" className={darkMode ? 'text-slate-600' : 'text-slate-300'}>
              ·
            </span>

            <div className="flex items-center gap-1.5 whitespace-nowrap">
              {micInfo.icon}
              <span className={micInfo.textColor}>{micInfo.label}</span>
            </div>
          </div>

          {/* Mobile compact status indicator */}
          <div className="flex md:hidden items-center gap-1.5 text-[11px] font-mono">
            {systemStatus.online && systemStatus.aiConfigured ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            )}
            <span className="sr-only">
              {systemStatus.online ? 'System Online' : 'System Standby'}
            </span>
            {micInfo.icon}
          </div>

          {/* Quick Voice Output Mute/Unmute Toggle */}
          <button
            type="button"
            onClick={onToggleAutoSpeak}
            aria-label={autoSpeak ? 'Mute voice responses' : 'Enable voice responses'}
            title={autoSpeak ? 'Voice output enabled (Click to mute)' : 'Voice output muted (Click to enable)'}
            className={`flex items-center justify-center w-10 h-10 rounded-lg border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
              darkMode
                ? autoSpeak
                  ? 'bg-slate-900/80 border-cyan-500/30 text-cyan-300 hover:bg-cyan-950/60 hover:border-cyan-400/60'
                  : 'bg-slate-900/50 border-slate-800 text-slate-500 hover:text-slate-300'
                : autoSpeak
                ? 'bg-cyan-50 border-cyan-500/30 text-cyan-700 hover:bg-cyan-100'
                : 'bg-slate-100 border-slate-300 text-slate-500 hover:text-slate-700'
            }`}
          >
            {autoSpeak ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Conversation Log Toggle Button */}
          <button
            type="button"
            onClick={onToggleConversation}
            aria-label={isConversationOpen ? 'Close conversation log' : 'Open conversation log'}
            aria-expanded={isConversationOpen}
            className={`flex items-center gap-2 px-3 h-10 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
              isConversationOpen
                ? darkMode
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-200'
                  : 'bg-cyan-600 text-white border-cyan-600'
                : darkMode
                ? 'bg-slate-900/80 border-cyan-500/30 text-slate-200 hover:bg-cyan-950/60 hover:border-cyan-400/60'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <MessageSquare className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Log</span>
            {messageCount > 0 && (
              <span className="font-mono tabular-nums text-[11px] opacity-80">
                ({messageCount})
              </span>
            )}
          </button>

          {/* Settings Button */}
          <button
            type="button"
            onClick={onOpenSettings}
            aria-label="Open ATLAS system settings"
            className={`flex items-center gap-2 px-3 h-10 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 ${
              darkMode
                ? 'bg-slate-900/80 border-cyan-500/30 text-slate-200 hover:bg-cyan-950/60 hover:border-cyan-400/60'
                : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">Settings</span>
          </button>
        </div>
      </div>
    </header>
  );
};

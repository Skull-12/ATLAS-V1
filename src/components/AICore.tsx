import React, { useEffect, useRef } from 'react';
import { Mic, Volume2, Cpu, AlertTriangle } from 'lucide-react';
import { AICoreState } from '../types/atlas';

interface AICoreProps {
  state: AICoreState;
  audioLevel: number;
  frequencyData: Uint8Array | null;
  darkMode: boolean;
  onCoreClick?: () => void;
}

interface Particle {
  angle: number;
  radius: number;
  baseRadius: number;
  speed: number;
  size: number;
  alpha: number;
  orbitOffset: number;
}

export const AICore: React.FC<AICoreProps> = ({
  state,
  audioLevel,
  frequencyData,
  darkMode,
  onCoreClick,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<AICoreState>(state);
  const levelRef = useRef<number>(audioLevel);
  const freqRef = useRef<Uint8Array | null>(frequencyData);
  const darkRef = useRef<boolean>(darkMode);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    levelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    freqRef.current = frequencyData;
  }, [frequencyData]);

  useEffect(() => {
    darkRef.current = darkMode;
  }, [darkMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height / 2;

    // Initialize floating HUD particles around the core
    const particles: Particle[] = Array.from({ length: 42 }, (_, idx) => {
      const baseRadius = 72 + (idx % 7) * 14 + Math.random() * 8;
      return {
        angle: (idx / 42) * Math.PI * 2,
        radius: baseRadius,
        baseRadius,
        speed: (0.003 + Math.random() * 0.005) * (idx % 2 === 0 ? 1 : -1),
        size: 1.2 + (idx % 3) * 0.7,
        alpha: 0.3 + Math.random() * 0.55,
        orbitOffset: Math.random() * Math.PI * 2,
      };
    });

    let animId: number;
    let tick = 0;

    const renderCoreCanvas = () => {
      const currentState = stateRef.current;
      const currentLevel = levelRef.current;
      const currentFreq = freqRef.current;
      const isDark = darkRef.current;

      ctx.clearRect(0, 0, width, height);
      tick += 0.035;

      // Primary RGB color tuple by state
      let r = 6;
      let g = 182;
      let b = 212; // Cyan-500 default

      if (currentState === 'listening') {
        r = 34;
        g = 211;
        b = 238; // Bright Cyan-400
      } else if (currentState === 'thinking') {
        r = 56;
        g = 189;
        b = 248; // Sky-400
      } else if (currentState === 'speaking') {
        r = 14;
        g = 165;
        b = 233; // Sky-500
      } else if (currentState === 'error') {
        r = 244;
        g = 63;
        b = 94; // Rose-500
      }

      // 1. Ambient Core Glow
      const breathScale =
        currentState === 'listening'
          ? 1 + currentLevel * 0.28 + Math.sin(tick * 2.4) * 0.05
          : currentState === 'speaking'
          ? 1 + currentLevel * 0.25 + Math.sin(tick * 3.0) * 0.08
          : currentState === 'thinking'
          ? 1 + Math.sin(tick * 4.2) * 0.06
          : 1 + Math.sin(tick * 0.9) * 0.035;

      const glowRadius = 115 * breathScale;
      const radialGrad = ctx.createRadialGradient(cx, cy, 12, cx, cy, glowRadius);
      radialGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${isDark ? 0.36 : 0.24})`);
      radialGrad.addColorStop(0.55, `rgba(${r}, ${g}, ${b}, ${isDark ? 0.12 : 0.08})`);
      radialGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

      ctx.fillStyle = radialGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, glowRadius, 0, Math.PI * 2);
      ctx.fill();

      // 2. Radial Audio-Wave / Harmonic Rings (Listening & Speaking states)
      if (currentState === 'listening' || currentState === 'speaking') {
        const ringCount = 3;
        for (let w = 0; w < ringCount; w++) {
          const waveProgress = ((tick * 0.65 + w / ringCount) % 1);
          const waveRadius = 68 + waveProgress * 88;
          const waveAlpha = (1 - waveProgress) * (0.45 + currentLevel * 0.35);

          ctx.beginPath();
          ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${waveAlpha})`;
          ctx.lineWidth = currentState === 'speaking' ? 2 : 1.5;

          // Modulate ring path slightly with harmonic wave
          const segments = 72;
          for (let s = 0; s <= segments; s++) {
            const theta = (s / segments) * Math.PI * 2;
            const mod =
              currentState === 'speaking'
                ? Math.sin(theta * 6 + tick * 3 + w) * (3 + currentLevel * 8)
                : Math.cos(theta * 8 - tick * 4 + w) * (2 + currentLevel * 10);
            const rad = waveRadius + mod;
            const px = cx + Math.cos(theta) * rad;
            const py = cy + Math.sin(theta) * rad;
            if (s === 0) {
              ctx.moveTo(px, py);
            } else {
              ctx.lineTo(px, py);
            }
          }
          ctx.closePath();
          ctx.stroke();
        }
      }

      // 3. Circular Frequency Equalizer Bars around Core Perimeter
      const numBars = 60;
      const baseRingRadius = 86;
      for (let i = 0; i < numBars; i++) {
        const angle = (i / numBars) * Math.PI * 2 - Math.PI / 2;
        let barLen = 4;

        if (currentState === 'listening') {
          if (currentFreq && currentFreq.length > 0) {
            const fIdx = Math.floor((i / numBars) * (currentFreq.length * 0.5));
            const val = currentFreq[fIdx] / 255;
            barLen = 4 + val * 26 + Math.abs(Math.sin(i * 0.4 + tick * 3)) * 5;
          } else {
            barLen = 5 + Math.abs(Math.sin(i * 0.35 + tick * 3.2)) * 16;
          }
        } else if (currentState === 'speaking') {
          const voiceWave =
            Math.abs(Math.sin(i * 0.3 + tick * 2.8)) * 0.65 +
            Math.abs(Math.cos(i * 0.5 - tick * 2.1)) * 0.35;
          barLen = 4 + voiceWave * (14 + currentLevel * 14);
        } else if (currentState === 'thinking') {
          const sweep = Math.sin(angle * 3 - tick * 4.5);
          barLen = sweep > 0.3 ? 4 + sweep * 12 : 3;
        } else {
          // Idle subtle ticks
          barLen = i % 5 === 0 ? 7 : 3.5;
        }

        const innerR = baseRingRadius;
        const outerR = baseRingRadius + barLen;

        const x1 = cx + Math.cos(angle) * innerR;
        const y1 = cy + Math.sin(angle) * innerR;
        const x2 = cx + Math.cos(angle) * outerR;
        const y2 = cy + Math.sin(angle) * outerR;

        ctx.beginPath();
        ctx.strokeStyle =
          currentState === 'idle'
            ? `rgba(${r}, ${g}, ${b}, ${i % 5 === 0 ? 0.5 : 0.22})`
            : `rgba(${r}, ${g}, ${b}, 0.72)`;
        ctx.lineWidth = i % 5 === 0 ? 2 : 1.3;
        ctx.lineCap = 'round';
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // 4. Floating & Orbital Particles
      const speedMultiplier =
        currentState === 'thinking'
          ? 4.2
          : currentState === 'listening'
          ? 2.2
          : currentState === 'speaking'
          ? 1.8
          : 1;

      for (const p of particles) {
        p.angle += p.speed * speedMultiplier;

        const radialOscillation =
          currentState === 'thinking'
            ? Math.sin(tick * 3 + p.orbitOffset) * 14
            : currentState === 'speaking'
            ? Math.sin(tick * 2 + p.orbitOffset) * (6 + currentLevel * 10)
            : Math.sin(tick + p.orbitOffset) * 4;

        p.radius = p.baseRadius + radialOscillation;

        const px = cx + Math.cos(p.angle) * p.radius;
        const py = cy + Math.sin(p.angle) * p.radius;

        ctx.beginPath();
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${
          currentState === 'thinking' ? Math.min(1, p.alpha + 0.25) : p.alpha
        })`;
        ctx.arc(px, py, currentState === 'thinking' ? p.size * 1.25 : p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      animId = requestAnimationFrame(renderCoreCanvas);
    };

    animId = requestAnimationFrame(renderCoreCanvas);
    return () => cancelAnimationFrame(animId);
  }, []);

  const getStatusLabel = () => {
    switch (state) {
      case 'listening':
        return 'Listening...';
      case 'thinking':
        return 'Thinking...';
      case 'speaking':
        return 'Speaking...';
      case 'error':
        return 'System Alert';
      default:
        return 'Ready';
    }
  };

  const getOuterRingClass = () => {
    switch (state) {
      case 'listening':
        return 'border-cyan-400/60 shadow-[0_0_50px_rgba(34,211,238,0.28)]';
      case 'thinking':
        return 'border-sky-400/60 shadow-[0_0_55px_rgba(56,189,248,0.3)]';
      case 'speaking':
        return 'border-sky-400/70 shadow-[0_0_60px_rgba(14,165,233,0.35)]';
      case 'error':
        return 'border-rose-500/60 shadow-[0_0_45px_rgba(244,63,94,0.28)]';
      default:
        return darkMode
          ? 'border-cyan-500/25 shadow-[0_0_35px_rgba(6,182,212,0.14)]'
          : 'border-cyan-600/30 shadow-[0_0_30px_rgba(6,182,212,0.12)]';
    }
  };

  const getCoreSphereClass = () => {
    switch (state) {
      case 'listening':
        return darkMode
          ? 'bg-radial from-cyan-500/35 via-cyan-950/80 to-slate-950 border-cyan-300/80 shadow-[0_0_45px_rgba(34,211,238,0.5)] animate-pulse-active'
          : 'bg-radial from-cyan-100 via-cyan-50 to-white border-cyan-500 shadow-[0_0_35px_rgba(6,182,212,0.35)] animate-pulse-active';
      case 'thinking':
        return darkMode
          ? 'bg-radial from-sky-500/35 via-slate-900/90 to-slate-950 border-sky-300/80 shadow-[0_0_45px_rgba(56,189,248,0.45)]'
          : 'bg-radial from-sky-100 via-sky-50 to-white border-sky-500 shadow-[0_0_35px_rgba(14,165,233,0.3)]';
      case 'speaking':
        return darkMode
          ? 'bg-radial from-sky-400/40 via-cyan-950/85 to-slate-950 border-cyan-300/90 shadow-[0_0_55px_rgba(56,189,248,0.55)] animate-pulse-active'
          : 'bg-radial from-sky-100 via-cyan-50 to-white border-cyan-500 shadow-[0_0_40px_rgba(14,165,233,0.4)] animate-pulse-active';
      case 'error':
        return darkMode
          ? 'bg-radial from-rose-500/30 via-rose-950/70 to-slate-950 border-rose-400/80 shadow-[0_0_40px_rgba(244,63,94,0.4)]'
          : 'bg-radial from-rose-100 via-rose-50 to-white border-rose-500 shadow-[0_0_30px_rgba(244,63,94,0.25)]';
      default:
        return darkMode
          ? 'bg-radial from-cyan-500/20 via-slate-900/85 to-slate-950 border-cyan-400/50 shadow-[0_0_30px_rgba(6,182,212,0.25)] animate-pulse-slow'
          : 'bg-radial from-cyan-50 via-white to-slate-50 border-cyan-500/50 shadow-[0_0_25px_rgba(6,182,212,0.2)] animate-pulse-slow';
    }
  };

  return (
    <div className="relative flex items-center justify-center select-none my-1 sm:my-2">
      {/* Main Core Container (Responsive sizing for mobile, tablet, desktop) */}
      <div className="relative w-64 h-64 sm:w-80 sm:h-80 flex items-center justify-center">
        {/* Expanding Audio-Wave Ripple Rings when Listening or Speaking */}
        {(state === 'listening' || state === 'speaking') && (
          <>
            <div
              aria-hidden="true"
              className="absolute inset-8 rounded-full border border-cyan-400/40 animate-ripple pointer-events-none"
            />
            <div
              aria-hidden="true"
              className="absolute inset-8 rounded-full border border-sky-400/30 animate-ripple-delayed pointer-events-none"
            />
          </>
        )}

        {/* Outer Static Calibration Ring with HUD Crosshair Notches */}
        <div
          aria-hidden="true"
          className={`absolute inset-2 rounded-full border transition-all duration-500 pointer-events-none ${getOuterRingClass()}`}
        />

        {/* SVG Precision Geometric HUD Rings */}
        <svg
          viewBox="0 0 320 320"
          aria-hidden="true"
          className={`absolute inset-0 w-full h-full pointer-events-none ${
            state === 'thinking' ? 'animate-spin-fast' : 'animate-spin-slow'
          }`}
        >
          {/* Segmented Outer Telemetry Ring */}
          <circle
            cx="160"
            cy="160"
            r="146"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
            strokeDasharray="18 10 4 10 42 14"
            className={
              state === 'error'
                ? 'text-rose-400/50'
                : darkMode
                ? 'text-cyan-400/40'
                : 'text-cyan-600/45'
            }
          />
          {/* Cardinal Calibration Ticks */}
          <line
            x1="160"
            y1="6"
            x2="160"
            y2="18"
            stroke="currentColor"
            strokeWidth="2"
            className="text-cyan-400/70"
          />
          <line
            x1="160"
            y1="302"
            x2="160"
            y2="314"
            stroke="currentColor"
            strokeWidth="2"
            className="text-cyan-400/70"
          />
          <line
            x1="6"
            y1="160"
            x2="18"
            y2="160"
            stroke="currentColor"
            strokeWidth="2"
            className="text-cyan-400/70"
          />
          <line
            x1="302"
            y1="160"
            x2="314"
            y2="160"
            stroke="currentColor"
            strokeWidth="2"
            className="text-cyan-400/70"
          />
        </svg>

        {/* Counter-Rotating Inner Technical Ring */}
        <svg
          viewBox="0 0 320 320"
          aria-hidden="true"
          className={`absolute inset-0 w-full h-full pointer-events-none ${
            state === 'thinking' ? 'animate-spin-reverse-fast' : 'animate-spin-reverse-slow'
          }`}
        >
          <circle
            cx="160"
            cy="160"
            r="124"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeDasharray="60 28 12 28"
            className={
              state === 'error'
                ? 'text-rose-400/60'
                : state === 'listening' || state === 'speaking'
                ? 'text-cyan-300/70'
                : darkMode
                ? 'text-cyan-400/35'
                : 'text-cyan-600/40'
            }
          />
          <circle
            cx="160"
            cy="160"
            r="108"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeDasharray="4 8"
            className={darkMode ? 'text-sky-400/30' : 'text-sky-600/35'}
          />
        </svg>

        {/* Interactive Particle & Radial Frequency Canvas */}
        <canvas
          ref={canvasRef}
          width={320}
          height={320}
          aria-hidden="true"
          className="absolute inset-0 w-full h-full pointer-events-none"
        />

        {/* Central Glowing AI Core Orb Button */}
        <button
          type="button"
          onClick={onCoreClick}
          aria-label={`ATLAS AI Core — Current status: ${getStatusLabel()}. Click to toggle voice interaction.`}
          className={`relative z-10 w-32 h-32 sm:w-36 sm:h-36 rounded-full border-2 flex flex-col items-center justify-center gap-1 transition-all duration-300 cursor-pointer focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-cyan-400/70 ${getCoreSphereClass()}`}
        >
          {/* State Icon Above ATLAS Core Wordmark */}
          <div className="flex items-center justify-center h-6">
            {state === 'listening' && (
              <Mic className="w-5 h-5 text-cyan-300 animate-bounce" />
            )}
            {state === 'thinking' && (
              <Cpu className="w-5 h-5 text-sky-300 animate-spin" />
            )}
            {state === 'speaking' && (
              <Volume2 className="w-5 h-5 text-cyan-300 animate-pulse" />
            )}
            {state === 'error' && (
              <AlertTriangle className="w-5 h-5 text-rose-400 animate-pulse" />
            )}
            {state === 'idle' && (
              <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]" />
            )}
          </div>

          {/* Central Text: "ATLAS" */}
          <span
            className={`font-display text-xl sm:text-2xl font-bold tracking-[0.22em] pl-1 ${
              state === 'error'
                ? 'text-rose-300'
                : darkMode
                ? 'text-cyan-100 drop-shadow-[0_0_10px_rgba(34,211,238,0.6)]'
                : 'text-slate-900'
            }`}
          >
            ATLAS
          </span>

          {/* Small Status Inside Core: "Ready" / "Listening..." / "Thinking..." / "Speaking..." */}
          <span
            className={`font-mono text-[11px] tracking-wider ${
              state === 'error'
                ? 'text-rose-300'
                : state === 'listening'
                ? darkMode
                  ? 'text-cyan-300'
                  : 'text-cyan-700 font-semibold'
                : state === 'speaking'
                ? darkMode
                  ? 'text-sky-300'
                  : 'text-sky-700 font-semibold'
                : darkMode
                ? 'text-cyan-300/80'
                : 'text-slate-600'
            }`}
          >
            {getStatusLabel()}
          </span>
        </button>
      </div>
    </div>
  );
};

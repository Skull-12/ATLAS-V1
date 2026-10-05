import React, { useEffect, useRef } from 'react';
import { AICoreState } from '../types/atlas';

interface VoiceVisualizerProps {
  state: AICoreState;
  frequencyData: Uint8Array | null;
  audioLevel: number;
  darkMode: boolean;
}

export const VoiceVisualizer: React.FC<VoiceVisualizerProps> = ({
  state,
  frequencyData,
  audioLevel,
  darkMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef<AICoreState>(state);
  const freqRef = useRef<Uint8Array | null>(frequencyData);
  const levelRef = useRef<number>(audioLevel);
  const darkRef = useRef<boolean>(darkMode);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    freqRef.current = frequencyData;
  }, [frequencyData]);

  useEffect(() => {
    levelRef.current = audioLevel;
  }, [audioLevel]);

  useEffect(() => {
    darkRef.current = darkMode;
  }, [darkMode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let phase = 0;

    const render = () => {
      const currentState = stateRef.current;
      const currentFreq = freqRef.current;
      const currentLevel = levelRef.current;
      const isDark = darkRef.current;

      const width = canvas.width;
      const height = canvas.height;
      const centerY = height / 2;

      ctx.clearRect(0, 0, width, height);

      const barCount = 48;
      const totalBarSpace = width * 0.88;
      const startX = (width - totalBarSpace) / 2;
      const stepX = totalBarSpace / barCount;
      const barWidth = Math.max(2, stepX * 0.52);

      phase += currentState === 'listening' ? 0.14 : currentState === 'speaking' ? 0.12 : 0.04;

      // Draw subtle center calibration line
      ctx.beginPath();
      ctx.strokeStyle = isDark ? 'rgba(6, 182, 212, 0.16)' : 'rgba(8, 145, 178, 0.2)';
      ctx.lineWidth = 1;
      ctx.moveTo(startX, centerY);
      ctx.lineTo(startX + totalBarSpace, centerY);
      ctx.stroke();

      for (let i = 0; i < barCount; i++) {
        // Normalize position from -1 to 1 (center is 0)
        const normPos = (i - barCount / 2) / (barCount / 2);
        const envelope = Math.cos(normPos * (Math.PI / 2)) ** 1.6;

        let barHeight = 3;

        if (currentState === 'listening') {
          if (currentFreq && currentFreq.length > 0) {
            const freqIndex = Math.min(
              currentFreq.length - 1,
              Math.floor(Math.abs(normPos) * (currentFreq.length * 0.55))
            );
            const rawVal = currentFreq[freqIndex] / 255;
            const waveBoost =
              Math.sin(i * 0.45 + phase) * 0.18 + Math.cos(i * 0.25 - phase * 1.3) * 0.15;
            const combined = Math.max(0.12, rawVal * 0.85 + Math.abs(waveBoost) + currentLevel * 0.4);
            barHeight = Math.max(4, combined * envelope * (height * 0.82));
          } else {
            // Fallback active listening wave when Web Audio stream isn't attached simultaneously
            const synthetic =
              Math.abs(Math.sin(i * 0.35 + phase)) * 0.55 +
              Math.abs(Math.cos(i * 0.6 - phase * 1.4)) * 0.35;
            barHeight = Math.max(4, synthetic * envelope * (height * 0.68));
          }
        } else if (currentState === 'speaking') {
          // Smooth harmonic voice cadence waveform
          const harmonic1 = Math.sin(i * 0.28 + phase) * 0.5;
          const harmonic2 = Math.cos(i * 0.52 - phase * 1.6) * 0.35;
          const harmonic3 = Math.sin(phase * 0.7) * 0.2;
          const amplitude = Math.abs(harmonic1 + harmonic2 + harmonic3) * (0.65 + currentLevel * 0.35);
          barHeight = Math.max(4, amplitude * envelope * (height * 0.78));
        } else if (currentState === 'thinking') {
          // Travelling neural pulse wave
          const pulseWave = Math.exp(-((normPos - Math.sin(phase * 1.5) * 0.7) ** 2) * 12);
          barHeight = Math.max(3, pulseWave * (height * 0.48) + 3);
        } else if (currentState === 'error') {
          const alertWave = Math.abs(Math.sin(i * 0.5 + phase * 0.5)) * 0.25;
          barHeight = Math.max(3, alertWave * envelope * (height * 0.35));
        } else {
          // Idle: subtle breathing baseline
          const idleBreath = Math.abs(Math.sin(i * 0.25 + phase * 0.6)) * 0.15;
          barHeight = Math.max(2.5, idleBreath * envelope * (height * 0.28));
        }

        const x = startX + i * stepX + (stepX - barWidth) / 2;
        const y = centerY - barHeight / 2;

        // Color selection by state
        if (currentState === 'listening') {
          ctx.fillStyle = isDark ? 'rgba(34, 211, 238, 0.9)' : 'rgba(8, 145, 178, 0.85)';
        } else if (currentState === 'speaking') {
          ctx.fillStyle = isDark ? 'rgba(56, 189, 248, 0.92)' : 'rgba(2, 132, 199, 0.88)';
        } else if (currentState === 'thinking') {
          ctx.fillStyle = isDark ? 'rgba(103, 232, 249, 0.75)' : 'rgba(14, 116, 144, 0.75)';
        } else if (currentState === 'error') {
          ctx.fillStyle = isDark ? 'rgba(251, 113, 133, 0.8)' : 'rgba(225, 29, 72, 0.8)';
        } else {
          ctx.fillStyle = isDark ? 'rgba(6, 182, 212, 0.38)' : 'rgba(8, 145, 178, 0.4)';
        }

        ctx.beginPath();
        ctx.roundRect(x, y, barWidth, barHeight, barWidth / 2);
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  return (
    <div
      className="w-full max-w-md mx-auto flex flex-col items-center justify-center"
      aria-label={`Audio waveform visualizer in ${state} state`}
    >
      <canvas
        ref={canvasRef}
        width={420}
        height={56}
        className="w-full h-14 block"
      />
    </div>
  );
};

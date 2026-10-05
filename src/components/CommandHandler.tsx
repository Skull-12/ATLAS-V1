import React from 'react';
import {
  Clock,
  Calendar,
  Globe,
  Cpu,
  Calculator,
  Sparkles,
  ExternalLink,
  FileText,
  HelpCircle,
  Terminal,
} from 'lucide-react';
import { CommandExecutionResult, CommandPreset } from '../types/atlas';

export const COMMAND_PRESETS: CommandPreset[] = [
  {
    id: 'cmd-time',
    label: 'What time is it?',
    prompt: 'What time is it?',
    category: 'time',
    description: 'Local system time & timezone',
  },
  {
    id: 'cmd-date',
    label: "Tell me today's date",
    prompt: "Tell me today's date.",
    category: 'date',
    description: 'Current calendar date & day',
  },
  {
    id: 'cmd-search',
    label: 'Search the web...',
    prompt: 'Search the web for the latest breakthroughs in fusion energy.',
    category: 'search',
    description: 'Live Google Search grounding',
  },
  {
    id: 'cmd-explain',
    label: 'Explain quantum computing',
    prompt: 'Explain how quantum computing differs from classical computing in simple terms.',
    category: 'explain',
    description: 'Concise conceptual synthesis',
  },
  {
    id: 'cmd-calc',
    label: 'Calculate 18% of 2,450',
    prompt: 'Calculate 18% of 2450',
    category: 'calculate',
    description: 'Precision math processor',
  },
  {
    id: 'cmd-summary',
    label: 'Summarize a topic',
    prompt: 'Give me a summary of the Artemis lunar exploration program.',
    category: 'summary',
    description: 'Executive voice briefing',
  },
  {
    id: 'cmd-joke',
    label: 'Tell me a joke',
    prompt: 'Tell me a clever science or technology joke.',
    category: 'joke',
    description: 'Dry tactical humor',
  },
  {
    id: 'cmd-open',
    label: 'Open Wikipedia',
    prompt: 'Open Wikipedia',
    category: 'open',
    description: 'External link launcher',
  },
  {
    id: 'cmd-capabilities',
    label: 'What can you do?',
    prompt: 'What can you do?',
    category: 'capabilities',
    description: 'System capability overview',
  },
];

const KNOWN_SITES: Record<string, { label: string; url: string; domain: string }> = {
  youtube: { label: 'YouTube', url: 'https://www.youtube.com', domain: 'youtube.com' },
  google: { label: 'Google Search', url: 'https://www.google.com', domain: 'google.com' },
  github: { label: 'GitHub', url: 'https://github.com', domain: 'github.com' },
  wikipedia: { label: 'Wikipedia', url: 'https://www.wikipedia.org', domain: 'wikipedia.org' },
  gmail: { label: 'Google Mail', url: 'https://mail.google.com', domain: 'mail.google.com' },
  maps: { label: 'Google Maps', url: 'https://maps.google.com', domain: 'maps.google.com' },
  'google maps': { label: 'Google Maps', url: 'https://maps.google.com', domain: 'maps.google.com' },
  reddit: { label: 'Reddit', url: 'https://www.reddit.com', domain: 'reddit.com' },
  nasa: { label: 'NASA', url: 'https://www.nasa.gov', domain: 'nasa.gov' },
  arxiv: { label: 'arXiv Research', url: 'https://arxiv.org', domain: 'arxiv.org' },
  hackernews: { label: 'Hacker News', url: 'https://news.ycombinator.com', domain: 'news.ycombinator.com' },
  'hacker news': { label: 'Hacker News', url: 'https://news.ycombinator.com', domain: 'news.ycombinator.com' },
};

function safeEvaluateMath(rawInput: string): { expression: string; result: string } | null {
  const cleaned = rawInput
    .toLowerCase()
    .replace(/^(please\s+)?(atlas\s+)?(can you\s+)?(calculate|compute|what is|what's|solve|evaluate)\s+/i, '')
    .replace(/\?+$/, '')
    .trim();

  // Check "X% of Y" pattern
  const percentOfMatch = cleaned.match(/^([\d.,]+)\s*(?:%|percent)\s+of\s+([\d.,]+)$/i);
  if (percentOfMatch) {
    const pct = parseFloat(percentOfMatch[1].replace(/,/g, ''));
    const total = parseFloat(percentOfMatch[2].replace(/,/g, ''));
    if (!Number.isNaN(pct) && !Number.isNaN(total)) {
      const val = (pct / 100) * total;
      const formatted = Number.isInteger(val) ? val.toLocaleString() : val.toLocaleString(undefined, { maximumFractionDigits: 6 });
      return {
        expression: `${pct}% of ${total.toLocaleString()}`,
        result: formatted,
      };
    }
  }

  // Normalize verbal math operators
  const mathExpr = cleaned
    .replace(/,/g, '')
    .replace(/\bplus\b/g, '+')
    .replace(/\bminus\b/g, '-')
    .replace(/\b(times|multiplied by)\b/g, '*')
    .replace(/\b(divided by|over)\b/g, '/')
    .replace(/\bto the power of\b/g, '**')
    .replace(/\bsquared\b/g, '**2')
    .replace(/\bcubed\b/g, '**3')
    .replace(/\bsquare root of\s+([\d.]+)/g, 'Math.sqrt($1)')
    .replace(/\bsqrt\s*\(\s*([\d.]+)\s*\)/g, 'Math.sqrt($1)')
    .replace(/\^/g, '**');

  // Ensure it only contains safe math tokens
  const withoutSqrt = mathExpr.replace(/Math\.sqrt/g, '');
  if (!/^[\d+\-*/().\s*]+$/.test(withoutSqrt) || !/\d/.test(withoutSqrt)) {
    return null;
  }

  // Must actually have an operator or Math.sqrt
  if (!/[+\-*/]/.test(mathExpr) && !mathExpr.includes('Math.sqrt')) {
    return null;
  }

  try {
    // Safe bounded evaluation on validated numeric characters only
    const fn = new Function(`"use strict"; return (${mathExpr});`);
    const output = fn();
    if (typeof output === 'number' && Number.isFinite(output)) {
      const formattedResult = Number.isInteger(output)
        ? output.toLocaleString()
        : output.toLocaleString(undefined, { maximumFractionDigits: 6 });
      const readableExpr = mathExpr
        .replace(/Math\.sqrt\(([\d.]+)\)/g, '√($1)')
        .replace(/\*\*/g, '^')
        .replace(/\*/g, '×')
        .replace(/\//g, '÷');
      return {
        expression: readableExpr,
        result: formattedResult,
      };
    }
  } catch {
    return null;
  }

  return null;
}

export function evaluateUserCommand(rawText: string): CommandExecutionResult {
  const text = rawText.trim();
  const lower = text.toLowerCase().replace(/[.!?]+$/, '').trim();

  // 1. UI Control Commands (Open settings, Open conversation, Clear conversation)
  if (/^(open|show|launch)\s+(the\s+)?(settings|preferences|voice settings|configuration)$/i.test(lower)) {
    return {
      handledLocally: true,
      reply: 'Opening the ATLAS system configuration panel.',
      sourceType: 'local_system',
      commandCategory: 'System Control',
      uiAction: 'open_settings',
    };
  }

  if (/^(open|show|view)\s+(the\s+)?(conversation|chat|history|transcript|log|messages)$/i.test(lower)) {
    return {
      handledLocally: true,
      reply: 'Opening the conversation log.',
      sourceType: 'local_system',
      commandCategory: 'System Control',
      uiAction: 'open_conversation',
    };
  }

  if (/^(clear|reset|erase)\s+(the\s+)?(conversation|chat|history|messages)$/i.test(lower)) {
    return {
      handledLocally: true,
      reply: 'Conversation history has been cleared. Ready for new directives.',
      sourceType: 'local_system',
      commandCategory: 'System Control',
      uiAction: 'clear_conversation',
    };
  }

  // 2. Time Command ("What time is it?", "Current time", "Tell me the time")
  if (
    /^(atlas\s+)?(what\s+time\s+is\s+it|what's\s+the\s+time|tell\s+me\s+the\s+time|current\s+time|do\s+you\s+have\s+the\s+time|time\s+check)$/i.test(
      lower
    )
  ) {
    const now = new Date();
    const timeStr = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' });
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Local Time';
    return {
      handledLocally: true,
      reply: `The current time is ${timeStr} (${tz}).`,
      sourceType: 'local_system',
      commandCategory: 'Temporal Telemetry',
    };
  }

  // 3. Date Command ("Tell me today's date", "What is today's date?", "What day is it?")
  if (
    /^(atlas\s+)?(tell\s+me\s+today'?s\s+date|what\s+is\s+today'?s\s+date|what's\s+today'?s\s+date|what\s+date\s+is\s+it|what\s+day\s+is\s+it(\s+today)?|today'?s\s+date)$/i.test(
      lower
    )
  ) {
    const now = new Date();
    const dateStr = now.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - startOfYear.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));

    return {
      handledLocally: true,
      reply: `Today is ${dateStr}. It is day ${dayOfYear} of ${now.getFullYear()}.`,
      sourceType: 'local_system',
      commandCategory: 'Temporal Telemetry',
    };
  }

  // 4. Capabilities Command ("What can you do?", "Help", "List commands")
  if (
    /^(atlas\s+)?(what\s+can\s+you\s+do|what\s+are\s+your\s+capabilities|help|list\s+commands|how\s+can\s+you\s+help\s+me)$/i.test(
      lower
    )
  ) {
    return {
      handledLocally: true,
      reply:
        'I am ATLAS, your voice-first personal AI system. I can answer complex questions, search the live web for real-time information, explain technical concepts, perform instant calculations, summarize topics, report system time and date, and prepare verified navigation links for external websites.',
      sourceType: 'local_system',
      commandCategory: 'System Capabilities',
    };
  }

  // 5. Open External Website Command ("Open YouTube", "Open github.com", etc.)
  const openMatch = lower.match(/^(?:atlas\s+)?(?:please\s+)?open\s+(.+)$/i);
  if (openMatch) {
    const targetRaw = openMatch[1].trim().replace(/^website\s+/i, '');
    const known = KNOWN_SITES[targetRaw];
    if (known) {
      return {
        handledLocally: true,
        reply: `I have prepared a direct launch link for ${known.label} on your display. Because browser security restricts unprompted background popups, select the launch button on your HUD to open ${known.domain} in a new tab.`,
        sourceType: 'local_system',
        commandCategory: 'Browser Navigation',
        actionLink: known,
      };
    }

    // Check if it looks like a domain name (e.g. "openai.com" or "bbc.co.uk")
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(targetRaw)) {
      const cleanDomain = targetRaw.toLowerCase();
      const url = cleanDomain.startsWith('http') ? cleanDomain : `https://${cleanDomain}`;
      return {
        handledLocally: true,
        reply: `I have staged a direct launch link for ${cleanDomain}. Select the launch action on your screen to open it in a new browser tab.`,
        sourceType: 'local_system',
        commandCategory: 'Browser Navigation',
        actionLink: {
          label: cleanDomain,
          url,
          domain: cleanDomain,
        },
      };
    }

    // If user asked to open an unknown app/system resource not possible in browser
    return {
      handledLocally: true,
      reply: `As a browser-based AI system, I cannot directly launch native operating system applications like "${targetRaw}". However, I can prepare a web search or direct web link if you specify a website domain.`,
      sourceType: 'local_system',
      commandCategory: 'Browser Sandbox Notice',
    };
  }

  // 6. Local Math Calculation ("Calculate 18% of 2450", "Calculate 144 * 12")
  if (/^(atlas\s+)?(calculate|compute|solve|evaluate)\b/i.test(lower) || /^what\s+is\s+[\d(]/i.test(lower)) {
    const calc = safeEvaluateMath(text);
    if (calc) {
      return {
        handledLocally: true,
        reply: `${calc.expression} equals ${calc.result}.`,
        sourceType: 'local_system',
        commandCategory: 'Mathematical Processor',
        calculationResult: calc,
      };
    }
    return {
      handledLocally: false,
      commandCategory: 'Mathematical Processor',
      transformedPrompt: text,
    };
  }

  // 7. Explicit Web Search Command ("Search the web for...", "Search for...", "Look up...")
  if (
    /^(atlas\s+)?(search\s+the\s+web\s+for|search\s+for|search\s+google\s+for|look\s+up|find\s+current\s+info\s+on|what\s+is\s+the\s+latest\s+news\s+on)\b/i.test(
      lower
    )
  ) {
    return {
      handledLocally: false,
      forceSearch: true,
      commandCategory: 'Live Web Search',
      transformedPrompt: text,
    };
  }

  // 8. Explain / Summary / Joke categorization
  if (/^(atlas\s+)?(explain|how\s+does|why\s+does)\b/i.test(lower)) {
    return {
      handledLocally: false,
      commandCategory: 'Knowledge Synthesis',
      transformedPrompt: text,
    };
  }

  if (/^(atlas\s+)?(give\s+me\s+a\s+summary\s+of|summarize|brief\s+me\s+on)\b/i.test(lower)) {
    return {
      handledLocally: false,
      commandCategory: 'Executive Summary',
      transformedPrompt: text,
    };
  }

  if (/joke/i.test(lower)) {
    return {
      handledLocally: false,
      commandCategory: 'Humor Protocol',
      transformedPrompt: text,
    };
  }

  return {
    handledLocally: false,
    transformedPrompt: text,
  };
}

interface CommandHandlerProps {
  onSelectCommand: (prompt: string) => void;
  disabled?: boolean;
  darkMode: boolean;
}

export const CommandHandler: React.FC<CommandHandlerProps> = ({
  onSelectCommand,
  disabled = false,
  darkMode,
}) => {
  const getCategoryIcon = (category: CommandPreset['category']) => {
    switch (category) {
      case 'time':
        return <Clock className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
      case 'date':
        return <Calendar className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
      case 'search':
        return <Globe className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
      case 'explain':
        return <Cpu className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
      case 'calculate':
        return <Calculator className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
      case 'joke':
        return <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
      case 'open':
        return <ExternalLink className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
      case 'summary':
        return <FileText className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
      case 'capabilities':
        return <HelpCircle className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
      default:
        return <Terminal className="w-3.5 h-3.5 text-cyan-400 shrink-0" />;
    }
  };

  return (
    <section
      aria-label="Voice Command Directives"
      className="w-full max-w-4xl mx-auto px-4"
    >
      <div className="flex items-center justify-center gap-2 mb-2.5">
        <Terminal className={`w-3.5 h-3.5 ${darkMode ? 'text-cyan-400/70' : 'text-cyan-700'}`} />
        <span
          className={`text-xs font-mono tracking-wider ${
            darkMode ? 'text-slate-400' : 'text-slate-600'
          }`}
        >
          Voice Directives · Speak or Select to Execute
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {COMMAND_PRESETS.map((preset) => (
          <button
            key={preset.id}
            type="button"
            disabled={disabled}
            onClick={() => onSelectCommand(preset.prompt)}
            title={preset.description}
            className={`group flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-150 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 disabled:opacity-40 disabled:cursor-not-allowed ${
              darkMode
                ? 'bg-slate-900/70 hover:bg-cyan-950/60 text-slate-300 hover:text-cyan-200 border border-cyan-500/20 hover:border-cyan-400/50'
                : 'bg-white/80 hover:bg-cyan-50 text-slate-700 hover:text-cyan-900 border border-slate-300 hover:border-cyan-500/50 shadow-xs'
            }`}
          >
            {getCategoryIcon(preset.category)}
            <span>{preset.label}</span>
          </button>
        ))}
      </div>
    </section>
  );
};

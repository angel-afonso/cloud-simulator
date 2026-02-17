
import React, { useEffect, useRef } from 'react';

interface LogEntry {
  id: string;
  message: string;
  type: 'info' | 'warn' | 'error' | 'success';
  timestamp: string;
}

interface TerminalProps {
  logs: LogEntry[];
}

export const Terminal: React.FC<TerminalProps> = ({ logs }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'warn': return 'text-amber-400';
      case 'error': return 'text-red-400';
      case 'success': return 'text-emerald-400';
      default: return 'text-slate-300';
    }
  };

  return (
    <div className="w-80 h-48 bg-slate-950/40 backdrop-blur-md border border-white/10 rounded-xl overflow-hidden flex flex-col shadow-2xl scanline relative">
      <div className="px-3 py-1.5 border-b border-white/10 bg-white/5 flex items-center justify-between shrink-0 relative z-10">
        <div className="flex items-center space-x-2">
          <div className="w-2 h-2 rounded-full bg-red-500/50"></div>
          <div className="w-2 h-2 rounded-full bg-amber-500/50"></div>
          <div className="w-2 h-2 rounded-full bg-emerald-500/50"></div>
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-2">System Console</span>
        </div>
        <div className="text-[9px] font-mono text-slate-600 uppercase tracking-tighter">Live Monitor</div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 p-3 font-mono text-[10px] overflow-y-auto scrollbar-hide space-y-1.5 relative z-10"
      >
        {logs.length === 0 && (
          <div className="text-slate-600 animate-pulse">Initializing system link...</div>
        )}
        {logs.map((log) => (
          <div key={log.id} className="flex space-x-2 leading-relaxed animate-[fadeIn_0.2s_ease-out]">
            <span className="text-slate-600 shrink-0">[{log.timestamp}]</span>
            <span className={getTypeColor(log.type)}>{log.message}</span>
          </div>
        ))}
      </div>

      <div className="px-3 py-1 bg-white/5 border-t border-white/5 shrink-0 flex items-center relative z-10">
        <span className="text-[9px] text-emerald-500/70 font-mono animate-pulse mr-1">●</span>
        <span className="text-[8px] text-slate-500 font-mono uppercase tracking-widest">Connection: Secure</span>
      </div>
    </div>
  );
};

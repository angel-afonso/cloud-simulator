
import React, { useState } from 'react';
import { GameMetrics, RequestType, NodeData, NodeType, ResponseCode } from '../types';
import { REQUEST_COLORS, COMPUTE_TIERS, CDN_TIERS, NODE_OPEX, NODE_LABELS, NODE_COLORS } from '../constants';

interface StatsPanelProps {
  metrics: GameMetrics;
  nodes: NodeData[];
  onToggleBuildMenu: () => void;
  isBuildMenuOpen: boolean;
  onOpenResearch: () => void;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({
    metrics, nodes, onToggleBuildMenu, isBuildMenuOpen, onOpenResearch
}) => {
  const [isCostOpen, setIsCostOpen] = useState(false);

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', { 
        style: 'currency', 
        currency: 'USD',
        maximumFractionDigits: 0
    }).format(val);
  };

  const netIncome = metrics.revenuePerSec - metrics.opexPerSec;

  const MetricPill = ({ label, value, color = "text-white", icon, onClick }: any) => (
    <div 
        onClick={onClick}
        className={`flex flex-col items-center px-4 transition-all duration-300 ${onClick ? 'cursor-pointer hover:opacity-70' : ''}`}
    >
        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter mb-0.5">{label}</span>
        <span className={`text-sm font-mono font-black leading-none ${color}`}>{value}</span>
    </div>
  );

  // --- Cost Calculation Logic ---
  const calculateCosts = () => {
    const breakdown: Record<string, { total: number, count: number, items: {id: string, cost: number}[] }> = {};

    nodes.forEach(node => {
        let cost = 0;
        let label = NODE_LABELS[node.type];
        
        // Detailed labeling
        if (node.tier) {
            const tier = COMPUTE_TIERS[node.tier];
            cost = tier.opex;
            label = `Compute (${tier.name})`;
        } else if (node.cdnTier) {
            const tier = CDN_TIERS[node.cdnTier];
            cost = tier.opex;
            label = `CDN (${tier.name})`;
        } else {
            cost = NODE_OPEX[node.type];
        }
        
        // Skip free nodes (Internet)
        if (cost === 0) return;

        if (!breakdown[label]) {
            breakdown[label] = { total: 0, count: 0, items: [] };
        }
        breakdown[label].total += cost;
        breakdown[label].count += 1;
        breakdown[label].items.push({ id: node.id, cost });
    });

    // Convert to array and sort by total cost
    return Object.entries(breakdown)
        .map(([name, data]) => ({ name, ...data }))
        .sort((a, b) => b.total - a.total);
  };

  const costData = calculateCosts();
  
  // Satisfaction Colors
  let satColor = 'bg-emerald-500';
  if (metrics.userSatisfaction < 50) satColor = 'bg-red-500';
  else if (metrics.userSatisfaction < 80) satColor = 'bg-amber-500';

  // Latency Colors
  let latencyColor = 'text-emerald-400';
  if (metrics.p95LatencyMs > 500) latencyColor = 'text-amber-400';
  if (metrics.p95LatencyMs > 1500) latencyColor = 'text-red-500';

  return (
    <div className="flex flex-col items-center space-y-4 w-full transition-all max-w-[95%]">
        
    {/* Main Bar */}
    <div className={`
        flex items-center backdrop-blur-xl border rounded-full shadow-2xl px-2 py-1.5 overflow-hidden transition-all hover:border-white/20 relative z-20
        ${metrics.isUnderAttack ? 'bg-red-950/40 border-red-500/50 shadow-[0_0_30px_rgba(239,68,68,0.2)]' : 'bg-slate-900/40 border-white/10'}
    `}>
      
      {/* Left: Menu Trigger */}
      <button 
        onClick={onToggleBuildMenu}
        className={`
            flex items-center space-x-2 px-5 py-2.5 rounded-full transition-all duration-300 group
            ${isBuildMenuOpen 
                ? 'bg-brand-primary text-white shadow-[0_0_20px_rgba(99,102,241,0.4)]'
                : 'bg-white/5 text-slate-300 hover:bg-white/10 hover:text-white'}
        `}
      >
        <div className="relative w-4 h-4 overflow-hidden">
            <div className={`absolute inset-0 grid grid-cols-2 gap-0.5 transition-transform duration-300 ${isBuildMenuOpen ? 'rotate-90' : ''}`}>
                <div className={`w-1.5 h-1.5 rounded-sm ${isBuildMenuOpen ? 'bg-white' : 'bg-brand-primary'}`}></div>
                <div className={`w-1.5 h-1.5 rounded-sm ${isBuildMenuOpen ? 'bg-white' : 'bg-slate-500'}`}></div>
                <div className={`w-1.5 h-1.5 rounded-sm ${isBuildMenuOpen ? 'bg-white' : 'bg-slate-500'}`}></div>
                <div className={`w-1.5 h-1.5 rounded-sm ${isBuildMenuOpen ? 'bg-white' : 'bg-brand-primary'}`}></div>
            </div>
        </div>
        <span className="text-[11px] font-black tracking-[0.2em] uppercase">Architecture</span>
      </button>

      {/* Center: Core Metrics */}
      <div className="flex items-center px-6">
            <MetricPill
                label="Wave"
                value={`${metrics.waveStatus === 'peace' ? 'RESTING' : 'WAVE ' + metrics.currentWave}`}
                color={metrics.waveStatus === 'peace' ? "text-slate-400" : "text-amber-400"}
            />

            <div className="w-px h-8 bg-white/5 mx-2"></div>

            <MetricPill 
                label="Balance"
                value={formatCurrency(metrics.cash)} 
                color={metrics.cash < 1000 ? "text-red-400" : "text-emerald-400"}
            />

            <div className="w-px h-8 bg-white/5 mx-2"></div>

            <MetricPill
                label="Innovation"
                value={Math.floor(metrics.techPoints)}
                color="text-brand-primary"
            />

            <div className="w-px h-8 bg-white/5 mx-2"></div>

            <MetricPill 
                label="Avg Latency"
                value={`${metrics.p95LatencyMs}ms`}
                color={latencyColor}
            />

            <div className="w-px h-8 bg-white/5 mx-2"></div>

            <div className="flex items-center px-4 space-x-6">
                {/* Uptime */}
                <div className="flex flex-col items-center">
                    <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter">SLA Integrity</span>
                    <span className={`text-xs font-mono font-bold ${metrics.uptime >= 99.9 ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {metrics.uptime.toFixed(2)}%
                    </span>
                </div>

                {/* Satisfaction Bar */}
                <div className="flex flex-col items-center w-24">
                        <span className="text-[8px] font-bold text-slate-500 uppercase tracking-tighter mb-1">User Satisfaction</span>
                        <div className="w-full h-1 bg-white/5 rounded-full overflow-hidden">
                            <div className={`h-full ${satColor} transition-all duration-700 shadow-[0_0_8px_currentColor]`} style={{ width: `${metrics.userSatisfaction}%` }}></div>
                        </div>
                </div>
            </div>
      </div>

      {/* Research Trigger */}
      <button
        onClick={onOpenResearch}
        className="flex items-center space-x-2 px-5 py-2.5 rounded-full transition-all duration-300 bg-white/5 text-slate-300 hover:bg-brand-primary/20 hover:text-brand-primary border border-transparent hover:border-brand-primary/30 ml-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.628.288a2 2 0 00-1.145 1.816v1.291A7.001 7.001 0 0016.825 21h.062a7.002 7.002 0 006.884-5.326l-.025-.013zm-13.417.046a2 2 0 011.022-.547l2.387-.477a6 6 0 013.86.517l.628.288a2 2 0 011.145 1.816v1.291A7.001 7.001 0 017.175 21h-.062a7.002 7.002 0 01-6.884-5.326l.025-.013zM12 7a5 5 0 110-10 5 5 0 010 10zm0 2a7 7 0 100-14 7 7 0 000 14z" /></svg>
        <span className="text-[11px] font-black tracking-[0.2em] uppercase">Research</span>
      </button>

      {/* Right: Net Income / Opex Toggle */}
      <div 
        onClick={() => setIsCostOpen(!isCostOpen)}
        className={`
            px-6 py-2 rounded-full transition-all duration-300 cursor-pointer flex items-center space-x-3
            ${isCostOpen ? 'bg-white/10 ring-1 ring-white/20' : 'bg-white/5 hover:bg-white/10'}
        `}
      >
          <div className="flex flex-col items-end">
            <span className="text-[8px] font-bold text-slate-500 uppercase tracking-widest">Efficiency</span>
            <span className={`text-xs font-mono font-bold ${netIncome >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                {netIncome >= 0 ? '+' : ''}{formatCurrency(netIncome)}<span className="text-[9px] opacity-60">/s</span>
            </span>
          </div>
          <div className={`p-1.5 rounded-full transition-transform duration-300 ${isCostOpen ? 'bg-white/10 rotate-180' : 'bg-black/20'}`}>
             <svg className="w-3 h-3 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
          </div>
      </div>
    </div>

    {/* WAVE & ALERT BANNER - SEPARATED */}
    {metrics.waveStatus === 'peace' && metrics.waveCountdown < 10 && (
        <div className="w-full bg-amber-950/90 border border-amber-500 shadow-lg rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center space-x-3">
                <div className="w-2 h-2 rounded-full bg-amber-500 animate-ping"></div>
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-amber-500 tracking-widest uppercase">Traffic Surge Imminent</span>
                    <span className="text-[10px] text-amber-300">
                        Prepare your infrastructure for Wave {metrics.currentWave + 1}
                    </span>
                </div>
            </div>
            <div className="bg-amber-900/50 px-3 py-1 rounded-lg border border-amber-500/30">
                <span className="text-white font-mono font-bold text-xs">T-Minus: {metrics.waveCountdown}s</span>
            </div>
        </div>
    )}

    {metrics.isUnderAttack && (
        <div className="w-full bg-red-950/90 border border-red-500 shadow-lg rounded-xl p-3 flex items-center justify-between animate-pulse">
            <div className="flex items-center space-x-3">
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                <div className="flex flex-col">
                    <span className="text-xs font-bold text-red-500 tracking-widest uppercase">DDoS Attack In Progress</span>
                    <span className="text-[10px] text-red-300">
                        Mitigate with WAF/Firewall or Scale Up
                    </span>
                </div>
            </div>
            <div className="bg-red-900/50 px-3 py-1 rounded-lg border border-red-500/30">
                <span className="text-white font-mono font-bold text-xs">Time Left: {metrics.attackTimeLeft}s</span>
            </div>
        </div>
    )}

    {/* Cost Breakdown Panel (Collapsible) */}
    {isCostOpen && (
        <div className="w-full bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-xl p-4 animate-[fadeIn_0.2s_ease-out] relative z-10">
            <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Operational Expenditure (OPEX) Breakdown</h3>
                <span className="text-xs font-mono font-bold text-red-400">Total: ${metrics.opexPerSec}/s</span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-60 overflow-y-auto scrollbar-thin">
                {/* Summary By Type */}
                <div className="space-y-2">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase">Cost by Infrastructure Type</h4>
                    {costData.map((item) => (
                        <div key={item.name} className="flex justify-between items-center text-xs p-2 bg-slate-800/40 rounded border border-white/5">
                            <div className="flex items-center space-x-2">
                                <span className="font-bold text-slate-300">{item.name}</span>
                                <span className="text-[10px] text-slate-500">x{item.count}</span>
                            </div>
                            <span className="font-mono text-red-400">-${item.total}/s</span>
                        </div>
                    ))}
                    {costData.length === 0 && <div className="text-xs text-slate-500 italic">No active infrastructure costs.</div>}
                </div>

                {/* Individual Nodes (Top Spenders) */}
                <div className="space-y-2">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase">Individual Node Costs</h4>
                    <div className="space-y-1">
                        {costData.flatMap(g => g.items).sort((a,b) => b.cost - a.cost).map((node) => (
                            <div key={node.id} className="flex justify-between items-center text-[10px] px-2 py-1 hover:bg-white/5 rounded">
                                <span className="font-mono text-slate-400">{node.id}</span>
                                <span className="font-mono text-red-400/80">-${node.cost}/s</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    )}

    {/* Minimal Status Bar (Integrated) */}
    <div className="w-full max-w-2xl px-6">
        <div className="flex justify-between items-center mb-1 px-2">
            <span className="text-[7px] font-black text-slate-600 uppercase tracking-[0.4em]">Global Traffic Distribution</span>
            <div className="flex space-x-4 text-[7px] font-black uppercase tracking-widest">
                <span className="text-emerald-500/70">Success</span>
                <span className="text-amber-500/70">Throttled</span>
                <span className="text-red-500/70">Critical</span>
            </div>
        </div>
        <div className="w-full h-0.5 bg-white/5 rounded-full overflow-hidden flex shadow-[0_0_10px_rgba(255,255,255,0.02)]">
            <div className="h-full bg-emerald-500/40 transition-all duration-1000 ease-out"
                 style={{ width: `${(metrics.responseCodes[ResponseCode.HTTP_200] / (metrics.totalRequests || 1)) * 100}%` }}></div>
            <div className="h-full bg-amber-500/40 transition-all duration-1000 ease-out"
                 style={{ width: `${(metrics.responseCodes[ResponseCode.HTTP_429] / (metrics.totalRequests || 1)) * 100}%` }}></div>
            <div className="h-full bg-red-500/40 transition-all duration-1000 ease-out"
                 style={{ width: `${((metrics.responseCodes[ResponseCode.HTTP_500] + metrics.responseCodes[ResponseCode.HTTP_503]) / (metrics.totalRequests || 1)) * 100}%` }}></div>
        </div>
    </div>

    </div>
  );
};

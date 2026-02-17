
import React, { useState } from 'react';
import { GameMetrics, RequestType, NodeData, NodeType, ResponseCode } from '../types';
import { REQUEST_COLORS, COMPUTE_TIERS, CDN_TIERS, NODE_OPEX, NODE_LABELS, NODE_COLORS } from '../constants';

interface StatsPanelProps {
  metrics: GameMetrics;
  nodes: NodeData[];
  onToggleBuildMenu: () => void;
  isBuildMenuOpen: boolean;
}

export const StatsPanel: React.FC<StatsPanelProps> = ({ metrics, nodes, onToggleBuildMenu, isBuildMenuOpen }) => {
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
        className={`flex items-center space-x-3 px-4 py-1 border-r border-white/5 last:border-0 ${onClick ? 'cursor-pointer hover:bg-white/5 transition-colors' : ''}`}
    >
        {icon && <div className={`text-slate-400`}>{icon}</div>}
        <div className="flex flex-col">
            <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{label}</span>
            <span className={`text-sm font-mono font-bold leading-tight ${color}`}>{value}</span>
        </div>
        {onClick && (
            <div className="text-slate-500">
                <svg className={`w-3 h-3 transition-transform ${isCostOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </div>
        )}
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
    <div className="flex flex-col items-center space-y-2 w-full max-w-5xl transition-all">
        
    {/* Main Bar */}
    <div className={`
        flex items-center backdrop-blur-xl border rounded-2xl shadow-2xl p-1.5 overflow-hidden w-full justify-between transition-all hover:border-white/20 relative z-20
        ${metrics.isUnderAttack ? 'bg-slate-900/90 border-white/10' : 'bg-slate-900/70 border-white/10'}
    `}>
      
      {/* Left: Menu Trigger */}
      <button 
        onClick={onToggleBuildMenu}
        className={`
            flex items-center space-x-2 px-4 py-2 rounded-xl transition-all border
            ${isBuildMenuOpen 
                ? 'bg-brand-primary text-white border-brand-primary shadow-glow' 
                : 'bg-white/5 text-slate-300 border-transparent hover:bg-white/10 hover:text-white'}
        `}
      >
        <div className="grid grid-cols-2 gap-0.5">
            <div className={`w-1 h-1 rounded-sm ${isBuildMenuOpen ? 'bg-white' : 'bg-current'}`}></div>
            <div className={`w-1 h-1 rounded-sm ${isBuildMenuOpen ? 'bg-white' : 'bg-current'}`}></div>
            <div className={`w-1 h-1 rounded-sm ${isBuildMenuOpen ? 'bg-white' : 'bg-current'}`}></div>
            <div className={`w-1 h-1 rounded-sm ${isBuildMenuOpen ? 'bg-white' : 'bg-current'}`}></div>
        </div>
        <span className="text-xs font-bold tracking-wide">DEPLOY</span>
      </button>

      {/* Center: Core Metrics */}
      <div className="flex items-center mx-4">
            <MetricPill 
                label="Cash" 
                value={formatCurrency(metrics.cash)} 
                color={metrics.cash < 1000 ? "text-brand-danger" : "text-emerald-400"}
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />

            <MetricPill 
                label="Latency (P95)" 
                value={`${metrics.p95LatencyMs}ms`}
                color={latencyColor}
                icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
            />

            <div className="flex items-center px-4 space-x-4">
                {/* Uptime */}
                <div className="flex flex-col items-end">
                    <span className="text-[9px] font-bold text-slate-500 uppercase">SLA UPTIME</span>
                    <span className={`text-sm font-mono font-bold ${metrics.uptime >= 99.9 ? 'text-brand-success' : 'text-brand-warning'}`}>
                        {metrics.uptime.toFixed(2)}%
                    </span>
                </div>

                {/* Satisfaction Bar */}
                <div className="flex flex-col w-24">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[9px] font-bold text-slate-500 uppercase">User SAT</span>
                            <span className={`text-[9px] font-bold ${satColor.replace('bg-', 'text-')}`}>{metrics.userSatisfaction.toFixed(0)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className={`h-full ${satColor} transition-all duration-300`} style={{ width: `${metrics.userSatisfaction}%` }}></div>
                        </div>
                </div>
            </div>
      </div>

      {/* Right: Net Income / Opex Toggle */}
      <div 
        onClick={() => setIsCostOpen(!isCostOpen)}
        className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 cursor-pointer transition-colors border border-transparent hover:border-white/5 flex flex-col items-end"
      >
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">NET / SEC</span>
          <div className="flex items-center space-x-1">
             <span className={`text-sm font-mono font-bold ${netIncome >= 0 ? "text-brand-success" : "text-brand-danger"}`}>
                {netIncome >= 0 ? '+' : ''}{formatCurrency(netIncome)}
             </span>
             <svg className={`w-3 h-3 text-slate-500 transition-transform ${isCostOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
          </div>
      </div>
    </div>

    {/* ALERT BANNER - SEPARATED */}
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

    {/* New Row: Status Codes & Traffic Analysis */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 w-full">
        
        {/* Response Code Distribution Bar */}
        <div className="col-span-2 bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-xl p-3 flex flex-col justify-center">
             <div className="flex justify-between items-end mb-2">
                 <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Response Status</span>
                 <div className="flex space-x-3 text-[9px] font-mono">
                     <span className="text-emerald-400">200 OK</span>
                     <span className="text-slate-400">403 Blocked</span>
                     <span className="text-amber-400">429 Limit</span>
                     <span className="text-red-500">5xx Error</span>
                 </div>
             </div>
             <div className="w-full h-3 bg-slate-800 rounded-full overflow-hidden flex">
                 {/* 200 */}
                 <div className="h-full bg-emerald-500 transition-all duration-300" 
                      style={{ width: `${(metrics.responseCodes[ResponseCode.HTTP_200] / (metrics.totalRequests || 1)) * 100}%` }}></div>
                 {/* 403 */}
                 <div className="h-full bg-slate-500 transition-all duration-300" 
                      style={{ width: `${(metrics.responseCodes[ResponseCode.HTTP_403] / (metrics.totalRequests || 1)) * 100}%` }}></div>
                 {/* 429 */}
                 <div className="h-full bg-amber-500 transition-all duration-300" 
                      style={{ width: `${(metrics.responseCodes[ResponseCode.HTTP_429] / (metrics.totalRequests || 1)) * 100}%` }}></div>
                 {/* 500 + 503 */}
                 <div className="h-full bg-red-500 transition-all duration-300" 
                      style={{ width: `${((metrics.responseCodes[ResponseCode.HTTP_500] + metrics.responseCodes[ResponseCode.HTTP_503]) / (metrics.totalRequests || 1)) * 100}%` }}></div>
             </div>
        </div>

        {/* Detailed Latency Box */}
        <div className="col-span-1 bg-slate-900/50 backdrop-blur-md border border-white/5 rounded-xl p-3 flex items-center justify-between">
             <div className="flex flex-col">
                 <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Avg Latency</span>
                 <span className="text-sm font-mono font-bold text-white">{metrics.latencyMs}ms</span>
             </div>
             <div className="h-8 w-px bg-white/10"></div>
             <div className="flex flex-col items-end">
                 <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">P95 Tail</span>
                 <span className={`text-sm font-mono font-bold ${latencyColor}`}>{metrics.p95LatencyMs}ms</span>
             </div>
        </div>
    </div>

    {/* Traffic Breakdown Bar (Existing) */}
    <div className="grid grid-cols-6 gap-2 w-full">
        {[RequestType.WEB, RequestType.DB_READ, RequestType.DB_WRITE, RequestType.DB_SEARCH, RequestType.STATIC, RequestType.ATTACK].map(type => {
            const stats = metrics.requestsByType[type];
            if (!stats) return null;
            if (type === RequestType.ATTACK && stats.successful + stats.failed === 0 && !metrics.isUnderAttack) return null;
            
            const total = stats.successful + stats.failed;
            const successRate = total > 0 ? (stats.successful / total) * 100 : 100;
            const colorClass = REQUEST_COLORS[type];

            return (
                <div key={type} className={`
                    backdrop-blur-md border border-white/5 rounded-xl p-2 flex items-center justify-between
                    ${type === RequestType.ATTACK ? 'bg-red-950/50 border-red-500/20 col-span-1' : 'bg-slate-900/50'}
                `}>
                    <div className="flex flex-col">
                        <span className={`text-[8px] font-bold uppercase tracking-wider ${colorClass}`}>{type.replace('DB_', '')}</span>
                        <div className="flex items-baseline space-x-1">
                             <span className="text-xs font-mono font-bold text-white">{Math.round(stats.successful)}/s</span>
                             {stats.failed > 0 && (
                                 <span className="text-[9px] text-red-400 font-mono">-{Math.round(stats.failed)}</span>
                             )}
                        </div>
                    </div>
                    <div className="h-1.5 w-8 bg-slate-700 rounded-full overflow-hidden">
                        <div 
                            className={`h-full ${colorClass.replace('text', 'bg')}`} 
                            style={{ width: `${successRate}%` }}
                        ></div>
                    </div>
                </div>
            );
        })}
    </div>

    </div>
  );
};

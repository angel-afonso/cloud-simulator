
import React from 'react';
import { ComputeTier, CdnTier, NodeData, NodeType, LoadBalancerAlgo, Connection, DbRole } from '../types';
import { COMPUTE_TIERS, CDN_TIERS, NODE_COSTS, NODE_OPEX, NODE_COLORS } from '../constants';

interface PropertyPanelProps {
  selectedNode: NodeData | null;
  allNodes: NodeData[];
  connections: Connection[];
  onUpgrade: (nodeId: string, newTier: any) => void;
  onAlgorithmChange: (nodeId: string, algo: LoadBalancerAlgo) => void;
  onDelete: (nodeId: string) => void;
  onUnlink: (sourceId: string, targetId: string) => void;
  canAfford: (amount: number) => boolean;
  onClose: () => void;
}

export const PropertyPanel: React.FC<PropertyPanelProps> = ({ 
  selectedNode, allNodes, connections, onUpgrade, onAlgorithmChange, onDelete, onUnlink, canAfford, onClose 
}) => {
  if (!selectedNode) return null;

  const isCompute = selectedNode.type === NodeType.COMPUTE;
  const isCDN = selectedNode.type === NodeType.CDN;
  const isLoadBalancer = selectedNode.type === NodeType.LOAD_BALANCER;
  const isDatabase = selectedNode.type === NodeType.DATABASE; // SQL Only
  const isCache = selectedNode.type === NodeType.CACHE;
  const isNoSQL = selectedNode.type === NodeType.DATABASE_NOSQL;
  
  const currentTier = selectedNode.tier ? COMPUTE_TIERS[selectedNode.tier] : null;
  const currentCdnTier = selectedNode.cdnTier ? CDN_TIERS[selectedNode.cdnTier] : null;

  // Find Connections
  const outgoing = connections.filter(c => c.sourceId === selectedNode.id);
  const incoming = connections.filter(c => c.targetId === selectedNode.id);

  const getNodeInfo = (id: string) => {
      const n = allNodes.find(node => node.id === id);
      return n ? { type: n.type, id: n.id } : { type: 'Unknown', id };
  };

  const ConnectionItem: React.FC<{ id: string, isOutgoing: boolean }> = ({ id, isOutgoing }) => {
      const info = getNodeInfo(id);
      const colorBase = NODE_COLORS[info.type as NodeType]?.split('-')[1] || 'slate';
      
      return (
          <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5 transition-all duration-300 hover:bg-white/10 group">
              <div className="flex items-center space-x-3 overflow-hidden">
                  <div className={`w-1.5 h-1.5 rounded-full bg-${colorBase}-400 shadow-[0_0_8px_currentColor] shrink-0`}></div>
                  <div className="flex flex-col truncate">
                      <span className="text-[10px] font-bold text-slate-300">{NODE_LABELS[info.type as NodeType] || info.type}</span>
                      <span className="text-[8px] text-slate-500 font-mono truncate">{info.id}</span>
                  </div>
              </div>
              {isOutgoing && (
                  <button 
                    onClick={() => onUnlink(selectedNode.id, id)}
                    className="ml-2 text-slate-500 hover:text-red-400 p-1.5 rounded-full hover:bg-red-500/10 transition-all duration-300"
                    title="Unlink"
                  >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
              )}
          </div>
      );
  };

  // --- CHART RENDERING ---
  const renderMonitoringChart = (data: number[]) => {
      if (!data || data.length < 2) return null;

      const height = 60;
      const width = 260; // Approximate width of panel internal container
      const maxVal = 100;
      const minVal = 0;
      
      const points = data.map((val, i) => {
          const x = (i / (data.length - 1)) * width;
          const y = height - ((val - minVal) / (maxVal - minVal)) * height;
          return `${x},${y}`;
      }).join(' ');

      // Fill area path
      const fillPath = `${points} ${width},${height} 0,${height}`;

      // Dynamic color based on latest value
      const latest = data[data.length - 1];
      let strokeColor = "#10b981"; // Green
      if (latest > 80) strokeColor = "#ef4444"; // Red
      else if (latest > 50) strokeColor = "#f59e0b"; // Orange

      return (
          <div className="bg-black/20 p-5 rounded-2xl border border-white/5 relative overflow-hidden group transition-all duration-300 hover:border-white/10">
              <div className="flex justify-between items-center mb-4">
                   <div className="flex items-center space-x-2">
                        <div className={`w-1 h-1 rounded-full animate-pulse`} style={{backgroundColor: strokeColor}}></div>
                        <span className="text-[8px] font-black text-slate-500 uppercase tracking-[0.2em]">Real-time Telemetry</span>
                   </div>
                   <span className="text-[10px] font-mono font-bold text-white opacity-80">{latest.toFixed(1)}%</span>
              </div>
              
              <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                  {/* Grid lines */}
                  <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} stroke="white" strokeWidth="0.5" opacity="0.05" />

                  {/* Gradient Defs */}
                  <defs>
                      <linearGradient id={`chartGradient-${selectedNode.id}`} x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.3" />
                          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
                      </linearGradient>
                  </defs>

                  {/* Area Fill */}
                  <polygon points={fillPath} fill={`url(#chartGradient-${selectedNode.id})`} />

                  {/* Line */}
                  <polyline 
                      points={points} 
                      fill="none" 
                      stroke={strokeColor} 
                      strokeWidth="2"
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                      className="drop-shadow-[0_0_8px_currentColor]"
                  />
              </svg>
          </div>
      );
  };

  const showMonitoring = isCompute || isDatabase || isCache || isNoSQL;

  return (
    <div className="w-80 bg-slate-950/40 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl flex flex-col pointer-events-auto animate-[slideInRight_0.4s_cubic-bezier(0.23,1,0.32,1)] z-20 max-h-[70vh] overflow-hidden scanline relative">
      
      {/* Header */}
      <div className="p-6 border-b border-white/5 flex justify-between items-start bg-white/5 rounded-t-3xl shrink-0 relative z-10">
        <div className="flex items-center space-x-4">
            <div className="relative">
                <div className={`w-2.5 h-2.5 rounded-full ${selectedNode.status === 'active' ? 'bg-emerald-500 shadow-[0_0_12px_#10b981]' : 'bg-red-500 shadow-[0_0_12px_#ef4444]'} animate-pulse`}></div>
            </div>
            <div>
                <h2 className="text-xs font-black text-white tracking-[0.2em] uppercase">{NODE_LABELS[selectedNode.type]}</h2>
                <div className="text-[9px] text-slate-500 font-mono uppercase tracking-tighter">{selectedNode.id}</div>
            </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-full bg-white/5 text-slate-500 hover:text-white hover:bg-white/10 transition-all duration-300">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="p-6 flex-1 overflow-y-auto scrollbar-hide space-y-6 relative z-10">
        
        {/* RESOURCE MONITORING GRAPH */}
        {showMonitoring && selectedNode.loadHistory && renderMonitoringChart(selectedNode.loadHistory)}

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/5 p-4 rounded-2xl border border-white/5 transition-all hover:bg-white/10 group">
                <div className="text-[8px] text-slate-500 uppercase font-black tracking-widest mb-1 group-hover:text-slate-300 transition-colors">Utilization</div>
                <div className={`text-2xl font-mono font-black ${selectedNode.currentLoad > 90 ? 'text-red-400' : 'text-emerald-400'}`}>
                    {selectedNode.currentLoad.toFixed(0)}<span className="text-[10px] opacity-50 ml-0.5">%</span>
                </div>
            </div>
             <div className="bg-white/5 p-4 rounded-2xl border border-white/5 transition-all hover:bg-white/10 group">
                <div className="text-[8px] text-slate-500 uppercase font-black tracking-widest mb-1 group-hover:text-slate-300 transition-colors">OPEX</div>
                <div className="text-2xl font-mono font-black text-white">
                    <span className="opacity-40 text-xs">$</span>{selectedNode.tier ? COMPUTE_TIERS[selectedNode.tier].opex : selectedNode.cdnTier ? CDN_TIERS[selectedNode.cdnTier].opex : NODE_OPEX[selectedNode.type]}<span className="text-[9px] opacity-50 ml-0.5">/s</span>
                </div>
            </div>
        </div>

        {/* Database Role Selector */}
        {isDatabase && (
            <div>
                <div className="flex items-center space-x-2 mb-3">
                    <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Cluster Role</h3>
                    <div className="h-px flex-1 bg-white/5"></div>
                </div>
                <div className="flex p-1 bg-black/20 rounded-2xl border border-white/5">
                    <button
                        onClick={() => (window as any).gameScene?.externalSetDbRole(selectedNode.id, DbRole.PRIMARY)}
                        className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold transition-all duration-300 ${selectedNode.dbRole === DbRole.PRIMARY ? 'bg-brand-primary text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Primary
                    </button>
                    <button
                        onClick={() => (window as any).gameScene?.externalSetDbRole(selectedNode.id, DbRole.REPLICA)}
                        className={`flex-1 py-2.5 rounded-xl text-[10px] font-bold transition-all duration-300 ${selectedNode.dbRole === DbRole.REPLICA ? 'bg-brand-primary text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        Replica
                    </button>
                </div>
            </div>
        )}

        {/* Cache Stats */}
        {isCache && (
            <div className="mb-6 bg-pink-500/10 border border-pink-500/30 p-3 rounded-xl">
                <div className="flex justify-between items-end mb-1">
                    <div className="text-[9px] font-bold text-pink-400 uppercase tracking-widest">Hit Rate Efficiency</div>
                </div>
                
                <div className="text-2xl font-mono font-bold text-white flex items-baseline space-x-2">
                    <span>{((selectedNode.cacheHitRate || 0) * 100).toFixed(1)}%</span>
                </div>

                <div className="mt-2 w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                    <div className="h-full bg-pink-500 transition-all duration-300" style={{ width: `${(selectedNode.cacheHitRate || 0) * 100}%` }}></div>
                </div>
                
                <div className="text-[9px] text-slate-400 mt-2">
                    Warmed up by READs, poisoned by WRITEs.
                </div>
            </div>
        )}

        {/* CDN Stats */}
        {isCDN && (
            <div className="mb-6 bg-teal-500/10 border border-teal-500/30 p-3 rounded-xl">
                <div className="flex justify-between items-end mb-1">
                    <div className="text-[9px] font-bold text-teal-400 uppercase tracking-widest">Cache Efficiency</div>
                    {currentCdnTier && (
                        <div className="text-[9px] text-teal-300/50">Max: {(currentCdnTier.maxHitRate * 100).toFixed(0)}%</div>
                    )}
                </div>
                
                <div className="text-2xl font-mono font-bold text-white flex items-baseline space-x-2">
                    <span>{((selectedNode.cacheHitRate || 0) * 100).toFixed(1)}%</span>
                </div>
                
                {selectedNode.cacheHitRate && currentCdnTier && (selectedNode.cacheHitRate < currentCdnTier.maxHitRate * 0.9) ? (
                    <div className="text-[9px] text-teal-300 mt-1 flex items-center">
                        <span className="animate-spin mr-1">⟳</span> Warming up cache...
                    </div>
                ) : (
                    <div className="text-[9px] text-slate-400 mt-1">
                        Optimal performance reached
                    </div>
                )}
            </div>
        )}

        {/* Connections List */}
        <div>
            <div className="flex items-center space-x-2 mb-3">
                <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Network Topology</h3>
                <div className="h-px flex-1 bg-white/5"></div>
            </div>
            
            {outgoing.length === 0 && incoming.length === 0 && (
                <div className="text-[10px] text-slate-600 italic text-center py-4 bg-white/5 rounded-2xl border border-white/5 border-dashed uppercase tracking-widest">Isolated Node</div>
            )}

            <div className="space-y-4">
                {/* Outgoing */}
                {outgoing.length > 0 && (
                     <div className="space-y-2">
                         <div className="text-[8px] text-slate-600 font-black px-1 uppercase tracking-widest">Downstream</div>
                         {outgoing.map(c => <ConnectionItem key={c.id} id={c.targetId} isOutgoing={true} />)}
                     </div>
                )}
                
                {/* Incoming */}
                {incoming.length > 0 && (
                     <div className="space-y-2">
                         <div className="text-[8px] text-slate-600 font-black px-1 uppercase tracking-widest">Upstream</div>
                         {incoming.map(c => <ConnectionItem key={c.id} id={c.sourceId} isOutgoing={false} />)}
                     </div>
                )}
            </div>
        </div>

        {/* Load Balancer Algorithm Settings */}
        {isLoadBalancer && (
            <div>
                <div className="flex items-center space-x-2 mb-3">
                    <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Distribution Policy</h3>
                    <div className="h-px flex-1 bg-white/5"></div>
                </div>
                
                <div className="relative group">
                    <select
                        value={selectedNode.algorithm || LoadBalancerAlgo.ROUND_ROBIN}
                        onChange={(e) => onAlgorithmChange(selectedNode.id, e.target.value as LoadBalancerAlgo)}
                        className="w-full bg-white/5 border border-white/10 text-slate-200 text-[11px] rounded-2xl px-4 py-3 outline-none focus:border-brand-primary/50 appearance-none cursor-pointer hover:bg-white/10 transition-all duration-300"
                    >
                        <option value={LoadBalancerAlgo.ROUND_ROBIN}>Round Robin</option>
                        <option value={LoadBalancerAlgo.WEIGHTED_ROUND_ROBIN}>Weighted Round Robin</option>
                        <option value={LoadBalancerAlgo.RANDOM}>Random Selection</option>
                        <option value={LoadBalancerAlgo.LEAST_CONNECTION}>Least Connections</option>
                        <option value={LoadBalancerAlgo.WEIGHTED_LEAST_CONNECTION}>Weighted Least Conn.</option>
                        <option value={LoadBalancerAlgo.LEAST_RESPONSE_TIME}>Least Response Time</option>
                    </select>
                    <div className="absolute right-4 top-3.5 pointer-events-none text-slate-500 group-hover:text-white transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                </div>
            </div>
        )}

        {/* Compute Upgrades */}
        {isCompute && currentTier && (
          <div>
            <div className="flex items-center space-x-2 mb-3">
                <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Vertical Scaling</h3>
                <div className="h-px flex-1 bg-white/5"></div>
            </div>
            
            <div className="space-y-2">
              {Object.keys(COMPUTE_TIERS).map((tierKey) => {
                const tier = tierKey as ComputeTier;
                const config = COMPUTE_TIERS[tier];
                const isCurrent = tier === selectedNode.tier;
                const cost = config.capex;
                const affordable = canAfford(cost);
                
                if (config.capacity < currentTier.capacity) return null;

                return (
                  <button
                    key={tier}
                    onClick={() => onUpgrade(selectedNode.id, tier)}
                    disabled={isCurrent || selectedNode.isUpgrading || !affordable}
                    className={`
                      w-full flex items-center justify-between p-3.5 rounded-2xl text-[11px] border transition-all duration-300 relative overflow-hidden group
                      ${isCurrent 
                        ? 'bg-brand-primary/20 border-brand-primary/50 text-white cursor-default'
                        : affordable 
                          ? 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20 text-slate-300'
                          : 'bg-black/20 border-transparent text-slate-600 cursor-not-allowed grayscale'
                      }
                    `}
                  >
                    <div className="flex flex-col text-left relative z-10">
                        <span className="font-bold">{config.name} Node</span>
                        <span className="text-[9px] opacity-50 mt-0.5 tracking-tight">{config.cpus} vCPU • {config.ram} • {config.capacity} req/s</span>
                    </div>
                    <div className="text-right relative z-10">
                         {isCurrent ? (
                             <span className="text-brand-primary font-black text-[9px] tracking-widest">ACTIVE</span>
                         ) : (
                             <div className="font-mono font-bold text-white bg-black/40 px-2 py-1 rounded-lg border border-white/5">
                                ${cost}
                             </div>
                         )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* CDN Upgrades */}
        {isCDN && currentCdnTier && (
          <div>
            <div className="flex items-center space-x-2 mb-3">
                <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em]">Edge Performance</h3>
                <div className="h-px flex-1 bg-white/5"></div>
            </div>
            
            <div className="space-y-2">
              {Object.keys(CDN_TIERS).map((tierKey) => {
                const tier = tierKey as CdnTier;
                const config = CDN_TIERS[tier];
                const isCurrent = tier === selectedNode.cdnTier;
                const cost = config.capex;
                const affordable = canAfford(cost);
                
                if (config.capacity < currentCdnTier.capacity) return null;

                return (
                  <button
                    key={tier}
                    onClick={() => onUpgrade(selectedNode.id, tier)}
                    disabled={isCurrent || selectedNode.isUpgrading || !affordable}
                    className={`
                      w-full flex items-center justify-between p-3.5 rounded-2xl text-[11px] border transition-all duration-300 relative overflow-hidden group
                      ${isCurrent 
                        ? 'bg-emerald-500/20 border-emerald-500/50 text-white cursor-default'
                        : affordable 
                          ? 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/20 text-slate-300'
                          : 'bg-black/20 border-transparent text-slate-600 cursor-not-allowed grayscale'
                      }
                    `}
                  >
                    <div className="flex flex-col text-left relative z-10">
                        <span className="font-bold">{config.name}</span>
                        <span className="text-[9px] opacity-50 mt-0.5 tracking-tight">{(config.maxHitRate * 100).toFixed(0)}% Efficiency • {config.capacity} req/s</span>
                    </div>
                    <div className="text-right relative z-10">
                         {isCurrent ? (
                             <span className="text-emerald-400 font-black text-[9px] tracking-widest">ACTIVE</span>
                         ) : (
                             <div className="font-mono font-bold text-white bg-black/40 px-2 py-1 rounded-lg border border-white/5">
                                ${cost}
                             </div>
                         )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="pt-4">
           <button 
             onClick={() => onDelete(selectedNode.id)}
             className="w-full py-4 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-2xl font-black text-[10px] tracking-[0.2em] transition-all duration-300 flex items-center justify-center space-x-3 group uppercase"
           >
             <svg className="w-4 h-4 transition-transform group-hover:scale-125" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
             <span>Terminate Instance</span>
           </button>
        </div>
      </div>
    </div>
  );
};

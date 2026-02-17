
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
          <div className="flex items-center justify-between p-2 rounded-lg bg-slate-800/40 border border-white/5 text-xs">
              <div className="flex items-center space-x-2 overflow-hidden">
                  <div className={`w-1.5 h-1.5 rounded-full bg-${colorBase}-400 shrink-0`}></div>
                  <div className="flex flex-col truncate">
                      <span className="font-bold text-slate-300">{info.type}</span>
                      <span className="text-[9px] text-slate-500 truncate">{info.id}</span>
                  </div>
              </div>
              {isOutgoing && (
                  <button 
                    onClick={() => onUnlink(selectedNode.id, id)}
                    className="ml-2 text-slate-500 hover:text-red-400 p-1 rounded hover:bg-white/5 transition-colors"
                    title="Unlink"
                  >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
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
          <div className="mt-4 mb-2 p-3 bg-slate-950/50 rounded-xl border border-white/5 relative overflow-hidden">
              <div className="flex justify-between items-center mb-2">
                   <div className="flex items-center space-x-2">
                        <div className={`w-1.5 h-1.5 rounded-full`} style={{backgroundColor: strokeColor}}></div>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">CPU Utilization</span>
                   </div>
                   <span className="text-[10px] font-mono text-white">{latest.toFixed(1)}%</span>
              </div>
              
              <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
                  {/* Grid lines */}
                  <line x1="0" y1={height * 0.25} x2={width} y2={height * 0.25} stroke="#334155" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.3" />
                  <line x1="0" y1={height * 0.5} x2={width} y2={height * 0.5} stroke="#334155" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.3" />
                  <line x1="0" y1={height * 0.75} x2={width} y2={height * 0.75} stroke="#334155" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.3" />

                  {/* Gradient Defs */}
                  <defs>
                      <linearGradient id="chartGradient" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.2" />
                          <stop offset="100%" stopColor={strokeColor} stopOpacity="0" />
                      </linearGradient>
                  </defs>

                  {/* Area Fill */}
                  <polygon points={fillPath} fill="url(#chartGradient)" />

                  {/* Line */}
                  <polyline 
                      points={points} 
                      fill="none" 
                      stroke={strokeColor} 
                      strokeWidth="1.5" 
                      strokeLinecap="round" 
                      strokeLinejoin="round" 
                  />
              </svg>
          </div>
      );
  };

  const showMonitoring = isCompute || isDatabase || isCache || isNoSQL;

  return (
    <div className="absolute top-24 right-4 bottom-auto w-80 bg-slate-900/90 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl flex flex-col pointer-events-auto animate-[slideInRight_0.3s_ease-out] z-20 max-h-[80vh]">
      
      {/* Header */}
      <div className="p-5 border-b border-white/5 flex justify-between items-start bg-white/5 rounded-t-2xl shrink-0">
        <div className="flex items-center space-x-3">
            <div className={`w-2 h-2 rounded-full ${selectedNode.status === 'active' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 'bg-red-500 shadow-[0_0_8px_#ef4444]'} animate-pulse`}></div>
            <div>
                <h2 className="text-base font-bold text-white tracking-tight">{selectedNode.type}</h2>
                <div className="text-[10px] text-brand-primary font-mono opacity-75 uppercase tracking-wider">{selectedNode.id}</div>
            </div>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="p-5 flex-1 overflow-y-auto scrollbar-thin">
        
        {/* RESOURCE MONITORING GRAPH */}
        {showMonitoring && selectedNode.loadHistory && renderMonitoringChart(selectedNode.loadHistory)}

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-3 mb-6">
            <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 relative overflow-hidden group">
                <div className="absolute inset-0 bg-brand-primary/5 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                <div className="relative z-10">
                    <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Load</div>
                    <div className={`text-xl font-mono font-bold mt-1 ${selectedNode.currentLoad > 90 ? 'text-brand-danger' : 'text-white'}`}>
                        {selectedNode.currentLoad.toFixed(0)}%
                    </div>
                </div>
            </div>
             <div className="bg-slate-800/50 p-3 rounded-xl border border-white/5 relative overflow-hidden group">
                <div className="absolute inset-0 bg-brand-primary/5 scale-x-0 group-hover:scale-x-100 transition-transform origin-left"></div>
                <div className="relative z-10">
                    <div className="text-[9px] text-slate-500 uppercase font-bold tracking-wider">Opex</div>
                    <div className="text-xl font-mono font-bold text-white mt-1">
                        ${selectedNode.tier ? COMPUTE_TIERS[selectedNode.tier].opex : selectedNode.cdnTier ? CDN_TIERS[selectedNode.cdnTier].opex : NODE_OPEX[selectedNode.type]}<span className="text-xs text-slate-500 font-normal">/s</span>
                    </div>
                </div>
            </div>
        </div>

        {/* Database Role Selector */}
        {isDatabase && (
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3 px-1">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Cluster Role</h3>
                </div>
                <div className="flex space-x-2">
                    <button
                        onClick={() => (window as any).gameScene?.externalSetDbRole(selectedNode.id, DbRole.PRIMARY)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${selectedNode.dbRole === DbRole.PRIMARY ? 'bg-amber-500/20 border-amber-500 text-amber-200 shadow-[0_0_10px_rgba(245,158,11,0.2)]' : 'bg-slate-800/50 border-white/5 text-slate-400 hover:bg-slate-700'}`}
                    >
                        Primary (RW)
                    </button>
                    <button
                        onClick={() => (window as any).gameScene?.externalSetDbRole(selectedNode.id, DbRole.REPLICA)}
                        className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${selectedNode.dbRole === DbRole.REPLICA ? 'bg-blue-500/20 border-blue-500 text-blue-200 shadow-[0_0_10px_rgba(59,130,246,0.2)]' : 'bg-slate-800/50 border-white/5 text-slate-400 hover:bg-slate-700'}`}
                    >
                        Replica (RO)
                    </button>
                </div>
                <div className="mt-2 text-[10px] text-slate-500 px-1">
                    {selectedNode.dbRole === DbRole.PRIMARY 
                        ? "Handles Writes and Reads. Vulnerable to write saturation." 
                        : "Handles Reads only. Relieves pressure from Primary."}
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
        <div className="mb-6">
            <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Connections</h3>
            </div>
            
            {outgoing.length === 0 && incoming.length === 0 && (
                <div className="text-xs text-slate-600 italic text-center py-2 border border-white/5 rounded-lg border-dashed">No active links</div>
            )}

            <div className="space-y-2">
                {/* Outgoing */}
                {outgoing.length > 0 && (
                     <div className="space-y-1">
                         <div className="text-[9px] text-slate-500 font-bold px-1 uppercase">Outgoing (Downstream)</div>
                         {outgoing.map(c => <ConnectionItem key={c.id} id={c.targetId} isOutgoing={true} />)}
                     </div>
                )}
                
                {/* Incoming */}
                {incoming.length > 0 && (
                     <div className="space-y-1 mt-2">
                         <div className="text-[9px] text-slate-500 font-bold px-1 uppercase">Incoming (Upstream)</div>
                         {incoming.map(c => <ConnectionItem key={c.id} id={c.sourceId} isOutgoing={false} />)}
                     </div>
                )}
            </div>
        </div>

        {/* Load Balancer Algorithm Settings */}
        {isLoadBalancer && (
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3 px-1">
                    <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Algorithm</h3>
                </div>
                
                <div className="relative">
                    <select
                        value={selectedNode.algorithm || LoadBalancerAlgo.ROUND_ROBIN}
                        onChange={(e) => onAlgorithmChange(selectedNode.id, e.target.value as LoadBalancerAlgo)}
                        className="w-full bg-slate-800/50 border border-white/10 text-slate-200 text-xs rounded-lg px-3 py-2 outline-none focus:border-brand-primary appearance-none cursor-pointer hover:bg-slate-700/50 transition-colors"
                    >
                        <option value={LoadBalancerAlgo.ROUND_ROBIN}>Round Robin</option>
                        <option value={LoadBalancerAlgo.WEIGHTED_ROUND_ROBIN}>Weighted Round Robin</option>
                        <option value={LoadBalancerAlgo.RANDOM}>Random</option>
                        <option value={LoadBalancerAlgo.LEAST_CONNECTION}>Least Connections</option>
                        <option value={LoadBalancerAlgo.WEIGHTED_LEAST_CONNECTION}>Weighted Least Conn.</option>
                        <option value={LoadBalancerAlgo.LEAST_RESPONSE_TIME}>Least Response Time</option>
                    </select>
                    <div className="absolute right-3 top-2.5 pointer-events-none text-slate-500">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                    </div>
                </div>

                <div className="mt-3 p-3 bg-slate-900/50 rounded-lg border border-white/5">
                    <div className="text-[10px] text-slate-400">
                        {selectedNode.algorithm === LoadBalancerAlgo.ROUND_ROBIN && "Distributes traffic sequentially."}
                        {selectedNode.algorithm === LoadBalancerAlgo.WEIGHTED_ROUND_ROBIN && "Distributes based on node capacity (Tier)."}
                        {selectedNode.algorithm === LoadBalancerAlgo.RANDOM && "Randomly selects available nodes."}
                        {selectedNode.algorithm === LoadBalancerAlgo.LEAST_CONNECTION && "Sends traffic to the node with the lowest % Load."}
                        {selectedNode.algorithm === LoadBalancerAlgo.WEIGHTED_LEAST_CONNECTION && "Optimizes for lowest Load relative to Capacity."}
                        {selectedNode.algorithm === LoadBalancerAlgo.LEAST_RESPONSE_TIME && "Predicts latency and routes to fastest responder."}
                    </div>
                </div>
            </div>
        )}

        {/* Compute Upgrades */}
        {isCompute && currentTier && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Scaling</h3>
                <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded">{currentTier.name}</span>
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
                      w-full flex items-center justify-between p-3 rounded-xl text-xs border transition-all relative overflow-hidden
                      ${isCurrent 
                        ? 'bg-brand-primary/20 border-brand-primary text-white cursor-default' 
                        : affordable 
                          ? 'bg-slate-800/50 border-white/5 hover:bg-slate-700 hover:border-white/20 text-slate-300' 
                          : 'bg-slate-900/50 border-transparent text-slate-600 cursor-not-allowed grayscale'
                      }
                    `}
                  >
                    <div className="flex flex-col text-left relative z-10">
                        <span className="font-bold text-sm">{config.name}</span>
                        <span className="text-[10px] opacity-70 mt-0.5">{config.cpus} CPU • {config.ram} • {config.capacity} req/s</span>
                    </div>
                    <div className="text-right relative z-10">
                         {isCurrent ? (
                             <span className="text-brand-primary font-bold text-[10px] tracking-wider">ACTIVE</span>
                         ) : (
                             <>
                                <div className="font-mono font-bold">${cost}</div>
                             </>
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
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Edge Configuration</h3>
                <span className="text-[10px] text-slate-500 bg-slate-800 px-2 py-0.5 rounded">{currentCdnTier.name}</span>
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
                      w-full flex items-center justify-between p-3 rounded-xl text-xs border transition-all relative overflow-hidden
                      ${isCurrent 
                        ? 'bg-teal-500/20 border-teal-500 text-white cursor-default' 
                        : affordable 
                          ? 'bg-slate-800/50 border-white/5 hover:bg-slate-700 hover:border-white/20 text-slate-300' 
                          : 'bg-slate-900/50 border-transparent text-slate-600 cursor-not-allowed grayscale'
                      }
                    `}
                  >
                    <div className="flex flex-col text-left relative z-10">
                        <span className="font-bold text-sm">{config.name}</span>
                        <span className="text-[10px] opacity-70 mt-0.5">{(config.maxHitRate * 100).toFixed(0)}% MAX HIT RATIO • {config.capacity} req/s</span>
                    </div>
                    <div className="text-right relative z-10">
                         {isCurrent ? (
                             <span className="text-teal-400 font-bold text-[10px] tracking-wider">ACTIVE</span>
                         ) : (
                             <>
                                <div className="font-mono font-bold">${cost}</div>
                             </>
                         )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="mt-8 pt-6 border-t border-white/10">
           <button 
             onClick={() => onDelete(selectedNode.id)}
             className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 hover:border-red-500/50 rounded-xl font-bold text-xs tracking-wider transition-all flex items-center justify-center space-x-2"
           >
             <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
             <span>DECOMMISSION</span>
           </button>
        </div>
      </div>
    </div>
  );
};

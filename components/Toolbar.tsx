
import React from 'react';
import { NodeType, ComputeTier } from '../types';
import { NODE_LABELS, NODE_COSTS, NODE_COLORS, COMPUTE_TIERS } from '../constants';

interface ToolbarProps {
  onAddNode: (type: NodeType) => void;
  canAfford: (cost: number) => boolean;
  isOpen: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({ onAddNode, canAfford, isOpen }) => {
  const categories = [
    { title: "Security", items: [NodeType.WAF, NodeType.FIREWALL] },
    { title: "Network", items: [NodeType.CDN, NodeType.LOAD_BALANCER, NodeType.API_GATEWAY] },
    { title: "Compute", items: [NodeType.COMPUTE] },
    { title: "Data", items: [NodeType.CACHE, NodeType.DATABASE, NodeType.DATABASE_NOSQL, NodeType.STORAGE] },
  ];

  return (
    <div 
        className={`
            absolute top-24 bottom-24 left-4 w-72 
            bg-slate-900/80 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl 
            flex flex-col z-20 pointer-events-auto transition-transform duration-300 ease-out origin-left
            ${isOpen ? 'translate-x-0 opacity-100' : '-translate-x-[120%] opacity-0'}
        `}
    >
      <div className="p-5 border-b border-white/5 bg-white/5 rounded-t-2xl">
        <h2 className="text-sm font-bold text-white tracking-widest uppercase font-sans flex items-center">
            <svg className="w-4 h-4 mr-2 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            Resources
        </h2>
      </div>
      
      <div className="flex-1 p-4 space-y-6 overflow-y-auto scrollbar-hide">
        {categories.map((cat) => (
          <div key={cat.title}>
            <div className="flex items-center space-x-2 mb-3 px-1">
                <div className="h-px w-3 bg-slate-600"></div>
                <h3 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{cat.title}</h3>
                <div className="h-px flex-1 bg-slate-600/30"></div>
            </div>
            
            <div className="space-y-2">
              {cat.items.map((type) => {
                const colorBase = NODE_COLORS[type].split('-')[1];

                // Special handling for Compute to show Tiers
                if (type === NodeType.COMPUTE) {
                    return Object.entries(COMPUTE_TIERS).map(([tierKey, config]) => {
                        const tier = tierKey as ComputeTier;
                        const cost = config.capex;
                        const affordable = canAfford(cost);

                        return (
                             <div
                                key={`${type}-${tier}`}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('nodeType', type);
                                  e.dataTransfer.setData('nodeTier', tier);
                                }}
                                // Note: Click add not fully supported for tiered yet via click, requires modal or default
                                // For now we keep drag-drop as primary
                                className={`
                                  group relative w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all duration-200 overflow-hidden
                                  ${affordable 
                                    ? 'bg-slate-800/40 hover:bg-slate-700/60 cursor-grab active:cursor-grabbing border-white/5 hover:border-white/20 hover:shadow-lg' 
                                    : 'bg-slate-900/40 opacity-50 cursor-not-allowed border-transparent grayscale'
                                  }
                                `}
                              >
                                <div className={`absolute inset-0 bg-gradient-to-r from-${colorBase}-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity`}></div>
            
                                <div className="relative z-10">
                                  <div className={`text-xs font-bold ${affordable ? 'text-slate-200' : 'text-slate-500'} group-hover:text-white transition-colors`}>
                                    Compute ({config.name})
                                  </div>
                                  <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                    CAPEX: <span className={affordable ? "text-slate-300" : "text-red-400"}>${cost}</span>
                                  </div>
                                </div>
                                
                                <div className={`
                                    relative z-10 w-6 h-6 rounded-lg flex items-center justify-center border border-white/10 bg-slate-900
                                    shadow-glow text-${colorBase}-400
                                `}>
                                     <span className="text-[9px] font-bold">{config.name[0]}</span>
                                </div>
                              </div>
                        );
                    });
                }

                // Standard Nodes
                const cost = NODE_COSTS[type];
                const affordable = canAfford(cost);

                return (
                  <div
                    key={type}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('nodeType', type);
                    }}
                    onClick={() => affordable && onAddNode(type)}
                    className={`
                      group relative w-full flex items-center justify-between p-3 rounded-xl border text-left transition-all duration-200 overflow-hidden
                      ${affordable 
                        ? 'bg-slate-800/40 hover:bg-slate-700/60 cursor-grab active:cursor-grabbing border-white/5 hover:border-white/20 hover:shadow-lg' 
                        : 'bg-slate-900/40 opacity-50 cursor-not-allowed border-transparent grayscale'
                      }
                    `}
                  >
                    <div className={`absolute inset-0 bg-gradient-to-r from-${colorBase}-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity`}></div>

                    <div className="relative z-10">
                      <div className={`text-xs font-bold ${affordable ? 'text-slate-200' : 'text-slate-500'} group-hover:text-white transition-colors`}>
                        {NODE_LABELS[type]}
                      </div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                        CAPEX: <span className={affordable ? "text-slate-300" : "text-red-400"}>${cost}</span>
                      </div>
                    </div>
                    
                    <div className={`
                        relative z-10 w-6 h-6 rounded-lg flex items-center justify-center border border-white/10 bg-slate-900
                        shadow-glow text-${colorBase}-400
                    `}>
                         <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M12 4v16m8-8H4"/></svg>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="p-4 text-[10px] text-center text-slate-600 border-t border-white/5">
        Drag and drop to deploy
      </div>
    </div>
  );
};

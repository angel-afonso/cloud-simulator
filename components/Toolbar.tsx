
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
            absolute top-24 bottom-24 left-4 w-64
            bg-slate-950/40 backdrop-blur-md border border-white/10 rounded-3xl shadow-2xl
            flex flex-col z-20 pointer-events-auto transition-all duration-500 ease-[cubic-bezier(0.23,1,0.32,1)]
            ${isOpen ? 'translate-x-0 opacity-100' : '-translate-x-[110%] opacity-0 pointer-events-none'}
        `}
    >
      <div className="p-6 border-b border-white/5 bg-white/5 rounded-t-3xl">
        <div className="flex items-center justify-between">
            <h2 className="text-[10px] font-black text-white tracking-[0.3em] uppercase opacity-70">
                Components
            </h2>
            <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse"></div>
        </div>
      </div>
      
      <div className="flex-1 p-4 space-y-8 overflow-y-auto scrollbar-hide">
        {categories.map((cat) => (
          <div key={cat.title}>
            <div className="flex items-center space-x-3 mb-4 px-3">
                <div className="w-1.5 h-[1px] bg-brand-primary/50"></div>
                <h3 className="text-[9px] font-black text-slate-500 uppercase tracking-[0.2em] shrink-0">{cat.title}</h3>
                <div className="h-px flex-1 bg-white/5"></div>
            </div>
            
            <div className="grid grid-cols-1 gap-2">
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
                                className={`
                                  group relative w-full flex items-center space-x-3 p-2.5 rounded-2xl border transition-all duration-300
                                  ${affordable 
                                    ? 'bg-white/5 hover:bg-white/10 cursor-grab active:cursor-grabbing border-white/5 hover:border-white/20'
                                    : 'bg-black/20 opacity-40 cursor-not-allowed border-transparent grayscale'
                                  }
                                `}
                              >
                                <div className={`
                                    w-8 h-8 rounded-xl flex items-center justify-center border border-white/10 bg-slate-900/50
                                    text-${colorBase}-400 group-hover:scale-110 transition-transform duration-300
                                `}>
                                     <span className="text-[10px] font-black">{config.name[0]}</span>
                                </div>

                                <div className="flex-1 min-w-0">
                                  <div className={`text-[11px] font-bold truncate ${affordable ? 'text-slate-200' : 'text-slate-500'}`}>
                                    {config.name} Node
                                  </div>
                                  <div className="text-[9px] text-slate-500 font-mono">
                                    ${cost}
                                  </div>
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
                      group relative w-full flex items-center space-x-3 p-2.5 rounded-2xl border transition-all duration-300
                      ${affordable 
                        ? 'bg-white/5 hover:bg-white/10 cursor-grab active:cursor-grabbing border-white/5 hover:border-white/20'
                        : 'bg-black/20 opacity-40 cursor-not-allowed border-transparent grayscale'
                      }
                    `}
                  >
                    <div className={`
                        w-8 h-8 rounded-xl flex items-center justify-center border border-white/10 bg-slate-900/50
                        text-${colorBase}-400 group-hover:scale-110 transition-transform duration-300
                    `}>
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                         </svg>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className={`text-[11px] font-bold truncate ${affordable ? 'text-slate-200' : 'text-slate-500'}`}>
                        {NODE_LABELS[type]}
                      </div>
                      <div className="text-[9px] text-slate-500 font-mono">
                        ${cost}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="p-6 flex items-center justify-center space-x-2 bg-white/5 rounded-b-3xl">
          <div className="w-1 h-1 rounded-full bg-slate-600"></div>
          <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest">Deploy via drag-drop</span>
          <div className="w-1 h-1 rounded-full bg-slate-600"></div>
      </div>
    </div>
  );
};

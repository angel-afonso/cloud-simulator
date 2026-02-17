
import React from 'react';
import { TECH_TREE } from '../constants';

interface ResearchPanelProps {
  unlockedTech: string[];
  techPoints: number;
  onUnlock: (techId: string) => void;
  isOpen: boolean;
  onClose: () => void;
}

export const ResearchPanel: React.FC<ResearchPanelProps> = ({
    unlockedTech, techPoints, onUnlock, isOpen, onClose
}) => {
    if (!isOpen) return null;

    return (
        <div className="absolute inset-0 z-50 flex items-center justify-center p-8 bg-slate-950/60 backdrop-blur-md animate-in fade-in duration-300">
            <div className="relative w-full max-w-4xl bg-slate-900 border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden flex flex-col">

                {/* Header */}
                <div className="p-8 border-b border-white/5 bg-white/5 flex items-center justify-between">
                    <div>
                        <h2 className="text-2xl font-black text-white tracking-tight">Innovation & Research</h2>
                        <p className="text-slate-400 text-sm mt-1">Unlock advanced cloud capabilities using Innovation Points.</p>
                    </div>
                    <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.2em]">Available Innovation</span>
                        <span className="text-3xl font-mono font-black text-white">{Math.floor(techPoints)}</span>
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto">
                    {TECH_TREE.map(tech => {
                        const isUnlocked = unlockedTech.includes(tech.id);
                        const canAfford = techPoints >= tech.cost;

                        return (
                            <div
                                key={tech.id}
                                className={`
                                    relative p-5 rounded-2xl border transition-all duration-300 flex flex-col
                                    ${isUnlocked
                                        ? 'bg-brand-primary/10 border-brand-primary shadow-[0_0_20px_rgba(99,102,241,0.1)]'
                                        : (canAfford ? 'bg-white/5 border-white/10 hover:border-white/20' : 'bg-black/20 border-white/5 opacity-60')}
                                `}
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className={`
                                        p-2 rounded-lg text-[10px] font-black uppercase tracking-widest
                                        ${isUnlocked ? 'bg-brand-primary text-white' : 'bg-white/5 text-slate-500'}
                                    `}>
                                        {tech.category}
                                    </div>
                                    {!isUnlocked && (
                                        <div className="flex items-center space-x-1">
                                            <div className="w-1.5 h-1.5 rounded-full bg-brand-primary"></div>
                                            <span className="text-xs font-mono font-bold text-white">{tech.cost}</span>
                                        </div>
                                    )}
                                </div>

                                <h3 className="font-bold text-white mb-1">{tech.name}</h3>
                                <p className="text-[11px] text-slate-400 flex-1">{tech.description}</p>

                                <button
                                    disabled={isUnlocked || !canAfford}
                                    onClick={() => onUnlock(tech.id)}
                                    className={`
                                        mt-4 w-full py-2.5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] transition-all
                                        ${isUnlocked
                                            ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                                            : (canAfford
                                                ? 'bg-white text-slate-950 hover:bg-brand-primary hover:text-white'
                                                : 'bg-white/5 text-slate-500 cursor-not-allowed')}
                                    `}
                                >
                                    {isUnlocked ? 'Researched' : (canAfford ? 'Unlock' : 'Low Innovation')}
                                </button>
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="p-6 bg-white/5 border-t border-white/5 flex justify-center">
                    <button
                        onClick={onClose}
                        className="px-8 py-3 bg-white/10 hover:bg-white/20 text-white rounded-full text-xs font-bold transition-all"
                    >
                        Back to Architecture
                    </button>
                </div>

                {/* Close absolute */}
                <button
                    onClick={onClose}
                    className="absolute top-6 right-6 p-2 text-slate-500 hover:text-white transition-colors"
                >
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>
        </div>
    );
};

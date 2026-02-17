
import React from 'react';

interface GameOverOverlayProps {
    reason: 'bankruptcy' | 'satisfaction';
    onRestart: () => void;
}

export const GameOverOverlay: React.FC<GameOverOverlayProps> = ({ reason, onRestart }) => {
    return (
        <div className="absolute inset-0 z-[100] flex items-center justify-center p-8 bg-black/80 backdrop-blur-xl animate-in fade-in duration-500">
            <div className="max-w-md w-full bg-slate-900 border border-red-500/30 rounded-[2.5rem] p-10 shadow-[0_0_50px_rgba(239,68,68,0.2)] text-center">
                <div className="w-20 h-20 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-red-500/20">
                    <svg className="w-10 h-10 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>

                <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-tight">System Collapse</h2>
                <p className="text-slate-400 text-sm mb-8">
                    {reason === 'bankruptcy'
                        ? "Your cloud budget has been completely exhausted. The provider has terminated your account."
                        : "User satisfaction has dropped to zero. Your customers have migrated to a competitor."}
                </p>

                <div className="space-y-3">
                    <button
                        onClick={onRestart}
                        className="w-full py-4 bg-red-600 hover:bg-red-500 text-white rounded-2xl font-black uppercase tracking-widest transition-all shadow-lg shadow-red-600/20"
                    >
                        Re-provision Environment
                    </button>
                </div>
            </div>
        </div>
    );
};

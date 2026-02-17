
import React, { useState, useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { NodeType, ComputeTier, GameMetrics, NodeData, RequestType, LoadBalancerAlgo, Connection, ResponseCode } from './types';
import { MainScene } from './game/MainScene';
import { Toolbar } from './components/Toolbar';
import { StatsPanel } from './components/StatsPanel';
import { PropertyPanel } from './components/PropertyPanel';

export default function App() {
  const gameRef = useRef<Phaser.Game | null>(null);
  const sceneRef = useRef<MainScene | null>(null);

  // Game State - Initialize speed to 0 (Paused)
  const [metrics, setMetrics] = useState<GameMetrics>({
    cash: 5000,
    revenuePerSec: 0,
    opexPerSec: 0,
    uptime: 100,
    userSatisfaction: 100,
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    latencyMs: 20,
    p95LatencyMs: 20,
    activeUsers: 100,
    isUnderAttack: false,
    attackTimeLeft: 0,
    requestsByType: {
      [RequestType.WEB]: { successful: 0, failed: 0 },
      [RequestType.DB_READ]: { successful: 0, failed: 0 },
      [RequestType.DB_WRITE]: { successful: 0, failed: 0 },
      [RequestType.DB_SEARCH]: { successful: 0, failed: 0 },
      [RequestType.STATIC]: { successful: 0, failed: 0 },
      [RequestType.ATTACK]: { successful: 0, failed: 0 },
    },
    responseCodes: {
      [ResponseCode.HTTP_200]: 0,
      [ResponseCode.HTTP_403]: 0,
      [ResponseCode.HTTP_429]: 0,
      [ResponseCode.HTTP_500]: 0,
      [ResponseCode.HTTP_503]: 0,
    }
  });
  
  const [selectedNode, setSelectedNode] = useState<NodeData | null>(null);
  const [nodes, setNodes] = useState<NodeData[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);

  const [gameSpeed, setGameSpeed] = useState<number>(0);
  const [isConnectionMode, setIsConnectionMode] = useState<boolean>(false);
  
  // UI State
  const [isBuildMenuOpen, setIsBuildMenuOpen] = useState<boolean>(false);

  useEffect(() => {
    if (gameRef.current) return;

    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      parent: 'phaser-container',
      transparent: true,
      width: '100%',
      height: '100%',
      scene: [MainScene],
      physics: { default: 'arcade' },
      scale: {
        mode: Phaser.Scale.RESIZE,
        autoCenter: Phaser.Scale.NO_CENTER
      }
    };

    const game = new Phaser.Game(config);
    gameRef.current = game;

    game.events.once('ready', () => {
       const scene = game.scene.getScene('MainScene') as MainScene;
       sceneRef.current = scene;
       
       // Expose for property panel (React <-> Phaser bridge hack)
       (window as any).gameScene = scene;

       scene.onMetricsUpdate = (newMetrics) => setMetrics(newMetrics);
       scene.onNodeSelect = (nodeId) => {
         if (!nodeId) {
           setSelectedNode(null);
         } else {
           const n = scene.getSelectedNode();
           if (n) setSelectedNode({...n});
         }
       };

       // Initial state setup
       setNodes(scene.nodes);
       setConnections(scene.connections);

       scene.onGraphUpdate = (newNodes, newConnections) => {
          setNodes(newNodes);
          setConnections(newConnections);
          // Also refresh selected node if it changed (e.g. status update)
          const n = scene.getSelectedNode();
          if (n) setSelectedNode({...n});
       };

       // Set initial speed (0)
       scene.setSpeed(gameSpeed);
       scene.setConnectionMode(isConnectionMode);
    });

    return () => {
      game.destroy(true);
      gameRef.current = null;
      (window as any).gameScene = null;
    };
  }, []);

  // Poll for selected node stats update (to show realtime cache warming)
  useEffect(() => {
    const interval = setInterval(() => {
        if (sceneRef.current && sceneRef.current.getSelectedNode()) {
            const n = sceneRef.current.getSelectedNode();
            if (n) setSelectedNode({...n});
        }
    }, 250); // 4 times a second
    return () => clearInterval(interval);
  }, []);

  // --- Handlers ---

  const handleAddNode = (type: NodeType) => {
      if (sceneRef.current) {
          const cam = sceneRef.current.cameras.main;
          sceneRef.current.externalAddNode(type, cam.scrollX + cam.width/2, cam.scrollY + cam.height/2);
      }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const type = e.dataTransfer.getData('nodeType') as NodeType;
    const tier = e.dataTransfer.getData('nodeTier') || undefined; // Extract tier if present

    if (type && sceneRef.current) {
        const container = document.getElementById('phaser-container');
        if (container) {
            const rect = container.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            // Pass the tier to the scene
            sceneRef.current.externalAddNode(type, x, y, tier as ComputeTier);
        }
    }
  };

  const handleDeleteNode = (id: string) => sceneRef.current?.externalDeleteNode(id);
  const handleUnlink = (source: string, target: string) => sceneRef.current?.externalDisconnect(source, target);

  const handleUpgradeNode = (id: string, tier: ComputeTier) => {
    sceneRef.current?.externalUpgradeNode(id, tier);
    const n = sceneRef.current?.getSelectedNode();
    if (n) setSelectedNode({...n});
  };

  const handleAlgorithmChange = (id: string, algo: LoadBalancerAlgo) => {
    sceneRef.current?.externalSetAlgorithm(id, algo);
    const n = sceneRef.current?.getSelectedNode();
    if (n) setSelectedNode({...n});
  }

  const handleSpeedChange = (speed: number) => {
    setGameSpeed(speed);
    sceneRef.current?.setSpeed(speed);
  };

  const handleToggleConnectionMode = () => {
    const newState = !isConnectionMode;
    setIsConnectionMode(newState);
    sceneRef.current?.setConnectionMode(newState);
  };

  const handleRestart = () => {
      if (window.confirm("Are you sure you want to restart? All progress will be lost.")) {
          sceneRef.current?.reset();
          setSelectedNode(null);
          setGameSpeed(0);
          sceneRef.current?.setSpeed(0);
      }
  };

  // --- FLOATING CONTROLS COMPONENT ---
  const ControlButton = ({ speed, label, icon, onClick }: any) => (
    <button 
        onClick={onClick || (() => handleSpeedChange(speed))}
        className={`
            h-10 w-10 md:w-auto md:px-4 rounded-lg flex items-center justify-center space-x-1 transition-all text-xs font-bold border
            ${gameSpeed === speed && !onClick
                ? 'bg-slate-100 text-slate-900 border-white shadow-[0_0_15px_rgba(255,255,255,0.4)]' 
                : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 hover:border-slate-500'}
        `}
    >
        {icon || <span>{label}</span>}
    </button>
  );

  return (
    <div className={`relative h-screen w-screen bg-slate-950 font-sans text-slate-200 overflow-hidden selection:bg-brand-primary selection:text-white ${metrics.isUnderAttack ? 'border-4 border-red-500 animate-pulse' : ''}`}>
      
      {/* 1. Game Layer (Bottom Z-Index) */}
      <div 
          id="phaser-container"
          className="absolute inset-0 z-0 cursor-grab active:cursor-grabbing"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
      >
           {/* Phaser injects Canvas here */}
      </div>

      {/* 2. Grid Overlay Effect (Optional Aesthetic) */}
      <div className="absolute inset-0 z-0 pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 mix-blend-overlay"></div>

      {/* 3. UI Layer (Top Z-Index) */}
      <div className="absolute inset-0 z-10 pointer-events-none">
          
          {/* Top HUD */}
          <div className="absolute top-4 left-4 right-4 flex justify-center pointer-events-auto">
              <StatsPanel 
                  metrics={metrics} 
                  nodes={nodes}
                  onToggleBuildMenu={() => setIsBuildMenuOpen(!isBuildMenuOpen)}
                  isBuildMenuOpen={isBuildMenuOpen}
              />
          </div>

          {/* Left Drawer (Build Menu) */}
          <Toolbar 
              isOpen={isBuildMenuOpen} 
              onAddNode={handleAddNode} 
              canAfford={(c) => metrics.cash >= c} 
          />

          {/* Right Floating Panel (Inspector) */}
          <PropertyPanel 
            selectedNode={selectedNode}
            allNodes={nodes}
            connections={connections}
            onUpgrade={handleUpgradeNode}
            onAlgorithmChange={handleAlgorithmChange}
            onDelete={handleDeleteNode}
            onUnlink={handleUnlink}
            canAfford={(c) => metrics.cash >= c}
            onClose={() => {
                setSelectedNode(null);
                sceneRef.current?.selectNode(null);
            }}
          />

          {/* Bottom Control Island */}
          <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 pointer-events-auto flex flex-col items-center">
               {/* Context Helper */}
               {isConnectionMode && (
                  <div className="mb-3">
                      <span className="inline-block px-4 py-1.5 rounded-full bg-slate-900/80 text-xs text-brand-warning backdrop-blur-md border border-brand-warning/50 shadow-[0_0_10px_rgba(245,158,11,0.2)] font-mono animate-bounce">
                          Select Source Node → Select Target Node
                      </span>
                  </div>
              )}

              <div className="flex items-center space-x-2 p-2 rounded-2xl bg-slate-900/60 backdrop-blur-xl border border-white/10 shadow-2xl">
                  {/* Play/Pause */}
                  <ControlButton speed={0} icon={<svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>} />
                  
                  <div className="w-px h-6 bg-white/10 mx-1"></div>
                  
                  {/* Speed Controls */}
                  <ControlButton speed={1} label="1x" />
                  <ControlButton speed={2} label="2x" />
                  <ControlButton speed={5} label="5x" />

                  <div className="w-px h-6 bg-white/10 mx-1"></div>

                  {/* Restart Button */}
                  <ControlButton 
                      onClick={handleRestart}
                      icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                  />

                  <div className="w-px h-6 bg-white/10 mx-1"></div>

                  {/* Connection Toggle */}
                  <button 
                    onClick={handleToggleConnectionMode}
                    className={`
                        h-10 px-4 rounded-lg flex items-center justify-center space-x-2 transition-all text-xs font-bold border
                        ${isConnectionMode 
                            ? 'bg-brand-warning text-slate-900 border-white shadow-[0_0_15px_rgba(245,158,11,0.6)] animate-pulse' 
                            : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 hover:border-slate-500'}
                    `}
                  >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>
                      <span>CONNECT</span>
                  </button>
              </div>
          </div>
      </div>
    </div>
  );
}

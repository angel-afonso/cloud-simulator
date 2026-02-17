
import React, { useState, useEffect, useRef } from 'react';
import Phaser from 'phaser';
import { NodeType, ComputeTier, GameMetrics, NodeData, RequestType, LoadBalancerAlgo, Connection, ResponseCode } from './types';
import { MainScene } from './game/MainScene';
import { Toolbar } from './components/Toolbar';
import { StatsPanel } from './components/StatsPanel';
import { PropertyPanel } from './components/PropertyPanel';
import { Terminal } from './components/Terminal';

// --- FLOATING CONTROLS COMPONENT ---
const ControlButton = ({ speed, currentSpeed, label, icon, onClick }: any) => (
  <button
      onClick={onClick}
      className={`
          h-9 w-9 md:w-auto md:px-4 rounded-full flex items-center justify-center space-x-1 transition-all duration-300 text-[10px] font-black tracking-widest border
          ${speed !== undefined && currentSpeed === speed
              ? 'bg-white text-slate-900 border-white shadow-[0_0_20px_rgba(255,255,255,0.3)]'
              : 'bg-white/5 border-white/5 text-slate-400 hover:text-white hover:bg-white/10 hover:border-white/20'}
      `}
  >
      {icon || <span>{label}</span>}
  </button>
);

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
  const [logs, setLogs] = useState<any[]>([]);

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

       scene.onEvent = (message, type) => {
         const entry = {
            id: Math.random().toString(36).substr(2, 9),
            message,
            type,
            timestamp: new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })
         };
         setLogs(prev => [...prev.slice(-49), entry]); // Keep last 50 logs
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

  return (
    <div className={`relative h-screen w-screen bg-[#020617] font-sans text-slate-200 overflow-hidden selection:bg-brand-primary selection:text-white ${metrics.isUnderAttack ? 'ring-[16px] ring-red-500/10 ring-inset animate-[pulse_2s_infinite]' : ''}`}>
      
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
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-brand-primary/20 to-transparent animate-[scan_8s_linear_infinite]"></div>
      </div>

      {/* 3. UI Layer (Top Z-Index) */}
      <div className="absolute inset-0 z-10 pointer-events-none">
          
          {/* Top HUD */}
          <div className="absolute top-6 left-6 right-6 flex justify-center pointer-events-auto animate-[slideInDown_0.5s_cubic-bezier(0.23,1,0.32,1)]">
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

          {/* Right Floating Panel (Inspector & Terminal) */}
          <div className="absolute top-24 right-6 bottom-8 w-80 flex flex-col pointer-events-none gap-4">
            <div className="flex-1 min-h-0 pointer-events-auto">
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
            </div>

            <div className="flex-none pointer-events-auto">
                <Terminal logs={logs} />
            </div>
          </div>

          {/* Bottom Control Island */}
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 pointer-events-auto flex flex-col items-center">
              <div className="flex items-center space-x-3 p-1.5 rounded-full bg-slate-950/40 backdrop-blur-xl border border-white/10 shadow-2xl">
                  {/* Play/Pause */}
                  <ControlButton
                    speed={0}
                    currentSpeed={gameSpeed}
                    onClick={() => handleSpeedChange(0)}
                    icon={<svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>}
                  />
                  
                  <div className="w-px h-4 bg-white/10 mx-1"></div>
                  
                  {/* Speed Controls */}
                  <ControlButton speed={1} currentSpeed={gameSpeed} label="1x" onClick={() => handleSpeedChange(1)} />
                  <ControlButton speed={2} currentSpeed={gameSpeed} label="2x" onClick={() => handleSpeedChange(2)} />
                  <ControlButton speed={5} currentSpeed={gameSpeed} label="5x" onClick={() => handleSpeedChange(5)} />

                  <div className="w-px h-4 bg-white/10 mx-1"></div>

                  {/* Restart Button */}
                  <ControlButton 
                      currentSpeed={gameSpeed}
                      onClick={handleRestart}
                      icon={<svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>}
                  />
              </div>
          </div>
      </div>
    </div>
  );
}

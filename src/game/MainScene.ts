
import Phaser from 'phaser';
import { v4 as uuidv4 } from 'uuid';
import { 
  NodeType, NodeData, Connection, GameMetrics, ComputeTier, CdnTier, RequestType, LoadBalancerAlgo, DbRole, ResponseCode 
} from '../types';
import { 
  COMPUTE_TIERS, CDN_TIERS, NODE_COSTS, NODE_OPEX, REVENUE_BY_TYPE, 
  NODE_LABELS, UPGRADE_TIME_MS, REQUEST_HEX_COLORS, TRAFFIC_MIX, 
  CDN_WARMUP_CONSTANT, CACHE_WARMUP_CONSTANT, CACHE_WRITE_PENALTY,
  CHAOS_FAILURE_CHANCE_PER_TICK, REPAIR_TIME_MS, SATISFACTION_PENALTY_RATE, SATISFACTION_RECOVERY_RATE
} from '../constants';

const PALETTE = {
  SLATE_900: 0x0f172a,
  SLATE_800: 0x1e293b,
  SLATE_700: 0x334155,
  SLATE_400: 0x94a3b8,
  WHITE: 0xffffff,
  
  BRAND_PRIMARY: 0x6366f1, 
  BRAND_SUCCESS: 0x10b981, 
  BRAND_WARNING: 0xf59e0b, 
  BRAND_DANGER: 0xef4444, 
  BRAND_CYAN: 0x06b6d4,
  BRAND_PURPLE: 0xa855f7,
  BRAND_ORANGE: 0xf97316,
  BRAND_PINK: 0xec4899,
  BRAND_BLUE: 0x3b82f6,
  BRAND_TEAL: 0x2dd4bf,
  BRAND_FUCHSIA: 0xe879f9,
};

const NODE_THEMES = {
  [NodeType.INTERNET]: PALETTE.SLATE_400,
  [NodeType.CDN]: PALETTE.BRAND_TEAL,
  [NodeType.WAF]: PALETTE.BRAND_PURPLE,
  [NodeType.FIREWALL]: PALETTE.BRAND_ORANGE,
  [NodeType.LOAD_BALANCER]: PALETTE.BRAND_BLUE,
  [NodeType.API_GATEWAY]: PALETTE.BRAND_PRIMARY,
  [NodeType.COMPUTE]: PALETTE.BRAND_SUCCESS,
  [NodeType.DATABASE]: PALETTE.BRAND_WARNING,
  [NodeType.DATABASE_NOSQL]: PALETTE.BRAND_FUCHSIA,
  [NodeType.STORAGE]: PALETTE.BRAND_CYAN,
  [NodeType.CACHE]: PALETTE.BRAND_PINK,
};

const WRITE_LOCKING_PENALTY = 5;

interface NodeVisuals {
    container: Phaser.GameObjects.Container;
    loadBarFill: Phaser.GameObjects.Rectangle;
    statsText: Phaser.GameObjects.Text;
    selectionBorder: Phaser.GameObjects.Rectangle;
    subLabel: Phaser.GameObjects.Text;
    warnIcon?: Phaser.GameObjects.Text; 
    repairIcon?: Phaser.GameObjects.Text;
}

interface FlowParticle {
    t: number; 
    speed: number;
    sourceId: string;
    targetId: string;
    color: number;
}

type TrafficMix = Record<RequestType, number>;

export class MainScene extends Phaser.Scene {
  add!: Phaser.GameObjects.GameObjectFactory;
  input!: Phaser.Input.InputPlugin;
  scale!: Phaser.Scale.ScaleManager;
  textures!: Phaser.Textures.TextureManager;
  time!: Phaser.Time.Clock;

  // Data State
  nodes: NodeData[] = [];
  connections: Connection[] = [];
  metrics: GameMetrics;
  
  // Optimization Maps (O(1) Lookups)
  nodeDataMap: Map<string, NodeData> = new Map();
  nodeVisuals: Map<string, NodeVisuals> = new Map();
  adjacencyMap: Map<string, string[]> = new Map(); 
  draggingNodes: Set<string> = new Set();
  
  // Simulation Control
  simulationSpeed: number = 0; 
  isPaused: boolean = true;
  isConnectionMode: boolean = false;
  currentBaseTraffic: number = 50; 
  
  // Attack State
  isUnderAttack: boolean = false;
  attackTimer: number = 0;
  attackCooldownTimer: number = 0; 
  
  // Timers & Flags
  tickAccumulator: number = 0;
  billingAccumulator: number = 0;
  lastReactUpdate: number = 0;
  lastTextUpdate: number = 0; 
  visualsDirty: boolean = true;
  
  // Visual Objects
  connectionGraphics!: Phaser.GameObjects.Graphics;
  particleGraphics!: Phaser.GameObjects.Graphics;
  nodeGroup!: Phaser.GameObjects.Group;
  dragLine!: Phaser.GameObjects.Graphics;
  
  particles: FlowParticle[] = [];

  tempBezier = new Phaser.Curves.CubicBezier(
    new Phaser.Math.Vector2(0, 0),
    new Phaser.Math.Vector2(0, 0),
    new Phaser.Math.Vector2(0, 0),
    new Phaser.Math.Vector2(0, 0)
  );
  
  selectedNodeId: string | null = null;
  connectingNodeId: string | null = null;

  onMetricsUpdate!: (metrics: GameMetrics) => void;
  onNodeSelect!: (nodeId: string | null) => void;
  onGraphUpdate!: (nodes: NodeData[], connections: Connection[]) => void;
  onInsufficientFunds!: () => void;

  simBufferCurrent: Map<string, TrafficMix> = new Map();
  simBufferNext: Map<string, TrafficMix> = new Map();

  constructor() {
    super({ key: 'MainScene' });
    this.metrics = this.createInitialMetrics();
  }

  createInitialMetrics(): GameMetrics {
      return {
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
          activeUsers: 50,
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
      };
  }

  create() {
    this.createGrid();

    this.input.mouse?.disableContextMenu();
    this.input.on('pointerdown', this.handlePointerDown, this);
    this.input.on('pointermove', this.handlePointerMove, this);
    this.input.on('pointerup', this.handlePointerUp, this);

    this.connectionGraphics = this.add.graphics();
    this.particleGraphics = this.add.graphics();
    this.dragLine = this.add.graphics();
    this.nodeGroup = this.add.group();

    this.addNode(NodeType.INTERNET, 100, 300, 'internet-1');
  }

  createGrid() {
    const gap = 50;
    if (!this.textures.exists('grid-pattern')) {
        const canvas = this.textures.createCanvas('grid-pattern', gap, gap);
        const ctx = canvas.getContext();
        ctx.fillStyle = 'rgba(51, 65, 85, 0.3)';
        ctx.beginPath();
        ctx.arc(2, 2, 1.5, 0, Math.PI * 2);
        ctx.fill();
        canvas.refresh();
    }
    
    const bg = this.add.tileSprite(0, 0, 4000, 4000, 'grid-pattern');
    bg.setOrigin(0);
    bg.setDepth(-100);
    bg.setScrollFactor(1); 
  }

  updateReactMetrics(force: boolean = false) {
    if (this.onMetricsUpdate) {
        this.onMetricsUpdate({ ...this.metrics });
    }
  }

  public reset() {
    this.nodeVisuals.forEach(vis => vis.container.destroy());
    this.nodeVisuals.clear();
    this.nodeGroup.clear(); 
    this.connectionGraphics.clear();
    this.particleGraphics.clear();
    this.dragLine.clear();

    this.nodes = [];
    this.connections = [];
    this.nodeDataMap.clear();
    this.adjacencyMap.clear();
    this.draggingNodes.clear();
    this.simBufferCurrent.clear();
    this.simBufferNext.clear();
    this.particles = [];
    
    this.metrics = this.createInitialMetrics();
    this.currentBaseTraffic = 50;
    this.isUnderAttack = false;
    this.attackTimer = 0;
    this.attackCooldownTimer = 0;
    this.selectedNodeId = null;
    this.connectingNodeId = null;

    this.addNode(NodeType.INTERNET, 100, 300, 'internet-1');
    
    this.updateReactMetrics(true);
    this.broadcastGraphUpdate();
    if (this.onNodeSelect) this.onNodeSelect(null);
  }

  public setSpeed(speed: number) {
    this.simulationSpeed = speed;
    this.isPaused = speed === 0;
  }

  public setConnectionMode(active: boolean) {
    this.isConnectionMode = active;
    this.connectingNodeId = null;
    this.dragLine.clear();
    this.input.setDefaultCursor(active ? 'crosshair' : 'default');
  }

  public externalAddNode(type: NodeType, x: number, y: number, initialTier?: ComputeTier) {
    let cost = NODE_COSTS[type];
    if (type === NodeType.COMPUTE && initialTier) {
        cost = COMPUTE_TIERS[initialTier].capex;
    }

    if (this.metrics.cash >= cost) {
      this.metrics.cash -= cost;
      this.addNode(type, x, y, undefined, initialTier);
      this.updateReactMetrics(true); 
    } else {
      if (this.onInsufficientFunds) this.onInsufficientFunds();
    }
  }

  public externalDeleteNode(id: string) {
    if (id.startsWith('internet')) return;
    
    this.nodes = this.nodes.filter(n => n.id !== id);
    this.nodeDataMap.delete(id);
    this.simBufferCurrent.delete(id);
    this.simBufferNext.delete(id);
    this.nodeVisuals.delete(id);

    this.connections = this.connections.filter(c => c.sourceId !== id && c.targetId !== id);
    this.rebuildAdjacency();
    
    const container = this.nodeGroup.getChildren().find((c: any) => c.getData('id') === id);
    if (container) container.destroy();
    
    this.visualsDirty = true;
    
    if (this.selectedNodeId === id) {
      this.selectedNodeId = null;
      if (this.onNodeSelect) this.onNodeSelect(null);
    }
    this.broadcastGraphUpdate();
  }

  public externalDisconnect(sourceId: string, targetId: string) {
      const exists = this.connections.find(c => c.sourceId === sourceId && c.targetId === targetId);
      if (exists) {
          this.connections = this.connections.filter(c => c !== exists);
          this.rebuildAdjacency();
          this.visualsDirty = true;
          this.broadcastGraphUpdate();
      }
  }

  public externalUpgradeNode(id: string, newTier: string) {
    const node = this.nodeDataMap.get(id);
    if (!node) return;

    let cost = 0;
    let name = '';

    if (node.type === NodeType.COMPUTE) {
        cost = COMPUTE_TIERS[newTier as ComputeTier].capex;
        name = COMPUTE_TIERS[newTier as ComputeTier].name;
    } else if (node.type === NodeType.CDN) {
        cost = CDN_TIERS[newTier as CdnTier].capex;
        name = CDN_TIERS[newTier as CdnTier].name;
    }

    if (this.metrics.cash >= cost) {
      this.metrics.cash -= cost;
      node.status = 'booting';
      node.isUpgrading = true;
      node.upgradeProgress = 0;
      
      if (node.type === NodeType.COMPUTE) node.tier = newTier as ComputeTier;
      if (node.type === NodeType.CDN) node.cdnTier = newTier as CdnTier;

      const vis = this.nodeVisuals.get(id);
      if (vis) {
        vis.subLabel.setText(name);
      }
      this.updateReactMetrics(true);
      this.broadcastGraphUpdate();
    }
  }

  public externalSetAlgorithm(id: string, algo: LoadBalancerAlgo) {
    const node = this.nodeDataMap.get(id);
    if (node && node.type === NodeType.LOAD_BALANCER) {
      node.algorithm = algo;
      
      const vis = this.nodeVisuals.get(id);
      if (vis) {
        vis.subLabel.setText(algo === LoadBalancerAlgo.ROUND_ROBIN ? 'Round Robin' : 'Least Conn');
      }
      this.broadcastGraphUpdate();
    }
  }

  public externalSetDbRole(id: string, role: DbRole) {
      const node = this.nodeDataMap.get(id);
      if (node && node.type === NodeType.DATABASE) {
          node.dbRole = role;
          const vis = this.nodeVisuals.get(id);
          if (vis) {
              vis.subLabel.setText(role === DbRole.PRIMARY ? 'Primary (RW)' : 'Replica (RO)');
              if (role === DbRole.PRIMARY) {
                  vis.loadBarFill.setStrokeStyle(2, 0xffff00);
              } else {
                  vis.loadBarFill.setStrokeStyle(0);
              }
          }
          this.broadcastGraphUpdate();
      }
  }

  public getSelectedNode() {
    return this.selectedNodeId ? this.nodeDataMap.get(this.selectedNodeId) || null : null;
  }

  broadcastGraphUpdate() {
      if (this.onGraphUpdate) {
          this.onGraphUpdate([...this.nodes], [...this.connections]);
      }
  }

  addNode(type: NodeType, x: number, y: number, specificId?: string, initialTier?: ComputeTier) {
    const id = specificId || `${type.toLowerCase()}-${uuidv4().slice(0, 4)}`;
    
    const tier = (type === NodeType.COMPUTE) 
        ? (initialTier || ComputeTier.T1) 
        : undefined;

    const nodeData: NodeData = {
      id,
      type,
      x,
      y,
      currentLoad: 0,
      loadHistory: new Array(30).fill(0),
      processedReqs: 0,
      droppedReqs: 0,
      status: 'active', 
      tier,
      cdnTier: type === NodeType.CDN ? CdnTier.EDGE_BASIC : undefined,
      algorithm: type === NodeType.LOAD_BALANCER ? LoadBalancerAlgo.ROUND_ROBIN : undefined,
      dbRole: type === NodeType.DATABASE ? DbRole.PRIMARY : undefined, 
      totalServed: 0,
      cacheHitRate: 0.1, 
      hasStorageConnection: false,
      invalidationPressure: 0,
      failureTimeLeft: 0
    };
    
    this.nodes.push(nodeData);
    this.nodeDataMap.set(id, nodeData);

    this.simBufferCurrent.set(id, { 
        [RequestType.WEB]: 0, 
        [RequestType.DB_READ]: 0, 
        [RequestType.DB_WRITE]: 0, 
        [RequestType.DB_SEARCH]: 0, 
        [RequestType.STATIC]: 0,
        [RequestType.ATTACK]: 0 
    });
    this.simBufferNext.set(id, { 
        [RequestType.WEB]: 0, 
        [RequestType.DB_READ]: 0, 
        [RequestType.DB_WRITE]: 0, 
        [RequestType.DB_SEARCH]: 0, 
        [RequestType.STATIC]: 0,
        [RequestType.ATTACK]: 0 
    });

    // Visuals
    const width = 120;
    const height = 70;
    const container = this.add.container(x, y);
    container.setSize(width, height);
    container.setData('id', id);
    container.setInteractive({ draggable: true });
    
    const themeColor = NODE_THEMES[type];

    const bg = this.add.rectangle(0, 0, width, height, PALETTE.SLATE_800, 0.9);
    bg.setStrokeStyle(1, PALETTE.SLATE_700);
    bg.setOrigin(0.5);

    const accent = this.add.rectangle(0, -height/2 + 2, width, 4, themeColor);
    accent.setOrigin(0.5);

    const label = this.add.text(-width/2 + 10, -height/2 + 15, NODE_LABELS[type], { 
      fontSize: '11px', fontFamily: 'Inter', color: '#e2e8f0', fontStyle: 'bold'
    });

    let subLabelText = type as string;
    if (type === NodeType.COMPUTE && tier) subLabelText = COMPUTE_TIERS[tier].name;
    if (type === NodeType.CDN) subLabelText = 'Basic Edge';
    if (type === NodeType.LOAD_BALANCER) subLabelText = 'Round Robin';
    if (type === NodeType.DATABASE) subLabelText = 'Primary (RW)';
    if (type === NodeType.DATABASE_NOSQL) subLabelText = 'Cluster';
    if (type === NodeType.CACHE) subLabelText = 'In-Memory';

    const subLabel = this.add.text(-width/2 + 10, -height/2 + 30, subLabelText, { 
      fontSize: '9px', fontFamily: 'JetBrains Mono', color: '#94a3b8' 
    });

    const statsText = this.add.text(width/2 - 10, height/2 - 15, '0/s', {
        fontSize: '10px', fontFamily: 'JetBrains Mono', color: '#ffffff'
    }).setOrigin(1, 0.5);

    const loadBarBg = this.add.rectangle(0, height/2 - 6, width - 20, 4, 0x000000, 0.3);
    const loadBarFill = this.add.rectangle(-(width - 20)/2, height/2 - 6, 0, 4, themeColor);
    loadBarFill.setOrigin(0, 0.5);

    const selectionBorder = this.add.rectangle(0, 0, width + 4, height + 4, 0xffffff, 0);
    selectionBorder.setStrokeStyle(2, PALETTE.BRAND_PRIMARY);
    selectionBorder.setVisible(false);

    const warnIcon = this.add.text(width/2 - 5, -height/2 + 10, '!', {
        fontSize: '14px', fontFamily: 'Inter', color: '#ef4444', fontStyle: 'bold'
    }).setOrigin(1, 0).setVisible(false);

    const repairIcon = this.add.text(0, 0, '🔧', {
        fontSize: '24px'
    }).setOrigin(0.5).setVisible(false);

    container.add([selectionBorder, bg, accent, label, subLabel, statsText, loadBarBg, loadBarFill, warnIcon, repairIcon]);
    this.nodeGroup.add(container);

    this.nodeVisuals.set(id, {
        container,
        loadBarFill,
        statsText,
        selectionBorder,
        subLabel,
        warnIcon,
        repairIcon
    });

    let isDragging = false;

    container.on('dragstart', () => {
        isDragging = true;
        this.draggingNodes.add(id);
    });

    container.on('dragend', () => {
        this.time.delayedCall(50, () => {
            isDragging = false;
        });
        this.draggingNodes.delete(id);
    });

    container.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const nativeEvent = pointer.event as MouseEvent;
      if (this.isConnectionMode || nativeEvent.shiftKey) {
          this.handleNodeClick(pointer, id);
      }
    });

    container.on('pointerup', (pointer: Phaser.Input.Pointer) => {
        const nativeEvent = pointer.event as MouseEvent;
        if (!this.isConnectionMode && !nativeEvent.shiftKey && !isDragging) {
            this.handleNodeClick(pointer, id);
        }
    });
    
    container.on('drag', (pointer: Phaser.Input.Pointer, dragX: number, dragY: number) => {
      const nativeEvent = pointer.event as MouseEvent;
      if (this.isConnectionMode || nativeEvent.shiftKey) return;
      container.x = dragX;
      container.y = dragY;
      
      const n = this.nodeDataMap.get(id);
      if (n) { n.x = dragX; n.y = dragY; }
      
      this.visualsDirty = true;
    });
    
    this.visualsDirty = true;
    this.broadcastGraphUpdate();
  }

  handleNodeClick(pointer: Phaser.Input.Pointer, nodeId: string) {
    const nativeEvent = pointer.event as MouseEvent;
    const isConnecting = nativeEvent.shiftKey || this.isConnectionMode;

    if (isConnecting) {
      if (this.connectingNodeId === null) {
        this.connectingNodeId = nodeId;
      } else {
        if (this.connectingNodeId !== nodeId) {
          this.toggleConnection(this.connectingNodeId, nodeId);
        }
        this.connectingNodeId = null;
        this.dragLine.clear();
      }
    } else {
      this.connectingNodeId = null;
      this.dragLine.clear(); 
      this.selectNode(nodeId);
    }
  }

  selectNode(id: string | null) {
    if (this.selectedNodeId) {
        const prev = this.nodeVisuals.get(this.selectedNodeId);
        if (prev) prev.selectionBorder.setVisible(false);
    }
    this.selectedNodeId = id;
    if (id) {
        const curr = this.nodeVisuals.get(id);
        if (curr) curr.selectionBorder.setVisible(true);
    }
    if (this.onNodeSelect) this.onNodeSelect(id);
  }

  toggleConnection(sourceId: string, targetId: string) {
    const exists = this.connections.find(c => c.sourceId === sourceId && c.targetId === targetId);
    if (exists) {
      this.connections = this.connections.filter(c => c !== exists);
    } else {
      this.connections.push({ id: uuidv4(), sourceId, targetId });
    }
    this.rebuildAdjacency();
    this.visualsDirty = true;
    this.broadcastGraphUpdate();
  }
  
  rebuildAdjacency() {
      this.adjacencyMap.clear();
      this.connections.forEach(c => {
          if (!this.adjacencyMap.has(c.sourceId)) {
              this.adjacencyMap.set(c.sourceId, []);
          }
          this.adjacencyMap.get(c.sourceId)?.push(c.targetId);
      });
  }

  handlePointerDown(pointer: Phaser.Input.Pointer) {
    const targets = this.input.hitTestPointer(pointer);
    const hitNode = targets.some(t => this.nodeGroup.contains(t));

    if (this.selectedNodeId && !hitNode) {
       this.selectNode(null);
       this.connectingNodeId = null;
       this.dragLine.clear();
    }
  }

  handlePointerMove(pointer: Phaser.Input.Pointer) {
    if (this.connectingNodeId) {
      const sourceNode = this.nodeDataMap.get(this.connectingNodeId);
      if (sourceNode) {
        this.dragLine.clear();
        
        let lineColor = PALETTE.BRAND_WARNING;
        let lineAlpha = 0.8;
        let targetX = pointer.worldX;
        let targetY = pointer.worldY;

        const targets = this.input.hitTestPointer(pointer);
        const hitContainer = targets.find(t => this.nodeGroup.contains(t)) as Phaser.GameObjects.Container;
        
        if (hitContainer) {
            const targetId = hitContainer.getData('id');
            if (targetId && targetId !== this.connectingNodeId) {
                targetX = hitContainer.x;
                targetY = hitContainer.y;

                const exists = this.connections.find(c => c.sourceId === this.connectingNodeId && c.targetId === targetId);
                if (exists) {
                    lineColor = PALETTE.BRAND_DANGER; 
                    lineAlpha = 1;
                } else {
                    lineColor = PALETTE.BRAND_SUCCESS; 
                }
            }
        }

        this.dragLine.lineStyle(2, lineColor, lineAlpha);
        this.dragLine.beginPath();
        this.dragLine.moveTo(sourceNode.x, sourceNode.y);
        this.dragLine.lineTo(targetX, targetY);
        this.dragLine.strokePath();
      }
    }
  }

  handlePointerUp() {}

  update(time: number, delta: number) {
    if (!this.isPaused) {
       const effectiveDelta = delta * this.simulationSpeed;
       
       this.nodes.forEach(node => {
         if (node.isUpgrading && node.status === 'booting') {
            const progressIncrement = (effectiveDelta / UPGRADE_TIME_MS) * 100;
            node.upgradeProgress = (node.upgradeProgress || 0) + progressIncrement;
            
            if (node.upgradeProgress >= 100) {
              node.isUpgrading = false;
              node.status = 'active';
              node.upgradeProgress = 0;
            }
         }

         if (node.failureTimeLeft && node.failureTimeLeft > 0) {
             node.failureTimeLeft -= effectiveDelta;
             if (node.failureTimeLeft <= 0) {
                 node.failureTimeLeft = 0;
                 node.status = 'booting';
                 node.isUpgrading = true;
                 node.upgradeProgress = 0;
             } else {
                 node.status = 'down';
             }
         }
       });

       this.runChaosMonkey(effectiveDelta);
       
       if (this.isUnderAttack) {
           this.attackTimer -= effectiveDelta;
           this.metrics.attackTimeLeft = Math.ceil(this.attackTimer / 1000);
           
           if (this.attackTimer <= 0) {
               this.isUnderAttack = false;
               this.metrics.isUnderAttack = false;
               this.metrics.attackTimeLeft = 0;
               this.attackCooldownTimer = 45000;
           }
       } else {
           if (this.attackCooldownTimer > 0) {
               this.attackCooldownTimer -= effectiveDelta;
           } else {
               if (this.currentBaseTraffic > 2000) {
                   if (Math.random() < 0.0002 * this.simulationSpeed) {
                       this.triggerAttack();
                   }
               }
           }
       }

       this.updateParticles(effectiveDelta);
    }

    this.updateConnections(time);
    this.updateNodeVisuals(time);

    if (this.isPaused) return;

    this.tickAccumulator += delta * this.simulationSpeed;
    const TICK_RATE = 250; 
    
    if (this.tickAccumulator >= TICK_RATE) {
      this.runTrafficSimulation();
      this.tickAccumulator -= TICK_RATE;
    }

    this.billingAccumulator += delta * this.simulationSpeed;
    if (this.billingAccumulator >= 1000) {
      this.runBilling();
      this.billingAccumulator -= 1000;
    }
    
    if (time > this.lastReactUpdate + 500) {
        this.updateReactMetrics();
        this.lastReactUpdate = time;
    }
  }

  runChaosMonkey(effectiveDelta: number) {
      // Chaos Monkey disabled: Nodes will not randomly fail.
      /*
      this.nodes.forEach(node => {
          if (node.type === NodeType.INTERNET) return;
          if (node.status !== 'active') return;

          if (Math.random() < CHAOS_FAILURE_CHANCE_PER_TICK) {
              node.status = 'down';
              node.failureTimeLeft = REPAIR_TIME_MS;
              node.currentLoad = 0; 
              this.visualsDirty = true;
          }
      });
      */
  }
  
  triggerAttack() {
      this.isUnderAttack = true;
      this.metrics.isUnderAttack = true;
      this.attackTimer = 15000 + Math.random() * 15000; 
      this.metrics.attackTimeLeft = Math.ceil(this.attackTimer / 1000);
  }

  cubicBezier(t: number, p0: number, p1: number, p2: number, p3: number) {
      const k = 1 - t;
      return k * k * k * p0 + 3 * k * k * t * p1 + 3 * k * t * t * p2 + t * t * t * p3;
  }

  updateParticles(delta: number) {
      this.particleGraphics.clear();
      
      let writeIdx = 0;
      const deltaSec = delta / 1000;

      for (let i = 0; i < this.particles.length; i++) {
          const p = this.particles[i];
          p.t += p.speed * deltaSec;
          
          if (p.t < 1) {
              const source = this.nodeDataMap.get(p.sourceId);
              const target = this.nodeDataMap.get(p.targetId);
              
              if (source && target) {
                  const dist = Math.abs(target.x - source.x);
                  const cpOffset = Math.max(dist * 0.5, 50);
                  
                  const x = this.cubicBezier(p.t, source.x, source.x + cpOffset, target.x - cpOffset, target.x);
                  const y = this.cubicBezier(p.t, source.y, source.y, target.y, target.y);
                  
                  this.particleGraphics.fillStyle(p.color, 1);
                  this.particleGraphics.fillCircle(x, y, 2.5);
                  
                  if (writeIdx !== i) {
                      this.particles[writeIdx] = p;
                  }
                  writeIdx++;
              }
          }
      }
      this.particles.length = writeIdx;
  }

  spawnParticle(sourceId: string, targetId: string, type: RequestType) {
      if (this.particles.length > 400) return;

      this.particles.push({
          t: 0,
          speed: 0.5 + Math.random() * 0.5,
          sourceId,
          targetId,
          color: REQUEST_HEX_COLORS[type]
      });
  }

  updateConnections(time: number) {
    this.connectionGraphics.clear();
    const alphaPulse = 0.5 + Math.sin(time / 500) * 0.2; 

    for (let i = 0; i < this.connections.length; i++) {
      const conn = this.connections[i];
      const source = this.nodeDataMap.get(conn.sourceId);
      const target = this.nodeDataMap.get(conn.targetId);
      
      if (source && target) {
        const dist = Phaser.Math.Distance.Between(source.x, source.y, target.x, target.y);
        const xDiff = Math.abs(target.x - source.x);
        const cpOffset = Math.max(xDiff * 0.5, 50);

        this.tempBezier.p0.set(source.x, source.y);
        this.tempBezier.p1.set(source.x + cpOffset, source.y);
        this.tempBezier.p2.set(target.x - cpOffset, target.y);
        this.tempBezier.p3.set(target.x, target.y);
        
        this.connectionGraphics.lineStyle(4, PALETTE.SLATE_700, 0.2);
        this.tempBezier.draw(this.connectionGraphics);

        this.connectionGraphics.lineStyle(1.5, PALETTE.SLATE_400, alphaPulse);
        this.tempBezier.draw(this.connectionGraphics);
      }
    }
  }

  updateNodeVisuals(time: number) {
    const updateText = time > this.lastTextUpdate + 500;
    if (updateText) this.lastTextUpdate = time;

    for (let i = 0; i < this.nodes.length; i++) {
      const node = this.nodes[i];
      const vis = this.nodeVisuals.get(node.id);
      if (!vis) continue;

      const width = 100; 
      const targetWidth = (Math.min(node.currentLoad, 100) / 100) * width;
      const curWidth = vis.loadBarFill.width;
      
      if (Math.abs(targetWidth - curWidth) > 0.5) {
          vis.loadBarFill.width = curWidth + (targetWidth - curWidth) * 0.2;
          
          let color = NODE_THEMES[node.type] || PALETTE.BRAND_SUCCESS;
          if (node.currentLoad > 90) color = PALETTE.BRAND_DANGER;
          else if (node.currentLoad > 50) color = PALETTE.BRAND_WARNING;
          
          if (vis.loadBarFill.fillColor !== color) {
             vis.loadBarFill.fillColor = color;
          }
      }

      if (node.status === 'down') {
          vis.container.alpha = 0.7;
          vis.repairIcon?.setVisible(true);
          const tint = (Math.floor(time / 200) % 2 === 0) ? 0xff0000 : 0xffffff;
          vis.repairIcon?.setTint(tint);
      } else {
          vis.repairIcon?.setVisible(false);
          vis.container.alpha = node.status === 'active' ? 1 : 0.5;
      }

      if (updateText) {
          vis.statsText.setText(`${Math.round(node.processedReqs)}/s`);
          
          if (node.type === NodeType.CDN) {
              vis.warnIcon?.setVisible(node.status === 'active' && !node.hasStorageConnection);
          }
      }
      
      if (this.isUnderAttack && node.currentLoad > 80) {
          vis.container.x = node.x + (Math.random() - 0.5) * 2;
          vis.container.y = node.y + (Math.random() - 0.5) * 2;
      } else if (!this.isDragging(vis.container)) {
          if (Math.abs(vis.container.x - node.x) > 1) vis.container.x = node.x;
          if (Math.abs(vis.container.y - node.y) > 1) vis.container.y = node.y;
      }
    }
  }
  
  isDragging(container: Phaser.GameObjects.Container) {
      const id = container.getData('id');
      return this.draggingNodes.has(id);
  }

  runBilling() {
    let totalOpex = 0;
    for (let i = 0; i < this.nodes.length; i++) {
        const node = this.nodes[i];
        if (node.tier) {
            totalOpex += COMPUTE_TIERS[node.tier].opex;
        } else if (node.cdnTier) {
            totalOpex += CDN_TIERS[node.cdnTier].opex;
        } else {
            totalOpex += NODE_OPEX[node.type];
        }
    }

    this.metrics.cash = this.metrics.cash - totalOpex + this.metrics.revenuePerSec;
    this.metrics.opexPerSec = totalOpex;
    this.updateReactMetrics(true);
  }

  runTrafficSimulation() {
    const sat = this.metrics.userSatisfaction;
    
    let churnFactor = 1.0;
    if (sat > 95) churnFactor = 1.0015; 
    else if (sat > 80) churnFactor = 1.0005; 
    else if (sat > 60) churnFactor = 1.0; 
    else if (sat > 40) churnFactor = 0.9995; 
    else churnFactor = 0.99; 
    
    if (this.currentBaseTraffic > 50000) churnFactor = 1 + (churnFactor - 1) * 0.1;
    else if (this.currentBaseTraffic > 10000) churnFactor = 1 + (churnFactor - 1) * 0.5;

    this.currentBaseTraffic = this.currentBaseTraffic * churnFactor;
    this.currentBaseTraffic = Math.max(10, Math.min(1000000, this.currentBaseTraffic));

    const time = Date.now() / 1000;
    const dailyCycle = Math.sin(time * 0.2) * (this.currentBaseTraffic * 0.15); 
    const noise = (Math.random() - 0.5) * (this.currentBaseTraffic * 0.05); 
    
    let totalIncoming = Math.floor(Math.max(0, this.currentBaseTraffic + dailyCycle + noise));
    
    let attackVolume = 0;
    if (this.isUnderAttack) {
        attackVolume = totalIncoming * 4; 
        totalIncoming += attackVolume;
    }

    // Reset status counters for this tick
    this.metrics.responseCodes = {
        [ResponseCode.HTTP_200]: 0,
        [ResponseCode.HTTP_403]: 0,
        [ResponseCode.HTTP_429]: 0,
        [ResponseCode.HTTP_500]: 0,
        [ResponseCode.HTTP_503]: 0,
    };

    for (let i = 0; i < this.nodes.length; i++) {
        const n = this.nodes[i];
        n.processedReqs = 0;
        n.droppedReqs = 0;
        n.hasStorageConnection = false;
        n.invalidationPressure = 0;
        
        const buf = this.simBufferCurrent.get(n.id);
        if (buf) {
            buf[RequestType.WEB] = 0;
            buf[RequestType.DB_READ] = 0;
            buf[RequestType.DB_WRITE] = 0;
            buf[RequestType.DB_SEARCH] = 0;
            buf[RequestType.STATIC] = 0;
            buf[RequestType.ATTACK] = 0;
        }
    }
    
    const internetNodes = this.nodes.filter(n => n.type === NodeType.INTERNET);
    const flowPerInternet = (totalIncoming - attackVolume) / (internetNodes.length || 1);
    const attackPerInternet = attackVolume / (internetNodes.length || 1);
    
    for (const node of internetNodes) {
        const buf = this.simBufferCurrent.get(node.id);
        if (buf) {
            buf[RequestType.WEB] = flowPerInternet * TRAFFIC_MIX[RequestType.WEB];
            buf[RequestType.DB_READ] = flowPerInternet * TRAFFIC_MIX[RequestType.DB_READ];
            buf[RequestType.DB_WRITE] = flowPerInternet * TRAFFIC_MIX[RequestType.DB_WRITE];
            buf[RequestType.DB_SEARCH] = flowPerInternet * TRAFFIC_MIX[RequestType.DB_SEARCH];
            buf[RequestType.STATIC] = flowPerInternet * TRAFFIC_MIX[RequestType.STATIC];
            buf[RequestType.ATTACK] = attackPerInternet; 
        }
    }

    let bWebSuc = 0, bWebFail = 0;
    let bDbReadSuc = 0, bDbReadFail = 0;
    let bDbWriteSuc = 0, bDbWriteFail = 0;
    let bDbSearchSuc = 0, bDbSearchFail = 0;
    let bStaticSuc = 0, bStaticFail = 0;
    let bAttackSuc = 0, bAttackFail = 0; 

    // Latency Aggregation Vars
    let totalLatencyAccumulator = 0;
    let nodesContributingToLatency = 0;
    let maxNodeLoadFactor = 0; // For P95 estimation

    const MAX_STEPS = 6;
    for(let step = 0; step < MAX_STEPS; step++) {
        
        for (const mix of this.simBufferNext.values()) {
            mix[RequestType.WEB] = 0;
            mix[RequestType.DB_READ] = 0;
            mix[RequestType.DB_WRITE] = 0;
            mix[RequestType.DB_SEARCH] = 0;
            mix[RequestType.STATIC] = 0;
            mix[RequestType.ATTACK] = 0;
        }

        let trafficMoved = false;

        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            const inputMix = this.simBufferCurrent.get(node.id);
            if (!inputMix) continue;

            // STATUS 500 CHECK: If node is DOWN, all traffic fails here
            if (node.status !== 'active') {
                const totalFail = inputMix[RequestType.WEB] + inputMix[RequestType.DB_READ] + inputMix[RequestType.DB_WRITE] + inputMix[RequestType.DB_SEARCH] + inputMix[RequestType.STATIC] + inputMix[RequestType.ATTACK];
                if (totalFail > 0.1) {
                    this.metrics.responseCodes[ResponseCode.HTTP_500] += totalFail;
                    bWebFail += inputMix[RequestType.WEB];
                    bDbReadFail += inputMix[RequestType.DB_READ];
                    bDbWriteFail += inputMix[RequestType.DB_WRITE];
                    bDbSearchFail += inputMix[RequestType.DB_SEARCH];
                    bStaticFail += inputMix[RequestType.STATIC];
                    bAttackFail += inputMix[RequestType.ATTACK];
                    // Clear input so it doesn't loop
                    inputMix[RequestType.WEB] = 0; inputMix[RequestType.DB_READ] = 0; inputMix[RequestType.DB_WRITE] = 0; inputMix[RequestType.DB_SEARCH] = 0; inputMix[RequestType.STATIC] = 0; inputMix[RequestType.ATTACK] = 0;
                    trafficMoved = true;
                }
                continue;
            }

            // STATUS 403 CHECK: WAF/Firewall filtering
            const initialAttack = inputMix[RequestType.ATTACK];
            if (node.type === NodeType.FIREWALL) {
                inputMix[RequestType.ATTACK] *= 0.2; 
            } else if (node.type === NodeType.WAF) {
                inputMix[RequestType.ATTACK] *= 0.001;
            }
            const blockedAttack = initialAttack - inputMix[RequestType.ATTACK];
            if (blockedAttack > 0) {
                this.metrics.responseCodes[ResponseCode.HTTP_403] += blockedAttack;
            }

            const totalInput = inputMix[RequestType.WEB] + inputMix[RequestType.DB_READ] + inputMix[RequestType.DB_WRITE] + inputMix[RequestType.DB_SEARCH] + inputMix[RequestType.STATIC] + inputMix[RequestType.ATTACK];
            if (totalInput <= 0.1) continue;
            
            trafficMoved = true;

            let capacity = 999999;
            if (node.type === NodeType.COMPUTE && node.tier) capacity = COMPUTE_TIERS[node.tier].capacity;
            else if (node.type === NodeType.CDN && node.cdnTier) capacity = CDN_TIERS[node.cdnTier].capacity;
            else if (node.type === NodeType.WAF) capacity = 50000;
            else if (node.type === NodeType.FIREWALL) capacity = 200000;
            else if (node.type === NodeType.LOAD_BALANCER) capacity = 100000;
            else if (node.type === NodeType.CACHE) capacity = 20000;
            else if (node.type === NodeType.DATABASE) capacity = node.dbRole === DbRole.PRIMARY ? 3000 : 5000; 
            else if (node.type === NodeType.DATABASE_NOSQL) capacity = 15000; 
            
            const attackWeight = (node.type === NodeType.FIREWALL || node.type === NodeType.WAF) ? 1 : 10;
            let effectiveWriteLoad = inputMix[RequestType.DB_WRITE];
            if (node.type === NodeType.DATABASE && node.dbRole === DbRole.PRIMARY) {
                effectiveWriteLoad *= WRITE_LOCKING_PENALTY;
            }

            const weightedInput = 
                (totalInput - inputMix[RequestType.ATTACK] - inputMix[RequestType.DB_WRITE]) + 
                effectiveWriteLoad +
                (inputMix[RequestType.ATTACK] * attackWeight);

            const ratio = capacity > 0 ? Math.min(1, capacity / weightedInput) : 0;
            const dropped = totalInput * (1 - ratio);
            
            // STATUS 429 CHECK: Capacity Limit
            if (dropped > 0) {
                this.metrics.responseCodes[ResponseCode.HTTP_429] += dropped;
            }

            node.currentLoad = ratio < 1 ? 100 : (weightedInput / capacity) * 100;

            const loadFactor = Math.min(0.99, node.currentLoad / 100);
            maxNodeLoadFactor = Math.max(maxNodeLoadFactor, loadFactor);

            const nodeLatency = 5 + (20 * loadFactor) + (loadFactor > 0.85 ? Math.pow(loadFactor * 10 - 8.5, 3) * 10 : 0);
            
            if (node.processedReqs > 0) {
                totalLatencyAccumulator += nodeLatency;
                nodesContributingToLatency++;
            }
            
            if (!node.loadHistory) node.loadHistory = [];
            node.loadHistory.push(node.currentLoad);
            if (node.loadHistory.length > 30) node.loadHistory.shift();

            node.droppedReqs += dropped;
            node.processedReqs += (totalInput * ratio);

            let web = inputMix[RequestType.WEB] * ratio;
            let dbRead = inputMix[RequestType.DB_READ] * ratio;
            let dbWrite = inputMix[RequestType.DB_WRITE] * ratio;
            let dbSearch = inputMix[RequestType.DB_SEARCH] * ratio;
            let stat = inputMix[RequestType.STATIC] * ratio;
            let attack = inputMix[RequestType.ATTACK] * ratio;
            
            if (ratio < 1) {
                bWebFail += inputMix[RequestType.WEB] * (1-ratio);
                bDbReadFail += inputMix[RequestType.DB_READ] * (1-ratio);
                bDbWriteFail += inputMix[RequestType.DB_WRITE] * (1-ratio);
                bDbSearchFail += inputMix[RequestType.DB_SEARCH] * (1-ratio);
                bStaticFail += inputMix[RequestType.STATIC] * (1-ratio);
                bAttackFail += inputMix[RequestType.ATTACK] * (1-ratio);
            }

            const childrenIds = this.adjacencyMap.get(node.id) || [];
            const shouldSpawnParticle = Math.random() < 0.1;

            if (node.type === NodeType.CDN) {
                 const connectedStorage = childrenIds.find(tid => this.nodeDataMap.get(tid)?.type === NodeType.STORAGE);
                 
                 if (!connectedStorage) {
                     node.hasStorageConnection = false;
                     // STATUS 503: Routing Failure (Missing dependency)
                     const droppedTraffic = stat + web + dbRead + dbWrite + dbSearch + attack;
                     this.metrics.responseCodes[ResponseCode.HTTP_503] += droppedTraffic;
                     
                     bStaticFail += stat; bWebFail += web; bDbReadFail += dbRead; bDbWriteFail += dbWrite; bDbSearchFail += dbSearch; bAttackFail += attack;
                     continue;
                 }
                 node.hasStorageConnection = true;
                 
                 const next = this.simBufferNext.get(connectedStorage);
                 if (next) next[RequestType.ATTACK] += attack;
                 if (shouldSpawnParticle && attack > 1) this.spawnParticle(node.id, connectedStorage, RequestType.ATTACK);

                 bWebFail += web; bDbReadFail += dbRead; bDbWriteFail += dbWrite; bDbSearchFail += dbSearch;

                 if (stat > 0) {
                    const tierConfig = node.cdnTier ? CDN_TIERS[node.cdnTier] : CDN_TIERS[CdnTier.EDGE_BASIC];
                    const maxRate = tierConfig.maxHitRate;
                    node.totalServed = (node.totalServed || 0) + stat;
                    const warmFactor = (node.totalServed) / (node.totalServed + CDN_WARMUP_CONSTANT);
                    const effectiveHitRate = maxRate * warmFactor;
                    node.cacheHitRate = effectiveHitRate; 

                    const hits = stat * effectiveHitRate;
                    const misses = stat * (1 - effectiveHitRate);

                    bStaticSuc += hits;
                    const nextMix = this.simBufferNext.get(connectedStorage);
                    if (nextMix) nextMix[RequestType.STATIC] += misses;
                    if (shouldSpawnParticle) this.spawnParticle(node.id, connectedStorage, RequestType.STATIC);
                 }

            } else if (node.type === NodeType.COMPUTE) {
                bWebSuc += web; 
                bAttackSuc += attack; 

                const cacheNode = childrenIds.find(tid => this.nodeDataMap.get(tid)?.type === NodeType.CACHE);
                const sqlPrimary = childrenIds.find(tid => {
                    const n = this.nodeDataMap.get(tid);
                    return n?.type === NodeType.DATABASE && n?.dbRole === DbRole.PRIMARY;
                });
                const sqlReplicas = childrenIds.filter(tid => {
                    const n = this.nodeDataMap.get(tid);
                    return n?.type === NodeType.DATABASE && n?.dbRole === DbRole.REPLICA;
                });
                const noSqlNode = childrenIds.find(tid => this.nodeDataMap.get(tid)?.type === NodeType.DATABASE_NOSQL);
                const storageNodes = childrenIds.filter(tid => this.nodeDataMap.get(tid)?.type === NodeType.STORAGE);

                if (attack > 0) {
                    const targets = [...sqlReplicas, sqlPrimary, noSqlNode, cacheNode].filter(t => !!t);
                    if (targets.length > 0) {
                        const share = 1 / targets.length;
                        for (const tid of targets) {
                            if (!tid) continue;
                            const next = this.simBufferNext.get(tid);
                            if (next) next[RequestType.ATTACK] += attack * share;
                            if (shouldSpawnParticle && attack > 5) this.spawnParticle(node.id, tid, RequestType.ATTACK);
                        }
                    }
                }

                if (dbSearch > 0) {
                    if (noSqlNode) {
                        const next = this.simBufferNext.get(noSqlNode);
                        if(next) next[RequestType.DB_SEARCH] += dbSearch;
                        if (shouldSpawnParticle) this.spawnParticle(node.id, noSqlNode, RequestType.DB_SEARCH);
                    } else if (sqlPrimary || sqlReplicas.length > 0) {
                        const target = sqlReplicas.length > 0 ? sqlReplicas[0] : sqlPrimary!;
                        const next = this.simBufferNext.get(target);
                        if (next) next[RequestType.DB_SEARCH] += dbSearch; 
                        if (shouldSpawnParticle) this.spawnParticle(node.id, target, RequestType.DB_SEARCH);
                    } else { 
                        this.metrics.responseCodes[ResponseCode.HTTP_503] += dbSearch;
                        bDbSearchFail += dbSearch; 
                    }
                }

                if (dbWrite > 0) {
                    if (sqlPrimary) {
                         const next = this.simBufferNext.get(sqlPrimary);
                         if (next) next[RequestType.DB_WRITE] += dbWrite;
                         if (shouldSpawnParticle) this.spawnParticle(node.id, sqlPrimary, RequestType.DB_WRITE);
                         if (cacheNode) {
                             const cacheData = this.nodeDataMap.get(cacheNode);
                             if (cacheData) cacheData.invalidationPressure = (cacheData.invalidationPressure || 0) + dbWrite;
                         }
                    } else { 
                        this.metrics.responseCodes[ResponseCode.HTTP_503] += dbWrite;
                        bDbWriteFail += dbWrite; 
                    }
                }

                if (dbRead > 0) {
                    let remainingRead = dbRead;
                    if (cacheNode) {
                        const cNode = this.nodeDataMap.get(cacheNode);
                        if (cNode) cNode.totalServed = (cNode.totalServed || 0) + dbRead;
                        const rate = cNode?.cacheHitRate || 0;
                        const hits = dbRead * rate;
                        remainingRead = dbRead - hits;
                        const next = this.simBufferNext.get(cacheNode);
                        if (next) next[RequestType.DB_READ] += hits; 
                        if (shouldSpawnParticle && dbRead > 0) this.spawnParticle(node.id, cacheNode, RequestType.DB_READ);
                    }
                    if (remainingRead > 0) {
                        const targets = sqlReplicas.length > 0 ? sqlReplicas : (sqlPrimary ? [sqlPrimary] : []);
                        if (targets.length > 0) {
                            const share = 1 / targets.length;
                            for (const tid of targets) {
                                const next = this.simBufferNext.get(tid);
                                if (next) next[RequestType.DB_READ] += remainingRead * share;
                                if (shouldSpawnParticle) this.spawnParticle(node.id, tid, RequestType.DB_READ);
                            }
                        } else { 
                            this.metrics.responseCodes[ResponseCode.HTTP_503] += remainingRead;
                            bDbReadFail += remainingRead; 
                        }
                    }
                }
                if (stat > 0) {
                     if (storageNodes.length > 0) {
                         const share = 1 / storageNodes.length;
                         for (const tid of storageNodes) {
                             const next = this.simBufferNext.get(tid);
                             if (next) next[RequestType.STATIC] += stat * share;
                             if (shouldSpawnParticle) this.spawnParticle(node.id, tid, RequestType.STATIC);
                         }
                     } else { 
                         this.metrics.responseCodes[ResponseCode.HTTP_503] += stat;
                         bStaticFail += stat; 
                     }
                }

            } else if (node.type === NodeType.CACHE) {
                bDbReadSuc += dbRead; 
                bAttackSuc += attack;
                bWebFail += web; bDbWriteFail += dbWrite; bStaticFail += stat; bDbSearchFail += dbSearch;
                const warmFactor = (node.totalServed || 0) / ((node.totalServed || 0) + CACHE_WARMUP_CONSTANT);
                const pressure = node.invalidationPressure || 0;
                const poisonFactor = Math.min(0.5, pressure * CACHE_WRITE_PENALTY); 
                node.invalidationPressure = 0;
                node.cacheHitRate = Math.max(0.1, Math.min(0.95, warmFactor - poisonFactor));
                if (node.cacheHitRate > 0 && dbRead > 0) {
                    const estimatedTotalLookups = dbRead / node.cacheHitRate;
                    if (estimatedTotalLookups > node.processedReqs) node.processedReqs = estimatedTotalLookups;
                }

            } else if (node.type === NodeType.DATABASE) {
                if (node.dbRole === DbRole.REPLICA) {
                     bDbWriteFail += dbWrite; bDbReadSuc += dbRead;
                } else {
                     bDbWriteSuc += dbWrite; bDbReadSuc += dbRead;
                }
                bDbSearchSuc += dbSearch; 
                bAttackSuc += attack;
                bWebFail += web; bStaticFail += stat;

            } else if (node.type === NodeType.DATABASE_NOSQL) {
                bDbSearchSuc += dbSearch; bDbWriteSuc += dbWrite; bDbReadSuc += dbRead; 
                bAttackSuc += attack;
                bWebFail += web; bStaticFail += stat;
            } else if (node.type === NodeType.STORAGE) {
                bStaticSuc += stat;
                bAttackSuc += attack;
                bWebFail += web; bDbReadFail += dbRead; bDbWriteFail += dbWrite; bDbSearchFail += dbSearch;
            } else {
                const cdnChildren = childrenIds.filter(tid => this.nodeDataMap.get(tid)?.type === NodeType.CDN);
                const otherChildren = childrenIds.filter(tid => this.nodeDataMap.get(tid)?.type !== NodeType.CDN);
                
                if (stat > 0) {
                    if (cdnChildren.length > 0) {
                        const share = 1 / cdnChildren.length;
                        for (const tid of cdnChildren) {
                            const next = this.simBufferNext.get(tid);
                            if (next) next[RequestType.STATIC] += stat * share;
                            if (shouldSpawnParticle) this.spawnParticle(node.id, tid, RequestType.STATIC);
                        }
                    } else if (otherChildren.length > 0) {
                        const share = 1 / otherChildren.length;
                        for (const tid of otherChildren) {
                            const next = this.simBufferNext.get(tid);
                            if (next) next[RequestType.STATIC] += stat * share;
                        }
                    } else { 
                        this.metrics.responseCodes[ResponseCode.HTTP_503] += stat;
                        bStaticFail += stat; 
                    }
                }

                const totalDynamic = web + dbRead + dbWrite + dbSearch + attack;
                if (totalDynamic > 0) {
                    if (otherChildren.length > 0) {
                        if (node.type === NodeType.LOAD_BALANCER && node.algorithm === LoadBalancerAlgo.LEAST_CONNECTION) {
                             let totalCapacityScore = 0;
                             const scores = otherChildren.map(tid => {
                                 const child = this.nodeDataMap.get(tid);
                                 const load = child ? child.currentLoad : 100;
                                 const status = child ? child.status : 'down';
                                 const score = status === 'active' ? Math.max(1, 100 - load) : 0;
                                 totalCapacityScore += score;
                                 return { id: tid, score };
                             });

                             if (totalCapacityScore > 0) {
                                 for (const { id: tid, score } of scores) {
                                     const ratio = score / totalCapacityScore;
                                     const next = this.simBufferNext.get(tid);
                                     if (next) {
                                         next[RequestType.WEB] += web * ratio;
                                         next[RequestType.DB_READ] += dbRead * ratio;
                                         next[RequestType.DB_WRITE] += dbWrite * ratio;
                                         next[RequestType.DB_SEARCH] += dbSearch * ratio;
                                         next[RequestType.ATTACK] += attack * ratio;
                                     }
                                     if (shouldSpawnParticle && ratio > 0.05) {
                                         if (attack > 1) this.spawnParticle(node.id, tid, RequestType.ATTACK);
                                         else this.spawnParticle(node.id, tid, RequestType.WEB);
                                     }
                                 }
                             } else {
                                  // 503 from LB (No healthy nodes)
                                  this.metrics.responseCodes[ResponseCode.HTTP_503] += totalDynamic;
                                  bWebFail += web; bDbReadFail += dbRead; bDbWriteFail += dbWrite; bDbSearchFail += dbSearch; bAttackFail += attack;
                             }
                        } else {
                            const share = 1 / otherChildren.length;
                            for (const tid of otherChildren) {
                                const next = this.simBufferNext.get(tid);
                                if (next) {
                                    next[RequestType.WEB] += web * share;
                                    next[RequestType.DB_READ] += dbRead * share;
                                    next[RequestType.DB_WRITE] += dbWrite * share;
                                    next[RequestType.DB_SEARCH] += dbSearch * share;
                                    next[RequestType.ATTACK] += attack * share;
                                }
                                if (shouldSpawnParticle) {
                                    if (attack > 1) this.spawnParticle(node.id, tid, RequestType.ATTACK);
                                    else {
                                        let pType = RequestType.WEB;
                                        if (dbSearch > web) pType = RequestType.DB_SEARCH;
                                        else if (dbWrite > web) pType = RequestType.DB_WRITE;
                                        this.spawnParticle(node.id, tid, pType);
                                    }
                                }
                            }
                        }
                    } else {
                         // 503 from LB/Gateway (No children)
                         this.metrics.responseCodes[ResponseCode.HTTP_503] += totalDynamic;
                         bWebFail += web; bDbReadFail += dbRead; bDbWriteFail += dbWrite; bDbSearchFail += dbSearch; bAttackFail += attack;
                    }
                }
            }
        }

        if (!trafficMoved) break;

        for (const [id, nextMix] of this.simBufferNext) {
            const curr = this.simBufferCurrent.get(id);
            if (curr) {
                curr[RequestType.WEB] = nextMix[RequestType.WEB];
                curr[RequestType.DB_READ] = nextMix[RequestType.DB_READ];
                curr[RequestType.DB_WRITE] = nextMix[RequestType.DB_WRITE];
                curr[RequestType.DB_SEARCH] = nextMix[RequestType.DB_SEARCH];
                curr[RequestType.STATIC] = nextMix[RequestType.STATIC];
                curr[RequestType.ATTACK] = nextMix[RequestType.ATTACK];
            }
        }
    }

    const successful = bWebSuc + bDbReadSuc + bDbWriteSuc + bDbSearchSuc + bStaticSuc;
    const failed = bWebFail + bDbReadFail + bDbWriteFail + bDbSearchFail + bStaticFail;

    // Everything that wasn't an explicit error but finished successfully is a 200 OK
    this.metrics.responseCodes[ResponseCode.HTTP_200] = successful;

    this.metrics.activeUsers = totalIncoming;
    this.metrics.revenuePerSec = 
        (bWebSuc * REVENUE_BY_TYPE[RequestType.WEB]) +
        (bDbReadSuc * REVENUE_BY_TYPE[RequestType.DB_READ]) +
        (bDbWriteSuc * REVENUE_BY_TYPE[RequestType.DB_WRITE]) +
        (bDbSearchSuc * REVENUE_BY_TYPE[RequestType.DB_SEARCH]) +
        (bStaticSuc * REVENUE_BY_TYPE[RequestType.STATIC]);

    this.metrics.successfulRequests = successful;
    this.metrics.failedRequests = failed;
    this.metrics.totalRequests = totalIncoming;
    
    const legitIncoming = totalIncoming - attackVolume;
    this.metrics.uptime = legitIncoming > 0 ? Math.min(100, (successful / legitIncoming) * 100) : 100;

    const avgNodeLatency = nodesContributingToLatency > 0 ? totalLatencyAccumulator / nodesContributingToLatency : 0;
    this.metrics.latencyMs = Math.round(20 + avgNodeLatency);
    
    // Heuristic P95: Avg + Penalties for saturated nodes
    // If max load > 90%, P95 skyrockets
    const p95Penalty = maxNodeLoadFactor > 0.8 
        ? (maxNodeLoadFactor - 0.8) * 2000 
        : (maxNodeLoadFactor * 50); 
    this.metrics.p95LatencyMs = Math.round(this.metrics.latencyMs * 1.5 + p95Penalty);

    const totalLegitFailed = (failed - bAttackFail); 
    const errorRate = legitIncoming > 0 ? totalLegitFailed / legitIncoming : 0;
    
    let latencyPenalty = 0;
    if (this.metrics.p95LatencyMs > 500) latencyPenalty = 0.1;
    if (this.metrics.p95LatencyMs > 1500) latencyPenalty = 0.3;

    if (errorRate > 0.05) {
        this.metrics.userSatisfaction = Math.max(0, this.metrics.userSatisfaction - SATISFACTION_PENALTY_RATE);
    } else {
        this.metrics.userSatisfaction = Math.min(100, Math.max(0, this.metrics.userSatisfaction + SATISFACTION_RECOVERY_RATE - latencyPenalty));
    }
    
    this.metrics.requestsByType[RequestType.WEB].successful = bWebSuc;
    this.metrics.requestsByType[RequestType.WEB].failed = bWebFail;
    this.metrics.requestsByType[RequestType.DB_READ].successful = bDbReadSuc;
    this.metrics.requestsByType[RequestType.DB_READ].failed = bDbReadFail;
    this.metrics.requestsByType[RequestType.DB_WRITE].successful = bDbWriteSuc;
    this.metrics.requestsByType[RequestType.DB_WRITE].failed = bDbWriteFail;
    this.metrics.requestsByType[RequestType.DB_SEARCH].successful = bDbSearchSuc;
    this.metrics.requestsByType[RequestType.DB_SEARCH].failed = bDbSearchFail;
    this.metrics.requestsByType[RequestType.STATIC].successful = bStaticSuc;
    this.metrics.requestsByType[RequestType.STATIC].failed = bStaticFail;
    this.metrics.requestsByType[RequestType.ATTACK].successful = bAttackSuc;
    this.metrics.requestsByType[RequestType.ATTACK].failed = bAttackFail;
  }
}

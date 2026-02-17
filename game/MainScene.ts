
import Phaser from 'phaser';
import { v4 as uuidv4 } from 'uuid';
import { 
  NodeType, NodeData, Connection, GameMetrics, ComputeTier, CdnTier, RequestType, LoadBalancerAlgo, DbRole, ResponseCode 
} from '../types';
import { 
  COMPUTE_TIERS, CDN_TIERS, NODE_COSTS, NODE_OPEX, REVENUE_BY_TYPE, 
  NODE_LABELS, UPGRADE_TIME_MS, REQUEST_HEX_COLORS, TRAFFIC_MIX, 
  CDN_WARMUP_CONSTANT, CACHE_WARMUP_CONSTANT, CACHE_WRITE_PENALTY,
  SATISFACTION_PENALTY_RATE, SATISFACTION_RECOVERY_RATE,
  CHAOS_FAILURE_CHANCE_PER_TICK, REPAIR_TIME_MS, CROSS_AZ_LATENCY,
  SLA_PENALTY_RATE, TECH_POINTS_PER_SUCCESS
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
    connPort: Phaser.GameObjects.Arc;
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
  currentBaseTraffic: number = 100;

  // Wave State
  waveCountdownTimer: number = 30000; // 30s peace time
  currentWaveVolume: number = 0;
  
  // Attack State
  isUnderAttack: boolean = false;
  attackTimer: number = 0;
  attackCooldownTimer: number = 0; 
  
  // Timers & Flags
  tickAccumulator: number = 0;
  billingAccumulator: number = 0;
  lastReactUpdate: number = 0;
  lastTextUpdate: number = 0; 
  lastSlaLogTime: number = 0;
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
  onEvent!: (message: string, type: 'info' | 'warn' | 'error' | 'success') => void;

  simBufferCurrent: Map<string, TrafficMix> = new Map();
  simBufferNext: Map<string, TrafficMix> = new Map();

  constructor() {
    super({ key: 'MainScene' });
    this.metrics = this.createInitialMetrics();
  }

  createInitialMetrics(): GameMetrics {
      return {
          cash: 3000,
          techPoints: 0,
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
          currentWave: 0,
          waveStatus: 'peace',
          waveCountdown: 30,
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
    this.currentBaseTraffic = 100;
    this.waveCountdownTimer = 30000;
    this.currentWaveVolume = 0;
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

  public logEvent(message: string, type: 'info' | 'warn' | 'error' | 'success' = 'info') {
      if (this.onEvent) {
          this.onEvent(message, type);
      }
  }

  public externalAddNode(type: NodeType, x: number, y: number, initialTier?: ComputeTier) {
    let cost = NODE_COSTS[type];
    let typeName = NODE_LABELS[type];

    if (type === NodeType.COMPUTE && initialTier) {
        cost = COMPUTE_TIERS[initialTier].capex;
        typeName = `Compute (${COMPUTE_TIERS[initialTier].name})`;
    }

    if (this.metrics.cash >= cost) {
      this.metrics.cash -= cost;
      this.addNode(type, x, y, undefined, initialTier);
      this.logEvent(`Provisioned ${typeName}`, 'success');
      this.updateReactMetrics(true); 
    } else {
      this.logEvent(`Insufficient funds for ${typeName}`, 'error');
      if (this.onInsufficientFunds) this.onInsufficientFunds();
    }
  }

  public externalDeleteNode(id: string) {
    if (id.startsWith('internet')) return;
    
    const node = this.nodeDataMap.get(id);
    if (node) {
        this.logEvent(`Decommissioned ${NODE_LABELS[node.type]} (${id})`, 'info');
    }

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
      this.logEvent(`Upgrading ${id} to ${name}`, 'info');
      this.updateReactMetrics(true);
      this.broadcastGraphUpdate();
    } else {
        this.logEvent(`Insufficient funds for upgrade`, 'error');
    }
  }

  public externalSetAlgorithm(id: string, algo: LoadBalancerAlgo) {
    const node = this.nodeDataMap.get(id);
    if (node && node.type === NodeType.LOAD_BALANCER) {
      node.algorithm = algo;
      
      const vis = this.nodeVisuals.get(id);
      if (vis) {
        vis.subLabel.setText('LB Configuration');
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
    
    const tier = (type === NodeType.COMPUTE || type === NodeType.AUTOSCALING_GROUP)
        ? (initialTier || ComputeTier.T1) 
        : undefined;

    const az = x < 400 ? 'A' : 'B';
    const hasManagedDB = this.metrics.unlockedTech?.includes('managed_db');
    const isManaged = [NodeType.STORAGE, NodeType.CDN].includes(type) ||
                      ([NodeType.DATABASE, NodeType.DATABASE_NOSQL, NodeType.CACHE].includes(type) && hasManagedDB);

    const nodeData: NodeData = {
      id,
      type,
      x,
      y,
      az,
      isManaged,
      currentLoad: 0,
      loadHistory: new Array(30).fill(0),
      processedReqs: 0,
      droppedReqs: 0,
      status: 'active', 
      tier,
      currentInstances: type === NodeType.AUTOSCALING_GROUP ? 1 : undefined,
      minInstances: type === NodeType.AUTOSCALING_GROUP ? 1 : undefined,
      maxInstances: type === NodeType.AUTOSCALING_GROUP ? 5 : undefined,
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

    const azText = this.add.text(width/2 - 10, -height/2 + 5, `AZ-${az}`, {
        fontSize: '8px', fontFamily: 'JetBrains Mono', color: az === 'A' ? '#60a5fa' : '#f87171'
    }).setOrigin(1, 0);
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

    // Connection Port (Integrated Drag handle)
    const connPort = this.add.circle(width/2, 0, 6, 0x6366f1, 0.2);
    connPort.setStrokeStyle(1.5, 0x6366f1, 1);
    connPort.setInteractive({ useHandCursor: true });

    connPort.on('pointerover', () => {
        connPort.setFillStyle(0x6366f1, 0.8);
        connPort.setRadius(8);
    });
    connPort.on('pointerout', () => {
        connPort.setFillStyle(0x6366f1, 0.2);
        connPort.setRadius(6);
    });

    container.add([selectionBorder, bg, accent, label, subLabel, azText, statsText, loadBarBg, loadBarFill, warnIcon, repairIcon, connPort]);
    this.nodeGroup.add(container);

    this.nodeVisuals.set(id, {
        container,
        loadBarFill,
        statsText,
        selectionBorder,
        subLabel,
        warnIcon,
        repairIcon,
        connPort
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

      // Don't move if we are dragging from the port
      if (this.connectingNodeId === id) return;

      container.x = dragX;
      container.y = dragY;
      
      const n = this.nodeDataMap.get(id);
      if (n) { n.x = dragX; n.y = dragY; }
      
      this.visualsDirty = true;
    });

    // Connection Port Dragging
    connPort.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        this.connectingNodeId = id;
        pointer.event.stopPropagation();
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
      this.logEvent(`Link removed: ${sourceId} ⇥ ${targetId}`, 'warn');
    } else {
      this.connections.push({ id: uuidv4(), sourceId, targetId });
      this.logEvent(`Link established: ${sourceId} ↦ ${targetId}`, 'success');
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
      const sourceVis = this.nodeVisuals.get(this.connectingNodeId);

      if (sourceNode && sourceVis) {
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

        // Start from the connection port visual position
        const startX = sourceVis.container.x + sourceVis.connPort.x;
        const startY = sourceVis.container.y + sourceVis.connPort.y;

        this.dragLine.lineStyle(3, lineColor, lineAlpha);
        this.dragLine.beginPath();
        this.dragLine.moveTo(startX, startY);
        this.dragLine.lineTo(targetX, targetY);
        this.dragLine.strokePath();

        // Draw a small circle at the target
        this.dragLine.fillStyle(lineColor, lineAlpha);
        this.dragLine.fillCircle(targetX, targetY, 4);
      }
    }
  }

  handlePointerUp() {
    if (this.connectingNodeId) {
      // Check if dropped on a node
      const pointer = this.input.activePointer;
      const targets = this.input.hitTestPointer(pointer);
      const hitContainer = targets.find(t => this.nodeGroup.contains(t)) as Phaser.GameObjects.Container;

      if (hitContainer) {
          const targetId = hitContainer.getData('id');
          if (targetId && targetId !== this.connectingNodeId) {
              this.toggleConnection(this.connectingNodeId, targetId);
          }
      }
      this.connectingNodeId = null;
      this.dragLine.clear();
    }
  }

  update(time: number, delta: number) {
    if (!this.isPaused) {
       const effectiveDelta = delta * this.simulationSpeed;
       
       this.handleWaveLogic(effectiveDelta);

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

         if (node.scalingCooldown && node.scalingCooldown > 0) {
             node.scalingCooldown -= effectiveDelta;
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
               this.logEvent(`SECURITY: DDoS Attack mitigated. Resuming normal operations.`, 'success');
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

  handleWaveLogic(delta: number) {
      if (this.metrics.waveStatus === 'peace') {
          this.waveCountdownTimer -= delta;
          this.metrics.waveCountdown = Math.ceil(this.waveCountdownTimer / 1000);

          if (this.waveCountdownTimer <= 0) {
              this.startWave();
          }
      } else {
          // Wave is active
          if (this.currentBaseTraffic < this.currentWaveVolume) {
              this.currentBaseTraffic += (this.currentWaveVolume / 20) * (delta / 1000);
          }

          // Wave lasts for a certain amount of processed requests or time
          // For simplicity, let's say 45 seconds of traffic
          this.waveCountdownTimer -= delta;
          this.metrics.waveCountdown = Math.ceil(this.waveCountdownTimer / 1000);

          if (this.waveCountdownTimer <= 0) {
              this.endWave();
          }
      }
  }

  startWave() {
      this.metrics.currentWave++;
      this.metrics.waveStatus = 'active';
      this.waveCountdownTimer = 45000; // Wave lasts 45s

      const waveNum = this.metrics.currentWave;
      this.currentWaveVolume = 500 * Math.pow(1.5, waveNum);

      // Randomly decide if this wave has a DDoS component
      if (waveNum > 2 && Math.random() < 0.4) {
          this.triggerAttack();
      }

      this.logEvent(`WAVE ${waveNum} STARTED: Incoming traffic spike!`, 'warn');
  }

  endWave() {
      this.metrics.waveStatus = 'peace';
      this.waveCountdownTimer = 30000; // 30s peace
      this.currentWaveVolume = 100; // Back to baseline
      this.isUnderAttack = false;
      this.metrics.isUnderAttack = false;
      this.logEvent(`WAVE COMPLETED: System stabilizing.`, 'success');
  }

  runChaosMonkey(effectiveDelta: number) {
      if (this.isPaused) return;

      this.nodes.forEach(node => {
          if (node.status === 'active' && !node.isManaged && !node.id.startsWith('internet')) {
              // Non-managed nodes (like EC2 instances not in ASG) have a small failure chance
              if (Math.random() < CHAOS_FAILURE_CHANCE_PER_TICK * this.simulationSpeed) {
                  node.status = 'down';
                  node.failureTimeLeft = REPAIR_TIME_MS;
                  this.logEvent(`INFRA ALERT: ${node.id} suffered a hardware failure!`, 'error');
              }
          }
      });
  }
  
  triggerAttack() {
      this.isUnderAttack = true;
      this.metrics.isUnderAttack = true;
      this.attackTimer = 15000 + Math.random() * 15000; 
      this.metrics.attackTimeLeft = Math.ceil(this.attackTimer / 1000);
      this.logEvent(`CRITICAL: DDoS Attack detected! Impacting system stability.`, 'error');
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
                  const sourceVis = this.nodeVisuals.get(p.sourceId);
                  const targetVis = this.nodeVisuals.get(p.targetId);
                  
                  let sX = source.x, sY = source.y, tX = target.x, tY = target.y;
                  if (sourceVis && targetVis) {
                      sX = sourceVis.container.x + sourceVis.connPort.x;
                      sY = sourceVis.container.y + sourceVis.connPort.y;
                      tX = targetVis.container.x - targetVis.container.width/2;
                      tY = targetVis.container.y;
                  }

                  const xDiff = Math.abs(tX - sX);
                  const cpOffset = Math.max(xDiff * 0.5, 50);

                  const x = this.cubicBezier(p.t, sX, sX + cpOffset, tX - cpOffset, tX);
                  const y = this.cubicBezier(p.t, sY, sY, tY, tY);
                  
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
      const sourceVis = this.nodeVisuals.get(conn.sourceId);
      const targetVis = this.nodeVisuals.get(conn.targetId);
      
      if (source && target && sourceVis && targetVis) {
        const startX = sourceVis.container.x + sourceVis.connPort.x;
        const startY = sourceVis.container.y + sourceVis.connPort.y;

        // Target anchor: middle left
        const targetX = targetVis.container.x - targetVis.container.width/2;
        const targetY = targetVis.container.y;

        const xDiff = Math.abs(targetX - startX);
        const cpOffset = Math.max(xDiff * 0.5, 50);

        this.tempBezier.p0.set(startX, startY);
        this.tempBezier.p1.set(startX + cpOffset, startY);
        this.tempBezier.p2.set(targetX - cpOffset, targetY);
        this.tempBezier.p3.set(targetX, targetY);
        
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
    const hasLambda = this.metrics.unlockedTech?.includes('serverless_lambda');

    for (let i = 0; i < this.nodes.length; i++) {
        const node = this.nodes[i];

        // Serverless Lambda effect: No idle cost if load is 0
        if (hasLambda && node.type === NodeType.COMPUTE && node.currentLoad < 1) {
            continue;
        }

        let nodeOpex = 0;
        if (node.tier) {
            nodeOpex = COMPUTE_TIERS[node.tier].opex;
        } else if (node.cdnTier) {
            nodeOpex = CDN_TIERS[node.cdnTier].opex;
        } else {
            nodeOpex = NODE_OPEX[node.type];
        }

        // Auto-scaling cost multiplier
        if (node.type === NodeType.AUTOSCALING_GROUP && node.currentInstances) {
            nodeOpex *= node.currentInstances;
        }

        totalOpex += nodeOpex;
    }

    // SLA Penalty
    let slaPenalty = 0;
    const now = Date.now();
    if (this.metrics.uptime < 99.9 || this.metrics.p95LatencyMs > 1000) {
        slaPenalty = SLA_PENALTY_RATE;
        if (this.metrics.uptime < 95) slaPenalty *= 5;

        // Throttle logging to once per 10 seconds
        if (now > this.lastSlaLogTime + 10000) {
            this.logEvent(`SLA VIOLATION: Deducting ${slaPenalty} due to poor service level.`, 'error');
            this.lastSlaLogTime = now;
        }
    }

    this.metrics.cash = this.metrics.cash - totalOpex + this.metrics.revenuePerSec - slaPenalty;
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
    const dailyCycle = Math.sin(time * 0.2) * (this.currentBaseTraffic * 0.1);
    const noise = (Math.random() - 0.5) * (this.currentBaseTraffic * 0.05); 
    
    let totalIncoming = Math.floor(Math.max(10, this.currentBaseTraffic + dailyCycle + noise));
    
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
            const hasShield = this.metrics.unlockedTech?.includes('shield_advanced');

            if (node.type === NodeType.FIREWALL) {
                inputMix[RequestType.ATTACK] *= hasShield ? 0.05 : 0.2;
            } else if (node.type === NodeType.WAF) {
                inputMix[RequestType.ATTACK] *= hasShield ? 0.0001 : 0.001;
            }
            const blockedAttack = initialAttack - inputMix[RequestType.ATTACK];
            if (blockedAttack > 0) {
                this.metrics.responseCodes[ResponseCode.HTTP_403] += blockedAttack;
            }

            const totalInput = inputMix[RequestType.WEB] + inputMix[RequestType.DB_READ] + inputMix[RequestType.DB_WRITE] + inputMix[RequestType.DB_SEARCH] + inputMix[RequestType.STATIC] + inputMix[RequestType.ATTACK];
            if (totalInput <= 0.1) continue;
            
            trafficMoved = true;

            let capacity = 999999;
            if (node.type === NodeType.COMPUTE && node.tier) {
                capacity = COMPUTE_TIERS[node.tier].capacity;
            } else if (node.type === NodeType.AUTOSCALING_GROUP && node.tier) {
                // Scaling Logic
                const baseCap = COMPUTE_TIERS[node.tier].capacity;

                if (!node.scalingCooldown || node.scalingCooldown <= 0) {
                    if (node.currentLoad > 85 && node.currentInstances! < node.maxInstances!) {
                        node.currentInstances!++;
                        node.scalingCooldown = 15000; // 15s cooldown
                        this.logEvent(`ASG ${node.id} scaled UP to ${node.currentInstances} instances.`, 'info');
                    } else if (node.currentLoad < 30 && node.currentInstances! > node.minInstances!) {
                        node.currentInstances!--;
                        node.scalingCooldown = 15000; // 15s cooldown
                        this.logEvent(`ASG ${node.id} scaled DOWN to ${node.currentInstances} instances.`, 'info');
                    }
                }

                capacity = baseCap * (node.currentInstances || 1);

                const vis = this.nodeVisuals.get(node.id);
                if (vis) vis.subLabel.setText(`${node.currentInstances}x ${COMPUTE_TIERS[node.tier].name}`);

            } else if (node.type === NodeType.CDN && node.cdnTier) {
                capacity = CDN_TIERS[node.cdnTier].capacity;
            }
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

            let nodeLatency = 5 + (20 * loadFactor) + (loadFactor > 0.85 ? Math.pow(loadFactor * 10 - 8.5, 3) * 10 : 0);
            
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
                    if (nextMix) {
                        nextMix[RequestType.STATIC] += misses;
                        const targetNode = this.nodeDataMap.get(connectedStorage);
                        if (targetNode && targetNode.az !== node.az) totalLatencyAccumulator += (misses * CROSS_AZ_LATENCY) / (stat || 1);
                    }
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
                        
                        // --- LOAD BALANCER LOGIC START ---
                        const algo = node.algorithm || LoadBalancerAlgo.ROUND_ROBIN;
                        let targets: { id: string; weight: number }[] = [];

                        // 1. Filter Healthy/Available Children
                        const healthyChildren = otherChildren.map(tid => {
                            const c = this.nodeDataMap.get(tid);
                            return c;
                        }).filter(c => c && c.status === 'active') as NodeData[];

                        if (healthyChildren.length === 0) {
                            // No Healthy Targets -> 503
                            this.metrics.responseCodes[ResponseCode.HTTP_503] += totalDynamic;
                            bWebFail += web; bDbReadFail += dbRead; bDbWriteFail += dbWrite; bDbSearchFail += dbSearch; bAttackFail += attack;
                        } else {
                            
                            // 2. Algorithm Weight Calculation
                            if (algo === LoadBalancerAlgo.RANDOM) {
                                // Random: Equal weights, random noise added later or handled by distribution
                                targets = healthyChildren.map(c => ({ id: c.id, weight: 1 }));

                            } else if (algo === LoadBalancerAlgo.ROUND_ROBIN) {
                                // Round Robin: Equal weights
                                targets = healthyChildren.map(c => ({ id: c.id, weight: 1 }));

                            } else if (algo === LoadBalancerAlgo.WEIGHTED_ROUND_ROBIN) {
                                // Weighted RR: Weight based on Capacity (Tier)
                                targets = healthyChildren.map(c => {
                                    let cap = 100;
                                    if (c.tier) cap = COMPUTE_TIERS[c.tier].capacity;
                                    return { id: c.id, weight: cap };
                                });

                            } else if (algo === LoadBalancerAlgo.LEAST_CONNECTION) {
                                // Least Connection: Invert Load % (More free load = higher weight)
                                // To prevent zero, we add small epsilon
                                targets = healthyChildren.map(c => {
                                    const free = Math.max(1, 100 - c.currentLoad); 
                                    // Make the curve steep so emptier nodes get MUCH more traffic
                                    return { id: c.id, weight: Math.pow(free, 2) };
                                });

                            } else if (algo === LoadBalancerAlgo.WEIGHTED_LEAST_CONNECTION) {
                                // Weighted Least Conn: Combine Capacity and Free Load %
                                // Effectively "Least Requests" in absolute terms
                                targets = healthyChildren.map(c => {
                                    let cap = 100;
                                    if (c.tier) cap = COMPUTE_TIERS[c.tier].capacity;
                                    const freePct = Math.max(0.01, (100 - c.currentLoad) / 100);
                                    const absoluteFreeCapacity = cap * freePct;
                                    return { id: c.id, weight: absoluteFreeCapacity };
                                });

                            } else if (algo === LoadBalancerAlgo.LEAST_RESPONSE_TIME) {
                                // Least Response Time: Estimate Latency based on Load
                                // Higher load = Higher latency. We want LOWEST latency, so invert.
                                targets = healthyChildren.map(c => {
                                    const loadFactor = c.currentLoad / 100;
                                    // Heuristic latency curve from earlier logic
                                    const latency = 5 + (20 * loadFactor) + (loadFactor > 0.85 ? Math.pow(loadFactor * 10 - 8.5, 3) * 10 : 0);
                                    return { id: c.id, weight: 1000 / Math.max(1, latency) }; // Invert
                                });
                            }

                            // 3. Distribute Traffic based on calculated weights
                            const totalWeight = targets.reduce((acc, t) => acc + t.weight, 0);

                            if (totalWeight > 0) {
                                for (const t of targets) {
                                    let ratio = t.weight / totalWeight;

                                    // For RANDOM, apply jitter to the ratio each tick to simulate randomness
                                    if (algo === LoadBalancerAlgo.RANDOM) {
                                        const noise = (Math.random() - 0.5) * 0.5; // +/- 25% variance
                                        ratio = Math.max(0, ratio + (ratio * noise));
                                        // Renormalize happens naturally over many ticks or accept drift for "random" feel
                                    }

                                    const next = this.simBufferNext.get(t.id);
                                    if (next) {
                                        next[RequestType.WEB] += web * ratio;
                                        next[RequestType.DB_READ] += dbRead * ratio;
                                        next[RequestType.DB_WRITE] += dbWrite * ratio;
                                        next[RequestType.DB_SEARCH] += dbSearch * ratio;
                                        next[RequestType.ATTACK] += attack * ratio;

                                        const targetNode = this.nodeDataMap.get(t.id);
                                        if (targetNode && targetNode.az !== node.az) {
                                            const crossAzLoad = (web + dbRead + dbWrite + dbSearch + attack) * ratio;
                                            totalLatencyAccumulator += (crossAzLoad * CROSS_AZ_LATENCY) / (totalDynamic || 1);
                                        }
                                    }

                                    // Visuals: Particles
                                    if (shouldSpawnParticle) {
                                        // Throttle particles based on ratio to not flood screen with tiny lines
                                        if (ratio > 0.1 || Math.random() < ratio * 5) {
                                            if (attack > 1) this.spawnParticle(node.id, t.id, RequestType.ATTACK);
                                            else {
                                                let pType = RequestType.WEB;
                                                if (dbSearch > web) pType = RequestType.DB_SEARCH;
                                                else if (dbWrite > web) pType = RequestType.DB_WRITE;
                                                this.spawnParticle(node.id, t.id, pType);
                                            }
                                        }
                                    }
                                }
                            }
                        }
                        // --- LOAD BALANCER LOGIC END ---

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

    // Innovation Points gain
    this.metrics.techPoints += successful * TECH_POINTS_PER_SUCCESS;

    this.metrics.successfulRequests = successful;
    this.metrics.failedRequests = failed;
    this.metrics.totalRequests = totalIncoming;
    
    const legitIncoming = totalIncoming - attackVolume;
    this.metrics.uptime = legitIncoming > 0 ? Math.min(100, (successful / legitIncoming) * 100) : 100;

    const hasGlobalAccelerator = this.metrics.unlockedTech?.includes('global_accelerator');
    const baseLatency = hasGlobalAccelerator ? 10 : 20;

    const avgNodeLatency = nodesContributingToLatency > 0 ? totalLatencyAccumulator / nodesContributingToLatency : 0;
    this.metrics.latencyMs = Math.round(baseLatency + avgNodeLatency);
    
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

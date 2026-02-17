
export enum NodeType {
  INTERNET = 'INTERNET',
  WAF = 'WAF',
  FIREWALL = 'FIREWALL',
  LOAD_BALANCER = 'LOAD_BALANCER',
  API_GATEWAY = 'API_GATEWAY',
  CDN = 'CDN',
  COMPUTE = 'COMPUTE',
  DATABASE = 'DATABASE', // SQL (Relational)
  DATABASE_NOSQL = 'DATABASE_NOSQL', // NoSQL (Document/Search)
  STORAGE = 'STORAGE',
  CACHE = 'CACHE'
}

export enum RequestType {
  WEB = 'WEB',          // Needs Compute
  DB_READ = 'DB_READ',  // Needs Database (Read)
  DB_WRITE = 'DB_WRITE',// Needs Database (Write)
  DB_SEARCH = 'DB_SEARCH', // Needs NoSQL (or DB with penalty)
  STATIC = 'STATIC',    // Needs Storage
  ATTACK = 'ATTACK'     // Malicious Traffic
}

export enum ResponseCode {
  HTTP_200 = '200', // OK
  HTTP_403 = '403', // Forbidden (Security Block)
  HTTP_429 = '429', // Too Many Requests (Capacity limit)
  HTTP_500 = '500', // Internal Server Error (Node Down)
  HTTP_503 = '503'  // Service Unavailable (Routing/Dependency fail)
}

export enum ComputeTier {
  T1 = 'T1', // Micro
  T2 = 'T2', // Small
  T3 = 'T3', // Medium
  T4 = 'T4', // Large
  T5 = 'T5', // High-Compute
}

export enum CdnTier {
  EDGE_BASIC = 'EDGE_BASIC',
  EDGE_PRO = 'EDGE_PRO',
  EDGE_ENTERPRISE = 'EDGE_ENTERPRISE'
}

export enum DbRole {
    PRIMARY = 'PRIMARY',
    REPLICA = 'REPLICA'
}

export enum LoadBalancerAlgo {
  ROUND_ROBIN = 'ROUND_ROBIN',
  WEIGHTED_ROUND_ROBIN = 'WEIGHTED_ROUND_ROBIN',
  RANDOM = 'RANDOM',
  LEAST_CONNECTION = 'LEAST_CONNECTION',
  WEIGHTED_LEAST_CONNECTION = 'WEIGHTED_LEAST_CONNECTION',
  LEAST_RESPONSE_TIME = 'LEAST_RESPONSE_TIME'
}

export interface TierConfig {
  name: string;
  cpus: number;
  ram: string; // Display string
  capex: number;
  opex: number; // Per second
  capacity: number; // Req/s
}

export interface CdnConfig {
    name: string;
    maxHitRate: number; // The ceiling (e.g. 0.95)
    capacity: number;
    capex: number;
    opex: number;
}

export interface NodeData {
  id: string;
  type: NodeType;
  x: number;
  y: number;
  
  // Tiering
  tier?: ComputeTier;
  cdnTier?: CdnTier; // Specific for CDN
  
  // Database Specific
  dbRole?: DbRole; // Only for DATABASE (SQL)
  
  algorithm?: LoadBalancerAlgo; // Specific to Load Balancer
  isUpgrading?: boolean;
  upgradeProgress?: number; // 0-100
  
  // Chaos / Failure Stats
  failureTimeLeft?: number; // If > 0, node is broken (down)
  
  // Simulation Runtime Stats
  currentLoad: number; // 0-100%
  loadHistory: number[]; // Array of last N load values (0-100)
  processedReqs: number; // Req/s
  droppedReqs: number; // Req/s
  
  // Cache/CDN Specific Runtime
  cacheHitRate?: number; // Current calculated hit rate
  totalServed?: number; // Lifetime requests served (for warmup logic)
  invalidationPressure?: number; // For Cache: How much write traffic is hurting hit rate
  hasStorageConnection?: boolean; // Runtime flag check

  status: 'active' | 'down' | 'booting';
}

export interface Connection {
  id: string;
  sourceId: string;
  targetId: string;
}

export interface TrafficBreakdown {
    successful: number;
    failed: number;
}

export interface GameMetrics {
  cash: number;
  revenuePerSec: number;
  opexPerSec: number;
  uptime: number; // 0-100%
  userSatisfaction: number; // 0-100% (New Mechanic)
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  
  // Latency Metrics
  latencyMs: number; // Avg
  p95LatencyMs: number; // 95th Percentile (Tail latency)
  
  activeUsers: number;
  isUnderAttack: boolean; 
  attackTimeLeft: number; // Seconds remaining for current attack
  
  // Detailed breakdown
  requestsByType: Record<RequestType, TrafficBreakdown>;
  
  // Status Code Breakdown
  responseCodes: Record<ResponseCode, number>;
}

export interface TrafficPacket {
  id: string;
  type: 'HTTP' | 'DDOS' | 'DB' | 'STORAGE';
  load: number; // How much "weight" this packet has
}

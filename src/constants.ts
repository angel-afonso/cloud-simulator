
import { CdnTier, ComputeTier, NodeType, RequestType, TierConfig, CdnConfig } from './types';

// REBALANCED: Cheaper entry points, better efficiency at scale.
export const COMPUTE_TIERS: Record<ComputeTier, TierConfig> = {
  [ComputeTier.T1]: { name: 'Micro', cpus: 1, ram: '1GB', capex: 50, opex: 0.5, capacity: 100 },   // Was $1
  [ComputeTier.T2]: { name: 'Small', cpus: 2, ram: '4GB', capex: 150, opex: 2, capacity: 500 },    // Was $5
  [ComputeTier.T3]: { name: 'Medium', cpus: 4, ram: '16GB', capex: 400, opex: 8, capacity: 2500 }, // Was $15
  [ComputeTier.T4]: { name: 'Large', cpus: 16, ram: '64GB', capex: 1200, opex: 25, capacity: 10000 }, // Was $50
  [ComputeTier.T5]: { name: 'High-C', cpus: 64, ram: '256GB', capex: 5000, opex: 80, capacity: 50000 }, // Was $200
};

// REBALANCED: CDN costs lowered to reflect bandwidth pricing realities
export const CDN_TIERS: Record<CdnTier, CdnConfig> = {
    [CdnTier.EDGE_BASIC]: { name: 'Basic Edge', maxHitRate: 0.75, capacity: 5000, capex: 200, opex: 2 }, // Was $8
    [CdnTier.EDGE_PRO]: { name: 'Pro Edge', maxHitRate: 0.90, capacity: 25000, capex: 800, opex: 10 },   // Was $25
    [CdnTier.EDGE_ENTERPRISE]: { name: 'Global Edge', maxHitRate: 0.99, capacity: 100000, capex: 2500, opex: 40 }, // Was $80
};

// Cost to add infrastructure nodes (CAPEX) - Mostly unchanged, initial investment should hurt a bit
export const NODE_COSTS: Record<NodeType, number> = {
  [NodeType.INTERNET]: 0,
  [NodeType.CDN]: 200, 
  [NodeType.WAF]: 200,
  [NodeType.FIREWALL]: 100,
  [NodeType.LOAD_BALANCER]: 150,
  [NodeType.API_GATEWAY]: 300,
  [NodeType.COMPUTE]: 50, 
  [NodeType.DATABASE]: 500, // SQL
  [NodeType.DATABASE_NOSQL]: 800, // NoSQL (More expensive RAM)
  [NodeType.STORAGE]: 200,
  [NodeType.CACHE]: 150,
};

// OPEX per second for infrastructure (REBALANCED)
// Reduced overhead costs to make early game survival easier
export const NODE_OPEX: Record<NodeType, number> = {
  [NodeType.INTERNET]: 0,
  [NodeType.CDN]: 2,          // Base cost (Tier adds more)
  [NodeType.WAF]: 2,          // Was 5
  [NodeType.FIREWALL]: 1,     // Was 2
  [NodeType.LOAD_BALANCER]: 1, // Was 3 (Essential component, should be cheap)
  [NodeType.API_GATEWAY]: 3,  // Was 8
  [NodeType.COMPUTE]: 0.5,    // Base cost (Tier adds more)
  [NodeType.DATABASE]: 5,     // Was 10 (Managed DBs are pricey, but 10 was too high for start)
  [NodeType.DATABASE_NOSQL]: 8, // Was 15
  [NodeType.STORAGE]: 1,      // Was 4 (S3 is cheap)
  [NodeType.CACHE]: 2,        // Was 5
};

// New Revenue Model: Transactions (Writes) are gold, Static assets are dust.
// Slight boost to WEB/STATIC to help with baseline sustainability.
export const REVENUE_BY_TYPE: Record<RequestType, number> = {
    [RequestType.WEB]: 0.05,        // Was 0.02 (Ads/Impression boost)
    [RequestType.DB_READ]: 0.02,    // Was 0.01
    [RequestType.DB_WRITE]: 0.80,   // Transaction (Checkout/Conversion) - CRITICAL
    [RequestType.DB_SEARCH]: 0.15,  // Search Intent (High value lead)
    [RequestType.STATIC]: 0.005,    // Was 0.001 (Asset delivery)
    [RequestType.ATTACK]: 0.00,     // Malicious traffic generates no revenue
};

export const SLA_PENALTY_THRESHOLD = 99.0; 
export const LATENCY_PENALTY_THRESHOLD = 500; 
export const UPGRADE_TIME_MS = 3000;
export const CDN_WARMUP_CONSTANT = 20000; 
export const CACHE_WARMUP_CONSTANT = 5000; // Faster to warm up than CDN
export const CACHE_WRITE_PENALTY = 0.005; // Hit rate penalty per write request

// Mechanics Config
export const CHAOS_FAILURE_CHANCE_PER_TICK = 0.0001; // Small chance per frame
export const REPAIR_TIME_MS = 20000; // 20s to fix a broken node
export const SATISFACTION_RECOVERY_RATE = 0.05; // Points per tick
export const SATISFACTION_PENALTY_RATE = 0.2; // Points per tick when failing

// Used for UI lists (Phaser uses hex values in MainScene)
export const NODE_COLORS: Record<NodeType, string> = {
  [NodeType.INTERNET]: 'border-slate-400 text-slate-100',
  [NodeType.CDN]: 'border-teal-400 text-teal-100',
  [NodeType.WAF]: 'border-purple-500 text-purple-100',
  [NodeType.FIREWALL]: 'border-orange-500 text-orange-100',
  [NodeType.LOAD_BALANCER]: 'border-blue-500 text-blue-100',
  [NodeType.API_GATEWAY]: 'border-indigo-500 text-indigo-100',
  [NodeType.COMPUTE]: 'border-emerald-500 text-emerald-100',
  [NodeType.DATABASE]: 'border-amber-500 text-amber-100',
  [NodeType.DATABASE_NOSQL]: 'border-fuchsia-500 text-fuchsia-100',
  [NodeType.STORAGE]: 'border-cyan-500 text-cyan-100',
  [NodeType.CACHE]: 'border-pink-500 text-pink-100',
};

export const NODE_LABELS: Record<NodeType, string> = {
  [NodeType.INTERNET]: 'Internet',
  [NodeType.CDN]: 'CDN Edge',
  [NodeType.WAF]: 'WAF (L7)',
  [NodeType.FIREWALL]: 'Firewall',
  [NodeType.LOAD_BALANCER]: 'Load Balancer',
  [NodeType.API_GATEWAY]: 'API Gateway',
  [NodeType.COMPUTE]: 'Compute VM',
  [NodeType.DATABASE]: 'SQL DB',
  [NodeType.DATABASE_NOSQL]: 'NoSQL DB',
  [NodeType.STORAGE]: 'S3 Bucket',
  [NodeType.CACHE]: 'Redis Cache',
};

// Request Type Visuals
export const REQUEST_COLORS: Record<RequestType, string> = {
    [RequestType.WEB]: 'text-emerald-400',
    [RequestType.DB_READ]: 'text-blue-400',
    [RequestType.DB_WRITE]: 'text-amber-400',
    [RequestType.DB_SEARCH]: 'text-fuchsia-400',
    [RequestType.STATIC]: 'text-cyan-400',
    [RequestType.ATTACK]: 'text-red-500',
};

// Phaser Hex Colors
export const REQUEST_HEX_COLORS: Record<RequestType, number> = {
    [RequestType.WEB]: 0x34d399, // Emerald 400
    [RequestType.DB_READ]: 0x60a5fa, // Blue 400
    [RequestType.DB_WRITE]: 0xfbbf24, // Amber 400
    [RequestType.DB_SEARCH]: 0xe879f9, // Fuchsia 400
    [RequestType.STATIC]: 0x22d3ee, // Cyan 400
    [RequestType.ATTACK]: 0xff0000, // Red 500
};

export const TRAFFIC_MIX: Record<RequestType, number> = {
    [RequestType.WEB]: 0.3,      // 30% Web Page
    [RequestType.DB_READ]: 0.35, // 35% DB Reads (Reduced)
    [RequestType.DB_WRITE]: 0.1, // 10% DB Writes
    [RequestType.DB_SEARCH]: 0.1, // 10% Search (New)
    [RequestType.STATIC]: 0.15,  // 15% Static (Reduced)
    [RequestType.ATTACK]: 0.0,   // 0% Normally
};

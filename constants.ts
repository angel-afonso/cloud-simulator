
import { CdnTier, ComputeTier, NodeType, RequestType, TierConfig, CdnConfig } from './types';

export const COMPUTE_TIERS: Record<ComputeTier, TierConfig> = {
  [ComputeTier.T1]: { name: 'Micro', cpus: 1, ram: '1GB', capex: 50, opex: 1, capacity: 100 },
  [ComputeTier.T2]: { name: 'Small', cpus: 2, ram: '4GB', capex: 150, opex: 5, capacity: 500 },
  [ComputeTier.T3]: { name: 'Medium', cpus: 4, ram: '16GB', capex: 400, opex: 15, capacity: 2500 },
  [ComputeTier.T4]: { name: 'Large', cpus: 16, ram: '64GB', capex: 1200, opex: 50, capacity: 10000 },
  [ComputeTier.T5]: { name: 'High-C', cpus: 64, ram: '256GB', capex: 5000, opex: 200, capacity: 50000 },
};

export const CDN_TIERS: Record<CdnTier, CdnConfig> = {
    [CdnTier.EDGE_BASIC]: { name: 'Basic Edge', maxHitRate: 0.75, capacity: 5000, capex: 200, opex: 8 },
    [CdnTier.EDGE_PRO]: { name: 'Pro Edge', maxHitRate: 0.90, capacity: 25000, capex: 800, opex: 25 },
    [CdnTier.EDGE_ENTERPRISE]: { name: 'Global Edge', maxHitRate: 0.99, capacity: 100000, capex: 2500, opex: 80 },
};

// Cost to add infrastructure nodes (CAPEX)
export const NODE_COSTS: Record<NodeType, number> = {
  [NodeType.INTERNET]: 0,
  [NodeType.CDN]: 200, 
  [NodeType.WAF]: 250,
  [NodeType.FIREWALL]: 100,
  [NodeType.LOAD_BALANCER]: 150,
  [NodeType.API_GATEWAY]: 300,
  [NodeType.COMPUTE]: 50, 
  [NodeType.DATABASE]: 500, // SQL
  [NodeType.DATABASE_NOSQL]: 800, // NoSQL (More expensive RAM)
  [NodeType.STORAGE]: 200,
  [NodeType.CACHE]: 150,
  [NodeType.AUTOSCALING_GROUP]: 300,
};

// OPEX per second for infrastructure
export const NODE_OPEX: Record<NodeType, number> = {
  [NodeType.INTERNET]: 0,
  [NodeType.CDN]: 8, 
  [NodeType.WAF]: 5,
  [NodeType.FIREWALL]: 2,
  [NodeType.LOAD_BALANCER]: 3,
  [NodeType.API_GATEWAY]: 8,
  [NodeType.COMPUTE]: 1, 
  [NodeType.DATABASE]: 12,
  [NodeType.DATABASE_NOSQL]: 18,
  [NodeType.STORAGE]: 5,
  [NodeType.CACHE]: 6,
  [NodeType.AUTOSCALING_GROUP]: 5,
};

// New Revenue Model: Transactions (Writes) are gold, Static assets are dust.
export const REVENUE_BY_TYPE: Record<RequestType, number> = {
    [RequestType.WEB]: 0.02,        // Page View (Ads/Impression)
    [RequestType.DB_READ]: 0.01,    // Data lookup (Information)
    [RequestType.DB_WRITE]: 0.80,   // Transaction (Checkout/Conversion) - CRITICAL
    [RequestType.DB_SEARCH]: 0.15,  // Search Intent (High value lead)
    [RequestType.STATIC]: 0.001,    // Asset delivery (Marginal utility)
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
  [NodeType.AUTOSCALING_GROUP]: 'border-yellow-500 text-yellow-100',
};

export const NODE_LABELS: Record<NodeType, string> = {
  [NodeType.INTERNET]: 'Internet',
  [NodeType.CDN]: 'CloudFront',
  [NodeType.WAF]: 'AWS WAF',
  [NodeType.FIREWALL]: 'VPC FW',
  [NodeType.LOAD_BALANCER]: 'ALB/NLB',
  [NodeType.API_GATEWAY]: 'API Gateway',
  [NodeType.COMPUTE]: 'EC2 Instance',
  [NodeType.DATABASE]: 'RDS (SQL)',
  [NodeType.DATABASE_NOSQL]: 'DynamoDB',
  [NodeType.STORAGE]: 'S3 Bucket',
  [NodeType.CACHE]: 'ElastiCache',
  [NodeType.AUTOSCALING_GROUP]: 'Auto Scaling',
};

export const CROSS_AZ_LATENCY = 2; // ms
export const TECH_POINTS_PER_SUCCESS = 0.001;
export const SLA_PENALTY_RATE = 100; // Cash deducted per tick if SLA violated

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

export const TECH_TREE = [
    {
        id: 'autoscaling',
        name: 'Auto Scaling Groups',
        description: 'Dynamically scale EC2 instances based on load.',
        cost: 10,
        category: 'compute'
    },
    {
        id: 'managed_db',
        name: 'RDS Managed Service',
        description: 'Managed databases with 99.99% availability.',
        cost: 25,
        category: 'data'
    },
    {
        id: 'global_accelerator',
        name: 'Global Accelerator',
        description: 'Reduced entry latency via AWS global network.',
        cost: 50,
        category: 'network'
    },
    {
        id: 'shield_advanced',
        name: 'AWS Shield Advanced',
        description: 'Enterprise-grade DDoS protection and automatic mitigation.',
        cost: 100,
        category: 'security'
    },
    {
        id: 'serverless_lambda',
        name: 'Lambda Serverless',
        description: 'Zero idle cost compute. Pay only for execution.',
        cost: 150,
        category: 'compute'
    }
];

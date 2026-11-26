import type { HallmarkContext, HallmarkEvent } from '@pascaal/freeroam';

export interface CapabilityRule {
  methods: string[];
  pathPrefixes: string[];
  profiles?: string[];
  limits?: Partial<Record<'req' | 'tin' | 'tout' | 'cost' | 'conc' | 'depth' | 'wid', number>>;
}

export interface BarricadeSurface {
  id: string;
  gate: 'imprint' | 'grant';
  tier: 0 | 1 | 2;
  methods: string[];
  pathPrefixes: string[];
  capability?: string;
  revocation?: 'strict' | 'bounded';
  maxStalenessSec?: number;
}

export interface BarricadePolicy {
  v: 1;
  id: string;
  tenant: string;
  audience: string;
  capabilities: Record<string, CapabilityRule>;
  surfaces: BarricadeSurface[];
  jws?: string;
  keyThumbprint?: string;
}

export interface BarricadeOptions {
  policy: BarricadePolicy;
  resolveKey?: (kid: string) => any;
  keys?: any;
  audience?: string;
  tenant?: string;
  now?: number;
  nowMs?: number;
  maxTtlSec?: number;
  revocation?: any;
  replay?: any;
  ledger?: BudgetLedger;
  onEvent?: (event: HallmarkEvent) => void;
}

export interface BarricadeResult {
  decision: 'passthrough' | 'allow' | 'deny';
  context: HallmarkContext;
  event: HallmarkEvent | null;
  error?: Error & { toHTTP(): { http: number; body: Record<string, unknown> } };
}

export { createKeyResolver } from '@pascaal/freeroam';
export { ReplayCache, RevocationSet, BUDGET_FIELDS } from '@pascaal/hallmark';

export declare const POLICY_TYP: 'hallmark+barricade-policy';
export declare const DEFAULT_MAX_STALENESS_SEC: 30;

export declare class BudgetLedger {
  initialize(jti: string, budget: Record<string, number>): { remaining: Record<string, number> };
  remaining(jti: string): Record<string, number>;
  charge(jti: string, idempotencyKey: string, usage?: Record<string, number>): boolean;
}

export declare function signPolicy(privateJwk: any, policy: BarricadePolicy, alg?: 'EdDSA' | 'ES256'): string;
export declare function loadPolicy(jws: string, resolveKey: (kid: string) => any): BarricadePolicy;
export declare function matchSurface(policy: BarricadePolicy, method: string, path: string): BarricadeSurface | undefined;
export declare function evaluateBarricade(req: any, options: BarricadeOptions): BarricadeResult;
export declare function attachUsageCharge(req: any, res: any, options: {
  ledger?: BudgetLedger;
  context?: HallmarkContext;
  onEvent?: (event: HallmarkEvent) => void;
}): void;
export declare function barricade(options: BarricadeOptions): ((req: any, res: any, next?: () => void) => any) & { evaluate: typeof evaluateBarricade };
export declare function fastifyBarricade(options: BarricadeOptions): (request: any, reply: any) => Promise<any>;
export default barricade;

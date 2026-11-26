export interface PublicJwk {
  kty: string;
  crv: string;
  x: string;
  y?: string;
}

export type KeyResolver = (kid: string) => PublicJwk | undefined;

export interface FreeroamOptions {
  resolveKey: KeyResolver;
  audience?: string;
  tenant?: string;
  now?: number;
  nowMs?: number;
  maxTtlSec?: number;
  onEvent?: (event: HallmarkEvent) => void;
}

export interface HallmarkContext {
  mode: 'observe' | 'enforce';
  ok: boolean;
  present: boolean;
  source?: 'authorization' | 'header' | null;
  ignored?: boolean;
  code?: string;
  reason?: string;
  session?: string;
  depth?: number;
  spid?: string;
  attestation?: string;
  key?: string;
  seal?: string;
  surface?: string;
  capability?: string;
  gate?: 'imprint' | 'grant';
  tier?: 0 | 1 | 2;
  jti?: string;
  sqn?: number;
  budget?: Record<string, number>;
  remaining?: Record<string, number>;
  gated?: boolean;
}

export interface HallmarkEvent {
  ts: number;
  event: string;
  code?: string;
  reason?: string;
  tid?: string;
  session?: string;
  depth?: number;
  spid?: string;
  attestation?: string;
  key?: string;
  seal?: string;
  method?: string;
  path?: string;
  surface?: string;
  capability?: string;
  gate?: string;
  tier?: number;
  usage?: Record<string, number>;
  remaining?: Record<string, number>;
}

export interface EvaluationResult {
  decision: 'passthrough' | 'allow' | 'deny';
  context: HallmarkContext;
  event: HallmarkEvent | null;
  error?: Error;
}

export declare const PASSPORT_TYP: 'hallmark+agent-passport';
export declare const MAX_PASSPORT_BYTES: 4096;
export declare const DEFAULT_MAX_TTL_SEC: 120;
export declare const HARD_MAX_TTL_SEC: 300;

export declare function toHallmarkError(err: unknown): Error & { code: string; reason: string };
export declare function extractPassport(headers?: Record<string, unknown>): {
  present: boolean;
  jws?: string;
  source?: 'authorization' | 'header' | null;
  ignored?: boolean;
};
export declare function createKeyResolver(keys: KeyResolver | Map<string, PublicJwk> | PublicJwk[] | { keys: PublicJwk[] } | Record<string, PublicJwk>): KeyResolver;
export declare function methodOf(req: { method?: string }): string;
export declare function pathOf(req: { path?: string; url?: string }): string;
export declare function safeSummary(verified: unknown, meta?: Record<string, unknown>): HallmarkEvent;
export declare function verifyPassport(jws: string, options: FreeroamOptions): any;
export declare function evaluateFreeroam(req: any, options: FreeroamOptions): EvaluationResult;
export declare function freeroam(options: FreeroamOptions): ((req: any, res: any, next?: () => void) => any) & { evaluate: typeof evaluateFreeroam };
export declare function fastifyFreeroam(options: FreeroamOptions): (request: any) => Promise<void>;
export default freeroam;

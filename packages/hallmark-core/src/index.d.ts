export interface Jwk {
  kty: string;
  crv?: string;
  x?: string;
  y?: string;
  d?: string;
  [member: string]: unknown;
}

export interface JwsSigned {
  jws: string;
  signingInput: string;
  header: Record<string, unknown>;
}

export interface JwsParsed {
  header: Record<string, any>;
  payload: Record<string, any>;
  signingInput: string;
  signature: Buffer;
  headerB64: string;
  payloadB64: string;
  headerBytes: Buffer;
  payloadBytes: Buffer;
}

export interface JwsVerified extends JwsParsed {
  jwk: Jwk;
  keyThumbprint: string;
}

export interface HttpErrorShape {
  http: number;
  body: { error: string; hallmark_error: string; detail?: string };
}

export declare function b64u(input: string | Buffer | Uint8Array): string;
export declare function b64uDecode(input: string): Buffer;
export declare function jcs(value: unknown): string;
export declare const SEAL_DS_V1: 'hallmark.seal.v1';
export declare function sha256(buf: Buffer | Uint8Array | string): Buffer;
export declare function seal(signingInput: string, ds?: string): string;
export declare function jkt(jwk: Jwk): string;
export declare function kid(jwk: Jwk): string;
export declare const ALG_ALLOWLIST: readonly ['EdDSA', 'ES256'];
export declare const REMOTE_KEY_HEADERS: readonly ['jku', 'x5u', 'x5c'];
export declare function jwsSign(alg: 'EdDSA' | 'ES256', privateJwk: Jwk, header: Record<string, unknown>, payload: Record<string, unknown>): JwsSigned;
export declare function jwsParse(jws: string): JwsParsed;
export declare function parseJsonStrict(src: string): { value: any; duplicates: string[] };
export declare function jwsVerify(jws: string, expectedTyp: string | undefined, resolve: (kid: string) => Jwk | undefined): JwsVerified;

export declare class HallmarkError extends Error {
  code: string;
  reason: string;
  detail?: string;
  constructor(code: string, reason: string, detail?: string);
  static fail(code: string, reason: string, detail?: string): never;
  toHTTP(): HttpErrorShape;
}

export interface RevocationManifest {
  v: number;
  iat: number;
  exp: number;
  signature?: string;
  keys?: string[];
  sessions?: string[];
  attestations?: string[];
  tenants?: string[];
}

export declare class RevocationSet {
  v: number;
  iat: number;
  exp: number;
  signature?: string;
  constructor(manifest: RevocationManifest);
  isKeyRevoked(thumbprint: string): boolean;
  isSessionRevoked(sid: string): boolean;
  isAttestationRevoked(at: string | undefined): boolean;
  isTenantRevoked(tid: string): boolean;
  checkFreshness(now: number, maxStalenessSec: number, failClosed: boolean): { ok: boolean; degraded: boolean; age: number };
}

export declare class ReplayCache {
  constructor(options?: { capacity?: number; reorderWindow?: number });
  admit(jti: string, thumbprint: string, sqn: number): boolean;
}

export declare const BUDGET_FIELDS: readonly ['req', 'tin', 'tout', 'cost', 'conc', 'depth', 'wid'];
export declare function budgetSubset(child: Record<string, number>, parent: Record<string, number>): { ok: boolean; field?: string; child?: number; parent?: number };
export declare function budgetAdd(a: Record<string, number>, b: Record<string, number>): Record<string, number>;

export declare class AllocationStore {
  reserve(parentSid: string, childSid: string, alloc: Record<string, number>): boolean;
  release(parentSid: string, childSid: string): void;
  committed(parentSid: string): Record<string, number>;
  unallocated(sid: string, budget: Record<string, number>): Record<string, number>;
}

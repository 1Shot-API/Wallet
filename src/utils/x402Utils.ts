import {
  Base64String,
  BigNumberString,
  EVMAccountAddress,
  EVMContractAddress,
  Signature,
  URLString,
} from "types/primitives";
import { IERC3009TransferWithAuthorization } from "types/domain";

export type X402PaymentRequirements = {
  // x402 v2 uses x402Version, older drafts may use version-like fields
  x402Version?: number;
  version?: number;
  resource?: {
    url?: URLString;
    description?: string;
    mimeType?: string;
  };
  // Common shapes observed across drafts:
  accepted?: unknown; // object | array
  paymentRequirements?: unknown; // array
};

export type X402AcceptedPayment = {
  scheme?: string;
  network?: string;
  amount?: BigNumberString;
  asset?: EVMContractAddress;
  payTo?: EVMAccountAddress;
  maxTimeoutSeconds?: number;
  extra?: Record<string, unknown>;
};

export type X402PaymentPayloadV2ExactEvm = {
  x402Version: number;
  resource: {
    url: string;
    description?: string;
    mimeType?: string;
  };
  accepted: {
    scheme: "exact";
    network: string;
    amount: BigNumberString;
    asset: EVMContractAddress;
    payTo: EVMAccountAddress;
    maxTimeoutSeconds?: number;
    extra?: Record<string, unknown>;
  };
  payload: {
    signature: Signature;
    authorization: IERC3009TransferWithAuthorization;
  };
};

export function x402ResolveRequestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  // Request
  return input.url;
}

export function x402Base64EncodeUtf8(input: string): Base64String {
  // Browser path
  if (typeof btoa === "function") {
    return Base64String(btoa(unescape(encodeURIComponent(input))));
  }
  // Node path (best-effort)
  const B = (globalThis as any).Buffer;
  if (B) {
    return Base64String(B.from(input, "utf8").toString("base64"));
  }
  throw new Error("No base64 encoder available in this environment.");
}

export function x402Base64DecodeUtf8(input: Base64String): string {
  // Browser path
  if (typeof atob === "function") {
    return decodeURIComponent(escape(atob(input)));
  }
  // Node path (best-effort)
  const B = (globalThis as any).Buffer;
  if (B) {
    return B.from(input, "base64").toString("utf8");
  }
  throw new Error("No base64 decoder available in this environment.");
}

export function x402ParseJsonOrBase64Json(raw: string): unknown {
  const trimmed = raw.trim();
  // Try JSON first
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }
  // Then try base64(JSON)
  try {
    const decoded = x402Base64DecodeUtf8(Base64String(trimmed));
    return JSON.parse(decoded);
  } catch {
    // As a last attempt, sometimes headers are quoted strings
    const unquoted = trimmed.replace(/^"+|"+$/g, "");
    if (unquoted.startsWith("{") || unquoted.startsWith("[")) {
      return JSON.parse(unquoted);
    }
    const decoded = x402Base64DecodeUtf8(Base64String(unquoted));
    return JSON.parse(decoded);
  }
}

export function x402NormalizeAcceptedPayments(
  req: X402PaymentRequirements,
): X402AcceptedPayment[] {
  const candidates: unknown[] = [];
  if (req.accepted != null) {
    if (Array.isArray(req.accepted)) candidates.push(...req.accepted);
    else candidates.push(req.accepted);
  }
  if (req.paymentRequirements != null) {
    if (Array.isArray(req.paymentRequirements)) candidates.push(...req.paymentRequirements);
  }
  // Best-effort coercion
  return candidates.filter(Boolean).map((c) => c as X402AcceptedPayment);
}

export function x402GetChainIdFromNetwork(network: string): number | null {
  // Expected: eip155:<chainId>
  const m = /^eip155:(\d+)$/.exec(network);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function x402IsUsdcOnBase(chainId: number, asset: EVMContractAddress): boolean {
  const a = asset.toLowerCase();
  // Base mainnet USDC
  if (chainId === 8453 && a === "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913") return true;
  return false;
}


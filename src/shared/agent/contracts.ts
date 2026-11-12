/**
 * Platform-neutral agent contracts.
 *
 * Keep this module free of Next.js, Supabase, Node.js, browser, and Android
 * imports so the web backend and Android app can implement the same wire model.
 */

export interface AgentPlanStep {
  id: string;
  objective: string;
  expectedOutcome: string;
}

export interface AgentToolCall {
  id: string;
  toolId: string;
  arguments: Record<string, unknown>;
}

export interface AgentPlan {
  version: 1;
  goal: string;
  steps: AgentPlanStep[];
  toolCalls: AgentToolCall[];
}

export type AgentRuntimeKind = "web" | "android";

export interface AgentRuntimeDescriptor {
  runtimeId: string;
  kind: AgentRuntimeKind;
  runtimeVersion: string;
  supportedContractVersions: number[];
}

export interface AgentCapabilityManifestEntry {
  id: string;
  runtime: AgentRuntimeKind;
  manifestVersion: number;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  requiredPermissions: string[];
  sideEffect: boolean;
  idempotent: boolean;
  requiresUserApproval: boolean;
}

export interface AgentInvocationEnvelope {
  contractVersion: 1;
  invocationId: string;
  taskId: string | null;
  toolCallId: string;
  targetRuntime: AgentRuntimeKind;
  targetDeviceId: string | null;
  capabilityId: string;
  arguments: Record<string, unknown>;
  createdAt: string;
  expiresAt: string;
  idempotencyKey: string;
}

export interface AgentInvocationResult {
  contractVersion: 1;
  invocationId: string;
  taskId: string | null;
  toolCallId: string;
  runtime: AgentRuntimeKind;
  status: "completed" | "failed" | "denied" | "expired" | "cancelled";
  result?: unknown;
  errorCode?: string;
  completedAt: string;
  evidence: Array<{
    kind: string;
    source: string;
    summary: string;
  }>;
}

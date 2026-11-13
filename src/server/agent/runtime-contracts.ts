import "server-only";

import { randomUUID } from "node:crypto";
import type {
  AgentCapabilityManifestEntry,
  AgentInvocationEnvelope,
  AgentInvocationResult,
} from "@/shared/agent/contracts";
import {
  isValidCapabilityManifestEntry,
  isValidInvocationEnvelope,
  isValidInvocationResult,
} from "@/shared/agent/validation";

type CapabilitySource = {
  id: string;
  description: string;
  permission: string;
  sideEffect: boolean;
  inputSchema: AgentCapabilityManifestEntry["inputSchema"];
  annotations?: {
    idempotentHint?: boolean;
    destructiveHint?: boolean;
  };
};

export function createWebCapabilityManifest(
  capability: CapabilitySource,
): AgentCapabilityManifestEntry {
  const manifest: AgentCapabilityManifestEntry = {
    id: capability.id,
    runtime: "web",
    manifestVersion: 1,
    description: capability.description.slice(0, 500),
    inputSchema: capability.inputSchema,
    requiredPermissions: [capability.permission],
    sideEffect: capability.sideEffect,
    idempotent: capability.annotations?.idempotentHint === true,
    requiresUserApproval: capability.annotations?.destructiveHint === true ||
      (capability.sideEffect && capability.annotations?.idempotentHint !== true),
  };
  if (!isValidCapabilityManifestEntry(manifest)) {
    throw new Error("Registered tool capability is not valid for Shared Agent Core.");
  }
  return manifest;
}

export function createWebInvocationEnvelope(input: {
  taskId: string;
  toolCallId: string;
  toolId: string;
  arguments: Record<string, unknown>;
  capability: CapabilitySource;
  now?: number;
}): AgentInvocationEnvelope {
  const manifest = createWebCapabilityManifest(input.capability);
  if (manifest.id !== input.toolId) {
    throw new Error("Invocation capability does not match the planned tool.");
  }
  const now = input.now ?? Date.now();
  const envelope: AgentInvocationEnvelope = {
    contractVersion: 1,
    invocationId: randomUUID(),
    taskId: input.taskId,
    toolCallId: input.toolCallId,
    targetRuntime: "web",
    targetDeviceId: null,
    capabilityId: manifest.id,
    arguments: input.arguments,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
    idempotencyKey: "task:" + input.taskId + ":call:" + input.toolCallId,
  };
  if (!isValidInvocationEnvelope(envelope, now)) {
    throw new Error("Shared Agent Core rejected the invocation envelope.");
  }
  return envelope;
}

export function createWebInvocationResult(
  invocation: AgentInvocationEnvelope,
  status: "completed" | "failed",
  errorCode?: string,
  now = Date.now(),
): AgentInvocationResult {
  const result: AgentInvocationResult = {
    contractVersion: 1,
    invocationId: invocation.invocationId,
    taskId: invocation.taskId,
    toolCallId: invocation.toolCallId,
    runtime: "web",
    status,
    ...(status === "failed" ? { errorCode: errorCode ?? "TOOL_EXECUTION_FAILED" } : {}),
    completedAt: new Date(now).toISOString(),
    evidence: [{
      kind: "tool_execution",
      source: invocation.capabilityId,
      summary: status === "completed"
        ? "Registered web capability completed; raw output is retained in task history."
        : "Registered web capability failed; the safe failure message is retained in task history.",
    }],
  };
  if (!isValidInvocationResult(result)) {
    throw new Error("Shared Agent Core rejected the invocation result.");
  }
  return result;
}

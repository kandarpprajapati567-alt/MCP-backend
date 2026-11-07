export type DeviceCapability = {
  id: string;
  description: string;
  permission: string;
  sideEffect: boolean;
  inputSchema: {
    type: "object";
    properties: Record<string, { type: string; description?: string; maxLength?: number }>;
    required: string[];
    additionalProperties: false;
  };
};

export type DeviceRegistration = {
  deviceId: string;
  displayName: string;
  platform: "android" | "windows" | "web" | "other";
  appVersion?: string;
  capabilities: DeviceCapability[];
};

export type DeviceJobDispatch = {
  deviceId: string;
  toolId: string;
  toolCallId: string;
  taskId?: string;
  arguments: Record<string, unknown>;
};

export type DeviceJobResult = {
  jobId: string;
  deviceId: string;
  status: "completed" | "failed";
  result?: unknown;
  errorCode?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, min: number, max: number): value is string {
  return typeof value === "string" && value.trim().length >= min && value.length <= max;
}

export function parseDeviceRegistration(value: unknown):
  | { ok: true; value: DeviceRegistration }
  | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "A JSON object is required." };
  if (!boundedString(value.deviceId, 1, 128)) return { ok: false, error: "deviceId must be 1–128 characters." };
  if (!boundedString(value.displayName, 1, 120)) return { ok: false, error: "displayName must be 1–120 characters." };
  if (!["android", "windows", "web", "other"].includes(String(value.platform))) return { ok: false, error: "Unsupported device platform." };
  if (value.appVersion !== undefined && value.appVersion !== null && !boundedString(value.appVersion, 1, 80)) {
    return { ok: false, error: "appVersion must be at most 80 characters." };
  }
  if (!Array.isArray(value.capabilities) || value.capabilities.length > 100) {
    return { ok: false, error: "capabilities must be an array with at most 100 entries." };
  }

  const seen = new Set<string>();
  const capabilities: DeviceCapability[] = [];
  for (const item of value.capabilities) {
    if (!isRecord(item) || !boundedString(item.id, 2, 160) ||
        !/^[a-z][a-z0-9_.-]+$/.test(item.id) || seen.has(item.id)) {
      return { ok: false, error: "Every capability needs a unique namespaced id." };
    }
    if (!boundedString(item.description, 1, 500) ||
        !boundedString(item.permission, 1, 100) ||
        !/^[a-z][a-z0-9_.:-]*$/.test(item.permission) ||
        typeof item.sideEffect !== "boolean" ||
        !isRecord(item.inputSchema) ||
        item.inputSchema.type !== "object" ||
        item.inputSchema.additionalProperties !== false ||
        !isRecord(item.inputSchema.properties)) {
      return { ok: false, error: "Capability metadata or input schema is invalid." };
    }
    const propertyEntries = Object.entries(item.inputSchema.properties);
    if (propertyEntries.length > 32) return { ok: false, error: "A capability may define at most 32 input properties." };
    for (const [name, property] of propertyEntries) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(name) || !isRecord(property) ||
          !["string", "number", "integer", "boolean", "object", "array"].includes(String(property.type))) {
        return { ok: false, error: "Capability input properties must use supported JSON Schema types." };
      }
      if (property.maxLength !== undefined &&
          (typeof property.maxLength !== "number" || !Number.isInteger(property.maxLength) || property.maxLength < 1 || property.maxLength > 20000)) {
        return { ok: false, error: "Schema maxLength must be between 1 and 20000." };
      }
    }
    const required = item.inputSchema.required === undefined ? [] : item.inputSchema.required;
    if (!Array.isArray(required) || required.length > propertyEntries.length ||
        required.some((key) => typeof key !== "string" || !Object.prototype.hasOwnProperty.call(item.inputSchema.properties, key))) {
      return { ok: false, error: "Schema required keys must reference declared properties." };
    }
    seen.add(item.id);
    capabilities.push({
      id: item.id,
      description: item.description,
      permission: item.permission,
      sideEffect: item.sideEffect,
      inputSchema: {
        type: "object",
        properties: item.inputSchema.properties as DeviceCapability["inputSchema"]["properties"],
        required: required as string[],
        additionalProperties: false,
      },
    });
  }

  return {
    ok: true,
    value: {
      deviceId: value.deviceId.trim(),
      displayName: value.displayName.trim(),
      platform: value.platform as DeviceRegistration["platform"],
      ...(typeof value.appVersion === "string" ? { appVersion: value.appVersion.trim() } : {}),
      capabilities,
    },
  };
}

export function parseDeviceJobDispatch(value: unknown):
  | { ok: true; value: DeviceJobDispatch }
  | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "A JSON object is required." };
  if (!boundedString(value.deviceId, 1, 128) ||
      !boundedString(value.toolId, 2, 160) || !/^[a-z][a-z0-9_.-]+$/.test(value.toolId) ||
      !boundedString(value.toolCallId, 1, 80)) {
    return { ok: false, error: "deviceId, toolId and toolCallId are required." };
  }
  if (value.taskId !== undefined && value.taskId !== null &&
      (typeof value.taskId !== "string" || !/^[0-9a-f-]{36}$/i.test(value.taskId))) {
    return { ok: false, error: "taskId must be a UUID." };
  }
  if (!isRecord(value.arguments) || Buffer.byteLength(JSON.stringify(value.arguments), "utf8") > 16000) {
    return { ok: false, error: "arguments must be a JSON object no larger than 16 KB." };
  }
  return {
    ok: true,
    value: {
      deviceId: value.deviceId.trim(),
      toolId: value.toolId,
      toolCallId: value.toolCallId,
      ...(typeof value.taskId === "string" ? { taskId: value.taskId } : {}),
      arguments: value.arguments,
    },
  };
}

export function parseDeviceJobResult(value: unknown):
  | { ok: true; value: DeviceJobResult }
  | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "A JSON object is required." };
  if (typeof value.jobId !== "string" || !/^[0-9a-f-]{36}$/i.test(value.jobId) ||
      !boundedString(value.deviceId, 1, 128) ||
      !["completed", "failed"].includes(String(value.status))) {
    return { ok: false, error: "jobId, deviceId and a completed/failed status are required." };
  }
  if (value.errorCode !== undefined && value.errorCode !== null && !boundedString(value.errorCode, 1, 80)) {
    return { ok: false, error: "errorCode must be at most 80 characters." };
  }
  let result: string;
  try { result = JSON.stringify(value.result ?? null); } catch { return { ok: false, error: "result must be JSON serializable." }; }
  if (Buffer.byteLength(result, "utf8") > 32000) return { ok: false, error: "result must be no larger than 32 KB." };
  return {
    ok: true,
    value: {
      jobId: value.jobId,
      deviceId: value.deviceId.trim(),
      status: value.status as "completed" | "failed",
      ...(value.result === undefined ? {} : { result: value.result }),
      ...(typeof value.errorCode === "string" ? { errorCode: value.errorCode } : {}),
    },
  };
}

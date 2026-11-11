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

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key));
}

export function parseDeviceRegistration(value: unknown):
  | { ok: true; value: DeviceRegistration }
  | { ok: false; error: string } {
  if (!isRecord(value)) return { ok: false, error: "A JSON object is required." };
  if (!onlyKeys(value, ["deviceId", "displayName", "platform", "appVersion", "capabilities"])) {
    return { ok: false, error: "Device registration contains unsupported fields." };
  }
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
    const expectedPrefix = String(value.platform) + ".";
    if (!isRecord(item) || !onlyKeys(item, ["id", "description", "permission", "sideEffect", "inputSchema"]) ||
        !boundedString(item.id, 2, 160) ||
        !/^[a-z][a-z0-9_.-]+$/.test(item.id) || !item.id.startsWith(expectedPrefix) || seen.has(item.id)) {
      return { ok: false, error: "Every capability needs a unique namespaced id." };
    }
    if (!boundedString(item.description, 1, 500) ||
        !boundedString(item.permission, 1, 100) ||
        !/^[a-z][a-z0-9_.:-]*$/.test(item.permission) ||
        typeof item.sideEffect !== "boolean" ||
        !isRecord(item.inputSchema) ||
        !onlyKeys(item.inputSchema, ["type", "properties", "required", "additionalProperties"]) ||
        item.inputSchema.type !== "object" ||
        item.inputSchema.additionalProperties !== false ||
        !isRecord(item.inputSchema.properties)) {
      return { ok: false, error: "Capability metadata or input schema is invalid." };
    }
    const schema = item.inputSchema as Record<string, unknown>;
    const properties = schema.properties as Record<string, unknown>;
    const propertyEntries = Object.entries(properties);
    if (propertyEntries.length > 32) return { ok: false, error: "A capability may define at most 32 input properties." };
    for (const [name, property] of propertyEntries) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,63}$/.test(name) || !isRecord(property) ||
          !onlyKeys(property, ["type", "description", "maxLength", "minLength", "minimum", "maximum"]) ||
          !["string", "number", "integer", "boolean"].includes(String(property.type)) ||
          (property.description !== undefined && (typeof property.description !== "string" || property.description.length > 200))) {
        return { ok: false, error: "Capability input properties must use supported JSON Schema types." };
      }
      if (property.maxLength !== undefined &&
          (typeof property.maxLength !== "number" || !Number.isInteger(property.maxLength) || property.maxLength < 1 || property.maxLength > 20000)) {
        return { ok: false, error: "Schema maxLength must be between 1 and 20000." };
      }
      if (property.minLength !== undefined &&
          (typeof property.minLength !== "number" || !Number.isInteger(property.minLength) || property.minLength < 0 || property.minLength > 20000)) {
        return { ok: false, error: "Schema minLength must be between 0 and 20000." };
      }
      if (property.minimum !== undefined && (typeof property.minimum !== "number" || !Number.isFinite(property.minimum))) {
        return { ok: false, error: "Schema minimum must be a finite number." };
      }
      if (property.maximum !== undefined && (typeof property.maximum !== "number" || !Number.isFinite(property.maximum))) {
        return { ok: false, error: "Schema maximum must be a finite number." };
      }
      if (typeof property.minimum === "number" && typeof property.maximum === "number" && property.minimum > property.maximum) {
        return { ok: false, error: "Schema minimum cannot exceed maximum." };
      }
    }
    const required = item.inputSchema.required === undefined ? [] : item.inputSchema.required;
    if (!Array.isArray(required) || required.length > propertyEntries.length ||
        required.some((key) => typeof key !== "string" || !Object.prototype.hasOwnProperty.call(properties, key))) {
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
        properties: properties as DeviceCapability["inputSchema"]["properties"],
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
  if (!onlyKeys(value, ["deviceId", "toolId", "toolCallId", "taskId", "arguments"])) {
    return { ok: false, error: "Device tool dispatch contains unsupported fields." };
  }
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
  if (!onlyKeys(value, ["jobId", "deviceId", "status", "result", "errorCode"])) {
    return { ok: false, error: "Device job result contains unsupported fields." };
  }
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

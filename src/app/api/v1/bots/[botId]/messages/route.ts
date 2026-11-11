import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PERSONAL_OWNER_ID, verifyOwnerRequest } from "@/server/security/owner-auth";
import { submitAgentTask } from "@/server/agent/task-service";
import { readJsonBody } from "@/server/http/read-json";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
function json(body: unknown, status = 200) { return NextResponse.json(body, { status, headers }); }
type Context = { params: Promise<{ botId: string }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: Context) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const { botId } = await context.params;
  const conversationId = new URL(request.url).searchParams.get("conversationId");
  if (!uuid.test(botId) || !conversationId || !uuid.test(conversationId)) {
    return json({ error: "A valid Bot ID and conversationId are required." }, 400);
  }
  const admin = createAdminClient();
  const { data: conversation, error: conversationError } = await admin.from("bot_conversations")
    .select("id").eq("owner_id", PERSONAL_OWNER_ID).eq("bot_id", botId).eq("id", conversationId).maybeSingle();
  if (conversationError) return json({ error: "Conversation could not be loaded." }, 503);
  if (!conversation) return json({ error: "Conversation not found." }, 404);
  const { data, error } = await admin.from("bot_messages")
    .select("id,role,content,metadata,created_at")
    .eq("owner_id", PERSONAL_OWNER_ID).eq("conversation_id", conversationId)
    .order("created_at", { ascending: true }).limit(200);
  if (error) return json({ error: "Conversation messages are unavailable." }, 503);
  return json({ conversationId, messages: data ?? [] });
}

export async function POST(request: Request, context: Context) {
  if (!verifyOwnerRequest(request)) return json({ error: "Unauthorized." }, 401);
  const { botId } = await context.params;
  if (!uuid.test(botId)) return json({ error: "A valid Bot ID is required." }, 400);
  const parsed = await readJsonBody(request, 20000);
  if (!parsed.ok) return parsed.reason === "too_large" ? json({ error: "Request body too large." }, 413) : json({ error: "Invalid JSON body." }, 400);
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return json({ error: "A JSON object is required." }, 400);
  const input = parsed.value as Record<string, unknown>;
  if (Object.keys(input).some((key) => !["content","conversationId","agentId"].includes(key))) return json({ error: "Message contains unsupported fields." }, 400);
  if (typeof input.content !== "string" || !input.content.trim() || input.content.length > 4000) return json({ error: "content must be 1–4000 characters." }, 400);
  if (input.conversationId !== undefined && (typeof input.conversationId !== "string" || !uuid.test(input.conversationId))) return json({ error: "conversationId must be a valid UUID." }, 400);
  if (input.agentId !== undefined && (typeof input.agentId !== "string" || !uuid.test(input.agentId))) return json({ error: "agentId must be a valid Agent UUID." }, 400);

  const admin = createAdminClient();
  const { data: bot, error: botError } = await admin.from("bot_definitions")
    .select("id,name,persona_instructions,agent_ids,default_agent_id,provider_preference,model_preference,allowed_tools,enabled")
    .eq("owner_id", PERSONAL_OWNER_ID).eq("id", botId).maybeSingle();
  if (botError) return json({ error: "Bot configuration is unavailable. Apply the Bot System migration first." }, 503);
  if (!bot) return json({ error: "Bot not found." }, 404);
  if (!bot.enabled) return json({ error: "This Bot is paused." }, 409);

  const agentIds = Array.isArray(bot.agent_ids) ? bot.agent_ids.filter((id: unknown): id is string => typeof id === "string") : [];
  const selectedAgentId = (input.agentId as string | undefined) ?? bot.default_agent_id ?? (agentIds.length === 1 ? agentIds[0] : null);
  if (!selectedAgentId) return json({ error: "Select one of this Bot's assigned Agents before sending a message." }, 400);
  if (!agentIds.includes(selectedAgentId)) return json({ error: "The selected Agent is not assigned to this Bot." }, 403);

  let conversationId = input.conversationId as string | undefined;
  if (conversationId) {
    const { data: existing, error } = await admin.from("bot_conversations").select("id")
      .eq("owner_id", PERSONAL_OWNER_ID).eq("bot_id", botId).eq("id", conversationId).maybeSingle();
    if (error) return json({ error: "Conversation could not be loaded." }, 503);
    if (!existing) return json({ error: "Conversation not found for this Bot." }, 404);
  } else {
    const { data: conversation, error } = await admin.from("bot_conversations").insert({
      owner_id: PERSONAL_OWNER_ID, bot_id: botId, status: "active",
    }).select("id").single();
    if (error || !conversation) return json({ error: "Conversation could not be created." }, 503);
    conversationId = conversation.id;
  }

  const { error: userMessageError } = await admin.from("bot_messages").insert({
    owner_id: PERSONAL_OWNER_ID, conversation_id: conversationId, role: "user", content: input.content.trim(),
  });
  if (userMessageError) return json({ error: "User message could not be saved." }, 503);

  try {
    const result = await submitAgentTask(input.content, selectedAgentId, {
      personaInstructions: bot.persona_instructions,
      providerPreference: bot.provider_preference,
      ...(bot.model_preference ? { modelPreference: bot.model_preference } : {}),
      ...(Array.isArray(bot.allowed_tools) && bot.allowed_tools.length ? { allowedTools: bot.allowed_tools } : {}),
    });
    const assistantContent = "result" in result && typeof result.result === "string"
      ? result.result
      : "message" in result && typeof result.message === "string"
        ? result.message
        : result.status === "completed"
          ? "Task completed."
          : "I could not complete that task. Check the execution details and try again.";
    const { data: assistantMessage, error: assistantError } = await admin.from("bot_messages").insert({
      owner_id: PERSONAL_OWNER_ID,
      conversation_id: conversationId,
      role: "assistant",
      content: assistantContent.slice(0, 16000),
      metadata: { taskId: result.taskId, status: result.status, agentId: selectedAgentId },
    }).select("id,role,content,metadata,created_at").single();
    if (assistantError) return json({ error: "Execution finished, but the Bot reply could not be saved.", taskId: result.taskId }, 503);
    await admin.from("bot_conversations").update({ last_agent_id: selectedAgentId, last_task_id: result.taskId })
      .eq("owner_id", PERSONAL_OWNER_ID).eq("id", conversationId);
    return json({
      conversationId,
      bot: { id: bot.id, name: bot.name },
      agentId: selectedAgentId,
      task: { id: result.taskId, status: result.status },
      message: assistantMessage,
    }, result.status === "failed" ? 502 : result.status === "waiting_for_device" ? 202 : 201);
  } catch {
    return json({ error: "Bot execution could not be completed. Check Agent task history for details.", conversationId }, 503);
  }
}

import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {PERSONAL_OWNER_ID,verifyOwnerRequest} from "@/server/security/owner-auth";
import {createAgentPlan} from "@/server/agent/planner";
import {createRuntimeProviderRegistry} from "@/server/ai/providers/runtime-registry";
import {executeRegisteredTool} from "@/server/tools/registry";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
function json(body:unknown,status=200){return NextResponse.json(body,{status,headers});}
async function event(admin:ReturnType<typeof createAdminClient>,taskId:string,eventType:string,payload:Record<string,unknown>={}){const {error}=await admin.from("agent_task_events").insert({task_id:taskId,owner_id:PERSONAL_OWNER_ID,event_type:eventType,payload});if(error)throw new Error("Unable to persist task event.");}
async function setTask(admin:ReturnType<typeof createAdminClient>,id:string,patch:Record<string,unknown>){const {error}=await admin.from("agent_tasks").update({...patch,updated_at:new Date().toISOString()}).eq("id",id).eq("owner_id",PERSONAL_OWNER_ID);if(error)throw new Error("Unable to update task.");}
function localPlan(task:string){
 const lower=task.toLowerCase();
 const toolId=lower.includes("word count")||lower.includes("count words")?"text.word_count":lower.includes("keyword")?"text.extract_keywords":lower.includes("text stats")||lower.includes("character count")?"text.text_stats":null;
 return {version:1 as const,goal:task.slice(0,500),steps:[{id:"step-1",objective:"Interpret the request and complete the available safe operation.",expectedOutcome:"A bounded result with execution evidence."}],toolCalls:toolId?[{id:"call-1",toolId,arguments:{text:task}}]:[]};
}
export async function GET(request:Request){
 if(!verifyOwnerRequest(request))return json({error:"Unauthorized."},401);
 const admin=createAdminClient();const {data,error}=await admin.from("agent_tasks").select("id,status,task,plan,tool_results,result,error_code,created_at,updated_at,completed_at").eq("owner_id",PERSONAL_OWNER_ID).order("created_at",{ascending:false}).limit(50);
 if(error)return json({error:"Unable to load task history."},500);return json({tasks:data??[]});
}
export async function POST(request:Request){
 if(!verifyOwnerRequest(request))return json({error:"Unauthorized."},401);
 const length=Number(request.headers.get("content-length")??"0");if(length>16000)return json({error:"Request body too large."},413);
 let body:unknown;try{body=await request.json();}catch{return json({error:"Invalid JSON body."},400);}
 if(!body||typeof body!=="object"||Array.isArray(body)||typeof (body as Record<string,unknown>).task!=="string")return json({error:"task is required."},400);
 const task=(body as {task:string}).task.trim();if(!task||task.length>4000)return json({error:"Task must be 1–4000 characters."},400);
 const admin=createAdminClient();const {data:created,error:createError}=await admin.from("agent_tasks").insert({owner_id:PERSONAL_OWNER_ID,status:"queued",task}).select("id").single();
 if(createError||!created)return json({error:"Unable to create task."},500);
 const id=created.id as string;
 try{
  await event(admin,id,"task.created");await setTask(admin,id,{status:"planning"});await event(admin,id,"task.planning");
  const providers=await createRuntimeProviderRegistry(PERSONAL_OWNER_ID);const realProvider=providers.openai??providers.openrouter;
  const plan=realProvider?await createAgentPlan(realProvider,task):localPlan(task);
  await setTask(admin,id,{plan,status:"executing"});await event(admin,id,"task.plan_ready",{steps:plan.steps.length,toolCalls:plan.toolCalls.length,planner:realProvider?.id??"local-safe-planner"});await event(admin,id,"task.executing");
  const results:Array<{callId:string;toolId:string;result:unknown}>=[];
  for(const call of plan.toolCalls){const result=executeRegisteredTool(call.toolId,call.arguments);results.push({callId:call.id,toolId:call.toolId,result});await event(admin,id,"tool.completed",{callId:call.id,toolId:call.toolId});}
  await setTask(admin,id,{status:"synthesizing",tool_results:results});await event(admin,id,"task.synthesizing");
  let result:string;
  if(realProvider){const synthesis=await realProvider.generate({messages:[{role:"system",content:"Synthesize the outcome using only the task, plan and tool results. Do not claim unperformed actions."},{role:"user",content:JSON.stringify({task,plan,toolResults:results})}],temperature:0.2,maxOutputTokens:1200});result=synthesis.text;}
  else if(results.length){result="Task completed using "+results.length+" registered local tool(s).\n"+JSON.stringify(results,null,2);}
  else{result="Task planned successfully. No registered local tool was required.\nGoal: "+plan.goal+"\nSteps: "+plan.steps.map(s=>s.objective).join("; ")+"\nConfigure an AI provider to enable model-based planning and synthesis.";}
  await setTask(admin,id,{status:"completed",result,completed_at:new Date().toISOString()});await event(admin,id,"task.completed");
  return json({taskId:id,status:"completed",plan,toolResults:results,result},201);
 }catch(error){
  const code=error instanceof Error&&/invalid|registered|validation|planner/i.test(error.message)?"AGENT_EXECUTION_REJECTED":"AGENT_EXECUTION_FAILED";
  try{await setTask(admin,id,{status:"failed",error_code:code});await event(admin,id,"task.failed",{code});}catch{}
  return json({taskId:id,status:"failed",error:"Task execution failed validation or an internal step. Check task history for safe status details.",code},500);
 }
}

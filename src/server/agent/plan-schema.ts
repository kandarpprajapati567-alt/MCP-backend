export interface AgentPlanStep { id:string; objective:string; expectedOutcome:string; }
export interface AgentToolCall { id:string; toolId:"text.word_count"|"text.extract_keywords"|"text.text_stats"; arguments:Record<string,unknown>; }
export interface AgentPlan { version:1; goal:string; steps:AgentPlanStep[]; toolCalls:AgentToolCall[]; }
export type PlanParseResult={ok:true;value:AgentPlan}|{ok:false;error:string};
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value==="object"&&value!==null&&!Array.isArray(value);}
function hasExactKeys(value:Record<string,unknown>,keys:readonly string[]){return Object.keys(value).length===keys.length&&keys.every(key=>key in value);}
export function parseAgentPlan(value:unknown):PlanParseResult {
 if(!isRecord(value)||!hasExactKeys(value,["version","goal","steps","toolCalls"]))return {ok:false,error:"Plan must contain only version, goal, steps, and toolCalls."};
 if(value.version!==1)return {ok:false,error:"Unsupported plan version."};
 if(typeof value.goal!=="string"||!value.goal.trim()||value.goal.length>500)return {ok:false,error:"Plan goal must be between 1 and 500 characters."};
 if(!Array.isArray(value.steps)||value.steps.length<1||value.steps.length>8)return {ok:false,error:"Plan must contain between 1 and 8 steps."};
 const seen=new Set<string>();const steps:AgentPlanStep[]=[];
 for(const raw of value.steps){
  if(!isRecord(raw)||!hasExactKeys(raw,["id","objective","expectedOutcome"]))return {ok:false,error:"Each step must contain only id, objective, and expectedOutcome."};
  const {id,objective,expectedOutcome}=raw;
  if(typeof id!=="string"||!/^step-[1-8]$/.test(id)||seen.has(id))return {ok:false,error:"Step IDs must be unique values from step-1 through step-8."};
  if(typeof objective!=="string"||!objective.trim()||objective.length>500)return {ok:false,error:"Each objective must be between 1 and 500 characters."};
  if(typeof expectedOutcome!=="string"||!expectedOutcome.trim()||expectedOutcome.length>300)return {ok:false,error:"Each expected outcome must be between 1 and 300 characters."};
  seen.add(id);steps.push({id,objective,expectedOutcome});
 }
 if(!Array.isArray(value.toolCalls)||value.toolCalls.length>4)return {ok:false,error:"Plan may contain at most 4 registered tool calls."};
 const callIds=new Set<string>();const toolCalls:AgentToolCall[]=[];
 for(const raw of value.toolCalls){
  if(!isRecord(raw)||!hasExactKeys(raw,["id","toolId","arguments"]))return {ok:false,error:"Tool calls must contain only id, toolId, and arguments."};
  if(typeof raw.id!=="string"||!/^call-[1-4]$/.test(raw.id)||callIds.has(raw.id))return {ok:false,error:"Tool call IDs must be unique call-1 through call-4."};
  if(!["text.word_count","text.extract_keywords","text.text_stats"].includes(String(raw.toolId)))return {ok:false,error:"Plan requested an unregistered tool."};
  if(!isRecord(raw.arguments)||Object.keys(raw.arguments).length!==1||typeof raw.arguments.text!=="string"||raw.arguments.text.length>12000)return {ok:false,error:"Tool arguments failed validation."};
  callIds.add(raw.id);toolCalls.push({id:raw.id,toolId:raw.toolId as AgentToolCall["toolId"],arguments:{text:raw.arguments.text}});
 }
 return {ok:true,value:{version:1,goal:value.goal,steps,toolCalls}};
}

import "server-only";
import type { AIProvider } from "../ai/providers/types";
import { parseAgentPlan,type AgentPlan } from "./plan-schema";
const PROMPT=[
"You are a task planner. Return JSON only with exactly this shape:",
'{"version":1,"goal":"...","steps":[{"id":"step-1","objective":"...","expectedOutcome":"..."}],"toolCalls":[{"id":"call-1","toolId":"text.word_count","arguments":{"text":"..."}}]}',
"Use 1–8 steps and at most 4 tool calls. toolCalls may be empty.",
"Only use text.word_count, text.extract_keywords, text.text_stats. Only use a tool when directly useful.",
"Tool arguments contain only a text field sourced from the user's supplied text. No shell, network, files, code, or external side effects."
].join("\n");
export async function createAgentPlan(provider:AIProvider,task:string):Promise<AgentPlan>{
 if(typeof task!=="string"||task.trim().length<1||task.length>4000)throw new Error("Task must be between 1 and 4000 characters.");
 const result=await provider.generate({messages:[{role:"system",content:PROMPT},{role:"user",content:task.trim()}],temperature:0.1,maxOutputTokens:1600});
 let decoded:unknown;try{decoded=JSON.parse(result.text);}catch{throw new Error("Planner returned invalid JSON.");}
 const parsed=parseAgentPlan(decoded);if(!parsed.ok)throw new Error(parsed.error);return parsed.value;
}

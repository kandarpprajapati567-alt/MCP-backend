import {NextResponse} from "next/server";
import {AIProviderError} from "@/server/ai/providers/types";
import {parseAIGenerationInput} from "@/server/ai/routing/generation-request";
import {executeUserWorkflow} from "@/server/ai/routing/runtime-executor";
import {consumeAIRequest,recordAIOutputUsage} from "@/server/ai/usage/usage-limits";
import {recordProviderObservation,type ProviderObservation} from "@/server/ai/usage/provider-observability";
import {PERSONAL_OWNER_ID,verifyOwnerRequest} from "@/server/security/owner-auth";
export const dynamic="force-dynamic";
const MAX_BODY_BYTES=16384;
function privateJson(body:unknown,status=200,extraHeaders:Record<string,string>={}){return NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store",...extraHeaders}});}
export async function POST(request:Request){
 const userId=verifyOwnerRequest(request);if(!userId)return privateJson({error:"Unauthorized."},401);
 const contentLength=Number(request.headers.get("content-length")??"0");
 if(!Number.isFinite(contentLength)||contentLength<0||contentLength>MAX_BODY_BYTES)return privateJson({error:"Request is too large or has an invalid content length."},413);
 let body:unknown;try{body=await request.json();}catch{return privateJson({error:"Invalid JSON body."},400);}
 const parsed=parseAIGenerationInput(body);if(!parsed.ok)return privateJson({error:parsed.error},parsed.status);
 const inputCharacters=parsed.value.messages.reduce((total,message)=>total+message.content.length,0);
 try{const decision=await consumeAIRequest(PERSONAL_OWNER_ID,inputCharacters);if(!decision.allowed)return privateJson({error:"AI usage limit reached. Please retry later.",code:decision.reason},429,{"Retry-After":String(Math.max(1,decision.retryAfterSeconds))});}
 catch{return privateJson({error:"AI generation is temporarily unavailable."},503);}
 const observations:ProviderObservation[]=[];
 try{
  const execution=await executeUserWorkflow(PERSONAL_OWNER_ID,parsed.value.workflow,{messages:parsed.value.messages,...(parsed.value.temperature===undefined?{}:{temperature:parsed.value.temperature}),...(parsed.value.maxOutputTokens===undefined?{}:{maxOutputTokens:parsed.value.maxOutputTokens})},attempt=>{
   if(!["mock","openai","openrouter"].includes(attempt.providerId))return;
   observations.push({providerId:attempt.providerId as ProviderObservation["providerId"],outcome:attempt.outcome,latencyMs:attempt.latencyMs,...(attempt.errorCode&&attempt.errorCode!=="INVALID_REQUEST"?{errorCode:attempt.errorCode}:{})});
  });
  const tokens=execution.result.usage?.outputTokens;if(typeof tokens==="number"){try{await recordAIOutputUsage(PERSONAL_OWNER_ID,tokens);}catch{}}
  return privateJson({workflow:execution.route.workflow,provider:execution.result.provider,model:execution.result.model,usedFallback:execution.route.isFallback,output:execution.result.text,finishReason:execution.result.finishReason,usage:execution.result.usage??null,requestId:execution.result.requestId});
 }catch(error){
  if(error instanceof AIProviderError){const status=error.code==="INVALID_REQUEST"?400:error.code==="AUTHENTICATION_FAILED"?502:error.code==="RATE_LIMITED"?429:error.code==="TIMEOUT"?504:503;return privateJson({error:"AI generation could not be completed.",code:error.code},status);}
  return privateJson({error:"AI generation is temporarily unavailable."},503);
 }finally{await Promise.all(observations.map(async observation=>{try{await recordProviderObservation(PERSONAL_OWNER_ID,observation);}catch{}}));}
}

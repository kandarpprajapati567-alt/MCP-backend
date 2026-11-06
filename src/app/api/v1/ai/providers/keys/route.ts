import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {encryptProviderSecret} from "@/server/ai/secrets/encryption";
import {PERSONAL_OWNER_ID,verifyOwnerRequest} from "@/server/security/owner-auth";
export const dynamic="force-dynamic";
const PROVIDERS=["openai","anthropic","google","openrouter"] as const;
type Provider=(typeof PROVIDERS)[number];
function json(body:unknown,status=200){return NextResponse.json(body,{status,headers:{"Cache-Control":"private, no-store"}});}
function authorized(request:Request){return verifyOwnerRequest(request)!==null;}
export async function GET(request:Request){
 if(!authorized(request))return json({error:"Unauthorized."},401);
 try{const {data,error}=await createAdminClient().from("ai_provider_secrets").select("provider,created_at,updated_at").eq("user_id",PERSONAL_OWNER_ID).order("provider");if(error)return json({error:"Unable to load provider settings."},500);return json({providers:data??[]});}
 catch{return json({error:"Provider secret storage is unavailable."},503);}
}
export async function PUT(request:Request){
 if(!authorized(request))return json({error:"Unauthorized."},401);
 const length=Number(request.headers.get("content-length")??"0");if(length>8192)return json({error:"Request is too large."},413);
 let body:unknown;try{body=await request.json();}catch{return json({error:"Invalid JSON body."},400);}
 if(!body||typeof body!=="object"||Array.isArray(body))return json({error:"A JSON object is required."},400);
 const input=body as Record<string,unknown>;
 if(typeof input.provider!=="string"||!PROVIDERS.includes(input.provider as Provider)||typeof input.apiKey!=="string"||input.apiKey.trim()!==input.apiKey||input.apiKey.length<8||input.apiKey.length>4096)return json({error:"A supported provider and valid API key are required."},400);
 try{
  const encrypted=encryptProviderSecret(input.apiKey);const {error}=await createAdminClient().from("ai_provider_secrets").upsert({user_id:PERSONAL_OWNER_ID,provider:input.provider,...encrypted,updated_at:new Date().toISOString()},{onConflict:"user_id,provider"});
  if(error)return json({error:"Unable to save provider credential."},500);return json({saved:true,provider:input.provider});
 }catch{return json({error:"Provider secret storage is not configured or unavailable."},503);}
}
export async function DELETE(request:Request){
 if(!authorized(request))return json({error:"Unauthorized."},401);
 let body:unknown;try{body=await request.json();}catch{return json({error:"Invalid JSON body."},400);}
 if(!body||typeof body!=="object"||Array.isArray(body)||typeof (body as Record<string,unknown>).provider!=="string"||!PROVIDERS.includes((body as Record<string,unknown>).provider as Provider))return json({error:"A supported provider is required."},400);
 try{const {error}=await createAdminClient().from("ai_provider_secrets").delete().eq("user_id",PERSONAL_OWNER_ID).eq("provider",(body as Record<string,unknown>).provider as Provider);if(error)return json({error:"Unable to remove provider credential."},500);return json({deleted:true});}
 catch{return json({error:"Provider secret storage is unavailable."},503);}
}

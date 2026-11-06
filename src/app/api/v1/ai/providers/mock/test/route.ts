import {NextResponse} from "next/server";
import {MockAIProvider} from "@/server/ai/providers/mock-provider";
import {AIProviderError} from "@/server/ai/providers/types";
import {verifyOwnerRequest} from "@/server/security/owner-auth";
export const dynamic="force-dynamic";
const provider=new MockAIProvider();
export async function POST(request:Request){
 const headers={"Cache-Control":"private, no-store"};
 if(!verifyOwnerRequest(request))return NextResponse.json({error:{code:"UNAUTHENTICATED",message:"Owner access is required."}},{status:401,headers});
 const length=Number(request.headers.get("content-length")??"0");if(length>16000)return NextResponse.json({error:{code:"PAYLOAD_TOO_LARGE",message:"Request body is too large."}},{status:413,headers});
 let body:unknown;try{body=await request.json();}catch{return NextResponse.json({error:{code:"INVALID_JSON",message:"A valid JSON body is required."}},{status:400,headers});}
 const prompt=typeof body==="object"&&body!==null&&"prompt" in body?(body as {prompt?:unknown}).prompt:undefined;
 if(typeof prompt!=="string"||!prompt.trim()||prompt.length>1000)return NextResponse.json({error:{code:"INVALID_REQUEST",message:"prompt must be 1–1000 characters."}},{status:400,headers});
 try{const result=await provider.generate({messages:[{role:"user",content:prompt.trim()}]});return NextResponse.json({success:true,provider:provider.id,result},{headers});}
 catch(error){if(error instanceof AIProviderError)return NextResponse.json({error:{code:error.code,message:error.message}},{status:400,headers});return NextResponse.json({error:{code:"PROVIDER_UNAVAILABLE",message:"Mock provider test failed."}},{status:503,headers});}
}

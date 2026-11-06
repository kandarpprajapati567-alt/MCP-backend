import {NextResponse} from "next/server";
import {createOwnerSession,isSameOriginRequest,verifyOwnerMasterToken} from "@/server/security/owner-auth";
export const dynamic="force-dynamic";
export async function POST(request:Request){
 const headers={"Cache-Control":"no-store"};
 if(!isSameOriginRequest(request))return NextResponse.json({error:"Cross-origin request rejected."},{status:403,headers});
 const length=Number(request.headers.get("content-length")??"0");if(length>8192)return NextResponse.json({error:"Request too large."},{status:413,headers});
 let body:unknown;try{body=await request.json();}catch{return NextResponse.json({error:"Invalid JSON body."},{status:400,headers});}
 const ownerToken=body&&typeof body==="object"&&!Array.isArray(body)?(body as Record<string,unknown>).ownerToken:undefined;
 try{if(!verifyOwnerMasterToken(ownerToken))return NextResponse.json({error:"Invalid owner master token."},{status:401,headers});}
 catch{return NextResponse.json({error:"Owner authentication is not configured."},{status:503,headers});}
 const session=createOwnerSession();
 return NextResponse.json({sessionToken:session.token,expiresAt:new Date(session.expiresAt*1000).toISOString(),expiresInSeconds:4*24*60*60},{headers});
}

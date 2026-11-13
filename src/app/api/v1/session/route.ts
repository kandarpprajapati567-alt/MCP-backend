import {NextResponse} from "next/server";
import {createOwnerSessionValue,isSameOriginRequest,OWNER_SESSION_COOKIE,OWNER_SESSION_TTL_SECONDS,verifyOwnerMasterToken,verifyOwnerRequest} from "@/server/security/owner-auth";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store","Pragma":"no-cache"};
export async function GET(request:Request){let authenticated=false;try{authenticated=Boolean(verifyOwnerRequest(request));}catch{authenticated=false;}return NextResponse.json({authenticated},{headers});}
export async function POST(request:Request){
 if(!isSameOriginRequest(request))return NextResponse.json({error:"Same-origin request required."},{status:403,headers});
 const authorization=request.headers.get("authorization");const token=request.headers.get("x-fs-owner-token")??(authorization?.match(/^Bearer\s+(.+)$/i)?.[1]??"");
 let valid=false;try{valid=verifyOwnerMasterToken(token);}catch{valid=false;}
 if(!valid)return NextResponse.json({error:"Owner key was rejected."},{status:401,headers});
 const expiresAt=new Date(Date.now()+OWNER_SESSION_TTL_SECONDS*1000).toISOString();const response=NextResponse.json({ok:true,expiresAt},{status:201,headers});
 response.cookies.set({name:OWNER_SESSION_COOKIE,value:createOwnerSessionValue(),httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:OWNER_SESSION_TTL_SECONDS});return response;
}
export async function DELETE(request:Request){
 if(!isSameOriginRequest(request))return NextResponse.json({error:"Same-origin request required."},{status:403,headers});
 const response=NextResponse.json({ok:true},{headers});response.cookies.set({name:OWNER_SESSION_COOKIE,value:"",httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:0});return response;
}

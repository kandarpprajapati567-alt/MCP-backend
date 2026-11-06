import {NextResponse} from "next/server";
import {getAIUsageStatus} from "@/server/ai/usage/usage-status-service";
import {PERSONAL_OWNER_ID,verifyOwnerRequest} from "@/server/security/owner-auth";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 const headers={"Cache-Control":"private, no-store"};
 if(!verifyOwnerRequest(request))return NextResponse.json({error:"Unauthorized."},{status:401,headers});
 try{return NextResponse.json({ok:true,usage:await getAIUsageStatus(PERSONAL_OWNER_ID)},{headers});}
 catch{return NextResponse.json({error:"AI usage status is temporarily unavailable."},{status:503,headers});}
}

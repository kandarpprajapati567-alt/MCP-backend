import {NextResponse} from "next/server";
import {verifyOwnerRequest} from "@/server/security/owner-auth";
import {TOOL_CATALOG} from "@/server/tools/registry";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 if(!verifyOwnerRequest(request))return NextResponse.json({error:"Unauthorized."},{status:401,headers:{"Cache-Control":"no-store"}});
 return NextResponse.json({tools:TOOL_CATALOG,executionPolicy:"allow-listed, schema-validated, local-only"},{headers:{"Cache-Control":"private, no-store"}});
}

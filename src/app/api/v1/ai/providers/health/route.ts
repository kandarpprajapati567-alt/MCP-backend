import {NextResponse} from "next/server";
import {createRuntimeProviderRegistry} from "@/server/ai/providers/runtime-registry";
import {getProviderObservations} from "@/server/ai/usage/provider-observability";
import {PERSONAL_OWNER_ID,verifyOwnerRequest} from "@/server/security/owner-auth";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 const headers={"Cache-Control":"private, no-store"};
 if(!verifyOwnerRequest(request))return NextResponse.json({error:"Unauthorized."},{status:401,headers});
 try{
  const [providers,observations]=await Promise.all([createRuntimeProviderRegistry(PERSONAL_OWNER_ID),getProviderObservations(PERSONAL_OWNER_ID)]);
  const metrics=new Map(observations.map(item=>[item.providerId,item]));
  const entries=Object.entries(providers).map(([id,provider])=>({id,configured:true,status:"ready" as const,capabilities:provider.capabilities,checkType:id==="mock"?"self-test-adapter":"credential-configured",observed24h:metrics.get(id)??null}));
  return NextResponse.json({ok:entries.some(entry=>entry.id==="mock"),checkedAt:new Date().toISOString(),billingImpact:"none",vendorConnectivityTested:false,monitoring:"passive-generation-observations",observationWindow:"24h",providers:entries},{headers});
 }catch{return NextResponse.json({ok:false,error:"Provider diagnostics could not be checked."},{status:503,headers});}
}

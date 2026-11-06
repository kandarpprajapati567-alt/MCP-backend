import {NextResponse} from "next/server";
import {createAdminClient} from "@/lib/supabase/admin";
import {PERSONAL_OWNER_ID,verifyOwnerRequest} from "@/server/security/owner-auth";
export const dynamic="force-dynamic";
export async function GET(request:Request,context:{params:Promise<{taskId:string}>}){
 if(!verifyOwnerRequest(request))return NextResponse.json({error:"Unauthorized."},{status:401,headers:{"Cache-Control":"no-store"}});
 const {taskId}=await context.params;if(!/^[0-9a-f-]{36}$/i.test(taskId))return NextResponse.json({error:"Invalid task id."},{status:400});
 const admin=createAdminClient();
 const [{data:task,error:taskError},{data:events,error:eventError}]=await Promise.all([
  admin.from("agent_tasks").select("id,status,task,plan,tool_results,result,error_code,created_at,updated_at,completed_at").eq("id",taskId).eq("owner_id",PERSONAL_OWNER_ID).maybeSingle(),
  admin.from("agent_task_events").select("event_type,payload,created_at").eq("task_id",taskId).eq("owner_id",PERSONAL_OWNER_ID).order("created_at",{ascending:true})
 ]);
 if(taskError||eventError)return NextResponse.json({error:"Unable to load task."},{status:500});
 if(!task)return NextResponse.json({error:"Task not found."},{status:404});
 return NextResponse.json({task,events:events??[]},{headers:{"Cache-Control":"private, no-store"}});
}

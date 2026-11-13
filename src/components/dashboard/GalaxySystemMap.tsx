"use client";
import {useCallback,useEffect,useMemo,useRef,useState} from "react";
import type {FormEvent,PointerEvent as ReactPointerEvent,WheelEvent as ReactWheelEvent} from "react";
type Health={status?:string;version?:string;services?:{database?:string;authentication?:string}};
type Device={device_id:string;display_name:string;platform:string;status:string;last_seen_at:string|null};
type Agent={id:string;name:string;role?:string;enabled:boolean};
type Task={id:string;status:string;task:string;updated_at?:string;created_at:string;error_message?:string;failed_stage?:string;agent_definition_id?:string|null};
type Provider={provider:string};
type MapNode={id:string;title:string;description:string;status:string;symbol:string};
const positions=[{id:"providers",className:"node-providers",symbol:"✦"},{id:"android",className:"node-android",symbol:"▯"},{id:"agents",className:"node-agents",symbol:"◈"},{id:"bots",className:"node-bots",symbol:"◉"},{id:"mcp",className:"node-mcp",symbol:"⌘"},{id:"memory",className:"node-memory",symbol:"▤"},{id:"external",className:"node-external",symbol:"◌"}];
export function GalaxySystemMap(){
 const [health,setHealth]=useState<Health>({});
 const [ownerReady,setOwnerReady]=useState(false);
 const [agents,setAgents]=useState<Agent[]>([]);
 const [tasks,setTasks]=useState<Task[]>([]);
 const [devices,setDevices]=useState<Device[]>([]);
 const [providers,setProviders]=useState<Provider[]>([]);
 const [token,setToken]=useState("");
 const [connectOpen,setConnectOpen]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [selectedId,setSelectedId]=useState<string|null>(null);
 const [focusedId,setFocusedId]=useState("core");
 const [zoom,setZoom]=useState(1);
 const [rotation,setRotation]=useState(0);
 const [offset,setOffset]=useState({x:0,y:0});
 const [dragging,setDragging]=useState(false);
 const dragOrigin=useRef<{x:number;y:number;offsetX:number;offsetY:number}|null>(null);
 const previousTaskUpdate=useRef("");
 const refresh=useCallback(async()=>{
  try{
   const healthResponse=await fetch("/api/v1/health",{cache:"no-store"});
   if(healthResponse.ok)setHealth(await healthResponse.json() as Health);
   const sessionResponse=await fetch("/api/v1/session",{cache:"no-store"});
   const session=sessionResponse.ok?await sessionResponse.json() as {authenticated?:boolean}:{};
   if(!session.authenticated){setOwnerReady(false);setAgents([]);setTasks([]);setDevices([]);setProviders([]);return;}
   const paths=["/api/v1/agents","/api/v1/agent/tasks","/api/v1/devices","/api/v1/ai/providers/keys"];
   const responses=await Promise.all(paths.map(path=>fetch(path,{cache:"no-store"})));
   if(responses.some(response=>response.status===401)){setOwnerReady(false);setAgents([]);setTasks([]);setDevices([]);setProviders([]);return;}
   if(responses.some(response=>!response.ok))return;
   const [a,t,d,p]=await Promise.all(responses.map(response=>response.json()));
   setAgents(Array.isArray(a.agents)?a.agents:[]);setTasks(Array.isArray(t.tasks)?t.tasks:[]);
   setDevices(Array.isArray(d.devices)?d.devices:[]);setProviders(Array.isArray(p.providers)?p.providers:[]);setOwnerReady(true);
  }catch{/* Retain last verified snapshot; the next poll retries. */}
 },[]);
 useEffect(()=>{void refresh();const poll=window.setInterval(()=>void refresh(),10000);return()=>window.clearInterval(poll);},[refresh]);
 const latestTask=tasks[0]?.updated_at??tasks[0]?.created_at??"";
 useEffect(()=>{if(!latestTask||latestTask===previousTaskUpdate.current)return;previousTaskUpdate.current=latestTask;setFocusedId("agents");setZoom(1.08);setOffset({x:0,y:-16});const timer=window.setTimeout(()=>{setFocusedId("core");setZoom(1);setOffset({x:0,y:0});},3200);return()=>window.clearTimeout(timer);},[latestTask]);
 const onlineDevices=devices.filter(device=>device.status==="online"&&device.last_seen_at&&Date.now()-Date.parse(device.last_seen_at)<300000);
 const enabledAgents=agents.filter(agent=>agent.enabled);
 const activeTasks=tasks.filter(task=>["queued","planning","executing","running","synthesizing","waiting_for_device"].includes(task.status));
 const detailMap:Record<string,MapNode>={
  core:{id:"core",title:"Central Server",description:"Shared backend for owner sessions, task lifecycle, device jobs and verified events.",status:health.status??"checking",symbol:"✧"},
  android:{id:"android",title:"Android Device",description:"Trusted Android client receives approved jobs and reports execution through its device-scoped credential.",status:ownerReady?(onlineDevices.length?"connected":"not paired / offline"):"owner session required",symbol:"▯"},
  agents:{id:"agents",title:"Agent Network",description:"Planner, router and specialist Agent definitions with policy-checked execution.",status:ownerReady?enabledAgents.length+" enabled · "+activeTasks.length+" active":"owner session required",symbol:"◈"},
  bots:{id:"bots",title:"Bot Gateway",description:"Shared channel contract exists; production channel delivery is not assumed.",status:"contract foundation",symbol:"◉"},
  providers:{id:"providers",title:"AI Providers",description:"Configured provider adapters are distinct from successful inference.",status:ownerReady?providers.length+" configured":"owner session required",symbol:"✦"},
  mcp:{id:"mcp",title:"MCP Hub",description:"Tool catalogue and validated invocation protocol.",status:"endpoint available",symbol:"⌘"},
  memory:{id:"memory",title:"Database & Memory",description:"Persistent owner memory and task records.",status:health.services?.database??"checking",symbol:"▤"},
  external:{id:"external",title:"External Services",description:"External integrations are separate capability zones; individual health is not inferred.",status:"not individually verified",symbol:"◌"}
 };
 const selected=selectedId?detailMap[selectedId]??null:null;
 const connect=async(event:FormEvent<HTMLFormElement>)=>{
  event.preventDefault();if(token.length<32)return;setBusy(true);setError("");
  try{const response=await fetch("/api/v1/session",{method:"POST",headers:{"x-fs-owner-token":token},cache:"no-store"});const data=await response.json();if(!response.ok)throw new Error(data.error??"Owner authentication failed.");setToken("");setConnectOpen(false);await refresh();}
  catch(cause){setError(cause instanceof Error?cause.message:"Could not establish owner session.");}finally{setBusy(false);}
 };
 const disconnect=async()=>{await fetch("/api/v1/session",{method:"DELETE",cache:"no-store"});setOwnerReady(false);setAgents([]);setTasks([]);setDevices([]);setProviders([]);};
 function down(event:ReactPointerEvent<HTMLDivElement>){if((event.target as HTMLElement).closest("button,input,form"))return;dragOrigin.current={x:event.clientX,y:event.clientY,offsetX:offset.x,offsetY:offset.y};setDragging(true);event.currentTarget.setPointerCapture(event.pointerId);}
 function move(event:ReactPointerEvent<HTMLDivElement>){if(!dragOrigin.current)return;setOffset({x:dragOrigin.current.offsetX+event.clientX-dragOrigin.current.x,y:dragOrigin.current.offsetY+event.clientY-dragOrigin.current.y});}
 function up(event:ReactPointerEvent<HTMLDivElement>){dragOrigin.current=null;setDragging(false);if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);}
 function wheel(event:ReactWheelEvent<HTMLDivElement>){event.preventDefault();setZoom(value=>Math.max(.72,Math.min(1.48,value+(event.deltaY<0?.06:-.06))));}
 const coreStatus=health.status??"checking";
 const coreClass=coreStatus==="ok"?"is-live":coreStatus==="degraded"?"is-warning":"is-unknown";
 const transform="translate("+offset.x+"px, "+offset.y+"px) scale("+zoom+") rotate("+rotation+"deg) rotateX(52deg)";
 return <section className="galaxy-map" aria-label="Futuristic System live map">
  <div className="galaxy-nebula" aria-hidden="true"/><div className="galaxy-stars galaxy-stars-a" aria-hidden="true"/><div className="galaxy-stars galaxy-stars-b" aria-hidden="true"/>
  <div className="galaxy-map-top"><div className="galaxy-wordmark"><span className="galaxy-brand-mark">F</span><span><strong>FUTURISTIC SYSTEM</strong><small>LIVE SYSTEM MAP</small></span></div>
   <div className="galaxy-top-actions"><span className={"galaxy-live-indicator "+coreClass}><i/>{health.status==="ok"?"SERVER LIVE":coreStatus.toUpperCase()}</span>
    {ownerReady?<button type="button" className="galaxy-session-button is-connected" onClick={()=>void disconnect()}>OWNER CONNECTED · DISCONNECT</button>:<button type="button" className="galaxy-session-button" onClick={()=>setConnectOpen(value=>!value)}>CONNECT OWNER</button>}
   </div>
  </div>
  {connectOpen&&!ownerReady&&<form className="galaxy-connect-panel" onSubmit={connect}><div><strong>Owner session</strong><p>Enter the owner key once. A short-lived HttpOnly session unlocks live map data.</p></div><input type="password" autoComplete="off" value={token} onChange={event=>setToken(event.target.value)} placeholder="Owner access key" aria-label="Owner access key"/><button type="submit" disabled={busy||token.length<32}>{busy?"CONNECTING…":"CONNECT"}</button>{error&&<p role="alert">{error}</p>}</form>}
  <div className={"galaxy-viewport"+(dragging?" is-dragging":"")} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onPointerLeave={up} onWheel={wheel}>
   <div className={"galaxy-universe"+(activeTasks.length>0?" has-active-work":"")} style={{transform}}>
    <svg className="galaxy-links" viewBox="0 0 1200 760" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><defs><linearGradient id="galaxyFlow" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#4b75ff" stopOpacity=".05"/><stop offset="48%" stopColor="#b7a7ff" stopOpacity=".95"/><stop offset="100%" stopColor="#63e8d0" stopOpacity=".1"/></linearGradient><filter id="galaxyGlow"><feGaussianBlur stdDeviation="3" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>
     <path className="galaxy-link-path" d="M600 380 C490 310 390 230 250 215"/><path className="galaxy-link-path" d="M600 380 C450 410 300 420 160 450"/><path className="galaxy-link-path" d="M600 380 C590 270 590 185 600 110"/><path className="galaxy-link-path" d="M600 380 C770 300 890 260 1030 230"/><path className="galaxy-link-path" d="M600 380 C770 410 900 450 1040 480"/><path className="galaxy-link-path" d="M600 380 C620 510 630 590 600 670"/><path className="galaxy-link-path" d="M600 380 C430 530 300 610 210 650"/>
     <circle className="galaxy-flow-particle" r="4"><animateMotion dur="8s" repeatCount="indefinite" path="M600 380 C490 310 390 230 250 215"/></circle><circle className="galaxy-flow-particle delay-one" r="3"><animateMotion dur="10s" repeatCount="indefinite" path="M600 380 C770 410 900 450 1040 480"/></circle><circle className="galaxy-flow-particle delay-two" r="3"><animateMotion dur="9s" repeatCount="indefinite" path="M600 380 C620 510 630 590 600 670"/></circle>
    </svg>
    <div className={"galaxy-core "+coreClass+(focusedId==="core"?" is-focused":"")} role="img" aria-label="Central server"><div className="core-orbit core-orbit-one"/><div className="core-orbit core-orbit-two"/><div className="core-crystal"><span>✧</span></div><div className="core-pulse"/></div>
    {positions.map(position=>{const detail=detailMap[position.id];const active=selectedId===position.id;return <button key={position.id} type="button" title={detail.title+" · "+detail.status} aria-label={detail.title+": "+detail.status} onClick={()=>setSelectedId(active?null:position.id)} className={"galaxy-node "+position.className+(active?" is-selected":"")+(focusedId===position.id?" is-focused":"")}><span className="galaxy-node-ring"/><span className="galaxy-node-symbol">{position.symbol}</span>
      {position.id==="agents"&&<span className="agent-avatar-orbit">{(enabledAgents.length?enabledAgents.slice(0,4):[{id:"agent-placeholder",name:"Agent"}]).map((agent,index)=><i key={agent.id} className={"agent-avatar avatar-"+index} title={agent.name}>{enabledAgents.length?agent.name.slice(0,1).toUpperCase():"✦"}</i>)}</span>}
      {position.id==="bots"&&<span className="bot-satellites"><i/><i/><i/></span>}
     </button>;})}
   </div>
  </div>
  <div className="galaxy-map-controls"><button type="button" onClick={()=>setZoom(value=>Math.min(1.48,value+.1))} aria-label="Zoom in">＋</button><button type="button" onClick={()=>setZoom(value=>Math.max(.72,value-.1))} aria-label="Zoom out">−</button><button type="button" onClick={()=>{setZoom(1);setOffset({x:0,y:0});setRotation(0);}} aria-label="Reset camera">⌖</button><button type="button" onClick={()=>setRotation(value=>value+5)} aria-label="Rotate map">⟳</button></div>
  <div className="galaxy-map-footer"><span><i className="galaxy-footer-dot"/>{ownerReady?"OWNER DATA SYNCED":"PUBLIC MAP VIEW"}</span><span>{ownerReady?onlineDevices.length:"—"} DEVICES · {ownerReady?enabledAgents.length:"—"} AGENTS · {ownerReady?activeTasks.length:"—"} ACTIVE TASKS</span><span>REFRESH 10S</span></div>
  {selected&&<aside className="galaxy-inspector galaxy-inspector-cinematic" aria-label={selected.title+" personal map"}>
   <div className="galaxy-inspector-head"><div><span className="galaxy-inspector-kicker">PERSONAL SYSTEM MAP</span><strong>{selected.title}</strong><small>{selected.status}</small></div><button type="button" onClick={()=>setSelectedId(null)} aria-label="Close component details">×</button></div>
   <p className="galaxy-inspector-description">{selected.description}</p>
   <div className="personal-map">
    <div className="personal-map-core"><span>{selected.symbol}</span><b>{selected.title}</b><small>SELECTED NODE</small></div>
    <div className="personal-map-links">
     {selectedId==="agents"&&<>{enabledAgents.map(agent=><div className="personal-map-node" key={agent.id}><i className="personal-node-agent">◈</i><span><b>{agent.name}</b><small>{agent.role??"Specialist agent"} · {agent.enabled?"enabled":"disabled"}</small></span></div>)}{enabledAgents.length===0&&<div className="personal-map-empty">No enabled agents are registered yet.</div>}</>}
     {selectedId==="android"&&<>{devices.map(device=><div className="personal-map-node" key={device.device_id}><i className="personal-node-device">▯</i><span><b>{device.display_name}</b><small>{device.platform} · {device.status}</small></span></div>)}{devices.length===0&&<div className="personal-map-empty">No paired Android devices are registered.</div>}</>}
     {selectedId==="providers"&&<>{providers.map(provider=><div className="personal-map-node" key={provider.provider}><i className="personal-node-provider">✦</i><span><b>{provider.provider}</b><small>Credential configured · inference not yet verified</small></span></div>)}{providers.length===0&&<div className="personal-map-empty">No AI provider credentials are configured.</div>}</>}
     {selectedId==="core"&&<>{[{id:"agents",label:"Agent execution",count:enabledAgents.length},{id:"android",label:"Trusted devices",count:devices.length},{id:"providers",label:"Configured providers",count:providers.length}].map(item=><div className="personal-map-node" key={item.id}><i>{item.id==="agents"?"◈":item.id==="android"?"▯":"✦"}</i><span><b>{item.label}</b><small>{item.count} registered</small></span></div>)}</>}
     {selectedId==="memory"&&<div className="personal-map-node"><i>▤</i><span><b>Persistent task records</b><small>Database: {health.services?.database??"checking"}</small></span></div>}
     {selectedId==="mcp"&&<div className="personal-map-node"><i>⌘</i><span><b>Validated tool invocation</b><small>Tool catalogue and policy checks</small></span></div>}
     {selectedId==="bots"&&<div className="personal-map-empty">Bot channel delivery is not connected or verified. This node remains in foundation state.</div>}
     {selectedId==="external"&&<div className="personal-map-empty">External integrations appear here only after their connection and health checks are implemented.</div>}
    </div>
   </div>
   <div className="galaxy-work-now"><div className="galaxy-work-heading"><b>WORKING NOW</b><span>{activeTasks.length} ACTIVE</span></div>
    {activeTasks.length?activeTasks.slice(0,5).map(task=><article className="galaxy-task-item" key={task.id}><div className="galaxy-task-status"><i className="task-pulse"/><b>{task.status.replaceAll("_"," ")}</b></div><p>{task.task}</p><small>{task.updated_at?"Updated "+new Date(task.updated_at).toLocaleString():"Created "+new Date(task.created_at).toLocaleString()}</small></article>):<div className="galaxy-work-empty">No active task right now. New server-side work will appear here when it is queued or running.</div>}
   </div>
   {ownerReady&&<div className="galaxy-inspector-foot">LIVE OWNER SNAPSHOT · POLLED EVERY 10S</div>}
  </aside>}
 </section>;
}

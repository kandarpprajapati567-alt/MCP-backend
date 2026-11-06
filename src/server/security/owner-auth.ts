import {createHmac,timingSafeEqual} from "node:crypto";
export const PERSONAL_OWNER_ID="00000000-0000-4000-8000-000000000001";
export const OWNER_SESSION_TTL_SECONDS=4*24*60*60;
const SESSION_VERSION="fs1";
function secret(){const value=process.env.FS_OWNER_TOKEN;if(!value||value.length<32)throw new Error("Owner authentication is not configured.");return value;}
function sign(payload:string){return createHmac("sha256",secret()).update(payload).digest("base64url");}
export function isSameOriginRequest(request:Request):boolean{
 const originHeader=request.headers.get("origin");
 if(!originHeader)return true;
 try{
  const origin=new URL(originHeader);
  const forwardedHost=request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host=(forwardedHost||request.headers.get("host")||new URL(request.url).host).toLowerCase();
  const forwardedProto=request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const protocol=(forwardedProto||new URL(request.url).protocol.replace(":","")).toLowerCase();
  return origin.host.toLowerCase()===host&&origin.protocol===protocol+":";
 }catch{return false;}
}
export function verifyOwnerMasterToken(value:unknown):boolean{
 if(typeof value!=="string"||value.length<32)return false;
 const expected=Buffer.from(secret(),"utf8"),supplied=Buffer.from(value,"utf8");
 return expected.length===supplied.length&&timingSafeEqual(expected,supplied);
}
export function createOwnerSession(now=Date.now()){
 const issuedAt=Math.floor(now/1000),expiresAt=issuedAt+OWNER_SESSION_TTL_SECONDS;
 const payload=Buffer.from(JSON.stringify({sub:PERSONAL_OWNER_ID,iat:issuedAt,exp:expiresAt}),"utf8").toString("base64url");
 const signed=SESSION_VERSION+"."+payload;
 return {token:signed+"."+sign(signed),expiresAt};
}
export function verifyOwnerSession(value:string,now=Date.now()):boolean{
 try{
  const parts=value.split(".");if(parts.length!==3||parts[0]!==SESSION_VERSION)return false;
  const signed=parts[0]+"."+parts[1],expected=Buffer.from(sign(signed),"utf8"),supplied=Buffer.from(parts[2],"utf8");
  if(expected.length!==supplied.length||!timingSafeEqual(expected,supplied))return false;
  const payload=JSON.parse(Buffer.from(parts[1],"base64url").toString("utf8")) as {sub?:unknown;iat?:unknown;exp?:unknown};
  const nowSeconds=Math.floor(now/1000);
  return payload.sub===PERSONAL_OWNER_ID&&Number.isInteger(payload.iat)&&Number.isInteger(payload.exp)&&Number(payload.iat)<=nowSeconds+60&&Number(payload.exp)>nowSeconds&&Number(payload.exp)-Number(payload.iat)===OWNER_SESSION_TTL_SECONDS;
 }catch{return false;}
}
export function verifyOwnerRequest(request:Request):string|null{
 const supplied=request.headers.get("x-fs-owner-token")??request.headers.get("authorization")?.replace(/^Bearer\\s+/i,"")??"";
 if(!verifyOwnerSession(supplied)||!isSameOriginRequest(request))return null;
 return PERSONAL_OWNER_ID;
}

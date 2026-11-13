import {createHmac,randomBytes,timingSafeEqual} from "node:crypto";
export const PERSONAL_OWNER_ID="00000000-0000-4000-8000-000000000001";
export const OWNER_SESSION_COOKIE="fs_owner_session";
export const OWNER_SESSION_TTL_SECONDS=12*60*60;
function secret():string{const value=process.env.FS_OWNER_TOKEN;if(!value||value.length<32)throw new Error("Owner authentication is not configured.");return value;}
export function isSameOriginRequest(request:Request):boolean{
 const originHeader=request.headers.get("origin");if(!originHeader)return true;
 try{const origin=new URL(originHeader);const forwardedHost=request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();const host=(forwardedHost||request.headers.get("host")||new URL(request.url).host).toLowerCase();const forwardedProto=request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();const protocol=(forwardedProto||new URL(request.url).protocol.replace(":","")).toLowerCase();return origin.host.toLowerCase()===host&&origin.protocol===protocol+":";}catch{return false;}
}
export function verifyOwnerMasterToken(value:unknown):boolean{if(typeof value!=="string"||value.length<32)return false;const expected=Buffer.from(secret(),"utf8");const supplied=Buffer.from(value,"utf8");return expected.length===supplied.length&&timingSafeEqual(expected,supplied);}
export function createOwnerSessionValue(now=Date.now()):string{const issuedAt=Math.floor(now/1000).toString();const nonce=randomBytes(18).toString("base64url");const payload=issuedAt+"."+nonce;const signature=createHmac("sha256",secret()).update(payload).digest("base64url");return payload+"."+signature;}
export function isValidOwnerSessionValue(value:unknown,now=Date.now()):boolean{
 if(typeof value!=="string")return false;const match=value.match(/^(\d{10})\.([A-Za-z0-9_-]{24})\.([A-Za-z0-9_-]{43})$/);if(!match)return false;
 const issuedAt=Number(match[1]);const current=Math.floor(now/1000);if(!Number.isSafeInteger(issuedAt)||issuedAt>current+60||current-issuedAt>OWNER_SESSION_TTL_SECONDS)return false;
 try{const payload=match[1]+"."+match[2];const expected=Buffer.from(createHmac("sha256",secret()).update(payload).digest("base64url"),"utf8");const supplied=Buffer.from(match[3],"utf8");return expected.length===supplied.length&&timingSafeEqual(expected,supplied);}catch{return false;}
}
function readCookie(request:Request,name:string):string{const raw=request.headers.get("cookie")??"";for(const part of raw.split(";")){const i=part.indexOf("=");if(i>=0&&part.slice(0,i).trim()===name)return part.slice(i+1).trim();}return "";}
export function verifyOwnerRequest(request:Request):string|null{
 if(!isSameOriginRequest(request))return null;
 const authorization=request.headers.get("authorization");const supplied=request.headers.get("x-fs-owner-token")??(authorization?.match(/^Bearer\s+(.+)$/i)?.[1]??"");
 try{if(verifyOwnerMasterToken(supplied))return PERSONAL_OWNER_ID;}catch{return null;}
 return isValidOwnerSessionValue(readCookie(request,OWNER_SESSION_COOKIE))?PERSONAL_OWNER_ID:null;
}

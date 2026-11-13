"use client";

import { useEffect, useRef, useState } from "react";

type PlanetarySystemSceneProps = {
  zoom?: number;
  rotation?: number;
  active?: boolean;
  selectedId?: string | null;
};

const vertexSource = `
attribute vec2 a_position;
void main(){ gl_Position=vec4(a_position,0.0,1.0); }
`;

const fragmentSource = `
precision highp float;
uniform vec2 u_resolution;
uniform float u_time;
uniform float u_bodyCount;
uniform float u_selected;
uniform vec4 u_bodies[9];
uniform vec4 u_colors[9];
uniform float u_kinds[9];

float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
float noise(vec2 p){
  vec2 i=floor(p), f=fract(p);
  f=f*f*(3.0-2.0*f);
  return mix(mix(hash(i),hash(i+vec2(1.0,0.0)),f.x),
             mix(hash(i+vec2(0.0,1.0)),hash(i+vec2(1.0,1.0)),f.x),f.y);
}
float fbm(vec2 p){
  float v=0.0, a=.5;
  for(int i=0;i<4;i++){v+=noise(p)*a;p*=2.03;a*=.5;}
  return v;
}
vec3 planetSurface(vec3 n, float kind, vec3 base, vec2 screen){
  float longitude=atan(n.z,n.x);
  float latitude=asin(clamp(n.y,-1.0,1.0));
  vec2 p=vec2(longitude*2.2,latitude*3.2);
  float clouds=fbm(p*5.0+vec2(u_time*.006,0.0));
  float continents=fbm(p*3.0+vec2(9.2,4.1));
  vec3 color=base;
  if(kind<.5){
    float ocean=smoothstep(.36,.68,continents);
    color=mix(base*.55,base*1.3,ocean);
    color+=vec3(.12,.16,.24)*smoothstep(.56,.82,clouds);
    float city=pow(max(0.0,fbm(p*17.0+vec2(2.0,8.0))-.66),3.0);
    color+=vec3(.95,.65,.32)*city*.8;
  }else if(kind<1.5){
    float bands=sin(latitude*27.0+fbm(p*4.0)*3.2)*.5+.5;
    color*=.68+bands*.48;
    color=mix(color,color*1.22,smoothstep(.55,.82,clouds));
  }else if(kind<2.5){
    float crater=fbm(p*13.0);
    color*=.72+crater*.52;
    color+=vec3(.34,.31,.27)*smoothstep(.73,.9,noise(p*27.0))*.24;
  }else{
    float land=fbm(p*4.0);
    color=mix(base*.58,base*1.28,smoothstep(.34,.73,land));
    color+=vec3(.22,.18,.1)*smoothstep(.64,.82,clouds);
  }
  return color;
}
void main(){
  vec2 px=gl_FragCoord.xy;
  vec2 uv=(px-u_resolution*.5)/min(u_resolution.x,u_resolution.y);
  vec3 color=vec3(.004,.006,.012);
  float star=hash(floor(px*.72));
  float twinkle=hash(floor(px*.72)+vec2(19.0,7.0));
  if(star>.9977) color+=vec3(.62,.7,.82)*(.3+twinkle*.7);
  if(star>.9995) color+=vec3(.75,.82,.95)*1.5;

  // Faint, physically restrained orbital traces around the command planet.
  float r=length(vec2(uv.x*.82,uv.y*1.35));
  float orbit1=1.0-smoothstep(.0015,.0038,abs(r-.31));
  float orbit2=1.0-smoothstep(.0015,.0038,abs(r-.48));
  float orbit3=1.0-smoothstep(.0015,.0038,abs(r-.66));
  color+=vec3(.13,.17,.23)*(orbit1*.23+orbit2*.18+orbit3*.13);

  for(int i=0;i<9;i++){
    if(float(i)>=u_bodyCount) break;
    vec4 body=u_bodies[i];
    vec2 delta=(px-body.xy)/body.z;
    float d=dot(delta,delta);
    if(d<=1.0){
      vec3 normal=vec3(delta.x,-delta.y,sqrt(max(0.0,1.0-d)));
      vec3 lightDir=normalize(vec3(-.52,.62,.72));
      float diffuse=max(dot(normal,lightDir),0.0);
      float rim=pow(1.0-normal.z,2.6);
      vec3 surface=planetSurface(normal,u_kinds[i],u_colors[i].rgb,px);
      float ambient=.12;
      vec3 lit=surface*(ambient+diffuse*.98);
      float atmosphere=pow(max(0.0,1.0-normal.z),3.0);
      lit+=u_colors[i].rgb*atmosphere*.25;
      if(u_kinds[i]<.5) lit+=vec3(.14,.3,.55)*rim*.42;
      if(float(i)==u_selected) lit+=vec3(.22,.34,.52)*pow(1.0-normal.z,1.7)*.85;
      color=mix(color,lit,1.0);
      float shadowEdge=smoothstep(.0,.16,normal.z);
      color*=.84+.16*shadowEdge;
    }else{
      float glow=exp(-d*5.0)*.035;
      color+=u_colors[i].rgb*glow;
    }
  }
  gl_FragColor=vec4(color,1.0);
}
`;

const bodies = [
  { x:.5, y:.5, r:74, color:[.16,.31,.68], kind:0 },
  { x:.59, y:.455, r:15, color:[.56,.56,.53], kind:2 },
  { x:.5, y:.155, r:27, color:[.52,.37,.22], kind:1 },
  { x:.205, y:.295, r:23, color:[.23,.43,.55], kind:0 },
  { x:.13, y:.575, r:19, color:[.53,.42,.29], kind:2 },
  { x:.795, y:.30, r:25, color:[.62,.35,.22], kind:1 },
  { x:.84, y:.61, r:21, color:[.36,.46,.58], kind:0 },
  { x:.59, y:.835, r:24, color:[.49,.42,.31], kind:2 },
  { x:.205, y:.785, r:20, color:[.34,.52,.39], kind:0 },
];

export function PlanetarySystemScene({ zoom=1, rotation=0, active=true, selectedId=null }: PlanetarySystemSceneProps) {
  const canvasRef=useRef<HTMLCanvasElement>(null);
  const [fallback,setFallback]=useState(false);
  const stateRef=useRef({zoom,rotation,active,selectedId});
  useEffect(()=>{stateRef.current={zoom,rotation,active,selectedId};},[zoom,rotation,active,selectedId]);

  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    const gl=canvas.getContext("webgl",{alpha:false,antialias:true,powerPreference:"low-power"});
    if(!gl){setFallback(true);return;}
    const compile=(type:number,source:string)=>{
      const shader=gl.createShader(type);
      if(!shader)throw new Error("WebGL shader allocation failed");
      gl.shaderSource(shader,source);gl.compileShader(shader);
      if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){
        const message=gl.getShaderInfoLog(shader)??"Shader compile failed";
        gl.deleteShader(shader);throw new Error(message);
      }
      return shader;
    };
    let program:WebGLProgram|null=null;
    let frame=0;
    let lastFrame=0;
    try{
      program=gl.createProgram();
      if(!program)throw new Error("WebGL program allocation failed");
      gl.attachShader(program,compile(gl.VERTEX_SHADER,vertexSource));
      gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragmentSource));
      gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)??"WebGL link failed");
      gl.useProgram(program);
      const buffer=gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      const position=gl.getAttribLocation(program,"a_position");
      gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      const resolution=gl.getUniformLocation(program,"u_resolution");
      const time=gl.getUniformLocation(program,"u_time");
      const count=gl.getUniformLocation(program,"u_bodyCount");
      const selected=gl.getUniformLocation(program,"u_selected");
      const bodyLoc=gl.getUniformLocation(program,"u_bodies[0]");
      const colorLoc=gl.getUniformLocation(program,"u_colors[0]");
      const kindLoc=gl.getUniformLocation(program,"u_kinds[0]");
      const reduced=window.matchMedia("(prefers-reduced-motion: reduce)");
      const resize=()=>{
        const rect=canvas.getBoundingClientRect();
        const dpr=Math.min(window.devicePixelRatio||1,1.5);
        canvas.width=Math.max(1,Math.round(rect.width*dpr));
        canvas.height=Math.max(1,Math.round(rect.height*dpr));
        gl.viewport(0,0,canvas.width,canvas.height);
      };
      const observer=new ResizeObserver(resize);observer.observe(canvas);resize();
      const draw=(now:number)=>{
        if(now-lastFrame<33){frame=requestAnimationFrame(draw);return;}
        lastFrame=now;
        const width=canvas.width,height=canvas.height;
        gl.uniform2f(resolution,width,height);
        gl.uniform1f(time,reduced.matches?0:now*.001);
        gl.uniform1f(count,bodies.length);
        const selectedIndex=stateRef.current.selectedId=== "core" ? 0 : stateRef.current.selectedId === "moon" ? 1 : stateRef.current.selectedId === "agents" ? 2 : stateRef.current.selectedId === "providers" ? 3 : stateRef.current.selectedId === "android" ? 4 : stateRef.current.selectedId === "bots" ? 5 : stateRef.current.selectedId === "mcp" ? 6 : stateRef.current.selectedId === "memory" ? 7 : stateRef.current.selectedId === "external" ? 8 : -1;
        gl.uniform1f(selected,selectedIndex);
        const scale=Math.min(width,height);
        const coords:number[]=[];const colors:number[]=[];const kinds:number[]=[];
        for(const body of bodies){
          let x=body.x-.5,y=body.y-.5;
          const angle=stateRef.current.rotation*Math.PI/180;
          const rotatedX=x*Math.cos(angle)-y*Math.sin(angle);
          const rotatedY=x*Math.sin(angle)+y*Math.cos(angle);
          x=rotatedX*stateRef.current.zoom;y=rotatedY*stateRef.current.zoom;
          coords.push(width*(.5+x),height*(.5-y),body.r*(scale/760)*stateRef.current.zoom,0);
          colors.push(body.color[0],body.color[1],body.color[2],1);
          kinds.push(body.kind);
        }
        gl.uniform4fv(bodyLoc,new Float32Array(coords));
        gl.uniform4fv(colorLoc,new Float32Array(colors));
        gl.uniform1fv(kindLoc,new Float32Array(kinds));
        gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
        if(stateRef.current.active&&!reduced.matches)frame=requestAnimationFrame(draw);
      };
      frame=requestAnimationFrame(draw);
      const onVisibility=()=>{if(document.hidden){cancelAnimationFrame(frame);}else if(stateRef.current.active){lastFrame=0;frame=requestAnimationFrame(draw);}};
      document.addEventListener("visibilitychange",onVisibility);
      return ()=>{cancelAnimationFrame(frame);observer.disconnect();document.removeEventListener("visibilitychange",onVisibility);if(program)gl.deleteProgram(program);};
    }catch(error){
      console.error("[planetary-scene] WebGL unavailable:",error);
      setFallback(true);
      if(program)gl.deleteProgram(program);
      return;
    }
  },[]);

  return <><canvas ref={canvasRef} className="planetary-scene-canvas" aria-hidden="true"/>{fallback&&<div className="planetary-scene-fallback" aria-hidden="true"><i className="fallback-planet fallback-core"/><i className="fallback-planet fallback-moon"/><i className="fallback-planet fallback-agents"/><i className="fallback-planet fallback-providers"/><i className="fallback-planet fallback-android"/><i className="fallback-planet fallback-bots"/><i className="fallback-planet fallback-mcp"/><i className="fallback-planet fallback-memory"/><i className="fallback-planet fallback-external"/></div>}</>;
}

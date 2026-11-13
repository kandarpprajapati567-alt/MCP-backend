"use client";

import { useEffect, useRef } from "react";

type Props = {
  agentsConnected: boolean;
  deviceConnected: boolean;
  databaseConnected: boolean;
  providersConfigured: boolean;
};

type Geometry = {
  position: WebGLBuffer;
  color: WebGLBuffer;
  size: WebGLBuffer;
  count: number;
};

const VERTEX_SHADER = `
attribute vec3 aPosition;
attribute vec4 aColor;
attribute float aSize;
uniform mat4 uMatrix;
varying vec4 vColor;
void main() {
  gl_Position = uMatrix * vec4(aPosition, 1.0);
  gl_PointSize = aSize;
  vColor = aColor;
}`;

const FRAGMENT_SHADER = `
precision mediump float;
varying vec4 vColor;
uniform float uPointMode;
void main() {
  if (uPointMode > 0.5) {
    vec2 point = gl_PointCoord - vec2(0.5);
    if (dot(point, point) > 0.25) discard;
  }
  gl_FragColor = vColor;
}`;

function compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) {
    for (let row = 0; row < 4; row += 1) {
      out[column * 4 + row] =
        a[row] * b[column * 4] +
        a[4 + row] * b[column * 4 + 1] +
        a[8 + row] * b[column * 4 + 2] +
        a[12 + row] * b[column * 4 + 3];
    }
  }
  return out;
}

function perspective(aspect: number): Float32Array {
  const f = 1 / Math.tan(Math.PI / 7);
  const near = 0.1;
  const far = 40;
  return new Float32Array([
    f / Math.max(aspect, 0.1), 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) / (near - far), -1,
    0, 0, (2 * far * near) / (near - far), 0,
  ]);
}

function rotationX(angle: number): Float32Array {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]);
}

function rotationY(angle: number): Float32Array {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}

function cameraMatrix(aspect: number, time: number): Float32Array {
  const translation = new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, -5.4, 1,
  ]);
  const model = multiply(rotationX(-0.28), rotationY(time * 0.035));
  return multiply(perspective(aspect), multiply(translation, model));
}

function seeded(index: number): number {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function createGeometry(
  gl: WebGLRenderingContext,
  positions: number[],
  colors: number[],
  sizes: number[],
): Geometry | null {
  const position = gl.createBuffer();
  const color = gl.createBuffer();
  const size = gl.createBuffer();
  if (!position || !color || !size) return null;
  gl.bindBuffer(gl.ARRAY_BUFFER, position);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, color);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER, size);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sizes), gl.STATIC_DRAW);
  return { position, color, size, count: positions.length / 3 };
}

function drawGeometry(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  geometry: Geometry,
  matrix: Float32Array,
  pointMode: boolean,
) {
  const position = gl.getAttribLocation(program, "aPosition");
  const color = gl.getAttribLocation(program, "aColor");
  const size = gl.getAttribLocation(program, "aSize");
  gl.bindBuffer(gl.ARRAY_BUFFER, geometry.position);
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, geometry.color);
  gl.enableVertexAttribArray(color);
  gl.vertexAttribPointer(color, 4, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, geometry.size);
  gl.enableVertexAttribArray(size);
  gl.vertexAttribPointer(size, 1, gl.FLOAT, false, 0, 0);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, "uMatrix"), false, matrix);
  gl.uniform1f(gl.getUniformLocation(program, "uPointMode"), pointMode ? 1 : 0);
  gl.drawArrays(pointMode ? gl.POINTS : gl.LINES, 0, geometry.count);
}

function starGeometry(gl: WebGLRenderingContext): Geometry | null {
  const positions: number[] = [];
  const colors: number[] = [];
  const sizes: number[] = [];
  for (let index = 0; index < 180; index += 1) {
    positions.push((seeded(index * 3) - 0.5) * 7.4);
    positions.push((seeded(index * 3 + 1) - 0.5) * 5.2);
    positions.push((seeded(index * 3 + 2) - 0.5) * 3.2);
    const brightness = 0.28 + seeded(index + 800) * 0.42;
    colors.push(0.56 * brightness, 0.68 * brightness, brightness, 0.72);
    sizes.push(1 + seeded(index + 1400) * 2.1);
  }
  return createGeometry(gl, positions, colors, sizes);
}

function topologyGeometry(gl: WebGLRenderingContext, props: Props): Geometry | null {
  const positions: number[] = [];
  const colors: number[] = [];
  const center = [0, 0, 0];
  const add = (target: number[], color: number[]) => {
    positions.push(...center, ...target);
    colors.push(...color, ...color);
  };
  if (props.providersConfigured) add([-1.35, 0.55, 0.22], [0.58, 0.48, 0.88, 0.3]);
  if (props.deviceConnected) add([-1.38, -0.35, -0.24], [0.3, 0.86, 0.75, 0.78]);
  if (props.agentsConnected) add([0, 1.3, 0.36], [0.72, 0.58, 0.96, 0.82]);
  if (props.databaseConnected) add([0, -1.28, 0.34], [0.34, 0.82, 0.68, 0.72]);
  return createGeometry(gl, positions, colors, Array.from({ length: positions.length / 3 }, () => 1));
}

function nodeGeometry(gl: WebGLRenderingContext, props: Props): Geometry | null {
  const nodes = [
    [-1.35, 0.55, 0.22], [-1.38, -0.35, -0.24], [0, 1.3, 0.36],
    [1.38, 0.55, -0.3], [1.38, -0.35, 0.2], [0, -1.28, 0.34], [-1.3, -1.0, -0.18],
  ];
  const alpha = [
    props.providersConfigured ? 0.82 : 0.2,
    props.deviceConnected ? 0.88 : 0.2,
    props.agentsConnected ? 1 : 0.22,
    0.2, 0.24,
    props.databaseConnected ? 0.9 : 0.2,
    0.18,
  ];
  const palette = [
    [0.75, 0.58, 1], [0.36, 0.88, 0.78], [0.76, 0.66, 1],
    [0.38, 0.78, 0.88], [0.65, 0.74, 1], [0.4, 0.88, 0.72], [0.76, 0.62, 0.9],
  ];
  const positions = [0, 0, 0, ...nodes.flat()];
  const colors = [0.82, 0.88, 1, 1, ...palette.flatMap((color, index) => [...color, alpha[index]])];
  const sizes = [24, ...nodes.map(() => 8)];
  return createGeometry(gl, positions, colors, sizes);
}

export function SpatialWebGLScene(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", { alpha: true, antialias: true, powerPreference: "low-power" });
    if (!gl) return;

    const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertex || !fragment) {
      if (vertex) gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
      return;
    }
    const program = gl.createProgram();
    if (!program) {
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return;
    }
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return;
    }
    gl.useProgram(program);

    const stars = starGeometry(gl);
    const topology = topologyGeometry(gl, props);
    const nodes = nodeGeometry(gl, props);
    if (!stars || !topology || !nodes) {
      for (const geometry of [stars, topology, nodes]) {
        if (!geometry) continue;
        gl.deleteBuffer(geometry.position);
        gl.deleteBuffer(geometry.color);
        gl.deleteBuffer(geometry.size);
      }
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      return;
    }

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let start = 0;
    let disposed = false;
    const geometries = [stars, topology, nodes];

    const resize = () => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
        gl.viewport(0, 0, width, height);
      }
    };

    const render = (timestamp: number) => {
      if (disposed) return;
      resize();
      if (!start) start = timestamp;
      const time = reducedMotion ? 0 : (timestamp - start) / 1000;
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
      gl.enable(gl.DEPTH_TEST);
      gl.depthFunc(gl.LEQUAL);
      const matrix = cameraMatrix(canvas.width / Math.max(canvas.height, 1), time);
      drawGeometry(gl, program, topology, matrix, false);
      drawGeometry(gl, program, stars, matrix, true);
      drawGeometry(gl, program, nodes, matrix, true);
      frame = window.requestAnimationFrame(render);
    };

    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    window.addEventListener("resize", resize);
    frame = window.requestAnimationFrame(render);
    return () => {
      disposed = true;
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
      for (const geometry of geometries) {
        gl.deleteBuffer(geometry.position);
        gl.deleteBuffer(geometry.color);
        gl.deleteBuffer(geometry.size);
      }
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, [props.agentsConnected, props.deviceConnected, props.databaseConnected, props.providersConfigured]);

  return <canvas ref={canvasRef} className="galaxy-webgl-scene" aria-hidden="true" />;
}

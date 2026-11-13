"use client";

import { useEffect, useRef } from "react";

type Props = {
  agentsConnected: boolean;
  deviceConnected: boolean;
  databaseConnected: boolean;
  providersConfigured: boolean;
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
  const tilted = multiply(rotationX(-0.28), rotationY(time * 0.035));
  return multiply(perspective(aspect), multiply(translation, tilted));
}

function seeded(index: number): number {
  const value = Math.sin(index * 127.1 + 311.7) * 43758.5453;
  return value - Math.floor(value);
}

function makeStars(): { positions: number[]; colors: number[]; sizes: number[] } {
  const positions: number[] = [];
  const colors: number[] = [];
  const sizes: number[] = [];
  for (let index = 0; index < 180; index += 1) {
    positions.push((seeded(index * 3) - 0.5) * 7.4);
    positions.push((seeded(index * 3 + 1) - 0.5) * 5.2);
    positions.push((seeded(index * 3 + 2) - 0.5) * 3.2);
    const brightness = 0.28 + seeded(index + 800) * 0.42;
    colors.push(0.56 * brightness, 0.68 * brightness, 1 * brightness, 0.72);
    sizes.push(1 + seeded(index + 1400) * 2.1);
  }
  return { positions, colors, sizes };
}

function makeNetwork(props: Props): { positions: number[]; colors: number[] } {
  const center = [0, 0, 0];
  const nodes = [
    { position: [-1.35, 0.55, 0.22], color: [0.75, 0.58, 1, 0.72] },
    { position: [-1.38, -0.35, -0.24], color: [0.36, 0.88, 0.78, 0.8] },
    { position: [0, 1.3, 0.36], color: [0.76, 0.66, 1, 0.9] },
    { position: [1.38, 0.55, -0.3], color: [0.38, 0.78, 0.88, 0.42] },
    { position: [1.38, -0.35, 0.2], color: [0.65, 0.74, 1, 0.5] },
    { position: [0, -1.28, 0.34], color: [0.4, 0.88, 0.72, 0.82] },
    { position: [-1.3, -1.0, -0.18], color: [0.76, 0.62, 0.9, 0.35] },
  ];
  const positions: number[] = [];
  const colors: number[] = [];
  const addLine = (target: number[], color: number[]) => {
    positions.push(...center, ...target);
    colors.push(...color, ...color);
  };
  if (props.providersConfigured) addLine(nodes[0].position, [0.58, 0.48, 0.88, 0.3]);
  if (props.deviceConnected) addLine(nodes[1].position, [0.3, 0.86, 0.75, 0.78]);
  if (props.agentsConnected) addLine(nodes[2].position, [0.72, 0.58, 0.96, 0.82]);
  if (props.databaseConnected) addLine(nodes[5].position, [0.34, 0.82, 0.68, 0.72]);
  return { positions, colors };
}

function drawBuffer(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  positionBuffer: WebGLBuffer,
  colorBuffer: WebGLBuffer,
  sizeBuffer: WebGLBuffer,
  positions: number[],
  colors: number[],
  sizes: number[],
  pointMode: boolean,
  matrix: Float32Array,
  pointSize: number,
) {
  const positionLocation = gl.getAttribLocation(program, "aPosition");
  const colorLocation = gl.getAttribLocation(program, "aColor");
  const sizeLocation = gl.getAttribLocation(program, "aSize");
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(positionLocation);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(colorLocation);
  gl.vertexAttribPointer(colorLocation, 4, gl.FLOAT, false, 0, 0);
  gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sizes.length ? sizes : positions.length / 3), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(sizeLocation);
  gl.vertexAttribPointer(sizeLocation, 1, gl.FLOAT, false, 0, 0);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, "uMatrix"), false, matrix);
  gl.uniform1f(gl.getUniformLocation(program, "uPointMode"), pointMode ? 1 : 0);
  gl.drawArrays(pointMode ? gl.POINTS : gl.LINES, 0, positions.length / 3);
  void pointSize;
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
    if (!vertex || !fragment) return;
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
    gl.useProgram(program);

    const positionBuffer = gl.createBuffer();
    const colorBuffer = gl.createBuffer();
    const sizeBuffer = gl.createBuffer();
    if (!positionBuffer || !colorBuffer || !sizeBuffer) return;

    const stars = makeStars();
    const network = makeNetwork(props);
    const nodePositions = [
      [-1.35, 0.55, 0.22], [-1.38, -0.35, -0.24], [0, 1.3, 0.36],
      [1.38, 0.55, -0.3], [1.38, -0.35, 0.2], [0, -1.28, 0.34], [-1.3, -1.0, -0.18],
    ];
    const nodeColors = [
      [0.75, 0.58, 1, 0.78], [0.36, 0.88, 0.78, 0.86], [0.76, 0.66, 1, props.agentsConnected ? 1 : 0.3],
      [0.38, 0.78, 0.88, 0.28], [0.65, 0.74, 1, 0.35], [0.4, 0.88, 0.72, props.databaseConnected ? 0.9 : 0.28],
      [0.76, 0.62, 0.9, 0.24],
    ];
    const pointPositions = [0, 0, 0, ...nodePositions.flat()];
    const pointColors = [0.82, 0.88, 1, 1, ...nodeColors.flat()];
    const pointSizes = [26, ...nodePositions.map(() => 8)];
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    let start = 0;
    let disposed = false;

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
      gl.disable(gl.DEPTH_TEST);
      const matrix = cameraMatrix(canvas.width / Math.max(canvas.height, 1), time);
      drawBuffer(gl, program, positionBuffer, colorBuffer, sizeBuffer, network.positions, network.colors, [], false, matrix, 1);
      drawBuffer(gl, program, positionBuffer, colorBuffer, sizeBuffer, stars.positions, stars.colors, stars.sizes, true, matrix, 1);
      drawBuffer(gl, program, positionBuffer, colorBuffer, sizeBuffer, pointPositions, pointColors, pointSizes, true, matrix, 1);
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
      gl.deleteBuffer(positionBuffer);
      gl.deleteBuffer(colorBuffer);
      gl.deleteBuffer(sizeBuffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    };
  }, [props.agentsConnected, props.deviceConnected, props.databaseConnected, props.providersConfigured]);

  return <canvas ref={canvasRef} className="galaxy-webgl-scene" aria-hidden="true" />;
}

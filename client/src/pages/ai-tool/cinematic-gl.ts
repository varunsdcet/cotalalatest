/** GPU photo compositor — parallax depth + filmic grade (AutoReel-style stills). */

type Cam = { zoom: number; panX: number; panY: number };

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTex;
uniform vec2 uCanvas;
uniform vec2 uImage;
uniform float uZoom;
uniform vec2 uPan;
uniform float uGrade;
uniform float uTime;

vec2 coverUv(vec2 uv, float zoom, vec2 pan) {
  float canvasA = uCanvas.x / max(uCanvas.y, 1.0);
  float imageA = uImage.x / max(uImage.y, 1.0);
  vec2 scale = vec2(1.0);
  if (imageA > canvasA) scale.x = canvasA / imageA;
  else scale.y = imageA / canvasA;
  vec2 p = (uv - 0.5) * scale / max(zoom, 0.01) + 0.5;
  p += pan * 0.01;
  p.y = 1.0 - p.y;
  return p;
}

vec3 sampleCover(vec2 uv, float zoom, vec2 pan) {
  vec2 p = coverUv(uv, zoom, pan);
  /* Soft edge clamp — avoid hard UV wrap artifacts */
  if (p.x < -0.02 || p.x > 1.02 || p.y < -0.02 || p.y > 1.02) return vec3(0.04);
  return texture(uTex, clamp(p, 0.0, 1.0)).rgb;
}

/* Lightweight 5-tap blur for depth layer */
vec3 blurCover(vec2 uv, float zoom, vec2 pan) {
  vec2 px = vec2(1.8 / uCanvas.x, 1.8 / uCanvas.y);
  vec3 c = sampleCover(uv, zoom, pan) * 0.36;
  c += sampleCover(uv + vec2(px.x, 0.0), zoom, pan) * 0.16;
  c += sampleCover(uv - vec2(px.x, 0.0), zoom, pan) * 0.16;
  c += sampleCover(uv + vec2(0.0, px.y), zoom, pan) * 0.16;
  c += sampleCover(uv - vec2(0.0, px.y), zoom, pan) * 0.16;
  return c;
}

void main() {
  vec3 bg = blurCover(vUv, uZoom * 1.08, uPan * 0.4);
  vec3 fg = sampleCover(vUv, uZoom, uPan);
  float edge = smoothstep(0.82, 0.22, distance(vUv, vec2(0.5, 0.46)));
  vec3 col = mix(bg, fg, 0.94 + edge * 0.06);

  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = mix(vec3(luma), col, 1.02);
  col = (col - 0.5) * 1.04 + 0.52;
  col.r += 0.01 * luma * uGrade;
  col = max(col, vec3(0.0));
  col += (col - vec3(luma)) * 0.06;
  col *= 1.04;

  float d = distance(vUv, vec2(0.5, 0.42));
  float vig = smoothstep(0.62, 1.15, d);
  col *= 1.0 - vig * 0.08 * uGrade;

  float grain = fract(sin(dot(vUv * uCanvas + uTime * 17.0, vec2(12.9898, 78.233))) * 43758.5453);
  col += (grain - 0.5) * 0.006 * uGrade;

  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

type GLState = {
  gl: WebGL2RenderingContext;
  canvas: HTMLCanvasElement;
  prog: WebGLProgram;
  vao: WebGLVertexArrayObject;
  loc: Record<string, WebGLUniformLocation | null>;
  textures: WeakMap<HTMLImageElement, WebGLTexture>;
};

let state: GLState | null = null;
let failed = false;

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const sh = gl.createShader(type)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(sh) || "shader");
  }
  return sh;
}

function init(): GLState | null {
  if (failed) return null;
  if (state) return state;
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2", {
      alpha: false,
      antialias: false,
      premultipliedAlpha: false,
      preserveDrawingBuffer: true,
    });
    if (!gl) throw new Error("no webgl2");
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("link");
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const locPos = gl.getAttribLocation(prog, "aPos");
    gl.enableVertexAttribArray(locPos);
    gl.vertexAttribPointer(locPos, 2, gl.FLOAT, false, 0, 0);
    state = {
      gl,
      canvas,
      prog,
      vao,
      loc: {
        uTex: gl.getUniformLocation(prog, "uTex"),
        uCanvas: gl.getUniformLocation(prog, "uCanvas"),
        uImage: gl.getUniformLocation(prog, "uImage"),
        uZoom: gl.getUniformLocation(prog, "uZoom"),
        uPan: gl.getUniformLocation(prog, "uPan"),
        uGrade: gl.getUniformLocation(prog, "uGrade"),
        uTime: gl.getUniformLocation(prog, "uTime"),
      },
      textures: new WeakMap(),
    };
    return state;
  } catch {
    failed = true;
    return null;
  }
}

function texFor(s: GLState, img: HTMLImageElement): WebGLTexture | null {
  const hit = s.textures.get(img);
  if (hit) return hit;
  const gl = s.gl;
  const tex = gl.createTexture();
  if (!tex) return null;
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  s.textures.set(img, tex);
  return tex;
}

export function drawGradedStill(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  w: number,
  h: number,
  cam: Cam,
  grade = 1,
  time = 0,
): boolean {
  const s = init();
  if (!s) return false;
  const tex = texFor(s, img);
  if (!tex) return false;
  if (s.canvas.width !== w || s.canvas.height !== h) {
    s.canvas.width = w;
    s.canvas.height = h;
  }
  const gl = s.gl;
  gl.viewport(0, 0, w, h);
  gl.useProgram(s.prog);
  gl.bindVertexArray(s.vao);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(s.loc.uTex, 0);
  gl.uniform2f(s.loc.uCanvas, w, h);
  gl.uniform2f(s.loc.uImage, img.naturalWidth || img.width, img.naturalHeight || img.height);
  gl.uniform1f(s.loc.uZoom, cam.zoom);
  gl.uniform2f(s.loc.uPan, cam.panX, cam.panY);
  gl.uniform1f(s.loc.uGrade, grade);
  gl.uniform1f(s.loc.uTime, time);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  ctx.drawImage(s.canvas, 0, 0, w, h);
  return true;
}

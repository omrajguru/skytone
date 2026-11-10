import { type Plate, PLATE_H, PLATE_W, createPlate } from './plate.ts';

export interface Look {
  /** Speed of the slow ambient drift. 0 holds the sky still. */
  motion: number;
  /** Extra softness, in plate cells. */
  softness: number;
  /** Film grain, 0..1. */
  grain: number;
  /** Watercolour, 0..1: flowing wet-in-wet edges, pigment pooling and paper. 0 is a pure colour field. */
  watercolor: number;
}

export const DEFAULT_LOOK: Look = { motion: 0.5, softness: 0.3, grain: 0.06, watercolor: 0 };

export interface RendererOptions {
  /** Resolution relative to CSS pixels × devicePixelRatio. The sky is soft, so 0.5 looks identical. */
  renderScale?: number;
  /** Fixed drawing-buffer size (exports). Disables automatic resizing. */
  size?: { width: number; height: number };
  look?: Partial<Look>;
  /** Keep the drawing buffer so frames can be read back (exports). */
  preserveDrawingBuffer?: boolean;
}

/**
 * Watercolour constants, fitted to a reference by measuring colour, texture, edges and
 * direction against it. Every effect scales with the look's `watercolor` setting.
 */
const WATERCOLOR = {
  /** Distance (plate cells) the colour is carried along the current: stirred-ink filaments. */
  advect: 3.46,
  /** Below 1 stretches the current vertically, like curtains and drips. */
  aniso: 0.625,
  /** Scales of the broad and fine currents, cycles per frame height. */
  freq: 2.2,
  freq2: 5.2,
  /** Share of the fine current. */
  mix: 0.08,
  /** Gentle bend of wash edges, in plate cells. */
  bend: 0.6,
  /** Smoky variation on the paint. */
  smoke: 0.07,
};
const f = (n: number) => n.toFixed(5);

const FRAG = `#version 300 es
precision highp float;
uniform sampler2D uPlate;
uniform vec2 uRes, uPlateSize;
uniform float uTime, uDrift, uSoft, uGrain, uFlash, uWash;
out vec4 o;

float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vnoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*f*(f*(f*6.0-15.0)+10.0);
  return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y); }
float soft2(vec2 p){ return 0.65 * vnoise(p) + 0.35 * vnoise(p * 2.03 + 7.1); }

vec3 bspline(vec2 uv){
  vec2 st = uv * uPlateSize - 0.5, i = floor(st), f = fract(st);
  vec2 f2 = f*f, f3 = f2*f;
  vec2 w0 = (1.0 - 3.0*f + 3.0*f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0*f2 + 3.0*f3) / 6.0;
  vec2 w2 = (1.0 + 3.0*f + 3.0*f2 - 3.0*f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (w1 / g0 - 1.0 + i + 0.5) / uPlateSize, h1 = (w3 / g1 + 1.0 + i + 0.5) / uPlateSize;
  return g0.y * (g0.x * texture(uPlate, vec2(h0.x, h0.y)).rgb + g1.x * texture(uPlate, vec2(h1.x, h0.y)).rgb)
       + g1.y * (g0.x * texture(uPlate, vec2(h0.x, h1.y)).rgb + g1.x * texture(uPlate, vec2(h1.x, h1.y)).rgb);
}

vec3 soft(vec2 uv, float r){
  if (r < 0.01) return bspline(uv);
  vec3 s = bspline(uv) * 2.0;
  for (int k = 0; k < 6; k++){ float a = float(k) * 1.0472; s += bspline(uv + r * vec2(cos(a), sin(a)) / uPlateSize); }
  return s / 8.0;
}

// Curl of a smooth field made of five sine waves at golden-angle directions. It has no grid,
// so the current it makes is smooth everywhere: carrying colour along it stretches edges into
// filaments but can never fold, tear, or draw lines.
vec2 curl(vec2 x){
  vec2 g = vec2(0.0);
  for (int k = 0; k < 5; k++){
    float a = float(k) * 2.39996 + 0.7;
    float m = 0.75 + 0.15 * float(k);
    vec2 d = vec2(cos(a), sin(a));
    g += d * cos(dot(x, d) * 3.14159 * m + float(k) * 1.7);
  }
  return vec2(g.y, -g.x) * 0.5;
}

float fbm4(vec2 p){
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++){ v += a * vnoise(p); p = mat2(1.6, -1.2, 1.2, 1.6) * p + vec2(3.1, 1.7); a *= 0.5; }
  return v / 0.9375;
}

void main(){
  vec2 uv = gl_FragCoord.xy / uRes;
  uv.y = 1.0 - uv.y;
  float va = uRes.x / uRes.y, pa = uPlateSize.x / uPlateSize.y;
  uv = 0.5 + (uv - 0.5) * (va < pa ? vec2(va / pa, 1.0) : vec2(1.0, pa / va));
  float t = uTime * 0.03;
  vec2 warp = vec2(soft2(uv * 1.3 + vec2(t, 0.0)), soft2(uv * 1.3 + vec2(4.7, 2.1) - t)) - 0.5;
  // Watercolour. The colour is carried along a slow curl-noise current, as stirred ink is:
  // edges stretch into filaments and curls. Then a faint smoky variation and paper grain.
  vec2 p = uv * vec2(pa, 1.0) * 2.6;
  vec2 q = vec2(soft2(p + vec2(t, 0.0)), soft2(p + vec2(5.2, 1.3 - t))) - 0.5;
  vec2 wuv = uv + warp * uDrift + q * (uWash * ${f(WATERCOLOR.bend)} / uPlateSize.y);
  float h = (${f(WATERCOLOR.advect)} * uWash / 0.85 / uPlateSize.y) / 6.0;
  for (int n = 0; n < 6; n++){
    vec2 v = curl(vec2(wuv.x * pa * ${f(WATERCOLOR.freq)}, wuv.y * ${f(WATERCOLOR.freq * WATERCOLOR.aniso)} + t)) * ${f((1 - WATERCOLOR.mix) / WATERCOLOR.freq)}
           + curl(vec2(wuv.x * pa * ${f(WATERCOLOR.freq2)} + 17.3, wuv.y * ${f(WATERCOLOR.freq2 * WATERCOLOR.aniso)} + 17.3 + t)) * ${f(WATERCOLOR.mix / WATERCOLOR.freq2)};
    wuv += v * h * 3.0;
  }
  vec3 c = soft(wuv, uSoft);
  if (uWash > 0.001) {
    vec3 wide = soft(wuv, uSoft + 1.6);
    float edge = smoothstep(0.006, 0.05, length(c - wide));
    float amt = uWash * (0.35 + 0.65 * edge);
    float smoke = fbm4(p + q * 0.8 + vec2(0.0, t * 0.5));
    c *= 1.0 + (smoke - 0.5) * ${f(WATERCOLOR.smoke)} * amt;
    c *= 1.0 + (vnoise(uv * vec2(pa, 1.0) * 380.0) - 0.5) * 0.025 * uWash;
  }
  c += uFlash * vec3(0.55, 0.56, 0.62) * (0.6 + 0.4 * (1.0 - uv.y));
  float g = hash(gl_FragCoord.xy + fract(uTime * 7.0) * 113.0) - 0.5;
  c += g * (1.0 / 255.0 + uGrain * 0.07);
  o = vec4(c, 1.0);
}`;

const VERT = `#version 300 es
in vec2 p; void main(){ gl_Position = vec4(p, 0.0, 1.0); }`;

const UNIFORMS = ['uPlate', 'uRes', 'uPlateSize', 'uTime', 'uDrift', 'uSoft', 'uGrain', 'uFlash', 'uWash'] as const;

export class SkyRenderer {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private gl!: WebGL2RenderingContext;
  private u = {} as Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>;
  private tex!: WebGLTexture;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private shown = createPlate();
  private target = createPlate();
  private rgba = new Float32Array(PLATE_W * PLATE_H * 4);
  private hasPlate = false;
  private morph = 0;
  private storm = 0;
  private look: Look;
  private opts: RendererOptions;
  private raf = 0;
  private last = 0;
  private clock = 0;
  private visible = true;
  private running = false;
  private observers: (ResizeObserver | IntersectionObserver)[] = [];
  private lost = false;
  private onVisibility = () => this.wake();

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, opts: RendererOptions = {}) {
    this.canvas = canvas;
    this.opts = opts;
    this.look = { ...DEFAULT_LOOK, ...opts.look };
    this.init();
    if (opts.size) this.setSize(opts.size.width, opts.size.height);
    else if (typeof HTMLCanvasElement !== 'undefined' && canvas instanceof HTMLCanvasElement) this.observe(canvas);
  }

  private init() {
    const gl = this.canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
      preserveDrawingBuffer: this.opts.preserveDrawingBuffer ?? false,
      powerPreference: 'low-power',
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 is not available');
    this.gl = gl;
    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      return s;
    };
    const prog = gl.createProgram()!;
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    gl.useProgram(prog);
    this.program = prog;
    this.buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    for (const n of UNIFORMS) this.u[n] = gl.getUniformLocation(prog, n);
    this.tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(this.u.uPlate, 0);
    gl.uniform2f(this.u.uPlateSize, PLATE_W, PLATE_H);
    if ('addEventListener' in this.canvas) {
      (this.canvas as HTMLCanvasElement).addEventListener('webglcontextlost', this.onLost, false);
      (this.canvas as HTMLCanvasElement).addEventListener('webglcontextrestored', this.onRestored, false);
    }
  }

  private onLost = (e: Event) => { e.preventDefault(); this.lost = true; };
  private onRestored = () => { this.lost = false; this.init(); this.upload(); this.wake(); };

  private observe(canvas: HTMLCanvasElement) {
    const ro = new ResizeObserver(() => this.fit());
    ro.observe(canvas);
    const io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; this.wake(); });
    io.observe(canvas);
    this.observers.push(ro, io);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.fit();
  }

  private fit() {
    const c = this.canvas as HTMLCanvasElement;
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const k = dpr * (this.opts.renderScale ?? 0.5);
    this.setSize(Math.max(2, Math.round(c.clientWidth * k)), Math.max(2, Math.round(c.clientHeight * k)));
    if (!this.running) this.draw();
  }

  setSize(width: number, height: number) {
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
  }

  setLook(look: Partial<Look>) {
    this.look = { ...this.look, ...look };
    if (!this.running) this.draw();
  }

  /** Show a plate. Changes ease in; large jumps soften briefly, the way the sky morphs. */
  setPlate(plate: Plate, opts: { instant?: boolean; storm?: number } = {}) {
    this.storm = opts.storm ?? 0;
    if (opts.instant || !this.hasPlate) {
      this.shown.set(plate);
      this.target.set(plate);
      this.hasPlate = true;
      this.upload();
      if (!this.running) this.draw();
      return;
    }
    let delta = 0;
    for (let k = 0; k < plate.length; k += 3) delta += Math.abs(plate[k] - this.target[k]) + Math.abs(plate[k + 1] - this.target[k + 1]);
    delta /= plate.length / 1.5;
    this.morph = Math.max(this.morph, Math.min(1, delta / 30));
    this.target.set(plate);
    this.wake();
  }

  private upload() {
    const { gl, shown, rgba } = this;
    for (let i = 0, j = 0; i < shown.length; i += 3, j += 4) {
      rgba[j] = shown[i] / 255; rgba[j + 1] = shown[i + 1] / 255; rgba[j + 2] = shown[i + 2] / 255; rgba[j + 3] = 1;
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, PLATE_W, PLATE_H, 0, gl.RGBA, gl.FLOAT, rgba);
  }

  private step(dt: number) {
    let moving = false;
    const k = 1 - Math.exp(-dt * 5);
    for (let i = 0; i < this.shown.length; i++) {
      const d = this.target[i] - this.shown[i];
      if (Math.abs(d) > 0.05) { this.shown[i] += d * k; moving = true; } else this.shown[i] = this.target[i];
    }
    this.morph *= Math.exp(-dt * 2.4);
    if (moving) this.upload();
    return moving || this.morph > 0.01;
  }

  private flash(t: number) {
    if (this.storm <= 0) return 0;
    const period = 4.7;
    const n = Math.floor(t / period);
    const r = Math.abs(Math.sin(n * 91.7 + 13.1) * 43758.5453) % 1;
    if (r > this.storm * 0.55) return 0;
    const p = t - n * period - r * 2;
    return p < 0 ? 0 : Math.exp(-p * 9) * 0.35 * this.storm + (p > 0.12 ? Math.exp(-(p - 0.12) * 14) * 0.2 * this.storm : 0);
  }

  /** Draw one frame at an explicit time (seconds). Used for exports. */
  renderFrame(timeSec: number) {
    this.clock = timeSec;
    this.draw();
  }

  private draw() {
    if (this.lost || !this.hasPlate) return;
    const { gl, u, look } = this;
    gl.uniform2f(u.uRes, this.canvas.width, this.canvas.height);
    gl.uniform1f(u.uTime, this.clock);
    gl.uniform1f(u.uDrift, 0.006 + 0.014 * Math.min(1, look.motion * 1.4));
    gl.uniform1f(u.uSoft, look.softness + 1.4 * this.morph);
    gl.uniform1f(u.uGrain, look.grain);
    gl.uniform1f(u.uWash, look.watercolor ?? DEFAULT_LOOK.watercolor);
    gl.uniform1f(u.uFlash, this.flash(this.clock));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Advance easing toward the target instantly (exports, tests). */
  settle() {
    this.shown.set(this.target);
    this.morph = 0;
    this.upload();
  }

  start() {
    this.running = true;
    this.wake();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  private wake() {
    if (this.raf || typeof requestAnimationFrame === 'undefined') return;
    if (typeof document !== 'undefined' && document.hidden) return;
    if (!this.visible) return;
    this.last = performance.now();
    const tick = (now: number) => {
      this.raf = 0;
      const dt = Math.min(0.1, (now - this.last) / 1000);
      this.last = now;
      const easing = this.step(dt);
      if (this.running) this.clock += dt * (0.25 + this.look.motion * 1.5);
      this.draw();
      const animating = this.running && (this.look.motion > 0 || this.storm > 0);
      if ((animating || easing) && this.visible && !(typeof document !== 'undefined' && document.hidden)) {
        this.raf = requestAnimationFrame(tick);
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  /**
   * Stop and free GPU resources. The canvas keeps its context so a new renderer can reuse it
   * (React remounts do exactly that). Pass `releaseContext` for throwaway canvases, such as exports.
   */
  destroy(opts: { releaseContext?: boolean } = {}) {
    this.stop();
    for (const o of this.observers) o.disconnect();
    this.observers = [];
    if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', this.onVisibility);
    if ('removeEventListener' in this.canvas) {
      (this.canvas as HTMLCanvasElement).removeEventListener('webglcontextlost', this.onLost);
      (this.canvas as HTMLCanvasElement).removeEventListener('webglcontextrestored', this.onRestored);
    }
    const { gl } = this;
    if (!gl.isContextLost()) {
      gl.deleteTexture(this.tex);
      if (this.program) gl.deleteProgram(this.program);
      if (this.buffer) gl.deleteBuffer(this.buffer);
    }
    if (opts.releaseContext) gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}

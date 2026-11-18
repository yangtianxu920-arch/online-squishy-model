// 适配层：游戏代码是照着浏览器写的（document / window / 指针事件 / AudioContext……），
// 这里用微信小程序的接口把这些东西补出来，游戏代码本身不用改。打包时由 esbuild 的 inject 把这些名字换成这里的实现。
import { DataTexture, RGBAFormat, UnsignedByteType, LinearFilter, LinearMipmapLinearFilter } from 'three';
import SOUND_META from './sounds-meta.js';

let node = null;                       // 真正的 WebGL 画布
const cvL = {}, winL = {}, docL = {};  // 画布 / window / document 上注册的事件回调
const target = store => ({
  addEventListener(t, f) { (store[t] ||= []).push(f); },
  removeEventListener(t, f) { const a = store[t]; if (a) { const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); } },
});
const fire = (store, t, e) => { for (const f of (store[t] || []).slice()) f(e); };

export let innerWidth = 375, innerHeight = 667, devicePixelRatio = 2;
export const performance = { now: () => Date.now() - T0 };
const T0 = Date.now();
const G = typeof GameGlobal !== 'undefined' ? GameGlobal : globalThis;
let afterFrame = null;
export const setAfterFrame = f => { afterFrame = f; };
// 卡的时候自动把画面的清晰度降一档（3 倍 → 2.5 倍 → 2 倍）：连续一段时间平均每帧超过 21 毫秒就降，降了不再升回去
let fSum = 0, fN = 0, fLast = 0, fCool = 0;
function adapt(now) {
  const r = window.__r && window.__r.renderer; if (!r) return;
  const d = now - fLast; fLast = now; if (d > 0 && d < 200) { fSum += d; fN++; }
  if (fN < 45) return;
  const avg = fSum / fN; fSum = fN = 0; diag.ms1 = Math.round(avg);
  if (fCool > 0) { fCool--; return; }
  const pr = r.getPixelRatio();
  if (avg > 21 && pr > 2) { r.setPixelRatio(Math.max(2, pr - 0.5)); diag.pr = r.getPixelRatio(); fCool = 2; }
}
export const requestAnimationFrame = f => G.requestAnimationFrame(() => { const t = performance.now(); f(t); if (afterFrame) afterFrame(); adapt(t); });
export const cancelAnimationFrame = id => G.cancelAnimationFrame(id);
export const matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
export const navigator = { userAgent: 'wx-miniprogram', vibrate() { try { wx.vibrateShort({ type: 'light' }); } catch (e) {} } };

const canvasEl = {
  style: {},
  get width() { return node.width; }, set width(v) { node.width = v; },
  get height() { return node.height; }, set height(v) { node.height = v; },
  get clientWidth() { return innerWidth; }, get clientHeight() { return innerHeight; },
  getContext: (t, a) => { const gl = node.getContext(t, a); if (gl && !diag.done) { diag.done = true; try { probe(gl); } catch (e) { diag.err = String(e && e.message || e); } } return gl; },
  getBoundingClientRect: () => ({ left: 0, top: 0, x: 0, y: 0, width: innerWidth, height: innerHeight, right: innerWidth, bottom: innerHeight }),
  setPointerCapture() {}, releasePointerCapture() {}, hasPointerCapture: () => false, focus() {},
  getRootNode: () => document,
  ...target(cvL),
};

// 有的手机上微信的 WebGL 不能往“半浮点”的缓冲里画（环境光贴图、半透明蜡壳都靠它），画出来是黑的：整个画面发暗、蜡壳不透。
// 一拿到 WebGL 就先试一下；不行就改用普通 8 位缓冲（three.js 里对应的两处在打包时改成看这里的开关）。
export const diag = {};
export const __ldr = () => !!diag.ldr, __ldrT = () => !!diag.ldrT, __noms = () => !!diag.noms;
function probe(gl) {
  const fbo = attach => { const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); attach(); const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE; gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(f); return ok; };
  diag.ver = String(gl.getParameter(gl.VERSION)).replace('WebGL ', '').slice(0, 22);
  diag.cbf = !!gl.getExtension('EXT_color_buffer_float'); diag.cbh = !!gl.getExtension('EXT_color_buffer_half_float');
  diag.ms = fbo(() => { const r = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, r); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.RGBA8, 4, 4); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, r); gl.bindRenderbuffer(gl.RENDERBUFFER, null); });
  // 真的画一遍：往半浮点贴图里涂一个颜色，再用线性过滤把它采样到普通贴图上读回来。读到的颜色对，才算这台手机能用
  diag.hf = false; diag.hfms = false;
  try {
    const mk = (internal, type, n, minf) => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, internal, n, n, 0, gl.RGBA, type, null);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, minf || gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); return [t, f]; };
    const good = px => px[0] > 100 && px[0] < 156 && px[1] > 40 && px[1] < 90 && px[2] > 200;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, '#version 300 es\nin vec2 p; void main(){ gl_Position = vec4(p, 0., 1.); }'));
    gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, '#version 300 es\nprecision mediump float; uniform sampler2D t; out vec4 o; void main(){ o = texture(t, vec2(.5)); }'));
    gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const [tb, fb] = mk(gl.RGBA8, gl.UNSIGNED_BYTE, 2);
    const sample = tex => {             // 把 tex 采样到一张普通贴图上，读回一个像素
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.viewport(0, 0, 2, 2); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(pr); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(gl.getUniformLocation(pr, 't'), 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const px = new Uint8Array(4); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); return px; };
    // 一：往半浮点贴图里涂色，再线性采样读回来
    const [ta, fa] = mk(gl.RGBA16F, gl.HALF_FLOAT, 2);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
      gl.viewport(0, 0, 2, 2); gl.clearColor(0.5, 0.25, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT);
      const px = sample(ta); diag.px = px[0] + ',' + px[1] + ',' + px[2]; diag.hf = good(px);
    }
    // 二：半透明蜡壳用的那一套——带抗锯齿的半浮点缓冲 → 拷到半浮点贴图 → 生成多级缩小图 → 采样读回来
    if (diag.hf) {
      const rb = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, rb); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, 4, gl.RGBA16F, 4, 4);
      const fm = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fm); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, rb);
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
        gl.viewport(0, 0, 4, 4); gl.clearColor(0.5, 0.25, 1, 1); gl.clear(gl.COLOR_BUFFER_BIT);
        const [tc, fc] = mk(gl.RGBA16F, gl.HALF_FLOAT, 4, gl.LINEAR_MIPMAP_LINEAR);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fm); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fc); gl.blitFramebuffer(0, 0, 4, 4, 0, 0, 4, 4, gl.COLOR_BUFFER_BIT, gl.NEAREST);
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
        gl.bindTexture(gl.TEXTURE_2D, tc); gl.generateMipmap(gl.TEXTURE_2D);
        const px = sample(tc); diag.px2 = px[0] + ',' + px[1] + ',' + px[2]; diag.hfms = good(px) && gl.getError() === gl.NO_ERROR;
        gl.deleteTexture(tc); gl.deleteFramebuffer(fc);
      }
      gl.bindRenderbuffer(gl.RENDERBUFFER, null); gl.deleteRenderbuffer(rb); gl.deleteFramebuffer(fm);
    }
    gl.disableVertexAttribArray(0); gl.bindBuffer(gl.ARRAY_BUFFER, null); gl.useProgram(null); gl.deleteProgram(pr); gl.deleteBuffer(vb);
    gl.bindTexture(gl.TEXTURE_2D, null); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteTexture(ta); gl.deleteFramebuffer(fa); gl.deleteTexture(tb); gl.deleteFramebuffer(fb); gl.clearColor(0, 0, 0, 0);
    while (gl.getError() !== gl.NO_ERROR) {}
  } catch (e) { diag.err = String(e && e.message || e).slice(0, 40); }
  diag.ldr = diag.force === 'on' ? true : diag.force === 'off' || diag.force === 'hemi' ? false : !diag.hf; diag.noms = !diag.ms;
  diag.ldrT = diag.force === 'on' ? true : diag.force === 'hdrt' ? false : !diag.hfms;      // 半透明蜡壳的缓冲：能用半浮点就用（8 位的会在蜡片接缝处露出一道道纹）
}
// 环境光（整间“摄影棚”烘焙成的一张贴图，泥和蜡壳身上柔和的亮度、反光都靠它）。有的手机上按正常办法烘出来是黑的，
// 而且事先试不出来，所以每种办法烘完都真的看一眼：黑的就换下一种——半浮点 → 普通 8 位 → 实在不行就一盏普通的环境灯。
export function __bakeEnv(renderer, scene, THREE, Room) {
  const bake = k => {
    const room = new Room();
    if (k > 1) room.traverse(o => { if (o.isLight) o.intensity /= k; else if (o.material && o.material.isMeshBasicMaterial) o.material.color.multiplyScalar(1 / k); });      // 8 位存不下那么亮的灯：整体调暗 k 倍再烘，用的时候乘回来
    return new THREE.PMREMGenerator(renderer).fromScene(room, 0.04);
  };
  const peek = rt => {                // 把烘好的贴图画到一张 16×16 的普通贴图上读回来，看最亮的地方有多亮（0 = 全黑）
    const t = new THREE.WebGLRenderTarget(16, 16), sc = new THREE.Scene(), cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.MeshBasicMaterial({ map: rt.texture, toneMapped: false })); sc.add(m);
    const old = renderer.getRenderTarget(); renderer.setRenderTarget(t); renderer.render(sc, cam); renderer.setRenderTarget(old);
    const px = new Uint8Array(16 * 16 * 4); renderer.readRenderTargetPixels(t, 0, 0, 16, 16, px);
    let mx = 0; for (let i = 0; i < px.length; i += 4) mx = Math.max(mx, px[i], px[i+1], px[i+2]);
    t.dispose(); m.geometry.dispose(); m.material.dispose(); return mx;
  };
  const hemi = () => { scene.environment = null; scene.add(new THREE.HemisphereLight(0xffffff, 0xeadff2, 2.0)); };
  if (diag.force === 'hemi') { hemi(); diag.env = 'hemi'; return; }
  // 首选：在电脑上提前烘好、放在包里的那一张（env.bin：384×512，每个像素 rgb 是尾数、a 是指数 + 128）。
  // 微信里现场烘焙在有的手机上出来是黑的；用现成的既稳妥，启动也更快。这种情况下半透明蜡壳一律用普通 8 位缓冲来画。
  if (diag.force !== 'on' && diag.force !== 'off') try {
    const b = new Uint8Array(wx.getFileSystemManager().readFileSync('env.bin')), W = 384, H = 512;
    if (b.length !== W * H * 4) throw new Error('env.bin ' + b.length);
    const px = new Uint16Array(W * H * 4), h = THREE.DataUtils.toHalfFloat, one = h(1), P = []; for (let e = 0; e < 256; e++) P[e] = Math.pow(2, e - 128) / 255;
    for (let i = 0; i < b.length; i += 4) { const k = P[b[i+3]]; px[i] = h(b[i] * k); px[i+1] = h(b[i+1] * k); px[i+2] = h(b[i+2] * k); px[i+3] = one; }
    const t = new THREE.DataTexture(px, W, H, THREE.RGBAFormat, THREE.HalfFloatType);
    t.mapping = THREE.CubeUVReflectionMapping; t.magFilter = t.minFilter = THREE.LinearFilter; t.generateMipmaps = false; t.colorSpace = THREE.LinearSRGBColorSpace; t.needsUpdate = true;
    scene.environment = t; scene.environmentIntensity = 0.85; diag.env = 'pre';
    return;
  } catch (e) { diag.pre = String(e && e.message || e).slice(0, 30); }
  let rt = null, k = 1, mx = -1, mode = 'H';
  try {
    if (!diag.ldr) { rt = bake(1); mx = peek(rt); }
    if (diag.ldr || (mx === 0 && diag.force !== 'off')) { diag.ldr = true; diag.ldrT = true; k = 12; mode = (mx === 0 ? 'H0>' : '') + 'L'; rt = bake(12); mx = peek(rt); }
  } catch (e) { diag.err = 'env:' + String(e && e.message || e).slice(0, 40); mx = 0; }
  diag.env = mode + mx;
  if (mx === 0 && diag.force !== 'off') { hemi(); diag.env += '>hemi'; return; }
  scene.environment = rt.texture; scene.environmentIntensity = 0.85 * k;
}
// 手机上看不到控制台：把最早的几条报错记下来，和诊断信息一起显示
try { for (const lv of ['error', 'warn']) { const o = console[lv]; console[lv] = function (...a) { try { (diag.log ||= []).length < 3 && diag.log.push(a.map(x => String(x && x.message || x)).join(' ').replace(/\s+/g, ' ').slice(0, 110)); } catch (e) {} return o.apply(console, a); }; } } catch (e) {}

// 页面上的按钮在小程序里是 WXML 画的，这里只留一个“替身”接住游戏代码挂上来的 onclick；小程序页面点按钮时再来调它
const els = {};
const classList = () => ({ add() {}, remove() {}, toggle() {}, contains: () => false });
function stub(id, dataset) {
  return els[id] ||= { id, style: {}, dataset: dataset || {}, classList: classList(), textContent: '', onclick: null,
    addEventListener() {}, removeEventListener() {}, querySelector: () => stub('_none') };
}
const groups = { tools: ['poke', 'pinch', 'palm'].map(t => stub('tool-' + t, { tool: t })), feel: ['bouncy', 'slow', 'water'].map(f => stub('feel-' + f, { feel: f })), cards: [] };
function mk2d() {
  const c = wx.createCanvas(), get = c.getContext.bind(c);
  c.getContext = t => {
    const g = get(t);
    if (g && !g.roundRect) g.roundRect = function (x, y, w, h, r) {       // 旧版本没有圆角矩形，自己画
      this.moveTo(x + r, y); this.arcTo(x + w, y, x + w, y + h, r); this.arcTo(x + w, y + h, x, y + h, r); this.arcTo(x, y + h, x, y, r); this.arcTo(x, y, x + w, y, r); this.closePath();
    };
    return g;
  };
  return c;
}
export const document = {
  hidden: false, body: stub('body'),
  getElementById: id => id === 'stage' ? canvasEl : stub(id),
  querySelector: () => null,
  querySelectorAll: s => s === '#tools button' ? groups.tools : s === '#feel button' ? groups.feel : s === '.card[data-toy]' ? groups.cards : [],
  createElement: () => mk2d(), createElementNS: () => mk2d(),
  ...target(docL),
};
canvasEl.ownerDocument = document;
export const window = { ...target(winL),
  NIE_SOUNDS: { meta: SOUND_META, load: n => new Promise((res, rej) => {      // 录音放在小游戏包里的 sounds/ 文件夹
    try { wx.getFileSystemManager().readFile({ filePath: 'sounds/' + n + '.mp3', success: r => res(r.data), fail: rej }); } catch (e) { rej(e); }
  }) },
};
export const addEventListener = window.addEventListener, removeEventListener = window.removeEventListener;
// 首页的缩略图是提前渲染好、放在小程序包里的图片：告诉游戏“都已经有了”，它就不会再自己渲染一遍
export const localStorage = {
  length: 0, key: () => null, setItem() {}, removeItem() {},
  getItem: k => k.startsWith('nie-thumbs-') ? JSON.stringify(Object.fromEntries(groups.cards.map(c => [c.dataset.toy, 'x']))) : null,
};

// 画在 2D 画布上的贴图：小程序里把像素取出来再交给显卡（直接把画布当贴图，不同手机上不一定行）
export function __tex(cv) {
  const w = cv.width, h = cv.height, d = cv.getContext('2d').getImageData(0, 0, w, h).data;
  const t = new DataTexture(new Uint8Array(d.buffer, d.byteOffset, d.byteLength), w, h, RGBAFormat, UnsignedByteType);
  t.flipY = true; t.generateMipmaps = true; t.minFilter = LinearMipmapLinearFilter; t.magFilter = LinearFilter; t.unpackAlignment = 4; t.needsUpdate = true;
  return t;
}

// 声音：小程序的 WebAudio。connect() 在有的版本上不返回下一个节点，游戏里是连着写的（a.connect(b).connect(c)），这里补上
export function AudioContext() {
  const c = wx.createWebAudioContext();
  const fix = n => { try { const k = n.connect; n.connect = function (d, ...a) { k.call(n, d, ...a); return d; }; } catch (e) {} return n; };
  return {
    get currentTime() { return c.currentTime; }, get sampleRate() { return c.sampleRate; }, get state() { return c.state; }, get destination() { return c.destination; },
    resume: () => { try { const p = c.resume(); if (p && p.catch) p.catch(() => {}); return p; } catch (e) {} }, close: () => c.close(),
    createBuffer: (...a) => c.createBuffer(...a), decodeAudioData: (...a) => c.decodeAudioData(...a),
    createBufferSource: () => fix(c.createBufferSource()), createBiquadFilter: () => fix(c.createBiquadFilter()),
    createGain: () => fix(c.createGain()), createOscillator: () => fix(c.createOscillator()),
  };
}

/* ── 下面是给小程序页面用的 ── */
export function setup(o) {             // o: { canvas, width, height, dpr, toys:[{toy,name}] }
  node = o.canvas; innerWidth = o.width; innerHeight = o.height; devicePixelRatio = o.dpr;
  groups.cards = o.toys.map(t => stub('card-' + t.toy, { toy: t.toy, name: t.name }));
}
export const el = id => els[id];
export const click = id => { const e = els[id]; if (e && e.onclick) e.onclick(); };
export function wake() { fire(winL, 'click', {}); }                    // 用户碰了一下屏幕：启动 / 唤醒声音
export function hidden(h) { document.hidden = h; if (h) { fire(docL, 'visibilitychange', {}); fire(winL, 'pagehide', {}); } }
export function resize(w, h) { innerWidth = w; innerHeight = h; fire(winL, 'resize', {}); }
const TYPES = { touchstart: 'pointerdown', touchmove: 'pointermove', touchend: 'pointerup', touchcancel: 'pointercancel' };
let primary = null;
export function touch(e) {             // 把小程序的触摸事件换成浏览器的指针事件
  const type = TYPES[e.type]; if (!type) return;
  for (const t of e.changedTouches || []) {
    const x = t.x ?? t.clientX ?? t.pageX, y = t.y ?? t.clientY ?? t.pageY, id = t.identifier || 0;
    if (type === 'pointerdown' && primary === null) primary = id;
    const ev = { type, pointerId: id + 1, pointerType: 'touch', isPrimary: primary === id, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' || type === 'pointercancel' ? 0 : 1,
      clientX: x, clientY: y, pageX: x, pageY: y, offsetX: x, offsetY: y, target: canvasEl, currentTarget: canvasEl, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false,
      preventDefault() {}, stopPropagation() {}, stopImmediatePropagation() {} };
    if (type === 'pointerup' || type === 'pointercancel') { if (primary === id) primary = null; }
    fire(cvL, type, ev); fire(docL, type, ev); fire(winL, type, ev);
  }
}

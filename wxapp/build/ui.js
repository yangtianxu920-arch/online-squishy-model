// 小游戏里没有网页元素：首页（捏捏列表）和玩的时候的按钮都画在一张 2D 画布上，再当成一张贴图盖在 3D 画面上。
import * as THREE from 'three';
import { el, click, wake, touch as gameTouch, hidden, diag, window as win, innerWidth as W0, innerHeight as H0 } from './shim.js';

const VERSION = '0.6.0', SHOW_DIAG = false;      // SHOW_DIAG：标题下面那两行诊断小字，排查手机上的问题时再打开
export function startUI({ title, sections, canvas2d, loadImage, dpr, menu, safeBottom = 0 }) {
  const { renderer, scene } = win.__r, W = W0, H = H0, s = Math.min(dpr, 2);
  const cv = canvas2d(); cv.width = Math.round(W * s); cv.height = Math.round(H * s);
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.flipY = false; tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = false; tex.minFilter = tex.magFilter = THREE.LinearFilter;
  const geo = new THREE.PlaneGeometry(2, 2); { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); }
  const quad = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false, toneMapped: false }));
  quad.frustumCulled = false;
  const uiScene = new THREE.Scene(); uiScene.add(quad);
  const uiCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // 玩的时候的背景：网页版是页面自己的渐变色，这里画成场景的背景
  { const b = canvas2d(); b.width = 4; b.height = 256; const c = b.getContext('2d'), gr = c.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, '#fdeef6'); gr.addColorStop(0.45, '#f7e3f2'); gr.addColorStop(1, '#e3dcff'); c.fillStyle = gr; c.fillRect(0, 0, 4, 256);
    const t = new THREE.CanvasTexture(b); t.colorSpace = THREE.SRGBColorSpace; scene.background = t; }

  const INK = '#5a3d5c', PINK = '#e0527a';
  const st = { mode: 'home', scroll: 0, vel: 0, max: 0, tool: 'poke', feel: 'bouncy', sound: true, showFeel: false, name: '', dirty: true, hits: [] };
  const imgs = {};
  for (const sec of sections) for (const t of sec.toys) loadImage('thumbs/' + t.toy + '.png', im => { imgs[t.toy] = im; st.dirty = true; });
  const navTop = menu ? menu.top : 28, navH = menu ? menu.height : 32;

  function rr(x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function glass(x, y, w, h, r, fill) { g.save(); g.shadowColor = 'rgba(150,90,150,0.16)'; g.shadowBlur = 14 * s; g.shadowOffsetY = 4 * s; rr(x, y, w, h, r); g.fillStyle = fill || 'rgba(255,255,255,0.72)'; g.fill(); g.restore(); }
  function text(t, x, y, px, color, align, bold) { g.font = (bold ? 'bold ' : '') + px + 'px sans-serif'; g.fillStyle = color; g.textAlign = align || 'center'; g.textBaseline = 'middle'; g.fillText(t, x, y); }

  function drawHome() {
    const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#fdeef6'); gr.addColorStop(0.5, '#f7e3f2'); gr.addColorStop(1, '#e3dcff');
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    st.hits = [];
    let y = navTop + navH + 30 - st.scroll;
    text(title, W / 2, y, 28, INK, 'center', true); y += SHOW_DIAG ? 30 : 34;
    if (SHOW_DIAG) { const sn = win.__nie && win.__nie.sfx.started ? win.__nie.sfx.samples.length : '-', b = v => v ? 'Y' : 'N';        // 测试期间的诊断信息（正式版去掉）；点一下切换渲染方式
      text('v' + VERSION + ' gl' + (diag.ver || '?') + ' f' + b(diag.cbf) + 'h' + b(diag.cbh) + ' hf' + b(diag.hf) + '(' + (diag.px || '-') + ') ms' + b(diag.ms), W / 2, y, 10, '#8a6f8c');
      text((diag.ldr ? 'LDR' : 'HDR') + ' T' + (diag.ldrT ? '8' : '16') + '(' + (diag.px2 || '-') + ')' + (diag.force ? '[' + diag.force + ']' : '') + ' env' + (diag.env === undefined ? '-' : diag.env) + ' snd' + sn + ' hp' + (typeof GameGlobal !== 'undefined' && GameGlobal.isIOSHighPerformanceModePlus ? '+' : typeof GameGlobal !== 'undefined' && GameGlobal.isIOSHighPerformanceMode ? 'Y' : 'N') + ' ' + (diag.ms1 || '-') + 'ms' + (diag.pr ? ' pr' + diag.pr : '') + (diag.pre ? ' pre:' + diag.pre : '') + (diag.err ? ' ' + diag.err : ''), W / 2, y + 13, 10, '#8a6f8c');
      let yy = y + 26; for (const l of diag.log || []) { text(l.slice(0, 64), W / 2, yy, 9, '#a04a4a'); yy += 11; if (l.length > 64) { text(l.slice(64), W / 2, yy, 9, '#a04a4a'); yy += 11; } }
      st.hits.push({ x: 0, y: y - 8, w: W, h: 30, diag: true }); y = yy - 4; }
    const pad = 14, gap = 12, cw = (W - pad * 2 - gap) / 2, ch = cw + 34;
    for (const sec of sections) {
      y += 26; text(sec.title, W / 2, y, 18, INK, 'center', true); y += 28;
      sec.toys.forEach((t, i) => {
        const x = pad + (i % 2) * (cw + gap), cy = y + Math.floor(i / 2) * (ch + gap);
        if (cy + ch < 0 || cy > H) return;
        glass(x, cy, cw, ch, 20);
        rr(x + 8, cy + 8, cw - 16, cw - 16, 16); g.fillStyle = 'rgba(255,255,255,0.55)'; g.fill();
        const im = imgs[t.toy]; if (im) g.drawImage(im, x + 8, cy + 8, cw - 16, cw - 16);
        text(t.name, x + cw / 2, cy + cw + 9, 13, INK, 'center', true);
        st.hits.push({ x, y: cy, w: cw, h: ch, toy: t });
      });
      y += Math.ceil(sec.toys.length / 2) * (ch + gap);
    }
    st.max = Math.max(0, y + st.scroll + 30 - H);
  }
  function drawPlay() {
    g.clearRect(0, 0, W, H); st.hits = [];
    const btn = (x, y, w, h, r, id, on) => { glass(x, y, w, h, r, on ? '#ffffff' : undefined); st.hits.push({ x, y, w, h, id }); };
    g.font = '13px sans-serif'; const bw = g.measureText('‹ 全部捏捏').width + 28;
    btn(12, navTop, bw, navH, navH / 2, 'back'); text('‹ 全部捏捏', 12 + bw / 2, navTop + navH / 2, 13, INK);
    text(st.name, 12 + bw + 10, navTop + navH / 2, 17, INK, 'left', true);
    const ry = navTop + navH + 10, sx = W - 12 - 34;
    btn(sx, ry, 34, 34, 17, 'sound'); text(st.sound ? '🔊' : '🔇', sx + 17, ry + 18, 16, INK);
    btn(sx - 8 - 72, ry, 72, 34, 17, 'reset'); text('↺ 重置', sx - 8 - 36, ry + 17, 13, INK);
    const tools = [['poke', '👆', '戳'], ['pinch', '🤏', '捏'], ['palm', '✋', '压']], tw = 68, th = 58, tx = W / 2 - (tw * 3 + 12) / 2, ty = H - th - 12 - Math.max(22, safeBottom);
    glass(tx, ty, tw * 3 + 12, th + 12, 24);
    tools.forEach((t, i) => {
      const x = tx + 6 + i * tw, on = st.tool === t[0];
      if (on) { rr(x + 2, ty + 6, tw - 4, th, 18); g.fillStyle = '#fff'; g.fill(); }
      text(t[1], x + tw / 2, ty + 26, 22, INK); text(t[2], x + tw / 2, ty + 50, 11, on ? PINK : INK);
      st.hits.push({ x, y: ty, w: tw, h: th + 12, id: 'tool-' + t[0] });
    });
    if (st.showFeel) {
      const feels = [['bouncy', 'Q弹硅胶'], ['slow', '奶油感'], ['water', '水感']], fw = 84, fx = W / 2 - fw * 1.5 - 4, fy = ty - 52;
      glass(fx, fy, fw * 3 + 8, 40, 20);
      feels.forEach((f, i) => {
        const x = fx + 4 + i * fw, on = st.feel === f[0];
        if (on) { rr(x, fy + 4, fw, 32, 16); g.fillStyle = '#fff'; g.fill(); }
        text(f[1], x + fw / 2, fy + 20, 13, on ? PINK : INK);
        st.hits.push({ x, y: fy, w: fw, h: 40, id: 'feel-' + f[0] });
      });
    }
  }
  function redraw() {
    g.setTransform(s, 0, 0, s, 0, 0);
    if (st.mode === 'home') drawHome(); else drawPlay();
    tex.needsUpdate = true; st.dirty = false;
  }
  const hit = (x, y) => st.hits.find(h => x >= h.x && x <= h.x + h.w && y >= h.y && y <= h.y + h.h);

  function enter(t) {
    wake(); click('card-' + t.toy);
    st.mode = 'play'; st.name = t.name; st.showFeel = el('feel').style.display !== 'none'; st.dirty = true;
  }
  function press(id) {
    if (id === 'back') { click('back'); st.mode = 'home'; }
    else if (id === 'sound') { click('sound'); st.sound = !st.sound; }
    else if (id.startsWith('tool-')) { click(id); st.tool = id.slice(5); }
    else if (id.startsWith('feel-')) { click(id); st.feel = id.slice(5); }
    else click(id);
    st.dirty = true;
  }

  // 触摸：首页上是滑动列表 / 点卡片；玩的时候按钮自己接住，其余的交给游戏
  let drag = null; const uiTouch = new Map();
  function onTouch(type, e) {
    for (const t of e.changedTouches || []) {
      const x = t.clientX ?? t.x, y = t.clientY ?? t.y, id = t.identifier || 0;
      if (st.mode === 'home') {
        if (type === 'touchstart') { if (!drag) { drag = { id, y, y0: y, x0: x, t: Date.now(), moved: false, ly: y, lt: Date.now() }; st.vel = 0; } }
        else if (drag && drag.id === id) {
          if (type === 'touchmove') {
            if (Math.abs(y - drag.y0) > 8) drag.moved = true;
            const now = Date.now(); st.scroll = Math.max(0, Math.min(st.max, st.scroll - (y - drag.y)));
            if (now > drag.lt) st.vel = 0.6 * st.vel + 0.4 * (drag.ly - y) / (now - drag.lt) * 16; drag.ly = y; drag.lt = now; drag.y = y; st.dirty = true;
          } else {
            const d = drag; drag = null;
            if (type === 'touchend' && !d.moved && Date.now() - d.t < 600) { st.vel = 0; const h = hit(x, y); if (h && h.diag) { const order = ['', 'on', 'hdrt', 'hemi', 'off'], nx = order[(order.indexOf(diag.force || '') + 1) % order.length]; try { wx.setStorageSync('nie-ldr', nx); } catch (err) {} diag.force = nx; st.dirty = true; try { wx.showModal({ title: '渲染方式: ' + (nx || 'auto'), content: '完全关掉小游戏再重新打开后生效', showCancel: false }); } catch (err) {} } else if (h && h.toy) { try { enter(h.toy); } catch (err) { console.error(err); wx.showModal({ title: '打开失败', content: String(err && err.message || err), showCancel: false }); } } }
            else if (Date.now() - d.lt > 80) st.vel = 0;
          }
        }
        continue;
      }
      if (type === 'touchstart') { const h = hit(x, y); if (h) { uiTouch.set(id, h); continue; } }
      else if (uiTouch.has(id)) {
        if (type !== 'touchmove') { const h = uiTouch.get(id); uiTouch.delete(id); if (type === 'touchend' && hit(x, y) === h) press(h.id); }
        continue;
      }
      gameTouch({ type, changedTouches: [t] });
    }
  }
  function afterFrame() {               // 每一帧：游戏画完（在首页时它不画）之后，把这一层盖上去
    if (st.mode === 'home' && !drag && Math.abs(st.vel) > 0.05) {
      st.scroll = Math.max(0, Math.min(st.max, st.scroll + st.vel)); st.vel *= 0.95; if (st.scroll <= 0 || st.scroll >= st.max) st.vel = 0; st.dirty = true;
    }
    if (st.dirty) redraw();
    renderer.autoClear = st.mode === 'home';
    renderer.render(uiScene, uiCam);
    renderer.autoClear = true;
  }
  return { onTouch, afterFrame, hidden, state: st };
}

// 小游戏入口：建画布 → 启动游戏 → 画首页
import { setup, setAfterFrame, diag } from './shim.js';
import { boot } from './game.js';
import { startUI } from './ui.js';
import TOYS from './toys.js';

function main() {
  const canvas = wx.createCanvas();                     // 第一次创建的是屏幕上的那张画布，之后创建的都是离屏画布
  const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
  const toys = []; for (const s of TOYS.sections) toys.push(...s.toys);
  try { diag.force = wx.getStorageSync('nie-ldr') || ''; } catch (e) {}
  setup({ canvas, width: info.windowWidth, height: info.windowHeight, dpr: info.pixelRatio, toys });
  boot();
  let menu = null; try { menu = wx.getMenuButtonBoundingClientRect(); if (!menu || !menu.height) menu = null; } catch (e) {}
  const ui = startUI({
    title: TOYS.title, sections: TOYS.sections, dpr: info.pixelRatio, menu, safeBottom: info.safeArea ? Math.max(0, info.screenHeight - info.safeArea.bottom) : 0,
    canvas2d: () => wx.createCanvas(),
    loadImage: (src, cb) => { const im = wx.createImage(); im.onload = () => cb(im); im.src = src; },
  });
  setAfterFrame(ui.afterFrame);
  wx.onTouchStart(e => ui.onTouch('touchstart', e)); wx.onTouchMove(e => ui.onTouch('touchmove', e));
  wx.onTouchEnd(e => ui.onTouch('touchend', e)); wx.onTouchCancel(e => ui.onTouch('touchcancel', e));
  wx.onHide(() => ui.hidden(true)); wx.onShow(() => ui.hidden(false));
  try { wx.showShareMenu({ menus: ['shareAppMessage'] }); wx.onShareAppMessage(() => ({ title: TOYS.title })); } catch (e) {}
  return ui;
}
let ui = null;
try { ui = main(); } catch (e) {
  console.error(e);
  try { wx.showModal({ title: '加载失败', content: String(e && e.message || e), showCancel: false }); } catch (e2) {}
}
export { ui };

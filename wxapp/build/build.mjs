// 从 ../../index.html 生成小程序用的 minigame/game.js。网页版改过之后，在这个文件夹里运行：node build.mjs
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, '../../index.html'), 'utf8');
const m = html.match(/<script type="module">([\s\S]*?)<\/script>/);
if (!m) throw new Error('index.html 里没找到游戏代码');
const lines = m[1].replace(/\r\n/g, '\n').split('\n');
const imports = lines.filter(l => /^import /.test(l)), body = lines.filter(l => !/^import /.test(l)).join('\n');
const n = (body.match(/new THREE\.CanvasTexture\(/g) || []).length;
// 环境光：不能用半浮点缓冲的手机上，8 位缓冲存不下那么亮的灯——先把房间整体调暗 12 倍再烘焙，用的时候再乘回来
const ENV_A = `scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.85;`;
const ENV_B = "__bakeEnv(renderer, scene, THREE, RoomEnvironment);";
if (!body.includes(ENV_A)) throw new Error('index.html 里设置环境光的那两行变了，build.mjs 里的 ENV_A 要跟着改');
const src = imports.join('\n') + `
export function boot() {
${body.replace(/new THREE\.CanvasTexture\(/g, '__tex(').replace(ENV_A, ENV_B)}
window.__r = { renderer, scene };
}
`;
mkdirSync(join(here, 'gen'), { recursive: true });
writeFileSync(join(here, 'gen/game.js'), src);
for (const f of ['shim.js', 'ui.js', 'main.js']) writeFileSync(join(here, 'gen', f), readFileSync(join(here, f)));

// 首页的捏捏列表也从 index.html 里读，保证两边一致
const sections = [...html.matchAll(/<section>\s*<h2>(.*?)<\/h2>([\s\S]*?)<\/section>/g)].map(s => ({
  title: s[1], toys: [...s[2].matchAll(/data-toy="(\w+)" data-name="(.*?)"/g)].map(t => ({ toy: t[1], name: t[2] })),
}));
const title = html.match(/<title>(.*?)<\/title>/)[1];
writeFileSync(join(here, 'gen/toys.js'), 'export default ' + JSON.stringify({ title, sections }, null, 1) + ';\n');

// 录音：每段里“响”的位置表打进代码，mp3 文件本身放进小游戏包
{ const w = {}; new Function('window', 'atob', readFileSync(join(here, '../../sounds.js'), 'utf8'))(w, null);
  writeFileSync(join(here, 'gen/sounds-meta.js'), 'export default ' + JSON.stringify(w.NIE_SOUNDS.meta) + ';\n');
  if (!process.argv[2]) { copyFileSync(join(here, 'env-384x512.rgbe'), join(here, '../minigame/env.bin')); mkdirSync(join(here, '../minigame/sounds'), { recursive: true }); for (const n in w.NIE_SOUNDS.meta) copyFileSync(join(here, '../../sounds', n + '.mp3'), join(here, '../minigame/sounds', n + '.mp3')); } }

const out = process.argv[2] || join(here, '../minigame/game.js');
await build({
  entryPoints: [join(here, 'gen/main.js')], outfile: out, bundle: true, format: process.argv[3] || 'cjs', globalName: process.argv[3] === 'iife' ? 'NIE' : undefined,
  minify: true, target: 'es2018', platform: 'neutral', mainFields: ['module', 'main'], legalComments: 'none',
  inject: [join(here, 'gen/shim.js')], nodePaths: [join(here, 'node_modules')],
  plugins: [{ name: 'three-ldr', setup(b) { b.onLoad({ filter: /three\.module\.js$/ }, a => {      // three.js 里两处写死用半浮点缓冲的地方，改成看适配层的开关
    let t = readFileSync(a.path, 'utf8'); const sub = (x, y) => { if (t.split(x).length !== 2) throw new Error('three.js 里没找到要改的地方: ' + x); t = t.replace(x, y); };
    sub(`type: HalfFloatType,
			format: RGBAFormat,`, `type: __ldr() ? UnsignedByteType : HalfFloatType,
			format: RGBAFormat,`);
    sub(`type: ( extensions.has( 'EXT_color_buffer_half_float' ) || extensions.has( 'EXT_color_buffer_float' ) ) ? HalfFloatType : UnsignedByteType,
					minFilter: LinearMipmapLinearFilter,
					samples: 4,`,
        `type: __ldrT() ? UnsignedByteType : HalfFloatType,
					minFilter: LinearMipmapLinearFilter,
					samples: __noms() ? 0 : 4,`);
    return { contents: t, loader: 'js' };
  }); } }],
});
console.log('ok:', out, (readFileSync(out).length / 1024 | 0) + ' KB,', n, '张画布贴图,', sections.reduce((a, s) => a + s.toys.length, 0), '只捏捏');

// 生成对外发布的版本：把 index.html 里的注释全部去掉、代码压缩，输出到「试玩版」文件夹，并重新打 itch 压缩包。
// index.html 本身（带注释的原版）不动，以后改代码还是改它。改完运行：node build-release.mjs
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const esbuild = createRequire(join(here, 'wxapp/build/package.json'))('esbuild');
const out = join(here, '试玩版');
// 离线版要自带 three.js：第一次运行时从依赖里拷一份过来
const three = join(here, 'wxapp/build/node_modules/three');
for (const [from, to] of [['build/three.module.js', 'lib/three.module.js'], ['examples/jsm/controls/OrbitControls.js', 'lib/addons/controls/OrbitControls.js'],
  ['examples/jsm/environments/RoomEnvironment.js', 'lib/addons/environments/RoomEnvironment.js'], ['examples/jsm/objects/MarchingCubes.js', 'lib/addons/objects/MarchingCubes.js']]) {
  if (!existsSync(join(out, to))) { mkdirSync(dirname(join(out, to)), { recursive: true }); copyFileSync(join(three, from), join(out, to)); }
}
let html = readFileSync(join(here, 'index.html'), 'utf8').replace(/\r\n/g, '\n');

const min = async (code, opt) => (await esbuild.transform(code, { minify: true, legalComments: 'none', charset: 'utf8', ...opt })).code.trim();
const swap = async (re, fn) => { const m = html.match(re); if (!m) throw new Error('没找到 ' + re); html = html.replace(m[0], await fn(m)); };

// 着色器是写在字符串里的，压缩工具不会动字符串里面的注释：压缩完以后剩下的“// 中文”只可能在着色器里，单独去掉
const glsl = c => c.replace(/[ \t]*\/\/[^\n]*[一-鿿][^\n]*/g, '').replace(/\/\*(?:(?!\*\/)[\s\S])*?[一-鿿](?:(?!\*\/)[\s\S])*?\*\//g, '').replace(/\n\s*\n/g, '\n');
await swap(/<script type="module">([\s\S]*?)<\/script>/, async m => '<script type="module">' + glsl(await min(m[1], { format: 'esm', target: 'es2020' })) + '</script>');
await swap(/<script>([\s\S]*?)<\/script>/, async m => '<script>' + await min(m[1], { target: 'es2020' }) + '</script>');
await swap(/<style>([\s\S]*?)<\/style>/, async m => '<style>' + await min(m[1], { loader: 'css' }) + '</style>');
html = html.replace(/<!--[\s\S]*?-->/g, '')
  .replace('"https://cdn.jsdelivr.net/npm/three@0.170.0/build/three.module.js"', '"./lib/three.module.js"')
  .replace('"https://cdn.jsdelivr.net/npm/three@0.170.0/examples/jsm/"', '"./lib/addons/"')
  .replace(/\n\s*\n/g, '\n');
if (!html.includes('./lib/three.module.js')) throw new Error('importmap 没替换成功');
writeFileSync(join(out, 'index.html'), html);
writeFileSync(join(out, 'sounds.js'), readFileSync(join(here, 'sounds.js'), 'utf8').replace(/^\/\/.*\n/, ''));

// 检查：发布版里不应该再有中文注释
const left = (html.match(/\/\/[^\n"'`]*[一-鿿]/g) || []).length + (html.match(/\/\*[\s\S]*?[一-鿿][\s\S]*?\*\//g) || []).length;
console.log('试玩版/index.html', (html.length / 1024 | 0) + ' KB，残留的中文注释:', left);

// itch 压缩包 = 试玩版文件夹的内容
const files = []; (function walk(d) { for (const f of readdirSync(d)) { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : files.push(relative(out, p).replace(/\\/g, '/')); } })(out);
execFileSync('python', ['-c', `
import zipfile,sys,os
z=zipfile.ZipFile(sys.argv[1],'w',zipfile.ZIP_DEFLATED)
for f in sys.argv[3:]: z.write(os.path.join(sys.argv[2],f), f)
z.close()`, join(here, 'cyber-nienie-itch.zip'), out, ...files]);
console.log('cyber-nienie-itch.zip', files.length, '个文件');

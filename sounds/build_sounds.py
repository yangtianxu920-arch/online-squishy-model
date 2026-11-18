# 把 sounds/*.mp3 打包成 ../sounds.js（网页版直接用），并找出每段录音里一下一下的“响”在什么位置。
# 换了录音以后运行：python build_sounds.py   （需要 ffmpeg 和 numpy）
import subprocess, glob, os, json, base64
import numpy as np

here = os.path.dirname(os.path.abspath(__file__))
SR, HOP = 44100, 110
meta, b64 = {}, {}
for f in sorted(glob.glob(os.path.join(here, '*.mp3'))):
    name = os.path.basename(f)[:-4]
    raw = subprocess.run(['ffmpeg', '-v', 'quiet', '-i', f, '-ac', '1', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True).stdout
    x = np.frombuffer(raw, dtype=np.float32)
    e = np.array([np.abs(x[i:i + HOP]).max() for i in range(0, len(x) - HOP, HOP)])
    thr = max(0.015, 0.12 * e.max())
    segs, i = [], 8
    while i < len(e):
        if e[i] > thr and e[i] > 2.2 * (e[i - 8:i - 1].mean() + 1e-4):
            j, pk, quiet = i, e[i], 0
            while j < len(e) - 1 and (j - i) * HOP / SR < 0.45:          # 这一下响到哪里为止：安静下来 40 毫秒，或者最长 0.45 秒
                j += 1; pk = max(pk, e[j]); quiet = quiet + 1 if e[j] < 0.08 * pk else 0
                if quiet * HOP / SR > 0.04: break
            start = max(0, i * HOP / SR - 0.006)
            segs.append([round(start, 3), round(max(0.05, j * HOP / SR - start), 3), round(float(pk), 3)])
            i = j + 1
        else:
            i += 1
    meta[name] = {'on': segs, 'rms': round(float(np.sqrt((x ** 2).mean())), 4), 'dur': round(len(x) / SR, 2)}
    b64[name] = base64.b64encode(open(f, 'rb').read()).decode()
    print('%-8s %2d segs' % (name, len(segs)), [s[1] for s in segs][:12])

js = ('// 由 sounds/build_sounds.py 生成，不要手改。录音来自 ElevenLabs 音效生成。\n'
      'window.NIE_SOUNDS = { meta: ' + json.dumps(meta, separators=(',', ':')) + ',\n b64: ' + json.dumps(b64, separators=(',', ':')) + ',\n'
      ' load(n) { const s = atob(this.b64[n]), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return Promise.resolve(u.buffer); } };\n')
open(os.path.join(here, '..', 'sounds.js'), 'w', encoding='utf-8').write(js)
print('sounds.js', len(js) // 1024, 'KB')

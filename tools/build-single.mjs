// Tüm oyunu tek bir HTML dosyasında birleştirir: node tools/build-single.mjs
// Gerekli: esbuild (npm i -D esbuild veya NODE_PATH ile)
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esbuild = require(process.env.ESBUILD_PATH || 'esbuild');

const threeAlias = {
  name: 'three-alias',
  setup(b) {
    b.onResolve({ filter: /^three$/ }, () => ({ path: resolve(root, 'lib/three.module.min.js') }));
    b.onResolve({ filter: /^three\/addons\// }, (a) => ({ path: resolve(root, 'lib/addons', a.path.slice('three/addons/'.length)) }));
  },
};

const out = await esbuild.build({
  entryPoints: [resolve(root, 'js/main.js')],
  bundle: true, format: 'iife', minify: true, write: false, target: 'es2020',
  plugins: [threeAlias], legalComments: 'none', charset: 'utf8',
  define: { 'window.__SINGLE__': 'true' },
});
const js = out.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const css = readFileSync(resolve(root, 'css/style.css'), 'utf8');
const icon = 'data:image/svg+xml;base64,' + Buffer.from(readFileSync(resolve(root, 'icon.svg'))).toString('base64');
let html = readFileSync(resolve(root, 'index.html'), 'utf8');
html = html
  .replace(/<link rel="manifest"[^>]*>\s*/, '')
  .replace(/<link rel="icon"[^>]*>/, `<link rel="icon" href="${icon}" />`)
  .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>\n${css}\n</style>`)
  .replace(/<script type="importmap">[\s\S]*?<\/script>\s*/, '')
  .replace(/<script type="module" src="js\/main.js"><\/script>/, () => `<script>\n/* OtoDünya — tek dosya sürümü. Three.js (MIT) dahildir. */\n${js}\n</script>`);
const file = resolve(root, 'oyun-tek-dosya.html');
writeFileSync(file, html);
console.log('yazıldı:', file, (html.length / 1024).toFixed(0) + ' KB');

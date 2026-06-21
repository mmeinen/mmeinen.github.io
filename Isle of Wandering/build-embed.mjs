// Build step: download the glTF models and embed them into index.html as
// base64 inside the #model-data block. Re-runnable (idempotent).
//
//   node build-embed.mjs
//
// Why: index.html is meant to be opened directly from disk (file://), and
// browsers block fetch()/XHR from file:// pages — so the models can't be
// downloaded at runtime. Embedding them lets GLTFLoader.parse() the bytes
// with no network access.
import fs from 'node:fs';
import path from 'node:path';

const ROOT = import.meta.dirname;
const HTML = path.join(ROOT, 'index.html');

// Keep these URLs in sync with the `url` fields in the ASSETS table.
const SOURCES = {
  deer:   'https://static.poly.pizza/a9c69fbc-bf7c-4585-9a49-a82e0be1ac6b.glb',
  rabbit: 'https://static.poly.pizza/084b5ebe-c3eb-4e64-9b17-06e2d1e3da5d.glb',
  cat:    'https://static.poly.pizza/5d32eb38-9546-4ce4-aa77-bcef9328ee61.glb',
  boat:   'https://static.poly.pizza/b1d42c7e-152a-4d56-a754-cca000a5abad.glb',
  bird1:  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/Parrot.glb',
  bird2:  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r160/examples/models/gltf/Flamingo.glb',
};

const CACHE = path.join(ROOT, '_models');
fs.mkdirSync(CACHE, { recursive: true });

async function getBytes(key, url) {
  const cached = path.join(CACHE, key + '.glb');
  if (fs.existsSync(cached)) return fs.readFileSync(cached);
  process.stdout.write(`  downloading ${key}... `);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${key}: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.toString('ascii', 0, 4) !== 'glTF') throw new Error(`${key}: not a GLB`);
  fs.writeFileSync(cached, buf);
  console.log(`${(buf.length / 1024 | 0)}KB`);
  return buf;
}

const data = {};
let raw = 0;
for (const [key, url] of Object.entries(SOURCES)) {
  const buf = await getBytes(key, url);
  raw += buf.length;
  data[key] = buf.toString('base64');
}

const json = JSON.stringify(data);
let html = fs.readFileSync(HTML, 'utf8');
const re = /(<script type="application\/json" id="model-data">)[\s\S]*?(<\/script>)/;
if (!re.test(html)) {
  console.error('ERROR: #model-data block not found in index.html');
  process.exit(1);
}
html = html.replace(re, `$1${json}$2`);
fs.writeFileSync(HTML, html);

console.log(`\nEmbedded ${Object.keys(data).length} models`);
console.log(`  raw ${(raw / 1024 / 1024).toFixed(2)}MB -> base64 ${(json.length / 1024 / 1024).toFixed(2)}MB`);
console.log(`  index.html is now ${(fs.statSync(HTML).size / 1024 / 1024).toFixed(2)}MB`);

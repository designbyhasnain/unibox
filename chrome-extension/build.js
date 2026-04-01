const fs = require('fs');
const path = require('path');

const src = __dirname;
const dist = path.join(__dirname, 'dist');

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const srcPath = path.join(from, entry.name);
    const dstPath = path.join(to, entry.name);
    if (entry.name === 'dist' || entry.name === 'node_modules' || entry.name === 'create-icons.js' || entry.name === 'build.js' || entry.name === 'zip.js' || entry.name === 'package.json') continue;
    if (entry.isDirectory()) copyDir(srcPath, dstPath);
    else fs.copyFileSync(srcPath, dstPath);
  }
}

if (fs.existsSync(dist)) fs.rmSync(dist, { recursive: true });
copyDir(src, dist);
console.log('Built to dist/');

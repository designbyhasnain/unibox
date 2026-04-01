const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dist = path.join(__dirname, 'dist');
const zip = path.join(__dirname, 'unibox-extension.zip');
if (!fs.existsSync(dist)) { console.error('Run build.js first'); process.exit(1); }
if (fs.existsSync(zip)) fs.unlinkSync(zip);

// Use PowerShell on Windows
try {
  execSync(, { stdio: 'inherit' });
  console.log('Created unibox-extension.zip');
} catch {
  console.log('Zip failed. Install 7zip or use: cd dist && zip -r ../unibox-extension.zip .');
}

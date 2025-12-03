const fs = require('fs');
const path = require('path');

const root = process.cwd();
const dist = path.join(root, 'dist');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDir(srcDir, destDir) {
  if (!fs.existsSync(srcDir)) return;
  ensureDir(destDir);
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else if (entry.isFile()) {
      copyFile(srcPath, destPath);
    }
  }
}

(async function main(){
  try {
    console.log('Building static assets into dist/');
    ensureDir(dist);

    const indexSrc = path.join(root, 'index.html');
    const indexDest = path.join(dist, 'index.html');
    if (fs.existsSync(indexSrc)) {
      // Read index.html and replace serverUrl with environment value if provided
      let html = fs.readFileSync(indexSrc, 'utf8');
      const serverUrlMatch = html.match(/serverUrl\s*:\s*"([^"]+)"/);
      const defaultServer = (serverUrlMatch && serverUrlMatch[1]) || 'ws://localhost:3000';
      const envServer = process.env.SERVER_URL || defaultServer;
      html = html.replace(/(serverUrl\s*:\s*)"[^"]+"/, `$1"${envServer}"`);
      fs.writeFileSync(indexDest, html, 'utf8');
      console.log(`Copied index.html -> dist/index.html (serverUrl=${envServer})`);
    } else {
      console.warn('No index.html found at project root; skipping copy.');
    }

    const publicSrc = path.join(root, 'public');
    const publicDest = path.join(dist, 'public');
    if (fs.existsSync(publicSrc)) {
      copyDir(publicSrc, publicDest);
      console.log('Copied public/ -> dist/public/');
    } else {
      console.log('No public/ directory; skipping.');
    }

    console.log('Build script finished.');
  } catch (err) {
    console.error('Build script failed:', err);
    process.exit(1);
  }
})();

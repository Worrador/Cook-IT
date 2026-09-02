// Post-export fix for Cloudflare Pages hosting.
//
// THE PROBLEM
// `expo export --platform web` writes bundled assets to a path that mirrors
// their source location, so the icon fonts land in:
//
//   dist/assets/node_modules/@expo/vector-icons/.../MaterialCommunityIcons.ttf
//
// Cloudflare Pages silently skips any file whose path contains `node_modules`.
// The upload reports success, the deploy works, and requests for those fonts
// return HTTP 200 - but the body is the SPA fallback index.html, served as
// text/html with `x-content-type-options: nosniff`. The browser refuses to
// parse HTML as a font, so every icon renders as an empty tofu box with no
// error anywhere. A 200 that isn't the file you asked for is a nasty failure
// mode; it looks like a font bug rather than a hosting rule.
//
// THE FIX
// Rename that directory to something Pages will upload, and rewrite the
// references to it inside the exported bundle and HTML.
//
// Run after every web export:
//   npx expo export --platform web && node tools/fix-web-assets.js
const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, '..', 'dist');
const FROM = path.join(DIST, 'assets', 'node_modules');
const TO = path.join(DIST, 'assets', 'vendor');

// Every textual file that could carry the old path.
const REWRITE_EXTENSIONS = new Set(['.js', '.html', '.json', '.css', '.map']);

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else files.push(full);
  }
  return files;
}

if (!fs.existsSync(DIST)) {
  console.error('No dist/ directory - run `npx expo export --platform web` first.');
  process.exit(1);
}

if (fs.existsSync(FROM)) {
  fs.rmSync(TO, { recursive: true, force: true });
  fs.renameSync(FROM, TO);
  console.log('Moved dist/assets/node_modules -> dist/assets/vendor');
} else if (fs.existsSync(TO)) {
  console.log('Already fixed (dist/assets/vendor exists)');
} else {
  console.log('Nothing to move - no bundled node_modules assets found');
}

let rewritten = 0;
for (const file of walk(DIST)) {
  if (!REWRITE_EXTENSIONS.has(path.extname(file))) continue;

  const original = fs.readFileSync(file, 'utf8');
  if (!original.includes('assets/node_modules')) continue;

  fs.writeFileSync(file, original.split('assets/node_modules').join('assets/vendor'));
  rewritten += 1;
}

console.log(`Rewrote asset paths in ${rewritten} file(s)`);

// Fail loudly rather than deploying something that will 200-with-HTML again.
const leftovers = walk(DIST).filter(f => f.includes('node_modules'));
if (leftovers.length) {
  console.error(`Still ${leftovers.length} file(s) under a node_modules path:`);
  for (const f of leftovers.slice(0, 5)) console.error('  ' + path.relative(DIST, f));
  process.exit(1);
}
console.log('dist/ is clean of node_modules paths - safe to deploy to Pages');

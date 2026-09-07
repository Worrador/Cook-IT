// Web build, stamped so the deployed page can identify itself.
//
// THE PROBLEM THIS SOLVES
// Nothing deploys this site automatically - there is no Pages build hook and
// `dist` is gitignored, so pushing to main publishes nothing. Without a stamp on
// the page there is no way to tell "my change isn't deployed" apart from "my
// change is deployed and broken", or from a stale bundle in the browser cache.
//
// EXPO_PUBLIC_* is inlined into the bundle by Metro, so the build time and
// commit written here become literals the footer can print. See
// src/config/buildInfo.js.
//
//   npm run build:web    build only
//   npm run deploy:web   build, then upload to Cloudflare Pages
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist');

const buildTime = new Date().toISOString();

let commit = '';
try {
  commit = execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: root }).trim();
} catch (_error) {
  // A build outside a git checkout still gets a timestamp, which is the part
  // that matters for telling deploys apart.
}

const env = {
  ...process.env,
  EXPO_PUBLIC_BUILD_TIME: buildTime,
  EXPO_PUBLIC_BUILD_COMMIT: commit,
};

// expo export refuses to write into an existing directory.
fs.rmSync(dist, { recursive: true, force: true });

const run = (command) => execSync(command, { stdio: 'inherit', cwd: root, env });

// --clear is required, not tidiness: Metro caches the transform of
// buildInfo.js along with the inlined EXPO_PUBLIC_* values, so a warm cache
// re-emits the previous build's timestamp and the bundle comes out byte-identical.
run('npx expo export --platform web --output-dir dist --clear');

// Renames the vector-icon fonts out of a node_modules path, which Cloudflare
// Pages silently refuses to upload. Read the header of that file before
// removing this step.
run('node tools/fix-web-assets.js');

// Fail loudly rather than shipping a build whose footer says "dev build".
const bundleDir = path.join(dist, '_expo/static/js/web');
const bundles = fs.existsSync(bundleDir) ? fs.readdirSync(bundleDir) : [];
const stamped = bundles.some(name =>
  fs.readFileSync(path.join(bundleDir, name), 'utf8').includes(buildTime));

if (!stamped) {
  console.error(`\nBuild stamp ${buildTime} is not present in the bundle - the footer will read "dev build".`);
  process.exit(1);
}

console.log(`\nBuilt ${buildTime}${commit ? ` (${commit})` : ''}`);

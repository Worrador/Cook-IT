const fs = require('fs-extra');
const { exec } = require('child_process');
const path = require('path');

const buildDir = path.join(__dirname, 'build');
const distDir = path.join(__dirname, 'dist');

console.log('Starting build process...');

// Clean up previous builds
fs.removeSync(buildDir);
fs.removeSync(distDir);

// Build React app
console.log('Building React app...');
exec('react-scripts build', (error, stdout, stderr) => {
  if (error) {
    console.error(`Error building React app: ${error}`);
    return;
  }
  console.log('React app built successfully.');

  // Copy necessary files to dist
  console.log('Copying files to dist directory...');
  fs.ensureDirSync(distDir);
  fs.copySync(buildDir, path.join(distDir, 'build'));
  fs.copySync(path.join(__dirname, 'main.js'), path.join(distDir, 'main.js'));
  fs.copySync(path.join(__dirname, 'preload.js'), path.join(distDir, 'preload.js'));
  fs.copySync(path.join(__dirname, 'package.json'), path.join(distDir, 'package.json'));
  fs.copySync(path.join(__dirname, 'cook_it_bridge.py'), path.join(distDir, 'cook_it_bridge.py'));

  // Modify package.json for distribution
  const packageJson = fs.readJsonSync(path.join(distDir, 'package.json'));
  packageJson.main = 'main.js';
  packageJson.scripts = {
    start: 'electron .'
  };
  fs.writeJsonSync(path.join(distDir, 'package.json'), packageJson, { spaces: 2 });

  console.log('Build process completed successfully!');
  console.log('Your distribution-ready app is in the "dist" folder.');
});
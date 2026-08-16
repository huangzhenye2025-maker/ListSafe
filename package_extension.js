const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('--- [Packaging ListSafe for Chrome Web Store] ---');

const projectRoot = __dirname;
const distDir = path.join(projectRoot, 'dist_package');
const zipOutput = path.join(projectRoot, 'ListSafe-Chrome-Extension-v1.0.1.zip');

// Clean dist dir
if (fs.existsSync(distDir)) {
  fs.rmSync(distDir, { recursive: true, force: true });
}
if (fs.existsSync(zipOutput)) {
  fs.unlinkSync(zipOutput);
}
fs.mkdirSync(distDir, { recursive: true });

// Extension files & directories to include
const itemsToCopy = [
  'manifest.json',
  'background',
  'content',
  'popup',
  'utils',
  'data',
  'icons'
];

function copyRecursive(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    const children = fs.readdirSync(src);
    for (const child of children) {
      copyRecursive(path.join(src, child), path.join(dest, child));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

itemsToCopy.forEach(item => {
  const srcPath = path.join(projectRoot, item);
  const destPath = path.join(distDir, item);
  if (fs.existsSync(srcPath)) {
    copyRecursive(srcPath, destPath);
    console.log(`✓ Bundled: ${item}`);
  } else {
    console.warn(`⚠️ Warning: Missing ${item}`);
  }
});

// Use PowerShell Compress-Archive to build standard ZIP
try {
  const psCmd = `powershell -Command "Compress-Archive -Path '${distDir}\\*' -DestinationPath '${zipOutput}' -Force"`;
  execSync(psCmd, { stdio: 'inherit' });
  
  const zipStat = fs.statSync(zipOutput);
  console.log(`\n🎉 Package created successfully!`);
  console.log(`📦 File: ${zipOutput}`);
  console.log(`📊 Size: ${(zipStat.size / 1024).toFixed(2)} KB`);
  
  // Clean temporary dist folder
  fs.rmSync(distDir, { recursive: true, force: true });
} catch (err) {
  console.error('Failed to create zip package:', err);
}

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('--- [Rendering Ultra-High Quality PNG Icons from SVG] ---');

const iconsDir = path.join(__dirname, 'icons');
const svgPath = path.join(iconsDir, 'icon.svg');
const svgContent = fs.readFileSync(svgPath, 'utf8');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const sizes = [128, 48, 32, 16];

sizes.forEach(size => {
  const htmlContent = `<!DOCTYPE html>
<html>
<head>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { width: ${size}px; height: ${size}px; overflow: hidden; background: transparent; }
  svg { width: ${size}px; height: ${size}px; display: block; }
</style>
</head>
<body>
${svgContent}
</body>
</html>`;

  const tempHtml = path.join(iconsDir, `temp_${size}.html`);
  const targetPng = path.join(iconsDir, `icon${size}.png`);
  
  fs.writeFileSync(tempHtml, htmlContent, 'utf8');

  try {
    const cmd = `"${chromePath}" --headless --disable-gpu --force-device-scale-factor=1 --default-background-color=00000000 --window-size=${size},${size} --screenshot="${targetPng}" "file:///${tempHtml.replace(/\\/g, '/')}"`;
    execSync(cmd, { stdio: 'ignore' });
    console.log(`✓ Rendered icon${size}.png (${size}x${size})`);
  } catch (err) {
    console.error(`Error rendering ${size}x${size}:`, err);
  } finally {
    if (fs.existsSync(tempHtml)) fs.unlinkSync(tempHtml);
  }
});

console.log('\n✅ All high-definition icons rendered successfully!');

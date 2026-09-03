const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

const rootDir = path.resolve(__dirname, '..');
const masterPath = path.join(rootDir, 'assets', 'images', 'mavrixfy_transparent_master.png');
const masterBuf = fs.readFileSync(masterPath);
const master = PNG.sync.read(masterBuf);

// Find exact bounding box of non-transparent logo
let minX = master.width, maxX = 0, minY = master.height, maxY = 0;
for (let y = 0; y < master.height; y++) {
  for (let x = 0; x < master.width; x++) {
    const idx = (master.width * y + x) << 2;
    if (master.data[idx + 3] > 10) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}

const logoW = maxX - minX + 1;
const logoH = maxY - minY + 1;
console.log(`Original logo bounds: [${minX}, ${minY}] to [${maxX}, ${maxY}] (${logoW} x ${logoH})`);

// Bilinear scaling function with subpixel precision
function scaleBilinear(srcPng, srcX, srcY, srcW, srcH, dstW, dstH) {
  const dst = new PNG({ width: dstW, height: dstH });
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    const srcYPos = srcY + (y + 0.5) * yRatio - 0.5;
    const yFloor = Math.floor(srcYPos);
    const yWeight = Math.max(0, Math.min(1, srcYPos - yFloor));
    const y0 = Math.max(0, Math.min(srcPng.height - 1, yFloor));
    const y1 = Math.max(0, Math.min(srcPng.height - 1, yFloor + 1));

    for (let x = 0; x < dstW; x++) {
      const srcXPos = srcX + (x + 0.5) * xRatio - 0.5;
      const xFloor = Math.floor(srcXPos);
      const xWeight = Math.max(0, Math.min(1, srcXPos - xFloor));
      const x0 = Math.max(0, Math.min(srcPng.width - 1, xFloor));
      const x1 = Math.max(0, Math.min(srcPng.width - 1, xFloor + 1));

      const idx00 = (srcPng.width * y0 + x0) << 2;
      const idx10 = (srcPng.width * y0 + x1) << 2;
      const idx01 = (srcPng.width * y1 + x0) << 2;
      const idx11 = (srcPng.width * y1 + x1) << 2;

      const dstIdx = (dstW * y + x) << 2;

      for (let c = 0; c < 4; c++) {
        const top = srcPng.data[idx00 + c] * (1 - xWeight) + srcPng.data[idx10 + c] * xWeight;
        const btm = srcPng.data[idx01 + c] * (1 - xWeight) + srcPng.data[idx11 + c] * xWeight;
        dst.data[dstIdx + c] = Math.round(top * (1 - yWeight) + btm * yWeight);
      }
    }
  }
  return dst;
}

// Composite src PNG onto a new canvas of size (w, h) with specified background color (or transparent)
function compositeOnCanvas(src, canvasW, canvasH, bgR = 0, bgG = 0, bgB = 0, bgA = 0, isRound = false) {
  const canvas = new PNG({ width: canvasW, height: canvasH });
  const offsetX = Math.round((canvasW - src.width) / 2);
  const offsetY = Math.round((canvasH - src.height) / 2);

  const radius = canvasW / 2;
  const radiusSq = radius * radius;

  // Fill background
  for (let y = 0; y < canvasH; y++) {
    for (let x = 0; x < canvasW; x++) {
      const idx = (canvasW * y + x) << 2;
      if (isRound) {
        const distSq = (x - radius + 0.5) ** 2 + (y - radius + 0.5) ** 2;
        if (distSq > radiusSq) {
          canvas.data[idx] = 0;
          canvas.data[idx + 1] = 0;
          canvas.data[idx + 2] = 0;
          canvas.data[idx + 3] = 0;
          continue;
        }
      }
      canvas.data[idx] = bgR;
      canvas.data[idx + 1] = bgG;
      canvas.data[idx + 2] = bgB;
      canvas.data[idx + 3] = bgA;
    }
  }

  // Alpha blend src onto canvas
  for (let y = 0; y < src.height; y++) {
    const dstY = offsetY + y;
    if (dstY < 0 || dstY >= canvasH) continue;

    for (let x = 0; x < src.width; x++) {
      const dstX = offsetX + x;
      if (dstX < 0 || dstX >= canvasW) continue;

      if (isRound) {
        const distSq = (dstX - radius + 0.5) ** 2 + (dstY - radius + 0.5) ** 2;
        if (distSq > radiusSq) continue;
      }

      const srcIdx = (src.width * y + x) << 2;
      const dstIdx = (canvasW * dstY + dstX) << 2;

      const srcA = src.data[srcIdx + 3] / 255;
      const dstA = canvas.data[dstIdx + 3] / 255;

      const outA = srcA + dstA * (1 - srcA);
      if (outA > 0) {
        for (let c = 0; c < 3; c++) {
          const srcC = src.data[srcIdx + c];
          const dstC = canvas.data[dstIdx + c];
          canvas.data[dstIdx + c] = Math.round((srcC * srcA + dstC * dstA * (1 - srcA)) / outA);
        }
        canvas.data[dstIdx + 3] = Math.round(outA * 255);
      }
    }
  }

  return canvas;
}

// Create monochrome white silhouette with identical alpha channel
function createMonochrome(src) {
  const mono = new PNG({ width: src.width, height: src.height });
  for (let i = 0; i < src.data.length; i += 4) {
    mono.data[i] = 255;     // R
    mono.data[i + 1] = 255; // G
    mono.data[i + 2] = 255; // B
    mono.data[i + 3] = src.data[i + 3]; // preserve exact alpha
  }
  return mono;
}

function writePng(png, targetPath) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, PNG.sync.write(png));
  console.log(`Saved: ${path.relative(rootDir, targetPath)} (${png.width}x${png.height})`);
}

// 1. MASTER ICON (mavrixfy_icon.png) — 1024x1024, #000000 background, centered
// Logo width = 720px, aspect ratio preserved (height = 534px)
function writeBrandAsset(png, filename) {
  writePng(png, path.join(rootDir, 'assets', 'images', filename));
  writePng(png, path.join(rootDir, 'src', 'assets', 'images', filename));
}

// 1. MASTER ICON (mavrixfy_icon.png) — 1024x1024, #000000 background, centered
// Logo width = 720px, aspect ratio preserved (height = 534px)
const masterLogoW = 720;
const masterLogoH = Math.round(logoH * (masterLogoW / logoW));
const scaledMasterLogo = scaleBilinear(master, minX, minY, logoW, logoH, masterLogoW, masterLogoH);
const masterIcon = compositeOnCanvas(scaledMasterLogo, 1024, 1024, 0, 0, 0, 255, false);
writeBrandAsset(masterIcon, 'mavrixfy_icon.png');

// 2. ANDROID ADAPTIVE FOREGROUND (mavrixfy_icon_foreground.png) — 1024x1024 transparent
// Android safe zone is center 66dp of 108dp (61.1%). In 1024x1024, safe zone is 625x625.
// We size logo to 580px width (height ~430px) so it has safe breathing room and NEVER clips on any mask!
const adaptiveLogoW = 580;
const adaptiveLogoH = Math.round(logoH * (adaptiveLogoW / logoW));
const scaledAdaptiveLogo = scaleBilinear(master, minX, minY, logoW, logoH, adaptiveLogoW, adaptiveLogoH);
const adaptiveForeground = compositeOnCanvas(scaledAdaptiveLogo, 1024, 1024, 0, 0, 0, 0, false);
writeBrandAsset(adaptiveForeground, 'mavrixfy_icon_foreground.png');

// 3. ANDROID 13+ MONOCHROME (mavrixfy_icon_monochrome.png) — 1024x1024 transparent, white silhouette
const adaptiveMonochrome = createMonochrome(adaptiveForeground);
writeBrandAsset(adaptiveMonochrome, 'mavrixfy_icon_monochrome.png');

// 4. SPLASH SCREEN (mavrixfy_splash.png & mavrixfy_splash_dark.png) — 1024x1024 transparent
// Centered soundwave logo width = 640px
const splashLogoW = 640;
const splashLogoH = Math.round(logoH * (splashLogoW / logoW));
const scaledSplashLogo = scaleBilinear(master, minX, minY, logoW, logoH, splashLogoW, splashLogoH);
const splashPng = compositeOnCanvas(scaledSplashLogo, 1024, 1024, 0, 0, 0, 0, false);
writeBrandAsset(splashPng, 'mavrixfy_splash.png');
writeBrandAsset(splashPng, 'mavrixfy_splash_dark.png');

// 5. NATIVE ANDROID MIPMAPS & DRAWABLES
const androidRes = path.join(rootDir, 'android', 'app', 'src', 'main', 'res');

if (fs.existsSync(androidRes)) {
  console.log('\nGenerating Android native mipmap and drawable densities...');

  const densities = [
    { dir: 'mipmap-mdpi', iconSize: 48, adaptiveSize: 108, splashDir: 'drawable-mdpi', splashSize: 160 },
    { dir: 'mipmap-hdpi', iconSize: 72, adaptiveSize: 162, splashDir: 'drawable-hdpi', splashSize: 240 },
    { dir: 'mipmap-xhdpi', iconSize: 96, adaptiveSize: 216, splashDir: 'drawable-xhdpi', splashSize: 320 },
    { dir: 'mipmap-xxhdpi', iconSize: 144, adaptiveSize: 324, splashDir: 'drawable-xxhdpi', splashSize: 480 },
    { dir: 'mipmap-xxxhdpi', iconSize: 192, adaptiveSize: 432, splashDir: 'drawable-xxxhdpi', splashSize: 640 },
  ];

  for (const d of densities) {
    const mipmapPath = path.join(androidRes, d.dir);

    // Legacy square fallback (ic_launcher.png)
    const legLogoW = Math.round(d.iconSize * 0.70);
    const legLogoH = Math.round(logoH * (legLogoW / logoW));
    const legScaled = scaleBilinear(master, minX, minY, logoW, logoH, legLogoW, legLogoH);
    const legIcon = compositeOnCanvas(legScaled, d.iconSize, d.iconSize, 0, 0, 0, 255, false);
    writePng(legIcon, path.join(mipmapPath, 'ic_launcher.png'));

    // Legacy round fallback (ic_launcher_round.png)
    const roundIcon = compositeOnCanvas(legScaled, d.iconSize, d.iconSize, 0, 0, 0, 255, true);
    writePng(roundIcon, path.join(mipmapPath, 'ic_launcher_round.png'));

    // Adaptive foreground (ic_launcher_foreground.png)
    // 580/1024 of adaptiveSize
    const adaptLogoW = Math.round(d.adaptiveSize * (580 / 1024));
    const adaptLogoH = Math.round(logoH * (adaptLogoW / logoW));
    const adaptScaled = scaleBilinear(master, minX, minY, logoW, logoH, adaptLogoW, adaptLogoH);
    const adaptFg = compositeOnCanvas(adaptScaled, d.adaptiveSize, d.adaptiveSize, 0, 0, 0, 0, false);
    writePng(adaptFg, path.join(mipmapPath, 'ic_launcher_foreground.png'));

    // Adaptive monochrome (ic_launcher_monochrome.png)
    const adaptMono = createMonochrome(adaptFg);
    writePng(adaptMono, path.join(mipmapPath, 'ic_launcher_monochrome.png'));

    // Splash screen logo (drawable-*/splashscreen_logo.png)
    const spLogoW = Math.round(d.splashSize * 0.65);
    const spLogoH = Math.round(logoH * (spLogoW / logoW));
    const spScaled = scaleBilinear(master, minX, minY, logoW, logoH, spLogoW, spLogoH);
    const spImg = compositeOnCanvas(spScaled, d.splashSize, d.splashSize, 0, 0, 0, 0, false);
    writePng(spImg, path.join(androidRes, d.splashDir, 'splashscreen_logo.png'));
  }

  // Play Store and Web icons in res/
  const playStoreIcon = compositeOnCanvas(scaleBilinear(master, minX, minY, logoW, logoH, 360, Math.round(logoH * (360 / logoW))), 512, 512, 0, 0, 0, 255, false);
  writePng(playStoreIcon, path.join(androidRes, 'playstore-icon.png'));
  writePng(playStoreIcon, path.join(androidRes, 'ic_launcher-web.png'));
}

console.log('\nAll assets successfully generated!');

const fs = require('fs');
const path = require('path');
const { PNG } = require('pngjs');

// High-quality bilinear resampling with alpha preservation
function resizePNG(srcPng, targetWidth, targetHeight, padRatio = 1.0, isRound = false, bgDark = false) {
  const dstPng = new PNG({ width: targetWidth, height: targetHeight });
  
  const innerW = Math.round(targetWidth * padRatio);
  const innerH = Math.round(targetHeight * padRatio);
  const offsetX = Math.floor((targetWidth - innerW) / 2);
  const offsetY = Math.floor((targetHeight - innerH) / 2);
  
  const radius = targetWidth / 2;
  const radiusSq = radius * radius;
  const cx = targetWidth / 2;
  const cy = targetHeight / 2;

  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const dstIdx = (y * targetWidth + x) << 2;
      
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const distSq = dx * dx + dy * dy;
      
      if (isRound) {
        if (distSq > radiusSq + radius) {
          dstPng.data[dstIdx] = 0;
          dstPng.data[dstIdx + 1] = 0;
          dstPng.data[dstIdx + 2] = 0;
          dstPng.data[dstIdx + 3] = 0;
          continue;
        }
      }

      // Check if within inner icon area
      const ix = x - offsetX;
      const iy = y - offsetY;

      if (ix < 0 || ix >= innerW || iy < 0 || iy >= innerH) {
        if (bgDark && (!isRound || distSq <= radiusSq)) {
          dstPng.data[dstIdx] = 18;
          dstPng.data[dstIdx + 1] = 18;
          dstPng.data[dstIdx + 2] = 18;
          dstPng.data[dstIdx + 3] = 255;
        } else {
          dstPng.data[dstIdx] = 0;
          dstPng.data[dstIdx + 1] = 0;
          dstPng.data[dstIdx + 2] = 0;
          dstPng.data[dstIdx + 3] = 0;
        }
        continue;
      }

      // Bilinear sampling from srcPng
      const gx = (ix / (innerW - 1)) * (srcPng.width - 1);
      const gy = (iy / (innerH - 1)) * (srcPng.height - 1);
      const x0 = Math.floor(gx);
      const x1 = Math.min(x0 + 1, srcPng.width - 1);
      const y0 = Math.floor(gy);
      const y1 = Math.min(y0 + 1, srcPng.height - 1);
      const fx = gx - x0;
      const fy = gy - y0;

      const idx00 = (y0 * srcPng.width + x0) << 2;
      const idx10 = (y0 * srcPng.width + x1) << 2;
      const idx01 = (y1 * srcPng.width + x0) << 2;
      const idx11 = (y1 * srcPng.width + x1) << 2;

      for (let c = 0; c < 4; c++) {
        const val0 = srcPng.data[idx00 + c] * (1 - fx) + srcPng.data[idx10 + c] * fx;
        const val1 = srcPng.data[idx01 + c] * (1 - fx) + srcPng.data[idx11 + c] * fx;
        const val = val0 * (1 - fy) + val1 * fy;
        dstPng.data[dstIdx + c] = Math.round(val);
      }

      // Edge antialiasing for circular icons
      if (isRound && distSq > radiusSq - radius) {
        const edgeAlpha = Math.max(0, Math.min(1, (radiusSq - distSq + radius) / (2 * radius)));
        dstPng.data[dstIdx + 3] = Math.round(dstPng.data[dstIdx + 3] * edgeAlpha);
      }
    }
  }

  return dstPng;
}

// Convert solid black pixels to smooth transparent alpha
function makeTransparentMaster(srcPng) {
  const dst = new PNG({ width: srcPng.width, height: srcPng.height });
  for (let i = 0; i < srcPng.data.length; i += 4) {
    const r = srcPng.data[i];
    const g = srcPng.data[i + 1];
    const b = srcPng.data[i + 2];
    const maxVal = Math.max(r, Math.max(g, b));

    if (maxVal <= 10) {
      dst.data[i] = 0;
      dst.data[i + 1] = 0;
      dst.data[i + 2] = 0;
      dst.data[i + 3] = 0;
    } else if (maxVal < 45) {
      const alpha = Math.round(((maxVal - 10) / 35) * 255);
      dst.data[i] = r;
      dst.data[i + 1] = g;
      dst.data[i + 2] = b;
      dst.data[i + 3] = alpha;
    } else {
      dst.data[i] = r;
      dst.data[i + 1] = g;
      dst.data[i + 2] = b;
      dst.data[i + 3] = 255;
    }
  }
  return dst;
}

function writePng(pngObj, targetPath) {
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(targetPath, PNG.sync.write(pngObj));
  console.log('Saved:', targetPath, `(${pngObj.width}x${pngObj.height})`);
}

async function run() {
  const masterPath = path.resolve('assets/images/mavrixfy_icone.png');
  const masterBuf = fs.readFileSync(masterPath);
  const masterPng = PNG.sync.read(masterBuf);
  console.log('Read master PNG:', masterPng.width, masterPng.height);

  const transparentMaster = makeTransparentMaster(masterPng);
  writePng(transparentMaster, path.resolve('assets/images/mavrixfy_transparent_master.png'));

  const resBase = path.resolve('android/app/src/main/res');

  // Android Adaptive Icon Foregrounds (Standard: 108dp canvas, ~72dp safe zone = 0.70 ratio)
  const foregroundSizes = {
    'mipmap-mdpi': 108,
    'mipmap-hdpi': 162,
    'mipmap-xhdpi': 216,
    'mipmap-xxhdpi': 324,
    'mipmap-xxxhdpi': 432
  };

  for (const [folder, size] of Object.entries(foregroundSizes)) {
    const fg = resizePNG(transparentMaster, size, size, 0.70, false, false);
    writePng(fg, path.join(resBase, folder, 'ic_launcher_foreground.png'));
  }

  // Android Launcher Icons (48, 72, 96, 144, 192)
  const launcherSizes = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192
  };

  for (const [folder, size] of Object.entries(launcherSizes)) {
    const sq = resizePNG(transparentMaster, size, size, 0.82, false, true);
    writePng(sq, path.join(resBase, folder, 'ic_launcher.png'));

    const rd = resizePNG(transparentMaster, size, size, 0.82, true, true);
    writePng(rd, path.join(resBase, folder, 'ic_launcher_round.png'));
  }

  // Android 12+ Splash Screen Logo (High-resolution transparent vector-like logo)
  const splashSizes = {
    'drawable-mdpi': 192,
    'drawable-hdpi': 288,
    'drawable-xhdpi': 384,
    'drawable-xxhdpi': 576,
    'drawable-xxxhdpi': 768
  };

  for (const [folder, size] of Object.entries(splashSizes)) {
    const splash = resizePNG(transparentMaster, size, size, 0.88, false, false);
    writePng(splash, path.join(resBase, folder, 'splashscreen_logo.png'));
  }

  // Web & Play Store 512x512
  const storeIcon = resizePNG(transparentMaster, 512, 512, 0.82, false, true);
  writePng(storeIcon, path.join(resBase, 'playstore-icon.png'));
  writePng(storeIcon, path.join(resBase, 'ic_launcher-web.png'));

  console.log('All icons generated successfully!');
}

run().catch(console.error);

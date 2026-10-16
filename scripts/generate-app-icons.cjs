/** Render the official vector master at each target size; never upscale a PNG. */
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");

const root = path.resolve(__dirname, "..");
const images = path.join(root, "assets/images");
const branding = path.join(root, "assets/branding");

function variant(master, { scale = 1, background, monochrome = false } = {}) {
  let svg = master;
  if (monochrome) svg = svg.replace(/fill="url\(#bar\d+\)"/g, 'fill="#ffffff"');
  const inset = (1024 * (1 - scale)) / 2;
  return svg.replace('<g id="waveform">',
    `${background ? `<rect width="1024" height="1024" fill="${background}"/>\n  ` : ""}<g id="waveform" transform="translate(${inset} ${inset}) scale(${scale})">`);
}

function render(svg, size) {
  return sharp(Buffer.from(svg), { density: 72 * size / 1024 })
    .resize(size, size).withIccProfile("srgb");
}

async function png(svg, size, file, opaque = false) {
  let pipeline = render(svg, size);
  if (opaque) pipeline = pipeline.flatten({ background: "#000000" }).removeAlpha();
  await pipeline.png({ compressionLevel: 9, palette: false }).toFile(file);
}

async function ico(svg, file) {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const frames = await Promise.all(sizes.map(size => render(svg, size).ensureAlpha().png().toBuffer()));
  const header = Buffer.alloc(6 + frames.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(frames.length, 4);
  let offset = header.length;
  frames.forEach((frame, index) => {
    const entry = 6 + index * 16;
    header[entry] = sizes[index] === 256 ? 0 : sizes[index];
    header[entry + 1] = header[entry];
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(frame.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += frame.length;
  });
  await fs.writeFile(file, Buffer.concat([header, ...frames]));
}

async function main() {
  const master = await fs.readFile(path.join(branding, "mavrixfy-mark.svg"), "utf8");
  const config = JSON.parse(await fs.readFile(path.join(root, "app.json"), "utf8")).expo;
  const background = config.android.adaptiveIcon.backgroundColor;
  const splashConfig = config.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === "expo-splash-screen")[1];
  const rects = [...master.matchAll(/<rect\s+x="([\d.]+)"\s+y="([\d.]+)"\s+width="([\d.]+)"\s+height="([\d.]+)"\s+rx="([\d.]+)"\s+fill="url\(#(bar\d+)\)"\s*\/>/g)];
  const bars = rects.map((match) => {
    const [, x, y, width, height, rx, id] = match;
    const gradient = master.match(new RegExp(`<linearGradient id="${id}"[^>]*>([\\s\\S]*?)</linearGradient>`))[1];
    const stops = [...gradient.matchAll(/<stop\s+(?:offset="([\d.]+)"\s+)?stop-color="(#[\da-f]+)"\s*\/>/g)]
      .map(([, offset, color]) => ({ offset: Number(offset || 0), color }));
    if (!stops.length) throw Error(`Missing gradient for ${id}`);
    return { x: Number(x), y: Number(y), width: Number(width), height: Number(height), rx: Number(rx), stops };
  });
  if (bars.length !== 10) throw Error("The official waveform must contain ten bars");
  await fs.writeFile(path.join(branding, "mavrixfy-bars.json"), `[\n${bars.map(bar => `  ${JSON.stringify(bar)}`).join(",\n")}\n]\n`);
  // Native launch remains a stable background; no isolated line while JS loads.
  const launchBackground = '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"/>';
  const app = variant(master, { background: "#000000" });
  // Matches the existing Android mark footprint and fits the 66/108 safe-zone circle.
  const foreground = variant(master, { scale: 0.806 });
  const monochrome = variant(master, { scale: 0.806, monochrome: true });
  const legacy = variant(master, { background });

  await fs.writeFile(path.join(images, "mavrixfy_icon.svg"), app);
  await fs.writeFile(path.join(images, "mavrixfy_icon_foreground.svg"), foreground);
  await fs.writeFile(path.join(images, "mavrixfy_icon_monochrome.svg"), monochrome);
  await png(app, 1024, path.join(images, "mavrixfy_icon.png"), true);
  await png(foreground, 1024, path.join(images, "mavrixfy_icon_foreground.png"));
  await png(monochrome, 1024, path.join(images, "mavrixfy_icon_monochrome.png"));
  await png(master, 1024, path.join(images, "mavrixfy_splash.png"));
  await png(launchBackground, 1024, path.join(images, "mavrixfy_launch_background.png"));
  await png(app, 4096, path.join(branding, "mavrixfy-icon-4096.png"), true);
  await png(app, 512, path.join(branding, "mavrixfy-play-store-512.png"));
  await ico(app, path.join(branding, "mavrixfy.ico"));

  // Android is checked in, so refresh its resources as well as Expo's source PNGs.
  const densities = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 };
  for (const [density, factor] of Object.entries(densities)) {
    const directory = path.join(root, `android/app/src/main/res/mipmap-${density}`);
    try { await fs.access(directory); } catch { continue; }
    for (const [name, svg, size] of [
      ["ic_launcher", legacy, 48 * factor],
      ["ic_launcher_foreground", foreground, 108 * factor],
      ["ic_launcher_monochrome", monochrome, 108 * factor],
    ]) {
      await render(svg, size).webp({ lossless: true }).toFile(path.join(directory, `${name}.webp`));
    }
    const size = 48 * factor;
    const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="white"/></svg>`);
    await render(legacy, size).ensureAlpha().composite([{ input: mask, blend: "dest-in" }])
      .webp({ lossless: true }).toFile(path.join(directory, "ic_launcher_round.webp"));
    const canvasSize = 288 * factor;
    const logoSize = splashConfig.imageWidth * factor;
    const splashLogo = await render(launchBackground, logoSize).png().toBuffer();
    for (const theme of ["drawable", "drawable-night"]) {
      const splashDirectory = path.join(root, `android/app/src/main/res/${theme}-${density}`);
      await fs.mkdir(splashDirectory, { recursive: true });
      await sharp({ create: { width: canvasSize, height: canvasSize, channels: 4, background: "transparent" } })
        .composite([{ input: splashLogo, left: (canvasSize - logoSize) / 2, top: (canvasSize - logoSize) / 2 }])
        .withIccProfile("srgb").png({ compressionLevel: 9 })
        .toFile(path.join(splashDirectory, "splashscreen_logo.png"));
    }
  }
  console.log("Generated SVG, app PNGs, 4096px master, Play Store PNG, ICO and Android launcher/splash resources.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });

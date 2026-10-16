/** Review-only GIF. The app renders SVG bars with native Animated transforms. */
const fs = require("node:fs/promises");
const path = require("node:path");
const sharp = require("sharp");
const bars = require("../assets/branding/mavrixfy-bars.json");
const motion = require("../assets/branding/launch-motion.json");
const app = require("../app.json").expo;
const splash = app.plugins.find(plugin => Array.isArray(plugin) && plugin[0] === "expo-splash-screen")[1];
const branding = path.resolve(__dirname, "../assets/branding");
const width = 390, height = 844;
const revealEnd = (bars.length - 1) * motion.staggerMs + motion.barDurationMs;
const fadeStart = revealEnd + motion.settleMs;
const duration = fadeStart + motion.fadeMs;
const clamp = value => Math.max(0, Math.min(1, value));
const outCubic = value => 1 - (1 - value) ** 3;
const inOutCubic = value => value < .5 ? 4 * value ** 3 : 1 - (-2 * value + 2) ** 3 / 2;

function svgAt(time, defs) {
  const opacity = 1 - inOutCubic(clamp((time - fadeStart) / motion.fadeMs));
  const lines = bars.map((bar, index) => {
    const progress = outCubic(clamp((time - index * motion.staggerMs) / motion.barDurationMs));
    const scale = progress < motion.overshootAt
      ? motion.initialScaleY + (motion.overshootScaleY - motion.initialScaleY) * progress / motion.overshootAt
      : motion.overshootScaleY + (1 - motion.overshootScaleY) * (progress - motion.overshootAt) / (1 - motion.overshootAt);
    const rise = motion.rise * 1024 / splash.imageWidth * (1 - progress);
    const alpha = clamp(progress / motion.opacityAt);
    const center = bar.y + bar.height / 2;
    return `<g opacity="${alpha}" transform="translate(0 ${rise})"><g transform="translate(0 ${center}) scale(1 ${scale}) translate(0 ${-center})"><rect x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}" rx="${bar.rx}" fill="url(#bar${index})"/></g></g>`;
  }).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${defs}<rect width="100%" height="100%" fill="#121212"/><g opacity="${opacity}"><rect width="100%" height="100%" fill="${splash.backgroundColor}"/><g transform="translate(${(width-splash.imageWidth)/2} ${(height-splash.imageWidth)/2}) scale(${splash.imageWidth/1024})">${lines}</g></g></svg>`);
}

async function main() {
  const master = await fs.readFile(path.join(branding, "mavrixfy-mark.svg"), "utf8");
  const defs = master.match(/<defs>[\s\S]*?<\/defs>/)[0];
  const frames = [], delay = [];
  for (let time = 0; time <= duration + 40; time += 20) {
    frames.push(await sharp(svgAt(time, defs)).ensureAlpha().raw().toBuffer());
    delay.push(20);
  }
  delay[delay.length - 1] = 700;
  await sharp(Buffer.concat(frames), { raw: { width, height: height * frames.length, channels: 4, pageHeight: height } })
    .gif({ delay, loop: 0, dither: 0, effort: 7 }).toFile(path.join(branding, "mavrixfy-launch-preview.gif"));
  const moments = [0, 160, 320, 500, fadeStart];
  const shots = await Promise.all(moments.map(async (time, index) => ({
    input: await sharp(svgAt(time, defs)).resize(195, 422).png().toBuffer(), left: index * 195, top: 0,
  })));
  await fs.mkdir(path.resolve(__dirname, "../.expo"), { recursive: true });
  await sharp({ create: { width: 975, height: 422, channels: 3, background: splash.backgroundColor } })
    .composite(shots).png().toFile(path.resolve(__dirname, "../.expo/launch-line-frames.png"));
  console.log(`Generated ${duration}ms waveform reveal preview; GIF repeats for review only.`);
}

main().catch(error => { console.error(error); process.exitCode = 1; });

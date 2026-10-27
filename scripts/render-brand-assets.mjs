/**
 * 브랜드/예시 이미지 렌더링: assets-src/*.svg → PNG (sharp). 외부 API·키 불필요, 결정적 출력.
 * 실행: node scripts/render-brand-assets.mjs
 */
import { readFileSync, mkdirSync } from "node:fs";
import sharp from "sharp";

const src = (name) => readFileSync(new URL(`../assets-src/${name}`, import.meta.url));
const out = (p) => new URL(`../${p}`, import.meta.url).pathname;
const BLUE = "#1D53D6";
const png = { compressionLevel: 9, palette: true, quality: 90, effort: 10 };

mkdirSync(out("mobile/assets"), { recursive: true });

// 1) 로그인 히어로 1600x1200
await sharp(src("login-hero.svg"), { density: 72 }).resize(1600, 1200).png({ compressionLevel: 9, palette: true, quality: 100, colours: 256, dither: 1, effort: 10 }).toFile(out("public/img/login-hero.png"));
// 2) 빈 상태 480x384 (투명 배경)
await sharp(src("empty-state.svg"), { density: 72 }).resize(480, 384).png({ ...png, colours: 128 }).toFile(out("public/img/empty-state.png"));

// 3) 마크 기반 에셋
const W = "M14 19l8 27h7l3-13 3 13h7l8-27h-8l-4 16-3-13h-6l-3 13-4-16z";
const mark = (size, { bg, scale, dot = true }) => {
  const s = (size * scale) / 64; // 마크 64 단위 → px
  const off = (size - 64 * s) / 2;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
    ${bg ? `<rect width="${size}" height="${size}" fill="${bg}"/>` : ""}
    <g transform="translate(${off} ${off}) scale(${s})"><path d="${W}" fill="#fff"/>${dot ? `<circle cx="50" cy="15" r="4.5" fill="#F2C14E"/>` : ""}</g></svg>`);
};
await sharp(mark(1024, { bg: BLUE, scale: 0.62 }), { density: 72 }).png(png).toFile(out("mobile/assets/icon.png"));
await sharp(mark(1024, { bg: null, scale: 0.46 }), { density: 72 }).png(png).toFile(out("mobile/assets/adaptive-icon.png"));
const splashMark = await sharp(mark(820, { bg: null, scale: 0.9 }), { density: 72 }).png().toBuffer();
await sharp({ create: { width: 1284, height: 2778, channels: 4, background: BLUE } })
  .composite([{ input: splashMark, left: (1284 - 820) / 2, top: Math.round((2778 - 820) / 2) }])
  .png(png).toFile(out("mobile/assets/splash.png"));

// 4) OG 이미지 1200x630: 좌측 파랑 + 마크, 우측 히어로 일러스트
const hero = await sharp(src("login-hero.svg"), { density: 72 }).resize(840, 630, { fit: "cover", position: "centre" }).png().toBuffer();
const ogMark = await sharp(mark(300, { bg: null, scale: 0.9 }), { density: 72 }).png().toBuffer();
await sharp({ create: { width: 1200, height: 630, channels: 4, background: BLUE } })
  .composite([{ input: hero, left: 360, top: 0 }, { input: ogMark, left: 30, top: 165 }])
  .png(png).toFile(out("public/og-image.png"));
console.log("done");

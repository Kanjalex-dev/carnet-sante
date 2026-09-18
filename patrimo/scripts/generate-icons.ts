/**
 * Genere les icones PWA a partir d'un SVG unique.
 *
 * iOS exige des PNG opaques pour l'icone d'ecran d'accueil : une icone
 * transparente y apparait sur fond noir. On aplatit donc systematiquement sur
 * la couleur de fond, et l'icone "maskable" garde 20 % de marge pour survivre au
 * rognage circulaire d'Android.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

const OUT_DIR = path.join(process.cwd(), 'public', 'icons');
const BACKGROUND = '#205aa0';

function svg(size: number, padding: number): string {
  const inner = size - padding * 2;
  const barWidth = inner * 0.14;
  const gap = inner * 0.08;
  const baseline = padding + inner * 0.82;
  const heights = [0.34, 0.55, 0.42, 0.74];
  const startX = padding + inner * 0.1;

  const bars = heights
    .map((h, i) => {
      const x = startX + i * (barWidth + gap);
      const height = inner * h;
      return `<rect x="${x.toFixed(1)}" y="${(baseline - height).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${height.toFixed(1)}" rx="${(barWidth * 0.3).toFixed(1)}" fill="#ffffff" opacity="${(0.55 + i * 0.15).toFixed(2)}"/>`;
    })
    .join('');

  const arrowY = padding + inner * 0.28;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" fill="${BACKGROUND}"/>
  ${bars}
  <path d="M ${startX.toFixed(1)} ${(baseline - inner * 0.34).toFixed(1)}
           L ${(startX + inner * 0.22).toFixed(1)} ${(arrowY + inner * 0.18).toFixed(1)}
           L ${(startX + inner * 0.42).toFixed(1)} ${(arrowY + inner * 0.26).toFixed(1)}
           L ${(startX + inner * 0.7).toFixed(1)} ${arrowY.toFixed(1)}"
        fill="none" stroke="#ffffff" stroke-width="${(inner * 0.055).toFixed(1)}"
        stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  const targets = [
    { file: 'icon-192.png', size: 192, padding: 18 },
    { file: 'icon-512.png', size: 512, padding: 48 },
    { file: 'apple-touch-icon.png', size: 180, padding: 16 },
    // Marge plus large : Android rogne jusqu'a 20 % sur les icones maskable.
    { file: 'icon-maskable-512.png', size: 512, padding: 105 },
    { file: 'favicon-32.png', size: 32, padding: 3 },
  ];

  for (const target of targets) {
    const buffer = await sharp(Buffer.from(svg(target.size, target.padding)))
      .png()
      .flatten({ background: BACKGROUND })
      .toBuffer();
    await writeFile(path.join(OUT_DIR, target.file), buffer);
    console.log(`  ${target.file} (${target.size}x${target.size})`);
  }

  console.log(`\nIcones generees dans ${OUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

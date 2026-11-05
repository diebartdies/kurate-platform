#!/usr/bin/env node
'use strict';
/**
 * Genera las imágenes fuente para @capacitor/assets:
 *   assets/icon.png   1024x1024 (fondo #121212 + badge del favicon al 70% = safe zone)
 *   assets/splash.png 2732x2732 (fondo #0f0f1a de marca + badge centrado)
 * Fuente: public/favicon.svg (el icono oficial de KuraTe).
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'public', 'favicon.svg'));
const outDir = path.join(root, 'assets');
fs.mkdirSync(outDir, { recursive: true });

(async () => {
  // --- Icono launcher: 1024x1024, fondo solido #121212 (igual que el badge,
  //     asi el borde redondeado del SVG es invisible) + badge al 70% ---
  const iconBadge = await sharp(svg).resize(716, 716).png().toBuffer();
  await sharp({
    create: { width: 1024, height: 1024, channels: 4, background: { r: 18, g: 18, b: 18, alpha: 1 } },
  })
    .composite([{ input: iconBadge, gravity: 'center' }])
    .png()
    .toFile(path.join(outDir, 'icon.png'));

  // --- Splash: 2732x2732, fondo #0f0f1a (color del splash/status bar) + badge centrado ---
  const splashBadge = await sharp(svg).resize(760, 760).png().toBuffer();
  await sharp({
    create: { width: 2732, height: 2732, channels: 4, background: { r: 15, g: 15, b: 26, alpha: 1 } },
  })
    .composite([{ input: splashBadge, gravity: 'center' }])
    .png()
    .toFile(path.join(outDir, 'splash.png'));

  for (const f of ['icon.png', 'splash.png']) {
    const s = fs.statSync(path.join(outDir, f));
    const meta = await sharp(path.join(outDir, f)).metadata();
    console.log(`${f}: ${meta.width}x${meta.height} ${(s.size / 1024).toFixed(0)} KB`);
  }
  console.log('assets generados en', outDir);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Genera los favicons web a partir de public/images/apk_white1.png
 * (el mismo arte que usa el icono de la APK).
 *
 * Salidas en public/:
 *   favicon-32.png, favicon-192.png, apple-touch-icon.png, favicon.ico
 *
 * El PNG original es 92x76 con fondo blanco: se centra sobre un lienzo
 * cuadrado blanco para no deformarlo (el icono Android si se estiraba).
 *
 * Uso: node scripts/generate-favicons.js
 */
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const SOURCE = path.join(PUBLIC, 'images', 'apk_white1.png');

// Lienzo cuadrado con el logo centrado y un margen del 6%.
const BG = { r: 255, g: 255, b: 255, alpha: 1 };

async function squareCanvas(size) {
    const pad = Math.round(size * 0.06);
    const inner = size - pad * 2;
    const logo = await sharp(SOURCE)
        .resize({ width: inner, height: inner, fit: 'inside', withoutEnlargement: false })
        .png()
        .toBuffer();
    return sharp({
        create: { width: size, height: size, channels: 4, background: BG }
    })
        .composite([{ input: logo, gravity: 'center' }])
        .png()
        .toBuffer();
}

/** ICO con entradas PNG (soportado por todos los navegadores modernos). */
function buildIco(entries) {
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);       // reserved
    header.writeUInt16LE(1, 2);       // type: icon
    header.writeUInt16LE(entries.length, 4);

    const dir = Buffer.alloc(16 * entries.length);
    let offset = header.length + dir.length;
    entries.forEach((entry, i) => {
        const base = i * 16;
        dir.writeUInt8(entry.size >= 256 ? 0 : entry.size, base);      // width
        dir.writeUInt8(entry.size >= 256 ? 0 : entry.size, base + 1);  // height
        dir.writeUInt8(0, base + 2);   // palette
        dir.writeUInt8(0, base + 3);   // reserved
        dir.writeUInt16LE(1, base + 4);  // color planes
        dir.writeUInt16LE(32, base + 6); // bits per pixel
        dir.writeUInt32LE(entry.data.length, base + 8);
        dir.writeUInt32LE(offset, base + 12);
        offset += entry.data.length;
    });

    return Buffer.concat([header, dir, ...entries.map(e => e.data)]);
}

async function main() {
    if (!fs.existsSync(SOURCE)) {
        console.error('No existe ' + SOURCE);
        process.exit(1);
    }

    const targets = [
        { file: 'favicon-32.png', size: 32 },
        { file: 'favicon-192.png', size: 192 },
        { file: 'apple-touch-icon.png', size: 180 }
    ];

    for (const t of targets) {
        const buffer = await squareCanvas(t.size);
        fs.writeFileSync(path.join(PUBLIC, t.file), buffer);
        console.log('OK ' + t.file + ' (' + buffer.length + ' bytes)');
    }

    const icoEntries = [];
    for (const size of [16, 32, 48]) {
        icoEntries.push({ size, data: await squareCanvas(size) });
    }
    const ico = buildIco(icoEntries);
    fs.writeFileSync(path.join(PUBLIC, 'favicon.ico'), ico);
    console.log('OK favicon.ico (' + ico.length + ' bytes, 16/32/48)');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

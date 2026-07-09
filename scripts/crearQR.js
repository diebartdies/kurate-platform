#!/usr/bin/env node
/**
 * Genera un PNG con código QR para una URL (sin dependencias npm extra).
 * Uso: node scripts/crearQR.js "https://..." [salida.png]
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

function normalizeUrl(raw) {
    let url = String(raw || '').trim();
    if (!url) return '';

    const dupMatch = url.match(/^(https?:\/\/[^/]+\/in\/[^/]+?)(?:linkedin\.com\/in\/[^/]+)$/i);
    if (dupMatch) url = dupMatch[1];

    if (!/^https?:\/\//i.test(url)) {
        url = `https://${url.replace(/^\/+/, '')}`;
    }
    if (/^https?:\/\/linkedin\.com/i.test(url)) {
        url = url.replace(/^https?:\/\//i, 'https://www.');
    }
    return url;
}

function downloadQrPng(targetUrl, outPath) {
    const apiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&margin=2&data=${encodeURIComponent(targetUrl)}`;

    return new Promise((resolve, reject) => {
        https.get(apiUrl, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`QR API respondió HTTP ${res.statusCode}`));
                res.resume();
                return;
            }

            const chunks = [];
            res.on('data', (chunk) => chunks.push(chunk));
            res.on('end', () => {
                fs.writeFileSync(outPath, Buffer.concat(chunks));
                resolve(outPath);
            });
        }).on('error', reject);
    });
}

async function main() {
    const rawUrl = process.argv[2];
    if (!rawUrl) {
        console.error('Uso: node scripts/crearQR.js "<url>" [archivo.png]');
        process.exit(1);
    }

    const url = normalizeUrl(rawUrl);
    const defaultName = `qr-${url.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 48)}.png`;
    const outPath = path.resolve(process.argv[3] || path.join(__dirname, '..', defaultName));

    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    await downloadQrPng(url, outPath);

    console.log('URL (normalizada):', url);
    console.log('QR guardado en:', outPath);
}

main().catch((err) => {
    console.error(err.message || err);
    process.exit(1);
});

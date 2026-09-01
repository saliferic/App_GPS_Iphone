/* Boîte alpha d'une image ANIMÉE (webp/gif) : union sur TOUTES les frames.
   ⚠ drawImage() ne rend que la première frame d'un webp animé dans Chromium — la boîte
   mesurée par tools/_alpha-bbox.js est donc celle de la frame 1 seulement. On passe ici
   par WebCodecs (ImageDecoder), seule API qui donne accès à chaque frame.
   Mêmes garde-fous que _alpha-bbox.js : seuil alpha 64, MIN_PIXELS par ligne/colonne.

   Usage : node tools/_bbox-anim.js <fichier.webp> [...] */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const MIN_PIXELS = 4;
(async () => {
    const fichiers = process.argv.slice(2);
    if (!fichiers.length) { console.error('Usage : node tools/_bbox-anim.js <fichier.webp> [...]'); process.exit(1); }
    const nav = await chromium.launch();
    const page = await nav.newPage();
    await page.goto(require('url').pathToFileURL(path.resolve('index.html')).href);
    for (const f of fichiers) {
        const b64 = fs.readFileSync(path.resolve(f)).toString('base64');
        const type = f.toLowerCase().endsWith('.gif') ? 'image/gif' : 'image/webp';
        const r = await page.evaluate(async ([b64, type, minPx]) => {
            if (typeof ImageDecoder === 'undefined') return { erreur: 'ImageDecoder absent' };
            const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
            const dec = new ImageDecoder({ data: bin, type });
            await dec.tracks.ready;
            await dec.completed;
            const n = dec.tracks.selectedTrack.frameCount;
            let X0 = 1e9, Y0 = 1e9, X1 = -1, Y1 = -1, W = 0, H = 0;
            const c = document.createElement('canvas');
            const ctx = c.getContext('2d');
            for (let i = 0; i < n; i++) {
                const { image } = await dec.decode({ frameIndex: i });
                W = image.displayWidth; H = image.displayHeight;
                c.width = W; c.height = H;
                ctx.clearRect(0, 0, W, H);
                ctx.drawImage(image, 0, 0);
                const d = ctx.getImageData(0, 0, W, H).data;
                const L = new Array(H).fill(0), C = new Array(W).fill(0);
                for (let y = 0; y < H; y++) for (let x = 0; x < W; x++)
                    if (d[(y * W + x) * 4 + 3] > 64) { L[y]++; C[x]++; }
                const pre = t => t.findIndex(v => v >= minPx);
                const der = t => { for (let k = t.length - 1; k >= 0; k--) if (t[k] >= minPx) return k; return -1; };
                const y0 = pre(L), y1 = der(L), x0 = pre(C), x1 = der(C);
                if (x1 < 0) continue;
                X0 = Math.min(X0, x0); Y0 = Math.min(Y0, y0); X1 = Math.max(X1, x1); Y1 = Math.max(Y1, y1);
                image.close();
            }
            return { n, canvas: W, x: X0, y: Y0, w: X1 - X0 + 1, h: Y1 - Y0 + 1 };
        }, [b64, type, MIN_PIXELS]);
        if (r.erreur) { console.log(`${f} — ${r.erreur}`); continue; }
        const k = 512 / r.canvas, e = v => Math.round(v * k);
        console.log(`${f}\n  canevas ${r.canvas}, ${r.n} frames → boite: { x: ${e(r.x)}, y: ${e(r.y)}, w: ${e(r.w)}, h: ${e(r.h)} }`);
    }
    await nav.close();
})();

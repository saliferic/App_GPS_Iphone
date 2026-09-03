/* Boîte alpha réelle d'une image, mesurée DANS LE NAVIGATEUR — donc sur le fichier tel
   qu'il sera rendu.

   ⚠ IMAGES FIXES SEULEMENT (01/09/2026). Sur un webp animé, `drawImage()` ne rend JAMAIS
   que la PREMIÈRE frame : la boîte obtenue est celle d'une pose, pas celle de l'animation.
   Les trois compagnons animés y ont perdu trompe, oreille ou tête dès qu'ils bougeaient,
   le `viewBox` du marqueur découpant tout ce qui sortait de cette boîte-là. Pour un
   fichier animé, utiliser `tools/_bbox-anim.js`, qui décode chaque frame.
   Sert à caler les compagnons dans js/22 : `boite`, puis x/y/taille par la formule
   SOL_Y / CENTRE_X.

   Usage : node tools/_alpha-bbox.js <fichier> [autres fichiers…]

   ⚠ DEUX GARDE-FOUS, ET ILS COMPTENT (31/08/2026). Mesurer « le premier pixel dont
   l'alpha dépasse 64 » donnait une boîte fausse sur Hippo.webp : le fichier porte
   quelques pixels isolés à peine visibles tout en haut du canevas, à 50 px au-dessus
   de la tête. La boîte grandissait d'autant, l'animal était mis à l'échelle sur du
   vide, et il se retrouvait deux fois trop petit dans sa vignette.
     · SEUIL : alpha > 64, celui du reste de la table ;
     · MASSE : une ligne (ou une colonne) ne compte que si elle porte au moins
       MIN_PIXELS pixels opaques — un grain de poussière n'est pas un bord. */
const { chromium } = require('playwright');
const path = require('path');

const MIN_PIXELS = 4;

(async () => {
    const fichiers = process.argv.slice(2);
    if (!fichiers.length) {
        console.error('Usage : node tools/_alpha-bbox.js <fichier.png|webp> [...]');
        process.exit(1);
    }
    const nav = await chromium.launch({ channel: 'chrome', args: ['--allow-file-access-from-files'] });
    const page = await nav.newPage();
    await page.goto('file://' + path.resolve('index.html'));
    for (const f of fichiers) {
        const r = await page.evaluate(async ([src, minPx]) => {
            const img = new Image();
            img.src = src;
            await img.decode();
            const c = document.createElement('canvas');
            c.width = img.naturalWidth; c.height = img.naturalHeight;
            const ctx = c.getContext('2d');
            ctx.drawImage(img, 0, 0);
            const d = ctx.getImageData(0, 0, c.width, c.height).data;
            const parLigne = new Array(c.height).fill(0);
            const parCol   = new Array(c.width).fill(0);
            for (let y = 0; y < c.height; y++)
                for (let x = 0; x < c.width; x++)
                    if (d[(y * c.width + x) * 4 + 3] > 64) { parLigne[y]++; parCol[x]++; }
            const premier = (t) => t.findIndex(n => n >= minPx);
            const dernier = (t) => { for (let i = t.length - 1; i >= 0; i--) if (t[i] >= minPx) return i; return -1; };
            const y0 = premier(parLigne), y1 = dernier(parLigne);
            const x0 = premier(parCol),   x1 = dernier(parCol);
            return { canvas: c.width, x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
        }, ['./' + f, MIN_PIXELS]);
        // Rendu à l'échelle 512 de la table de js/22, quel que soit le canevas source.
        const k = 512 / r.canvas;
        const e = (v) => Math.round(v * k);
        console.log(`${f}\n  canevas ${r.canvas} → boite: { x: ${e(r.x)}, y: ${e(r.y)}, w: ${e(r.w)}, h: ${e(r.h)} }`);
    }
    await nav.close();
})();

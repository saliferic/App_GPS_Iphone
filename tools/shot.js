/* Capture une page locale en PNG, pour pouvoir REGARDER un rendu au lieu de le
   deviner à partir des coordonnées. Outil de dev uniquement — jamais embarqué.

   Usage : node tools/shot.js <fichier.html> <sortie.png> [largeur] [hauteur] */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const [, , src, out, w = 520, h = 520, echelle = 1] = process.argv;
    if (!src || !out) {
        console.error('Usage : node tools/shot.js <fichier.html> <sortie.png> [l] [h] [échelle]');
        process.exit(1);
    }
    const navigateur = await chromium.launch({ channel: 'chrome' });
    const page = await navigateur.newPage({ viewport: { width: +w, height: +h }, deviceScaleFactor: +echelle });
    await page.goto(new URL('file://' + path.resolve(src)).href);
    await page.waitForTimeout(400);
    await page.screenshot({ path: out });
    await navigateur.close();
    console.log('→ ' + out);
})();

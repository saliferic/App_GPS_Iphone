/* Contrôle de cadrage : aucun compagnon ne doit déborder du viewBox commun.

   Trois y ont été coupés sans que personne le voie — le sommet d'une crinière,
   des ossicônes, des oreilles. Un dessin tronqué ne casse rien et ne lève aucune
   erreur : il manque juste un bout, discrètement, sur tous les écrans.

   Le viewBox « 6 42 308 330 » a été calé sur Babi ; rien ne garantit qu'un
   nouvel animal y tienne. À relancer après chaque ajout de compagnon.

   ⚠ AVEUGLE AUX COMPAGNONS EN IMAGE (26/08/2026), c'est-à-dire à TOUS
   aujourd'hui : `getBBox()` sur un `<image>` renvoie le carré complet du PNG,
   marges transparentes comprises, et non les pixels visibles. Les sept y
   ressortent donc « DEBORDE » sans déborder réellement — ne pas recadrer sur
   la foi de cette sortie. Le cadrage d'une image se contrôle sur sa boîte
   englobante ALPHA (seuil 64 : plus bas, les pixels parasites laissés par le
   réencodage élargissent la boîte d'une centaine de pixels). L'outil ne sert
   donc plus que si un futur compagnon revient à un tracé SVG.

   Usage : node tools/verif-cadrage.js
   Outil de dev uniquement, jamais embarqué. */

const { chromium } = require('playwright');
const path = require('path');

const VB = { x: 6, y: 42, x2: 314, y2: 372 };

(async () => {
    const navigateur = await chromium.launch();
    const page = await navigateur.newPage({ viewport: { width: 500, height: 500 } });
    await page.goto(new URL('file://' + path.resolve(__dirname, '../experiments/apercu-babi.html')).href);
    await page.waitForTimeout(500);

    const mesures = await page.evaluate(() => {
        const out = [];
        Compagnon.catalogue().filter(c => c.debloque).forEach(c => {
            Compagnon.choisir(c.cle);
            const d = document.createElement('div');
            d.style.cssText = 'position:absolute;width:300px';
            document.body.appendChild(d);
            d.innerHTML = Compagnon.dessin('repos');
            const bb = d.querySelector('svg').getBBox();
            out.push({
                cle: c.cle,
                x: +bb.x.toFixed(0), y: +bb.y.toFixed(0),
                x2: +(bb.x + bb.width).toFixed(0), y2: +(bb.y + bb.height).toFixed(0)
            });
            d.remove();
        });
        return out;
    });
    await navigateur.close();

    console.log(`viewBox : x ${VB.x}..${VB.x2}   y ${VB.y}..${VB.y2}\n`);
    const rates = [];
    mesures.forEach(o => {
        const ok = o.x >= VB.x && o.x2 <= VB.x2 && o.y >= VB.y && o.y2 <= VB.y2;
        if (!ok) rates.push(o.cle);
        console.log(`  ${o.cle.padEnd(6)} x ${String(o.x).padStart(4)}..${String(o.x2).padStart(3)}`
                  + `  y ${String(o.y).padStart(4)}..${String(o.y2).padStart(3)}   ${ok ? 'OK' : 'DEBORDE'}`);
    });

    if (rates.length) {
        console.error(`\n${rates.length} compagnon(s) debordent : ${rates.join(', ')}`);
        process.exit(1);
    }
    console.log('\nTous les compagnons tiennent dans le viewBox.');
})();

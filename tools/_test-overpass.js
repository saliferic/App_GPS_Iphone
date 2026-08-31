/* Chronomètre les miroirs Overpass DANS LE NAVIGATEUR, page chargée en `file://` —
   c'est-à-dire dans les conditions exactes de l'app empaquetée en APK.

   ⚠ C'EST LE SEUL BANC D'ESSAI VALABLE POUR CE SUJET. Mesurer avec `curl` ou node ne
   dit rien d'utile : ils ignorent CORS et peuvent poser `User-Agent`, deux contraintes
   qui décident à elles seules du miroir qui répond. Le 01/09/2026, node voyait quatre
   miroirs répondre là où le navigateur n'en voyait qu'un.

   Usage : node tools/_test-overpass.js [budget_ms]  (défaut 60000)
   Il interroge la liste EV_MIRRORS de js/19, telle qu'elle est chargée par l'app. */
const { chromium } = require('playwright');
const path = require('path');

(async () => {
    const budget = +(process.argv[2] || 60000);
    const nav = await chromium.launch();
    const page = await nav.newPage();
    await page.goto('file://' + path.resolve('index.html'));
    await page.waitForTimeout(2000);
    const res = await page.evaluate(async ([budget]) => {
        // Bbox Perpignan centre : la même que le scan parkings à 1,5 km.
        const q = '[out:json][timeout:20];nwr["amenity"="parking"]["access"!="private"]["access"!="no"](42.6800,2.8600,42.7100,2.9200);out center tags;';
        const sorties = [];
        for (const url of EV_MIRRORS) {
            const t = Date.now();
            try {
                const r = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: 'data=' + encodeURIComponent(q),
                    signal: AbortSignal.timeout(budget),
                });
                const j = r.ok ? await r.json() : null;
                sorties.push({ hote: url.split('/')[2], statut: r.status,
                               s: ((Date.now() - t) / 1000).toFixed(1),
                               elements: j ? (j.elements || []).length : null });
            } catch (e) {
                sorties.push({ hote: url.split('/')[2], statut: 'ÉCHEC',
                               s: ((Date.now() - t) / 1000).toFixed(1), err: e.message });
            }
        }
        return sorties;
    }, [budget]);
    res.forEach(r => console.log(
        r.hote.padEnd(28), String(r.statut).padEnd(6), (r.s + 's').padStart(7),
        (r.elements === null || r.elements === undefined) ? (r.err || '') : `${r.elements} éléments`));
    console.log('\n⚠ Un miroir qui rend 200 avec 0 élément n\'est pas forcément bon :\n'
              + '  vérifier sa couverture (overpass.osm.ch ne contient que la Suisse).');
    await nav.close();
})();

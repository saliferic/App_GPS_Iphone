/* Rejoue le scan parkings de bout en bout (requête réelle + _fetchOverpassHedged),
   dans le navigateur en file://. Sert à distinguer « l'app est cassée » de « les
   miroirs Overpass sont dans un mauvais jour ». Usage : node tools/_test-parkings.js */
const { chromium } = require('playwright');
const path = require('path');
(async () => {
    const nav = await chromium.launch();
    const page = await nav.newPage();
    await page.goto('file://' + path.resolve('index.html'));
    await page.waitForTimeout(2000);
    const r = await page.evaluate(async () => {
        const q = '[out:json][timeout:20];nwr["amenity"="parking"]["access"!="private"]["access"!="no"](42.6800,2.8600,42.7100,2.9200);out center tags;';
        const t = Date.now();
        try {
            const d = await _fetchOverpassHedged(q, { exigerResultat: true });
            return { ok: true, n: (d.elements || []).length, s: ((Date.now() - t) / 1000).toFixed(1) };
        } catch (e) { return { ok: false, err: e.message, s: ((Date.now() - t) / 1000).toFixed(1) }; }
    });
    console.log(r.ok ? `✔ ${r.n} parkings en ${r.s}s` : `✘ échec en ${r.s}s — ${r.err}`);
    await nav.close();
})();

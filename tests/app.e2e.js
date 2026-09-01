/* ═══════════════════════════════════════════════════════════════════════════════
   TESTS DE L'APPLICATION DANS UN VRAI NAVIGATEUR — `node tests/app.e2e.js`

   Complément de `noyau.test.js`, pas son remplaçant. Le noyau teste du calcul pur
   en une seconde ; ici on ouvre l'app entière dans Chrome, avec sa carte, son DOM
   et son localStorage, pour vérifier ce qu'aucune fonction pure ne peut dire :
   que les morceaux tiennent ensemble.

   ⚠⚠ CE QUE CE HARNAIS NE VERRA JAMAIS — à lire avant de lui faire confiance.
   Chrome de bureau n'est PAS la WebView Android de l'APK. Les trois bugs corrigés
   le 15/08/2026 lui auraient tous échappé :
     — `loadVehicleConfig is not defined` ne se produit que parce que
       `file:///android_asset/` charge assez lentement pour que l'analyseur rende la
       main entre deux <script> ; en local les fichiers sont déjà là ;
     — le cadrage dépend de la hauteur RÉELLE du canevas, des barres système et de
       fix GPS continus ;
     — les permissions d'iframe en file:// (origine opaque).
   AGENTS.md le répète à chaque section : « écart que le simulateur ne reproduit
   pas ». Un test vert ici ne dispense donc PAS d'un essai sur l'appareil. Ce qu'il
   attrape, en revanche, il l'attrape en trois secondes et sans rebâtir un APK :
   débordements de mise en page, exceptions au chargement, cadrage aberrant.

   POURQUOI UN SERVEUR HTTP ET PAS `file://`. Chrome refuse de déléguer la
   géolocalisation à une origine opaque (AGENTS.md, « Compatibilité navigateurs »).
   Sans position simulée, aucun trajet ne part. On sert donc le dossier sur
   127.0.0.1 — avec le module `http` de Node, sans dépendance ajoutée.

   POURQUOI LE CHROME DU SYSTÈME (`channel: 'chrome'`). Évite les ~150 Mo de
   Chromium que Playwright télécharge sinon, et teste le moteur réellement installé.
   ═══════════════════════════════════════════════════════════════════════════════ */

const http = require('http');
const fs   = require('fs');
const path = require('path');

const RACINE = path.join(__dirname, '..');

/* Géométrie du Pixel 9A, reprise des relevés d'appareil du 15/08/2026
   (« rect »: 411x842, « dpr »: 2.625). Tester dans une autre fenêtre que celle
   des journaux rendrait les comparaisons de zoom incomparables. */
/* ⚠ `viewport`, PAS `width`/`height` à la racine. Playwright ignore silencieusement
   ces deux clés-là : le contexte retombe sur 1280x720, c'est-à-dire du PAYSAGE. Le
   harnais a passé sa première version à mesurer l'orientation qui n'a justement pas
   le défaut cherché, en annonçant du portrait. Seule la capture d'écran l'a trahi
   (3360x1890 = 1280x720 x 2,625). Toute modification de ce bloc se vérifie sur
   l'image produite, jamais sur la seule intention. */
const APPAREIL = {
    viewport: { width: 411, height: 841 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
};

// Position de départ simulée : Courbevoie, celle des captures d'écran de mise au point.
const GPS_DEPART = { latitude: 48.8973, longitude: 2.2560 };

// ── Micro-harnais, identique à celui de noyau.test.js ───────────────────────────
let reussis = 0;
const echecs = [];
let sectionCourante = '';
const section = (t) => { sectionCourante = t; };

function verifie(intitule, obtenu, attendu) {
    const a = JSON.stringify(attendu), o = JSON.stringify(obtenu);
    if (a === o) { reussis++; return; }
    echecs.push({ section: sectionCourante, intitule, attendu: a, obtenu: o });
}
function verifieVrai(intitule, condition, detail = '') {
    if (condition) { reussis++; return; }
    echecs.push({ section: sectionCourante, intitule, attendu: 'vrai', obtenu: 'faux' + (detail ? ' — ' + detail : '') });
}

// ── Serveur statique minimal ────────────────────────────────────────────────────
const TYPES = {
    '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',   '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml',
    '.ogg': 'audio/ogg', '.mp4': 'video/mp4', '.webp': 'image/webp',
};

function demarrerServeur() {
    const serveur = http.createServer((req, res) => {
        // On ne sert que sous la racine : `decodeURIComponent` puis `path.normalize`
        // empêchent un `..` de remonter ailleurs sur le disque.
        const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
        const abs = path.join(RACINE, path.normalize(rel).replace(/^(\.\.[\\/])+/, ''));
        if (!abs.startsWith(RACINE)) { res.writeHead(403); res.end(); return; }
        fs.readFile(abs, (err, data) => {
            if (err) { res.writeHead(404); res.end('introuvable'); return; }
            res.writeHead(200, { 'Content-Type': TYPES[path.extname(abs).toLowerCase()] || 'application/octet-stream' });
            res.end(data);
        });
    });
    return new Promise((ok) => serveur.listen(0, '127.0.0.1', () => ok(serveur)));
}

// ════════════════════════════════════════════════════════════════════════════════
(async function main() {
    let chromium;
    try { ({ chromium } = require('playwright')); }
    catch (e) {
        console.error("✘ Playwright absent. Installe-le : npm install --save-dev playwright");
        process.exit(1);
    }

    const serveur = await demarrerServeur();
    const base = `http://127.0.0.1:${serveur.address().port}`;

    /* Mode visible : `npm run test:app:voir` ouvre une vraie fenêtre Chrome et ralentit
       chaque action, pour REGARDER le scénario se dérouler au lieu d'en lire le verdict.
       C'est le moyen le moins cher de comprendre un échec — aucune capture à analyser,
       l'œil suffit. Sans l'option, tout se passe en arrière-plan, bien plus vite.
       Un ARGUMENT et non une variable d'environnement : `VOIR=1 node …` en préfixe est
       une syntaxe de shell POSIX, que le `cmd.exe` derrière les scripts npm sous Windows
       ne comprend pas. */
    const visible = process.argv.includes('--voir');

    let navigateur;
    try {
        navigateur = await chromium.launch({
            channel: 'chrome',
            headless: !visible,
            slowMo: visible ? 250 : 0,
        });
    } catch (e) {
        console.error("✘ Chrome introuvable pour Playwright : " + e.message);
        serveur.close();
        process.exit(1);
    }

    const contexte = await navigateur.newContext({
        ...APPAREIL,
        locale: 'fr-FR',
        permissions: ['geolocation'],
        geolocation: GPS_DEPART,
        /* Chaque exécution repart d'un profil vierge : sans cela la séquence
           d'introduction (30 s) se joue par-dessus l'app à chaque lancement. Les mesures
           de mise en page restent justes — le DOM est calculé dessous — mais les captures
           ne montrent que l'intro, et tout clic serait intercepté par son voile.
           `reducedMotion` est la porte de sortie que l'app prévoit déjà
           (`prefers-reduced-motion` dans index.html) : préférable à l'écriture directe de
           `gps_intro_seen`, qui obligerait ce test à connaître le numéro de version de
           l'intro et à le suivre à chaque changement. */
        reducedMotion: 'reduce',
    });
    const page = await contexte.newPage();

    /* Les exceptions non rattrapées ne remontent pas dans le journal de l'app :
       elles n'atteignent jamais `logAppError`. On les collecte séparément, sinon un
       plantage au chargement passerait pour un simple test muet. */
    const exceptionsPage = [];
    page.on('pageerror', (e) => exceptionsPage.push(e.message));

    /* Requêtes refusées ou avortées. Deux usages :
       — un CDN épinglé dont l'empreinte SRI ne correspond plus n'aboutit pas ;
       — une future Content-Security-Policy trop étroite bloquerait des appels d'API,
         et cette liste nomme alors exactement les domaines qui manquent, au lieu de
         les faire découvrir écran par écran.
       Purement informatif : la liste n'échoue rien par elle-même, elle est imprimée
       en pièce jointe des échecs de la section « SDK externes ». */
    /* ⚠ LES ABANDONS SONT EXCLUS, SINON CE COLLECTEUR NE SERT À RIEN. Mapbox annule
       lui-même les tuiles devenues inutiles dès que la vue change : trois `ERR_ABORTED`
       par exécution, sur un domaine parfaitement autorisé. Les laisser noierait le seul
       cas qui compte — une requête réellement refusée — sous un bruit permanent qu'on
       finirait par ne plus lire. */
    const requetesEchouees = [];
    page.on('requestfailed', (r) => {
        const cause = (r.failure() && r.failure().errorText) || '?';
        if (cause.indexOf('ABORT') !== -1) return;
        requetesEchouees.push(r.url().slice(0, 100) + ' (' + cause + ')');
    });

    try {
        await page.goto(base + '/index.html', { waitUntil: 'load' });
        // La carte s'initialise en asynchrone ; sans elle, aucun cadrage n'a de sens.
        await page.waitForFunction(() => window.map && window.map.loaded && window.map.loaded(), null, { timeout: 30000 })
            .catch(() => {});
        await page.waitForTimeout(2500);

        // ── 1. Chargement ───────────────────────────────────────────────────────
        section('Chargement');
        verifie('aucune exception non rattrapée', exceptionsPage, []);

        /* L'intro doit avoir été écartée : si elle est encore là, tout ce qui suit
           mesure une app couverte par un voile plein écran, et les échecs qui en
           découleraient n'auraient aucun rapport avec ce qu'on croit tester. */
        verifie('séquence d’introduction écartée',
            await page.evaluate(() => !document.getElementById('intro')), true);

        const journal = await page.evaluate(() => {
            try { return JSON.parse(localStorage.getItem('gps_error_log') || '[]'); } catch (e) { return []; }
        });
        /* C'est ce test qui aurait signalé `loadVehicleConfig is not defined` SI le
           bureau reproduisait le défaut — il ne le fait pas (voir l'avertissement en
           tête). Il reste utile pour toute erreur d'initialisation non liée au
           chargement asynchrone des <script>. */
        verifie('journal d’erreurs vide au chargement',
            journal.map(e => e.ctx + ' : ' + e.msg), []);

        const globalesAttendues = ['map', 'calculateTripPreview', 'fitMapToModalRoute', '_cameraForBoundsSafe', 'loadVehicleConfig'];
        for (const nom of globalesAttendues) {
            const present = await page.evaluate((n) => typeof window[n] !== 'undefined', nom);
            verifieVrai(`« ${nom} » est défini`, present);
        }

        /* ── SDK EXTERNES : la vérification que l'épinglage SRI rend indispensable ──
           `index.html` charge turf et supabase-js en version EXACTE, avec une empreinte
           `integrity`. Si l'empreinte ne correspond plus au fichier servi (numéro de
           version changé sans recalcul, paquet republié), le navigateur rejette le script
           EN SILENCE : aucune exception, aucune ligne dans le journal de l'app, juste un
           global absent. Rien de ce qui précède ne l'aurait vu — d'où ces trois lignes.

           ⚠ Un CDN réellement injoignable (poste hors ligne, réseau filtrant) fait échouer
           cette section aussi. C'est voulu : mieux vaut un rouge explicite qu'un test vert
           obtenu sans les bibliothèques. `requetesEchouees` distingue les deux cas — une
           URL de CDN dans la liste désigne le réseau, une liste vide désigne l'empreinte. */
        section('SDK externes');
        for (const nom of ['turf', 'mapboxgl', 'supabase']) {
            const present = await page.evaluate((n) => typeof window[n] !== 'undefined', nom);
            verifieVrai(`SDK « ${nom} » chargé depuis son CDN`, present);
        }
        if (requetesEchouees.length) {
            console.log('  ℹ requêtes non abouties : ' + requetesEchouees.join(' | '));
        }

        // ── 2. Débordements de mise en page ─────────────────────────────────────
        /* LE TEST QUI AURAIT ATTRAPÉ L'ASCENSEUR HORIZONTAL du 15/08/2026 en une
           ligne, sans regarder une capture. Un `overflow-y: auto` posé seul rend
           l'axe horizontal défilant à son tour (la spec force `visible` à `auto`) :
           il suffit qu'un enfant dépasse pour qu'une barre apparaisse. */
        section('Mise en page');
        await page.evaluate(() => switchMainTab('trajet'));
        await page.waitForTimeout(600);
        await page.evaluate(() => setPanelSnap('full'));
        await page.waitForTimeout(600);

        const debordements = await page.evaluate(() => {
            const cibles = ['#ui-panel', '.panel-tab-content.active', '#trip-modal', 'body'];
            const trouves = [];
            for (const sel of cibles) {
                const el = document.querySelector(sel);
                if (!el || el.offsetParent === null && sel !== 'body') continue;
                // Tolérance de 1 px : un arrondi de sous-pixel n'est pas un débordement.
                if (el.scrollWidth > el.clientWidth + 1) {
                    trouves.push(`${sel} (${el.scrollWidth} > ${el.clientWidth})`);
                }
            }
            return trouves;
        });
        verifie('aucun débordement horizontal', debordements, []);
        // Le panneau déployé est l'état où le défaut se voyait : on le garde en image.
        await page.screenshot({ path: path.join(__dirname, 'panneau-itineraire.png') });

        // ── 3. Autozoom de l'aperçu de trajet ───────────────────────────────────
        /* Le scénario qui a occupé la journée : renseigner une destination, lancer,
           et vérifier que la carte cadre RÉELLEMENT le trajet. On lit `gps_diag_log`,
           le même journal que sur l'appareil, ce qui rend les deux comparables. */
        section('Autozoom de l’aperçu');
        await page.evaluate(() => localStorage.removeItem('gps_diag_log'));

        // Coordonnées posées directement : on teste le CADRAGE, pas le géocodeur.
        // Passer par la saisie ferait dépendre le test du réseau et de Mapbox.
        await page.evaluate(() => {
            document.getElementById('end-addr').value = 'Place de la Concorde, Paris';
            exactEndCoords = [2.3212, 48.8656];   // Concorde
            exactStartCoords = [2.2560, 48.8973]; // Courbevoie
            startAddrText = 'Courbevoie';
        });

        const zoomAvant = await page.evaluate(() => map.getZoom());
        await page.evaluate(() => openTripModal('real'));
        // L'itinéraire part chez Mapbox : on laisse le temps du réseau.
        await page.waitForTimeout(9000);

        const diag = await page.evaluate(() => {
            try { return JSON.parse(localStorage.getItem('gps_diag_log') || '[]'); } catch (e) { return []; }
        });
        const lignesFit = diag.filter(d => d.ctx === 'fit').map(d => JSON.parse(d.msg));

        if (lignesFit.length === 0) {
            /* Pas de trace « fit » = l'aperçu n'a pas cadré. Le plus souvent le réseau
               (pas d'itinéraire, donc pas de bornes). On le DIT au lieu de rendre un
               échec obscur : un test qui ne sait pas pourquoi il échoue ne sert à rien. */
            echecs.push({
                section: sectionCourante,
                intitule: 'aucun cadrage déclenché (réseau Mapbox indisponible ?)',
                attendu: 'au moins une trace « fit »',
                obtenu: JSON.stringify(diag.map(d => d.ctx)),
            });
        } else {
            const fit = lignesFit[lignesFit.length - 1];
            verifieVrai('le cadrage a été calculé (zVise ou zRepli disponible)',
                Number.isFinite(fit.zVise) || Number.isFinite(fit.zRepli),
                JSON.stringify({ zVise: fit.zVise, zRepli: fit.zRepli }));
            verifieVrai('les bornes sont consignées dans la trace',
                typeof fit.bornes === 'string' && fit.bornes.length > 4, String(fit.bornes));
            /* Le padding doit laisser une bande de carte exploitable : c'est
               exactement l'invariant que `_clampMapPadding()` garantit, vérifié ici
               sur les valeurs RÉELLES produites par la mise en page. */
            const bandeH = Math.round(fit.rect.split('x')[1]) - fit.pad.top - fit.pad.bottom;
            verifieVrai('bande de carte verticale >= 150 px', bandeH >= 150, 'bande = ' + Math.round(bandeH) + ' px');

            const zoomApres = await page.evaluate(() => map.getZoom());
            verifieVrai('la caméra a bougé (autozoom appliqué)',
                Math.abs(zoomApres - zoomAvant) > 0.05,
                `avant ${zoomAvant.toFixed(2)} → après ${zoomApres.toFixed(2)}`);
            verifieVrai('zoom final fini', Number.isFinite(zoomApres), String(zoomApres));
        }

        /* ── 4. NON-RÉGRESSION : padding résiduel de la boucle de suivi GPS ──────────
           LE bug du 15/08/2026, et le seul de la journée qu'un test de bureau pouvait
           attraper. La boucle de suivi pose un padding sur la caméra à chaque position
           (`jumpTo({ padding })`, 13-stats-eco.js) ; Mapbox l'AJOUTE à celui de
           `fitBounds`. Les deux réunis dépassaient la hauteur du canevas : bande utile
           négative, zoom non numérique, centre NaN.
           Ce test repose le padding fautif à la main puis relance un cadrage : sans la
           remise à zéro de fitMapToModalRoute(), `cameraForBounds` échoue à nouveau.
           On vérifie la MÉCANIQUE, pas seulement l'absence de symptôme. */
        section('Padding résiduel de la caméra');
        {
            /* Padding posé EN DUR, pas via getMapFollowPadding() : le modal étant ouvert,
               #ui-panel est masqué et cette fonction rendrait zéro. On reprend la valeur
               relevée sur appareil (461 px de bas sur 923 de haut) pour que le test
               reproduise l'état fautif quel que soit l'état de l'interface. */
            const r = await page.evaluate((bornes) => {
                const PAD_FIT = { top: 50, bottom: 473, left: 40, right: 40 };
                const sonder = () => {
                    try {
                        const c = map.cameraForBounds(bornes, { padding: PAD_FIT, maxZoom: 18, bearing: 0, pitch: 0 });
                        return c && Number.isFinite(c.zoom) ? +c.zoom.toFixed(2) : null;
                    } catch (e) { return null; }
                };
                map.jumpTo({ center: map.getCenter(), zoom: 10, padding: { top: 0, right: 0, bottom: 461, left: 0 } });
                const posePosee = map.getPadding();
                const zAvecResidu = sonder();
                map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 }); // le correctif
                const poseApres = map.getPadding();
                const zApresReset = sonder();
                return { posePosee, zAvecResidu, poseApres, zApresReset };
            }, [[2.211951, 48.726781], [2.346684, 48.902116]]); // bornes du relevé d'appareil

            verifieVrai('jumpTo inscrit bien le padding sur la caméra',
                r.posePosee.bottom === 461, JSON.stringify(r.posePosee));
            /* Le cœur du test : avec le padding résiduel, Mapbox DOIT échouer. Si ce jour
               vient où il n'échoue plus, ce test le signalera — et la remise à zéro
               deviendra peut-être inutile. Mieux vaut le savoir que le supposer. */
            verifie('padding résiduel + le nôtre ⇒ Mapbox ne sait plus cadrer', r.zAvecResidu, null);
            verifie('la remise à zéro efface le padding', r.poseApres, { top: 0, bottom: 0, left: 0, right: 0 });
            verifieVrai('après remise à zéro, le cadrage redevient calculable',
                Number.isFinite(r.zApresReset), String(r.zApresReset));
        }

        // Aucune erreur ne doit être apparue pendant l'aperçu — en particulier
        // « Invalid LngLat object: (NaN, NaN) », le symptôme suivi depuis le 14/08.
        const journalApres = await page.evaluate(() => {
            try { return JSON.parse(localStorage.getItem('gps_error_log') || '[]'); } catch (e) { return []; }
        });
        verifie('aucune erreur pendant l’aperçu',
            journalApres.map(e => e.ctx + ' : ' + e.msg), []);

        // Capture systématique : sur un échec de cadrage, l'image tranche en un coup
        // d'œil ce que trois nombres laisseraient discuter.
        await page.screenshot({ path: path.join(__dirname, 'apercu-trajet.png') });

    } catch (erreur) {
        echecs.push({ section: sectionCourante || 'Exécution', intitule: 'le scénario s’est interrompu', attendu: 'déroulement complet', obtenu: erreur.message });
    } finally {
        await navigateur.close();
        serveur.close();
    }

    // ── Verdict ─────────────────────────────────────────────────────────────────
    const total = reussis + echecs.length;
    if (echecs.length === 0) {
        console.log(`✔ ${reussis}/${total} vérifications réussies — application conforme dans Chrome.`);
        console.log('  ⚠ Rappel : Chrome de bureau ne reproduit pas la WebView Android. Voir l’en-tête.');
        process.exit(0);
    }
    console.error(`✘ ${echecs.length} échec(s) sur ${total} vérifications :\n`);
    for (const e of echecs) {
        console.error(`  [${e.section}] ${e.intitule}`);
        console.error(`      attendu : ${e.attendu}`);
        console.error(`      obtenu  : ${e.obtenu}\n`);
    }
    console.error(`  Capture : tests/apercu-trajet.png`);
    process.exit(1);
})();

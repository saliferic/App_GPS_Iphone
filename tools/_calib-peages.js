/* ═══════════════════════════════════════════════════════════════════════════════
   CALIBRATION DES PÉAGES PAR ORACLE HERE — `node tools/_calib-peages.js`

   Outil de MESURE, hors app. Rien ici n'est chargé par `index.html` ni empaqueté
   dans l'APK : le préfixe `_` suit la convention des autres sondes de `tools/`.

   ┌─ POURQUOI ─────────────────────────────────────────────────────────────────┐
   │ Le goulot d'étranglement de `docs/peages.md` n'a JAMAIS été le modèle, il a │
   │ toujours été la MESURE : six prix réels relevés à la main en trois semaines,│
   │ tous longs (155-850 km), tous à une seule entrée par réseau. Les deux cas   │
   │ ouverts du 04/09/2026 sont précisément ceux que cet échantillon ne couvrait │
   │ pas — entrées courtes multiples (A64, +118 %) et facteur SAPN (−33 %).      │
   │ Quatre des `TOLL_NETWORK_FACTOR` (sanef, cofiroute, escota, sapn) sont      │
   │ encore déduits de barèmes publiés et non vérifiés.                          │
   └────────────────────────────────────────────────────────────────────────────┘

   ⚠⚠ CE QUI REND CET OUTIL POSSIBLE : `POST /v8/import` DE HERE CHIFFRE UN TRACÉ
   QU'ON LUI DONNE. On envoie la géométrie Mapbox comme `trace`, on récupère un
   `routeHandle`, puis on demande `return=tolls` sur ce handle. HERE chiffre donc
   NOTRE route, pas la sienne.
   C'est la seule raison pour laquelle cette comparaison est valide. L'erreur de
   méthode qui a fait échouer trois calibrations dans `docs/peages.md` était
   toujours la même : comparer un prix ViaMichelin à un prix app SUR DES ROUTES
   DIFFÉRENTES (Mapbox contourne la barrière de Lançon par Fos, ViaMichelin passe
   par Salon). Un comparateur qui recalcule son propre itinéraire réintroduirait
   ce biais en entier. `--verifier-distances` reste malgré tout affiché à chaque
   ligne : si le kilométrage HERE s'écarte du kilométrage Mapbox, le map-matching
   a dérivé et la ligne n'est PAS comparable.

   ⚠ HERE EST UN MODÈLE, PAS LA VÉRITÉ TERRAIN. Le mode par défaut (`valider`) ne
   calibre RIEN : il confronte HERE aux prix réels ViaMichelin/Mappy déjà connus.
   Tant que cette étape n'est pas passée, aucun chiffre produit par le mode
   `batch` ne vaut quoi que ce soit. La leçon du dossier — « une limite d'API
   supposée doit être mesurée comme le reste » — vaut symétriquement pour une
   PRÉCISION supposée.

   ── Clé API ────────────────────────────────────────────────────────────────────
   Lue dans `HERE_API_KEY`, sinon dans le fichier pointé par `HERE_KEY_FILE`.
   ⚠ NE JAMAIS POSER LA CLÉ DANS `Go_app/`, MÊME GIT-IGNORÉE. Website 2 APK
   Builder empaquette le dossier de travail TEL QUEL, pas ce que git suit (voir
   le `.gitignore`, section « Zone de création ») : un fichier de clé déposé ici
   partirait dans l'APK. Le scratchpad, hors arborescence, est le bon endroit.

   Usage :
     node tools/_calib-peages.js                → valide HERE sur les prix connus
     node tools/_calib-peages.js batch          → tous les trajets, calibration
     node tools/_calib-peages.js valider --json → sortie machine
   ═══════════════════════════════════════════════════════════════════════════════ */

const fs   = require('fs');
const path = require('path');

const MAPBOX_TOKEN = 'pk.eyJ1Ijoic2FsaWZlcmljIiwiYSI6ImNtczEwODdjNjAxMjEyeHNoMWo1cWg0ZHMifQ.dXQjrsTIhPvWMi_9WYroMw';

/* ── Chargement du noyau ───────────────────────────────────────────────────────
   Même procédé que `tests/noyau.test.js` : `js/00-noyau-calculs.js` n'exporte
   rien (il doit rester chargeable par une simple balise <script> en file://), on
   l'évalue donc dans un `new Function` auquel on ajoute un `return`. On mesure
   ainsi les octets réellement livrés à l'app, pas une copie qui divergerait. */
function chargerNoyau() {
    const code = fs.readFileSync(
        path.join(__dirname, '..', 'js', '00-noyau-calculs.js'), 'utf8');
    const noms = [
        'estimateTollFromRoute', '_sectionsPayantes',
        'TOLL_ENTRY_FEE', 'TOLL_KM_RATE', 'TOLL_SECTION_GAP_KM',
        'TOLL_NETWORK_FACTOR', 'TOLL_MIN_KM',
    ];
    return new Function(code + `\n;return { ${noms.join(', ')} };`)();
}

function cleHere() {
    if (process.env.HERE_API_KEY) return process.env.HERE_API_KEY.trim();
    const f = process.env.HERE_KEY_FILE;
    if (f && fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
    console.error(
        '\n  Clé HERE absente.\n' +
        '  Renseigner HERE_API_KEY, ou HERE_KEY_FILE pointant sur un fichier la contenant.\n' +
        '  ⚠ Poser ce fichier HORS de Go_app/ : le dossier part tel quel dans l\'APK.\n');
    process.exit(2);
}

/* ── Trajets de référence ──────────────────────────────────────────────────────
   Coordonnées EN DUR, et non géocodées à la volée : un géocodeur qui bouge d'un
   pâté de maisons change l'échangeur d'entrée, donc la section payante, donc le
   prix — la mesure ne serait plus reproductible d'un mois sur l'autre.

   `reel` = prix ViaMichelin/Mappy relevé, `null` quand inconnu. `note` rappelle
   ce que le trajet a déjà servi à établir : les six premiers ONT SERVI au calage
   des constantes actuelles, ils valident donc la méthode et non la précision. */
const V = {
    paris:       [2.3522, 48.8566],
    lyon:        [4.8357, 45.7640],
    perpignan:   [2.8954, 42.6887],
    montpellier: [3.8767, 43.6108],
    marseille:   [5.3698, 43.2965],
    bordeaux:   [-0.5792, 44.8378],
    bruxelles:   [4.3517, 50.8503],
    leHavre:     [0.1079, 49.4944],
    toulouse:    [1.4442, 43.6047],
    stGaudens:   [0.7231, 43.1085],
    caen:       [-0.3708, 49.1829],
    rouen:       [1.0993, 49.4432],
    nantes:     [-1.5536, 47.2184],
    clermont:    [3.0870, 45.7772],
    dijon:       [5.0415, 47.3220],
    strasbourg:  [7.7521, 48.5734],
    nice:        [7.2620, 43.7102],
    tours:       [0.6848, 47.3941],
    reims:       [4.0317, 49.2583],
};

const TRAJETS = [
    // ── Les six de la campagne du 23/08/2026 : prix réels connus ──────────────
    { id: 'paris-lyon',        de: 'paris',     a: 'lyon',        reel: 41.30, note: 'calibration 23/08' },
    { id: 'perpi-montpellier', de: 'perpignan', a: 'montpellier', reel: 17.40, note: 'calibration 23/08 — A9 pure, itinéraire unique' },
    { id: 'perpi-marseille',   de: 'perpignan', a: 'marseille',   reel: 30.70, note: 'calibration 23/08' },
    { id: 'perpi-bordeaux',    de: 'perpignan', a: 'bordeaux',    reel: 45.40, note: 'calibration 23/08' },
    { id: 'perpi-paris',       de: 'perpignan', a: 'paris',       reel: 67.70, note: 'calibration 23/08 — coupé par l\'A75 gratuite' },
    { id: 'paris-bruxelles',   de: 'paris',     a: 'bruxelles',   reel: 16.30, note: 'transfrontalier — seul de l\'échantillon' },

    // ── Les deux relevés du 04/09/2026 : les cas OUVERTS, en sens opposés ─────
    { id: 'toulouse-stgaudens', de: 'toulouse', a: 'stGaudens',  reel:  6.10, note: '⚠ OUVERT +118 % — deux entrées COURTES sur A64' },
    { id: 'paris-lehavre',      de: 'paris',    a: 'leHavre',    reel: 24.60, note: '⚠ OUVERT −33 % — sapn mêlé à 16 km de « default »' },

    // ── Sans prix réel : c'est HERE qui les chiffrera, une fois validé ────────
    // Priorité aux réseaux JAMAIS mesurés. Un trajet aussi « pur » que possible
    // sur un seul concessionnaire isole son facteur ; un trajet mixte ne le
    // permet pas — c'est exactement ce qui bloque le diagnostic de Paris→Le Havre.
    { id: 'paris-caen',       de: 'paris',    a: 'caen',       reel: null, note: 'SAPN ~pur — doit trancher le facteur sapn' },
    { id: 'paris-rouen',      de: 'paris',    a: 'rouen',      reel: null, note: 'SAPN court' },
    { id: 'paris-reims',      de: 'paris',    a: 'reims',      reel: null, note: 'SANEF ~pur (A4)' },
    { id: 'paris-tours',      de: 'paris',    a: 'tours',      reel: null, note: 'COFIROUTE ~pur (A10)' },
    { id: 'paris-nantes',     de: 'paris',    a: 'nantes',     reel: null, note: 'COFIROUTE long' },
    { id: 'marseille-nice',   de: 'marseille',a: 'nice',       reel: null, note: 'ESCOTA ~pur (A8) — réseau le plus cher' },
    { id: 'lyon-dijon',       de: 'lyon',     a: 'dijon',      reel: null, note: 'APRR ~pur' },
    { id: 'clermont-mtp',     de: 'clermont', a: 'montpellier',reel: null, note: 'A75 gratuite + viaduc de Millau' },
    { id: 'dijon-strasbourg', de: 'dijon',    a: 'strasbourg', reel: null, note: 'A31/A36 — cas partiellement gratuit' },
];

/* ── Mapbox ────────────────────────────────────────────────────────────────────
   Paramètres IDENTIQUES à `fetchRouteMapbox()` (js/15) : c'est la route de l'app
   qu'on veut chiffrer, pas une route générique.
   ⚠ Profil `driving` et non `driving-traffic`, à dessein. L'app préfère le
   trafic, mais un itinéraire qui change avec les bouchons rendrait la mesure non
   reproductible d'une exécution à l'autre. Les `classes` toll ne dépendent pas
   du trafic — c'était l'objet du bug n°2 du 20/08/2026, où le prix des péages
   BAISSAIT quand il y avait des bouchons. `--trafic` force l'autre profil. */
async function routeMapbox(depart, arrivee, trafic) {
    const profil = trafic ? 'driving-traffic' : 'driving';
    const coords = `${depart[0]},${depart[1]};${arrivee[0]},${arrivee[1]}`;
    const url = `https://api.mapbox.com/directions/v5/mapbox/${profil}/${coords}`
        + `?geometries=geojson&steps=true&banner_instructions=true&overview=full`
        + `&alternatives=false&annotations=maxspeed,speed,distance`
        + `&access_token=${MAPBOX_TOKEN}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Mapbox ${res.status} : ${(await res.text()).slice(0, 200)}`);
    const data = await res.json();
    if (!data.routes || !data.routes.length) throw new Error('Mapbox : aucun itinéraire');
    return data.routes[0];
}

/* ── HERE ──────────────────────────────────────────────────────────────────────
   Le tracé Mapbox complet fait des milliers de points sur un Perpignan → Paris.
   On l'échantillonne : le map-matching de HERE n'a pas besoin d'une densité
   métrique sur autoroute, où il n'existe qu'un seul appariement plausible.
   ⚠ On garde TOUJOURS le premier et le dernier point : ce sont eux qui fixent
   l'échangeur d'entrée et de sortie, donc la section facturée. */
function echantillonner(coords, espacementM = 700, plafond = 900) {
    if (coords.length <= 2) return coords.slice();
    const garde = [coords[0]];
    let ref = coords[0];
    for (let i = 1; i < coords.length - 1; i++) {
        if (distanceM(ref, coords[i]) >= espacementM) { garde.push(coords[i]); ref = coords[i]; }
    }
    garde.push(coords[coords.length - 1]);
    if (garde.length <= plafond) return garde;
    // Trop dense malgré tout : on décime régulièrement en préservant les bouts.
    const pas = Math.ceil(garde.length / plafond);
    const reduit = garde.filter((_, i) => i % pas === 0);
    if (reduit[reduit.length - 1] !== garde[garde.length - 1]) reduit.push(garde[garde.length - 1]);
    return reduit;
}

function distanceM(a, b) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (b[1] - a[1]) * rad, dLng = (b[0] - a[0]) * rad;
    const lat = (a[1] + b[1]) / 2 * rad;
    const x = dLng * Math.cos(lat);
    return Math.sqrt(dLat * dLat + x * x) * R;
}

/* Deux appels, tels que documentés par HERE : `POST /v8/import` rend un
   `routeHandle`, puis `GET /v8/routes/{handle}` le chiffre. Le handle est
   l'identité de NOTRE tracé côté HERE — c'est ce qui garantit qu'on compare
   deux prix pour la même route. */
async function peageHere(coords, cle) {
    const trace = coords.map(c => ({ lat: c[1], lng: c[0] }));

    const impUrl = `https://router.hereapi.com/v8/import`
        + `?transportMode=car&return=routeHandle&apiKey=${encodeURIComponent(cle)}`;
    const imp = await fetch(impUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trace }),
    });
    const impTxt = await imp.text();
    if (!imp.ok) throw new Error(`HERE import ${imp.status} : ${impTxt.slice(0, 400)}`);
    const impJson = JSON.parse(impTxt);
    const handle = impJson.routes && impJson.routes[0] && impJson.routes[0].routeHandle;
    if (!handle) throw new Error(`HERE import : pas de routeHandle — ${impTxt.slice(0, 300)}`);

    /* `tolls[summaries]=total` donne le total en une valeur ; `spans=tollSystems`
       dit QUEL concessionnaire encaisse sur chaque portion — c'est cette
       ventilation qui permet de corriger un `TOLL_NETWORK_FACTOR` et lui seul,
       au lieu de recalibrer aveuglément deux constantes globales.
       `tolls[vignettes]=all` sort les vignettes du total : sans objet pour la
       France et la Belgique (pas de vignette voiture), décisif dès qu'un trajet
       frôle la Suisse ou l'Autriche. */
    const tolUrl = `https://router.hereapi.com/v8/routes/${encodeURIComponent(handle)}`
        + `?transportMode=car&currency=EUR`
        + `&return=polyline,summary,tolls&spans=tollSystems`
        + `&tolls[summaries]=total&tolls[vignettes]=all`
        + `&apiKey=${encodeURIComponent(cle)}`;
    const tol = await fetch(tolUrl);
    const tolTxt = await tol.text();
    if (!tol.ok) throw new Error(`HERE tolls ${tol.status} : ${tolTxt.slice(0, 400)}`);
    return JSON.parse(tolTxt);
}

/* Aplatit la réponse HERE. On somme sur les sections : un trajet importé peut
   en compter plusieurs, et ne lire que `sections[0]` perdrait silencieusement
   la fin du trajet — mode de panne exactement analogue à celui qui a fait lire
   les champs du repli dans le journal 🔬 peages (js/16, 04/09/2026). */
function lireHere(rep) {
    let total = 0, longueur = 0, vuTotal = false;
    const systemes = new Map();   // nom → € (jamais fiable si HERE ne ventile pas)
    const gares = [];

    for (const sec of (rep.routes && rep.routes[0] && rep.routes[0].sections) || []) {
        const s = sec.summary || {};
        longueur += Number(s.length) || 0;
        if (s.tolls && s.tolls.total && Number.isFinite(Number(s.tolls.total.value))) {
            total += Number(s.tolls.total.value); vuTotal = true;
        }
        for (const sys of (sec.tollSystems || [])) {
            if (sys && sys.name) systemes.set(sys.name, (systemes.get(sys.name) || 0));
        }
        for (const t of (sec.tolls || [])) {
            for (const f of (t.fares || [])) {
                const v = f && f.price && Number(f.price.value);
                if (Number.isFinite(v) && t.tollSystem) {
                    systemes.set(t.tollSystem, (systemes.get(t.tollSystem) || 0) + v);
                }
            }
            for (const loc of (t.tollCollectionLocations || [])) {
                if (loc && loc.name) gares.push(loc.name);
            }
        }
    }
    return { total: vuTotal ? total : null, km: longueur / 1000, systemes, gares };
}

/* ── Exécution ─────────────────────────────────────────────────────────────── */

function pct(a, b) { return b ? ((a - b) / b * 100) : NaN; }
function fmt(v, u = '') { return v == null || !Number.isFinite(v) ? '  —  ' : v.toFixed(2) + u; }

async function main() {
    const args   = process.argv.slice(2);
    const mode   = args.find(a => !a.startsWith('--')) || 'valider';
    const trafic = args.includes('--trafic');
    const brut   = args.includes('--json');
    const cle    = cleHere();
    const noyau  = chargerNoyau();

    const liste = mode === 'batch' ? TRAJETS : TRAJETS.filter(t => t.reel != null);

    console.log(`\n  Mode ${mode} — ${liste.length} trajets — profil ${trafic ? 'driving-traffic' : 'driving'}`);
    console.log(`  Constantes en vigueur : entrée ${noyau.TOLL_ENTRY_FEE} € | ${noyau.TOLL_KM_RATE} €/km | trou ${noyau.TOLL_SECTION_GAP_KM} km\n`);

    const resultats = [];
    for (const t of liste) {
        const ligne = { id: t.id, note: t.note, reel: t.reel };
        try {
            const route = await routeMapbox(V[t.de], V[t.a], trafic);
            ligne.kmMapbox = route.distance / 1000;

            const diag = {};
            ligne.app = noyau.estimateTollFromRoute(route, diag);
            ligne.sections   = diag.sections || [];
            ligne.kmPayants  = diag.kmPayants;
            ligne.source     = diag.source || 'repli-ref';

            const coords = (route.geometry && route.geometry.coordinates) || [];
            const trace  = echantillonner(coords);
            ligne.pointsTrace = trace.length;

            const here = lireHere(await peageHere(trace, cle));
            ligne.here      = here.total;
            ligne.kmHere    = here.km;
            ligne.systemes  = [...here.systemes.entries()].map(([n, v]) => `${n}:${v.toFixed(2)}`);
            ligne.gares     = here.gares;
            /* ⚠ LE GARDE-FOU DE MÉTHODE. Si HERE a map-matché ailleurs, sa route
               n'est plus la nôtre et l'écart de prix ne veut plus rien dire.
               C'est la vérification « les distances concordent AVANT de conclure
               à une erreur de calcul » de docs/peages.md, rendue automatique. */
            ligne.derive = Math.abs(pct(here.km, ligne.kmMapbox));
            ligne.comparable = ligne.derive < 3;
        } catch (e) {
            ligne.erreur = e.message;
        }
        resultats.push(ligne);

        /* ⚠ On affiche ce qui a ABOUTI même quand la suite échoue. Un plantage
           côté HERE (quota, clé, trace refusée) ne doit pas emporter l'estimation
           app ni le kilométrage Mapbox, déjà calculés : c'est exactement le
           travers du journal 🔬 peages corrigé le 04/09/2026, où un chemin qui
           n'avait pas servi effaçait les chiffres d'un chemin qui, lui, avait
           parfaitement fonctionné. */
        const drapeau = ligne.erreur ? '✗' : (ligne.comparable ? ' ' : '⚠');
        const amont = ligne.app == null ? ''
            : `app ${fmt(ligne.app, '€').padStart(8)} | réel ${fmt(t.reel, '€').padStart(8)}`
            + ` | ${ligne.kmMapbox.toFixed(0)}km mapbox`;
        console.log(`${drapeau} ${t.id.padEnd(20)} `
            + (ligne.erreur ? `${amont}${amont ? ' | ' : ''}HERE ÉCHEC — ${ligne.erreur}`
                : `app ${fmt(ligne.app, '€').padStart(8)} | HERE ${fmt(ligne.here, '€').padStart(8)}`
                + ` | réel ${fmt(t.reel, '€').padStart(8)}`
                + ` | ${ligne.kmMapbox.toFixed(0)}km mapbox / ${ligne.kmHere.toFixed(0)}km here`
                + (ligne.comparable ? '' : `  ⚠ DÉRIVE ${ligne.derive.toFixed(1)} % — NON COMPARABLE`)));
        if (ligne.sections && ligne.sections.length) {
            console.log(`  ${''.padEnd(20)}   sections app : ${ligne.sections.join(', ')}`);
            if (ligne.systemes && ligne.systemes.length) console.log(`  ${''.padEnd(20)}   systèmes HERE : ${ligne.systemes.join(', ')}`);
            if (ligne.gares && ligne.gares.length)       console.log(`  ${''.padEnd(20)}   gares HERE (${ligne.gares.length}) : ${ligne.gares.slice(0, 6).join(' · ')}${ligne.gares.length > 6 ? ' …' : ''}`);
        }
    }

    /* ── Verdict ───────────────────────────────────────────────────────────────
       Le seul chiffre qui compte en mode `valider` : l'erreur de HERE contre les
       prix RÉELS. Celle de l'app est rappelée à titre de repère, mais elle est
       déjà connue — et sur six de ces trajets elle est flattée par construction,
       puisqu'ils ont servi à caler les constantes. */
    const utiles = resultats.filter(r => !r.erreur && r.comparable && r.reel != null && r.here != null);
    if (utiles.length) {
        const errHere = utiles.map(r => Math.abs(pct(r.here, r.reel)));
        const errApp  = utiles.map(r => Math.abs(pct(r.app,  r.reel)));
        const moy = a => a.reduce((s, v) => s + v, 0) / a.length;
        console.log(`\n  ── Verdict sur ${utiles.length} trajets comparables ──`);
        console.log(`  Erreur moyenne HERE vs réel : ${moy(errHere).toFixed(1)} %  (max ${Math.max(...errHere).toFixed(1)} %)`);
        console.log(`  Erreur moyenne app  vs réel : ${moy(errApp).toFixed(1)} %  (max ${Math.max(...errApp).toFixed(1)} %)`);
        console.log(moy(errHere) < 5
            ? `\n  ✓ HERE est un oracle exploitable — le mode \`batch\` a du sens.`
            : `\n  ✗ HERE s'écarte trop des prix réels pour servir de référence.\n`
            + `    NE PAS calibrer sur lui. Comprendre l'écart d'abord.`);
    }

    const sortie = path.join(process.env.TEMP || '.', `calib-peages-${Date.now()}.json`);
    fs.writeFileSync(sortie, JSON.stringify(resultats, null, 2), 'utf8');
    console.log(`\n  Relevé complet : ${sortie}\n`);
    if (brut) console.log(JSON.stringify(resultats, null, 2));
}

main().catch(e => { console.error('\n  ' + e.stack + '\n'); process.exit(1); });

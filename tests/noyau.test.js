/* ═══════════════════════════════════════════════════════════════════════════════
   TESTS DU NOYAU DE CALCUL — `node tests/noyau.test.js`

   Aucune dépendance : ni npm, ni framework, ni navigateur. Le fichier
   `js/00-noyau-calculs.js` est LU puis évalué tel quel dans un `new Function` qui
   renvoie ses symboles. On teste donc les octets réellement livrés à l'app, pas une
   copie exportée qui pourrait diverger — il n'y a rien à maintenir en double, et
   aucune syntaxe de module à ajouter dans un fichier qui doit rester chargeable par
   une simple balise <script> en file://.

   Chaque cas se justifie par un bug réel ou un piège documenté dans AGENTS.md.
   Un test qui n'énonce qu'une évidence ne protège de rien ; ceux-ci décrivent les
   endroits où le calcul s'est déjà trompé, ou peut se tromper sans rien signaler.
   ═══════════════════════════════════════════════════════════════════════════════ */

const fs   = require('fs');
const path = require('path');

const SOURCE = path.join(__dirname, '..', 'js', '00-noyau-calculs.js');

/* Le fichier n'exporte rien (il doit rester un script de navigateur). On l'évalue
   dans une fonction anonyme dont on récupère les symboles par un `return` ajouté à
   la volée. `use strict` volontairement absent : on reproduit le mode « sloppy »
   dans lequel le navigateur exécute réellement ces balises <script>. */
function chargerNoyau() {
    const code = fs.readFileSync(SOURCE, 'utf8');
    const noms = [
        'LICENSE_POINTS_MAX', '_readLicensePoints',
        'calcEnergyCost',
        '_clampMapPadding',
        'normalizeFrHouseNumber', 'normalizeStationAddr', '_deburr',
        'ZFE_AMENDES', 'ZFE_CAT_CLASSE', 'getZFEAmende',
        'extractGasCoords', 'extractGasPrice', 'getBestPrice',
        'COUNTRY_BOXES', 'detectCountriesOnRoute',
        'getTimeUntilEndOfWeek',
    ];
    const retour = `\n;return { ${noms.join(', ')} };`;
    return new Function(code + retour)();
}

// ── Micro-harnais ───────────────────────────────────────────────────────────────
let reussis = 0;
const echecs = [];
let sectionCourante = '';

function section(titre) { sectionCourante = titre; }

function verifie(intitule, obtenu, attendu) {
    const a = JSON.stringify(attendu);
    const o = JSON.stringify(obtenu);
    if (a === o) { reussis++; return; }
    echecs.push({ section: sectionCourante, intitule, attendu: a, obtenu: o });
}

function verifieProche(intitule, obtenu, attendu, tolerance = 1e-9) {
    if (typeof obtenu === 'number' && Math.abs(obtenu - attendu) <= tolerance) { reussis++; return; }
    echecs.push({ section: sectionCourante, intitule, attendu: String(attendu), obtenu: String(obtenu) });
}

// ════════════════════════════════════════════════════════════════════════════════
const N = chargerNoyau();

// ── Points du permis ────────────────────────────────────────────────────────────
section('Points du permis');
{
    const { _readLicensePoints: lire, LICENSE_POINTS_MAX: MAX } = N;

    verifie('le maximum légal est 12', MAX, 12);
    verifie('valeur normale conservée', lire('9', MAX), 9);
    verifie('valeur numérique acceptée', lire(7, MAX), 7);

    /* LE BUG. `parseInt('0') || repli` rendait le repli, 0 étant falsy : un permis
       invalidé était recrédité de 12 points au premier enregistrement. C'est le cas
       où l'information compte le plus. */
    verifie('ZÉRO point conservé, pas remplacé par le repli', lire('0', MAX), 0);
    verifie('zéro numérique conservé', lire(0, MAX), 0);

    // Entrées non exploitables → repli, jamais NaN dans le localStorage.
    verifie('chaîne vide → repli', lire('', MAX), MAX);
    verifie('null → repli', lire(null, MAX), MAX);
    verifie('undefined → repli', lire(undefined, MAX), MAX);
    verifie('texte → repli', lire('douze', MAX), MAX);
    verifie('repli personnalisé respecté', lire('abc', 6), 6);

    // Le `max` du champ HTML ne protège pas d'une valeur écrite en localStorage.
    verifie('au-dessus du maximum → borné à 12', lire('99', MAX), 12);
    verifie('négatif → borné à 0', lire('-3', MAX), 0);
    verifie('décimal tronqué par parseInt', lire('8.7', MAX), 8);
}

// ── Coût de l'énergie ───────────────────────────────────────────────────────────
section("Coût de l'énergie");
{
    const { calcEnergyCost: cout } = N;
    const thermique  = { type: 'thermique',  consumption: 7, fuelPrice: 1.75, consumptionElec: 18, elecPrice: 0.20 };
    const electrique = { type: 'electrique', consumption: 7, fuelPrice: 1.75, consumptionElec: 18, elecPrice: 0.20 };
    const hybride    = { type: 'hybride',    consumption: 7, fuelPrice: 1.75, consumptionElec: 18, elecPrice: 0.20 };

    // 100 km à 7 L/100 à 1,75 €/L = 12,25 €
    verifieProche('thermique : 100 km', cout(100, thermique), 12.25);
    verifieProche('thermique : distance nulle', cout(0, thermique), 0);
    // 100 km à 18 kWh/100 à 0,20 €/kWh = 3,60 €
    verifieProche('électrique : 100 km', cout(100, electrique), 3.6);
    // Hybride = moitié de chaque
    verifieProche('hybride = moyenne des deux', cout(100, hybride), (12.25 + 3.6) / 2);

    /* Un type inconnu (profil importé d'une version future, clé corrompue) doit
       retomber sur le calcul thermique, jamais sur NaN : ce coût est affiché dans
       l'aperçu de trajet et conditionne l'activation du bouton « Lancer ». */
    verifieProche('type inconnu → thermique', cout(100, { ...thermique, type: 'vapeur' }), 12.25);
}

// ── Padding de fitBounds ────────────────────────────────────────────────────────
section('Padding de la carte');
{
    const { _clampMapPadding: borne } = N;

    // Cas normal : rien à corriger.
    verifie('padding raisonnable inchangé',
        borne({ top: 20, bottom: 30, left: 10, right: 10 }, 400, 800),
        { top: 20, bottom: 30, left: 10, right: 10 });

    /* LE BUG DU 14/08/2026. `top + bottom` >= hauteur du canevas ⇒ bande utile nulle
       ⇒ zoom NaN ⇒ `Invalid LngLat object: (NaN, NaN)`, message qui accuse les
       coordonnées alors que le fautif est la géométrie. Après bornage, il doit
       TOUJOURS rester de la place. */
    {
        const r = borne({ top: 500, bottom: 500, left: 0, right: 0 }, 400, 800);
        verifie('padding vertical excessif ramené sous la hauteur', r.top + r.bottom <= 800 - 150, true);
        // Réduction PROPORTIONNELLE : deux côtés égaux le restent, sinon le centre
        // du cadrage se déplacerait.
        verifie('réduction proportionnelle : symétrie préservée', r.top === r.bottom, true);
    }
    {
        // Le cas paysage, celui qui n'était pas borné avant le correctif.
        const r = borne({ top: 0, bottom: 0, left: 900, right: 100 }, 800, 400);
        verifie('padding horizontal excessif ramené sous la largeur', r.left + r.right <= 800 - 150, true);
        verifie('rapport gauche/droite conservé', r.left > r.right, true);
    }
    {
        // Carte plus petite que la bande souhaitée : repli sur la moitié de la surface.
        const r = borne({ top: 200, bottom: 200, left: 0, right: 0 }, 100, 100);
        verifie('petite carte : la bande utile reste positive', r.top + r.bottom < 100, true);
    }

    // Valeurs non numériques : jamais de NaN en sortie, c'est tout l'objet du garde-fou.
    verifie('valeurs absurdes neutralisées',
        borne({ top: NaN, bottom: undefined, left: 'x', right: -50 }, 400, 800),
        { top: 0, bottom: 0, left: 0, right: 0 });
}

// ── Normalisation d'adresses ────────────────────────────────────────────────────
section('Adresses françaises');
{
    const { normalizeFrHouseNumber: numero, normalizeStationAddr: station, _deburr: sansAccent } = N;

    // Mapbox n'indexe que la forme compacte : « 20 bis » interpolé = plusieurs
    // dizaines de mètres d'erreur, parfois le carrefour suivant.
    verifie('bis → b', numero('20 bis Rue Wilhem'), '20b Rue Wilhem');
    verifie('ter → t', numero('14 ter Avenue Foch'), '14t Avenue Foch');
    verifie('quater → q', numero('3 quater rue Blanche'), '3q rue Blanche');
    verifie('casse indifférente', numero('20 BIS Rue Wilhem'), '20b Rue Wilhem');
    verifie('sans espace', numero('20bis Rue Wilhem'), '20b Rue Wilhem');
    verifie('adresse sans suffixe intacte', numero('20 Rue Wilhem'), '20 Rue Wilhem');
    verifie('entrée vide tolérée', numero(''), '');
    verifie('null toléré', numero(null), '');
    /* « bis » doit rester un SUFFIXE DE NUMÉRO : sans chiffre devant, c'est un mot
       ordinaire et le réécrire corromprait l'adresse. */
    verifie('« bis » sans numéro non réécrit', numero('rue du bis'), 'rue du bis');

    // Abréviations du flux data.gouv.fr : « BLD » non reconnu envoie Mapbox de
    // l'autre côté d'un boulevard à chaussées séparées.
    verifie('BLD → BOULEVARD', station('72 BLD DE VERDUN'), '72 BOULEVARD DE VERDUN');
    verifie('BD → BOULEVARD', station('43 BD DE VERDUN'), '43 BOULEVARD DE VERDUN');
    verifie('AV → AVENUE', station('5 AV DE LA GARE'), '5 AVENUE DE LA GARE');
    verifie('RTE → ROUTE', station('12 RTE DE LYON'), '12 ROUTE DE LYON');
    /* STE doit être traité AVANT ST, sinon « STE » resterait entier. L'ordre du
       tableau _FR_VOIE_ABBR est donc significatif : ce test le verrouille. */
    verifie('STE → SAINTE (et pas SAINTE tronqué)', station('PL STE ANNE'), 'PLACE SAINTE ANNE');
    verifie('ST → SAINT', station('RUE ST MICHEL'), 'RUE SAINT MICHEL');
    // Ambiguës laissées telles quelles, volontairement.
    verifie('RD laissé intact (ambigu)', station('RD 7'), 'RD 7');
    verifie('RN laissé intact (ambigu)', station('RN 20'), 'RN 20');
    // Les deux normalisations se composent.
    verifie('abréviation + bis', station('20 BIS BD VOLTAIRE'), '20b BOULEVARD VOLTAIRE');

    verifie('accents retirés', sansAccent('Champs-Élysées'), 'champs-elysees');
    verifie('déjà en minuscules sans accent', sansAccent('champs elysees'), 'champs elysees');
    verifie('chaîne vide', sansAccent(''), '');
    verifie('null toléré', sansAccent(null), '');
}

// ── Amende ZFE ──────────────────────────────────────────────────────────────────
section('Amende ZFE');
{
    const { getZFEAmende: amende } = N;

    /* Art. R411-19-1 : c'est la CATÉGORIE du véhicule qui fixe la classe de
       contravention, jamais la vignette Crit'Air. */
    verifie('voiture particulière = 3ᵉ classe, 68 €', amende('vp'), { classe: 3, forfait: 68, minoree: 45, majoree: 180 });
    verifie('utilitaire léger = 3ᵉ classe', amende('vul').classe, 3);
    verifie('deux-roues = 3ᵉ classe', amende('deux_rm').classe, 3);
    verifie('poids lourd = 4ᵉ classe, 135 €', amende('pl'), { classe: 4, forfait: 135, minoree: 90, majoree: 375 });
    verifie('autobus/autocar = 4ᵉ classe', amende('autobus_autocars').classe, 4);

    /* Toute nouvelle entrée du <select> #zfe-vehicle-category doit être ajoutée à
       ZFE_CAT_CLASSE. Si on l'oublie, le repli 3ᵉ classe s'applique — ce test
       documente ce comportement plutôt que de le laisser découvrir. */
    verifie('catégorie inconnue → repli 3ᵉ classe', amende('tracteur').classe, 3);

    // Les cinq catégories du <select> sont couvertes.
    verifie('les 5 catégories de l’UI sont référencées',
        ['vp', 'vul', 'pl', 'deux_rm', 'autobus_autocars'].every(c => N.ZFE_CAT_CLASSE[c] !== undefined), true);
}

// ── Lecture du flux stations ────────────────────────────────────────────────────
section('Flux stations-service');
{
    const { extractGasPrice: prix, extractGasCoords: coords, getBestPrice: meilleur } = N;

    // Format FR : tableau prix:[{"@nom":…,"@valeur":…}]
    const stationFR = { prix: [
        { '@nom': 'Gazole', '@valeur': '1.729' },
        { '@nom': 'SP95',   '@valeur': '1.859' },
        { '@nom': 'E10',    '@valeur': '1.799' },
    ]};
    verifieProche('gazole lu dans le tableau FR', prix(stationFR, 'gazole'), 1.729);
    verifieProche('sp95 lu dans le tableau FR', prix(stationFR, 'sp95'), 1.859);
    verifie('carburant absent → null', prix(stationFR, 'sp98'), null);
    verifie('carburant inconnu → null', prix(stationFR, 'kerosene'), null);

    // Certaines sources publient les prix en millièmes : 1729 est un prix, pas une
    // aberration. Le seuil > 10 les convertit.
    verifieProche('prix en millièmes converti', prix({ prix: [{ '@nom': 'Gazole', '@valeur': '1729' }] }, 'gazole'), 1.729);
    // Virgule décimale française.
    verifieProche('virgule décimale acceptée', prix({ prix: [{ '@nom': 'Gazole', '@valeur': '1,729' }] }, 'gazole'), 1.729);
    // Valeur aberrante basse écartée (champ vide, zéro, saisie fantaisiste).
    verifie('prix < 0,5 € écarté', prix({ prix: [{ '@nom': 'Gazole', '@valeur': '0.01' }] }, 'gazole'), null);
    verifie('station sans prix → null', prix({}, 'gazole'), null);

    // Prix pré-parsés par les normaliseurs BE/ES : ils priment.
    verifieProche('prix pré-parsé BE/ES prioritaire', prix({ _gazole: 1.65, prix: [] }, 'gazole'), 1.65);

    verifieProche('meilleur prix = le moins cher', meilleur(stationFR), 1.729);
    verifie('station sans aucun prix → 999 (sentinelle de tri)', meilleur({}), 999);

    // Coordonnées : trois formats coexistent dans les sources.
    verifie('latitude/longitude simples', coords({ latitude: '48.8566', longitude: '2.3522' }), [2.3522, 48.8566]);
    /* Le flux FR publie historiquement en cent-millièmes de degré sans séparateur :
       4885660 signifie 48,8566. Sans cette conversion la station atterrit au large. */
    verifie('cent-millièmes convertis', coords({ latitude: '4885660', longitude: '235220' }), [2.3522, 48.8566]);
    verifie('repli sur geom.coordinates', coords({ geom: { coordinates: [2.3522, 48.8566] } }), [2.3522, 48.8566]);
    verifie('repli sur geo_point_2d', coords({ geo_point_2d: { lat: 48.8566, lon: 2.3522 } }), [2.3522, 48.8566]);
    verifie('aucune coordonnée → null', coords({}), null);
    // Hors de la fenêtre France/Europe proche → on ne fait pas confiance au champ plat.
    verifie('coordonnées hors zone rejetées', coords({ latitude: '0', longitude: '0' }), null);
}

// ── Pays traversés ──────────────────────────────────────────────────────────────
section('Pays traversés');
{
    const { detectCountriesOnRoute: pays } = N;

    verifie('Paris → Lyon reste en France', pays([[2.35, 48.85], [4.83, 45.76]]), ['fr']);
    /* Le Luxembourg force l'ajout de la Belgique : les deux pays partagent la même
       source de prix, l'oublier laisserait un trajet luxembourgeois sans station. */
    verifie('Luxembourg entraîne la Belgique', pays([[6.13, 49.61]]).includes('be'), true);
    verifie('trajet hors zone → repli France', pays([[-70, 40]]), ['fr']);
    verifie('Espagne détectée', pays([[2.17, 41.39]]).includes('es'), true);
}

// ── Compte à rebours hebdomadaire ───────────────────────────────────────────────
section('Fin de semaine');
{
    const { getTimeUntilEndOfWeek: reste } = N;

    // Lundi 10/08/2026 à 00:00 → dimanche 16/08 23:59:59, soit 6 j 23 h.
    verifie('lundi minuit', reste(new Date(2026, 7, 10, 0, 0, 0)), '6j 23h restants');
    // Samedi 15/08 à 18:00 → dimanche 23:59:59, soit 1 j 5 h (l'affichage de l'app).
    verifie('samedi 18 h', reste(new Date(2026, 7, 15, 18, 0, 0)), '1j 5h restants');
    /* Dimanche : la semaine se termine LE JOUR MÊME, pas dans sept jours. C'est le
       cas limite du calcul `dayOfWeek === 0 ? 0 : 7 - dayOfWeek`. */
    verifie('dimanche matin : 0 jour restant', reste(new Date(2026, 7, 16, 8, 0, 0)), '0j 15h restants');
    verifie('dimanche 23 h : dernière heure', reste(new Date(2026, 7, 16, 23, 0, 0)), '0j 0h restants');
}

// ── Verdict ─────────────────────────────────────────────────────────────────────
const total = reussis + echecs.length;
if (echecs.length === 0) {
    console.log(`✔ ${reussis}/${total} assertions réussies — noyau de calcul conforme.`);
    process.exit(0);
}
console.error(`✘ ${echecs.length} échec(s) sur ${total} assertions :\n`);
for (const e of echecs) {
    console.error(`  [${e.section}] ${e.intitule}`);
    console.error(`      attendu : ${e.attendu}`);
    console.error(`      obtenu  : ${e.obtenu}\n`);
}
process.exit(1);

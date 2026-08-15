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
        '_clampMapPadding', '_cameraForBoundsSafe', '_ecartMetres',
        '_metresRestreints', '_choisirEtapeStation',
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

// ── Cadrage de repli ────────────────────────────────────────────────────────────
section('Cadrage de repli');
{
    const { _cameraForBoundsSafe: cadre } = N;

    /* Les valeurs relevées sur l'appareil le 15/08/2026 : canevas 411x842, padding
       du modal ouvert. C'est le cas où Mapbox a rendu un centre NaN. Le repli, lui,
       doit produire un cadrage exploitable. */
    const PAD = { top: 50, bottom: 410.5238037109375, left: 40, right: 40 };
    {
        // Paris → Lyon, trajet réel.
        const r = cadre([[2.35, 45.76], [4.83, 48.85]], 411, 842, PAD);
        verifie('trajet réel : un cadrage est rendu', r !== null, true);
        verifie('centre fini', Number.isFinite(r.center[0]) && Number.isFinite(r.center[1]), true);
        verifie('zoom fini', Number.isFinite(r.zoom), true);
        verifie('zoom sous le plafond', r.zoom <= 18, true);
        /* Le centre de la CAMÉRA tombe au SUD du milieu des bornes. C'est contre-intuitif
           mais c'est bien le résultat voulu : le modal masque la moitié basse, le trajet
           doit donc s'afficher dans la bande HAUTE de l'écran — et pour qu'un contenu
           monte à l'écran, la caméra descend. Un centre resté sur le milieu des bornes
           signerait un padding ignoré, et le trajet finirait derrière le modal. */
        verifie('caméra décalée au sud (trajet remonté au-dessus du modal)', r.center[1] < (45.76 + 48.85) / 2, true);
    }

    // Bornes ponctuelles : pas de division par zéro, on garde le zoom maximal.
    {
        const r = cadre([[2.35, 48.85], [2.35, 48.85]], 411, 842, PAD);
        verifie('bornes confondues → zoom maximal', r.zoom, 18);
        verifie('bornes confondues → centre fini', Number.isFinite(r.center[1]), true);
    }

    /* LES DEUX SOURCES DE NaN QUE `isLngLat` LAISSE PASSER. Chacune rendait un centre
       NaN chez Mapbox ; ici elles doivent rendre `null` ou un résultat fini, jamais
       un objet à moitié faux. */
    {
        // Latitude au pôle : la projection de Mercator y diverge.
        const r = cadre([[2.0, -90], [3.0, 90]], 411, 842, PAD);
        verifie('latitude ±90 : jamais de NaN', r === null || Number.isFinite(r.center[1]), true);
        verifie('latitude ±90 : zoom jamais NaN', r === null || Number.isFinite(r.zoom), true);
    }
    {
        // Bande utile nulle : padding qui consomme toute la hauteur.
        const r = cadre([[2.35, 45.76], [4.83, 48.85]], 411, 842, { top: 500, bottom: 500, left: 0, right: 0 });
        verifie('bande verticale nulle → null', r, null);
    }
    {
        const r = cadre([[2.35, 45.76], [4.83, 48.85]], 411, 842, { top: 0, bottom: 0, left: 300, right: 200 });
        verifie('bande horizontale nulle → null', r, null);
    }

    // Entrées inexploitables : `null`, jamais une exception ni un NaN.
    verifie('bornes non numériques → null', cadre([[NaN, 1], [2, 3]], 411, 842, PAD), null);
    verifie('bornes mal formées → null', cadre([[2, 3]], 411, 842, PAD), null);
    verifie('bornes absentes → null', cadre(null, 411, 842, PAD), null);
    verifie('canevas dégénéré → null', cadre([[2.35, 45.76], [4.83, 48.85]], 0, 0, PAD), null);
    verifie('padding absent toléré', cadre([[2.35, 45.76], [4.83, 48.85]], 411, 842, null) !== null, true);

    /* Cohérence d'échelle : un trajet DEUX FOIS plus étendu doit tomber à un niveau de
       zoom plus bas d'exactement 1 — c'est la définition du zoom, et le seul contrôle
       qui attrape une erreur de facteur (le sur-dézoom d'un facteur ~4 déjà rencontré
       serait passé inaperçu autrement). */
    {
        const petit = cadre([[2.0, 48.0], [2.4, 48.0001]], 411, 842, { top: 0, bottom: 0, left: 0, right: 0 });
        const grand = cadre([[2.0, 48.0], [2.8, 48.0001]], 411, 842, { top: 0, bottom: 0, left: 0, right: 0 });
        verifieProche('doubler l’étendue retire exactement 1 au zoom', petit.zoom - grand.zoom, 1, 1e-3);
    }
}

// ── Écart entre deux points ─────────────────────────────────────────────────────
section('Écart en mètres');
{
    const { _ecartMetres: ecart } = N;

    verifie('point identique → 0', ecart([2.35, 48.85], [2.35, 48.85]), 0);

    /* Le cas qui a motivé la fonction : les deux candidats de la station
       « 72 BLD DE VERDUN » (point géocodé et point brut du flux data.gouv), séparés
       de ~80 m d'après le journal de l'app. C'est cet ordre de grandeur qui doit être
       rendu fidèlement — le seuil de décision est à 15 m. */
    verifieProche('les deux candidats de la station : ~80 m',
        ecart([2.259823, 48.901528], [2.259, 48.902]), 80, 12);

    // Un degré de latitude vaut ~110,5 km partout.
    verifieProche('1° de latitude ≈ 110,5 km', ecart([2, 48], [2, 49]), 110540, 50);
    /* Un degré de longitude RÉTRÉCIT avec la latitude — d'où le cosinus. L'oublier
       surestimerait de 50 % à nos latitudes, et le seuil de 15 m perdrait son sens. */
    verifieProche('1° de longitude à 48° ≈ 74,5 km', ecart([2, 48], [3, 48]), 74500, 400);

    // La distance ne dépend pas du sens de lecture.
    verifieProche('symétrique',
        ecart([2.30, 48.90], [2.35, 48.85]) - ecart([2.35, 48.85], [2.30, 48.90]), 0, 1e-9);

    /* Entrées inexploitables → `Infinity`, JAMAIS NaN : l'appelant compare à un seuil,
       et `NaN > 15` vaut faux — il conclurait « les deux points sont confondus » et
       n'arbitrerait pas, exactement le contraire du choix prudent. */
    verifie('coordonnée manquante → Infinity', ecart([2.35, 48.85], null), Infinity);
    verifie('valeur non numérique → Infinity', ecart([2.35, 48.85], ['x', 48.85]), Infinity);
    verifie('tableau vide → Infinity', ecart([], []), Infinity);
}

// ── Point d'étape d'une station ─────────────────────────────────────────────────
section('Point d’étape d’une station');
{
    const { _metresRestreints: restreints, _choisirEtapeStation: choisir } = N;

    // Fabrique d'itinéraire au format Mapbox Directions, réduit à ce qui nous sert.
    const etape = (dist, restreinte) => ({
        distance: dist,
        intersections: [{ classes: restreinte ? ['restricted'] : [] }],
    });
    const routeDe = (...etapes) => ({ legs: [{ steps: etapes }] });

    verifie('aucune voie restreinte → 0', restreints(routeDe(etape(500, false), etape(300, false))), 0);
    verifie('somme des ÉTAPES restreintes, pas leur nombre',
        restreints(routeDe(etape(500, false), etape(120, true), etape(80, true))), 200);
    /* Robustesse : ces objets viennent d'une API. Un champ manquant ne doit pas faire
       lever une fonction dont dépend le calcul d'itinéraire. */
    verifie('route absente → 0', restreints(null), 0);
    verifie('legs absents → 0', restreints({}), 0);
    verifie('steps absents → 0', restreints({ legs: [{}] }), 0);
    verifie('intersections absentes → 0', restreints({ legs: [{ steps: [{ distance: 100 }] }] }), 0);

    /* LE CAS RÉEL, mesuré le 15/08/2026 : station « 72 BLD DE VERDUN », trajet
       58 Rue de Colombes → 157 Bd Bineau. Le candidat BRUT est 653 m PLUS COURT, mais
       passe 525 m sur voie restreinte — le corridor de service d'une voie ferrée, que
       l'utilisateur a identifié sur la carte. C'est le géocodé qui doit gagner. */
    {
        const geo  = { distanceM: 3203, restreintM: 71 };
        const brut = { distanceM: 2550, restreintM: 525 };
        const v = choisir(geo, brut);
        verifie('le plus court est ÉCARTÉ s’il abuse de la voie restreinte', v.gagnant, 'a');
        verifie('le motif cite la voie restreinte', v.motif.includes('restreinte'), true);
    }

    // Deux candidats également sains : la distance retrouve son rôle d'arbitre.
    verifie('deux candidats sains → le plus court',
        choisir({ distanceM: 3203, restreintM: 40 }, { distanceM: 2550, restreintM: 60 }).gagnant, 'b');
    // Deux candidats également douteux : on ne peut plus que prendre le plus court.
    verifie('deux candidats douteux → le plus court',
        choisir({ distanceM: 3203, restreintM: 400 }, { distanceM: 2550, restreintM: 525 }).gagnant, 'b');

    /* Le seuil doit laisser passer l'entrée sur une station-service — quelques dizaines
       de mètres de cour privative — sans laisser passer un chemin technique. */
    verifie('71 m de cour de station : candidat sain',
        choisir({ distanceM: 3203, restreintM: 71 }, { distanceM: 9999, restreintM: 999 }).gagnant, 'a');

    // Un itinéraire non calculable (réseau) ne doit pas gagner par défaut.
    verifie('candidat a incalculable → b',
        choisir({ distanceM: Infinity, restreintM: 0 }, { distanceM: 2550, restreintM: 525 }).gagnant, 'b');
    verifie('candidat b incalculable → a',
        choisir({ distanceM: 3203, restreintM: 71 }, { distanceM: Infinity, restreintM: 0 }).gagnant, 'a');
    verifie('les deux incalculables → null', choisir(null, null), null);
    // À égalité stricte, `a` gagne : c'est le candidat que l'appelant préfère par ailleurs.
    verifie('égalité → a', choisir({ distanceM: 2000, restreintM: 10 }, { distanceM: 2000, restreintM: 10 }).gagnant, 'a');
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

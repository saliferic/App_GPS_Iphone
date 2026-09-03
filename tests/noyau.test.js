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
        'CO2_FACTOR_KG_PER_L', 'CO2_FACTOR_ELEC_KG_PER_KWH', 'calcCO2',
        '_clampMapPadding', '_cameraForBoundsSafe', '_ecartMetres',
        '_metresRestreints', '_choisirEtapeStation',
        'normalizeFrHouseNumber', 'normalizeStationAddr', '_deburr',
        'BAN_MIN_SCORE', '_frNumeroDeVoie', '_banLabel', 'banPickAddress',
        'ZFE_AMENDES', 'ZFE_CAT_CLASSE', 'getZFEAmende',
        '_refAutorouteFr', '_estEuroroutePure', '_horsReseauPeageFr',
        'estimateTollFromRoute', 'formatTollEstimate',
        'TOLL_ENTRY_FEE', 'TOLL_KM_RATE', 'TOLL_NETWORK_FACTOR', 'TOLL_MIN_KM',
        'TOLL_LEGACY_ENTRY_FEE', 'TOLL_LEGACY_KM_RATE', 'TOLL_SECTION_GAP_KM', '_sectionsPayantes',
        'extractGasCoords', 'extractGasPrice', 'getBestPrice',
        'COUNTRY_BOXES', 'detectCountriesOnRoute', 'paysDuPoint',
        'getTimeUntilEndOfWeek',
        'formatTripDayLabel', 'formatTripTime', 'groupTripsByDate',
        'formatTripDuration', 'formatTripDistance', 'tripPlacesLabel',
        'ARRIVAL_AUTO_M', 'ARRIVAL_ASSERT_M',
        '_lundiISO', 'CLASSEMENT_ANIMAUX_MAX', 'clampAnimauxClassement',
        'pseudoValide', 'emailDePseudo', 'PSEUDO_DOMAINE',
        'dureeAvecExces', 'EXCES_FRACTION', 'EXCES_GAIN_KMH',
        'VIE_MAX', 'VIE_DEGAT_PAR_METRE', 'VIE_SOIN_PAR_METRE', 'VIE_ROBUSTESSE',
        'severiteExces', 'robustesseCompagnon', 'majVie', 'vieApresChoc', 'palierVie',
        'VIE_SEUIL_SANTE', 'etatSanteVie',
        'VIE_SEUIL_BLESSE', 'etatPhysiqueVie',
        'dureeVieJours', 'texteAge',
        'heureArrivee',
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

// ── Empreinte CO2 ───────────────────────────────────────────────────────────────
section('Empreinte CO2');
{
    const { calcCO2: co2 } = N;
    const thermiqueGazole  = { type: 'thermique',  consumption: 7, consumptionElec: 18 };
    const thermiqueE10     = { type: 'thermique',  consumption: 7, consumptionElec: 18 };
    const electrique       = { type: 'electrique', consumption: 7, consumptionElec: 18 };
    const hybride          = { type: 'hybride',    consumption: 7, consumptionElec: 18 };

    // 100 km à 7 L/100 de gazole à 2,68 kg CO2/L = 18,76 kg
    verifieProche('thermique gazole : 100 km', co2(100, thermiqueGazole, 'gazole'), 18.76);
    // Même trajet en E10 (2,31 kg CO2/L) = 16,17 kg — le carburant compte, pas juste le litrage
    verifieProche('thermique E10 : 100 km, moins que le gazole', co2(100, thermiqueE10, 'e10'), 16.17);
    verifieProche('thermique : distance nulle', co2(0, thermiqueGazole, 'gazole'), 0);
    // 100 km à 18 kWh/100 à 0,06 kg CO2/kWh = 1,08 kg
    verifieProche('électrique : 100 km', co2(100, electrique, 'gazole'), 1.08);
    // Hybride = moyenne du thermique (carburant choisi) et de l'électrique
    verifieProche('hybride = moyenne des deux', co2(100, hybride, 'e10'), (16.17 + 1.08) / 2);

    /* Carburant absent ou inconnu (profil importé d'une version future, réglage
       jamais touché) → repli sur E10, jamais NaN : ce nombre est affiché tel quel
       dans le Profil. */
    verifieProche('carburant inconnu → repli E10', co2(100, thermiqueGazole, 'diesel-inexistant'), 16.17);
    verifieProche('carburant absent → repli E10', co2(100, thermiqueGazole, undefined), 16.17);
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

// ── Base Adresse Nationale ──────────────────────────────────────────────────────
section('Géocodage BAN');
{
    const { _frNumeroDeVoie: numVoie, _banLabel: libelle, banPickAddress: choisir } = N;

    /* Le numéro doit être lu identiquement des deux côtés de la comparaison : la
       requête de l'utilisateur (« 20 bis ») et le champ BAN (« 20 bis »), en passant
       par la forme compacte que l'utilisateur tape parfois lui-même (« 20bis »). */
    verifie('numéro simple', numVoie('6 rue de Massy'), { num: '6', rep: '' });
    verifie('bis en toutes lettres', numVoie('20 bis Rue Wilhem'), { num: '20', rep: 'b' });
    verifie('bis compact', numVoie('20bis Rue Wilhem'), { num: '20', rep: 'b' });
    verifie('bis déjà abrégé', numVoie('20b Rue Wilhem'), { num: '20', rep: 'b' });
    verifie('casse indifférente', numVoie('14 TER Avenue Foch'), { num: '14', rep: 't' });
    // Intervalle des flux stations-service : le référentiel porte la borne basse.
    verifie('intervalle → borne basse', numVoie('43-47 Bd de Verdun'), { num: '43', rep: '' });
    /* LE PIÈGE : sans le `\b` après le suffixe d'une lettre, le « a » d'« avenue »
       serait lu comme un suffixe de numéro et « 12 avenue Foch » ne correspondrait
       plus jamais au 12 rendu par la BAN. */
    verifie('« avenue » n\'est pas un suffixe', numVoie('12 avenue Foch'), { num: '12', rep: '' });
    verifie('« ter » d\'un mot ordinaire ignoré', numVoie('5 terrasse des Lilas'), { num: '5', rep: '' });
    /* Sans le refus explicite du 5ᵉ chiffre, le moteur se contente des quatre premiers
       et « 75016 Paris » devient le numéro 7501 : plus aucune réponse ne peut alors
       correspondre, et la BAN est appelée pour rien à chaque recherche par code postal. */
    verifie('code postal n\'est pas un numéro', numVoie('75016 Paris'), null);
    verifie('adresse sans numéro → null', numVoie('rue de la Paix'), null);
    verifie('lieu nommé → null', numVoie('Tour Eiffel'), null);
    verifie('vide toléré', numVoie(''), null);
    verifie('null toléré', numVoie(null), null);

    /* Le label BAN brut n'a pas de virgule ; sans reformatage, `tripPlacesLabel()`
       afficherait l'adresse entière au lieu du seul lieu. */
    verifie('libellé virgulé',
        libelle({ name: '8 Boulevard du Port', postcode: '80000', city: 'Amiens' }),
        '8 Boulevard du Port, 80000 Amiens');
    verifie('commune manquante tolérée', libelle({ name: '8 Boulevard du Port' }), '8 Boulevard du Port');
    verifie('propriétés absentes', libelle(null), '');

    const feat = (props, coords = [2.3, 48.8]) =>
        ({ geometry: { type: 'Point', coordinates: coords }, properties: props });
    const bon = feat({
        type: 'housenumber', score: 0.88, housenumber: '20 bis',
        name: '20 bis Rue Wilhem', postcode: '75016', city: 'Paris'
    }, [2.2726, 48.8478]);

    verifie('numéro exact retenu',
        choisir([bon], '20 bis Rue Wilhem 75016 Paris').coords, [2.2726, 48.8478]);
    verifie('libellé reformaté à la sortie',
        choisir([bon], '20 bis Rue Wilhem').label, '20 bis Rue Wilhem, 75016 Paris');
    // La forme compacte, c'est celle que Mapbox exige : la BAN doit la reconnaître aussi.
    verifie('requête compacte, réponse en toutes lettres',
        choisir([bon], '20b Rue Wilhem').label, '20 bis Rue Wilhem, 75016 Paris');

    /* ⚠ LE CAS QUI JUSTIFIE TOUT LE FILTRE. La BAN rend volontiers un numéro VOISIN
       avec un très bon score quand celui demandé n'existe pas. L'accepter donnerait
       une adresse fausse avec l'aplomb d'une adresse exacte — pire qu'une
       interpolation Mapbox, qui tombe au moins dans la bonne rue. */
    verifie('numéro voisin refusé malgré un bon score',
        choisir([feat({ type: 'housenumber', score: 0.92, housenumber: '99',
                        name: '99 Rue de la Paix', postcode: '75002', city: 'Paris' })],
                '999 Rue de la Paix'), null);
    // Le 20 et le 20 bis sont deux immeubles : le suffixe compte dans les deux sens.
    verifie('20 demandé, 20 bis rendu → refusé',
        choisir([bon], '20 Rue Wilhem'), null);
    verifie('20 bis demandé, 20 rendu → refusé',
        choisir([feat({ type: 'housenumber', score: 0.9, housenumber: '20',
                        name: '20 Rue Wilhem', postcode: '75016', city: 'Paris' })],
                '20 bis Rue Wilhem'), null);

    /* `street` = la BAN a trouvé la rue mais pas le numéro. Elle n'apporte alors rien
       de plus que l'interpolation de Mapbox : on repasse la main. */
    verifie('type street refusé',
        choisir([feat({ type: 'street', score: 0.9, name: 'Rue Wilhem',
                        postcode: '75016', city: 'Paris' })], '20 Rue Wilhem'), null);
    verifie('type municipality refusé',
        choisir([feat({ type: 'municipality', score: 0.95, name: 'Paris', city: 'Paris' })],
                '20 Rue Wilhem'), null);
    verifie('score sous le plancher refusé',
        choisir([feat({ type: 'housenumber', score: 0.2, housenumber: '20',
                        name: '20 Rue Wilhem', postcode: '75016', city: 'Paris' })],
                '20 Rue Wilhem'), null);
    // Code postal tapé par l'utilisateur : c'est lui qui tranche entre deux homonymes.
    verifie('code postal contredit → refusé',
        choisir([feat({ type: 'housenumber', score: 0.9, housenumber: '20',
                        name: '20 Rue Wilhem', postcode: '69003', city: 'Lyon' })],
                '20 Rue Wilhem 75016 Paris'), null);

    // Le premier résultat exploitable gagne ; les précédents sont sautés, pas fatals.
    verifie('premier exploitable retenu après un rejet',
        choisir([feat({ type: 'street', score: 0.95, name: 'Rue Wilhem' }), bon],
                '20 bis Rue Wilhem').label, '20 bis Rue Wilhem, 75016 Paris');

    /* Hors de France la BAN rend une liste vide : `null` doit signifier « repasse la
       main à Mapbox », jamais « adresse introuvable ». */
    verifie('liste vide → null', choisir([], '20 Rue Wilhem'), null);
    verifie('réponse non tableau → null', choisir(null, '20 Rue Wilhem'), null);
    verifie('géométrie absente → null',
        choisir([{ properties: { type: 'housenumber', score: 0.9, housenumber: '20' } }],
                '20 Rue Wilhem'), null);
    verifie('coordonnées non numériques → null',
        choisir([feat({ type: 'housenumber', score: 0.9, housenumber: '20',
                        name: '20 Rue Wilhem' }, ['x', 'y'])], '20 Rue Wilhem'), null);
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

// ── Estimation des péages ───────────────────────────────────────────────────────
section('Péages');
{
    const { estimateTollFromRoute: peage, formatTollEstimate: afficher,
            _refAutorouteFr: refFr, _horsReseauPeageFr: horsFr } = N;

    /* Fabrique un step Mapbox plausible. `kmh` sert au repli par vitesse ET reproduit
       l'effet d'un bouchon, que l'ancienne heuristique confondait avec la gratuité. */
    const step = (ref, km, kmh, loc) => ({
        ref, distance: km * 1000, duration: (km / kmh) * 3600,
        maneuver: { location: loc || [3.0, 43.5] },
    });
    const route = (...steps) => ({ legs: [{ steps }] });

    /* ═══ LES DEUX TRAJETS QUI CALIBRENT LE MODÈLE ═══════════════════════════════
       ⚠ CES DEUX CAS NE SONT PAS DES EXEMPLES : ce sont les mesures dont sortent
       `TOLL_ENTRY_FEE` et `TOLL_KM_RATE`. Les kilométrages ne sont pas inventés — ce
       sont ceux que l'app A RÉELLEMENT DÉTECTÉS le 20/08/2026, relevés dans le journal
       `🔬 peages` sur l'appareil ; les prix sont ceux de ViaMichelin sur le MÊME
       itinéraire (vérifié par la distance totale, à 0,3 km près sur Montpellier).
       Un taux unique en €/km ne peut pas passer par les deux — 0,129 sur le court,
       0,098 sur le long — d'où le modèle affine. Toucher aux constantes sans refaire
       une mesure fera virer ces deux tests au rouge, et c'est exactement leur rôle. */

    // ── Calibration n°1 : Perpignan → Montpellier (155 km, 17,40 € réels) ───────
    /* Le trajet de calibration PROPRE : une seule route plausible, l'A9 d'un bout à
       l'autre. Les deux calculateurs prennent forcément le même chemin, donc tout
       écart mesuré est imputable au calcul et à rien d'autre. C'est ce qui manquait
       aux trois tentatives précédentes, toutes faussées par un itinéraire différent. */
    const perpignanMontpellier = route(
        step('D 900',    7.6, 90,  [2.89, 42.70]),  // accès depuis Perpignan, gratuit
        step('E15;A9', 133.1, 115, [2.92, 42.72]),
        step('A709',     1.3, 100, [3.85, 43.63]),
        step(null,      13.3, 40,  [3.87, 43.61]),  // voirie urbaine aux deux bouts
    );
    verifieProche('CALIBRATION Perpignan → Montpellier = 17,40 € réels',
        peage(perpignanMontpellier), 17.40, 0.25);

    // ── Calibration n°2 : Perpignan → Marseille par l'A7 (30,70 € réels) ────────
    /* ViaMichelin et Mappy s'accordent : Arles 25,50 € + Lançon 5,20 €. L'app en
       annonçait 13,49 € avant correction. Géométrie simplifiée, longueurs réelles. */
    const perpignanMarseille = route(
        step(null,      4, 35, [2.90, 42.69]),   // sortie de Perpignan, voirie urbaine
        step('E15;A9', 205, 115, [2.92, 42.72]), // ⚠ latitude 42,72 : « Espagne » avant
        step('A54',     70, 115, [4.36, 43.66]),
        step('A7',      38, 110, [5.10, 43.55]),
        step(null,      8, 30, [5.38, 43.30]),   // entrée de Marseille
    );
    const estime = peage(perpignanMarseille);
    verifieProche('CALIBRATION Perpignan → Marseille (A7) = 30,70 € réels',
        estime, 30.70, 0.40);

    /* Verrou de non-régression sur le bug d'origine : 13,49 € était le symptôme, pas
       une valeur limite. Repasser sous 20 € signifie qu'un filtre a été réintroduit. */
    verifie('trajet de référence : plus jamais l’estimation à 13,49 €', estime > 20, true);
    verifie('trajet de référence : affiché à l’euro', afficher(estime), '~31 €');

    /* ⚠ POINT DE CONTRÔLE INDÉPENDANT — n'a PAS servi à calculer les constantes.
       Perpignan → Marseille par Fos/Martigues (A55 et N568 gratuites, on sort du
       système fermé à Arles) : 226,3 km détectés par l'app, ~25,50 € réels. Le modèle
       affine y tombe à ~24,3 €. C'est ce troisième point qui distingue une calibration
       d'un simple ajustement à deux inconnues sur deux équations. */
    const perpignanMarseilleParFos = route(
        step('E15;A9', 186.2, 115, [2.92, 42.72]),
        step('E 80',    40.1, 110, [4.15, 43.75]),  // A54, taguée euroroute seule
        step('N 568',   26.6, 90,  [4.63, 43.66]),  // gratuite
        step('A55',     35.1, 100, [5.05, 43.40]),  // gratuite
    );
    verifieProche('CONTRÔLE Perpignan → Marseille par Fos ≈ 25,50 € réels',
        peage(perpignanMarseilleParFos), 25.50, 1.60);

    /* L'A9 au départ de Perpignan est sous la latitude 43,0 — la ligne exacte qui
       jetait 50 km de section payante. Ce cas isolé nomme le bug. */
    verifie('A9 sous la latitude 43 : comptée (Perpignan n’est pas l’Espagne)',
        peage(route(step('A9', 205, 115, [2.92, 42.72]))) > 0, true);

    /* ⚠ LE PRIX D'UN PÉAGE NE DÉPEND PAS DU TRAFIC. L'ancienne détection reposait sur
       la vitesse moyenne du step ; `driving-traffic` étant le profil préféré de
       `fetchRouteMapbox()`, un bouchon faisait BAISSER le péage. */
    const bouchon = route(
        step(null,      4, 35, [2.90, 42.69]),
        step('E15;A9', 205, 45, [2.92, 42.72]),  // même trajet, 45 km/h de moyenne
        step('A54',     70, 40, [4.36, 43.66]),
        step('A7',      38, 35, [5.10, 43.55]),
        step(null,      8, 15, [5.38, 43.30]),
    );
    verifieProche('un bouchon ne change pas le prix du péage', peage(bouchon), estime, 1e-9);

    // ── Continuité par euroroute (bug réel, mesuré en console le 20/08/2026) ───
    /* Sur le VRAI trajet Perpignan → Marseille, un step de 71,8 km ne portait QUE
       `"E 80"` — sans le numéro français que ses voisins affichaient (`"E15;A9"`).
       `_refAutorouteFr()` ignore à raison une euroroute seule (elle n'identifie aucun
       réseau de péage), mais ce kilométrage n'était alors NULLE PART : ni facturé, ni
       exclu, ni dans le repli. Diagnostiqué en console : coût=22,38 € au lieu de
       ~30,70 €, avec `refsNonReconnus: "E 80"=71.8km` explicitement dans le journal.
       Une euroroute ne se signale jamais sur un tronçon de voirie ordinaire — elle
       chevauche toujours une autoroute nationale sans rupture physique — d'où la
       continuité : un step E-seul hérite du réseau du dernier step classé. */
    const routeAvecEuroroute = route(
        step('E15;A9', 140, 115, [2.92, 42.72]),
        step('E80',     72, 115, [3.9,  43.2]),   // ⚠ le step qui disparaissait
        step('A54',     70, 115, [4.36, 43.66]),
    );
    const coutAvecEuroroute = peage(routeAvecEuroroute);
    const coutSansLeStepE80 = peage(route(
        step('E15;A9', 140, 115, [2.92, 42.72]),
        step('A54',     70, 115, [4.36, 43.66]),
    ));
    verifie('un step "E80" seul est facturé (continuité), pas ignoré',
        coutAvecEuroroute > coutSansLeStepE80, true);
    /* La continuité doit ajouter EXACTEMENT le kilométrage du step E80 au réseau en
       cours (ASF ici) — ni plus (double comptage), ni moins (fraction perdue).
       ⚠ Les frais d'entrée s'annulent dans la différence : les deux routes traversent
       le même unique réseau. Un écart de `TOLL_ENTRY_FEE` ici signalerait que le step
       E80 s'est vu attribuer un réseau à lui, donc une deuxième entrée facturée. */
    verifieProche('le step E80 rejoint le réseau du step précédent, au kilomètre près',
        coutAvecEuroroute - coutSansLeStepE80, 72 * N.TOLL_LEGACY_KM_RATE, 1e-6);

    /* ⚠ LA CONTINUITÉ NE TRAVERSE PAS UNE DÉPARTEMENTALE. Si le step E-seul suit un
       "D900" (quitter l'autoroute, rouler un peu, y revenir), il ne doit RIEN hériter :
       `dernierReseauFr` a été remis à zéro par la départementale. Sans cette coupure,
       n'importe quelle route européenne croisée en ville après une sortie d'autoroute
       se retrouverait facturée au tarif autoroutier. */
    const euorouteApresDepartementale = route(
        step('A9',   140, 115, [2.92, 42.72]),
        step('D900',   8,  90, [3.5,  43.0]),   // sortie d'autoroute
        step('E80',    20, 90, [3.6,  43.05]),  // route européenne... mais en ville
    );
    verifieProche('E80 après une D900 : pas de continuité, la départementale a coupé',
        peage(euorouteApresDepartementale),
        peage(route(step('A9', 140, 115, [2.92, 42.72]), step('D900', 8, 90, [3.5, 43.0]))),
        1e-9);

    /* Une euroroute seule EN TÊTE de route, avant tout step classé, n'a rien à hériter :
       `dernierReseauFr` est encore `null`. Elle doit rester non facturée plutôt que de
       lever une erreur ou d'inventer un réseau par défaut. */
    verifie('E80 en tête de trajet, sans réseau à hériter : 0 €',
        peage(route(step('E80', 60, 115, [3.9, 43.2]))), 0);

    // ── Le modèle affine : ce qui le distingue d'un taux au kilomètre ──────────
    /* ⚠ LE €/km DOIT DÉCROÎTRE AVEC LA DISTANCE — c'est LA propriété mesurée qui a
       imposé d'abandonner le taux unique (0,129 €/km sur 134 km, 0,098 sur 313). Un
       test qui ne vérifierait que deux montants passerait encore si quelqu'un
       remettait un taux constant calé entre les deux ; celui-ci, non. */
    const parKm = km => peage(route(step('A9', km, 115, [2.92, 42.72]))) / km;
    verifie('le tarif au km décroît quand la distance augmente',
        parKm(100) > parKm(300) && parKm(300) > parKm(600), true);

    /* ⚠ LES FRAIS D'ENTRÉE SE PAIENT UNE FOIS PAR RÉSEAU, PAS UNE FOIS PAR TRAJET.
       Un Lyon → Bordeaux passe d'APRR à ASF et paie donc deux entrées. Poser
       `TOLL_ENTRY_FEE` hors de la boucle sous-estimerait tout trajet transversal —
       ce test le verrouille en comparant 200 km sur un seul réseau à 100+100 km sur
       deux, à kilométrage total rigoureusement identique. */
    const unSeulReseau  = peage(route(step('A9', 200, 115, [2.92, 42.72])));      // asf
    const deuxReseaux   = peage(route(step('A9', 100, 115, [2.92, 42.72]),        // asf
                                      step('A9', 100, 115, [2.95, 43.20]),
                                      step('A6', 100, 115, [4.85, 45.75])));      // aprr
    verifie('deux réseaux traversés = deux frais d’entrée',
        deuxReseaux > unSeulReseau, true);
    /* Et deux steps du MÊME réseau ne paient qu'une entrée — sinon le montant
       dépendrait du découpage arbitraire des steps par Mapbox, exactement le défaut
       dont on cherchait à sortir. */
    verifieProche('deux steps du même réseau = une seule entrée',
        peage(route(step('A9', 100, 115, [2.92, 42.72]), step('A9', 100, 115, [2.95, 43.20]))),
        unSeulReseau, 1e-9);

    /* ═══ SECTIONS PAYANTES DÉCLARÉES PAR MAPBOX (23/08/2026) ════════════════════
       Le chemin PRINCIPAL depuis cette date. Tous les cas ci-dessus exercent le repli
       par `ref` : leurs routes n'ont ni `annotation` ni `intersections`, exactement
       comme une réponse Mapbox amputée. Les cas ci-dessous portent la donnée réelle.

       ⚠ CE QUE CES TESTS VERROUILLENT. La conception précédente reposait sur une
       affirmation fausse — « Mapbox ne renvoie aucun drapeau tronçon payant » — qui a
       produit quatre bugs successifs, tous des tentatives de reconstituer à la main
       une information déjà déclarée. Si quelqu'un réécrit un jour ce calcul en
       repartant de `ref` seul, ces tests doivent l'arrêter. */

    /* Route porteuse de `classes`. Chaque tronçon = un segment d'`annotation.distance`
       et une intersection qui pointe dessus, ce qui est la forme réelle de la réponse.
       `payant` pose la classe « toll » que Mapbox met sur les tronçons à péage. */
    const routeClasses = (...troncons) => {
        const distances = troncons.map(t => t.km * 1000);
        const steps = troncons.map((t, i) => ({
            ref: t.ref, distance: t.km * 1000, duration: (t.km / 110) * 3600,
            maneuver: { location: t.loc || [3.0, 43.5] },
            intersections: [{
                geometry_index: i, location: t.loc || [3.0, 43.5],
                classes: t.payant ? ['motorway', 'toll'] : ['motorway'],
            }],
        }));
        return { legs: [{ steps, annotation: { distance: distances } }] };
    };
    const tr = (ref, km, payant, loc) => ({ ref, km, payant, loc });

    verifieProche('section payante déclarée : entrée + km, au tarif recalibré',
        peage(routeClasses(tr('A9', 100, true, [2.92, 42.72]))),
        (N.TOLL_ENTRY_FEE + N.TOLL_KM_RATE * 100) * N.TOLL_NETWORK_FACTOR.asf, 1e-6);

    /* ⚠ LE BUG QUI A RÉSISTÉ LE PLUS LONGTEMPS, ENFIN VERROUILLÉ. Un step tagué « E 11 »
       seul couvrant l'A75 gratuite héritait d'APRR par continuité et facturait 501 km
       sur Paris → Montpellier — le « point ouvert, diagnostiqué mais non corrigé » de
       docs/peages.md. Avec les classes, la continuité ne décide plus que du
       concessionnaire : un tronçon non tagué « toll » ne coûte rien, quel que soit le
       réseau dont il hérite. */
    verifie('euroroute seule sur voie GRATUITE : 0 €, malgré la continuité de réseau',
        peage(routeClasses(tr('A71', 80, true, [3.1, 46.0]), tr('E 11', 300, false, [3.2, 44.5]))) > 0
        && peage(routeClasses(tr('A71', 80, true, [3.1, 46.0]), tr('E 11', 300, false, [3.2, 44.5])))
           < peage(routeClasses(tr('A71', 80, true, [3.1, 46.0]))) + 0.01, true);

    /* ⚠ DEUX SYSTÈMES FERMÉS, DEUX ENTRÉES. Mesuré sur Perpignan → Paris : facturer une
       seule entrée par concessionnaire sous-estimait de 17 %, l'A75 gratuite y coupant
       le trajet en deux. Même réseau des deux côtés : seule la coupure compte. */
    const coupeLong = peage(routeClasses(
        tr('A9', 100, true, [2.92, 42.72]),
        tr('A75', 60, false, [3.2, 44.5]),          // > TOLL_SECTION_GAP_KM
        tr('A9', 100, true, [3.0, 45.5])));
    const dUnTrait = peage(routeClasses(tr('A9', 200, true, [2.92, 42.72])));
    verifieProche('interruption gratuite longue : une deuxième entrée est facturée',
        coupeLong - dUnTrait, N.TOLL_ENTRY_FEE * N.TOLL_NETWORK_FACTOR.asf, 1e-6);

    /* Le symétrique, et c'est lui qui justifie le seuil : un trou court est un défaut de
       tagage au milieu d'une même autoroute, pas une sortie. Sous 20 km, Paris → Le Havre
       se découpait en cinq entrées sur une seule A13 et surestimait de 8 €. */
    verifieProche('interruption gratuite courte : une seule entrée, le trou est un défaut de tagage',
        peage(routeClasses(tr('A13', 100, true, [1.0, 49.3]),
                           tr('A13', 5, false, [0.8, 49.4]),
                           tr('A13', 100, true, [0.6, 49.4]))),
        (N.TOLL_ENTRY_FEE + N.TOLL_KM_RATE * 200) * N.TOLL_NETWORK_FACTOR.sapn, 1e-6);

    /* L'AP-7 espagnole EST payante et Mapbox la tague « toll » — mais au tarif espagnol.
       `_horsReseauPeageFr()` garde donc sa raison d'être, réduite à ce seul rôle. */
    verifie('tronçon payant à l’étranger : exclu du calcul français',
        peage(routeClasses(tr('AP-7', 150, true, [2.0, 41.6]))), 0);

    /* ⚠ LE REPLI RESTE OBLIGATOIRE — et `null` doit se distinguer d'un trajet gratuit.
       Une réponse sans `classes` n'est pas une route sans péage : c'est une route dont
       on ignore le péage. Afficher « Aucun » sur un Paris-Marseille serait un calcul
       faux en silence, le mode de panne que ce fichier existe pour attraper. */
    const sansClasses = { legs: [{ annotation: { distance: [200000] }, steps: [
        { ref: 'A9', distance: 200000, duration: 6260, maneuver: { location: [2.92, 42.72] },
          intersections: [{ geometry_index: 0, location: [2.92, 42.72] }] }] }] };
    verifie('aucune classe dans la réponse : on retombe sur le repli par ref',
        peage(sansClasses) > 15, true);
    /* Même exigence quand c'est `annotation.distance` qui manque : sans lui aucune
       longueur de tronçon n'est mesurable, la classe seule ne suffit pas. */
    const sansAnnotation = { legs: [{ steps: [
        { ref: 'A9', distance: 200000, duration: 6260, maneuver: { location: [2.92, 42.72] },
          intersections: [{ geometry_index: 0, location: [2.92, 42.72], classes: ['toll'] }] }] }] };
    verifie('annotation.distance absente : on retombe sur le repli par ref',
        peage(sansAnnotation) > 15, true);

    // ── Ce qui ne doit RIEN coûter ──────────────────────────────────────────────
    /* A75 : 340 km d'autoroute gratuite. Au taux forfaitaire précédent elle coûtait
       27 € — l'erreur symétrique de celle de Perpignan, et jamais remarquée parce
       qu'elle allait dans le sens qui n'inquiète pas. */
    verifie('A75 gratuite : 0 €', peage(route(step('A75', 340, 115, [3.2, 44.5]))), 0);
    /* Autopista espagnole. Le tiret est le seul discriminant : aucune latitude ne
       sépare Perpignan (42,70) de Figueres (42,27). */
    verifie('AP-7 espagnole : 0 €', peage(route(step('AP-7', 150, 115, [2.8, 41.9]))), 0);
    verifie('A-2 espagnole : 0 €', peage(route(step('A-2', 150, 115, [2.0, 41.6]))), 0);
    /* Plancher urbain : une bretelle d'autoroute payante de 12 km ne se facture pas. */
    verifie('sous le plancher de 15 km : 0 €', peage(route(step('A6', 12, 110, [4.85, 45.75]))), 0);
    /* Un `ref` PRÉSENT mais non autoroutier est une information, pas une lacune : il
       ne doit jamais retomber dans le repli par vitesse. Une 2×2 voies gratuite
       parcourue à 100 km/h était facturée par l'ancienne version. */
    verifie('D900 à 100 km/h : 0 €', peage(route(step('D900', 60, 100, [5.0, 44.0]))), 0);
    verifie('route absente : 0 €', peage(null), 0);
    verifie('route sans legs : 0 €', peage({}), 0);
    verifie('legs vides : 0 €', peage({ legs: [] }), 0);

    // ── Le repli, quand Mapbox ne renvoie aucun `ref` ───────────────────────────
    /* ⚠ SANS CE REPLI, UNE RÉPONSE SANS `ref` AFFICHERAIT « Aucun » SUR UN
       PARIS-MARSEILLE — un calcul faux, en silence, sans exception. On retombe sur
       l'heuristique de vitesse, débarrassée de ses rectangles de pays. */
    const sansRef = route(step(null, 200, 120, [4.0, 45.0]), step(null, 5, 30, [4.9, 45.7]));
    verifie('aucun ref dans la réponse : le repli chiffre quand même', peage(sansRef) > 15, true);
    /* Mais dès qu'UN seul step porte un ref exploitable, le repli se tait : mélanger
       les deux compterait deux fois les mêmes kilomètres. */
    const mixte = route(step('A6', 200, 120, [4.0, 45.0]), step(null, 100, 120, [4.9, 45.7]));
    verifieProche('un seul ref suffit à désactiver le repli',
        peage(mixte), peage(route(step('A6', 200, 120, [4.0, 45.0]))), 1e-9);

    // ── Lecture du champ `ref` ──────────────────────────────────────────────────
    verifie('ref simple', refFr('A9'), '9');
    verifie('ref avec espace', refFr('A 9'), '9');
    verifie('euroroute ignorée, autoroute retenue', refFr('E15;A9'), '9');
    verifie('euroroute seule : pas un réseau', refFr('E15'), null);
    verifie('autopista écartée même accompagnée', refFr('E15;AP-7'), null);
    verifie('départementale', refFr('D900'), null);
    verifie('nationale', refFr('N20'), null);
    verifie('ref vide', refFr(''), null);
    verifie('ref absent', refFr(null), null);
    verifie('A709 (trois chiffres)', refFr('A709'), '709');

    // ── Euroroute pure (continuité) ──────────────────────────────────────────────
    const { _estEuroroutePure: euroPure } = N;
    verifie('E80 seul : euroroute pure', euroPure('E80'), true);
    verifie('E 80 avec espace : euroroute pure', euroPure('E 80'), true);
    verifie('E15;E90 : deux euroroutes, toujours pure', euroPure('E15;E90'), true);
    verifie('E15;A9 : mélangée avec une autoroute, pas pure', euroPure('E15;A9'), false);
    verifie('D900 : pas une euroroute', euroPure('D900'), false);
    verifie('vide : pas une euroroute', euroPure(''), false);
    verifie('absent : pas une euroroute', euroPure(null), false);

    // ── Frontières grossières, et assumées comme telles ─────────────────────────
    verifie('Perpignan reste en France', horsFr(2.90, 42.69), false);
    verifie('Marseille reste en France', horsFr(5.38, 43.30), false);
    verifie('Turin est hors réseau français', horsFr(7.69, 45.07), true);
    verifie('coordonnées inexploitables : on ne présume pas l’étranger',
        horsFr(NaN, NaN), false);

    /* ⚠ LA FRONTIÈRE FRANCO-BELGE EST INCLINÉE — c'est ce que `lat > 50.6` ne savait
       pas faire. Elle descend de 51,09 à Bray-Dunes à 50,44 à Hensies : une latitude
       unique posée assez haut pour garder Lille en France laisse tout le Hainaut belge
       du côté français. Ces quatre cas encadrent la droite des deux côtés. */
    verifie('Lille reste en France', horsFr(3.06, 50.63), false);
    verifie('Valenciennes reste en France', horsFr(3.52, 50.36), false);
    verifie('Mons (Belgique) est hors réseau français', horsFr(3.95, 50.45), true);
    verifie('Bruxelles est hors réseau français', horsFr(4.35, 50.85), true);
    /* Le plancher à 49,5 : Thionville est française, le Luxembourg commence à 49,6. */
    verifie('Thionville reste en France', horsFr(6.17, 49.36), false);
    verifie('Luxembourg-ville est hors réseau français', horsFr(6.13, 49.61), true);

    // ── Paris → Bruxelles : le step qui traverse la frontière ──────────────────
    /* ⚠ MESURÉ LE 20/08/2026 : 24,01 € estimés contre 16,30 € réels — Mappy ET
       ViaMichelin donnent le même chiffre, donc aucun doute sur la référence. Le
       journal montrait `(euroroute→sanef)=156.0km` et `horsFr=8.3km` sur 306 km de
       route : la partie belge, taguée « E19 » seule, héritait de Sanef depuis l'A1, et
       le test de pays sur le seul point de DÉPART du step laissait passer 80 km belges
       d'un coup. Les autoroutes belges sont gratuites pour les voitures : tout
       kilomètre belge facturé est une erreur pure. */
    const parisBruxelles = route(
        step(null,      6, 35,  [2.34, 48.87]),   // sortie de Paris
        step('A1',  137.7, 115, [2.40, 49.00]),
        step('E19',  56.0, 115, [3.30, 50.10]),   // A1/A2 françaises, taguées E seule
        step('E19',   8.0, 115, [3.60, 50.35]),   // step qui FRANCHIT la frontière
        step('E19',  92.0, 115, [3.70, 50.50]),   // ⚠ BELGE : démarre à peine au-delà
        step(null,      6, 35,  [4.35, 50.84]),   // arrivée Bruxelles
    );
    const coutBruxelles = peage(parisBruxelles);
    verifie('Paris → Bruxelles : la Belgique n’est plus facturée',
        coutBruxelles < 20, true);
    verifieProche('Paris → Bruxelles ≈ 16,30 € réels', coutBruxelles, 16.30, 2.20);
    /* Verrou sur le symptôme exact : 24,01 € était le montant mesuré avec les deux
       défauts. Y revenir signifie qu'un des deux a été défait. */
    verifie('Paris → Bruxelles : plus jamais 24 €', coutBruxelles < 21, true);

    /* ⚠ LE TEST DES DEUX EXTRÉMITÉS, ISOLÉ. Le step de 92 km démarre à lat 50,50, à
       peine au-delà de la frontière : c'est son POINT DE DÉPART qui le trahit ici. Mais
       un step qui démarre en France et finit en Belgique n'est détectable que par sa
       fin — et c'est le cas que l'ancien code laissait passer en entier. Ce test le
       vérifie seul : un unique step de 100 km partant côté français et arrivant à
       Bruxelles ne doit RIEN coûter. */
    const stepTraversant = route(
        step('A1', 100, 115, [2.40, 49.00]),   // départ français
        step(null,   1, 30, [4.35, 50.84]),    // …arrivée à Bruxelles
    );
    verifie('un step qui FINIT à l’étranger est écarté (pas seulement ceux qui y commencent)',
        peage(stepTraversant), 0);

    // ── Affichage ───────────────────────────────────────────────────────────────
    /* Pas de centimes sur un nombre deviné : le coût carburant affiché juste au-dessus
       vient d'une vraie source, celui-ci non, et l'arrondi est le seul signal qui le dit. */
    verifie('arrondi à l’euro', afficher(32.192), '~32 €');
    verifie('arrondi supérieur', afficher(30.7), '~31 €');
    verifie('zéro : Aucun', afficher(0), 'Aucun');
    verifie('négatif : Aucun', afficher(-3), 'Aucun');
    verifie('NaN : Aucun', afficher(NaN), 'Aucun');
    verifie('undefined : Aucun', afficher(undefined), 'Aucun');
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

    /* ⚠ CES QUATRE-LÀ SONT LA RAISON D'ÊTRE DU CONTOUR (03/09/2026). Avec les seuls
       rectangles, Lille et Valenciennes rendaient « fr+be » — un aller-retour Overpass
       de 2,1 s pour rien, ET des stations françaises étiquetées belges, donc affichées
       sans prix à côté des mêmes fiches data.gouv qui, elles, portaient leur prix
       (27 fiches → 56 à Lille). Aucun réglage de bornes ne peut les corriger : la boîte
       « fr » contient Bruxelles, la boîte « be » contient Lille. */
    verifie('Lille : plus jamais détectée belge',        pays([[3.0573, 50.6292]]), ['fr']);
    verifie('Valenciennes non plus',                    pays([[3.5234, 50.3580]]), ['fr']);
    verifie('Bruxelles : plus jamais détectée française', pays([[4.3517, 50.8503]]), ['be']);
    /* Une bulle à cheval DOIT rendre les deux : l'union n'était pas le défaut, la
       géométrie qui la nourrissait l'était. */
    verifie('Mouscron ↔ Halluin : les deux pays',
        pays([[3.2064, 50.7378], [3.1264, 50.7856]]).sort().join('+'), 'be+fr');
}

// ── Pays d'un point : le contour, pas le rectangle ───────────────────────────────
section('Pays du point');
{
    const { paysDuPoint: ou } = N;

    /* Villes de contrôle du balayage de tolérance. Halluin (FR) et Menin (BE) sont
       séparées d'un kilomètre : c'est la paire qui a fait rejeter la simplification à
       0,02°, laquelle basculait Halluin en Belgique. */
    verifie('Lille est française',       ou(3.0573, 50.6292), 'fr');
    verifie('Halluin est française',     ou(3.1264, 50.7856), 'fr');
    verifie('Maubeuge est française',    ou(3.9724, 50.2795), 'fr');
    verifie('Longwy est française',      ou(5.7614, 49.5197), 'fr');
    verifie('Menin est belge',           ou(3.1214, 50.7975), 'be');
    verifie('Mouscron est belge',        ou(3.2064, 50.7378), 'be');
    verifie('Tournai est belge',         ou(3.3874, 50.6071), 'be');
    verifie('Arlon est belge',           ou(5.8114, 49.6833), 'be');
    verifie('Ostende est belge',         ou(2.9187, 51.2247), 'be');
    /* Le Luxembourg est testé AVANT la Belgique : il est inclus dans l'emprise de la
       boîte belge, l'ordre inverse le rendrait invisible. */
    verifie('Luxembourg-ville',          ou(6.1319, 49.6117), 'lu');
    verifie('Esch-sur-Alzette',          ou(5.9806, 49.4958), 'lu');
    verifie('Paris est française',       ou(2.3522, 48.8566), 'fr');
    verifie('Barcelone est espagnole',   ou(2.1700, 41.3900), 'es');
    /* La frontière pyrénéenne, dans les deux sens : la boîte « fr » descend à 41,3° et
       contient Barcelone, la boîte « es » monte à 43,8° et contient Perpignan. Seul le
       contour peut les départager. Hendaye et Irún ne sont séparées que par la Bidassoa. */
    verifie('Perpignan reste française', ou(2.8954, 42.6976), 'fr');
    verifie('Figueres est espagnole',    ou(2.9614, 42.2662), 'es');
    verifie('Hendaye est française',     ou(-1.7742, 43.3589), 'fr');
    verifie('Irun est espagnole',        ou(-1.7889, 43.3378), 'es');
    verifie('hors des quatre pays → null', ou(-70, 40), null);
    verifie('coordonnées absentes → null', ou(undefined, 50), null);
}

// ── Compte à rebours hebdomadaire ───────────────────────────────────────────────
section('Fin de semaine');
{
    const { getTimeUntilEndOfWeek: reste } = N;

    /* ⚠ DURÉE SEULE, sans « restants » (22/08/2026) : la pastille du panneau Objectifs
       porte déjà la légende « Temps restant » sous elle. Ces assertions sont ce qui
       empêche le mot de revenir par inadvertance dans le noyau. */
    // Lundi 10/08/2026 à 00:00 → dimanche 16/08 23:59:59, soit 6 j 23 h.
    verifie('lundi minuit', reste(new Date(2026, 7, 10, 0, 0, 0)), '6j 23h');
    // Samedi 15/08 à 18:00 → dimanche 23:59:59, soit 1 j 5 h (l'affichage de l'app).
    verifie('samedi 18 h', reste(new Date(2026, 7, 15, 18, 0, 0)), '1j 5h');
    /* Dimanche : la semaine se termine LE JOUR MÊME, pas dans sept jours. C'est le
       cas limite du calcul `dayOfWeek === 0 ? 0 : 7 - dayOfWeek`. */
    verifie('dimanche matin : 0 jour restant', reste(new Date(2026, 7, 16, 8, 0, 0)), '0j 15h');
    verifie('dimanche 23 h : dernière heure', reste(new Date(2026, 7, 16, 23, 0, 0)), '0j 0h');
}

// ── Arrivée : constatée ou déclarée ─────────────────────────────────────────────
section('Arrivée');
{
    const { ARRIVAL_AUTO_M: AUTO, ARRIVAL_ASSERT_M: ASSERT } = N;

    /* Ces deux seuils ne se valent pas, et c'est tout l'enjeu.

       `AUTO` (50 m) est une CONSTATATION du GPS, et la seule chose qui termine un trajet
       sans geste de l'utilisateur. Le figer ici empêche qu'on « l'élargisse un peu » pour
       couvrir le stationnement : à 50 km/h, 300 m se parcourent en 22 s — on annoncerait
       l'arrivée à quelqu'un qui roule encore, en effaçant son tracé et en coupant son
       guidage. Un trajet ne se termine que lorsqu'on est ARRIVÉ à l'adresse.

       `ASSERT` (500 m) ne fait rien apparaître à l'écran : il borne seulement la bulle 🏁
       de la hotbox, un geste délibéré (appui long puis sélection) pour le cas où l'on
       s'est garé plus loin. Un bouton central l'a exposé quelques heures le 21/08/2026 et
       a été retiré : posé au milieu de l'écran alors qu'il restait 400 m à parcourir, il
       proposait de couper le guidage à quelqu'un qui en avait encore besoin, et un appui
       distrait au feu rouge suffisait à en faire une erreur. Ne pas le rétablir.

       Il n'y a donc PAS de fonction à tester ici — seulement deux constantes dont la
       valeur porte une décision de conception. Ce sont ces deux lignes qui la fixent. */
    verifie('seuil de constatation', AUTO, 50);
    verifie('seuil de déclaration', ASSERT, 500);
}

// ── Historique des trajets ──────────────────────────────────────────────────────
section('Historique des trajets');
{
    const { formatTripDayLabel: jourT, formatTripTime: heureT, formatTripDuration: duree,
            formatTripDistance: dist, tripPlacesLabel: lieux } = N;

    /* ⚠ LE PIÈGE PRINCIPAL : « hier » est une question de calendrier, pas de délai.
       Les deux cas suivants échouent tous les deux si l'on écrit
       `Math.floor((now - ts) / 86400000)`, et ils échouent en sens INVERSE — un
       « aujourd'hui » annoncé hier, et un « hier » annoncé avant-hier. C'est pour ça
       qu'ils sont tous les deux ici : corriger l'un en biaisant l'arrondi casse
       l'autre en silence. */
    // 45 minutes d'écart seulement, mais la nuit est passée : c'est hier.
    verifie('23 h 30 vu à 00 h 15 → hier, malgré 45 min d\'écart',
        jourT(new Date(2026, 7, 20, 23, 30).getTime(), new Date(2026, 7, 21, 0, 15)),
        'Hier');
    // 23 heures d'écart, mais on n'a franchi qu'un seul minuit : c'est bien hier, pas avant-hier.
    verifie('08 h 00 vu le lendemain à 07 h 00 → hier, pas avant-hier',
        jourT(new Date(2026, 7, 20, 8, 0).getTime(), new Date(2026, 7, 21, 7, 0)),
        'Hier');

    verifie('même jour → Aujourd\'hui',
        jourT(new Date(2026, 7, 21, 14, 32).getTime(), new Date(2026, 7, 21, 19, 0)),
        "Aujourd'hui");
    /* Au-delà d'hier : jour de semaine + quantième SEULS. Ni mois ni année — les
       sections parentes du regroupement les portent déjà, les répéter sur chaque
       en-tête de jour serait du bruit. */
    verifie('au-delà d\'hier → jour de semaine + quantième',
        jourT(new Date(2026, 7, 18, 18, 40).getTime(), new Date(2026, 7, 21, 9, 0)),
        'mar. 18');
    verifie('horodatage invalide → texte, jamais NaN', jourT(undefined, new Date(2026, 7, 21)), 'Date inconnue');

    // L'heure est portée par la ligne, plus par l'en-tête de jour.
    verifie('heure sur deux chiffres', heureT(new Date(2026, 7, 21, 9, 5).getTime()), '09:05');
    verifie('minuit', heureT(new Date(2026, 7, 21, 0, 0).getTime()), '00:00');
    verifie('heure invalide → tirets, jamais NaN', heureT(undefined), '--:--');

    // Durées : les minutes restent affichées au-delà de l'heure, sans quoi 1 h 05 et
    // 1 h 55 se liraient identiquement dans la liste.
    verifie('durée sous la minute', duree(0.4), '< 1 min');
    verifie('durée en minutes', duree(42.6), '43 min');
    verifie('une heure pile', duree(60), '1 h 00');
    verifie('heures + minutes sur deux chiffres', duree(65), '1 h 05');
    verifie('durée absente → tiret, pas NaN', duree(undefined), '—');
    verifie('durée négative → tiret', duree(-3), '—');
    // Zéro est une durée valide (trajet arrêté aussitôt), pas une absence de donnée.
    verifie('zéro minute reste une durée', duree(0), '< 1 min');

    verifie('distance sous le km en mètres', dist(0.34), '340 m');
    verifie('distance en km', dist(12.34), '12.3 km');
    verifie('distance absente → tiret', dist(null), '—');
    verifie('zéro km reste une distance', dist(0), '0 m');

    // Lieux : les quatre formes d'entrée que la liste doit savoir rendre.
    verifie('départ et arrivée connus',
        lieux({ from: 'Domicile', to: 'Gare de Lyon' }).libelle, 'Domicile → Gare de Lyon');
    /* L'adresse Mapbox complète est coupée sur la première virgule : sans ça, la ligne
       déborde et la commune mange le nom du lieu. */
    verifie('adresse complète tronquée à la commune',
        lieux({ from: '12 Rue de la Paix, 75002 Paris, France', to: 'Lille, Nord, France' }).libelle,
        '12 Rue de la Paix → Lille');
    verifie('trajet libre nommé comme tel', lieux({ free: true }).libelle, 'Trajet libre');
    /* Un trajet libre part de quelque part mais ne va nulle part de prévu. « Domicile → ? »
       laisserait croire à une destination perdue, alors qu'il n'y en a jamais eu. Ce cas
       doit donc passer AVANT celui du départ seul, qui reste reserve au trajet guidé. */
    verifie('trajet libre avec départ connu', lieux({ from: 'Domicile', free: true }).libelle,
        'Trajet libre depuis Domicile');
    verifie('départ seul hors trajet libre → destination manquante', lieux({ from: 'Domicile' }).libelle,
        'Domicile → ?');
    /* Une destination saisie EN COURS de trajet libre reprend la main : `stopCourse()`
       remet alors `free` à faux, mais la fonction doit rester juste si les deux arrivent
       ensemble. */
    verifie('trajet libre ayant reçu une destination', lieux({ from: 'Domicile', to: 'Lyon', free: true }).libelle,
        'Domicile → Lyon');
    /* LE CAS DE COMPATIBILITÉ : les entrées archivées avant l'ajout des lieux n'ont ni
       `from` ni `to` ni `free`. `libelle` DOIT valoir null — c'est ce null qui dit à
       js/13 de n'afficher aucune ligne de lieu, plutôt qu'une ligne vide ou
       « undefined → undefined ». */
    verifie('entrée d\'avant les lieux → aucun libellé', lieux({ distKm: 12 }).libelle, null);
    verifie('entrée absente ne lève pas', lieux(undefined).libelle, null);
    verifie('chaîne vide traitée comme absente', lieux({ from: '   ', to: 'Lyon' }).libelle, '→ Lyon');
}

// ── Regroupement année / mois / jour ────────────────────────────────────────────
section('Historique — regroupement');
{
    const { groupTripsByDate: grouper } = N;
    const now = new Date(2026, 7, 21, 20, 0);
    const trajet = (y, m, j, h) => ({ date: new Date(y, m, j, h, 0).getTime() });

    const arbre = grouper([
        trajet(2026, 7, 21, 9),   // août, aujourd'hui
        trajet(2026, 7, 21, 18),  // août, aujourd'hui (plus tard)
        trajet(2026, 7, 3,  12),  // août, plus tôt dans le mois
        trajet(2026, 6, 30, 8),   // juillet
        trajet(2025, 7, 14, 8),   // AOÛT de l'année précédente
    ], now);

    // Ordre décroissant aux trois niveaux : le plus récent se lit sans faire défiler.
    verifie('années du plus récent au plus ancien', arbre.map(a => a.year), [2026, 2025]);
    verifie('mois du plus récent au plus ancien', arbre[0].months.map(m => m.label), ['Août', 'Juillet']);
    verifie('jours du plus récent au plus ancien', arbre[0].months[0].days.map(d => d.label),
        ["Aujourd'hui", 'lun. 03']);

    /* ⚠ LE PIÈGE QUE CE TEST FIXE : regrouper sur le LIBELLÉ et non sur des clés
       numériques. « Août » 2026 et « Août » 2025 porteraient le même titre et se
       retrouveraient fusionnés dans une seule section — un trajet de l'an dernier
       apparaîtrait au milieu de ceux de cette année. Les deux doivent rester dans
       leur année, chacune avec son propre mois d'août. */
    verifie('août 2025 ne fusionne pas avec août 2026', arbre[1].months.map(m => m.label), ['Août']);
    verifie('août 2025 garde son seul trajet', arbre[1].count, 1);

    // Les compteurs permettent d'annoncer le contenu d'une section SANS la déplier.
    verifie('compte de l\'année', arbre[0].count, 4);
    verifie('compte du mois', arbre[0].months[0].count, 3);
    verifie('compte du jour', arbre[0].months[0].days[0].count, 2);

    // Dans un même jour, le plus récent d'abord — 18 h avant 9 h.
    verifie('trajets du jour, plus récent en tête',
        arbre[0].months[0].days[0].trips.map(t => new Date(t.date).getHours()), [18, 9]);

    /* Une entrée sans horodatage exploitable n'appartient à aucun jour : l'inclure
       créerait une section « Date inconnue » posée au milieu du calendrier. On
       l'écarte, sans lever. */
    verifie('entrée sans date écartée', grouper([{ distKm: 5 }, trajet(2026, 7, 21, 9)], now)[0].count, 1);
    verifie('entrée nulle ne lève pas', grouper([null], now), []);
    verifie('liste absente ne lève pas', grouper(undefined, now), []);
    verifie('liste vide → aucun groupe', grouper([], now), []);
}

// ── Classement en ligne ─────────────────────────────────────────────────────────
section('Classement en ligne');
{
    const { _lundiISO: lundi, clampAnimauxClassement: borne,
            CLASSEMENT_ANIMAUX_MAX: PMAX, pseudoValide: valide,
            emailDePseudo: email } = N;

    /* La colonne `scores.semaine` est une clé primaire partagée : deux appareils du
       même utilisateur doivent tomber sur la MÊME chaîne le même jour, sinon le
       score se dédouble en deux lignes au lieu de s'additionner. */
    verifie('un mercredi rend le lundi qui précède', lundi(new Date(2026, 7, 26, 14)), '2026-08-24');
    verifie('le lundi se rend lui-même',             lundi(new Date(2026, 7, 24, 0, 1)), '2026-08-24');

    /* LE PIÈGE. `getDay()` rend 0 pour DIMANCHE, pas pour lundi. Un `d.getDay() - 1`
       naïf renverrait -1 le dimanche et avancerait la date d'un jour : le dimanche
       soir, tous les scores basculeraient dans la semaine SUIVANTE, une semaine
       d'écart avec le reste des joueurs. */
    verifie('DIMANCHE reste dans la semaine qui s\'achève', lundi(new Date(2026, 7, 30, 23, 59)), '2026-08-24');
    verifie('lundi suivant : nouvelle semaine',             lundi(new Date(2026, 7, 31, 0, 0)),  '2026-08-31');

    // Mois et jours sur deux chiffres : Postgres refuse `2026-8-3` en type `date`.
    verifie('mois et jour rembourrés à deux chiffres', lundi(new Date(2026, 0, 7)), '2026-01-05');
    // Franchir le 1er janvier ne doit pas rendre un lundi de l'année en cours.
    verifie('semaine à cheval sur le nouvel an', lundi(new Date(2027, 0, 1)), '2026-12-28');
    verifie('date invalide → null', lundi(new Date('n\'importe quoi')), null);

    /* Bornage : miroir du `check` SQL, testé aux deux extrémités. Ce qui voyage dans
       la colonne `scores.points` est un NOMBRE D'ANIMAUX SAUVÉS depuis le 25/08/2026
       (le nom de la colonne n'a pas suivi, voir le noyau) — donc un entier. */
    verifie('compte entier conservé',           borne(3), 3);
    verifie('décimale tronquée, jamais arrondie au-dessus', borne(2.9), 2);
    verifie('compte nul reste nul',             borne(0), 0);
    verifie('négatif ramené à zéro',            borne(-12), 0);
    verifie('au-dessus du plafond → plafond',   borne(PMAX + 1), PMAX);
    verifie('le plafond lui-même passe',        borne(PMAX), PMAX);
    /* Ce que `parseFloat` laisserait passer : la valeur vient d'un localStorage que
       l'utilisateur peut éditer à la main. */
    verifie('texte → zéro, jamais NaN',  borne('douze'), 0);
    verifie('null → zéro',               borne(null), 0);
    verifie('undefined → zéro',          borne(undefined), 0);
    verifie('Infinity → zéro',           borne(Infinity), 0);

    /* Si cette regex et la contrainte `pseudo_format` divergent, l'app accepte un
       pseudo que la base rejette : l'inscription échoue APRÈS création du compte
       auth, et l'utilisateur se retrouve avec un compte sans profil. */
    verifie('pseudo courant accepté',        valide('Pilote_75'), true);
    verifie('trop court (2) refusé',         valide('ab'), false);
    verifie('trois caractères acceptés',     valide('abc'), true);
    verifie('vingt caractères acceptés',     valide('a'.repeat(20)), true);
    verifie('vingt-et-un refusés',           valide('a'.repeat(21)), false);
    verifie('espace interne refusé',         valide('Jean Paul'), false);
    verifie('accent refusé (citext ≠ unaccent)', valide('Frédo'), false);
    verifie('non-chaîne refusée',            valide(null), false);

    /* La casse est absorbée : `profils.pseudo` est en citext, l'email doit suivre.
       Le domaine est LU depuis la constante, pas figé ici : Supabase impose son mot sur
       ce qu'il accepte (voir `PSEUDO_DOMAINE`), et un test qui bloquerait un changement
       de domaine protégerait la mauvaise chose. */
    verifie('email dérivé en minuscules', email('  Pilote_75  '), 'pilote_75@' + N.PSEUDO_DOMAINE);
    verifie('pseudo invalide → null',     email('Jean Paul'), null);
    /* Un domaine de messagerie réel ferait entrer les pseudos en collision avec les
       adresses de vraies personnes. */
    verifie('le domaine n\'est pas un service de messagerie',
        ['gmail.com', 'outlook.com', 'yahoo.fr', 'hotmail.com'].includes(N.PSEUDO_DOMAINE), false);
}

{
    section('Durée avec excès de vitesse');
    const duree = N.dureeAvecExces;

    /* Nantes-Paris : 385 km en 3 h 40 selon Mapbox, soit 105 km/h de moyenne. Le gain
       d'un excès permanent (badLevel 3, 80 % du trajet à +27,5 km/h) doit rester de
       l'ordre de la demi-heure — c'est la réponse à la question qui a motivé ce calcul,
       et le résultat est volontairement moins spectaculaire qu'attendu. */
    const t = 385 / 105;
    const rapide3 = duree(385, t, 3);
    verifie('excès permanent : gain compris entre 20 et 45 min',
        (t - rapide3) * 60 > 20 && (t - rapide3) * 60 < 45, true);

    /* ⚠ LE PIÈGE. Moyenner les vitesses au lieu des temps donne un trajet plus court que
       la réalité : ce test échouerait si quelqu'un « simplifiait » la formule en
       divisant la distance par la vitesse moyennée. */
    const faux = 385 / (105 + 0.8 * 27.5);
    verifie('la moyenne des temps ne vaut pas la moyenne des vitesses', rapide3 > faux, true);

    /* Plus on triche, moins on met de temps — et jamais l'inverse. */
    verifie('monotone en badLevel',
        duree(385, t, 1) > duree(385, t, 2) && duree(385, t, 2) > duree(385, t, 3), true);
    verifie('rouler vite ne peut pas rallonger le trajet', duree(385, t, 1) < t, true);

    /* Entrées aberrantes : la fonction rend null, jamais NaN — l'affichage sait
       montrer « -- », il ne sait pas reconnaître un NaN. */
    verifie('distance nulle → null', duree(0, 3, 1), null);
    verifie('durée nulle → null',    duree(385, 0, 1), null);
    verifie('non numérique → null',  duree('x', 3, 1), null);
    /* badLevel absent ou farfelu : on retombe sur le niveau 1 plutôt que sur NaN. */
    verifie('badLevel inconnu → niveau 1', duree(385, t, 9), duree(385, t, 1));
}


// ── La vie du compagnon ─────────────────────────────────────────────────────────
section('Vie du compagnon');
{

    const { VIE_MAX, VIE_ROBUSTESSE, severiteExces, robustesseCompagnon,
            majVie, vieApresChoc, palierVie,
            VIE_SEUIL_SANTE: SEUIL, etatSanteVie: etatSante } = N;

    /* La sévérité. Elle vaut 1 au dépassement de référence (+20 %) : c'est sur ce
       point que toute la calibration des dégâts est accrochée. */
    verifie('+20 % de la limite → sévérité 1', severiteExces(60, 50), 1);
    verifie('à la limite → aucun excès',       severiteExces(50, 50), 0);
    verifie('sous la limite → aucun excès',    severiteExces(40, 50), 0);
    /* ⚠ LES DEUX BORNES. Sans plancher, un dépassement d'un cheveu ne coûterait
       presque rien et la barre mentirait ; sans plafond, un point GPS aberrant
       (ou une pointe à 200 en zone 30) viderait la jauge d'un seul coup. */
    verifie('petit dépassement : plancher',  severiteExces(51, 50), 0.4);
    verifie('énorme dépassement : plafond',  severiteExces(200, 30), 2.5);
    verifie('limite absente → aucun excès',  severiteExces(90, 0), 0);
    verifie('limite non numérique → 0',      severiteExces(90, null), 0);

    /* La robustesse, c'est la difficulté. Une clé inconnue ne doit JAMAIS rendre
       NaN : la jauge deviendrait un `width: NaN%` silencieux. */
    verifie('compagnon inconnu → robustesse 1', robustesseCompagnon('licorne'), 1);
    verifie('clé absente → robustesse 1',       robustesseCompagnon(undefined), 1);
    /* ⚠ ROBUSTESSE NEUTRALISÉE LE 26/08/2026 : toute la troupe est à 1 le temps de caler
       la dureté de base sur route (cf. VIE_ROBUSTESSE dans le noyau). Ce test remplace
       « bulle est le plus robuste » — un `Math.max` aurait continué à passer sur des
       valeurs toutes égales, sans rien prouver du tout. Il tombera le jour où on
       rétablira l'échelle, et c'est exactement ce qu'on veut : le rétablissement doit
       être un geste conscient qui repasse ici. */
    verifie('robustesse neutralisée : toute la troupe à 1',
        Object.keys(VIE_ROBUSTESSE).every(k => VIE_ROBUSTESSE[k] === 1), true);
    /* Les deux compagnons d'A_VENIR (js/22) ont déjà leur vie : sans ça, les
       débloquer les ferait tomber sur la robustesse par défaut sans que rien ne
       le signale. */
    verifie('nima a une robustesse',  typeof VIE_ROBUSTESSE.nima,  'number');
    verifie('pilou a une robustesse', typeof VIE_ROBUSTESSE.pilou, 'number');

    /* La calibration annoncée dans le noyau : 10 % de vie par 100 m d'excès franc à
       robustesse 1, soit une barre pleine vidée en 1 km (26/08/2026, cf.
       VIE_DEGAT_PAR_METRE). Ce test est le garde-fou du réglage — le changer doit être
       un geste conscient, pas un effet de bord.
       ⚠ C'est la PREMIÈRE assertion qui tient le réglage, pas la seconde : « vide la
       barre » reste vrai pour toute pente plus raide que la bonne (le résultat est
       borné à 0), donc seule une mesure qui ne touche pas la borne distingue le bon
       réglage d'un dix fois trop dur. On mesure donc sur 100 m, l'unité même dans
       laquelle le réglage est énoncé. */
    verifie('100 m d\'excès à +20 % coûtent 10 % de vie (robustesse 1)',
        majVie(VIE_MAX, 100, { enExces: true, vitesse: 60, limite: 50 }), 90);
    verifie('1 km d\'excès à +20 % vide la barre (robustesse 1)',
        majVie(VIE_MAX, 1000, { enExces: true, vitesse: 60, limite: 50 }), 0);
    verifie('20 km propres refont la barre (robustesse 1)',
        majVie(0, 20000, { enExces: false }), VIE_MAX);

    /* Tant que la robustesse est neutralisée, deux compagnons doivent se comporter
       EXACTEMENT pareil — c'est la vérification que la neutralisation traverse bien
       `majVie()` des deux côtés, dégâts ET soins. Le mécanisme lui-même n'a pas été
       retiré du noyau : la paire d'assertions d'origine (« le tigre encaisse plus /
       se soigne moins que l'hippopotame », avec `>` et `<`) est à remettre telle
       quelle le jour où on rétablit l'échelle.
       ⚠ MESURER SUR 100 m, PAS SUR 1 km : depuis le réglage du 26/08/2026, 1 km d'excès
       met tout le monde à 0 par bornage, et deux zéros sont égaux quoi qu'on fasse à la
       robustesse — l'assertion passerait même si la neutralisation était incomplète. */
    const degatRaya  = VIE_MAX - majVie(VIE_MAX, 100, { enExces: true, vitesse: 60, limite: 50, compagnon: 'raya' });
    const degatBulle = VIE_MAX - majVie(VIE_MAX, 100, { enExces: true, vitesse: 60, limite: 50, compagnon: 'bulle' });
    verifie('robustesse neutralisée : tous encaissent pareil', degatRaya, degatBulle);
    const soinRaya  = majVie(0, 1000, { enExces: false, compagnon: 'raya' });
    const soinBulle = majVie(0, 1000, { enExces: false, compagnon: 'bulle' });
    verifie('robustesse neutralisée : tous se soignent pareil', soinRaya, soinBulle);
    /* Le compagnon ne change plus rien, mais il ne doit pas non plus DÉCALER le
       résultat par rapport au calcul sans compagnon (une clé neutralisée et une clé
       inconnue doivent tomber sur la même valeur). */
    verifie('un compagnon neutralisé équivaut à pas de compagnon',
        degatRaya, VIE_MAX - majVie(VIE_MAX, 100, { enExces: true, vitesse: 60, limite: 50 }));

    /* Le bornage. Une vie ne sort jamais de [0, 100] : au-delà, `width` en CSS
       déborderait la piste, en deçà elle passerait derrière le cœur. */
    verifie('jamais au-dessus de 100', majVie(98, 100000, { enExces: false }), VIE_MAX);
    verifie('jamais en dessous de 0',
        majVie(2, 100000, { enExces: true, vitesse: 200, limite: 30 }), 0);
    /* ⚠ `metres <= 0` REND LA VALEUR BORNÉE, pas la valeur telle quelle : c'est ce
       qui permet à js/24 d'assainir une valeur venue de localStorage sans second
       chemin de code. Un `return vie` naïf casserait cet usage en silence. */
    verifie('valeur corrompue assainie par majVie(v, 0)', majVie(300, 0), VIE_MAX);
    verifie('valeur négative assainie par majVie(v, 0)',  majVie(-40, 0), 0);
    verifie('vie absente → pleine',   majVie(undefined, 0), VIE_MAX);
    verifie('vie non numérique → pleine', majVie('abcd', 0), VIE_MAX);
    verifie('distance nulle ne bouge rien', majVie(50, 0, { enExces: false }), 50);
    verifie('distance négative ne soigne pas', majVie(50, -1000, { enExces: false }), 50);

    /* Le choc éco (freinage / accélération brusque). `facteur` est celui de
       `_applyEcoPenalty()` (js/13), déjà plafonné à 2 chez lui — on le replafonne
       ici, parce qu'une fonction du noyau ne fait confiance à aucun appelant. */
    verifie('un choc entame la vie', vieApresChoc(100, 1, 'babi') < 100, true);
    verifie('choc plafonné à facteur 2',
        vieApresChoc(100, 50, 'babi'), vieApresChoc(100, 2, 'babi'));
    /* ⚠ SUITE DE LA NEUTRALISATION DE LA ROBUSTESSE (voir plus haut, « toute la troupe
       à 1 »). L'assertion qui vivait ici — « le fragile encaisse plus le choc »,
       `raya` < `bulle` — était le dernier vestige de l'échelle d'origine : elle
       échouait depuis le 27/08/2026 (commit 5a3d1e6, qui le signalait sans la
       reprendre). Confirmé le 03/09/2026 : le choix d'un animal est esthétique, pas un
       choix de difficulté.
       On vérifie donc l'ÉGALITÉ, et elle tombera le jour où l'échelle reviendra —
       même intention que le test de la table plate, qu'elle prolonge côté choc. */
    verifie('tous les compagnons encaissent le choc pareil',
        vieApresChoc(100, 1, 'raya') === vieApresChoc(100, 1, 'bulle'), true);
    verifie('choc sans amplitude ne fait rien', vieApresChoc(60, 0, 'babi'), 60);
    verifie('un choc ne passe pas sous zéro', vieApresChoc(0.5, 2, 'nima'), 0);

    /* Les paliers pilotent la couleur ET la classe CSS du battement de cœur. La
       liste est ORDONNÉE : un tri malencontreux rendrait toujours le premier seuil. */
    verifie('barre pleine → palier plein',   palierVie(100).niveau, 'plein');
    verifie('75 % → plein (borne incluse)',  palierVie(75).niveau,  'plein');
    verifie('40 % → moyen',                  palierVie(40).niveau,  'moyen');
    verifie('5 % → critique',                palierVie(5).niveau,   'critique');
    verifie('0 % → critique',                palierVie(0).niveau,   'critique');
    verifie('valeur aberrante → un palier quand même', typeof palierVie(NaN).niveau, 'string');
    verifie('chaque palier a une couleur', palierVie(40).couleur.charAt(0), '#');

    /* L'état affiché en fin de trajet (25/08/2026). Les DEUX seuils annoncés sont
       stricts : c'est ce qui laisse le point d'équilibre à `repos` plutôt que de le
       verser arbitrairement d'un côté. */
    verifie('vie pleine → ravi',            etatSante(100), 'ravi');
    verifie('juste au-dessus du seuil → ravi',   etatSante(50.1), 'ravi');
    verifie('le seuil exact → repos',       etatSante(SEUIL), 'repos');
    verifie('juste en dessous → secoué',    etatSante(49.9), 'secoue');
    verifie('barre vide → secoué',          etatSante(0), 'secoue');
    /* Une vie illisible ne doit pas afficher un animal en détresse : le doute
       profite au compagnon, comme dans `majVie()`. */
    verifie('valeur aberrante → ravi',      etatSante(NaN), 'ravi');
    verifie('au-delà de 100 → borné, puis ravi', etatSante(300), 'ravi');

    /* ═══ L'ÉTAT PHYSIQUE (27/08/2026) — la règle qui décide de l'image, de la
       couleur du cadre et de la MORT DÉFINITIVE. Ses seuils ne sont pas ceux de
       `etatSanteVie` ci-dessus, et c'est voulu : l'un dit l'humeur, l'autre l'état
       du corps. Voir le noyau. */
    const { VIE_SEUIL_BLESSE: SEUIL_B, etatPhysiqueVie: physique } = N;
    verifie('vie pleine → sain',                  physique(100), 'sain');
    verifie('juste au-dessus de 75 → sain',       physique(75.1), 'sain');
    /* ⚠ LA BORNE 75 EST BLESSÉE, PAS SAINE. « entre 1 et 75 % » inclut 75. */
    verifie('75 pile → blessé (borne incluse)',   physique(SEUIL_B), 'blesse');
    verifie('1 % → blessé',                       physique(1), 'blesse');
    /* ⚠ 0,4 % EST BLESSÉ, PAS MORT, alors que la barre affiche « 0 % » arrondi.
       Une sanction définitive ne se déclenche pas sur un arrondi d'affichage. */
    verifie('0,4 % → blessé malgré l\'affichage', physique(0.4), 'blesse');
    verifie('0 pile → mort',                      physique(0), 'mort');
    /* Une vie négative ne peut venir que d'un stockage trafiqué : elle vaut mort,
       comme le zéro qu'elle a dépassé. */
    verifie('valeur négative → mort',             physique(-5), 'mort');
    /* ⚠ ET SURTOUT : une vie ILLISIBLE ne tue pas. Un JSON corrompu ne doit pas
       supprimer un compagnon — le doute lui profite, comme partout ailleurs. */
    verifie('valeur aberrante → sain, jamais mort', physique(NaN), 'sain');
    verifie('vie absente → sain',                 physique(undefined), 'sain');

    /* ═══ L'ÂGE D'UN COMPAGNON (03/09/2026) — affiché sous chaque animal de la
       page des sauvés, avec ses deux dates. L'instant est INJECTÉ, comme partout
       dans ce fichier : c'est ce qui rend ces vérifications possibles. */
    const { dureeVieJours: duree, texteAge: age } = N;
    const J = 86400000, T0 = Date.UTC(2026, 7, 1);   // 1er août 2026
    verifie('vivant : 12 jours écoulés',          duree(T0, null, T0 + 12 * J), 12);
    verifie('mort : on s’arrête à la date de décès', duree(T0, T0 + 5 * J, T0 + 40 * J), 5);
    /* ⚠ LE JOUR EST ENTIER : 23 h de compagnie ne font pas encore un jour. */
    verifie('23 h → 0 jour',                      duree(T0, null, T0 + 23 * 3600000), 0);
    /* ⚠ NAISSANCE INCONNUE → null, JAMAIS 0. Les compagnons antérieurs au registre
       n'ont pas de date, et un 0 se lirait « adopté aujourd'hui ». */
    verifie('naissance inconnue → null',          duree(null, null, T0), null);
    verifie('naissance illisible → null',         duree(NaN, null, T0), null);
    /* Horloge reculée ou stockage bricolé : 0, pas un âge négatif. */
    verifie('fin avant début → 0',                duree(T0, T0 - 10 * J, T0), 0);

    verifie('libellé : âge inconnu',              age(null), '—');
    verifie('libellé : le jour même',             age(0), "aujourd'hui");
    verifie('libellé : singulier',                age(1), '1 jour');
    verifie('libellé : pluriel',                  age(12), '12 jours');
    /* ⚠ BASCULE EN MOIS À 30 JOURS : « 94 jours » demande un calcul au lecteur. */
    verifie('libellé : 29 jours reste en jours',  age(29), '29 jours');
    verifie('libellé : 30 jours passe en mois',   age(30), '1 mois');
    verifie('libellé : 94 jours → 3 mois',        age(94), '3 mois');
    verifie('libellé : un an',                    age(365), '1 an');
    verifie('libellé : deux ans',                 age(800), '2 ans');
    verifie('chaîne illisible → sain',            physique('abcd'), 'sain');
    verifie('au-delà de 100 → borné, puis sain',  physique(300), 'sain');
}


// ── Heure d'arrivée ─────────────────────────────────────────────────────────────
section("Heure d'arrivée");
{
    const { heureArrivee: arrivee } = N;
    // 14h00 pile, heure locale — construit par composants pour ne pas dépendre du fuseau.
    const base = new Date(2026, 7, 25, 14, 0, 0).getTime();

    verifie('dans 32 minutes', arrivee(32 / 60, base), '14:32');
    verifie('dans 2 h 15',     arrivee(2.25, base), '16:15');
    verifie('durée nulle → maintenant', arrivee(0, base), '14:00');
    /* ⚠ LE PASSAGE DE MINUIT. Un trajet de nuit franchit le changement de jour :
       c'est `Date` qui doit le gérer, surtout pas une addition sur les heures. */
    verifie('par-dessus minuit', arrivee(11, base), '01:00');
    /* Deux chiffres TOUJOURS, y compris avant 10 h : sans le padding, « 1:5 »
       au lieu de « 01:05 » — et la colonne de chiffres se déforme à l'écran. */
    verifie('padding des deux champs', arrivee(11 + 5 / 60, base), '01:05');
    /* Un objet Date est accepté aussi bien qu'un horodatage : les deux appelants
       (js/19 passe Date.now(), un test peut passer une Date) doivent marcher. */
    verifie('accepte un objet Date', arrivee(1, new Date(base)), '15:00');

    /* Entrées aberrantes : null, jamais « NaN:NaN » à l'écran. L'affichage sait
       montrer « -- », il ne sait pas reconnaître une chaîne malformée. */
    verifie('durée non numérique → null', arrivee('x', base), null);
    verifie('durée négative → null',      arrivee(-1, base), null);
    verifie('instant absent → null',      arrivee(1, undefined), null);
    verifie('instant non numérique → null', arrivee(1, 'hier'), null);
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

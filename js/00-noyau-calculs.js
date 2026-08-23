        /* ═══════════════════════════════════════════════════════════════════════════
           NOYAU DE CALCUL — LE SEUL FICHIER TESTABLE HORS NAVIGATEUR
           ═══════════════════════════════════════════════════════════════════════════

           CONTRAT DE CE FICHIER, à respecter pour toute fonction qu'on y ajoute :

             1. AUCUNE dépendance. Ni `document`, ni `window`, ni `localStorage`, ni
                `map`, ni `turf`, ni `fetch`, ni aucune fonction des 20 autres fichiers.
                Entrées par arguments, sortie par valeur de retour, c'est tout.
             2. AUCUNE exécution au chargement. Rien que des `function` et des `const`
                de données. Le fichier peut donc être placé n'importe où dans l'ordre
                des `<script>` sans changer une seule ligne du comportement — il est
                chargé en premier par cohérence, pas par nécessité.
             3. AUCUN effet de bord. Deux appels avec les mêmes arguments rendent le
                même résultat. `getTimeUntilEndOfWeek()` respecte la règle parce que
                l'instant lui est INJECTÉ (paramètre `now`) au lieu d'être lu.

           POURQUOI CE FICHIER EXISTE. `tests/noyau.test.js` le lit, l'évalue dans un
           `new Function` et vérifie chaque fonction — sans navigateur, sans GPS, sans
           carte, en quelques millisecondes. C'est la seule partie de l'application où
           une régression se détecte AVANT d'ouvrir l'app sur un téléphone. Les bugs
           qui ont motivé sa création étaient tous ici : un dénominateur de points de
           permis pris sur le solde au lieu du maximum, un `parseInt(v) || repli` qui
           perdait le zéro, un padding de `fitBounds` non borné qui rendait un centre
           NaN. Aucun ne levait d'exception : ils calculaient un mauvais nombre, en
           silence. C'est exactement ce qu'un test attrape et qu'une relecture manque.

           ⚠ L'ORDRE ALPHABÉTIQUE DE `js/` NE DIT PLUS L'ORDRE DE CHARGEMENT : ce
           fichier se charge AVANT `00-helpers-partages.js` alors qu'il le suit dans un
           `ls`. C'est sans conséquence — voir le point 2 — mais il faut le savoir en
           lisant `index.html`, qui reste la seule source de vérité de l'ordre réel.

           Fonctions déplacées ici le 15/08/2026 depuis 00, 12, 14, 15, 16 et 17. Un
           déplacement de déclaration n'a aucun effet à l'exécution : c'est le même
           argument qui avait permis de remonter `setupAddressAutocomplete()`. Deux
           d'entre elles y gagnent même en sûreté — `_deburr()` et
           `normalizeFrHouseNumber()` vivaient dans le fichier 14 alors que
           `00-helpers-partages.js`, chargé douze fichiers plus tôt, les appelle : ça ne
           tenait que parce que ces appels ont lieu dans des gestionnaires d'événements.
           ═══════════════════════════════════════════════════════════════════════════ */


        // ═══════════════════════════════════════════════════════════════════
        // === PERMIS DE CONDUIRE ===
        // ═══════════════════════════════════════════════════════════════════

        /* Capital maximal du permis français. Lu par 14 (`initializeVehicleConfig`,
           dénominateur du « x / 12 ») et par 15 (`loadVehicleConfig` /
           `saveVehicleConfig`, valeur par défaut). */
        const LICENSE_POINTS_MAX = 12;

        /* ⚠ `parseInt(v) || repli` PERD LE ZÉRO : un conducteur à 0 point — permis
           invalidé, précisément le cas où l'information compte le plus — se voyait
           recréditer 12 points au premier enregistrement, parce que 0 est falsy. On
           teste donc la finitude, pas la véracité. Bornage à [0, LICENSE_POINTS_MAX]
           au passage : le `max` du champ HTML ne protège pas d'une valeur écrite
           directement en localStorage. */
        function _readLicensePoints(valeur, repli) {
            const n = parseInt(valeur, 10);
            if (!Number.isFinite(n)) return repli;
            return Math.min(LICENSE_POINTS_MAX, Math.max(0, n));
        }


        // ═══════════════════════════════════════════════════════════════════
        // === COÛT DE L'ÉNERGIE ===
        // ═══════════════════════════════════════════════════════════════════

        function calcEnergyCost(distKm, cfg) {
            if (cfg.type === 'electrique') {
                return (distKm / 100) * cfg.consumptionElec * cfg.elecPrice;
            } else if (cfg.type === 'hybride') {
                // Hybride : moitié thermique, moitié élec (approximation)
                const thermic = (distKm / 100) * cfg.consumption * cfg.fuelPrice * 0.5;
                const elec    = (distKm / 100) * cfg.consumptionElec * cfg.elecPrice * 0.5;
                return thermic + elec;
            } else {
                return (distKm / 100) * cfg.consumption * cfg.fuelPrice;
            }
        }


        // ═══════════════════════════════════════════════════════════════════
        // === CADRAGE DE LA CARTE ===
        // ═══════════════════════════════════════════════════════════════════

        /* Ramène un padding de fitBounds dans les limites du canevas.
           ⚠ Mapbox n'effectue AUCUN contrôle : dès que `top + bottom` atteint la hauteur
           de la carte (ou `left + right` sa largeur), la bande utile devient nulle ou
           négative, le zoom calculé n'est pas un nombre, et `cameraForBounds` construit
           un centre NaN. L'exception levée est alors
           `Invalid LngLat object: (NaN, NaN)` — elle accuse les coordonnées alors que
           celles-ci sont parfaitement valides et que le fautif est la géométrie. C'est
           l'origine, mesurée sur appareil le 14/08/2026, de l'aperçu de trajet qui
           s'affichait sans jamais cadrer l'itinéraire.
           On garantit `minBand` px de carte dans chaque axe en réduisant les deux côtés
           proportionnellement : réduire un seul déplacerait le centre du cadrage. */
        function _clampMapPadding(pad, mapW, mapH, minBand = 150) {
            const out = {
                top:    Math.max(0, Number(pad.top)    || 0),
                bottom: Math.max(0, Number(pad.bottom) || 0),
                left:   Math.max(0, Number(pad.left)   || 0),
                right:  Math.max(0, Number(pad.right)  || 0)
            };
            const ajuste = (a, b, taille) => {
                // Sur une carte plus petite que la bande souhaitée, on se rabat sur la
                // moitié de la surface : mieux vaut un cadrage serré qu'aucun cadrage.
                const dispo = Math.max(0, taille - Math.min(minBand, taille * 0.5));
                const somme = a + b;
                if (somme <= dispo || somme <= 0) return [a, b];
                const k = dispo / somme;
                return [Math.floor(a * k), Math.floor(b * k)];
            };
            [out.top, out.bottom] = ajuste(out.top, out.bottom, mapH);
            [out.left, out.right] = ajuste(out.left, out.right, mapW);
            return out;
        }

        /* Calcul de cadrage AUTONOME — repli quand `cameraForBounds` de Mapbox refuse.

           POURQUOI. Relevé sur appareil le 15/08/2026 : avec un padding identique à celui
           d'un cadrage réussi quelques minutes plus tôt, et sur le même canevas,
           `cameraForBounds` a rendu un centre NaN (`Invalid LngLat object: (NaN, NaN)`).
           Le padding était donc hors de cause. Restaient les bornes — que la trace de
           diagnostic ne consignait pas, d'où trois hypothèses successives invalidées.
           Plutôt que d'en formuler une quatrième, on cesse de dépendre de ce calcul : la
           projection de Mercator tient en quinze lignes, elle est ici entièrement sous
           notre contrôle, et surtout TESTABLE — ce que l'interne de Mapbox n'est pas.

           Deux sources de NaN sont neutralisées explicitement, parce que ce sont elles que
           `isLngLat()` laisse passer (il accepte |lat| <= 90) :
             — une latitude à ±90 exactement, dont la projection vaut l'infini ;
             — une bande utile nulle ou négative après padding, qui donne un log de zéro.

           Rend `null` — jamais un objet à moitié faux — quand aucun cadrage n'a de sens.
           L'appelant décide alors quoi faire, au lieu de recevoir un centre NaN. */
        const MERCATOR_LAT_MAX = 85.051129; // au-delà, la projection diverge

        function _cameraForBoundsSafe(bounds, mapW, mapH, pad, maxZoom = 18, tileSize = 512) {
            if (!Array.isArray(bounds) || bounds.length !== 2) return null;
            const [sw, ne] = bounds;
            if (!Array.isArray(sw) || !Array.isArray(ne)) return null;

            const nombres = [sw[0], sw[1], ne[0], ne[1], mapW, mapH].map(Number);
            if (!nombres.every(Number.isFinite)) return null;
            if (mapW <= 0 || mapH <= 0) return null;

            const p = {
                top:    Math.max(0, Number(pad && pad.top)    || 0),
                bottom: Math.max(0, Number(pad && pad.bottom) || 0),
                left:   Math.max(0, Number(pad && pad.left)   || 0),
                right:  Math.max(0, Number(pad && pad.right)  || 0)
            };
            const dispoW = mapW - p.left - p.right;
            const dispoH = mapH - p.top - p.bottom;
            // Bande nulle ou négative : c'est exactement le cas qui produit le centre NaN
            // chez Mapbox. On refuse plutôt que de rendre un résultat inexploitable.
            if (dispoW <= 0 || dispoH <= 0) return null;

            const clampLat = (v) => Math.max(-MERCATOR_LAT_MAX, Math.min(MERCATOR_LAT_MAX, v));
            const versMonde = (lng, lat) => {
                const x = (lng + 180) / 360;
                const phi = clampLat(lat) * Math.PI / 180;
                const y = (1 - Math.log(Math.tan(phi) + 1 / Math.cos(phi)) / Math.PI) / 2;
                return [x, y];
            };

            const [x1, y1] = versMonde(sw[0], sw[1]);
            const [x2, y2] = versMonde(ne[0], ne[1]);
            if (![x1, y1, x2, y2].every(Number.isFinite)) return null;

            const dx = Math.abs(x2 - x1);
            const dy = Math.abs(y2 - y1);

            /* Bornes ponctuelles (départ et arrivée confondus) : aucune étendue à faire
               tenir, on garde le zoom maximal. Traité à part car `log2(x / 0)` vaut
               l'infini et non un zoom. */
            let zoom;
            if (dx <= 0 && dy <= 0) {
                zoom = maxZoom;
            } else {
                const zx = dx > 0 ? Math.log2(dispoW / (tileSize * dx)) : Infinity;
                const zy = dy > 0 ? Math.log2(dispoH / (tileSize * dy)) : Infinity;
                zoom = Math.min(zx, zy, maxZoom);
            }
            if (!Number.isFinite(zoom)) return null;
            zoom = Math.max(0, zoom);

            /* Décentrement dû à un padding asymétrique. Le centre des bornes doit tomber
               au milieu de la BANDE UTILE, qui n'est pas le milieu du canevas dès que
               `top` et `bottom` diffèrent — c'est le cas ici en permanence, le modal
               occupant la moitié basse. Sans cette correction, le trajet serait cadré
               derrière le modal. */
            const echelle = tileSize * Math.pow(2, zoom);
            const cx = (x1 + x2) / 2 - ((p.left - p.right) / 2) / echelle;
            const cy = (y1 + y2) / 2 - ((p.top - p.bottom) / 2) / echelle;

            const lng = cx * 360 - 180;
            const lat = (Math.atan(Math.sinh(Math.PI * (1 - 2 * cy))) * 180) / Math.PI;
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return null;

            return { center: [lng, lat], zoom: +zoom.toFixed(4) };
        }


        /* Distance approximative en mètres entre deux points [lng, lat].
           Projection équirectangulaire : à l'échelle qui nous intéresse — comparer deux
           candidats pour une même station, quelques dizaines de mètres — l'écart avec la
           formule de haversine est très inférieur au mètre. On ne dépend donc pas de turf,
           ce qui garde la fonction dans le noyau testable.
           Rend `Infinity` sur une entrée inexploitable : un appelant qui compare à un seuil
           conclura « trop loin », ce qui est le choix prudent. */
        function _ecartMetres(a, b) {
            if (!Array.isArray(a) || !Array.isArray(b)) return Infinity;
            const [aLng, aLat, bLng, bLat] = [a[0], a[1], b[0], b[1]].map(Number);
            if (![aLng, aLat, bLng, bLat].every(Number.isFinite)) return Infinity;
            const latMoy = ((aLat + bLat) / 2) * Math.PI / 180;
            const dx = (bLng - aLng) * 111320 * Math.cos(latMoy);
            const dy = (bLat - aLat) * 110540;
            return Math.sqrt(dx * dx + dy * dy);
        }


        // ═══════════════════════════════════════════════════════════════════
        // === CHOIX DU POINT D'ÉTAPE D'UNE STATION ===
        // ═══════════════════════════════════════════════════════════════════

        /* Mètres parcourus sur des voies à ACCÈS RESTREINT (parkings, cours de service,
           chemins techniques longeant une voie ferrée). Mapbox les marque `restricted`
           dans `intersections[].classes` ; elles sont carrossables sur le papier, mais un
           itinéraire qui en emprunte des centaines de mètres est presque toujours faux.
           On somme la distance des ÉTAPES concernées, pas leur nombre : deux pas de dix
           mètres pour entrer sur une station n'ont rien à voir avec un demi-kilomètre de
           chemin de service. */
        function _metresRestreints(route) {
            if (!route || !Array.isArray(route.legs)) return 0;
            let total = 0;
            for (const leg of route.legs) {
                if (!leg || !Array.isArray(leg.steps)) continue;
                for (const step of leg.steps) {
                    if (!step || !Array.isArray(step.intersections)) continue;
                    const restreinte = step.intersections.some(i =>
                        i && Array.isArray(i.classes) && i.classes.includes('restricted'));
                    if (restreinte) total += Number(step.distance) || 0;
                }
            }
            return total;
        }

        /* Départage deux points candidats pour une même station (géocodage ou coordonnées
           du flux) d'après les itinéraires qu'ils produisent.

           ⚠ LA DISTANCE SEULE NE SUFFIT PAS — mesuré le 15/08/2026 à Courbevoie :
               brut     2 550 m dont 525 m (21 %) de voie restreinte
               géocodé  3 203 m dont  71 m  (2 %) de voie restreinte
           Le plus COURT était le plus court parce qu'il traversait le corridor de service
           d'une voie ferrée. Un critère de longueur ne distingue pas un raccourci légitime
           d'un passage impossible ; la part de voie restreinte, si.

           Règle : un candidat est « sain » tant qu'il ne dépasse pas `seuilRestreint` mètres
           de voie restreinte — de quoi entrer sur une station-service sans couvrir un chemin
           technique. Si un seul l'est, il gagne, même s'il est plus long. Sinon on retombe
           sur la distance. À égalité stricte, `a` gagne : l'appelant y met le candidat qu'il
           préfère par ailleurs (le mieux localisé pour l'affichage).

           Rend la clé gagnante ET le motif — l'app le journalise, seul moyen de vérifier la
           décision sur un cas réel depuis un téléphone. */
        function _choisirEtapeStation(a, b, seuilRestreint = 200) {
            const utilisable = (c) => c && Number.isFinite(Number(c.distanceM));
            if (!utilisable(a) && !utilisable(b)) return null;
            if (!utilisable(a)) return { gagnant: 'b', motif: 'seul itinéraire calculable' };
            if (!utilisable(b)) return { gagnant: 'a', motif: 'seul itinéraire calculable' };

            const rA = Number(a.restreintM) || 0;
            const rB = Number(b.restreintM) || 0;
            const sainA = rA <= seuilRestreint;
            const sainB = rB <= seuilRestreint;

            if (sainA !== sainB) {
                return {
                    gagnant: sainA ? 'a' : 'b',
                    motif: `voie restreinte ${Math.round(sainA ? rB : rA)} m contre ${Math.round(sainA ? rA : rB)} m`
                };
            }
            const gagnant = Number(a.distanceM) <= Number(b.distanceM) ? 'a' : 'b';
            return { gagnant, motif: 'itinéraire le plus court' };
        }


        // ═══════════════════════════════════════════════════════════════════
        // === NORMALISATION D'ADRESSES FRANÇAISES (avant géocodage) ===
        // ═══════════════════════════════════════════════════════════════════

        /* Mapbox indexe le bis/ter sous forme compacte (« 20b Rue Wilhem »), jamais en
           toutes lettres. Envoyé tel quel, « 20 bis » n'est pas reconnu comme suffixe :
           le géocodeur retombe sur le numéro 20 seul et l'INTERPOLE le long de la rue —
           décalage de plusieurs dizaines de mètres. Seule la requête envoyée à l'API est
           réécrite ; le texte affiché à l'écran n'est jamais modifié. */
        function normalizeFrHouseNumber(query) {
            return (query || '')
                .replace(/\b(\d+)\s*bis\b/gi,    '$1b')
                .replace(/\b(\d+)\s*ter\b/gi,    '$1t')
                .replace(/\b(\d+)\s*quater\b/gi, '$1q');
        }

        /* === ADRESSES DES STATIONS-SERVICE : abréviations à développer ===
           Le champ `adresse` du flux data.gouv.fr est saisi librement par les
           exploitants, en majuscules et fortement abrégé : « 72 BLD DE VERDUN ».
           Mapbox ne reconnaît pas « BLD » comme un type de voie et retombe sur une
           correspondance approximative — souvent de l'autre côté d'un boulevard à
           chaussées séparées. Tapée en toutes lettres, « 72 Boulevard de Verdun »
           résout au bon point : la seule différence est l'abréviation.
           On développe donc les formes courantes avant toute requête, exactement
           comme normalizeFrHouseNumber() le fait pour les bis/ter.
           Seules les abréviations SANS ambiguïté figurent ici — « QU », « RD » ou
           « RN » en désignent plusieurs et sont volontairement laissées telles quelles. */
        const _FR_VOIE_ABBR = [
            [/\bBL?VD\b/gi, 'BOULEVARD'],   // BVD, BLVD
            [/\bBLD\b/gi,   'BOULEVARD'],
            [/\bBOUL\b/gi,  'BOULEVARD'],
            [/\bBD\b/gi,    'BOULEVARD'],
            [/\bAVE?\b/gi,  'AVENUE'],      // AV, AVE
            [/\bRTE\b/gi,   'ROUTE'],
            [/\bCHEM\b/gi,  'CHEMIN'],
            [/\bCHE\b/gi,   'CHEMIN'],
            [/\bIMP\b/gi,   'IMPASSE'],
            [/\bALL\b/gi,   'ALLEE'],
            [/\bPL\b/gi,    'PLACE'],
            [/\bSQ\b/gi,    'SQUARE'],
            [/\bF[AB]?BG\b/gi, 'FAUBOURG'], // FBG, FABG
            [/\bSTE\b/gi,   'SAINTE'],      // avant ST, sinon « STE » resterait entier
            [/\bST\b/gi,    'SAINT'],
        ];

        function normalizeStationAddr(addr) {
            let out = (addr || '').trim();
            _FR_VOIE_ABBR.forEach(([re, full]) => { out = out.replace(re, full); });
            return normalizeFrHouseNumber(out);
        }

        /* ═══ BASE ADRESSE NATIONALE (BAN) : TRI DES RÉPONSES ═══
           La BAN (api-adresse.data.gouv.fr) est le référentiel officiel des adresses
           françaises : elle ne CALCULE pas la position d'un numéro, elle la LIT. C'est
           exactement ce que Mapbox ne sait pas faire — sur un numéro qu'il ne connaît
           pas, il interpole le long de l'axe de la rue, ce qui produit le décalage de
           147 m constaté à Courbevoie (voir AGENTS.md, « la distance ne permet pas de
           trancher »). En contrepartie la BAN ne couvre QUE la France et ne connaît
           aucun lieu nommé : elle ne remplace rien, elle s'insère avant Mapbox sur le
           seul cas des adresses numérotées, et rend `null` dès que le doute existe.

           ⚠ CE FICHIER NE FAIT QUE LE TRI. La requête réseau vit dans js/14
           (`_banAddress`) ; ici tout est pur, donc testable hors navigateur.

           Un `score` BAN mêle correspondance textuelle et importance de la commune. Le
           vrai garde-fou n'est PAS ce seuil mais l'égalité stricte du numéro vérifiée
           dans `banPickAddress()` : le score n'écarte que les réponses désespérées que
           la BAN rend quand même, faute de mieux. */
        const BAN_MIN_SCORE = 0.4;

        /* Extrait le numéro de voie en TÊTE d'adresse : « 20 bis Rue Wilhem » →
           { num: '20', rep: 'b' }. Sert des DEUX côtés de la comparaison — la requête de
           l'utilisateur et le `housenumber` rendu par la BAN — pour que « 20 bis »,
           « 20bis » et « 20 BIS » soient reconnus comme le même numéro.
           - Un intervalle (« 43-47 Bd de Verdun », courant sur les stations-service) est
             réduit à sa borne basse : c'est celle que porte le référentiel.
           - Le `\b` après le suffixe d'UNE lettre est ce qui empêche « 12 avenue » d'être
             lu comme le numéro 12 suffixé « a ».
           - 4 chiffres au plus, ET le `(?!\d)` qui suit : sans ce refus explicite du
             5ᵉ chiffre, « 75016 Paris » serait lu comme le numéro 7501 — le moteur se
             contentant des quatre premiers — et aucune réponse ne pourrait jamais
             correspondre. Un code postal n'est pas un numéro de voie. */
        function _frNumeroDeVoie(texte) {
            const m = String(texte || '').trim()
                .match(/^(\d{1,4})(?!\d)\s*(?:[-–\/]\s*\d{1,4})?\s*(bis|ter|quater|quinquies|[a-z])?\b/i);
            if (!m) return null;
            const brut = (m[2] || '').toLowerCase();
            const rep = { bis: 'b', ter: 't', quater: 'q', quinquies: 'c' }[brut] || brut;
            return { num: m[1], rep };
        }

        /* Libellé au format des autres sources — « 8 Boulevard du Port, 80000 Amiens ».
           Le `label` brut de la BAN ne contient AUCUNE virgule (« 8 Boulevard du Port
           80000 Amiens ») ; l'afficher tel quel casserait `tripPlacesLabel()`, qui
           tronque sur la première virgule pour ne garder que le lieu, et le
           dédoublonnage de la liste déroulante, qui compare les deux premiers segments. */
        function _banLabel(p) {
            const a = p || {};
            const commune = [a.postcode, a.city].filter(Boolean).join(' ');
            return [a.name, commune].filter(Boolean).join(', ');
        }

        /* Rend { coords, label, score, type } pour la première réponse digne de
           confiance, sinon `null` — et `null` veut dire « repasse la main à Mapbox »,
           jamais « adresse introuvable ».

           Les quatre filtres, du plus discriminant au moins :
             1. `type === 'housenumber'` — une réponse `street` signifie que la BAN a
                trouvé la rue mais PAS le numéro, c'est-à-dire précisément le cas où elle
                n'apporte rien de plus que l'interpolation de Mapbox ;
             2. LE NUMÉRO RENDU DOIT ÊTRE CELUI DEMANDÉ. Sans cette égalité, chercher
                « 999 rue de la Paix » ferait accepter le 99 avec un bon score : une
                adresse fausse rendue avec l'aplomb d'une adresse exacte, donc PIRE
                qu'une interpolation, qui au moins tombe dans la bonne rue. Le suffixe
                compte des deux côtés — le 20 et le 20 bis sont deux immeubles ;
             3. code postal présent dans la requête ≠ code postal rendu → écarté. Quand
                l'utilisateur a tapé un code postal, c'est lui qui tranche ;
             4. `score` sous le plancher → écarté. */
        function banPickAddress(features, requete) {
            const liste   = Array.isArray(features) ? features : [];
            const voulu   = _frNumeroDeVoie(requete);
            const cpVoulu = (String(requete || '').match(/\b(\d{5})\b/) || [])[1] || '';

            for (const f of liste) {
                const p = (f && f.properties) || {};
                const c = (f && f.geometry && f.geometry.coordinates) || [];
                if (!Number.isFinite(c[0]) || !Number.isFinite(c[1])) continue;
                if (p.type !== 'housenumber') continue;
                if (!(Number(p.score) >= BAN_MIN_SCORE)) continue;
                if (cpVoulu && p.postcode && String(p.postcode) !== cpVoulu) continue;
                if (voulu) {
                    const rendu = _frNumeroDeVoie(p.housenumber);
                    if (!rendu || rendu.num !== voulu.num || rendu.rep !== voulu.rep) continue;
                }
                return {
                    coords: [c[0], c[1]],
                    label:  _banLabel(p),
                    score:  Number(p.score),
                    type:   p.type
                };
            }
            return null;
        }

        // Minuscules + accents retirés, pour comparer « Champs-Élysées » et « champs elysees ».
        function _deburr(s) {
            return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }


        // ═══════════════════════════════════════════════════════════════════
        // === ZFE : MONTANT DE L'AMENDE ===
        // ═══════════════════════════════════════════════════════════════════

        /* Art. R411-19-1 : 4ᵉ classe pour les poids lourds, autobus et autocars,
           3ᵉ classe pour tous les autres. C'est donc `gps_vehicle_category`, et
           non `gps_critair`, qui détermine le montant.
           Montants forfaitaires nationaux, susceptibles d'évoluer : les garder
           groupés ici pour n'avoir qu'un endroit à corriger. */
        const ZFE_AMENDES = {
            classe3: { classe: 3, forfait: 68,  minoree: 45, majoree: 180 },
            classe4: { classe: 4, forfait: 135, minoree: 90, majoree: 375 },
        };
        const ZFE_CAT_CLASSE = {
            vp:               'classe3',
            vul:              'classe3',
            deux_rm:          'classe3',
            pl:               'classe4',
            autobus_autocars: 'classe4',
        };

        /* Seule entorse au « zéro dépendance » de ce fichier, et elle est contenue :
           le repli du paramètre appelle `getZFECategory()` (16-zfe.js). Un paramètre
           par défaut n'est évalué qu'à l'appel, et seulement si l'argument est omis —
           appelée avec une catégorie, la fonction reste parfaitement pure, et c'est
           ainsi que les tests l'exercent. */
        function getZFEAmende(categorie = getZFECategory()) {
            return ZFE_AMENDES[ZFE_CAT_CLASSE[categorie] || 'classe3'];
        }


        // ═══════════════════════════════════════════════════════════════════
        // === STATIONS-SERVICE : LECTURE DU FLUX ===
        // ═══════════════════════════════════════════════════════════════════

        function extractGasCoords(s) {
            const rawLat = parseFloat(s.latitude);
            const rawLng = parseFloat(s.longitude);
            if (!isNaN(rawLat) && !isNaN(rawLng)) {
                const lat = Math.abs(rawLat) > 1000 ? rawLat / 100000 : rawLat;
                const lng = Math.abs(rawLng) > 1000 ? rawLng / 100000 : rawLng;
                if (lat > 35 && lat < 52 && lng > -10 && lng < 10) return [lng, lat];
            }
            if (s.geom?.coordinates) {
                const lng = parseFloat(s.geom.coordinates[0]);
                const lat = parseFloat(s.geom.coordinates[1]);
                if (!isNaN(lng) && !isNaN(lat)) return [lng, lat];
            }
            if (s.geo_point_2d) {
                const lat = parseFloat(s.geo_point_2d.lat ?? s.geo_point_2d.latitude);
                const lng = parseFloat(s.geo_point_2d.lon ?? s.geo_point_2d.longitude ?? s.geo_point_2d.lng);
                if (!isNaN(lng) && !isNaN(lat)) return [lng, lat];
            }
            return null;
        }

        function extractGasPrice(s, fuelType) {
            // Prix pré-parsés par les normaliseurs BE/ES
            const preKey = '_' + fuelType;
            if (s[preKey] != null) return s[preKey];
            // Format FR : tableau prix:[{"@nom":"Gazole","@valeur":"2.127"}, ...]
            const prixArr = s.prix;
            if (Array.isArray(prixArr)) {
                const nomMap = {
                    sp95:   ['sp95', 'e5', 'sp95-e5'],
                    gazole: ['gazole', 'diesel', 'go', 'b7', 'gazole b7'],
                    e10:    ['e10', 'sp95-e10'],
                    sp98:   ['sp98', 'sp98-e5'],
                    gplc:   ['gplc', 'gpl'],
                };
                const cibles = nomMap[fuelType] || [];
                for (const entry of prixArr) {
                    const nom = (entry['@nom'] || entry.nom || entry.name || '').toLowerCase().trim();
                    if (cibles.some(c => nom === c) || cibles.some(c => nom.includes(c))) {
                        const val = parseFloat(String(entry['@valeur'] ?? entry.valeur ?? entry.value ?? '').replace(',', '.'));
                        if (!isNaN(val) && val > 0.5) return val > 10 ? val / 1000 : val;
                    }
                }
            }
            const flatMap = {
                sp95:   ['sp95_prix', 'prix_sp95', 'sp95', 'e5_prix', 'prix_e5'],
                gazole: ['gazole_prix', 'prix_gazole', 'gazole', 'go_prix', 'prix_go'],
                e10:    ['e10_prix', 'prix_e10', 'e10'],
                sp98:   ['sp98_prix', 'prix_sp98', 'sp98'],
            };
            for (const field of (flatMap[fuelType] || [])) {
                const v = s[field];
                if (v != null && v !== '') {
                    const parsed = parseFloat(String(v).replace(',', '.'));
                    if (!isNaN(parsed) && parsed > 0.5) return parsed > 10 ? parsed / 1000 : parsed;
                }
            }
            return null;
        }

        function getBestPrice(s) {
            const prices = ['sp95','gazole','e10','sp98'].map(t => extractGasPrice(s, t)).filter(p => p !== null);
            return prices.length > 0 ? Math.min(...prices) : 999;
        }


        // ═══════════════════════════════════════════════════════════════════
        // === PÉAGES : ESTIMATION DU COÛT ===
        // ═══════════════════════════════════════════════════════════════════

        /* ⚠ CECI EST UNE ESTIMATION, PAS UN BARÈME — et ce n'en sera jamais un.
           Mapbox Directions ne renvoie NI prix de péage, NI drapeau « ce tronçon est
           payant » : il sait seulement les éviter (`exclude=toll`). ViaMichelin et Mappy
           lisent la grille tarifaire réelle par gare — c'est pour cela qu'ils annoncent
           « Arles 25,50 € + Lançon 5,20 € » et nous un nombre rond. Il n'existe aucune
           API publique et gratuite de ces barèmes : ils sont publiés en PDF par chaque
           concessionnaire. Toute la question est donc de faire une bonne devinette.

           CE QUE LA VERSION PRÉCÉDENTE FAISAIT, ET POURQUOI ELLE SE TROMPAIT DE 56 %.
           Mesuré le 20/08/2026 sur Perpignan → Marseille : 13,49 € annoncés contre
           30,70 € réels. Trois causes, cumulatives et toutes dans le même sens :

             1. Un rectangle de latitude `lat < 43.0` déclarait « Espagne ». Perpignan est
                à 42,70 : les 50 premiers kilomètres de l'A9, intégralement payants,
                étaient jetés. Le test portait de surcroît sur `step.maneuver.location`,
                c'est-à-dire le point de DÉPART du step — un step long de 40 km qui
                commence sous 43,0 disparaissait en entier. Ces boîtes ne sont pas des
                frontières : aucune ligne de latitude ne sépare Perpignan de la Catalogne.
             2. L'autoroute était détectée par la VITESSE MOYENNE du step (> 80 km/h).
                L'app interroge `driving-traffic` en priorité, donc un tronçon payant
                ralenti par un bouchon devenait gratuit : le prix des péages BAISSAIT
                quand il y avait du trafic. Symétriquement, toute 2×2 voies gratuite
                (RN, voies rapides urbaines) était facturée.
             3. Le taux, 0,08 €/km, contre ~0,12 €/km réel sur le réseau ASF.

           CE QU'ON FAIT À LA PLACE. On lit `step.ref` — Mapbox y met le numéro de route
           (« A9 », « E15;A9 »), disponible parce que `fetchRouteMapbox()` demande
           `steps=true`. C'est une donnée déclarée, pas une déduction : insensible au
           trafic, insensible au découpage des steps. On somme les kilomètres par
           concessionnaire et on applique son tarif. Sur le trajet de référence :
           ~32 € contre 30,70 € réels, soit +5 % au lieu de −56 %. */

        /* ⚠⚠ LE PÉAGE N'EST PAS PROPORTIONNEL À LA DISTANCE — un taux unique en €/km ne
           peut pas marcher, et c'est mesuré, pas supposé (20/08/2026, deux trajets réels
           dont le prix ViaMichelin est connu et dont l'app détecte le kilométrage) :

               Perpignan → Montpellier    134,4 km détectés   17,40 €   → 0,129 €/km
               Perpignan → Marseille      ~313 km détectés    30,70 €   → 0,098 €/km

           Le tarif kilométrique DÉCROÎT avec la distance. C'est la structure du système
           fermé français : on paie une composante quasi fixe pour entrer sur le réseau,
           puis une part proportionnelle. Caler un taux unique sur le trajet court
           surestimait le long de 30 % ; le caler sur le long sous-estimait le court de
           25 %. Il n'existe pas de valeur qui satisfasse les deux.

           D'où le modèle AFFINE : `frais d'entrée + taux × km`, appliqué UNE FOIS PAR
           RÉSEAU traversé (on ne paie qu'une entrée par concessionnaire, pas une par
           step). Les deux constantes ci-dessous sont l'unique solution passant par les
           deux mesures ; le troisième point disponible les confirme sans avoir servi à
           les calculer — Perpignan → Marseille via Fos, 226,3 km détectés → 24,3 €
           estimés contre ~25,5 € réels, soit −5 %.

           ⚠ CE SONT DES VALEURS CALIBRÉES, PAS DES BARÈMES PUBLIÉS. Elles absorbent trois
           choses à la fois : le tarif réel du concessionnaire, les sections d'autoroute
           gratuites qu'on facture à tort (entrées/sorties d'agglomération), et la
           sous-détection de kilomètres due aux steps d'échangeur sans `ref`. Les
           renommer « tarif ASF » serait faux. Elles se re-calibrent en mesurant, jamais
           en recopiant une grille de concessionnaire.
           ⚠ Elles remplacent `TOLL_NETWORK_RATE` × `TOLL_BILLABLE_SHARE` (supprimés) :
           cette part facturable de 0,85 avait été inventée SANS mesure, pour corriger une
           surestimation supposée — la première mesure réelle a montré qu'on sous-estimait.
           Une correction non mesurée poussait donc dans le mauvais sens. */
        const TOLL_ENTRY_FEE = 7.4;    // € pour entrer sur un réseau concédé
        const TOLL_KM_RATE   = 0.0745; // € par km parcouru sur ce réseau

        /* Multiplicateur par concessionnaire, SANS DIMENSION, appliqué au coût affine
           complet. ASF vaut 1 par construction : c'est le seul réseau sur lequel des
           mesures existent (les trois trajets ci-dessus sont tous ASF). Les autres sont
           déduits du rapport de leurs barèmes publiés à celui d'ASF — donc plausibles,
           mais NON VÉRIFIÉS. Un trajet mesuré sur APRR ou Sanef doit corriger la valeur
           correspondante ici, et elle seule. */
        const TOLL_NETWORK_FACTOR = {
            asf:      1.00,
            escota:   1.12,   // le réseau le plus cher de France (A8, A50, A51, A52)
            cofiroute:0.93,
            aprr:     0.89,
            area:     0.99,
            sanef:    0.82,
            sapn:     0.93,
            atlandes: 0.95,
            alis:     1.03,
            arcour:   0.95,
            albea:    0.99,
            aliae:    0.95,
        };
        const TOLL_FACTOR_DEFAULT = 0.91;

        /* En deçà, on ne facture rien. Une autoroute urbaine — A86, A104, la traversée de
           Lyon — est gratuite et se compte en kilomètres ; sans ce plancher, chaque trajet
           de banlieue afficherait un péage imaginaire. ⚠ Ce plancher compte DOUBLE depuis
           le passage au modèle affine : `TOLL_ENTRY_FEE` s'applique dès le premier
           kilomètre facturé, donc sans lui un trajet de banlieue coûterait non plus deux
           ou trois euros imaginaires, mais sept. */
        const TOLL_MIN_KM = 15;

        /* Autoroute → concessionnaire. Une absence tombe sur TOLL_FACTOR_DEFAULT : ajouter
           une entrée affine, l'oublier ne casse rien. */
        const TOLL_MOTORWAY_NETWORK = {
            '1':'sanef',  '2':'sanef',  '4':'sanef',  '5':'aprr',   '6':'aprr',
            '7':'asf',    '8':'escota', '9':'asf',    '10':'cofiroute', '11':'cofiroute',
            '13':'sapn',  '14':'cofiroute', '16':'sanef', '19':'arcour', '26':'sanef',
            '28':'alis',  '29':'sanef', '31':'aprr',  '36':'aprr',  '39':'aprr',
            '40':'aprr',  '41':'aprr',  '42':'aprr',  '43':'area',  '46':'area',
            '48':'area',  '49':'area',  '51':'escota','52':'escota','54':'asf',
            '57':'escota','61':'asf',   '62':'asf',   '63':'atlandes','64':'asf',
            '65':'asf',   '66':'asf',   '71':'aprr',  '72':'aprr',  '79':'albea',
            '83':'cofiroute','85':'cofiroute','89':'asf','150':'aliae','645':'asf',
            '709':'asf',  '719':'aprr', '837':'asf',
        };

        /* Autoroutes françaises gratuites sur l'essentiel de leur tracé. Sans cette liste,
           l'A75 (Clermont → Béziers, 340 km) coûterait 35 € alors qu'elle est gratuite
           hors viaduc de Millau. Les cas PARTIELS (A31, A16, A4 en Île-de-France) ne sont
           pas ici : les y mettre reviendrait à les rendre gratuits partout, ce qui est
           plus faux que de les facturer — la calibration de `TOLL_KM_RATE` et
           `TOLL_MIN_KM` en absorbent une partie. */
        const TOLL_FREE_MOTORWAYS = new Set([
            '3','12','15','20','21','25','33','34','35','47','50','55','68','75','77',
            '81','84','86','87','88','104','106','115','126','186','187','216','391',
            '410','430','480','551','620','621','623','630','631','660','714','750',
            '803','813','821','823','844','886','891',
        ]);

        /* Numéro d'autoroute FRANÇAISE porté par un `ref` Mapbox, sinon null.
           ⚠ LE TIRET EST LE DISCRIMINANT ESPAGNE/FRANCE, pas la latitude. Les autopistas
           s'écrivent « AP-7 », « A-2 », « C-32 » ; les autoroutes françaises n'ont jamais
           de tiret. C'est le seul critère qui fonctionne à Perpignan, où les deux réseaux
           se touchent et où la boîte de latitude précédente jetait l'A9 française.
           Un `ref` multiple (« E15;A9 ») est scanné en entier : les euroroutes E ne
           désignent aucun réseau et sont ignorées. */
        function _refAutorouteFr(ref) {
            if (!ref) return null;
            const parts = String(ref).split(/[;,]/).map(p => p.trim().toUpperCase());
            if (parts.some(p => /^[A-Z]{1,2}-\s?\d/.test(p))) return null;
            for (const p of parts) {
                const m = /^A\s?(\d{1,3})$/.exec(p);
                if (m) return String(Number(m[1]));
            }
            return null;
        }

        /* Vrai si `ref` ne contient QUE des numéros d'euroroute (« E80 », « E15;E90 »),
           sans aucun numéro d'autoroute française ni aucune route d'un autre type.

           ⚠ POURQUOI CETTE FONCTION EXISTE — mesuré le 20/08/2026 sur Perpignan → Marseille
           via le diagnostic de `estimateTollFromRoute()`. Un step de 71,8 km portait
           uniquement `"E 80"`, quand les steps voisins du même axe portaient `"E15;A9"` —
           Mapbox n'a simplement pas répété le numéro français sur ce step-là. Comme
           `_refAutorouteFr()` ignore à raison les euroroutes SEULES (elles ne désignent
           aucun réseau de péage), ces 71,8 km disparaissaient sans être ni facturés ni
           exclus : la plus grosse part de l'écart entre 24 € et 30,70 € tenait à ce seul
           step. Une euroroute ne se signale jamais sur un tronçon de voirie ordinaire —
           elle chevauche toujours une autoroute nationale sans rupture physique — d'où la
           continuité appliquée dans `estimateTollFromRoute()` : un step « E-seul » hérite
           du réseau du DERNIER step classé par numéro français, jamais d'un tarif propre. */
        function _estEuroroutePure(ref) {
            if (!ref) return false;
            const parts = String(ref).split(/[;,]/).map(p => p.trim().toUpperCase());
            return parts.length > 0 && parts.every(p => /^E\s?\d{1,3}$/.test(p));
        }

        /* Pays voisins où un « A + chiffres » ne désigne pas une autoroute française.
           Volontairement GROSSIER et volontairement réduit à ce que la géographie sépare
           vraiment : l'Italie, l'Allemagne, la Suisse et la Belgique sont franches, pas
           l'Espagne — dont on se débarrasse par la forme du `ref` (voir ci-dessus).
           Une estimation transfrontalière reste approximative, et c'est assumé : cette
           app calcule des ZFE, des Crit'Air et des prix de carburant français. */
        function _horsReseauPeageFr(lng, lat) {
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return false;
            if (lng > 7.6 && lat < 46.2) return true;                        // Italie
            if (lng > 7.9 && lat > 47.6) return true;                        // Allemagne
            if (lng > 6.1 && lng < 10.5 && lat > 46.0 && lat < 47.9) return true; // Suisse

            /* ⚠ BELGIQUE / LUXEMBOURG : UNE DROITE INCLINÉE, PAS UN RECTANGLE.
               `lat > 50.6` a été mesuré faux le 20/08/2026 sur Paris → Bruxelles (24 €
               estimés contre 16,30 € chez Mappy ET ViaMichelin, qui s'accordent) : sur
               306 km de route, 8,3 km seulement étaient reconnus comme étrangers alors
               que la Belgique en fait ~100.
               La frontière franco-belge DESCEND d'ouest en est — 51,09 à Bray-Dunes,
               50,76 vers Lille, 50,44 à Hensies (où passe l'A2), 49,79 vers Sedan. Une
               latitude unique ne peut pas la suivre : posée assez haut pour laisser Lille
               en France, elle laisse tout le Hainaut belge « français ». C'est la même
               erreur que le `lat < 43.0` qui classait Perpignan en Espagne, à l'autre
               bout du pays.
               La marge de 0,05° penche VOLONTAIREMENT vers l'exclusion : la Belgique, le
               Luxembourg, l'Allemagne et les Pays-Bas ne font pas payer les voitures, et
               côté français dans cette bande les autoroutes sont largement gratuites (A22,
               A25 autour de Lille). Trop exclure n'y coûte presque rien, trop peu exclure
               facture un pays entier — l'erreur n'est pas symétrique.
               Le plancher à 49,5 protège la Lorraine (Thionville 49,36) sans relâcher le
               Luxembourg, qui commence à 49,6. */
            if (lng > 2.5 && lng < 6.5) {
                const latFrontiere = Math.max(51.09 - 0.5306 * (lng - 2.55), 49.5);
                if (lat > latFrontiere - 0.05) return true;
            }
            return false;
        }

        /* Coût estimé des péages, en euros, pour UNE route OSRM/Mapbox (`{ legs: [...] }`).
           L'évitement des péages est la responsabilité de l'appelant : ici on chiffre ce
           que la route contient.

           `diag`, optionnel, est un objet REMPLI PAR RÉFÉRENCE plutôt qu'une sortie
           supplémentaire — le contrat de ce fichier interdit `console` ici, donc c'est à
           l'appelant de logger `diag` s'il en a passé un. Sert à distinguer, sur un
           trajet réel, deux causes de sous-estimation qui produisent le même symptôme :
           des steps d'autoroute qui n'ont simplement pas de `ref` chez Mapbox (perdus dès
           qu'un AUTRE step de la même route en a un — voir `refExploitable`/`kmSansRef`
           dans `diag`) contre la décote assumée de `TOLL_BILLABLE_SHARE`/`TOLL_MIN_KM`. */
        function estimateTollFromRoute(route, diag) {
            const legs = route && Array.isArray(route.legs) ? route.legs : null;
            if (!legs) return 0;

            const kmParReseau = {};
            let kmSansRef = 0;      // steps rapides sans `ref` — repli SI refExploitable=false,
                                     // sinon kilométrage PERDU (ni facturé ni exclu, voir diag)
            let kmEuroroute = 0;    // steps E-seuls rattachés au réseau du step précédent
            let kmHorsFr = 0;
            let kmTotalRoute = 0;
            let refExploitable = false;

            /* `refsNonReconnus` garde une trace, pour `diag`, des `ref` bruts qu'aucune
               règle ne sait classer (ni motorway français, ni euroroute pure, ni absence
               totale de `ref`) — utile pour repérer une prochaine anomalie du même genre
               sans deviner à l'aveugle. Coûte une clé d'objet par forme de `ref` rencontrée,
               négligeable sur un trajet. */
            const refsNonReconnus = {};

            /* Kilométrage par NUMÉRO d'autoroute, pour `diag` uniquement — le calcul, lui,
               n'a besoin que du réseau. ⚠ `kmParReseau` seul ne permet PAS d'identifier
               l'itinéraire suivi : A7, A9 et A54 sont toutes trois ASF et s'y confondent en
               un seul total. Or c'est précisément ce qu'il fallait savoir le 20/08/2026 —
               Perpignan → Marseille passe-t-il par Salon (A7, barrière de Lançon, 30,70 €)
               ou par Fos (A55 gratuite, ~17 €) ? Deux prix réels très différents, donc deux
               calibrations opposées. Les autoroutes GRATUITES y figurent aussi, préfixées,
               puisque ce sont elles qui signent l'itinéraire. */
            const kmParAutoroute = {};

            /* `ref` + `name` des steps rattachés par continuité, pour `diag` — voir le
               commentaire à l'endroit où il se remplit. Diagnostic uniquement. */
            const eurorouteDetail = {};

            /* Réseau du DERNIER step classé par numéro français, `null` si aucun ou si le
               dernier motorway rencontré était gratuit (`TOLL_FREE_MOTORWAYS`) — dans ce
               cas la continuité ne doit rien facturer non plus. Existe uniquement pour la
               continuité par euroroute ci-dessous ; voir `_estEuroroutePure()`. */
            let dernierReseauFr = null;

            /* Un step est étranger si l'une OU l'autre de ses extrémités l'est.
               ⚠ `step.maneuver.location` est le point de DÉPART du step, jamais son
               milieu ni sa fin — et c'est ce détail qui a produit DEUX bugs distincts, à
               deux frontières opposées : un step de 40 km démarrant sous lat 43,0 rendait
               l'A9 « espagnole » au départ de Perpignan, et un step belge de 80 km
               démarrant juste après Hensies restait « français » jusqu'à Bruxelles.
               Tester la fin d'un step revient à tester le départ du SUIVANT — d'où
               l'itération indexée, qui a remplacé un `for…of` pour cette seule raison.
               Le résultat penche vers l'exclusion (le step qui franchit la frontière est
               écarté en entier) : voir `_horsReseauPeageFr()` pour pourquoi c'est le bon
               sens de l'erreur. */
            const estEtranger = (loc) => Array.isArray(loc)
                && _horsReseauPeageFr(Number(loc[0]), Number(loc[1]));

            for (const leg of legs) {
                const steps = (leg && leg.steps) || [];
                for (let i = 0; i < steps.length; i++) {
                    const step = steps[i];
                    if (!step) continue;
                    const distKm = (Number(step.distance) || 0) / 1000;
                    if (distKm <= 0) continue;
                    kmTotalRoute += distKm;

                    const debut = step.maneuver && step.maneuver.location;
                    const suivant = steps[i + 1];
                    const fin = suivant && suivant.maneuver && suivant.maneuver.location;
                    if (estEtranger(debut) || estEtranger(fin)) {
                        kmHorsFr += distKm;
                        continue;
                    }

                    const num = _refAutorouteFr(step.ref);
                    if (num) {
                        refExploitable = true;
                        if (TOLL_FREE_MOTORWAYS.has(num)) {
                            kmParAutoroute['A' + num + '(gratuite)'] = (kmParAutoroute['A' + num + '(gratuite)'] || 0) + distKm;
                            dernierReseauFr = null;
                            continue;
                        }
                        const reseau = TOLL_MOTORWAY_NETWORK[num] || 'default';
                        kmParReseau[reseau] = (kmParReseau[reseau] || 0) + distKm;
                        kmParAutoroute['A' + num] = (kmParAutoroute['A' + num] || 0) + distKm;
                        dernierReseauFr = reseau;
                    } else if (!step.ref) {
                        /* Aucun `ref` du tout sur ce step. On mesure quand même la vitesse
                           moyenne, mais ce total ne servira QUE si la réponse entière est
                           dépourvue de `ref` — voir le repli. Un step qui PORTE un `ref`
                           non autoroutier (« D900 ») n'est jamais compté : c'est une
                           information, pas une lacune. */
                        const dur = Number(step.duration) || 0;
                        if (dur > 0 && distKm > 0.5 && (distKm * 1000 / dur) * 3.6 > 80) kmSansRef += distKm;
                    } else if (_estEuroroutePure(step.ref) && dernierReseauFr) {
                        /* Continuité : une euroroute seule (« E80 ») chevauche toujours une
                           autoroute nationale sans rupture physique — Mapbox a simplement
                           omis de répéter le numéro français sur CE step. Mesuré le
                           20/08/2026 : un unique step ainsi tagué portait 71,8 km sur
                           Perpignan → Marseille, l'essentiel de l'écart entre 24 € et
                           30,70 €. Voir `_estEuroroutePure()` pour l'incident complet. */
                        kmParReseau[dernierReseauFr] = (kmParReseau[dernierReseauFr] || 0) + distKm;
                        kmParAutoroute['(euroroute→' + dernierReseauFr + ')'] =
                            (kmParAutoroute['(euroroute→' + dernierReseauFr + ')'] || 0) + distKm;
                        kmEuroroute += distKm;
                        /* ⚠ DIAGNOSTIC (20/08/2026) — `(euroroute→asf)` est un AGRÉGAT, et
                           c'est ce qui bloque la correction : sur Perpignan → Paris il vaut
                           430 km, mélangeant l'A75 GRATUITE (jamais taguée « A75 » par
                           Mapbox, seulement « E11 ») et des sections réellement payantes
                           dont le viaduc de Millau. Le supprimer en bloc ferait passer
                           l'estimation de +18 % à −29 %. `step.name` porte souvent le nom
                           réel de la voie : on le relève ici pour savoir si l'on peut
                           IDENTIFIER ces steps au lieu de les deviner par continuité. */
                        const cleEuro = String(step.ref) + (step.name ? ' « ' + step.name + ' »' : ' (sans nom)');
                        eurorouteDetail[cleEuro] = (eurorouteDetail[cleEuro] || 0) + distKm;
                    } else {
                        /* `ref` présent mais non classable : route d'un autre type (« D900 »)
                           ou euroroute sans réseau français encore identifié. Dans les deux
                           cas on quitte le corridor autoroutier — la continuité ne doit pas
                           traverser une départementale. */
                        dernierReseauFr = null;
                        const dur = Number(step.duration) || 0;
                        if (dur > 0 && distKm > 0.5 && (distKm * 1000 / dur) * 3.6 > 80) {
                            const cle = String(step.ref);
                            refsNonReconnus[cle] = (refsNonReconnus[cle] || 0) + distKm;
                        }
                    }
                }
            }
            if (diag && typeof diag === 'object') {
                Object.assign(diag, { kmParReseau: { ...kmParReseau }, kmParAutoroute: { ...kmParAutoroute },
                    eurorouteDetail: { ...eurorouteDetail },
                    kmSansRef, kmEuroroute, kmHorsFr, kmTotalRoute, refExploitable,
                    refsNonReconnus: { ...refsNonReconnus } });
            }

            /* ⚠ REPLI OBLIGATOIRE — sans lui, une réponse Mapbox sans `ref` afficherait
               « Aucun » péage sur un Paris-Marseille, en silence et sans erreur. C'est
               exactement le mode de panne que ce fichier existe pour attraper : un
               calcul faux qui ne lève rien. On retombe alors sur l'ancienne heuristique
               de vitesse, débarrassée de ses rectangles de pays. */
            /* ⚠ `TOLL_ENTRY_FEE` EST FACTURÉ UNE FOIS PAR RÉSEAU, PAS UNE FOIS PAR TRAJET —
               c'est ce que fait la boucle, et c'est voulu : traverser deux concessions
               (un Lyon → Bordeaux passe d'APRR à ASF) fait bien payer deux entrées. Le
               poser hors de la boucle sous-estimerait tout trajet transversal. */
            let kmTotal = 0, cout = 0;
            if (refExploitable) {
                for (const reseau of Object.keys(kmParReseau)) {
                    const km = kmParReseau[reseau];
                    kmTotal += km;
                    const facteur = TOLL_NETWORK_FACTOR[reseau] || TOLL_FACTOR_DEFAULT;
                    cout += (TOLL_ENTRY_FEE + TOLL_KM_RATE * km) * facteur;
                }
            } else {
                kmTotal = kmSansRef;
                cout = (TOLL_ENTRY_FEE + TOLL_KM_RATE * kmSansRef) * TOLL_FACTOR_DEFAULT;
            }
            return kmTotal < TOLL_MIN_KM ? 0 : cout;
        }

        /* ⚠ PAS DE CENTIMES SUR UN NOMBRE DEVINÉ. « ~28,43 € » promet une précision au
           centime que rien dans le calcul ne soutient — et l'utilisateur, qui lit juste
           au-dessus un coût carburant issu d'une vraie source (data.economie.gouv.fr,
           juste à 0,50 € près), n'a aucun moyen de savoir que les deux chiffres n'ont pas
           le même statut. L'arrondi à l'euro est le seul signal disponible. */
        function formatTollEstimate(euros) {
            const n = Number(euros);
            if (!Number.isFinite(n) || n <= 0) return 'Aucun';
            return '~' + Math.round(n) + ' €';
        }


        // ═══════════════════════════════════════════════════════════════════
        // === DÉTECTION DES PAYS TRAVERSÉS ===
        // ═══════════════════════════════════════════════════════════════════

        const COUNTRY_BOXES = {
            fr: { minLat: 41.3, maxLat: 51.1, minLng: -5.2, maxLng: 9.6  },
            be: { minLat: 49.5, maxLat: 51.6, minLng: 2.5,  maxLng: 6.4  },
            lu: { minLat: 49.4, maxLat: 50.2, minLng: 5.7,  maxLng: 6.6  },
            es: { minLat: 35.9, maxLat: 43.8, minLng: -9.3, maxLng: 4.4  },
        };

        function detectCountriesOnRoute(routeCoords) {
            const countries = new Set();
            const step = Math.max(1, Math.floor(routeCoords.length / 20));
            for (let i = 0; i < routeCoords.length; i += step) {
                const [lng, lat] = routeCoords[i];
                for (const [cc, box] of Object.entries(COUNTRY_BOXES)) {
                    if (lat >= box.minLat && lat <= box.maxLat && lng >= box.minLng && lng <= box.maxLng)
                        countries.add(cc);
                }
            }
            if (countries.size === 0) countries.add('fr');
            if (countries.has('lu')) countries.add('be');
            return [...countries];
        }


        // ═══════════════════════════════════════════════════════════════════
        // === SEMAINE D'OBJECTIFS ===
        // ═══════════════════════════════════════════════════════════════════

        /* `now` est INJECTÉ plutôt que lu par `new Date()` à l'intérieur : sans ce
           paramètre, la fonction est intestable — on ne peut ni vérifier le passage du
           dimanche, ni le cas « il reste moins d'une heure », ni un changement d'heure.
           Le repli conserve l'appel d'origine, aucun appelant n'a à changer.

           ⚠ Rend la DURÉE SEULE, sans le mot « restants » (retiré le 22/08/2026). Son
           unique appelant est la pastille du panneau Objectifs, qui porte déjà la légende
           « Temps restant » juste en dessous : le mot y était dit deux fois, et il rognait
           la place du chiffre, seule information qui change. Un futur appelant qui aurait
           besoin de la mention doit l'ajouter chez lui, pas ici. */
        function getTimeUntilEndOfWeek(now = new Date()) {
            const dayOfWeek = now.getDay(); // 0=dim, 1=lun, ..., 6=sam
            const daysUntilSunday = dayOfWeek === 0 ? 0 : (7 - dayOfWeek);
            const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSunday, 23, 59, 59);
            const diff = endOfWeek - now;
            const days = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            return `${days}j ${hours}h`;
        }


        // ═══════════════════════════════════════════════════════════════
        // === HISTORIQUE DES TRAJETS — MISE EN FORME D'UNE ENTRÉE ===
        // ═══════════════════════════════════════════════════════════════

        /* Ces quatre fonctions ne lisent NI le DOM NI localStorage : elles reçoivent une
           entrée d'historique (`gps_trip_history`) et rendent des chaînes. C'est ce qui
           permet de les tester ici, alors que le rendu de la liste lui-même (js/13) ne
           l'est pas. Les entrées archivées AVANT l'ajout des lieux (20/08/2026) n'ont ni
           `from` ni `to` : chacune de ces fonctions doit rendre quelque chose de lisible
           dans ce cas, jamais « undefined ». */

        // ═══════════════════════════════════════════════════════════════
        // === ARRIVÉE : CONSTATÉE PAR LE GPS, OU DÉCLARÉE PAR LE CONDUCTEUR ===
        // ═══════════════════════════════════════════════════════════════

        /* Deux seuils, deux natures différentes — c'est tout le sujet.

           `ARRIVAL_AUTO_M` (50 m) est la distance à laquelle l'app CONSTATE l'arrivée
           toute seule, et **la seule chose qui termine un trajet sans geste de
           l'utilisateur**. Elle existait déjà, en dur dans `handleRealMovement()` (js/19) ;
           elle est remontée ici pour être documentée et testée au même endroit que sa
           voisine. Ne pas l'élargir pour couvrir le stationnement : à 50 km/h, 300 m se
           parcourent en 22 s — on annoncerait « arrivé » à quelqu'un qui roule encore, et
           le tracé serait effacé sous ses yeux.

           `ARRIVAL_ASSERT_M` (500 m) borne la bulle 🏁 de la hotbox, par laquelle le
           conducteur DÉCLARE son arrivée parce qu'il s'est garé plus loin que la porte.
           Rien n'est constaté, il l'affirme — d'où la borne : au-delà, l'affirmation serait
           fausse, et l'action honnête est « Terminer le trajet », qui est un abandon.
           ⚠ Ce seuil ne fait RIEN apparaître à l'écran : il n'autorise que le geste, qui se
           demande (appui long sur la carte). Voir la note ci-dessous.

           ⚠ CE N'EST PAS UN RACCOURCI POUR GAGNER DES POINTS. Le score s'accumule au mètre
           parcouru et `isPerfectRun` ne regarde jamais l'arrivée : déclarer être arrivé ne
           crédite pas un point de plus. Ce qui change, c'est la NATURE archivée du trajet —
           arrivé plutôt qu'abandonné — et le son joué (`reached_destination.ogg`). */
        const ARRIVAL_AUTO_M   = 50;
        const ARRIVAL_ASSERT_M = 500;

        /* ⚠ IL N'Y A PLUS DE BOUTON D'ARRIVÉE À L'ÉCRAN — et il ne faut pas en remettre.
           Une fonction `arrivalUiState()` a vécu ici entre le 21/08/2026 et le même jour :
           elle décidait de l'affichage d'un bouton central « Je suis arrivé », visible dès
           500 m de la destination.
           **Le principe qui l'a fait retirer : un trajet ne se termine que lorsqu'on est
           ARRIVÉ à l'adresse.** Un bouton posé au milieu de l'écran alors qu'il reste
           400 m à parcourir propose de mettre fin au trajet — donc de couper le guidage —
           à quelqu'un qui roule encore et en a toujours besoin. Il annonce une arrivée qui
           n'a pas eu lieu, et un appui distrait au feu rouge suffit à en faire une erreur.
           Il reste donc exactement deux façons de terminer :
             1. arriver vraiment (sous `ARRIVAL_AUTO_M`) — le trajet se termine seul ;
             2. la bulle 🏁 de la hotbox, sous `ARRIVAL_ASSERT_M` — un geste DÉLIBÉRÉ (appui
                long puis sélection), pour le cas où l'on s'est garé plus loin. Rien ne
                l'affiche spontanément : on ne peut pas le déclencher par inadvertance. */

        const TRIP_JOURS_COURTS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];

        const TRIP_MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
                          'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

        /* ⚠ « Hier » se calcule sur le CALENDRIER, pas sur 24 h écoulées. Un trajet de
           23 h 30 consulté à 00 h 15 s'est déroulé hier alors qu'il a 45 min ; un trajet
           de 08 h 00 consulté le lendemain à 07 h 00 date d'hier alors qu'il en a 23. Une
           soustraction en millisecondes se trompe dans les deux cas — et aussi au
           changement d'heure, où un jour civil dure 23 ou 25 h. On compare donc des dates
           civiles ramenées à minuit. `now` est injecté pour rendre le tout testable.

           Ne rend que le JOUR, sans l'heure : depuis le regroupement année/mois/jour, ce
           libellé titre une section qui contient plusieurs trajets — y mettre l'heure de
           l'un d'eux n'aurait aucun sens. L'heure est portée par chaque ligne
           (`formatTripTime`). Ni le mois ni l'année n'y figurent : les sections parentes
           les portent déjà, les répéter à chaque jour serait du bruit. */
        function formatTripDayLabel(ts, now = new Date()) {
            const d = new Date(ts);
            if (!Number.isFinite(d.getTime())) return 'Date inconnue';
            const minuit = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
            const joursEcoules = Math.round((minuit(now) - minuit(d)) / 86400000);
            if (joursEcoules === 0) return "Aujourd'hui";
            if (joursEcoules === 1) return 'Hier';
            return `${TRIP_JOURS_COURTS[d.getDay()]} ${String(d.getDate()).padStart(2, '0')}`;
        }

        function formatTripTime(ts) {
            const d = new Date(ts);
            if (!Number.isFinite(d.getTime())) return '--:--';
            return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        }

        /* Regroupe l'historique en ANNÉE → MOIS → JOUR, du plus récent au plus ancien à
           chacun des trois niveaux.

           Pourquoi ici et pas dans le rendu : c'est le seul endroit où ce découpage peut
           être vérifié sans navigateur. Le piège n'est pas le regroupement lui-même mais
           les CLÉS — regrouper sur un libellé (« Août », « Hier ») fusionnerait deux mois
           d'années différentes et ferait bouger un groupe d'un jour à l'autre. Les clés
           sont donc numériques et absolues ; les libellés ne servent qu'à l'affichage.

           Rendu : [{ year, count, months: [{ month, label, count,
                      days: [{ key, label, count, trips: [] }] }] }]

           `count` est porté par chaque niveau parce qu'une section repliée doit pouvoir
           annoncer ce qu'elle contient sans qu'on la déplie. */
        function groupTripsByDate(trips, now = new Date()) {
            const liste = Array.isArray(trips) ? trips : [];
            const annees = new Map();

            liste.forEach(t => {
                if (!t) return;
                const d = new Date(t.date);
                // Une entrée sans horodatage exploitable n'a sa place dans aucun jour :
                // l'inclure créerait une section « Date inconnue » au milieu du calendrier.
                if (!Number.isFinite(d.getTime())) return;
                const y = d.getFullYear(), m = d.getMonth(), j = d.getDate();
                if (!annees.has(y)) annees.set(y, new Map());
                const mois = annees.get(y);
                if (!mois.has(m)) mois.set(m, new Map());
                const jours = mois.get(m);
                if (!jours.has(j)) jours.set(j, []);
                jours.get(j).push(t);
            });

            const desc = (a, b) => b - a;
            return [...annees.keys()].sort(desc).map(y => {
                const moisMap = annees.get(y);
                const months = [...moisMap.keys()].sort(desc).map(m => {
                    const joursMap = moisMap.get(m);
                    const days = [...joursMap.keys()].sort(desc).map(j => {
                        const trajets = joursMap.get(j).slice().sort((a, b) => (b.date || 0) - (a.date || 0));
                        return {
                            key: `${y}-${m}-${j}`,
                            label: formatTripDayLabel(trajets[0].date, now),
                            count: trajets.length,
                            trips: trajets,
                        };
                    });
                    return {
                        month: m,
                        label: TRIP_MOIS[m],
                        count: days.reduce((s, x) => s + x.count, 0),
                        days,
                    };
                });
                return {
                    year: y,
                    count: months.reduce((s, x) => s + x.count, 0),
                    months,
                };
            });
        }

        /* Durée en minutes → texte court. Le « h » sans minutes serait ambigu à la
           lecture d'une liste (1 h 05 et 1 h 55 s'afficheraient tous deux « 1 h »), d'où
           les minutes toujours présentes au-delà de l'heure. */
        function formatTripDuration(minutes) {
            const m = Number(minutes);
            if (!Number.isFinite(m) || m < 0) return '—';
            const total = Math.round(m);
            if (total < 1) return '< 1 min';
            if (total < 60) return `${total} min`;
            const h = Math.floor(total / 60);
            return `${h} h ${String(total % 60).padStart(2, '0')}`;
        }

        /* Distance en km → texte. Sous le kilomètre on bascule en mètres : « 0.3 km » se
           lit mal, et c'est précisément la plage des trajets écourtés. */
        function formatTripDistance(km) {
            /* ⚠ `Number(null)` vaut 0, pas NaN — le contrôle `Number.isFinite` seul
               laissait donc passer l'ABSENCE de distance pour une distance NULLE, et une
               entrée d'historique sans relevé s'affichait « 0 m » comme si le trajet
               avait été mesuré à zéro. Même famille que le `parseInt(v) || repli` corrigé
               ailleurs : ici c'est l'inverse, on confond le vide avec le zéro au lieu du
               zéro avec le vide. `formatTripDuration` n'a pas le problème, son cas de
               test passe `undefined`, dont la conversion rend bien NaN. */
            if (km === null || km === undefined || km === '') return '—';
            const v = Number(km);
            if (!Number.isFinite(v) || v < 0) return '—';
            if (v < 1) return `${Math.round(v * 1000)} m`;
            return `${v.toFixed(1)} km`;
        }

        /* Rend `{ from, to, libelle }` prêt à afficher.
           - `libelle` vaut « Départ → Arrivée » quand les deux lieux sont connus, le seul
             connu s'il n'y en a qu'un, « Trajet libre » pour un trajet sans destination,
             et null pour une entrée d'avant l'archivage des lieux — null étant le signal
             pour l'appelant de n'afficher AUCUNE ligne de lieu plutôt qu'une ligne vide.
           - Les libellés d'adresse sont tronqués : une adresse complète Mapbox
             (« 12 Rue de la Paix, 75002 Paris, France ») déborderait de la ligne. On
             coupe sur la première virgule, qui sépare le lieu de sa commune. */
        function tripPlacesLabel(trip) {
            const t = trip || {};
            const nettoie = v => {
                if (typeof v !== 'string') return null;
                const s = v.split(',')[0].trim();
                return s.length ? s : null;
            };
            const from = nettoie(t.from);
            const to   = nettoie(t.to);
            if (from && to) return { from, to, libelle: `${from} → ${to}` };
            if (to)         return { from: null, to, libelle: `→ ${to}` };
            /* Un trajet libre n'a PAS de destination manquante, il n'en a jamais eu :
               « Domicile → ? » suggérerait une donnée perdue là où il n'y a rien à
               perdre. D'où ce cas AVANT celui du départ seul, qui reste réservé au trajet
               guidé dont la destination n'a pas pu être archivée. */
            if (from && t.free) return { from, to: null, libelle: `Trajet libre depuis ${from}` };
            if (from)       return { from, to: null, libelle: `${from} → ?` };
            if (t.free)     return { from: null, to: null, libelle: 'Trajet libre' };
            return { from: null, to: null, libelle: null };
        }

        /* ═══════════════════════════════════════════════════════════════════════════
           CLASSEMENT EN LIGNE — calculs purs (23/08/2026)
           ═══════════════════════════════════════════════════════════════════════════
           Ces quatre fonctions sont ici, et pas dans `21-classement.js`, parce qu'elles
           doivent rester D'ACCORD AVEC LE SCHÉMA POSTGRES : la base refuse ce qu'elles
           laisseraient passer. Un désaccord ne se voit pas au chargement, il se voit
           quand un utilisateur n'arrive pas à s'inscrire — d'où les tests. */

        /* Clé de semaine côté serveur : le LUNDI, en `YYYY-MM-DD`, pour la colonne
           `scores.semaine` (type `date`). ⚠ Volontairement différent de `getWeekId()`
           de `12-gamification.js`, qui produit « 2026-W34 » à partir du 1er janvier :
           les deux découpent la même semaine, mais Postgres ne sait pas trier « W9 »
           avant « W10 ». Ne pas essayer de les fusionner, l'un est un identifiant
           d'affichage local, l'autre une date que la base compare et ordonne. */
        function _lundiISO(instant) {
            const d = (instant instanceof Date) ? new Date(instant.getTime()) : new Date();
            if (isNaN(d.getTime())) return null;
            const jour = (d.getDay() + 6) % 7;   // getDay() : 0 = dimanche -> 0 = lundi
            d.setDate(d.getDate() - jour);
            const mm = String(d.getMonth() + 1).padStart(2, '0');
            const jj = String(d.getDate()).padStart(2, '0');
            return `${d.getFullYear()}-${mm}-${jj}`;
        }

        /* Miroir exact de `check (points >= 0 and points <= CLASSEMENT_POINTS_MAX)`.
           On borne AVANT l'envoi pour que le refus vienne de nous avec un message
           lisible, plutot qu'une erreur SQL brute au milieu d'un `upsert`.
           ⚠ `Number()` et non `parseFloat(v) || 0` : le second transforme « 12abc »
           en 12 sans rien signaler — même famille de piège que le `parseInt(v) || repli`
           déjà corrigé ailleurs dans ce fichier. */
        const CLASSEMENT_POINTS_MAX = 500;
        function clampPointsClassement(valeur) {
            const n = Number(valeur);
            if (!isFinite(n) || n <= 0) return 0;
            return Math.min(CLASSEMENT_POINTS_MAX, Math.round(n * 100) / 100);
        }

        /* Miroir exact de `constraint pseudo_format check (pseudo ~ '^[A-Za-z0-9._-]{3,20}$')`.
           Toute retouche ici doit être répercutée dans la contrainte SQL, et l'inverse. */
        const PSEUDO_RE = /^[A-Za-z0-9._-]{3,20}$/;
        function pseudoValide(pseudo) {
            return typeof pseudo === 'string' && PSEUDO_RE.test(pseudo.trim());
        }

        /* Adresse SYNTHÉTIQUE de connexion : Supabase n'authentifie que par email ou
           téléphone, jamais par pseudo. Rien n'est jamais envoyé à cette adresse, elle
           ne sert que de clé de login.

           ⚠ LE DOMAINE N'EST PAS LIBRE (constaté le 23/08/2026). Le premier essai
           utilisait `go-app.local`, choisi précisément parce qu'il n'est pas routable :
           Supabase le refuse — `Email address "…@go-app.local" is invalid`, renvoyé par
           `signUp()` AVANT même que le trigger `creer_profil()` ne s'exécute. Sa
           validation exige un domaine crédible. D'où cette constante isolée : changer de
           domaine ne doit toucher qu'une ligne, et les tests la lisent au lieu de figer
           la valeur.
           ⚠ Ne JAMAIS y mettre un domaine de messagerie réel (`gmail.com`…) : un pseudo
           entrerait alors en collision avec l'adresse d'une vraie personne.

           Minuscules obligatoires : `profils.pseudo` est en `citext` (unique sans
           égard à la casse) ; sans ce `toLowerCase()`, « Paul » et « paul » seraient
           un seul profil mais deux comptes. */
        const PSEUDO_DOMAINE = 'go-app.local';
        function emailDePseudo(pseudo) {
            if (!pseudoValide(pseudo)) return null;
            return pseudo.trim().toLowerCase() + '@' + PSEUDO_DOMAINE;
        }

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
           Le repli conserve l'appel d'origine, aucun appelant n'a à changer. */
        function getTimeUntilEndOfWeek(now = new Date()) {
            const dayOfWeek = now.getDay(); // 0=dim, 1=lun, ..., 6=sam
            const daysUntilSunday = dayOfWeek === 0 ? 0 : (7 - dayOfWeek);
            const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSunday, 23, 59, 59);
            const diff = endOfWeek - now;
            const days = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            return `${days}j ${hours}h restants`;
        }

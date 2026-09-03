        // === STATIONS FAVORITES (mémoire long terme) ===
        // Stocke les stations sur lesquelles l'utilisateur a cliqué, avec historique des prix.
        // Permet de les mettre en avant lors des prochains trajets si elles sont dans la zone.

        const GAS_FAVORITES_KEY = 'gas_favorites_v1';
        const GAS_FAV_MAX       = 30;   // max de stations mémorisées
        const GAS_FAV_TTL_MS    = 90 * 24 * 60 * 60 * 1000; // 90 jours

        function _loadFavorites() {
            try { return JSON.parse(localStorage.getItem(GAS_FAVORITES_KEY) || '{}'); }
            catch(e) { return {}; }
        }

        function _saveFavorites(favs) {
            try { localStorage.setItem(GAS_FAVORITES_KEY, JSON.stringify(favs)); }
            catch(e) { /* quota dépassé */ }
        }

        // Clé unique par station = arrondi coords à 4 décimales (~10m)
        function _favKey(station) {
            return `${Math.round(station.lng * 10000) / 10000}_${Math.round(station.lat * 10000) / 10000}`;
        }

        function saveStationToFavorites(station, fuelType) {
            const favs = _loadFavorites();
            const key  = _favKey(station);
            const now  = Date.now();

            const existing = favs[key] || { visits: 0, priceHistory: [] };

            // Enregistrer le prix actuel dans l'historique (max 10 entrées)
            const currentPrice = getEffectivePrice(station, fuelType || 'sp95');
            if (currentPrice != null) {
                existing.priceHistory = [
                    { price: currentPrice, fuel: fuelType || 'sp95', ts: now },
                    ...(existing.priceHistory || [])
                ].slice(0, 10);
            }

            favs[key] = {
                name:         station.name,
                addr:         station.addr || '',
                lng:          station.lng,
                lat:          station.lat,
                visits:       existing.visits + 1,
                lastSeen:     now,
                lastPrices:   { sp95: station.sp95, e10: station.e10, gazole: station.gazole, sp98: station.sp98 },
                priceHistory: existing.priceHistory || [],
            };

            // Élaguer : supprimer les + anciennes si on dépasse la limite
            const keys = Object.keys(favs);
            if (keys.length > GAS_FAV_MAX) {
                keys.sort((a, b) => (favs[a].lastSeen || 0) - (favs[b].lastSeen || 0));
                keys.slice(0, keys.length - GAS_FAV_MAX).forEach(k => delete favs[k]);
            }

            _saveFavorites(favs);
            console.log(`[GasFav] Station mémorisée : ${station.name} (${existing.visits + 1} visites)`);
        }

        // Retourne true si cette station est une favorite (déjà visitée)
        function isFavoriteStation(station) {
            const favs = _loadFavorites();
            return !!favs[_favKey(station)];
        }

        // Injecte les favoris qui sont dans la zone du trajet mais absents des résultats API
        // (timeout réseau, hors rayon d'échantillonnage, etc.)
        // Re-fetche le prix actuel d'une station favorite directement par ses coordonnées
        // (requête ciblée, indépendante de l'échantillonnage du trajet)
        async function refreshFavoritePrice(fav) {
            try {
                const where = encodeURIComponent(`distance(geom, geom'POINT(${fav.lng} ${fav.lat})', 200m)`);
                const url   = `${GAS_API_BASE}?limit=5&where=${where}&timezone=Europe%2FParis`;
                const res   = await fetchResilient(url, {}, { timeoutMs: 6000, retries: 0 });
                if (!res.ok) return null;
                const data  = await res.json();
                const items = data?.results || [];
                if (items.length === 0) return null;
                // Prendre la station la plus proche
                const s = items[0];
                return {
                    sp95:   extractGasPrice(s, 'sp95'),
                    e10:    extractGasPrice(s, 'e10'),
                    gazole: extractGasPrice(s, 'gazole'),
                    sp98:   extractGasPrice(s, 'sp98'),
                };
            } catch(e) { return null; }
        }

        function injectMissingFavorites(stations, routeCoords) {
            const favs = _loadFavorites();
            if (Object.keys(favs).length === 0) return stations;

            const now      = Date.now();
            const routeLine = turf.lineString(routeCoords);
            const totalKm  = turf.length(routeLine, { units: 'kilometers' });
            const window   = _gasSearchWindow || { fromKm: 0, toKm: totalKm };

            // Index des stations déjà présentes pour éviter les doublons
            const existingKeys = new Set(stations.map(s => _favKey(s)));

            const injected = [];
            for (const [key, fav] of Object.entries(favs)) {
                // Ignorer les favoris trop anciens
                if (now - fav.lastSeen > GAS_FAV_TTL_MS) continue;
                // Déjà dans les résultats → juste marquer comme favori
                if (existingKeys.has(key)) continue;

                // Vérifier si le favori est sur/près du trajet
                const pt      = turf.point([fav.lng, fav.lat]);
                const snapped = turf.nearestPointOnLine(routeLine, pt, { units: 'kilometers' });
                const distToRoute  = snapped.properties.dist * 1000; // en mètres
                const distAlong    = snapped.properties.location;

                const maxDetour = (_gasSearchWindow || {}).maxDetourM || 1000;
                if (distToRoute > maxDetour * 1.5) continue; // légèrement plus permissif pour les favoris
                if (distAlong < window.fromKm || distAlong > window.toKm) continue;

                // Injecter avec les derniers prix connus (seront re-fetchés si possible)
                injected.push({
                    lng:          fav.lng,
                    lat:          fav.lat,
                    name:         fav.name,
                    addr:         fav.addr,
                    sp95:         fav.lastPrices?.sp95  || null,
                    e10:          fav.lastPrices?.e10   || null,
                    gazole:       fav.lastPrices?.gazole || null,
                    sp98:         fav.lastPrices?.sp98  || null,
                    hasPrices:    true,
                    distToRoute:  Math.round(distToRoute),
                    distAlongRoute: distAlong,
                    _isFavorite:  true,
                    _priceStale:  true, // prix à re-vérifier
                    _visits:      fav.visits,
                });
                console.log(`[GasFav] Injecté favori hors-API : ${fav.name}`);
            }

            return [...stations, ...injected];
        }

        // === FIN STATIONS FAVORITES ===

        // === STATIONS ESSENCE — data.gouv.fr flux JSON temps réel ===
        // ═══════════════════════════════════════════════════════════════════

        let gasStationMarkers = [];          // marqueurs Mapbox sur la carte
        let selectedGasStation = null;       // { lng, lat, name, addr, sp95, gazole } ou null
        let gasStationAlertFired = false;    // bannière "5 min" déjà affichée pour ce trajet
        let gasStopWaypoint = null;          // coords [lng, lat] du stop choisi (copié au lancement)
        /* null au départ, et volontairement : aucun carburant n'est présélectionné.
           Avec 'sp95' par défaut, l'ouverture du panneau peignait d'emblée une liste
           et une volée de pastilles sur la carte, pour un carburant que l'utilisateur
           n'avait pas demandé. Il choisit lui-même sa pastille une fois le trajet
           entré ; tant qu'il ne l'a pas fait, la carte reste lisible. */
        let selectedFuelType = null;         // 'sp95'|'gazole'|'e10'|'sp98' ou null (aucun)
        let _allGasStations = [];            // cache toutes les stations pour re-filtrer sans rappel API


        // ═══════════════════════════════════════════════════════════════
        // === DÉTECTION PAYS + ROUTEUR MULTI-SOURCE ===
        // ═══════════════════════════════════════════════════════════════

        // `COUNTRY_BOXES` et `detectCountriesOnRoute()` ont rejoint js/00-noyau-calculs.js.

        const GAS_API_BASE   = 'https://data.economie.gouv.fr/api/explore/v2.1/catalog/datasets/prix-des-carburants-en-france-flux-instantane-v2/records';
        const GAS_SEGMENT_KM = 100;
        const GAS_BUFFER_DEG = 0.15; // ~15km de buffer — assez large pour capturer les stations proches en ville

        function buildRouteSegments(routeCoords) {
            const line = turf.lineString(routeCoords);
            const totalKm = turf.length(line, { units: 'kilometers' });
            const segCount = Math.max(1, Math.ceil(totalKm / GAS_SEGMENT_KM));
            const segments = [];
            for (let i = 0; i < segCount; i++) {
                const fromKm = i * GAS_SEGMENT_KM;
                const toKm   = Math.min((i + 1) * GAS_SEGMENT_KM, totalKm);
                const sliced = turf.lineSliceAlong(line, fromKm, toKm, { units: 'kilometers' });
                const coords = sliced.geometry.coordinates;
                const lngs   = coords.map(c => c[0]);
                const lats   = coords.map(c => c[1]);
                segments.push({
                    minLng: Math.min(...lngs) - GAS_BUFFER_DEG,
                    maxLng: Math.max(...lngs) + GAS_BUFFER_DEG,
                    minLat: Math.min(...lats) - GAS_BUFFER_DEG,
                    maxLat: Math.max(...lats) + GAS_BUFFER_DEG,
                });
            }
            return segments;
        }

        // ═══════════════════════════════════════════════════════════════════
        // === HORAIRES D'OUVERTURE DES STATIONS ===
        // Le flux gouvernemental expose `horaires` (XML), `horaires_automate_24_24`
        // ("Oui"/"Non") et `services`. Ces champs revenaient déjà dans la réponse mais
        // n'étaient pas exploités : une station fermée pouvait donc être proposée.
        // ═══════════════════════════════════════════════════════════════════

        const _JOURS_XML = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

        // Retourne { status: 'open'|'closed'|'24h'|'unknown', label: string }
        function getStationOpeningStatus(s, now = new Date()) {
            // 1. Automate 24/24 : toujours accessible, même station "fermée"
            const auto = (s.horaires_automate_24_24 || '').toString().trim().toLowerCase();
            if (auto === 'oui') return { status: '24h', label: '24h/24' };

            const raw = s.horaires;
            if (!raw) return { status: 'unknown', label: '' };

            try {
                // Le champ est un XML : <horaires><jour id="1" nom="Lundi" ferme="">
                //   <horaire ouverture="07:00" fermeture="20:00"/></jour>…</horaires>
                const doc = new DOMParser().parseFromString(String(raw), 'text/xml');
                if (doc.querySelector('parsererror')) return { status: 'unknown', label: '' };

                const jourNom = _JOURS_XML[now.getDay()];
                let jourEl = null;
                doc.querySelectorAll('jour').forEach(j => {
                    const nom = (j.getAttribute('nom') || '').trim();
                    if (nom.toLowerCase() === jourNom.toLowerCase()) jourEl = j;
                });
                if (!jourEl) return { status: 'unknown', label: '' };

                // attribut ferme="1" → fermé toute la journée
                const ferme = (jourEl.getAttribute('ferme') || '').trim();
                if (ferme === '1') return { status: 'closed', label: 'Fermé aujourd\'hui' };

                const plages = jourEl.querySelectorAll('horaire');
                if (!plages.length) return { status: 'unknown', label: '' };

                const nowMin = now.getHours() * 60 + now.getMinutes();
                const toMin  = hhmm => {
                    const m = /^(\d{1,2})[:h.](\d{2})$/.exec((hhmm || '').trim());
                    if (!m) return null;
                    return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
                };

                let nextOpen = null;
                for (const p of plages) {
                    const o = toMin(p.getAttribute('ouverture'));
                    const f = toMin(p.getAttribute('fermeture'));
                    if (o == null || f == null) continue;
                    // Plage franchissant minuit (ex. 22:00 → 06:00)
                    const inRange = (f > o) ? (nowMin >= o && nowMin < f)
                                            : (nowMin >= o || nowMin < f);
                    if (inRange) {
                        const hh = String(Math.floor(f / 60)).padStart(2, '0');
                        const mm = String(f % 60).padStart(2, '0');
                        return { status: 'open', label: `Ouvert · ferme ${hh}:${mm}` };
                    }
                    if (o > nowMin && (nextOpen == null || o < nextOpen)) nextOpen = o;
                }

                if (nextOpen != null) {
                    const hh = String(Math.floor(nextOpen / 60)).padStart(2, '0');
                    const mm = String(nextOpen % 60).padStart(2, '0');
                    return { status: 'closed', label: `Fermé · ouvre ${hh}:${mm}` };
                }
                return { status: 'closed', label: 'Fermé' };
            } catch (e) {
                return { status: 'unknown', label: '' };
            }
        }

        // Empreinte d'un tracé pour la clé de cache. La bounding box seule ne suffit
        // pas : deux itinéraires entre les mêmes extrémités ont des bbox quasi
        // identiques et partageaient donc leur cache — au retour sur l'itinéraire 1,
        // l'app resservait les stations scannées pour l'itinéraire 2.
        function routeFingerprint(routeCoords) {
            try {
                const line    = turf.lineString(routeCoords);
                const totalKm = turf.length(line, { units: 'kilometers' });
                // 5 points le long du tracé : suffisant pour séparer deux variantes,
                // assez grossier pour rester stable malgré les micro-écarts Mapbox.
                const marks = [];
                for (let i = 1; i <= 5; i++) {
                    const pt = turf.along(line, totalKm * (i / 6), { units: 'kilometers' });
                    const [lng, lat] = pt.geometry.coordinates;
                    marks.push(Math.round(lng * 100) / 100 + ',' + Math.round(lat * 100) / 100);
                }
                return Math.round(totalKm) + '|' + marks.join(';');
            } catch (e) {
                return 'nofp';
            }
        }

        // `extractGasCoords()`, `extractGasPrice()` et `getBestPrice()` ont rejoint
        // js/00-noyau-calculs.js : ce sont des lecteurs de flux, purs et testables
        // sur des enregistrements figes (formats FR tableau, BE/ES pre-parses).

        // ── FRANCE : récupération paginée autour d'un point ──
        // L'API renvoie { results: [...], total_count: N }. Si N > 100, il FAUT
        // paginer avec offset, sinon on perd des stations sans le savoir.
        const GAS_PAGE_SIZE  = 100;   // maximum autorisé par l'API ODS v2.1
        const GAS_MAX_PAGES  = 6;     // garde-fou : 600 stations max par point sondé

        async function fetchGasPageFR(lng, lat, radiusKm, offset) {
            const where = encodeURIComponent(`distance(geom, geom'POINT(${lng} ${lat})', ${radiusKm}km)`);
            const url   = `${GAS_API_BASE}?limit=${GAS_PAGE_SIZE}&offset=${offset}&where=${where}&timezone=Europe%2FParis`;
            const res   = await fetchResilient(url, {}, { timeoutMs: 12000, retries: 1 });
            if (!res.ok) return { results: [], total: 0 };
            const data = await res.json();
            return {
                results: data?.results || (Array.isArray(data) ? data : []),
                total:   Number(data?.total_count ?? 0)
            };
        }

        async function fetchGasPointFR(lng, lat, radiusKm) {
            const first = await fetchGasPageFR(lng, lat, radiusKm, 0);
            let all = first.results;

            const pagesNeeded = Math.min(GAS_MAX_PAGES, Math.ceil(first.total / GAS_PAGE_SIZE));
            if (pagesNeeded > 1) {
                const rest = [];
                for (let p = 1; p < pagesNeeded; p++) {
                    rest.push(fetchGasPageFR(lng, lat, radiusKm, p * GAS_PAGE_SIZE).catch(() => ({ results: [] })));
                }
                (await Promise.all(rest)).forEach(r => { all = all.concat(r.results); });
            }

            if (first.total > all.length) {
                console.warn(`[GasAPI/FR] ⚠ ${first.total} stations autour de ${lng.toFixed(4)},${lat.toFixed(4)} mais seulement ${all.length} récupérées (plafond GAS_MAX_PAGES)`);
            }
            return all;
        }

        // ═══════════════════════════════════════════════════════════════════
        // === SCAN STATIONS EN DEUX PHASES (perf trajets longue distance) ===
        // Phase 1 : au calcul du tracé, on ne scanne que le premier tronçon
        //           (rayon vol d'oiseau ~1h de route) au lieu de tout le trajet.
        //           Paris→Marseille : 12 points sondés au lieu de 112.
        // Phase 2 : en navigation, fenêtre glissante rafraîchie toutes les 30 min
        //           devant le véhicule, filtre détour, mise à jour silencieuse.
        // ═══════════════════════════════════════════════════════════════════
        const GAS_PHASE1_RADIUS_KM   = 80;      // ~1h d'autoroute, vol d'oiseau
        // Cadence de rescan proportionnée au trajet. Un intervalle fixe était mal
        // calibré aux deux extrémités : 30 min sur un trajet de 9 km signifiait ne
        // jamais rescanner (on est déjà arrivé), et 2 km de zone morte sur un
        // Paris–Marseille déclenchait des scans pour du bruit. Le bon critère est la
        // part du trajet parcourue, pas une durée absolue.
        function getGasLiveCadence(routeTotalKm) {
            if (routeTotalKm < 30)  return { intervalMs:  5 * 60 * 1000, deadZoneKm:  2 };
            if (routeTotalKm < 150) return { intervalMs: 15 * 60 * 1000, deadZoneKm: 10 };
            if (routeTotalKm < 400) return { intervalMs: 25 * 60 * 1000, deadZoneKm: 25 };
            return                         { intervalMs: 30 * 60 * 1000, deadZoneKm: 40 };
        }

        const GAS_LIVE_INTERVAL_MS   = 30 * 60 * 1000; // repli si la cadence est indisponible
        const GAS_LIVE_WINDOW_KM     = 80;      // fenêtre glissante devant le véhicule
        const GAS_LIVE_MAX_DETOUR_MIN = 15;     // détour max toléré en live
        // Plafond de détour EN TEMPS RÉEL, appliqué a posteriori sur les deux phases.
        // Indispensable : maxDetourM filtre une distance à vol d'oiseau, or une station
        // à 7 km de la ligne peut coûter 20 min si l'accès impose une sortie lointaine.
        // Seul le calcul routier (fetchRouteMapboxWithWaypoint) donne le vrai coût.
        const GAS_MAX_DETOUR_MIN = 15;
        const GAS_LIVE_DEAD_ZONE_KM  = 20;      // pas de rescan si < 20 km parcourus

        // Découpe routeCoords pour ne garder que le tronçon [fromKm, toKm].
        // Retourne null si le découpage est impossible (tracé trop court).
        function sliceRouteSegment(routeCoords, fromKm, toKm) {
            try {
                const line    = turf.lineString(routeCoords);
                const totalKm = turf.length(line, { units: 'kilometers' });
                const a = Math.max(0, Math.min(fromKm, totalKm));
                const b = Math.max(a + 0.5, Math.min(toKm, totalKm));
                if (b - a < 0.5) return null;
                const sliced = turf.lineSliceAlong(line, a, b, { units: 'kilometers' });
                const coords = sliced?.geometry?.coordinates;
                return (coords && coords.length >= 2) ? coords : null;
            } catch(e) { return null; }
        }

        // ── FRANCE ──
        async function fetchStationsFR(routeCoords) {
            const line     = turf.lineString(routeCoords);
            const totalKm  = turf.length(line, { units: 'kilometers' });

            // === CACHE sessionStorage (TTL 15 min) ===
            // Clé = bounding box arrondi à 2 décimales (~1km de précision)
            // → résiste aux micro-variations du tracé Mapbox entre deux appels
            try {
                const bbox = turf.bbox(line);
                const cacheKey = 'gas_fr_v3_' + bbox.map(v => Math.round(v * 100) / 100).join('_') + '_' + routeFingerprint(routeCoords);
                const cached = sessionStorage.getItem(cacheKey);
                if (cached) {
                    const { ts, data } = JSON.parse(cached);
                    // Le flux gouvernemental est rafraîchi toutes les 10 min :
                    // un cache de 15 min pouvait servir des prix périmés.
                    if (Date.now() - ts < 8 * 60 * 1000) {
                        console.log(`[GasAPI/FR] Cache hit (${data.length} stations)`);
                        return data;
                    }
                    sessionStorage.removeItem(cacheKey);
                }
            } catch(e) { /* sessionStorage indisponible — on continue sans cache */ }

            // Rayon de recherche adaptatif selon la densité urbaine
            // Trajet court (<30km) = zone dense = rayon réduit pour rester précis
            // Trajet long = rayon plus grand pour ne pas multiplier les appels
            const RADIUS_KM   = totalKm < 30 ? 3 : 5;
            const STEP_KM     = RADIUS_KM * 1.4; // chevauchement ~55% entre cercles (était 1.6)

            // Échantillonner des points le long du trajet.
            // Sur trajet court (<30 km), la step de 4.2 km ne produit que 2-3 cercles.
            // Le départ est toujours inclus (km 0), mais les stations locales autour
            // de ce point risquent d'être dans l'angle mort entre les cercles.
            // On ajoute donc des points intermédiaires supplémentaires pour les courts
            // trajets, garantissant qu'aucune station à moins de 2 km du départ ne
            // soit ratée lors du scan.
            const sampleCount = Math.max(1, Math.ceil(totalKm / STEP_KM));
            const samplePoints = [];
            for (let i = 0; i <= sampleCount; i++) {
                const km = Math.min(i * STEP_KM, totalKm);
                const pt = turf.along(line, km, { units: 'kilometers' });
                samplePoints.push({ c: pt.geometry.coordinates, r: RADIUS_KM });
            }
            // Points intermédiaires au km 1 et km 2 sur trajets courts :
            // couvre la zone de départ avec un cercle de 3 km bien centré.
            if (totalKm < 30) {
                [1, 2].forEach(km => {
                    if (km < totalKm) {
                        const pt = turf.along(line, km, { units: 'kilometers' });
                        samplePoints.push({ c: pt.geometry.coordinates, r: RADIUS_KM });
                    }
                });
            }

            // ⚠ Cercle DÉDIÉ à la bulle « plus proche ».
            // Les cercles ci-dessus suivent le TRACÉ. Or la bulle est centrée sur le
            // véhicule et peut s'élargir jusqu'à GAS_NEAR_RADIUS_MAX_M (5 km), alors
            // que le rayon de sondage n'est que de 3 km en ville. Résultat : les
            // stations situées à côté du départ mais du mauvais côté par rapport à la
            // direction du trajet n'étaient jamais interrogées, et la bulle paraissait
            // vide alors que le quartier en est plein.
            const anchor = getGasAnchorPoint();
            if (anchor) {
                samplePoints.push({
                    c: anchor,
                    r: Math.max(RADIUS_KM, GAS_NEAR_RADIUS_MAX_M / 1000)
                });
            }

            // Un appel API par point d'échantillonnage, en parallèle
            // ⚠ L'API ODS v2.1 plafonne à 100 enregistrements par requête.
            // En zone dense (Paris, Lyon…), un cercle de 3 km dépasse largement
            // ce seuil : sans pagination, l'API renvoie 100 stations arbitraires
            // (ordre du dataset, PAS par prix) et les moins chères peuvent
            // disparaître silencieusement. On lit total_count et on pagine.
            const results = await Promise.all(samplePoints.map(p =>
                fetchGasPointFR(p.c[0], p.c[1], p.r).catch(() => [])
            ));

            // Déduplications par ID de station
            const seen = new Set(); const merged = [];
            for (const batch of results) for (const s of batch) {
                const key = s.id || `${s.longitude},${s.latitude}`;
                if (!seen.has(key)) { seen.add(key); merged.push(s); }
            }
            console.log(`[GasAPI/FR] ${samplePoints.length} points sondés → ${merged.length} stations (rayon ${RADIUS_KM}km + ancre ${Math.max(RADIUS_KM, GAS_NEAR_RADIUS_MAX_M/1000)}km)`);

            // Sauvegarder en cache sessionStorage
            try {
                const bbox = turf.bbox(line);
                const cacheKey = 'gas_fr_v3_' + bbox.map(v => Math.round(v * 100) / 100).join('_') + '_' + routeFingerprint(routeCoords);
                sessionStorage.setItem(cacheKey, JSON.stringify({ ts: Date.now(), data: merged }));
            } catch(e) { /* quota dépassé ou indisponible — pas bloquant */ }

            return merged;
        }

        // ── BELGIQUE / LUXEMBOURG ──
        // Problème CORS : carbu.com et Overpass bloquent les requêtes depuis file:// (origin: null)
        // Solution : Mapbox Search API (même token, CORS garanti) pour localiser les stations,
        // + tentative Overpass via POST (certains serveurs acceptent null origin en POST)
        /* ═══ REPLI MAPBOX — NE PART QUE SI OVERPASS N'A RIEN RENDU  (03/09/2026) ═══
           Remplace une branche qui N'A JAMAIS PU FONCTIONNER. L'ancienne interrogeait
           `geocoding/v5/mapbox.places/gas_station.json` : dans cette URL, le segment
           avant `.json` est le TEXTE CHERCHÉ, pas une catégorie — l'app demandait donc
           des lieux NOMMÉS « gas_station ». Mesuré le 03/09/2026 : 200 avec
           `features: []`, un zéro parfaitement silencieux. Et ce n'était pas la chaîne
           qui était en cause : « Shell » rendait zéro aussi, tandis que « Bruxelles »
           sans `types` rendait 3. Le géocodage Mapbox NE SERT PAS DE POI ; l'API v6 le
           dit en refusant le type (422, « Type "poi" is not a known type »). La
           recherche par catégorie vit dans un autre produit, la Search Box API.

           ⚠ ET SURTOUT : ELLE PARTAIT À CHAQUE SCAN, en parallèle d'Overpass,
           `sampleCount + 1` fois — 2 appels pour une bulle, ~9 pour un Paris-Bruxelles,
           tous facturés, tous vides. Le commentaire d'origine (« CORS garanti »)
           décrivait pourtant la bonne intention : un FILET pour le jour où les miroirs
           Overpass tombent ensemble (30/08/2026) ou sont bloqués CORS en `file://`.
           Un filet ne se paie pas quand on ne tombe pas. Cette version ne part donc que
           si Overpass n'a RIEN rendu — coût nominal : zéro appel.

           ⚠ `bbox` ET NON `proximity`. Mesuré sur la même bulle bruxelloise :
           `proximity` ramène « ma bouteille de gaz » et « Fédération Belge des
           Négociants en… » ; `bbox` ramène Esso Groot-Bijgaarden, Dats24 Anderlecht,
           TotalEnergies, LUKOIL. Les bbox sont déjà produites par buildRouteSegments.
           ⚠ PLAFOND DUR DE 25 PAR APPEL (`limit=50` → 400, « Limit must be in range
           [1,25] »). C'est un filet, pas une source : Overpass rend 342 stations là où
           celle-ci en rend 25 par tronçon. Ne pas la promouvoir en source principale.

           Les horaires ne sont PAS repris : Mapbox les donne en `open_hours.periods`,
           là où getStationOpeningStatus() attend le XML du flux français. Les mapper
           demanderait un second parseur pour un repli qui ne sert presque jamais. */
        async function _fetchStationsBEMapbox(segments, allStations) {
            /* ⚠ UNE SEULE DÉFINITION DE LA REQUÊTE SEARCH BOX DANS LE PROJET (04/09/2026).
               Cette fonction avait sa propre construction d'URL, recopiée le 03/09 ; les
               replis parkings (js/27) et bornes (js/19) l'auraient recopiée deux fois de
               plus. Le projet a déjà payé ce motif — trois copies de l'échappement HTML,
               deux boucles de miroirs Overpass. Tout passe désormais par
               `rechercheCategorieMapbox()` et `ficheMapboxCommune()`
               (js/00-helpers-partages), qui portent le plafond de 25, l'ordre de bbox et
               le piège du `brand` en tableau. */
            let ajoutees = 0;
            await Promise.all(segments.map(async seg => {
                let fiches;
                try {
                    fiches = await rechercheCategorieMapbox('gas_station', seg);
                } catch (e) {
                    if (DEBUG) console.warn('[GasAPI/BE] repli Mapbox :', e.message);
                    return;
                }
                fiches.forEach(x => {
                    const c = ficheMapboxCommune(x);
                    const id = `mb_${c.lng.toFixed(5)}_${c.lat.toFixed(5)}`;
                    if (allStations[id]) return;
                    allStations[id] = {
                        // Même règle que la source Overpass : le pays vient de la POSITION.
                        _country: paysDuPoint(c.lng, c.lat) || 'be',
                        latitude:  String(c.lat),
                        longitude: String(c.lng),
                        nom:     c.nom || 'Station',
                        adresse: c.rue,
                        ville:   c.ville,
                        cp:      c.cp,
                        prix:    [],
                    };
                    ajoutees++;
                });
            }));
            return ajoutees;
        }

        async function fetchStationsBE(routeCoords) {
            const allStations = {};

            // === Source principale : Overpass — le hedging commun, pas une boucle à soi ===
            /* ⚠ CE FETCHER AVAIT SA PROPRE BOUCLE DE MIROIRS  (corrigé le 03/09/2026).
               Il était le SEUL consommateur Overpass du projet à ne pas passer par
               `_fetchOverpassHedged` (js/19) — js/09, js/10, js/19 et js/27 y passent
               tous — et il rejouait donc, seul dans son coin, trois défauts corrigés
               ailleurs depuis :
                 — `break` DÈS LE PREMIER MIROIR RÉPONDANT 200, MÊME VIDE. Un miroir qui
                   rend `elements: []` remportait la course et la Belgique restait
                   vide sans que rien n'échoue. C'est exactement ce que
                   `{ exigerResultat: true }` empêche : la réponse vide est mise de côté,
                   les autres miroirs continuent.
                 — AUCUN `AbortController`, aucun timeout : un miroir pendu tenait la
                   ligne sans limite. Mesuré sur l'appareil entre `scanOuvre` et
                   `fitScan`, même requête au même rayon de 5 km : 38 s, puis 55 s,
                   puis 14 s, plus un scan sans cadrage du tout.
                 — LISTE DE MIROIRS FIGÉE aux quatre d'origine, sans `overpass-api.de`
                   ajouté après la panne groupée du 30/08/2026, et menée par
                   `private.coffee` — celui-là même que js/19 mesure « CORS : bloqué
                   (Origin: null) » en `file://`, donc un échec garanti en tête de file
                   dans l'APK.
               ⚠ `nwr` + `out center tags` remplacent `node` + `out body` : les stations
               cartographiées en polygone étaient perdues. Relevé à Bruxelles le
               03/09/2026 (bbox 50.82,4.32,50.88,4.40) : 31 avec `node`, 37 avec `nwr`.
               `out center` pose alors `center` au lieu de `lat`/`lon` sur les `way` —
               d'où la lecture des deux, comme le fait déjà fetchEVFromOverpass. */
            const segments = buildRouteSegments(routeCoords);
            const _beOverpass = { ok: 0, vides: 0, echecs: 0, causes: [] };
            const overpassPromises = segments.map(async seg => {
                const bbox  = `${seg.minLat.toFixed(4)},${seg.minLng.toFixed(4)},${seg.maxLat.toFixed(4)},${seg.maxLng.toFixed(4)}`;
                const query = `[out:json][timeout:20];nwr["amenity"="fuel"](${bbox});out center tags;`;
                let data;
                try {
                    data = await _fetchOverpassHedged(query, { exigerResultat: true });
                } catch (e) {
                    _beOverpass.echecs++;
                    _beOverpass.causes.push(String(e && e.message || e).slice(0, 120));
                    if (DEBUG) console.warn('[fetchStationsBE] Overpass :', e.message);
                    return;
                }
                const elements = data?.elements || [];
                if (elements.length) _beOverpass.ok++; else _beOverpass.vides++;
                elements.forEach(node => {
                    /* `way` et `relation` n'ont pas de lat/lon propres : `out center` leur
                       pose un `center`. Sans cette lecture, toute station en polygone
                       sortait avec des coordonnées `undefined`. */
                    const nLat = node.lat ?? node.center?.lat;
                    const nLon = node.lon ?? node.center?.lon;
                    if (typeof nLat !== 'number' || typeof nLon !== 'number') return;
                    const id = `osm_${node.type || 'node'}_${node.id}`;
                    const tags = node.tags || {};
                    // Merges avec station Mapbox existante si même position ~
                    const existingKey = Object.keys(allStations).find(k => {
                        const s = allStations[k];
                        return Math.abs(parseFloat(s.latitude) - nLat) < 0.001 &&
                               Math.abs(parseFloat(s.longitude) - nLon) < 0.001;
                    });
                    const target = existingKey ? allStations[existingKey] : null;
                    // Prix OSM si disponibles
                    const parsePrice = v => { const n = parseFloat(String(v||'').replace(',','.')); return n > 0.3 ? n : null; };
                    const prices = {
                        _sp95:   parsePrice(tags['fuel:octane_95:price'] ?? tags['price:octane_95']),
                        _gazole: parsePrice(tags['fuel:diesel:price']    ?? tags['price:diesel']),
                        _sp98:   parsePrice(tags['fuel:octane_98:price'] ?? tags['price:octane_98']),
                        _e10:    parsePrice(tags['fuel:e10:price']),
                    };
                    if (target) {
                        // Enrichir la station Mapbox avec les prix OSM
                        Object.assign(target, prices);
                        if (!target.nom || target.nom === 'Station') target.nom = tags.name ?? tags.brand ?? target.nom;
                    } else {
                        allStations[id] = {
                            /* ⚠ LE PAYS VIENT DE LA POSITION, PAS DU FETCHER (03/09/2026).
                               Overpass ignore les frontières : interrogé sur une bbox à cheval,
                               il rend des stations FRANÇAISES. Elles héritaient du label 'be',
                               donc de l'exception « étrangère sans prix, on l'affiche » de
                               gasStationAffichable(). Mesuré à Lille le 03/09/2026 : 29 doublons
                               français sans prix intercalés dans la liste (27 fiches → 56). */
                            _country: paysDuPoint(nLon, nLat) || 'be',
                            latitude:  String(nLat),
                            longitude: String(nLon),
                            nom:     tags.name ?? tags.brand ?? tags.operator ?? 'Station',
                            adresse: tags['addr:street'] ? `${tags['addr:housenumber']??''} ${tags['addr:street']}`.trim() : '',
                            ville:   tags['addr:city'] ?? tags['addr:town'] ?? '',
                            cp:      tags['addr:postcode'] ?? '',
                            prix:    [],
                            ...prices,
                        };
                    }
                });
            });
            await Promise.all(overpassPromises);

            /* Le filet ne se déploie que si le sol se dérobe : Overpass muet — miroirs
               tous en échec, ou tous bloqués CORS en `file://`. Dans le cas nominal,
               ZÉRO appel Mapbox facturé. Voir _fetchStationsBEMapbox() ci-dessus. */
            let _beMapbox = 0;
            if (Object.keys(allStations).length === 0) {
                console.warn('[GasAPI/BE] Overpass muet — repli Mapbox');
                _beMapbox = await _fetchStationsBEMapbox(segments, allStations);
            }

            const stations = Object.values(allStations);
            const withPrices = stations.filter(s => s._sp95 || s._gazole || s._sp98 || s._e10);
            console.log(`[GasAPI/BE] ${stations.length} stations (${withPrices.length} avec prix)`);
            /* ⚠ AU JOURNAL 🩺, PAS SEULEMENT EN CONSOLE  (03/09/2026). La console est
               inaccessible dans l'APK : pendant toute une soiree de releves, la seule
               question qui comptait — la branche BE a-t-elle seulement tourne, et
               qu'a-t-elle rendu — n'avait aucun chemin vers l'ecran. Le journal ne
               montrait que `scanOuvre` puis `fitScan`, muets sur les sources. */
            tenterSansBruit(() => logDiag('gasBE', {
                total: stations.length, avecPrix: withPrices.length,
                mapbox: _beMapbox, overpass: stations.length - _beMapbox,
                segments: segments.length, ok: _beOverpass.ok,
                vides: _beOverpass.vides, echecs: _beOverpass.echecs,
                causes: _beOverpass.causes.join(' | ') || null,
            }));
            return stations; // on retourne TOUTES les stations même sans prix pour la carte
        }

        /* ═══ ESPAGNE — PAR PROVINCE, ET NON PAR RAYON  (04/09/2026) ═══
           LA VERSION PRÉCÉDENTE N'A JAMAIS PU FONCTIONNER, comme la branche Mapbox du
           fetcher belge. Elle appelait
             …/EstacionesTerrestresHist/Consulta/0/0/{lat}/{lng}/{rayon}/km
           qui rend **404** : ce point d'entrée « rayon en km » n'existe pas dans l'API
           du MINETUR. L'échec était avalé par un `catch` silencieux, donc l'Espagne
           rendait zéro station depuis toujours, sans une ligne au journal. Découvert le
           03/09/2026 par un scan à La Jonquera : rien côté espagnol, 2 stations côté
           français au Boulou, alors que l'API en connaît 11 478.

           CE QUI EXISTE VRAIMENT, mesuré ce jour :
             /EstacionesTerrestres/                    200 — 12,2 Mo en 9,4 s  (inutilisable en vol)
             /EstacionesTerrestres/FiltroProvincia/17  200 —  288 Ko en 0,58 s ← celui-ci
             /EstacionesTerrestres/FiltroMunicipio/…   400
           D'où le filtrage par PROVINCE. La table ES_PROVINCES ci-dessous donne les
           limites de chacune, calculées hors ligne à partir du jeu officiel lui-même.

           ⚠ CENTILES 1/99 ET NON MIN/MAX. Au moins une fiche officielle porte des
           coordonnées fausses : avec des bornes brutes, PONTEVEDRA ressortait candidate
           à Madrid COMME à Barcelone, et l'app serait allée chercher la Galice depuis la
           Catalogne. La marge de 0,15° au moment de la sélection compense largement le
           rognage — et de toute façon `FiltroProvincia` rend la province ENTIÈRE, la
           boîte ne sert qu'à choisir laquelle.

           ⚠ LE CHAMP GAZOLE S'APPELLE `Precio Gasoleo A`, SANS ACCENT ET SANS « I ».
           L'ancien code lisait `Precio Gasoil A`, qui n'existe pas : même si l'URL avait
           répondu, le gazole serait resté vide. Les autres noms étaient justes. */
        const ES_PROVINCES = [
            ['01',-3.05,42.55,-2.31,43.14], // ARABA/ÁLAVA (75)
            ['02',-2.71,38.36,-0.97,39.35], // ALBACETE (155)
            ['03',-0.96,37.89,0.17,38.85], // ALICANTE (483)
            ['04',-3.00,36.72,-1.75,37.65], // ALMERÍA (229)
            ['05',-5.34,40.15,-4.41,41.10], // ÁVILA (72)
            ['06',-7.15,38.08,-5.09,39.25], // BADAJOZ (278)
            ['07',1.31,38.89,4.26,40.01], // BALEARS (ILLES) (223)
            ['08',1.54,41.22,2.72,42.10], // BARCELONA (800)
            ['09',-4.24,41.59,-2.75,43.16], // BURGOS (139)
            ['10',-7.23,39.14,-5.33,40.32], // CÁCERES (162)
            ['11',-6.42,36.03,-5.25,36.89], // CÁDIZ (291)
            ['12',-0.59,39.78,0.47,40.61], // CASTELLÓN / CASTELLÓ (196)
            ['13',-4.86,38.51,-2.78,39.40], // CIUDAD REAL (219)
            ['14',-5.40,37.27,-4.16,38.48], // CÓRDOBA (207)
            ['15',-9.19,42.59,-7.87,43.66], // CORUÑA (A) (289)
            ['16',-3.04,39.33,-1.36,40.36], // CUENCA (116)
            ['17',1.94,41.68,3.18,42.43], // GIRONA (273)
            ['18',-4.16,36.73,-2.48,37.81], // GRANADA (282)
            ['19',-3.43,40.33,-1.88,41.19], // GUADALAJARA (92)
            ['20',-2.53,43.01,-1.75,43.35], // GIPUZKOA (147)
            ['21',-7.41,37.14,-6.22,37.97], // HUELVA (142)
            ['22',-0.75,41.49,0.56,42.74], // HUESCA (124)
            ['23',-4.22,37.45,-2.67,38.36], // JAÉN (214)
            ['24',-6.88,42.14,-5.02,42.95], // LEÓN (167)
            ['25',0.42,41.37,1.83,42.75], // LLEIDA (186)
            ['26',-2.97,42.02,-1.74,42.57], // RIOJA (LA) (82)
            ['27',-7.93,42.49,-7.02,43.68], // LUGO (127)
            ['28',-4.24,40.10,-3.29,40.90], // MADRID (894)
            ['29',-5.30,36.34,-3.89,37.14], // MÁLAGA (310)
            ['30',-1.90,37.41,-0.78,38.61], // MURCIA (465)
            ['31',-2.21,41.98,-1.27,43.29], // NAVARRA (248)
            ['32',-8.20,41.84,-6.99,42.47], // OURENSE (87)
            ['33',-6.98,43.15,-4.58,43.58], // ASTURIAS (240)
            ['34',-4.90,41.84,-4.08,42.87], // PALENCIA (74)
            ['35',-15.71,27.76,-13.50,29.06], // PALMAS (LAS) (254)
            ['36',-8.86,41.92,-7.95,42.77], // PONTEVEDRA (227)
            ['37',-6.82,40.38,-5.20,41.20], // SALAMANCA (112)
            ['38',-17.98,27.77,-16.23,28.81], // SANTA CRUZ DE TENERIFE (241)
            ['39',-4.50,42.94,-3.16,43.47], // CANTABRIA (168)
            ['40',-4.65,40.72,-3.47,41.43], // SEGOVIA (76)
            ['41',-6.30,36.90,-4.80,37.93], // SEVILLA (441)
            ['42',-3.19,41.17,-1.93,42.03], // SORIA (42)
            ['43',0.37,40.54,1.62,41.46], // TARRAGONA (235)
            ['44',-1.44,40.11,0.19,41.17], // TERUEL (69)
            ['45',-5.19,39.42,-3.04,40.24], // TOLEDO (244)
            ['46',-1.29,38.82,-0.15,39.75], // VALENCIA / VALÈNCIA (649)
            ['47',-5.31,41.21,-4.12,42.10], // VALLADOLID (153)
            ['48',-3.15,43.06,-2.50,43.41], // BIZKAIA (130)
            ['49',-6.64,41.23,-5.37,42.09], // ZAMORA (89)
            ['50',-2.00,41.13,0.14,42.28], // ZARAGOZA (238)
            ['51',-5.34,35.88,-5.30,35.89], // CEUTA (10)
            ['52',-2.95,35.27,-2.93,35.30], // MELILLA (12)
        ];

        const ES_PROV_MARGE = 0.15;   // ~16 km : couvre une bulle à cheval sur deux provinces
        const ES_CACHE_TTL_MS = 10 * 60 * 1000;   // le flux officiel bouge toutes les 30 min
        const _esCache = new Map();   // idProvince -> { ts, stations }

        function _esProvincesPour(routeCoords) {
            const ids = new Set();
            for (const [lng, lat] of routeCoords) {
                for (const [id, minLo, minLa, maxLo, maxLa] of ES_PROVINCES) {
                    if (lng >= minLo - ES_PROV_MARGE && lng <= maxLo + ES_PROV_MARGE &&
                        lat >= minLa - ES_PROV_MARGE && lat <= maxLa + ES_PROV_MARGE) ids.add(id);
                }
            }
            return [...ids];
        }

        async function fetchStationsES(routeCoords) {
            const provinces = _esProvincesPour(routeCoords);
            if (!provinces.length) {
                console.log('[GasAPI/ES] aucune province candidate');
                return [];
            }
            const parPrix = v => {
                if (v == null) return null;
                const n = parseFloat(String(v).replace(',', '.'));
                return n > 0.1 ? n : null;
            };
            const allStations = {};
            let ok = 0, echecs = 0, depuisCache = 0;
            const causes = [];

            await Promise.all(provinces.map(async id => {
                const cache = _esCache.get(id);
                if (cache && Date.now() - cache.ts < ES_CACHE_TTL_MS) {
                    depuisCache++;
                    cache.stations.forEach(s => { allStations[s._id] = s; });
                    return;
                }
                const url = 'https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes'
                          + '/PreciosCarburantes/EstacionesTerrestres/FiltroProvincia/' + id;
                let data;
                try {
                    const res = await fetchResilient(url, {}, { timeoutMs: 14000, retries: 1 });
                    if (!res.ok) { echecs++; causes.push(`prov ${id} → ${res.status}`); return; }
                    data = await res.json();
                } catch (e) {
                    echecs++; causes.push(`prov ${id} → ${String(e.message || e).slice(0, 60)}`);
                    return;
                }
                ok++;
                const lot = [];
                (data?.ListaEESSPrecio || []).forEach(s => {
                    const lat = parseFloat(String(s.Latitud ?? '').replace(',', '.'));
                    const lng = parseFloat(String(s['Longitud (WGS84)'] ?? '').replace(',', '.'));
                    if (isNaN(lat) || isNaN(lng)) return;
                    const fiche = {
                        _id: 'es_' + (s.IDEESS ?? `${lat},${lng}`),
                        // Comme la Belgique : le pays vient de la POSITION, pas du fetcher.
                        _country: paysDuPoint(lng, lat) || 'es',
                        latitude:  String(lat),
                        longitude: String(lng),
                        nom:     s['Rótulo'] ?? s.Rotulo ?? 'Station',
                        adresse: s['Dirección'] ?? s.Direccion ?? '',
                        ville:   s.Municipio ?? '',
                        cp:      s['C.P.'] ?? '',
                        prix: [],
                        _sp95:   parPrix(s['Precio Gasolina 95 E5']),
                        _gazole: parPrix(s['Precio Gasoleo A']),   // ⚠ « Gasoleo », pas « Gasoil »
                        _sp98:   parPrix(s['Precio Gasolina 98 E5']),
                        _e10:    parPrix(s['Precio Gasolina 95 E10']),
                    };
                    lot.push(fiche);
                    allStations[fiche._id] = fiche;
                });
                _esCache.set(id, { ts: Date.now(), stations: lot });
            }));

            const stations = Object.values(allStations);
            const avecPrix = stations.filter(s => s._sp95 || s._gazole || s._sp98 || s._e10).length;
            console.log(`[GasAPI/ES] ${stations.length} stations (${avecPrix} avec prix), provinces ${provinces.join(',')}`);
            /* ⚠ AU JOURNAL, comme gasBE. C'est l'absence de ce témoin qui a laissé une
               source entièrement morte passer inaperçue pendant toute la vie du projet. */
            tenterSansBruit(() => logDiag('gasES', {
                total: stations.length, avecPrix,
                provinces: provinces.join(','), ok, cache: depuisCache, echecs,
                causes: causes.join(' | ') || null,
            }));
            return stations;
        }

        // ── ROUTEUR PRINCIPAL ──
        async function fetchGasStationsAlongRoute(routeCoords) {
            const countries = detectCountriesOnRoute(routeCoords);
            console.log(`[GasAPI] Pays détectés: ${countries.join(', ')}`);
            if (countries.length > 1 || countries[0] !== 'fr') tenterSansBruit(() => logDiag('gasPays', { ou: 'trajet', pays: countries.join('+') }));
            const seen = new Set(); const merged = [];
            const batches = await Promise.all(countries.map(cc => {
                if (cc === 'fr') return fetchStationsFR(routeCoords).catch(() => []);
                if (cc === 'be' || cc === 'lu') return fetchStationsBE(routeCoords).catch(() => []);
                if (cc === 'es') return fetchStationsES(routeCoords).catch(() => []);
                return Promise.resolve([]);
            }));
            for (const batch of batches) for (const s of batch) {
                const key = `${s.latitude},${s.longitude}`;
                if (!seen.has(key)) { seen.add(key); merged.push(s); }
            }
            console.log(`[GasAPI] ${merged.length} stations total (${countries.join('+')})`);
            return merged;
        }

        // Compteurs de diagnostic : permettent de voir, depuis le téléphone, à quelle
        // étape les stations disparaissent (API → parse → prix → bulle).
        let _gasDiag = { raw: 0, parsed: 0, priced: 0, near: 0 };

        function parseGasStations(rawStations, routeCoords) {
            /* ⚠ LIGNE ÉCHANTILLONNÉE POUR LA PROJECTION, TRACÉ COMPLET POUR LA LONGUEUR.
               Voir ligneProximite() (js/00-noyau-calculs) : 6 189 ms → 595 ms sur un
               Courbevoie→Lyon, à résultat identique. La LONGUEUR, elle, se mesure sur le
               tracé complet — elle sert à borner distAlongRoute, pas à filtrer. */
            const routeLine    = turf.lineString(ligneProximite(routeCoords));
            const startPoint   = turf.point(routeCoords[0]);
            const routeTotalKm = turf.length(turf.lineString(routeCoords), { units: 'kilometers' });
            const MARGIN_KM    = 1.5; // tolérance en km avant le départ / après l'arrivée
            const results      = [];

            rawStations.forEach(s => {
                const coords = extractGasCoords(s);
                if (!coords) return;
                const [lng, lat] = coords;

                const pt      = turf.point([lng, lat]);
                const snapped = turf.nearestPointOnLine(routeLine, pt, { units: 'kilometers' });
                const distToRoute = snapped.properties.dist; // km
                // Buffer adaptatif : plus large sur trajets courts (densité urbaine)
                const maxDistToRoute = routeTotalKm < 30 ? 7 : 5; // 7km en ville, 5km sur route
                if (distToRoute > maxDistToRoute) return; // max 5km en ville, 4km sur route

                // Rejeter les stations trop loin derrière le départ ou après l'arrivée
                const loc = snapped.properties.location;
                if (loc < -MARGIN_KM || loc > routeTotalKm + MARGIN_KM) return;

                const sp95   = extractGasPrice(s, 'sp95');
                const gazole = extractGasPrice(s, 'gazole');
                const e10    = extractGasPrice(s, 'e10');
                const sp98   = extractGasPrice(s, 'sp98');
                const hasPrices = !!(sp95 || gazole || e10 || sp98);

                // Pour FR : rejeter si aucun prix (le flux FR a toujours des prix)
                // Pour BE/ES : garder même sans prix (Mapbox/OSM n'ont pas toujours les tarifs)
                if (!hasPrices && s._country === 'fr') return;
                if (!hasPrices && !s._country) return; // source inconnue sans prix = inutile

                // Distance sur le tracé depuis le départ (clampée à [0, routeTotalKm])
                const distAlongRoute = Math.max(0, Math.min(loc, routeTotalKm));

                results.push({
                    lng, lat,
                    name: s.nom || s.enseignedhek || s.name || s.adresse || 'Station',
                    addr: [s.adresse, s.ville ? ((s.cp || s.code_postal || '') + ' ' + s.ville).trim() : ''].filter(Boolean).join(', '),
                    sp95, gazole, e10, sp98,
                    hasPrices,
                    country: s._country || 'fr',
                    distToRoute: Math.round(distToRoute * 1000),
                    distAlongRoute,
                    // Horaires bruts conservés : le statut est recalculé à l'affichage
                    // pour rester juste même si le panneau reste ouvert longtemps.
                    horaires: s.horaires || null,
                    horaires_automate_24_24: s.horaires_automate_24_24 || null,
                });
            });

            _gasDiag.raw    = rawStations.length;
            _gasDiag.parsed = results.length;
            console.log(`[GasAPI] ${rawStations.length} brutes → ${results.length} valides après filtrage géo`);
            if (results.length < rawStations.length) {
                console.log(`[GasAPI] ${rawStations.length - results.length} écartées : hors corridor, hors trajet, ou sans prix exploitable`);
            }
            return results;
        }

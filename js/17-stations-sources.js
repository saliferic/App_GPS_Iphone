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
        let selectedFuelType = 'sp95';       // carburant affiché : 'sp95'|'gazole'|'e10'|'sp98'
        let _allGasStations = [];            // cache toutes les stations pour re-filtrer sans rappel API


        // ═══════════════════════════════════════════════════════════════
        // === DÉTECTION PAYS + ROUTEUR MULTI-SOURCE ===
        // ═══════════════════════════════════════════════════════════════

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
        async function fetchStationsBE(routeCoords) {
            const line       = turf.lineString(routeCoords);
            const totalKm    = turf.length(line, { units: 'kilometers' });
            const sampleCount = Math.max(1, Math.ceil(totalKm / 40));
            const allStations = {};

            // === Source 1 : Mapbox Search API — stations essence le long du trajet ===
            // Retourne les coordonnées et noms, pas les prix — mais CORS garanti
            const mapboxSearchPromises = [];
            for (let i = 0; i <= sampleCount; i++) {
                const km = Math.min(i * (totalKm / sampleCount), totalKm);
                const [lng, lat] = turf.along(line, km, { units: 'kilometers' }).geometry.coordinates;
                const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/gas_station.json?proximity=${lng.toFixed(5)},${lat.toFixed(5)}&types=poi&access_token=${MAPBOX_TOKEN}&limit=10&language=fr`;
                mapboxSearchPromises.push(
                    fetchResilient(url, {}, { timeoutMs: 8000, retries: 0 })
                        .then(r => r.json())
                        .then(data => {
                            (data?.features || []).forEach(f => {
                                const [fLng, fLat] = f.geometry.coordinates;
                                const id = `mb_${fLng.toFixed(5)}_${fLat.toFixed(5)}`;
                                if (!allStations[id]) allStations[id] = {
                                    _country: 'be',
                                    latitude:  String(fLat),
                                    longitude: String(fLng),
                                    nom:     f.text ?? f.place_name?.split(',')[0] ?? 'Station',
                                    adresse: f.place_name ?? '',
                                    ville:   f.context?.find(c => c.id?.startsWith('place'))?.text ?? '',
                                    cp:      f.context?.find(c => c.id?.startsWith('postcode'))?.text ?? '',
                                    prix: [],
                                    // Pas de prix via Mapbox — on essaiera Overpass
                                };
                            });
                        })
                        .catch(() => {})
                );
            }
            await Promise.all(mapboxSearchPromises);

            // === Source 2 : Overpass via POST (plus de chances de passer le CORS) ===
            // + carbu.com avec tous les headers navigateur
            const segments = buildRouteSegments(routeCoords);
            const overpassPromises = segments.map(async seg => {
                const bbox  = `${seg.minLat.toFixed(4)},${seg.minLng.toFixed(4)},${seg.maxLat.toFixed(4)},${seg.maxLng.toFixed(4)}`;
                const query = `[out:json][timeout:12];node["amenity"="fuel"](${bbox});out body;`;
                const overpassMirrors = [
                    'https://overpass.private.coffee/api/interpreter',
                    'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
                    'https://overpass.kumi.systems/api/interpreter',
                    'https://overpass.openstreetmap.ru/cgi/interpreter',
                ];
                for (const mirror of overpassMirrors) {
                    try {
                        const res = await fetch(mirror, {
                            method: 'POST',
                            body: 'data=' + encodeURIComponent(query),
                        });
                        if (!res.ok) continue;
                        const data = await res.json();
                        (data?.elements || []).forEach(node => {
                            const id = `osm_${node.id}`;
                            const tags = node.tags || {};
                            // Merges avec station Mapbox existante si même position ~
                            const existingKey = Object.keys(allStations).find(k => {
                                const s = allStations[k];
                                return Math.abs(parseFloat(s.latitude) - node.lat) < 0.001 &&
                                       Math.abs(parseFloat(s.longitude) - node.lon) < 0.001;
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
                                    _country: 'be',
                                    latitude:  String(node.lat),
                                    longitude: String(node.lon),
                                    nom:     tags.name ?? tags.brand ?? tags.operator ?? 'Station',
                                    adresse: tags['addr:street'] ? `${tags['addr:housenumber']??''} ${tags['addr:street']}`.trim() : '',
                                    ville:   tags['addr:city'] ?? tags['addr:town'] ?? '',
                                    cp:      tags['addr:postcode'] ?? '',
                                    prix:    [],
                                    ...prices,
                                };
                            }
                        });
                        break; // premier miroir qui répond → arrêt
                    } catch (e) { if (DEBUG) console.warn("[fetchStationsBE] exception ignorée :", e); }
                }
            });
            await Promise.all(overpassPromises);

            const stations = Object.values(allStations);
            const withPrices = stations.filter(s => s._sp95 || s._gazole || s._sp98 || s._e10);
            console.log(`[GasAPI/BE] ${stations.length} stations (${withPrices.length} avec prix)`);
            return stations; // on retourne TOUTES les stations même sans prix pour la carte
        }

        // ── ESPAGNE ──
        // API officielle MINETUR — stations dans un rayon autour d'un point
        async function fetchStationsES(routeCoords) {
            const segments = buildRouteSegments(routeCoords);
            const allStations = {};
            await Promise.all(segments.map(async seg => {
                const cLat = ((seg.minLat + seg.maxLat) / 2).toFixed(6).replace('.', ',');
                const cLng = ((seg.minLng + seg.maxLng) / 2).toFixed(6).replace('.', ',');
                const rad  = Math.min(30, Math.ceil(turf.distance(
                    turf.point([seg.minLng, seg.minLat]),
                    turf.point([seg.maxLng, seg.maxLat]),
                    { units: 'kilometers' }
                ) / 2) + 5);
                const url = `https://sedeaplicaciones.minetur.gob.es/ServiciosRESTCarburantes/PreciosCarburantes/EstacionesTerrestresHist/Consulta/0/0/${cLat}/${cLng}/${rad}/km`;
                try {
                    const res = await fetchResilient(url, {}, { timeoutMs: 14000, retries: 1 });
                    if (!res.ok) return;
                    const data = await res.json();
                    const parseES = v => { if (!v) return null; const n = parseFloat(String(v).replace(',','.')); return n > 0.1 ? n : null; };
                    (data?.ListaEESSPrecio || []).forEach(s => {
                        const id = String(s.IDEESS ?? `${s.Latitud},${s['Longitud (WGS84)']}`);
                        if (!allStations[id]) allStations[id] = {
                            _country: 'es',
                            latitude:  String(s.Latitud ?? '').replace(',', '.'),
                            longitude: String(s['Longitud (WGS84)'] ?? '').replace(',', '.'),
                            nom:     s['Rótulo'] ?? s.Rotulo ?? 'Station',
                            adresse: s.Dirección ?? s.Direccion ?? '',
                            ville:   s.Municipio ?? '',
                            cp:      s['C.P.'] ?? '',
                            prix: [],
                            _sp95:   parseES(s['Precio Gasolina 95 E5']),
                            _gazole: parseES(s['Precio Gasoil A']),
                            _sp98:   parseES(s['Precio Gasolina 98 E5']),
                            _e10:    parseES(s['Precio Gasolina 95 E10']),
                        };
                    });
                } catch(e) { console.warn('[GasAPI/ES]', e.message); }
            }));
            const stations = Object.values(allStations);
            console.log(`[GasAPI/ES] ${stations.length} stations`);
            return stations;
        }

        // ── ROUTEUR PRINCIPAL ──
        async function fetchGasStationsAlongRoute(routeCoords) {
            const countries = detectCountriesOnRoute(routeCoords);
            console.log(`[GasAPI] Pays détectés: ${countries.join(', ')}`);
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
            const routeLine    = turf.lineString(routeCoords);
            const startPoint   = turf.point(routeCoords[0]);
            const routeTotalKm = turf.length(routeLine, { units: 'kilometers' });
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

        // === DÉTECTION PARIS INTRA-MUROS (polygone simplifié du périphérique) ===
        // Depuis août 2021, la quasi-totalité des rues de Paris sont limitées à 30 km/h,
        // seuls quelques grands axes (Maréchaux, Champs-Élysées, etc.) restent à 50 km/h.
        // Le périphérique lui-même est à 50 km/h depuis octobre 2024.
        // Tracé recalé sur le boulevard périphérique (porte par porte), avec les deux bois
        // qui font administrativement partie de Paris. L'ancien polygone était trop large :
        // il englobait Neuilly, Levallois et une partie de Courbevoie, qui sont à 50 km/h et
        // se retrouvaient donc affichés à 30.
        const PARIS_POLYGON = turf.polygon([[
            [2.2578, 48.8378], [2.2400, 48.8395], [2.2285, 48.8470], [2.2258, 48.8580], // Bois de Boulogne (ouest)
            [2.2295, 48.8700], [2.2440, 48.8785], [2.2620, 48.8792],
            [2.2745, 48.8760], [2.2825, 48.8785], [2.2930, 48.8865],                     // Pte Dauphine → Pte Maillot → Champerret
            [2.3070, 48.8920], [2.3130, 48.8955], [2.3330, 48.8985], [2.3450, 48.9005], // Pte de Clichy → Clignancourt
            [2.3595, 48.8995], [2.3720, 48.8975], [2.3880, 48.8985], [2.3935, 48.8905], // La Chapelle → La Villette → Pantin
            [2.4090, 48.8770], [2.4110, 48.8680], [2.4130, 48.8560], [2.4155, 48.8470], // Les Lilas → Bagnolet → Vincennes
            [2.4350, 48.8455], [2.4560, 48.8400], [2.4640, 48.8300], [2.4480, 48.8225], // Bois de Vincennes (est)
            [2.4250, 48.8215], [2.4120, 48.8270], [2.4030, 48.8320], [2.3900, 48.8270], // Pte de Charenton → Bercy
            [2.3690, 48.8195], [2.3595, 48.8185], [2.3255, 48.8185], [2.3050, 48.8265], // Pte d'Ivry → Italie → Orléans → Vanves
            [2.2875, 48.8320], [2.2755, 48.8355], [2.2578, 48.8378]                     // Pte de Versailles → Sèvres → St-Cloud
        ]]);

        function isInsideParis(lng, lat) {
            try { return turf.booleanPointInPolygon(turf.point([lng, lat]), PARIS_POLYGON); }
            catch (e) { return false; }
        }

        // Déduit la limite de vitesse à partir de la classification de la route (tag "highway")
        // quand le tag "maxspeed" n'est pas renseigné. Basé sur le code de la route français.
        // Le paramètre `inParis` applique la règle "ville 30" de Paris intra-muros.
        function inferSpeedFromHighwayTag(highway, isUrban, inParis) {
            // Paris intra-muros : 30 km/h par défaut sauf grands axes (primary+) à 50,
            // trunk (périphérique) à 50, motorway à 130
            if (inParis) {
                const parisLimits = {
                    'motorway': 130, 'motorway_link': 110,
                    'trunk': 50, 'trunk_link': 50,      // périphérique = 50 depuis oct. 2024
                    'primary': 50, 'primary_link': 50,    // grands axes Maréchaux, Champs-Élysées...
                    'secondary': 30, 'secondary_link': 30,
                    'tertiary': 30, 'tertiary_link': 30,
                    'unclassified': 30,
                    'residential': 30,
                    'living_street': 20,
                    'service': 30
                };
                return parisLimits[highway] || 30;
            }
            const limits = {
                'motorway': 130, 'motorway_link': 110,
                'trunk': 110, 'trunk_link': 70,
                'primary': isUrban ? 50 : 80,
                'primary_link': isUrban ? 50 : 80,
                'secondary': isUrban ? 50 : 80,
                'secondary_link': isUrban ? 50 : 80,
                'tertiary': isUrban ? 50 : 80,
                'tertiary_link': isUrban ? 50 : 80,
                'unclassified': isUrban ? 50 : 80,
                'residential': 30,
                'living_street': 20,
                'service': 30
            };
            return limits[highway] || null;
        }

        // Interroge Overpass pour la route la plus proche de (lat,lng).
        // Stratégie en 3 niveaux :
        //   1. Si un tag "maxspeed" explicite est trouvé → on l'utilise (le plus fiable).
        //   2. Sinon, on déduit la limite à partir du tag "highway" (classification de la route)
        //      et du contexte (urbain/rural + Paris intra-muros).
        //   3. Si on est dans Paris et qu'aucune info n'est disponible → 30 km/h (règle "ville 30").
        async function fetchSpeedLimitNearby(lng, lat) {
            if (!navigator.onLine) return null;
            if (isFetchingSpeedLimit) return;
            isFetchingSpeedLimit = true;
            const inParis = isInsideParis(lng, lat);
            try {
                // Rayon élargi à 50m pour capter les grands axes (trunk, primary) qui peuvent
                // être légèrement décalés du centre GPS, surtout sur un pont ou une voie rapide.
                const query = `[out:json][timeout:10];way(around:50,${lat},${lng})["highway"~"^(motorway|motorway_link|trunk|trunk_link|primary|primary_link|secondary|secondary_link|tertiary|tertiary_link|unclassified|residential|living_street|service)$"];out tags 8;`;
                const res = await fetchResilient('https://overpass-api.de/api/interpreter', {
                    method: 'POST',
                    body: 'data=' + encodeURIComponent(query)
                }, { timeoutMs: 8000, retries: 0 });
                const data = await res.json();
                const elements = data.elements || [];

                if (elements.length === 0) {
                    if (inParis) { currentSpeedLimitKmh = 30; _overpassSource = 'fallback'; }
                    _speedLimitDebug = { tags: null, highway: null, note: 'aucun tronçon dans 50 m', ts: Date.now() };
                    return;
                }

                // Priorité 1 : chercher maxspeed sur le segment de PLUS HAUT rang (pas juste le premier)
                // → un trunk à 70 ne doit pas être écrasé par un residential voisin sans maxspeed
                const priority = ['motorway', 'motorway_link', 'trunk', 'trunk_link', 'primary', 'primary_link', 'secondary', 'secondary_link', 'tertiary', 'tertiary_link', 'unclassified', 'residential', 'living_street', 'service'];
                elements.sort((a, b) => {
                    const ia = priority.indexOf(a.tags?.highway);
                    const ib = priority.indexOf(b.tags?.highway);
                    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
                });

                // Priorité 1 : le maxspeed du segment de PLUS HAUT RANG uniquement.
                // On ne descend PAS chercher le maxspeed d'une voie de rang inférieur : dans un
                // rayon de 50 m en ville dense, on capte des rues résidentielles à 30 qui n'ont
                // rien à voir avec l'axe réellement emprunté (pont, voie rapide, boulevard).
                const best = elements[0];
                _speedLimitDebug = {
                    tags: best?.tags || null,
                    highway: best?.tags?.highway || null,
                    candidates: elements.length,
                    ts: Date.now()
                };
                if (best?.tags?.maxspeed) {
                    const parsed = parseMaxspeedTag(best.tags.maxspeed);
                    if (parsed !== null) { currentSpeedLimitKmh = parsed; _overpassSource = 'overpass-tag'; return; }
                }
                // Si le segment de tête n'a pas de maxspeed, on accepte celui d'un segment de
                // MÊME classe (même rang) avant de retomber sur l'inférence.
                const sameClass = elements.find(e => e.tags?.maxspeed && e.tags.highway === best?.tags?.highway);
                if (sameClass) {
                    const parsed = parseMaxspeedTag(sameClass.tags.maxspeed);
                    if (parsed !== null) {
                        currentSpeedLimitKmh = parsed;
                        _overpassSource = 'overpass-same-class';
                        _speedLimitDebug.sameClassTags = sameClass.tags;
                        return;
                    }
                }

                // Priorité 2 : inférer depuis la classification du segment de plus haut rang
                if (best?.tags) {
                    const tags = best.tags;
                    // isUrban : ne pas utiliser lit+sidewalk comme critère urbain sur trunk/primary
                    // (un pont éclairé avec trottoir n'est pas une rue résidentielle à 50)
                    const isHighCapacity = ['motorway','motorway_link','trunk','trunk_link','primary','primary_link'].includes(tags.highway);
                    const isUrban = !isHighCapacity && (
                        inParis ||
                        tags['maxspeed:type'] === 'FR:urban' ||
                        tags['source:maxspeed'] === 'FR:urban' ||
                        tags['zone:traffic'] === 'urban' ||
                        (tags['lit'] === 'yes' && tags['sidewalk'] && tags['sidewalk'] !== 'no')
                    );
                    const inferred = inferSpeedFromHighwayTag(tags.highway, isUrban, inParis);
                    if (inferred !== null) {
                        currentSpeedLimitKmh = inferred;
                        _overpassSource = 'overpass-inference';
                        _speedLimitDebug.isUrban = isUrban;
                        _speedLimitDebug.inferred = inferred;
                    }
                }
            } catch (e) {
                console.error("Erreur récupération limite de vitesse :", e);
                _speedLimitDebug = { tags: null, highway: null, note: 'échec requête Overpass', ts: Date.now() };
                if (inParis && !currentSpeedLimitKmh) { currentSpeedLimitKmh = 30; _overpassSource = 'fallback'; }
            } finally {
                isFetchingSpeedLimit = false;
            }
        }

        // Déclenche (si nécessaire) une mise à jour de la limite de vitesse.
        // Mapbox annotations en priorité — Overpass uniquement si annotations absentes.
        function maybeRefreshSpeedLimit(lng, lat) {
            // Si Mapbox annotations couvre ce tronçon → pas besoin d'Overpass
            if (_routeMaxspeedAnnotations.length > 0) {
                const _d = getRouteDistanceAlongKm(lng, lat);
                if (_d !== null && getMapboxSpeedLimitAtDist(_d) !== null) return;
            }
            // Fallback Overpass uniquement si annotations absentes ou tronçon inconnu
            const now = Date.now();
            const currentSpeed = (drivers.length > 0) ? (drivers[0].actualSpeed || 0) : 0;
            const refetchMeters = currentSpeed > 70 ? 80 : SPEED_LIMIT_REFETCH_METERS;
            const refetchMs     = currentSpeed > 70 ? 6000 : SPEED_LIMIT_REFETCH_MS;
            const movedEnough = !lastSpeedLimitCoords ||
                turf.distance(turf.point(lastSpeedLimitCoords), turf.point([lng, lat]), { units: 'kilometers' }) * 1000 > refetchMeters;
            if (movedEnough && (now - lastSpeedLimitFetchTime > refetchMs)) {
                lastSpeedLimitFetchTime = now;
                lastSpeedLimitCoords = [lng, lat];
                fetchSpeedLimitNearby(lng, lat);
            }
        }

        /* === SONDE MAXSPEED LOCALE (trajet libre) ===
           Hors itinéraire calculé, la source la plus fiable — les annotations `maxspeed` de
           Mapbox Directions — n'existe pas, faute de route à annoter. On en fabrique donc une
           minuscule : un itinéraire fictif d'environ 600 m droit devant, dans l'axe du véhicule,
           demandé uniquement pour ses annotations. Ce tracé n'est jamais affiché, ni utilisé
           pour le guidage, ni pour le calcul de points : c'est une sonde, pas un itinéraire. */
        const PROBE_LENGTH_KM = 0.6;        // longueur du corridor sondé devant le véhicule
        const PROBE_REFRESH_METERS = 300;   // on re-sonde après cette distance parcourue...
        const PROBE_REFRESH_MS = 20000;     // ...et jamais plus souvent que ça
        const PROBE_CORRIDOR_M = 40;        // au-delà, on a quitté le corridor sondé
        const PROBE_TAIL_KM = 0.15;         // marge de fin : on re-sonde avant d'atteindre le bout
        const PROBE_MIN_SPEED_KMH = 5;      // à l'arrêt, la sonde en place reste valable

        let _probeAnnotations = [];  // [{distKm, speed}] le long de _probeLine
        let _probeLine = null;       // turf lineString du corridor sondé
        let _probeLengthKm = 0;
        let _probeFetchTime = 0;
        let _probeCoords = null;
        let _probeFetching = false;

        function resetMaxspeedProbe() {
            _probeAnnotations = []; _probeLine = null; _probeLengthKm = 0;
            _probeFetchTime = 0; _probeCoords = null;
        }

        // Projection de la position sur le corridor sondé. Retourne la distance cumulée en km
        // depuis le début de la sonde, ou null si on s'en est écarté (changement de rue, virage).
        function _probeProjectionKm(lng, lat) {
            if (!_probeLine) return null;
            try {
                const snapped = turf.nearestPointOnLine(_probeLine, turf.point([lng, lat]), { units: 'kilometers' });
                if (snapped.properties.dist * 1000 > PROBE_CORRIDOR_M) return null;
                return snapped.properties.location;
            } catch (e) { return null; }
        }

        function getProbeSpeedLimitAt(lng, lat) {
            if (!_probeLine || !_probeAnnotations.length) return null;
            const distKm = _probeProjectionKm(lng, lat);
            if (distKm === null) return null;
            let lo = 0, hi = _probeAnnotations.length - 1, idx = 0;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (_probeAnnotations[mid].distKm <= distKm) { idx = mid; lo = mid + 1; }
                else { hi = mid - 1; }
            }
            return _probeAnnotations[idx].speed;   // null si le tronçon n'est pas annoté
        }

        async function fetchLocalMaxspeedProbe(lng, lat, bearingDeg) {
            if (!navigator.onLine || _probeFetching) return;
            _probeFetching = true;
            try {
                const ahead = turf.destination(turf.point([lng, lat]), PROBE_LENGTH_KM, bearingDeg, { units: 'kilometers' });
                const [alng, alat] = ahead.geometry.coordinates;
                const coordStr = `${lng.toFixed(6)},${lat.toFixed(6)};${alng.toFixed(6)},${alat.toFixed(6)}`;
                // Même forme d'appel que l'itinéraire principal (profil et annotations identiques),
                // donc mêmes données de limitation — mais sans steps ni alternatives : la réponse
                // est légère et ne sert qu'à lire les vitesses.
                const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordStr}?geometries=geojson&overview=full&alternatives=false&steps=false&annotations=maxspeed,distance&access_token=${MAPBOX_TOKEN}`;
                const res = await fetchResilient(url, {}, { timeoutMs: 6000, retries: 0 });
                const data = await res.json();
                const route = data && data.routes && data.routes[0];
                if (!route || !route.geometry || !route.legs) return;

                const coords = route.geometry.coordinates;
                if (!Array.isArray(coords) || coords.length < 2) return;

                const table = [];
                let cumDist = 0, coordIdx = 0;
                route.legs.forEach(leg => {
                    if (!leg.annotation || !leg.annotation.maxspeed) return;
                    const maxspeeds = leg.annotation.maxspeed;
                    const distances = leg.annotation.distance || [];
                    maxspeeds.forEach((ms, i) => {
                        let dKm;
                        if (typeof distances[i] === 'number' && isFinite(distances[i])) {
                            dKm = distances[i] / 1000;
                        } else {
                            const a = coords[coordIdx], b = coords[coordIdx + 1];
                            dKm = (a && b) ? turf.distance(turf.point(a), turf.point(b), { units: 'kilometers' }) : 0;
                        }
                        let kmh = null;
                        if (ms && !ms.unknown && typeof ms.speed === 'number') {
                            kmh = ms.unit === 'mph' ? ms.speed * 1.60934 : ms.speed;
                        }
                        table.push({ distKm: cumDist, speed: kmh });
                        cumDist += dKm;
                        coordIdx++;
                    });
                });

                // Une table dont le cumul est resté nul est inexploitable : on préfère ne rien
                // avoir et laisser Overpass parler plutôt qu'appliquer une vitesse arbitraire.
                if (table.length < 1 || (table.length > 1 && table[table.length - 1].distKm <= 0)) return;

                _probeLine = turf.lineString(coords);
                _probeLengthKm = turf.length(_probeLine, { units: 'kilometers' });
                _probeAnnotations = table;
                if (DEBUG) console.log(`[MaxspeedProbe] ${table.length} segments sur ${_probeLengthKm.toFixed(2)} km`);
            } catch (e) {
                if (DEBUG) console.warn('[MaxspeedProbe] échec :', e);
            } finally {
                _probeFetching = false;
            }
        }

        // Décide s'il faut relancer une sonde. Trois déclencheurs : plus de corridor valable,
        // approche de son extrémité, ou distance parcourue suffisante depuis la dernière sonde.
        function maybeRefreshLocalMaxspeedProbe(lng, lat) {
            // Si l'itinéraire courant annote déjà ce point, la sonde est inutile.
            if (_routeMaxspeedAnnotations.length > 0) {
                const _d = getRouteDistanceAlongKm(lng, lat);
                if (_d !== null && getMapboxSpeedLimitAtDist(_d) !== null) return;
            }
            if (!navigator.onLine) return;
            const speed = (drivers.length > 0) ? (drivers[0].actualSpeed || 0) : 0;
            if (speed < PROBE_MIN_SPEED_KMH) return;

            const now = Date.now();
            if (now - _probeFetchTime < PROBE_REFRESH_MS) return;

            const loc = _probeProjectionKm(lng, lat);
            const outOfCorridor = (loc === null);
            const nearEnd = (loc !== null) && (loc > _probeLengthKm - PROBE_TAIL_KM);
            const movedEnough = !_probeCoords ||
                turf.distance(turf.point(_probeCoords), turf.point([lng, lat]), { units: 'kilometers' }) * 1000 > PROBE_REFRESH_METERS;
            if (!outOfCorridor && !nearEnd && !movedEnough) return;

            _probeFetchTime = now;
            _probeCoords = [lng, lat];
            fetchLocalMaxspeedProbe(lng, lat, lastKnownBearing || 0);
        }

        // Met à jour le badge de limite de vitesse (au-dessus du badge de vitesse actuelle).
        // NB : l'élément historique 'nav-speed-limit-value' n'existe plus dans le DOM ;
        // on retombe sur 'speed-limit-value', qui est la pastille réellement affichée.
        function updateSpeedLimitBadge(limitKmh) {
            const el = DOM.navSpeedLimitValue || document.getElementById('nav-speed-limit-value')
                    || DOM.speedLimitValue || document.getElementById('speed-limit-value');
            if (el) el.innerText = Math.round(limitKmh);
        }

        /* === DIAGNOSTIC : d'où vient la limite affichée ? ===
           Appui long (600 ms) sur la pastille. Indispensable pour trancher sur le terrain
           entre un panneau réellement cartographié, une déduction depuis la classe de la
           route, et un simple repli par défaut — trois cas qui affichaient le même chiffre. */
        const SPEED_SOURCE_LABELS = {
            'mapbox':              'Annotation Mapbox (itinéraire) — fiable',
            'mapbox-probe':        'Sonde Mapbox locale (trajet libre) — fiable',
            'overpass-tag':        'Tag maxspeed OpenStreetMap — fiable',
            'overpass-same-class': 'Tag maxspeed d\'un tronçon de même classe — moyen',
            'overpass-inference':  'Déduit de la classe de route — INCERTAIN',
            'steps':               'Déduit des steps Mapbox (vitesse moyenne) — INCERTAIN',
            'fallback':            'Repli par défaut, aucune donnée — INCERTAIN'
        };

        function showSpeedLimitDebug() {
            const box = document.getElementById('speed-limit-debug');
            if (!box) return;
            const valEl = document.getElementById('speed-limit-value');
            const shown = valEl ? valEl.textContent : '—';
            const dbg = _speedLimitDebug;
            const probeLoc = (lastRealCoords && _probeLine)
                ? _probeProjectionKm(lastRealCoords[0], lastRealCoords[1]) : null;
            const ageS = (dbg && dbg.ts) ? Math.round((Date.now() - dbg.ts) / 1000) : null;
            const rows = [
                ['Valeur affichée', shown + ' km/h'],
                ['Source', SPEED_SOURCE_LABELS[_speedLimitSource] || 'aucune'],
                ['Pénalités', isSpeedLimitUncertain() ? 'désactivées (limite incertaine)' : 'actives'],
                ['Annotations Mapbox', _routeMaxspeedAnnotations.length + ' segments'],
                ['Tracé actif', fullRouteLine ? 'oui' : 'non (trajet libre)'],
                ['Sonde locale', _probeAnnotations.length
                    ? (_probeAnnotations.length + ' segments / ' + _probeLengthKm.toFixed(2) + ' km'
                       + (probeLoc !== null ? ' — à ' + (probeLoc * 1000).toFixed(0) + ' m du début' : ' — hors corridor'))
                    : 'aucune'],
                ['Overpass', dbg ? (ageS + ' s — ' + (dbg.candidates || 0) + ' tronçon(s)') : 'aucune réponse'],
                ['Tronçon retenu', (dbg && dbg.highway) ? dbg.highway : '—']
            ];
            if (dbg && typeof dbg.isUrban === 'boolean') rows.push(['Contexte urbain', dbg.isUrban ? 'oui → 50' : 'non']);
            if (dbg && dbg.note) rows.push(['Note', dbg.note]);

            let html = '<h4>Origine de la limite</h4>';
            rows.forEach(([k, v]) => {
                html += `<div class="sld-row"><span class="sld-key">${k}</span><span class="sld-val">${v}</span></div>`;
            });
            if (dbg && dbg.tags) {
                const tagStr = Object.entries(dbg.tags)
                    .map(([k, v]) => k + ' = ' + v).join('\n');
                html += `<div class="sld-tags">${tagStr}</div>`;
            }
            if (dbg && dbg.sameClassTags) {
                html += `<div class="sld-tags">même classe :\n${Object.entries(dbg.sameClassTags).map(([k, v]) => k + ' = ' + v).join('\n')}</div>`;
            }
            html += '<button class="sld-close" onclick="hideSpeedLimitDebug()">FERMER</button>';
            box.innerHTML = html;
            box.classList.add('visible');
        }

        function hideSpeedLimitDebug() {
            const box = document.getElementById('speed-limit-debug');
            if (box) box.classList.remove('visible');
        }

        (function initSpeedLimitDebugTrigger() {
            const badge = document.getElementById('speed-limit-badge');
            if (!badge) return;
            let timer = null;
            const start = () => {
                clearTimeout(timer);
                timer = setTimeout(showSpeedLimitDebug, 600);
            };
            const cancel = () => clearTimeout(timer);
            badge.addEventListener('touchstart', start, { passive: true });
            badge.addEventListener('touchend', cancel, { passive: true });
            badge.addEventListener('touchmove', cancel, { passive: true });
            badge.addEventListener('touchcancel', cancel, { passive: true });
            badge.addEventListener('mousedown', start);
            badge.addEventListener('mouseup', cancel);
            badge.addEventListener('mouseleave', cancel);
            // Le menu contextuel Android s'ouvrirait par-dessus le diagnostic.
            badge.addEventListener('contextmenu', e => e.preventDefault());
        })();

        // ═══════════════════════════════════════════════════════════════════
        // === HOTBOX RADIALE (appui long sur la carte, façon Maya 3D) ===
        // ═══════════════════════════════════════════════════════════════════
        // Geste : maintenir le doigt sur la carte → le cercle s'ouvre AU POINT DE
        // PRESSION → glisser vers une entrée → relâcher pour valider. Un relâchement
        // immédiat (sans glisser) laisse le menu ouvert pour un usage au tap.
        //
        // Les entrées ne réimplémentent RIEN : elles appellent exactement les mêmes
        // fonctions que les boutons flottants, qui restent dans le DOM (masqués par
        // body.hotbox-on). Toute la logique d'état existante continue donc de tourner.

        const HOTBOX_PRESS_MS   = 400;  // durée d'appui avant ouverture
        const HOTBOX_MOVE_TOL   = 12;   // px de tolérance avant d'annuler (= un pan de carte)
        const HOTBOX_STICKY_MS  = 260;  // relâchement plus rapide que ça → menu épinglé

        let hotboxEnabled = localStorage.getItem('gps_hotbox') !== 'off';

        let _hbOpen = false, _hbSticky = false, _hbHover = -1;
        let _hbItems = [], _hbNodes = [];
        /* Décalage vertical de chaque entrée sur le cercle, retenu à l'ouverture : il dit
           si le libellé doit passer au-dessus du noyau (entrée dans la moitié basse). */
        let _hbItemDY = [];
        let _hbCenter = { x: 0, y: 0 }, _hbRadius = 100, _hbDeadzone = 44, _hbStartAngle = -90;
        let _hbPressTimer = null, _hbPressPt = null, _hbPointerId = null, _hbOpenedAt = 0;

        /* Point du doigt à l'ouverture, tant qu'il n'a pas bougé. Voir _hbOnMove :
           il neutralise un survol que l'utilisateur n'a jamais visé. */
        let _hbMoveGate = null;

        /* Anneau de progression de l'appui long (#hb-press).
           Il rend visibles les HOTBOX_PRESS_MS d'attente, sans quoi rien ne distingue
           « je maintiens, ça vient » de « je maintiens, il ne se passe rien ». */
        function _hbShowPress(x, y) {
            const el = document.getElementById('hb-press');
            if (!el) return;
            el.style.setProperty('--hb-px', x + 'px');
            el.style.setProperty('--hb-py', y + 'px');
            // Retrait + reflow forcé avant remise : sans lecture de layout intercalée, le
            // navigateur regroupe les deux changements de classe et l'animation ne
            // redémarre pas — le second appui long resterait sans anneau.
            el.classList.remove('on');
            void el.offsetWidth;
            el.classList.add('on');
        }

        function _hbHidePress() {
            document.getElementById('hb-press')?.classList.remove('on');
        }

        /* Retour haptique. Les durées sont volontairement au-dessus de 20 ms :
           en dessous, la plupart des moteurs vibrants n'ont pas le temps de lancer
           puis d'arrêter la masse, et l'impulsion passe inaperçue — c'est ce qui
           rendait l'ouverture du cercle silencieuse au toucher malgré un appel bien
           émis. L'ouverture utilise un MOTIF en deux temps (vibration, pause, seconde
           vibration plus longue) : le déploiement du cercle se sent alors comme un
           « déclic », nettement plus lisible qu'une impulsion unique.
           ⚠ `navigator.vibrate` n'existe pas sur iOS/Safari, quel que soit le réglage :
           aucun contournement fiable côté web, l'appel y est simplement sans effet. */
        const HB_HAPTIC_OPEN   = [18, 40, 32];  // ouverture du cercle
        /* 22 ms et non 12 : sous le seuil des 20 ms rappelé ci-dessus, le survol ne se
           sentait tout simplement pas — seuls l'ouverture et la validation étaient
           perceptibles, et le glissement d'une entrée à l'autre se faisait à l'aveugle.
           Il reste volontairement bien en dessous de HB_HAPTIC_PICK : il se déclenche à
           CHAQUE entrée traversée, une impulsion aussi franche que la validation
           transformerait la traversée du cercle en salve. */
        const HB_HAPTIC_HOVER  = 22;            // survol d'une entrée
        const HB_HAPTIC_PICK   = 45;            // validation d'un choix
        /* Fermeture SANS choix. Plus courte que la validation pour ne pas se confondre
           avec elle : le doigt doit pouvoir distinguer « j'ai lancé quelque chose » de
           « j'ai refermé sans rien faire » sans regarder l'écran. */
        const HB_HAPTIC_CLOSE  = 25;

        function _hbVibrate(pattern) {
            tenterSansBruit(() => { if (navigator.vibrate) navigator.vibrate(pattern); }, 'vibrate');
        }

        // Course avec destination : arrêt intermédiaire et partage live n'ont pas de
        // sens en trajet libre — même règle que l'affichage des boutons dans startCourse().
        function _hbHasDestination() { return isCourseStarted && !isFreeCourseActive(); }

        /* Aperçu de trajet ouvert. Testé sur l'overlay et non sur une variable d'état :
           c'est la même source de vérité que _gasScanBlocked(), et elle reste juste quelle
           que soit la porte par laquelle le modal a été ouvert ou refermé. */
        function _hbTripPreviewOpen() {
            return !!document.getElementById('trip-modal-overlay')?.classList.contains('open');
        }

        // Catalogue complet ; `when` filtre à chaque ouverture, `on` colore l'entrée active.
        function _hotboxCatalog() {
            return [
                /* ⚠ CES DEUX ENTRÉES SE PARTAGENT LA MÊME PLACE — la première du catalogue,
                   donc le HAUT du cercle (startAngle -90), l'emplacement le plus lisible.
                   Leurs `when` sont exclusifs : une seule survit au filtrage, et c'est elle
                   qui occupe le sommet. Ne pas les séparer dans la liste, l'une passerait
                   sur le côté du cercle selon l'autre.

                   Pendant l'aperçu de trajet, la loupe n'aurait rien à ouvrir : la
                   destination est déjà saisie et le modal a ses propres champs Départ /
                   Arrivée. La question à cet instant est « je pars ou j'annule ? », et la
                   croix du modal est en haut à droite de l'écran — hors de portée du pouce
                   qui vient justement de faire un appui long au centre de la carte. */
                /* ❌ et non un ✕ nu : le NOYAU du cercle porte déjà un ✕ fin, qui signifie
                   « refermer le menu ». Deux croix de même dessin, l'une au centre et
                   l'autre au sommet, pour deux actions dont l'une est bien plus lourde de
                   conséquence — et le noyau reprend l'icône de l'entrée survolée EN GRAND,
                   ce qui les aurait rendues strictement identiques au moment de viser. */
                { id: 'canceltrip', icon: '❌', label: 'Annuler le trajet',
                  when: _hbTripPreviewOpen,
                  act:  () => closeTripModal(true) },
                /* Plus de garde `when` en dehors de ce cas — à l'arrêt comme en roulant, la
                   loupe est le seul chemin vers une destination depuis la carte, le panneau
                   Itinéraire arrivant désormais escamoté. */
                { id: 'search', icon: '🔍',
                  label: () => isCourseStarted ? 'Destination' : 'Rechercher une adresse',
                  when: () => !_hbTripPreviewOpen(),
                  act:  () => openSearchFromHotbox() },
                { id: 'stop', icon: '📍', label: 'Ajouter un arrêt',
                  when: _hbHasDestination,
                  on:   () => pickingMode === 'nav-pin-stop',
                  act:  () => toggleNavPinStop() },
                { id: 'live', icon: '📡', label: 'Partage live',
                  when: _hbHasDestination,
                  on:   () => document.getElementById('nav-btn-liveshare')?.classList.contains('sharing'),
                  act:  () => toggleLiveShare() },
                { id: 'mute', icon: () => voiceGuidanceEnabled ? '🔊' : '🔇',
                  label: () => voiceGuidanceEnabled ? 'Couper le son' : 'Rétablir le son',
                  // Retiré en TRAJET LIBRE : sans itinéraire il n'y a aucune instruction
                  // de guidage à couper, le bouton n'agirait sur rien d'audible.
                  when: () => isCourseStarted && !isFreeCourseActive(),
                  on:   () => !voiceGuidanceEnabled,
                  act:  () => toggleMuteFromNav() },
                /* ⚠ ENTRÉE « RECENTRER » VOLONTAIREMENT ABSENTE — ne pas la rétablir.
                   `recenterMap()` et son bouton autonome `#recenter-btn` restent en place :
                   ce dernier apparaît DÉJÀ tout seul sur le bord droit dès que la carte
                   est déplacée, c'est-à-dire exactement quand la fonction devient utile.
                   La reprendre dans le cercle ferait doublon et occuperait une place
                   permanente pour un besoin, lui, occasionnel. */
                { id: '3d', label: () => map3DActive ? 'Vue 2D' : 'Vue 3D',
                  html: () => '<span class="hb-glyph">' + (map3DActive ? '2D' : '3D') + '</span>',
                  on:   () => map3DActive,
                  act:  () => toggle3DMode() },
                { id: 'gasscan',
                  // Picto et libellé suivent la configuration véhicule : une borne
                  // pour un électrique, une pompe sinon. L'hybride garde la pompe
                  // mais annonce les deux réseaux, puisqu'il les cherche tous les deux.
                  icon:  () => _scanVehicleMode() === 'ev' ? '🔌' : '⛽',
                  label: () => _scanVehicleMode() === 'ev'   ? 'Bornes autour de moi'
                             : _scanVehicleMode() === 'both' ? 'Stations et bornes autour de moi'
                             : 'Stations autour de moi',
                  // Retirée du cercle pendant l'aperçu de trajet : les stations y sont
                  // déjà scannées et affichées par le panneau du modal.
                  when: () => !_gasScanBlocked(),
                  on:   () => document.getElementById('gas-scan-sheet')?.classList.contains('open'),
                  act:  () => openGasScan() },
                { id: 'traffic', icon: '🚦', label: 'Trafic',
                  on:   () => isTrafficVisible,
                  act:  () => toggleTraffic() },
                { id: 'theme', label: () => isDarkMode ? 'Mode jour' : 'Mode nuit',
                  icon: () => isDarkMode ? '☀️' : '🌙',
                  act:  () => toggleMapTheme() }
            ];
        }

        function _hbResolve(v) { return (typeof v === 'function') ? v() : v; }

        /* Ouvre le cercle. Sans argument `items`, c'est le menu général de la carte ;
           avec, c'est un menu contextuel (choix sur une station…) qui réutilise
           exactement le même geste, la même zone morte et le même retour haptique.
           opts.startAngle : position de la première entrée, en degrés, 0 = à droite.
             Le défaut -90 (en haut) convient à une roue pleine ; un choix binaire
             est bien plus lisible à l'horizontale, d'où -180 pour poser les deux
             bulles à gauche et à droite.
           opts.title : intitulé affiché au-dessus du cercle. */
        function openHotbox(x, y, items, opts = {}) {
            if (_hbOpen) return;
            const box  = document.getElementById('hotbox');
            const ring = document.getElementById('hotbox-ring');
            if (!box || !ring) return;

            _hbItems = (items || _hotboxCatalog()).filter(it => !it.when || _hbResolve(it.when));
            if (!_hbItems.length) return;
            _hbStartAngle = Number.isFinite(opts.startAngle) ? opts.startAngle : -90;

            const vw = window.innerWidth, vh = window.innerHeight;
            const itemSize = Math.max(44, Math.min(54, vw * 0.125));
            _hbRadius   = Math.max(84, Math.min(118, Math.min(vw, vh) * 0.26));
            _hbDeadzone = Math.max(36, _hbRadius * 0.42);

            // Recentrage si la pression est trop près d'un bord : sans ça, un tiers du
            // cercle sortirait de l'écran et deviendrait inatteignable au doigt.
            const margin = _hbRadius + itemSize / 2 + 10;
            _hbCenter.x = Math.max(margin, Math.min(vw - margin, x));
            _hbCenter.y = Math.max(margin, Math.min(vh - margin, y));

            ring.style.transform = `translate(${_hbCenter.x}px, ${_hbCenter.y}px)`;
            ring.style.setProperty('--hb-r', _hbRadius + 'px');
            box.style.setProperty('--hb-x', _hbCenter.x + 'px');
            box.style.setProperty('--hb-y', _hbCenter.y + 'px');

            const titleEl = document.getElementById('hotbox-title');
            if (titleEl) {
                titleEl.textContent = opts.title || '';
                titleEl.classList.toggle('visible', !!opts.title);
            }

            /* Grossissement du noyau pendant le survol, calculé sur la géométrie RÉELLE
               du tour en cours : le noyau agrandi doit rester contenu dans la zone morte
               (voir #hotbox-core.showing). On mesure le noyau plutôt que de refaire son
               calcul de taille — il vient d'un clamp() en CSS, le dupliquer en JS créerait
               deux sources de vérité à maintenir ensemble. */
            const coreEl = document.getElementById('hotbox-core');
            const coreW = (coreEl && coreEl.offsetWidth) || 58;
            const scale = Math.max(1.15, Math.min(1.7, (_hbDeadzone * 1.84) / coreW));
            ring.style.setProperty('--hb-core-scale', scale.toFixed(2));
            // Le libellé se pose au bord du noyau GROSSI, pas du noyau au repos.
            ring.style.setProperty('--hb-label-off', Math.round(coreW * scale / 2 + 10) + 'px');

            // Purge des entrées du tour précédent (le noyau et le libellé sont conservés)
            ring.querySelectorAll('.hotbox-item').forEach(n => n.remove());
            _hbNodes = [];
            _hbItemDY = [];
            const step = 360 / _hbItems.length;
            _hbItems.forEach((it, i) => {
                const ang = (_hbStartAngle + i * step) * Math.PI / 180;
                _hbItemDY[i] = Math.sin(ang);
                const node = document.createElement('div');
                node.className = 'hotbox-item'
                    + ((it.on && _hbResolve(it.on)) ? ' on' : '')
                    + (it.cls ? ' ' + it.cls : '');
                node.innerHTML = it.html ? _hbResolve(it.html) : _hbResolve(it.icon);
                node.style.setProperty('--hb-tx', (Math.cos(ang) * _hbRadius).toFixed(1) + 'px');
                node.style.setProperty('--hb-ty', (Math.sin(ang) * _hbRadius).toFixed(1) + 'px');
                node.style.animationDelay = (i * 14) + 'ms';
                ring.appendChild(node);
                _hbNodes.push(node);
            });

            _hbOpen = true; _hbSticky = false; _hbHover = -1; _hbOpenedAt = Date.now();
            _hbHidePress();   // le cercle prend le relais de l'anneau de progression
            /* ⚠ Verrou anti-survol involontaire. Le clamp ci-dessus a pu déplacer le
               centre du cercle de plusieurs dizaines de px (ouverture près d'un bord) :
               le doigt, lui, n'a pas bougé et se retrouve alors DÉJÀ hors de la zone
               morte, donc sur une entrée que personne n'a visée — qu'un relâchement
               immédiat déclencherait, court-circuitant le menu épinglé exactement là
               où il sert le plus. Le survol n'est donc pris en compte qu'une fois le
               doigt réellement déplacé. */
            _hbMoveGate = { x, y };
            box.classList.add('open');
            box.setAttribute('aria-hidden', 'false');
            _hbSetHover(-1);
            _hbVibrate(HB_HAPTIC_OPEN);

            // Sans ça, le glissement vers une entrée ferait aussi défiler la carte —
            // et déclencherait isUserPanning via map.on('dragstart').
            tenterSansBruit(() => { map.dragPan.disable(); map.dragRotate.disable(); map.touchZoomRotate.disable(); }, 'hotbox/gestesOff');

            dismissHotboxHint(true);   // le geste vient d'être exécuté : l'invite a fait son office
            window.addEventListener('pointermove', _hbOnMove);
            window.addEventListener('pointerup', _hbOnUp);
            window.addEventListener('pointercancel', _hbOnCancel);
            window.addEventListener('pointerdown', _hbOnDownWhileOpen, true);
        }

        /* opts.haptic : réservé aux fermetures VOULUES par l'utilisateur (relâchement
           hors de toute entrée). Une fermeture consécutive à un choix vibre déjà via
           HB_HAPTIC_PICK — les deux impulsions se cumuleraient en une bouillie ; et une
           fermeture subie (pincement, pointercancel, réglage désactivé) n'est pas un
           geste à confirmer. */
        function closeHotbox(opts = {}) {
            if (!_hbOpen) return;
            if (opts.haptic) _hbVibrate(HB_HAPTIC_CLOSE);
            _hbOpen = false; _hbSticky = false; _hbHover = -1; _hbPointerId = null;
            _hbMoveGate = null;
            const box = document.getElementById('hotbox');
            if (box) { box.classList.remove('open'); box.setAttribute('aria-hidden', 'true'); }
            // Remettre le noyau au repos ici, pas à la réouverture : _hbSetHover(-1) sort
            // immédiatement quand _hbHover vaut déjà -1, le libellé de la dernière entrée
            // choisie resterait affiché au tour suivant.
            const _lbl = document.getElementById('hotbox-label');
            if (_lbl) _lbl.classList.remove('visible', 'above');
            /* Le noyau doit RETROUVER SON ✕ ICI. C'est le même piège que pour le libellé :
               à la réouverture, `_hbSetHover(-1)` sort immédiatement puisque `_hbHover`
               vaut déjà -1 — l'icône de la dernière entrée choisie resterait donc affichée
               en grand au centre du tour suivant. */
            const _core = document.getElementById('hotbox-core');
            if (_core) { _core.classList.remove('armed', 'showing'); _core.textContent = '✕'; }
            // Même raison : sans ce retrait, le cercle se rouvrirait avec ses entrées floues.
            document.getElementById('hotbox-ring')?.classList.remove('focusing');
            document.getElementById('hotbox-title')?.classList.remove('visible');
            tenterSansBruit(() => { map.dragPan.enable(); map.dragRotate.enable(); map.touchZoomRotate.enable(); }, 'hotbox/gestesOn');
            window.removeEventListener('pointermove', _hbOnMove);
            window.removeEventListener('pointerup', _hbOnUp);
            window.removeEventListener('pointercancel', _hbOnCancel);
            window.removeEventListener('pointerdown', _hbOnDownWhileOpen, true);
        }

        function _hbSetHover(idx) {
            if (idx === _hbHover) return;
            _hbHover = idx;
            _hbNodes.forEach((n, i) => n.classList.toggle('hover', i === idx));
            // Mise au point : tout le cercle recule en flou sauf l'entrée visée.
            document.getElementById('hotbox-ring')?.classList.toggle('focusing', idx >= 0);
            const core  = document.getElementById('hotbox-core');
            const label = document.getElementById('hotbox-label');
            if (core) {
                core.classList.toggle('armed', idx >= 0);
                /* Le noyau reprend l'icône de l'entrée visée, en grand. C'est le seul
                   endroit du cercle que le doigt ne masque jamais. On réutilise `html`
                   quand l'entrée en fournit un (glyphe 2D/3D), sinon `icon` — mêmes
                   sources que la bulle elle-même, jamais une table parallèle. */
                if (idx >= 0) {
                    const it = _hbItems[idx];
                    core.innerHTML = it.html ? _hbResolve(it.html) : _hbResolve(it.icon);
                    core.classList.add('showing');
                } else {
                    core.textContent = '✕';
                    core.classList.remove('showing');
                }
            }
            if (label) {
                if (idx >= 0) {
                    label.textContent = _hbResolve(_hbItems[idx].label);
                    // Entrée dans la moitié basse (dy > 0) : le libellé passe au-dessus,
                    // sinon il s'affiche là où se trouve le pouce.
                    label.classList.toggle('above', (_hbItemDY[idx] || 0) > 0.05);
                    label.classList.add('visible');
                } else {
                    label.classList.remove('visible');
                }
            }
            if (idx >= 0) _hbVibrate(HB_HAPTIC_HOVER);
        }

        // Secteur visé = entrée la plus proche en angle, dès qu'on sort de la zone morte
        // centrale. Le cercle couvre 360°, il n'y a donc jamais de « trou » entre deux
        // entrées : c'est ce qui rend le geste fiable sans viser précisément.
        function _hbHoverFromPoint(x, y) {
            const dx = x - _hbCenter.x, dy = y - _hbCenter.y;
            if (Math.hypot(dx, dy) < _hbDeadzone) return -1;
            const step = 360 / _hbItems.length;
            // Angle mesuré depuis la PREMIÈRE entrée : le calcul doit repartir du
            // même _hbStartAngle que le placement, sinon viser une bulle en
            // sélectionnerait une autre.
            let deg = Math.atan2(dy, dx) * 180 / Math.PI - _hbStartAngle;
            deg = ((deg % 360) + 360) % 360;
            return Math.round(deg / step) % _hbItems.length;
        }

        function _hbOnMove(e) {
            if (!_hbOpen) return;
            // Tant que le doigt n'a pas franchi la tolérance depuis l'ouverture, aucun
            // survol : il est encore posé là où il a appuyé, pas en train de viser.
            if (_hbMoveGate) {
                if (Math.hypot(e.clientX - _hbMoveGate.x, e.clientY - _hbMoveGate.y) <= HOTBOX_MOVE_TOL) return;
                _hbMoveGate = null;
            }
            _hbSetHover(_hbHoverFromPoint(e.clientX, e.clientY));
        }

        function _hbOnDownWhileOpen(e) {
            if (!_hbOpen) return;
            // Menu épinglé : une nouvelle pression sert à viser, le relâchement valide.
            e.preventDefault(); e.stopPropagation();
            _hbPointerId = e.pointerId;
            _hbOpenedAt = Date.now();
            // Pression délibérée sur un menu déjà ouvert : elle vise, donc le verrou
            // d'ouverture n'a plus lieu d'être.
            _hbMoveGate = null;
            _hbSetHover(_hbHoverFromPoint(e.clientX, e.clientY));
        }

        function _hbOnUp(e) {
            if (!_hbOpen) return;
            const held = Date.now() - _hbOpenedAt;
            if (_hbHover >= 0) {
                const item = _hbItems[_hbHover];
                _hbVibrate(HB_HAPTIC_PICK);
                closeHotbox();
                try { item.act(); }
                catch (err) { logAppError('hotbox:' + item.id, err); }
                return;
            }
            // Relâché sans avoir visé : ouverture trop brève ⇒ on épingle le menu
            // plutôt que de le refermer aussitôt (usage au tap, pas au glissé).
            if (!_hbSticky && held < HOTBOX_STICKY_MS) { _hbSticky = true; return; }
            closeHotbox({ haptic: true });
        }

        function _hbOnCancel() { closeHotbox(); }

        function _hbCancelPress() {
            if (_hbPressTimer) { clearTimeout(_hbPressTimer); _hbPressTimer = null; }
            _hbPressPt = null;
            _hbHidePress();
        }

        /* persist : la clé n'est écrite QUE lorsque la hotbox a réellement servi
           (openHotbox l'appelle avec true). Fermer la bulle du ✕ dégage l'écran pour la
           session en cours, mais l'invite revient au lancement suivant tant que le geste
           n'a jamais été fait — un utilisateur qui n'a pas compris ne perd pas
           définitivement l'explication pour l'avoir écartée une fois. */
        function dismissHotboxHint(persist) {
            const el = document.getElementById('hotbox-hint');
            if (el) el.classList.remove('visible');
            if (persist) { safeLocalSet('gps_hotbox_hint', 'seen'); }
        }

        function applyHotboxMode() {
            document.body.classList.toggle('hotbox-on', hotboxEnabled);
            if (!hotboxEnabled) { _hbCancelPress(); closeHotbox(); }
            const chk = document.getElementById('hotbox-toggle-btn');
            if (chk) chk.checked = hotboxEnabled;
        }

        function onHotboxToggleChange(chk) {
            hotboxEnabled = chk.checked;
            safeLocalSet('gps_hotbox', hotboxEnabled ? 'on' : 'off');
            applyHotboxMode();
            // Les boutons flottants réapparaissent dans l'état où la course les avait
            // laissés : on resynchronise le seul qui dépende du contexte caméra.
            showRecenterBtn(isUserPanning);
        }

        (function initHotbox() {
            const mapEl = document.getElementById('map');
            if (!mapEl) return;

            mapEl.addEventListener('pointerdown', function (e) {
                if (!hotboxEnabled || _hbOpen) return;
                if (e.button !== undefined && e.button > 0) return;   // clic droit / molette
                if (pickingMode) return;                              // un ping carte est en cours
                // Les pastilles de prix du scan sont des enfants de #map et portent
                // leur PROPRE appui long (menu « Go ici / Ne pas go »). Sans cette
                // sortie, les deux menus s'armeraient sur la même pression et se
                // disputeraient l'ouverture à 400 ms.
                if (e.target && e.target.closest && e.target.closest('[data-gas-station]')) return;
                _hbCancelPress();   // avant d'armer : _hbCancelPress() efface _hbPressPt
                _hbPressPt = { x: e.clientX, y: e.clientY };
                _hbPointerId = e.pointerId;
                _hbShowPress(e.clientX, e.clientY);   // après _hbCancelPress(), qui le masque
                _hbPressTimer = setTimeout(() => {
                    _hbPressTimer = null;
                    if (_hbPressPt) openHotbox(_hbPressPt.x, _hbPressPt.y);
                    // Filet : openHotbox() masque déjà l'anneau, mais il peut sortir avant
                    // (aucune entrée applicable) et l'anneau resterait plein sous le doigt.
                    _hbHidePress();
                }, HOTBOX_PRESS_MS);
            }, { passive: true });

            mapEl.addEventListener('pointermove', function (e) {
                if (!_hbPressPt || _hbOpen) return;
                if (Math.hypot(e.clientX - _hbPressPt.x, e.clientY - _hbPressPt.y) > HOTBOX_MOVE_TOL) _hbCancelPress();
            }, { passive: true });

            /* ⚠ LE SEUIL EN PIXELS NE SUFFIT PAS — c'est Mapbox qui tranche.
               Les HOTBOX_MOVE_TOL de 12 px annulent un balayage franc, mais un
               déplacement LENT de la carte parcourt moins de 12 px pendant les 400 ms
               d'armement : le menu s'ouvrait alors en plein geste de recadrage, précisément
               quand on examine un trajet tracé et qu'on veut le suivre du doigt.
               Deux seuils indépendants décidaient de la même chose — le nôtre, et celui
               de Mapbox pour déclencher son pan — et le nôtre était le plus haut.
               On délègue donc l'arbitrage à Mapbox : dès qu'il considère que le doigt fait
               défiler la carte, ce n'est plus un appui long, quelle que soit la distance
               parcourue. `dragstart` et non `movestart` : ce dernier se déclenche aussi sur
               les commandes caméra programmées (recadrage, suivi GPS), qui n'ont rien à
               voir avec le doigt de l'utilisateur et annuleraient un appui légitime. */
            tenterSansBruit(() => map.on('dragstart', _hbCancelPress), 'hotbox/dragstart');

            ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
                mapEl.addEventListener(ev, _hbCancelPress, { passive: true }));

            // Le menu contextuel natif (clic droit bureau, appui long Android) s'ouvrirait
            // par-dessus la hotbox.
            mapEl.addEventListener('contextmenu', function (e) {
                if (hotboxEnabled) e.preventDefault();
            });

            // Un deuxième doigt (pincement) n'est pas une demande de menu.
            mapEl.addEventListener('touchstart', function (e) {
                if (e.touches && e.touches.length > 1) { _hbCancelPress(); closeHotbox(); }
            }, { passive: true });

            document.getElementById('hotbox')?.addEventListener('contextmenu', e => e.preventDefault());

            // Source unique de la durée d'appui : le CSS lit --hb-press-ms, le timer lit
            // la constante. Régler HOTBOX_PRESS_MS suffit à déplacer les deux.
            document.getElementById('hb-press')
                ?.style.setProperty('--hb-press-ms', HOTBOX_PRESS_MS + 'ms');

            applyHotboxMode();

            /* Pas d'auto-masquage au bout de quelques secondes : l'invite reste tant que
               le geste n'a pas été fait, puisque c'est elle qui explique le seul moyen
               d'atteindre les commandes de la carte. Elle s'efface dès l'ouverture de la
               hotbox (dismissHotboxHint(true)) ou sur le ✕, pour la session. */
            if (hotboxEnabled && localStorage.getItem('gps_hotbox_hint') !== 'seen') {
                setTimeout(() => {
                    const el = document.getElementById('hotbox-hint');
                    if (el && hotboxEnabled) el.classList.add('visible');
                }, 2500);
            }
        })();

        // ═══════════════════════════════════════════════════════════════════

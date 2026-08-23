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
        // === HOTBOX EN ARC (appui long sur la carte, façon carrousel) ===
        // ═══════════════════════════════════════════════════════════════════
        // Geste : maintenir le doigt sur la carte → l'arc s'ouvre AU-DESSUS du point
        // de pression → glisser HORIZONTALEMENT pour amener une entrée au centre →
        // relâcher pour valider. Un relâchement immédiat (sans glisser) laisse le
        // menu ouvert pour un usage au tap.
        //
        // ⚠ POURQUOI CE N'EST PLUS UN CERCLE (16/08/2026). Le menu radial plaçait des
        // entrées TOUT AUTOUR du point de pression, donc fatalement sous le doigt et
        // sous la paume : celle qu'on visait était masquée par ce qui la visait. Le
        // détour d'alors — reprendre l'entrée visée en grand dans le noyau central —
        // compensait le symptôme sans traiter la cause, et coûtait au passage tout un
        // appareillage (zone morte, `--hb-core-scale` borné à la zone morte, libellé
        // qui bascule au-dessus quand l'entrée est dans la moitié basse).
        // Ici la géométrie règle le problème : la main occupe une bande horizontale,
        // les entrées vivent AU-DESSUS d'elle, plus rien n'est jamais masqué. Tout
        // l'appareillage de compensation a donc disparu avec le cercle — ne pas le
        // réintroduire par morceaux.
        //
        // La profondeur remplace l'angle : l'entrée centrée est au premier plan, nette
        // et grande ; ses voisines s'éloignent sur l'arc, rapetissent, se désaturent et
        // se floutent. Le choix ne se fait plus qu'avec UN axe, l'horizontal.
        //
        // Les entrées ne réimplémentent RIEN : elles appellent exactement les mêmes
        // fonctions que les boutons flottants, qui restent dans le DOM (masqués par
        // body.hotbox-on). Toute la logique d'état existante continue donc de tourner.

        const HOTBOX_PRESS_MS   = 400;  // durée d'appui avant ouverture
        const HOTBOX_MOVE_TOL   = 12;   // px de tolérance avant d'annuler (= un pan de carte)
        const HOTBOX_STICKY_MS  = 260;  // relâchement plus rapide que ça → menu épinglé

        /* ═══ GÉOMÉTRIE : UNE RANGÉE HORIZONTALE, PLUS UN ARC (16/08/2026) ═══
           Les entrées sont alignées sur une SEULE ordonnée. L'arc y ajoutait une élévation
           des voisines qui n'apportait rien qu'on ne lise déjà dans la taille et le flou,
           et qui dispersait le regard sur deux axes là où le geste n'en a qu'un.
           Ce qui reste de la perspective, et qui suffit : l'écart ANGULAIRE entre deux
           entrées est constant, donc l'écart HORIZONTAL projeté (`sin`) se resserre vers
           les bords. La rangée se lit comme une file vue de face qui s'enfonce sur les
           côtés — sans qu'aucune icône ne quitte la ligne du regard. */
        const HB_STEP_DEG = 30;    // écart angulaire entre deux entrées
        /* Entrées visibles de part et d'autre du centre. ⚠ 2 et non 3 : à trois crans la
           bulle du fond tombait à 0,6 de l'échelle, floutée par-dessus le marché — sur une
           carte sombre elle ne se lisait plus comme un objet mais comme une salissure. Une
           fenêtre plus étroite montre moins d'entrées à la fois mais les montre VRAIMENT,
           ce qui est le seul intérêt de les montrer. */
        const HB_WINDOW   = 2;
        /* ═══ ÉCHAPPATOIRE VERTICALE — ET LE PIÈGE QU'ELLE A TENDU (16/08/2026) ═══
           L'axe vertical ne sert à rien au carrousel : on lui donne le rôle que tenait la
           zone morte du cercle, un endroit où battre en retraite. Sans lui, une entrée une
           fois armée ne pourrait plus être abandonnée.
           ⚠ MAIS ON NE MESURE PAS CETTE DESCENTE DEPUIS LE POINT DE SAISIE — le premier
           essai le faisait et se déclenchait TOUT SEUL. Un pouce qui balaie à l'horizontale
           pivote autour de sa base : il décrit un arc et descend réellement de ~6 px par
           passe. Six va-et-vient — un usage parfaitement normal — cumulaient 72 px et
           faisaient basculer tout le menu en position d'abandon, sans que l'utilisateur
           ait eu la moindre intention de descendre. Reproduit en Chrome, pas déduit.
           La descente se compte donc depuis une référence MOBILE qui absorbe la dérive :
           voir `_hbOnMove`. Le critère n'est pas « le doigt est bas » mais « le doigt
           DESCEND franchement », ce qui est le geste réellement voulu. */
        const HB_ABORT_DY     = 70;
        /* Zone neutre du MODE POINTAGE, en fraction de `_hbDragPx` (0,6 ≈ 27 px sur un
           411). En deçà, rien n'est armé et le noyau ✕ reste affiché : c'est l'équivalent
           en un axe de la zone morte centrale du cercle. Volontairement plus large que
           HOTBOX_MOVE_TOL — ce mode sert aux choix conséquents (« Go ici / Ne pas go »),
           il ne doit pas s'armer sur un frémissement du pouce. */
        const HB_NEUTRAL_TOL  = 0.6;
        /* Élévation SUPPLÉMENTAIRE de la rangée au-dessus du point de pression, en plus de
           la demi-bulle et du dégagement du doigt (voir `lift` dans openHotbox). Demandée
           le 18/08/2026 : sur l'appareil, la rangée arrivait encore un peu bas sur le pouce,
           là où le simulateur — souris, pas de main devant l'écran — ne le montrait pas.
           Constante séparée et non 10 px noyés dans le calcul de `lift` : c'est un réglage
           de confort, il doit se retoucher d'un seul chiffre sans relire la formule. */
        const HB_LIFT_EXTRA   = 10;

        let hotboxEnabled = localStorage.getItem('gps_hotbox') !== 'off';

        let _hbOpen = false, _hbSticky = false, _hbHover = -1;
        let _hbItems = [], _hbNodes = [];
        /* Position du carrousel, en index FRACTIONNAIRE de l'entrée centrée. Fractionnaire
           et non entier : le glissement est suivi au pixel près, les entrées coulissent
           avec le doigt au lieu de sauter d'un cran à l'autre. L'entrée validée est
           l'arrondi. Bornée à [0, n-1] — voir _hbClampPos. */
        let _hbPos = 0;
        /* Point de saisie courant et position du carrousel à cet instant. Le choix est
           donc RELATIF au point de saisie, jamais absolu à l'écran : c'est ce qui rend le
           recentrage de l'arc près d'un bord parfaitement inoffensif, là où le cercle
           armait une entrée que personne n'avait visée (l'ancien piège `_hbMoveGate`). */
        let _hbGrab = null;
        let _hbDragPx = 46;     // px de glissement horizontal pour passer d'une entrée à l'autre
        let _hbAbort = false;   // le doigt descend franchement : rien ne sera lancé
        let _hbLayoutRaf = 0;
        /* Rayon de la perspective : il fixe l'écartement des entrées et son resserrement
           vers les bords. Module-level parce que _hbLayout() le relit à chaque image ;
           l'ordonnée de la rangée, elle, ne sert qu'une fois à l'ouverture et reste une
           variable locale — un état de moins à voir vieillir. */
        let _hbRadius = 120;
        /* Écartement uniforme en px quand la liste tient à l'écran EN ENTIER avec du jour
           entre les bulles ; 0 = perspective resserrée par défaut. Voir openHotbox. */
        let _hbFlatStep = 0;
        /* ═══ MODE POINTAGE ═══ Index (fractionnaire) de la position NEUTRE, entre les
           entrées, où trône le noyau ✕ ; `null` = mode carrousel ordinaire.
           Deux modèles d'interaction, et c'est assumé, parce qu'il y a deux situations :
             — CARROUSEL (menu général) : une LISTE qu'on fait défiler. Les entrées
               coulissent, celle qui arrive au centre est armée. Il y a une entrée `pivot`
               sur laquelle ouvrir, et aucune place neutre à réserver.
             — POINTAGE (« Go ici / Ne pas go ») : un CHOIX présenté en entier, rien à
               faire défiler. Les bulles ne bougent pas, c'est la visée qui se déplace, et
               le centre reste libre pour un ✕ où l'on revient pour n'en prendre aucune.
           La bascule est automatique et tient en une question : **le catalogue
           désigne-t-il une entrée `pivot` ?** S'il en désigne une, il y a un défaut à
           proposer, donc une liste à parcourir. Sinon, aucune option ne doit être
           privilégiée — et c'est exactement le cas d'un choix binaire conséquent. */
        let _hbNeutral = null;
        let _hbPressTimer = null, _hbPressPt = null, _hbPointerId = null, _hbOpenedAt = 0;

        /* Tant qu'il est levé, RIEN n'est armé : relâcher ferme le menu sans rien lancer.
           C'est l'annulation principale — le carrousel a toujours une entrée au centre,
           il n'existe donc plus de « relâcher dans le vide » comme au centre du cercle.
           Le premier glissement du doigt le retire (voir _hbOnMove). */
        let _hbMoveGate = false;

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

        /* ═══ CATALOGUE — L'ORDRE EST UNE MISE EN PAGE, PAS UNE LISTE ═══
           `when` filtre à chaque ouverture, `on` colore l'entrée active.

           ⚠ L'ARC S'OUVRE SUR L'ENTRÉE `pivot`, PAS SUR LA PREMIÈRE (16/08/2026). Le
           carrousel démarrait sur l'entrée 0 : tout se trouvait donc du même côté, il
           fallait jusqu'à 315 px de glissement vers la gauche pour atteindre la dernière
           — un grand mouvement, et un mouvement à sens unique, donc inégal selon qu'on
           tient le téléphone de la main droite ou de la gauche. En ouvrant AU MILIEU, la
           course maximale est divisée par deux et les deux sens se valent.

           Conséquence directe et non négociable : **la loupe ne peut plus être en tête**.
           « Centrée à l'ouverture » et « première du catalogue » sont devenues deux choses
           contradictoires. Les autres entrées se répartissent donc de part et d'autre
           d'elle, et l'ordre ci-dessous est calculé pour que la loupe tombe au centre
           DANS CHAQUE CONFIGURATION de filtrage :
           (« la loupe » ci-dessous = l'entrée `search`, dessinée depuis le 16/08/2026 par
           une ÉPINGLE et non plus par une loupe ; les 🔍 des schémas restent lisibles comme
           repère de position, ils ne décrivent plus le picto affiché.)
             — à l'arrêt / trajet libre : 🚦 3D [🔍] ⛽ 🌙        → centre exact de 5
             — en course avec destination : 🔊 🚦 3D [🔍] ⛽ 📍 📡 🌙 → 3 à gauche, 4 à droite
           Les trois entrées propres à la course (🔊 avant, 📍 📡 après) sont volontairement
           réparties des DEUX côtés : groupées d'un seul, leur disparition à l'arrêt
           décalerait la loupe hors du centre.
           ⚠ Le `pivot` reste malgré tout la source de vérité — `openHotbox` centre sur lui
           quel que soit son index réel. L'ordre ci-dessus règle l'ÉQUILIBRE de l'arc, pas
           la justesse du centrage : un filtrage imprévu déséquilibre, il ne casse rien.
           Second critère, une fois le centre acquis : les entrées les plus utiles sont les
           plus proches, un cran de carrousel étant le prix à payer pour chacune. D'où 3D et
           ⛽ collés à la loupe, et 🌙 (le plus rare) au bout. */
        function _hotboxCatalog() {
            return [
                { id: 'mute', icon: () => voiceGuidanceEnabled ? '🔊' : '🔇',
                  label: () => voiceGuidanceEnabled ? 'Couper le son' : 'Rétablir le son',
                  // Retiré en TRAJET LIBRE : sans itinéraire il n'y a aucune instruction
                  // de guidage à couper, le bouton n'agirait sur rien d'audible.
                  when: () => isCourseStarted && !isFreeCourseActive(),
                  on:   () => !voiceGuidanceEnabled,
                  act:  () => toggleMuteFromNav() },
                /* ⚠ PICTOGRAMMES EN IMAGE : passer par `html`, PAS par `icon`.
                   `openHotbox()` enveloppe automatiquement `icon` dans un `<span
                   class="hb-ico">` — utile pour un emoji, inutile pour une balise <img> qui
                   porte déjà sa propre classe. Les entrées à image fournissent donc leur
                   balise complète, et celles qui gardent un emoji DANS un `html` doivent
                   l'envelopper elles-mêmes (voir 'gasscan' en mode borne).
                   ⚠ Chemins en MINUSCULES et exactement tels que sur le disque : Windows
                   est insensible à la casse, `file:///android_asset/` non — une divergence
                   ne se verrait que sur l'appareil, jamais dans Chrome. */
                { id: 'traffic', label: 'Trafic',
                  html: '<img class="hb-img" src="Images/trafic.png" alt="">',
                  on:   () => isTrafficVisible,
                  act:  () => toggleTraffic() },
                /* Même règle que Jour/Nuit plus bas : l'image montre l'ACTION proposée, pas
                   l'état courant. En vue 3D on propose le retour au plan, et c'est donc
                   l'aiguille droite de `2d.png` qui s'affiche. Les deux dessins ne diffèrent
                   que par l'inclinaison de l'aiguille — c'est voulu, la bascule doit se lire
                   comme un basculement de la MÊME boussole, pas comme deux boutons. */
                { id: '3d', label: () => map3DActive ? 'Vue 2D' : 'Vue 3D',
                  html: () => map3DActive
                            ? '<img class="hb-img" src="Images/2d.png" alt="">'
                            : '<img class="hb-img" src="Images/3d.png" alt="">',
                  on:   () => map3DActive,
                  act:  () => toggle3DMode() },
                /* ⚠ TROIS ENTRÉES SE PARTAGENT LE `pivot`, dans CET ordre (21/08/2026 —
                   elles n'étaient que deux avant l'arrivée déclarée). `openHotbox` retient
                   le PREMIER `pivot` survivant au filtrage (`findIndex`), si bien que
                   l'ordre de la liste EST la priorité. Ne pas les réordonner, ni retirer le
                   `pivot` de l'une d'elles — l'arc s'ouvrirait alors sur son milieu
                   arithmétique, c'est-à-dire sur n'importe quoi.

                   'arrived' passe en premier parce que sa condition est la plus étroite des
                   trois : elle n'est vraie qu'à moins de 500 m de la destination, en cours
                   de trajet. Dans cette fenêtre-là, « je suis arrivé » l'emporte sur
                   « Destination » — on ne cherche plus où aller, on y est. Partout ailleurs
                   elle disparaît et rend la place. Aucun conflit avec 'canceltrip' : celle-ci
                   ne vit que pendant l'aperçu, donc avant que le trajet ne démarre.

                   ⚠ MÊME ACTION QUE LE BOUTON CENTRAL, PAS UNE SECONDE IMPLÉMENTATION : les
                   deux appellent `confirmArrival()` (js/19), qui porte seul la règle des
                   500 m et le passage de `finished` à vrai. C'est ce qui garantit que les
                   deux chemins ne pourront pas se mettre à diverger. */
                { id: 'arrived', icon: '🏁', label: 'Je suis arrivé', pivot: true,
                  when: () => canConfirmArrival(),
                  act:  () => confirmArrival() },
                /* ⚠ CES DEUX ENTRÉES SE PARTAGENT LA MÊME PLACE — le `pivot`, donc le centre
                   de l'arc à l'ouverture, atteignable sans le moindre geste. Leurs `when`
                   sont exclusifs : une seule survit au filtrage, et c'est elle qui occupe
                   cette place. Ne pas les séparer dans la liste, ni retirer le `pivot` de
                   l'une des deux — l'arc s'ouvrirait alors sur son milieu arithmétique,
                   c'est-à-dire sur n'importe quoi.

                   Pendant l'aperçu de trajet, la loupe n'aurait rien à ouvrir : la
                   destination est déjà saisie et le modal a ses propres champs Départ /
                   Arrivée. La question à cet instant est « je pars ou j'annule ? », et la
                   croix du modal est en haut à droite de l'écran — hors de portée du pouce
                   qui vient justement de faire un appui long au centre de la carte. */
                /* ❌ et non un ✕ nu : « annuler le trajet » est une action lourde, elle ne
                   doit pas se lire comme le geste anodin de refermer un menu. La croix
                   pleine et rouge l'en distingue au premier coup d'œil. */
                { id: 'canceltrip', icon: '❌', label: 'Annuler le trajet', pivot: true,
                  when: _hbTripPreviewOpen,
                  act:  () => closeTripModal(true) },
                /* Plus de garde `when` en dehors de ce cas — à l'arrêt comme en roulant, cette
                   entrée est le seul chemin vers une destination depuis la carte, le panneau
                   Itinéraire arrivant désormais escamoté.
                   ⚠ Le picto est une ÉPINGLE et non plus une loupe (16/08/2026) : il dit la
                   destination, pas l'outil pour la trouver. Conséquence à surveiller — en
                   course avec destination, l'arc contient aussi 'stop' (📍 « Ajouter un
                   arrêt »), lui aussi une épingle. Les deux restent distincts tant que 'stop'
                   garde son emoji ; le jour où il passera en image, il lui faudra un dessin
                   qui ne soit pas une épingle nue, sinon deux entrées voisines diront la
                   même chose. */
                { id: 'search', pivot: true,
                  html: '<img class="hb-img" src="Images/recherche_adresse.png" alt="">',
                  label: () => isCourseStarted ? 'Destination' : 'Rechercher une adresse',
                  when: () => !_hbTripPreviewOpen(),
                  act:  () => openSearchFromHotbox() },
                /* ⚠ ENTRÉE « RECENTRER » VOLONTAIREMENT ABSENTE — ne pas la rétablir.
                   `recenterMap()` et son bouton autonome `#recenter-btn` restent en place :
                   ce dernier apparaît DÉJÀ tout seul sur le bord droit dès que la carte
                   est déplacée, c'est-à-dire exactement quand la fonction devient utile.
                   La reprendre dans l'arc ferait doublon et éloignerait d'un cran tout ce
                   qui la suit, au bénéfice d'un besoin occasionnel — un carrousel se paie
                   en longueur, pas seulement en place. */
                { id: 'gasscan',
                  // Picto et libellé suivent la configuration véhicule : une borne
                  // pour un électrique, une pompe sinon. L'hybride garde la pompe
                  // mais annonce les deux réseaux, puisqu'il les cherche tous les deux.
                  // ⚠ Il MANQUE une image de borne : le mode électrique reste sur l'emoji
                  //    🔌, et détonne donc à côté de la pompe dessinée. À remplacer dès
                  //    qu'une `Images/bornes.png` existe, au même format que les autres.
                  html:  () => _scanVehicleMode() === 'ev'
                             ? '<span class="hb-ico">🔌</span>'
                             : '<img class="hb-img" src="Images/stations.png" alt="">',
                  label: () => _scanVehicleMode() === 'ev'   ? 'Bornes autour de moi'
                             : _scanVehicleMode() === 'both' ? 'Stations et bornes autour de moi'
                             : 'Stations autour de moi',
                  // Retirée du cercle pendant l'aperçu de trajet : les stations y sont
                  // déjà scannées et affichées par le panneau du modal.
                  when: () => !_gasScanBlocked(),
                  /* ⚠ PAS DE `on` — retiré le 19/08/2026, ne pas le rétablir. Il colorait la
                     bulle en bleu clair (`.hotbox-item.on`) tant que la feuille du scan était
                     ouverte, ce qui la faisait détonner au milieu de bulles sombres pour une
                     information qu'on a déjà sous les yeux : quand la feuille est ouverte, la
                     ZONE RADAR est dessinée sur la carte et la feuille occupe le bas de
                     l'écran. Le fond clair ne disait donc rien de neuf.
                     `on` garde tout son sens pour les bascules dont l'icône et le libellé ne
                     changent pas ET dont l'état ne se voit pas autrement (trafic, muet,
                     partage live) : là, la couleur est le seul signal disponible. */
                  act:  () => openGasScan() },
                /* ⚠ MÊME IMAGE QUE 'gasscan', SURCHARGÉE D'UN SENS INTERDIT — c'est ce qui
                   fait reconnaître l'entrée sans lire le libellé : « la chose que je connais,
                   barrée ». Un dessin distinct aurait obligé à réapprendre un symbole.
                   Le sens interdit est en CSS (`.hb-off`), pas en PNG : il se superpose donc
                   aussi bien à la pompe qu'à une future `Images/bornes.png`, sans qu'il faille
                   dessiner et maintenir une variante barrée de chaque picto.

                   ⚠ L'IMAGE MONTRE L'ACTION PROPOSÉE, PAS L'ÉTAT COURANT — même règle que
                   Jour/Nuit et 2D/3D plus haut, à laquelle il ne faut pas déroger ici sous
                   prétexte que le barré « dit » l'état. Stations visibles → on propose de les
                   masquer → picto BARRÉ. Stations masquées → on propose de les rendre → picto
                   NU. Les intervertir donnerait un bouton qui barre les stations tout en
                   promettant de les afficher.

                   ⚠ PAS DE `on` — et ce n'est pas un oubli (19/08/2026). `on` colore la bulle
                   en bleu clair (`.hotbox-item.on`), or l'état est DÉJÀ dit deux fois ici :
                   par le picto (barré / nu) et par le libellé. Le fond clair n'ajoutait donc
                   aucune information et faisait détonner l'entrée au milieu de bulles sombres.
                   `on` garde son sens pour les bascules dont l'icône ne change pas (trafic,
                   muet, partage live) : là, la couleur est le seul signal d'état.

                   ⚠ `when` : PENDANT L'APERÇU DE TRAJET UNIQUEMENT — exactement l'inverse de
                   la garde de 'gasscan' juste au-dessus, les deux entrées étant ainsi
                   mutuellement exclusives. C'est le seul moment où des pastilles de prix
                   recouvrent un tracé que l'on cherche à lire, départ et arrivée compris.
                   Ailleurs elle serait du bruit : sur le panneau Itinéraire aucune station
                   n'est affichée, et dans le scan « autour de moi » proposer de masquer ce
                   que l'on vient tout juste de demander n'a aucun sens (`openGasScan()` lève
                   d'ailleurs le masquage pour cette raison).
                   ⚠ Le second terme `_stationsHidden` est INDISPENSABLE : sans lui, masquer
                   pendant l'aperçu puis fermer l'aperçu emporterait le seul bouton capable de
                   rendre les stations — elles resteraient invisibles pour toute la session,
                   sans aucun chemin de retour. */
                { id: 'stationsvis',
                  html: () => _stationsHidden
                            ? '<img class="hb-img" src="Images/stations.png" alt="">'
                            : '<span class="hb-stack"><img class="hb-img" src="Images/stations.png" alt=""><span class="hb-off"></span></span>',
                  label: () => _stationsHidden ? 'Afficher stations' : 'Masquer stations',
                  when: () => _stationsHidden || _hbTripPreviewOpen(),
                  act:  () => toggleStationsVisibility() },
                { id: 'stop', icon: '📍', label: 'Ajouter un arrêt',
                  when: _hbHasDestination,
                  on:   () => pickingMode === 'nav-pin-stop',
                  act:  () => toggleNavPinStop() },
                { id: 'live', icon: '📡', label: 'Partage live',
                  when: _hbHasDestination,
                  on:   () => document.getElementById('nav-btn-liveshare')?.classList.contains('sharing'),
                  act:  () => toggleLiveShare() },
                /* ⚠ L'ICÔNE MONTRE L'ACTION, PAS L'ÉTAT COURANT — comme le libellé, qu'elle
                   doit donc suivre exactement. En mode sombre on propose « Mode jour », et
                   c'est le SOLEIL qui s'affiche. Les intervertir donnerait un bouton qui
                   dessine la nuit tout en promettant le jour.
                   `hb-img-nuit` rattrape la marge interne de `mode_nuit.png`, dont le
                   contenu n'occupe que 54 % de la toile contre 85 % pour les autres — voir
                   la règle CSS. Sans cela la lune serait un tiers plus petite que le soleil,
                   et l'icône rétrécirait à vue d'œil à chaque bascule du MÊME bouton. */
                { id: 'theme', label: () => isDarkMode ? 'Mode jour' : 'Mode nuit',
                  html: () => isDarkMode
                            ? '<img class="hb-img" src="Images/mode_jour.png" alt="">'
                            : '<img class="hb-img hb-img-nuit" src="Images/mode_nuit.png" alt="">',
                  act:  () => toggleMapTheme() }
            ];
        }

        function _hbResolve(v) { return (typeof v === 'function') ? v() : v; }

        /* Borne le carrousel à ses deux extrémités. Pas de bouclage : chaque entrée garde
           une place ABSOLUE dans la liste (« Jour/Nuit est tout à droite »), et c'est cette
           mémoire de position qui fait tout l'intérêt d'un menu gestuel. Un carrousel
           infini ferait tout atteindre dans les deux sens, mais plus rien ne serait
           quelque part. */
        function _hbClampPos(p) {
            return Math.max(0, Math.min(_hbItems.length - 1, p));
        }

        /* Recentrage sur l'axe demandé. ⚠ Ne PAS écrire `Math.max(lo, Math.min(hi, v))`
           sans garde : sur un petit écran l'arc peut être plus large que la fenêtre, `lo`
           passe alors au-dessus de `hi` et la formule colle silencieusement le résultat
           sur `lo` — l'arc partirait vers la droite au lieu de rester centré. */
        function _hbFit(v, lo, hi) {
            return (lo > hi) ? (lo + hi) / 2 : Math.max(lo, Math.min(hi, v));
        }

        /* Aligne les entrées sur la rangée pour la valeur courante de `_hbPos`.
           Appelée à chaque image pendant le glissement : elle n'écrit que des variables
           CSS, tout le rendu (translation, échelle, flou) est déclaré une seule fois dans
           la feuille de style. */
        function _hbLayout() {
            const stepRad = HB_STEP_DEG * Math.PI / 180;
            /* Prolongement RECTILIGNE au-delà de la fenêtre visible. Passé l'angle du bord
               (2 × 30° = 60°), `sin` finirait par redescendre : les entrées lointaines
               reviendraient vers le centre et se rempileraient sur les premières. On les
               pousse donc en ligne droite, à la vitesse exacte du bord — le raccord est
               lisse, et elles y sont de toute façon déjà effacées. */
            const extRate = Math.cos(HB_WINDOW * stepRad) * stepRad * _hbRadius;
            for (let i = 0; i < _hbNodes.length; i++) {
                const d = i - _hbPos, ad = Math.abs(d);
                const cl = Math.min(ad, HB_WINDOW);
                const sgn = d < 0 ? -1 : 1;
                /* Deux régimes. `_hbFlatStep` : écartement uniforme, les bulles ne se
                   touchent pas — réservé aux listes courtes (voir openHotbox). Sinon la
                   perspective, qui resserre vers les bords et fait chevaucher. */
                const tx = _hbFlatStep
                    ? d * _hbFlatStep
                    : sgn * (Math.sin(cl * stepRad) * _hbRadius
                             + Math.max(0, ad - HB_WINDOW) * extRate);
                const near = 1 - cl / HB_WINDOW;   // 1 au centre, 0 au bord de la fenêtre
                const st = _hbNodes[i].style;
                st.setProperty('--hb-tx', tx.toFixed(1) + 'px');
                /* ⚠ PLUS DE DÉSATURATION (16/08/2026). Elle valait 0,85 au bord de la
                   fenêtre : des pictogrammes gris, illisibles d'un coup d'œil, et surtout
                   indiscernables de l'état d'abandon qui met tout le menu en gris — deux
                   choses très différentes rendues presque pareil. Une icône ne se reconnaît
                   pour ainsi dire QUE par sa couleur (⛽ rouge, 🚦 tricolore, ☀️ jaune) :
                   la lui retirer, c'est retirer l'information qu'on montre.
                   Le retrait passe donc entièrement par la TAILLE et le flou. */
                /* En POINTAGE les bulles ne se déplacent jamais : le seul retour possible
                   sur la visée est le grossissement sur place. C'est aussi pourquoi
                   `_hbSetHover` y redemande une mise en page — sans quoi la bulle visée
                   garderait la taille de sa voisine. */
                const vise = (_hbNeutral !== null && i === _hbHover);
                st.setProperty('--hb-sc', (vise ? 1 : 0.66 + 0.34 * near).toFixed(3));
                st.setProperty('--hb-blur', (vise ? 0 : cl * 0.6).toFixed(2) + 'px');
                /* ⚠ L'opacité ne CRÉE pas le retrait, elle l'accompagne. Les bulles sont
                   très sombres (#0a0e17) sur un voile sombre : sous ~0,6 elles se
                   confondent avec le fond et on perd de vue où aller — c'est la règle
                   héritée du cercle, et elle tient toujours. D'où une plage étroite
                   (1 → 0,8) dans la fenêtre ; seule l'entrée qui en SORT s'efface pour de
                   bon, sur le dernier demi-cran, au lieu de disparaître d'un coup. */
                st.setProperty('--hb-op', (ad <= HB_WINDOW
                    ? 0.8 + 0.2 * near
                    : Math.max(0, 0.8 * (1 - (ad - HB_WINDOW) / 0.6))).toFixed(2));
                // L'entrée au premier plan doit couvrir ses voisines, pas l'inverse.
                _hbNodes[i].style.zIndex = String(Math.round(40 - cl * 10));
            }
            _hbUpdateLabel();
        }

        /* Nom de la bulle centrale affiché EN CONTINU au-dessus d'elle, dès l'ouverture
           et pendant tout le glissement — découplé de l'armement (halo + vibration +
           tir au relâchement), qui reste conditionné au vrai déplacement (_hbMoveGate,
           voir _hbOnMove). Avant ce changement le nom ne s'affichait que sur une entrée
           ARMÉE, donc jamais à l'ouverture ni tant que le doigt n'avait pas bougé :
           il fallait remonter le doigt sur la bulle pour lire de quoi il s'agissait,
           une étape en trop pour une info qui doit être immédiate (18/08/2026).
           Carrousel uniquement : en pointage (`_hbNeutral !== null`) il n'y a pas de
           bulle "centrée" à nommer par défaut, le nom reste piloté par _hbSetHover(). */
        function _hbUpdateLabel(force) {
            if (_hbNeutral !== null) return;
            const label = document.getElementById('hotbox-label');
            if (!label) return;
            if (_hbAbort) { label.classList.remove('visible'); return; }
            const idx = Math.round(_hbPos);
            if (idx < 0 || idx >= _hbItems.length || !_hbItems[idx]) { label.classList.remove('visible'); return; }
            label.textContent = _hbResolve(_hbItems[idx].label);
            /* `force` : appelé une seule fois, à l'ouverture, juste après que `#hotbox` soit
               passé en `display: block` (voir openHotbox). Le retrait suivi d'une LECTURE de
               layout empêche le navigateur de regrouper « pas rendu » et « visible » en un
               seul changement de style — regroupés, la transition d'opacité n'a pas d'état
               de départ et peut ne jamais démarrer. Pendant le glissement, `force` est
               absent : on ne paie ce reflow qu'une fois par ouverture, jamais par image. */
            if (force) { label.classList.remove('visible'); void label.offsetWidth; }
            label.classList.add('visible');
        }

        /* Une seule mise en page par image. Le glissement émet des `pointermove` bien
           plus souvent que le compositeur ne rafraîchit, et chaque passe écrit 6 variables
           CSS sur 8 nœuds : sans ce filtre on paierait plusieurs fois le même rendu. */
        function _hbRequestLayout() {
            if (_hbLayoutRaf) return;
            _hbLayoutRaf = requestAnimationFrame(() => { _hbLayoutRaf = 0; _hbLayout(); });
        }

        /* Ouvre l'arc. Sans argument `items`, c'est le menu général de la carte ; avec,
           c'est un menu contextuel (choix sur une station…) qui réutilise exactement le
           même geste et le même retour haptique.
           opts.title : intitulé affiché au-dessus de l'arc.
           ⚠ `opts.startAngle` n'existe plus : il servait à poser un choix binaire à
           l'horizontale dans le cercle, ce que l'arc fait désormais par construction. */
        function openHotbox(x, y, items, opts = {}) {
            if (_hbOpen) return;
            const box  = document.getElementById('hotbox');
            const ring = document.getElementById('hotbox-ring');
            if (!box || !ring) return;

            _hbItems = (items || _hotboxCatalog()).filter(it => !it.when || _hbResolve(it.when));
            if (!_hbItems.length) return;

            const vw = window.innerWidth, vh = window.innerHeight;
            /* ⚠ La taille des bulles est calculée ICI et posée en variable CSS, elle n'est
               pas déclarée en `clamp()` dans la feuille de style : toute la géométrie en
               dépend (élévation au-dessus du doigt, marges de recentrage, place du libellé)
               et deux `clamp()` jumeaux à tenir synchronisés finiraient par diverger.
               Franchement plus grosses que celles du cercle (44-54 px) : elles n'ont plus à
               tenir à huit autour d'un point, seules trois à cinq sont visibles à la fois.
               La taille est ce qui rend l'entrée centrée lisible d'un coup d'œil. */
            const itemSize = Math.max(64, Math.min(92, vw * 0.21));
            /* Rayon réglé pour que les voisines CHEVAUCHENT LÉGÈREMENT l'entrée centrée :
               sin(30°) × R ≈ 62 px d'écart pour des bulles de 86 px. Depuis que la rangée
               est plate, ce recouvrement est — avec la taille — le seul indice de
               profondeur qui reste : des bulles espacées se liraient comme une simple
               barre d'outils, sans premier plan ni arrière-plan.
               ⚠ Mais « légèrement » est la moitié de la règle. À 0,27 (55 px d'écart) les
               entrées de bord étaient recouvertes aux deux tiers — le 🚦 ne se distinguait
               plus du 3D qui le masquait, et une entrée qu'on n'identifie pas ne compte pas
               comme visible. Le recouvrement doit suggérer la profondeur, pas escamoter. */
            _hbRadius = Math.max(100, Math.min(148, Math.min(vw, vh) * 0.30));
            /* Course du doigt pour passer d'une entrée à la suivante : ~45 px sur un
               411 px. Comme l'ouverture se fait au milieu de la liste, la course maximale
               n'est que de 2 à 4 crans par côté. Plus court rendrait le carrousel nerveux
               et le choix imprécis ; plus long remettrait les extrémités hors de portée. */
            _hbDragPx = Math.max(34, Math.min(52, vw * 0.11));

            /* ═══ L'ÉLÉVATION EST LA RAISON D'ÊTRE DE TOUTE CETTE DISPOSITION ═══
               La rangée ne se dessine PAS au point de pression mais nettement au-dessus :
               c'est ce décalage, et lui seul, qui garantit qu'aucune entrée ne se
               retrouve jamais sous le doigt ni sous la main. Le ramener à zéro
               réintroduirait exactement le défaut que cette disposition corrige. */
            const lift = itemSize / 2 + Math.max(38, Math.min(52, vw * 0.11)) + HB_LIFT_EXTRA;

            /* ═══ LISTE COURTE : ON ÉCARTE, ON NE CHEVAUCHE PLUS ═══
               Le recouvrement dit « il y en a d'autres derrière ». C'est vrai d'un
               carrousel de 5 à 8 entrées ; c'est faux — et trompeur — d'un choix qui tient
               tout entier à l'écran. Le menu binaire « Go ici / Ne pas go » collait ses
               deux bulles l'une contre l'autre alors qu'il n'y a rien à faire défiler et
               que confondre les deux options a des conséquences.
               La bascule n'est donc pas un seuil arbitraire sur le nombre d'entrées : on
               écarte tant que la rangée ENTIÈRE tient à l'écran avec du jour entre les
               bulles, et on ne se remet à chevaucher que lorsqu'il le faut vraiment — le
               moment où, précisément, il y a bien du monde derrière.
               ⚠ La largeur se calcule sur la BUTÉE (`n - 1` crans d'un même côté), pas sur
               la position d'ouverture : le glissement amène la rangée jusque-là. */
            const scaleAt1 = 0.66 + 0.34 * (1 - 1 / HB_WINDOW);
            const nItems   = _hbItems.length;
            const iPivot   = _hbItems.findIndex(it => it.pivot);
            const coreW    = itemSize * 0.62;
            let   airStep  = itemSize / 2 + itemSize * scaleAt1 / 2 + 12;
            /* Sans `pivot`, le centre accueillera le noyau ✕ (mode pointage) : il faut donc
               de quoi le loger ENTRE les bulles sans qu'il les touche. On dimensionne sur
               une bulle à l'échelle 1 — c'est celle que prend l'entrée visée — sinon le
               grossissement viendrait mordre le noyau au moment précis où l'on vise. */
            if (iPivot < 0) airStep = Math.max(airStep, 2 * (coreW / 2 + 10 + itemSize / 2));
            _hbFlatStep = ((nItems - 1) * airStep + itemSize <= vw - 24) ? airStep : 0;
            /* Le mode pointage exige la place : s'il faut chevaucher, le noyau n'aurait pas
               où tenir et l'on retombe sur le carrousel, qui n'en a pas besoin. */
            _hbNeutral = (iPivot < 0 && _hbFlatStep) ? (nItems - 1) / 2 : null;

            const spanRad  = HB_WINDOW * HB_STEP_DEG * Math.PI / 180;
            /* ⚠ L'étendue se calcule sur la BUTÉE en mode carrousel (`n - 1` crans d'un même
               côté), le glissement y amenant la rangée. En mode pointage rien ne bouge :
               la demi-largeur réelle suffit, et s'en tenir à la butée collerait le menu au
               centre de l'écran pour rien. */
            const halfSpan = (_hbNeutral !== null
                                ? ((nItems - 1) / 2) * _hbFlatStep
                                : _hbFlatStep
                                    ? (nItems - 1) * _hbFlatStep
                                    : Math.sin(spanRad) * _hbRadius) + itemSize / 2 + 8;
            ring.style.setProperty('--hb-core', coreW.toFixed(0) + 'px');
            ring.classList.toggle('neutral', _hbNeutral !== null);
            /* Distance de la rangée au bas du libellé. Depuis que les entrées sont toutes
               à la même hauteur, il suffit de dégager la demi-bulle : l'arc obligeait à y
               ajouter l'élévation de l'entrée la plus haute, sans quoi le texte
               chevauchait les bulles du fond. */
            const labelOff = itemSize / 2 + 14;

            /* Recentrage. Horizontalement, sans lui, un tiers de la rangée sortirait de
               l'écran ; verticalement, elle et son libellé passeraient sous la barre de
               statut. Contrairement au cercle, ce déplacement est ici SANS CONSÉQUENCE sur
               la sélection : elle se calcule au déplacement relatif du doigt, pas à sa
               position absolue. */
            /* ⚠ LA ZONE SÛRE DU HAUT ENTRE DANS LA BUTÉE (18/08/2026) — et c'est exactement
               le genre d'écart que le simulateur ne peut PAS montrer : son iframe commence
               SOUS la barre de statut du châssis, donc `top: 0` y est déjà dégagé. Sur
               l'appareil, la WebView s'étend sous la barre de statut et l'encoche : un appui
               long dans la moitié haute de la carte poussait le libellé — la pièce la plus
               haute de tout le menu — derrière elles. Le texte était bien affiché, il n'était
               simplement pas regardable, ce qui revient au même pour l'utilisateur.
               Sonde et non `env()` : cette dernière n'est lisible qu'en CSS. Même technique
               que `getViewportH()`, définie dans js/08 (chargé avant, et appelée ici au
               RUNTIME — le `typeof` n'est qu'un filet).
               `titleH` : les menus à intitulé (« Go ici / Ne pas go » sur une station) ont
               une ligne de plus au-dessus du libellé, elle doit tenir dans le même dégagement,
               sinon c'est elle qui passe sous l'encoche. */
            const safeTop = (typeof getSafeTopPx === 'function') ? getSafeTopPx() : 0;
            const titleH  = opts.title ? 46 : 0;
            const px = _hbFit(x, halfSpan, vw - halfSpan);
            const py = _hbFit(y, safeTop + lift + labelOff + titleH + 44 + 10, vh - 16);
            ring.style.transform = `translate(${px}px, ${py - lift}px)`;
            ring.style.setProperty('--hb-item', itemSize.toFixed(0) + 'px');
            ring.style.setProperty('--hb-label-off', labelOff.toFixed(0) + 'px');
            ring.style.setProperty('--hb-title-off', (labelOff + 46).toFixed(0) + 'px');
            // Le voile s'éclaircit sous le DOIGT, pas au sommet de l'arc : c'est là que
            // l'utilisateur regarde la carte pour savoir où il vient d'appuyer.
            box.style.setProperty('--hb-x', px + 'px');
            box.style.setProperty('--hb-y', py + 'px');

            const titleEl = document.getElementById('hotbox-title');
            if (titleEl) {
                titleEl.textContent = opts.title || '';
                titleEl.classList.toggle('visible', !!opts.title);
            }

            // Purge des entrées du tour précédent (l'intitulé et le libellé sont conservés)
            ring.querySelectorAll('.hotbox-item').forEach(n => n.remove());
            _hbNodes = [];
            _hbItems.forEach((it, i) => {
                const node = document.createElement('div');
                node.className = 'hotbox-item'
                    + ((it.on && _hbResolve(it.on)) ? ' on' : '')
                    + (it.cls ? ' ' + it.cls : '');
                /* ⚠ L'emoji est ENVELOPPÉ dans `.hb-ico`, jamais posé nu dans la bulle :
                   c'est ce span qui porte le filtre de blanchiment. Appliqué à la bulle,
                   il emporterait aussi son fond et sa bordure (un filtre CSS agit sur tout
                   le sous-arbre) et la pastille virerait au blanc.
                   Les entrées à `html` (glyphes 3D/2D, GO/NON) n'en ont pas besoin : ce
                   sont des caractères, ils suivent déjà `color`. */
                node.innerHTML = it.html ? _hbResolve(it.html)
                                         : '<span class="hb-ico">' + _hbResolve(it.icon) + '</span>';
                node.style.animationDelay = (i * 14) + 'ms';
                ring.appendChild(node);
                _hbNodes.push(node);
            });

            /* ═══ OUVERTURE AU MILIEU, SUR L'ENTRÉE `pivot` ═══
               Ni l'entrée 0, ni le milieu arithmétique : l'entrée que le catalogue désigne
               explicitement (la loupe, ou ❌ pendant l'aperçu de trajet). Deux bénéfices
               d'un seul réglage — l'action la plus probable est à ZÉRO geste, et tout le
               reste est à portée de part et d'autre, ce qui divise par deux la course
               maximale du pouce et met les deux sens à égalité. Ouvrir sur l'entrée 0
               obligeait à un long glissement toujours dans le même sens, confortable d'une
               main et pas de l'autre.
               Le repli sur le milieu arithmétique ne sert que si aucun `pivot` ne survit au
               filtrage : mieux vaut un arc équilibré qu'un arc collé à sa butée. */
            _hbPos = _hbNeutral !== null ? _hbNeutral
                   : iPivot >= 0        ? iPivot
                                        : Math.floor((nItems - 1) / 2);
            /* ⚠ LES DRAPEAUX D'ÉTAT SE REMETTENT À ZÉRO AVANT LA MISE EN PAGE, pas après.
               `_hbLayout()` appelle `_hbUpdateLabel()`, qui lit `_hbAbort` pour décider
               d'afficher ou non le nom de l'entrée centrée : posés après, ces drapeaux
               laissaient la toute première mise en page se faire avec l'état de la session
               PRÉCÉDENTE. Une hotbox refermée en position d'abandon rouvrait donc sans
               libellé, jusqu'au premier glissement de doigt qui recalculait tout. */
            _hbOpen = true; _hbSticky = false; _hbHover = -1; _hbAbort = false;
            _hbOpenedAt = Date.now();
            _hbLayout();
            _hbHidePress();   // l'arc prend le relais de l'anneau de progression
            /* pos: _hbPos et non 0 — la saisie doit repartir du pivot, sinon le premier
               glissement ramènerait brutalement le carrousel sur sa première entrée.
               lx/ly : dernière position vue, pour distinguer un balayage d'une descente.
               refY : origine MOBILE de la mesure d'abandon (voir _hbOnMove). */
            _hbGrab = { x, y, pos: _hbPos, lx: x, ly: y, refY: y };
            // Rien n'est armé tant que le doigt n'a pas glissé : relâcher ici referme.
            _hbMoveGate = true;
            box.classList.add('open');
            box.setAttribute('aria-hidden', 'false');
            /* ⚠ LE LIBELLÉ SE REPOSE ICI, UNE FOIS LA BOÎTE RÉELLEMENT AFFICHÉE (18/08/2026).
               `_hbLayout()` ci-dessus l'a déjà écrit, mais `#hotbox` était alors encore en
               `display: none` : l'élément n'était pas rendu, et un `.visible` posé sur un
               élément non rendu ne peut pas démarrer sa transition d'opacité — selon le
               moteur, il apparaît instantanément (bureau) ou reste à 0 jusqu'au prochain
               changement de style (le premier glissement de doigt). D'où un nom d'entrée
               présent au simulateur et absent sur l'appareil, pour un code identique.
               Le `force` sépare retrait et remise par une lecture de layout : c'est le même
               remède que pour l'anneau `#hb-press`, dont le second appui long restait sans
               animation faute de ce reflow intercalé. */
            _hbUpdateLabel(true);
            _hbSetHover(-1);
            _hbVibrate(HB_HAPTIC_OPEN);

            // Sans ça, le glissement vers une entrée ferait aussi défiler la carte —
            // et déclencherait isUserPanning via map.on('dragstart').
            tenterSansBruit(() => { map.dragPan.disable(); map.dragRotate.disable(); map.touchZoomRotate.disable(); }, 'hotbox/gestesOff');

            /* Le geste vient d'être exécuté : l'invite a fait son office, et elle enseigne
               désormais AUSSI la fermeture — la refermer ici ne prive donc plus de rien
               celui qui ne sait pas encore ressortir du menu, puisqu'il vient de lire les
               deux lignes. C'est cette bulle unique qui a permis de supprimer le second
               `dismiss…(false)` qui traînait ici pour l'invite de fermeture. */
            dismissHotboxHint(true);
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
            _hbMoveGate = false; _hbGrab = null; _hbAbort = false; _hbNeutral = null;
            if (_hbLayoutRaf) { cancelAnimationFrame(_hbLayoutRaf); _hbLayoutRaf = 0; }
            const box = document.getElementById('hotbox');
            if (box) { box.classList.remove('open'); box.setAttribute('aria-hidden', 'true'); }
            /* ⚠ Remise au repos ICI, pas à la réouverture. `_hbSetHover(-1)` sort
               immédiatement quand `_hbHover` vaut déjà -1 : appelé à l'ouverture il ne
               nettoierait rien, et le libellé de la dernière entrée choisie resterait
               affiché au tour suivant. Même piège pour l'état d'abandon. */
            const _lbl = document.getElementById('hotbox-label');
            if (_lbl) _lbl.classList.remove('visible');
            document.getElementById('hotbox-ring')?.classList.remove('armed', 'aborting', 'neutral');
            document.getElementById('hotbox-core')?.classList.remove('dim');
            document.getElementById('hotbox-title')?.classList.remove('visible');
            tenterSansBruit(() => { map.dragPan.enable(); map.dragRotate.enable(); map.touchZoomRotate.enable(); }, 'hotbox/gestesOn');
            window.removeEventListener('pointermove', _hbOnMove);
            window.removeEventListener('pointerup', _hbOnUp);
            window.removeEventListener('pointercancel', _hbOnCancel);
            window.removeEventListener('pointerdown', _hbOnDownWhileOpen, true);
        }

        /* `idx` = entrée ARMÉE (celle que le relâchement lancerait), -1 si aucune.
           À ne pas confondre avec l'entrée au premier plan : à l'ouverture et pendant un
           abandon, une entrée est bien au centre de l'arc sans être armée pour autant. */
        function _hbSetHover(idx) {
            if (idx === _hbHover) return;
            _hbHover = idx;
            _hbNodes.forEach((n, i) => n.classList.toggle('hover', i === idx));
            // Le halo du centre ne s'allume qu'une fois quelque chose réellement armé :
            // c'est ce qui distingue « une entrée est devant moi » de « elle partira si
            // je relâche », toute la sécurité de l'annulation par simple relâchement.
            document.getElementById('hotbox-ring')?.classList.toggle('armed', idx >= 0);
            /* Pointage SEULEMENT : pas de bulle "centrée" à nommer par défaut, donc le nom
               reste piloté par l'armement ici. En carrousel c'est _hbUpdateLabel() (appelée
               depuis _hbLayout) qui décide, en continu et indépendamment de l'armement —
               ne plus toucher au label ici pour ce cas, les deux se disputeraient l'élément. */
            if (_hbNeutral !== null) {
                const label = document.getElementById('hotbox-label');
                if (label) {
                    if (idx >= 0) {
                        label.textContent = _hbResolve(_hbItems[idx].label);
                        label.classList.add('visible');
                    } else {
                        label.classList.remove('visible');
                    }
                }
            }
            /* Le noyau ✕ s'estompe dès qu'une bulle est visée : il reste visible — c'est
               là qu'on revient pour ne rien choisir — mais cesse de disputer l'attention
               à ce qui va réellement se lancer. */
            document.getElementById('hotbox-core')?.classList.toggle('dim', idx >= 0);
            // En pointage, la taille de la bulle visée est calculée par _hbLayout().
            if (_hbNeutral !== null) _hbRequestLayout();
            if (idx >= 0) _hbVibrate(HB_HAPTIC_HOVER);
        }

        /* Un seul axe compte : l'horizontal fait tourner le carrousel, le vertical ne sert
           qu'à battre en retraite. Le déplacement est mesuré depuis le POINT DE SAISIE, et
           la position du doigt à l'écran n'entre jamais dans le calcul — c'est pourquoi le
           recentrage de l'arc près d'un bord ne peut plus armer une entrée par surprise.
           Sens : glisser vers la GAUCHE fait défiler la bande vers la gauche et amène donc
           les entrées suivantes au centre, comme on pousse une pellicule. */
        function _hbOnMove(e) {
            if (!_hbOpen || !_hbGrab) return;
            const dx = e.clientX - _hbGrab.x, dy = e.clientY - _hbGrab.y;
            if (_hbMoveGate) {
                if (Math.hypot(dx, dy) <= HOTBOX_MOVE_TOL) return;
                _hbMoveGate = false;
            }
            /* ═══ DEUX MODÈLES DE SÉLECTION ═══ voir `_hbNeutral`.
               ⚠ LES SIGNES SONT OPPOSÉS, ET C'EST VOULU. Au carrousel on POUSSE la
               pellicule : glisser à gauche fait venir au centre les entrées de droite,
               d'où le `- dx`. Au pointage on DÉSIGNE : glisser à droite vise la bulle de
               droite, d'où le `+ off`. Aligner les deux formules « pour faire propre »
               casserait l'un des deux gestes. */
            let cible;
            if (_hbNeutral !== null) {
                const off = dx / _hbDragPx;
                cible = (Math.abs(off) < HB_NEUTRAL_TOL) ? -1
                      : Math.max(0, Math.min(_hbItems.length - 1, Math.round(_hbNeutral + off)));
            } else {
                _hbPos = _hbClampPos(_hbGrab.pos - dx / _hbDragPx);
                cible = Math.round(_hbPos);
            }

            /* ═══ ABANDON : « LE DOIGT DESCEND », PAS « LE DOIGT EST BAS » ═══
               ⚠ Ce test comparait `e.clientY - _hbGrab.y` au seuil, et se déclenchait
               TOUT SEUL au bout de quelques allers-retours (reproduit en Chrome :
               6 passes, 72 px de dérive, position d'abandon posée sans que personne ne
               l'ait demandée — tout le menu passait en gris). La cause n'est pas un
               réglage trop bas : **un pouce qui balaie à l'horizontale pivote autour de sa
               base**, il décrit un arc et descend réellement à chaque passe. Relever le
               seuil n'aurait fait que retarder l'accident.
               La descente se mesure donc depuis `refY`, une référence MOBILE qui suit la
               dérive : à chaque événement où le déplacement est à dominante HORIZONTALE
               (`|Δx| > Δy`, signature du balayage), la référence encaisse tout le Δy et
               le compteur d'abandon revient à zéro. Une descente franche, elle, est
               verticale-dominante : rien ne l'absorbe et elle atteint le seuil. */
            /* ⚠⚠ LA RÈGLE EST SYMÉTRIQUE — deux versions s'y sont cassé les dents.
               v1 : `dy` mesuré depuis le point de saisie → la dérive d'un pouce qui balaie
                    s'accumulait et déclenchait l'abandon toute seule (6 passes, 72 px).
               v2 : référence absorbant la dérive vers le bas, ET suivant le doigt vers le
                    haut SANS CONDITION → monter le pouce au-dessus des bulles descendait la
                    référence d'autant, si bien que **revenir à sa position de départ se
                    lisait comme une descente franche** et regrisait tout. Une asymétrie
                    corrigée par une autre asymétrie.
               v3, celle-ci : la référence absorbe le déplacement vertical **qui accompagne
                    un balayage horizontal**, dans les DEUX sens (`|Δx| > |Δy|`, signature
                    du pouce qui pivote) ; un mouvement purement vertical n'est jamais
                    absorbé, dans aucun sens. Monter puis redescendre ramène donc l'écart
                    exactement à zéro, tandis qu'une descente délibérée l'accumule. */
            const mdx = Math.abs(e.clientX - _hbGrab.lx), mdy = e.clientY - _hbGrab.ly;
            if (mdx > Math.abs(mdy)) _hbGrab.refY += mdy;
            _hbGrab.lx = e.clientX; _hbGrab.ly = e.clientY;
            _hbAbort = (e.clientY - _hbGrab.refY) > HB_ABORT_DY;

            document.getElementById('hotbox-ring')?.classList.toggle('aborting', _hbAbort);
            _hbRequestLayout();
            _hbSetHover(_hbAbort ? -1 : cible);
        }

        function _hbOnDownWhileOpen(e) {
            if (!_hbOpen) return;
            // Menu épinglé : une nouvelle pression sert à viser, le relâchement valide.
            e.preventDefault(); e.stopPropagation();
            _hbPointerId = e.pointerId;
            _hbOpenedAt = Date.now();
            /* La saisie REPART de la position courante du carrousel : sans cela, reposer
               le doigt ramènerait l'arc à son point de départ et annulerait le défilement
               déjà fait au tour précédent. */
            _hbGrab = { x: e.clientX, y: e.clientY, pos: _hbPos,
                        lx: e.clientX, ly: e.clientY, refY: e.clientY };
            // Même règle qu'à l'ouverture : reposer le doigt n'arme rien, il faut glisser.
            _hbMoveGate = true;
            _hbAbort = false;
            document.getElementById('hotbox-ring')?.classList.remove('aborting');
            _hbSetHover(-1);
        }

        function _hbOnUp(e) {
            if (!_hbOpen) return;
            const held = Date.now() - _hbOpenedAt;
            const aborted = _hbAbort;
            /* Le doigt est parti : plus aucun `pointermove` ne doit faire tourner le
               carrousel. Sans ce retrait, un menu épinglé continuerait de défiler sous un
               simple survol de souris (poste de dev, simulateur) alors qu'on ne touche
               plus rien. */
            _hbGrab = null;
            // Relâché en position d'abandon : on referme, sans épingler ni rien lancer.
            if (aborted) { closeHotbox({ haptic: true }); return; }
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

        /* ⚠ PLUS D'ÉTAPE 2 — `showHotboxCloseHint` / `dismissHotboxCloseHint` et la clé
           `gps_hotbox_close_hint` ont été SUPPRIMÉES le 18/08/2026, pas simplement mises en
           sommeil. Le geste de fermeture est désormais expliqué dans la même bulle que celui
           d'ouverture (voir #hotbox-hint dans index.html).
           Motif : les deux moitiés d'un même geste étaient enseignées à deux moments
           différents, et l'étape 2 n'arrivait qu'APRÈS une première fermeture — c'est-à-dire
           après le moment où elle aurait servi. Qui refermait la hotbox à tâtons du premier
           coup ne recevait jamais l'explication au moment utile ; qui n'y arrivait pas
           devait fermer d'abord pour apprendre à fermer.
           Ne pas la rétablir « pour ne pas surcharger la bulle » : les deux lignes tiennent
           dans les 330 px de large de la bulle, mesuré. */

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
            /* Une seule condition depuis la fusion des deux étapes (18/08/2026) : la
               branche `else if` qui enchaînait sur l'invite de fermeture a disparu avec
               elle. ⚠ Conséquence pour les installations existantes : `gps_hotbox_hint`
               étant déjà à 'seen' chez qui a ouvert la hotbox une fois, ces profils ne
               reverront JAMAIS l'invite et donc jamais la ligne « Fermer ». C'est assumé —
               ils ont déjà eu l'ancienne étape 2, et remettre la bulle à zéro pour tout le
               monde rouvrirait un tutoriel à des gens qui s'en servent depuis trois jours. */
            if (hotboxEnabled && localStorage.getItem('gps_hotbox_hint') !== 'seen') {
                setTimeout(() => {
                    const el = document.getElementById('hotbox-hint');
                    if (el && hotboxEnabled) el.classList.add('visible');
                }, 2500);
            }
        })();

        // ═══════════════════════════════════════════════════════════════════

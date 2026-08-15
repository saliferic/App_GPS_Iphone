        // === BORNES ÉLECTRIQUES — IRVE (data.gouv.fr) + Open Charge Map ===
        // ═══════════════════════════════════════════════════════════════════

        const EV_CONNECTOR_DEFS = [
            { key: 'ccs',     label: 'CCS',      cls: 'ccs',     color: '#4da3ff' },
            { key: 'chademo', label: 'CHAdeMO',   cls: 'chademo', color: '#f39c12' },
            { key: 'type2',   label: 'Type 2',    cls: 'type2',   color: '#28a745' },
            // Type 3 supprimé : standard obsolète français, quasi inexistant
        ];

        let selectedConnectorType = null; // null = tous
        let _allEVStations = [];
        let evStationMarkers = [];

        async function fetchEVStationsAlongRoute(routeCoords) {
            const segments = buildRouteSegments(routeCoords);
            const seen = new Set(); const merged = [];

            const results = await Promise.all(segments.map(async seg => {
                const batch = [];
                // Source unique : OpenStreetMap via Overpass (amenity=charging_station)
                // 3 mirrors de fallback, pas de clé API, CORS ouvert
                try {
                    const irvePts = await fetchIRVE(seg); // → fetchEVFromOverpass
                    irvePts.forEach(p => { p._source = 'osm'; batch.push(p); });
                } catch(e) { console.warn('[EV] Overpass error:', e.message); }

                return batch;
            }));

            for (const batch of results) for (const s of batch) {
                const key = `${(s.latitude||'').toString().slice(0,8)},${(s.longitude||'').toString().slice(0,8)}`;
                if (!seen.has(key)) { seen.add(key); merged.push(s); }
            }
            console.log(`[EV] ${merged.length} bornes récupérées`);
            return merged;
        }

        // === Remplacement de fetchIRVE + fetchOCM (APIs mortes/CORS bloqué) ===
        // Nouvelle source unique : OpenStreetMap via Overpass (même pattern que les stations carburant)
        // 3 mirrors de fallback, POST, pas de clé API, CORS ouvert
        async function fetchIRVE(seg) {
            return fetchEVFromOverpass(seg);
        }
        async function fetchOCM(seg) {
            return []; // plus utilisé, Overpass couvre déjà tout
        }

        async function fetchEVFromOverpass(seg) {
            const bbox  = `${seg.minLat.toFixed(4)},${seg.minLng.toFixed(4)},${seg.maxLat.toFixed(4)},${seg.maxLng.toFixed(4)}`;
            const query = `[out:json][timeout:15];(node["amenity"="charging_station"](${bbox});way["amenity"="charging_station"](${bbox}););out center body;`;
            const mirrors = [
                'https://overpass.private.coffee/api/interpreter',
                'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
                'https://overpass.kumi.systems/api/interpreter',
                'https://overpass.openstreetmap.ru/cgi/interpreter',
            ];
            for (const url of mirrors) {
                try {
                    const res = await fetch(url, {
                        method: 'POST',
                        body: 'data=' + encodeURIComponent(query),
                        signal: AbortSignal.timeout(12000),
                    });
                    if (!res.ok) { console.warn(`[EV] ${url.split('/')[2]} → ${res.status}`); continue; }
                    const data = await res.json();
                    const elements = data?.elements || [];
                    const stations = elements.map(el => {
                        const tags = el.tags || {};
                        const lat = el.center?.lat ?? el.lat;
                        const lon = el.center?.lon ?? el.lon;
                        if (!lat || !lon) return null;
                        const powerKw = (() => {
                            const vals = [
                                tags['socket:type2:output'],
                                tags['socket:ccs:output'],
                                tags['socket:chademo:output'],
                                tags['charging:fast:output'],
                            ].map(v => parseFloat(String(v || '').replace(/[^0-9.]/g, '')))
                             .filter(n => n > 0);
                            return vals.length ? Math.max(...vals) : (parseFloat(tags['maxpower'] || tags['power'] || '') || null);
                        })();
                        const nb_pdc = parseInt(tags['capacity'] || tags['socket:type2'] || tags['socket:ccs'] || '1') || 1;
                        const hasSocket = key => { const v = tags[key]; return v && v !== 'no' && v !== '0'; };
                        return {
                            _type: 'osm',
                            latitude:  lat,
                            longitude: lon,
                            name:  tags.name || tags.operator || tags.brand || 'Borne de recharge',
                            addr:  tags['addr:street']
                                ? `${tags['addr:housenumber'] || ''} ${tags['addr:street']}`.trim()
                                : (tags['addr:city'] || tags['addr:town'] || ''),
                            power:  powerKw,
                            nb_pdc: nb_pdc,
                            connectors: {
                                type2:   hasSocket('socket:type2') || hasSocket('socket:type2_combo'),
                                ccs:     hasSocket('socket:ccs') || hasSocket('socket:type2_combo'),
                                chademo: hasSocket('socket:chademo'),
                            }
                        };
                    }).filter(Boolean);
                    console.log(`[EV/Overpass] ${stations.length} bornes via ${url.split('/')[2]}`);
                    return stations;
                } catch(e) {
                    console.warn(`[EV/Overpass] ${url.split('/')[2]} failed:`, e.message);
                }
            }
            console.warn('[EV/Overpass] Tous les mirrors ont échoué');
            return [];
        }

        function parseEVStations(rawStations, routeCoords) {
            const routeLine    = turf.lineString(routeCoords);
            const routeTotalKm = turf.length(routeLine, { units: 'kilometers' });
            // Marge élargie : couvre les bornes près du départ/arrivée (snapping imprécis)
            const MARGIN_KM    = 5;
            const results = [];

            rawStations.forEach(s => {
                const lat = parseFloat(s.latitude);
                const lng = parseFloat(s.longitude);
                if (isNaN(lat) || isNaN(lng)) return;

                const pt      = turf.point([lng, lat]);
                const snapped = turf.nearestPointOnLine(routeLine, pt, { units: 'kilometers' });
                const distToRoute = snapped.properties.dist;
                // Distance max au trajet : 2 km en ville (<30 km), 3 km sinon
                // Volontairement strict : on préfère moins de bornes mais pertinentes
                const maxDist = routeTotalKm < 30 ? 2 : 3;
                if (distToRoute > maxDist) return;

                const loc = snapped.properties.location;
                if (loc < -MARGIN_KM || loc > routeTotalKm + MARGIN_KM) return;

                results.push({
                    lng, lat,
                    name:     s.name,
                    addr:     s.addr || '',
                    power:    s.power,
                    nb_pdc:   s.nb_pdc || 1,
                    connectors: s.connectors || {},
                    _source:  s._source,
                    distToRoute:   Math.round(distToRoute * 1000),
                    distAlongRoute: Math.max(0, Math.min(loc, routeTotalKm)),
                });
            });

            console.log(`[EV] ${results.length} bornes valides après filtrage géo`);
            return results;
        }

        function clearEVStationMarkers() {
            _evMarkerEls.forEach(m => m.marker.remove());
            _evMarkerEls = [];
            _evStationsGeoData = [];
            evStationMarkers = [];
        }

        // `power` sert à afficher « ⚡ 50 kW » sur la pastille, comme dans le scan
        // « autour de moi » : sans lui le marqueur ne dirait que ⚡.
        function addEVStationMarker(lng, lat, isSelected, power) {
            _evStationsGeoData.push({ lng, lat, power });
        }

        /* ⚠ NE PAS redéfinir _flushEVMarkers ici.
           Une seconde déclaration vivait à cet endroit — vestige de l'approche par
           couche GeoJSON abandonnée — et **écrasait silencieusement** la version
           fonctionnelle définie plus haut (marqueurs DOM ⚡), les déclarations de
           fonctions de même portée étant résolues à la dernière. Elle appelait
           `_ensureGasLayers()` (devenu un stub vide) puis cherchait une source
           inexistante et sortait : `renderEVCards()` l'appelait bien, mais AUCUNE
           borne n'apparaissait sur la carte en véhicule électrique. */

        function buildEVConnectorSelector(stations) {
            const box = document.getElementById('gas-fuel-selector');
            if (!box) return;
            box.innerHTML = '';

            const available = EV_CONNECTOR_DEFS.filter(d =>
                stations.some(s => s.connectors?.[d.key])
            );
            if (available.length === 0) return;

            // Bouton "Tous"
            const allBtn = document.createElement('button');
            allBtn.className = 'gas-fuel-btn' + (!selectedConnectorType ? ' active' : '');
            allBtn.style.borderColor = 'rgba(255,255,255,0.2)';
            allBtn.textContent = 'Tous';
            allBtn.onclick = () => setConnectorFilter(null);
            box.appendChild(allBtn);

            available.forEach(d => {
                const btn = document.createElement('button');
                btn.className = `gas-fuel-btn${selectedConnectorType === d.key ? ' active' : ''}`;
                btn.dataset.connector = d.key;
                btn.textContent = d.label;
                btn.style.setProperty('--ev-color', d.color);
                btn.onclick = () => {
                    if (btn.classList.contains('active') && selectedConnectorType === d.key) {
                        setConnectorFilter(null);
                    } else {
                        setConnectorFilter(d.key);
                    }
                };
                box.appendChild(btn);
            });
        }

        function setConnectorFilter(connType) {
            selectedConnectorType = connType;
            document.querySelectorAll('#gas-fuel-selector .gas-fuel-btn').forEach(b => {
                b.classList.toggle('active',
                    connType === null ? b.textContent === 'Tous' : b.dataset.connector === connType
                );
            });
            const filtered = connType
                ? _allEVStations.filter(s => s.connectors?.[connType])
                : _allEVStations;
            // Dédoublonnage par cluster 300m sur le résultat filtré
            const CLUSTER_KM_F = 0.3;
            const dedupedF = [];
            const seenF = [];
            for (const s of filtered) {
                const pt = turf.point([s.lng, s.lat]);
                const tooClose = seenF.some(c =>
                    turf.distance(pt, turf.point([c.lng, c.lat]), { units: 'kilometers' }) < CLUSTER_KM_F
                );
                if (!tooClose) { dedupedF.push(s); seenF.push(s); }
            }
            renderEVCards(dedupedF.slice(0, 5));
        }

        function renderEVCards(stations) {
            const list = document.getElementById('gas-stations-list');
            list.innerHTML = '';
            clearEVStationMarkers();

            if (!stations || stations.length === 0) {
                list.innerHTML = `<div style="font-size:12px;color:#4a5568;text-align:center;padding:8px 0;">Aucune borne compatible sur le trajet.</div>`;
                return;
            }

            stations.forEach((s, i) => {
                s._idx = i;
                const card = document.createElement('div');
                card.className = 'gas-station-card';
                card.id = `gas-card-${i}`;

                // Puissance
                const powerStr = s.power ? `${s.power} kW` : 'kW ?';
                // Connecteurs disponibles
                const connIcons = EV_CONNECTOR_DEFS
                    .filter(d => s.connectors?.[d.key])
                    .map(d => {
                        const col = d.key === 'chademo' ? '#f39c12' : d.key === 'ccs' ? '#4da3ff' : '#28a745';
                        return `<span style="font-size:9px;padding:2px 5px;border-radius:8px;background:${col}18;border:1px solid ${col}55;color:${col};">${d.label}</span>`;
                    })
                    .join(' ');
                // Nb points de charge
                const pdcStr = s.nb_pdc > 1 ? `${s.nb_pdc} pts` : '1 pt';

                card.innerHTML = `
                    <div class="gas-selected-dot"></div>
                    <div class="gas-card-icon">⚡</div>
                    <div class="gas-card-info">
                        <div class="gas-card-name">${s.name === "Borne de recharge" && s.addr ? s.addr : s.name}</div>
                        <div class="gas-card-addr">${s.name === "Borne de recharge" ? "" : (s.addr || "—")}</div>
                        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">${connIcons}</div>
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
                        <span class="gas-price-pill" style="background:rgba(77,163,255,0.12);color:#4da3ff;border:1px solid rgba(77,163,255,0.35);font-size:11px;padding:3px 7px;border-radius:8px;font-weight:700;">${powerStr}</span>
                        <span style="font-size:10px;color:#6b7785;">${pdcStr}</span>
                        <div class="gas-card-dist" id="gas-detour-${i}" style="color:#8892b0;font-size:11px;">+… min</div>
                    </div>`;

                if (selectedGasStation && selectedGasStation.lng === s.lng && selectedGasStation.lat === s.lat)
                    card.classList.add('selected');

                card.addEventListener('click', () => selectGasStation(s));
                list.appendChild(card);
                addEVStationMarker(s.lng, s.lat, selectedGasStation?.lng === s.lng && selectedGasStation?.lat === s.lat, s.power);
            });
            _flushEVMarkers(); // rendu GPU en une seule passe

            // Calculer les détours OSRM
            if (modalStartCoords && modalEndCoords) {
                const baseDurationSec = _baseRouteForGas
                    ? _baseRouteForGas.durationH * 3600
                    : modalPendingRoute?.osrmData?.routes?.[0]?.duration;
                if (baseDurationSec) {
                    stations.forEach(async (s, i) => {
                        try {
                            const [snLng, snLat] = await snapToRoad(s.lng, s.lat);
                            const url = `https://router.project-osrm.org/route/v1/driving/${modalStartCoords[0]},${modalStartCoords[1]};${snLng},${snLat};${modalEndCoords[0]},${modalEndCoords[1]}?overview=false`;
                            const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
                            const data = await resp.json();
                            if (data.routes?.[0]) {
                                const detourSec = data.routes[0].duration - baseDurationSec;
                                s._deltaMin = detourSec / 60;
                                const el = document.getElementById(`gas-detour-${i}`);
                                if (el) el.textContent = detourSec > 0 ? `+${Math.round(detourSec / 60)} min` : 'Sur le trajet';
                            }
                        } catch (e) { if (DEBUG) console.warn("[renderEVCards] exception ignorée :", e); }
                    });
                }
            }
        }

        function buildEVStationsUI(stations) {
            const loading = document.getElementById('gas-stations-loading');
            loading.style.display = 'none';
            _allEVStations = stations || [];

            if (_allEVStations.length === 0) {
                clearEVStationMarkers();
                document.getElementById('gas-stations-list').innerHTML =
                    `<div style="font-size:12px;color:#4a5568;text-align:center;padding:8px 0;">Aucune borne de recharge trouvée sur ce trajet.</div>`;
                return;
            }

            selectedConnectorType = null;
            // Trier par position le long du trajet (départ → arrivée)
            // puis par distance au trajet pour départager
            _allEVStations.sort((a, b) =>
                (a.distAlongRoute - b.distAlongRoute) || (a.distToRoute - b.distToRoute)
            );
            // Dédoublonnage par zone : une seule borne représentante par cluster de 300m
            // (évite d'afficher 5 bornes du même parking en premier)
            const CLUSTER_KM = 0.3;
            const dedupedStations = [];
            const clusterSeen = [];
            for (const s of _allEVStations) {
                const pt = turf.point([s.lng, s.lat]);
                const tooClose = clusterSeen.some(c =>
                    turf.distance(pt, turf.point([c.lng, c.lat]), { units: 'kilometers' }) < CLUSTER_KM
                );
                if (!tooClose) {
                    dedupedStations.push(s);
                    clusterSeen.push(s);
                }
            }
            buildEVConnectorSelector(_allEVStations);
            renderEVCards(dedupedStations.slice(0, 5));
        }

        // ── Bannière "5 min avant la station" ──
        function checkGasStationApproach(remainingTimeHours) {
            if (!gasStopWaypoint || gasStationAlertFired || !isCourseStarted) return;
            const remainingMin = remainingTimeHours * 60;
            // On calcule combien de temps avant la station (pas avant l'arrivée)
            // Estimation : distance driver → station via le tracé
            if (drivers.length === 0 || !currentTurfLine) return;
            const driverPos = drivers[0].marker ? drivers[0].marker.getLngLat() : null;
            if (!driverPos) return;
            const ptDriver = turf.point([driverPos.lng, driverPos.lat]);
            const ptStation = turf.point([gasStopWaypoint[0], gasStopWaypoint[1]]);
            const snappedDriver  = turf.nearestPointOnLine(currentTurfLine, ptDriver,  { units: 'kilometers' });
            const snappedStation = turf.nearestPointOnLine(currentTurfLine, ptStation, { units: 'kilometers' });
            const distToStation = snappedStation.properties.location - snappedDriver.properties.location;
            if (distToStation < 0) { gasStationAlertFired = true; return; } // déjà dépassée
            const speed = drivers[0].actualSpeed > 5 ? drivers[0].actualSpeed : 60;
            const minsToStation = (distToStation / speed) * 60;
            if (minsToStation <= 5 && minsToStation >= 0) {
                showGasStationBanner(minsToStation);
                gasStationAlertFired = true;
            }
        }

        function showGasStationBanner(minutesLeft) {
            const banner = document.getElementById('gas-station-banner');
            const msg    = document.getElementById('gas-banner-msg');
            if (!banner) return;
            const minText = minutesLeft < 1 ? 'moins d\'1 min' : `environ ${Math.round(minutesLeft)} min`;
            msg.textContent = `Votre station est dans ${minText} — préparez-vous à vous arrêter.`;
            banner.classList.add('visible');
        }

        function closeGasStationBanner() {
            document.getElementById('gas-station-banner')?.classList.remove('visible');
        }

        // ── Détection d'arrivée à une étape intermédiaire (navWaypoints) ──
        function checkNavWaypointArrival() {
            if (!navWaypoints.length || !isCourseStarted || drivers.length === 0) return;
            const driverPos = drivers[0].marker ? drivers[0].marker.getLngLat() : null;
            if (!driverPos) return;

            const REACHED_M = 80; // seuil : 80m de l'étape → atteinte
            const next = navWaypoints[0];
            const dist = turf.distance(
                turf.point([driverPos.lng, driverPos.lat]),
                turf.point(next.coords),
                { units: 'meters' }
            );

            if (dist <= REACHED_M) {
                // Étape atteinte — la retirer de la liste
                navWaypoints.shift();
                console.log(`[NavWP] Étape atteinte : ${next.label}. Restantes : ${navWaypoints.length}`);

                // Annoncer vocalement (fichier optionnel — ne pas casser si absent)
                try { if (typeof playAudioSequence === 'function') playAudioSequence(['reached_waypoint.ogg']); } catch (e) { if (DEBUG) console.warn("[checkNavWaypointArrival] exception ignorée :", e); }

                // Recalculer vers la prochaine étape / destination
                // (en trajet libre sans exactEndCoords, recalculateRoute gère le cas navWaypoints restants)
                const hasMoreToGo = exactEndCoords || navWaypoints.length > 0;
                if (hasMoreToGo) {
                    recalculateRoute(driverPos.lng, driverPos.lat);
                } else {
                    // Trajet libre : dernier arrêt atteint, on repasse en mode "libre pur"
                    currentTurfLine = null;
                    fullRouteLine = null;
                    clearRouteLine();
                    document.getElementById('status').innerText = "Trajet libre en cours ! Roulez pour marquer des points 🧭";
                    document.getElementById('status').style.color = "#20c997";
                }
            }

            // Mettre à jour le badge étape
            updateNavWaypointBadge();
        }

        function updateNavWaypointBadge() {
            const badge = document.getElementById('nav-waypoint-badge');
            if (!badge) return;
            if (!navWaypoints.length || !isCourseStarted) {
                badge.classList.remove('visible');
                return;
            }
            badge.textContent = `📍 Étape : ${navWaypoints[0].label}`;
            badge.classList.add('visible');
        }

        function validateAndLaunchTrip() {
            if (!modalPendingRoute) return;
            const { osrmData, startCoords, endCoords, waypoints, waypointLabels, avoidTolls } = modalPendingRoute;

            // Mémoriser le waypoint station choisi (null si "pas de stop")
            gasStopWaypoint = selectedGasStation ? [selectedGasStation.lng, selectedGasStation.lat] : null;
            gasStationAlertFired = false;
            resetZFEForTrip();

            // Initialiser les étapes de navigation (hors station essence)
            navWaypoints = (waypoints || []).map((coords, i) => ({
                coords,
                label: (waypointLabels || [])[i] || `Étape ${i + 1}`
            }));

            clearAltRoutes();
            clearGasStationMarkers();
            resetModalWaypoints();
            closeTripModal();
            startCourse(modalMode, { osrmData, startCoords, endCoords, avoidTolls });
        }

        async function recalculateRoute(lng, lat) {
            // En trajet libre, exactEndCoords est null.
            // Si des étapes sont en attente, la "destination effective" est la première étape.
            // Sinon, si toujours pas de destination, rien à recalculer.
            const effectiveEnd = exactEndCoords
                || (navWaypoints.length > 0 ? navWaypoints[0].coords : null);
            if (isRecalculating || !effectiveEnd) return;
            if (!navigator.onLine) {
                console.log('[Offline] Recalcul ignoré — hors ligne, dead reckoning actif');
                return;
            }
            isRecalculating = true;
            document.getElementById('status').innerText = "🔄 Recalcul..."; document.getElementById('status').style.color = "#f39c12";
            try {
                // Étapes restantes : si exactEndCoords existe, tous les navWaypoints sont des étapes intermédiaires.
                // Si exactEndCoords est null (trajet libre), le premier navWaypoint est la destination finale,
                // les suivants sont des étapes intermédiaires vers lui.
                let remainingWpCoords, destination;
                if (exactEndCoords) {
                    remainingWpCoords = navWaypoints.map(w => w.coords);
                    destination = exactEndCoords;
                } else {
                    // Trajet libre avec arrêts : aller au premier, puis aux suivants
                    remainingWpCoords = navWaypoints.slice(1).map(w => w.coords);
                    destination = navWaypoints[0].coords;
                }
                const osrmData = await fetchRouteMapbox([lng, lat], destination, currentAvoidTolls, true, remainingWpCoords);
                if (osrmData.code === "Ok") {
                    const geojsonRoute = osrmData.routes[0].geometry;
                    setRouteLine(geojsonRoute.coordinates);
                    currentTurfLine = turf.lineString(geojsonRoute.coordinates);
                    fullRouteLine = turf.lineString(geojsonRoute.coordinates);
                    const r0 = osrmData.routes[0];
                    routeTotalDistKm = r0.legs && r0.legs.length > 1
                        ? r0.legs.reduce((s, l) => s + l.distance, 0) / 1000
                        : r0.distance / 1000;
                    routeTotalDurationHours = r0.legs && r0.legs.length > 1
                        ? r0.legs.reduce((s, l) => s + l.duration, 0) / 3600
                        : r0.duration / 3600;
                    buildRouteSteps(osrmData);
                    buildMaxspeedAnnotations(osrmData);
                    updateGL3DRoute();
                    // Réinitialiser toutes les annonces vocales pour le nouvel itinéraire
                    // sans quoi les seuils déjà "annoncés" de l'ancien trajet bloquent la nouvelle guidance
                    announcedThresholds = {};
                    currentStepIndex = 0;

                    // ── EN SIMULATION : reconstruire l'état mutable et repartir du début de la nouvelle ligne ──
                    if (isSimulationMode && simState) {
                        const newLine = turf.lineString(geojsonRoute.coordinates);
                        const newDistanceKm = routeTotalDistKm;
                        const newDurationHours = routeTotalDurationHours;
                        simState.line = newLine;
                        simState.distanceKm = newDistanceKm;
                        simState.totalDurationHours = newDurationHours;
                        // Recalculer timeScale : durée sim fixe (~24 unités) mais adaptée à la nouvelle durée
                        const newDurationSec = newDurationHours * 3600;
                        simState.timeScale = newDurationSec / 24;
                        // La nouvelle route part de la position actuelle du véhicule → d.dist repart de 0
                        drivers.forEach(d => { if (!d.finished) d.dist = 0; });
                    }

                    document.getElementById('status').innerText = "✅ Itinéraire mis à jour !";
                }
            } catch (e) {
                console.error("Erreur de recalcul :", e);
                // On garde l'itinéraire précédent affiché : pas d'interruption de la navigation en cours.
                document.getElementById('status').innerText = "⚠️ Recalcul impossible (réseau) — itinéraire conservé.";
                document.getElementById('status').style.color = "#ff6b6b";
            }
            // Délai raccourci (juste le temps d'afficher le message de statut) : on ne veut pas bloquer
            // un éventuel nouveau recalcul plus longtemps que nécessaire si on est encore hors itinéraire.
            setTimeout(() => { 
                isRecalculating = false; 
                if(isCourseStarted) {
                    document.getElementById('status').innerText = isSimulationMode ? "Simulation Salif en cours 🚗" : "Course réelle démarrée ! Déplacez-vous 🚗"; 
                    document.getElementById('status').style.color = isSimulationMode ? "#8e44ad" : "#f39c12";
                }
            }, 1200);
        }

        function stopCourse() {
            // Fermer l'overlay objectifs/profil s'il est ouvert
            const _overlayEl = document.getElementById('nav-panel-overlay');
            if (_overlayEl && _overlayEl.classList.contains('open')) {
                _overlayEl.classList.remove('open');
                document.getElementById('nav-panel-overlay-backdrop')?.classList.remove('open');
                _overlayEl.style.display = 'none';
                _navOverlayRestoreContent();
            }
            const genuinelyArrived = drivers.length > 0 && !!drivers[0].finished; // capturé avant d'être écrasé ci-dessous
            isCourseStarted = false; lastKnownBearing = 0; currentVisualBearing = 0;
            // Masquer le toast hors ligne navigation
            const _offlineToast = document.getElementById('offline-nav-toast');
            if (_offlineToast) _offlineToast.classList.remove('visible');
            resetTenMin();
            // Arrêter le live share si actif
            if (liveShareActive) {
                _lsStop();
                const btn = document.getElementById('nav-btn-liveshare');
                if (btn) btn.classList.remove('sharing');
            }
            currentSpeedLimitKmh = null; lastSpeedLimitFetchTime = 0; lastSpeedLimitCoords = null;
            _speedLimitSource = null; _overpassSource = null; _speedLimitDebug = null; hideSpeedLimitDebug();
            resetMaxspeedProbe();
            routeTotalDistKm = 0; routeTotalDurationHours = 0;
            stopDeadReckoning();
            if (animationFrame) cancelAnimationFrame(animationFrame);
            updateScreenGlow(false, false);
            stopAudio();
            fullRouteLine = null; routeSteps = []; stepArrivalDist = []; currentStepIndex = 0; announcedThresholds = {}; _routeDeviationHandled = false; _maxDistAlongM = null;
            hideNextTurnPanel();
            if (map3DActive) toggle3DMode();
            currentAvoidTolls = false;
            const altBtn = document.getElementById('nav-google-altroute');
            if (altBtn) { altBtn.classList.remove('active'); altBtn.title = "Itinéraire alternatif (éviter les péages)"; }
            updateGoogleEtaBar(0, 0);
            restAreas = []; nextRestThresholdHours = REST_STOP_INTERVAL_HOURS;
            restStopTracking = { active: false, areaName: null, enteredAt: null, validated: false };
            simFrozenAtRestArea = false; simTestAreaDistKm = null;
            document.getElementById('rest-stop-banner').classList.remove('visible');
            // Réinitialiser l'état station essence
            gasStopWaypoint = null; gasStationAlertFired = false;
            document.getElementById('gas-station-banner')?.classList.remove('visible');
            // Réinitialiser l'état ZFE
            clearZFEMapLayer(); closeZFEBanner(); _zfeLiveInsideId = null;
            // Réinitialiser les étapes multi-arrêts
            navWaypoints = [];
            simState = null;
            const _wpBadge = document.getElementById('nav-waypoint-badge');
            if (_wpBadge) _wpBadge.classList.remove('visible');
            document.getElementById('nav-eta-box').classList.remove('visible');

            document.getElementById('ui-panel').classList.remove('panel-hidden');
            document.getElementById('ui-panel').style.display = 'flex'; 
            document.getElementById('info-widget').style.display = 'none';

            const finalScore = drivers.length > 0 ? drivers[0].score : 0;
            const finalDist = drivers.length > 0 ? drivers[0].dist : 0;
            const finalDurationHours = drivers.length > 0 ? drivers[0].timeHours : 0;
            const isPerfectRun = drivers.length > 0 && !drivers[0].hasSpeeded && drivers[0].dist > 0.1;

            // Sauvegarder le trajet dans l'historique statistiques
            saveTripToHistory({
                distKm: finalDist,
                score: finalScore,
                hasSpeeded: drivers.length > 0 ? drivers[0].hasSpeeded : false,
                durationMin: finalDurationHours * 60,
                avgSpeedKmh: finalDurationHours > 0 ? finalDist / finalDurationHours : 0,
                ecoScore:     drivers.length > 0 ? Math.round(drivers[0].ecoScore) : 100,
                hardBrakings: drivers.length > 0 ? drivers[0].hardBrakings : 0,
                hardAccels:   drivers.length > 0 ? drivers[0].hardAccels : 0,
            });
            stopEcoMotionTracking();
            _routeMaxspeedAnnotations = []; // reset pour éviter données périmées au prochain trajet
            document.getElementById('eco-score-bar').classList.remove('visible');
            const _ecoC = document.getElementById('nav-eco-counter'); if(_ecoC) _ecoC.style.display='none';
            // Annuler le mode ping carte si actif
            if (pickingMode === 'nav-pin-stop') {
                pickingMode = null;
                document.getElementById('map').classList.remove('crosshair-cursor');
                document.getElementById('map-pick-hint').classList.remove('visible');
                document.getElementById('nav-btn-pin-stop')?.classList.remove('active-pin');
            }

            if (!isPerfectRun) {
                // Le score du trajet est plafonné à 0 : un trajet raté ne rapporte rien,
                // mais n'entame jamais le capital déjà acquis.
                const earned = clampTripScore(finalScore);
                addPointsToActiveProfile(earned);
                const profile = profiles.find(p => p.id === activeProfileId);
                const statusEl = document.getElementById('status');
                if (earned > 0) {
                    statusEl.innerText = profile
                        ? `Trajet terminé. ${earned.toFixed(2)} pts ajoutés au profil ${profile.name} 🛑`
                        : "Trajet terminé. Points arrêtés 🛑";
                    statusEl.style.color = "#ff6b6b";
                } else {
                    // Annoncer un « 0 pt » plutôt qu'un score négatif : le capital est intact.
                    statusEl.innerText = profile
                        ? `Trajet terminé. 0 pt gagné — ton total de ${profile.totalPoints.toFixed(2)} pts reste intact 🛡️`
                        : "Trajet terminé. 0 pt gagné sur ce trajet 🛡️";
                    statusEl.style.color = "#f39c12";
                }
            } else {
                document.getElementById('status').innerText = "Trajet terminé. Sans faute ! 🏆";
                document.getElementById('status').style.color = "#28a745";
            }

            document.getElementById('btn-start').disabled = false; document.getElementById('mode-switch').disabled = false; document.getElementById('btn-free').disabled = false;
            document.getElementById('nav-bottom-bar').classList.remove('visible');
            document.getElementById('nav-speed-display').classList.remove('visible');
            document.getElementById('nav-speed-display').classList.remove('over-limit');
            const _limitBadge = document.getElementById('speed-limit-badge');
            if (_limitBadge) _limitBadge.classList.remove('visible');
            updateSpeedometer(0, 50, false);

            document.getElementById('nav-side-controls').classList.remove('visible');
            document.body.classList.remove('bottom-bars-active');
            document.body.classList.remove('nav-active');
            const muteBtn     = document.getElementById('nav-btn-mute');
            const recenterNavBtn = document.getElementById('nav-btn-recenter');
            if (muteBtn)        muteBtn.style.display     = 'flex';
            if (recenterNavBtn) recenterNavBtn.style.display = 'none';
            const pinStopBtn  = document.getElementById('nav-btn-pin-stop');
            if (pinStopBtn)   pinStopBtn.style.display    = 'none';

            if(drivers.length > 0) {
                drivers[0].finished = true;
                if (isPerfectRun) {
                    openLootChestModal(finalScore, genuinelyArrived);
                }
            }
            releaseWakeLock();

            // Mise à jour des objectifs hebdomadaires — APRÈS openLootChestModal pour que
            // showBadgeEarnedToast détecte correctement le coffre ouvert et pose _pendingBadgeModal=true
            updateWeeklyGoalsAfterTrip(finalDist, finalScore, isPerfectRun);

            map.easeTo({ bearing: 0, duration: 500 });

            // Supprimer les marqueurs départ (🟢) et arrivée (🔴) de la carte
            clearRouteLine();
            if (startTempMarker) { startTempMarker.remove(); startTempMarker = null; }
            if (endTempMarker)   { endTempMarker.remove();   endTempMarker   = null; }
            // Supprimer les marqueurs conducteurs (points bleus)
            drivers.forEach(d => { if (d.marker) { d.marker.remove(); d.marker = null; } });
        }

        function resetSimulation() {
            stopCourse();
            clearRouteLine();
            currentTurfLine = null; isUserPanning = false; showRecenterBtn(false);
            document.getElementById('status').innerText = "GPS actif 🛰️. Choisissez destination puis Lancer."; document.getElementById('status').style.color = "#4da3ff";

            document.getElementById('ui-panel').classList.remove('panel-hidden');
            document.getElementById('ui-panel').style.display = 'flex';
            document.getElementById('info-widget').style.display = 'none';

            drivers.forEach(d => {
                if (d.marker) d.marker.remove();
                d.dist = 0; d.score = 0; d.timeHours = 0; d.actualSpeed = 0; d.speedSmoothed = 0;
                d.isSpeeding = false; d.hasSpeeded = false; d.lastCheckpoint = -1; d.finished = false; d.hardBrakings = 0; d.hardAccels = 0; d.ecoScore = 100;
                const _bc=document.getElementById('eco-brake-count'); const _ac=document.getElementById('eco-accel-count'); const _sc=document.getElementById('eco-score-counter'); if(_bc)_bc.textContent='0'; if(_ac)_ac.textContent='0'; if(_sc){_sc.textContent='100';_sc.style.color='#28a745';}
            });
            exactEndCoords = null; 
            renderDriversUI();
            if (lastRealCoords) { map.jumpTo({ center: [lastRealCoords[0], lastRealCoords[1]], zoom: 15 }); } 
            else { map.jumpTo({ center: [2.2561, 48.8966], zoom: 15 }); }
        }

        function handleRealMovement(lng, lat, systemSpeed, accuracy) {
            if (!lastRealCoords || drivers.length === 0) return;
            const d = drivers[0];
            /* ARRIVÉ À DESTINATION. Ce `return` sortait sans rien mettre à jour : la
               dernière vitesse mesurée avant l'arrêt restait donc affichée indéfiniment —
               25 km/h au point mort, une fois la voiture garée. Les fix GPS continuent
               pourtant d'arriver, c'est juste que plus personne ne les lisait.
               On remet le compteur à zéro comme le fait déjà la branche « immobile »
               plus bas, puis on sort : le trajet est fini, rien d'autre n'a à être
               recalculé. */
            if (d.finished) {
                if (d.actualSpeed !== 0) {
                    d.actualSpeed = 0;
                    d.speedSmoothed = 0;
                    d.isSpeeding = false;
                    setText(`speed-${d.id}`, '0');
                    const navVal = document.getElementById('nav-speed-value');
                    if (navVal) navVal.innerText = '0';
                    document.getElementById('nav-speed-display')?.classList.remove('over-limit');
                    document.getElementById('speed-limit-badge')?.classList.remove('visible');
                    updateSpeedometer(0, currentSpeedLimitKmh || 50, false);
                    updateScreenGlow(false, false, 0);
                }
                return;
            }
            // Signal perdu (tunnel) : les positions reçues sont des replis réseau figés.
            // Les traiter comme un déplacement réel remettrait la vitesse à 0 et déclencherait
            // un recalcul d'itinéraire parasite. Le dead reckoning fait autorité.
            if (gpsSignalLost) return;
            const to = turf.point([lng, lat]);

            checkVoiceGuidanceReal(lng, lat);
            checkRestStopReal(d, lng, lat);
            checkZFELive(lng, lat);
            checkZFEApproach(d.dist, d.actualSpeed);
            checkPauseDetection(d, lng, lat, systemSpeed ? systemSpeed * 3.6 : 0);
            // Détection d'arrivée aux étapes intermédiaires (fonctionne aussi en trajet libre)
            checkNavWaypointArrival();

            // Destination effective : soit la destination guidée, soit le premier arrêt en trajet libre
            const _effDestForTracking = exactEndCoords || (navWaypoints.length > 0 ? navWaypoints[0].coords : null);
            if (currentTurfLine && _effDestForTracking) {
                const nearestPt = turf.nearestPointOnLine(currentTurfLine, to, { units: 'kilometers' });
                const distToRoute = nearestPt.properties.dist * 1000;

                let bearingMismatch = false;
                const routeCoords = currentTurfLine.geometry.coordinates;
                const idx = nearestPt.properties.index;
                if (typeof idx === 'number' && idx < routeCoords.length - 1) {
                    const routeBearing = turf.bearing(turf.point(routeCoords[idx]), turf.point(routeCoords[idx + 1]));
                    let diff = Math.abs(lastKnownBearing - routeBearing);
                    if (diff > 180) diff = 360 - diff;
                    // Seuil abaissé à 35° : un virage manqué donne 70-90° d'écart, on réagit plus tôt
                    bearingMismatch = diff > 35;
                }

                /* ── Troisième signal : la PROGRESSION QUI RECULE ──
                   `nearestPointOnLine` fournit aussi `location`, la distance parcourue le
                   long du tracé. Quand on dépasse un virage sans le prendre, la projection
                   quitte le coude et redescend sur le segment d'approche : cette valeur
                   DIMINUE. C'est ce qui se voyait à l'écran sous la forme d'une distance
                   au prochain virage qui remonte — 65 m, puis 95, puis 153 — pendant que
                   l'application continuait tranquillement de guider sur l'ancien trajet.
                   Le signal est indépendant de la distance perpendiculaire, et c'est ce
                   qui le rend utile : les deux autres seuils échouent quand l'itinéraire
                   repasse à proximité (rue parallèle, tracé qui revient sur lui-même), où
                   `distToRoute` reste faible alors qu'on ne le suit plus du tout.
                   La garde `distToRoute > 8` évite le faux positif du rond-point ou de
                   l'aller-retour, où la projection peut sauter en arrière alors qu'on est
                   bel et bien SUR la route. */
                const distAlongM = (nearestPt.properties.location || 0) * 1000;
                if (_maxDistAlongM === null || distAlongM > _maxDistAlongM) _maxDistAlongM = distAlongM;
                const reculM = _maxDistAlongM - distAlongM;
                const progressionPerdue = reculM > 35 && distToRoute > 8;

                // Seuils abaissés pour réagir plus vite en ville (30 km/h = 8.3 m/s) :
                // - 15m : déviation franche → recalcul immédiat
                // - 8m + bearingMismatch : virage clairement manqué même si pas encore loin
                // - progression qui recule : virage dépassé, quelle que soit la distance
                const shouldRecalculate = distToRoute > 15 || (distToRoute > 8 && bearingMismatch) || progressionPerdue;

                if (shouldRecalculate) {
                    // Ne faire ceci qu'une fois par épisode de déviation : sinon, tant que le
                    // recalcul Mapbox est en cours (ou échoue), chaque frame GPS suivante
                    // effaçait à nouveau le seuil déjà annoncé et checkVoiceGuidanceReal (appelé
                    // en tête de fonction) le rejouait aussitôt → instruction vocale en boucle.
                    if (!_routeDeviationHandled) {
                        _routeDeviationHandled = true;
                        // Couper la voix immédiatement pour ne pas répéter l'ancienne instruction
                        // pendant les ~2s que prend le recalcul Mapbox
                        if (typeof stopAudio === 'function') stopAudio();
                        // Invalider les annonces vocales déjà jouées pour le step courant
                        // (elles seront recalculées sur le nouvel itinéraire)
                        Object.keys(announcedThresholds).forEach(k => {
                            if (k.startsWith(currentStepIndex + '_')) {
                                delete announcedThresholds[k];
                            }
                        });
                    }
                    recalculateRoute(lng, lat);
                } else {
                    _routeDeviationHandled = false;
                }
            }

            const from = turf.point(lastRealCoords);
            const distanceMovedKm = turf.distance(from, to, {units: 'kilometers'});
            const distanceMovedMeters = distanceMovedKm * 1000;
            if (distanceMovedMeters < 1) {
                // On n'a pas bougé d'au moins 1m → on est à l'arrêt (feu rouge, embouteillage, stationnement).
                // On met la vitesse à 0 et on met à jour l'affichage AVANT de quitter, sinon la dernière
                // vitesse non-nulle (ex: 30 km/h juste avant le feu) resterait figée à l'écran.
                d.actualSpeed = 0;
                d.speedSmoothed = 0;
                d.isSpeeding = false;
                setText(`speed-${d.id}`, '0');
                if (d.id === drivers[0].id) {
                    document.getElementById('nav-speed-value').innerText = '0';
                    document.getElementById('nav-speed-display').classList.remove('over-limit');
                    const _lb = document.getElementById('speed-limit-badge');
                    if (_lb) _lb.classList.remove('visible');
                    updateSpeedometer(0, 50, false);
                    updateScreenGlow(false, true, 0);
                }
                return; 
            }

            // --- Détection d'une coupure GPS (tunnel, parking couvert, canyon urbain...) ---
            // Après plusieurs secondes sans signal, la puce GPS peut renvoyer une vitesse
            // instantanée aberrante/gonflée à la reprise. On calcule alors la vitesse MOYENNE
            // réelle (distance/temps) sur toute la coupure, bien plus fiable que la mesure brute,
            // et on n'applique aucune pénalité de vitesse sur cette distance : on ne peut pas savoir
            // avec certitude ce qui s'est passé pendant la coupure, le bénéfice du doute est appliqué.
            const gapSeconds = lastRealTimestamp ? (Date.now() - lastRealTimestamp) / 1000 : 0;
            const isGpsGapRecovery = gapSeconds > 5;

            let speedKmh;
            if (isGpsGapRecovery) {
                const timeDiffHours = gapSeconds / 3600;
                speedKmh = timeDiffHours > 0 ? (distanceMovedKm / timeDiffHours) : 0;
                d.speedSmoothed = speedKmh; // repart d'une base saine, sans hériter d'un ancien pic
            } else {
                speedKmh = systemSpeed ? (systemSpeed * 3.6) : 0;
                if (!systemSpeed && lastRealTimestamp) {
                    const timeDiffHours = gapSeconds / 3600;
                    if (timeDiffHours > 0) speedKmh = distanceMovedKm / timeDiffHours;
                }
            }

            // --- Anti-bruit GPS à l'arrêt ---
            // Le capteur de vitesse (mesure Doppler) peut afficher quelques km/h même complètement
            // à l'arrêt (feu rouge, devant un portail...), surtout quand la précision de position
            // est dégradée (bâtiments proches, zone urbaine dense). On lisse la valeur dans le temps
            // et on applique un palier bas : sous ce seuil, on considère que c'est du bruit et on
            // affiche 0. Le seuil est plus élevé si la précision GPS est mauvaise (peu fiable).
            if (typeof d.speedSmoothed !== 'number') d.speedSmoothed = speedKmh;
            if (!isGpsGapRecovery) d.speedSmoothed = d.speedSmoothed * 0.65 + speedKmh * 0.35;
            speedKmh = d.speedSmoothed;
            const isLowAccuracy = accuracy && accuracy > 20;
            const noiseFloor = isLowAccuracy ? 8 : 3;
            if (speedKmh < noiseFloor) speedKmh = 0;

            if (lastRealTimestamp) {
                const dtHours = gapSeconds / 3600;
                if (!d.finished) { d.timeHours += dtHours; }
            }
            lastRealTimestamp = Date.now();
            d.dist += distanceMovedKm;
            d.actualSpeed = speedKmh;

            // Limite de vitesse : Mapbox annotations en priorité (précises, sans latence réseau),
            // Overpass en rafraîchissement asynchrone, fallback contextuel en dernier recours.
            maybeRefreshSpeedLimit(lng, lat);
            maybeRefreshLocalMaxspeedProbe(lng, lat);
            const _distAlong = getRouteDistanceAlongKm(lng, lat);
            const mapboxLimit = (_distAlong !== null) ? getMapboxSpeedLimitAtDist(_distAlong) : null;
            // Sonde locale : même donnée Mapbox, obtenue hors itinéraire. Consultée uniquement
            // si l'itinéraire courant n'annote pas ce point (trajet libre, tronçon non couvert).
            const probeLimit = mapboxLimit ? null : getProbeSpeedLimitAt(lng, lat);
            let limitKmh = mapboxLimit || probeLimit || currentSpeedLimitKmh;
            // Provenance de la valeur finalement retenue. Recalculée à chaque frame : une
            // valeur Mapbox qui disparaît (sortie de tronçon annoté) doit rendre la main à
            // la source Overpass, et non laisser croire qu'on est toujours sur du fiable.
            if (mapboxLimit) _speedLimitSource = 'mapbox';
            else if (probeLimit) _speedLimitSource = 'mapbox-probe';
            else if (currentSpeedLimitKmh) _speedLimitSource = _overpassSource || 'overpass-inference';
            else _speedLimitSource = null;
            // Repli n°3 : inférence depuis la vitesse moyenne des steps Mapbox (distance/durée),
            // la même fonction que celle utilisée par le mode simulation — où elle donne de bons
            // résultats. Instantanée et sans réseau, donc utile quand Overpass n'a pas répondu.
            // Réserve : le profil "driving-traffic" inclut le trafic réel, donc l'estimation est
            // biaisée VERS LE BAS dans les embouteillages. On ne l'utilise qu'en dernier recours,
            // avant le repli aveugle, et jamais pour écraser une valeur Mapbox ou Overpass.
            if (!limitKmh && routeSteps.length > 0 && _distAlong !== null) {
                limitKmh = getStepSpeedLimitAtDist(_distAlong * 1000);
                if (limitKmh) _speedLimitSource = 'steps';
            }
            if (!limitKmh) {
                limitKmh = isInsideParis(lng, lat) ? 30 : 50;
                _speedLimitSource = 'fallback';
            }
            // Si Mapbox donne une valeur, on met à jour currentSpeedLimitKmh pour cohérence
            // (et sa provenance avec, sinon une valeur Mapbox mise en cache serait plus tard
            // réattribuée à Overpass et jugée incertaine à tort).
            if (mapboxLimit) { currentSpeedLimitKmh = mapboxLimit; _overpassSource = 'mapbox'; }
            document.getElementById(`limit-${d.id}`).innerText = Math.round(limitKmh) + " km/h";
            if (d.id === drivers[0].id) {
                updateSpeedLimitBadge(limitKmh);
            }

            let currentMultiplier = d.dist <= 15 ? 1.5 : 1.0;

            // === SYSTÈME MARGE + GRÂCE ===
            // 1. Détecter un changement de limite (baisse) et lancer la grâce si besoin
            if (d.id === drivers[0].id) maybeStartGrace(limitKmh);

            const hardLimit = limitKmh * SPEED_TOLERANCE_FACTOR; // +5% marge radar → seuil rouge
            const grace     = d.id === drivers[0].id && isGraceActive(d.actualSpeed, limitKmh);

            // aboveHard : dépasse la marge radar → dépassement considéré volontaire
            // aboveSoft : au-dessus de la limite stricte mais dans la marge → avertissement orange
            const aboveHard = !isGpsGapRecovery && d.actualSpeed > hardLimit && !isSpeedLimitUncertain();
            const aboveSoft = !isGpsGapRecovery && d.actualSpeed > limitKmh  && !isSpeedLimitUncertain();

            if (aboveHard && !grace) {
                // Dépassement volontaire (> limite +5%) : pénalité immédiate
                d.isSpeeding = true;
                d.hasSpeeded = true;
                d.score -= (distanceMovedMeters * PENALTY_PER_METER);
                triggerPenaltyAnimation(d.id);
            } else {
                d.isSpeeding = false;
                d.score += (distanceMovedMeters * POINTS_PER_METER * currentMultiplier);
                document.getElementById(`driver-card-${d.id}`).classList.remove('speeding');
            }
            // Orange : dans la marge des 5% (avertissement) OU grâce active après baisse de panneau
            const isWarning = !d.isSpeeding && (aboveSoft || grace);
            if (d.id === drivers[0].id) updateScreenGlow(d.isSpeeding, true, d.actualSpeed, isWarning);

            let remainingDistKm = 0;
            let remainingTimeHours = 0;
            // En trajet libre avec arrêts, la destination effective est le premier navWaypoint
            const effectiveDest = exactEndCoords || (navWaypoints.length > 0 ? navWaypoints[0].coords : null);
            if (effectiveDest) {
                if (currentTurfLine) {
                    const destPoint = turf.point(effectiveDest);
                    try {
                        const snapped = turf.nearestPointOnLine(currentTurfLine, to);
                        const snappedCoords = snapped.geometry.coordinates;
                        const sliced = turf.lineSlice(snapped, destPoint, currentTurfLine);
                        remainingDistKm = turf.length(sliced, {units: 'kilometers'});
                        if (sliced.geometry.coordinates.length >= 2) {
                            const trimmedCoords = sliced.geometry.coordinates.slice();
                            trimmedCoords[0] = snappedCoords;
                            setRouteLine(trimmedCoords);
                            currentTurfLine = sliced;
                        }
                    } catch(e) { remainingDistKm = turf.distance(to, turf.point(effectiveDest), {units: 'kilometers'}) * 1.2; }
                } else {
                    remainingDistKm = turf.distance(to, turf.point(effectiveDest), {units: 'kilometers'}) * 1.2;
                }
                let speedForETA = d.actualSpeed > 5 ? d.actualSpeed : 30;
                if (routeTotalDistKm > 0 && routeTotalDurationHours > 0) {
                    const progressRatio = Math.max(0, Math.min(1, remainingDistKm / routeTotalDistKm));
                    remainingTimeHours = routeTotalDurationHours * progressRatio;
                } else {
                    remainingTimeHours = remainingDistKm / speedForETA;
                }
                setText(`dist-left-${d.id}`, remainingDistKm.toFixed(2) + " km");
                setText(`eta-${d.id}`, formatTime(remainingTimeHours));
            }

            if (effectiveDest) {
                const dest = turf.point(effectiveDest);
                const distToDestination = turf.distance(to, dest, {units: 'kilometers'}) * 1000;
                if (distToDestination <= 50) {
                    setText(`dist-left-${d.id}`, "0.00 km");
                    setText(`eta-${d.id}`, "Arrivé");
                    // Si c'est un navWaypoint (trajet libre), checkNavWaypointArrival s'en charge
                    // Si c'est exactEndCoords (trajet guidé), on signale l'arrivée finale
                    if (exactEndCoords) {
                        document.getElementById('status').innerText = "Vous êtes arrivé ! Recherche de place... 🅿️ (Terminer Trajet)";
                        document.getElementById('status').style.color = "#28a745";
                        clearRouteLine();
                        currentTurfLine = null; exactEndCoords = null; d.finished = true;
                        if (animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = null; }
                        triggerArrivedGlow();
                        hideNextTurnPanel();
                    }
                    // Si trajet libre avec arrêt : checkNavWaypointArrival gère la suite (shift + recalc)
                }
            }

            let currentAvgSpeed = d.timeHours > 0 ? (d.dist / d.timeHours) : 0;
            setText(`dist-${d.id}`, d.dist.toFixed(2) + " km");
            setText(`time-${d.id}`, formatTime(d.timeHours));
            setText(`speed-${d.id}`, Math.round(d.actualSpeed));
            setText(`avg-speed-${d.id}`, Math.round(currentAvgSpeed) + " km/h");
            const ptsEl = document.getElementById(`pts-${d.id}`);
            if (ptsEl) {
                // Affichage plafonné à 0 : le score interne reste négatif (il pilote la
                // couleur d'alerte et la granularité de récupération), mais l'utilisateur
                // ne voit jamais un total négatif qui laisserait croire à une dette.
                ptsEl.innerText = Math.max(0, d.score).toFixed(3);
                ptsEl.style.color = d.score < 0 ? '#ff6b6b' : '#4da3ff';
            }

            if (d.id === drivers[0].id) {
                const displayPoints = Math.max(0, d.score).toFixed(0);
                const navPtsEl = document.getElementById('nav-points');
                navPtsEl.innerText = "+" + displayPoints + " pts";
                navPtsEl.style.color = d.score < 0 ? '#ff6b6b' : '#28a745';

                document.getElementById('nav-multiplier').innerText = "x" + currentMultiplier;
                if (DOM.navSpeedValue)   DOM.navSpeedValue.innerText = Math.round(d.actualSpeed);
                if (DOM.navSpeedDisplay) DOM.navSpeedDisplay.classList.toggle('over-limit', !!d.isSpeeding);
                updateSpeedometer(d.actualSpeed, limitKmh, !!d.isSpeeding);

                if (exactEndCoords || navWaypoints.length > 0) {
                    document.getElementById('info-label-1').innerText = "🏁 Dist. restante:";
                    document.getElementById('info-label-2').innerText = "⏳ Temps restant:";
                    document.getElementById('info-dist-left').innerText = remainingDistKm.toFixed(2) + " km";
                    document.getElementById('info-eta').innerText = formatTime(remainingTimeHours);
                    if (DOM.navEtaBox) DOM.navEtaBox.classList.add('visible');
                    if (DOM.navEta)    DOM.navEta.innerText = formatTime(remainingTimeHours);
                    updateGoogleEtaBar(remainingDistKm, remainingTimeHours);
                    if (exactEndCoords) checkTenMinAlert(remainingTimeHours);
                } else {
                    document.getElementById('info-label-1').innerText = "• Distance parcourue:";
                    document.getElementById('info-label-2').innerText = "⏱️ Temps écoulé:";
                    document.getElementById('info-dist-left').innerText = d.dist.toFixed(2) + " km";
                    document.getElementById('info-eta').innerText = formatTime(d.timeHours);
                    if (DOM.navEtaBox) DOM.navEtaBox.classList.remove('visible');
                }
                document.getElementById('info-points').innerText = displayPoints + " pts";
            }
        }

        function startFreeCourse() {
            const statusBox = document.getElementById('status');
            const btnStart = document.getElementById('btn-start');
            const modeSwitch = document.getElementById('mode-switch');
            const btnFree = document.getElementById('btn-free');

            if (drivers.length === 0) return statusBox.innerText = "Ajoutez au moins un conducteur.";
            if (!lastRealCoords) return statusBox.innerText = "En attente du signal GPS...";

            btnStart.disabled = true; modeSwitch.disabled = true; btnFree.disabled = true;

            document.getElementById('ui-panel').style.display = 'none';
            document.getElementById('info-widget').style.display = 'block';
            document.getElementById('info-widget').classList.remove('open');
            document.getElementById('info-badge').classList.remove('arrived-pulse');

            clearRouteLine();
            if (animationFrame) cancelAnimationFrame(animationFrame);
            updateScreenGlow(false, false);
            fullRouteLine = null; routeSteps = []; stepArrivalDist = []; currentStepIndex = 0; announcedThresholds = {}; _routeDeviationHandled = false; _maxDistAlongM = null;
            hideNextTurnPanel();

            currentTurfLine = null; exactEndCoords = null; currentVisualBearing = 0;
            drivers.forEach(d => {
                if (d.marker) d.marker.remove();
                d.dist = 0; d.score = 0; d.timeHours = 0; d.actualSpeed = 0; d.speedSmoothed = 0;
                d.isSpeeding = false; d.hasSpeeded = false; d.lastCheckpoint = -1; d.finished = false; d.hardBrakings = 0; d.hardAccels = 0; d.ecoScore = 100;
                const _bc=document.getElementById('eco-brake-count'); const _ac=document.getElementById('eco-accel-count'); const _sc=document.getElementById('eco-score-counter'); if(_bc)_bc.textContent='0'; if(_ac)_ac.textContent='0'; if(_sc){_sc.textContent='100';_sc.style.color='#28a745';}
                
                d.marker = addDriverMarker(lastRealCoords[0], lastRealCoords[1], d.color);
                const distEl = document.getElementById(`dist-left-${d.id}`);
                const etaEl = document.getElementById(`eta-${d.id}`);
                if (distEl) distEl.innerText = "--"; if (etaEl) etaEl.innerText = "--";
            });

            isSimulationMode = false; isCourseStarted = true; lastRealTimestamp = Date.now();
            startDeadReckoning();
            startEcoMotionTracking();
            document.getElementById('eco-score-bar').classList.add('visible');
            if (ecoCounterEnabled) { const c = document.getElementById('nav-eco-counter'); if(c) c.style.display='flex'; }
            statusBox.innerText = "Trajet libre en cours ! Roulez pour marquer des points 🧭"; statusBox.style.color = "#20c997";

            document.getElementById('nav-points').innerText = "+0 pts";
            document.getElementById('nav-points').style.color = "#28a745";
            document.getElementById('nav-multiplier').innerText = "x1.5";
            document.getElementById('nav-bottom-bar').classList.add('visible');
            document.getElementById('nav-speed-display').classList.add('visible');
            
            document.getElementById('nav-side-controls').classList.add('visible');
            document.getElementById('nav-btn-pin-stop').style.display = 'none'; // Masqué en trajet libre : l'ajout d'arrêt n'est possible qu'en trajet avec destination
            /* Partage de position live (📡) masqué en trajet libre, en attendant que la
               fonctionnalité soit finalisée — FIREBASE_DB_URL est encore un placeholder.
               Seul l'affichage du bouton est neutralisé : toggleLiveShare() et toute la
               mécanique restent en place, il suffira de repasser à 'flex' pour la rouvrir. */
            document.getElementById('nav-btn-liveshare').style.display = 'none';
            document.getElementById('nav-btn-mute').style.display = 'flex';
            document.body.classList.add('bottom-bars-active');

            document.getElementById('info-label-1').innerText = "• Distance parcourue:";
            document.getElementById('info-label-2').innerText = "⏱️ Temps écoulé:";
            document.getElementById('info-dist-left').innerText = "0.00 km";
            document.getElementById('info-eta').innerText = formatTime(0);
            document.getElementById('info-points').innerText = "0 pts";
            document.getElementById('nav-eta-box').classList.remove('visible');

            requestWakeLock();
        }

        async function startCourse(mode, precomputedRoute) {
            const statusBox = document.getElementById('status');
            const btnStart = document.getElementById('btn-start');
            const modeSwitch = document.getElementById('mode-switch');
            document.getElementById('info-label-1').innerText = "🏁 Dist. restante:";
            document.getElementById('info-label-2').innerText = "⏳ Temps restant:";
            document.body.classList.add('nav-active');
            /* La consultation d'une destination détache la caméra du GPS. Au départ du
               trajet, le suivi doit impérativement reprendre quelle que soit la porte
               d'entrée (modal, trajet libre, reprise hors ligne). */
            isUserPanning = false;
            if (userPanningResumeTimer) { clearTimeout(userPanningResumeTimer); userPanningResumeTimer = null; }
            showRecenterBtn(false);
            initTenMinForTrip(); // initialiser la feature 10min pour ce trajet

            // Réinitialiser l'état badge en attente pour ce nouveau trajet
            _pendingBadgeModal = false;
            _pendingBadgeTotal = 0;

            if (!precomputedRoute) return statusBox.innerText = "Veuillez d'abord calculer l'itinéraire.";
            if (drivers.length === 0) return statusBox.innerText = "Ajoutez au moins un conducteur.";

            // ── Sauvegarder la route en cache hors ligne ──
            saveRouteOfflineCache(precomputedRoute);

            currentAvoidTolls = !!precomputedRoute.avoidTolls;

            btnStart.disabled = true; modeSwitch.disabled = true; document.getElementById('btn-free').disabled = true;
            
            document.getElementById('ui-panel').style.display = 'none';
            document.getElementById('info-widget').style.display = 'block';
            document.getElementById('info-widget').classList.remove('open');
            document.getElementById('info-badge').classList.remove('arrived-pulse');

            statusBox.style.color = "#ff6b6b"; statusBox.innerText = "Préparation de l'itinéraire...";

            clearRouteLine();
            if (animationFrame) cancelAnimationFrame(animationFrame);
            currentTurfLine = null; updateScreenGlow(false, false);
            currentVisualBearing = 0;
            
            drivers.forEach(d => {
                if (d.marker) d.marker.remove();
                d.dist = 0; d.score = 0; d.timeHours = 0; d.actualSpeed = 0; d.speedSmoothed = 0;
                d.isSpeeding = false; d.hasSpeeded = false; d.lastCheckpoint = -1; d.finished = false; d.hardBrakings = 0; d.hardAccels = 0; d.ecoScore = 100;
                const _bc=document.getElementById('eco-brake-count'); const _ac=document.getElementById('eco-accel-count'); const _sc=document.getElementById('eco-score-counter'); if(_bc)_bc.textContent='0'; if(_ac)_ac.textContent='0'; if(_sc){_sc.textContent='100';_sc.style.color='#28a745';}
                
                d.marker = new mapboxgl.Marker({ element: createPulseMarkerEl(d.color), anchor: 'center' }).setLngLat([0, 0]);
            });

            try {
                const startCoords = precomputedRoute.startCoords;
                const endCoords = precomputedRoute.endCoords;
                const osrmData = precomputedRoute.osrmData;
                exactEndCoords = endCoords;

                const geojsonRoute = osrmData.routes[0].geometry;
                // Sommer les legs pour distance et durée (route avec waypoint station = 2 legs)
                const route0 = osrmData.routes[0];
                const distanceKm = route0.legs && route0.legs.length > 1
                    ? route0.legs.reduce((s, l) => s + l.distance, 0) / 1000
                    : route0.distance / 1000;
                const totalDurationHours = route0.legs && route0.legs.length > 1
                    ? route0.legs.reduce((s, l) => s + l.duration, 0) / 3600
                    : route0.duration / 3600;
                const avgSpeedKmh = distanceKm / totalDurationHours;
                routeTotalDistKm = distanceKm;
                routeTotalDurationHours = totalDurationHours;

                setRouteLine(geojsonRoute.coordinates);
                currentTurfLine = turf.lineString(geojsonRoute.coordinates);
                fullRouteLine = turf.lineString(geojsonRoute.coordinates);
                buildRouteSteps(osrmData);
                buildMaxspeedAnnotations(osrmData);
                updateGL3DRoute();

                restAreas = []; nextRestThresholdHours = REST_STOP_INTERVAL_HOURS;
                restStopTracking = { active: false, areaName: null, enteredAt: null, validated: false };
                simFrozenAtRestArea = false; simTestAreaDistKm = null;
                document.getElementById('rest-stop-banner').classList.remove('visible');
                if (totalDurationHours > REST_STOP_INTERVAL_HOURS) fetchRestAreasAlongRoute();

                if (!isUserPanning) {
                    map.resize();
                    const bounds = getRouteBounds();
                    if (bounds) map.fitBounds(bounds, { padding: 40, animate: false });
                }
                drivers.forEach(d => { d.marker.setLngLat(startCoords).addTo(map); });

                document.getElementById('nav-points').innerText = "+0 pts";
                document.getElementById('nav-points').style.color = "#28a745";
                document.getElementById('nav-multiplier').innerText = "x1.5";
                document.getElementById('nav-bottom-bar').classList.add('visible');
                document.getElementById('nav-speed-display').classList.add('visible');
                
                document.getElementById('nav-side-controls').classList.add('visible');
                document.getElementById('nav-btn-pin-stop').style.display = 'flex'; // Visible en trajet avec destination
                // Contrepartie du masquage fait dans startFreeCourse : sans ce rétablissement,
                // le bouton resterait caché pour tous les trajets suivants de la session.
                document.getElementById('nav-btn-liveshare').style.display = 'flex';
                document.getElementById('nav-btn-mute').style.display = 'flex';
                document.body.classList.add('bottom-bars-active');

                if (mode === 'real') {
                    isSimulationMode = false; isCourseStarted = true; lastRealTimestamp = Date.now();
                    startDeadReckoning();
                    startEcoMotionTracking();
                    updateNavWaypointBadge();
                    document.getElementById('eco-score-bar').classList.add('visible');
                    if (ecoCounterEnabled) { const c = document.getElementById('nav-eco-counter'); if(c) c.style.display='flex'; }
                    statusBox.innerText = "Course réelle démarrée ! Déplacez-vous 🚗"; statusBox.style.color = "#f39c12";
                    await requestWakeLock(); showSafetyReminder(); return;
                }

                isSimulationMode = true; isCourseStarted = true;
                updateNavWaypointBadge();
                document.getElementById('eco-score-bar').classList.add('visible');
                if (ecoCounterEnabled) { const c = document.getElementById('nav-eco-counter'); if(c) c.style.display='flex'; }
                statusBox.innerText = "Simulation Salif en cours 🚗"; statusBox.style.color = "#8e44ad";
                await requestWakeLock();

                const line = turf.lineString(geojsonRoute.coordinates);
                // Durée totale en secondes (sommer les legs si waypoint station)
                const totalDurationSec = route0.legs && route0.legs.length > 1
                    ? route0.legs.reduce((s, l) => s + l.duration, 0)
                    : route0.duration;
                const timeScale = totalDurationSec / 24;
                let lastTimestamp = null;

                // Initialiser l'état mutable de simulation (mis à jour par recalculateRoute si on ajoute un arrêt)
                simState = {
                    line: line,
                    distanceKm: distanceKm,
                    totalDurationHours: totalDurationHours,
                    timeScale: timeScale
                };

                function animate(timestamp) {
                    if (!isCourseStarted) return; 
                    if (!lastTimestamp) lastTimestamp = timestamp;
                    const dt = timestamp - lastTimestamp; 
                    lastTimestamp = timestamp;
                    const dtHours = (dt / 3600000) * simState.timeScale; 

                    drivers.forEach(d => {
                      // ⚠ Garde-fou : sans ce try/catch, une seule erreur (ex. un id
                      // absent) remontait hors du forEach et empêchait le
                      // requestAnimationFrame final → toute la navigation se figeait
                      // silencieusement. On loggue et on continue.
                      try {
                        if (d.finished) return; 
                        d.timeHours += dtHours;
                        const prevDist = d.dist; 

                        // Limite de vitesse de la portion actuelle, déduite des données Mapbox Directions
                        // (vitesse moyenne de chaque step, arrondie au palier réaliste le plus proche).
                        // Pas d'appel Overpass ici : la simulation avance ~50x plus vite que la réalité,
                        // les appels API n'auraient pas le temps de répondre.
                        let limitKmh = getStepSpeedLimitAtDist(d.dist * 1000);

                        const checkpoint = Math.floor(d.dist / 0.5);
                        if (checkpoint > d.lastCheckpoint) {
                            d.lastCheckpoint = checkpoint;
                            if (d.behavior === 'bad') {
                                let chanceToSpeed = d.badLevel === 1 ? 0.20 : (d.badLevel === 2 ? 0.50 : 0.80);
                                if (Math.random() < chanceToSpeed) {
                                    d.isSpeeding = true;
                                    d.hasSpeeded = true;
                                    d.speedOffset = 10 + (Math.random() * 15); 
                                    triggerPenaltyAnimation(d.id);
                                } else {
                                    d.isSpeeding = false; d.speedOffset = 0;
                                    setClass(`driver-card-${d.id}`, 'speeding', false);
                                }
                            } else { d.isSpeeding = false; d.speedOffset = 0; }

                            // Simulation d'événements éco (freinages/accélérations brusques)
                            // Probabilité selon comportement : bon=5%, bad1=15%, bad2=35%, bad3=60%
                            if (d.id === drivers[0].id) {
                                const ecoChance = d.behavior === 'good' ? 0.05
                                    : d.badLevel === 1 ? 0.15
                                    : d.badLevel === 2 ? 0.35 : 0.60;
                                if (Math.random() < ecoChance) {
                                    const isBrake = Math.random() < 0.55; // légèrement plus de freinages
                                    const fakeMagnitude = (isBrake ? ECO_THRESHOLD_BRAKE : ECO_THRESHOLD_ACCEL)
                                        + Math.random() * 2.5;
                                    if (isBrake) d.hardBrakings++;
                                    else d.hardAccels++;
                                    _applyEcoPenalty(d, isBrake ? 'brake' : 'accel', fakeMagnitude);
                                    if (ecoCounterEnabled) _showEcoAlert(isBrake ? '🛑 Freinage brusque (sim)' : '⚡ Accélération brusque (sim)', fakeMagnitude);
                                }
                            }
                        }

                        // Bon conducteur : roule à 10 km/h sous la limite réelle du tronçon.
                        // Mauvais conducteur : peut dépasser la limite de 10-25 km/h (comportement existant).
                        const targetSpeed = d.isSpeeding
                            ? limitKmh + d.speedOffset
                            : Math.max(20, limitKmh - 10);
                        if (d.actualSpeed === 0) d.actualSpeed = targetSpeed;
                        d.actualSpeed += (targetSpeed - d.actualSpeed) * 0.1;

                        if (d.id === drivers[0].id && testPauseSimEnabled && simTestAreaDistKm === null && restAreas.length > 0 && fullRouteLine) {
                            try {
                                const snapped = turf.nearestPointOnLine(fullRouteLine, turf.point([restAreas[0].lng, restAreas[0].lat]), { units: 'kilometers' });
                                simTestAreaDistKm = snapped.properties.location;
                            } catch (e) { simTestAreaDistKm = -1; }
                        }

                        if (d.dist < simState.distanceKm) d.dist += d.actualSpeed * dtHours;

                        if (d.id === drivers[0].id && testPauseSimEnabled && simTestAreaDistKm !== null && simTestAreaDistKm >= 0 && !restStopTracking.validated) {
                            if (d.dist >= simTestAreaDistKm) {
                                d.dist = simTestAreaDistKm;
                                d.actualSpeed = 0;
                                simFrozenAtRestArea = true;
                            }
                        }

                        if (d.dist >= simState.distanceKm && currentTurfLine) {
                            d.dist = simState.distanceKm;
                            setText(`dist-left-${d.id}`, "0.00 km");
                            setText(`eta-${d.id}`, "Arrivé");
                            setText('status', "Arrivé ! Simulation continue... 🅿️ (Terminer Trajet)");
                            setStyleProp('status', 'color', "#28a745");
                            setClass(`driver-card-${d.id}`, 'speeding', false);
                            clearRouteLine();
                            currentTurfLine = null; exactEndCoords = null;
                            d.finished = true;
                            if (animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = null; }
                            if (d.id === drivers[0].id) {
                                triggerArrivedGlow();
                                hideNextTurnPanel();
                            }
                        }

                        if (d.id === drivers[0].id && !d.finished) processVoiceGuidanceByDistance(d.dist * 1000);
                        if (d.id === drivers[0].id && !d.finished) checkRestStopSuggestion(d, d.dist);
                        if (d.id === drivers[0].id && !d.finished && gasStopWaypoint) {
                            const _remDist = Math.max(0, simState.distanceKm - d.dist);
                            const remainH = _remDist > 0 && d.actualSpeed > 0
                                ? _remDist / d.actualSpeed
                                : 0;
                            checkGasStationApproach(remainH);
                        }
                        if (d.id === drivers[0].id && !d.finished) checkZFEApproach(d.dist, d.actualSpeed);

                        let currentMultiplier = d.dist <= 15 ? 1.5 : 1.0;
                        const deltaDistMeters = (d.dist - prevDist) * 1000;
                        if (d.isSpeeding) d.score -= (deltaDistMeters * PENALTY_PER_METER); 
                        else d.score += (deltaDistMeters * POINTS_PER_METER * currentMultiplier); 

                        if (d.id === drivers[0].id) updateScreenGlow(d.isSpeeding, true, d.actualSpeed, false); // simulation : pas de grâce

                        const currentPoint = turf.along(simState.line, d.dist, {units: 'kilometers'});
                        const nextPoint = turf.along(simState.line, d.dist + 0.01, {units: 'kilometers'});
                        const bearing = turf.bearing(currentPoint, nextPoint);

                        if (d.id === drivers[0].id && d.dist < simState.distanceKm) {
                            // ⚠ lineSlice parcourt TOUTE la géométrie du trajet (des milliers
                            // de points sur un long parcours) et setData renvoie le tableau
                            // complet à Mapbox. À 60 fps c'était le poste CPU n°1 pour un
                            // gain visuel nul : on rafraîchit le tracé 4 fois par seconde.
                            if (!animate._lastTrim || timestamp - animate._lastTrim > 250) {
                                animate._lastTrim = timestamp;
                                try {
                                    const endPt = turf.along(simState.line, simState.distanceKm, {units: 'kilometers'});
                                    const remaining = turf.lineSlice(currentPoint, endPt, simState.line);
                                    if (remaining.geometry.coordinates.length >= 2) {
                                        const trimmedCoords = remaining.geometry.coordinates.slice();
                                        trimmedCoords[0] = currentPoint.geometry.coordinates;
                                        setRouteLine(trimmedCoords);
                                    }
                                } catch(e) {
                                    if (DEBUG) console.warn('[animate] découpe du tracé restant impossible :', e);
                                }
                            }
                        }
                        
                        const curLat = currentPoint.geometry.coordinates[1];
                        const curLng = currentPoint.geometry.coordinates[0];
                        d.marker.setLngLat([curLng, curLat]);
                        // Détection d'arrivée aux étapes intermédiaires (après mise à jour position marqueur)
                        if (d.id === drivers[0].id && !d.finished) checkNavWaypointArrival();

                        if (d.id === drivers[0].id && testPauseSimEnabled && simFrozenAtRestArea) {
                            checkPauseDetection(d, curLng, curLat, 0, TEST_PAUSE_SECONDS / 60);
                            if (restStopTracking.validated) { simFrozenAtRestArea = false; }
                        }
                        
                        if (!isUserPanning) updateDynamicZoom(d.actualSpeed, curLat, curLng, bearing);
                        if (d.id === drivers[0].id) syncGL3DMap(curLat, curLng, bearing);

                        let currentAvgSpeed = d.timeHours > 0 ? (d.dist / d.timeHours) : 0;
                        let remainingDistKm = 0;
                        let remainingTimeHours = 0;
                        
                        if (currentTurfLine) {
                            remainingDistKm = simState.distanceKm - d.dist;
                            if (remainingDistKm < 0) remainingDistKm = 0;
                            // Temps restant = proportion de distance restante × durée totale du trajet
                            const progressRatio = simState.distanceKm > 0 ? remainingDistKm / simState.distanceKm : 0;
                            remainingTimeHours = simState.totalDurationHours * progressRatio;
                            setText(`dist-left-${d.id}`, remainingDistKm.toFixed(2) + " km");
                            setText(`eta-${d.id}`, formatTime(remainingTimeHours));
                        }

                        setText(`dist-${d.id}`, d.dist.toFixed(2) + " km");
                        setText(`time-${d.id}`, formatTime(d.timeHours));
                        setText(`speed-${d.id}`, Math.round(d.actualSpeed));
                        setText(`avg-speed-${d.id}`, Math.round(currentAvgSpeed) + " km/h");
                        setText(`limit-${d.id}`, Math.round(limitKmh) + " km/h");

                        // Idem boucle rAF : valeur affichée plafonnée, couleur pilotée
                        // par le score réel pour conserver le signal d'alerte.
                        setText(`pts-${d.id}`, Math.max(0, d.score).toFixed(3));
                        setStyleProp(`pts-${d.id}`, 'color', d.score < 0 ? '#ff6b6b' : '#4da3ff');

                        if (d.id === drivers[0].id) {
                            const displayPoints = Math.max(0, d.score).toFixed(0);
                            setText('nav-points', "+" + displayPoints + " pts");
                            setStyleProp('nav-points', 'color', d.score < 0 ? '#ff6b6b' : '#28a745');

                            setText('nav-multiplier', "x" + currentMultiplier);
                            setText('nav-speed-value', Math.round(d.actualSpeed));
                            setClass('nav-speed-display', 'over-limit', !!d.isSpeeding);
                            updateSpeedometer(d.actualSpeed, limitKmh, !!d.isSpeeding);
                            updateSpeedLimitBadge(limitKmh);

                            if (currentTurfLine) {
                                setText('info-label-1', "🏁 Dist. restante:");
                                setText('info-label-2', "⏳ Temps restant:");
                                setText('info-dist-left', remainingDistKm.toFixed(2) + " km");
                                setText('info-eta', formatTime(remainingTimeHours));
                                setClass('nav-eta-box', 'visible', true);
                                setText('nav-eta', formatTime(remainingTimeHours));
                                updateGoogleEtaBar(remainingDistKm, remainingTimeHours);
                                checkTenMinAlert(remainingTimeHours);
                            } else {
                                setText('info-label-1', "• Distance parcourue:");
                                setText('info-label-2', "⏱️ Temps écoulé:");
                                setText('info-dist-left', d.dist.toFixed(2) + " km");
                                setText('info-eta', formatTime(d.timeHours));
                                setClass('nav-eta-box', 'visible', false);
                            }
                            setText('info-points', displayPoints + " pts");
                        }
                      } catch (err) {
                        // Log limité à une fois par seconde pour ne pas noyer la console
                        if (!animate._lastErr || timestamp - animate._lastErr > 1000) {
                            animate._lastErr = timestamp;
                            console.error(`[animate] erreur sur le conducteur ${d && d.id} — frame ignorée :`, err);
                        }
                      }
                    });

                    if (isCourseStarted) animationFrame = requestAnimationFrame(animate);
                }
                animationFrame = requestAnimationFrame(animate);

            } catch (error) {
                statusBox.innerText = error.message;
                btnReal.disabled = false; btnSim.disabled = false;
                document.getElementById('btn-free').disabled = false;
                btnStop.disabled = true; btnStop.style.opacity = "0.5";
                
                document.getElementById('ui-panel').classList.remove('panel-hidden');
            document.getElementById('ui-panel').style.display = 'flex';
                document.getElementById('info-widget').style.display = 'none';
                
                updateScreenGlow(false, false);
                releaseWakeLock();
            }
        }
  

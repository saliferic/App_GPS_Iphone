        // === VUE 3D INCLINÉE (MAPBOX GL JS), superposée à la carte Leaflet 2D ===
        // Principe : la carte Leaflet et toute la logique existante (trajet, score, audio...)
        // continuent de fonctionner normalement en arrière-plan. La carte 3D n'est qu'un
        // affichage alternatif synchronisé sur la même position/direction ; on peut donc
        // basculer d'une vue à l'autre sans rien casser du reste de l'app.
        let map3D = null;
        let map3DActive = false;
        let map3DLoaded = false;
        let gl3dCarMarker = null;

        function ensureMap3D() {
            if (map3D) return;
            if (typeof mapboxgl === 'undefined') {
                document.getElementById('status').innerText = "❌ Vue 3D indisponible : librairie Mapbox GL non chargée (vérifie ta connexion).";
                document.getElementById('status').style.color = "#ff6b6b";
                map3DActive = false;
                document.getElementById('map-3d').classList.remove('visible');
                const btn = document.getElementById('nav-btn-3d'); if (btn) btn.classList.remove('active-3d');
                return;
            }
            if (!mapboxgl.supported()) {
                document.getElementById('status').innerText = "❌ Vue 3D non supportée par ce navigateur (WebGL indisponible ou désactivé).";
                document.getElementById('status').style.color = "#ff6b6b";
                map3DActive = false;
                document.getElementById('map-3d').classList.remove('visible');
                const btn = document.getElementById('nav-btn-3d'); if (btn) btn.classList.remove('active-3d');
                return;
            }
            mapboxgl.accessToken = MAPBOX_TOKEN;
            map3D = new mapboxgl.Map({
                container: 'map-3d',
                style: isDarkMode ? 'mapbox://styles/saliferic/cms7f8deg004e01sfg2j50kdp' : 'mapbox://styles/mapbox/navigation-day-v1',
                center: [2.2561, 48.8966],
                zoom: 17,
                pitch: 60,
                bearing: 0,
                attributionControl: false
            });
            map3D.on('load', () => { map3DLoaded = true; setupGL3DLayers(); });
            // Le changement de style (jour/nuit) recharge la carte : il faut ré-ajouter nos éléments custom.
            map3D.on('style.load', () => { if (map3DLoaded) setupGL3DLayers(); });
            map3D.on('error', (e) => {
                console.error("Erreur Mapbox GL 3D :", e && e.error ? e.error : e);
                document.getElementById('status').innerText = "⚠️ Erreur vue 3D — voir la console (F12) pour le détail.";
                document.getElementById('status').style.color = "#ff6b6b";
            });
        }

        function setupGL3DLayers() {
            // Forcer l'inclinaison : certains styles Mapbox réinitialisent la caméra à leur
            // propre valeur par défaut (souvent pitch 0) au moment où le style se termine de charger.
            map3D.setPitch(60);
            if (!map3D.getSource('gl3d-route')) {
                map3D.addSource('gl3d-route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } });
            }
            if (!map3D.getLayer('gl3d-route-line')) {
                map3D.addLayer({
                    id: 'gl3d-route-line', type: 'line', source: 'gl3d-route',
                    layout: { 'line-cap': 'round', 'line-join': 'round' },
                    paint: { 'line-color': '#4da3ff', 'line-width': 6, 'line-opacity': 0.9 }
                });
            }
            if (!gl3dCarMarker) {
                const el = document.createElement('div');
                el.className = 'gl3d-car-marker';
                el.innerText = '🚗';
                gl3dCarMarker = new mapboxgl.Marker({ element: el }).setLngLat(map3D.getCenter()).addTo(map3D);
            } else {
                gl3dCarMarker.addTo(map3D);
            }
            updateGL3DRoute();
        }

        function updateGL3DRoute() {
            // Plus utilisé depuis la migration : le tracé est géré par les couches route-glow/route-line
            // directement sur la carte principale. Garde la signature pour ne pas casser les appelants.
        }

        function syncGL3DMap(lat, lng, bearing) {
            // Plus utilisé depuis la migration : la carte principale (mapboxgl.Map) gère
            // le pitch 3D nativement. Garde la signature pour ne pas casser les appelants.
        }

        // === BASCULE 2D/3D : on change juste le pitch (inclinaison) de la carte principale ===
        // Depuis la migration Mapbox GL JS, la carte principale supporte nativement le pitch.
        // Plus besoin d'une 2e instance map3D : on incline/remet à plat la même carte.
        function toggle3DMode() {
            map3DActive = !map3DActive;
            const btn = document.getElementById('nav-btn-3d');
            if (btn) {
                btn.classList.toggle('active-3d', map3DActive);
                btn.textContent = map3DActive ? '2D' : '3D';
            }
            map.easeTo({
                pitch: map3DActive ? 60 : 0,
                duration: 800
            });
        }

        let buildings3DEnabled = localStorage.getItem('gps_buildings_3d') !== 'off';

        function toggleBuildings3D() {
            buildings3DEnabled = document.getElementById('buildings-3d-toggle').checked;
            localStorage.setItem('gps_buildings_3d', buildings3DEnabled ? 'on' : 'off');
            /* De nuit, le basculement change d'URL (Standard ↔ navigation-night-v1) ; de jour,
               l'URL est inchangée et c'est la couche `3d-buildings` qu'on montre ou masque.
               applyMapStyle() couvre les deux cas — et remet le trafic en place après le
               rechargement du style, ce que l'ancien appel direct à setStyle() ne faisait pas. */
            applyMapStyle();
        }

        function applyBuildings3DVisibility() {
            try {
                const visibility = buildings3DEnabled ? 'visible' : 'none';
                const layers = map.getStyle().layers || [];
                layers.forEach(layer => {
                    if (layer.type === 'fill-extrusion') {
                        try { map.setLayoutProperty(layer.id, 'visibility', visibility); } catch (e) { if (DEBUG) console.warn("[applyBuildings3DVisibility] exception ignorée :", e); }
                    }
                });
            } catch (e) { if (DEBUG) console.warn("[applyBuildings3DVisibility] exception ignorée :", e); }
        }

        let isDarkMode = localStorage.getItem('gps_map_theme') !== 'day';
        /* ⚠ TRAFIC : OPT-IN, pas opt-out. Le test est `=== 'on'` et non `!== 'off'`, la
           différence portant entièrement sur la clé ABSENTE — c'est-à-dire le premier
           lancement, où `!== 'off'` renvoyait vrai et affichait le trafic sans que
           personne ne l'ait demandé. L'app démarre donc carte propre ; l'interrupteur de
           « Aide à la conduite » écrit explicitement 'on' ou 'off'.
           Le même test doit être appliqué à l'identique après un import de profil
           (02-profil-export.js) : deux lectures divergentes rendraient l'état du réglage
           dépendant du chemin d'arrivée. */
        let isTrafficVisible = localStorage.getItem('gps_map_traffic') === 'on';

        function getMapStyleUrl(dark, traffic) {
            if (dark) {
                if (buildings3DEnabled) {
                    // Style Standard perso (bâtiments 3D) — le trafic n'est pas contrôlable
                    return 'mapbox://styles/saliferic/cms7f8deg004e01sfg2j50kdp';
                }
                // Styles classiques (sans bâtiments 3D) — trafic contrôlable
                return traffic ? 'mapbox://styles/mapbox/navigation-night-v1' : 'mapbox://styles/mapbox/dark-v11';
            }
            return traffic ? 'mapbox://styles/mapbox/navigation-day-v1' : 'mapbox://styles/mapbox/streets-v12';
        }

        mapboxgl.accessToken = MAPBOX_TOKEN;
        const map = new mapboxgl.Map({
            container: 'map',
            style: getMapStyleUrl(isDarkMode, isTrafficVisible),
            center: [2.2561, 48.8966],
            zoom: 15,
            attributionControl: false,
            dragRotate: false,       // pas de rotation manuelle à 2 doigts (la rotation "cap en haut" reste programmatique)
            pitchWithRotate: false,
            touchPitch: false
        });
        map.addControl(new mapboxgl.AttributionControl({ compact: true }));
        map.addControl(new mapboxgl.NavigationControl({ showCompass: false, showZoom: true }), 'bottom-right');

        // Le tracé de l'itinéraire est une source/couche GeoJSON (remplace l'ancien L.polyline).
        // routeLineCoords garde les coordonnées courantes en mémoire pour pouvoir ré-appliquer le
        // tracé après un changement de style (setStyle() supprime toutes les sources/couches).
        let routeLineCoords = null;
        const ALT_ROUTE_COLORS = ['#4da3ff', '#f39c12', '#e74c3c'];
        const ALT_ROUTE_COLORS_DIM = ['rgba(77,163,255,0.3)', 'rgba(243,156,18,0.3)', 'rgba(231,76,60,0.3)'];
        let altRoutesData = []; // tableau des routes alternatives retournées par l'API
        let selectedRouteIndex = 0;

        /* === TRAFIC SUR LES STYLES QUI N'EN ONT PAS (Standard) ===
           Les styles `navigation-day-v1` et `navigation-night-v1` embarquent 15 couches de
           trafic : rien à faire pour eux. Le style perso du mode nuit, lui, est un style
           **Standard** (il n'a pas de `layers`, mais un `imports` vers mapbox/standard), et
           Standard ne contient AUCUNE couche de trafic ni aucune option de configuration
           pour en afficher. Résultat : la nuit, `getMapStyleUrl()` renvoyait la même URL que
           le trafic soit coché ou non, et la case à cocher ne faisait littéralement rien.
           On injecte donc la source vectorielle de trafic par-dessus ces styles-là. */
        const TRAFFIC_SRC_ID   = 'gps-traffic';
        const TRAFFIC_LAYER_ID = 'gps-traffic-line';

        // Un style Standard expose `imports` et une pile `layers` vide : les slots y font foi
        // pour l'ordre d'empilement, et un `beforeId` d'un autre slot est ignoré avec un warning.
        function _styleUsesImports() {
            try { const s = map.getStyle(); return !!(s && s.imports && s.imports.length); }
            catch (e) { return false; }
        }

        /* ⚠ Exclure NOTRE couche du test, sinon boucle infinie : elle porte elle aussi
           `source-layer: 'traffic'`. Une fois ajoutée, le passage suivant la prenait pour
           une couche native du style, la retirait, la rajoutait au passage d'après…
           `setupMapLayers()` tournant sur chaque `idle` et chaque ajout/retrait provoquant
           un nouveau rendu donc un nouvel `idle`, le trafic clignotait en continu. */
        function _styleHasNativeTraffic() {
            try {
                return (map.getStyle().layers || []).some(l =>
                    l['source-layer'] === 'traffic' &&
                    l.id !== TRAFFIC_LAYER_ID &&
                    l.source !== TRAFFIC_SRC_ID
                );
            } catch (e) { return false; }
        }

        function _removeTrafficLayer() {
            try {
                if (map.getLayer(TRAFFIC_LAYER_ID)) map.removeLayer(TRAFFIC_LAYER_ID);
                if (map.getSource(TRAFFIC_SRC_ID))  map.removeSource(TRAFFIC_SRC_ID);
            } catch (e) { /* style en cours de rechargement : la couche repartira au prochain passage */ }
        }

        /* Idempotent : appelé par setupMapLayers(), donc aussi sur chaque `idle`. Les tests
           getLayer/getSource rendent les appels suivants gratuits. */
        function applyTrafficLayer() {
            try {
                if (!isTrafficVisible || _styleHasNativeTraffic()) { _removeTrafficLayer(); return; }
                if (!map.getSource(TRAFFIC_SRC_ID)) {
                    map.addSource(TRAFFIC_SRC_ID, { type: 'vector', url: 'mapbox://mapbox.mapbox-traffic-v1' });
                }
                if (map.getLayer(TRAFFIC_LAYER_ID)) return;

                const couche = {
                    id: TRAFFIC_LAYER_ID, type: 'line',
                    source: TRAFFIC_SRC_ID, 'source-layer': 'traffic',
                    minzoom: 6,
                    // `unknown` = pas de donnée : l'afficher couvrirait la route d'un gris inutile.
                    // Même filtre que les couches officielles de navigation-night-v1, plus
                    // l'exclusion de `unknown` (que le style officiel rend transparent —
                    // autant ne pas dessiner ces géométries du tout).
                    filter: ['all',
                        ['==', ['geometry-type'], 'LineString'],
                        ['has', 'congestion'],
                        ['!=', ['get', 'congestion'], 'unknown']
                    ],
                    layout: { 'line-cap': 'round', 'line-join': 'round' },
                    paint: {
                        'line-color': ['match', ['get', 'congestion'],
                            'low',      '#3bb24a',
                            'moderate', '#f2c037',
                            'heavy',    '#ef6c3a',
                            'severe',   '#c62828',
                            'rgba(0,0,0,0)'],
                        'line-width': ['interpolate', ['linear'], ['zoom'],
                            6,  ['match', ['get', 'class'], ['motorway', 'trunk'], 1.5, 0.6],
                            12, ['match', ['get', 'class'], ['motorway', 'trunk'], 3.5, ['primary', 'secondary'], 2.5, 1.4],
                            16, ['match', ['get', 'class'], ['motorway', 'trunk'], 7,   ['primary', 'secondary'], 5.5, 3.5],
                            20, ['match', ['get', 'class'], ['motorway', 'trunk'], 14,  ['primary', 'secondary'], 11,  7]],
                        'line-opacity': 0.85,
                        // Indispensable sous un style Standard en preset `night` : sans cela
                        // l'éclairage nocturne assombrit la couche jusqu'à la rendre illisible.
                        'line-emissive-strength': 1
                    }
                };

                if (_styleUsesImports()) {
                    // Sous les routes-labels, et sous notre tracé qui vit dans le slot `top`.
                    couche.slot = 'middle';
                    map.addLayer(couche);
                } else {
                    // Style classique : pas de slots, l'ordre d'insertion fait tout. On glisse
                    // le trafic SOUS le tracé, sinon il le recouvrirait quand on active la
                    // case en cours de route (les couches d'itinéraire existent déjà).
                    const dessous = ['alt-route-glow-2', 'alt-route-glow-1', 'alt-route-glow-0', 'route-glow']
                        .find(id => map.getLayer(id));
                    map.addLayer(couche, dessous);
                }
            } catch (e) {
                if (DEBUG) console.warn('[applyTrafficLayer] ignorée :', e);
            }
        }

        /* Le style perso « Dark 2D » est enregistré côté Mapbox avec `show3dObjects: false`.
           Sans cet appel, le mode nuit basculait vers ce style POUR avoir les bâtiments 3D…
           qui restaient désactivés. On force donc la config sur l'import `basemap`. */
        function applyStandardBasemapConfig() {
            try {
                if (!_styleUsesImports()) return;
                if (map.getConfigProperty('basemap', 'show3dObjects') === buildings3DEnabled) return;
                map.setConfigProperty('basemap', 'show3dObjects', buildings3DEnabled);
            } catch (e) { /* style classique : pas de configuration Standard */ }
        }

        function setupMapLayers() {
            try {
                // Trafic d'abord : sur un style classique, les couches ajoutées ensuite
                // (itinéraires) doivent se retrouver au-dessus.
                applyTrafficLayer();
                // Couches des itinéraires alternatifs (rendus sous la route principale)
                for (let i = 2; i >= 0; i--) {
                    const srcId = `alt-route-${i}`;
                    const glowId = `alt-route-glow-${i}`;
                    const lineId = `alt-route-line-${i}`;
                    if (!map.getSource(srcId)) {
                        map.addSource(srcId, { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } });
                    }
                    if (!map.getLayer(glowId)) {
                        map.addLayer({
                            id: glowId, type: 'line', source: srcId, slot: 'top',
                            layout: { 'line-cap': 'round', 'line-join': 'round' },
                            paint: { 'line-color': ALT_ROUTE_COLORS[i], 'line-width': 12, 'line-blur': 6, 'line-opacity': 0.2, 'line-emissive-strength': 1 }
                        });
                    }
                    if (!map.getLayer(lineId)) {
                        map.addLayer({
                            id: lineId, type: 'line', source: srcId, slot: 'top',
                            layout: { 'line-cap': 'round', 'line-join': 'round' },
                            paint: { 'line-color': ALT_ROUTE_COLORS_DIM[i], 'line-width': 5, 'line-opacity': 0.6, 'line-emissive-strength': 1 }
                        });
                    }
                }
                if (!map.getSource('route')) {
                    map.addSource('route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} } });
                }
                if (!map.getLayer('route-glow')) {
                    map.addLayer({
                        id: 'route-glow', type: 'line', source: 'route', slot: 'top',
                        layout: { 'line-cap': 'round', 'line-join': 'round' },
                        paint: {
                            'line-color': '#4da3ff', 'line-width': 16, 'line-blur': 8, 'line-opacity': 0.55,
                            'line-emissive-strength': 1
                        }
                    });
                }
                if (!map.getLayer('route-line')) {
                    map.addLayer({
                        id: 'route-line', type: 'line', source: 'route', slot: 'top',
                        layout: { 'line-cap': 'round', 'line-join': 'round' },
                        paint: {
                            'line-color': '#ffffff', 'line-width': 5, 'line-opacity': 1,
                            'line-emissive-strength': 1
                        }
                    });
                }
                if (!map.getLayer('route-core')) {
                    map.addLayer({
                        id: 'route-core', type: 'line', source: 'route', slot: 'top',
                        layout: { 'line-cap': 'round', 'line-join': 'round' },
                        paint: {
                            'line-color': '#74b3f5', 'line-width': 4, 'line-opacity': 0,
                            'line-emissive-strength': 1
                        }
                    });
                }
                applyRouteLineColors();
                // Bâtiments 3D : les styles "Standard" (comme le mode nuit perso) les incluent nativement,
                // mais les styles classiques (streets-v12, navigation-day-v1) n'ont pas d'extrusion.
                // On ajoute une couche fill-extrusion pour ces derniers, pour que le rendu 3D soit
                // identique en mode jour et nuit.
                if (map.getSource('composite') && !map.getLayer('3d-buildings')) {
                    try {
                        map.addLayer({
                            id: '3d-buildings', source: 'composite', 'source-layer': 'building',
                            type: 'fill-extrusion', minzoom: 14,
                            filter: ['==', 'extrude', 'true'],
                            paint: {
                                'fill-extrusion-color': isDarkMode ? '#1a1a2e' : '#ddd',
                                'fill-extrusion-height': ['get', 'height'],
                                'fill-extrusion-base': ['get', 'min_height'],
                                'fill-extrusion-opacity': 0.7
                            }
                        });
                    } catch (e) { /* style Standard gère ça nativement, on ignore l'erreur */ }
                }
                applyBuildings3DVisibility();
                applyStandardBasemapConfig();
                _zfeEnsureMapLayers();
                if (zfeRouteCrossings.length) _zfeRefreshMapLayer();
                if (routeLineCoords) setRouteLine(routeLineCoords);
            } catch (e) {
                console.error("Erreur lors de la mise en place des couches de tracé :", e);
            }
        }
        map.on('load', setupMapLayers);
        map.on('load', function() {
            const bldToggle = document.getElementById('buildings-3d-toggle');
            if (bldToggle) bldToggle.checked = buildings3DEnabled;
            const ecoToggle = document.getElementById('eco-counter-toggle');
            if (ecoToggle) ecoToggle.checked = ecoCounterEnabled;
        });
        map.on('style.load', () => {
            setupMapLayers();
        });
        // Filet de sécurité : sur un style "Standard" (imports), la pile de couches peut encore
        // bouger juste après style.load le temps que les imports finissent de se résoudre.
        // "idle" garantit que tout est stabilisé — on revérifie/réinjecte le tracé à ce moment-là.
        map.on('idle', setupMapLayers);

        // Couleur du tracé selon le thème : en mode nuit, effet ligne blanche + halo bleu clair.
        // En mode jour, style Google Maps : bleu royal avec centre plus clair via double couche.
        function applyRouteLineColors() {
            if (!map.getLayer('route-line') || !map.getLayer('route-glow')) return;
            if (isDarkMode) {
                map.setPaintProperty('route-line', 'line-color', '#ffffff');
                map.setPaintProperty('route-line', 'line-width', 5);
                map.setPaintProperty('route-glow', 'line-color', '#4da3ff');
                map.setPaintProperty('route-glow', 'line-width', 16);
                map.setPaintProperty('route-glow', 'line-blur', 8);
                map.setPaintProperty('route-glow', 'line-opacity', 0.55);
                // Cacher la couche "bord" si elle existe
                if (map.getLayer('route-border')) map.setPaintProperty('route-border', 'line-opacity', 0);
            } else {
                // Halo/ombre extérieure bleu foncé
                map.setPaintProperty('route-glow', 'line-color', '#1a6bbf');
                map.setPaintProperty('route-glow', 'line-width', 6);
                map.setPaintProperty('route-glow', 'line-blur', 1);
                map.setPaintProperty('route-glow', 'line-opacity', 1);
                // Ligne principale : bleu vif (bord légèrement foncé par le halo en dessous)
                map.setPaintProperty('route-line', 'line-color', '#4a90e2');
                map.setPaintProperty('route-line', 'line-width', 9);
                // Ligne centrale claire (centre plus lumineux)
                if (map.getLayer('route-core')) {
                    map.setPaintProperty('route-core', 'line-opacity', 1);
                    map.setPaintProperty('route-core', 'line-color', '#74b3f5');
                    map.setPaintProperty('route-core', 'line-width', 4);
                }
            }
        }

        function setRouteLine(coordinates) {
            routeLineCoords = coordinates;
            try {
                const src = map.getSource('route');
                if (!src) { console.warn("setRouteLine : source 'route' introuvable au moment de l'appel."); return; }
                src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: {} });
                // ⚠ setRouteLine est appelé depuis la boucle rAF (60 fois/s).
                // Ce log évaluait getLayer() + isStyleLoaded() à chaque frame,
                // même DevTools fermé. Désormais sous flag DEBUG.
                if (DEBUG) {
                    console.log("Tracé mis à jour :", coordinates.length, "points — couche présente :", !!map.getLayer('route-line'), "style chargé :", map.isStyleLoaded());
                }
            } catch (e) {
                console.error("Erreur lors de l'affichage du tracé :", e);
            }
        }
        function clearRouteLine() {
            routeLineCoords = null;
            const src = map.getSource('route');
            if (src) src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} });
        }
        function getRouteBounds() {
            if (!routeLineCoords || routeLineCoords.length < 2) return null;
            const bbox = turf.bbox({ type: 'Feature', geometry: { type: 'LineString', coordinates: routeLineCoords } });
            return [[bbox[0], bbox[1]], [bbox[2], bbox[3]]];
        }

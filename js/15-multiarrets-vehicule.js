        // === MULTI-ARRÊTS : MODAL ===
        // ═══════════════════════════════════════════════════════════════

        function addModalWaypoint(label = '', coords = null) {
            const idx = modalWaypoints.length;
            modalWaypoints.push({ coords, label });

            const container = document.getElementById('modal-waypoints-container');
            const wrapper = document.createElement('div');
            wrapper.id = `waypoint-row-${idx}`;
            wrapper.style.cssText = 'position:relative;';
            wrapper.innerHTML = `
                <div class="waypoint-row">
                    <div class="waypoint-dot"></div>
                    <div class="waypoint-input-wrap">
                        <input type="text" id="waypoint-input-${idx}" placeholder="Étape ${idx + 1}…"
                            value="${label}" autocomplete="off">
                        <button class="btn-map" onclick="pickOnMapForModal('wp-${idx}')" title="Choisir sur la carte">
                            <svg viewBox="0 0 24 24" width="16" height="16"><path fill="currentColor" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.4" fill="#0d1420"/></svg>
                        </button>
                        <button class="waypoint-remove-btn" onclick="removeModalWaypoint(${idx})" title="Supprimer">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                    </div>
                </div>
                <div class="addr-suggestions" id="waypoint-suggestions-${idx}" style="left:18px;right:0;top:auto;"></div>`;
            container.appendChild(wrapper);

            // Activer l'autocomplétion sur ce champ
            setupAddressAutocomplete(`waypoint-input-${idx}`, `waypoint-suggestions-${idx}`, (coords, lbl) => {
                modalWaypoints[idx] = { coords, label: lbl || document.getElementById(`waypoint-input-${idx}`).value };
                refreshWaypointMarkers();
                recalcIfReady();
            });

            document.getElementById(`waypoint-input-${idx}`).focus();
        }

        function removeModalWaypoint(idx) {
            modalWaypoints.splice(idx, 1);
            rebuildWaypointRows();
            refreshWaypointMarkers();
            recalcIfReady();
        }

        function rebuildWaypointRows() {
            const container = document.getElementById('modal-waypoints-container');
            container.innerHTML = '';
            const saved = [...modalWaypoints];
            modalWaypoints = [];
            saved.forEach(wp => addModalWaypoint(wp.label, wp.coords));
        }

        function recalcIfReady() {
            document.getElementById('trip-preview').style.display = 'none';
            document.getElementById('btn-validate-trip').disabled = true;
            // normalizeLngLat et non `w.coords` : un [NaN, NaN] est truthy, il passait
            // donc cette garde et l'itinéraire se calculait en ignorant silencieusement
            // l'étape (calculateTripPreview la filtre plus loin). Mieux vaut attendre
            // que l'étape soit correctement renseignée.
            if (modalStartCoords && modalEndCoords && modalWaypoints.every(w => normalizeLngLat(w.coords))) {
                calculateTripPreview();
            }
        }

        function resetModalWaypoints() {
            modalWaypoints = [];
            document.getElementById('modal-waypoints-container').innerHTML = '';
            clearWaypointMarkers();
        }

        function clearModalStart() {
            document.getElementById('modal-start-addr').value = ""; modalStartManuallyEdited = true; modalStartCoords = null;
            document.getElementById('trip-preview').style.display = 'none'; document.getElementById('btn-validate-trip').disabled = true;
            document.getElementById('modal-status').innerText = ""; document.getElementById('modal-start-addr').focus();
        }
        function clearModalEnd() {
            document.getElementById('modal-end-addr').value = ""; modalEndCoords = null;
            document.getElementById('trip-preview').style.display = 'none'; document.getElementById('btn-validate-trip').disabled = true;
            document.getElementById('modal-status').innerText = ""; document.getElementById('modal-end-addr').focus();
        }

        /* Dernières bornes demandées pour le cadrage du modal, et hauteur de fenêtre
           au moment de ce cadrage. Sur Android, le clavier virtuel réduit de moitié
           window.innerHeight : un fitBounds calculé à ce moment-là ne dispose que de
           quelques dizaines de pixels de carte visible et dézoome de deux niveaux.
           On garde les bornes pour rejouer le cadrage dès que la fenêtre a retrouvé
           sa hauteur normale (clavier refermé). */
        let _modalFitBounds = null;
        let _modalFitViewportH = 0;
        let _modalFitCanvas = '';   // « largeur x hauteur » du canevas au moment du cadrage

        // `_clampMapPadding()` a rejoint js/00-noyau-calculs.js : c'est de la géométrie
        // pure, et le bug qu'elle corrige (padding non borné → centre NaN) est
        // exactement le genre de calcul qui doit être couvert par un test.

        let _modalFitRetry = false;

        function fitMapToModalRoute(bounds, extraMarkers = []) {
            if (!bounds) return;
            // Dernier filet : des bornes non numériques feraient lever Mapbox.
            if (!Array.isArray(bounds) || bounds.length !== 2 || !isLngLat(bounds[0]) || !isLngLat(bounds[1])) {
                logAppError('fitMapToModalRoute', new Error('bornes invalides : ' + JSON.stringify(bounds)));
                return;
            }
            const isLandscape = window.matchMedia('(max-height: 600px) and (orientation: landscape)').matches;
            const modalEl = document.getElementById('trip-modal');
            /* resize INCONDITIONNEL. Il était réservé à `map.loaded()`, or c'est
               précisément quand la carte n'a pas fini de charger que sa taille interne
               est périmée — et c'est elle, non le rect DOM, qui sert au calcul du
               cadrage. Sur téléphone le premier aperçu peut tomber dans cette fenêtre,
               jamais sur un poste de bureau : encore un écart que le simulateur ne
               reproduit pas. */
            tenterSansBruit(() => map.resize(), 'fitMapToModalRoute/resize');

            _modalFitBounds = bounds;
            _modalFitViewportH = window.innerHeight;

            /* ⚠ Les `padding` de fitBounds sont exprimés en pixels du CANEVAS : on mesure
               donc tout sur le conteneur de la carte, jamais sur `window`. Sur mobile, la
               barre d'URL rétractable et les barres système font diverger window.innerHeight
               de la hauteur réelle du canevas. Surestimer la place prise par le modal réduit
               d'autant la bande de carte laissée à fitBounds, qui compense en dézoomant —
               d'où un trajet vu de beaucoup trop loin sur téléphone, alors que le simulateur
               (iframe de bureau, où les deux hauteurs coïncident) cadrait correctement. */
            /* ⚠⚠ TOUTES LES MESURES DANS LE MÊME ESPACE : LES PIXELS DE MISE EN PAGE.

               La version précédente prenait la taille sur le CANEVAS
               (`map.getCanvas().clientWidth/Height`) puis la mélangeait, quelques lignes
               plus bas, à des mesures de mise en page (`overlayEl.offsetHeight`,
               `modalEl.offsetHeight`) dans `sousOverlay = mapH - overlayEl.offsetHeight`.
               Soustraire une hauteur de mise en page d'une hauteur de canevas n'a de sens
               que si les deux coïncident exactement — ce qui n'est PAS garanti : le canevas
               d'une carte WebGL est dimensionné en tenant compte du rapport de pixels de
               l'appareil, et selon l'état du `resize()` interne il peut rendre la taille du
               tampon de dessin plutôt que celle de la boîte CSS.

               Dès que les deux divergent, `sousOverlay` explose, `safeBottom` avec lui, et
               `fitBounds` reçoit un padding sans commune mesure avec la carte réelle : il
               compense en dézoomant de plusieurs niveaux. C'est le « zoom global trop
               éloigné » — un facteur constant d'environ 4 mesuré sur deux trajets sans
               rapport, signature d'une erreur d'échelle et non d'un mauvais réglage.
               Et le garde-fou `_clampMapPadding()` ne pouvait pas le rattraper : on lui
               passait la MÊME hauteur gonflée, donc le padding lui paraissait raisonnable.

               Le rect du conteneur est la bonne référence : c'est la surface réellement
               occupée à l'écran, dans la même unité que tous les `offsetHeight` d'à côté,
               et `map.resize()` vient d'être appelé juste au-dessus — Mapbox est donc
               aligné dessus. Le canevas ne sert plus que de secours si le rect est
               dégénéré (conteneur pas encore dimensionné). */
            const mapRect = map.getContainer().getBoundingClientRect();
            const cv = (() => { try { return map.getCanvas(); } catch (e) { return null; } })();
            const mapW = mapRect.width  || (cv && cv.clientWidth)  || window.innerWidth;
            const mapH = mapRect.height || (cv && cv.clientHeight) || window.innerHeight;

            /* Canevas dégénéré : aucun cadrage possible, et fitBounds y répondrait par un
               centre NaN. On réessaie une fois à la frame suivante — le cas typique est
               un aperçu demandé avant que le conteneur ait sa taille définitive. */
            if (mapW < 60 || mapH < 60) {
                if (!_modalFitRetry) {
                    _modalFitRetry = true;
                    requestAnimationFrame(() => { _modalFitRetry = false; fitMapToModalRoute(bounds, extraMarkers); });
                    return;
                }
                logAppError('fitMapToModalRoute', new Error('canevas non dimensionné : ' + mapW + '×' + mapH));
                return;
            }

            /* ⚠ GÉOMÉTRIE DE MISE EN PAGE (`offsetHeight`), JAMAIS le rect du modal.
               Le modal arrive par une transition : mesuré pendant qu'il glisse, son rect
               rend une position intermédiaire — voire sa position de départ, hors écran.
               `safeBottom` était alors très sous-estimé, `fitBounds` cadrait le trajet sur
               toute la hauteur de la carte, puis le modal montait en recouvrir la moitié
               basse : le trajet paraissait ne pas tenir à l'écran, alors qu'il avait été
               cadré pour un espace qui n'existait plus. `offsetHeight` décrit la boîte de
               mise en page et ignore le `transform` — la mesure est juste avant, pendant
               et après l'animation. Même piège, même parade que `_gasScanPadding()`.
               La hauteur des barres du bas s'ajoute parce que l'overlay s'arrête au-dessus
               d'elles (`height: calc(100% - 64px)`) : le modal ne touche pas le bas de la
               carte. */
            let safeBottom;
            const overlayEl = document.getElementById('trip-modal-overlay');
            if (modalEl && modalEl.offsetHeight > 0) {
                /* Zone RÉELLEMENT masquée = ce que l'overlay laisse sous lui + la hauteur
                   du modal. L'overlay s'arrête au-dessus des barres du bas
                   (`height: calc(100% - 64px)`) et le modal y est collé en bas (flex-end).
                   ⚠ Ne pas y substituer getBottomBarsH() : cette barre-là mesurait 86 px
                   quand l'overlay n'en réserve que 64, et les 22 px d'écart s'ajoutaient à
                   une marge de 30 déjà généreuse. Sur un canevas de 842 px, ces ~50 px
                   retirés à la bande de carte se paient en zoom — mesuré : il ne restait
                   que 287 px, soit un tiers de l'écran, pour montrer tout le trajet. */
                const sousOverlay = Math.max(0, mapH - (overlayEl ? overlayEl.offsetHeight : mapH));
                safeBottom = sousOverlay + modalEl.offsetHeight + 12;
            } else {
                // Modal pas encore affiché (overlay display:none) : on réserve la moitié basse.
                safeBottom = mapH * 0.55;
            }

            const nextTurnPanel = document.getElementById('next-turn-panel');
            const topPad = (nextTurnPanel && nextTurnPanel.classList.contains('visible'))
                ? (nextTurnPanel.offsetHeight + 20) : 50;

            let padding;
            if (isLandscape) {
                padding = { top: topPad, left: ((modalEl && modalEl.offsetWidth) || 300) + 30, bottom: 60, right: 40 };
            } else {
                /* Filet de sécurité : on garantit à fitBounds une bande de carte
                   exploitable. Sans cela, un cadrage déclenché clavier ouvert
                   (innerHeight ~450 au lieu de ~830) ne lui laisserait que ~70 px
                   et la carte partirait deux niveaux de zoom trop loin. */
                const MIN_MAP_BAND = 150;
                const maxBottom = Math.max(40, mapH - topPad - MIN_MAP_BAND);
                safeBottom = Math.min(safeBottom, maxBottom);
                padding = { top: topPad, left: 40, right: 40, bottom: safeBottom };
            }

            /* Normalisation FINALE et commune aux deux orientations — c'est elle qui
               empêche le `Invalid LngLat object: (NaN, NaN)`. Le calcul portrait
               ci-dessus borne déjà le bas, mais rien ne bornait la largeur en paysage
               (un modal large + `right: 40` peut dépasser la largeur du canevas), ni
               aucun des deux quand le canevas est plus petit qu'attendu. */
            padding = _clampMapPadding(padding, mapW, mapH);

            /* fitMapToModalRoute JOURNALISE au lieu de lever — règle générale pour toute
               commande caméra. Sans ce try, l'exception remontait dans le bloc d'affichage
               de calculateTripPreview() et emportait avec elle la ligne suivante,
               `isUserPanning = true` : la caméra n'était donc même pas détachée, et la
               boucle de suivi GPS ramenait aussitôt la vue sur le conducteur. Sur un poste
               de bureau sans fix GPS, rien ne venait la ramener — d'où un bug qui ne se
               manifestait que sur téléphone. */
            try {
                /* Trace de diagnostic. `cameraForBounds` fait le MÊME calcul que fitBounds
                   sans toucher la caméra : on connaît donc le zoom visé avant de l'appliquer.
                   Comparé au zoom relevé 1,8 s plus tard, il sépare les deux familles de
                   causes — un zoom visé déjà mauvais est un problème de géométrie ; un zoom
                   visé correct puis remplacé signifie qu'une autre commande caméra a repris
                   la main (boucle de suivi GPS, flyTo différé…). */
                let camZoom = null;
                // Mesure de diagnostic uniquement (zoom vise avant application) : son echec ne
                // change rien au cadrage qui suit. Voir la methode cameraForBounds d'AGENTS.md.
                tenterSansBruit(() => { const c = map.cameraForBounds(bounds, { padding, maxZoom: 18, bearing: 0, pitch: 0 }); if (c) camZoom = +c.zoom.toFixed(2); }, 'diagCameraForBounds');
                /* `cvBrut` expose la taille rendue par le canevas À CÔTÉ de celle du rect :
                   si les deux diffèrent, la trace le dit au lieu de le laisser deviner.
                   C'est l'écart qui a produit le sur-dézoom, il doit rester sous les yeux. */
                logDiag('fit', {
                    rect: Math.round(mapW) + 'x' + Math.round(mapH),
                    cvBrut: cv ? (cv.clientWidth + 'x' + cv.clientHeight) : '-',
                    dpr: window.devicePixelRatio,
                    win: window.innerWidth + 'x' + window.innerHeight,
                    pad: padding, modalH: (modalEl && modalEl.offsetHeight) || 0,
                    land: isLandscape, panning: isUserPanning,
                    pitch: +map.getPitch().toFixed(0), bearing: +map.getBearing().toFixed(0),
                    zAvant: +map.getZoom().toFixed(2), zVise: camZoom
                });
                setTimeout(() => {
                    // ⚠ PAS de logAppError : on est DANS une trace de diagnostic.
                    // Journaliser l'echec d'une journalisation n'apporte rien.
                    try {
                        logDiag('fit+1.8s', { z: +map.getZoom().toFixed(2), panning: isUserPanning, course: isCourseStarted });
                    } catch (e) {}
                }, 1800);

                /* Taille du canevas AU MOMENT du calcul. C'est elle, et pas
                   window.innerHeight, qui conditionne le zoom retenu : la mémoriser permet
                   de détecter après coup que le cadrage a été calculé pour un écran qui
                   n'existe plus. Voir initModalRefitOnCanvasResize(). */
                _modalFitCanvas = mapW + 'x' + mapH;
                /* bearing et pitch remis à plat EXPLICITEMENT. cameraForBounds raisonne sur
                   une vue à plat ; laissée inclinée (mode 3D) ou pivotée (cap en haut), la
                   caméra montre une surface au sol tout autre que celle calculée, et le
                   cadrage est faux sans qu'aucune erreur ne soit levée. Un aperçu de trajet
                   se lit de toute façon mieux à plat et au nord. */
                map.fitBounds(bounds, { padding, maxZoom: 18, bearing: 0, pitch: 0, animate: true, duration: 600 });
            } catch (e) {
                logAppError('fitMapToModalRoute/fitBounds', e);
                if (DEBUG) console.warn('[fit] padding', padding, 'canevas', mapW + '×' + mapH);
            }
        }

        /* Rejoue le cadrage du modal quand la fenêtre regagne de la hauteur, c'est-à-dire
           quand le clavier virtuel se referme. Sans cela, le zoom calculé sur une fenêtre
           amputée reste figé et la carte paraît beaucoup trop éloignée sur smartphone. */
        (function initModalRefitOnViewportGrow() {
            let t = null;
            const onResize = () => {
                clearTimeout(t);
                t = setTimeout(() => {
                    const overlay = document.getElementById('trip-modal-overlay');
                    if (!overlay || !overlay.classList.contains('open')) return;
                    if (!_modalFitBounds) return;
                    // On ne recadre que si la fenêtre a réellement grandi (clavier fermé),
                    // jamais sur un simple redimensionnement mineur.
                    if (window.innerHeight <= _modalFitViewportH + 40) return;
                    fitMapToModalRoute(_modalFitBounds);
                }, 300);
            };
            window.addEventListener('resize', onResize);
            if (window.visualViewport) window.visualViewport.addEventListener('resize', onResize);
        })();

        /* ⚠ LE FILET DÉCISIF — on surveille le CANEVAS, pas la fenêtre.
           Le garde-fou ci-dessus attend un `resize` de fenêtre accompagné d'un gain de
           hauteur. Deux failles, et ce sont elles qui laissaient passer un aperçu « vu de
           beaucoup trop loin » :
             1. une WebView Android en mode `adjustPan` ne change PAS `window.innerHeight`
                quand le clavier monte ou descend — aucun `resize`, donc aucun recadrage ;
             2. `window.innerHeight` n'est de toute façon pas la grandeur qui décide du
                zoom. C'est la hauteur du CANEVAS. Les deux divergent tant que Mapbox n'a
                pas fait son `resize()` interne, et c'est là tout le sujet.

           Or un cadrage calculé pour un canevas amputé garde son zoom quand le canevas
           grandit : Mapbox conserve centre et zoom, il découvre simplement plus de terrain.
           Le trajet occupe alors une fraction ridicule d'un grand écran — le symptôme
           exact d'un « zoom global trop éloigné », alors que le calcul d'origine était
           juste pour la surface qu'il connaissait.

           On compare donc la taille du canevas à celle mémorisée pendant `fitBounds`, et
           on rejoue le cadrage à la moindre divergence réelle. Couvre d'un seul mécanisme
           le clavier, les barres du navigateur, la rotation et le redimensionnement de la
           fenêtre du simulateur. */
        (function initModalRefitOnCanvasResize() {
            if (typeof ResizeObserver === 'undefined') return;
            let t = null;
            const canvas = (() => { try { return map.getCanvas(); } catch (e) { return null; } })();
            if (!canvas) return;

            const ro = new ResizeObserver(() => {
                clearTimeout(t);
                // Laisse le redimensionnement se stabiliser : une animation de clavier
                // émet une dizaine d'événements, un seul recadrage suffit — et fitBounds
                // relancé à chaque frame se battrait avec sa propre animation.
                t = setTimeout(() => {
                    const overlay = document.getElementById('trip-modal-overlay');
                    if (!overlay || !overlay.classList.contains('open')) return;
                    if (!_modalFitBounds || !_modalFitCanvas) return;
                    let w = 0, h = 0;
                    try { w = canvas.clientWidth; h = canvas.clientHeight; } catch (e) { return; }
                    if (w < 60 || h < 60) return;
                    // Tolérance de 8 px : un arrondi de sous-pixel n'est pas un changement
                    // d'écran, et rejouer le cadrage sur du bruit ferait vibrer la carte.
                    const [w0, h0] = _modalFitCanvas.split('x').map(Number);
                    if (Math.abs(w - w0) <= 8 && Math.abs(h - h0) <= 8) return;
                    logDiag('refit/canvas', { avant: _modalFitCanvas, apres: w + 'x' + h });
                    fitMapToModalRoute(_modalFitBounds);
                }, 320);
            });
            tenterSansBruit(() => ro.observe(canvas), 'modalRefit/observe');
        })();

        function onAvoidTollsChange(src) {
            avoidTolls = src ? src.checked : false;
            localStorage.setItem('gps_avoid_tolls', avoidTolls ? '1' : '0');
            ['avoid-tolls-toggle-modal'].forEach(id => {
                const cb = document.getElementById(id);
                if (cb && cb !== src) cb.checked = avoidTolls;
            });
            // Recalculer automatiquement si les deux adresses sont disponibles
            if (modalStartCoords && modalEndCoords) calculateTripPreview();
        }

        async function fetchRouteMapbox(startCoords, endCoords, avoidTolls, fastTimeout = false, waypoints = []) {
            const allCoords = [startCoords, ...waypoints, endCoords];
            const coordStr = allCoords.map(c => `${c[0]},${c[1]}`).join(';');
            const alts = waypoints.length === 0 ? 'true' : 'false';
            const baseParams = `?geometries=geojson&steps=true&banner_instructions=true&overview=full&alternatives=${alts}&annotations=maxspeed,speed,distance&access_token=${MAPBOX_TOKEN}`;
            const tollParam = avoidTolls ? '&exclude=toll' : '';

            // Tentative 1 : driving-traffic (trafic temps réel, préféré)
            try {
                const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordStr}${baseParams}${tollParam}`;
                const res = await fetchResilient(url, {}, { timeoutMs: fastTimeout ? 6000 : 15000, retries: 1 });
                const data = await res.json();
                if (data.routes && data.routes.length > 0) return { code: "Ok", routes: data.routes };
            } catch(e) { /* on tente le fallback */ }

            // Tentative 2 : driving sans trafic (plus fiable sur longue distance / hors réseau dense)
            const urlFallback = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}${baseParams}${tollParam}`;
            const resFallback = await fetchResilient(urlFallback, {}, { timeoutMs: fastTimeout ? 8000 : 20000, retries: 1 });
            const dataFallback = await resFallback.json();
            if (!dataFallback.routes || dataFallback.routes.length === 0) throw new Error("Itinéraire introuvable.");
            return { code: "Ok", routes: dataFallback.routes };
        }

        // Corrige les coords d'une station via géocodage Mapbox de son adresse
        // Plus fiable que OSRM /nearest qui peut snappe sur le mauvais tronçon
        async function resolveStationCoords(station) {
            // Stratégie : on cherche le meilleur point routier pour le waypoint.
            // Deux cas distincts selon la distance de la station au tracé principal.

            const snapOnRoute = (maxDist) => {
                if (!currentTurfLine) return null;
                try {
                    const pt      = turf.point([station.lng, station.lat]);
                    const snapped = turf.nearestPointOnLine(currentTurfLine, pt, { units: 'meters' });
                    const distM   = snapped.properties.dist;
                    if (distM <= maxDist) return { coords: snapped.geometry.coordinates, distM };
                } catch (e) { if (DEBUG) console.warn('[snapOnRoute] projection turf impossible :', e); }
                return null;
            };

            // CAS 1 : station proche du tracé (≤ 500m).
            // On snape directement sur la ligne principale — le waypoint est sur le
            // réseau Mapbox, même sens de circulation, aucun crochet possible.
            const close = snapOnRoute(500);
            if (close) {
                const [sLng, sLat] = close.coords;
                console.log(`[StationSnap] Snap tracé → ${sLng.toFixed(5)},${sLat.toFixed(5)} (Δ${Math.round(close.distM)}m)`);
                return [sLng, sLat];
            }

            // CAS 2 : station éloignée du tracé (> 500m).
            // Géocodage par adresse — retourne un point sur le réseau routier Mapbox.
            if (station.addr && station.addr.trim() !== '') {
                try {
                    const q   = encodeURIComponent(station.addr);
                    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json`
                        + `?access_token=${MAPBOX_TOKEN}&limit=1&language=fr`
                        + `&types=address,poi&proximity=${station.lng},${station.lat}`;
                    const res  = await fetch(url, { signal: AbortSignal.timeout(5000) });
                    if (res.ok) {
                        const data = await res.json();
                        if (data.features?.[0]) {
                            const [gLng, gLat] = data.features[0].geometry.coordinates;
                            const dist = turf.distance(
                                turf.point([station.lng, station.lat]),
                                turf.point([gLng, gLat]),
                                { units: 'meters' }
                            );
                            if (dist < 800) {
                                console.log(`[StationSnap] Géocodage → ${gLng.toFixed(5)},${gLat.toFixed(5)} (Δ${Math.round(dist)}m)`);
                                return [gLng, gLat];
                            }
                        }
                    }
                /* Réseau coupé, quota Mapbox, adresse ingéocodable : le repli sur les
                   coordonnées brutes de la source (juste en dessous) est un comportement
                   PRÉVU, pas une panne — il ne mérite donc pas le journal d'erreurs, qui
                   se remplirait à chaque station d'un trajet mal couvert. Mais plus de
                   silence total : sous ?debug=1 on voit laquelle a échoué et pourquoi. */
                } catch (e) { if (DEBUG) console.warn(`[StationSnap] géocodage de « ${station.addr} » impossible :`, e); }
            }

            console.warn(`[StationSnap] Fallback coords brutes pour ${station.name}`);
            return [station.lng, station.lat];
        }

        // snapToRoad conservé pour les bornes EV (pas d'adresse textuelle fiable)
        async function snapToRoad(lng, lat) {
            return [lng, lat]; // désactivé — causait des detours incorrects
        }

        // Variante qui accepte une adresse textuelle comme waypoint.
        // Mapbox Directions gère le géocodage en interne : on encode l'adresse dans
        // la chaîne de coordonnées avec le format "lng,lat" ou "adresse url-encodée".
        // En pratique, l'API Directions v5 n'accepte pas d'adresses textuelles —
        // on géocode d'abord via l'API Geocoding, puis on appelle Directions.
        async function fetchRouteMapboxWithWaypointAddr(startCoords, addr, hintLng, hintLat, endCoords, avoidTolls) {
            // Géocodage de l'adresse avec proximity sur les coords brutes de la station
            let waypointCoords = [hintLng, hintLat]; // fallback coords brutes
            try {
                // Abréviations développées + bis/ter : sans ça « 72 BLD DE VERDUN »
                // ne résout pas au même endroit que « 72 Boulevard de Verdun ».
                const q = encodeURIComponent(normalizeStationAddr(addr));
                const geoUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json`
                    + `?access_token=${MAPBOX_TOKEN}&limit=1&language=fr`
                    + `&types=address,poi&proximity=${hintLng},${hintLat}`;
                const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(5000) });
                if (geoRes.ok) {
                    const geoData = await geoRes.json();
                    const best = _gasPickBestPoint(geoData.features?.[0], hintLng, hintLat, `détour "${addr}"`);
                    if (best) waypointCoords = best;
                }
            } catch(e) {
                console.warn('[StationAddr] Géocodage échoué, fallback coords brutes :', e.message);
            }
            return fetchRouteMapboxWithWaypoint(startCoords, waypointCoords, endCoords, avoidTolls);
        }

        async function fetchRouteMapboxWithWaypoint(startCoords, waypointCoords, endCoords, avoidTolls) {
            // Mêmes contraintes de routage que fetchRouteMapbox (l'itinéraire saisi à la
            // main) : c'est ce qui garantit qu'une station atteinte par la liste emprunte
            // le même chemin que la même adresse tapée au clavier.
            const coordStr = `${startCoords[0]},${startCoords[1]};${waypointCoords[0]},${waypointCoords[1]};${endCoords[0]},${endCoords[1]}`;
            /* ⚠ `approaches=curb` RETIRÉ du waypoint station — il produisait l'inverse
               de son intention. Sur un point INTERMÉDIAIRE, `curb` contraint à la fois
               l'arrivée ET le redépart à respecter le côté de la chaussée : si le point
               tombe sur la mauvaise voie d'un boulevard à chaussées séparées, Mapbox n'a
               plus d'autre solution qu'un tour complet du pâté de maisons. Le même
               `curb` sur une DESTINATION finale est inoffensif — il n'y a pas de trajet
               après —, ce qui explique qu'un itinéraire saisi à la main vers la même
               adresse soit correct alors que l'arrêt station boucle.
               Arriver éventuellement du mauvais côté coûte quelques dizaines de mètres ;
               le détour imposé en coûtait plusieurs centaines.
               Repli si le symptôme inverse réapparaissait : remettre
               `&approaches=unrestricted;curb;unrestricted` dans baseParams. */
            const baseParams = `?geometries=geojson&steps=true&banner_instructions=true&overview=full&alternatives=false&annotations=maxspeed,speed,distance&access_token=${MAPBOX_TOKEN}`;
            const tollParam = avoidTolls ? '&exclude=toll' : '';

            // Tentative 1 : driving-traffic
            try {
                const url = `https://api.mapbox.com/directions/v5/mapbox/driving-traffic/${coordStr}${baseParams}${tollParam}`;
                const res = await fetchResilient(url, {}, { timeoutMs: 15000, retries: 1 });
                const data = await res.json();
                if (data.routes && data.routes.length > 0) return { code: "Ok", routes: data.routes };
            } catch(e) { /* fallback */ }

            // Tentative 2 : driving sans trafic
            const urlFallback = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordStr}${baseParams}${tollParam}`;
            const resFallback = await fetchResilient(urlFallback, {}, { timeoutMs: 20000, retries: 1 });
            const dataFallback = await resFallback.json();
            if (!dataFallback.routes || dataFallback.routes.length === 0) throw new Error("Itinéraire via station introuvable.");
            return { code: "Ok", routes: dataFallback.routes };
        }

        // === CONFIG VÉHICULE (consommation + prix carburant) ===

        // `_readLicensePoints()` et `LICENSE_POINTS_MAX` ont rejoint js/00-noyau-calculs.js.

        function loadVehicleConfig() {
            const type = localStorage.getItem('gps_vehicle_type') || 'thermique';
            return {
                type,
                consumption: parseFloat(localStorage.getItem('gps_vehicle_consumption') || '7'),
                fuelPrice:   parseFloat(localStorage.getItem('gps_fuel_price') || '1.75'),
                consumptionElec: parseFloat(localStorage.getItem('gps_vehicle_consumption_elec') || '18'),
                elecPrice:   parseFloat(localStorage.getItem('gps_elec_price') || '0.20'),
                licensePoints: _readLicensePoints(localStorage.getItem('gps_vehicle_license_points'), LICENSE_POINTS_MAX),
            };
        }

        /* ═══════════════════════════════════════════════════════════════════
           === PRIX DU CARBURANT : MOYENNE DES STATIONS DANS UN RAYON DE 3 KM ===

           Le prix au litre n'est plus une valeur saisie à la main : il vaut par défaut la
           MOYENNE relevée sur les stations situées dans 3 km autour du conducteur, via le
           même flux instantané data.economie.gouv.fr que le scan ⛽ (`fetchGasPointFR`,
           `extractGasPrice`, fichier 17). Le champ est donc `readonly` tant que
           l'utilisateur ne coche pas « Saisir le prix moi-même » — la case est le seul
           chemin vers une saisie manuelle, et son état est persisté.

           ⚠ « Le prix de l'essence » ne veut rien dire sans le carburant : un diesel et un
           SP98 diffèrent de plusieurs dizaines de centimes. D'où `gps_fuel_type`, choisi
           par l'utilisateur, qui pilote À LA FOIS la moyenne et le libellé du champ. Le
           cache est indexé dessus : changer de carburant force un nouveau calcul.

           ⚠ Les fonctions appelées ici vivent dans 17-stations-sources.js, chargé APRÈS ce
           fichier. Tous les appels ont lieu au runtime (handler, ouverture de panneau,
           setTimeout d'init) — jamais au top-level — sinon ReferenceError. Le
           `typeof … !== 'function'` reste une ceinture de sécurité. */

        const FUEL_AVG_RADIUS_KM = 3;                   // rayon demandé par l'utilisateur
        const FUEL_AVG_TTL_MS    = 6 * 60 * 60 * 1000;  // au-delà, la moyenne est repêchée
        const FUEL_AVG_MOVE_KM   = 3;                   // déplacement qui périme le cache
        const FUEL_KIND_LABEL    = { gazole: 'Gazole', sp95: 'SP95', e10: 'E10', sp98: 'SP98' };
        let _fuelAvgInFlight = false;   // une seule requête à la fois (ouverture répétée du panneau)

        function getFuelKind() {
            const k = localStorage.getItem('gps_fuel_type');
            return FUEL_KIND_LABEL[k] ? k : 'sp95';
        }

        function isFuelPriceManual() {
            return localStorage.getItem('gps_fuel_price_manual') === '1';
        }

        function _loadFuelAvgMeta() {
            try {
                const m = JSON.parse(localStorage.getItem('gps_fuel_price_auto') || 'null');
                return (m && m.price > 0) ? m : null;
            } catch (e) { return null; }
        }

        function _kmBetween(a, b) {
            try { return turf.distance(turf.point(a), turf.point(b), { units: 'kilometers' }); }
            catch (e) { return Infinity; }
        }

        function _setFuelSourceHint(txt) {
            const el = document.getElementById('fuel-price-source');
            if (el) el.textContent = txt;
        }

        function _fuelAgeLabel(ts) {
            const min = Math.max(0, Math.round((Date.now() - ts) / 60000));
            if (min < 2)  return "à l'instant";
            if (min < 60) return `il y a ${min} min`;
            const h = Math.round(min / 60);
            return h < 24 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
        }

        function _fuelSourceText(meta) {
            if (!meta) {
                return isFuelPriceManual()
                    ? 'Prix saisi manuellement'
                    : `Moyenne des stations dans un rayon de ${FUEL_AVG_RADIUS_KM} km autour de toi`;
            }
            const nom = FUEL_KIND_LABEL[meta.fuel] || meta.fuel;
            const moy = `moyenne ${nom} de ${meta.count} station${meta.count > 1 ? 's' : ''} `
                      + `dans ${FUEL_AVG_RADIUS_KM} km · ${_fuelAgeLabel(meta.ts)}`;
            return isFuelPriceManual()
                ? `Prix saisi manuellement — ${moy} : ${meta.price.toFixed(3)} €/L`
                : moy.charAt(0).toUpperCase() + moy.slice(1);
        }

        /* Applique la moyenne au champ ET au localStorage. En mode manuel on ne touche
           qu'au libellé : la valeur de l'utilisateur ne doit jamais être écrasée par un
           rafraîchissement de fond. */
        function _applyAutoFuelPrice(meta) {
            _setFuelSourceHint(_fuelSourceText(meta));
            if (!meta || isFuelPriceManual()) return;
            localStorage.setItem('gps_fuel_price', meta.price);
            const el = document.getElementById('fuel-price');
            if (el) el.value = meta.price.toFixed(3);
            // Repasse par le chemin normal : persistance + recalcul de l'aperçu de trajet
            // si le modal est ouvert. Évite de dupliquer ici cette mécanique.
            try { saveVehicleConfig(); } catch (e) { logAppError('_applyAutoFuelPrice', e); }
        }

        /* Reflète dans l'UI le carburant choisi et le mode (auto / manuel). Appelée à
           l'init du panneau, au changement de carburant et au basculement de la case. */
        function applyFuelKindUI() {
            const kind   = getFuelKind();
            const manual = isFuelPriceManual();
            document.querySelectorAll('.fuel-kind-pill').forEach(b =>
                b.classList.toggle('active', b.dataset.fuel === kind));
            const lbl = document.getElementById('fuel-price-label');
            if (lbl) lbl.textContent = `Prix ${FUEL_KIND_LABEL[kind]} (€/L)`;
            const chk = document.getElementById('fuel-price-manual');
            if (chk) chk.checked = manual;
            const input = document.getElementById('fuel-price');
            if (input) input.readOnly = !manual;
            const btn = document.getElementById('fuel-price-refresh');
            if (btn) btn.style.display = manual ? 'none' : '';
            _setFuelSourceHint(_fuelSourceText(_loadFuelAvgMeta()));
        }

        /* Recalcule la moyenne locale. `force` court-circuite le cache (bouton ↻ et
           changement de carburant) ; sans lui, une moyenne de moins de 6 h relevée à
           moins de 3 km d'ici est réutilisée telle quelle — inutile de solliciter
           data.gouv.fr à chaque ouverture du panneau. */
        async function refreshLocalFuelAverage(force = false) {
            const kind   = getFuelKind();
            const meta   = _loadFuelAvgMeta();
            const center = (typeof lastRealCoords !== 'undefined' && normalizeLngLat(lastRealCoords))
                         ? lastRealCoords : null;

            if (!force && meta && meta.fuel === kind
                && (Date.now() - meta.ts) < FUEL_AVG_TTL_MS
                && (!center || !meta.center || _kmBetween(center, meta.center) < FUEL_AVG_MOVE_KM)) {
                _applyAutoFuelPrice(meta);
                return meta.price;
            }

            /* Pas de fix GPS : on ne devine pas une position. On garde la dernière
               moyenne connue (ou la valeur par défaut) et on le DIT, plutôt que d'afficher
               un prix dont l'origine serait invisible. */
            if (!center) {
                if (meta) _applyAutoFuelPrice(meta);
                _setFuelSourceHint(meta
                    ? `Position GPS indisponible — ${_fuelSourceText(meta).charAt(0).toLowerCase()}${_fuelSourceText(meta).slice(1)}`
                    : 'Position GPS indisponible — moyenne locale non calculée.');
                return null;
            }
            if (_fuelAvgInFlight) return null;
            if (typeof fetchGasPointFR !== 'function' || typeof extractGasPrice !== 'function') {
                _setFuelSourceHint('Source des prix indisponible.');
                return null;
            }

            _fuelAvgInFlight = true;
            const btn   = document.getElementById('fuel-price-refresh');
            const input = document.getElementById('fuel-price');
            btn?.classList.add('spinning');
            input?.classList.add('fuel-refreshing');
            _setFuelSourceHint(`Relevé des stations dans ${FUEL_AVG_RADIUS_KM} km…`);

            try {
                const raw = await fetchGasPointFR(center[0], center[1], FUEL_AVG_RADIUS_KM);
                // Bornes larges volontairement : elles n'écartent que les valeurs
                // aberrantes du flux (prix en millièmes déjà normalisé par extractGasPrice,
                // champs vides, saisies fantaisistes), pas les hausses réelles.
                const prix = (raw || [])
                    .map(s => extractGasPrice(s, kind))
                    .filter(p => p != null && p > 0.5 && p < 5);

                if (prix.length === 0) {
                    if (meta) _applyAutoFuelPrice(meta);
                    _setFuelSourceHint(`Aucun prix ${FUEL_KIND_LABEL[kind]} relevé dans ${FUEL_AVG_RADIUS_KM} km`
                        + (meta ? ` — moyenne précédente conservée (${meta.price.toFixed(3)} €/L)` : ' — valeur par défaut conservée')
                        + '.');
                    return null;
                }

                const moyenne = Math.round((prix.reduce((a, b) => a + b, 0) / prix.length) * 1000) / 1000;
                const nouveau = { price: moyenne, count: prix.length, ts: Date.now(), center, fuel: kind };
                safeLocalSet('gps_fuel_price_auto', JSON.stringify(nouveau));
                _applyAutoFuelPrice(nouveau);
                return moyenne;
            } catch (e) {
                logAppError('refreshLocalFuelAverage', e);
                if (meta) _applyAutoFuelPrice(meta);
                _setFuelSourceHint('Relevé des prix impossible (réseau) — '
                    + (meta ? `moyenne précédente conservée (${meta.price.toFixed(3)} €/L).` : 'valeur par défaut conservée.'));
                return null;
            } finally {
                _fuelAvgInFlight = false;
                btn?.classList.remove('spinning');
                input?.classList.remove('fuel-refreshing');
            }
        }

        function selectFuelKind(kind) {
            if (!FUEL_KIND_LABEL[kind]) return;
            localStorage.setItem('gps_fuel_type', kind);
            applyFuelKindUI();
            // Le cache est indexé par carburant : un SP98 ne se déduit pas d'un gazole.
            refreshLocalFuelAverage(true);
        }

        /* La case est le SEUL moyen de reprendre la main sur le prix. En la décochant on
           réapplique aussitôt la moyenne locale, sinon le champ resterait figé sur la
           dernière valeur tapée alors que l'UI annonce une valeur automatique. */
        function setFuelPriceManual(checked) {
            localStorage.setItem('gps_fuel_price_manual', checked ? '1' : '0');
            applyFuelKindUI();
            if (checked) {
                document.getElementById('fuel-price')?.focus();
            } else {
                const meta = _loadFuelAvgMeta();
                if (meta) _applyAutoFuelPrice(meta);
                refreshLocalFuelAverage(false);
            }
        }

        // `calcEnergyCost()` a rejoint js/00-noyau-calculs.js.

        function updateFuelCostLabel() {
            const cfg = loadVehicleConfig();
            const lbl = document.getElementById('preview-fuel-label');
            if (!lbl) return;
            lbl.textContent = cfg.type === 'electrique' ? '• Coût énergie estimé' : '• Coût carburant estimé';
        }

        function selectVehicleType(type) {
            localStorage.setItem('gps_vehicle_type', type);
            document.querySelectorAll('.vtype-btn').forEach(b => b.classList.toggle('active', b.dataset.type === type));
            // Activer/désactiver les cellules selon le type
            const isElec = type === 'electrique';
            const isHybrid = type === 'hybride';
            document.getElementById('vcell-thermo-conso').classList.toggle('disabled', isElec);
            document.getElementById('vcell-thermo-price').classList.toggle('disabled', isElec);
            document.getElementById('vcell-elec-conso').classList.toggle('disabled', !isElec && !isHybrid);
            document.getElementById('vcell-elec-price').classList.toggle('disabled', !isElec && !isHybrid);
            // Le choix du carburant et la moyenne locale n'ont pas de sens sur un 100 % élec.
            document.getElementById('vcell-fuel-kind')?.classList.toggle('disabled', isElec);
            updateFuelCostLabel();
            saveVehicleConfig();

            // Mise à jour en temps réel des stations si un trajet est disponible
            const route = modalPendingRoute?.osrmData?.routes?.[0]
                       || (isCourseStarted && fullRouteLine ? { geometry: { coordinates: fullRouteLine.geometry.coordinates } } : null);
            if (route) {
                const coords = route.geometry?.coordinates;
                if (coords && coords.length > 1) {
                    // Délai court pour laisser le localStorage se mettre à jour
                    setTimeout(() => {
                        // Pendant la navigation : ouvrir le panneau stations s'il est fermé
                        if (isCourseStarted && !_gasStationsPanelOpen) {
                            toggleGasStationsPanel();
                        }
                        loadGasStationsForRoute(coords);
                    }, 100);
                }
            }
        }

        /* Conservée comme REDIRECTION : la section ne s'ouvre plus en accordéon mais en
           page pleine (openProfilSheet). Le bouton du Profil appelle directement la
           nouvelle fonction ; celle-ci couvre un appel qui subsisterait ailleurs, plutôt
           que de le laisser lever une ReferenceError. */
        function toggleVehiclePanel() { openProfilSheet('vehicle'); }

        function saveVehicleConfig() {
            const cfg = loadVehicleConfig();
            const consoEl     = document.getElementById('vehicle-consumption');
            const priceEl     = document.getElementById('fuel-price');
            const consoElecEl = document.getElementById('vehicle-consumption-elec');
            const elecPriceEl = document.getElementById('elec-price');
            const licensePointsEl = document.getElementById('vehicle-license-points');
            const conso     = parseFloat(consoEl?.value)     || cfg.consumption;
            const price     = parseFloat(priceEl?.value)     || cfg.fuelPrice;
            const consoElec = parseFloat(consoElecEl?.value) || cfg.consumptionElec;
            const elecPrice = parseFloat(elecPriceEl?.value) || cfg.elecPrice;
            const licensePoints = _readLicensePoints(licensePointsEl?.value, cfg.licensePoints);
            localStorage.setItem('gps_vehicle_consumption',      conso);
            localStorage.setItem('gps_fuel_price',               price);
            localStorage.setItem('gps_vehicle_consumption_elec', consoElec);
            localStorage.setItem('gps_elec_price',               elecPrice);
            localStorage.setItem('gps_vehicle_license_points',   licensePoints);
            // Recalculer le preview si ouvert
            const tripPreview = document.getElementById('trip-preview');
            if (tripPreview && tripPreview.style.display !== 'none' && modalPendingRoute) {
                const route = modalPendingRoute.osrmData?.routes?.[0];
                if (route) {
                    const distKm = route.distance / 1000;
                    const newCfg = loadVehicleConfig();
                    const energyCost = calcEnergyCost(distKm, newCfg);
                    const tollCost = avoidTolls ? 0 : estimateTollCost(modalPendingRoute.osrmData);
                    document.getElementById('preview-fuel-cost').innerText = energyCost.toFixed(2) + " €";
                    document.getElementById('preview-total-cost').innerText = "~" + (energyCost + tollCost).toFixed(2) + " €";
                    updateFuelCostLabel();
                }
            }
        }

        // ═══════════════════════════════════════════════════════════════════

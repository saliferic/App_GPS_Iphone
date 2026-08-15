        // === BOUTON RECHERCHE : changer de destination sans arrêter le trajet en cours ===
        let _navSearchMode = 'dest'; // 'dest' | 'stop'

        function setNavSearchMode(mode) {
            _navSearchMode = mode;
            const input = document.getElementById('nav-search-input');
            const btnDest = document.getElementById('nav-mode-dest');
            const btnStop = document.getElementById('nav-mode-stop');
            const label = document.getElementById('nav-search-label');
            if (btnDest) btnDest.classList.toggle('active', mode === 'dest');
            if (btnStop) btnStop.classList.toggle('active', mode === 'stop');
            if (label) label.innerText = mode === 'dest' ? 'Destination' : 'Arrêt à ajouter';
            input.placeholder = mode === 'dest' ? 'Où allez-vous ?' : 'Où faire une pause ?';
            input.value = '';
            document.getElementById('nav-search-suggestions').innerHTML = '';
            input.focus();
        }

        function toggleNavPinStop() {
            const btn = document.getElementById('nav-btn-pin-stop');
            if (pickingMode === 'nav-pin-stop') {
                // Annuler
                pickingMode = null;
                document.getElementById('map').classList.remove('crosshair-cursor');
                document.getElementById('map-pick-hint').classList.remove('visible');
                btn.classList.remove('active-pin');
                // Reprendre le suivi
                isUserPanning = false;
                showRecenterBtn(false);
            } else {
                // Activer le mode ping
                pickingMode = 'nav-pin-stop';
                document.getElementById('map').classList.add('crosshair-cursor');
                document.getElementById('map-pick-hint-text').innerText = '📍 Touchez la carte pour ajouter un ARRÊT';
                document.getElementById('map-pick-hint').classList.add('visible');
                btn.classList.add('active-pin');
                // Laisser l'utilisateur se déplacer librement sur la carte
                isUserPanning = true;
                showRecenterBtn(true);
                if (userPanningResumeTimer) { clearTimeout(userPanningResumeTimer); userPanningResumeTimer = null; }
            }
        }

        /* === FIN DE TRAJET LIBRE ===
           Choisir une destination met forcément fin au mode libre : `startCourse()`
           réinitialise distance, score et éco-conduite. Sans avertissement, les points
           accumulés disparaissaient sans que le conducteur comprenne pourquoi. On pose
           donc la question AVANT d'ouvrir la recherche, en annonçant ce qui sera encaissé,
           puis on laisse `stopCourse()` faire son travail habituel : crédit des points,
           coffre bonus si le trajet est sans faute, badges, objectifs, retour au panneau
           Itinéraire d'où l'utilisateur saisira sa nouvelle destination. */
        function openFreeCourseEnd() {
            const d = drivers[0];
            const gains  = clampTripScore(d ? d.score : 0);
            const parfait = !!d && !d.hasSpeeded && d.dist > 0.1;
            const gainEl = document.getElementById('freecourse-end-gain');

            if (gains > 0) {
                gainEl.classList.remove('neutre');
                gainEl.innerHTML = parfait
                    ? `Vous encaissez <b>${gains.toFixed(2)} pts</b> sur ${d.dist.toFixed(1)} km.<br>Trajet sans faute : le coffre bonus vous attend 🏆`
                    : `Vous encaissez <b>${gains.toFixed(2)} pts</b> sur ${d.dist.toFixed(1)} km.`;
            } else {
                gainEl.classList.add('neutre');
                gainEl.innerHTML = `Aucun point à encaisser sur ce trajet.<br>Votre total reste intact 🛡️`;
            }
            document.getElementById('freecourse-end-overlay').classList.add('open');
        }

        function closeFreeCourseEnd() {
            document.getElementById('freecourse-end-overlay').classList.remove('open');
        }

        function confirmEndFreeCourse() {
            closeFreeCourseEnd();
            // Fin de trajet standard : points, coffre, badges, objectifs, panneau Itinéraire.
            stopCourse();
        }

        function openQuickReroute() {
            // En trajet libre, la loupe ne mène pas à la recherche mais à la question de fin.
            if (isFreeCourseActive()) { openFreeCourseEnd(); return; }
            document.getElementById('nav-search-overlay').classList.add('visible');
            // La liste des contacts est reconstruite à l'ouverture : un contact créé
            // avant de démarrer doit être proposé ici sans recharger la page.
            renderFavoritesDropdown();
            const navFav = document.getElementById('nav-fav-dropdown');
            if (navFav) navFav.value = '';
            setNavSearchMode('dest'); // toujours commencer en mode destination
            // En trajet libre (pas de route calculée), le bouton « Ajouter un arrêt » n'a
            // pas de sens : il n'y a pas d'itinéraire dans lequel insérer une étape.
            document.querySelector('.nav-search-modes')?.classList.toggle('free-course', !fullRouteLine);
        }
        /* Loupe de la hotbox. Deux contextes, deux écrans — mais aucun n'est réimplémenté :
           - en roulant, c'est l'overlay de recherche (openQuickReroute, qui bascule
             lui-même sur la question de fin en trajet libre) ;
           - à l'arrêt, l'écran de recherche EST le panneau Itinéraire, qu'il suffit de
             déployer.
           ⚠ On ne peut PAS appeler switchMainTab('trajet') inconditionnellement : sur
           l'onglet déjà actif il joue le toggle du second appui et REPLIERAIT un panneau
           déjà ouvert. D'où la distinction sur l'onglet réellement affiché.
           Le champ n'est volontairement pas focalisé : cela déclencherait
           enterDestinationSearchMode(), qui réduit le panneau à la seule cellule
           Destination et fait surgir le clavier, là où on veut présenter l'écran complet
           (contacts, Réel/Simu, Démarrer, Trajet libre). */
        function openSearchFromHotbox() {
            if (isCourseStarted) { openQuickReroute(); return; }
            const surTrajet = document.querySelector('.panel-tab-content.active')?.id === 'panel-tab-trajet';
            if (!surTrajet) switchMainTab('trajet');
            else if (panelSnapState !== 'full') setPanelSnap('full');
        }

        function closeQuickReroute() {
            document.getElementById('nav-search-overlay').classList.remove('visible');
            document.getElementById('nav-search-suggestions').innerHTML = '';
            // Un ping carte resté armé bloquerait le prochain appui sur la carte.
            if (pickingMode === 'nav-dest') cancelNavMapPick();
        }

        /* Point d'application UNIQUE de la recherche en navigation : autocomplétion, dictée,
           ping sur la carte et contacts y convergent tous. Dupliquer ce bloc par source
           faisait diverger les comportements (les étapes n'étaient par exemple purgées que
           depuis l'autocomplétion). */
        // Trajet libre = course en cours SANS itinéraire calculé.
        function isFreeCourseActive() {
            return isCourseStarted && !fullRouteLine;
        }

        function applyNavSearchSelection(coords, label) {
            const valides = normalizeLngLat(coords);
            if (!valides) {
                const statusBox = document.getElementById('status');
                if (statusBox) { statusBox.innerText = "Adresse introuvable, réessayez."; statusBox.style.color = '#ff6b6b'; }
                return;
            }

            /* Ce point d'application ne concerne QUE le trajet guidé : en trajet libre la
               loupe ouvre la question de fin (voir openQuickReroute), la recherche n'est
               donc jamais accessible dans ce mode. Changer de destination en roulant sur un
               itinéraire recalcule immédiatement — c'est le geste « je change d'avis ». */
            if (_navSearchMode === 'stop') {
                // Insérer comme prochaine étape (avant la destination finale)
                navWaypoints.unshift({ coords: valides, label: label || 'Arrêt' });
            } else {
                exactEndCoords = valides;
                navWaypoints = []; // une nouvelle destination annule les étapes précédentes
            }
            updateNavWaypointBadge();
            const pos = drivers[0] && drivers[0].marker ? drivers[0].marker.getLngLat() : null;
            if (pos) recalculateRoute(pos.lng, pos.lat);
        }

        function clearNavSearch() {
            const input = document.getElementById('nav-search-input');
            if (input) { input.value = ''; input.focus(); }
            document.getElementById('nav-search-suggestions').innerHTML = '';
        }

        /* Ping sur la carte depuis la navigation. On referme l'overlay le temps de viser —
           il est ancré en bas et masquerait la moitié de la carte — et on détache la caméra
           du suivi GPS, sinon le prochain fix ramènerait la vue sur le conducteur avant
           même que l'utilisateur ait touché son point. */
        function toggleNavMapPick() {
            if (pickingMode === 'nav-dest') { cancelNavMapPick(); return; }
            pickingMode = 'nav-dest';
            document.getElementById('btn-pick-nav-dest')?.classList.add('active');
            document.getElementById('map').classList.add('crosshair-cursor');
            const hintText = document.getElementById('map-pick-hint-text');
            if (hintText) hintText.innerText = _navSearchMode === 'stop'
                ? '📍 Touchez la carte pour ajouter un ARRÊT'
                : '📍 Touchez la carte pour placer la DESTINATION';
            document.getElementById('map-pick-hint').classList.add('visible');
            document.getElementById('nav-search-overlay').classList.remove('visible');
            isUserPanning = true;
            showRecenterBtn(true);
            if (userPanningResumeTimer) { clearTimeout(userPanningResumeTimer); userPanningResumeTimer = null; }
        }

        function cancelNavMapPick() {
            pickingMode = null;
            document.getElementById('btn-pick-nav-dest')?.classList.remove('active');
            document.getElementById('map').classList.remove('crosshair-cursor');
            document.getElementById('map-pick-hint').classList.remove('visible');
        }

        /* Choisir un contact en roulant. Mêmes règles que dans le panneau Itinéraire : les
           coordonnées enregistrées font foi, le géocodage n'est qu'un rattrapage pour une
           fiche qui n'en a pas, et le résultat est mémorisé. On réarme aussi l'alerte
           « à 10 min » sur le nouveau contact, sinon elle continuerait de viser l'ancienne
           destination pour le reste du trajet. */
        async function loadFavoriteAddressForNav(index) {
            const dropdown = document.getElementById('nav-fav-dropdown');
            if (index === '') return;
            const fav = favorites[index];
            if (dropdown) dropdown.value = '';
            if (!fav) return;

            const input = document.getElementById('nav-search-input');
            if (input) input.value = fav.address;

            let favCoords = normalizeLngLat(fav.coords);
            if (!favCoords) {
                try { favCoords = normalizeLngLat(await geocode(fav.address)); } catch (e) { favCoords = null; }
                if (favCoords) {
                    fav.coords = favCoords;
                    try { localStorage.setItem('gps_favorites', JSON.stringify(favorites)); } catch (e) {}
                }
            }
            if (!favCoords) {
                if (input) input.value = '❌ Adresse du contact introuvable';
                return;
            }
            updateFavPhoneUI(index);
            if (_navSearchMode === 'dest') initTenMinForTrip();
            closeQuickReroute();
            applyNavSearchSelection(favCoords, fav.name || fav.address);
        }

        setupAddressAutocomplete('nav-search-input', 'nav-search-suggestions', (coords, label) => {
            closeQuickReroute();
            applyNavSearchSelection(coords, label);
        });

        /* Validation au clavier : jusqu'ici la loupe n'acceptait QUE le clic sur une
           suggestion. Taper une adresse puis appuyer sur Entrée ne faisait rien, alors que
           c'est le geste naturel — et le seul disponible quand l'autocomplétion ne propose
           rien. On géocode le texte tel quel, par le même chemin que la dictée. */
        (function initNavSearchEnter() {
            const input = document.getElementById('nav-search-input');
            if (!input) return;
            input.addEventListener('keydown', async (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const saisie = input.value.trim();
                if (saisie.length < 3) return;
                const placeholderOrigine = input.placeholder;
                input.placeholder = '🔎 Recherche…';
                try {
                    const trouve = await geocodeDetailed(saisie);
                    if (!trouve || !trouve.coords) throw new Error('Adresse introuvable');
                    input.placeholder = placeholderOrigine;
                    closeQuickReroute();
                    applyNavSearchSelection(trouve.coords, trouve.label || saisie);
                } catch (err) {
                    input.value = '';
                    input.placeholder = '❌ Adresse introuvable';
                    setTimeout(() => { input.placeholder = placeholderOrigine; }, 2200);
                }
            });
        })();

        // === BARRE DU BAS STYLE GOOGLE MAPS : itinéraires alternatifs ===
        let availableRoutesForNav = [];
        let selectedRouteIndexForNav = 0;
        function cycleAlternateRoute() {
            const statusBox = document.getElementById('status');
            if (!availableRoutesForNav || availableRoutesForNav.length < 2) {
                statusBox.innerText = "Aucun itinéraire alternatif disponible.";
                statusBox.style.color = "#f39c12";
                setTimeout(() => {
                    if (isCourseStarted) {
                        statusBox.innerText = isSimulationMode ? "Simulation Salif en cours 🚗" : "Course réelle démarrée ! Déplacez-vous 🚗";
                        statusBox.style.color = isSimulationMode ? "#8e44ad" : "#f39c12";
                    }
                }, 2500);
                return;
            }
            selectedRouteIndexForNav = (selectedRouteIndexForNav + 1) % availableRoutesForNav.length;
            const newRoute = availableRoutesForNav[selectedRouteIndexForNav];
            const geojsonRoute = newRoute.geometry;
            setRouteLine(geojsonRoute.coordinates);
            currentTurfLine = turf.lineString(geojsonRoute.coordinates);
            fullRouteLine = turf.lineString(geojsonRoute.coordinates);
            buildRouteSteps({ routes: [newRoute] });
            updateGL3DRoute();
            // Recale la progression de chaque conducteur sur le nouvel itinéraire choisi
            drivers.forEach(d => {
                if (!d.marker) return;
                try {
                    const pos = d.marker.getLngLat();
                    const snapped = turf.nearestPointOnLine(currentTurfLine, turf.point([pos.lng, pos.lat]), { units: 'kilometers' });
                    d.dist = snapped.properties.location;
                } catch (e) { if (DEBUG) console.warn("[cycleAlternateRoute] exception ignorée :", e); }
            });
            statusBox.innerText = `🔀 Itinéraire alternatif ${selectedRouteIndexForNav + 1}/${availableRoutesForNav.length}`;
            statusBox.style.color = "#4da3ff";
        }

        function processVoiceGuidanceByDistance(distAlongM) {
            if (routeSteps.length === 0) { hideNextTurnPanel(); return; }
            while (currentStepIndex < routeSteps.length && stepArrivalDist[currentStepIndex] < distAlongM - 15) {
                currentStepIndex++;
            }
            while (currentStepIndex < routeSteps.length && routeSteps[currentStepIndex].maneuver.type === 'depart') {
                currentStepIndex++;
            }
            if (currentStepIndex >= routeSteps.length) { hideNextTurnPanel(); return; }

            const step = routeSteps[currentStepIndex];
            if (step.maneuver.type === 'arrive') { hideNextTurnPanel(); return; }

            const distToManeuver = stepArrivalDist[currentStepIndex] - distAlongM;
            updateNextTurnPanel(step, distToManeuver);

            if (!voiceGuidanceEnabled) return;

            // Sous dead reckoning la position est extrapolée : sur un long tunnel, une vitesse
            // supposée constante peut accumuler plusieurs centaines de mètres d'erreur. Annoncer
            // à 30 m n'a alors plus de sens — la sortie peut déjà être passée. On annonce donc
            // plus tôt et sur des paliers plus larges, pour laisser au conducteur le temps de
            // chercher la signalisation réelle plutôt que de se fier au mètre près.
            // Les clés étant indexées par la valeur du palier, un retour du GPS en cours de step
            // ne rejoue pas un palier déjà annoncé (300 est commun aux deux jeux).
            const estimated = _positionIsEstimated;
            const thresholds = estimated ? [500, 300, 150] : [300, 100, 30];
            thresholds.forEach(th => {
                const key = currentStepIndex + '_' + th;
                if (distToManeuver <= th && !announcedThresholds[key]) {
                    announcedThresholds[key] = true;
                    const audioFiles = getManeuverAudioFiles(step, th, estimated);
                    playAudioSequence(audioFiles);
                }
            });
        }

        function checkVoiceGuidanceReal(lng, lat) {
            if (!fullRouteLine || routeSteps.length === 0) return;
            try {
                const snapped = turf.nearestPointOnLine(fullRouteLine, turf.point([lng, lat]), { units: 'kilometers' });
                processVoiceGuidanceByDistance(snapped.properties.location * 1000);
            } catch (e) { if (DEBUG) console.warn("[checkVoiceGuidanceReal] exception ignorée :", e); }
        }

        async function fetchRestAreasAlongRoute() {
            restAreas = [];
            if (!fullRouteLine) return;
            try {
                const coords = fullRouteLine.geometry.coordinates;
                let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
                coords.forEach(c => {
                    const lng = c[0], lat = c[1];
                    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
                    if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
                });
                const pad = 0.05;
                const bbox = `${minLat - pad},${minLng - pad},${maxLat + pad},${maxLng + pad}`;
                const query = `[out:json][timeout:25];(node["highway"="services"](${bbox});way["highway"="services"](${bbox});node["highway"="rest_area"](${bbox});way["highway"="rest_area"](${bbox}););out center;`;

                const res = await fetchResilient('https://overpass-api.de/api/interpreter', {
                    method: 'POST',
                    body: 'data=' + encodeURIComponent(query)
                });
                const data = await res.json();

                const candidates = [];
                (data.elements || []).forEach(el => {
                    const lat = el.type === 'node' ? el.lat : (el.center ? el.center.lat : null);
                    const lng = el.type === 'node' ? el.lon : (el.center ? el.center.lon : null);
                    if (lat == null || lng == null) return;
                    const pt = turf.point([lng, lat]);
                    const distToRoute = turf.pointToLineDistance(pt, fullRouteLine, { units: 'kilometers' });
                    if (distToRoute > 1.5) return;
                    candidates.push({ lat, lng, name: (el.tags && el.tags.name) ? el.tags.name : "Aire de repos" });
                });

                candidates.forEach(c => {
                    const tooClose = restAreas.some(r => turf.distance(turf.point([r.lng, r.lat]), turf.point([c.lng, c.lat]), { units: 'kilometers' }) < 1);
                    if (!tooClose) restAreas.push(c);
                });
            } catch (e) { console.error("Erreur récupération aires de repos :", e); restAreas = []; }
        }

        // === LIMITE DE VITESSE RÉELLE (OpenStreetMap via Overpass API) ===
        // Convertit la valeur brute du tag OSM "maxspeed" (nombre, "FR:urban", "50 mph", etc.) en km/h.
        function parseMaxspeedTag(raw) {
            if (!raw) return null;
            const knownFrenchZones = {
                'FR:urban': 50, 'FR:zone30': 30, 'FR:rural': 80, 'FR:motorway': 130, 'FR:trunk': 110, 'walk': 20
            };
            if (knownFrenchZones[raw] !== undefined) return knownFrenchZones[raw];
            const match = String(raw).match(/(\d+)/);
            if (!match) return null;
            let value = parseInt(match[1], 10);
            if (/mph/i.test(raw)) value = Math.round(value * 1.60934);
            return (value > 0 && value <= 150) ? value : null;
        }

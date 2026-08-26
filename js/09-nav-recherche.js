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
           badges, objectifs, retour au panneau Itinéraire d'où l'utilisateur saisira sa
           nouvelle destination.
           ⚠ ELLE N'ANNONCE PLUS DE COFFRE BONUS sur un trajet sans faute (25/08/2026) :
           le coffre à butin a été supprimé (voir js/12). Le sans-faute n'est plus détecté
           ici du tout — c'était le seul usage qu'en faisait cette fenêtre. */
        function openFreeCourseEnd() {
            const d = drivers[0];
            const gains  = clampTripScore(d ? d.score : 0);
            const gainEl = document.getElementById('freecourse-end-gain');

            if (gains > 0) {
                gainEl.classList.remove('neutre');
                gainEl.innerHTML = `Vous encaissez <b>${gains.toFixed(2)} pts</b> sur ${d.dist.toFixed(1)} km.`;
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
            /* La feuille "stations autour de moi" (body.gas-scan-open) occupe l'écran
               par-dessus la carte SANS changer l'onglet actif en dessous — switchMainTab()
               la referme donc bien quand on bascule d'onglet, mais rien ne le fait quand
               l'onglet Itinéraire était déjà actif : `surTrajet` est alors vrai et on ne
               touchait qu'au panelSnap, en laissant la feuille de scan affichée par-dessus
               le panneau qu'on vient pourtant de redéployer. Fermeture explicite ici,
               sans condition, pour couvrir aussi bien ce cas que le trajet en cours
               (closeGasScan() ne fait rien si la feuille n'est pas ouverte). */
            if (document.body.classList.contains('gas-scan-open')) closeGasScan();
            if (isCourseStarted) { openQuickReroute(); return; }
            const surTrajet = document.querySelector('.panel-tab-content.active')?.id === 'panel-tab-trajet';
            if (!surTrajet) switchMainTab('trajet');
            else if (panelSnapState !== 'full') setPanelSnap('full');
            // Étape 1/3 du tutoriel recherche d'adresse (une seule fois) : flèche sur la
            // cellule Destination. Délai le temps que le panneau finisse sa transition
            // (déploiement ou changement d'onglet), sinon la bulle se positionnerait sur
            // une cible qui n'a pas encore atteint sa place finale.
            setTimeout(showDestHint, 450);
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
                    safeLocalSet('gps_favorites', JSON.stringify(favorites));
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
            /* Mode « moins bavard » : un seul palier par manœuvre au lieu de trois. On garde
               celui du milieu — assez tôt pour se rabattre, assez tard pour être encore juste.
               Les rappels à 100 et 30 m ne disent rien de neuf quand on a déjà entendu l'ordre. */
            let thresholds = estimated ? [500, 300, 150] : [300, 100, 30];
            if (voiceQuietMode) thresholds = estimated ? [500] : [300];
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

        /* ═══ DÉCOUPAGE DU TRAJET POUR LE RELEVÉ DES AIRES ═══
           Une bbox unique sur tout le parcours couvrait le RECTANGLE Paris–Bruxelles, soit
           230 × 145 km dont l'essentiel est loin de la route : 16 s de réponse mesurées le
           21/08/2026, pendant lesquelles l'écran de confirmation reste sans pictos — donc en
           pratique jamais vus. Des tronçons courts interrogés en parallèle rendent des bbox
           minuscules ; c'est le motif déjà retenu pour les stations (`buildRouteSegments`,
           js/17) et les bornes, et la note de mesure d'AGENTS.md (piège n°2) montre que le
           parallèle bat nettement le séquentiel sur ces miroirs.
           ⚠ On a cru ensuite que ce parallélisme se retournait contre lui-même sur les longs
           trajets (11 tronçons = 44 requêtes) : mesuré, c'est faux — voir le pavé
           « HYPOTHÈSE RÉFUTÉE » ci-dessous avant d'y toucher.

           ⚠ LE BUFFER N'EST PAS CELUI DES STATIONS. `GAS_BUFFER_DEG` vaut 0,15° (~15 km),
           calibré pour rattraper des stations en ville ; ici les aires sont écartées au-delà
           de 1,5 km de la route, un tel buffer ne ferait que regrossir la bbox qu'on cherche
           à réduire. 0,05° laisse ~3,5 km au plus serré (longitude à 50°N), soit le double
           du filtre — assez pour qu'aucune aire retenue ne tombe hors cadre. */
        const REST_AREA_SEGMENT_KM = 80;
        /* ⚠⚠ HYPOTHÈSE TESTÉE ET RÉFUTÉE — NE PAS PLAFONNER LE NOMBRE DE TRONÇONS
           (essayé puis retiré le 21/08/2026, garder la trace évite de le refaire).
           Raisonnement de départ, très plausible : Paris–Perpignan (851 km) donne 11
           tronçons, donc jusqu'à 44 requêtes simultanées vers des miroirs bénévoles — le
           déclencheur de 429/504 que signale AGENTS.md. J'ai donc plafonné à 6 tronçons de
           ~142 km, ramenant la charge à 24 requêtes. Mesure sur le MÊME trajet :

             11 tronçons de 80 km   44 requêtes   **2 échecs**   40,1 s   zone 1 à +42,8 km
              6 tronçons de 142 km  24 requêtes   **2 échecs**   34,9 s   zone 1 à +73,4 km

           ⚠ J'en avais conclu « la concurrence n'est pas la cause ». **Cette conclusion-là
           était fausse aussi** : trois lancements ultérieurs à 11 tronçons ont donné 1, 2
           puis 3 échecs. Comparer deux tirages d'une loi qui varie de 1 à 3 ne démontre
           rien, et l'égalité 2=2 n'était qu'une coïncidence. La charge n'est ni innocentée
           ni confirmée — elle est **non mesurée**, et le rester demande plusieurs lancements
           par configuration.
           Ce qui reste établi, en revanche, et qui suffit à retirer le plafond : il a
           **aggravé** la seule chose qui compte — le trou laissé par un tronçon perdu vaut
           sa largeur, donc élargir les tronçons éloigne d'autant la zone 1 du seuil.
           Et les causes, une fois journalisées, montrent des `Failed to fetch` (transport)
           et non des 429 (quota) : si la charge jouait, ce n'est pas par le refus serveur
           qu'on imaginait. (Voir aussi les bornes électriques, js/19 : « plafonner la
           concurrence » y était déjà faux, mesures à l'appui.)
           Le vrai correctif est ailleurs : voir le second essai du tronçon décisif, plus bas.
           ⚠ Quiconque voudra replafonner doit d'abord lire `causes` dans `pause-releve` : si
           les échecs ne sont pas des 429, la charge n'a rien à voir avec le problème. */
        const REST_AREA_BUFFER_DEG = 0.05;

        function _buildRestAreaSegments(line) {
            const totalKm = turf.length(line, { units: 'kilometers' });
            const nb = Math.max(1, Math.ceil(totalKm / REST_AREA_SEGMENT_KM));
            const segments = [];
            for (let i = 0; i < nb; i++) {
                const fromKm = i * REST_AREA_SEGMENT_KM;
                const toKm   = Math.min((i + 1) * REST_AREA_SEGMENT_KM, totalKm);
                if (toKm - fromKm < 0.1) continue;   // reliquat de fin, rien à y chercher
                const coords = turf.lineSliceAlong(line, fromKm, toKm, { units: 'kilometers' }).geometry.coordinates;
                if (coords.length < 2) continue;
                let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
                coords.forEach(c => {
                    if (c[1] < minLat) minLat = c[1]; if (c[1] > maxLat) maxLat = c[1];
                    if (c[0] < minLng) minLng = c[0]; if (c[0] > maxLng) maxLng = c[0];
                });
                segments.push({
                    fromKm, toKm,   // servent à repérer le tronçon qui contient le seuil des 1h50
                    minLat: minLat - REST_AREA_BUFFER_DEG, maxLat: maxLat + REST_AREA_BUFFER_DEG,
                    minLng: minLng - REST_AREA_BUFFER_DEG, maxLng: maxLng + REST_AREA_BUFFER_DEG,
                });
            }
            return segments;
        }

        // `totalDurationHours` sert uniquement à décider s'il faut armer le plan de 3 zones
        // (js/11) et à situer le seuil des 1h50 en kilomètres. Absent, on se contente de
        // remplir `restAreas` : c'est l'ancien comportement, suggestion simple toutes les 1h50.
        async function fetchRestAreasAlongRoute(totalDurationHours, ligne) {
            const line = ligne || fullRouteLine;
            if (!line) { restAreas = []; clearRestStopPlan(); return; }

            /* Même tracé qu'au dernier relevé : les aires n'ont pas bougé, on ne redemande
               rien à Overpass. On rebâtit seulement le plan — l'aperçu et le lancement
               partagent ainsi un unique appel réseau. */
            const sig = _routeSigForRestAreas(line);
            if (sig && sig === _restAreasRouteSig && restAreas.length > 0) {
                // Relevé complet et mémorisé (`echecs === 0`) : aucune zone à tronquer.
                restAreasCoverageKm = Infinity;
                armRestStopPlan(totalDurationHours, line);
                return;
            }

            /* ⚠ Ce relevé devient le seul légitime : tout relevé plus ancien encore en vol
               s'arrêtera d'écrire à sa prochaine reprise (voir `_restAreasRun`, js/06). */
            const run = ++_restAreasRun;
            const perime = () => run !== _restAreasRun;

            /* ⚠⚠ ON NE VIDE `restAreas` QUE SI LE TRACÉ A CHANGÉ (21/08/2026).
               Le relevé n'est mémorisé (`_restAreasRouteSig`) que sans échec — soit 2 fois
               sur 8. Le reste du temps, `startCourse()` refait le relevé du MÊME trajet et
               son premier geste effaçait tout : mesuré au lancement réel,
               `zones: 3, candidats: 31` retombant à `zones: 1, candidats: 3` — les trois
               tasses s'effacent sous les yeux du conducteur au moment où il démarre, pour
               revenir 16 s plus tard aux mêmes kilomètres. Détruire une information juste
               pour la reconstruire à l'identique n'a aucun sens ; le vidage ne se justifie
               que si les aires en mémoire appartiennent à un AUTRE tracé.
               ⚠ En reprise, la troncature est levée d'emblée : les zones déjà affichées
               reposent sur un relevé antérieur dont on n'a plus le détail de couverture, et
               les recalculer à couverture nulle les ferait disparaître — précisément ce
               qu'on corrige ici. Les tronçons qui rentrent ne peuvent plus qu'AJOUTER des
               aires (dédoublonnage à 1 km), donc affiner le plan vers l'amont, jamais le
               vider. */
            const reprise = !!(sig && sig === _restAreasSigCourante && restAreas.length > 0);
            if (!reprise) {
                restAreas = [];
                clearRestStopPlan();
            }
            _restAreasSigCourante = sig;
            const _t0 = Date.now();
            try {
                const segments = _buildRestAreaSegments(line);

                /* ⚠⚠ CHAQUE TRONÇON EST EXPLOITÉ DÈS SON ARRIVÉE — NE JAMAIS REVENIR À UN
                   `await Promise.all` QUI NE TRAITE QU'À LA FIN (mesuré le 21/08/2026).
                   Première version : découpage en 4 tronçons parallèles, puis traitement
                   groupé une fois tous revenus. Résultat **31,3 s contre 16 s** pour la bbox
                   unique qu'on cherchait à améliorer. La raison : attendre tout le monde fait
                   du temps total celui du PIRE tronçon, et le pire est celui qui échoue —
                   il épuise l'échelle complète de hedging (4 miroirs, relances à 6 s et 12 s,
                   timeout de 25 s chacun) avant d'abandonner. Un tronçon mort tenait les
                   trois autres en otage.
                   Les aires sont donc fusionnées DÈS L'ARRIVÉE de chaque tronçon, sans rien
                   devoir aux retardataires — l'armement du plan, lui, obéit à la règle du
                   tronçon décisif ci-dessous. */
                /* ═══ TRONÇON DÉCISIF : celui qui contient le seuil des 1h50 ═══
                   ⚠ NE PAS ARMER LE PLAN SUR LE PREMIER TRONÇON QUI RÉPOND (mesuré le
                   21/08/2026). L'ordre d'arrivée est celui du réseau, pas celui de la route :
                   un tronçon tardif revenu en tête faisait bâtir le plan sur les seules aires
                   qu'il connaissait, toutes situées bien après le seuil. Relevé sur
                   Paris–Bruxelles : première zone à **km 249,9 pour un seuil à 185,3**, soit
                   ~40 min de conduite en trop, là où un relevé complet donnait 199,6. Le plan
                   se corrigeait ensuite tout seul, mais un lancement dans ces 2-3 s partait
                   avec la version tardive — une imprécision discrète échangée contre une
                   lenteur visible, mauvais marché pour une alerte fatigue.
                   On attend donc le tronçon qui couvre le seuil. Les autres continuent d'être
                   fusionnés pour la détection de pause, et tout tronçon postérieur réarme
                   (il ne peut qu'affiner : `buildRestStopPlan()` retient les 3 premières
                   aires APRÈS `departKm`). */
                let seuilKm = null;
                if (totalDurationHours > REST_STOP_PLAN_MIN_HOURS) {
                    const totalKm = turf.length(line, { units: 'kilometers' });
                    seuilKm = totalKm * (REST_STOP_INTERVAL_HOURS / totalDurationHours);
                }
                let iDecisif = -1;
                if (seuilKm != null) {
                    iDecisif = segments.findIndex(s => s.toKm > seuilKm);
                    if (iDecisif === -1) iDecisif = segments.length - 1;
                }
                // Aucun plan attendu (trajet court) : rien à retenir, on arme au fil de l'eau.
                let decisifArrive = (iDecisif === -1);

                /* Couverture continue depuis le tronçon décisif : c'est elle qui décide
                   combien de zones sont affichables sans risque de les voir reculer
                   (voir le pavé de `restAreasCoverageKm`, js/06). Un tronçon arrivé
                   au-delà d'un trou ne fait donc PAS avancer la couverture. */
                const arrives = new Set();
                /* ⚠ Une fois la troncature LEVÉE, elle ne se repose jamais : sans ce témoin,
                   le `majCouverture()` du tronçon suivant recalculerait une couverture finie
                   et ferait DISPARAÎTRE des tasses déjà affichées. Reculer, c'est déjà mal ;
                   s'effacer, ce serait pire. */
                let couvertureLevee = reprise;   // voir le pavé « reprise » ci-dessus
                const majCouverture = () => {
                    if (couvertureLevee) { restAreasCoverageKm = Infinity; return; }
                    if (iDecisif < 0) { restAreasCoverageKm = Infinity; return; }
                    let j = iDecisif;
                    while (arrives.has(j)) j++;
                    // j-1 = dernier tronçon d'une chaîne ininterrompue partant du décisif.
                    restAreasCoverageKm = (j > iDecisif) ? segments[j - 1].toKm : 0;
                };
                majCouverture();

                let echecs = 0, brut = 0;
                const traiterTroncon = (data, index) => {
                    /* ⚠ LE POINT D'ÉCRITURE UNIQUE, DONC LE SEUL ENDROIT OÙ LA GARDE COMPTE.
                       Tout ce qui suit touche `restAreas` et le plan : si un relevé plus
                       récent a pris la main, ce tronçon-ci arrive d'un trajet qui n'est plus
                       affiché. L'ignorer entièrement est la seule conduite juste — le fusionner
                       « puisqu'on l'a » repeuplerait un tableau vidé avec une portion isolée
                       du parcours, ce qui est exactement le défaut mesuré. */
                    if (perime()) return;
                    const elements = (data && data.elements) || [];
                    brut += elements.length;
                    const avant = restAreas.length;
                    elements.forEach(el => {
                        const lat = el.type === 'node' ? el.lat : (el.center ? el.center.lat : null);
                        const lng = el.type === 'node' ? el.lon : (el.center ? el.center.lon : null);
                        if (lat == null || lng == null) return;
                        const pt = turf.point([lng, lat]);
                        if (turf.pointToLineDistance(pt, line, { units: 'kilometers' }) > 1.5) return;
                        /* Dédoublonnage à 1 km, plus nécessaire encore qu'avec une bbox
                           unique : les tronçons voisins se recouvrent par leur buffer, une
                           aire posée à la jonction revient donc deux fois. */
                        const dejaLa = restAreas.some(r =>
                            turf.distance(turf.point([r.lng, r.lat]), pt, { units: 'kilometers' }) < 1);
                        if (!dejaLa) {
                            restAreas.push({ lat, lng, name: (el.tags && el.tags.name) ? el.tags.name : "Aire de repos" });
                        }
                    });
                    /* ⚠ Réarmement progressif UNIQUEMENT tant que rien n'a été proposé.
                       `buildRestStopPlan()` remet à zéro `restStopPlanIndex` et
                       `restStopBonusLost` : un tronçon arrivant en retard, alors que le
                       conducteur a déjà dépassé la zone 1, lui rendrait ses occasions
                       perdues et fausserait tout le compte. */
                    if (index === iDecisif) decisifArrive = true;
                    arrives.add(index);
                    majCouverture();
                    if (restAreas.length !== avant && decisifArrive && !restStopProposed) {
                        armRestStopPlan(totalDurationHours, line);
                    }
                };

                /* Requête d'un tronçon, extraite pour que le second essai du tronçon décisif
                   (plus bas) réemploie EXACTEMENT la même — une divergence entre les deux
                   ferait comparer deux choses différentes. */
                const requeteTroncon = (seg) => {
                    const bbox = `${seg.minLat.toFixed(4)},${seg.minLng.toFixed(4)},` +
                                 `${seg.maxLat.toFixed(4)},${seg.maxLng.toFixed(4)}`;
                    /* ⚠ DEUX ÉGALITÉS EXACTES, JAMAIS UNE REGEX SUR `highway` (21/08/2026).
                       `["highway"~"^(services|rest_area)$"]` paraît plus compact et c'est un
                       piège : `highway` est la clé la plus répandue d'OSM — chaque route la
                       porte. L'égalité tape dans l'index clé/valeur et rend quelques
                       dizaines d'objets ; la regex oblige Overpass à parcourir TOUS les
                       objets `highway` de la bbox. Mesuré : timeout sur les quatre miroirs.
                       `nwr` couvre node+way+relation en une passe, ça c'est gratuit. */
                    return `[out:json][timeout:60];` +
                           `(nwr["highway"="services"](${bbox});nwr["highway"="rest_area"](${bbox}););` +
                           `out center tags;`;
                    /* ⚠⚠ NE JAMAIS REVENIR À `overpass-api.de` ICI (corrigé le 21/08/2026).
                       C'est ce que cette fonction appelait depuis l'origine — l'instance
                       officielle **répond 406 à tout navigateur** (voir le pavé de
                       `_fetchOverpassHedged`, js/19) : `User-Agent` étant un en-tête interdit
                       à `fetch`, l'app ne peut structurellement pas émettre une requête
                       qu'elle accepte. Le relevé échouait donc à tous les coups, en silence,
                       et la mécanique de pause n'a jamais eu la moindre aire à proposer. */
                };

                /* ⚠ LES CAUSES D'ÉCHEC SONT RETENUES, PAS SEULEMENT COMPTÉES (21/08/2026).
                   `echecs++` seul a coûté un correctif entier posé à l'aveugle : j'avais
                   attribué les pertes à la concurrence (44 requêtes simultanées) et plafonné
                   le nombre de tronçons, en concluant de « 2 échecs avant, 2 après » que
                   l'hypothèse était fausse — conclusion elle-même invalide, la suite ayant
                   montré que le compte varie de 1 à 3 à découpage identique.
                   `_fetchOverpassHedged` agrège pourtant la cause de CHAQUE miroir dans son
                   `Error` ; on la jetait. Elle dit `Failed to fetch`, pas 429 ni 504.
                   504 (bbox trop lourde), 429 (quota) et `Failed to fetch` (réseau/CORS) ont
                   des remèdes opposés : sans les distinguer, tout correctif est une devinette. */
                const causes = [];
                const perdus = [];
                await Promise.all(segments.map(async (seg, i) => {
                    /* ⚠ Le tronçon est traité DANS le `then`, pas après le `Promise.all` :
                       c'est tout l'objet du correctif ci-dessus. */
                    try { traiterTroncon(await _fetchOverpassHedged(requeteTroncon(seg)), i); }
                    catch (e) {
                        causes.push(`T${i}${i === iDecisif ? '*' : ''}:${(e && e.message) || e}`);
                        /* ⚠⚠ LE TRONÇON DÉCISIF EST REJOUÉ IMMÉDIATEMENT, PAS À LA FIN
                           (mesuré le 21/08/2026 : 6 tronçons perdus d'un coup, dont lui).
                           Tant qu'il manque, la couverture vaut 0 et la carte reste NUE.
                           Le rattrapage de fin le récupérait bien, mais seulement après le
                           `Promise.all` complet : relevé du jour — trajet calculé à 00:47:44,
                           `zones: 0` à 00:48:07, première tasse à **00:48:32**. Près de
                           50 secondes d'écran vide alors que la requête qui débloquait tout
                           durait 25 s et pouvait tourner PENDANT que les autres finissaient.
                           On le rejoue donc ici, en recouvrement du reste du relevé. Une
                           requête de plus, sur le seul tronçon dont l'absence se voit.
                           ⚠ S'il tombe une seconde fois, on ne le retente PAS une troisième :
                           on lève la troncature sur-le-champ (`couvertureLevee`) et le plan
                           s'affiche dégradé. Deux échecs consécutifs sur le même tronçon ne
                           promettent rien de bon, et 25 s de plus d'écran nu se paieraient
                           cash — le conducteur serait parti. */
                        if (i === iDecisif) {
                            try {
                                traiterTroncon(await _fetchOverpassHedged(requeteTroncon(seg)), i);
                                causes.push(`T${i}*bis:ok`);
                                return;   // récupéré : ni échec, ni rattrapage de fin
                            } catch (e2) {
                                causes.push(`T${i}*bis:${(e2 && e2.message) || e2}`);
                                /* Le verrou tombe ET la troncature avec : sans cela le plan
                                   serait armé sur une couverture nulle, donc vide. */
                                decisifArrive = true;
                                couvertureLevee = true;
                                restAreasCoverageKm = Infinity;
                                if (!restStopProposed) armRestStopPlan(totalDurationHours, line);
                            }
                        }
                        echecs++;
                        perdus.push(i);
                    }
                }));

                if (echecs === segments.length) throw new Error(`aucun tronçon relevé (${echecs}/${segments.length})`);

                /* ═══ SECOND ESSAI DES TRONÇONS PERDUS, EN SÉQUENTIEL ═══
                   ⚠ CE QUE DISENT LES CAUSES (relevées le 21/08/2026, enfin journalisées) :
                     T5, T3, T1 → « private.coffee: Failed to fetch | kumi: Failed to fetch |
                                    openstreetmap.ru: Failed to fetch | mail.ru: timeout »
                   **Jamais de 429**, en revanche : aucun refus de quota, sur aucun relevé.
                   ⚠ J'avais aussi écrit « ni 504 » — **c'était prématuré, sur trois relevés**.
                   Un lancement dégradé (6 tronçons perdus d'un coup) a montré
                   `maps.mail.ru → 504` sur cinq d'entre eux, les trois autres miroirs restant
                   en `Failed to fetch`. Lecture corrigée : mail.ru est le miroir de tête et
                   **sature** (504 = son propre timeout de traitement) quand on l'arrose de
                   11 requêtes ; les trois autres échouent au niveau transport. Les deux
                   pannes coexistent, et aucune n'est un quota.
                   Dans les deux cas l'échec est transitoire, donc ça se rejoue — c'est ce qui
                   compte ici.
                   ⚠ ET LA VARIANCE INTERDIT DE CONCLURE SUR UNE MESURE UNIQUE : à découpage
                   identique (11 tronçons), trois lancements ont donné **1, 2 puis 3 échecs**.
                   C'est ce qui a invalidé ma comparaison « 11 tronçons → 2 échecs / 6 tronçons
                   → 2 échecs » : deux tirages d'une loi qui varie de 1 à 3, donc rigoureusement
                   rien. Toute conclusion ici demande plusieurs lancements.
                   ⚠ POURQUOI ON REJOUE MAINTENANT TOUS LES PERDUS, et plus seulement le
                   décisif : depuis la troncature à la couverture continue
                   (`restAreasCoverageKm`), un trou n'importe où AVANT la zone 3 masque les
                   zones suivantes. Mesuré : T3 perdu ⇒ `couvKm: 240` ⇒ **une seule tasse
                   affichée** au lieu de trois. Chaque tronçon perdu coûte donc désormais une
                   zone visible, et le tri « décisif vs confort » n'a plus lieu d'être.
                   ⚠ EN SÉQUENTIEL, ET C'EST LE POINT : les rejouer d'un `Promise.all` les
                   remettrait dans les conditions mêmes qui viennent d'échouer. Un à un, la
                   charge est nulle. Le coût est borné — au pire quelques secondes, et
                   seulement quand il y a eu des pertes. */
                let rattrapage = null;
                /* ⚠ Le tronçon décisif est EXCLU d'office : il a déjà eu son second essai en
                   recouvrement, immédiatement après son échec (voir plus haut). S'il est
                   encore dans `perdus`, c'est qu'il a échoué DEUX fois — une troisième
                   tentative coûterait 25 s de plus pour un tronçon qui n'a rien rendu, alors
                   que la troncature est déjà levée et le plan déjà affiché. */
                const aRejouer = perdus.filter(i => i !== iDecisif);
                if (aRejouer.length) {
                    let repris = 0;
                    for (const i of aRejouer) {
                        /* ⚠ On n'achète pas 90 s de réseau pour un trajet qui n'est plus à
                           l'écran : un relevé périmé abandonne ses rattrapages sur-le-champ. */
                        if (perime()) break;
                        try {
                            traiterTroncon(await _fetchOverpassHedged(requeteTroncon(segments[i])), i);
                            echecs--; repris++;
                        } catch (e) {
                            causes.push(`T${i}bis:${(e && e.message) || e}`);
                        }
                    }
                    rattrapage = `${repris}/${aRejouer.length}`;
                    /* Le plan bâti pendant le `Promise.all` l'a été sur un relevé troué : il
                       faut le refaire, pas l'affiner. `traiterTroncon` a déjà réarmé au fil
                       de l'eau, mais seulement tant que la couverture le permettait. */
                    if (!restStopProposed) armRestStopPlan(totalDurationHours, line);
                    /* ⚠ Un tronçon définitivement perdu laisse la couverture en deçà des
                       zones 2-3, qui resteraient invisibles pour toujours. On lève alors la
                       troncature : elle sert à empêcher les pictos de SAUTER pendant que le
                       relevé rentre, or ici plus rien ne rentrera. Un plan complet dont une
                       zone est peut-être en retard vaut mieux qu'une seule tasse — même
                       arbitrage que le verrou `decisifArrive`. */
                    if (echecs > 0) {
                        couvertureLevee = true;
                        restAreasCoverageKm = Infinity;
                        if (!restStopProposed) armRestStopPlan(totalDurationHours, line);
                    }
                }

                /* ⚠⚠ FILET : LE RELEVÉ NE SE TERMINE JAMAIS SUR UNE COUVERTURE NULLE.
                   `couvKm: 0` signifie « rien n'est fiable », et la troncature le traduit
                   par zéro tasse — état observé le 21/08/2026 (`zones: 0, candidats: 17`) :
                   17 aires connues, aucune montrée. Le pire des deux mondes, et une
                   régression franche sur le comportement d'origine qui, lui, affichait un
                   plan approximatif. La troncature est un outil ANTI-SAUT valable pendant
                   que les tronçons rentrent ; une fois le relevé fini, plus rien ne peut
                   sauter et elle n'a plus de raison d'être. */
                /* ⚠ Dernier contrôle avant les gestes définitifs : mémoriser la signature
                   d'un relevé périmé ferait passer pour « à jour » un tableau `restAreas`
                   qui appartient au relevé suivant, et le prochain aperçu du même tracé
                   sauterait l'appel réseau en se croyant complet. */
                if (perime()) return;

                if (restAreasCoverageKm === 0) {
                    couvertureLevee = true;
                    restAreasCoverageKm = Infinity;
                    if (!restStopProposed) armRestStopPlan(totalDurationHours, line);
                }

                /* Conservé après mise au point : `ms` est la mesure qui compte — c'est la
                   seule chose qui distingue « ça ne marche pas » de « ça n'a pas encore
                   répondu », confusion qui a coûté quatre allers-retours de diagnostic le
                   21/08/2026. ⚠ DIAG_LOG_MAX vaut 12 : ne pas rajouter de points de mesure
                   ici sans en retirer, ils chasseraient `peages` et `fit`. */
                logDiag('pause-releve', {
                    aires: restAreas.length,
                    brut,
                    segments: segments.length,
                    echecs,
                    /* `T3*:kumi → 504` se lit d'un coup d'œil : quel tronçon, était-ce le
                       décisif (`*`), et surtout POURQUOI. Sans ce champ on ne peut que
                       deviner — ce qui a déjà coûté un correctif pour rien. */
                    causes: causes.length ? causes.join(' | ') : null,
                    rattrapage,
                    dureeH: totalDurationHours != null ? +totalDurationHours.toFixed(2) : null,
                    ms: Date.now() - _t0
                });
                /* ⚠ La signature n'est mémorisée que si TOUS les tronçons sont revenus.
                   Un relevé partiel (`echecs > 0`) laisse un trou sur une portion du
                   parcours ; le marquer comme définitif ferait sauter le second essai au
                   lancement, et les aires manquantes le resteraient pour tout le trajet.
                   À une aire près, le trou tombe pile là où il faudrait s'arrêter. */
                if (echecs === 0) _restAreasRouteSig = sig;
                // Même garde que dans `traiterTroncon` : ne pas rebâtir un plan déjà entamé.
                if (!restStopProposed) armRestStopPlan(totalDurationHours, line);
            } catch (e) {
                /* ⚠ `logAppError` et non `console.error` : l'échec partait dans la console,
                   donc PAS dans `gps_error_log`. C'est ce silence qui a fait passer un relevé
                   cassé depuis toujours pour un « pas d'aire sur ce trajet ». */
                logAppError('fetchRestAreasAlongRoute', e);
                restAreas = []; _restAreasRouteSig = null; restAreasCoverageKm = Infinity;
            }
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

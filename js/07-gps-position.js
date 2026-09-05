        // === CONFIRMATION DE SORTIE (bouton / geste "retour") ===
        // Contrainte de plateforme : une page web ne peut pas intercepter la fermeture d'un
        // onglet avec sa PROPRE fenêtre — `beforeunload` n'affiche que le message générique
        // du navigateur, non personnalisable. Le seul point de sortie réellement interceptable
        // est le bouton/geste retour, et c'est celui qu'on utilise au quotidien sur mobile.
        //
        // Principe : on empile un état "sentinelle" dans l'historique. Le retour retombe donc
        // dessus au lieu de quitter l'app, ce qui laisse le temps de poser la question.
        // "Non" ré-arme la sentinelle et on reste ; "Oui" la laisse franchir.
        let _exitConfirmOpen = false;
        let _exitAllowed = false;

        function openExitConfirm() {
            if (_exitConfirmOpen) return;
            _exitConfirmOpen = true;
            document.getElementById('exit-confirm-overlay').classList.add('open');
        }

        function closeExitConfirm() {
            _exitConfirmOpen = false;
            document.getElementById('exit-confirm-overlay').classList.remove('open');
        }

        function exitAppConfirmed() {
            closeExitConfirm();
            _exitAllowed = true; // désarme la sentinelle : les retours suivants passent
            // Cas d'une fenêtre ouverte par script : fermeture directe autorisée.
            window.close();
            // Sinon on franchit la sentinelle, puis l'entrée initiale. Sur Android (WebView
            // ou PWA installée), épuiser l'historique ferme l'application. Dans un onglet de
            // navigateur ouvert directement, rien ne peut le fermer : l'utilisateur revient
            // simplement à la page précédente, ou reste sur l'app s'il n'y en a pas.
            history.back();
            setTimeout(() => { if (_exitAllowed) history.back(); }, 60);
        }

        function _armExitGuard() {
            history.pushState({ _exitGuard: true }, '');
        }

        window.addEventListener('popstate', () => {
            if (_exitAllowed) return;   // sortie validée : on laisse partir
            if (_exitConfirmOpen) return; // question déjà posée, on ignore les rebonds
            _armExitGuard();            // on se remet en place avant de demander
            openExitConfirm();
        });
        _armExitGuard();

        window.addEventListener('load', () => {
            updateThemeUI();
            updateTrafficUI();
            
            const storedEnabled = localStorage.getItem('gps_voice_enabled');
            voiceGuidanceEnabled = storedEnabled === null ? true : storedEnabled === '1';
            const toggleEl = document.getElementById('voice-guidance-toggle');
            if (toggleEl) toggleEl.checked = voiceGuidanceEnabled;

            // Mode « moins bavard » : opt-in, donc `=== '1'` (défaut = voix complète).
            voiceQuietMode = localStorage.getItem('gps_voice_quiet') === '1';
            const quietEl = document.getElementById('voice-quiet-toggle');
            if (quietEl) quietEl.checked = voiceQuietMode;

            if (navigator.geolocation) {
                // On lance d'abord getCurrentPosition pour déclencher la popup de permission.
                // Ce n'est qu'une fois la permission accordée (callback success) qu'on lance
                // le watchPosition — évite le bug "premier lancement" où watchPosition, lancé
                // en parallèle de la popup de permission, reste bloqué indéfiniment sur certains
                // appareils (Samsung Galaxy notamment).

                // === LISSAGE GPS ===
                // Filtre exponentiel sur les coordonnées brutes pour supprimer le bruit
                // quand l'utilisateur est statique. Alpha faible = plus de lissage.
                let _smoothLat = null, _smoothLng = null;
                const GPS_SMOOTH_ALPHA_STATIC = 0.15; // très lissé quand immobile
                const GPS_SMOOTH_ALPHA_MOVING = 0.55; // plus réactif en mouvement
                const GPS_MIN_MOVE_M = 3.0;           // seuil en mètres sous lequel on gèle le point
                const GPS_ACCURACY_REJECT = 50;       // ignorer les positions avec précision > 50m

                function _smoothGps(rawLat, rawLng, speedKmh) {
                    if (_smoothLat === null) { _smoothLat = rawLat; _smoothLng = rawLng; return [rawLat, rawLng]; }

                    // Seuil de mouvement : si déplacement < GPS_MIN_MOVE_M et vitesse nulle → geler
                    const dMeters = turf.distance(turf.point([_smoothLng, _smoothLat]), turf.point([rawLng, rawLat]), { units: 'kilometers' }) * 1000;
                    if (dMeters < GPS_MIN_MOVE_M && speedKmh < 1) return [_smoothLat, _smoothLng];

                    // Lissage exponentiel : alpha plus élevé = plus réactif (en mouvement)
                    const alpha = speedKmh > 3 ? GPS_SMOOTH_ALPHA_MOVING : GPS_SMOOTH_ALPHA_STATIC;
                    _smoothLat = alpha * rawLat + (1 - alpha) * _smoothLat;
                    _smoothLng = alpha * rawLng + (1 - alpha) * _smoothLng;
                    return [_smoothLat, _smoothLng];
                }

                function startWatching() {
                    if (watchId) navigator.geolocation.clearWatch(watchId);
                    watchId = navigator.geolocation.watchPosition(
                    (position) => {
                        const rawLat = position.coords.latitude;
                        const rawLng = position.coords.longitude;
                        const accuracy = position.coords.accuracy || 0;
                        const systemSpeedKmh = position.coords.speed ? (position.coords.speed * 3.6) : 0;

                        // Rejeter les positions trop imprécises (hors trajet actif uniquement)
                        if (!isCourseStarted && accuracy > GPS_ACCURACY_REJECT) return;

                        // --- Qualité du fix : un fix "utilisable" est un vrai fix satellite ---
                        // Un fix dégradé (précision > 45 m) ne doit PAS rafraîchir lastGpsUpdateTime,
                        // sinon le dead reckoning croit que le GPS va bien et ne démarre jamais.
                        const _fixUsable = accuracy > 0 && accuracy <= GPS_LOST_ACCURACY_M;
                        const _nowFix = Date.now();
                        if (_fixUsable) {
                            _gpsDegradedSince = 0;
                            _lastUsableFixTime = _nowFix;
                            if (gpsSignalLost) {
                                // Sortie de tunnel : on reprend la main sur la position réelle
                                resetDeadReckoning();
                                _smoothLat = rawLat; _smoothLng = rawLng; // purge du lissage figé
                                /* ⚠⚠ CETTE LIGNE LEVAIT UNE ReferenceError À CHAQUE SORTIE DE TUNNEL
                                   (17/08/2026). Elle lisait `lng` et `lat`, qui ne sont déclarés
                                   qu'une trentaine de lignes plus bas (`const [lat, lng] = _smoothGps(...)`) :
                                   dans la zone morte temporelle d'un `const`, la lecture ne renvoie
                                   pas `undefined`, elle **jette**. Tout le reste du callback était
                                   donc sauté pour ce fix — y compris l'annonce « signal retrouvé »,
                                   la mise à jour du marqueur et le calcul de vitesse. Pire, comme
                                   `resetDeadReckoning()` venait de passer `gpsSignalLost` à false,
                                   le fix suivant reprenait le chemin normal en comparant la position
                                   de sortie à `lastRealCoords` resté à l'ENTRÉE du tunnel : un saut
                                   de plusieurs centaines de mètres interprété comme un déplacement.
                                   Les coordonnées brutes sont les seules disponibles ici, et ce sont
                                   les bonnes : on veut justement repartir du point réel, pas d'une
                                   valeur lissée héritée d'avant la coupure. */
                                lastRealCoords = [rawLng, rawLat];
                                /* Ré-amorçage de l'horloge de mesure : sans elle, le premier calcul
                                   de vitesse après la sortie divise le saut de position par la durée
                                   entière de la traversée. */
                                lastRealTimestamp = _nowFix;
                                _gpsRecoveredAt = _nowFix;
                                /* La vitesse inertielle a dérivé pendant la traversée : dès qu'un
                                   vrai fix la donne, il fait autorité. Sans ce ré-amorçage, la ligne
                                   `lastKnownSpeedKmh = systemSpeedKmh || lastKnownSpeedKmh` plus bas
                                   CONSERVE la valeur dérivée tant que la puce renvoie 0. */
                                if (systemSpeedKmh > 0) lastKnownSpeedKmh = systemSpeedKmh;
                                _drSpeedAtLoss = 0;
                                // Le conducteur doit savoir que les annonces redeviennent fiables.
                                // 'bavard' : la perte reste annoncée, le retour à la normale
                                // n'appelle aucune action du conducteur.
                                playAudioSequence(['location_recovered.ogg'], 0, 'bavard');
                                if (DEBUG) console.log('[GPS] Signal retrouvé');
                            }
                        } else if (isCourseStarted) {
                            if (!_gpsDegradedSince) _gpsDegradedSince = _nowFix;
                            if (!gpsSignalLost &&
                                (_nowFix - _gpsDegradedSince) > GPS_LOST_DELAY_MS &&
                                lastKnownSpeedKmh > GPS_DR_MIN_SPEED) {
                                gpsSignalLost = true;
                                // Référence pour borner la dérive de l'estimation inertielle.
                                _drSpeedAtLoss = lastKnownSpeedKmh;
                                setGpsLostBanner(true);
                                // Annonce sonore : le bandeau visuel seul passe inaperçu au volant,
                                // or c'est précisément le moment où le conducteur doit se remettre
                                // à suivre la signalisation plutôt que l'application.
                                playAudioSequence(['location_lost.ogg']);
                                if (DEBUG) console.log('[GPS] Signal perdu → dead reckoning');
                            }
                        }

                        // Appliquer le lissage pour le point bleu et la carte
                        const [lat, lng] = _smoothGps(rawLat, rawLng, systemSpeedKmh);

                        if (!hasCenteredMapOnce) {
                            hasCenteredMapOnce = true;
                            map.jumpTo({ center: [lng, lat], zoom: 15 });
                        }
                        
                        exactStartCoords = [lng, lat];
                        if (!startAddrAutoFilled && document.activeElement.id !== 'modal-start-addr') {
                            startAddrAutoFilled = true;
                            reverseGeocodeToAddress(lat, lng).then(addr => {
                                startAddrText = addr || "Adresse introuvable, veuillez réessayer";
                                const modalStartInput = document.getElementById('modal-start-addr');
                                if (modalStartInput && !modalStartManuallyEdited) modalStartInput.value = startAddrText;
                            });
                        }
                        
                        if (!isSimulationMode) {
                            if (drivers.length > 0 && drivers[0].marker) {
                                // Pendant un trajet avec itinéraire, on "snappe" le point bleu sur le tracé
                                // (comme Google Maps/Waze) au lieu d'afficher la position GPS brute. Ça donne
                                // un rendu beaucoup plus propre : le point reste pile sur la ligne blanche,
                                // pas décalé de quelques mètres à côté à cause de l'imprécision GPS.
                                if (isCourseStarted && currentTurfLine) {
                                    try {
                                        const snapped = turf.nearestPointOnLine(currentTurfLine, turf.point([lng, lat]), { units: 'kilometers' });
                                        const snappedCoords = snapped.geometry.coordinates;
                                        // On ne snappe que si le point est raisonnablement proche du tracé (<40m),
                                        // sinon on garde la position brute (hors route, recalcul en cours).
                                        if (snapped.properties.dist * 1000 < 40) {
                                            drivers[0].marker.setLngLat(snappedCoords);
                                        } else {
                                            drivers[0].marker.setLngLat([lng, lat]);
                                        }
                                    } catch (e) {
                                        drivers[0].marker.setLngLat([lng, lat]);
                                    }
                                } else {
                                    drivers[0].marker.setLngLat([lng, lat]);
                                }
                            }
                            // Point bleu "ma position" : visible en permanence hors trajet (dès qu'on est
                            // localisé). Une fois un trajet démarré, le marqueur conducteur (pulsant, coloré)
                            // prend le relais, donc on retire celui-ci pour ne pas avoir deux points superposés.
                            if (!isCourseStarted) {
                                if (!userLocationMarker) {
                                    userLocationMarker = new mapboxgl.Marker({ element: createPulseMarkerEl('#4da3ff'), anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
                                } else {
                                    userLocationMarker.setLngLat([lng, lat]);
                                }
                            } else if (userLocationMarker) {
                                userLocationMarker.remove();
                                userLocationMarker = null;
                            }
                            let bearing = lastKnownBearing;
                            if (isCourseStarted) {
                                if (position.coords.heading !== null && !isNaN(position.coords.heading) && systemSpeedKmh > 3) {
                                    bearing = position.coords.heading;
                                } else if (lastRealCoords) {
                                    const movedMeters = turf.distance(turf.point(lastRealCoords), turf.point([lng, lat]), {units: 'kilometers'}) * 1000;
                                    if (movedMeters > 3) {
                                        bearing = turf.bearing(turf.point(lastRealCoords), turf.point([lng, lat]));
                                    }
                                }
                            } else {
                                bearing = 0;
                            }
                            lastKnownBearing = bearing;

                            updateDynamicZoom(systemSpeedKmh, lat, lng, bearing);
                            syncGL3DMap(lat, lng, bearing);
                            
                            if (isCourseStarted && drivers.length > 0 && !drivers[0].finished && lastRealCoords) {
                                handleRealMovement(lng, lat, position.coords.speed, position.coords.accuracy);
                            } else if (!isCourseStarted) {
                                const statusBox = document.getElementById('status');
                                if (statusBox.innerText === "Chargement du GPS...") {
                                    statusBox.innerText = "GPS actif 🛰️. Choisissez destination puis Lancer.";
                                    statusBox.style.color = "#4da3ff";
                                }
                            }
                            const panelGpsText = document.getElementById('panel-gps-text');
                            const panelGpsStatus = document.getElementById('panel-gps-status');
                            if (panelGpsText && panelGpsText.innerText !== "GPS connecté") {
                                panelGpsText.innerText = "GPS connecté";
                                panelGpsStatus.classList.add('connected');
                            }
                        }
                        // En perte de signal, on NE met PAS à jour lastRealCoords : la position
                        // livrée est un repli réseau figé/aberrant. C'est le dead reckoning qui
                        // fait autorité jusqu'à la sortie du tunnel.
                        if (!gpsSignalLost) {
                            lastRealCoords = [lng, lat];
                            lastKnownSpeedKmh = systemSpeedKmh || lastKnownSpeedKmh;
                        }
                        // Seul un vrai fix satellite compte comme "le GPS répond".
                        if (_fixUsable) {
                            lastGpsUpdateTime = Date.now();
                            if (deadReckoningDistKm > 0) resetDeadReckoning();
                        }
                        // Mise à jour météo (max toutes les 5 min ou si déplacé de 0.5+ km)
                        maybeUpdateWeather(lat, lng);
                        // PHASE 2 — scan live des stations devant le véhicule.
                        // Sort immédiatement tant que temps + distance ne sont pas réunis.
                        maybeScanGasStationsLive(lng, lat);
                    },
                    (error) => {
                        // Ne pas afficher l'erreur pendant la phase de démarrage (puce GPS pas encore chaude)
                        // ou pour les erreurs transitoires de type POSITION_UNAVAILABLE (code 2)
                        if (!gpsStartupPhase) {
                            document.getElementById('status').innerText = "Erreur GPS : " + error.message;
                            document.getElementById('status').style.color = "#ff6b6b";
                        }
                        // Réessayer après 3s — fréquent au premier lancement
                        setTimeout(startWatching, 3000);
                    },
                    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
                );
                // La phase de démarrage dure 8s max — passé ce délai les erreurs sont légitimes
                gpsStartupPhase = true;
                setTimeout(() => { gpsStartupPhase = false; }, 8000);
                }

                // Étape 1 : getCurrentPosition déclenche la popup de permission au 1er lancement.
                // Une fois la permission accordée (ou si elle l'était déjà), on lance le suivi continu.
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        if (!hasCenteredMapOnce) {
                            hasCenteredMapOnce = true;
                            map.jumpTo({ center: [position.coords.longitude, position.coords.latitude], zoom: 15 });
                        }
                        // Permission accordée → on lance le suivi continu
                        startWatching();
                    },
                    (error) => {
                        // getCurrentPosition est uniquement un déclencheur de popup de permission :
                        // ne jamais afficher son erreur — startWatching gère la suite
                        startWatching();
                    },
                    { enableHighAccuracy: false, maximumAge: 60000, timeout: 15000 }
                );
            } else {
                document.getElementById('status').innerText = "La géolocalisation n'est pas supportée.";
            }
        });

        // Bandeau d'information "signal perdu". Réutilise le toast existant, en distinguant
        // la perte de signal GPS (tunnel) de la perte de réseau data (mode hors ligne).
        function setGpsLostBanner(show) {
            const toast = document.getElementById('offline-nav-toast');
            if (!toast) return;
            if (show) {
                toast.innerText = '🛰️ Signal GPS perdu — position inertielle (Accéléromètre)';
                toast.classList.add('visible');
            } else if (navigator.onLine) {
                toast.classList.remove('visible');
            } else {
                toast.innerText = '📵 Hors ligne — dead reckoning inertiel actif';
            }
        }

        // === DEAD RECKONING : estimation de position quand le GPS est perdu (tunnel, pont) ===
        function startDeadReckoning() {
            if (deadReckoningTimer) return;
            deadReckoningTimer = setInterval(() => {
                if (!isCourseStarted || !currentTurfLine || drivers.length === 0) {
                    stopDeadReckoning(); return;
                }
                // Deux voies d'entrée : soit la précision s'est dégradée (tunnel, le GPS continue
                // d'émettre du bruit), soit plus aucun fix utilisable n'arrive (perte totale).
                const msSinceLastGps = Date.now() - lastGpsUpdateTime;
                const active = gpsSignalLost || msSinceLastGps > 3000;
                if (!active) { _positionIsEstimated = false; return; }

                const speed = lastKnownSpeedKmh > GPS_DR_MIN_SPEED ? lastKnownSpeedKmh : 0;
                if (speed === 0) { _positionIsEstimated = false; return; }

                const intervalHours = 0.5 / 3600;
                const stepDistKm = speed * intervalHours;
                deadReckoningDistKm += stepDistKm;

                if (lastRealCoords && fullRouteLine) {
                    try {
                        const lastPt = turf.nearestPointOnLine(fullRouteLine, turf.point(lastRealCoords), { units: 'kilometers' });
                        const distAlongRoute = lastPt.properties.location + deadReckoningDistKm;
                        const totalRouteLen = turf.length(fullRouteLine, { units: 'kilometers' });
                        if (distAlongRoute < totalRouteLen) {
                            const estimatedPt = turf.along(fullRouteLine, distAlongRoute, { units: 'kilometers' });
                            const coords = estimatedPt.geometry.coordinates;
                            const d = drivers[0];
                            d.marker.setLngLat(coords);
                            _positionIsEstimated = true;

                            // Cap estimé depuis la tangente au tracé : dans un tunnel courbe,
                            // garder l'ancien cap ferait tourner la carte de travers.
                            try {
                                const ahead = turf.along(fullRouteLine, Math.min(distAlongRoute + 0.02, totalRouteLen), { units: 'kilometers' });
                                lastKnownBearing = turf.bearing(estimatedPt, ahead);
                            } catch (e) { /* on conserve le cap précédent */ }

                            updateDynamicZoom(speed, coords[1], coords[0], lastKnownBearing);
                            syncGL3DMap(coords[1], coords[0], lastKnownBearing);

                            // Rogner le tracé affiché derrière la position estimée.
                            // Sans ça, handleRealMovement — seul endroit qui rognait la ligne —
                            // étant court-circuité pendant toute la perte de signal, le tracé
                            // restait dessiné depuis l'ENTRÉE du tunnel : à la sortie, la ligne
                            // blanche partait dans le dos du conducteur jusqu'au retour d'un fix
                            // satellite propre. On garde aussi currentTurfLine synchronisé : sur
                            // une 2×2 voies (périphérique), une ligne qui contient encore la
                            // portion parcourue peut faire snapper la position sur la chaussée
                            // opposée au retour du GPS, et déclencher un faux recalcul.
                            try {
                                const endPt = turf.along(fullRouteLine, totalRouteLen, { units: 'kilometers' });
                                const ahead = turf.lineSlice(estimatedPt, endPt, fullRouteLine);
                                const aheadCoords = ahead.geometry.coordinates.slice();
                                if (aheadCoords.length >= 2) {
                                    aheadCoords[0] = coords;
                                    setRouteLine(aheadCoords);
                                    currentTurfLine = ahead;
                                    /* ⚠ La ligne vient d'être ROGNÉE : la progression le long de
                                       `currentTurfLine` repart de zéro, alors que `_maxDistAlongM`
                                       retient la valeur mesurée sur la ligne entière d'avant le
                                       tunnel. Sans cette remise à null, la première frame après la
                                       sortie voyait un « recul » de plusieurs centaines de mètres —
                                       la signature exacte d'un virage manqué — et déclenchait un
                                       recalcul d'itinéraire alors qu'on n'avait jamais quitté la
                                       route. C'est la même raison qui impose ce reset dans
                                       buildRouteSteps() : toute ligne neuve repart de zéro. */
                                    _maxDistAlongM = null;
                                }
                            } catch (e) { /* tracé conservé tel quel, la position reste correcte */ }

                            // Le compteur doit refléter la vitesse estimée, pas retomber à 0 :
                            // c'est ce qui donnait l'impression d'être à l'arrêt dans le tunnel.
                            d.actualSpeed = speed;
                            d.speedSmoothed = speed;
                            d.dist += stepDistKm;
                            d.timeHours += intervalHours;
                            const spEl = document.getElementById(`speed-${d.id}`);
                            if (spEl) spEl.innerText = Math.round(speed);
                            const navSp = document.getElementById('nav-speed-value');
                            if (navSp) navSp.innerText = Math.round(speed);
                            const limitKmh = currentSpeedLimitKmh || 50;
                            updateSpeedometer(speed, limitKmh, false);

                            // Guidance : on continue à égrener les instructions le long du tracé.
                            // Aucun point n'est marqué ni retiré pendant l'estimation — on ne peut
                            // pas savoir ce qui s'est réellement passé, bénéfice du doute.
                            try { processVoiceGuidanceByDistance(distAlongRoute * 1000); }
                            catch (e) { /* guidance indisponible, la position reste correcte */ }
                        }
                    } catch (e) { if (DEBUG) console.warn("[startDeadReckoning] exception ignorée :", e); }
                }
            }, 500);
        }

        // Remise à zéro de l'estimation SANS tuer le timer : le GPS est revenu, mais on doit
        // rester prêt pour la prochaine coupure. C'était le bug : stopDeadReckoning() faisait un
        // clearInterval alors qu'il était appelé à chaque retour de signal, et startDeadReckoning()
        // n'est appelé qu'une fois au lancement du trajet. Résultat : au premier micro-décrochage
        // (fréquent : passage sous un pont, canyon urbain), le timer mourait pour tout le trajet.
        function resetDeadReckoning() {
            deadReckoningDistKm = 0;
            gpsSignalLost = false;
            _gpsDegradedSince = 0;
            _positionIsEstimated = false;
            setGpsLostBanner(false);
            // Purger les thresholds d'annonce vocale pour éviter les ré-annonces quand le GPS revient
            // avec une position en arrière de l'estimation : sans ça, on reannonce "400m" alors qu'on
            // l'avait déjà dit en dead reckoning.
            announcedThresholds = {};
        }

        // Arrêt définitif : uniquement en fin de trajet.
        function stopDeadReckoning() {
            if (deadReckoningTimer) { clearInterval(deadReckoningTimer); deadReckoningTimer = null; }
            resetDeadReckoning();
        }

        // === LIVE SHARE (Firebase Realtime Database) ===
        // ─────────────────────────────────────────────
        // CONFIG : remplace ces 2 valeurs par celles de ton projet Firebase
        const FIREBASE_DB_URL = 'https://TON_PROJET-default-rtdb.firebaseio.com';
        // ─────────────────────────────────────────────

        let liveShareActive   = false;
        let liveShareSessionId = null;
        let liveShareTimer    = null;
        const LIVE_SHARE_INTERVAL_MS = 5000; // écriture toutes les 5s

        /* IDENTIFIANT DE SESSION DU PARTAGE LIVE — LE SEUL SECRET QUI PROTÈGE LA POSITION.

           Il n'y a pas d'authentification devant la base : quiconque connaît l'identifiant
           lit la position GPS en direct, la vitesse et la destination. L'URL EST le mot de
           passe, elle doit donc être indevinable.

           ⚠ La version d'origine (`Math.random().toString(36).slice(2, 8)`) tenait en SIX
           caractères, soit ~2 milliards de combinaisons — énumérables par un script en
           quelques heures, et bien moins en pratique : `Math.random()` n'est pas
           cryptographique, sa graine est prédictible, et deux appareils peuvent tomber sur
           la même valeur. On tire donc 20 caractères sur un alphabet de 32 (~100 bits)
           avec `crypto.getRandomValues`, présent dans toutes les WebView Android visées.

           Alphabet sans `0/O/1/I/l` : le lien se copie et se recolle à la main, une
           confusion de caractères mène à une session inexistante plutôt qu'à celle d'un
           inconnu. Les 20 caractères ne coûtent rien — le lien est copié, jamais tapé.

           ⚠ ALLONGER L'IDENTIFIANT NE SUFFIT PAS À SÉCURISER LA FONCTION. Il reste à poser
           des règles de sécurité côté base (lecture limitée à `liveshare/<id>`, écriture
           refusée aux tiers, expiration des sessions) — ce n'est PAS du code, c'est une
           configuration console, et elle est à faire le jour où `FIREBASE_DB_URL` cesse de
           valoir `TON_PROJET`. Sans elle, la base entière reste lisible quel que soit
           l'identifiant. */
        function _lsGenId() {
            const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';   // 32 signes, sans 0/O/1/I/l
            const octets = new Uint8Array(20);
            crypto.getRandomValues(octets);
            /* `% 32` sans biais : 256 est un multiple exact de 32, chaque signe a donc
               exactement 8 chances sur 256. Le raccourci serait faux avec un alphabet
               dont la taille ne divise pas 256 — ne pas changer l'un sans l'autre. */
            return Array.from(octets, (o) => ALPHABET[o % 32]).join('');
        }

        // URL Firebase pour la session courante
        function _lsUrl(path) {
            return `${FIREBASE_DB_URL}/liveshare/${liveShareSessionId}${path}.json`;
        }

        // Écrit les coordonnées + métadonnées dans Firebase (PUT = écrase)
        async function _lsPushPosition() {
            if (!liveShareActive || !liveShareSessionId || !lastRealCoords) return;
            const [lng, lat] = lastRealCoords;
            const etaEl = document.getElementById('nav-eta');
            const eta   = etaEl ? etaEl.textContent : '--';
            const dest  = document.getElementById('geocode-end')?.value || '';
            const payload = {
                lat, lng,
                speed:   Math.round(lastKnownSpeedKmh),
                eta,
                dest,
                ts:      Date.now(),
                active:  true,
            };
            try {
                await fetch(_lsUrl(''), {
                    method:  'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify(payload),
                });
            } catch(e) { /* silencieux si hors ligne */ }
        }

        // Marque la session comme terminée dans Firebase puis nettoie
        async function _lsStop() {
            if (!liveShareSessionId) return;
            try {
                await fetch(_lsUrl('/active'), {
                    method:  'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify(false),
                });
            } catch (e) { if (DEBUG) console.warn("[_lsStop] exception ignorée :", e); }
            clearInterval(liveShareTimer);
            liveShareTimer    = null;
            liveShareActive   = false;
            liveShareSessionId = null;
        }

        // Démarre ou arrête le live share
        async function toggleLiveShare() {
            const btn = document.getElementById('nav-btn-liveshare');
            const toast = document.getElementById('liveshare-toast');

            if (liveShareActive) {
                // ── Arrêt ──
                await _lsStop();
                btn.classList.remove('sharing');
                toast.textContent = '📡 Partage arrêté';
                toast.style.borderColor = 'rgba(220,53,69,0.5)';
                toast.style.color = '#f87171';
                toast.classList.add('visible');
                setTimeout(() => toast.classList.remove('visible'), 2500);
                return;
            }

            // ── Démarrage ──
            if (FIREBASE_DB_URL.includes('TON_PROJET')) {
                alert('⚠️ Configure d\'abord FIREBASE_DB_URL dans le code !');
                return;
            }
            if (!lastRealCoords) {
                alert('GPS pas encore localisé — attends quelques secondes.');
                return;
            }

            liveShareSessionId = _lsGenId();
            liveShareActive    = true;
            btn.classList.add('sharing');

            // Premier push immédiat
            await _lsPushPosition();

            // Push périodique toutes les 5s
            liveShareTimer = setInterval(_lsPushPosition, LIVE_SHARE_INTERVAL_MS);

            // Construire et copier le lien tracker
            const trackerUrl = `https://saliferic.github.io/salif-gps/tracker.html?s=${liveShareSessionId}`;
            try { await navigator.clipboard.writeText(trackerUrl); } catch (e) { if (DEBUG) console.warn("[toggleLiveShare] exception ignorée :", e); }

            // Proposer d'envoyer via WhatsApp
            const dest = document.getElementById('geocode-end')?.value || 'destination';
            const waMsg = encodeURIComponent(
                `📍 Suis ma position en direct !\nJe suis en route vers ${dest}.\n👉 ${trackerUrl}`
            );
            const waPhone = (typeof tenMinPhone !== 'undefined' && tenMinPhone)
                ? tenMinPhone.replace(/[^0-9+]/g, '').replace('+', '')
                : '';
            const waUrl = waPhone
                ? `https://wa.me/${waPhone}?text=${waMsg}`
                : `https://wa.me/?text=${waMsg}`;

            window.open(waUrl, '_blank');

            // Toast de confirmation
            toast.textContent = '📡 Partage live actif — lien copié !';
            toast.style.borderColor = 'rgba(40,167,69,0.5)';
            toast.style.color = '#6ee7b7';
            toast.classList.add('visible');
            setTimeout(() => toast.classList.remove('visible'), 3500);
        }

        // === WIDGET MÉTÉO (Open-Meteo, sans clé API) ===
        let _weatherLastFetch  = 0;
        let _weatherLastCoords = null;
        /* Vrai tant qu'une requête météo est en vol. Sans ce drapeau, chaque fix GPS
           qui repassait les seuils relançait une requête PENDANT que la précédente
           répondait encore — `_weatherLastFetch` n'étant écrit qu'après succès. */
        let _weatherInFlight = false;
        const WEATHER_INTERVAL_MS = 5 * 60 * 1000; // 5 min
        /* 5 km et non 500 m. Le seuil de distance existe pour attraper le changement de
           MASSE D'AIR, pas le changement de rue : la température et le code WMO rendus
           par Open-Meteo sont identiques d'un bout à l'autre d'une agglomération. À
           500 m, un Paris–Lyon tirait une requête toutes les 16 s à 110 km/h, soit
           ~1 000 appels pour un widget qui affiche deux caractères. */
        const WEATHER_MIN_MOVE_KM = 5;

        // Codes WMO — deux variantes : jour (is_day=1) et nuit (is_day=0)
        const WMO_DAY = {
            0:'☀️', 1:'🌤️', 2:'⛅', 3:'☁️',
            45:'🌫️', 48:'🌫️',
            51:'🌦️', 53:'🌦️', 55:'🌧️',
            61:'🌧️', 63:'🌧️', 65:'🌧️',
            71:'🌨️', 73:'🌨️', 75:'❄️', 77:'🌨️',
            80:'🌦️', 81:'🌧️', 82:'⛈️', 85:'🌨️', 86:'❄️',
            95:'⛈️', 96:'⛈️', 99:'⛈️',
        };
        const WMO_NIGHT = {
            0:'🌙', 1:'🌙', 2:'☁️', 3:'☁️',
            45:'🌫️', 48:'🌫️',
            51:'🌦️', 53:'🌦️', 55:'🌧️',
            61:'🌧️', 63:'🌧️', 65:'🌧️',
            71:'🌨️', 73:'🌨️', 75:'❄️', 77:'🌨️',
            80:'🌦️', 81:'🌧️', 82:'⛈️', 85:'🌨️', 86:'❄️',
            95:'⛈️', 96:'⛈️', 99:'⛈️',
        };
        const WMO_LABEL = {
            0:'SOLEIL', 1:'DÉGAGÉ', 2:'NUAGEUX', 3:'COUVERT',
            45:'BROUILL.', 48:'GIVRE',
            51:'BRUINE', 53:'BRUINE', 55:'BRUINE+',
            61:'PLUIE', 63:'PLUIE', 65:'PLUIE+',
            71:'NEIGE', 73:'NEIGE', 75:'NEIGE+', 77:'GRÉSIL',
            80:'AVERSES', 81:'AVERSES', 82:'AVERSE+', 85:'NEIGE', 86:'NEIGE+',
            95:'ORAGE', 96:'GRÊLE', 99:'GRÊLE+',
        };

        async function fetchWeather(lat, lng) {
            if (_weatherInFlight) return;
            _weatherInFlight = true;
            /* ⚠ L'HORODATAGE EST POSÉ AVANT LA REQUÊTE, PAS APRÈS SON SUCCÈS. Écrit
               seulement en cas de succès, il laissait `elapsed` au-dessus de
               WEATHER_INTERVAL_MS indéfiniment dès qu'Open-Meteo répondait mal
               (`!res.ok`, coupure réseau) : maybeUpdateWeather relançait alors une
               requête à CHAQUE fix GPS, soit une par seconde pendant tout le trajet.
               Une panne du service se transformait ainsi en martèlement. */
            _weatherLastFetch  = Date.now();
            _weatherLastCoords = [lng, lat];
            try {
                const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=temperature_2m,weathercode,is_day&timezone=auto`;
                const res = await fetch(url);
                if (!res.ok) return;
                const data = await res.json();
                const temp   = Math.round(data.current.temperature_2m);
                const code   = data.current.weathercode;
                const isDay  = data.current.is_day === 1;  // 1 = jour, 0 = nuit
                const icons  = isDay ? WMO_DAY : WMO_NIGHT;
                const icon   = icons[code]   ?? (isDay ? '🌡️' : '🌙');
                const label  = WMO_LABEL[code] ?? 'MÉTÉO';

                document.getElementById('weather-icon').textContent = icon;
                document.getElementById('weather-temp').textContent = temp + '°';
                document.getElementById('weather-desc').textContent = isDay ? label : 'NUIT · ' + label;
                document.getElementById('weather-widget').classList.add('loaded');
            } catch(e) { /* silencieux */ }
            finally { _weatherInFlight = false; }
        }

        function maybeUpdateWeather(lat, lng) {
            const now     = Date.now();
            const elapsed = now - _weatherLastFetch;
            // Toujours rafraichir si l'intervalle est ecoule (temps prioritaire sur distance)
            if (elapsed >= WEATHER_INTERVAL_MS) {
                fetchWeather(lat, lng);
                return;
            }
            // Sinon : rafraichir seulement si on a bouge de plus de WEATHER_MIN_MOVE_KM
            if (_weatherLastCoords) {
                const moved = turf.distance(turf.point(_weatherLastCoords), turf.point([lng, lat]), { units: 'kilometers' });
                if (moved >= WEATHER_MIN_MOVE_KM) fetchWeather(lat, lng);
            }
        }

        // === COMPTEUR VITESSE STYLE WAZE ===
        // Arc SVG : 220° d'amplitude, circonférence pour r=42 → ~263.9px
        const _SPD_CIRCUMFERENCE = 2 * Math.PI * 42;
        // Longueur visuelle réelle du fond gris (stroke-dasharray="183 314") = 183px
        // C'est cette valeur qui doit être le "plein" de la jauge, pas la valeur
        // théorique 263.9*(220/360)≈161px qui ne remplissait que ~88% de l'arc visible.
        const _SPD_ARC_LEN = 183;
        /* ── L'ARC EST PLEIN À LA LIMITE, PAS À 1,5 × LA LIMITE (17/08/2026) ──
           Premier réglage : `dynMax = limite × 1,5`, soit l'arc plein à 75 km/h dans une zone
           50. Conséquence relevée en conduite : à 27 km/h dans une zone 30 — donc à 90 % de
           la limite, l'attention maximale — la jauge n'était qu'aux 3/5 et se lisait comme
           « il reste de la marge ». Le contresens était systématique, à toutes les limites.
           La jauge répond à UNE question, « où en suis-je par rapport à ce qui est autorisé ? »,
           et sa réponse doit être l'angle, pas une couleur : un coup d'œil périphérique au
           volant lit un remplissage, il ne lit pas une nuance de vert.
           L'excès de vitesse ne se perd pas pour autant, il change simplement de canal : la
           saturation de l'arc, le passage au rouge, le halo d'écran et le chiffre lui-même le
           disent — quatre signaux, là où la marge des 50 % n'en donnait qu'un, tardif et muet.
           ⚠ Conséquence assumée : au-delà de la limite, l'arc est plein et ne bouge plus. 60 et
           80 dans une zone 50 se ressemblent SUR L'ARC. C'est voulu — les deux appellent la
           même action, ralentir, et c'est le chiffre central qui donne l'ampleur. */
        function updateSpeedometer(speedKmh, limitKmh, isSpeeding) {
            if (!isCourseStarted) return;
            const arcFill    = DOM.speedometerArcFill || document.getElementById('speedometer-arc-fill');
            const limitBadge = DOM.speedLimitBadge   || document.getElementById('speed-limit-badge');
            const limitVal   = DOM.speedLimitValue    || document.getElementById('speed-limit-value');
            if (!arcFill) return;

            // Plein exactement à la limite en vigueur — voir le bloc au-dessus.
            const dynMax = limitKmh || 50;
            const ratio = Math.min(speedKmh / dynMax, 1);
            const filled = ratio * _SPD_ARC_LEN;
            const gap = _SPD_CIRCUMFERENCE - filled;
            arcFill.setAttribute('stroke-dasharray', `${filled.toFixed(1)} ${gap.toFixed(1)}`);

            // Couleur de l'arc
            if (isSpeeding) {
                arcFill.setAttribute('stroke', '#ff3b30');
            } else if (limitKmh && speedKmh > limitKmh * 0.9) {
                arcFill.setAttribute('stroke', '#ff9500');
            } else {
                arcFill.setAttribute('stroke', '#4cd964');
            }

            // Pastille vitesse limite
            if (limitKmh && limitBadge && limitVal) {
                limitVal.textContent = Math.round(limitKmh);
                limitBadge.classList.add('visible');
                // Valeur non confirmée (déduite de la classe de route ou repli aveugle) :
                // contour gris pointillé pour ne pas faire passer une estimation pour un
                // panneau relevé. Aucune pénalité n'est appliquée dans cet état.
                /* ⚠ `isSpeedLimitUnknown()` ET NON `isSpeedLimitUncertain()` : le gris
                   pointillé dit « aucune donnée sur cette route », pas « je m'interdis de
                   pénaliser ». Les deux tests ont été séparés le 31/08/2026 — voir leur
                   commentaire dans js/05. Reprendre le test large ici rendrait la pastille
                   grise sur presque tous les 50 de ville. */
                const inconnue = isSpeedLimitUnknown();
                limitBadge.classList.toggle('limit-uncertain', inconnue);
                limitBadge.style.borderStyle = inconnue ? 'dashed' : 'solid';
                limitBadge.style.borderColor = inconnue ? '#7b8794' : (isSpeeding ? '#ff3b30' : '#e74c3c');
            }

            majPortraitCompagnonArret(speedKmh);
        }

        /* ═══ LE COMPAGNON NE SE MONTRE QU'À L'ARRÊT          (31/08/2026) ═══
           Troisième et dernière place de l'animal pendant la navigation. Sur la carte il
           masquait les carrefours ; en bas à gauche, à 96 px, il attirait l'œil pendant
           la conduite — un jeu qui pousse à regarder ailleurs que la route est raté, quel
           que soit le soin apporté au reste.
           Il apparaît donc uniquement véhicule arrêté (feu rouge, bouchon, stationnement),
           posé sur la barre de vie, et s'efface dès que ça repart. On voit l'état de son
           animal quand on a le droit de le regarder, jamais quand on ne l'a pas.

           ⚠ LE SEUIL EST DISSYMÉTRIQUE : on se montre sous ARRET_SEUIL_APPARITION, on se
           cache au-dessus d'ARRET_SEUIL_DISPARITION (plus bas). Un seuil unique ferait
           clignoter l'animal au pas d'un bouchon, où la vitesse oscille sans arrêt autour
           de la valeur — ce clignotement attirerait l'œil bien plus que sa présence
           permanente. Resserré le 05/09/2026 sur demande utilisateur (apparition quasi
           à l'arrêt strict, disparition dès 3 km/h) : voir le commentaire des constantes
           pour le compromis que ça rouvre sur un bouchon.
           La disparition n'est PAS conditionnée à `isCourseStarted` : l'appelant l'est
           déjà, et la fin de trajet retire la barre entière. */
        /* Appelée à la fin du trajet (js/19) : plus aucun point GPS ne passera par
           `majPortraitCompagnonArret`, c'est donc le seul moyen de rendre l'écran propre.
           Sans elle, le portrait restait affiché — et il l'était forcément, puisqu'un
           trajet se termine presque toujours à l'arrêt. */
        function masquerPortraitCompagnon() {
            _portraitArretVisible = false;
            document.getElementById('nav-compagnon-portrait')?.classList.remove('visible');
        }

        /* Seuils resserrés le 05/09/2026 (relevé terrain, demande utilisateur) : le
           compagnon ne doit apparaître qu'à l'arrêt réel, pas dès qu'on ralentit vers
           un stop, et disparaître dès la reprise plutôt qu'attendre 6 km/h. `0.5` et
           pas `0` pour l'apparition : le GPS ne rend jamais un 0 km/h exact à l'arrêt,
           il oscille de quelques dixièmes autour de zéro. L'asymétrie (0,5 / 3) reste
           volontairement plus resserrée que l'ancienne (2 / 6), au prix d'un risque de
           clignotement au pas dans un bouchon — à surveiller au prochain trajet. */
        const ARRET_SEUIL_APPARITION = 0.5; // km/h — en dessous, le véhicule est à l'arrêt
        const ARRET_SEUIL_DISPARITION = 3;  // km/h — au-dessus, il roule
        let _portraitArretVisible = false;
        function majPortraitCompagnonArret(speedKmh) {
            const el = document.getElementById('nav-compagnon-portrait');
            if (!el) return;
            /* ⚠ HORS TRAJET, L'ANIMAL N'A RIEN À FAIRE LÀ (31/08/2026). Il est le témoin
               de la vie qui se joue PENDANT la conduite ; en dehors, il ne fait que
               couvrir la barre de vie et ce qui l'entoure. La garde est posée ici, sur
               `isCourseStarted`, et non sur la seule visibilité de la barre : c'est
               l'état du trajet qui commande, pas un effet de bord de mise en page.
               `masquerPortraitCompagnon()` (js/19) fait la même chose à la fin du trajet,
               quand plus aucun point GPS ne viendra repasser par ici. */
            if (typeof isCourseStarted !== 'undefined' && !isCourseStarted) {
                if (_portraitArretVisible) { _portraitArretVisible = false; el.classList.remove('visible'); }
                return;
            }
            const v = speedKmh || 0;
            if (!_portraitArretVisible && v <= ARRET_SEUIL_APPARITION) {
                _portraitArretVisible = true;
                // Peint au dernier moment : l'état de l'animal a pu changer depuis le
                // dernier arrêt, et rien ne sert de tenir un SVG à jour hors de l'écran.
                tenterSansBruit(() => rafraichirPortraitNav(), 'portraitArret/dessin');
                el.classList.add('visible');
            } else if (_portraitArretVisible && v >= ARRET_SEUIL_DISPARITION) {
                _portraitArretVisible = false;
                el.classList.remove('visible');
            }
        }

        function updateScreenGlow(isSpeeding, isActive, speedKmh, isWarning) {
            const glow = document.getElementById('screen-glow');
            if (!isActive) { glow.className = ''; return; }
            if (isSpeeding)       { glow.className = 'glow-red'; }
            else if (isWarning)   { glow.className = 'glow-orange'; }
            else if ((speedKmh || 0) > 3) { glow.className = 'glow-green'; }
            else { glow.className = ''; }
        }

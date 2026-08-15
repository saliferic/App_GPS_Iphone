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
                                // Mettre à jour lastRealCoords pour que le bearing soit calculé à partir
                                // de la position actuelle, pas de l'ancienne position avant le tunnel.
                                lastRealCoords = [lng, lat];
                                // Le conducteur doit savoir que les annonces redeviennent fiables.
                                playAudioSequence(['location_recovered.ogg']);
                                if (DEBUG) console.log('[GPS] Signal retrouvé');
                            }
                        } else if (isCourseStarted) {
                            if (!_gpsDegradedSince) _gpsDegradedSince = _nowFix;
                            if (!gpsSignalLost &&
                                (_nowFix - _gpsDegradedSince) > GPS_LOST_DELAY_MS &&
                                lastKnownSpeedKmh > GPS_DR_MIN_SPEED) {
                                gpsSignalLost = true;
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

        // Génère un ID de session court et lisible (ex: "abc123")
        function _lsGenId() {
            return Math.random().toString(36).slice(2, 8);
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
        const WEATHER_INTERVAL_MS = 5 * 60 * 1000; // 5 min
        const WEATHER_MIN_MOVE_KM = 0.5;

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

                _weatherLastFetch  = Date.now();
                _weatherLastCoords = [lng, lat];
            } catch(e) { /* silencieux */ }
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
        // Max dynamique : la jauge se remplit à 100% à limitKmh × 1.5
        // Ex: limite 50 → arc plein à 75 km/h ; limite 130 → arc plein à 195 km/h

        function updateSpeedometer(speedKmh, limitKmh, isSpeeding) {
            if (!isCourseStarted) return;
            const arcFill    = DOM.speedometerArcFill || document.getElementById('speedometer-arc-fill');
            const limitBadge = DOM.speedLimitBadge   || document.getElementById('speed-limit-badge');
            const limitVal   = DOM.speedLimitValue    || document.getElementById('speed-limit-value');
            if (!arcFill) return;

            // Max dynamique basé sur la limite courante
            const dynMax = (limitKmh || 50) * 1.5;
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
                const uncertain = isSpeedLimitUncertain();
                limitBadge.classList.toggle('limit-uncertain', uncertain);
                limitBadge.style.borderStyle = uncertain ? 'dashed' : 'solid';
                limitBadge.style.borderColor = uncertain ? '#7b8794' : (isSpeeding ? '#ff3b30' : '#e74c3c');
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

        // === SYSTÈME DE MARGE ET GRÂCE ===
        // Marge fixe par palier de limite (orange sans pénalité, dépassement volontaire au-delà)
        // getSpeedMarginKmh supprimée : marge fixe remplacée par SPEED_TOLERANCE_FACTOR (5% marge radar)
        // Durée de grâce lors d'une BAISSE de limite : min(4 + écart×0.25, 12) secondes
        function getGraceDurationMs(oldLimit, newLimit) {
            const ecart = Math.max(0, oldLimit - newLimit);
            return Math.min(4 + ecart * 0.25, 12) * 1000;
        }
        // État de la grâce (partagé, conducteur principal uniquement)
        let _graceActive = false;       // grâce en cours
        let _graceEndTime = 0;          // timestamp de fin
        let _gracePrevLimit = 0;        // limite avant le changement
        let _graceNewLimit  = 0;        // nouvelle limite (plus basse)

        // Appelée à chaque frame pour détecter un changement de limite vers le bas
        function maybeStartGrace(newLimitKmh) {
            if (!_gracePrevLimit) { _gracePrevLimit = newLimitKmh; return; }
            if (newLimitKmh < _gracePrevLimit) {
                // Baisse de limite détectée → lancer/prolonger la grâce
                const dur = getGraceDurationMs(_gracePrevLimit, newLimitKmh);
                _graceActive   = true;
                _graceEndTime  = Date.now() + dur;
                _graceNewLimit = newLimitKmh;
            }
            _gracePrevLimit = newLimitKmh;
        }
        // Retourne true si la grâce est encore active
        function isGraceActive(currentSpeedKmh, limitKmh) {
            if (!_graceActive) return false;
            // Annulation anticipée : le conducteur a déjà ralenti sous la nouvelle limite
            if (currentSpeedKmh <= _graceNewLimit) { _graceActive = false; return false; }
            // Expiration temporelle
            if (Date.now() >= _graceEndTime) { _graceActive = false; return false; }
            return true;
        }

        let pickingMode = null; 
        let startTempMarker = null;
        let endTempMarker = null;
        let exactStartCoords = null;
        let exactEndCoords = null;

        const PALETTE = ['#4da3ff', '#ff6b6b', '#28a745', '#fd7e14', '#b19cd9', '#17a2b8'];
        let drivers = [];
        let driverIdCounter = 0;

        let watchId = null;
        let gpsStartupPhase = false; // true pendant les 8 premières secondes : supprime les erreurs transitoires
        let userLocationMarker = null; // point bleu permanent, affiché dès que le GPS est localisé (avant même de démarrer un trajet)
        let lastRealCoords = null;
        let lastRealTimestamp = null;
        let currentDynamicZoom = 15;
        let lastKnownBearing = 0;
        // Dead reckoning : quand le signal GPS est perdu (tunnel, pont), on estime la position
        // en avançant le long du tracé à la dernière vitesse connue.
        let deadReckoningTimer = null;
        let lastGpsUpdateTime = 0;
        let lastKnownSpeedKmh = 0;
        let deadReckoningDistKm = 0; // distance parcourue en dead reckoning depuis la perte de signal

        // --- Détection de perte de signal (tunnel, parking couvert, sous-sol) ---
        // Piège : sous un tunnel, la puce GPS ne s'arrête PAS d'émettre. Android continue de
        // livrer des positions issues du réseau (antennes/wifi), figées ou très imprécises.
        // Se fier uniquement à "plus aucun callback" ne détecte donc jamais le tunnel.
        // Autre piège symétrique : à un feu rouge la position est figée AUSSI. Ce qui distingue
        // les deux cas, c'est la PRÉCISION : elle s'effondre en tunnel, elle reste bonne à l'arrêt.
        // On ne bascule donc en dead reckoning que sur dégradation de précision, jamais sur le
        // simple gel de la position — sinon l'app ferait avancer la voiture seule au feu rouge.
        const GPS_LOST_ACCURACY_M = 45;   // au-delà : fix réseau, pas un vrai fix satellite
        const GPS_LOST_DELAY_MS   = 3000; // durée de dégradation avant de basculer
        const GPS_DR_MIN_SPEED    = 12;   // il faut roulait avant : sinon on est juste garé
        let gpsSignalLost      = false;
        let _gpsDegradedSince  = 0;
        let _lastUsableFixTime = 0;
        // true tant que la position AFFICHÉE provient de l'extrapolation et non d'un fix
        // satellite. Distinct de gpsSignalLost : le dead reckoning prend aussi la main sur
        // une simple absence de fix (> 3 s) sans que la perte de signal soit déclarée.
        // Conditionne le « environ » des annonces vocales et le « ≈ » du bandeau de manœuvre.
        let _positionIsEstimated = false;
        /* Vitesse au MOMENT de la perte de signal. Le dead reckoning inertiel (13-stats-eco)
           intègre l'accéléromètre dans `lastKnownSpeedKmh` ; une intégration ne se corrige
           jamais toute seule, son biais s'accumule et la vitesse dérive vers le plafond
           pendant toute la traversée. Cette référence borne la dérive — voir le clamp dans
           handleDeviceMotion. 0 = pas de perte en cours. */
        let _drSpeedAtLoss = 0;
        /* Horodatage du retour d'un fix satellite propre après une perte. Les premières
           secondes qui suivent sont les MOINS fiables de tout le trajet (la puce reconverge,
           la position peut atterrir sur la chaussée d'à côté) — or c'est précisément à cet
           instant qu'on déclenchait un recalcul d'itinéraire, donc sur une position fausse.
           Voir la fenêtre de grâce dans handleRealMovement. */
        let _gpsRecoveredAt = 0;
        const GPS_RECOVERY_GRACE_MS = 6000;
        let currentVisualBearing = 0;
        let headingUpMode = true; // true = carte orientée cap (par défaut), false = carte orientée nord

        let currentTurfLine = null;
        let isRecalculating = false;
        /* ⚠ `isRecalculating` seul ne suffit pas à garantir qu'un recalcul reste possible.
           Il est levé à la fin de `recalculateRoute`, donc APRÈS l'aller-retour réseau — et
           celui-ci peut durer très longtemps sans jamais échouer franchement : `fetchRouteMapbox`
           enchaîne deux tentatives avec relance (6 s ×2 puis 8 s ×2), soit ~29 s dans le pire
           cas, pendant lesquelles TOUTE nouvelle demande de recalcul est jetée en silence.
           Deux tours de ce genre et l'itinéraire reste faux près d'une minute.
           D'où ces trois garde-fous :
           — `_recalcGeneration` : jeton d'ordre. Une réponse qui revient alors qu'un recalcul
             plus récent a démarré est ignorée, ce qui rend sûr le fait de relâcher le verrou
             avant la fin d'une requête (sinon deux réponses se disputeraient `currentTurfLine`).
           — `_recalcWatchdog` : relâche le verrou au bout de RECALC_HARD_DEADLINE_MS. La requête
             en cours n'est pas annulée, elle est simplement déclassée.
           — `_lastRecalcAttemptMs` : intervalle minimum entre deux tentatives, pour que le
             relâchement anticipé ne se transforme pas en martèlement de l'API à chaque frame. */
        let _recalcGeneration = 0;
        let _recalcWatchdog = null;
        let _lastRecalcAttemptMs = 0;
        const RECALC_HARD_DEADLINE_MS = 9000;
        const RECALC_MIN_INTERVAL_MS  = 4000;
        // Devient true dès la première frame hors-itinéraire détectée, et reste true tant que
        // la déviation persiste : évite de re-couper l'audio et de re-supprimer les seuils
        // annoncés à CHAQUE frame GPS pendant les quelques secondes que prend le recalcul,
        // ce qui faisait rejouer la même instruction vocale en boucle avant que le nouvel
        // itinéraire ne soit effectif.
        let _routeDeviationHandled = false;
        /* Progression maximale atteinte le long du tracé courant, en mètres. Sert à
           repérer une projection qui RECULE — signature d'un virage dépassé. Doit être
           remis à null à chaque nouveau tracé : sur l'itinéraire recalculé, la
           progression repart de zéro et la comparer à l'ancienne déclencherait un
           recalcul en boucle. */
        let _maxDistAlongM = null;

        // === LIMITE DE VITESSE RÉELLE DU TRONÇON (via OpenStreetMap / Overpass API) ===
        let currentSpeedLimitKmh = null;   // null tant qu'on n'a rien pu récupérer -> repli sur 50 km/h
        let isFetchingSpeedLimit = false;
        let lastSpeedLimitFetchTime = 0;
        let lastSpeedLimitCoords = null;
        const SPEED_LIMIT_REFETCH_METERS = 120; // on ne redemande que si on a assez bougé...
        const SPEED_LIMIT_REFETCH_MS = 12000;   // ...et pas plus souvent que ça (évite de spammer Overpass)

        /* === TRAÇABILITÉ DE LA LIMITE AFFICHÉE ===
           Un « 50 » à l'écran pouvait vouloir dire trois choses très différentes : une valeur
           lue sur un panneau cartographié, une valeur déduite de la classe de la route, ou
           simplement « aucune donnée ». On mémorise donc la provenance de la valeur courante
           pour pouvoir la diagnostiquer sur le terrain et, surtout, pour ne pas pénaliser le
           conducteur sur une limite dont on n'est pas sûr.
             'mapbox'             : annotation maxspeed de l'itinéraire Mapbox (la plus fiable)
             'overpass-tag'       : tag maxspeed explicite d'OpenStreetMap
             'overpass-same-class': tag maxspeed d'un tronçon de même classe à proximité
             'overpass-inference' : déduit de la classe de route (highway=…) — incertain
             'steps'              : déduit de la vitesse moyenne des steps Mapbox — incertain
             'fallback'           : repli aveugle 30/50 — incertain
             null                 : rien encore
        */
        let _speedLimitSource = null;
        let _overpassSource = null;    // provenance de currentSpeedLimitKmh (couche Overpass seule)
        let _speedLimitDebug = null;   // { tags, highway, dist, ts } du tronçon Overpass retenu
        // Sources sur lesquelles on refuse d'infliger une pénalité de vitesse.
        const UNCERTAIN_SPEED_SOURCES = ['overpass-inference', 'steps', 'fallback'];
        function isSpeedLimitUncertain() {
            return !_speedLimitSource || UNCERTAIN_SPEED_SOURCES.includes(_speedLimitSource);
        }

        let fullRouteLine = null;
        let routeTotalDistKm = 0;       // distance totale de l'itinéraire (Mapbox Directions)
        let routeTotalDurationHours = 0; // durée totale estimée (avec trafic, Mapbox Directions)
        // État mutable de la simulation — permet de mettre à jour la trajectoire après recalcul (ajout d'arrêt)
        let simState = null; // { line, distanceKm, totalDurationHours, timeScale }
        let routeSteps = [];
        let stepArrivalDist = [];
        let currentStepIndex = 0;
        let announcedThresholds = {};
        let voiceGuidanceEnabled = true;

        let ecoCounterEnabled = localStorage.getItem('gps_eco_counter') === '1';

        function onEcoCounterToggleChange() {
            ecoCounterEnabled = document.getElementById('eco-counter-toggle').checked;
            localStorage.setItem('gps_eco_counter', ecoCounterEnabled ? '1' : '0');
            // Afficher/masquer le compteur si un trajet est en cours
            const counter = document.getElementById('nav-eco-counter');
            if (counter) counter.style.display = isCourseStarted && ecoCounterEnabled ? 'flex' : 'none';
        }
        let currentAudioObject = null;

        const ORDINAL_MAP = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th', 5: '5th', 6: '6th' };

        function onVoiceToggleChange() {
            voiceGuidanceEnabled = document.getElementById('voice-guidance-toggle').checked;
            localStorage.setItem('gps_voice_enabled', voiceGuidanceEnabled ? '1' : '0');
            if (!voiceGuidanceEnabled) stopAudio();
        }

        /* ═══ MODE « MOINS BAVARD » ═══
           Même principe que la voix réduite de Google Maps / Waze : on ne coupe pas le son,
           on ne garde que ce qui sert à conduire. Deux effets, et seulement deux :
             1. les annonces classées 'bavard' (confort, gamification, confirmations) sont
                filtrées ici, au seul goulot d'étranglement audio de l'app — un appelant qui
                oublie le niveau reste donc audible, c'est le défaut sûr ;
             2. un virage n'est plus annoncé qu'une fois au lieu de trois (cf. js/09).
           Ce qui reste toujours audible : manœuvres, arrivée, perte de GPS, alerte ZFE. */
        let voiceQuietMode = localStorage.getItem('gps_voice_quiet') === '1';

        function onVoiceQuietChange() {
            const el = document.getElementById('voice-quiet-toggle');
            voiceQuietMode = el ? el.checked : voiceQuietMode;
            localStorage.setItem('gps_voice_quiet', voiceQuietMode ? '1' : '0');
        }

        let audioGeneration = 0;

        function stopAudio() {
            audioGeneration++; // invalide toute lecture/suite en cours (empêche une relance fantôme)
            if (currentAudioObject) {
                currentAudioObject.pause();
                currentAudioObject = null;
            }
        }

        // `niveau` : 'essentiel' (défaut) = toujours joué ; 'bavard' = coupé en mode moins bavard.
        function playAudioSequence(files, index = 0, niveau = 'essentiel') {
            if (!voiceGuidanceEnabled || index >= files.length) return;
            if (niveau === 'bavard' && voiceQuietMode) return;
            audioGeneration++;
            const myGeneration = audioGeneration;
            if (currentAudioObject) { currentAudioObject.pause(); currentAudioObject = null; }
            const filePath = `Voice/${files[index]}`;
            currentAudioObject = new Audio(filePath);
            currentAudioObject.onended = () => {
                if (myGeneration !== audioGeneration) return; // cette séquence a été remplacée entre-temps
                playAudioSequence(files, index + 1, niveau);
            };
            currentAudioObject.play().catch(e => {
                if (myGeneration !== audioGeneration) return; // interruption volontaire (pause), pas une vraie erreur
                console.warn(`Audio introuvable ou erreur de lecture: ${filePath}`, e);
                playAudioSequence(files, index + 1, niveau);
            });
        }

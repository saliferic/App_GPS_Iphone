        // === SCAN STATIONS AUTOUR DE MOI (feuille autonome, hotbox ⛽) ===
        // ═══════════════════════════════════════════════════════════════════
        // Volontairement séparé de la section stations du modal de trajet : celle-ci
        // raisonne CONTRE un tracé (fenêtre getGasSearchWindow, détour OSRM, réécriture
        // de l'itinéraire par selectGasStation). Ici il n'y a pas de trajet — juste une
        // bulle autour du conducteur. Greffer un mode de plus sur les globales
        // _allGasStations / gasSortMode / selectedFuelType aurait fait que scanner
        // pendant une prévisualisation de trajet écrase la liste du modal.
        // En revanche tout le socle EST réutilisé : fetchGasPointFR, extractGasCoords,
        // extractGasPrice, getStationOpeningStatus, les favoris et les classes CSS
        // .gas-station-card.

        const GAS_SCAN_MAX_CARDS   = 12;   // au-delà, la liste devient illisible au volant
        const GAS_SCAN_MATRIX_MAX  = 24;   // Directions Matrix : 25 points source incluse
        const GAS_SCAN_FALLBACK_KMH = 25;  // vitesse urbaine, repli si la Matrix échoue

        let _scanStations = [], _scanShown = [], _scanMarkers = [];
        let _scanFuel   = 'sp95';
        let _scanSort   = 'proche';
        // Mode mixte (hybride) : filtre de type, et filtre connecteur côté bornes.
        let _scanKind   = 'all';   // 'all' | 'gas' | 'ev'
        let _scanConn   = null;    // null = tous connecteurs

        /* Ce que le scan cherche, d'après la configuration véhicule :
           thermique → carburant, électrique → bornes, hybride → LES DEUX dans une
           seule liste triée par distance. Un hybride rechargeable a un besoin réel
           des deux réseaux ; le forcer dans un seul lui cacherait la moitié de ses
           options. Chaque résultat porte donc son `kind`, et c'est lui qui décide du
           picto, de la pastille et du critère de tri applicable. */
        function _scanVehicleMode() {
            const t = (loadVehicleConfig().type || 'thermique');
            if (t === 'electrique') return 'ev';
            if (t === 'hybride')    return 'both';
            return 'gas';
        }

        function _scanSheetTitle() {
            const m = _scanVehicleMode();
            return m === 'ev' ? 'Bornes de recharge'
                 : m === 'both' ? 'Stations et bornes'
                 : 'Station essence';
        }
        let _scanAnchor = null;
        let _scanBusy   = false;
        let _scanRadiusKm = parseFloat(localStorage.getItem('gps_gas_scan_radius') || '5');
        if (!Number.isFinite(_scanRadiusKm) || _scanRadiusKm < 1 || _scanRadiusKm > 10) _scanRadiusKm = 5;

        /* Cache du dernier relevé (carburant + bornes) et veille silencieuse — même
           logique que le scan parkings (_scanCacheFresh, js/00 ; jumeau côté js/27).
           Le `tag` inclut le mode véhicule : changer de profil (thermique → hybride)
           entre deux scans doit invalider le cache, faute de quoi la moitié « bornes »
           manquerait tant que la position n'a pas assez bougé pour l'invalider seule. */
        const SCAN_CACHE_TTL_MS  = 120000;  // 2 min : prix et statuts bougent
        const SCAN_CACHE_MOVE_KM = 0.3;
        const SCAN_PREFETCH_MS   = 60000;

        /* ── SUIVI DE LA LISTE FEUILLE OUVERTE (30/08/2026) ──────────────────
           `runGasScan()` n'était appelé qu'à l'ouverture de la feuille et au
           relâchement du curseur de rayon ; la veille silencieuse, elle, s'arrête dès
           que la feuille est ouverte. Résultat : LA LISTE ÉTAIT FIGÉE SUR L'INSTANT DE
           L'OUVERTURE. Feuille laissée à l'écran sur un Paris→Lyon, elle affichait
           encore les stations du départ, avec des distances devenues fausses de
           plusieurs centaines de kilomètres — exactement le scénario que le scan
           « autour de moi » est censé couvrir.

           ⚠ LE SEUIL EST UNE CONJONCTION, ET C'EST TOUT L'ENJEU. Le réflexe est de
           rejouer le scan sur les 300 m de SCAN_CACHE_MOVE_KM, qui invalident déjà le
           cache. Chiffré avant d'écrire la moindre ligne : 300 m à 105 km/h se
           franchissent en **10 secondes**, soit 360 relevés à l'heure et ~1600 sur un
           Paris→Lyon. Le seuil de 300 m est calibré pour la ville (36 s à 30 km/h) et
           devient absurde sur autoroute. Il faut donc les DEUX conditions :

             • un plancher de temps — il plafonne la charge à 60 relevés/heure quelle
               que soit la vitesse, y compris à 130 km/h ;
             • une distance proportionnelle au rayon — 1 km sur un scan à 5 km. Un
               seuil fixe rescanne pour un déplacement invisible à l'échelle du cercle
               affiché, alors que ce qui compte est la part du disque qui a changé.

           Le plancher est plus contraignant que la distance dès ~60 km/h ; en dessous
           c'est la distance qui commande. Les deux règnent donc sur le domaine où ils
           ont un sens, et aucun ne peut emballer l'autre. */
        const SCAN_LIVE_TICK_MS  = 15000;   // cadence de vérification, pas de relevé
        const SCAN_LIVE_MIN_MS   = 60000;   // plancher entre deux relevés, feuille ouverte
        const SCAN_LIVE_MOVE_FRAC = 0.20;   // part du rayon à parcourir pour rejouer
        let _scanLastRunTs = 0;             // horodatage du dernier relevé effectif
        let _scanCache = { anchor: null, tag: null, ts: 0, rawGas: [], rawEv: [] };

        /* Le scan par rayon est INDISPONIBLE pendant l'aperçu de trajet.
           À cette étape, prefetchGasStationsPhase1() a déjà scanné les stations et
           posé ses propres marqueurs : lancer le scan par rayon dessinerait une
           seconde série de pastilles sur les mêmes stations, empilerait une seconde
           feuille par-dessus le modal, et les deux jeux de marqueurs se disputeraient
           la carte. Les deux outils répondent d'ailleurs à la même question au même
           moment — celui du modal la traite déjà, en tenant compte du trajet. */
        function _gasScanBlocked() {
            return !!document.getElementById('trip-modal-overlay')?.classList.contains('open');
        }

        // Point de départ du scan : position réelle, sinon marqueur conducteur, sinon
        // centre de carte. Jamais de coordonnée écrite en dur (cf. AGENTS.md).
        function _gasScanAnchorPoint() {
            const c = normalizeLngLat(lastRealCoords);
            if (c && isLngLat(c)) return c;
            if (drivers.length && drivers[0].marker) {
                const ll = drivers[0].marker.getLngLat();
                if (Number.isFinite(ll.lng) && Number.isFinite(ll.lat)) return [ll.lng, ll.lat];
            }
            const ctr = map.getCenter();
            return [ctr.lng, ctr.lat];
        }

        /* Hauteur de la feuille du scan : la MÊME que celle des onglets et de l'aperçu de
           trajet — getSheetHeightPx(), règle 50/50 (voir 08-panneau-itineraire.js).

           ⚠ CE PLAFOND EST OBLIGATOIRE, quelle que soit sa valeur. La feuille recopiait
           auparavant la hauteur mesurée du panneau Itinéraire déployé, qui occupait presque
           tout l'écran d'un vrai téléphone : il ne restait à la carte que le plancher
           MIN_MAP_BAND (150 px), fitBounds devait faire tenir plusieurs kilomètres de
           cercle dans cette bande, et le cadrage paraissait ne pas fonctionner. Réduire le
           panneau AVANT de lancer le scan le faisait « remarcher » — c'est ce symptôme qui
           a mis sur la piste.

           Deux simplifications apportées par la règle commune : le plafond valait 60 % de
           la hauteur disponible, la feuille dépassait donc les panneaux d'une centaine de
           pixels et cassait à elle seule l'équilibre visuel ; et la mesure du panneau
           revenait désormais à lire notre propre constante en passant par le DOM, avec le
           risque de tomber pendant une transition ou sur un panneau escamoté.

           La variable reste DÉDIÉE (--gas-scan-h) : écrire dans --panel-secondary-h, qui
           appartient au système de panneaux, créerait un couplage à sens unique. */
        function _syncGasScanHeight() {
            document.documentElement.style.setProperty('--gas-scan-h', getSheetHeightPx() + 'px');
        }

        function openGasScan() {
            const sheet = document.getElementById('gas-scan-sheet');
            if (!sheet) return;
            // Garde de dernier recours : la hotbox retire déjà l'entrée dans ce cas,
            // mais openGasScan() doit rester sûr quel que soit l'appelant.
            if (_gasScanBlocked()) return;
            _gasVeilleArmee = true;   // voir _scanPrefetchTick : la veille suit l'usage réel
            // Exclusion mutuelle avec le scan parkings (js/27) : voir openParkingScan().
            closeParkingScan({ keepCamera: true });
            /* Demander un scan alors que les stations sont masquées est contradictoire : la
               feuille afficherait une liste dont RIEN n'apparaît sur la carte, et la zone
               radar balaierait un vide. On lève donc le masquage — c'est le seul endroit où
               l'app le fait d'elle-même, et il est justifié par le geste de l'utilisateur,
               qui vient explicitement de réclamer ces stations. */
            if (_stationsHidden) { _stationsHidden = false; applyStationsVisibility(); }
            // Mesurer le panneau AVANT de le masquer : _syncGasScanHeight() s'en sert
            // comme référence de hauteur, et un élément masqué mesure zéro.
            _syncGasScanHeight();
            document.body.classList.add('gas-scan-open');
            sheet.classList.add('open');
            sheet.classList.remove('collapsed');
            // Deux frames : la classe .open pose display:flex, le transform ne s'anime
            // que si le navigateur a déjà peint l'état initial. La course de repli se
            // mesure dans la première, quand la feuille a enfin une hauteur.
            requestAnimationFrame(() => {
                _syncGasScanCollapse();
                requestAnimationFrame(() => sheet.classList.add('shown'));
            });

            const slider = document.getElementById('gas-scan-radius');
            if (slider) slider.value = _scanRadiusKm;
            _renderGasScanRadiusLabel();
            // Le titre et les filtres dépendent du véhicule, qui a pu changer dans
            // le profil depuis la dernière ouverture.
            const titre = document.getElementById('gas-scan-title');
            if (titre) titre.textContent = _scanSheetTitle();
            if (_scanVehicleMode() === 'ev') _scanKind = 'ev';
            else if (_scanVehicleMode() === 'gas') _scanKind = 'gas';
            _renderGasScanModes();

            // La zone est dessinée AVANT le scan : le curseur doit répondre tout de
            // suite, sans attendre le réseau.
            _scanAnchor = _gasScanAnchorPoint();
            _gasScanZoneUpdate(_scanAnchor, _scanRadiusKm);
            _gasScanZoneStart();

            /* Le GESTE est journalisé, pas seulement son résultat : sans cette ligne, une
               ouverture qui ne cadre pas ne laisse RIEN dans le journal, et on ne peut
               même pas dire si l'utilisateur a bien cliqué au moment qu'il croit. Elle
               s'apparie avec `fitScan` (cadrage fait) ou `scanSaute` (sorti avant). */
            tenterSansBruit(() => logDiag('scanOuvre', {
                busy: _scanBusy, enligne: navigator.onLine,
                zAvant: +map.getZoom().toFixed(2), padCam: map.getPadding(),
                cap: Math.round(map.getBearing()), pitch: Math.round(map.getPitch()),
                panning: isUserPanning, course: isCourseStarted, simu: isSimulationMode,
                fixGps: !!lastRealCoords,
            }), 'openGasScan/diag');

            runGasScan();
        }

        function closeGasScan(opts = {}) {
            const sheet = document.getElementById('gas-scan-sheet');
            if (!sheet) return;
            // Appelable à l'aveugle (ouverture du modal de trajet) : sortir tout de
            // suite si rien n'est ouvert, plutôt que d'armer un timer pour rien.
            if (!sheet.classList.contains('open')) return;
            document.body.classList.remove('gas-scan-open');   // le panneau Itinéraire réapparaît
            sheet.classList.remove('shown');
            setTimeout(() => sheet.classList.remove('open'), 280);
            _clearGasScanMarkers();
            _gasScanZoneRemove();
            // Fermer la feuille sous une fiche détail encore ouverte laisserait
            // celle-ci flotter sans rien derrière — simple filet de sécurité,
            // sans restauration de caméra (_gasInfoGoClicked s'en charge déjà
            // proprement quand la fermeture vient de « J'y vais »).
            document.getElementById('gas-info-overlay')?.classList.remove('open');
            // Le scan a détaché la caméra du suivi : la refermer rend la main.
            // Sauf si l'appelant pose lui-même un cadrage juste après (« Go ici »),
            // auquel cas un recentrage intercalé ne ferait que secouer la vue.
            if (!opts.keepCamera && (isCourseStarted || lastRealCoords)) recenterMap();
        }

        function toggleGasScanSheet() {
            document.getElementById('gas-scan-sheet')?.classList.toggle('collapsed');
        }

        /* Course de repli = tout ce qui se trouve SOUS le curseur de rayon.
           On ne s'arrête pas à l'en-tête : le rayon est précisément la commande qu'on
           veut pouvoir réajuster en gardant la carte dégagée, et l'arrêter plus bas
           découvrirait le panneau Itinéraire derrière. Restent donc visibles l'en-tête,
           les filtres, les tris et le curseur ; seule la liste des résultats s'escamote.
           La mesure est une DIFFÉRENCE entre deux rects, donc insensible au `transform`
           en cours — elle reste juste que la feuille soit déployée, repliée ou en
           pleine animation d'ouverture. */
        function _gasScanCollapsedOffset() {
            const sheet  = document.getElementById('gas-scan-sheet');
            const head   = document.getElementById('gas-scan-head');
            const radius = document.getElementById('gas-scan-radius-row');
            if (!sheet || !head) return 0;

            /* Le repère est le HAUT DE LA LISTE de résultats, pas le bas du curseur.
               Mesurer le curseur puis ajouter une marge en dur était trop fragile :
               la ligne de statut et les gouttières qui le suivent passaient sous la
               barre d'onglets, et le curseur se retrouvait rogné. Se caler sur le haut
               de la liste conserve mécaniquement TOUT ce qui est au-dessus d'elle —
               en-tête, filtres, tris, curseur, statut — avec leurs espacements réels,
               sans aucune valeur à ajuster à la main si la mise en page change. */
            const list     = document.getElementById('gas-scan-list');
            const sheetTop = sheet.getBoundingClientRect().top;
            let visible    = head.offsetHeight;   // plancher absolu : le titre seul

            // Une liste VIDE convient parfaitement : sa hauteur vaut zéro mais son bord
            // supérieur est bien positionné sous le statut, ce qui est le repère voulu.
            const lr = list ? list.getBoundingClientRect() : null;
            if (lr && lr.top > sheetTop) {
                visible = Math.max(visible, (lr.top - sheetTop) + 6);
            }
            // Filet : si la liste est absente ou non mesurable, on retombe sur le
            // curseur avec une marge franche.
            if (radius && radius.offsetHeight > 0) {
                visible = Math.max(visible, (radius.getBoundingClientRect().bottom - sheetTop) + 26);
            }
            return Math.max(0, sheet.offsetHeight - visible);
        }

        function _syncGasScanCollapse() {
            const sheet = document.getElementById('gas-scan-sheet');
            if (!sheet) return;
            sheet.style.setProperty('--gas-scan-collapsed-y', _gasScanCollapsedOffset() + 'px');
        }

        /* Glissement de la feuille par l'en-tête.
           Un seul geste couvre les deux usages : on suit le doigt en direct, et au
           relâchement un déplacement inférieur à quelques pixels est interprété comme
           un simple tap qui bascule l'état. C'est pour ça que l'en-tête ne porte plus
           de `onclick` : les deux se seraient déclenchés l'un après l'autre. */
        (function initGasScanDrag() {
            const sheet = document.getElementById('gas-scan-sheet');
            const head  = document.getElementById('gas-scan-head');
            if (!sheet || !head) return;

            const TAP_TOLERANCE = 6;    // px en deçà desquels le geste est un tap
            const SNAP_RATIO    = 0.35; // part de la course au-delà de laquelle on replie
            let dragging = false, startY = 0, startOffset = 0, maxY = 0, curY = 0, travel = 0;

            head.addEventListener('pointerdown', (e) => {
                // Le bouton de fermeture ne doit pas armer un glissement.
                if (e.target.closest && e.target.closest('#gas-scan-close')) return;
                if (isPanelLandscape()) return;        // colonne latérale : pas de repli vertical
                if (e.button !== undefined && e.button > 0) return;
                dragging = true; travel = 0;
                startY = e.clientY;
                maxY = _gasScanCollapsedOffset();
                startOffset = sheet.classList.contains('collapsed') ? maxY : 0;
                curY = startOffset;
                sheet.style.transition = 'none';       // le suivi doit être immédiat
                tenterSansBruit(() => head.setPointerCapture(e.pointerId), 'scan/pointerCapture');
            });

            head.addEventListener('pointermove', (e) => {
                if (!dragging) return;
                const d = e.clientY - startY;
                travel = Math.max(travel, Math.abs(d));
                curY = Math.max(0, Math.min(maxY, startOffset + d));
                sheet.style.transform = `translateY(${curY}px)`;
            });

            const finish = () => {
                if (!dragging) return;
                dragging = false;
                sheet.style.transition = '';           // l'animation CSS reprend la main
                sheet.style.transform  = '';           // la position revient à la classe
                if (travel < TAP_TOLERANCE) {
                    toggleGasScanSheet();   // un seul endroit définit la bascule
                } else {
                    sheet.classList.toggle('collapsed', curY > maxY * SNAP_RATIO);
                }
            };
            head.addEventListener('pointerup', finish);
            head.addEventListener('pointercancel', finish);

            // Une rotation ou un clavier qui s'ouvre change la hauteur de la feuille,
            // donc la course de repli.
            window.addEventListener('resize', () => {
                if (sheet.classList.contains('open')) _syncGasScanCollapse();
            });
        })();

        function _renderGasScanRadiusLabel() {
            const el = document.getElementById('gas-scan-radius-val');
            if (el) el.textContent = (_scanRadiusKm % 1 ? _scanRadiusKm.toFixed(1) : _scanRadiusKm) + ' km';
        }

        // Le glissement redessine le cercle en direct — c'est gratuit, tout est local —
        // mais ne relance PAS le scan : une requête data.gouv.fr par pixel parcouru
        // serait absurde. Le cadrage attend lui aussi le relâchement, sinon la caméra
        // se battrait avec le doigt pendant tout le glissement.
        function onGasScanRadiusInput(v) {
            const km = parseFloat(v);
            if (!Number.isFinite(km)) return;
            _scanRadiusKm = km;
            _renderGasScanRadiusLabel();
            _gasScanZoneUpdate(_scanAnchor, km);
        }

        function onGasScanRadiusCommit(v) {
            const km = parseFloat(v);
            if (!Number.isFinite(km)) return;
            _scanRadiusKm = km;
            safeLocalSet('gps_gas_scan_radius', String(km));
            _renderGasScanRadiusLabel();
            runGasScan();
        }

        function setGasScanSort(mode) {
            if (!['proche', 'pascher', 'puissance'].includes(mode)) return;
            _scanSort = mode;
            _renderGasScanModes();
            _renderGasScan();
        }

        function setGasScanFuel(fuel) {
            _scanFuel = fuel;
            /* On REDESSINE les filtres, on ne les retouche pas à la main.
               La version précédente basculait la classe `active` d'après
               `b.dataset.fuel` — un attribut que le constructeur commun `_scanChip()`
               ne pose pas. La comparaison échouait donc sur toutes les pastilles :
               choisir un carburant les éteignait toutes au lieu d'en allumer une.
               Passer par _renderGasScanFilters() aligne cette fonction sur
               setGasScanKind() et setGasScanConnector(), qui font déjà ainsi — un
               seul endroit décide de l'état visuel des filtres. */
            _renderGasScanFilters();
            _renderGasScan();
        }

        // ── Collecte : un seul cercle FR paginé, plus les sources BE/ES si la bulle
        //    déborde sur la frontière. Les deux fetchers voisins attendent un tracé :
        //    on leur donne le diamètre de la bulle, ce qui couvre exactement la zone.
        async function _gasScanFetchRaw(lng, lat, radiusKm) {
            const dLat = radiusKm / 111;
            const dLng = radiusKm / (111 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
            const probeLine = [[lng - dLng, lat - dLat], [lng, lat], [lng + dLng, lat + dLat]];
            const countries = detectCountriesOnRoute(probeLine);
            /* Meme mouchard que le routeur trajet (js/17). Sans lui, un scan qui ne
               rend rien pres de la frontiere est indechiffrable : on ne sait pas si la
               branche BE a tourne et rendu zero, ou si elle n'a jamais ete appelee. */
            if (countries.length > 1 || countries[0] !== 'fr') tenterSansBruit(() => logDiag('gasPays', { ou: 'scan', pays: countries.join('+'), rayon: radiusKm }));

            const batches = await Promise.all(countries.map(cc => {
                if (cc === 'fr') return fetchGasPointFR(lng, lat, radiusKm).catch(() => []);
                if (cc === 'be' || cc === 'lu') return fetchStationsBE(probeLine).catch(() => []);
                if (cc === 'es') return fetchStationsES(probeLine).catch(() => []);
                return Promise.resolve([]);
            }));

            const seen = new Set(), merged = [];
            for (const batch of batches) for (const s of batch) {
                const key = s.id || `${s.longitude},${s.latitude}`;
                if (!seen.has(key)) { seen.add(key); merged.push(s); }
            }
            return merged;
        }

        function _gasScanParse(raw, anchor, radiusKm) {
            const from = turf.point(anchor);
            const out = [], seen = new Set();

            raw.forEach(s => {
                const coords = extractGasCoords(s);
                if (!coords) return;
                const [lng, lat] = coords;

                let distM;
                try { distM = turf.distance(from, turf.point([lng, lat]), { units: 'kilometers' }) * 1000; }
                catch (e) { return; }
                if (distM > radiusKm * 1000) return;

                const key = `${Math.round(lng * 10000)}_${Math.round(lat * 10000)}`;
                if (seen.has(key)) return;
                seen.add(key);

                const sp95   = extractGasPrice(s, 'sp95');
                const gazole = extractGasPrice(s, 'gazole');
                const e10    = extractGasPrice(s, 'e10');
                const sp98   = extractGasPrice(s, 'sp98');
                // Même règle que parseGasStations : le flux FR porte toujours des prix,
                // une fiche FR sans prix est une fiche morte. BE/ES sont tolérées.
                if (!sp95 && !gazole && !e10 && !sp98 && (s._country || 'fr') === 'fr') return;

                out.push({
                    kind: 'gas',
                    lng, lat,
                    name: s.nom || s.enseignedhek || s.name || s.adresse || 'Station',
                    addr: [s.adresse, s.ville ? ((s.cp || s.code_postal || '') + ' ' + s.ville).trim() : '']
                            .filter(Boolean).join(', '),
                    sp95, gazole, e10, sp98,
                    country: s._country || 'fr',
                    distM: Math.round(distM),
                    horaires: s.horaires || null,
                    horaires_automate_24_24: s.horaires_automate_24_24 || null,
                    _minutes: null,
                });
            });
            return out;
        }

        // ── ZONE DE RECHERCHE : disque + ondes radar ────────────────────────
        // Couches Mapbox et non pastille DOM : le cercle doit rester collé au
        // terrain quand on déplace ou pivote la carte, ce qu'un élément HTML
        // posé par-dessus le canevas ne sait pas faire.
        const GAS_ZONE_SRC    = 'gas-scan-zone-src';
        const GAS_ZONE_FILL   = 'gas-scan-zone-fill';
        const GAS_ZONE_EDGE   = 'gas-scan-zone-edge';
        const GAS_WAVE_SRC    = 'gas-scan-wave-src';
        const GAS_WAVE_LAYER  = 'gas-scan-wave-line';
        const GAS_WAVE_PERIOD_MS = 5200;   // durée d'une onde, du centre au bord
        const GAS_WAVE_COUNT     = 3;      // ondes simultanées, déphasées régulièrement
        const GAS_ZONE_FPS       = 24;     // inutile de repeindre à 60 : l'onde est lente

        let _scanZoneRaf = null, _scanZoneLastPaint = 0;

        // Cercle en coordonnées géographiques. La compression des méridiens est
        // prise en compte par le cos(latitude) — sans lui, le cercle s'aplatirait
        // en ellipse d'autant plus que l'on monte vers le nord.
        function _gasScanCircleRing(center, radiusKm, steps) {
            const lng = center[0], lat = center[1];
            const dLat = radiusKm / 111.32;
            const dLng = radiusKm / (111.32 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
            const ring = [];
            for (let i = 0; i <= steps; i++) {
                const a = (i / steps) * 2 * Math.PI;
                ring.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
            }
            return ring;
        }

        function _gasScanCircleBounds(center, radiusKm) {
            const dLat = radiusKm / 111.32;
            const dLng = radiusKm / (111.32 * Math.max(0.2, Math.cos(center[1] * Math.PI / 180)));
            return new mapboxgl.LngLatBounds(
                [center[0] - dLng, center[1] - dLat],
                [center[0] + dLng, center[1] + dLat]
            );
        }

        const _gasScanEmptyFC = () => ({ type: 'FeatureCollection', features: [] });

        function _gasScanZoneEnsure() {
            try {
                if (!map.getSource(GAS_ZONE_SRC)) map.addSource(GAS_ZONE_SRC, { type: 'geojson', data: _gasScanEmptyFC() });
                if (!map.getSource(GAS_WAVE_SRC)) map.addSource(GAS_WAVE_SRC, { type: 'geojson', data: _gasScanEmptyFC() });
                // slot 'middle' : sous le tracé d'itinéraire, qui vit dans 'top'.
                // 'emissive-strength' est OBLIGATOIRE sur un style Standard de nuit,
                // sinon l'éclairage nocturne éteint la couche jusqu'à l'illisible.
                if (!map.getLayer(GAS_ZONE_FILL)) {
                    map.addLayer({
                        id: GAS_ZONE_FILL, type: 'fill', source: GAS_ZONE_SRC, slot: 'middle',
                        paint: { 'fill-color': '#ff9c1a', 'fill-opacity': 0.13, 'fill-emissive-strength': 1 }
                    });
                }
                if (!map.getLayer(GAS_ZONE_EDGE)) {
                    map.addLayer({
                        id: GAS_ZONE_EDGE, type: 'line', source: GAS_ZONE_SRC, slot: 'middle',
                        paint: { 'line-color': '#ffb44d', 'line-width': 2, 'line-opacity': 0.75, 'line-emissive-strength': 1 }
                    });
                }
                if (!map.getLayer(GAS_WAVE_LAYER)) {
                    map.addLayer({
                        id: GAS_WAVE_LAYER, type: 'line', source: GAS_WAVE_SRC, slot: 'middle',
                        paint: {
                            'line-color': '#ffd08a', 'line-width': 2,
                            // opacité portée par chaque onde : elle s'efface en s'éloignant
                            'line-opacity': ['get', 'o'], 'line-emissive-strength': 1
                        }
                    });
                }
            } catch (e) { /* style pas encore prêt : la boucle d'ondes réessaiera */ }
        }

        function _gasScanZoneUpdate(center, radiusKm) {
            if (!center || !Number.isFinite(radiusKm)) return;
            _gasScanZoneEnsure();
            const ring = _gasScanCircleRing(center, radiusKm, 96);
            try {
                map.getSource(GAS_ZONE_SRC)?.setData({
                    type: 'FeatureCollection',
                    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }]
                });
            } catch (e) { /* source absente : réparée au prochain tick */ }
        }

        function _gasScanZoneStart() {
            if (_scanZoneRaf) return;
            const tick = (now) => {
                _scanZoneRaf = requestAnimationFrame(tick);
                if (now - _scanZoneLastPaint < 1000 / GAS_ZONE_FPS) return;
                _scanZoneLastPaint = now;
                if (!_scanAnchor) return;
                // Auto-réparation : applyMapStyle() détruit toutes les sources et
                // couches. Changer de thème pendant un scan effacerait la zone
                // sans ce contrôle.
                if (!map.getSource(GAS_WAVE_SRC) || !map.getLayer(GAS_WAVE_LAYER)) {
                    _gasScanZoneEnsure();
                    _gasScanZoneUpdate(_scanAnchor, _scanRadiusKm);
                }
                const feats = [];
                for (let i = 0; i < GAS_WAVE_COUNT; i++) {
                    const p = ((now / GAS_WAVE_PERIOD_MS) + i / GAS_WAVE_COUNT) % 1;
                    feats.push({
                        type: 'Feature',
                        properties: { o: (1 - p) * 0.6 },
                        geometry: {
                            type: 'LineString',
                            coordinates: _gasScanCircleRing(_scanAnchor, Math.max(0.02, p * _scanRadiusKm), 64)
                        }
                    });
                }
                try { map.getSource(GAS_WAVE_SRC)?.setData({ type: 'FeatureCollection', features: feats }); }
                catch (e) { /* ignoré : réparé au tick suivant */ }
            };
            _scanZoneRaf = requestAnimationFrame(tick);
        }

        function _gasScanZoneStop() {
            if (_scanZoneRaf) { cancelAnimationFrame(_scanZoneRaf); _scanZoneRaf = null; }
        }

        function _gasScanZoneRemove() {
            _gasScanZoneStop();
            // Les couches d'abord : Mapbox refuse de retirer une source encore utilisée.
            [GAS_WAVE_LAYER, GAS_ZONE_EDGE, GAS_ZONE_FILL].forEach(id => {
                tenterSansBruit(() => { if (map.getLayer(id)) map.removeLayer(id); }, 'scan/removeLayer');
            });
            [GAS_WAVE_SRC, GAS_ZONE_SRC].forEach(id => {
                tenterSansBruit(() => { if (map.getSource(id)) map.removeSource(id); }, 'scan/removeSource');
            });
        }

        /* Bornes par rayon. fetchEVFromOverpass() travaille déjà sur une bbox : la
           bulle s'y traduit directement, sans passer par un faux tracé comme pour
           les sources carburant BE/ES. */
        async function _evScanFetchRaw(lng, lat, radiusKm) {
            const dLat = radiusKm / 111.32;
            const dLng = radiusKm / (111.32 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
            const seg = {
                minLat: lat - dLat, maxLat: lat + dLat,
                minLng: lng - dLng, maxLng: lng + dLng,
            };
            try { return await fetchEVFromOverpass(seg); } catch (e) { return []; }
        }

        function _evScanParse(raw, anchor, radiusKm) {
            const from = turf.point(anchor);
            const out = [], seen = new Set();
            raw.forEach(s => {
                const lat = parseFloat(s.latitude), lng = parseFloat(s.longitude);
                if (isNaN(lat) || isNaN(lng)) return;
                let distM;
                try { distM = turf.distance(from, turf.point([lng, lat]), { units: 'kilometers' }) * 1000; }
                catch (e) { return; }
                if (distM > radiusKm * 1000) return;
                const key = `${Math.round(lng * 10000)}_${Math.round(lat * 10000)}`;
                if (seen.has(key)) return;
                seen.add(key);
                out.push({
                    kind: 'ev', lng, lat,
                    name: s.name || 'Borne de recharge',
                    addr: s.addr || '',
                    power: s.power,
                    nb_pdc: s.nb_pdc || 1,
                    connectors: s.connectors || {},
                    distM: Math.round(distM),
                    _minutes: null,
                });
            });
            return out;
        }

        /* `opts.live` = relevé de suivi, déclenché par _scanLiveTick() pendant que la
           feuille est SOUS LES YEUX du conducteur. Un rafraîchissement n'a pas le droit
           de se comporter comme une ouverture : trois gestes de `runGasScan()` sont
           acceptables quand on vient d'ouvrir la feuille et deviennent hostiles quand on
           est en train de la lire.
             1. Le vidage préalable de la liste et des marqueurs — il fait clignoter
                l'écran pendant les secondes de réseau. En mode live on ne touche à rien
                avant d'avoir les données : _renderGasScan() remplace le contenu d'un
                coup, et _renderGasScanMarkers() reprend les marqueurs de lui-même.
             2. `_fitMapToGasScan()` — il RECADRE LA CAMÉRA. Le conducteur a pu déplacer
                la carte pour regarder une station ; la lui reprendre toutes les minutes
                serait insupportable. Le cadrage reste au geste d'ouverture, qui est une
                intention explicite.
             3. Le statut « 🔄 Recherche… » — il efface un décompte lisible pour le
                remplacer par une attente que personne n'a demandée.
           La position de défilement est également conservée : sans cela, la liste
           remontait en tête et faisait perdre la carte qu'on était en train de lire. */
        async function runGasScan(opts = {}) {
            const live   = !!opts.live;
            const status = document.getElementById('gas-scan-status');
            const list   = document.getElementById('gas-scan-list');
            /* ⚠ CES TROIS SORTIES ÉTAIENT MUETTES, et ce sont elles qui font qu'une
               ouverture ne cadre pas du tout : sans `_fitMapToGasScan()`, la feuille
               s'ouvre sur la carte laissée par la boucle de suivi, ce qui ressemble
               beaucoup à un cadrage raté alors qu'aucun n'a été tenté. Un cadrage absent
               et un cadrage faux ne se soignent pas pareil : le journal doit les
               distinguer. `_scanBusy` en particulier reste vrai tant qu'un relevé de
               suivi est en vol — un clic pendant ce temps ressort ici. */
            if (!status || !list) { logDiag('scanSaute', { cause: 'DOM absent', live }); return; }
            if (_scanBusy)        { logDiag('scanSaute', { cause: 'occupé', live }); return; }

            if (!navigator.onLine) {
                logDiag('scanSaute', { cause: 'hors ligne', live });
                status.textContent = '📵 Hors ligne — prix des carburants indisponibles';
                list.innerHTML = '';
                _clearGasScanMarkers();
                return;
            }

            _scanBusy = true;
            /* ⚠ LA PRÉPARATION EST DANS LE `try`, PAS DEVANT LUI. `_scanBusy` n'est relâché
               que par le `finally` : toute exception levée AVANT l'entrée dans le bloc
               laissait le verrou posé pour le reste de la session, et `runGasScan()` sortait
               alors en silence dès sa première ligne — plus aucun scan, plus aucun rendu et
               donc plus aucun `_fitMapToGasScan()`, la feuille continuant d'afficher la liste
               du tour précédent. Un verrou doit couvrir exactement ce que son `finally`
               libère ; ces cinq lignes touchent la carte et le DOM, elles peuvent lever. */
            try {
                // L'ancre est relue à chaque scan : le conducteur a pu avancer depuis
                // l'ouverture de la feuille. La zone suit, sinon le cercle resterait
                // sur la position d'il y a deux minutes.
                _scanAnchor = _gasScanAnchorPoint();
                _gasScanZoneUpdate(_scanAnchor, _scanRadiusKm);
                // En live, l'écran garde le relevé précédent jusqu'à l'arrivée du neuf
                // (voir le pavé au-dessus) ; le défilement est repris après le rendu.
                const scrollAvant = live ? list.scrollTop : 0;
                if (!live) { list.innerHTML = ''; _clearGasScanMarkers(); }

                const mode = _scanVehicleMode();
                const tag  = `${_scanRadiusKm}|${mode}`;
                const now  = Date.now();

                let rawGas, rawEv;
                if (_scanCacheFresh(_scanCache, _scanAnchor, tag, now, SCAN_CACHE_TTL_MS, SCAN_CACHE_MOVE_KM)) {
                    rawGas = _scanCache.rawGas;
                    rawEv  = _scanCache.rawEv;
                } else {
                    if (!live) status.textContent = `🔄 Recherche dans un rayon de ${_scanRadiusKm} km…`;
                    // Les deux collectes partent en parallèle en mode hybride : elles
                    // n'ont aucune source commune, les sérialiser doublerait l'attente.
                    [rawGas, rawEv] = await Promise.all([
                        (mode === 'gas' || mode === 'both')
                            ? _gasScanFetchRaw(_scanAnchor[0], _scanAnchor[1], _scanRadiusKm).catch(() => [])
                            : Promise.resolve([]),
                        (mode === 'ev' || mode === 'both')
                            ? _evScanFetchRaw(_scanAnchor[0], _scanAnchor[1], _scanRadiusKm)
                            : Promise.resolve([]),
                    ]);
                    _scanCache = { anchor: _scanAnchor, tag, ts: now, rawGas, rawEv };
                }

                _scanStations = [
                    ..._gasScanParse(rawGas, _scanAnchor, _scanRadiusKm),
                    ..._evScanParse(rawEv, _scanAnchor, _scanRadiusKm),
                ];

                // Les stations déjà fréquentées sont marquées, comme dans le panneau trajet
                const favs = _loadFavorites();
                _scanStations.forEach(s => {
                    const f = favs[_favKey(s)];
                    if (f) { s._isFavorite = true; s._visits = f.visits; }
                });

                _renderGasScanFilters();
                _renderGasScan();
                if (live) list.scrollTop = scrollAvant;
                else _fitMapToGasScan();
                _fetchGasScanDurations();   // en tâche de fond : les cartes sont déjà lisibles
            } catch (e) {
                logAppError('runGasScan', e);
                /* ⚠ UN RELEVÉ DE SUIVI RATÉ NE DÉTRUIT PAS CE QUI EST À L'ÉCRAN. La liste
                   affichée reste vraie — elle date d'une minute et de quelques centaines
                   de mètres. La remplacer par « Recherche impossible » parce qu'un miroir
                   Overpass a bronché ferait payer au conducteur une panne réseau par la
                   perte d'un résultat encore utilisable. Le tick suivant retentera. */
                if (!live) status.textContent = '⚠️ Recherche impossible (' + (e.message || 'réseau') + ')';
            } finally {
                _scanBusy = false;
                /* ⚠ HORODATÉ DANS LE `finally`, DONC MÊME EN CAS D'ÉCHEC. Posé après le
                   rendu, un relevé raté laissait `_scanLastRunTs` sur sa vieille valeur :
                   le plancher de 60 s était déjà franchi, et _scanLiveTick() relançait au
                   tick suivant, soit une rafale toutes les 15 s tant que le réseau était
                   coupé — précisément la charge qui fâche les miroirs Overpass, appliquée
                   au pire moment. Le plancher borne les TENTATIVES, pas les succès. */
                _scanLastRunTs = Date.now();
            }
        }

        function _scanChip(label, active, onClick, extraCls) {
            const b = document.createElement('button');
            b.className = 'gas-scan-chip' + (extraCls ? ' ' + extraCls : '') + (active ? ' active' : '');
            b.innerHTML = label;
            b.onclick = onClick;
            return b;
        }

        // Les entrées visibles à cet instant : c'est sur elles que portent les
        // filtres proposés, pour ne jamais offrir un choix qui ne donnerait rien.
        function _scanPoolForKind() {
            if (_scanKind === 'gas') return _scanStations.filter(s => s.kind === 'gas');
            if (_scanKind === 'ev')  return _scanStations.filter(s => s.kind === 'ev');
            return _scanStations;
        }

        /* Filtres : carburants en thermique, connecteurs en électrique, et en
           hybride un premier étage de type (Tous / ⛽ / ⚡) puis le filtre propre
           au type retenu. Rien n'est affiché qui ne corresponde à des résultats
           réellement présents dans la bulle. */
        function _renderGasScanFilters() {
            const box = document.getElementById('gas-scan-fuels');
            if (!box) return;
            box.innerHTML = '';
            const mode = _scanVehicleMode();

            if (mode === 'both') {
                const nGas = _scanStations.filter(s => s.kind === 'gas').length;
                const nEv  = _scanStations.filter(s => s.kind === 'ev').length;
                box.appendChild(_scanChip('Tous', _scanKind === 'all', () => setGasScanKind('all')));
                box.appendChild(_scanChip(`⛽ ${nGas}`, _scanKind === 'gas', () => setGasScanKind('gas')));
                box.appendChild(_scanChip(`⚡ ${nEv}`,  _scanKind === 'ev',  () => setGasScanKind('ev'), 'ev'));
            }

            const showFuel = (mode === 'gas') || (mode === 'both' && _scanKind === 'gas');
            const showConn = (mode === 'ev')  || (mode === 'both' && _scanKind === 'ev');

            if (showFuel) {
                const avail = FUEL_DEFS.filter(f => _scanStations.some(s => s.kind === 'gas' && getEffectivePrice(s, f.key) != null));
                if (!avail.some(f => f.key === _scanFuel)) _scanFuel = avail.length ? avail[0].key : 'sp95';
                // `fuel-<clé>` porte la couleur propre au carburant (voir le CSS) :
                // la pastille active reprend la teinte de la vignette de prix.
                avail.forEach(f => box.appendChild(
                    _scanChip(f.label, f.key === _scanFuel, () => setGasScanFuel(f.key), 'fuel-' + f.cls)));
            }

            if (showConn) {
                const avail = EV_CONNECTOR_DEFS.filter(d => _scanStations.some(s => s.kind === 'ev' && s.connectors?.[d.key]));
                if (_scanConn && !avail.some(d => d.key === _scanConn)) _scanConn = null;
                box.appendChild(_scanChip('Tous', !_scanConn, () => setGasScanConnector(null), 'ev'));
                avail.forEach(d => box.appendChild(
                    _scanChip(d.label, d.key === _scanConn, () => setGasScanConnector(d.key), 'ev')));
            }

            _renderGasScanModes();
        }

        /* Second bouton de tri contextuel : le prix ne veut rien dire pour une borne
           (Overpass ne le porte pas) et la puissance rien pour une pompe. En mode
           « Tous » d'un hybride, aucun critère n'est commun aux deux : seule la
           distance reste, le second bouton disparaît donc. */
        function _renderGasScanModes() {
            const box = document.getElementById('gas-scan-modes');
            if (!box) return;
            const mode = _scanVehicleMode();
            const kind = mode === 'both' ? _scanKind : (mode === 'ev' ? 'ev' : 'gas');

            /* Normaliser le tri AVANT de construire, jamais après : le prix n'existe
               pas pour une borne, la puissance pas pour une pompe. Corriger l'état
               une fois les pastilles posées obligeait à rattraper les classes à la
               main — c'est le genre de retouche a posteriori qui finit toujours par
               diverger de l'état réel. */
            if (kind !== 'gas' && _scanSort === 'pascher')   _scanSort = 'proche';
            if (kind !== 'ev'  && _scanSort === 'puissance') _scanSort = 'proche';

            box.innerHTML = '';
            box.appendChild(_scanChip('↑ Plus proche', _scanSort === 'proche', () => setGasScanSort('proche'), 'mode'));
            if (kind === 'gas') {
                box.appendChild(_scanChip('💰 Moins cher', _scanSort === 'pascher', () => setGasScanSort('pascher'), 'mode'));
            } else if (kind === 'ev') {
                box.appendChild(_scanChip('⚡ Plus puissante', _scanSort === 'puissance', () => setGasScanSort('puissance'), 'mode'));
            }
        }

        function setGasScanKind(kind) {
            _scanKind = kind;
            _renderGasScanFilters();
            _renderGasScan();
        }

        function setGasScanConnector(key) {
            _scanConn = key;
            _renderGasScanFilters();
            _renderGasScan();
        }

        function _renderGasScan() {
            const list   = document.getElementById('gas-scan-list');
            const status = document.getElementById('gas-scan-status');
            if (!list) return;

            // Une pompe sans prix pour le carburant demandé est inutile ; une borne
            // sans le connecteur demandé aussi. Les bornes ne portent pas de prix,
            // le filtre carburant ne doit donc jamais s'appliquer sur elles.
            const pool = _scanPoolForKind().filter(s => s.kind === 'ev'
                ? (!_scanConn || s.connectors?.[_scanConn])
                : gasStationAffichable(s, _scanFuel));

            const isClosed = s => s.kind === 'gas' && getStationOpeningStatus(s).status === 'closed';
            const sorted = [...pool].sort((a, b) => {
                const ca = isClosed(a), cb = isClosed(b);
                if (ca !== cb) return ca ? 1 : -1;   // rideau baissé = fin de liste
                if (_scanSort === 'pascher' && a.kind === 'gas' && b.kind === 'gas') {
                    /* ⚠ `Infinity` ET NON `null` POUR UN PRIX ABSENT (03/09/2026). Depuis
                       que les stations étrangères sans prix entrent dans la liste
                       (`gasStationAffichable`), `pa - pb` valait `NaN` : un comparateur
                       qui rend NaN laisse l'ordre à l'implémentation, donc une liste
                       « moins cher » mélangée au hasard. Prix inconnu = fin de liste,
                       comme la puissance inconnue des bornes juste en dessous. */
                    const pa = getEffectivePrice(a, _scanFuel) ?? Infinity;
                    const pb = getEffectivePrice(b, _scanFuel) ?? Infinity;
                    if (pa !== pb) return pa - pb;
                } else if (_scanSort === 'puissance' && a.kind === 'ev' && b.kind === 'ev') {
                    // Puissance inconnue = fin de liste : annoncer une borne comme la
                    // plus puissante sans le savoir serait pire que de ne rien dire.
                    const wa = a.power || -1, wb = b.power || -1;
                    if (wa !== wb) return wb - wa;
                }
                return a.distM - b.distM;
            });

            _scanShown = sorted.slice(0, GAS_SCAN_MAX_CARDS);
            list.innerHTML = '';

            if (status) {
                const nEv  = pool.filter(s => s.kind === 'ev').length;
                const nGas = pool.length - nEv;
                const quoi = (nGas && nEv) ? `${nGas} station${nGas > 1 ? 's' : ''} et ${nEv} borne${nEv > 1 ? 's' : ''}`
                           : nEv ? `${nEv} borne${nEv > 1 ? 's' : ''}`
                           : `${nGas} station${nGas > 1 ? 's' : ''}`;
                const rien = _scanVehicleMode() === 'ev'
                    ? `Aucune borne compatible dans ${_scanRadiusKm} km.`
                    : `Aucun résultat dans ${_scanRadiusKm} km.`;
                status.textContent = _scanShown.length
                    ? `${quoi} dans ${_scanRadiusKm} km`
                      + (pool.length > _scanShown.length ? ` — ${_scanShown.length} affichées` : '')
                    : rien;
            }

            _scanShown.forEach((s, i) => {
                const card = document.createElement('div');
                card.className = 'gas-station-card';
                card.id = 'gas-scan-card-' + i;
                card.innerHTML = s.kind === 'ev' ? _scanEvCardHtml(s, i) : _scanGasCardHtml(s, i);
                card.addEventListener('click', () => _openGasScanDetail(i));
                list.appendChild(card);
            });

            _renderGasScanMarkers();
            /* Le bloc au-dessus de la liste a pu changer de hauteur depuis l'ouverture
               (statut plus long, chips carburant passées sur deux lignes en hybride) :
               on recalcule le plancher de repli pour qu'il colle à la mise en page
               réelle plutôt qu'à celle mesurée sur une liste encore vide. */
            _syncGasScanCollapse();
        }

        function _scanGasCardHtml(s, i) {
            {   // bloc conservé de l'ancien forEach : sans effet, garde le diff lisible
                const price   = getEffectivePrice(s, _scanFuel);
                const effType = getEffectiveFuelType(s, _scanFuel);
                const fuelDef = FUEL_DEFS.find(f => f.key === effType);
                const pillStyle = {
                    sp95:   'background:rgba(255,140,0,0.12);color:#ffa500;border-color:rgba(255,140,0,0.35);',
                    e10:    'background:rgba(40,167,69,0.12);color:#28a745;border-color:rgba(40,167,69,0.35);',
                    gazole: 'background:rgba(77,163,255,0.12);color:#4da3ff;border-color:rgba(77,163,255,0.35);',
                    sp98:   'background:rgba(156,39,176,0.12);color:#ce93d8;border-color:rgba(156,39,176,0.35);',
                }[effType] || '';
                const e10Fallback = _scanFuel === 'sp95' && effType === 'e10';

                const st  = getStationOpeningStatus(s);
                const col = st.status === 'closed' ? '#e74c3c' : st.status === '24h' ? '#4da3ff' : '#28a745';
                const dot = st.status === 'closed' ? '🔴' : st.status === '24h' ? '🔵' : '🟢';

                return `
                    <div class="gas-card-icon">⛽</div>
                    <div class="gas-card-info">
                        <div class="gas-card-name">${s._isFavorite ? '⭐ ' : ''}${echapperHtml(s.name)}</div>
                        <div class="gas-card-addr">${echapperHtml(s.addr || '—')}</div>
                        ${st.status === 'unknown' ? '' :
                          `<div style="font-size:9px;color:${col};margin-top:2px;font-weight:600;">${dot} ${st.label}</div>`}
                        ${s._isFavorite && s._visits > 1
                          ? `<div style="font-size:9px;color:#f39c12;margin-top:2px;">Visitée ${s._visits}×</div>` : ''}
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
                        <div class="gas-card-prices">
                            ${price == null
                              /* Pas de prix : on le DIT, on ne laisse pas une pastille vide.
                                 `price.toFixed(3)` levait ici sur toute station belge. */
                              ? `<span style="font-size:10px;color:#4a5568;font-style:italic;">Prix non disponible</span>`
                              : `<span class="gas-price-pill" style="${pillStyle}">${fuelDef?.label} ${price.toFixed(3)}€</span>`}
                        </div>
                        ${e10Fallback ? '<span style="font-size:9px;color:#4a5568;">(sans SP95 pur)</span>' : ''}
                        <div class="gas-card-dist" id="gas-scan-eta-${i}">${_gasScanEtaText(s)}</div>
                    </div>`;
            }
        }

        /* Carte de borne. Le nom OSM vaut souvent « Borne de recharge » : dans ce cas
           l'adresse devient le titre, sinon la carte n'aurait aucun repère — même
           traitement que renderEVCards() dans le panneau du modal. */
        function _scanEvCardHtml(s, i) {
            const conn = EV_CONNECTOR_DEFS
                .filter(d => s.connectors?.[d.key])
                .map(d => `<span style="font-size:9px;padding:2px 5px;border-radius:8px;background:${d.color}18;border:1px solid ${d.color}55;color:${d.color};">${d.label}</span>`)
                .join(' ');
            const generique = !s.name || s.name === 'Borne de recharge';
            const titre = generique ? (s.addr || 'Borne de recharge') : s.name;
            const sousTitre = generique ? '' : (s.addr || '');
            return `
                <div class="gas-card-icon">⚡</div>
                <div class="gas-card-info">
                    <div class="gas-card-name">${s._isFavorite ? '⭐ ' : ''}${titre}</div>
                    ${sousTitre ? `<div class="gas-card-addr">${sousTitre}</div>` : ''}
                    ${conn ? `<div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">${conn}</div>` : ''}
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
                    <span class="gas-price-pill" style="background:rgba(77,163,255,0.12);color:#4da3ff;border-color:rgba(77,163,255,0.35);">${s.power ? s.power + ' kW' : 'kW ?'}</span>
                    <span style="font-size:9px;color:#6b7785;">${s.nb_pdc > 1 ? s.nb_pdc + ' pts' : '1 pt'}</span>
                    <div class="gas-card-dist" id="gas-scan-eta-${i}">${_gasScanEtaText(s)}</div>
                </div>`;
        }

        // Distance toujours exacte ; le temps est une ESTIMATION tant que la Matrix
        // n'a pas répondu — d'où le tilde, qui disparaît avec la vraie valeur.
        function _gasScanEtaText(s) {
            const km = s.distM / 1000;
            const dist = km < 1 ? s.distM + ' m' : km.toFixed(1).replace('.', ',') + ' km';
            if (s._minutes != null) return `${dist} · ${Math.max(1, Math.round(s._minutes))} min`;
            const est = (km / GAS_SCAN_FALLBACK_KMH) * 60;
            return `${dist} · ~${Math.max(1, Math.round(est))} min`;
        }

        // Un seul appel Directions Matrix pour toutes les cartes affichées : N requêtes
        // Directions individuelles seraient inacceptables au volant. Silencieux en cas
        // d'échec — l'estimation à 25 km/h reste affichée.
        async function _fetchGasScanDurations() {
            if (!_scanAnchor || !_scanShown.length) return;
            const targets = _scanShown.slice(0, GAS_SCAN_MATRIX_MAX);
            const coords = [_scanAnchor, ...targets.map(s => [s.lng, s.lat])]
                .map(c => c[0].toFixed(6) + ',' + c[1].toFixed(6)).join(';');
            const url = `https://api.mapbox.com/directions-matrix/v1/mapbox/driving/${coords}`
                      + `?sources=0&annotations=duration&access_token=${MAPBOX_TOKEN}`;
            try {
                const res  = await fetchResilient(url, {}, { timeoutMs: 8000, retries: 0 });
                const data = await res.json();
                const row  = data?.durations?.[0];
                if (!Array.isArray(row)) return;
                targets.forEach((s, i) => {
                    const sec = row[i + 1];          // l'indice 0 est l'ancre elle-même
                    if (typeof sec === 'number') s._minutes = sec / 60;
                });
                _scanShown.forEach((s, i) => {
                    const el = document.getElementById('gas-scan-eta-' + i);
                    if (el) el.textContent = _gasScanEtaText(s);
                });
                // La fiche détail peut être ouverte sur une station déjà présente dans
                // `targets` : sa distance/temps affichait l'estimation à 25 km/h avant
                // que la Matrix ne réponde, elle mérite la même mise à jour que les cartes.
                const etaInfo = document.getElementById('gas-info-eta');
                if (etaInfo && _gasInfoCurrent) etaInfo.textContent = _gasScanEtaText(_gasInfoCurrent);
            } catch (e) { /* estimation conservée */ }
        }

        function _clearGasScanMarkers() {
            _scanMarkers.forEach(m => tenterSansBruit(() => m.remove(), 'scan/removeMarker'));
            _scanMarkers = [];
        }

        function _renderGasScanMarkers() {
            _clearGasScanMarkers();
            _scanShown.forEach((s, i) => {
                if (!isLngLat([s.lng, s.lat])) return;
                // Même bulle pour les deux réseaux, seuls le picto et la teinte
                // changent : c'est ce qui rend la carte lisible d'un coup d'œil en
                // hybride, où les deux cohabitent.
                const isEv = s.kind === 'ev';
                const teinte = isEv
                    ? 'border:1px solid rgba(77,163,255,0.6);color:#6cb6ff;'
                    : 'border:1px solid rgba(255,160,0,0.55);color:#ffa500;';
                const el = document.createElement('div');
                el.style.cssText = 'display:flex;align-items:center;gap:3px;padding:3px 7px;border-radius:999px;'
                    + 'background:rgba(10,14,23,0.92);' + teinte
                    + 'font-size:11px;font-weight:800;white-space:nowrap;cursor:pointer;'
                    + 'box-shadow:0 2px 10px rgba(0,0,0,0.6);';
                if (isEv) {
                    el.innerHTML = '⚡ ' + (s.power ? s.power + ' kW' : '');
                } else {
                    const price = getEffectivePrice(s, _scanFuel);
                    el.innerHTML = '⛽ ' + (price != null ? price.toFixed(2) : '—');
                }
                // Repère lu par la détection d'appui long de la carte : sans lui, un
                // appui sur une pastille armerait AUSSI la hotbox générale (les
                // marqueurs sont des enfants du conteneur #map), qui n'a rien à voir
                // avec une station.
                el.dataset.gasStation = '1';
                el.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    _openGasScanDetail(i);
                });
                // Respecte un masquage en cours (entrée hotbox « Masquer stations », js/18) :
                // cette fonction est rejouée à chaque rendu de la liste.
                if (_stationsHidden) el.style.display = 'none';
                const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                    .setLngLat([s.lng, s.lat]).addTo(map);
                _scanMarkers.push(marker);
            });
        }

        function focusGasScanStation(i) {
            const s = _scanShown[i];
            if (!s || !isLngLat([s.lng, s.lat])) return;
            document.querySelectorAll('#gas-scan-list .gas-station-card')
                .forEach((c, k) => c.classList.toggle('focused', k === i));
            const card = document.getElementById('gas-scan-card-' + i);
            if (card) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
            map.flyTo({ center: [s.lng, s.lat], zoom: 16, duration: 800, padding: _gasScanPadding() });
        }

        /* ── VEILLE SILENCIEUSE ──────────────────────────────────────────────
           Jumelle de _pkPrefetchTick() (js/27) : rafraîchit _scanCache même
           feuille fermée, pour que la prochaine ouverture de runGasScan() trouve
           un résultat déjà prêt au lieu d'attendre le réseau.
           Ne s'exécute que si un vrai fix GPS existe, sinon l'ancre retomberait
           sur le centre de carte et préchargerait un endroit arbitraire.

           ⚠ ARMÉE PAR LE PREMIER USAGE, PAS PAR LE CHARGEMENT DE LA PAGE (30/08/2026) —
           alignement sur _pkPrefetchTick (js/27), qui avait déjà pris ce virage pour la
           même raison. Chiffré sur un Paris→Lyon : le cache est invalidé dès 300 m, soit
           10 s à 105 km/h, donc PÉRIMÉ À CHAQUE TICK en roulant. La veille tirait ainsi
           270 requêtes sur les 4 h 30 du trajet — 540 en hybride, où carburant et bornes
           partent ensemble — pour un panneau que le conducteur n'ouvrait peut-être pas
           une seule fois. Côté bornes, ces appels vont sur Overpass, et `_fetchOverpassHedged`
           en double une partie sur un second miroir : les serveurs bénévoles encaissaient
           plusieurs centaines de requêtes par trajet pour rien.
           Ce que l'armement NE change PAS : dès la feuille ouverte une fois, la veille
           reprend exactement comme avant. Le drapeau ne supprime que le trafic d'avant le
           premier usage — c'est-à-dire tout, pour qui ne s'en sert jamais. */
        let _gasVeilleArmee = false;
        /* ── SUIVI FEUILLE OUVERTE ──────────────────────────────────────────
           Le pendant de _scanPrefetchTick() : celui-ci ne travaille QUE feuille
           ouverte, l'autre QUE feuille fermée. Les deux ne peuvent donc jamais tirer
           ensemble. Le tick est court (15 s) mais ne relève rien de lui-même : il ne
           fait que vérifier les deux seuils, dont le plancher de temps commande la
           charge réelle. Voir SCAN_LIVE_* pour le chiffrage. */
        function _scanLiveTick() {
            if (!navigator.onLine || !lastRealCoords) return;
            if (_scanBusy) return;
            const sheet = document.getElementById('gas-scan-sheet');
            if (!sheet?.classList.contains('open')) return;
            /* La fiche détail est une lecture posée sur UNE station : rejouer le relevé
               dessous réordonne `_scanShown`, et l'index que la fiche a mémorisé désigne
               alors une autre station. On attend qu'elle soit refermée. */
            if (document.getElementById('gas-info-overlay')?.classList.contains('open')) return;

            const now = Date.now();
            if (now - _scanLastRunTs < SCAN_LIVE_MIN_MS) return;

            const anchor = normalizeLngLat(lastRealCoords);
            if (!anchor || !isLngLat(anchor) || !_scanAnchor) return;
            /* Le seuil est adossé au rayon, mais jamais plus laxiste que l'invalidation
               du cache : sous SCAN_CACHE_MOVE_KM, `runGasScan()` ressortirait le même
               relevé depuis le cache — un tour de rendu pour rien. */
            const seuilKm = Math.max(SCAN_CACHE_MOVE_KM, _scanRadiusKm * SCAN_LIVE_MOVE_FRAC);
            if (_ecartMetres(anchor, _scanAnchor) < seuilKm * 1000) return;

            runGasScan({ live: true });
        }
        setInterval(_scanLiveTick, SCAN_LIVE_TICK_MS);

        function _scanPrefetchTick() {
            if (!_gasVeilleArmee) return;
            if (!navigator.onLine || !lastRealCoords) return;
            if (_scanBusy) return;
            if (_gasScanBlocked()) return;   // prefetchGasStationsPhase1 fait déjà le travail
            if (document.getElementById('gas-scan-sheet')?.classList.contains('open')) return;
            // Un appel Overpass est déjà en vol (l'autre veille, ou un scan au premier
            // plan) : le serveur unique rendrait 504 aux deux. Voir overpassOccupe, js/19.
            if (typeof overpassOccupe === 'function' && overpassOccupe()) return;

            const anchor = normalizeLngLat(lastRealCoords);
            if (!anchor || !isLngLat(anchor)) return;
            const mode = _scanVehicleMode();
            const tag  = `${_scanRadiusKm}|${mode}`;
            const now  = Date.now();
            if (_scanCacheFresh(_scanCache, anchor, tag, now, SCAN_CACHE_TTL_MS, SCAN_CACHE_MOVE_KM)) return;

            Promise.all([
                (mode === 'gas' || mode === 'both')
                    ? _gasScanFetchRaw(anchor[0], anchor[1], _scanRadiusKm).catch(() => [])
                    : Promise.resolve([]),
                (mode === 'ev' || mode === 'both')
                    ? _evScanFetchRaw(anchor[0], anchor[1], _scanRadiusKm)
                    : Promise.resolve([]),
            ]).then(([rawGas, rawEv]) => {
                _scanCache = { anchor, tag, ts: Date.now(), rawGas, rawEv };
            }).catch(() => { /* silencieux : la prochaine ouverture retentera */ });
        }
        setInterval(_scanPrefetchTick, SCAN_PREFETCH_MS);

        /* Coordonnées de la station retenue via « J'y vais » (fiche détail,
           _gasInfoGoClicked). Sert à reconnaître la
           configuration « ma destination EST une station » — auquel cas proposer des
           stations SUR le trajet n'a plus de sens : le choix est déjà fait.
           On DÉDUIT cet état d'une comparaison de coordonnées au lieu de poser un
           drapeau : un drapeau exigerait d'être remis à zéro à chaque endroit où la
           destination peut changer (saisie, dictée, favori, ping carte, annulation,
           fin de trajet…), et un seul oubli le laisserait collé — masquant la section
           stations pour de bon. Ici, dès que la destination diffère, la comparaison
           échoue et tout revient seul à la normale. */
        let _gasGoStationCoords = null;

        function _destIsChosenStation() {
            if (!_gasGoStationCoords) return false;
            // Destination faisant foi : celle du modal avant départ, celle du trajet une
            // fois lancé. Comparer les deux laisserait passer une valeur périmée.
            const dest = isCourseStarted ? exactEndCoords : modalEndCoords;
            if (!isLngLat(dest)) return false;
            return Math.abs(dest[0] - _gasGoStationCoords[0]) < 0.0002   // ~22 m
                && Math.abs(dest[1] - _gasGoStationCoords[1]) < 0.0002;
        }

        function _gasGoToStation(s) {
            if (!s || !isLngLat([s.lng, s.lat])) return;
            const label = s.name || s.addr || 'Station';
            _gasGoStationCoords = [s.lng, s.lat];   // voir _destIsChosenStation()

            // Fermeture sans recentrage : la suite du parcours pose son propre
            // cadrage (recalcul d'itinéraire ou aperçu du modal), un recentrage
            // intercalé ne ferait que secouer la caméra au passage.
            closeGasScan({ keepCamera: true });

            if (isCourseStarted) {
                // En roulant : pas de modal, on recalcule immédiatement — c'est le
                // même geste que « je change de destination » depuis la loupe.
                _navSearchMode = 'dest';
                applyNavSearchSelection([s.lng, s.lat], label);
                // Le scan avait détaché la caméra (isUserPanning) pour montrer la
                // vue d'ensemble. Sans ce retour, le conducteur repartirait avec une
                // carte figée sur la zone de recherche au lieu de le suivre.
                recenterMap();
                return;
            }

            // À l'arrêt : exactement le parcours d'un point choisi sur la carte,
            // suivi du bouton Démarrer. handleStartClick() respecte la bascule
            // Réel / Simu et ouvre l'aperçu de trajet qui trace l'itinéraire.
            exactEndCoords = [s.lng, s.lat];
            if (endTempMarker) endTempMarker.remove();
            endTempMarker = addEmojiMarker(s.lng, s.lat, '🔴');
            const input = document.getElementById('end-addr');
            if (input) input.value = label;
            // Une station n'est liée à aucun contact : sans ce nettoyage, l'alerte
            // « à 10 min » continuerait de viser le numéro de la destination d'avant.
            updateFavPhoneUI('');
            setFavDropdownLabel(null);
            handleStartClick();
        }

        // ── FICHE DÉTAIL D'UNE STATION / BORNE ──────────────────────────────
        // Décalque de la fiche parking (openParkingInfo, js/27), plus un bouton
        // d'action « J'y vais » : une station EST une destination possible, un
        // parking ne l'est pas. _scanInfoRow() est PARTAGÉE entre les deux fiches
        // (js/27 la réutilise telle quelle, ce fichier chargeant avant le sien).

        // Un champ, une ligne — construite en DOM (pas en innerHTML) parce que
        // nom, adresse et prix viennent tous d'un flux tiers (data.gouv, OSM) :
        // textContent échappe automatiquement, là où une interpolation de gabarit
        // aurait exécuté n'importe quel balisage glissé dans une fiche.
        // `accent` met la VALEUR dans la même couleur claire que le nom (utilisé pour
        // prix et distance/temps, l'information qui compte le plus dans la fiche) ;
        // sans lui, la valeur garde la teinte discrète du reste de la ligne, dont
        // « Prix » / « Distance/temps » restent l'étiquette.
        function _scanInfoRow(icon, contenu, accent) {
            const row = document.createElement('div');
            row.className = 'scan-info-row';
            const ico = document.createElement('span');
            ico.className = 'scan-info-ico';
            ico.textContent = icon;
            const corps = document.createElement('span');
            if (accent) corps.className = 'scan-info-value';
            if (typeof contenu === 'string') corps.textContent = contenu;
            else corps.appendChild(contenu);
            row.append(ico, corps);
            return row;
        }

        let _gasInfoCurrent = null;
        // Caméra d'avant clic, restaurée à la fermeture (voir closeGasStationInfo) —
        // sans elle, fermer la fiche laisserait la carte zoomée sur la station au
        // lieu de rendre la vue d'ensemble du scan telle qu'avant le clic.
        let _gasInfoPrevCamera = null;
        /* Vue CIBLE du dernier `_fitMapToGasScan()`, calculée par `cameraForBounds` avant
           le vol : `fitBounds` ne fait qu'ANIMER vers elle sur 800 ms, or la liste est
           cliquable dès qu'elle est rendue. Sans cette valeur, un clic pendant l'animation
           mémorise une position de vol INTERMÉDIAIRE comme « vue d'avant clic », et
           ressortir de la fiche rend cette vue bâtarde au lieu de la zone de scan.
           Jumelle de `_pkScanCamera` (js/27), qui avait ce garde-fou depuis le début. */
        let _gasScanCamera = null;

        function openGasStationInfo(s) {
            const overlay = document.getElementById('gas-info-overlay');
            if (!overlay || !s) return;
            _gasInfoCurrent = s;

            const generique = s.kind === 'ev' && (!s.name || s.name === 'Borne de recharge');
            document.getElementById('gas-info-icon').textContent = s.kind === 'ev' ? '⚡' : '⛽';
            document.getElementById('gas-info-name').textContent =
                generique ? (s.addr || 'Borne de recharge') : (s.name || 'Station');
            document.getElementById('gas-info-addr').textContent =
                generique ? '' : (s.addr || 'Adresse non renseignée');

            const rows = document.getElementById('gas-info-rows');
            rows.innerHTML = '';

            if (s.kind === 'ev') {
                rows.appendChild(_scanInfoRow('⚡', s.power ? `${s.power} kW` : 'Puissance inconnue'));
                rows.appendChild(_scanInfoRow('🔌', s.nb_pdc > 1 ? `${s.nb_pdc} points de charge` : '1 point de charge'));
            } else {
                const price   = getEffectivePrice(s, _scanFuel);
                const fuelDef = FUEL_DEFS.find(f => f.key === getEffectiveFuelType(s, _scanFuel));
                // Libellé texte plutôt qu'un pictogramme billet : à cette taille, un
                // second picto à côté de ⛽/⚡ n'ajoutait rien qu'un mot ne dise mieux.
                if (price != null) rows.appendChild(_scanInfoRow('Prix', `${fuelDef?.label || ''} ${price.toFixed(3)} €`.trim(), true));
                const st = getStationOpeningStatus(s);
                if (st.status !== 'unknown') {
                    const dot = st.status === 'closed' ? '🔴' : st.status === '24h' ? '🔵' : '🟢';
                    rows.appendChild(_scanInfoRow(dot, st.label));
                }
            }

            // Distance/temps depuis la position GPS — `_gasScanEtaText()` porte déjà le
            // repli « ~ » à 25 km/h tant que la Matrix n'a pas répondu (voir plus bas,
            // qui rafraîchit `#gas-info-eta` dès que la vraie durée arrive).
            const etaEl = document.createElement('span');
            etaEl.id = 'gas-info-eta';
            etaEl.textContent = _gasScanEtaText(s);
            rows.appendChild(_scanInfoRow('Distance/temps', etaEl, true));

            overlay.classList.add('open');
        }

        function closeGasStationInfo(opts = {}) {
            document.getElementById('gas-info-overlay')?.classList.remove('open');
            document.querySelectorAll('#gas-scan-list .gas-station-card')
                .forEach(c => c.classList.remove('focused'));
            // Restaure la vue d'avant clic — sauf si l'on ferme pour PARTIR vers la
            // station (_gasInfoGoClicked) : y revenir une frame avant de relancer un
            // trajet ferait clignoter la caméra pour rien.
            if (!opts.skipCameraRestore && _gasInfoPrevCamera) {
                /* ⚠ LE PADDING DE `focusGasScanStation()` RESTE SUR LA CAMÉRA — relevé au
                   journal 🩺 le 02/09/2026 : `padCam {top 60, bottom 483, left 40, right 40}`
                   juste après le vol vers la station. La vue mémorisée, elle, a été calculée
                   avec un padding caméra NUL. La rendre sans remise à zéro recentre son
                   centre dans une boîte amputée de 483 px en bas : échelle juste, contenu
                   remonté hors champ — la signature décrite dans AGENTS.md. C'est la seconde
                   moitié de « ressortir de la fiche ne rend pas la zone de scan ». */
                tenterSansBruit(() => map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 }),
                                'closeGasStationInfo/resetPadding');
                map.flyTo({ center: _gasInfoPrevCamera.center, zoom: _gasInfoPrevCamera.zoom, duration: 500 });
            }
            _gasInfoPrevCamera = null;
            _gasInfoCurrent = null;
        }

        function _gasInfoGoClicked() {
            const s = _gasInfoCurrent;
            closeGasStationInfo({ skipCameraRestore: true });
            if (s) _gasGoToStation(s);
        }

        // Ouvre la fiche ET mémorise la caméra AVANT le recentrage de
        // focusGasScanStation() — c'est cette vue-là que la fermeture restaure.
        function _openGasScanDetail(i) {
            const s = _scanShown[i];
            if (!s) return;
            /* ⚠ PENDANT L'ANIMATION D'OUVERTURE, `map.getCenter()` N'EST PAS LA VUE DU
               SCAN mais une image de son vol. `fitBounds` anime sur 800 ms et la liste
               comme les pastilles sont cliquables dès le rendu : un clic rapide — le
               PREMIER, précisément — mémorisait donc un entre-deux, et ressortir de la
               fiche y ramenait. D'où « la première fois, ça ne recentre pas la zone ».
               `isMoving()` retombe à faux dès la caméra stable : dans tous les autres
               cas, y compris après un recentrage manuel, `getCenter()` reste la bonne
               source. Décalque de `_openParkingScanDetail()` (js/27), qui portait déjà
               ce garde-fou — encore un correctif appliqué à un seul des deux jumeaux. */
            _gasInfoPrevCamera = (map.isMoving() && _gasScanCamera)
                ? _gasScanCamera
                : { center: map.getCenter(), zoom: map.getZoom() };
            focusGasScanStation(i);
            openGasStationInfo(s);
        }

        // padding/offset s'expriment en pixels du CANEVAS : on mesure sur le conteneur
        // de la carte, jamais sur window (cf. AGENTS.md — la carte déborde sous les
        // barres du navigateur mobile, innerHeight ≠ hauteur du canevas).
        function _gasScanPadding() {
            const pad = { top: 60, right: 40, bottom: 200, left: 40 };
            const sheet = document.getElementById('gas-scan-sheet');
            const mapEl = map.getContainer();
            if (!sheet || !mapEl) return pad;
            const m = mapEl.getBoundingClientRect();
            if (m.height <= 0 || sheet.offsetHeight <= 0) return pad;

            /* ⚠ ON MESURE LA GÉOMÉTRIE DE MISE EN PAGE, JAMAIS LE RECT COURANT.
               La feuille arrive par une transition de 0,28 s. Au PREMIER scan, la
               réponse réseau tombe souvent pendant ce glissement : un
               getBoundingClientRect() rendait alors une position intermédiaire, voire
               la position de départ hors écran. Le padding calculé était quasi nul, la
               carte centrait donc le cercle sur toute sa surface, puis la feuille
               montait le recouvrir — d'où un premier cadrage décentré, correct dès le
               second (feuille déjà en place). `offsetHeight` / `offsetWidth`, eux,
               décrivent la boîte de mise en page et ignorent le `transform` : la
               mesure est juste avant, pendant et après l'animation. */
            if (isPanelLandscape()) {
                // Colonne à GAUCHE : c'est la largeur qu'il faut réserver, pas la hauteur.
                pad.left   = Math.max(0, Math.min(sheet.offsetWidth + 20, m.width - 80));
                pad.bottom = 40;
                return pad;
            }

            // Bande masquée en bas = barre d'onglets + partie visible de la feuille.
            const visibleH = sheet.classList.contains('collapsed')
                ? Math.max(0, sheet.offsetHeight - _gasScanCollapsedOffset())
                : sheet.offsetHeight;

            // MIN_MAP_BAND : sans plancher, une feuille très haute ne laisserait qu'un
            // filet de carte et fitBounds compenserait en dézoomant à l'excès.
            const MIN_MAP_BAND = 150;
            const maxBottom = Math.max(40, m.height - pad.top - MIN_MAP_BAND);
            pad.bottom = Math.min(getBottomBarsH() + visibleH + 20, maxBottom);
            return pad;
        }

        function _fitMapToGasScan() {
            if (!_scanAnchor) return;

            /* Le cadrage DÉTACHE la caméra du suivi GPS : sans ce drapeau, la boucle de
               suivi annulerait le fitBounds dès le fix suivant et ramènerait la vue sur
               le conducteur. Pas de reprise auto à 8 s ici — elle escamoterait la vue
               d'ensemble pendant qu'on lit la liste ; closeGasScan() rend la main.

               ⚠ Ce bloc est de la COMPTABILITÉ D'ÉTAT, pas le cadrage lui-même : rien de
               ce qui s'y passe ne doit pouvoir empêcher le fitBounds qui suit. C'est
               exactement ce qui est arrivé — un ReferenceError sur
               userPanningResumeTimer emportait la commande caméra, et le scan s'ouvrait
               sans jamais zoomer. Même règle que le try séparé de calculateTripPreview() :
               ce qui conditionne la validité métier et ce qui n'est que de la tenue
               d'état ne partagent pas le même sort. */
            try {
                if (lastRealCoords || isCourseStarted) {
                    isUserPanning = true;
                    showRecenterBtn(true);
                    if (userPanningResumeTimer) { clearTimeout(userPanningResumeTimer); userPanningResumeTimer = null; }
                }
            } catch (e) {
                logAppError('_fitMapToGasScan/détachement caméra', e);
            }

            /* ═══ REMISE À ZÉRO DU PADDING CAMÉRA — SANS ELLE, RIEN NE BOUGE ═══
               ⚠ `fitBounds` ADDITIONNE le padding qu'on lui passe à celui déjà mémorisé dans
               l'état caméra de la carte ; il ne le remplace pas. Or `updateDynamicZoom()`
               en pose un à CHAQUE fix GPS (`map.jumpTo({ …, padding: getMapFollowPadding() })`),
               et depuis la règle 50/50 il vaut plusieurs centaines de pixels. La somme des
               deux dépassait la hauteur du canevas : Mapbox renonce alors au cadrage par un
               simple `warnOnce` en console — **aucune exception**, donc rien dans
               `gps_error_log`, et la caméra ne bouge pas d'un pixel. Le scan paraissait
               fonctionner en tout point sauf celui-là.
               C'est aussi pourquoi le SIMULATEUR ne pouvait pas le montrer : sans fix GPS,
               `updateDynamicZoom()` ne tourne jamais et le padding rémanent reste à zéro.
               ⚠ NE PAS « corriger » en réduisant `_gasScanPadding()` : le calcul y est juste,
               c'est le padding résiduel qui n'a rien à y faire. Même diagnostic et même
               remède que `fitMapToModalRoute()` (js/15), relevé sur appareil à
               `padCam: {bottom: 461}` — le scan ⛽ était le dernier cadrage à ne pas l'avoir.
               La boucle de suivi repose le sien dès que `closeGasScan()` rend la main. */
            /* `resize()` INCONDITIONNEL, comme fitMapToModalRoute() (js/15) — c'est la
               TAILLE INTERNE de Mapbox qui sert au calcul du cadrage, jamais le rect DOM.
               Elle se périme sans rien lever : rotation, clavier, barres du navigateur,
               changement d'appareil dans le simulateur (le châssis est mis à l'échelle en
               CSS). Le cadrage se fait alors sur une hauteur qui n'existe plus, et le
               cercle sort par le haut avec un zoom pourtant plausible. */
            tenterSansBruit(() => map.resize(), '_fitMapToGasScan/resize');

            tenterSansBruit(() => map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 }),
                            '_fitMapToGasScan/resetPadding');

            // On cadre sur le CERCLE, pas sur les stations trouvées : le zoom suit
            // ainsi la distance demandée, et non le hasard des résultats. Un rayon
            // de 10 km ne renvoyant qu'une station voisine cadrerait sinon serré,
            // en contradiction avec la zone dessinée. Les stations sont de toute
            // façon toutes dans le cercle, elles restent donc visibles.
            const bounds  = _gasScanCircleBounds(_scanAnchor, _scanRadiusKm);
            const padding = _gasScanPadding();

            // Vue de fin, connue AVANT l'animation : voir `_gasScanCamera`. Les options
            // doivent être les MÊMES que celles du fitBounds ci-dessous, sinon la vue
            // mémorisée n'est pas celle vers laquelle la caméra part réellement.
            _gasScanCamera = null;
            tenterSansBruit(() => {
                const cam = map.cameraForBounds(bounds, { padding, maxZoom: 16, bearing: 0, pitch: 0 });
                if (cam) _gasScanCamera = { center: cam.center, zoom: cam.zoom };
            }, '_fitMapToGasScan/cameraForBounds');

            /* ⚠ `bearing: 0, pitch: 0` — MÊME RÈGLE QUE fitMapToModalRoute() (js/15).
               Sans eux, `fitBounds` conserve l'inclinaison et le cap de la boucle de suivi
               (cap-en-haut, et 60° de pitch en mode 3D). Le cadrage d'une bbox sur une
               caméra inclinée n'est pas fiable chez Mapbox : la moitié lointaine de la vue
               est comprimée en haut de l'écran et le cercle en dépasse. Une vue d'ensemble
               se lit à plat et au nord ; la boucle de suivi repose cap et pitch dès que
               closeGasScan() lui rend la main. */
            try {
                map.fitBounds(bounds, {
                    padding, maxZoom: 16, duration: 800, bearing: 0, pitch: 0
                });
            } catch (e) {
                logAppError('_fitMapToGasScan', e);
            }

            _diagFitScan(bounds, padding);
        }

        /* Trace de diagnostic du cadrage ⛽ — décalque de celle de fitMapToModalRoute()
           (js/15), pour la même raison : la console est inaccessible dans l'APK, seul le
           journal 🩺 dit ce qui s'est passé. Elle relève DEUX fois :
             — avant, le zoom VISÉ par `cameraForBounds` (le même calcul que fitBounds,
               sans toucher la caméra) et tout ce qui l'alimente ;
             — 1,2 s après, la vue RÉELLE et la position à l'écran du haut et du bas du
               cercle. Les deux relevés séparent les deux familles de causes : un cadrage
               visé déjà faux est un problème de géométrie (padding, taille de canevas) ;
               un cadrage visé juste puis remplacé signifie qu'une autre commande caméra a
               repris la main entre-temps.
           Purement observationnelle : aucun de ses échecs ne doit toucher au cadrage. */
        function _diagFitScan(bounds, padding) {
            tenterSansBruit(() => {
                const el = map.getContainer().getBoundingClientRect();
                const cv = map.getCanvas();
                const sheet = document.getElementById('gas-scan-sheet');
                let camZoom = null;
                tenterSansBruit(() => {
                    const c = map.cameraForBounds(bounds, { padding, maxZoom: 16, bearing: 0, pitch: 0 });
                    if (c) camZoom = +c.zoom.toFixed(2);
                }, '_diagFitScan/cameraForBounds');

                logDiag('fitScan', {
                    rect: Math.round(el.width) + 'x' + Math.round(el.height),
                    trans: map.transform ? Math.round(map.transform.width) + 'x' + Math.round(map.transform.height) : '-',
                    cvBrut: cv ? (cv.clientWidth + 'x' + cv.clientHeight) : '-',
                    win: window.innerWidth + 'x' + window.innerHeight,
                    pad: padding, padCam: map.getPadding(),
                    sheetH: sheet ? sheet.offsetHeight : -1,
                    replie: !!sheet?.classList.contains('collapsed'),
                    barres: getBottomBarsH(), rayon: _scanRadiusKm,
                    pitch: Math.round(map.getPitch()), cap: Math.round(map.getBearing()),
                    zAvant: +map.getZoom().toFixed(2), zVise: camZoom,
                    panning: isUserPanning, course: isCourseStarted,
                });

                // Le verdict : où le cercle a RÉELLEMENT atterri, une fois l'animation
                // finie. `haut` doit tomber sous `pad.top`, `bas` au-dessus de la feuille.
                const ouCercle = () => {
                    const h = map.project(bounds.getNorthEast());
                    const b = map.project(bounds.getSouthWest());
                    return { haut: Math.round(h.y), bas: Math.round(b.y),
                             gauche: Math.round(b.x), droite: Math.round(h.x) };
                };
                setTimeout(() => tenterSansBruit(() => {
                    logDiag('fitScan/apres', {
                        zoom: +map.getZoom().toFixed(2), cercle: ouCercle(),
                        hauteurCarte: Math.round(map.getContainer().getBoundingClientRect().height),
                        padCam: map.getPadding(), panning: isUserPanning,
                    });

                    /* ⚠ LE RELEVÉ À 1,2 s NE PROUVE PAS QUE LA VUE TIENT. Un cadrage juste
                       puis repris par une autre commande caméra donne exactement le même
                       journal qu'un cadrage juste et stable — et c'est la panne la plus
                       probable ici, la boucle de suivi n'étant retenue que par
                       `isUserPanning`, lui-même non posé quand ni fix GPS ni course ne
                       sont là. On écoute donc le PROCHAIN mouvement, une seule fois, et on
                       consigne où il emmène le cercle. Silence dans le journal = personne
                       n'a touché à la caméra, et la question est réglée pour de bon. */
                    let armé = true;
                    const surMouvement = (ev) => {
                        if (!armé) return;
                        armé = false;
                        /* ⚠ REFERMER LA FEUILLE REND LA CAMÉRA — c'est le comportement voulu
                           (`closeGasScan()` appelle `recenterMap()`), pas un vol. Le test
                           porte sur `body.gas-scan-open`, retiré SYNCHRONEMENT à la
                           fermeture, et non sur la classe `.open` de la feuille, qui survit
                           280 ms le temps de l'animation : c'est justement la fenêtre où le
                           recentrage a lieu, et s'y fier remplirait le journal de faux vols. */
                        if (!document.body.classList.contains('gas-scan-open')) return;
                        /* Ouvrir une fiche station DÉPLACE la caméra volontairement
                           (`focusGasScanStation`) : c'est le geste de l'utilisateur, pas
                           un vol. Sans cette exclusion, le relevé le plus fréquent du
                           journal est un faux positif — et un détecteur qui crie à chaque
                           usage normal finit par n'être plus lu du tout, ce qui revient à
                           ne pas en avoir. C'est par ce chemin que le bug du 02/09/2026 a
                           été identifié ; une fois nommé, il n'a plus à être signalé. */
                        if (document.getElementById('gas-info-overlay')?.classList.contains('open')) return;

                        /* ⚠ `movestart` SE DÉCLENCHE AVANT QUE LA CAMÉRA BOUGE : relevée
                           ici, la vue est encore celle du cadrage, et la trace du
                           02/09/2026 a ainsi annoncé un vol en montrant un cercle
                           parfaitement placé — un relevé qui ne dit rien de ce qu'on
                           cherche. C'est donc `moveend` qui porte le verdict ; `movestart`
                           ne sert plus qu'à dater le départ et à nommer l'ORIGINE :
                           `ev.originalEvent` n'existe que si un geste humain est à la
                           source, son absence désigne une commande caméra du code. */
                        const origine = (ev && ev.originalEvent) ? ('geste:' + ev.originalEvent.type) : 'code';
                        /* `movestart` est émis SYNCHRONEMENT depuis `jumpTo`/`easeTo`/`flyTo` :
                           la pile capturée ici contient donc encore l'appelant, et NOMME le
                           voleur au lieu de le faire deviner. Deux images suffisent, le
                           reste étant l'intérieur de Mapbox ; les chemins sont raccourcis
                           pour tenir dans le journal 🩺, qui est plafonné. */
                        let pile = null;
                        try {
                            /* ⚠ ON GARDE LE BAS DE LA PILE, PAS LE HAUT. Le haut, ce sont
                               les images de CE relevé (l'écouteur, `tenterSansBruit`) et
                               l'intérieur de Mapbox — les trois premières tentatives n'ont
                               journalisé que ça, c'est-à-dire l'observateur au lieu de
                               l'observé. L'appelant cherché est au CONTRAIRE la dernière
                               image utile ; sur une commande émise depuis un timer, c'est
                               le rappel du timer, ce qui suffit à le nommer. */
                            pile = String((new Error()).stack || '').split('\n').slice(1)
                                .map(l => l.trim().replace(/^at\s+/, '').replace(/.*\/js\//, 'js/'))
                                .filter(l => l && l.indexOf('mapbox-gl') === -1
                                          && l.indexOf('tenterSansBruit') === -1
                                          && l.indexOf('surMouvement') === -1
                                          && l.indexOf('_diagFitScan') === -1)
                                .slice(-3).join(' ← ');
                        } catch (e) { pile = 'pile indisponible'; }
                        map.once('moveend', () => tenterSansBruit(() => logDiag('fitScan/vole', {
                            origine, pile, zoom: +map.getZoom().toFixed(2), cercle: ouCercle(),
                            padCam: map.getPadding(), panning: isUserPanning,
                            feuille: document.body.classList.contains('gas-scan-open'),
                        }), '_diagFitScan/vole'));
                    };
                    map.once('movestart', surMouvement);
                    // Au-delà, un mouvement est un geste de l'utilisateur, pas un vol :
                    // l'écouteur se retire pour ne pas polluer le journal.
                    setTimeout(() => { armé = false; tenterSansBruit(() => map.off('movestart', surMouvement), '_diagFitScan/desarme'); }, 6000);
                }, '_diagFitScan/apres'), 1200);
            }, '_diagFitScan');
        }

        /* ═══════════════════════════════════════════════════════════════════
           PLAN DE PAUSE EN 3 ZONES — construction
           ═══════════════════════════════════════════════════════════════════
           Appelé une fois les aires récupérées (js/09), puis re-appelé après chaque pause
           validée pour armer le cycle suivant sur un trajet très long.

           `departKm` est le point à partir duquel on cherche : au premier armement c'est
           l'équivalent kilométrique des 1h50, ensuite c'est la position courante. */
        /* ⚠ `ligne` est PASSÉE, pas lue dans `fullRouteLine` : le plan est armé dès l'aperçu
           de trajet, où seul `currentTurfLine` existe — `fullRouteLine` n'est renseignée
           qu'au lancement. Retomber sur la globale par défaut garde les appels d'origine
           (startCourse) inchangés. */
        function buildRestStopPlan(departKm, ligne) {
            const line = ligne || fullRouteLine;
            restStopPlan = [];
            restStopPlanIndex = 0;
            restStopBonusLost = false;
            if (!line || restAreas.length === 0) { refreshRestAreaMarkers(); return; }

            const candidats = [];
            restAreas.forEach(area => {
                try {
                    const snapped = turf.nearestPointOnLine(line, turf.point([area.lng, area.lat]), { units: 'kilometers' });
                    const distAlongKm = snapped.properties.location;
                    if (distAlongKm > departKm) {
                        candidats.push({ name: area.name, lat: area.lat, lng: area.lng, distAlongKm });
                    }
                } catch (e) { if (DEBUG) console.warn("[buildRestStopPlan] aire ignorée :", e); }
            });
            candidats.sort((a, b) => a.distAlongKm - b.distAlongKm);

            for (const c of candidats) {
                if (restStopPlan.length >= REST_STOP_PLAN_SIZE) break;
                /* ⚠ ON N'AFFICHE PAS UNE ZONE AU-DELÀ DE CE QUI EST RELEVÉ EN CONTINU.
                   Sans ce garde-fou, les zones 2 et 3 se posaient sur les aires les plus
                   lointaines connues à l'instant t, puis reculaient à chaque tronçon qui
                   rentrait : mesuré sur Paris–Perpignan, 403/430 km → 336/350 → 245/278,
                   soit des pictos qui sautent de 160 km sous les yeux du conducteur.
                   Au-delà de `restAreasCoverageKm`, un tronçon manquant peut encore
                   apporter une aire ANTÉRIEURE : la zone n'est donc pas une information,
                   c'est une conjecture. On s'arrête là et le plan se complétera. */
                if (c.distAlongKm > restAreasCoverageKm) break;
                const precedente = restStopPlan[restStopPlan.length - 1];
                if (precedente && (c.distAlongKm - precedente.distAlongKm) < REST_STOP_PLAN_MIN_GAP_KM) continue;
                restStopPlan.push(c);
            }
            /* ⚠ Journalisé SEULEMENT si le plan a réellement changé. Le relevé réarme à
               chaque tronçon qui rentre (js/09) : sur un trajet à 4 tronçons, quatre lignes
               identiques occupaient un tiers de `DIAG_LOG_MAX` (12) et chassaient `peages`
               et `fit`. Ce qui mérite une trace, c'est le plan qui BOUGE — c'est-à-dire
               qu'un tronçon tardif a apporté une aire plus pertinente. */
            const _signaturePlan = restStopPlan.map(z => z.distAlongKm.toFixed(1)).join('|');
            if (_signaturePlan !== _dernierPlanJournalise) {
                _dernierPlanJournalise = _signaturePlan;
                logDiag('pause-plan', {
                    zones: restStopPlan.length,
                    candidats: candidats.length,
                    departKm: +departKm.toFixed(1),
                    // Explique un plan à 1 ou 2 zones : ce n'est pas une pénurie d'aires,
                    // c'est un relevé encore incomplet au-delà de ce kilomètre.
                    couvKm: Number.isFinite(restAreasCoverageKm) ? +restAreasCoverageKm.toFixed(0) : null,
                    km: restStopPlan.map(z => +z.distAlongKm.toFixed(1))
                });
            }
            refreshRestAreaMarkers();
        }

        /* Pictos « repos » sur la carte. La zone en cours de proposition est mise en avant ;
           celles déjà dépassées restent visibles mais éteintes — le conducteur doit pouvoir
           constater qu'il en a laissé passer une, c'est ce qui rend la 3e crédible. */
        function refreshRestAreaMarkers() {
            restStopMarkers.forEach(m => { try { m.remove(); } catch (e) { /* carte déjà détruite */ } });
            restStopMarkers = [];
            if (typeof map === 'undefined' || !map) return;
            restStopPlan.forEach((zone, i) => {
                const el = document.createElement('div');
                el.className = 'rest-area-marker';
                if (i < restStopPlanIndex) el.classList.add('passed');
                else if (i === restStopPlanIndex) el.classList.add('current');
                el.innerHTML = `<span class="rest-area-icon">☕</span><span class="rest-area-num">${i + 1}</span>`;
                el.title = `${zone.name} — zone de pause ${i + 1}/${restStopPlan.length}`;
                try {
                    restStopMarkers.push(new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                        .setLngLat([zone.lng, zone.lat]).addTo(map));
                } catch (e) { logAppError('refreshRestAreaMarkers', e); }
            });
        }

        // Remis à zéro par `clearRestStopPlan()` : un nouveau trajet doit rejournaliser son
        // plan, même s'il tombe par hasard sur les mêmes kilomètres que le précédent.
        let _dernierPlanJournalise = null;

        function clearRestStopPlan() {
            _dernierPlanJournalise = null;
            restStopIntervalKm = null;
            restStopPlan = [];
            restStopPlanIndex = 0;
            restStopProposed = false;
            restStopBonusLost = false;
            refreshRestAreaMarkers();
        }

        /* Identité d'un tracé, assez fine pour distinguer deux itinéraires alternatifs
           (nombre de points + extrémités) et assez grossière pour rester stable face aux
           micro-écarts de Mapbox — même approche que la signature de contexte des détours
           station (js/18). */
        function _routeSigForRestAreas(line) {
            try {
                const c = line.geometry.coordinates;
                return c.length + '|' + c[0].join(',') + '|' + c[c.length - 1].join(',');
            } catch (e) { return null; }
        }

        // Convertit le seuil des 1h50 en kilomètres et arme le plan. Sans effet sous
        // REST_STOP_PLAN_MIN_HOURS : c'est ce qui laisse les trajets courts au régime d'origine.
        function armRestStopPlan(totalDurationHours, ligne) {
            const line = ligne || fullRouteLine;
            /* Journalisé : c'est ICI que la chaîne s'arrête le plus souvent en silence
               (aucune aire relevée, ou durée sous le seuil), et un abandon muet se lit
               « les pictos ne marchent pas » sans dire lequel des deux verrous a joué. */
            if (!line || restAreas.length === 0 || !(totalDurationHours > REST_STOP_PLAN_MIN_HOURS)) {
                logDiag('pause-arme', {
                    arme: false,
                    ligne: !!line,
                    aires: restAreas.length,
                    dureeH: totalDurationHours != null ? +totalDurationHours.toFixed(2) : null,
                    seuilH: REST_STOP_PLAN_MIN_HOURS
                });
                return;
            }
            try {
                const totalKm = turf.length(line, { units: 'kilometers' });
                // Mémorisé pour le réarmement après pause : c'est la même distance qu'on
                // remettra devant le conducteur à chaque cycle.
                restStopIntervalKm = totalKm * (REST_STOP_INTERVAL_HOURS / totalDurationHours);
                buildRestStopPlan(restStopIntervalKm, line);
            } catch (e) { if (DEBUG) console.warn('[Pause] armement du plan impossible :', e); }
        }

        /* ═══════════════════════════════════════════════════════════════════
           SUGGESTION DE PAUSE — deux régimes
           ═══════════════════════════════════════════════════════════════════
           • Plan actif (trajet > 2h et aires trouvées) : une proposition au seuil des
             1h50, puis une nouvelle à CHAQUE zone dépassée sans s'arrêter. Après la
             troisième, le bonus est perdu — mais la détection de pause continue de
             tourner : s'arrêter reste possible, ça ne rapporte simplement plus rien.
           • Sinon : comportement d'origine, l'aire suivante annoncée toutes les 1h50. */
        function checkRestStopSuggestion(d, distAlongKm) {
            if (!d || !fullRouteLine) return;
            if (restStopTracking.validated) return;   // pause en cours de validation

            if (restStopPlan.length === 0) { _suggestNextRestAreaLegacy(d, distAlongKm); return; }

            if (!restStopProposed) {
                if (d.timeHours < nextRestThresholdHours) return;
                restStopProposed = true;
                /* ⚠ Les zones ont été placées à partir d'une ESTIMATION proportionnelle du
                   point des 1h50 (js/09). Rouler plus vite que la moyenne annoncée met donc
                   une ou plusieurs zones DERRIÈRE nous au moment où le seuil tombe. Les
                   laisser dans le plan ferait cascader l'escalade sur la frame suivante —
                   trois zones « ratées » d'un coup et bonus perdu sans avoir rien vu.
                   Elles ne sont pas ratées, elles n'ont simplement jamais été proposées :
                   on les écarte, et si le plan se vide on le reconstruit d'ici. */
                while (restStopPlanIndex < restStopPlan.length &&
                       distAlongKm > restStopPlan[restStopPlanIndex].distAlongKm) {
                    restStopPlanIndex++;
                }
                if (restStopPlanIndex >= restStopPlan.length) {
                    buildRestStopPlan(distAlongKm);
                    if (restStopPlan.length === 0) { _suggestNextRestAreaLegacy(d, distAlongKm); return; }
                }
                refreshRestAreaMarkers();
                _proposeRestZone(d, distAlongKm);
                return;
            }
            if (restStopBonusLost || restStopPlanIndex >= restStopPlan.length) return;

            const zone = restStopPlan[restStopPlanIndex];
            if (distAlongKm <= zone.distAlongKm + REST_STOP_PASSED_MARGIN_KM) return;

            // Zone franchie sans s'y arrêter.
            restStopPlanIndex++;
            if (restStopPlanIndex >= restStopPlan.length) {
                restStopBonusLost = true;
                refreshRestAreaMarkers();
                showRestStopLostBanner();
            } else {
                refreshRestAreaMarkers();
                _proposeRestZone(d, distAlongKm);
            }
        }

        function _proposeRestZone(d, distAlongKm) {
            const zone = restStopPlan[restStopPlanIndex];
            if (!zone) return;
            const restantesApres = restStopPlan.length - restStopPlanIndex - 1;
            showRestStopBanner(zone.name, zone.distAlongKm - distAlongKm, _avgSpeedKmh(d), {
                rang: restStopPlanIndex + 1,
                total: restStopPlan.length,
                derniere: restantesApres === 0
            });
        }

        function _suggestNextRestAreaLegacy(d, distAlongKm) {
            if (d.timeHours < nextRestThresholdHours) return;
            nextRestThresholdHours += REST_STOP_INTERVAL_HOURS;
            if (restAreas.length === 0) return;
            let best = null;
            restAreas.forEach(area => {
                try {
                    const snapped = turf.nearestPointOnLine(fullRouteLine, turf.point([area.lng, area.lat]), { units: 'kilometers' });
                    const areaDistAlong = snapped.properties.location;
                    if (areaDistAlong > distAlongKm && (!best || areaDistAlong < best.distAlongKm)) {
                        best = { name: area.name, distAlongKm: areaDistAlong };
                    }
                } catch (e) { if (DEBUG) console.warn("[checkRestStopSuggestion] exception ignorée :", e); }
            });
            if (!best) return;
            showRestStopBanner(best.name, best.distAlongKm - distAlongKm, _avgSpeedKmh(d), null);
        }

        /* Vitesse moyenne DEPUIS LE DÉPART plutôt que vitesse instantanée : sur autoroute
           les deux se rejoignent, mais la moyenne ne fait pas sauter le « dans 12 min »
           à « dans 45 min » parce qu'on ralentit deux secondes derrière un camion. */
        function _avgSpeedKmh(d) {
            if (!d || !d.timeHours || d.timeHours <= 0 || !d.dist) return 0;
            return d.dist / d.timeHours;
        }

        function checkRestStopReal(d, lng, lat) {
            if (!fullRouteLine || restAreas.length === 0) return;
            try {
                const snapped = turf.nearestPointOnLine(fullRouteLine, turf.point([lng, lat]), { units: 'kilometers' });
                checkRestStopSuggestion(d, snapped.properties.location);
            } catch (e) { if (DEBUG) console.warn("[checkRestStopReal] exception ignorée :", e); }
        }

        function showRestStopBanner(name, distKm, avgSpeedKmh, plan) {
            const banner = document.getElementById('rest-stop-banner');
            banner.classList.remove('validated', 'lost');
            document.getElementById('rest-stop-icon').innerText = '☕';
            document.getElementById('rest-stop-title').innerText = plan
                ? (plan.derniere ? `Pause conseillée · dernière zone (${plan.rang}/${plan.total})`
                                 : `Pause conseillée · zone ${plan.rang}/${plan.total}`)
                : 'Pause conseillée';

            /* Le temps prime sur la distance : « dans 8 min » se décide tout de suite,
               « dans 14 km » demande une conversion mentale au volant. La distance reste
               en second, elle seule permet de reconnaître le panneau au bord de la route. */
            const distLabel = distKm < 1 ? Math.round(distKm * 1000) + " m" : distKm.toFixed(1) + " km";
            let quand = distLabel;
            if (avgSpeedKmh > 5 && distKm > 0) {
                const minutes = Math.round((distKm / avgSpeedKmh) * 60);
                quand = (minutes < 1 ? "moins d'1 min" : `${minutes} min`) + ` · ${distLabel}`;
            }
            document.getElementById('rest-stop-detail').innerText = `${name} · dans ${quand}`;
            _showRestStopBannerFor(REST_STOP_BANNER_MS);
            // 'bavard' : suggestion de confort/bonus, la bannière suffit à la porter.
            playAudioSequence(['attention.ogg', 'time.ogg'], 0, 'bavard');
        }

        // Les 3 zones sont passées : on le dit une fois, franchement, plutôt que de laisser
        // le conducteur croire que le bonus l'attend encore quelque part.
        function showRestStopLostBanner() {
            const banner = document.getElementById('rest-stop-banner');
            banner.classList.remove('validated');
            banner.classList.add('lost');
            document.getElementById('rest-stop-icon').innerText = '⚠️';
            document.getElementById('rest-stop-title').innerText = 'Bonus pause perdu';
            document.getElementById('rest-stop-detail').innerText =
                'Les 3 zones sont passées. Arrêtez-vous dès que vous le pouvez.';
            _showRestStopBannerFor(REST_STOP_BANNER_MS);
            playAudioSequence(['attention.ogg', 'time.ogg'], 0, 'bavard');
        }

        /* Auto-effacement : une bannière qui reste à l'écran finit par masquer la carte au
           moment où on cherche justement la sortie. Le minuteur précédent est toujours
           annulé — sans quoi celui de la zone 1 refermerait la bannière de la zone 2. */
        function _showRestStopBannerFor(ms) {
            const banner = document.getElementById('rest-stop-banner');
            if (_restStopBannerTimer) { clearTimeout(_restStopBannerTimer); _restStopBannerTimer = null; }
            banner.classList.add('visible');
            _restStopBannerTimer = setTimeout(() => { _restStopBannerTimer = null; dismissRestStopBanner(); }, ms);
        }

        function dismissRestStopBanner() {
            if (_restStopBannerTimer) { clearTimeout(_restStopBannerTimer); _restStopBannerTimer = null; }
            document.getElementById('rest-stop-banner').classList.remove('visible');
        }

        function onTestPauseModeChange() {
            testPauseSimEnabled = document.getElementById('test-pause-toggle').checked;
        }

        function checkPauseDetection(d, lng, lat, speedKmh, requiredMinutesOverride) {
            if (restAreas.length === 0) return;
            const requiredMinutes = (requiredMinutesOverride != null) ? requiredMinutesOverride : REST_STOP_PAUSE_MINUTES;
            const nearArea = restAreas.find(area =>
                turf.distance(turf.point([lng, lat]), turf.point([area.lng, area.lat]), { units: 'kilometers' }) < REST_STOP_RADIUS_KM
            );
            const isStationary = speedKmh < 5;

            if (nearArea && isStationary) {
                if (!restStopTracking.active || restStopTracking.areaName !== nearArea.name) {
                    // lng/lat retenus : `validateRestStop()` en a besoin pour réarmer le
                    // plan à partir du point où la pause a réellement eu lieu.
                    restStopTracking = { active: true, areaName: nearArea.name, enteredAt: Date.now(),
                                         validated: false, lng: nearArea.lng, lat: nearArea.lat };
                }
                const elapsedMin = (Date.now() - restStopTracking.enteredAt) / 60000;
                if (elapsedMin >= requiredMinutes && !restStopTracking.validated) {
                    restStopTracking.validated = true;
                    // `d` transmis : le réarmement en a besoin pour recaler le seuil des
                    // 1h50 sur l'instant de la pause (`d.timeHours`).
                    validateRestStop(restStopTracking.areaName, elapsedMin, requiredMinutesOverride != null, d);
                }
            } else {
                restStopTracking = { active: false, areaName: null, enteredAt: null, validated: false };
            }
        }

        function validateRestStop(name, elapsedMin, isTest, d) {
            /* ⚠ Le bonus est perdu, PAS la détection. S'arrêter après les 3 zones reste
               reconnu et affiché — c'est le comportement qu'on veut encourager, même
               tardif. Seuls les points ne suivent plus : sinon les 3 zones ne voudraient
               rien dire et autant ne pas les proposer. */
            const bonus = restStopBonusLost ? 0 : REST_STOP_BONUS_POINTS;
            if (bonus > 0) addPointsToActiveProfile(bonus);

            const banner = document.getElementById('rest-stop-banner');
            banner.classList.remove('lost');
            banner.classList.add('validated');
            document.getElementById('rest-stop-icon').innerText = '✅';
            document.getElementById('rest-stop-title').innerText =
                isTest ? 'Pause validée (test) !' : (bonus > 0 ? 'Pause validée !' : 'Pause prise');
            const duree = isTest ? '' : `${Math.round(elapsedMin)} min · `;
            const points = bonus > 0 ? `+${bonus} pts` : 'hors zones — pas de bonus';
            document.getElementById('rest-stop-detail').innerText = `${name} · ${duree}${points}`;
            _showRestStopBannerFor(6000);

            /* Trajet très long : une fois la pause prise, on réarme un cycle complet pour
               les 1h50 suivantes. Sans cela le plan restait consommé et plus aucune
               suggestion n'arrivait sur un Paris–Marseille.

               ⚠ LE CYCLE REPART DU POINT D'ARRÊT **PLUS** L'ÉQUIVALENT DES 1h50, pas du
               point d'arrêt. Passer la position brute posait les trois tasses sur les
               aires immédiatement suivantes — parfois 5 km plus loin : on venait de
               s'arrêter et l'app proposait déjà la pause d'après. Elles étaient ensuite
               toutes écartées d'un coup quand le seuil tombait réellement 1h50 plus tard
               (voir checkRestStopSuggestion), et le plan se reconstruisait : des pictos
               qui sautent de 150 km, exactement ce que `restAreasCoverageKm` interdit
               ailleurs. Le rythme voulu est : départ, 1h50, pause, 1h50, pause…

               Et le seuil horaire est RECALÉ sur l'instant de la pause, pas incrémenté :
               `+= REST_STOP_INTERVAL_HOURS` partait du seuil précédent, donc les 15 min
               d'arrêt étaient décomptées des 1h50 suivantes. Ce sont 1h50 de ROUTE après
               la pause qui doivent être offertes. */
            try {
                if (restStopPlan.length > 0 && fullRouteLine && restStopTracking.lng != null) {
                    nextRestThresholdHours = (d && d.timeHours > 0)
                        ? d.timeHours + REST_STOP_INTERVAL_HOURS
                        : nextRestThresholdHours + REST_STOP_INTERVAL_HOURS;
                    restStopProposed = false;
                    const snapped = turf.nearestPointOnLine(
                        fullRouteLine,
                        turf.point([restStopTracking.lng, restStopTracking.lat]),
                        { units: 'kilometers' });
                    /* Repli si le plan n'a pas été armé par `armRestStopPlan()` (donc sans
                       durée totale connue) : la vitesse moyenne réellement tenue depuis le
                       départ est la meilleure conversion disponible des 1h50 en kilomètres. */
                    const intervalKm = (restStopIntervalKm != null && restStopIntervalKm > 0)
                        ? restStopIntervalKm
                        : _avgSpeedKmh(d) * REST_STOP_INTERVAL_HOURS;
                    buildRestStopPlan(snapped.properties.location + intervalKm);
                }
            } catch (e) { if (DEBUG) console.warn('[Pause] réarmement du plan impossible :', e); }
        }


        // === SCAN PARKINGS AUTOUR DE MOI (feuille autonome, hotbox 🅿️) ===
        // ═══════════════════════════════════════════════════════════════════
        // Même famille que le scan stations/bornes (js/11) : une bulle autour du
        // conducteur, indépendante de tout trajet. Source unique et universelle —
        // Overpass (amenity=parking) — au lieu du routeur multi-pays des stations,
        // parce qu'aucun portail opendata municipal vérifié (Paris, Bordeaux) ne
        // publie de comptage EN DIRECT des places libres, et celui qui existait
        // (Grand Lyon) exige désormais une clé API. Cette feuille affiche donc une
        // CAPACITÉ TOTALE (tag `capacity` d'OSM), jamais un nombre de places
        // libres — le statut l'annonce explicitement pour ne pas laisser croire à
        // un compteur temps réel qui n'existe pas.
        //
        // Réutilise volontairement les classes .gas-station-card / .gas-card-* :
        // ce ne sont pas des classes « carburant », déjà partagées avec les bornes
        // électriques (voir _scanEvCardHtml dans js/11) — c'est le système de carte
        // du scan, générique par construction.

        /* Plafond volontairement plus haut que les 12 du scan stations : en ville un
           rayon de 2 km recense couramment plus de 150 parkings, tous équivalents à
           quelques centaines de mètres près — couper à 12 masquait des candidats
           pertinents, là où 12 stations-service couvrent déjà tout le voisinage. */
        const PK_SCAN_MAX_CARDS = 30;

        let _pkStations = [], _pkShown = [], _pkMarkers = [];
        let _pkAnchor  = null;
        let _pkBusy    = false;
        // Jeton de la fiche détail actuellement ouverte (voir openParkingInfo) : une
        // réponse de géocodage inverse qui revient APRÈS que l'utilisateur a ouvert
        // une autre fiche ne doit pas écraser l'adresse affichée par erreur.
        let _pkInfoToken = 0;
        // Parking dont la fiche détail est ouverte — voir _pkInfoGoClicked().
        let _pkInfoCurrent = null;
        /* Filtre tarif : 'gratuit', 'payant', ou null pour « tous ». Volontairement
           NON persisté en localStorage, à la différence du rayon : un filtre qui
           survit à la fermeture ferait rouvrir la feuille sur une liste amputée sans
           que rien n'explique pourquoi, deux jours plus tard. */
        let _pkFee = null;
        let _pkRadiusKm = parseFloat(localStorage.getItem('gps_parking_scan_radius') || '1.5');
        if (!Number.isFinite(_pkRadiusKm) || _pkRadiusKm < 0.5 || _pkRadiusKm > 5) _pkRadiusKm = 1.5;

        /* Cache du dernier relevé Overpass + veille silencieuse (voir _scanCacheFresh,
           js/00). Le conducteur rouvre souvent la feuille après l'avoir juste repliée,
           depuis une position à peine différente : sans cache, chaque réouverture
           repaye un aller-retour Overpass pour un résultat quasi identique.
           TTL et seuil de déplacement mesurés sur la même logique que le scan
           stations (js/11), auquel ce module a toujours été jumelé. */
        const PK_CACHE_TTL_MS  = 300000;  // 5 min : un parking n'apparaît ni ne disparaît
        const PK_PREFETCH_MS   = 180000;  // cadence de la veille, feuille fermée
        let _pkCache = { anchor: null, radiusKm: 0, ts: 0, raw: [] };

        /* Le relevé couvre-t-il DÉJÀ ce qu'on demande ? On ne compare plus le rayon à
           l'identique (`tag`) comme le fait _scanCacheFresh : un relevé à 2,5 km
           contient tout ce qu'un scan à 1 km peut montrer, et le refaire n'était qu'un
           aller-retour Overpass pour un sous-ensemble déjà en mémoire — un glissement
           de curseur en déclenchait un par cran. C'est cette rafale de requêtes lourdes
           qui faisait tomber les miroirs (« tous les miroirs Overpass ont échoué »).
           Le déplacement depuis le relevé est DÉDUIT du rayon utile au lieu d'être
           toléré à l'aveugle : à 300 m de l'ancre d'origine, un relevé à 2,5 km ne
           garantit plus que 2,2 km autour d'ici. L'ancien seuil fixe, lui, servait un
           croissant de vide sans le dire. */
        function _pkCacheCouvre(anchor, radiusKm, nowMs) {
            if (!_pkCache.anchor || !_pkCache.raw) return false;
            if (!Number.isFinite(_pkCache.ts) || nowMs - _pkCache.ts > PK_CACHE_TTL_MS) return false;
            const ecartKm = _ecartMetres(anchor, _pkCache.anchor) / 1000;
            return _pkCache.radiusKm >= radiusKm + ecartKm;
        }

        // Même geôle que le scan stations : pendant l'aperçu de trajet, une bulle
        // par-dessus le modal n'aurait rien à quoi se raccrocher (voir _gasScanBlocked
        // dans js/11, réutilisée telle quelle — la condition est identique).

        function _syncParkingScanHeight() {
            document.documentElement.style.setProperty('--parking-scan-h', getSheetHeightPx() + 'px');
        }

        function openParkingScan() {
            const sheet = document.getElementById('parking-scan-sheet');
            if (!sheet) return;
            if (_gasScanBlocked()) return;
            /* Les deux scans sont exclusifs : superposer marqueurs stations et parkings,
               plus leurs deux zones radar, sature la carte. Le geste le plus récent gagne.
               keepCamera : l'ouverture qui suit pose son propre cadrage, un recentrage
               intercalé ne ferait que secouer la vue. */
            closeGasScan({ keepCamera: true });
            _pkVeilleArmee = true;   // voir _pkPrefetchTick : la veille suit l'usage réel
            _syncParkingScanHeight();
            document.body.classList.add('parking-scan-open');
            sheet.classList.add('open');
            sheet.classList.remove('collapsed');
            requestAnimationFrame(() => {
                _syncParkingScanCollapse();
                requestAnimationFrame(() => sheet.classList.add('shown'));
            });

            const slider = document.getElementById('parking-scan-radius');
            if (slider) slider.value = _pkRadiusKm;
            _renderParkingScanRadiusLabel();

            // La zone est dessinée AVANT le scan, même règle que le scan stations
            // (js/11) : le curseur doit répondre tout de suite, sans attendre le réseau.
            _pkAnchor = _gasScanAnchorPoint();
            _pkZoneUpdate(_pkAnchor, _pkRadiusKm);
            _pkZoneStart();
            runParkingScan();
        }

        function closeParkingScan(opts = {}) {
            const sheet = document.getElementById('parking-scan-sheet');
            if (!sheet) return;
            if (!sheet.classList.contains('open')) return;
            document.body.classList.remove('parking-scan-open');
            sheet.classList.remove('shown');
            setTimeout(() => sheet.classList.remove('open'), 280);
            _clearParkingScanMarkers();
            _pkZoneRemove();
            if (!opts.keepCamera && (isCourseStarted || lastRealCoords)) recenterMap();
        }

        function toggleParkingScanSheet() {
            document.getElementById('parking-scan-sheet')?.classList.toggle('collapsed');
        }

        // Repli vertical : même principe que _gasScanCollapsedOffset (js/11), mais
        // sans filtres/tris à préserver au-dessus — seuls l'en-tête et le curseur
        // de rayon restent visibles feuille repliée.
        function _parkingScanCollapsedOffset() {
            const sheet  = document.getElementById('parking-scan-sheet');
            const head   = document.getElementById('parking-scan-head');
            const radius = document.getElementById('parking-scan-radius-row');
            if (!sheet || !head) return 0;
            const list     = document.getElementById('parking-scan-list');
            const sheetTop = sheet.getBoundingClientRect().top;
            let visible    = head.offsetHeight;
            const lr = list ? list.getBoundingClientRect() : null;
            if (lr && lr.top > sheetTop) visible = Math.max(visible, (lr.top - sheetTop) + 6);
            if (radius && radius.offsetHeight > 0) {
                visible = Math.max(visible, (radius.getBoundingClientRect().bottom - sheetTop) + 26);
            }
            return Math.max(0, sheet.offsetHeight - visible);
        }

        function _syncParkingScanCollapse() {
            const sheet = document.getElementById('parking-scan-sheet');
            if (!sheet) return;
            sheet.style.setProperty('--parking-scan-collapsed-y', _parkingScanCollapsedOffset() + 'px');
        }

        // Glissement de la feuille par l'en-tête — copie conforme d'initGasScanDrag
        // (js/11) sur les identifiants `parking-scan-*`. Un geste, deux usages : suivi
        // du doigt en direct, et au relâchement un déplacement court vaut tap.
        (function initParkingScanDrag() {
            const sheet = document.getElementById('parking-scan-sheet');
            const head  = document.getElementById('parking-scan-head');
            if (!sheet || !head) return;

            const TAP_TOLERANCE = 6;
            const SNAP_RATIO    = 0.35;
            let dragging = false, startY = 0, startOffset = 0, maxY = 0, curY = 0, travel = 0;

            head.addEventListener('pointerdown', (e) => {
                if (e.target.closest && e.target.closest('#parking-scan-close')) return;
                if (isPanelLandscape()) return;
                if (e.button !== undefined && e.button > 0) return;
                dragging = true; travel = 0;
                startY = e.clientY;
                maxY = _parkingScanCollapsedOffset();
                startOffset = sheet.classList.contains('collapsed') ? maxY : 0;
                curY = startOffset;
                sheet.style.transition = 'none';
                tenterSansBruit(() => head.setPointerCapture(e.pointerId), 'parkingScan/pointerCapture');
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
                sheet.style.transition = '';
                sheet.style.transform  = '';
                if (travel < TAP_TOLERANCE) {
                    toggleParkingScanSheet();
                } else {
                    sheet.classList.toggle('collapsed', curY > maxY * SNAP_RATIO);
                }
            };
            head.addEventListener('pointerup', finish);
            head.addEventListener('pointercancel', finish);

            window.addEventListener('resize', () => {
                if (sheet.classList.contains('open')) _syncParkingScanCollapse();
            });
        })();

        function _renderParkingScanRadiusLabel() {
            const el = document.getElementById('parking-scan-radius-val');
            if (el) el.textContent = (_pkRadiusKm % 1 ? _pkRadiusKm.toFixed(1) : _pkRadiusKm) + ' km';
        }

        function onParkingScanRadiusInput(v) {
            const km = parseFloat(v);
            if (!Number.isFinite(km)) return;
            _pkRadiusKm = km;
            _renderParkingScanRadiusLabel();
            _pkZoneUpdate(_pkAnchor, km);
        }

        function onParkingScanRadiusCommit(v) {
            const km = parseFloat(v);
            if (!Number.isFinite(km)) return;
            _pkRadiusKm = km;
            safeLocalSet('gps_parking_scan_radius', String(km));
            _renderParkingScanRadiusLabel();
            runParkingScan();
        }

        // ── Collecte Overpass : node + way amenity=parking dans le rayon.
        // `out center tags` donne un point unique même pour les parkings dessinés
        // en polygone (way) — comme fetchEVFromOverpass (js/19), dont ce fetcher
        // est le décalque pour les parkings.
        async function _pkFetchRaw(lng, lat, radiusKm) {
            /* BBOX, PAS `around:` — c'est la forme employée par fetchEVFromOverpass
               (js/19) et celle que recommande AGENTS.md. `around:` impose au serveur un
               calcul de distance objet par objet en plus de la lecture de l'index
               spatial ; la bbox tape directement dans l'index. Le carré déborde le
               disque d'environ un quart, mais _pkParse retaille au vrai rayon avec turf
               juste après : ce qui s'affiche reste exactement le cercle dessiné. */
            const dLat = radiusKm / 111.32;
            const dLng = radiusKm / (111.32 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
            const bbox = `${(lat - dLat).toFixed(4)},${(lng - dLng).toFixed(4)},${(lat + dLat).toFixed(4)},${(lng + dLng).toFixed(4)}`;
            /* LE TRI DES PARKINGS PRIVÉS SE FAIT SUR LE SERVEUR, PAS ICI. _pkParse
               écarte `access=private|no` — mais il le faisait APRÈS les avoir tous
               rapatriés, alors qu'en ville ils forment une grosse part des objets
               `amenity=parking` (garages de résidence, cours d'immeuble). Le serveur
               les sérialisait pour rien et le réseau les transportait pour rien : à
               2,5 km dans Paris, les quatre miroirs rendaient 504 ou dépassaient le
               budget de 20 s avant d'avoir fini.
               Deux inégalités exactes plutôt qu'un `!~"^(private|no)$"` : AGENTS.md
               proscrit la regex, qui force Overpass à parcourir tous les objets
               portant la clé au lieu d'attaquer l'index clé/valeur.
               ⚠ Une inégalité Overpass est VRAIE quand le tag est ABSENT — les
               parkings sans `access` sont donc conservés, exactement comme le fait
               _pkParse, qui reste en filet de sécurité côté client. */
            const query = `[out:json][timeout:20];nwr["amenity"="parking"]["access"!="private"]["access"!="no"](${bbox});out center tags;`;
            /* ⚠ PAS DE `catch (e) { return []; }` ICI. Un miroir Overpass en échec
               (504, timeout, CORS) rendait alors une liste vide INDISCERNABLE d'un
               vrai « zéro parking » : la feuille annonçait « Aucun parking recensé
               dans 2.5 km » en plein Courbevoie, et — pire — runParkingScan mettait
               ce vide en cache pour 2 min, si bien que les scans suivants répétaient
               la même contre-vérité sans retoucher le réseau. On laisse remonter :
               le `catch` de runParkingScan affiche « Recherche impossible », journalise
               la cause, et n'écrit RIEN dans le cache — le scan suivant retente. */
            const data = await _fetchOverpassHedged(query);
            return data?.elements || [];
        }

        function _pkParse(elements, anchor, radiusKm) {
            const from = turf.point(anchor);
            const out = [], seen = new Set();
            elements.forEach(el => {
                const tags = el.tags || {};
                // Un parking privé (résidence, entreprise) n'est d'aucune utilité
                // ici : on ne propose que ce qui est réellement accessible.
                const access = (tags.access || '').toLowerCase();
                if (access === 'private' || access === 'no') return;

                const lat = el.center?.lat ?? el.lat;
                const lon = el.center?.lon ?? el.lon;
                if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;

                let distM;
                try { distM = turf.distance(from, turf.point([lon, lat]), { units: 'kilometers' }) * 1000; }
                catch (e) { return; }
                if (distM > radiusKm * 1000) return;

                const key = `${el.type}${el.id}`;
                if (seen.has(key)) return;
                seen.add(key);

                const capacity = /^\d+$/.test(tags.capacity || '') ? parseInt(tags.capacity, 10) : null;
                const fee = tags.fee === 'yes' ? 'payant' : tags.fee === 'no' ? 'gratuit' : null;
                const typeLabel = { underground: 'Souterrain', 'multi-storey': 'Silo', surface: 'Extérieur' }[tags.parking] || null;
                // Adresse complète (rue + commune), pas seulement la rue : c'est le
                // champ le plus attendu de la fiche détail ouverte au clic.
                const rue = tags['addr:street']
                    ? `${tags['addr:housenumber'] || ''} ${tags['addr:street']}`.trim() : '';
                const commune = [tags['addr:postcode'], tags['addr:city'] || tags['addr:town']]
                    .filter(Boolean).join(' ');
                const addr = [rue, commune].filter(Boolean).join(', ');

                // Champs uniquement affichés dans la fiche détail (openParkingInfo) —
                // absents de la carte, qui reste volontairement dense.
                const phone   = tags.phone || tags['contact:phone'] || null;
                const website = tags.website || tags['contact:website'] || null;
                const openingHours = tags.opening_hours || null;

                out.push({
                    lng: lon, lat, name: tags.name || 'Parking',
                    addr, capacity, fee, typeLabel,
                    phone, website, openingHours,
                    distM: Math.round(distM),
                });
            });
            return out;
        }

        // ── ZONE DE RECHERCHE : disque + ondes radar, EN BLEU ────────────────
        // Décalque de la zone du scan stations (js/11, GAS_ZONE_*), en bleu/cyan
        // au lieu d'orange : c'est la teinte de toute la feuille parkings (curseur,
        // chevron, marqueurs), et elle distingue au premier coup d'œil quel scan a
        // dessiné le cercle affiché.
        // Sources/couches DÉDIÉES (PK_* et non GAS_*) : les deux scans sont désormais
        // exclusifs (openParkingScan ferme celui des stations et réciproquement), mais
        // des identifiants propres gardent les deux nettoyages indépendants — fermer
        // l'un ne doit jamais pouvoir effacer la zone de l'autre.
        // Géométrie (_gasScanCircleRing) et FeatureCollection vide (_gasScanEmptyFC)
        // réutilisées telles quelles depuis js/11 : pures fonctions de calcul, sans
        // état propre au scan stations, donc sans raison d'en garder une seconde copie.
        const PK_ZONE_SRC   = 'parking-scan-zone-src';
        const PK_ZONE_FILL  = 'parking-scan-zone-fill';
        const PK_ZONE_EDGE  = 'parking-scan-zone-edge';
        const PK_WAVE_SRC   = 'parking-scan-wave-src';
        const PK_WAVE_LAYER = 'parking-scan-wave-line';
        const PK_WAVE_PERIOD_MS = 5200;
        const PK_WAVE_COUNT     = 3;
        const PK_ZONE_FPS       = 24;

        let _pkZoneRaf = null, _pkZoneLastPaint = 0;

        function _pkZoneEnsure() {
            try {
                if (!map.getSource(PK_ZONE_SRC)) map.addSource(PK_ZONE_SRC, { type: 'geojson', data: _gasScanEmptyFC() });
                if (!map.getSource(PK_WAVE_SRC)) map.addSource(PK_WAVE_SRC, { type: 'geojson', data: _gasScanEmptyFC() });
                if (!map.getLayer(PK_ZONE_FILL)) {
                    map.addLayer({
                        id: PK_ZONE_FILL, type: 'fill', source: PK_ZONE_SRC, slot: 'middle',
                        paint: { 'fill-color': '#26c6da', 'fill-opacity': 0.13, 'fill-emissive-strength': 1 }
                    });
                }
                if (!map.getLayer(PK_ZONE_EDGE)) {
                    map.addLayer({
                        id: PK_ZONE_EDGE, type: 'line', source: PK_ZONE_SRC, slot: 'middle',
                        paint: { 'line-color': '#4dd0e1', 'line-width': 2, 'line-opacity': 0.75, 'line-emissive-strength': 1 }
                    });
                }
                if (!map.getLayer(PK_WAVE_LAYER)) {
                    map.addLayer({
                        id: PK_WAVE_LAYER, type: 'line', source: PK_WAVE_SRC, slot: 'middle',
                        paint: {
                            'line-color': '#80deea', 'line-width': 2,
                            'line-opacity': ['get', 'o'], 'line-emissive-strength': 1
                        }
                    });
                }
            } catch (e) { /* style pas encore prêt : la boucle d'ondes réessaiera */ }
        }

        function _pkZoneUpdate(center, radiusKm) {
            if (!center || !Number.isFinite(radiusKm)) return;
            _pkZoneEnsure();
            const ring = _gasScanCircleRing(center, radiusKm, 96);
            try {
                map.getSource(PK_ZONE_SRC)?.setData({
                    type: 'FeatureCollection',
                    features: [{ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }]
                });
            } catch (e) { /* source absente : réparée au prochain tick */ }
        }

        function _pkZoneStart() {
            if (_pkZoneRaf) return;
            const tick = (now) => {
                _pkZoneRaf = requestAnimationFrame(tick);
                if (now - _pkZoneLastPaint < 1000 / PK_ZONE_FPS) return;
                _pkZoneLastPaint = now;
                if (!_pkAnchor) return;
                // Auto-réparation : applyMapStyle() détruit toutes les sources et
                // couches. Changer de thème pendant un scan effacerait la zone.
                if (!map.getSource(PK_WAVE_SRC) || !map.getLayer(PK_WAVE_LAYER)) {
                    _pkZoneEnsure();
                    _pkZoneUpdate(_pkAnchor, _pkRadiusKm);
                }
                const feats = [];
                for (let i = 0; i < PK_WAVE_COUNT; i++) {
                    const p = ((now / PK_WAVE_PERIOD_MS) + i / PK_WAVE_COUNT) % 1;
                    feats.push({
                        type: 'Feature',
                        properties: { o: (1 - p) * 0.6 },
                        geometry: {
                            type: 'LineString',
                            coordinates: _gasScanCircleRing(_pkAnchor, Math.max(0.02, p * _pkRadiusKm), 64)
                        }
                    });
                }
                try { map.getSource(PK_WAVE_SRC)?.setData({ type: 'FeatureCollection', features: feats }); }
                catch (e) { /* ignoré : réparé au tick suivant */ }
            };
            _pkZoneRaf = requestAnimationFrame(tick);
        }

        function _pkZoneStop() {
            if (_pkZoneRaf) { cancelAnimationFrame(_pkZoneRaf); _pkZoneRaf = null; }
        }

        function _pkZoneRemove() {
            _pkZoneStop();
            [PK_WAVE_LAYER, PK_ZONE_EDGE, PK_ZONE_FILL].forEach(id => {
                tenterSansBruit(() => { if (map.getLayer(id)) map.removeLayer(id); }, 'parkingScan/removeLayer');
            });
            [PK_WAVE_SRC, PK_ZONE_SRC].forEach(id => {
                tenterSansBruit(() => { if (map.getSource(id)) map.removeSource(id); }, 'parkingScan/removeSource');
            });
        }

        async function runParkingScan() {
            const status = document.getElementById('parking-scan-status');
            const list   = document.getElementById('parking-scan-list');
            if (!status || !list) return;
            if (_pkBusy) return;

            if (!navigator.onLine) {
                status.textContent = '📵 Hors ligne — parkings indisponibles';
                list.innerHTML = '';
                _clearParkingScanMarkers();
                return;
            }

            _pkBusy = true;
            try {
                // L'ancre est relue à chaque scan : le conducteur a pu avancer depuis
                // l'ouverture de la feuille, la zone suit (même règle que runGasScan).
                _pkAnchor = _gasScanAnchorPoint();
                _pkZoneUpdate(_pkAnchor, _pkRadiusKm);
                const now = Date.now();
                list.innerHTML = '';
                _clearParkingScanMarkers();

                let raw;
                if (_pkCacheCouvre(_pkAnchor, _pkRadiusKm, now)) {
                    raw = _pkCache.raw;
                } else {
                    status.textContent = `🔄 Recherche dans un rayon de ${_pkRadiusKm} km…`;
                    raw = await _pkFetchRaw(_pkAnchor[0], _pkAnchor[1], _pkRadiusKm);
                    _pkCache = { anchor: _pkAnchor, radiusKm: _pkRadiusKm, ts: now, raw };
                }
                _pkStations = _pkParse(raw, _pkAnchor, _pkRadiusKm)
                    .sort((a, b) => a.distM - b.distM);

                _renderParkingScan();
                _fitMapToParkingScan();
            } catch (e) {
                /* La cause détaillée part dans le journal, PAS dans la feuille :
                   « overpass.private.coffee: Failed to fetch | kumi.systems: … » sur
                   quatre miroirs remplissait trois lignes d'un texte qui ne dit rien
                   au conducteur et cachait la liste. Ce qu'il peut faire, lui, c'est
                   réessayer — c'est donc ça que le message dit. Le détail reste
                   consultable dans gps_error_log (voir AGENTS.md). */
                logAppError('runParkingScan', e);
                status.textContent = '⚠️ Recherche indisponible — réessayez dans un instant';
            } finally {
                _pkBusy = false;
            }
        }

        /* Pastilles Gratuit / Payant — mêmes classes que les filtres du scan stations
           (_scanChip, js/11), avec le compte en libellé. Ce compte n'est pas une
           décoration : OSM ne porte le tag `fee` que sur une partie des parkings, si
           bien qu'un filtre peut retirer beaucoup plus d'entrées qu'on ne s'y attend.
           Une pastille dont le compte est nul est DÉSACTIVÉE plutôt que masquée —
           masquer ferait sauter la mise en page d'un scan à l'autre, et l'absence
           d'information est elle-même une réponse utile. */
        function _renderParkingScanFees() {
            const box = document.getElementById('parking-scan-fees');
            if (!box) return;
            const nGratuit = _pkStations.filter(s => s.fee === 'gratuit').length;
            const nPayant  = _pkStations.filter(s => s.fee === 'payant').length;

            /* Normaliser l'état AVANT de construire, jamais après (même règle que
               _renderGasScanModes, js/11) : un filtre retenu d'un scan précédent peut
               ne plus rien désigner ici — la pastille serait à la fois active et
               désactivée, sur une liste vide que rien n'expliquerait. */
            if (_pkFee === 'gratuit' && nGratuit === 0) _pkFee = null;
            if (_pkFee === 'payant'  && nPayant  === 0) _pkFee = null;

            box.innerHTML = '';
            [['gratuit', `🆓 Gratuit ${nGratuit}`, nGratuit],
             ['payant',  `💶 Payant ${nPayant}`,   nPayant]].forEach(([cle, label, n]) => {
                const chip = _scanChip(label, _pkFee === cle, () => setParkingScanFee(cle), 'fee-' + cle);
                chip.disabled = n === 0;
                box.appendChild(chip);
            });
        }

        // Second clic sur la pastille active = retour à « tous ». Sans cette bascule,
        // deux boutons exclusifs n'offriraient plus aucun moyen de RETIRER le filtre,
        // faute d'une troisième pastille « Tous » dont la feuille se passe très bien.
        function setParkingScanFee(cle) {
            _pkFee = (_pkFee === cle) ? null : cle;
            _renderParkingScan();
        }

        function _renderParkingScan() {
            const list   = document.getElementById('parking-scan-list');
            const status = document.getElementById('parking-scan-status');
            if (!list) return;

            _renderParkingScanFees();
            const retenus = _pkFee ? _pkStations.filter(s => s.fee === _pkFee) : _pkStations;
            _pkShown = retenus.slice(0, PK_SCAN_MAX_CARDS);
            list.innerHTML = '';

            if (status) {
                // Le total annoncé est celui du filtre en cours, jamais celui de la
                // bulle entière : afficher « 169 parkings » sous un filtre qui n'en
                // retient que 8 ferait lire les deux chiffres comme contradictoires.
                const suffixe = _pkFee === 'gratuit' ? ' gratuits' : _pkFee === 'payant' ? ' payants' : '';
                status.textContent = _pkShown.length
                    ? `${retenus.length} parking${retenus.length > 1 ? 's' : ''}${suffixe} dans ${_pkRadiusKm} km`
                      + (retenus.length > _pkShown.length ? ` — ${_pkShown.length} affichés` : '')
                      + ' · capacité totale, pas de disponibilité en direct'
                    : _pkFee
                        ? `Aucun parking${suffixe} recensé dans ${_pkRadiusKm} km`
                        : `Aucun parking recensé dans ${_pkRadiusKm} km`;
            }

            _pkShown.forEach((s, i) => {
                const card = document.createElement('div');
                card.className = 'gas-station-card';
                card.id = 'parking-scan-card-' + i;
                card.innerHTML = _pkCardHtml(s);
                card.addEventListener('click', () => { focusParkingScanStation(i); openParkingInfo(_pkShown[i]); });
                list.appendChild(card);
            });

            _renderParkingScanMarkers();
            _syncParkingScanCollapse();
        }

        function _pkCardHtml(s) {
            const capTxt = s.capacity ? `${s.capacity} places` : 'Capacité inconnue';
            const feeTxt = s.fee === 'payant' ? '💶 Payant' : s.fee === 'gratuit' ? '🆓 Gratuit' : '';
            const km = s.distM / 1000;
            const distTxt = km < 1 ? s.distM + ' m' : km.toFixed(1).replace('.', ',') + ' km';
            const sousTitre = [s.typeLabel, s.addr].filter(Boolean).join(' · ') || '—';
            return `
                <div class="gas-card-icon">🅿️</div>
                <div class="gas-card-info">
                    <div class="gas-card-name">${s.name}</div>
                    <div class="gas-card-addr">${sousTitre}</div>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
                    <span class="gas-price-pill" style="background:rgba(38,198,218,0.12);color:#26c6da;border-color:rgba(38,198,218,0.35);">${capTxt}</span>
                    ${feeTxt ? `<span style="font-size:9px;color:#6b7785;">${feeTxt}</span>` : ''}
                    <div class="gas-card-dist">${distTxt}</div>
                </div>`;
        }

        function _clearParkingScanMarkers() {
            _pkMarkers.forEach(m => tenterSansBruit(() => m.remove(), 'parkingScan/removeMarker'));
            _pkMarkers = [];
        }

        function _renderParkingScanMarkers() {
            _clearParkingScanMarkers();
            _pkShown.forEach((s, i) => {
                if (!isLngLat([s.lng, s.lat])) return;
                const el = document.createElement('div');
                el.style.cssText = 'display:flex;align-items:center;gap:3px;padding:3px 7px;border-radius:999px;'
                    + 'background:rgba(10,14,23,0.92);border:1px solid rgba(38,198,218,0.55);color:#26c6da;'
                    + 'font-size:11px;font-weight:800;white-space:nowrap;cursor:pointer;'
                    + 'box-shadow:0 2px 10px rgba(0,0,0,0.6);';
                el.innerHTML = '🅿️' + (s.capacity ? ' ' + s.capacity : '');
                // Même repère que les pastilles stations (js/11) : évite que la
                // hotbox générale s'ouvre en plus au même appui long sur la carte.
                el.dataset.gasStation = '1';
                el.addEventListener('click', (ev) => { ev.stopPropagation(); focusParkingScanStation(i); openParkingInfo(_pkShown[i]); });
                const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                    .setLngLat([s.lng, s.lat]).addTo(map);
                _pkMarkers.push(marker);
            });
        }

        // padding/offset en pixels du CANEVAS, jamais de window — même règle que
        // _gasScanPadding() (js/11), dont ceci est le décalque pour cette feuille :
        // sans lui, flyTo() centre sur TOUT le canevas, y compris la moitié basse
        // recouverte par la feuille, et le marqueur ressort collé au bord supérieur
        // de la bande de carte réellement visible plutôt qu'en son centre.
        function _pkScanPadding() {
            const pad = { top: 60, right: 40, bottom: 200, left: 40 };
            const sheet = document.getElementById('parking-scan-sheet');
            const mapEl = map.getContainer();
            if (!sheet || !mapEl) return pad;
            const m = mapEl.getBoundingClientRect();
            if (m.height <= 0 || sheet.offsetHeight <= 0) return pad;

            if (isPanelLandscape()) {
                pad.left   = Math.max(0, Math.min(sheet.offsetWidth + 20, m.width - 80));
                pad.bottom = 40;
                return pad;
            }

            const visibleH = sheet.classList.contains('collapsed')
                ? Math.max(0, sheet.offsetHeight - _parkingScanCollapsedOffset())
                : sheet.offsetHeight;

            const MIN_MAP_BAND = 150;
            const maxBottom = Math.max(40, m.height - pad.top - MIN_MAP_BAND);
            pad.bottom = Math.min(getBottomBarsH() + visibleH + 20, maxBottom);
            return pad;
        }

        /* Auto-zoom d'ouverture — décalque de _fitMapToGasScan() (js/11), mêmes
           trois précautions, pour les mêmes raisons expliquées là-bas :
             1. détacher la caméra du suivi GPS, sinon le fix suivant annule le cadrage ;
             2. remettre le padding caméra à zéro AVANT fitBounds, qui ADDITIONNE le
                padding rémanent posé par updateDynamicZoom() — sans quoi Mapbox renonce
                au cadrage par un simple warnOnce, sans exception, et rien ne bouge ;
             3. cadrer sur le CERCLE et non sur les parkings trouvés, pour que le zoom
                suive le rayon demandé et reste cohérent avec la zone dessinée.
           Le bloc d'état est dans son propre try : une erreur de comptabilité ne doit
           pas emporter la commande caméra. */
        function _fitMapToParkingScan() {
            if (!_pkAnchor) return;
            try {
                if (lastRealCoords || isCourseStarted) {
                    isUserPanning = true;
                    showRecenterBtn(true);
                    if (userPanningResumeTimer) { clearTimeout(userPanningResumeTimer); userPanningResumeTimer = null; }
                }
            } catch (e) {
                logAppError('_fitMapToParkingScan/détachement caméra', e);
            }

            tenterSansBruit(() => map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 }),
                            '_fitMapToParkingScan/resetPadding');

            try {
                map.fitBounds(_gasScanCircleBounds(_pkAnchor, _pkRadiusKm), {
                    padding: _pkScanPadding(), maxZoom: 16, duration: 800
                });
            } catch (e) {
                logAppError('_fitMapToParkingScan', e);
            }
        }

        function focusParkingScanStation(i) {
            const s = _pkShown[i];
            if (!s || !isLngLat([s.lng, s.lat])) return;
            document.querySelectorAll('#parking-scan-list .gas-station-card')
                .forEach((c, k) => c.classList.toggle('focused', k === i));
            map.flyTo({
                center: [s.lng, s.lat],
                zoom: Math.max(map.getZoom(), 15),
                duration: 600,
                padding: _pkScanPadding(),
            });
        }

        // ── FICHE DÉTAIL D'UN PARKING ────────────────────────────────────────
        // La construction ligne par ligne (_scanInfoRow) est PARTAGÉE avec la
        // fiche station/borne — voir js/11, chargé avant ce fichier.
        function openParkingInfo(s) {
            const overlay = document.getElementById('parking-info-overlay');
            if (!overlay || !s) return;
            _pkInfoCurrent = s;   // voir _pkInfoGoClicked()

            const myToken = ++_pkInfoToken;
            document.getElementById('parking-info-name').textContent = s.name || 'Parking';
            const addrEl = document.getElementById('parking-info-addr');
            if (s.addr) {
                addrEl.textContent = s.addr;
            } else {
                // OSM ne porte pas toujours addr:street — la position, elle, est
                // toujours connue : Mapbox sait retrouver numéro et rue à partir des
                // seules coordonnées (reverseGeocodeToAddress, déjà utilisée pour le
                // GPS et les favoris domicile/travail, js/14).
                addrEl.textContent = 'Recherche de l’adresse…';
                reverseGeocodeToAddress(s.lat, s.lng).then(label => {
                    if (myToken !== _pkInfoToken) return;   // une autre fiche est ouverte depuis
                    s.addr = label || null;                 // mémorisé : pas de nouvel appel si rouverte
                    addrEl.textContent = label || 'Adresse introuvable';
                });
            }

            const rows = document.getElementById('parking-info-rows');
            rows.innerHTML = '';

            // Un statut connu (payant/gratuit) vaut la peine d'être affiché ; une
            // absence de tag ne vaut RIEN d'utile au conducteur — mieux vaut omettre
            // la ligne que d'écrire « Tarif inconnu », qui n'aide en rien.
            if (s.fee === 'payant') rows.appendChild(_scanInfoRow('💶', 'Payant'));
            else if (s.fee === 'gratuit') rows.appendChild(_scanInfoRow('🆓', 'Gratuit'));

            const place = [s.capacity ? `${s.capacity} places` : null, s.typeLabel].filter(Boolean).join(' · ');
            if (place) rows.appendChild(_scanInfoRow('🅿️', place));

            if (s.openingHours) rows.appendChild(_scanInfoRow('🕐', s.openingHours));

            if (s.phone) {
                const a = document.createElement('a');
                a.href = 'tel:' + s.phone.replace(/[^\d+]/g, '');
                a.textContent = s.phone;
                rows.appendChild(_scanInfoRow('📞', a));
            }

            if (s.website) {
                // Un `href` construit depuis un tag OSM DOIT être validé avant d'être
                // posé : sans ce filtre de protocole, un tag malveillant pourrait
                // glisser un lien `javascript:` cliquable dans la fiche.
                let url = s.website.trim();
                if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
                try {
                    const u = new URL(url);
                    if (u.protocol === 'http:' || u.protocol === 'https:') {
                        const a = document.createElement('a');
                        a.href = u.href;
                        a.target = '_blank';
                        a.rel = 'noopener noreferrer';
                        a.textContent = s.website;
                        rows.appendChild(_scanInfoRow('🌐', a));
                    }
                } catch (e) { /* URL inexploitable : on ignore silencieusement */ }
            }

            overlay.classList.add('open');
        }

        function closeParkingInfo() {
            document.getElementById('parking-info-overlay')?.classList.remove('open');
            _pkInfoCurrent = null;
        }

        /* « J'y vais » — décalque de _gasGoToStation() (js/11) : un parking EST une
           destination possible au même titre qu'une station. Pas d'équivalent
           _destIsChosenStation() ici, cette comparaison ne sert qu'à masquer les
           suggestions de stations sur le trajet quand la destination EN EST une —
           une notion propre aux stations, sans utilité côté parking. */
        function _pkGoToParking(s) {
            if (!s || !isLngLat([s.lng, s.lat])) return;
            const label = s.name || s.addr || 'Parking';

            // Fermeture sans recentrage : la suite du parcours pose son propre
            // cadrage (recalcul d'itinéraire ou aperçu du modal), un recentrage
            // intercalé ne ferait que secouer la caméra au passage.
            closeParkingScan({ keepCamera: true });

            if (isCourseStarted) {
                _navSearchMode = 'dest';
                applyNavSearchSelection([s.lng, s.lat], label);
                // Le scan avait détaché la caméra (isUserPanning) pour montrer la
                // vue d'ensemble. Sans ce retour, le conducteur repartirait avec une
                // carte figée sur la zone de recherche au lieu de le suivre.
                recenterMap();
                return;
            }

            // À l'arrêt : même parcours qu'un point choisi sur la carte, suivi du
            // bouton Démarrer (voir _gasGoToStation, js/11).
            exactEndCoords = [s.lng, s.lat];
            if (endTempMarker) endTempMarker.remove();
            endTempMarker = addEmojiMarker(s.lng, s.lat, '🔴');
            const input = document.getElementById('end-addr');
            if (input) input.value = label;
            updateFavPhoneUI('');
            setFavDropdownLabel(null);
            handleStartClick();
        }

        function _pkInfoGoClicked() {
            const s = _pkInfoCurrent;
            closeParkingInfo();
            if (s) _pkGoToParking(s);
        }

        /* ── VEILLE SILENCIEUSE ──────────────────────────────────────────────
           Rafraîchit le cache même feuille fermée, pour que la prochaine ouverture
           trouve un résultat déjà prêt (cf. openParkingScan() → runParkingScan(),
           qui rend instantanément dès que _pkCacheCouvre() répond oui).
           Ne s'exécute que si un vrai fix GPS existe : sans lui, l'ancre retomberait
           sur le centre de carte, ce qui préchargerait un endroit arbitraire.

           ⚠ ARMÉE PAR LE PREMIER USAGE, PAS PAR LE CHARGEMENT DE LA PAGE. Tant que le
           scan parkings n'a jamais été ouvert, la veille tirait quand même une requête
           Overpass complète toutes les deux minutes, pendant toute la session, pour un
           panneau que le conducteur n'ouvrirait peut-être jamais. En ville, cette
           requête est lourde (plusieurs centaines de parkings) et les miroirs publics
           finissaient par la refuser — le refus revenant en `Failed to fetch`, faute
           d'en-têtes CORS sur la réponse d'erreur, donc impossible à distinguer d'une
           panne réseau. Le vrai scan, lui, retombait alors sur les mêmes miroirs déjà
           fâchés. Précharger n'a de sens que pour qui s'est servi de la feuille. */
        let _pkVeilleArmee = false;

        function _pkPrefetchTick() {
            if (!_pkVeilleArmee) return;
            if (!navigator.onLine || !lastRealCoords) return;
            if (_pkBusy) return;
            if (_gasScanBlocked()) return;   // aperçu de trajet : pas la priorité
            if (document.getElementById('parking-scan-sheet')?.classList.contains('open')) return;

            const anchor = normalizeLngLat(lastRealCoords);
            if (!anchor || !isLngLat(anchor)) return;
            if (_pkCacheCouvre(anchor, _pkRadiusKm, Date.now())) return;

            _pkFetchRaw(anchor[0], anchor[1], _pkRadiusKm)
                .then(raw => { _pkCache = { anchor, radiusKm: _pkRadiusKm, ts: Date.now(), raw }; })
                .catch(() => { /* silencieux : la prochaine ouverture retentera */ });
        }
        setInterval(_pkPrefetchTick, PK_PREFETCH_MS);

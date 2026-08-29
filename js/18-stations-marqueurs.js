        // === MARQUEURS STATIONS : mapboxgl.Marker avec grisage CSS ===
        const GAS_SOURCE_ID  = 'gas-stations-source';   // gardé pour compat clearGasStationMarkers
        const GAS_LAYER_ID   = 'gas-stations-layer';
        const GAS_LAYER_SEL  = 'gas-stations-layer-selected';
        const EV_SOURCE_ID   = 'ev-stations-source';
        const EV_LAYER_ID    = 'ev-stations-layer';
        const EV_LAYER_SEL   = 'ev-stations-layer-selected';

        function _ensureGasLayers() { /* plus utilisé */ }
        function _applyGasSelectionOpacity() { /* géré via _flushGasMarkers */ }

        let _gasStationsGeoData = [];
        let _evStationsGeoData  = [];
        // Marqueurs DOM actifs
        let _gasMarkerEls = [];   // { marker, el, lng, lat }
        let _evMarkerEls  = [];

        function _buildGeoJSON() { return null; } // inutilisé

        function clearGasStationMarkers() {
            _gasMarkerEls.forEach(m => m.marker.remove());
            _gasMarkerEls = [];
            _evMarkerEls.forEach(m => m.marker.remove());
            _evMarkerEls = [];
            _gasStationsGeoData = [];
            _evStationsGeoData  = [];
            gasStationMarkers   = [];
        }

        function addGasStationMarker(lng, lat, isSelected, stationRef) {
            // Stocker la référence complète pour accéder à _resolvedLng/_resolvedLat
            _gasStationsGeoData.push(stationRef || { lng, lat });
        }

        /* Pastille de prix commune aux marqueurs de trajet et au scan « autour de
           moi » (voir _renderGasScanMarkers). Même gabarit, seuls la teinte et
           les états sélection / estompage varient : deux styles différents pour
           le même objet obligeaient le conducteur à réapprendre la carte en
           passant d'un mode à l'autre. */
        function _makeStationPriceEl({ label, selected, dimmed, accent }) {
            const isEv = accent === 'ev';
            const teinte = selected
                ? (isEv ? 'border:1.5px solid #fff;color:#cfe6ff;background:rgba(26,107,191,0.95);'
                        : 'border:1.5px solid #fff;color:#ffd08a;background:rgba(120,60,0,0.95);')
                : (isEv ? 'border:1px solid rgba(77,163,255,0.6);color:#6cb6ff;background:rgba(10,14,23,0.92);'
                        : 'border:1px solid rgba(255,160,0,0.55);color:#ffa500;background:rgba(10,14,23,0.92);');
            const el = document.createElement('div');
            el.style.cssText = 'display:flex;align-items:center;gap:3px;padding:3px 7px;border-radius:999px;'
                + teinte
                + 'font-size:11px;font-weight:800;white-space:nowrap;cursor:pointer;'
                + 'box-shadow:0 2px 10px rgba(0,0,0,0.6);'
                + (selected ? 'transform:scale(1.15);' : '')
                + (dimmed ? 'opacity:0.35;' : 'opacity:1;')
                + 'transition:opacity 0.2s,transform 0.2s;';
            el.textContent = label;
            // Même repère que dans le scan : sans lui, un appui sur la pastille
            // armerait aussi la hotbox générale de la carte.
            el.dataset.gasStation = '1';
            return el;
        }

        // Prix affiché sur la pastille, dans le carburant choisi ; « — » quand la
        // station n'en publie aucun (elle reste visible, c'est un repère utile).
        function _gasMarkerPriceText(s) {
            const price = getEffectivePrice(s, selectedFuelType || 'sp95');
            return price != null ? price.toFixed(2) : '—';
        }

        function _flushGasMarkers() {
            _gasMarkerEls.forEach(m => m.marker.remove());
            _gasMarkerEls = [];
            const sel = selectedGasStation;
            const hasSel = !!sel;
            _gasStationsGeoData.forEach(s => {
                const isSel = hasSel &&
                    Math.abs(s.lng - sel.lng) < 0.0001 &&
                    Math.abs(s.lat - sel.lat) < 0.0001;
                /* Position d'affichage = celle ARBITRÉE par _gasPickBestPoint().
                   `_resolvedLng` n'est renseigné que si le géocodeur a réellement
                   localisé le numéro ou l'établissement ; dans ce cas il vaut mieux que
                   la source, qui peut être franchement fausse (station tombée dans un
                   parc). S'il a seulement interpolé le long de la rue, il reste nul et
                   on garde la source. Voir le bloc GAS_GEO_TRUSTED_ACCURACY. */
                const mLng = s._resolvedLng ?? s.lng;
                const mLat = s._resolvedLat ?? s.lat;
                // Même pastille que le scan « autour de moi » : le prix se lit
                // directement sur la carte, sans passer par la liste.
                const el = _makeStationPriceEl({
                    label: '⛽ ' + _gasMarkerPriceText(s),
                    selected: isSel,
                    dimmed: hasSel && !isSel,
                    accent: 'gas',
                });

                // Tap sur la pastille = sélection / désélection de la station.
                // On retrouve l'objet complet dans _allGasStations par coordonnées
                // pour avoir accès à tous les champs (_idx, prix, etc.).
                el.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const full = _allGasStations.find(st =>
                        Math.abs(st.lng - s.lng) < 0.0001 &&
                        Math.abs(st.lat - s.lat) < 0.0001
                    ) || s;
                    selectGasStation(full);
                });

                // Respecte un masquage en cours : ce flush est rejoué à chaque sélection ou
                // changement de carburant, il ne doit pas rendre les stations au passage.
                if (_stationsHidden) el.style.display = 'none';

                const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                    .setLngLat([mLng, mLat]).addTo(map);
                _gasMarkerEls.push({ marker, el, lng: s.lng, lat: s.lat });
            });
        }

        function _flushEVMarkers() {
            _evMarkerEls.forEach(m => m.marker.remove());
            _evMarkerEls = [];
            const sel = selectedGasStation;
            const hasSel = !!sel;
            _evStationsGeoData.forEach(s => {
                const isSel = hasSel &&
                    Math.abs(s.lng - sel.lng) < 0.0001 &&
                    Math.abs(s.lat - sel.lat) < 0.0001;
                const el = _makeStationPriceEl({
                    label: s.power ? '⚡ ' + s.power + ' kW' : '⚡',
                    selected: isSel,
                    dimmed: hasSel && !isSel,
                    accent: 'ev',
                });
                if (_stationsHidden) el.style.display = 'none';   // voir _flushGasMarkers
                const marker = new mapboxgl.Marker({ element: el, anchor: 'bottom' })
                    .setLngLat([s.lng, s.lat]).addTo(map);
                _evMarkerEls.push({ marker, el, lng: s.lng, lat: s.lat });
            });
        }

        function updateGasStationMarkersStyle() {
            _flushGasMarkers();
            _flushEVMarkers();
        }

        /* ═══ MASQUAGE DES STATIONS SUR LA CARTE (entrée hotbox) ═══

           Sur un aperçu de trajet urbain, les pastilles de prix se chevauchent au point de
           recouvrir le tracé et les deux points qui comptent le plus — départ et arrivée.
           Cette bascule les efface le temps de regarder la carte.

           ⚠ ON MASQUE, ON NE SUPPRIME PAS. `display:none` sur l'élément du marqueur, jamais
           `marker.remove()` : les marqueurs portent la sélection de station (`selectGasStation`),
           l'itinéraire dévié vers elle et les écouteurs de clic. Les retirer imposerait de
           tout reconstruire au réaffichage — et de retrouver un état de sélection que rien
           n'aurait conservé. Mapbox continue de leur appliquer sa transformation de position
           pendant le masquage ; ils réapparaissent au bon endroit sans recalcul.

           ⚠ LES TROIS FAMILLES DE MARQUEURS SONT CONCERNÉES, sans quoi la bascule mentirait :
           carburant de trajet, bornes de trajet (js/18) ET résultats du scan « autour de moi »
           (`_scanMarkers`, js/11). Un utilisateur ne distingue pas leur provenance — il voit
           « des stations sur la carte », et « masquer » doit toutes les concerner. */
        function _allStationMarkerEls() {
            const els = [];
            _gasMarkerEls.forEach(m => { if (m.el) els.push(m.el); });
            _evMarkerEls.forEach(m => { if (m.el) els.push(m.el); });
            // Le scan ne conserve que les marqueurs, pas leurs éléments : on les redemande.
            _scanMarkers.forEach(m => {
                const el = tenterSansBruit(() => m.getElement(), 'stations/getElement');
                if (el) els.push(el);
            });
            return els;
        }

        /* Appliquée à la fois par la bascule ET à la création de chaque marqueur (voir
           `_flushGasMarkers`, `_flushEVMarkers`, `_renderGasScanMarkers`) : ces trois
           fonctions reconstruisent leurs éléments à chaque rafraîchissement — changement de
           carburant, sélection, nouveau scan. Sans le rappel à la création, un simple
           changement de prix ferait réapparaître des stations que l'utilisateur a masquées. */
        function applyStationsVisibility() {
            _allStationMarkerEls().forEach(el => { el.style.display = _stationsHidden ? 'none' : ''; });
        }

        function toggleStationsVisibility() {
            _stationsHidden = !_stationsHidden;
            applyStationsVisibility();
        }

        // Sauvegarde de l'itinéraire de base (sans station) pour pouvoir y revenir
        let _baseRouteForGas = null; // { osrmData, coords, distKm, durationH }
        let _gasStationsPanelOpen = false; // panneau stations fermé par défaut

        /* ═══════════════════════════════════════════════════════════════════════════
           HYBRIDE : LES DEUX RÉSEAUX DANS LE PANNEAU DU TRAJET   (22/08/2026)
           ═══════════════════════════════════════════════════════════════════════════

           Le panneau ne connaissait que deux régimes, `type === 'electrique'` ou non :
           un hybride rechargeable n'y voyait donc QUE des pompes, alors que le scan
           « autour de moi » (js/11) lui montrait déjà les deux réseaux. Même véhicule,
           deux réponses différentes selon l'écran — c'est cet écart qu'on referme ici.

           ⚠ LE MODE VIENT DE `_scanVehicleMode()` (js/11), PAS D'UNE SECONDE LECTURE DE
           LA CONFIG. Les deux écrans doivent répondre « both » au même instant ; deux
           interprétations du même réglage divergeraient au premier ajout de type.

           ⚠ TROIS RENDUS, PAS UN TROISIÈME RENDERER. « ⛽ » et « ⚡ » rejouent tels quels
           `buildGasStationsUI()` / `buildEVStationsUI()` ; « Tous » = le rendu carburant,
           puis les bornes AJOUTÉES dessous par `_appendMixedEvCards()`. Fusionner les deux
           en une seule liste triée aurait demandé un troisième gabarit de carte et un
           troisième chemin de détour, là où renderGasCards() se rappelle déjà lui-même
           (remplacement des stations hors budget) — l'appendice est rejoué à la fin de
           CHAQUE passage de renderGasCards(), il survit donc à ces re-rendus. */
        let _gasPanelKind     = 'all';   // 'all' | 'gas' | 'ev' — hybride uniquement
        let _mixedGasStations = [];      // dernier relevé carburant, en hybride
        let _mixedEvStations  = [];      // dernier relevé bornes, en hybride
        // Trois bornes sous les pompes : au-delà, la liste demande de défiler avant
        // même d'avoir vu la première pompe. Le filtre « ⚡ » donne la liste complète.
        const MIXED_EV_CARDS  = 3;

        function _panelIsMixed() {
            return tenterSansBruit(() => _scanVehicleMode() === 'both', 'stations/mode') === true;
        }

        /* Premier étage de filtre, hybride seulement — même trio que le scan. Injecté
           au-dessus de `#gas-fuel-selector` plutôt que posé dans index.html : il n'a
           aucune raison d'exister pour les deux autres types de véhicule, et un bloc
           masqué en permanence finit toujours par se retrouver visible par accident. */
        function _renderPanelKindChips() {
            const selector = document.getElementById('gas-fuel-selector');
            let box = document.getElementById('gas-kind-selector');
            if (!_panelIsMixed()) { if (box) box.remove(); return; }
            if (!selector) return;
            if (!box) {
                box = document.createElement('div');
                box.id = 'gas-kind-selector';
                box.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;';
                selector.before(box);
            }
            box.innerHTML = '';
            const chip = (label, kind, extra) => {
                const b = document.createElement('button');
                b.className = 'gas-fuel-btn' + (extra ? ' ' + extra : '')
                            + (_gasPanelKind === kind ? ' active' : '');
                b.textContent = label;
                b.onclick = () => setGasPanelKind(kind);
                return b;
            };
            box.appendChild(chip('Tous', 'all'));
            box.appendChild(chip(`⛽ ${_mixedGasStations.length}`, 'gas'));
            // `ev` porte le bleu bornes (voir css/styles.css) — deux pastilles orange
            // côte à côte ne diraient pas de quel réseau elles parlent.
            box.appendChild(chip(`⚡ ${_mixedEvStations.length}`, 'ev', 'ev'));
        }

        /* Appelée au changement de type de véhicule (js/15) : le filtre ⛽/⚡ retenu
           décrivait l'ancien véhicule. Sans ce retour à « Tous », repasser en hybride
           après un détour par thermique rouvrait le panneau sur les seules bornes. */
        function resetGasPanelKind() { _gasPanelKind = 'all'; }

        function setGasPanelKind(kind) {
            _gasPanelKind = kind;
            /* La sélection tombe avec le filtre : garder une borne sélectionnée en
               passant sur « ⛽ » laisserait un détour actif vers un point qui n'est plus
               dans la liste, sans aucun moyen de le désélectionner. */
            if (selectedGasStation) deselectGasStation();
            _renderMixedPanel();
        }

        function _renderMixedPanel() {
            const titre = document.getElementById('gas-section-title');
            if (titre) {
                titre.textContent = _gasPanelKind === 'ev' ? 'Bornes sur le trajet'
                                  : _gasPanelKind === 'gas' ? 'Stations sur le trajet'
                                  : 'Stations et bornes';
            }
            if (_gasPanelKind === 'ev') {
                /* buildEVStationsUI() ne nettoie QUE les marqueurs de bornes : sans ce
                   coup de balai, les pastilles de prix du rendu « Tous » resteraient sur
                   la carte alors que la liste ne montre plus que des bornes. */
                clearGasStationMarkers();
                buildEVStationsUI(_mixedEvStations);
                _renderPanelKindChips();   // buildEVConnectorSelector a réécrit la ligne du dessous
                return;
            }
            // « Tous » et « ⛽ » passent par le rendu carburant ; l'appendice ⚡ ne se
            // pose qu'en « Tous », il est décidé dans _appendMixedEvCards().
            buildGasStationsUI(_mixedGasStations);
            _renderPanelKindChips();
        }

        /* Appendice ⚡ du mode « Tous ». Appelé à la FIN de chaque rendu carburant —
           y compris ses re-rendus internes — et donc jamais recopié dans les appelants. */
        function _appendMixedEvCards() {
            if (!_panelIsMixed() || _gasPanelKind !== 'all') return;
            /* Tri sur une COPIE, dans l'ordre du trajet — le même que celui de
               buildEVStationsUI(). `parseEVStations()` rend les bornes dans l'ordre
               d'Overpass, qui n'a aucun sens pour un conducteur : sans ce tri, les trois
               bornes montrées ici pouvaient être trois bornes de fin de parcours. */
            const bornes = dedupeEVByCluster(
                [..._mixedEvStations].sort((a, b) =>
                    (a.distAlongRoute - b.distAlongRoute) || (a.distToRoute - b.distToRoute))
            ).slice(0, MIXED_EV_CARDS);
            if (!bornes.length) return;
            const list = document.getElementById('gas-stations-list');
            if (!list) return;
            const titre = document.createElement('div');
            titre.style.cssText = 'font-size:11px;font-weight:700;color:#6cb6ff;margin:10px 0 6px;letter-spacing:0.3px;';
            titre.textContent = `⚡ Bornes de recharge (${_mixedEvStations.length} sur le trajet)`;
            list.appendChild(titre);
            renderEVCards(bornes, { append: true });
        }

        function toggleGasStationsPanel() {
            _gasStationsPanelOpen = !_gasStationsPanelOpen;
            const panel   = document.getElementById('gas-stations-panel');
            const chevron = document.getElementById('gas-toggle-chevron');
            panel.style.display     = _gasStationsPanelOpen ? 'block' : 'none';
            chevron.style.transform = _gasStationsPanelOpen ? 'rotate(90deg)' : 'rotate(0deg)';

            const vCfg = loadVehicleConfig();
            const isElec = vCfg.type === 'electrique';
            const loading = document.getElementById('gas-stations-loading');
            if (loading) {
                loading.textContent = _panelIsMixed() ? '🔄 Recherche des stations et des bornes...'
                                    : isElec          ? '🔄 Recherche des bornes de recharge...'
                                                      : '🔄 Recherche des prix en temps réel...';
            }

            // Premier clic : charger selon le type de véhicule.
            // Si la phase 1 a déjà préchargé (ou est en cours), on n'relance rien —
            // la liste est soit déjà remplie, soit sur le point de l'être.
            if (_gasStationsPanelOpen && document.getElementById('gas-stations-list').innerHTML === '' && modalPendingRoute) {
                if (_gasPrefetchInFlight) {
                    if (loading) loading.style.display = 'block';
                } else if (!_gasPrefetchDone) {
                    const route = modalPendingRoute.osrmData.routes[0];
                    loadGasStationsForRoute(route.geometry.coordinates);
                }
            }
        }

        function deselectGasStation() {
            if (!selectedGasStation) return;
            selectedGasStation = null;
            document.querySelectorAll('.gas-station-card').forEach(c => c.classList.remove('selected'));
            updateGasStationMarkersStyle();
            // Réafficher les tracés alternatifs masqués pendant le détour station,
            // et remettre en évidence celui qui était réellement sélectionné.
            setAltRoutesVisible(true);
            highlightSelectedAltRoute(selectedRouteIndex);

            if (_baseRouteForGas) {
                // Restaurer APRÈS highlightSelectedAltRoute : selectAlternativeRoute
                // réécrit la ligne principale, il faut donc la remettre en dernier.
                setRouteLine(_baseRouteForGas.coords);
                currentTurfLine = turf.lineString(_baseRouteForGas.coords);
                if (modalPendingRoute) modalPendingRoute.osrmData = _baseRouteForGas.osrmData;
                // Restaurer les infos trajet d'origine
                majPreviewTemps(_baseRouteForGas.durationH, _baseRouteForGas.distKm);
                document.getElementById('preview-distance').innerText = _baseRouteForGas.distKm.toFixed(1) + ' km';
                const cfg = loadVehicleConfig();
                const fuelCost = calcEnergyCost(_baseRouteForGas.distKm, cfg);
                const tollCost = avoidTolls ? 0 : estimateTollCost(_baseRouteForGas.osrmData);
                document.getElementById('preview-fuel-cost').innerText  = fuelCost.toFixed(2) + ' €';
                document.getElementById('preview-toll-cost').innerText  = avoidTolls ? 'Évités' : formatTollEstimate(tollCost);
                document.getElementById('preview-total-cost').innerText = '~' + (fuelCost + tollCost).toFixed(2) + ' €';
                const statusEl = document.getElementById('modal-status');
                if (statusEl) { statusEl.innerText = '✅ Itinéraire sans arrêt station.'; statusEl.style.color = '#28a745'; }
            }
        }

        /* Identité d'une station : ses coordonnées, à la même tolérance que les
           marqueurs (`_flushGasMarkers`). ⚠ ET NON `_idx`, qui n'est qu'un rang dans la
           liste affichée : en hybride « Tous », la première pompe et la première borne
           portent toutes deux `_idx === 0`, et le toggle prenait alors l'une pour
           l'autre — cliquer la borne juste après la pompe la désélectionnait au lieu de
           la choisir. */
        function _sameStation(a, b) {
            return !!a && !!b
                && Math.abs(a.lng - b.lng) < 0.0001
                && Math.abs(a.lat - b.lat) < 0.0001;
        }

        function selectGasStation(station) {
            // Toggle : re-cliquer sur la station déjà sélectionnée la retire du trajet
            if (station !== null && _sameStation(selectedGasStation, station)) {
                deselectGasStation();
                return;
            }

            selectedGasStation = station;
            document.querySelectorAll('.gas-station-card').forEach(card => card.classList.remove('selected'));

            if (station === null) {
                deselectGasStation();
            } else {
                /* `_cardId` est posé par le rendu qui a créé la carte : les bornes
                   ajoutées sous les pompes (hybride « Tous ») ont un préfixe propre,
                   `gas-card-${_idx}` ne les aurait jamais trouvées. */
                const card = document.getElementById(station._cardId || `gas-card-${station._idx}`);
                if (card) card.classList.add('selected');
                saveStationToFavorites(station, selectedFuelType); // mémoriser le choix
                updateRouteWithGasWaypoint(station);
            }
            updateGasStationMarkersStyle();
        }

        async function updateRouteWithGasWaypoint(station) {
            if (!modalStartCoords || !modalEndCoords) return;

            // Sauvegarder l'itinéraire de base (une seule fois, avant tout waypoint)
            if (!_baseRouteForGas && modalPendingRoute) {
                const baseRoute = modalPendingRoute.osrmData.routes[0];
                const baseDurationH = (baseRoute.legs
                    ? baseRoute.legs.reduce((s, l) => s + l.duration, 0)
                    : baseRoute.duration) / 3600;
                const baseDistKm = (baseRoute.legs
                    ? baseRoute.legs.reduce((s, l) => s + l.distance, 0)
                    : baseRoute.distance) / 1000;
                _baseRouteForGas = {
                    osrmData: modalPendingRoute.osrmData,
                    coords: baseRoute.geometry.coordinates,
                    durationH: baseDurationH,
                    distKm: baseDistKm,
                };
            }

            const statusEl = document.getElementById('modal-status');
            if (statusEl) { statusEl.innerText = '⛽ Calcul de l\'itinéraire via la station...'; statusEl.style.color = '#ffa500'; }

            try {
                // Résoudre les coords de la station via géocodage Mapbox (comme une adresse normale)
                // → évite les coords brutes imprécises qui génèrent des itinéraires aberrants
                // Passer l'adresse textuelle à Mapbox Directions via geocoding intégré.
                // Mapbox choisit lui-même le meilleur point d'accès à la station —
                // pas de problème de côté de chaussée, pas de dérive de snap.
                const stationAddr = station.addr && station.addr.trim()
                    ? station.addr.trim()
                    : null;

                /* Géocodage de l'adresse, soumis à l'arbitrage de _gasPickBestPoint().
                   S'il est retenu, il devient la position de référence de la station —
                   marqueur COMPRIS : quand la source est fausse (station tombée dans un
                   parc), laisser la pastille dessus n'aide personne. S'il est écarté,
                   on ne touche à rien. */
                if (stationAddr && !station._resolvedLng && !station._geoDone) {
                    try {
                        const q = encodeURIComponent(normalizeStationAddr(stationAddr));
                        const geoUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json`
                            + `?access_token=${MAPBOX_TOKEN}&limit=1&language=fr`
                            + `&types=address,poi&proximity=${station.lng},${station.lat}`;
                        const geoRes = await fetch(geoUrl, { signal: AbortSignal.timeout(5000) });
                        if (geoRes.ok) {
                            const geoData = await geoRes.json();
                            station._geoDone = true;   // verdict acquis, ne pas réinterroger
                            const best = _gasPickBestPoint(geoData.features?.[0],
                                                           station.lng, station.lat, station.name);
                            if (best) {
                                station._resolvedLng = best[0];
                                station._resolvedLat = best[1];
                                // La pastille suit la position retenue. Pas de saut visible :
                                // le rendu qui suit la repose au même endroit que le waypoint.
                                _flushGasMarkers();
                            }
                        }
                    } catch(e) { /* silencieux */ }
                }

                /* ═══ CHOIX DU POINT D'ÉTAPE : PAR LE DÉTOUR RÉEL, PAS PAR LA PRÉCISION ═══
                   Mesuré le 15/08/2026 sur « 72 BLD DE VERDUN » à Courbevoie :

                       trajet sans station        2 797 m
                       via le point GÉOCODÉ       4 253 m   (+1 456 m)
                       via le point BRUT du flux  3 601 m   (+  804 m)

                   652 m de détour en trop, pour deux points distants de 80 m. Le boulevard
                   a un TERRE-PLEIN CENTRAL : le point d'adresse, pourtant `accuracy=point`
                   et donc « retenu » par `_gasPickBestPoint()`, tombe du côté où l'on ne
                   peut pas entrer, et la voiture doit faire le tour du pâté de maisons.

                   ⚠ LA LEÇON : **la précision d'un géocodage ne dit rien de son
                   accessibilité en voiture.** `_gasPickBestPoint()` arbitre sur `accuracy`
                   — excellent critère pour placer une pastille, sans rapport avec le coût
                   d'un détour. Pour une ÉTAPE d'itinéraire, le seul juge est l'itinéraire
                   lui-même. On calcule donc les deux et on garde le moins coûteux.

                   Comparaison en DISTANCE et non en durée : la durée dépend du trafic
                   instantané et ferait osciller le choix d'un appel à l'autre, pour un
                   écart parfois insignifiant. La distance est stable et reproductible —
                   c'est aussi elle que l'utilisateur voit sur le tracé.

                   Le verdict est mémorisé sur la station (`_wpChoisi`) : re-sélectionner la
                   même station ne relance pas la double interrogation. */
                const wpGeo  = (station._resolvedLng != null && station._resolvedLat != null)
                    ? [station._resolvedLng, station._resolvedLat] : null;
                const wpBrut = [station.lng, station.lat];

                let osrmData = null;
                if (station._wpChoisi) {
                    // Verdict déjà rendu pour cette station : un seul appel suffit.
                    osrmData = await fetchRouteMapboxWithWaypoint(
                        modalStartCoords, station._wpChoisi, modalEndCoords, avoidTolls
                    );
                } else if (wpGeo && _ecartMetres(wpGeo, wpBrut) > 15) {
                    /* Deux candidats réellement distincts : on les départage. Les deux
                       appels partent EN PARALLÈLE — les enchaîner doublerait l'attente
                       ressentie au moment le plus visible, juste après le tap. */
                    const [rGeo, rBrut] = await Promise.all([
                        fetchRouteMapboxWithWaypoint(modalStartCoords, wpGeo,  modalEndCoords, avoidTolls).catch(() => null),
                        fetchRouteMapboxWithWaypoint(modalStartCoords, wpBrut, modalEndCoords, avoidTolls).catch(() => null),
                    ]);
                    /* Chaque candidat est résumé par sa longueur ET sa part de voie à
                       accès restreint. La seconde est indispensable : le plus COURT peut
                       l'être parce qu'il traverse un chemin de service le long d'une voie
                       ferrée (cas mesuré à Courbevoie). Voir `_choisirEtapeStation()`. */
                    const bilan = (d) => {
                        const r = d && d.routes && d.routes[0];
                        if (!r) return { distanceM: Infinity, restreintM: 0 };
                        return {
                            distanceM: r.legs ? r.legs.reduce((s, l) => s + l.distance, 0) : r.distance,
                            restreintM: _metresRestreints(r),
                        };
                    };
                    const bGeo = bilan(rGeo), bBrut = bilan(rBrut);
                    // `a` = le géocodé : il gagne les égalités, étant le mieux localisé
                    // pour l'affichage.
                    const verdict = _choisirEtapeStation(bGeo, bBrut);
                    const geoGagne = !verdict || verdict.gagnant === 'a';
                    osrmData = geoGagne ? rGeo : rBrut;
                    station._wpChoisi = geoGagne ? wpGeo : wpBrut;

                    const fmt = (b) => Number.isFinite(b.distanceM)
                        ? `${Math.round(b.distanceM)}m (dont ${Math.round(b.restreintM)}m restreint)`
                        : 'échec';
                    console.log(`[StationWP] ${station.name || station.addr} — `
                        + `géocodé ${fmt(bGeo)} / brut ${fmt(bBrut)} → `
                        + `${geoGagne ? 'GÉOCODÉ' : 'BRUT'} retenu`
                        + (verdict ? ` — ${verdict.motif}` : ''));

                    /* La pastille suit le point réellement emprunté. Montrer la station
                       ailleurs que là où l'itinéraire y entre induirait en erreur — même
                       principe que l'arbitrage d'affichage de `_gasPickBestPoint()`. */
                    if (!geoGagne) {
                        station._resolvedLng = null;
                        station._resolvedLat = null;
                        _flushGasMarkers();
                    }
                } else {
                    station._wpChoisi = wpGeo || wpBrut;
                    osrmData = await fetchRouteMapboxWithWaypoint(
                        modalStartCoords, station._wpChoisi, modalEndCoords, avoidTolls
                    );
                }

                // Les deux tentatives ont échoué (réseau) : rien à tracer.
                if (!osrmData || !osrmData.routes || !osrmData.routes[0]) {
                    throw new Error('Itinéraire via la station indisponible');
                }

                const route = osrmData.routes[0];
                const routeCoords = route.geometry.coordinates;
                setRouteLine(routeCoords);
                currentTurfLine = turf.lineString(routeCoords);
                if (modalPendingRoute) modalPendingRoute.osrmData = osrmData;
                // Le détour via station devient le seul tracé lisible à l'écran.
                setAltRoutesVisible(false);

                // ✅ Sommer les 2 legs (départ→station + station→arrivée) pour le vrai temps
                const totalDurationSec = route.legs
                    ? route.legs.reduce((s, l) => s + l.duration, 0)
                    : route.duration;
                const totalDistanceM = route.legs
                    ? route.legs.reduce((s, l) => s + l.distance, 0)
                    : route.distance;

                const durationH = totalDurationSec / 3600;
                const distKm    = totalDistanceM / 1000;

                majPreviewTemps(durationH, distKm);
                document.getElementById('preview-distance').innerText = distKm.toFixed(1) + ' km';

                const cfg = loadVehicleConfig();
                const fuelCost = calcEnergyCost(distKm, cfg);
                const tollCost = avoidTolls ? 0 : estimateTollCost(osrmData);
                document.getElementById('preview-fuel-cost').innerText  = fuelCost.toFixed(2) + ' €';
                document.getElementById('preview-toll-cost').innerText  = avoidTolls ? 'Évités' : formatTollEstimate(tollCost);
                document.getElementById('preview-total-cost').innerText = '~' + (fuelCost + tollCost).toFixed(2) + ' €';

                if (statusEl) { statusEl.innerText = `✅ Itinéraire via ⛽ ${station.name} calculé.`; statusEl.style.color = '#ffa500'; }

            } catch(e) {
                console.error('[GasRoute]', e);
                if (statusEl) { statusEl.innerText = '⚠️ Calcul via station échoué — itinéraire direct conservé.'; statusEl.style.color = '#ff6b6b'; }
                selectedGasStation = null;
                document.querySelectorAll('.gas-station-card').forEach(c => c.classList.remove('selected'));
                if (_baseRouteForGas) {
                    setRouteLine(_baseRouteForGas.coords);
                    currentTurfLine = turf.lineString(_baseRouteForGas.coords);
                    if (modalPendingRoute) modalPendingRoute.osrmData = _baseRouteForGas.osrmData;
                }
                // Le détour a échoué : rendre les tracés alternatifs à l'utilisateur.
                setAltRoutesVisible(true);
                highlightSelectedAltRoute(selectedRouteIndex);
            }
        }

        const FUEL_DEFS = [
            { key: 'sp95',   label: 'SP95',   cls: 'sp95'   },
            { key: 'e10',    label: 'E10',     cls: 'e10'    },
            { key: 'gazole', label: 'Gazole',  cls: 'gazole' },
            { key: 'sp98',   label: 'SP98',    cls: 'sp98'   },
        ];

        function buildFuelSelector(stations) {
            const box = document.getElementById('gas-fuel-selector');
            if (!box) return;
            box.innerHTML = '';

            // Quels carburants sont disponibles parmi les stations ?
            // SP95 est considéré disponible si au moins une station a du SP95 OU du E10
            const available = FUEL_DEFS.filter(f =>
                stations.some(s => getEffectivePrice(s, f.key) != null)
            );
            if (available.length === 0) return;

            // Si le carburant sélectionné n'est pas disponible, prendre le premier dispo
            if (!available.find(f => f.key === selectedFuelType)) {
                selectedFuelType = available[0].key;
            }

            available.forEach(f => {
                const btn = document.createElement('button');
                btn.className = `gas-fuel-btn ${f.cls}${f.key === selectedFuelType ? ' active' : ''}`;
                btn.dataset.fuel = f.key;
                btn.textContent = f.label;
                btn.onclick = () => {
                    if (btn.classList.contains('active')) {
                        selectedFuelType = null;
                        // Même portée limitée que setFuelFilter() : les pastilles de type
                        // de l'hybride ne sont pas des filtres de carburant.
                        document.querySelectorAll('#gas-fuel-selector .gas-fuel-btn').forEach(b => b.classList.remove('active'));
                        clearGasStationMarkers();
                        document.getElementById('gas-stations-list').innerHTML = '';
                        // Désélectionner un carburant ne dit rien des bornes : en hybride
                        // « Tous », elles restent affichées.
                        _appendMixedEvCards();
                    } else {
                        setFuelFilter(f.key);
                    }
                };
                box.appendChild(btn);
            });

            // Deux modes exclusifs, poussés à droite de la barre. Ils ne filtrent pas
            // un carburant mais déterminent le critère de classement.
            const modes = [
                { key: 'proche',  label: '📍 Plus proche', title: 'Les 5 premières stations sur votre trajet' },
                { key: 'pascher', label: '💰 Moins cher',  title: 'Les 5 moins chères à moins de 4 km du trajet' },
            ];
            const modeWrap = document.createElement('div');
            modeWrap.style.cssText = 'display:flex;gap:6px;margin-left:auto;';
            modes.forEach(m => {
                const b = document.createElement('button');
                b.className = 'gas-mode-btn' + (gasSortMode === m.key ? ' active' : '');
                b.dataset.mode = m.key;
                b.textContent  = m.label;
                b.title        = m.title;
                b.onclick      = () => setGasSortMode(m.key);
                modeWrap.appendChild(b);
            });
            box.appendChild(modeWrap);
        }

        // Tri combiné : prix d'abord, puis détour réel (deltaMin OSRM si dispo, sinon distToRoute)
        // À prix identique (< 0.03€ d'écart), la station favorite et la moins détournée gagne.
        // Coût réel d'un plein dans cette station, en euros :
        //   prix au litre x volume de référence  +  coût du détour
        // Cela remplace l'ancienne "tolérance de 0,03 €" qui écrasait
        // justement les écarts de prix intéressants (1,962 vs 1,990 = 0,028 €
        // passait sous la tolérance et n'était donc PAS pris en compte).
        const GAS_TANK_L       = 45;    // litres de référence pour comparer
        const GAS_EURO_PER_MIN = 0.80;  // valeur d'une minute de détour (temps + carburant + usure)

        // Volume de référence adapté au trajet. À 45 L fixes, l'écart de prix pesait
        // toujours plus lourd que le détour : sur un trajet urbain de 9 km, 5 cts/L
        // « rapportaient » 2.29 € et justifiaient un détour de 11 min, ce qui envoyait
        // le conducteur à l'autre bout de la ville au lieu de la station d'à côté.
        // Sur trajet court on raisonne en appoint (20 L), sur trajet long en plein.
        function _gasWindowKm() {
            return _gasSearchWindow
                ? (_gasSearchWindow.toKm - _gasSearchWindow.fromKm)
                : null;
        }

        // === MODE DE CLASSEMENT DES STATIONS ===
        // Deux intentions distinctes, exclusives, choisies explicitement :
        //  - 'proche'  : les premières stations rencontrées en roulant (ordre du trajet)
        //  - 'pascher' : les moins chères, dans un corridor de 4 km autour du tracé
        // Sans ce choix, une formule unique arbitrait prix contre détour et se trompait
        // souvent : pour un appoint elle envoyait à l'autre bout de la ville, pour un
        // plein elle s'arrêtait à la station d'à côté.
        const GAS_NEAREST_COUNT   = 5;      // stations retenues en mode « plus proche »
        const GAS_CHEAPEST_COUNT  = 5;      // stations retenues en mode « moins cher »
        const GAS_CHEAPEST_MAX_M  = 5000;   // pré-filtre corridor autour du tracé (vol d'oiseau)

        // === MODE « PLUS PROCHE » : BULLE DE PROXIMITÉ ===
        // Ce mode ne raisonne plus en « ordre de rencontre le long du tracé » : il
        // répond à la question « quelles stations sont les plus proches de moi,
        // maintenant ». Le tracé n'intervient pas du tout dans le classement.
        const GAS_NEAR_RADIUS_M      = 2000;  // rayon nominal de la bulle
        const GAS_NEAR_RADIUS_MAX_M  = 5000;  // élargissement max si < 5 stations dedans
        const GAS_NEAR_RADIUS_STEP_M = 500;   // pas d'élargissement progressif

        // === MODE « MOINS CHER » : PLAFOND DE DÉTOUR RÉEL ===
        const GAS_CHEAP_MAX_DETOUR_MIN = 10;  // plafond demandé : 10 min de détour max

        // Queue de trajet exclue en mode « moins cher » : proposer une station
        // située après l'arrivée obligerait à repartir une fois garé.
        const GAS_CHEAP_TAIL_RATIO  = 0.05;
        const GAS_CHEAP_TAIL_MIN_KM = 0.3;
        const GAS_CHEAP_TAIL_MAX_KM = 5;

        // Rayon réellement utilisé au dernier filtrage (pour le label de zone).
        let _gasNearRadiusUsedM = GAS_NEAR_RADIUS_M;

        // Centre de la bulle. Au calcul du trajet c'est le point de départ ;
        // dès que la navigation tourne, il suit la position réelle du véhicule.
        let _gasAnchor = null;   // [lng, lat]

        function getGasAnchorPoint() {
            // En navigation : position réelle du véhicule (mise à jour par setGasAnchor).
            if (_gasAnchor) return _gasAnchor;
            // Avant départ, priorité à la position GPS exacte du téléphone : c'est
            // la position réelle de l'utilisateur, indépendante du snap Mapbox.
            // Sur un long trajet (ex: Courbevoie→Nogent), rc[0] peut être snapé sur
            // l'A86 à plusieurs km du point de départ réel déclaré.
            if (exactStartCoords) return exactStartCoords;
            // Fallback 1 : premier point du tracé (snap Mapbox)
            const rc = modalPendingRoute?.osrmData?.routes?.[0]?.geometry?.coordinates;
            if (rc && rc.length) return rc[0];
            // Fallback 2 : coordonnées du champ de départ (saisie manuelle)
            return modalStartCoords || null;
        }

        function gasDistFromAnchorM(s) {
            const a = getGasAnchorPoint();
            if (!a) return Infinity;
            try {
                return turf.distance(turf.point(a), turf.point([s.lng, s.lat]),
                                     { units: 'kilometers' }) * 1000;
            } catch(e) { return Infinity; }
        }

        // Distance au tracé en deçà de laquelle une station est considérée « sur le
        // chemin ». Un gros delta OSRM sur une telle station traduit une contrainte
        // de voirie (sens unique, terre-plein, demi-tour interdit) et non une perte
        // de temps réelle : on ne l'écarte pas pour autant.
        const GAS_ONROUTE_EXEMPT_M = 1500;

        // Plafond de détour applicable au mode courant.
        // « Plus proche » n'en a AUCUN : le mode répond à « qu'y a-t-il près de moi »,
        // la bulle de 2 km est déjà la contrainte. Appliquer un plafond ici revenait
        // à masquer 4 cartes sur 5 — une station à 900 m au nord du départ, alors que
        // le trajet part au sud, se voyait facturer 15 min d'aller-retour par Mapbox
        // et disparaissait, alors qu'elle est précisément ce que l'utilisateur cherche.
        function gasDetourCapMin() {
            return gasSortMode === 'pascher' ? GAS_CHEAP_MAX_DETOUR_MIN : Infinity;
        }
        function gasOverBudget(s) {
            if (s._deltaMin == null) return false;
            if ((s.distToRoute || 0) <= GAS_ONROUTE_EXEMPT_M) return false;
            return s._deltaMin > gasDetourCapMin();
        }

        // Appelé depuis la boucle GPS : recentre la bulle sur le véhicule.
        // Ne redessine que si on a réellement bougé, pour ne pas repeindre la
        // liste à chaque frame.
        const GAS_ANCHOR_MOVE_M = 300;
        function setGasAnchor(lng, lat) {
            if (!Number.isFinite(lng) || !Number.isFinite(lat)) return;
            /* Second rendu au premier fix GPS : `_gasAnchor` vaut null après
               resetGasLiveScan(), le garde-fou des 300 m ne s'applique donc pas et la
               liste est repeinte une seconde fois.
               HISTORIQUE — sa suppression a été tentée puis annulée le 14/08/2026 : les
               pastilles se retrouvaient mal placées. On a compris depuis que la vraie
               cause était `geocodeAllStations()`, qui les déplaçait vers un géocodage
               d'adresse ; ce déplacement a été retiré, les marqueurs utilisent désormais
               les coordonnées brutes et sont donc corrects dès le PREMIER rendu.
               Ce second rendu n'a donc probablement plus d'utilité, mais il est laissé
               en place tant qu'il n'a pas été revalidé sur le terrain — et il ne coûte
               presque plus rien : `_deltaCtx` évite de repayer les détours et
               `_gasDetourRun` fait avorter la boucle du premier rendu. */
            const prev = _gasAnchor;
            _gasAnchor = [lng, lat];
            if (gasSortMode !== 'proche') return;
            if (!_allGasStations.length || !selectedFuelType) return;
            if (prev) {
                let moved;
                try {
                    moved = turf.distance(turf.point(prev), turf.point(_gasAnchor),
                                          { units: 'kilometers' }) * 1000;
                } catch(e) { moved = Infinity; }
                if (moved < GAS_ANCHOR_MOVE_M) return;
            }
            const list = document.getElementById('gas-stations-list');
            if (!list || !list.children.length) return;  // panneau fermé : rien à repeindre
            const picked = selectTopStations(
                getStationsInWindow(_allGasStations, selectedFuelType), selectedFuelType
            );
            _renderGasZoneLabel();
            renderGasCards(picked);
        }

        let gasSortMode = localStorage.getItem('gps_gas_sort_mode') || 'proche';
        if (gasSortMode !== 'proche' && gasSortMode !== 'pascher') gasSortMode = 'proche';

        function setGasSortMode(mode) {
            if (mode !== 'proche' && mode !== 'pascher') return;
            gasSortMode = mode;
            localStorage.setItem('gps_gas_sort_mode', mode);

            document.querySelectorAll('.gas-mode-btn').forEach(b => {
                b.classList.toggle('active', b.dataset.mode === mode);
            });

            // Purger les déltas calculés sous l'autre mode : le plafond de détour
            // est différent entre « proche » (aucun) et « moins cher » (10 min).
            // Sans ce reset, une station à 11 min restait écartée en mode « proche »
            // à cause d'un _deltaMin figé depuis le calcul en mode « moins cher ».
            _allGasStations.forEach(s => { s._deltaMin = null; });

            if (_allGasStations.length && selectedFuelType) {
                const picked = selectTopStations(
                    getStationsInWindow(_allGasStations, selectedFuelType), selectedFuelType
                );
                _renderGasZoneLabel();
                renderGasCards(picked);
            }
        }

        // Le classement ne repose plus sur un score pondéré prix/détour : le mode
        // choisi par l'utilisateur tranche directement, ce qui est plus prévisible.

        const GAS_FAV_BONUS    = 0.40;  // € de bonus pour une station déjà fréquentée
        const GAS_CITY_KMH     = 25;    // vitesse moyenne pour estimer un détour sans OSRM

        function stationScore(s, fuelType) {
            const prix = getEffectivePrice(s, fuelType);
            if (prix == null) return Infinity;
            // Conservé pour les usages hors classement (diagnostics, comparaisons).
            const detourMin = s._deltaMin != null
                ? s._deltaMin
                : ((s.distToRoute || 0) / 1000) * 2 * (60 / GAS_CITY_KMH);
            let score = prix * GAS_TANK_L + detourMin * GAS_EURO_PER_MIN;
            if (s._isFavorite) score -= GAS_FAV_BONUS;
            return score;
        }

        function sortStations(stations, fuelType) {
            // Une station fermée est reléguée en fin de liste quel que soit son prix :
            // le meilleur tarif du secteur ne sert à rien devant un rideau baissé.
            const isClosed = s => getStationOpeningStatus(s).status === 'closed';

            if (gasSortMode === 'proche') {
                // « Plus proche » : distance à vol d'oiseau depuis l'ancre, point.
                // Ce n'est PLUS l'ordre de rencontre le long du tracé — c'était la
                // cause du bug : une station à 1 min de chez soi, légèrement à
                // l'écart du tracé, passait derrière une station 6 km plus loin
                // mais pile sur la route.
                return [...stations].sort((a, b) => {
                    const ca = isClosed(a), cb = isClosed(b);
                    if (ca !== cb) return ca ? 1 : -1;
                    const da = a._distAnchor ?? gasDistFromAnchorM(a);
                    const db = b._distAnchor ?? gasDistFromAnchorM(b);
                    if (da !== db) return da - db;
                    return (a.distToRoute || 0) - (b.distToRoute || 0);
                });
            }

            // « Moins cher » : prix croissant. Le corridor est appliqué en amont
            // par getStationsInWindow, donc tout ce qui arrive ici est déjà accessible.
            return [...stations].sort((a, b) => {
                const ca = isClosed(a), cb = isClosed(b);
                if (ca !== cb) return ca ? 1 : -1;
                const pa = getEffectivePrice(a, fuelType);
                const pb = getEffectivePrice(b, fuelType);
                if (pa == null && pb == null) return 0;
                if (pa == null) return 1;
                if (pb == null) return -1;
                if (pa !== pb) return pa - pb;
                // Prix identique : départager par la proximité au tracé
                return (a.distToRoute || 0) - (b.distToRoute || 0);
            });
        }

        // Sélectionne les N meilleures stations en garantissant que les favoris
        // dans la zone sont toujours visibles, même s'ils ne sont pas les moins chers.
        function selectTopStations(stations, fuelType, n = null) {
            if (n == null) n = gasSortMode === 'proche' ? GAS_NEAREST_COUNT : GAS_CHEAPEST_COUNT;

            // En mode « plus proche » : tri par distance à l'ancre, point.
            // Le prix et les favoris n'entrent pas dans le classement — la question
            // est « qu'y a-t-il près de moi », pas « qu'est-ce qui est le moins cher ».
            if (gasSortMode === 'proche') {
                const sorted = [...stations].sort((a, b) =>
                    (a._distAnchor ?? Infinity) - (b._distAnchor ?? Infinity)
                );
                return sorted.slice(0, n);
            }

            // Mode « moins cher » : prix croissant, avec garantie d'au moins 1 favori.
            const sorted = sortStations(stations, fuelType);

            const favs    = sorted.filter(s => s._isFavorite);
            const nonFavs = sorted.filter(s => !s._isFavorite);

            if (favs.length === 0) return sorted.slice(0, n);

            // 1 place garantie pour le meilleur favori (le moins cher parmi les favoris).
            // Les n-1 places restantes vont aux meilleures stations toutes confondues,
            // favoris inclus — évite de perdre des places quand il y a beaucoup de favoris.
            const bestFav  = favs[0];
            const rest     = sorted.filter(s => s !== bestFav).slice(0, n - 1);
            return sortStations([bestFav, ...rest], fuelType);
        }

        function setFuelFilter(fuelType) {
            selectedFuelType = fuelType;

            /* ⚠ Portée limitée au sélecteur de carburant, et non `.gas-fuel-btn` partout
               dans la page : les pastilles de type de l'hybride (#gas-kind-selector)
               réutilisent la même classe sans porter de `dataset.fuel`, et le balayage
               global les éteignait toutes au premier changement de carburant. */
            document.querySelectorAll('#gas-fuel-selector .gas-fuel-btn').forEach(btn => {
                btn.classList.toggle('active', btn.dataset.fuel === fuelType);
            });

            // Réinitialiser _deltaMin sur toutes les stations : les valeurs calculées
            // pour le carburant précédent fausseraient le tri du nouveau carburant
            // _deltaMin est lié au carburant affiché : le détour routier ne dépend
            // pas du carburant, mais on le recalcule pour rester cohérent.
            _allGasStations.forEach(s => { s._deltaMin = null; });

            // Re-trier dans la fenêtre intelligente (prix effectif : SP95 ou E10 si SP95 absent)
            const sorted = selectTopStations(getStationsInWindow(_allGasStations, fuelType), fuelType);

            _renderGasZoneLabel();   // le rayon retenu peut différer selon le carburant
            renderGasCards(sorted);
        }

        /* Numéro de génération du rendu. La boucle de calcul des détours est
           asynchrone et écrit dans des id indexés (`gas-detour-${i}`, `gas-card-${i}`) :
           si un nouveau rendu survient pendant qu'elle tourne, l'indice i désigne
           désormais une AUTRE station et la boucle obsolète inscrit ses temps sur les
           mauvaises cartes — en plus de consommer une requête Directions et un
           géocodage par station pour un affichage qui n'existe plus. */
        let _gasDetourRun = 0;

        /* Signature du contexte routier dont dépend un détour : départ, arrivée,
           option péages. Tant qu'elle ne bouge pas, le détour mesuré pour une
           station RESTE valable — le second rendu peut donc réafficher la valeur
           du premier au lieu de repayer une requête Directions et un géocodage.
           C'est ce qui rend la boucle idempotente, exactement comme
           geocodeAllStations() l'est déjà via son test `!s._resolvedLng`. */
        function _gasDetourContext() {
            const r = c => (Array.isArray(c) && c.length === 2)
                ? c[0].toFixed(4) + ',' + c[1].toFixed(4) : 'x';
            return r(modalStartCoords) + '|' + r(modalEndCoords) + '|' + (avoidTolls ? 't' : 'f');
        }

        // Affichage d'un détour déjà connu. Appelé par les deux chemins — valeur
        // fraîchement mesurée ou valeur mémorisée — pour qu'ils ne puissent pas
        // diverger.
        function _paintGasDetour(s, i) {
            if (gasOverBudget(s)) {
                const card = document.getElementById(`gas-card-${i}`);
                if (card) card.style.display = 'none';
                return;
            }
            const el = document.getElementById(`gas-detour-${i}`);
            if (!el) return;
            if (s._deltaMin <= 0) {
                el.textContent = 'Sur le trajet';
                el.style.color = '#28a745';
            } else {
                el.textContent = `+${s._deltaMin} min`;
                el.style.color = s._deltaMin <= 3 ? '#28a745' : s._deltaMin <= 8 ? '#f39c12' : '#e74c3c';
            }
        }

        function renderGasCards(stations) {
            const list = document.getElementById('gas-stations-list');
            /* Les pastilles de type sont reposées à chaque rendu carburant, pas seulement
               par `_renderMixedPanel()` : le scan live (phase 2) rappelle directement
               cette fonction, et l'hybride perdrait sinon son sélecteur ⛽/⚡ au premier
               rafraîchissement en roulant — avec des compteurs figés sur le relevé du
               départ jusque-là. Trois boutons : le coût est nul. */
            if (_panelIsMixed()) _renderPanelKindChips();
            _gasDetourRun++;   // toute boucle de détour encore en vol devient caduque
            list.innerHTML = '';
            clearGasStationMarkers();

            if (!stations || stations.length === 0) {
                list.innerHTML = `<div style="font-size:12px;color:#4a5568;text-align:center;padding:8px 0;">Aucune station avec ce carburant sur le trajet.</div>`;
                _appendMixedEvCards();
                return;
            }

            // Marqueurs = exactement les stations des cartes affichées
            _gasStationsGeoData = [];
            stations.forEach(s => {
                const isSel = selectedGasStation && selectedGasStation.lng === s.lng && selectedGasStation.lat === s.lat;
                addGasStationMarker(s.lng, s.lat, isSel, s);
            });
            _flushGasMarkers(); // rendu GPU en une seule passe

            /* Correction des positions en tâche de fond, sous arbitrage.
               Rétabli après avoir compris que la source data.gouv.fr est parfois
               franchement fausse (station tombée dans un parc) : seul le géocodage
               peut alors rattraper le coup. _gasPickBestPoint() n'accepte que les
               résultats réellement localisés, ce qui évite la régression inverse —
               des pastilles décalées par une simple interpolation de rue.
               Le doublon d'appels que provoquait ce mécanisme est traité ailleurs,
               par les drapeaux `_geoPending` / `_geoDone`. */
            geocodeAllStations(stations).catch(() => {});

            stations.forEach((s, i) => {
                s._idx = i;
                const card = document.createElement('div');
                card.className = 'gas-station-card';
                card.id = `gas-card-${i}`;
                s._cardId = card.id;

                const price = getEffectivePrice(s, selectedFuelType);
                const effectiveFuelType = getEffectiveFuelType(s, selectedFuelType);
                const fuelDef = FUEL_DEFS.find(f => f.key === effectiveFuelType);
                const pillStyle = {
                    sp95:   'background:rgba(255,140,0,0.12);color:#ffa500;border-color:rgba(255,140,0,0.35);',
                    e10:    'background:rgba(40,167,69,0.12);color:#28a745;border-color:rgba(40,167,69,0.35);',
                    gazole: 'background:rgba(77,163,255,0.12);color:#4da3ff;border-color:rgba(77,163,255,0.35);',
                    sp98:   'background:rgba(156,39,176,0.12);color:#ce93d8;border-color:rgba(156,39,176,0.35);',
                }[effectiveFuelType] || '';
                // Si la station affiche E10 à la place du SP95 demandé, petite note discrète
                const e10Fallback = selectedFuelType === 'sp95' && effectiveFuelType === 'e10';
                const priceHtml = price
                    ? `<span class="gas-price-pill" style="${pillStyle}">${fuelDef?.label} ${price.toFixed(3)}€</span>${e10Fallback ? '<span style="font-size:9px;color:#4a5568;margin-top:2px;display:block;text-align:right;">(sans SP95 pur)</span>' : ''}`
                    : `<span style="font-size:10px;color:#4a5568;font-style:italic;">Prix non disponible</span>`;

                card.innerHTML = `
                    <div class="gas-selected-dot"></div>
                    <div class="gas-card-icon">⛽</div>
                    <div class="gas-card-info">
                        <div class="gas-card-name">${s._isFavorite ? '⭐ ' : ''}${s.name}</div>
                        <div class="gas-card-addr">${s.addr || '—'}</div>
                        ${(() => {
                            const st = getStationOpeningStatus(s);
                            if (st.status === 'unknown') return '';
                            const col = st.status === 'closed' ? '#e74c3c'
                                      : st.status === '24h'    ? '#4da3ff' : '#28a745';
                            const dot = st.status === 'closed' ? '🔴' : st.status === '24h' ? '🔵' : '🟢';
                            return `<div style="font-size:9px;color:${col};margin-top:2px;font-weight:600;">${dot} ${st.label}</div>`;
                        })()}
                        ${s._isFavorite && s._visits > 1 ? `<div style="font-size:9px;color:#f39c12;margin-top:2px;">Visitée ${s._visits}× — prix ${s._priceStale ? 'à vérifier' : 'récent'}</div>` : ''}
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
                        <div class="gas-card-prices">${priceHtml}</div>
                        <div class="gas-card-dist" id="gas-detour-${i}" style="color:#8892b0;font-size:11px;">+… min</div>
                    </div>`;

                if (selectedGasStation && selectedGasStation.lng === s.lng && selectedGasStation.lat === s.lat) {
                    card.classList.add('selected');
                }

                card.addEventListener('click', () => selectGasStation(s));
                list.appendChild(card);
            });

            /* Bornes de recharge sous les pompes, en hybride « Tous » seulement (voir
               _appendMixedEvCards). Posé ICI, à la fin de chaque passage : renderGasCards()
               se rappelle lui-même quand des stations sortent du budget de détour, et
               l'appendice doit survivre à ce second rendu. */
            _appendMixedEvCards();

            // Calculer le vrai delta de temps via OSRM — séquentiel pour éviter la saturation API
            if (modalStartCoords && modalEndCoords) {
                const baseDurationSec = _baseRouteForGas
                    ? _baseRouteForGas.durationH * 3600
                    : modalPendingRoute?.osrmData?.routes?.[0]
                        ? (modalPendingRoute.osrmData.routes[0].legs
                            ? modalPendingRoute.osrmData.routes[0].legs.reduce((s, l) => s + l.duration, 0)
                            : modalPendingRoute.osrmData.routes[0].duration)
                        : null;

                if (baseDurationSec !== null) {
                    const stationsRef = stations;
                    const myRun = _gasDetourRun;   // génération à laquelle appartient cette boucle
                    const detourCtx = _gasDetourContext();   // trajet auquel se rapportent les mesures
                    // Séquentiel : une requête à la fois pour ne pas saturer l'API
                    (async () => {
                        for (let i = 0; i < stationsRef.length; i++) {
                            // Un rendu plus récent a eu lieu : cette boucle n'a plus de
                            // cartes à renseigner. On sort AVANT la requête suivante,
                            // ce qui économise tout le reste des appels.
                            if (myRun !== _gasDetourRun) return;
                            const s = stationsRef[i];

                            /* ── Mémoïsation : LE point qui supprime les doublons ──
                               Le second rendu (déclenché par le premier fix GPS, et
                               indispensable au bon positionnement des pastilles)
                               retombe sur les MÊMES objets station. Si leur détour a
                               déjà été mesuré pour ce même trajet, on repeint sans
                               toucher au réseau : zéro requête Directions, zéro
                               géocodage. Le rendu reste identique, seul son coût
                               disparaît. */
                            if (s._deltaMin != null && s._deltaCtx === detourCtx) {
                                _paintGasDetour(s, i);
                                continue;
                            }

                            try {
                                const sAddr = s.addr && s.addr.trim() ? s.addr.trim() : null;
                                const osrmData = sAddr
                                    ? await fetchRouteMapboxWithWaypointAddr(
                                        modalStartCoords, sAddr, s.lng, s.lat,
                                        modalEndCoords, avoidTolls)
                                    : await fetchRouteMapboxWithWaypoint(
                                        modalStartCoords, [s.lng, s.lat],
                                        modalEndCoords, avoidTolls);
                                const route = osrmData.routes[0];
                                const withStationSec = route.legs
                                    ? route.legs.reduce((acc, l) => acc + l.duration, 0)
                                    : route.duration;
                                const deltaMin = Math.round((withStationSec - baseDurationSec) / 60);
                                // Mesure + contexte mémorisés sur l'objet station AVANT tout
                                // abandon : c'est ce couple qui évitera la requête au rendu
                                // suivant, même si celui-ci survient dans la seconde.
                                s._deltaMin = deltaMin;
                                s._deltaCtx = detourCtx;

                                // L'attente réseau ci-dessus a pu enjamber un nouveau rendu :
                                // on revérifie AVANT de toucher au DOM, sinon ce temps
                                // s'inscrirait sur la carte d'une autre station.
                                if (myRun !== _gasDetourRun) return;

                                // Le pré-filtre maxDetourM ne connaît qu'une distance à vol
                                // d'oiseau. C'est ici, une fois le vrai temps routier connu,
                                // qu'on peut écarter une station hors budget de détour.
                                // Le budget dépend du mode : 10 min en « moins cher »
                                // (contrainte demandée), plus large en « plus proche »
                                // où la bulle de 2 km rend un gros détour improbable
                                // et où l'écarter serait contre-productif.
                                if (gasOverBudget(s)) {
                                    console.log(`[GasAPI] ${s.name} écartée : +${deltaMin} min > ${gasDetourCapMin()} min`);
                                }
                                _paintGasDetour(s, i);   // même peintre que le chemin mémorisé
                            } catch(e) {
                                const el = document.getElementById(`gas-detour-${i}`);
                                if (el) el.textContent = '';
                            }
                        }

                        // Dernier contrôle avant la phase de remplacement : elle rappelle
                        // renderGasCards(), une boucle périmée relancerait donc un rendu
                        // complet par-dessus celui en cours.
                        if (myRun !== _gasDetourRun) return;

                        // Retirer définitivement les stations hors budget de détour,
                        // puis compléter avec des candidates non encore évaluées.
                        const kept = stationsRef.filter(s => !gasOverBudget(s));
                        if (kept.length < stationsRef.length) {
                            const rejected = stationsRef.length - kept.length;
                            const pool = getStationsInWindow(_allGasStations, selectedFuelType)
                                .filter(s => !gasOverBudget(s) && !stationsRef.includes(s));
                            const replacements = sortStations(pool, selectedFuelType).slice(0, rejected);
                            const finalList = sortStations([...kept, ...replacements], selectedFuelType);
                            if (finalList.length > 0) {
                                renderGasCards(finalList);
                            } else {
                                document.getElementById('gas-stations-list').innerHTML =
                                    `<div style="font-size:12px;color:#4a5568;text-align:center;padding:8px 0;">Aucune station exploitable sur ce trajet.</div>`;
                            }
                            return;
                        }

                        // Re-trier après que tous les deltas soient connus
                        const reSorted = sortStations(stationsRef, selectedFuelType);
                        const orderChanged = reSorted.some((s, i) => s !== stationsRef[i]);
                        if (orderChanged) renderGasCards(reSorted);
                    })();
                }
            }
        }

        // === FENÊTRE DE RECHERCHE (MODE « MOINS CHER ») ===
        // Il ne reste qu'un seul paramètre : la queue de trajet exclue.
        //
        // L'ancienne version découpait le trajet en quatre paliers avec un fromKm
        // qui montait jusqu'à 8 % et un toKm qui descendait à 40 %. Sur un trajet
        // urbain de 10 km, cela amputait le dernier kilomètre ET tout le corridor
        // utile : les stations les moins chères situées près de l'arrivée
        // (Auteuil, Pont Aval) n'étaient jamais candidates. On cherche désormais
        // sur l'intégralité du trajet, du km 0 jusqu'à la queue.
        function getGasSearchWindow(routeTotalKm) {
            const tailKm = Math.min(
                GAS_CHEAP_TAIL_MAX_KM,
                Math.max(GAS_CHEAP_TAIL_MIN_KM, routeTotalKm * GAS_CHEAP_TAIL_RATIO)
            );
            return {
                fromKm:     0,
                toKm:       Math.max(0.5, routeTotalKm - tailKm),
                tailKm,
                totalKm:    routeTotalKm,
                maxDetourM: GAS_CHEAPEST_MAX_M,
            };
        }

        // Variable globale pour la fenêtre courante (utile au changement de carburant)
        let _gasSearchWindow = null;

        // Retourne le prix effectif d'une station pour un type de carburant donné.
        // Si SP95 est demandé et la station n'a pas de SP95, on retourne le prix E10
        // (même carburant en pratique — SP95-E10 est le sans-plomb standard en France).
        function getEffectivePrice(s, fuelType) {
            if (s[fuelType] != null) return s[fuelType];
            if (fuelType === 'sp95' && s.e10 != null) return s.e10;
            return null;
        }

        // Retourne le type réel du prix affiché (utile pour le badge)
        function getEffectiveFuelType(s, fuelType) {
            if (s[fuelType] != null) return fuelType;
            if (fuelType === 'sp95' && s.e10 != null) return 'e10';
            return fuelType;
        }

        function getStationsInWindow(stations, fuelType) {
            // Base commune aux deux modes : une station sans prix pour le carburant
            // demandé, ou dont le calcul routier a montré qu'elle dépasse le budget
            // de détour du mode courant, n'a rien à faire dans la liste.
            const pool = stations.filter(s =>
                !gasOverBudget(s) && getEffectivePrice(s, fuelType) != null
            );

            if (gasSortMode === 'proche') {
                // ── BULLE DE PROXIMITÉ ──
                // Rayon fixe autour de l'ancre (départ, puis position réelle).
                // Le tracé n'entre pas en jeu : une station à 800 m derrière moi
                // est plus « proche » qu'une station à 4 km pile sur la route.
                pool.forEach(s => { s._distAnchor = gasDistFromAnchorM(s); });

                let r = GAS_NEAR_RADIUS_M;
                let found = pool.filter(s => s._distAnchor <= r);
                // Élargissement progressif jusqu'à 5 km si la bulle nominale est
                // trop pauvre — en rase campagne, 2 km ne donnent parfois rien.
                while (found.length < GAS_NEAREST_COUNT && r < GAS_NEAR_RADIUS_MAX_M) {
                    r = Math.min(r + GAS_NEAR_RADIUS_STEP_M, GAS_NEAR_RADIUS_MAX_M);
                    found = pool.filter(s => s._distAnchor <= r);
                }

                // Le label doit annoncer le rayon RÉELLEMENT nécessaire, pas le
                // rayon exploré : si la boucle est montée à 5 km faute de trouver
                // 5 stations, mais que les 3 trouvées sont à moins de 2 km,
                // afficher « 5 km » serait trompeur.
                const maxFound = found.length
                    ? Math.max(...found.map(s => s._distAnchor))
                    : r;
                _gasNearRadiusUsedM = Math.min(
                    r,
                    Math.max(GAS_NEAR_RADIUS_M, Math.ceil(maxFound / 100) * 100)
                );

                _gasDiag.priced = pool.length;
                _gasDiag.near   = found.length;
                // Journal explicite : si la bulle paraît vide, ce log dit si le pool
                // est pauvre (problème API) ou si les stations sont juste trop loin.
                console.log(`[GasBulle] ${pool.length} stations avec prix ${fuelType} `
                    + `→ ${found.length} dans ${Math.round(r)}m`);
                if (pool.length) {
                    const apercu = [...pool].sort((a, b) => a._distAnchor - b._distAnchor)
                        .slice(0, 8)
                        .map(s => `${Math.round(s._distAnchor)}m ${s.name}`);
                    console.log('[GasBulle] 8 plus proches connues :', apercu);
                }

                // Rien même à 5 km : on rend les plus proches connues plutôt qu'une
                // liste vide, le label indiquera que la bulle a été dépassée.
                if (found.length === 0) {
                    return [...pool].sort((a, b) => a._distAnchor - b._distAnchor)
                                    .slice(0, GAS_NEAREST_COUNT);
                }
                return found;
            }

            // ── MODE « MOINS CHER » ──
            // Tout le trajet depuis le km 0, queue exclue. Le corridor à vol
            // d'oiseau n'est qu'un dégrossissage : le vrai verdict des 10 min
            // tombe dans renderGasCards, une fois le détour routier calculé.
            const toKm = (_gasSearchWindow && Number.isFinite(_gasSearchWindow.toKm))
                ? _gasSearchWindow.toKm : Infinity;

            const inWindow = pool.filter(s =>
                s.distAlongRoute <= toKm && (s.distToRoute || 0) <= GAS_CHEAPEST_MAX_M
            );
            if (inWindow.length > 0) return inWindow;

            // Repli : corridor relâché, borne d'arrivée toujours respectée.
            const relaxed = pool.filter(s => s.distAlongRoute <= toKm);
            if (relaxed.length > 0) return relaxed;

            // Dernier repli : stations localisées sans prix (BE/ES sans tarifs).
            return stations.filter(s =>
                s[fuelType] == null && s.hasPrices === false && s.distAlongRoute <= toKm
            );
        }

        /* Corrige en tâche de fond la position des stations dont le flux gouvernemental
           donne des coordonnées fausses (saisie de l'exploitant : parfois relevée à la
           pompe, parfois posée à la louche — une station du 16ᵉ tombe dans le parc
           Sainte-Périne). Chaque résultat passe par l'arbitrage de _gasPickBestPoint(),
           qui n'accepte que les géocodages réellement localisés : sans lui, la fonction
           décalerait au contraire les stations bien placées, par simple interpolation
           le long de la rue. Les marqueurs suivent la position retenue.
           Le coût est borné par les drapeaux _geoPending / _geoDone. */
        async function geocodeAllStations(stations) {
            const BATCH = 4;   // requêtes en parallèle max
            /* Trois filtres, pas un seul :
               - `_resolvedLng` : déjà résolue, rien à faire (garde d'origine) ;
               - `_geoPending`  : requête EN VOL lancée par un rendu précédent. Sans
                 elle, le second rendu — qui survient avant la fin du premier lot —
                 relançait le même géocodage pour les mêmes adresses. C'était la
                 moitié des appels dupliqués ;
               - `_geoDone`     : réponse reçue mais inexploitable (aucun résultat, ou
                 point incohérent à plus d'1 km). La réinterroger donnerait le même
                 verdict à chaque rendu.
               Un échec RÉSEAU, lui, ne pose pas `_geoDone` : il reste réessayable. */
            const toGeocode = stations.filter(s => s.addr && !s._resolvedLng && !s._geoPending && !s._geoDone);
            toGeocode.forEach(s => { s._geoPending = true; });
            for (let i = 0; i < toGeocode.length; i += BATCH) {
                const batch = toGeocode.slice(i, i + BATCH);
                await Promise.all(batch.map(async s => {
                    try {
                        const q = encodeURIComponent(normalizeStationAddr(s.addr));
                        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json`
                            + `?access_token=${MAPBOX_TOKEN}&limit=1&language=fr`
                            + `&types=address,poi&proximity=${s.lng},${s.lat}`;
                        const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
                        // Réponse reçue : le verdict est acquis, exploitable ou non.
                        // La réinterroger au rendu suivant donnerait le même résultat.
                        s._geoDone = true;
                        if (!res.ok) return;
                        const data = await res.json();
                        const best = _gasPickBestPoint(data.features?.[0], s.lng, s.lat, s.name);
                        if (!best) return;   // géocodage écarté : la source fait foi
                        s._resolvedLng = best[0];
                        s._resolvedLat = best[1];
                        /* Repositionner le marqueur existant. La recherche porte sur les
                           coordonnées BRUTES, qui ne changent jamais : elle retrouve donc
                           sa cible même si un nouveau rendu a reconstruit _gasMarkerEls
                           entre-temps. */
                        const m = _gasMarkerEls.find(mk =>
                            Math.abs(mk.lng - s.lng) < 0.0001 &&
                            Math.abs(mk.lat - s.lat) < 0.0001
                        );
                        if (m) m.marker.setLngLat(best);
                    } catch(e) {
                        // Échec réseau ou délai dépassé : verdict NON acquis, on laisse
                        // _geoDone à false pour qu'un rendu ultérieur puisse réessayer.
                    } finally {
                        s._geoPending = false;
                    }
                }));
                // Petite pause entre les batches pour ne pas saturer l'API
                if (i + BATCH < toGeocode.length) await new Promise(r => setTimeout(r, 200));
            }
        }

        function buildGasStationsUI(stations) {
            const loading = document.getElementById('gas-stations-loading');
            loading.style.display = 'none';

            // Calculer la fenêtre AVANT d'injecter les favoris (injectMissingFavorites en a besoin)
            if (modalPendingRoute) {
                const route = modalPendingRoute.osrmData.routes[0];
                const totalKm = (route.legs
                    ? route.legs.reduce((s, l) => s + l.distance, 0)
                    : route.distance) / 1000;
                _gasSearchWindow = getGasSearchWindow(totalKm);
            }

            // Marquer les stations déjà connues comme favorites
            const favs = _loadFavorites();
            (stations || []).forEach(s => {
                const fav = favs[_favKey(s)];
                if (fav) {
                    s._isFavorite = true;
                    s._visits     = fav.visits;
                }
            });

            // Injecter les favoris absents des résultats API (hors rayon, timeout…)
            const routeCoords = modalPendingRoute?.osrmData?.routes?.[0]?.geometry?.coordinates;
            const enriched = routeCoords
                ? injectMissingFavorites(stations || [], routeCoords)
                : (stations || []);

            _allGasStations = enriched;

            if (_allGasStations.length === 0) {
                clearGasStationMarkers();
                document.getElementById('gas-stations-list').innerHTML =
                    `<div style="font-size:12px;color:#4a5568;text-align:center;padding:8px 0;">Aucune station avec prix disponible sur ce trajet.</div>`;
                // Ce chemin ne passe PAS par renderGasCards : sans ce rappel, un hybride
                // sur un trajet sans pompe perdrait aussi ses bornes, qui existent.
                _appendMixedEvCards();
                return;
            }

            buildFuelSelector(_allGasStations);

            // Si le carburant sélectionné n'a aucune station dispo, prendre le premier disponible
            const hasFuel = _allGasStations.some(s => getEffectivePrice(s, selectedFuelType) != null);
            if (!hasFuel) {
                const firstAvail = FUEL_DEFS.find(f => _allGasStations.some(s => getEffectivePrice(s, f.key) != null));
                if (firstAvail) selectedFuelType = firstAvail.key;
            }

            // Les meilleures stations dans la fenêtre — favoris garantis visibles
            const sorted = selectTopStations(getStationsInWindow(_allGasStations, selectedFuelType), selectedFuelType);

            // Label rendu après le filtrage : il reflète le rayon réellement retenu
            _renderGasZoneLabel();

            selectedGasStation = null;
            renderGasCards(sorted);

            // Re-fetcher les prix actuels des favoris injectés (asynchrone, sans bloquer l'affichage)
            const stalesInView = sorted.filter(s => s._isFavorite && s._priceStale);
            if (stalesInView.length > 0) {
                const favs = _loadFavorites();
                stalesInView.forEach(async (s) => {
                    const freshPrices = await refreshFavoritePrice(s);
                    if (freshPrices) {
                        // Mettre à jour les prix dans _allGasStations
                        s.sp95   = freshPrices.sp95   ?? s.sp95;
                        s.e10    = freshPrices.e10    ?? s.e10;
                        s.gazole = freshPrices.gazole ?? s.gazole;
                        s.sp98   = freshPrices.sp98   ?? s.sp98;
                        s._priceStale = false;
                        // Sauvegarder les nouveaux prix dans les favoris
                        const key = _favKey(s);
                        if (favs[key]) {
                            favs[key].lastPrices = freshPrices;
                            favs[key].lastSeen   = Date.now();
                            _saveFavorites(favs);
                        }
                        // Re-rendre les cards avec les prix frais
                        const refreshed = selectTopStations(getStationsInWindow(_allGasStations, selectedFuelType), selectedFuelType);
                        renderGasCards(refreshed);
                        console.log(`[GasFav] Prix rafraîchi pour ${s.name} : E10=${freshPrices.e10}`);
                    }
                });
            }
        }

        function _renderGasZoneLabel() {
            // Injecter ou mettre à jour le label de zone dans le panneau
            let lbl = document.getElementById('gas-zone-label');
            if (!lbl) {
                lbl = document.createElement('div');
                lbl.id = 'gas-zone-label';
                lbl.style.cssText = 'font-size:11px;color:#4a5568;margin-bottom:8px;font-style:italic;';
                const selector = document.getElementById('gas-fuel-selector');
                if (selector) selector.after(lbl);
            }
            // Le label décrit le critère réellement appliqué, qui diffère selon
            // le mode : une bulle en « plus proche », un corridor en « moins cher ».
            // Suffixe de diagnostic lisible sans console : il dit d'un coup d'œil si
            // une bulle vide vient d'un pool pauvre (API) ou d'un filtrage trop dur.
            const diag = _gasDiag.parsed
                ? ` · ${_gasDiag.parsed} connues, ${_gasDiag.priced} avec prix`
                : '';

            if (gasSortMode === 'proche') {
                const km = _gasNearRadiusUsedM / 1000;
                const rayon = km < 10 ? km.toFixed(1).replace('.0', '') : Math.round(km);
                lbl.textContent = `Stations dans un rayon de ${rayon} km `
                    + (_gasAnchor ? 'autour de vous' : 'autour du départ') + diag;
            } else if (_gasSearchWindow) {
                lbl.textContent = `Stations sur le trajet (${Math.round(_gasSearchWindow.toKm)} km) `
                    + `— détour ≤ ${GAS_CHEAP_MAX_DETOUR_MIN} min` + diag;
            } else {
                lbl.textContent = '';
            }
        }

        /* Tronçon réellement utile au relevé carburant : sur un Paris→Marseille,
           getGasSearchWindow ne retiendra de toute façon que le début du parcours,
           scanner les 780 km était du gâchis. On borne au plus large entre la fenêtre
           de recherche et le rayon vol d'oiseau ; le PARSE, lui, se fait toujours
           contre le tracé complet pour que `distAlongRoute` reste comparable à la
           fenêtre. ⚠ Exemplaire unique : ce calcul vivait en double, à l'identique,
           dans loadGasStationsForRoute() et prefetchGasStationsPhase1(). */
        function _gasScanCoordsForRoute(routeCoords, etiquette) {
            const totalKm  = turf.length(turf.lineString(routeCoords), { units: 'kilometers' });
            const win      = getGasSearchWindow(totalKm);
            const scanToKm = Math.min(totalKm, Math.max(win.toKm, GAS_PHASE1_RADIUS_KM));
            const coords   = (totalKm > GAS_PHASE1_RADIUS_KM)
                ? (sliceRouteSegment(routeCoords, 0, scanToKm) || routeCoords)
                : routeCoords;
            if (coords !== routeCoords) {
                console.log(`[GasAPI/${etiquette}] Scan borné à ${Math.round(scanToKm)} km sur ${Math.round(totalKm)} km`);
            }
            return coords;
        }

        /* Les deux collectes partent EN PARALLÈLE : elles n'ont aucune source commune
           (data.gouv pour les pompes, Overpass pour les bornes), les sérialiser
           doublerait l'attente pour rien. Même choix que `runGasScan()` (js/11).
           Un réseau qui échoue ne fait pas tomber l'autre — un hybride garde alors la
           moitié de ses options au lieu d'une liste vide. */
        async function _fetchBothNetworks(routeCoords, etiquette) {
            const [gas, ev] = await Promise.all([
                fetchGasStationsAlongRoute(_gasScanCoordsForRoute(routeCoords, etiquette))
                    .then(raw => parseGasStations(raw, routeCoords))
                    .catch(e => { console.warn(`[GasAPI/${etiquette}] pompes —`, e.message || e); return []; }),
                fetchEVStationsAlongRoute(routeCoords)
                    .then(raw => parseEVStations(raw, routeCoords))
                    .catch(e => { console.warn(`[EV/${etiquette}] bornes —`, e.message || e); return []; }),
            ]);
            return { gas, ev };
        }

        async function loadGasStationsForRoute(routeCoords) {
            if (!navigator.onLine) {
                const loading = document.getElementById('gas-stations-loading');
                if (loading) { loading.style.display = 'block'; loading.textContent = '📵 Hors ligne — données stations indisponibles'; }
                return;
            }
            const loading = document.getElementById('gas-stations-loading');
            const list    = document.getElementById('gas-stations-list');

            loading.style.display = 'block';
            list.innerHTML = '';
            clearGasStationMarkers();
            selectedGasStation = null;

            // Adapter le titre et le comportement selon le type de véhicule
            const vCfg = loadVehicleConfig();
            const isElec = vCfg.type === 'electrique';

            const titleEl = document.getElementById('gas-section-title');
            if (titleEl) titleEl.textContent = isElec ? 'Bornes sur le trajet' : 'Stations sur le trajet';

            try {
                if (_panelIsMixed()) {
                    const deux = await _fetchBothNetworks(routeCoords, 'Mixte');
                    _mixedGasStations = deux.gas;
                    _mixedEvStations  = deux.ev;
                    _renderMixedPanel();
                } else if (isElec) {
                    const raw = await fetchEVStationsAlongRoute(routeCoords);
                    const stations = parseEVStations(raw, routeCoords);
                    buildEVStationsUI(stations);
                } else {
                    const raw = await fetchGasStationsAlongRoute(_gasScanCoordsForRoute(routeCoords, 'Phase1'));
                    const stations = parseGasStations(raw, routeCoords);
                    buildGasStationsUI(stations);
                }
            } catch (e) {
                loading.style.display = 'none';
                list.innerHTML = `<div style="font-size:12px;color:#666;text-align:center;padding:8px 0;">⚠️ Données indisponibles (${e.message || 'réseau'})</div>`;
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // === PHASE 1 : PRÉCHARGEMENT AUTOMATIQUE (au calcul du tracé) ===
        // ═══════════════════════════════════════════════════════════════════

        async function prefetchGasStationsPhase1(routeCoords) {
            if (!navigator.onLine || !routeCoords || routeCoords.length < 2) return;
            if (_gasPrefetchInFlight) return;
            /* La destination EST la station retenue : ni liste ni marqueurs à produire.
               Sortir ici évite aussi le scan complet et ses requêtes — les pastilles
               des autres stations n'ont plus lieu d'être une fois le choix arrêté. */
            if (_destIsChosenStation()) { clearGasStationMarkers(); return; }

            /* Le préchargement couvre LES TROIS types de véhicule. Il s'arrêtait
               d'abord sur « électrique », si bien qu'un conducteur d'électrique devait
               ouvrir le panneau puis attendre, là où un thermique trouvait sa liste
               déjà prête. ⚠ Il retombait ENSUITE sur la branche carburant pour tout ce
               qui n'était pas électrique — un hybride ne préchargeait donc que ses
               pompes, alors qu'il a un besoin réel des deux réseaux : c'est ce que la
               branche mixte ci-dessous corrige (22/08/2026). */
            const vCfg  = loadVehicleConfig();
            const vType = vCfg.type || 'thermique';

            if (_panelIsMixed()) {
                _gasPrefetchInFlight = true;
                _gasPrefetchDone     = false;
                try {
                    const deux = await _fetchBothNetworks(routeCoords, 'Mixte/Phase1');
                    // Même garde que les deux autres branches : le tracé a pu changer
                    // pendant le relevé (recalcul, étape ajoutée), on n'écrase rien.
                    if (modalPendingRoute?.osrmData?.routes?.[0]?.geometry?.coordinates === routeCoords) {
                        _mixedGasStations = deux.gas;
                        _mixedEvStations  = deux.ev;
                        _renderMixedPanel();
                        _gasPrefetchDone = true;
                    }
                } catch (e) {
                    console.warn('[Mixte/Phase1] Préchargement échoué —', e.message || e);
                } finally {
                    _gasPrefetchInFlight = false;
                }
                return;
            }

            if (vType === 'electrique') {
                _gasPrefetchInFlight = true;
                _gasPrefetchDone     = false;
                try {
                    const raw      = await fetchEVStationsAlongRoute(routeCoords);
                    const bornes   = parseEVStations(raw, routeCoords);
                    // Même garde que côté carburant : le tracé a pu changer pendant
                    // le scan (recalcul, étape ajoutée), on n'écrase alors rien.
                    if (modalPendingRoute?.osrmData?.routes?.[0]?.geometry?.coordinates === routeCoords) {
                        buildEVStationsUI(bornes);
                        _gasPrefetchDone = true;
                    }
                } catch (e) {
                    console.warn('[EV/Phase1] Préchargement échoué —', e.message || e);
                } finally {
                    _gasPrefetchInFlight = false;
                }
                return;
            }

            _gasPrefetchInFlight = true;
            _gasPrefetchDone     = false;
            try {
                const scanCoords = _gasScanCoordsForRoute(routeCoords, 'Phase1');
                const raw      = await fetchGasStationsAlongRoute(scanCoords);
                const stations = parseGasStations(raw, routeCoords);

                // Le tracé a pu changer pendant le scan (recalcul, waypoint ajouté) :
                // on n'écrase l'UI que si la route en cours est toujours la même.
                const stillCurrent = modalPendingRoute?.osrmData?.routes?.[0]?.geometry?.coordinates === routeCoords;
                if (stillCurrent) {
                    buildGasStationsUI(stations);
                    _gasPrefetchDone = true;
                }
            } catch (e) {
                console.warn('[GasAPI/Phase1] Préchargement échoué —', e.message || e);
                // Silencieux : le clic sur le panneau relancera un scan classique
            } finally {
                _gasPrefetchInFlight = false;
            }
        }

        // ═══════════════════════════════════════════════════════════════════
        // === PHASE 2 : SCAN LIVE EN NAVIGATION (fenêtre glissante) ===
        // Rafraîchit silencieusement la liste des stations devant le véhicule.
        // Déclencheurs : intervalle 30 min ET distance parcourue > zone morte.
        // ═══════════════════════════════════════════════════════════════════

        function resetGasLiveScan() {
            _gasAnchor = null;            // la bulle repart du point de départ
            _gasNearRadiusUsedM = GAS_NEAR_RADIUS_M;
            _gasLiveLastScanTime = 0;
            _gasLiveLastScanKm   = -Infinity;
            _gasLiveInFlight     = false;
        }

        /* ⚠⚠ CHANGEMENT D'ITINÉRAIRE EN ROULANT — appelée par `applyRouteResponse()` (js/19),
           donc aussi bien sur un recalcul de déviation que sur l'adoption d'une proposition
           d'itinéraire plus rapide. Corrige un défaut présent depuis l'origine (18/08/2026).

           CE QUI CLOCHAIT : le scan live lit `modalPendingRoute.osrmData…coordinates`, un
           INSTANTANÉ pris dans le modal AVANT le départ — et RIEN ne le réécrivait pendant la
           navigation (`recalculateRoute()` remplace `currentTurfLine` et `fullRouteLine`, pas
           celui-là). La fenêtre glissante continuait donc de courir le long du tracé de
           DÉPART. Invisible sur une déviation de 200 m, où les deux tracés se confondent ;
           faux d'emblée dès qu'on change vraiment de route, où les stations proposées sont
           alors celles de l'autoroute qu'on vient de quitter.

           ⚠ `resetGasLiveScan()` SEUL NE SUFFIT PAS, et c'est le piège de ce correctif : il
           remet `_gasLiveLastScanTime` à 0, donc `firstScan` à vrai — et la garde « premier
           scan » de `maybeScanGasStationsLive()` refuse alors de scanner tant qu'on n'a pas
           parcouru une zone morte entière (25 km sur un long trajet). Cette garde a raison AU
           DÉPART, où la liste de la phase 1 est fraîche ; elle a tort ICI, où cette même liste
           vient d'être scannée le long d'une route qu'on abandonne. D'où `_gasForceRescan`,
           consommé une seule fois, par le premier scan qui part réellement. */
        let _gasForceRescan = false;
        function notifyRouteChangedForGasScan(osrmData) {
            if (modalPendingRoute && osrmData) modalPendingRoute.osrmData = osrmData;
            // Verdicts de détour calculés contre l'ancien tracé : les purger, même geste
            // qu'au changement d'itinéraire dans le modal (js/04 et js/16).
            _allGasStations.forEach(s => { s._deltaMin = null; s._distAnchor = null; });
            _gasSearchWindow = null;
            resetGasLiveScan();
            _gasForceRescan = true;
        }

        // Appelé depuis la boucle GPS. Ne fait rien tant que les conditions
        // (temps + distance) ne sont pas réunies — coût quasi nul par frame.
        function maybeScanGasStationsLive(lng, lat) {
            // La bulle « plus proche » suit le véhicule : on la recentre à chaque
            // position, AVANT toutes les gardes du scan live (hors ligne, en vol,
            // véhicule électrique…). Le reclassement est throttlé dans setGasAnchor.
            setGasAnchor(lng, lat);

            if (!navigator.onLine) return;
            if (_gasLiveInFlight) return;
            if (!document.body.classList.contains('nav-active')) return;
            // On roule VERS la station choisie : pas de rafraîchissement en chemin,
            // il repeuplerait la carte de pastilles concurrentes.
            if (_destIsChosenStation()) return;

            const vCfg = loadVehicleConfig();
            if (vCfg.type === 'electrique') return;

            const routeCoords = modalPendingRoute?.osrmData?.routes?.[0]?.geometry?.coordinates;
            if (!routeCoords || routeCoords.length < 2) return;

            // Position du véhicule projetée sur le tracé (km depuis le départ)
            let currentKm;
            try {
                const snapped = turf.nearestPointOnLine(
                    turf.lineString(routeCoords), turf.point([lng, lat]), { units: 'kilometers' }
                );
                currentKm = snapped.properties.location;
            } catch(e) { return; }
            if (!Number.isFinite(currentKm)) return;

            // Cadence proportionnée à la longueur du trajet
            let totalKm;
            try {
                totalKm = turf.length(turf.lineString(routeCoords), { units: 'kilometers' });
            } catch(e) { return; }
            const cadence = getGasLiveCadence(totalKm);

            const now       = Date.now();
            const firstScan = _gasLiveLastScanTime === 0;
            const timeReady = _gasForceRescan || firstScan || (now - _gasLiveLastScanTime) >= cadence.intervalMs;
            // Zone morte : inutile de rescanner si on n'a pas vraiment avancé
            const movedKm   = currentKm - _gasLiveLastScanKm;
            const moveReady = _gasForceRescan || firstScan || movedKm >= cadence.deadZoneKm;

            if (!timeReady || !moveReady) return;

            // Le premier scan live n'a d'intérêt qu'une fois vraiment en route :
            // au démarrage, la liste de la phase 1 est encore parfaitement valide.
            // ⚠ Sauf après un CHANGEMENT D'ITINÉRAIRE : cette même liste décrit alors une
            // route qu'on vient de quitter, et attendre la zone morte (jusqu'à 25 km)
            // laisserait le conducteur avec les stations de l'ancien tracé. Voir
            // notifyRouteChangedForGasScan().
            if (firstScan && !_gasForceRescan && currentKm < cadence.deadZoneKm) {
                return;
            }

            _gasLiveInFlight     = true;
            _gasForceRescan      = false;   // consommé : ce scan-ci est celui qu'il réclamait
            _gasLiveLastScanTime = now;
            _gasLiveLastScanKm   = currentKm;

            scanGasStationsLive(routeCoords, currentKm)
                .catch(e => console.warn('[GasAPI/Live] Scan échoué —', e.message || e))
                .finally(() => { _gasLiveInFlight = false; });
        }

        async function scanGasStationsLive(routeCoords, currentKm) {
            const line    = turf.lineString(routeCoords);
            const totalKm = turf.length(line, { units: 'kilometers' });

            // Fenêtre glissante : de la position actuelle à +80 km devant.
            // On s'arrête avant l'arrivée — faire le plein au bout n'a pas de sens.
            // Fenêtre bornée à la distance restante : scanner 80 km devant soi n'a
            // aucun sens s'il ne reste que 6 km à parcourir.
            const remainingKm = Math.max(0, totalKm - currentKm);
            const windowKm    = Math.min(GAS_LIVE_WINDOW_KM, Math.max(3, remainingKm * 0.8));

            // Marge arrière : la bulle « plus proche » est centrée sur le véhicule
            // et déborde derrière lui. Sans ce recul, une station à 800 m dans le
            // dos ne serait jamais récupérée par l'API et resterait invisible.
            const backKm = GAS_NEAR_RADIUS_MAX_M / 1000;
            const fromKm = Math.max(0, currentKm - backKm);
            const toKm   = Math.min(totalKm, currentKm + windowKm);

            // Seuil abaissé : à 5 km, un trajet urbain de 10 km cessait de
            // rescanner passé la moitié du parcours, alors que la cadence
            // prévoit justement un rafraîchissement toutes les 5 min / 2 km.
            if (toKm - fromKm < 1.5) {
                console.log('[GasAPI/Live] Trop proche de l\'arrivée — scan ignoré');
                return;
            }

            const scanCoords = sliceRouteSegment(routeCoords, fromKm, toKm);
            if (!scanCoords) return;

            console.log(`[GasAPI/Live] Scan ${Math.round(fromKm)} → ${Math.round(toKm)} km`);

            const raw      = await fetchGasStationsAlongRoute(scanCoords);
            const stations = parseGasStations(raw, routeCoords);
            if (!stations.length) return;

            // Ne garder que ce qui est devant le véhicule, dans la fenêtre,
            // et sous le plafond de détour toléré.
            // Pré-filtre large en distance : ce n'est qu'un dégrossissage, le vrai
            // verdict tombe dans renderGasCards une fois le détour routier calculé.
            const maxDetourM = (GAS_MAX_DETOUR_MIN / 60) * 70 * 1000; // ~70 km/h moyen d'accès

            // En mode « plus proche », le critère est la distance au véhicule, pas
            // la position sur le tracé : on conserve tout ce qui tombe dans la bulle
            // élargie, y compris légèrement en arrière. En « moins cher », on garde
            // le filtre par fenêtre le long du trajet.
            const ahead = stations.filter(s => {
                if (gasSortMode === 'proche') {
                    return gasDistFromAnchorM(s) <= GAS_NEAR_RADIUS_MAX_M;
                }
                return s.distAlongRoute >= fromKm &&
                       s.distAlongRoute <= toKm &&
                       (s.distToRoute || 0) <= maxDetourM;
            });
            if (!ahead.length) {
                console.log('[GasAPI/Live] Aucune station retenue dans la fenêtre');
                return;
            }

            // Fenêtre de recherche recalée sur la position réelle du véhicule,
            // sinon getStationsInWindow filtrerait avec les bornes du départ.
            // La queue de trajet reste exclue en live, sinon un rescan proche de
            // l'arrivée proposerait des stations situées après la destination.
            const liveTailKm = Math.min(
                GAS_CHEAP_TAIL_MAX_KM,
                Math.max(GAS_CHEAP_TAIL_MIN_KM, totalKm * GAS_CHEAP_TAIL_RATIO)
            );
            _gasSearchWindow = {
                fromKm,
                toKm: Math.min(toKm, Math.max(0.5, totalKm - liveTailKm)),
                tailKm: liveTailKm,
                totalKm,
                maxDetourM
            };

            // Conserver les favoris déjà connus
            const favs = _loadFavorites();
            ahead.forEach(s => {
                const fav = favs[_favKey(s)];
                if (fav) { s._isFavorite = true; s._visits = fav.visits; }
            });

            _allGasStations = ahead;
            /* En hybride, le pool carburant du panneau est celui-ci : sans cette ligne,
               basculer sur « ⛽ » après une heure de route réafficherait les stations
               relevées au départ, loin derrière le véhicule. La phase 2 ne rafraîchit
               que les pompes — les bornes gardent le relevé de la phase 1. */
            if (_panelIsMixed()) _mixedGasStations = ahead;

            // Mise à jour SILENCIEUSE : pas de toast, pas de vocal.
            // On ne re-rend que si le panneau est effectivement ouvert, et jamais
            // par-dessus la liste des bornes qu'un hybride est en train de consulter.
            if (_gasStationsPanelOpen && !(_panelIsMixed() && _gasPanelKind === 'ev')) {
                const hasFuel = ahead.some(s => getEffectivePrice(s, selectedFuelType) != null);
                if (!hasFuel) {
                    const firstAvail = FUEL_DEFS.find(f => ahead.some(s => getEffectivePrice(s, f.key) != null));
                    if (firstAvail) selectedFuelType = firstAvail.key;
                }
                const sorted = selectTopStations(getStationsInWindow(ahead, selectedFuelType), selectedFuelType);
                _renderGasZoneLabel();
                renderGasCards(sorted);
            }

            console.log(`[GasAPI/Live] ${ahead.length} stations retenues devant le véhicule`);
        }

        // ═══════════════════════════════════════════════════════════════════

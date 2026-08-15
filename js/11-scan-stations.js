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

        async function runGasScan() {
            const status = document.getElementById('gas-scan-status');
            const list   = document.getElementById('gas-scan-list');
            if (!status || !list) return;
            if (_scanBusy) return;

            if (!navigator.onLine) {
                status.textContent = '📵 Hors ligne — prix des carburants indisponibles';
                list.innerHTML = '';
                _clearGasScanMarkers();
                return;
            }

            _scanBusy = true;
            // L'ancre est relue à chaque scan : le conducteur a pu avancer depuis
            // l'ouverture de la feuille. La zone suit, sinon le cercle resterait
            // sur la position d'il y a deux minutes.
            _scanAnchor = _gasScanAnchorPoint();
            _gasScanZoneUpdate(_scanAnchor, _scanRadiusKm);
            status.textContent = `🔄 Recherche dans un rayon de ${_scanRadiusKm} km…`;
            list.innerHTML = '';
            _clearGasScanMarkers();

            try {
                const mode = _scanVehicleMode();
                // Les deux collectes partent en parallèle en mode hybride : elles
                // n'ont aucune source commune, les sérialiser doublerait l'attente.
                const [rawGas, rawEv] = await Promise.all([
                    (mode === 'gas' || mode === 'both')
                        ? _gasScanFetchRaw(_scanAnchor[0], _scanAnchor[1], _scanRadiusKm).catch(() => [])
                        : Promise.resolve([]),
                    (mode === 'ev' || mode === 'both')
                        ? _evScanFetchRaw(_scanAnchor[0], _scanAnchor[1], _scanRadiusKm)
                        : Promise.resolve([]),
                ]);

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
                _fitMapToGasScan();
                _fetchGasScanDurations();   // en tâche de fond : les cartes sont déjà lisibles
            } catch (e) {
                logAppError('runGasScan', e);
                status.textContent = '⚠️ Recherche impossible (' + (e.message || 'réseau') + ')';
            } finally {
                _scanBusy = false;
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
                : getEffectivePrice(s, _scanFuel) != null);

            const isClosed = s => s.kind === 'gas' && getStationOpeningStatus(s).status === 'closed';
            const sorted = [...pool].sort((a, b) => {
                const ca = isClosed(a), cb = isClosed(b);
                if (ca !== cb) return ca ? 1 : -1;   // rideau baissé = fin de liste
                if (_scanSort === 'pascher' && a.kind === 'gas' && b.kind === 'gas') {
                    const pa = getEffectivePrice(a, _scanFuel), pb = getEffectivePrice(b, _scanFuel);
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
                card.addEventListener('click', () => {
                    if (_gasLongPressFired) { _gasLongPressFired = false; return; }
                    focusGasScanStation(i);
                });
                _attachStationLongPress(card, s);
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
                        <div class="gas-card-name">${s._isFavorite ? '⭐ ' : ''}${s.name}</div>
                        <div class="gas-card-addr">${s.addr || '—'}</div>
                        ${st.status === 'unknown' ? '' :
                          `<div style="font-size:9px;color:${col};margin-top:2px;font-weight:600;">${dot} ${st.label}</div>`}
                        ${s._isFavorite && s._visits > 1
                          ? `<div style="font-size:9px;color:#f39c12;margin-top:2px;">Visitée ${s._visits}×</div>` : ''}
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
                        <div class="gas-card-prices">
                            <span class="gas-price-pill" style="${pillStyle}">${fuelDef?.label} ${price.toFixed(3)}€</span>
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
                // Repère lu par la détection d'appui long de la carte : sans lui, une
                // pression sur une pastille armerait AUSSI la hotbox générale (les
                // marqueurs sont des enfants du conteneur #map) et les deux menus se
                // disputeraient l'ouverture à 400 ms.
                el.dataset.gasStation = '1';
                el.addEventListener('click', (ev) => {
                    ev.stopPropagation();
                    if (_gasLongPressFired) { _gasLongPressFired = false; return; }
                    focusGasScanStation(i);
                });
                _attachStationLongPress(el, s);
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

        // ── CHOIX « GO ICI » / « NE PAS GO » SUR UNE STATION ────────────────
        // Même geste que la hotbox générale (appui long 400 ms) et même moteur :
        // openHotbox() accepte une liste d'entrées. Rien n'est réimplémenté ici,
        // seuls le contenu, l'angle de départ et l'intitulé changent.

        let _gasLongPressFired = false;

        /* Coordonnées de la station retenue via « Go ici ». Sert à reconnaître la
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

        function _stationHotboxItems(s) {
            // startAngle -180 place la 1ʳᵉ entrée à gauche et la 2ᵉ à droite :
            // un choix binaire se lit à l'horizontale, refuser à gauche, accepter
            // à droite, dans le sens de lecture.
            return [
                { id: 'nogo', cls: 'hb-nogo', label: 'Ne pas go',
                  html: '<span class="hb-glyph">NON</span>',
                  act: () => { /* on ressort simplement du cercle */ } },
                { id: 'go', cls: 'hb-go', label: 'Go ici',
                  html: '<span class="hb-glyph">GO</span>',
                  act: () => _gasGoToStation(s) },
            ];
        }

        function openStationChoice(x, y, s) {
            openHotbox(x, y, _stationHotboxItems(s), {
                startAngle: -180,
                title: s.name || s.addr || 'Station'
            });
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

        /* Arme l'appui long sur une carte de résultat ou une pastille de prix.
           Le drapeau neutralise le `click` qui suit l'appui long, sinon relâcher
           le doigt recentrerait aussi la carte sur la station. Il est remis à
           false à chaque pointerdown : si le navigateur n'émet aucun click après
           un appui long (courant sur tactile), il ne doit pas avaler le tap suivant. */
        function _attachStationLongPress(el, station) {
            let timer = null, pt = null;
            const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } pt = null; };

            el.addEventListener('pointerdown', (e) => {
                if (e.button !== undefined && e.button > 0) return;
                _gasLongPressFired = false;
                cancel();
                pt = { x: e.clientX, y: e.clientY };
                timer = setTimeout(() => {
                    timer = null;
                    if (!pt) return;
                    _gasLongPressFired = true;
                    openStationChoice(pt.x, pt.y, station);
                }, HOTBOX_PRESS_MS);
            }, { passive: true });

            el.addEventListener('pointermove', (e) => {
                if (!pt) return;
                // Même tolérance que la hotbox : au-delà, c'est un défilement de liste.
                if (Math.hypot(e.clientX - pt.x, e.clientY - pt.y) > HOTBOX_MOVE_TOL) cancel();
            }, { passive: true });

            ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev =>
                el.addEventListener(ev, cancel, { passive: true }));
            el.addEventListener('contextmenu', (e) => e.preventDefault());
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

            // On cadre sur le CERCLE, pas sur les stations trouvées : le zoom suit
            // ainsi la distance demandée, et non le hasard des résultats. Un rayon
            // de 10 km ne renvoyant qu'une station voisine cadrerait sinon serré,
            // en contradiction avec la zone dessinée. Les stations sont de toute
            // façon toutes dans le cercle, elles restent donc visibles.
            try {
                map.fitBounds(_gasScanCircleBounds(_scanAnchor, _scanRadiusKm), {
                    padding: _gasScanPadding(), maxZoom: 16, duration: 800
                });
            } catch (e) {
                logAppError('_fitMapToGasScan', e);
            }
        }

        function checkRestStopSuggestion(d, distAlongKm) {
            if (!d || d.timeHours < nextRestThresholdHours) return;
            nextRestThresholdHours += REST_STOP_INTERVAL_HOURS;
            if (restAreas.length === 0 || !fullRouteLine) return;

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
            showRestStopBanner(best.name, best.distAlongKm - distAlongKm);
        }

        function checkRestStopReal(d, lng, lat) {
            if (!fullRouteLine || restAreas.length === 0) return;
            try {
                const snapped = turf.nearestPointOnLine(fullRouteLine, turf.point([lng, lat]), { units: 'kilometers' });
                checkRestStopSuggestion(d, snapped.properties.location);
            } catch (e) { if (DEBUG) console.warn("[checkRestStopReal] exception ignorée :", e); }
        }

        function showRestStopBanner(name, distKm) {
            const banner = document.getElementById('rest-stop-banner');
            banner.classList.remove('validated');
            document.getElementById('rest-stop-icon').innerText = '☕';
            document.getElementById('rest-stop-title').innerText = 'Pause conseillée';
            const distLabel = distKm < 1 ? Math.round(distKm * 1000) + " m" : distKm.toFixed(1) + " km";
            document.getElementById('rest-stop-detail').innerText = `${name} · dans ${distLabel}`;
            banner.classList.add('visible');
            playAudioSequence(['attention.ogg', 'time.ogg']);
        }

        function dismissRestStopBanner() {
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
                    restStopTracking = { active: true, areaName: nearArea.name, enteredAt: Date.now(), validated: false };
                }
                const elapsedMin = (Date.now() - restStopTracking.enteredAt) / 60000;
                if (elapsedMin >= requiredMinutes && !restStopTracking.validated) {
                    restStopTracking.validated = true;
                    validateRestStop(restStopTracking.areaName, elapsedMin, requiredMinutesOverride != null);
                }
            } else {
                restStopTracking = { active: false, areaName: null, enteredAt: null, validated: false };
            }
        }

        function validateRestStop(name, elapsedMin, isTest) {
            addPointsToActiveProfile(REST_STOP_BONUS_POINTS);
            const banner = document.getElementById('rest-stop-banner');
            banner.classList.add('validated');
            document.getElementById('rest-stop-icon').innerText = '✅';
            document.getElementById('rest-stop-title').innerText = isTest ? 'Pause validée (test) !' : 'Pause validée !';
            const detail = isTest ? `${name} · +${REST_STOP_BONUS_POINTS} pts` : `${name} · ${Math.round(elapsedMin)} min · +${REST_STOP_BONUS_POINTS} pts`;
            document.getElementById('rest-stop-detail').innerText = detail;
            banner.classList.add('visible');
            setTimeout(() => { if (banner.classList.contains('validated')) dismissRestStopBanner(); }, 6000);
        }

        let pendingLootScore = 0;

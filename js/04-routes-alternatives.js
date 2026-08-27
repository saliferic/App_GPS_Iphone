        // === ITINÉRAIRES ALTERNATIFS : affichage sur la carte ===
        function showAltRoutesOnMap(routes) {
            for (let i = 0; i < 3; i++) {
                const src = map.getSource(`alt-route-${i}`);
                if (!src) continue;
                if (i < routes.length) {
                    src.setData({ type: 'Feature', geometry: routes[i].geometry, properties: {} });
                } else {
                    src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} });
                }
            }
            highlightSelectedAltRoute(selectedRouteIndex);
        }

        function clearAltRoutes() {
            for (let i = 0; i < 3; i++) {
                const src = map.getSource(`alt-route-${i}`);
                if (src) src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} });
            }
            altRoutesData = [];
        }

        // Masque les tracés alternatifs pendant qu'un détour station est affiché.
        // Sans ça, la ligne colorée de l'itinéraire choisi (jaune pour le n°2) restait
        // visible par-dessus le tracé via station et donnait deux routes superposées.
        function setAltRoutesVisible(visible) {
            for (let i = 0; i < 3; i++) {
                ['alt-route-glow-' + i, 'alt-route-line-' + i].forEach(id => {
                    if (map.getLayer(id)) {
                        map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
                    }
                });
            }
        }

        function highlightSelectedAltRoute(index) {
            for (let i = 0; i < 3; i++) {
                const isSelected = (i === index);
                const glowId = `alt-route-glow-${i}`;
                const lineId = `alt-route-line-${i}`;
                if (map.getLayer(glowId)) {
                    map.setPaintProperty(glowId, 'line-opacity', isSelected ? 0.5 : 0.15);
                    map.setPaintProperty(glowId, 'line-width', isSelected ? 14 : 10);
                }
                if (map.getLayer(lineId)) {
                    map.setPaintProperty(lineId, 'line-color', isSelected ? ALT_ROUTE_COLORS[i] : ALT_ROUTE_COLORS_DIM[i]);
                    map.setPaintProperty(lineId, 'line-opacity', isSelected ? 0.9 : 0.4);
                    map.setPaintProperty(lineId, 'line-width', isSelected ? 5 : 3);
                }
            }
        }

        function selectAlternativeRoute(index) {
            if (index < 0 || index >= altRoutesData.length) return;
            selectedRouteIndex = index;
            highlightSelectedAltRoute(index);

            // Mettre à jour les cards
            document.querySelectorAll('.route-alt-card').forEach((card, i) => {
                card.classList.toggle('selected', i === index);
            });

            // Mettre à jour la route principale affichée
            const route = altRoutesData[index];
            setRouteLine(route.geometry.coordinates);
            currentTurfLine = turf.lineString(route.geometry.coordinates);

            // Mettre à jour le preview
            const distKm = route.distance / 1000;
            const durationH = route.duration / 3600;
            const maxPts = route.distance * POINTS_PER_METER;
            // Les zones de pause portent sur le tracé RETENU : changer d'alternative les
            // déplace. La signature de tracé (js/09) évite l'appel Overpass quand le
            // nouveau tracé partage les aires déjà relevées.
            tenterSansBruit(() => fetchRestAreasAlongRoute(durationH, currentTurfLine),
                            'selectAlternativeRoute/airesDeRepos');

            majPreviewTemps(durationH, distKm);
            document.getElementById('preview-distance').innerText = distKm.toFixed(1) + " km";
            document.getElementById('preview-points').innerText = maxPts.toFixed(2) + " pts";

            const cfg = loadVehicleConfig();
            const fuelCost = calcEnergyCost(distKm, cfg);
            const selectedOsrmData = { routes: [route] };
            const tollCost = avoidTolls ? 0 : estimateTollCost(selectedOsrmData);
            const totalCost = fuelCost + tollCost;
            document.getElementById('preview-fuel-cost').innerText = fuelCost.toFixed(2) + " €";
            document.getElementById('preview-toll-cost').innerText = avoidTolls ? "Évités" : formatTollEstimate(tollCost);
            document.getElementById('preview-total-cost').innerText = "~" + totalCost.toFixed(2) + " €";
            updateFuelCostLabel();

            // Mettre à jour modalPendingRoute pour pointer sur la route choisie.
            // ⚠ `traffic` est REPORTÉ : les alternatives viennent de la même réponse, donc
            // du même profil. Le perdre ici ferait partir le trajet sans ses ralentissements
            // colorés (js/03), qui ne se dessinent que sur une réponse `driving-traffic`.
            if (modalPendingRoute) {
                modalPendingRoute.osrmData = { code: "Ok", routes: [route], traffic: modalPendingRoute.osrmData?.traffic };
            }

            // Réanalyser les ZFE sur l'itinéraire choisi
            analyzeZFEForRoute(route.geometry.coordinates);

            // Recharger les stations pour le nouvel itinéraire.
            // Les résultats précédents portent sur l'ancien tracé : distAlongRoute et
            // les détours calculés n'y correspondent plus, il faut donc tout refaire.
            const _wasPanelOpen = _gasStationsPanelOpen;
            // Une station retenue l'était pour l'ancien tracé : la garder ferait partir
            // le trajet avec un waypoint qui n'est plus sur la route choisie.
            selectedGasStation = null;
            // Si un détour station était affiché, ses masquages doivent être levés,
            // sinon les tracés alternatifs resteraient invisibles après le changement.
            setAltRoutesVisible(true);
            _baseRouteForGas = null;
            _gasSearchWindow = null;
            _gasPrefetchDone = false;
            _allGasStations.forEach(s => { s._deltaMin = null; s._distAnchor = null; });
            resetGasLiveScan();

            const _gp = document.getElementById('gas-stations-panel');
            const _gc = document.getElementById('gas-toggle-chevron');
            const _gs = document.getElementById('gas-stations-section');
            // Conserver l'état ouvert/fermé choisi par l'utilisateur plutôt que de
            // replier le panneau sous ses doigts à chaque changement d'itinéraire.
            if (_gp) _gp.style.display   = _wasPanelOpen ? 'block' : 'none';
            if (_gc) _gc.style.transform = _wasPanelOpen ? 'rotate(90deg)' : 'rotate(0deg)';
            // Même règle qu'au calcul initial : rien à proposer si la destination est
            // elle-même la station retenue (voir _destIsChosenStation).
            if (_gs) _gs.classList.toggle('visible', !_destIsChosenStation());
            document.getElementById('gas-stations-list').innerHTML = '';
            clearGasStationMarkers();

            // Relancer le scan sur le nouveau tracé — c'est ce qui manquait :
            // l'ancien code vidait la liste sans jamais la reconstruire.
            prefetchGasStationsPhase1(route.geometry.coordinates);
        }

        let _routeChoicePanelOpen = false;
        let _tollPanelOpen = false;

        function toggleRouteChoicePanel() {
            _routeChoicePanelOpen = !_routeChoicePanelOpen;
            const panel   = document.getElementById('route-choice-panel');
            const chevron = document.getElementById('route-choice-chevron');
            panel.style.display     = _routeChoicePanelOpen ? 'block' : 'none';
            chevron.style.transform = _routeChoicePanelOpen ? 'rotate(90deg)' : 'rotate(0deg)';
        }

        function toggleTollOption() {
            _tollPanelOpen = !_tollPanelOpen;
            const panel   = document.getElementById('toll-toggle-panel');
            const chevron = document.getElementById('toll-toggle-chevron');
            if (panel)   panel.style.display     = _tollPanelOpen ? 'block' : 'none';
            if (chevron) chevron.style.transform = _tollPanelOpen ? 'rotate(90deg)' : 'rotate(0deg)';
        }

        // Volet "Informations trajet" : même mécanique que les trois volets ci-dessus.
        // Il utilise la classe .open plutôt qu'un display inline, parce que son contenu
        // doit s'afficher en flex-column (et non en block) pour garder l'espacement des lignes.
        let _tripInfoPanelOpen = false;
        function toggleTripInfoPanel() {
            _tripInfoPanelOpen = !_tripInfoPanelOpen;
            const panel   = document.getElementById('trip-info-details');
            const chevron = document.getElementById('trip-info-chevron');
            if (panel)   panel.classList.toggle('open', _tripInfoPanelOpen);
            if (chevron) chevron.style.transform = _tripInfoPanelOpen ? 'rotate(90deg)' : 'rotate(0deg)';
        }

        function setAvoidTolls(val) {            // Mettre à jour la checkbox cachée pour déclencher onAvoidTollsChange
            const cb = document.getElementById('avoid-tolls-toggle-modal');
            if (cb) { cb.checked = val; onAvoidTollsChange(cb); }
            // Mettre à jour les boutons Oui/Non
            const btnOui = document.getElementById('toll-btn-oui');
            const btnNon = document.getElementById('toll-btn-non');
            if (btnOui) { btnOui.classList.toggle('active-oui', val);  btnOui.classList.toggle('active-non', false); }
            if (btnNon) { btnNon.classList.toggle('active-non', !val); btnNon.classList.toggle('active-oui', false); }
        }

        function buildRouteAlternativesUI(routes) {
            const container = document.getElementById('route-alternatives');
            const section   = document.getElementById('route-choice-section');
            container.innerHTML = '';

            // Section toujours cachée si un seul itinéraire
            if (!routes || routes.length <= 1) {
                if (section) section.style.display = 'none';
                return;
            }

            // Identifier la plus rapide et la plus courte
            let fastestIdx = 0, shortestIdx = 0;
            routes.forEach((r, i) => {
                if (r.duration < routes[fastestIdx].duration) fastestIdx = i;
                if (r.distance < routes[shortestIdx].distance) shortestIdx = i;
            });

            const labels = routes.map((r, i) => {
                if (i === fastestIdx) return { text: 'Plus rapide', cls: 'fastest' };
                if (i === shortestIdx && shortestIdx !== fastestIdx) return { text: 'Plus court', cls: 'shortest' };
                return { text: 'Alternatif', cls: 'alt' };
            });

            routes.forEach((route, i) => {
                const distKm    = (route.distance / 1000).toFixed(1);
                const timeStr   = formatTime(route.duration / 3600);
                const card      = document.createElement('div');
                card.className  = 'route-alt-card' + (i === selectedRouteIndex ? ' selected' : '');
                card.innerHTML  = `
                    <div class="route-alt-color" style="background:${ALT_ROUTE_COLORS[i]}"></div>
                    <div class="route-alt-info">
                        <div class="route-alt-label">Itinéraire ${i + 1}</div>
                        <div class="route-alt-details"><span>🕐 ${timeStr}</span><span>📏 ${distKm} km</span></div>
                    </div>
                    <div class="route-alt-badge ${labels[i].cls}">${labels[i].text}</div>`;
                card.addEventListener('click', () => selectAlternativeRoute(i));
                container.appendChild(card);
            });

            // Afficher la section + ouvrir le panneau par défaut s'il y a des alternatives
            if (section) section.style.display = 'block';
            // Ouvrir automatiquement si plusieurs itinéraires
            if (!_routeChoicePanelOpen) toggleRouteChoicePanel();
        }

        // Clic sur une route alternative directement sur la carte
        function setupAltRouteClickHandlers() {
            for (let i = 0; i < 3; i++) {
                const lineId = `alt-route-line-${i}`;
                const glowId = `alt-route-glow-${i}`;
                [lineId, glowId].forEach(layerId => {
                    // Curseur pointer au survol
                    map.on('mouseenter', layerId, () => { map.getCanvas().style.cursor = 'pointer'; });
                    map.on('mouseleave', layerId, () => { map.getCanvas().style.cursor = ''; });
                    // Clic → sélectionner cette route
                    map.on('click', layerId, (e) => {
                        if (altRoutesData.length > 1 && i < altRoutesData.length) {
                            e.preventDefault && e.preventDefault();
                            selectAlternativeRoute(i);
                        }
                    });
                });
            }
        }
        map.on('load', setupAltRouteClickHandlers);

        // Marqueurs emoji simples (départ 🟢 / destination 🔴)
        function createEmojiMarkerEl(emoji) {
            const el = document.createElement('div');
            el.className = 'emoji-pin';
            el.style.fontSize = '22px';
            el.style.lineHeight = '22px';
            el.textContent = emoji;
            return el;
        }
        /* === VALIDATION DES COORDONNÉES ===
           Une seule coordonnée invalide suffit à faire échouer toute une séquence :
           Mapbox lève "Invalid LngLat object: (NaN, NaN)" dès qu'on lui passe autre chose
           qu'un couple de nombres, et l'erreur remontait telle quelle dans le bandeau du
           modal de confirmation. On valide donc en amont, systématiquement. */
        function isLngLat(c) {
            if (!Array.isArray(c) || c.length < 2) return false;
            const lng = Number(c[0]), lat = Number(c[1]);
            return Number.isFinite(lng) && Number.isFinite(lat)
                && Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
        }

        /* Ramène au format [lng, lat] les coordonnées héritées d'anciennes versions
           ({lat, lng}, {lat, lon}) et rejette tout ce qui n'est pas exploitable. */
        function normalizeLngLat(c) {
            if (isLngLat(c)) return [Number(c[0]), Number(c[1])];
            if (c && typeof c === 'object' && !Array.isArray(c)) {
                const lng = c.lng !== undefined ? c.lng
                          : (c.lon !== undefined ? c.lon : c.longitude);
                const lat = c.lat !== undefined ? c.lat : c.latitude;
                const pair = [Number(lng), Number(lat)];
                if (isLngLat(pair)) return pair;
            }
            return null;
        }

        function addEmojiMarker(lng, lat, emoji) {
            if (!isLngLat([lng, lat])) {
                logAppError('addEmojiMarker', new Error('coordonnées invalides : ' + JSON.stringify([lng, lat]) + ' (' + emoji + ')'));
                return null;   // les appelants testent déjà la valeur avant .remove()
            }
            return new mapboxgl.Marker({ element: createEmojiMarkerEl(emoji), anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
        }

        // Marqueur d'étape intermédiaire : rond bleu avec numéro
        function createWaypointMarkerEl(num) {
            const el = document.createElement('div');
            el.style.cssText = `
                width: 28px; height: 28px; border-radius: 50%;
                background: #1a6ef5;
                border: 3px solid #fff;
                box-shadow: 0 2px 8px rgba(0,0,0,0.5);
                display: flex; align-items: center; justify-content: center;
                color: #fff; font-size: 13px; font-weight: 800;
                font-family: 'Segoe UI', sans-serif;
                cursor: default;
            `;
            el.textContent = String(num);
            return el;
        }

        // Tableau des marqueurs waypoint sur la carte (modal)
        let waypointTempMarkers = [];

        function refreshWaypointMarkers() {
            // Supprimer tous les anciens marqueurs
            waypointTempMarkers.forEach(m => m.remove());
            waypointTempMarkers = [];
            // Recréer un marqueur pour chaque waypoint qui a des coords VALIDES.
            // Un simple `if (wp.coords)` laissait passer un [NaN, NaN] — truthy —
            // et setLngLat levait, hors de tout try : l'étape suivante n'était même
            // plus dessinée et le modal restait muet.
            modalWaypoints.forEach((wp, i) => {
                const c = normalizeLngLat(wp.coords);
                if (!c) {
                    if (wp.coords) logAppError('refreshWaypointMarkers', new Error('étape ' + (i + 1) + ' : coordonnées invalides ' + JSON.stringify(wp.coords)));
                    return;
                }
                const m = new mapboxgl.Marker({
                    element: createWaypointMarkerEl(i + 1),
                    anchor: 'center'
                }).setLngLat(c).addTo(map);
                waypointTempMarkers.push(m);
            });
        }

        function clearWaypointMarkers() {
            waypointTempMarkers.forEach(m => m.remove());
            waypointTempMarkers = [];
        }

        /* ═══ LE MARQUEUR DE POSITION PORTE LE COMPAGNON CHOISI    (27/08/2026) ═══

           Le point bleu est devenu l'animal qu'on est en train de sauver : c'est le
           même personnage que le hero du panneau, la barre de vie et la fenêtre
           d'arrivée: le montrer avancer sur la carte est ce qui relie le trajet au
           parcours. Il suit la sélection (`Compagnon.cle()`) — aucun réglage de plus à
           proposer, l'éléphant ou l'hippo selon ce qui est choisi dans Objectifs.

           ⚠ LE POINT BLEU ET SON ONDE SONT MASQUÉS, PAS SUPPRIMÉS — c'est le point à
           ne pas défaire (revu le 27/08/2026 : ils dépassaient sous les pattes, et deux
           repères de position pour un seul conducteur c'est un de trop). Ils restent
           dans le balisage parce qu'ils sont le REPLI : un PNG introuvable ne lève
           AUCUNE erreur, il ne dessine rien. Les retirer ferait disparaître la position
           du conducteur en pleine navigation, en silence, sur une simple casse de chemin.
           D'où `_animalCharge` : le point n'est masqué (`.has-animal`) qu'une fois
           l'image RÉELLEMENT chargée, vérifiée par un `Image()` hors écran. Tant qu'on
           ne sait pas, ou si le chargement échoue, le point bleu tient sa place.
           Un `onerror` sur le `<image>` SVG ne suffirait pas : il n'est pas émis de
           façon fiable d'un moteur à l'autre, et surtout jamais quand le fichier existe
           mais n'est pas une image.

           ⚠ L'ANIMAL EST RECADRÉ SUR SA BOÎTE ALPHA, pas posé tel quel. Les PNG sont
           des carrés de 512 dont un bon tiers est transparent : posé brut, la bête
           ferait deux tiers de la taille demandée et flotterait au-dessus du point.
           Le `viewBox` posé sur `boite` (js/22) découpe les pixels visibles, et le
           rapport largeur/hauteur en est déduit — aucune déformation possible, aucune
           valeur à régler à la main pour un futur compagnon.

           ⚠ TAILLE_ANIMAL_PX EST LE SEUL RÉGLAGE. Une seule constante pour les trois
           marqueurs (position hors trajet, conducteur, trajet libre) : ils doivent
           rester de la même taille, c'est le même animal qui passe de l'un à l'autre
           quand le trajet démarre. */
        const TAILLE_ANIMAL_PX = 75;

        /* Chemin d'image → true (chargée) / false (échec) / absent (on ne sait pas
           encore). Par CHEMIN et non par compagnon : deux clés peuvent pointer le même
           fichier, et c'est le fichier qui charge ou non. */
        const _animalCharge = {};

        function precharger(chemin) {
            if (chemin in _animalCharge) return;
            const img = new Image();
            img.onload  = () => { _animalCharge[chemin] = true;  rafraichirMarqueurCompagnon(); };
            img.onerror = () => { _animalCharge[chemin] = false; logAppError('marqueurGPS/image', new Error('introuvable : ' + chemin)); };
            img.src = chemin;
        }

        /* ═══ L'ÉTAT PHYSIQUE DU COMPAGNON, LU EN DIRECT           (27/08/2026) ═══

           L'animal sur la carte change d'image PENDANT le trajet : sain au-dessus de
           75 %, blessé en dessous, mort à 0. C'est la sanction rendue visible là où
           le conducteur regarde déjà — la barre de vie est en bas de l'écran, lui est
           au milieu de la route.

           ⚠ L'ICÔNE MORTE S'AFFICHE DÈS QUE LA JAUGE TOUCHE 0, ALORS QUE LA MORT N'EST
           PRONONCÉE QU'À L'ARRIVÉE (voir le registre des morts, js/24). Elle « ment »
           donc parfois : une barre vidée en route peut remonter et l'animal survivre.
           C'EST VOULU, et c'est le point à ne pas « corriger » : sans seconde chance
           visible, un joueur à 0 se dirait perdu pour perdu et cesserait de surveiller
           sa vitesse. Voir l'animal mort puis pouvoir le regagner est ce qui tient la
           conduite jusqu'au bout du trajet.

           L'état est LU ici et non poussé par js/24 : ce module ne dépend alors de rien
           (`typeof window.VieCompagnon`), et une planche d'expérimentation sans barre de
           vie affiche simplement l'animal sain. */
        function physiqueCourant() {
            if (typeof window.VieCompagnon === 'undefined') return 'sain';
            return tenterSansBruit(function () {
                if (typeof VieCompagnon.estMort === 'function' && VieCompagnon.estMort()) return 'mort';
                if (typeof etatPhysiqueVie !== 'function' || typeof VieCompagnon.valeur !== 'function') return 'sain';
                return etatPhysiqueVie(VieCompagnon.valeur());
            }, 'marqueurGPS/physique') || 'sain';
        }

        /* L'image à poser sur le marqueur, ou `null` s'il n'y a rien d'affichable —
           auquel cas le point bleu reste seul.

           ⚠ REPLI SUR L'IMAGE NORMALE, PAS SUR LE POINT BLEU. Tous les animaux n'ont
           pas leurs variantes `Blesser/` et `Dead/` (seul l'hippo au 27/08/2026), et
           une variante déclarée peut mettre un instant à charger. Retomber sur le point
           bleu ferait clignoter la position du conducteur à chaque passage de seuil :
           on garde l'animal sain, qui est faux sur l'état mais juste sur la position.
           Quand la variante finit par charger, `precharger()` rappelle le rafraîchis-
           sement et le fondu la met en place. */
        function imageMarqueur() {
            if (typeof window.Compagnon === 'undefined' || typeof Compagnon.image !== 'function') return null;
            const phys = physiqueCourant();
            let im = tenterSansBruit(() => Compagnon.image(null, phys), 'marqueurGPS/image');
            if (!im || !im.boite || !im.boite.w || !im.boite.h) return null;
            precharger(im.fichier);
            if (_animalCharge[im.fichier] !== true && phys !== 'sain') {
                const normal = tenterSansBruit(() => Compagnon.image(), 'marqueurGPS/image');
                if (normal && normal.boite && normal.boite.w && normal.boite.h) {
                    precharger(normal.fichier);
                    if (_animalCharge[normal.fichier] === true) im = normal;
                }
            }
            // Pas encore chargée (ou en échec) : on laisse le point bleu seul à l'écran.
            return (_animalCharge[im.fichier] === true) ? im : null;
        }

        function svgMarqueur(im) {
            const b = im.boite;
            const h = TAILLE_ANIMAL_PX;
            const w = Math.round(h * (b.w / b.h));
            /* `width`/`height` en attributs et non en CSS : la propriété `aspect-ratio`
               qu'il faudrait sinon n'est pas garantie sur la WebView de l'APK, et un
               SVG sans dimension y retombe sur 300×150 — l'animal deviendrait un
               rectangle étiré au travers de l'écran. */
            /* `data-fichier` : c'est lui qui dit si l'image affichée est déjà la bonne.
               Sans ce repère, le rafraîchissement rejouerait un fondu à chaque appel. */
            return `<svg class="pulse-marker-animal" data-fichier="${im.fichier}"
                         width="${w}" height="${h}"
                         viewBox="${b.x} ${b.y} ${b.w} ${b.h}" aria-hidden="true">
                        <image href="${im.fichier}" xlink:href="${im.fichier}"
                               x="0" y="0" width="512" height="512"/>
                    </svg>`;
        }

        function compagnonMarkerSvg() {
            const im = imageMarqueur();
            return im ? svgMarqueur(im) : '';
        }

        // Marqueur conducteur (point pulsant coloré), remplace le pattern L.divIcon répété.
        function createPulseMarkerEl(color) {
            const el = document.createElement('div');
            const animal = compagnonMarkerSvg();
            el.innerHTML = `
                <div class="pulse-marker-container${animal ? ' has-animal' : ''}">
                    <div class="pulse-marker-ring" style="background-color:${color};"></div>
                    <div class="pulse-marker-dot" style="background-color:${color};"></div>
                    ${animal}
                </div>`;
            return el.firstElementChild;
        }
        function addDriverMarker(lng, lat, color) {
            return new mapboxgl.Marker({ element: createPulseMarkerEl(color), anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
        }

        /* Changer de compagnon doit se voir sur la carte SANS attendre le trajet
           suivant. Les marqueurs Mapbox portent un élément DOM figé, construit une
           fois : on ne le reconstruit pas (il faudrait recréer le marqueur et perdre
           sa position), on remplace seulement le SVG à l'intérieur.
           Appelée par `Compagnon.choisir()` (js/22) via `typeof window.…`, comme la
           carte de badges — ce module est chargé APRÈS js/04 mais l'inverse n'est pas
           vrai, et la fonction peut manquer sur une planche d'expérimentation. */
        /* Le fondu entre deux états. Doit rester DISCRET : c'est un changement d'état,
           pas un effet — l'animal ne doit pas attirer l'œil du conducteur au moment où
           il change. Même durée en CSS (`.pulse-marker-animal`), les deux doivent
           bouger ensemble sinon l'ancienne image est retirée avant la fin du fondu. */
        const DUREE_FONDU_MS = 700;

        function rafraichirMarqueurCompagnon() {
            const im = imageMarqueur();
            document.querySelectorAll('.pulse-marker-container').forEach(c => {
                const presents = c.querySelectorAll('.pulse-marker-animal');
                c.classList.toggle('has-animal', !!im);
                if (!im) { presents.forEach(e => e.remove()); return; }

                /* Déjà la bonne image à l'écran : on ne touche à rien. La vie bouge à
                   chaque point GPS, cette fonction peut donc être appelée très souvent. */
                const dessus = presents[presents.length - 1];
                if (dessus && dessus.dataset.fichier === im.fichier
                    && !dessus.classList.contains('cp-sort')) return;

                /* Les deux images coexistent le temps du fondu : l'ancienne s'efface,
                   la nouvelle apparaît par-dessus. Les retirer d'abord ferait passer le
                   point bleu entre les deux — un clignotement en pleine navigation. */
                presents.forEach(e => {
                    if (e.classList.contains('cp-sort')) return;
                    e.classList.add('cp-sort');
                    setTimeout(() => e.remove(), DUREE_FONDU_MS);
                });
                c.insertAdjacentHTML('beforeend', svgMarqueur(im));
                const neuf = c.lastElementChild;
                neuf.classList.add('cp-entre');
                /* Reflow forcé, sinon le navigateur voit l'élément naître directement
                   opaque et ne joue aucune transition. `getBoundingClientRect()` et non
                   `offsetWidth` : ce dernier n'existe pas sur un élément SVG. */
                void neuf.getBoundingClientRect();
                neuf.classList.remove('cp-entre');
            });
        }
        window.rafraichirMarqueurCompagnon = rafraichirMarqueurCompagnon;

        /* Point de passage UNIQUE pour thème / trafic / bâtiments 3D. Deux raisons :
           — `setStyle()` détruit toutes les sources et couches, donc on ne le déclenche que
             si l'URL change réellement ;
           — quand elle ne change pas (cas du style Standard de nuit, identique que le trafic
             soit coché ou non), il FAUT quand même appliquer les réglages à la volée. C'est
             précisément ce qui manquait : la case trafic rappelait `setStyle()` avec la même
             URL, Mapbox n'avait rien à faire, et rien ne se passait à l'écran. */
        let _currentStyleUrl = getMapStyleUrl(isDarkMode, isTrafficVisible);

        function applyMapStyle() {
            const url = getMapStyleUrl(isDarkMode, isTrafficVisible);
            if (url !== _currentStyleUrl) {
                _currentStyleUrl = url;
                map.setStyle(url);   // style.load → setupMapLayers() → couches réinjectées
                return;
            }
            applyTrafficLayer();
            applyBuildings3DVisibility();
            applyStandardBasemapConfig();
        }

        function toggleMapTheme() {
            isDarkMode = !isDarkMode;
            localStorage.setItem('gps_map_theme', isDarkMode ? 'night' : 'day');
            applyMapStyle();
            if (map3D) map3D.setStyle(isDarkMode ? 'mapbox://styles/saliferic/cms7f8deg004e01sfg2j50kdp' : 'mapbox://styles/mapbox/navigation-day-v1');
            updateThemeUI();
        }

        function toggleTraffic() {
            isTrafficVisible = !isTrafficVisible;
            localStorage.setItem('gps_map_traffic', isTrafficVisible ? 'on' : 'off');
            applyMapStyle();
            updateTrafficUI();
        }

        function updateTrafficUI() {
            const chk = document.getElementById('traffic-toggle-btn');
            if (chk) chk.checked = isTrafficVisible;
        }

        function onTrafficToggleChange(chk) {
            isTrafficVisible = chk.checked;
            localStorage.setItem('gps_map_traffic', isTrafficVisible ? 'on' : 'off');
            applyMapStyle();
        }

        /* Conservée comme REDIRECTION : la section ne s'ouvre plus en accordéon mais en
           page pleine (openProfilSheet). Le bouton du Profil appelle directement la
           nouvelle fonction ; celle-ci couvre un appel qui subsisterait ailleurs, plutôt
           que de le laisser lever une ReferenceError. */
        function toggleAideConduite() { openProfilSheet('aide'); }
        function toggleBackupSection() {
            const body = document.getElementById('backup-body');
            const chevron = document.getElementById('backup-chevron');
            const open = body.style.display === 'none';
            body.style.display = open ? 'block' : 'none';
            if (chevron) chevron.style.transform = open ? 'rotate(180deg)' : '';
        }

        function initAideConduiteUI() {
            // Initialise l'état du toggle trafic depuis localStorage
            const chk = document.getElementById('traffic-toggle-btn');
            if (chk) chk.checked = isTrafficVisible;
            const hb = document.getElementById('hotbox-toggle-btn');
            if (hb) hb.checked = hotboxEnabled;
        }

        function updateThemeUI() {
            const btn = document.getElementById('theme-toggle-btn');
            if(btn) {
                btn.innerText = isDarkMode ? "🌙 Mode Nuit (Passer au Jour)" : "☀️ Mode Jour (Passer à la Nuit)";
                btn.style.background = isDarkMode ? "#333" : "#f39c12";
                btn.style.color = isDarkMode ? "white" : "black";
            }
            // Sync switch flottant
            const sw = document.getElementById('theme-switch');
            const lbl = document.getElementById('theme-switch-lbl');
            const knob = sw ? sw.querySelector('.switch-knob') : null;
            if (sw) {
                sw.classList.toggle('day', !isDarkMode);
            }
            if (knob) knob.textContent = isDarkMode ? '🌙' : '☀️';
            if (lbl) lbl.textContent = isDarkMode ? 'NUIT' : 'JOUR';

            if(isDarkMode) {
                document.body.classList.add('dark-mode');
            } else {
                document.body.classList.remove('dark-mode');
            }
        }

        let animationFrame = null;
        let isCourseStarted = false; 
        let isSimulationMode = false;
        let wakeLock = null;
        // Déclarées ici pour éviter ReferenceError dans initVehicleConfigUI / switchMainTab
        // appelés avant les blocs où ces let apparaissent plus bas dans le fichier
        let modalPendingRoute = null;

        // --- Etat du scan stations en deux phases (phase 1 prefetch / phase 2 live) ---
        // Declares ici, en amont de calculateTripPreview et du handler GPS qui les
        // lisent : un `let` place plus bas mettrait ces acces en temporal dead zone
        // et leverait une ReferenceError a l'execution.
        let _gasPrefetchInFlight = false;     // un prechargement phase 1 est en cours
        let _gasPrefetchDone     = false;     // phase 1 terminee : ne pas rescanner a l'ouverture
        let _gasLiveLastScanTime = 0;         // horodatage du dernier scan live
        let _gasLiveLastScanKm   = -Infinity; // position (km sur trace) du dernier scan live
        let _gasLiveInFlight     = false;     // un scan live est en cours
        let _tripModalWasOpen = false;
        
        const POINTS_PER_METER = 0.001; 
        const PENALTY_PER_METER = 0.005;
        const SPEED_TOLERANCE_FACTOR = 1.05; // marge radar (+5%) : seuil rouge pour dépassement volontaire

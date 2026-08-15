        // === LIGNE STYLE GOOGLE MAPS : ETA + distance + heure d'arrivée ===
        function updateGoogleEtaBar(remainingDistKm, remainingTimeHours) {
            const timeEl = document.getElementById('nav-google-eta-time');
            const detailEl = document.getElementById('nav-google-eta-detail');
            if (!timeEl || !detailEl) return;
            if (!remainingTimeHours || remainingTimeHours <= 0) { timeEl.innerText = "--"; detailEl.innerText = "-- · --"; return; }
            const totalMinutes = Math.max(1, Math.round(remainingTimeHours * 60));
            timeEl.innerText = totalMinutes + " min";
            const arrival = new Date(Date.now() + remainingTimeHours * 3600000);
            const arrivalLabel = arrival.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
            const distLabel = remainingDistKm.toFixed(1).replace('.', ',') + " km";
            detailEl.innerText = distLabel + " · " + arrivalLabel;
        }

        // Bouton "itinéraire alternatif" façon Google Maps : bascule l'évitement des péages
        // et recalcule l'itinéraire à partir de la position actuelle.
        function toggleAltRoute() {
            if (!isCourseStarted || drivers.length === 0 || !drivers[0].marker) return;
            currentAvoidTolls = !currentAvoidTolls;
            const btn = document.getElementById('nav-google-altroute');
            if (btn) {
                btn.classList.toggle('active', currentAvoidTolls);
                btn.title = currentAvoidTolls
                    ? "Itinéraire alternatif actif (péages évités) — toucher pour revenir à l'itinéraire initial"
                    : "Itinéraire alternatif (éviter les péages)";
            }
            const pos = drivers[0].marker.getLngLat();
            recalculateRoute(pos.lng, pos.lat);
        }

        function addDriver() {
            const color = PALETTE[drivers.length % PALETTE.length];
            const driver = {
                id: driverIdCounter++, color: color, behavior: 'good', badLevel: 1, dist: 0,
                score: 0, timeHours: 0, marker: null, actualSpeed: 0, speedSmoothed: 0,
                isSpeeding: false, hasSpeeded: false, lastCheckpoint: -1, finished: false,
                hardBrakings: 0, hardAccels: 0, ecoScore: 100  // score éco-conduite (0-100)
            };
            drivers.push(driver); renderDriversUI();
        }
        function updateDriverBehavior(index, behavior) { drivers[index].behavior = behavior; renderDriversUI(); }

        function renderDriversUI() {
            const container = document.getElementById('drivers-container');
            container.innerHTML = '';
            drivers.forEach((d, index) => {
                const card = document.createElement('div');
                card.className = `driver-card ${d.isSpeeding ? 'speeding' : ''}`;
                card.id = `driver-card-${d.id}`;
                card.innerHTML = `
                    <div class="driver-header">
                        <div style="margin-top: 5px;"><span class="driver-color-dot" style="background-color: ${d.color}"></span> Style de conduite</div>
                        <div class="driver-controls">
                            <select onchange="updateDriverBehavior(${index}, this.value)">
                                <option value="good" ${d.behavior === 'good' ? 'selected' : ''}>😇 Bon conducteur</option>
                                <option value="bad" ${d.behavior === 'bad' ? 'selected' : ''}>😈 Mauvais conducteur</option>
                            </select>
                        </div>
                    </div>
                    <div class="points-row">
                        <div class="speed-limit">Limite: <span id="limit-${d.id}">--</span></div>
                        <div class="points-box"><span id="pts-${d.id}" style="color: ${d.score < 0 ? '#ff6b6b' : '#4da3ff'}">${Math.max(0, d.score).toFixed(3)}</span> pts</div>
                    </div>`;
                container.appendChild(card);
            });
        }
        addDriver();

        /* Ping carte depuis le formulaire contact : le panneau descend en état réduit
           pour dégager la carte, le formulaire reste ouvert derrière et réapparaît
           intact une fois le point choisi. */
        function toggleContactMapPick() {
            const btn = document.getElementById('btn-pick-contact-addr');
            const mapEl = document.getElementById('map');
            const hint = document.getElementById('map-pick-hint');
            if (pickingMode === 'contact-addr') {
                pickingMode = null;
                if (btn) btn.classList.remove('active');
                mapEl.classList.remove('crosshair-cursor');
                if (hint) hint.classList.remove('visible');
                setPanelSnap('full');
                return;
            }
            // Un ping destination éventuellement en cours est annulé
            document.getElementById('btn-pick-end')?.classList.remove('active');
            pickingMode = 'contact-addr';
            if (btn) btn.classList.add('active');
            mapEl.classList.add('crosshair-cursor');
            const hintText = document.getElementById('map-pick-hint-text');
            if (hintText) hintText.innerText = "📍 Touchez la carte pour placer l'ADRESSE DU CONTACT";
            if (hint) hint.classList.add('visible');
            // Même logique que le ping destination : carte entièrement dégagée.
            setPanelSnap('hidden');
        }

        function clearContactTempMarker() {
            if (contactTempMarker) { contactTempMarker.remove(); contactTempMarker = null; }
        }

        function toggleMapPick(mode) {
            document.getElementById('btn-pick-end')?.classList.remove('active');
            document.getElementById('map').classList.remove('crosshair-cursor');
            if (pickingMode === mode) {
                // Annuler le ping → remonter le panneau
                pickingMode = null;
                setPanelSnap('full');
            } else {
                pickingMode = mode;
                document.getElementById('btn-pick-' + mode).classList.add('active');
                document.getElementById('map').classList.add('crosshair-cursor');
                // Le panneau s'efface entièrement sous le bandeau : on choisit un point sur
                // la carte, elle doit donc être dégagée au maximum. 'min' laissait dépasser
                // une poignée de 54 px qui rognait la zone cliquable pour rien. Le retour se
                // fait par la validation du point, le bouton Annuler du bandeau d'aide, ou
                // un appui sur l'onglet.
                setPanelSnap('hidden');
            }
        }
        function pickOnMapForModal(which) {
            pickingMode = 'modal-' + which;
            document.getElementById('trip-modal-overlay').classList.remove('open');
            document.getElementById('map').classList.add('crosshair-cursor');
            let hint = "📍 Touchez la carte pour placer la DESTINATION";
            if (which === 'start') hint = "📍 Touchez la carte pour placer le DÉPART";
            else if (String(which).startsWith('wp-')) hint = "📍 Touchez la carte pour placer l'ÉTAPE";
            document.getElementById('map-pick-hint-text').innerText = hint;
            document.getElementById('map-pick-hint').classList.add('visible');
        }
        function cancelModalMapPick() {
            // La bannière est partagée par tous les modes de ping : on route l'annulation
            // vers le bon contexte, sinon on rouvrirait le modal de trajet par erreur.
            if (pickingMode === 'contact-addr') { toggleContactMapPick(); return; }
            pickingMode = null; document.getElementById('map').classList.remove('crosshair-cursor');
            document.getElementById('map-pick-hint').classList.remove('visible');
            document.getElementById('trip-modal-overlay').classList.add('open');
        }

        map.on('click', async function(e) {
            if (!pickingMode) return;
            const lat = e.lngLat.lat, lng = e.lngLat.lng;

            // Ping carte pendant navigation → ajouter un arrêt intermédiaire
            if (pickingMode === 'nav-pin-stop') {
                pickingMode = null;
                document.getElementById('map').classList.remove('crosshair-cursor');
                document.getElementById('map-pick-hint').classList.remove('visible');
                document.getElementById('nav-btn-pin-stop')?.classList.remove('active-pin');
                isUserPanning = false;
                showRecenterBtn(false);

                // Reverse geocode pour avoir le nom
                const label = await reverseGeocodeToAddress(lat, lng) || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;

                // Ajouter comme prochain arrêt
                navWaypoints.unshift({ coords: [lng, lat], label });
                updateNavWaypointBadge();

                // Recalculer depuis la position courante du véhicule
                const driverPos = drivers[0]?.marker?.getLngLat();
                if (driverPos) recalculateRoute(driverPos.lng, driverPos.lat);
                return;
            }
            // Ping carte depuis la recherche en navigation (destination ou arrêt)
            if (pickingMode === 'nav-dest') {
                cancelNavMapPick();
                isUserPanning = false;
                showRecenterBtn(false);
                const label = await reverseGeocodeToAddress(lat, lng) || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
                applyNavSearchSelection([lng, lat], label);
                return;
            }
            // Ping carte pour l'adresse d'un contact
            if (pickingMode === 'contact-addr') {
                const inputField = document.getElementById('contact-adresse');
                if (inputField) inputField.value = "📍 Recherche de l'adresse...";
                contactAdresseCoords = [lng, lat];
                clearContactTempMarker();
                contactTempMarker = addEmojiMarker(lng, lat, '🏠');
                const joli = await reverseGeocodeToAddress(lat, lng);
                // À défaut d'adresse lisible on garde les coordonnées : le contact
                // reste enregistrable, c'est le point sur la carte qui fait foi.
                if (inputField) inputField.value = joli || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
                toggleContactMapPick();   // annule le mode et remonte le panneau
                return;
            }
            if (pickingMode === 'modal-start' || pickingMode === 'modal-end') {
                const which = pickingMode === 'modal-start' ? 'start' : 'end';
                if (which === 'start') {
                    modalStartCoords = [lng, lat]; modalStartManuallyEdited = true;
                    if (startTempMarker) startTempMarker.remove();
                    startTempMarker = addEmojiMarker(lng, lat, '🟢');
                } else {
                    modalEndCoords = [lng, lat];
                    if (endTempMarker) endTempMarker.remove();
                    endTempMarker = addEmojiMarker(lng, lat, '🔴');
                }
                const inputField = document.getElementById(which === 'start' ? 'modal-start-addr' : 'modal-end-addr');
                inputField.value = "📍 Recherche de l'adresse...";
                const joli = await reverseGeocodeToAddress(lat, lng);
                inputField.value = joli || "Adresse introuvable, veuillez réessayer";
                pickingMode = null;
                document.getElementById('map').classList.remove('crosshair-cursor');
                document.getElementById('map-pick-hint').classList.remove('visible');
                document.getElementById('trip-modal-overlay').classList.add('open');
                calculateTripPreview();
                return;
            }
            // Ping carte pour une étape intermédiaire
            if (pickingMode && pickingMode.startsWith('modal-wp-')) {
                const wpIdx = parseInt(pickingMode.replace('modal-wp-', ''), 10);
                const inputField = document.getElementById(`waypoint-input-${wpIdx}`);
                if (inputField) {
                    inputField.value = "📍 Recherche de l'adresse...";
                    const joli = await reverseGeocodeToAddress(lat, lng);
                    const finalLabel = joli || "Adresse introuvable";
                    inputField.value = finalLabel;
                    if (modalWaypoints[wpIdx] !== undefined) {
                        modalWaypoints[wpIdx] = { coords: [lng, lat], label: finalLabel };
                    }
                }
                pickingMode = null;
                document.getElementById('map').classList.remove('crosshair-cursor');
                document.getElementById('map-pick-hint').classList.remove('visible');
                document.getElementById('trip-modal-overlay').classList.add('open');
                refreshWaypointMarkers();
                recalcIfReady();
                return;
            }
            exactEndCoords = [lng, lat];
            if (endTempMarker) endTempMarker.remove();
            endTempMarker = addEmojiMarker(lng, lat, '🔴');
            updateFavPhoneUI('');
            setFavDropdownLabel(null); // ping libre sur la carte : plus aucun contact affiché
            const inputField = document.getElementById('end-addr');
            inputField.value = "📍 Recherche de l'adresse...";
            const joli = await reverseGeocodeToAddress(lat, lng);
            inputField.value = joli || "Adresse introuvable, veuillez réessayer";
            toggleMapPick('end'); // annule le mode ping → remonte le panneau via setPanelSnap('full')
        });

        async function reverseGeocodeToAddress(lat, lng) {
            try {
                const res = await fetchResilient(`https://api.mapbox.com/geocoding/v5/mapbox.places/${lng},${lat}.json?access_token=${MAPBOX_TOKEN}&language=fr`);
                const data = await res.json();
                return data?.features[0]?.place_name || "";
            } catch (err) { return ""; }
        }
        /* Mapbox encode les suffixes de voirie français de façon compacte : le 20 bis de la
           rue Wilhem est indexé « 20b Rue Wilhem », jamais « 20 bis Rue Wilhem ». Écrit en
           toutes lettres, le mot « bis » n'est pas reconnu comme suffixe : le géocodeur
           retombe sur le numéro 20 seul et l'interpole le long de la rue, ce qui décale le
           point de plusieurs dizaines de mètres — parfois au carrefour suivant.
           On réécrit donc bis/ter/quater sous leur forme suffixée avant d'interroger l'API. */
        function normalizeFrHouseNumber(query) {
            return (query || '')
                .replace(/\b(\d+)\s*bis\b/gi,    '$1b')
                .replace(/\b(\d+)\s*ter\b/gi,    '$1t')
                .replace(/\b(\d+)\s*quater\b/gi, '$1q');
        }

        /* === ADRESSES DES STATIONS-SERVICE : abréviations à développer ===
           Le champ `adresse` du flux data.gouv.fr est saisi librement par les
           exploitants, en majuscules et fortement abrégé : « 72 BLD DE VERDUN ».
           Mapbox ne reconnaît pas « BLD » comme un type de voie et retombe sur une
           correspondance approximative — souvent de l'autre côté d'un boulevard à
           chaussées séparées. Tapée en toutes lettres, « 72 Boulevard de Verdun »
           résout au bon point : la seule différence est l'abréviation.
           On développe donc les formes courantes avant toute requête, exactement
           comme normalizeFrHouseNumber() le fait pour les bis/ter.
           Seules les abréviations SANS ambiguïté figurent ici — « QU », « RD » ou
           « RN » en désignent plusieurs et sont volontairement laissées telles quelles. */
        const _FR_VOIE_ABBR = [
            [/\bBL?VD\b/gi, 'BOULEVARD'],   // BVD, BLVD
            [/\bBLD\b/gi,   'BOULEVARD'],
            [/\bBOUL\b/gi,  'BOULEVARD'],
            [/\bBD\b/gi,    'BOULEVARD'],
            [/\bAVE?\b/gi,  'AVENUE'],      // AV, AVE
            [/\bRTE\b/gi,   'ROUTE'],
            [/\bCHEM\b/gi,  'CHEMIN'],
            [/\bCHE\b/gi,   'CHEMIN'],
            [/\bIMP\b/gi,   'IMPASSE'],
            [/\bALL\b/gi,   'ALLEE'],
            [/\bPL\b/gi,    'PLACE'],
            [/\bSQ\b/gi,    'SQUARE'],
            [/\bF[AB]?BG\b/gi, 'FAUBOURG'], // FBG, FABG
            [/\bSTE\b/gi,   'SAINTE'],      // avant ST, sinon « STE » resterait entier
            [/\bST\b/gi,    'SAINT'],
        ];

        function normalizeStationAddr(addr) {
            let out = (addr || '').trim();
            _FR_VOIE_ABBR.forEach(([re, full]) => { out = out.replace(re, full); });
            return normalizeFrHouseNumber(out);
        }

        /* ═══ ARBITRAGE ENTRE DEUX POSITIONS POSSIBLES POUR UNE STATION ═══
           NI la source NI le géocodage ne sont fiables seuls — c'est le constat
           central, vérifié sur deux cas opposés :
             • 43-47 Bd de Verdun, Courbevoie → point data.gouv JUSTE,
               géocodage faux de 147 m (interpolé le long de l'axe) ;
             • 99 Av. de Versailles, Paris 16ᵉ → point data.gouv FAUX (il tombe
               dans le parc Sainte-Périne), géocodage juste (Google et Michelin
               concordent avec lui).
           Les coordonnées du flux sont saisies par l'exploitant : parfois relevées
           à la pompe, parfois posées à la louche.

           ⚠ LA DISTANCE NE PERMET PAS DE TRANCHER : le BON géocodage parisien est à
           ~200 m du point source, le MAUVAIS géocodage de Courbevoie à 147 m. Un
           simple seuil rejette donc le bon et accepte le mauvais — c'est exactement
           ce que faisait le seuil de 250 m.

           Le seul discriminant valable est la QUALITÉ annoncée par le géocodeur :
             • un résultat POI = il a trouvé l'établissement lui-même → le meilleur ;
             • `accuracy` rooftop / parcel / point = il a trouvé le NUMÉRO → fiable ;
             • `accuracy` interpolated / street = il n'a trouvé que la RUE et a
               interpolé la position → c'est le mode d'échec de Courbevoie, à rejeter.
           La distance ne sert plus que de garde-fou grossier contre l'aberration. */
        const GAS_GEO_TRUSTED_ACCURACY = ['rooftop', 'parcel', 'point', 'address'];
        const GAS_ADDR_MAX_DRIFT_M     = 400;

        /* Retourne les coordonnées géocodées si elles méritent de remplacer celles de
           la source, sinon null (on garde alors la source). Journalise sa décision :
           c'est le seul moyen de vérifier l'arbitrage sur un cas réel, depuis le
           téléphone, sans instrumenter le code. */
        function _gasPickBestPoint(feature, rawLng, rawLat, label) {
            if (!feature || !feature.geometry) return null;
            const [gLng, gLat] = feature.geometry.coordinates;
            if (!isLngLat([gLng, gLat])) return null;

            let dist;
            try {
                dist = turf.distance(turf.point([rawLng, rawLat]),
                                     turf.point([gLng, gLat]), { units: 'meters' });
            } catch (e) { return null; }

            const isPoi   = (feature.place_type || []).includes('poi');
            const acc     = (feature.properties && feature.properties.accuracy) || '';
            const precis  = isPoi || GAS_GEO_TRUSTED_ACCURACY.includes(acc);
            const retenu  = precis && dist < GAS_ADDR_MAX_DRIFT_M;

            console.log(`[StationAddr] ${label} — ${isPoi ? 'POI' : 'adresse'}`
                + ` accuracy=${acc || 'n/a'} Δ${Math.round(dist)}m → ${retenu ? 'RETENU' : 'ÉCARTÉ'}`
                + (retenu ? '' : (precis ? ' (trop loin)' : ' (position seulement interpolée)')));

            return retenu ? [gLng, gLat] : null;
        }

        /* === LIEUX NOMMÉS (monuments, gares, musées, cabarets, stades) ===
           Mesuré sur ce token, requête par requête : la passe `types=poi` de
           mapbox.places v5 renvoie ZÉRO résultat, quelle que soit la requête et quels
           que soient les autres paramètres (avec/sans country, avec/sans language,
           autocomplete true ou false). Elle ne filtrait donc rien : elle ne trouvait
           jamais RIEN. Tous les lieux nommés retombaient sur l'index général v5, qui
           ne contient ni la tour Eiffel ni le Moulin Rouge — seulement des communes,
           des lieux-dits et des rues aux noms voisins. D'où les résultats observés sur
           le téléphone : « La Tour, 34260 La Tour-sur-Orb » et « Rue du Moulin, 44660
           Rougé ». Ce n'était pas un problème de formulation de la phrase dictée.
           On interroge donc OpenStreetMap (Nominatim), dont l'index contient les lieux
           nommés et les classe par notoriété (champ `importance`) : « tour eiffel »,
           « moulin rouge », « arc de triomphe », « sacré cœur », « musée d'orsay »,
           « stade de france » et « place de la concorde » ressortent tous en premier
           résultat, même interrogés depuis l'autre bout de la France.
           Mapbox Search Box (`/search/searchbox/v1/forward`) sert de repli : il connaît
           bien la tour Eiffel, le Moulin Rouge et le Louvre, mais ignore l'Arc de
           triomphe, le Sacré-Cœur et le musée d'Orsay — d'où sa place en second. */

        // Minuscules + accents retirés, pour comparer « Champs-Élysées » et « champs elysees ».
        function _deburr(s) {
            return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        }

        /* La politique d'usage de Nominatim impose une requête par seconde maximum et
           interdit les rafales. On sérialise donc les appels dans une file et on met en
           cache les réponses de la session : une dictée = un appel, et redire la même
           phrase n'en déclenche aucun. */
        const OSM_MIN_INTERVAL_MS = 1100;
        const _osmCache = new Map();
        let _osmQueue = Promise.resolve();
        let _osmLastCallAt = 0;

        function _osmThrottled(task) {
            const run = _osmQueue.then(async () => {
                const attente = OSM_MIN_INTERVAL_MS - (Date.now() - _osmLastCallAt);
                if (attente > 0) await new Promise(r => setTimeout(r, attente));
                _osmLastCallAt = Date.now();
                return task();
            });
            // La file ne doit jamais rester bloquée sur l'échec d'une recherche précédente.
            _osmQueue = run.catch(() => {});
            return run;
        }

        async function _osmSearch(query) {
            const cle = _deburr(query);
            if (_osmCache.has(cle)) return _osmCache.get(cle);
            const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}`
                + `&format=jsonv2&addressdetails=1&limit=6&accept-language=fr`
                + `&countrycodes=fr,be,ch,lu,mc`;
            const brut = await _osmThrottled(async () => {
                // Pas de fetchResilient ici : une seule tentative, pour ne pas doubler
                // les appels vers un service communautaire à quota serré.
                const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
                if (!res.ok) throw new Error('Nominatim ' + res.status);
                return res.json();
            });
            const liste = Array.isArray(brut) ? brut : [];
            _osmCache.set(cle, liste);
            return liste;
        }

        /* `display_name` d'OSM est une chaîne à rallonge (« Tour Eiffel, 5, Avenue
           Anatole France, Quartier du Gros-Caillou, Paris 7e Arrondissement, Paris,
           Île-de-France, France métropolitaine, 75007, France »). Illisible dans le
           champ destination : on garde le nom du lieu + code postal et commune. */
        function _osmToResult(hit) {
            const a = hit.address || {};
            const ville = a.city || a.town || a.village || a.municipality || a.county || '';
            const suffixe = [a.postcode || '', ville].filter(Boolean).join(' ');
            const lieu = hit.name || (hit.display_name || '').split(',')[0];
            return {
                coords: [parseFloat(hit.lon), parseFloat(hit.lat)],
                label: suffixe ? `${lieu}, ${suffixe}` : (hit.display_name || lieu)
            };
        }

        /* Sépare « tour eiffel à paris » en lieu + ville. La ville ne doit JAMAIS être
           réinjectée telle quelle dans la requête : mesuré sur les deux géocodeurs, la
           coller au nom dégrade le résultat au lieu de l'affiner. Mapbox Search Box fait
           de la correspondance sur les noms commerciaux et « tour eiffel a paris » sort
           « Thaï Détente Spa Tour Eiffel - Paris 15ème » ; Nominatim, lui, ne rend plus
           aucun résultat pour « moulin rouge dans paris ». La ville sert donc uniquement
           à DÉPARTAGER les résultats d'une recherche faite sur le seul nom du lieu.
           Garde-fou : on ne coupe pas si la queue commence par un article (« à la
           bonne franquette »), qui signale un nom de lieu et non une commune.
           « sur » est volontairement absent des séparateurs : il appartient à des
           centaines de noms de communes (La Tour-sur-Orb, Nogent-sur-Marne) et
           découperait le nom que l'on cherche justement à préserver. */
        const _CITY_TAIL_RE = /^(.*\S)\s+(?:à|a|au|aux|dans)\s+((?!la\b|le\b|les\b|l'|un\b|une\b|des\b|du\b)[\p{L}][\p{L}\s'’-]{2,})$/u;

        function _splitPlaceAndCity(text) {
            const m = (text || '').trim().match(_CITY_TAIL_RE);
            if (!m) return { place: (text || '').trim(), city: '' };
            return { place: m[1].trim(), city: m[2].trim() };
        }

        /* Repli Mapbox. On reclasse les résultats par correspondance de nom : sans cela,
           une boutique ou une location saisonnière contenant le nom du monument passe
           devant le monument lui-même. */
        async function _searchBoxNamedPlace(query, proximity) {
            const url = `https://api.mapbox.com/search/searchbox/v1/forward?q=${encodeURIComponent(query)}`
                + `&access_token=${MAPBOX_TOKEN}&language=fr&country=fr,be,ch,lu,mc`
                + `&types=poi&limit=6&proximity=${proximity[0]},${proximity[1]}`;
            const res = await fetchResilient(url, {}, { timeoutMs: 5000, retries: 0 });
            const data = await res.json();
            const feats = (data && data.features) || [];
            if (!feats.length) return null;
            const cible = _deburr(query);
            const nom = f => _deburr(f.properties && f.properties.name);
            const choisi = feats.find(f => nom(f) === cible)
                        || feats.find(f => nom(f).startsWith(cible))
                        || feats[0];
            const p = choisi.properties || {};
            return {
                coords: choisi.geometry.coordinates,
                label: [p.name, p.place_formatted].filter(Boolean).join(', ') || query
            };
        }

        // Renvoie { coords, label } ou null si aucune source ne reconnaît le lieu.
        async function findNamedPlace(text, proximity) {
            const { place, city } = _splitPlaceAndCity(text);

            let hits = [];
            try { hits = await _osmSearch(place); }
            catch (e) { console.warn('[Géocodage] OSM indisponible:', e.message); }

            if (hits.length) {
                if (city) {
                    const c = _deburr(city);
                    const match = hits.find(h => _deburr(h.display_name).includes(c));
                    if (match) return _osmToResult(match);
                    // La ville dictée ne colle à aucun résultat : on retente la phrase entière.
                    try {
                        const complet = await _osmSearch(text);
                        if (complet.length) return _osmToResult(complet[0]);
                    } catch (e) { /* on garde le meilleur résultat sur le seul nom */ }
                }
                return _osmToResult(hits[0]);
            }

            try { return await _searchBoxNamedPlace(place, proximity); }
            catch (e) { return null; }
        }

        /* === LIEUX NOMMÉS DANS L'AUTOCOMPLÉTION (au fil de la frappe) ===
           On N'UTILISE PAS Nominatim ici : sa politique d'usage interdit explicitement
           l'autocomplétion (une requête par frappe, même débouncée, est exactement ce
           qu'elle proscrit). Photon est le moteur fait pour ça — mêmes données OSM,
           conçu pour la recherche au fil de la frappe, CORS ouvert, réponses mesurées
           entre 20 et 200 ms. Il trouve le bon lieu dès les premières lettres :
           « tour eif », « moulin ro », « arc de tri », « sacre co ».
           Ne PAS toucher au biais de proximité : le défaut de Photon (0.2) place la
           tour Eiffel en tête même interrogé depuis l'Hérault, alors qu'un biais réduit
           à 0.1 fait remonter les répliques et les lieux-dits homonymes. */
        const _PHOTON_BRUIT_TRANSPORT = new Set([
            'bus_stop', 'stop', 'halt', 'platform', 'subway_entrance', 'tram_stop',
            'station_entrance', 'traffic_signals', 'crossing'
        ]);
        // Déjà couvert (et mieux classé) par la passe villes de Mapbox : on ne double pas.
        const _PHOTON_BRUIT_COMMUNE = new Set([
            'city', 'town', 'village', 'hamlet', 'suburb', 'quarter', 'neighbourhood'
        ]);
        const _photonCache = new Map();

        /* Même forme que le `place_name` de Mapbox — « Tour Eiffel, 75007 Paris » — pour
           que la liste reste homogène quelle que soit la source, et pour que le
           dédoublonnage puisse comparer les deux sur leurs premiers segments.
           `state` (« Île-de-France ») est volontairement omis : Mapbox ne le met pas,
           l'ajouter empêcherait de reconnaître deux fois la même avenue. */
        function _photonLabel(p) {
            const rue = [p.housenumber, p.street].filter(Boolean).join(' ');
            const commune = [p.postcode, p.city || p.county].filter(Boolean).join(' ');
            return [p.name || rue, p.name ? rue : '', commune].filter(Boolean).join(', ');
        }

        // Renvoie [{ center, label }] — au plus `max` lieux nommés, sans doublon.
        async function _photonNamedPlaces(query, proximity, max = 3) {
            const cle = _deburr(query);
            if (_photonCache.has(cle)) return _photonCache.get(cle);
            const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}`
                + `&lang=fr&limit=10&lat=${proximity[1]}&lon=${proximity[0]}`;
            let feats = [];
            try {
                const res = await fetch(url, { signal: AbortSignal.timeout(3500) });
                if (!res.ok) throw new Error('Photon ' + res.status);
                const data = await res.json();
                feats = (data && data.features) || [];
            } catch (e) {
                return []; // l'autocomplétion Mapbox reste servie, on ne casse rien
            }
            const vus = new Set();
            const sorties = [];
            for (const f of feats) {
                const p = f.properties || {};
                if (!p.name) continue;                                   // sans nom : ce n'est pas un lieu nommé
                if (_PHOTON_BRUIT_TRANSPORT.has(p.osm_value)) continue;  // arrêts de bus, bouches de métro
                if (p.osm_key === 'place' && _PHOTON_BRUIT_COMMUNE.has(p.osm_value)) continue;
                const empreinte = _deburr(p.name) + '|' + _deburr(p.city || p.postcode || '');
                if (vus.has(empreinte)) continue;                        // « Champ de Mars - Tour Eiffel » ×3
                vus.add(empreinte);
                sorties.push({ center: f.geometry.coordinates, label: _photonLabel(p) });
                if (sorties.length >= max) break;
            }
            // Le cache sert à ne pas re-solliciter Photon quand on efface puis retape :
            // il n'a pas vocation à grossir toute la session.
            if (_photonCache.size > 120) _photonCache.clear();
            _photonCache.set(cle, sorties);
            return sorties;
        }

        /* Renvoie { coords, label } : le libellé est celui que Mapbox associe au lieu trouvé.
           Indispensable pour les monuments — « moulin rouge » doit rester « Moulin Rouge »
           à l'écran. Un reverse-géocodage des coordonnées obtenues rendrait « 82 Boulevard
           de Clichy », c'est-à-dire une adresse que l'utilisateur ne reconnaît pas comme sa
           demande, et qui donne l'impression que la recherche a échoué. */
        async function geocodeDetailed(address) {
            if (!navigator.onLine) throw new Error('Géocodage impossible hors ligne');
            address = normalizeFrHouseNumber(address);
            const coordMatch = address.match(/^([0-9.-]+),\s*([0-9.-]+)$/);
            if (coordMatch) {
                return { coords: [parseFloat(coordMatch[2]), parseFloat(coordMatch[1])], label: address };
            }
            const proximityCoords = lastRealCoords || [2.3522, 48.8566];

            /* `country` : sans lui, « tour eiffel » remontait la réplique de Las Vegas,
                  Mapbox classant par notoriété mondiale avant la proximité.
               `autocomplete=false` : le mode autocomplétion est actif PAR DÉFAUT sur ce
                  point d'entrée et fait de la correspondance par préfixe. C'est lui qui
                  transformait « moulin rouge » en « Moulins » (03) et « tour eiffel » en
                  « La Tour » (03160) : des communes dont le nom commence comme la requête,
                  jugées plus pertinentes que le monument. Pour une recherche finale, on veut
                  une correspondance sur le texte complet, pas sur son début. */
            const baseUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json`
                + `?access_token=${MAPBOX_TOKEN}&language=fr&country=fr,be,ch,lu,mc`
                + `&proximity=${proximityCoords[0]},${proximityCoords[1]}&autocomplete=false`;

            /* Un lieu nommé (monument, cabaret, gare, musée, stade) est cherché d'abord
               dans un index qui contient réellement ce genre de lieu — voir findNamedPlace :
               l'index général v5 interrogé ci-dessous n'en contient AUCUN, il ne sait
               répondre qu'avec la commune ou la rue au nom le plus proche.
               On saute cette passe pour une adresse NUMÉROTÉE (« 6 rue de Massy, Antony ») :
               OSM y perd le numéro et ne rend que la rue.
               Le seul critère est la présence d'un chiffre. Écarter aussi tout ce qui
               commence par un mot de voirie (_VOIRIE_RE) était trop large : « place de la
               Concorde », « place Bellecour », « cours Mirabeau » et « avenue des
               Champs-Élysées » sont des lieux, pas des adresses, et l'index général les
               envoyait dans la mauvaise commune — Bellecour à Pont-de-Veyle (01), Mirabeau
               à Ribécourt (60). Sur une rue sans numéro, OSM répond aussi bien que v5. */
            const looksLikeStreetAddress = /\d/.test(address);
            if (!looksLikeStreetAddress) {
                const nomme = await findNamedPlace(address, proximityCoords);
                if (nomme && nomme.coords && !isNaN(nomme.coords[0]) && !isNaN(nomme.coords[1])) return nomme;
            }

            const res = await fetchResilient(baseUrl + '&limit=1');
            const data = await res.json();
            if (!data.features || data.features.length === 0) throw new Error("Adresse introuvable.");
            const feature = data.features[0];
            return { coords: feature.center, label: feature.place_name || address };
        }

        // Compatibilité : la grande majorité des appelants ne veut que les coordonnées.
        async function geocode(address) {
            return (await geocodeDetailed(address)).coords;
        }

        // Géocode et zoome sur l'adresse quand l'utilisateur tape manuellement
        // (sans cliquer sur une suggestion de la liste déroulante) puis quitte le champ.
        let resolveTypedDestinationToken = 0;
        async function resolveTypedDestination() {
            /* Déjà résolu via suggestion / favori / dictée / ping carte : rien à géocoder,
               mais on REJOUE le recadrage. Quitter la cellule est précisément le moment où
               l'utilisateur attend de voir où il va — et c'est aussi celui où le panneau
               reprend sa hauteur normale, donc où la mesure de cadrage devient juste.
               Sans ce rappel, entrer puis ressortir du champ sans rien changer laissait la
               carte là où elle était. */
            if (exactEndCoords) { focusDestinationOnMap(exactEndCoords, { zoom: 16, duration: 800 }); return; }
            const inputEl = document.getElementById('end-addr');
            const query = inputEl.value.trim();
            if (query.length < 3) return;
            const token = ++resolveTypedDestinationToken;
            // Laisse le temps à un clic sur une suggestion de s'exécuter avant de géocoder.
            await new Promise(r => setTimeout(r, 200));
            if (token !== resolveTypedDestinationToken || exactEndCoords) return;
            try {
                const coords = await geocode(query);
                if (token !== resolveTypedDestinationToken || exactEndCoords) return;
                exactEndCoords = coords;
                if (endTempMarker) endTempMarker.remove();
                endTempMarker = addEmojiMarker(coords[0], coords[1], '🔴');
                // Le géocodage est asynchrone et se termine souvent après la sortie du
                // champ : on ne touche plus au panneau, exitDestinationSearchMode() a
                // déjà rétabli son état d'origine (sinon on écraserait la restauration).
                if (_searchFocusActive) finishDestinationSearchMode();
                focusDestinationOnMap(coords);
            } catch (err) {
                // Adresse introuvable : on laisse le texte tel quel, la validation du trajet le signalera.
            }
        }

        // Mots-clés de voirie : si la saisie commence par l'un d'eux, on est en mode adresse
        const _VOIRIE_RE = /^(rue|avenue|av\.?|boulevard|bd\.?|chemin|ch\.?|impasse|alle?e|all\.?|route|rte\.?|place|pl\.?|passage|parc|domaine|hameau|lieu.dit|lotissement|résidence|res\.?|voie|cours|quai|square|villa|cité|cite|sentier|montée|montee|ruelle|traverse|villa|grand.?rue)\s+/i;

        setupAddressAutocomplete('end-addr', 'end-addr-suggestions', (coords, label) => {
            exactEndCoords = coords;
            if (endTempMarker) endTempMarker.remove();
            endTempMarker = addEmojiMarker(coords[0], coords[1], '🔴');
            // Adresse validée : le panneau reprend l'état qu'il avait avant la saisie,
            // puis on recadre la carte une fois sa hauteur définitive connue.
            if (_searchFocusActive) finishDestinationSearchMode();
            else setPanelSnap('half');
            focusDestinationOnMap(coords);
        });
        setupAddressAutocomplete('modal-start-addr', 'modal-start-addr-suggestions', (coords) => {
            // Le clavier mobile ampute la fenêtre : on le referme avant tout calcul
            // de cadrage, sinon fitBounds travaille sur une carte deux fois trop courte.
            const _msa = document.getElementById('modal-start-addr'); if (_msa) _msa.blur();
            // Une suggestion sans coordonnées exploitables ferait lever flyTo, et le
            // throw partirait hors de tout try : plus aucun message, bouton figé.
            const cStart = normalizeLngLat(coords);
            if (!cStart) {
                logAppError('autocomplete/modal-start-addr', new Error('coordonnées invalides : ' + JSON.stringify(coords)));
                const st = document.getElementById('modal-status');
                st.innerText = "Ce départ n'a pas de position exploitable, choisissez une autre suggestion.";
                st.style.color = "#ff6b6b";
                return;
            }
            modalStartCoords = cStart; modalStartManuallyEdited = true;
            document.getElementById('trip-preview').style.display = 'none';
            document.getElementById('btn-validate-trip').disabled = true;
            map.flyTo({ center: cStart, zoom: 15, duration: 800 });
            if (modalEndCoords) calculateTripPreview();
            else { document.getElementById('modal-status').innerText = "Entrez une destination."; document.getElementById('modal-status').style.color = "#f39c12"; }
        });
        setupAddressAutocomplete('modal-end-addr', 'modal-end-addr-suggestions', (coords) => {
            // Idem départ : clavier refermé avant le calcul, pour que le recadrage
            // se fasse sur la hauteur d'écran réelle.
            const _mea = document.getElementById('modal-end-addr'); if (_mea) _mea.blur();
            const cEnd = normalizeLngLat(coords);
            if (!cEnd) {
                logAppError('autocomplete/modal-end-addr', new Error('coordonnées invalides : ' + JSON.stringify(coords)));
                const st = document.getElementById('modal-status');
                st.innerText = "Cette destination n'a pas de position exploitable, choisissez une autre suggestion.";
                st.style.color = "#ff6b6b";
                return;
            }
            modalEndCoords = cEnd;
            document.getElementById('trip-preview').style.display = 'none';
            document.getElementById('btn-validate-trip').disabled = true;
            map.flyTo({ center: cEnd, zoom: 15, duration: 800 });
            if (modalStartCoords) calculateTripPreview();
            else { document.getElementById('modal-status').innerText = "Entrez un point de départ."; document.getElementById('modal-status').style.color = "#f39c12"; }
        });
        setupAddressAutocomplete('contact-adresse', 'contact-adresse-suggestions', (coords, label) => {
            contactAdresseCoords = coords;
        });

        function triggerPenaltyAnimation(id) { const card = document.getElementById(`driver-card-${id}`); if(card) card.classList.add('speeding'); }

        // Remet le dropdown à "Choisir un contact" si la destination tapée ne correspond plus au contact sélectionné
        function onEndAddrManualInput() {
            saveDestinationDraft();
            /* Le contact affiché dans « Adresses enregistrées » ne vaut que tant que la
               destination correspond à son adresse : dès que la saisie s'en écarte, on
               remet le libellé neutre, sinon la liste continuerait d'annoncer un contact
               sans rapport avec le point visé.
               On lit activeFavIndex et non dropdown.value : cette valeur est délibérément
               laissée à '' pour que le même contact reste resélectionnable (voir
               setFavDropdownLabel). S'y fier ici revenait à ne jamais rien réinitialiser. */
            if (activeFavIndex === null || activeFavIndex === undefined || activeFavIndex === '') return;
            const fav = favorites[parseInt(activeFavIndex)];
            const typed = document.getElementById('end-addr').value.trim();
            if (!fav || typed !== fav.address) {
                updateFavPhoneUI('');
                setFavDropdownLabel(null);
            }
        }

        // === PERSISTANCE DE LA DESTINATION SAISIE ===
        /* Sur Android, une rotation d'écran détruit et recrée l'activité : la WebView
           recharge la page et tout l'état en mémoire est perdu, y compris l'adresse déjà
           saisie. On la conserve donc en localStorage pour la rétablir au chargement.
           Durée de vie volontairement courte : une destination d'hier n'a plus de sens. */
        const DEST_DRAFT_KEY = 'gps_dest_draft';
        const DEST_DRAFT_TTL_MS = 6 * 60 * 60 * 1000; // 6 h

        function saveDestinationDraft() {
            try {
                const input = document.getElementById('end-addr');
                if (!input) return;
                const label = input.value.trim();
                if (!label) { localStorage.removeItem(DEST_DRAFT_KEY); return; }
                localStorage.setItem(DEST_DRAFT_KEY, JSON.stringify({
                    label,
                    coords: exactEndCoords || null,
                    savedAt: Date.now()
                }));
            } catch (e) { /* quota plein ou stockage indisponible : sans conséquence */ }
        }

        function clearDestinationDraft() {
            try { localStorage.removeItem(DEST_DRAFT_KEY); } catch (e) {}
        }

        function restoreDestinationDraft() {
            let draft = null;
            try {
                const raw = localStorage.getItem(DEST_DRAFT_KEY);
                if (!raw) return;
                draft = JSON.parse(raw);
            } catch (e) { return; }
            if (!draft || !draft.label) return;
            if (!draft.savedAt || (Date.now() - draft.savedAt) > DEST_DRAFT_TTL_MS) {
                clearDestinationDraft();
                return;
            }
            const input = document.getElementById('end-addr');
            if (!input) return;
            input.value = draft.label;
            input.style.color = '';   // le brouillon est une adresse valide, jamais une erreur
            if (Array.isArray(draft.coords) && draft.coords.length === 2) {
                exactEndCoords = draft.coords;
                // Le marqueur est reposé, mais on ne déplace pas la carte : à l'ouverture
                // la vue doit rester sur la position du conducteur.
                try {
                    if (endTempMarker) endTempMarker.remove();
                    endTempMarker = addEmojiMarker(draft.coords[0], draft.coords[1], '🔴');
                } catch (e) {}
            }
        }

        function clearDestination() {
            const destInput = document.getElementById('end-addr');
            destInput.value = "";
            // Le champ est partagé avec la dictée, qui le colore en style inline : sans
            // cette remise à zéro, ce que l'utilisateur tape après avoir vidé le champ
            // s'écrit en rouge, hérité d'une dictée ratée. Voir resetAddrFieldColor().
            destInput.style.color = '';
            exactEndCoords = null;
            clearDestinationDraft();
            if (endTempMarker) { endTempMarker.remove(); endTempMarker = null; }
            /* La liste « Adresses enregistrées » n'est PAS réinitialisée : la croix ne vide
               que la destination. Le nom du contact reste affiché comme repère. La remise à
               zéro silencieuse se fait à l'ouverture de la liste (voir plus bas), sinon
               resélectionner le même contact n'émettrait aucun événement `change`. */
            toggleCreateContactForm(false);
            document.getElementById('end-addr').focus();
        }

        /* Quand la destination est vide alors qu'un contact reste affiché dans la liste,
           on remet la valeur à zéro au moment précis où l'utilisateur déplie le menu. Cela
           rend le même contact re-sélectionnable (un `select` n'émet `change` que si la
           valeur diffère) sans jamais effacer le nom tant que la liste n'est pas ouverte. */

        let modalMode = 'real'; let modalStartManuallyEdited = false; let modalStartCoords = null; let modalEndCoords = null;
        // modalPendingRoute déclaré plus haut (globals)
        // Étapes intermédiaires dans le modal (entre départ et arrivée)
        let modalWaypoints = []; // [{ coords: [lng,lat], label: 'Adresse...' }, ...]
        // Étapes intermédiaires pendant la navigation (pas encore atteintes)
        let navWaypoints = [];   // [{ coords: [lng,lat], label: '...' }, ...]
        let avoidTolls = localStorage.getItem('gps_avoid_tolls') === '1';
        // Synchroniser les deux checkboxes avoid-tolls au démarrage
        ['avoid-tolls-toggle-modal'].forEach(id => {
            const cb = document.getElementById(id);
            if (cb) cb.checked = avoidTolls;
        });
        let currentAvoidTolls = false;

        function updateStartModeUI() {
            const isSim = document.getElementById('mode-switch').checked;
            document.getElementById('mode-label-real').classList.toggle('active', !isSim);
            document.getElementById('mode-label-sim').classList.toggle('active', isSim);
        }

        function handleStartClick() {
            const statusBox = document.getElementById('status');
            const destValue = document.getElementById('end-addr').value.trim();
            if (!destValue) { statusBox.innerText = "Veuillez indiquer une destination."; statusBox.style.color = "#ff6b6b"; return; }
            if (drivers.length === 0) { statusBox.innerText = "Ajoutez au moins un conducteur."; statusBox.style.color = "#ff6b6b"; return; }

            /* Clavier mobile refermé AVANT tout calcul de cadrage. Ouvert, il ampute la
               hauteur du canevas (~450 px au lieu de ~830) : fitMapToModalRoute() cadre
               alors le trajet pour une bande de carte qui n'existera plus une seconde plus
               tard, et l'aperçu s'affiche vu de beaucoup trop loin. Le repli existant
               (initModalRefitOnViewportGrow) ne rattrape le coup que si la WebView émet un
               `resize` en refermant le clavier — ce qui n'est pas garanti sur Android.
               Même parade que les champs d'adresse du modal, qui blurent déjà avant de
               calculer. Les 450 ms d'effet de chargement ci-dessous laissent au clavier le
               temps de descendre. */
            try {
                const ae = document.activeElement;
                if (ae && typeof ae.blur === 'function' && ae !== document.body) ae.blur();
            } catch (e) {}

            const isSim = document.getElementById('mode-switch').checked;
            const btnStart = document.getElementById('btn-start');
            btnStart.classList.add('is-loading');
            // Petit effet de chargement avant l'ouverture de la fenêtre de confirmation du trajet.
            setTimeout(() => {
                openTripModal(isSim ? 'sim' : 'real');
                btnStart.classList.remove('is-loading');
            }, 450);
        }

        function openTripModal(mode) {
            const statusBox = document.getElementById('status');
            const destValue = document.getElementById('end-addr').value.trim();
            if (!destValue) { statusBox.innerText = "Veuillez indiquer une destination."; statusBox.style.color = "#ff6b6b"; return; }
            if (drivers.length === 0) { statusBox.innerText = "Ajoutez au moins un conducteur."; statusBox.style.color = "#ff6b6b"; return; }

            // Cacher le panneau itinéraire pour ne voir que la carte
            document.getElementById('ui-panel').style.display = 'none';

            /* Le scan par rayon a pu être ouvert AVANT l'aperçu : on le referme, sinon
               sa feuille resterait empilée sous le modal et ses pastilles de prix
               doubleraient les stations que le panneau du modal va poser. keepCamera :
               calculateTripPreview() pose son propre cadrage juste après. */
            closeGasScan({ keepCamera: true });

            modalMode = mode; modalPendingRoute = null; modalStartManuallyEdited = false;
            resetModalWaypoints();
            const modalStartInput = document.getElementById('modal-start-addr');
            const modalEndInput = document.getElementById('modal-end-addr');
            modalEndInput.value = destValue; modalEndCoords = exactEndCoords || null;

            if (exactStartCoords) {
                modalStartInput.value = startAddrText; modalStartInput.placeholder = "Position GPS..."; modalStartCoords = exactStartCoords;
            } else {
                modalStartInput.value = ""; modalStartInput.placeholder = "GPS indisponible, entrez un départ manuel"; modalStartCoords = null;
            }

            document.getElementById('trip-preview').style.display = 'none'; document.getElementById('btn-validate-trip').disabled = true;
            document.getElementById('modal-status').innerText = "";
            const tripOverlay = document.getElementById('trip-modal-overlay');
            const tripModal = document.getElementById('trip-modal');
            tripOverlay.classList.remove('peeking', 'half', 'full');
            tripModal.style.transform = '';
            tripModal.style.height = SHEET_H_CSS;
            tripOverlay.style.background = 'transparent';
            tripOverlay.style.backdropFilter = 'none';
            tripOverlay.style.webkitBackdropFilter = 'none';
            tripOverlay.classList.add('open', 'half');

            if (modalStartCoords && modalEndCoords) { calculateTripPreview(); } 
            else if (!modalStartCoords) {
                document.getElementById('modal-status').innerText = "Entrez un point de départ.";
                document.getElementById('modal-status').style.color = "#f39c12";
            }
        }
        function closeTripModal(cancelled = false) {
            _tripModalWasOpen = false; // reset : fermeture explicite, pas de réouverture automatique
            const overlay = document.getElementById('trip-modal-overlay');
            const modal = document.getElementById('trip-modal');
            overlay.classList.remove('open', 'half', 'full', 'peeking');
            modal.style.transform = '';
            modal.style.height = SHEET_H_CSS;
            overlay.style.background = 'transparent';
            overlay.style.backdropFilter = 'none';
            overlay.style.webkitBackdropFilter = 'none';
            overlay.style.pointerEvents = '';
            isUserPanning = false; showRecenterBtn(false);
            clearAltRoutes();
            // Reset sections déroulantes
            _routeChoicePanelOpen = false;
            const _rcs = document.getElementById('route-choice-section');
            const _rcp = document.getElementById('route-choice-panel');
            const _rcc = document.getElementById('route-choice-chevron');
            if (_rcs) _rcs.style.display = 'none';
            if (_rcp) _rcp.style.display = 'none';
            if (_rcc) _rcc.style.transform = 'rotate(0deg)';
            const _ts = document.getElementById('modal-toll-section');
            if (_ts) _ts.style.display = 'none';
            _tollPanelOpen = false;
            const _tp = document.getElementById('toll-toggle-panel');
            const _tc = document.getElementById('toll-toggle-chevron');
            if (_tp) _tp.style.display = 'none';
            if (_tc) _tc.style.transform = 'rotate(0deg)';
            // Volet Informations trajet : refermé comme les trois autres
            _tripInfoPanelOpen = false;
            const _tid = document.getElementById('trip-info-details');
            const _tic = document.getElementById('trip-info-chevron');
            if (_tid) _tid.classList.remove('open');
            if (_tic) _tic.style.transform = 'rotate(0deg)';
            /* Ne PAS faire réapparaître le panneau Itinéraire si une course tourne encore :
               c'est le cas quand on renonce à la confirmation ouverte depuis un trajet libre.
               Le panneau se poserait par-dessus l'interface de navigation. */
            if (!isCourseStarted) {
                document.getElementById('ui-panel').classList.remove('panel-hidden');
                document.getElementById('ui-panel').style.display = 'flex';
            }
            // Nettoyer les marqueurs et la section stations
            clearGasStationMarkers();
            clearWaypointMarkers();
            document.getElementById('gas-stations-section').classList.remove('visible');
            document.getElementById('gas-stations-list').innerHTML = '';

            if (cancelled) {
                clearRouteLine();
                if (startTempMarker) { startTempMarker.remove(); startTempMarker = null; }
                currentTurfLine = null; modalPendingRoute = null;

                /* Renoncer à la confirmation annule AUSSI la destination : on revient au
                   panneau Itinéraire avec la cellule « Où allez-vous ? » vide, prête pour
                   une nouvelle saisie. La laisser remplie laissait croire que le trajet
                   tenait encore, et le marqueur 🔴 restait posé sur une carte sans tracé.

                   Garde `!isCourseStarted` : la même croix ferme aussi une confirmation
                   ouverte PENDANT un trajet libre. Y effacer exactEndCoords couperait la
                   destination de la course en cours.

                   Pas de clearDestination() ici — il focalise le champ, ce qui
                   déclencherait enterDestinationSearchMode() et ferait remonter le clavier
                   alors que l'utilisateur vient justement de tout annuler. */
                if (!isCourseStarted) {
                    const destInput = document.getElementById('end-addr');
                    if (destInput) { destInput.value = ''; destInput.style.color = ''; }
                    exactEndCoords = null;
                    modalEndCoords = null;
                    clearDestinationDraft();
                    if (endTempMarker) { endTempMarker.remove(); endTempMarker = null; }
                    /* La destination annulée n'est plus liée à un contact : sans cette
                       remise à zéro, l'alerte « à 10 min » continuerait de viser son
                       numéro au trajet suivant (même règle que « Go ici » de la hotbox). */
                    try { updateFavPhoneUI(''); setFavDropdownLabel(null); } catch (e) {}
                }
            }
        }

        // === SWIPE DU MODAL DE CONFIRMATION — 3 états : half | full | peeking ===
        (function initTripModalSwipe() {
            const overlay = document.getElementById('trip-modal-overlay');
            const modal   = document.getElementById('trip-modal');
            const handle  = document.getElementById('trip-modal-handle');

            // État courant : 'half' | 'full' | 'peeking'
            let state = 'half';
            let startY = 0, currentY = 0, isDragging = false;
            const PEEK_HEIGHT = 110; // hauteur visible en mode peeking — assez pour voir le titre + handle

            function getHalfTranslate() {
                // En état half, le modal occupe 50vh → translateY = 0 (déjà positionné à 50vh par CSS height)
                return 0;
            }

            function applyState(s, animate) {
                state = s;
                const NAV_H = 64; // hauteur de la barre permanente
                modal.style.transition = animate
                    ? 'transform 0.38s cubic-bezier(0.22,1,0.36,1), height 0.38s cubic-bezier(0.22,1,0.36,1)'
                    : 'none';
                overlay.style.transition = animate ? 'background 0.38s ease, backdrop-filter 0.38s ease' : 'none';

                overlay.classList.remove('half','full','peeking');

                if (s === 'half') {
                    modal.style.height = SHEET_H_CSS;
                    modal.style.transform = 'translateY(0)';
                    overlay.classList.add('half');
                    overlay.style.background = 'transparent';
                    overlay.style.backdropFilter = 'none';
                    overlay.style.webkitBackdropFilter = 'none';
                } else if (s === 'full') {
                    modal.style.height = `calc(92vh - ${NAV_H}px)`;
                    modal.style.transform = 'translateY(0)';
                    overlay.classList.add('full');
                    overlay.style.background = 'rgba(0,0,0,0.6)';
                    overlay.style.backdropFilter = 'blur(6px)';
                    overlay.style.webkitBackdropFilter = 'blur(6px)';
                    overlay.style.pointerEvents = 'auto';
                } else if (s === 'peeking') {
                    modal.style.height = SHEET_H_CSS;
                    const mh = getSheetHeightPx();
                    modal.style.transform = `translateY(${mh - PEEK_HEIGHT}px)`;
                    overlay.classList.add('peeking');
                    overlay.style.background = 'transparent';
                    overlay.style.backdropFilter = 'none';
                    overlay.style.webkitBackdropFilter = 'none';
                    overlay.style.pointerEvents = 'none';
                }
            }

            handle.addEventListener('touchstart', function(e) {
                startY = e.touches[0].clientY;
                currentY = startY;
                isDragging = true;
                modal.style.transition = 'none';
                overlay.style.transition = 'none';
            }, { passive: true });

            handle.addEventListener('touchmove', function(e) {
                if (!isDragging) return;
                currentY = e.touches[0].clientY;
                const deltaY = currentY - startY; // positif = vers le bas, négatif = vers le haut

                if (state === 'half') {
                    if (deltaY > 0) {
                        // Vers le bas → aller vers peeking, mais limité à PEEK_HEIGHT visible
                        const maxDown = window.innerHeight * 0.5 - PEEK_HEIGHT;
                        const d = Math.min(deltaY, maxDown); // clamp : jamais plus bas que peeking
                        modal.style.transform = `translateY(${d}px)`;
                        overlay.style.background = 'transparent';
                        overlay.style.backdropFilter = 'none';
                    } else {
                        // Vers le haut → aller vers full (agrandissement)
                        const expandPx = Math.min(-deltaY, window.innerHeight * 0.42); // max 50vh → 92vh
                        const progress = expandPx / (window.innerHeight * 0.42);
                        const newH = 50 + 42 * progress; // vh
                        modal.style.height = `${newH}vh`;
                        modal.style.transform = 'translateY(0)';
                        // Flou progressif vers le haut
                        const alpha = 0.6 * progress;
                        const blur  = 6  * progress;
                        overlay.style.background = `rgba(0,0,0,${alpha})`;
                        overlay.style.backdropFilter = `blur(${blur}px)`;
                        overlay.style.webkitBackdropFilter = `blur(${blur}px)`;
                    }
                } else if (state === 'full') {
                    if (deltaY > 0) {
                        // Vers le bas → réduire vers half
                        const shrinkPx = Math.min(deltaY, window.innerHeight * 0.42);
                        const progress = 1 - shrinkPx / (window.innerHeight * 0.42);
                        const newH = 50 + 42 * progress;
                        modal.style.height = `${newH}vh`;
                        modal.style.transform = 'translateY(0)';
                        const alpha = 0.6 * progress;
                        const blur  = 6  * progress;
                        overlay.style.background = `rgba(0,0,0,${alpha})`;
                        overlay.style.backdropFilter = `blur(${blur}px)`;
                        overlay.style.webkitBackdropFilter = `blur(${blur}px)`;
                    }
                } else if (state === 'peeking') {
                    if (deltaY < 0) {
                        // Vers le haut → remonter vers half
                        const maxUp = window.innerHeight * 0.5 - PEEK_HEIGHT;
                        const d = Math.max(0, maxUp + deltaY);
                        modal.style.transform = `translateY(${d}px)`;
                    }
                }
            }, { passive: true });

            handle.addEventListener('touchend', function() {
                if (!isDragging) return;
                isDragging = false;
                const deltaY = currentY - startY;

                if (state === 'half') {
                    if (deltaY > 60)       applyState('peeking', true);
                    else if (deltaY < -60) applyState('full', true);
                    else                   applyState('half', true);
                } else if (state === 'full') {
                    if (deltaY > 60) applyState('half', true);
                    else             applyState('full', true);
                } else if (state === 'peeking') {
                    if (deltaY < -40) applyState('half', true);
                    else              applyState('peeking', true);
                }
            }, { passive: true });

            // Tap sur la bande peeking → revenir à half
            handle.addEventListener('click', function() {
                if (state === 'peeking') applyState('half', true);
            });

            // Tap sur overlay en mode full → revenir à half
            overlay.addEventListener('click', function(e) {
                if (e.target === overlay && state === 'full') applyState('half', true);
            });

            // Exposer applyState pour l'utiliser depuis openTripModal / closeTripModal
            window._tripModalSetState = applyState;
        })();
        // === BARRE DE NAVIGATION PERMANENTE ===
        const PANEL_TITLES = { trajet: 'Itinéraire', profil: 'Profil', objectifs: 'Objectifs' };

        // Flag : le trip-modal était-il ouvert quand l'utilisateur a changé d'onglet ?
        // _tripModalWasOpen déclaré plus haut (globals)

        /* === OVERLAY NAV PANEL (Objectifs / Profil pendant trajet) === */
        let _navOverlayCurrentTab = null;
        let _navOverlayOriginalParent = null;

        function openNavPanelOverlay(tab) {
            const overlay = document.getElementById('nav-panel-overlay');
            const backdrop = document.getElementById('nav-panel-overlay-backdrop');
            const titleEl = document.getElementById('nav-panel-overlay-title');
            const body = document.getElementById('nav-panel-overlay-body');
            if (!overlay) return;

            // Nettoyer le body de l'overlay sans toucher au DOM source
            _navOverlayRestoreContent();
            body.innerHTML = '';

            // Titre
            const TITLES = { objectifs: 'Objectifs', profil: 'Profil' };
            titleEl.textContent = TITLES[tab] || tab;

            // Cloner le contenu (pas déplacer) pour éviter de casser le DOM principal
            const sourceEl = document.getElementById('panel-tab-' + tab);
            if (sourceEl) {
                _navOverlayCurrentTab = tab;
                const clone = sourceEl.cloneNode(true);
                clone.style.display = 'flex';
                clone.style.flexDirection = 'column';
                clone.classList.add('active');
                body.appendChild(clone);
                // Ré-attacher les event listeners sur les éléments interactifs du clone
                // (les onclick inline fonctionnent via HTML, pas besoin d'addEventListener)
            }

            // Rendre les objectifs si nécessaire
            if (tab === 'objectifs') {
                setTimeout(() => {
                    if (typeof renderWeeklyGoalsPanel === 'function') renderWeeklyGoalsPanel();
                }, 30);
            }
            if (tab === 'profil') {
                setTimeout(() => {
                    if (typeof renderBadgeCategoryCard === 'function') renderBadgeCategoryCard();
                    if (typeof refreshTrophyGalleryCount === 'function') refreshTrophyGalleryCount();
                }, 30);
            }

            backdrop.classList.add('open');
            overlay.style.display = 'flex';
            requestAnimationFrame(() => overlay.classList.add('open'));
        }

        function _navOverlayRestoreContent() {
            // Plus besoin de restaurer le DOM puisqu'on clone maintenant
            _navOverlayCurrentTab = null;
            _navOverlayOriginalParent = null;
        }

        function closeNavPanelOverlay() {
            const overlay = document.getElementById('nav-panel-overlay');
            const backdrop = document.getElementById('nav-panel-overlay-backdrop');
            if (!overlay) return;
            overlay.classList.remove('open');
            backdrop.classList.remove('open');
            setTimeout(() => {
                overlay.style.display = 'none';
                // Vider le clone sans toucher au DOM source
                const body = document.getElementById('nav-panel-overlay-body');
                if (body) body.innerHTML = '';
                _navOverlayCurrentTab = null;
            }, 360);
            // Remettre le tab Trajet actif visuellement
            document.querySelectorAll('.main-nav-tab').forEach(t => t.classList.remove('active'));
            const trajetTab = document.getElementById('nav-tab-trajet');
            if (trajetTab) trajetTab.classList.add('active');
        }

        function switchMainTab(tab) {
            // Fermer la modale stats si elle est ouverte
            const statsOverlay = document.getElementById('stats-modal-overlay');
            if (statsOverlay) statsOverlay.classList.remove('open');

            /* Fermer par la FONCTION, pas en retirant la classe comme au-dessus : la page
               des sections du Profil détient un morceau de DOM déplacé depuis le panneau,
               et seule closeProfilSheet() sait le rendre à sa place. Masquer l'overlay
               laisserait Mon véhicule ou Aide à la conduite définitivement absents du
               Profil — jusqu'au rechargement de la page. */
            try { closeProfilSheet(); } catch (e) {}

            /* Le scan de stations occupe l'emplacement du panneau et masque #ui-panel
               (body.gas-scan-open) : changer d'onglet doit donc le refermer, sinon la
               feuille resterait posée par-dessus l'onglet demandé, qui serait à la fois
               actif dans la barre et invisible à l'écran.
               closeGasScan() rend aussi la main à la caméra et retire le cercle de
               recherche — un onglet Objectifs ou Profil n'a rien à faire d'une zone de
               scan encore dessinée sur la carte derrière lui. */
            if (document.body.classList.contains('gas-scan-open')) closeGasScan();

            /* Quitter l'onglet avec le formulaire de création de profil encore ouvert
               laisserait la classe profile-focus posée, et donc le panneau libéré de sa
               hauteur de référence sur tous les onglets. On referme proprement. */
            const createProfileForm = document.getElementById('create-profile-inline');
            if (createProfileForm && createProfileForm.style.display === 'block') hideCreateProfileInline();

            const panel = document.getElementById('ui-panel');
            // Source de vérité : quel panel-tab-content est actuellement visible ?
            // On préfère ça au nav-tab qui peut être désynchronisé sur mobile (double-tap, etc.)
            const activeContent = document.querySelector('.panel-tab-content.active');
            const currentActive = activeContent?.id?.replace('panel-tab-', '')
                || document.querySelector('.main-nav-tab.active')?.id?.replace('nav-tab-', '');

            /* ⚠ RELEVÉ DE HAUTEUR SUPPRIMÉ — ne pas le rétablir.
               Itinéraire servait de référence d'alignement pour Objectifs et Profil : on
               mesurait sa hauteur au moment de le quitter et on la recopiait dans
               --panel-secondary-h. Le mécanisme visait déjà le bon objectif — une ligne de
               séparation stable — mais par un chemin fragile : la mesure n'existait que si
               l'on avait déployé Itinéraire au moins une fois, sinon les deux autres onglets
               retombaient sur 60 % de l'écran. D'où trois hauteurs possibles pour trois
               onglets, exactement le déséquilibre constaté en passant de l'un à l'autre.
               La règle 50/50 (getSheetHeightPx) donne la même valeur à tout le monde sans
               rien mesurer : relever la hauteur reviendrait désormais à relire notre propre
               constante à travers le DOM, au risque de tomber pendant une transition. */

            // === PENDANT UN TRAJET : Objectifs/Profil → overlay flottant ===
            if (document.body.classList.contains('nav-active') && tab !== 'trajet') {
                const overlay = document.getElementById('nav-panel-overlay');
                const isOpen = overlay && overlay.classList.contains('open');
                // Toggle : si l'overlay est déjà ouvert sur ce même tab → fermer
                if (isOpen && currentActive === tab) {
                    closeNavPanelOverlay();
                    return;
                }
                // Sinon ouvrir (ou switcher vers un autre tab)
                document.querySelectorAll('.main-nav-tab').forEach(t => t.classList.remove('active'));
                const tabBtn = document.getElementById('nav-tab-' + tab);
                if (tabBtn) tabBtn.classList.add('active');
                openNavPanelOverlay(tab);
                return;
            }
            // Pendant un trajet, clic sur "Trajet" → fermer l'overlay si ouvert
            if (document.body.classList.contains('nav-active') && tab === 'trajet') {
                closeNavPanelOverlay();
                document.querySelectorAll('.main-nav-tab').forEach(t => t.classList.remove('active'));
                const trajetTab = document.getElementById('nav-tab-trajet');
                if (trajetTab) trajetTab.classList.add('active');
                return;
            }

            // Si on tape sur l'onglet déjà actif → toggle panneau ouvert/escamoté
            // Double vérification : le nav-tab doit aussi être actif pour éviter les faux positifs mobile
            const navTabAlsoActive = document.getElementById('nav-tab-' + tab)?.classList.contains('active');
            if (currentActive === tab && navTabAlsoActive && panel) {
                // Le second appui escamote TOTALEMENT le panneau (carte plein écran).
                // 'min' laissait dépasser une poignée de 54 px : c'est l'état voulu pour un
                // glissement au doigt, pas pour un appui sur l'onglet.
                if (panelSnapState === 'hidden' || panelSnapState === 'min') {
                    setPanelSnap('full');
                } else {
                    setPanelSnap('hidden');
                }
                return;
            }

            // Mettre à jour les boutons de la barre
            document.querySelectorAll('.main-nav-tab').forEach(t => t.classList.remove('active'));
            const tabBtn = document.getElementById('nav-tab-' + tab);
            if (tabBtn) tabBtn.classList.add('active');

            // Marquer les onglets secondaires AVANT tout appel à setPanelSnap : celui-ci lit
            // la classe pour choisir la hauteur du panneau. Le faire plus bas laisserait le
            // retour vers Itinéraire (qui ouvre le panneau dans la branche 'trajet') se
            // calculer avec la hauteur imposée de l'onglet précédent.
            const _panelForTab = document.getElementById('ui-panel');
            if (_panelForTab) {
                _panelForTab.classList.toggle('tab-secondary', tab === 'objectifs' || tab === 'profil');
            }

            const tripOverlay = document.getElementById('trip-modal-overlay');

            if (tab !== 'trajet') {
                // Quitter "trajet" : masquer le modal SANS effacer les données de trajet
                if (tripOverlay && tripOverlay.classList.contains('open')) {
                    _tripModalWasOpen = true;
                    tripOverlay.classList.remove('open', 'half', 'full', 'peeking');
                    const tripModal = document.getElementById('trip-modal');
                    if (tripModal) tripModal.style.transform = '';
                    tripOverlay.style.pointerEvents = '';
                }
            } else {
                // Revenir sur "trajet" : réouvrir le modal s'il était visible avant
                const panel = document.getElementById('ui-panel');
                if (_tripModalWasOpen && tripOverlay) {
                    _tripModalWasOpen = false;
                    if (panel) panel.style.display = 'none';
                    tripOverlay.classList.add('open', 'half');
                } else {
                    if (panel) panel.style.display = 'flex';
                    // immediate : un changement d'onglet ne doit pas animer la hauteur.
                    setPanelSnap('full', { immediate: true });
                }
            }

            // Basculer l'onglet actif dans le panel
            // S'assurer que ui-panel est visible avant tout
            if (tab !== 'trajet') {
                const panel = document.getElementById('ui-panel');
                if (panel) panel.style.display = 'flex';
            }

            document.querySelectorAll('.panel-tab-content').forEach(c => c.classList.remove('active'));
            const targetContent = document.getElementById('panel-tab-' + tab);
            if (targetContent) targetContent.classList.add('active');

            // Changer le titre (compatibilité overlay navigation)
            const titleEl = document.getElementById('ui-panel-title');
            if (titleEl) titleEl.setAttribute('data-tab', tab);

            // Afficher le panel et l'ouvrir au max, sans animer : voir setPanelSnap.
            if (tab !== 'trajet') {
                setPanelSnap('full', { immediate: true });
            }

            // Rendre le contenu des objectifs à l'ouverture
            if (tab === 'objectifs') renderWeeklyGoalsPanel();
            // Rafraîchir la carte badge et la galerie à l'ouverture de l'onglet profil
            if (tab === 'profil') { renderBadgeCategoryCard(); refreshTrophyGalleryCount(); initAideConduiteUI(); }

            // La classe tab-secondary et la variable --panel-secondary-h sont désormais
            // posées plus haut (avant setPanelSnap), qui calcule la hauteur de façon
            // déterministe. L'ancienne capture via rAF mesurait le panneau APRÈS repaint
            // et retenait le maximum observé : elle finissait donc toujours par mémoriser
            // la hauteur plein écran, ce qui masquait la carte sur ces deux onglets.
        }

        // Mettre à jour le badge objectifs selon l'état has-reward
        function updateGoalsBadge() {
            const badge = document.getElementById('nav-badge-goals');
            const oldBtn = document.getElementById('btn-weekly-goals');
            if (!badge) return;
            if (oldBtn && oldBtn.classList.contains('has-reward')) {
                badge.classList.add('visible');
            } else {
                badge.classList.remove('visible');
            }
        }

        // Hooker la mise à jour du badge lors du chargement des objectifs
        const _origUpdateGoals = typeof updateWeeklyGoalsUI === 'function' ? updateWeeklyGoalsUI : null;
        // On surcharge après la définition de la fonction originale via MutationObserver sur btn-weekly-goals
        const _goalsBtnObserver = new MutationObserver(updateGoalsBadge);

        // Initialise les valeurs du véhicule depuis localStorage
        function initializeVehicleConfig() {
            const cfg = loadVehicleConfig();
            const licensePointsEl = document.getElementById('vehicle-license-points');
            const licensePointsDisplay = document.getElementById('points-display');
            if (licensePointsEl) licensePointsEl.value = cfg.licensePoints;
            /* ⚠ DÉNOMINATEUR CONSTANT. Ce libellé affiche le CAPITAL MAXIMAL du permis
               (12 points), pas le solde : y écrire `cfg.licensePoints` rendait « 9 / 9 »
               pour un conducteur à 9 points, c'est-à-dire un permis intact, alors qu'il
               en a perdu trois. Le solde est déjà dans le champ juste à gauche. */
            if (licensePointsDisplay) licensePointsDisplay.innerText = `/${LICENSE_POINTS_MAX}`;
        }

        // Cache DOM haute fréquence — évite getElementById dans watchPosition/rAF
        const DOM = {};
        document.addEventListener('DOMContentLoaded', function() {
            DOM.navSpeedValue        = document.getElementById('nav-speed-value');
            DOM.navSpeedDisplay      = document.getElementById('nav-speed-display');
            DOM.navEtaBox            = document.getElementById('nav-eta-box');
            DOM.navEta               = document.getElementById('nav-eta');
            DOM.navSpeedLimitValue   = document.getElementById('nav-speed-limit-value');
            DOM.speedLimitBadge      = document.getElementById('speed-limit-badge');
            DOM.speedometerArcFill   = document.getElementById('speedometer-arc-fill');
            DOM.speedLimitValue      = document.getElementById('speed-limit-value');
            DOM.nextTurnPanel        = document.getElementById('next-turn-panel');
            DOM.nextTurnDistance     = document.getElementById('next-turn-distance');
            DOM.nextTurnStreet       = document.getElementById('next-turn-street');
            DOM.nextTurnIconContainer= document.getElementById('next-turn-icon-container');
            DOM.nextTurnSecondary    = document.getElementById('next-turn-secondary');
            DOM.nextTurnSecondaryIcon  = document.getElementById('next-turn-secondary-icon');
            DOM.nextTurnSecondaryStreet= document.getElementById('next-turn-secondary-street');

            const goalsBtn = document.getElementById('btn-weekly-goals');
            if (goalsBtn) _goalsBtnObserver.observe(goalsBtn, { attributes: true, attributeFilter: ['class'] });

            // Initialiser les config du véhicule
            initializeVehicleConfig();

            // Rétablit l'adresse saisie avant un rechargement (rotation d'écran Android,
            // mise en veille prolongée, retour depuis une autre application).
            restoreDestinationDraft();

            /* ARRIVÉE SUR LA CARTE, PAS SUR LE FORMULAIRE. Le panneau Itinéraire démarre
               escamoté : l'écran d'accueil est la carte, et l'invite hotbox y enseigne le
               geste qui donne accès à tout le reste. On remonte le panneau en tapant sur
               l'onglet Itinéraire, ou par la loupe du cercle (openSearchFromHotbox).
               ⚠ Exception : un brouillon d'adresse restauré ci-dessus doit rester visible.
               L'escamoter reviendrait à effacer sous les yeux de l'utilisateur ce qu'il
               avait saisi avant que l'app ne soit rechargée — il le croirait perdu.
               `immediate` évite de donner à voir le panneau qui se referme au chargement. */
            const draftInput = document.getElementById('end-addr');
            if (!draftInput || !draftInput.value.trim()) {
                setPanelSnap('hidden', { immediate: true });
            }
        });

        function swapModalAddresses() {
            const startInput = document.getElementById('modal-start-addr');
            const endInput   = document.getElementById('modal-end-addr');

            // Échanger les textes
            const tmpVal = startInput.value;
            startInput.value = endInput.value;
            endInput.value   = tmpVal;

            // Échanger les coordonnées
            const tmpCoords   = modalStartCoords;
            modalStartCoords  = modalEndCoords;
            modalEndCoords    = tmpCoords;

            // L'adresse de départ a été éditée manuellement (plus GPS auto)
            modalStartManuallyEdited = true;

            // Feedback visuel : les deux boutons (départ + arrivée) réagissent ensemble,
            // ce qui rend l'inversion lisible d'un coup d'oeil quel que soit celui tapé.
            document.querySelectorAll('.btn-swap-addr').forEach(btn => {
                btn.style.transition = 'transform 0.35s ease, color 0.2s';
                btn.style.transform  = 'rotate(180deg)';
                btn.style.color      = '#ffa500';
                setTimeout(() => {
                    btn.style.transform = 'rotate(0deg)';
                    btn.style.color     = '#58a6ff';
                }, 350);
            });

            // Recalculer l'itinéraire si les deux adresses sont renseignées
            if (modalStartCoords && modalEndCoords) calculateTripPreview();
        }

        function onModalStartInput() {
            modalStartCoords = null; // coordonnées invalidées jusqu'à sélection autocomplete
            document.getElementById('btn-validate-trip').disabled = true;
            document.getElementById('modal-status').innerText = "";
        }
        function onModalEndInput() {
            modalEndCoords = null;
            document.getElementById('trip-preview').style.display = 'none';
            document.getElementById('btn-validate-trip').disabled = true;
            document.getElementById('modal-status').innerText = "";
        }
        // ═══════════════════════════════════════════════════════════════

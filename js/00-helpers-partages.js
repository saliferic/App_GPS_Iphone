        /* ⚠ ÉTAT PARTAGÉ ENTRE FICHIERS — DÉCLARÉ ICI, EN PREMIER, PAS AILLEURS.

           `userPanningResumeTimer` est LU par 08 (focusDestinationOnMap), 09
           (applyNavSearchSelection), 11 (_fitMapToGasScan) et 19 (stopCourse), mais il
           était déclaré par un `let` de 12-gamification.js — quatre consommateurs pour
           une déclaration posée au milieu du chargement, dont deux la précèdent.

           Un `let` de portée script n'est PAS une propriété de `window` : contrairement à
           une `function`, il n'existe qu'à partir de l'évaluation du fichier qui le
           déclare, et le LIRE avant lève `ReferenceError: … is not defined` — pas
           `undefined`, une exception qui emporte tout ce qui suit dans le bloc.

           Symptôme observé sur téléphone le 15/08/2026 : « Recherche impossible
           (userPanningResumeTimer is not defined) » et AUCUN autozoom sur le scan
           ⛽, alors que le simulateur cadrait correctement. La ligne fautive est dans
           `_fitMapToGasScan()`, à l'intérieur d'un `if (lastRealCoords || isCourseStarted)` :
           sans fix GPS réel, un poste de bureau ne franchit jamais cette porte et ne voit
           donc jamais l'erreur. Encore un écart que le simulateur ne reproduit pas.

           Règle à généraliser : toute variable `let`/`const` lue par plus d'un fichier se
           déclare ICI. Une `function` peut rester dans son fichier d'origine (elle est
           publiée sur l'objet global), un `let` non. */
        let userPanningResumeTimer = null;

        /* Masquage des marqueurs de stations / bornes sur la carte (entrée hotbox
           « Masquer stations »). Déclaré ICI pour la raison ci-dessus : il est LU par 10
           (catalogue hotbox), 11 (marqueurs du scan) et 18 (marqueurs de trajet), donc par
           trois fichiers dont le premier précède celui qui aurait pu le déclarer.

           ⚠ VOLONTAIREMENT NON PERSISTÉ — pas de clé localStorage. C'est un geste de
           lisibilité ponctuel (« je veux voir mon départ et mon arrivée sans les pastilles
           de prix »), pas un réglage. Persisté, il produirait le pire des symptômes : des
           semaines plus tard, une app sans aucune station, sans message, et dont le seul
           remède se cache derrière un appui long sur la carte. L'état repart donc visible
           à chaque lancement. */
        let _stationsHidden = false;

        // `LICENSE_POINTS_MAX` a rejoint js/00-noyau-calculs.js (chargé avant ce fichier)
        // avec `_readLicensePoints()`, la fonction qui l'exploite.

        function setupAddressAutocomplete(inputId, suggestionsId, onSelect) {
            const inputEl = document.getElementById(inputId); const boxEl = document.getElementById(suggestionsId);
            let debounceTimer = null; let currentRequestId = 0;
            inputEl.addEventListener('input', () => {
                clearTimeout(debounceTimer);
                const query = inputEl.value.trim();
                if (query.length < 3) { boxEl.style.display = 'none'; boxEl.innerHTML = ''; return; }
                const requestId = ++currentRequestId;
                debounceTimer = setTimeout(async () => {
                    try {
                        // Détecter si l'utilisateur tape une adresse (commence par rue, avenue, etc.)
                        // ou un nom de ville / lieu-dit.
                        const isAddressMode = _VOIRIE_RE.test(query);

                        // Détecter si la requête contient déjà un nom de commune
                        // (ex: "6 rue de massy antony" contient "antony" = commune)
                        // Si oui, ne pas utiliser proximity pour ne pas biaiser la recherche
                        const commonCities = ['paris', 'courbevoie', 'antony', 'asnières', 'asnieres', 'neuilly', 'boulogne',
                                             'issy', 'clamart', 'meudon', 'versailles', 'nogent', 'rambouillet', 'évry', 'evry'];
                        const hasExplicitCity = commonCities.some(city => query.toLowerCase().includes(city));

                        // « 20 bis » → « 20b » : voir normalizeFrHouseNumber(). Seule la requête
                        // envoyée à l'API est réécrite, le texte tapé reste tel quel à l'écran.
                        const q = encodeURIComponent(normalizeFrHouseNumber(query));

                        /* Lieux nommés en parallèle des requêtes Mapbox : l'index Mapbox n'en
                           contient aucun (voir geocodeDetailed), donc sans cette source la
                           liste ne proposera jamais la tour Eiffel ni le Moulin Rouge. On la
                           saute dès qu'un chiffre apparaît : c'est alors une adresse numérotée,
                           terrain où Mapbox est meilleur. La promesse est lancée maintenant pour
                           qu'elle coure pendant les appels Mapbox, pas après. */
                        const photonPromise = /\d/.test(query)
                            ? Promise.resolve([])
                            : _photonNamedPlaces(query, lastRealCoords || [2.3522, 48.8566]);

                        let features = [];
                        if (isAddressMode) {
                            // Mode adresse : utiliser proximity seulement si pas de commune déjà spécifiée
                            let url;
                            if (hasExplicitCity) {
                                // Commune déjà spécifiée → ne pas utiliser proximity pour éviter de biaiser
                                url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=8&language=fr&country=fr&types=address,poi`;
                            } else {
                                // Pas de commune → utiliser proximity pour chercher près de la position actuelle
                                const proximityCoords = lastRealCoords || [2.3522, 48.8566];
                                url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=6&language=fr&country=fr&types=address,poi&proximity=${proximityCoords[0]},${proximityCoords[1]}`;
                            }
                            const res = await fetchResilient(url, {}, { timeoutMs: 6000, retries: 0 });
                            const data = await res.json();
                            features = data.features || [];
                        } else {
                            // Mode ville : deux requêtes parallèles —
                            // 1) villes/communes (place, locality) sans proximity pour ne pas pénaliser le sud
                            // 2) adresses/POI avec proximity pour compléter si peu de villes trouvées
                            const proximityCoords = lastRealCoords || [2.3522, 48.8566];
                            const urlCities = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=5&language=fr&country=fr&types=place,locality`;
                            const urlAddr   = `https://api.mapbox.com/geocoding/v5/mapbox.places/${q}.json?access_token=${MAPBOX_TOKEN}&autocomplete=true&limit=3&language=fr&country=fr&types=neighborhood,address,poi&proximity=${proximityCoords[0]},${proximityCoords[1]}`;
                            const [resCities, resAddr] = await Promise.all([
                                fetchResilient(urlCities, {}, { timeoutMs: 6000, retries: 0 }),
                                fetchResilient(urlAddr,   {}, { timeoutMs: 6000, retries: 0 })
                            ]);
                            const dataCities = await resCities.json();
                            const dataAddr   = await resAddr.json();
                            const cityFeatures = dataCities.features || [];
                            const addrFeatures = dataAddr.features   || [];
                            // Dédoublonner par identifiant Mapbox, villes en premier
                            const seen = new Set();
                            for (const f of [...cityFeatures, ...addrFeatures]) {
                                if (!seen.has(f.id)) { seen.add(f.id); features.push(f); }
                            }
                            features = features.slice(0, 6);
                        }

                        /* Fusion des deux sources, lieux nommés EN TÊTE : quand on tape
                           « tour eiffel », la réponse attendue est le monument, pas la commune
                           au nom voisin que Mapbox propose. Dédoublonnage sur le libellé
                           normalisé, sinon une avenue connue apparaît deux fois (une par
                           source) avec deux orthographes légèrement différentes. */
                        const namedPlaces = await photonPromise;
                        if (requestId !== currentRequestId) return;

                        const items = [];
                        const seenLabels = new Set();
                        for (const it of [...namedPlaces, ...features.map(f => ({ center: f.center, label: f.place_name }))]) {
                            if (!it.label || !it.center) continue;
                            // Deux premiers segments seulement : Mapbox finit par « , France »
                            // là où Photon s'arrête à la commune. Comparer les chaînes
                            // entières laisserait passer la même avenue deux fois.
                            const empreinte = _deburr(it.label).split(',').slice(0, 2).join('').replace(/[^a-z0-9]/g, '');
                            if (seenLabels.has(empreinte)) continue;
                            seenLabels.add(empreinte);
                            items.push(it);
                        }

                        if (items.length === 0) { boxEl.style.display = 'none'; boxEl.innerHTML = ''; return; }
                        boxEl.innerHTML = '';
                        items.slice(0, 7).forEach(item => {
                            const label = item.label;
                            const div = document.createElement('div'); div.className = 'addr-suggestion'; div.innerText = label;
                            div.onmousedown = (e) => {
                                e.preventDefault(); inputEl.value = label; boxEl.style.display = 'none'; boxEl.innerHTML = '';
                                /* Point de passage commun aux quatre champs d'adresse : on
                                   y repose la couleur, que la dictée pose en style inline
                                   (bleu/vert/rouge) et qui survivait à toute écriture
                                   ultérieure — une suggestion choisie après une dictée
                                   ratée s'affichait en rouge. */
                                inputEl.style.color = '';
                                onSelect(item.center, label);
                            };
                            boxEl.appendChild(div);
                        });
                        boxEl.style.display = 'block';
                    } catch (e) { boxEl.style.display = 'none'; }
                }, 350);
            });
            inputEl.addEventListener('blur', () => { setTimeout(() => { boxEl.style.display = 'none'; }, 150); });
            inputEl.addEventListener('focus', () => { if (boxEl.innerHTML.trim() !== '') boxEl.style.display = 'block'; });
        }
        function initVehicleConfigUI() {
            const cfg = loadVehicleConfig();
            const consoEl     = document.getElementById('vehicle-consumption');
            const priceEl     = document.getElementById('fuel-price');
            const consoElecEl = document.getElementById('vehicle-consumption-elec');
            const elecPriceEl = document.getElementById('elec-price');
            if (consoEl)     consoEl.value     = cfg.consumption;
            if (priceEl)     priceEl.value     = cfg.fuelPrice;
            if (consoElecEl) consoElecEl.value = cfg.consumptionElec;
            if (elecPriceEl) elecPriceEl.value = cfg.elecPrice;
            // Restaurer le type sélectionné
            selectVehicleType(cfg.type);
            /* Carburant + prix moyen local. `applyFuelKindUI()` est synchrone (pastilles,
               libellé, case « saisie manuelle », champ readonly) ; le relevé, lui, est
               asynchrone et respecte son cache — il ne repart vers data.gouv.fr que si la
               moyenne a plus de 6 h ou si on s'est déplacé de plus de 3 km. Au tout premier
               appel (chargement de l'app) il n'y a en général pas encore de fix GPS : le
               panneau étant fermé, ça n'a aucune conséquence visible, et l'ouverture de
               « Mon véhicule » repasse ici avec une position connue. */
            applyFuelKindUI();
            refreshLocalFuelAverage(false);
            // initCritAirUI() vit plus bas dans le script : ses constantes sont encore
            // en zone morte temporelle à cet instant. On diffère d'un tick.
            setTimeout(() => { try { initCritAirUI(); } catch (e) { console.warn('[ZFE] init UI :', e); } }, 0);
        }

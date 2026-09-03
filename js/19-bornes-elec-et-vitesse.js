        // === BORNES ÉLECTRIQUES — IRVE (data.gouv.fr) + Open Charge Map ===
        // ═══════════════════════════════════════════════════════════════════

        const EV_CONNECTOR_DEFS = [
            { key: 'ccs',     label: 'CCS',      cls: 'ccs',     color: '#4da3ff' },
            { key: 'chademo', label: 'CHAdeMO',   cls: 'chademo', color: '#f39c12' },
            { key: 'type2',   label: 'Type 2',    cls: 'type2',   color: '#28a745' },
            // Type 3 supprimé : standard obsolète français, quasi inexistant
        ];

        let selectedConnectorType = null; // null = tous
        let _allEVStations = [];
        let evStationMarkers = [];

        /* ═══ LIEUX DU TRAJET EN COURS, POUR L'HISTORIQUE (21/08/2026) ═══
           `saveTripToHistory()` n'archivait que des chiffres — ni départ ni arrivée —
           d'où un historique où aucun trajet n'était reconnaissable. Le départ ne peut
           se lire QU'AU DÉPART : à l'arrivée, `#modal-start-addr` a pu être réutilisé,
           et `lastRealCoords` désigne alors le point d'arrivée. On le mémorise donc ici,
           au lancement, et `stopCourse()` le relit.
           ⚠ Déclaré dans ce fichier et non dans `00-helpers-partages.js` parce qu'il
           n'est lu QUE par js/19 (startCourse, startFreeCourse, stopCourse) — la règle
           du helper partagé ne vise que les `let` traversant plusieurs fichiers.
           ⚠ Ne PAS y mémoriser aussi la destination : elle peut changer en cours de
           route (recherche pendant la navigation, proposition d'itinéraire acceptée,
           arrêt ajouté). C'est la destination FINALE qui a un sens dans l'historique,
           donc `stopCourse()` la lit dans l'état courant, pas ici. */
        let _tripPlacesMeta = null;

        /* `originCoords` est le point de départ RÉEL de l'itinéraire calculé
           (`precomputedRoute.startCoords`), passé par l'appelant. Il prime sur tout repli,
           et c'est important : quand l'utilisateur saisit un départ autre que sa position
           — le modal Confirmer le trajet le permet —, `exactStartCoords` continue de
           désigner le fix GPS, donc le mauvais point. On archiverait alors une adresse de
           départ qui ne correspond pas aux coordonnées enregistrées à côté d'elle, et le
           bouton « Y aller » de l'historique emmènerait ailleurs que ce qui est écrit. */
        function _beginTripPlaces(freeTrip, originCoords) {
            _tripPlacesMeta = tenterSansBruit(() => {
                const saisi = document.getElementById('modal-start-addr')?.value.trim();
                /* `startAddrText` est le géocodage inverse de la position GPS, rempli par
                   js/07 ; il vaut son message d'attente tant qu'aucun fix n'est arrivé.
                   Ce repli-là ne doit pas devenir un libellé de trajet : mieux vaut aucun
                   départ affiché qu'un « Recherche de votre position... » archivé pour
                   toujours. D'où le filtre sur la présence d'un vrai point GPS. */
                const auto = exactStartCoords ? startAddrText : null;
                return {
                    from: saisi || auto || null,
                    fromCoords: normalizeLngLat(originCoords)
                             || normalizeLngLat(exactStartCoords)
                             || normalizeLngLat(lastRealCoords) || null,
                    free: !!freeTrip,
                };
            }, 'historique/beginTripPlaces') || { from: null, fromCoords: null, free: !!freeTrip };
        }

        /* Cache de session, calqué sur celui des stations carburant (fetchStationsFR) :
           même TTL, même forme de clé (bbox arrondie au ~km + empreinte de tracé, pour
           résister aux micro-variations du tracé Mapbox entre deux appels). Il manquait
           entièrement côté bornes — rouvrir le panneau en thermique était instantané,
           alors qu'en électrique on repayait l'intégralité des requêtes Overpass à
           chaque ouverture. C'est le rapport gain/risque le plus élevé du lot : aucune
           requête n'est supprimée, seules les répétitions le sont. */
        const EV_CACHE_TTL_MS = 15 * 60 * 1000;

        function _evCacheKey(routeCoords) {
            return tenterSansBruit(() => {
                const bbox = turf.bbox(turf.lineString(routeCoords));
                return 'ev_osm_v1_' + bbox.map(v => Math.round(v * 100) / 100).join('_')
                     + '_' + routeFingerprint(routeCoords);
            }, 'EV/cacheKey');
        }

        async function fetchEVStationsAlongRoute(routeCoords) {
            const cacheKey = _evCacheKey(routeCoords);
            if (cacheKey) {
                const hit = tenterSansBruit(() => {
                    const brut = sessionStorage.getItem(cacheKey);
                    if (!brut) return null;
                    const { ts, data } = JSON.parse(brut);
                    if (Date.now() - ts < EV_CACHE_TTL_MS) return data;
                    sessionStorage.removeItem(cacheKey);
                    return null;
                }, 'EV/cacheLecture');
                if (hit) {
                    console.log(`[EV] ${hit.length} bornes servies depuis le cache de session`);
                    return hit;
                }
            }

            const segments = buildRouteSegments(routeCoords);
            const seen = new Set(); const merged = [];

            /* ⚠ NE PAS PLAFONNER LA CONCURRENCE DES SEGMENTS — mesuré, et contre-intuitif.
               Le raisonnement « 8 segments × 4 miroirs = 32 requêtes sur des serveurs qui
               n'accordent que ~2 créneaux par IP, donc des 429 » semble imparable ; il est
               faux en pratique. Comparaison dans Chrome sur 6 bbox urbaines, jouée dans les
               DEUX ordres pour écarter l'effet de chauffe des miroirs :

                 6 d'un coup    4,1 s / 11 s     1090 bornes    0 segment perdu
                 2 de front    16,2 s / 68,3 s    901-1090      0 à 2 segments perdus

               Le lancement groupé gagne dans les deux sens, et ne perd rien. Sérialiser
               allongeait la fenêtre pendant laquelle les miroirs pouvaient se dégrader, et
               c'est CE temps supplémentaire qui provoquait les pertes qu'on croyait éviter.
               Quiconque voudra « corriger » ce Promise.all doit refaire la mesure d'abord.

               ⚠ On ne TRONQUE PAS non plus le trajet, contrairement à la phase 1 du
               carburant : `maybeScanGasStationsLive()` sort immédiatement en électrique
               (18-stations-marqueurs.js), il n'existe donc AUCUNE phase 2 pour rattraper en
               route ce qu'on aurait coupé. Tronquer ici masquerait sans retour les bornes
               au-delà du 80ᵉ km. */
            const results = await Promise.all(segments.map(async seg => {
                const batch = [];
                // Source unique : OpenStreetMap via Overpass (amenity=charging_station)
                try {
                    const irvePts = await fetchIRVE(seg); // → fetchEVFromOverpass
                    irvePts.forEach(p => { p._source = 'osm'; batch.push(p); });
                } catch(e) { logAppError('EV/segment', e); }
                return batch;
            }));

            for (const batch of results) for (const s of batch) {
                const key = `${(s.latitude||'').toString().slice(0,8)},${(s.longitude||'').toString().slice(0,8)}`;
                if (!seen.has(key)) { seen.add(key); merged.push(s); }
            }
            console.log(`[EV] ${merged.length} bornes récupérées`);
            /* Un relevé vide n'est PAS mis en cache : c'est presque toujours le signe que
               les miroirs Overpass ont tous échoué, pas qu'il n'y a aucune borne. Le
               mémoriser 15 min condamnerait le conducteur à une liste vide pendant tout
               ce temps, alors que la réouverture du panneau est précisément le geste par
               lequel il espère y remédier. */
            if (cacheKey && merged.length) {
                tenterSansBruit(() => sessionStorage.setItem(cacheKey,
                    JSON.stringify({ ts: Date.now(), data: merged })), 'EV/cacheEcriture');
            }
            return merged;
        }

        // === Remplacement de fetchIRVE + fetchOCM (APIs mortes/CORS bloqué) ===
        // Nouvelle source unique : OpenStreetMap via Overpass (même pattern que les stations carburant)
        // 3 mirrors de fallback, POST, pas de clé API, CORS ouvert
        async function fetchIRVE(seg) {
            return fetchEVFromOverpass(seg);
        }
        async function fetchOCM(seg) {
            return []; // plus utilisé, Overpass couvre déjà tout
        }

        /* ⚠ POURQUOI LES BORNES SONT PLUS LENTES QUE LES STATIONS THERMIQUES (16/08/2026).
           Ce ne sont pas les mêmes API, et aucun réglage ne comblera l'écart de nature :
           le carburant vient d'un jeu ODS indexé (data.economie.gouv.fr, **0,16 s** mesuré,
           3 essais), les bornes d'Overpass, un moteur qui exécute un filtre sur la base OSM
           mondiale, hébergé par des miroirs bénévoles. Mesuré avec un User-Agent de
           navigateur, même requête (bbox Paris 12×20 km) :

             maps.mail.ru               200 en 4,4 s
             overpass.private.coffee    200 en 6,7 s   (mais 504 après 31 s en heure chargée)
             overpass.kumi.systems      200 en 9,1 s   (idem)
             overpass.openstreetmap.ru  injoignable
             overpass-api.de            406 — voir ci-dessous

           ⚠⚠ **overpass-api.de est INUTILISABLE depuis un navigateur, et c'est un piège de
           mesure.** L'instance officielle répond 406 à tout User-Agent de navigateur (et à
           celui de node) ; elle n'accepte qu'un UA applicatif nommé. En `curl`, elle rendait
           1,3 s là où les miroirs configurés donnaient 504 — j'ai d'abord conclu que « le
           meilleur miroir était absent de la liste ». Faux : **le navigateur ne peut pas
           poser `User-Agent`** (en-tête interdit par la spécification fetch), donc l'app ne
           reproduira jamais ce chiffre. Le banc d'essai mesurait une requête que
           l'application est structurellement incapable d'émettre. Règle générale : chronométrer
           Overpass avec `curl` ou node ne dit rien de ce que fera le navigateur — refaire la
           mesure en posant un UA de navigateur, sinon on optimise une fiction.

           DEUX vrais défauts du code, eux bien réels :
           1. **Le timeout de 12 s était plus court que la réponse.** Sur une bbox de segment
              complet (100 km), les miroirs mettent 30 s ou rendent 504. On abandonnait donc à
              12 s un miroir qui allait répondre — puis on recommençait sur le suivant.
           2. **La boucle `for` était séquentielle** : chaque miroir mort se payait
              intégralement avant d'essayer le suivant, soit jusqu'à 48 s POUR FINIR SUR UNE
              LISTE VIDE. Ça se vit comme « c'est lent », alors que c'est « c'est lent PUIS ça
              échoue ». On lance désormais en différé (« hedging ») : un miroir part seul, et
              on n'ajoute le suivant que s'il n'a rien rendu au bout de EV_HEDGE_MS ; le
              premier qui répond gagne, les autres sont annulés. Exercé pour de vrai, dans
              Chrome : 518 bornes rendues, servies par le deuxième miroir après que le
              premier ait tardé — l'ancienne boucle aurait payé un timeout complet avant
              d'y arriver.
              Un `Promise.any` d'emblée serait plus rapide encore, mais quadruplerait la
              charge sur des serveurs bénévoles pour rien neuf fois sur dix. */
        /* ⚠ DEUX MIROIRS DE SECOURS AJOUTÉS EN QUEUE (30/08/2026), APRÈS UNE PANNE
           SIMULTANÉE DES QUATRE PREMIERS. Journal du soir, scan parkings ET relevé d'aires :
             private.coffee   → « Failed to fetch » — et la console précise CORS : réponse
                                 SANS `Access-Control-Allow-Origin`, donc une page d'erreur
                                 du frontal, pas une réponse Overpass
             kumi.systems     → idem
             maps.mail.ru     → timeout à 25 s
             openstreetmap.ru → ERR_CONNECTION_TIMED_OUT
           Les quatre tombant ensemble, `_fetchOverpassHedged` n'avait plus rien à proposer :
           la feuille parkings affichait « Recherche impossible » et le relevé d'aires levait
           « aucun tronçon relevé (1/1) ». Rien n'avait changé dans le code — c'est la liste
           qui était trop courte pour encaisser une panne groupée.
           `overpass.osm.ch` et `overpass-api.de` répondent 200 avec
           `Access-Control-Allow-Origin: *` (revérifié ce jour, User-Agent de navigateur et
           `Origin: null` compris).
           ⚠ CECI CONTREDIT LE PAVÉ CI-DESSUS sur le « 406 à tout navigateur » de
           overpass-api.de : la mesure ne se reproduit plus, et js/10 interroge cette même
           instance depuis le navigateur sans que rien n'ait jamais été signalé. Le 406 était
           vraisemblablement une réponse anti-abus transitoire, pas une règle sur l'UA.
           On ne les met pas en tête pour autant : overpass-api.de applique un quota par IP
           (« rate_limited » obtenu ici dès la deuxième requête rapprochée) et c'est
           l'instance officielle, la plus sollicitée du lot. Elle joue le filet, pas le
           premier rideau — le hedging ne l'atteint que si les autres tardent vraiment. */
        /* ⛔ `overpass.osm.ch` RETIRÉ LE 01/09/2026 — NE PAS LE REMETTRE.
           Ajouté en filet le 30/08 après une panne groupée, il a été vérifié « répond 200
           avec Access-Control-Allow-Origin » — ce qui est vrai, et ne suffisait pas. Cette
           instance ne contient QUE LA SUISSE. Mesuré ce jour, même requête parkings :
             Courbevoie (FR) → 200 en 0,3 s, 0 élément
             Berne (CH)      → 200 en 0,3 s, 228 éléments
           En France elle rend donc un succès vide, INSTANTANÉMENT — et comme le premier
           miroir qui répond gagne la course, elle battait `maps.mail.ru` (17 s sur la même
           requête) à tous les coups. Résultat : « Aucun parking recensé dans 1.5 km » en
           plein Courbevoie, sans la moindre erreur nulle part. Un miroir régional n'est pas
           un miroir de secours : il est pire qu'un miroir en panne, parce qu'il ment vite.
           La garde `exigerResultat` ci-dessous couvre la même classe de panne pour les
           miroirs restants — les deux vont ensemble. */
        const EV_MIRRORS = [
            'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
            'https://overpass.private.coffee/api/interpreter',
            'https://overpass.kumi.systems/api/interpreter',
            'https://overpass.openstreetmap.ru/cgi/interpreter',
            'https://overpass-api.de/api/interpreter',
        ];
        const EV_HEDGE_MS   = 6000;    // sans réponse à 6 s, on double la mise sur le suivant
        /* ⚠⚠ 45 s, ET CE N'EST PAS DU CONFORT — MESURE DU 01/09/2026, DANS LE NAVIGATEUR,
           PAGE CHARGÉE EN `file://` (outil : `node tools/_test-overpass.js`). Sur la même
           requête parkings à Perpignan :
             maps.mail.ru               200 en 20,6 s — 131 éléments
             overpass.private.coffee    CORS : bloqué (Origin: null)
             overpass.kumi.systems      CORS : bloqué
             overpass-api.de            CORS : bloqué
             overpass.openstreetmap.ru  injoignable (21 s)
           Autrement dit : **un seul miroir répond réellement à l'application empaquetée**,
           et il met une vingtaine de secondes. Les 25 s précédentes le coupaient une fois
           sur deux — d'où « Recherche indisponible » alors que rien n'était cassé.
           ⚠ NE PAS CHRONOMÉTRER AVEC curl OU node POUR RÉGLER CETTE VALEUR : sans CORS ni
           interdiction de poser `User-Agent`, ils voient quatre miroirs répondre là où le
           navigateur n'en voit qu'un. Trois candidats supplémentaires ont été essayés le
           même jour (overpass.osm.jp, overpass.monicz.dev, lz4/z.overpass-api.de) : tous
           refusent l'origine `null`. Il n'y a pas de liste plus longue à écrire, il y a un
           seul serveur et il faut lui laisser le temps.
           Le prix est borné : le hedging écarte les miroirs morts en moins d'une seconde,
           donc ces 45 s ne sont attendues que par celui qui va répondre. */
        const EV_TIMEOUT_MS = 45000;

        /* `opts` ajouté le 31/08/2026 pour la limite de vitesse (js/10), qui partage
           désormais ces miroirs : sa requête est minuscule (un rayon de 50 m) et se rejoue
           toutes les 6 à 12 s. Les 25 s de EV_TIMEOUT_MS, taillées pour une bbox de 100 km,
           y auraient bloqué la relève suivante — `isFetchingSpeedLimit` interdit deux
           appels de front. Sans `opts`, rien ne change : les appelants existants gardent
           exactement les valeurs d'avant. */
        function _courseOverpass(query, opts) {
            const _timeout = (opts && opts.timeoutMs) || EV_TIMEOUT_MS;
            const _hedge   = (opts && opts.hedgeMs)   || EV_HEDGE_MS;
            /* `exigerResultat` : une réponse VIDE ne remporte plus la course, elle est mise
               de côté et les autres miroirs continuent. Le premier qui rapporte quelque
               chose gagne ; si aucun n'y arrive, la réponse vide mise de côté est rendue —
               on ne fabrique donc jamais une erreur là où il n'y a réellement rien.
               Née du miroir suisse (voir EV_MIRRORS), mais elle ne le vise pas lui : elle
               vaut pour toute instance à couverture partielle, base en cours de rechargement
               ou requête tombant sur un fragment vide. Un « 0 » instantané est le pire cas
               possible d'une course au plus rapide.
               ⚠ RÉSERVÉE AUX APPELS OÙ « AUCUN » EST UNE AFFIRMATION MONTRÉE À
               L'UTILISATEUR (parkings, bornes). Les balayages par tronçons de js/09 et la
               limite de vitesse de js/10 rencontrent des vides parfaitement normaux, très
               souvent : les faire attendre tous les miroirs à chaque fois coûterait des
               dizaines de secondes pour rien. Sans l'option, comportement inchangé. */
            const _exigerResultat = !!(opts && opts.exigerResultat);
            const _vide = (d) => !d || !Array.isArray(d.elements) || d.elements.length === 0;
            return new Promise((resolve, reject) => {
                const ctrls = [];
                let lances = 0, echecs = 0, gagne = false;
                let reponseVide = null;   // premier succès vide mis de côté
                /* Causes retenues pour l'agrégat final. Sans elles, l'échec se résumait à
                   « tous les miroirs Overpass ont échoué » — vrai, mais muet sur la seule
                   question qui compte : `Failed to fetch` (CORS depuis `file://`, ou réseau)
                   ou `→ 504` (miroir surchargé). Deux pannes sans rapport, deux remèdes
                   opposés, et le journal ne permettait pas de les distinguer. */
                const causes = [];

                const lancer = () => {
                    if (gagne || lances >= EV_MIRRORS.length) return;
                    const url  = EV_MIRRORS[lances++];
                    const nom  = url.split('/')[2];
                    const ctrl = new AbortController();
                    ctrls.push(ctrl);
                    const minuteur = setTimeout(() => ctrl.abort(), _timeout);

                    /* `fetch` avec un corps en chaîne pose `Content-Type: text/plain` ;
                       Overpass attend un formulaire `data=…`. Les miroirs retenus tolèrent
                       les deux (vérifié), mais l'en-tête explicite décrit ce qu'on envoie
                       réellement et évite de dépendre de cette tolérance. */
                    fetch(url, {
                        method:  'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body:    'data=' + encodeURIComponent(query),
                        signal:  ctrl.signal,
                    })
                        .then(res => res.ok ? res.json() : Promise.reject(new Error(`${nom} → ${res.status}`)))
                        .then(data => {
                            if (gagne) return;
                            if (_exigerResultat && _vide(data)) {
                                /* Succès, mais rien dedans : on le garde sous le coude et on
                                   laisse la course continuer. Compté comme un échec pour la
                                   relance, pas pour le verdict final. */
                                if (!reponseVide) reponseVide = data;
                                console.warn(`[EV/Overpass] ${nom} : réponse vide, on continue`);
                                causes.push(`${nom}: 0 élément`);
                                if (++echecs >= EV_MIRRORS.length) { gagne = true; resolve(reponseVide); }
                                else lancer();
                                return;
                            }
                            gagne = true;
                            ctrls.forEach(c => c.abort());   // libère les miroirs encore en vol
                            console.log(`[EV/Overpass] servi par ${nom}`);
                            resolve(data);
                        })
                        .catch(e => {
                            if (gagne) return;               // abandon provoqué par le gagnant
                            console.warn(`[EV/Overpass] ${nom} :`, e.message);
                            causes.push(`${nom}: ${e.name === 'AbortError' ? 'timeout' : e.message}`);
                            if (++echecs >= EV_MIRRORS.length) {
                                /* Une réponse vide mise de côté vaut mieux qu'une erreur :
                                   au moins un miroir a répondu, il n'y a simplement rien. */
                                if (reponseVide) { gagne = true; resolve(reponseVide); return; }
                                reject(new Error('tous les miroirs Overpass ont échoué — ' + causes.join(' | ')));
                            }
                            else lancer();
                        })
                        .finally(() => clearTimeout(minuteur));

                    // Renfort différé : ne part que si le précédent tarde vraiment.
                    setTimeout(lancer, _hedge);
                };
                lancer();
            });
        }

        /* ═══ UNE SECONDE CHANCE, ET UNE SEULE      (01/09/2026) ═══
           `_courseOverpass` ci-dessus mène la course entre miroirs. Elle ne rend rien
           quand ils échouent tous — ce qui, dans l'app empaquetée, veut dire « le seul
           miroir joignable est occupé » : `maps.mail.ru` rend alors 504, ou dépasse le
           budget. Mesuré ce jour, deux tentatives d'affilée sur la même requête : 504,
           puis 131 éléments trois minutes plus tard. Le serveur n'est pas en panne, il
           régule — Overpass limite les créneaux par adresse.
           On rejoue donc UNE fois, après une courte pause. Pas deux, pas en boucle : le
           serveur est bénévole, et l'utilisateur qui attend déjà vingt secondes ne doit
           pas en attendre quatre-vingt-dix.
           ⚠ ON NE REJOUE QUE SI UN MIROIR A VRAIMENT RÉPONDU (5xx) OU A DÉPASSÉ LE
           BUDGET. Un « Failed to fetch » est un refus CORS : il est définitif, le rejouer
           ne ferait que perdre le temps de l'utilisateur pour le même échec. */
        const OVERPASS_PAUSE_REPRISE_MS = 2500;

        /* ═══ UN SEUL APPEL OVERPASS À LA FOIS       (01/09/2026) ═══
           Le serveur unique qui répond à l'app limite les créneaux par adresse IP :
           deux requêtes qui se chevauchent, et la seconde repart en 504. C'est ce que
           montre le journal du 31/08 à 22:07 et 22:25 — `maps.mail.ru → 504` pendant que
           le scan parkings était ouvert, les quatre autres miroirs étant de toute façon
           bloqués par CORS.
           Les deux veilles de fond (stations js/11, parkings js/27) ne se gardaient que
           d'elles-mêmes : chacune vérifiait SA feuille et SON drapeau d'occupation, et
           tirait donc allègrement pendant que l'autre travaillait. Ce compteur leur donne
           enfin de quoi se voir. Il ne bloque PAS les appels au premier plan — un scan
           demandé par l'utilisateur passe toujours ; ce sont les préchargements
           opportunistes qui s'effacent, c'est exactement leur rôle. */
        let _overpassEnVol = 0;
        function overpassOccupe() { return _overpassEnVol > 0; }

        function _fetchOverpassHedged(query, opts) {
            _overpassEnVol++;
            const _fin = (v) => { _overpassEnVol = Math.max(0, _overpassEnVol - 1); return v; };
            return _courseOverpassAvecReprise(query, opts).then(_fin, (e) => { _fin(); throw e; });
        }

        function _courseOverpassAvecReprise(query, opts) {
            return _courseOverpass(query, opts).catch(err => {
                const msg = String(err && err.message || '');
                /* 5xx = le miroir a répondu, il est juste débordé → une reprise a du sens.
                   « Failed to fetch » = refus CORS, définitif : rejouer ne ferait que
                   faire attendre l'utilisateur pour le même échec. */
                const reessayable = /→ 5\d\d/.test(msg) || /timeout/.test(msg);
                if (!reessayable) throw err;
                console.warn('[EV/Overpass] miroir occupé, seconde tentative dans', OVERPASS_PAUSE_REPRISE_MS + ' ms');
                return new Promise(r => setTimeout(r, OVERPASS_PAUSE_REPRISE_MS))
                    .then(() => _courseOverpass(query, opts));
            });
        }

        async function fetchEVFromOverpass(seg) {
            const bbox  = `${seg.minLat.toFixed(4)},${seg.minLng.toFixed(4)},${seg.maxLat.toFixed(4)},${seg.maxLng.toFixed(4)}`;
            // `nwr` = node+way+relation en une passe, et `out center tags` au lieu de
            // `body` : on ne rapatrie plus la liste des nœuds composant chaque way, dont
            // le parseur ci-dessous n'a jamais rien fait. Même résultat, charge allégée.
            const query = `[out:json][timeout:25];nwr["amenity"="charging_station"](${bbox});out center tags;`;
            try {
                // Voir la note des parkings (js/27) : un « 0 borne » instantané venu d'un
                // seul miroir ne doit pas clore la course.
                const data = await _fetchOverpassHedged(query, { exigerResultat: true });
                const elements = data?.elements || [];
                const stations = elements.map(el => {
                    const tags = el.tags || {};
                    const lat = el.center?.lat ?? el.lat;
                    const lon = el.center?.lon ?? el.lon;
                    if (!lat || !lon) return null;
                    const powerKw = (() => {
                        const vals = [
                            tags['socket:type2:output'],
                            tags['socket:ccs:output'],
                            tags['socket:chademo:output'],
                            tags['charging:fast:output'],
                        ].map(v => parseFloat(String(v || '').replace(/[^0-9.]/g, '')))
                         .filter(n => n > 0);
                        return vals.length ? Math.max(...vals) : (parseFloat(tags['maxpower'] || tags['power'] || '') || null);
                    })();
                    const nb_pdc = parseInt(tags['capacity'] || tags['socket:type2'] || tags['socket:ccs'] || '1') || 1;
                    const hasSocket = key => { const v = tags[key]; return v && v !== 'no' && v !== '0'; };
                    return {
                        _type: 'osm',
                        latitude:  lat,
                        longitude: lon,
                        name:  tags.name || tags.operator || tags.brand || 'Borne de recharge',
                        addr:  tags['addr:street']
                            ? `${tags['addr:housenumber'] || ''} ${tags['addr:street']}`.trim()
                            : (tags['addr:city'] || tags['addr:town'] || ''),
                        power:  powerKw,
                        nb_pdc: nb_pdc,
                        connectors: {
                            type2:   hasSocket('socket:type2') || hasSocket('socket:type2_combo'),
                            ccs:     hasSocket('socket:ccs') || hasSocket('socket:type2_combo'),
                            chademo: hasSocket('socket:chademo'),
                        }
                    };
                }).filter(Boolean);
                console.log(`[EV/Overpass] ${stations.length} bornes sur le segment`);
                return stations;
            } catch(e) {
                /* Échec de TOUS les miroirs : à journaliser pour de bon. C'est exactement
                   le cas qui rendait une liste vide sans explication, et le journal
                   (Profil → 🩺) est le seul endroit où on peut le constater depuis le
                   téléphone. */
                logAppError('EV/Overpass', e);
                return [];
            }
        }

        function parseEVStations(rawStations, routeCoords) {
            // Même échantillonnage que parseGasStations : voir ligneProximite() (js/00).
            const routeLine    = turf.lineString(ligneProximite(routeCoords));
            const routeTotalKm = turf.length(turf.lineString(routeCoords), { units: 'kilometers' });
            // Marge élargie : couvre les bornes près du départ/arrivée (snapping imprécis)
            const MARGIN_KM    = 5;
            const results = [];

            rawStations.forEach(s => {
                const lat = parseFloat(s.latitude);
                const lng = parseFloat(s.longitude);
                if (isNaN(lat) || isNaN(lng)) return;

                const pt      = turf.point([lng, lat]);
                const snapped = turf.nearestPointOnLine(routeLine, pt, { units: 'kilometers' });
                const distToRoute = snapped.properties.dist;
                // Distance max au trajet : 2 km en ville (<30 km), 3 km sinon
                // Volontairement strict : on préfère moins de bornes mais pertinentes
                const maxDist = routeTotalKm < 30 ? 2 : 3;
                if (distToRoute > maxDist) return;

                const loc = snapped.properties.location;
                if (loc < -MARGIN_KM || loc > routeTotalKm + MARGIN_KM) return;

                results.push({
                    lng, lat,
                    name:     s.name,
                    addr:     s.addr || '',
                    power:    s.power,
                    nb_pdc:   s.nb_pdc || 1,
                    connectors: s.connectors || {},
                    _source:  s._source,
                    distToRoute:   Math.round(distToRoute * 1000),
                    distAlongRoute: Math.max(0, Math.min(loc, routeTotalKm)),
                });
            });

            console.log(`[EV] ${results.length} bornes valides après filtrage géo`);
            return results;
        }

        function clearEVStationMarkers() {
            _evMarkerEls.forEach(m => m.marker.remove());
            _evMarkerEls = [];
            _evStationsGeoData = [];
            evStationMarkers = [];
        }

        // `power` sert à afficher « ⚡ 50 kW » sur la pastille, comme dans le scan
        // « autour de moi » : sans lui le marqueur ne dirait que ⚡.
        function addEVStationMarker(lng, lat, isSelected, power) {
            _evStationsGeoData.push({ lng, lat, power });
        }

        /* ⚠ NE PAS redéfinir _flushEVMarkers ici.
           Une seconde déclaration vivait à cet endroit — vestige de l'approche par
           couche GeoJSON abandonnée — et **écrasait silencieusement** la version
           fonctionnelle définie plus haut (marqueurs DOM ⚡), les déclarations de
           fonctions de même portée étant résolues à la dernière. Elle appelait
           `_ensureGasLayers()` (devenu un stub vide) puis cherchait une source
           inexistante et sortait : `renderEVCards()` l'appelait bien, mais AUCUNE
           borne n'apparaissait sur la carte en véhicule électrique. */

        function buildEVConnectorSelector(stations) {
            const box = document.getElementById('gas-fuel-selector');
            if (!box) return;
            box.innerHTML = '';

            const available = EV_CONNECTOR_DEFS.filter(d =>
                stations.some(s => s.connectors?.[d.key])
            );
            if (available.length === 0) return;

            // Bouton "Tous"
            const allBtn = document.createElement('button');
            allBtn.className = 'gas-fuel-btn' + (!selectedConnectorType ? ' active' : '');
            allBtn.style.borderColor = 'rgba(255,255,255,0.2)';
            allBtn.textContent = 'Tous';
            allBtn.onclick = () => setConnectorFilter(null);
            box.appendChild(allBtn);

            available.forEach(d => {
                const btn = document.createElement('button');
                btn.className = `gas-fuel-btn${selectedConnectorType === d.key ? ' active' : ''}`;
                btn.dataset.connector = d.key;
                btn.textContent = d.label;
                btn.style.setProperty('--ev-color', d.color);
                btn.onclick = () => {
                    if (btn.classList.contains('active') && selectedConnectorType === d.key) {
                        setConnectorFilter(null);
                    } else {
                        setConnectorFilter(d.key);
                    }
                };
                box.appendChild(btn);
            });
        }

        function setConnectorFilter(connType) {
            selectedConnectorType = connType;
            document.querySelectorAll('#gas-fuel-selector .gas-fuel-btn').forEach(b => {
                b.classList.toggle('active',
                    connType === null ? b.textContent === 'Tous' : b.dataset.connector === connType
                );
            });
            const filtered = connType
                ? _allEVStations.filter(s => s.connectors?.[connType])
                : _allEVStations;
            renderEVCards(dedupeEVByCluster(filtered).slice(0, 5));
        }

        /* Dédoublonnage par zone : une seule borne représentante par cluster de 300 m,
           sinon les cinq premières cartes sont souvent les cinq bornes du même parking.
           ⚠ UN SEUL EXEMPLAIRE, appelé par les TROIS chemins qui affichent des bornes
           (liste initiale, filtre connecteur, appendice ⚡ du mode hybride) : la boucle
           était recopiée entre les deux premiers, et le rayon avait déjà commencé à
           exister en deux constantes distinctes. */
        const EV_CLUSTER_KM = 0.3;
        function dedupeEVByCluster(stations) {
            const gardees = [];
            for (const s of (stations || [])) {
                const pt = turf.point([s.lng, s.lat]);
                const tropPres = gardees.some(c =>
                    turf.distance(pt, turf.point([c.lng, c.lat]), { units: 'kilometers' }) < EV_CLUSTER_KM
                );
                if (!tropPres) gardees.push(s);
            }
            return gardees;
        }

        /* `opts.append` : rendu en APPENDICE, sous des cartes déjà posées (mode hybride
           « Tous », où les pompes occupent le haut de la liste). Deux conséquences, et
           c'est tout : on ne vide pas la liste, et les id des cartes prennent un préfixe
           propre — `gas-card-0` désignerait sinon à la fois la première pompe et la
           première borne, et la boucle de détour des bornes écrirait ses minutes sur la
           carte d'une station-service. */
        function renderEVCards(stations, opts) {
            const enAppendice = !!(opts && opts.append);
            const pfx  = enAppendice ? 'ev' : 'gas';
            const list = document.getElementById('gas-stations-list');
            if (!enAppendice) list.innerHTML = '';
            clearEVStationMarkers();

            if (!stations || stations.length === 0) {
                if (!enAppendice) {
                    list.innerHTML = `<div style="font-size:12px;color:#4a5568;text-align:center;padding:8px 0;">Aucune borne compatible sur le trajet.</div>`;
                }
                return;
            }

            stations.forEach((s, i) => {
                s._idx = i;
                const card = document.createElement('div');
                card.className = 'gas-station-card';
                card.id = `${pfx}-card-${i}`;
                s._cardId = card.id;   // voir selectGasStation() : le préfixe varie

                // Puissance
                const powerStr = s.power ? `${s.power} kW` : 'kW ?';
                // Connecteurs disponibles
                const connIcons = EV_CONNECTOR_DEFS
                    .filter(d => s.connectors?.[d.key])
                    .map(d => {
                        const col = d.key === 'chademo' ? '#f39c12' : d.key === 'ccs' ? '#4da3ff' : '#28a745';
                        return `<span style="font-size:9px;padding:2px 5px;border-radius:8px;background:${col}18;border:1px solid ${col}55;color:${col};">${d.label}</span>`;
                    })
                    .join(' ');
                // Nb points de charge
                const pdcStr = s.nb_pdc > 1 ? `${s.nb_pdc} pts` : '1 pt';

                card.innerHTML = `
                    <div class="gas-selected-dot"></div>
                    <div class="gas-card-icon">⚡</div>
                    <div class="gas-card-info">
                        <div class="gas-card-name">${echapperHtml(s.name === "Borne de recharge" && s.addr ? s.addr : s.name)}</div>
                        <div class="gas-card-addr">${echapperHtml(s.name === "Borne de recharge" ? "" : (s.addr || "—"))}</div>
                        <div style="display:flex;gap:4px;flex-wrap:wrap;margin-top:4px;">${connIcons}</div>
                    </div>
                    <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">
                        <span class="gas-price-pill" style="background:rgba(77,163,255,0.12);color:#4da3ff;border:1px solid rgba(77,163,255,0.35);font-size:11px;padding:3px 7px;border-radius:8px;font-weight:700;">${powerStr}</span>
                        <span style="font-size:10px;color:#6b7785;">${pdcStr}</span>
                        <div class="gas-card-dist" id="${pfx}-detour-${i}" style="color:#8892b0;font-size:11px;">+… min</div>
                    </div>`;

                if (selectedGasStation && selectedGasStation.lng === s.lng && selectedGasStation.lat === s.lat)
                    card.classList.add('selected');

                card.addEventListener('click', () => selectGasStation(s));
                list.appendChild(card);
                addEVStationMarker(s.lng, s.lat, selectedGasStation?.lng === s.lng && selectedGasStation?.lat === s.lat, s.power);
            });
            _flushEVMarkers(); // rendu GPU en une seule passe

            // Calculer les détours OSRM
            if (modalStartCoords && modalEndCoords) {
                const baseDurationSec = _baseRouteForGas
                    ? _baseRouteForGas.durationH * 3600
                    : modalPendingRoute?.osrmData?.routes?.[0]?.duration;
                if (baseDurationSec) {
                    stations.forEach(async (s, i) => {
                        try {
                            const [snLng, snLat] = await snapToRoad(s.lng, s.lat);
                            const url = `https://router.project-osrm.org/route/v1/driving/${modalStartCoords[0]},${modalStartCoords[1]};${snLng},${snLat};${modalEndCoords[0]},${modalEndCoords[1]}?overview=false`;
                            const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
                            const data = await resp.json();
                            if (data.routes?.[0]) {
                                const detourSec = data.routes[0].duration - baseDurationSec;
                                s._deltaMin = detourSec / 60;
                                const el = document.getElementById(`${pfx}-detour-${i}`);
                                if (el) el.textContent = detourSec > 0 ? `+${Math.round(detourSec / 60)} min` : 'Sur le trajet';
                            }
                        } catch (e) { if (DEBUG) console.warn("[renderEVCards] exception ignorée :", e); }
                    });
                }
            }
        }

        function buildEVStationsUI(stations) {
            const loading = document.getElementById('gas-stations-loading');
            loading.style.display = 'none';
            _allEVStations = stations || [];

            if (_allEVStations.length === 0) {
                clearEVStationMarkers();
                document.getElementById('gas-stations-list').innerHTML =
                    `<div style="font-size:12px;color:#4a5568;text-align:center;padding:8px 0;">Aucune borne de recharge trouvée sur ce trajet.</div>`;
                return;
            }

            selectedConnectorType = null;
            // Trier par position le long du trajet (départ → arrivée)
            // puis par distance au trajet pour départager
            _allEVStations.sort((a, b) =>
                (a.distAlongRoute - b.distAlongRoute) || (a.distToRoute - b.distToRoute)
            );
            const dedupedStations = dedupeEVByCluster(_allEVStations);
            buildEVConnectorSelector(_allEVStations);
            renderEVCards(dedupedStations.slice(0, 5));
        }

        // ── Bannière "5 min avant la station" ──
        function checkGasStationApproach(remainingTimeHours) {
            if (!gasStopWaypoint || gasStationAlertFired || !isCourseStarted) return;
            const remainingMin = remainingTimeHours * 60;
            // On calcule combien de temps avant la station (pas avant l'arrivée)
            // Estimation : distance driver → station via le tracé
            if (drivers.length === 0 || !currentTurfLine) return;
            const driverPos = drivers[0].marker ? drivers[0].marker.getLngLat() : null;
            if (!driverPos) return;
            const ptDriver = turf.point([driverPos.lng, driverPos.lat]);
            const ptStation = turf.point([gasStopWaypoint[0], gasStopWaypoint[1]]);
            const snappedDriver  = turf.nearestPointOnLine(currentTurfLine, ptDriver,  { units: 'kilometers' });
            const snappedStation = turf.nearestPointOnLine(currentTurfLine, ptStation, { units: 'kilometers' });
            const distToStation = snappedStation.properties.location - snappedDriver.properties.location;
            if (distToStation < 0) { gasStationAlertFired = true; return; } // déjà dépassée
            const speed = drivers[0].actualSpeed > 5 ? drivers[0].actualSpeed : 60;
            const minsToStation = (distToStation / speed) * 60;
            if (minsToStation <= 5 && minsToStation >= 0) {
                showGasStationBanner(minsToStation);
                gasStationAlertFired = true;
            }
        }

        function showGasStationBanner(minutesLeft) {
            const banner = document.getElementById('gas-station-banner');
            const msg    = document.getElementById('gas-banner-msg');
            if (!banner) return;
            const minText = minutesLeft < 1 ? 'moins d\'1 min' : `environ ${Math.round(minutesLeft)} min`;
            msg.textContent = `Votre station est dans ${minText} — préparez-vous à vous arrêter.`;
            banner.classList.add('visible');
        }

        function closeGasStationBanner() {
            document.getElementById('gas-station-banner')?.classList.remove('visible');
        }

        // ── Détection d'arrivée à une étape intermédiaire (navWaypoints) ──
        function checkNavWaypointArrival() {
            if (!navWaypoints.length || !isCourseStarted || drivers.length === 0) return;
            const driverPos = drivers[0].marker ? drivers[0].marker.getLngLat() : null;
            if (!driverPos) return;

            const REACHED_M = 80; // seuil : 80m de l'étape → atteinte
            const next = navWaypoints[0];
            const dist = turf.distance(
                turf.point([driverPos.lng, driverPos.lat]),
                turf.point(next.coords),
                { units: 'meters' }
            );

            if (dist <= REACHED_M) {
                // Étape atteinte — la retirer de la liste
                navWaypoints.shift();
                console.log(`[NavWP] Étape atteinte : ${next.label}. Restantes : ${navWaypoints.length}`);

                // Annoncer vocalement (fichier optionnel — ne pas casser si absent)
                try { if (typeof playAudioSequence === 'function') playAudioSequence(['reached_waypoint.ogg'], 0, 'bavard'); } catch (e) { if (DEBUG) console.warn("[checkNavWaypointArrival] exception ignorée :", e); }

                // Recalculer vers la prochaine étape / destination
                // (en trajet libre sans exactEndCoords, recalculateRoute gère le cas navWaypoints restants)
                const hasMoreToGo = exactEndCoords || navWaypoints.length > 0;
                if (hasMoreToGo) {
                    recalculateRoute(driverPos.lng, driverPos.lat);
                } else {
                    // Trajet libre : dernier arrêt atteint, on repasse en mode "libre pur"
                    currentTurfLine = null;
                    fullRouteLine = null;
                    clearRouteLine();
                    document.getElementById('status').innerText = "Trajet libre en cours ! Roulez pour marquer des points 🧭";
                    document.getElementById('status').style.color = "#20c997";
                }
            }

            // Mettre à jour le badge étape
            updateNavWaypointBadge();
        }

        function updateNavWaypointBadge() {
            const badge = document.getElementById('nav-waypoint-badge');
            if (!badge) return;
            if (!navWaypoints.length || !isCourseStarted) {
                badge.classList.remove('visible');
                return;
            }
            badge.textContent = `📍 Étape : ${navWaypoints[0].label}`;
            badge.classList.add('visible');
        }

        function validateAndLaunchTrip() {
            if (!modalPendingRoute) return;
            const { osrmData, startCoords, endCoords, waypoints, waypointLabels, avoidTolls } = modalPendingRoute;

            // Mémoriser le waypoint station choisi (null si "pas de stop")
            gasStopWaypoint = selectedGasStation ? [selectedGasStation.lng, selectedGasStation.lat] : null;
            gasStationAlertFired = false;
            resetZFEForTrip();

            // Initialiser les étapes de navigation (hors station essence)
            navWaypoints = (waypoints || []).map((coords, i) => ({
                coords,
                label: (waypointLabels || [])[i] || `Étape ${i + 1}`
            }));

            clearAltRoutes();
            clearGasStationMarkers();
            resetModalWaypoints();
            closeTripModal();
            startCourse(modalMode, { osrmData, startCoords, endCoords, avoidTolls });
        }

        /* ADOPTION D'UN NOUVEL ITINÉRAIRE — corps extrait de `recalculateRoute()` le 18/08/2026,
           à l'identique, pour que l'acceptation d'une proposition d'itinéraire plus rapide
           (voir `acceptRerouteProposal()` plus bas) passe EXACTEMENT par le même chemin qu'un
           recalcul de déviation. Les deux font la même chose — remplacer le trajet suivi — et
           deux copies de cette séquence auraient divergé au premier ajout d'état à réinitialiser.

           ⚠ Ne pas confondre avec `refreshEtaFromTraffic()`, qui n'écrit QUE deux nombres :
           tout ce qui suit ici (steps reconstruits, seuils vocaux remis à zéro, `d.dist` remis
           à 0 en simulation) est destructeur et n'a sa place que sur un vrai changement de
           trajet, jamais sur une lecture d'horaire. */
        function applyRouteResponse(osrmData, statusText) {
            const geojsonRoute = osrmData.routes[0].geometry;
            setRouteLine(geojsonRoute.coordinates);
            currentTurfLine = turf.lineString(geojsonRoute.coordinates);
            fullRouteLine = turf.lineString(geojsonRoute.coordinates);
            const r0 = osrmData.routes[0];
            routeTotalDistKm = r0.legs && r0.legs.length > 1
                ? r0.legs.reduce((s, l) => s + l.distance, 0) / 1000
                : r0.distance / 1000;
            routeTotalDurationHours = r0.legs && r0.legs.length > 1
                ? r0.legs.reduce((s, l) => s + l.duration, 0) / 3600
                : r0.duration / 3600;
            buildRouteSteps(osrmData);
            buildMaxspeedAnnotations(osrmData);
            updateGL3DRoute();
            // Ralentissements du NOUVEAU tracé : ceux de l'ancien ne veulent plus rien dire.
            setRouteCongestion(r0, osrmData.traffic === true);
            /* Le scan de stations ne suit PAS `currentTurfLine` : il lit l'instantané pris
               dans le modal avant le départ, que rien ne réécrivait ici. Sa fenêtre glissante
               courait donc le long de l'ancien tracé après tout changement d'itinéraire.
               Voir notifyRouteChangedForGasScan() (js/18) pour le détail — et pour la raison
               pour laquelle un simple resetGasLiveScan() n'aurait rien réglé. */
            tenterSansBruit(() => notifyRouteChangedForGasScan(osrmData), 'applyRouteResponse/stations');
            // Réinitialiser toutes les annonces vocales pour le nouvel itinéraire
            // sans quoi les seuils déjà "annoncés" de l'ancien trajet bloquent la nouvelle guidance
            announcedThresholds = {};
            currentStepIndex = 0;

            // ── EN SIMULATION : reconstruire l'état mutable et repartir du début de la nouvelle ligne ──
            if (isSimulationMode && simState) {
                const newLine = turf.lineString(geojsonRoute.coordinates);
                const newDistanceKm = routeTotalDistKm;
                const newDurationHours = routeTotalDurationHours;
                simState.line = newLine;
                simState.distanceKm = newDistanceKm;
                simState.totalDurationHours = newDurationHours;
                // Recalculer timeScale : durée sim fixe (~24 unités) mais adaptée à la nouvelle durée
                const newDurationSec = newDurationHours * 3600;
                simState.timeScale = newDurationSec / 24;
                // La nouvelle route part de la position actuelle du véhicule → d.dist repart de 0
                drivers.forEach(d => { if (!d.finished) d.dist = 0; });
            }

            if (statusText) document.getElementById('status').innerText = statusText;
        }

        /* `auto: true` = recalcul déclenché par la détection de déviation, donc réémis à CHAQUE
           frame GPS tant qu'on est hors itinéraire. Seuls ceux-là subissent l'intervalle minimum
           entre tentatives : un recalcul demandé par l'utilisateur (étape ajoutée, destination
           dictée, station choisie) est un geste unique et doit partir tout de suite. */
        async function recalculateRoute(lng, lat, { auto = false } = {}) {
            // En trajet libre, exactEndCoords est null.
            // Si des étapes sont en attente, la "destination effective" est la première étape.
            // Sinon, si toujours pas de destination, rien à recalculer.
            const effectiveEnd = exactEndCoords
                || (navWaypoints.length > 0 ? navWaypoints[0].coords : null);
            if (isRecalculating || !effectiveEnd) return;
            if (!navigator.onLine) {
                console.log('[Offline] Recalcul ignoré — hors ligne, dead reckoning actif');
                return;
            }
            // Le verrou pouvant désormais être relâché par le watchdog avant la fin d'une
            // requête, c'est cet intervalle qui empêche la frame GPS suivante de repartir
            // aussitôt — sans lui, on martèlerait l'API à chaque fix tant qu'on est dévié.
            const _nowRecalc = Date.now();
            if (auto && _nowRecalc - _lastRecalcAttemptMs < RECALC_MIN_INTERVAL_MS) return;
            _lastRecalcAttemptMs = _nowRecalc;
            /* Une proposition encore affichée décrit un embranchement calculé depuis l'ancien
               tracé, que ce recalcul est en train de remplacer : elle est déjà périmée. On la
               retire AVANT la requête plutôt que de laisser le conducteur accepter un trajet
               dont le point de départ n'existe plus. */
            if (_reroutePending) dismissRerouteProposal('recalcul');
            isRecalculating = true;
            const _myGen = ++_recalcGeneration;
            /* Un aller-retour Mapbox peut durer ~29 s dans le pire cas (deux tentatives, chacune
               relancée une fois). Passé ce délai on rend la main : la requête en vol n'est pas
               annulée, elle est simplement déclassée par le jeton de génération. Mieux vaut une
               réponse tardive jetée qu'un conducteur qui suit un tracé faux pendant une minute. */
            if (_recalcWatchdog) clearTimeout(_recalcWatchdog);
            _recalcWatchdog = setTimeout(() => {
                if (_recalcGeneration === _myGen && isRecalculating) {
                    isRecalculating = false;
                    logAppError('recalcul/trop lent', new Error(
                        'aucune réponse Mapbox en ' + RECALC_HARD_DEADLINE_MS + ' ms — verrou relâché'));
                }
            }, RECALC_HARD_DEADLINE_MS);
            document.getElementById('status').innerText = "🔄 Recalcul..."; document.getElementById('status').style.color = "#f39c12";
            try {
                // Étapes restantes : si exactEndCoords existe, tous les navWaypoints sont des étapes intermédiaires.
                // Si exactEndCoords est null (trajet libre), le premier navWaypoint est la destination finale,
                // les suivants sont des étapes intermédiaires vers lui.
                let remainingWpCoords, destination;
                if (exactEndCoords) {
                    remainingWpCoords = navWaypoints.map(w => w.coords);
                    destination = exactEndCoords;
                } else {
                    // Trajet libre avec arrêts : aller au premier, puis aux suivants
                    remainingWpCoords = navWaypoints.slice(1).map(w => w.coords);
                    destination = navWaypoints[0].coords;
                }
                const osrmData = await fetchRouteMapbox([lng, lat], destination, currentAvoidTolls, true, remainingWpCoords);
                /* Réponse déclassée : un recalcul plus récent a démarré pendant l'attente, et il
                   part d'une position plus juste que celle-ci. Écraser `currentTurfLine` avec ce
                   tracé périmé rendrait la ligne affichée dépendante de l'ORDRE D'ARRIVÉE des
                   réponses réseau — exactement le genre de course dont on ne voit jamais la
                   trace après coup. */
                if (_myGen !== _recalcGeneration) {
                    if (DEBUG) console.log('[Recalcul] réponse périmée ignorée (gén.', _myGen, ')');
                    return;
                }
                if (osrmData.code === "Ok") applyRouteResponse(osrmData, "✅ Itinéraire mis à jour !");
            } catch (e) {
                console.error("Erreur de recalcul :", e);
                // On garde l'itinéraire précédent affiché : pas d'interruption de la navigation en cours.
                document.getElementById('status').innerText = "⚠️ Recalcul impossible (réseau) — itinéraire conservé.";
                document.getElementById('status').style.color = "#ff6b6b";
            }
            // Délai raccourci (juste le temps d'afficher le message de statut) : on ne veut pas bloquer
            // un éventuel nouveau recalcul plus longtemps que nécessaire si on est encore hors itinéraire.
            // ⚠ Le relâchement est conditionné à la génération : ce recalcul-ci a pu être déclassé
            // par le watchdog, auquel cas le verrou appartient à une tentative plus récente et
            // n'est pas à nous. Le rendre ici la couperait en plein vol.
            // ⚠ `_recalcWatchdog` est une variable UNIQUE, réécrite à chaque tentative : si nous
            // sommes déclassés, le minuteur qu'elle contient est celui de la tentative en cours,
            // pas le nôtre. L'annuler la priverait de son garde-fou. On sort donc AVANT.
            if (_myGen !== _recalcGeneration) return;
            if (_recalcWatchdog) { clearTimeout(_recalcWatchdog); _recalcWatchdog = null; }
            setTimeout(() => {
                if (_myGen !== _recalcGeneration) return;
                isRecalculating = false;
                if(isCourseStarted) {
                    document.getElementById('status').innerText = isSimulationMode ? "Simulation Salif en cours 🚗" : "Course réelle démarrée ! Déplacez-vous 🚗"; 
                    document.getElementById('status').style.color = isSimulationMode ? "#8e44ad" : "#f39c12";
                }
            }, 1200);
        }

        /* ═══════════════════════════════════════════════════════════════════
           RAFRAÎCHISSEMENT PÉRIODIQUE DE L'ETA EN ROULANT (18/08/2026)
           ═══════════════════════════════════════════════════════════════════
           Le temps restant était FIGÉ au départ. La boucle d'affichage n'en fait qu'une
           proportion — `routeTotalDurationHours × (distance restante / distance totale)` —
           et ces deux totaux ne bougeaient qu'au prix d'un recalcul complet, lui-même
           déclenché seulement par une déviation, un ajout d'étape ou une arrivée à une
           étape. Jamais par une minuterie. Un bouchon apparu APRÈS le départ n'allongeait
           donc jamais l'estimation, ce qui est précisément le cas où elle compte le plus.

           ⚠ POURQUOI CE N'EST PAS UN APPEL À `recalculateRoute()`. C'eût été trois lignes,
           et c'eût été faux : cette fonction-là remplace le tracé affiché, reconstruit les
           steps, remet `announcedThresholds` et `currentStepIndex` à zéro — donc réémet des
           instructions vocales déjà données —, écrit « ✅ Itinéraire mis à jour ! » sur la
           ligne de statut, et en simulation remet `d.dist` à 0, ce qui effacerait la
           distance déjà parcourue du score et de l'historique. Ce sont les effets VOULUS
           d'un vrai recalcul ; aucun n'a sa place dans une simple lecture d'horaire.
           Celle-ci n'écrit donc que deux nombres, et rien d'autre.

           Le couple (distance, durée) est remplacé ENSEMBLE, jamais l'un sans l'autre :
           l'affichage les divise l'un par l'autre. Au moment du rafraîchissement les deux
           décrivent le trajet restant depuis la position courante, le rapport vaut donc 1 et
           l'ETA affichée devient exactement la durée fraîche — puis redécroît normalement à
           mesure qu'on avance. C'est le même ré-ancrage que produit déjà un vrai recalcul. */
        const ETA_REFRESH_MS      = 5 * 60 * 1000;  // une lecture toutes les 5 minutes
        const ETA_REFRESH_MIN_KM  = 1;              // sous 1 km à vol d'oiseau, plus rien à annoncer
        /* Écart de DISTANCE au-delà duquel on considère que Mapbox propose un AUTRE
           itinéraire, et non le nôtre vu sous un trafic différent. Le trafic change les
           durées, pas les longueurs : un écart de distance signe un changement de route.
           Or on continue d'afficher et de suivre l'ancienne — prendre la durée de la
           nouvelle donnerait une ETA qui décrit un trajet que le conducteur ne fait pas.
           Dans ce cas on ne met rien à jour : mieux vaut une estimation vieille de cinq
           minutes mais qui parle du bon trajet.
           ⚠ Ce seuil sert désormais DEUX FOIS, et dans les deux sens : il identifie notre
           itinéraire dans la réponse (`_estNotreItineraire()`), et ce qu'il écarte devient
           le candidat que l'on peut PROPOSER au conducteur — voir le bloc « proposition
           d'itinéraire plus rapide » plus bas. Le refus d'appliquer en silence n'a pas
           changé d'un pouce : rien n'est adopté sans un appui. */
        const ETA_REFRESH_MAX_ECART = 0.25;
        let _etaRefreshAt = 0;
        let _etaRefreshInFlight = false;

        async function refreshEtaFromTraffic(lng, lat) {
            /* Simulation exclue : son ETA vient de `simState`, sur une horloge fictive que le
               trafic réel ne décrit pas. Elle est de toute façon hors de portée ici,
               handleRealMovement ne tournant que sur des fix GPS — la garde reste pour que
               la fonction soit sûre quel que soit l'appelant futur. */
            if (!isCourseStarted || isSimulationMode) return;
            if (!navigator.onLine) return;
            /* ⚠ On ne pose PAS `isRecalculating`, et on s'efface devant lui. Un vrai recalcul
               répond à une déviation : il est urgent et doit toujours pouvoir partir. Ce
               rafraîchissement-ci peut attendre cinq minutes de plus, il ne doit jamais
               occuper le verrou de quelqu'un de plus pressé. */
            if (_etaRefreshInFlight || isRecalculating) return;

            const destination = exactEndCoords
                || (navWaypoints.length > 0 ? navWaypoints[0].coords : null);
            if (!destination) return;

            const now = Date.now();
            if (now - _etaRefreshAt < ETA_REFRESH_MS) return;

            // Distance restante le long du tracé RÉELLEMENT suivi : `currentTurfLine` est
            // rognée au fur et à mesure, sa longueur est donc ce qu'il reste à parcourir.
            let restantKm = 0;
            try {
                if (currentTurfLine) restantKm = turf.length(currentTurfLine, { units: 'kilometers' });
                const volOiseauKm = turf.distance(turf.point([lng, lat]), turf.point(destination),
                                                  { units: 'kilometers' });
                if (volOiseauKm < ETA_REFRESH_MIN_KM) return;
            } catch (e) { return; }

            _etaRefreshAt = now;
            _etaRefreshInFlight = true;
            /* Jeton d'ordre partagé avec `recalculateRoute()` : si un vrai recalcul démarre
               pendant notre attente réseau, c'est LUI qui fait autorité sur le trajet, et
               notre réponse décrit un itinéraire qu'il vient de remplacer. */
            const _gen = _recalcGeneration;
            try {
                const wp = exactEndCoords
                    ? navWaypoints.map(w => w.coords)
                    : navWaypoints.slice(1).map(w => w.coords);
                /* `fastTimeout: false` (15 s) et non le délai court des recalculs. Rien
                   n'attend cette réponse — ni le conducteur, ni la frame GPS — alors qu'un
                   délai de 6 s tomberait souvent sur le repli sans trafic, que l'on refuse
                   juste en dessous : on aurait payé la requête pour ne rien pouvoir en
                   faire. Le seul coût d'une attente longue est une requête en vol, et
                   `_etaRefreshInFlight` interdit déjà qu'elles s'empilent. */
                const data = await fetchRouteMapbox([lng, lat], destination, currentAvoidTolls, false, wp);
                if (_gen !== _recalcGeneration || !isCourseStarted) return;
                /* Repli sans trafic : sa durée est en circulation libre. L'accepter
                   remplacerait une estimation avec trafic par une estimation à vide —
                   un rafraîchissement qui DÉGRADE l'information. On garde l'ancienne. */
                if (data.traffic !== true) return;

                /* ⚠ LA RÉPONSE CONTIENT SOUVENT PLUSIEURS ITINÉRAIRES, et `routes[0]` n'est
                   PAS forcément le nôtre : `fetchRouteMapbox()` demande `alternatives=true`
                   dès qu'il n'y a pas d'étape, et le premier rendu est celui que Mapbox
                   préfère MAINTENANT. Ne regarder que lui faisait jeter toute la réponse dès
                   que le trafic lui faisait changer d'avis — c'est-à-dire exactement quand
                   on avait le plus besoin de rafraîchir. On cherche donc le nôtre dans le
                   lot, et on traite les autres comme des candidats à proposer. */
                const candidats = (data.routes || [])
                    .map(_routeTotaux)
                    .filter(c => c && c.distKm > 0 && c.durH > 0);
                if (!candidats.length) return;

                const notre = restantKm > 0
                    ? candidats.find(c => _estNotreItineraire(c, restantKm))
                    : candidats[0];

                if (notre) {
                    routeTotalDistKm        = notre.distKm;
                    routeTotalDurationHours = notre.durH;
                    /* Les ralentissements profitent du même aller-retour réseau : cette
                       réponse décrit le trajet RESTANT depuis la position courante, sa
                       géométrie se colore donc telle quelle. C'est ce qui donne au tracé
                       une couleur fraîche toutes les 5 minutes sans une requête de plus. */
                    setRouteCongestion(notre.route, true);
                    if (DEBUG) console.log('[ETA] rafraîchie :', (notre.durH * 60).toFixed(0), 'min pour',
                                           notre.distKm.toFixed(1), 'km');
                } else if (DEBUG) {
                    console.log('[ETA] notre itinéraire absent de la réponse — ETA conservée');
                }

                /* Durée de référence pour juger une proposition. Fraîche si Mapbox nous a
                   rendu notre propre itinéraire dans le lot ; sinon la proportion affichée,
                   vieille d'au plus 5 minutes. Ce repli est BIAISÉ DU BON CÔTÉ : si un
                   bouchon vient d'apparaître sur notre route, la valeur ancienne est trop
                   OPTIMISTE, le gain de l'alternative paraît donc plus faible qu'il n'est —
                   on propose moins souvent, jamais à tort. */
                const referenceH = notre ? notre.durH
                    : (routeTotalDistKm > 0 && routeTotalDurationHours > 0 && restantKm > 0
                        ? routeTotalDurationHours * (restantKm / routeTotalDistKm) : 0);
                const autres = candidats.filter(c => c !== notre);
                if (referenceH > 0 && autres.length) {
                    const meilleur = autres.reduce((a, b) => (b.durH < a.durH ? b : a));
                    evaluerPropositionItineraire(meilleur, referenceH, restantKm, lng, lat);
                }
            } catch (e) {
                // Échec réseau : l'ancienne estimation reste affichée, on retentera dans 5 min.
                // Silencieux et non journalisé — c'est une lecture d'agrément, pas une panne.
                if (DEBUG) console.warn('[ETA] rafraîchissement impossible :', e);
            } finally {
                _etaRefreshInFlight = false;
            }
        }

        /* Totaux d'un itinéraire Mapbox. Multi-legs : on SOMME les tronçons, comme partout
           ailleurs dans le fichier — `route.distance` ne couvre pas les étapes intermédiaires. */
        function _routeTotaux(r) {
            const co = r && r.geometry && r.geometry.coordinates;
            if (!co || co.length < 2) return null;
            const multi = r.legs && r.legs.length > 1;
            return {
                route:  r,
                coords: co,
                distKm: multi ? r.legs.reduce((s, l) => s + l.distance, 0) / 1000 : r.distance / 1000,
                durH:   multi ? r.legs.reduce((s, l) => s + l.duration, 0) / 3600 : r.duration / 3600
            };
        }

        /* « Est-ce le trajet que l'on suit, vu sous un trafic différent ? »
           DEUX critères, et il faut les deux :
           1. la LONGUEUR, à `ETA_REFRESH_MAX_ECART` près — le trafic change les durées, pas
              les distances ;
           2. la GÉOMÉTRIE — un itinéraire parallèle de longueur voisine (autoroute et
              nationale suivent souvent la même vallée à quelques centaines de mètres) passe
              le premier critère sans être le nôtre. On échantillonne le tracé candidat et on
              exige que chaque point échantillonné soit à moins de `ROUTE_MATCH_MAX_KM` de la
              ligne suivie. C'est ce second critère qui empêche d'adopter la durée d'une route
              voisine en croyant rafraîchir la nôtre. */
        const ROUTE_MATCH_MAX_KM = 0.2;
        function _estNotreItineraire(c, restantKm) {
            if (Math.abs(c.distKm - restantKm) / restantKm > ETA_REFRESH_MAX_ECART) return false;
            if (!currentTurfLine) return true;   // pas de tracé de référence : la longueur fait foi
            try {
                const pas = Math.max(1, Math.floor(c.coords.length / 24));
                for (let i = 0; i < c.coords.length; i += pas) {
                    const d = turf.pointToLineDistance(turf.point(c.coords[i]), currentTurfLine,
                                                       { units: 'kilometers' });
                    if (d > ROUTE_MATCH_MAX_KM) return false;
                }
                return true;
            } catch (e) { return false; }
        }

        /* ═══════════════════════════════════════════════════════════════════
           PROPOSITION D'ITINÉRAIRE PLUS RAPIDE (18/08/2026)
           ═══════════════════════════════════════════════════════════════════
           Suite directe du rafraîchissement d'ETA ci-dessus, et sa limite assumée jusqu'ici :
           quand Mapbox rendait un AUTRE itinéraire, on le jetait — y compris lorsqu'il était
           franchement meilleur. On ne pouvait pas faire autrement sans mentir : afficher sa
           durée sous l'ancien tracé aurait donné l'heure d'arrivée d'un trajet que le
           conducteur ne fait pas. Il manquait la seule chose qui lève l'ambiguïté : le lui
           DEMANDER. C'est tout l'objet de ce bloc.

           ⚠ RIEN N'EST APPLIQUÉ SANS UN APPUI. Le tracé proposé est dessiné en pointillés
           verts par-dessus l'itinéraire suivi (couche `reroute-preview`, js/03), les deux
           durées sont affichées, et l'app continue de guider sur l'ANCIEN tant que « Suivre »
           n'a pas été pressé. Un changement d'itinéraire silencieux au volant est la pire
           réponse possible : le conducteur regarde la route, pas l'écran.

           TROIS SEUILS, et chacun écarte un cas de proposition nuisible :
           1. GAIN ABSOLU (8 min) — en dessous, le gain est dans le bruit de l'estimation
              elle-même (le trafic bouge, les durées Mapbox aussi) et ne paie pas le coût
              d'une décision à prendre en roulant.
           2. GAIN RELATIF (15 %) — 8 minutes sur un trajet de 6 heures ne justifient pas de
              changer d'itinéraire ; sur 45 minutes, si.
           3. EMBRANCHEMENT À ≥ 1,5 km — c'est le seuil de FAISABILITÉ, et le plus important
              des trois. Proposer une sortie 300 m avant qu'elle se présente, c'est proposer
              soit une manœuvre dangereuse, soit rien du tout. 1,5 km laisse le temps de lire,
              de décider et de se rabattre.

           Une seule proposition à la fois, 60 s à l'écran, puis mise en veille 10 minutes en
           cas de refus : sans cette veille, le même bouchon rouvrirait la même carte à chaque
           rafraîchissement, toutes les 5 minutes, jusqu'à l'arrivée. */
        const REROUTE_GAIN_MIN_MINUTES    = 8;
        const REROUTE_GAIN_MIN_RATIO      = 0.15;
        const REROUTE_FORK_MIN_KM         = 1.5;
        const REROUTE_FORK_ECART_KM       = 0.12;  // au-delà, les deux tracés sont sur des routes distinctes
        const REROUTE_PROMPT_MS           = 60000;
        const REROUTE_SNOOZE_MS           = 10 * 60 * 1000;
        /* Écart maximal toléré ENTRE L'AFFICHAGE ET L'APPUI. Le tracé proposé part de la
           position qu'on avait au moment de la requête ; à 130 km/h, une minute de réflexion
           représente 2 km. Si l'embranchement a été dépassé pendant ce temps, l'adopter
           ferait faire demi-tour. Ce contrôle est refait AU MOMENT DE L'APPUI, pas seulement
           à l'affichage — c'est entre les deux que le monde a bougé. */
        const REROUTE_ACCEPT_MAX_ECART_KM = 0.25;
        let _reroutePending     = null;
        let _rerouteTimer       = null;
        let _rerouteTick        = null;
        let _rerouteSnoozeUntil = 0;

        /* Distance jusqu'à l'embranchement : premier point du tracé proposé qui s'écarte
           franchement de celui qu'on suit. Balayage GROSSIER puis FIN — `pointToLineDistance`
           parcourt toute la ligne de référence à chaque appel, et `currentTurfLine` compte
           volontiers plusieurs milliers de points : un balayage point par point coûterait des
           dizaines de millions de comparaisons dans une frame GPS. */
        function _distanceEmbranchementKm(coords, lng, lat) {
            if (!currentTurfLine) return null;
            try {
                const fin  = Math.min(coords.length, 400);
                const pas  = Math.max(1, Math.floor(fin / 60));
                const loin = i => turf.pointToLineDistance(turf.point(coords[i]), currentTurfLine,
                                                           { units: 'kilometers' }) > REROUTE_FORK_ECART_KM;
                let grossier = -1;
                for (let i = 0; i < fin; i += pas) { if (loin(i)) { grossier = i; break; } }
                if (grossier < 0) return null;   // les deux tracés ne se séparent pas dans la fenêtre
                let precis = grossier;
                for (let i = Math.max(0, grossier - pas + 1); i <= grossier; i++) {
                    if (loin(i)) { precis = i; break; }
                }
                const fourche = coords[Math.max(0, precis - 1)];
                return turf.distance(turf.point([lng, lat]), turf.point(fourche), { units: 'kilometers' });
            } catch (e) { return null; }
        }

        function evaluerPropositionItineraire(candidat, referenceH, restantKm, lng, lat) {
            if (_reroutePending) return;                       // une seule carte à la fois
            if (Date.now() < _rerouteSnoozeUntil) return;      // refus récent : on se tait
            const gainMin = (referenceH - candidat.durH) * 60;
            if (gainMin < REROUTE_GAIN_MIN_MINUTES) return;
            if (gainMin / (referenceH * 60) < REROUTE_GAIN_MIN_RATIO) return;

            const forkKm = _distanceEmbranchementKm(candidat.coords, lng, lat);
            if (forkKm === null || forkKm < REROUTE_FORK_MIN_KM) {
                if (DEBUG) console.log('[Reroute] écarté : embranchement à', forkKm, 'km');
                return;
            }
            afficherPropositionItineraire({
                route:   candidat.route,
                coords:  candidat.coords,
                distKm:  candidat.distKm,
                durH:    candidat.durH,
                gainMin,
                forkKm,
                notreDistKm: restantKm,
                notreDurH:   referenceH,
                expireAt:    Date.now() + REROUTE_PROMPT_MS
            });
        }

        function afficherPropositionItineraire(p) {
            const banner = document.getElementById('reroute-banner');
            if (!banner) return;
            _reroutePending = p;

            document.getElementById('reroute-banner-gain').textContent = `−${Math.round(p.gainMin)} min`;
            document.getElementById('reroute-banner-msg').textContent =
                `${formatTime(p.durH)} au lieu de ${formatTime(p.notreDurH)} · `
                + `${p.distKm.toFixed(0)} km au lieu de ${p.notreDistKm.toFixed(0)} km. `
                + `Bifurcation dans ${p.forkKm.toFixed(1)} km.`;
            banner.classList.add('visible');

            // Le tracé proposé, en pointillés verts par-dessus l'itinéraire suivi.
            tenterSansBruit(() => {
                const src = map.getSource && map.getSource('reroute-preview');
                if (src) src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: p.coords }, properties: {} });
            }, 'reroute/apercu');

            // Proposition de raccourci : confort, pas sécurité. La bannière et son compte
            // à rebours restent visibles en mode moins bavard.
            try { if (typeof playAudioSequence === 'function') playAudioSequence(['attention.ogg'], 0, 'bavard'); }
            catch (e) { logAppError('reroute/alerteSonore', e); }

            clearTimeout(_rerouteTimer);
            clearInterval(_rerouteTick);
            _rerouteTimer = setTimeout(() => dismissRerouteProposal('expiration'), REROUTE_PROMPT_MS);
            const majCompte = () => {
                const el = document.getElementById('reroute-banner-countdown');
                if (!el || !_reroutePending) return;
                const s = Math.max(0, Math.round((_reroutePending.expireAt - Date.now()) / 1000));
                el.textContent = `Sans réponse, la proposition disparaît dans ${s} s`;
            };
            majCompte();
            _rerouteTick = setInterval(majCompte, 1000);
            if (DEBUG) console.log('[Reroute] proposée : gain', p.gainMin.toFixed(0), 'min, embranchement à',
                                   p.forkKm.toFixed(1), 'km');
        }

        /* Redessine le tracé de la proposition après un changement de style de carte, qui
           détruit toutes les sources personnalisées. Appelée par `restoreRouteOverlays()`
           (js/03) ; sans elle, basculer Trafic ou Jour/Nuit pendant qu'une proposition est
           affichée laissait la bannière annoncer une bifurcation que plus rien ne montrait.
           Muette s'il n'y a pas de proposition en cours — c'est le cas le plus fréquent. */
        function redrawReroutePreview() {
            if (!_reroutePending) return;
            const src = map.getSource && map.getSource('reroute-preview');
            if (src) src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: _reroutePending.coords }, properties: {} });
        }

        function acceptRerouteProposal() {
            const p = _reroutePending;
            if (!p) return;
            /* Contrôle de fraîcheur AU MOMENT DE L'APPUI — voir REROUTE_ACCEPT_MAX_ECART_KM.
               Avant l'embranchement les deux tracés se superposent : notre position reste donc
               à quelques mètres du tracé proposé. Une fois la sortie dépassée, elle s'en éloigne
               d'autant qu'on a roulé — c'est exactement ce que cette mesure attrape. */
            let ecartKm = 0;
            try {
                if (lastRealCoords) {
                    ecartKm = turf.pointToLineDistance(turf.point(lastRealCoords),
                                                       turf.lineString(p.coords), { units: 'kilometers' });
                }
            } catch (e) { ecartKm = 0; }
            if (ecartKm > REROUTE_ACCEPT_MAX_ECART_KM) {
                const st = document.getElementById('status');
                if (st) { st.innerText = "⚠️ Embranchement dépassé — itinéraire conservé."; st.style.color = "#ff6b6b"; }
                if (DEBUG) console.log('[Reroute] refusée à l\'appui : écart', ecartKm.toFixed(2), 'km');
                dismissRerouteProposal('trop tard');
                return;
            }

            /* Adoption par le MÊME chemin qu'un recalcul de déviation (steps reconstruits,
               annonces vocales réarmées, tracé remplacé) : c'est bien un changement de trajet,
               pas une lecture d'horaire. `traffic: true` est acquis — la proposition n'a pu
               naître que d'une réponse `driving-traffic`, le repli étant refusé plus haut. */
            applyRouteResponse({ code: "Ok", routes: [p.route], traffic: true }, "✅ Nouvel itinéraire adopté !");
            document.getElementById('status').style.color = "#2ed573";
            /* L'ETA vient d'être ré-ancrée sur une durée fraîche : la prochaine lecture peut
               attendre la fenêtre complète. */
            _etaRefreshAt = Date.now();
            // Confirmation d'une action que l'utilisateur vient de faire, et la bannière
            // change à l'écran : 'bavard'.
            try { if (typeof playAudioSequence === 'function') playAudioSequence(['route_calculate.ogg'], 0, 'bavard'); }
            catch (e) { logAppError('reroute/confirmationSonore', e); }
            dismissRerouteProposal('accepte');
        }

        function dismissRerouteProposal(raison) {
            clearTimeout(_rerouteTimer);  _rerouteTimer = null;
            clearInterval(_rerouteTick);  _rerouteTick  = null;
            document.getElementById('reroute-banner')?.classList.remove('visible');
            tenterSansBruit(() => {
                const src = map.getSource && map.getSource('reroute-preview');
                if (src) src.setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: [] }, properties: {} });
            }, 'reroute/effacementApercu');
            /* Mise en veille sur REFUS et sur EXPIRATION, jamais après une adoption : un
               bouchon qui dure rouvrirait sinon la même carte toutes les 5 minutes. Ne pas
               répondre vaut refus — c'est le cas le plus fréquent au volant, et le silence de
               quelqu'un qui conduit ne doit pas être pris pour une invitation à réessayer. */
            if (raison !== 'accepte') _rerouteSnoozeUntil = Date.now() + REROUTE_SNOOZE_MS;
            if (DEBUG && _reroutePending) console.log('[Reroute] fermée :', raison);
            _reroutePending = null;
        }

        /* ═══════════════════════════════════════════════════════════════════════
           ARRIVÉE DÉCLARÉE PAR LE CONDUCTEUR                        (21/08/2026)
           ═══════════════════════════════════════════════════════════════════════

           « Terminer le trajet » et « je suis arrivé » n'ont jamais été la même chose,
           mais l'app ne savait dire que la première. On partait au n° 20, on trouve une
           place au n° 14 ou au coin de la rue : au-delà des 50 m de `ARRIVAL_AUTO_M`, le
           GPS ne constate rien, et le trajet finissait archivé comme un ABANDON.

           ⚠ CE N'EST PAS UN RACCOURCI POUR GAGNER DES POINTS, et il ne faut pas le
           « sécuriser » comme si c'en était un. Le score s'accumule au mètre parcouru
           (`POINTS_PER_METER`) et `isPerfectRun` ne regarde que `hasSpeeded` et la
           distance — déclarer son arrivée ne crédite donc pas un point de plus, et ne pas
           la déclarer n'en retire aucun. Ce qui change est la NATURE du trajet
           (`genuinelyArrived`), donc le son joué et ce que retient l'historique.

           La borne des 500 m (`ARRIVAL_ASSERT_M`) n'est pas là contre la triche : elle
           empêche une affirmation FAUSSE — déclarer être arrivé depuis l'autre bout de la
           ville archiverait un mensonge sans rien rapporter à personne. */
        function canConfirmArrival() {
            if (!isCourseStarted || drivers.length === 0) return false;
            const d = drivers[0];
            // Arrivée déjà constatée par le GPS : il n'y a plus rien à vérifier, et
            // `exactEndCoords` a justement été mis à null au moment du constat.
            if (d.finished) return true;
            // Trajet libre : aucune destination, donc aucune arrivée à déclarer.
            if (!exactEndCoords) return false;
            /* La position du marqueur prime sur `lastRealCoords` : en simulation, c'est
               elle qui dit où l'on se trouve (même règle que `goToCoords`, js/20).
               `_kmBetween` rend Infinity si un point est invalide — un GPS non fixé ne
               peut donc jamais faire passer ce test par accident. */
            const ici = d.marker
                ? [d.marker.getLngLat().lng, d.marker.getLngLat().lat]
                : normalizeLngLat(lastRealCoords);
            if (!ici) return false;
            return _kmBetween(ici, exactEndCoords) * 1000 <= ARRIVAL_ASSERT_M;
        }

        /* Point d'entrée UNIQUE de la validation d'arrivée — le bouton central (js/08) et
           la bulle 🏁 de la hotbox (js/10) appellent tous les deux celui-ci. Deux chemins
           vers le geste, une seule implémentation : c'est ce qui garantit qu'ils ne
           pourront pas se mettre à diverger. */
        function confirmArrival() {
            if (!canConfirmArrival()) return false;
            /* Poser `finished` AVANT `stopCourse()` est tout le mécanisme : c'est
               exactement ce que lit `genuinelyArrived` (première ligne de stopCourse) pour
               distinguer une arrivée d'un abandon. Rien d'autre n'est à inventer. */
            drivers[0].finished = true;
            stopCourse();
            return true;
        }

        function stopCourse() {
            // Fermer l'overlay objectifs/profil s'il est ouvert
            const _overlayEl = document.getElementById('nav-panel-overlay');
            if (_overlayEl && _overlayEl.classList.contains('open')) {
                _overlayEl.classList.remove('open');
                document.getElementById('nav-panel-overlay-backdrop')?.classList.remove('open');
                _overlayEl.style.display = 'none';
                _navOverlayRestoreContent();
            }
            const genuinelyArrived = drivers.length > 0 && !!drivers[0].finished; // capturé avant d'être écrasé ci-dessous
            /* Trajet libre = course sans itinéraire calculé, la définition de
               `isFreeCourseActive()` (js/09). Capturé ICI, comme le précédent, et pour la
               même raison : `fullRouteLine` est remis à `null` une trentaine de lignes
               plus bas, bien avant qu'on ouvre la fenêtre de fin. */
            const etaitTrajetLibre = !fullRouteLine;
            /* La vie du compagnon est couchée sur le disque ICI, sans attendre le délai
               d'écriture différée de js/24 : la fin du trajet est le moment où l'état
               doit être définitivement acquis, quoi qu'il arrive à l'application ensuite. */
            if (window.VieCompagnon) VieCompagnon.enregistrer();
            isCourseStarted = false; lastKnownBearing = 0; currentVisualBearing = 0;
            // Le compagnon posé sur la barre de vie appartient au trajet : il s'en va avec lui.
            tenterSansBruit(() => masquerPortraitCompagnon(), 'stopCourse/portraitCompagnon');
            // Masquer le toast hors ligne navigation
            const _offlineToast = document.getElementById('offline-nav-toast');
            if (_offlineToast) _offlineToast.classList.remove('visible');
            resetTenMin();
            // Arrêter le live share si actif
            if (liveShareActive) {
                _lsStop();
                const btn = document.getElementById('nav-btn-liveshare');
                if (btn) btn.classList.remove('sharing');
            }
            currentSpeedLimitKmh = null; currentSpeedLimitTs = 0; lastSpeedLimitFetchTime = 0; lastSpeedLimitCoords = null;
            _speedLimitSource = null; _overpassSource = null; _speedLimitDebug = null; hideSpeedLimitDebug();
            resetMaxspeedProbe();
            routeTotalDistKm = 0; routeTotalDurationHours = 0;
            // Le prochain trajet doit pouvoir rafraîchir son ETA sans hériter du compteur
            // de celui-ci : sans cette remise à zéro, deux trajets courts enchaînés se
            // partageraient la même fenêtre de 5 minutes.
            _etaRefreshAt = 0;
            /* Même raison pour la proposition d'itinéraire : une carte encore à l'écran
               porterait sur un trajet terminé, et sa mise en veille punirait le trajet
               suivant d'un refus qui ne le concerne pas. */
            dismissRerouteProposal('fin de course');
            _rerouteSnoozeUntil = 0;
            stopDeadReckoning();
            if (animationFrame) cancelAnimationFrame(animationFrame);
            updateScreenGlow(false, false);
            stopAudio();
            fullRouteLine = null; routeSteps = []; stepArrivalDist = []; currentStepIndex = 0; announcedThresholds = {}; _routeDeviationHandled = false; _maxDistAlongM = null;
            hideNextTurnPanel();
            if (map3DActive) toggle3DMode();
            currentAvoidTolls = false;
            const altBtn = document.getElementById('nav-google-altroute');
            if (altBtn) { altBtn.classList.remove('active'); altBtn.title = "Itinéraire alternatif (éviter les péages)"; }
            updateGoogleEtaBar(0, 0);
            restAreas = []; _restAreasRouteSig = null; nextRestThresholdHours = REST_STOP_INTERVAL_HOURS;
            restStopTracking = { active: false, areaName: null, enteredAt: null, validated: false };
            simFrozenAtRestArea = false; simTestAreaDistKm = null;
            clearRestStopPlan();
            dismissRestStopBanner();
            // Réinitialiser l'état station essence
            gasStopWaypoint = null; gasStationAlertFired = false;
            document.getElementById('gas-station-banner')?.classList.remove('visible');
            // Réinitialiser l'état ZFE
            clearZFEMapLayer(); closeZFEBanner(); _zfeLiveInsideId = null;
            // Réinitialiser les étapes multi-arrêts
            navWaypoints = [];
            simState = null;
            const _wpBadge = document.getElementById('nav-waypoint-badge');
            if (_wpBadge) _wpBadge.classList.remove('visible');
            document.getElementById('nav-eta-box').classList.remove('visible');

            /* ═══ LE BROUILLON DE DESTINATION MEURT AVEC LE TRAJET (18/08/2026) ═══
               `gps_dest_draft` protège une SAISIE EN COURS d'un rechargement (rotation
               Android, veille, retour depuis une autre app). Un trajet terminé n'est plus
               une saisie en cours : la destination a été consommée, elle ne doit plus rien
               rouvrir. Rien ne l'effaçait ici — seuls l'expiration à 6 h, le ✕ du champ
               (`clearDestination`) et l'annulation de la confirmation (`closeTripModal(true)`)
               le faisaient, c'est-à-dire tous les chemins SAUF le plus courant : aller au
               bout de son trajet.
               ⚠ Conséquence, et c'est le symptôme signalé : au lancement suivant dans les
               6 h, `restoreDestinationDraft()` remplissait `#end-addr`, et le garde-fou de
               démarrage (`if (!draftInput.value.trim())`, js/14) sautait alors
               `setPanelSnap('hidden')` — l'app s'ouvrait sur le panneau Itinéraire au lieu
               de la carte. Le panneau n'avait pas « changé tout seul » : il obéissait à une
               exception prévue, déclenchée par un brouillon qui n'aurait pas dû survivre.
               ⚠ NE PAS déplacer cet effacement dans `validateAndLaunchTrip()` : un
               rechargement PENDANT le trajet perdrait alors l'adresse, et il n'existe
               aucune autre reprise de course — c'est ce brouillon qui la rattrape. Ici, le
               trajet est fini, il n'y a plus rien à rattraper. */
            clearDestinationDraft();

            document.getElementById('ui-panel').classList.remove('panel-hidden');
            document.getElementById('ui-panel').style.display = 'flex';
            document.getElementById('info-widget').style.display = 'none';

            const finalScore = drivers.length > 0 ? drivers[0].score : 0;
            const finalDist = drivers.length > 0 ? drivers[0].dist : 0;
            const finalDurationHours = drivers.length > 0 ? drivers[0].timeHours : 0;
            const isPerfectRun = drivers.length > 0 && !drivers[0].hasSpeeded && drivers[0].dist > 0.1;

            /* Lieux du trajet — voir `_tripPlacesMeta` en tête de fichier. Le départ
               vient de l'instantané pris au lancement, la destination de l'état COURANT :
               elle a pu changer en route. Lu ici et pas plus bas : `exactEndCoords` est
               remis à null quelques lignes plus loin (ligne ~1334) et `#end-addr` peut
               être vidé par le retour au panneau Itinéraire.
               ⚠ Nommée `_tripPlaces` et non `_places` : ce dernier est une variable
               GLOBALE de js/20 (les lieux fixes domicile/travail), qu'une locale homonyme
               masquerait ici avec un tout autre sens. */
            const _tripPlaces = tenterSansBruit(() => {
                const meta = _tripPlacesMeta || {};
                const destSaisie = document.getElementById('end-addr')?.value.trim();
                /* ⚠ REPLI DU POINT D'ARRIVÉE SUR LA POSITION FINALE — pour le trajet libre,
                   qui n'a par définition aucune destination : sans lui, un trajet libre
                   n'aurait JAMAIS de point d'arrivée dans l'historique, donc rien à
                   relancer, alors que « ramène-moi d'où je viens » est précisément l'usage.
                   Il n'y a pas d'adresse à archiver ici — un géocodage inverse serait
                   asynchrone, et `stopCourse()` ne peut pas attendre —, seulement un point.
                   La liste affiche alors « Position enregistrée », et le bouton fonctionne.
                   Le marqueur du conducteur prime sur `lastRealCoords` : en simulation,
                   c'est lui qui dit où l'on se trouve (même règle que `goToCoords`). */
                const arriveeReelle = (drivers[0] && drivers[0].marker)
                    ? [drivers[0].marker.getLngLat().lng, drivers[0].marker.getLngLat().lat]
                    : lastRealCoords;
                return {
                    from: meta.from || null,
                    fromCoords: meta.fromCoords || null,
                    to: destSaisie || null,
                    /* La destination saisie prime : un trajet guidé interrompu en chemin
                       doit garder en mémoire OÙ IL ALLAIT, pas où on s'est arrêté. */
                    toCoords: normalizeLngLat(exactEndCoords)
                           || normalizeLngLat(arriveeReelle) || null,
                    /* Un trajet lancé en mode libre reste libre même si une destination a
                       été saisie en route — dans ce cas elle a bien un `to`, et `free` ne
                       sert plus qu'au cas où il n'y en a aucune. */
                    free: !!meta.free && !destSaisie,
                };
            }, 'historique/placesAtStop') || {};

            // Sauvegarder le trajet dans l'historique statistiques — jamais pour une simulation :
            // elle ne roule nulle part, elle n'a rien à archiver comme trajet réel.
            if (!isSimulationMode) {
                saveTripToHistory({
                    distKm: finalDist,
                    score: finalScore,
                    hasSpeeded: drivers.length > 0 ? drivers[0].hasSpeeded : false,
                    durationMin: finalDurationHours * 60,
                    avgSpeedKmh: finalDurationHours > 0 ? finalDist / finalDurationHours : 0,
                    ecoScore:     drivers.length > 0 ? Math.round(drivers[0].ecoScore) : 100,
                    hardBrakings: drivers.length > 0 ? drivers[0].hardBrakings : 0,
                    hardAccels:   drivers.length > 0 ? drivers[0].hardAccels : 0,
                    ..._tripPlaces,
                });
            }
            _tripPlacesMeta = null;
            stopEcoMotionTracking();
            _routeMaxspeedAnnotations = []; // reset pour éviter données périmées au prochain trajet
            document.getElementById('eco-score-bar').classList.remove('visible');
            const _ecoC = document.getElementById('nav-eco-counter'); if(_ecoC) _ecoC.style.display='none';
            // Annuler le mode ping carte si actif
            if (pickingMode === 'nav-pin-stop') {
                pickingMode = null;
                document.getElementById('map').classList.remove('crosshair-cursor');
                document.getElementById('map-pick-hint').classList.remove('visible');
                document.getElementById('nav-btn-pin-stop')?.classList.remove('active-pin');
            }

            /* Le score du trajet est plafonné à 0 : un trajet raté ne rapporte rien, mais
               n'entame jamais le capital déjà acquis.
               ⚠⚠ UN SEUL CHEMIN DE CRÉDIT DEPUIS LE 25/08/2026, et c'est celui-ci. La
               conduite parfaite avait le sien — `onChestClick()`, qui créditait après le
               multiplicateur de butin —, si bien que la branche parfaite ne devait
               surtout PAS créditer ici sous peine de payer le trajet deux fois. Le coffre
               supprimé, l'inverse est devenu vrai : ne pas créditer ici, c'est ne rien
               créditer du tout, et une conduite parfaite serait le seul cas où rouler ne
               rapporte rien. La branche a donc disparu avec le bonus.
               ⚠ EXCLU EN SIMULATION (01/09/2026) : une simulation ne roule pas, elle ne doit
               donc jamais créditer le profil — sans quoi rejouer « Simulation Salif » en
               boucle serait une façon gratuite de gonfler son score. */
            const earned = clampTripScore(finalScore);
            if (!isSimulationMode) addPointsToActiveProfile(earned);
            const statusEl = document.getElementById('status');
            if (isSimulationMode) {
                statusEl.innerText = "Simulation terminée 🚗";
                statusEl.style.color = "#8e44ad";
            } else if (earned > 0) {
                statusEl.innerText = "Trajet terminé 🛑";
                statusEl.style.color = "#ff6b6b";
            } else {
                /* Annoncer un « 0 pt » plutôt qu'un score négatif : le capital est
                   intact, et c'est la seule chose que cette ligne a encore à dire. */
                statusEl.innerText = "Trajet terminé. Aucun point sur ce trajet 🛡️";
                statusEl.style.color = "#f39c12";
            }

            document.getElementById('btn-start').disabled = false; document.getElementById('mode-switch').disabled = false; document.getElementById('btn-free').disabled = false;
            document.getElementById('nav-bottom-bar').classList.remove('visible');
            /* ═══ LA BARRE DE TRAJET PART, LE PANNEAU REDESCEND AVEC ELLE (27/08/2026) ═══
               `setPanelSnap()` (js/08) ancre #ui-panel AU-DESSUS de #nav-bottom-bar par un
               `bottom` INLINE en pixels tant que celle-ci est visible. Rien ne levait cet
               inline en fin de trajet : `stopCourse()` rouvre le panneau (plus haut) mais
               ne repasse jamais par `setPanelSnap()`. Le panneau restait donc suspendu à la
               hauteur de la barre disparue, avec une bande de carte coincée entre lui et la
               barre d'onglets.
               Le symptôme ne se voit qu'en sortie de TRAJET LIBRE, seul cas où le panneau
               Itinéraire est déployé PENDANT la course (c'est de là qu'on met fin au mode
               libre) : ailleurs il est rouvert alors que l'inline n'a jamais été posé.
               Vider l'inline rend la main à la règle CSS `bottom: var(--panel-bottom-offset)`,
               qui colle le panneau à la barre d'onglets. */
            document.getElementById('ui-panel').style.bottom = '';
            document.getElementById('nav-speed-display').classList.remove('visible');
            document.getElementById('nav-speed-display').classList.remove('over-limit');
            const _limitBadge = document.getElementById('speed-limit-badge');
            if (_limitBadge) _limitBadge.classList.remove('visible');
            updateSpeedometer(0, 50, false);

            document.getElementById('nav-side-controls').classList.remove('visible');
            document.body.classList.remove('bottom-bars-active');
            document.body.classList.remove('nav-active');
            const muteBtn     = document.getElementById('nav-btn-mute');
            const recenterNavBtn = document.getElementById('nav-btn-recenter');
            if (muteBtn)        muteBtn.style.display     = 'flex';
            if (recenterNavBtn) recenterNavBtn.style.display = 'none';
            const pinStopBtn  = document.getElementById('nav-btn-pin-stop');
            if (pinStopBtn)   pinStopBtn.style.display    = 'none';

            /* ═══ FENÊTRE DE FIN DE TRAJET — UN SEUL ENDROIT QUI DÉCIDE ═══
               DEUX cas depuis le retrait du coffre à butin (25/08/2026), là où il y en
               avait trois :
                 • arrivé → la fenêtre d'arrivée, qui dit comment va le compagnon ;
                 • abandonné → rien, le retour `#status` suffit. Célébrer une arrivée à
                   quelqu'un qui vient de renoncer serait à contresens, et la conduite
                   parfaite n'a plus de fenêtre à elle : elle n'ouvre donc plus rien.
               ⚠ `isPerfectRun` sert encore, mais plus ici : il alimente l'objectif
               hebdomadaire « km sans excès » (`updateWeeklyGoalsAfterTrip`, deux lignes
               plus bas) et l'historique des trajets. C'est une MISSION, pas un bonus.

               ⚠⚠ ET UN TROISIÈME CAS DEPUIS LE 27/08/2026 : LA FIN D'UN TRAJET LIBRE.
               La vie du compagnon descend aussi quand on roule sans destination, et
               c'est à l'arrivée que se prononce sa mort (voir showArrivalSummary,
               js/12). Sans cette branche, un animal pouvait tomber à 0 % en trajet libre
               sans qu'aucun écran ne le dise, puis « mourir en silence » à la fin du
               trajet guidé suivant — sanction définitive rattachée au mauvais trajet.
               Un trajet libre n'arrive nulle part : `genuinelyArrived` y est faux par
               construction, d'où le second terme plutôt qu'un assouplissement du
               premier. Le titre de la fenêtre s'adapte, le bilan est le même. */
            if(drivers.length > 0) {
                drivers[0].finished = true;
                if (genuinelyArrived || etaitTrajetLibre) {
                    tenterSansBruit(() => showArrivalSummary(etaitTrajetLibre), 'arrivee/summary');
                }
            }
            releaseWakeLock();

            /* Le report des missions de la semaine, APRÈS l'ouverture de la fenêtre de
               fin. L'ordre importait tant qu'une modale de badge pouvait partir d'ici et
               se poser par-dessus (retirée le 27/08/2026) ; il importe encore : cet appel
               écrit le parcours de l'animal, que la fenêtre d'arrivée vient de lire. */
            const vieMinTrajet = drivers.length > 0 && drivers[0].vieMinTrajet !== undefined ? drivers[0].vieMinTrajet : 100;
            /* Exclu en simulation, même raison que le crédit de points plus bas :
               une simulation ne roule pas, ses km ne doivent ni compter dans les
               missions hebdo ni fausser la baseline km/semaine. */
            if (!isSimulationMode) updateWeeklyGoalsAfterTrip(finalDist, finalScore, isPerfectRun, vieMinTrajet);

            map.easeTo({ bearing: 0, duration: 500 });

            // Supprimer les marqueurs départ (🟢) et arrivée (🔴) de la carte
            clearRouteLine();
            if (startTempMarker) { startTempMarker.remove(); startTempMarker = null; }
            if (endTempMarker)   { endTempMarker.remove();   endTempMarker   = null; }
            // Supprimer les marqueurs conducteurs (points bleus)
            drivers.forEach(d => { if (d.marker) { d.marker.remove(); d.marker = null; } });
        }

        function resetSimulation() {
            stopCourse();
            clearRouteLine();
            currentTurfLine = null; isUserPanning = false; showRecenterBtn(false);
            document.getElementById('status').innerText = "GPS actif 🛰️. Choisissez destination puis Lancer."; document.getElementById('status').style.color = "#4da3ff";

            document.getElementById('ui-panel').classList.remove('panel-hidden');
            document.getElementById('ui-panel').style.display = 'flex';
            document.getElementById('info-widget').style.display = 'none';

            drivers.forEach(d => {
                if (d.marker) d.marker.remove();
                d.dist = 0; d.score = 0; d.timeHours = 0; d.actualSpeed = 0; d.speedSmoothed = 0;
                d.isSpeeding = false; d.hasSpeeded = false; d.lastCheckpoint = -1; d.finished = false; d.hardBrakings = 0; d.hardAccels = 0; d.ecoScore = 100;
                /* Pour la mission « X km sans jamais descendre sous 90% de vie » : le
                   plancher part de la vie ACTUELLE du compagnon, pas de 100 — un animal
                   déjà amoché avant le départ ne peut pas valider un trajet censé le
                   préserver. Voir updateWeeklyGoalsAfterTrip (js/12). */
                d.vieMinTrajet = (window.VieCompagnon && VieCompagnon.valeur) ? VieCompagnon.valeur() : 100;
                const _bc=document.getElementById('eco-brake-count'); const _ac=document.getElementById('eco-accel-count'); const _sc=document.getElementById('eco-score-counter'); if(_bc)_bc.textContent='0'; if(_ac)_ac.textContent='0'; if(_sc){_sc.textContent='100';_sc.style.color='#28a745';}
            });
            exactEndCoords = null;
            renderDriversUI();
            if (lastRealCoords) { map.jumpTo({ center: [lastRealCoords[0], lastRealCoords[1]], zoom: 15 }); } 
            else { map.jumpTo({ center: [2.2561, 48.8966], zoom: 15 }); }
        }

        function handleRealMovement(lng, lat, systemSpeed, accuracy) {
            if (!lastRealCoords || drivers.length === 0) return;
            const d = drivers[0];
            /* ARRIVÉ À DESTINATION. Ce `return` sortait sans rien mettre à jour : la
               dernière vitesse mesurée avant l'arrêt restait donc affichée indéfiniment —
               25 km/h au point mort, une fois la voiture garée. Les fix GPS continuent
               pourtant d'arriver, c'est juste que plus personne ne les lisait.
               On remet le compteur à zéro comme le fait déjà la branche « immobile »
               plus bas, puis on sort : le trajet est fini, rien d'autre n'a à être
               recalculé. */
            if (d.finished) {
                if (d.actualSpeed !== 0) {
                    d.actualSpeed = 0;
                    d.speedSmoothed = 0;
                    d.isSpeeding = false;
                    setText(`speed-${d.id}`, '0');
                    const navVal = document.getElementById('nav-speed-value');
                    if (navVal) navVal.innerText = '0';
                    document.getElementById('nav-speed-display')?.classList.remove('over-limit');
                    document.getElementById('speed-limit-badge')?.classList.remove('visible');
                    updateSpeedometer(0, currentSpeedLimitKmh || 50, false);
                    updateScreenGlow(false, false, 0);
                }
                return;
            }
            // Signal perdu (tunnel) : les positions reçues sont des replis réseau figés.
            // Les traiter comme un déplacement réel remettrait la vitesse à 0 et déclencherait
            // un recalcul d'itinéraire parasite. Le dead reckoning fait autorité.
            if (gpsSignalLost) return;
            const to = turf.point([lng, lat]);

            checkVoiceGuidanceReal(lng, lat);
            checkRestStopReal(d, lng, lat);
            checkZFELive(lng, lat);
            checkZFEApproach(d.dist, d.actualSpeed);
            checkPauseDetection(d, lng, lat, systemSpeed ? systemSpeed * 3.6 : 0);
            // Détection d'arrivée aux étapes intermédiaires (fonctionne aussi en trajet libre)
            checkNavWaypointArrival();

            // Destination effective : soit la destination guidée, soit le premier arrêt en trajet libre
            const _effDestForTracking = exactEndCoords || (navWaypoints.length > 0 ? navWaypoints[0].coords : null);
            if (currentTurfLine && _effDestForTracking) {
                const nearestPt = turf.nearestPointOnLine(currentTurfLine, to, { units: 'kilometers' });
                const distToRoute = nearestPt.properties.dist * 1000;

                let bearingMismatch = false;
                const routeCoords = currentTurfLine.geometry.coordinates;
                const idx = nearestPt.properties.index;
                if (typeof idx === 'number' && idx < routeCoords.length - 1) {
                    const routeBearing = turf.bearing(turf.point(routeCoords[idx]), turf.point(routeCoords[idx + 1]));
                    let diff = Math.abs(lastKnownBearing - routeBearing);
                    if (diff > 180) diff = 360 - diff;
                    // Seuil abaissé à 35° : un virage manqué donne 70-90° d'écart, on réagit plus tôt
                    bearingMismatch = diff > 35;
                }

                /* ── Troisième signal : la PROGRESSION QUI RECULE ──
                   `nearestPointOnLine` fournit aussi `location`, la distance parcourue le
                   long du tracé. Quand on dépasse un virage sans le prendre, la projection
                   quitte le coude et redescend sur le segment d'approche : cette valeur
                   DIMINUE. C'est ce qui se voyait à l'écran sous la forme d'une distance
                   au prochain virage qui remonte — 65 m, puis 95, puis 153 — pendant que
                   l'application continuait tranquillement de guider sur l'ancien trajet.
                   Le signal est indépendant de la distance perpendiculaire, et c'est ce
                   qui le rend utile : les deux autres seuils échouent quand l'itinéraire
                   repasse à proximité (rue parallèle, tracé qui revient sur lui-même), où
                   `distToRoute` reste faible alors qu'on ne le suit plus du tout.
                   La garde `distToRoute > 8` évite le faux positif du rond-point ou de
                   l'aller-retour, où la projection peut sauter en arrière alors qu'on est
                   bel et bien SUR la route. */
                const distAlongM = (nearestPt.properties.location || 0) * 1000;
                if (_maxDistAlongM === null || distAlongM > _maxDistAlongM) _maxDistAlongM = distAlongM;
                const reculM = _maxDistAlongM - distAlongM;
                const progressionPerdue = reculM > 35 && distToRoute > 8;

                // Seuils abaissés pour réagir plus vite en ville (30 km/h = 8.3 m/s) :
                // - 15m : déviation franche → recalcul immédiat
                // - 8m + bearingMismatch : virage clairement manqué même si pas encore loin
                // - progression qui recule : virage dépassé, quelle que soit la distance
                let shouldRecalculate = distToRoute > 15 || (distToRoute > 8 && bearingMismatch) || progressionPerdue;

                /* ── FENÊTRE DE GRÂCE APRÈS UN RETOUR DE SIGNAL ──
                   Les premières secondes qui suivent une sortie de tunnel sont les moins
                   fiables du trajet : la puce reconverge, et la position atterrit couramment
                   sur la chaussée d'à côté — relevé en conduite avenue Charles-de-Gaulle,
                   voie parallèle. Recalculer là-dessus, c'est demander un itinéraire DEPUIS
                   une position fausse : Mapbox répond alors par un trajet qui repart en
                   arrière, et la ligne blanche reste dans le dos du conducteur jusqu'à ce que
                   la situation se démêle d'elle-même.
                   On laisse donc la position se rasseoir avant de conclure quoi que ce soit.
                   Aucun risque de manquer une vraie déviation : si elle est réelle, elle sera
                   toujours là dans six secondes, et les trois signaux la verront alors sur des
                   coordonnées propres. */
                if (shouldRecalculate && _gpsRecoveredAt &&
                    (Date.now() - _gpsRecoveredAt) < GPS_RECOVERY_GRACE_MS) {
                    if (DEBUG) console.log('[Recalcul] différé : position encore en reconvergence');
                    shouldRecalculate = false;
                    // La progression de référence est repartie de zéro avec la ligne rognée du
                    // dead reckoning : on la laisse se reconstruire sur des fix propres.
                    _maxDistAlongM = null;
                }

                if (shouldRecalculate) {
                    // Ne faire ceci qu'une fois par épisode de déviation : sinon, tant que le
                    // recalcul Mapbox est en cours (ou échoue), chaque frame GPS suivante
                    // effaçait à nouveau le seuil déjà annoncé et checkVoiceGuidanceReal (appelé
                    // en tête de fonction) le rejouait aussitôt → instruction vocale en boucle.
                    if (!_routeDeviationHandled) {
                        _routeDeviationHandled = true;
                        // Couper la voix immédiatement pour ne pas répéter l'ancienne instruction
                        // pendant les ~2s que prend le recalcul Mapbox
                        if (typeof stopAudio === 'function') stopAudio();
                        // Invalider les annonces vocales déjà jouées pour le step courant
                        // (elles seront recalculées sur le nouvel itinéraire)
                        Object.keys(announcedThresholds).forEach(k => {
                            if (k.startsWith(currentStepIndex + '_')) {
                                delete announcedThresholds[k];
                            }
                        });
                    }
                    recalculateRoute(lng, lat, { auto: true });
                } else {
                    _routeDeviationHandled = false;
                }
            }

            /* Lecture d'horaire périodique — voir refreshEtaFromTraffic(). Appelée sans
               condition : toutes les gardes (course en cours, en ligne, destination,
               intervalle de 5 min, recalcul déjà en vol) sont DANS la fonction, un seul
               endroit où lire la règle plutôt que deux qui divergeront. `await` volontairement
               absent : la frame GPS ne doit pas attendre le réseau. */
            refreshEtaFromTraffic(lng, lat);
            /* Rognage des ralentissements déjà dépassés. Ici et non dans la boucle rAF :
               un filtre de calque suffit, et il est throttlé à 2 s dans la fonction. */
            updateRouteCongestionProgress(lng, lat);

            const from = turf.point(lastRealCoords);
            const distanceMovedKm = turf.distance(from, to, {units: 'kilometers'});
            const distanceMovedMeters = distanceMovedKm * 1000;
            if (distanceMovedMeters < 1) {
                // On n'a pas bougé d'au moins 1m → on est à l'arrêt (feu rouge, embouteillage, stationnement).
                // On met la vitesse à 0 et on met à jour l'affichage AVANT de quitter, sinon la dernière
                // vitesse non-nulle (ex: 30 km/h juste avant le feu) resterait figée à l'écran.
                /* ⚠ L'HORLOGE DOIT AVANCER MÊME IMMOBILE (17/08/2026). Ce `return` sortait sans
                   toucher à `lastRealTimestamp`, laissé à la dernière frame en MOUVEMENT. Au
                   redémarrage, le `dt` couvrait donc tout l'arrêt, et le clamp physique plus bas
                   — dont toute l'utilité est de refuser un saut de position — devenait inopérant
                   au moment précis où il servait. Le cas type est le tunnel : la position s'y fige
                   sans que la précision s'effondre (repli réseau), l'app passe donc ici à chaque
                   fix pendant toute la traversée, puis reçoit d'un coup un saut de 25 m à la
                   sortie. Rapporté à un `dt` de 40 s, c'est anodin ; rapporté au vrai `dt` d'une
                   seconde, c'est 90 km/h — la valeur relevée à l'écran en conduite.
                   Le temps d'arrêt est reporté dans `timeHours` ici même : il fait partie de la
                   durée du trajet, et la branche normale ne le comptera plus. */
                if (lastRealTimestamp) {
                    if (!d.finished) d.timeHours += (Date.now() - lastRealTimestamp) / 3600000;
                    lastRealTimestamp = Date.now();
                }
                d.actualSpeed = 0;
                d.speedSmoothed = 0;
                d.isSpeeding = false;
                setText(`speed-${d.id}`, '0');
                if (d.id === drivers[0].id) {
                    document.getElementById('nav-speed-value').innerText = '0';
                    document.getElementById('nav-speed-display').classList.remove('over-limit');
                    const _lb = document.getElementById('speed-limit-badge');
                    if (_lb) _lb.classList.remove('visible');
                    // Limite réelle et non 50 en dur : cette branche RÉAFFICHE la pastille que
                    // les lignes juste au-dessus viennent de masquer, et l'affichait donc à 50
                    // à chaque arrêt, quelle que soit la limite du tronçon.
                    updateSpeedometer(0, currentSpeedLimitKmh || 50, false);
                    updateScreenGlow(false, true, 0);
                }
                return; 
            }

            // --- Détection d'une coupure GPS (tunnel, parking couvert, canyon urbain...) ---
            // Après plusieurs secondes sans signal, la puce GPS peut renvoyer une vitesse
            // instantanée aberrante/gonflée à la reprise. On calcule alors la vitesse MOYENNE
            // réelle (distance/temps) sur toute la coupure, bien plus fiable que la mesure brute,
            // et on n'applique aucune pénalité de vitesse sur cette distance : on ne peut pas savoir
            // avec certitude ce qui s'est passé pendant la coupure, le bénéfice du doute est appliqué.
            const gapSeconds = lastRealTimestamp ? (Date.now() - lastRealTimestamp) / 1000 : 0;
            const isGpsGapRecovery = gapSeconds > 5;

            let speedKmh;
            if (isGpsGapRecovery) {
                const timeDiffHours = gapSeconds / 3600;
                speedKmh = timeDiffHours > 0 ? (distanceMovedKm / timeDiffHours) : 0;
                d.speedSmoothed = speedKmh; // repart d'une base saine, sans hériter d'un ancien pic
            } else {
                speedKmh = systemSpeed ? (systemSpeed * 3.6) : 0;
                if (!systemSpeed && lastRealTimestamp) {
                    const timeDiffHours = gapSeconds / 3600;
                    if (timeDiffHours > 0) speedKmh = distanceMovedKm / timeDiffHours;
                }
            }

            /* ── CLAMP PHYSIQUE : UNE VOITURE NE SAUTE PAS ──
               Dernier filet avant l'affichage, et le seul qui ne suppose rien sur l'origine de
               la mesure. Tout ce qui précède fait confiance à la source : `systemSpeed` vient
               de la puce (Doppler), le repli vient de distance/temps. Or les deux mentent au
               même moment — à la reconvergence après un tunnel, la puce publie une vitesse
               aberrante, et la position corrige son erreur d'un bond, ce qui donne une vitesse
               calculée tout aussi fausse. Un bond de 25 m en une seconde, c'est 90 km/h affichés
               alors que la voiture roule à 50.
               On raisonne donc en ACCÉLÉRATION, seule grandeur bornée par la physique du
               véhicule : au-delà, la mesure décrit le capteur et non la route, et on refuse de
               la suivre plus vite que ce qu'une voiture peut faire.
               Les deux bornes sont volontairement dissymétriques : une décélération d'urgence
               (~8 m/s²) est bien plus brutale que la meilleure accélération. Elles restent
               larges — 15 km/h/s dépasse le 0-100 en 7 s — pour ne jamais brider une conduite
               réelle : ce filtre n'est pas là pour lisser, il est là pour dire non à l'absurde.
               ⚠ Le clamp se règle sur le `dt` réel : à l'arrêt prolongé puis redémarrage, `dt`
               est grand et la borne s'ouvre d'autant. C'est ce qui impose la correction de
               `lastRealTimestamp` dans la branche « immobile » plus haut — sans elle, `dt`
               valait la durée du tunnel entier et la borne ne bornait plus rien. */
            const MAX_ACCEL_KMH_PER_S = 15;   // ~4,2 m/s²
            const MAX_DECEL_KMH_PER_S = 35;   // ~9,7 m/s², freinage d'urgence
            if (typeof d.speedSmoothed === 'number' && !isGpsGapRecovery) {
                const dtSec = Math.max(gapSeconds, 0.2);
                const plafond = d.speedSmoothed + MAX_ACCEL_KMH_PER_S * dtSec;
                const plancher = Math.max(0, d.speedSmoothed - MAX_DECEL_KMH_PER_S * dtSec);
                if (speedKmh > plafond) {
                    if (DEBUG) console.warn(`[Vitesse] saut refusé : ${speedKmh.toFixed(0)} → ${plafond.toFixed(0)} km/h en ${dtSec.toFixed(1)}s`);
                    speedKmh = plafond;
                } else if (speedKmh < plancher) {
                    speedKmh = plancher;
                }
            }

            // --- Anti-bruit GPS à l'arrêt ---
            // Le capteur de vitesse (mesure Doppler) peut afficher quelques km/h même complètement
            // à l'arrêt (feu rouge, devant un portail...), surtout quand la précision de position
            // est dégradée (bâtiments proches, zone urbaine dense). On lisse la valeur dans le temps
            // et on applique un palier bas : sous ce seuil, on considère que c'est du bruit et on
            // affiche 0. Le seuil est plus élevé si la précision GPS est mauvaise (peu fiable).
            if (typeof d.speedSmoothed !== 'number') d.speedSmoothed = speedKmh;
            if (!isGpsGapRecovery) d.speedSmoothed = d.speedSmoothed * 0.65 + speedKmh * 0.35;
            speedKmh = d.speedSmoothed;
            const isLowAccuracy = accuracy && accuracy > 20;
            const noiseFloor = isLowAccuracy ? 8 : 3;
            if (speedKmh < noiseFloor) speedKmh = 0;

            if (lastRealTimestamp) {
                const dtHours = gapSeconds / 3600;
                if (!d.finished) { d.timeHours += dtHours; }
            }
            lastRealTimestamp = Date.now();
            d.dist += distanceMovedKm;
            d.actualSpeed = speedKmh;

            // Limite de vitesse : Mapbox annotations en priorité (précises, sans latence réseau),
            // Overpass en rafraîchissement asynchrone, fallback contextuel en dernier recours.
            maybeRefreshSpeedLimit(lng, lat);
            maybeRefreshLocalMaxspeedProbe(lng, lat);
            const _distAlong = getRouteDistanceAlongKm(lng, lat);
            const mapboxLimit = (_distAlong !== null) ? getMapboxSpeedLimitAtDist(_distAlong) : null;
            // Sonde locale : même donnée Mapbox, obtenue hors itinéraire. Consultée uniquement
            // si l'itinéraire courant n'annote pas ce point (trajet libre, tronçon non couvert).
            const probeLimit = mapboxLimit ? null : getProbeSpeedLimitAt(lng, lat);
            let limitKmh = mapboxLimit || probeLimit || currentSpeedLimitKmh;
            // Provenance de la valeur finalement retenue. Recalculée à chaque frame : une
            // valeur Mapbox qui disparaît (sortie de tronçon annoté) doit rendre la main à
            // la source Overpass, et non laisser croire qu'on est toujours sur du fiable.
            /* ⚠ TROIS NUANCES AJOUTÉES APRÈS L'ESSAI AUTOROUTE DU 31/08/2026 — elles ne
               changent PAS la limite affichée, seulement la confiance qu'on lui accorde,
               donc le droit de pénaliser (voir UNCERTAIN_SPEED_SOURCES dans js/05) :
               - une valeur Mapbox EMPRUNTÉE à un segment voisin (bretelle d'entrée dont le
                 50 déborde sur les premiers mètres d'autoroute) n'est plus donnée pour du
                 relevé sur place ;
               - une valeur Overpass PÉRIMÉE (plus de 20 s sans confirmation, cas courant en
                 4G sur voie rapide) cesse de faire autorité ;
               - le reste est inchangé. */
            if (mapboxLimit) _speedLimitSource = _mapboxLimitWasBorrowed ? 'mapbox-neighbour' : 'mapbox';
            else if (probeLimit) _speedLimitSource = 'mapbox-probe';
            else if (currentSpeedLimitKmh) {
                _speedLimitSource = isSpeedLimitStale() ? 'stale' : (_overpassSource || 'overpass-inference');
            }
            else _speedLimitSource = null;
            // Repli n°3 : inférence depuis la vitesse moyenne des steps Mapbox (distance/durée),
            // la même fonction que celle utilisée par le mode simulation — où elle donne de bons
            // résultats. Instantanée et sans réseau, donc utile quand Overpass n'a pas répondu.
            // Réserve : le profil "driving-traffic" inclut le trafic réel, donc l'estimation est
            // biaisée VERS LE BAS dans les embouteillages. On ne l'utilise qu'en dernier recours,
            // avant le repli aveugle, et jamais pour écraser une valeur Mapbox ou Overpass.
            if (!limitKmh && routeSteps.length > 0 && _distAlong !== null) {
                limitKmh = getStepSpeedLimitAtDist(_distAlong * 1000);
                if (limitKmh) _speedLimitSource = 'steps';
            }
            if (!limitKmh) {
                limitKmh = isInsideParis(lng, lat) ? 30 : 50;
                _speedLimitSource = 'fallback';
            }
            // Si Mapbox donne une valeur, on met à jour currentSpeedLimitKmh pour cohérence
            // (et sa provenance avec, sinon une valeur Mapbox mise en cache serait plus tard
            // réattribuée à Overpass et jugée incertaine à tort).
            if (mapboxLimit) {
                currentSpeedLimitKmh = mapboxLimit;
                currentSpeedLimitTs = Date.now();
                /* Une valeur empruntée au voisinage est mise en cache comme telle : sans
                   cette nuance, le 50 de la bretelle repartait plus tard sous l'étiquette
                   'mapbox' — la plus fiable de toutes — et redevenait pénalisable. */
                _overpassSource = _mapboxLimitWasBorrowed ? 'mapbox-neighbour' : 'mapbox';
            }
            /* ⚠ `limit-<id>` N'EXISTE PLUS depuis le retrait de la ligne « Limite / points »
               de la carte conducteur (22/08/2026, js/14). Ce `.innerText` était le SEUL des
               quatre sites d'écriture à ne pas tester l'existence de l'élément : laissé tel
               quel, il levait une TypeError à chaque point GPS, en plein milieu de
               `handleRealMovement()` — donc toute la navigation réelle figée. `setText()`
               rend false et ne touche à rien quand l'id est absent. La limite reste affichée
               par `updateSpeedLimitBadge()` juste en dessous, qui est le vrai rendu. */
            setText(`limit-${d.id}`, Math.round(limitKmh) + " km/h");
            if (d.id === drivers[0].id) {
                updateSpeedLimitBadge(limitKmh);
            }

            /* ⚠ LE MULTIPLICATEUR DES QUINZE PREMIERS KILOMÈTRES A ÉTÉ RETIRÉ
               (25/08/2026). Il existait pour un jeu où l'on CUMULAIT des points d'une
               semaine sur l'autre : gonfler les premiers kilomètres récompensait le
               trajet quotidien contre les longues routes. Le classement compte
               désormais des animaux sauvés, et la vie du compagnon se gagne au mètre,
               sans prime de début : un kilomètre bien conduit en vaut un autre, où
               qu'il tombe dans le trajet. Le compteur « MULTIPLICATEUR » de
               #nav-bottom-bar est parti avec, il n'avait plus rien à afficher. */

            // === SYSTÈME MARGE + GRÂCE ===
            // 1. Détecter un changement de limite (baisse) et lancer la grâce si besoin
            if (d.id === drivers[0].id) maybeStartGrace(limitKmh);

            const hardLimit = limitKmh * SPEED_TOLERANCE_FACTOR; // +5% marge radar → seuil rouge
            const grace     = d.id === drivers[0].id && isGraceActive(d.actualSpeed, limitKmh);

            // aboveHard : dépasse la marge radar → dépassement considéré volontaire
            // aboveSoft : au-dessus de la limite stricte mais dans la marge → avertissement orange
            const aboveHard = !isGpsGapRecovery && d.actualSpeed > hardLimit && !isSpeedLimitUncertain();
            const aboveSoft = !isGpsGapRecovery && d.actualSpeed > limitKmh  && !isSpeedLimitUncertain();

            if (aboveHard && !grace) {
                // Dépassement volontaire (> limite +5%) : pénalité immédiate
                d.isSpeeding = true;
                d.hasSpeeded = true;
                d.score -= (distanceMovedMeters * PENALTY_PER_METER);
                triggerPenaltyAnimation(d.id);
                /* La vie du compagnon suit le score au mètre près : mêmes conditions,
                   même distance. Réservée au conducteur réel (drivers[0]) — les autres
                   sont des adversaires simulés, ils n'ont pas d'animal à user. */
                if (d.id === drivers[0].id && window.VieCompagnon) {
                    VieCompagnon.avancer(distanceMovedMeters, { enExces: true, vitesse: d.actualSpeed, limite: limitKmh });
                    d.vieMinTrajet = Math.min(d.vieMinTrajet, VieCompagnon.valeur());
                }
            } else {
                d.isSpeeding = false;
                /* ⚠ AUCUN BONUS SUR UNE COUPURE GPS RECONSTITUÉE — faille corrigée le 18/08/2026.
                   `isGpsGapRecovery` force déjà `aboveHard`/`aboveSoft` à faux : bénéfice du doute,
                   on ne peut pas savoir si la distance franchie pendant la coupure était une survitesse.
                   Mais ce `else` était alors le SEUL chemin restant, et il accordait le bonus complet
                   sur la distance — bénéfice du doute détourné en source de points gratuits. Un trajet
                   laissé démarré pendant que le téléphone se met en veille (train, avion, GPS coupé
                   volontairement) reprend au réveil avec `lastRealCoords` resté sur la position
                   d'avant la coupure : le bond est traité comme une coupure GPS ordinaire et
                   créditait la distance entière au tarif plein — 600 km Paris→sud ≈ 610 pts observés,
                   sans un mètre de conduite. La distance parcourue reste comptabilisée (d.dist, stats,
                   ETA) : c'est le POINT gratuit qu'on retire, pas le trajet lui-même. */
                if (!isGpsGapRecovery) {
                    d.score += (distanceMovedMeters * POINTS_PER_METER);
                    /* Même garde que pour les points, et pour la même raison : une
                       coupure GPS reconstituée soignerait gratuitement le compagnon
                       sur toute la distance sautée. Le bénéfice du doute ne pénalise
                       pas — il ne doit pas récompenser non plus. */
                    if (d.id === drivers[0].id && window.VieCompagnon) {
                        VieCompagnon.avancer(distanceMovedMeters, { enExces: false });
                        d.vieMinTrajet = Math.min(d.vieMinTrajet, VieCompagnon.valeur());
                    }
                }
                document.getElementById(`driver-card-${d.id}`).classList.remove('speeding');
            }
            // Orange : dans la marge des 5% (avertissement) OU grâce active après baisse de panneau
            const isWarning = !d.isSpeeding && (aboveSoft || grace);
            if (d.id === drivers[0].id) updateScreenGlow(d.isSpeeding, true, d.actualSpeed, isWarning);

            let remainingDistKm = 0;
            let remainingTimeHours = 0;
            // En trajet libre avec arrêts, la destination effective est le premier navWaypoint
            const effectiveDest = exactEndCoords || (navWaypoints.length > 0 ? navWaypoints[0].coords : null);
            if (effectiveDest) {
                if (currentTurfLine) {
                    const destPoint = turf.point(effectiveDest);
                    try {
                        const snapped = turf.nearestPointOnLine(currentTurfLine, to);
                        const snappedCoords = snapped.geometry.coordinates;
                        const sliced = turf.lineSlice(snapped, destPoint, currentTurfLine);
                        remainingDistKm = turf.length(sliced, {units: 'kilometers'});
                        if (sliced.geometry.coordinates.length >= 2) {
                            const trimmedCoords = sliced.geometry.coordinates.slice();
                            trimmedCoords[0] = snappedCoords;
                            setRouteLine(trimmedCoords);
                            currentTurfLine = sliced;
                        }
                    } catch(e) { remainingDistKm = turf.distance(to, turf.point(effectiveDest), {units: 'kilometers'}) * 1.2; }
                } else {
                    remainingDistKm = turf.distance(to, turf.point(effectiveDest), {units: 'kilometers'}) * 1.2;
                }
                let speedForETA = d.actualSpeed > 5 ? d.actualSpeed : 30;
                if (routeTotalDistKm > 0 && routeTotalDurationHours > 0) {
                    const progressRatio = Math.max(0, Math.min(1, remainingDistKm / routeTotalDistKm));
                    remainingTimeHours = routeTotalDurationHours * progressRatio;
                } else {
                    remainingTimeHours = remainingDistKm / speedForETA;
                }
                setText(`dist-left-${d.id}`, remainingDistKm.toFixed(2) + " km");
                setText(`eta-${d.id}`, formatTime(remainingTimeHours));
            }

            if (effectiveDest) {
                const dest = turf.point(effectiveDest);
                const distToDestination = turf.distance(to, dest, {units: 'kilometers'}) * 1000;
                /* ⚠ RIEN NE S'AFFICHE À L'APPROCHE, et c'est délibéré. Un bouton central
                   « Je suis arrivé » a été piloté ici quelques heures le 21/08/2026, dès
                   500 m de la destination : il proposait de couper le guidage à quelqu'un
                   qui roule encore et en a toujours besoin. Un trajet ne se termine que
                   lorsqu'on est ARRIVÉ à l'adresse — c'est-à-dire au bloc ci-dessous, ou
                   par le geste délibéré de la bulle 🏁 de la hotbox. */
                if (distToDestination <= ARRIVAL_AUTO_M) {
                    setText(`dist-left-${d.id}`, "0.00 km");
                    setText(`eta-${d.id}`, "Arrivé");
                    // Si c'est un navWaypoint (trajet libre), checkNavWaypointArrival s'en charge
                    // Si c'est exactEndCoords (trajet guidé), on signale l'arrivée finale
                    if (exactEndCoords) {
                        document.getElementById('status').innerText = "Vous êtes arrivé ! Recherche de place... 🅿️ (Terminer Trajet)";
                        document.getElementById('status').style.color = "#28a745";
                        clearRouteLine();
                        currentTurfLine = null; exactEndCoords = null; d.finished = true;
                        if (animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = null; }
                        hideNextTurnPanel();
                        /* ═══ LA FENÊTRE D'ARRIVÉE S'OUVRE D'ELLE-MÊME (21/08/2026) ═══
                           Le bouton central restait à attendre un appui alors que tout était
                           déjà joué : le tracé est effacé, l'animation arrêtée, `finished`
                           posé — le trajet EST fini à cet instant, le score n'évolue plus.
                           Faire réclamer un appui pour l'annoncer n'ajoutait qu'une étape.
                           Le bouton central garde tout son rôle en amont, dans la zone de
                           déclaration (« Je suis arrivé », jusqu'à 500 m) : c'est là qu'un
                           appui décide vraiment de quelque chose.

                           ⚠ DIFFÉRÉ, ET NON APPELÉ TEL QUEL. `confirmArrival()` enchaîne sur
                           `stopCourse()`, qui retire les marqueurs des conducteurs
                           (`d.marker = null`) — or on est ICI au milieu de
                           `handleRealMovement()`, qui continue de lire `d` après ce bloc.
                           L'appeler en direct détruirait l'objet sous les pieds de la
                           fonction qui l'utilise encore. Le délai laisse en prime voir une
                           demi-seconde la carte à l'arrivée avant que la fenêtre ne la
                           couvre. */
                        setTimeout(() => tenterSansBruit(confirmArrival, 'arrivee/auto'), 600);
                    }
                    // Si trajet libre avec arrêt : checkNavWaypointArrival gère la suite (shift + recalc)
                }
            }

            let currentAvgSpeed = d.timeHours > 0 ? (d.dist / d.timeHours) : 0;
            setText(`dist-${d.id}`, d.dist.toFixed(2) + " km");
            setText(`time-${d.id}`, formatTime(d.timeHours));
            setText(`speed-${d.id}`, Math.round(d.actualSpeed));
            setText(`avg-speed-${d.id}`, Math.round(currentAvgSpeed) + " km/h");
            const ptsEl = document.getElementById(`pts-${d.id}`);
            if (ptsEl) {
                // Affichage plafonné à 0 : le score interne reste négatif (il pilote la
                // couleur d'alerte et la granularité de récupération), mais l'utilisateur
                // ne voit jamais un total négatif qui laisserait croire à une dette.
                ptsEl.innerText = Math.max(0, d.score).toFixed(3);
                ptsEl.style.color = d.score < 0 ? '#ff6b6b' : '#4da3ff';
            }

            if (d.id === drivers[0].id) {
                const displayPoints = Math.max(0, d.score).toFixed(0);
                /* `remainingTimeHours` vaut 0 en trajet libre (aucune destination d'où
                   tirer une arrivée) : `heureArrivee()` rend alors l'heure courante, ce
                   qui serait faux. On n'affiche donc que s'il reste vraiment du chemin. */
                setText('nav-arrivee', remainingTimeHours > 0
                    ? (heureArrivee(remainingTimeHours, Date.now()) || '--')
                    : '--');

                if (DOM.navSpeedValue)   DOM.navSpeedValue.innerText = Math.round(d.actualSpeed);
                if (DOM.navSpeedDisplay) DOM.navSpeedDisplay.classList.toggle('over-limit', !!d.isSpeeding);
                updateSpeedometer(d.actualSpeed, limitKmh, !!d.isSpeeding);

                /* ═══ LE WIDGET REPLIÉ NE SE MET PAS À JOUR       (31/08/2026) ═══
                   Les quatre lignes du widget « Info trajet » étaient réécrites à chaque
                   point GPS, volet ouvert ou non — quatre `getElementById` et quatre
                   écritures DOM par seconde pour un panneau que personne ne regarde. Il
                   est replié par défaut (`#info-widget.open` gouverne son affichage), et
                   `openInfoWidget()` (js/08) rejoue le rendu à l'ouverture… mais pas les
                   valeurs : d'où le rafraîchissement immédiat à l'ouverture, ci-dessous.
                   ⚠ CE QUI SORT DE LA GARDE Y RESTE : `updateGoogleEtaBar` et
                   `checkTenMinAlert` ne sont PAS de l'affichage de widget — la première
                   alimente le bandeau permanent du bas, la seconde déclenche l'alerte des
                   dix minutes. Les enfermer ici les aurait rendues muettes tant que le
                   widget est replié, c'est-à-dire presque toujours. */
                /* Dernières valeurs connues, mémorisées même widget replié : c'est ce que
                   `rafraichirInfoWidget()` (plus bas) écrira à l'ouverture, sans attendre
                   le point GPS suivant. Une affectation d'objet par point GPS, contre
                   quatre écritures DOM économisées. */
                _infoDerniere = {
                    guide: !!(exactEndCoords || navWaypoints.length > 0),
                    distKm: remainingDistKm, tempsH: remainingTimeHours,
                    parcouruKm: d.dist, ecouleH: d.timeHours, points: displayPoints
                };
                const _infoOuvert = !!DOM.infoWidget && DOM.infoWidget.classList.contains('open');
                if (exactEndCoords || navWaypoints.length > 0) {
                    if (_infoOuvert) {
                        setText('info-label-1', "🏁 Dist. restante:");
                        setText('info-label-2', "⏳ Temps restant:");
                        setText('info-dist-left', remainingDistKm.toFixed(2) + " km");
                        setText('info-eta', formatTime(remainingTimeHours));
                        setText('info-points', displayPoints + " pts");
                    }
                    if (DOM.navEtaBox) DOM.navEtaBox.classList.add('visible');
                    if (DOM.navEta)    DOM.navEta.innerText = formatTime(remainingTimeHours);
                    updateGoogleEtaBar(remainingDistKm, remainingTimeHours);
                    if (exactEndCoords) checkTenMinAlert(remainingTimeHours);
                } else {
                    if (_infoOuvert) {
                        setText('info-label-1', "• Distance parcourue:");
                        setText('info-label-2', "⏱️ Temps écoulé:");
                        setText('info-dist-left', d.dist.toFixed(2) + " km");
                        setText('info-eta', formatTime(d.timeHours));
                        setText('info-points', displayPoints + " pts");
                    }
                    if (DOM.navEtaBox) DOM.navEtaBox.classList.remove('visible');
                }
            }
        }

        /* Le widget « Info trajet » n'est plus rafraîchi tant qu'il est replié (voir la
           garde dans handleRealMovement). Il faut donc le peindre au moment où on l'ouvre,
           à partir des dernières valeurs relevées. Sans données encore (avant le premier
           point GPS), on ne touche à rien : le balisage porte déjà des tirets. */
        let _infoDerniere = null;
        function rafraichirInfoWidget() {
            const v = _infoDerniere;
            if (!v) return;
            if (v.guide) {
                setText('info-label-1', "🏁 Dist. restante:");
                setText('info-label-2', "⏳ Temps restant:");
                setText('info-dist-left', v.distKm.toFixed(2) + " km");
                setText('info-eta', formatTime(v.tempsH));
            } else {
                setText('info-label-1', "• Distance parcourue:");
                setText('info-label-2', "⏱️ Temps écoulé:");
                setText('info-dist-left', v.parcouruKm.toFixed(2) + " km");
                setText('info-eta', formatTime(v.ecouleH));
            }
            setText('info-points', v.points + " pts");
        }

        function startFreeCourse() {
            const statusBox = document.getElementById('status');
            const btnStart = document.getElementById('btn-start');
            const modeSwitch = document.getElementById('mode-switch');
            const btnFree = document.getElementById('btn-free');

            if (drivers.length === 0) return statusBox.innerText = "Ajoutez au moins un conducteur.";
            if (!lastRealCoords) return statusBox.innerText = "En attente du signal GPS...";

            btnStart.disabled = true; modeSwitch.disabled = true; btnFree.disabled = true;

            document.getElementById('ui-panel').style.display = 'none';
            document.getElementById('info-widget').style.display = 'block';
            document.getElementById('info-widget').classList.remove('open');

            clearRouteLine();
            if (animationFrame) cancelAnimationFrame(animationFrame);
            updateScreenGlow(false, false);
            fullRouteLine = null; routeSteps = []; stepArrivalDist = []; currentStepIndex = 0; announcedThresholds = {}; _routeDeviationHandled = false; _maxDistAlongM = null;
            hideNextTurnPanel();

            currentTurfLine = null; exactEndCoords = null; currentVisualBearing = 0;
            // Trajet libre : le départ est la position courante, il n'y a pas d'itinéraire
            // calculé d'où tirer un point d'origine.
            _beginTripPlaces(true, lastRealCoords);
            drivers.forEach(d => {
                if (d.marker) d.marker.remove();
                d.dist = 0; d.score = 0; d.timeHours = 0; d.actualSpeed = 0; d.speedSmoothed = 0;
                d.isSpeeding = false; d.hasSpeeded = false; d.lastCheckpoint = -1; d.finished = false; d.hardBrakings = 0; d.hardAccels = 0; d.ecoScore = 100;
                d.vieMinTrajet = (window.VieCompagnon && VieCompagnon.valeur) ? VieCompagnon.valeur() : 100;
                const _bc=document.getElementById('eco-brake-count'); const _ac=document.getElementById('eco-accel-count'); const _sc=document.getElementById('eco-score-counter'); if(_bc)_bc.textContent='0'; if(_ac)_ac.textContent='0'; if(_sc){_sc.textContent='100';_sc.style.color='#28a745';}

                d.marker = addDriverMarker(lastRealCoords[0], lastRealCoords[1], d.color);
                const distEl = document.getElementById(`dist-left-${d.id}`);
                const etaEl = document.getElementById(`eta-${d.id}`);
                if (distEl) distEl.innerText = "--"; if (etaEl) etaEl.innerText = "--";
            });

            isSimulationMode = false; isCourseStarted = true; lastRealTimestamp = Date.now();
            startDeadReckoning();
            startEcoMotionTracking();
            document.getElementById('eco-score-bar').classList.add('visible');
            if (ecoCounterEnabled) { const c = document.getElementById('nav-eco-counter'); if(c) c.style.display='flex'; }
            statusBox.innerText = "Trajet libre en cours ! Roulez pour marquer des points 🧭"; statusBox.style.color = "#20c997";

            document.getElementById('nav-arrivee').innerText = "--";
            document.getElementById('nav-bottom-bar').classList.add('visible');
            /* Le portrait du compagnon est peint à l'ouverture de la barre : sinon il
               resterait vide jusqu'au premier CHANGEMENT d'état physique, seul signal qui
               appelle rafraichirMarqueurCompagnon() — donc tout un trajet sans animal si
               la conduite est bonne, exactement le cas où l'on veut le voir intact. */
            tenterSansBruit(() => rafraichirPortraitNav(), 'navBar/portraitCompagnon');
            /* ⚠ ON NE REMET PAS LA VIE À 100 %. `monter()` affiche la valeur COURANTE du
               compagnon, celle où le trajet précédent l'a laissé — c'est la décision du
               24/08/2026 (js/22, A_VENIR). Un simple rendu, jamais une réinitialisation. */
            if (window.VieCompagnon) VieCompagnon.monter();
            document.getElementById('nav-speed-display').classList.add('visible');

            document.getElementById('nav-side-controls').classList.add('visible');
            document.getElementById('nav-btn-pin-stop').style.display = 'none'; // Masqué en trajet libre : l'ajout d'arrêt n'est possible qu'en trajet avec destination
            /* Partage de position live (📡) masqué en trajet libre, en attendant que la
               fonctionnalité soit finalisée — FIREBASE_DB_URL est encore un placeholder.
               Seul l'affichage du bouton est neutralisé : toggleLiveShare() et toute la
               mécanique restent en place, il suffira de repasser à 'flex' pour la rouvrir. */
            document.getElementById('nav-btn-liveshare').style.display = 'none';
            document.getElementById('nav-btn-mute').style.display = 'flex';
            document.body.classList.add('bottom-bars-active');

            document.getElementById('info-label-1').innerText = "• Distance parcourue:";
            document.getElementById('info-label-2').innerText = "⏱️ Temps écoulé:";
            document.getElementById('info-dist-left').innerText = "0.00 km";
            document.getElementById('info-eta').innerText = formatTime(0);
            document.getElementById('info-points').innerText = "0 pts";
            document.getElementById('nav-eta-box').classList.remove('visible');

            requestWakeLock();
        }

        async function startCourse(mode, precomputedRoute) {
            const statusBox = document.getElementById('status');
            const btnStart = document.getElementById('btn-start');
            const modeSwitch = document.getElementById('mode-switch');
            document.getElementById('info-label-1').innerText = "🏁 Dist. restante:";
            document.getElementById('info-label-2').innerText = "⏳ Temps restant:";
            document.body.classList.add('nav-active');
            /* La consultation d'une destination détache la caméra du GPS. Au départ du
               trajet, le suivi doit impérativement reprendre quelle que soit la porte
               d'entrée (modal, trajet libre, reprise hors ligne). */
            isUserPanning = false;
            if (userPanningResumeTimer) { clearTimeout(userPanningResumeTimer); userPanningResumeTimer = null; }
            showRecenterBtn(false);
            initTenMinForTrip(); // initialiser la feature 10min pour ce trajet

            if (!precomputedRoute) return statusBox.innerText = "Veuillez d'abord calculer l'itinéraire.";
            if (drivers.length === 0) return statusBox.innerText = "Ajoutez au moins un conducteur.";

            // ── Sauvegarder la route en cache hors ligne ──
            saveRouteOfflineCache(precomputedRoute);

            currentAvoidTolls = !!precomputedRoute.avoidTolls;

            btnStart.disabled = true; modeSwitch.disabled = true; document.getElementById('btn-free').disabled = true;
            
            document.getElementById('ui-panel').style.display = 'none';
            document.getElementById('info-widget').style.display = 'block';
            document.getElementById('info-widget').classList.remove('open');

            statusBox.style.color = "#ff6b6b"; statusBox.innerText = "Préparation de l'itinéraire...";

            clearRouteLine();
            /* ⚠ LE POINT VERT DE DÉPART EST UN MARQUEUR D'APERÇU — il ne survit pas au
               lancement (31/08/2026). Posé par le calcul d'itinéraire (js/16) pour montrer
               d'où part le tracé, il n'était retiré qu'à `stopCourse()` ou à l'annulation
               de l'aperçu : pendant tout le trajet, un rond vert restait planté à l'adresse
               de départ, à des kilomètres derrière, sans plus rien vouloir dire — et à
               deux pas du point bleu du conducteur au moment du démarrage, où les deux se
               confondent. Le marqueur rouge d'arrivée reste, LUI : il désigne un point
               qu'on n'a pas encore atteint. */
            if (startTempMarker) { startTempMarker.remove(); startTempMarker = null; }
            if (animationFrame) cancelAnimationFrame(animationFrame);
            currentTurfLine = null; updateScreenGlow(false, false);
            currentVisualBearing = 0;
            
            drivers.forEach(d => {
                if (d.marker) d.marker.remove();
                d.dist = 0; d.score = 0; d.timeHours = 0; d.actualSpeed = 0; d.speedSmoothed = 0;
                d.isSpeeding = false; d.hasSpeeded = false; d.lastCheckpoint = -1; d.finished = false; d.hardBrakings = 0; d.hardAccels = 0; d.ecoScore = 100;
                d.vieMinTrajet = (window.VieCompagnon && VieCompagnon.valeur) ? VieCompagnon.valeur() : 100;
                const _bc=document.getElementById('eco-brake-count'); const _ac=document.getElementById('eco-accel-count'); const _sc=document.getElementById('eco-score-counter'); if(_bc)_bc.textContent='0'; if(_ac)_ac.textContent='0'; if(_sc){_sc.textContent='100';_sc.style.color='#28a745';}

                d.marker = new mapboxgl.Marker({ element: createPulseMarkerEl(d.color), anchor: 'center' }).setLngLat([0, 0]);
            });

            try {
                const startCoords = precomputedRoute.startCoords;
                const endCoords = precomputedRoute.endCoords;
                const osrmData = precomputedRoute.osrmData;
                exactEndCoords = endCoords;
                _beginTripPlaces(false, startCoords);

                const geojsonRoute = osrmData.routes[0].geometry;
                // Sommer les legs pour distance et durée (route avec waypoint station = 2 legs)
                const route0 = osrmData.routes[0];
                const distanceKm = route0.legs && route0.legs.length > 1
                    ? route0.legs.reduce((s, l) => s + l.distance, 0) / 1000
                    : route0.distance / 1000;
                const totalDurationHours = route0.legs && route0.legs.length > 1
                    ? route0.legs.reduce((s, l) => s + l.duration, 0) / 3600
                    : route0.duration / 3600;
                const avgSpeedKmh = distanceKm / totalDurationHours;
                routeTotalDistKm = distanceKm;
                routeTotalDurationHours = totalDurationHours;

                setRouteLine(geojsonRoute.coordinates);
                currentTurfLine = turf.lineString(geojsonRoute.coordinates);
                fullRouteLine = turf.lineString(geojsonRoute.coordinates);
                // Ralentissements dès le départ. Muet sur une reprise du cache hors ligne
                // (pas de champ `traffic`) : la couleur reviendra au premier rafraîchissement.
                setRouteCongestion(route0, osrmData.traffic === true);
                buildRouteSteps(osrmData);
                buildMaxspeedAnnotations(osrmData);
                updateGL3DRoute();

                nextRestThresholdHours = REST_STOP_INTERVAL_HOURS;
                restStopTracking = { active: false, areaName: null, enteredAt: null, validated: false };
                simFrozenAtRestArea = false; simTestAreaDistKm = null;
                restStopProposed = false;
                dismissRestStopBanner();
                /* ⚠ NE PAS vider `restAreas` ici. L'aperçu vient de les relever pour ce même
                   tracé (js/16) ; les jeter forcerait un second appel Overpass — 4 à 10 s et
                   des pictos qui disparaissent puis reviennent sous les yeux au moment du
                   départ. La signature de tracé (js/09) décide : tracé identique ⇒ on
                   réutilise, tracé différent ⇒ elle refait le relevé elle-même.
                   Le `else` reste nécessaire : sous le seuil, aucun appel n'a lieu et des
                   aires relevées pour un trajet précédent survivraient à la course suivante. */
                if (totalDurationHours > REST_STOP_INTERVAL_HOURS) {
                    fetchRestAreasAlongRoute(totalDurationHours);
                } else {
                    restAreas = []; _restAreasRouteSig = null; clearRestStopPlan();
                }

                if (!isUserPanning) {
                    map.resize();
                    const bounds = getRouteBounds();
                    // Règle commune à tout cadrage (CLAUDE.md, interdit n°4) : padding
                    // caméra à zéro — il s'ADDITIONNE à celui passé ici — et vue à plat.
                    // Ce cadrage-ci était jusqu'ici la seule exception, au motif qu'il est
                    // gardé par `!isUserPanning` ; la garde protège de la boucle de suivi,
                    // pas du padding qu'elle a déjà inscrit sur la caméra.
                    tenterSansBruit(() => map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 }),
                                    'startCourse/resetPadding');
                    if (bounds) map.fitBounds(bounds, { padding: 40, animate: false, bearing: 0, pitch: 0 });
                }
                drivers.forEach(d => { d.marker.setLngLat(startCoords).addTo(map); });

                document.getElementById('nav-arrivee').innerText = "--";
                document.getElementById('nav-bottom-bar').classList.add('visible');
            /* Le portrait du compagnon est peint à l'ouverture de la barre : sinon il
               resterait vide jusqu'au premier CHANGEMENT d'état physique, seul signal qui
               appelle rafraichirMarqueurCompagnon() — donc tout un trajet sans animal si
               la conduite est bonne, exactement le cas où l'on veut le voir intact. */
            tenterSansBruit(() => rafraichirPortraitNav(), 'navBar/portraitCompagnon');
                // Voir startFreeCourse() : on affiche la vie en cours, on ne la refait pas.
                if (window.VieCompagnon) VieCompagnon.monter();
                document.getElementById('nav-speed-display').classList.add('visible');

                document.getElementById('nav-side-controls').classList.add('visible');
                document.getElementById('nav-btn-pin-stop').style.display = 'flex'; // Visible en trajet avec destination
                // Contrepartie du masquage fait dans startFreeCourse : sans ce rétablissement,
                // le bouton resterait caché pour tous les trajets suivants de la session.
                document.getElementById('nav-btn-liveshare').style.display = 'flex';
                document.getElementById('nav-btn-mute').style.display = 'flex';
                document.body.classList.add('bottom-bars-active');

                if (mode === 'real') {
                    isSimulationMode = false; isCourseStarted = true; lastRealTimestamp = Date.now();
                    startDeadReckoning();
                    startEcoMotionTracking();
                    updateNavWaypointBadge();
                    document.getElementById('eco-score-bar').classList.add('visible');
                    if (ecoCounterEnabled) { const c = document.getElementById('nav-eco-counter'); if(c) c.style.display='flex'; }
                    statusBox.innerText = "Course réelle démarrée ! Déplacez-vous 🚗"; statusBox.style.color = "#f39c12";
                    await requestWakeLock(); showSafetyReminder(); return;
                }

                isSimulationMode = true; isCourseStarted = true;
                updateNavWaypointBadge();
                document.getElementById('eco-score-bar').classList.add('visible');
                if (ecoCounterEnabled) { const c = document.getElementById('nav-eco-counter'); if(c) c.style.display='flex'; }
                statusBox.innerText = "Simulation Salif en cours 🚗"; statusBox.style.color = "#8e44ad";
                await requestWakeLock();

                const line = turf.lineString(geojsonRoute.coordinates);
                // Durée totale en secondes (sommer les legs si waypoint station)
                const totalDurationSec = route0.legs && route0.legs.length > 1
                    ? route0.legs.reduce((s, l) => s + l.duration, 0)
                    : route0.duration;
                const timeScale = totalDurationSec / 24;
                let lastTimestamp = null;

                // Initialiser l'état mutable de simulation (mis à jour par recalculateRoute si on ajoute un arrêt)
                simState = {
                    line: line,
                    distanceKm: distanceKm,
                    totalDurationHours: totalDurationHours,
                    timeScale: timeScale
                };

                function animate(timestamp) {
                    if (!isCourseStarted) return; 
                    if (!lastTimestamp) lastTimestamp = timestamp;
                    const dt = timestamp - lastTimestamp; 
                    lastTimestamp = timestamp;
                    const dtHours = (dt / 3600000) * simState.timeScale; 

                    drivers.forEach(d => {
                      // ⚠ Garde-fou : sans ce try/catch, une seule erreur (ex. un id
                      // absent) remontait hors du forEach et empêchait le
                      // requestAnimationFrame final → toute la navigation se figeait
                      // silencieusement. On loggue et on continue.
                      try {
                        if (d.finished) return; 
                        d.timeHours += dtHours;
                        const prevDist = d.dist; 

                        /* ═══ LA SIMULATION LIT LES MÊMES LIMITES QUE LA ROUTE  (01/09/2026) ═══
                           Avant : la simulation déduisait la limite de la vitesse moyenne des
                           steps Mapbox — un chemin que la conduite réelle n'emprunte qu'en
                           TROISIÈME repli (après l'annotation d'itinéraire et Overpass). La
                           cascade où se logent les vrais défauts n'était donc jamais exercée
                           en simulation : le panneau anormalement gris du 31/08 ne pouvait pas
                           s'y reproduire, il a fallu prendre la voiture pour le voir.
                           Désormais on interroge d'abord `_routeMaxspeedAnnotations`, la table
                           construite au démarrage du trajet depuis la réponse Directions. Elle
                           ne coûte aucun réseau — c'est ce qui la rend utilisable ici, là où
                           Overpass reste exclu (la simulation avance ~50× plus vite que le
                           temps réel, aucune réponse n'arriverait à temps).

                           ⚠ CONSÉQUENCE ASSUMÉE : `limitKmh` pilote AUSSI la vitesse du véhicule
                           simulé. Les trajets de test ne durent plus tout à fait ce qu'ils
                           duraient — ils durent ce que dureraient les vrais, ce qui est le but.

                           ⚠ `_speedLimitSource` N'EST ÉCRITE QUE POUR LE CONDUCTEUR PRINCIPAL.
                           Elle est globale et la pastille n'affiche que lui ; la renseigner pour
                           chaque conducteur de la boucle ferait gagner le dernier itéré, et la
                           provenance affichée décrirait la route d'un autre véhicule. */
                        let limitKmh = getMapboxSpeedLimitAtDist(d.dist);
                        const _limitSource = limitKmh ? (_mapboxLimitWasBorrowed ? 'mapbox-neighbour' : 'mapbox') : 'steps';
                        if (!limitKmh) limitKmh = getStepSpeedLimitAtDist(d.dist * 1000);
                        if (d.id === drivers[0].id) _speedLimitSource = _limitSource;

                        const checkpoint = Math.floor(d.dist / 0.5);
                        if (checkpoint > d.lastCheckpoint) {
                            d.lastCheckpoint = checkpoint;
                            if (d.behavior === 'bad') {
                                let chanceToSpeed = d.badLevel === 1 ? 0.20 : (d.badLevel === 2 ? 0.50 : 0.80);
                                if (Math.random() < chanceToSpeed) {
                                    d.isSpeeding = true;
                                    d.hasSpeeded = true;
                                    d.speedOffset = 10 + (Math.random() * 15); 
                                    triggerPenaltyAnimation(d.id);
                                } else {
                                    d.isSpeeding = false; d.speedOffset = 0;
                                    setClass(`driver-card-${d.id}`, 'speeding', false);
                                }
                            } else { d.isSpeeding = false; d.speedOffset = 0; }

                            // Simulation d'événements éco (freinages/accélérations brusques)
                            // Probabilité selon comportement : bon=5%, bad1=15%, bad2=35%, bad3=60%
                            if (d.id === drivers[0].id) {
                                const ecoChance = d.behavior === 'good' ? 0.05
                                    : d.badLevel === 1 ? 0.15
                                    : d.badLevel === 2 ? 0.35 : 0.60;
                                if (Math.random() < ecoChance) {
                                    const isBrake = Math.random() < 0.55; // légèrement plus de freinages
                                    const fakeMagnitude = (isBrake ? ECO_THRESHOLD_BRAKE : ECO_THRESHOLD_ACCEL)
                                        + Math.random() * 2.5;
                                    if (isBrake) d.hardBrakings++;
                                    else d.hardAccels++;
                                    _applyEcoPenalty(d, isBrake ? 'brake' : 'accel', fakeMagnitude);
                                    if (ecoCounterEnabled) _showEcoAlert(isBrake ? '🛑 Freinage brusque (sim)' : '⚡ Accélération brusque (sim)', fakeMagnitude);
                                }
                            }
                        }

                        // Bon conducteur : roule à 10 km/h sous la limite réelle du tronçon.
                        // Mauvais conducteur : peut dépasser la limite de 10-25 km/h (comportement existant).
                        const targetSpeed = d.isSpeeding
                            ? limitKmh + d.speedOffset
                            : Math.max(20, limitKmh - 10);
                        if (d.actualSpeed === 0) d.actualSpeed = targetSpeed;
                        d.actualSpeed += (targetSpeed - d.actualSpeed) * 0.1;

                        /* Cible du gel de test : la PREMIÈRE ZONE DU PLAN quand il y en a un,
                           et non plus la première aire trouvée sur le trajet. Les deux
                           divergent presque toujours — `restAreas[0]` peut se situer à vingt
                           minutes du départ, bien avant le seuil des 1h50 : la simu s'y
                           arrêtait donc avant même que la bannière n'ait eu lieu d'être. */
                        if (d.id === drivers[0].id && testPauseSimEnabled && simTestAreaDistKm === null && fullRouteLine) {
                            const cible = restStopPlan.length > 0 ? restStopPlan[0] : restAreas[0];
                            if (cible) {
                                try {
                                    const snapped = turf.nearestPointOnLine(fullRouteLine, turf.point([cible.lng, cible.lat]), { units: 'kilometers' });
                                    simTestAreaDistKm = snapped.properties.location;
                                } catch (e) { simTestAreaDistKm = -1; }
                            }
                        }

                        if (d.dist < simState.distanceKm) d.dist += d.actualSpeed * dtHours;

                        if (d.id === drivers[0].id && testPauseSimEnabled && simTestAreaDistKm !== null && simTestAreaDistKm >= 0 && !restStopTracking.validated) {
                            if (d.dist >= simTestAreaDistKm) {
                                d.dist = simTestAreaDistKm;
                                d.actualSpeed = 0;
                                simFrozenAtRestArea = true;
                            }
                        }

                        if (d.dist >= simState.distanceKm && currentTurfLine) {
                            d.dist = simState.distanceKm;
                            setText(`dist-left-${d.id}`, "0.00 km");
                            setText(`eta-${d.id}`, "Arrivé");
                            setText('status', "Arrivé ! Simulation continue... 🅿️ (Terminer Trajet)");
                            setStyleProp('status', 'color', "#28a745");
                            setClass(`driver-card-${d.id}`, 'speeding', false);
                            clearRouteLine();
                            currentTurfLine = null; exactEndCoords = null;
                            d.finished = true;
                            if (animationFrame) { cancelAnimationFrame(animationFrame); animationFrame = null; }
                            if (d.id === drivers[0].id) {
                                hideNextTurnPanel();
                                /* Même ouverture automatique qu'en GPS réel — voir le
                                   commentaire détaillé dans `handleRealMovement()`. Les deux
                                   détections d'arrivée doivent se comporter pareil, sans
                                   quoi la simulation cesserait de valider ce que fait
                                   l'appareil. Différé pour la même raison : `stopCourse()`
                                   retire les marqueurs, et on est ici dans la boucle qui
                                   les utilise. */
                                setTimeout(() => tenterSansBruit(confirmArrival, 'arrivee/autoSim'), 600);
                            }
                        }

                        if (d.id === drivers[0].id && !d.finished) processVoiceGuidanceByDistance(d.dist * 1000);
                        if (d.id === drivers[0].id && !d.finished) checkRestStopSuggestion(d, d.dist);
                        if (d.id === drivers[0].id && !d.finished && gasStopWaypoint) {
                            const _remDist = Math.max(0, simState.distanceKm - d.dist);
                            const remainH = _remDist > 0 && d.actualSpeed > 0
                                ? _remDist / d.actualSpeed
                                : 0;
                            checkGasStationApproach(remainH);
                        }
                        if (d.id === drivers[0].id && !d.finished) checkZFEApproach(d.dist, d.actualSpeed);

                        // Plus de multiplicateur de début de trajet : voir handleRealMovement().
                        const deltaDistMeters = (d.dist - prevDist) * 1000;
                        if (d.isSpeeding) d.score -= (deltaDistMeters * PENALTY_PER_METER);
                        else d.score += (deltaDistMeters * POINTS_PER_METER);
                        /* La simulation doit user le compagnon comme le ferait la route,
                           sans quoi elle cesserait de valider ce que fait l'appareil —
                           c'est la même règle que pour la détection d'arrivée. */
                        if (d.id === drivers[0].id && window.VieCompagnon) {
                            VieCompagnon.avancer(deltaDistMeters, { enExces: !!d.isSpeeding, vitesse: d.actualSpeed, limite: limitKmh });
                            d.vieMinTrajet = Math.min(d.vieMinTrajet, VieCompagnon.valeur());
                        }

                        if (d.id === drivers[0].id) updateScreenGlow(d.isSpeeding, true, d.actualSpeed, false); // simulation : pas de grâce

                        const currentPoint = turf.along(simState.line, d.dist, {units: 'kilometers'});
                        const nextPoint = turf.along(simState.line, d.dist + 0.01, {units: 'kilometers'});
                        const bearing = turf.bearing(currentPoint, nextPoint);

                        if (d.id === drivers[0].id && d.dist < simState.distanceKm) {
                            // ⚠ lineSlice parcourt TOUTE la géométrie du trajet (des milliers
                            // de points sur un long parcours) et setData renvoie le tableau
                            // complet à Mapbox. À 60 fps c'était le poste CPU n°1 pour un
                            // gain visuel nul : on rafraîchit le tracé 4 fois par seconde.
                            if (!animate._lastTrim || timestamp - animate._lastTrim > 250) {
                                animate._lastTrim = timestamp;
                                try {
                                    const endPt = turf.along(simState.line, simState.distanceKm, {units: 'kilometers'});
                                    const remaining = turf.lineSlice(currentPoint, endPt, simState.line);
                                    if (remaining.geometry.coordinates.length >= 2) {
                                        const trimmedCoords = remaining.geometry.coordinates.slice();
                                        trimmedCoords[0] = currentPoint.geometry.coordinates;
                                        setRouteLine(trimmedCoords);
                                    }
                                } catch(e) {
                                    if (DEBUG) console.warn('[animate] découpe du tracé restant impossible :', e);
                                }
                            }
                        }
                        
                        const curLat = currentPoint.geometry.coordinates[1];
                        const curLng = currentPoint.geometry.coordinates[0];
                        d.marker.setLngLat([curLng, curLat]);
                        // Détection d'arrivée aux étapes intermédiaires (après mise à jour position marqueur)
                        if (d.id === drivers[0].id && !d.finished) checkNavWaypointArrival();

                        if (d.id === drivers[0].id && testPauseSimEnabled && simFrozenAtRestArea) {
                            checkPauseDetection(d, curLng, curLat, 0, TEST_PAUSE_SECONDS / 60);
                            if (restStopTracking.validated) { simFrozenAtRestArea = false; }
                        }
                        
                        if (!isUserPanning) updateDynamicZoom(d.actualSpeed, curLat, curLng, bearing);
                        if (d.id === drivers[0].id) syncGL3DMap(curLat, curLng, bearing);

                        let currentAvgSpeed = d.timeHours > 0 ? (d.dist / d.timeHours) : 0;
                        let remainingDistKm = 0;
                        let remainingTimeHours = 0;

                        /* ═══ LES CHIFFRES NE SE RÉÉCRIVENT PAS 60 FOIS PAR SECONDE ═══
                           (31/08/2026) Cette boucle tourne à la fréquence de l'écran et
                           réécrivait une vingtaine de champs texte à chaque image :
                           distances, ETA, vitesses, points, heure d'arrivée. Aucun de ces
                           nombres n'a de sens à cette cadence — le deuxième chiffre après
                           la virgule d'un kilométrage ne se lit pas à 60 Hz — et chaque
                           écriture est un accès au DOM suivi d'un recalcul de mise en page.
                           Le MOUVEMENT, lui, reste à pleine fréquence : marqueur, caméra,
                           tracé et zoom sont au-dessus de cette garde et n'y touchent pas.
                           Seul l'affichage chiffré est ralenti.
                           ⚠ La garde est posée pour le conducteur PRINCIPAL seulement dans
                           son propre bloc plus bas ; ici elle vaut pour tous, adversaires
                           simulés compris — leurs cartes sont hors écran la plupart du
                           temps. */
                        const _majTexte = !animate._lastTexte || (timestamp - animate._lastTexte) > 200;
                        if (_majTexte) animate._lastTexte = timestamp;

                        if (currentTurfLine) {
                            remainingDistKm = simState.distanceKm - d.dist;
                            if (remainingDistKm < 0) remainingDistKm = 0;
                            // Temps restant = proportion de distance restante × durée totale du trajet
                            const progressRatio = simState.distanceKm > 0 ? remainingDistKm / simState.distanceKm : 0;
                            remainingTimeHours = simState.totalDurationHours * progressRatio;
                            if (_majTexte) {
                                setText(`dist-left-${d.id}`, remainingDistKm.toFixed(2) + " km");
                                setText(`eta-${d.id}`, formatTime(remainingTimeHours));
                            }
                        }

                        if (_majTexte) {
                        setText(`dist-${d.id}`, d.dist.toFixed(2) + " km");
                        setText(`time-${d.id}`, formatTime(d.timeHours));
                        setText(`speed-${d.id}`, Math.round(d.actualSpeed));
                        setText(`avg-speed-${d.id}`, Math.round(currentAvgSpeed) + " km/h");
                        setText(`limit-${d.id}`, Math.round(limitKmh) + " km/h");

                        // Idem boucle rAF : valeur affichée plafonnée, couleur pilotée
                        // par le score réel pour conserver le signal d'alerte.
                        setText(`pts-${d.id}`, Math.max(0, d.score).toFixed(3));
                        setStyleProp(`pts-${d.id}`, 'color', d.score < 0 ? '#ff6b6b' : '#4da3ff');

                        if (d.id === drivers[0].id) {
                            const displayPoints = Math.max(0, d.score).toFixed(0);
                            setText('nav-arrivee', remainingTimeHours > 0
                                ? (heureArrivee(remainingTimeHours, Date.now()) || '--')
                                : '--');

                            setText('nav-speed-value', Math.round(d.actualSpeed));
                            setClass('nav-speed-display', 'over-limit', !!d.isSpeeding);
                            updateSpeedometer(d.actualSpeed, limitKmh, !!d.isSpeeding);
                            updateSpeedLimitBadge(limitKmh);

                            if (currentTurfLine) {
                                setText('info-label-1', "🏁 Dist. restante:");
                                setText('info-label-2', "⏳ Temps restant:");
                                setText('info-dist-left', remainingDistKm.toFixed(2) + " km");
                                setText('info-eta', formatTime(remainingTimeHours));
                                setClass('nav-eta-box', 'visible', true);
                                setText('nav-eta', formatTime(remainingTimeHours));
                                updateGoogleEtaBar(remainingDistKm, remainingTimeHours);
                                checkTenMinAlert(remainingTimeHours);
                            } else {
                                setText('info-label-1', "• Distance parcourue:");
                                setText('info-label-2', "⏱️ Temps écoulé:");
                                setText('info-dist-left', d.dist.toFixed(2) + " km");
                                setText('info-eta', formatTime(d.timeHours));
                                setClass('nav-eta-box', 'visible', false);
                            }
                            setText('info-points', displayPoints + " pts");
                        }
                        }   /* fin de la garde _majTexte — voir son commentaire plus haut */
                      } catch (err) {
                        // Log limité à une fois par seconde pour ne pas noyer la console
                        if (!animate._lastErr || timestamp - animate._lastErr > 1000) {
                            animate._lastErr = timestamp;
                            console.error(`[animate] erreur sur le conducteur ${d && d.id} — frame ignorée :`, err);
                        }
                      }
                    });

                    if (isCourseStarted) animationFrame = requestAnimationFrame(animate);
                }
                animationFrame = requestAnimationFrame(animate);

            } catch (error) {
                statusBox.innerText = error.message;
                btnReal.disabled = false; btnSim.disabled = false;
                document.getElementById('btn-free').disabled = false;
                btnStop.disabled = true; btnStop.style.opacity = "0.5";
                
                document.getElementById('ui-panel').classList.remove('panel-hidden');
            document.getElementById('ui-panel').style.display = 'flex';
                document.getElementById('info-widget').style.display = 'none';
                
                updateScreenGlow(false, false);
                releaseWakeLock();
            }
        }
  

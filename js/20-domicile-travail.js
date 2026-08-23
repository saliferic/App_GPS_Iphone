        /* ═══════════════════════════════════════════════════════════════════════════
           LIEUX FIXES — « Go home » et « Go work »          (19/08/2026, élargi le jour même)
           ═══════════════════════════════════════════════════════════════════════════

           Ramener l'utilisateur chez lui, ou l'emmener au travail, en UN appui. C'est ce
           qui dicte l'emplacement des deux boutons : `stopCourse()` (js/19) rouvre le
           panneau Itinéraire en fin de course, ils sont donc déjà sous les yeux à l'instant
           précis où la question « je rentre » se pose, après un trajet chez quelqu'un.

           ⚠ UN SEUL MÉCANISME, DEUX ENTRÉES DANS `PLACES` — ne pas dupliquer pour ajouter
           un troisième lieu. La première version ne connaissait que le domicile ; « Go
           work » n'a coûté qu'une entrée dans la table ci-dessous, un couple de boutons
           dans le HTML et deux clés d'export. Toute correction de comportement profite
           mécaniquement à tous les lieux — c'est précisément ce que deux copies du même
           code auraient perdu au premier correctif appliqué d'un seul côté.

           ⚠ CE FICHIER NE RÉIMPLÉMENTE AUCUN PARCOURS DE DESTINATION. `goPlace()` rejoue à
           la lettre `_gasGoToStation()` (js/11), le « Go ici » du scan ⛽ :
             - à l'arrêt, on remplit la destination puis on appelle `handleStartClick()`,
               qui respecte la bascule Réel/Simu et ouvre l'aperçu de trajet ;
             - en roulant, on passe par `applyNavSearchSelection()` (js/09), point
               d'application UNIQUE d'un changement de destination en cours de route.
           Réécrire ces enchaînements ici les priverait des corrections déjà encaissées
           ailleurs (couleur inline laissée par la dictée, contact fantôme dans l'alerte
           « à 10 min », caméra restée détachée après un scan).

           ⚠ CHARGÉ EN DERNIER (js/20). Une seule chose s'exécute au chargement :
           `setupAddressAutocomplete()` — définie dans js/00-helpers-partages.js, en tête —
           et une lecture de localStorage. Tout le reste part de handlers, donc au runtime,
           où l'intégralité des fichiers précédents est disponible. Ne pas remonter ce
           fichier dans l'ordre des `<script>` : il appelle js/09, js/11, js/14 et js/15. */

        /* La table EST la définition d'un lieu. Ajouter « Go gym » se fait ici, plus le
           couple de boutons correspondant dans index.html et la clé dans
           PROFILE_EXPORT_KEYS (js/02) — rien d'autre dans ce fichier. */
        const PLACES = {
            home: {
                cle: 'gps_home',
                action: 'Go home',
                nom: 'Domicile',
                titreForm: '🏠 Mon domicile',
                invite: 'Touchez pour enregistrer votre adresse',
                champ: 'Adresse de mon domicile',
                dejaLa: 'Vous êtes déjà à votre domicile.',
                /* Marqueur du point en cours de saisie (dictée, ping carte). ⚠ Ce n'est
                   PAS le 🔴 de destination : ici on désigne un lieu qu'on enregistre, pas
                   un trajet qu'on lance — même distinction que le 🏠 du ping du
                   formulaire contact. */
                pin: '🏠',
                pingCarte: '📍 Touchez la carte pour placer MON DOMICILE'
            },
            work: {
                cle: 'gps_work',
                action: 'Go work',
                nom: 'Travail',
                titreForm: '💼 Mon lieu de travail',
                invite: 'Touchez pour enregistrer votre adresse',
                champ: 'Adresse de mon travail',
                dejaLa: 'Vous êtes déjà sur votre lieu de travail.',
                pin: '💼',
                pingCarte: '📍 Touchez la carte pour placer MON LIEU DE TRAVAIL'
            }
        };

        /* Garde-fou « vous y êtes déjà » : en deçà, l'aperçu de trajet serait vide de
           toute instruction de guidage et se lirait comme une panne.
           ⚠ 80 m, et NON un seuil large. Un premier réglage à 250 m couvrait généreusement
           la dérive GPS urbaine et le point du géocodeur (milieu de la voie), mais il
           refusait aussi un trajet parfaitement légitime : rentrer de chez un voisin situé
           à 150 m — c'est-à-dire exactement l'usage que ces boutons servent. 80 m ne couvre
           plus que la dérive du fix lui-même, ce pour quoi ce garde-fou existe. */
        const PLACE_ARRIVED_KM = 0.08;

        // { home: {address, coords, ts} | null, work: … } — jamais undefined, voir _readPlace.
        let _places = { home: null, work: null };
        let _placeEditing = null;      // 'home' | 'work' | null — lieu en cours d'édition
        let _placeDraftCoords = null;  // coords de la suggestion choisie, pas encore enregistrée
        let _placeTempMarker = null;   // point du brouillon posé sur la carte (dictée, ping)

        /* Une fiche sans coordonnées valides est traitée comme une absence de lieu plutôt
           que comme un lieu à moitié valide : c'est `coords` qui fait marcher le bouton,
           l'adresse seule ne mène nulle part. L'utilisateur voit alors l'invite de saisie —
           actionnable — au lieu d'un bouton qui échouerait à l'appui. */
        function _readPlace(genre) {
            try {
                const brut = JSON.parse(localStorage.getItem(PLACES[genre].cle) || 'null');
                const coords = brut ? normalizeLngLat(brut.coords) : null;
                return (brut && brut.address && coords)
                    ? { address: brut.address, coords, ts: brut.ts || 0 }
                    : null;
            } catch (e) { return null; }
        }

        function loadPlacesFromStorage() {
            Object.keys(PLACES).forEach(genre => {
                _places[genre] = _readPlace(genre);
                renderPlaceUI(genre);
            });
        }

        function renderPlaceUI(genre) {
            const def   = PLACES[genre];
            const btn   = document.getElementById('btn-go-' + genre);
            const titre = document.getElementById(genre + '-btn-title');
            const sous  = document.getElementById(genre + '-btn-sub');
            if (!def || !btn || !titre || !sous) return;

            const fiche = _places[genre];
            btn.classList.toggle('has-place', !!fiche);
            /* ⚠ LE TITRE NE CHANGE PAS SELON L'ÉTAT — « Go home » / « Go work » en
               permanence. Une première version affichait le nom du lieu (« Domicile »,
               « Travail ») tant que rien n'était enregistré, au motif qu'un appui ouvre
               alors une saisie et ne lance aucun trajet. Écarté à la demande de
               l'utilisateur (19/08/2026) : un bouton qui se renomme est un bouton qu'on ne
               reconnaît plus d'une fois sur l'autre, et c'est le SOUS-TITRE qui porte déjà
               la distinction entre « configuré » et « à configurer ». `def.nom` ne sert
               plus qu'à la confirmation de suppression, où le libellé d'action n'aurait
               aucun sens. */
            titre.textContent = def.action;
            /* Le sous-titre porte l'adresse enregistrée : c'est le SEUL endroit où
               l'utilisateur peut vérifier ce que le bouton va faire avant de l'appuyer.
               Sans lui, une adresse saisie de travers ne se découvrirait qu'une fois
               l'aperçu de trajet ouvert, c'est-à-dire trop tard pour ne pas y croire. */
            sous.textContent = fiche ? fiche.address : def.invite;
            btn.title = fiche ? `${def.action} — ${fiche.address}` : def.invite;
        }

        function setPlaceFormStatus(msg, estErreur) {
            const el = document.getElementById('place-form-status');
            if (!el) return;
            el.textContent = msg || '';
            el.style.display = msg ? '' : 'none';
            el.style.color = estErreur ? '#ff6b6b' : '#ffffff';
        }

        /* ⚠ UN SEUL FORMULAIRE POUR LES DEUX LIEUX, réutilisé — pas un formulaire par
           bouton. Deux jeux de champs auraient signifié deux `id` de champ d'adresse, deux
           listes de suggestions et deux appels à `setupAddressAutocomplete()` à garder
           synchronisés ; et comme on n'édite jamais deux lieux à la fois, le second serait
           resté du DOM mort en permanence. `_placeEditing` dit lequel est en cours. */
        function openPlaceForm(genre) {
            const def = PLACES[genre];
            const form = document.getElementById('place-edit-form');
            if (!def || !form) return;

            /* Ouvrir la fiche de l'AUTRE lieu (le crayon voisin, sans refermer) doit
               repartir propre : sans cela, le point posé pour le domicile resterait sur la
               carte pendant qu'on renseigne le travail. */
            clearPlaceTempMarker();
            if (pickingMode === 'place-addr') _cancelPlaceMapPick();

            _placeEditing = genre;
            form.style.display = '';
            /* Même parade que le formulaire de contact : pendant la saisie, tout ce qui ne
               sert pas à saisir s'efface pour laisser la place au clavier et à la liste de
               suggestions (règles `#ui-panel.place-focus` dans css/styles.css). */
            document.getElementById('ui-panel')?.classList.add('place-focus');
            setPlaceFormStatus('');

            const titre = document.getElementById('place-form-title');
            if (titre) titre.textContent = def.titreForm;
            const btnSuppr = document.getElementById('btn-delete-place');
            if (btnSuppr) btnSuppr.style.display = _places[genre] ? '' : 'none';

            const input = document.getElementById('place-addr');
            if (!input) return;
            input.placeholder = def.champ;
            input.value = _places[genre] ? _places[genre].address : '';
            input.style.color = '';
            // Le brouillon repart des coordonnées déjà validées : rouvrir le formulaire
            // pour ne rien changer, puis enregistrer, ne doit pas re-géocoder.
            _placeDraftCoords = _places[genre] ? _places[genre].coords : null;
            setTimeout(() => input.focus(), 50);
        }

        function closePlaceForm() {
            const form = document.getElementById('place-edit-form');
            if (form) form.style.display = 'none';
            document.getElementById('ui-panel')?.classList.remove('place-focus');
            setPlaceFormStatus('');
            /* Une dictée ou un ping encore actifs n'auraient plus de champ où écrire —
               le ping laisserait en plus la carte en curseur croix et le bandeau d'aide
               affiché sur un formulaire refermé. */
            stopVoiceInput();
            if (pickingMode === 'place-addr') _cancelPlaceMapPick();
            clearPlaceTempMarker();
            _placeEditing = null;
            _placeDraftCoords = null;
        }

        function clearPlaceTempMarker() {
            if (_placeTempMarker) { _placeTempMarker.remove(); _placeTempMarker = null; }
        }

        /* Point du brouillon sur la carte. Appelée par la dictée (js/06) et par le ping
           (ci-dessous) : un seul marqueur à la fois, sinon chaque tentative en empilerait
           un de plus — le défaut déjà corrigé côté dictée de destination. */
        function setPlaceDraftMarker(coordsBrutes) {
            const coords = normalizeLngLat(coordsBrutes);
            if (!coords) return;
            clearPlaceTempMarker();
            const pin = (PLACES[_placeEditing] && PLACES[_placeEditing].pin) || '📍';
            _placeTempMarker = addEmojiMarker(coords[0], coords[1], pin);
        }

        /* ═══ PING CARTE POUR LE LIEU EN COURS D'ÉDITION ═══
           Calque de `toggleContactMapPick()` (js/14) : le panneau s'efface entièrement
           pour dégager la carte, le formulaire reste ouvert derrière et réapparaît intact
           une fois le point choisi. `_placeEditing` survit à l'aller-retour, c'est lui qui
           dit quelle fiche recevra le point. */
        function _cancelPlaceMapPick() {
            pickingMode = null;
            document.getElementById('btn-pick-place-addr')?.classList.remove('active');
            document.getElementById('map')?.classList.remove('crosshair-cursor');
            document.getElementById('map-pick-hint')?.classList.remove('visible');
        }

        function togglePlaceMapPick() {
            if (pickingMode === 'place-addr') {
                _cancelPlaceMapPick();
                setPanelSnap('full');
                return;
            }
            if (!_placeEditing) return;   // formulaire fermé : rien à renseigner
            // Un ping destination éventuellement en cours est annulé
            document.getElementById('btn-pick-end')?.classList.remove('active');
            pickingMode = 'place-addr';
            document.getElementById('btn-pick-place-addr')?.classList.add('active');
            document.getElementById('map')?.classList.add('crosshair-cursor');
            const hintText = document.getElementById('map-pick-hint-text');
            if (hintText) hintText.innerText = PLACES[_placeEditing].pingCarte;
            document.getElementById('map-pick-hint')?.classList.add('visible');
            setPanelSnap('hidden');
        }

        /* Appelée par le handler `map.on('click')` (js/14), point d'entrée UNIQUE de tous
           les pings. Le point choisi FAIT FOI : le reverse-géocodage ne sert qu'à donner
           un libellé lisible, et son échec n'empêche pas l'enregistrement — on retombe
           alors sur les coordonnées, comme le ping du formulaire contact. */
        async function applyPlacePickedPoint(lng, lat) {
            const genre = _placeEditing;
            const input = document.getElementById('place-addr');
            _placeDraftCoords = [lng, lat];
            setPlaceDraftMarker([lng, lat]);
            if (input) { input.value = "📍 Recherche de l'adresse..."; input.style.color = ''; }
            const joli = await reverseGeocodeToAddress(lat, lng);
            // Le formulaire a pu être refermé, ou basculé sur l'AUTRE lieu, pendant la
            // requête : même garde que `savePlaceAddress()`.
            if (_placeEditing !== genre) return;
            if (input) input.value = joli || `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
            _cancelPlaceMapPick();
            setPanelSnap('full');
        }

        async function savePlaceAddress() {
            const genre = _placeEditing;
            const input = document.getElementById('place-addr');
            if (!genre || !PLACES[genre] || !input) return;
            const adresse = input.value.trim();
            if (adresse.length < 3) { setPlaceFormStatus("Indiquez d'abord une adresse.", true); return; }

            /* Les coordonnées de la suggestion choisie font foi ; le géocodage n'intervient
               qu'en RATTRAPAGE, quand l'adresse a été tapée sans qu'aucune suggestion soit
               retenue. Même règle que `loadFavoriteAddress()` (js/12) : re-géocoder
               systématiquement fait dériver le point, Mapbox reformatant l'adresse au
               passage (« 20 bis Rue Wilhem » → « 20 Rue Wilhem », un autre numéro). */
            let coords = normalizeLngLat(_placeDraftCoords);
            if (!coords) {
                setPlaceFormStatus("🔎 Recherche de l'adresse...");
                try { coords = normalizeLngLat(await geocode(adresse)); }
                catch (e) { coords = null; logAppError('savePlaceAddress/geocode', e); }
            }
            /* Le formulaire a pu être refermé, ou basculé sur l'AUTRE lieu, pendant le
               géocodage : sans ce contrôle, la réponse tardive écrirait l'adresse du
               domicile dans la fiche du travail. */
            if (_placeEditing !== genre) return;
            if (!coords) {
                setPlaceFormStatus("Adresse introuvable — choisissez une suggestion dans la liste.", true);
                return;
            }

            const fiche = { address: adresse, coords, ts: Date.now() };
            /* On n'adopte la nouvelle fiche en mémoire QU'APRÈS écriture réussie : un
               stockage plein laisserait sinon un lieu qui marche jusqu'au rechargement et
               disparaît ensuite, sans que rien ne l'ait annoncé. */
            if (!safeLocalSet(PLACES[genre].cle, JSON.stringify(fiche))) {
                setPlaceFormStatus("Enregistrement impossible : stockage saturé.", true);
                return;
            }
            _places[genre] = fiche;
            renderPlaceUI(genre);
            closePlaceForm();
        }

        function deletePlaceAddress() {
            const genre = _placeEditing;
            if (!genre || !_places[genre]) { closePlaceForm(); return; }
            if (!confirm(`Supprimer ce lieu enregistré ?\n${PLACES[genre].nom} — ${_places[genre].address}`)) return;
            _places[genre] = null;
            safeLocalRemove(PLACES[genre].cle);
            renderPlaceUI(genre);
            closePlaceForm();
        }

        function goPlace(genre) {
            const def = PLACES[genre];
            if (!def) return;

            /* Rien d'enregistré : le formulaire s'ouvre de lui-même. Un bouton qui ne ferait
               rien au premier appui — le cas de TOUT nouvel utilisateur — se lit comme une
               panne, pas comme une configuration manquante. */
            if (!_places[genre]) {
                openPlaceForm(genre);
                setPlaceFormStatus(`Enregistrez cette adresse : « ${def.action} » vous y emmènera ensuite en un appui.`);
                return;
            }

            /* ⚠ `remplirSeulement` — ÉTAT INTERMÉDIAIRE, PAS LA CIBLE. Ces boutons ne font
               aujourd'hui que renseigner la cellule Destination ; l'utilisateur choisit
               ensuite Réel/Simu et appuie sur Démarrer. En version finale ils lanceront le
               trajet directement, avec la géolocalisation pour départ : il suffira de
               retirer cette option, `goToCoords()` rappelant alors `handleStartClick()`
               comme il le faisait. Voir le pavé qui garde cette bascule dans `goToCoords()`. */
            goToCoords(_places[genre].coords, _places[genre].address, {
                dejaLa: def.dejaLa,
                remplirSeulement: true
            });
        }

        /* ═══ LE PARCOURS « EMMÈNE-MOI LÀ », PARTAGÉ (21/08/2026) ═══

           Extrait tel quel de `goPlace()`, sans changement de comportement : `goPlace()`
           n'est plus que la lecture de la fiche du lieu, suivie d'un appel ici. L'extraction
           a été faite quand l'historique des trajets a eu besoin du même geste — on relance
           un trajet vers le départ ou l'arrivée d'un trajet passé.

           ⚠ C'EST LE MÊME AVERTISSEMENT QU'EN TÊTE DE FICHIER, ÉLARGI : ce parcours ne se
           recopie pas. Il rejoue `_gasGoToStation()` (js/11) et encaisse ses correctifs —
           couleur inline laissée par la dictée, contact fantôme dans l'alerte « à 10 min »,
           caméra restée détachée. Un deuxième exemplaire écrit pour l'historique aurait
           divergé au premier correctif appliqué d'un seul côté. Il y a maintenant DEUX
           appelants, ce qui rend la règle plus coûteuse à enfreindre, pas moins.

           `opts.dejaLa` est le message du garde-fou « vous y êtes déjà » ; il diffère selon
           l'appelant (« Vous êtes déjà à votre domicile » n'a aucun sens pour une étape
           d'historique), d'où le paramètre plutôt qu'une chaîne codée en dur. */
        function goToCoords(coordsBrutes, label, opts) {
            const coords = normalizeLngLat(coordsBrutes);
            /* Sans coordonnées exploitables il n'y a pas de destination : on sort au lieu de
               poser un marqueur à `undefined` et d'ouvrir un aperçu de trajet vide. Les
               appelants sont censés ne pas proposer le geste dans ce cas — l'historique
               masque son bouton —, mais ce fichier ne peut pas en dépendre. */
            if (!coords) return false;
            const options = opts || {};

            if (isCourseStarted) {
                /* En roulant, c'est le geste « j'y vais maintenant » : pas d'aperçu, on
                   recalcule tout de suite — exactement un changement de destination depuis
                   la loupe. En TRAJET LIBRE cela fonctionne aussi et c'est voulu :
                   `recalculateRoute()` (js/19) traite explicitement le cas où
                   `exactEndCoords` était nul, et le trajet libre devient alors un trajet
                   guidé vers le lieu choisi, ce qui est précisément la demande. */
                _navSearchMode = 'dest';
                applyNavSearchSelection(coords, label);
                /* Si le panneau ou une feuille avait détaché la caméra, le conducteur
                   repartirait avec une carte figée au lieu d'une carte qui le suit. */
                recenterMap();
                return true;
            }

            /* Déjà sur place : on le DIT, au lieu d'ouvrir un aperçu de trajet de 40 m que
               Mapbox rendrait sans la moindre instruction de guidage.
               ⚠ CE TEST EST ICI, APRÈS la branche « en roulant », et pas plus haut. Placé
               avant, il s'appliquait aussi en navigation — or son seul retour visible est
               `#status`, qui vit dans le panneau Itinéraire, masqué pendant la navigation.
               Le bouton n'aurait alors RIEN fait et RIEN dit : le silence exact que ce
               garde-fou est censé éviter. En roulant, « j'y vais » ne se discute pas.
               `_kmBetween` (js/15) retourne Infinity si l'un des deux points est invalide —
               un GPS non fixé ne peut donc jamais bloquer un départ par ce chemin. La
               position du marqueur prime sur `lastRealCoords` : en simulation, c'est elle
               qui dit où l'on se trouve.

               ⚠ SAUTÉ QUAND ON NE FAIT QUE RENSEIGNER LA DESTINATION (`options.remplirSeulement`,
               le cas de « Go home » / « Go work » depuis le 22/08/2026) : écrire son domicile
               dans la cellule Destination reste légitime quand on s'y trouve déjà, puisque
               rien ne part. Ce garde-fou ne protège que d'un DÉPART vide d'instructions. */
            const ici = (drivers[0] && drivers[0].marker)
                ? [drivers[0].marker.getLngLat().lng, drivers[0].marker.getLngLat().lat]
                : normalizeLngLat(lastRealCoords);
            if (!options.remplirSeulement && ici && _kmBetween(ici, coords) < PLACE_ARRIVED_KM) {
                const statusBox = document.getElementById('status');
                if (statusBox) {
                    statusBox.innerText = options.dejaLa || 'Vous êtes déjà à cet endroit.';
                    statusBox.style.color = '#58a6ff';
                    /* Le message ne sert à rien s'il faut défiler pour le voir : les
                       boutons « Go home » / « Go work » sont bien plus haut dans le
                       panneau. On amène donc `#status` à l'écran — sans quoi ce refus se
                       lit comme une panne, ce qu'il a effectivement été. */
                    tenterSansBruit(() => statusBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' }),
                                    'goToCoords/scrollStatus');
                }
                return false;
            }

            // À l'arrêt : le parcours d'un point choisi sur la carte, suivi de Démarrer.
            exactEndCoords = coords;
            if (endTempMarker) endTempMarker.remove();
            /* 🔴 et non 🏠 ou 💼 : c'est le marqueur de DESTINATION, commun à tous les
               parcours (favoris, ping carte, station du scan). Un pictogramme propre à ces
               lieux ferait croire à un objet d'une autre nature posé sur la carte. */
            endTempMarker = addEmojiMarker(coords[0], coords[1], '🔴');
            const input = document.getElementById('end-addr');
            if (input) { input.value = label; input.style.color = ''; }
            /* Ces lieux ne sont liés à aucun contact : sans ce nettoyage, l'alerte « à 10
               min » continuerait de viser le numéro de la destination précédente — celle de
               la personne que l'on quitte, justement. */
            updateFavPhoneUI('');
            setFavDropdownLabel(null);

            /* ═══ ÉTAPE INTERMÉDIAIRE ASSUMÉE (22/08/2026) ═══
               `remplirSeulement` s'arrête ici : la cellule Destination est renseignée, le
               🔴 est posé, et c'est l'utilisateur qui choisit Réel/Simu puis appuie sur
               Démarrer. C'est l'état demandé pour « Go home » / « Go work » AUJOURD'HUI, et
               non la cible : en version finale ces boutons lanceront le trajet directement,
               avec la géolocalisation pour départ — il suffira alors de ne plus passer
               l'option depuis `goPlace()`, ce chemin-ci reprenant la main.
               Ce qui l'a motivé : `handleStartClick()` ouvrait l'aperçu avec le mode courant,
               Réel par défaut. Depuis un ordinateur qui ne se déplace pas, le trajet réel
               démarrait sur un point bleu immobile — l'appui n'avait donc l'air de rien faire.
               ⚠ L'HISTORIQUE DES TRAJETS NE PASSE PAS L'OPTION et lance toujours
               directement : là, relancer un trajet passé EST le geste demandé, pas
               « préparer une destination ». Une seule fonction, deux régimes explicites. */
            if (options.remplirSeulement) {
                // Le 🔴 vient d'être posé : on le montre, comme le fait la dictée d'adresse
                // (js/06) après avoir renseigné ce même champ.
                tenterSansBruit(() => focusDestinationOnMap(coords, { zoom: 16, duration: 600 }),
                                'goToCoords/focusDest');
                return true;
            }

            handleStartClick();
            return true;
        }

        /* Initialisation. `setupAddressAutocomplete` est le même moteur de suggestions que
           Destination et le formulaire de contact — d'où le fait que le champ accepte aussi
           bien « 12 rue de la Paix » qu'un lieu nommé. Le rappel mémorise les coordonnées de
           la suggestion retenue, ce qui évite un géocodage à l'enregistrement. Un seul appel
           pour les deux lieux : le formulaire est partagé. */
        (function initLieuxFixes() {
            try {
                setupAddressAutocomplete('place-addr', 'place-addr-suggestions', (center) => {
                    _placeDraftCoords = normalizeLngLat(center);
                    setPlaceFormStatus('');
                });
                loadPlacesFromStorage();
            } catch (e) { logAppError('initLieuxFixes', e); }
        })();

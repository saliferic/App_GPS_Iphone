        // === WEB SPEECH API : SAISIE D'ADRESSE PAR VOIX AVEC PARSING DES CONTACTS ===
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        let currentVoiceRecognition = null;

        function findContactInText(text) {
            if (!favorites || favorites.length === 0) return null;
            const lowerText = text.toLowerCase();

            // Cherche les noms complets d'abord (plus précis)
            for (const fav of favorites) {
                const nameToSearch = (fav.name || '').toLowerCase();
                if (nameToSearch && lowerText.includes(nameToSearch)) {
                    return fav;
                }
            }

            // Puis cherche par prénom ou nom seul
            for (const fav of favorites) {
                const prenom = (fav.prenom || '').toLowerCase();
                const nom = (fav.nom || '').toLowerCase();
                if ((prenom && lowerText.includes(prenom)) || (nom && lowerText.includes(nom))) {
                    return fav;
                }
            }

            return null;
        }

        function startVoiceInput(fieldId) {
            /* Firefox n'implémente aucun moteur de reconnaissance vocale (Chrome, Edge et
               Safari, oui). Plutôt qu'un cul-de-sac, on propose de TAPER la phrase : elle
               traverse ensuite exactement le même traitement que la dictée — détection de
               contact, nettoyage des mots de liaison, géocodage. De quoi mettre au point le
               parsing depuis le simulateur, sans repasser par un export sur téléphone. */
            if (!SpeechRecognition) {
                const typed = prompt(
                    "Reconnaissance vocale indisponible sur ce navigateur (Firefox ne la gère pas).\n\n" +
                    "Mode test : saisissez la phrase que vous auriez dictée.\n" +
                    "Ex. « je veux aller au moulin rouge » ou « je vais chez Sandy »"
                );
                if (typed && typed.trim()) parseVoiceAndGeocode(fieldId, typed.trim());
                return;
            }

            // Arrêter toute reconnaissance en cours
            stopVoiceInput();

            currentVoiceRecognition = new SpeechRecognition();
            currentVoiceRecognition.lang = 'fr-FR';
            currentVoiceRecognition.interimResults = true;

            const inputField = document.getElementById(fieldId);
            const micBtn = document.querySelector(`[onclick*="startVoiceInput('${fieldId}')"]`);

            if (micBtn) micBtn.classList.add('recording');
            if (inputField) {
                const origPlaceholder = inputField.placeholder;
                inputField.dataset.origPlaceholder = origPlaceholder;
                inputField.placeholder = '🎤 En écoute...';
            }

            currentVoiceRecognition.onresult = (event) => {
                let transcript = '';
                for (let i = event.resultIndex; i < event.results.length; i++) {
                    transcript += event.results[i][0].transcript + ' ';
                }
                transcript = transcript.trim();

                if (event.results[event.results.length - 1].isFinal && transcript) {
                    // Texte final reconnu → utiliser le parsing intelligent Google Maps
                    parseVoiceAndGeocode(fieldId, transcript);
                }
            };

            currentVoiceRecognition.onerror = (event) => {
                console.warn('Erreur reconnaissance vocale:', event.error);
                if (inputField) inputField.placeholder = '❌ Erreur microphone';
            };

            currentVoiceRecognition.onend = () => {
                if (micBtn) micBtn.classList.remove('recording');
                if (inputField && inputField.dataset.origPlaceholder) {
                    inputField.placeholder = inputField.dataset.origPlaceholder;
                }
            };

            try {
                currentVoiceRecognition.start();
            } catch (e) {
                console.warn('Erreur démarrage reconnaissance vocale:', e);
            }
        }

        function stopVoiceInput() {
            if (currentVoiceRecognition) {
                currentVoiceRecognition.abort();
                currentVoiceRecognition = null;
            }
        }

        /* === PARSING ET GÉOCODAGE VOCAL (Système Google Maps) ===
           ⚠ On ne filtre QUE les mots de tête et de queue de phrase, jamais au milieu.
           L'ancienne version supprimait les mots vides partout dans le texte : « gare de
           lyon » devenait « lyon » et « place de la concorde » devenait « concorde », ce
           qui envoyait le géocodeur n'importe où. Les articles font partie intégrante des
           noms de lieux français, ils doivent être conservés dès qu'un mot utile a été vu. */
        const VOICE_LEADING_FILLERS = [
            'je', 'j', 'tu', 'on', 'nous', 'veux', 'voudrais', 'aimerais', 'souhaite',
            'vais', 'va', 'allons', 'aller', 'rendre', 'me', 'moi', 'te', 'emmène',
            'emmene', 'amène', 'amene', 'conduis', 'conduit', 'guide', 'mets', 'met',
            'direction', 'destination', 'adresse', 'lieu', 'endroit', 'vers', 'à', 'a',
            'au', 'aux', 'en', 'dans', 'sur', 'pour', 'la', 'le', 'les', "l'", 'un',
            'une', 'des', 'du', 'de', 'chez', 'voir', 'passer', 'ok', 'okay', 'et',
            'puis', 'ensuite', 'maintenant', 'stp'
        ];
        const VOICE_TRAILING_FILLERS = [
            'merci', 'stp', 's\'il', 'sil', 'te', 'vous', 'plaît', 'plait', 'please',
            'maintenant', 'tout', 'suite'
        ];

        function cleanVoiceText(transcript) {
            let cleaned = (transcript || '').toLowerCase().trim();
            cleaned = cleaned.replace(/[.,;:?!]+/g, ' ').replace(/\s+/g, ' ').trim();
            if (!cleaned) return '';

            let words = cleaned.split(' ');

            /* Amorce : on retire les mots de liaison tant qu'on n'a pas rencontré un mot
               utile. Les élisions COLLÉES au mot suivant doivent être décollées ici, sinon
               elles ne sont jamais reconnues comme liaison : « je veux aller à l'arc de
               triomphe » laissait passer « l'arc de triomphe », que les géocodeurs prennent
               pour un nom d'établissement (un bar de Lille s'appelle exactement comme ça).
               On ne le fait qu'en TÊTE de phrase : au milieu, l'élision fait partie du nom
               (« musée d'Orsay », « place d'Italie »). */
            let start = 0;
            while (start < words.length) {
                if (VOICE_LEADING_FILLERS.includes(words[start])) { start++; continue; }
                const elision = words[start].match(/^(?:l|d|j|n|m|t|s|qu)['’](.+)$/);
                if (elision) { words[start] = elision[1]; continue; } // « j'aimerais » → « aimerais », encore une liaison
                break;
            }
            // Sécurité : si tout a été mangé (phrase 100% liaison), on garde le texte d'origine.
            if (start >= words.length) return cleaned;

            // Politesse de fin de phrase.
            let end = words.length;
            while (end > start && VOICE_TRAILING_FILLERS.includes(words[end - 1])) end--;

            return words.slice(start, end).join(' ').trim();
        }

        /* Pose le marqueur de destination pour le champ visé, en RÉUTILISANT la variable
           qui fait autorité pour ce champ. Sans cela, chaque dictée empilait un marqueur
           supplémentaire sans effacer le précédent : la carte se centrait bien sur la
           nouvelle adresse, mais l'ancien point rouge restait visible ailleurs — c'est lui
           qu'on prenait pour « le ping mal positionné ». */
        function setVoiceDestinationMarker(fieldId, coords) {
            if (!coords) return;
            if (fieldId === 'end-addr' || fieldId === 'modal-end-addr') {
                if (endTempMarker) endTempMarker.remove();
                endTempMarker = addEmojiMarker(coords[0], coords[1], '🔴');
            } else if (fieldId === 'modal-start-addr') {
                if (startTempMarker) startTempMarker.remove();
                startTempMarker = addEmojiMarker(coords[0], coords[1], '🔵');
            } else {
                if (currentTempMarker) currentTempMarker.remove();
                currentTempMarker = addEmojiMarker(coords[0], coords[1], '📍');
            }
        }

        /* Couleur de repos d'un champ d'adresse. La dictée colore le champ pour signaler
           son avancement (bleu = recherche, vert = trouvé, rouge = échec) en style INLINE,
           qui l'emporte sur la feuille de styles et ne s'efface pas tout seul. Sur le seul
           chemin d'échec, plus rien ne le rétablissait : le champ restait rouge, et TOUT ce
           qui écrivait ensuite dedans héritait de cette couleur — une adresse enregistrée
           chargée depuis « Adresses enregistrées » s'affichait en rouge comme si elle avait
           échoué, alors qu'elle était parfaitement valide. */
        function resetAddrFieldColor(inputField) {
            if (inputField) inputField.style.color = '';
        }

        /* Génération de dictée. Les deux temporisations de 2 s (restauration de couleur
           après succès, repli du texte brut après échec) écrivaient dans le champ SANS
           vérifier que leur dictée était toujours d'actualité : choisir un contact ou
           retaper une adresse dans ces deux secondes voyait sa saisie écrasée par le
           reliquat de la tentative précédente. */
        let _voiceRun = 0;

        async function parseVoiceAndGeocode(fieldId, transcript) {
            const inputField = document.getElementById(fieldId);
            if (!inputField) return;

            const run = ++_voiceRun;
            try {
                // 1. Chercher si c'est un contact d'abord
                const contact = findContactInText(transcript);
                if (contact && contact.address) {
                    // Contact trouvé !
                    inputField.value = contact.address;
                    resetAddrFieldColor(inputField);

                    // Mettre à jour les coords
                    const contactCoords = normalizeLngLat(contact.coords);
                    if (contactCoords) {
                        if (fieldId === 'modal-start-addr') modalStartCoords = contactCoords;
                        else if (fieldId === 'modal-end-addr') modalEndCoords = contactCoords;
                        else if (fieldId === 'end-addr') exactEndCoords = contactCoords;
                        else if (fieldId === 'contact-adresse') contactAdresseCoords = contactCoords;

                        /* En navigation, ni marqueur ni recadrage : le recalcul d'itinéraire
                           est le vrai retour visuel, et emmener la caméra à l'autre bout du
                           trajet en roulant ferait perdre la route au conducteur. */
                        if (fieldId !== 'nav-search-input') {
                            setVoiceDestinationMarker(fieldId, contactCoords);
                            focusDestinationOnMap(contactCoords, { zoom: 16, duration: 600 });
                        }
                    }

                    // Afficher le contact dans « Adresses enregistrées »
                    const contactIndex = favorites.findIndex(f => f === contact);
                    if (contactIndex !== -1) {
                        updateFavPhoneUI(contactIndex);
                        setFavDropdownLabel(contact.prenom || contact.name);
                    }

                    // Feedback audio
                    playAudioSequence(['location_recovered.ogg']);

                    /* Dictée depuis la navigation : le champ ne sert pas de brouillon, la
                       destination doit être appliquée et l'itinéraire recalculé tout de
                       suite. Le conducteur ne va pas revenir valider quoi que ce soit. */
                    if (fieldId === 'nav-search-input' && contactCoords) {
                        if (_navSearchMode === 'dest') initTenMinForTrip();
                        closeQuickReroute();
                        applyNavSearchSelection(contactCoords, contact.name || contact.address);
                    }
                    return;
                }

                // 2. Pas de contact → nettoyer et géocoder l'adresse
                inputField.value = '🔎 Recherche de l\'adresse...';
                inputField.style.color = '#4da3ff';

                const cleanedAddress = cleanVoiceText(transcript);
                if (!cleanedAddress || cleanedAddress.length < 2) {
                    inputField.value = '';
                    resetAddrFieldColor(inputField);
                    return;
                }

                /* Géocodage + libellé en un seul appel. On n'inverse SURTOUT pas les
                   coordonnées obtenues pour retrouver une adresse : sur un monument, le
                   reverse-géocodage renvoie l'adresse postale la plus proche (« 82 Boulevard
                   de Clichy » pour le Moulin Rouge, « 5 Avenue Anatole France » pour la tour
                   Eiffel). Le point visé était pourtant le bon, mais l'utilisateur voyait
                   s'afficher une adresse sans rapport avec sa demande et en concluait que la
                   recherche avait échoué. */
                const found = await geocodeDetailed(cleanedAddress);
                const coords = found.coords;
                if (!coords) throw new Error('Adresse introuvable');

                inputField.value = found.label || cleanedAddress;
                inputField.style.color = '#28a745'; // Vert pour succès

                // Mettre à jour les coords
                if (fieldId === 'modal-start-addr') modalStartCoords = coords;
                else if (fieldId === 'modal-end-addr') {
                    modalEndCoords = coords;
                    // Déclencher le calcul du trajet si les deux coords sont présentes
                    if (modalStartCoords && modalEndCoords) {
                        setTimeout(() => calculateTripPreview(), 300);
                    }
                }
                else if (fieldId === 'end-addr') exactEndCoords = coords;
                else if (fieldId === 'contact-adresse') contactAdresseCoords = coords;

                // Adresse libre : ce n'est pas un contact enregistré, on désélectionne la liste
                if (fieldId === 'end-addr') {
                    updateFavPhoneUI('');
                    setFavDropdownLabel(null);
                }

                // Dictée en navigation : on applique et on recalcule, sans bouger la caméra.
                if (fieldId === 'nav-search-input') {
                    playAudioSequence(['location_recovered.ogg']);
                    closeQuickReroute();
                    applyNavSearchSelection(coords, found.label || cleanedAddress);
                    return;
                }

                setVoiceDestinationMarker(fieldId, coords);
                focusDestinationOnMap(coords, { zoom: 16, duration: 600 });

                // Feedback audio succès
                playAudioSequence(['location_recovered.ogg']);

                // Le vert de succès n'est qu'un accusé de réception : on revient à la
                // couleur de la feuille de styles. Si une autre dictée est partie entre
                // temps, c'est elle qui pilote le champ — on ne touche à rien.
                setTimeout(() => {
                    if (run !== _voiceRun) return;
                    resetAddrFieldColor(inputField);
                }, 2000);

            } catch (err) {
                const messageErreur = '❌ Adresse introuvable';
                inputField.value = messageErreur;
                inputField.style.color = '#ff6b6b';
                logAppError('parseVoiceAndGeocode/' + fieldId, err);

                /* Repli : on remet le texte brut nettoyé pour que l'utilisateur puisse le
                   corriger au lieu de tout redicter — ET on rend au champ sa couleur
                   normale, ce qui manquait. Sans cette ligne le rouge restait collé en
                   style inline sur un champ redevenu éditable, et contaminait ensuite
                   chaque adresse qu'on y chargeait, contact enregistré compris.

                   Deux gardes avant d'écrire : la dictée doit être encore la plus récente,
                   et le champ doit contenir EXACTEMENT le message d'erreur. S'il a changé,
                   c'est que l'utilisateur a agi dans ces deux secondes — choisi un contact,
                   retapé une adresse — et son geste ne doit pas être écrasé par le
                   reliquat d'une tentative qu'il a déjà abandonnée. */
                setTimeout(() => {
                    if (run !== _voiceRun) return;
                    if (inputField.value !== messageErreur) return;
                    const cleaned = cleanVoiceText(transcript);
                    inputField.value = cleaned || '';
                    resetAddrFieldColor(inputField);
                }, 2000);
            }
        }

        let currentTempMarker = null;

        // `estimated` : la distance provient du dead reckoning, pas d'un fix satellite.
        // On dit alors « environ 500 mètres » (around.ogg) au lieu de « dans 500 mètres »
        // (in.ogg) — le conducteur doit savoir qu'il ne peut pas s'y fier au mètre près.
        function getManeuverAudioFiles(step, distMeters, estimated = false) {
            const files = [];
            const type = step.maneuver.type;
            const modifier = step.maneuver.modifier;
            const exit = step.maneuver.exit;

            // Paliers longs uniquement : à 30 m la manœuvre est imminente, on annonce
            // la direction seule, sans préambule de distance.
            const DIST_FILE = { 500: '500.ogg', 300: '300.ogg', 150: '150.ogg', 100: '100.ogg' };
            if (DIST_FILE[distMeters]) {
                files.push(estimated ? 'around.ogg' : 'in.ogg', DIST_FILE[distMeters], 'meters.ogg');
            }

            if (type === 'roundabout' || type === 'rotary') {
                files.push('roundabout.ogg', 'take.ogg');
                if (exit && ORDINAL_MAP[exit]) files.push(`${ORDINAL_MAP[exit]}.ogg`);
                files.push('exit.ogg');
            } else if (modifier === 'left') {
                files.push('left.ogg');
            } else if (modifier === 'slight left') {
                files.push('left_sl.ogg');
            } else if (modifier === 'sharp left') {
                files.push('left_sh.ogg');
            } else if (modifier === 'right') {
                files.push('right.ogg');
            } else if (modifier === 'slight right') {
                files.push('right_sl.ogg');
            } else if (modifier === 'sharp right') {
                files.push('right_sh.ogg');
            } else if (modifier === 'uturn') {
                files.push('make_uturn.ogg');
            } else {
                files.push('go_ahead.ogg');
            }

            return files;
        }

        let restAreas = [];
        const REST_STOP_INTERVAL_HOURS = 110 / 60;
        let nextRestThresholdHours = REST_STOP_INTERVAL_HOURS;

        const REST_STOP_PAUSE_MINUTES = 15;
        const REST_STOP_BONUS_POINTS = 50;
        const REST_STOP_RADIUS_KM = 0.25;
        let restStopTracking = { active: false, areaName: null, enteredAt: null, validated: false };

        let testPauseSimEnabled = false;
        let simFrozenAtRestArea = false;
        let simTestAreaDistKm = null;
        const TEST_PAUSE_SECONDS = 20;

        let favorites = [];
        let isUserPanning = false;
        let startAddrAutoFilled = false;
        let startAddrText = "Recherche de votre position...";
        let hasCenteredMapOnce = false;

        // === EXPORT / IMPORT PROFIL (Option 1 — fichier JSON) ===
        // ═══════════════════════════════════════════════════════════

        const PROFILE_EXPORT_KEYS = [
            'gps_profiles',
            'gps_active_profile_id',
            'gps_weekly_goals',
            'gps_km_history',
            'gps_last_km_goal',
            'gps_favorites',
            'gps_home',
            'gps_work',
            'gps_trip_history',
            // Véhicule
            'gps_vehicle_type',
            'gps_vehicle_consumption',
            'gps_vehicle_consumption_elec',
            'gps_fuel_price',
            'gps_fuel_type',
            'gps_fuel_price_manual',
            'gps_fuel_price_auto',
            'gps_elec_price',
            // Préférences
            'gps_voice_enabled',
            'gps_voice_quiet',
            'gps_avoid_tolls',
            'gps_map_theme',
            'gps_map_traffic',
            'gps_buildings_3d',
            'gps_eco_counter',
            'gps_critair',
            'gps_vehicle_category',
            'gps_zfe_alerts',
            'gps_tenmin_enabled',
            'salif_gps_badges',
            'gps_error_log',
        ];

        /* Une WebView Android n'implémente pas le téléchargement d'une URL blob: :
           l'ancre est cliquée, rien ne se passe, et selon la version du composant
           l'application se ferme brutalement. On détecte donc le contexte pour
           basculer sur un affichage du JSON à copier. Le marqueur "; wv)" dans
           l'User-Agent est celui que place Android sur toute WebView embarquée. */
        function _isAndroidWebView() {
            const ua = navigator.userAgent || '';
            if (!/Android/i.test(ua)) return false;
            if (/;\s*wv\)/i.test(ua)) return true;
            // Navigateurs autonomes : ils savent télécharger, on ne les capture pas
            if (/Firefox\/|FxiOS|EdgA\/|OPR\/|SamsungBrowser\//i.test(ua)) return false;
            // Certains conteneurs masquent le marqueur : absence de Chrome autonome
            return !/Chrome\/\d+/.test(ua) || /Version\/\d+\.\d+\s+Chrome\//.test(ua);
        }

        function _buildProfileSnapshot() {
            const snapshot = { _version: 2, _exportedAt: new Date().toISOString() };
            // Clés globales
            PROFILE_EXPORT_KEYS.forEach(key => {
                const val = localStorage.getItem(key);
                if (val !== null) snapshot[key] = val;
            });
            /* Clés par profil : objectifs de la semaine, et badges d'anciennes versions.
               ⚠ `salif_gps_badges` EST RECOPIÉ ALORS QUE PLUS RIEN NE LE LIT. Le système
               de badges a été retiré le 27/08/2026 (voir js/12), mais la clé dort encore
               dans le stockage des utilisateurs : un export qui la laisserait tomber
               ferait de l'import un chemin de PERTE de données, silencieux. Le nom est
               écrit en clair ici depuis que la constante `BADGE_KEY` a disparu avec le
               reste — ne pas le déduire d'une variable, il n'y en a plus. */
            const CLE_BADGES_DORMANTE = 'salif_gps_badges';
            profiles.forEach(p => {
                const bKey = `${CLE_BADGES_DORMANTE}_${p.id}`;
                const gKey = `gps_weekly_goals_${p.id}`;
                const bVal = localStorage.getItem(bKey);
                const gVal = localStorage.getItem(gKey);
                if (bVal) snapshot[bKey] = bVal;
                if (gVal) snapshot[gKey] = gVal;
            });
            // Rétrocompat : clés globales non-profilées
            const legacyBadge = localStorage.getItem(CLE_BADGES_DORMANTE);
            const legacyGoals = localStorage.getItem('gps_weekly_goals');
            if (legacyBadge) snapshot[CLE_BADGES_DORMANTE] = legacyBadge;
            if (legacyGoals) snapshot['gps_weekly_goals'] = legacyGoals;
            return snapshot;
        }

        function _exportFileName() {
            const active = profiles.find(p => p.id == activeProfileId);
            const name = active ? active.name.replace(/[^a-zA-Z0-9]/g, '_') : 'salif';
            const date = new Date().toISOString().slice(0, 10);
            return `salif_gps_${name}_${date}.json`;
        }

        function _exportFeedback(msg) {
            const btn = document.querySelector('[onclick="exportProfile()"]');
            if (!btn) return;
            const orig = btn.innerHTML;
            btn.innerHTML = msg; btn.style.opacity = '0.7';
            setTimeout(() => { btn.innerHTML = orig; btn.style.opacity = ''; }, 2500);
        }

        function showExportJsonModal(text) {
            const box = document.getElementById('export-json-text');
            const overlay = document.getElementById('export-json-overlay');
            if (!box || !overlay) { alert(text); return; }
            box.value = text;
            overlay.classList.add('open');
        }

        function closeExportJsonModal() {
            const overlay = document.getElementById('export-json-overlay');
            if (overlay) overlay.classList.remove('open');
        }

        async function copyExportJson() {
            const box = document.getElementById('export-json-text');
            const btn = document.getElementById('export-json-copy');
            if (!box) return;
            let ok = false;
            try {
                // L'API presse-papiers exige un contexte sécurisé : absente en file://
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(box.value);
                    ok = true;
                }
            } catch (e) { ok = false; }
            if (!ok) {
                // Repli historique, encore le seul disponible dans beaucoup de WebView
                try {
                    box.removeAttribute('readonly');
                    box.focus();
                    box.setSelectionRange(0, box.value.length);
                    ok = document.execCommand('copy');
                    box.setAttribute('readonly', 'readonly');
                } catch (e) { ok = false; }
            }
            if (btn) {
                const orig = btn.innerHTML;
                btn.innerHTML = ok ? '✅ Copié !' : '⚠️ Sélectionne le texte à la main';
                setTimeout(() => { btn.innerHTML = orig; }, 2500);
            }
        }

        function exportProfile() {
            let json;
            try {
                json = JSON.stringify(_buildProfileSnapshot(), null, 2);
            } catch (e) {
                alert('Erreur export : ' + e.message);
                return;
            }
            // En WebView on ne tente même pas le téléchargement : c'est lui qui plante.
            if (_isAndroidWebView()) {
                showExportJsonModal(json);
                return;
            }
            try {
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.download = _exportFileName();
                a.href = url;
                a.style.display = 'none';
                document.body.appendChild(a);
                a.click();
                setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
                _exportFeedback('✅ Exporté !');
            } catch (e) {
                // Navigateur récalcitrant : on retombe sur l'affichage manuel
                showExportJsonModal(json);
            }
        }

        function importProfile(input) {
            const file = input.files[0];
            if (!file) return;
            const statusEl = document.getElementById('import-profile-status');

            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const data = JSON.parse(e.target.result);

                    /* VALIDATION DU FICHIER IMPORTÉ.

                       Ce fichier arrive de l'extérieur : il a pu être bricolé à la main, ou
                       provenir d'un autre appareil, d'une autre version. Il finit écrit tel
                       quel dans le localStorage, que TOUT le reste de l'application relit
                       ensuite en lui faisant confiance.

                       ⚠ VOLONTAIREMENT PERMISSIVE. Une clé douteuse est IGNORÉE, jamais un
                       motif de rejeter le fichier entier : les exports d'anciennes versions
                       doivent continuer de passer, et refuser tout un profil pour un seul
                       réglage aberrant transformerait une sauvegarde en presse-papier
                       inutilisable. Seul un fichier qui n'est pas un export est refusé.

                       `typeof null` vaut "object" et un tableau aussi : les deux sont donc
                       écartés explicitement, sans quoi `data[key]` plus bas lirait des
                       indices au lieu de clés. */
                    if (!data || typeof data !== 'object' || Array.isArray(data)
                        || !data._version || !data._exportedAt) {
                        throw new Error('Fichier invalide — ce n\'est pas un export Salif GPS.');
                    }

                    /* Chaque valeur DOIT être une chaîne : le localStorage ne stocke que du
                       texte, et `setItem` convertit silencieusement le reste — un objet y
                       entrerait comme "[object Object]", un tableau comme sa liste aplatie.
                       La clé serait alors corrompue pour le module qui la relit, sans le
                       moindre message. On écarte aussi les valeurs démesurées, qui feraient
                       sauter le quota du stockage AU MILIEU de la boucle d'écriture et
                       laisseraient le profil à moitié importé.

                       La boucle d'écriture n'itère QUE sur PROFILE_EXPORT_KEYS : une clé
                       inconnue glissée dans le fichier n'est jamais écrite, c'est déjà une
                       liste blanche. Ce qui restait à vérifier, c'est la FORME des valeurs
                       attendues — d'où ce tour de contrôle, et non un rejet global. */
                    const TAILLE_MAX_VALEUR = 2 * 1024 * 1024;   // 2 Mio/clé, très au-dessus du réel
                    const clesEcartees = [];
                    PROFILE_EXPORT_KEYS.forEach(key => {
                        if (data[key] === undefined) return;
                        if (typeof data[key] !== 'string' || data[key].length > TAILLE_MAX_VALEUR) {
                            clesEcartees.push(key);
                            delete data[key];
                        }
                    });
                    if (clesEcartees.length) {
                        logAppError('import/clesEcartees', new Error(clesEcartees.join(', ')));
                    }

                    // Confirmation avant écrasement
                    const exportDate = new Date(data._exportedAt).toLocaleDateString('fr-FR', {
                        day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    });
                    /* Le nom des profils ne sert qu'à l'aperçu de la fenêtre de
                       confirmation. Un `gps_profiles` illisible ne doit donc PAS emporter
                       l'import : on affiche « aucun » et la suite se déroule normalement.
                       `String((p && p.name) || '?')` parce qu'un profil bricolé peut porter
                       un nom numérique, nul, ou pas de nom du tout. Ce texte part dans
                       `confirm()`, qui n'interprète aucun balisage : rien à échapper ici. */
                    let profileNames = 'aucun';
                    try {
                        const profilsLus = JSON.parse(data['gps_profiles'] || '[]');
                        if (Array.isArray(profilsLus)) {
                            profileNames = profilsLus
                                .map(p => String((p && p.name) || '?').slice(0, 40))
                                .join(', ') || 'aucun';
                        }
                    } catch (e) { logAppError('import/profilsIllisibles', e); }

                    /* La ligne « 🏅 Badges : N » a été retirée le 27/08/2026 avec le
                       système qu'elle comptait. Rien ne la remplace : le nombre d'animaux
                       sauvés vit dans `salif_gps_parcours`, qui est importé comme le
                       reste — l'annoncer ici demanderait de le décompter à la main dans
                       une fenêtre de confirmation, pour une information que la page
                       « Animaux sauvés » donne déjà après l'import. */
                    const confirmed = confirm(
                        `Importer ce profil ?\n\n` +
                        `📅 Exporté le : ${exportDate}\n` +
                        `👤 Profils : ${profileNames}\n\n` +
                        `⚠️ Tes données actuelles seront remplacées.`
                    );
                    if (!confirmed) { input.value = ''; return; }

                    // Écriture dans localStorage
                    let imported = 0;
                    PROFILE_EXPORT_KEYS.forEach(key => {
                        if (data[key] !== undefined) {
                            localStorage.setItem(key, data[key]);
                            imported++;
                        }
                    });

                    // Recharger l'UI
                    /* Domicile et travail sont relus depuis le localStorage fraîchement
                       écrit, sinon `_places` (js/20) garderait en mémoire les adresses de
                       l'ancien profil : les boutons afficheraient les bonnes adresses
                       importées seulement au prochain lancement, et emmèneraient entre-temps
                       aux anciennes. */
                    tenterSansBruit(() => loadPlacesFromStorage(), 'import/lieuxFixes');
                    renderDriversUI();
                    renderCarteCompagnon();
                    renderWeeklyGoalsPanel();

                    /* Recharger les réglages carte via le chemin commun. Cet endroit posait
                       en dur deux styles d'un AUTRE compte Mapbox (`saliftravelling/…`),
                       vestiges d'une version précédente : importer un profil remplaçait donc
                       la carte par un style étranger, sans trafic ni bâtiments 3D, et
                       désynchronisait le suivi d'URL de applyMapStyle(). */
                    isDarkMode         = (localStorage.getItem('gps_map_theme') || 'night') !== 'day';
                    // `=== 'on'` : même règle opt-in qu'au chargement (cf. 03-carte-3d.js).
                    // Un profil exporté avant l'introduction de la clé n'active donc rien.
                    isTrafficVisible   = localStorage.getItem('gps_map_traffic') === 'on';
                    buildings3DEnabled = localStorage.getItem('gps_buildings_3d') !== 'off';
                    if (map) applyMapStyle();
                    updateThemeUI();
                    updateTrafficUI();

                    const voiceEnabled = localStorage.getItem('gps_voice_enabled') !== '0';
                    const voiceToggle = document.getElementById('voice-guidance-toggle');
                    if (voiceToggle) voiceToggle.checked = voiceEnabled;
                    voiceGuidanceEnabled = voiceEnabled;

                    // Même règle opt-in qu'au chargement : un profil exporté avant
                    // l'introduction de la clé garde la voix complète.
                    voiceQuietMode = localStorage.getItem('gps_voice_quiet') === '1';
                    const quietToggle = document.getElementById('voice-quiet-toggle');
                    if (quietToggle) quietToggle.checked = voiceQuietMode;

                    // Feedback
                    statusEl.style.display = 'block';
                    statusEl.style.background = 'rgba(40,167,69,0.15)';
                    statusEl.style.border = '1px solid rgba(40,167,69,0.3)';
                    statusEl.style.color = '#6ee7b7';
                    statusEl.innerHTML = `✅ ${imported} éléments importés avec succès !<br><span style="opacity:0.7;font-weight:400;">Profil restauré depuis le ${exportDate}</span>`;
                    setTimeout(() => { statusEl.style.display = 'none'; }, 5000);

                } catch(err) {
                    statusEl.style.display = 'block';
                    statusEl.style.background = 'rgba(231,76,60,0.12)';
                    statusEl.style.border = '1px solid rgba(231,76,60,0.3)';
                    statusEl.style.color = '#f87171';
                    /* ⚠ `err.message` n'est PAS du texte de confiance : un message de
                       `JSON.parse` recopie un extrait du fichier lu (« Unexpected token < »).
                       Interpolé brut, il exécutait le balisage d'un fichier taillé pour. */
                    statusEl.innerHTML = `❌ Erreur : ${echapperHtml(err.message)}`;
                }
                input.value = ''; // reset pour permettre de réimporter le même fichier
            };
            reader.readAsText(file);
        }
        // Niveau 1 : détection réseau + UI adaptative
        // Niveau 2 : cache localStorage de la dernière route
        // ═══════════════════════════════════════════════════════════

        const OFFLINE_ROUTE_KEY = 'salif_gps_offline_route';

        // ── Cache de la dernière route ──
        function saveRouteOfflineCache(precomputedRoute) {
            if (!precomputedRoute) return;
            try {
                const cache = {
                    savedAt: Date.now(),
                    startCoords: precomputedRoute.startCoords,
                    endCoords: precomputedRoute.endCoords,
                    avoidTolls: precomputedRoute.avoidTolls,
                    endAddrLabel: document.getElementById('modal-end-addr')?.value
                        || document.getElementById('end-addr')?.value || '',
                    osrmData: precomputedRoute.osrmData,
                };
                localStorage.setItem(OFFLINE_ROUTE_KEY, JSON.stringify(cache));
                console.log('[Offline] Route mise en cache hors ligne ✅');
            } catch(e) {
                console.warn('[Offline] Cache route échoué (quota localStorage?)', e);
            }
        }

        function loadRouteOfflineCache() {
            try {
                const raw = localStorage.getItem(OFFLINE_ROUTE_KEY);
                if (!raw) return null;
                const cache = JSON.parse(raw);
                // On expire le cache après 48h (route peut ne plus être pertinente)
                if (Date.now() - cache.savedAt > 48 * 3600 * 1000) {
                    localStorage.removeItem(OFFLINE_ROUTE_KEY);
                    return null;
                }
                return cache;
            } catch(e) { return null; }
        }

        function clearRouteOfflineCache() {
            localStorage.removeItem(OFFLINE_ROUTE_KEY);
        }

        // ── UI hors ligne ──
        function _updateOfflineUI(offline) {
            // Pastille dans la nav bar
            const dot = document.getElementById('offline-dot');
            if (dot) dot.classList.toggle('visible', offline);

            // Classe globale sur body pour désactiver les sections réseau
            document.body.classList.toggle('is-offline', offline);

            // Toast pendant navigation active
            const toast = document.getElementById('offline-nav-toast');
            if (toast) toast.classList.toggle('visible', offline && isCourseStarted);
        }

        function showConnectivityBanner(offline) {
            const el = document.getElementById('connectivity-banner');
            if (!el) return;
            if (offline) {
                el.innerText = "📵 Connexion internet perdue — recalcul et stations désactivés";
                el.classList.remove('online'); el.classList.add('visible');
                _updateOfflineUI(true);
            } else {
                el.innerText = "✅ Connexion rétablie";
                el.classList.add('online'); el.classList.add('visible');
                setTimeout(() => el.classList.remove('visible'), 2500);
                _updateOfflineUI(false);
            }
        }

        // ── Modal hors ligne (pour blocage de lancement trajet) ──
        function showOfflineModal() {
            const cache = loadRouteOfflineCache();
            const resumeBox = document.getElementById('offline-modal-resume');
            const resumeBtn = document.getElementById('offline-btn-resume');
            const resumeDesc = document.getElementById('offline-resume-desc');

            if (cache) {
                const age = Math.round((Date.now() - cache.savedAt) / 60000);
                const ageLabel = age < 60 ? `il y a ${age} min` : `il y a ${Math.round(age/60)}h`;
                if (resumeDesc) resumeDesc.textContent = `"${cache.endAddrLabel || 'Dernier trajet'}" — sauvegardé ${ageLabel}.`;
                if (resumeBox) resumeBox.classList.add('visible');
                if (resumeBtn) resumeBtn.style.display = 'block';
            } else {
                if (resumeBox) resumeBox.classList.remove('visible');
                if (resumeBtn) resumeBtn.style.display = 'none';
            }

            document.getElementById('offline-modal').classList.add('visible');
        }

        function closeOfflineModal() {
            document.getElementById('offline-modal').classList.remove('visible');
        }

        function offlineResumeLastRoute() {
            const cache = loadRouteOfflineCache();
            if (!cache) return;
            closeOfflineModal();

            // Restaurer l'adresse de destination
            const endInput = document.getElementById('end-addr');
            if (endInput && cache.endAddrLabel) endInput.value = cache.endAddrLabel;
            exactEndCoords = cache.endCoords;

            // Reconstruire le precomputedRoute depuis le cache
            const precomputed = {
                startCoords: cache.startCoords,
                endCoords: cache.endCoords,
                avoidTolls: cache.avoidTolls,
                osrmData: cache.osrmData,
            };

            // Afficher la route sur la carte
            const route0 = cache.osrmData.routes[0];
            setRouteLine(route0.geometry.coordinates);
            currentTurfLine = turf.lineString(route0.geometry.coordinates);

            // Ouvrir le modal de confirmation avec la route en mémoire
            modalPendingRoute = precomputed;
            modalStartCoords = cache.startCoords;
            modalEndCoords = cache.endCoords;

            // Lancer directement (la route est déjà calculée)
            startCourse('real', precomputed);

            document.getElementById('status').innerText = '🗺️ Reprise hors ligne — itinéraire en cache';
            document.getElementById('status').style.color = '#34d399';
        }

        // ── Interception de handleStartClick pour bloquer si hors ligne ──
        // On wrape la fonction après sa définition (voir plus bas dans le code)
        let _originalHandleStartClick = null;
        function _wrapHandleStartClickForOffline() {
            if (typeof handleStartClick === 'function' && !_originalHandleStartClick) {
                _originalHandleStartClick = handleStartClick;
                window.handleStartClick = function() {
                    if (!navigator.onLine && !isCourseStarted) {
                        showOfflineModal();
                        return;
                    }
                    _originalHandleStartClick.apply(this, arguments);
                };
            }
        }

        // ── Listeners réseau ──
        window.addEventListener('offline', () => {
            showConnectivityBanner(true);
            // Si en navigation : toast discret, pas de blocage
            if (isCourseStarted) {
                const toast = document.getElementById('offline-nav-toast');
                if (toast) toast.classList.add('visible');
            }
            console.log('[Offline] Connexion perdue');
        });

        window.addEventListener('online', () => {
            showConnectivityBanner(false);
            const toast = document.getElementById('offline-nav-toast');
            if (toast) toast.classList.remove('visible');
            console.log('[Offline] Connexion rétablie');
        });

        // État initial
        if (!navigator.onLine) {
            showConnectivityBanner(true);
            _updateOfflineUI(true);
        }

        // Wrap handleStartClick dès que le DOM est prêt
        window.addEventListener('load', () => {
            setTimeout(_wrapHandleStartClickForOffline, 100);
        });

        function showSafetyReminder() {
            const el = document.getElementById('safety-reminder-banner');
            if (!el) return;
            el.classList.add('visible');
            setTimeout(() => el.classList.remove('visible'), 4000);
        }

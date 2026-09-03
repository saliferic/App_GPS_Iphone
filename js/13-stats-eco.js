        // === FEATURE : "JE SUIS À 10 MIN" — NOTIFICATION WHATSAPP ===
        // ═══════════════════════════════════════════════════════════

        let tenMinEnabled = false;         // toggle activé par l'utilisateur
        let tenMinTriggered = false;       // évite de déclencher plusieurs fois par trajet
        let tenMinPhone = null;            // numéro du favori actif
        let tenMinDestName = null;         // nom du favori actif (pour le message)
        let tenMinRemainingMinutes = 10;   // temps restant réel au moment d'envoyer
        let activeFavIndex = null;         // index du favori chargé pour le trajet en cours

        // Charger le toggle depuis localStorage
        function loadTenMinSettings() {
            tenMinEnabled = localStorage.getItem('gps_tenmin_enabled') === 'true';
            const toggle = document.getElementById('tenmin-toggle');
            if (toggle) toggle.checked = tenMinEnabled;
            renderTenMinContactsList();
            const section = document.getElementById('tenmin-contacts-section');
            if (section) section.style.display = tenMinEnabled ? 'block' : 'none';
        }

        function onTenMinToggleChange() {
            tenMinEnabled = document.getElementById('tenmin-toggle').checked;
            localStorage.setItem('gps_tenmin_enabled', tenMinEnabled);
            const section = document.getElementById('tenmin-contacts-section');
            if (section) section.style.display = tenMinEnabled ? 'block' : 'none';
        }

        // Afficher la liste des favoris avec leurs contacts dans l'onglet profil
        function renderTenMinContactsList() {
            const container = document.getElementById('tenmin-contacts-list');
            if (!container) return;
            if (favorites.length === 0) {
                container.innerHTML = '<div style="color:#4a5568;font-size:12px;">Aucun favori enregistré.</div>';
                return;
            }
            container.innerHTML = favorites.map((fav, i) => `
                <div style="background:rgba(10,14,23,0.5);border:1px solid rgba(37,211,102,${fav.phone ? '0.2' : '0.07'});border-radius:10px;padding:10px 12px;">
                    <div style="font-size:13px;font-weight:700;color:${fav.phone ? '#25d366' : '#4a5568'};margin-bottom:4px;">
                        ${fav.phone ? '✅' : '📵'} ${fav.name}
                    </div>
                    <div style="font-size:12px;color:${fav.phone ? '#a8d5b5' : '#3a4a3e'};">
                        ${fav.phone || 'Aucun contact associé'}
                    </div>
                </div>
            `).join('');
        }

        // Afficher/masquer le champ téléphone quand un favori est sélectionné
        function updateFavPhoneUI(favIndex) {
            activeFavIndex = favIndex !== '' ? parseInt(favIndex) : null;
            const editBtn = document.getElementById('btn-edit-fav');
            if (editBtn) editBtn.style.display = (activeFavIndex !== null && favorites[activeFavIndex]) ? 'flex' : 'none';
        }

        // Sauvegarder le téléphone dans le favori sélectionné
        // Appelé au démarrage du trajet pour mémoriser le favori actif et son contact
        function initTenMinForTrip() {
            tenMinTriggered = false;
            tenMinPhone = null;
            tenMinDestName = null;
            if (activeFavIndex !== null && favorites[activeFavIndex]) {
                tenMinPhone = favorites[activeFavIndex].phone || null;
                tenMinDestName = favorites[activeFavIndex].name || null;
            }
        }

        // Vérifier à chaque tick de l'animation si on est à ≤ 10 min
        function checkTenMinAlert(remainingTimeHours) {
            if (!tenMinEnabled || !tenMinPhone) return;
            if (!isCourseStarted) return;
            const remainingMinutes = remainingTimeHours * 60;
            // Mettre à jour en continu le temps restant réel (pour le message dynamique)
            if (remainingMinutes > 0 && remainingMinutes <= 10) {
                tenMinRemainingMinutes = Math.max(1, Math.round(remainingMinutes));
                // Rafraîchir le texte de la bannière si elle est déjà visible
                const banner = document.getElementById('tenmin-banner');
                if (banner && banner.classList.contains('visible')) {
                    const msg = document.getElementById('tenmin-banner-msg');
                    if (msg) msg.textContent = `Préviens ${tenMinDestName || 'ton contact'} que tu arrives dans ~${tenMinRemainingMinutes} min.`;
                }
            }
            if (tenMinTriggered) return;
            if (remainingMinutes > 0 && remainingMinutes <= 10) {
                tenMinTriggered = true;
                triggerTenMinAlert();
            }
        }

        function triggerTenMinAlert() {
            // Notification push système
            if ('Notification' in window) {
                const send = () => new Notification('🕐 À 10 minutes !', {
                    body: `Préviens ${tenMinDestName || 'ton contact'} via WhatsApp.`,
                    icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">📱</text></svg>'
                });
                if (Notification.permission === 'granted') {
                    send();
                } else if (Notification.permission !== 'denied') {
                    Notification.requestPermission().then(p => { if (p === 'granted') send(); });
                }
            }
            // Bannière in-app : mise à jour du message si déjà visible, sinon affichage initial
            const msg = document.getElementById('tenmin-banner-msg');
            if (msg) msg.textContent = `Préviens ${tenMinDestName || 'ton contact'} que tu arrives dans ~${tenMinRemainingMinutes} min.`;
            const banner = document.getElementById('tenmin-banner');
            if (banner && !banner.classList.contains('visible')) banner.classList.add('visible');
        }

        function closeTenMinBanner() {
            const banner = document.getElementById('tenmin-banner');
            if (banner) banner.classList.remove('visible');
        }

        function sendTenMinWhatsApp() {
            if (!tenMinPhone) return;
            const phone = tenMinPhone.replace(/[^0-9+]/g, '');
            const dest = tenMinDestName || 'ma destination';
            const minutes = tenMinRemainingMinutes;
            const msg = encodeURIComponent(`Bonjour ! Je suis à environ ${minutes} minute${minutes > 1 ? 's' : ''} de ${dest}. À tout de suite ! 🚗`);
            window.open(`https://wa.me/${phone.replace('+', '')}?text=${msg}`, '_blank');
            closeTenMinBanner();
        }

        // Reset au stop du trajet
        function resetTenMin() {
            tenMinTriggered = false;
            closeTenMinBanner();
        }

        // Charger les settings au démarrage
        loadTenMinSettings();

        let profiles = []; let activeProfileId = null;
        // ═══════════════════════════════════════════════════════════════
        // === STATISTIQUES DE CONDUITE ===
        // ═══════════════════════════════════════════════════════════════

        function saveTripToHistory(trip) {
            let history = [];
            try { history = JSON.parse(localStorage.getItem('gps_trip_history') || '[]'); } catch (e) { if (DEBUG) console.warn("[saveTripToHistory] exception ignorée :", e); }
            // Le score archivé doit refléter ce qui a réellement été crédité (plancher 0),
            // sinon les cumuls et graphiques des statistiques afficheraient des pertes
            // que le profil n'a jamais subies.
            const entry = { ...trip, date: Date.now() };
            if (typeof entry.score === 'number') entry.score = clampTripScore(entry.score);
            history.push(entry);
            // Garder max 365 trajets
            if (history.length > 365) history = history.slice(-365);
            localStorage.setItem('gps_trip_history', JSON.stringify(history));
        }

        function getTripHistory() {
            try { return JSON.parse(localStorage.getItem('gps_trip_history') || '[]'); } catch(e) { return []; }
        }

        function filterTripsByPeriod(history, period) {
            const now = Date.now();
            const ms = period === 'week' ? 7 * 86400000 : period === 'month' ? 30 * 86400000 : Infinity;
            return history.filter(t => now - t.date <= ms);
        }

        /* ═══════════════════════════════════════════════════════════════
           === EMPREINTE CO2 (02/09/2026) ===
           ═══════════════════════════════════════════════════════════════

           Page pleine ouverte depuis « Vos informations » (PROFIL_SHEETS['co2']),
           même mécanique que « Historique des trajets ». Aucune saisie : le calcul
           réutilise `loadVehicleConfig()`/`getFuelKind()` (js/15) déjà renseignés
           dans « Mon véhicule », appliqués à `gps_trip_history` (même source que la
           page voisine). `calcCO2()` vit dans le noyau testable (js/00), voir son
           commentaire pour l'approximation qu'il assume : la config véhicule
           ACTUELLE est appliquée à des trajets parfois anciens, faute de trace du
           véhicule/carburant par trajet — même compromis que le coût carburant. */

        function _formatCO2(kg) {
            if (kg >= 1000) return (kg / 1000).toFixed(2).replace('.', ',') + ' t';
            return Math.round(kg) + ' kg';
        }

        function renderCO2Panel() {
            const host = document.getElementById('co2-panel-content');
            if (!host) return;
            host.innerHTML = '';

            const history = getTripHistory();
            if (!history.length) {
                const vide = document.createElement('div');
                vide.className = 'stats-empty';
                vide.textContent = 'Aucun trajet enregistré pour l’instant.';
                host.appendChild(vide);
                return;
            }

            const cfg = loadVehicleConfig();
            const fuelKind = (typeof getFuelKind === 'function') ? getFuelKind() : 'e10';

            const sommeCO2  = (trips) => trips.reduce((s, t) => s + calcCO2(Number(t.distKm) || 0, cfg, fuelKind), 0);
            const sommeDist = (trips) => trips.reduce((s, t) => s + (Number(t.distKm) || 0), 0);

            const tiles = document.createElement('div');
            tiles.className = 'trip-tiles';
            const tile = (valeur, label) => {
                const t = document.createElement('div'); t.className = 'trip-tile';
                const b = document.createElement('b'); b.textContent = valeur;
                const s = document.createElement('span'); s.textContent = label;
                t.appendChild(b); t.appendChild(s);
                tiles.appendChild(t);
            };
            tile(_formatCO2(sommeCO2(filterTripsByPeriod(history, 'week'))),  'cette semaine');
            tile(_formatCO2(sommeCO2(filterTripsByPeriod(history, 'month'))), 'ce mois-ci');
            tile(_formatCO2(sommeCO2(history)),                              'total');
            tile(formatTripDistance(sommeDist(history)),                     'distance couverte');
            host.appendChild(tiles);

            /* Explication repliée derrière un bouton ⓘ (02/09/2026, demande utilisateur :
               le texte fixe alourdissait visuellement une page qui n'est que 4 chiffres).
               ⚠ Repart caché à CHAQUE ouverture — `renderCO2Panel()` est rappelé par
               `onOpen`, donc rouvrir la page ne doit pas garder l'état de la fois
               précédente en mémoire ici, contrairement à `_thYear`/`_thMonth` qui, eux,
               décrivent une navigation qu'on veut retrouver. Un texte d'aide n'a pas
               cette raison d'être persistant. */
            const infoRow = document.createElement('div');
            infoRow.className = 'co2-info-row';
            const infoBtn = document.createElement('button');
            infoBtn.type = 'button';
            infoBtn.className = 'co2-info-btn';
            infoBtn.textContent = 'i';
            infoBtn.setAttribute('aria-label', 'Comment ce chiffre est calculé');
            infoRow.appendChild(infoBtn);
            host.appendChild(infoRow);

            /* Le carburant ne s'affiche que pour un véhicule qui en consomme :
               l'annoncer pour une électrique n'aurait aucun sens et suggérerait à
               tort qu'il compte dans le calcul. */
            const fuelLabel = (typeof FUEL_KIND_LABEL === 'object' && FUEL_KIND_LABEL[fuelKind]) || fuelKind.toUpperCase();
            const hint = document.createElement('div');
            hint.className = 'trip-option-hint';
            hint.hidden = true;
            hint.textContent = 'Estimation à partir de votre véhicule actuel (' + cfg.type +
                (cfg.type !== 'electrique' ? ', ' + fuelLabel : '') +
                ') appliqué à chaque trajet enregistré — pas une mesure directe : les trajets passés ne gardent pas la trace du véhicule ou du carburant utilisés au moment où ils ont eu lieu.';
            host.appendChild(hint);

            infoBtn.addEventListener('click', () => {
                hint.hidden = !hint.hidden;
                infoBtn.classList.toggle('co2-info-btn-active', !hint.hidden);
            });
        }

        /* ═══════════════════════════════════════════════════════════════
           === HISTORIQUE DES TRAJETS — LISTE DÉTAILLÉE (21/08/2026) ===
           ═══════════════════════════════════════════════════════════════

           `gps_trip_history` existait et se remplissait depuis longtemps, mais AUCUN
           écran ne montrait les trajets un par un : « Mes statistiques » n'en fait que
           des agrégats (KPI + courbes), où l'on ne peut désigner aucun trajet précis.
           Cette page comble ce manque et ne duplique rien — même source de données,
           lecture différente : la synthèse d'un côté, le relevé de l'autre.

           ⚠ CONSTRUCTION PAR NŒUDS, PAS PAR `innerHTML` — contrairement au reste du
           modal statistiques, et c'est délibéré : les seules chaînes affichées ici qui
           ne sont pas des nombres sont des ADRESSES, c'est-à-dire du texte tapé par
           l'utilisateur ou renvoyé par un géocodeur. Une adresse contenant `&` ou `<`
           casserait l'affichage en `innerHTML`. Les nombres du modal statistiques
           n'ont jamais posé ce problème, d'où la différence de traitement.

           La mise en forme (date, durée, distance, libellé de lieux) est dans
           `js/00-noyau-calculs.js` et couverte par `node tests/noyau.test.js` — ici il
           ne reste que du DOM. */

        /* ═══ CALENDRIER-MOIS (01/09/2026) ═══

           Remplace l'ancien repli année → mois → jour : celui-ci demandait plusieurs
           appuis pour atteindre un jour précis et ne montrait jamais la FORME du mois
           (quels jours ont roulé, lesquels non) sans tout déplier. Le calendrier répond
           aux deux d'un coup — un jour à problème (excès de vitesse) se repère à sa
           couleur avant même de l'ouvrir.

           ⚠ L'état de navigation (`_thYear`/`_thMonth`/`_thSelDay`) suit la même logique
           que l'ancien `_thOpen` : posé une seule fois au premier rendu, puis laissé au
           choix de l'utilisateur — changer de mois ou de jour sélectionné ne doit jamais
           être oublié entre deux ouvertures de la page. */
        let _thYear = null, _thMonth = null, _thSelDay = null;

        function _monthTrips(history, year, month) {
            return history
                .filter(t => {
                    const d = new Date(t.date);
                    return Number.isFinite(d.getTime()) && d.getFullYear() === year && d.getMonth() === month;
                })
                .sort((a, b) => (b.date || 0) - (a.date || 0));
        }

        /* Bornes de navigation du calendrier (02/09/2026) : le mois du PREMIER trajet
           connu (`history[0]`, le plus ancien conservé — l'historique est trié du plus
           ancien au plus récent) et le mois EN COURS. Sans ça, rien n'empêchait de
           remonter en 2019 dans une app installée hier : les cases vides d'un mois sans
           trajet n'annoncent pas « il n'y avait pas d'app ici », elles se lisent comme
           n'importe quel mois sans trajet. */
        function _monthBounds(history) {
            const now = new Date();
            let minY = now.getFullYear(), minM = now.getMonth();
            if (history.length) {
                const premier = new Date(history[0].date);
                if (Number.isFinite(premier.getTime())) {
                    minY = premier.getFullYear();
                    minM = premier.getMonth();
                }
            }
            return { minY, minM, maxY: now.getFullYear(), maxM: now.getMonth() };
        }

        // Compare deux couples année/mois : négatif si (y1,m1) est avant (y2,m2).
        function _cmpYM(y1, m1, y2, m2) { return (y1 * 12 + m1) - (y2 * 12 + m2); }

        function _shiftMonth(delta) {
            let m = _thMonth + delta, y = _thYear;
            if (m < 0) { m = 11; y -= 1; }
            else if (m > 11) { m = 0; y += 1; }
            const { minY, minM, maxY, maxM } = _monthBounds(getTripHistory());
            if (_cmpYM(y, m, minY, minM) < 0 || _cmpYM(y, m, maxY, maxM) > 0) return;
            _thYear = y; _thMonth = m; _thSelDay = null;
            renderTripHistory();
        }

        function renderTripHistory() {
            const host = document.getElementById('trip-history-list');
            if (!host) return;
            host.textContent = '';

            const history = getTripHistory();

            if (!history.length) {
                const vide = document.createElement('div');
                vide.className = 'stats-empty';
                vide.textContent = 'Aucun trajet enregistré pour le moment.';
                host.appendChild(vide);
                const aide = document.createElement('div');
                aide.className = 'trip-history-hint';
                aide.textContent = 'Chaque trajet terminé viendra s\'ajouter ici automatiquement.';
                host.appendChild(aide);
                return;
            }

            /* Mois par défaut : celui du trajet le plus récent — presque toujours le mois
               en cours, sans dépendre de l'horloge locale si le dernier trajet date d'un
               mois révolu (pas de trajet ce mois-ci). */
            if (_thYear === null) {
                const dernier = new Date(history[history.length - 1].date);
                const ref = Number.isFinite(dernier.getTime()) ? dernier : new Date();
                _thYear = ref.getFullYear();
                _thMonth = ref.getMonth();
            }

            const moisTrips = _monthTrips(history, _thYear, _thMonth);

            if (_thSelDay === null) {
                let dernierJour = null;
                moisTrips.forEach(t => {
                    const j = new Date(t.date).getDate();
                    if (dernierJour === null || j > dernierJour) dernierJour = j;
                });
                _thSelDay = dernierJour;
            }

            host.appendChild(_buildCalendarNav(history));
            host.appendChild(_buildMonthTiles(moisTrips));
            host.appendChild(_buildCalendarGrid(moisTrips));
            host.appendChild(_buildSelectedDaySection(moisTrips));
            host.appendChild(_buildTopPlaces(moisTrips));
        }

        function _buildCalendarNav(history) {
            const bar = document.createElement('div');
            bar.className = 'trip-cal-nav';
            const { minY, minM, maxY, maxM } = _monthBounds(history);

            const prev = document.createElement('button');
            prev.type = 'button'; prev.className = 'trip-cal-nav-btn'; prev.textContent = '‹';
            prev.setAttribute('aria-label', 'Mois précédent');
            prev.disabled = _cmpYM(_thYear, _thMonth, minY, minM) <= 0;
            prev.addEventListener('click', () => _shiftMonth(-1));

            const label = document.createElement('span');
            label.className = 'trip-cal-nav-label';
            label.textContent = `${TRIP_MOIS[_thMonth]} ${_thYear}`;

            const next = document.createElement('button');
            next.type = 'button'; next.className = 'trip-cal-nav-btn'; next.textContent = '›';
            next.setAttribute('aria-label', 'Mois suivant');
            next.disabled = _cmpYM(_thYear, _thMonth, maxY, maxM) >= 0;
            next.addEventListener('click', () => _shiftMonth(1));

            bar.appendChild(prev); bar.appendChild(label); bar.appendChild(next);
            return bar;
        }

        /* Quatre chiffres qui résument le mois affiché — pas le total de l'historique,
           qui vivrait mal la navigation (« pourquoi ce nombre ne bouge pas en changeant
           de mois ? »). */
        function _buildMonthTiles(trips) {
            const wrap = document.createElement('div');
            wrap.className = 'trip-tiles';

            const distTotal = trips.reduce((s, t) => s + (Number(t.distKm) || 0), 0);
            const dureeTotal = trips.reduce((s, t) => s + (Number(t.durationMin) || 0), 0);
            const ecoVals = trips.map(t => Number(t.ecoScore)).filter(Number.isFinite);
            const ecoMoy = ecoVals.length ? Math.round(ecoVals.reduce((s, v) => s + v, 0) / ecoVals.length) : null;

            const tile = (valeur, label) => {
                const t = document.createElement('div');
                t.className = 'trip-tile';
                const b = document.createElement('b'); b.textContent = valeur;
                const s = document.createElement('span'); s.textContent = label;
                t.appendChild(b); t.appendChild(s);
                wrap.appendChild(t);
            };
            tile(trips.length ? formatTripDistance(distTotal) : '—', 'distance');
            tile(String(trips.length), trips.length > 1 ? 'trajets' : 'trajet');
            tile(ecoMoy === null ? '—' : String(ecoMoy), 'éco moy.');
            tile(dureeTotal > 0 ? formatTripDuration(dureeTotal) : '—', 'conduite');
            return wrap;
        }

        function _buildCalendarGrid(trips) {
            const wrap = document.createElement('div');
            wrap.className = 'trip-cal';

            const dow = document.createElement('div');
            dow.className = 'trip-cal-dow';
            ['L', 'M', 'M', 'J', 'V', 'S', 'D'].forEach(j => {
                const s = document.createElement('span'); s.textContent = j; dow.appendChild(s);
            });
            wrap.appendChild(dow);

            const grid = document.createElement('div');
            grid.className = 'trip-cal-grid';

            const parJour = new Map();
            trips.forEach(t => {
                const j = new Date(t.date).getDate();
                if (!parJour.has(j)) parJour.set(j, []);
                parJour.get(j).push(t);
            });

            /* `getDay()` rend 0 pour dimanche ; le calendrier français ouvre sur lundi,
               d'où ce décalage plutôt qu'un simple tableau de 7 colonnes fixes. */
            const premier = new Date(_thYear, _thMonth, 1).getDay();
            const decalage = (premier + 6) % 7;
            for (let i = 0; i < decalage; i++) {
                const vide = document.createElement('div');
                vide.className = 'trip-cal-day empty';
                grid.appendChild(vide);
            }

            const nbJours = new Date(_thYear, _thMonth + 1, 0).getDate();
            for (let j = 1; j <= nbJours; j++) {
                const cell = document.createElement('button');
                cell.type = 'button';
                cell.className = 'trip-cal-day';

                const trajetsJour = parJour.get(j);
                if (trajetsJour) {
                    cell.classList.add('has-trips');
                    const exces = trajetsJour.some(t => t.hasSpeeded);
                    const ecoVals = trajetsJour.map(t => Number(t.ecoScore)).filter(Number.isFinite);
                    const ecoMoy = ecoVals.length ? ecoVals.reduce((s, v) => s + v, 0) / ecoVals.length : null;
                    cell.classList.add(exces ? 'lvl-bad' : (ecoMoy !== null && ecoMoy >= 80) ? 'lvl-good' : 'lvl-mid');
                }
                if (j === _thSelDay) cell.classList.add('sel');

                const num = document.createElement('span');
                num.className = 'trip-cal-day-num';
                num.textContent = String(j);
                cell.appendChild(num);
                if (trajetsJour) {
                    const dot = document.createElement('i');
                    dot.className = 'trip-cal-day-dot';
                    cell.appendChild(dot);
                }

                cell.addEventListener('click', () => {
                    _thSelDay = j;
                    renderTripHistory();
                });
                grid.appendChild(cell);
            }

            wrap.appendChild(grid);
            return wrap;
        }

        function _buildSelectedDaySection(moisTrips) {
            const wrap = document.createElement('div');
            wrap.className = 'trip-day-section';

            const titre = document.createElement('div');
            titre.className = 'trip-day-title';

            if (_thSelDay === null) {
                titre.textContent = 'Aucun trajet ce mois-ci';
                wrap.appendChild(titre);
                return wrap;
            }

            const jourTrips = moisTrips.filter(t => new Date(t.date).getDate() === _thSelDay);
            const label = formatTripDayLabel(new Date(_thYear, _thMonth, _thSelDay).getTime());
            titre.textContent = label === "Aujourd'hui" ? "Trajets d'aujourd'hui"
                : label === 'Hier' ? "Trajets d'hier"
                : `Trajets du ${label}`;
            wrap.appendChild(titre);

            if (!jourTrips.length) {
                const vide = document.createElement('div');
                vide.className = 'trip-history-hint';
                vide.textContent = 'Aucun trajet ce jour-là.';
                wrap.appendChild(vide);
                return wrap;
            }

            const liste = document.createElement('div');
            liste.className = 'trip-day-list';
            jourTrips.forEach(t => liste.appendChild(_buildTripRow(t)));
            wrap.appendChild(liste);
            return wrap;
        }

        /* Classement des adresses (départ ET arrivée confondus) sur le mois affiché —
           répond directement à « où je vais le plus souvent ». `tripPlacesLabel` fait déjà
           le travail de troncature d'adresse, on ne le refait pas ici. */
        function _buildTopPlaces(trips) {
            const wrap = document.createElement('div');
            wrap.className = 'trip-rank-section';
            if (!trips.length) return wrap;

            const compte = new Map();
            trips.forEach(t => {
                const places = tripPlacesLabel(t);
                [places.from, places.to].forEach(lieu => {
                    if (!lieu) return;
                    compte.set(lieu, (compte.get(lieu) || 0) + 1);
                });
            });
            if (!compte.size) return wrap;

            const classement = [...compte.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
            const max = classement[0][1];

            const titre = document.createElement('div');
            titre.className = 'trip-day-title';
            titre.textContent = 'Lieux les plus visités';
            wrap.appendChild(titre);

            const liste = document.createElement('div');
            liste.className = 'trip-rank';
            classement.forEach(([lieu, n], i) => {
                const row = document.createElement('div');
                row.className = 'trip-rank-row';

                const rang = document.createElement('span');
                rang.className = 'trip-rank-num';
                rang.textContent = String(i + 1);

                const body = document.createElement('div');
                body.className = 'trip-rank-body';
                const top = document.createElement('div');
                top.className = 'trip-rank-top';
                const nom = document.createElement('b');
                nom.textContent = lieu;
                const cnt = document.createElement('span');
                cnt.textContent = n > 1 ? `${n} trajets` : `${n} trajet`;
                top.appendChild(nom); top.appendChild(cnt);

                const barWrap = document.createElement('div');
                barWrap.className = 'trip-rank-bar';
                const bar = document.createElement('i');
                bar.style.width = Math.round((n / max) * 100) + '%';
                barWrap.appendChild(bar);

                body.appendChild(top); body.appendChild(barWrap);
                row.appendChild(rang); row.appendChild(body);
                liste.appendChild(row);
            });
            wrap.appendChild(liste);
            return wrap;
        }

        /* Une ligne = un en-tête toujours visible + un détail replié. Le détail n'est PAS
           construit à la demande : le replier/déplier doit être instantané, et une ligne
           de détail ne coûte que quelques nœuds. */
        function _buildTripRow(t) {
            const row = document.createElement('div');
            row.className = 'trip-row';

            const head = document.createElement('button');
            head.type = 'button';
            head.className = 'trip-row-head';
            head.setAttribute('aria-expanded', 'false');

            const gauche = document.createElement('div');
            gauche.className = 'trip-row-main';

            /* L'HEURE seule : la date est portée par l'intertitre du jour, juste au-dessus.
               La répéter sur chaque ligne remplirait la largeur utile d'une information
               déjà donnée, au détriment de l'adresse qui, elle, doit tenir. */
            const dateEl = document.createElement('div');
            dateEl.className = 'trip-row-date';
            dateEl.textContent = formatTripTime(t.date);
            gauche.appendChild(dateEl);

            /* `libelle` vaut null pour les entrées archivées AVANT que les lieux ne soient
               enregistrés (voir `tripPlacesLabel`). On n'affiche alors aucune ligne de
               lieu — plutôt que « undefined → undefined » ou une ligne vide qui laisserait
               croire à un bug. Le manque se comble de lui-même au fil des trajets. */
            const places = tripPlacesLabel(t);
            if (places.libelle) {
                const lieuEl = document.createElement('div');
                lieuEl.className = 'trip-row-places';
                lieuEl.textContent = places.libelle;
                gauche.appendChild(lieuEl);
            }

            const resume = document.createElement('div');
            resume.className = 'trip-row-summary';
            resume.textContent = `${formatTripDistance(t.distKm)} · ${formatTripDuration(t.durationMin)}`;
            gauche.appendChild(resume);

            const droite = document.createElement('div');
            droite.className = 'trip-row-score';

            /* Les points de score sont retirés de l'historique (demande utilisateur,
               29/08/2026) : ce système de points n'a plus cours dans l'app, ne pas le
               réafficher ici. `t.score` reste en stockage (pas de migration) et sert
               encore ailleurs (voir `stats-kpi-value` / graphique), non touchés. */

            /* Le drapeau de conduite parfaite est ce que l'utilisateur cherche en premier
               dans la liste — d'où sa place dans l'en-tête et non dans le détail. */
            const flag = document.createElement('div');
            flag.className = 'trip-row-flag ' + (t.hasSpeeded ? 'bad' : 'ok');
            flag.textContent = t.hasSpeeded ? 'Excès' : 'Parfait';
            droite.appendChild(flag);

            const chev = document.createElement('span');
            chev.className = 'trip-row-chevron';
            chev.textContent = '›';
            droite.appendChild(chev);

            head.appendChild(gauche);
            head.appendChild(droite);

            const detail = document.createElement('div');
            detail.className = 'trip-row-detail';
            _fillTripDetail(detail, t);

            head.addEventListener('click', () => {
                const ouvert = row.classList.toggle('open');
                head.setAttribute('aria-expanded', ouvert ? 'true' : 'false');
            });

            row.appendChild(head);
            row.appendChild(detail);
            return row;
        }

        /* ═══ RELANCER UN TRAJET DEPUIS L'HISTORIQUE (21/08/2026) ═══

           Le départ comme l'arrivée d'un trajet passé sont des destinations valables : on
           refait la même course, ou on rentre par où l'on est venu. Le geste NE
           réimplémente rien — il appelle `goToCoords()` (js/20), le parcours partagé avec
           « Go home » / « Go work », qui gère à lui seul les trois cas : à l'arrêt (aperçu
           de trajet), en roulant (changement de destination immédiat) et « vous y êtes
           déjà ». Voir l'avertissement en tête de js/20 : ce parcours ne se recopie pas.

           ⚠ IL FAUT QUITTER L'HISTORIQUE AVANT DE LANCER, sinon le geste paraît sans effet :
           l'aperçu de trajet s'ouvrirait DERRIÈRE la page pleine, qui couvre tout l'écran.
           Et on ne referme pas en retirant la classe de l'overlay — `closeProfilSheet()`
           seule sait rendre au panneau Profil le morceau de DOM qu'elle lui a emprunté. */
        function goToTripPlace(coords, label) {
            const ok = tenterSansBruit(() => {
                _leaveTripHistoryUI();
                /* `dejaLa` est formulé pour ce contexte : « Vous êtes déjà à votre
                   domicile » n'aurait aucun sens pour l'étape d'un trajet passé. */
                return goToCoords(coords, label, { dejaLa: 'Vous êtes déjà à cet endroit.' });
            }, 'historique/goToTripPlace');
            return ok === true;
        }

        /* En roulant, on ne rejoue PAS `switchMainTab('trajet')` : hors `nav-active` — le
           cas du trajet libre — il rouvrirait le panneau Itinéraire par-dessus la carte au
           milieu d'une course. On se contente alors de refermer ce qui est ouvert, et
           `goToCoords()` prend la suite par la branche « changement de destination ». */
        function _leaveTripHistoryUI() {
            tenterSansBruit(closeProfilSheet, 'historique/closeSheet');
            if (isCourseStarted) {
                tenterSansBruit(closeNavPanelOverlay, 'historique/closeNavOverlay');
                return;
            }
            tenterSansBruit(() => switchMainTab('trajet'), 'historique/switchTab');
        }

        /* Une extrémité du trajet : l'adresse COMPLÈTE (non tronquée, contrairement au
           libellé compact de l'en-tête) et, si le point est exploitable, le bouton qui y
           relance un trajet. Sans coordonnées — entrée d'avant leur archivage, ou départ
           saisi sans fix GPS — l'adresse reste affichée mais n'est pas actionnable : un
           bouton qui échouerait à l'appui vaut moins que pas de bouton. */
        function _buildTripEndpoint(host, role, label, coords) {
            if (!label && !coords) return;
            const ligne = document.createElement('div');
            ligne.className = 'trip-endpoint';

            const txt = document.createElement('div');
            txt.className = 'trip-endpoint-text';
            const r = document.createElement('div');
            r.className = 'trip-endpoint-role';
            r.textContent = role;
            const a = document.createElement('div');
            a.className = 'trip-endpoint-addr';
            a.textContent = label || 'Position enregistrée';
            txt.appendChild(r); txt.appendChild(a);
            ligne.appendChild(txt);

            if (coords) {
                const go = document.createElement('button');
                go.type = 'button';
                go.className = 'trip-endpoint-go';
                go.textContent = 'Y aller';
                go.title = `Lancer un trajet vers ${label || 'ce point'}`;
                go.addEventListener('click', ev => {
                    /* Le détail est le FRÈRE de l'en-tête dépliable, pas son enfant — un
                       bouton dans un bouton serait du HTML invalide —, donc rien ne
                       replierait la ligne ici aujourd'hui. `stopPropagation` protège le
                       jour où la ligne deviendrait cliquable dans son ensemble : le geste
                       « Y aller » ne doit jamais se doubler d'un repli. */
                    ev.stopPropagation();
                    goToTripPlace(coords, label || '');
                });
                ligne.appendChild(go);
            }
            host.appendChild(ligne);
        }

        function _fillTripDetail(host, t) {
            /* Les deux extrémités occupent toute la largeur, AVANT la grille de chiffres :
               ce sont elles qui portent l'action, et une adresse coupée en colonne d'une
               grille à deux colonnes serait illisible. */
            const bloc = document.createElement('div');
            bloc.className = 'trip-endpoints';
            _buildTripEndpoint(bloc, 'Départ', t.from || null, normalizeLngLat(t.fromCoords));
            _buildTripEndpoint(bloc, 'Arrivée', t.to || null, normalizeLngLat(t.toCoords));
            if (bloc.childNodes.length) host.appendChild(bloc);

            const cell = (label, valeur, couleur) => {
                const c = document.createElement('div');
                c.className = 'trip-detail-cell';
                const l = document.createElement('div');
                l.className = 'trip-detail-label';
                l.textContent = label;
                const v = document.createElement('div');
                v.className = 'trip-detail-value';
                v.textContent = valeur;
                if (couleur) v.style.color = couleur;
                c.appendChild(l); c.appendChild(v);
                host.appendChild(c);
            };

            const eco = Number(t.ecoScore);
            /* Les entrées d'avant l'éco-conduite n'ont pas ce champ : « — » plutôt qu'un
               0/100 qui accuserait à tort une conduite désastreuse. */
            const ecoTexte = Number.isFinite(eco) ? `${Math.round(eco)}/100` : '—';
            const ecoCouleur = Number.isFinite(eco)
                ? (eco >= 80 ? '#6FE3A0' : eco >= 50 ? '#FFB35C' : '#FF6B6B')
                : null;

            cell('Durée', formatTripDuration(t.durationMin));
            cell('Vitesse moy.', Number.isFinite(Number(t.avgSpeedKmh)) ? `${Math.round(t.avgSpeedKmh)} km/h` : '—');
            cell('Score éco', ecoTexte, ecoCouleur);
            const brusques = (Number(t.hardBrakings) || 0) + (Number(t.hardAccels) || 0);
            cell('Freinages / accél.', `${Number(t.hardBrakings) || 0} / ${Number(t.hardAccels) || 0}`,
                 brusques > 0 ? '#FFB35C' : '#6FE3A0');
        }

        /* `_thYear`/`_thMonth`/`_thSelDay` ne sont PAS réinitialisés ici : le mois et le
           jour consultés la fois précédente le restent. Seul le tout premier rendu choisit
           un mois et un jour par défaut (voir `renderTripHistory`). */
        function openTripHistory() {
            renderTripHistory();
        }

        /* `updateTripHistoryCount()` a disparu avec le compteur de la ligne « Historique
           des trajets » (22/08/2026), ainsi que ses trois appels — au chargement, à
           l'enregistrement d'un trajet, et au rendu de la page. Elle n'écrivait qu'un
           nombre que l'ouverture de la page donne déjà. */

        /* ═══ PAGES PLEINES DES SECTIONS DU PROFIL ═══

           Animaux sauvés, Mon véhicule et Aide à la conduite s'ouvrent en page pleine. Les
           trois s'ouvraient auparavant en accordéon,
           DANS le panneau Profil : leur contenu se dépliait sous le bouton, donc en bas d'une
           zone déjà remplie et désormais bornée à la moitié de l'écran (règle 50/50). Il
           fallait faire défiler pour atteindre ce qu'on venait d'ouvrir. Elles s'ouvrent
           maintenant en page pleine, comme « Mes statistiques ».

           ⚠ LE CONTENU EST DÉPLACÉ, JAMAIS RECOPIÉ. C'est le point à ne pas défaire : ces
           trois blocs sont pleins d'`id` uniques (champs de configuration véhicule, grille
           des animaux sauvés, interrupteurs trafic/voix/hotbox) que des dizaines de
           `getElementById` adressent depuis tout le code. Un clone créerait des id en double
           — `getElementById` rendrait alors le premier trouvé, c'est-à-dire l'exemplaire
           caché : on réglerait ses paramètres dans la page et rien ne se passerait.
           Déplacer le nœud garde un exemplaire unique, avec ses écouteurs et son état.

           La place d'origine est mémorisée par parent + frère suivant, et non par un index :
           un index deviendrait faux si un autre bloc était ajouté ou retiré entre-temps. */
        const PROFIL_SHEETS = {
            /* `dot: true` pose la puce blanche `.ui-dot` devant le titre (voir
               openProfilSheet), à la place du pictogramme emoji d'origine. Les quatre
               sections y sont passées ; le drapeau reste optionnel pour une entrée
               future qui voudrait garder un emoji dans `title`. */
            /* `title` accepte une FONCTION depuis le 26/08/2026 : la fiche du compagnon
               s'intitule du nom de l'animal, qui change avec lui. Les autres gardent une
               chaîne — un titre fixe n'a pas à devenir une fonction pour autant. */
            compagnon: { bodyId: 'compagnon-identite-body', title: () => titreIdentiteCompagnon(), dot: true,
                       onOpen: () => { try { renderIdentiteCompagnon(); } catch (e) { logAppError('profilSheet/renderIdentiteCompagnon', e); } } },
            animaux: { bodyId: 'animaux-sauves-body', title: 'Animaux sauvés', dot: true,
                       onOpen: () => { try { renderAnimauxSauves(); } catch (e) { logAppError('profilSheet/renderAnimauxSauves', e); } } },
            vehicle: { bodyId: 'vehicle-panel-body',  title: 'Mon véhicule', dot: true,
                       onOpen: () => { try { initVehicleConfigUI(); } catch (e) { logAppError('profilSheet/initVehicleConfigUI', e); } } },
            trips:   { bodyId: 'trip-history-body',   title: 'Historique des trajets', dot: true,
                       onOpen: () => { try { openTripHistory(); } catch (e) { logAppError('profilSheet/openTripHistory', e); } } },
            co2:     { bodyId: 'co2-panel-body',      title: 'Empreinte CO2', dot: true,
                       onOpen: () => { try { renderCO2Panel(); } catch (e) { logAppError('profilSheet/renderCO2Panel', e); } } },
            aide:    { bodyId: 'aide-conduite-body',  title: 'Aide à la conduite', dot: true },
            /* `onOpen` est indispensable ici, contrairement à `aide` : la liste des
               palettes est construite par le JS et n'existe pas dans le balisage.
               Sans elle, la page s'ouvrirait vide. renderThemePicker vit dans js/28,
               chargé APRÈS ce fichier — l'appel n'a lieu qu'à l'ouverture, donc bien
               après le chargement complet, et le `typeof` couvre le cas où js/28
               aurait échoué au chargement. */
            theme:   { bodyId: 'theme-panel-body',    title: 'Thème', dot: true,
                       onOpen: () => { if (typeof renderThemePicker === 'function') {
                           try { renderThemePicker(); } catch (e) { logAppError('profilSheet/renderThemePicker', e); }
                       } } }
        };

        let _profilSheetOpen = null;   // { bodyEl, parent, next }

        function openProfilSheet(key) {
            const def = PROFIL_SHEETS[key];
            if (!def) return;
            const overlay = document.getElementById('profil-sheet-overlay');
            const host    = document.getElementById('profil-sheet-body');
            const bodyEl  = document.getElementById(def.bodyId);
            if (!overlay || !host || !bodyEl) return;

            // Une seule page à la fois : on referme proprement l'éventuelle précédente,
            // sinon son contenu resterait orphelin dans l'hôte et ne retrouverait
            // jamais sa place dans le panneau.
            if (_profilSheetOpen) closeProfilSheet();

            _profilSheetOpen = { bodyEl, parent: bodyEl.parentNode, next: bodyEl.nextSibling };
            host.appendChild(bodyEl);
            /* Ces trois corps sont masqués par une règle CSS d'accordéon (`display: none`
               levé par `.open` sur la section parente, ou style inline pour le véhicule).
               Sortis de leur section, ils ne verraient plus jamais cette levée : la classe
               .in-profil-sheet rétablit l'affichage sans toucher aux règles d'origine, qui
               restent valables pour le contenu remis en place. */
            bodyEl.classList.add('in-profil-sheet');

            /* Titre reconstruit nœud par nœud plutôt qu'en `innerHTML` : le libellé reste
               un nœud texte, donc insensible à un `<` ou un `&` qui apparaîtrait un jour
               dans un titre de section. */
            const titleEl = document.getElementById('profil-sheet-title');
            titleEl.textContent = '';
            if (def.dot) {
                const puce = document.createElement('span');
                puce.className = 'ui-dot';
                titleEl.appendChild(puce);
            }
            /* Le titre peut être une fonction (voir PROFIL_SHEETS) : on l'appelle À
               L'OUVERTURE, jamais au chargement du fichier — c'est tout l'intérêt, il doit
               dire l'état du moment. Le `try` évite qu'un titre bavard empêche l'ouverture
               de la page : mieux vaut un intitulé générique qu'un écran qui ne s'ouvre pas. */
            let libelle = def.title;
            if (typeof libelle === 'function') {
                libelle = tenterSansBruit(() => def.title(), 'profilSheet/titre') || 'Mon compagnon';
            }
            titleEl.appendChild(document.createTextNode(libelle));
            overlay.classList.add('open');
            host.scrollTop = 0;
            if (def.onOpen) def.onOpen();
        }

        function closeProfilSheet() {
            const overlay = document.getElementById('profil-sheet-overlay');
            if (overlay) overlay.classList.remove('open');
            if (!_profilSheetOpen) return;
            const { bodyEl, parent, next } = _profilSheetOpen;
            _profilSheetOpen = null;
            bodyEl.classList.remove('in-profil-sheet');
            // `insertBefore` avec un frère nul équivaut à `appendChild` : le cas du bloc
            // qui était le dernier de sa section est donc couvert sans branche séparée.
            try { parent.insertBefore(bodyEl, next); } catch (e) { logAppError('closeProfilSheet', e); }
        }

        let _statsPeriod = 'week';

        function openStatsModal() {
            document.getElementById('stats-modal-overlay').classList.add('open');
            renderStatsModal();
        }
        function closeStatsModal() {
            document.getElementById('stats-modal-overlay').classList.remove('open');
        }
        function setStatsPeriod(period) {
            _statsPeriod = period;
            ['week','month','all'].forEach(p => {
                document.getElementById(`stats-btn-${p}`).classList.toggle('active', p === period);
            });
            renderStatsModal();
        }

        function renderStatsModal() {
            const all = getTripHistory();
            const trips = filterTripsByPeriod(all, _statsPeriod);

            // --- KPIs ---
            const kpiGrid = document.getElementById('stats-kpi-grid');
            if (trips.length === 0) {
                kpiGrid.innerHTML = '';
                document.getElementById('stats-score-chart').innerHTML = '<div class="stats-empty">Aucun trajet sur cette période.</div>';
                document.getElementById('stats-km-chart').innerHTML = '';
                return;
            }

            const totalKm    = trips.reduce((s, t) => s + (t.distKm || 0), 0);
            const totalScore = trips.reduce((s, t) => s + (t.score || 0), 0);
            const totalMin   = trips.reduce((s, t) => s + (t.durationMin || 0), 0);
            const perfect    = trips.filter(t => !t.hasSpeeded).length;
            const avgSpeed   = trips.reduce((s, t) => s + (t.avgSpeedKmh || 0), 0) / trips.length;
            const pctPerfect = Math.round((perfect / trips.length) * 100);
            const avgEco     = Math.round(trips.filter(t => t.ecoScore != null).reduce((s, t) => s + t.ecoScore, 0) / Math.max(1, trips.filter(t => t.ecoScore != null).length));
            const totalBrake = trips.reduce((s, t) => s + (t.hardBrakings || 0), 0);
            const totalAccel = trips.reduce((s, t) => s + (t.hardAccels || 0), 0);
            const ecoColor   = avgEco >= 80 ? '#28a745' : avgEco >= 50 ? '#f39c12' : '#e74c3c';

            kpiGrid.innerHTML = `
                <div class="stats-kpi">
                    <div class="stats-kpi-label">Trajets</div>
                    <div class="stats-kpi-value">${trips.length}<span class="stats-kpi-unit">trajets</span></div>
                </div>
                <div class="stats-kpi">
                    <div class="stats-kpi-label">Kilomètres</div>
                    <div class="stats-kpi-value">${totalKm.toFixed(1)}<span class="stats-kpi-unit">km</span></div>
                </div>
                <div class="stats-kpi">
                    <div class="stats-kpi-label">Score total</div>
                    <div class="stats-kpi-value">${totalScore.toFixed(0)}<span class="stats-kpi-unit">pts</span></div>
                </div>
                <div class="stats-kpi">
                    <div class="stats-kpi-label">Conduite parfaite</div>
                    <div class="stats-kpi-value">${pctPerfect}<span class="stats-kpi-unit">%</span></div>
                </div>
                <div class="stats-kpi">
                    <div class="stats-kpi-label">Temps total</div>
                    <div class="stats-kpi-value">${Math.round(totalMin)}<span class="stats-kpi-unit">min</span></div>
                </div>
                <div class="stats-kpi">
                    <div class="stats-kpi-label">Vitesse moy.</div>
                    <div class="stats-kpi-value">${Math.round(avgSpeed)}<span class="stats-kpi-unit">km/h</span></div>
                </div>
                <div class="stats-kpi" style="border-color:${ecoColor}33;">
                    <div class="stats-kpi-label">Score éco moy.</div>
                    <div class="stats-kpi-value" style="color:${ecoColor}">${avgEco}<span class="stats-kpi-unit">/100</span></div>
                </div>
                <div class="stats-kpi">
                    <div class="stats-kpi-label">Événements brusques</div>
                    <div class="stats-kpi-value" style="color:${totalBrake+totalAccel>0?'#f39c12':'#28a745'}">${totalBrake + totalAccel}<span class="stats-kpi-unit">total</span></div>
                </div>
            `;

            // --- Graphique score ---
            document.getElementById('stats-score-chart').innerHTML = renderLineChart(
                trips.slice(-20).map(t => ({ v: t.score || 0, d: t.date, bad: t.hasSpeeded })),
                'score', 'pts'
            );

            // --- Graphique éco ---
            const ecoTrips = trips.filter(t => t.ecoScore != null);
            const ecoSection = document.getElementById('stats-eco-section');
            const ecoChart   = document.getElementById('stats-eco-chart');
            if (ecoSection && ecoChart) {
                if (ecoTrips.length > 0) {
                    ecoSection.style.display = '';
                    ecoChart.innerHTML = renderLineChart(
                        ecoTrips.slice(-20).map(t => ({ v: t.ecoScore, d: t.date, bad: t.ecoScore < 70 })),
                        'eco', '/100'
                    );
                } else {
                    ecoSection.style.display = 'none';
                }
            }

            // --- Graphique km ---
            document.getElementById('stats-km-chart').innerHTML = renderBarChart(
                trips.slice(-20).map(t => ({ v: t.distKm || 0, d: t.date })),
                'km'
            );
        }

        function renderLineChart(data, key, unit) {
            if (!data.length) return '<div class="stats-empty">Pas de données.</div>';

            // Cas spécial : un seul point → carte info plutôt que courbe vide
            if (data.length === 1) {
                const d = data[0];
                const dt = new Date(d.d);
                const lbl = `${dt.getDate()}/${dt.getMonth() + 1} à ${dt.getHours()}h${String(dt.getMinutes()).padStart(2,'0')}`;
                const color = d.bad ? '#f85149' : '#4da3ff';
                return `<div style="padding:14px;text-align:center;">
                    <div style="font-size:28px;font-weight:800;color:${color}">${Number.isInteger(d.v) ? d.v : d.v.toFixed(1)}<span style="font-size:13px;color:#4a5568;margin-left:4px;">${unit}</span></div>
                    <div style="font-size:11px;color:#4a5568;margin-top:4px;">Trajet du ${lbl}</div>
                    <div style="font-size:10px;color:#4a5568;margin-top:8px;">Effectue d'autres trajets pour voir l'évolution 📈</div>
                </div>`;
            }

            const W = 420, H = 130, PAD = { t: 20, r: 16, b: 32, l: 40 };
            const vals = data.map(d => d.v);
            const maxV = Math.max(...vals, 1), minV = Math.min(...vals, 0);
            const range = maxV - minV || 1;
            const xStep = (W - PAD.l - PAD.r) / Math.max(data.length - 1, 1);
            const yScale = v => PAD.t + (H - PAD.t - PAD.b) * (1 - (v - minV) / range);
            const xScale = i => PAD.l + i * xStep;

            const pts = data.map((d, i) => `${xScale(i).toFixed(1)},${yScale(d.v).toFixed(1)}`).join(' ');
            const first = `${xScale(0).toFixed(1)},${(H - PAD.b).toFixed(1)}`;
            const last  = `${xScale(data.length - 1).toFixed(1)},${(H - PAD.b).toFixed(1)}`;
            const area  = `${first} ${pts} ${last}`;

            // Grille Y (3 niveaux)
            let yGrid = '';
            for (let i = 0; i <= 2; i++) {
                const v = minV + (range * i / 2);
                const y = yScale(v).toFixed(1);
                yGrid += `<line x1="${PAD.l}" y1="${y}" x2="${W - PAD.r}" y2="${y}" stroke="rgba(0,140,255,0.07)" stroke-width="1" stroke-dasharray="3,3"/>`;
                yGrid += `<text x="${PAD.l - 6}" y="${parseFloat(y) + 4}" fill="#4a5568" font-size="9" text-anchor="end">${v.toFixed(0)}</text>`;
            }

            // Points + valeur affichée au-dessus de chaque point
            const dots = data.map((d, i) => {
                const cx = xScale(i).toFixed(1), cy = yScale(d.v).toFixed(1);
                const color = d.bad ? '#f85149' : '#4da3ff';
                const valY = (parseFloat(cy) - 7).toFixed(1);
                const valStr = Number.isInteger(d.v) ? d.v : d.v.toFixed(1);
                // Afficher la valeur seulement si pas trop serré (max 8 points)
                const showVal = data.length <= 8;
                return `<circle cx="${cx}" cy="${cy}" r="3.5" fill="${color}" stroke="#0a0e17" stroke-width="1.5"/>
                    ${showVal ? `<text x="${cx}" y="${valY}" fill="${color}" font-size="8" font-weight="700" text-anchor="middle">${valStr}${unit}</text>` : ''}`;
            }).join('');

            // Labels X : date + heure si peu de points, sinon date seule
            const step = Math.ceil(data.length / 6);
            const xLabels = data.map((d, i) => {
                if (i % step !== 0 && i !== data.length - 1) return '';
                const dt = new Date(d.d);
                const lbl = data.length <= 5
                    ? `${dt.getDate()}/${dt.getMonth() + 1} ${dt.getHours()}h`
                    : `${dt.getDate()}/${dt.getMonth() + 1}`;
                return `<text x="${xScale(i).toFixed(1)}" y="${H - 6}" fill="#4a5568" font-size="9" text-anchor="middle">${lbl}</text>`;
            }).join('');

            return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
                ${yGrid}
                <polyline points="${area}" fill="rgba(0,120,255,0.07)" stroke="none"/>
                <polyline points="${pts}" fill="none" stroke="#4da3ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
                ${dots}
                ${xLabels}
            </svg>`;
        }

        function renderBarChart(data, unit) {
            if (!data.length) return '<div class="stats-empty">Pas de données.</div>';

            // Cas spécial : un seul point
            if (data.length === 1) {
                const d = data[0];
                const dt = new Date(d.d);
                const lbl = `${dt.getDate()}/${dt.getMonth() + 1} à ${dt.getHours()}h${String(dt.getMinutes()).padStart(2,'0')}`;
                return `<div style="padding:14px;text-align:center;">
                    <div style="font-size:28px;font-weight:800;color:#58a6ff">${d.v.toFixed(1)}<span style="font-size:13px;color:#4a5568;margin-left:4px;">${unit}</span></div>
                    <div style="font-size:11px;color:#4a5568;margin-top:4px;">Trajet du ${lbl}</div>
                </div>`;
            }

            const W = 420, H = 110, PAD = { t: 24, r: 16, b: 32, l: 40 };
            const vals = data.map(d => d.v);
            const maxV = Math.max(...vals, 1);
            const barW = Math.max(6, Math.min(28, (W - PAD.l - PAD.r) / data.length - 3));
            const xStep = (W - PAD.l - PAD.r) / Math.max(data.length, 1);
            const yH = v => ((H - PAD.t - PAD.b) * v / maxV);

            const bars = data.map((d, i) => {
                const x = (PAD.l + i * xStep + xStep / 2 - barW / 2).toFixed(1);
                const h = Math.max(2, yH(d.v)).toFixed(1);
                const y = (H - PAD.b - parseFloat(h)).toFixed(1);
                const showVal = data.length <= 8;
                const valY = (parseFloat(y) - 4).toFixed(1);
                return `<rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="rgba(88,166,255,0.5)" stroke="rgba(0,140,255,0.35)" stroke-width="0.5"/>
                    ${showVal ? `<text x="${(parseFloat(x) + barW/2).toFixed(1)}" y="${valY}" fill="#58a6ff" font-size="8" font-weight="700" text-anchor="middle">${d.v.toFixed(1)}</text>` : ''}`;
            }).join('');

            // Grille Y
            let yGrid = '';
            for (let i = 0; i <= 2; i++) {
                const v = maxV * i / 2;
                const y = (H - PAD.b - yH(v)).toFixed(1);
                yGrid += `<line x1="${PAD.l}" y1="${y}" x2="${W - PAD.r}" y2="${y}" stroke="rgba(0,140,255,0.07)" stroke-width="1" stroke-dasharray="3,3"/>`;
                yGrid += `<text x="${PAD.l - 6}" y="${parseFloat(y) + 4}" fill="#4a5568" font-size="9" text-anchor="end">${v.toFixed(0)}</text>`;
            }

            const step = Math.ceil(data.length / 6);
            const xLabels = data.map((d, i) => {
                if (i % step !== 0 && i !== data.length - 1) return '';
                const dt = new Date(d.d);
                const lbl = data.length <= 5
                    ? `${dt.getDate()}/${dt.getMonth() + 1} ${dt.getHours()}h`
                    : `${dt.getDate()}/${dt.getMonth() + 1}`;
                const x = (PAD.l + i * xStep + xStep / 2).toFixed(1);
                return `<text x="${x}" y="${H - 6}" fill="#4a5568" font-size="9" text-anchor="middle">${lbl}</text>`;
            }).join('');

            return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
                ${yGrid}
                ${bars}
                ${xLabels}
            </svg>`;
        }

        // ═══════════════════════════════════════════════════════════════
        // === ÉCO-CONDUITE : ACCÉLÉROMÈTRE ===
        // ═══════════════════════════════════════════════════════════════

        let _ecoMotionActive = false;
        let _ecoGravity = { x: 0, y: 0, z: 9.81 }; // gravité estimée par filtre passe-bas
        let _ecoLin     = { x: 0, y: 0, z: 0 };    // accélération linéaire lissée (anti-vibration)

        // --- Réglage de sensibilité (seul curseur à toucher pour ajuster) ---
        // 1.0 = normal. Augmenter = moins sensible (moins de détections).
        const ECO_SENSITIVITY = 1.0;

        // Constantes de temps des deux filtres, en SECONDES (et non en coefficient fixe :
        // le taux d'échantillonnage de DeviceMotion varie d'un appareil à l'autre, un alpha
        // en dur ne donne pas le même filtrage sur tous les téléphones).
        //  - TAU_GRAVITY long  : isole réellement la gravité (composante quasi statique).
        //    Calibré à 5 s : en dessous (1–2 s), le filtre "avale" progressivement un freinage
        //    soutenu et il n'en reste qu'une fraction au bout d'1,5 s → faux négatifs.
        //  - TAU_LINEAR court  : laisse passer un freinage (0,3–1 Hz) mais écrase les
        //    vibrations de chaussée (pavés : 10–50 Hz), atténuées d'un facteur ~30 à 100.
        // L'ancien réglage (alpha 0.85 ≈ 100 ms) faisait exactement l'inverse : il se comportait
        // en passe-haut à 1,6 Hz, donc il AMPLIFIAIT les pavés et ATTÉNUAIT les vrais freinages.
        const ECO_TAU_GRAVITY = 5.0;
        const ECO_TAU_LINEAR  = 0.12;

        const ECO_THRESHOLD_BRAKE = 3.5 * ECO_SENSITIVITY;  // m/s² → freinage brusque
        const ECO_THRESHOLD_ACCEL = 3.0 * ECO_SENSITIVITY;  // m/s² → accélération brutale
        const ECO_MIN_DURATION_MS = 350;  // un événement doit DURER : un choc ponctuel est un nid-de-poule
        const ECO_MIN_SPEED_DELTA = 4;    // km/h de variation GPS exigée pour confirmer
        const ECO_COOLDOWN_MS     = 1200; // délai min entre deux événements (évite les doublons)
        const ECO_PENALTY_SCORE   = 0.8;  // points retirés au score éco par événement (sur 100)
        const ECO_PENALTY_MAIN    = 0.3;  // points retirés au score principal par événement
        let _ecoLastEventMs = 0;
        let _ecoOverSince   = 0;    // début de la phase au-dessus du seuil (0 = pas en cours)
        let _ecoLastMotionMs = 0;
        let _ecoSpeedHistory = [];  // [{t, v}] sur ~2 s, pour corroborer avec le GPS

        /* ══════════════════════════════════════════════════════════════════
           LES MARQUEURS DE DIAGNOSTIC DE LA DÉTECTION      (31/08/2026)
           ------------------------------------------------------------------
           La détection franchit six portes et SORT EN SILENCE à chacune : un
           freinage qui ne produit aucun toast ne dit pas laquelle l'a arrêté.
           Sur le téléphone, où se font les vrais essais, il n'y a par ailleurs
           aucune console — le « [Éco] Accéléromètre actif » de
           `startEcoMotionTracking()` n'y a jamais été lisible par personne.

           ⚠ `logDiag()`, JAMAIS `console.log()` : même règle qu'en js/16. Le
           journal se lit dans l'app, bouton 🩺 du panneau Profil.

           ⚠ UN MARQUEUR PAR TRAJET, PAS UN PAR MESURE. `gps_diag_log` ne garde
           que 12 entrées (`DIAG_LOG_MAX`, js/01) : un log par événement
           `devicemotion` — soit plusieurs dizaines par seconde — chasserait du
           journal tout le reste, y compris ce qu'on est venu y chercher. D'où
           les drapeaux à déclenchement unique ci-dessous, remis à zéro au
           départ du trajet : cinq lignes au plus par essai. */
        let _ecoDiagVu     = false;  // une mesure du capteur est arrivée
        let _ecoDiagSeuil  = false;  // la magnitude a franchi le seuil
        let _ecoDiagDuree  = false;  // elle a tenu les 350 ms exigées
        let _ecoDiagRefus  = false;  // le GPS a refusé de confirmer
        let _ecoDiagEvt    = false;  // la chaîne est allée au bout
        let _ecoDiagMagMax = 0;      // la plus forte magnitude du trajet

        function startEcoMotionTracking() {
            if (_ecoMotionActive) return;
            // Repartir d'un état propre : sans ça, la gravité estimée et l'historique de vitesse
            // du trajet précédent provoquent une fausse détection dans les premières secondes.
            _ecoGravity = { x: 0, y: 0, z: 9.81 };
            _ecoLin     = { x: 0, y: 0, z: 0 };
            _ecoLastMotionMs = 0;
            _ecoOverSince = 0;
            _ecoLastEventMs = 0;
            _ecoSpeedHistory = [];
            /* Les drapeaux de diagnostic repartent avec le trajet : sans ça, le
               deuxième essai d'une session serait muet et on croirait à une panne. */
            _ecoDiagVu = _ecoDiagSeuil = _ecoDiagDuree = _ecoDiagRefus = _ecoDiagEvt = false;
            _ecoDiagMagMax = 0;
            const start = () => {
                window.addEventListener('devicemotion', _onDeviceMotion, { passive: true });
                _ecoMotionActive = true;
                console.log('[Éco] Accéléromètre actif');
                logDiag('eco-capteur', { etat: 'ecoute-posee' });
            };
            // iOS 13+ : demande de permission obligatoire
            if (typeof DeviceMotionEvent !== 'undefined' &&
                typeof DeviceMotionEvent.requestPermission === 'function') {
                DeviceMotionEvent.requestPermission()
                    /* ⚠ UN REFUS NE LÈVE RIEN : `requestPermission()` TIENT sa
                       promesse avec 'denied'. Le `.catch()` seul ne voyait donc
                       jamais le cas le plus courant — il n'attrape qu'une erreur
                       d'appel (geste utilisateur manquant). Les deux sont
                       journalisés séparément, ils ne se corrigent pas pareil. */
                    .then(state => {
                        if (state === 'granted') { start(); return; }
                        console.log('[Éco] Permission accéléromètre refusée');
                        logDiag('eco-capteur', { etat: 'permission-refusee', reponse: String(state) });
                    })
                    .catch(e => {
                        console.log('[Éco] Demande de permission impossible');
                        logDiag('eco-capteur', { etat: 'demande-impossible', err: String(e && e.message || e) });
                    });
            } else if (typeof DeviceMotionEvent !== 'undefined') {
                start();
            } else {
                console.log('[Éco] DeviceMotionEvent non supporté sur ce navigateur');
                logDiag('eco-capteur', { etat: 'non-supporte' });
            }
        }

        function stopEcoMotionTracking() {
            window.removeEventListener('devicemotion', _onDeviceMotion);
            _ecoMotionActive = false;
            /* LE BILAN DU TRAJET — la ligne à lire en premier quand rien ne s'est
               déclenché. Le record de magnitude tranche la question que les autres
               marqueurs laissent ouverte : à 0, le capteur n'a rien mesuré (support,
               permission, WebView) ; juste sous le seuil, c'est le seuil qui est trop
               haut pour ce montage ; bien au-dessus alors qu'aucun `eco-duree` n'a été
               posé, la secousse était trop brève. Écrit à l'arrêt du suivi, donc une
               seule fois par trajet — et seulement si le capteur a parlé, pour ne pas
               remplir le journal quand la course n'a jamais démarré. */
            if (_ecoDiagVu) {
                logDiag('eco-bilan', {
                    magMax: +_ecoDiagMagMax.toFixed(2),
                    seuilFrein: ECO_THRESHOLD_BRAKE,
                    seuilPasse: _ecoDiagSeuil,
                    dureeTenue: _ecoDiagDuree,
                    gpsRefus:   _ecoDiagRefus,
                    evenement:  _ecoDiagEvt
                });
            }
        }

        function _onDeviceMotion(event) {
            /* ⚠ AVANT LES GARDES, PAS APRÈS. Placé plus bas, ce marqueur serait
               muet dans les deux cas qu'on cherche justement à distinguer : un
               capteur silencieux, et un capteur qui parle à une app qui n'écoute
               pas (trajet non lancé, ou téléphone à l'arrêt sous les 5 km/h). */
            if (!_ecoDiagVu) {
                _ecoDiagVu = true;
                const a0 = event && event.accelerationIncludingGravity;
                logDiag('eco-capteur', {
                    etat: 'premiere-mesure',
                    valeurs: a0 && a0.x != null ? 'oui' : 'VIDES',
                    trajet: !!isCourseStarted,
                    vitesse: drivers.length ? Math.round(drivers[0].actualSpeed) : null
                });
            }
            if (!isCourseStarted || drivers.length === 0) return;
            const d = drivers[0];
            if (d.finished || d.actualSpeed < 5) return; // ignorer à l'arrêt

            const acc = event.accelerationIncludingGravity;
            if (!acc || acc.x == null) return;

            const now = Date.now();
            // Amorçage : le téléphone est dans un support, sa gravité n'est pas alignée sur Z.
            // Sans amorçage, le filtre met ~3 s à converger et l'écart initial serait lu comme
            // une accélération linéaire massive → fausse détection au démarrage du trajet.
            if (!_ecoLastMotionMs) {
                _ecoGravity = { x: acc.x, y: acc.y, z: acc.z };
                _ecoLin = { x: 0, y: 0, z: 0 };
                _ecoLastMotionMs = now;
                return;
            }
            // Pas de temps réel entre deux mesures → filtres indépendants de la cadence du capteur
            let dt = (now - _ecoLastMotionMs) / 1000;
            _ecoLastMotionMs = now;
            if (dt <= 0 || dt > 0.5) dt = 0.016; // écart aberrant (onglet en veille) → valeur nominale

            const aG = Math.exp(-dt / ECO_TAU_GRAVITY);
            const aL = Math.exp(-dt / ECO_TAU_LINEAR);

            // 1) Passe-bas lent : isole la gravité (composante quasi statique)
            _ecoGravity.x = aG * _ecoGravity.x + (1 - aG) * acc.x;
            _ecoGravity.y = aG * _ecoGravity.y + (1 - aG) * acc.y;
            _ecoGravity.z = aG * _ecoGravity.z + (1 - aG) * acc.z;

            // 2) Accélération linéaire brute (gravité retirée)
            const rx = acc.x - _ecoGravity.x;
            const ry = acc.y - _ecoGravity.y;
            const rz = acc.z - _ecoGravity.z;

            // 3) Passe-bas rapide : élimine les vibrations de chaussée (pavés, joints, rails)
            _ecoLin.x = aL * _ecoLin.x + (1 - aL) * rx;
            _ecoLin.y = aL * _ecoLin.y + (1 - aL) * ry;
            _ecoLin.z = aL * _ecoLin.z + (1 - aL) * rz;

            // 4) Projection dans le plan horizontal.
            // Un pavé secoue le téléphone SUIVANT la verticale ; un freinage agit dans le plan
            // de la route. En retirant la composante parallèle à la gravité, on supprime la
            // quasi-totalité de l'énergie des chocs de chaussée. L'ancienne norme 3D comptait
            // au contraire les secousses verticales à 100 % comme du freinage.
            const gN = Math.sqrt(_ecoGravity.x ** 2 + _ecoGravity.y ** 2 + _ecoGravity.z ** 2) || 9.81;
            const gx = _ecoGravity.x / gN, gy = _ecoGravity.y / gN, gz = _ecoGravity.z / gN;
            const dot = _ecoLin.x * gx + _ecoLin.y * gy + _ecoLin.z * gz; // composante verticale
            const hx = _ecoLin.x - dot * gx;
            const hy = _ecoLin.y - dot * gy;
            const hz = _ecoLin.z - dot * gz;
            const magnitude = Math.sqrt(hx * hx + hy * hy + hz * hz);

            // Dead Reckoning Inertiel : Ajustement dynamique de la vitesse sous tunnel / sans GPS via l'accéléromètre
            const msSinceLastGps = now - lastGpsUpdateTime;
            if (_positionIsEstimated || gpsSignalLost || msSinceLastGps > 3000) {
                const accelLong = Math.abs(hy) > 0.2 ? hy : 0;
                const deltaKmh = accelLong * dt * 3.6;
                /* ⚠ UNE INTÉGRATION NE SE CORRIGE JAMAIS TOUTE SEULE (17/08/2026).
                   On cumule ici une accélération mesurée par un capteur qui a un biais, un
                   bruit, et une orientation supposée. Chaque erreur, même minuscule, est
                   ajoutée pour de bon : sur une traversée d'une minute, la vitesse estimée
                   part en pente douce et ne redescend pas. Le seul plafond était la limite du
                   tronçon + 25, soit 95 km/h dans un tunnel à 70 — l'ordre de grandeur relevé
                   à l'écran en sortie de traversée.
                   La borne utile n'est pas la limite légale mais LA VITESSE QU'ON AVAIT EN
                   ENTRANT : sous un tunnel on ne fait ni demi-tour ni arrêt-buffet, on garde
                   son allure à peu de chose près. On autorise donc une dérive de ±25 % autour
                   d'elle — assez pour suivre une vraie décélération de bouchon ou une reprise,
                   trop peu pour inventer 40 km/h de plus.
                   ⚠ LA BORNE EST DISSYMÉTRIQUE, ET C'EST VOULU : plancher à 0, pas à −25 %.
                   Les deux erreurs n'ont pas le même prix. Sous-estimer fait avancer le point
                   estimé moins vite que la voiture — il reste en arrière, on le rattrape à la
                   sortie. Surestimer le fait courir DEVANT : les annonces de manœuvre tombent
                   trop tôt et la position sort du tunnel avant le conducteur. Et un bouchon
                   dans un tunnel n'a rien d'exceptionnel : lui interdire de ralentir jusqu'à
                   l'arrêt serait refuser le cas le plus banal pour se protéger d'un biais.
                   `_drSpeedAtLoss` vaut 0 hors perte déclarée (simple absence de fix > 3 s) :
                   on retombe alors sur l'ancien plafond, faute de référence fiable. */
                const ref = _drSpeedAtLoss;
                const plafond = ref > 0 ? ref * 1.25 : (currentSpeedLimitKmh || 50) + 25;
                lastKnownSpeedKmh = Math.max(0, Math.min(plafond, lastKnownSpeedKmh + deltaKmh));
            }

            // Historique de vitesse GPS sur ~2 s (sert de confirmation)
            _ecoSpeedHistory.push({ t: now, v: d.actualSpeed });
            while (_ecoSpeedHistory.length && now - _ecoSpeedHistory[0].t > 2000) _ecoSpeedHistory.shift();

            const threshold = Math.min(ECO_THRESHOLD_BRAKE, ECO_THRESHOLD_ACCEL);

            // 5) Exigence de DURÉE : un vrai freinage dure plusieurs centaines de ms.
            // Un choc isolé (nid-de-poule, pavé, téléphone qui bouge dans son support) est bref.
            /* Le record du trajet, gardé même quand rien ne se déclenche : c'est
               lui qui distingue « le seuil est trop haut » (record à 3,2 quand il
               en faut 3,5) de « le capteur ne mesure rien » (record à 0,1). */
            if (magnitude > _ecoDiagMagMax) _ecoDiagMagMax = magnitude;
            if (magnitude < threshold) { _ecoOverSince = 0; return; }
            if (!_ecoDiagSeuil) {
                _ecoDiagSeuil = true;
                logDiag('eco-seuil', { mag: +magnitude.toFixed(2), seuil: threshold });
            }
            if (!_ecoOverSince) { _ecoOverSince = now; return; }
            if (now - _ecoOverSince < ECO_MIN_DURATION_MS) return;
            if (!_ecoDiagDuree) {
                _ecoDiagDuree = true;
                logDiag('eco-duree', { mag: +magnitude.toFixed(2), ms: now - _ecoOverSince });
            }

            if (now - _ecoLastEventMs < ECO_COOLDOWN_MS) return;

            // 6) Confirmation par le GPS : c'est le filtre décisif.
            // Sur des pavés, la vitesse ne bouge pas. Un vrai freinage/accélération se traduit
            // forcément par une variation de vitesse mesurable.
            const oldest = _ecoSpeedHistory[0];
            const deltaKmh = oldest ? (d.actualSpeed - oldest.v) : 0;
            if (Math.abs(deltaKmh) < ECO_MIN_SPEED_DELTA) {
                /* La porte la plus sévère sur un freinage de test : la secousse est
                   là, mais le GPS (~1 Hz, lissé) n'a pas vu passer 4 km/h en 2 s. */
                if (!_ecoDiagRefus) {
                    _ecoDiagRefus = true;
                    logDiag('eco-gps-refus', {
                        mag: +magnitude.toFixed(2),
                        deltaKmh: +deltaKmh.toFixed(1),
                        exige: ECO_MIN_SPEED_DELTA,
                        mesures: _ecoSpeedHistory.length
                    });
                }
                return;
            }

            _ecoOverSince = 0;
            _ecoLastEventMs = now;
            /* Une seule ligne par trajet : les suivants se comptent dans
               `hardBrakings` / `hardAccels`, le journal n'a pas à les répéter. */
            if (!_ecoDiagEvt) {
                _ecoDiagEvt = true;
                logDiag('eco-evenement', {
                    type: deltaKmh < 0 ? 'freinage' : 'acceleration',
                    mag: +magnitude.toFixed(2), deltaKmh: +deltaKmh.toFixed(1)
                });
            }

            // 7) Le SIGNE de la variation de vitesse détermine le type d'événement.
            // L'ancienne version déduisait le type de l'amplitude (>4 = freinage, >3.5 =
            // accélération), ce qui n'a pas de sens physique : une norme est toujours positive.
            if (deltaKmh < 0) {
                if (magnitude < ECO_THRESHOLD_BRAKE) return;
                d.hardBrakings++;
                _applyEcoPenalty(d, 'brake', magnitude);
                _showEcoAlert('🛑 Freinage brusque', magnitude);
            } else {
                if (magnitude < ECO_THRESHOLD_ACCEL) return;
                d.hardAccels++;
                _applyEcoPenalty(d, 'accel', magnitude);
                _showEcoAlert('⚡ Accélération brusque', magnitude);
            }
        }

        function _applyEcoPenalty(d, type, magnitude) {
            const threshold = type === 'brake' ? ECO_THRESHOLD_BRAKE : ECO_THRESHOLD_ACCEL;
            const factor = Math.min(2, magnitude / threshold);
            d.ecoScore = Math.max(0, d.ecoScore - ECO_PENALTY_SCORE * factor);
            d.score    = Math.max(d.score - ECO_PENALTY_MAIN * factor, d.score - 5);
            /* Un à-coup secoue aussi le compagnon. Le même `factor` sert aux deux :
               la vie et le score doivent punir la même chose avec la même intensité,
               sinon la barre raconte une autre histoire que les points. */
            if (drivers.length > 0 && d.id === drivers[0].id && window.VieCompagnon) {
                VieCompagnon.choc(factor);
                d.vieMinTrajet = Math.min(d.vieMinTrajet !== undefined ? d.vieMinTrajet : 100, VieCompagnon.valeur());
            }
            // Mise à jour affichage score éco dans le profil
            const ptsEl = document.getElementById(`pts-${d.id}`);
            if (ptsEl) { ptsEl.innerText = Math.max(0, d.score).toFixed(3); ptsEl.style.color = d.score < 0 ? '#ff6b6b' : '#4da3ff'; }
            updateEcoScoreBadge(d);
            // Mise à jour compteur live (si option activée)
            if (ecoCounterEnabled) {
                const brakeEl = document.getElementById('eco-brake-count');
                const accelEl = document.getElementById('eco-accel-count');
                const scoreEl = document.getElementById('eco-score-counter');
                if (brakeEl) brakeEl.textContent = d.hardBrakings;
                if (accelEl) accelEl.textContent = d.hardAccels;
                if (scoreEl) {
                    const s = Math.round(d.ecoScore);
                    scoreEl.textContent = s;
                    scoreEl.style.color = s >= 80 ? '#28a745' : s >= 50 ? '#f39c12' : '#e74c3c';
                }
            }
        }

        let _ecoAlertTimer = null;
        function _showEcoAlert(msg, magnitude) {
            let toast = document.getElementById('eco-alert-toast');
            if (!toast) return;
            toast.textContent = `${msg} (${magnitude.toFixed(1)} m/s²)`;
            toast.classList.add('visible');
            clearTimeout(_ecoAlertTimer);
            _ecoAlertTimer = setTimeout(() => toast.classList.remove('visible'), 2500);
        }

        function updateEcoScoreBadge(d) {
            const el = document.getElementById('eco-score-live');
            if (!el) return;
            const score = Math.round(d?.ecoScore ?? 100);
            const color = score >= 80 ? '#28a745' : score >= 50 ? '#f39c12' : '#e74c3c';
            el.textContent = score;
            el.style.color = color;
        }

        /* ⚠ PURGE PONCTUELLE DES POINTS DE SIMULATION (01/09/2026). Avant le correctif de
           `stopCourse()` (js/19), rejouer « Simulation Salif » créditait le profil actif
           exactement comme un vrai trajet — aucune marque ne distingue, dans les points déjà
           accumulés, ceux gagnés en simulation de ceux gagnés en conduisant. Impossible de
           purger sélectivement : on remet tous les profils à 0 pt une seule fois, au premier
           chargement qui suit ce correctif. Le verrou `gps_sim_points_purged` empêche que
           cette remise à zéro ne se reproduise à chaque démarrage. */
        function _purgerPointsSimulationUneFois() {
            if (localStorage.getItem('gps_sim_points_purged')) return;
            let changed = false;
            profiles.forEach(p => { if (p.totalPoints) { p.totalPoints = 0; changed = true; } });
            if (changed) saveProfilesToStorage();
            localStorage.setItem('gps_sim_points_purged', '1');
        }

        function loadProfilesFromStorage() {
            const stored = localStorage.getItem('gps_profiles');
            if (stored) { try { profiles = JSON.parse(stored); } catch(e) { profiles = []; } }
            _purgerPointsSimulationUneFois();
            const lastActive = localStorage.getItem('gps_active_profile_id');
            if (lastActive && profiles.some(p => p.id === lastActive)) activeProfileId = lastActive;
            renderProfilesDropdown(); updateProfileSummary();
            updateWelcomeMessage();
        }
        // Nom affiché sur l'écran de bienvenue (1,5 s au démarrage) : celui du profil
        // actif, pour que plusieurs profils sur le même appareil se reconnaissent
        // chacun au lancement. Pas de profil actif -> repli générique.
        function updateWelcomeMessage() {
            const el = document.getElementById('welcome-message-name');
            if (!el) return;
            const profile = profiles.find(p => p.id === activeProfileId);
            el.textContent = profile ? `Salut ${profile.name},` : 'Salut utilisateur,';
        }
        function saveProfilesToStorage() { localStorage.setItem('gps_profiles', JSON.stringify(profiles)); }
        function renderProfilesDropdown() {
            const dropdown = document.getElementById('profile-dropdown');
            dropdown.innerHTML = profiles.length === 0 ? '<option value="">Aucun profil créé</option>' : '<option value="">Choisir un profil...</option>';
            profiles.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id; opt.textContent = `${p.name} (${p.totalPoints.toFixed(2)} pts)`; dropdown.appendChild(opt);
            });
            dropdown.value = activeProfileId || "";
            _syncProfileDropdownLabel();
            _renderProfileDropdownMenu();
            _syncProfilHeroTitle();
        }

        // Le titre en tête de l'onglet Profil affiche le nom du profil ACTIF (28/08/2026,
        // demande utilisateur) — plus le mot générique « Moi ». Appelée depuis
        // renderProfilesDropdown(), donc à jour après sélection, création ou suppression.
        function _syncProfilHeroTitle() {
            const el = document.getElementById('profil-itin-title');
            if (!el) return;
            const profile = profiles.find(p => p.id === activeProfileId);
            el.textContent = profile ? profile.name : 'Moi';
        }

        /* ═══════════════════════════════════════════════════════════════════════════
           MENU DÉROULANT PERSONNALISÉ DU PROFIL — suppression PAR LIGNE (22/08/2026)
           ═══════════════════════════════════════════════════════════════════════════
           Le `<select>` natif fait TOUJOURS foi (`#profile-dropdown` reste dans le DOM,
           masqué) : ce bloc n'ajoute qu'une présentation, il ne duplique aucun état. Un
           <option> natif est du texte pur — impossible d'y poser un bouton — d'où ce
           calque. ⚠ Le trash externe qui vivait à côté du sélecteur a été retiré le jour
           même : un doublon de `deleteProfileById()` juste à côté de ce menu n'avait plus
           sa place, chaque ligne portant désormais sa propre suppression. */
        function _syncProfileDropdownLabel() {
            const select = document.getElementById('profile-dropdown');
            const label  = document.getElementById('profile-dropdown-trigger-label');
            if (!select || !label) return;
            const opt = select.options[select.selectedIndex];
            label.textContent = opt ? opt.textContent : 'Aucun profil créé';
        }

        function _renderProfileDropdownMenu() {
            const menu = document.getElementById('profile-dropdown-menu');
            if (!menu) return;
            menu.innerHTML = '';
            if (profiles.length === 0) {
                const vide = document.createElement('div');
                vide.className = 'addr-suggestion';
                vide.style.cursor = 'default';
                vide.textContent = 'Aucun profil créé';
                menu.appendChild(vide);
                return;
            }
            profiles.forEach(p => {
                const row = document.createElement('div');
                row.className = 'profile-menu-row' + (p.id === activeProfileId ? ' active' : '');

                const name = document.createElement('span');
                name.className = 'profile-menu-name';
                name.textContent = `${p.name} (${p.totalPoints.toFixed(2)} pts)`;
                name.onclick = () => { selectProfile(p.id); closeProfileDropdownMenu(); };

                const del = document.createElement('button');
                del.type = 'button';
                del.className = 'profile-menu-delete';
                del.title = `Supprimer « ${p.name} »`;
                del.innerHTML = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>';
                // stopPropagation : sinon ce clic remonterait jusqu'à l'écouteur « clic
                // extérieur » et refermerait le menu juste avant que confirm() s'ouvre.
                del.onclick = (e) => { e.stopPropagation(); deleteProfileById(p.id); };

                row.appendChild(name);
                row.appendChild(del);
                menu.appendChild(row);
            });
        }

        function toggleProfileDropdownMenu() {
            const menu = document.getElementById('profile-dropdown-menu');
            if (!menu) return;
            if (menu.style.display === 'block') { closeProfileDropdownMenu(); return; }
            _renderProfileDropdownMenu();
            menu.style.display = 'block';
            const chevron = document.getElementById('profile-dropdown-chevron');
            if (chevron) chevron.style.transform = 'rotate(180deg)';
            /* Écouteur posé à l'OUVERTURE et retiré à la fermeture, plutôt qu'un unique
               `{ once: true }` : ce dernier se serait consommé sur le clic qui ouvre le
               menu lui-même (il bulle jusqu'à `document` dans le même événement) et le
               premier vrai clic extérieur suivant n'aurait plus rien à fermer. */
            document.addEventListener('click', _onProfileDropdownOutsideClick);
        }
        function closeProfileDropdownMenu() {
            const menu = document.getElementById('profile-dropdown-menu');
            if (menu) menu.style.display = 'none';
            const chevron = document.getElementById('profile-dropdown-chevron');
            if (chevron) chevron.style.transform = '';
            document.removeEventListener('click', _onProfileDropdownOutsideClick);
        }
        function _onProfileDropdownOutsideClick(e) {
            const row = document.getElementById('profile-select-row');
            if (row && !row.contains(e.target)) closeProfileDropdownMenu();
        }
        // Éléments à masquer pendant la saisie du prénom
        const _PROFIL_MASK_IDS = [
            'profil-section-title-monprofil',
            'compagnon-carte',
            'profil-group-title-animaux',
            'animaux-a-sauver-section',
            'animaux-sauves-section',
            'profil-group-title-infos',
            'vehicle-panel-section',
            'aide-conduite-section',
            'eco-score-bar',
            'drivers-container',
            'profil-options-trajet',
            'backup-section',
            /* 'profil-itin-title' est devenu 'profil-hero' (24/08/2026) : le titre est
               maintenant enveloppé avec le bouton « + » de création. Masquer le seul
               <h2> aurait laissé ce « + » flotter tout seul au-dessus du formulaire. */
            'profil-hero',
            'profil-stats',
            /* Ajoutées le 23/08/2026 : ces lignes ouvrent des écrans qui parlent du profil
               ACTIF. Les laisser visibles pendant la création d'un compte invitait à
               consulter le classement ou l'historique de quelqu'un d'autre au milieu d'une
               saisie de mot de passe. Elles étaient trois : `stats-section` est partie
               avec la ligne « Mes statistiques » (26/08/2026). */
            'classement-section',
            'trip-history-section',
            /* Deux oublis rattrapés le 03/09/2026 (signalés par l'utilisateur : « ils
               n'ont pas leur place ici »). Chaque ligne ajoutée à la page Profil doit
               être ajoutée ICI aussi — c'est le pas de côté facile, et il ne se voit
               qu'en ouvrant la création de compte, écran qu'on ne retraverse plus une
               fois son profil créé.
               `co2-panel-section` parle du profil ACTIF, même raison que les deux
               au-dessus. `theme-section`, elle, est un réglage global — mais la laisser
               permettait de repeindre tout l'écran au milieu d'une saisie de mot de
               passe, ce qui n'est ni utile ni rassurant. */
            'co2-panel-section',
            'theme-section'
        ];
        function showCreateProfileInline() {
            // Le bouton "+" est un voisin du menu déroulant DANS la même ligne : un clic
            // dessus ne déclenche pas l'écouteur « clic extérieur » et laisserait sinon le
            // menu ouvert derrière le formulaire de création.
            closeProfileDropdownMenu();
            // Masquer le contenu de la page Profil (sauf la ligne de sélection)
            _PROFIL_MASK_IDS.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
            document.getElementById('create-profile-inline').style.display = 'block';
            document.getElementById('btn-show-create-profile').style.display = 'none';
            /* Le contenu dépend de la session Supabase : formulaire pseudo/mot de passe
               si personne n'est connecté, actions de compte sinon. On le (re)construit à
               chaque ouverture — la session peut avoir expiré depuis la dernière. */
            if (typeof renderProfilCompteBloc === 'function') renderProfilCompteBloc();
            // Libère la hauteur plancher de l'onglet : le panneau se resserre sur le
            // formulaire et remonte au-dessus du clavier (voir #ui-panel.profile-focus).
            const panel = document.getElementById('ui-panel');
            if (panel) panel.classList.add('profile-focus');
            const premier = document.getElementById('profil-pseudo');
            if (premier) premier.focus();   // absent quand un compte est déjà connecté
        }
        function hideCreateProfileInline() {
            document.getElementById('create-profile-inline').style.display = 'none';
            document.getElementById('btn-show-create-profile').style.display = '';
            /* Le formulaire est reconstruit à chaque ouverture : le vider ici suffit à ne
               pas laisser un mot de passe en clair dans le DOM d'un panneau replié. */
            const bloc = document.getElementById('profil-compte-bloc');
            if (bloc) bloc.innerHTML = '';
            const st = document.getElementById('profil-compte-statut');
            if (st) { st.textContent = ''; st.className = 'cl-status'; }
            const panel = document.getElementById('ui-panel');
            if (panel) panel.classList.remove('profile-focus');
            // Réafficher tout le contenu de la page Profil
            _PROFIL_MASK_IDS.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = '';
            });
        }
        /* `nomFourni` (23/08/2026) : le champ « Prénom » n'existe plus dans la page — le
           nom vient maintenant du pseudo du compte, ou de la saisie du formulaire de
           compte pour un profil local sans compte. L'argument évite de dupliquer ici la
           création du profil et la question « l'utiliser maintenant ? ». */
        function createProfile(nomFourni) {
            const input = document.getElementById('new-profile-name');
            const name = String(nomFourni != null ? nomFourni : (input ? input.value : '')).trim();
            if (!name) { if (input) input.focus(); return; }
            const id = 'profil_' + Date.now();
            profiles.push({ id, name, totalPoints: 0 });
            saveProfilesToStorage();
            renderProfilesDropdown();
            /* Le profil actif ne bouge PAS à ce stade : la bascule n'a lieu que si
               l'utilisateur répond « Oui » à la question posée juste après. Points,
               badges et objectifs étant cloisonnés par profil, un changement subi
               donnerait l'impression d'avoir perdu sa progression. */
            document.getElementById('profile-dropdown').value = activeProfileId || '';
            hideCreateProfileInline();
            openProfileUseConfirm(id, name);
        }

        // Profil créé mais pas encore activé, en attente de la réponse oui/non
        let _pendingNewProfileId = null;

        function openProfileUseConfirm(id, name) {
            _pendingNewProfileId = id;
            const current = profiles.find(p => p.id === activeProfileId);
            document.getElementById('profile-use-title').textContent =
                `Utiliser le profil « ${name} » maintenant ?`;
            document.getElementById('profile-use-sub').textContent = current
                ? `« ${current.name} » est actif : il redeviendra sélectionnable à tout moment dans la liste des profils.`
                : `Aucun profil n'est actif pour le moment.`;
            document.getElementById('profile-use-overlay').classList.add('open');
        }

        function confirmUseNewProfile(useIt) {
            const id = _pendingNewProfileId;
            _pendingNewProfileId = null;
            document.getElementById('profile-use-overlay').classList.remove('open');
            // « Non » (ou clic hors de la boîte) : le profil reste dans la liste, sans devenir actif.
            if (useIt && id) selectProfile(id);
        }
        function selectProfile(id) {
            activeProfileId = id || null;
            if (activeProfileId) localStorage.setItem('gps_active_profile_id', activeProfileId);
            else localStorage.removeItem('gps_active_profile_id');
            document.getElementById('profile-dropdown').value = activeProfileId || "";
            _syncProfileDropdownLabel();
            updateProfileSummary();
            // Recharger badges et objectifs liés au nouveau profil actif
            renderCarteCompagnon();
            renderWeeklyGoalsPanel();
            updateWeeklyGoalsButton();
            // Rafraîchir la galerie (re-render si ouverte, sinon juste le compteur)
            /* La page « Animaux sauvés » dépend du profil : un autre joueur n'a pas
               sauvé les mêmes bêtes. Elle ne se repeint que si elle est ouverte. */
            if (typeof rafraichirAnimauxSauves === 'function') rafraichirAnimauxSauves();
            if (typeof rafraichirIdentiteCompagnon === 'function') rafraichirIdentiteCompagnon();
        }
        function updateProfileSummary() {
            const summaryEl = document.getElementById('profile-summary');
            const profile = profiles.find(p => p.id === activeProfileId);
            if (summaryEl) summaryEl.innerText = profile ? `👤 ${profile.name} — ${profile.totalPoints.toFixed(2)} pts cumulés` : "👤 Aucun profil sélectionné";
        }
        /* Seule fonction de suppression, appelée depuis l'icône 🗑 de chaque ligne du
           menu déroulant (`_renderProfileDropdownMenu()`). Le trash externe qui exigeait
           une sélection préalable a été retiré (22/08/2026) : celui-ci n'exige rien,
           c'était tout son intérêt. `renderProfilesDropdown()` referme la boucle en
           redessinant aussi bien le `<select>` que le menu — la ligne supprimée
           disparaît donc du menu resté ouvert, sans rechargement complet. */
        function deleteProfileById(id) {
            const statusBox = document.getElementById('status');
            const profile = profiles.find(p => p.id === id);
            if (!profile) return;
            if (!confirm(`Supprimer le profil "${profile.name}" et ses ${profile.totalPoints.toFixed(2)} points cumulés ?`)) return;
            profiles = profiles.filter(p => p.id !== id);
            saveProfilesToStorage();
            if (activeProfileId === id) selectProfile(null);
            renderProfilesDropdown();
            if (statusBox) { statusBox.innerText = `🗑️ Profil supprimé : ${profile.name}`; statusBox.style.color = "#ff6b6b"; }
        }
        // Plafond bas du score de trajet : un mauvais trajet rapporte 0, jamais moins.
        // Sans ce garde-fou, une erreur de limitation (ex. zone 30 mal détectée) pouvait
        // amputer un capital de plusieurs centaines de points accumulés sur des semaines.
        // Le total cumulé du profil ne doit donc jamais diminuer.
        function clampTripScore(score) {
            return (Number.isFinite(score) && score > 0) ? score : 0;
        }

        function addPointsToActiveProfile(points) {
            if (!activeProfileId) return;
            // Verrou de dernier recours : tous les chemins d'attribution convergent ici,
            // donc c'est le seul endroit qui garantit qu'aucun total ne peut baisser.
            const gained = clampTripScore(points);
            if (gained <= 0) return;
            const profile = profiles.find(p => p.id === activeProfileId);
            if (!profile) return;
            profile.totalPoints += gained;
            saveProfilesToStorage(); renderProfilesDropdown(); updateProfileSummary();
            /* ⚠ PLUS RIEN NE PART VERS LE CLASSEMENT D'ICI (25/08/2026). Le classement
               ne compte plus des points mais des ANIMAUX SAUVÉS : son unique point
               d'entrée est désormais `clAnimauxMaj()`, appelé par `synchroniserParcours()`
               (js/12), là où un parcours peut se terminer. Les points gardent tous leurs
               autres rôles — total du profil, butin, objectifs — ils ne classent plus. */
        }
        loadProfilesFromStorage();

        /* ═══════════════════════════════════════════════════════════════════════════
           PREMIER LANCEMENT — CRÉATION DU PROFIL (23/08/2026)
           ═══════════════════════════════════════════════════════════════════════════
           Aucun profil en mémoire = l'app vient d'être installée. On ouvre d'office
           l'onglet Profil sur le formulaire de compte, plutôt que de laisser un
           « Aucun profil créé » que personne ne va chercher : sans profil, les points,
           les badges et le classement n'ont nulle part où aller.

           ⚠ LE DÉLAI N'EST PAS COSMÉTIQUE. `switchMainTab()` vit dans le fichier 14,
           chargé APRÈS celui-ci : l'appeler tout de suite lèverait un ReferenceError au
           top-level, ce qui interromprait l'évaluation de la fin de CE fichier (piège
           documenté dans AGENTS.md). Le setTimeout sort du fil de chargement, et sa
           durée cale l'ouverture sur la fin de l'écran de bienvenue (2 s + 0,8 s de
           fondu, voir #welcome-screen dans styles.css).

           Le bouton « Annuler » reste actif : on ne séquestre pas le conducteur dans un
           formulaire, et « Continuer sans compte » est le chemin prévu pour qui n'en
           veut pas. Le formulaire se rouvre par le « + » du sélecteur. */
        setTimeout(() => {
            try {
                if (profiles.length > 0) return;
                if (typeof switchMainTab === 'function') switchMainTab('profil');
                showCreateProfileInline();
            } catch (e) { logAppError('profil/premierLancement', e); }
        }, 2900);
        // Initialiser badges et objectifs APRÈS chargement des profils (activeProfileId connu)
        updateWeeklyGoalsButton();
        renderCarteCompagnon();

        async function requestWakeLock() {
            try { if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen'); } 
            catch (err) { console.warn(`Anti-veille inactif: ${err.message}`); }
        }
        function releaseWakeLock() { if (wakeLock !== null) { wakeLock.release(); wakeLock = null; } }

        // Le Wake Lock est relâché automatiquement par le navigateur quand l'app passe en arrière-plan
        // (écran éteint, changement d'appli). On le redemande dès que l'app redevient visible,
        // pour ne pas obliger le conducteur à ressaisir son téléphone en pleine conduite.
        document.addEventListener('visibilitychange', async () => {
            if (document.visibilityState === 'visible' && isCourseStarted && wakeLock === null) {
                await requestWakeLock();
            }
        });

        let lastZoomChangeTime = 0;
        
        function updateDynamicZoom(speedKmh, lat, lng, bearing = 0) {
            let targetZoom = currentDynamicZoom;
            if (currentDynamicZoom === 17) { if (speedKmh > 45) targetZoom = speedKmh > 90 ? 13 : 15; }
            else if (currentDynamicZoom === 13) { if (speedKmh < 80) targetZoom = speedKmh < 35 ? 17 : 15; }
            else {
                if (speedKmh < 35) targetZoom = 17;
                else if (speedKmh > 90) targetZoom = 13;
                else targetZoom = 15;
            }

            // === ZOOM DE MANŒUVRE (junction view) ===
            // En approche d'une sortie d'autoroute, bifurcation ou rond-point, on zoome davantage
            // pour aider le conducteur à bien voir la manœuvre (comme Google Maps).
            // Le zoom se fait progressivement en arrivant à < 300m, et revient à la normale après.
            if (isCourseStarted && currentStepIndex < routeSteps.length) {
                const step = routeSteps[currentStepIndex];
                const distToManeuverM = stepArrivalDist[currentStepIndex] - (drivers.length > 0 ? drivers[0].dist * 1000 : 0);
                const maneuverType = step.maneuver.type;
                const isComplexManeuver = (
                    maneuverType === 'off ramp' || maneuverType === 'on ramp' ||
                    maneuverType === 'roundabout' || maneuverType === 'rotary' ||
                    maneuverType === 'fork' || maneuverType === 'merge' ||
                    (maneuverType === 'turn' && speedKmh > 60)
                );
                if (isComplexManeuver && distToManeuverM > 0 && distToManeuverM < 300) {
                    // Zoom progressif : de 16 (à 300m) jusqu'à 17.5 (à 50m)
                    const zoomBoost = 16 + Math.max(0, (1 - distToManeuverM / 300)) * 1.5;
                    targetZoom = Math.max(targetZoom, zoomBoost);
                }
            }

            const now = Date.now();
            const isManeuverZoom = isCourseStarted && targetZoom > 16;
            // Le cooldown de 3s évite les sauts de zoom trop fréquents en conduite normale,
            // mais ne doit pas bloquer le zoom de manœuvre (qui est prioritaire et progressif).
            if (!isManeuverZoom && targetZoom !== currentDynamicZoom && now - lastZoomChangeTime < 3000) targetZoom = currentDynamicZoom;

            // Rotation "cap en haut" : lissage vers l'angle cible en empruntant le chemin le plus court
            // (évite un demi-tour brusque, ex. cap qui passe de 359° à 1°). Rendu par la rotation native
            // de Mapbox GL (bearing) — plus besoin de faire pivoter le conteneur en CSS comme avec Leaflet.
            let deltaBearing = bearing - currentVisualBearing;
            deltaBearing = ((deltaBearing + 180) % 360 + 360) % 360 - 180;
            if (headingUpMode) currentVisualBearing += deltaBearing;
            const targetBearing = headingUpMode ? currentVisualBearing : 0;

            /* `isUserPanning` suspend tout le suivi caméra : glissement de doigt, mode ping,
               ou consultation d'une destination (focusDestinationOnMap). Tant qu'il est vrai,
               la boucle ne doit émettre AUCUNE commande caméra — un simple jumpTo, même sans
               centre, annulerait l'animation en cours. */
            if (!isUserPanning) {
                // Même règle de cadrage que le recadrage sur destination — voir
                // getMapFollowPadding() pour le détail du calcul et de ce qu'il corrige.
                const padding = getMapFollowPadding();

                // On se base UNIQUEMENT sur notre propre variable de suivi (currentDynamicZoom), jamais sur
                // map.getZoom() : pendant une transition animée (easeTo), la valeur réelle du zoom est
                // interpolée en continu et ne correspond quasiment jamais exactement au palier cible (15/17/13).
                // Comparer à map.getZoom() faisait donc redémarrer une nouvelle animation de 800ms à CHAQUE
                // frame tant que la précédente n'était pas terminée à la valeur exacte — la caméra ne
                // rattrapait alors jamais le marqueur et dérivait hors de l'écran.
                const zoomChanged = (currentDynamicZoom !== targetZoom);
                if (zoomChanged) { currentDynamicZoom = targetZoom; lastZoomChangeTime = now; }

                const targetPitch = map3DActive ? 60 : 0;

                if (zoomChanged) {
                    map.easeTo({ center: [lng, lat], zoom: targetZoom, bearing: targetBearing, pitch: targetPitch, padding, duration: 800 });
                } else {
                    map.jumpTo({ center: [lng, lat], zoom: targetZoom, bearing: targetBearing, pitch: targetPitch, padding });
                }
            }
        }

        function formatTime(hours) {
            if (!hours || hours <= 0) return "0m 00s";
            const totalSeconds = Math.floor(hours * 3600);
            const totalMinutes = Math.floor(totalSeconds / 60);
            const s = totalSeconds % 60;
            if (totalMinutes >= 60) {
                const h = Math.floor(totalMinutes / 60);
                const m = totalMinutes % 60;
                return `${h}h ${m < 10 ? '0' : ''}${m}m`;
            }
            return `${totalMinutes}m ${s < 10 ? '0' : ''}${s}s`;
        }

        // Heure d'arrivée estimée, calculée depuis l'instant réel de l'appel (pas depuis
        // le départ du trajet) : rouvrir le modal 5 minutes après avoir consulté un premier
        // trajet doit décaler l'heure affichée d'autant.
        function formatArrivalTime(hours) {
            if (!hours || hours <= 0) return "--";
            const arrival = new Date(Date.now() + hours * 3600000);
            return arrival.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        }

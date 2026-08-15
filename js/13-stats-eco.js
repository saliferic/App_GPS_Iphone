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

        /* ═══ PAGES PLEINES DES SECTIONS DU PROFIL ═══

           Galerie des trophées, Mon véhicule et Aide à la conduite s'ouvraient en accordéon,
           DANS le panneau Profil : leur contenu se dépliait sous le bouton, donc en bas d'une
           zone déjà remplie et désormais bornée à la moitié de l'écran (règle 50/50). Il
           fallait faire défiler pour atteindre ce qu'on venait d'ouvrir. Elles s'ouvrent
           maintenant en page pleine, comme « Mes statistiques ».

           ⚠ LE CONTENU EST DÉPLACÉ, JAMAIS RECOPIÉ. C'est le point à ne pas défaire : ces
           trois blocs sont pleins d'`id` uniques (champs de configuration véhicule, grille
           des trophées, interrupteurs trafic/voix/hotbox) que des dizaines de
           `getElementById` adressent depuis tout le code. Un clone créerait des id en double
           — `getElementById` rendrait alors le premier trouvé, c'est-à-dire l'exemplaire
           caché : on réglerait ses paramètres dans la page et rien ne se passerait.
           Déplacer le nœud garde un exemplaire unique, avec ses écouteurs et son état.

           La place d'origine est mémorisée par parent + frère suivant, et non par un index :
           un index deviendrait faux si un autre bloc était ajouté ou retiré entre-temps. */
        const PROFIL_SHEETS = {
            /* `dot: true` remplace le pictogramme emoji par la puce blanche `.ui-dot`
               (voir openProfilSheet). Une entrée sans ce drapeau garde son emoji dans
               `title` : les deux formes coexistent volontairement, la bascule se fait
               section par section. */
            trophy:  { bodyId: 'trophy-gallery-body', title: 'Galerie des trophées', dot: true,
                       onOpen: () => { try { renderTrophyGallery(); } catch (e) {} } },
            vehicle: { bodyId: 'vehicle-panel-body',  title: 'Mon véhicule', dot: true,
                       onOpen: () => { try { initVehicleConfigUI(); } catch (e) {} } },
            aide:    { bodyId: 'aide-conduite-body',  title: '🛟 Aide à la conduite' }
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
            titleEl.appendChild(document.createTextNode(def.title));
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
            const start = () => {
                window.addEventListener('devicemotion', _onDeviceMotion, { passive: true });
                _ecoMotionActive = true;
                console.log('[Éco] Accéléromètre actif');
            };
            // iOS 13+ : demande de permission obligatoire
            if (typeof DeviceMotionEvent !== 'undefined' &&
                typeof DeviceMotionEvent.requestPermission === 'function') {
                DeviceMotionEvent.requestPermission()
                    .then(state => { if (state === 'granted') start(); })
                    .catch(() => console.log('[Éco] Permission accéléromètre refusée'));
            } else if (typeof DeviceMotionEvent !== 'undefined') {
                start();
            } else {
                console.log('[Éco] DeviceMotionEvent non supporté sur ce navigateur');
            }
        }

        function stopEcoMotionTracking() {
            window.removeEventListener('devicemotion', _onDeviceMotion);
            _ecoMotionActive = false;
        }

        function _onDeviceMotion(event) {
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
                const maxLimit = (currentSpeedLimitKmh || 50) + 25;
                lastKnownSpeedKmh = Math.max(0, Math.min(maxLimit, lastKnownSpeedKmh + deltaKmh));
            }

            // Historique de vitesse GPS sur ~2 s (sert de confirmation)
            _ecoSpeedHistory.push({ t: now, v: d.actualSpeed });
            while (_ecoSpeedHistory.length && now - _ecoSpeedHistory[0].t > 2000) _ecoSpeedHistory.shift();

            const threshold = Math.min(ECO_THRESHOLD_BRAKE, ECO_THRESHOLD_ACCEL);

            // 5) Exigence de DURÉE : un vrai freinage dure plusieurs centaines de ms.
            // Un choc isolé (nid-de-poule, pavé, téléphone qui bouge dans son support) est bref.
            if (magnitude < threshold) { _ecoOverSince = 0; return; }
            if (!_ecoOverSince) { _ecoOverSince = now; return; }
            if (now - _ecoOverSince < ECO_MIN_DURATION_MS) return;

            if (now - _ecoLastEventMs < ECO_COOLDOWN_MS) return;

            // 6) Confirmation par le GPS : c'est le filtre décisif.
            // Sur des pavés, la vitesse ne bouge pas. Un vrai freinage/accélération se traduit
            // forcément par une variation de vitesse mesurable.
            const oldest = _ecoSpeedHistory[0];
            const deltaKmh = oldest ? (d.actualSpeed - oldest.v) : 0;
            if (Math.abs(deltaKmh) < ECO_MIN_SPEED_DELTA) { return; }

            _ecoOverSince = 0;
            _ecoLastEventMs = now;

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

        function loadProfilesFromStorage() {
            const stored = localStorage.getItem('gps_profiles');
            if (stored) { try { profiles = JSON.parse(stored); } catch(e) { profiles = []; } }
            const lastActive = localStorage.getItem('gps_active_profile_id');
            if (lastActive && profiles.some(p => p.id === lastActive)) activeProfileId = lastActive;
            renderProfilesDropdown(); updateProfileSummary();
        }
        function saveProfilesToStorage() { localStorage.setItem('gps_profiles', JSON.stringify(profiles)); }
        function renderProfilesDropdown() {
            const dropdown = document.getElementById('profile-dropdown');
            dropdown.innerHTML = profiles.length === 0 ? '<option value="">👤 Aucun profil créé</option>' : '<option value="">👤 Choisir un profil...</option>';
            profiles.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p.id; opt.textContent = `${p.name} (${p.totalPoints.toFixed(2)} pts)`; dropdown.appendChild(opt);
            });
            dropdown.value = activeProfileId || "";
        }
        // Éléments à masquer pendant la saisie du prénom
        const _PROFIL_MASK_IDS = [
            'profil-section-title-monprofil',
            'badge-category-card',
            'trophy-gallery-section',
            'vehicle-panel-section',
            'aide-conduite-section',
            'eco-score-bar',
            'drivers-container',
            'profil-options-trajet',
            'backup-section',
            'profil-itin-title'
        ];
        function showCreateProfileInline() {
            // Masquer le contenu de la page Profil (sauf la ligne de sélection)
            _PROFIL_MASK_IDS.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = 'none';
            });
            document.getElementById('create-profile-inline').style.display = 'block';
            document.getElementById('btn-show-create-profile').style.display = 'none';
            const sep = document.getElementById('btn-create-profile-sep');
            if (sep) sep.style.display = 'none';
            // Libère la hauteur plancher de l'onglet : le panneau se resserre sur le
            // formulaire et remonte au-dessus du clavier (voir #ui-panel.profile-focus).
            const panel = document.getElementById('ui-panel');
            if (panel) panel.classList.add('profile-focus');
            document.getElementById('new-profile-name').focus();
        }
        function hideCreateProfileInline() {
            document.getElementById('create-profile-inline').style.display = 'none';
            document.getElementById('btn-show-create-profile').style.display = '';
            const sep = document.getElementById('btn-create-profile-sep');
            if (sep) sep.style.display = '';
            document.getElementById('new-profile-name').value = '';
            const panel = document.getElementById('ui-panel');
            if (panel) panel.classList.remove('profile-focus');
            // Réafficher tout le contenu de la page Profil
            _PROFIL_MASK_IDS.forEach(id => {
                const el = document.getElementById(id);
                if (el) el.style.display = '';
            });
        }
        function createProfile() {
            const input = document.getElementById('new-profile-name');
            const name = input.value.trim();
            if (!name) { input.focus(); return; }
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
            updateProfileSummary();
            // Recharger badges et objectifs liés au nouveau profil actif
            renderBadgeCategoryCard();
            renderWeeklyGoalsPanel();
            updateWeeklyGoalsButton();
            // Rafraîchir la galerie (re-render si ouverte, sinon juste le compteur)
            refreshTrophyGalleryCount();
        }
        function updateProfileSummary() {
            const summaryEl = document.getElementById('profile-summary');
            const profile = profiles.find(p => p.id === activeProfileId);
            if (summaryEl) summaryEl.innerText = profile ? `👤 ${profile.name} — ${profile.totalPoints.toFixed(2)} pts cumulés` : "👤 Aucun profil sélectionné";
        }
        function deleteSelectedProfile() {
            const dropdown = document.getElementById('profile-dropdown');
            const id = dropdown.value;
            const statusBox = document.getElementById('status');
            if (!id) { statusBox.innerText = "Sélectionnez d'abord un profil dans la liste."; statusBox.style.color = "#ff6b6b"; return; }
            const profile = profiles.find(p => p.id === id);
            if (!profile) return;
            if (!confirm(`Supprimer le profil "${profile.name}" et ses ${profile.totalPoints.toFixed(2)} points cumulés ?`)) return;
            profiles = profiles.filter(p => p.id !== id);
            saveProfilesToStorage();
            if (activeProfileId === id) selectProfile(null);
            renderProfilesDropdown();
            statusBox.innerText = `🗑️ Profil supprimé : ${profile.name}`; statusBox.style.color = "#ff6b6b";
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
        }
        loadProfilesFromStorage();
        // Initialiser badges et objectifs APRÈS chargement des profils (activeProfileId connu)
        updateWeeklyGoalsButton();
        renderBadgeCategoryCard();

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

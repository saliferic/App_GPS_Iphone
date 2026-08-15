        // === OBJECTIFS HEBDOMADAIRES ===
        // 3 objectifs aléatoires générés chaque lundi, stockés en localStorage.
        // Progression mise à jour à chaque fin de trajet.
        // Bonus : coffre Légendaire garanti si les 3 sont atteints avant dimanche soir.

        const WEEKLY_GOAL_TEMPLATES = [
            { id: 'km_no_speed',   text: 'Parcourir {v} km sans excès de vitesse',       unit: 'km',     min: 50,  max: 200, step: 25 },
            { id: 'trips_long',    text: 'Effectuer {v} trajets de plus de 10 km sans excès', unit: 'trajets', min: 3,   max: 8,   step: 1 },
            { id: 'trips_total',   text: 'Effectuer {v} trajets (avec ou sans excès)',     unit: 'trajets', min: 5,   max: 15,  step: 1 },
            { id: 'km_total',      text: 'Parcourir {v} km au total',                     unit: 'km',     min: 80,  max: 300, step: 20 },
            { id: 'perfect_runs',  text: 'Terminer {v} trajets "sans faute" (0 excès)',    unit: 'trajets', min: 2,   max: 6,   step: 1 },
            { id: 'score_total',   text: 'Accumuler {v} points sur la semaine',            unit: 'pts',    min: 20,  max: 80,  step: 5 },
            { id: 'trips_short',   text: 'Effectuer {v} trajets en ville (< 5 km) sans excès', unit: 'trajets', min: 3, max: 10, step: 1 },
        ];

        function getWeekId() {
            const now = new Date();
            const jan1 = new Date(now.getFullYear(), 0, 1);
            const weekNum = Math.ceil(((now - jan1) / 86400000 + jan1.getDay() + 1) / 7);
            return now.getFullYear() + '-W' + weekNum;
        }

        function getTimeUntilEndOfWeek() {
            const now = new Date();
            const dayOfWeek = now.getDay(); // 0=dim, 1=lun, ..., 6=sam
            const daysUntilSunday = dayOfWeek === 0 ? 0 : (7 - dayOfWeek);
            const endOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() + daysUntilSunday, 23, 59, 59);
            const diff = endOfWeek - now;
            const days = Math.floor(diff / 86400000);
            const hours = Math.floor((diff % 86400000) / 3600000);
            return `${days}j ${hours}h restants`;
        }

        // ═══════════════════════════════════════════════════════════
        // === BASELINE PERSONNELLE — HISTORIQUE KM PAR SEMAINE ===
        // ═══════════════════════════════════════════════════════════

        const BASELINE_WEEKS = 4;       // fenêtre d'observation
        const BASELINE_FACTOR = 1.15;   // objectif = moyenne × 115%
        const BASELINE_MAX_JUMP = 1.20; // objectif ne peut pas bondir de plus de 20%/semaine
        const BASELINE_KM_FLOOR = 15;   // plancher minimum km/semaine
        const BASELINE_MIN_WEEKS = 4;   // semaines d'observation avant objectifs km adaptatifs

        // Stocker les km roulés cette semaine dans l'historique
        function recordWeeklyKm(distKm) {
            const weekId = getWeekId();
            let history = [];
            try { history = JSON.parse(localStorage.getItem('gps_km_history') || '[]'); } catch (e) { if (DEBUG) console.warn("[recordWeeklyKm] exception ignorée :", e); }
            const existing = history.find(h => h.week === weekId);
            if (existing) {
                existing.km += distKm;
            } else {
                history.push({ week: weekId, km: distKm });
            }
            // Garder seulement les 8 dernières semaines (marge)
            history = history.slice(-8);
            localStorage.setItem('gps_km_history', JSON.stringify(history));
        }

        // Calculer la baseline km/semaine (moyenne glissante sur les N dernières semaines complètes)
        function getKmBaseline() {
            let history = [];
            try { history = JSON.parse(localStorage.getItem('gps_km_history') || '[]'); } catch (e) { if (DEBUG) console.warn("[getKmBaseline] exception ignorée :", e); }
            const currentWeek = getWeekId();
            // Exclure la semaine en cours (pas encore terminée) + semaines à 0 (vacances/maladie)
            const pastWeeks = history.filter(h => h.week !== currentWeek && h.km > 0);
            if (pastWeeks.length < BASELINE_MIN_WEEKS) return null; // pas assez de données
            const recent = pastWeeks.slice(-BASELINE_WEEKS);
            const avg = recent.reduce((sum, h) => sum + h.km, 0) / recent.length;
            return avg;
        }

        // Nombre de semaines d'historique disponibles (hors semaine en cours)
        function getHistoryWeeksCount() {
            let history = [];
            try { history = JSON.parse(localStorage.getItem('gps_km_history') || '[]'); } catch (e) { if (DEBUG) console.warn("[getHistoryWeeksCount] exception ignorée :", e); }
            const currentWeek = getWeekId();
            return history.filter(h => h.week !== currentWeek).length;
        }

        // Adapter les plages min/max des templates km selon la baseline
        function getAdaptedTemplates(baselineKm) {
            if (baselineKm === null) {
                // Phase d'observation : uniquement missions qualitatives (pas de km total/km_no_speed)
                return WEEKLY_GOAL_TEMPLATES.filter(t => !['km_total', 'km_no_speed'].includes(t.id));
            }
            // Calculer les bornes adaptatives
            const target = Math.max(BASELINE_KM_FLOOR, baselineKm * BASELINE_FACTOR);

            // Récupérer l'objectif km de la semaine précédente pour limiter le saut
            let history = [];
            try { history = JSON.parse(localStorage.getItem('gps_km_history') || '[]'); } catch (e) { if (DEBUG) console.warn("[getAdaptedTemplates] exception ignorée :", e); }
            const prevGoal = parseFloat(localStorage.getItem('gps_last_km_goal') || '0');
            const cappedTarget = prevGoal > 0
                ? Math.min(target, prevGoal * BASELINE_MAX_JUMP)
                : target;
            const finalTarget = Math.round(cappedTarget / 5) * 5; // arrondi au 5 km
            localStorage.setItem('gps_last_km_goal', finalTarget);

            return WEEKLY_GOAL_TEMPLATES.map(tpl => {
                if (tpl.id === 'km_total' || tpl.id === 'km_no_speed') {
                    // Plage : 80% à 120% de finalTarget, par paliers de 5 km
                    const min = Math.max(BASELINE_KM_FLOOR, Math.round(finalTarget * 0.8 / 5) * 5);
                    const max = Math.round(finalTarget * 1.2 / 5) * 5;
                    return { ...tpl, min, max, step: 5 };
                }
                return tpl;
            });
        }

        function generateWeeklyGoals() {
            const baseline = getKmBaseline();
            const templates = getAdaptedTemplates(baseline);
            const shuffled = [...templates].sort(() => Math.random() - 0.5);
            const picked = shuffled.slice(0, 3);
            return picked.map(tpl => {
                const steps = Math.floor((tpl.max - tpl.min) / tpl.step);
                const target = tpl.min + Math.floor(Math.random() * (steps + 1)) * tpl.step;
                return {
                    id: tpl.id,
                    text: tpl.text.replace('{v}', target),
                    unit: tpl.unit,
                    target,
                    progress: 0,
                    adaptive: baseline !== null && (tpl.id === 'km_total' || tpl.id === 'km_no_speed')
                };
            });
        }

        function loadWeeklyGoals() {
            const currentWeek = getWeekId();
            const key = activeProfileId ? `gps_weekly_goals_${activeProfileId}` : 'gps_weekly_goals';
            const stored = localStorage.getItem(key);
            if (stored) {
                try {
                    const data = JSON.parse(stored);
                    if (data.week === currentWeek) return data;
                } catch (e) { if (DEBUG) console.warn("[loadWeeklyGoals] exception ignorée :", e); }
            }
            // Nouvelle semaine ou nouveau profil → générer de nouveaux objectifs
            const data = { week: currentWeek, goals: generateWeeklyGoals(), bonusClaimed: false };
            localStorage.setItem(key, JSON.stringify(data));
            return data;
        }

        function saveWeeklyGoals(data) {
            const key = activeProfileId ? `gps_weekly_goals_${activeProfileId}` : 'gps_weekly_goals';
            localStorage.setItem(key, JSON.stringify(data));
        }

        function updateWeeklyGoalsAfterTrip(distKm, score, isPerfect) {
            recordWeeklyKm(distKm); // enregistrer dans l'historique baseline
            const data = loadWeeklyGoals();
            data.goals.forEach(g => {
                switch(g.id) {
                    case 'km_no_speed':   if (isPerfect) g.progress += distKm; break;
                    case 'trips_long':    if (isPerfect && distKm >= 10) g.progress += 1; break;
                    case 'trips_total':   g.progress += 1; break;
                    case 'km_total':      g.progress += distKm; break;
                    case 'perfect_runs':  if (isPerfect) g.progress += 1; break;
                    case 'score_total':   g.progress += score; break;
                    case 'trips_short':   if (isPerfect && distKm < 5) g.progress += 1; break;
                }
                // Plafonner la progression au target
                g.progress = Math.min(g.progress, g.target);
            });
            saveWeeklyGoals(data);
            updateWeeklyGoalsButton();
            console.log('[Badge] goals après trajet:', data.goals.map(g => `${g.id}: ${g.progress}/${g.target}`), '— bonusClaimed:', data.bonusClaimed, '— allCompleted:', allGoalsCompleted(data));
            // Attribution du badge si les 3 objectifs viennent d'être complétés.
            // On appelle awardWeeklyBadge() immédiatement (pas de setTimeout) :
            // si le coffre est ouvert à ce moment, showBadgeEarnedToast pose _pendingBadgeModal=true
            // et la modal s'affiche à la fermeture du coffre via closeLootModal.
            if (allGoalsCompleted(data) && !data.bonusClaimed) {
                awardWeeklyBadge();
            }
            return data;
        }

        function allGoalsCompleted(data) {
            return data.goals.every(g => g.progress >= g.target);
        }

        function updateWeeklyGoalsButton() {
            const data = loadWeeklyGoals();
            const btn = document.getElementById('btn-weekly-goals');
            if (allGoalsCompleted(data) && !data.bonusClaimed) {
                btn.classList.add('has-reward');
            } else {
                btn.classList.remove('has-reward');
            }
        }

        function openWeeklyGoalsModal() {
            // Rendre le contenu dans l'onglet du panel
            renderWeeklyGoalsPanel();
            // Basculer vers l'onglet objectifs via switchMainTab (si pas déjà en cours)
            if (!document.getElementById('panel-tab-objectifs').classList.contains('active')) {
                switchMainTab('objectifs');
            }
        }

        function renderWeeklyGoalsPanel() {
            const data = loadWeeklyGoals();

            const timerEl = document.getElementById('weekly-goals-timer-panel');
            // `.ui-dot sm` à la place de l'emoji horloge — même puce que les intitulés
            // de section. Le compte à rebours reste un nœud texte à côté d'elle.
            if (timerEl) {
                timerEl.textContent = '';
                const puce = document.createElement('span');
                puce.className = 'ui-dot sm';
                timerEl.appendChild(puce);
                timerEl.appendChild(document.createTextNode(getTimeUntilEndOfWeek()));
            }

            const listEl = document.getElementById('weekly-goals-list-panel');
            if (!listEl) return;
            listEl.innerHTML = '';

            // Indicateur de baseline
            const baseline = getKmBaseline();
            const weeksCount = getHistoryWeeksCount();
            const baselineHtml = baseline !== null
                ? `<div style="background:rgba(0,150,255,0.06);border:1px solid rgba(0,140,255,0.12);border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:#7b8794;">
                    📊 <strong style="color:#58a6ff;">Objectifs adaptés à ton profil</strong><br>
                    Moyenne sur ${Math.min(weeksCount, BASELINE_WEEKS)} sem. : <strong style="color:#c9d1d9;">${Math.round(baseline)} km</strong> · Objectif km : <strong style="color:#58a6ff;">${Math.round(baseline * BASELINE_FACTOR)} km</strong>
                  </div>`
                : `<div style="background:rgba(243,156,18,0.06);border:1px solid rgba(243,156,18,0.15);border-radius:10px;padding:10px 12px;margin-bottom:12px;font-size:12px;color:#7b8794;">
                    🔍 <strong style="color:#f39c12;">Phase d'observation</strong> — ${weeksCount}/${BASELINE_MIN_WEEKS} semaines<br>
                    Roule encore ${BASELINE_MIN_WEEKS - weeksCount} sem. pour que les objectifs km s'adaptent à ton profil.
                  </div>`;
            listEl.innerHTML = baselineHtml;

            data.goals.forEach(g => {
                const pct = Math.min(100, Math.round((g.progress / g.target) * 100));
                const done = g.progress >= g.target;
                const progressText = g.unit === 'km'
                    ? `${g.progress.toFixed(1)} / ${g.target} km`
                    : g.unit === 'pts'
                        ? `${g.progress.toFixed(1)} / ${g.target} pts`
                        : `${Math.floor(g.progress)} / ${g.target} trajets`;
                const adaptiveBadge = g.adaptive ? ' <span style="font-size:10px;color:#58a6ff;background:rgba(0,140,255,0.1);border-radius:4px;padding:1px 5px;">adaptatif</span>' : '';
                listEl.innerHTML += `
                    <div class="wg-item ${done ? 'completed' : ''}">
                        <div class="wg-item-title">${done ? '✅' : '⬜'} ${g.text}${adaptiveBadge}</div>
                        <div class="wg-item-bar"><div class="wg-item-fill ${done ? 'done' : ''}" style="width:${pct}%"></div></div>
                        <div class="wg-item-progress">${progressText}</div>
                    </div>`;
            });

            const bonusEl = document.getElementById('weekly-goals-bonus-panel');
            if (!bonusEl) return;
            if (allGoalsCompleted(data) && !data.bonusClaimed) {
                bonusEl.innerHTML = `<button onclick="claimWeeklyBonus()" style="background:linear-gradient(135deg,#00b4d8,#0077b6);color:#fff;border:none;border-radius:12px;padding:14px 28px;font-size:15px;font-weight:900;cursor:pointer;letter-spacing:1px;">🏅 RÉCUPÉRER MON BADGE</button>`;
            } else if (allGoalsCompleted(data) && data.bonusClaimed) {
                const badges = loadBadges();
                const cat = getBadgeCategory(badges.total);
                bonusEl.innerHTML = `<div style="color:#28a745;font-weight:700;">✅ Badge obtenu ! ${cat.icon} Catégorie <span style="color:${cat.color};">${cat.name}</span> — Rendez-vous la semaine prochaine.</div>`;
            } else {
                const remaining = data.goals.filter(g => g.progress < g.target).length;
                bonusEl.innerHTML = `<div style="color:#4a5568;font-size:12px;">🏅 Complétez les ${remaining} objectif${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''} pour obtenir votre badge de la semaine !</div>`;
            }
        }

        function closeWeeklyGoalsModal() {
            // Fermer la modale legacy si encore ouverte
            const legacyOverlay = document.getElementById('weekly-goals-overlay');
            if (legacyOverlay) legacyOverlay.classList.remove('open');
            // Revenir à l'onglet trajet si on est sur objectifs
            if (document.getElementById('panel-tab-objectifs').classList.contains('active')) {
                switchMainTab('trajet');
            }
        }

        // ═══════════════════════════════════════════════════════════
        // === SYSTÈME DE BADGES & CATÉGORIES ===
        // ═══════════════════════════════════════════════════════════

        const BADGE_KEY = 'salif_gps_badges';
        function _badgeKey() { return activeProfileId ? `${BADGE_KEY}_${activeProfileId}` : BADGE_KEY; }

        const BADGE_CATEGORIES = [
            { name: 'Bronze',   icon: '🥉', color: '#cd7f32', min: 0,  max: 2  },
            { name: 'Argent',   icon: '🥈', color: '#a8a9ad', min: 3,  max: 5  },
            { name: 'Or',       icon: '🥇', color: '#f5c518', min: 6,  max: 8  },
            { name: 'Platine',  icon: '🔷', color: '#00b4d8', min: 9,  max: 11 },
            { name: 'Diamant',  icon: '💎', color: '#8be8fd', min: 12, max: 14 },
            { name: 'Élite',    icon: '🔥', color: '#ff6b35', min: 15, max: 17 },
            { name: 'Champion', icon: '🏆', color: '#ffd700', min: 18, max: 20 },
            { name: 'Ange',     icon: '👼', color: '#e0aaff', min: 21, max: 23 },
        ];

        function loadBadges() {
            try {
                const raw = localStorage.getItem(_badgeKey());
                return raw ? JSON.parse(raw) : { total: 0, weeks: [] };
            } catch(e) { return { total: 0, weeks: [] }; }
        }

        function saveBadges(data) {
            localStorage.setItem(_badgeKey(), JSON.stringify(data));
        }

        function getBadgeCategory(total) {
            for (let i = BADGE_CATEGORIES.length - 1; i >= 0; i--) {
                if (total >= BADGE_CATEGORIES[i].min) return BADGE_CATEGORIES[i];
            }
            return BADGE_CATEGORIES[0];
        }

        function getNextCategory(current) {
            const idx = BADGE_CATEGORIES.findIndex(c => c.name === current.name);
            return idx < BADGE_CATEGORIES.length - 1 ? BADGE_CATEGORIES[idx + 1] : null;
        }

        // Attribuer le badge de la semaine (appelé dès les 3 objectifs complétés)
        function awardWeeklyBadge() {
            const goals = loadWeeklyGoals();
            console.log('[Badge] awardWeeklyBadge — bonusClaimed:', goals.bonusClaimed);
            if (goals.bonusClaimed) {
                const badges = loadBadges();
                console.log('[Badge] déjà réclamé, affichage modal seul — total:', badges.total);
                showBadgeEarnedToast(badges.total);
                return;
            }

            goals.bonusClaimed = true;
            saveWeeklyGoals(goals);

            const badges = loadBadges();
            const weekId = getWeekId();
            console.log('[Badge] weekId:', weekId, '— weeks déjà en mémoire:', badges.weeks);
            if (!badges.weeks.includes(weekId)) {
                badges.weeks.push(weekId);
                badges.total += 1;
                saveBadges(badges);
            }
            console.log('[Badge] total après attribution:', badges.total);

            renderBadgeCategoryCard();
            updateWeeklyGoalsButton();
            renderWeeklyGoalsPanel();
            showBadgeEarnedToast(badges.total);
        }

        // Vidéos par catégorie — ajouter les fichiers au fur et à mesure
        const BADGE_CATEGORY_VIDEOS = {
            'Bronze':   'Video/Bronze.mp4',
            'Argent':   'Video/Argent.mp4',
            'Or':       'Video/Or.mp4',
            'Platine':  'Video/Platine.mp4',
            'Diamant':  'Video/Diamant.mp4',
            'Élite':    'Video/Elite.mp4',
            'Champion': 'Video/Champion.mp4',
            'Ange':     'Video/Ange.mp4',
        };
        let _badgeVideoTarget = 0; // total de badges après attribution, utilisé après la vidéo

        function playBadgeVideo(categoryName, badgeTotal, onEnd) {
            const videoPath = BADGE_CATEGORY_VIDEOS[categoryName];
            if (!videoPath) { onEnd(); return; }

            const modal = document.getElementById('badge-video-modal');
            const videoEl = document.getElementById('badge-video-el');
            if (!modal || !videoEl) { onEnd(); return; }

            _badgeVideoTarget = badgeTotal;

            // Nettoyer tous les anciens handlers avant d'en poser de nouveaux
            // pour éviter tout déclenchement résiduel (boucle infinie sur Android)
            videoEl.oncanplay = null;
            videoEl.onended   = null;
            videoEl.onerror   = null;

            videoEl.src = videoPath;
            videoEl.currentTime = 0;

            videoEl.oncanplay = () => {
                modal.classList.add('visible');
                videoEl.play().catch(() => {});
            };

            // Fin naturelle → même chose que "Passer"
            videoEl.onended = () => {
                // Nettoyer avant toute action pour couper la boucle
                videoEl.onended = null;
                closeBadgeVideoModal();
                onEnd();
            };

            // Fichier absent ou erreur → passer directement à la suite
            videoEl.onerror = () => {
                videoEl.onerror = null;
                videoEl.src = '';
                onEnd();
            };

            videoEl.load();
        }

        function skipBadgeVideo() {
            // Couper les handlers AVANT de fermer pour éviter que onended/onerror se redéclenche
            const videoEl = document.getElementById('badge-video-el');
            if (videoEl) {
                videoEl.onended = null;
                videoEl.onerror = null;
                videoEl.oncanplay = null;
            }
            closeBadgeVideoModal();
            // "Passer" → afficher la modal badge
            _showBadgeModalUI(_badgeVideoTarget);
        }

        function closeBadgeVideoModal() {
            const modal = document.getElementById('badge-video-modal');
            const videoEl = document.getElementById('badge-video-el');
            if (videoEl) { videoEl.pause(); videoEl.src = ''; }
            if (modal) modal.classList.remove('visible');
        }

        // Modal badge débloqué — affiché séquentiellement après fermeture du coffre
        let _pendingBadgeModal = false; // flag : un badge attend d'être affiché après le coffre

        function showBadgeUnlockedModal(newTotal) {
            const cat = getBadgeCategory(newTotal);
            const prevCat = getBadgeCategory(newTotal - 1);
            const isNewCategory = prevCat.name !== cat.name || newTotal === 1;

            _badgeVideoTarget = newTotal;
            _showBadgeModalUI(newTotal, isNewCategory);
        }

        function _showBadgeModalUI(newTotal, isNewCategory) {
            const cat = getBadgeCategory(newTotal);
            if (isNewCategory === undefined) {
                const prevCat = getBadgeCategory(newTotal - 1);
                isNewCategory = prevCat.name !== cat.name || newTotal === 1;
            }

            const iconEl  = document.getElementById('badge-unlocked-icon');
            const titleEl = document.getElementById('badge-unlocked-title');
            const subEl   = document.getElementById('badge-unlocked-sub');
            const catEl   = document.getElementById('badge-unlocked-category');
            const boxEl   = document.getElementById('badge-unlocked-box');

            iconEl.textContent  = isNewCategory ? cat.icon : '🏅';
            titleEl.textContent = isNewCategory ? `Catégorie ${cat.name} débloquée !` : 'Badge obtenu !';
            titleEl.style.color = cat.color;
            subEl.textContent   = `${newTotal} badge${newTotal > 1 ? 's' : ''} au total · Semaine complétée 🎯`;

            catEl.textContent      = `${cat.icon} ${cat.name}`;
            catEl.style.background = cat.color + '22';
            catEl.style.color      = cat.color;
            catEl.style.border     = `1px solid ${cat.color}55`;

            if (boxEl) {
                boxEl.style.border    = `1px solid ${cat.color}44`;
                boxEl.style.boxShadow = `0 16px 48px rgba(0,0,0,0.9), 0 0 32px ${cat.color}22`;
            }

            // Bouton : si nouvelle catégorie ET vidéo disponible → proposer la vidéo
            const closeBtn = document.getElementById('badge-unlocked-close');
            const videoPath = BADGE_CATEGORY_VIDEOS[cat.name];
            if (isNewCategory && videoPath) {
                closeBtn.textContent = '🎬 Voir ma récompense';
                closeBtn.onclick = () => {
                    document.getElementById('badge-unlocked-modal').classList.remove('visible');
                    playBadgeVideo(cat.name, newTotal, () => {
                        renderBadgeCategoryCard();
                    });
                };
            } else {
                closeBtn.textContent = 'Super, merci !';
                closeBtn.onclick = closeBadgeUnlockedModal;
            }

            document.getElementById('badge-unlocked-modal').classList.add('visible');
            _pendingBadgeModal = false;
        }

        function closeBadgeUnlockedModal() {
            document.getElementById('badge-unlocked-modal').classList.remove('visible');
            renderBadgeCategoryCard();
        }

        // Conserver pour compatibilité interne (appelé depuis awardWeeklyBadge)
        function showBadgeEarnedToast(newTotal) {
            const overlay = document.getElementById('loot-modal-overlay');
            const coffreOuvert = overlay && overlay.classList.contains('open');
            console.log('[Badge] showBadgeEarnedToast — total:', newTotal, '— coffre ouvert:', coffreOuvert);
            // Toujours stocker le total en attente — closeLootModal l'affichera si coffre ouvert,
            // sinon on l'affiche immédiatement
            _pendingBadgeTotal = newTotal;
            if (coffreOuvert) {
                _pendingBadgeModal = true;
                console.log('[Badge] → badge mis en attente (_pendingBadgeModal=true)');
            } else {
                _pendingBadgeModal = false;
                showBadgeUnlockedModal(newTotal);
            }
        }
        let _pendingBadgeTotal = 0;

        // Rendu de la carte catégorie dans l'onglet Profil
        function renderBadgeCategoryCard() {
            // Mettre à jour le compteur de la galerie (sans risque de récursion)
            _updateTrophyCount();
            const badges = loadBadges();
            const total = badges.total;
            const cat = getBadgeCategory(total);
            const next = getNextCategory(cat);

            const iconEl   = document.getElementById('badge-category-icon');
            const nameEl   = document.getElementById('badge-category-name');
            const subEl    = document.getElementById('badge-category-sub');
            const pipsEl   = document.getElementById('badge-count-icons');
            const barEl    = document.getElementById('badge-progress-bar-fill');
            const labelEl  = document.getElementById('badge-progress-label');
            const cardEl   = document.getElementById('badge-category-card');

            if (!iconEl) return;

            iconEl.textContent   = cat.icon;
            nameEl.textContent   = cat.name;
            nameEl.style.color   = cat.color;
            subEl.textContent    = `${total} badge${total > 1 ? 's' : ''} obtenu${total > 1 ? 's' : ''}`;
            if (cardEl) cardEl.style.borderColor = cat.color + '33';

            // Pips (badges dans la catégorie en cours)
            const earnedInCat = total - cat.min;
            const sizeOfCat   = cat.max - cat.min + 1;
            pipsEl.innerHTML   = '';
            pipsEl.style.color = cat.color;
            for (let i = 0; i < sizeOfCat; i++) {
                const pip = document.createElement('div');
                pip.className = 'badge-pip' + (i < earnedInCat ? ' earned' : '');
                pip.style.color = cat.color;
                pip.style.borderColor = cat.color;
                pip.textContent = i < earnedInCat ? '✓' : '';
                pipsEl.appendChild(pip);
            }

            // Barre de progression
            if (next) {
                const pct = Math.round((earnedInCat / sizeOfCat) * 100);
                barEl.style.width      = pct + '%';
                barEl.style.background = `linear-gradient(90deg, ${cat.color}, ${next.color})`;
                labelEl.textContent    = `${earnedInCat} / ${sizeOfCat} badges pour ${next.name}`;
            } else {
                barEl.style.width      = '100%';
                barEl.style.background = cat.color;
                labelEl.textContent    = '🏅 Catégorie maximale atteinte !';
            }
        }

        function claimWeeklyBonus() {
            awardWeeklyBadge();
        }

        // ═══════════════════════════════════════════════════════════
        // GALERIE DES TROPHÉES
        // ═══════════════════════════════════════════════════════════

        /* Conservée comme REDIRECTION : la section ne s'ouvre plus en accordéon mais en
           page pleine (openProfilSheet). Le bouton du Profil appelle directement la
           nouvelle fonction ; celle-ci couvre un appel qui subsisterait ailleurs, plutôt
           que de le laisser lever une ReferenceError. */
        function toggleTrophyGallery() { openProfilSheet('trophy'); }

        function renderTrophyGallery() {
            const badges = loadBadges();
            const total  = badges.total;
            const grid   = document.getElementById('trophy-grid');
            const countEl = document.getElementById('trophy-gallery-count');
            const hintEl  = document.getElementById('trophy-gallery-hint');
            if (!grid) return;

            const unlockedCount = BADGE_CATEGORIES.filter(cat => {
                const earned = Math.max(0, Math.min(total - cat.min, cat.max - cat.min + 1));
                return earned > 0;
            }).length;
            if (countEl) countEl.textContent = `${unlockedCount} / ${BADGE_CATEGORIES.length}`;
            if (hintEl) {
                const hasVideo = BADGE_CATEGORIES.some(cat => {
                    const earned = Math.max(0, Math.min(total - cat.min, cat.max - cat.min + 1));
                    return earned > 0 && BADGE_CATEGORY_VIDEOS[cat.name];
                });
                hintEl.style.display = hasVideo ? 'block' : 'none';
            }

            grid.innerHTML = '';

            BADGE_CATEGORIES.forEach(cat => {
                // Débloqué si le joueur a au moins 1 badge dans cette catégorie
                const earnedInCat = Math.max(0, Math.min(total - cat.min, cat.max - cat.min + 1));
                const isUnlocked = earnedInCat > 0;
                const catSize     = cat.max - cat.min + 1;
                const hasVideo    = !!BADGE_CATEGORY_VIDEOS[cat.name];

                const cell = document.createElement('div');
                cell.className = 'trophy-cell ' + (isUnlocked ? 'unlocked' : 'locked');
                cell.style.setProperty('--tc-color', cat.color);

                // Halo border débloqué
                if (isUnlocked) {
                    cell.style.borderColor = cat.color + '44';
                    cell.style.background  = cat.color + '0a';
                }

                // Clic → rejouer la vidéo
                if (isUnlocked && hasVideo) {
                    cell.onclick = () => replayTrophyVideo(cat.name);
                }

                cell.innerHTML = `
                    <div class="trophy-icon-wrap">${cat.icon}</div>
                    <div class="trophy-name">${cat.name}</div>
                    <div class="trophy-badge-count">${isUnlocked ? earnedInCat + '/' + catSize : '—'}</div>
                    ${isUnlocked && hasVideo ? '<span class="trophy-play-hint">▶️</span>' : ''}
                    ${!isUnlocked ? '<span class="trophy-lock">🔒</span>' : ''}
                `;

                grid.appendChild(cell);
            });
        }

        function replayTrophyVideo(categoryName) {
            // Fermer la galerie visuellement
            const section = document.getElementById('trophy-gallery-section');

            playBadgeVideo(categoryName, loadBadges().total, () => {
                // Après la vidéo, on revient simplement au profil — pas de modal badge
                // (c'est un replay, pas un nouveau débloqué)
            });
        }

        // Met à jour seulement le compteur (sans re-render la grille)
        function _updateTrophyCount() {
            const total = loadBadges().total;
            const countEl = document.getElementById('trophy-gallery-count');
            if (!countEl) return;
            const unlockedCount = BADGE_CATEGORIES.filter(cat => {
                const earned = Math.max(0, Math.min(total - cat.min, cat.max - cat.min + 1));
                return earned > 0;
            }).length;
            countEl.textContent = `${unlockedCount} / ${BADGE_CATEGORIES.length}`;
        }

        // Mettre à jour le compteur de la galerie sans ouvrir le panel
        function refreshTrophyGalleryCount() {
            const badges = loadBadges();
            const total  = badges.total;
            const countEl = document.getElementById('trophy-gallery-count');
            if (!countEl) return;
            const unlockedCount = BADGE_CATEGORIES.filter(cat => total > cat.min || (cat.min === 0 && total >= 1)).length;
            countEl.textContent = `${unlockedCount} / ${BADGE_CATEGORIES.length}`;
            /* Regrille uniquement si la galerie est SOUS LES YEUX. Le test portait sur la
               classe .open de la section, mécanique de l'accordéon supprimé : il ne se
               vérifiait donc plus jamais, et un badge gagné pendant que la page est ouverte
               n'y apparaissait pas. On teste maintenant l'emplacement réel du contenu. */
            const body = document.getElementById('trophy-gallery-body');
            if (body && body.classList.contains('in-profil-sheet')) renderTrophyGallery();
        }

        // Appelé depuis switchMainTab pour s'assurer que le compteur est à jour
        // quand l'utilisateur revient sur l'onglet Profil
        function onProfilTabOpen() {
            refreshTrophyGalleryCount();
        }

        // Initialiser l'état du bouton et la carte badge au chargement
        // ⚠️ Ces appels sont déplacés après loadProfilesFromStorage() plus bas
        // pour que activeProfileId soit connu avant de lire les clés par profil.

        /* ⚠ APPEL DIFFÉRÉ D'UN TICK — NE PAS LE REMETTRE EN SYNCHRONE.
           `initVehicleConfigUI()` a bien été remontée dans 00-helpers-partages.js, mais
           SON CORPS appelle `loadVehicleConfig()` et `selectVehicleType()`, tous deux
           définis dans 15-multiarrets-vehicule.js — six fichiers plus bas. Remonter une
           fonction ne remonte pas ses appelées : à cet instant `loadVehicleConfig` n'existe
           pas encore et l'appel levait `ReferenceError`.

           L'exception ne s'arrêtait pas là. Émise depuis le TOP-LEVEL de ce fichier, elle
           en INTERROMPAIT l'évaluation : tout ce qui suit cette ligne ne s'exécutait plus
           au chargement — `let userPanningResumeTimer` restait en zone morte temporelle
           (d'où « userPanningResumeTimer is not defined » et l'autozoom absent du scan ⛽),
           `map.on('dragstart')` n'était jamais posé, `loadFavoritesFromStorage()` non plus.
           Les `function` de ce fichier, elles, restaient disponibles : elles sont créées à
           l'instanciation du script, avant toute exécution. **C'est cette asymétrie qui
           rend la panne si difficile à lire** — l'app paraît fonctionner, seules les
           variables partagées manquent à l'appel.

           Un `setTimeout(…, 0)` suffit : les `<script src>` restants sont exécutés par
           l'analyseur avant que la file des macrotâches ne soit dépilée. C'est déjà la
           parade retenue pour `initCritAirUI()` à l'intérieur de la fonction — elle est
           simplement remontée d'un cran, là où elle couvre TOUTES les appelées. */
        setTimeout(() => {
            try { initVehicleConfigUI(); }
            catch (e) { logAppError('initVehicleConfigUI', e); }
        }, 0);

        // ⚡ BOUTON DEBUG — À SUPPRIMER APRÈS TEST
        function _debugFillGoals95() {
            // 1. Réinitialiser badge de la semaine (pour pouvoir rejouer)
            const badges = loadBadges();
            const weekId = getWeekId();
            badges.weeks = badges.weeks.filter(w => w !== weekId);
            if (badges.total > 0) badges.total -= 1;
            saveBadges(badges);

            // 2. Mettre les objectifs à 100% directement (pas 95%) et bonusClaimed=false
            const data = loadWeeklyGoals();
            data.goals.forEach(g => { g.progress = g.target; });
            data.bonusClaimed = false;
            saveWeeklyGoals(data);

            renderWeeklyGoalsPanel();
            renderBadgeCategoryCard();
            updateWeeklyGoalsButton();

            console.log('[Debug] Objectifs à 100%, badge semaine réinitialisé. activeProfileId:', activeProfileId);
            console.log('[Debug] Goals:', data.goals.map(g => `${g.id}: ${g.progress}/${g.target}`));
            console.log('[Debug] Badges:', loadBadges());

            // 3. Déclencher immédiatement le flow badge
            setTimeout(() => {
                console.log('[Debug] → appel awardWeeklyBadge()');
                awardWeeklyBadge();
            }, 300);

            document.getElementById('status').innerText = '🧪 DEBUG : flow badge déclenché directement !';
            document.getElementById('status').style.color = '#f39c12';
        }

        /* ⚡ DÉBOGAGE VOCAL — Pré-charge des contacts de test.
           Les coordonnées ne sont PAS écrites à la main : elles sont demandées à Mapbox au
           moment du chargement. Des coordonnées saisies de mémoire tombaient régulièrement
           dans le mauvais arrondissement (voire la mauvaise commune), et comme
           loadFavoriteAddress() fait désormais confiance aux coordonnées enregistrées sans
           re-géocoder, l'erreur se voyait directement sur la carte. */
        async function _debugLoadTestContacts() {
            const testContacts = [
                { name: 'Lionelle', address: '20 bis Rue Wilhem, 75016 Paris' },
                { name: 'Bercy',    address: '6 Rue de Massy, 92160 Antony' },
                { name: 'Bertrand', address: '46 Rue de l\'Orée du Bois, 28210 Nogent-le-Roi' },
                { name: 'Sandy',    address: '87 Rue de l\'Abbé Lemire, 92600 Asnières-sur-Seine' }
            ];

            const statusBox = document.getElementById('status');
            if (statusBox) {
                statusBox.innerText = '🎤 Géocodage des contacts de test…';
                statusBox.style.color = '#4da3ff';
            }

            const resolved = [];
            for (const c of testContacts) {
                let coords = null;
                try {
                    coords = await geocode(c.address);
                } catch (e) {
                    console.warn(`[Debug Vocal] Géocodage échoué pour ${c.name} (${c.address})`, e);
                }
                resolved.push({
                    name: c.name, nom: c.name, prenom: c.name,
                    address: c.address, coords, phone: null
                });
            }

            try {
                localStorage.setItem('gps_favorites', JSON.stringify(resolved));
                favorites = resolved;
                renderFavoritesDropdown();

                const failed = resolved.filter(c => !c.coords).map(c => c.name);
                if (statusBox) {
                    statusBox.innerText = failed.length
                        ? `⚠️ ${resolved.length - failed.length}/${resolved.length} contacts localisés (échec : ${failed.join(', ')})`
                        : `🎤 TEST VOCAL : ${resolved.length} contacts chargés et localisés`;
                    statusBox.style.color = failed.length ? '#f39c12' : '#28a745';
                }
                console.table(resolved.map(c => ({ nom: c.name, adresse: c.address, coords: c.coords })));
                console.log('Essaie de dire : « Je vais chez Lionelle », « Chez Bercy », ou « Sandy »');
            } catch (e) {
                console.error('[Debug Vocal] Erreur chargement contacts:', e);
            }
        }

        function openLootChestModal(finalScore, arrived = true) {
            // Plafonner avant tout calcul de loot : un multiplicateur x2 appliqué à un
            // score négatif doublerait la perte au lieu de récompenser.
            pendingLootScore = clampTripScore(finalScore);
            document.getElementById('loot-chest-view').style.display = 'block';
            document.getElementById('loot-reward-view').style.display = 'none';
            const chestIcon = document.getElementById('loot-chest-icon');
            chestIcon.classList.remove('shaking');
            const lootModal = document.getElementById('loot-modal');
            lootModal.style.borderColor = '#3b9dff';
            lootModal.style.boxShadow = '0 10px 50px rgba(59, 157, 255, 0.35)';
            document.getElementById('loot-modal-overlay').classList.add('open');
            // "reached_destination.ogg" ne doit être annoncé qu'en cas d'arrivée réelle à destination.
            // En cas d'arrêt manuel avant la fin du trajet, on annonce plutôt la fin de trajet.
            playAudioSequence([arrived ? 'reached_destination.ogg' : 'trip_ended.ogg']);
        }

        // Légendaire conservé dans le pool aléatoire — la garantie via objectifs est remplacée par le badge
        function rollLoot() {
            const r = Math.random() * 100;
            if (r < 50) return { rarity: 'Atypique',   border: '#7ed321', gradFrom: '#9ee83a', gradTo: '#4c9a1a', icon: '🍀', type: 'percentage', value: 0.10, img: 'Images/Jamu.png' };
            if (r < 85) return { rarity: 'Rare',        border: '#2196f3', gradFrom: '#5ab7ff', gradTo: '#1565c0', icon: '💎', type: 'percentage', value: 0.20, img: 'Images/pegase_noir.png' };
            if (r < 95) return { rarity: 'Épique',      border: '#c13fe0', gradFrom: '#e070ff', gradTo: '#8e24aa', icon: '⚡', type: 'percentage', value: 0.50, img: 'Images/Pegase.png' };
            return              { rarity: 'Légendaire',  border: '#f5c518', gradFrom: '#ffe066', gradTo: '#d4a017', icon: '👑', type: 'multiplier', value: 2.0,  img: 'Images/Aiolia_Gold.png' };
        }

        function onChestClick() {
            const chestIcon = document.getElementById('loot-chest-icon');
            if (chestIcon.classList.contains('shaking')) return;
            chestIcon.classList.add('shaking');

            setTimeout(() => {
                const loot = rollLoot();
                let finalTotal = pendingLootScore;
                let rewardText = '';
                if (loot.type === 'percentage') {
                    finalTotal = pendingLootScore + (pendingLootScore * loot.value);
                    rewardText = `${loot.icon} +${Math.round(loot.value * 100)}% de points`;
                } else {
                    finalTotal = pendingLootScore * loot.value;
                    rewardText = `${loot.icon} Multiplicateur x${loot.value} ${loot.icon}`;
                }

                finalTotal = clampTripScore(finalTotal);
                addPointsToActiveProfile(finalTotal);
                const profile = profiles.find(p => p.id === activeProfileId);
                document.getElementById('status').innerText = profile
                    ? `Trajet terminé. ${finalTotal.toFixed(2)} pts ajoutés au profil ${profile.name} 🏆`
                    : "Trajet terminé. Sans faute ! 🏆";
                document.getElementById('status').style.color = "#28a745";

                const lootModal = document.getElementById('loot-modal');
                lootModal.style.borderColor = loot.border;
                lootModal.style.boxShadow = `0 10px 50px ${loot.border}66`;

                // MODIFICATION : Mise à jour de l'image
                const lootImage = document.getElementById('loot-reward-image');
                lootImage.src = loot.img;
                lootImage.style.display = 'block';

                const banner = document.getElementById('loot-rarity-banner');
                banner.innerText = `${loot.rarity} !`;
                banner.style.background = `linear-gradient(135deg, ${loot.gradFrom}, ${loot.gradTo})`;
                banner.style.boxShadow = `0 0 20px ${loot.border}99`;

                const pill = document.getElementById('loot-reward-pill');
                pill.innerText = rewardText;
                pill.style.background = `linear-gradient(135deg, ${loot.gradFrom}, ${loot.gradTo})`;
                pill.style.boxShadow = `0 0 18px ${loot.border}88`;

                document.getElementById('loot-base-score').innerText = pendingLootScore.toFixed(2);
                document.getElementById('loot-total-received').innerText = finalTotal.toFixed(2);

                document.getElementById('loot-chest-view').style.display = 'none';
                document.getElementById('loot-reward-view').style.display = 'block';
            }, 1000);
        }

        function closeLootModal() {
            document.getElementById('loot-modal-overlay').classList.remove('open');
            console.log('[Badge] closeLootModal — _pendingBadgeModal:', _pendingBadgeModal, '_pendingBadgeTotal:', _pendingBadgeTotal);
            // Afficher le badge si un total est en attente (flag OU total > 0)
            if (_pendingBadgeTotal > 0) {
                const totalToShow = _pendingBadgeTotal;
                _pendingBadgeModal = false;
                _pendingBadgeTotal = 0;
                setTimeout(() => showBadgeUnlockedModal(totalToShow), 400);
            }
        }

        /* `userPanningResumeTimer` est déclaré dans 00-helpers-partages.js : il est lu par
           08, 09, 11 et 19, dont deux fichiers chargés AVANT celui-ci. Un `let` de portée
           script n'existe qu'à partir de l'évaluation de son fichier — le redéclarer ici
           lèverait « Identifier already declared » et le remonter était le seul moyen de
           supprimer le `ReferenceError` du scan ⛽. Voir le commentaire là-bas. */

        // Affiche/masque le bouton recentrer selon le contexte :
        // - Pendant nav : swap mute ↔ recentrer dans nav-side-controls
        // - Hors nav : bouton standalone recenter-btn
        function showRecenterBtn(visible) {
            // Avec la hotbox, #nav-side-controls est masqué : le swap mute↔recentrer n'a
            // plus d'effet visible. On bascule sur le bouton autonome, sinon un conducteur
            // ayant fait glisser la carte n'aurait plus AUCUN moyen apparent de revenir sur
            // sa position (la reprise auto au bout de 8 s n'existe pas en simulation).
            const inNav = document.body.classList.contains('nav-active')
                       && !document.body.classList.contains('hotbox-on');
            if (inNav) {
                // Pendant nav : swap mute <-> recentrer dans nav-side-controls
                const muteBtn     = document.getElementById('nav-btn-mute');
                const recenterBtn = document.getElementById('nav-btn-recenter');
                if (muteBtn)     muteBtn.style.display     = visible ? 'none' : 'flex';
                if (recenterBtn) recenterBtn.style.display = visible ? 'flex' : 'none';
            } else {
                // Hors nav : bouton standalone recenter uniquement, ne pas toucher au mute
                const btn = document.getElementById('recenter-btn');
                if (btn) btn.style.display = visible ? 'flex' : 'none';
            }
        }

        map.on('dragstart', function() {
            if (lastRealCoords || isCourseStarted) {
                isUserPanning = true;
                showRecenterBtn(true);
                // En navigation réelle : reprendre le suivi auto après 8s (frôlement accidentel en voiture)
                // En simulation : pas de reprise auto — l'utilisateur explore librement, il clique "Recentrer"
                if (userPanningResumeTimer) clearTimeout(userPanningResumeTimer);
                if (isCourseStarted && !isSimulationMode) {
                    userPanningResumeTimer = setTimeout(() => { recenterMap(); }, 8000);
                }
            }
        });

        function recenterMap() {
            isUserPanning = false;
            if (userPanningResumeTimer) { clearTimeout(userPanningResumeTimer); userPanningResumeTimer = null; }
            showRecenterBtn(false);
            if (lastRealCoords && !isSimulationMode) {
                const speed = (drivers.length > 0) ? drivers[0].actualSpeed : 0;
                updateDynamicZoom(speed, lastRealCoords[1], lastRealCoords[0], isCourseStarted ? lastKnownBearing : 0);
            } else if (drivers.length > 0 && drivers[0].marker) {
                map.panTo(drivers[0].marker.getLngLat());
            }
        }

        function loadFavoritesFromStorage() {
            const stored = localStorage.getItem('gps_favorites');
            if (stored) { try { favorites = JSON.parse(stored); } catch(e) { favorites = []; } }
            if (!Array.isArray(favorites)) favorites = [];
            /* Les contacts enregistrés par d'anciennes versions peuvent porter des
               coordonnées au format {lat, lon} (époque Nominatim) ou incomplètes. Passées
               telles quelles à Mapbox, elles produisent un NaN et bloquent le calcul du
               trajet. On les remet au format [lng, lat] ; si elles sont irrécupérables on
               les efface, l'adresse sera simplement re-géocodée à la sélection. */
            let migrated = false;
            favorites.forEach(f => {
                if (!f || f.coords === undefined || f.coords === null) return;
                const norm = normalizeLngLat(f.coords);
                if (!norm || !isLngLat(f.coords) || norm[0] !== f.coords[0] || norm[1] !== f.coords[1]) migrated = true;
                f.coords = norm;
            });
            if (migrated) {
                try { localStorage.setItem('gps_favorites', JSON.stringify(favorites)); } catch (e) {}
            }
            renderFavoritesDropdown();
        }
        
        // Ouvrir/fermer le formulaire de création/édition de contact
        let contactAdresseCoords = null; // coords résolues via autocomplete pour le champ adresse contact
        let contactTempMarker = null;    // marqueur posé par le ping carte du formulaire contact
        let editingFavIndex = null;       // null = création, number = édition du favori à cet index

        /* Le "+" de la ligne "Adresses enregistrées" s'efface pendant que le formulaire
           est ouvert (même logique que le "+" du sélecteur de profil), sinon le filet
           séparateur resterait seul contre la corbeille. */
        function _setFavAddBtnVisible(visible) {
            const add = document.getElementById('btn-add-fav');
            const sep = document.getElementById('btn-add-fav-sep');
            if (add) add.style.display = visible ? '' : 'none';
            if (sep) sep.style.display = visible ? '' : 'none';
        }

        function toggleCreateContactForm(forceState) {
            const form = document.getElementById('create-contact-form');
            const panel = document.getElementById('ui-panel');
            const wasOpen = form.style.display !== 'none';
            const open = forceState !== undefined ? forceState : !wasOpen;
            form.style.display = open ? 'block' : 'none';
            _setFavAddBtnVisible(!open);
            if (!open) {
                editingFavIndex = null;
                // Un ping carte encore actif n'aurait plus de champ où écrire
                if (pickingMode === 'contact-addr') {
                    pickingMode = null;
                    document.getElementById('map')?.classList.remove('crosshair-cursor');
                    document.getElementById('map-pick-hint')?.classList.remove('visible');
                    document.getElementById('btn-pick-contact-addr')?.classList.remove('active');
                }
                clearContactTempMarker();
                // Retour au panneau complet, tel qu'il était avant l'ouverture du formulaire
                if (panel) panel.classList.remove('contact-focus');
                /* Uniquement si un formulaire était bien ouvert : cette fonction sert aussi
                   d'appel de nettoyage (entrée en saisie destination, effacement), et il ne
                   faut pas qu'elle impose 'full' au passage. */
                if (wasOpen) setPanelSnap('full');
                return;
            }
            // Mode création (bouton "+")
            editingFavIndex = null;
            clearContactTempMarker();
            // Pré-remplir l'adresse avec la destination si déjà saisie
            const dest = document.getElementById('end-addr').value.trim();
            if (dest && dest !== '📍 Recherche...') {
                document.getElementById('contact-adresse').value = dest;
                contactAdresseCoords = exactEndCoords;
            } else {
                document.getElementById('contact-adresse').value = '';
                contactAdresseCoords = null;
            }
            document.getElementById('contact-nom').value = '';
            document.getElementById('contact-prenom').value = '';
            document.getElementById('contact-telephone').value = '';
            const st = document.getElementById('contact-form-status');
            if (st) st.style.display = 'none';
            // Titre du formulaire
            form.querySelector('.contact-form-title').textContent = '👤 Nouveau contact';
            // Le reste du panneau est masqué : le formulaire tient déjà en haut,
            // un scrollIntoView n'a plus lieu d'être et provoquerait un saut inutile.
            if (panel) panel.classList.add('contact-focus');
            setPanelSnap('full');
            setTimeout(() => { if (panel) panel.scrollTop = 0; }, 320);
            document.getElementById('contact-nom').focus();
        }

        function editSelectedFavorite() {
            // activeFavIndex fait foi : le <select> revient à '' après chargement pour
            // rester resélectionnable (voir setFavDropdownLabel).
            const index = activeFavIndex;
            if (index === null || index === undefined || index === '') return;
            const fav = favorites[parseInt(index)];
            if (!fav) return;
            editingFavIndex = parseInt(index);

            const form = document.getElementById('create-contact-form');
            form.style.display = 'block';
            _setFavAddBtnVisible(false);

            // Pré-remplir avec les données du contact
            document.getElementById('contact-nom').value = fav.nom || '';
            document.getElementById('contact-prenom').value = fav.prenom || '';
            document.getElementById('contact-adresse').value = fav.address || '';
            document.getElementById('contact-telephone').value = fav.phone || '';
            contactAdresseCoords = fav.coords || null;

            const st = document.getElementById('contact-form-status');
            if (st) st.style.display = 'none';
            form.querySelector('.contact-form-title').textContent = `✏️ Modifier — ${fav.name}`;
            const panel = document.getElementById('ui-panel');
            if (panel) panel.classList.add('contact-focus');
            setPanelSnap('full');
            setTimeout(() => { if (panel) panel.scrollTop = 0; }, 320);
            document.getElementById('contact-nom').focus();
        }

        // Enregistrer (créer ou modifier) un contact depuis le formulaire
        function saveContactAsFavorite() {
            const nom = document.getElementById('contact-nom').value.trim();
            const prenom = document.getElementById('contact-prenom').value.trim();
            const adresse = document.getElementById('contact-adresse').value.trim();
            let phone = document.getElementById('contact-telephone').value.trim().replace(/\s/g, '');
            const statusEl = document.getElementById('contact-form-status');
            const statusBox = document.getElementById('status');

            if (!prenom && !nom) {
                statusEl.textContent = '⚠️ Renseignez au moins le prénom ou le nom.';
                statusEl.style.color = '#f39c12'; statusEl.style.display = 'block'; return;
            }
            if (!adresse) {
                statusEl.textContent = '⚠️ Renseignez une adresse.';
                statusEl.style.color = '#f39c12'; statusEl.style.display = 'block'; return;
            }

            // Normaliser le téléphone
            if (phone.startsWith('0') && phone.length === 10) phone = '+33' + phone.slice(1);

            // Nom d'affichage : "Prénom NOM"
            const displayName = [prenom, nom.toUpperCase()].filter(Boolean).join(' ');

            // Coords : priorité autocomplete → destination actuelle si adresse identique
            const destAddr = document.getElementById('end-addr').value.trim();
            const coords = contactAdresseCoords || ((adresse === destAddr && exactEndCoords) ? exactEndCoords : null);

            const contactData = { name: displayName, nom, prenom, address: adresse, coords, phone: phone || null };

            if (editingFavIndex !== null) {
                // Mode édition : mettre à jour le contact existant
                favorites[editingFavIndex] = { ...favorites[editingFavIndex], ...contactData };
                localStorage.setItem('gps_favorites', JSON.stringify(favorites));
                const savedIdx = editingFavIndex;
                renderFavoritesDropdown();
                updateFavPhoneUI(String(savedIdx));
                setFavDropdownLabel(favorites[savedIdx].prenom || favorites[savedIdx].name);
                statusEl.textContent = `✅ Contact "${displayName}" mis à jour !`;
                statusBox.innerText = `✏️ Contact "${displayName}" modifié.`;
            } else {
                // Mode création : vérifier doublon et ajouter
                if (favorites.some(f => f.address === adresse && f.name === displayName)) {
                    statusEl.textContent = 'Ce contact existe déjà.';
                    statusEl.style.color = '#f39c12'; statusEl.style.display = 'block'; return;
                }
                favorites.push(contactData);
                localStorage.setItem('gps_favorites', JSON.stringify(favorites));
                renderFavoritesDropdown();
                // Remettre sur "Choisir un contact" après création
                document.getElementById('fav-dropdown').value = '';
                updateFavPhoneUI('');
                statusEl.textContent = `✅ Contact "${displayName}" enregistré !`;
                statusBox.innerText = `⭐ Contact "${displayName}" ajouté aux favoris !`;
            }

            // Reset formulaire
            ['contact-nom','contact-prenom','contact-adresse','contact-telephone'].forEach(id => {
                document.getElementById(id).value = '';
            });
            contactAdresseCoords = null;
            editingFavIndex = null;
            statusEl.style.color = '#25d366'; statusEl.style.display = 'block';
            statusBox.style.color = '#4da3ff';

            setTimeout(() => toggleCreateContactForm(false), 1800);
        }

        /* Alimente les DEUX listes de contacts : celle du panneau Itinéraire et celle de la
           recherche en navigation. Une seule fonction pour les deux, sinon la liste ouverte
           en roulant resterait figée sur l'état du chargement de la page. */
        function renderFavoritesDropdown() {
            const vide = favorites.length === 0 ? '📋 Mes adresses (aucune)' : '📋 Choisir un contact...';
            ['fav-dropdown', 'nav-fav-dropdown'].forEach(id => {
                const dropdown = document.getElementById(id);
                if (!dropdown) return;
                dropdown.innerHTML = '';
                const placeholder = document.createElement('option');
                placeholder.value = '';
                placeholder.textContent = vide;
                dropdown.appendChild(placeholder);
                favorites.forEach((fav, index) => {
                    const opt = document.createElement('option');
                    opt.value = index;
                    // textContent et non innerText : `innerText` dépend du rendu, or une <option>
                    // n'a pas de boîte CSS tant que la liste est fermée — Firefox produit alors
                    // des entrées vides là où Chrome affiche le nom.
                    opt.textContent = fav.name;
                    dropdown.appendChild(opt);
                });
            });
        }

        /* Le contact sélectionné est affiché en RÉÉCRIVANT le libellé de l'option vide, puis
           en resélectionnant celle-ci. Deux problèmes réglés d'un coup :
           — le nom reste lisible après avoir vidé la destination (la croix ne l'efface plus) ;
           — la valeur du <select> revient à '', donc rechoisir le MÊME contact émet bien un
             `change`. Sans ça, un <select> reste muet quand on resélectionne sa valeur
             courante, et le contact semblait « ne pas se charger ».
           L'index réellement actif est conservé par updateFavPhoneUI() dans activeFavIndex,
           c'est lui qui fait foi pour les boutons Modifier / Supprimer. */
        function setFavDropdownLabel(name) {
            const dropdown = document.getElementById('fav-dropdown');
            if (!dropdown) return;
            const placeholder = dropdown.querySelector('option[value=""]');
            if (!placeholder) return;
            placeholder.textContent = name
                ? `📍 ${name}`
                : (favorites.length === 0 ? '📋 Mes adresses (aucune)' : '📋 Choisir un contact...');
            dropdown.value = '';
        }

        async function loadFavoriteAddress(index) {
            if (index === "") { updateFavPhoneUI(''); return; }
            const fav = favorites[index];
            const destInput = document.getElementById('end-addr');
            destInput.value = fav.address;
            /* Le champ est PARTAGÉ avec la dictée, qui le colore en style inline pour
               signaler son avancement. Une dictée ratée y laissait du rouge, et l'adresse
               enregistrée qu'on chargeait ensuite s'affichait comme un échec alors qu'elle
               est parfaitement valide. Chaque écriture dans ce champ doit reposer sa
               couleur : le style inline l'emporte sur la feuille de styles et personne
               d'autre ne viendra l'effacer. */
            destInput.style.color = '';
            updateFavPhoneUI(index);

            /* Les coordonnées enregistrées font foi : elles proviennent d'une sélection
               d'autocomplétion ou d'un géocodage validé. Re-géocoder à chaque sélection
               faisait dériver le point, Mapbox reformatant l'adresse au passage
               (« 20 bis Rue Wilhem » → « 20 Rue Wilhem ») et renvoyant un autre numéro.
               Le géocodage ne sert plus que de rattrapage pour les fiches sans coordonnées. */
            let favCoords = normalizeLngLat(fav.coords);
            if (!favCoords) {
                /* Rattrapage pour une fiche sans coordonnées. L'échec était avalé en
                   silence : ni marqueur, ni recadrage, ni explication — le contact
                   paraissait « ne pas se charger » alors que son adresse s'affichait bien.
                   On journalise, seul moyen de le constater depuis un téléphone. */
                try { favCoords = normalizeLngLat(await geocode(fav.address)); }
                catch (e) { favCoords = null; logAppError('loadFavoriteAddress/geocode', e); }
                if (favCoords) { // mémoriser pour ne pas re-géocoder à chaque sélection
                    fav.coords = favCoords;
                    try { localStorage.setItem('gps_favorites', JSON.stringify(favorites)); } catch (e) {}
                }
            }

            if (favCoords) {
                exactEndCoords = favCoords;
                if (endTempMarker) endTempMarker.remove();
                endTempMarker = addEmojiMarker(favCoords[0], favCoords[1], '🔴');
                focusDestinationOnMap(favCoords, { zoom: 16, duration: 600 });
            } else {
                if (endTempMarker) { endTempMarker.remove(); endTempMarker = null; }
                exactEndCoords = null;
                /* Sans coordonnées il n'y a rien à cadrer : on le DIT, au lieu de laisser
                   croire à un autozoom en panne. La fiche est modifiable dans la liste. */
                const statusBox = document.getElementById('status');
                if (statusBox) {
                    statusBox.innerText = `⚠️ Adresse de « ${fav.prenom || fav.name} » non localisable — modifiez la fiche.`;
                    statusBox.style.color = '#f39c12';
                }
            }

            // Pas de rappel du nom dans la ligne de statut : la liste « Adresses
            // enregistrées » l'affiche déjà juste au-dessus (setFavDropdownLabel).
            setFavDropdownLabel(fav.prenom || fav.name);
        }

        function deleteSelectedFavorite() {
            // Comme editSelectedFavorite : c'est activeFavIndex qui désigne le contact affiché.
            const index = activeFavIndex;
            const statusBox = document.getElementById('status');
            if (index === null || index === undefined || index === "" || !favorites[index]) {
                statusBox.innerText = "Sélectionnez d'abord un favori dans la liste."; statusBox.style.color = "#ff6b6b"; return;
            }
            const removedName = favorites[index].name;
            favorites.splice(index, 1);
            localStorage.setItem('gps_favorites', JSON.stringify(favorites));
            renderFavoritesDropdown();
            updateFavPhoneUI(''); // plus aucun contact actif : masque Modifier, remet le libellé
            statusBox.innerText = `🗑️ Favori supprimé : ${removedName}`; statusBox.style.color = "#ff6b6b";
        }
        loadFavoritesFromStorage();

        // ═══════════════════════════════════════════════════════════

        // === OBJECTIFS HEBDOMADAIRES ===
        // 3 objectifs aléatoires générés chaque lundi, stockés en localStorage.
        // Progression mise à jour à chaque fin de trajet.
        // Bonus : coffre Légendaire garanti si les 3 sont atteints avant dimanche soir.

        /* ⚠ AUCUNE MISSION COMPTÉE EN NOMBRE DE TRAJETS — retiré le 18/08/2026, à ne pas
           réintroduire. Quatre gabarits existaient (trips_long, trips_total, perfect_runs,
           trips_short) : compter des trajets, même qualifiés "sans excès", encourage
           mécaniquement à en multiplier le nombre plutôt qu'à bien conduire — et
           `trips_total` allait jusqu'à l'écrire noir sur blanc, « avec ou sans excès »,
           un objectif que l'appli ne peut pas se permettre de tolérer. Seules des mesures
           qui ne se contournent pas en enchaînant les trajets restent : km parcourus,
           points accumulés. */
        const WEEKLY_GOAL_TEMPLATES = [
            { id: 'km_no_speed',   text: 'Parcourir {v} km sans excès de vitesse',       unit: 'km',     min: 50,  max: 200, step: 25 },
            { id: 'km_total',      text: 'Parcourir {v} km au total',                     unit: 'km',     min: 80,  max: 300, step: 20 },
            { id: 'score_total',   text: 'Accumuler {v} points sur la semaine',            unit: 'pts',    min: 20,  max: 80,  step: 5 },
        ];

        function getWeekId() {
            const now = new Date();
            const jan1 = new Date(now.getFullYear(), 0, 1);
            const weekNum = Math.ceil(((now - jan1) / 86400000 + jan1.getDay() + 1) / 7);
            return now.getFullYear() + '-W' + weekNum;
        }

        // `getTimeUntilEndOfWeek()` a rejoint js/00-noyau-calculs.js, où l'instant lui
        // est injecté en paramètre pour être testable (le repli `new Date()` conserve
        // le comportement : aucun appelant n'a changé).

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
            /* ⚠ Ne plus exclure km_total/km_no_speed pendant la phase d'observation
               (corrigé le 18/08/2026). Ce filtre s'appuyait sur les missions comptées en
               trajets pour remplir les 3 objectifs hebdomadaires avant que la baseline ne
               soit connue — leur retrait ne laissait plus alors QUE score_total.
               Les deux gabarits km gardent de toute façon leurs plages par défaut
               (min/max déclarés ci-dessus) tant qu'aucune baseline n'existe pour les
               adapter : elles ne sont pas ajustées à l'utilisateur cette semaine-là, mais
               restent des cibles raisonnables (50-200 km / 80-300 km), pas absentes. */
            if (baselineKm === null) {
                return WEEKLY_GOAL_TEMPLATES;
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
                    case 'km_total':      g.progress += distKm; break;
                    case 'score_total':   g.progress += score; break;
                }
                // Plafonner la progression au target
                g.progress = Math.min(g.progress, g.target);
            });
            saveWeeklyGoals(data);
            /* Le parcours se met à jour ici et pas seulement à l'affichage du
               carnet : la fenêtre « Qui sauvons-nous ? » doit dire vrai même si
               l'utilisateur ne rouvre jamais l'onglet Objectifs. */
            synchroniserParcours();
            updateWeeklyGoalsButton();
            console.log('[Badge] goals après trajet:', data.goals.map(g => `${g.id}: ${g.progress}/${g.target}`), '— bonusClaimed:', data.bonusClaimed, '— allCompleted:', allGoalsCompleted(data));
            // Attribution du badge si les 3 objectifs viennent d'être complétés.
            // On appelle awardWeeklyBadge() immédiatement (pas de setTimeout) :
            // si la fenêtre d'arrivée est ouverte à ce moment, showBadgeEarnedToast pose
            // _pendingBadgeModal=true et la modale part à sa fermeture (closeArrivalSummary).
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

        /* Une icône par famille d'objectif : la carte se reconnaît d'un coup d'œil
           sans lire son titre. Des SVG et pas des emojis, pour la même raison que
           la pastille du compte à rebours (voir plus bas).
           ⚠ La coche n'est plus posée en permanence : elle apparaît À LA PLACE de
           l'icône quand l'objectif est atteint. L'ancienne note s'inquiétait d'une
           case vide et d'un titre qui se décale — l'emblème garde ici sa taille et
           n'est jamais vide, les deux motifs tombent. */
        const WG_ICONES = {
            done:        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"><path d="m4.5 12.5 5 5 10-11"/></svg>',
            km_total:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 14.5 4.7 9a2 2 0 0 1 1.9-1.4h10.8A2 2 0 0 1 19.3 9L21 14.5v4a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1v-1H7v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z"/><path d="M6.5 14h.01M17.5 14h.01"/></svg>',
            km_no_speed: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s7-5 7-10a7 7 0 1 0-14 0c0 5 7 10 7 10Z"/><path d="M9.5 11.5 11.5 14l3.5-4"/></svg>',
            score_total: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12Z"/></svg>'
        };

        function renderWeeklyGoalsPanel() {
            const data = loadWeeklyGoals();

            /* Le compte à rebours : pastille encadrée, en haut à droite du titre.
               C'est la seule information périssable de l'écran ; sa légende « Temps
               restant » a sauté avec le déménagement dans l'en-tête — une horloge et
               « 3j 14h » se lisent sans qu'on les présente. */
            const timerEl = document.getElementById('weekly-goals-timer-panel');
            if (timerEl) {
                /* ⚠ SVG et NON un emoji horloge. La puce `.ui-dot` d'avant avait
                   justement remplacé un emoji (voir la note de `.ui-dot` dans le CSS) :
                   un emoji est rendu par la police système, sa taille et son alignement
                   vertical changent d'un appareil à l'autre. Un SVG est dessiné par le
                   navigateur, il ne bouge pas d'un téléphone au suivant — la raison de la
                   consigne est respectée, pas contournée. */
                timerEl.innerHTML = `
                    <div class="wg-timer-pill">
                        <svg class="wg-timer-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/></svg>
                        ${getTimeUntilEndOfWeek()}
                    </div>`;
            }

            // Le carnet est celui du compagnon : c'est lui qui le signe.
            const kickerEl = document.getElementById('carnet-kicker');
            if (kickerEl && window.Compagnon) kickerEl.textContent = 'Le carnet de ' + Compagnon.nom();

            const listEl = document.getElementById('weekly-goals-list-panel');
            if (!listEl) return;

            /* Le mot du compagnon. C'est l'ancienne note de baseline (« Objectifs
               adaptés à ton profil » / « Phase d'observation »), reformulée dans SA
               voix : les phrases vivent dans js/22-compagnon.js, ici on ne fournit
               que les chiffres. Si le module ne s'est pas chargé, la carte reste
               vide plutôt que de laisser un texte orphelin. */
            const baseline = getKmBaseline();
            const weeksCount = getHistoryWeeksCount();
            const motEl = document.getElementById('carnet-mot');
            if (motEl && window.Compagnon) {
                const texte = baseline !== null
                    ? Compagnon.phrase('carnet_cale', { km: Math.round(baseline) })
                    : Compagnon.phrase('carnet_observe', {
                          sem: weeksCount, total: BASELINE_MIN_WEEKS,
                          reste: (BASELINE_MIN_WEEKS - weeksCount) + ' sem.' });
                motEl.innerHTML = `<div class="carnet-mot-dessin">${Compagnon.dessin('repos')}</div>
                                   <div class="carnet-mot-texte"></div>`;
                // textContent : la phrase peut contenir des chiffres venus de l'app.
                motEl.querySelector('.carnet-mot-texte').textContent = texte;
            }

            const cartes = data.goals.map(g => {
                const pct = Math.min(100, Math.round((g.progress / g.target) * 100));
                const done = g.progress >= g.target;
                /* Valeur atteinte et cible séparées : c'est le chiffre de gauche qui
                   change, et le mettre en avant permet de suivre sa progression sans lire
                   la phrase entière. */
                const valeur = g.unit === 'trajets' ? String(Math.floor(g.progress)) : g.progress.toFixed(1);
                const total  = g.unit === 'km' ? `/ ${g.target} km`
                             : g.unit === 'pts' ? `/ ${g.target} pts`
                             : `/ ${g.target} trajets`;
                const adaptatif = g.adaptive ? '<span class="wg-tag">sur mesure</span>' : '';
                /* L'emblème n'est JAMAIS vide : icône de la famille d'objectif tant que
                   c'est en cours, coche verte une fois atteint (voir WG_ICONES). La règle
                   d'origine — ne jamais laisser une case vide, ne jamais décaler le titre
                   au moment de la réussite — tient toujours : la boîte garde sa taille,
                   seul son contenu change.
                   ⚠ Ce commentaire est DEHORS du gabarit, et doit y rester : il contient
                   des accents graves, qui refermeraient le littéral s'ils étaient dedans
                   (c'est exactement ce qui a vidé cette page le 21/08/2026). */
                return `
                    <div class="wg-item wg-${g.id} ${done ? 'completed' : ''}">
                        <div class="wg-emblem wg-emblem-${g.id}">${done ? WG_ICONES.done : (WG_ICONES[g.id] || WG_ICONES.done)}</div>
                        <div class="wg-body">
                            <div class="wg-head">
                                <div class="wg-item-title">${g.text}${adaptatif}</div>
                                <div class="wg-item-progress"><span class="wg-val">${valeur}</span><span class="wg-tot">${total}</span></div>
                            </div>
                            <div class="wg-item-bar"><div class="wg-item-fill ${done ? 'done' : ''}" style="width:${pct}%"></div></div>
                        </div>
                    </div>`;
            }).join('');

            // Une seule écriture du DOM plutôt qu'un `innerHTML +=` par objectif, qui
            // reparsait tout le bloc à chaque tour.
            listEl.innerHTML = cartes;

            /* Le parcours : où en est l'histoire de l'animal en cours.
               ⚠ 25/08/2026 — LA CLAIRIÈRE A ÉTÉ RETIRÉE D'ICI. Elle disait la même
               chose que le parcours (un motif par mission bouclée) dans le même
               paysage : deux images du même décor à la suite, et à la libération
               l'animal apparaissait deux fois sur le même écran. Le décor n'a pas
               disparu pour autant — il est devenu la fiche d'un animal sauvé, qu'on
               ouvre en le touchant dans « Qui sauvons-nous ? » (js/23).
               `Compagnon.clairiere()` existe toujours et n'est plus appelée. */
            renderParcoursPanel();

            const bonusEl = document.getElementById('weekly-goals-bonus-panel');
            if (!bonusEl) return;
            if (allGoalsCompleted(data) && !data.bonusClaimed) {
                bonusEl.innerHTML = `<button class="wg-claim-btn" onclick="claimWeeklyBonus()">🏅 RÉCUPÉRER MON BADGE</button>`;
            } else if (allGoalsCompleted(data) && data.bonusClaimed) {
                /* 25/08/2026 — La carte « Badge obtenu ! » (médaille + catégorie) a été
                   SUPPRIMÉE. Depuis le parcours en trois étapes, la récompense de la
                   semaine n'est plus une médaille mais une étape franchie, et le bloc
                   du parcours, juste au-dessus, la montre déjà en grand. Répéter une
                   médaille dessous racontait deux récompenses pour une seule semaine.
                   Le badge lui-même n'est pas supprimé : il continue d'alimenter le
                   rang de l'onglet Profil (voir awardWeeklyBadge). */
                bonusEl.innerHTML = '';
            } else {
                const remaining = data.goals.filter(g => g.progress < g.target).length;
                bonusEl.innerHTML = `<div class="wg-remaining">🏅 Complétez les ${remaining} objectif${remaining > 1 ? 's' : ''} restant${remaining > 1 ? 's' : ''} pour obtenir votre badge de la semaine !</div>`;
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

        // ═══════════════════════════════════════════════════════════
        // === LE PARCOURS DU COMPAGNON ===
        // Une mission bouclée = une étape franchie : Le Sauvetage, La Grande
        // Échappée, Le Grand Envol. Les trois missions de la semaine suffisent
        // donc à libérer un animal — c'est le rythme voulu (25/08/2026), trois
        // semaines pour un seul animal était trop long pour qu'on voie la fin.
        // Le badge de la semaine n'est pas supprimé : il continue d'alimenter le
        // rang, mais ce n'est plus lui qu'on montre dans le carnet.
        //
        // ⚠ C'est le NOMBRE de missions bouclées qui compte, jamais LAQUELLE.
        // Les objectifs se remplissent dans le désordre : si « 60 points » tombe
        // avant « 200 km », lier la mission 3 à l'étape 3 montrerait l'animal au
        // point d'eau avec sa cage encore fermée. Avec le compte, l'ordre du
        // récit tient toujours.
        //
        // ⚠ Le compte est PAR COMPAGNON. Changer d'animal ne transfère rien :
        // chacun a son histoire, et un animal déjà sauvé le reste. C'est ce qui
        // permet à la fenêtre de choix de dire qui est encore en cage.
        //
        // ⚠ RIEN NE REDESCEND, y compris au changement de semaine. Un animal
        // laissé à l'étape 2 le dimanche soir est encore à l'étape 2 le lundi :
        // les nouvelles missions reprennent où il en était, il lui en reste une
        // pour être libre. Faire repartir la cage chaque lundi serait le
        // reproche que les décors s'interdisent (voir js/22-compagnon.js).
        // ═══════════════════════════════════════════════════════════

        const PARCOURS_KEY = 'salif_gps_parcours';
        function _parcoursKey() { return activeProfileId ? `${PARCOURS_KEY}_${activeProfileId}` : PARCOURS_KEY; }
        const PARCOURS_ETAPES = 3;

        function loadParcours() {
            try {
                const raw = localStorage.getItem(_parcoursKey());
                return raw ? JSON.parse(raw) : {};
            } catch(e) { return {}; }
        }

        function saveParcours(data) {
            try { localStorage.setItem(_parcoursKey(), JSON.stringify(data)); }
            catch(e) { if (typeof DEBUG !== 'undefined' && DEBUG) console.warn('[parcours] écriture impossible :', e); }
        }

        function compagnonCourant() {
            return (window.Compagnon && Compagnon.cle) ? Compagnon.cle() : 'babi';
        }

        /* La fiche d'un animal : ce qu'il a acquis (`etapes`), et de quoi ne pas
           compter deux fois la même mission (`semaine` + `comptees`).
           La forme d'origine était un simple nombre — les fiches déjà écrites
           sont relues sans être perdues. */
        function _fiche(p, cle) {
            const brut = p[cle];
            if (typeof brut === 'number') return { etapes: brut, semaine: null, comptees: 0 };
            if (!brut || typeof brut !== 'object') return { etapes: 0, semaine: null, comptees: 0 };
            return {
                etapes:   Math.min(PARCOURS_ETAPES, brut.etapes || 0),
                semaine:  brut.semaine || null,
                comptees: brut.comptees || 0
            };
        }

        /* Met la fiche du compagnon courant à jour d'après les missions bouclées
           cette semaine, et renvoie le nombre d'étapes acquises.
           ⚠ IDEMPOTENT, par construction : on ne guette pas l'instant où une
           mission se termine (un rendu manqué et l'étape serait perdue), on
           compare l'état du moment à ce qui a DÉJÀ été compté cette semaine.
           L'appeler dix fois de suite donne le même résultat qu'une. */
        function synchroniserParcours() {
            const cle = compagnonCourant();
            const p = loadParcours();
            const f = _fiche(p, cle);

            let bouclees = 0, semaine = null;
            try {
                const data = loadWeeklyGoals();
                semaine = data.week;
                bouclees = data.goals.filter(g => g.progress >= g.target).length;
            } catch(e) {
                if (typeof DEBUG !== 'undefined' && DEBUG) console.warn('[parcours] objectifs illisibles :', e);
                return f.etapes;
            }

            // Nouvelle semaine : le compteur du « déjà compté » repart de zéro,
            // les étapes acquises ne bougent pas.
            if (f.semaine !== semaine) { f.semaine = semaine; f.comptees = 0; }

            if (bouclees > f.comptees) {
                f.etapes = Math.min(PARCOURS_ETAPES, f.etapes + (bouclees - f.comptees));
                f.comptees = bouclees;
            } else if (bouclees < f.comptees) {
                // Remise à zéro des objectifs (outil de debug) : on réaligne le
                // compteur pour que les missions suivantes comptent à nouveau,
                // sans jamais faire reculer les étapes déjà acquises.
                f.comptees = bouclees;
            }

            p[cle] = f;
            saveParcours(p);

            /* Le classement en ligne compte des ANIMAUX SAUVÉS depuis le 25/08/2026 :
               c'est ici, et nulle part ailleurs, qu'un parcours peut se terminer. Un
               appel par synchronisation plutôt qu'un guet de l'instant du sauvetage —
               `clAnimauxMaj()` compare et ne fait rien quand rien n'a changé.
               `typeof` + `try` : js/21 est chargé APRÈS ce fichier et peut ne pas
               exister du tout (CDN Supabase bloqué). Le parcours, lui, est déjà écrit. */
            if (typeof clAnimauxMaj === 'function') {
                try { clAnimauxMaj(); } catch (e) { logAppError('classement/animauxMaj', e); }
            }
            return f.etapes;
        }

        /* Le nombre d'étapes acquises AVEC cet animal, plafonné : au-delà de
           trois il est sauvé, un quatrième chiffre ne voudrait rien dire.
           Lecture seule — c'est synchroniserParcours() qui écrit. */
        function etapesCompagnon(cle) {
            return _fiche(loadParcours(), cle || compagnonCourant()).etapes;
        }

        function compagnonEstSauve(cle) {
            return etapesCompagnon(cle) >= PARCOURS_ETAPES;
        }

        /* Combien d'animaux ont été menés au bout. C'est ce chiffre qui ouvre la
           troupe petit à petit dans la fenêtre de choix : deux animaux au
           départ, un de plus à chaque sauvetage. Montrer les six d'emblée
           dépensait toute la découverte au premier écran. */
        function nbAnimauxSauves() {
            const p = loadParcours();
            return Object.keys(p).filter(cle => _fiche(p, cle).etapes >= PARCOURS_ETAPES).length;
        }

        // La fenêtre de choix (js/23) a besoin de savoir qui est sauvé ; elle
        // n'a pas à connaître le stockage pour autant.
        window.compagnonEstSauve = compagnonEstSauve;
        window.etapesCompagnon = etapesCompagnon;
        window.nbAnimauxSauves = nbAnimauxSauves;

        /* Le bloc du carnet : l'étape en cours en grand, les suivantes en
           vignettes verrouillées. Le module compagnon ne calcule rien — on lui
           passe l'étape et l'état « libre » déjà faits. */
        function renderParcoursPanel() {
            if (!window.Compagnon || !Compagnon.parcours) return;
            const acquises = synchroniserParcours();
            Compagnon.parcours('parcours-panel', {
                etape:    Math.min(PARCOURS_ETAPES, acquises + 1),
                libre:    acquises >= PARCOURS_ETAPES,
                acquises: acquises,
                total:    PARCOURS_ETAPES
            });
        }


        /* Le picto de la catégorie, en SVG. Les emojis de `BADGE_CATEGORIES` sont
           CONSERVÉS : ils servent aux toasts, à la galerie et aux notifications, où
           un caractère suffit. Ici, en tête de page et à côté du portrait, il fallait
           un dessin qui prenne la couleur de la catégorie et garde exactement la même
           taille d'un téléphone à l'autre — ce qu'un emoji, rendu par la police
           système, ne fait pas.
           Le trait vaut `currentColor` : la couleur est posée une fois sur le
           conteneur, à partir de `cat.color`. */
        const CAT_PICTOS = {
            Bronze:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14.5" r="7"/><path d="M9 7.5 7 3M15 7.5 17 3"/></svg>',
            Argent:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14.5" r="7"/><path d="M9 7.5 7 3M15 7.5 17 3"/><path d="M12 11.5v6"/></svg>',
            Or:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="14.5" r="7"/><path d="M9 7.5 7 3M15 7.5 17 3"/><circle cx="12" cy="14.5" r="2.6"/></svg>',
            Platine:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 21 12l-9 9-9-9Z"/></svg>',
            Diamant:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3h12l3 6-9 12L3 9Z"/><path d="M3 9h18M9 3 6 9l6 12M15 3l3 6-6 12"/></svg>',
            'Élite':  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2s5 5 5 9a5 5 0 0 1-10 0c0-1.6.8-3.2 1.8-4.5C9.6 8.7 10 10 11 10c1.4 0 1-3 1-8Z"/><path d="M12 22a4 4 0 0 0 4-4c0-2-2-3.5-4-5.5-2 2-4 3.5-4 5.5a4 4 0 0 0 4 4Z"/></svg>',
            Champion: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v5a5 5 0 0 1-10 0Z"/><path d="M7 5.5H4.5V8a3 3 0 0 0 3 3M17 5.5h2.5V8a3 3 0 0 1-3 3"/><path d="M12 14v3M9 20h6"/></svg>',
            Ange:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="4" rx="4.5" ry="1.8"/><circle cx="12" cy="10.5" r="3"/><path d="M9 15c-2.5-2-6-2-6 1s3.5 3.5 6 1.5M15 15c2.5-2 6-2 6 1s-3.5 3.5-6 1.5"/><path d="M8.5 21a3.5 3.5 0 0 1 7 0"/></svg>'
        };

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
            /* Le parcours n'avance PLUS ici : depuis le 25/08/2026 c'est chaque
               mission qui franchit une étape, pas la semaine entière. La
               troisième mission a donc déjà libéré l'animal quand on arrive ici
               (voir synchroniserParcours). */
            console.log('[Badge] total après attribution:', badges.total);

            renderBadgeCategoryCard();
            updateWeeklyGoalsButton();
            renderWeeklyGoalsPanel();
            showBadgeEarnedToast(badges.total);
        }

        /* ═══ LE LECTEUR DE VIDÉO — UN SEUL, POUR TOUTE L'APP ═══ (25/08/2026)

           Il servait UNIQUEMENT aux vidéos de catégorie de badge (Bronze, Argent…),
           d'où son nom d'origine. Ces vidéos-là ont été RETIRÉES : terminer les
           objectifs de la semaine n'ouvre plus de vidéo de médaille. Elles seront
           remplacées par des vidéos d'ANIMAL — sa cage quand on le choisit, sa
           libération quand son parcours s'achève.

           Le lecteur, lui, ne bouge pas : c'est du code éprouvé sur Android, et
           chacune de ses précautions vient d'un incident réel. Ne rien en retirer
           en le croyant décoratif :
             · les trois `on…` sont remis à null AVANT d'être reposés — sans ça,
               un handler résiduel relançait la vidéo en boucle sur Android ;
             · `onerror` enchaîne la suite au lieu de bloquer. ⚠ C'EST UN PIÈGE
               AUTANT QU'UNE PROTECTION : un fichier absent ou mal nommé ne produit
               AUCUN message, la suite se déroule comme si la vidéo avait été vue.
               C'est ce qui se passait pour toutes les catégories au-dessus de
               Bronze, dont le fichier n'a jamais existé. Devant une vidéo qui « ne
               se lance pas », vérifier d'abord que le chemin et la CASSE du nom
               correspondent exactement au fichier sur le disque ;
             · `oncanplay` n'ouvre la fenêtre qu'une fois la vidéo prête, sinon on
               affiche un carré noir le temps du chargement.

           ⚠ LA LECTURE AUTOMATIQUE N'EST PAS ACQUISE. Android refuse de démarrer
           une vidéo AVEC SON hors d'un geste de l'utilisateur, et le `.catch()`
           ci-dessous avale ce refus en silence : la fenêtre s'ouvrirait sur une
           image figée. Tant que le lecteur est déclenché par un appui (choisir un
           animal, toucher « voir »), tout va bien. Le jour où une vidéo devra
           partir seule en fin de trajet, il faudra la passer en `muted`. */

        let _videoSuite = null;   // ce qu'on fait quand la vidéo se termine ou qu'on la passe

        function jouerVideo(chemin, apres) {
            const suite = (typeof apres === 'function') ? apres : function () {};
            if (!chemin) { suite(); return; }

            const modal = document.getElementById('badge-video-modal');
            const videoEl = document.getElementById('badge-video-el');
            if (!modal || !videoEl) { suite(); return; }

            _videoSuite = suite;

            videoEl.oncanplay = null;
            videoEl.onended   = null;
            videoEl.onerror   = null;

            videoEl.src = chemin;
            videoEl.currentTime = 0;

            videoEl.oncanplay = () => {
                modal.classList.add('visible');
                videoEl.play().catch(() => {});
            };
            videoEl.onended = () => {
                videoEl.onended = null;
                fermerVideo();
                const f = _videoSuite; _videoSuite = null;
                if (f) f();
            };
            videoEl.onerror = () => {
                videoEl.onerror = null;
                videoEl.src = '';
                console.warn('[Vidéo] introuvable ou illisible :', chemin);
                const f = _videoSuite; _videoSuite = null;
                if (f) f();
            };

            videoEl.load();
        }

        /* Le bouton « Passer ›  » de #badge-video-modal. Il fait exactement ce que
           fait la fin naturelle de la vidéo — sinon passer et regarder jusqu'au
           bout ne mèneraient pas au même endroit. */
        function passerVideo() {
            const videoEl = document.getElementById('badge-video-el');
            if (videoEl) { videoEl.onended = null; videoEl.onerror = null; videoEl.oncanplay = null; }
            fermerVideo();
            const f = _videoSuite; _videoSuite = null;
            if (f) f();
        }

        function fermerVideo() {
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

            /* ⚠ PLUS DE VIDÉO DE MÉDAILLE ICI (25/08/2026). Le bouton proposait
               « 🎬 Voir ma récompense » sur chaque nouvelle catégorie, et lançait
               la vidéo de la catégorie. Ces vidéos sont retirées : la récompense
               d'un parcours mené au bout, ce n'est plus une médaille qui tourne
               sur elle-même, c'est l'animal qu'on libère. Sa vidéo se lancera à
               sa place, et elle est propre à l'ANIMAL, pas à la catégorie — le
               lecteur générique `jouerVideo()` est prêt pour ça.
               Un seul bouton reste donc, et il ferme. */
            const closeBtn = document.getElementById('badge-unlocked-close');
            closeBtn.textContent = 'Super, merci !';
            closeBtn.onclick = closeBadgeUnlockedModal;

            document.getElementById('badge-unlocked-modal').classList.add('visible');
            _pendingBadgeModal = false;
        }

        function closeBadgeUnlockedModal() {
            document.getElementById('badge-unlocked-modal').classList.remove('visible');
            renderBadgeCategoryCard();
        }

        // Conserver pour compatibilité interne (appelé depuis awardWeeklyBadge)
        function showBadgeEarnedToast(newTotal) {
            /* ⚠ UN BADGE NE PART JAMAIS PAR-DESSUS LA FENÊTRE D'ARRIVÉE (21/08/2026).
               Le test d'origine ne regardait que le coffre à butin : sur un trajet arrivé
               sans conduite parfaite, aucun coffre ne s'ouvrait — la modale de badge
               partait donc « immédiatement », c'est-à-dire par-dessus la fenêtre d'arrivée
               que `stopCourse()` venait d'ouvrir deux lignes plus haut.
               Le coffre supprimé (25/08/2026), il ne reste qu'une fenêtre à surveiller, et
               c'est `closeArrivalSummary()` qui libère le badge en attente. */
            const arrivee = document.getElementById('arrival-modal-overlay');
            const finOuverte = !!(arrivee && arrivee.classList.contains('open'));
            console.log('[Badge] showBadgeEarnedToast — total:', newTotal, '— fenêtre de fin ouverte:', finOuverte);
            // Toujours stocker le total en attente — closeArrivalSummary l'affichera si la
            // fenêtre de fin est ouverte, sinon on l'affiche immédiatement
            _pendingBadgeTotal = newTotal;
            if (finOuverte) {
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
            const kickerEl = document.getElementById('badge-category-kicker-txt');

            if (!iconEl) return;

            /* Le picto de la catégorie : innerHTML et non textContent — c'est un SVG
               depuis le 24/08/2026, plus un emoji (voir CAT_PICTOS). */
            iconEl.innerHTML     = CAT_PICTOS[cat.name] || CAT_PICTOS.Bronze;
            iconEl.style.color   = cat.color;
            nameEl.textContent   = cat.name;
            nameEl.style.color   = cat.color;
            if (cardEl) {
                cardEl.style.borderColor = cat.color + '55';
                /* Le fond de la carte prend la teinte du rang : c'est le seul élément de
                   la page qui change d'aspect en montant de catégorie. */
                cardEl.style.background = 'linear-gradient(150deg, ' + cat.color + '26, rgba(255,255,255,0.03))';
            }

            /* Le portrait : le compagnon porte la médaille de la catégorie, le nombre de
               badges gravé dessus. Le sous-titre passe dans sa voix (« Encore 3 badges et
               il passe Argent. ») — l'ancien « 0 badge obtenu » disait la même chose que
               la médaille juste à côté. */
            if (window.Compagnon) {
                Compagnon.rang('badge-category-portrait', { couleur: cat.color, chiffre: total });
                if (kickerEl) kickerEl.textContent = 'Rang de ' + Compagnon.nom();
                subEl.textContent = next
                    ? Compagnon.phrase('rang_progres', { reste: next.min - total, suivant: next.name })
                    : Compagnon.phrase('rang_max');
            } else {
                subEl.textContent = `${total} badge${total > 1 ? 's' : ''} obtenu${total > 1 ? 's' : ''}`;
            }

            /* Les chiffres du profil. `profiles` / `activeProfileId` vivent dans js/13,
               chargé après celui-ci : lecture au runtime uniquement.
               ⚠ #profil-stat-points N'EST PLUS DANS LA PAGE depuis le 26/08/2026 (tuile
               « points au total » retirée) : le `if (ptsEl)` ci-dessous n'est donc plus
               une précaution, c'est le cas normal. Le bloc est gardé tel quel — remettre
               la tuile dans le HTML suffirait à la réalimenter. */
            const ptsEl = document.getElementById('profil-stat-points');
            if (ptsEl) {
                const actifPts = tenterSansBruit(
                    () => profiles.find(p => p.id === activeProfileId), 'badgeCard/points');
                const pts = actifPts ? actifPts.totalPoints : 0;
                ptsEl.textContent = Math.round(pts).toLocaleString('fr-FR');
            }
            const ecoEl = document.getElementById('profil-stat-eco');
            if (ecoEl) {
                /* Moyenne sur TOUT l'historique, et non sur la semaine comme la clairière :
                   le Profil est une vue d'ensemble. Sans trajet noté, un tiret — annoncer
                   100 laisserait croire à une conduite parfaite qui n'a jamais eu lieu. */
                const notes = tenterSansBruit(
                    () => getTripHistory().filter(t => t.ecoScore != null), 'badgeCard/eco') || [];
                ecoEl.textContent = notes.length
                    ? String(Math.round(notes.reduce((n, t) => n + t.ecoScore, 0) / notes.length))
                    : '—';
            }

            /* Prénom du profil actif dans la carte. Posé ICI et nulle part ailleurs :
               `renderBadgeCategoryCard()` est déjà rappelée par TOUS les chemins qui
               changent de profil — `selectProfile()` (js/13), l'import de profil (js/02),
               l'ouverture de l'onglet Profil (js/14) — alors qu'un rafraîchissement écrit
               à part en aurait forcément raté un. Les badges affichés étant eux-mêmes
               ceux du profil actif, le nom et le contenu de la carte ne peuvent pas
               diverger. `profiles` / `activeProfileId` vivent dans js/13, chargé après
               celui-ci : lecture au runtime uniquement, jamais au chargement. */
            const profilEl = document.getElementById('badge-category-profile');
            if (profilEl) {
                const actif = tenterSansBruit(
                    () => profiles.find(p => p.id === activeProfileId), 'badgeCard/profilActif');
                profilEl.textContent   = actif ? actif.name : '';
                profilEl.style.display = actif ? '' : 'none';
            }

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
                labelEl.textContent    = `${earnedInCat} / ${sizeOfCat} badges`;
            } else {
                barEl.style.width      = '100%';
                barEl.style.background = cat.color;
                labelEl.textContent    = 'Catégorie maximale';
            }
        }

        function claimWeeklyBonus() {
            awardWeeklyBadge();
        }

        /* ═══ GALERIE DES TROPHÉES — RETIRÉE (26/08/2026) ═══
           `toggleTrophyGallery()`, `renderTrophyGallery()` et `refreshTrophyGalleryCount()`
           ont été supprimées avec la section du Profil qu'elles peignaient. Elles
           montraient les huit catégories de `BADGE_CATEGORIES` — le décompte de l'ancien
           système, celui d'avant les parcours d'animaux.

           ⚠ `BADGE_CATEGORIES` N'A PAS DISPARU POUR AUTANT : la carte de rang en tête de
           l'onglet Profil (`renderBadgeCategoryCard()`) s'en sert toujours, et le
           classement en ligne aussi. C'est la VITRINE qui est partie, pas les badges.

           Ce qui la remplace : « Animaux sauvés », js/25-animaux-sauves.js. Les trois
           appelants de `refreshTrophyGalleryCount()` (js/13 au changement de profil,
           js/14 en fin de trajet et à l'ouverture de l'onglet Profil) appellent
           désormais `rafraichirAnimauxSauves()`, qui suit exactement la même règle :
           ne repeindre que si la page est sous les yeux.

           `onProfilTabOpen()` est partie avec elles : elle ne faisait que relayer
           `refreshTrophyGalleryCount()`, et plus personne ne l'appelait depuis que
           js/14 s'en charge directement. */

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

           ⚠ `setTimeout(…, 0)` NE SUFFIT PAS — mesuré sur appareil le 15/08/2026.
           Le pari était que l'analyseur exécuterait les `<script src>` restants avant de
           dépiler la file des macrotâches. C'est vrai quand les fichiers sont déjà en
           cache, faux dans l'APK : servis depuis `file:///android_asset/`, ils se chargent
           assez lentement pour que l'analyseur rende la main à la boucle d'événements
           entre deux balises. Le timer se déclenchait donc AVANT l'évaluation du fichier
           15, et `loadVehicleConfig is not defined` revenait à chaque lancement — visible
           dans le journal d'erreurs de l'app, invisible au simulateur de bureau.

           `DOMContentLoaded` est la garantie recherchée : l'événement n'est émis qu'une
           fois TOUS les scripts non-`defer` exécutés. Le repli `setTimeout` couvre le cas
           où ce fichier serait un jour chargé après l'émission de l'événement. */
        (function initVehicleConfigWhenReady() {
            const lancer = () => {
                try { initVehicleConfigUI(); }
                catch (e) { logAppError('initVehicleConfigUI', e); }
            };
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', lancer, { once: true });
            } else {
                setTimeout(lancer, 0);
            }
        })();

        /* ⚡ BOUTON DEBUG — À SUPPRIMER APRÈS TEST
           Remet toute la troupe en cage : sans lui, un animal sauvé pendant les
           essais n'est plus jamais sélectionnable (voir `activer()`, js/23), et
           on ne peut plus regarder son dessin dans l'app.

           ⚠ IL REMET AUSSI LES OBJECTIFS DE LA SEMAINE À ZÉRO, et ce n'est pas
           un excès de zèle : `synchroniserParcours()` compare les missions
           bouclées à ce qui a DÉJÀ été compté. Vider le seul parcours laisserait
           trois missions bouclées face à un compteur à zéro — l'animal serait
           re-libéré dans la seconde, au premier rendu du carnet. Les deux vont
           donc ensemble ou pas du tout. */
        function _debugRemettreEnCage() {
            try { localStorage.removeItem(_parcoursKey()); } catch (e) { /* rien à défaire */ }

            const data = loadWeeklyGoals();
            data.goals.forEach(g => { g.progress = 0; });
            data.bonusClaimed = false;
            saveWeeklyGoals(data);

            if (window.Compagnon && Compagnon.choisir) Compagnon.choisir('babi');
            renderWeeklyGoalsPanel();
            updateWeeklyGoalsButton();
            if (typeof renderBadgeCategoryCard === 'function') renderBadgeCategoryCard();
            /* Le classement compte des animaux sauvés : il vient d'en perdre. */
            if (typeof clAnimauxMaj === 'function') {
                try { clAnimauxMaj(); } catch (e) { logAppError('classement/animauxMaj', e); }
            }
            console.log('[Debug] Troupe remise en cage, objectifs à zéro, compagnon = Babi.');
        }

        /* ⚡ BOUTON DEBUG — À SUPPRIMER APRÈS TEST
           Force les objectifs de la SEMAINE EN COURS à des cibles atteignables en
           une session d'essai : 20 km au total, 5 km sans excès, 30 points.

           Pourquoi un bouton et pas des chiffres modifiés dans les gabarits : les
           objectifs sont tirés une fois le lundi puis FIGÉS dans le stockage local.
           Abaisser `WEEKLY_GOAL_TEMPLATES` ne toucherait pas la semaine déjà
           commencée, et changerait le réglage du jeu pour toutes les suivantes.
           Ici on réécrit la semaine en cours, et elle seule : lundi prochain, le
           tirage aléatoire reprend ses plages normales.

           ⚠ LA PROGRESSION EST CONSERVÉE, pas remise à zéro — mais elle est
           replafonnée sur les nouvelles cibles, qui sont plus basses. Des km déjà
           roulés cette semaine peuvent donc BOUCLER une mission immédiatement, et
           `synchroniserParcours()` fera avancer le parcours de l'animal en
           conséquence. C'est voulu : l'inverse laisserait le carnet mentir.
           Le badge de la semaine n'est PAS attribué d'office ici (contrairement à
           « Objectifs 95% ») : il partira par le chemin normal, à la fin du
           prochain trajet, si les trois missions sont bien bouclées. */
        const _DEBUG_CIBLES_LEGERES = { km_total: 20, km_no_speed: 5, score_total: 30 };

        function _debugObjectifsLegers() {
            const data = loadWeeklyGoals();

            /* Reconstruit à partir des gabarits plutôt que de retoucher `target` sur
               place : le libellé (« Parcourir {v} km… ») reste écrit à UN seul endroit,
               et une semaine stockée avec d'anciens identifiants de mission — il en a
               existé quatre, retirés le 18/08/2026 — est repartie proprement. */
            data.goals = WEEKLY_GOAL_TEMPLATES.map(tpl => {
                const cible = _DEBUG_CIBLES_LEGERES[tpl.id];
                const avant = data.goals.find(g => g.id === tpl.id);
                return {
                    id: tpl.id,
                    text: tpl.text.replace('{v}', cible),
                    unit: tpl.unit,
                    target: cible,
                    progress: Math.min(avant ? avant.progress : 0, cible),
                    adaptive: false   // cibles imposées : la baseline ne les a pas calculées
                };
            });
            data.bonusClaimed = false;
            saveWeeklyGoals(data);

            synchroniserParcours();
            renderWeeklyGoalsPanel();
            updateWeeklyGoalsButton();
            if (typeof renderBadgeCategoryCard === 'function') renderBadgeCategoryCard();

            console.log('[Debug] Objectifs de la semaine forcés :', data.goals.map(g => `${g.id}: ${g.progress}/${g.target}`));
        }

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

        /* ═══ FENÊTRE D'ARRIVÉE — TOUJOURS LA PREMIÈRE          (21/08/2026) ═══

           Le retour sobre de fin de trajet. Avant elle, un trajet arrivé sans conduite
           parfaite ne produisait RIEN à l'écran — seul `#status` changeait, dans le
           panneau Itinéraire, c'est-à-dire hors du regard de quelqu'un qui vient de se
           garer.

           ⚠⚠ ELLE N'ANNONCE PLUS DE POINTS (25/08/2026). Elle dit UNE chose : comment va
           l'animal au bout de la route. Le chiffre des points a cessé d'être l'enjeu du
           trajet le jour où la barre de vie l'a remplacé dans #nav-bottom-bar, et le
           classement, lui, compte des animaux sauvés ; annoncer « 13.35 pts » en fin de
           trajet racontait un jeu qui n'existe plus. Les points continuent d'être
           calculés et crédités (butin, total du profil, objectifs) — ils ne se
           CÉLÈBRENT plus ici.

           ⚠ ELLE RESTE DÉPOUILLÉE, et c'est le point à ne pas défaire. Distance
           restante, temps restant et « Terminer Trajet » — le contenu du panneau du widget
           — n'ont plus aucun sens une fois arrivé : les rejouer ici remettrait sous les yeux
           l'interface de navigation d'un trajet qui n'existe plus.

           ⚠⚠ ELLE EST LA SEULE FENÊTRE DE FIN DE TRAJET (25/08/2026). Le coffre à butin
           qui la suivait sur une conduite parfaite a été supprimé, et avec lui la file de
           deux fenêtres qui avait coûté une correction en août. Ne pas la rétablir sans
           relire ce qui l'avait rendue nécessaire : quand deux fenêtres s'ouvrent l'une
           par-dessus l'autre en fin de trajet, personne ne lit la première.

           RÉPARTITION DES RÔLES, la même que pour la barre de vie (voir js/24) :
             · le noyau dit dans quel ÉTAT la vie restante met l'animal (`etatSanteVie`) ;
             · js/22 fournit le DESSIN de cet état et le NOM de l'animal ;
             · ici, on ne fait que poser l'un et l'autre à l'écran.
           Aucun seuil ne doit être écrit dans cette fonction. */
        /* La phrase de fin de trajet, par état. Volontairement au singulier de l'animal :
           « Babi est en bonne santé » dit quelque chose, « ton compagnon va bien » ne dit
           rien. Le tutoiement suit le reste de l'app.

           ⚠ LE `e` D'ACCORD N'EST PAS UN DÉTAIL : la troupe compte des femelles (Kiri,
           Raya, Sam), et « Sam est secoué » sur le nom d'un personnage qu'on vient de
           choisir se voit du premier coup d'œil. Le genre est DÉCLARÉ dans js/22
           (`Compagnon.genre()`), jamais deviné d'après le nom.
           « Tu es bien arrivé » reste au masculin : c'est le conducteur, et l'app ne lui
           a jamais demandé son genre. */
        const ARRIVEE_SANTE = {
            ravi:   (nom)    => `Tu es bien arrivé — ${nom} est en bonne santé.`,
            repos:  (nom)    => `Tu es bien arrivé — ${nom} tient le coup.`,
            secoue: (nom, e) => `Tu es bien arrivé — ${nom} est secoué${e}.`
        };

        /* Plus aucun paramètre : les points ne sont plus affichés (25/08/2026), et le
           `chest` du second argument n'a plus d'objet depuis le retrait du coffre. Tout
           ce que la fenêtre montre, elle va le chercher elle-même. */
        function showArrivalSummary() {
            const overlay = document.getElementById('arrival-modal-overlay');
            if (!overlay) return;

            /* La vie EST déjà celle de la fin du trajet : `stopCourse()` a appelé
               `VieCompagnon.enregistrer()` avant d'en arriver ici, et rien ne la remet à
               100 % entre deux trajets. On la lit, on ne la touche pas. */
            const vie   = (window.VieCompagnon && VieCompagnon.valeur) ? VieCompagnon.valeur() : 100;
            const etat  = etatSanteVie(vie);
            const nom   = (window.Compagnon && Compagnon.nom) ? Compagnon.nom() : 'ton compagnon';

            const portrait = document.getElementById('arrival-modal-compagnon');
            const sous     = document.getElementById('arrival-modal-sub');
            const note     = document.getElementById('arrival-modal-note');

            if (portrait) {
                /* `innerHTML` avec un SVG fabriqué par js/22 : aucune donnée extérieure
                   n'entre ici, contrairement aux pseudos du classement. */
                portrait.innerHTML = (window.Compagnon && Compagnon.dessin) ? Compagnon.dessin(etat) : '';
                portrait.dataset.etat = etat;
                portrait.setAttribute('aria-label', `${nom} — vie ${Math.round(vie)} %`);
            }
            const accord = (window.Compagnon && Compagnon.genre && Compagnon.genre() === 'f') ? 'e' : '';
            if (sous) sous.textContent = (ARRIVEE_SANTE[etat] || ARRIVEE_SANTE.repos)(nom, accord);
            /* La vie chiffrée en petit sous la phrase : c'est d'elle que sort l'état, et
               sans elle « secoué » ne dit pas de combien on est passé à côté. */
            if (note) note.textContent = `Vie : ${Math.round(vie)} %`;
            /* Le bouton ne dit plus qu'une chose depuis qu'il n'y a plus rien derrière. */
            const btn = document.getElementById('arrival-modal-close');
            if (btn) btn.textContent = 'Terminé';

            overlay.classList.add('open');
            playAudioSequence(['reached_destination.ogg']);
        }

        /* Fermer cette fenêtre, c'est aussi laisser passer le badge qui attendait derrière
           elle, s'il y en a un.
           ⚠ IL N'Y A PLUS QU'UNE SEULE CHOSE EN ATTENTE depuis le retrait du coffre
           (25/08/2026) : ce mécanisme gérait une FILE de deux fenêtres — coffre puis
           badge — et c'est `closeLootModal()` qui libérait le second. Le coffre parti,
           c'est ici et nulle part ailleurs que le badge est libéré ; sans cette branche,
           un badge gagné pendant un trajet ne s'afficherait jamais. */
        function closeArrivalSummary() {
            document.getElementById('arrival-modal-overlay')?.classList.remove('open');
            if (_pendingBadgeTotal > 0) {
                const totalToShow = _pendingBadgeTotal;
                _pendingBadgeModal = false;
                _pendingBadgeTotal = 0;
                setTimeout(() => showBadgeUnlockedModal(totalToShow), 400);
            }
        }

        /* ⚠ `rollLoot()`, `onChestClick()` et `closeLootModal()` ONT ÉTÉ SUPPRIMÉS
           LE 25/08/2026, avec le coffre à butin qu'ils servaient : quatre raretés, un
           bonus en pourcentage ou un multiplicateur x2 appliqué au score du trajet, et
           une image de personnage par rareté (Images/Jamu.png, pegase_noir.png,
           Pegase.png, Aiolia_Gold.png — laissées sur le disque, plus référencées).

           CE QUI PARTAIT AVEC, et qu'il a fallu replacer ailleurs :
             · `onChestClick()` était le SEUL chemin de crédit des points d'un trajet
               parfait. `stopCourse()` (js/19) crédite désormais dans tous les cas —
               sans quoi une conduite parfaite ne rapporterait plus rien du tout.
             · `closeLootModal()` libérait le badge en attente. C'est
               `closeArrivalSummary()` qui s'en charge seul, voir plus haut.
           Motif : la conduite parfaite n'a plus de récompense à part. Ce qu'elle
           épargne, c'est la vie du compagnon — l'enjeu du trajet depuis qu'elle a
           remplacé les points dans #nav-bottom-bar. */

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
                safeLocalSet('gps_favorites', JSON.stringify(favorites));
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
                    safeLocalSet('gps_favorites', JSON.stringify(favorites));
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

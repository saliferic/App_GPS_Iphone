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
            /* ⚠ RIEN N'EST « ATTRIBUÉ » ICI DEPUIS LE RETRAIT DES BADGES (27/08/2026).
               La semaine complétée déclenchait `awardWeeklyBadge()`, qui posait une
               modale « Catégorie Bronze débloquée ! » par-dessus la fenêtre d'arrivée.
               La récompense d'une mission bouclée est désormais l'ÉTAPE de parcours que
               `synchroniserParcours()` vient d'écrire deux lignes plus haut — l'animal
               avance vers sa liberté, il n'y a pas de médaille à décerner en plus. */
            if (allGoalsCompleted(data) && !data.bonusClaimed) {
                data.bonusClaimed = true;
                saveWeeklyGoals(data);
                renderCarteCompagnon();
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

            /* ⚠ IL N'Y A PLUS RIEN À « RÉCUPÉRER » À LA FIN D'UNE SEMAINE (27/08/2026).
               Ce bloc portait le bouton « RÉCUPÉRER MON BADGE » puis, une fois la
               médaille retirée du carnet (25/08/2026), une phrase d'attente qui la
               promettait encore. Les deux sont parties avec le système de badges : ce
               qu'une mission bouclée rapporte est une ÉTAPE du parcours, et le bloc
               juste au-dessus (`renderParcoursPanel()`) la montre déjà en grand.
               L'élément est VIDÉ et non retiré du HTML : il tient la place d'un futur
               message de fin de semaine, et le vider ici efface un bouton laissé par
               une version précédente de l'app. */
            const bonusEl = document.getElementById('weekly-goals-bonus-panel');
            if (!bonusEl) return;
            if (allGoalsCompleted(data)) {
                bonusEl.innerHTML = '';
            } else {
                const remaining = data.goals.filter(g => g.progress < g.target).length;
                bonusEl.innerHTML = `<div class="wg-remaining">Encore ${remaining} mission${remaining > 1 ? 's' : ''} et ${nomCompagnon()} franchit une étape.</div>`;
            }
        }

        /* Le prénom de l'animal en cours, pour les phrases de l'interface. Repli sur
           « votre compagnon » : une phrase sans prénom vaut mieux qu'un « undefined ». */
        function nomCompagnon() {
            if (window.Compagnon && typeof Compagnon.nom === 'function') {
                const n = tenterSansBruit(() => Compagnon.nom(), 'carteCompagnon/nom');
                if (n) return n;
            }
            return 'votre compagnon';
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

        /* ══════════════════════════════════════════════════════════════════════
           LE SYSTÈME DE BADGES A ÉTÉ RETIRÉ                      (27/08/2026)
           ----------------------------------------------------------------------
           Sont partis d'un bloc : `BADGE_KEY`, `BADGE_CATEGORIES` (Bronze → Ange),
           `loadBadges`/`saveBadges`, `getBadgeCategory`/`getNextCategory`,
           `CAT_PICTOS`, `awardWeeklyBadge`, `showBadgeUnlockedModal`,
           `_showBadgeModalUI`, `closeBadgeUnlockedModal`, `showBadgeEarnedToast`,
           `claimWeeklyBonus`, les drapeaux `_pendingBadgeModal`/`_pendingBadgeTotal`,
           la modale `#badge-unlocked-modal`, la barre de progression et les pastilles
           de la carte de profil.

           POURQUOI. La mécanique du jeu a changé : on ne collectionne plus des
           médailles, on boucle des missions pour LIBÉRER UN ANIMAL. Le parcours en
           trois étapes (juste au-dessus) était devenu la vraie progression, et le
           badge ne servait plus qu'à alimenter un rang décoratif — deux compteurs de
           la même semaine, dont un qui ne menait nulle part.

           ⚠ LA CLÉ `salif_gps_badges` N'EST PAS EFFACÉE DU STOCKAGE, volontairement.
           Elle n'est plus jamais lue ni écrite ; la laisser dormir coûte quelques
           octets et garde un retour en arrière possible. Ne pas ajouter de nettoyage
           au démarrage : ce serait la seule ligne de tout ce retrait qui détruirait
           des données. L'export de profil (js/02) la recopie encore telle quelle,
           pour la même raison.

           ⚠ CE QUI RESTE ET QU'IL NE FAUT PAS CONFONDRE avec le système parti : le
           lecteur vidéo s'appelle toujours `#badge-video-modal` (il ne sert plus
           qu'aux vidéos d'ANIMAL — cage et libération), et l'app garde plusieurs
           « badges » d'interface sans aucun rapport : `#speed-limit-badge`,
           `#nav-waypoint-badge`, `#nav-badge-goals`, `.route-alt-badge`.
           ══════════════════════════════════════════════════════════════════════ */

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


        /* ══════════════════════════════════════════════════════════════════════
           LA CARTE DU COMPAGNON, EN TÊTE DE L'ONGLET PROFIL      (27/08/2026)
           ----------------------------------------------------------------------
           Elle s'appelait `renderBadgeCategoryCard()` et montrait un RANG (Bronze,
           Argent…) calculé sur le nombre de badges. Les badges retirés, elle montre
           ce qui reste la vraie progression de l'app : où en est l'animal sur son
           parcours de libération.

             portrait + jauge de vie | prénom de l'animal
                                     | l'étape en cours, en grand
                                     | ce qu'elle demande

           ⚠ LA COULEUR VIENT DE L'ANIMAL, plus de la catégorie. `Compagnon.accentDe()`
           donne la teinte du compagnon actif : la carte change d'aspect quand on
           change d'animal, pas quand on monte un rang qui n'existe plus.

           ⚠ ELLE APPELLE `synchroniserParcours()` ET NON `etapesCompagnon()`. La
           différence compte : la synchronisation reporte les missions bouclées de la
           semaine sur la fiche de l'animal. Une lecture seule montrerait la carte en
           retard d'une mission tant que l'onglet Objectifs n'aurait pas été ouvert.
           L'opération est idempotente par construction, l'appeler ici est sans risque.
           ══════════════════════════════════════════════════════════════════════ */
        function renderCarteCompagnon() {
            const nameEl   = document.getElementById('compagnon-carte-etape');
            const subEl    = document.getElementById('compagnon-carte-sub');
            const cardEl   = document.getElementById('compagnon-carte');
            const kickerEl = document.getElementById('compagnon-carte-kicker-txt');

            if (!nameEl) return;

            const acquises = synchroniserParcours();
            const libre    = acquises >= PARCOURS_ETAPES;
            const etape    = Math.min(PARCOURS_ETAPES, acquises + 1);

            /* Teinte de l'animal, avec un repli neutre : la carte doit rester lisible
               même si le module compagnon manque (planche d'expérimentation). */
            const couleur = (window.Compagnon && typeof Compagnon.accentDe === 'function')
                ? (tenterSansBruit(() => Compagnon.accentDe(), 'carteCompagnon/accent') || '#A88BFF')
                : '#A88BFF';

            if (cardEl) {
                cardEl.style.borderColor = couleur + '55';
                cardEl.style.background  = 'linear-gradient(150deg, ' + couleur + '26, rgba(255,255,255,0.03))';
            }

            /* L'étape en gros, ce qu'elle demande en dessous — les deux textes sont
               ceux du module compagnon (`parcoursEtape`), pas des phrases écrites ici :
               le carnet affiche exactement les mêmes, ils ne peuvent pas diverger. */
            const lib = (window.Compagnon && typeof Compagnon.parcoursEtape === 'function')
                ? tenterSansBruit(() => Compagnon.parcoursEtape(etape), 'carteCompagnon/etape')
                : null;

            nameEl.style.color = couleur;
            if (libre) {
                nameEl.textContent = nomCompagnon() + ' est libre';
                subEl.textContent  = 'Son parcours est allé au bout.';
            } else {
                nameEl.textContent = lib ? lib.titre : `Étape ${etape} / ${PARCOURS_ETAPES}`;
                subEl.textContent  = lib ? lib.sous  : '';
            }

            if (window.Compagnon) {
                /* Le portrait, SANS médaille : elle disait le rang, qui n'existe plus.
                   Voir `Compagnon.portrait()` (js/22), ex-`rang()`. */
                Compagnon.portrait('compagnon-carte-portrait', { couleur: couleur });
                /* La jauge de vie posée sous le portrait. Elle est alimentée en continu
                   par js/24 pendant la navigation, mais la carte peut être ouverte hors
                   trajet ou après un changement de compagnon : on la (re)pose ici pour
                   qu'elle affiche la vie du bon animal dès l'ouverture de « Moi ». */
                if (window.VieCompagnon && typeof VieCompagnon.monter === 'function') {
                    tenterSansBruit(() => VieCompagnon.monter(), 'carteCompagnon/vie');
                }
                if (kickerEl) kickerEl.textContent = 'Le parcours de ' + Compagnon.nom();
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
                    () => profiles.find(p => p.id === activeProfileId), 'carteCompagnon/points');
                const pts = actifPts ? actifPts.totalPoints : 0;
                ptsEl.textContent = Math.round(pts).toLocaleString('fr-FR');
            }
            const ecoEl = document.getElementById('profil-stat-eco');
            if (ecoEl) {
                /* Moyenne sur TOUT l'historique, et non sur la semaine comme la clairière :
                   le Profil est une vue d'ensemble. Sans trajet noté, un tiret — annoncer
                   100 laisserait croire à une conduite parfaite qui n'a jamais eu lieu. */
                const notes = tenterSansBruit(
                    () => getTripHistory().filter(t => t.ecoScore != null), 'carteCompagnon/eco') || [];
                ecoEl.textContent = notes.length
                    ? String(Math.round(notes.reduce((n, t) => n + t.ecoScore, 0) / notes.length))
                    : '—';
            }

            /* Prénom du profil actif dans la carte. Posé ICI et nulle part ailleurs :
               `renderCarteCompagnon()` est déjà rappelée par TOUS les chemins qui
               changent de profil — `selectProfile()` (js/13), l'import de profil (js/02),
               l'ouverture de l'onglet Profil (js/14) — alors qu'un rafraîchissement écrit
               à part en aurait forcément raté un. Le parcours affiché étant lui aussi
               celui du profil actif, le nom et le contenu de la carte ne peuvent pas
               diverger. `profiles` / `activeProfileId` vivent dans js/13, chargé après
               celui-ci : lecture au runtime uniquement, jamais au chargement. */
            const profilEl = document.getElementById('compagnon-carte-profil');
            if (profilEl) {
                const actif = tenterSansBruit(
                    () => profiles.find(p => p.id === activeProfileId), 'carteCompagnon/profilActif');
                profilEl.textContent   = actif ? actif.name : '';
                profilEl.style.display = actif ? '' : 'none';
            }
        }

        /* ═══ GALERIE DES TROPHÉES — RETIRÉE (26/08/2026) ═══
           `toggleTrophyGallery()`, `renderTrophyGallery()` et `refreshTrophyGalleryCount()`
           ont été supprimées avec la section du Profil qu'elles peignaient. Elles
           montraient les huit catégories de `BADGE_CATEGORIES` — le décompte de l'ancien
           système, celui d'avant les parcours d'animaux.

           `BADGE_CATEGORIES` a suivi le 27/08/2026, avec tout le système de badges :
           la carte de tête de l'onglet Profil montre désormais le PARCOURS de l'animal
           (voir `renderCarteCompagnon()`), et le classement en ligne compte des animaux
           sauvés depuis le 25/08/2026. Plus rien ne lit ce décompte.

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
            if (typeof renderCarteCompagnon === 'function') renderCarteCompagnon();
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
            if (typeof renderCarteCompagnon === 'function') renderCarteCompagnon();

            console.log('[Debug] Objectifs de la semaine forcés :', data.goals.map(g => `${g.id}: ${g.progress}/${g.target}`));
        }

        /* ⚡ BOUTON DEBUG — À SUPPRIMER APRÈS TEST
           Met les trois missions de la semaine à 100 % et reporte le résultat sur le
           parcours de l'animal.

           ⚠ IL NE DÉCLENCHE PLUS AUCUNE FENÊTRE (27/08/2026). Il remettait le badge de
           la semaine à zéro puis rappelait `awardWeeklyBadge()` pour faire apparaître
           « Catégorie Bronze débloquée ! » — c'était son objet même. Les badges retirés,
           ce qu'il montre est l'étape franchie : le carnet et la carte du profil se
           repeignent, et rien ne s'ouvre par-dessus l'écran. */
        function _debugFillGoals95() {
            const data = loadWeeklyGoals();
            data.goals.forEach(g => { g.progress = g.target; });
            /* `bonusClaimed` n'est plus une récompense en attente, seulement le drapeau
               qui empêche de recompter deux fois une semaine complétée. On le remet à
               faux pour que le prochain trajet rejoue le passage « semaine bouclée ». */
            data.bonusClaimed = false;
            saveWeeklyGoals(data);

            const etapes = synchroniserParcours();
            renderWeeklyGoalsPanel();
            renderCarteCompagnon();
            updateWeeklyGoalsButton();

            console.log('[Debug] Objectifs à 100%. activeProfileId:', activeProfileId);
            console.log('[Debug] Goals:', data.goals.map(g => `${g.id}: ${g.progress}/${g.target}`));
            console.log('[Debug] Parcours du compagnon — étapes acquises :', etapes, '/', PARCOURS_ETAPES);

            document.getElementById('status').innerText = `🧪 DEBUG : missions à 100 % — étape ${Math.min(PARCOURS_ETAPES, etapes)} / ${PARCOURS_ETAPES}`;
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
             · le noyau dit dans quel ÉTAT PHYSIQUE la vie restante met l'animal
               (`etatPhysiqueVie`) ;
             · js/22 fournit l'IMAGE de cet état et le NOM de l'animal ;
             · js/24 tient le registre des morts ;
             · ici, on ne fait que poser tout ça à l'écran.
           Aucun seuil ne doit être écrit dans cette fonction. */

        /* Vrai tant qu'une fenêtre d'arrivée annonçant une mort n'a pas été refermée :
           c'est elle qui doit ouvrir la grille de choix derrière elle. Un drapeau plutôt
           qu'un test refait à la fermeture, parce qu'à ce moment-là le compagnon courant
           peut déjà avoir changé.
           ⚠ DÉCLARÉ AVANT SON USAGE, pas après : un `let` de portée script est en zone
           morte tant que sa ligne n'a pas été évaluée — piège que ce fichier a déjà payé
           avec `userPanningResumeTimer` (voir plus bas). */
        let _deuilEnAttente = false;

        /* ═══ TROIS ÉTATS PHYSIQUES, TROIS PHRASES            (27/08/2026) ═══
           Volontairement au singulier de l'animal : « Babi est en bonne santé » dit
           quelque chose, « ton compagnon va bien » ne dit rien. Le tutoiement suit le
           reste de l'app.

           ⚠ LE `e` D'ACCORD N'EST PAS UN DÉTAIL : la troupe compte des femelles (Kiri,
           Raya, Sam), et « Sam est décédé » sur le nom d'un personnage qu'on vient de
           choisir se voit du premier coup d'œil — d'autant plus sur la phrase qui
           annonce sa mort. Le genre est DÉCLARÉ dans js/22 (`Compagnon.genre()`),
           jamais deviné d'après le nom. Deux accords dans la phrase de mort
           (« décédée », « jouée »), aucun dans celle du blessé : « il faudra » y est
           impersonnel, ce n'est pas l'animal qui doit faire attention, c'est le
           conducteur.
           « Tu es bien arrivé » reste au masculin : c'est le conducteur, et l'app ne lui
           a jamais demandé son genre.

           ⚠ LES TROIS CLÉS SONT CELLES DE `etatPhysiqueVie`, au mot près. Une clé qui
           ne tomberait pas juste rendrait `undefined` et afficherait une fenêtre muette
           — pas une erreur, juste une phrase qui manque. */
        const ARRIVEE_PHYSIQUE = {
            sain:   (nom)    => `Tu es bien arrivé — ${nom} est en bonne santé.`,
            blesse: (nom, e) => `Tu es bien arrivé — ${nom} a eu quelques bobos en route. `
                              + `Il faudra faire attention la prochaine fois.`,
            mort:   (nom, e) => `Tu es bien arrivé — malheureusement ${nom} est décédé${e} `
                              + `et ne pourra plus être jou${e ? 'ée' : 'é'}.`
        };

        /* Plus aucun paramètre : les points ne sont plus affichés (25/08/2026), et le
           `chest` du second argument n'a plus d'objet depuis le retrait du coffre. Tout
           ce que la fenêtre montre, elle va le chercher elle-même. */
        /* `libre` : le trajet s'est terminé SANS destination. Seul le titre change —
           « arrivée à destination » serait faux —, le bilan de l'animal est le même.
           C'est le choix du 27/08/2026 : la vie descend aussi en trajet libre, et sans
           cette fenêtre un compagnon pourrait y tomber à 0 % sans que rien ne le dise,
           puis « mourir en silence » au trajet suivant. */
        function showArrivalSummary(libre) {
            const overlay = document.getElementById('arrival-modal-overlay');
            if (!overlay) return;

            /* La vie EST déjà celle de la fin du trajet : `stopCourse()` a appelé
               `VieCompagnon.enregistrer()` avant d'en arriver ici, et rien ne la remet à
               100 % entre deux trajets. On la lit, on ne la touche pas. */
            const vie   = (window.VieCompagnon && VieCompagnon.valeur) ? VieCompagnon.valeur() : 100;
            const nom   = (window.Compagnon && Compagnon.nom) ? Compagnon.nom() : 'ton compagnon';
            const cle   = (window.Compagnon && Compagnon.cle) ? Compagnon.cle() : null;

            /* ⚠ UN COMPAGNON DÉJÀ MORT RESTE MORT, quelle que soit sa jauge. Sans cette
               reprise du registre, rouvrir l'app sur un animal enterré (dont la vie en
               stockage vaut 0) rejouerait « il vient de mourir » à chaque arrivée — et,
               pire, un `poser()` de débogage le montrerait ressuscité. Le registre fait
               foi, la jauge ne fait que l'alimenter. */
            const dejaMort = !!(window.VieCompagnon && VieCompagnon.estMort && VieCompagnon.estMort(cle));
            const etat     = dejaMort ? 'mort' : etatPhysiqueVie(vie);

            /* ⚠ LA MORT EST DÉCLARÉE ICI, ET NULLE PART AILLEURS. C'est le seul endroit
               de l'app qui constate la fin d'un trajet en connaissant la vie finale :
               tomber à 0 en roulant n'est pas mourir, la barre peut remonter avant
               d'arriver (voir le registre dans js/24). `declarerMort()` ne rend `true`
               qu'au geste qui tue vraiment, ce qui évite de rouvrir la fenêtre de choix
               à chaque arrivée suivante sur le même animal. */
            let vientDeMourir = false;
            if (etat === 'mort' && window.VieCompagnon && VieCompagnon.declarerMort) {
                vientDeMourir = VieCompagnon.declarerMort(cle);
            }
            _deuilEnAttente = (etat === 'mort');

            const portrait = document.getElementById('arrival-modal-compagnon');
            const sous     = document.getElementById('arrival-modal-sub');
            const note     = document.getElementById('arrival-modal-note');
            const titre    = document.getElementById('arrival-modal-title');
            const icone    = document.getElementById('arrival-modal-icon');

            if (titre) titre.textContent = libre ? 'Trajet terminé' : 'Arrivée à destination';
            if (icone) icone.textContent = libre ? '🧭' : '🏁';

            if (portrait) {
                /* `innerHTML` avec un SVG fabriqué par js/22 : aucune donnée extérieure
                   n'entre ici, contrairement aux pseudos du classement.
                   ⚠ DEUX ARGUMENTS, PAS UN. Le premier reste l'EXPRESSION (accessoires
                   posés sur l'image normale), le second choisit la VARIANTE d'image.
                   Un animal blessé ou mort a sa propre image, donc pas d'expression à
                   lui donner — d'où le 'repos' neutre : js/22 ignore de toute façon les
                   accessoires dès qu'une variante est en jeu. */
                const expression = etat === 'sain' ? 'ravi' : 'repos';
                portrait.innerHTML = (window.Compagnon && Compagnon.dessin)
                    ? Compagnon.dessin(expression, etat) : '';
                portrait.dataset.etat = etat;
                portrait.setAttribute('aria-label', `${nom} — vie ${Math.round(vie)} %`);
            }
            const accord = (window.Compagnon && Compagnon.genre && Compagnon.genre() === 'f') ? 'e' : '';
            if (sous) sous.textContent = (ARRIVEE_PHYSIQUE[etat] || ARRIVEE_PHYSIQUE.sain)(nom, accord);
            /* La vie chiffrée en petit sous la phrase : c'est d'elle que sort l'état, et
               sans elle « quelques bobos » ne dit pas de combien on est passé à côté.
               Sur un animal mort le chiffre n'a plus rien à mesurer : on annonce ce qui
               vient à la place, c'est-à-dire le choix d'un autre compagnon. */
            if (note) note.textContent = etat === 'mort'
                ? 'Choisis un autre animal pour continuer.'
                : `Vie : ${Math.round(vie)} %`;
            /* Le bouton ne dit plus qu'une chose depuis qu'il n'y a plus rien derrière —
               sauf sur une mort, où il annonce ce qu'il va ouvrir. */
            const btn = document.getElementById('arrival-modal-close');
            if (btn) btn.textContent = etat === 'mort' ? 'Choisir un autre animal' : 'Terminé';

            /* La couleur du cadre, du bouton et de la phrase tient dans cette seule
               classe : vert / orange / rouge. Posée sur la fenêtre et pas sur chaque
               élément, pour que le CSS reste le seul endroit qui décide des teintes. */
            const boite = document.getElementById('arrival-modal');
            if (boite) boite.className = 'arrivee-' + etat;

            overlay.classList.add('open');
            playAudioSequence(['reached_destination.ogg']);
            if (vientDeMourir) logAppError('compagnon/mort', new Error('compagnon mort : ' + cle));
        }


        /* Fermer la fenêtre d'arrivée est le dernier maillon de la fin de trajet.

           ⚠ IL N'Y A PLUS RIEN EN FILE D'ATTENTE DERRIÈRE ELLE (27/08/2026). Ce
           mécanisme a porté une file de trois fenêtres — coffre, puis badge, puis
           deuil — chacune libérant la suivante à sa fermeture. Le coffre est parti le
           25/08/2026, le badge le 27 : il ne reste que le deuil, appelé directement.
           Si une fenêtre de fin de trajet revient un jour, c'est ICI qu'elle se
           chaîne, et nulle part ailleurs. */
        function closeArrivalSummary() {
            document.getElementById('arrival-modal-overlay')?.classList.remove('open');
            ouvrirChoixApresDeuil();
        }

        /* ═══ APRÈS LA MORT, ON CHOISIT                        (27/08/2026) ═══
           Rien ne se joue sans compagnon : la grille des animaux à sauver s'ouvre
           d'office, et le mort y figure grisé avec la mention « Mort » — voir js/23.

           ⚠ LE DÉLAI N'EST PAS COSMÉTIQUE : la fenêtre d'arrivée se ferme par un retrait
           de classe, avec sa transition. Ouvrir la grille dans le même souffle ferait
           apparaître la seconde sous la première encore visible.

           ⚠ ET LE DRAPEAU EST REMIS À FAUX QUOI QU'IL ARRIVE, même si la fenêtre de choix
           n'existe pas (planche d'expérimentation, module absent). Un deuil resté en
           attente rouvrirait la grille à la fin du trajet SUIVANT, sur un compagnon en
           pleine forme. */
        function ouvrirChoixApresDeuil() {
            if (!_deuilEnAttente) return;
            _deuilEnAttente = false;
            setTimeout(() => {
                if (typeof window.openCompagnonPicker === 'function') {
                    tenterSansBruit(() => window.openCompagnonPicker(), 'deuil/choix');
                }
            }, 400);
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

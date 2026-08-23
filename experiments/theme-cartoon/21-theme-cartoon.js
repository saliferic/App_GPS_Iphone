        /* ═══════════════════════════════════════════════════════════════════
           THÈME CARTOON — bascule
           ═══════════════════════════════════════════════════════════════════
           Tout le rendu est dans css/theme-cartoon.css, conditionné à la classe
           `theme-cartoon` sur <body>. Ce module ne fait que trois choses : poser
           ou retirer cette classe, la mémoriser, et accorder le fond de carte.
           ⚠ Chargé EN DERNIER (après js/20) : il lit `isDarkMode` et appelle
           `toggleMapTheme()`, tous deux déclarés au niveau global par
           js/03-carte-3d.js et js/04-routes-alternatives.js.
           ═══════════════════════════════════════════════════════════════════ */

        const CARTOON_KEY = 'gps_theme_cartoon';
        /* Mémorise le mode jour/nuit d'AVANT la bascule. Le thème cartoon impose
           un fond de carte clair — un fond sombre passé en niveaux de gris
           donne une planche noire, l'inverse de la référence. Sans cette
           sauvegarde, revenir au thème néon laisserait l'utilisateur en carte
           de jour sans qu'il l'ait jamais demandé.
           ⚠ Persisté en localStorage et non dans une simple variable : la
           bascule vers cartoon écrit 'day' dans `gps_map_theme`, si bien qu'après
           un rechargement plus rien en mémoire ne dirait qu'on était en nuit,
           et le retour au thème néon laisserait la carte en jour pour de bon. */
        const CARTOON_PREV_KEY = 'gps_theme_cartoon_prev_dark';

        function _cartoonSyncMapTheme(on) {
            try {
                if (typeof isDarkMode === 'undefined' || typeof toggleMapTheme !== 'function') return;
                if (on) {
                    if (localStorage.getItem(CARTOON_PREV_KEY) === null) {
                        localStorage.setItem(CARTOON_PREV_KEY, isDarkMode ? 'night' : 'day');
                    }
                    if (isDarkMode) toggleMapTheme();           // → carte de jour
                } else {
                    const prev = localStorage.getItem(CARTOON_PREV_KEY);
                    if (prev === 'night' && !isDarkMode) toggleMapTheme();  // → état d'origine
                    localStorage.removeItem(CARTOON_PREV_KEY);
                }
            } catch (e) { /* silencieux : un fond de carte mal accordé ne doit pas bloquer la bascule */ }
        }

        function applyCartoonTheme(on, syncMap) {
            document.body.classList.toggle('theme-cartoon', !!on);
            const btn = document.getElementById('mg-theme-btn');
            if (btn) {
                // Le libellé annonce l'appui SUIVANT, comme le chevron du panneau.
                btn.textContent = on ? 'Néon' : 'Cartoon';
                btn.setAttribute('aria-pressed', on ? 'true' : 'false');
                btn.title = on ? 'Revenir au thème néon' : 'Passer en thème cartoon (N&B)';
            }
            if (syncMap) _cartoonSyncMapTheme(!!on);
        }

        function toggleCartoonTheme(event) {
            // Le panneau referme/bascule sur les clics qui l'atteignent : ce
            // bouton lui est superposé, il doit garder son clic pour lui.
            if (event) event.stopPropagation();
            const on = !document.body.classList.contains('theme-cartoon');
            localStorage.setItem(CARTOON_KEY, on ? 'on' : 'off');
            applyCartoonTheme(on, true);
        }

        /* Restauration au démarrage. `syncMap` est à false : la carte est déjà
           construite avec le style lu dans localStorage par js/03, et forcer
           un setStyle() ici relancerait inutilement le chargement complet des
           couches au premier rendu. Le fond suivra dès la première bascule. */
        document.addEventListener('DOMContentLoaded', function () {
            applyCartoonTheme(localStorage.getItem(CARTOON_KEY) === 'on', false);
        });

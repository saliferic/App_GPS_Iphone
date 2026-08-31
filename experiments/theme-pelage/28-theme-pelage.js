        // === ESSAI DE THÈME « PELAGE » : bouton de bascule + gardien d'onglet ===
        /* Module d'essai, volontairement isolé : il n'appelle aucune fonction de l'app et
           aucune fonction de l'app ne l'appelle. Le retirer, c'est supprimer ce fichier,
           son <script> et le <link> vers css/theme-pelage.css — rien d'autre à défaire.

           Il pose DEUX classes sur <body>, et rien d'autre :
             • `theme-pelage`  — l'utilisateur a demandé l'essai (persisté).
             • `tab-trajet`    — l'onglet Itinéraire est celui affiché.
           css/theme-pelage.css exige les deux : Pelage est un thème clair, il ne doit
           jamais peindre Profil ni Objectifs, qui dessinent leur texte en couleurs claires.

           ⚠ POURQUOI UN MutationObserver ET PAS UN APPEL DANS switchMainTab().
           L'onglet actif est déjà écrit quelque part : la classe `.active` sur
           #panel-tab-trajet, posée par js/14. L'observer lit cette vérité-là au lieu d'en
           tenir une seconde en parallèle. Brancher un appel dans switchMainTab() aurait
           marché aussi, mais aurait mêlé un essai jetable à la logique de navigation —
           et aurait raté tout autre chemin qui change d'onglet (retour de navigation,
           fermeture de l'overlay pendant un trajet). */

        (function () {
            'use strict';

            var CLE = 'go_theme_pelage';   // localStorage : '1' = essai activé

            function litPreference() {
                try { return localStorage.getItem(CLE) === '1'; } catch (e) { return false; }
            }
            function ecritPreference(actif) {
                try { localStorage.setItem(CLE, actif ? '1' : '0'); } catch (e) { /* mode privé */ }
            }

            /* Reflète l'onglet réellement affiché. Appelée au démarrage puis à chaque
               changement de l'attribut class de #panel-tab-trajet. */
            function syncOnglet() {
                var trajet = document.getElementById('panel-tab-trajet');
                document.body.classList.toggle('tab-trajet', !!trajet && trajet.classList.contains('active'));
            }

            function majBouton(btn, actif) {
                btn.setAttribute('aria-pressed', actif ? 'true' : 'false');
                // Le libellé nomme l'état COURANT, pas l'action : c'est ce qu'on lit en
                // regardant l'écran, et ça évite le classique « bouton qui ment » (un
                // bouton marqué « Pelage » alors que Pelage est déjà à l'écran).
                btn.querySelector('.tps-label').textContent = actif ? 'Pelage' : 'Crépuscule';
            }

            function init() {
                if (document.getElementById('theme-pelage-switch')) return;

                var actif = litPreference();
                document.body.classList.toggle('theme-pelage', actif);
                syncOnglet();

                var btn = document.createElement('button');
                btn.id = 'theme-pelage-switch';
                btn.type = 'button';
                btn.title = 'Basculer le thème de l’écran Itinéraire';
                btn.innerHTML = '<span class="tps-dot"></span><span class="tps-label"></span>';
                majBouton(btn, actif);

                btn.addEventListener('click', function (e) {
                    e.stopPropagation();   // le panneau et la carte écoutent les clics
                    var nouvel = !document.body.classList.contains('theme-pelage');
                    document.body.classList.toggle('theme-pelage', nouvel);
                    ecritPreference(nouvel);
                    majBouton(btn, nouvel);
                });

                document.body.appendChild(btn);

                var trajet = document.getElementById('panel-tab-trajet');
                if (trajet && window.MutationObserver) {
                    new MutationObserver(syncOnglet).observe(trajet, {
                        attributes: true, attributeFilter: ['class']
                    });
                }
            }

            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', init);
            } else {
                init();
            }
        })();

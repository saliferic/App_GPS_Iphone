/* ============================================================================
   THÈME « DUO » — bascule et persistance
   ============================================================================

   Tout le rendu est dans css/theme-duo.css, inerte tant que <body> ne porte
   pas la classe `theme-duo`. Ce fichier ne fait que trois choses : poser/
   retirer cette classe, la mémoriser, et tenir l'état visuel du bouton.

   ⚠ La RESTAURATION au chargement n'est pas ici mais dans un <script> inline
   placé juste après <body> dans index.html — voir experiments/theme-neo/
   README.md pour la raison (ce fichier est chargé en fin de page, le thème
   d'origine serait peint avant lui à chaque rechargement).
   ============================================================================ */

(function () {
    'use strict';

    var STORAGE_KEY = 'gps_theme_duo';

    function isActive() {
        return document.body.classList.contains('theme-duo');
    }

    function syncButton() {
        var btn = document.getElementById('duo-theme-btn');
        if (!btn) return;
        var on = isActive();
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.title = on
            ? 'Revenir au thème d\'origine'
            : 'Basculer le thème Duo (test — plaques pleines, contour noir)';
    }

    window.toggleDuoTheme = function (event) {
        if (event) { event.stopPropagation(); }

        var on = document.body.classList.toggle('theme-duo');
        try {
            localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
        } catch (e) {
            /* Navigation privée : le thème s'applique quand même, il ne
               survivra simplement pas au rechargement. */
        }
        syncButton();
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', syncButton);
    } else {
        syncButton();
    }
})();

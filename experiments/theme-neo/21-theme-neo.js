/* ============================================================================
   THÈME « NEO » — bascule et persistance
   ============================================================================

   Tout le rendu est dans css/theme-neo.css, inerte tant que <body> ne porte pas
   la classe `theme-neo`. Ce fichier ne fait que trois choses : poser/retirer
   cette classe, la mémoriser, et tenir l'état visuel du bouton.

   ⚠ La RESTAURATION au chargement n'est pas ici mais dans un <script> inline
   placé juste après <body> dans index.html. Ce fichier est chargé en fin de
   page : y mettre la restauration ferait clignoter le thème d'origine à chaque
   rechargement. Ici on ne fait que synchroniser le bouton avec l'état déjà posé.

   Rien n'est touché côté carte, contrairement au thème cartoon qui devait
   forcer le mode jour. Le thème neo est sombre : le fond de carte habituel lui
   convient tel quel, dans les deux modes.
   ============================================================================ */

(function () {
    'use strict';

    var STORAGE_KEY = 'gps_theme_neo';

    function isActive() {
        return document.body.classList.contains('theme-neo');
    }

    function syncButton() {
        var btn = document.getElementById('neo-theme-btn');
        if (!btn) return;
        var on = isActive();
        btn.setAttribute('aria-pressed', on ? 'true' : 'false');
        btn.title = on
            ? 'Revenir au thème d\'origine'
            : 'Basculer le thème Neo (verre sombre, accent lime)';
    }

    /* Exposée en global : appelée par l'attribut onclick du bouton, comme le
       reste des handlers de ce projet (togglePanel, goPlace, …). */
    window.toggleNeoTheme = function (event) {
        /* Le bouton est dans #ui-panel, qui a son propre onclick d'arrêt de
           propagation, et il chevauche la zone de drag de la feuille : sans
           stopPropagation, l'appui pouvait aussi être lu comme un début de
           glissement du panneau. */
        if (event) { event.stopPropagation(); }

        var on = document.body.classList.toggle('theme-neo');
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

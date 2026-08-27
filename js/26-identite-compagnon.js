/* ============================================================================
   QUI EST L'ANIMAL QU'ON A CHOISI
   ----------------------------------------------------------------------------
   La page ouverte en touchant le portrait de la carte de rang (onglet Profil).

   ⚠ CE PORTRAIT OUVRAIT « QUI SAUVONS-NOUS ? » JUSQU'AU 26/08/2026. Il ouvre
   maintenant la fiche de l'animal EN COURS. Le choix, lui, a sa propre ligne
   dans le Profil (« Animaux que vous pouvez sauver »), et c'est plus honnête
   dans les deux sens : un portrait qui ouvre une liste ne se devine pas, et
   toucher l'animal qu'on est en train de sauver pour se le faire remplacer par
   une grille était le contraire de ce que le geste annonce. Toucher un animal,
   ça montre l'animal.

   Trois sources, aucun calcul ici :
     · js/22  le dessin, le nom, l'espèce, l'histoire (`Compagnon.*`) ;
     · js/12  où en est son parcours (`etapesCompagnon`) ;
     · js/13  la mécanique de page pleine (`openProfilSheet`).

   ⚠ CETTE FICHE PARLE D'UN ANIMAL ENCORE EN CAGE. Celle d'un animal SAUVÉ est
   ailleurs (js/25-animaux-sauves.js) et raconte l'après. Les deux ne se
   croisent jamais : un animal sauvé ne peut plus être le compagnon courant.
   ============================================================================ */

(function () {
    'use strict';

    const ID_CORPS = 'compagnon-identite-body';
    const ETAPES_TOTAL = 3;

    function cleCourante() {
        return (window.Compagnon && typeof Compagnon.cle === 'function') ? Compagnon.cle() : null;
    }

    /* Le titre de la page pleine, lu par openProfilSheet au moment de l'ouverture
       (voir PROFIL_SHEETS dans js/13, où `title` accepte une fonction). C'est le
       NOM de l'animal et pas un intitulé de rubrique : la page ne parle que de
       lui, et « Bulle » se reconnaît plus vite que « Mon compagnon ». */
    function titre() {
        const cle = cleCourante();
        return (cle && Compagnon.nomDe) ? Compagnon.nomDe(cle) : 'Mon compagnon';
    }

    function rendre() {
        const hote = document.getElementById(ID_CORPS);
        if (!hote) return;

        const cle = cleCourante();
        if (!cle || !window.Compagnon) {
            hote.innerHTML = '<p class="ci-vide">Aucun compagnon choisi pour l\'instant.</p>';
            return;
        }

        const nom    = Compagnon.nomDe(cle);
        const espece = Compagnon.especeDe ? Compagnon.especeDe(cle) : '';
        const accent = Compagnon.accentDe ? Compagnon.accentDe(cle) : '#A88BFF';

        /* Le dessin NU, pas `vignetteCage()`. Les barreaux sont le sujet de la
           fenêtre de choix — là on décide qui on va chercher. Ici on regarde qui
           il est, et une fiche d'identité derrière des barreaux se lit mal. */
        const portrait = Compagnon.dessin ? Compagnon.dessin('repos') : '';

        /* `typeof` : js/12 expose ce compteur, mais la fiche doit rester lisible
           s'il manque — on tait la ligne d'avancement plutôt que de la fausser. */
        const etapes = (typeof window.etapesCompagnon === 'function')
            ? window.etapesCompagnon(cle) : null;

        const textes = Compagnon.histoire ? Compagnon.histoire(cle) : [];
        const paragraphes = textes.map(() => '<p class="ci-para"></p>').join('');

        hote.innerHTML = `
            <div class="ci-hero" style="--ci-accent:${accent}">
                <div class="ci-portrait">${portrait}</div>
                <div class="ci-ident">
                    <div class="ci-nom">${nom}</div>
                    <div class="ci-espece">${espece}</div>
                    <div class="ci-etat">Encore en cage</div>
                </div>
            </div>
            ${etapes === null ? '' : `
            <div class="ci-parcours">
                <div class="ci-parcours-lab">${etapes} mission${etapes > 1 ? 's' : ''} sur ${ETAPES_TOTAL} tenue${etapes > 1 ? 's' : ''} avec lui</div>
                <div class="ci-jauge"><div class="ci-jauge-fill" style="width:${Math.round(etapes / ETAPES_TOTAL * 100)}%;background:${accent}"></div></div>
            </div>`}
            <div class="ci-histoire">${paragraphes}</div>`;

        /* textContent paragraphe par paragraphe : ces textes seront un jour écrits
           ailleurs qu'en dur (traduction, réseau, saisie), on ne les réinjecte
           jamais comme du balisage. Même règle que `Compagnon.fiche()`. */
        hote.querySelectorAll('.ci-para').forEach((el, i) => { el.textContent = textes[i] || ''; });
    }

    /* Même règle que les autres pages du Profil : on ne repeint que si la page
       est SOUS LES YEUX, c'est-à-dire déplacée dans la page pleine. Appelée quand
       le compagnon change (js/23) — sans quoi la fiche resterait sur l'animal
       précédent si elle était ouverte. */
    function rafraichir() {
        const corps = document.getElementById(ID_CORPS);
        if (corps && corps.classList.contains('in-profil-sheet')) rendre();
    }

    function ouvrir() {
        if (typeof openProfilSheet === 'function') openProfilSheet('compagnon');
    }

    document.addEventListener('DOMContentLoaded', function () {
        const portrait = document.getElementById('compagnon-carte-portrait');
        if (!portrait) return;
        portrait.addEventListener('click', ouvrir);
        portrait.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); ouvrir(); }
        });
    });

    window.renderIdentiteCompagnon    = rendre;
    window.rafraichirIdentiteCompagnon = rafraichir;
    window.titreIdentiteCompagnon      = titre;
    window.openIdentiteCompagnon       = ouvrir;
})();

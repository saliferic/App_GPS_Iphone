/* ============================================================================
   LE CHOIX DU COMPAGNON
   ----------------------------------------------------------------------------
   La fenêtre ouverte depuis le portrait de rang (onglet Profil). Elle affiche
   le catalogue rendu par js/22-compagnon.js : en couleur ce qui est jouable,
   en gris ce qui ne l'est pas encore.

   ⚠ Ce fichier est SÉPARÉ de js/22 à dessein. Le module compagnon a une règle
   écrite dans son en-tête : il ne contient que des dessins et des phrases,
   aucune logique. Ouvrir une fenêtre, écouter un clic et écrire dans le DOM,
   c'est de la logique d'interface — sa place est ici.

   Le module ne connaît donc pas cette fenêtre : il expose `catalogue()` et
   `choisir()`, et se moque de savoir qui les appelle.

   ⚠ LES ANIMAUX DÉJÀ SAUVÉS NE SONT PLUS ICI (26/08/2026). Cette fenêtre ne
   montre que ce qui est encore à sortir de cage — c'est-à-dire ce qu'on peut
   encore choisir. Une carte sur laquelle il n'y a rien à décider n'a rien à
   faire dans un écran de choix, et la fiche qui s'ouvrait en la touchant a
   déménagé telle quelle dans « Animaux sauvés » (onglet Profil,
   js/25-animaux-sauves.js). Ne pas les remettre ici sans retirer cette page :
   ils seraient alors montrés à deux endroits.
   ============================================================================ */

(function () {
    'use strict';

    /* Combien d'animaux sont ouverts d'entrée. Deux, et pas six : la troupe se
       découvre au fil des sauvetages, un animal de plus à chaque fois. Six
       vignettes le premier jour, c'était toute la surprise dépensée d'un coup. */
    const OUVERTS_AU_DEPART = 2;

    function grille() {
        const hote = document.getElementById('compagnon-grille');
        if (!hote || !window.Compagnon) return;

        /* Qui est déjà sauvé, et combien : c'est js/12 qui tient le compte des
           missions bouclées par animal. La fenêtre ne calcule rien, elle
           demande — et si le module n'est pas là, personne n'est sauvé, donc
           tout le monde reste en cage : l'affichage dégradé raconte la même
           chose que l'app. */
        const sauve = (cle) => (typeof window.compagnonEstSauve === 'function')
            ? window.compagnonEstSauve(cle) : false;
        const nbSauves = (typeof window.nbAnimauxSauves === 'function')
            ? window.nbAnimauxSauves() : 0;
        const ouverts = OUVERTS_AU_DEPART + nbSauves;

        /* ⚠ LE FILTRE VIENT APRÈS LE `map`, PAS AVANT. L'ouverture d'un animal se
           lit sur son RANG dans le catalogue complet (`i < ouverts`) : filtrer
           d'abord décalerait les index et ouvrirait le mauvais animal à chaque
           sauvetage. On calcule donc sur la troupe entière, et on jette à la fin.
           Le compte reste juste : un animal sauvé en ouvre un nouveau
           (`ouverts = 2 + nbSauves`), donc il y a toujours deux cages à choisir. */
        hote.innerHTML = Compagnon.catalogue().map((c, i) => {
            if (c.debloque && sauve(c.cle)) return '';
            /* Trois états de disponibilité, à ne pas confondre :
                 - `c.debloque` : l'animal EXISTE (il est dessiné). Nima et Pilou
                   ne le sont pas encore — c'est « Bientôt », et ça ne dépend pas
                   du joueur.
                 - `ouvert`     : il est dessiné ET son tour est venu.
               Le troisième état, « sauvé », ne se présente plus : ces animaux sont
               écartés juste au-dessus.
               ⚠ `c.actif` force l'ouverture : un animal choisi avant cette règle
               (ou par une version antérieure) ne doit jamais se retrouver
               verrouillé sous le joueur qui est en train de le sauver. */
            const ouvert = c.debloque && (i < ouverts || c.actif);

            /* Une case verrouillée n'est PAS un bouton : ni `role`, ni `tabindex`,
               ni curseur main. Rendre cliquable ce qui ne répond pas est la
               façon la plus sûre de faire croire à un bug. */
            const attrs = ouvert
                ? `role="button" tabindex="0" data-cle="${c.cle}"`
                : 'aria-disabled="true"';

            /* « Choisi » ne veut plus rien dire depuis le parcours : ce qui compte
               est de savoir qui est encore derrière des barreaux. Les trois libellés
               restants décrivent tous une SITUATION, pas l'animal — aucun n'a donc à
               s'accorder en genre. « SauvéE », le seul qui s'accordait, est parti avec
               les cartes des animaux sauvés ; on le retrouve dans js/25. */
            const etat = !c.debloque ? 'Bientôt'
                       : !ouvert     ? 'À découvrir'
                       : c.actif     ? 'En cours'
                       :               'En cage';

            /* Tout animal encore listé ici est dessiné DANS sa cage. Les compagnons
               pas encore jouables gardent leur silhouette grise : ils ne sont pas en
               cage, ils ne sont pas encore là du tout. */
            const vignette = c.debloque ? Compagnon.vignetteCage(c.cle) : c.vignette;

            /* Le grisé de `.cpx-verrou` sert aux deux verrous — pas encore
               dessiné, et pas encore ouvert — parce qu'ils disent la même chose
               au joueur : pas maintenant. Seul le libellé les distingue. */
            const classes = [
                'cpx-carte',
                c.actif   ? 'cpx-actif' : '',
                ouvert    ? ''          : 'cpx-verrou'
            ].filter(Boolean).join(' ');

            return `
                <div class="${classes}" ${attrs}
                     aria-label="${c.nom}, ${c.espece} — ${etat}">
                    <div class="cpx-vignette" style="--cpx-accent:${c.accent}">
                        ${vignette}
                        ${ouvert ? '' : '<span class="cpx-cadenas" aria-hidden="true">🔒</span>'}
                    </div>
                    <div class="cpx-nom">${c.nom}</div>
                    <div class="cpx-espece">${c.espece}</div>
                    <div class="cpx-etat">${etat}</div>
                </div>`;
        }).join('');
    }

    /* ─── LA FICHE D'UN ANIMAL SAUVÉ — DÉMÉNAGÉE (26/08/2026) ──────
       `hoteFiche()`, `montrerFiche()`, `cacherFiche()` et `basculer()` vivaient ici :
       toucher un animal déjà libéré remplaçait la grille par sa fiche, dans cette
       fenêtre. Les animaux sauvés n'y étant plus listés, plus rien ne pouvait
       ouvrir cette fiche. Elle est reprise à l'identique — même parti pris de
       remplacer la grille plutôt que d'empiler une seconde fenêtre — dans
       js/25-animaux-sauves.js. `#cpx-fiche` et son CSS sont partis avec.

       Ce qui reste partagé entre les deux écrans : `.cpx-retour` et
       `.cpx-fiche-texte` dans styles.css, et `Compagnon.fiche()` dans js/22. */

    function ouvrir() {
        const ov = document.getElementById('compagnon-modal-overlay');
        if (!ov) return;
        grille();
        ov.classList.add('open');
    }

    function fermer() {
        const ov = document.getElementById('compagnon-modal-overlay');
        if (ov) ov.classList.remove('open');
    }

    function activer(cle) {
        if (!cle || !window.Compagnon) return;
        /* Plus de garde « et s'il est déjà sauvé ? » : `grille()` ne pose plus de
           `data-cle` sur ces animaux-là, donc aucun clic ne peut arriver ici pour
           eux. Leur fiche s'ouvre depuis « Animaux sauvés » (js/25). */
        Compagnon.choisir(cle);
        grille();   // repeint AVANT la vidéo : au retour, la carte dit déjà « en cours »
        /* La fiche « qui est cet animal » peut être ouverte derrière cette fenêtre :
           sans ça elle resterait sur le compagnon précédent. */
        if (typeof rafraichirIdentiteCompagnon === 'function') rafraichirIdentiteCompagnon();

        /* ═══ LA VIDÉO DE LA CAGE (25/08/2026) ═══
           Choisir un animal, c'est partir le chercher : on montre où il est.
           Elle se joue PAR-DESSUS la fenêtre de choix (z-index 6100 contre 3000),
           qui reste ouverte derrière — au retour on est là où on avait laissé,
           sans transition à écrire.

           ⚠ ELLE PART SUR UN APPUI, et c'est ce qui la rend possible. Android
           refuse de démarrer une vidéo avec son hors d'un geste de l'utilisateur ;
           déclenchée ici, elle est toujours la conséquence directe d'un doigt sur
           une carte. Ne pas déplacer cet appel vers un enchaînement automatique
           sans passer la vidéo en `muted`.

           ⚠ ON REJOUE MÊME SI L'ANIMAL ÉTAIT DÉJÀ LE COMPAGNON COURANT.
           `Compagnon.choisir()` rend `false` dans ce cas — s'en servir comme
           condition ferait qu'un appui sur sa propre carte ne produirait rien du
           tout, ce qui se lit comme une interface morte. Toucher une carte fait
           toujours quelque chose.

           `typeof` : js/12 porte le lecteur et est chargé avant, mais un module
           absent ne doit jamais empêcher de choisir son compagnon. */
        if (typeof jouerVideo === 'function' && Compagnon.video) {
            const film = Compagnon.video(cle, 'cage');
            if (film) jouerVideo(film);
        }
    }

    document.addEventListener('DOMContentLoaded', function () {
        const ov = document.getElementById('compagnon-modal-overlay');
        if (!ov) return;

        /* Délégation sur la fenêtre entière plutôt qu'un écouteur par carte : la
           grille est reconstruite à chaque choix, des écouteurs posés carte par
           carte seraient perdus au premier clic. */
        ov.addEventListener('click', function (ev) {
            if (ev.target === ov || ev.target.closest('.cpx-fermer')) { fermer(); return; }
            const carte = ev.target.closest('.cpx-carte[data-cle]');
            if (carte) activer(carte.dataset.cle);
        });
        ov.addEventListener('keydown', function (ev) {
            if (ev.key !== 'Enter' && ev.key !== ' ') return;
            const carte = ev.target.closest && ev.target.closest('.cpx-carte[data-cle]');
            if (!carte) return;
            ev.preventDefault();
            activer(carte.dataset.cle);
        });

        document.addEventListener('keydown', function (ev) {
            if (ev.key === 'Escape' && ov.classList.contains('open')) fermer();
        });

        /* La barre du bas passe AU-DESSUS de la fenêtre (z-index 3500 contre
           3000) : ses onglets restaient donc cliquables, et l'app changeait
           d'onglet DERRIÈRE une fenêtre qui, elle, ne bougeait pas. On la ferme
           donc au passage — sans toucher au clic lui-même, `switchMainTab` fait
           son travail juste après.
           Écouteur sur la barre et non sur chaque onglet : les onglets ne sont
           pas reconstruits, mais un écouteur suffit là où il en faudrait trois. */
        const barre = document.getElementById('main-bottom-nav');
        if (barre) {
            barre.addEventListener('click', function (ev) {
                if (!ov.classList.contains('open')) return;
                if (ev.target.closest('.main-nav-tab')) fermer();
            });
        }

        /* ⚠ LE PORTRAIT DE LA CARTE DE RANG N'OUVRE PLUS CETTE FENÊTRE (26/08/2026).
           Il ouvre la fiche de l'animal en cours — c'est js/26 qui s'y accroche
           désormais. L'entrée vers le choix est une ligne nommée du Profil,
           « Animaux que vous pouvez sauver », qui appelle `openCompagnonPicker()`.
           Ne pas remettre d'écouteur ici : les deux se déclencheraient ensemble. */
    });

    window.openCompagnonPicker = ouvrir;
    window.closeCompagnonPicker = fermer;
})();

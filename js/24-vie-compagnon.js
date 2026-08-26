/* ============================================================================
   LA BARRE DE VIE DU COMPAGNON
   ----------------------------------------------------------------------------
   La jauge posée au-dessus de « arrivée / temps restant / multiplicateur »,
   dans #nav-bottom-bar. Elle ne dure que le temps de la navigation, comme les
   compteurs qu'elle surmonte.

   Elle a REMPLACÉ les points du trajet à cet endroit (25/08/2026) : deux
   compteurs de la qualité de conduite côte à côte se contredisaient plus qu'ils
   n'informaient. Le score continue d'être calculé et reste lisible dans le
   widget d'info (`#info-points`) ; ici, c'est la vie qui porte l'enjeu.

   RÉPARTITION DES RÔLES, et elle n'est pas négociable :
     · js/00-noyau-calculs.js  → le CALCUL (majVie, vieApresChoc, palierVie,
                                 VIE_ROBUSTESSE). Testable sans navigateur.
     · js/22-compagnon.js      → les DESSINS et les PHRASES, rien d'autre.
     · ce fichier              → le STOCKAGE et l'AFFICHAGE, rien d'autre.
   Toute règle de jeu qui s'écrirait ici est au mauvais endroit.

   ⚠ UNE VIE PAR ANIMAL, QUI SURVIT AU TRAJET (décision du 24/08/2026, citée
   dans l'en-tête d'A_VENIR de js/22 : « un compagnon usé ne se répare pas en
   changeant d'espèce »). C'est toute la tension du système : la barre n'est pas
   remise à 100 % au départ, elle reprend là où le trajet précédent l'a laissée,
   et seule une conduite propre la remonte. Changer de compagnon donne un animal
   neuf mais laisse l'autre exactement dans l'état où on l'a abandonné.

   API publique (window.VieCompagnon) :
     monter()               — insère le balisage et affiche la valeur courante
     avancer(m, opts)       — fait avancer la jauge sur `m` mètres parcourus
                              opts : { enExces, vitesse, limite }
     choc(facteur)          — un freinage / une accélération brusque
     valeur() / poser(v)    — lecture et écriture directes (débogage, tests)
     enregistrer()          — force l'écriture en stockage (fin de trajet)
   ============================================================================ */

(function () {
    'use strict';

    const CLE_STOCKAGE = 'gps_vie_compagnons';

    /* ⚠ ON N'ÉCRIT PAS DANS localStorage À CHAQUE POINT GPS. `avancer()` est
       appelé à chaque rafraîchissement de position — plusieurs fois par seconde
       en simulation — et `setItem` est SYNCHRONE : au rythme de la boucle de
       navigation, il suffit à faire tressauter l'affichage sur un téléphone
       modeste. On garde la valeur en mémoire et on ne la couche sur le disque
       qu'au plus toutes les DELAI_ECRITURE ms, plus une fois pour toutes à la
       fin du trajet et quand l'application passe en arrière-plan (c'est ce
       dernier cas qui protège d'une fermeture brutale, pas le délai). */
    const DELAI_ECRITURE_MS = 4000;

    let vies = {};              // { cle: vie }, l'état vrai, en mémoire
    let dernierEcrit = 0;
    let dernierPalier = null;   // pour ne repeindre la couleur qu'au changement
    let elBarre = null, elRemplissage = null, elValeur = null;

    function lire() {
        try {
            const brut = localStorage.getItem(CLE_STOCKAGE);
            const o = brut ? JSON.parse(brut) : null;
            return (o && typeof o === 'object') ? o : {};
        } catch (e) { return {}; }   // stockage indisponible : on repart à plein
    }

    function ecrire() {
        try { localStorage.setItem(CLE_STOCKAGE, JSON.stringify(vies)); } catch (e) { /* non bloquant */ }
        dernierEcrit = Date.now();
    }

    vies = lire();

    /* La clé du compagnon actif. js/22 est chargé AVANT ce fichier, mais on ne
       s'appuie pas là-dessus : `Compagnon.cle()` est interrogé à chaque appel,
       jamais mis en cache, pour que changer d'animal en cours de session change
       aussi de jauge sans qu'aucun événement n'ait à être écouté. */
    function cleCourante() {
        try {
            if (window.Compagnon && typeof Compagnon.cle === 'function') return Compagnon.cle();
        } catch (e) { /* module absent : repli */ }
        return 'babi';
    }

    /* `majVie(v, 0)` ne fait rien avancer mais BORNE la valeur : c'est le
       nettoyage d'une valeur venue du stockage (absente, corrompue, hors
       bornes) sans code dédié — voir son commentaire dans le noyau. */
    function valeur() {
        return majVie(vies[cleCourante()], 0);
    }

    function poser(v) {
        vies[cleCourante()] = v;
        rendre();
        if (Date.now() - dernierEcrit > DELAI_ECRITURE_MS) ecrire();
    }

    function enregistrer() { ecrire(); }


    // ── Le balisage ─────────────────────────────────────────────────────────
    /* Le cœur est dessiné ICI et pas dans js/22 : ce n'est pas le compagnon,
       c'est l'icône de la jauge — la même quel que soit l'animal, exactement
       comme le cœur pixel de la référence. Une grille de 7 × 6 carreaux, en
       `shape-rendering="crispEdges"` pour que les bords restent nets à toute
       taille : c'est ce réglage, et pas la forme, qui fait le rendu pixel. */
    function coeurSvg() {
        const px = (x, y, w, h, c) =>
            `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"/>`;
        const R = 'currentColor', B = '#7a0d1c', W = '#ffffff';
        return `<svg viewBox="0 0 7 6" shape-rendering="crispEdges" aria-hidden="true">
            ${px(1, 0, 2, 1, R)}${px(4, 0, 2, 1, R)}
            ${px(0, 1, 7, 1, R)}
            ${px(0, 2, 7, 1, R)}
            ${px(1, 3, 5, 1, R)}
            ${px(2, 4, 3, 1, R)}
            ${px(3, 5, 1, 1, R)}
            ${px(1, 1, 1, 2, W)}${px(2, 1, 1, 1, W)}
            ${px(5, 2, 1, 1, B)}${px(4, 3, 1, 1, B)}
        </svg>`;
    }

    function monter() {
        elBarre = document.getElementById('vie-compagnon');
        if (!elBarre) return;
        if (!elBarre.firstElementChild) {
            elBarre.innerHTML =
                `<span class="vie-coeur">${coeurSvg()}</span>` +
                `<span class="vie-piste"><span class="vie-remplissage"></span></span>` +
                `<span class="vie-valeur"></span>`;
        }
        elRemplissage = elBarre.querySelector('.vie-remplissage');
        elValeur      = elBarre.querySelector('.vie-valeur');
        dernierPalier = null;
        rendre();
    }

    function rendre() {
        if (!elRemplissage && !document.getElementById('vie-compagnon')) return;
        if (!elRemplissage) { monter(); if (!elRemplissage) return; }

        const v = valeur();
        const p = palierVie(v);
        elRemplissage.style.width = v.toFixed(1) + '%';
        if (!dernierPalier || dernierPalier.niveau !== p.niveau) {
            dernierPalier = p;
            elRemplissage.style.background = p.couleur;
            /* ⚠ LE CŒUR N'EST PAS REPEINT. Il garde le rouge posé en CSS quel que soit
               le palier : c'est le symbole de la vie, pas sa jauge. Seul le REMPLISSAGE
               change de couleur — lui, il mesure. */
            elBarre.dataset.niveau = p.niveau;   // le CSS s'en sert pour le battement
        }
        if (elValeur) elValeur.textContent = Math.round(v) + '%';
        elBarre.setAttribute('aria-label', 'Vie du compagnon : ' + Math.round(v) + ' %');
    }

    /* Le tressaillement au moment où l'on perd de la vie. La classe est retirée
       puis reposée après un reflow forcé : sans ce `void offsetWidth`, deux
       pertes rapprochées ne rejoueraient pas l'animation, le navigateur ne
       voyant aucun changement de classe entre les deux. */
    let minuteurDegat = null;
    function signalerDegat() {
        if (!elBarre) return;
        elBarre.classList.remove('vie-degat');
        void elBarre.offsetWidth;
        elBarre.classList.add('vie-degat');
        clearTimeout(minuteurDegat);
        minuteurDegat = setTimeout(() => elBarre && elBarre.classList.remove('vie-degat'), 400);
    }


    // ── Les entrées du système ──────────────────────────────────────────────
    function avancer(metres, opts) {
        const o = opts || {};
        const cle = cleCourante();
        const avant = valeur();
        const apres = majVie(avant, metres, {
            enExces: !!o.enExces, vitesse: o.vitesse, limite: o.limite, compagnon: cle
        });
        vies[cle] = apres;
        /* Seuil de 0,05 point : en dessous, le mouvement est invisible à l'écran
           et ne vaut pas un reflow — la boucle de navigation appelle cette
           fonction des dizaines de fois par seconde. */
        if (Math.abs(apres - avant) >= 0.05) {
            rendre();
            if (apres < avant) signalerDegat();
        }
        if (Date.now() - dernierEcrit > DELAI_ECRITURE_MS) ecrire();
    }

    function choc(facteur) {
        const cle = cleCourante();
        const avant = valeur();
        const apres = vieApresChoc(avant, facteur, cle);
        if (apres === avant) return;
        vies[cle] = apres;
        rendre();
        signalerDegat();
        if (Date.now() - dernierEcrit > DELAI_ECRITURE_MS) ecrire();
    }

    /* Mise en arrière-plan : c'est le seul instant où l'on est sûr d'avoir
       encore la main avant une fermeture par le système. `visibilitychange` et
       non `beforeunload`, qui n'est pas fiable sur mobile (et jamais déclenché
       quand Android tue l'application en fond). */
    document.addEventListener('visibilitychange', function () {
        if (document.visibilityState === 'hidden') ecrire();
    });

    document.addEventListener('DOMContentLoaded', monter);

    window.VieCompagnon = {
        monter: monter, rendre: rendre, avancer: avancer, choc: choc,
        valeur: valeur, poser: poser, enregistrer: enregistrer
    };
})();

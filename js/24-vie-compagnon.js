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

    /* Un seul abonné, volontairement (pas un tableau de callbacks) : à ce jour
       seule la mission « ne jamais descendre sous X% » (js/12) en a besoin, et
       une liste n'apporterait qu'une complexité sans deuxième appelant pour la
       justifier. Le second qui se présentera pourra la faire naître. */
    let onChangementCb = null;
    function onChangement(cb) { onChangementCb = (typeof cb === 'function') ? cb : null; }

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

    /* ══════════════════════════════════════════════════════════════════════
       IL Y A PLUSIEURS JAUGES À L'ÉCRAN, PAS UNE               (27/08/2026)
       ----------------------------------------------------------------------
       Une dans la barre de navigation (`#vie-compagnon`), une sous le portrait
       de la carte de rang (`#vie-compagnon-profil`) — et rien n'interdit qu'il
       y en ait d'autres demain. Elles affichent toutes LA MÊME valeur, celle du
       compagnon actif : ce ne sont pas deux jauges, c'est la même vue deux fois.

       ⚠ ON SÉLECTIONNE PAR CLASSE, PAS PAR ID, et on ne garde AUCUNE référence
       d'un appel à l'autre. Les anciennes variables `elBarre` / `elRemplissage`
       pointaient sur un élément capturé au montage : une jauge ajoutée ensuite
       (carte de rang redessinée, page ouverte plus tard) n'aurait jamais été
       mise à jour, et sans la moindre erreur — elle serait restée à 100 %.
       `querySelectorAll` à chaque rendu coûte quelques microsecondes et supprime
       toute cette classe de bug.

       ⚠ L'ÉTAT D'UNE JAUGE VIT SUR LA JAUGE (`dataset.niveau`), pas dans une
       variable du module. Avec deux barres et un seul `dernierPalier`, la
       seconde n'aurait jamais reçu sa couleur : la première ayant déjà consommé
       le changement de palier, le test « le palier a-t-il changé ? » aurait été
       faux pour elle.
       ══════════════════════════════════════════════════════════════════════ */
    function barres() {
        return document.querySelectorAll('.vie-compagnon');
    }

    /* Pose le balisage si la jauge est encore vide et rend son remplissage.
       `null` si l'élément n'a pas pu être garni — l'appelant passe son tour. */
    function garnir(el) {
        if (!el.firstElementChild) {
            el.innerHTML =
                `<span class="vie-coeur">${coeurSvg()}</span>` +
                `<span class="vie-piste"><span class="vie-remplissage"></span></span>` +
                `<span class="vie-valeur"></span>`;
            delete el.dataset.niveau;   // balisage neuf : la couleur est à reposer
        }
        return el.querySelector('.vie-remplissage');
    }

    function monter() {
        const liste = barres();
        if (!liste.length) return;
        liste.forEach(garnir);
        rendre();
    }

    function rendre() {
        const liste = barres();
        if (!liste.length) return;

        const v = valeur();
        const p = palierVie(v);
        const arrondi = Math.round(v);
        liste.forEach(function (el) {
            const remplissage = garnir(el);
            if (!remplissage) return;
            remplissage.style.width = v.toFixed(1) + '%';
            if (el.dataset.niveau !== p.niveau) {
                remplissage.style.background = p.couleur;
                /* ⚠ LE CŒUR N'EST PAS REPEINT. Il garde le rouge posé en CSS quel que
                   soit le palier : c'est le symbole de la vie, pas sa jauge. Seul le
                   REMPLISSAGE change de couleur — lui, il mesure. */
                el.dataset.niveau = p.niveau;   // le CSS s'en sert pour le battement
            }
            const val = el.querySelector('.vie-valeur');
            if (val) val.textContent = arrondi + '%';
            /* Le `aria-label` porte le chiffre sur TOUTES les jauges, y compris celle
               de la carte de rang où le pourcentage est masqué en CSS faute de place :
               ce qui est retiré à l'œil ne doit pas l'être au lecteur d'écran. */
            el.setAttribute('aria-label', 'Vie du compagnon : ' + arrondi + ' %');
        });
        signalerPhysique(v);
        if (onChangementCb) onChangementCb(v);
    }

    /* ══════════════════════════════════════════════════════════════════════
       PRÉVENIR LE MARQUEUR GPS D'UN CHANGEMENT D'ÉTAT        (27/08/2026)
       ----------------------------------------------------------------------
       L'animal sur la carte prend son image blessée puis morte à mesure que la
       jauge descend, en fondu (voir `rafraichirMarqueurCompagnon`, js/04). Ce
       fichier n'affiche rien de tout ça : il se contente de dire QUAND l'état a
       changé. La règle (`etatPhysiqueVie`) est dans js/00, l'image dans js/22, le
       fondu dans js/04 — ici, rien qu'un signal.

       ⚠ ON NE RAFRAÎCHIT QU'AU CHANGEMENT D'ÉTAT, pas à chaque point GPS.
       `rendre()` est appelée des dizaines de fois par seconde en navigation ;
       refaire le marqueur à ce rythme rejouerait le fondu sans fin.

       ⚠ LA MARQUE PORTE AUSSI LE COMPAGNON. Sans lui, passer d'un hippo blessé à
       un éléphant sain laisserait la marque sur « blesse » : l'éléphant tombant
       ensuite sous 75 % ne changerait plus d'image, l'état étant cru inchangé. */
    let dernierePhysique = null;
    function signalerPhysique(v) {
        /* Un animal du registre reste mort quoi qu'affiche la jauge — c'est le
           seul cas où l'image ne suit pas la valeur. */
        const marque = cleCourante() + ':' + (estMort() ? 'mort' : etatPhysiqueVie(v));
        if (marque === dernierePhysique) return;
        dernierePhysique = marque;
        if (typeof window.rafraichirMarqueurCompagnon === 'function') {
            try { window.rafraichirMarqueurCompagnon(); }
            catch (e) { /* pas de carte à l'écran : la barre s'affiche quand même */ }
        }
        /* Les portraits aussi : le hero et la carte de rang montrent le même animal
           que le marqueur, ils ne peuvent pas rester intacts pendant qu'il saigne. */
        if (window.Compagnon && typeof Compagnon.rafraichirPortraits === 'function') {
            try { Compagnon.rafraichirPortraits(); }
            catch (e) { /* portraits absents de la page : sans conséquence */ }
        }
    }

    /* Le tressaillement au moment où l'on perd de la vie. La classe est retirée
       puis reposée après un reflow forcé : sans ce `void offsetWidth`, deux
       pertes rapprochées ne rejoueraient pas l'animation, le navigateur ne
       voyant aucun changement de classe entre les deux. */
    let minuteurDegat = null;
    function signalerDegat() {
        const liste = barres();
        if (!liste.length) return;
        liste.forEach(function (el) {
            el.classList.remove('vie-degat');
            void el.offsetWidth;
            el.classList.add('vie-degat');
        });
        clearTimeout(minuteurDegat);
        minuteurDegat = setTimeout(function () {
            barres().forEach(el => el.classList.remove('vie-degat'));
        }, 400);
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


    /* ══════════════════════════════════════════════════════════════════════
       LE REGISTRE DES MORTS                                  (27/08/2026)
       ----------------------------------------------------------------------
       Un animal arrivé à 0 % de vie est mort, définitivement : il ne se joue
       plus, il reste grisé dans la grille de choix avec la mention « Mort ».

       ⚠ POURQUOI UN REGISTRE À PART, ET PAS SIMPLEMENT « vie === 0 ». Parce que
       tomber à 0 en roulant N'EST PAS mourir : la mort n'est prononcée qu'à
       L'ARRIVÉE (décision du 27/08/2026). Une barre vidée à mi-parcours peut
       remonter — 20 km de conduite propre — et l'animal survit. Sans ce
       registre, l'app relirait `vie === 0` à chaque ouverture et tuerait
       rétroactivement un compagnon que le joueur a ramené au-dessus de zéro.
       La mort est donc un FAIT DÉCLARÉ, avec un instant précis, pas une lecture
       de la jauge.

       ⚠ ET IL EST DANS SA PROPRE CLÉ, pas dans `gps_vie_compagnons`. Cette
       dernière est une table de nombres qu'on réécrit plusieurs fois par
       trajet ; y mêler un drapeau irréversible, c'est risquer de l'emporter au
       premier `JSON.parse` qui échoue. Perdre une vie en cours, c'est repartir
       à 100 % ; perdre le registre, c'est ressusciter tout le monde.

       ⚠ AUCUN CHEMIN DE RÉSURRECTION N'EST EXPOSÉ AU JEU, volontairement : rien
       dans l'interface du conducteur ne peut annuler une mort, et il ne faut pas
       lui en donner le moyen. La seule porte est `ressusciterTout()`, tout en bas
       de ce fichier — réservée au bouton de DÉBOGAGE « Remettre la troupe en
       cage », et qui part avec lui.
       ══════════════════════════════════════════════════════════════════════ */
    const CLE_MORTS = 'gps_compagnons_morts';

    function lireMorts() {
        try {
            const o = JSON.parse(localStorage.getItem(CLE_MORTS) || 'null');
            return (o && typeof o === 'object') ? o : {};
        } catch (e) { return {}; }   // registre illisible : personne n'est mort
    }

    let morts = lireMorts();

    function estMort(cle) {
        return !!morts[cle || cleCourante()];
    }

    /* Rend `true` seulement si c'est CE geste qui a tué l'animal : l'appelant
       (js/12) s'en sert pour n'ouvrir la fenêtre de choix qu'une fois, et pas à
       chaque arrivée suivante sur un compagnon déjà enterré. */
    function declarerMort(cle) {
        const k = cle || cleCourante();
        if (morts[k]) return false;
        /* ⚠ AUCUNE EXEMPTION, PAS MÊME POUR UN ANIMAL SAUVÉ (03/09/2026).
           Une garde a vécu ici du 29/08 au 03/09 : `compagnonEstSauve(k)` faisait
           rendre `false`, et un animal mené au bout de son parcours devenait
           immortel. Le motif était d'éviter deux registres qui se contredisent —
           « SAUVÉ » sur sa page, « Mort » dans la fenêtre de choix.
           Retirée sur décision de l'utilisateur : « ça pousse l'utilisateur à faire
           attention et à garder à l'esprit que rien n'est acquis ». Un parcours mené
           au bout n'achète plus l'immortalité ; il reste inscrit à la page des
           sauvés, ce qu'il a accompli ne s'efface pas, mais l'animal, lui, peut se
           perdre.
           ⚠ NE PAS LA REMETTRE « pour cohérence » en voyant la page des sauvés
           afficher un animal mort : c'est le comportement voulu, pas un oubli. */
        morts[k] = true;
        try { localStorage.setItem(CLE_MORTS, JSON.stringify(morts)); } catch (e) { /* non bloquant */ }
        return true;
    }

    /* ══════════════════════════════════════════════════════════════════════
       RESSUSCITER TOUTE LA TROUPE — DÉBOGAGE UNIQUEMENT      (27/08/2026)
       ----------------------------------------------------------------------
       Vide le registre des morts ET les vies, puis remet l'affichage d'aplomb.

       ⚠ C'EST L'EXCEPTION À LA RÈGLE ÉCRITE PLUS HAUT (« aucun chemin de
       résurrection n'est exposé »). Elle reste vraie pour le JEU : rien dans
       l'interface du conducteur n'appelle ceci. Le seul appelant est le bouton
       « 🔒 DEBUG — Remettre la troupe en cage » (js/12), qui existe déjà pour
       défaire les essais — et un animal mort pendant un essai était jusqu'ici
       perdu pour de bon, ce qui obligeait à effacer une clé à la main dans le
       stockage du navigateur. À retirer avec les autres boutons de débogage.

       ⚠ LES VIES SONT REMISES À NEUF EN MÊME TEMPS, et ce n'est pas un excès.
       Ressusciter un animal en le laissant à 0 % le ferait mourir de nouveau à
       l'arrivée du trajet suivant : on aurait défait le registre sans défaire
       la situation. Les deux vont ensemble ou pas du tout — même raisonnement
       que le parcours et les objectifs dans `_debugRemettreEnCage()`.

       ⚠ ON EFFACE LA CLÉ, on ne la réécrit pas à 100 %. `majVie()` borne déjà
       une valeur absente à VIE_MAX (voir `valeur()`) : un stockage vide EST un
       stockage plein, et c'est la seule façon d'être sûr qu'aucun reliquat de
       forme ancienne ne survive au nettoyage.
       ══════════════════════════════════════════════════════════════════════ */
    function ressusciterTout() {
        morts = {};
        vies  = {};
        try { localStorage.removeItem(CLE_MORTS); }     catch (e) { /* non bloquant */ }
        try { localStorage.removeItem(CLE_STOCKAGE); }  catch (e) { /* non bloquant */ }
        dernierEcrit = Date.now();

        /* La marque est remise à zéro AVANT le rendu : sans ça, un compagnon qui
           était déjà 'mort' garderait la même marque après résurrection — la jauge
           se repeindrait, mais ni le marqueur GPS ni les portraits ne changeraient
           d'image, et l'animal resterait mort à l'écran tout en étant vivant. */
        dernierePhysique = null;
        rendre();

        /* Rappel explicite du marqueur et des portraits : `rendre()` s'arrête net
           quand aucune jauge n'est dans la page (c'est le cas hors navigation sur
           certains écrans), et la résurrection doit se voir quand même. */
        if (typeof window.rafraichirMarqueurCompagnon === 'function') {
            try { window.rafraichirMarqueurCompagnon(); } catch (e) { /* pas de carte */ }
        }
        if (window.Compagnon && typeof Compagnon.rafraichirPortraits === 'function') {
            try { Compagnon.rafraichirPortraits(); } catch (e) { /* pas de portrait */ }
        }
    }

    window.VieCompagnon = {
        monter: monter, rendre: rendre, avancer: avancer, choc: choc,
        valeur: valeur, poser: poser, enregistrer: enregistrer,
        estMort: estMort, declarerMort: declarerMort,
        ressusciterTout: ressusciterTout, onChangement: onChangement
    };
})();

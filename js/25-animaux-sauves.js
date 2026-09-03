/* ============================================================================
   ANIMAUX SAUVÉS
   ----------------------------------------------------------------------------
   La page pleine ouverte depuis l'onglet Profil. Elle a REMPLACÉ la Galerie des
   trophées le 26/08/2026.

   Pourquoi le remplacement et pas la cohabitation : la galerie montrait huit
   catégories de badges, une pour chaque palier de compteur. C'était le décompte
   de l'ancien système, celui d'avant les parcours d'animaux — elle répondait à
   « combien de badges ai-je ? » quand la question de l'app est devenue « qui
   ai-je sorti de sa cage ? ». Deux vitrines pour la même progression, dont une
   qui ne parlait plus la langue du jeu.

   ⚠ CETTE PAGE EST DEVENUE LE SEUL ENDROIT OÙ L'ON REVOIT UN ANIMAL SAUVÉ.
   La fenêtre « Qui sauvons-nous ? » (js/23) ne les montre plus du tout : elle
   ne présente que ce qui est encore en cage, c'est-à-dire ce qu'on peut encore
   choisir. Toucher un animal déjà libre n'y faisait rien d'utile — son parcours
   est fini — et sa carte occupait une place dans une grille dont le sujet est
   le choix. Si cette page disparaissait, les animaux sauvés deviendraient
   invisibles : ne pas la retirer sans les remettre ailleurs.

   Ce module ne calcule rien. Il demande :
     · à js/12  qui est sauvé (`compagnonEstSauve`) ;
     · à js/22  le catalogue, les vignettes et la fiche (`Compagnon.*`).
   ============================================================================ */

(function () {
    'use strict';

    const ID_CORPS  = 'animaux-sauves-body';
    const ID_GRILLE = 'animaux-sauves-grille';
    const ID_FICHE  = 'animaux-sauves-fiche';
    const ID_VIDE   = 'animaux-sauves-vide';

    /* Le module compagnon peut ne pas être monté (script bloqué, DOM partiel) :
       dans ce cas personne n'est sauvé et la page affiche son état vide. Elle
       raconte alors la même chose que le reste de l'app plutôt que de planter. */
    function estSauve(cle) {
        return (typeof window.compagnonEstSauve === 'function')
            && window.compagnonEstSauve(cle);
    }

    function sauves() {
        if (!window.Compagnon || typeof Compagnon.catalogue !== 'function') return [];
        return Compagnon.catalogue().filter(c => c.debloque && estSauve(c.cle));
    }

    /* ─── CE QU'UN ANIMAL A VÉCU  (03/09/2026) ─────────────────────────────
       Depuis que les sauvés peuvent mourir (voir js/24), cette page est la seule
       qui garde leur trace : un animal perdu Y RESTE, décoloré, avec ses deux
       dates. C'est le contraire de la fenêtre de choix, qui le retire du jeu.
       Les deux écrans disent deux choses différentes — ce qu'il a accompli, et
       ce qu'il est devenu.

       ⚠ FORMATAGE DES DATES À LA MAIN, pas de `toLocaleDateString()`. Même raison
       que `heureArrivee()` dans le noyau : la locale dépend de l'environnement, et
       l'app tourne aussi bien dans un navigateur de bureau que dans une WebView
       chargée depuis `android_asset`. Douze noms de mois coûtent moins cher qu'un
       rendu qui change d'un appareil à l'autre. */
    const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin',
                  'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

    function jourMois(ts, avecAnnee) {
        const t = Number(ts);
        if (!isFinite(t) || t <= 0) return null;
        const d = new Date(t);
        return d.getDate() + ' ' + MOIS[d.getMonth()] + (avecAnnee ? ' ' + d.getFullYear() : '');
    }

    function estPerdu(cle) {
        return !!(window.VieCompagnon && typeof VieCompagnon.estMort === 'function'
                  && VieCompagnon.estMort(cle));
    }

    /* ⚠ LES DEUX BOUTS, OU RIEN. Une seule date connue ne se rend pas en
       « 12 août – ? » : une moitié d'information présentée comme une plage se lit
       comme une donnée sûre. Le cas arrive pour de bon — les animaux morts avant
       l'apparition du registre daté n'ont qu'un `true` en stockage. */
    function plageDeVie(cle) {
        if (!window.VieCompagnon || typeof VieCompagnon.dateNaissance !== 'function') return null;
        const tNe  = VieCompagnon.dateNaissance(cle);
        const tFin = VieCompagnon.dateDeces(cle);
        if (!tNe || !tFin) return null;
        /* ⚠ L'ANNÉE APPARAÎT DÈS QUE LES DEUX DATES N'ONT PAS LA MÊME. Sans elle,
           un animal gardé quatorze mois affichait « 30 juil. – 22 août » : trois
           semaines à la lecture, un an et un mois dans les faits. On ne l'ajoute
           PAS quand l'année est commune — elle serait du bruit sur l'écrasante
           majorité des cas. */
        const memeAnnee = new Date(tNe).getFullYear() === new Date(tFin).getFullYear();
        const ne  = jourMois(tNe,  !memeAnnee);
        const fin = jourMois(tFin, !memeAnnee);
        return (ne && fin) ? (ne + ' – ' + fin) : null;
    }

    /* L'âge : le temps passé auprès du joueur. Arrêté à la date de décès pour un
       animal perdu, sinon compté jusqu'à maintenant. Le calcul est dans le noyau,
       testable ; ici on ne fait que lui donner les dates. */
    function ageTexte(cle) {
        if (!window.VieCompagnon || typeof VieCompagnon.dateNaissance !== 'function') return '—';
        return texteAge(dureeVieJours(VieCompagnon.dateNaissance(cle),
                                      VieCompagnon.dateDeces(cle), Date.now()));
    }

    /* ─── LA GRILLE ────────────────────────────────────────────────────────
       Mêmes classes `.cpx-*` que la fenêtre de choix, et c'est voulu : un
       animal doit se présenter de la même façon des deux côtés, sinon on ne
       reconnaît pas qu'il s'agit du même. Une seule différence, qui est tout le
       sujet — ici la vignette est le dessin NU (`c.vignette`), pas la version
       derrière des barreaux. */
    function grille() {
        const hote = document.getElementById(ID_GRILLE);
        const vide = document.getElementById(ID_VIDE);
        if (!hote) return;

        const liste = sauves();

        if (vide) vide.style.display = liste.length ? 'none' : '';
        hote.style.display = liste.length ? '' : 'none';

        hote.innerHTML = liste.map(c => {
            /* « SauvéE » pour les femelles de la troupe. Le genre est DÉCLARÉ
               dans js/22, jamais déduit du nom ni de l'espèce. */
            const e = (Compagnon.genre && Compagnon.genre(c.cle) === 'f') ? 'e' : '';
            const perdu = estPerdu(c.cle);
            /* La ligne du bas dit l'essentiel de chaque cas : pour un vivant, qu'il
               est sauvé ; pour un perdu, QUAND il a vécu. Deux dates valent mieux
               que le mot « perdu » répété sous une carte déjà décolorée — et si
               elles manquent (animal mort avant le registre daté), on retombe sur
               le mot. */
            const plage = perdu ? plageDeVie(c.cle) : null;
            const bas   = perdu ? (plage || `Perdu${e}`) : `Sauvé${e}`;
            const dit   = perdu
                ? `${c.nom}, ${c.espece} — sauvé${e} puis perdu${e}${plage ? ', ' + plage : ''}, voir sa fiche`
                : `${c.nom}, ${c.espece} — sauvé${e}, voir sa fiche`;
            return `
                <div class="cpx-carte cpx-sauve${perdu ? ' cpx-perdu' : ''}" role="button" tabindex="0" data-cle="${c.cle}"
                     aria-label="${dit}">
                    <div class="cpx-vignette" style="--cpx-accent:${c.accent}">${c.vignette}</div>
                    <div class="cpx-nom">${c.nom}</div>
                    <div class="cpx-espece">${c.espece}</div>
                    <div class="cpx-age">${ageTexte(c.cle)}</div>
                    <div class="cpx-etat">${bas}</div>
                </div>`;
        }).join('');
    }

    /* ─── LA FICHE ─────────────────────────────────────────────────────────
       La fiche REMPLACE la grille au lieu de s'ouvrir par-dessus : la page est
       déjà une page pleine posée sur le Profil, un troisième étage et plus
       personne ne sait ce que ferme la croix. Même parti pris que la fenêtre de
       choix avant ce changement. */
    function montrerFiche(cle) {
        const f = document.getElementById(ID_FICHE);
        if (!f || !window.Compagnon || typeof Compagnon.fiche !== 'function') return;

        Compagnon.fiche(f, { cle: cle });

        /* Le retour est posé APRÈS le dessin : `Compagnon.fiche()` écrit tout le
           contenu de l'hôte, un bouton mis avant serait effacé. */
        const retour = document.createElement('button');
        retour.type = 'button';
        retour.className = 'cpx-retour';
        retour.textContent = '‹ Tous les animaux sauvés';
        retour.addEventListener('click', cacherFiche);
        f.insertBefore(retour, f.firstChild);

        f.appendChild(boutonPrendre(cle));
        basculer(true);
    }

    /* ─── REPRENDRE UN ANIMAL SAUVÉ COMME COMPAGNON  (29/08/2026) ──────────
       Un animal libéré pouvait être revu, jamais REPRIS : la fenêtre de choix
       (js/23) ne liste que ce qui est en cage, et c'est la seule qui menait à
       `Compagnon.choisir()`. Un joueur attaché à celui qu'il venait de sauver
       n'avait donc aucun moyen de le garder à ses côtés — la récompense d'un
       parcours réussi était de perdre l'animal de vue.

       Le bouton est ICI et pas dans la fenêtre de choix : celle-ci sert à
       décider QUI SORTIR DE CAGE, et y remettre les sauvés les montrerait à
       deux endroits — ce que l'en-tête de js/23 proscrit explicitement. Cette
       page est déjà « le seul endroit où l'on revoit un animal sauvé » ; elle
       devient l'endroit où on le reprend.

       ⚠ ON N'APPELLE PAS `activer()` DE js/23, malgré le nom : cette
       fonction-là enchaîne sur la VIDÉO DE LA CAGE, qui raconte qu'on part
       chercher l'animal derrière ses barreaux. Rejouer ça sur un animal libre
       depuis des semaines démentirait la page qui l'affiche comme sauvé. On
       passe donc par la porte d'entrée commune, `Compagnon.choisir()`, et on
       rafraîchit ce que js/23 rafraîchit aussi — sans la mise en scène. */
    function boutonPrendre(cle) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'cpx-prendre';

        /* ⚠ UN ANIMAL PERDU NE SE REPREND PAS (03/09/2026, depuis que les sauvés
           peuvent mourir). `Compagnon.choisir()` le refuse déjà et le clic ne
           faisait donc rien — exactement le « bouton mort-vivant » que la branche
           suivante interdit. Sa fiche reste consultable : c'est le sujet même de
           cette page. */
        if (estPerdu(cle)) {
            b.className += ' cpx-prendre-actif';
            b.disabled = true;
            const e = (window.Compagnon && Compagnon.genre && Compagnon.genre(cle) === 'f') ? 'e' : '';
            b.textContent = `Perdu${e} — ne peut plus être joué${e}`;
            return b;
        }

        const dejaActif = window.Compagnon && typeof Compagnon.cle === 'function'
                          && Compagnon.cle() === cle;
        if (dejaActif) {
            // Pas de bouton mort-vivant : ce qui ne fait rien ne se présente pas
            // comme cliquable (même règle que les cases verrouillées de js/23).
            b.className += ' cpx-prendre-actif';
            b.disabled = true;
            b.textContent = '✓ Votre compagnon actuel';
            return b;
        }

        b.textContent = 'Prendre comme compagnon';
        b.addEventListener('click', function () {
            if (!window.Compagnon || typeof Compagnon.choisir !== 'function') return;
            if (!Compagnon.choisir(cle)) return;   // refus (animal mort) : on ne ment pas
            if (typeof window.rafraichirIdentiteCompagnon === 'function') {
                try { window.rafraichirIdentiteCompagnon(); } catch (e) { /* la fiche se refera */ }
            }
            montrerFiche(cle);   // repeint la fiche : le bouton passe à « compagnon actuel »
        });
        return b;
    }

    function cacherFiche() { basculer(false); }

    /* Un seul endroit qui sait ce qui se montre et ce qui se cache : la fiche et
       la grille ne peuvent pas se retrouver visibles toutes les deux. */
    function basculer(versFiche) {
        const hote = document.getElementById(ID_GRILLE);
        const vide = document.getElementById(ID_VIDE);
        const f    = document.getElementById(ID_FICHE);
        if (f) f.style.display = versFiche ? '' : 'none';
        if (versFiche) {
            if (hote) hote.style.display = 'none';
            if (vide) vide.style.display = 'none';
        } else {
            /* Repasser par `grille()` plutôt que de rétablir les display à la
               main : un animal a pu être sauvé pendant qu'on lisait la fiche. */
            grille();
        }
    }

    /* Appelée à l'ouverture de la page pleine (voir PROFIL_SHEETS dans js/13).
       Toujours rouvrir sur la grille : rouvrir sur la fiche du dernier animal
       regardé donnerait une page qui ne montre pas ce que son titre annonce. */
    function rendre() {
        basculer(false);
    }

    /* Re-rendu opportuniste, pour les endroits qui signalent « quelque chose a
       changé » sans savoir si la page est ouverte : changement de profil, fin de
       trajet, retour sur l'onglet Profil. On ne repeint que si le corps est
       SOUS LES YEUX, c'est-à-dire déplacé dans la page pleine.
       ⚠ Ce test remplace celui de l'ancienne galerie, qui portait sur la classe
       `.open` d'un accordéon supprimé depuis : il ne se vérifiait donc plus
       jamais et la vitrine ouverte ne reflétait plus rien. Tester l'emplacement
       réel du contenu est la seule vérification qui reste vraie. */
    function rafraichir() {
        const corps = document.getElementById(ID_CORPS);
        if (corps && corps.classList.contains('in-profil-sheet')) rendre();
    }

    document.addEventListener('DOMContentLoaded', function () {
        const corps = document.getElementById(ID_CORPS);
        if (!corps) return;

        /* Délégation sur le corps entier plutôt qu'un écouteur par carte : la
           grille est reconstruite à chaque rendu, des écouteurs posés carte par
           carte seraient perdus au premier repeint.
           ⚠ L'écouteur est posé sur le CORPS, et le corps est DÉPLACÉ dans la
           page pleine puis remis dans le panneau (voir openProfilSheet). Un
           écouteur survit à un déplacement de nœud ; un écouteur posé sur la
           page pleine, lui, ne verrait rien une fois le corps rentré. */
        corps.addEventListener('click', function (ev) {
            const carte = ev.target.closest('.cpx-carte[data-cle]');
            if (carte) montrerFiche(carte.dataset.cle);
        });
        corps.addEventListener('keydown', function (ev) {
            if (ev.key !== 'Enter' && ev.key !== ' ') return;
            const carte = ev.target.closest && ev.target.closest('.cpx-carte[data-cle]');
            if (!carte) return;
            ev.preventDefault();
            montrerFiche(carte.dataset.cle);
        });
    });

    window.renderAnimauxSauves    = rendre;
    window.rafraichirAnimauxSauves = rafraichir;
})();

/* ═══════════════════════════════════════════════════════════════════════════
   PALETTE DE L'INTERFACE — Crépuscule / Canopée / Abysse        (03/09/2026)

   Trois thèmes, une seule feuille de style. `theme-crepuscule.css` n'est PAS
   dupliqué : ses 316 sélecteurs restent scopés sur `body.theme-crepuscule`,
   qui reste posée dans les trois cas, et une palette ne redéfinit que le bloc
   de jetons (voir § 1bis de ce fichier CSS). Le <body> porte donc :

       theme-crepuscule                → Crépuscule
       theme-crepuscule pal-canopee    → Canopée
       theme-crepuscule pal-abysse     → Abysse

   ⚠ NE JAMAIS RETIRER `theme-crepuscule` pour « changer de thème » : ce n'est
   pas la palette, c'est TOUT le thème. L'app retomberait sur l'ancien dark/néon
   de styles.css, avec la moitié des composants dépareillés.

   ⚠ Ce module n'a RIEN à voir avec `toggleMapTheme()` (js/04), qui bascule le
   style Mapbox jour/nuit. Deux réglages indépendants : celui-ci ne touche pas
   à la carte, et le style Mapbox reste neutre dans les trois palettes. C'est
   la limite connue de cette version — teinter la carte demande un style Mapbox
   dédié, pas du CSS.

   Placé en dernier dans index.html et sans aucune dépendance : il lit et écrit
   une classe sur <body>, rien d'autre. La pose INITIALE n'est pas faite ici
   mais par le script en tête de <body> — sinon on verrait l'écran peint en
   Crépuscule pendant une image avant de basculer.
   ═══════════════════════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    const CLE_STOCKAGE = 'gps_theme';

    /* ⚠ LES COULEURS D'`apercu` SONT FIGÉES EXPRÈS, ce ne sont pas des doublons
       à remplacer par des `var(--cr-*)`. Chaque ligne de la liste doit montrer
       la palette QU'ELLE PROPOSE : branchée sur les variables, les trois lignes
       s'afficheraient dans le thème courant et le choix deviendrait aveugle.
       Elles doivent en revanche suivre les valeurs du CSS à la main si celles-ci
       changent — c'est le prix de l'aperçu. */
    const THEMES = [
        {
            cle: 'crepuscule', classe: '',
            nom: 'Crépuscule', sous: 'Violet — le thème d’origine',
            apercu: { fond: '#1B1633', ciel: '#241C42', encre: '#F4EFFF', encre2: '#8B7BAE', action: '#FFB35C' }
        },
        {
            cle: 'canopee', classe: 'pal-canopee',
            nom: 'Canopée', sous: 'Vert forêt — la teinte de la troupe',
            apercu: { fond: '#101F19', ciel: '#162C23', encre: '#EFFFF6', encre2: '#7BAE92', action: '#FFBC63' }
        },
        {
            cle: 'abysse', classe: 'pal-abysse',
            nom: 'Abysse', sous: 'Bleu nuit — la plus lisible au volant',
            apercu: { fond: '#101C33', ciel: '#172642', encre: '#EFF6FF', encre2: '#7B93B5', action: '#FFB35C' }
        }
    ];

    const CLASSES = THEMES.map(t => t.classe).filter(Boolean);

    function definitionDe(cle) {
        return THEMES.find(t => t.cle === cle) || THEMES[0];
    }

    /* La source de vérité est le STOCKAGE, pas la classe posée sur <body> : lire
       la classe reviendrait à demander au script d'amorçage ce qu'il a compris,
       et on perdrait la distinction entre « Crépuscule choisi » et « rien de
       lisible dans le stockage ». Les deux donnent le même écran, mais pas la
       même chose à réafficher dans la liste. */
    function themeCourant() {
        let brut = null;
        try { brut = localStorage.getItem(CLE_STOCKAGE); } catch (e) { /* stockage illisible */ }
        return definitionDe(brut).cle;
    }

    function appliquerTheme(cle) {
        const def = definitionDe(cle);
        const corps = document.body;
        if (!corps) return;

        /* Retirer TOUTES les classes de palette avant d'en poser une : sans ça,
           deux `pal-` cohabiteraient et c'est l'ordre du CSS — pas le choix de
           l'utilisateur — qui trancherait. */
        CLASSES.forEach(c => corps.classList.remove(c));
        if (def.classe) corps.classList.add(def.classe);

        try { localStorage.setItem(CLE_STOCKAGE, def.cle); } catch (e) { /* le choix ne survivra pas à la fermeture, tant pis */ }

        /* La liste montre la coche du thème actif : elle doit se redessiner ici,
           et pas dans le gestionnaire de clic, pour rester juste même quand le
           thème est changé par un import de profil. */
        renderThemePicker();
    }

    function svgCoche(couleur) {
        const NS = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('fill', 'none');
        svg.setAttribute('stroke', couleur);
        svg.setAttribute('stroke-width', '3');
        svg.setAttribute('stroke-linecap', 'round');
        svg.setAttribute('stroke-linejoin', 'round');
        svg.setAttribute('aria-hidden', 'true');
        const trait = document.createElementNS(NS, 'polyline');
        trait.setAttribute('points', '4 12 10 18 20 6');
        svg.appendChild(trait);
        return svg;
    }

    function pastille(couleur) {
        const d = document.createElement('span');
        d.className = 'theme-pick-dot';
        d.style.background = couleur;
        return d;
    }

    /* Construit la liste en DOM + textContent plutôt qu'en gabarit `innerHTML`
       (règle 5 du projet). Aucun de ces libellés ne vient du réseau, mais c'est
       un écran neuf : autant ne pas ouvrir la porte. */
    function renderThemePicker() {
        const hote = document.getElementById('theme-picker');
        if (!hote) return;
        const actif = themeCourant();
        hote.textContent = '';

        THEMES.forEach(t => {
            const a = t.apercu;
            const estActif = t.cle === actif;

            const ligne = document.createElement('button');
            ligne.type = 'button';
            ligne.className = 'theme-pick';
            ligne.style.background = a.fond;
            ligne.style.border = '1px solid ' + (estActif ? a.action : 'rgba(255,255,255,0.12)');
            /* Le thème actif est signalé DEUX fois — bordure teintée et coche —
               parce que sur trois fonds sombres très proches, la seule bordure
               ne se voit pas à bout de bras. */
            ligne.style.boxShadow = estActif ? '0 0 0 1px ' + a.action : 'none';
            ligne.setAttribute('aria-pressed', estActif ? 'true' : 'false');
            ligne.onclick = function () { appliquerTheme(t.cle); };

            const bloc = document.createElement('span');
            bloc.className = 'theme-pick-swatch';
            bloc.style.background = a.ciel;
            bloc.appendChild(pastille(a.action));
            bloc.appendChild(pastille(a.encre));
            bloc.appendChild(pastille(a.encre2));
            ligne.appendChild(bloc);

            const texte = document.createElement('span');
            texte.className = 'theme-pick-text';
            const nom = document.createElement('span');
            nom.className = 'theme-pick-name';
            nom.style.color = a.encre;
            nom.textContent = t.nom;
            const sous = document.createElement('span');
            sous.className = 'theme-pick-sub';
            sous.style.color = a.encre2;
            sous.textContent = t.sous;
            texte.appendChild(nom);
            texte.appendChild(sous);
            ligne.appendChild(texte);

            const coche = document.createElement('span');
            coche.className = 'theme-pick-check';
            if (estActif) coche.appendChild(svgCoche(a.action));
            ligne.appendChild(coche);

            hote.appendChild(ligne);
        });
    }

    /* Remise au propre au chargement. Le script d'amorçage en tête de <body> ne
       VALIDE rien : il pose `pal-` + ce qu'il a lu. Une clé corrompue ou le nom
       d'un thème retiré depuis y produit une classe inconnue — inoffensive pour
       l'affichage (on obtient Crépuscule), mais elle resterait sur <body> et
       fausserait un futur `classList.contains`. On repasse donc une fois. */
    appliquerTheme(themeCourant());

    window.appliquerTheme   = appliquerTheme;
    window.themeCourant     = themeCourant;
    window.renderThemePicker = renderThemePicker;
})();

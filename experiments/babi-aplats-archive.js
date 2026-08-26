/* ARCHIVE — Babi en aplats, tel qu'il était le 24/08/2026, avant le passage au
   style kawaii avec dégradés. Gelé : ne rien corriger ici, ce fichier n'existe
   que pour pouvoir revenir voir l'ancien dessin.

   Il s'expose sous `window.BabiAplats` et NON `window.Compagnon` : chargé à côté
   du module vivant, il l'écraserait. Le montage automatique est retiré pour la
   même raison. Voir experiments/apercu-babi-aplats.html.
*/
/* ============================================================================
   LE COMPAGNON — Babi, l'éléphanteau
   ----------------------------------------------------------------------------
   Un compagnon est UNIQUEMENT des dessins + des phrases. Aucune logique métier
   ne vit ici : ce module ne calcule rien, il ne fait qu'afficher un état et une
   phrase qu'on lui donne. C'est ce qui permettra d'ajouter le coq, le chat ou
   le chien sans toucher une ligne de code — juste un objet de plus dans
   COMPAGNONS.

   ⚠ RÈGLE NON NÉGOCIABLE : le compagnon disparaît pendant la navigation.
   Elle est appliquée en CSS (`body.nav-active` masque le bloc), PAS en JS —
   volontairement : une règle de sécurité ne doit pas dépendre d'un événement
   qui peut ne pas se déclencher. Voir § 12 de theme-crepuscule.css.

   API publique :
     Compagnon.monter()            — remplit le bloc du hero (balisage index.html)
     Compagnon.etat('ravi')        — change l'expression
     Compagnon.dit('cle', {...})   — change la phrase de la bulle
     Compagnon.phrase('cle', {...})— la même phrase, en texte, sans la bulle
     Compagnon.dessin('ravi')      — le SVG du compagnon, à poser où l'on veut
     Compagnon.clairiere(el, {...})— dessine la clairière du carnet
     Compagnon.rang(el, {...})     — le portrait de rang du Profil (avec médaille)
   ============================================================================ */

(function () {
    'use strict';

    /* --- Les états. Les cinq sont communs à TOUS les compagnons : le code n'a
       qu'un seul jeu d'états à gérer, quel que soit l'animal choisi. --------- */
    const ETATS = ['repos', 'ravi', 'secoue', 'assoupi'];
    /* 'absent' n'est pas dans cette liste : ce n'est pas une expression, c'est
       l'absence du bloc entier, gérée par le CSS. */

    const COMPAGNONS = {
        babi: {
            nom: 'Babi',
            espece: 'éléphanteau',
            accent: '#A88BFF',
            /* La voix. Babi constate et se souvient — il ne juge jamais et ne
               culpabilise jamais. Une mauvaise semaine ne produit pas un
               reproche : c'est ce qui fait revenir plutôt que désinstaller. */
            phrases: {
                accueil:        () => 'Bonjour',
                accueil_soir:   () => 'Bonsoir',
                destination_ok: () => 'C\'est noté. On y va ?',
                objectifs:      (v) => `${v.km} km par semaine depuis ${v.sem} semaines. Je note.`,
                carnet_cale:    (v) => `Tu roules ${v.km} km par semaine en moyenne — j'ai calé tes défis là-dessus.`,
                carnet_observe: (v) => `Je te regarde rouler (${v.sem}/${v.total} semaines). Encore ${v.reste}, et je calerai tes défis sur toi.`,
                rang_progres:   (v) => `Encore ${v.reste} badge${v.reste > 1 ? 's' : ''} et il passe ${v.suivant}.`,
                rang_max:       () => 'Il ne peut pas monter plus haut. Tu l\'as mené au bout.',
                clairiere:      (v) => v.pousses === 0
                                        ? "Rien n'a encore poussé cette semaine. Ça vient."
                                        : `${v.pousses} pousse${v.pousses > 1 ? 's' : ''} sur ${v.total} cette semaine`,
                trajet_doux:    () => 'Trajet tout en douceur. Je m\'en souviendrai.',
                trajet_brusque: (v) => `${v.freinages} freinages. ${v.ecart} de plus que d'habitude.`,
                defi_valide:    (v) => `Un défi de moins. Il t'en reste ${v.reste}.`,
                badge:          () => 'Badge obtenu. Je te l\'ajoute.'
            },
            dessin: dessinerBabi
        }
        /* Prochain compagnon : KADAR, le lion. Chaque animal aura sa PROPRE vie
           (décision du 24/08/2026) — un compagnon usé ne se répare pas en
           changeant d'espèce. La jauge vivra donc dans le module de calcul,
           indexée par cette clé, jamais ici : ce module reste des dessins et
           des phrases. */
    };

    let courant = 'babi';
    let etatCourant = 'repos';

    /* ======================================================================
       LE DESSIN
       Un seul gabarit paramétré par l'état plutôt que cinq SVG recopiés : les
       proportions du corps restent identiques d'un état à l'autre, seuls le
       visage, les oreilles et la trompe changent. Sans ça, la moindre retouche
       de silhouette serait à reporter cinq fois.
       ====================================================================== */
    function dessinerBabi(etat) {
        return `<svg class="cp-svg" viewBox="0 0 120 130" aria-hidden="true">${dessinBabiInterieur(etat)}</svg>`;
    }

    /* Le contenu seul, sans <svg> : la clairière l'imbrique dans SA planche, à
       une autre échelle. Sans cette séparation il aurait fallu recopier tout
       l'éléphant — deux dessins à retoucher au lieu d'un. */
    function dessinBabiInterieur(etat) {
        const CORPS = '#8E86B8', OMBRE = '#7E76A8', CLAIR = '#ABA3D4',
              OREILLE = '#E0A8C0', IVOIRE = '#FFF0DC', OEIL = '#33203A',
              CONTOUR = '#665E8E';

        /* --- La trompe. Elle est de la MÊME couleur que la tête et passe devant
           elle : sans liseré elle se fond dans la silhouette et l'éléphant perd
           le seul trait qui l'identifie de loin. Chaque segment est donc dessiné
           DEUX fois — une passe large en `CONTOUR`, puis la passe normale en
           `CORPS` par-dessus.

           ⚠ Les deux passes sont SÉPARÉES (tous les liserés d'abord, tous les
           remplissages ensuite). Dessinées segment par segment, le liseré du
           second mordrait sur le remplissage du premier et couperait la trompe
           en tronçons à chaque jointure.

           Les anneaux viennent en dernier : c'est le second signe de lecture,
           celui qui fait dire « trompe » plutôt que « tuyau ». Ils sont courbes
           et non droits — sur un tube vu de face, un trait droit aplatit le
           volume que le liseré vient de créer. */
        const trompe = (segments, anneaux) =>
              segments.map(s => `<path d="${s.d}" stroke="${CONTOUR}" stroke-width="${s.w + 3.2}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('')
            + segments.map(s => `<path d="${s.d}" stroke="${CORPS}" stroke-width="${s.w}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`).join('')
            + (anneaux || []).map(d => `<path d="${d}" stroke="${CONTOUR}" stroke-width="1.9" fill="none" stroke-linecap="round" opacity="0.55"/>`).join('');

        // --- oreilles : tombantes quand il est triste, sinon déployées
        const oreilles = etat === 'secoue'
            ? `<g transform="rotate(13 40 44)"><ellipse cx="31" cy="60" rx="17" ry="21" fill="${CORPS}"/><ellipse cx="33" cy="62" rx="10.5" ry="14" fill="${OREILLE}" opacity="0.6"/></g>
               <g transform="rotate(-13 80 44)"><ellipse cx="89" cy="60" rx="17" ry="21" fill="${CORPS}"/><ellipse cx="87" cy="62" rx="10.5" ry="14" fill="${OREILLE}" opacity="0.6"/></g>`
            : `<g class="cp-earL"><ellipse cx="30" cy="52" rx="20" ry="22" fill="${CORPS}"/><ellipse cx="32" cy="53" rx="13" ry="15" fill="${OREILLE}" opacity="0.75"/></g>
               <g class="cp-earR"><ellipse cx="90" cy="52" rx="20" ry="22" fill="${CORPS}"/><ellipse cx="88" cy="53" rx="13" ry="15" fill="${OREILLE}" opacity="0.75"/></g>`;

        // --- trompe : levée quand il est ravi, pendante et molle quand il est triste
        let dessinTrompe;
        if (etat === 'ravi') {
            dessinTrompe = trompe(
                [{ d: 'M62 64 C70 72 82 74 88 66', w: 13 },
                 { d: 'M88 66 C92 60 90 52 84 50',  w: 9 },
                 { d: 'M84 50 C81 48 79 50 79 52',  w: 6 }],
                ['M70 65.6 Q71.6 69.6 70.8 73.6', 'M79 66.8 Q80.6 70.9 79.6 74.9']);
        } else if (etat === 'secoue') {
            /* Triste, pas agacé : la trompe PEND au lieu de se replier, et le bout
               se recroqueville contre le corps. Une trompe enroulée haut se lit
               comme de la contrariété ; une trompe molle se lit comme de
               l'abattement — c'est tout l'écart entre les deux versions. */
            dessinTrompe = trompe(
                [{ d: 'M60 63 C58 75 57 86 55 94',       w: 13 },
                 { d: 'M55 94 C54 99 51 101 48 99',      w: 9 },
                 { d: 'M48 99 C46 97.5 46.5 95.5 48 95', w: 5.5 }],
                ['M53.2 71 Q58.7 73 64.2 71', 'M52 79.2 Q57.5 81.2 63 79.2', 'M50.9 86.7 Q56.4 88.7 61.9 86.7']);
        } else {
            dessinTrompe = `<g class="cp-trunk">${trompe(
                [{ d: 'M60 62 C57 74 55 84 58 92',  w: 14 },
                 { d: 'M58 92 C60 99 67 100 70 95', w: 10 },
                 { d: 'M70 95 C72 92 70 89 68 90',  w: 6.5 }],
                ['M52.5 69.8 Q58 71.8 63.5 69.8', 'M51.3 77.7 Q56.8 79.7 62.3 77.7', 'M51.2 85 Q56.7 87 62.2 85'])}</g>`;
        }

        // --- yeux : c'est le visage qui porte l'essentiel de l'expression
        let yeux;
        if (etat === 'ravi') {
            yeux = `<path d="M43 51 C45.5 45 50.5 45 53 51" stroke="${OEIL}" stroke-width="3.4" fill="none" stroke-linecap="round"/>
                    <path d="M67 51 C69.5 45 74.5 45 77 51" stroke="${OEIL}" stroke-width="3.4" fill="none" stroke-linecap="round"/>`;
        } else if (etat === 'assoupi') {
            yeux = `<path d="M43 49 C45.5 53 50.5 53 53 49" stroke="${OEIL}" stroke-width="3.2" fill="none" stroke-linecap="round"/>
                    <path d="M67 49 C69.5 53 74.5 53 77 49" stroke="${OEIL}" stroke-width="3.2" fill="none" stroke-linecap="round"/>`;
        } else if (etat === 'secoue') {
            /* ⚠ Le SENS des sourcils est tout le message. L'ancienne version les
               faisait descendre vers l'intérieur (`M41 42 L53 46`) : c'est le
               masque de la colère, et Babi passait pour agacé ou dubitatif — un
               compagnon qui ne juge jamais ne peut pas avoir cette tête-là. Ici
               l'intérieur est RELEVÉ et l'extérieur retombe : c'est le pli de la
               tristesse. Ne pas réinverser.

               Les yeux gardent leur reflet et gagnent un second point de brillance
               en bas : un œil mat se lit comme éteint ou fâché, un œil brillant
               comme ému. */
            yeux = `<path d="M40.5 46 C44 42 48.5 40.4 52.5 40.4" stroke="${OEIL}" stroke-width="2.8" fill="none" stroke-linecap="round"/>
                    <path d="M79.5 46 C76 42 71.5 40.4 67.5 40.4" stroke="${OEIL}" stroke-width="2.8" fill="none" stroke-linecap="round"/>
                    <g class="cp-eyes">
                      <ellipse cx="47" cy="50.5" rx="4.9" ry="6" fill="${OEIL}"/><ellipse cx="73" cy="50.5" rx="4.9" ry="6" fill="${OEIL}"/>
                      <circle cx="48.9" cy="48.2" r="1.8" fill="#FFF"/><circle cx="74.9" cy="48.2" r="1.8" fill="#FFF"/>
                      <circle cx="45.3" cy="53.4" r="1.05" fill="#FFF" opacity="0.75"/><circle cx="71.3" cy="53.4" r="1.05" fill="#FFF" opacity="0.75"/>
                    </g>`;
        } else {
            yeux = `<g class="cp-eyes">
                      <ellipse cx="47" cy="49" rx="4.6" ry="5.6" fill="${OEIL}"/><ellipse cx="73" cy="49" rx="4.6" ry="5.6" fill="${OEIL}"/>
                      <circle cx="48.8" cy="46.8" r="1.7" fill="#FFF"/><circle cx="74.8" cy="46.8" r="1.7" fill="#FFF"/>
                    </g>`;
        }

        // --- petits signes d'état, en surimpression
        let signe = '';
        if (etat === 'assoupi') {
            signe = `<text class="cp-zz" x="92" y="30" font-size="17" font-weight="800" fill="#A88BFF">z</text>
                     <text class="cp-zz cp-zz2" x="98" y="38" font-size="13" font-weight="800" fill="#A88BFF">z</text>`;
        } else if (etat === 'secoue') {
            /* Une larme sur la joue, pas une goutte de sueur au-dessus de la tête :
               la sueur dit l'effort ou l'énervement, la larme est le seul signe qui
               dise la tristesse sans ambiguïté. Elle part sous l'œil pour être lue
               comme venant de lui. */
            signe = `<path class="cp-larme" d="M43 57 C43 57 39.8 62.4 39.8 65 A3.2 3.2 0 0 0 46.2 65 C46.2 62.4 43 57 43 57 Z" fill="#7FD8E8"/>`;
        }

        /* Les joues restent, atténuées : sans elles le visage triste vire au visage
           malade, ce qui n'est pas la même chose. */
        const joues = etat === 'secoue'
            ? `<ellipse cx="37" cy="61.5" rx="6" ry="3.8" fill="#FF8FA3" opacity="0.26"/>
               <ellipse cx="83" cy="61.5" rx="6" ry="3.8" fill="#FF8FA3" opacity="0.26"/>`
            : `<ellipse cx="38" cy="60" rx="6.5" ry="4.2" fill="#FF8FA3" opacity="0.45"/>
               <ellipse cx="82" cy="60" rx="6.5" ry="4.2" fill="#FF8FA3" opacity="0.45"/>`;

        return `
            <ellipse cx="60" cy="122" rx="30" ry="5" fill="#0F0A20" opacity="0.4"/>
            <g class="cp-body">
              <path d="M86 100 C94 102 96 108 94 113" stroke="${OMBRE}" stroke-width="3.5" fill="none" stroke-linecap="round"/>
              <path d="M94 111 C97 113 97 117 94 118 C92 116 92 113 94 111 Z" fill="${IVOIRE}" opacity="0.75"/>
              <ellipse cx="60" cy="98" rx="27" ry="22" fill="${CORPS}"/>
              <ellipse cx="60" cy="104" rx="16" ry="13" fill="${CLAIR}"/>
              <ellipse cx="42" cy="117" rx="9" ry="5.5" fill="${OMBRE}"/>
              <ellipse cx="78" cy="117" rx="9" ry="5.5" fill="${OMBRE}"/>
              ${oreilles}
              <circle cx="60" cy="50" r="28" fill="${CORPS}"/>
              <path d="M50 72 C47 76 47 80 49 82 C51 80 51.5 76 51.5 72 Z" fill="${IVOIRE}"/>
              <path d="M70 72 C73 76 73 80 71 82 C69 80 68.5 76 68.5 72 Z" fill="${IVOIRE}"/>
              ${dessinTrompe}
              ${yeux}
              ${joues}
            </g>
            ${signe}`;
    }

    /* ======================================================================
       LE PORTRAIT DE RANG (onglet Profil)
       Le compagnon avec la médaille de la catégorie autour du cou. La couleur
       vient de la table des catégories (js/12) : c'est ELLE qui décide, pas ce
       module — bronze, argent, or… changent là-bas et se répercutent ici sans
       qu'on y touche.

       ⚠ C'est le compagnon qui porte le rang, pas une pastille dans un coin :
       une médaille posée sur un animal se lit d'un coup d'œil et donne envie de
       la faire changer de couleur. Ne pas la remplacer par un badge flottant.
       ====================================================================== */

    /* infos : { couleur, chiffre (le nombre de badges, gravé sur la médaille) } */
    function rang(cible, infos) {
        const el = typeof cible === 'string' ? document.getElementById(cible) : cible;
        if (!el) return;
        infos = infos || {};
        const couleur = infos.couleur || COMPAGNONS[courant].accent;
        const chiffre = (infos.chiffre === null || infos.chiffre === undefined) ? '' : String(infos.chiffre);

        /* La médaille est dessinée APRÈS le corps, donc par-dessus : le ruban part
           des épaules et le disque retombe sur le ventre clair. */
        const medaille = `
            <g class="cp-medaille">
                <path d="M46 84 L58 100 M74 84 L62 100" stroke="${couleur}" stroke-width="5" stroke-linecap="round" opacity="0.9"/>
                <circle cx="60" cy="106" r="12" fill="${couleur}" stroke="#FFF0DC" stroke-width="2.5"/>
                <circle cx="60" cy="106" r="7.5" fill="none" stroke="#2A1226" stroke-width="1.6" opacity="0.45"/>
                <text x="60" y="110.5" text-anchor="middle" font-size="11" font-weight="800" fill="#2A1226">${chiffre}</text>
            </g>`;

        el.innerHTML = `
            <svg class="cp-svg cp-rang" viewBox="0 0 120 130" aria-hidden="true">
                <defs>
                    <radialGradient id="cp-halo-grad">
                        <stop offset="0" stop-color="${couleur}" stop-opacity="0.45"/>
                        <stop offset="0.65" stop-color="${couleur}" stop-opacity="0.16"/>
                        <stop offset="1" stop-color="${couleur}" stop-opacity="0"/>
                    </radialGradient>
                </defs>
                <circle class="cp-halo" cx="60" cy="62" r="58" fill="url(#cp-halo-grad)"/>
                ${dessinBabiInterieur('ravi')}
                ${medaille}
            </svg>`;
    }

    /* ======================================================================
       LA CLAIRIÈRE
       Le score de la semaine sous forme de paysage : une pousse lumineuse par
       défi bouclé, une graine en pointillés par défi restant, et le compagnon
       assis au milieu.

       ⚠ RIEN NE MEURT ICI. Une semaine ratée ne fait pas faner la clairière,
       elle ne fait juste rien pousser de plus : les graines en pointillés sont
       une attente, pas un reproche. C'est la règle de la voix du compagnon —
       constater sans culpabiliser. Ne pas ajouter de pousse fanée, de compteur
       qui redescend ni de couleur d'alerte.

       Ce module ne calcule rien : il reçoit `pousses`, `total` et le score
       éco déjà faits par js/12-gamification.js.
       ====================================================================== */

    /* La planche est plus haute que le paysage (168) : les ~28 px du bas sont une
       bande de sol au premier plan, laissée VIDE pour la légende. Sans elle,
       « Ta clairière » se posait sur les pousses et sur le compagnon. */
    const CL_L = 354, CL_H = 196, CL_SOL = 168;

    /* Les emplacements de plantes sont FIXES et parcourus dans l'ordre : la
       première pousse sort toujours au même endroit d'une semaine à l'autre.
       Des positions tirées au hasard donneraient une clairière différente à
       chaque rendu — impossible de voir qu'elle progresse. */
    const CL_PLACES = [
        { x: 54,  y: 140, teinte: '#6FE3A0' },
        { x: 96,  y: 146, teinte: '#7FD8E8' },
        { x: 254, y: 139, teinte: '#A88BFF' },
        { x: 298, y: 145, teinte: '#FFB35C' },
        { x: 332, y: 136, teinte: '#7FD8E8' },
        { x: 214, y: 148, teinte: '#6FE3A0' }
    ];

    function clPousse(pl, i) {
        return `<g class="cl-pl" style="transform-origin: ${pl.x}px ${pl.y}px; animation-delay: ${(i * 1.1).toFixed(1)}s">
            <path d="M${pl.x} ${pl.y} L${pl.x} ${pl.y - 26}" stroke="${pl.teinte}" stroke-width="3" stroke-linecap="round"/>
            <path d="M${pl.x} ${pl.y - 16} C${pl.x - 10} ${pl.y - 18} ${pl.x - 14} ${pl.y - 26} ${pl.x - 12} ${pl.y - 34} C${pl.x - 4} ${pl.y - 34} ${pl.x} ${pl.y - 26} ${pl.x} ${pl.y - 16} Z" fill="${pl.teinte}"/>
            <path d="M${pl.x} ${pl.y - 10} C${pl.x + 10} ${pl.y - 12} ${pl.x + 14} ${pl.y - 20} ${pl.x + 12} ${pl.y - 28} C${pl.x + 4} ${pl.y - 28} ${pl.x} ${pl.y - 20} ${pl.x} ${pl.y - 10} Z" fill="${pl.teinte}" opacity="0.75"/>
            <circle cx="${pl.x}" cy="${pl.y - 30}" r="9" fill="${pl.teinte}" opacity="0.22" filter="url(#cl-flou)"/>
        </g>`;
    }

    function clGraine(pl) {
        return `<g opacity="0.4">
            <path d="M${pl.x} ${pl.y - 2} L${pl.x} ${pl.y - 10}" stroke="#8B7BAE" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="3 3"/>
            <circle cx="${pl.x}" cy="${pl.y - 14}" r="4" fill="none" stroke="#8B7BAE" stroke-width="2" stroke-dasharray="3 3"/>
        </g>`;
    }

    /* infos : { pousses, total, scoreEco (nombre, ou null si aucun trajet) } */
    function clairiere(cible, infos) {
        const el = typeof cible === 'string' ? document.getElementById(cible) : cible;
        if (!el) return;
        infos = infos || {};

        const total   = Math.max(1, Math.min(CL_PLACES.length, infos.total || 0));
        const pousses = Math.max(0, Math.min(total, infos.pousses || 0));
        const places  = CL_PLACES.slice(0, total);
        const plantes = places.map((pl, i) => i < pousses ? clPousse(pl, i) : clGraine(pl)).join('');

        /* Le compagnon est assis au milieu de sa clairière, à 0.62 : à l'échelle
           1 il ferait la hauteur entière de la planche. */
        const babi = `<g transform="translate(146,46) scale(0.62)">${dessinBabiInterieur('repos')}</g>`;

        const eco = (infos.scoreEco === null || infos.scoreEco === undefined)
            ? ''
            : `<div class="cl-eco">Score éco ${Math.round(infos.scoreEco)}</div>`;

        el.innerHTML = `
            <svg class="cl-svg" viewBox="0 0 ${CL_L} ${CL_H}" aria-hidden="true">
                <defs>
                    <linearGradient id="cl-ciel" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stop-color="#2B2050"/><stop offset="1" stop-color="#173A3A"/>
                    </linearGradient>
                    <filter id="cl-flou" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4"/></filter>
                    <linearGradient id="cl-voile" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stop-color="#0F0A20" stop-opacity="0"/>
                        <stop offset="1" stop-color="#0F0A20" stop-opacity="0.55"/>
                    </linearGradient>
                </defs>
                <rect width="${CL_L}" height="${CL_H}" fill="url(#cl-ciel)"/>
                <circle cx="300" cy="34" r="16" fill="#FFE9B8" opacity="0.85"/>
                <circle cx="300" cy="34" r="30" fill="#FFE9B8" opacity="0.16" filter="url(#cl-flou)"/>
                <g fill="#FFF0DC" opacity="0.6">
                    <circle cx="40" cy="26" r="1.4"/><circle cx="96" cy="46" r="1.1"/>
                    <circle cx="160" cy="22" r="1.3"/><circle cx="238" cy="52" r="1.1"/>
                </g>
                <path d="M0 132 C60 118 120 126 178 122 C240 118 300 128 354 120 L354 ${CL_H} L0 ${CL_H} Z" fill="#1E4A40"/>
                <path d="M0 148 C70 140 130 148 200 144 C266 140 310 148 354 142 L354 ${CL_H} L0 ${CL_H} Z" fill="#183B34"/>
                ${plantes}
                <g fill="#FFE9B8">
                    <circle class="cl-ff" cx="150" cy="120" r="2"/>
                    <circle class="cl-ff" cx="200" cy="132" r="1.6" style="animation-delay:2s"/>
                    <circle class="cl-ff" cx="176" cy="110" r="1.8" style="animation-delay:4s"/>
                </g>
                ${babi}
                <rect x="0" y="${CL_SOL - 30}" width="${CL_L}" height="${CL_H - CL_SOL + 30}" fill="url(#cl-voile)"/>
            </svg>
            <div class="cl-legende">
                <div>
                    <div class="cl-titre">Ta clairière</div>
                    <div class="cl-sous">${phrase('clairiere', { pousses: pousses, total: total })}</div>
                </div>
                ${eco}
            </div>`;
    }

    /* ======================================================================
       MONTAGE
       ====================================================================== */
    function monter() {
        /* Le compagnon ne construit plus son bloc : #compagnon-dessin et
           #compagnon-bulle sont posés dans le hero de l'onglet Itinéraire
           (index.html). On se contente de les remplir. */
        if (!document.getElementById('compagnon-dessin')) return;

        etat('repos');
        // Salutation selon l'heure — le seul contexte disponible au montage.
        const h = new Date().getHours();
        dit(h >= 18 || h < 5 ? 'accueil_soir' : 'accueil');
    }

    function etat(nouvel) {
        if (ETATS.indexOf(nouvel) === -1) return;
        const cible = document.getElementById('compagnon-dessin');
        if (!cible) return;
        etatCourant = nouvel;
        cible.innerHTML = COMPAGNONS[courant].dessin(nouvel);
    }

    /* La phrase seule, en texte : la bulle d'accueil n'est pas le seul endroit
       où le compagnon parle (voir la carte du carnet). */
    function phrase(cle, vars) {
        const f = COMPAGNONS[courant].phrases[cle];
        return f ? f(vars || {}) : '';
    }

    function dit(cle, vars) {
        const bulle = document.getElementById('compagnon-bulle');
        if (!bulle) return;
        // textContent et non innerHTML : les valeurs viennent de l'app, on ne
        // les réinjecte jamais comme du balisage.
        const texte = phrase(cle, vars);
        if (texte) bulle.textContent = texte;
    }

    window.BabiAplats = { monter: monter, etat: etat, dit: dit, phrase: phrase, rang: rang,
                         dessin: function (e) { return COMPAGNONS[courant].dessin(e || etatCourant); },
                         clairiere: clairiere, nom: function () { return COMPAGNONS[courant].nom; },
                         get etatCourant() { return etatCourant; } };

})();

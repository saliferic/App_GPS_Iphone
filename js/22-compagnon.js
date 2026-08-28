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
     Compagnon.portrait(el, {...}) — le portrait du compagnon en tête du Profil
   ============================================================================ */

(function () {
    'use strict';

    /* --- Les états. Les cinq sont communs à TOUS les compagnons : le code n'a
       qu'un seul jeu d'états à gérer, quel que soit l'animal choisi. --------- */
    const ETATS = ['repos', 'ravi', 'secoue', 'assoupi'];
    /* 'absent' n'est pas dans cette liste : ce n'est pas une expression, c'est
       l'absence du bloc entier, gérée par le CSS. */


    /* ======================================================================
       TITI, LE SINGE
       Fiche de la troupe : « Le curieux, il te fait changer de route ».
       Décor · la canopée.

       Ce qui fait le singe et pas un ourson brun : le MASQUE FACIAL clair,
       en goutte, qui englobe les yeux, les narines et la bouche. Réduit à un
       museau posé en bas du visage, on retombe sur un ourson. Les oreilles
       rondes sur les CÔTÉS — à mi-hauteur, pas sur le crâne comme Bulle — et
       la queue enroulée finissent de le dire.
       ====================================================================== */
    function dessinerTiti(etat) {
        return `<svg class="cp-svg" viewBox="6 42 308 330" aria-hidden="true">${dessinTitiInterieur(etat)}</svg>`;
    }

    function dessinTitiInterieur(etat) {
        const u = '-t' + (++_instance);
        const TRAIT = '#33203A';

        /* Oreilles : de grands disques sur les côtés, à mi-visage. Montées sur le
           crâne, elles donneraient un ourson ; c'est leur HAUTEUR qui fait le singe. */
        const oreille = (cx) =>
            `<circle cx="${cx}" cy="158" r="42" fill="url(#tOreille${u})"/><circle cx="${cx}" cy="159" r="23" fill="url(#tRose${u})"/>`;
        const oreilles = etat === 'secoue'
            ? `<g transform="rotate(10 96 178)">${oreille(50)}</g><g transform="rotate(-10 224 178)">${oreille(270)}</g>`
            : `<g class="cp-earL">${oreille(50)}</g><g class="cp-earR">${oreille(270)}</g>`;

        let yeux, sourcils = '';
        if (etat === 'ravi') {
            yeux = `<path d="M108 150 C115 132 133 132 140 150" fill="none" stroke="${TRAIT}" stroke-width="8" stroke-linecap="round"/>
                    <path d="M180 150 C187 132 205 132 212 150" fill="none" stroke="${TRAIT}" stroke-width="8" stroke-linecap="round"/>`;
        } else if (etat === 'assoupi') {
            yeux = `<path d="M108 142 C115 160 133 160 140 142" fill="none" stroke="${TRAIT}" stroke-width="8" stroke-linecap="round"/>
                    <path d="M180 142 C187 160 205 160 212 142" fill="none" stroke="${TRAIT}" stroke-width="8" stroke-linecap="round"/>`;
        } else if (etat === 'secoue') {
            /* ⚠ Intérieur RELEVÉ, extérieur qui retombe. L'inverse est la colère. */
            sourcils = `<path d="M104 124 C111 114 124 108 140 107"  fill="none" stroke="#6B5340" stroke-width="5" stroke-linecap="round"/>
                        <path d="M216 124 C209 114 196 108 180 107" fill="none" stroke="#6B5340" stroke-width="5" stroke-linecap="round"/>`;
            yeux = `<g class="cp-eyes">
                      <ellipse cx="124" cy="148" rx="21" ry="25" fill="${TRAIT}"/><ellipse cx="124" cy="151" rx="14" ry="17" fill="#4C3550"/>
                      <ellipse cx="118" cy="139" rx="7.5" ry="9" fill="#FFF"/><circle cx="131" cy="160" r="4.2" fill="#FFF"/>
                      <ellipse cx="196" cy="148" rx="21" ry="25" fill="${TRAIT}"/><ellipse cx="196" cy="151" rx="14" ry="17" fill="#4C3550"/>
                      <ellipse cx="190" cy="139" rx="7.5" ry="9" fill="#FFF"/><circle cx="203" cy="160" r="4.2" fill="#FFF"/>
                    </g>`;
        } else {
            yeux = `<g class="cp-eyes">
                      <ellipse cx="124" cy="146" rx="21" ry="24" fill="${TRAIT}"/><ellipse cx="124" cy="149" rx="14" ry="16" fill="#4C3550"/>
                      <ellipse cx="118" cy="138" rx="7.5" ry="9" fill="#FFF"/><circle cx="131" cy="157" r="4" fill="#FFF"/>
                      <ellipse cx="196" cy="146" rx="21" ry="24" fill="${TRAIT}"/><ellipse cx="196" cy="149" rx="14" ry="16" fill="#4C3550"/>
                      <ellipse cx="190" cy="138" rx="7.5" ry="9" fill="#FFF"/><circle cx="203" cy="157" r="4" fill="#FFF"/>
                    </g>`;
        }

        /* Titi est « le curieux » : sa bouche est le seul endroit de la troupe où un
           sourire va jusqu'aux dents. */
        const BOUCHES = {
            repos:   'M133 203 C147 218 173 218 187 203',
            ravi:    'M126 198 C144 228 176 228 194 198',
            secoue:  'M136 216 C148 202 172 202 184 216',
            assoupi: 'M146 206 C154 214 166 214 174 206'
        };

        let signe = '';
        if (etat === 'assoupi') {
            signe = `<text class="cp-zz" x="256" y="96" font-size="44" font-weight="800" fill="#E8C9A8">z</text>
                     <text class="cp-zz cp-zz2" x="274" y="120" font-size="32" font-weight="800" fill="#E8C9A8">z</text>`;
        } else if (etat === 'secoue') {
            signe = `<path class="cp-larme" d="M108 172 C108 172 99.5 186.5 99.5 193.5 A8.5 8.5 0 0 0 116.5 193.5 C116.5 186.5 108 172 108 172 Z" fill="#7FD8E8"/>`;
        } else if (etat === 'ravi') {
            const et = (x, y, r) => `<path d="M${x} ${y - r} Q${x + r * .22} ${y - r * .22} ${x + r} ${y} Q${x + r * .22} ${y + r * .22} ${x} ${y + r} Q${x - r * .22} ${y + r * .22} ${x - r} ${y} Q${x - r * .22} ${y - r * .22} ${x} ${y - r} Z" fill="#FFE9A8" opacity="0.9"/>`;
            signe = et(74, 74, 12) + et(250, 66, 10);
        }

        return `
            <defs>
                <radialGradient id="tTete${u}" cx="36%" cy="26%" r="82%">
                    <stop offset="0" stop-color="#A98262"/><stop offset="1" stop-color="#775740"/></radialGradient>
                <radialGradient id="tCorps${u}" cx="40%" cy="22%" r="84%">
                    <stop offset="0" stop-color="#9E7857"/><stop offset="1" stop-color="#6E503B"/></radialGradient>
                <radialGradient id="tPatte${u}" cx="38%" cy="26%" r="80%">
                    <stop offset="0" stop-color="#94704F"/><stop offset="1" stop-color="#684B37"/></radialGradient>
                <radialGradient id="tOreille${u}" cx="40%" cy="32%" r="78%">
                    <stop offset="0" stop-color="#9E7857"/><stop offset="1" stop-color="#725338"/></radialGradient>
                <radialGradient id="tRose${u}" cx="44%" cy="36%" r="74%">
                    <stop offset="0" stop-color="#E0B893"/><stop offset="1" stop-color="#C39A74"/></radialGradient>
                <radialGradient id="tMasque${u}" cx="42%" cy="24%" r="80%">
                    <stop offset="0" stop-color="#F4DCC0"/><stop offset="1" stop-color="#DDBB96"/></radialGradient>
                <radialGradient id="tVentre${u}" cx="50%" cy="34%" r="70%">
                    <stop offset="0" stop-color="#E8C9A8" stop-opacity="0.95"/>
                    <stop offset="1" stop-color="#E8C9A8" stop-opacity="0.15"/></radialGradient>
                <radialGradient id="tReflet${u}">
                    <stop offset="0" stop-color="#FFF" stop-opacity="0.16"/>
                    <stop offset="0.55" stop-color="#FFF" stop-opacity="0.06"/>
                    <stop offset="1" stop-color="#FFF" stop-opacity="0"/></radialGradient>
                <filter id="tFlou${u}" x="-40%" y="-60%" width="180%" height="220%">
                    <feGaussianBlur stdDeviation="9"/></filter>
            </defs>

            <ellipse cx="160" cy="356" rx="76" ry="12" fill="#0d0a22" opacity="0.5"/>

            <g class="cp-body">
              <!-- LA QUEUE — tracée avant le corps pour en sortir. Deux traits de
                   largeur décroissante : une queue d'épaisseur constante se lit comme
                   un câble, pas comme une queue. -->
              <g class="cp-tail">
                <path d="M212 304 C258 302 286 268 274 236" fill="none" stroke="#7E6046" stroke-width="13" stroke-linecap="round"/>
                <path d="M274 236 C266 214 240 216 242 238 C243 250 256 250 256 240" fill="none" stroke="#7E6046" stroke-width="9" stroke-linecap="round"/>
              </g>

              <ellipse cx="160" cy="296" rx="62" ry="54" fill="url(#tCorps${u})"/>
              <ellipse cx="160" cy="308" rx="40" ry="36" fill="url(#tVentre${u})"/>
              <ellipse cx="98"  cy="288" rx="17" ry="22" transform="rotate(-14 98 288)" fill="url(#tPatte${u})"/>
              <ellipse cx="222" cy="288" rx="17" ry="22" transform="rotate(14 222 288)" fill="url(#tPatte${u})"/>
              <ellipse cx="126" cy="336" rx="28" ry="22" fill="url(#tPatte${u})"/>
              <ellipse cx="194" cy="336" rx="28" ry="22" fill="url(#tPatte${u})"/>
              <ellipse cx="112" cy="342" rx="4.6" ry="6" fill="#F4DCC0"/>
              <ellipse cx="126" cy="345" rx="4.6" ry="6" fill="#F4DCC0"/>
              <ellipse cx="140" cy="342" rx="4.6" ry="6" fill="#F4DCC0"/>
              <ellipse cx="180" cy="342" rx="4.6" ry="6" fill="#F4DCC0"/>
              <ellipse cx="194" cy="345" rx="4.6" ry="6" fill="#F4DCC0"/>
              <ellipse cx="208" cy="342" rx="4.6" ry="6" fill="#F4DCC0"/>

              <ellipse cx="160" cy="256" rx="70" ry="18" fill="#3A2A20" opacity="0.42" filter="url(#tFlou${u})"/>

              ${oreilles}

              <circle cx="160" cy="150" r="90" fill="url(#tTete${u})"/>
              <ellipse cx="126" cy="102" rx="44" ry="28" fill="url(#tReflet${u})"/>

              <!-- LE MASQUE — la pièce qui fait l'espèce. Il part du HAUT du crâne et
                   descend jusqu'au menton : réduit à un museau posé en bas, on
                   retombe sur un ourson. -->
              <path d="M160 77 C113 77 93 123 100 163 C107 210 133 240 160 240 C187 240 213 210 220 163 C227 123 207 77 160 77 Z"
                    fill="url(#tMasque${u})"/>

              ${sourcils}
              ${yeux}
              <ellipse cx="148" cy="183" rx="6.3" ry="5" fill="${TRAIT}" opacity="0.85"/>
              <ellipse cx="172" cy="183" rx="6.3" ry="5" fill="${TRAIT}" opacity="0.85"/>
              <path d="${BOUCHES[etat] || BOUCHES.repos}" fill="none" stroke="${TRAIT}" stroke-width="6" stroke-linecap="round"/>
            </g>
            ${signe}`;
    }

    /* Les quatre visages se construisent toujours pareil, quelle que soit l'espèce :
       ravi = deux arcs vers le haut, assoupi = deux arcs vers le bas, triste = yeux
       ronds brillants + sourcils intérieur-relevé + larme, repos = yeux ronds.
       Factorisé ici pour ne pas réécrire quatre fois la même bascule par animal. */
    function visage(etat, o) {
        const T = o.trait, cg = o.cxG, cd = o.cxD, cy = o.cy, rx = o.rx, ry = o.ry, w = o.arc || 8;
        const arc = (cx, haut) => `<path d="M${cx - rx} ${cy + (haut ? 4 : -4)} C${cx - rx + 6} ${cy + (haut ? -18 : 18)} ${cx + rx - 6} ${cy + (haut ? -18 : 18)} ${cx + rx} ${cy + (haut ? 4 : -4)}" fill="none" stroke="${T}" stroke-width="${w}" stroke-linecap="round"/>`;
        const rond = (cx, dy) => `
            <ellipse cx="${cx}" cy="${cy + dy}" rx="${rx}" ry="${ry}" fill="${T}"/>
            <ellipse cx="${cx}" cy="${cy + dy + 3}" rx="${rx * 0.66}" ry="${ry * 0.7}" fill="${o.iris || '#4C3550'}"/>
            <ellipse cx="${cx - rx * 0.3}" cy="${cy + dy - ry * 0.36}" rx="${rx * 0.36}" ry="${ry * 0.38}" fill="#FFF"/>
            <circle cx="${cx + rx * 0.36}" cy="${cy + dy + ry * 0.46}" r="${rx * 0.2}" fill="#FFF"/>`;
        if (etat === 'ravi')    return { yeux: arc(cg, true) + arc(cd, true), sourcils: '' };
        if (etat === 'assoupi') return { yeux: arc(cg, false) + arc(cd, false), sourcils: '' };
        if (etat === 'secoue') {
            /* ⚠ Intérieur RELEVÉ, extérieur qui retombe : le pli de la tristesse.
               L'inverse est le masque de la colère. Ne jamais réinverser. */
            const b = o.sourcil || '#6B5340', hy = cy - ry - 14;
            return {
                sourcils: `<path d="M${cg - rx - 4} ${hy + 14} C${cg - rx + 4} ${hy + 4} ${cg + 4} ${hy - 2} ${cg + rx + 2} ${hy - 3}" fill="none" stroke="${b}" stroke-width="5" stroke-linecap="round"/>
                           <path d="M${cd + rx + 4} ${hy + 14} C${cd + rx - 4} ${hy + 4} ${cd - 4} ${hy - 2} ${cd - rx - 2} ${hy - 3}" fill="none" stroke="${b}" stroke-width="5" stroke-linecap="round"/>`,
                yeux: `<g class="cp-eyes">${rond(cg, 2)}${rond(cd, 2)}</g>`
            };
        }
        return { sourcils: '', yeux: `<g class="cp-eyes">${rond(cg, 0)}${rond(cd, 0)}</g>` };
    }

    function larme(x, y) {
        return `<path class="cp-larme" d="M${x} ${y} C${x} ${y} ${x - 8.5} ${y + 14.5} ${x - 8.5} ${y + 21.5} A8.5 8.5 0 0 0 ${x + 8.5} ${y + 21.5} C${x + 8.5} ${y + 14.5} ${x} ${y} ${x} ${y} Z" fill="#7FD8E8"/>`;
    }
    function zzz(x, y, c) {
        return `<text class="cp-zz" x="${x}" y="${y}" font-size="44" font-weight="800" fill="${c}">z</text>
                <text class="cp-zz cp-zz2" x="${x + 18}" y="${y + 24}" font-size="32" font-weight="800" fill="${c}">z</text>`;
    }
    function etoiles(pts) {
        return pts.map(([x, y, r]) => `<path d="M${x} ${y - r} Q${x + r * .22} ${y - r * .22} ${x + r} ${y} Q${x + r * .22} ${y + r * .22} ${x} ${y + r} Q${x - r * .22} ${y + r * .22} ${x - r} ${y} Q${x - r * .22} ${y - r * .22} ${x} ${y - r} Z" fill="#FFE9A8" opacity="0.9"/>`).join('');
    }

    /* ══════════════════════════════════════════════════════ ZOLA, LE LION
       « Le calme du fort, rien à prouver ». Décor · le rocher, la nuit.
       Ce qui fait le lion : la CRINIÈRE, une couronne de disques qui déborde
       largement de la tête. Dix et non huit comme sur la vignette — à notre échelle,
       huit laissent des trous entre les disques et la couronne se déchire. */
    function dessinZolaInterieur(etat) {
        const u = '-z' + (++_instance);
        const T = '#33203A';
        const v = visage(etat, { trait: T, cxG: 130, cxD: 190, cy: 132, rx: 19, ry: 22, iris: '#4C3550', sourcil: '#8A5A3A' });
        const criniere = Array.from({ length: 10 }, (_, i) => {
            const a = (Math.PI * 2 * i) / 10 - Math.PI / 2;
            return `<circle cx="${(160 + 102 * Math.cos(a)).toFixed(1)}" cy="${(150 + 102 * Math.sin(a)).toFixed(1)}" r="38" fill="url(#zCrin${u})"/>`;
        }).join('');
        const BOUCHE = { repos: 8, ravi: 15, secoue: -7, assoupi: 4 }[etat] || 8;
        let signe = '';
        if (etat === 'assoupi') signe = zzz(258, 92, '#F2C489');
        else if (etat === 'secoue') signe = larme(112, 158);
        else if (etat === 'ravi') signe = etoiles([[62, 66, 13], [258, 58, 10]]);

        return `
            <defs>
                <radialGradient id="zCrin${u}" cx="38%" cy="28%" r="80%"><stop offset="0" stop-color="#D98C3A"/><stop offset="1" stop-color="#A9601F"/></radialGradient>
                <radialGradient id="zTete${u}" cx="36%" cy="26%" r="82%"><stop offset="0" stop-color="#C87E31"/><stop offset="1" stop-color="#96591D"/></radialGradient>
                <radialGradient id="zMasque${u}" cx="42%" cy="24%" r="80%"><stop offset="0" stop-color="#F8D3A2"/><stop offset="1" stop-color="#E2B57A"/></radialGradient>
                <radialGradient id="zCorps${u}" cx="40%" cy="22%" r="84%"><stop offset="0" stop-color="#C07A31"/><stop offset="1" stop-color="#8E5420"/></radialGradient>
                <radialGradient id="zReflet${u}"><stop offset="0" stop-color="#FFF" stop-opacity="0.16"/><stop offset="0.55" stop-color="#FFF" stop-opacity="0.06"/><stop offset="1" stop-color="#FFF" stop-opacity="0"/></radialGradient>
                <filter id="zFlou${u}" x="-40%" y="-60%" width="180%" height="220%"><feGaussianBlur stdDeviation="9"/></filter>
            </defs>

        <!-- Mise à l'échelle globale : sans elle, le sommet de la crinière
             sort du viewBox et se fait couper net. Voir le commentaire du module. -->
        <g transform="translate(12.8,32.8) scale(0.92)">
            <ellipse cx="160" cy="356" rx="76" ry="12" fill="#0d0a22" opacity="0.5"/>
            <g class="cp-body">
              <g class="cp-tail">
                <path d="M214 306 C252 302 274 278 268 254" fill="none" stroke="#9A5C22" stroke-width="10" stroke-linecap="round"/>
                <ellipse cx="266" cy="246" rx="11" ry="14" fill="#7E4718"/>
              </g>
              <ellipse cx="160" cy="300" rx="60" ry="52" fill="url(#zCorps${u})"/>
              <ellipse cx="100" cy="292" rx="17" ry="22" transform="rotate(-14 100 292)" fill="url(#zCorps${u})"/>
              <ellipse cx="220" cy="292" rx="17" ry="22" transform="rotate(14 220 292)" fill="url(#zCorps${u})"/>
              <ellipse cx="126" cy="338" rx="28" ry="22" fill="url(#zCorps${u})"/>
              <ellipse cx="194" cy="338" rx="28" ry="22" fill="url(#zCorps${u})"/>
              <ellipse cx="112" cy="344" rx="4.6" ry="6" fill="#FFF2DE"/><ellipse cx="126" cy="347" rx="4.6" ry="6" fill="#FFF2DE"/><ellipse cx="140" cy="344" rx="4.6" ry="6" fill="#FFF2DE"/>
              <ellipse cx="180" cy="344" rx="4.6" ry="6" fill="#FFF2DE"/><ellipse cx="194" cy="347" rx="4.6" ry="6" fill="#FFF2DE"/><ellipse cx="208" cy="344" rx="4.6" ry="6" fill="#FFF2DE"/>
              <ellipse cx="160" cy="258" rx="68" ry="18" fill="#3A2A16" opacity="0.42" filter="url(#zFlou${u})"/>
              ${criniere}
              <circle cx="100" cy="84" r="24" fill="url(#zMasque${u})"/><circle cx="220" cy="84" r="24" fill="url(#zMasque${u})"/>
              <circle cx="160" cy="150" r="84" fill="url(#zTete${u})"/>
              <circle cx="160" cy="144" r="75" fill="url(#zMasque${u})"/>
              <ellipse cx="130" cy="100" rx="38" ry="24" fill="url(#zReflet${u})"/>
              ${v.sourcils}${v.yeux}
              <ellipse cx="136" cy="186" rx="30" ry="24" fill="#FFF2DE"/><ellipse cx="184" cy="186" rx="30" ry="24" fill="#FFF2DE"/>
              <path d="M149.5 168 L170.5 168 L160 180 Z" fill="#8A5A3A"/>
              <path d="M160 180 C160 ${188 + BOUCHE} 145 ${190 + BOUCHE} 139 ${184 + BOUCHE} M160 180 C160 ${188 + BOUCHE} 175 ${190 + BOUCHE} 181 ${184 + BOUCHE}"
                    stroke="#8A5A3A" stroke-width="5" fill="none" stroke-linecap="round"/>
            </g>
            </g>
        ${signe}`;
    }

    /* ══════════════════════════════════════════════════════ KIRI, LA GIRAFE
       « Elle voit loin, elle anticipe ». Décor · l'arbre qui grandit.
       Ce qui fait la girafe : le COU. Sa vignette n'est qu'un portrait, mais un
       corps entier sans cou long donnerait un poney tacheté. Le cou occupe donc
       presque autant de hauteur que la tête, et les taches le parcourent. */
    function dessinKiriInterieur(etat) {
        const u = '-k' + (++_instance);
        const T = '#33203A';
        const v = visage(etat, { trait: T, cxG: 134, cxD: 186, cy: 120, rx: 15, ry: 17, arc: 7, iris: '#4C3550', sourcil: '#B08247' });
        const tache = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#C08A4E" opacity="0.85"/>`;
        const BOUCHE = { repos: 'M150 176 C155 182 165 182 170 176', ravi: 'M146 172 C154 186 166 186 174 172',
                         secoue: 'M150 182 C155 176 165 176 170 182', assoupi: 'M153 178 C157 182 163 182 167 178' }[etat];
        let signe = '';
        if (etat === 'assoupi') signe = zzz(252, 78, '#F5D9A8');
        else if (etat === 'secoue') signe = larme(118, 142);
        else if (etat === 'ravi') signe = etoiles([[74, 62, 12], [250, 54, 10]]);

        return `
            <defs>
                <radialGradient id="kCorps${u}" cx="40%" cy="24%" r="84%"><stop offset="0" stop-color="#F0C57C"/><stop offset="1" stop-color="#C9974E"/></radialGradient>
                <radialGradient id="kTete${u}" cx="40%" cy="20%" r="82%"><stop offset="0" stop-color="#F2CB86"/><stop offset="1" stop-color="#D6A257"/></radialGradient>
                <radialGradient id="kMufle${u}" cx="44%" cy="30%" r="76%"><stop offset="0" stop-color="#FBE6BE"/><stop offset="1" stop-color="#EDCE9A"/></radialGradient>
                <radialGradient id="kReflet${u}"><stop offset="0" stop-color="#FFF" stop-opacity="0.16"/><stop offset="0.55" stop-color="#FFF" stop-opacity="0.06"/><stop offset="1" stop-color="#FFF" stop-opacity="0"/></radialGradient>
                <filter id="kFlou${u}" x="-40%" y="-60%" width="180%" height="220%"><feGaussianBlur stdDeviation="9"/></filter>
            </defs>

        <!-- Mise à l'échelle globale : sans elle, le haut du dessin sort du
             viewBox et se fait couper net. Voir le commentaire du module. -->
        <g transform="translate(4.5,23) scale(0.948)">
            <ellipse cx="160" cy="356" rx="72" ry="12" fill="#0d0a22" opacity="0.5"/>
            <g class="cp-body">
              <g class="cp-tail">
                <path d="M210 312 C242 310 258 292 254 274" fill="none" stroke="#C9974E" stroke-width="8" stroke-linecap="round"/>
                <ellipse cx="253" cy="266" rx="8" ry="11" fill="#8A6533"/>
              </g>
              <ellipse cx="160" cy="308" rx="58" ry="46" fill="url(#kCorps${u})"/>
              <ellipse cx="106" cy="304" rx="15" ry="20" transform="rotate(-12 106 304)" fill="url(#kCorps${u})"/>
              <ellipse cx="214" cy="304" rx="15" ry="20" transform="rotate(12 214 304)" fill="url(#kCorps${u})"/>
              <ellipse cx="130" cy="342" rx="25" ry="19" fill="url(#kCorps${u})"/>
              <ellipse cx="190" cy="342" rx="25" ry="19" fill="url(#kCorps${u})"/>
              ${tache(132, 296, 12)}${tache(186, 302, 10)}${tache(158, 322, 11)}
              <!-- LE COU. Il part du corps et monte jusqu'au menton : c'est lui qui
                   fait l'espèce, plus encore que les ossicônes. -->
              <path d="M138 176 C136 216 134 254 140 286 L182 286 C186 254 184 216 182 176 Z" fill="url(#kCorps${u})"/>
              ${tache(148, 206, 10)}${tache(174, 228, 9)}${tache(146, 252, 10)}${tache(174, 272, 8)}
              <ellipse cx="160" cy="262" rx="58" ry="16" fill="#3A2E16" opacity="0.32" filter="url(#kFlou${u})"/>
              <path d="M138 64 L133 33" stroke="#B9834A" stroke-width="9" stroke-linecap="round"/><circle cx="133" cy="30" r="10" fill="#5E4028"/>
              <path d="M182 64 L187 33" stroke="#B9834A" stroke-width="9" stroke-linecap="round"/><circle cx="187" cy="30" r="10" fill="#5E4028"/>
              <ellipse cx="96" cy="76" rx="26" ry="13" fill="#D9A45C" transform="rotate(-20 96 76)"/>
              <ellipse cx="224" cy="76" rx="26" ry="13" fill="#D9A45C" transform="rotate(20 224 76)"/>
              <path d="M160 54 C134 54 125 85 129 116 C134 151 145 190 160 190 C175 190 186 151 191 116 C195 85 186 54 160 54 Z" fill="url(#kTete${u})"/>
              <ellipse cx="142" cy="80" rx="22" ry="16" fill="url(#kReflet${u})"/>
              ${tache(142, 72, 10)}${tache(180, 70, 9)}${tache(138, 129, 9)}${tache(184, 127, 10)}
              ${v.sourcils}${v.yeux}
              <ellipse cx="160" cy="164" rx="26" ry="20" fill="url(#kMufle${u})"/>
              <ellipse cx="149" cy="157" rx="4.4" ry="3.6" fill="${T}" opacity="0.85"/><ellipse cx="171" cy="157" rx="4.4" ry="3.6" fill="${T}" opacity="0.85"/>
              <path d="${BOUCHE}" fill="none" stroke="${T}" stroke-width="4.5" stroke-linecap="round" opacity="0.9"/>
            </g>
            </g>
        ${signe}`;
    }

    /* ══════════════════════════════════════════════════════ RAYA, LE TIGRE
       « La précision, le geste juste ». Décor · la jungle de nuit.
       Ce qui fait le tigre : les RAYURES, et leur placement exact — trois sur le
       front, deux paires sur les joues. Réparties au hasard, on obtient un chat
       roux zébré ; c'est la symétrie qui fait le tigre. */
    function dessinRayaInterieur(etat) {
        const u = '-r' + (++_instance);
        const T = '#33203A';
        const v = visage(etat, { trait: T, cxG: 127, cxD: 193, cy: 138, rx: 20, ry: 23, iris: '#4C3550', sourcil: '#8A4A22' });
        const BOUCHE = { repos: 6, ravi: 13, secoue: -8, assoupi: 3 }[etat] || 6;
        let signe = '';
        if (etat === 'assoupi') signe = zzz(258, 84, '#FFC59A');
        else if (etat === 'secoue') signe = larme(108, 166);
        else if (etat === 'ravi') signe = etoiles([[60, 74, 13], [260, 66, 10]]);

        return `
            <defs>
                <radialGradient id="rTete${u}" cx="36%" cy="26%" r="82%"><stop offset="0" stop-color="#FFA463"/><stop offset="1" stop-color="#DE7331"/></radialGradient>
                <radialGradient id="rCorps${u}" cx="40%" cy="22%" r="84%"><stop offset="0" stop-color="#F5924D"/><stop offset="1" stop-color="#CF6829"/></radialGradient>
                <radialGradient id="rOreille${u}" cx="40%" cy="32%" r="78%"><stop offset="0" stop-color="#F5924D"/><stop offset="1" stop-color="#D46E2C"/></radialGradient>
                <radialGradient id="rReflet${u}"><stop offset="0" stop-color="#FFF" stop-opacity="0.17"/><stop offset="0.55" stop-color="#FFF" stop-opacity="0.06"/><stop offset="1" stop-color="#FFF" stop-opacity="0"/></radialGradient>
                <filter id="rFlou${u}" x="-40%" y="-60%" width="180%" height="220%"><feGaussianBlur stdDeviation="9"/></filter>
            </defs>

        <!-- Mise à l'échelle globale : sans elle, le haut du dessin sort du
             viewBox et se fait couper net. Voir le commentaire du module. -->
        <g transform="translate(3.8,12.7) scale(0.976)">
            <ellipse cx="160" cy="356" rx="76" ry="12" fill="#0d0a22" opacity="0.5"/>
            <g class="cp-body">
              <g class="cp-tail">
                <path d="M216 306 C256 302 278 274 270 248" fill="none" stroke="#D46E2C" stroke-width="11" stroke-linecap="round"/>
                <path d="M238 292 L246 300 M256 274 L265 280 M266 256 L275 260" stroke="#3A2418" stroke-width="4" stroke-linecap="round"/>
              </g>
              <ellipse cx="160" cy="300" rx="62" ry="52" fill="url(#rCorps${u})"/>
              <ellipse cx="160" cy="312" rx="38" ry="34" fill="#FFF2DE" opacity="0.5"/>
              <path d="M110 282 L124 288 M108 300 L122 302 M210 282 L196 288 M212 300 L198 302" stroke="#3A2418" stroke-width="4.5" stroke-linecap="round" opacity="0.85"/>
              <ellipse cx="100" cy="292" rx="17" ry="22" transform="rotate(-14 100 292)" fill="url(#rCorps${u})"/>
              <ellipse cx="220" cy="292" rx="17" ry="22" transform="rotate(14 220 292)" fill="url(#rCorps${u})"/>
              <ellipse cx="126" cy="338" rx="28" ry="22" fill="url(#rCorps${u})"/>
              <ellipse cx="194" cy="338" rx="28" ry="22" fill="url(#rCorps${u})"/>
              <ellipse cx="112" cy="344" rx="4.6" ry="6" fill="#FFF2DE"/><ellipse cx="126" cy="347" rx="4.6" ry="6" fill="#FFF2DE"/><ellipse cx="140" cy="344" rx="4.6" ry="6" fill="#FFF2DE"/>
              <ellipse cx="180" cy="344" rx="4.6" ry="6" fill="#FFF2DE"/><ellipse cx="194" cy="347" rx="4.6" ry="6" fill="#FFF2DE"/><ellipse cx="208" cy="344" rx="4.6" ry="6" fill="#FFF2DE"/>
              <ellipse cx="160" cy="258" rx="70" ry="18" fill="#4A2412" opacity="0.42" filter="url(#rFlou${u})"/>
              <circle cx="82" cy="66" r="36" fill="url(#rOreille${u})"/><circle cx="82" cy="69" r="18" fill="#FFF2DE"/>
              <circle cx="238" cy="66" r="36" fill="url(#rOreille${u})"/><circle cx="238" cy="69" r="18" fill="#FFF2DE"/>
              <circle cx="160" cy="150" r="87" fill="url(#rTete${u})"/>
              <ellipse cx="128" cy="100" rx="40" ry="26" fill="url(#rReflet${u})"/>
              <g stroke="#3A2418" stroke-width="9" stroke-linecap="round" opacity="0.9">
                <path d="M118 78 L130 111 M160 66 L160 99 M202 78 L190 111"/>
                <path d="M78 140 L109 146 M78 172 L109 172 M242 140 L211 146 M242 172 L211 172"/>
              </g>
              ${v.sourcils}${v.yeux}
              <ellipse cx="130" cy="192" rx="33" ry="27" fill="#FFF2DE"/><ellipse cx="190" cy="192" rx="33" ry="27" fill="#FFF2DE"/>
              <g stroke="#FFF2DE" stroke-width="3.4" stroke-linecap="round" opacity="0.85">
                <path d="M100 180 L46 168 M100 196 L43 200 M220 180 L274 168 M220 196 L277 200"/>
              </g>
              <path d="M149.5 171 L170.5 171 L160 183 Z" fill="#E08CA4"/>
              <path d="M160 183 C160 ${191 + BOUCHE} 146 ${193 + BOUCHE} 140 ${187 + BOUCHE} M160 183 C160 ${191 + BOUCHE} 174 ${193 + BOUCHE} 180 ${187 + BOUCHE}"
                    stroke="#3A2418" stroke-width="5" fill="none" stroke-linecap="round"/>
            </g>
            </g>
        ${signe}`;
    }

    /* ══════════════════════════════════════════════════════ SAM, LA RENARDE
       « La maligne, elle connaît un raccourci ». Décor · la lisière.

       TROIS MARQUEURS FONT LE RENARD, et ils sont tous les trois nécessaires —
       il en manque un et l'on retombe sur un chat roux, ce que Nima sera :
         1. les OREILLES, grandes, triangulaires, à POINTE SOMBRE. Rondes, c'est
            un chat ; sans la pointe noire, un chien roux.
         2. le MUSEAU EFFILÉ. La tête n'est donc PAS un cercle comme celles de
            Zola et Raya : c'est un triangle adouci qui se resserre vers le bas.
            C'est la seule tête de la troupe construite ainsi.
         3. la QUEUE TOUFFUE À BOUT BLANC, plus épaisse que le corps est large.
            Les autres queues du module sont des traits de 8 à 11 px ; celle-ci
            en fait 34, et son bout clair est le détail que tout le monde
            reconnaît de loin.
       Les bas SOMBRES aux quatre pattes achèvent la lecture : ce sont eux, avec
       le poitrail crème, qui donnent le contraste du renard roux.

       ⚠ Elle est une FEMELLE (`genre: 'f'`) : voir le champ dans COMPAGNONS et
       son usage dans la fenêtre de fin de trajet (js/12) — « Sam est secouéE ». */
    function dessinSamInterieur(etat) {
        const u = '-s' + (++_instance);
        const T = '#33203A';
        const v = visage(etat, { trait: T, cxG: 129, cxD: 191, cy: 142, rx: 19, ry: 22, iris: '#4C3550', sourcil: '#8A3E1E' });
        const BOUCHE = { repos: 6, ravi: 12, secoue: -8, assoupi: 3 }[etat] || 6;
        let signe = '';
        if (etat === 'assoupi') signe = zzz(262, 88, '#FFC2A0');
        else if (etat === 'secoue') signe = larme(106, 170);
        else if (etat === 'ravi') signe = etoiles([[58, 76, 13], [262, 66, 10]]);

        /* Une oreille, écrite une fois et retournée pour l'autre côté : trois
           triangles empilés (pavillon, intérieur clair, pointe sombre) qui
           doivent rester alignés. Les recopier à la main pour le côté droit,
           c'était se condamner à des oreilles dépareillées à la première
           retouche. `s` vaut 1 à gauche, -1 à droite. */
        const oreille = (s) => {
            const x = (dx) => 160 + s * dx;
            return `
                <path d="M${x(62)} 116 L${x(78)} 26 L${x(4)} 84 Z" fill="url(#sOreille${u})"
                      stroke="#B94A22" stroke-width="3" stroke-linejoin="round"/>
                <path d="M${x(56)} 106 L${x(68)} 44 L${x(16)} 86 Z" fill="#F6BFA0" opacity="0.9"
                      stroke-linejoin="round"/>
                <path d="M${x(78)} 26 L${x(66)} 62 L${x(46)} 48 Z" fill="#3A2418" stroke-linejoin="round"/>`;
        };

        return `
            <defs>
                <radialGradient id="sTete${u}" cx="36%" cy="24%" r="82%"><stop offset="0" stop-color="#F5793F"/><stop offset="1" stop-color="#D2521F"/></radialGradient>
                <radialGradient id="sCorps${u}" cx="40%" cy="22%" r="84%"><stop offset="0" stop-color="#EC6E37"/><stop offset="1" stop-color="#C24A1C"/></radialGradient>
                <radialGradient id="sOreille${u}" cx="40%" cy="32%" r="78%"><stop offset="0" stop-color="#E96C36"/><stop offset="1" stop-color="#C0491C"/></radialGradient>
                <radialGradient id="sReflet${u}"><stop offset="0" stop-color="#FFF" stop-opacity="0.17"/><stop offset="0.55" stop-color="#FFF" stop-opacity="0.06"/><stop offset="1" stop-color="#FFF" stop-opacity="0"/></radialGradient>
                <filter id="sFlou${u}" x="-40%" y="-60%" width="180%" height="220%"><feGaussianBlur stdDeviation="9"/></filter>
            </defs>

        <!-- Mise à l'échelle globale : sans elle, les pointes d'oreilles sortent
             du viewBox et se font couper net. Voir le commentaire du module. -->
        <g transform="translate(4.2,14.5) scale(0.973)">
            <ellipse cx="160" cy="356" rx="76" ry="12" fill="#0d0a22" opacity="0.5"/>
            <g class="cp-body">
              <!-- LA QUEUE, dessinée AVANT le corps : elle passe derrière lui, sinon
                   sa base lui monte sur la hanche et l'animal paraît coupé en deux. -->
              <g class="cp-tail">
                <!-- ⚠ LA QUEUE EST UNE MASSE, PAS UN TRAIT. Première version : un
                     trait de 34 avec une pastille blanche au bout — ça faisait une
                     sucette, le bout clair se lisait comme une boule POSÉE là. Il
                     fallait deux choses : une silhouette qui S'ÉPAISSIT en montant
                     (une queue de renard est plus large au milieu qu'à sa base) et
                     un bout blanc taillé dans la MÊME forme, pas ajouté par-dessus.
                     D'où un tracé plein plutôt qu'une ligne épaissie.
                     ⚠ Pas d'accent grave dans ce commentaire : il est DANS un
                     littéral de gabarit, une paire de backticks le refermerait. -->
                <path d="M198 330 C244 336 286 312 292 268 C296 236 282 210 262 202
                         C280 224 284 252 272 274 C258 300 226 314 194 310 Z"
                      fill="#B8471B"/>
                <path d="M204 322 C242 326 276 306 281 270 C285 244 274 222 258 214
                         C272 234 275 256 265 274 C252 296 226 306 200 304 Z"
                      fill="#D55524"/>
                <!-- Le bout clair : la POINTE de la même masse, découpée dans son axe.
                     ⚠ LE DERNIER TIERS, pas la moitié : étendu jusqu'en bas de la
                     courbe, il mangeait tout le flanc de la queue et le dessin
                     virait à la flamme. Un renard porte un gant, pas une torche. -->
                <path d="M261 201 C282 209 296 235 292 266 C284 262 276 253 272 239
                         C269 224 268 211 261 201 Z"
                      fill="#FFF2DE"/>
              </g>
              <ellipse cx="160" cy="300" rx="62" ry="52" fill="url(#sCorps${u})"/>
              <!-- Le poitrail crème : c'est le contraste, pas la teinte du roux,
                   qui fait lire « renard » sur une vignette de 38 px. -->
              <ellipse cx="160" cy="314" rx="36" ry="33" fill="#FFF2DE" opacity="0.92"/>
              <ellipse cx="100" cy="292" rx="17" ry="22" transform="rotate(-14 100 292)" fill="url(#sCorps${u})"/>
              <ellipse cx="220" cy="292" rx="17" ry="22" transform="rotate(14 220 292)" fill="url(#sCorps${u})"/>
              <!-- Les bas sombres. Ce sont des PATTES, pas des chaussettes posées
                   dessus : la teinte remonte sur la cuisse, elle ne s'arrête pas
                   au bord de l'ellipse. -->
              <ellipse cx="100" cy="300" rx="15" ry="14" fill="#3A2418" opacity="0.9"/>
              <ellipse cx="220" cy="300" rx="15" ry="14" fill="#3A2418" opacity="0.9"/>
              <ellipse cx="126" cy="338" rx="28" ry="22" fill="#3A2418"/>
              <ellipse cx="194" cy="338" rx="28" ry="22" fill="#3A2418"/>
              <ellipse cx="112" cy="344" rx="4.6" ry="6" fill="#FFF2DE"/><ellipse cx="126" cy="347" rx="4.6" ry="6" fill="#FFF2DE"/><ellipse cx="140" cy="344" rx="4.6" ry="6" fill="#FFF2DE"/>
              <ellipse cx="180" cy="344" rx="4.6" ry="6" fill="#FFF2DE"/><ellipse cx="194" cy="347" rx="4.6" ry="6" fill="#FFF2DE"/><ellipse cx="208" cy="344" rx="4.6" ry="6" fill="#FFF2DE"/>
              <ellipse cx="160" cy="258" rx="70" ry="18" fill="#4A2412" opacity="0.42" filter="url(#sFlou${u})"/>
              ${oreille(1)}${oreille(-1)}
              <!-- LA TÊTE EN TRIANGLE ADOUCI, et non un cercle : large aux tempes,
                   elle se resserre vers le museau. C'est le marqueur n° 2. -->
              <path d="M160 62 C214 62 246 104 246 152 C246 200 208 232 160 246
                       C112 232 74 200 74 152 C74 104 106 62 160 62 Z" fill="url(#sTete${u})"/>
              <ellipse cx="126" cy="104" rx="40" ry="26" fill="url(#sReflet${u})"/>
              <!-- Les joues claires débordent la mâchoire : c'est la fourrure du
                   collier, elle ne doit pas être contenue dans la tête. -->
              <ellipse cx="104" cy="184" rx="30" ry="26" fill="#FFF2DE"/><ellipse cx="216" cy="184" rx="30" ry="26" fill="#FFF2DE"/>
              ${v.sourcils}${v.yeux}
              <!-- Le museau, en goutte renversée : il PART d'entre les yeux et
                   descend en s'affinant. Posé plus bas, on obtient une truffe
                   collée sur un menton, pas un museau. -->
              <path d="M160 166 C190 166 204 188 198 208 C193 226 178 238 160 242
                       C142 238 127 226 122 208 C116 188 130 166 160 166 Z" fill="#FFF7EA"/>
              <path d="M147 198 L173 198 L160 213 Z" fill="#2A1A24"/>
              <path d="M160 213 C160 ${221 + BOUCHE} 147 ${223 + BOUCHE} 141 ${217 + BOUCHE} M160 213 C160 ${221 + BOUCHE} 173 ${223 + BOUCHE} 179 ${217 + BOUCHE}"
                    stroke="#3A2418" stroke-width="5" fill="none" stroke-linecap="round"/>
              <g stroke="#C9A98E" stroke-width="3" stroke-linecap="round" opacity="0.8">
                <path d="M124 200 L82 190 M124 212 L84 218 M196 200 L238 190 M196 212 L236 218"/>
              </g>
            </g>
            </g>
        ${signe}`;
    }

    function dessinerZola(etat) {
        return `<svg class="cp-svg" viewBox="6 42 308 330" aria-hidden="true">${dessinZolaInterieur(etat)}</svg>`;
    }

    function dessinerSam(etat) {
        return `<svg class="cp-svg" viewBox="6 42 308 330" aria-hidden="true">${dessinSamInterieur(etat)}</svg>`;
    }

    function dessinerKiri(etat) {
        return `<svg class="cp-svg" viewBox="6 42 308 330" aria-hidden="true">${dessinKiriInterieur(etat)}</svg>`;
    }

    function dessinerRaya(etat) {
        return `<svg class="cp-svg" viewBox="6 42 308 330" aria-hidden="true">${dessinRayaInterieur(etat)}</svg>`;
    }

    /* ══════════════════════════════════════════════════════════════════════
       LES COMPAGNONS EN IMAGE                                  (25/08/2026)
       ----------------------------------------------------------------------
       La troupe est passée des tracés SVG à des PNG dessinés hors de l'app.
       Motif : un style unique, tenu d'un animal à l'autre, que du code ne
       produira jamais aussi vite. La migration s'est faite ANIMAL PAR ANIMAL —
       le dessin reste une propriété de chaque compagnon, pas un réglage global,
       ce qui permet d'ajouter un nouvel animal en tracé sans rien défaire.

       ⚠ DEPUIS LE 26/08/2026 LES SEPT COMPAGNONS SONT EN IMAGE. Les fonctions
       `dessinerBabi`, `dessinerBulle`, `dessinerTiti`, `dessinerZola`,
       `dessinerKiri`, `dessinerRaya`, `dessinerSam` et leurs `…Interieur`
       existent toujours, plus bas, et PLUS AUCUNE n'est appelée. Elles restent
       la référence du gabarit (proportions, ancres, ligne de sol) — leur place
       est désormais `experiments/`, déménagement pas fait.

       ⚠ LE FACTEUR D'ÉCHELLE EST LE MÊME POUR TOUS (`taille: 336.5`), et c'est
       voulu : les sept PNG sont dessinés dans le même carré de 512, donc un
       facteur commun conserve les tailles RELATIVES voulues par le dessin —
       la girafe dépasse l'hippo parce qu'elle le dépasse sur la planche, pas
       parce qu'un chiffre le dit ici. Seuls `x` et `y` sont propres à chacun.

       ⚠ CE QUE L'IMAGE COÛTE, ET IL FAUT LE SAVOIR AVANT D'AJOUTER LE SUIVANT :
       une image est FIXE. Les quatre états ne changent plus le visage — un
       animal en image sourit même quand on annonce qu'il est secoué. Ce qui
       sauve la lecture, ce sont les ACCESSOIRES (larme, zzz, étoiles), qui
       sont des calques posés PAR-DESSUS et restent, eux, pilotés par l'état.
       C'est pour ça que chaque animal déclare ses ancres ci-dessous : sans la
       larme au bon endroit, la fenêtre de fin de trajet dirait le contraire de
       ce qu'elle montre.

       ⚠ LE CALAGE NE SE FAIT PAS À L'ŒIL. Les valeurs `x`, `y` et `taille`
       sont calculées à partir de la BOÎTE ENGLOBANTE réelle du PNG (les pixels
       dont l'alpha dépasse 8), de façon que :
         · les pieds tombent sur y ≈ 358, la ligne de sol de TOUS les
           compagnons — c'est elle qui les fait tenir debout au même niveau
           quand ils se succèdent, et c'est elle que la clairière suppose en
           réduisant l'animal à 0,24 ;
         · le dessin soit centré sur x = 160.
       Le PNG est carré et déclaré carré : aucune déformation possible.
       Refaire ce calcul à chaque nouvelle image plutôt que de recopier les
       chiffres de Babi — deux PNG n'ont jamais la même marge interne.

       ⚠ `boite` EST CETTE BOÎTE ENGLOBANTE, ÉCRITE NOIR SUR BLANC (27/08/2026).
       Elle ne vivait qu'en commentaire de fin de ligne, donc aucun code ne
       pouvait s'en servir. Le marqueur GPS en a besoin : il recadre le PNG sur
       ses pixels visibles (`viewBox` posé sur `boite`), faute de quoi un animal
       de 30 px se retrouverait dessiné dans un carré de 512 dont un bon tiers
       est transparent — deux fois trop petit et décentré.
       Seuil alpha 64, PAS 8 : plus bas, les pixels parasites laissés par le
       réencodage élargissent la boîte d'une centaine de pixels (même piège que
       `tools/verif-cadrage.js`). Les six dernières correspondent exactement au
       commentaire d'origine ; celle de Babi non (449×400 à 27,67 mesuré contre
       425×400 à 41,64 annoncé) — `Elephant.PNG` a vraisemblablement été
       remplacé depuis. Son calage de hero (`x`/`y`/`taille`) n'a PAS été
       retouché pour autant : il est réglé à l'œil sur le rendu actuel, et le
       corriger « au calcul » déplacerait un animal que rien ne signale comme
       mal posé.

       ⚠ LA CASSE DU NOM DE FICHIER EST SIGNIFIANTE. Windows ne fait pas la
       différence entre `.PNG` et `.png`, Android SI. Un chemin qui marche sur
       le bureau peut donc rendre l'animal INVISIBLE dans l'APK — et sans la
       moindre erreur, un `<image>` dont la source manque ne dessine rien.
       Recopier le nom exactement tel qu'il est sur le disque.
       ══════════════════════════════════════════════════════════════════════ */
    /* ⚠ LE CHEMIN EST RELATIF À LA RACINE DE L'APP, PAS À LA PAGE QUI AFFICHE.
       `index.html` est à la racine, mais la planche de contrôle vit dans
       `experiments/` : `Images/…` y résolvait en `experiments/Images/…`, et
       l'animal disparaissait — un `<image>` dont la source manque ne dessine
       rien et ne lève rien. On déduit donc la racine de l'URL de CE fichier,
       la seule que le module connaisse à coup sûr, d'où qu'on l'appelle.
       Repli sur le chemin relatif si le script est inliné (`src` vide) : c'est
       le cas d'une copie autonome de la planche, qui embarque ses images. */
    const RACINE = (function () {
        try {
            const s = document.currentScript && document.currentScript.src;
            if (s) return s.replace(/js\/22-compagnon\.js.*$/, '');
        } catch (e) { /* environnement sans DOM : chemin relatif */ }
        return '';
    })();

    /* ══════════════════════════════════════════════════════════════════════
       LES VIDÉOS D'ANIMAL                                      (25/08/2026)
       ----------------------------------------------------------------------
       Deux moments, et deux seulement — une vidéo qui se lance sans raconter
       un passage n'est qu'une attente imposée :
         · `cage`  — au moment où l'on CHOISIT l'animal : le voici, enfermé,
                     c'est lui qu'on part chercher ;
         · `libre` — au moment où son parcours s'achève. Elle remplacera la
                     vidéo de médaille de catégorie, retirée le même jour
                     (voir js/12) : la récompense d'un parcours mené au bout,
                     c'est l'animal qu'on libère, pas un métal qui tourne.
       Un animal sans vidéo n'en joue aucune et la suite s'enchaîne : la table
       se remplit au fur et à mesure, elle n'a pas à être complète.

       ⚠ CASSE ET CHEMIN EXACTS, comme pour les images : un fichier introuvable
       ne produit AUCUNE erreur visible — `jouerVideo()` enchaîne la suite comme
       si la vidéo avait été vue. Une vidéo « qui ne se lance pas » est presque
       toujours un nom de fichier qui ne correspond pas.
       ══════════════════════════════════════════════════════════════════════ */
    /* ⚠ LA CASSE ET LE NOM SONT CEUX DU DISQUE, PAS CEUX DU COMPAGNON. Le fichier
       de Babi s'appelle `Elephant_cage.mp4` — les médias sont rangés par ESPÈCE,
       les clés ici sont des PRÉNOMS, et les deux n'ont aucune raison de coïncider.
       Même règle que pour les images (voir IMAGES plus haut) : recopier le nom
       exactement tel qu'il est sur le disque, sans quoi Android — qui distingue
       `.mp4` de `.MP4` là où Windows non — ne trouvera rien, en silence. */
    const VIDEOS = {
        babi:  { cage: 'Video/Animals/Elephant/Elephant_cage.mp4' },
        bulle: { cage: 'Video/Animals/Elephant/Hippo_cage.mp4' }
    };

    function videoDe(cle, moment) {
        const v = VIDEOS[cle];
        const chemin = v && v[moment || 'cage'];
        return chemin ? RACINE + chemin : null;
    }

    const IMAGES = {
        babi: {
            /* ⚡ Même bascule PNG → webp animé que Bulle (28/08/2026) : la boîte
               alpha ci-dessous est celle du NOUVEAU fichier (mesurée au seuil 64,
               canvas 256×256 ramené à l'échelle 512 du reste de la table — voir
               tools/_alpha-bbox.js), pas recopiée du PNG comme ça l'avait été
               pour l'hippo. `taille` est recalculée pour que la hauteur apparente
               du personnage ne bouge pas (mêmes pieds, même centre horizontal). */
            fichier: 'Images/Animals/Gif/Elephant.webp',
            boite: { x: 106, y: 130, w: 304, h: 340 },
            x: -39.5, y: -5.5, taille: 395.9,   // contenu 304×340 à 106,130
            sol: { cx: 160, rx: 59 },
            larme: [126, 196], zzz: [258, 96], etoiles: [[46, 104, 13], [276, 92, 10]]
        },
        bulle: {
            /* ⚡ TEST ANIMATION — remplace temporairement le PNG statique pour
               vérifier si <image> en SVG anime bien un WebP dans le WebView Android.
               Passé du gif (7,9 Mo) au webp (362 Ko) le 28/08/2026 : même image,
               poids ÷23 — le gif restait dans le dossier pour comparaison.
               Le calage (boite/x/y/taille) reste celui du PNG : à recalibrer si
               l'animation a un cadrage différent (voir la note plus haut sur le calage). */
            fichier: 'Images/Animals/Gif/Hippo.webp',
            boite: { x: 73, y: 58, w: 362, h: 407 },
            /* Le seul animal qui ait ses trois états au 27/08/2026. Les six autres
               n'ont pas de `variantes` : ils affichent leur image Normal quel que soit
               leur état physique — voir `variante()` juste sous cette table. */
            variantes: {
                blesse: { fichier: 'Images/Animals/Blesser/Hippo_Blesser.PNG',
                          boite: { x: 73, y: 58, w: 362, h: 407 } },
                mort:   { fichier: 'Images/Animals/Dead/Hippo_dead.PNG',
                          boite: { x: 75, y: 59, w: 361, h: 427 } }
            },
            /* +25% (test gif) : taille scalée depuis 336.5, x/y recalculés pour garder
               les pieds et le centre horizontal au même endroit qu'avant (sinon l'animal
               s'enfonce dans le sol ou flotte au-dessus de l'ombre). */
            x: -49.0, y: -31.7, taille: 420.6,   // contenu 362×407 à 73,58 (×1.25)
            sol: { cx: 160, rx: 63 },
            larme: [114, 181], zzz: [265, 98], etoiles: [[60, 106, 13], [258, 94, 10]]
        },
        titi: {
            fichier: 'Images/Animals/Normal/Singe.png',
            boite: { x: 33, y: 48, w: 439, h: 416 },
            x: -5.9, y: 53.0, taille: 336.5,   // contenu 439×416 à 33,48
            sol: { cx: 160, rx: 76 },
            larme: [128, 212], zzz: [270, 100], etoiles: [[32, 106, 13], [292, 94, 10]]
        },
        zola: {
            fichier: 'Images/Animals/Normal/Lion.png',
            boite: { x: 85, y: 49, w: 369, h: 417 },
            x: -17.1, y: 51.7, taille: 336.5,  // contenu 369×417 à 85,49
            sol: { cx: 160, rx: 64 },
            larme: [120, 211], zzz: [252, 100], etoiles: [[44, 104, 13], [274, 92, 10]]
        },
        kiri: {
            fichier: 'Images/Animals/Normal/Girafe.png',
            boite: { x: 70, y: 28, w: 355, h: 438 },
            x: -2.7, y: 51.7, taille: 336.5,   // contenu 355×438 à 70,28
            sol: { cx: 160, rx: 62 },
            larme: [121, 211], zzz: [250, 88], etoiles: [[48, 96, 13], [272, 84, 10]]
        },
        raya: {
            fichier: 'Images/Animals/Normal/Tigre.png',
            boite: { x: 58, y: 41, w: 390, h: 423 },
            x: -6.3, y: 53.0, taille: 336.5,   // contenu 390×423 à 58,41
            sol: { cx: 160, rx: 68 },
            larme: [109, 168], zzz: [262, 96], etoiles: [[36, 102, 13], [284, 90, 10]]
        },
        sam: {
            fichier: 'Images/Animals/Normal/Renard.png',
            boite: { x: 77, y: 46, w: 357, h: 418 },
            x: -7.9, y: 53.0, taille: 336.5,   // contenu 357×418 à 77,46
            sol: { cx: 160, rx: 62 },
            larme: [120, 212], zzz: [250, 98], etoiles: [[46, 102, 13], [274, 90, 10]]
        }
    };

    /* ══════════════════════════════════════════════════════════════════════
       L'IMAGE À AFFICHER POUR UN ÉTAT PHYSIQUE               (27/08/2026)
       ----------------------------------------------------------------------
       Rend toujours quelque chose d'affichable : `{ fichier, boite, x, y, taille }`.

       ⚠ UNE VARIANTE MANQUANTE REND L'IMAGE NORMALE, elle ne rend jamais rien.
       Seul l'hippo a ses trois états aujourd'hui — l'éléphant, qui est pourtant
       le compagnon par défaut, n'en a aucun. La mécanique ne peut donc pas être
       suspendue à la présence d'un fichier : la couleur du cadre et la phrase de
       la fenêtre d'arrivée disent l'état même quand l'image ne le dit pas. Le
       jour où un PNG est ajouté dans `Blesser/` ou `Dead/`, il suffit de le
       déclarer dans `variantes` — rien d'autre à toucher.

       ⚠ LE CALAGE D'UNE VARIANTE EST CALCULÉ, PAS RECOPIÉ. Les `x`/`y` déclarés
       plus haut valent pour l'image Normal et pour elle seule : l'hippo mort est
       couché, sa boîte alpha fait 427 px de haut contre 407 — recopier le calage
       de l'hippo debout le ferait flotter de 13 px au-dessus du sol. La formule
       est celle qui a servi à établir les valeurs déclarées (pieds sur y = 358,
       centré sur x = 160) et elle les reproduit à 0,1 px près pour l'hippo : on
       ne la vérifie donc pas à l'œil, on la vérifie sur `bulle`.
       ⚠ Les valeurs déclarées ne sont PAS recalculées pour autant : celles de
       Babi datent d'un `Elephant.PNG` remplacé depuis (voir l'en-tête d'IMAGES),
       les recalculer déplacerait un animal que personne ne signale comme mal posé.
       ══════════════════════════════════════════════════════════════════════ */
    const SOL_Y = 358, CENTRE_X = 160;

    /* ══════════════════════════════════════════════════════════════════════
       L'ÉTAT PHYSIQUE VU DEPUIS ICI                          (27/08/2026)
       ----------------------------------------------------------------------
       Le PORTRAIT du compagnon actif doit être raccord avec sa barre de vie :
       à 2 % de vie, la carte de rang montrait un hippo intact au-dessus d'une
       jauge presque vide. Un module qui dessine ne peut pas ignorer l'état de
       ce qu'il dessine.

       ⚠ CETTE VALEUR N'EST PAS APPLIQUÉE D'OFFICE PARTOUT — voir `variante()`,
       qui garde `sain` par défaut. Elle n'est posée que sur les PORTRAITS du
       compagnon actif (`rang`, `etat`, `Compagnon.dessin`). Les décors (clairière,
       parcours) en sont exclus DÉLIBÉRÉMENT : « RIEN NE MEURT ICI » est une règle
       de voix écrite plus bas, un animal blessé au bord de l'eau la casserait.
       La grille de choix (`catalogue`) en est exclue aussi : elle dit déjà la mort
       par son grisé et sa mention.

       ⚠ LA VIE N'EST LISIBLE QUE POUR LE COMPAGNON ACTIF. `VieCompagnon.valeur()`
       ne rend que la sienne ; pour un autre animal, seul le registre des morts est
       consultable. D'où les deux branches — un animal qui n'est pas le courant est
       `mort` ou `sain`, jamais `blesse`. */
    function physiqueCourant(cle) {
        const k = cle || courant;
        try {
            if (!window.VieCompagnon) return 'sain';
            if (typeof VieCompagnon.estMort === 'function' && VieCompagnon.estMort(k)) return 'mort';
            if (k === courant && typeof VieCompagnon.valeur === 'function'
                && typeof etatPhysiqueVie === 'function') {
                return etatPhysiqueVie(VieCompagnon.valeur());
            }
        } catch (e) { /* module absent ou stockage illisible : l'animal reste sain */ }
        return 'sain';
    }

    function variante(cle, physique) {
        const im = IMAGES[cle] || IMAGES.babi;
        const v = (physique && physique !== 'sain' && im.variantes) ? im.variantes[physique] : null;
        if (!v) return { fichier: im.fichier, boite: im.boite, x: im.x, y: im.y, taille: im.taille };
        const b = v.boite;
        const s = im.taille / 512;
        return {
            fichier: v.fichier, boite: b, taille: im.taille,
            x: CENTRE_X - (b.x + b.w / 2) * s,
            y: SOL_Y     - (b.y + b.h) * s
        };
    }

    function dessinImageInterieur(cle, etat, physique) {
        const im = IMAGES[cle];
        const v  = variante(cle, physique);
        /* ⚠ AUCUN ACCESSOIRE SUR UNE VARIANTE. Larme, zzz et étoiles sont des calques
           posés à des ancres relevées sur l'image NORMALE — sur un hippo couché, la
           larme tomberait à côté du visage. Et ils n'ont rien à y ajouter : une image
           blessée dit déjà qu'elle est blessée, une larme sur un animal mort serait
           de trop. Les accessoires restent donc l'affaire de l'image d'origine, la
           seule dont les ancres soient mesurées. */
        const surVariante = v.fichier !== im.fichier;
        let signe = '';
        if (surVariante)                 signe = '';
        else if (etat === 'assoupi')     signe = zzz(im.zzz[0], im.zzz[1], '#F2C489');
        else if (etat === 'secoue')      signe = larme(im.larme[0], im.larme[1]);
        else if (etat === 'ravi')        signe = etoiles(im.etoiles);

        /* L'ombre au sol est dessinée ICI et pas incluse dans le PNG : elle doit
           rester SOUS le corps quand il respire (`.cp-body` fait grandir l'animal
           depuis ses pieds). Incluse dans l'image, elle enflerait avec lui, ce qui
           ne se produit pas dans la nature. */
        /* L'ombre au sol : elle marque le sol, elle ne suit donc PAS la variante.
           Un animal couché s'étale, mais il pose son poids au même endroit. */
        return `
            <ellipse cx="${im.sol.cx}" cy="356" rx="${im.sol.rx}" ry="12" fill="#0d0a22" opacity="0.5"/>
            <g class="cp-body">
                <image href="${RACINE}${v.fichier}" xlink:href="${RACINE}${v.fichier}"
                       x="${v.x}" y="${v.y}" width="${v.taille}" height="${v.taille}"/>
            </g>
            ${signe}`;
    }

    function dessinerImage(cle, etat, physique) {
        return `<svg class="cp-svg" viewBox="6 42 308 330" aria-hidden="true">${dessinImageInterieur(cle, etat, physique)}</svg>`;
    }

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
                clairiere:      (v) => v.pousses === 0
                                        ? "Rien n'a encore poussé au bord de l'eau. Ça vient."
                                        : `${v.pousses} roseau${v.pousses > 1 ? 'x' : ''} sur ${v.total} cette semaine`,
                trajet_doux:    () => 'Trajet tout en douceur. Je m\'en souviendrai.',
                trajet_brusque: (v) => `${v.freinages} freinages. ${v.ecart} de plus que d'habitude.`,
                defi_valide:    (v) => `Un défi de moins. Il t'en reste ${v.reste}.`
            },
            decor: 'point_eau',
            dessin:    (e, p) => dessinerImage('babi', e, p),
            interieur: (e, p) => dessinImageInterieur('babi', e, p)
        },

        bulle: {
            nom: 'Bulle',
            espece: 'hippopotame',
            accent: '#8FA8D8',
            /* Même règle de voix que Babi — constater, jamais juger. Bulle est
               seulement plus placide : « la masse tranquille, on ne le bouscule
               pas » (fiche de la troupe, maquette 2026). Il n'insiste jamais et
               ne relance pas ; il accompagne. */
            phrases: {
                accueil:        () => 'Bonjour',
                accueil_soir:   () => 'Bonsoir',
                destination_ok: () => 'D\'accord. Quand tu veux.',
                objectifs:      (v) => `${v.km} km par semaine depuis ${v.sem} semaines. C'est régulier.`,
                carnet_cale:    (v) => `Tu roules ${v.km} km par semaine en moyenne. J'ai calé tes défis dessus.`,
                carnet_observe: (v) => `Je te regarde rouler (${v.sem}/${v.total} semaines). Encore ${v.reste} et je saurai.`,
                clairiere:      (v) => v.pousses === 0
                                        ? "Rien n'a ouvert sur le fleuve cette semaine. Ce n'est pas grave."
                                        : `${v.pousses} nénuphar${v.pousses > 1 ? 's' : ''} sur ${v.total} cette semaine`,
                trajet_doux:    () => 'Tranquille, ce trajet. Ça me va.',
                // (voir A_VENIR pour les compagnons de la troupe pas encore dessinés)
                trajet_brusque: (v) => `${v.freinages} freinages. ${v.ecart} de plus que d'habitude.`,
                defi_valide:    (v) => `Un de moins. Il t'en reste ${v.reste}.`
            },
            decor: 'fleuve',
            dessin:    (e, p) => dessinerImage('bulle', e, p),
            interieur: (e, p) => dessinImageInterieur('bulle', e, p)
        },

        titi: {
            nom: 'Titi',
            espece: 'singe',
            accent: '#C77BB0',
            decor: 'canopee',
            /* Même règle que les autres — jamais de reproche. Mais Titi est
               « le curieux » : il est le seul à PROPOSER quelque chose au lieu
               de simplement constater. C'est sa marque, pas une entorse. */
            phrases: {
                accueil:        () => 'Salut',
                accueil_soir:   () => 'Bonsoir',
                destination_ok: () => 'Bien ! Et si on passait ailleurs ?',
                objectifs:      (v) => `${v.km} km par semaine depuis ${v.sem} semaines. On varie un peu ?`,
                carnet_cale:    (v) => `Tu roules ${v.km} km par semaine. J'ai calé tes défis là-dessus.`,
                carnet_observe: (v) => `Je te regarde rouler (${v.sem}/${v.total} semaines). Encore ${v.reste} et je saurai.`,
                clairiere:      (v) => v.pousses === 0
                                        ? "Rien n'a encore mûri cette semaine. Ça vient."
                                        : `${v.pousses} fruit${v.pousses > 1 ? 's' : ''} sur ${v.total} cette semaine`,
                trajet_doux:    () => 'Joli trajet. Tout en souplesse.',
                trajet_brusque: (v) => `${v.freinages} freinages. ${v.ecart} de plus que d'habitude.`,
                defi_valide:    (v) => `Un de bouclé. Il t'en reste ${v.reste}.`
            },
            dessin:    (e, p) => dessinerImage('titi', e, p),
            interieur: (e, p) => dessinImageInterieur('titi', e, p)
        },
        zola: {
            nom: 'Zola',
            espece: 'lion',
            accent: '#F2A93B',
            decor: 'rocher',
            /* « Le calme du fort, rien à prouver » (fiche de la troupe).
               Il ne relance jamais et ne s'enthousiasme pas : il constate, et ça
               suffit. C'est la voix la plus sobre de la troupe. */
            phrases: {
                accueil:        () => 'Bonjour',
                accueil_soir:   () => 'Bonsoir',
                destination_ok: () => "C'est noté.",
                objectifs:      (v) => `${v.km} km par semaine depuis ${v.sem} semaines. Solide.`,
                carnet_cale:    (v) => `Tu roules ${v.km} km par semaine. J'ai calé tes défis là-dessus.`,
                carnet_observe: (v) => `Je te regarde rouler (${v.sem}/${v.total} semaines). Encore ${v.reste} et je saurai.`,
                clairiere:      (v) => v.pousses === 0
                                        ? "Rien ne s'est allumé cette semaine. Ça viendra."
                                        : `${v.pousses} étoile${v.pousses > 1 ? 's' : ''} sur ${v.total} cette semaine`,
                trajet_doux:    () => 'Trajet propre. Rien à dire.',
                trajet_brusque: (v) => `${v.freinages} freinages. ${v.ecart} de plus que d'habitude.`,
                defi_valide:    (v) => `Un de bouclé. Il t'en reste ${v.reste}.`
            },
            dessin:    (e, p) => dessinerImage('zola', e, p),
            interieur: (e, p) => dessinImageInterieur('zola', e, p)
        },
        kiri: {
            nom: 'Kiri',
            espece: 'girafe',
            accent: '#FFD76B',
            decor: 'arbre',
            /* « Elle voit loin, elle anticipe » (fiche de la troupe).
               Elle parle au FUTUR quand les autres parlent au présent : c'est sa
               marque, elle regarde le trajet d'après. */
            phrases: {
                accueil:        () => 'Bonjour',
                accueil_soir:   () => 'Bonsoir',
                destination_ok: () => "Je vois le chemin d'ici.",
                objectifs:      (v) => `${v.km} km par semaine depuis ${v.sem} semaines. Tu tiens le rythme.`,
                carnet_cale:    (v) => `Tu roules ${v.km} km par semaine. J'ai calé tes défis là-dessus.`,
                carnet_observe: (v) => `Je te regarde rouler (${v.sem}/${v.total} semaines). Encore ${v.reste} et je saurai.`,
                clairiere:      (v) => v.pousses === 0
                                        ? "Rien n'a encore poussé. La semaine est longue."
                                        : `${v.pousses} feuille${v.pousses > 1 ? 's' : ''} sur ${v.total} cette semaine`,
                trajet_doux:    () => 'Trajet anticipé de bout en bout.',
                trajet_brusque: (v) => `${v.freinages} freinages. ${v.ecart} de plus que d'habitude.`,
                defi_valide:    (v) => `Un de bouclé. Il t'en reste ${v.reste}.`
            },
            dessin:    (e, p) => dessinerImage('kiri', e, p),
            interieur: (e, p) => dessinImageInterieur('kiri', e, p)
        },
        raya: {
            nom: 'Raya',
            espece: 'tigre',
            accent: '#E8763C',
            decor: 'jungle',
            /* « La précision, le geste juste » (fiche de la troupe).
               Elle est la seule à parler en CHIFFRES exacts plutôt qu'en
               impressions — « le geste juste » vaut aussi pour ce qu'elle dit. */
            phrases: {
                accueil:        () => 'Bonjour',
                accueil_soir:   () => 'Bonsoir',
                destination_ok: () => 'Noté. Au mètre près.',
                objectifs:      (v) => `${v.km} km par semaine depuis ${v.sem} semaines. Régulier.`,
                carnet_cale:    (v) => `Tu roules ${v.km} km par semaine. J'ai calé tes défis là-dessus.`,
                carnet_observe: (v) => `Je te regarde rouler (${v.sem}/${v.total} semaines). Encore ${v.reste} et je saurai.`,
                clairiere:      (v) => v.pousses === 0
                                        ? "Rien n'a ouvert cette semaine. Ce n'est pas un reproche."
                                        : `${v.pousses} fleur${v.pousses > 1 ? 's' : ''} sur ${v.total} cette semaine`,
                trajet_doux:    () => 'Trajet net. Pas un geste de trop.',
                trajet_brusque: (v) => `${v.freinages} freinages. ${v.ecart} de plus que d'habitude.`,
                defi_valide:    (v) => `Un de bouclé. Il t'en reste ${v.reste}.`
            },
            dessin:    (e, p) => dessinerImage('raya', e, p),
            interieur: (e, p) => dessinImageInterieur('raya', e, p)
        },
        sam: {
            nom: 'Sam',
            espece: 'renarde',
            genre: 'f',
            accent: '#E0523B',
            decor: 'lisiere',
            /* « La maligne, elle connaît un raccourci ». Même règle que toute la
               troupe — constater, jamais reprocher —, mais Sam est la seule à
               parler de CHEMIN plutôt que de conduite : là où Raya compte les
               mètres et Kiri regarde le trajet d'après, elle regarde celui d'à
               côté. C'est sa marque, et elle ne doit pas déborder sur les autres
               registres, sans quoi elle devient un second Titi. */
            phrases: {
                accueil:        () => 'Te voilà',
                accueil_soir:   () => 'Bonsoir',
                destination_ok: () => 'Je connais un chemin. On verra bien.',
                objectifs:      (v) => `${v.km} km par semaine depuis ${v.sem} semaines. Toujours les mêmes routes ?`,
                carnet_cale:    (v) => `Tu roules ${v.km} km par semaine. J'ai calé tes défis là-dessus.`,
                carnet_observe: (v) => `Je te regarde rouler (${v.sem}/${v.total} semaines). Encore ${v.reste} et je saurai.`,
                clairiere:      (v) => v.pousses === 0
                                        ? "Rien n'a encore percé sous les fougères. Ça vient."
                                        : `${v.pousses} baie${v.pousses > 1 ? 's' : ''} sur ${v.total} cette semaine`,
                trajet_doux:    () => 'Trajet sans accroc. Bien joué.',
                trajet_brusque: (v) => `${v.freinages} freinages. ${v.ecart} de plus que d'habitude.`,
                defi_valide:    (v) => `Un de bouclé. Il t'en reste ${v.reste}.`
            },
            dessin:    (e, p) => dessinerImage('sam', e, p),
            interieur: (e, p) => dessinImageInterieur('sam', e, p)
        }
    };

    /* ⚠ LE GENRE N'EST PAS DÉDUIT DU NOM NI DE L'ESPÈCE. « Sam » ne dit rien,
       « renarde » et « chatte » le disent mais « girafe » se lit aussi pour un
       mâle : une déduction par le mot se serait trompée tôt ou tard, et une
       phrase mal accordée sur le nom d'un compagnon se voit immédiatement.
       Il est donc DÉCLARÉ, une fois, ici. Défaut masculin — la table ci-dessous
       ne porte que les femelles, ça évite six lignes qui répètent 'm'.
       Seul usage à ce jour : la fenêtre de fin de trajet (js/12), « Sam est
       secouéE ». Elle disait « secoué » pour Kiri et Raya avant cette table. */
    const FEMELLES = { kiri: true, raya: true, sam: true };
    function genreDe(cle) {
        return (COMPAGNONS[cle] && COMPAGNONS[cle].genre) || (FEMELLES[cle] ? 'f' : 'm');
    }

    /* Les compagnons annoncés mais pas encore dessinés. `silhouette` décrit la
       FORME DE TÊTE qui suffit à reconnaître l'espèce en gris — inutile de
       dessiner l'animal entier pour une case verrouillée.

       Chaque animal aura sa PROPRE vie (décision du 24/08/2026) : un compagnon
       usé ne se répare pas en changeant d'espèce. Cette jauge vivra dans le
       module de calcul, indexée par ces clés, jamais ici — ce module reste des
       dessins et des phrases. */
    const A_VENIR = {
        nima:  { nom: 'Nima',  espece: 'chatte', silhouette: 'pointue' },
        pilou: { nom: 'Pilou', espece: 'chien',  silhouette: 'tombante' }
    };

    /* Une tête grise par espèce. Les oreilles portent tout : ce sont elles, et
       pas le museau, qui font reconnaître un chat d'un chien en vignette. */
    function silhouette(forme) {
        const G = '#6E668F';
        const oreilles = {
            criniere: Array.from({ length: 12 }, function (_, i) {
                const t = (Math.PI * 2 * i) / 12;
                return '<circle cx="' + (160 + 94 * Math.cos(t)).toFixed(1) +
                       '" cy="' + (152 + 94 * Math.sin(t)).toFixed(1) + '" r="32" fill="' + G + '"/>';
            }).join(''),
            pointue:  `<path d="M96 106 L104 44 L152 84 Z" fill="${G}"/><path d="M224 106 L216 44 L168 84 Z" fill="${G}"/>`,
            tombante: `<ellipse cx="74" cy="164" rx="26" ry="52" fill="${G}"/><ellipse cx="246" cy="164" rx="26" ry="52" fill="${G}"/>`
        }[forme] || '';
        return `<svg class="cp-svg" viewBox="6 42 308 330" aria-hidden="true">
            ${oreilles}
            <circle cx="160" cy="152" r="86" fill="${G}"/>
            <ellipse cx="160" cy="300" rx="62" ry="52" fill="${G}"/>
            <circle cx="126" cy="146" r="13" fill="#2A2242" opacity="0.5"/>
            <circle cx="194" cy="146" r="13" fill="#2A2242" opacity="0.5"/>
        </svg>`;
    }

    let courant = 'babi';
    let etatCourant = 'repos';

    try {
        const choisi = localStorage.getItem('gps_compagnon');
        if (choisi && COMPAGNONS[choisi]) courant = choisi;
    } catch (e) { /* stockage indisponible : on garde Babi */ }

    /* Change de compagnon et repeint TOUT ce qui en affiche un. Rendre la main
       sans repeindre laisserait l'ancien animal sur l'accueil jusqu'au prochain
       rechargement — le choix paraîtrait ne pas avoir été pris en compte. */
    function choisir(cle) {
        if (!COMPAGNONS[cle] || cle === courant) return false;
        /* ⚠ UN ANIMAL MORT NE SE REJOUE PAS, et la garde est ICI plutôt que chez le
           seul appelant connu : `choisir()` est l'unique porte d'entrée du changement
           de compagnon, la grille de choix n'est qu'un de ses chemins (il y a aussi la
           console, une reprise de session, et ce qu'on écrira demain). Le registre vit
           dans js/24, chargé APRÈS ce fichier — d'où le `typeof`. Registre absent :
           personne n'est mort, on laisse passer. */
        if (window.VieCompagnon && typeof VieCompagnon.estMort === 'function'
            && VieCompagnon.estMort(cle)) return false;
        courant = cle;
        try { localStorage.setItem('gps_compagnon', cle); } catch (e) { /* non bloquant */ }
        etat(etatCourant);
        if (typeof window.renderCarteCompagnon === 'function') {
            try { window.renderCarteCompagnon(); } catch (e) { /* la carte se repeindra seule */ }
        }
        /* Le marqueur de position porte l'animal (js/04) : il doit changer tout de
           suite, pas au trajet suivant. Même précaution que la ligne au-dessus — la
           fonction peut manquer (planche d'expérimentation), et son absence ne doit
           surtout pas empêcher le changement de compagnon, déjà enregistré. */
        if (typeof window.rafraichirMarqueurCompagnon === 'function') {
            try { window.rafraichirMarqueurCompagnon(); } catch (e) { /* le marqueur se refera au prochain trajet */ }
        }
        return true;
    }

    /* Le catalogue complet pour la page de choix : les jouables d'abord, les
       verrouillés ensuite. */
    function catalogue() {
        const l = Object.keys(COMPAGNONS).map(cle => ({
            cle: cle, nom: COMPAGNONS[cle].nom, espece: COMPAGNONS[cle].espece,
            accent: COMPAGNONS[cle].accent, debloque: true,
            actif: cle === courant, vignette: COMPAGNONS[cle].dessin('repos')
        }));
        Object.keys(A_VENIR).forEach(cle => {
            const a = A_VENIR[cle];
            l.push({ cle: cle, nom: a.nom, espece: a.espece, accent: '#6E668F',
                     debloque: false, actif: false, vignette: silhouette(a.silhouette) });
        });
        return l;
    }

    /* ======================================================================
       LE DESSIN
       Un seul gabarit paramétré par l'état plutôt que cinq SVG recopiés : les
       proportions du corps restent identiques d'un état à l'autre, seuls le
       visage, les oreilles et la trompe changent. Sans ça, la moindre retouche
       de silhouette serait à reporter cinq fois.
       ====================================================================== */
    function dessinerBabi(etat) {
        return `<svg class="cp-svg" viewBox="6 42 308 330" aria-hidden="true">${dessinBabiInterieur(etat)}</svg>`;
    }

    /* Le contenu seul, sans <svg> : la clairière l'imbrique dans SA planche, à
       une autre échelle. Sans cette séparation il aurait fallu recopier tout
       l'éléphant — deux dessins à retoucher au lieu d'un. */
    /* Un compteur d'instances, et c'est indispensable. Le dessin embarque ses
       propres `<defs>` ; deux compagnons sur la même page — le hero et le
       portrait de rang, par exemple — déclareraient chacun un `cpTete`, et le
       navigateur NE GARDE QUE LE PREMIER. Le second hériterait des dégradés du
       premier, trompe comprise, alors qu'elle change d'un état à l'autre. Chaque
       instance suffixe donc tous ses ids. */
    let _instance = 0;

    function dessinBabiInterieur(etat) {
        const u = '-' + (++_instance);

        /* --- La trompe, par état.

           Elle est faite de traits STROKÉS de largeur décroissante et non d'un
           chemin fermé : les bouts ronds se recouvrent et forment un cône
           continu, ce qu'un contour fermé ne sait pas faire proprement à cette
           échelle.

           ⚠ Son dégradé est en `userSpaceOnUse`. En `objectBoundingBox`, chacun
           des trois traits recalerait la bande de lumière sur SA propre largeur :
           trois tronçons éclairés différemment au lieu d'un tube. La bande est
           donc fixée une fois pour toutes en x, ce qui impose que toutes les
           variantes de trompe restent dans la même colonne — c'est la raison
           pour laquelle « ravi » ne lève pas la trompe sur le côté. */
        const TROMPES = {
            repos: {
                seg: [{ d: 'M160 182 C155 206 156 228 161 242', w: 40 },
                      { d: 'M161 242 C165 256 179 257 182 246', w: 26 },
                      { d: 'M182 246 C184 238 176 234 174 240', w: 15 }],
                anneaux: ['M143 204 Q160 212 177 204', 'M147 228 Q161 236 175 228']
            },
            /* Ravi : la boucle du bout remonte plus haut et plus franchement.
               La trompe ne part PAS sur le côté — elle passerait sur l'œil droit,
               qui est très écarté, et le recouvrirait à moitié. */
            ravi: {
                seg: [{ d: 'M160 182 C156 204 158 224 164 236', w: 40 },
                      { d: 'M164 236 C170 251 187 251 189 238', w: 26 },
                      { d: 'M189 238 C191 227 178 223 176 234', w: 15 }],
                anneaux: ['M143 204 Q160 212 177 204', 'M148 227 Q162 235 176 227']
            },
            /* Triste : elle PEND, sans boucle, et dérive vers la gauche. Une
               trompe enroulée reste une trompe tonique ; c'est l'absence de
               boucle qui dit l'abattement. */
            secoue: {
                seg: [{ d: 'M160 182 C155 208 152 234 152 254', w: 38 },
                      { d: 'M152 254 C152 265 148 271 141 269', w: 22 }],
                anneaux: ['M141 206 Q157 214 173 206', 'M138 232 Q153 240 168 232']
            },
            assoupi: {
                seg: [{ d: 'M160 182 C156 206 157 228 162 242', w: 40 },
                      { d: 'M162 242 C166 255 180 256 183 245', w: 26 },
                      { d: 'M183 245 C185 237 177 233 175 239', w: 15 }],
                anneaux: ['M143 204 Q160 212 177 204', 'M147 228 Q161 236 175 228']
            }
        };
        const T = TROMPES[etat] || TROMPES.repos;

        const traits = (couleur, largeurEnPlus) => T.seg.map(s =>
            `<path d="${s.d}" fill="none" stroke="${couleur}" stroke-width="${s.w + (largeurEnPlus || 0)}" stroke-linecap="round"/>`).join('');

        /* Le bout de la trompe retombe sur le poitrail, qui est du même violet :
           la boucle s'y dissolvait. C'est cette ombre portée qui la décolle. */
        const trompe = `
            <g class="cp-trunk">
              <g transform="translate(3,5)" opacity="0.42" filter="url(#cpFlouDoux${u})">${traits('#332B5C')}</g>
              ${traits(`url(#cpTrompe${u})`)}
              ${T.anneaux.map(d => `<path d="${d}" fill="none" stroke="#6E6599" stroke-width="2.4" stroke-linecap="round" opacity="0.26"/>`).join('')}
            </g>`;

        /* --- Les oreilles. Elles ne battent que quand Babi est éveillé et bien :
           une oreille qui bat sur un visage triste annule le visage. */
        let oreilles;
        if (etat === 'secoue') {
            oreilles = `
                <g transform="rotate(15 108 134)"><ellipse cx="58" cy="136" rx="49" ry="55" fill="url(#cpOreille${u})"/><ellipse cx="55" cy="139" rx="30" ry="36" fill="url(#cpRose${u})"/></g>
                <g transform="rotate(-15 212 134)"><ellipse cx="262" cy="136" rx="49" ry="55" fill="url(#cpOreille${u})"/><ellipse cx="265" cy="139" rx="30" ry="36" fill="url(#cpRose${u})"/></g>`;
        } else if (etat === 'assoupi') {
            oreilles = `
                <g><ellipse cx="58" cy="138" rx="50" ry="56" fill="url(#cpOreille${u})"/><ellipse cx="55" cy="141" rx="31" ry="37" fill="url(#cpRose${u})"/></g>
                <g><ellipse cx="262" cy="138" rx="50" ry="56" fill="url(#cpOreille${u})"/><ellipse cx="265" cy="141" rx="31" ry="37" fill="url(#cpRose${u})"/></g>`;
        } else {
            oreilles = `
                <g class="cp-earL"><ellipse cx="58" cy="132" rx="50" ry="56" fill="url(#cpOreille${u})"/><ellipse cx="55" cy="135" rx="31" ry="37" fill="url(#cpRose${u})"/></g>
                <g class="cp-earR"><ellipse cx="262" cy="132" rx="50" ry="56" fill="url(#cpOreille${u})"/><ellipse cx="265" cy="135" rx="31" ry="37" fill="url(#cpRose${u})"/></g>`;
        }

        /* --- Les yeux. Ils portent l'essentiel de l'expression : le corps ne
           change pas d'un état à l'autre, le visage seul travaille. */
        const OEIL = '#2A2242';
        let yeux, sourcils;
        if (etat === 'ravi') {
            yeux = `<path d="M97 175 C105 155 123 155 131 175" fill="none" stroke="${OEIL}" stroke-width="9" stroke-linecap="round"/>
                    <path d="M189 175 C197 155 215 155 223 175" fill="none" stroke="${OEIL}" stroke-width="9" stroke-linecap="round"/>`;
            sourcils = `<path d="M94 126 Q114 112 134 125"  fill="none" stroke="#7168A2" stroke-width="4.5" stroke-linecap="round" opacity="0.75"/>
                        <path d="M226 126 Q206 112 186 125" fill="none" stroke="#7168A2" stroke-width="4.5" stroke-linecap="round" opacity="0.75"/>`;
        } else if (etat === 'assoupi') {
            yeux = `<path d="M97 164 C105 184 123 184 131 164" fill="none" stroke="${OEIL}" stroke-width="9" stroke-linecap="round"/>
                    <path d="M189 164 C197 184 215 184 223 164" fill="none" stroke="${OEIL}" stroke-width="9" stroke-linecap="round"/>`;
            sourcils = '';   // un visage endormi est un visage lisse
        } else if (etat === 'secoue') {
            /* ⚠ Le SENS des sourcils est tout le message : intérieur RELEVÉ,
               extérieur qui retombe. L'inverse — intérieur qui descend — est le
               masque de la colère, et Babi passait pour agacé. Ne pas réinverser.
               Les yeux gardent leurs reflets et en gagnent un de plus : un œil mat
               se lit éteint ou fâché, un œil brillant se lit ému. */
            sourcils = `<path d="M93 141 C101 130 116 123 134 121"  fill="none" stroke="#7168A2" stroke-width="5" stroke-linecap="round"/>
                        <path d="M227 141 C219 130 204 123 186 121" fill="none" stroke="#7168A2" stroke-width="5" stroke-linecap="round"/>`;
            yeux = `<g class="cp-eyes">
                      <ellipse cx="114" cy="172" rx="25" ry="30" fill="${OEIL}"/>
                      <ellipse cx="114" cy="175" rx="17" ry="21" fill="#443A6C"/>
                      <ellipse cx="106" cy="160" rx="9" ry="11" fill="#FFF"/>
                      <circle cx="124" cy="187" r="5" fill="#FFF"/>
                      <circle cx="101" cy="182" r="3" fill="#FFF" opacity="0.85"/>
                      <ellipse cx="206" cy="172" rx="25" ry="30" fill="${OEIL}"/>
                      <ellipse cx="206" cy="175" rx="17" ry="21" fill="#443A6C"/>
                      <ellipse cx="198" cy="160" rx="9" ry="11" fill="#FFF"/>
                      <circle cx="216" cy="187" r="5" fill="#FFF"/>
                      <circle cx="193" cy="182" r="3" fill="#FFF" opacity="0.85"/>
                    </g>`;
        } else {
            sourcils = `<path d="M96 134 Q114 124 132 133"  fill="none" stroke="#7168A2" stroke-width="4.5" stroke-linecap="round" opacity="0.75"/>
                        <path d="M224 134 Q206 124 188 133" fill="none" stroke="#7168A2" stroke-width="4.5" stroke-linecap="round" opacity="0.75"/>`;
            yeux = `<g class="cp-eyes">
                      <ellipse cx="114" cy="170" rx="25" ry="29" fill="${OEIL}"/>
                      <ellipse cx="114" cy="172" rx="17" ry="21" fill="#443A6C"/>
                      <ellipse cx="106" cy="158" rx="9" ry="11" fill="#FFF"/>
                      <circle cx="124" cy="184" r="4.5" fill="#FFF"/>
                      <circle cx="101" cy="180" r="2.6" fill="#FFF" opacity="0.8"/>
                      <ellipse cx="206" cy="170" rx="25" ry="29" fill="${OEIL}"/>
                      <ellipse cx="206" cy="172" rx="17" ry="21" fill="#443A6C"/>
                      <ellipse cx="198" cy="158" rx="9" ry="11" fill="#FFF"/>
                      <circle cx="216" cy="184" r="4.5" fill="#FFF"/>
                      <circle cx="193" cy="180" r="2.6" fill="#FFF" opacity="0.8"/>
                    </g>`;
        }

        /* Les joues ne disparaissent jamais, même tristes : sans elles le visage
           ne devient pas triste, il devient malade. */
        const JOUES = { repos: [19, 11, 0.85], ravi: [22, 13, 1], secoue: [17, 10, 0.45], assoupi: [19, 11, 0.6] };
        const [jrx, jry, jop] = JOUES[etat] || JOUES.repos;
        const joues = `<ellipse cx="99" cy="200" rx="${jrx}" ry="${jry}" fill="#E893B4" opacity="${jop}"/>
                       <ellipse cx="221" cy="200" rx="${jrx}" ry="${jry}" fill="#E893B4" opacity="${jop}"/>`;

        // --- petits signes d'état, posés hors du corps qui respire
        const etoile = (x, y, r) =>
            `<path d="M${x} ${y - r} Q${x + r * 0.22} ${y - r * 0.22} ${x + r} ${y} Q${x + r * 0.22} ${y + r * 0.22} ${x} ${y + r} Q${x - r * 0.22} ${y + r * 0.22} ${x - r} ${y} Q${x - r * 0.22} ${y - r * 0.22} ${x} ${y - r} Z" fill="#FFE9A8" opacity="0.9"/>`;
        let signe = '';
        if (etat === 'assoupi') {
            signe = `<text class="cp-zz" x="250" y="88" font-size="46" font-weight="800" fill="#A88BFF">z</text>
                     <text class="cp-zz cp-zz2" x="268" y="112" font-size="34" font-weight="800" fill="#A88BFF">z</text>`;
        } else if (etat === 'secoue') {
            /* Une larme sur la joue, pas une goutte de sueur au-dessus de la tête :
               la sueur dit l'effort ou l'énervement, la larme est le seul signe qui
               dise la tristesse sans ambiguïté. */
            signe = `<path class="cp-larme" d="M100 202 C100 202 91.5 216.5 91.5 223.5 A8.5 8.5 0 0 0 108.5 223.5 C108.5 216.5 100 202 100 202 Z" fill="#7FD8E8"/>`;
        } else if (etat === 'ravi') {
            signe = etoile(64, 70, 13) + etoile(256, 78, 10);
        }

        return `
            <defs>
                <radialGradient id="cpTete${u}" cx="36%" cy="26%" r="82%">
                    <stop offset="0" stop-color="#BCB3F0"/><stop offset="1" stop-color="#8D84C4"/>
                </radialGradient>
                <radialGradient id="cpCorps${u}" cx="40%" cy="22%" r="84%">
                    <stop offset="0" stop-color="#ADA4E2"/><stop offset="1" stop-color="#847BBA"/>
                </radialGradient>
                <radialGradient id="cpPatte${u}" cx="38%" cy="26%" r="80%">
                    <stop offset="0" stop-color="#A29AD6"/><stop offset="1" stop-color="#7E75B0"/>
                </radialGradient>
                <radialGradient id="cpOreille${u}" cx="40%" cy="32%" r="78%">
                    <stop offset="0" stop-color="#ADA4E0"/><stop offset="1" stop-color="#8A81C2"/>
                </radialGradient>
                <radialGradient id="cpRose${u}" cx="44%" cy="36%" r="74%">
                    <stop offset="0" stop-color="#EDB7CC"/><stop offset="1" stop-color="#D094AE"/>
                </radialGradient>
                <radialGradient id="cpReflet${u}">
                    <stop offset="0" stop-color="#FFF" stop-opacity="0.17"/>
                    <stop offset="0.55" stop-color="#FFF" stop-opacity="0.07"/>
                    <stop offset="1" stop-color="#FFF" stop-opacity="0"/>
                </radialGradient>
                <linearGradient id="cpTrompe${u}" gradientUnits="userSpaceOnUse" x1="132" y1="0" x2="194" y2="0">
                    <stop offset="0" stop-color="#8F86C4"/><stop offset="0.42" stop-color="#B2A9EA"/>
                    <stop offset="0.78" stop-color="#9C93D2"/><stop offset="1" stop-color="#8078B2"/>
                </linearGradient>
                <linearGradient id="cpDefense${u}" x1="0" y1="0" x2="0.6" y2="1">
                    <stop offset="0" stop-color="#FFFAE8"/><stop offset="1" stop-color="#EFDFBC"/>
                </linearGradient>
                <filter id="cpFlouDoux${u}" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="4"/>
                </filter>
                <filter id="cpFlou${u}" x="-40%" y="-60%" width="180%" height="220%">
                    <feGaussianBlur stdDeviation="9"/>
                </filter>
            </defs>

            <ellipse cx="160" cy="356" rx="80" ry="12" fill="#0d0a22" opacity="0.5"/>

            <g class="cp-body">
              <g class="cp-tail">
                <path d="M212 300 C238 296 250 314 244 330" fill="none" stroke="#8078B2" stroke-width="9" stroke-linecap="round"/>
                <path d="M244 326 C252 329 254 337 248 341 C242 344 237 339 240 333 Z" fill="#948BC6"/>
              </g>

              <!-- Le corps est volontairement PLUS ÉTROIT que la tête. C'est ce
                   rapport-là qui fait le mignon, pas les détails du visage. -->
              <ellipse cx="160" cy="292" rx="62" ry="58" fill="url(#cpCorps${u})"/>
              <ellipse cx="100" cy="286" rx="17" ry="22" transform="rotate(-12 100 286)" fill="url(#cpPatte${u})"/>
              <ellipse cx="220" cy="286" rx="17" ry="22" transform="rotate(12 220 286)"  fill="url(#cpPatte${u})"/>
              <ellipse cx="128" cy="334" rx="27" ry="22" fill="url(#cpPatte${u})"/>
              <ellipse cx="192" cy="334" rx="27" ry="22" fill="url(#cpPatte${u})"/>
              <ellipse cx="114" cy="340" rx="4.5" ry="6" fill="#FFF6E0"/>
              <ellipse cx="128" cy="343" rx="4.5" ry="6" fill="#FFF6E0"/>
              <ellipse cx="142" cy="340" rx="4.5" ry="6" fill="#FFF6E0"/>
              <ellipse cx="178" cy="340" rx="4.5" ry="6" fill="#FFF6E0"/>
              <ellipse cx="192" cy="343" rx="4.5" ry="6" fill="#FFF6E0"/>
              <ellipse cx="206" cy="340" rx="4.5" ry="6" fill="#FFF6E0"/>

              <!-- Sans cette ombre, la tête est POSÉE sur le corps ; avec, elle y est assise. -->
              <ellipse cx="160" cy="256" rx="74" ry="18" fill="#3A3168" opacity="0.4" filter="url(#cpFlou${u})"/>

              ${oreilles}

              <circle cx="160" cy="150" r="95" fill="url(#cpTete${u})"/>
              <ellipse cx="122" cy="96" rx="48" ry="30" fill="url(#cpReflet${u})"/>

              <path d="M149 60 C154 50 159 56 161 47 C164 56 169 50 174 60"
                    fill="none" stroke="#8D84C4" stroke-width="6" stroke-linecap="round"/>

              ${sourcils}
              ${yeux}
              ${joues}

              <!-- Deux petits crocs seulement : des défenses longues sont le détail
                   le plus ANTI-mignon d'un éléphant. Rien de pointu ne se lit bébé. -->
              <path d="M146 214 C136 221 128 230 126 240 C134 237 140 228 152 220 Z" fill="url(#cpDefense${u})"/>
              <path d="M174 214 C184 221 192 230 194 240 C186 237 180 228 168 220 Z" fill="url(#cpDefense${u})"/>

              ${trompe}
            </g>
            ${signe}`;
    }

    /* ======================================================================
       BULLE, L'HIPPOPOTAME
       Même espace de dessin que Babi et même mécanique — dégradés radiaux,
       lumière unique en haut à gauche, aucun contour, ids suffixés par
       instance. Rien de nouveau côté technique : c'est tout l'intérêt d'avoir
       un jeu d'états commun.

       Ce qui fait l'hippopotame et pas un éléphant sans trompe : le MUFLE. Il
       occupe toute la moitié basse du visage et déborde du cercle de la tête.
       Conséquence heureuse — il dégage une vraie BOUCHE, que Babi n'a pas :
       chez Bulle l'humeur passe autant par la bouche que par les yeux.
       ====================================================================== */
    function dessinerBulle(etat) {
        return `<svg class="cp-svg" viewBox="6 42 308 330" aria-hidden="true">${dessinBulleInterieur(etat)}</svg>`;
    }

    function dessinBulleInterieur(etat) {
        const u = '-m' + (++_instance);
        const OEIL = '#2A2242';

        /* Oreilles minuscules et posées SUR le crâne. Une oreille
           d'hippopotame qui pend, c'est un éléphant. */
        const oreille = (cx, cy) =>
            `<circle cx="${cx}" cy="${cy}" r="27" fill="url(#mOreille${u})"/><circle cx="${cx}" cy="${cy + 1}" r="14" fill="url(#mRose${u})"/>`;
        const oreilles = etat === 'secoue'
            ? `<g transform="rotate(14 120 108)">${oreille(98, 92)}</g><g transform="rotate(-14 200 108)">${oreille(222, 92)}</g>`
            : `<g class="cp-earL">${oreille(98, 84)}</g><g class="cp-earR">${oreille(222, 84)}</g>`;

        /* Les yeux sont HAUTS et très écartés : posés au milieu du visage, le
           mufle n'aurait plus la place d'exister. */
        let yeux, sourcils;
        if (etat === 'ravi') {
            yeux = `<path d="M96 130 C103 113 121 113 128 130" fill="none" stroke="${OEIL}" stroke-width="8" stroke-linecap="round"/>
                    <path d="M192 130 C199 113 217 113 224 130" fill="none" stroke="${OEIL}" stroke-width="8" stroke-linecap="round"/>`;
            sourcils = `<path d="M92 100 Q112 88 132 99"  fill="none" stroke="#6E6193" stroke-width="5" stroke-linecap="round" opacity="0.7"/>
                        <path d="M228 100 Q208 88 188 99" fill="none" stroke="#6E6193" stroke-width="5" stroke-linecap="round" opacity="0.7"/>`;
        } else if (etat === 'assoupi') {
            yeux = `<path d="M96 122 C103 139 121 139 128 122" fill="none" stroke="${OEIL}" stroke-width="8" stroke-linecap="round"/>
                    <path d="M192 122 C199 139 217 139 224 122" fill="none" stroke="${OEIL}" stroke-width="8" stroke-linecap="round"/>`;
            sourcils = '';
        } else if (etat === 'secoue') {
            /* ⚠ Intérieur RELEVÉ, extérieur qui retombe : c'est le pli de la
               tristesse. L'inverse est le masque de la colère. Ne pas réinverser. */
            sourcils = `<path d="M90 108 C98 97 112 90 130 88"  fill="none" stroke="#6E6193" stroke-width="5.5" stroke-linecap="round"/>
                        <path d="M230 108 C222 97 208 90 190 88" fill="none" stroke="#6E6193" stroke-width="5.5" stroke-linecap="round"/>`;
            yeux = `<g class="cp-eyes">
                      <ellipse cx="112" cy="128" rx="19" ry="23" fill="${OEIL}"/><ellipse cx="112" cy="131" rx="13" ry="16" fill="#443A6C"/>
                      <ellipse cx="106" cy="119" rx="7" ry="8.5" fill="#FFF"/><circle cx="119" cy="140" r="4" fill="#FFF"/>
                      <ellipse cx="208" cy="128" rx="19" ry="23" fill="${OEIL}"/><ellipse cx="208" cy="131" rx="13" ry="16" fill="#443A6C"/>
                      <ellipse cx="202" cy="119" rx="7" ry="8.5" fill="#FFF"/><circle cx="215" cy="140" r="4" fill="#FFF"/>
                    </g>`;
        } else {
            sourcils = `<path d="M92 102 Q112 92 132 101"  fill="none" stroke="#6E6193" stroke-width="5" stroke-linecap="round" opacity="0.7"/>
                        <path d="M228 102 Q208 92 188 101" fill="none" stroke="#6E6193" stroke-width="5" stroke-linecap="round" opacity="0.7"/>`;
            yeux = `<g class="cp-eyes">
                      <ellipse cx="112" cy="126" rx="19" ry="22" fill="${OEIL}"/><ellipse cx="112" cy="129" rx="13" ry="15" fill="#443A6C"/>
                      <ellipse cx="106" cy="118" rx="7" ry="8.5" fill="#FFF"/><circle cx="119" cy="137" r="3.8" fill="#FFF"/>
                      <ellipse cx="208" cy="126" rx="19" ry="22" fill="${OEIL}"/><ellipse cx="208" cy="129" rx="13" ry="15" fill="#443A6C"/>
                      <ellipse cx="202" cy="118" rx="7" ry="8.5" fill="#FFF"/><circle cx="215" cy="137" r="3.8" fill="#FFF"/>
                    </g>`;
        }

        const BOUCHES = {
            repos:   'M118 214 Q160 232 202 214',
            ravi:    'M112 210 Q160 244 208 210',
            secoue:  'M124 226 Q160 210 196 226',
            assoupi: 'M140 218 Q160 228 180 218'
        };
        const JOUES = { repos: 0.8, ravi: 1, secoue: 0.4, assoupi: 0.55 };

        let signe = '';
        if (etat === 'assoupi') {
            signe = `<text class="cp-zz" x="250" y="86" font-size="46" font-weight="800" fill="#C0A8D8">z</text>
                     <text class="cp-zz cp-zz2" x="268" y="112" font-size="34" font-weight="800" fill="#C0A8D8">z</text>`;
        } else if (etat === 'secoue') {
            signe = `<path class="cp-larme" d="M96 152 C96 152 87.5 166.5 87.5 173.5 A8.5 8.5 0 0 0 104.5 173.5 C104.5 166.5 96 152 96 152 Z" fill="#7FD8E8"/>`;
        } else if (etat === 'ravi') {
            const et = (x, y, r) => `<path d="M${x} ${y - r} Q${x + r * 0.22} ${y - r * 0.22} ${x + r} ${y} Q${x + r * 0.22} ${y + r * 0.22} ${x} ${y + r} Q${x - r * 0.22} ${y + r * 0.22} ${x - r} ${y} Q${x - r * 0.22} ${y - r * 0.22} ${x} ${y - r} Z" fill="#FFE9A8" opacity="0.9"/>`;
            signe = et(66, 78, 13) + et(254, 86, 10);
        }

        return `
            <defs>
                <radialGradient id="mTete${u}" cx="36%" cy="26%" r="82%">
                    <stop offset="0" stop-color="#C3B2CE"/><stop offset="1" stop-color="#8E7C9C"/></radialGradient>
                <radialGradient id="mCorps${u}" cx="40%" cy="22%" r="84%">
                    <stop offset="0" stop-color="#B7A5C4"/><stop offset="1" stop-color="#877694"/></radialGradient>
                <radialGradient id="mPatte${u}" cx="38%" cy="26%" r="80%">
                    <stop offset="0" stop-color="#AA98B8"/><stop offset="1" stop-color="#7D6C8B"/></radialGradient>
                <radialGradient id="mOreille${u}" cx="40%" cy="32%" r="78%">
                    <stop offset="0" stop-color="#B09EBE"/><stop offset="1" stop-color="#8A7897"/></radialGradient>
                <radialGradient id="mRose${u}" cx="44%" cy="36%" r="74%">
                    <stop offset="0" stop-color="#F6C0D6"/><stop offset="1" stop-color="#DE9AB8"/></radialGradient>
                <radialGradient id="mMufle${u}" cx="42%" cy="26%" r="80%">
                    <stop offset="0" stop-color="#D3C0DC"/><stop offset="1" stop-color="#AE9BBB"/></radialGradient>
                <radialGradient id="mReflet${u}">
                    <stop offset="0" stop-color="#FFF" stop-opacity="0.18"/>
                    <stop offset="0.55" stop-color="#FFF" stop-opacity="0.07"/>
                    <stop offset="1" stop-color="#FFF" stop-opacity="0"/></radialGradient>
                <linearGradient id="mDent${u}" x1="0" y1="0" x2="0.6" y2="1">
                    <stop offset="0" stop-color="#FFF6E4"/><stop offset="1" stop-color="#EBD8B4"/></linearGradient>
                <filter id="mFlou${u}" x="-40%" y="-60%" width="180%" height="220%">
                    <feGaussianBlur stdDeviation="9"/></filter>
            </defs>

            <ellipse cx="160" cy="356" rx="84" ry="12" fill="#0d0a22" opacity="0.5"/>

            <g class="cp-body">
              <g class="cp-tail">
                <path d="M214 300 C240 296 252 314 246 330" fill="none" stroke="#7D6C8B" stroke-width="9" stroke-linecap="round"/>
                <path d="M246 326 C254 329 256 337 250 341 C244 344 239 339 242 333 Z" fill="#9B89A9"/>
              </g>

              <!-- Corps plus large que celui de Babi : un hippopotame mince n'existe
                   pas, et c'est la masse qui le distingue au premier coup d'œil. -->
              <ellipse cx="160" cy="296" rx="70" ry="58" fill="url(#mCorps${u})"/>
              <ellipse cx="92"  cy="288" rx="18" ry="23" transform="rotate(-12 92 288)" fill="url(#mPatte${u})"/>
              <ellipse cx="228" cy="288" rx="18" ry="23" transform="rotate(12 228 288)" fill="url(#mPatte${u})"/>
              <ellipse cx="118" cy="336" rx="30" ry="24" fill="url(#mPatte${u})"/>
              <ellipse cx="202" cy="336" rx="30" ry="24" fill="url(#mPatte${u})"/>
              <ellipse cx="102" cy="342" rx="5" ry="6.5" fill="#FFF6E0"/>
              <ellipse cx="118" cy="345" rx="5" ry="6.5" fill="#FFF6E0"/>
              <ellipse cx="134" cy="342" rx="5" ry="6.5" fill="#FFF6E0"/>
              <ellipse cx="186" cy="342" rx="5" ry="6.5" fill="#FFF6E0"/>
              <ellipse cx="202" cy="345" rx="5" ry="6.5" fill="#FFF6E0"/>
              <ellipse cx="218" cy="342" rx="5" ry="6.5" fill="#FFF6E0"/>

              <ellipse cx="160" cy="258" rx="80" ry="18" fill="#3B2F4A" opacity="0.4" filter="url(#mFlou${u})"/>

              ${oreilles}

              <circle cx="160" cy="150" r="92" fill="url(#mTete${u})"/>
              <ellipse cx="124" cy="100" rx="46" ry="29" fill="url(#mReflet${u})"/>

              ${sourcils}
              ${yeux}

              <!-- LE MUFLE — dessiné APRÈS les yeux et débordant du bas de la tête.
                   Rentré dans le cercle et posé sous les yeux, il redeviendrait une
                   simple bouche de nounours et l'espèce se perdrait. -->
              <ellipse cx="160" cy="196" rx="76" ry="48" fill="url(#mMufle${u})"/>
              <ellipse cx="160" cy="178" rx="58" ry="24" fill="#FFF" opacity="0.12"/>
              <ellipse cx="130" cy="174" rx="9.5" ry="12" fill="#6E5F7A" opacity="0.85"/>
              <ellipse cx="190" cy="174" rx="9.5" ry="12" fill="#6E5F7A" opacity="0.85"/>
              <path d="${BOUCHES[etat] || BOUCHES.repos}" fill="none" stroke="#6E5F7A" stroke-width="6" stroke-linecap="round" opacity="0.85"/>
              <!-- Deux dents du bas : le détail qui empêche de lire un cochon. -->
              <path d="M136 226 C133 234 134 240 139 241 C143 241 145 236 143 230 Z" fill="url(#mDent${u})"/>
              <path d="M184 226 C187 234 186 240 181 241 C177 241 175 236 177 230 Z" fill="url(#mDent${u})"/>

              <ellipse cx="88"  cy="152" rx="16" ry="10" fill="#E893B4" opacity="${JOUES[etat] || JOUES.repos}"/>
              <ellipse cx="232" cy="152" rx="16" ry="10" fill="#E893B4" opacity="${JOUES[etat] || JOUES.repos}"/>
            </g>
            ${signe}`;
    }

    /* ======================================================================
       LE PORTRAIT DU COMPAGNON (onglet Profil)
       L'animal dans son halo de couleur, en tête de la carte de profil.

       ⚠ ELLE S'APPELAIT `rang()` ET PORTAIT UNE MÉDAILLE (retirée le 27/08/2026).
       Le disque autour du cou gravait le nombre de badges et prenait la couleur de
       la catégorie — Bronze, Argent, Or. Le système de badges supprimé (voir js/12),
       la médaille ne disait plus rien : elle décorait un rang qui n'existe plus.
       NE PAS LA REMETTRE pour « habiller » le portrait. Ce que l'animal a acquis se
       lit dans son parcours, à côté de lui, et sur sa barre de vie en dessous.

       ⚠ LA COULEUR VIENT DE L'APPELANT, avec l'accent du compagnon pour repli : la
       carte de profil passe la teinte de l'animal (js/12), et c'est la seule chose
       qui reste de l'ancien code couleur.
       ====================================================================== */

    /* infos : { couleur, physique } — `physique` omis, l'état réel de l'animal. */
    function portrait(cible, infos) {
        const el = typeof cible === 'string' ? document.getElementById(cible) : cible;
        if (!el) return;
        infos = infos || {};
        const couleur = infos.couleur || COMPAGNONS[courant].accent;

        el.innerHTML = `
            <svg class="cp-svg cp-rang" viewBox="6 42 308 330" aria-hidden="true">
                <defs>
                    <radialGradient id="cp-halo-grad">
                        <stop offset="0" stop-color="${couleur}" stop-opacity="0.45"/>
                        <stop offset="0.65" stop-color="${couleur}" stop-opacity="0.16"/>
                        <stop offset="1" stop-color="${couleur}" stop-opacity="0"/>
                    </radialGradient>
                </defs>
                <circle class="cp-halo" cx="160" cy="170" r="152" fill="url(#cp-halo-grad)"/>
                ${COMPAGNONS[courant].interieur('ravi', infos.physique || physiqueCourant())}
            </svg>`;
    }

    /* ======================================================================
       LE DÉCOR
       Le score de la semaine sous forme de paysage : un motif lumineux par défi
       bouclé, un pointillé par défi restant, et le compagnon posé au milieu.

       ⚠ RIEN NE MEURT ICI. Une semaine ratée ne fait rien faner, elle ne fait
       juste rien pousser de plus : les pointillés sont une ATTENTE, pas un
       reproche. C'est la règle de voix des compagnons — constater sans
       culpabiliser. Ne pas ajouter de motif fané, de compteur qui redescend ni
       de couleur d'alerte, dans aucun décor.

       ⚠ CHAQUE ESPÈCE A LE SIEN, et ce n'est pas une décoration : la clairière
       appartient à ROUKI dans la troupe (maquette 2026), pas à Babi. Babi a le
       point d'eau, Bulle le fleuve, Titi la canopée. Un compagnon dans le décor
       d'un autre, c'est la première chose qui se remarque.

       Ce module ne calcule rien : il reçoit `pousses` et `total` déjà faits par
       js/12-gamification.js.
       ====================================================================== */

    /* La planche est plus haute que le paysage : les ~28 px du bas sont une
       bande de premier plan laissée VIDE pour la légende. Sans elle, le titre se
       posait sur les motifs et sur le compagnon. */
    const CL_L = 354, CL_H = 196, CL_SOL = 168;

    /* Les emplacements sont FIXES et parcourus dans l'ordre : le premier motif
       sort toujours au même endroit d'une semaine à l'autre. Tirés au hasard, on
       ne verrait jamais que le paysage progresse. */
    const CL_SOL_PLACES = [
        { x: 54,  y: 140, teinte: '#6FE3A0' }, { x: 96,  y: 146, teinte: '#7FD8E8' },
        { x: 254, y: 139, teinte: '#A88BFF' }, { x: 298, y: 145, teinte: '#FFB35C' },
        { x: 332, y: 136, teinte: '#7FD8E8' }, { x: 214, y: 148, teinte: '#6FE3A0' }
    ];
    /* La canopée suspend ses motifs : ils PENDENT d'une branche au lieu de
       sortir du sol. C'est la seule raison pour laquelle les emplacements sont
       propres au décor et non partagés. */
    const CL_HAUT_PLACES = [
        { x: 46,  y: 46, teinte: '#FFB35C' }, { x: 92,  y: 38, teinte: '#6FE3A0' },
        { x: 262, y: 42, teinte: '#FFE08A' }, { x: 306, y: 36, teinte: '#6FE3A0' },
        { x: 336, y: 48, teinte: '#FFB35C' }, { x: 218, y: 34, teinte: '#7FD8E8' }
    ];

    const clFlou = (pl, dy, r) =>
        `<circle cx="${pl.x}" cy="${pl.y + dy}" r="${r}" fill="${pl.teinte}" opacity="0.22" filter="url(#cl-flou)"/>`;
    const clAnim = (pl, i) =>
        `class="cl-pl" style="transform-origin: ${pl.x}px ${pl.y}px; animation-delay: ${(i * 1.1).toFixed(1)}s"`;

    const DECORS = {
        /* --------------------------------------------------------- BABI */
        point_eau: {
            titre: "Ton point d'eau",
            ciel: ['#2B2050', '#1B3A48'],
            lune: { x: 300, y: 34, r: 16 },
            places: CL_SOL_PLACES,
            fond: () => `
                <path d="M0 128 C60 116 120 124 178 120 C240 116 300 126 354 118 L354 ${CL_H} L0 ${CL_H} Z" fill="#243F4C"/>
                <ellipse cx="177" cy="166" rx="150" ry="30" fill="#12303F"/>
                <ellipse cx="177" cy="164" rx="150" ry="30" fill="#1B4356" opacity="0.85"/>
                <path d="M52 158 C82 154 110 160 140 156 M196 170 C226 166 258 172 292 168"
                      stroke="#5A93A8" stroke-width="1.6" fill="none" opacity="0.5" stroke-linecap="round"/>
                <ellipse cx="300" cy="160" rx="13" ry="4" fill="#FFE9B8" opacity="0.28"/>`,
            /* Un roseau : tige droite et massette. C'est la plante du bord de
               l'eau, celle qui dit « point d'eau » sans qu'on écrive le mot. */
            pousse: (pl, i) => `<g ${clAnim(pl, i)}>
                <path d="M${pl.x} ${pl.y} L${pl.x} ${pl.y - 30}" stroke="${pl.teinte}" stroke-width="2.6" stroke-linecap="round"/>
                <rect x="${pl.x - 3.4}" y="${pl.y - 40}" width="6.8" height="14" rx="3.4" fill="${pl.teinte}"/>
                <path d="M${pl.x} ${pl.y - 12} C${pl.x - 11} ${pl.y - 16} ${pl.x - 15} ${pl.y - 24} ${pl.x - 13} ${pl.y - 31}"
                      stroke="${pl.teinte}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity="0.8"/>
                ${clFlou(pl, -34, 9)}</g>`,
            graine: (pl) => `<g opacity="0.4">
                <path d="M${pl.x} ${pl.y - 2} L${pl.x} ${pl.y - 12}" stroke="#8B7BAE" stroke-width="2.4" stroke-linecap="round" stroke-dasharray="3 3"/>
                <rect x="${pl.x - 3}" y="${pl.y - 22}" width="6" height="10" rx="3" fill="none" stroke="#8B7BAE" stroke-width="1.8" stroke-dasharray="3 3"/></g>`
        },

        /* -------------------------------------------------------- BULLE */
        fleuve: {
            titre: 'Ton fleuve',
            ciel: ['#25234E', '#1C4450'],
            lune: { x: 300, y: 34, r: 16 },
            places: CL_SOL_PLACES,
            /* Le fleuve traverse toute la planche : c'est une BANDE, pas une
               mare. Un plan d'eau fermé, c'est le point d'eau de Babi. */
            fond: () => `
                <path d="M0 118 C70 108 140 118 210 112 C270 107 316 116 354 110 L354 132 L0 132 Z" fill="#22414E"/>
                <rect x="0" y="128" width="${CL_L}" height="${CL_H - 128}" fill="#123642"/>
                <rect x="0" y="128" width="${CL_L}" height="42" fill="#1D5566" opacity="0.9"/>
                <path d="M0 142 C60 138 96 146 152 142 C210 138 260 146 354 140" stroke="#63A8BC" stroke-width="1.8" fill="none" opacity="0.55"/>
                <path d="M0 158 C70 154 120 162 186 158 C250 154 300 162 354 156" stroke="#63A8BC" stroke-width="1.5" fill="none" opacity="0.4"/>
                <path d="M0 174 C80 170 130 178 200 174 C264 170 310 178 354 172" stroke="#63A8BC" stroke-width="1.3" fill="none" opacity="0.28"/>`,
            /* Un nénuphar : la feuille ronde fendue, et la fleur qui s'ouvre. */
            pousse: (pl, i) => `<g ${clAnim(pl, i)}>
                <path d="M${pl.x} ${pl.y} m -15 0 a 15 7 0 1 0 30 0 a 15 7 0 1 0 -30 0" fill="${pl.teinte}" opacity="0.55"/>
                <path d="M${pl.x} ${pl.y} L${pl.x + 15} ${pl.y - 3}" stroke="#123642" stroke-width="2.2"/>
                <path d="M${pl.x} ${pl.y - 4} C${pl.x - 7} ${pl.y - 10} ${pl.x - 5} ${pl.y - 18} ${pl.x} ${pl.y - 20}
                         C${pl.x + 5} ${pl.y - 18} ${pl.x + 7} ${pl.y - 10} ${pl.x} ${pl.y - 4} Z" fill="${pl.teinte}"/>
                ${clFlou(pl, -14, 9)}</g>`,
            graine: (pl) => `<g opacity="0.4">
                <path d="M${pl.x} ${pl.y} m -12 0 a 12 6 0 1 0 24 0 a 12 6 0 1 0 -24 0"
                      fill="none" stroke="#8B7BAE" stroke-width="1.8" stroke-dasharray="3 3"/></g>`
        },

        /* --------------------------------------------------------- TITI */
        canopee: {
            titre: 'Ta canopée',
            ciel: ['#2A1F45', '#123A2E'],
            lune: { x: 316, y: 104, r: 11 }, luneDevant: true,
            places: CL_HAUT_PLACES,
            /* La branche est en HAUT et les fruits pendent dessous : c'est
               l'inverse de tous les autres décors, et c'est ce qui fait la
               canopée. Le sol reste sombre et vide — on est dans les arbres. */
            fond: () => `
                <path d="M0 22 C70 30 130 18 200 26 C260 33 310 22 354 28" stroke="#4A3A2A" stroke-width="9" fill="none" stroke-linecap="round"/>
                <g fill="#1F4A38" opacity="0.9">
                  <ellipse cx="34" cy="16" rx="46" ry="24"/><ellipse cx="150" cy="10" rx="58" ry="26"/>
                  <ellipse cx="286" cy="14" rx="52" ry="24"/></g>
                <path d="M0 150 C70 142 130 152 200 146 C260 141 310 150 354 144 L354 ${CL_H} L0 ${CL_H} Z" fill="#173026"/>
                <path d="M0 166 C80 160 140 168 210 163 C268 159 312 167 354 161 L354 ${CL_H} L0 ${CL_H} Z" fill="#11241D"/>`,
            /* Un fruit suspendu : tige courte vers le HAUT, boule en dessous. */
            pousse: (pl, i) => `<g ${clAnim(pl, i)}>
                <path d="M${pl.x} ${pl.y} L${pl.x} ${pl.y + 14}" stroke="#4A3A2A" stroke-width="2.4" stroke-linecap="round"/>
                <circle cx="${pl.x}" cy="${pl.y + 23}" r="9" fill="${pl.teinte}"/>
                <ellipse cx="${pl.x - 3}" cy="${pl.y + 20}" rx="3" ry="2.2" fill="#FFF" opacity="0.45"/>
                <path d="M${pl.x} ${pl.y + 13} C${pl.x + 8} ${pl.y + 10} ${pl.x + 12} ${pl.y + 15} ${pl.x + 10} ${pl.y + 19}"
                      stroke="#6FE3A0" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.75"/>
                ${clFlou(pl, 23, 11)}</g>`,
            graine: (pl) => `<g opacity="0.4">
                <path d="M${pl.x} ${pl.y} L${pl.x} ${pl.y + 12}" stroke="#8B7BAE" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="3 3"/>
                <circle cx="${pl.x}" cy="${pl.y + 20}" r="6" fill="none" stroke="#8B7BAE" stroke-width="1.8" stroke-dasharray="3 3"/></g>`
        }
    };

    /* Le rocher éclaire son décor par le CIEL : ses emplacements sont donc en
       haut, et écartés de la bande où le compagnon est posé (x 146 à 220) — une
       étoile derrière Zola serait invisible. */
    const CL_CIEL_PLACES = [
        { x: 36, y: 44, teinte: '#FFE9A8' }, { x: 74, y: 66, teinte: '#FFF0DC' },
        { x: 112, y: 34, teinte: '#FFD76B' }, { x: 244, y: 34, teinte: '#FFE9A8' },
        { x: 282, y: 58, teinte: '#FFF0DC' }, { x: 318, y: 40, teinte: '#FFD76B' }
    ];
    /* L'arbre pousse ses feuilles sur ses branches, donc de part et d'autre du
       tronc et à des hauteurs différentes. */
    const CL_ARBRE_PLACES = [
        { x: 62, y: 62, teinte: '#6FE3A0' }, { x: 100, y: 98, teinte: '#8DE8B4' },
        { x: 40, y: 112, teinte: '#6FE3A0' }, { x: 262, y: 66, teinte: '#8DE8B4' },
        { x: 300, y: 102, teinte: '#6FE3A0' }, { x: 324, y: 136, teinte: '#8DE8B4' }
    ];

    DECORS.rocher = {
        titre: 'Ton rocher',
        ciel: ['#1E1838', '#2A2A44'],
        lune: { x: 58, y: 106, r: 14 },
        places: CL_CIEL_PLACES,
        fond: () => `
            <path d="M0 176 L58 116 L104 152 L150 104 L214 150 L262 118 L354 172 L354 ${CL_H} L0 ${CL_H} Z" fill="#2E2A46"/>
            <path d="M0 186 L74 140 L128 168 L188 132 L248 166 L310 140 L354 182 L354 ${CL_H} L0 ${CL_H} Z" fill="#221F35"/>
            <path d="M150 104 L214 150 L188 132 Z" fill="#3A3556" opacity="0.8"/>`,
        /* Une étoile qui s'allume — pas une plante. Rien ne pousse sur un rocher
           la nuit, et forcer une pousse ici sonnerait faux. */
        pousse: (pl, i) => `<g ${clAnim(pl, i)}>
            <path d="M${pl.x} ${pl.y - 11} Q${pl.x + 2.4} ${pl.y - 2.4} ${pl.x + 11} ${pl.y} Q${pl.x + 2.4} ${pl.y + 2.4} ${pl.x} ${pl.y + 11} Q${pl.x - 2.4} ${pl.y + 2.4} ${pl.x - 11} ${pl.y} Q${pl.x - 2.4} ${pl.y - 2.4} ${pl.x} ${pl.y - 11} Z" fill="${pl.teinte}"/>
            ${clFlou(pl, 0, 12)}</g>`,
        graine: (pl) => `<g opacity="0.4"><circle cx="${pl.x}" cy="${pl.y}" r="6" fill="none" stroke="#8B7BAE" stroke-width="1.8" stroke-dasharray="3 3"/></g>`
    };

    DECORS.arbre = {
        titre: 'Ton arbre',
        ciel: ['#2B2050', '#1E4034'],
        lune: { x: 300, y: 34, r: 15 },
        places: CL_ARBRE_PLACES,
        /* Le tronc et les branches sont NUS : ce sont les feuilles qui arrivent.
           Un arbre déjà feuillu ne pourrait plus grandir, et c'est tout le sujet. */
        fond: () => `
            <g stroke="#4A3A2A" fill="none" stroke-linecap="round">
              <path d="M62 ${CL_H} L62 118" stroke-width="9"/>
              <path d="M62 118 C58 92 52 74 40 62" stroke-width="6"/>
              <path d="M62 126 C74 108 90 100 104 98" stroke-width="6"/>
              <path d="M62 134 C56 126 48 120 40 118" stroke-width="5"/>
              <path d="M292 ${CL_H} L292 116" stroke-width="9"/>
              <path d="M292 116 C288 92 278 74 264 66" stroke-width="6"/>
              <path d="M292 124 C296 108 300 104 302 102" stroke-width="6"/>
              <path d="M292 134 C304 132 316 138 324 140" stroke-width="5"/>
            </g>
            <path d="M0 150 C70 142 130 152 200 146 C260 141 310 150 354 144 L354 ${CL_H} L0 ${CL_H} Z" fill="#1E4436"/>
            <path d="M0 166 C80 160 140 168 210 163 C268 159 312 167 354 161 L354 ${CL_H} L0 ${CL_H} Z" fill="#17352A"/>`,
        pousse: (pl, i) => `<g ${clAnim(pl, i)}>
            <path d="M${pl.x} ${pl.y} C${pl.x - 12} ${pl.y - 4} ${pl.x - 16} ${pl.y - 14} ${pl.x - 12} ${pl.y - 22}
                     C${pl.x - 2} ${pl.y - 20} ${pl.x + 2} ${pl.y - 8} ${pl.x} ${pl.y} Z" fill="${pl.teinte}"/>
            <path d="M${pl.x} ${pl.y} L${pl.x - 11} ${pl.y - 20}" stroke="#1E4436" stroke-width="1.6" opacity="0.6"/>
            ${clFlou(pl, -14, 9)}</g>`,
        graine: (pl) => `<g opacity="0.4">
            <path d="M${pl.x} ${pl.y} C${pl.x - 10} ${pl.y - 4} ${pl.x - 13} ${pl.y - 12} ${pl.x - 10} ${pl.y - 18}
                     C${pl.x - 2} ${pl.y - 16} ${pl.x + 1} ${pl.y - 7} ${pl.x} ${pl.y} Z"
                  fill="none" stroke="#8B7BAE" stroke-width="1.8" stroke-dasharray="3 3"/></g>`
    };

    DECORS.jungle = {
        titre: 'Ta jungle',
        ciel: ['#231A3E', '#102E28'],
        lune: { x: 118, y: 84, r: 13 }, luneDevant: true,
        places: CL_SOL_PLACES,
        /* La jungle se referme par le HAUT et par les CÔTÉS : c'est cet
           encadrement, plus que la couleur, qui la distingue de la canopée de
           Titi — chez lui on est DANS les arbres, ici on est dessous. */
        fond: () => `
            <g fill="#153A2E" opacity="0.95">
              <ellipse cx="20" cy="30" rx="56" ry="34"/><ellipse cx="130" cy="12" rx="66" ry="28"/>
              <ellipse cx="250" cy="18" rx="58" ry="30"/><ellipse cx="348" cy="46" rx="50" ry="38"/>
              <ellipse cx="6" cy="104" rx="34" ry="42"/></g>
            <path d="M0 136 C60 126 120 134 178 130 C240 126 300 136 354 128 L354 ${CL_H} L0 ${CL_H} Z" fill="#1A4033"/>
            <path d="M0 154 C70 146 130 156 200 150 C262 145 312 154 354 148 L354 ${CL_H} L0 ${CL_H} Z" fill="#123027"/>`,
        /* Une fleur qui S'OUVRE : quatre pétales et un cœur. Ce sont les fleurs
           de nuit qui font la jungle nocturne, pas la végétation. */
        pousse: (pl, i) => `<g ${clAnim(pl, i)}>
            <path d="M${pl.x} ${pl.y} L${pl.x} ${pl.y - 16}" stroke="#2E6B52" stroke-width="2.4" stroke-linecap="round"/>
            <g transform="translate(${pl.x} ${pl.y - 22})" fill="${pl.teinte}">
              <ellipse cx="0" cy="-7" rx="4.6" ry="7"/><ellipse cx="0" cy="7" rx="4.6" ry="7"/>
              <ellipse cx="-7" cy="0" rx="7" ry="4.6"/><ellipse cx="7" cy="0" rx="7" ry="4.6"/></g>
            <circle cx="${pl.x}" cy="${pl.y - 22}" r="3.4" fill="#FFE9A8"/>
            ${clFlou(pl, -22, 11)}</g>`,
        graine: (pl) => `<g opacity="0.4">
            <path d="M${pl.x} ${pl.y} L${pl.x} ${pl.y - 12}" stroke="#8B7BAE" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="3 3"/>
            <circle cx="${pl.x}" cy="${pl.y - 20}" r="7" fill="none" stroke="#8B7BAE" stroke-width="1.8" stroke-dasharray="3 3"/></g>`
    };

    DECORS.lisiere = {
        titre: 'Ta lisière',
        ciel: ['#2A1F44', '#3A2A38'],
        lune: { x: 296, y: 38, r: 15 },
        places: CL_SOL_PLACES,
        /* LA LISIÈRE, ET NON UNE FORÊT. C'est un BORD : les troncs occupent la
           moitié gauche et s'arrêtent net, le reste est ouvert. Un rideau
           d'arbres sur toute la largeur donnerait la canopée de Titi vue d'en
           bas, et deux décors qui se ressemblent ne valent pas mieux qu'un.
           C'est aussi ce que Sam est : ni tout à fait dans le bois, ni dehors. */
        fond: () => `
            <g fill="#2C2440">
              <rect x="14" y="0" width="17" height="150" rx="6"/>
              <rect x="52" y="0" width="12" height="138" rx="5"/>
              <rect x="84" y="0" width="20" height="156" rx="7"/>
              <rect x="126" y="0" width="10" height="132" rx="4"/>
            </g>
            <g fill="#241D36" opacity="0.9">
              <ellipse cx="26" cy="26" rx="46" ry="30"/><ellipse cx="96" cy="16" rx="52" ry="26"/>
              <ellipse cx="146" cy="34" rx="34" ry="20"/></g>
            <path d="M0 148 C60 140 120 150 178 145 C240 140 300 149 354 142 L354 ${CL_H} L0 ${CL_H} Z" fill="#3E3320"/>
            <path d="M0 168 C80 162 140 170 210 164 C268 159 312 168 354 162 L354 ${CL_H} L0 ${CL_H} Z" fill="#2E2618"/>
            <!-- Les fougères du bord : basses, larges, du côté des arbres. Elles
                 disent l'ourlet du bois sans fermer l'horizon.
                 ⚠ ELLES POUSSENT SUR LA LIGNE DE SOL (CL_SOL = 168), PAS DEPUIS LE
                 BAS DU CADRE : parties de ${CL_H}, elles montaient depuis la terre
                 sombre du premier plan et se lisaient comme des brindilles tombées.
                 Une plante s'enracine à l'horizon, là où le sol commence. -->
            <g stroke="#3F5A34" stroke-width="2.6" fill="none" stroke-linecap="round" opacity="0.8">
              <path d="M26 ${CL_SOL} C24 158 30 148 40 142 M26 160 C16 157 10 151 8 144 M26 152 C34 150 40 145 42 139"/>
              <path d="M108 ${CL_SOL} C107 160 114 151 124 146 M108 161 C99 158 94 153 92 147"/>
            </g>`,
        /* Une BAIE sur sa tige — ni fleur ni feuille, les deux sont déjà prises
           (jungle, arbre). C'est aussi ce qu'on ramasse à la lisière. */
        pousse: (pl, i) => `<g ${clAnim(pl, i)}>
            <path d="M${pl.x} ${pl.y} C${pl.x - 3} ${pl.y - 12} ${pl.x + 2} ${pl.y - 18} ${pl.x} ${pl.y - 26}"
                  stroke="#4A6B3A" stroke-width="2.4" fill="none" stroke-linecap="round"/>
            <path d="M${pl.x} ${pl.y - 14} C${pl.x - 12} ${pl.y - 16} ${pl.x - 15} ${pl.y - 23} ${pl.x - 12} ${pl.y - 29}
                     C${pl.x - 3} ${pl.y - 27} ${pl.x + 1} ${pl.y - 20} ${pl.x} ${pl.y - 14} Z" fill="#4A6B3A" opacity="0.85"/>
            <circle cx="${pl.x - 5}" cy="${pl.y - 30}" r="5.2" fill="${pl.teinte}"/>
            <circle cx="${pl.x + 5}" cy="${pl.y - 34}" r="4.4" fill="${pl.teinte}"/>
            <circle cx="${pl.x + 1}" cy="${pl.y - 40}" r="3.6" fill="${pl.teinte}"/>
            ${clFlou(pl, -34, 11)}</g>`,
        graine: (pl) => `<g opacity="0.4">
            <path d="M${pl.x} ${pl.y} L${pl.x} ${pl.y - 20}" stroke="#8B7BAE" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="3 3"/>
            <circle cx="${pl.x}" cy="${pl.y - 28}" r="6" fill="none" stroke="#8B7BAE" stroke-width="1.8" stroke-dasharray="3 3"/></g>`
    };

    /* La planche seule, sans légende, pour un compagnon donné.
       Extraite de clairiere() le 25/08/2026 : la fiche d'un animal sauvé
       (js/23) montre exactement ce paysage-là, et il ne peut pas y avoir deux
       versions du même décor à tenir d'accord. C'est aussi pour elle que le
       compagnon est un PARAMÈTRE : on regarde le fleuve de Bulle sans cesser
       d'être avec Babi.
       ⚠ Les ids des `<defs>` sont suffixés par instance : deux planches sur la
       même page — la fiche par-dessus le carnet — se voleraient leurs dégradés,
       et la seconde hériterait du ciel de la première. */
    function clairierePlanche(cle, pousses, total) {
        const c = COMPAGNONS[cle] || COMPAGNONS[courant];
        const d = DECORS[c.decor] || DECORS.point_eau;
        const u = '-cl' + (++_instance);

        const motifs = d.places.slice(0, total)
            .map((pl, i) => i < pousses ? d.pousse(pl, i) : d.graine(pl)).join('');

        /* Le compagnon est posé au milieu de son décor, à 0,24 : à l'échelle 1 il
           ferait plus que la hauteur entière de la planche. */
        const perso = `<g transform="translate(144.6,35.9) scale(0.24)">${c.interieur('repos')}</g>`;

        const l = d.lune;
        const lune = !l ? '' :
            `<circle cx="${l.x}" cy="${l.y}" r="${l.r}" fill="#FFE9B8" opacity="0.85"/>
              <circle cx="${l.x}" cy="${l.y}" r="${l.r * 1.9}" fill="#FFE9B8" opacity="0.16" filter="url(#cl-flou${u})"/>`;

        return `
            <svg class="cl-svg" viewBox="0 0 ${CL_L} ${CL_H}" aria-hidden="true">
                <defs>
                    <linearGradient id="cl-ciel${u}" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stop-color="${d.ciel[0]}"/><stop offset="1" stop-color="${d.ciel[1]}"/>
                    </linearGradient>
                    <filter id="cl-flou${u}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="4"/></filter>
                    <linearGradient id="cl-voile${u}" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0" stop-color="#0F0A20" stop-opacity="0"/>
                        <stop offset="1" stop-color="#0F0A20" stop-opacity="0.55"/>
                    </linearGradient>
                </defs>
                <rect width="${CL_L}" height="${CL_H}" fill="url(#cl-ciel${u})"/>
                ${d.luneDevant ? '' : lune}
                <g fill="#FFF0DC" opacity="0.6">
                    <circle cx="40" cy="26" r="1.4"/><circle cx="96" cy="46" r="1.1"/>
                    <circle cx="160" cy="22" r="1.3"/><circle cx="238" cy="52" r="1.1"/>
                </g>
                ${d.fond()}
                ${d.luneDevant ? lune : ''}
                ${motifs}
                <g fill="#FFE9B8">
                    <circle class="cl-ff" cx="150" cy="120" r="2"/>
                    <circle class="cl-ff" cx="200" cy="132" r="1.6" style="animation-delay:2s"/>
                    <circle class="cl-ff" cx="176" cy="110" r="1.8" style="animation-delay:4s"/>
                </g>
                ${perso}
                <rect x="0" y="${CL_SOL - 30}" width="${CL_L}" height="${CL_H - CL_SOL + 30}" fill="url(#cl-voile${u})"/>
            </svg>`;
    }

    /* Combien de motifs porte un décor : la fiche d'un animal libéré les allume
       tous, un paysage à moitié en pointillés dirait qu'il lui manque quelque
       chose. */
    function decorPlaces(cle) {
        const c = COMPAGNONS[cle] || COMPAGNONS[courant];
        return ((DECORS[c.decor] || DECORS.point_eau).places || []).length;
    }

    /* infos : { pousses, total, scoreEco (nombre, ou null si aucun trajet) } */
    function clairiere(cible, infos) {
        const el = typeof cible === 'string' ? document.getElementById(cible) : cible;
        if (!el) return;
        infos = infos || {};

        const d = DECORS[COMPAGNONS[courant].decor] || DECORS.point_eau;
        const total   = Math.max(1, Math.min(d.places.length, infos.total || 0));
        const pousses = Math.max(0, Math.min(total, infos.pousses || 0));

        const eco = (infos.scoreEco === null || infos.scoreEco === undefined)
            ? ''
            : `<div class="cl-eco">Score éco ${Math.round(infos.scoreEco)}</div>`;

        /* ⚠ LA FONCTION POSE ELLE-MÊME LE CADRE (25/08/2026). `.cl-legende` est en
           `position: absolute` : sans `.clairiere` sur l'hôte — donc sans
           `position: relative` — elle ne se cale plus sur le dessin mais sur le
           premier ancêtre positionné, c'est-à-dire, le plus souvent, la PAGE.
           Le titre du décor partait alors se coller n'importe où, très loin du
           paysage, et le cadre arrondi ne rognait plus le SVG. C'était le cas de
           la planche de contrôle, qui appelait avec un `<div>` nu.
           Une fonction qui écrit un contenu positionné doit garantir son propre
           référentiel, plutôt que de compter sur l'appelant pour le savoir. */
        el.classList.add('clairiere');

        el.innerHTML = `
            ${clairierePlanche(courant, pousses, total)}
            <div class="cl-legende">
                <div>
                    <div class="cl-titre">${d.titre}</div>
                    <div class="cl-sous">${phrase('clairiere', { pousses: pousses, total: total })}</div>
                </div>
                ${eco}
            </div>`;
    }
    /* ======================================================================
       LE PARCOURS — trois étapes, une par mission bouclée
       ----------------------------------------------------------------------
       Le badge hebdomadaire laissait un compteur ; le parcours laisse une
       histoire :
         1. Le Sauvetage        — le compagnon est en cage, il faut l'en sortir
         2. La Grande Échappée  — la remorque, il quitte l'endroit
         3. Le Grand Envol      — son décor, on le laisse partir

       ⚠ Ce module ne compte RIEN. C'est js/12-gamification.js qui tient les
       missions bouclées et passe ici `etape` et `libre` déjà calculés — la
       règle de l'en-tête du fichier vaut aussi pour le parcours.

       ⚠ Les étapes 1 et 2 se passent AILLEURS que dans le décor du compagnon :
       une cage posée au bord de son point d'eau dirait qu'il y est déjà. Elles
       ont donc une nuit neutre, et seule l'étape 3 ouvre sur le décor. C'est
       cette bascule de fond qui fait l'arrivée — pas les objets dessinés.

       ⚠ RIEN NE RECULE. Une semaine ratée ne renvoie personne en cage, et le
       changement de semaine non plus : un animal laissé à l'étape 2 y est
       encore lundi, les missions suivantes reprennent où il en était. Même
       règle que les pousses de la clairière, pour la même raison — constater
       sans culpabiliser.
       ====================================================================== */

    /* Même planche que la clairière : le bloc occupe la même place dans le
       carnet et hérite de son CSS (`.clairiere`, `.cl-svg`, `.cl-legende`). */
    const PARC_ETAPES = [
        { titre: 'Le Sauvetage',       sous: "Ouvrir la cage." },
        { titre: 'La Grande Échappée', sous: "Le sortir d'ici." },
        { titre: 'Le Grand Envol',     sous: "Le rendre à son décor." }
    ];
    const PARC_SAUVE = { titre: 'Sauvé', sous: "Il est chez lui. Tu peux en sortir un autre." };

    /* Les objets (cage, attelage) sont dessinés dans un repère à eux, 300 × 210
       avec le sol à 172 — celui des esquisses d'origine. Cette translation les
       recale sur la planche du carnet sans avoir à retoucher un seul chiffre
       des dessins. */
    const PARC_POSE = 'translate(27,-4)';

    /* Le compagnon vit dans le repère 6..314 × 42..372, pieds vers 356 : on le
       pose donc par son CENTRE et sa LIGNE DE SOL, jamais par son coin. */
    function parcAnimal(etat, s, cx, baseY, cle) {
        const c = COMPAGNONS[cle] || COMPAGNONS[courant];
        return `<g transform="translate(${(cx - 160 * s).toFixed(1)},${(baseY - 356 * s).toFixed(1)}) scale(${s})">${c.interieur(etat)}</g>`;
    }

    function parcDefs(u) {
        return `
            <linearGradient id="paMetal${u}" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0" stop-color="#5E6789"/><stop offset="0.45" stop-color="#9AA3C4"/>
                <stop offset="1" stop-color="#596183"/>
            </linearGradient>
            <filter id="paFlou${u}" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="5"/></filter>
            <linearGradient id="paVoile${u}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#0F0A20" stop-opacity="0"/>
                <stop offset="1" stop-color="#0F0A20" stop-opacity="0.55"/>
            </linearGradient>`;
    }

    /* La nuit neutre des étapes 1 et 2 : ni roseaux, ni fleuve, ni canopée.
       C'est un nulle part, et c'est voulu — on n'est pas encore arrivé. */
    function parcNuit(u) {
        return `
            <linearGradient id="paCiel${u}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="#2B2050"/><stop offset="1" stop-color="#1B3A48"/>
            </linearGradient>`;
    }

    function parcNuitFond(u) {
        return `
            <rect width="${CL_L}" height="${CL_H}" fill="url(#paCiel${u})"/>
            <circle cx="300" cy="32" r="14" fill="#FFE9B8" opacity="0.85"/>
            <circle cx="300" cy="32" r="27" fill="#FFE9B8" opacity="0.15" filter="url(#paFlou${u})"/>
            <g fill="#FFF0DC" opacity="0.55">
                <circle cx="40" cy="26" r="1.4"/><circle cx="96" cy="46" r="1.1"/>
                <circle cx="160" cy="22" r="1.3"/><circle cx="238" cy="52" r="1.1"/>
            </g>
            <path d="M0 134 C60 124 120 138 180 130 C240 122 300 136 354 128 L354 ${CL_H} L0 ${CL_H} Z" fill="#243F4C" opacity="0.75"/>
            <rect x="0" y="${CL_SOL}" width="${CL_L}" height="${CL_H - CL_SOL}" fill="#1B3340"/>`;
    }

    /* ÉTAPE 1 — la cage. Barreaux droits, métal froid, cadenas FERMÉ : l'anse
       rentre des deux côtés dans le boîtier. Ouverte, elle dirait que la porte
       l'est aussi, et l'étape n'aurait plus rien à débloquer.
       Le compagnon est « secoué » — c'est le seul écran du parcours où il ne va
       pas bien. */
    function parcCage(u, cle) {
        const barreaux = Array.from({ length: 9 }, function (_, i) {
            return `<rect x="${72 + i * 19.5}" y="52" width="5" height="110" rx="2.5" fill="url(#paMetal${u})"/>`;
        }).join('');
        return `<g transform="${PARC_POSE}">
            <ellipse cx="150" cy="172" rx="96" ry="7" fill="#0d0a22" opacity="0.5"/>
            <rect x="62" y="50" width="176" height="114" fill="#141B2E"/>
            <path d="M70 158 L104 150 M112 159 L146 151 M156 158 L190 150 M198 159 L226 152"
                  stroke="#C9A46A" stroke-width="3" stroke-linecap="round" opacity="0.5"/>
            ${parcAnimal('secoue', 0.33, 150, 162, cle)}
            ${barreaux}
            <rect x="56" y="40" width="188" height="14" rx="7" fill="url(#paMetal${u})"/>
            <rect x="56" y="158" width="188" height="12" rx="6" fill="url(#paMetal${u})"/>
            <rect x="56" y="40" width="14" height="130" rx="7" fill="url(#paMetal${u})"/>
            <rect x="230" y="40" width="14" height="130" rx="7" fill="url(#paMetal${u})"/>
            <path d="M142 110 L142 100 A8 8 0 0 1 158 100 L158 110"
                  fill="none" stroke="#C9C2E6" stroke-width="5" stroke-linecap="round"/>
            <rect x="134" y="107" width="32" height="26" rx="7" fill="#FFB35C"/>
            <circle cx="150" cy="118" r="3.6" fill="#7A4E1C"/>
            <path d="M150 120 L150 126" stroke="#7A4E1C" stroke-width="3" stroke-linecap="round"/>
        </g>`;
    }

    /* ÉTAPE 2 — l'attelage. Remorque OUVERTE, tête au-dessus du bastingage,
       oreilles au vent : sorti de la cage, il ne repart pas dans une autre
       boîte. C'est ce qui fait de l'étape 2 une bonne nouvelle et pas un
       simple transfert. */
    function parcVehicule(u, cle) {
        const roue = function (cx, cy, r) {
            return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#2A2440"/>
                    <circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="#6E6599"/>
                    <circle cx="${cx}" cy="${cy}" r="${r * 0.22}" fill="#C3AEFF"/>`;
        };
        return `<g transform="${PARC_POSE}">
            <ellipse cx="146" cy="178" rx="120" ry="7" fill="#0d0a22" opacity="0.5"/>
            <rect x="40" y="118" width="140" height="12" rx="4" fill="#4E5A7C"/>
            <clipPath id="paRem${u}"><rect x="20" y="20" width="180" height="102"/></clipPath>
            <g clip-path="url(#paRem${u})">${parcAnimal('ravi', 0.30, 108, 154, cle)}</g>
            <rect x="44" y="98" width="132" height="24" rx="5" fill="#6E6599"/>
            <rect x="44" y="98" width="132" height="7" rx="3.5" fill="#8E85BF"/>
            <path d="M60 104 L60 120 M96 104 L96 120 M132 104 L132 120 M164 104 L164 120"
                  stroke="#4F4877" stroke-width="3" opacity="0.6"/>
            <path d="M176 112 L200 106" stroke="#8A93B5" stroke-width="5" stroke-linecap="round"/>
            <path d="M196 118 L196 82 C196 74 202 68 210 68 L240 68 L262 94 L272 96 C278 98 282 104 282 110 L282 118 Z" fill="#3F6B62"/>
            <path d="M212 74 L236 74 L254 92 L212 92 Z" fill="#9FD8E8" opacity="0.85"/>
            <rect x="196" y="60" width="86" height="8" rx="4" fill="#2E5049"/>
            <path d="M204 60 L204 54 M274 60 L274 54" stroke="#2E5049" stroke-width="5" stroke-linecap="round"/>
            <rect x="196" y="114" width="86" height="8" rx="4" fill="#2E5049"/>
            <circle cx="278" cy="102" r="5" fill="#FFE08A"/>
            <circle cx="278" cy="102" r="13" fill="#FFE08A" opacity="0.2" filter="url(#paFlou${u})"/>
            ${roue(78, 144, 20)}${roue(160, 144, 20)}${roue(216, 144, 22)}${roue(268, 144, 22)}
        </g>`;
    }

    /* ÉTAPE 3 — le décor du compagnon, et lui dedans.
       ⚠ CHAQUE ESPÈCE A LE SIEN : le point d'eau est à Babi, la clairière à
       Rouki, le fleuve à Bulle. On relit donc DECORS comme le fait la
       clairière, on n'écrit aucun paysage en dur ici.
       La cage vide reste au fond, porte arrachée : c'est elle qui fait la
       différence entre « un animal dans un paysage » et « un animal libéré ». */
    function parcLibre(u, libre, cle) {
        const c = COMPAGNONS[cle] || COMPAGNONS[courant];
        const d = DECORS[c.decor] || DECORS.point_eau;
        const l = d.lune;
        const lune = !l ? '' :
            `<circle cx="${l.x}" cy="${l.y}" r="${l.r}" fill="#FFE9B8" opacity="0.85"/>
             <circle cx="${l.x}" cy="${l.y}" r="${l.r * 1.9}" fill="#FFE9B8" opacity="0.16" filter="url(#paFlou${u})"/>`;

        /* La cage abandonnée : sa porte est DEHORS, arrachée et posée de
           travers. Une cage simplement vide se lit comme une cage qui attend. */
        const cageVide = `<g opacity="0.4">
            <rect x="272" y="112" width="46" height="34" fill="#141B2E"/>
            <path d="M278 112 L278 146 M288 112 L288 146 M298 112 L298 146 M308 112 L308 146"
                  stroke="#6E7796" stroke-width="2.4"/>
            <rect x="270" y="108" width="50" height="6" rx="3" fill="#6E7796"/>
            <rect x="270" y="144" width="50" height="6" rx="3" fill="#6E7796"/>
            <g transform="rotate(-28 270 128)">
                <rect x="246" y="112" width="24" height="34" fill="#0F1626"/>
                <path d="M252 112 L252 146 M262 112 L262 146" stroke="#6E7796" stroke-width="2.4"/>
            </g></g>`;

        /* L'envol : trois oiseaux qui montent vers le haut du cadre. Ils ne
           sortent que quand l'étape est FRANCHIE — tant qu'elle est en cours,
           il vient d'arriver, rien ne s'est encore envolé. */
        const oiseau = function (x, y, s) {
            return `<path d="M${x} ${y} q${4 * s} ${-4 * s} ${8 * s} 0 q${4 * s} ${-4 * s} ${8 * s} 0"
                          fill="none" stroke="#EDE6FF" stroke-width="${1.7 * s}" stroke-linecap="round" opacity="0.75"/>`;
        };
        const envol = libre ? oiseau(214, 58, 1.3) + oiseau(244, 44, 1) + oiseau(196, 40, 0.85) : '';

        return `
            <linearGradient id="paCiel${u}" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stop-color="${d.ciel[0]}"/><stop offset="1" stop-color="${d.ciel[1]}"/>
            </linearGradient>
            <!--PA_FOND-->
            <rect width="${CL_L}" height="${CL_H}" fill="url(#paCiel${u})"/>
            ${d.luneDevant ? '' : lune}
            <g fill="#FFF0DC" opacity="0.6">
                <circle cx="40" cy="26" r="1.4"/><circle cx="96" cy="46" r="1.1"/>
                <circle cx="160" cy="22" r="1.3"/><circle cx="238" cy="52" r="1.1"/>
            </g>
            ${d.fond()}
            ${d.luneDevant ? lune : ''}
            ${cageVide}
            ${parcAnimal('ravi', 0.30, 132, 166, cle)}
            ${envol}
            <g fill="#FFE9B8">
                <circle class="cl-ff" cx="150" cy="120" r="2"/>
                <circle class="cl-ff" cx="200" cy="132" r="1.6" style="animation-delay:2s"/>
                <circle class="cl-ff" cx="176" cy="110" r="1.8" style="animation-delay:4s"/>
            </g>`;
    }

    /* La planche d'une étape, seule. Sert aussi bien au grand dessin du carnet
       qu'aux vignettes verrouillées des étapes à venir : un seul dessin par
       étape, jamais deux à tenir d'accord. */
    function parcPlanche(etape, libre, cle) {
        const u = '-p' + (++_instance);
        const n = Math.max(1, Math.min(3, etape || 1));

        /* L'étape 3 fabrique son propre ciel (celui du décor) et pose son fond
           elle-même ; les deux premières partagent la nuit neutre. */
        const contenu = n === 3
            ? parcLibre(u, !!libre, cle)
            : parcNuit(u) + '<!--PA_FOND-->' + parcNuitFond(u) + (n === 1 ? parcCage(u, cle) : parcVehicule(u, cle));

        /* Les `<defs>` doivent précéder le dessin : on coupe le contenu au
           marqueur plutôt que de fabriquer deux fonctions par étape. */
        const bout = contenu.split('<!--PA_FOND-->');
        return `<svg class="cl-svg" viewBox="0 0 ${CL_L} ${CL_H}" aria-hidden="true">
            <defs>${parcDefs(u)}${bout[0]}</defs>
            ${bout[1]}
            <rect x="0" y="${CL_SOL - 30}" width="${CL_L}" height="${CL_H - CL_SOL + 30}" fill="url(#paVoile${u})"/>
        </svg>`;
    }

    /* Le libellé d'une étape, pour le carnet comme pour les vignettes. */
    function parcoursEtape(n) {
        return PARC_ETAPES[Math.max(1, Math.min(3, n || 1)) - 1];
    }

    /* infos : { etape (1..3), libre (bool), semaines, total }
       `libre` dit que l'étape 3 est FRANCHIE — l'animal est sauvé — alors que
       `etape:3` seul veut dire qu'elle est en cours. */
    function parcours(cible, infos) {
        const el = typeof cible === 'string' ? document.getElementById(cible) : cible;
        if (!el) return;
        infos = infos || {};
        const n = Math.max(1, Math.min(3, infos.etape || 1));
        const libre = !!infos.libre;
        const lib = libre ? PARC_SAUVE : parcoursEtape(n);
        const total = infos.total || PARC_ETAPES.length;

        const pastille = libre
            ? `<div class="cl-eco">${COMPAGNONS[courant].nom} est libre</div>`
            : `<div class="cl-eco">Étape ${n} / ${total}</div>`;

        /* Les étapes à venir restent VISIBLES, en pointillés et sous cadenas.
           C'est le même code que les graines de la clairière : un pointillé est
           une attente, pas un reproche. */
        const suite = [];
        for (let i = n + 1; i <= total && !libre; i++) {
            suite.push(`
                <div class="pa-vign">
                    ${parcPlanche(i, false)}
                    <span class="pa-cadenas" aria-hidden="true">
                        <svg viewBox="0 0 24 24"><path d="M8 11 L8 7 a4 4 0 0 1 8 0 L16 11" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><rect x="5" y="10" width="14" height="11" rx="3" fill="currentColor"/></svg>
                    </span>
                    <span class="pa-nom">Étape ${i} · ${parcoursEtape(i).titre}</span>
                </div>`);
        }

        el.innerHTML = `
            <div class="clairiere pa-planche${libre ? ' pa-libre' : ''}">
                ${parcPlanche(n, libre)}
                <div class="cl-legende">
                    <div>
                        <div class="cl-titre">${lib.titre}</div>
                        <div class="cl-sous">${lib.sous}</div>
                    </div>
                    ${pastille}
                </div>
            </div>
            ${suite.length ? `<div class="pa-suite">${suite.join('')}</div>` : ''}`;
    }

    /* ======================================================================
       LA FICHE D'UN ANIMAL LIBÉRÉ
       ----------------------------------------------------------------------
       Ce qu'on voit en touchant un animal sauvé dans « Qui sauvons-nous ? » :
       son décor, lui dedans, et quelques lignes sur ce qu'il y est devenu.
       C'est la seule récompense qui reste après la fin d'un parcours — le
       carnet, lui, est déjà passé à l'animal suivant.

       ⚠ Elle dessine l'animal DEMANDÉ, pas le compagnon courant : on regarde
       la fiche de Bulle sans cesser d'être avec Babi. C'est la raison d'être
       du paramètre `cle` qui traverse tout le parcours.

       ⚠ TEXTES PROVISOIRES (25/08/2026). Ils tiennent la place et donnent le
       ton — constater, jamais congratuler l'utilisateur — mais ils sont à
       réécrire. Un seul endroit à reprendre : la table ci-dessous.
       ====================================================================== */
    /* ═══════════════════════════════════════════════════════════════════════
       QUI EST CET ANIMAL                                       (26/08/2026)
       ----------------------------------------------------------------------
       Son histoire AVANT le sauvetage : d'où il vient, et pourquoi il est en
       cage. À ne pas confondre avec `SAUVE_TEXTES` juste en dessous, qui dit ce
       qu'il est devenu APRÈS — les deux ne sont jamais montrés au même moment :
         · `HISTOIRES`     → la fiche du compagnon en cours (js/26), pendant le
                             parcours, quand il est encore à sortir de là ;
         · `SAUVE_TEXTES`  → la fiche d'un animal sauvé (js/25), une fois fini.

       ⚠ DEUX ANIMAUX SEULEMENT SONT ÉCRITS POUR L'INSTANT (babi, bulle) — c'est
       une maquette de ton, pas un oubli. Les autres tombent sur le repli de
       `histoire()`, qui dit franchement que l'histoire reste à écrire plutôt que
       de resservir celle du voisin.

       La voix : on RACONTE, on n'apitoie pas. Pas de « pauvre », pas de bourreau
       désigné, pas de leçon à la fin — des faits, dans l'ordre, et l'animal au
       bout. C'est la même retenue que les phrases des compagnons : constater. */
    const HISTOIRES = {
        babi: [
            "Il est né au bord d'un point d'eau qui a fini de s'assécher l'année de sa naissance. "
            + "Le troupeau est parti vers le nord en suivant la pluie. Lui avait quatre mois et "
            + "des pattes trop courtes ; il a suivi une piste qui n'était pas la bonne.",
            "On l'a retrouvé trois semaines plus tard du mauvais côté d'une clôture, maigre et "
            + "parfaitement calme. C'est ce calme qui l'a mis en cage : il s'approche des gens, "
            + "il tend la trompe, il attend. Personne ne lui a appris à se méfier, et maintenant "
            + "il est trop tard pour le relâcher sans l'accompagner."
        ],
        bulle: [
            "Son bras de fleuve a été coupé en amont pour faire passer une route. L'eau a baissé "
            + "pendant deux saisons, puis elle s'est arrêtée. Les autres hippopotames sont "
            + "descendus vers le grand lit ; il est resté dans ce qui restait, une mare de la "
            + "taille de son dos.",
            "Il a tenu là tout un été. Quand on est venu le chercher, il ne s'est pas débattu — "
            + "il n'avait plus de quoi. On dit de lui qu'il est placide ; c'est surtout qu'il a "
            + "appris à attendre que l'eau revienne. Elle n'est pas revenue."
        ]
    };

    /* Repli assumé : mieux vaut une phrase qui dit « pas encore écrit » qu'une
       histoire d'emprunt qui donnerait à la girafe le passé de l'éléphant. */
    function histoire(cle) {
        const c = COMPAGNONS[cle] ? cle : courant;
        return HISTOIRES[c] || [
            "Son histoire n'est pas encore écrite. On sait seulement qu'il attend, "
            + "et qu'on peut aller le chercher."
        ];
    }

    const SAUVE_TEXTES = {
        babi: "Il a mis trois jours à s'approcher de l'eau, et maintenant il n'en bouge plus. "
            + "Le matin il asperge les roseaux, le soir il regarde la lune s'y poser. "
            + "Il a une trace de boue sur l'oreille gauche qui ne part jamais tout à fait.",
        bulle: "Le fleuve lui va bien. Il passe ses journées immergé jusqu'aux yeux, "
             + "à laisser le courant faire le travail, et ne sort qu'à la tombée du jour. "
             + "Les oiseaux se posent sur son dos ; il ne les chasse même plus.",
        titi: "Il a choisi la branche la plus haute, celle qui plie un peu. "
            + "De là il voit tout, et il commente tout. La canopée est plus bruyante depuis qu'il est arrivé, "
            + "et personne n'a l'air de s'en plaindre.",
        zola: "Il dort seize heures par jour sur son rocher, face au vent. "
            + "Les huit autres, il les passe à marcher lentement d'un bout à l'autre de son territoire, "
            + "comme quelqu'un qui vérifie que tout est bien là.",
        kiri: "Elle a trouvé l'arbre dont les feuilles sont les plus tendres et elle y revient chaque matin. "
            + "Elle mange les yeux mi-clos, sans se presser. "
            + "De si haut, elle voit venir le soir bien avant les autres.",
        raya: "Elle a repris ses habitudes de chasseuse sans avoir à les réapprendre. "
            + "Elle disparaît des journées entières dans les hautes herbes, "
            + "et reparaît toujours au même endroit, au bord de l'eau, à l'heure fraîche.",
        sam: "Elle a creusé son terrier à la lisière, du côté d'où l'on voit venir. "
           + "Elle sort à la tombée du jour, prend chaque fois un chemin différent pour aller, "
           + "et rentre toujours par le même — celui qu'elle s'est gardé."
    };

    function texteSauve(cle) {
        return SAUVE_TEXTES[cle] || SAUVE_TEXTES.babi;
    }

    /* infos : { cle, texte (facultatif — pour un texte venu d'ailleurs) } */
    function fiche(cible, infos) {
        const el = typeof cible === 'string' ? document.getElementById(cible) : cible;
        if (!el) return;
        infos = infos || {};
        const cle = COMPAGNONS[infos.cle] ? infos.cle : courant;
        const c = COMPAGNONS[cle];
        const d = DECORS[c.decor] || DECORS.point_eau;

        /* LE DÉCOR DE LA CLAIRIÈRE, ET PAS LA PLANCHE DU PARCOURS (25/08/2026,
           demande utilisateur) : c'est le paysage habité — roseaux, nénuphars,
           lucioles — qui dit qu'il s'est installé. La planche de l'étape 3, avec
           sa cage arrachée au fond et son vol d'oiseaux, raconte le DÉPART ; sur
           une fiche, on est bien après. Tous les motifs sont allumés : un décor
           à moitié en pointillés dirait qu'il lui manque encore quelque chose. */
        const places = decorPlaces(cle);
        el.innerHTML = `
            <div class="clairiere pa-planche pa-libre">
                ${clairierePlanche(cle, places, places)}
                <div class="cl-legende">
                    <div>
                        <div class="cl-titre">${c.nom} est libre</div>
                        <div class="cl-sous">${d.titre.replace(/^Ton /, 'Son ').replace(/^Ta /, 'Sa ')}</div>
                    </div>
                </div>
            </div>
            <p class="cpx-fiche-texte"></p>`;
        /* textContent : le texte sera un jour renseigné par l'utilisateur ou
           venu du réseau, on ne le réinjecte jamais comme du balisage. */
        el.querySelector('.cpx-fiche-texte').textContent = infos.texte || texteSauve(cle);
    }

    /* La vignette du sélecteur de compagnon : le même dessin, derrière des
       barreaux. Tant qu'un animal n'est pas sauvé, il est en cage — c'est la
       seule chose que la fenêtre de choix a besoin de dire.
       ⚠ Les barreaux sont dessinés APRÈS l'animal, sinon ils passent derrière. */
    function vignetteCage(cle) {
        const c = COMPAGNONS[cle];
        if (!c) return '';
        const u = '-vc' + (++_instance);
        const barreaux = Array.from({ length: 6 }, function (_, i) {
            return `<rect x="${34 + i * 50}" y="66" width="11" height="280" rx="5.5" fill="url(#vcMetal${u})"/>`;
        }).join('');
        return `<svg class="cp-svg" viewBox="6 42 308 330" aria-hidden="true">
            <defs>
                <linearGradient id="vcMetal${u}" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0" stop-color="#5E6789"/><stop offset="0.45" stop-color="#9AA3C4"/>
                    <stop offset="1" stop-color="#596183"/>
                </linearGradient>
            </defs>
            ${c.interieur('repos')}
            ${barreaux}
            <rect x="24" y="54" width="266" height="16" rx="8" fill="url(#vcMetal${u})"/>
            <rect x="24" y="342" width="266" height="14" rx="7" fill="url(#vcMetal${u})"/>
            <path d="M148 214 L148 204 A9 9 0 0 1 166 204 L166 214"
                  fill="none" stroke="#C9C2E6" stroke-width="6" stroke-linecap="round"/>
            <rect x="139" y="211" width="36" height="30" rx="8" fill="#FFB35C"/>
            <circle cx="157" cy="223" r="4" fill="#7A4E1C"/>
        </svg>`;
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
        /* Le hero suit lui aussi l'état physique : c'est le même animal que celui
           de la carte de rang, il ne peut pas être intact à un endroit et blessé à
           l'autre. Voir `physiqueCourant()`. */
        cible.innerHTML = COMPAGNONS[courant].dessin(nouvel, physiqueCourant());
    }

    /* Redessine les portraits du compagnon actif après un changement d'état
       physique. Appelée par js/24 au franchissement d'un seuil de vie, et par lui
       seul : ce module ne surveille pas la jauge, il se contente d'obéir.

       ⚠ APPELÉE AU CHANGEMENT D'ÉTAT, PAS À CHAQUE POINT GPS. Elle refait deux
       innerHTML et, via la carte de rang, tout le calcul des badges — trois fois
       par trajet au maximum (sain → blessé → mort), jamais en continu. */
    function rafraichirPortraits() {
        if (document.getElementById('compagnon-dessin')) etat(etatCourant);
        if (typeof window.renderCarteCompagnon === 'function') {
            try { window.renderCarteCompagnon(); } catch (e) { /* la carte se repeindra seule */ }
        }
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

    window.Compagnon = { monter: monter, etat: etat, dit: dit, phrase: phrase, portrait: portrait,
                         choisir: choisir, catalogue: catalogue,
                         rafraichirPortraits: rafraichirPortraits,
                         cle: function () { return courant; },
                         /* `physique` ('sain' | 'blesse' | 'mort', voir etatPhysiqueVie
                            dans js/00) choisit la VARIANTE d'image ; `e` reste
                            l'expression.
                            ⚠ OMIS, ON PREND L'ÉTAT RÉEL DU COMPAGNON, plus l'image
                            Normal (changé le 27/08/2026) : un portrait intact au-dessus
                            d'une barre de vie à 2 % se lisait comme un bug. Passer
                            explicitement 'sain' pour forcer l'animal indemne. */
                         dessin: function (e, physique) { return COMPAGNONS[courant].dessin(e || etatCourant, physique || physiqueCourant()); },
                         clairiere: clairiere, nom: function () { return COMPAGNONS[courant].nom; },
                         parcours: parcours, parcoursEtape: parcoursEtape, vignetteCage: vignetteCage,
                         fiche: fiche, texteSauve: texteSauve,
                         nomDe: function (cle) { return (COMPAGNONS[cle] || COMPAGNONS[courant]).nom; },
                         especeDe: function (cle) { return (COMPAGNONS[cle] || COMPAGNONS[courant]).espece; },
                         accentDe: function (cle) { return (COMPAGNONS[cle] || COMPAGNONS[courant]).accent; },
                         histoire: histoire,
                         /* Le PNG brut et sa boîte englobante, pour qui veut poser
                            l'animal ailleurs que dans le gabarit du hero — le marqueur
                            GPS (js/04) est le premier. On rend le chemin DÉJÀ préfixé
                            par la racine : l'appelant n'a pas à savoir d'où ce module a
                            été chargé. `null` pour un compagnon sans image, plutôt
                            qu'un objet à moitié rempli que l'appelant croirait valide. */
                         image: function (cle, physique) {
                             if (!IMAGES[cle || courant]) return null;
                             const v = variante(cle || courant, physique);
                             return { fichier: RACINE + v.fichier, boite: v.boite };
                         },
                         genre: function (cle) { return genreDe(cle || courant); },
                         video: function (cle, moment) { return videoDe(cle || courant, moment); },
                         get etatCourant() { return etatCourant; } };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', monter);
    } else {
        monter();
    }
})();

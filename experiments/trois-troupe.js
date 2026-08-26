/* Trois compagnons de la troupe, dessinés dans le rendu de l'app à partir de
   leurs vignettes de TroupeC.dc.html. Même espace que Babi (320 × 380, viewBox
   « 6 42 308 330 »), mêmes classes d'animation, ids suffixés par instance. */
let _instance = 0;

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
        ${signe}`;
}

const TROIS = [
    { cle: 'zola', nom: 'Zola', espece: 'lion',   fn: dessinZolaInterieur },
    { cle: 'kiri', nom: 'Kiri', espece: 'girafe', fn: dessinKiriInterieur },
    { cle: 'raya', nom: 'Raya', espece: 'tigre',  fn: dessinRayaInterieur }
];
if (typeof module !== 'undefined') module.exports = { TROIS };

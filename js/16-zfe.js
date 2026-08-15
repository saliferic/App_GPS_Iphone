        // === ZFE (Zones à Faibles Émissions) + VIGNETTE CRIT'AIR ===
        // Source : Base Nationale consolidée des ZFE (BNZFE), schéma etalab/schema-zfe.
        // Chaque zone porte, par catégorie de véhicule, la vignette MINIMALE autorisée
        // (vp_critair = "V3" => Crit'Air 4, 5 et NC interdits) et ses horaires
        // d'application au format OSM opening_hours ("24/7", "Mo-Fr 08:00-20:00; PH off").
        // ═══════════════════════════════════════════════════════════════════

        const ZFE_CRITAIR_KEY   = 'gps_critair';
        const ZFE_CATEGORY_KEY  = 'gps_vehicle_category';
        const ZFE_ENABLED_KEY   = 'gps_zfe_alerts';
        const ZFE_CACHE_KEY     = 'gps_zfe_cache_v1';
        const ZFE_CACHE_TTL_MS  = 7 * 24 * 60 * 60 * 1000;   // 7 jours

        // Miroirs de téléchargement de la base nationale (aires.geojson, ~1.7 Mo)
        const ZFE_SOURCES = [
            'https://transport.data.gouv.fr/resources/79567/download',
            'https://www.data.gouv.fr/fr/datasets/r/673a16bf-49ec-4645-9da2-cf975d0aa0ea'
        ];

        const CRITAIR_RANK  = { EL: 0, V1: 1, V2: 2, V3: 3, V4: 4, V5: 5, NC: 6 };
        const CRITAIR_LABEL = { EL: "Crit'Air E (100% élec/H2)", V1: "Crit'Air 1", V2: "Crit'Air 2", V3: "Crit'Air 3", V4: "Crit'Air 4", V5: "Crit'Air 5", NC: "Non classé" };
        const ZFE_CAT_LABEL = { vp: 'voiture', vul: 'utilitaire léger', pl: 'poids lourd', deux_rm: 'deux-roues', autobus_autocars: 'autobus/autocar' };
        const ZFE_DAYS      = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

        let zfeZones          = null;    // [{ id, nom, props, poly, bbox, approx }]
        let zfeZonesApprox    = false;   // true si on tourne sur le jeu de secours embarqué
        let zfeRouteCrossings = [];      // traversées détectées sur l'itinéraire courant
        let zfeLoadPromise    = null;
        let _zfeLastLiveCheck = 0;
        let _zfeLiveInsideId  = null;
        let _zfeBannerTimer   = null;

        function zfeAlertsEnabled() { return localStorage.getItem(ZFE_ENABLED_KEY) !== '0'; }
        function getCritAir()       { return localStorage.getItem(ZFE_CRITAIR_KEY)  || 'V2'; }
        function getZFECategory()   { return localStorage.getItem(ZFE_CATEGORY_KEY) || 'vp'; }

        /* Barème des amendes ZFE (code de la route, art. R411-19-1).
           Le partage ne se fait PAS sur la vignette Crit'Air mais sur la catégorie
           du véhicule : 4ᵉ classe pour les poids lourds, autobus et autocars,
           3ᵉ classe pour tous les autres. C'est donc `gps_vehicle_category`, et
           non `gps_critair`, qui détermine le montant.
           Montants forfaitaires nationaux, susceptibles d'évoluer : les garder
           groupés ici pour n'avoir qu'un endroit à corriger. */
        // `ZFE_AMENDES`, `ZFE_CAT_CLASSE` et `getZFEAmende()` ont rejoint
        // js/00-noyau-calculs.js — le barème est une table, son application une
        // fonction pure, et le lien catégorie → classe de contravention mérite d'être
        // vérifié par un test plutôt que par relecture de l'article R411-19-1.

        // ── Jeu de secours embarqué ──────────────────────────────────────────
        // Périmètres APPROXIMATIFS (octogones) des principales ZFE françaises.
        // Utilisé uniquement si la base nationale est injoignable (APK hors ligne,
        // CORS bloqué…). Toujours signalé comme approximatif dans l'interface.
        function _zfeOctagon(lng, lat, radiusKm) {
            const ring = [];
            const dLat = radiusKm / 111.32;
            const dLng = radiusKm / (111.32 * Math.cos(lat * Math.PI / 180));
            for (let i = 0; i <= 8; i++) {
                const a = (i % 8) * Math.PI / 4;
                ring.push([+(lng + dLng * Math.cos(a)).toFixed(5), +(lat + dLat * Math.sin(a)).toFixed(5)]);
            }
            return { type: 'Polygon', coordinates: [ring] };
        }

        function _zfeFallbackZones() {
            const raw = [
                ['fallback-paris',      'ZFE Métropole du Grand Paris (intérieur A86)', 2.3488, 48.8566, 11, 'V2', 'https://www.metropolegrandparis.fr/fr/ZFE'],
                ['fallback-lyon',       'ZFE Métropole de Lyon',                        4.8357, 45.7640,  5, 'V3', 'https://www.grandlyon.com/actions/zfe.html'],
                ['fallback-grenoble',   'ZFE Grenoble-Alpes Métropole',                 5.7245, 45.1885,  6, 'V3', 'https://www.grenoblealpesmetropole.fr'],
                ['fallback-marseille',  'ZFE Aix-Marseille-Provence',                   5.3698, 43.2965,  4, 'V3', 'https://www.marseille.fr'],
                ['fallback-strasbourg', 'ZFE Eurométropole de Strasbourg',              7.7521, 48.5734,  6, 'V3', 'https://www.strasbourg.eu'],
                ['fallback-rouen',      'ZFE Métropole Rouen Normandie',                1.0993, 49.4432,  4, 'V3', 'https://www.metropole-rouen-normandie.fr'],
                ['fallback-toulouse',   'ZFE Toulouse Métropole',                       1.4442, 43.6047,  5, 'V3', 'https://www.toulouse-metropole.fr'],
                ['fallback-montpellier','ZFE Montpellier Méditerranée Métropole',       3.8767, 43.6108,  4, 'V3', 'https://www.montpellier3m.fr'],
                ['fallback-nice',       'ZFE Métropole Nice Côte d\'Azur',              7.2620, 43.7102,  4, 'V4', 'https://www.nicecotedazur.org'],
                ['fallback-reims',      'ZFE Grand Reims',                              4.0317, 49.2583,  4, 'V4', 'https://www.grandreims.fr'],
                ['fallback-clermont',   'ZFE Clermont Auvergne Métropole',              3.0870, 45.7772,  3, 'V4', 'https://www.clermontmetropole.eu'],
                ['fallback-saintetienne','ZFE Saint-Étienne Métropole (PL et VUL)',     4.3872, 45.4397,  5, null, 'https://www.saint-etienne-metropole.fr']
            ];
            return raw.map(([id, nom, lng, lat, r, critair, url]) => {
                const poly = _zfeOctagon(lng, lat, r);
                const props = {
                    id, url_site: url,
                    vp_critair: critair, vp_horaires: '24/7',
                    vul_critair: critair || 'V4', vul_horaires: '24/7',
                    pl_critair: critair || 'V4', pl_horaires: '24/7',
                    deux_rm_critair: critair, deux_rm_horaires: '24/7',
                    autobus_autocars_critair: critair, autobus_autocars_horaires: '24/7'
                };
                return { id, nom, props, poly, bbox: turf.bbox(poly), approx: true };
            });
        }

        // ── Chargement / cache de la base nationale ──────────────────────────
        function _zfeReadCache() {
            try {
                const raw = localStorage.getItem(ZFE_CACHE_KEY);
                if (!raw) return null;
                const obj = JSON.parse(raw);
                if (!obj || !obj.savedAt || !Array.isArray(obj.zones)) return null;
                if (Date.now() - obj.savedAt > ZFE_CACHE_TTL_MS) return null;
                return obj.zones;
            } catch (e) { return null; }
        }

        function _zfeWriteCache(zones) {
            try {
                localStorage.setItem(ZFE_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), zones }));
            } catch (e) {
                // Quota dépassé : on abandonne silencieusement le cache disque,
                // la copie mémoire reste valable pour la session.
                tenterSansBruit(() => localStorage.removeItem(ZFE_CACHE_KEY), 'zfe/purgeCache');
                if (DEBUG) console.warn('[ZFE] cache non enregistré (quota) :', e);
            }
        }

        function _zfeRoundGeom(geom) {
            const r = c => [+c[0].toFixed(5), +c[1].toFixed(5)];
            if (geom.type === 'Polygon') {
                return { type: 'Polygon', coordinates: geom.coordinates.map(ring => ring.map(r)) };
            }
            if (geom.type === 'MultiPolygon') {
                return { type: 'MultiPolygon', coordinates: geom.coordinates.map(p => p.map(ring => ring.map(r))) };
            }
            return geom;
        }

        function _zfeParseGeoJSON(gj) {
            if (!gj || !Array.isArray(gj.features)) return [];
            const today = new Date().toISOString().slice(0, 10);
            const zones = [];
            gj.features.forEach((f, i) => {
                const g = f && f.geometry;
                if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return;
                const p = f.properties || {};
                // La base contient aussi les ZFE "en projet" : on ne garde que ce qui est en vigueur.
                if (p.date_debut && p.date_debut > today) return;
                if (p.date_fin   && p.date_fin   < today) return;
                let geom = g;
                try {
                    geom = turf.simplify({ type: 'Feature', geometry: g, properties: {} },
                                         { tolerance: 0.0002, highQuality: false, mutate: false }).geometry;
                } catch (e) { /* géométrie exotique : on garde l'originale */ }
                geom = _zfeRoundGeom(geom);
                const id = p.zfe_id || p.id || `zfe-${i}`;
                zones.push({
                    id,
                    nom: p.nom || p.publisher?.name || p.libelle || _zfeNameFromId(id),
                    props: p,
                    poly: geom,
                    bbox: turf.bbox(geom),
                    approx: false
                });
            });
            return zones;
        }

        function _zfeNameFromId(id) {
            return `Zone à faibles émissions ${String(id).slice(0, 12)}`;
        }

        async function loadZFEData(force = false) {
            if (zfeZones && !force) return zfeZones;
            if (zfeLoadPromise && !force) return zfeLoadPromise;

            zfeLoadPromise = (async () => {
                if (!force) {
                    const cached = _zfeReadCache();
                    if (cached && cached.length) {
                        zfeZones = cached;
                        zfeZonesApprox = cached.every(z => z.approx);
                        return zfeZones;
                    }
                }
                for (const url of ZFE_SOURCES) {
                    try {
                        const res = await fetchResilient(url, {}, { timeoutMs: 15000, retries: 0 });
                        if (!res.ok) continue;
                        const gj = await res.json();
                        const zones = _zfeParseGeoJSON(gj);
                        if (zones.length) {
                            zfeZones = zones;
                            zfeZonesApprox = false;
                            _zfeWriteCache(zones);
                            if (DEBUG) console.log(`[ZFE] ${zones.length} zones chargées depuis ${url}`);
                            return zfeZones;
                        }
                    } catch (e) {
                        if (DEBUG) console.warn('[ZFE] source injoignable :', url, e);
                    }
                }
                // Dernier recours : périmètres approximatifs embarqués
                zfeZones = _zfeFallbackZones();
                zfeZonesApprox = true;
                if (DEBUG) console.warn('[ZFE] base nationale injoignable, jeu de secours approximatif utilisé');
                return zfeZones;
            })();

            return zfeLoadPromise;
        }

        // ── Règles : horaires OSM + comparaison de vignette ──────────────────
        function _zfeHorairesActive(str, when = new Date()) {
            if (!str) return true;
            const s = String(str).trim();
            if (!s || /^24\s*\/\s*7$/i.test(s)) return true;

            const dayIdx  = when.getDay();
            const dayCode = ZFE_DAYS[dayIdx];
            const minutes = when.getHours() * 60 + when.getMinutes();
            let parsedAny = false;

            for (const rulePart of s.split(';')) {
                const rule = rulePart.trim();
                if (!rule || /^PH\b/i.test(rule)) continue;   // jours fériés : non gérés
                if (/^24\s*\/\s*7$/i.test(rule)) return true;

                const timeMatches = rule.match(/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/g) || [];
                const dayPart     = rule.replace(/\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}/g, '').replace(/,/g, ' ').trim();

                // Jours concernés
                let dayOk = true;
                if (dayPart) {
                    dayOk = false;
                    const tokens = dayPart.split(/[\s,]+/).filter(Boolean);
                    let sawDayToken = false;
                    for (const tok of tokens) {
                        const range = tok.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)-(Mo|Tu|We|Th|Fr|Sa|Su)$/i);
                        const single = tok.match(/^(Mo|Tu|We|Th|Fr|Sa|Su)$/i);
                        if (range) {
                            sawDayToken = true;
                            const a = ZFE_DAYS.findIndex(d => d.toLowerCase() === range[1].toLowerCase());
                            const b = ZFE_DAYS.findIndex(d => d.toLowerCase() === range[2].toLowerCase());
                            if (a <= b) { if (dayIdx >= a && dayIdx <= b) dayOk = true; }
                            else        { if (dayIdx >= a || dayIdx <= b) dayOk = true; }
                        } else if (single) {
                            sawDayToken = true;
                            if (single[1].toLowerCase() === dayCode.toLowerCase()) dayOk = true;
                        }
                    }
                    if (!sawDayToken) dayOk = true;   // mot-clé non reconnu : on n'exclut pas
                }
                if (!dayOk) { parsedAny = true; continue; }

                if (!timeMatches.length) { return true; }   // jours sans plage horaire = toute la journée

                for (const tm of timeMatches) {
                    parsedAny = true;
                    const [h1, m1, h2, m2] = tm.match(/\d{1,2}:\d{2}/g)
                        .flatMap(t => t.split(':').map(Number));
                    let start = h1 * 60 + m1, end = h2 * 60 + m2;
                    if (end <= start) { if (minutes >= start || minutes <= end) return true; }
                    else              { if (minutes >= start && minutes <= end) return true; }
                }
            }
            // Rien n'a pu être interprété : on considère la restriction active (prudence).
            return !parsedAny;
        }

        function zfeEvaluateZone(zone, critair = getCritAir(), category = getZFECategory(), when = new Date()) {
            const required = zone.props ? zone.props[`${category}_critair`] : null;
            const horaires = zone.props ? zone.props[`${category}_horaires`] : null;
            if (!required || !CRITAIR_RANK.hasOwnProperty(required)) {
                return { concerned: false, allowed: true, required: null, horaires, active: false };
            }
            const active  = _zfeHorairesActive(horaires, when);
            const allowed = CRITAIR_RANK[critair] <= CRITAIR_RANK[required];
            return { concerned: true, allowed, required, horaires, active, restricted: active && !allowed };
        }

        // ── Analyse d'un itinéraire ──────────────────────────────────────────
        function _zfeBboxOverlap(a, b) {
            return !(a[2] < b[0] || a[0] > b[2] || a[3] < b[1] || a[1] > b[3]);
        }

        function _zfePointInZone(zone, lng, lat) {
            try {
                return turf.booleanPointInPolygon(turf.point([lng, lat]), zone.poly);
            } catch (e) { return false; }
        }

        async function analyzeZFEForRoute(coords) {
            zfeRouteCrossings = [];
            if (!zfeAlertsEnabled() || !coords || coords.length < 2) {
                renderZFEPreviewCard();
                _zfeRefreshMapLayer();
                return [];
            }
            try {
                const zones = await loadZFEData();
                const routeBbox = turf.bbox(turf.lineString(coords));
                const candidates = zones.filter(z => _zfeBboxOverlap(z.bbox, routeBbox));
                if (!candidates.length) {
                    renderZFEPreviewCard();
                    _zfeRefreshMapLayer();
                    return [];
                }

                // Distances cumulées + densification des longs segments (autoroute)
                const samples = [];
                let cum = 0;
                for (let i = 0; i < coords.length; i++) {
                    if (i > 0) {
                        const segKm = turf.distance(turf.point(coords[i - 1]), turf.point(coords[i]), { units: 'kilometers' });
                        const steps = Math.min(20, Math.max(1, Math.ceil(segKm / 0.25)));
                        for (let s = 1; s < steps; s++) {
                            const t = s / steps;
                            samples.push({
                                lng: coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t,
                                lat: coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t,
                                km: cum + segKm * t
                            });
                        }
                        cum += segKm;
                    }
                    samples.push({ lng: coords[i][0], lat: coords[i][1], km: cum });
                }

                const crossings = [];
                candidates.forEach(zone => {
                    const evalRes = zfeEvaluateZone(zone);
                    let inside = false, entryKm = 0, lastKm = 0;
                    samples.forEach(pt => {
                        const isIn = _zfePointInZone(zone, pt.lng, pt.lat);
                        if (isIn && !inside) { inside = true; entryKm = pt.km; }
                        if (isIn) lastKm = pt.km;
                        if (!isIn && inside) {
                            inside = false;
                            crossings.push({ zone, ...evalRes, entryKm, exitKm: lastKm, alerted: false });
                        }
                    });
                    if (inside) crossings.push({ zone, ...evalRes, entryKm, exitKm: lastKm, alerted: false });
                });

                // Fusion des micro-traversées successives de la même zone (bruit de tracé)
                crossings.sort((a, b) => a.entryKm - b.entryKm);
                const merged = [];
                crossings.forEach(c => {
                    const prev = merged[merged.length - 1];
                    if (prev && prev.zone.id === c.zone.id && c.entryKm - prev.exitKm < 1.5) {
                        prev.exitKm = Math.max(prev.exitKm, c.exitKm);
                    } else {
                        merged.push(c);
                    }
                });

                zfeRouteCrossings = merged;
            } catch (e) {
                if (DEBUG) console.warn('[ZFE] analyse impossible :', e);
                zfeRouteCrossings = [];
            }
            renderZFEPreviewCard();
            _zfeRefreshMapLayer();
            return zfeRouteCrossings;
        }

        // ── Rendu de la carte d'aperçu (modale trajet) ───────────────────────
        function renderZFEPreviewCard() {
            const card  = document.getElementById('zfe-preview-card');
            const title = document.getElementById('zfe-preview-title');
            const body  = document.getElementById('zfe-preview-body');
            if (!card || !title || !body) return;

            if (!zfeRouteCrossings.length) { card.style.display = 'none'; return; }

            const blocking = zfeRouteCrossings.filter(c => c.restricted);
            card.className = blocking.length ? 'blocked' : 'ok';
            card.style.display = 'block';

            const critair = getCritAir();
            title.innerHTML = blocking.length
                ? `⛔ ${blocking.length} ZFE interdite${blocking.length > 1 ? 's' : ''} à votre vignette`
                : `🏭 ${zfeRouteCrossings.length} ZFE traversée${zfeRouteCrossings.length > 1 ? 's' : ''} — circulation autorisée`;

            body.innerHTML = zfeRouteCrossings.map(c => {
                const lenKm = Math.max(0, c.exitKm - c.entryKm).toFixed(1);
                let verdict;
                if (!c.concerned)     verdict = `<span class="zfe-verdict-ok">non concerné (${ZFE_CAT_LABEL[getZFECategory()]})</span>`;
                else if (!c.active)   verdict = `<span class="zfe-verdict-ok">hors horaires d'application</span>`;
                else if (c.allowed)   verdict = `<span class="zfe-verdict-ok">autorisé</span>`;
                else                  verdict = `<span class="zfe-verdict-ko">interdit — ${c.required ? CRITAIR_LABEL[c.required] + ' minimum' : ''}</span>`;
                const url = c.zone.props?.url_site || c.zone.props?.url_arrete;
                return `<div class="zfe-zone-line">
                    • <strong>${c.zone.nom}</strong><br>
                    au km ${c.entryKm.toFixed(1)} · ${lenKm} km dans la zone · ${verdict}
                    ${c.horaires && c.horaires !== '24/7' ? `<br><span style="font-size:11px;">horaires : ${c.horaires}</span>` : ''}
                    ${url ? `<br><a href="${url}" target="_blank" rel="noopener">règles officielles ↗</a>` : ''}
                </div>`;
            }).join('');

            /* Le risque d'amende n'est annoncé QUE si une zone est réellement
               interdite au moment du passage. L'afficher sur un trajet autorisé,
               ou hors horaires d'application, serait une fausse alerte. */
            if (blocking.length) {
                const amende = getZFEAmende();
                body.innerHTML += `<div class="zfe-amende">
                    <span class="zfe-amende-head">⚠️ Risque d'amende : <strong>${amende.forfait} €</strong></span>
                    <span class="zfe-amende-detail">${amende.minoree} € si payée sous 15 jours · jusqu'à ${amende.majoree} € en cas de retard</span>
                    <span class="zfe-amende-detail">Contravention de ${amende.classe}ᵉ classe — ${ZFE_CAT_LABEL[getZFECategory()]}. Montant indicatif, par contrôle.</span>
                </div>`;
            }

            body.innerHTML += `<div class="zfe-zone-line" style="margin-top:6px;font-size:11px;">Votre vignette : <strong>${CRITAIR_LABEL[critair]}</strong> — modifiable dans <strong style="color:#58a6ff;">Profil → Mon véhicule</strong></div>`;
            if (zfeZonesApprox) {
                body.innerHTML += `<div class="zfe-approx-note">⚠️ Base nationale injoignable : périmètres et règles approximatifs (jeu embarqué). Vérifiez sur le site officiel de la collectivité.</div>`;
            }
        }

        // ── Affichage cartographique ─────────────────────────────────────────
        function _zfeEnsureMapLayers() {
            if (!map || !map.getStyle) return;
            try {
                if (!map.getSource('zfe-zones')) {
                    map.addSource('zfe-zones', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
                }
                if (!map.getLayer('zfe-fill')) {
                    map.addLayer({
                        id: 'zfe-fill', type: 'fill', source: 'zfe-zones', slot: 'middle',
                        paint: {
                            'fill-color': ['case', ['get', 'restricted'], '#ff4d4d', '#3fb950'],
                            'fill-opacity': ['case', ['get', 'restricted'], 0.16, 0.08],
                            'fill-emissive-strength': 1
                        }
                    });
                }
                if (!map.getLayer('zfe-outline')) {
                    map.addLayer({
                        id: 'zfe-outline', type: 'line', source: 'zfe-zones', slot: 'middle',
                        paint: {
                            'line-color': ['case', ['get', 'restricted'], '#ff4d4d', '#3fb950'],
                            'line-width': 2, 'line-opacity': 0.75, 'line-dasharray': [2, 1.5],
                            'line-emissive-strength': 1
                        }
                    });
                }
            } catch (e) { if (DEBUG) console.warn('[ZFE] couches carto :', e); }
        }

        function _zfeRefreshMapLayer() {
            try {
                _zfeEnsureMapLayers();
                const src = map.getSource && map.getSource('zfe-zones');
                if (!src) return;
                const seen = new Set();
                const features = [];
                zfeRouteCrossings.forEach(c => {
                    if (seen.has(c.zone.id)) return;
                    seen.add(c.zone.id);
                    features.push({
                        type: 'Feature',
                        geometry: c.zone.poly,
                        properties: { restricted: !!c.restricted, nom: c.zone.nom }
                    });
                });
                src.setData({ type: 'FeatureCollection', features });
            } catch (e) { if (DEBUG) console.warn('[ZFE] setData :', e); }
        }

        function clearZFEMapLayer() {
            zfeRouteCrossings = [];
            tenterSansBruit(() => {
                const src = map.getSource && map.getSource('zfe-zones');
                if (src) src.setData({ type: 'FeatureCollection', features: [] });
            }, 'clearZFEMapLayer');
        }

        // ── Alertes en navigation ────────────────────────────────────────────
        function showZFEBanner(nom, msg, url, isInfo) {
            const banner = document.getElementById('zfe-banner');
            const msgEl  = document.getElementById('zfe-banner-msg');
            const linkEl = document.getElementById('zfe-banner-link');
            const titleEl = document.getElementById('zfe-banner-title');
            if (!banner || !msgEl || !linkEl || !titleEl) return;
            titleEl.textContent = isInfo ? `🏭 ${nom}` : `⛔ ${nom}`;
            msgEl.textContent = msg;
            if (url) { linkEl.href = url; linkEl.style.display = 'inline-block'; }
            else     { linkEl.style.display = 'none'; }
            banner.classList.toggle('info', !!isInfo);
            banner.classList.add('visible');
            if (!isInfo && typeof playAudioSequence === 'function') {
                try { playAudioSequence(['attention.ogg']); } catch (e) { logAppError('zfe/alerteSonore', e); }
            }
            clearTimeout(_zfeBannerTimer);
            _zfeBannerTimer = setTimeout(closeZFEBanner, isInfo ? 9000 : 15000);
        }

        function closeZFEBanner() {
            clearTimeout(_zfeBannerTimer);
            document.getElementById('zfe-banner')?.classList.remove('visible');
        }

        // Alerte anticipée le long de l'itinéraire (mode guidé)
        function checkZFEApproach(distAlongKm, speedKmh) {
            if (!zfeAlertsEnabled() || !isCourseStarted || !zfeRouteCrossings.length) return;
            const spd = speedKmh > 5 ? speedKmh : 50;
            const leadKm = Math.max(0.8, (spd / 60) * 1.5);   // ~1 min 30 d'anticipation
            zfeRouteCrossings.forEach(c => {
                if (c.alerted || !c.restricted) return;
                const delta = c.entryKm - distAlongKm;
                if (delta <= leadKm && delta > -0.1) {
                    c.alerted = true;
                    const url = c.zone.props?.url_site || c.zone.props?.url_arrete;
                    const dist = delta > 0.1 ? `dans ${Math.round(delta * 1000)} m` : 'maintenant';
                    showZFEBanner(
                        c.zone.nom,
                        `Entrée ${dist} : ${c.required ? CRITAIR_LABEL[c.required] + ' minimum requis' : 'circulation restreinte'}. ` +
                        `Votre vignette ${CRITAIR_LABEL[getCritAir()]} n'est pas autorisée${zfeZonesApprox ? ' (périmètre approximatif)' : ''}.`,
                        url, false
                    );
                }
            });
        }

        // Détection par position réelle : fonctionne aussi en trajet libre (sans itinéraire)
        function checkZFELive(lng, lat) {
            if (!zfeAlertsEnabled() || !zfeZones) return;
            const now = Date.now();
            if (now - _zfeLastLiveCheck < 12000) return;   // 1 test toutes les 12 s
            _zfeLastLiveCheck = now;

            let found = null;
            for (const z of zfeZones) {
                if (lng < z.bbox[0] || lng > z.bbox[2] || lat < z.bbox[1] || lat > z.bbox[3]) continue;
                if (_zfePointInZone(z, lng, lat)) { found = z; break; }
            }
            if (!found) { _zfeLiveInsideId = null; return; }
            if (_zfeLiveInsideId === found.id) return;      // déjà signalée
            _zfeLiveInsideId = found.id;

            const res = zfeEvaluateZone(found);
            if (!res.concerned) return;
            const url = found.props?.url_site || found.props?.url_arrete;
            if (res.restricted) {
                showZFEBanner(found.nom,
                    `Vous êtes dans la zone : ${CRITAIR_LABEL[res.required]} minimum requis, votre vignette ${CRITAIR_LABEL[getCritAir()]} ne permet pas d'y circuler.`,
                    url, false);
            } else {
                showZFEBanner(found.nom,
                    `Vous entrez dans cette ZFE. Votre vignette ${CRITAIR_LABEL[getCritAir()]} est autorisée${res.active ? '' : " (hors horaires d'application)"}.`,
                    url, true);
            }
        }

        function resetZFEForTrip() {
            zfeRouteCrossings.forEach(c => { c.alerted = false; });
            _zfeLiveInsideId = null;
            _zfeLastLiveCheck = 0;
            closeZFEBanner();
        }

        // ── Interface (Profil → Mon véhicule / Aide à la conduite) ───────────
        function selectCritAir(level) {
            if (!CRITAIR_RANK.hasOwnProperty(level)) return;
            localStorage.setItem(ZFE_CRITAIR_KEY, level);
            document.querySelectorAll('.critair-pill').forEach(p => p.classList.toggle('active', p.dataset.level === level));
            _zfeReanalyzeCurrentRoute();
        }

        function selectZFECategory(cat) {
            localStorage.setItem(ZFE_CATEGORY_KEY, cat);
            _zfeReanalyzeCurrentRoute();
        }

        function onZFEToggleChange() {
            const chk = document.getElementById('zfe-toggle');
            localStorage.setItem(ZFE_ENABLED_KEY, chk && chk.checked ? '1' : '0');
            if (!chk || !chk.checked) { clearZFEMapLayer(); renderZFEPreviewCard(); closeZFEBanner(); }
            else _zfeReanalyzeCurrentRoute();
        }

        function _zfeReanalyzeCurrentRoute() {
            const coords = modalPendingRoute?.osrmData?.routes?.[0]?.geometry?.coordinates
                        || (isCourseStarted && fullRouteLine ? fullRouteLine.geometry.coordinates : null);
            if (coords && coords.length > 1) analyzeZFEForRoute(coords);
        }

        function initCritAirUI() {
            const level = getCritAir();
            document.querySelectorAll('.critair-pill').forEach(p => p.classList.toggle('active', p.dataset.level === level));
            const sel = document.getElementById('zfe-vehicle-category');
            if (sel) sel.value = getZFECategory();
            const chk = document.getElementById('zfe-toggle');
            if (chk) chk.checked = zfeAlertsEnabled();
            // Préchargement discret de la base (cache 7 jours) pour éviter l'attente au 1er trajet
            if (zfeAlertsEnabled()) setTimeout(() => { loadZFEData().catch(() => {}); }, 3000);
        }

        // Estimation du coût des péages basée sur la distance sur autoroute (~0.09€/km en moyenne en France)
        function estimateTollCost(osrmData) {
            if (avoidTolls) return 0;
            if (!osrmData || !osrmData.routes || !osrmData.routes[0].legs) return 0;

            let tollDistKm = 0;
            osrmData.routes[0].legs.forEach(leg => {
                (leg.steps || []).forEach(step => {
                    if (step.duration > 0 && step.distance > 500) {
                        const stepSpeedKmh = (step.distance / step.duration) * 3.6;
                        if (stepSpeedKmh > 80) {
                            const coords = step.maneuver && step.maneuver.location;
                            if (coords) {
                                const lng = coords[0], lat = coords[1];
                                // Frontières ajustées : la France-Belgique est à ~50.3-50.4 sur l'axe A1
                                const inBelgium = lat > 50.3 && lng > 2.5 && lat < 51.5 && lng < 6.4;
                                const inGermany = lng > 6.8 && lat > 47.3 && lat < 55;
                                const inSpain = lat < 43.0 && lng > -9.4;
                                const inItaly = lng > 6.6 && lat < 46.5 && lat > 43.5;
                                const inSuisse = lng > 5.9 && lng < 10.5 && lat > 45.8 && lat < 47.8;
                                const excluded = inBelgium || inGermany || inSpain || inItaly || inSuisse;
                                if (!excluded) {
                                    tollDistKm += step.distance / 1000;
                                }
                            }
                        }
                    }
                });
            });
            return tollDistKm * 0.08;
        }

        async function calculateTripPreview() {
            const modalStatus = document.getElementById('modal-status');
            const startVal = document.getElementById('modal-start-addr').value.trim();
            const endVal = document.getElementById('modal-end-addr').value.trim();
            if (!startVal || !endVal) { modalStatus.innerText = "Veuillez renseigner le départ et la destination."; modalStatus.style.color = "#ff6b6b"; return; }

            modalStatus.innerText = "🔄 Calcul de l'itinéraire (trafic Mapbox)..."; modalStatus.style.color = "#f39c12";
            document.getElementById('btn-validate-trip').disabled = true; document.getElementById('trip-preview').style.display = 'none';
            document.getElementById('route-alternatives').classList.remove('visible');

            try {
                let startCoordsResolved = (!modalStartManuallyEdited && modalStartCoords)
                    ? normalizeLngLat(modalStartCoords) : null;
                if (!startCoordsResolved) startCoordsResolved = normalizeLngLat(await geocode(startVal));
                let endCoordsResolved = normalizeLngLat(modalEndCoords);
                if (!endCoordsResolved) endCoordsResolved = normalizeLngLat(await geocode(endVal));
                // Message explicite plutôt que l'erreur brute de Mapbox sur un NaN.
                if (!startCoordsResolved) throw new Error("Point de départ introuvable, précisez l'adresse.");
                if (!endCoordsResolved) throw new Error("Destination introuvable, précisez l'adresse.");
                modalStartCoords = startCoordsResolved; modalEndCoords = endCoordsResolved;

                // Collecter les coords des waypoints validés (les étapes dont les
                // coordonnées sont inexploitables sont écartées plutôt que transmises)
                const validWaypoints = modalWaypoints
                    .map(w => ({ label: w.label, coords: normalizeLngLat(w.coords) }))
                    .filter(w => w.coords);
                const waypointCoords = validWaypoints.map(w => w.coords);
                const osrmData = await fetchRouteMapbox(startCoordsResolved, endCoordsResolved, avoidTolls, false, waypointCoords);

                // Stocker toutes les routes alternatives (max 3) — désactivées si waypoints présents
                altRoutesData = osrmData.routes.slice(0, 3);
                selectedRouteIndex = 0; // sélectionner la plus rapide par défaut

                const route = altRoutesData[selectedRouteIndex];
                // Distance et durée : sommer les legs (1 leg par segment entre waypoints)
                const distanceMeters = route.legs ? route.legs.reduce((s, l) => s + l.distance, 0) : route.distance;
                const distanceKm = distanceMeters / 1000;
                const totalDurationHours = (route.legs ? route.legs.reduce((s, l) => s + l.duration, 0) : route.duration) / 3600;
                const maxPoints = distanceMeters * POINTS_PER_METER;
                modalPendingRoute = {
                    osrmData: { code: "Ok", routes: [route] },
                    startCoords: startCoordsResolved,
                    endCoords: endCoordsResolved,
                    waypoints: waypointCoords,
                    waypointLabels: validWaypoints.map(w => w.label),
                    avoidTolls
                };

                const geojsonRoute = route.geometry;
                setRouteLine(geojsonRoute.coordinates);
                currentTurfLine = turf.lineString(geojsonRoute.coordinates);

                /* ⚠ TOUT CE QUI SUIT EST DE L'AFFICHAGE, PAS DU CALCUL.
                   L'itinéraire est déjà obtenu et modalPendingRoute est renseigné :
                   un incident de rendu (marqueur, cadrage, tracé alternatif) ne doit
                   PAS remonter au catch général, qui remettrait modalPendingRoute à
                   null et redésactiverait « Lancer le trajet ». On se retrouvait
                   alors avec un trajet parfaitement calculé, tracé à l'écran, mais
                   impossible à démarrer — et un message Mapbox brut
                   (« Invalid LngLat object: (NaN, NaN) ») en guise d'explication.
                   L'incident est journalisé pour diagnostic, l'aperçu continue. */
                try {
                    // Afficher les routes alternatives sur la carte
                    showAltRoutesOnMap(altRoutesData);

                    if (startTempMarker) startTempMarker.remove();
                    startTempMarker = addEmojiMarker(startCoordsResolved[0], startCoordsResolved[1], '🟢');
                    if (endTempMarker) endTempMarker.remove();
                    endTempMarker = addEmojiMarker(endCoordsResolved[0], endCoordsResolved[1], '🔴');

                    // Fit bounds sur toutes les routes
                    // Inclure la route principale + alternatives + waypoints + départ + arrivée
                    // Le filtre isLngLat est indispensable : un seul point aberrant rendrait
                    // toute la bbox NaN et ferait échouer le fitBounds.
                    const allCoords = [
                        ...geojsonRoute.coordinates,
                        ...altRoutesData.flatMap(r => (r.geometry && r.geometry.coordinates) || []),
                        ...waypointCoords,
                        startCoordsResolved,
                        endCoordsResolved
                    ].filter(isLngLat);
                    if (allCoords.length >= 2) {
                        const allBbox = turf.bbox({ type: 'Feature', geometry: { type: 'LineString', coordinates: allCoords } });
                        if (allBbox.every(Number.isFinite)) {
                            fitMapToModalRoute([[allBbox[0], allBbox[1]], [allBbox[2], allBbox[3]]]);
                        }
                    }
                    isUserPanning = true; showRecenterBtn(true);
                } catch (errAffichage) {
                    logAppError('calculateTripPreview/affichage', errAffichage);
                }

                // Afficher les résultats
                document.getElementById('preview-time').innerText = formatTime(totalDurationHours);
                document.getElementById('preview-distance').innerText = distanceKm.toFixed(1) + " km";
                document.getElementById('preview-points').innerText = maxPoints.toFixed(2) + " pts";

                // Calcul du coût
                const cfg = loadVehicleConfig();
                const fuelCost = calcEnergyCost(distanceKm, cfg);
                const tollCost = avoidTolls ? 0 : estimateTollCost({ routes: [route] });
                const totalCost = fuelCost + tollCost;

                document.getElementById('preview-fuel-cost').innerText = fuelCost.toFixed(2) + " €";
                document.getElementById('preview-toll-cost').innerText = avoidTolls ? "Évités" : (tollCost > 0 ? "~" + tollCost.toFixed(2) + " €" : "Aucun");
                document.getElementById('preview-total-cost').innerText = "~" + totalCost.toFixed(2) + " €";
                updateFuelCostLabel();

                document.getElementById('trip-preview').style.display = 'flex';

                // Analyse ZFE / Crit'Air sur l'itinéraire retenu (asynchrone, ne bloque pas l'aperçu)
                analyzeZFEForRoute(route.geometry.coordinates);

                // Construire le sélecteur d'itinéraires alternatifs
                buildRouteAlternativesUI(altRoutesData);

                // Afficher section péages
                const tollSection = document.getElementById('modal-toll-section');
                if (tollSection) {
                    tollSection.style.display = 'block';
                    // Initialiser l'état des boutons Oui/Non selon la préférence sauvegardée
                    const btnOui = document.getElementById('toll-btn-oui');
                    const btnNon = document.getElementById('toll-btn-non');
                    if (btnOui) btnOui.classList.toggle('active-oui', avoidTolls);
                    if (btnNon) btnNon.classList.toggle('active-non', !avoidTolls);
                }

                /* Aucun message de succès : le trajet calculé se voit déjà — tracé sur la
                   carte, temps/distance/coût remplis, « Lancer le trajet » qui s'allume.
                   Un bandeau vert de plus ne faisait que repousser le bouton vers le bas.
                   ⚠ On VIDE quand même la ligne de statut : elle a pu recevoir « Entrez un
                   point de départ. » ou un message d'erreur au calcul précédent, qui
                   resterait affiché sous un aperçu pourtant valide. Le nombre
                   d'itinéraires alternatifs reste lisible dans « Choix itinéraire ». */
                modalStatus.innerText = "";
                modalStatus.style.color = "";
                document.getElementById('btn-validate-trip').disabled = false;

                // Reset état panels stations + itinéraires
                _baseRouteForGas = null;
                _gasSearchWindow = null;
                _gasPrefetchDone = false;
                resetGasLiveScan();
                // Les verdicts de détour portent sur l'ancien tracé : les purger.
                _allGasStations.forEach(s => { s._deltaMin = null; s._distAnchor = null; });
                _gasStationsPanelOpen = false;
                _routeChoicePanelOpen = false;
                const gasPanel   = document.getElementById('gas-stations-panel');
                const gasCh      = document.getElementById('gas-toggle-chevron');
                const gasSection = document.getElementById('gas-stations-section');
                const routePanel = document.getElementById('route-choice-panel');
                const routeCh    = document.getElementById('route-choice-chevron');
                if (gasPanel)   gasPanel.style.display = 'none';
                if (gasCh)      gasCh.style.transform  = 'rotate(0deg)';
                /* Section masquée quand la destination EST la station choisie : on ne
                   propose pas un ravitaillement en chemin vers un ravitaillement. Les
                   autres sections (itinéraires, péages, infos) restent en place. */
                if (gasSection) gasSection.classList.toggle('visible', !_destIsChosenStation());
                if (routePanel) routePanel.style.display = 'none';
                if (routeCh)    routeCh.style.transform   = 'rotate(0deg)';
                document.getElementById('gas-stations-list').innerHTML = '';
                clearGasStationMarkers();

                // PHASE 1 — préchargement automatique des stations dès que le tracé
                // est prêt. L'utilisateur n'a plus à ouvrir le panneau puis attendre :
                // le scan tourne en tâche de fond pendant qu'il lit l'aperçu du trajet.
                prefetchGasStationsPhase1(route.geometry.coordinates);
            } catch (err) {
                logAppError('calculateTripPreview', err);
                // Les messages internes de Mapbox ne veulent rien dire pour l'utilisateur
                // (« Invalid LngLat object: (NaN, NaN) ») : on les traduit à l'écran, le
                // texte d'origine restant dans gps_error_log avec sa pile d'appel.
                const brut = err.message || '';
                modalPendingRoute = null;
                modalStatus.innerText = /LngLat|NaN/i.test(brut)
                    ? "Une des adresses n'a pas de position exploitable. Reprenez la saisie et choisissez une suggestion dans la liste."
                    : (brut || "Erreur lors du calcul de l'itinéraire.");
                modalStatus.style.color = "#ff6b6b"; document.getElementById('btn-validate-trip').disabled = true;
            }
        }

        // ═══════════════════════════════════════════════════════════════════

        
        // ═══════════════════════════════════════════════════════════
        // === OUTILS BOUCLE HAUTE FRÉQUENCE (rAF 60 fps) ===
        // ═══════════════════════════════════════════════════════════

        // Mets ?debug=1 dans l'URL pour réactiver les logs appelés depuis la
        // boucle d'animation. Désactivés en usage normal : certains de ces logs
        // évaluaient des méthodes Mapbox 60 fois par seconde.
        const DEBUG = (typeof location !== 'undefined' && /[?&]debug=1/.test(location.search));

        // Cache de résolution d'éléments par id. getElementById est rapide,
        // mais 30 appels x 60 fps x N conducteurs reste du gaspillage pur.
        const _elCache = new Map();
        function getEl(id) {
            const el = _elCache.get(id);
            // Revalidation : un noeud peut avoir été remplacé (re-render d'une carte conducteur)
            if (el && el.isConnected) return el;
            const fresh = document.getElementById(id);
            if (fresh) _elCache.set(id, fresh); else _elCache.delete(id);
            return fresh;
        }
        function invalidateElCache() { _elCache.clear(); }

        // Écriture DOM conditionnelle : n'écrit que si la valeur a changé.
        // Les vitesses/distances arrondies ne varient que quelques fois par
        // seconde — cela supprime l'essentiel des invalidations de layout.
        // Retourne false si l'élément est absent (au lieu de lever une TypeError).
        function setText(id, val) {
            const el = (typeof id === 'string') ? getEl(id) : id;
            if (!el) return false;
            const v = String(val);
            if (el._lastText !== v) { el._lastText = v; el.innerText = v; }
            return true;
        }

        // Idem pour une propriété de style (couleur des points, etc.)
        function setStyleProp(id, prop, val) {
            const el = (typeof id === 'string') ? getEl(id) : id;
            if (!el) return false;
            const key = '_lastStyle_' + prop;
            if (el[key] !== val) { el[key] = val; el.style[prop] = val; }
            return true;
        }

        // Bascule de classe sans écriture inutile
        function setClass(id, cls, on) {
            const el = (typeof id === 'string') ? getEl(id) : id;
            if (!el) return false;
            const key = '_lastCls_' + cls;
            if (el[key] !== on) { el[key] = on; el.classList.toggle(cls, !!on); }
            return true;
        }

        // ⚠️ SÉCURITÉ CLÉ MAPBOX : ce token est un token PUBLIC Mapbox (préfixe "pk."),
        // conçu pour être exposé côté client — ce n'est pas une clé secrète.
        // La vraie protection se fait dans le dashboard Mapbox (account.mapbox.com/access-tokens) :
        // configure une "URL restriction" limitant son usage au(x) domaine(s) où l'app est hébergée
        // (ex: tondomaine.com/*). Sans ça, n'importe qui récupérant ce fichier peut consommer ton quota.
        const MAPBOX_TOKEN = 'pk.eyJ1Ijoic2FsaWZlcmljIiwiYSI6ImNtczEwODdjNjAxMjEyeHNoMWo1cWg0ZHMifQ.dXQjrsTIhPvWMi_9WYroMw';

        // === FIABILITÉ RÉSEAU ===
        // Wrapper fetch avec timeout + une tentative de nouvel essai, pour tenir la route
        // en cas de réseau instable (tunnels, campagne, zones blanches).
        async function fetchResilient(url, options = {}, { timeoutMs = 10000, retries = 1 } = {}) {
            let lastError = null;
            for (let attempt = 0; attempt <= retries; attempt++) {
                const controller = new AbortController();
                const timer = setTimeout(() => controller.abort(), timeoutMs);
                try {
                    const res = await fetch(url, { ...options, signal: controller.signal });
                    clearTimeout(timer);
                    return res;
                } catch (err) {
                    clearTimeout(timer);
                    lastError = err;
                    if (attempt < retries) await new Promise(r => setTimeout(r, 1200));
                }
            }
            if (!navigator.onLine) throw new Error("Pas de connexion internet.");
            if (lastError && lastError.name === 'AbortError') throw new Error("Connexion trop lente, réessayez.");
            throw new Error("Erreur réseau, réessayez.");
        }

        // === JOURNAL D'ERREURS INTERNE ===
        /* Sans débogueur branché sur l'APK, une erreur survenue en conduite est perdue.
           On conserve donc les dernières exceptions (message + pile + contexte) en
           localStorage. La clé est incluse dans l'export de profil, ce qui permet de
           relire après coup ce qui s'est réellement passé. */
        const ERROR_LOG_KEY = 'gps_error_log';
        const ERROR_LOG_MAX = 20;

        function logAppError(context, err) {
            try {
                let log = [];
                const raw = localStorage.getItem(ERROR_LOG_KEY);
                if (raw) { try { log = JSON.parse(raw) || []; } catch (e) { log = []; } }
                if (!Array.isArray(log)) log = [];
                log.push({
                    t: new Date().toISOString(),
                    ctx: context,
                    msg: (err && err.message) ? String(err.message) : String(err),
                    stack: (err && err.stack) ? String(err.stack).split('\n').slice(0, 6).join(' | ') : null
                });
                if (log.length > ERROR_LOG_MAX) log = log.slice(-ERROR_LOG_MAX);
                localStorage.setItem(ERROR_LOG_KEY, JSON.stringify(log));
            } catch (e) { /* stockage plein : on n'aggrave pas la situation */ }
            if (DEBUG) console.error('[' + context + ']', err);
        }

        /* Lecture du journal depuis l'app (onglet Profil → 🩺 Journal d'erreurs).
           Un bug qui ne se produit que sur le téléphone — géoloc réelle, vraies barres
           système, vrai clavier — ne laisse aucune trace atteignable autrement : le
           console.error de logAppError() n'est émis que sous ?debug=1, et brancher un
           débogueur sur l'appareil n'est pas toujours possible. */
        /* === TRACES DE DIAGNOSTIC ===
           Un symptôme qui n'existe QUE sur téléphone (hauteur de canevas réelle, barres
           système, fix GPS continus) ne se diagnostique pas par lecture de code : les deux
           environnements ne calculent pas les mêmes nombres. On enregistre donc les
           valeurs elles-mêmes, relues dans le même lecteur que les erreurs.
           Clé SÉPARÉE : ces traces sont volumineuses et régulières, les mêler aux erreurs
           chasserait ces dernières des 20 emplacements du journal. */
        const DIAG_LOG_KEY = 'gps_diag_log';
        const DIAG_LOG_MAX = 12;

        function logDiag(ctx, data) {
            try {
                let log = [];
                const raw = localStorage.getItem(DIAG_LOG_KEY);
                if (raw) { try { log = JSON.parse(raw) || []; } catch (e) { log = []; } }
                if (!Array.isArray(log)) log = [];
                log.push({ t: new Date().toISOString(), ctx, msg: JSON.stringify(data) });
                if (log.length > DIAG_LOG_MAX) log = log.slice(-DIAG_LOG_MAX);
                localStorage.setItem(DIAG_LOG_KEY, JSON.stringify(log));
            } catch (e) {}
            if (DEBUG) console.log('[diag ' + ctx + ']', data);
        }

        /* Les messages d'erreur sont du texte non maîtrisé : ils contiennent des URL, des
           fragments de code et parfois des chevrons (« Invalid <LngLat> »). Injectés tels
           quels, ils tronqueraient l'affichage au premier < rencontré. */
        function _escHtml(s) {
            return String(s == null ? '' : s)
                .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        function readErrorLog() {
            try {
                const log = JSON.parse(localStorage.getItem(ERROR_LOG_KEY) || '[]');
                return Array.isArray(log) ? log : [];
            } catch (e) { return []; }
        }

        function readDiagLog() {
            try {
                const log = JSON.parse(localStorage.getItem(DIAG_LOG_KEY) || '[]');
                return Array.isArray(log) ? log : [];
            } catch (e) { return []; }
        }

        function renderErrorLog() {
            const box = document.getElementById('error-log-list');
            if (!box) return;
            /* Erreurs et traces de diagnostic sont FUSIONNÉES et triées par date : c'est la
               chronologie qui rend un incident lisible — quelle mesure précédait l'erreur,
               quelle commande a suivi. Deux listes séparées obligeraient à recoudre les
               horodatages à la main sur un écran de téléphone. */
            const tout = readErrorLog().map(e => ({ ...e, diag: false }))
                .concat(readDiagLog().map(e => ({ ...e, diag: true })))
                .sort((a, b) => String(a.t || '').localeCompare(String(b.t || '')));
            if (!tout.length) {
                box.innerHTML = '<div style="font-size:11px;color:#4a5568;font-style:italic;padding:6px;">Aucune erreur enregistrée.</div>';
                return;
            }
            // Plus récente en tête : c'est celle qui correspond au symptôme qu'on vient
            // d'observer, et la liste peut en contenir une vingtaine.
            box.innerHTML = tout.reverse().map(e => {
                const quand = (e.t || '').replace('T', ' ').slice(0, 19);
                const teinte = e.diag ? '0,140,255' : '255,150,0';
                const titre  = e.diag ? '#58a6ff' : '#ff9500';
                return '<div style="background:#060a12;border:1px solid rgba(' + teinte + ',0.18);border-radius:8px;padding:8px;">'
                     + '<div style="font-size:10px;color:' + titre + ';font-weight:800;">' + (e.diag ? '🔬 ' : '') + _escHtml(e.ctx || '?') + '</div>'
                     + '<div style="font-size:9px;color:#4a5568;margin:2px 0;">' + _escHtml(quand) + '</div>'
                     + '<div style="font-size:11px;color:#cbd5e0;word-break:break-word;">' + _escHtml(e.msg || '') + '</div>'
                     + (e.stack ? '<div style="font-size:9px;color:#4a5568;margin-top:4px;word-break:break-all;">' + _escHtml(e.stack) + '</div>' : '')
                     + '</div>';
            }).join('');
        }

        function toggleErrorLogView() {
            const view = document.getElementById('error-log-view');
            if (!view) return;
            const ouvert = view.style.display !== 'none';
            view.style.display = ouvert ? 'none' : 'block';
            if (!ouvert) renderErrorLog();
        }

        function copyErrorLog() {
            const texte = JSON.stringify({ erreurs: readErrorLog(), diag: readDiagLog() }, null, 2);
            const box = document.getElementById('error-log-copybox');
            try {
                navigator.clipboard.writeText(texte).catch(() => { if (box) { box.style.display = 'block'; box.value = texte; box.select(); } });
            } catch (e) {
                if (box) { box.style.display = 'block'; box.value = texte; box.select(); }
            }
        }

        function clearErrorLog() {
            try { localStorage.removeItem(ERROR_LOG_KEY); } catch (e) {}
            try { localStorage.removeItem(DIAG_LOG_KEY); } catch (e) {}
            renderErrorLog();
        }

        window.addEventListener('error', (e) => {
            logAppError('window.onerror @ ' + (e.filename || '?') + ':' + (e.lineno || '?'), e.error || e.message);
        });
        window.addEventListener('unhandledrejection', (e) => {
            logAppError('promesse non gérée', e.reason);
        });

        // ═══════════════════════════════════════════════════════════

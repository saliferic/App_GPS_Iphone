        /* ═══════════════════════════════════════════════════════════════════════════
           CLASSEMENT EN LIGNE (23/08/2026)
           ═══════════════════════════════════════════════════════════════════════════
           Le seul morceau de l'app qui parle à un serveur qui nous appartient. Tout le
           reste (Mapbox, Overpass, BAN, Photon) est en lecture seule et anonyme ; ici on
           écrit, sous une identité.

           TROIS PRINCIPES, dans l'ordre où ils comptent :

           1. **Les points s'accumulent EN LOCAL d'abord, toujours.** `clAjouter()` écrit
              dans le localStorage et rend la main ; l'envoi réseau vient après, en
              silence, et son échec n'est jamais une erreur pour l'utilisateur. Un
              conducteur roule dans des tunnels et des zones blanches : un score qui
              dépendrait du réseau au moment du trajet serait un score perdu.
           2. **Aucun compte n'est créé tant que l'utilisateur n'en demande pas un.** On
              n'ouvre PAS de session anonyme au chargement (⚠ contrairement à ce qui
              était prévu au départ) : ça peuplait `auth.users` de comptes fantômes, un
              par installation, pour un bénéfice nul — sans second appareil, une session
              anonyme n'apporte rien qu'un localStorage ne fasse déjà. À l'inscription,
              le total local de la semaine en cours est poussé d'un coup : rien n'est
              perdu, et le réglage « Allow anonymous sign-ins » de Supabase reste inutile.
           3. **Le classement est trichable, et c'est assumé.** La clé ci-dessous est
              publique par construction (elle part dans chaque requête depuis le
              navigateur). N'importe qui peut poster le score qu'il veut avec un `curl`.
              Le `check` SQL borne l'absurde, il n'empêche pas la triche : seul un calcul
              de points côté serveur le ferait, et il faudrait lui envoyer les trajets
              bruts. ⚠ NE JAMAIS mettre la clé `service_role` dans ce fichier — elle
              contourne toute la RLS et donnerait à chaque installation les droits
              d'administration de la base.

           Dépendance : `@supabase/supabase-js` en UMD (balise <script> classique, comme
           turf et mapbox-gl). ⚠ Build `dist/umd/` explicitement, PAS la racine du
           paquet, qui sert de l'ESM et ne définirait aucun global. Le CDN peut tomber ou
           être bloqué : `_clPret()` garde tous les points d'entrée, et l'app entière doit
           continuer de fonctionner sans lui — le classement n'est pas une fonction
           vitale d'un GPS. */

        // === CONFIGURATION DU PROJET SUPABASE ===
        const CLASSEMENT_URL = 'https://husqmdqwqunufgjbcmsk.supabase.co';
        const CLASSEMENT_KEY = 'sb_publishable_2IOxe6QVMsUflUfFuoUN_A_loUc8zbL';

        let _sbClient   = null;   // client supabase-js, ou null si le CDN n'a pas répondu
        let _clProfil   = null;   // { user_id, pseudo } du compte connecté, sinon null
        let _clEnvoiTimer = null; // anti-rafale de `clPousser()`

        /* Le client se crée UNE fois, à la demande, jamais au chargement : instancier au
           top-level lèverait si le CDN a échoué, et une exception au top-level d'un
           fichier interrompt l'évaluation de TOUT le fichier (piège documenté dans
           AGENTS.md, section « Règles de chargement du JS »). */
        function _clPret() {
            if (_sbClient) return _sbClient;
            if (typeof supabase === 'undefined' || !supabase.createClient) return null;
            try {
                _sbClient = supabase.createClient(CLASSEMENT_URL, CLASSEMENT_KEY, {
                    auth: { persistSession: true, autoRefreshToken: true }
                });
            } catch (e) {
                logAppError('classement/createClient', e);
                return null;
            }
            return _sbClient;
        }

        // ═══════════════════════════════════════════════════════════════
        // === CUMUL LOCAL DE LA SEMAINE ===
        // ═══════════════════════════════════════════════════════════════

        /* Une clé par profil local : plusieurs conducteurs partagent l'appareil (c'est
           tout l'objet du sélecteur de profils), et leurs scores ne doivent pas fusionner.
           Sans profil actif, on garde une clé neutre plutôt que de perdre les points. */
        function _clKey() {
            return 'gps_classement_' + (activeProfileId || 'sans_profil');
        }

        function clLireLocal() {
            const semaine = _lundiISO();
            const vide = { semaine, points: 0, pousse: 0, compte: null };
            try {
                const brut = localStorage.getItem(_clKey());
                if (!brut) return vide;
                const o = JSON.parse(brut);
                if (!o) return vide;
                /* ⚠ `compte` SURVIT au changement de semaine, contrairement aux points :
                   c'est un lien d'identité, pas un compteur. Le remettre à zéro chaque
                   lundi délierait silencieusement le profil de son compte en ligne. */
                const compte = o.compte || null;
                /* Semaine révolue → on repart de zéro SANS toucher au serveur : la ligne
                   de la semaine passée reste en base, c'est elle qui fait l'historique. */
                if (o.semaine !== semaine) return { semaine, points: 0, pousse: 0, compte };
                return { semaine, points: Number(o.points) || 0, pousse: Number(o.pousse) || 0, compte };
            } catch (e) {
                logAppError('classement/lireLocal', e);
                return vide;
            }
        }

        function clEcrireLocal(etat) {
            try { localStorage.setItem(_clKey(), JSON.stringify(etat)); }
            catch (e) { logAppError('classement/ecrireLocal', e); }
        }

        /* ═══ LE LIEN PROFIL LOCAL ↔ COMPTE EN LIGNE (corrigé le 23/08/2026) ═══
           Le cumul de points est stocké PAR PROFIL LOCAL (plusieurs conducteurs se
           partagent l'appareil), la session Supabase est GLOBALE à l'appareil. Sans lien
           explicite entre les deux, « le profil actif au moment de l'envoi » faisait
           office de règle — et ça se voyait : les points de Steve remontaient dans la
           ligne du compte « Saliferic », et changer de profil local sans se déconnecter
           écrasait le score d'un compte avec celui d'un autre conducteur.
           Désormais chaque état local porte le `user_id` auquel il est lié, et
           `clPousser()` refuse d'envoyer quand ça ne correspond pas. */
        function clEstLie() {
            return !!(_clProfil && clLireLocal().compte === _clProfil.user_id);
        }

        /* Appelé après CHAQUE connexion réussie : se connecter sous un compte depuis un
           profil local, c'est déclarer que ce profil concourt sous ce compte. */
        function clLierProfil() {
            if (!_clProfil) return;
            const etat = clLireLocal();
            if (etat.compte === _clProfil.user_id) return;
            /* Un compte ne peut représenter qu'UN profil local à la fois : si un autre
               profil de cet appareil pointait déjà sur ce compte, on le délie, sinon les
               deux pousseraient à tour de rôle dans la même ligne. */
            try {
                (typeof profiles !== 'undefined' ? profiles : []).forEach(p => {
                    if (!p || p.id === activeProfileId) return;
                    const k = 'gps_classement_' + p.id;
                    const brut = localStorage.getItem(k);
                    if (!brut) return;
                    const autre = JSON.parse(brut);
                    if (autre && autre.compte === _clProfil.user_id) {
                        autre.compte = null;
                        localStorage.setItem(k, JSON.stringify(autre));
                    }
                });
            } catch (e) { logAppError('classement/lierProfil', e); }
            etat.compte = _clProfil.user_id;
            etat.pousse = 0;   // le lien vient de changer : renvoyer le total complet
            clEcrireLocal(etat);
        }

        /* SEUL point d'entrée depuis le reste de l'app — appelé par
           `addPointsToActiveProfile()` (13-stats-eco.js), qui est lui-même le passage
           obligé de toute attribution de points. Un seul branchement, donc, et pas un
           par chemin d'attribution. */
        function clAjouter(gagnes) {
            const pts = Number(gagnes);
            if (!isFinite(pts) || pts <= 0) return;
            const etat = clLireLocal();
            etat.points = clampPointsClassement(etat.points + pts);
            clEcrireLocal(etat);
            clPousserDiffere();
        }

        /* Anti-rafale : un trajet peut créditer des points en deux temps (score de base
           puis bonus de coffre). Deux `upsert` à trois secondes d'écart pour la même
           ligne ne servent à rien — on ne garde que le dernier état. */
        function clPousserDiffere() {
            if (!_clProfil) return;
            clearTimeout(_clEnvoiTimer);
            _clEnvoiTimer = setTimeout(() => { clPousser(); }, 4000);
        }

        // ═══════════════════════════════════════════════════════════════
        // === ÉCHANGES AVEC LE SERVEUR ===
        // ═══════════════════════════════════════════════════════════════

        /* Envoie le total de la semaine en cours. `upsert` sur la clé (user_id, semaine)
           : la première fois de la semaine c'est un INSERT, ensuite un UPDATE, sans avoir
           à savoir lequel. On envoie un TOTAL, pas un delta — un delta perdu par une
           coupure réseau serait un delta perdu pour toujours, alors qu'un total se
           rattrape tout seul au prochain envoi. */
        async function clPousser() {
            const sb = _clPret();
            if (!sb || !_clProfil) return false;
            const etat = clLireLocal();
            /* ⚠ LE GARDE-FOU. Le profil local actif n'est pas celui qui concourt sous ce
               compte : envoyer maintenant écraserait le score d'un autre conducteur. On
               ne pousse pas, et on ne signale rien — l'utilisateur n'a rien demandé, il a
               juste changé de profil. La modale, elle, l'explique. */
            if (etat.compte !== _clProfil.user_id) return false;
            try {
                const { error } = await sb.from('scores').upsert({
                    user_id: _clProfil.user_id,
                    semaine: etat.semaine,
                    points:  clampPointsClassement(etat.points),
                    maj_le:  new Date().toISOString()
                }, { onConflict: 'user_id,semaine' });
                if (error) throw error;
                etat.pousse = etat.points;
                clEcrireLocal(etat);
                return true;
            } catch (e) {
                /* Hors ligne, projet en pause, RLS refusée : on journalise et on s'arrête
                   là. `etat.pousse` reste en arrière, donc le prochain trajet — ou la
                   prochaine ouverture du classement — renverra le total complet. */
                logAppError('classement/pousser', e);
                return false;
            }
        }

        /* ⚠ À APPELER AVANT LE PREMIER `clPousser()` D'UNE SESSION. Sans elle, se
           connecter sur un appareil qu'on n'a jamais utilisé — le téléphone d'un proche,
           un téléphone de remplacement — EFFACE son propre score : le cumul local y vaut
           0, et `clPousser()` envoie un total, pas un delta.
           La fusion prend le PLUS GRAND des deux. Pas « le serveur gagne » : des points
           peuvent avoir été accumulés hors réseau sur l'appareil habituel, et ceux-là
           n'existent nulle part ailleurs. Un compteur hebdomadaire ne décroît jamais,
           le maximum est donc la seule fusion qui ne perd rien. */
        async function clFusionner() {
            const sb = _clPret();
            if (!sb || !_clProfil) return;
            const etat = clLireLocal();
            try {
                const { data, error } = await sb.from('scores')
                    .select('points')
                    .eq('user_id', _clProfil.user_id)
                    .eq('semaine', etat.semaine)
                    .maybeSingle();
                if (error) throw error;
                const serveur = data ? (Number(data.points) || 0) : 0;
                if (serveur > etat.points) {
                    etat.points = clampPointsClassement(serveur);
                    etat.pousse = etat.points;   // rien à renvoyer, on vient de le lire
                    clEcrireLocal(etat);
                }
            } catch (e) {
                /* Échec = on ne sait pas ce que vaut le serveur. Ne surtout pas pousser
                   derrière : l'appelant s'arrête là plutôt que de risquer l'écrasement. */
                logAppError('classement/fusionner', e);
                throw e;
            }
        }

        async function clCharger() {
            const sb = _clPret();
            if (!sb) return null;
            try {
                const { data, error } = await sb
                    .from('classement_semaine')
                    .select('pseudo, points, rang')
                    .eq('semaine', _lundiISO())
                    .order('rang', { ascending: true })
                    .limit(50);
                if (error) throw error;
                return data || [];
            } catch (e) {
                logAppError('classement/charger', e);
                return null;
            }
        }

        /* Relit la session depuis le localStorage du SDK et résout le profil associé.
           ⚠ `getSession()` peut rendre une session dont le profil n'existe plus (compte
           supprimé côté dashboard) : dans ce cas on redevient déconnecté plutôt que
           d'afficher un classement vide sans explication. */
        async function clRestaurerSession() {
            const sb = _clPret();
            if (!sb) return null;
            try {
                const { data: { session } } = await sb.auth.getSession();
                if (!session) { _clProfil = null; return null; }
                const { data, error } = await sb
                    .from('profils').select('user_id, pseudo')
                    .eq('user_id', session.user.id).maybeSingle();
                if (error) throw error;
                _clProfil = data || null;
                if (!_clProfil) await sb.auth.signOut();
                return _clProfil;
            } catch (e) {
                logAppError('classement/restaurerSession', e);
                _clProfil = null;
                return null;
            }
        }

        /* Création de compte. Le pseudo voyage dans `options.data` : c'est le trigger
           `creer_profil()` qui l'y lit et crée la ligne `profils`, côté base, dans la
           même transaction que la création du compte. Le faire ici, en deux requêtes,
           laisserait un compte sans profil chaque fois que la seconde échoue. */
        async function clInscrire(pseudo, motDePasse) {
            const sb = _clPret();
            if (!sb) return { ok: false, msg: 'Classement indisponible (hors ligne ?)' };
            if (!pseudoValide(pseudo)) {
                return { ok: false, msg: '3 à 20 caractères : lettres non accentuées, chiffres, . _ -' };
            }
            if (!motDePasse || motDePasse.length < 6) {
                return { ok: false, msg: 'Mot de passe : 6 caractères minimum.' };
            }
            try {
                const { data, error } = await sb.auth.signUp({
                    email: emailDePseudo(pseudo),
                    password: motDePasse,
                    options: { data: { pseudo: pseudo.trim() } }
                });
                if (error) throw error;
                if (!data.session) {
                    /* Pas de session malgré un succès = « Confirm email » est resté actif
                       dans les réglages Auth du projet. Le compte existe mais attend un
                       courriel envoyé à une adresse `.local` qui n'existe pas : il ne
                       sera jamais confirmé. Le dire ici plutôt que de laisser
                       l'utilisateur retenter sa connexion en boucle. */
                    return { ok: false, msg: 'Compte créé mais non activé — désactive « Confirm email » côté Supabase.' };
                }
                await clRestaurerSession();
                clLierProfil();      // ce profil local concourt désormais sous ce compte
                /* Compte neuf : le serveur n'a rien, la fusion est un coup dans l'eau.
                   On la fait quand même — un `signUp` sur un compte déjà existant est
                   traité comme une connexion par Supabase, et ce cas-là mérite le garde-fou. */
                try { await clFusionner(); } catch (e) { return { ok: true }; }
                await clPousser();   // le score déjà accumulé rejoint le classement
                return { ok: true };
            } catch (e) {
                logAppError('classement/inscrire', e);
                const m = String(e && e.message || '');
                if (/already registered|already exists|duplicate/i.test(m)) {
                    return { ok: false, msg: 'Ce pseudo est déjà pris.' };
                }
                return { ok: false, msg: 'Inscription impossible : ' + (m || 'erreur inconnue') };
            }
        }

        /* Connexion. L'identifiant saisi est un pseudo OU un email : un utilisateur qui
           a ajouté une adresse de récupération se connecte désormais avec elle (voir
           `clAjouterEmail()`). Le `@` tranche sans ambiguïté, aucun pseudo n'en contient. */
        async function clConnecter(identifiant, motDePasse) {
            const sb = _clPret();
            if (!sb) return { ok: false, msg: 'Classement indisponible (hors ligne ?)' };
            const id = String(identifiant || '').trim();
            const email = id.includes('@') ? id.toLowerCase() : emailDePseudo(id);
            if (!email) return { ok: false, msg: 'Identifiant invalide.' };
            try {
                const { error } = await sb.auth.signInWithPassword({ email, password: motDePasse });
                if (error) throw error;
                await clRestaurerSession();
                clLierProfil();
                /* L'ORDRE COMPTE : lire le serveur, puis seulement envoyer. Inversé, une
                   connexion depuis un appareil neuf remettrait le score à zéro. Si la
                   lecture échoue, on ne pousse pas — connecté quand même, l'envoi
                   repartira au prochain trajet. */
                try { await clFusionner(); } catch (e) { return { ok: true }; }
                await clPousser();
                return { ok: true };
            } catch (e) {
                logAppError('classement/connecter', e);
                return { ok: false, msg: 'Identifiant ou mot de passe incorrect.' };
            }
        }

        async function clDeconnecter() {
            const sb = _clPret();
            if (sb) { try { await sb.auth.signOut(); } catch (e) { logAppError('classement/deconnecter', e); } }
            _clProfil = null;
            clRender();
        }

        /* Ajout (optionnel, tardif) d'une vraie adresse de récupération. ⚠ EFFET DE BORD
           ASSUMÉ : cette adresse REMPLACE l'email synthétique dans `auth.users`, donc
           elle devient l'identifiant de connexion à la place du pseudo. C'est le prix à
           payer pour que « mot de passe oublié » fonctionne. L'alternative — garder le
           login au pseudo — imposerait une fonction publique traduisant pseudo → email,
           c'est-à-dire un annuaire des adresses de tous les utilisateurs, ouvert à qui
           veut. On préfère prévenir l'utilisateur, ce que fait le texte du formulaire. */
        async function clAjouterEmail(email) {
            const sb = _clPret();
            if (!sb || !_clProfil) return { ok: false, msg: 'Connecte-toi d\'abord.' };
            const e = String(email || '').trim().toLowerCase();
            if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(e)) return { ok: false, msg: 'Adresse invalide.' };
            try {
                const { error } = await sb.auth.updateUser({ email: e });
                if (error) throw error;
                return { ok: true, msg: 'Vérifie ta boîte mail pour confirmer l\'adresse.' };
            } catch (err) {
                logAppError('classement/ajouterEmail', err);
                return { ok: false, msg: 'Impossible d\'enregistrer cette adresse.' };
            }
        }

        // ═══════════════════════════════════════════════════════════════
        // === INTERFACE ===
        // ═══════════════════════════════════════════════════════════════

        function openClassementModal() {
            const ov = getEl('classement-overlay');
            if (!ov) return;
            ov.classList.add('open');   // `.open`, comme #weekly-goals-overlay
            clRender();
            /* La session est relue à CHAQUE ouverture, pas une fois au chargement : le
               jeton peut avoir expiré, ou le compte avoir été supprimé entre-temps. */
            clRestaurerSession().then(() => clRender());
        }

        function closeClassementModal() {
            const ov = getEl('classement-overlay');
            if (ov) ov.classList.remove('open');
        }

        function _clStatut(msg, erreur) {
            const el = getEl('classement-status');
            if (!el) return;
            el.textContent = msg || '';
            el.className = erreur ? 'cl-status cl-status-err' : 'cl-status';
        }

        function clRender() {
            const body = getEl('classement-body');
            if (!body) return;
            if (!_clPret()) {
                body.innerHTML = '<div class="cl-vide">Classement indisponible.<br><small>Connexion Internet requise au premier chargement.</small></div>';
                return;
            }
            if (!_clProfil) { _clRenderConnexion(body); return; }
            _clRenderTableau(body);
        }

        function _clRenderConnexion(body) {
            const etat = clLireLocal();
            body.innerHTML = `
                <div class="cl-intro">
                    Choisis un identifiant pour comparer ton score à celui des autres conducteurs.
                    ${etat.points > 0 ? `<strong>Tes ${etat.points.toFixed(2)} points de la semaine sont conservés.</strong>` : ''}
                </div>
                <!-- ⚠ Le libellé dit « Pseudo », pas « Pseudo ou email », alors que
                     clConnecter() accepte les deux : à l'INSCRIPTION seul un pseudo est
                     valide, et proposer l'email dans le même champ menait droit au refus
                     « 3 à 20 caractères ». Le cas de l'email est rappelé dans .cl-note,
                     là où il ne peut plus être lu comme une consigne de saisie. -->
                <input class="cl-input" id="cl-pseudo" type="text" autocomplete="username"
                       placeholder="Pseudo" maxlength="40">
                <input class="cl-input" id="cl-mdp" type="password" autocomplete="current-password"
                       placeholder="Mot de passe" maxlength="72">
                <div class="cl-actions">
                    <button class="cl-btn cl-btn-sec" onclick="clUiConnecter()">Se connecter</button>
                    <button class="cl-btn cl-btn-pri" onclick="clUiInscrire()">Créer un compte</button>
                </div>
                <div class="cl-note">
                    Pseudo : 3 à 20 caractères, sans accent ni espace. Aucune adresse email
                    n'est demandée — tu pourras en ajouter une plus tard, depuis cet écran,
                    pour pouvoir récupérer un mot de passe oublié. Si tu l'as déjà fait,
                    connecte-toi avec cette adresse plutôt qu'avec ton pseudo.
                </div>`;
            _clStatut('');
        }

        async function _clRenderTableau(body) {
            body.innerHTML = '<div class="cl-vide">Chargement…</div>';
            const lignes = await clCharger();
            if (lignes === null) {
                body.innerHTML = '<div class="cl-vide">Classement injoignable.<br><small>Réessaie quand tu auras du réseau.</small></div>';
                return;
            }
            const etat = clLireLocal();
            const moi = _clProfil ? _clProfil.pseudo.toLowerCase() : '';
            const rangs = lignes.length ? lignes.map(l => {
                const estMoi = String(l.pseudo).toLowerCase() === moi;
                const medaille = l.rang === 1 ? '🥇' : l.rang === 2 ? '🥈' : l.rang === 3 ? '🥉' : l.rang;
                return `<div class="cl-ligne${estMoi ? ' cl-ligne-moi' : ''}">
                            <span class="cl-rang">${medaille}</span>
                            <span class="cl-pseudo">${_clEchappe(l.pseudo)}</span>
                            <span class="cl-pts">${Number(l.points).toFixed(2)} pts</span>
                        </div>`;
            }).join('') : '<div class="cl-vide">Personne n\'a encore marqué cette semaine.<br><small>Lance un trajet pour ouvrir le bal.</small></div>';

            /* La carte du haut ne montre le compteur LOCAL que s'il appartient bien au
               compte affiché. Sinon elle affichait les points du profil actif sous le
               pseudo du compte connecté — deux identités différentes présentées comme
               une seule, c'est le bug remonté le 23/08/2026. */
            const lie = clEstLie();
            const nomProfilLocal = (typeof profiles !== 'undefined'
                && (profiles.find(p => p.id === activeProfileId) || {}).name) || 'le profil actif';
            const carte = lie
                ? `<div class="cl-moi-carte">
                       <span>${_clEchappe(_clProfil.pseudo)}</span>
                       <strong>${etat.points.toFixed(2)} pts</strong>
                   </div>`
                : `<div class="cl-moi-carte cl-moi-delie">
                       <span>Connecté en <strong>${_clEchappe(_clProfil.pseudo)}</strong>, mais
                       le profil actif est <strong>${_clEchappe(nomProfilLocal)}</strong>.
                       Ses ${etat.points.toFixed(2)} points ne sont pas envoyés.</span>
                       <button class="cl-btn cl-btn-pri cl-btn-lier" onclick="clUiLier()">
                           Faire concourir ${_clEchappe(nomProfilLocal)} sous ${_clEchappe(_clProfil.pseudo)}
                       </button>
                   </div>`;

            body.innerHTML = `
                ${carte}
                <div class="cl-liste">${rangs}</div>
                <div class="cl-actions">
                    <button class="cl-btn cl-btn-sec" onclick="clUiEmail()">Ajouter un email</button>
                    <button class="cl-btn cl-btn-sec" onclick="clDeconnecter()">Se déconnecter</button>
                </div>`;
            /* Le total local peut être en avance sur le serveur (trajet terminé hors
               réseau). Ouvrir le classement est le bon moment pour rattraper. */
            if (lie && etat.points > etat.pousse) { clPousser().then(ok => { if (ok) clRender(); }); }
        }

        /* Les pseudos viennent d'autres utilisateurs : la contrainte SQL les limite à
           `[A-Za-z0-9._-]`, mais on n'insère JAMAIS du texte distant en `innerHTML` sans
           échapper — la contrainte peut changer, l'échappement, lui, ne coûte rien. */
        function _clEchappe(txt) {
            const d = document.createElement('div');
            d.textContent = String(txt == null ? '' : txt);
            return d.innerHTML;
        }

        // --- Liaisons des boutons (l'attente réseau est visible, sinon rien ne bouge) ---
        async function clUiConnecter() {
            _clStatut('Connexion…');
            const r = await clConnecter(getEl('cl-pseudo').value, getEl('cl-mdp').value);
            if (r.ok) clRender(); else _clStatut(r.msg, true);
        }

        async function clUiInscrire() {
            _clStatut('Création du compte…');
            const r = await clInscrire(getEl('cl-pseudo').value, getEl('cl-mdp').value);
            if (r.ok) clRender(); else _clStatut(r.msg, true);
        }

        /* Lier sans repasser par une déconnexion. Même séquence que `clConnecter()` —
           lier, LIRE le serveur, puis seulement envoyer : le profil qu'on rattache peut
           avoir moins de points que la ligne déjà en base, et l'inverser l'écraserait. */
        async function clUiLier() {
            _clStatut('Liaison…');
            clLierProfil();
            try { await clFusionner(); }
            catch (e) { _clStatut('Serveur injoignable — réessaie dans un instant.', true); return; }
            await clPousser();
            clRender();
        }

        async function clUiEmail() {
            const saisie = prompt('Adresse email de récupération.\n\nATTENTION : elle remplacera ton pseudo comme identifiant de connexion.');
            if (!saisie) return;
            const r = await clAjouterEmail(saisie);
            _clStatut(r.msg, !r.ok);
        }

        /* Restauration au chargement, différée : `clRestaurerSession()` appelle
           `_lundiISO()` (fichier 00, déjà chargé) mais aussi le SDK du CDN, qui peut
           n'être pas encore prêt. Le `setTimeout` sort du fil de chargement, et le `try`
           garantit qu'un incident ici n'interrompt pas l'évaluation de la fin du fichier. */
        setTimeout(() => {
            try { clRestaurerSession(); } catch (e) { logAppError('classement/init', e); }
        }, 0);

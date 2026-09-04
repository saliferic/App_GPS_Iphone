        /* ═══════════════════════════════════════════════════════════════════════════
           CLASSEMENT EN LIGNE (23/08/2026)
           ═══════════════════════════════════════════════════════════════════════════
           Le seul morceau de l'app qui parle à un serveur qui nous appartient. Tout le
           reste (Mapbox, Overpass, BAN, Photon) est en lecture seule et anonyme ; ici on
           écrit, sous une identité.

           ⚠⚠ CE CLASSEMENT COMPTE DES ANIMAUX SAUVÉS, PLUS DES POINTS (25/08/2026).
           C'est la seule chose à savoir avant de lire quoi que ce soit ici. Les points
           n'ont pas disparu de l'app — ils restent le carburant du trajet (butin du
           coffre, total du profil, objectifs de la semaine) — mais ce qui se compare
           entre joueurs, c'est le nombre d'animaux menés au bout de leur parcours.
           Deux conséquences dans ce fichier :
             · Le nombre est un TOTAL CUMULÉ, jamais remis à zéro le lundi. Un animal
               demande trois missions, donc à peu près une semaine : compté par semaine,
               tout le monde serait à 0 ou 1 et le classement ne trancherait plus rien.
               La colonne `semaine` reste la clé de la ligne (c'est elle qui fait
               l'historique), mais la valeur qu'elle porte est un total de toujours.
             · Il n'est PAS accumulé ici. C'est `nbAnimauxSauves()` (js/12) qui le sait,
               à partir des parcours stockés — on le LIT au moment d'envoyer. Un
               compteur de plus, tenu en parallèle, aurait fini par diverger de la
               vérité affichée dans « Qui sauvons-nous ? ».
           ⚠ La colonne SQL s'appelle toujours `scores.points` : la renommer imposait
           un `alter table` + un `create or replace view` sur la base de production pour
           un gain cosmétique. Voir `docs/schema.sql` et le noyau (`clampAnimauxClassement`).

           TROIS PRINCIPES, dans l'ordre où ils comptent :

           1. **Le compte vit EN LOCAL d'abord, toujours.** Les sauvetages sont écrits
              dans le localStorage par le parcours, et l'envoi réseau vient après, en
              silence ; son échec n'est jamais une erreur pour l'utilisateur. Un
              conducteur roule dans des tunnels et des zones blanches : un classement
              qui dépendrait du réseau au moment du trajet serait un sauvetage perdu.
           2. **Aucun compte n'est créé tant que l'utilisateur n'en demande pas un.** On
              n'ouvre PAS de session anonyme au chargement (⚠ contrairement à ce qui
              était prévu au départ) : ça peuplait `auth.users` de comptes fantômes, un
              par installation, pour un bénéfice nul — sans second appareil, une session
              anonyme n'apporte rien qu'un localStorage ne fasse déjà. À l'inscription,
              le total local est poussé d'un coup : rien n'est perdu, et le réglage
              « Allow anonymous sign-ins » de Supabase reste inutile.
           3. **Le classement est trichable, et c'est assumé.** La clé ci-dessous est
              publique par construction (elle part dans chaque requête depuis le
              navigateur). N'importe qui peut poster le score qu'il veut avec un `curl`.
              Le `check` SQL borne l'absurde, il n'empêche pas la triche : seul un calcul
              côté serveur le ferait, et il faudrait lui envoyer les trajets bruts. ⚠ NE JAMAIS mettre la clé `service_role` dans ce fichier — elle
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
        // === LE COMPTE D'ANIMAUX ET SON ÉTAT LOCAL ===
        // ═══════════════════════════════════════════════════════════════

        /* LA source du chiffre, et il n'y en a qu'une : le parcours des compagnons, tenu
           par js/12. Ce module ne compte rien, il transporte.
           `typeof` + `try` parce que js/12 est chargé avant mais peut avoir été
           interrompu : un classement muet vaut mieux qu'un classement qui lève. */
        function clAnimauxLocaux() {
            try {
                if (typeof window.nbAnimauxSauves === 'function') {
                    return clampAnimauxClassement(window.nbAnimauxSauves());
                }
            } catch (e) { logAppError('classement/animaux', e); }
            return 0;
        }

        /* Le chiffre qui concourt : le plus grand entre ce que cet appareil sait et ce
           que le serveur savait déjà (`plancher`, posé par `clFusionner()`).
           ⚠ SANS CE MAXIMUM, SE CONNECTER SUR UN APPAREIL NEUF EFFACE SES SAUVETAGES.
           Les parcours vivent dans le localStorage : sur le téléphone d'un proche, ils
           valent 0, et `clPousser()` envoie un total — donc un 0 par-dessus une ligne
           qui en portait cinq. Un compte d'animaux ne décroît jamais (un animal libéré
           ne retourne pas en cage), le maximum est donc la seule règle qui ne perd rien. */
        function clAnimaux() {
            const etat = clLireLocal();
            return Math.max(clAnimauxLocaux(), etat.plancher);
        }

        /* Une clé par profil local : plusieurs conducteurs partagent l'appareil (c'est
           tout l'objet du sélecteur de profils), et leurs sauvetages ne doivent pas
           fusionner. Sans profil actif, on garde une clé neutre. */
        function _clKey() {
            return 'gps_classement_' + (activeProfileId || 'sans_profil');
        }

        /* Ce qui reste stocké ici depuis que le compte est LU et non plus accumulé :
             · `semaine`  — la ligne serveur visée ;
             · `pousse`   — ce que le serveur sait déjà, pour ne pas renvoyer l'identique ;
             · `plancher` — ce que le serveur savait à la dernière fusion (voir clAnimaux) ;
             · `compte`   — le lien profil local ↔ compte en ligne.
           L'ancien champ `points` des états déjà écrits est simplement ignoré : il n'y a
           rien à migrer, le vrai chiffre est ailleurs. */
        function clLireLocal() {
            const semaine = _lundiISO();
            const vide = { semaine, pousse: 0, plancher: 0, compte: null };
            try {
                const brut = localStorage.getItem(_clKey());
                if (!brut) return vide;
                const o = JSON.parse(brut);
                if (!o) return vide;
                /* ⚠ `compte` ET `plancher` SURVIVENT au changement de semaine. Le premier
                   est un lien d'identité, le second le total d'animaux déjà atteint : les
                   remettre à zéro chaque lundi délierait le profil de son compte et
                   renverrait en cage des animaux libérés. */
                const compte   = o.compte || null;
                const plancher = clampAnimauxClassement(o.plancher);
                /* Semaine révolue → `pousse` seul repart de zéro, SANS toucher au serveur :
                   la ligne de la semaine passée reste en base, c'est elle qui fait
                   l'historique, et la nouvelle semaine doit recevoir le total complet. */
                if (o.semaine !== semaine) return { semaine, pousse: 0, plancher, compte };
                return { semaine, pousse: Number(o.pousse) || 0, plancher, compte };
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
           `synchroniserParcours()` (12-gamification.js), qui est le passage obligé de
           toute progression de parcours. Un seul branchement, donc, et pas un par
           endroit où un animal peut être libéré.

           ⚠ IL EST APPELÉ SOUVENT, et c'est voulu : `synchroniserParcours()` est
           idempotent et tourne à chaque rendu du carnet. On ne guette pas l'INSTANT du
           sauvetage — un rendu manqué et le classement resterait en arrière jusqu'à la
           semaine suivante. La comparaison avec `pousse` fait que 99 % des appels ne
           déclenchent rien du tout. */
        function clAnimauxMaj() {
            if (clAnimaux() === clLireLocal().pousse) return;   // rien de neuf à dire
            clPousserDiffere();
        }

        /* Anti-rafale : la fin d'un trajet enchaîne plusieurs rendus du carnet, et un
           sauvetage peut être constaté par deux d'entre eux à quelques instants d'écart.
           Deux `upsert` de suite pour la même ligne ne servent à rien — on ne garde que
           le dernier état. */
        function clPousserDiffere() {
            if (!_clProfil) return;
            clearTimeout(_clEnvoiTimer);
            _clEnvoiTimer = setTimeout(() => { clPousser(); }, 4000);
        }

        // ═══════════════════════════════════════════════════════════════
        // === ÉCHANGES AVEC LE SERVEUR ===
        // ═══════════════════════════════════════════════════════════════

        /* Envoie le compte d'animaux dans la ligne de la semaine en cours. `upsert` sur
           la clé (user_id, semaine) : la première fois de la semaine c'est un INSERT,
           ensuite un UPDATE, sans avoir à savoir lequel. On envoie un TOTAL, pas un
           delta — un delta perdu par une coupure réseau serait un delta perdu pour
           toujours, alors qu'un total se rattrape tout seul au prochain envoi.
           ⚠ `points:` est le nom de la COLONNE, pas ce qu'elle contient (voir l'en-tête
           du fichier) : la valeur envoyée est un nombre d'animaux sauvés. */
        async function clPousser() {
            const sb = _clPret();
            if (!sb || !_clProfil) return false;
            const etat = clLireLocal();
            /* ⚠ LE GARDE-FOU. Le profil local actif n'est pas celui qui concourt sous ce
               compte : envoyer maintenant écraserait la ligne d'un autre conducteur. On
               ne pousse pas, et on ne signale rien — l'utilisateur n'a rien demandé, il a
               juste changé de profil. La modale, elle, l'explique. */
            if (etat.compte !== _clProfil.user_id) return false;
            const animaux = clAnimaux();
            try {
                const { error } = await sb.from('scores').upsert({
                    user_id: _clProfil.user_id,
                    semaine: etat.semaine,
                    points:  animaux,
                    maj_le:  new Date().toISOString()
                }, { onConflict: 'user_id,semaine' });
                if (error) throw error;
                etat.pousse = animaux;
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
           un téléphone de remplacement — EFFACE ses sauvetages : les parcours y valent 0,
           et `clPousser()` envoie un total, pas un delta.
           Elle ne « ramène » pas les animaux : on ne peut pas inventer des parcours qui
           n'ont pas été joués sur cet appareil. Elle pose un PLANCHER, que `clAnimaux()`
           prend en compte — voir le maximum décrit là-bas. */
        async function clFusionner() {
            const sb = _clPret();
            if (!sb || !_clProfil) return;
            const etat = clLireLocal();
            try {
                /* ⚠ TOUTES LES SEMAINES, PAS SEULEMENT CELLE EN COURS. Le chiffre est un
                   total cumulé : quelqu'un qui n'a pas roulé depuis quinze jours n'a
                   aucune ligne cette semaine, et se limiter à elle lirait 0 — donc
                   ramènerait le plancher à zéro pour un joueur qui a bel et bien sauvé
                   des animaux. Le plus haut jamais enregistré est le vrai plancher. */
                const { data, error } = await sb.from('scores')
                    .select('points')
                    .eq('user_id', _clProfil.user_id)
                    .order('points', { ascending: false })
                    .limit(1);
                if (error) throw error;
                const serveur = (data && data[0]) ? (Number(data[0].points) || 0) : 0;
                if (serveur > etat.plancher) {
                    etat.plancher = clampAnimauxClassement(serveur);
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
                /* ⚠ CAS DORMANT AU 04/09/2026 — IL NE PEUT PAS SE DÉCLENCHER AUJOURD'HUI,
                   et ce n'est pas un oubli. « Leaked Password Protection » (Supabase
                   compare le mot de passe à HaveIBeenPwned et refuse ceux qui ont fuité)
                   est réservée AU PLAN PRO ; le projet est sur le plan gratuit, la
                   vérification ne tourne donc jamais. Mesuré ce jour-là : un compte créé
                   avec `azerty01` — présent 77 729 fois dans les fuites — passe sans
                   broncher. Le Security Advisor signale malgré tout la faiblesse, sans
                   tenir compte du plan.
                   Le cas reste ici parce qu'il devient actif SANS AUCUNE MODIFICATION le
                   jour où le projet passe en Pro, ou si l'on interroge nous-mêmes l'API
                   publique de HaveIBeenPwned (gratuite, sans clé, par k-anonymat) —
                   piste écartée le 04/09/2026, l'app ne protégeant qu'un classement de
                   jeu. Sans ce cas, le repli ci-dessous afficherait le texte ANGLAIS BRUT
                   de Supabase à un utilisateur francophone, sur le seul écran où il est
                   déjà en train d'échouer.
                   Le motif est large à dessein : le libellé exact vient d'un service
                   tiers et peut changer sans prévenir. */
                if (/pwned|leaked|compromised|weak|easy to guess/i.test(m)) {
                    return { ok: false, msg: 'Ce mot de passe a fuité sur Internet — choisis-en un autre.' };
                }
                return { ok: false, msg: 'Inscription impossible : ' + (m || 'erreur inconnue') };
            }
        }

        /* Connexion. L'identifiant saisi est un pseudo OU un email : un utilisateur qui
           a ajouté une adresse de récupération se connecte désormais avec elle (voir
           `clAjouterEmail()`). Le `@` tranche sans ambiguïté, aucun pseudo n'en contient. */
        /* `options.sansLier` (23/08/2026) : ouvrir la session SANS lier le profil local
           actif ni pousser quoi que ce soit. Indispensable au formulaire de l'onglet
           Profil, qui ne connaît le pseudo qu'APRÈS la connexion : il doit d'abord
           basculer sur le bon profil local, puis lier lui-même. Sans ça, la connexion
           rattacherait le compte au conducteur précédent et lui enverrait ses points. */
        async function clConnecter(identifiant, motDePasse, options) {
            const sb = _clPret();
            if (!sb) return { ok: false, msg: 'Classement indisponible (hors ligne ?)' };
            const id = String(identifiant || '').trim();
            const email = id.includes('@') ? id.toLowerCase() : emailDePseudo(id);
            if (!email) return { ok: false, msg: 'Identifiant invalide.' };
            try {
                const { error } = await sb.auth.signInWithPassword({ email, password: motDePasse });
                if (error) throw error;
                await clRestaurerSession();
                if (options && options.sansLier) return { ok: true };
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
            ov.classList.add('open');   // `.open`, comme les autres overlays plein écran
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

        /* Plus de formulaire ici (23/08/2026) : cet écran AFFICHE, il n'authentifie plus.
           Le pseudo et le mot de passe se saisissent dans « créer un profil » (onglet
           Profil), parce que le pseudo du compte EST le nom du profil local — les avoir
           laissés aux deux endroits aurait permis de créer un compte sans profil, donc de
           recréer les deux identités qu'on vient justement de fusionner. */
        function _clRenderConnexion(body) {
            const n = clAnimaux();
            body.innerHTML = `
                <div class="cl-vide">
                    Aucun compte connecté.<br>
                    <small>Onglet <strong>Profil</strong> → bouton <strong>+</strong> pour créer
                    ton pseudo ou te connecter.${n > 0
                        ? `<br>${_clAnimauxTexte(n)} déjà sauvé${n > 1 ? 's' : ''} sur cet appareil : rien ne sera perdu.` : ''}</small>
                </div>`;
            _clStatut('');
        }

        /* « 1 animal » / « 3 animaux ». Un seul endroit pour l'accord, sinon il finit par
           diverger entre la carte du haut, la liste et l'écran de connexion. */
        function _clAnimauxTexte(n) {
            const v = clampAnimauxClassement(n);
            return v + (v > 1 ? ' animaux' : ' animal');
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
                /* ⚠ `l.points` est le nom de la colonne, son contenu est un nombre
                   d'animaux (voir l'en-tête). D'où l'entier et le mot qui va avec. */
                return `<div class="cl-ligne${estMoi ? ' cl-ligne-moi' : ''}">
                            <span class="cl-rang">${medaille}</span>
                            <span class="cl-pseudo">${_clEchappe(l.pseudo)}</span>
                            <span class="cl-pts">🐾 ${_clAnimauxTexte(l.points)}</span>
                        </div>`;
            }).join('') : '<div class="cl-vide">Personne n\'a encore sauvé d\'animal cette semaine.<br><small>Lance un trajet pour ouvrir le bal.</small></div>';

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
                       <strong>🐾 ${_clAnimauxTexte(clAnimaux())}</strong>
                   </div>`
                : `<div class="cl-moi-carte cl-moi-delie">
                       <span>Connecté en <strong>${_clEchappe(_clProfil.pseudo)}</strong>, mais
                       le profil actif est <strong>${_clEchappe(nomProfilLocal)}</strong>.
                       Ses ${_clAnimauxTexte(clAnimaux())} sauvés ne sont pas envoyés.</span>
                       <button class="cl-btn cl-btn-pri cl-btn-lier" onclick="clUiLier()">
                           Faire concourir ${_clEchappe(nomProfilLocal)} sous ${_clEchappe(_clProfil.pseudo)}
                       </button>
                   </div>`;

            /* « Ajouter un email » et « Se déconnecter » ne sont plus ici : ce sont des
               actions de COMPTE, elles vivent avec le reste de l'identité, dans
               « créer un profil ». */
            body.innerHTML = `
                ${carte}
                <div class="cl-liste">${rangs}</div>`;
            /* Le compte local peut être en avance sur le serveur (animal libéré hors
               réseau). Ouvrir le classement est le bon moment pour rattraper. */
            if (lie && clAnimaux() > etat.pousse) { clPousser().then(ok => { if (ok) clRender(); }); }
        }

        /* Les pseudos viennent d'autres utilisateurs : la contrainte SQL les limite à
           `[A-Za-z0-9._-]`, mais on n'insère JAMAIS du texte distant en `innerHTML` sans
           échapper — la contrainte peut changer, l'échappement, lui, ne coûte rien. */
        /* Branché sur `echapperHtml()` (js/00-helpers-partages) depuis l'audit du
           01/09/2026, pour qu'il n'existe qu'UNE définition de l'échappement dans le
           projet. Le comportement ne change pas ici : la version partagée échappe les
           guillemets en plus, ce qui est invisible dans un nœud de texte. */
        function _clEchappe(txt) {
            return echapperHtml(txt);
        }

        // --- Liaisons des boutons (l'attente réseau est visible, sinon rien ne bouge) ---

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
            _profilStatut(r.msg, !r.ok);
        }

        // ═══════════════════════════════════════════════════════════════
        // === IDENTITÉ DANS L'ONGLET PROFIL (23/08/2026) ===
        // ═══════════════════════════════════════════════════════════════
        /* Un profil local = un compte en ligne, et le pseudo du compte donne son nom au
           profil. L'app avait deux identités — le prénom du profil local et le pseudo —
           et l'écran de classement devait s'en excuser (« Connecté en X, mais c'est Y qui
           roule »). Le formulaire de création de profil est donc devenu le formulaire de
           compte, seul endroit où l'identité se crée.

           ⚠ CE QUI RESTE POSSIBLE SANS COMPTE. Un GPS doit fonctionner hors réseau, et le
           deuxième conducteur d'un même téléphone ne veut pas forcément d'un compte : le
           lien « sans compte » crée un profil purement local, comme avant. Il ne concourt
           pas au classement, et un compte peut lui être attaché plus tard.

           ⚠ UNE SEULE SESSION SUPABASE PAR APPAREIL. Deux conducteurs avec chacun leur
           compte devront donc ressaisir leur mot de passe à chaque bascule : le SDK ne
           sait pas tenir deux sessions ouvertes. C'est le prix du modèle, pas un oubli. */

        function clProfilConnecte() { return _clProfil; }

        function _profilStatut(msg, erreur) {
            const el = getEl('profil-compte-statut');
            if (!el) return;
            el.textContent = msg || '';
            el.className = erreur ? 'cl-status cl-status-err' : 'cl-status';
        }

        function _profilLocalParNom(nom) {
            const n = String(nom || '').trim().toLowerCase();
            if (!n || typeof profiles === 'undefined') return null;
            const p = profiles.find(x => x && String(x.name).trim().toLowerCase() === n);
            return p ? p.id : null;
        }

        /* Création SANS la question « l'utiliser maintenant ? » : quand un compte vient
           d'être créé ou rejoint, le profil correspondant devient actif d'office — c'est
           tout l'objet de la manœuvre, il n'y a rien à demander. */
        function _profilLocalCreer(nom) {
            const id = 'profil_' + Date.now();
            profiles.push({ id, name: nom, totalPoints: 0 });
            saveProfilesToStorage();
            return id;
        }

        function renderProfilCompteBloc() {
            const box = getEl('profil-compte-bloc');
            if (!box) return;
            const dispo = !!_clPret();

            if (_clProfil) {
                box.innerHTML = `
                    <div class="cl-intro">Connecté en <strong>${_clEchappe(_clProfil.pseudo)}</strong>.</div>
                    <div class="cl-actions">
                        <button class="cl-btn cl-btn-sec" onclick="clUiEmail()">Ajouter un email</button>
                        <button class="cl-btn cl-btn-sec" onclick="profilUiDeconnecter()">Se déconnecter</button>
                    </div>
                    <div class="cl-note">
                        Pour créer un autre profil avec son propre compte, déconnecte-toi
                        d'abord — l'application ne peut tenir qu'une session à la fois.
                        <br><a href="#" onclick="profilUiLocal();return false;">Créer un profil sans compte</a>
                        (sauvetages gardés sur cet appareil, absent du classement).
                    </div>
                    <div class="cl-actions">
                        <button class="cl-btn cl-btn-sec" onclick="hideCreateProfileInline()">Fermer</button>
                    </div>`;
                return;
            }

            box.innerHTML = `
                <!-- ⚠ Le libellé dit « Pseudo », pas « Pseudo ou email », alors que
                     clConnecter() accepte les deux : à l'INSCRIPTION seul un pseudo est
                     valide, et proposer l'email dans le même champ menait droit au refus
                     « 3 à 20 caractères ». Le cas de l'email est rappelé dans .cl-note. -->
                <input class="cl-input" id="profil-pseudo" type="text" autocomplete="username"
                       placeholder="Pseudo" maxlength="40">
                <input class="cl-input" id="profil-mdp" type="password" autocomplete="current-password"
                       placeholder="Mot de passe" maxlength="72"
                       onkeydown="if(event.key==='Enter') profilUiInscrire();">
                <div class="cl-actions">
                    <button class="cl-btn cl-btn-sec" onclick="profilUiConnecter()" ${dispo ? '' : 'disabled'}>Se connecter</button>
                    <button class="cl-btn cl-btn-pri" onclick="profilUiInscrire()" ${dispo ? '' : 'disabled'}>Créer un compte</button>
                </div>
                <div class="cl-actions">
                    <button class="cl-btn cl-btn-sec" onclick="hideCreateProfileInline()">Annuler</button>
                </div>
                <!-- La note passe SOUS le bouton Annuler (23/08/2026) : les trois actions
                     restent groupées en haut, l'explication ne s'intercale plus entre
                     elles. -->
                <div class="cl-note">
                    ${dispo ? '' : '<strong>Hors ligne : la création de compte est indisponible.</strong><br>'}
                    Pseudo : 3 à 20 caractères, sans accent ni espace. Il donnera son nom à
                    ton profil. Aucune adresse email n'est demandée — tu pourras en ajouter
                    une plus tard pour récupérer un mot de passe oublié ; si tu l'as déjà
                    fait, connecte-toi avec cette adresse plutôt qu'avec ton pseudo.
                    <br><a href="#" onclick="profilUiLocal();return false;">Continuer sans compte</a>
                    (sauvetages gardés sur cet appareil, absent du classement).
                </div>`;
            _profilStatut('');
        }

        /* Création de compte. ⚠ L'ORDRE EST LA CORRECTION D'UN BUG : le profil local neuf
           est créé et activé AVANT `clInscrire()`, qui lie puis pousse le cumul du profil
           ACTIF. Fait dans l'autre sens, chaque nouveau compte héritait des points du
           conducteur précédent — trois comptes créés d'affilée affichaient le même score.
           Un profil neuf est à 0, le compte neuf part donc de 0. */
        async function profilUiInscrire() {
            const pseudo = String((getEl('profil-pseudo') || {}).value || '').trim();
            const mdp    = String((getEl('profil-mdp') || {}).value || '');
            if (!pseudoValide(pseudo)) {
                _profilStatut('3 à 20 caractères : lettres non accentuées, chiffres, . _ -', true); return;
            }
            if (mdp.length < 6) { _profilStatut('Mot de passe : 6 caractères minimum.', true); return; }
            if (_profilLocalParNom(pseudo)) {
                _profilStatut('Un profil de cet appareil porte déjà ce nom.', true); return;
            }
            _profilStatut('Création du compte…');
            const precedent = activeProfileId;
            const neuf = _profilLocalCreer(pseudo);
            selectProfile(neuf);
            const r = await clInscrire(pseudo, mdp);
            if (!r.ok) {
                /* Rien ne doit rester d'une inscription refusée : un profil local orphelin
                   au nom d'un pseudo qu'on n'a pas obtenu serait à supprimer à la main. */
                profiles = profiles.filter(p => p.id !== neuf);
                saveProfilesToStorage();
                selectProfile(precedent);
                renderProfilesDropdown();
                _profilStatut(r.msg, true);
                return;
            }
            renderProfilesDropdown();
            hideCreateProfileInline();
        }

        /* Connexion à un compte existant. Le pseudo n'est connu qu'APRÈS la connexion
           (l'identifiant saisi peut être une adresse email), d'où le `sansLier` : on ouvre
           la session, on bascule sur le bon profil local — retrouvé ou créé — et on lie
           seulement ensuite. */
        async function profilUiConnecter() {
            const id  = String((getEl('profil-pseudo') || {}).value || '').trim();
            const mdp = String((getEl('profil-mdp') || {}).value || '');
            if (!id || !mdp) { _profilStatut('Identifiant et mot de passe requis.', true); return; }
            _profilStatut('Connexion…');
            const r = await clConnecter(id, mdp, { sansLier: true });
            if (!r.ok) { _profilStatut(r.msg, true); return; }

            const pseudo = (_clProfil && _clProfil.pseudo) || id;
            const cible = _profilLocalParNom(pseudo) || _profilLocalCreer(pseudo);
            selectProfile(cible);
            clLierProfil();
            /* Lire AVANT d'envoyer : ce profil local peut être neuf (0 pt) alors que le
               compte a déjà un score en base. Si la lecture échoue, on ne pousse pas —
               sinon on écraserait ce score par un zéro. */
            try { await clFusionner(); }
            catch (e) {
                renderProfilesDropdown();
                _profilStatut('Connecté, mais serveur injoignable — ton score remontera plus tard.', true);
                return;
            }
            await clPousser();
            renderProfilesDropdown();
            hideCreateProfileInline();
        }

        /* Profil local sans compte : le champ pseudo sert de nom. Les contraintes du
           pseudo ne s'appliquent pas (rien ne part au serveur), un prénom accentué passe. */
        function profilUiLocal() {
            const nom = String((getEl('profil-pseudo') || {}).value || '').trim();
            if (!nom) { _profilStatut('Saisis d\'abord un nom dans le champ « Pseudo ».', true); return; }
            if (_profilLocalParNom(nom)) { _profilStatut('Un profil porte déjà ce nom.', true); return; }
            createProfile(nom);   // pose la question « l'utiliser maintenant ? »
        }

        async function profilUiDeconnecter() {
            await clDeconnecter();
            renderProfilCompteBloc();
        }

        /* Restauration au chargement, différée : `clRestaurerSession()` appelle
           `_lundiISO()` (fichier 00, déjà chargé) mais aussi le SDK du CDN, qui peut
           n'être pas encore prêt. Le `setTimeout` sort du fil de chargement, et le `try`
           garantit qu'un incident ici n'interrompt pas l'évaluation de la fin du fichier. */
        setTimeout(() => {
            try { clRestaurerSession(); } catch (e) { logAppError('classement/init', e); }
        }, 0);

        // === PANNEAU ITINÉRAIRE : SLIDE FLUIDE (mobile portrait) ===
        /* ⚠ 'hidden' ET NON 'full' (18/08/2026) — MIROIR EXACT de la classe `panel-hidden`
           posée sur #ui-panel dans index.html. L'écran d'accueil de l'app est la carte : le
           panneau part donc fermé, dans le balisage comme dans l'état, sans dépendre d'une
           instruction JS pour le devenir.
           Les deux doivent être changés ENSEMBLE. Une divergence ne se voit pas au premier
           coup d'œil mais se paie au premier appui : `switchMainTab()` compare
           `panelSnapState` à 'hidden' pour décider d'ouvrir ou de refermer — annoncer 'full'
           devant un panneau fermé lui ferait « refermer » ce qui l'est déjà, et il faudrait
           deux appuis sur l'onglet Itinéraire pour le déployer. */
        let panelSnapState = 'hidden';

        const PANEL_MIN_VISIBLE = 54;

        /* ⚠ PANEL_SECONDARY_RATIO SUPPRIMÉE (0.60) — ne pas la rétablir.
           Elle servait de repli de hauteur pour Objectifs / Profil et de plafond à la
           feuille du scan ⛽, en concurrence avec la hauteur relevée sur Itinéraire : deux
           chemins pour une même grandeur, donc deux résultats selon le parcours de
           l'utilisateur. Toutes les feuilles passent désormais par getSheetHeightPx(). */

        /* Mesure la hauteur réellement occupée en bas de l'écran (barre de navigation
           permanente + barre de trajet si elle est affichée) et l'expose en variable CSS.
           #ui-panel s'y ancre via bottom: var(--panel-bottom-offset). */
        function updatePanelBottomOffset() {
            // On mesure UNIQUEMENT la hauteur de la barre de navigation principale.
            // nav-bottom-bar ne doit pas entrer dans ce calcul (référence circulaire).
            const mainNav = document.getElementById('main-bottom-nav');
            const h = (mainNav && mainNav.offsetHeight > 0) ? mainNav.offsetHeight : 64;
            document.documentElement.style.setProperty('--panel-bottom-offset', h + 'px');
            return h;
        }

        function getBottomBarsH() {
            const v = getComputedStyle(document.documentElement).getPropertyValue('--panel-bottom-offset');
            const n = parseFloat(v);
            return Number.isFinite(n) ? n : updatePanelBottomOffset();
        }

        /* ═══ RÈGLE 50/50 — HAUTEUR COMMUNE À TOUTES LES FEUILLES DE CONTENU ═══

           Une seule hauteur pour le panneau (Itinéraire, Objectifs, Profil), la feuille du
           scan ⛽ et l'aperçu de trajet : la moitié basse de l'écran. La ligne de séparation
           avec la carte tombe donc TOUJOURS au même endroit, quelle que soit la fenêtre —
           passer d'un onglet à l'autre ne fait plus sauter l'équilibre.

           ⚠ LA BARRE D'ONGLETS EST DANS LA MOITIÉ BASSE, pas en dehors. C'était l'erreur
           du calcul d'origine : le modal valait `50vh - 32px` posé au-dessus d'une barre de
           64 px, soit `50vh + 32` occupés en bas contre `50vh - 32` de carte — 46,5 / 53,5
           mesuré sur Pixel 9A, et non la moitié annoncée. La feuille vaut donc
           `dvh / 2 - barre`.

           `dvh` et non `vh` : sur mobile, `vh` se rapporte au viewport barres rétractées et
           surestime la hauteur réelle dès que l'interface du navigateur est visible.

           La valeur est exposée en `--sheet-h` pour que le CSS du modal la partage : une
           seule source de vérité, sinon les deux calculs divergent au premier réglage. */
        const SHEET_MIN_H = 160;   // plancher : sous cette taille une feuille n'affiche rien

        /* Écriture CSS de la même hauteur, pour les styles inline du modal de trajet.
           Le repli après la virgule ne sert qu'au tout premier rendu, avant que
           syncSheetHeightVar() n'ait pu mesurer : il reproduit exactement la formule. */
        const SHEET_H_CSS = 'var(--sheet-h, calc(50dvh - var(--panel-bottom-offset, 64px)))';

        function getViewportH() {
            try {
                const el = document.createElement('div');
                el.style.cssText = 'position:fixed;height:100dvh;visibility:hidden;pointer-events:none;top:0;';
                document.body.appendChild(el);
                const h = el.offsetHeight || window.innerHeight;
                document.body.removeChild(el);
                return h;
            } catch (e) { return window.innerHeight; }
        }

        function getSheetHeightPx() {
            return Math.max(SHEET_MIN_H, Math.floor(getViewportH() / 2) - getBottomBarsH());
        }

        /* Hauteur de la zone sûre du HAUT (encoche, barre de statut). Mesurée par une
           sonde plutôt que devinée : `env()` n'est lisible qu'en CSS, et sa valeur dépend
           de l'appareil et de `viewport-fit`. Même technique que getViewportH(). */
        function getSafeTopPx() {
            try {
                const el = document.createElement('div');
                el.style.cssText = 'position:fixed;top:0;height:env(safe-area-inset-top, 0px);'
                                 + 'visibility:hidden;pointer-events:none;';
                document.body.appendChild(el);
                const h = el.offsetHeight || 0;
                document.body.removeChild(el);
                return h;
            } catch (e) { return 0; }
        }

        /* Hauteur de l'état 'immersive' (Objectifs / Profil) : la carte n'a AUCUNE valeur
           informative pendant leur consultation — on n'y sélectionne rien dessus, aucun
           cadrage n'en dépend — contrairement à Itinéraire où elle reste le repère du
           trajet en cours de saisie. La règle 50/50 n'a donc de sens que pour ce dernier ;
           ces deux onglets n'ont droit qu'à deux états, plein écran ou fermé, jamais un
           entre-deux qui masquerait la moitié de leur contenu pour rien.

           ⚠ PLEIN ÉCRAN VEUT DIRE JUSQU'EN HAUT (16/08/2026). La première version retirait
           60 px pour recopier le plafond général de `#ui-panel` — un plafond qui garde
           volontairement une bande de carte visible, ce qui a du sens pour une feuille
           ancrée en bas mais pas pour un écran qui se veut plein : Objectifs et Profil
           s'arrêtaient à 60 px du bord. On ne réserve donc plus que la zone sûre du haut
           (`getSafeTopPx`), sans laquelle le titre du panneau passerait sous l'encoche.
           `body.panel-immersive-open #ui-panel` lève le plafond général en conséquence :
           les deux calculs doivent rester d'accord. */
        function getImmersiveHeightPx() {
            return Math.max(SHEET_MIN_H, getViewportH() - getBottomBarsH() - getSafeTopPx());
        }

        function syncSheetHeightVar() {
            const h = getSheetHeightPx();
            document.documentElement.style.setProperty('--sheet-h', h + 'px');
            return h;
        }

        /* Le panneau itinéraire recouvre une partie de la carte : le bas de l'écran en
           portrait, la colonne de gauche en paysage. Sans compensation, un flyTo centré
           sur la destination place le marqueur sous le panneau, donc hors cadre. */
        const PANEL_LANDSCAPE_MQ = '(max-height: 600px) and (orientation: landscape)';
        function isPanelLandscape() {
            return window.matchMedia(PANEL_LANDSCAPE_MQ).matches;
        }

        /* Décalage écran (en px) à appliquer pour que le point visé tombe au centre de
           la portion de carte réellement visible. On passe par `offset` et non `padding` :
           `padding` reste mémorisé dans l'état caméra de Mapbox et viendrait perturber le
           recentrage de la boucle de navigation, alors qu'`offset` ne vaut que pour ce
           déplacement-là. */
        /* Marge à réserver pour que le point suivi tombe au centre de la portion de carte
           RÉELLEMENT visible, c'est-à-dire hors panneau et hors barres du bas.

           Règle unique partagée par le suivi GPS (updateDynamicZoom) et le recadrage sur une
           destination (focusDestinationOnMap). Auparavant chacun avait la sienne — `padding`
           pour l'un, `offset` pour l'autre — or Mapbox MÉMORISE le padding dans l'état de la
           caméra : le vol de recadrage héritait donc du padding du suivi et son offset venait
           s'y ajouter. Les deux décalages se cumulaient de façon imprévisible.

           Le calcul se fait entièrement sur le rectangle du CANEVAS, jamais sur `window` :
           la carte étant en position fixed sur 100% de hauteur, elle déborde sous les barres
           du bas et sous l'interface du navigateur mobile. `m.bottom - r.top` mesure donc
           exactement ce qui est masqué en bas, débordement compris — là où l'ancienne demi-
           hauteur de panneau (`offsetHeight / 2`) sous-estimait la zone couverte et posait le
           point trop bas, juste au-dessus du panneau. */
        /* ⚠ Plancher de bande de carte — MÊME valeur que le MIN_MAP_BAND de
           fitMapToModalRoute() et _gasScanPadding(). Il valait 80 px, ce qui était un
           bornage anti-NaN mais PAS un plancher utilisable : le panneau Itinéraire en
           état 'full' monte jusqu'à `availH - 60`, donc le padding saturait à
           `hauteur - 80` et le point visé atterrissait au milieu d'un ruban de 80 px
           collé en haut de l'écran — sous l'encoche et les barres système du téléphone.
           Le flyTo partait bien, mais on ne voyait rien arriver : d'où « l'autozoom ne
           se fait plus » alors qu'aucune erreur n'était journalisée. */
        const MAP_FOLLOW_MIN_BAND = 150;

        /* En navigation paysage, ce n'est plus #ui-panel qui masque la gauche de la carte
           mais la colonne d'infos — bannière du prochain virage et compteurs du trajet
           (voir « PAYSAGE EN TRAJET » dans styles.css). On prend le bord droit le plus à
           droite parmi les blocs RÉELLEMENT affichés : la bannière de virage disparaît
           entre deux manœuvres, les compteurs restent. */
        const NAV_RAIL_IDS = ['next-turn-panel', 'nav-bottom-bar'];
        function _navRailRightEdge() {
            let edge = 0;
            NAV_RAIL_IDS.forEach(id => {
                const el = document.getElementById(id);
                if (!el) return;
                const r = el.getBoundingClientRect();
                if (r.width > 0 && r.height > 0) edge = Math.max(edge, r.right);
            });
            return edge;
        }

        function getMapFollowPadding() {
            const pad = { top: 0, right: 0, bottom: 0, left: 0 };
            const panel = document.getElementById('ui-panel');
            const mapEl = (typeof map !== 'undefined' && map && map.getContainer) ? map.getContainer() : null;
            if (!mapEl) return pad;

            const m = mapEl.getBoundingClientRect();
            if (m.width <= 0 || m.height <= 0) return pad;
            const r = panel ? panel.getBoundingClientRect() : null;
            const panneauVisible = !!r && r.width > 0 && r.height > 0;

            // Bornage : un padding supérieur à la taille du canevas rendrait la caméra folle
            // (panneau déployé plein écran, mesure prise pendant une transition…).
            // Sur un écran plus court que la bande souhaitée on se rabat sur la moitié,
            // même arbitrage que _clampMapPadding().
            const bandeH = Math.min(MAP_FOLLOW_MIN_BAND, m.height * 0.5);
            const bandeW = Math.min(MAP_FOLLOW_MIN_BAND, m.width * 0.5);
            if (isPanelLandscape()) {
                let bordDroit = panneauVisible ? r.right : 0;
                if (document.body.classList.contains('nav-active')) {
                    bordDroit = Math.max(bordDroit, _navRailRightEdge());
                }
                if (bordDroit <= 0) return pad;
                pad.left = Math.max(0, Math.min(bordDroit - m.left, m.width - bandeW));
            } else {
                if (!panneauVisible) return pad;
                pad.bottom = Math.max(0, Math.min(m.bottom - r.top, m.height - bandeH));
            }
            return pad;
        }

        /* Recentre la carte sur une destination en la plaçant dans la zone visible.
           Par défaut on laisse d'abord le panneau finir sa transition, sinon la mesure
           porterait sur une hauteur intermédiaire et le cadrage serait faux. */
        /* Un seul recadrage en vol à la fois. Une validation d'adresse en déclenche
           légitimement deux — le rappel explicite de la fonction, et celui que produit le
           blur du champ via resolveTypedDestination() — vers le même point mais avec des
           durées différentes : deux flyTo concurrents et deux replis de panneau pour un
           seul geste. Le dernier appel gagne, ce qui est aussi la bonne règle si
           l'utilisateur change de destination pendant l'attente. */
        let _focusDestTimer = null;

        function focusDestinationOnMap(coords, opts = {}) {
            saveDestinationDraft();
            if (_focusDestTimer) { clearTimeout(_focusDestTimer); _focusDestTimer = null; }

            /* Regarder une destination DÉTACHE la caméra du suivi GPS, exactement comme un
               glissement de doigt (map.on('dragstart')) ou le mode ping. C'est indispensable :
               la boucle de suivi s'exécute à chaque fix GPS et toute commande caméra qu'elle
               émet — même un jumpTo qui ne touche pas au centre — annule le flyTo en cours,
               puis ramène la vue sur le conducteur. Le contact semblait alors « ne pas se
               charger ». Une temporisation ne suffisait pas : le suivi reprenait la main dès
               son expiration. Le retour se fait par le bouton Recentrer, ou automatiquement
               après 8 s si un trajet réel est déjà en cours (frôlement involontaire). */
            if (lastRealCoords || isCourseStarted) {
                isUserPanning = true;
                showRecenterBtn(true);
                if (userPanningResumeTimer) { clearTimeout(userPanningResumeTimer); userPanningResumeTimer = null; }
                if (isCourseStarted && !isSimulationMode) {
                    userPanningResumeTimer = setTimeout(() => { recenterMap(); }, 8000);
                }
            }

            const zoom = opts.zoom !== undefined ? opts.zoom : 16;
            const duration = opts.duration !== undefined ? opts.duration : 1200;
            const fly = () => {
                try {
                    map.flyTo({ center: coords, zoom, padding: getMapFollowPadding(), duration });
                } catch (e) {
                    logAppError('focusDestinationOnMap/flyTo', e);
                    // Repli sans padding : la premiere tentative est deja journalisee ci-dessus,
                    // ce second echec n'ajouterait rien qu'une ligne redondante.
                    tenterSansBruit(() => map.flyTo({ center: coords, zoom, duration }), 'flyTo/repli');
                }
            };

            /* ⚠ AUCUN REPLI DU PANNEAU ICI — et surtout ne pas le rétablir.
               Une version précédente repassait le panneau de 'full' à 'half' (200 px) avant
               de mesurer. C'était un contournement, pas une règle : en 'full' le panneau
               montait alors à `availH - 60`, il ne concédait qu'une soixantaine de pixels de
               carte, et le point visé atterrissait dans un ruban en haut de l'écran.

               La RÈGLE 50/50 a supprimé la cause : 'full' vaut désormais exactement la moitié
               de l'écran, l'autre moitié revient à la carte. Le repli n'apportait donc plus
               rien et coûtait cher — il réduisait le panneau à la seule cellule Destination,
               et le bouton DÉMARRER disparaissait juste au moment où l'utilisateur venait de
               valider son adresse et voulait partir.

               Leçon à garder : un contournement posé pour compenser une géométrie fautive
               doit être retiré quand la géométrie est corrigée, sinon il devient à son tour
               la cause du symptôme suivant. */
            const doFly = () => {
                /* ⚠ L'aperçu de trajet a pu s'ouvrir pendant les 600 ms d'attente : c'est
                   le cas systématique quand on appuie sur Démarrer alors que le champ
                   Destination a le focus — le blur déclenche resolveTypedDestination(),
                   qui demande un recadrage, et openTripModal() suit 450 ms plus tard.
                   Ce vol tardif écraserait le fitBounds de calculateTripPreview() : le
                   trajet complet serait remplacé par un zoom 16 sur la seule arrivée.
                   Le modal pose son propre cadrage, on lui laisse la main. */
                const _tripOverlay = document.getElementById('trip-modal-overlay');
                if (_tripOverlay && _tripOverlay.classList.contains('open')) return;

                /* Panneau escamoté ou réduit à la poignée : on le REDÉPLOIE au lieu de le
                   laisser tel quel. Consulter une destination et voir la carte se recadrer
                   sans pouvoir appuyer sur DÉMARRER serait un cul-de-sac. En 'full' le
                   panneau vaut la moitié de l'écran (règle 50/50) : la carte garde l'autre
                   moitié, le cadrage reste juste. */
                if (panelSnapState !== 'full' && !isPanelLandscape() && !isCourseStarted) {
                    setPanelSnap('full');
                    // 340 ms : le temps que la transition de hauteur (0,3 s) s'achève.
                    // Mesurer pendant donnerait une hauteur intermédiaire, donc un cadrage
                    // faux — même piège que _gasScanPadding() avec la feuille du scan.
                    _focusDestTimer = setTimeout(() => { _focusDestTimer = null; fly(); }, 340);
                    return;
                }
                fly();
            };
            if (opts.immediate) doFly();
            else _focusDestTimer = setTimeout(() => { _focusDestTimer = null; doFly(); }, 600);
        }

        /* Remise à zéro du défilement du panneau quand il ressort d'un escamotage.
           Motif : on descend dans Itinéraire jusqu'à perdre de vue la cellule
           Destination, on referme le panneau (appui sur l'onglet, hotbox, glissement),
           puis on le rouvre — et il revenait exactement là où on l'avait laissé, sur
           une vue qui ne montre plus l'information principale. Rouvrir est un geste de
           reprise : la première cellule doit être là.

           La garde est DANS setPanelSnap plutôt que chez les appelants parce que les
           trois chemins d'ouverture (switchMainTab, openSearchFromHotbox, glissement au
           doigt) y convergent tous — et parce que la condition « on SORT d'un état
           escamoté » ne se lit qu'ici, où l'ancien état est encore connu.
           refreshPanelForViewport() rejoue setPanelSnap(panelSnapState) au
           redimensionnement : état identique, donc aucun reset intempestif.

           On remet à zéro TOUS les .panel-tab-content, pas seulement l'actif :
           switchMainTab() appelle setPanelSnap AVANT de déplacer la classe 'active',
           lire l'onglet actif ici viserait donc encore le précédent. Le panneau
           lui-même défile aussi en portrait (#ui-panel { overflow-y: auto }), d'où les
           deux remises à zéro. */
        function _resetPanelScroll() {
            const panel = document.getElementById('ui-panel');
            if (panel) panel.scrollTop = 0;
            document.querySelectorAll('.panel-tab-content').forEach(c => { c.scrollTop = 0; });
        }

        function setPanelSnap(state, opts = {}) {
            const panel = document.getElementById('ui-panel');
            const etaitEscamote = (panelSnapState === 'hidden' || panelSnapState === 'min');
            panel.classList.remove('minimized');
            panelSnapState = state;
            if (etaitEscamote && state !== 'hidden' && state !== 'min') _resetPanelScroll();
            /* Classe sur <body>, pas sur #ui-panel : le widget météo (#weather-widget,
               top:52px/left:14px) n'est pas un enfant du panneau, il flotte au même endroit
               que son coin supérieur en 'immersive'. setPanelSnap() est le seul chemin par
               lequel cet état s'installe ou se quitte (chevron, tap d'onglet, geste de
               glissement, réapplication au redimensionnement) : y poser la classe une seule
               fois couvre tous les appelants d'un coup, plutôt que de la dupliquer à chacun
               des points d'entrée comme l'état 'immersive' lui-même a dû l'être. */
            document.body.classList.toggle('panel-immersive-open', state === 'immersive');
            /* Sens du chevron. 'half' ne pose AUCUNE classe (il ne joue que sur un
               max-height inline) : sans ce drapeau, le CSS n'avait aucun moyen de
               distinguer un panneau déployé d'un panneau à 200 px, et la flèche restait
               tournée vers le bas dans les deux cas. Une classe plutôt qu'un style inline,
               pour que les règles paysage puissent la surcharger.
               'immersive' compte comme déployé au même titre que 'full' : c'est l'état le
               plus ouvert d'Objectifs/Profil, pas un état réduit. */
            panel.classList.toggle('panel-collapsed', state !== 'full' && state !== 'immersive');
            updatePanelBottomOffset();

            /* ═══ PAYSAGE : ON NE POSE AUCUNE HAUTEUR EN PIXELS ═══

               ⚠ C'EST ICI QUE SE JOUAIT LE PANNEAU PAYSAGE ÉCRASÉ À 160 px, et non dans le
               suivi d'orientation. Tout le bas de cette fonction raisonne en géométrie
               PORTRAIT : une feuille ancrée en bas, dont on fixe la hauteur en pixels par
               `min-height` + `max-height` INLINE. En paysage, le panneau n'est plus une
               feuille mais une COLONNE dont la hauteur vient de la feuille de styles
               (`height: calc(100vh - var(--panel-bottom-offset))`) — et l'inline l'emporte
               sur la règle CSS. `getSheetHeightPx()` valant ici son plancher SHEET_MIN_H
               (412 / 2 - 64 = 142, sous les 160 px), la colonne se retrouvait haute de
               160 px avec ses deux barres de défilement.

               Corriger le seul démarrage ne suffisait pas : `setPanelSnap()` est appelée
               depuis une vingtaine d'endroits (changement d'onglet, loupe, ouverture du
               modal, fin de trajet…). Le premier appui sur ITINÉRAIRE reposait aussitôt les
               160 px. La garde doit donc être DANS cette fonction, pas autour.

               `panelSnapState` est bien mémorisé plus haut : le retour en portrait rejoue
               l'état exact via refreshPanelForViewport(). */
            if (isPanelLandscape()) {
                // Seul « escamoté » garde un sens sur une colonne : les états intermédiaires
                // ('min' 54 px, 'half' 200 px) sont des hauteurs de feuille, ils masqueraient
                // le contenu sans rien libérer — la carte occupe déjà toute la droite.
                const escamote = (state === 'hidden');
                panel.classList.toggle('panel-collapsed', escamote);
                panel.classList.remove('panel-min');
                panel.classList.toggle('panel-hidden', escamote);
                panel.style.bottom    = '';   // ancrage bas : notion portrait
                panel.style.maxHeight = '';   // ⚠ c'est CE style inline qui écrasait la règle CSS
                panel.style.minHeight = '';
                panel.style.overflow  = escamote ? 'hidden' : '';
                panel.style.transition = '';
                return;
            }

            // opts.immediate : appliquer la nouvelle hauteur sans l'animer. Utilisé par les
            // changements d'onglet, où le panneau doit simplement se trouver à la bonne
            // taille. Sans cela, passer d'Itinéraire à Objectifs ou Profil laissait voir le
            // max-height glisser d'une valeur à l'autre — visible dans ce sens seulement,
            // car le contenu de ces deux onglets est assez long pour occuper toute la
            // hauteur autorisée, contrairement à celui d'Itinéraire. Entre Objectifs et
            // Profil la hauteur est identique, donc rien ne bougeait déjà.
            const immediate = opts.immediate === true;
            const trans = (value) => (immediate ? 'none' : value);
            const clearTrans = (delay) => {
                if (!immediate) {
                    setTimeout(() => { panel.style.transition = ''; }, delay);
                    return;
                }
                // Un reflow explicite est nécessaire avant de rétablir les transitions :
                // sans lui, le navigateur peut regrouper le changement de hauteur et la
                // levée du 'none' dans le même recalcul de style, et animer quand même.
                requestAnimationFrame(() => {
                    void panel.offsetHeight;
                    panel.style.transition = '';
                });
            };

            // Hauteur réelle en bas = barre nav principale + nav-bottom-bar si visible
            const mainNavH = getBottomBarsH();
            const _navBottomBar = document.getElementById('nav-bottom-bar');
            const _navBottomBarH = (_navBottomBar && _navBottomBar.classList.contains('visible'))
                ? _navBottomBar.offsetHeight : 0;
            const navBarH = mainNavH + _navBottomBarH;
            // Ancrer le panneau au-dessus du nav-bottom-bar si visible, sinon CSS gère
            panel.style.bottom = _navBottomBarH > 0 ? navBarH + 'px' : '';
            if (state === 'hidden') {
                // Escamotage total : la carte occupe tout l'écran. On ne peut le remonter
                // qu'en retapant sur l'onglet de la barre du bas (qui, elle, reste visible).
                panel.classList.remove('panel-min');
                panel.classList.add('panel-hidden');
                panel.style.transition = trans('max-height 0.25s ease, opacity 0.2s ease, padding 0.25s ease');
                panel.style.maxHeight = '0px';
                panel.style.minHeight = '0px';
                panel.style.overflow = 'hidden';
                clearTrans(280);
            } else if (state === 'min') {
                panel.classList.remove('panel-hidden');
                panel.classList.add('panel-min');
                panel.style.transition = trans('max-height 0.25s ease, bottom 0.25s ease');
                panel.style.maxHeight = PANEL_MIN_VISIBLE + 'px';
                panel.style.minHeight = PANEL_MIN_VISIBLE + 'px';
                panel.style.overflow = 'hidden';
                clearTrans(280);
            } else if (state === 'half') {
                panel.classList.remove('panel-min', 'panel-hidden');
                panel.style.transition = trans('max-height 0.3s ease, bottom 0.3s ease');
                panel.style.maxHeight = '200px';
                panel.style.minHeight = '';
                panel.style.overflow = '';
                clearTrans(320);
            } else if (state === 'immersive') {
                // Objectifs / Profil déployés : voir getImmersiveHeightPx(). Même mécanique
                // que 'full' ci-dessous, hauteur différente — la carte n'a rien à offrir
                // derrière ces deux onglets, autant lui rendre le moins d'écran possible.
                panel.classList.remove('panel-min', 'panel-hidden');
                panel.style.transition = trans('max-height 0.3s ease, min-height 0.3s ease, bottom 0.3s ease');
                const immersiveH = getImmersiveHeightPx();
                panel.style.maxHeight = immersiveH + 'px';
                panel.style.minHeight = immersiveH + 'px';
                panel.style.overflow = '';
                clearTrans(320);
            } else {
                panel.classList.remove('panel-min', 'panel-hidden');
                panel.style.transition = trans('max-height 0.3s ease, min-height 0.3s ease, bottom 0.3s ease');

                /* 'full' = règle 50/50, voir getSheetHeightPx(). Ne sert plus qu'à
                   Itinéraire (16/08/2026) : Objectifs et Profil sont passés à 'immersive'
                   ci-dessus, la carte n'y ayant aucune valeur informative. Avant cette date,
                   les trois onglets partageaient cette même branche — plus de branche
                   `tab-secondary` : Objectifs et Profil recopiaient une hauteur relevée sur
                   Itinéraire, mesure qui n'existait que si l'on avait déployé cet onglet au
                   moins une fois, et retombait sinon sur 60 % de l'écran.

                   ⚠ min ET max height : la hauteur est FIXE, pas plafonnée. Un onglet au
                   contenu court (Itinéraire) laisse du vide en bas plutôt que de remonter
                   la ligne de séparation — c'est précisément ce qu'on cherche. Les modes de
                   saisie (.search-focus, .profile-focus) relâchent les deux avec
                   `!important` pour venir se coller au clavier ; ne pas leur retirer. */
                const sheetH = syncSheetHeightVar();
                // --panel-secondary-h reste alimentée : le CSS de tab-secondary et le repli
                // en cascade de la feuille du scan ⛽ la lisent encore.
                document.documentElement.style.setProperty('--panel-secondary-h', sheetH + 'px');
                panel.style.maxHeight = sheetH + 'px';
                panel.style.minHeight = sheetH + 'px';
                panel.style.overflow = '';
                clearTrans(320);
            }
        }

        /* Le chevron est un interrupteur à DEUX états, plus un cycle à trois.
           Il annonce ce que fait l'appui suivant, et cette promesse doit être tenue :
           déployé il réduit (▼), réduit il redéploie (▲). Le cycle précédent
           full → half → min → full laissait le chevron pointer vers le bas alors que le
           panneau était déjà à 200 px — l'utilisateur lisait « je vais encore descendre »
           sans savoir qu'il restait un cran, et devait taper trois fois pour remonter.

           L'état 'min' (poignée de 54 px) n'est pas perdu par choix : il était DÉJÀ écarté
           par les deux autres commandes du panneau. Le glissement au doigt s'arrête sur
           'hidden' — « deux états visuellement très proches pour un même geste », dit son
           propre commentaire — et le double-appui sur l'onglet fait de même. Le chevron
           était le dernier chemin vers un état que le reste de l'interface avait abandonné.

           ⚠ Objectifs et Profil n'ONT PAS de position 'half' (16/08/2026) : la carte
           derrière eux ne sert à rien, un demi-panneau ne ferait que masquer la moitié de
           leur contenu pour la remplacer par du vide. Le chevron y bascule donc plein
           écran <-> fermé, sans passer par l'état intermédiaire réservé à Itinéraire. */
        function togglePanel(e) {
            if (e) e.stopPropagation();

            /* ⚠⚠ SORTIR D'ABORD DES MODES DE SAISIE — sans quoi LE CHEVRON NE FAIT RIEN
               (corrigé le 16/08/2026). `#ui-panel.search-focus` et `.profile-focus` posent
               `max-height: none !important`, précisément pour que le panneau puisse se
               coller au clavier ; l'`!important` l'emporte sur le `max-height` inline
               qu'écrit setPanelSnap(). Résultat : `panelSnapState` basculait bien, le
               glyphe du chevron s'inversait, et **la hauteur ne bougeait pas d'un pixel**.
               Un bouton mort qui a pourtant l'air de répondre.
               Réduire le panneau, c'est en avoir fini avec la saisie : on quitte donc le
               mode avant d'appliquer l'état, plutôt que d'affaiblir le `!important` — dont
               le rôle au clavier reste nécessaire. `exitDestinationSearchMode()` restaure
               l'état mémorisé, que les lignes suivantes remplacent aussitôt. */
            if (_searchFocusActive) exitDestinationSearchMode();
            const _panel = document.getElementById('ui-panel');
            if (_panel && _panel.classList.contains('profile-focus')) {
                _panel.classList.remove('profile-focus');
                tenterSansBruit(() => document.activeElement?.blur(), 'togglePanel/blur');
            }

            const tab = document.querySelector('.panel-tab-content.active')?.id?.replace('panel-tab-', '');
            if (tab === 'objectifs' || tab === 'profil') {
                setPanelSnap(panelSnapState === 'immersive' ? 'hidden' : 'immersive');
                return;
            }
            if (panelSnapState === 'full') setPanelSnap('half');
            else setPanelSnap('full');
        }

        // === MODE SAISIE DESTINATION ===
        // Au focus du champ "Où allez-vous ?", le panneau se réduit à la seule cellule
        // Destination (voir CSS .search-focus). On restaure l'état normal à la sortie.
        let _searchFocusActive = false;
        let _searchFocusExitTimer = null;
        // État du panneau juste avant l'entrée dans le champ Destination : il est
        // restauré tel quel à la sortie (validation d'adresse, échap, clic ailleurs).
        let _searchFocusPrevSnap = null;

        function enterDestinationSearchMode() {
            const panel = document.getElementById('ui-panel');
            if (!panel) return;
            clearTimeout(_searchFocusExitTimer);
            if (_searchFocusActive) return;
            _searchFocusActive = true;
            // Mémorisation de l'état d'origine. Si le panneau était réduit/escamoté,
            // on ne peut pas y revenir (le champ y est invisible) : on retiendra 'full'.
            _searchFocusPrevSnap = (panelSnapState === 'min' || panelSnapState === 'hidden')
                ? 'full' : panelSnapState;
            // Si le panneau était réduit/escamoté, on le remet en état normal d'abord
            if (panelSnapState === 'min' || panelSnapState === 'hidden') setPanelSnap('full');
            // On ferme le formulaire "Créer un contact" s'il était ouvert
            try { toggleCreateContactForm(false); } catch (e) { logAppError('toggleCreateContactForm', e); }
            /* Idem pour le formulaire des lieux fixes : `place-focus` et `search-focus`
               masquent chacun la section de l'autre, les deux posées ensemble videraient le
               panneau. Défense par symétrie avec la ligne ci-dessus — le champ Destination
               est normalement inatteignable tant que `place-focus` est en place. */
            try { closePlaceForm(); } catch (e) { logAppError('closePlaceForm', e); }
            panel.scrollTop = 0;
            panel.style.transition = 'max-height 0.25s ease, padding 0.2s ease';
            panel.classList.add('search-focus');
            setTimeout(() => { panel.style.transition = ''; }, 280);
        }

        function exitDestinationSearchMode() {
            const panel = document.getElementById('ui-panel');
            if (!panel || !_searchFocusActive) return;
            _searchFocusActive = false;
            panel.style.transition = 'max-height 0.25s ease, padding 0.2s ease';
            panel.classList.remove('search-focus');
            // Restaure exactement l'état d'avant la saisie, quel que soit le mode de
            // validation de l'adresse (suggestion cliquée, frappe manuelle, voix, favori).
            const targetSnap = _searchFocusPrevSnap || panelSnapState;
            _searchFocusPrevSnap = null;
            setPanelSnap(targetSnap);
            setTimeout(() => { panel.style.transition = ''; }, 300);
        }

        /* Appelée dès qu'une destination est confirmée depuis le champ "Où allez-vous ?".
           Le mousedown des suggestions fait un preventDefault() (pour que le clic aboutisse
           avant le blur), ce qui laisse le focus sur l'input : sans blur explicite, aucun
           événement ne viendrait refermer le mode saisie et le panneau resterait réduit. */
        function finishDestinationSearchMode() {
            if (!_searchFocusActive) return;
            const input = document.getElementById('end-addr');
            if (input) input.blur();          // referme aussi le clavier mobile
            clearTimeout(_searchFocusExitTimer);
            exitDestinationSearchMode();
        }

        (function initDestinationSearchMode() {
            const input = document.getElementById('end-addr');
            if (!input) return;
            input.addEventListener('focus', enterDestinationSearchMode);

            /* Touche « Entrée » / « → » du clavier mobile : valide la destination sans
               obliger à viser une suggestion. Deux cas, tous deux se terminant par la sortie
               du champ (donc la fermeture du clavier) et un recadrage identique à un ping
               manuel sur la carte.
               1. Une liste de suggestions est ouverte → on rejoue la première, ce qui donne
                  des coordonnées exactes et un libellé propre plutôt qu'un géocodage du
                  texte partiel encore affiché.
               2. Aucune suggestion → le blur enchaîne sur resolveTypedDestination(), qui
                  géocode la saisie, pose le marqueur et recadre. */
            input.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                const box = document.getElementById('end-addr-suggestions');
                const first = (box && box.style.display !== 'none') ? box.querySelector('.addr-suggestion') : null;
                if (first) {
                    // Les suggestions réagissent au mousedown (et non au click) pour passer
                    // avant le blur : on rejoue donc exactement cet événement-là.
                    first.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
                }
                input.blur();
            });

            input.addEventListener('blur', () => {
                clearTimeout(_searchFocusExitTimer);
                // Délai : laisse le temps au clic sur une suggestion (mousedown) ou sur
                // un bouton de la cellule (micro / punaise / effacer) de s'exécuter.
                _searchFocusExitTimer = setTimeout(() => {
                    if (document.activeElement === input) return;
                    exitDestinationSearchMode();
                }, 250);
            });
        })();

        /* === ROTATION DE L'ÉCRAN ===
           setPanelSnap() pose des hauteurs en pixels directement sur l'élément (style
           inline). Ces valeurs, calculées pour l'orientation courante, restent en place
           après une rotation et l'emportent sur la feuille de styles :
             - portrait -> paysage : une max-height de ~700 px dépasse la fenêtre couchée,
               le bas du panneau (Trajet libre, statut GPS) passe sous la barre du bas ;
             - paysage -> portrait : une max-height de ~270 px tronque le panneau et fait
               disparaître les informations.
           On repart donc systématiquement d'une géométrie propre après chaque rotation. */
        function refreshPanelForViewport() {
            const panel = document.getElementById('ui-panel');
            if (!panel) return;
            // Pendant la saisie d'adresse, le clavier mobile déclenche lui aussi un resize :
            // on ne touche à rien pour ne pas casser le mode saisie.
            if (_searchFocusActive) return;
            updatePanelBottomOffset();
            // La moitié d'écran change avec la fenêtre : recalculée AVANT de reposer les
            // hauteurs, sinon le modal de trajet garderait celle de l'orientation précédente.
            syncSheetHeightVar();
            panel.style.transition = '';
            if (isPanelLandscape()) {
                // En paysage, la feuille de styles gère la colonne pleine hauteur avec son
                // propre défilement : on efface tout ce qui a été posé en inline.
                panel.style.maxHeight = '';
                panel.style.minHeight = '';
                panel.style.bottom = '';
                if (panelSnapState === 'hidden') {
                    panel.style.overflow = 'hidden';
                } else {
                    // L'état réduit n'a pas de sens sur une colonne verticale : il masquerait
                    // tout le contenu. Il sera rétabli au retour en portrait.
                    panel.classList.remove('panel-min');
                    panel.style.overflow = '';
                }
                /* La hauteur du panneau exclut désormais la barre du bas (règle CSS paysage :
                   height: calc(100vh - var(--panel-bottom-offset))). Y ajouter un padding
                   reviendrait à réserver deux fois la même place et à rogner le contenu. */
                panel.style.paddingBottom = '';
            } else {
                panel.style.paddingBottom = '';
                setPanelSnap(panelSnapState);
            }
        }

        (function initPanelOrientationWatcher() {
            /* Première pose de --sheet-h : le CSS du modal et de la feuille du scan la
               lisent dès le premier rendu. Sans elle, ils démarrent sur le repli en dur de
               la déclaration `var()` — juste, mais calculé par le moteur CSS avec `dvh`,
               donc légèrement différent de notre arrondi au pixel. */
            syncSheetHeightVar();

            let t = null;
            const schedule = (delay) => {
                clearTimeout(t);
                t = setTimeout(refreshPanelForViewport, delay);
            };
            window.addEventListener('orientationchange', () => schedule(300));
            // Sur Android, orientationchange n'est pas toujours émis : on suit aussi le
            // basculement du media query, qui est le signal le plus fiable.
            // Sans cet abonnement, la bascule portrait/paysage n'est plus détectée du
            // tout sur Android (orientationchange n'y est pas fiable) : le panneau garde
            // la géométrie de l'orientation précédente. Un silence total ici renverrait
            // droit à l'enquête paysage du 15/08/2026.
            try {
                const mq = window.matchMedia(PANEL_LANDSCAPE_MQ);
                const onChange = () => schedule(150);
                if (mq.addEventListener) mq.addEventListener('change', onChange);
                else if (mq.addListener) mq.addListener(onChange);
            } catch (e) { logAppError('panelOrientationWatcher/matchMedia', e); }

            /* ⚠ LES DEUX SIGNAUX CI-DESSUS SONT DES TRANSITIONS — ils ne disent rien de
               l'état de DÉPART. Or l'app peut très bien DÉMARRER en paysage : téléphone
               déjà tourné au lancement, ou simulateur ouvert en mode Paysage. Aucun des
               deux écouteurs ne se déclenche alors, `refreshPanelForViewport()` n'est
               jamais appelée, et l'initialisation ordinaire laisse en place les hauteurs
               inline calculées pour le portrait.

               Le symptôme est spectaculaire et pourtant logique : `min-height` et
               `max-height` INLINE l'emportent sur le `height: calc(100vh - …)` de la règle
               paysage de la feuille de styles. La colonne restait donc figée à
               `getSheetHeightPx()`, qui vaut ici son plancher SHEET_MIN_H (160 px) —
               412 px de haut / 2 - 64 = 142, sous le plancher. D'où un panneau de la bonne
               LARGEUR (380 px, la règle CSS s'applique bien) mais haut de 160 px, avec ses
               deux barres de défilement.

               On corrige donc l'état initial, et UNIQUEMENT en paysage : en portrait le
               chemin de démarrage est déjà correct, et rejouer `setPanelSnap()` ici
               écraserait l'état escamoté posé au chargement. */
            if (isPanelLandscape()) setTimeout(refreshPanelForViewport, 0);

            /* Un simple redimensionnement n'émet ni `orientationchange` ni forcément le
               `change` du media query — c'est exactement le cas du simulateur, où la
               rotation n'est qu'un changement de taille de l'iframe. On suit donc aussi
               `resize`, mais seulement quand le VERDICT paysage a changé : sans ce filtre,
               chaque apparition du clavier virtuel rejouerait la géométrie du panneau en
               pleine saisie d'adresse. */
            let _etaitPaysage = isPanelLandscape();
            window.addEventListener('resize', () => {
                const paysage = isPanelLandscape();
                if (paysage === _etaitPaysage) return;
                _etaitPaysage = paysage;
                schedule(150);
            });
        })();

        (function initPanelDrag() {
            const panel = document.getElementById('ui-panel');
            let dragStartY = 0, dragStartH = 0, isDragging = false;
            let lastMoveY = 0, lastMoveTime = 0, velocity = 0;
            const isMobilePortrait = () => window.innerWidth <= 600 && window.innerHeight > window.innerWidth;
            const getNavBarH = () => {
                const mainH = getBottomBarsH();
                const nb = document.getElementById('nav-bottom-bar');
                return mainH + ((nb && nb.classList.contains('visible')) ? nb.offsetHeight : 0);
            };
            const maxH = () => Math.floor(window.innerHeight - getNavBarH() - 60);
            const minH = () => PANEL_MIN_VISIBLE;

            panel.addEventListener('touchstart', function(e) {
                if (!isMobilePortrait()) return;
                const rect = panel.getBoundingClientRect();
                const touchY = e.touches[0].clientY;
                if (touchY < rect.top || touchY > rect.top + 50) return;
                isDragging = true;
                dragStartY = touchY;
                panel.classList.remove('minimized');
                panel.classList.remove('panel-min');
                panel.classList.remove('panel-hidden');
                panel.style.minHeight = PANEL_MIN_VISIBLE + 'px'; // plancher absolu pendant le drag
                dragStartH = Math.max(minH(), panel.offsetHeight);
                lastMoveY = touchY;
                lastMoveTime = Date.now();
                velocity = 0;
                panel.style.transition = 'none';
                panel.style.overflow = 'hidden';
            }, { passive: true });

            panel.addEventListener('touchmove', function(e) {
                if (!isDragging) return;
                const touchY = e.touches[0].clientY;
                const deltaY = dragStartY - touchY;
                const newH = Math.max(minH(), Math.min(maxH(), dragStartH + deltaY));
                panel.style.maxHeight = newH + 'px';

                const now = Date.now();
                const dt = now - lastMoveTime;
                if (dt > 0) velocity = (lastMoveY - touchY) / dt;
                lastMoveY = touchY;
                lastMoveTime = now;
            }, { passive: true });

            panel.addEventListener('touchend', function() {
                if (!isDragging) return;
                isDragging = false;

                let currentH = panel.offsetHeight;
                const inertiaDistance = velocity * 150;
                let targetH = Math.max(minH(), Math.min(maxH(), currentH + inertiaDistance));

                /* Objectifs / Profil : mêmes deux états qu'au chevron (togglePanel) et au
                   double-appui sur l'onglet (switchMainTab). Sans cette sortie précoce, le
                   geste retomberait dans la branche « position intermédiaire » ci-dessous et
                   laisserait le panneau à mi-hauteur — exactement le demi-écran de carte
                   inutile que ces deux états existent pour supprimer. */
                const _dragTab = document.querySelector('.panel-tab-content.active')?.id?.replace('panel-tab-', '');
                if (_dragTab === 'objectifs' || _dragTab === 'profil') {
                    setPanelSnap(targetH > (minH() + maxH()) / 2 ? 'immersive' : 'hidden');
                    return;
                }

                if (targetH < minH() + 30) {
                    // Glissement jusqu'en bas : le panneau s'efface COMPLÈTEMENT sous le
                    // bandeau, exactement comme le double-appui sur l'onglet. Il s'arrêtait
                    // auparavant sur 'min', laissant dépasser une poignée de 54 px — deux
                    // états visuellement très proches pour un même geste. On délègue à
                    // setPanelSnap pour que l'état escamoté soit strictement identique
                    // quel que soit le déclencheur (geste, ping carte, double-appui).
                    // setPanelSnap gère lui-même la transition et sa levée : on sort ici,
                    // sinon le setTimeout de fin de fonction l'interromprait avant terme.
                    setPanelSnap('hidden');
                    return;
                } else if (targetH > maxH() * 0.85) {
                    // Ouvrir complètement. On délègue également ici : sur les onglets
                    // Objectifs et Profil, la hauteur déployée est celle alignée sur
                    // Itinéraire, que seul setPanelSnap sait calculer. Poser maxH() en dur
                    // rouvrirait le panneau plus haut et casserait cet alignement.
                    setPanelSnap('full');
                    return;
                } else {
                    // Position intermédiaire
                    panel.classList.remove('panel-min');
                    panel.style.transition = 'max-height 0.25s ease-out';
                    panel.style.maxHeight = Math.round(targetH) + 'px';
                    panel.style.minHeight = '';
                    panel.style.overflow = '';
                    panelSnapState = 'half';
                    // Cette branche pose l'état à la main sans passer par setPanelSnap :
                    // le chevron doit quand même se retourner, sinon un panneau réduit au
                    // doigt afficherait encore la flèche de réduction.
                    panel.classList.add('panel-collapsed');
                }

                setTimeout(() => { panel.style.transition = ''; }, 280);
            }, { passive: true });
        })();

        /* Recalcule --panel-bottom-offset dès qu'une barre du bas apparaît, disparaît
           ou change de hauteur (rotation, safe-area, passage en navigation). */
        (function initPanelBottomOffsetWatcher() {
            const targets = ['main-bottom-nav', 'nav-bottom-bar']
                .map(id => document.getElementById(id))
                .filter(Boolean);

            const refresh = () => updatePanelBottomOffset();

            if (typeof ResizeObserver !== 'undefined') {
                const ro = new ResizeObserver(refresh);
                targets.forEach(el => ro.observe(el));
            }
            // display:none <-> flex ne déclenche pas toujours ResizeObserver : on suit aussi la classe
            const mo = new MutationObserver(refresh);
            targets.forEach(el => mo.observe(el, { attributes: true, attributeFilter: ['class', 'style'] }));

            window.addEventListener('resize', refresh);
            window.addEventListener('orientationchange', () => setTimeout(refresh, 200));

            refresh();
        })();

        function toggleInfoWidget() {
            document.getElementById('info-widget').classList.toggle('open');
        }

        /* ⚠ LE BADGE D'INFO N'A QU'UN SEUL RÔLE : déplier les informations du trajet.
           Il a porté quelques heures, le 21/08/2026, un second état où il passait au
           centre de l'écran en « 🏁 Je suis arrivé » dès 500 m de la destination
           (`setArrivalUi` / `onInfoBadgeClick`, retirés avec la classe CSS `arrival-mode`).

           **Ne pas le rétablir. Un trajet ne se termine que lorsqu'on est ARRIVÉ à
           l'adresse.** Un bouton posé au milieu de l'écran alors qu'il reste 400 m à
           parcourir propose de couper le guidage à quelqu'un qui roule encore et en a
           toujours besoin ; il annonce une arrivée qui n'a pas eu lieu, et un appui
           distrait au feu rouge suffit à en faire une erreur.

           Les deux seules façons de terminer sont donc : arriver vraiment (sous
           `ARRIVAL_AUTO_M`, le trajet se termine seul), ou la bulle 🏁 de la hotbox — un
           geste délibéré que rien n'affiche spontanément. Voir la note des seuils dans
           `js/00-noyau-calculs.js`. */

        function buildRouteSteps(osrmData) {
            routeSteps = []; stepArrivalDist = []; currentStepIndex = 0; announcedThresholds = {}; _routeDeviationHandled = false; _maxDistAlongM = null;
            if (!osrmData || !osrmData.routes || !osrmData.routes[0].legs) return;
            let cum = 0;
            osrmData.routes[0].legs.forEach(leg => {
                (leg.steps || []).forEach(step => {
                    stepArrivalDist.push(cum);
                    routeSteps.push(step);
                    cum += step.distance;
                });
            });
        }

        // Retourne la limite de vitesse estimée pour une distance donnée le long du trajet,
        // en se basant sur les données Mapbox Directions (distance/duration de chaque step).
        // Utilisé en simulation pour adapter la vitesse du véhicule à chaque portion de route,
        // sans dépendre d'Overpass (trop lent pour la vitesse d'avancement de la simulation).
        function getStepSpeedLimitAtDist(distMeters) {
            if (!routeSteps.length || !stepArrivalDist.length) return 50;
            let stepIdx = 0;
            for (let i = stepArrivalDist.length - 1; i >= 0; i--) {
                if (distMeters >= stepArrivalDist[i]) { stepIdx = i; break; }
            }
            const step = routeSteps[stepIdx];
            if (!step || !step.duration || step.duration <= 0) return 50;
            const avgSpeedMs = step.distance / step.duration;
            const avgSpeedKmh = avgSpeedMs * 3.6;
            const paliers = [30, 50, 70, 80, 90, 110, 130];
            let closest = 50;
            let minDiff = 999;
            paliers.forEach(p => {
                const diff = Math.abs(avgSpeedKmh - p);
                if (diff < minDiff) { minDiff = diff; closest = p; }
            });
            return closest;
        }

        // === LIMITES MAPBOX PAR SEGMENT ===
        // Tableau construit au démarrage du trajet depuis annotations.maxspeed de la réponse
        // Mapbox Directions. Chaque entrée = { distKm: number, speed: number|null }
        // où distKm est la distance cumulée depuis le départ le long de la géométrie.
        let _routeMaxspeedAnnotations = []; // [{distKm, speed}]

        function buildMaxspeedAnnotations(osrmData) {
            _routeMaxspeedAnnotations = [];
            try {
                const route = osrmData.routes[0];
                if (!route || !route.legs) return;
                const coords = route.geometry.coordinates;
                let cumDist = 0;
                let coordIdx = 0;   // index dans la géométrie globale (repli si annotation.distance absente)
                route.legs.forEach(leg => {
                    if (!leg.annotation || !leg.annotation.maxspeed) return;
                    const maxspeeds = leg.annotation.maxspeed; // tableau par segment de géométrie
                    const distances = leg.annotation.distance || [];
                    maxspeeds.forEach((ms, i) => {
                        // Longueur du segment i, en km.
                        // IMPORTANT : ne jamais retomber sur 0 silencieusement — un cumul figé à 0
                        // rendrait toute la table inutilisable (toutes les entrées au même point).
                        let d;
                        if (typeof distances[i] === 'number' && isFinite(distances[i])) {
                            d = distances[i] / 1000;
                        } else {
                            // Repli : mesurer directement sur la géométrie de l'itinéraire
                            const a = coords[coordIdx], b = coords[coordIdx + 1];
                            d = (a && b) ? turf.distance(turf.point(a), turf.point(b), { units: 'kilometers' }) : 0;
                        }
                        // ms = { speed: number, unit: 'km/h'|'mph'|'none' } ou { unknown: true }
                        let kmh = null;
                        if (ms && !ms.unknown && typeof ms.speed === 'number') {
                            kmh = ms.unit === 'mph' ? ms.speed * 1.60934 : ms.speed;
                        }
                        _routeMaxspeedAnnotations.push({ distKm: cumDist, speed: kmh });
                        cumDist += d;
                        coordIdx++;
                    });
                });
                // Garde-fou : si le cumul est resté nul (données Mapbox inattendues), la table
                // est inexploitable — mieux vaut la vider et laisser Overpass prendre le relais
                // que d'afficher la limite d'un segment arbitraire sur tout le trajet.
                if (_routeMaxspeedAnnotations.length > 1 &&
                    _routeMaxspeedAnnotations[_routeMaxspeedAnnotations.length - 1].distKm <= 0) {
                    console.warn('[MaxspeedAnnotations] Cumul de distance nul — table ignorée, repli Overpass');
                    _routeMaxspeedAnnotations = [];
                    return;
                }
                if (DEBUG) console.log(`[MaxspeedAnnotations] ${_routeMaxspeedAnnotations.length} segments sur ${cumDist.toFixed(2)} km`);
            } catch(e) {
                console.warn('[MaxspeedAnnotations] Erreur parsing:', e);
                _routeMaxspeedAnnotations = [];
            }
        }

        // Retourne la limite Mapbox la plus précise pour une distance cumulée donnée
        // Distance réelle parcourue le long de l'itinéraire, obtenue en projetant la position
        // GPS sur le tracé. Bien plus fiable que le cumul `driver.dist`, qui additionne le bruit
        // GPS et finit par dériver de plusieurs centaines de mètres sur un long trajet — décalage
        // suffisant pour lire la limite de vitesse du mauvais tronçon.
        let _lastRouteDistAlongKm = 0;
        function getRouteDistanceAlongKm(lng, lat) {
            if (!fullRouteLine) return null;
            try {
                const snapped = turf.nearestPointOnLine(fullRouteLine, turf.point([lng, lat]), { units: 'kilometers' });
                // Si on est très loin du tracé (hors itinéraire, recalcul en cours), la projection
                // n'a plus de sens : on ne veut pas lire une limite au hasard.
                if (snapped.properties.dist > 0.08) return null;
                _lastRouteDistAlongKm = snapped.properties.location;
                return _lastRouteDistAlongKm;
            } catch (e) { return null; }
        }

        // Distance max (km) à laquelle on accepte d'emprunter la limite d'un segment voisin.
        // Au-delà, on préfère répondre null et laisser Overpass trancher : reprendre la limite
        // d'un tronçon situé à 2 km de là est exactement ce qui produisait un "30" permanent.
        const MAXSPEED_NEIGHBOUR_TOLERANCE_KM = 0.25;

        function getMapboxSpeedLimitAtDist(distKm) {
            const arr = _routeMaxspeedAnnotations;
            if (!arr.length) return null;
            if (typeof distKm !== 'number' || !isFinite(distKm) || distKm < 0) return null;

            // Recherche binaire du dernier segment dont le début est <= distKm
            let lo = 0, hi = arr.length - 1, idx = 0;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1;
                if (arr[mid].distKm <= distKm) { idx = mid; lo = mid + 1; }
                else { hi = mid - 1; }
            }

            // Segment courant en priorité absolue
            if (arr[idx].speed !== null) return arr[idx].speed;

            // Sinon, voisin non-null le plus proche, mais uniquement s'il est géographiquement
            // pertinent (tronçon adjacent, pas à l'autre bout de l'itinéraire)
            for (let delta = 1; delta <= 4; delta++) {
                for (const dir of [delta, -delta]) {
                    const j = idx + dir;
                    if (j < 0 || j >= arr.length) continue;
                    if (arr[j].speed === null) continue;
                    if (Math.abs(arr[j].distKm - distKm) > MAXSPEED_NEIGHBOUR_TOLERANCE_KM) continue;
                    return arr[j].speed;
                }
            }
            return null;
        }

        function getManeuverSvg(step) {
            const type = step.maneuver.type;
            const modifier = step.maneuver.modifier;
            const exit = step.maneuver.exit;

            if (type === 'roundabout' || type === 'rotary') {
                const exitNum = exit || '';
                return `
                <svg viewBox="0 0 24 24">
                    <circle cx="12" cy="14" r="5" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-dasharray="24" stroke-dashoffset="6"/>
                    <path d="M 12 22 L 12 19" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
                    <path d="M 12 7 L 12 2 M 9 5 L 12 2 L 15 5" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
                    ${exitNum ? `<text x="12" y="17.5" font-size="8" font-weight="bold" fill="#ffffff" text-anchor="middle">${exitNum}</text>` : ''}
                </svg>`;
            }

            if (modifier === 'left') {
                return `<svg viewBox="0 0 24 24"><path d="M 17 21 L 17 12 C 17 8 15 6 11 6 L 5 6 M 9 2 L 3 6 L 9 10" fill="none" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
            }
            if (modifier === 'slight left') {
                return `<svg viewBox="0 0 24 24"><path d="M 16 21 L 16 13 C 16 9 13 6 8 4 M 10 1 L 4 4 L 8 9" fill="none" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
            }
            if (modifier === 'sharp left') {
                return `<svg viewBox="0 0 24 24"><path d="M 18 21 L 18 10 C 18 6 14 4 8 4 L 4 4 M 8 1 L 3 4 L 8 8" fill="none" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
            }

            if (modifier === 'right') {
                return `<svg viewBox="0 0 24 24"><path d="M 7 21 L 7 12 C 7 8 9 6 13 6 L 19 6 M 15 2 L 21 6 L 15 10" fill="none" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
            }
            if (modifier === 'slight right') {
                return `<svg viewBox="0 0 24 24"><path d="M 8 21 L 8 13 C 8 9 11 6 16 4 M 14 1 L 20 4 L 16 9" fill="none" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
            }
            if (modifier === 'sharp right') {
                return `<svg viewBox="0 0 24 24"><path d="M 6 21 L 6 10 C 6 6 10 4 16 4 L 20 4 M 16 1 L 21 4 L 16 8" fill="none" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
            }

            if (modifier === 'uturn') {
                return `<svg viewBox="0 0 24 24"><path d="M 16 21 L 16 10 C 16 5 13 3 9 3 C 5 3 4 5 4 10 L 4 15 M 1 12 L 4 16 L 7 12" fill="none" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
            }

            if (type === 'arrive') {
                return `<svg viewBox="0 0 24 24"><path d="M 12 2 C 8 2 5 5 5 9 C 5 14 12 22 12 22 C 12 22 19 14 19 9 C 19 5 16 2 12 2 Z" fill="#ffffff"/><circle cx="12" cy="9" r="3" fill="#28a745"/></svg>`;
            }

            return `<svg viewBox="0 0 24 24"><path d="M 12 22 L 12 4 M 6 9 L 12 2 L 18 9" fill="none" stroke="#ffffff" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
        }

        function updateNextTurnPanel(step, distToManeuverM) {
            const panel = DOM.nextTurnPanel || document.getElementById('next-turn-panel');
            const iconContainer = DOM.nextTurnIconContainer || document.getElementById('next-turn-icon-container');

            iconContainer.innerHTML = getManeuverSvg(step);

            const distLabel = distToManeuverM < 1000
                ? Math.max(0, Math.round(distToManeuverM)) + " m"
                : (distToManeuverM / 1000).toFixed(1) + " km";
            // Sous dead reckoning, afficher « 300 m » laisserait croire à une mesure au mètre
            // près alors que la valeur est extrapolée. Le « ≈ » reprend visuellement le
            // « environ » de l'annonce vocale.
            document.getElementById('next-turn-distance').innerText =
                (_positionIsEstimated ? '≈ ' : '') + distLabel;

            // Nom affiché : on privilégie les destinations des panneaux directionnels (ex: "Paris,
            // Lyon") quand elles sont disponibles — c'est ce que le conducteur voit sur les vrais
            // panneaux routiers. Sinon, on replie sur le nom de la rue, puis la référence de route.
            let displayName = step.name || 'Prochaine manœuvre';
            if (step.destinations) {
                // "destinations" contient les noms séparés par des virgules, on prend les 2 premiers
                const dests = step.destinations.split(',').map(d => d.trim()).slice(0, 2).join(', ');
                displayName = dests;
            } else if (step.ref && step.ref !== step.name) {
                displayName = (step.ref + ' ' + (step.name || '')).trim();
            }
            (DOM.nextTurnStreet || document.getElementById('next-turn-street')).innerText = displayName;
            panel.classList.add('visible');
            document.body.classList.add('nav-banner-active');

            const secondaryEl = DOM.nextTurnSecondary || document.getElementById('next-turn-secondary');
            const nextStep = routeSteps[currentStepIndex + 1];
            if (nextStep && nextStep.maneuver.type !== 'depart') {
                (DOM.nextTurnSecondaryIcon || document.getElementById('next-turn-secondary-icon')).innerHTML = getManeuverSvg(nextStep);
                let nextDisplayName = nextStep.name || 'Prochaine manœuvre';
                if (nextStep.destinations) {
                    nextDisplayName = nextStep.destinations.split(',').map(d => d.trim()).slice(0, 2).join(', ');
                } else if (nextStep.ref && nextStep.ref !== nextStep.name) {
                    nextDisplayName = (nextStep.ref + ' ' + (nextStep.name || '')).trim();
                }
                (DOM.nextTurnSecondaryStreet || document.getElementById('next-turn-secondary-street')).innerText = nextDisplayName;
                secondaryEl.classList.add('visible');
            } else {
                secondaryEl.classList.remove('visible');
            }
        }

        function hideNextTurnPanel() {
            (DOM.nextTurnPanel || document.getElementById('next-turn-panel')).classList.remove('visible');
            document.body.classList.remove('nav-banner-active');
        }

        // === BOUTON BOUSSOLE : bascule vue "cap en haut" / "nord en haut" ===
        function toggleHeadingUpMode() {
            headingUpMode = !headingUpMode;
            const btn = document.getElementById('nav-btn-compass');
            btn.classList.toggle('north-up', !headingUpMode);
            if (!headingUpMode) {
                currentVisualBearing = 0;
                map.easeTo({ bearing: 0, duration: 600 });
            }
        }

        // === BOUTON MUET : coupe/réactive le guidage vocal depuis la navigation ===
        function toggleMuteFromNav() {
            const checkbox = document.getElementById('voice-guidance-toggle');
            if (checkbox) { checkbox.checked = !checkbox.checked; onVoiceToggleChange(); }
            else { voiceGuidanceEnabled = !voiceGuidanceEnabled; if (!voiceGuidanceEnabled) stopAudio(); }
            const btn = document.getElementById('nav-btn-mute');
            btn.classList.toggle('muted', !voiceGuidanceEnabled);
            btn.innerText = voiceGuidanceEnabled ? '🔊' : '🔇';
        }

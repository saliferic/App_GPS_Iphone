# Estimation des péages — journal de calibration

Extrait d'`AGENTS.md` le 20/08/2026 pour alléger le fichier principal. Référencé
depuis la section « Grandes fonctionnalités / modules du JS » d'`AGENTS.md`.

Calcul dans `estimateTollFromRoute()` (`js/00-noyau-calculs.js`, testé) ;
`estimateTollCost()` (`js/16-zfe.js`) n'est qu'un emballage qui lit `avoidTolls`.

---

## ⚠⚠⚠ 04/09/2026 — LE PRIX EXACT VIENT DÉSORMAIS DE HERE. TOUT LE RESTE EST UN REPLI.

**L'estimation locale n'est plus la source du prix affiché quand le réseau répond.**
`affinerPeageHere()` (`js/16-zfe.js`) interroge HERE Routing v8 après l'affichage et
remplace le chiffre. Les quatre points d'appel sont inchangés : l'estimation locale
s'affiche toujours en premier, instantanément, et reste seule hors ligne.

### HERE est exact au centime — mesuré, pas supposé

Huit trajets dont le prix réel est connu, tracé Mapbox chiffré par HERE :

| Trajet | app (local) | HERE | Réel |
|---|---:|---:|---:|
| Paris → Lyon | 40,77 € | **41,30 €** | 41,30 € |
| Perpignan → Montpellier | 18,51 € | **17,40 €** | 17,40 € |
| Perpignan → Marseille | 30,09 € | **30,70 €** | 30,70 € |
| Perpignan → Bordeaux | 46,14 € | **45,40 €** | 45,40 € |
| Perpignan → Paris | 64,22 € | **67,70 €** | 67,70 € |
| Paris → Bruxelles | 15,80 € | **16,30 €** | 16,30 € |
| Paris → Le Havre | 16,47 € | **24,60 €** | 24,60 € |

Erreur moyenne : **app 18,5 %, HERE 0 %**. L'outil de mesure est
`tools/_calib-peages.js` (hors app, jamais empaqueté).

### Les deux points ouverts du 04/09/2026 sont RÉSOLUS, et aucun n'était une constante

**1. A64, « plusieurs entrées courtes » — c'était bien un SYSTÈME OUVERT.** L'hypothèse
posée le matin même est confirmée par le détail des barrières que renvoie HERE :

```
Toulouse → Bayonne     app 31,49 €   HERE 24,20 €   (+30 %)
  MURET                          → 1,80 €   ← gare ISOLÉE, tarif plat
  Lestelle-de-St-Martory → SAMES → 22,40 €  ← paire entrée/sortie, système fermé
```

Le modèle affine facture `MURET` 4,65 € d'entrée **plus** le kilométrage, pour une
barrière qui coûte 1,80 € quoi qu'il arrive.

**2. Paris → Le Havre, SAPN sous-estimé — ce n'était pas (que) le facteur.** HERE
ventile `SAPN : 21,70 €` **+ `CCI DU HAVRE : 2,90 €`** : un péage d'OUVRAGE (pont de
Normandie), invisible dans la réponse Mapbox. Même mécanisme sur Perpignan → Paris, où
apparaît `CEVM : 13,80 €` — le viaduc de Millau, sur une A75 par ailleurs gratuite. Et
le concessionnaire y était faux : l'app crédite `aprr:292.4`, HERE dit `COFIROUTE`.

⚠ **La leçon est la même qu'au 23/08** : recalibrer `TOLL_NETWORK_FACTOR.sapn` aurait
donné l'illusion d'un correctif en masquant une structure tarifaire absente du modèle.
Aucune constante ne fait apparaître une barrière à tarif plat ni un péage de pont.

### Un appel, pas deux — mesuré aussi

HERE offre deux voies : `POST /v8/import` puis `GET /v8/routes/{handle}` (2 appels,
1237 ms, chiffre le tracé Mapbox EXACT), ou `GET /v8/routes` direct (1 appel, 476 ms,
HERE recalcule sa propre route). **Sur les 8 trajets de référence, écart de 0,00 € entre
les deux.** L'app utilise donc le direct.

⚠ Le risque du direct est de chiffrer une route que l'utilisateur ne conduit pas —
l'erreur de méthode qui a fait échouer trois calibrations ici. Parade :
`PEAGE_HERE_ECART_MAX = 5 %` compare la distance HERE à celle de Mapbox et **jette** le
prix s'il diverge. Mieux vaut l'estimation calibrée de la bonne route qu'un prix exact
de la mauvaise. **Repli `import` non implémenté** : en cas de divergence on garde le
local. C'est le prochain incrément si le rejet se produit en usage réel.

### Coût archivé dans l'historique (04/09/2026)

**⚠ LE COÛT SE FIGE À L'ARRIVÉE, IL NE SE RECALCULE JAMAIS.** `stopCourse()` (`js/19`)
écrit `coutCarburant`, `coutPeage` et `peageStatut` dans l'entrée d'historique.
`coutTrajet()` (`js/13`) les LIT sans jamais les recalculer depuis `distKm` — ce serait
facile et faux : `calcEnergyCost()` lit le prix du carburant **du jour**, donc rejouer un
trajet de février au prix de septembre rendrait un chiffre inventé présenté comme mesuré.
C'est aussi ce qui rend l'historique juste quand on **change de véhicule en cours
d'année** : chaque trajet porte le prix du jour où il a été fait, sans qu'aucune
configuration datée ne soit nécessaire.

Le péage est retenu **au départ** (`_peagePrevu`, déclaré dans `js/00-helpers-partages.js`
car écrit par 16 et lu par 19) : à l'arrivée l'itinéraire planifié n'existe plus.
`peageStatut` vaut `reel` (HERE), `estime` (modèle local), `evites`, `devie` ou `inconnu`.

- **`devie`** — la distance parcourue s'écarte de plus de 10 % de la distance prévue.
  Le montant est archivé mais **exclu des cumuls** : un trajet interrompu n'a pas franchi
  les barrières prévues, et le compter fabriquerait une dépense qui n'a pas eu lieu.
- **`inconnu`** — trajet en mode libre. Sans itinéraire planifié, rien ne dit si une
  autoroute payante a été empruntée. Rapprocher le tracé d'anciens trajets planifiés est
  possible mais donnerait un « tu as *probablement* payé 12 € » invérifiable : on préfère
  un inconnu assumé.

**⚠ UN CUMUL NE S'AFFICHE JAMAIS SANS SON PÉRIMÈTRE.** `cumulCouts()` rend `chiffres` et
`sansDonnee` à côté du total, et `_buildMonthTiles()` les affiche. Sans cela, un cumul
portant sur 8 trajets sur 40 se lirait comme LE coût du mois — sous-estimé, mais
péremptoire. C'est mot pour mot la faute fondatrice de ce dossier : « Rien à l'écran ne
disait que ces deux lignes n'avaient pas le même statut ». Les trajets archivés **avant
le 04/09/2026 n'ont aucun coût et ne peuvent pas en recevoir** ; ce décalage est donc la
situation normale pendant les premiers mois.

### Ce qui reste à faire

- **⚠ NON TESTÉ SUR L'APPAREIL.** Chrome de bureau n'est pas la WebView : `fetch` vers
  une origine tierce depuis `file://android_asset` reste à vérifier, et un blocage CSP
  n'y laisse aucune exception JavaScript. `router.hereapi.com` est ajouté à la CSP
  d'`index.html`, mais seul l'essai sur téléphone le prouve.
- **La clé est en clair dans `js/16-zfe.js`.** Acceptable pour un usage personnel,
  **pas** pour une diffusion publique : une clé dans l'APK NE SE RÉVOQUE PAS sans casser
  les installations existantes, et le quota (30 000 transactions/mois) est partagé.
  `_peageHereEndpoint()` est le POINT DE BASCULE UNIQUE vers un proxy — Edge Function
  Supabase, 500 000 invocations/mois incluses, origine déjà dans la CSP. Ne rien
  disperser ailleurs.
- **Le cache est en mémoire, volontairement pas en `localStorage`** : les tarifs sont
  révisés chaque février, une valeur figée sur disque survivrait à la révision en
  silence.
- **Aucun test automatisé ne couvre ce chemin.** `_peageHerePoints()` est pure et
  testable, mais elle vit dans `js/16`, que `tests/noyau.test.js` ne charge pas.

---

## ⚠⚠ TOUT CE QUI SUIT LA LIGNE DE 2026-08-23 EST DE L'HISTOIRE, PAS LA MÉTHODE ACTUELLE

**Mapbox DÉCLARE les tronçons payants.** Chaque `intersection` d'un step porte un
tableau `classes` qui contient `"toll"` quand le tronçon qui la suit est à péage.
Vérifié le 23/08/2026 sur routes réelles : Paris → Lyon, 397 km déclarés payants sur
466 ; Paris → Montpellier, 395 sur 749 — l'A75 gratuite s'excluant **toute seule**.

L'affirmation « **Mapbox Directions ne renvoie ni prix de péage ni drapeau tronçon
payant** », posée le 20/08/2026 et répétée plus bas, **était fausse**. Elle n'a jamais
été vérifiée : elle a été déduite du fait que `exclude=toll` existe. Les **quatre bugs**
consignés dans ce journal sont tous des tentatives de reconstituer à la main une
information que l'API fournissait déjà — rectangles de pays, détection par vitesse,
continuité par euroroute, liste d'autoroutes gratuites. Le « point ouvert, diagnostiqué
mais non corrigé » (Perpignan → Paris, +18 %) s'est refermé sans être traité : il passe
à −5 % du seul fait de lire `classes`.

**La leçon est plus large que les péages : une limite d'API supposée doit être mesurée
comme le reste.** Celle-ci a orienté trois semaines de conception dans la mauvaise
direction, et aucun des correctifs successifs ne pouvait la remettre en cause puisqu'ils
la prenaient tous pour acquise.

### Méthode actuelle — `_sectionsPayantes()` puis modèle affine par SECTION

1. Les kilomètres payants viennent de `intersections[].classes`, mesurés via
   `annotation.distance` et `geometry_index`. Le `ref` du step ne répond plus qu'à une
   question : **quel concessionnaire encaisse**, jamais **si l'on paie**.
2. Le coût est `TOLL_ENTRY_FEE + TOLL_KM_RATE × km`, appliqué **une fois par section
   payante contiguë** — pas par réseau. Le péage français est un système fermé : sortir
   du réseau payant et y revenir fait payer deux entrées. Facturer par concessionnaire
   sous-estimait Perpignan → Paris de 17 %, l'A75 gratuite y coupant le trajet en deux
   systèmes fermés sur le même réseau.
3. `TOLL_SECTION_GAP_KM = 25` sépare « deux vrais systèmes fermés » d'un simple trou de
   tagage. **Mesuré, pas choisi** : l'erreur tombe de 6,7 % à 3,9 % entre 15 et 25 km puis
   reste plate jusqu'à 60 — un réglage posé sur un plateau ne dépend pas de sa valeur
   exacte. Sous 20 km, Paris → Le Havre se découpait en cinq entrées sur une seule A13.
4. `_refHorsFrance()` (le tiret : « AP-7 », « A-2 ») **redevient décisif** : l'autopista
   espagnole EST taguée `toll`, mais au tarif espagnol. `_horsReseauPeageFr()` garde son
   rôle pour ce que la géographie sépare, réduit à des tronçons de quelques centaines de
   mètres — ce qui rend enfin inoffensif le piège de `maneuver.location`.

**Constantes recalibrées le 23/08/2026 — elles ne portent plus sur les mêmes kilomètres.**
`TOLL_ENTRY_FEE = 4,65 €`, `TOLL_KM_RATE = 0,1035 €/km`. N'ayant plus à absorber les
sections gratuites facturées à tort, le taux monte et l'entrée baisse. Les anciennes
valeurs survivent sous `TOLL_LEGACY_*` pour le repli par `ref`, **et ne sont pas
interchangeables** : appliquer les nouvelles à l'ancien calcul le ferait surestimer d'un
tiers.

### Validation sur six prix réels — erreur moyenne 3,2 %

| Trajet | Distance | App | Réel (VM/Mappy) | Écart |
|---|---:|---:|---:|---:|
| Paris → Lyon | 466 km | 41 € | 41,30 € | **−1 %** |
| Perpignan → Montpellier | 159 km | 19 € | 17,40 € | +6 % |
| Perpignan → Marseille | 318 km | 30 € | 30,70 € | **−2 %** |
| Perpignan → Bordeaux | 450 km | 46 € | 45,40 € | **+2 %** |
| Perpignan → Paris | 850 km | 64 € | 67,70 € | **−5 %** *(était +18 %)* |
| Paris → Bruxelles | 312 km | 16 € | 16,30 € | **−3 %** |

Les six ont servi au calage des deux constantes, donc ce tableau **valide la méthode, pas
la précision** — il faut de nouveaux prix réels non utilisés ici pour un vrai contrôle
externe. Priorité aux réseaux non mesurés : Sanef, Cofiroute, Escota, dont les
`TOLL_NETWORK_FACTOR` restent déduits de barèmes publiés et non vérifiés.

### Ce qui reste ouvert

- **Le repli par `ref` n'est plus jamais exercé en production** — aucune réponse Mapbox
  observée n'est dépourvue de `classes`. Il reste parce qu'une réponse amputée
  afficherait sinon « Aucun péage » sur un Paris-Marseille, en silence. Ses trois bugs
  historiques y dorment ; ne pas s'en servir de référence.
- **La cible reste le calcul par gares de péage** (matrices entrée→sortie en open data,
  positions OSM), seul chemin vers le prix exact. Le présent travail ramène l'erreur de
  20-56 % à ~3 % et rend cette étape moins urgente, pas inutile.

---

## Journal historique (20/08/2026) — conservé pour la trace des bugs, méthode périmée


- **⚠ LES PÉAGES SONT UNE ESTIMATION, LE CARBURANT UNE MESURE — et les deux s'affichent côte à côte (20/08/2026).** Relevé sur Perpignan → Marseille : carburant **39,12 €** contre 38,67 € chez ViaMichelin (juste, il vient de data.economie.gouv.fr), péages **13,49 €** contre **30,70 €** réels — **−56 %**. Rien à l'écran ne disait que ces deux lignes n'avaient pas le même statut, d'où la conclusion naturelle de l'utilisateur : « l'app va chercher les prix dans une base ». Elle ne le fait pas et ne le fera pas — **Mapbox Directions ne renvoie ni prix de péage ni drapeau « tronçon payant »**, il sait seulement les éviter (`exclude=toll`), et il n'existe aucune API publique gratuite des barèmes français (PDF par concessionnaire ; les seules API qui chiffrent — Google Routes, HERE, TollGuru — supposent une clé et une facturation).
  **Les trois causes du −56 %, toutes dans le même sens, toutes corrigées :** (1) un rectangle `lat < 43.0` déclarait « Espagne » — **Perpignan est à 42,70**, les 50 premiers kilomètres payants de l'A9 étaient jetés, et le test portant sur `step.maneuver.location` (le point de **départ** du step), un step de 40 km commençant sous 43,0 disparaissait en entier ; (2) l'autoroute était détectée par la **vitesse moyenne du step** (> 80 km/h) alors que `fetchRouteMapbox()` interroge `driving-traffic` en priorité — **le prix des péages baissait quand il y avait des bouchons**, et toute 2×2 voies gratuite était facturée ; (3) le taux, 0,08 €/km contre ~0,12 €/km réel sur ASF (le commentaire au-dessus annonçait d'ailleurs 0,09, le code rendait 0,08).
  **Le calcul est maintenant dans `estimateTollFromRoute()` (js/00, testé)** ; `estimateTollCost()` (js/16) n'est plus qu'un emballage qui lit `avoidTolls` — un état de l'app, qui n'a rien à faire dans le noyau. Il lit **`step.ref`** (« A9 », « E15;A9 »), disponible parce que `fetchRouteMapbox()` demande `steps=true` : une donnée **déclarée**, insensible au trafic et au découpage des steps. Puis somme les km par concessionnaire et applique le modèle affine décrit plus bas.
  **⚠ LE TIRET EST LE DISCRIMINANT ESPAGNE/FRANCE, PAS LA LATITUDE.** Les autopistas s'écrivent « AP-7 », « A-2 », « C-32 » ; les autoroutes françaises n'ont jamais de tiret. C'est le seul critère qui fonctionne à Perpignan, où les deux réseaux se touchent — aucune ligne de latitude ne sépare Perpignan (42,70) de Figueres (42,27). `_horsReseauPeageFr()` ne garde des boîtes que pour ce que la géographie sépare vraiment (Italie, Allemagne, Suisse) et reste **grossier de façon assumée** : cette app calcule des ZFE, des Crit'Air et des prix de carburant français.
  **⚠⚠ LE MÊME BUG A FRAPPÉ DEUX FOIS, AUX DEUX BOUTS DU PAYS — `step.maneuver.location` EST LE POINT DE DÉPART DU STEP.** Mesuré sur Paris → Bruxelles le 20/08/2026 : 24,01 € estimés contre **16,30 € réels, chiffre sur lequel Mappy ET ViaMichelin s'accordent**. Journal : `(euroroute→sanef)=156.0km`, `horsFr=8.3km` sur 306 km de route, alors que la Belgique en fait ~100. La partie belge, taguée « E19 » seule, héritait de Sanef par la règle de continuité — et surtout, **un step belge de 80 km démarrant juste après Hensies (lat 50,45) passait sous le seuil `lat > 50.6` et emportait tout le trajet avec lui**. C'est exactement le mécanisme du `lat < 43.0` qui rendait l'A9 « espagnole » au départ de Perpignan : le symptôme espagnol avait été corrigé, la méthode non. Deux correctifs : (1) **la frontière franco-belge est une DROITE INCLINÉE**, de 51,09 à Bray-Dunes à 50,44 à Hensies puis 49,79 vers Sedan — une latitude unique posée assez haut pour garder Lille en France laisse tout le Hainaut belge du côté français, aucun rectangle ne peut suivre ça ; (2) **un step est écarté si l'une OU l'autre de ses extrémités est étrangère**, la fin d'un step étant le départ du suivant — d'où l'itération indexée qui a remplacé un `for…of` pour cette seule raison.
  **La marge de 0,05° et le choix d'exclure largement sont délibérés** : Belgique, Luxembourg, Allemagne et Pays-Bas ne font pas payer les voitures, et côté français dans cette bande les autoroutes sont largement gratuites (A22, A25 autour de Lille). Trop exclure n'y coûte presque rien, trop peu exclure facture un pays entier — **l'erreur n'est pas symétrique, autant la faire pencher du bon côté**. Le plancher à 49,5 protège la Lorraine (Thionville 49,36) sans relâcher le Luxembourg, qui commence à 49,6. Après correction : ~17,9 € contre 16,30 € réels, soit +10 %.
  **⚠ Ce défaut ne touchait QUE les trajets transfrontaliers** — les six trajets de validation étaient tous intérieurs, ce qui explique qu'il ait survécu à toute la campagne de calibration. Toute nouvelle règle géographique doit être testée sur un franchissement de frontière, pas seulement sur un trajet intérieur.
  **⚠ LE REPLI EST LA PIÈCE À NE PAS SUPPRIMER.** Si Mapbox renvoie une réponse **sans aucun `ref`**, la détection par `ref` afficherait « Aucun » sur un Paris-Marseille — un calcul faux, en silence, sans exception : exactement le mode de panne que le noyau testable existe pour attraper. On retombe alors sur l'heuristique de vitesse, débarrassée de ses rectangles de pays. Un seul `ref` exploitable dans la réponse suffit à la désactiver, sinon les mêmes kilomètres seraient comptés deux fois. Corollaire : un step qui **porte** un `ref` non autoroutier (« D900 ») n'est jamais compté — c'est une information, pas une lacune.
  **⚠⚠ LE PÉAGE N'EST PAS PROPORTIONNEL À LA DISTANCE — mesuré, pas supposé (20/08/2026).** Deux trajets réels dont le prix ViaMichelin est connu, et dont le kilométrage détecté a été relevé dans le journal `🔬 peages` **sur l'appareil** : Perpignan → Montpellier, 134,4 km → 17,40 € = **0,129 €/km** ; Perpignan → Marseille, ~313 km → 30,70 € = **0,098 €/km**. Le tarif kilométrique **décroît avec la distance** — c'est la structure du système fermé français : une composante quasi fixe pour entrer sur le réseau, puis une part proportionnelle. **Aucun taux unique ne peut satisfaire les deux** : calé sur le court il surestimait le long de 30 %, calé sur le long il sous-estimait le court de 25 %. D'où le modèle **affine** `TOLL_ENTRY_FEE (7,40 €) + TOLL_KM_RATE (0,0745 €/km) × km`, **appliqué une fois par réseau traversé** — un Lyon → Bordeaux passe d'APRR à ASF et paie bien deux entrées ; poser les frais hors de la boucle sous-estimerait tout trajet transversal.
  **Le trajet qui a permis de calibrer est celui qui n'a qu'un seul itinéraire possible.** Trois tentatives ont échoué avant, toutes faussées par la même erreur de méthode : comparer un prix ViaMichelin à un prix app **sur des routes différentes** (Mapbox contourne la barrière de Lançon par Fos/Martigues, ViaMichelin passe par Salon). Perpignan → Montpellier, c'est l'A9 d'un bout à l'autre : tous les calculateurs prennent le même chemin, donc tout écart mesuré est imputable au calcul et à rien d'autre. **Vérifier que les distances totales concordent AVANT de conclure à une erreur de calcul** — 155,3 km contre 155 km, là on peut comparer les péages. C'est aussi à ça que sert `kmParAutoroute` dans `diag` : `kmParReseau` seul confond A7, A9 et A54, toutes ASF, et ne dit donc pas quel itinéraire a été suivi.
  **⚠ `TOLL_ENTRY_FEE` et `TOLL_KM_RATE` sont des valeurs CALIBRÉES, pas des barèmes publiés.** Elles absorbent trois choses à la fois : le tarif réel du concessionnaire, les sections d'autoroute gratuites facturées à tort, et la sous-détection de kilomètres due aux steps d'échangeur sans `ref`. Les renommer « tarif ASF » serait faux. Elles se re-calibrent **en mesurant**, jamais en recopiant une grille. `TOLL_NETWORK_FACTOR` est sans dimension, ASF = 1 par construction (seul réseau mesuré) ; les autres sont déduits du rapport des barèmes publiés et **ne sont pas vérifiés** — un trajet mesuré sur APRR ou Sanef doit corriger la valeur correspondante, et elle seule.
  **⚠ CE QUE REMPLACE CE MODÈLE, ET LA LEÇON.** `TOLL_NETWORK_RATE` × `TOLL_BILLABLE_SHARE = 0.85` ont été supprimés. Cette « part facturable » avait été inventée **sans aucune mesure**, pour corriger une surestimation *supposée* — la première mesure réelle a montré qu'on **sous-estimait** de 21 %. Une correction non mesurée poussait donc dans le mauvais sens, et son existence même donnait l'illusion que le sujet était traité.
  **`TOLL_MIN_KM = 15` compte désormais double** : `TOLL_ENTRY_FEE` s'applique dès le premier kilomètre facturé, donc sans ce plancher un trajet de banlieue sur autoroute urbaine n'afficherait plus deux ou trois euros imaginaires, mais sept. `TOLL_FREE_MOTORWAYS` ne contient que les autoroutes gratuites **sur l'essentiel de leur tracé** : sans elle l'A75 coûtait 27 €. Les cas **partiels** (A31, A16, A4 en Île-de-France) en sont volontairement absents — les y mettre les rendrait gratuites partout, ce qui est plus faux que de les facturer.
  **Les tests de calibration ne sont pas des exemples** : `tests/noyau.test.js` rejoue les deux trajets mesurés avec **les kilométrages réellement détectés par l'app**, plus un **troisième point de contrôle indépendant** (Perpignan → Marseille par Fos, 226,3 km → ~25,50 € réels, modèle à 24,3 €) qui n'a pas servi à calculer les constantes — c'est lui qui distingue une calibration d'un simple ajustement de deux inconnues sur deux équations. Un test vérifie en outre que **le €/km décroît** quand la distance augmente : sans lui, un taux constant recalé entre les deux mesures repasserait au vert.
  **`formatTollEstimate()` arrondit à l'euro, et c'est délibéré** : « ~28,43 € » promet une précision au centime que rien ne soutient, juste sous un coût carburant qui, lui, est juste à 0,50 € près. L'arrondi est le seul signal dont on dispose pour distinguer les deux. Quatre points d'affichage l'utilisent (js/04, js/16, js/18 ×2) — la logique « Évités » / « Aucun » reste chez l'appelant.
  **⚠⚠ UN QUATRIÈME BUG, TROUVÉ APRÈS COUP EN PRODUCTION — les trois causes ci-dessus n'expliquaient pas tout.** Une fois le correctif déployé, l'utilisateur a rejoué le même trajet réel : **24 € affichés contre 30,70 € réels**, alors que la version testée en local annonçait ~32 €. Plutôt que deviner un cinquième correctif à l'aveugle, un paramètre `diag` a été ajouté à `estimateTollFromRoute()` — **rempli par référence**, jamais par `console` (interdite dans ce fichier) — que `estimateTollCost()` (js/16) logge en une seule ligne à plat (un objet loggé se replie dans la console et disparaît au copier-coller). Le journal réel a montré `routeTotale=319.0km` mais seulement `asf=217.6km` reconnus, et surtout `refsNonReconnus: "E 80"=71.8km` : un unique step de 71,8 km ne portait QUE l'euroroute `"E 80"`, sans le numéro français que ses voisins affichaient (`"E15;A9"`). `_refAutorouteFr()` ignore à raison une euroroute seule, mais ces kilomètres n'étaient alors NULLE PART — ni facturés, ni exclus, ni dans le repli.
  **Correctif : la continuité par euroroute (`_estEuroroutePure()`, js/00).** Une euroroute ne se signale jamais sur un tronçon de voirie ordinaire — elle chevauche toujours une autoroute nationale sans rupture physique. `estimateTollFromRoute()` retient donc `dernierReseauFr`, le réseau du DERNIER step classé par numéro français ; un step dont le `ref` ne contient QUE des euroroutes (« E80 », « E15;E90 ») hérite de ce réseau au lieu d'être ignoré. **La continuité ne traverse jamais une départementale ou une route non classée** : `dernierReseauFr` est remis à `null` dès qu'un step porte un `ref` d'un autre type — sans quoi une euroroute croisée en ville après une sortie d'autoroute se retrouverait facturée au tarif autoroutier. Elle est aussi `null` en tête de trajet (rien à hériter) et après un tronçon `TOLL_FREE_MOTORWAYS` (la gratuité doit se propager, pas s'arrêter net). Trois cas verrouillés dans `tests/noyau.test.js` : l'héritage lui-même, la coupure par départementale, et l'absence de réseau à hériter en tête de trajet.
  **Le mécanisme `diag` reste dans le code, le journal est débranché.** `estimateTollFromRoute()` garde son second argument optionnel (`kmParAutoroute`, `eurorouteDetail`, `refsNonReconnus`, `kmSansRef`, `kmHorsFr`…) ; l'appel `logDiag('peages', …)` de `estimateTollCost()` (js/16) a été retiré le 20/08/2026, la recherche close. **Le bloc de commentaire qui le remplace contient le code à recopier pour le réarmer** — quatre bugs ont été trouvés avec ce journal, aucun ne l'aurait été sans.
  **⚠ VALIDATION SUR SIX TRAJETS RÉELS (20/08/2026)** — péages ViaMichelin contre estimation de l'app, distances vérifiées comme concordantes :

  | Trajet | Distance app / VM | Réel | App | Écart |
  |---|---|---:|---:|---:|
  | Perpignan → Montpellier | 155,3 / 155 | 17,40 € | 17 € | ~0 % *(calibration)* |
  | Perpignan → Marseille | 315 / 317 | 30,70 € | 31 € | ~0 % *(calibration)* |
  | Perpignan → Bordeaux | 450,1 / 448 | 45,40 € | 44 € | **−3 %** |
  | Paris → Lyon | 466,8 / 463 | 41,30 € | 39 € | **−6 %** |
  | Perpignan → Toulouse | 215,7 / **206** | 21,90 € | 19 € | −13 % *(routes différentes)* |
  | Perpignan → Paris | 847,4 / 846 | 67,70 € | 80 € | **+18 %** *(voir ci-dessous)* |

  Bordeaux et Paris → Lyon n'ont **pas** servi à la calibration : ils la valident de l'extérieur, et Paris → Lyon valide en prime le facteur APRR qui n'était que déduit. Toulouse n'est pas comparable — 10 km d'écart et une déviation pour route fermée signalée par ViaMichelin, donc deux routes différentes.
  **⚠ POINT OUVERT, DIAGNOSTIQUÉ MAIS NON CORRIGÉ : Perpignan → Paris, +18 %.** Relevé exact : `(euroroute→asf)=430.0km, A71=304.9km, A9=80.8km`, et **aucun `A75(gratuite)`**. Mapbox ne tague jamais l'A75 « A75 » sur ce trajet, seulement son euroroute « E11 » : la règle de continuité lui fait donc hériter d'ASF depuis l'A9 et facture 430 km de gratuité. **Le correctif évident est PIRE que le bug** : supprimer ces 430 km donne 48,11 € contre 67,70 € réels, soit −29 %, parce qu'une partie de ce bloc est réellement payante (viaduc de Millau sur l'A75 gratuite, plus ~90 km qui ne sont pas de l'A75). `(euroroute→asf)` est un agrégat qui mélange les deux et ne permet pas de les séparer. La piste restante est `step.name` — `eurorouteDetail` dans `diag` le relève déjà, il suffit de réarmer le journal sur ce trajet pour voir si Mapbox y nomme la voie. **Ne pas « corriger » ce cas sans cette mesure** : c'est exactement le geste qui a échoué trois fois de suite ici.

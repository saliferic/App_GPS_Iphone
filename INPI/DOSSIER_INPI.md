# Dossier de dépôt — Application « Simulateur GPS Récompenses »

**Nature du dépôt visé :** enveloppe e-Soleau INPI (preuve d'antériorité et de possession)
**Date de constitution du dossier :** 14 août 2026
**Déposant :** *(à compléter — nom, prénom, adresse, qualité : personne physique / société)*
**Contact :** saliferic@gmail.com

---

## PARTIE 0 — Ce que vous déposez, et ce que ça protège

Cette partie est un cadrage indispensable : elle évite de payer pour une protection qui ne couvre pas ce que vous croyez.

### 0.1 — Le régime applicable à un logiciel en France

| Objet | Protection | Où | Coût indicatif | Effet |
|---|---|---|---|---|
| **Le code source** (index.html, etc.) | Droit d'auteur — **automatique dès la création**, sans formalité (art. L112-2 13° CPI) | Rien à déposer pour *exister* | 0 € | Vous êtes déjà titulaire. Le problème n'est pas le droit, c'est la **preuve de la date**. |
| **La preuve de date & de contenu** | **Enveloppe e-Soleau INPI** | inpi.fr → e-Soleau | **15 € / 10 Mo**, conservation 5 ans (renouvelable 5 ans) | Ne crée aucun droit. Donne une **date certaine opposable** sur un contenu scellé. C'est exactement ce que vous cherchez. |
| **Le code source, dépôt de référence** | **Dépôt APP** (Agence pour la Protection des Programmes) | app.asso.fr | ~ 60–250 €/an selon formule | Alternative/complément à e-Soleau, spécialisée logiciel, avec référencement IDDN. Plus reconnue en contentieux logiciel. |
| **Le nom / le logo** de l'application | **Marque française** | INPI | **190 €** (1 classe) + 40 €/classe suppl. | Le seul vrai *monopole* accessible ici. Classes utiles : **9** (logiciels), **39** (navigation, transport), **42** (SaaS), **41** (divertissement/jeu). |
| **Les mécaniques de jeu / l'idée** | ❌ **Non protégeables en tant que telles** | — | — | Une idée, une règle de jeu, un concept ne sont pas appropriables. Seule leur *expression* (le code, les écrans) l'est. |
| **Une solution technique** (ex. procédé de fusion multi-sources, procédé anti-oscillation de couche) | **Brevet** — possible mais **étroit** | INPI | ~ 26 € dépôt + ~ 520 € rapport de recherche + conseil | Art. L611-10 CPI exclut « les programmes d'ordinateur **en tant que tels** ». Un brevet n'est envisageable que si vous revendiquez un **effet technique** (voir §5.4). À discuter avec un CPI. |

### 0.2 — Recommandation

**Faites l'enveloppe e-Soleau maintenant** (15 €, immédiat, en ligne) sur le périmètre décrit en Partie 6. C'est la démarche adaptée à votre demande : horodater et sceller l'état de l'art de votre création à ce jour.

**Puis, si le projet se commercialise**, dans cet ordre :
1. **Marque** sur le nom retenu (le seul monopole réel, et le plus facilement contourné si vous tardez) ;
2. **Dépôt APP** du code source à chaque version majeure ;
3. Étude brevet **uniquement** sur les 2–3 procédés listés en §5.4, avec un conseil en propriété industrielle.

> ⚠️ **Contrainte de taille e-Soleau : 10 Mo par enveloppe.** Votre périmètre complet pèse ~ 4,9 Mo (voir §6.2) : **ça passe en une seule enveloppe**. Format accepté : PDF, ou fichiers dans une archive. Voir §6.4 pour la procédure exacte.

---

## PARTIE 1 — Fiche d'identité de la création

| Champ | Valeur |
|---|---|
| **Titre de l'œuvre** | Simulateur GPS Récompenses (nom de code : `simulateur_vitesse`) |
| **Nature** | Logiciel — application web mobile-first de navigation GPS routière à mécanique de récompense comportementale |
| **Date de première fixation constatée** | 12 août 2026 (plus ancienne sauvegarde horodatée du dépôt : `index_2026-08-12_15-33-13.html`) |
| **Date de la version déposée** | 14 août 2026, 17:53:25 |
| **Langage / technologies** | HTML5, CSS3, JavaScript ECMAScript (vanilla, procédural — **aucun framework, aucun build tool**) |
| **Volume de la version déposée** | **16 657 lignes**, 1 046 525 octets dans un fichier source unique |
| **Complexité** | **459 fonctions de premier niveau** (523 au total), 168 constantes de réglage nommées, 388 éléments DOM identifiés, ~3 300 blocs de règles CSS |
| **Ressources associées** | 152 fichiers audio `.ogg` (guidage vocal), 4 illustrations PNG, 1 vidéo MP4 |
| **Auteur / titulaire** | *(à compléter)* |
| **Œuvre de commande / collaboration** | *(à compléter — si un tiers a contribué, ses droits doivent être cédés par écrit avant tout dépôt)* |

### 1.1 — Résumé en une phrase

Application de navigation routière temps réel qui **transforme la qualité de conduite en économie de jeu** : la vitesse, la souplesse du geste et la régularité de l'usager alimentent un score, des points de profil, des coffres à butin aléatoires, des badges à catégories progressives et des objectifs hebdomadaires **calibrés sur l'historique personnel du conducteur**, le tout adossé à un moteur de navigation complet (itinéraire, guidage vocal, trafic, ZFE, stations-service, bornes de recharge).

### 1.2 — Résumé étendu (à reprendre tel quel dans le formulaire de dépôt)

> Le logiciel est une application web autonome de navigation GPS destinée au conducteur automobile, exécutée intégralement côté client, sans serveur applicatif propre ni compte utilisateur, l'ensemble des données personnelles restant sur le terminal.
>
> Il combine deux ensembles fonctionnels habituellement disjoints. D'une part un moteur de navigation complet : calcul d'itinéraire et alternatives, guidage vocal par banque de fragments audio recomposés, suivi de position lissé, estimation de position par navigation à l'estime en cas de perte de signal, affichage cartographique 2D/3D avec couche de trafic injectable, relevé des limitations de vitesse réelles issues de données ouvertes, détection des zones à faibles émissions et évaluation de l'infraction encourue, recherche de stations-service et de bornes de recharge par fusion de sources multiples avec mesure du détour réel.
>
> D'autre part un système de récompense comportementale : un score de trajet fondé sur le respect des limitations et sur la douceur de conduite mesurée à l'accéléromètre, converti en points de profil, en tirages de coffres à raretés, en badges organisés en catégories progressives, et en objectifs hebdomadaires générés dynamiquement à partir d'une référence kilométrique personnelle observée sur quatre semaines glissantes.
>
> L'originalité revendiquée porte sur l'articulation de ces deux ensembles — la récompense n'est pas un habillage ajouté à la navigation, elle est alimentée par ses mesures — ainsi que sur plusieurs solutions d'interface et de traitement décrites en Partie 5.

---

## PARTIE 2 — Architecture technique

### 2.1 — Parti pris structurel

Le logiciel est **un fichier HTML unique auto-portant**. Aucun module ES, aucune classe, aucun *bundler*, aucune dépendance npm. Le DOM complet — tous les modals, panneaux, bannières et boutons — est présent en dur dans le document et rendu visible ou non par bascule de classes CSS. Aucun templating.

Ce choix n'est pas une facilité : il rend l'application **déployable par simple copie de fichier**, exécutable hors chaîne de compilation, archivable dans son intégralité, et diffusable sur un hébergement statique sans infrastructure. C'est une caractéristique de conception revendiquée, et elle facilite le présent dépôt : **le programme entier tient dans un fichier scellable**.

### 2.2 — Composants du dépôt

| Fichier / dossier | Rôle |
|---|---|
| `index.html` | **L'intégralité du programme** — structure DOM, feuille de style, moteur applicatif |
| `simulator.html` | Outil de développement : encapsule `index.html` dans un châssis de téléphone en CSS pur (Pixel 9A, 412×923 px, encoche, barres système simulées), avec contrôles d'échelle, rotation et rechargement. Permissions déléguées : géolocalisation, accéléromètre, gyroscope, microphone. Aucune logique métier propre. |
| `Voice/` (152 × `.ogg`) | Banque de fragments vocaux pré-enregistrés : nombres de 1 à 9000, ordinaux, directions (`left`, `right_sl`, `right_sh`), `roundabout`, `and_arrive_destination`, `border_control`, `back_on_route`, `speed_camera`, `toll_booth`, `railroad_crossing`, `pedestrian_crosswalk`, `traffic_calming`, `location_lost`, `location_recovered`… |
| `Images/` | 4 illustrations de raretés de coffre — **voir l'alerte §7.3** |
| `Video/Bronze.mp4` | Séquence de déblocage de catégorie de badge |
| `AGENTS.md` (62 809 o) | **Documentation technique exhaustive** rédigée en parallèle du code : décisions d'architecture, pièges vérifiés en production, justification de chaque règle non évidente. Pièce majeure du dossier : elle **atteste du travail de conception** et non de la seule écriture de code. |
| `backup/` (84 versions horodatées) | **Chaîne de versions du 12 au 14 août 2026**, chacune nommée à la seconde près, plusieurs portant l'intitulé de la correction apportée. Preuve documentaire de la **progression itérative de la création**. |

### 2.3 — Responsive fluide

Le système d'échelle est déclaré en tête de feuille de style : paliers de `font-size` racine (320 / 480 / 768 / 1024 px + paysage court), puis `clamp(min, préféré-en-vw, max)` sur **toutes** les tailles de texte, marges, espacements et boutons, et `min(90vw, N px)` sur les largeurs de modals. Objectif de conception : **proportions identiques de 320 px à 2560 px**, sans point de rupture visible.

### 2.4 — Boucle temps réel et discipline de rendu

Le cœur d'exécution est une boucle `requestAnimationFrame` à 60 images/seconde (`animate()`) qui met à jour position, vitesse, cap, panneaux de guidage et jauges.

Pour tenir cette cadence sans saturer le fil principal, le logiciel implémente un **cache d'accès DOM et des écritures conditionnelles** : les primitives `getEl`, `setText`, `setClass`, `setStyleProp` mémorisent la valeur précédemment écrite et **ne touchent le document que si la valeur a réellement changé**. Une frame où rien ne bouge ne produit aucune écriture DOM, donc aucun recalcul de mise en page.

### 2.5 — Journal d'erreurs persistant embarqué

Le logiciel intègre son propre système de diagnostic post-mortem, sans serveur :

- `logAppError(contexte, erreur)` empile les **20 dernières erreurs** dans le stockage local, chacune avec horodatage, contexte d'appel nommé et **les 6 premières lignes de la pile d'appels** ;
- deux écouteurs globaux (`window.onerror`, `unhandledrejection`) l'alimentent automatiquement ;
- l'émission en console est **conditionnée au drapeau `?debug=1`** dans l'URL, car certains journaux appelaient des méthodes cartographiques 60 fois par seconde en usage normal.

Un incident survenu chez un utilisateur est donc reconstituable **a posteriori sur son terminal**, sans télémétrie et sans transmission de données.

### 2.6 — Résilience réseau

Enveloppe `fetchResilient` (relances contrôlées), bascule automatique en mode hors-ligne sur détection de perte de connectivité, cache d'itinéraire en stockage local permettant la reprise d'un trajet interrompu, et cache à durée de vie explicite par famille de données (session 15 min pour les stations, 7 jours pour les zones à faibles émissions, 90 jours pour les stations favorites).

---

## PARTIE 3 — Description exhaustive des fonctionnalités

### 3.1 — Acquisition et traitement de la position

| Mécanique | Description technique |
|---|---|
| **Lissage GPS adaptatif** | Filtre exponentiel dont le coefficient **change selon l'état de mouvement** : `α = 0,15` à l'arrêt (lissage fort, supprime la dérive du point immobile), `α = 0,55` en mouvement (réactivité). Gel du point sous **3 mètres** de déplacement. Rejet des positions dont la précision annoncée dépasse **50 mètres**. |
| **Détection de perte de signal** | Une précision dégradée au-delà de **45 mètres** maintenue **3 secondes** est interprétée comme un fix réseau et non satellite — donc comme une perte, même si le terminal continue d'émettre des positions. |
| **Navigation à l'estime (*dead reckoning*)** | En tunnel ou sous ouvrage, la position est **projetée sur la polyligne de l'itinéraire** à la dernière vitesse connue, par pas de 0,5 seconde, à condition que le véhicule roulait à plus de **12 km/h** avant la perte (sinon il est simplement stationné). Deux voies de déclenchement distinctes : dégradation de précision, ou absence totale de fix depuis 3 secondes. Retour au GPS réel annoncé vocalement (`location_recovered`). |
| **Cap et orientation** | Bascule cap-en-haut / nord-en-haut, boussole dédiée. |

### 3.2 — Itinéraire

- Calcul via API Directions en profil `driving-traffic` ;
- **Itinéraires alternatifs** affichés simultanément, trois couleurs distinctes avec variantes atténuées pour les tracés non sélectionnés, sélection par barre inférieure ou cycle ;
- **Multi-arrêts** avec gestion d'étapes ordonnées et marqueurs propres, seuil d'étape atteinte à 80 mètres ;
- Option d'évitement des péages, avec estimation du coût péage sur le tracé retenu ;
- Aperçu de trajet chiffré avant départ : durée, distance, **coût énergétique calculé sur la configuration véhicule réelle**, péages, alerte zone à faibles émissions ;
- **Trajet libre** : navigation sans destination, avec accumulation de score, et question de fin explicite avant de basculer sur une destination.

### 3.3 — Guidage vocal par recomposition de fragments

Aucune synthèse vocale à l'exécution. `getManeuverAudioFiles()` **compose une liste ordonnée de fichiers audio** rejoués en séquence par `playAudioSequence()` — par exemple « in » + « 300 » + « meters » + « left ». Les paliers de distance d'annonce sont tabulés (500 / 300 / 150 / 100 m) et les ordinaux de sortie de rond-point mappés séparément.

Bénéfice de conception : **restitution identique sur tous les terminaux**, indépendante de la voix système, et fonctionnelle hors connexion.

### 3.4 — Limitations de vitesse réelles et système de grâce

**Sonde de corridor.** Plutôt que d'interroger la donnée ouverte à chaque position, le logiciel sonde un **corridor de 600 mètres devant le véhicule**, et ne re-sonde qu'après **300 mètres parcourus** *et* jamais plus souvent que **toutes les 20 secondes**, avec une marge de fin de 150 mètres pour ne jamais atteindre le bout de la sonde. Sortie du corridor détectée à 40 mètres latéraux. À l'arrêt (< 5 km/h) la sonde en place reste valable.

**Fusion et traçabilité de source.** La limite retenue croise les annotations de l'API de routage et les données ouvertes cartographiques. Chaque valeur porte **l'identification de sa source**, et un jeu de sources est explicitement marqué comme incertain (`overpass-inference`, `steps`, `fallback`) : le logiciel sait distinguer une limite relevée d'une limite déduite, et adapte son comportement.

**Système de marge et de grâce — mécanique originale (§5.1).** Le seuil de sanction est fixé à **+5 %** de la limite (alignement sur la tolérance des dispositifs de contrôle). Surtout, lors d'une **baisse** de limitation, une période de grâce s'ouvre, de durée **proportionnelle à l'écart** :

```
durée = min(4 + écart × 0,25 ; 12) secondes
```

Passer de 90 à 50 ouvre 14 secondes théoriques, plafonnées à 12 ; passer de 50 à 30 en ouvre 9. Pendant cette fenêtre le conducteur n'est pas pénalisé. **Raison d'être :** une entrée d'agglomération ne peut pas être décélérée instantanément, et sanctionner ce moment détruit la crédibilité du score — donc l'adhésion au dispositif.

### 3.5 — Éco-conduite par accéléromètre

Écoute de `devicemotion`, avec **double filtrage passe-haut** : constante de temps 5,0 s pour l'extraction de la composante gravitaire, 0,12 s pour le lissage du signal linéaire.

Seuils : **3,5 m/s²** en freinage, **3,0 m/s²** en accélération.

Trois garde-fous cumulatifs contre les faux positifs — c'est le point technique le plus délicat :

1. **Durée minimale de 350 ms** — un choc ponctuel est un nid-de-poule, pas un freinage ;
2. **Confirmation croisée par le GPS** : au moins **4 km/h** de variation de vitesse mesurée doivent accompagner l'événement inertiel ;
3. **Délai de refroidissement de 1 200 ms** entre deux événements retenus.

Pénalité : **0,8 point** sur le score d'éco-conduite (base 100) et **0,3 point** sur le score principal, par événement confirmé.

### 3.6 — Économie de jeu

**Score de trajet.** Gain proportionnel à la distance parcourue (`POINTS_PER_METER = 0,001`), pénalité sur la distance parcourue en dépassement (`PENALTY_PER_METER = 0,005`, soit **cinq fois le gain**), corrigée des pénalités d'éco-conduite.

**Verrou d'attribution.** `addPointsToActiveProfile()` est le **point de convergence unique** de tous les chemins d'attribution de points, et le seul endroit où passe `clampTripScore()`. Conséquence architecturale voulue : **aucun total de profil ne peut décroître**, quelle que soit la voie empruntée. Un score de trajet négatif ou non fini est ramené à zéro, jamais soustrait de l'acquis.

**Coffres à butin.** Ouverts en fin de trajet sans faute (aucun dépassement et plus de 100 mètres parcourus). Tirage uniforme sur 100, quatre raretés :

| Rareté | Probabilité | Effet | Illustration |
|---|---|---|---|
| Atypique | 50 % | **+10 %** de points | `Jamu.png` |
| Rare | 35 % | **+20 %** de points | `pegase_noir.png` |
| Épique | 10 % | **+50 %** de points | `Pegase.png` |
| Légendaire | 5 % | **× 2** sur le total | `Aiolia_Gold.png` |

Chaque rareté porte sa palette (bordure, dégradé), son pictogramme, son type d'effet (`percentage` ou `multiplier`) et son illustration. Animation de secousse du coffre avant révélation.

**Badges à catégories progressives.** Attribution hebdomadaire, avec **8 catégories** franchies par paliers de 3 badges :

| Catégorie | Palier | | Catégorie | Palier |
|---|---|---|---|---|
| 🥉 Bronze | 0 – 2 | | 💎 Diamant | 12 – 14 |
| 🥈 Argent | 3 – 5 | | 🔥 Élite | 15 – 17 |
| 🥇 Or | 6 – 8 | | 🏆 Champion | 18 – 20 |
| 🔷 Platine | 9 – 11 | | 👼 Ange | 21 – 23 |

Le franchissement de catégorie déclenche la lecture d'une **vidéo de déblocage** dédiée. Galerie de trophées consultable. Badges **isolés par profil** (clé suffixée de l'identifiant de profil).

**Objectifs hebdomadaires adaptatifs — mécanique originale (§5.2).** Sept gabarits d'objectifs, chacun avec un intervalle de valeurs et un pas :

| Gabarit | Intervalle | Pas |
|---|---|---|
| Parcourir *v* km sans excès de vitesse | 50 – 200 km | 25 |
| Effectuer *v* trajets de plus de 10 km sans excès | 3 – 8 | 1 |
| Effectuer *v* trajets (avec ou sans excès) | 5 – 15 | 1 |
| Parcourir *v* km au total | 80 – 300 km | 20 |
| Terminer *v* trajets « sans faute » | 2 – 6 | 1 |
| Accumuler *v* points sur la semaine | 20 – 80 pts | 5 |
| Effectuer *v* trajets en ville (< 5 km) sans excès | 3 – 10 | 1 |

Ces gabarits ne sont **pas tirés tels quels** : ils sont recalibrés sur une **référence kilométrique personnelle**.

**Bonus de pause.** Suggestion de pause après **1 h 50 de conduite** (110 min), pause valorisée à **15 minutes**, **50 points** de bonus si elle est réellement observée — vérifiée par détection d'aire de repos réelle dans un rayon de **250 mètres**, et non déclarative. Mode d'essai accéléré (20 s) en simulation.

### 3.7 — Profils multiples et données

CRUD complet de profils (création, sélection, suppression), avec **isolation stricte** des points, badges, historique et statistiques. Persistance intégrale en stockage local du navigateur : **25 clés fonctionnelles** recensées (`gps_profiles`, `gps_active_profile_id`, `gps_trip_history`, `gps_km_history`, `gps_weekly_goals`, `gps_favorites`, `gps_vehicle_*`, `gps_critair`, `gps_map_theme`, `gps_hotbox`, …).

**Export / import de profil** en JSON : `_buildProfileSnapshot()` sérialise un instantané de l'ensemble des clés déclarées dans `PROFILE_EXPORT_KEYS`, permettant la migration vers un autre terminal. Repli par zone de texte copiable lorsque le téléchargement de blob est impossible (conteneur applicatif Android).

**Statistiques de conduite** : modal dédié, graphiques **construits sans bibliothèque** (`renderLineChart`, `renderBarChart` en SVG/DOM), périodes 7 jours / 30 jours / intégralité.

### 3.8 — Zones à faibles émissions (ZFE) et Crit'Air

Chargement des zones officielles depuis les données publiques, avec **repli géométrique codé en dur** si le chargement échoue, et cache de 7 jours. Le logiciel connaît par ailleurs les sources métropolitaines directes (Grand Paris, Grand Lyon, Grenoble, Marseille, Strasbourg, Toulouse, Rouen, Montpellier, Nice, Reims, Saint-Étienne, Clermont).

`zfeEvaluateZone()` croise **quatre paramètres** : la vignette Crit'Air déclarée (rang ordonné `EL < 1 < 2 < 3 < 4 < 5 < NC`), la catégorie du véhicule, la géométrie de la zone, et **les horaires d'application** — une zone traversée hors plage horaire n'est pas une infraction.

**Point juridique fin, implémenté correctement :** le montant de l'amende dépend de la **catégorie du véhicule**, jamais de la vignette. Poids lourds, autobus et autocars relèvent de la **4ᵉ classe** (135 € — 90 € minorée / 375 € majorée), tout le reste de la **3ᵉ classe** (68 € — 45 € / 180 €), conformément à l'article R411-19-1. La vignette décide **s'il y a** infraction ; la catégorie décide **combien**. Les barèmes sont regroupés en un point unique pour absorber les évolutions réglementaires.

L'encart d'amende n'est affiché **que si une zone est réellement bloquante au moment du passage** — une fausse alerte sur un trajet autorisé ruinerait la confiance dans l'ensemble des alertes.

### 3.9 — Stations-service et bornes de recharge

C'est le sous-système le plus dense du logiciel.

**Fusion multi-sources.** Flux national français temps réel (prix instantanés, pagination 100 par page, plafond 600 stations par point sondé), données ouvertes cartographiques par requêtes POST, API de recherche de POI, sources belges et espagnoles, et pour l'électrique : référentiel IRVE national + base collaborative internationale. La détection du ou des pays traversés (`detectCountriesOnRoute`) sélectionne les sources applicables.

**Scan en deux phases.** Phase 1 : préchargement automatique dès le calcul du tracé, rayon 80 km, **pour les trois types de véhicule** (thermique, électrique, hybride). Phase 2 : scan glissant pendant la navigation, fenêtre de 80 km devant le véhicule, zone morte de 20 km sans re-scan.

**Segmentation du corridor.** Découpage du tracé en segments de 100 km, cercles de rayon 3 ou 5 km selon la distance totale, pas de 1,4 × rayon donnant **~55 % de recouvrement** entre cercles consécutifs — calibrage garantissant qu'aucune station ne tombe dans un interstice.

**Mesure du détour réel et mémoïsation contextuelle (§5.3).** Chaque station affiche non pas sa distance à vol d'oiseau mais **le détour routier réel en minutes**, obtenu par requête d'itinéraire avec point de passage. Ces mesures étant coûteuses, chaque station retient sa valeur **et le contexte auquel elle se rapporte** (départ | arrivée | option péages). Tant que le contexte est inchangé, un nouveau rendu repeint la valeur sans aucun appel réseau.

**Numéro de génération.** La boucle de mesure est asynchrone et écrit dans des identifiants DOM indexés. Elle porte un **compteur de génération** vérifié en trois points (en tête d'itération, après attente réseau avant toute écriture, avant la phase de remplacement) : sans lui, un nouveau rendu survenu pendant une attente réseau inscrivait les temps de détour **sur les fiches d'autres stations**.

**Arbitrage prix / détour.** Le mode « moins cher » ne compare pas des prix bruts : il valorise la minute de détour à **0,80 €** (temps + carburant + usure) sur un réservoir de référence de **45 litres**, applique un bonus de **0,40 €** aux stations déjà fréquentées, un plafond de détour de 10 minutes, et exempte du plafond les stations situées à moins de 1 500 m du tracé. Le mode « plus proche » utilise une bulle de 2 km **élargie progressivement par pas de 500 m jusqu'à 5 km** tant que moins de 5 stations y figurent.

**Adaptation au type de véhicule.** Thermique → carburants ; électrique → bornes ; **hybride → les deux fusionnés dans une liste unique triée par distance**. Chaque résultat porte son type, qui détermine son pictogramme, sa pastille et **les critères de tri applicables** : le prix n'a pas de sens pour une borne, la puissance n'en a pas pour une pompe, et en mode mixte le second critère disparaît purement et simplement. Une puissance inconnue est **reléguée en fin de liste** plutôt que présentée comme un maximum.

**Filtres auto-générés** : ne sont proposés que les carburants réellement tarifés et les connecteurs réellement présents dans la zone. Le filtre carburant ne s'applique jamais aux bornes, ni le filtre connecteur aux pompes.

**Placement des marqueurs — décision technique documentée.** Les pastilles sont posées sur les **coordonnées brutes du flux** (position relevée par l'exploitant), jamais sur un géocodage d'adresse — lequel produit un point de voirie interpolé, mesuré à 70–147 mètres de la station réelle. Le géocodage n'est utilisé **que** pour le point de passage de routage de la station effectivement retenue, où l'on veut accéder par la chaussée.

**Horaires** : statut d'ouverture calculé, stations fermées reléguées en fin de liste quel que soit leur prix. **Favoris** persistés 90 jours, 30 stations maximum.

### 3.10 — Scan « autour de moi » (sans trajet)

Bulle de rayon réglable de 1 à 10 km centrée sur le conducteur, ouverte depuis le menu radial.

- **Un seul appel** d'API matricielle (`sources=0`, 24 destinations) fournit les temps de trajet de toute la liste — une requête par station serait inacceptable au volant. En cas d'échec, estimation à 25 km/h préfixée d'un `~` qui disparaît à l'arrivée de la vraie valeur ;
- **La zone de recherche est dessinée en couches cartographiques**, jamais en élément HTML : disque + bord + **3 ondes radar déphasées** animées en `requestAnimationFrame plafonné à 24 images/seconde**. Un élément HTML posé sur le canevas ne resterait pas collé au terrain lors d'un déplacement ou d'une rotation de carte ;
- La boucle d'ondes **s'auto-répare** : elle recrée sources et couches si un changement de thème les a détruites ;
- Le cercle géographique corrige le **cosinus de la latitude**, sans quoi il s'aplatit en ellipse d'autant plus qu'on monte vers le nord ;
- Le cadrage se fait **sur le cercle demandé, pas sur les résultats trouvés** : le zoom traduit la distance demandée et non le hasard des réponses ;
- Liste plafonnée à 12 fiches — au-delà, illisible au volant ;
- L'outil est **rendu indisponible pendant l'aperçu de trajet** (trois points d'application distincts), car le sous-système du modal répond déjà à la même question **en tenant compte du trajet**.

### 3.11 — Interface : le menu radial (« hotbox »)

Menu circulaire inspiré des logiciels de création 3D, **conçu pour l'usage au volant**.

Appui long de **400 ms** sur la carte → le cercle s'ouvre **au point de pression** → glissement vers une entrée → relâchement pour valider. **Neuf entrées** : 🔍 Destination, 📍 Arrêt, 📡 Live, 🔊 Son, ⌖ Recentrer (en course uniquement), 3D, ⛽ Stations autour de moi, 🚦 Trafic, ☀️/🌙 Jour-Nuit.

Objectif de conception : **rendre l'écran de conduite à la carte** en supprimant les boutons flottants permanents.

Détails d'ergonomie qui font la mécanique :

- **Couverture 360° sans zone neutre** : dès la sortie d'une zone morte centrale valant 42 % du rayon, c'est l'entrée **la plus proche en angle** qui est retenue. Un découpage en secteurs stricts exigerait de viser précisément — ce que le pouce d'un conducteur ne peut pas faire ;
- **Tolérance de mouvement de 12 px** avant annulation, seuil qui distingue l'appui long du déplacement de carte ;
- **Relâchement en moins de 260 ms = menu épinglé** : ouvrir puis lâcher sans viser laisse le cercle ouvert pour un usage au tap. Le geste glissé et le tap mobile passent par **le même moteur** ;
- **Recentrage automatique près des bords** d'écran, sans lequel un tiers des entrées deviendrait inatteignable ;
- Les gestes de la carte (déplacement, rotation, pincement) sont **neutralisés pendant l'ouverture** : sans quoi le glissement vers une entrée ferait aussi défiler la carte et **détacherait le conducteur de sa position** pour avoir consulté un menu ;
- Le menu système d'appui long du terminal est neutralisé sur la carte ;
- **Réemploi comme sélecteur binaire** : le même moteur, avec un angle de départ de -180° et une liste de deux entrées, produit un choix « Go ici / Ne pas go » posé à gauche et à droite d'une fiche de station — un choix binaire se lit à l'horizontale, refuser à gauche, accepter à droite.

**Principe architectural :** les entrées du menu appellent **exactement les mêmes fonctions** que les boutons qu'elles remplacent. Aucune logique métier n'est dupliquée ; les boutons sont masqués, jamais supprimés du document.

### 3.12 — Saisie vocale d'adresse — résolution en deux temps

À ne pas confondre avec la banque `Voice/`, qui ne sert qu'à la restitution.

`startVoiceInput()` écoute via le moteur natif du système (**aucun service tiers, aucun envoi de voix**), puis `parseVoiceAndGeocode()` applique une chaîne de résolution originale :

1. **`findContactInText()`** — recherche d'abord un **contact enregistré** dans la phrase. « je vais chez Sandy » résout directement sur l'adresse mémorisée, et affiche le **nom du contact**, pas l'adresse ;
2. **`cleanVoiceText()`** — à défaut, nettoyage des mots de liaison **en tête et en queue uniquement**. Filtrer les mots vides partout détruisait les noms français : « gare de lyon » devenait « lyon », « place de la concorde » devenait « concorde » ;
3. **Décollage des élisions en tête de phrase seulement** : « l'arc de triomphe » doit devenir « arc de triomphe » (sinon le géocodeur y voit un nom d'établissement — un bar porte exactement ce nom), mais « musée d'Orsay » et « place d'Italie » doivent rester intacts ;
4. **`_splitPlaceAndCity()`** — détachement de la ville (« … à / au / aux / dans <ville> »), utilisée **uniquement pour départager** des résultats obtenus sur le seul nom du lieu. Le connecteur « sur » est volontairement exclu : il appartient à des centaines de noms de communes ;
5. **`geocodeDetailed()`** — résolution du lieu en conservant son **nom d'affichage**.

**Règle de conception absolue :** ne jamais géocoder en sens inverse un point d'intérêt pour l'afficher. L'inverse d'un monument n'est pas son nom mais l'adresse postale la plus proche — l'utilisateur ne reconnaît pas sa demande et croit à un échec.

**Mode d'essai au clavier** : sur les navigateurs dépourvus de moteur de reconnaissance, la phrase saisie traverse **exactement la même chaîne** de traitement, ce qui permet la mise au point du parsing partout.

### 3.13 — Résolution géographique — architecture à trois index

Chaîne de résolution différenciée, résultat d'une campagne de mesures documentée :

| Besoin | Moteur | Pourquoi |
|---|---|---|
| Adresses et communes, à la frappe | Index commercial | Le plus complet sur la voirie numérotée |
| **Lieux nommés, à la frappe** | **Photon** (index ouvert) | Conçu pour l'autocomplétion, 20–200 ms mesurés |
| **Lieux nommés, à la validation** | **Nominatim** (index ouvert) | Classement par notoriété, **1 requête/seconde maximum** |
| Repli lieux nommés | API de recherche de POI | Connaît certains monuments, en ignore d'autres |

**Les deux moteurs ouverts ne sont pas interchangeables** : la politique d'usage de l'un **interdit l'autocomplétion**, l'autre est fait pour ça. Le logiciel implémente donc :

- **Sérialisation stricte à 1 100 ms d'intervalle** sur le moteur à quota, avec cache de session et **un seul essai par appel** (une relance doublerait la charge) ;
- **Lancement en parallèle** des deux familles de sources à la frappe, avec **fusion en tête de liste** des résultats ouverts : sur une requête de lieu nommé, les propositions de l'index commercial sont du bruit pur ;
- **Dédoublonnage inter-sources sur les deux premiers segments du libellé** — les sources ne terminent pas leurs libellés de la même façon, comparer les chaînes entières laisserait passer deux fois la même avenue ;
- **Filtrage du bruit** : arrêts de bus, bouches de métro et arrêts de tram écartés ; villes et quartiers écartés car déjà couverts par l'autre passe ;
- **Saut de la passe « lieu nommé » sur la seule présence d'un chiffre** — pas sur la détection d'un mot de voirie : « place de la Concorde », « cours Mirabeau », « avenue des Champs-Élysées » **sont** des lieux nommés. C'est le **numéro** que l'index ouvert perd, pas le type de voie.

**Normalisation des suffixes de voirie français.** `normalizeFrHouseNumber()` réécrit *bis* → `b`, *ter* → `t`, *quater* → `q` **avant chaque requête** — l'index commercial n'indexe que la forme compacte. Envoyé en toutes lettres, « 20 bis » n'est pas reconnu comme suffixe : le géocodeur retombe sur le numéro 20 seul et **l'interpole le long de la rue**, produisant un décalage de plusieurs dizaines de mètres, parfois jusqu'au carrefour suivant. **Le texte affiché à l'utilisateur n'est jamais modifié.**

**Deux réglages de requête à effet massif**, tous deux contre-intuitifs et vérifiés :
- restriction pays obligatoire, faute de quoi le classement se fait par notoriété mondiale — « tour eiffel » remontait la réplique de Las Vegas ;
- désactivation explicite du mode préfixe **sur toute recherche finale** : ce mode, actif par défaut, transformait « moulin rouge » en « Moulins (03) » et « tour eiffel » en « La Tour (03160) » — des communes dont le nom commence comme la requête, jugées plus pertinentes que le monument.

**Ne jamais accoler la ville au nom du lieu dans la requête** — mesuré sur les deux moteurs : l'un fait alors remonter des noms commerciaux et des locations saisonnières, l'autre **ne rend plus aucun résultat**.

### 3.14 — Rendu cartographique

- Styles jour / nuit / trafic, bâtiments 3D activables, bascule d'inclinaison 2D ↔ 3D ;
- **Injection de couche de trafic sur les styles qui n'en comportent pas.** Vérifié par appel à l'API de styles : les styles de nouvelle génération ne contiennent aucune couche de trafic et n'offrent aucune option pour en afficher. `applyTrafficLayer()` recrée la couche (champs `class`, `congestion`, `closed`, `structure`, zooms 6→14 avec surzoom) en reprenant **l'expression de couleur des couches officielles** — correspondance sur quatre niveaux de congestion, repli transparent ;
- **Auto-exclusion de la détection** — piège résolu et documenté : le test « ce style a-t-il déjà du trafic ? » portait sur un identifiant de sous-couche **que porte aussi la couche injectée**. Séquence obtenue : on ajoute → le cycle de rendu suivant la prend pour native → on la retire → on la rajoute. Le trafic **clignotait en continu** et la boucle tournait indéfiniment ;
- **Intensité d'émission forcée à 1** sur toute couche personnalisée posée sur un style à éclairage nocturne, sans quoi l'éclairage de scène assombrit la couche jusqu'à l'illisible ;
- **Empilement différencié** : emplacements nommés sur les styles récents, référence à une couche existante sur les styles classiques — sans quoi activer le trafic en cours de route poserait la couche **par-dessus le tracé d'itinéraire** ;
- **Point de passage unique** `applyMapStyle()` pour thème / trafic / bâtiments : il ne recharge le style **que si l'URL change réellement** (un rechargement détruit toutes les sources et couches) et applique sinon les réglages à la volée.

### 3.15 — Discipline de caméra

Sous-système à part entière, car c'est là que se logent les défauts les plus difficiles à reproduire :

- **Toute commande de caméra annule l'animation en cours**, y compris un simple changement de zoom qui ne touche pas au centre. La boucle de suivi s'exécutant à chaque fix, elle tuait l'animation de recadrage dès sa première image ;
- **Un drapeau de détachement unique** (`isUserPanning`) : consulter une destination détache la caméra et fait apparaître le bouton Recentrer ; le retour se fait par ce bouton, ou automatiquement après 8 secondes **si un trajet réel est en cours**. Une simple temporisation ne suffit pas — le suivi reprendrait la main à son expiration ;
- **Une seule règle de cadrage** (`getMapFollowPadding()`) partagée par le suivi et le recadrage. Le moteur cartographique **mémorise le retrait dans l'état de caméra** : un second mécanisme héritait du retrait du suivi et **cumulait les deux décalages** ;
- **Mesure sur le canevas, jamais sur la fenêtre.** Le conteneur de carte étant en position fixe et pleine hauteur, il déborde sous les barres système et sous l'interface du navigateur mobile : la hauteur de fenêtre n'est **pas** la hauteur du canevas. Le calcul correct est `bas du canevas − haut du panneau`, qui mesure la zone réellement masquée, débordement compris ;
- **Conséquence documentée :** ces défauts sont **invisibles en simulateur de bureau**, où les deux hauteurs coïncident et où l'erreur vaut zéro. Tout correctif de géométrie de caméra doit être validé sur terminal réel ;
- **Garde-fou de bande minimale** (150 px) sur le cadrage d'itinéraire : surestimer la place prise par un modal réduit la bande de carte disponible, et le moteur compense **en dézoomant** — le trajet apparaît vu de beaucoup trop loin ;
- **Validation systématique des coordonnées** (`isLngLat()` / `normalizeLngLat()`) avant toute commande de caméra, avec **journalisation au lieu de levée d'exception**. Point conceptuel associé : `if (coords)` **n'est pas une garde valable**, `[NaN, NaN]` étant un tableau donc vrai — cette fausse garde laissait calculer un itinéraire en **ignorant silencieusement** l'étape fautive.

### 3.16 — Séparation validité métier / rendu

Principe de conception explicitement formulé et appliqué :

> **Un incident d'affichage ne doit jamais invalider un résultat métier déjà obtenu.**

Dans le calcul d'aperçu de trajet, tout ce qui suit l'obtention de l'itinéraire (marqueurs, tracés alternatifs, cadrage) est enfermé dans un **bloc de capture d'erreur séparé**. Auparavant, une erreur de rendu remontait au bloc général qui invalidait l'itinéraire et redésactivait le bouton de lancement : **l'utilisateur voyait son trajet tracé, correct, et ne pouvait pas le démarrer.**

Corollaire appliqué : **les messages d'erreur internes des bibliothèques ne sont jamais montrés tels quels**. Le bloc de capture reconnaît la famille d'erreur et affiche une consigne **actionnable** ; le texte technique et sa pile restent dans le journal interne. Un message technique à l'écran envoie l'utilisateur chercher une panne réseau là où il suffisait de rechoisir une suggestion.

### 3.17 — Fonctions annexes

| Fonction | Description |
|---|---|
| **Alerte « à 10 min »** | Adresses favorites liées à un contact ; à 10 minutes de l'arrivée, notification et **lien de messagerie pré-rempli**. Réarmée automatiquement si la destination change en cours de route — sans quoi elle viserait l'ancienne adresse et le mauvais numéro pour le reste du trajet. |
| **Partage de position en direct** | Écriture périodique (5 s) sur base temps réel. **Câblé, non finalisé** — voir §7.2. |
| **Météo locale** | Source ouverte sans clé, rafraîchie toutes les 5 minutes et sur déplacement de 500 m, tables de correspondance jour / nuit / libellé. |
| **Configuration véhicule** | Thermique / hybride / électrique, consommation, prix carburant et prix électricité distincts, calcul du coût énergétique du trajet, estimation des péages. |
| **Points du permis** | Champ persisté dans la configuration véhicule. |
| **Recherche en navigation** | Superposition de recherche réutilisant **les classes du panneau d'itinéraire** plutôt que des styles propres — les deux écrans ne peuvent plus diverger visuellement. **Quatre portes d'entrée** (suggestion, dictée, pointage carte, validation clavier), **un point d'application unique**. En navigation, ni marqueur temporaire ni recadrage : le recalcul d'itinéraire **est** le retour visuel. |
| **Zoom de manœuvre** | Rapprochement automatique à l'approche d'un carrefour complexe. |
| **Confirmation de sortie** | Interception du geste retour pendant un trajet. |
| **Introduction animée** | Présentation de 30 s, 6 scènes de 5 s, jouée une seule fois. **100 % CSS/SVG, aucun fichier externe** — ni ressource manquante, ni blocage par la politique de lecture automatique. Horloge unique héritée par variable CSS. Respecte `prefers-reduced-motion`. Marqueur de lecture écrit **au démarrage**, pas à la fin — une fermeture en cours de lecture la rejouerait sinon indéfiniment. |
| **Mode simulation** | Bascule Réel / Simulé permettant de rejouer un déplacement sans GPS, avec temporisations accélérées. |

---

## PARTIE 4 — Positionnement par rapport à l'existant

*(Section à fournir en cas de démarche brevet ou de recherche de financement. Elle n'est pas exigée par e-Soleau mais renforce le dossier.)*

| Solution existante | Ce qu'elle fait | Ce que la création apporte en plus |
|---|---|---|
| Navigation grand public (Google Maps, Waze) | Itinéraire, trafic, signalement communautaire | **Aucune économie de récompense comportementale**, aucune évaluation ZFE avec chiffrage de l'infraction, aucun arbitrage prix/détour valorisé en euros |
| Assistants de vitesse (Coyote…) | Alerte de dépassement | **Aucune notion de score, de progression, ni de grâce proportionnelle** lors d'une baisse de limitation |
| Applications d'éco-conduite assurantielles | Notation de conduite à des fins tarifaires | Notation **transmise à un tiers** ; ici tout reste sur le terminal, **sans compte ni serveur**, et sert au joueur, pas à l'assureur |
| Applications de recherche de carburant | Prix par station | **Aucune mesure du détour routier réel**, aucun arbitrage prix/temps, aucune fusion thermique + électrique pour hybride |

**L'axe de différenciation revendiqué** est l'articulation : les mesures produites par le moteur de navigation (dépassement, douceur, kilométrage, régularité) **alimentent directement** l'économie de jeu, laquelle **ne quitte jamais le terminal**.

---

## PARTIE 5 — Revendications d'originalité

Ce sont les points à mettre en avant, dans cet ordre. Chacun est une **solution à un problème identifié**, pas une simple fonctionnalité.

### 5.1 — Grâce proportionnelle sur baisse de limitation

**Problème :** sanctionner un conducteur pendant les secondes qui suivent une entrée d'agglomération est physiquement injuste et détruit l'adhésion au score.
**Solution :** ouverture d'une fenêtre de non-pénalisation dont la durée croît **linéairement avec l'écart de limitation** (`min(4 + écart × 0,25 ; 12)` secondes), distincte de la marge fixe de +5 % appliquée en régime établi.
**Caractère non trivial :** deux mécanismes de tolérance de natures différentes — l'un statique et proportionnel à la vitesse, l'autre **transitoire et proportionnel à la variation** — coexistent sans se confondre.

### 5.2 — Objectifs hebdomadaires calibrés sur une référence personnelle

**Problème :** un objectif fixe est inatteignable pour un usager occasionnel et dérisoire pour un gros rouleur ; dans les deux cas il ne produit aucun engagement.
**Solution :** observation d'une **fenêtre glissante de 4 semaines** de kilométrage réel, objectif fixé à **115 % de la moyenne observée**, avec **plafond de progression à +20 % d'une semaine sur l'autre**, plancher absolu de 15 km/semaine, et période d'observation minimale de 4 semaines avant activation du mode adaptatif. Les sept gabarits sont ensuite instanciés dans cet intervalle recalibré, avec pas de valeur propre à chacun.
**Caractère non trivial :** le triplet **facteur de progression / plafond de saut / plancher** est ce qui empêche à la fois la spirale inflationniste (un objectif atteint difficilement une semaine ne doit pas rendre la suivante impossible) et l'objectif nul.

### 5.3 — Mémoïsation contextuelle du détour routier

**Problème :** afficher le détour **réel** de chaque station coûte une requête d'itinéraire par station ; tout nouveau rendu de la liste repaie l'intégralité de la facture.
**Solution :** chaque station retient sa mesure **et l'empreinte du contexte auquel elle se rapporte** (départ, arrivée, option péages). Tant que cette empreinte est inchangée, le rendu repeint la valeur mémorisée sans aucun appel réseau. Un peintre commun aux deux chemins (mesure fraîche / valeur mémorisée) garantit qu'ils ne divergent pas.
**Caractère non trivial :** l'invalidation porte sur le **contexte géométrique du calcul**, et non sur le rendu ni sur les critères d'affichage — le détour d'une station ne dépend ni du carburant sélectionné ni du mode de tri, ce qui rend gratuites des bascules qui recalculaient tout auparavant.

### 5.4 — Candidats à un examen brevet (à valider par un conseil en PI)

Ces trois procédés sont ceux qui présentent un **effet technique** au sens de l'article L611-10 CPI, condition d'accès au brevet pour un logiciel :

1. **Procédé de sondage prédictif de corridor** — interrogation d'une base géographique non pas à la position courante mais sur un corridor projeté devant le mobile, avec double condition de rafraîchissement (distance parcourue **et** temps écoulé) et marge de fin garantissant la continuité de couverture. **Effet technique : réduction mesurable du nombre de requêtes réseau et de la consommation énergétique du terminal, à qualité de service constante.**
2. **Procédé de confirmation croisée inertie / satellite** — validation d'un événement d'accélération par triple condition de seuil, de **durée minimale** et de **corrélation avec une variation de vitesse satellitaire**, avec refroidissement. **Effet technique : discrimination des événements de conduite réels et des artefacts de chaussée, sur un capteur bruité.**
3. **Procédé d'injection de couche cartographique avec auto-exclusion de détection** — ajout conditionnel d'une couche de données à un style de rendu, la fonction de détection de présence excluant explicitement les identifiants de la couche injectée. **Effet technique : suppression d'une oscillation infinie de rendu et de la charge processeur associée.**

> ⚠️ Le passage devant un examinateur est incertain sur les trois. Ne pas engager de frais sans avis préalable d'un CPI. **L'enveloppe e-Soleau est de toute façon à faire d'abord** : elle ne détruit pas la nouveauté (contenu scellé et non publié) et vous couvre pendant l'étude.

### 5.5 — Autres éléments d'expression protégés par le droit d'auteur

Sans être brevetables, ces éléments sont **des expressions originales** et relèvent pleinement du dépôt :

- L'**interface radiale au point de pression** avec zone morte proportionnelle, sélection par plus proche angle, épinglage au relâchement rapide, et réemploi comme sélecteur binaire horizontal ;
- La **chaîne de résolution vocale** contact → nettoyage tête/queue → décollage d'élision en tête → séparation lieu/ville → index ouvert par notoriété ;
- L'**architecture à trois index géographiques** différenciés par usage, avec fusion, dédoublonnage sur segments partiels et règles de saut de passe ;
- Le **système de badges à 8 catégories** par paliers de 3, avec séquence vidéo de franchissement ;
- La **table de raretés de coffre** avec ses probabilités et ses effets mixtes pourcentage / multiplicateur ;
- Le **système d'échelle fluide** garantissant des proportions constantes de 320 à 2560 px ;
- L'**introduction animée** à horloge unique héritée, entièrement en CSS/SVG ;
- L'ensemble du **thème sombre néon** et de la charte visuelle ;
- Le fichier **`AGENTS.md`** lui-même : 62 809 octets de documentation technique originale, œuvre littéraire à part entière.

---

## PARTIE 6 — Constitution matérielle du dépôt

### 6.1 — Pièces à sceller

| # | Pièce | Justification |
|---|---|---|
| 1 | `index.html` (version du 14/08/2026 17:53:25) | **Le programme** |
| 2 | `simulator.html` | Outil de développement associé |
| 3 | `AGENTS.md` | Documentation de conception |
| 4 | Le présent dossier (PDF) | Description structurée de la création |
| 5 | Inventaire `Voice/` (152 fichiers) + empreintes | Ressources vocales |
| 6 | `Images/` (4 fichiers) — **voir §7.3** | Illustrations de raretés |
| 7 | `Video/Bronze.mp4` | Séquence de déblocage |
| 8 | Liste horodatée des 84 versions de `backup/` | **Preuve de la progression créative** |
| 9 | Captures d'écran des principaux écrans | Preuve de l'expression visuelle |

### 6.2 — Volumétrie

| Ensemble | Taille |
|---|---|
| `index.html` | 1 046 525 o |
| `simulator.html` | 11 513 o |
| `AGENTS.md` | 62 809 o |
| `Voice/` (152 fichiers) | 1 260 770 o |
| `Images/` (4 fichiers) | 548 294 o |
| `Video/Bronze.mp4` | 2 524 798 o |
| **Total** | **≈ 5,45 Mo** |

**Compatible avec une enveloppe e-Soleau unique (limite 10 Mo).** Si vous choisissez d'exclure la vidéo, le total tombe à ≈ 2,9 Mo.

### 6.3 — Empreintes numériques SHA-256 (constatées le 14/08/2026)

Ces empreintes permettent de **prouver ultérieurement qu'un fichier est bien celui qui a été déposé**, sans avoir à ouvrir l'enveloppe.

```
index.html        1 046 525 o   5BBC31A0B4181E6214B79E753160F6657B44AF213021BB062A3ADBF0DB4141E1
simulator.html       11 513 o   0EE6D3C838BD6890B6CFD001EB978612B960E38BEB9FA806B9F3A48FFEC206BC
AGENTS.md            62 809 o   BC51C3100683B44308D6A6A6ADE0A01CCFC1529187E772DAE73E497BF764AAD7
Aiolia_Gold.png     134 767 o   D078752410373426051EF3172FB62AA0573B1117AD42E6E16483ADC1BF4B0B0A
Jamu.png            106 375 o   50293AE71E77259738779FC183D1BD7DFD1B307FB5FCC3CFC9F4C3B245CC9147
Pegase.png          134 451 o   EBF2E78D8BF444C412519425123EF19C35CB7147A68C17E5C1141FF4F57EA0B9
pegase_noir.png     172 701 o   F70D9BA05750B1F0AD397941EE9C0B703892FA9EE169594C59E6CB91A4100292
Bronze.mp4        2 524 798 o   5CE3785500B2783FECD55A095EBA023E80C22688D65490E2084F0FA139FF85CA
```

Un fichier `EMPREINTES.txt` complet, incluant les 152 fichiers audio, accompagne ce dossier.

### 6.4 — Procédure e-Soleau, pas à pas

1. Créer un compte sur **[procedures.inpi.fr](https://procedures.inpi.fr)** (ou se connecter au portail INPI existant) ;
2. Choisir **« Déposer une enveloppe e-Soleau »** ;
3. Renseigner l'identité du ou des déposants — **si vous êtes plusieurs auteurs, déposez à plusieurs noms** : ajouter un co-auteur après coup est impossible ;
4. Donner un **titre explicite** : *« Simulateur GPS Récompenses — application de navigation à récompense comportementale — version du 14/08/2026 »* ;
5. Téléverser les pièces (§6.1). Formats acceptés larges ; privilégier **PDF pour ce dossier** et conserver les sources dans leur format d'origine ;
6. Payer **15 €** par tranche de 10 Mo ;
7. **Conserver l'accusé de réception horodaté** — c'est lui la preuve, pas l'enveloppe ;
8. **Noter l'échéance à 5 ans** dans un agenda : le renouvellement n'est pas automatique et une enveloppe non renouvelée est détruite.

### 6.5 — Rythme de dépôt recommandé

Un logiciel évolue. Une enveloppe ne couvre que ce qu'elle contient, à sa date.

- **Maintenant** : enveloppe n° 1, version du 14/08/2026 ;
- **À chaque évolution fonctionnelle majeure** : nouvelle enveloppe (15 €) ;
- **Au minimum une fois par an**, même sans évolution majeure.

Votre dossier `backup/` — 84 versions horodatées à la seconde sur 3 jours — constitue déjà une **trace de création remarquablement dense**. Conservez-le intact et **hors du poste de travail** (sauvegarde externe), il vaut preuve de continuité.

---

## PARTIE 7 — Points de vigilance à traiter AVANT ou AUTOUR du dépôt

Ces points ne bloquent pas l'enveloppe e-Soleau — elle scelle un état, quel qu'il soit. Ils bloquent en revanche **l'exploitation commerciale**. Je les remonte parce qu'ils coûtent beaucoup plus cher traités tard.

### 7.1 — ⚠️ Jeton d'API en clair dans le code déposé

Le fichier contient un jeton d'accès cartographique en clair. C'est **acceptable pour un jeton public restreint par domaine** — ce qui est votre cas et relève d'un choix documenté, pas d'une négligence. Mais :
- il sera **scellé dans l'enveloppe** et donc daté ;
- si le dossier est un jour communiqué à un tiers (investisseur, acquéreur, juge), le jeton l'est aussi.

**Recommandation :** déposez tel quel (l'intégrité du fichier importe plus), mais **révoquez et remplacez ce jeton** avant toute diffusion du dossier hors procédure.

### 7.2 — Éléments non finalisés présents dans la version déposée

À signaler honnêtement dans le dossier plutôt qu'à masquer — une description exacte vaut mieux qu'une description flatteuse :

- **Partage de position en direct** : l'URL de base de données est un **littéral de remplacement** (`TON_PROJET-default-rtdb.firebaseio.com`). La fonction est câblée de bout en bout mais non connectée. À décrire comme *« implémentée, non raccordée »*.
- **Bouton de développement** `⚡ DEBUG — Mettre objectifs à 95 %` visible dans l'onglet Objectifs, marqué pour suppression. À retirer avant toute diffusion publique.
- **Investigation ouverte** au 14/08/2026 sur l'origine exacte d'une erreur de coordonnée dans l'aperçu de trajet — le symptôme est corrigé, la cause racine n'est pas identifiée.

### 7.3 — 🔴 RISQUE MAJEUR — Illustrations de raretés

Les quatre illustrations de coffres portent les noms `Aiolia_Gold.png`, `Pegase.png`, `pegase_noir.png`, `Jamu.png`. **« Aiolia » et « Pégase » sont des personnages de l'œuvre *Saint Seiya / Les Chevaliers du Zodiaque*, protégée par le droit d'auteur et par des marques déposées.**

Si ces images sont des reproductions, des dérivés ou des évocations de cette œuvre :

- **Le dépôt lui-même ne vous protège pas** — on ne peut pas déposer ce dont on n'est pas l'auteur, et l'enveloppe ne purge aucun droit de tiers ;
- **Le dépôt les date et les documente**, ce qui vous est **défavorable** en cas de litige : vous fournissez vous-même la preuve horodatée de l'usage ;
- La commercialisation vous exposerait à une action en contrefaçon, y compris sur une application gratuite.

**Trois options, par ordre de préférence :**

1. **Remplacer les quatre illustrations par des créations originales** (les vôtres, ou commandées avec cession de droits écrite) **avant** de déposer. C'est de loin le mieux : vous déposez alors une œuvre entièrement vôtre.
2. **Déposer sans le dossier `Images/`**, en décrivant les emplacements comme « quatre illustrations de rareté, à intégrer ». La mécanique de coffre — probabilités, effets, types — est protégée dans son expression codée, indépendamment des visuels.
3. Déposer tel quel **uniquement si** ces images sont bien de votre main et que la ressemblance de nom est fortuite.

**Je ne peux pas trancher à votre place** : je n'ai pas ouvert les images pour en juger le contenu. Vérifiez ce point avant de payer le dépôt.

### 7.4 — Licences des données et services tiers

| Ressource | Régime | À faire |
|---|---|---|
| **Données cartographiques ouvertes** (OpenStreetMap, Overpass, Nominatim, Photon) | **ODbL** | **Attribution obligatoire et visible** dans l'application (« © les contributeurs OpenStreetMap »). Vérifier qu'elle y est. |
| **Nominatim** | Politique d'usage stricte | Votre limitation à 1 req/s est conforme. **Un en-tête d'identification applicative est également exigé** — à vérifier. |
| **Cartographie commerciale** | CGU du prestataire | Le passage en usage commercial change le régime tarifaire et contractuel. À anticiper. |
| **Données publiques françaises** (prix carburants, ZFE, IRVE) | **Licence Ouverte / ODbL** | Attribution de la source. |
| **Bibliothèques tierces** (moteur de rendu, calculs géospatiaux) | Licences propres | Établir un **inventaire des dépendances et de leurs licences** — pièce systématiquement demandée en audit d'acquisition. |
| **Banque vocale `Voice/`** | ⚠️ **À vérifier impérativement** | La nomenclature (`right_sl`, `and_arrive_destination`, `back_on_route`) est **celle d'OsmAnd**, distribué sous GPL. Si ces fichiers en proviennent, **leur licence contamine leur redistribution**. À tracer avant toute diffusion. |

### 7.5 — Données personnelles (RGPD)

Votre architecture est **structurellement favorable** et c'est un argument à faire valoir : aucun compte, aucun serveur applicatif, **aucune donnée ne quitte le terminal**, la reconnaissance vocale passe par le moteur natif du système. Les seules données transmises à des tiers sont des coordonnées nécessaires aux appels d'API cartographiques.

À prévoir tout de même avant publication :
- une **politique de confidentialité** décrivant ce stockage local et les appels tiers ;
- la mention explicite que les points, badges et historiques **restent sur l'appareil et sont perdus en cas de réinitialisation** ;
- une **attention particulière** sur la fonction de partage de position en direct (§7.2) : dès qu'elle sera raccordée, elle transmettra une **donnée de localisation en temps réel**, la plus sensible du dispositif. Elle appellera son propre traitement RGPD.

### 7.6 — Titularité

Si un tiers a contribué au code, aux illustrations, aux textes ou aux enregistrements vocaux, **obtenez une cession de droits écrite avant le dépôt**. En droit français, le droit d'auteur naît sur la tête de la personne physique qui crée : sans cession, vous déposeriez une œuvre dont vous n'êtes pas seul titulaire.

---

## PARTIE 8 — Plan d'action

| # | Action | Échéance | Coût |
|---|---|---|---|
| 1 | **Trancher la question des illustrations (§7.3)** | Avant tout dépôt | 0 € (ou coût d'illustration) |
| 2 | Vérifier l'origine et la licence de la banque vocale (§7.4) | Avant tout dépôt | 0 € |
| 3 | Compléter l'identité du déposant dans ce dossier | Immédiat | 0 € |
| 4 | Exporter ce dossier en PDF + générer `EMPREINTES.txt` | Immédiat | 0 € |
| 5 | **Déposer l'enveloppe e-Soleau** | Immédiat | **15 €** |
| 6 | Sauvegarder `backup/` sur support externe | Immédiat | 0 € |
| 7 | Rechercher l'antériorité du nom commercial envisagé (base marques INPI, gratuite) | Court terme | 0 € |
| 8 | **Déposer la marque** sur le nom retenu, classes 9 / 39 / 42 | Avant toute communication publique | **190 €** + 40 €/classe |
| 9 | Révoquer et remplacer le jeton d'API (§7.1) | Avant diffusion | 0 € |
| 10 | Retirer le bouton de développement (§7.2) | Avant diffusion | 0 € |
| 11 | Ajouter attributions de données + politique de confidentialité | Avant publication | 0 € |
| 12 | Consulter un CPI sur les 3 procédés candidats (§5.4) | Si commercialisation | ~ 200–400 € l'entretien |
| 13 | Dépôt APP du code source | Si commercialisation | ~ 60–250 €/an |

---

## ANNEXE A — Inventaire des clés de stockage local

`gps_intro_seen`, `gps_hotbox`, `gps_hotbox_hint`, `gps_gas_scan_radius`, `gps_weekly_goals`, `gps_map_theme`, `gps_map_traffic`, `gps_buildings_3d`, `gps_voice_enabled`, `gps_eco_counter`, `gps_km_history`, `gps_last_km_goal`, `gps_favorites`, `gps_tenmin_enabled`, `gps_trip_history`, `gps_profiles`, `gps_active_profile_id`, `salif_gps_badges` (+ suffixe par profil), `gps_avoid_tolls`, `gps_vehicle_type`, `gps_vehicle_consumption`, `gps_fuel_price`, `gps_vehicle_consumption_elec`, `gps_elec_price`, `gps_vehicle_license_points`, `gps_critair`, `gps_vehicle_category`, `gps_zfe_alerts`, `gps_zfe_cache_v1` (TTL 7 j), `gps_gas_sort_mode`, `gps_error_log`, `gps_dest_draft` (TTL 6 h), `gas_favorites_v1` (TTL 90 j), `salif_gps_offline_route`.

## ANNEXE B — Sections fonctionnelles du code source

Le programme est organisé en sections balisées, dont voici le relevé (ordre du fichier) :

Outils de boucle haute fréquence · Fiabilité réseau · Journal d'erreurs interne · Export/import de profil · Vue 3D inclinée · Bascule 2D/3D · Itinéraires alternatifs · Système de marge et grâce · Limite de vitesse réelle du tronçon · Saisie d'adresse par voix avec parsing des contacts · Confirmation de sortie · Lissage GPS · Dead reckoning · Live share · Widget météo · Compteur de vitesse · Panneau itinéraire à glissement fluide · Mode saisie destination · Limites par segment · Boussole · Bouton muet · Recherche en navigation · Barre d'itinéraires alternatifs · Détection intra-muros par polygone · Hotbox radiale · Scan stations autour de moi · Objectifs hebdomadaires · Baseline personnelle · Système de badges et catégories · Alerte « à 10 min » · Statistiques de conduite · Éco-conduite accéléromètre · Zoom de manœuvre · Ligne ETA + distance + heure d'arrivée · Persistance de la destination saisie · Swipe du modal à 3 états · Barre de navigation permanente · Overlay flottant en trajet · Multi-arrêts · Configuration véhicule · ZFE et Crit'Air · Stations favorites · Stations-service flux temps réel · Détection pays et routeur multi-source · Horaires d'ouverture · Scan en deux phases · Cache de session · Sources de recherche de POI · Marqueurs de stations · Modes de classement · Bulle de proximité · Plafond de détour réel · Fenêtre de recherche · Préchargement automatique · Scan live en navigation · Bornes électriques IRVE + base collaborative.

## ANNEXE C — Constantes de réglage caractéristiques

Le logiciel expose **168 constantes nommées** portant le paramétrage métier. Extrait des plus significatives :

```
POINTS_PER_METER            0.001      gain de points par mètre parcouru
PENALTY_PER_METER           0.005      pénalité par mètre en dépassement (×5)
SPEED_TOLERANCE_FACTOR      1.05       marge avant sanction
GPS_SMOOTH_ALPHA_STATIC     0.15       lissage à l'arrêt
GPS_SMOOTH_ALPHA_MOVING     0.55       lissage en mouvement
GPS_MIN_MOVE_M              3.0        seuil de gel du point
GPS_ACCURACY_REJECT         50         rejet de position (m)
GPS_LOST_ACCURACY_M         45         seuil de perte de signal (m)
GPS_LOST_DELAY_MS           3000       durée avant bascule
GPS_DR_MIN_SPEED            12         vitesse min pour l'estime (km/h)
PROBE_LENGTH_KM             0.6        corridor sondé devant le véhicule
PROBE_REFRESH_METERS        300        distance avant re-sondage
PROBE_REFRESH_MS            20000      délai min entre sondages
PROBE_CORRIDOR_M            40         sortie latérale du corridor
ECO_THRESHOLD_BRAKE         3.5        freinage brusque (m/s²)
ECO_THRESHOLD_ACCEL         3.0        accélération brutale (m/s²)
ECO_MIN_DURATION_MS         350        durée min d'un événement
ECO_MIN_SPEED_DELTA         4          confirmation GPS (km/h)
ECO_COOLDOWN_MS             1200       refroidissement
ECO_PENALTY_SCORE           0.8        pénalité score éco
ECO_PENALTY_MAIN            0.3        pénalité score principal
BASELINE_WEEKS              4          fenêtre d'observation
BASELINE_FACTOR             1.15       objectif = moyenne × 115 %
BASELINE_MAX_JUMP           1.20       plafond de progression hebdo
BASELINE_KM_FLOOR           15         plancher km/semaine
REST_STOP_INTERVAL_HOURS    110/60     seuil de suggestion de pause
REST_STOP_BONUS_POINTS      50         bonus de pause observée
REST_STOP_RADIUS_KM         0.25       rayon de validation d'aire
HOTBOX_PRESS_MS             400        appui long d'ouverture
HOTBOX_MOVE_TOL             12         tolérance de mouvement (px)
HOTBOX_STICKY_MS            260        seuil d'épinglage
GAS_EURO_PER_MIN            0.80       valorisation de la minute de détour
GAS_TANK_L                  45         réservoir de référence
GAS_FAV_BONUS               0.40       bonus station habituelle (€)
GAS_MAX_DETOUR_MIN          15         détour maximum toléré
GAS_SCAN_MAX_CARDS          12         plafond de lisibilité au volant
GAS_SCAN_MATRIX_MAX         24         destinations par appel matriciel
OSM_MIN_INTERVAL_MS         1100       respect du quota de la base ouverte
ERROR_LOG_MAX               20         profondeur du journal d'erreurs
```

---

*Document établi le 14 août 2026 à partir de l'analyse du code source et de la documentation technique du projet. Les mesures de volumétrie, les empreintes et les valeurs de paramétrage ont été relevées directement dans les fichiers.*

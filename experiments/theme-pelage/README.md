# Thème pelage (clair, crème et roux) — piste mise de côté

Surcouche **claire** sur le seul écran Itinéraire : la feuille `#ui-panel`, son
contenu et la barre d'onglets du bas. Palette prise sur le renard — crème du
poitrail pour les surfaces, roux du dos pour l'action, brun de truffe pour
l'encre — et boutons entièrement ronds.

**Débranché le 30/08/2026**, le jour même de son branchement, à la demande de
l'utilisateur : le sombre fonctionne mieux pour cette app, Crépuscule reste
l'interface. La piste est archivée telle quelle.

Rien n'a bloqué techniquement : le thème marchait, il a été vu à l'écran dans
les deux états avant d'être retiré. Un seul défaut connu, décrit plus bas.

Comme pour [theme-neo](../theme-neo/README.md) et
[theme-cartoon](../theme-cartoon/README.md), ces fichiers ne sont référencés
nulle part dans `index.html` : ils ne sont jamais chargés. Ce dossier est une
archive de travail, pas du code mort dans l'app.

## Contenu

| Fichier | Rôle |
|---|---|
| `theme-pelage.css` | Tout le rendu, en 7 sections. Chaque règle est préfixée `body.theme-pelage` : sans cette classe sur `<body>`, le fichier est inerte. Ni `styles.css` ni `theme-crepuscule.css` n'ont été modifiés. |
| `28-theme-pelage.js` | Le bouton de bascule, sa persistance `localStorage` (clé `go_theme_pelage`), et le gardien d'onglet. |
| `maquette-trois-directions.html` | La planche de présentation qui a servi à choisir : Pelage, Savane et Sous-bois côte à côte, avec palettes et kits de boutons. Fichier autonome, à ouvrir dans un navigateur de bureau. Savane et Sous-bois n'ont jamais été codées — elles n'existent que là. |

## Le parti pris, en quatre règles

1. **Surcouche de la surcouche.** Pelage ne remplace pas Crépuscule, il se pose
   dessus. Crépuscule lit ses couleurs dans des variables `--cr-*` déclarées sur
   `body.theme-crepuscule` ; Pelage les redéfinit sur `#ui-panel` et
   `#main-bottom-nav`, plus bas dans l'arbre. Les variables étant héritées, la
   déclaration la plus proche gagne — l'essentiel du thème tient dans ce seul
   bloc de jetons, sans réécrire une règle.
2. **Papier, pas verre.** Les surfaces deviennent opaques et `--cr-blur` passe à
   `0px` : sur du crème, un `backdrop-filter` coûte du GPU pour un effet que
   personne ne voit. Le liseré blanc en `inset` de Crépuscule, qui simule une
   arête éclairée sur fond sombre, est remplacé par une ombre portée courte et
   chaude — la carte est posée *sur* le papier au lieu d'être creusée dedans.
3. **Tout ce sur quoi on appuie devient rond** (999 px) : champs, raccourcis,
   « Démarrer », « Trajet libre ». Les cartes (suggestions, feuille) gardent
   leurs angles doux. C'est la signature du thème — l'idée du galet, du
   coussinet — et elle tient dans une variable, `--cr-r-row`.
4. **Une seule couleur d'action.** L'ambre de Crépuscule devient le roux
   `#E05A28`, et il est le seul aplat plein de l'écran. Les valeurs claires du
   thème sombre (ambre pâle, menthe, turquoise) sont redescendues : calibrées
   pour être lues sur du violet nuit, elles disparaissent sur crème.

## Ce qui n'était PAS repeint, à dessein

Profil, Objectifs, la carte et ses widgets (météo, recentrer), le HUD de
navigation et les modales gardent Crépuscule. Le gardien est la classe
`tab-trajet`, posée sur `<body>` par le JS d'après la classe `.active` de
`#panel-tab-trajet` : sans elle, un fond crème serait aussi peint sous Profil et
Objectifs, qui dessinent leur texte en clair — texte blanc sur papier crème.

Ce gardien est **en CSS et pas en JS**, pour la même raison qu'au § 12 de
`theme-crepuscule.css` : si le JS ne se charge pas, `tab-trajet` n'existe jamais
et rien n'est repeint. L'app retombe entièrement sur Crépuscule, qui est juste.

⚠ Le JS lit l'onglet actif par un `MutationObserver` sur `#panel-tab-trajet`
plutôt qu'en se branchant dans `switchMainTab()`. C'était délibéré : l'onglet
actif est *déjà* écrit quelque part, autant lire cette vérité-là que d'en tenir
une seconde en parallèle. Ça capte aussi les chemins qui changent d'onglet sans
passer par un appui (premier lancement sans profil, fermeture de l'overlay
pendant un trajet).

## Le défaut connu, à corriger avant de rebrancher

**La ligne de statut reste bleue.** `#status` (« GPS actif — Choisissez
destination puis Lancer. ») a sa couleur écrite en `style=` par le JS, avec un
code sémantique : bleu pour l'info, rouge pour l'erreur, vert pour l'accusé de
réception, orange pour l'alerte. Un style en ligne ne se surcharge qu'en
`!important`, ce qui écraserait aussi le rouge d'erreur — inacceptable. Sur fond
crème, ce bleu `#4da3ff` passe mal.

La vraie correction n'est pas dans le thème : il faudrait que ces quatre états
passent par des classes (`.status-info`, `.status-erreur`, …) au lieu de
couleurs littérales, dans `js/07-gps-position.js`, `js/09-nav-recherche.js` et
les quelques autres qui touchent `#status`. Chaque thème pourrait alors les
repeindre. C'est un chantier à part, qui profiterait aussi à Crépuscule.

Deux détails mineurs du même genre : les formulaires contact et
domicile / travail portent encore un bleu `#58a6ff` en `style=` dans
`index.html` (hérité d'avant la refonte). Pelage les rattrape en `!important` —
la seule entorse du fichier, signalée sur place.

## Pour rebrancher

Trois gestes, exactement ceux qui ont été défaits :

1. Copier `theme-pelage.css` dans `css/` et `28-theme-pelage.js` dans `js/`.
2. Dans `<head>` d'`index.html`, **après** `theme-crepuscule.css` :
   `<link rel="stylesheet" href="css/theme-pelage.css" />`.
   L'ordre n'est pas décoratif : à spécificité égale (`body.CLASSE .cible`),
   seul l'ordre de déclaration départage les deux thèmes.
3. En fin de `<body>`, après `js/27-scan-parkings.js` :
   `<script src="js/28-theme-pelage.js"></script>`.

Le bouton de bascule apparaît alors en haut à droite de la carte. Il affiche le
thème *courant* (« Crépuscule » / « Pelage »), pas l'action — un bouton marqué
« Pelage » alors que Pelage est déjà à l'écran est le classique bouton qui ment.
Il disparaît dès que la navigation démarre, par une règle CSS sur
`body.nav-active` et non par le JS, même raisonnement qu'au point précédent.

# Thème neo (dark glass, accent lime) — piste mise de côté

Surcouche « verre sombre + accent acide » sur le panneau Itinéraire, la barre
d'onglets, les onglets Objectifs et Profil, et l'aperçu de trajet.
**Débranché le 22/08/2026** à la demande de l'utilisateur : l'app repasse au
thème d'origine, la piste est archivée telle quelle pour être reprise plus tard.

Contrairement au [thème cartoon](../theme-cartoon/README.md), rien n'a bloqué
techniquement — il n'a simplement pas été retenu pour l'instant. Aucun défaut
connu à corriger avant de le rebrancher.

Ces fichiers ne sont référencés nulle part dans `index.html` : ils ne sont
jamais chargés. Ce dossier est une archive de travail, pas du code mort dans
l'app.

## Contenu

| Fichier | Rôle |
|---|---|
| `theme-neo.css` | Tout le rendu, en 19 sections numérotées. Chaque règle est préfixée `body.theme-neo` : sans cette classe sur `<body>`, le fichier est inerte. `styles.css` n'a jamais été modifié. |
| `21-theme-neo.js` | Bascule et persistance `localStorage` (clé `gps_theme_neo`). |

## Le parti pris, en quatre règles

1. **Surface** — les dégradés navy (`#0a0e17` → `#0f1825`) deviennent un gris
   neutre unique, translucide avec `backdrop-filter` sur les feuilles posées
   au-dessus de la carte. Un dégradé bleu différent par bloc était ce qui datait
   le plus l'interface.
2. **Filet** — `rgba(0,140,255,…)` devient du blanc à faible opacité. Une
   bordure n'a pas besoin d'être colorée pour se voir.
3. **Accent** — un lime `#C8FF3D`, **rare** : action principale, état actif,
   donnée vive. Tout ce qui était bleu « par défaut » redescend en gris, sinon
   l'accent ne signale plus rien.
4. **Sémantique** — rouge = danger, or = trophée : conservés. Le vert de
   réussite disparaît au profit du lime, deux couleurs positives dans la même
   app ne se distinguant pas.

Typo : **Space Grotesk**, titres serrés en grande taille, libellés en 10 px très
espacés, chiffres en `tabular-nums`. Voir le point ⚠ sur la police plus bas.

## Comment le réactiver

1. Remettre les fichiers à leur place :
   - `theme-neo.css` → `css/theme-neo.css`
   - `21-theme-neo.js` → `js/21-theme-neo.js`
2. Dans `index.html`, quatre insertions :

**a. Dans `<head>`, après le `<link>` de `styles.css`** — l'ordre compte, c'est
une surcouche qui gagne par la cascade :

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" media="print" onload="this.media='all'"
      href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&amp;display=swap">
<link rel="stylesheet" href="css/theme-neo.css" />
```

**b. Juste après `<body>`**, avant le bloc de l'intro animée :

```html
<script>
    try {
        if (localStorage.getItem('gps_theme_neo') === '1') {
            document.body.classList.add('theme-neo');
        }
    } catch (e) {}
</script>
```

⚠ Cette restauration doit être **inline et juste après `<body>`**, pas dans
`21-theme-neo.js` : ce fichier est chargé en fin de page, le thème d'origine
serait peint avant lui à chaque rechargement. Et pas dans `<head>` non plus :
les règles sont scopées `body.theme-neo`, l'élément doit exister.

**c. Dans `#ui-panel`, après le bouton `#toggle-icon`** :

```html
<button id="neo-theme-btn" onclick="toggleNeoTheme(event)" aria-pressed="false"
        title="Basculer le thème Neo (verre sombre, accent lime)">Neo</button>
```

**d. En toute fin de liste des `<script>`, après `js/20`** :

```html
<script src="js/21-theme-neo.js"></script>
```

## Ce qui reste dans l'app après le débranchement

Une modification faite pendant ce travail a été **gardée volontairement**, parce
qu'elle est neutre pour le thème d'origine et corrige un défaut réel :

- `#vehicle-panel-section` (« Mon véhicule ») et `#backup-section`
  (« Sauvegarde profil ») utilisent désormais les classes partagées
  `.profil-row` / `.profil-row-btn`. Leur style était auparavant recopié en
  **inline**, mot pour mot, ce qui en faisait une troisième copie du même
  gabarit — et la mettait hors d'atteinte de toute règle de feuille. Le rendu
  est identique : les classes portent exactement les mêmes valeurs.

Rien d'autre n'a été touché. `styles.css` est intact.

## Points à traiter avant d'aller plus loin

1. **⚠ La police ne se chargera pas dans le build Android.** Un commentaire de
   `styles.css` (§ objectifs de la semaine) le rappelle : l'app tourne en
   `file://` et depuis `android_asset`, et **ne charge aucune police externe**.
   Le `<link>` Google Fonts ci-dessus marche dans un navigateur de bureau, pas
   sur l'appareil — Space Grotesk y retombe sur Roboto, et une bonne part du
   caractère du thème avec. **Correctif** : embarquer le `.woff2` dans
   `css/fonts/` et le déclarer en `@font-face`.

2. **Le flou coûte du GPU.** `backdrop-filter` ne porte ici que sur les boîtes
   (panneau, feuilles, barre d'onglets), pas sur tout l'écran comme le filtre
   qui a mis le thème cartoon en pause — mais à surveiller en navigation
   continue sur mobile bas de gamme. La variable `--neo-blur` est le seul point
   à toucher pour le désactiver partout.

3. **Écrans non repris.** Ils resteraient en bleu, l'écart se verrait :
   - feuille « Stations autour de moi » (scan par rayon)
   - hotbox radiale (appui long sur la carte)
   - modales coffre de récompense et vidéo de badge

4. **Non repris volontairement — à ne pas « corriger ».** Le HUD de navigation :
   bandeau de virage vert, pastille de limitation, compteur de vitesse. Ces
   trois-là copient des conventions routières ou Google Maps ; les repeindre en
   lime coûterait en lisibilité au volant plus que ça ne rapporterait en
   cohérence. Ils sont identiques dans les deux thèmes, c'est voulu.

5. **Les emojis restent** (📍 Réel, 🚗 Simu, 😇/😈 dans le sélecteur de style de
   conduite, 🧪/🏢 dans les options du trajet, 💾, 🏠…). Les retirer demande de
   toucher au HTML et au JS partagés, donc au thème d'origine aussi. C'était le
   seul point de la proposition initiale non livré.

6. **Le bento n'a été appliqué que là où il y a de la donnée** — cartes de lieux
   du panneau, grille de KPI des Statistiques. La page Itinéraire est un
   formulaire ; le vrai gain serait sur l'aperçu de trajet et la barre de
   navigation.

## Nettoyage de la clé mémorisée

Le thème étant débranché, la classe n'est plus posée et la clé ne sert plus.
Elle ne gêne pas, mais si tu veux repartir propre, en console :

```js
localStorage.removeItem('gps_theme_neo');
```

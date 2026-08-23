# Thème cartoon (N&B) — piste mise de côté

Essai d'un thème noir & blanc « planche de BD » sur le panneau Itinéraire, la
barre d'onglets et la carte. **Débranché le 20/08/2026** : l'interface tenait la
route, le rendu de la carte non (voir *Pourquoi c'est en pause*).

**Référence visuelle : `Ref_Style/cartoon_style.jpg`** (à la racine du projet,
à côté de `Go_app/`).

⚠ Ne pas confondre avec `Ref_Style/manga_style.jpg`, qui est une piste
**différente** : aquarelle façon Ghibli — parchemin, cadre bois, toits rouges,
verdure, personnages. Rien à voir avec le N&B ci-dessous. Le code de ce dossier
a d'abord été nommé « manga » par erreur, puis renommé « cartoon » pour coller
aux noms de `Ref_Style/`.

Ces fichiers ne sont référencés nulle part dans `index.html`. Ils ne sont donc
jamais chargés — ce dossier est une archive de travail, pas du code mort dans
l'app.

## Contenu

| Fichier | Rôle |
|---|---|
| `theme-cartoon.css` | Tout le rendu. Chaque règle est préfixée `body.theme-cartoon` : sans cette classe sur `<body>`, le fichier est inerte. `styles.css` n'a jamais été modifié. |
| `21-theme-cartoon.js` | Bascule, persistance `localStorage`, accord du fond de carte. |

Le préfixe `--mg-` des variables CSS est un reste du nommage initial. Sans
importance, il est resté tel quel pour ne pas brasser 90 déclarations.

## Pourquoi c'est en pause

L'UI rendait bien : papier tramé, contours noirs épais, ombres dures décalées,
typo Anton, champs en pilules. C'est **la carte** qui ne suivait pas.

L'approche était un `filter: grayscale(1) contrast(1.5)` sur `.mapboxgl-canvas`,
plus une couche de trame et de lignes de vitesse. Résultat constaté au test :
une carte lavée, presque blanche, sans les aplats noirs ni les hachures denses
de la référence. Un filtre ne peut que redistribuer les valeurs déjà présentes —
or `navigation-day-v1` est un fond clair à faible contraste. Il n'y avait rien
à pousser vers le noir, et les lignes de vitesse en surimpression flottaient
par-dessus au lieu d'appartenir au dessin.

**La bonne piste, pour reprendre :** construire un vrai style N&B dans Mapbox
Studio (aplats noirs sur les bâtiments, routes blanches à contour noir épais,
eau tramée, labels en gras). Le rendu serait juste *et* gratuit en GPU — le
filtre plein écran, lui, coûtait cher en navigation continue sur mobile.
Le CSS de l'UI, lui, est réutilisable tel quel.

Cette leçon vaut aussi pour la piste Ghibli (`manga_style.jpg`) : elle aussi
demandera un style Mapbox construit dans Studio, aucun filtre ne produira ces
toits rouges et cette verdure à partir du fond actuel.

## Comment le réactiver

1. Remettre les fichiers à leur place :
   - `theme-cartoon.css` → `css/theme-cartoon.css`
   - `21-theme-cartoon.js` → `js/21-theme-cartoon.js`
2. Dans `index.html`, quatre insertions :

**a. Dans `<head>`, après le `<link>` de `styles.css`** (l'ordre compte : c'est
une surcouche qui gagne par la cascade) :

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anton&family=Bangers&display=swap"
      media="print" onload="this.media='all'">
<link rel="stylesheet" href="css/theme-cartoon.css" />
```

`media="print"` + `onload` chargent les polices sans bloquer le premier rendu ;
l'app reste lisible en Impact / Arial Black si le réseau manque — cas courant
en voiture.

**b. Juste après `<div id="map"></div>`** :

```html
<div id="cartoon-map-fx" aria-hidden="true"></div>
```

**c. Dans `#ui-panel`, après le bouton `#toggle-icon`** :

```html
<button id="mg-theme-btn" onclick="toggleCartoonTheme(event)"
        aria-pressed="false" title="Passer en thème cartoon (N&amp;B)">Cartoon</button>
```

**d. En toute fin de liste des `<script>`, après `js/20`** :

```html
<script src="js/21-theme-cartoon.js"></script>
```

## Trois pièges déjà rencontrés — à ne pas re-découvrir

1. **`#ui-panel::before` et `::after` sont déjà pris.** Sur mobile (media query
   dans `styles.css`, ~ligne 1817), `::before` est la poignée de drag et
   `::after` la zone de capture tactile. Les recycler fait disparaître le drag
   du panneau. La trame « papier » passe donc par `background-image` sur
   l'élément lui-même.
2. **Le bouton de bascule est à `z-index: 1004`**, au-dessus de cette zone de
   capture (1002) qui couvre les 28 premiers pixels du panneau et avalerait
   sinon l'appui : à z-index égal, un pseudo-élément est peint après les
   enfants.
3. **La couche `#cartoon-map-fx` est à `z-index: 6`**, juste au-dessus des *deux*
   cartes — `#map` (1) et `#map-3d` (5). À 2, la trame disparaissait dès qu'on
   basculait en vue 3D. Son `pointer-events: none` n'est pas cosmétique : elle
   couvre tout l'écran et intercepterait chaque appui destiné à la carte.

## Le fond de carte

Le thème forçait la carte en mode jour : un fond sombre passé en niveaux de gris
donne une planche noire, l'inverse de la référence. L'état jour/nuit d'avant la
bascule était mémorisé sous `gps_theme_cartoon_prev_dark` pour être restauré au
retour.

⚠ Ce mécanisme ne tourne plus, le module étant débranché. Si la carte est restée
en mode **jour** alors qu'on la voulait en nuit, c'est un reliquat du test :
la remettre par le réglage habituel de l'app. Les clés laissées derrière par la
version d'essai (nommée `manga` à l'époque) se nettoient en console :

```js
localStorage.removeItem('gps_theme_manga');
localStorage.removeItem('gps_theme_manga_prev_dark');
```

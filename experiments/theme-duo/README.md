# Thème duo (plat, contour noir, façon Duolingo) — piste mise de côté

Reprend l'option « 1b » de l'artboard Claude Design **Interface Boutons
Colorés** (2026-09-04, artifact `8634888d-9215-4ef2-9046-384eb4cd794e`) :
plaques pleines à bordure noire épaisse et ombre 3D plate, testées sur
l'onglet Itinéraire le 2026-09-04.

**Débranché le 2026-09-04** à la demande de l'utilisateur : le rendu final ne
convainquait pas. L'app reste sur `theme-crepuscule`, la piste est archivée
telle quelle pour être reprise plus tard.

Contrairement au [thème cartoon](../theme-cartoon/README.md), rien n'a bloqué
techniquement — il n'a simplement pas été retenu. Aucun défaut connu à
corriger avant de le rebrancher.

Ces fichiers ne sont référencés nulle part dans `index.html` : ils ne sont
jamais chargés. Ce dossier est une archive de travail, pas du code mort dans
l'app.

## Contenu

| Fichier | Rôle |
|---|---|
| `theme-duo.css` | Tout le rendu, préfixé `body.theme-duo`. `styles.css` et `theme-crepuscule.css` n'ont jamais été modifiés. |
| `21-theme-duo.js` | Bascule et persistance `localStorage` (clé `gps_theme_duo`). |

## Couleurs (converties d'OKLCH en sRGB, valeurs de l'artboard)

- Go home : `#0096E1` (oklch(0.62 0.19 230))
- Go work : `#9964E5` (oklch(0.62 0.19 300))
- CTA « Démarrer » : `#43C251` (oklch(0.72 0.19 145)) — vert franc de
  `duoCta()` dans l'artboard, pas le corail `--cr-go` d'origine.

## Périmètre

Volontairement limité à l'onglet **Itinéraire** — c'est ce qui avait été
demandé, pas la « Projection du style Wii sur l'app entière » (turn 2 de la
même page Claude Design).

## Comment le réactiver

1. Remettre le `<link>` dans `<head>`, après `theme-crepuscule.css` :
   ```html
   <link rel="stylesheet" href="experiments/theme-duo/theme-duo.css" />
   ```
2. Juste après `<body>`, la restauration inline (voir le
   [thème neo](../theme-neo/README.md) pour l'explication du pourquoi
   « inline et ici, pas dans le fichier JS ») :
   ```html
   <script>
       try {
           if (localStorage.getItem('gps_theme_duo') === '1') {
               document.body.classList.add('theme-duo');
           }
       } catch (e) {}
   </script>
   ```
3. Un bouton de bascule dans `#ui-panel`, après `#toggle-icon`.
4. `<script src="experiments/theme-duo/21-theme-duo.js"></script>` en toute
   fin de liste des scripts.

## Nettoyage de la clé mémorisée

Le thème étant débranché, la classe n'est plus posée et la clé ne sert plus.

```js
localStorage.removeItem('gps_theme_duo');
```

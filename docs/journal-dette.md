# Journal de dette — à traiter plus tard

Ouvert le 31/08/2026. Ce fichier ne décrit **pas** l'app : il ne contient que ce qui a
été identifié, délibérément reporté, et qui serait sinon oublié. Une entrée réglée se
supprime — un journal qui garde ses lignes barrées ne se relit plus.

---

## 1. Factoriser js/11 (scan stations) et js/27 (scan parkings)

**Constat.** js/27 est un clone de js/11. Les paires suivantes font la même chose sur des
identifiants différents :

| js/11 | js/27 |
|---|---|
| `_gasScanZoneEnsure / Remove / Start / Stop / Update` | `_pkZoneEnsure / Remove / Start / Stop / Update` |
| `_scanPrefetchTick` | `_pkPrefetchTick` |
| `_gasScanPadding` | `_pkScanPadding` |
| `_scanGasCardHtml` / `_scanEvCardHtml` | `_pkCardHtml` |
| `_gasGoToStation` / `_gasInfoGoClicked` | `_pkGoToParking` / `_pkInfoGoClicked` |

Environ 300 lignes en double. Toute correction faite d'un côté doit être refaite de
l'autre, et rien ne le rappelle.

**Pourquoi ce n'est pas déjà fait.** Ces deux modules dessinent des couches Mapbox aux
identifiants distincts et ouvrent des feuilles animées ; ni `tests/noyau.test.js` ni
`tests/app.e2e.js` ne les couvrent. Un cercle de recherche qui ne s'efface plus, ou deux
feuilles qui se disputent la même couche, ne se verraient qu'à l'usage, sur le téléphone.
C'est un chantier qui demande sa propre passe et un aller-retour sur l'appareil — pas un
morceau à glisser dans un lot de corrections.

**Comment s'y prendre le jour venu.** Extraire d'abord le cercle de zone (les cinq
fonctions `Zone*`) dans un module partagé prenant l'identifiant de couche en paramètre :
c'est la partie la plus mécanique et la plus testable à l'œil. Vérifier les deux scans
sur le téléphone AVANT de toucher au reste. Les cartes HTML viennent en dernier : leur
contenu diverge réellement (carburant, bornes, places), la factorisation y rapporte moins.

---

## 2. `VIE_ROBUSTESSE` aplati à 1 — un test unitaire au rouge

**Constat.** `npm test` : 1 échec sur 363 assertions.

```
[Vie du compagnon] le fragile encaisse plus le choc
    attendu : true
    obtenu  : false
```

Dans [`js/00-noyau-calculs.js`](../js/00-noyau-calculs.js), la table `VIE_ROBUSTESSE`
donne `1` à tous les compagnons (modification non commitée, antérieure au 31/08/2026) ;
les valeurs d'origine sont conservées en commentaire de fin de ligne — bulle 1.60 le plus
endurant, nima 0.50 le plus fragile. Le test `tests/noyau.test.js:1290` compare raya à
bulle : à robustesse égale, il ne peut plus passer.

**Ce n'est pas un bug de code, c'est une décision de jeu non tranchée.** Deux issues :

- **on garde l'égalité** (tous les compagnons encaissent pareil, le choix de l'animal est
  purement esthétique) → le test doit être réécrit, et le commentaire de `VIE_ROBUSTESSE`
  dit alors pourquoi la table existe encore ;
- **on rétablit l'échelle** (l'animal choisi change la difficulté) → le test est juste,
  c'est la table qu'il faut restaurer.

Tant que ce n'est pas tranché, la suite reste rouge et ne signale plus rien : c'est le
vrai coût de cette ligne, bien plus que l'échelle elle-même.

---

## 3. Reste de l'audit du 31/08/2026 (non commencé)

Points relevés, classés, non traités — les numéros sont ceux de l'audit d'origine.

- **(3) `lineSlice` + `setRouteLine` à chaque point GPS**, `handleRealMovement` (js/19) :
  toute la géométrie restante est redécoupée et renvoyée à Mapbox une fois par seconde.
  La boucle de simulation, elle, ne retaille que toutes les 250 ms (`animate._lastTrim`) —
  appliquer la même limite au trajet réel. **Mesurer d'abord** (`DEBUG = true` journalise
  `coordinates.length`) : c'est probablement le plus gros gain du lot, mais on touche au
  tracé visible.
- **(6) ~30 Mo de sources dans `Images/`** : `Animals/Normal/Animaux.psd` (21 Mo) et
  `Animals/Dead/dead_animals.psd` (9 Mo). Exclus de git, mais présents sur le disque —
  donc probablement embarqués par Website 2 APK Builder, qui empaquette le dossier. À
  vérifier sur l'APK produite. Dans la même veine : 82 PNG de 512 px à ~250 Ko pièce,
  affichés entre 96 et 200 px ; un passage en WebP redimensionné allégerait l'APK et la
  mémoire image. Aucun risque logique, c'est de l'asset.
- **(8) `getViewportH()` crée et détruit un `<div>` à chaque appel** (js/08) : force un
  recalcul de mise en page. Appelé seulement aux changements d'état du panneau, donc
  mineur — à faire si l'on travaille déjà dans ce fichier.

---

## 4. Un seul serveur Overpass joignable — le vrai plafond des scans

**Mesuré le 01/09/2026**, dans Chrome, page chargée en `file://` (donc dans les conditions
de l'APK), avec `node tools/_test-overpass.js` :

| miroir | résultat |
|---|---|
| `maps.mail.ru` | **200, 8 à 21 s selon l'heure, 131 éléments** |
| `overpass.private.coffee` | CORS : bloqué (`Origin: null`) |
| `overpass.kumi.systems` | CORS : bloqué |
| `overpass-api.de` | CORS : bloqué (après 21 s de calcul, ce qui trompe) |
| `overpass.openstreetmap.ru` | injoignable |
| `overpass.osm.ch` | 200 instantané, **0 élément hors de Suisse** → retiré de la liste |

Quatre candidats supplémentaires essayés le même jour, tous refusant l'origine `null` :
`overpass.osm.jp`, `overpass.monicz.dev`, `lz4/z.overpass-api.de`,
`overpass.openstreetmap.fr`.

**Conséquence.** Tous les scans (parkings, bornes, aires, ZFE) dépendent d'un serveur
bénévole unique, qui limite les créneaux par adresse IP et rend 504 quand il est sollicité
de trop près. Les corrections du jour (budget 45 s, réponse vide non gagnante, une reprise
après pause) rendent l'app tolérante à ses mauvais moments — elles ne changent rien au
fait qu'il n'y a qu'un serveur.

**La sortie durable, le jour où ça vaudra le coup :** un proxy CORS côté serveur
(fonction Supabase, comme celui déjà envisagé pour le jeton Mapbox — voir la note de
sécurité du token). Il rendrait joignables les cinq autres miroirs, qui refusent
uniquement à cause de l'origine `null`, et permettrait un cache partagé entre
utilisateurs. Tant que l'app reste privée, ce n'est pas urgent ; le jour d'une ouverture
au public, ça le devient — un serveur bénévole unique ne tiendra pas la charge.

**Comment diagnostiquer, la prochaine fois :** `node tools/_test-overpass.js` (les
miroirs un par un) puis `node tools/_test-parkings.js` (la chaîne complète, telle que
l'app l'exécute). Ne jamais conclure depuis `curl` ou node : sans CORS, ils voient
quatre miroirs répondre là où le navigateur n'en voit qu'un.

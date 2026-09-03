# Go_app — GPS Récompenses

Application GPS mono-page, **sans aucune dépendance à l'exécution** : `index.html` + `css/`
+ 29 fichiers `js/*.js` (~23 200 lignes de code), empaquetée en APK par Website 2 APK
Builder Pro (WebView, zéro natif). `package.json` et `node_modules/` ne servent QUE les
tests ; l'APK ne les embarque pas.

⚠ **Travailler dans `Go_app/`** (minuscule), pas dans le dossier parent `Go_App/` qui
contient des projets frères. C'est `Go_app/` qui porte le `.git`, le `package.json` et
`index.html` — l'environnement annonce parfois à tort « pas un dépôt git ».

## La documentation de référence est `AGENTS.md`

**`AGENTS.md` (308 Ko) est la source de vérité de ce projet** : il consigne, incident par
incident et avec les dates, tout ce que le code seul ne dit pas. Il est trop volumineux
pour être chargé à chaque session — le présent fichier en est l'INDEX, pas le résumé.

**Avant de toucher à un sujet listé plus bas, lire la section correspondante d'AGENTS.md.**
Presque tout ce qui paraît être une maladresse dans ce code est une cicatrice documentée.

## Les interdits absolus

Ces règles ont chacune coûté un bug en production. Aucune n'est négociable.

1. **Scripts classiques, JAMAIS `type="module"`.** Tous les fichiers partagent le même
   scope global. Les modules ES ne fonctionnent pas en `file://`.
2. **NE JAMAIS RÉORDONNER les `<script src>` d'`index.html`.** Une trentaine
   d'instructions s'exécutent au chargement ; l'ordre est celui du script d'origine.
3. **Toute variable `let`/`const` lue par plus d'un fichier se déclare dans
   `js/00-helpers-partages.js`.** Une `function` peut rester chez elle (elle est hoistée),
   un `let` non — il n'existe qu'à partir de sa ligne. Devant un `X is not defined` portant
   sur une VARIABLE, chercher une exception au chargement dans le fichier qui la déclare,
   pas une faute de frappe : une exception au top-level interrompt tout le fichier, en
   laissant ses `function` disponibles. C'est l'asymétrie qui égare le diagnostic.
4. **Tout `fitBounds` est précédé de `map.resize()` puis de `map.setPadding({0,0,0,0})`, et
   reçoit `bearing: 0, pitch: 0`.** Le padding résiduel de la boucle de suivi n'est jamais
   celui que veut un cadrage ; la taille interne de Mapbox — celle qui sert au calcul — se
   périme sans rien lever ; et une bbox cadrée sur caméra inclinée déborde par le haut.
   **Corollaire : ne jamais mémoriser une vue avec `map.getCenter()` sans vérifier
   `map.isMoving()`** — pendant les 800 ms d'animation, c'est une image de vol qu'on
   enregistre, et la restituer ramène à un entre-deux. Garder la vue CIBLE calculée par
   `cameraForBounds`, et remettre le padding à zéro avant de la rendre.
5. **Tout texte venu du réseau qui entre dans un gabarit `innerHTML` passe par
   `echapperHtml()`** (`js/00-helpers-partages.js`). Les noms et adresses viennent d'OSM et
   de data.gouv, que n'importe qui peut éditer. Préférer le DOM + `textContent` pour tout
   nouvel écran ; `innerHTML` n'est toléré que dans les boucles de rendu tenues à une seule
   écriture DOM. Une seule définition d'échappement dans le projet : `_clEchappe` (js/21) et
   `_escHtml` (js/01) y sont branchés.
6. **Ajouter un service réseau = ajouter son origine dans la CSP** (`<meta>` d'`index.html`).
   Sinon il échoue SANS message : un blocage CSP n'est pas une exception JavaScript.
   ⚠ Vérifier aussi les REDIRECTIONS : la CSP contrôle chaque saut (`www.data.gouv.fr`
   redirige vers `static.data.gouv.fr`). Ne pas retirer l'écouteur `securitypolicyviolation`
   de `js/01` : c'est le seul chemin par lequel un blocage atteint le journal 🩺, la console
   étant inaccessible dans l'APK.
7. **Ne jamais mettre la clé `service_role` de Supabase dans le code.** La clé publishable
   présente dans `js/21` est publique par construction.
8. **Dans `theme-crepuscule.css`, aucune couleur translucide écrite en clair.** Un
   `rgba(255,179,92,0.15)` est figé : il reste violet dans Canopée et dans Abysse, sans rien
   lever. Seule la forme `rgba(var(--cr-amber-rgb), 0.15)` suit la palette. Corollaire :
   **toute couleur ajoutée au bloc de jetons doit l'être aussi dans les deux blocs `pal-`**.
   Et `theme-crepuscule` **reste posée sur le `<body>` dans les trois thèmes** — la retirer
   n'enlève pas la couleur, elle éteint tout le thème.

## Vérifier son travail

Développement sous **Windows / PowerShell** : `&&`, `cat` et `/tmp` n'existent pas.
Depuis `Go_app/` :

- `node tests/noyau.test.js` — calculs purs, quelques millisecondes. Le seul filet qui
  attrape un calcul FAUX (par opposition à du code invalide).
- `npm run test:app` — l'app entière dans Chrome (~30 s). Vérifie les exceptions au
  chargement, les débordements, le cadrage et les SDK externes.
- `npm start` — serveur sur `http://127.0.0.1:8080`, pour essayer à la main. La
  géolocalisation est refusée en `file://`, donc ne pas ouvrir `index.html` directement.

⚠ **Un test vert ne dispense pas d'un essai sur l'appareil.** Chrome de bureau n'est pas la
WebView Android : chargement depuis `android_asset`, hauteur réelle du canevas, fix GPS
continus et origine opaque en `file://` n'y sont pas reproduits. Plusieurs bugs majeurs de
ce projet étaient invisibles au simulateur.

⚠ **Un test qui passe ne prouve rien s'il ne mesure pas ce qu'on croit** : le harnais e2e a
tourné en paysage en annonçant du portrait. Vérifier la capture produite, pas l'intention.

## Où chercher dans AGENTS.md

| Sujet | Section |
|---|---|
| Git, encodage UTF-8, `.gitattributes` | « LE PROJET EST SOUS GIT » |
| Ordre de chargement, portée des variables | « Règles de chargement du JS » |
| Requêtes Overpass (miroirs, `_fetchOverpassHedged`) | « TOUTE REQUÊTE OVERPASS » |
| Caméra, zoom, cadrage | « Caméra Mapbox — règles centrales » |
| Géocodage (BAN, Mapbox) | « Géocodage FR », « Géocodage Mapbox » |
| Scans ⛽ ⚡ 🅿️ et coût du rendu | « Panneau stations », « Scan stations autour de moi » |
| Compagnons, images et vidéos | « La troupe des compagnons » |
| Classement, Supabase, schéma SQL | « Classement en ligne » |
| Palettes de couleur, jetons `--cr-*` | « Les trois palettes » |
| localStorage, clés persistées | « Persistance des données » |
| Écarts navigateurs | « Compatibilité navigateurs » |

## Tenir cette documentation à jour

- **Une règle vitale nouvelle ou modifiée se documente ICI *et* dans `AGENTS.md`.** Ici
  l'énoncé en deux lignes, là-bas le récit : le symptôme, la cause, la date.
- **Ne rien dupliquer d'autre.** Ce fichier est un index ; le jour où l'on y recopie un
  paragraphe d'`AGENTS.md`, on fabrique la divergence qu'il est censé éviter.
- Les commentaires du code restent le premier support d'explication : ce projet documente
  au point d'usage, et c'est délibéré.

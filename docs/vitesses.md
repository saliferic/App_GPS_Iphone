# Limites de vitesse réelles — journal de relevés terrain

Référencé depuis la section « Grandes fonctionnalités / modules du JS » d'`AGENTS.md`,
juste après le paragraphe sur la zone préchargée (04/09/2026). Même esprit que
[`docs/peages.md`](peages.md) : consigner un écart mesuré sur le terrain plutôt que
corriger à l'aveugle un algorithme qu'aucun test de bureau ne peut rejouer.

Calcul dans `_limiteDansZone()` (`js/10-paris-hotbox.js`), qui choisit la voie la plus
proche du point GPS parmi celles préchargées dans `_zoneVitesse` (rayon 1 km, voir
AGENTS.md).

---

## ⚠ 05/09/2026 — RELEVÉ TERRAIN : plusieurs incohérences non expliquées, mêmes rue et sens

Trajet réel en voiture (Puteaux / Île de la Jatte, La Défense), sept captures d'écran
à l'appui. Deux catégories de constats, à ne pas confondre :

### Ce qui s'est AMÉLIORÉ (confirmation, pas un bug)

Comparé au trajet précédent sur la même rue (déjà relevé et corrigé par le préchargement
de zone du 04/09/2026, voir AGENTS.md ligne 253) : la distance parcourue avant que
l'affichage bascule de 50 à 30 km/h a baissé de plusieurs mètres. Le correctif du 1 km
préchargé tient sur un nouveau passage — pas d'action requise ici.

### Ce qui reste incohérent — TROIS observations sur le même trajet, non expliquées

1. **Bascule lente à la sortie d'une rue à 30.** En sortant de la rue Pharmacie Verdun
   (zone 30), l'affichage a continué de montrer 30 quelques instants sur l'axe suivant,
   qui est normalement à 50 km/h.
2. **50 affiché en milieu de voie alors que la voie est à 70 dans ce sens.** Sur le quai
   emprunté (Quai du Président Paul Doumer, sens remontant), l'app a affiché 50 pendant
   une bonne partie du trajet sur cette voie ; le 70 correct n'est apparu qu'À LA SORTIE
   de cette même voie, jamais pendant qu'elle était parcourue.
3. **70 qui ne redescend pas à l'entrée d'un centre-ville.** Toujours sur cet axe, en
   entrant dans une zone urbaine dense où la limite attendue est 50, l'affichage est
   resté bloqué sur 70.

### Hypothèse — pas encore vérifiée sur le terrain

`_limiteDansZone()` (js/10) choisit la voie la plus proche du point GPS **par la seule
distance géométrique**, sans tenir compte du cap du véhicule ni du sens de circulation :

```js
candidats.sort((a, b) => {
    if (Math.abs(a.d - b.d) > 5) return a.d - b.d;
    const ia = rang.indexOf(a.v.tags.highway), ib = rang.indexOf(b.v.tags.highway);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
});
```

Sur un quai à chaussées séparées ou près d'une intersection complexe (contre-allée,
bretelle, rue transversale mappée à quelques mètres de l'axe principal), plusieurs voies
OSM peuvent se trouver dans le rayon de capture (`ZONE_VITESSE_SNAP_M`) en même temps.
Sans indice de direction, l'algorithme peut accrocher la géométrie d'une voie adjacente
plutôt que celle réellement empruntée — ce qui collerait avec le 50 affiché en PLEIN
MILIEU d'une voie à 70, corrigé seulement une fois arrivé à un point où la voie
concurrente s'écarte enfin (la sortie).

**Cette hypothèse n'est pas vérifiée** : elle n'explique pas à elle seule le cas n°3
(70 qui ne redescend pas en zone urbaine), qui pourrait tout aussi bien être un simple
tag `maxspeed` absent ou erroné sur la portion OSM concernée, sans rapport avec le choix
de voie. Les trois observations ci-dessus n'ont pas non plus été confirmées comme la
MÊME cause — elles pourraient relever de trois défauts distincts, exactement comme les
deux relevés de péage du 04/09/2026 (voir `docs/peages.md`) qui « tiraient en sens
opposé » sans être le même bug.

### Ce qui reste à faire

- **Ne pas corriger la fonction de tri à l'aveugle.** Ajouter un critère de cap/direction
  sans mesure de terrain répéterait l'erreur documentée dans `docs/peages.md` : un
  correctif « évident » non mesuré a déjà cassé plus qu'il n'a réparé sur ce projet
  (Perpignan → Paris, ASF, SAPN — trois tentatives ratées avant la bonne méthode).
- **Prochaine étape utile** : rejouer le même trajet en notant, pour chaque écart,
  la position GPS exacte et — si possible — extraire les `tags` OSM de la voie
  effectivement choisie par `_limiteDansZone()` (le retour de la fonction porte déjà
  `source` et `dist`, à journaliser ponctuellement le temps du test plutôt qu'en continu).
  Sans ce relevé, impossible de distinguer une mauvaise voie accrochée d'un tag `maxspeed`
  simplement faux ou absent sur OSM.
- Vérifier en particulier si le tronçon concerné par le 70 persistant (constat n°3) porte
  un tag `maxspeed:forward`/`maxspeed:backward` distinct du `maxspeed` plat que
  `parseMaxspeedTag()` lit seul aujourd'hui — une piste indépendante du choix de voie.

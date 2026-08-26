/* ═══════════════════════════════════════════════════════════════════════════
   SCHÉMA SUPABASE — projet husqmdqwqunufgjbcmsk (eu-west-2)
   ═══════════════════════════════════════════════════════════════════════════
   Relevé sur la base réelle le 23/08/2026 (pg_get_viewdef, pg_get_functiondef,
   pg_constraint, pg_policies) : conforme à l'existant à cette date.

   Ce fichier n'est PAS exécuté par l'application. Il existe parce que le schéma
   ne vivait nulle part ailleurs que dans le dashboard Supabase : impossible de
   savoir, en lisant le dépôt, ce que la base contient réellement — or le JS de
   `21-classement.js` doit rester d'accord avec elle (voir AGENTS.md, tableau
   « Ce qui doit rester d'accord avec le schéma SQL »).

   ⚠ Il ne se met pas à jour tout seul. Toute commande passée dans le SQL Editor
   doit être recopiée ici, sinon le fichier ment, ce qui est pire que son absence.

   Ordre de création : extensions → tables → trigger → vue → RLS.
   ═══════════════════════════════════════════════════════════════════════════ */

create extension if not exists citext;

/* ── Identité ──────────────────────────────────────────────────────────────
   Une ligne par compte. `pseudo` est en `citext` : l'unicité ignore la casse,
   ce qui va de pair avec `emailDePseudo()` côté JS qui met l'adresse synthétique
   en minuscules. Deux comptes « Pegase » et « pegase » seraient sinon distincts
   ici mais confondus à la connexion. */
create table if not exists public.profils (
    user_id     uuid primary key references auth.users (id) on delete cascade,
    pseudo      citext not null unique,
    cree_le     timestamptz not null default now(),

    /* Ville de rattachement (23/08/2026) — classement local.
       DÉCLARÉE par l'utilisateur, jamais déduite du GPS : la position dit où
       l'on roule, pas où l'on vit (on découvre l'app en vacances dans le Sud).
       Le code INSEE est la clé de regroupement — un champ texte libre donnerait
       « Paris », « paris » et « PARIS 15 » comme trois villes distinctes ; le
       nom n'est là que pour l'affichage, pour ne pas réinterroger la BAN à
       chaque ouverture du classement. Les deux vont ensemble ou pas du tout.
       `null` = compte sans ville : présent au classement mondial, absent des
       classements par ville. C'est l'état de tous les comptes créés avant. */
    ville_insee text,
    ville_nom   text,

    constraint pseudo_format
        check (pseudo ~ '^[A-Za-z0-9._-]{3,20}$'),
    constraint ville_coherente
        check ((ville_insee is null) = (ville_nom is null)),
    /* 2A/2B : les codes corses ne sont pas entièrement numériques. */
    constraint ville_insee_format
        check (ville_insee is null or ville_insee ~ '^([0-9]{5}|2[AB][0-9]{3})$'),
    constraint ville_nom_taille
        check (ville_nom is null or char_length(ville_nom) between 1 and 60)
);

create index if not exists profils_ville_idx on public.profils (ville_insee);

/* ── Scores ────────────────────────────────────────────────────────────────
   ⚠⚠ `points` PORTE UN NOMBRE D'ANIMAUX SAUVÉS DEPUIS LE 25/08/2026, et le nom
   de la colonne n'a pas suivi. Le classement ne compare plus des points mais des
   animaux menés au bout de leur parcours ; renommer la colonne imposait un
   `alter table` PLUS un `create or replace view` (la vue la lit nommément) sur la
   base de production, pour un gain purement cosmétique — et un client déployé
   d'une version antérieure aurait écrit dans l'ancienne. Aucune migration n'a
   donc été jouée : lire « animaux » partout où cette colonne apparaît.
   Deux conséquences à garder en tête :
     · la valeur est un TOTAL CUMULÉ, pas un compte de la semaine — la colonne
       `semaine` reste la clé de la ligne et fait l'historique, mais un joueur y
       inscrit le total d'animaux qu'il a sauvés depuis toujours ;
     · `check (points <= 500)` est devenu un plafond d'animaux. Il est absurde à
       cette échelle (six espèces existent) et c'est très bien : il borne
       l'aberration sans jamais gêner un joueur.
   Le JS correspondant : `clampAnimauxClassement()` (js/00) et js/21 en entier.

   Une ligne par joueur ET par semaine. `semaine` est un `date` (le lundi, rendu
   par `_lundiISO()`), surtout pas la chaîne « 2026-W34 » de `getWeekId()` :
   en tri texte, '2026-W9' > '2026-W10'. Les deux clés coexistent dans le JS et
   ne sont PAS interchangeables (piège documenté dans AGENTS.md).
   Le `check` borne l'absurde ; il n'empêche pas la triche, assumée.

   ⚠ `points` est en `numeric`, pas en `int` — surprenant pour un compteur de
   points entiers, mais c'est l'existant : le migrer casserait les lignes en
   place. Conséquence : rien n'interdit à un client de poster « 12.5 ».
   ⚠ La clé étrangère pointe `auth.users`, PAS `profils` : un score peut donc
   exister sans ligne `profils`, et la vue `classement_semaine` (jointure
   interne) le masquerait sans rien dire. En pratique le trigger crée toujours
   le profil dans la même transaction que le compte, donc le cas ne se produit
   pas — mais ce n'est garanti par aucune contrainte. */
create table if not exists public.scores (
    user_id  uuid not null references auth.users (id) on delete cascade,
    semaine  date not null,
    points   numeric not null default 0,
    maj_le   timestamptz not null default now(),
    primary key (user_id, semaine),
    constraint points_plausibles check (points >= 0 and points <= 500)
);

/* ── Création du profil à l'inscription ────────────────────────────────────
   Le pseudo arrive dans `raw_user_meta_data` (`options.data` de `signUp()`) et
   la ligne `profils` naît dans LA MÊME TRANSACTION que le compte auth. Le faire
   en deux requêtes depuis le navigateur laisserait un compte sans profil chaque
   fois que la seconde échoue.
   La ville n'est PAS écrite ici : elle l'est juste après par le client, via la
   policy « profil a soi ». Un compte peut donc exister sans ville. */
create or replace function public.creer_profil()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
declare p citext;
begin
  p := nullif(trim(new.raw_user_meta_data->>'pseudo'), '');
  if p is null then p := 'Pilote-' || lpad((floor(random()*10000))::int::text, 4, '0'); end if;
  while exists (select 1 from public.profils where pseudo = p) loop
    p := left(p || floor(random()*10)::int::text, 20);
  end loop;
  insert into public.profils (user_id, pseudo) values (new.id, p);
  return new;
end $function$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.creer_profil();

/* ── Vue du classement ─────────────────────────────────────────────────────
   ⚠ `security_invoker = true` est la SEULE chose qui protège le classement.
   Sans elle, la vue s'exécute avec les droits de son propriétaire, la RLS des
   tables sous-jacentes est contournée, et les `grant` à `anon` (posés par défaut
   sur le schéma public par Supabase, et bien présents ici) suffisent à lire tout
   le classement sans compte. `create or replace view` REMPLACE les options :
   ne jamais réécrire cette vue sans réécrire cette ligne.

   ⚠ L'ordre et le nom des quatre premières colonnes sont figés : un
   `create or replace` ne peut ni les renommer ni les réordonner, et le JS les
   lit nommément. Les nouveautés s'ajoutent à la fin.

   `rang_ville` est `null` — et non 1 — pour les comptes sans ville : les mettre
   dans une même partition en ferait un faux classement des « sans-ville ». */
create or replace view public.classement_semaine
with (security_invoker = true) as
select p.pseudo,
       s.semaine,
       s.points,
       rank() over (partition by s.semaine order by s.points desc) as rang,
       p.ville_insee,
       p.ville_nom,
       case
         when p.ville_insee is null then null::bigint
         else rank() over (partition by s.semaine, p.ville_insee order by s.points desc)
       end as rang_ville
  from scores s
  join profils p on p.user_id = s.user_id;

/* ── RLS ───────────────────────────────────────────────────────────────────
   Lecture réservée aux comptes NON anonymes ; écriture limitée à sa propre
   ligne. La policy d'UPDATE sur `profils` couvre déjà la mise à jour de la
   ville — rien à ajouter pour ça.
   ⚠ Elle n'impose AUCUNE limite de fréquence : changer de ville chaque dimanche
   soir pour être premier d'une commune vide reste possible. Le gel hebdomadaire
   demandera un trigger BEFORE UPDATE sur `profils`, pas encore écrit. */
alter table public.profils enable row level security;
alter table public.scores  enable row level security;

create policy "profils lisibles" on public.profils
    for select using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

create policy "profil a soi" on public.profils
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "scores lisibles" on public.scores
    for select using (coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) = false);

create policy "score a soi (insert)" on public.scores
    for insert with check (auth.uid() = user_id);

create policy "score a soi (update)" on public.scores
    for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

# Airbnb Deal Doctor

Simulateur front-end pour évaluer un deal d'arbitrage locatif, avec connexion Supabase et assistant de législation par ville.

## Ouvrir l'application

- en local simple: ouvrir `index.html`
- en ligne: passer par la version GitHub Pages

## Ce que calcule l'outil

- revenu mensuel et annuel estimé
- bénéfice net mensuel moyen
- marge nette
- ROI annuel sur cash investi
- multiplicateur revenu / loyer
- score global du deal sur 100
- calendrier de saisonnalité

## Assistant législation ville

La section législation permet de:

- rechercher une commune française
- obtenir un statut `bleu / vert / jaune / rouge`
- lire un résumé court et prudent
- afficher des communes proches à explorer si la ville paraît tendue

Le ton est volontairement informatif et non juridique. Chaque résultat doit être confirmé auprès de la mairie ou du service urbanisme.

## Backend Supabase requis

La recherche législation utilise une Edge Function située dans `supabase/functions/city-legislation/index.ts`.

Secrets à configurer dans Supabase:

- `OPENAI_API_KEY`
- `OPENAI_MODEL` facultatif, par défaut `gpt-5.5`

Exemple de déploiement:

```bash
supabase secrets set OPENAI_API_KEY=xxx
supabase secrets set OPENAI_MODEL=gpt-5.5
supabase functions deploy city-legislation
```

## Logique de couleur

- `Bleu`: friction locale faible, cadre relativement simple
- `Vert`: faisable avec des démarches standard
- `Jaune`: faisable mais plus encadré ou conditionnel
- `Rouge`: commune fortement contrainte pour ce modèle

## Conseil d'usage

Teste plusieurs scénarios financiers et plusieurs communes proches. Si le deal reste bon sur un scénario prudent et que la commune paraît exploitable, le projet est généralement plus robuste.

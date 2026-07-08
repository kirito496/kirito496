# NOVA LAB — Avec nous, l'innovation prend vie

Site vitrine de l'agence Nova Lab, avec un décor 3D animé (lentille de verre qui voyage
au défilement), un formulaire de contact enregistré dans PostgreSQL, et un assistant IA.

## Structure

- `public/index.html` — le site complet (HTML/CSS/JS, aucun framework)
- `public/logo.svg` — le logo NL
- `server.js` — serveur Express : sert le site + API contact + API assistant IA
- API :
  - `POST /api/contact` — enregistre un message (nom, email, besoin, message)
  - `POST /api/chat` — assistant IA (utilise l'API Claude si `ANTHROPIC_API_KEY` est défini)
  - `GET /api/messages` — liste les messages reçus (protégé par l'en-tête `x-admin-key`)
  - `GET /api/health` — état du serveur, de la base et de l'IA

## Déployer sur Railway

1. Sur [railway.app](https://railway.app) : **New Project → Deploy from GitHub repo** → choisir ce dépôt.
2. Railway détecte Node.js et lance `npm start` automatiquement.
3. Ajouter la base : dans le projet, **Create → Database → PostgreSQL**.
4. Relier la base au service web : dans le service web, onglet **Variables** →
   **New Variable → Add Reference** → choisir `DATABASE_URL` du Postgres.
   (La table `messages` est créée automatiquement au démarrage.)
5. (Optionnel) Ajouter une variable `ADMIN_KEY` avec une valeur secrète pour pouvoir
   consulter les messages reçus :
   `curl -H "x-admin-key: VOTRE_CLE" https://votre-domaine/api/messages`
6. (Optionnel) Activer l'assistant IA : ajouter une variable `ANTHROPIC_API_KEY`
   avec votre clé d'API Claude (console.anthropic.com). Sans clé, l'assistant reste
   présent mais invite simplement à utiliser le formulaire ou l'email.
   Modèle configurable via `AI_MODEL` (défaut : `claude-haiku-4-5-20251001`).
7. Obtenir l'adresse publique : service web → **Settings → Networking → Generate Domain**
   (donne une adresse en `*.up.railway.app`). Un domaine personnalisé peut être ajouté
   au même endroit (**Custom Domain**) en pointant un CNAME chez le registrar.

## Lancer en local

```bash
npm install
npm start          # http://localhost:3000 (sans base : messages dans les logs)
```

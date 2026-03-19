# 🎵 BlindTest Live — Guide de déploiement complet

## Vue d'ensemble
```
your-app.vercel.app/          → Panneau Admin (PC + iPad)
your-app.vercel.app/overlay   → OBS Browser Source
your-app.vercel.app/api/tiktok-webhook  → Endpoint TikFinity
```

---

## ÉTAPE 1 — Supabase

1. Va sur https://supabase.com → crée un **nouveau projet** (séparé de ton ERP)
2. Ouvre **SQL Editor** → colle le contenu de `supabase-schema.sql` → **Run**
3. Note tes clés dans **Settings > API** :
   - `Project URL` → `VITE_SUPABASE_URL` et `SUPABASE_URL`
   - `anon public` → `VITE_SUPABASE_ANON_KEY`
   - `service_role` (secret) → `SUPABASE_SERVICE_ROLE_KEY`

---

## ÉTAPE 2 — GitHub

```bash
git init
git add .
git commit -m "feat: blindtest live v1"
git remote add origin https://github.com/TON_COMPTE/blindtest-live.git
git push -u origin main
```

---

## ÉTAPE 3 — Vercel

1. Va sur https://vercel.com → **Add New Project** → importe ton repo GitHub
2. Framework : **Vite**
3. Dans **Environment Variables**, ajoute :

| Variable | Valeur |
|---|---|
| `VITE_SUPABASE_URL` | ton URL Supabase |
| `VITE_SUPABASE_ANON_KEY` | ta clé anon |
| `SUPABASE_URL` | ton URL Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | ta service_role key |
| `WEBHOOK_SECRET` | un secret de ton choix (ex: bt_live_2024_xyz) |

4. **Deploy** → note ton URL (ex: `blindtest-live.vercel.app`)

---

## ÉTAPE 4 — OBS (Browser Source)

1. Dans OBS, ajoute une **Browser Source**
2. URL : `https://blindtest-live.vercel.app/overlay`
3. Largeur : **1920** | Hauteur : **1080**
4. ✅ Coche **"Shutdown source when not visible"**
5. Background : transparent (le fond est déjà transparent)

> 💡 Tu peux placer cette source au-dessus de ta webcam/fond dans OBS

---

## ÉTAPE 5 — TikFinity

1. Dans TikFinity, va dans **Events / Triggers**
2. Crée un trigger **"Chat Message"** → condition : **All messages** (tous les commentaires)
3. Action : **HTTP Request**
   - URL : `https://blindtest-live.vercel.app/api/tiktok-webhook`
   - Method : `POST`
   - Headers :
     ```
     Content-Type: application/json
     x-webhook-secret: TON_WEBHOOK_SECRET
     ```
   - Body :
     ```json
     {
       "username": "{username}",
       "message": "{message}"
     }
     ```
4. **Save** et active le trigger

---

## ÉTAPE 6 — Accès iPad

Depuis ton iPad, ouvre Safari :
```
https://blindtest-live.vercel.app
```
→ Tu as accès à tout le panneau admin depuis l'iPad, en temps réel, synchronisé avec ton PC.

---

## 🎮 Utilisation pendant le live

1. **Ajoute ta playlist** (onglet 🎵 Playlist) avant le live
2. Lance ta musique sur l'iPad (Apple Music ou YouTube Music) → RødeCaster → OBS
3. Clique **▶ DÉMARRER** → TikFinity commence à écouter les commentaires
4. Si quelqu'un trouve → révélation automatique ✅
5. Si personne ne trouve en 30s → révélation automatique au timer
6. Clique **⏭ CHANSON SUIVANTE** → round suivant

---

## 🔧 Détection des réponses (logique)

Le webhook normalise les réponses :
- **Casse ignorée** : "Blinding Lights" = "blinding lights" = "BLINDING LIGHTS"
- **Accents ignorés** : "étoile" = "etoile"
- **Ponctuation ignorée** : "Blinding Lights! 🔥" = "blinding lights"
- **Correspondance partielle** : si le titre est contenu dans le message

Tu peux affiner cette logique dans `api/tiktok-webhook.js` → fonction `containsTitle()`

---

## 📱 Résumé des URLs

| Usage | URL |
|---|---|
| Panneau Admin (PC/iPad) | `https://your-app.vercel.app/` |
| Overlay OBS | `https://your-app.vercel.app/overlay` |
| Webhook TikFinity | `https://your-app.vercel.app/api/tiktok-webhook` |

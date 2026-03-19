// api/tiktok-webhook.js
// ─────────────────────────────────────────────────────────
// Vercel Serverless Function
// TikFinity → POST https://your-app.vercel.app/api/tiktok-webhook
//
// Config TikFinity :
//   Trigger  : "Chat Message" (tous les commentaires)
//   Action   : "HTTP Request"
//   URL      : https://your-app.vercel.app/api/tiktok-webhook
//   Method   : POST
//   Body     : { "username": "{username}", "message": "{message}" }
//   Headers  : { "x-webhook-secret": "TON_SECRET" }
// ─────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY   // service role pour écrire sans RLS
)

const SESSION_ID = 'default'
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'changeme'

// Normalise un texte pour la comparaison (retire accents, casse, espaces)
function normalize(str = '') {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
}

// Vérifie si le message contient le titre de la chanson
function containsTitle(message, title) {
  const normMsg   = normalize(message)
  const normTitle = normalize(title)
  // Correspondance exacte ou le titre est contenu dans le message
  return normMsg === normTitle || normMsg.includes(normTitle)
}

export default async function handler(req, res) {
  // CORS pour TikFinity
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-webhook-secret')

  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  // Vérification du secret
  const secret = req.headers['x-webhook-secret']
  if (secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const { username, message } = req.body || {}
  if (!username || !message) {
    return res.status(400).json({ error: 'Missing username or message' })
  }

  // Récupérer l'état du round
  const { data: state } = await supabase
    .from('game_state')
    .select('*')
    .eq('session_id', SESSION_ID)
    .single()

  if (!state || state.status !== 'playing') {
    // Pas de round actif → on ignore
    return res.status(200).json({ ok: true, ignored: true })
  }

  const isCorrect = containsTitle(message, state.song_title)

  // Sauvegarder le commentaire
  await supabase.from('comments').insert({
    session_id : SESSION_ID,
    username,
    message,
    is_correct : isCorrect
  })

  if (isCorrect) {
    // 1. Marquer le round comme révélé + enregistrer le gagnant
    await supabase
      .from('game_state')
      .update({
        status      : 'revealed',
        winner_name : username,
        updated_at  : new Date().toISOString()
      })
      .eq('session_id', SESSION_ID)

    // 2. Mettre à jour le score (upsert)
    const { data: existing } = await supabase
      .from('scores')
      .select('score, answers')
      .eq('session_id', SESSION_ID)
      .eq('username', username)
      .single()

    await supabase.from('scores').upsert({
      session_id : SESSION_ID,
      username,
      score      : (existing?.score  || 0) + 10,
      answers    : (existing?.answers || 0) + 1,
      updated_at : new Date().toISOString()
    }, { onConflict: 'session_id,username' })

    return res.status(200).json({ ok: true, winner: true, username })
  }

  res.status(200).json({ ok: true, correct: false })
}

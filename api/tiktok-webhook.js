import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SESSION_ID = 'default'
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'changeme'

function normalize(str = '') {
  return str
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
}

function containsAnswer(message, value) {
  const normMsg = normalize(message)
  const normVal = normalize(value)
  if (!normVal) return false
  return normMsg === normVal || normMsg.includes(normVal)
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-webhook-secret')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const body = req.method === 'GET' ? req.query : req.body || {}
  const username = body.username || body.nickname || body.value1
  const message  = body.content  || body.message  || body.value2
  const secret   = body.secret   || req.query.secret || req.headers['x-webhook-secret']

  if (WEBHOOK_SECRET !== 'changeme' && secret !== WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!username || !message) {
    return res.status(400).json({ error: 'Missing username or message', received: body })
  }

  const { data: state } = await supabase
    .from('game_state').select('*')
    .eq('session_id', SESSION_ID).single()

  if (!state || state.status !== 'playing') {
    return res.status(200).json({ ok: true, ignored: true })
  }

  // ✅ Bonne réponse = titre OU artiste
  const isCorrect =
    containsAnswer(message, state.song_title) ||
    containsAnswer(message, state.song_artist)

  await supabase.from('comments').insert({
    session_id: SESSION_ID,
    username,
    message,
    is_correct: isCorrect
  })

  if (isCorrect) {
    await supabase.from('game_state').update({
      status: 'revealed',
      winner_name: username,
      updated_at: new Date().toISOString()
    }).eq('session_id', SESSION_ID)

    const { data: existing } = await supabase.from('scores')
      .select('score, answers')
      .eq('session_id', SESSION_ID)
      .eq('username', username).single()

    await supabase.from('scores').upsert({
      session_id: SESSION_ID,
      username,
      score:   (existing?.score   || 0) + 10,
      answers: (existing?.answers || 0) + 1,
      updated_at: new Date().toISOString()
    }, { onConflict: 'session_id,username' })

    return res.status(200).json({ ok: true, winner: true, username })
  }

  res.status(200).json({ ok: true, correct: false })
}

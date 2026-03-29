import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SESSION_ID = 'bulls-race'

const COLORS = [
  '#ff2d78', '#00f5ff', '#ffd700', '#7b2fff', '#00ff88',
  '#ff8c00', '#ff69b4', '#00bfff', '#adff2f', '#ff4500'
]

const BOARD = [
  { id: 0,  type: 'start'  },
  { id: 1,  type: 'normal' }, { id: 2,  type: 'bonus',  value: 2  },
  { id: 3,  type: 'normal' }, { id: 4,  type: 'normal' },
  { id: 5,  type: 'trap',   value: -2 }, { id: 6,  type: 'normal' },
  { id: 7,  type: 'duel'   }, { id: 8,  type: 'normal' }, { id: 9,  type: 'normal' },
  { id: 10, type: 'bonus',  value: 2  }, { id: 11, type: 'normal' },
  { id: 12, type: 'trap',   value: -3 }, { id: 13, type: 'normal' },
  { id: 14, type: 'joker'  }, { id: 15, type: 'normal' },
  { id: 16, type: 'bonus',  value: 3  }, { id: 17, type: 'normal' }, { id: 18, type: 'normal' },
  { id: 19, type: 'trap',   value: -2 }, { id: 20, type: 'normal' },
  { id: 21, type: 'duel'   }, { id: 22, type: 'normal' },
  { id: 23, type: 'bonus',  value: 2  }, { id: 24, type: 'normal' },
  { id: 25, type: 'trap',   value: -3 }, { id: 26, type: 'joker'  },
  { id: 27, type: 'normal' }, { id: 28, type: 'duel'   },
  { id: 29, type: 'bonus',  value: 2  }, { id: 30, type: 'finish' },
]

function normalize(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '').trim()
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const username = req.body?.username || ''
  const content  = req.body?.content  || ''
  if (!username || !content) return res.status(200).end()

  const norm = normalize(content)

  // !join
  if (norm === 'join' || content.trim() === '!join') {
    const { data: state } = await supabase
      .from('race_state').select('status').eq('session_id', SESSION_ID).single()
    if (!state || !['idle', 'waiting'].includes(state.status))
      return res.status(200).json({ ignored: 'game not open' })

    const { data: existing } = await supabase
      .from('race_players').select('id').eq('session_id', SESSION_ID).eq('username', username).single()
    if (existing) return res.status(200).json({ ignored: 'already joined' })

    const { data: players } = await supabase
      .from('race_players').select('id').eq('session_id', SESSION_ID)
    if (players && players.length >= 10)
      return res.status(200).json({ ignored: 'max players reached' })

    const color = COLORS[players?.length || 0]
    await supabase.from('race_players').insert({
      session_id: SESSION_ID, username, position: 0,
      color, is_blocked: false, last_answered_round: 0
    })
    return res.status(200).json({ joined: true, username, color })
  }

  // Réponse pendant un round
  const { data: state } = await supabase
    .from('race_state').select('*').eq('session_id', SESSION_ID).single()
  if (!state || state.status !== 'playing') return res.status(200).end()

  const { data: player } = await supabase
    .from('race_players').select('*')
    .eq('session_id', SESSION_ID).eq('username', username).single()
  if (!player) return res.status(200).end()
  if (player.last_answered_round >= state.round_number) return res.status(200).end()

  if (player.is_blocked) {
    await supabase.from('race_players')
      .update({ is_blocked: false, last_answered_round: state.round_number })
      .eq('id', player.id)
    return res.status(200).json({ blocked: true })
  }

  const correctAnswer = state.current_answer || ''
  const isCorrect = norm === correctAnswer || norm.includes(correctAnswer)
  if (!isCorrect) return res.status(200).end()

  const isFirst = !state.first_answerer
  const advance = isFirst ? 3 : 1
  let newPos = Math.min(player.position + advance, 30)

  const landedCase = BOARD[newPos] || { type: 'normal' }
  let caseEffect = null

  if (landedCase.type === 'bonus') {
    newPos = Math.min(newPos + landedCase.value, 30)
    caseEffect = { type: 'bonus', value: landedCase.value, player: username }
  } else if (landedCase.type === 'trap') {
    newPos = Math.max(newPos + landedCase.value, 0)
    caseEffect = { type: 'trap', value: landedCase.value, player: username }
  } else if (landedCase.type === 'joker') {
    const { data: allPlayers } = await supabase
      .from('race_players').select('*')
      .eq('session_id', SESSION_ID).neq('username', username)
      .order('position', { ascending: false }).limit(1)
    if (allPlayers?.[0]) {
      await supabase.from('race_players').update({ is_blocked: true }).eq('id', allPlayers[0].id)
      caseEffect = { type: 'joker', player: username, blocked: allPlayers[0].username }
    }
  } else if (landedCase.type === 'duel') {
    const { data: allPlayers } = await supabase
      .from('race_players').select('*')
      .eq('session_id', SESSION_ID).neq('username', username)
      .order('position', { ascending: false }).limit(1)
    const opponent = allPlayers?.[0]?.username || null
    caseEffect = { type: 'duel', challenger: username, opponent }
    await supabase.from('race_state')
      .update({ duel_challenger: username, duel_opponent: opponent })
      .eq('session_id', SESSION_ID)
  }

  await supabase.from('race_players').update({
    position: newPos, last_answered_round: state.round_number, is_blocked: false
  }).eq('id', player.id)

  const stateUpdate = { updated_at: new Date().toISOString(), case_effect: caseEffect }
  if (isFirst) stateUpdate.first_answerer = username
  await supabase.from('race_state').update(stateUpdate).eq('session_id', SESSION_ID)

  if (newPos >= 30) {
    await supabase.from('race_state').update({
      status: 'finished', winner: username, updated_at: new Date().toISOString()
    }).eq('session_id', SESSION_ID)
  }

  return res.status(200).json({ correct: true, isFirst, advance, newPos, caseEffect })
}

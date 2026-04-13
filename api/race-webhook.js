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
  { id:  0, type: 'start'  },
  { id:  1, type: 'normal' },
  { id:  2, type: 'bonus',  value: 2  },
  { id:  3, type: 'normal' },
  { id:  4, type: 'wheel'  },
  { id:  5, type: 'normal' },
  { id:  6, type: 'trap',   value: -2 },
  { id:  7, type: 'normal' },
  { id:  8, type: 'joker'  },
  { id:  9, type: 'normal' },
  { id: 10, type: 'wheel'  },
  { id: 11, type: 'normal' },
  { id: 12, type: 'trap',   value: -3 },
  { id: 13, type: 'wheel'  },
  { id: 14, type: 'bonus',  value: 2  },
  { id: 15, type: 'normal' },
  { id: 16, type: 'wheel'  },
  { id: 17, type: 'trap',   value: -2 },
  { id: 18, type: 'normal' },
  { id: 19, type: 'wheel'  },
  { id: 20, type: 'bonus',  value: 2  },
  { id: 21, type: 'joker'  },
  { id: 22, type: 'normal' },
  { id: 23, type: 'wheel'  },
  { id: 24, type: 'normal' },
  { id: 25, type: 'finish' },
]

const WHEEL_SEGMENTS = [
  { id: 'blocked',  label: 'Bloqué 1 tour',          emoji: '🔒' },
  { id: 'advance1', label: 'Avance 1 case',           emoji: '⬆️' },
  { id: 'back1',    label: 'Recule 1 case',           emoji: '⬇️' },
  { id: 'first',    label: 'Passe devant tout le monde', emoji: '🚀' },
  { id: 'last',     label: 'Passe derrière tout le monde', emoji: '🐢' },
  { id: 'start',    label: 'Retour au départ',        emoji: '🏠' },
]

function normalize(str) {
  return (str || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]/g, '').trim()
}

async function applyWheelResult(player, result, allPlayers) {
  let newPos = player.position

  if (result === 'blocked') {
    await supabase.from('race_players').update({ is_blocked: true }).eq('id', player.id)
    return player.position
  }
  if (result === 'advance1') {
    newPos = Math.min(player.position + 1, 25)
  }
  if (result === 'back1') {
    newPos = Math.max(player.position - 1, 0)
  }
  if (result === 'first') {
    const maxPos = Math.max(...allPlayers.map(p => p.position))
    newPos = Math.min(maxPos + 1, 25)
  }
  if (result === 'last') {
    const minPos = Math.min(...allPlayers.map(p => p.position))
    newPos = Math.max(minPos - 1, 0)
  }
  if (result === 'start') {
    newPos = 0
  }

  await supabase.from('race_players').update({ position: newPos }).eq('id', player.id)
  return newPos
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const username = req.body?.username || ''
  const content  = req.body?.content  || ''
  if (!username || !content) return res.status(200).end()

  const norm = normalize(content)

  // ─── !join ───────────────────────────────────────────
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

  const { data: state } = await supabase
    .from('race_state').select('*').eq('session_id', SESSION_ID).single()
  if (!state) return res.status(200).end()

  // ─── DUEL EN COURS ───────────────────────────────────
  if (state.status === 'duel') {
    const isDuelPlayer = username === state.duel_challenger || username === state.duel_opponent
    if (!isDuelPlayer) return res.status(200).json({ ignored: 'not a duel participant' })

    const { data: player } = await supabase
      .from('race_players').select('*')
      .eq('session_id', SESSION_ID).eq('username', username).single()
    if (!player) return res.status(200).end()
    if (player.last_answered_round >= state.round_number) return res.status(200).end()

    const correctAnswer = state.current_answer || ''
    const isCorrect = norm === correctAnswer || norm.includes(correctAnswer)
    if (!isCorrect) return res.status(200).end()

    const loserUsername = username === state.duel_challenger ? state.duel_opponent : state.duel_challenger
    const { data: loser } = await supabase
      .from('race_players').select('*')
      .eq('session_id', SESSION_ID).eq('username', loserUsername).single()

    const winnerNewPos = Math.min((player.position || 0) + 3, 25)
    const loserNewPos  = Math.max((loser?.position || 0) - 3, 0)

    await supabase.from('race_players').update({
      position: winnerNewPos, last_answered_round: state.round_number
    }).eq('id', player.id)

    if (loser) {
      await supabase.from('race_players').update({ position: loserNewPos }).eq('id', loser.id)
    }

    const duelResult = { type: 'duel_result', winner: username, loser: loserUsername, winnerPos: winnerNewPos, loserPos: loserNewPos }

    await supabase.from('race_state').update({
      status: 'duel_result', case_effect: duelResult, first_answerer: username, updated_at: new Date().toISOString()
    }).eq('session_id', SESSION_ID)

    if (winnerNewPos >= 25) {
      await supabase.from('race_state').update({ status: 'finished', winner: username, updated_at: new Date().toISOString() }).eq('session_id', SESSION_ID)
    }

    return res.status(200).json({ duelWon: true, winner: username, loser: loserUsername })
  }

  // ─── ROUND NORMAL ─────────────────────────────────────
  if (state.status !== 'playing') return res.status(200).end()

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
  let newPos = Math.min(player.position + advance, 25)

  const landedCase = BOARD[newPos] || { type: 'normal' }
  let caseEffect = null
  let nextStatus = null

  if (landedCase.type === 'bonus') {
    newPos = Math.min(newPos + landedCase.value, 25)
    caseEffect = { type: 'bonus', value: landedCase.value, player: username }
  } else if (landedCase.type === 'trap') {
    newPos = Math.max(newPos + landedCase.value, 0)
    caseEffect = { type: 'trap', value: landedCase.value, player: username }
  } else if (landedCase.type === 'joker') {
    const dice = Math.floor(Math.random() * 6) + 1
    newPos = Math.min(newPos + dice, 25)
    caseEffect = { type: 'joker', player: username, dice, value: dice }
  } else if (landedCase.type === 'wheel') {
    // Tirage au sort du résultat
    const result = WHEEL_SEGMENTS[Math.floor(Math.random() * WHEEL_SEGMENTS.length)]
    caseEffect = { type: 'wheel', player: username, result: result.id, label: result.label, emoji: result.emoji }
    nextStatus = 'wheel'
    // Délai 1.5s pour laisser le pion se déplacer visuellement avant d'afficher la roue
    await new Promise(r => setTimeout(r, 1500))
    await supabase.from('race_state').update({
      wheel_player: username, wheel_result: result.id
    }).eq('session_id', SESSION_ID)
  }

  // Mise à jour position joueur (sauf wheel — appliqué après animation)
  if (landedCase.type !== 'wheel') {
    await supabase.from('race_players').update({
      position: newPos, last_answered_round: state.round_number, is_blocked: false
    }).eq('id', player.id)
  } else {
    await supabase.from('race_players').update({
      position: newPos, last_answered_round: state.round_number, is_blocked: false
    }).eq('id', player.id)
  }

  const stateUpdate = {
    updated_at: new Date().toISOString(),
    case_effect: caseEffect,
    ...(nextStatus && { status: nextStatus }),
  }
  if (isFirst) stateUpdate.first_answerer = username
  await supabase.from('race_state').update(stateUpdate).eq('session_id', SESSION_ID)

  if (newPos >= 25 && landedCase.type !== 'wheel') {
    await supabase.from('race_state').update({
      status: 'finished', winner: username, updated_at: new Date().toISOString()
    }).eq('session_id', SESSION_ID)
  }

  return res.status(200).json({ correct: true, isFirst, advance, newPos, caseEffect })
}

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SESSION_ID = 'bulls-race'

const BOARD = [
  { id: 0,  type: 'start'  },
  { id: 1,  type: 'normal' }, { id: 2,  type: 'bonus',  value: 2  },
  { id: 3,  type: 'normal' }, { id: 4,  type: 'normal' },
  { id: 5,  type: 'trap',   value: -2 }, { id: 6,  type: 'normal' },
  { id: 7,  type: 'duel'   }, { id: 8,  type: 'normal' }, { id: 9,  type: 'normal' },
  { id: 10, type: 'bonus',  value: 2  }, { id: 11, type: 'normal' },
  { id: 12, type: 'trap',   value: -3 }, { id: 13, type: 'wheel'  },
  { id: 14, type: 'joker'  }, { id: 15, type: 'normal' },
  { id: 16, type: 'bonus',  value: 3  }, { id: 17, type: 'normal' }, { id: 18, type: 'normal' },
  { id: 19, type: 'trap',   value: -2 }, { id: 20, type: 'normal' },
  { id: 21, type: 'duel'   }, { id: 22, type: 'normal' },
  { id: 23, type: 'bonus',  value: 2  }, { id: 24, type: 'normal' },
  { id: 25, type: 'trap',   value: -3 }, { id: 26, type: 'joker'  },
  { id: 27, type: 'normal' }, { id: 28, type: 'duel'   },
  { id: 29, type: 'trap',   value: -2 }, { id: 30, type: 'finish' },
]

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { data: state } = await supabase
    .from('race_state').select('*').eq('session_id', SESSION_ID).single()

  if (!state || state.status !== 'wheel') {
    return res.status(200).json({ ignored: true, status: state?.status })
  }

  const { wheel_player, wheel_result } = state
  if (!wheel_player || !wheel_result) return res.status(200).json({ ignored: true })

  const { data: player } = await supabase
    .from('race_players').select('*')
    .eq('session_id', SESSION_ID).eq('username', wheel_player).single()
  if (!player) return res.status(200).json({ ignored: true })

  const { data: allPlayers } = await supabase
    .from('race_players').select('*').eq('session_id', SESSION_ID)

  // Calcul de la nouvelle position selon le résultat de la roue
  let newPos = player.position

  if (wheel_result === 'blocked') {
    await supabase.from('race_players').update({ is_blocked: true }).eq('id', player.id)
    await supabase.from('race_state').update({ status: 'wheel_result', updated_at: new Date().toISOString() }).eq('session_id', SESSION_ID)
    return res.status(200).json({ success: true, result: wheel_result })
  } else if (wheel_result === 'advance1') {
    newPos = Math.min(player.position + 1, 30)
  } else if (wheel_result === 'back1') {
    newPos = Math.max(player.position - 1, 0)
  } else if (wheel_result === 'first') {
    const maxPos = Math.max(...allPlayers.map(p => p.position))
    newPos = Math.min(maxPos + 1, 30)
  } else if (wheel_result === 'last') {
    const minPos = Math.min(...allPlayers.map(p => p.position))
    newPos = Math.max(minPos - 1, 0)
  } else if (wheel_result === 'start') {
    newPos = 0
  }

  // Vérification de la case d'atterrissage
  const landedCase = BOARD[newPos] || { type: 'normal' }
  let caseEffect = { type: 'wheel', player: wheel_player, result: wheel_result, label: wheel_result, emoji: '' }

  if (landedCase.type === 'bonus') {
    newPos = Math.min(newPos + landedCase.value, 30)
    caseEffect = { ...caseEffect, landed: 'bonus', value: landedCase.value }
  } else if (landedCase.type === 'trap') {
    newPos = Math.max(newPos + landedCase.value, 0)
    caseEffect = { ...caseEffect, landed: 'trap', value: landedCase.value }
  } else if (landedCase.type === 'joker') {
    const leader = allPlayers.filter(p => p.username !== wheel_player).sort((a, b) => b.position - a.position)[0]
    if (leader) {
      await supabase.from('race_players').update({ is_blocked: true }).eq('id', leader.id)
      caseEffect = { ...caseEffect, landed: 'joker', blocked: leader.username }
    }
  }

  await supabase.from('race_players').update({ position: newPos }).eq('id', player.id)

  await supabase.from('race_state').update({
    status: 'wheel_result',
    case_effect: caseEffect,
    updated_at: new Date().toISOString()
  }).eq('session_id', SESSION_ID)

  if (newPos >= 30) {
    await supabase.from('race_state').update({
      status: 'finished', winner: wheel_player, updated_at: new Date().toISOString()
    }).eq('session_id', SESSION_ID)
  }

  return res.status(200).json({ success: true, result: wheel_result, newPos })
}

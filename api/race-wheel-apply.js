import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SESSION_ID = 'bulls-race'

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const { data: state } = await supabase
    .from('race_state').select('*').eq('session_id', SESSION_ID).single()

  console.log('[wheel-apply] status:', state?.status, 'wheel_player:', state?.wheel_player, 'wheel_result:', state?.wheel_result)

  if (!state || state.status !== 'wheel') {
    console.log('[wheel-apply] ignored - status is', state?.status)
    return res.status(200).json({ ignored: true, status: state?.status })
  }

  const { wheel_player, wheel_result } = state
  if (!wheel_player || !wheel_result) {
    console.log('[wheel-apply] ignored - missing wheel_player or wheel_result')
    return res.status(200).json({ ignored: true })
  }

  const { data: player, error: playerError } = await supabase
    .from('race_players').select('*')
    .eq('session_id', SESSION_ID).eq('username', wheel_player).single()

  console.log('[wheel-apply] player:', player?.username, 'pos:', player?.position, 'error:', playerError?.message)

  if (!player) return res.status(200).json({ ignored: true, reason: 'player not found' })

  const { data: allPlayers } = await supabase
    .from('race_players').select('*').eq('session_id', SESSION_ID)

  let newPos = player.position

  if (wheel_result === 'blocked') {
    await supabase.from('race_players').update({ is_blocked: true }).eq('id', player.id)
    console.log('[wheel-apply] blocked', wheel_player)
  } else if (wheel_result === 'advance1') {
    newPos = Math.min(player.position + 1, 30)
    await supabase.from('race_players').update({ position: newPos }).eq('id', player.id)
    console.log('[wheel-apply] advance1', wheel_player, player.position, '->', newPos)
  } else if (wheel_result === 'back1') {
    newPos = Math.max(player.position - 1, 0)
    await supabase.from('race_players').update({ position: newPos }).eq('id', player.id)
    console.log('[wheel-apply] back1', wheel_player, player.position, '->', newPos)
  } else if (wheel_result === 'first') {
    const maxPos = Math.max(...allPlayers.map(p => p.position))
    newPos = Math.min(maxPos + 1, 30)
    await supabase.from('race_players').update({ position: newPos }).eq('id', player.id)
    console.log('[wheel-apply] first', wheel_player, '->', newPos)
  } else if (wheel_result === 'last') {
    const minPos = Math.min(...allPlayers.map(p => p.position))
    newPos = Math.max(minPos - 1, 0)
    await supabase.from('race_players').update({ position: newPos }).eq('id', player.id)
    console.log('[wheel-apply] last', wheel_player, '->', newPos)
  } else if (wheel_result === 'start') {
    newPos = 0
    await supabase.from('race_players').update({ position: 0 }).eq('id', player.id)
    console.log('[wheel-apply] start', wheel_player)
  }

  await supabase.from('race_state').update({
    status: 'wheel_result',
    updated_at: new Date().toISOString()
  }).eq('session_id', SESSION_ID)

  if (newPos >= 30) {
    await supabase.from('race_state').update({
      status: 'finished', winner: wheel_player, updated_at: new Date().toISOString()
    }).eq('session_id', SESSION_ID)
  }

  console.log('[wheel-apply] done, newPos:', newPos)
  return res.status(200).json({ success: true, result: wheel_result, newPos })
}

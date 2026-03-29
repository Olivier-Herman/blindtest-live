import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const SESSION_ID = 'hangman'
const MAX_LIVES = 6
const TIMER_SECONDS = 30

const PLAYER_COLORS = ['#ff2d78','#00f5ff','#ffd700','#00ff88','#a855f7','#ff8c00','#ff3860','#7b2fff','#00ffaa','#f59e0b']

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).end()

  const body = req.body || {}
  const username = (body.username || '').toLowerCase().trim()
  const content  = (body.content  || '').trim()

  if (!username || !content) return res.status(200).json({ ignored: true })

  const { data: state } = await supabase
    .from('hangman_state').select('*').eq('session_id', SESSION_ID).single()

  if (!state) return res.status(200).json({ ignored: true })

  // ── !join ──
  if (content.toLowerCase() === '!join') {
    if (state.status !== 'waiting') return res.status(200).json({ ignored: true })

    const { data: existing } = await supabase
      .from('hangman_players').select('id').eq('session_id', SESSION_ID).eq('username', username).single()
    if (existing) return res.status(200).json({ ignored: true, reason: 'already joined' })

    const { data: players } = await supabase
      .from('hangman_players').select('id').eq('session_id', SESSION_ID)
    if ((players || []).length >= 10) return res.status(200).json({ ignored: true, reason: 'full' })

    const idx = (players || []).length
    await supabase.from('hangman_players').insert({
      session_id: SESSION_ID,
      username,
      color: PLAYER_COLORS[idx % PLAYER_COLORS.length],
      score: 0,
      order_index: idx,
    })
    return res.status(200).json({ success: true, action: 'joined' })
  }

  // ── Commandes en jeu ──
  if (state.status !== 'playing') return res.status(200).json({ ignored: true })

  const { data: players } = await supabase
    .from('hangman_players').select('*').eq('session_id', SESSION_ID).order('order_index')

  const player = players?.find(p => p.username === username)
  if (!player) return res.status(200).json({ ignored: true, reason: 'not a player' })

  const word = (state.word || '').toUpperCase()
  const guessed = state.guessed_letters || []
  const wrong   = state.wrong_letters   || []

  // ── !R réponse mot entier ──
  if (content.toUpperCase().startsWith('!R ')) {
    const guess = content.slice(3).trim().toUpperCase()
    if (!guess) return res.status(200).json({ ignored: true })

    if (guess === word) {
      // Gagnant !
      await supabase.from('hangman_players').update({ score: player.score + 20 }).eq('id', player.id)
      await supabase.from('hangman_state').update({
        status: 'won',
        winner: username,
        updated_at: new Date().toISOString()
      }).eq('session_id', SESSION_ID)
      return res.status(200).json({ success: true, action: 'word_correct', player: username })
    } else {
      // Mauvaise réponse — perd une vie
      const newLives = Math.max(0, state.lives - 1)
      const updates = { lives: newLives, updated_at: new Date().toISOString() }
      if (newLives <= 0) updates.status = 'lost'
      await supabase.from('hangman_state').update(updates).eq('session_id', SESSION_ID)
      return res.status(200).json({ success: true, action: 'word_wrong', lives: newLives })
    }
  }

  // ── !L lettre ──
  if (content.toUpperCase().startsWith('!L ')) {
    // Vérifier que c'est le tour du joueur
    const currentIdx = state.current_player_idx % players.length
    if (players[currentIdx]?.id !== player.id) {
      return res.status(200).json({ ignored: true, reason: 'not your turn' })
    }

    const letter = content.slice(3).trim().toUpperCase()
    if (!letter || letter.length !== 1 || !/[A-Z]/.test(letter)) {
      return res.status(200).json({ ignored: true, reason: 'invalid letter' })
    }
    if (guessed.includes(letter) || wrong.includes(letter)) {
      return res.status(200).json({ ignored: true, reason: 'already guessed' })
    }

    const nextPlayerIdx = (state.current_player_idx + 1) % players.length
    const timerEnd = new Date(Date.now() + TIMER_SECONDS * 1000).toISOString()

    if (word.includes(letter)) {
      // Bonne lettre
      const occurrences = word.split('').filter(l => l === letter).length
      const newGuessed = [...guessed, letter]
      await supabase.from('hangman_players').update({ score: player.score + occurrences }).eq('id', player.id)

      // Vérifier si le mot est complet
      const allLetters = word.replace(/[^A-Z]/g, '').split('')
      const allFound = allLetters.every(l => newGuessed.includes(l))

      const updates = {
        guessed_letters: newGuessed,
        current_player_idx: nextPlayerIdx,
        timer_end: timerEnd,
        updated_at: new Date().toISOString()
      }
      if (allFound) {
        updates.status = 'won'
        updates.winner = username
        await supabase.from('hangman_players').update({ score: player.score + occurrences + 20 }).eq('id', player.id)
      }
      await supabase.from('hangman_state').update(updates).eq('session_id', SESSION_ID)
      return res.status(200).json({ success: true, action: 'letter_correct', letter, occurrences })
    } else {
      // Mauvaise lettre
      const newLives = Math.max(0, state.lives - 1)
      const newWrong = [...wrong, letter]
      const updates = {
        wrong_letters: newWrong,
        lives: newLives,
        current_player_idx: nextPlayerIdx,
        timer_end: timerEnd,
        updated_at: new Date().toISOString()
      }
      if (newLives <= 0) updates.status = 'lost'
      await supabase.from('hangman_state').update(updates).eq('session_id', SESSION_ID)
      return res.status(200).json({ success: true, action: 'letter_wrong', letter, lives: newLives })
    }
  }

  return res.status(200).json({ ignored: true })
}

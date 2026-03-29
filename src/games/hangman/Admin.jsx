import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const SESSION_ID = 'hangman'
const MAX_LIVES = 6
const TIMER_SECONDS = 30
const PLAYER_COLORS = ['#ff2d78','#00f5ff','#ffd700','#00ff88','#a855f7','#ff8c00','#ff3860','#7b2fff','#00ffaa','#f59e0b']

export default function HangmanAdmin() {
  const [state,    setState]    = useState({ status: 'idle', word: '', theme: '', guessed_letters: [], wrong_letters: [], lives: MAX_LIVES, current_player_idx: 0, winner: null })
  const [players,  setPlayers]  = useState([])
  const [theme,    setTheme]    = useState('')
  const [manualWord, setManualWord] = useState('')
  const [generating, setGenerating] = useState(false)
  const [loading,  setLoading]  = useState(false)
  const [history,  setHistory]  = useState([])
  const [timer,    setTimer]    = useState(TIMER_SECONDS)

  useEffect(() => {
    loadAll()
    const ch1 = supabase.channel('hangman_admin_state')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hangman_state', filter: `session_id=eq.${SESSION_ID}` },
        p => setState(p.new))
      .subscribe()
    const ch2 = supabase.channel('hangman_admin_players')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hangman_players', filter: `session_id=eq.${SESSION_ID}` },
        () => loadPlayers())
      .subscribe()
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2) }
  }, [])

  useEffect(() => {
    let interval
    if (state.status === 'playing' && state.timer_end) {
      interval = setInterval(() => {
        const remaining = Math.max(0, Math.round((new Date(state.timer_end) - Date.now()) / 1000))
        setTimer(remaining)
        if (remaining <= 0) {
          // Timer écoulé — passer au joueur suivant
          handleTimerExpired()
          clearInterval(interval)
        }
      }, 500)
    }
    return () => clearInterval(interval)
  }, [state.status, state.timer_end])

  async function loadAll() {
    const { data: s } = await supabase.from('hangman_state').select('*').eq('session_id', SESSION_ID).single()
    if (s) setState(s)
    loadPlayers()
  }

  async function loadPlayers() {
    const { data } = await supabase.from('hangman_players').select('*').eq('session_id', SESSION_ID).order('score', { ascending: false })
    setPlayers(data || [])
  }

  async function handleTimerExpired() {
    const { data: s } = await supabase.from('hangman_state').select('*').eq('session_id', SESSION_ID).single()
    if (!s || s.status !== 'playing') return
    const { data: pl } = await supabase.from('hangman_players').select('*').eq('session_id', SESSION_ID).order('order_index')
    if (!pl || pl.length === 0) return
    const nextIdx = (s.current_player_idx + 1) % pl.length
    await supabase.from('hangman_state').update({
      current_player_idx: nextIdx,
      timer_end: new Date(Date.now() + TIMER_SECONDS * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }).eq('session_id', SESSION_ID)
  }

  async function handleOpenRegistration() {
    await supabase.from('hangman_players').delete().eq('session_id', SESSION_ID)
    await supabase.from('hangman_state').upsert({
      session_id: SESSION_ID,
      status: 'waiting',
      word: '',
      theme: '',
      guessed_letters: [],
      wrong_letters: [],
      lives: MAX_LIVES,
      current_player_idx: 0,
      winner: null,
      timer_end: null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'session_id' })
  }

  async function handleGenerateWord() {
    if (!theme.trim()) return alert('Entre un thème !')
    setGenerating(true)
    try {
      const res = await fetch('https://blindtest-live.vercel.app/api/hangman-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: theme.trim() })
      })
      const data = await res.json()
      if (data.success) {
        setManualWord(data.word)
      } else {
        alert('Erreur : ' + data.error)
      }
    } catch(e) { alert('Erreur réseau') }
    setGenerating(false)
  }

  async function handleStartGame() {
    const word = manualWord.trim().toUpperCase().replace(/[^A-Z]/g, '')
    if (!word) return alert('Génère ou entre un mot !')
    if (players.length < 1) return alert('Pas assez de joueurs !')
    setLoading(true)
    // Réordonne les joueurs par order_index
    const { data: orderedPlayers } = await supabase
      .from('hangman_players').select('*').eq('session_id', SESSION_ID).order('order_index')

    await supabase.from('hangman_state').update({
      status: 'playing',
      word,
      theme: theme.trim(),
      guessed_letters: [],
      wrong_letters: [],
      lives: MAX_LIVES,
      current_player_idx: 0,
      winner: null,
      timer_end: new Date(Date.now() + TIMER_SECONDS * 1000).toISOString(),
      updated_at: new Date().toISOString()
    }).eq('session_id', SESSION_ID)
    setHistory(prev => [...prev, { word, theme: theme.trim(), time: new Date().toLocaleTimeString() }])
    setLoading(false)
  }

  async function handleReveal() {
    await supabase.from('hangman_state').update({
      status: 'lost',
      updated_at: new Date().toISOString()
    }).eq('session_id', SESSION_ID)
  }

  async function handleNextRound() {
    setManualWord('')
    setTheme('')
    await supabase.from('hangman_state').update({
      status: 'waiting',
      word: '',
      theme: '',
      guessed_letters: [],
      wrong_letters: [],
      lives: MAX_LIVES,
      current_player_idx: 0,
      winner: null,
      timer_end: null,
      updated_at: new Date().toISOString()
    }).eq('session_id', SESSION_ID)
  }

  async function handleReset() {
    await supabase.from('hangman_players').delete().eq('session_id', SESSION_ID)
    await supabase.from('hangman_state').upsert({
      session_id: SESSION_ID, status: 'idle', word: '', theme: '',
      guessed_letters: [], wrong_letters: [], lives: MAX_LIVES,
      current_player_idx: 0, winner: null, timer_end: null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'session_id' })
    setManualWord(''); setTheme(''); setHistory([])
  }

  async function handleAdjustScore(playerId, delta) {
    const p = players.find(pl => pl.id === playerId)
    if (!p) return
    await supabase.from('hangman_players').update({ score: Math.max(0, p.score + delta) }).eq('id', playerId)
    loadPlayers()
  }

  // Affichage du mot avec cases
  const word = (state.word || '').toUpperCase()
  const guessed = state.guessed_letters || []
  const wrong   = state.wrong_letters   || []
  const currentPlayer = players.find(p => p.order_index === (state.current_player_idx % Math.max(players.length, 1)))
  const wordDisplay = word.split('').map(l => guessed.includes(l) ? l : '_').join(' ')
  const isPlaying = state.status === 'playing'
  const isOver = state.status === 'won' || state.status === 'lost'

  return (
    <div style={{ minHeight: '100vh', background: '#07070f', color: '#fff', fontFamily: "'Orbitron', monospace", padding: '0 0 40px' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        * { box-sizing: border-box; }
        .card { background: rgba(255,255,255,.03); border: 1px solid rgba(255,255,255,.08); border-radius: 12px; padding: 16px; margin-bottom: 12px; }
        .label { font-size: 9px; color: rgba(255,255,255,.3); font-family: 'Share Tech Mono'; letter-spacing: .2em; display: block; margin-bottom: 10px; text-transform: uppercase; }
        .btn { width: 100%; padding: 12px; border: none; border-radius: 8px; font-family: 'Orbitron'; font-weight: 900; font-size: 11px; letter-spacing: .1em; cursor: pointer; transition: all .2s; }
        .btn:disabled { opacity: .35; cursor: not-allowed; }
        .btn-pink { background: #ff2d78; color: #fff; }
        .btn-pink:hover:not(:disabled) { background: #ff4d8f; }
        .btn-cyan { background: rgba(0,245,255,.15); border: 1px solid rgba(0,245,255,.4); color: #00f5ff; }
        .btn-cyan:hover:not(:disabled) { background: rgba(0,245,255,.25); }
        .btn-gold { background: rgba(255,215,0,.12); border: 1px solid rgba(255,215,0,.35); color: #ffd700; }
        .btn-gold:hover:not(:disabled) { background: rgba(255,215,0,.22); }
        .btn-ghost { background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.12); color: rgba(255,255,255,.5); }
        .btn-ghost:hover:not(:disabled) { background: rgba(255,255,255,.1); }
        .btn-red { background: rgba(255,60,60,.15); border: 1px solid rgba(255,60,60,.4); color: #ff3860; }
        .inp { width: 100%; padding: 10px 12px; background: rgba(255,255,255,.05); border: 1px solid rgba(255,255,255,.1); border-radius: 8px; color: #fff; font-family: 'Share Tech Mono'; font-size: 13px; outline: none; }
        .inp:focus { border-color: rgba(255,45,120,.5); }
        .mini-btn { background: transparent; border: 1px solid rgba(255,255,255,.15); color: rgba(255,255,255,.5); padding: 3px 8px; border-radius: 5px; cursor: pointer; font-size: 12px; }
        .mini-btn:hover { border-color: rgba(255,255,255,.3); color: #fff; }
        .player-row { display: flex; align-items: center; gap: 8px; padding: 8px; border-radius: 8px; margin-bottom: 6px; background: rgba(255,255,255,.02); border: 1px solid rgba(255,255,255,.05); }
        .letter-box { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 44px; border-bottom: 2px solid rgba(255,255,255,.4); margin: 0 3px; font-size: 22px; font-weight: 900; color: #fff; position: relative; }
        .letter-box.found { border-color: #00ff88; color: #00ff88; }
      `}</style>

      {/* Header */}
      <div style={{ background: 'rgba(0,0,0,.4)', borderBottom: '1px solid rgba(255,255,255,.06)', padding: '14px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color: '#00f5ff', letterSpacing: '.2em' }}>🎯 HANGMAN</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.25)', fontFamily: 'Share Tech Mono', letterSpacing: '.2em', padding: '4px 10px', border: '1px solid rgba(255,255,255,.08)', borderRadius: 20 }}>
            {state.status === 'idle' ? 'EN ATTENTE' : state.status === 'waiting' ? 'INSCRIPTIONS' : state.status === 'playing' ? 'EN JEU' : state.status === 'won' ? 'GAGNÉ' : 'PERDU'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isPlaying && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono' }}>
              {state.lives} ❤️ · {wrong.length} erreurs
            </div>
          )}
          <button className="btn btn-ghost" style={{ width: 'auto', padding: '8px 16px', fontSize: 10 }} onClick={handleReset}>⟳ RESET</button>
        </div>
      </div>

      <div style={{ padding: '20px 24px', display: 'grid', gridTemplateColumns: '260px 1fr 280px', gap: 16, alignItems: 'start' }}>

        {/* ── Colonne gauche : Actions ── */}
        <div>
          <div className="card">
            <span className="label">📋 contrôles</span>
            <div style={{ display: 'grid', gap: 8 }}>
              {state.status === 'idle' && (
                <button className="btn btn-pink" onClick={handleOpenRegistration}>👥 OUVRIR LES INSCRIPTIONS</button>
              )}
              {state.status === 'waiting' && (
                <>
                  <div style={{ textAlign: 'center', padding: '8px 0', color: '#ffd700', fontFamily: 'Share Tech Mono', fontSize: 12 }}>
                    👥 {players.length}/10 joueurs inscrits
                  </div>
                  <div style={{ padding: '6px 10px', background: 'rgba(255,215,0,.05)', border: '1px solid rgba(255,215,0,.2)', borderRadius: 8, fontSize: 10, color: 'rgba(255,255,255,.4)', fontFamily: 'Share Tech Mono' }}>
                    Les viewers tapent <strong style={{ color: '#ffd700' }}>!join</strong>
                  </div>
                </>
              )}
              {(state.status === 'waiting' || state.status === 'idle') && (
                <>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', marginBottom: 6 }}>THÈME</div>
                    <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                      <input className="inp" placeholder="Ex: animaux, sport..." value={theme} onChange={e => setTheme(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleGenerateWord()} style={{ flex: 1 }} />
                      <button className="btn btn-cyan" style={{ width: 'auto', padding: '8px 12px', flexShrink: 0 }} onClick={handleGenerateWord} disabled={generating || !theme.trim()}>
                        {generating ? '⏳' : '🤖'}
                      </button>
                    </div>
                    {manualWord && (
                      <div style={{ padding: '8px 12px', background: 'rgba(0,255,136,.06)', border: '1px solid rgba(0,255,136,.3)', borderRadius: 8, fontFamily: 'Share Tech Mono', fontSize: 14, fontWeight: 900, color: '#00ff88', letterSpacing: 4, textAlign: 'center', marginBottom: 6 }}>
                        {manualWord}
                      </div>
                    )}
                    <input className="inp" placeholder="Ou entre le mot manuellement" value={manualWord} onChange={e => setManualWord(e.target.value.toUpperCase().replace(/[^A-Z]/g, ''))} style={{ marginBottom: 8 }} />
                  </div>
                  <button className="btn btn-pink" disabled={!manualWord || players.length === 0 || loading} onClick={handleStartGame}>
                    ▶ LANCER LA PARTIE
                  </button>
                </>
              )}
              {isPlaying && (
                <>
                  <div style={{ textAlign: 'center', padding: '10px 0' }}>
                    <div style={{ fontSize: 44, fontWeight: 900, color: timer <= 5 ? '#ff3860' : '#00f5ff', lineHeight: 1 }}>{timer}</div>
                    <div style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', marginTop: 4 }}>secondes</div>
                  </div>
                  {currentPlayer && (
                    <div style={{ padding: '8px 12px', background: `${currentPlayer.color}15`, border: `1px solid ${currentPlayer.color}40`, borderRadius: 8, textAlign: 'center' }}>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', marginBottom: 4 }}>TOUR DE</div>
                      <div style={{ fontSize: 14, fontWeight: 900, color: currentPlayer.color }}>@{currentPlayer.username}</div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', marginTop: 4 }}>!L X pour une lettre · !R MOT pour le mot</div>
                    </div>
                  )}
                  <button className="btn btn-red" onClick={handleReveal}>💀 RÉVÉLER LE MOT</button>
                </>
              )}
              {isOver && (
                <>
                  <div style={{ textAlign: 'center', padding: '12px 0' }}>
                    <div style={{ fontSize: 32, marginBottom: 8 }}>{state.status === 'won' ? '🏆' : '💀'}</div>
                    <div style={{ fontSize: 14, fontWeight: 900, color: state.status === 'won' ? '#ffd700' : '#ff3860' }}>
                      {state.status === 'won' ? `@${state.winner} a trouvé !` : 'Perdu...'}
                    </div>
                    {state.word && <div style={{ fontSize: 12, color: '#00ff88', fontFamily: 'Share Tech Mono', marginTop: 8, letterSpacing: 4 }}>{state.word}</div>}
                  </div>
                  <button className="btn btn-pink" onClick={handleNextRound}>▶ ROUND SUIVANT</button>
                </>
              )}
            </div>
          </div>

          {/* Historique des mots */}
          {history.length > 0 && (
            <div className="card">
              <span className="label">📜 historique</span>
              {history.map((h, i) => (
                <div key={i} style={{ fontSize: 10, fontFamily: 'Share Tech Mono', color: 'rgba(255,255,255,.4)', marginBottom: 4 }}>
                  <span style={{ color: 'rgba(255,255,255,.2)', marginRight: 6 }}>{h.time}</span>
                  <span style={{ color: '#00ff88' }}>{h.word}</span>
                  {h.theme && <span style={{ color: 'rgba(255,255,255,.25)', marginLeft: 6 }}>({h.theme})</span>}
                </div>
              ))}
            </div>
          )}

          {/* Webhook info */}
          <div className="card">
            <span className="label">🔗 TikFinity webhook</span>
            <div style={{ padding: '6px 8px', background: 'rgba(0,0,0,.3)', borderRadius: 6, fontFamily: 'Share Tech Mono', fontSize: 10, color: 'rgba(255,255,255,.4)', wordBreak: 'break-all' }}>
              {typeof window !== 'undefined' ? window.location.origin : ''}/api/hangman-webhook
            </div>
          </div>
        </div>

        {/* ── Colonne centrale : Mot + Pendu ── */}
        <div>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span className="label" style={{ marginBottom: 0 }}>🎯 mot à deviner</span>
              {state.theme && <div style={{ fontSize: 10, color: '#00f5ff', fontFamily: 'Share Tech Mono', letterSpacing: '.2em' }}>THÈME : {state.theme.toUpperCase()}</div>}
            </div>

            {/* Dessin du pendu */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 20 }}>
              <svg width="180" height="160" viewBox="0 0 180 160">
                {/* Potence */}
                <line x1="20" y1="150" x2="160" y2="150" stroke="rgba(255,255,255,.3)" strokeWidth="2"/>
                <line x1="60" y1="150" x2="60" y2="20" stroke="rgba(255,255,255,.3)" strokeWidth="2"/>
                <line x1="60" y1="20" x2="110" y2="20" stroke="rgba(255,255,255,.3)" strokeWidth="2"/>
                <line x1="110" y1="20" x2="110" y2="40" stroke="rgba(255,255,255,.3)" strokeWidth="2"/>
                {/* Tête */}
                {wrong.length >= 1 && <circle cx="110" cy="52" r="12" fill="none" stroke="#ff2d78" strokeWidth="2"/>}
                {/* Corps */}
                {wrong.length >= 2 && <line x1="110" y1="64" x2="110" y2="100" stroke="#ff2d78" strokeWidth="2"/>}
                {/* Bras gauche */}
                {wrong.length >= 3 && <line x1="110" y1="75" x2="90" y2="90" stroke="#ff2d78" strokeWidth="2"/>}
                {/* Bras droit */}
                {wrong.length >= 4 && <line x1="110" y1="75" x2="130" y2="90" stroke="#ff2d78" strokeWidth="2"/>}
                {/* Jambe gauche */}
                {wrong.length >= 5 && <line x1="110" y1="100" x2="90" y2="130" stroke="#ff2d78" strokeWidth="2"/>}
                {/* Jambe droite */}
                {wrong.length >= 6 && <line x1="110" y1="100" x2="130" y2="130" stroke="#ff2d78" strokeWidth="2"/>}
              </svg>
            </div>

            {/* Affichage du mot */}
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              {word ? (
                <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: 4 }}>
                  {word.split('').map((l, i) => (
                    <div key={i} className={`letter-box ${guessed.includes(l) ? 'found' : ''}`}>
                      {guessed.includes(l) ? l : ''}
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ color: 'rgba(255,255,255,.15)', fontFamily: 'Share Tech Mono', fontSize: 12 }}>En attente du mot...</div>
              )}
              {word && <div style={{ marginTop: 10, fontSize: 10, color: 'rgba(255,255,255,.25)', fontFamily: 'Share Tech Mono' }}>{word.length} lettres</div>}
            </div>

            {/* Lettres proposées */}
            {(guessed.length > 0 || wrong.length > 0) && (
              <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
                {guessed.length > 0 && (
                  <div>
                    <div style={{ fontSize: 9, color: '#00ff88', fontFamily: 'Share Tech Mono', marginBottom: 6 }}>✓ TROUVÉES</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {guessed.map(l => <span key={l} style={{ padding: '3px 8px', background: 'rgba(0,255,136,.1)', border: '1px solid rgba(0,255,136,.4)', borderRadius: 4, fontSize: 13, fontWeight: 900, color: '#00ff88', fontFamily: 'Share Tech Mono' }}>{l}</span>)}
                    </div>
                  </div>
                )}
                {wrong.length > 0 && (
                  <div>
                    <div style={{ fontSize: 9, color: '#ff3860', fontFamily: 'Share Tech Mono', marginBottom: 6 }}>✗ RATÉES</div>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {wrong.map(l => <span key={l} style={{ padding: '3px 8px', background: 'rgba(255,60,60,.1)', border: '1px solid rgba(255,60,60,.4)', borderRadius: 4, fontSize: 13, fontWeight: 900, color: '#ff3860', fontFamily: 'Share Tech Mono' }}>{l}</span>)}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Colonne droite : Joueurs ── */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span className="label" style={{ marginBottom: 0 }}>👥 joueurs ({players.length}/10)</span>
          </div>
          {players.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(255,255,255,.15)', fontFamily: 'Share Tech Mono', fontSize: 11 }}>
              Aucun joueur<br />tapent !join
            </div>
          ) : players.sort((a, b) => b.score - a.score).map((p, i) => {
            const isCurrent = isPlaying && p.order_index === (state.current_player_idx % Math.max(players.length, 1))
            return (
              <div key={p.id} className="player-row" style={{ border: isCurrent ? `1px solid ${p.color}60` : '1px solid rgba(255,255,255,.05)', background: isCurrent ? `${p.color}08` : 'rgba(255,255,255,.02)' }}>
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, flexShrink: 0, boxShadow: `0 0 6px ${p.color}` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isCurrent ? p.color : '#fff' }}>
                    {i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}@{p.username}
                    {isCurrent && <span style={{ marginLeft: 6, fontSize: 9, color: p.color, fontFamily: 'Share Tech Mono' }}>← TOUR</span>}
                  </div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', marginTop: 2 }}>
                    Ordre #{p.order_index + 1}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0 }}>
                  <button className="mini-btn" onClick={() => handleAdjustScore(p.id, -1)}>−</button>
                  <span style={{ fontSize: 13, fontWeight: 900, color: '#ffd700', minWidth: 28, textAlign: 'center' }}>{p.score}pt</span>
                  <button className="mini-btn" onClick={() => handleAdjustScore(p.id, 1)}>+</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, useRef } from 'react'
import { supabase, SESSION_ID } from '../lib/supabase'

const TIMER_DURATION = 30

export default function Admin() {
  const [gameState, setGameState]   = useState({ status: 'idle', song_title: '', song_artist: '', winner_name: '', round_number: 0 })
  const [playlist,  setPlaylist]    = useState([])
  const [scores,    setScores]      = useState([])
  const [comments,  setComments]    = useState([])
  const [timer,     setTimer]       = useState(TIMER_DURATION)
  const [newTitle,  setNewTitle]    = useState('')
  const [newArtist, setNewArtist]   = useState('')
  const [tab,       setTab]         = useState('control')
  const [loading,   setLoading]     = useState(false)
  const timerRef = useRef(null)

  useEffect(() => {
    loadAll()
    const gsChannel = supabase
      .channel('game_state_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state', filter: `session_id=eq.${SESSION_ID}` },
        payload => setGameState(payload.new))
      .subscribe()
    const scChannel = supabase
      .channel('scores_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: `session_id=eq.${SESSION_ID}` },
        () => loadScores())
      .subscribe()
    const cmChannel = supabase
      .channel('comments_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'comments', filter: `session_id=eq.${SESSION_ID}` },
        payload => setComments(prev => [payload.new, ...prev].slice(0, 40)))
      .subscribe()
    return () => {
      supabase.removeChannel(gsChannel)
      supabase.removeChannel(scChannel)
      supabase.removeChannel(cmChannel)
    }
  }, [])

  useEffect(() => {
    clearInterval(timerRef.current)
    if (gameState.status === 'playing' && gameState.timer_end) {
      timerRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.round((new Date(gameState.timer_end) - Date.now()) / 1000))
        setTimer(remaining)
        if (remaining <= 0) {
          clearInterval(timerRef.current)
          handleReveal()
        }
      }, 500)
    }
    if (gameState.status === 'idle') setTimer(TIMER_DURATION)
    if (gameState.status === 'revealed') clearInterval(timerRef.current)
    return () => clearInterval(timerRef.current)
  }, [gameState.status, gameState.timer_end])

  async function loadAll() {
    await Promise.all([loadGameState(), loadPlaylist(), loadScores(), loadComments()])
  }

  async function loadGameState() {
    const { data } = await supabase.from('game_state').select('*').eq('session_id', SESSION_ID).single()
    if (data) setGameState(data)
  }

  async function loadPlaylist() {
    const { data } = await supabase.from('playlist').select('*').eq('session_id', SESSION_ID).order('position')
    setPlaylist(data || [])
  }

  async function loadScores() {
    const { data } = await supabase.from('scores').select('*').eq('session_id', SESSION_ID).order('score', { ascending: false }).limit(10)
    setScores(data || [])
  }

  async function loadComments() {
    const { data } = await supabase.from('comments').select('*').eq('session_id', SESSION_ID).order('created_at', { ascending: false }).limit(40)
    setComments(data || [])
  }

  const nextUnplayed = playlist.find(s => !s.played)

  async function handleStart() {
    if (!nextUnplayed || loading) return
    setLoading(true)
    const timerEnd = new Date(Date.now() + TIMER_DURATION * 1000).toISOString()
    await supabase.from('game_state').update({
      status      : 'playing',
      song_title  : nextUnplayed.title,
      song_artist : nextUnplayed.artist,
      winner_name : null,
      timer_end   : timerEnd,
      round_number: (gameState.round_number || 0) + 1,
      updated_at  : new Date().toISOString()
    }).eq('session_id', SESSION_ID)
    setLoading(false)
  }

  async function handleReveal() {
    if (gameState.status === 'revealed') return
    clearInterval(timerRef.current)
    await supabase.from('game_state').update({
      status     : 'revealed',
      updated_at : new Date().toISOString()
    }).eq('session_id', SESSION_ID)
  }

  async function handleNext() {
    if (!nextUnplayed) return
    await supabase.from('playlist').update({ played: true }).eq('id', nextUnplayed.id)
    await supabase.from('game_state').update({
      status      : 'idle',
      song_title  : null,
      song_artist : null,
      winner_name : null,
      timer_end   : null,
      updated_at  : new Date().toISOString()
    }).eq('session_id', SESSION_ID)
    loadPlaylist()
  }

  async function handleAddSong() {
    if (!newTitle.trim() || !newArtist.trim()) return
    const pos = playlist.length
    await supabase.from('playlist').insert({ session_id: SESSION_ID, title: newTitle.trim(), artist: newArtist.trim(), position: pos })
    setNewTitle(''); setNewArtist('')
    loadPlaylist()
  }

  async function handleDeleteSong(id) {
    await supabase.from('playlist').delete().eq('id', id)
    loadPlaylist()
  }

  async function handleResetScores() {
    if (!confirm('Réinitialiser tout le classement et les commentaires ?')) return
    await fetch('/api/reset', { method: 'POST' })
    setScores([])
    setComments([])
  }

  async function handleResetPlaylist() {
    if (!confirm('Remettre toutes les chansons en non-jouées ?')) return
    await supabase.from('playlist').update({ played: false }).eq('session_id', SESSION_ID)
    loadPlaylist()
  }

  const timerPct = (timer / TIMER_DURATION) * 100
  const timerColor = timer > 15 ? '#00f5ff' : timer > 7 ? '#ffd700' : '#ff3860'
  const R = 42; const circ = 2 * Math.PI * R
  const dash = (timerPct / 100) * circ

  return (
    <div style={{ fontFamily: "'Orbitron', monospace", background: '#07070f', minHeight: '100vh', color: '#fff' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
        @keyframes slideIn { from{opacity:0;transform:translateY(-8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes winnerPop { 0%{transform:scale(0);opacity:0} 70%{transform:scale(1.06)} 100%{transform:scale(1);opacity:1} }
        @keyframes glowBorder { 0%,100%{box-shadow:0 0 8px rgba(255,45,120,.3)} 50%{box-shadow:0 0 22px rgba(255,45,120,.7),0 0 40px rgba(255,45,120,.2)} }
        .tab-btn { background:transparent; border:none; border-bottom:2px solid transparent; color:rgba(255,255,255,.35); padding:14px 18px; font-family:'Orbitron',monospace; font-size:10px; cursor:pointer; transition:all .2s; text-transform:uppercase; letter-spacing:2px; }
        .tab-btn.active { color:#ff2d78; border-bottom-color:#ff2d78; }
        .btn-red { background:linear-gradient(135deg,#ff2d78,#b0005f); border:none; color:#fff; padding:15px 20px; border-radius:8px; font-family:'Orbitron',monospace; font-weight:700; font-size:13px; cursor:pointer; transition:all .18s; text-transform:uppercase; letter-spacing:1px; width:100%; }
        .btn-red:hover:not(:disabled) { transform:translateY(-2px); box-shadow:0 6px 22px rgba(255,45,120,.5); }
        .btn-red:disabled { opacity:.35; cursor:not-allowed; }
        .btn-cyan { background:transparent; border:1.5px solid #00f5ff; color:#00f5ff; padding:15px 20px; border-radius:8px; font-family:'Orbitron',monospace; font-weight:700; font-size:12px; cursor:pointer; transition:all .18s; width:100%; }
        .btn-cyan:hover:not(:disabled) { background:rgba(0,245,255,.08); transform:translateY(-2px); }
        .btn-cyan:disabled { opacity:.35; cursor:not-allowed; }
        .btn-ghost { background:transparent; border:1px solid rgba(255,255,255,.15); color:rgba(255,255,255,.5); padding:10px 16px; border-radius:8px; font-family:'Share Tech Mono',monospace; font-size:12px; cursor:pointer; transition:all .18s; width:100%; }
        .btn-ghost:hover:not(:disabled) { border-color:rgba(255,255,255,.4); color:#fff; }
        .btn-ghost:disabled { opacity:.3; cursor:not-allowed; }
        .inp { background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.15); color:#fff; padding:12px 14px; border-radius:8px; font-family:'Share Tech Mono',monospace; font-size:13px; outline:none; width:100%; }
        .inp:focus { border-color:#ff2d78; }
        .inp::placeholder { color:rgba(255,255,255,.2); }
        .card { background:rgba(255,255,255,.025); border:1px solid rgba(255,255,255,.08); border-radius:12px; padding:18px; margin-bottom:14px; }
        .card-pink { background:rgba(255,45,120,.04); border:1px solid rgba(255,45,120,.25); border-radius:12px; padding:18px; margin-bottom:14px; }
        .label { font-size:9px; color:rgba(255,255,255,.3); font-family:'Share Tech Mono',monospace; letter-spacing:2.5px; text-transform:uppercase; margin-bottom:10px; display:block; }
        .scroll { overflow-y:auto; }
        .scroll::-webkit-scrollbar { width:3px; }
        .scroll::-webkit-scrollbar-thumb { background:rgba(255,45,120,.4); border-radius:2px; }
        .song-row { display:flex; align-items:center; justify-content:space-between; padding:12px 14px; border-radius:9px; margin-bottom:7px; border:1px solid rgba(255,255,255,.06); background:rgba(255,255,255,.02); transition:all .2s; }
        .song-row.active { border-color:rgba(255,45,120,.5); background:rgba(255,45,120,.07); animation:glowBorder 2s infinite; }
        .song-row.played { opacity:.3; }
        .comment-row { padding:9px 12px; border-radius:7px; margin-bottom:5px; font-family:'Share Tech Mono',monospace; font-size:12px; animation:slideIn .25s ease; }
      `}</style>

      {/* Header */}
      <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,45,120,.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,45,120,.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: 'linear-gradient(135deg,#ff2d78,#7b2fff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, boxShadow: '0 0 14px rgba(255,45,120,.5)' }}>♪</div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 14, letterSpacing: 3 }}>BLIND<span style={{ color: '#ff2d78' }}>TEST</span> LIVE</div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: 2 }}>PANNEAU ADMIN</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px', borderRadius: 20, border: `1px solid ${gameState.status === 'playing' ? 'rgba(0,245,255,.4)' : 'rgba(255,255,255,.1)'}`, background: gameState.status === 'playing' ? 'rgba(0,245,255,.06)' : 'transparent', fontSize: 10, fontFamily: 'Share Tech Mono' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: gameState.status === 'playing' ? '#00f5ff' : '#444', animation: gameState.status === 'playing' ? 'pulse 1s infinite' : 'none' }} />
          {gameState.status === 'playing' ? '🔴 EN DIRECT' : gameState.status === 'revealed' ? '✅ RÉVÉLÉ' : '⏸ STANDBY'}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,.07)', padding: '0 20px', display: 'flex', overflowX: 'auto' }}>
        {[['control','🎮 Contrôle'],['playlist','🎵 Playlist'],['scores','🏆 Classement']].map(([id, label]) => (
          <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div style={{ padding: '18px', maxWidth: 1100, margin: '0 auto' }}>

        {/* ═══ CONTROL ═══ */}
        {tab === 'control' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 16 }}>
            <div>
              <div className="card-pink">
                <span className="label">▶ chanson actuelle</span>
                {gameState.song_title ? (
                  <>
                    <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 1, marginBottom: 4 }}>{gameState.song_title}</div>
                    <div style={{ color: 'rgba(255,255,255,.45)', fontFamily: 'Share Tech Mono', fontSize: 13 }}>{gameState.song_artist}</div>
                  </>
                ) : (
                  <div style={{ color: 'rgba(255,255,255,.25)', fontFamily: 'Share Tech Mono', fontSize: 13 }}>
                    {nextUnplayed ? `Prochaine : ${nextUnplayed.title} — ${nextUnplayed.artist}` : 'Playlist vide'}
                  </div>
                )}
              </div>

              <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
                <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 }}>
                  <svg width="96" height="96" style={{ transform: 'rotate(-90deg)' }}>
                    <circle cx="48" cy="48" r={R} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="5" />
                    <circle cx="48" cy="48" r={R} fill="none" stroke={timerColor} strokeWidth="5"
                      strokeDasharray={circ} strokeDashoffset={circ - dash} strokeLinecap="round"
                      style={{ transition: 'stroke-dashoffset .9s linear, stroke .4s', filter: `drop-shadow(0 0 6px ${timerColor})` }} />
                  </svg>
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 900, color: timerColor, textShadow: `0 0 12px ${timerColor}` }}>{timer}</div>
                </div>
                <div style={{ flex: 1, fontFamily: 'Share Tech Mono', fontSize: 12, color: 'rgba(255,255,255,.4)' }}>
                  {gameState.status === 'idle' && 'Prêt à démarrer'}
                  {gameState.status === 'playing' && '⚡ Round en cours — TikFinity écoute les commentaires'}
                  {gameState.status === 'revealed' && '🎉 Réponse révélée — passe à la chanson suivante'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <button className="btn-red" disabled={!nextUnplayed || gameState.status !== 'idle' || loading} onClick={handleStart}>
                  ▶ DÉMARRER
                </button>
                <button className="btn-cyan" disabled={gameState.status !== 'playing'} onClick={handleReveal}>
                  👁 RÉVÉLER
                </button>
              </div>
              <button className="btn-ghost" disabled={gameState.status === 'playing'} onClick={handleNext}>
                ⏭ CHANSON SUIVANTE
              </button>

              {gameState.status === 'revealed' && gameState.winner_name && (
                <div style={{ marginTop: 14, background: 'rgba(255,215,0,.07)', border: '1px solid rgba(255,215,0,.4)', borderRadius: 10, padding: 16, textAlign: 'center', animation: 'winnerPop .5s ease' }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>🏆</div>
                  <div style={{ fontWeight: 900, fontSize: 17, color: '#ffd700', textShadow: '0 0 12px #ffd700' }}>@{gameState.winner_name}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', fontFamily: 'Share Tech Mono', marginTop: 5, letterSpacing: 1 }}>A TROUVÉ • +10 PTS</div>
                </div>
              )}
              {gameState.status === 'revealed' && !gameState.winner_name && (
                <div style={{ marginTop: 14, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 10, padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono' }}>Personne n'a trouvé...</div>
                </div>
              )}
            </div>

            <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                <span className="label" style={{ marginBottom: 0 }}>💬 commentaires tiktok live</span>
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,.2)', fontFamily: 'Share Tech Mono' }}>{comments.length}</span>
              </div>
              <div className="scroll" style={{ flex: 1, height: 460, overflowY: 'auto' }}>
                {comments.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '50px 10px', fontFamily: 'Share Tech Mono', fontSize: 11, color: 'rgba(255,255,255,.15)', lineHeight: 2.2 }}>
                    Les commentaires TikTok<br />arrivent ici via TikFinity<br /><span style={{ color: 'rgba(255,45,120,.4)' }}>webhook → /api/tiktok-webhook</span>
                  </div>
                ) : comments.map(c => (
                  <div key={c.id} className="comment-row" style={{ background: c.is_correct ? 'rgba(255,215,0,.07)' : 'rgba(255,255,255,.025)', border: `1px solid ${c.is_correct ? 'rgba(255,215,0,.3)' : 'rgba(255,255,255,.05)'}` }}>
                    {c.is_correct && <span style={{ marginRight: 6 }}>✅</span>}
                    <span style={{ color: c.is_correct ? '#ffd700' : '#ff2d78', fontWeight: 700 }}>@{c.username}</span>
                    <span style={{ color: 'rgba(255,255,255,.6)', marginLeft: 8 }}>{c.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══ PLAYLIST ═══ */}
        {tab === 'playlist' && (
          <div style={{ maxWidth: 680 }}>
            <div className="card">
              <span className="label">➕ ajouter une chanson</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <input className="inp" placeholder="Titre" value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddSong()} />
                <input className="inp" placeholder="Artiste" value={newArtist} onChange={e => setNewArtist(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddSong()} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <button className="btn-red" onClick={handleAddSong} style={{ padding: '11px' }}>+ AJOUTER</button>
                <button className="btn-ghost" onClick={handleResetPlaylist}>🔄 Tout remettre à zéro</button>
              </div>
            </div>

            <span className="label">{playlist.filter(s => !s.played).length} chanson(s) restante(s) sur {playlist.length}</span>

            {playlist.map((song, i) => (
              <div key={song.id} className={`song-row ${!song.played && nextUnplayed?.id === song.id ? 'active' : ''} ${song.played ? 'played' : ''}`}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 6, background: 'rgba(255,255,255,.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontFamily: 'Share Tech Mono', color: 'rgba(255,255,255,.4)' }}>
                    {song.played ? '✓' : i + 1}
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{song.title}</div>
                    <div style={{ color: 'rgba(255,255,255,.4)', fontSize: 12, fontFamily: 'Share Tech Mono', marginTop: 2 }}>{song.artist}</div>
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {!song.played && nextUnplayed?.id === song.id && <span style={{ fontSize: 9, color: '#ff2d78', fontFamily: 'Share Tech Mono', letterSpacing: 2 }}>SUIVANTE</span>}
                  <button style={{ background: 'transparent', border: '1px solid rgba(255,100,100,.3)', color: 'rgba(255,100,100,.6)', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontFamily: 'Share Tech Mono' }} onClick={() => handleDeleteSong(song.id)}>✕</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ═══ SCORES ═══ */}
        {tab === 'scores' && (
          <div style={{ maxWidth: 500 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <span className="label" style={{ marginBottom: 0 }}>🏆 classement en direct</span>
              <button className="btn-ghost" style={{ width: 'auto', padding: '7px 14px' }} onClick={handleResetScores}>🔄 Reset classement</button>
            </div>
            {scores.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,.15)', fontFamily: 'Share Tech Mono', fontSize: 12, lineHeight: 2.2 }}>
                Aucun score pour l'instant.<br />Démarrez un round !
              </div>
            ) : scores.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, background: i === 0 ? 'rgba(255,215,0,.07)' : 'rgba(255,255,255,.025)', border: `1px solid ${i === 0 ? 'rgba(255,215,0,.3)' : i === 1 ? 'rgba(192,192,192,.15)' : i === 2 ? 'rgba(205,127,50,.15)' : 'rgba(255,255,255,.06)'}`, borderRadius: 10, padding: '13px 16px', marginBottom: 8 }}>
                <div style={{ fontSize: 20, width: 30, textAlign: 'center' }}>
                  {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span style={{ fontFamily: 'Share Tech Mono', fontSize: 12, color: 'rgba(255,255,255,.3)' }}>#{i + 1}</span>}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>@{p.username}</div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', marginTop: 2 }}>{p.answers} bonne{p.answers > 1 ? 's' : ''} réponse{p.answers > 1 ? 's' : ''}</div>
                </div>
                <div style={{ fontSize: 24, fontWeight: 900, color: i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'rgba(255,255,255,.55)', textShadow: i === 0 ? '0 0 10px #ffd700' : 'none' }}>
                  {p.score}<span style={{ fontSize: 10, color: 'rgba(255,255,255,.25)', marginLeft: 2 }}>pts</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

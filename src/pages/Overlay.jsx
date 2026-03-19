import { useState, useEffect, useMemo } from 'react'
import { supabase, SESSION_ID } from '../lib/supabase'

export default function Overlay() {
  const [gameState, setGameState] = useState({ status: 'idle', song_title: '', song_artist: '', winner_name: '' })
  const [scores,    setScores]    = useState([])
  const [timer,     setTimer]     = useState(30)

  const waveCount = 38
  const waveSpeeds = useMemo(() => Array.from({ length: waveCount }, () => (0.4 + Math.random() * 0.9).toFixed(2)), [])
  const waveDelays  = useMemo(() => Array.from({ length: waveCount }, (_, i) => (i * 0.04).toFixed(2)), [])
  const waveHeights = useMemo(() => Array.from({ length: waveCount }, () => 15 + Math.random() * 80), [gameState.round_number])

  useEffect(() => {
    loadState()
    const gsChannel = supabase
      .channel('overlay_game')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'game_state', filter: `session_id=eq.${SESSION_ID}` },
        payload => setGameState(payload.new))
      .subscribe()
    const scChannel = supabase
      .channel('overlay_scores')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scores', filter: `session_id=eq.${SESSION_ID}` },
        () => loadScores())
      .subscribe()
    return () => {
      supabase.removeChannel(gsChannel)
      supabase.removeChannel(scChannel)
    }
  }, [])

  useEffect(() => {
    let interval
    if (gameState.status === 'playing' && gameState.timer_end) {
      interval = setInterval(() => {
        const remaining = Math.max(0, Math.round((new Date(gameState.timer_end) - Date.now()) / 1000))
        setTimer(remaining)
      }, 500)
    }
    if (gameState.status === 'idle') setTimer(30)
    return () => clearInterval(interval)
  }, [gameState.status, gameState.timer_end])

  async function loadState() {
    const { data: gs } = await supabase.from('game_state').select('*').eq('session_id', SESSION_ID).single()
    if (gs) setGameState(gs)
    loadScores()
  }

  async function loadScores() {
    const { data } = await supabase.from('scores').select('*').eq('session_id', SESSION_ID).order('score', { ascending: false }).limit(5)
    setScores(data || [])
  }

  const timerColor = timer > 15 ? '#7ecfff' : timer > 7 ? '#e8c96d' : '#e05555'

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', position: 'relative', fontFamily: "'Orbitron', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #000 !important; }
        @keyframes wave       { 0%,100%{transform:scaleY(0.2)} 50%{transform:scaleY(1)} }
        @keyframes qPulse     { 0%,100%{opacity:.7} 50%{opacity:1} }
        @keyframes revealIn   { 0%{transform:perspective(700px) rotateX(-90deg) scale(.9);opacity:0} 100%{transform:perspective(700px) rotateX(0deg) scale(1);opacity:1} }
        @keyframes winnerIn   { 0%{transform:scale(0) rotate(-6deg);opacity:0} 65%{transform:scale(1.07) rotate(.5deg)} 100%{transform:scale(1) rotate(0);opacity:1} }
        @keyframes fadeSlide  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes timerPulse { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
        .wbar { display:inline-block; border-radius:2px 2px 0 0; transform-origin:bottom; }
      `}</style>

      {/* Fond noir avec légère grille discrète */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />

      {/* Vignette douce */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 85% 85% at 50% 50%, transparent 45%, rgba(0,0,0,.6) 100%)', pointerEvents: 'none' }} />

      {/* Top title — blanc cassé, sobre */}
      <div style={{ position: 'absolute', top: '4vh', left: 0, right: 0, textAlign: 'center', zIndex: 20 }}>
        <div style={{ fontWeight: 900, fontSize: '4vw', letterSpacing: '0.45em', color: '#e8e8e8', textShadow: '0 0 30px rgba(255,255,255,.15)' }}>
          ♪ BLIND TEST ♪
        </div>
      </div>

      {/* Center */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
        {gameState.status !== 'revealed' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '15vw', fontWeight: 900, color: '#c8a96e', animation: 'qPulse 2.5s ease-in-out infinite', lineHeight: 1 }}>?</div>
            <div style={{ fontSize: '2vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: '0.5em', marginTop: '1.5vw', animation: 'fadeSlide .8s ease' }}>
              QUELLE EST CETTE CHANSON ?
            </div>
            {gameState.status === 'playing' && (
              <div style={{ display: 'flex', gap: '0.35vw', alignItems: 'flex-end', height: '5vw', justifyContent: 'center', marginTop: '2.5vw' }}>
                {waveHeights.map((h, i) => (
                  <div key={i} className="wbar" style={{ width: '0.45vw', height: `${h * 0.05}vw`, background: 'linear-gradient(to top, #c8a96e, #e8e8e8)', animation: `wave ${waveSpeeds[i]}s ease-in-out infinite`, animationDelay: `${waveDelays[i]}s`, opacity: .6 }} />
                ))}
              </div>
            )}
            {gameState.status === 'idle' && (
              <div style={{ marginTop: '2vw', fontSize: '1.4vw', color: 'rgba(255,255,255,.15)', fontFamily: 'Share Tech Mono', letterSpacing: '0.4em' }}>
                LE ROUND COMMENCE BIENTÔT...
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', animation: 'revealIn .7s cubic-bezier(.34,1.56,.64,1)', padding: '0 5vw' }}>
            <div style={{ fontSize: '1.4vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: '0.6em', marginBottom: '1.5vw' }}>
              ✦ LA RÉPONSE ÉTAIT ✦
            </div>
            <div style={{ fontSize: '6.5vw', fontWeight: 900, color: '#e8e8e8', textShadow: '0 0 30px rgba(255,255,255,.2)', lineHeight: 1.1, marginBottom: '0.8vw' }}>
              {gameState.song_title}
            </div>
            <div style={{ fontSize: '2.6vw', color: 'rgba(255,255,255,.4)', fontFamily: 'Share Tech Mono', letterSpacing: '0.2em' }}>
              — {gameState.song_artist}
            </div>
            {gameState.winner_name && (
              <div style={{ marginTop: '2.5vw', display: 'inline-block', padding: '1vw 3vw', background: 'rgba(200,169,110,.1)', border: '1px solid rgba(200,169,110,.4)', borderRadius: '5vw', animation: 'winnerIn .5s ease .4s both' }}>
                <span style={{ fontSize: '2vw', color: '#c8a96e', fontWeight: 900, letterSpacing: '0.15em' }}>
                  🏆 @{gameState.winner_name} A TROUVÉ !
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Timer — sobre, lisible */}
      {gameState.status === 'playing' && (
        <div style={{
          position: 'absolute', bottom: '5vh', left: '3vw', zIndex: 30,
          background: 'rgba(0,0,0,.85)',
          border: `1px solid ${timerColor}60`,
          borderRadius: '1.5vw',
          padding: '1vw 2.5vw',
          animation: timer <= 7 ? 'timerPulse .6s ease-in-out infinite' : 'fadeSlide .4s ease',
          minWidth: '13vw',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '1vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: '0.4em', marginBottom: '0.3vw' }}>TEMPS</div>
          <div style={{ fontSize: '7vw', fontWeight: 900, color: timerColor, lineHeight: 1 }}>{timer}</div>
          <div style={{ fontSize: '1vw', color: 'rgba(255,255,255,.2)', fontFamily: 'Share Tech Mono', letterSpacing: '0.3em', marginTop: '0.2vw' }}>sec</div>
        </div>
      )}

      {/* Scoreboard */}
      {scores.length > 0 && (
        <div style={{
          position: 'absolute', bottom: '5vh', right: '3vw', zIndex: 30,
          background: 'rgba(0,0,0,.85)',
          border: '1px solid rgba(200,169,110,.25)',
          borderRadius: '1.5vw',
          padding: '1.2vw 2vw',
          minWidth: '22vw',
          animation: 'fadeSlide .4s ease'
        }}>
          <div style={{ fontSize: '1vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: '0.4em', marginBottom: '1vw', textAlign: 'center' }}>
            🏆 TOP {Math.min(scores.length, 5)}
          </div>
          {scores.slice(0, 5).map((p, i) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '2vw', fontSize: '1.7vw', fontFamily: 'Share Tech Mono', marginBottom: '0.5vw', color: i === 0 ? '#c8a96e' : i === 1 ? '#aaaaaa' : i === 2 ? '#9a7a5a' : 'rgba(255,255,255,.4)' }}>
              <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`} {p.username}</span>
              <span style={{ color: 'rgba(255,255,255,.35)' }}>{p.score}pt</span>
            </div>
          ))}
        </div>
      )}

      {/* Round counter */}
      {gameState.round_number > 0 && (
        <div style={{ position: 'absolute', top: '4vh', right: '3vw', fontSize: '1.2vw', color: 'rgba(255,255,255,.15)', fontFamily: 'Share Tech Mono', letterSpacing: '0.3em', zIndex: 20 }}>
          ROUND {gameState.round_number}
        </div>
      )}
    </div>
  )
}

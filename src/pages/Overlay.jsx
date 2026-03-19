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

  // Timer live
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

  const timerColor = timer > 15 ? '#00f5ff' : timer > 7 ? '#ffd700' : '#ff3860'

  return (
    <div style={{ width: '100vw', height: '100vh', background: 'transparent', overflow: 'hidden', position: 'relative', fontFamily: "'Orbitron', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: transparent !important; }

        @keyframes wave       { 0%,100%{transform:scaleY(0.2)} 50%{transform:scaleY(1)} }
        @keyframes qPulse     { 0%,100%{filter:drop-shadow(0 0 14px #ff2d78) drop-shadow(0 0 30px rgba(255,45,120,.5))} 50%{filter:drop-shadow(0 0 32px #ff2d78) drop-shadow(0 0 60px #ff2d78)} }
        @keyframes revealIn   { 0%{transform:perspective(700px) rotateX(-90deg) scale(.9);opacity:0} 100%{transform:perspective(700px) rotateX(0deg) scale(1);opacity:1} }
        @keyframes winnerIn   { 0%{transform:scale(0) rotate(-6deg);opacity:0} 65%{transform:scale(1.07) rotate(.5deg)} 100%{transform:scale(1) rotate(0);opacity:1} }
        @keyframes scanline   { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
        @keyframes fadeSlide  { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes titleIn    { from{opacity:0;letter-spacing:0.8em} to{opacity:1;letter-spacing:0.05em} }

        .wbar { display:inline-block; border-radius:2px 2px 0 0; transform-origin:bottom; }
      `}</style>

      {/* Background grid */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,45,120,.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,45,120,.03) 1px, transparent 1px)', backgroundSize: '50px 50px' }} />

      {/* Vignette */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 80% 80% at 50% 50%, transparent 40%, rgba(0,0,0,.7) 100%)', pointerEvents: 'none' }} />

      {/* Scanline */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '15%', background: 'linear-gradient(transparent, rgba(255,45,120,.015), transparent)', animation: 'scanline 8s linear infinite', pointerEvents: 'none' }} />

      {/* Top title */}
      <div style={{ position: 'absolute', top: '4vh', left: 0, right: 0, textAlign: 'center', zIndex: 20 }}>
        <div style={{ fontWeight: 900, fontSize: '3.5vw', letterSpacing: '0.4em', color: '#ff2d78', textShadow: '0 0 20px #ff2d78, 0 0 50px rgba(255,45,120,.4)', animation: 'titleIn 1s ease' }}>
          ♪ BLIND TEST ♪
        </div>
      </div>

      {/* Center */}
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
        {gameState.status !== 'revealed' ? (
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '12vw', fontWeight: 900, color: '#ff2d78', animation: 'qPulse 2s ease-in-out infinite', lineHeight: 1 }}>?</div>
            <div style={{ fontSize: '1.6vw', color: 'rgba(255,255,255,.4)', fontFamily: 'Share Tech Mono', letterSpacing: '0.5em', marginTop: '1.5vw', animation: 'fadeSlide .8s ease' }}>
              QUELLE EST CETTE CHANSON ?
            </div>
            {gameState.status === 'playing' && (
              <div style={{ display: 'flex', gap: '0.35vw', alignItems: 'flex-end', height: '5vw', justifyContent: 'center', marginTop: '2.5vw' }}>
                {waveHeights.map((h, i) => (
                  <div key={i} className="wbar" style={{ width: '0.45vw', height: `${h * 0.05}vw`, background: `linear-gradient(to top, #ff2d78, #7b2fff)`, animation: `wave ${waveSpeeds[i]}s ease-in-out infinite`, animationDelay: `${waveDelays[i]}s`, opacity: .85 }} />
                ))}
              </div>
            )}
            {gameState.status === 'idle' && (
              <div style={{ marginTop: '2vw', fontSize: '1.1vw', color: 'rgba(255,255,255,.2)', fontFamily: 'Share Tech Mono', letterSpacing: '0.4em' }}>
                LE ROUND COMMENCE BIENTÔT...
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: 'center', animation: 'revealIn .7s cubic-bezier(.34,1.56,.64,1)' }}>
            <div style={{ fontSize: '1.1vw', color: 'rgba(255,255,255,.4)', fontFamily: 'Share Tech Mono', letterSpacing: '0.6em', marginBottom: '1.5vw' }}>
              ✦ LA RÉPONSE ÉTAIT ✦
            </div>
            <div style={{ fontSize: '5.5vw', fontWeight: 900, color: '#00f5ff', textShadow: '0 0 20px #00f5ff, 0 0 60px rgba(0,245,255,.4)', lineHeight: 1.1, marginBottom: '0.8vw' }}>
              {gameState.song_title}
            </div>
            <div style={{ fontSize: '2.2vw', color: 'rgba(255,255,255,.5)', fontFamily: 'Share Tech Mono', letterSpacing: '0.2em' }}>
              — {gameState.song_artist}
            </div>
            {gameState.winner_name && (
              <div style={{ marginTop: '2.5vw', display: 'inline-block', padding: '0.7vw 2.5vw', background: 'rgba(255,215,0,.1)', border: '1px solid rgba(255,215,0,.5)', borderRadius: '5vw', animation: 'winnerIn .5s ease .4s both' }}>
                <span style={{ fontSize: '1.5vw', color: '#ffd700', fontWeight: 900, letterSpacing: '0.15em', textShadow: '0 0 12px #ffd700' }}>
                  🏆 @{gameState.winner_name} A TROUVÉ !
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Timer (bottom left) */}
      {gameState.status === 'playing' && (
        <div style={{ position: 'absolute', bottom: '5vh', left: '3vw', zIndex: 30, background: 'rgba(0,0,0,.65)', border: `1px solid ${timerColor}40`, borderRadius: '1vw', padding: '0.7vw 1.4vw', boxShadow: `0 0 14px ${timerColor}30`, animation: 'fadeSlide .4s ease' }}>
          <div style={{ fontSize: '0.7vw', color: 'rgba(255,255,255,.35)', fontFamily: 'Share Tech Mono', letterSpacing: '0.4em', marginBottom: '0.2vw' }}>TEMPS RESTANT</div>
          <div style={{ fontSize: '2.6vw', fontWeight: 900, color: timerColor, textShadow: `0 0 10px ${timerColor}`, lineHeight: 1 }}>{timer}s</div>
        </div>
      )}

      {/* Scoreboard top 5 (bottom right) */}
      {scores.length > 0 && (
        <div style={{ position: 'absolute', bottom: '5vh', right: '3vw', zIndex: 30, background: 'rgba(0,0,0,.7)', border: '1px solid rgba(255,215,0,.2)', borderRadius: '1vw', padding: '0.9vw 1.4vw', minWidth: '15vw', animation: 'fadeSlide .4s ease' }}>
          <div style={{ fontSize: '0.65vw', color: 'rgba(255,255,255,.35)', fontFamily: 'Share Tech Mono', letterSpacing: '0.4em', marginBottom: '0.7vw' }}>🏆 TOP {Math.min(scores.length, 5)}</div>
          {scores.slice(0, 5).map((p, i) => (
            <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1.5vw', fontSize: '1.05vw', fontFamily: 'Share Tech Mono', marginBottom: '0.35vw', color: i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : 'rgba(255,255,255,.55)' }}>
              <span>{i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i + 1}`} {p.username}</span>
              <span style={{ color: 'rgba(255,255,255,.5)' }}>{p.score}pt</span>
            </div>
          ))}
        </div>
      )}

      {/* Round counter (top right) */}
      {gameState.round_number > 0 && (
        <div style={{ position: 'absolute', top: '4vh', right: '3vw', fontSize: '0.8vw', color: 'rgba(255,255,255,.2)', fontFamily: 'Share Tech Mono', letterSpacing: '0.3em', zIndex: 20 }}>
          ROUND {gameState.round_number}
        </div>
      )}
    </div>
  )
}

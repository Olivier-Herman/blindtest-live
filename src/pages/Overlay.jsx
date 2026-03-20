import { useState, useEffect, useMemo } from 'react'
import { supabase, SESSION_ID } from '../lib/supabase'

export default function Overlay() {
  const [gameState, setGameState] = useState({ status: 'idle', song_title: '', song_artist: '', winner_name: '', songs_remaining: 0, timer_duration: 30 })
  const [scores,    setScores]    = useState([])
  const [timer,     setTimer]     = useState(30)
  const [podiumStep, setPodiumStep] = useState(0) // 0=hidden, 1=3rd, 2=2nd, 3=1st, 4=full

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

  // Déclenche l'animation podium en cascade quand status = 'podium'
  useEffect(() => {
    if (gameState.status === 'podium') {
      setPodiumStep(0)
      const t1 = setTimeout(() => setPodiumStep(1), 800)
      const t2 = setTimeout(() => setPodiumStep(2), 2200)
      const t3 = setTimeout(() => setPodiumStep(3), 3800)
      const t4 = setTimeout(() => setPodiumStep(4), 5200)
      return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); clearTimeout(t4) }
    } else {
      setPodiumStep(0)
    }
  }, [gameState.status])

  useEffect(() => {
    let interval
    if (gameState.status === 'playing' && gameState.timer_end) {
      interval = setInterval(() => {
        const remaining = Math.max(0, Math.round((new Date(gameState.timer_end) - Date.now()) / 1000))
        setTimer(remaining)
      }, 500)
    }
    if (gameState.status === 'idle') setTimer(gameState.timer_duration || 30)
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

  const timerDuration    = gameState.timer_duration || 30
  const timerPct         = (timer / timerDuration) * 100
  const timerColor       = timer > timerDuration * 0.5 ? '#7ecfff' : timer > timerDuration * 0.25 ? '#e8c96d' : '#e05555'
  const ratio            = timer / timerDuration
  const availablePoints  = ratio > 0.66 ? 10 : ratio > 0.40 ? 7 : ratio > 0.15 ? 5 : 3

  const isPodium = gameState.status === 'podium'

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', position: 'relative', fontFamily: "'Orbitron', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #000 !important; }
        @keyframes wave        { 0%,100%{transform:scaleY(0.2)} 50%{transform:scaleY(1)} }
        @keyframes qPulse      { 0%,100%{opacity:.7} 50%{opacity:1} }
        @keyframes revealIn    { 0%{transform:perspective(700px) rotateX(-90deg) scale(.9);opacity:0} 100%{transform:perspective(700px) rotateX(0deg) scale(1);opacity:1} }
        @keyframes winnerIn    { 0%{transform:scale(0) rotate(-6deg);opacity:0} 65%{transform:scale(1.07) rotate(.5deg)} 100%{transform:scale(1) rotate(0);opacity:1} }
        @keyframes fadeSlide   { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
        @keyframes timerPulse  { 0%,100%{transform:scale(1)} 50%{transform:scale(1.08)} }
        @keyframes podiumBg    { from{opacity:0} to{opacity:1} }
        @keyframes riseUp      { 0%{transform:translateY(120%) scale(.8);opacity:0} 60%{transform:translateY(-8%) scale(1.04)} 100%{transform:translateY(0) scale(1);opacity:1} }
        @keyframes crownDrop   { 0%{transform:translateY(-80px) rotate(-15deg) scale(.5);opacity:0} 60%{transform:translateY(10px) rotate(5deg) scale(1.1)} 100%{transform:translateY(0) rotate(0) scale(1);opacity:1} }
        @keyframes shimmer     { 0%,100%{text-shadow:0 0 20px #ffd700,0 0 40px rgba(255,215,0,.4)} 50%{text-shadow:0 0 40px #ffd700,0 0 80px rgba(255,215,0,.7),0 0 120px rgba(255,215,0,.3)} }
        @keyframes starFloat   { 0%{transform:translateY(0) rotate(0);opacity:1} 100%{transform:translateY(-40vh) rotate(360deg);opacity:0} }
        @keyframes scanline    { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
        .wbar { display:inline-block; border-radius:2px 2px 0 0; transform-origin:bottom; }
        .podium-card { border-radius:1.5vw; padding:2.5vw 3vw; text-align:center; animation:riseUp .8s cubic-bezier(.34,1.56,.64,1) both; }
      `}</style>

      {/* Fond grille */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.02) 1px, transparent 1px)', backgroundSize: '60px 60px' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 85% 85% at 50% 50%, transparent 45%, rgba(0,0,0,.6) 100%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '12%', background: 'linear-gradient(transparent, rgba(200,169,110,.008), transparent)', animation: 'scanline 10s linear infinite', pointerEvents: 'none' }} />

      {/* ═══ ÉCRAN PODIUM ═══ */}
      {isPodium && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'radial-gradient(ellipse at 50% 30%, rgba(200,169,110,.08) 0%, #000 70%)', animation: 'podiumBg .6s ease' }}>

          {/* Étoiles flottantes déco */}
          {[...Array(12)].map((_, i) => (
            <div key={i} style={{
              position: 'absolute',
              left: `${8 + i * 7.5}%`,
              bottom: `${10 + (i % 4) * 15}%`,
              fontSize: `${1 + (i % 3) * 0.5}vw`,
              animation: `starFloat ${3 + i * 0.4}s ease-in-out ${i * 0.3}s infinite`,
              opacity: 0.4,
              pointerEvents: 'none'
            }}>
              {i % 3 === 0 ? '✦' : i % 3 === 1 ? '★' : '◆'}
            </div>
          ))}

          {/* Titre */}
          {podiumStep >= 1 && (
            <div style={{ position: 'absolute', top: '5vh', left: 0, right: 0, textAlign: 'center', animation: 'fadeSlide .6s ease' }}>
              <div style={{ fontSize: '2vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: '0.6em', marginBottom: '1vh' }}>
                ✦ FIN DE SESSION ✦
              </div>
              <div style={{ fontSize: '5vw', fontWeight: 900, color: '#c8a96e', letterSpacing: '0.3em', animation: 'shimmer 2s ease-in-out infinite' }}>
                CLASSEMENT FINAL
              </div>
            </div>
          )}

          {/* Podium */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4vw', paddingTop: '12vh' }}>

            {/* 2ème place */}
            {podiumStep >= 1 && scores[1] && (
              <div className="podium-card" style={{
                background: 'linear-gradient(135deg, rgba(180,180,180,.08), rgba(140,140,140,.04))',
                border: '1px solid rgba(192,192,192,.3)',
                animationDelay: '0s',
                minWidth: '22vw'
              }}>
                <div style={{ fontSize: '5vw', marginBottom: '1vw' }}>🥈</div>
                <div style={{ fontSize: '2.8vw', fontWeight: 900, color: '#c0c0c0', marginBottom: '0.8vw', letterSpacing: '0.05em' }}>
                  @{scores[1].username}
                </div>
                {scores[1].streak >= 2 && (
                  <div style={{ fontSize: '1.2vw', color: '#e8c96d', fontFamily: 'Share Tech Mono', marginBottom: '0.8vw' }}>🔥 ×{scores[1].streak} streak</div>
                )}
                <div style={{ fontSize: '3.5vw', fontWeight: 900, color: '#c0c0c0' }}>
                  {scores[1].score}<span style={{ fontSize: '1.5vw', color: 'rgba(255,255,255,.3)', marginLeft: '0.3vw' }}>pts</span>
                </div>
                <div style={{ fontSize: '1vw', color: 'rgba(255,255,255,.25)', fontFamily: 'Share Tech Mono', marginTop: '0.8vw' }}>
                  {scores[1].answers} bonne{scores[1].answers > 1 ? 's' : ''} rép.
                </div>
              </div>
            )}

            {/* 1ère place — plus grand, au centre */}
            {podiumStep >= 3 && scores[0] && (
              <div className="podium-card" style={{
                background: 'linear-gradient(135deg, rgba(255,215,0,.1), rgba(200,169,110,.05))',
                border: '1px solid rgba(255,215,0,.4)',
                boxShadow: '0 0 40px rgba(255,215,0,.15), 0 0 80px rgba(255,215,0,.05)',
                animationDelay: '0s',
                minWidth: '28vw',
                transform: 'scale(1.05)'
              }}>
                <div style={{ fontSize: '7vw', marginBottom: '1vw', animation: 'crownDrop .8s cubic-bezier(.34,1.56,.64,1) both' }}>🏆</div>
                <div style={{ fontSize: '3.5vw', fontWeight: 900, color: '#ffd700', marginBottom: '0.8vw', letterSpacing: '0.05em', animation: 'shimmer 2s ease-in-out infinite' }}>
                  @{scores[0].username}
                </div>
                {scores[0].streak >= 2 && (
                  <div style={{ fontSize: '1.4vw', color: '#e8c96d', fontFamily: 'Share Tech Mono', marginBottom: '0.8vw' }}>🔥 ×{scores[0].streak} streak</div>
                )}
                <div style={{ fontSize: '4.5vw', fontWeight: 900, color: '#ffd700', animation: 'shimmer 2s ease-in-out infinite' }}>
                  {scores[0].score}<span style={{ fontSize: '1.8vw', color: 'rgba(255,255,255,.4)', marginLeft: '0.3vw' }}>pts</span>
                </div>
                <div style={{ fontSize: '1.1vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', marginTop: '0.8vw' }}>
                  {scores[0].answers} bonne{scores[0].answers > 1 ? 's' : ''} rép.
                </div>
              </div>
            )}

            {/* 3ème place */}
            {podiumStep >= 2 && scores[2] && (
              <div className="podium-card" style={{
                background: 'linear-gradient(135deg, rgba(205,127,50,.08), rgba(160,100,40,.04))',
                border: '1px solid rgba(205,127,50,.3)',
                animationDelay: '0s',
                minWidth: '22vw'
              }}>
                <div style={{ fontSize: '5vw', marginBottom: '1vw' }}>🥉</div>
                <div style={{ fontSize: '2.8vw', fontWeight: 900, color: '#cd7f32', marginBottom: '0.8vw', letterSpacing: '0.05em' }}>
                  @{scores[2].username}
                </div>
                {scores[2].streak >= 2 && (
                  <div style={{ fontSize: '1.2vw', color: '#e8c96d', fontFamily: 'Share Tech Mono', marginBottom: '0.8vw' }}>🔥 ×{scores[2].streak} streak</div>
                )}
                <div style={{ fontSize: '3.5vw', fontWeight: 900, color: '#cd7f32' }}>
                  {scores[2].score}<span style={{ fontSize: '1.5vw', color: 'rgba(255,255,255,.3)', marginLeft: '0.3vw' }}>pts</span>
                </div>
                <div style={{ fontSize: '1vw', color: 'rgba(255,255,255,.25)', fontFamily: 'Share Tech Mono', marginTop: '0.8vw' }}>
                  {scores[2].answers} bonne{scores[2].answers > 1 ? 's' : ''} rép.
                </div>
              </div>
            )}
          </div>

          {/* Rounds joués en bas */}
          {podiumStep >= 4 && (
            <div style={{ position: 'absolute', bottom: '5vh', left: 0, right: 0, textAlign: 'center', animation: 'fadeSlide .6s ease' }}>
              <div style={{ fontSize: '1.3vw', color: 'rgba(255,255,255,.2)', fontFamily: 'Share Tech Mono', letterSpacing: '0.4em' }}>
                {gameState.round_number} ROUNDS JOUÉS • MERCI D'AVOIR PARTICIPÉ !
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══ ÉCRAN NORMAL ═══ */}
      {!isPodium && (
        <>
          {/* Top title */}
          <div style={{ position: 'absolute', top: '4vh', left: 0, right: 0, textAlign: 'center', zIndex: 20 }}>
            <div style={{ fontWeight: 900, fontSize: '4vw', letterSpacing: '0.45em', color: '#e8e8e8', textShadow: '0 0 30px rgba(255,255,255,.15)' }}>
              ♪ BLIND TEST ♪
            </div>
          </div>

          {/* Morceaux restants */}
          {gameState.songs_remaining > 0 && (
            <div style={{ position: 'absolute', top: '4vh', left: '3vw', zIndex: 20, fontFamily: 'Share Tech Mono', fontSize: '1.1vw', color: 'rgba(255,255,255,.25)', letterSpacing: '0.2em' }}>
              {gameState.songs_remaining} morceau{gameState.songs_remaining > 1 ? 'x' : ''} restant{gameState.songs_remaining > 1 ? 's' : ''}
            </div>
          )}

          {/* Round counter */}
          {gameState.round_number > 0 && (
            <div style={{ position: 'absolute', top: '4vh', right: '3vw', fontSize: '1.2vw', color: 'rgba(255,255,255,.15)', fontFamily: 'Share Tech Mono', letterSpacing: '0.3em', zIndex: 20 }}>
              ROUND {gameState.round_number}
            </div>
          )}

          {/* Barre de progression */}
          {gameState.status === 'playing' && (
            <div style={{ position: 'absolute', top: '13vh', left: '5vw', right: '5vw', zIndex: 20 }}>
              <div style={{ height: '0.4vw', background: 'rgba(255,255,255,.08)', borderRadius: '1vw', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${timerPct}%`, background: `linear-gradient(90deg, ${timerColor}, ${timerColor}99)`, borderRadius: '1vw', transition: 'width 0.9s linear, background 0.5s', boxShadow: `0 0 8px ${timerColor}60` }} />
              </div>
            </div>
          )}

          {/* Center */}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 20 }}>
            {gameState.status !== 'revealed' ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '15vw', fontWeight: 900, color: '#c8a96e', animation: 'qPulse 2.5s ease-in-out infinite', lineHeight: 1 }}>?</div>
                <div style={{ fontSize: '2vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: '0.5em', marginTop: '1.5vw' }}>
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
                <div style={{ fontSize: '1.4vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: '0.6em', marginBottom: '1.5vw' }}>✦ LA RÉPONSE ÉTAIT ✦</div>
                <div style={{ fontSize: '6.5vw', fontWeight: 900, color: '#e8e8e8', textShadow: '0 0 30px rgba(255,255,255,.2)', lineHeight: 1.1, marginBottom: '0.8vw' }}>
                  {gameState.song_title}
                </div>
                <div style={{ fontSize: '2.6vw', color: 'rgba(255,255,255,.4)', fontFamily: 'Share Tech Mono', letterSpacing: '0.2em' }}>— {gameState.song_artist}</div>
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

          {/* Timer + Points */}
          {gameState.status === 'playing' && (
            <div style={{ position: 'absolute', bottom: '5vh', left: '3vw', zIndex: 30, background: 'rgba(0,0,0,.85)', border: `1px solid ${timerColor}60`, borderRadius: '1.5vw', padding: '1vw 2.5vw', animation: timer <= Math.round(timerDuration * 0.15) ? 'timerPulse .6s ease-in-out infinite' : 'fadeSlide .4s ease', textAlign: 'center' }}>
              <div style={{ fontSize: '5vw', fontWeight: 900, color: timerColor, lineHeight: 1 }}>
                {availablePoints}<span style={{ fontSize: '1.5vw', color: 'rgba(255,255,255,.3)', marginLeft: '0.3vw', fontFamily: 'Share Tech Mono' }}>pts</span>
              </div>
              <div style={{ fontSize: '1.1vw', color: 'rgba(255,255,255,.25)', fontFamily: 'Share Tech Mono', letterSpacing: '0.3em', marginTop: '0.2vw' }}>{timer}s</div>
            </div>
          )}

          {/* Scoreboard */}
          {scores.length > 0 && gameState.status !== 'idle' && (
            <div style={{ position: 'absolute', bottom: '5vh', right: '3vw', zIndex: 30, background: 'rgba(0,0,0,.85)', border: '1px solid rgba(200,169,110,.25)', borderRadius: '1.5vw', padding: '1.2vw 2vw', minWidth: '22vw', animation: 'fadeSlide .4s ease' }}>
              <div style={{ fontSize: '1vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: '0.4em', marginBottom: '1vw', textAlign: 'center' }}>
                🏆 TOP {Math.min(scores.length, 5)}
              </div>
              {scores.slice(0, 5).map((p, i) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '2vw', fontSize: '1.7vw', fontFamily: 'Share Tech Mono', marginBottom: '0.5vw', color: i === 0 ? '#c8a96e' : i === 1 ? '#aaaaaa' : i === 2 ? '#9a7a5a' : 'rgba(255,255,255,.4)' }}>
                  <span>
                    {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `#${i+1}`} {p.username}
                    {p.streak >= 2 && <span style={{ fontSize: '1.1vw', color: '#e8c96d', marginLeft: '0.5vw' }}>🔥×{p.streak}</span>}
                  </span>
                  <span style={{ color: 'rgba(255,255,255,.35)' }}>{p.score}pt</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

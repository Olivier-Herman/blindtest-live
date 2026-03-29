import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const SESSION_ID = 'hangman'
const MAX_LIVES = 6

export default function HangmanOverlay() {
  const [state,   setState]   = useState({ status: 'idle', word: '', theme: '', guessed_letters: [], wrong_letters: [], lives: MAX_LIVES, current_player_idx: 0, winner: null, timer_end: null })
  const [players, setPlayers] = useState([])
  const [timer,   setTimer]   = useState(30)

  useEffect(() => {
    loadAll()
    const ch1 = supabase.channel('hangman_overlay_state')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'hangman_state', filter: `session_id=eq.${SESSION_ID}` },
        p => setState(p.new))
      .subscribe()
    const ch2 = supabase.channel('hangman_overlay_players')
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
      }, 500)
    } else { setTimer(30) }
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

  const word    = (state.word || '').toUpperCase()
  const guessed = state.guessed_letters || []
  const wrong   = state.wrong_letters   || []
  const orderedPlayers = [...players].sort((a, b) => a.order_index - b.order_index)
  const currentPlayer  = orderedPlayers[state.current_player_idx % Math.max(orderedPlayers.length, 1)]
  const isPodium  = state.status === 'won' || state.status === 'lost'
  const isWaiting = state.status === 'waiting'
  const isPlaying = state.status === 'playing'
  const livesArr  = Array.from({ length: MAX_LIVES })

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', position: 'relative', fontFamily: "'Orbitron', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #000 !important; }
        @keyframes fadeIn    { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer   { 0%,100%{text-shadow:0 0 20px #ffd700,0 0 40px rgba(255,215,0,.3)} 50%{text-shadow:0 0 40px #ffd700,0 0 80px rgba(255,215,0,.6)} }
        @keyframes letterPop { 0%{transform:scale(0) translateY(-20px);opacity:0} 60%{transform:scale(1.2) translateY(0);opacity:1} 100%{transform:scale(1);opacity:1} }
        @keyframes wrongShake{ 0%,100%{transform:translateX(0)} 20%{transform:translateX(-8px)} 40%{transform:translateX(8px)} 60%{transform:translateX(-5px)} 80%{transform:translateX(5px)} }
        @keyframes heartBeat { 0%,100%{transform:scale(1)} 50%{transform:scale(.7)} }
        @keyframes riseUp    { 0%{transform:translateY(60px) scale(.9);opacity:0} 100%{transform:translateY(0) scale(1);opacity:1} }
        @keyframes pulse     { 0%,100%{transform:scale(1)} 50%{transform:scale(1.12)} }
        @keyframes starFloat { 0%{transform:translateY(0) rotate(0);opacity:.6} 100%{transform:translateY(-50vh) rotate(360deg);opacity:0} }
        @keyframes scanline  { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
        @keyframes drawStroke{ from{stroke-dashoffset:200} to{stroke-dashoffset:0} }
        .hangman-part { stroke-dasharray: 200; stroke-dashoffset: 0; animation: drawStroke .4s ease; }
      `}</style>

      {/* Fond grille */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(0,245,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(0,245,255,.04) 1px, transparent 1px)', backgroundSize: '50px 50px', pointerEvents: 'none' }} />
      {/* Scanline */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '8%', background: 'linear-gradient(transparent, rgba(255,255,255,.003), transparent)', animation: 'scanline 12s linear infinite', pointerEvents: 'none', zIndex: 2 }} />

      {/* ══ INSCRIPTIONS ══ */}
      {isWaiting && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', animation: 'fadeIn .4s ease' }}>
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(0,245,255,.2) 0%, transparent 60%)', pointerEvents: 'none' }} />
          <div style={{ fontSize: '2vw', color: '#fff', fontFamily: 'Share Tech Mono', letterSpacing: '.5em', marginBottom: '1vh' }}>🎯 LE PENDU</div>
          <div style={{ fontSize: '7vw', fontWeight: 900, color: '#00f5ff', textShadow: '0 0 5vw rgba(0,245,255,.8)', lineHeight: 1, marginBottom: '2vh' }}>INSCRIPTIONS</div>
          <div style={{ padding: '1.5vh 4vw', background: '#ffd700', borderRadius: '1vw', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: '3vh' }}>
            <div style={{ fontSize: '3.5vw', fontWeight: 900, color: '#000', letterSpacing: '.1em' }}>TAPEZ !join DANS LE CHAT</div>
          </div>
          <div style={{ fontSize: '2vw', color: '#fff', fontFamily: 'Share Tech Mono', letterSpacing: '.3em', marginBottom: '3vh', fontWeight: 700 }}>
            {players.length} / 10 JOUEUR{players.length > 1 ? 'S' : ''} INSCRIT{players.length > 1 ? 'S' : ''}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1.5vw', maxWidth: '85vw', width: '100%' }}>
            {players.map((p, i) => (
              <div key={p.id} style={{ background: `${p.color}15`, border: `3px solid ${p.color}`, borderRadius: '1.2vw', padding: '2vh 1vw', textAlign: 'center', animation: 'riseUp .5s cubic-bezier(.34,1.56,.64,1) both', animationDelay: `${i*.08}s` }}>
                <div style={{ width: '4.5vw', height: '4.5vw', borderRadius: '50%', background: p.color, margin: '0 auto 1vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2vw', fontWeight: 900, color: '#000' }}>
                  {p.username.charAt(0).toUpperCase()}
                </div>
                <div style={{ fontSize: '1.3vw', fontWeight: 900, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>@{p.username}</div>
              </div>
            ))}
            {Array.from({ length: Math.max(0, 10 - players.length) }).map((_, i) => (
              <div key={`e${i}`} style={{ background: 'rgba(255,255,255,.03)', border: '2px dashed rgba(255,255,255,.12)', borderRadius: '1.2vw', minHeight: '10vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: '2vw', color: 'rgba(255,255,255,.1)' }}>?</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ FIN DE PARTIE ══ */}
      {isPodium && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: state.status === 'won' ? 'radial-gradient(ellipse at 50% 30%, rgba(255,215,0,.12) 0%, #000 70%)' : 'radial-gradient(ellipse at 50% 30%, rgba(255,60,60,.15) 0%, #000 70%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {state.status === 'won' && [...Array(12)].map((_,i) => (
            <div key={i} style={{ position: 'absolute', left: `${6+i*7}%`, bottom: `${5+(i%4)*15}%`, fontSize: `${1.2+(i%3)*.4}vw`, animation: `starFloat ${3+i*.3}s ease-in-out ${i*.2}s infinite`, opacity: .5, pointerEvents: 'none' }}>
              {i%3===0?'✦':'★'}
            </div>
          ))}
          <div style={{ fontSize: '2vw', color: 'rgba(255,255,255,.25)', fontFamily: 'Share Tech Mono', letterSpacing: '.6em', marginBottom: '2vh' }}>
            {state.status === 'won' ? '✦ MOT TROUVÉ ✦' : '✦ PARTIE TERMINÉE ✦'}
          </div>
          <div style={{ fontSize: state.status === 'won' ? '3vw' : '10vw', marginBottom: '2vh' }}>{state.status === 'won' ? '🏆' : '💀'}</div>
          {state.status === 'won' ? (
            <>
              <div style={{ fontSize: '5vw', fontWeight: 900, color: '#ffd700', animation: 'shimmer 1.5s infinite' }}>@{state.winner}</div>
              <div style={{ fontSize: '1.2vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: '.4em', marginTop: '1.5vh' }}>A TROUVÉ LE MOT !</div>
            </>
          ) : (
            <div style={{ fontSize: '1.5vw', color: '#ff3860', fontFamily: 'Share Tech Mono', letterSpacing: '.3em' }}>PERSONNE N'A TROUVÉ...</div>
          )}
          {word && (
            <div style={{ marginTop: '3vh', padding: '1.5vh 4vw', background: 'rgba(0,255,136,.08)', border: '1px solid rgba(0,255,136,.3)', borderRadius: '1.5vw', animation: 'riseUp .8s ease .5s both' }}>
              <div style={{ fontSize: '.9vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: '.4em', marginBottom: '.8vh', textAlign: 'center' }}>LE MOT ÉTAIT</div>
              <div style={{ fontSize: '5vw', fontWeight: 900, color: '#00ff88', letterSpacing: '.3em' }}>{word}</div>
            </div>
          )}
          {/* Classement final */}
          <div style={{ display: 'flex', gap: '2vw', marginTop: '4vh', animation: 'fadeIn .8s ease 1s both' }}>
            {[...players].sort((a,b) => b.score - a.score).slice(0, 3).map((p, i) => (
              <div key={p.id} style={{ textAlign: 'center', padding: '1.5vw 2.5vw', background: 'rgba(255,255,255,.03)', border: `1px solid ${p.color}30`, borderRadius: '1vw' }}>
                <div style={{ fontSize: '1.8vw', marginBottom: '.4vh' }}>{i===0?'🥇':i===1?'🥈':'🥉'}</div>
                <div style={{ fontSize: '1.4vw', fontWeight: 900, color: p.color }}>@{p.username}</div>
                <div style={{ fontSize: '1vw', color: '#ffd700', fontFamily: 'Share Tech Mono', marginTop: '.3vh', fontWeight: 900 }}>{p.score} pts</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ JEU NORMAL ══ */}
      {!isPodium && !isWaiting && (
        <>
          {/* Header — classement */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '7vh', background: 'rgba(0,0,0,.75)', borderBottom: '1px solid rgba(0,245,255,.15)', display: 'flex', alignItems: 'center', padding: '0 2vw', zIndex: 20, gap: '1.2vw' }}>
            <div style={{ fontSize: '1.1vw', color: '#00f5ff', fontFamily: 'Share Tech Mono', fontWeight: 900, flexShrink: 0 }}>🎯</div>
            {[...players].sort((a,b) => b.score - a.score).map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '.5vw', padding: '.3vh .8vw', borderRadius: '2vw', background: i===0?'rgba(255,215,0,.08)':'rgba(255,255,255,.04)', border: `1px solid ${i===0?'rgba(255,215,0,.3)':p.color+'40'}`, flexShrink: 0 }}>
                <div style={{ width: '.8vw', height: '.8vw', borderRadius: '50%', background: p.color }} />
                <span style={{ fontSize: '.95vw', fontWeight: 900, color: i===0?'#ffd700':'#fff', fontFamily: 'Share Tech Mono' }}>
                  {i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`} @{p.username}
                </span>
                <span style={{ fontSize: '.75vw', color: '#ffd700', fontFamily: 'Share Tech Mono', fontWeight: 900 }}>{p.score}pt</span>
              </div>
            ))}
          </div>

          {/* Zone principale */}
          <div style={{ position: 'absolute', top: '7vh', left: 0, right: 0, bottom: '18vh', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6vw', padding: '2vw' }}>

            {/* Pendu SVG */}
            <div style={{ flexShrink: 0 }}>
              <svg width="22vw" height="32vh" viewBox="0 0 220 290" style={{ overflow: 'visible' }}>
                {/* Structure */}
                <line x1="20" y1="280" x2="200" y2="280" stroke="rgba(255,255,255,.25)" strokeWidth="3" strokeLinecap="round"/>
                <line x1="60" y1="280" x2="60" y2="20" stroke="rgba(255,255,255,.25)" strokeWidth="3" strokeLinecap="round"/>
                <line x1="60" y1="20" x2="140" y2="20" stroke="rgba(255,255,255,.25)" strokeWidth="3" strokeLinecap="round"/>
                <line x1="140" y1="20" x2="140" y2="52" stroke="rgba(255,255,255,.25)" strokeWidth="3" strokeLinecap="round"/>
                {/* Tête */}
                {wrong.length >= 1 && <circle cx="140" cy="70" r="18" fill="none" stroke="#ff2d78" strokeWidth="2.5" className="hangman-part"/>}
                {/* Corps */}
                {wrong.length >= 2 && <line x1="140" y1="88" x2="140" y2="160" stroke="#ff2d78" strokeWidth="2.5" strokeLinecap="round" className="hangman-part"/>}
                {/* Bras gauche */}
                {wrong.length >= 3 && <line x1="140" y1="105" x2="108" y2="135" stroke="#ff2d78" strokeWidth="2.5" strokeLinecap="round" className="hangman-part"/>}
                {/* Bras droit */}
                {wrong.length >= 4 && <line x1="140" y1="105" x2="172" y2="135" stroke="#ff2d78" strokeWidth="2.5" strokeLinecap="round" className="hangman-part"/>}
                {/* Jambe gauche */}
                {wrong.length >= 5 && <line x1="140" y1="160" x2="108" y2="210" stroke="#ff2d78" strokeWidth="2.5" strokeLinecap="round" className="hangman-part"/>}
                {/* Jambe droite */}
                {wrong.length >= 6 && <line x1="140" y1="160" x2="172" y2="210" stroke="#ff2d78" strokeWidth="2.5" strokeLinecap="round" className="hangman-part"/>}
              </svg>

              {/* Vies */}
              <div style={{ display: 'flex', justifyContent: 'center', gap: '.5vw', marginTop: '1vh' }}>
                {livesArr.map((_, i) => (
                  <div key={i} style={{ fontSize: '2.2vw', opacity: i < state.lives ? 1 : .15, animation: i === state.lives ? 'heartBeat .4s ease' : 'none' }}>❤️</div>
                ))}
              </div>
            </div>

            {/* Centre — mot + thème */}
            <div style={{ flex: 1, textAlign: 'center' }}>
              {/* Thème */}
              {state.theme && (
                <div style={{ marginBottom: '3vh', animation: 'fadeIn .6s ease' }}>
                  <div style={{ fontSize: '1vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: '.5em', marginBottom: '.8vh' }}>INDICE — THÈME</div>
                  <div style={{ fontSize: '3.5vw', fontWeight: 900, color: '#00f5ff', textShadow: '0 0 3vw rgba(0,245,255,.5)', letterSpacing: '.15em' }}>{state.theme.toUpperCase()}</div>
                </div>
              )}

              {/* Mot */}
              <div style={{ display: 'flex', justifyContent: 'center', flexWrap: 'wrap', gap: '.8vw', marginBottom: '3vh' }}>
                {word ? word.split('').map((l, i) => {
                  const isFound = guessed.includes(l)
                  return (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '.4vh' }}>
                      <div style={{ fontSize: '5vw', fontWeight: 900, color: isFound ? '#00ff88' : 'transparent', textShadow: isFound ? '0 0 2vw rgba(0,255,136,.4)' : 'none', minWidth: '4vw', textAlign: 'center', animation: isFound ? 'letterPop .4s cubic-bezier(.34,1.56,.64,1)' : 'none' }}>
                        {isFound ? l : ''}
                      </div>
                      <div style={{ width: '4vw', height: '3px', background: isFound ? '#00ff88' : 'rgba(255,255,255,.4)', borderRadius: 2 }} />
                    </div>
                  )
                }) : (
                  <div style={{ color: 'rgba(255,255,255,.15)', fontFamily: 'Share Tech Mono', fontSize: '1.5vw' }}>EN ATTENTE...</div>
                )}
              </div>

              {/* Lettres incorrectes */}
              {wrong.length > 0 && (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '.6vw', flexWrap: 'wrap', animation: 'wrongShake .4s ease' }}>
                  {wrong.map(l => (
                    <div key={l} style={{ width: '3.5vw', height: '3.5vw', borderRadius: '.5vw', background: 'rgba(255,60,60,.1)', border: '2px solid rgba(255,60,60,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2vw', fontWeight: 900, color: '#ff3860' }}>{l}</div>
                  ))}
                </div>
              )}

              {/* Nb lettres */}
              {word && (
                <div style={{ marginTop: '2vh', fontSize: '1vw', color: 'rgba(255,255,255,.2)', fontFamily: 'Share Tech Mono', letterSpacing: '.3em' }}>
                  {word.length} LETTRES · {guessed.length} TROUVÉES · {wrong.length} ERREURS
                </div>
              )}
            </div>
          </div>

          {/* Barre bas */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '18vh', background: 'rgba(0,0,0,.88)', borderTop: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', padding: '0 3vw', zIndex: 25, gap: '3vw' }}>
            {isPlaying && currentPlayer && (
              <>
                {/* Timer */}
                <div style={{ flexShrink: 0, textAlign: 'center', minWidth: '6vw' }}>
                  <div style={{ fontSize: '5.5vw', fontWeight: 900, color: timer<=5?'#ff3860':'#00f5ff', lineHeight: 1, animation: timer<=5?'pulse .5s infinite':'none' }}>{timer}</div>
                  <div style={{ fontSize: '.9vw', color: '#fff', fontFamily: 'Share Tech Mono' }}>SEC</div>
                </div>
                <div style={{ width: 1, height: '60%', background: 'rgba(255,255,255,.1)' }} />
                {/* Joueur actuel */}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '1vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: '.3em', marginBottom: '.5vh' }}>C'EST LE TOUR DE</div>
                  <div style={{ fontSize: '3vw', fontWeight: 900, color: currentPlayer.color, textShadow: `0 0 2vw ${currentPlayer.color}60` }}>@{currentPlayer.username}</div>
                </div>
                {/* Instructions */}
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <div style={{ marginBottom: '1vh', padding: '.6vh 1.2vw', background: 'rgba(0,245,255,.08)', border: '1px solid rgba(0,245,255,.25)', borderRadius: '.6vw' }}>
                    <div style={{ fontSize: '1.1vw', fontFamily: 'Share Tech Mono', color: '#00f5ff', letterSpacing: '.1em' }}>!L E — proposer une lettre</div>
                  </div>
                  <div style={{ padding: '.6vh 1.2vw', background: 'rgba(255,215,0,.08)', border: '1px solid rgba(255,215,0,.25)', borderRadius: '.6vw' }}>
                    <div style={{ fontSize: '1.1vw', fontFamily: 'Share Tech Mono', color: '#ffd700', letterSpacing: '.1em' }}>!R MOT — proposer le mot entier</div>
                  </div>
                </div>
              </>
            )}
            {state.status === 'idle' && (
              <div style={{ flex: 1, textAlign: 'center', color: '#fff', fontFamily: 'Share Tech Mono', fontSize: '2vw', letterSpacing: '.3em', fontWeight: 900 }}>
                🎯 LE PENDU — EN ATTENTE...
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

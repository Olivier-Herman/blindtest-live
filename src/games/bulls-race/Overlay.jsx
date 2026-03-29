import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

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

// Grille serpentine : case id → [col, row] (row 0 = haut, row 4 = bas)
const GRID = {}
// Row 4 (bas): cases 1-6 gauche→droite
;[1,2,3,4,5,6].forEach((id, i) => { GRID[id] = [i, 4] })
// Row 3: cases 7-12 droite→gauche
;[7,8,9,10,11,12].forEach((id, i) => { GRID[id] = [5-i, 3] })
// Row 2: cases 13-18 gauche→droite
;[13,14,15,16,17,18].forEach((id, i) => { GRID[id] = [i, 2] })
// Row 1: cases 19-24 droite→gauche
;[19,20,21,22,23,24].forEach((id, i) => { GRID[id] = [5-i, 1] })
// Row 0 (haut): cases 25-30 gauche→droite
;[25,26,27,28,29,30].forEach((id, i) => { GRID[id] = [i, 0] })

const CASE_BG    = { normal: 'rgba(255,255,255,.06)', bonus: 'rgba(255,215,0,.18)', trap: 'rgba(255,60,60,.2)', duel: 'rgba(123,47,255,.25)', joker: 'rgba(0,245,255,.18)', wheel: 'rgba(168,85,247,.2)', finish: 'rgba(200,169,110,.3)' }
const CASE_BORDER= { normal: 'rgba(255,255,255,.12)', bonus: 'rgba(255,215,0,.5)',  trap: 'rgba(255,60,60,.5)',  duel: 'rgba(123,47,255,.6)',  joker: 'rgba(0,245,255,.5)',  wheel: 'rgba(168,85,247,.8)', finish: 'rgba(200,169,110,.8)' }
const CASE_ICON  = { normal: '', bonus: '⭐', trap: '💀', duel: '⚔️', joker: '🃏', wheel: '🎡', finish: '🏁' }

// Board area: left 23vw panel + right 77vw board
// Board occupies rows: top 8vh header, 10vh bottom bar → 82vh for board
// Cell: 77/6 = 12.83vw wide, 82/5 = 16.4vh tall
const BOARD_LEFT = 23   // vw
const BOARD_TOP  = 9    // vh  (header height)
const CELL_W     = (100 - BOARD_LEFT) / 6   // vw
const CELL_H     = (100 - BOARD_TOP - 13) / 5 // vh  (13vh = bottom bar)

function cellCenter(caseId) {
  if (caseId === 0) return { x: 11, y: 88 } // Start marker, bottom of left panel
  const [col, row] = GRID[caseId] || [0, 4]
  return {
    x: BOARD_LEFT + col * CELL_W + CELL_W / 2,
    y: BOARD_TOP  + row * CELL_H + CELL_H / 2
  }
}

export default function BullsRaceOverlay() {
  const [state,   setState]   = useState({ status: 'idle', current_question: '', current_answer: '', round_number: 0, first_answerer: null, case_effect: null, winner: null })
  const [players, setPlayers] = useState([])
  const [timer,   setTimer]   = useState(30)
  const [effect,  setEffect]  = useState(null) // popup effect notification
  const effectTimerRef = useRef(null)

  useEffect(() => {
    if (state.status === 'rules') {
      window.speechSynthesis.cancel()
      const text = `Bienvenue dans Bulls Race ! Voici les règles du jeu. 
      L'objectif est simple : soyez le premier à atteindre la case 30 en répondant correctement aux questions.
      Le premier joueur à trouver la bonne réponse avance de 3 cases. Les autres joueurs qui trouvent avancent d'une case.
      Attention aux cases spéciales ! La case Bonus vous fait avancer de 2 à 3 cases supplémentaires.
      La case Piège vous fait reculer de 2 à 3 cases. Aïe !
      La case Duel vous confronte au joueur en tête. Le prochain à répondre correctement remporte le duel.
      Et enfin, la case Joker vous permet de bloquer le joueur en tête pendant un round entier.
      Pour rejoindre la partie, tapez point d'exclamation join dans le chat TikTok. Bonne chance à tous !`
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = 'fr-FR'
      utterance.rate = 0.95
      utterance.pitch = 1
      utterance.volume = 1
      const voices = window.speechSynthesis.getVoices()
      const frVoice = voices.find(v => v.lang === 'fr-FR' || v.lang.startsWith('fr'))
      if (frVoice) utterance.voice = frVoice
      window.speechSynthesis.speak(utterance)
    } else {
      window.speechSynthesis.cancel()
    }
  }, [state.status])

  useEffect(() => {
    // Load voices and retry speech if rules already active
    window.speechSynthesis.onvoiceschanged = () => {
      if (state.status === 'rules') {
        window.speechSynthesis.cancel()
        const text = `Bienvenue dans Bulls Race ! L'objectif est d'atteindre la case 30 en répondant aux questions. Le premier à répondre avance de 3 cases, les suivants d'une case. Attention aux cases spéciales : Bonus, Piège, Duel et Joker. Tapez point d'exclamation join dans le chat pour rejoindre !`
        const utterance = new SpeechSynthesisUtterance(text)
        utterance.lang = 'fr-FR'
        utterance.rate = 0.95
        const voices = window.speechSynthesis.getVoices()
        const frVoice = voices.find(v => v.lang === 'fr-FR' || v.lang.startsWith('fr'))
        if (frVoice) utterance.voice = frVoice
        window.speechSynthesis.speak(utterance)
      }
    }
  }, [state.status])

  useEffect(() => {
    loadAll()
    const ch1 = supabase.channel('overlay_race_state')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'race_state', filter: `session_id=eq.${SESSION_ID}` },
        p => { setState(p.new); triggerEffect(p.new.case_effect) })
      .subscribe()
    const ch2 = supabase.channel('overlay_race_players')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'race_players', filter: `session_id=eq.${SESSION_ID}` },
        () => loadPlayers())
      .subscribe()
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2) }
  }, [])

  useEffect(() => {
    let interval
    if (state.status === 'playing') {
      interval = setInterval(() => {
        setTimer(t => Math.max(0, t - 1))
      }, 1000)
    } else {
      setTimer(30)
    }
    return () => clearInterval(interval)
  }, [state.status])

  function triggerEffect(raw) {
    if (!raw) return
    const e = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!e) return
    clearTimeout(effectTimerRef.current)
    setEffect(e)
    effectTimerRef.current = setTimeout(() => setEffect(null), 7000)
  }

  async function loadAll() {
    const { data: s } = await supabase.from('race_state').select('*').eq('session_id', SESSION_ID).single()
    if (s) setState(s)
    loadPlayers()
  }
  async function loadPlayers() {
    const { data } = await supabase.from('race_players').select('*').eq('session_id', SESSION_ID).order('position', { ascending: false })
    setPlayers(data || [])
  }

  const isPodium = state.status === 'finished'
  const isPlaying = state.status === 'playing'
  const isRevealed = state.status === 'revealed' || state.status === 'duel_result' || state.status === 'wheel_result'
  const isWaiting = state.status === 'waiting'

  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000', overflow: 'hidden', position: 'relative', fontFamily: "'Orbitron', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #000 !important; }
        @keyframes fadeIn   { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes pawnMove { 0%{transform:scale(1)} 50%{transform:scale(1.6)} 100%{transform:scale(1)} }
        @keyframes effectIn { 0%{transform:scale(.7) translateY(-20px);opacity:0} 70%{transform:scale(1.05) translateY(0);opacity:1} 100%{transform:scale(1);opacity:1} }
        @keyframes effectOut{ from{opacity:1;transform:scale(1)} to{opacity:0;transform:scale(.9)} }
        @keyframes shimmer  { 0%,100%{text-shadow:0 0 20px #ffd700,0 0 40px rgba(255,215,0,.3)} 50%{text-shadow:0 0 40px #ffd700,0 0 80px rgba(255,215,0,.6)} }
        @keyframes qPulse   { 0%,100%{opacity:.7} 50%{opacity:1} }
        @keyframes riseUp   { 0%{transform:translateY(60px) scale(.9);opacity:0} 100%{transform:translateY(0) scale(1);opacity:1} }
        @keyframes pulse    { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }
        @keyframes scanline { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
        @keyframes starFloat{ 0%{transform:translateY(0) rotate(0);opacity:.6} 100%{transform:translateY(-50vh) rotate(360deg);opacity:0} }
        .pawn-wrapper { position: absolute; display: flex; flex-direction: column; align-items: center; transition: left .8s cubic-bezier(.34,1.56,.64,1), top .8s cubic-bezier(.34,1.56,.64,1); z-index: 30; }
        .pawn { border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.1vw; font-weight: 900; position: relative; }
        .pawn-label { font-family: 'Share Tech Mono', monospace; font-size: .65vw; font-weight: 900; text-align: center; margin-top: .2vw; white-space: nowrap; text-shadow: 0 0 4px rgba(0,0,0,.8); }
        @keyframes pawnBounce { 0%{transform:scale(1) translateY(0)} 30%{transform:scale(1.5) translateY(-1vw)} 50%{transform:scale(1.2) translateY(-.2vw)} 70%{transform:scale(1.4) translateY(-.6vw)} 85%{transform:scale(1.1) translateY(-.1vw)} 100%{transform:scale(1) translateY(0)} }
        @keyframes trailFade { 0%{opacity:.7;transform:scale(1)} 100%{opacity:0;transform:scale(.3)} }
        @keyframes wheelSpin { 0%{transform:rotate(0deg)} 100%{transform:rotate(var(--spin-deg))} }
        @keyframes wheelSpinInfinite { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        @keyframes wheelGlow { 0%,100%{box-shadow:0 0 30px rgba(168,85,247,.4),0 0 60px rgba(168,85,247,.2)} 50%{box-shadow:0 0 60px rgba(168,85,247,.8),0 0 120px rgba(168,85,247,.4)} }
        @keyframes wheelResult { 0%{transform:scale(0) rotate(-10deg);opacity:0} 60%{transform:scale(1.15) rotate(3deg);opacity:1} 100%{transform:scale(1) rotate(0)} }
        @keyframes wheelBgPulse { 0%,100%{background:radial-gradient(ellipse at 50% 50%, rgba(168,85,247,.2) 0%, rgba(0,0,0,.9) 70%)} 50%{background:radial-gradient(ellipse at 50% 50%, rgba(168,85,247,.35) 0%, rgba(0,0,0,.9) 70%)} }

        /* ═══ EFFECT ANIMATIONS ═══ */
        @keyframes effectBgIn   { from{opacity:0} to{opacity:1} }
        @keyframes effectBgOut  { from{opacity:1} to{opacity:0} }
        @keyframes bonusExplode { 0%{transform:scale(0) rotate(-10deg);opacity:0} 60%{transform:scale(1.15) rotate(3deg);opacity:1} 80%{transform:scale(.97) rotate(-1deg)} 100%{transform:scale(1) rotate(0)} }
        @keyframes bonusStar    { 0%{transform:scale(0) rotate(0deg);opacity:1} 100%{transform:scale(3) rotate(720deg);opacity:0} }
        @keyframes bonusFloat   { 0%{transform:translateY(0) rotate(0) scale(1);opacity:1} 100%{transform:translateY(-60vh) rotate(360deg) scale(.5);opacity:0} }
        @keyframes trapShake    { 0%,100%{transform:translateX(0) rotate(0)} 10%{transform:translateX(-3vw) rotate(-2deg)} 20%{transform:translateX(3vw) rotate(2deg)} 30%{transform:translateX(-2vw) rotate(-1deg)} 40%{transform:translateX(2vw) rotate(1deg)} 50%{transform:translateX(-1vw)} 60%{transform:translateX(1vw)} 70%{transform:translateX(-.5vw)} 80%{transform:translateX(.5vw)} 90%{transform:translateX(0)} }
        @keyframes trapFlash    { 0%,100%{opacity:0} 10%,30%,50%{opacity:.6} 20%,40%,60%{opacity:0} }
        @keyframes trapFall     { 0%{transform:translateY(-10vh) rotate(0) scale(.5);opacity:0} 30%{opacity:1} 100%{transform:translateY(110vh) rotate(720deg) scale(1.5);opacity:.3} }
        @keyframes trapSkull    { 0%{transform:scale(0) rotate(-20deg)} 40%{transform:scale(1.3) rotate(5deg)} 70%{transform:scale(.9) rotate(-2deg)} 100%{transform:scale(1) rotate(0)} }
        @keyframes duelSlideL   { 0%{transform:translateX(-100vw) skewX(-10deg);opacity:0} 100%{transform:translateX(0) skewX(-10deg);opacity:1} }
        @keyframes duelSlideR   { 0%{transform:translateX(100vw) skewX(10deg);opacity:0} 100%{transform:translateX(0) skewX(10deg);opacity:1} }
        @keyframes duelVS       { 0%{transform:scale(0) rotate(-15deg);opacity:0} 50%{transform:scale(1.4) rotate(5deg);opacity:1} 70%{transform:scale(.9) rotate(-2deg)} 100%{transform:scale(1) rotate(0)} }
        @keyframes duelSpark    { 0%{transform:scale(0);opacity:1} 100%{transform:scale(4);opacity:0} }
        @keyframes jokerFlip    { 0%{transform:perspective(800px) rotateY(-180deg) scale(.5);opacity:0} 50%{transform:perspective(800px) rotateY(-90deg) scale(1.1)} 100%{transform:perspective(800px) rotateY(0deg) scale(1);opacity:1} }
        @keyframes jokerChain   { 0%{transform:translateY(-5px) rotate(-3deg)} 100%{transform:translateY(5px) rotate(3deg)} }
        @keyframes jokerGlow    { 0%,100%{box-shadow:0 0 30px rgba(0,245,255,.4), 0 0 60px rgba(0,245,255,.2)} 50%{box-shadow:0 0 60px rgba(0,245,255,.8), 0 0 120px rgba(0,245,255,.4)} }
        @keyframes bigTextIn    { 0%{transform:scale(0) translateY(30px);opacity:0} 60%{transform:scale(1.1) translateY(-5px);opacity:1} 100%{transform:scale(1) translateY(0);opacity:1} }
        @keyframes subTextIn    { from{opacity:0;transform:translateY(15px)} to{opacity:1;transform:translateY(0)} }
        @keyframes confetti     { 0%{transform:translateY(-10vh) rotate(0) scaleX(1);opacity:1} 100%{transform:translateY(110vh) rotate(720deg) scaleX(-1);opacity:.2} }
      `}</style>

      {/* Background grid */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.018) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.018) 1px, transparent 1px)', backgroundSize: '50px 50px', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse 90% 90% at 50% 50%, transparent 50%, rgba(0,0,0,.5) 100%)', pointerEvents: 'none' }} />
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '12%', background: 'linear-gradient(transparent, rgba(200,169,110,.006), transparent)', animation: 'scanline 12s linear infinite', pointerEvents: 'none' }} />

      {/* ═══ PODIUM / VICTOIRE ═══ */}
      {isPodium && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'radial-gradient(ellipse at 50% 30%, rgba(200,169,110,.1) 0%, #000 70%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
          {[...Array(14)].map((_, i) => (
            <div key={i} style={{ position: 'absolute', left: `${6 + i * 6.5}%`, bottom: `${5 + (i%4)*18}%`, fontSize: `${1.2 + (i%3)*.4}vw`, animation: `starFloat ${3+i*.3}s ease-in-out ${i*.25}s infinite`, opacity: .5, pointerEvents: 'none' }}>
              {i%3===0?'✦':i%3===1?'★':'◆'}
            </div>
          ))}
          <div style={{ fontSize: '2vw', color: 'rgba(255,255,255,.25)', fontFamily: 'Share Tech Mono', letterSpacing: '0.6em', marginBottom: '2vh', animation: 'fadeIn .8s ease' }}>
            ✦ FIN DE LA PARTIE ✦
          </div>
          <div style={{ fontSize: '6vw', fontWeight: 900, color: '#c8a96e', letterSpacing: '0.25em', animation: 'shimmer 2s infinite' }}>
            BULLS RACE
          </div>
          <div style={{ marginTop: '4vh', animation: 'riseUp .8s ease .5s both' }}>
            <div style={{ textAlign: 'center', background: 'rgba(200,169,110,.08)', border: '1px solid rgba(200,169,110,.4)', borderRadius: '2vw', padding: '3vw 5vw' }}>
              <div style={{ fontSize: '3vw', marginBottom: '1.5vh' }}>🏆</div>
              <div style={{ fontSize: '4.5vw', fontWeight: 900, color: '#ffd700', animation: 'shimmer 1.5s infinite' }}>
                @{state.winner}
              </div>
              <div style={{ fontSize: '1.2vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: '.4em', marginTop: '1.2vh' }}>
                A GAGNÉ LA BULLS RACE !
              </div>
            </div>
          </div>
          {/* Top 3 */}
          <div style={{ display: 'flex', gap: '2vw', marginTop: '4vh', animation: 'fadeIn .8s ease 1s both' }}>
            {players.slice(0, 3).map((p, i) => (
              <div key={p.id} style={{ textAlign: 'center', padding: '1.5vw 2.5vw', background: 'rgba(255,255,255,.03)', border: `1px solid ${p.color}30`, borderRadius: '1vw' }}>
                <div style={{ fontSize: '1.8vw', marginBottom: '.4vh' }}>{i===0?'🥇':i===1?'🥈':'🥉'}</div>
                <div style={{ fontSize: '1.5vw', fontWeight: 900, color: p.color }}>@{p.username}</div>
                <div style={{ fontSize: '.9vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', marginTop: '.3vh' }}>Case {p.position}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ═══ ÉCRAN INSCRIPTIONS ═══ */}
      {state.status === 'waiting' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: '#000', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2vw', animation: 'fadeIn .4s ease' }}>
          {/* Fond coloré */}
          <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 0%, rgba(255,45,120,.25) 0%, transparent 60%)', pointerEvents: 'none' }} />

          {/* Titre */}
          <div style={{ textAlign: 'center', marginBottom: '3vh' }}>
            <div style={{ fontSize: '2vw', color: '#fff', fontFamily: 'Share Tech Mono', letterSpacing: '.5em', marginBottom: '1vh', fontWeight: 700 }}>🎲 BULLS RACE</div>
            <div style={{ fontSize: '7vw', fontWeight: 900, color: '#ff2d78', letterSpacing: '.15em', textShadow: '0 0 5vw rgba(255,45,120,.8)', lineHeight: 1 }}>INSCRIPTIONS</div>
          </div>

          {/* Call to action — très visible */}
          <div style={{ marginBottom: '4vh', padding: '1.5vh 4vw', background: '#ffd700', borderRadius: '1vw', animation: 'pulse 1.5s ease-in-out infinite' }}>
            <div style={{ fontSize: '3.5vw', fontWeight: 900, color: '#000', letterSpacing: '.1em', textAlign: 'center' }}>
              TAPEZ !join DANS LE CHAT
            </div>
          </div>

          {/* Compteur joueurs */}
          <div style={{ fontSize: '2vw', color: '#fff', fontFamily: 'Share Tech Mono', letterSpacing: '.3em', marginBottom: '3vh', fontWeight: 700 }}>
            {players.length} / 10 JOUEUR{players.length > 1 ? 'S' : ''} INSCRIT{players.length > 1 ? 'S' : ''}
          </div>

          {/* Grille joueurs */}
          <div style={{ width: '100%', maxWidth: '85vw' }}>
            {players.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '3vh 0', color: '#fff', fontFamily: 'Share Tech Mono', fontSize: '2.5vw', letterSpacing: '.3em', fontWeight: 900, animation: 'qPulse 2s ease-in-out infinite' }}>
                EN ATTENTE DES JOUEURS...
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1.5vw' }}>
                {players.map((p, i) => (
                  <div key={p.id} style={{ background: `${p.color}15`, border: `3px solid ${p.color}`, borderRadius: '1.2vw', padding: '2vh 1vw', textAlign: 'center', animation: 'riseUp .5s cubic-bezier(.34,1.56,.64,1) both', animationDelay: `${i * .08}s` }}>
                    <div style={{ width: '4.5vw', height: '4.5vw', borderRadius: '50%', background: p.color, margin: '0 auto 1vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '2vw', fontWeight: 900, color: '#000', boxShadow: `0 0 2vw ${p.color}` }}>
                      {p.username.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ fontSize: '1.4vw', fontWeight: 900, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      @{p.username}
                    </div>
                  </div>
                ))}
                {Array.from({ length: Math.max(0, 10 - players.length) }).map((_, i) => (
                  <div key={`empty-${i}`} style={{ background: 'rgba(255,255,255,.03)', border: '2px dashed rgba(255,255,255,.12)', borderRadius: '1.2vw', padding: '2vh 1vw', minHeight: '10vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ fontSize: '2vw', color: 'rgba(255,255,255,.1)' }}>?</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ ÉCRAN RÈGLES ═══ */}
      {state.status === 'rules' && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'radial-gradient(ellipse at 50% 30%, rgba(123,47,255,.12) 0%, #000 70%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '4vw', animation: 'fadeIn .6s ease' }}>
          <div style={{ fontSize: '1.8vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: '.6em', marginBottom: '2vh' }}>✦ RÈGLES DU JEU ✦</div>
          <div style={{ fontSize: '4vw', fontWeight: 900, color: '#ff2d78', letterSpacing: '.2em', marginBottom: '4vh', textShadow: '0 0 30px rgba(255,45,120,.5)' }}>🎲 BULLS RACE</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2vw', maxWidth: '90vw', width: '100%' }}>
            {[
              { icon: '🎯', title: 'OBJECTIF', text: 'Soyez le premier à atteindre la case 30 en répondant correctement aux questions !' },
              { icon: '🥇', title: '1ER À RÉPONDRE', text: 'Le premier qui trouve la bonne réponse avance de 3 cases. Les suivants avancent d une case.' },
              { icon: '⭐', title: 'CASE BONUS', text: 'Vous avancez de 2 à 3 cases supplémentaires. La chance est avec vous !' },
              { icon: '💀', title: 'CASE PIÈGE', text: 'Vous reculez de 2 à 3 cases. Attention où vous mettez les pieds !' },
              { icon: '⚔️', title: 'CASE DUEL', text: 'Vous affrontez le joueur en tete ! Le prochain a repondre correctement gagne le duel.' },
              { icon: '🃏', title: 'CASE JOKER', text: 'Vous bloquez le joueur en tête pendant un round. Il ne peut pas répondre !' },
            ].map((r, i) => (
              <div key={i} style={{ background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '1vw', padding: '1.5vw 2vw', display: 'flex', gap: '1.2vw', alignItems: 'flex-start', animation: `fadeIn .5s ease ${i * .15}s both` }}>
                <div style={{ fontSize: '2.5vw', flexShrink: 0 }}>{r.icon}</div>
                <div>
                  <div style={{ fontSize: '1vw', fontWeight: 900, color: '#ff2d78', fontFamily: 'Share Tech Mono', letterSpacing: '.15em', marginBottom: '.5vh' }}>{r.title}</div>
                  <div style={{ fontSize: '1.1vw', color: '#fff', lineHeight: 1.6, fontFamily: 'Share Tech Mono' }}>{r.text}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '3vh', fontSize: '1.2vw', color: 'rgba(255,255,255,.4)', fontFamily: 'Share Tech Mono', letterSpacing: '.3em' }}>
            TAPEZ !join DANS LE CHAT POUR REJOINDRE LA PARTIE
          </div>
        </div>
      )}

      {/* ═══ ROUE MYSTÈRE ═══ */}
      {(state.status === 'wheel' || state.status === 'wheel_result') && <WheelScreen state={state} />}

      {/* ═══ JEU NORMAL ═══ */}
      {!isPodium && state.status !== 'rules' && state.status !== 'waiting' && state.status !== 'duel' && state.status !== 'duel_result' && state.status !== 'wheel' && state.status !== 'wheel_result' && (
        <>
          {/* Header */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${BOARD_TOP}vh`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2vw', zIndex: 20, borderBottom: '1px solid rgba(255,255,255,.05)', background: 'rgba(0,0,0,.4)' }}>
            <div style={{ fontSize: '3vw', fontWeight: 900, letterSpacing: '.35em', color: '#ff2d78', textShadow: '0 0 20px rgba(255,45,120,.9), 0 0 40px rgba(255,45,120,.5)' }}>
              🎲 BULLS RACE
            </div>
            <div style={{ display: 'flex', gap: '2vw', alignItems: 'center' }}>
              {state.round_number > 0 && (
                <div style={{ fontSize: '1.1vw', color: '#fff', fontFamily: 'Share Tech Mono', letterSpacing: '.3em' }}>
                  ROUND {state.round_number}
                </div>
              )}
              {isWaiting && (
                <div style={{ fontSize: '1.1vw', color: '#ffd700', fontFamily: 'Share Tech Mono', letterSpacing: '.2em', animation: 'qPulse 1.5s infinite' }}>
                  👥 TAPEZ <strong>!join</strong> POUR REJOINDRE
                </div>
              )}
              {isPlaying && (
                <div style={{ fontSize: '1vw', color: '#fff', fontFamily: 'Share Tech Mono', letterSpacing: '.3em' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ff2d78', marginRight: 8, animation: 'pulse 1s infinite' }} />
                  EN DIRECT
                </div>
              )}
            </div>
          </div>

          {/* Left panel — Classement */}
          <div style={{ position: 'absolute', left: 0, top: `${BOARD_TOP}vh`, width: `${BOARD_LEFT}vw`, bottom: '13vh', zIndex: 20, padding: '1.5vw 1.2vw', borderRight: '1px solid rgba(255,255,255,.05)', background: 'rgba(0,0,0,.3)' }}>
            <div style={{ fontSize: '1.4vw', color: '#fff', fontFamily: 'Share Tech Mono', letterSpacing: '.3em', marginBottom: '1.5vh', textAlign: 'center', fontWeight: 900 }}>
              🏆 CLASSEMENT
            </div>
            {players.length === 0 ? (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.5)', fontFamily: 'Share Tech Mono', fontSize: '1vw', marginTop: '3vh', lineHeight: 2 }}>
                En attente<br />de joueurs...
              </div>
            ) : players.map((p, i) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '.6vw', padding: '.6vh .7vw', borderRadius: '.6vw', marginBottom: '.4vh', background: i === 0 ? 'rgba(255,215,0,.05)' : 'rgba(255,255,255,.02)', border: `1px solid ${i===0?'rgba(255,215,0,.2)':'rgba(255,255,255,.05)'}`, animation: 'fadeIn .3s ease', opacity: p.is_blocked ? 0.5 : 1 }}>
                <div style={{ width: '.9vw', height: '.9vw', borderRadius: '50%', background: p.color, flexShrink: 0, boxShadow: `0 0 5px ${p.color}` }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '1.4vw', fontWeight: 700, color: i===0?'#ffd700':'#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i===0?'🥇 ':i===1?'🥈 ':i===2?'🥉 ':`#${i+1} `}@{p.username}
                  </div>
                  <div style={{ fontSize: '1vw', color: '#fff', fontFamily: 'Share Tech Mono' }}>
                    Case {p.position}/30
                    {p.is_blocked && <span style={{ color: '#ff2d78', marginLeft: '.4vw' }}>🔒</span>}
                  </div>
                </div>
                {/* Mini progress bar */}
                <div style={{ width: '3vw', height: 3, background: 'rgba(255,255,255,.08)', borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${(p.position/30)*100}%`, background: p.color, borderRadius: 2, transition: 'width .8s ease' }} />
                </div>
              </div>
            ))}
          </div>

          {/* Board cells */}
          {BOARD.slice(1).map(c => {
            const [col, row] = GRID[c.id] || [0, 4]
            const left = `${BOARD_LEFT + col * CELL_W}vw`
            const top  = `${BOARD_TOP  + row * CELL_H}vh`
            const bg     = CASE_BG[c.type]     || CASE_BG.normal
            const border = CASE_BORDER[c.type] || CASE_BORDER.normal
            const icon   = CASE_ICON[c.type]   || ''
            const isFinish = c.type === 'finish'
            const typeLabel = { bonus: 'BONUS', trap: 'PIÈGE', duel: 'DUEL', joker: 'JOKER', wheel: 'MYSTÈRE', finish: 'ARRIVÉE' }
            const typeColor = { bonus: '#ffd700', trap: '#ff6060', duel: '#b388ff', joker: '#00f5ff', wheel: '#a855f7', finish: '#c8a96e' }
            return (
              <div key={c.id} style={{ position: 'absolute', left, top, width: `${CELL_W}vw`, height: `${CELL_H}vh`, background: bg, border: `1px solid ${border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, transition: 'background .3s', gap: '.3vh' }}>
                {/* Numéro de case */}
                <div style={{ fontSize: '1vw', color: '#fff', fontFamily: 'Share Tech Mono', fontWeight: 700, lineHeight: 1 }}>{c.id}</div>
                {/* Icône grande */}
                <div style={{ fontSize: isFinish ? '3.5vw' : c.type !== 'normal' ? '3vw' : '1vw', lineHeight: 1 }}>{icon}</div>
                {/* Label type */}
                {c.type !== 'normal' && (
                  <div style={{ fontSize: '1vw', color: '#fff', fontFamily: 'Share Tech Mono', fontWeight: 900, letterSpacing: '.05em', lineHeight: 1 }}>
                    {c.type === 'bonus' ? `+${c.value}` : c.type === 'trap' ? `${c.value}` : typeLabel[c.type]}
                  </div>
                )}
              </div>
            )
          })}

          {/* Pawn for each player */}
          {players.map((p, idx) => {
            const pos = p.position
            let cx, cy
            if (pos === 0) {
              cx = 11
              cy = 75 + idx * 3
            } else {
              const center = cellCenter(pos)
              cx = center.x
              cy = center.y
            }
            const playersHere = players.filter(pp => pp.position === pos)
            const myIndexHere = playersHere.findIndex(pp => pp.id === p.id)
            const offsetX = (myIndexHere - (playersHere.length - 1) / 2) * 2
            return (
              <div key={p.id} className="pawn-wrapper" style={{
                left: `calc(${cx}vw - 1.5vw + ${offsetX}vw)`,
                top: `calc(${cy}vh - 2.2vw)`,
                zIndex: 40 + idx,
              }}>
                {/* Traînée lumineuse */}
                <div style={{
                  position: 'absolute',
                  width: '3vw', height: '3vw',
                  borderRadius: '50%',
                  background: p.color,
                  opacity: 0,
                  filter: `blur(.4vw)`,
                  animation: 'trailFade .8s ease',
                  animationFillMode: 'both',
                  zIndex: -1,
                }} />
                {/* Pion */}
                <div className="pawn" style={{
                  width: '3vw', height: '3vw',
                  background: `radial-gradient(circle at 35% 35%, ${p.color}ff, ${p.color}99)`,
                  border: `2px solid ${p.color}`,
                  boxShadow: `0 0 12px ${p.color}, 0 0 25px ${p.color}66`,
                  color: '#000',
                  animation: 'pawnBounce .8s cubic-bezier(.34,1.56,.64,1)',
                  animationFillMode: 'both',
                }}>
                  {p.username.charAt(0).toUpperCase()}
                </div>
                {/* Pseudo complet */}
                <div className="pawn-label" style={{ color: p.color, maxWidth: '5vw', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  @{p.username}
                </div>
              </div>
            )
          })}

          {/* Start marker */}
          <div style={{ position: 'absolute', left: `${BOARD_LEFT - 12}vw`, bottom: '14vh', width: '10vw', textAlign: 'center', zIndex: 15 }}>
            <div style={{ fontSize: '1.5vw', marginBottom: '.3vh' }}>🚀</div>
            <div style={{ fontSize: '1vw', color: '#fff', fontFamily: 'Share Tech Mono', letterSpacing: '.2em', fontWeight: 900 }}>DÉPART</div>
          </div>

          {/* Bottom bar — Question */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '16vh', background: 'rgba(0,0,0,.85)', borderTop: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', zIndex: 25, padding: '0 2.5vw' }}>
            {isPlaying && state.current_question && (
              <>
                {/* Timer */}
                <div style={{ flexShrink: 0, textAlign: 'center', marginRight: '2vw', minWidth: '6vw' }}>
                  <div style={{ fontSize: '5.5vw', fontWeight: 900, color: timer <= 5 ? '#ff3860' : '#00f5ff', lineHeight: 1, animation: timer <= 5 ? 'pulse .5s infinite' : 'none' }}>{timer}</div>
                  <div style={{ fontSize: '.9vw', color: '#fff', fontFamily: 'Share Tech Mono' }}>SEC</div>
                </div>
                <div style={{ width: 1, height: '60%', background: 'rgba(255,255,255,.1)', marginRight: '2vw' }} />
                {/* Category + question */}
                <div style={{ flex: 1 }}>
                  {state.current_category && (
                    <div style={{ fontSize: '1.1vw', color: '#ff2d78', fontFamily: 'Share Tech Mono', letterSpacing: '.3em', marginBottom: '.4vh' }}>
                      {state.current_category.toUpperCase()}
                    </div>
                  )}
                  <div style={{ fontSize: '2.6vw', fontWeight: 700, color: '#fff', lineHeight: 1.3, animation: 'qPulse 3s ease-in-out infinite' }}>
                    {state.current_question}
                  </div>
                </div>
                {/* Points info */}
                <div style={{ flexShrink: 0, textAlign: 'center', marginLeft: '2vw' }}>
                  <div style={{ fontSize: '.9vw', color: '#fff', fontFamily: 'Share Tech Mono', marginBottom: '.4vh' }}>1ER CORRECT</div>
                  <div style={{ fontSize: '2.5vw', fontWeight: 900, color: '#ffd700' }}>+3</div>
                  <div style={{ fontSize: '.8vw', color: '#fff', fontFamily: 'Share Tech Mono' }}>CASES</div>
                  {state.first_answerer && (
                    <div style={{ marginTop: '.4vh', fontSize: '.9vw', color: '#ffd700', fontFamily: 'Share Tech Mono', fontWeight: 900 }}>
                      🥇 @{state.first_answerer}
                    </div>
                  )}
                </div>
              </>
            )}
            {isRevealed && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '2vw', animation: 'fadeIn .5s ease' }}>
                <div style={{ fontSize: '1.8vw', color: '#fff', fontFamily: 'Share Tech Mono', letterSpacing: '.3em', fontWeight: 700 }}>✦ LA RÉPONSE ÉTAIT ✦</div>
                <div style={{ fontSize: '4vw', fontWeight: 900, color: '#00ff88', textShadow: '0 0 20px rgba(0,255,136,.4)' }}>
                  {state.current_answer}
                </div>
                {state.first_answerer && (
                  <div style={{ padding: '.6vh 1.5vw', background: 'rgba(255,215,0,.08)', border: '1px solid rgba(255,215,0,.3)', borderRadius: '2vw', fontSize: '1.4vw', color: '#ffd700', fontFamily: 'Share Tech Mono' }}>
                    🏆 @{state.first_answerer}
                  </div>
                )}
              </div>
            )}
            {(state.status === 'idle' || isWaiting) && (
              <div style={{ flex: 1, textAlign: 'center', color: '#fff', fontFamily: 'Share Tech Mono', fontSize: '2vw', letterSpacing: '.3em', fontWeight: 900 }}>
                {isWaiting ? '👥 INSCRIPTIONS OUVERTES — TAPEZ !join' : 'EN ATTENTE DU PROCHAIN ROUND...'}
              </div>
            )}
          </div>

          {/* ═══ CASE EFFECT — PLEIN ÉCRAN ═══ */}
          {effect && effect.type === 'bonus' && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at 50% 50%, rgba(255,215,0,.25) 0%, rgba(0,0,0,.85) 70%)', animation: 'effectBgIn .3s ease' }}>
              {/* Confettis */}
              {[...Array(20)].map((_, i) => (
                <div key={i} style={{ position: 'absolute', left: `${5 + i * 4.5}%`, top: '-5vh', width: `${0.5 + (i%3)*.4}vw`, height: `${1.5 + (i%4)*.5}vw`, background: ['#ffd700','#ff2d78','#00f5ff','#00ff88','#ff8c00'][i%5], borderRadius: '2px', animation: `confetti ${2.5 + (i%4)*.5}s ease-in ${i * .12}s both`, transform: `rotate(${i*18}deg)`, opacity: 0 }} />
              ))}
              {/* Étoiles rayonnantes */}
              {[...Array(8)].map((_, i) => (
                <div key={i} style={{ position: 'absolute', left: '50%', top: '50%', fontSize: '3vw', animation: `bonusStar 1.5s ease-out ${i * .1}s both`, transformOrigin: '0 0', transform: `rotate(${i*45}deg) translateX(15vw)`, opacity: 0 }}>⭐</div>
              ))}
              {/* Particules flottantes */}
              {[...Array(12)].map((_, i) => (
                <div key={i} style={{ position: 'absolute', left: `${10 + i * 7}%`, bottom: '10%', fontSize: `${1.5 + (i%3)}vw`, animation: `bonusFloat ${3 + i*.3}s ease-out ${i*.15}s both` }}>{'⭐✨💫🌟'[i%4]}</div>
              ))}
              {/* Texte principal */}
              <div style={{ fontSize: '12vw', animation: 'bonusExplode .7s cubic-bezier(.34,1.56,.64,1)', marginBottom: '2vh', filter: 'drop-shadow(0 0 4vw rgba(255,215,0,.8))' }}>⭐</div>
              <div style={{ fontSize: '6vw', fontWeight: 900, color: '#ffd700', letterSpacing: '.15em', textShadow: '0 0 4vw rgba(255,215,0,.8)', animation: 'bigTextIn .6s ease .3s both' }}>BONUS !</div>
              <div style={{ fontSize: '3.5vw', fontWeight: 900, color: '#fff', animation: 'bigTextIn .6s ease .5s both', marginTop: '1vh' }}>+{effect.value} CASES</div>
              <div style={{ fontSize: '2vw', color: 'rgba(255,215,0,.8)', fontFamily: 'Share Tech Mono', animation: 'subTextIn .5s ease .8s both', marginTop: '1.5vh' }}>@{effect.player}</div>
            </div>
          )}

          {effect && effect.type === 'trap' && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at 50% 50%, rgba(255,30,30,.3) 0%, rgba(0,0,0,.9) 70%)', animation: 'effectBgIn .2s ease' }}>
              {/* Flash rouge */}
              <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,0,0,.4)', animation: 'trapFlash .8s ease', pointerEvents: 'none' }} />
              {/* Crânes qui tombent */}
              {[...Array(8)].map((_, i) => (
                <div key={i} style={{ position: 'absolute', left: `${10 + i * 11}%`, top: 0, fontSize: `${2 + (i%3)}vw`, animation: `trapFall ${2 + i*.3}s ease-in ${i * .2}s both` }}>💀</div>
              ))}
              {/* Contenu — effet tremblement */}
              <div style={{ animation: 'trapShake .8s ease .3s', textAlign: 'center' }}>
                <div style={{ fontSize: '11vw', animation: 'trapSkull .6s cubic-bezier(.34,1.56,.64,1)', marginBottom: '2vh', filter: 'drop-shadow(0 0 3vw rgba(255,60,60,.9))' }}>💀</div>
                <div style={{ fontSize: '5.5vw', fontWeight: 900, color: '#ff3860', letterSpacing: '.15em', textShadow: '0 0 3vw rgba(255,60,60,.9)', animation: 'bigTextIn .6s ease .4s both' }}>PIÈGE !</div>
                <div style={{ fontSize: '3vw', fontWeight: 900, color: '#fff', animation: 'bigTextIn .6s ease .6s both', marginTop: '1vh' }}>{effect.value} CASES</div>
                <div style={{ fontSize: '2vw', color: 'rgba(255,100,100,.8)', fontFamily: 'Share Tech Mono', animation: 'subTextIn .5s ease .9s both', marginTop: '1.5vh' }}>@{effect.player} recule !</div>
              </div>
            </div>
          )}

          {/* ═══ DUEL PERSISTANT ═══ */}
          {(state.status === 'duel' || state.status === 'duel_result') && (() => {
            const isDuelResult = state.status === 'duel_result'
            const ef = state.case_effect ? (typeof state.case_effect === 'string' ? JSON.parse(state.case_effect) : state.case_effect) : {}
            const challenger = state.duel_challenger || ef.challenger || '???'
            const opponent   = state.duel_opponent   || ef.opponent   || '???'
            const winner     = isDuelResult ? state.first_answerer : null
            const loser      = isDuelResult ? (winner === challenger ? opponent : challenger) : null
            return (
              <div style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(0,0,0,.93)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', animation: 'effectBgIn .3s ease' }}>
                <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(255,45,120,.12) 0%, transparent 50%, rgba(123,47,255,.12) 100%)' }} />
                {/* Titre */}
                <div style={{ fontSize: '1.5vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: '.6em', marginBottom: '2vh', animation: 'subTextIn .5s ease' }}>
                  {isDuelResult ? '✦ RÉSULTAT DU DUEL ✦' : '✦ DUEL ✦'}
                </div>
                {/* Question en cours */}
                {!isDuelResult && state.current_question && (
                  <div style={{ maxWidth: '70vw', textAlign: 'center', marginBottom: '3vh', padding: '1.5vh 3vw', background: 'rgba(255,255,255,.04)', border: '1px solid rgba(255,255,255,.1)', borderRadius: '1vw', animation: 'fadeIn .5s ease .5s both' }}>
                    {state.current_category && <div style={{ fontSize: '.9vw', color: '#ff2d78', fontFamily: 'Share Tech Mono', letterSpacing: '.3em', marginBottom: '.8vh' }}>{state.current_category.toUpperCase()}</div>}
                    <div style={{ fontSize: '2.2vw', fontWeight: 700, color: '#fff' }}>{state.current_question}</div>
                  </div>
                )}
                {/* Joueurs */}
                <div style={{ display: 'flex', alignItems: 'center', width: '100%', justifyContent: 'center', gap: '4vw' }}>
                  {/* Challenger */}
                  <div style={{ flex: 1, textAlign: 'center', animation: 'duelSlideL .5s cubic-bezier(.34,1.56,.64,1)' }}>
                    <div style={{ fontSize: isDuelResult && winner === challenger ? '8vw' : '5vw', marginBottom: '1.5vh', transition: 'font-size .5s' }}>
                      {isDuelResult ? (winner === challenger ? '🏆' : '💀') : '⚔️'}
                    </div>
                    <div style={{ fontSize: '3vw', fontWeight: 900, color: isDuelResult && loser === challenger ? 'rgba(255,45,120,.4)' : '#ff2d78', textShadow: `0 0 2vw rgba(255,45,120,${isDuelResult && loser === challenger ? '.2' : '.8'})`, transition: 'all .5s' }}>
                      @{challenger}
                    </div>
                    <div style={{ fontSize: '1.2vw', color: 'rgba(255,255,255,.4)', fontFamily: 'Share Tech Mono', marginTop: '1vh', letterSpacing: '.2em' }}>CHALLENGER</div>
                    {isDuelResult && (
                      <div style={{ fontSize: '2vw', fontWeight: 900, marginTop: '1vh', color: winner === challenger ? '#ffd700' : '#ff3860', animation: 'bigTextIn .5s ease .3s both' }}>
                        {winner === challenger ? '+3 CASES 🚀' : '-3 CASES 💀'}
                      </div>
                    )}
                  </div>
                  {/* VS */}
                  <div style={{ textAlign: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: '9vw', fontWeight: 900, color: isDuelResult ? '#ffd700' : '#fff', textShadow: `0 0 4vw ${isDuelResult ? 'rgba(255,215,0,.6)' : 'rgba(255,255,255,.5)'}`, letterSpacing: '.1em', animation: 'duelVS .6s cubic-bezier(.34,1.56,.64,1) .4s both', transition: 'all .5s' }}>
                      {isDuelResult ? '!' : 'VS'}
                    </div>
                    {/* Étincelles */}
                    {!isDuelResult && [...Array(6)].map((_, i) => (
                      <div key={i} style={{ position: 'absolute', left: '50%', top: '50%', width: `${.8 + i*.4}vw`, height: `${.8 + i*.4}vw`, borderRadius: '50%', background: '#fff', transform: 'translate(-50%,-50%)', animation: `duelSpark 1.5s ease-out ${i * .2 + 1}s infinite`, opacity: 0 }} />
                    ))}
                  </div>
                  {/* Opponent */}
                  <div style={{ flex: 1, textAlign: 'center', animation: 'duelSlideR .5s cubic-bezier(.34,1.56,.64,1)' }}>
                    <div style={{ fontSize: isDuelResult && winner === opponent ? '8vw' : '5vw', marginBottom: '1.5vh', transition: 'font-size .5s' }}>
                      {isDuelResult ? (winner === opponent ? '🏆' : '💀') : '🛡️'}
                    </div>
                    <div style={{ fontSize: '3vw', fontWeight: 900, color: isDuelResult && loser === opponent ? 'rgba(123,47,255,.4)' : '#7b2fff', textShadow: `0 0 2vw rgba(123,47,255,${isDuelResult && loser === opponent ? '.2' : '.8'})`, transition: 'all .5s' }}>
                      @{opponent}
                    </div>
                    <div style={{ fontSize: '1.2vw', color: 'rgba(255,255,255,.4)', fontFamily: 'Share Tech Mono', marginTop: '1vh', letterSpacing: '.2em' }}>EN TÊTE</div>
                    {isDuelResult && (
                      <div style={{ fontSize: '2vw', fontWeight: 900, marginTop: '1vh', color: winner === opponent ? '#ffd700' : '#ff3860', animation: 'bigTextIn .5s ease .3s both' }}>
                        {winner === opponent ? '+3 CASES 🚀' : '-3 CASES 💀'}
                      </div>
                    )}
                  </div>
                </div>
                {/* Timer si duel en cours */}
                {!isDuelResult && (
                  <div style={{ marginTop: '3vh', fontSize: '1.1vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: '.3em', animation: 'subTextIn .5s ease 1s both' }}>
                    SEULS CES DEUX JOUEURS PEUVENT RÉPONDRE
                  </div>
                )}
                {isDuelResult && (
                  <div style={{ marginTop: '3vh', fontSize: '1.5vw', color: '#ffd700', fontFamily: 'Share Tech Mono', letterSpacing: '.3em', animation: 'subTextIn .5s ease .8s both' }}>
                    🏆 @{winner} REMPORTE LE DUEL !
                  </div>
                )}
              </div>
            )
          })()}

          {effect && effect.type === 'joker' && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(ellipse at 50% 50%, rgba(0,245,255,.15) 0%, rgba(0,0,0,.9) 70%)', animation: 'effectBgIn .3s ease' }}>
              {/* Carte Joker */}
              <div style={{ fontSize: '13vw', animation: 'jokerFlip .8s ease', marginBottom: '2vh', filter: 'drop-shadow(0 0 4vw rgba(0,245,255,.7))' }}>🃏</div>
              <div style={{ fontSize: '5.5vw', fontWeight: 900, color: '#00f5ff', letterSpacing: '.15em', textShadow: '0 0 3vw rgba(0,245,255,.8)', animation: 'bigTextIn .6s ease .4s both' }}>JOKER !</div>
              {/* Joueur bloqué */}
              <div style={{ marginTop: '2.5vh', padding: '1.5vh 3vw', background: 'rgba(255,45,120,.1)', border: '2px solid rgba(255,45,120,.6)', borderRadius: '1.5vw', animation: 'bigTextIn .6s ease .7s both' }}>
                <div style={{ fontSize: '1.2vw', color: 'rgba(255,255,255,.4)', fontFamily: 'Share Tech Mono', letterSpacing: '.3em', marginBottom: '.8vh' }}>BLOQUÉ POUR UN ROUND</div>
                <div style={{ fontSize: '2.5vw', fontWeight: 900, color: '#ff2d78', textShadow: '0 0 2vw rgba(255,45,120,.6)' }}>🔒 @{effect.blocked}</div>
              </div>
              <div style={{ fontSize: '1.5vw', color: 'rgba(0,245,255,.6)', fontFamily: 'Share Tech Mono', animation: 'subTextIn .5s ease 1s both', marginTop: '2vh', letterSpacing: '.2em' }}>Par @{effect.player}</div>
              {/* Chaînes animées */}
              {[...Array(4)].map((_, i) => (
                <div key={i} style={{ position: 'absolute', fontSize: '2.5vw', opacity: .4, animation: `jokerChain ${.8 + i*.2}s ease-in-out alternate infinite`, top: `${20 + i*15}%`, left: i < 2 ? `${5 + i*8}%` : undefined, right: i >= 2 ? `${5 + (i-2)*8}%` : undefined }}>⛓️</div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

function WheelScreen({ state }) {
  const ef = state.case_effect ? (typeof state.case_effect === 'string' ? JSON.parse(state.case_effect) : state.case_effect) : {}
  const isResult = state.status === 'wheel_result'
  const [showResult, setShowResult] = useState(false)

  const SEGMENTS = [
    { id: 'blocked',  label: 'Bloqué 1 tour',              emoji: '🔒', color: '#ff2d78' },
    { id: 'advance1', label: 'Avance 1 case',              emoji: '⬆️', color: '#00ff88' },
    { id: 'back1',    label: 'Recule 1 case',              emoji: '⬇️', color: '#ff8c00' },
    { id: 'first',    label: 'Passe devant tout le monde', emoji: '🚀', color: '#ffd700' },
    { id: 'last',     label: 'Passe derrière tout le monde', emoji: '🐢', color: '#00f5ff' },
    { id: 'start',    label: 'Retour au départ',           emoji: '🏠', color: '#a855f7' },
  ]
  const N = SEGMENTS.length
  const segAngle = 360 / N
  const resultIdx = SEGMENTS.findIndex(s => s.id === ef.result)
  const targetAngle = resultIdx >= 0 ? (360 - (resultIdx * segAngle + segAngle / 2)) : 0
  const totalSpin = 1800 + targetAngle

  // Étape 1 — après 4s, appelle wheel-apply (passe status à wheel_result)
  useEffect(() => {
    if (state.status !== 'wheel') return
    const t = setTimeout(async () => {
      try {
        await fetch('https://blindtest-live.vercel.app/api/race-wheel-apply', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }
        })
      } catch(e) { console.error('wheel-apply error', e) }
    }, 4000)
    return () => clearTimeout(t)
  }, [state.status])

  // Étape 2 — quand wheel_result, affiche le résultat 2s puis revient au jeu (status revealed)
  useEffect(() => {
    if (state.status !== 'wheel_result') return
    setShowResult(false)
    const t1 = setTimeout(() => setShowResult(true), 5500) // après animation roue
    const t2 = setTimeout(async () => {
      try {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm')
        // On passe en revealed via Supabase direct
        const sb = createClient(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_ANON_KEY
        )
        await sb.from('race_state').update({ status: 'revealed', updated_at: new Date().toISOString() }).eq('session_id', 'bulls-race')
      } catch(e) { console.error('back to revealed error', e) }
    }, 8000) // 5.5s anim + 2s affichage résultat
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [state.status])

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 70, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,.95)' }}>
      {/* Titre */}
      <div style={{ fontSize: '1.3vw', color: '#fff', fontFamily: 'Share Tech Mono', letterSpacing: '.5em', marginBottom: '.8vh', fontWeight: 900 }}>🎡 CASE MYSTÈRE</div>
      <div style={{ fontSize: '2.5vw', fontWeight: 900, color: '#a855f7', textShadow: '0 0 3vw rgba(168,85,247,.8)', letterSpacing: '.2em', marginBottom: '2vh' }}>@{state.wheel_player}</div>

      {/* Roue — taille réduite */}
      <div style={{ position: 'relative', width: '28vw', height: '28vw', marginBottom: '2vh' }}>
        <div style={{ position: 'absolute', top: '-1.8vw', left: '50%', transform: 'translateX(-50%)', zIndex: 10, fontSize: '2.5vw', filter: 'drop-shadow(0 0 .5vw #fff)' }}>▼</div>
        <svg viewBox="0 0 400 400" style={{ width: '100%', height: '100%', transformOrigin: '50% 50%', filter: 'drop-shadow(0 0 2vw rgba(168,85,247,.6))', animation: isResult ? `wheelSpin 5s cubic-bezier(.17,.67,.12,1) forwards` : 'wheelSpinInfinite 1.5s linear infinite', '--spin-deg': `${totalSpin}deg` }}>
          {SEGMENTS.map((seg, i) => {
            const startAngle = (i * segAngle - 90) * Math.PI / 180
            const endAngle = ((i + 1) * segAngle - 90) * Math.PI / 180
            const x1 = 200 + 190 * Math.cos(startAngle)
            const y1 = 200 + 190 * Math.sin(startAngle)
            const x2 = 200 + 190 * Math.cos(endAngle)
            const y2 = 200 + 190 * Math.sin(endAngle)
            const midAngle = ((i + 0.5) * segAngle - 90) * Math.PI / 180
            const tx = 200 + 130 * Math.cos(midAngle)
            const ty = 200 + 130 * Math.sin(midAngle)
            return (
              <g key={seg.id}>
                <path d={`M200,200 L${x1},${y1} A190,190 0 0,1 ${x2},${y2} Z`} fill={seg.color} opacity="0.9" stroke="#000" strokeWidth="2" />
                <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fontSize="28" style={{ pointerEvents: 'none' }}>{seg.emoji}</text>
              </g>
            )
          })}
          <circle cx="200" cy="200" r="25" fill="#111" stroke="#fff" strokeWidth="3" />
          <text x="200" y="200" textAnchor="middle" dominantBaseline="middle" fontSize="20">🎡</text>
        </svg>
      </div>

      {/* Résultat — apparaît après l'animation */}
      {isResult && showResult && ef.emoji && (
        <div style={{ textAlign: 'center', animation: 'bigTextIn .5s ease' }}>
          <div style={{ fontSize: '4vw', marginBottom: '.8vh' }}>{ef.emoji}</div>
          <div style={{ fontSize: '3vw', fontWeight: 900, color: '#fff', textShadow: '0 0 2vw rgba(168,85,247,.8)' }}>{ef.label} !</div>
        </div>
      )}
      {!isResult && (
        <div style={{ fontSize: '1.1vw', color: 'rgba(255,255,255,.5)', fontFamily: 'Share Tech Mono', letterSpacing: '.3em' }}>
          LA ROUE TOURNE...
        </div>
      )}
    </div>
  )
}

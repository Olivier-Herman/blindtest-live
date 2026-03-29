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
  { id: 12, type: 'trap',   value: -3 }, { id: 13, type: 'normal' },
  { id: 14, type: 'joker'  }, { id: 15, type: 'normal' },
  { id: 16, type: 'bonus',  value: 3  }, { id: 17, type: 'normal' }, { id: 18, type: 'normal' },
  { id: 19, type: 'trap',   value: -2 }, { id: 20, type: 'normal' },
  { id: 21, type: 'duel'   }, { id: 22, type: 'normal' },
  { id: 23, type: 'bonus',  value: 2  }, { id: 24, type: 'normal' },
  { id: 25, type: 'trap',   value: -3 }, { id: 26, type: 'joker'  },
  { id: 27, type: 'normal' }, { id: 28, type: 'duel'   },
  { id: 29, type: 'bonus',  value: 2  }, { id: 30, type: 'finish' },
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

const CASE_BG    = { normal: 'rgba(255,255,255,.06)', bonus: 'rgba(255,215,0,.18)', trap: 'rgba(255,60,60,.2)', duel: 'rgba(123,47,255,.25)', joker: 'rgba(0,245,255,.18)', finish: 'rgba(200,169,110,.3)' }
const CASE_BORDER= { normal: 'rgba(255,255,255,.12)', bonus: 'rgba(255,215,0,.5)',  trap: 'rgba(255,60,60,.5)',  duel: 'rgba(123,47,255,.6)',  joker: 'rgba(0,245,255,.5)',  finish: 'rgba(200,169,110,.8)' }
const CASE_ICON  = { normal: '', bonus: '⭐', trap: '💀', duel: '⚔️', joker: '🃏', finish: '🏁' }

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
    effectTimerRef.current = setTimeout(() => setEffect(null), 4000)
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
  const isRevealed = state.status === 'revealed'
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
        .pawn { position: absolute; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 0.8vw; font-weight: 900; transition: left .8s cubic-bezier(.34,1.56,.64,1), top .8s cubic-bezier(.34,1.56,.64,1); z-index: 30; }
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
        <div style={{ position: 'absolute', inset: 0, zIndex: 50, background: 'radial-gradient(ellipse at 50% 20%, rgba(255,45,120,.1) 0%, #000 70%)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3vw', animation: 'fadeIn .6s ease' }}>

          {/* Titre */}
          <div style={{ textAlign: 'center', marginBottom: '4vh' }}>
            <div style={{ fontSize: '1.4vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: '.6em', marginBottom: '1.5vh' }}>✦ BULLS RACE ✦</div>
            <div style={{ fontSize: '4.5vw', fontWeight: 900, color: '#ff2d78', letterSpacing: '.2em', textShadow: '0 0 30px rgba(255,45,120,.6)', marginBottom: '1.5vh' }}>INSCRIPTIONS</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '1vw', padding: '.8vh 2vw', background: 'rgba(255,215,0,.08)', border: '1px solid rgba(255,215,0,.4)', borderRadius: '3vw' }}>
              <span style={{ display: 'inline-block', width: '0.8vw', height: '0.8vw', borderRadius: '50%', background: '#ffd700', animation: 'pulse 1s infinite' }} />
              <span style={{ fontSize: '1.6vw', color: '#ffd700', fontFamily: 'Share Tech Mono', letterSpacing: '.3em', fontWeight: 900 }}>
                TAPEZ !join DANS LE CHAT
              </span>
            </div>
          </div>

          {/* Grille joueurs */}
          <div style={{ width: '100%', maxWidth: '80vw' }}>
            {players.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '4vh 0', color: 'rgba(255,255,255,.2)', fontFamily: 'Share Tech Mono', fontSize: '1.4vw', letterSpacing: '.3em', animation: 'qPulse 2s ease-in-out infinite' }}>
                EN ATTENTE DES JOUEURS...
              </div>
            ) : (
              <>
                <div style={{ textAlign: 'center', fontSize: '1.1vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: '.4em', marginBottom: '2vh' }}>
                  {players.length} / 10 JOUEUR{players.length > 1 ? 'S' : ''} INSCRIT{players.length > 1 ? 'S' : ''}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '1.2vw' }}>
                  {players.map((p, i) => (
                    <div key={p.id} style={{ background: 'rgba(255,255,255,.04)', border: `2px solid ${p.color}60`, borderRadius: '1vw', padding: '1.5vh 1vw', textAlign: 'center', animation: 'riseUp .5s cubic-bezier(.34,1.56,.64,1) both', animationDelay: `${i * .08}s` }}>
                      <div style={{ width: '3vw', height: '3vw', borderRadius: '50%', background: `radial-gradient(circle at 35% 35%, ${p.color}ee, ${p.color}66)`, border: `3px solid ${p.color}`, boxShadow: `0 0 15px ${p.color}66`, margin: '0 auto .8vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4vw', fontWeight: 900, color: '#000' }}>
                        {p.username.charAt(0).toUpperCase()}
                      </div>
                      <div style={{ fontSize: '1.1vw', fontWeight: 700, color: p.color, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        @{p.username}
                      </div>
                      <div style={{ fontSize: '.7vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', marginTop: '.3vh' }}>
                        #{i + 1}
                      </div>
                    </div>
                  ))}
                  {/* Cases vides */}
                  {Array.from({ length: Math.max(0, 10 - players.length) }).map((_, i) => (
                    <div key={`empty-${i}`} style={{ background: 'rgba(255,255,255,.02)', border: '2px dashed rgba(255,255,255,.08)', borderRadius: '1vw', padding: '1.5vh 1vw', textAlign: 'center', minHeight: '8vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ fontSize: '1vw', color: 'rgba(255,255,255,.1)', fontFamily: 'Share Tech Mono' }}>?</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{ marginTop: '4vh', fontSize: '1vw', color: 'rgba(255,255,255,.2)', fontFamily: 'Share Tech Mono', letterSpacing: '.3em' }}>
            10 JOUEURS MAXIMUM • LA PARTIE COMMENCE BIENTÔT
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

      {/* ═══ JEU NORMAL ═══ */}
      {!isPodium && state.status !== 'rules' && state.status !== 'waiting' && (
        <>
          {/* Header */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: `${BOARD_TOP}vh`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2vw', zIndex: 20, borderBottom: '1px solid rgba(255,255,255,.05)', background: 'rgba(0,0,0,.4)' }}>
            <div style={{ fontSize: '2.2vw', fontWeight: 900, letterSpacing: '.35em', color: '#ff2d78', textShadow: '0 0 20px rgba(255,45,120,.5)' }}>
              🎲 BULLS RACE
            </div>
            <div style={{ display: 'flex', gap: '2vw', alignItems: 'center' }}>
              {state.round_number > 0 && (
                <div style={{ fontSize: '1.1vw', color: 'rgba(255,255,255,.2)', fontFamily: 'Share Tech Mono', letterSpacing: '.3em' }}>
                  ROUND {state.round_number}
                </div>
              )}
              {isWaiting && (
                <div style={{ fontSize: '1.1vw', color: '#ffd700', fontFamily: 'Share Tech Mono', letterSpacing: '.2em', animation: 'qPulse 1.5s infinite' }}>
                  👥 TAPEZ <strong>!join</strong> POUR REJOINDRE
                </div>
              )}
              {isPlaying && (
                <div style={{ fontSize: '1vw', color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: '.3em' }}>
                  <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: '#ff2d78', marginRight: 8, animation: 'pulse 1s infinite' }} />
                  EN DIRECT
                </div>
              )}
            </div>
          </div>

          {/* Left panel — Classement */}
          <div style={{ position: 'absolute', left: 0, top: `${BOARD_TOP}vh`, width: `${BOARD_LEFT}vw`, bottom: '13vh', zIndex: 20, padding: '1.5vw 1.2vw', borderRight: '1px solid rgba(255,255,255,.05)', background: 'rgba(0,0,0,.3)' }}>
            <div style={{ fontSize: '1.1vw', color: '#fff', fontFamily: 'Share Tech Mono', letterSpacing: '.4em', marginBottom: '1.5vh', textAlign: 'center', fontWeight: 900 }}>
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
                  <div style={{ fontSize: '1.1vw', fontWeight: 700, color: i===0?'#ffd700':'#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {i===0?'🥇 ':i===1?'🥈 ':i===2?'🥉 ':`#${i+1} `}@{p.username}
                  </div>
                  <div style={{ fontSize: '.75vw', color: p.color, fontFamily: 'Share Tech Mono', opacity: .8 }}>
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
            const typeLabel = { bonus: 'BONUS', trap: 'PIÈGE', duel: 'DUEL', joker: 'JOKER', finish: 'ARRIVÉE' }
            const typeColor = { bonus: '#ffd700', trap: '#ff6060', duel: '#b388ff', joker: '#00f5ff', finish: '#c8a96e' }
            return (
              <div key={c.id} style={{ position: 'absolute', left, top, width: `${CELL_W}vw`, height: `${CELL_H}vh`, background: bg, border: `1px solid ${border}`, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 10, transition: 'background .3s', gap: '.3vh' }}>
                {/* Numéro de case */}
                <div style={{ fontSize: '1vw', color: 'rgba(255,255,255,.4)', fontFamily: 'Share Tech Mono', fontWeight: 700, lineHeight: 1 }}>{c.id}</div>
                {/* Icône grande */}
                <div style={{ fontSize: isFinish ? '3.5vw' : c.type !== 'normal' ? '3vw' : '1vw', lineHeight: 1 }}>{icon}</div>
                {/* Label type */}
                {c.type !== 'normal' && (
                  <div style={{ fontSize: '.85vw', color: typeColor[c.type] || '#fff', fontFamily: 'Share Tech Mono', fontWeight: 900, letterSpacing: '.05em', lineHeight: 1 }}>
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
            const offsetX = (myIndexHere - (playersHere.length - 1) / 2) * 1.5
            return (
              <div key={p.id} className="pawn" style={{
                width: '3vw', height: '3vw',
                background: `radial-gradient(circle at 35% 35%, ${p.color}ee, ${p.color}88)`,
                border: `2px solid ${p.color}`,
                boxShadow: `0 0 10px ${p.color}, 0 0 20px ${p.color}55`,
                left: `calc(${cx}vw - 1.5vw + ${offsetX}vw)`,
                top: `calc(${cy}vh - 1.5vw)`,
                fontSize: '1.1vw',
                color: '#000',
                fontWeight: 900,
                zIndex: 40 + idx,
              }}>
                {p.username.charAt(0).toUpperCase()}
              </div>
            )
          })}

          {/* Start marker */}
          <div style={{ position: 'absolute', left: `${BOARD_LEFT - 12}vw`, bottom: '14vh', width: '10vw', textAlign: 'center', zIndex: 15 }}>
            <div style={{ fontSize: '1.5vw', marginBottom: '.3vh' }}>🚀</div>
            <div style={{ fontSize: '1vw', color: '#fff', fontFamily: 'Share Tech Mono', letterSpacing: '.2em', fontWeight: 900 }}>DÉPART</div>
          </div>

          {/* Bottom bar — Question */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '13vh', background: 'rgba(0,0,0,.85)', borderTop: '1px solid rgba(255,255,255,.07)', display: 'flex', alignItems: 'center', zIndex: 25, padding: '0 2.5vw' }}>
            {isPlaying && state.current_question && (
              <>
                {/* Timer */}
                <div style={{ flexShrink: 0, textAlign: 'center', marginRight: '2vw', minWidth: '6vw' }}>
                  <div style={{ fontSize: '4vw', fontWeight: 900, color: timer <= 5 ? '#ff3860' : '#00f5ff', lineHeight: 1, animation: timer <= 5 ? 'pulse .5s infinite' : 'none' }}>{timer}</div>
                  <div style={{ fontSize: '.9vw', color: 'rgba(255,255,255,.5)', fontFamily: 'Share Tech Mono' }}>SEC</div>
                </div>
                <div style={{ width: 1, height: '60%', background: 'rgba(255,255,255,.1)', marginRight: '2vw' }} />
                {/* Category + question */}
                <div style={{ flex: 1 }}>
                  {state.current_category && (
                    <div style={{ fontSize: '.75vw', color: '#ff2d78', fontFamily: 'Share Tech Mono', letterSpacing: '.3em', marginBottom: '.4vh' }}>
                      {state.current_category.toUpperCase()}
                    </div>
                  )}
                  <div style={{ fontSize: '2vw', fontWeight: 700, color: '#fff', lineHeight: 1.3, animation: 'qPulse 3s ease-in-out infinite' }}>
                    {state.current_question}
                  </div>
                </div>
                {/* Points info */}
                <div style={{ flexShrink: 0, textAlign: 'center', marginLeft: '2vw' }}>
                  <div style={{ fontSize: '.9vw', color: 'rgba(255,255,255,.7)', fontFamily: 'Share Tech Mono', marginBottom: '.4vh' }}>1ER CORRECT</div>
                  <div style={{ fontSize: '2.5vw', fontWeight: 900, color: '#ffd700' }}>+3</div>
                  <div style={{ fontSize: '.8vw', color: 'rgba(255,255,255,.6)', fontFamily: 'Share Tech Mono' }}>CASES</div>
                  {state.first_answerer && (
                    <div style={{ marginTop: '.4vh', fontSize: '.7vw', color: '#ffd700', fontFamily: 'Share Tech Mono' }}>
                      🥇 @{state.first_answerer}
                    </div>
                  )}
                </div>
              </>
            )}
            {isRevealed && (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '2vw', animation: 'fadeIn .5s ease' }}>
                <div style={{ fontSize: '1.4vw', color: '#fff', fontFamily: 'Share Tech Mono', letterSpacing: '.4em', fontWeight: 700 }}>✦ LA RÉPONSE ÉTAIT ✦</div>
                <div style={{ fontSize: '3vw', fontWeight: 900, color: '#00ff88', textShadow: '0 0 20px rgba(0,255,136,.4)' }}>
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
              <div style={{ flex: 1, textAlign: 'center', color: '#fff', fontFamily: 'Share Tech Mono', fontSize: '1.4vw', letterSpacing: '.3em', fontWeight: 700 }}>
                {isWaiting ? '👥 INSCRIPTIONS OUVERTES — TAPEZ !join' : 'EN ATTENTE DU PROCHAIN ROUND...'}
              </div>
            )}
          </div>

          {/* Case Effect Popup */}
          {effect && (
            <div style={{ position: 'absolute', top: '20vh', left: '50%', transform: 'translateX(-50%)', zIndex: 60, animation: `effectIn .4s ease` }}>
              <div style={{
                padding: '2vh 3vw',
                borderRadius: '1.5vw',
                textAlign: 'center',
                background: effect.type === 'bonus' ? 'rgba(255,215,0,.15)' : effect.type === 'trap' ? 'rgba(255,60,60,.15)' : effect.type === 'joker' ? 'rgba(0,245,255,.15)' : 'rgba(123,47,255,.2)',
                border: `2px solid ${effect.type==='bonus'?'rgba(255,215,0,.6)':effect.type==='trap'?'rgba(255,60,60,.6)':effect.type==='joker'?'rgba(0,245,255,.6)':'rgba(123,47,255,.6)'}`,
                backdropFilter: 'blur(10px)',
                boxShadow: `0 0 40px ${effect.type==='bonus'?'rgba(255,215,0,.3)':effect.type==='trap'?'rgba(255,60,60,.3)':effect.type==='joker'?'rgba(0,245,255,.3)':'rgba(123,47,255,.3)'}`,
              }}>
                <div style={{ fontSize: '3vw', marginBottom: '1vh' }}>
                  {effect.type==='bonus'?'⭐':effect.type==='trap'?'💀':effect.type==='joker'?'🃏':'⚔️'}
                </div>
                <div style={{ fontSize: '1.8vw', fontWeight: 900, color: '#fff', letterSpacing: '.1em' }}>
                  {effect.type==='bonus' && `+${effect.value} CASES BONUS !`}
                  {effect.type==='trap'  && `${effect.value} CASES PIÈGE !`}
                  {effect.type==='joker' && `JOKER ! ${effect.blocked} EST BLOQUÉ !`}
                  {effect.type==='duel'  && `DUEL !`}
                </div>
                <div style={{ fontSize: '1.2vw', color: 'rgba(255,255,255,.6)', fontFamily: 'Share Tech Mono', marginTop: '.6vh' }}>
                  {effect.type==='duel' ? `${effect.challenger} vs ${effect.opponent}` : `@${effect.player}`}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

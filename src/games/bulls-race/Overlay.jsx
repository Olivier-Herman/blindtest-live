import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const SESSION_ID = 'bulls-race'

const BOARD = [
  { id: 0,  type: 'start'  },
  { id: 1,  type: 'normal' }, { id: 2,  type: 'bonus',  value: 2  },
  { id: 3,  type: 'normal' }, { id: 4,  type: 'normal' },
  { id: 5,  type: 'trap',   value: -2 }, { id: 6,  type: 'normal' },
  { id: 7,  type: 'wheel'  }, { id: 8,  type: 'normal' },
  { id: 9,  type: 'normal' }, { id: 10, type: 'joker'  },
  { id: 11, type: 'normal' },
  { id: 12, type: 'trap',   value: -3 },
  { id: 13, type: 'wheel'  },
  { id: 14, type: 'bonus',  value: 2  },
  { id: 15, type: 'normal' }, { id: 16, type: 'wheel'  },
  { id: 17, type: 'normal' }, { id: 18, type: 'trap',   value: -2 },
  { id: 19, type: 'normal' },
  { id: 20, type: 'normal' }, { id: 21, type: 'joker'  },
  { id: 22, type: 'normal' },
  { id: 23, type: 'bonus',  value: 2  }, { id: 24, type: 'normal' },
  { id: 25, type: 'trap',   value: -2 }, { id: 26, type: 'normal' },
  { id: 27, type: 'wheel'  }, { id: 28, type: 'normal' },
  { id: 29, type: 'trap',   value: -2 }, { id: 30, type: 'finish' },
]

// Positions % sur le canvas (width=1920, height=900)
// Ligne 1 G→D y=24%, virage droit, Ligne 2 D→G y=52%, virage gauche, Ligne 3 G→D y=80%
const CIRCUIT_PTS = [
  // Ligne 1 G->D (cases 0-8)
  { x: 12.5, y: 24 }, { x: 21.5, y: 24 }, { x: 30.5, y: 24 },
  { x: 39.5, y: 24 }, { x: 48.5, y: 24 }, { x: 57.5, y: 24 },
  { x: 66.5, y: 24 }, { x: 75.5, y: 24 }, { x: 84.5, y: 24 },
  // Virage droit (cases 9-11)
  { x: 93.5, y: 34 }, { x: 95,   y: 46 }, { x: 93.5, y: 58 },
  // Ligne 2 D->G (cases 12-19)
  { x: 84.5, y: 52 }, { x: 73.5, y: 52 }, { x: 63.5, y: 52 },
  { x: 53.5, y: 52 }, { x: 43.5, y: 52 }, { x: 33.5, y: 52 },
  { x: 23.5, y: 52 }, { x: 12.5, y: 52 },
  // Virage gauche (cases 20-22) - bien espacees
  { x: 5.5,  y: 60 }, { x: 4.5,  y: 71 }, { x: 5.5,  y: 82 },
  // Ligne 3 G->D (cases 23-30)
  { x: 14,   y: 80 }, { x: 25,   y: 80 }, { x: 36,   y: 80 },
  { x: 47,   y: 80 }, { x: 58,   y: 80 }, { x: 69,   y: 80 },
  { x: 80,   y: 80 }, { x: 84.5, y: 80 },
]

const BORDERS = {
  start: '#ff2d78', normal: 'rgba(255,255,255,0.5)',
  bonus: '#ffd700', trap: '#ff3860',
  duel: '#7b2fff', joker: '#00f5ff',
  wheel: '#a855f7', finish: '#c8a96e',
}
const FILLS = {
  start: 'rgba(255,45,120,0.3)', normal: 'rgba(255,255,255,0.06)',
  bonus: 'rgba(255,215,0,0.2)', trap: 'rgba(255,60,60,0.2)',
  duel: 'rgba(123,47,255,0.25)', joker: 'rgba(0,245,255,0.2)',
  wheel: 'rgba(168,85,247,0.25)', finish: 'rgba(200,169,110,0.35)',
}

export default function BullsRaceOverlay() {
  const [state,   setState]   = useState({ status: 'idle', current_question: '', current_answer: '', current_category: '', round_number: 0, first_answerer: null, case_effect: null, winner: null, wheel_player: null, wheel_result: null, duel_challenger: null, duel_opponent: null, timer_end: null })
  const [players, setPlayers] = useState([])
  const [timer,   setTimer]   = useState(30)
  const [effect,  setEffect]  = useState(null)
  const canvasRef     = useRef(null)
  const effectTimerRef = useRef(null)
  const stateRef      = useRef(state)
  const playersRef    = useRef(players)

  useEffect(() => { stateRef.current  = state  }, [state])
  useEffect(() => { playersRef.current = players }, [players])

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
    if (state.status === 'playing' && state.timer_end) {
      interval = setInterval(() => {
        const remaining = Math.max(0, Math.round((new Date(state.timer_end) - Date.now()) / 1000))
        setTimer(remaining)
      }, 500)
    } else { setTimer(30) }
    return () => clearInterval(interval)
  }, [state.status, state.timer_end])

  useEffect(() => { drawCircuit() }, [players, state])

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

  function drawCircuit() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)

    const px = x => x / 100 * W
    const py = y => y / 100 * H
    const Y1 = 24, Y2 = 52, Y3 = 80
    const XL = 12.5, XR = 84.5

    // Piste
    ctx.strokeStyle = 'rgba(255,255,255,0.05)'
    ctx.lineWidth = H * 0.075
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(px(XL), py(Y1)); ctx.lineTo(px(XR), py(Y1))
    ctx.bezierCurveTo(px(XR+12), py(Y1), px(XR+12), py(Y2), px(XR), py(Y2))
    ctx.lineTo(px(XL), py(Y2))
    ctx.bezierCurveTo(px(XL-12), py(Y2), px(XL-12), py(Y3), px(XL), py(Y3))
    ctx.lineTo(px(XR), py(Y3))
    ctx.stroke()

    // Ligne centrale pointillée
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'
    ctx.lineWidth = 1.5
    ctx.setLineDash([W*0.01, W*0.014])
    ctx.beginPath()
    ctx.moveTo(px(XL), py(Y1)); ctx.lineTo(px(XR), py(Y1))
    ctx.bezierCurveTo(px(XR+12), py(Y1), px(XR+12), py(Y2), px(XR), py(Y2))
    ctx.lineTo(px(XL), py(Y2))
    ctx.bezierCurveTo(px(XL-12), py(Y2), px(XL-12), py(Y3), px(XL), py(Y3))
    ctx.lineTo(px(XR), py(Y3))
    ctx.stroke()
    ctx.setLineDash([])

    // Flèches
    const arrow = (x, y, a) => {
      ctx.save(); ctx.translate(px(x), py(y)); ctx.rotate(a)
      ctx.fillStyle = 'rgba(255,255,255,0.2)'
      ctx.beginPath(); ctx.moveTo(W*0.012,0); ctx.lineTo(-W*0.008,-H*0.009); ctx.lineTo(-W*0.008,H*0.009); ctx.closePath()
      ctx.fill(); ctx.restore()
    }
    for(let i=0;i<4;i++) arrow(22+i*17, Y1, 0)
    for(let i=0;i<4;i++) arrow(79-i*17, Y2, Math.PI)
    for(let i=0;i<3;i++) arrow(22+i*22, Y3, 0)

    // Cases
    BOARD.forEach((c, i) => {
      if (i >= CIRCUIT_PTS.length) return
      const pt = CIRCUIT_PTS[i]
      const cx = px(pt.x), cy = py(pt.y)
      const isSpecial = c.type !== 'normal'
      const r = (c.type==='start'||c.type==='finish') ? H*0.074 : isSpecial ? H*0.070 : H*0.056

      if (isSpecial) {
        ctx.beginPath(); ctx.arc(cx, cy, r+H*0.014, 0, Math.PI*2)
        ctx.fillStyle = FILLS[c.type]; ctx.fill()
      }
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2)
      ctx.fillStyle = '#0a0a1a'; ctx.fill()
      ctx.strokeStyle = BORDERS[c.type]
      ctx.lineWidth = isSpecial ? 3.5 : 2; ctx.stroke()

      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const fs = H * 0.038

      if (c.type === 'start') {
        ctx.fillStyle = '#ff2d78'; ctx.font = `900 ${fs*0.85}px Arial Black,Arial`
        ctx.fillText('GO', cx, cy)
      } else if (c.type === 'finish') {
        ctx.fillStyle = '#ffd700'; ctx.font = `900 ${fs*0.8}px Arial Black,Arial`
        ctx.fillText('FIN', cx, cy)
      } else if (c.type === 'normal') {
        ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.font = `700 ${fs*0.72}px Arial`
        ctx.fillText(i, cx, cy)
      } else if (c.type === 'bonus') {
        ctx.fillStyle = '#ffd700'
        ctx.font = `900 ${fs}px Arial Black,Arial`; ctx.fillText('+'+c.value, cx, cy-r*0.22)
        ctx.font = `${fs*0.65}px Arial`; ctx.fillText('★', cx, cy+r*0.42)
      } else if (c.type === 'trap') {
        ctx.fillStyle = '#ff3860'
        ctx.font = `900 ${fs}px Arial Black,Arial`; ctx.fillText(c.value, cx, cy-r*0.22)
        ctx.font = `${fs*0.65}px Arial`; ctx.fillText('☠', cx, cy+r*0.42)
      } else if (c.type === 'duel') {
        ctx.fillStyle = '#b388ff'
        ctx.font = `900 ${fs*0.6}px Arial Black,Arial`; ctx.fillText('DUEL', cx, cy-r*0.28)
        ctx.font = `${fs*0.75}px Arial`; ctx.fillText('⚔', cx, cy+r*0.38)
      } else if (c.type === 'joker') {
        ctx.fillStyle = '#00f5ff'
        ctx.font = `900 ${fs*0.55}px Arial Black,Arial`; ctx.fillText('JOKER', cx, cy-r*0.28)
        ctx.font = `${fs*0.75}px Arial`; ctx.fillText('J', cx, cy+r*0.38)
      } else if (c.type === 'wheel') {
        ctx.fillStyle = '#a855f7'
        ctx.font = `900 ${fs*0.55}px Arial Black,Arial`; ctx.fillText('MYST.', cx, cy-r*0.28)
        ctx.font = `${fs*0.85}px Arial`; ctx.fillText('🎡', cx, cy+r*0.38)
      }
    })

    // Pions
    playersRef.current.forEach((p, idx) => {
      const pos = Math.min(p.position, CIRCUIT_PTS.length - 1)
      const pt = CIRCUIT_PTS[pos]
      if (!pt) return
      const playersHere = playersRef.current.filter(pp => pp.position === p.position)
      const myIdx = playersHere.findIndex(pp => pp.id === p.id)
      const offsetX = (myIdx - (playersHere.length - 1) / 2) * W * 0.025
      const cx = px(pt.x) + offsetX
      const cy = py(pt.y)
      const r = H * 0.048

      ctx.beginPath(); ctx.arc(cx, cy, r+H*0.012, 0, Math.PI*2)
      ctx.fillStyle = p.color + '33'; ctx.fill()

      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI*2)
      ctx.fillStyle = p.color; ctx.fill()
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke()

      ctx.fillStyle = '#000'
      ctx.font = `900 ${r*0.75}px Arial Black,Arial`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText(p.username.charAt(0).toUpperCase(), cx, cy)

      ctx.fillStyle = p.color
      ctx.font = `700 ${H*0.015}px Share Tech Mono,monospace`
      ctx.fillText('@'+p.username, cx, cy + r + H*0.022)
    })
  }

  const isPodium   = state.status === 'finished'
  const isPlaying  = state.status === 'playing'
  const isRevealed = ['revealed','duel_result','wheel_result'].includes(state.status)
  const isWaiting  = state.status === 'waiting'
  const isDuel     = ['duel','duel_result'].includes(state.status)
  const isWheel    = ['wheel','wheel_result'].includes(state.status)

  return (
    <div style={{ width:'100vw', height:'100vh', background:'#000', overflow:'hidden', position:'relative', fontFamily:"'Orbitron', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        body { background:#000 !important; }
        @keyframes fadeIn    { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes shimmer   { 0%,100%{text-shadow:0 0 20px #ffd700,0 0 40px rgba(255,215,0,.3)} 50%{text-shadow:0 0 40px #ffd700,0 0 80px rgba(255,215,0,.6)} }
        @keyframes qPulse    { 0%,100%{opacity:.7} 50%{opacity:1} }
        @keyframes pulse     { 0%,100%{transform:scale(1)} 50%{transform:scale(1.15)} }
        @keyframes riseUp    { 0%{transform:translateY(60px) scale(.9);opacity:0} 100%{transform:translateY(0) scale(1);opacity:1} }
        @keyframes starFloat { 0%{transform:translateY(0) rotate(0);opacity:.6} 100%{transform:translateY(-50vh) rotate(360deg);opacity:0} }
        @keyframes bigTextIn { 0%{transform:scale(0) translateY(30px);opacity:0} 60%{transform:scale(1.1) translateY(-5px);opacity:1} 100%{transform:scale(1) translateY(0);opacity:1} }
        @keyframes subTextIn { from{opacity:0;transform:translateY(15px)} to{opacity:1;transform:translateY(0)} }
        @keyframes duelSlideL{ 0%{transform:translateX(-100vw);opacity:0} 100%{transform:translateX(0);opacity:1} }
        @keyframes duelSlideR{ 0%{transform:translateX(100vw);opacity:0} 100%{transform:translateX(0);opacity:1} }
        @keyframes duelVS    { 0%{transform:scale(0) rotate(-15deg);opacity:0} 60%{transform:scale(1.4) rotate(5deg)} 100%{transform:scale(1) rotate(0);opacity:1} }
        @keyframes bonusExp  { 0%{transform:scale(0);opacity:0} 60%{transform:scale(1.15)} 100%{transform:scale(1);opacity:1} }
        @keyframes trapShake { 0%,100%{transform:translateX(0)} 10%{transform:translateX(-3vw)} 20%{transform:translateX(3vw)} 30%{transform:translateX(-2vw)} 40%{transform:translateX(2vw)} 50%{transform:translateX(-1vw)} 60%{transform:translateX(1vw)} }
        @keyframes jokerFlip { 0%{transform:perspective(800px) rotateY(-180deg);opacity:0} 100%{transform:perspective(800px) rotateY(0deg);opacity:1} }
        @keyframes wheelSpin { 0%{transform:rotate(0deg)} 100%{transform:rotate(var(--spin-deg))} }
        @keyframes wheelInfinite { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        @keyframes confetti  { 0%{transform:translateY(-10vh) rotate(0);opacity:1} 100%{transform:translateY(110vh) rotate(720deg);opacity:.2} }
        @keyframes bgIn      { from{opacity:0} to{opacity:1} }
      `}</style>

      {/* ══ INSCRIPTIONS ══ */}
      {isWaiting && (
        <div style={{ position:'absolute', inset:0, zIndex:50, background:'#000', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'2vw', animation:'fadeIn .4s ease' }}>
          <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 0%, rgba(255,45,120,.25) 0%, transparent 60%)', pointerEvents:'none' }} />
          <div style={{ fontSize:'2vw', color:'#fff', fontFamily:'Share Tech Mono', letterSpacing:'.5em', marginBottom:'1vh', fontWeight:700 }}>🎲 BULLS RACE</div>
          <div style={{ fontSize:'7vw', fontWeight:900, color:'#ff2d78', letterSpacing:'.15em', textShadow:'0 0 5vw rgba(255,45,120,.8)', lineHeight:1 }}>INSCRIPTIONS</div>
          <div style={{ marginBottom:'4vh', padding:'1.5vh 4vw', background:'#ffd700', borderRadius:'1vw', animation:'pulse 1.5s ease-in-out infinite', marginTop:'2vh' }}>
            <div style={{ fontSize:'3.5vw', fontWeight:900, color:'#000', letterSpacing:'.1em', textAlign:'center' }}>TAPEZ !join DANS LE CHAT</div>
          </div>
          <div style={{ fontSize:'2vw', color:'#fff', fontFamily:'Share Tech Mono', letterSpacing:'.3em', marginBottom:'3vh', fontWeight:700 }}>
            {players.length} / 10 JOUEUR{players.length>1?'S':''} INSCRIT{players.length>1?'S':''}
          </div>
          <div style={{ width:'100%', maxWidth:'85vw' }}>
            {players.length === 0 ? (
              <div style={{ textAlign:'center', color:'#fff', fontFamily:'Share Tech Mono', fontSize:'2.5vw', fontWeight:900, animation:'qPulse 2s ease-in-out infinite' }}>EN ATTENTE DES JOUEURS...</div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(5, 1fr)', gap:'1.5vw' }}>
                {players.map((p,i) => (
                  <div key={p.id} style={{ background:`${p.color}15`, border:`3px solid ${p.color}`, borderRadius:'1.2vw', padding:'2vh 1vw', textAlign:'center', animation:'riseUp .5s cubic-bezier(.34,1.56,.64,1) both', animationDelay:`${i*.08}s` }}>
                    <div style={{ width:'4.5vw', height:'4.5vw', borderRadius:'50%', background:p.color, margin:'0 auto 1vh', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'2vw', fontWeight:900, color:'#000', boxShadow:`0 0 2vw ${p.color}` }}>
                      {p.username.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ fontSize:'1.4vw', fontWeight:900, color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>@{p.username}</div>
                  </div>
                ))}
                {Array.from({length:Math.max(0,10-players.length)}).map((_,i) => (
                  <div key={`e${i}`} style={{ background:'rgba(255,255,255,.03)', border:'2px dashed rgba(255,255,255,.12)', borderRadius:'1.2vw', padding:'2vh 1vw', minHeight:'10vh', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <div style={{ fontSize:'2vw', color:'rgba(255,255,255,.1)' }}>?</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ RÈGLES ══ */}
      {state.status === 'rules' && (
        <div style={{ position:'absolute', inset:0, zIndex:50, background:'radial-gradient(ellipse at 50% 30%, rgba(123,47,255,.12) 0%, #000 70%)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'4vw', animation:'fadeIn .6s ease' }}>
          <div style={{ fontSize:'1.8vw', color:'#fff', fontFamily:'Share Tech Mono', letterSpacing:'.6em', marginBottom:'2vh' }}>✦ RÈGLES DU JEU ✦</div>
          <div style={{ fontSize:'4vw', fontWeight:900, color:'#ff2d78', letterSpacing:'.2em', marginBottom:'4vh' }}>🎲 BULLS RACE</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'2vw', maxWidth:'90vw', width:'100%' }}>
            {[
              {icon:'🎯',title:'OBJECTIF',text:'Soyez le premier a atteindre la case 30 !'},
              {icon:'🥇',title:'1ER CORRECT',text:'Le 1er a repondre avance de 3 cases. Les suivants de 1.'},
              {icon:'⭐',title:'CASE BONUS',text:'Vous avancez de 2 a 3 cases supplementaires.'},
              {icon:'💀',title:'CASE PIEGE',text:'Vous reculez de 2 a 3 cases. Attention !'},
              {icon:'⚔️',title:'CASE DUEL',text:'Affrontez le joueur en tete. Gagnant +3, perdant -3.'},
              {icon:'🎡',title:'CASE MYSTERE',text:'La roue tourne et decide de votre sort !'},
            ].map((r,i) => (
              <div key={i} style={{ background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.1)', borderRadius:'1vw', padding:'1.5vw 2vw', display:'flex', gap:'1.2vw', alignItems:'flex-start', animation:`fadeIn .5s ease ${i*.15}s both` }}>
                <div style={{ fontSize:'2.5vw', flexShrink:0 }}>{r.icon}</div>
                <div>
                  <div style={{ fontSize:'1vw', fontWeight:900, color:'#ff2d78', fontFamily:'Share Tech Mono', letterSpacing:'.15em', marginBottom:'.5vh' }}>{r.title}</div>
                  <div style={{ fontSize:'1.1vw', color:'#fff', lineHeight:1.6, fontFamily:'Share Tech Mono' }}>{r.text}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ PODIUM ══ */}
      {isPodium && (
        <div style={{ position:'absolute', inset:0, zIndex:50, background:'radial-gradient(ellipse at 50% 30%, rgba(200,169,110,.1) 0%, #000 70%)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center' }}>
          {[...Array(14)].map((_,i) => (
            <div key={i} style={{ position:'absolute', left:`${6+i*6.5}%`, bottom:`${5+(i%4)*18}%`, fontSize:`${1.2+(i%3)*.4}vw`, animation:`starFloat ${3+i*.3}s ease-in-out ${i*.25}s infinite`, opacity:.5, pointerEvents:'none' }}>
              {i%3===0?'✦':i%3===1?'★':'◆'}
            </div>
          ))}
          <div style={{ fontSize:'2vw', color:'rgba(255,255,255,.25)', fontFamily:'Share Tech Mono', letterSpacing:'.6em', marginBottom:'2vh', animation:'fadeIn .8s ease' }}>✦ FIN DE LA PARTIE ✦</div>
          <div style={{ fontSize:'6vw', fontWeight:900, color:'#c8a96e', letterSpacing:'.25em', animation:'shimmer 2s infinite' }}>BULLS RACE</div>
          <div style={{ marginTop:'4vh', animation:'riseUp .8s ease .5s both' }}>
            <div style={{ textAlign:'center', background:'rgba(200,169,110,.08)', border:'1px solid rgba(200,169,110,.4)', borderRadius:'2vw', padding:'3vw 5vw' }}>
              <div style={{ fontSize:'3vw', marginBottom:'1.5vh' }}>🏆</div>
              <div style={{ fontSize:'4.5vw', fontWeight:900, color:'#ffd700', animation:'shimmer 1.5s infinite' }}>@{state.winner}</div>
              <div style={{ fontSize:'1.2vw', color:'rgba(255,255,255,.3)', fontFamily:'Share Tech Mono', letterSpacing:'.4em', marginTop:'1.2vh' }}>A GAGNÉ LA BULLS RACE !</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:'2vw', marginTop:'4vh', animation:'fadeIn .8s ease 1s both' }}>
            {players.slice(0,3).map((p,i) => (
              <div key={p.id} style={{ textAlign:'center', padding:'1.5vw 2.5vw', background:'rgba(255,255,255,.03)', border:`1px solid ${p.color}30`, borderRadius:'1vw' }}>
                <div style={{ fontSize:'1.8vw', marginBottom:'.4vh' }}>{i===0?'🥇':i===1?'🥈':'🥉'}</div>
                <div style={{ fontSize:'1.5vw', fontWeight:900, color:p.color }}>@{p.username}</div>
                <div style={{ fontSize:'.9vw', color:'rgba(255,255,255,.3)', fontFamily:'Share Tech Mono', marginTop:'.3vh' }}>Case {p.position}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ ROUE ══ */}
      {isWheel && <WheelScreen state={state} />}

      {/* ══ DUEL ══ */}
      {isDuel && (() => {
        const ef = state.case_effect ? (typeof state.case_effect === 'string' ? JSON.parse(state.case_effect) : state.case_effect) : {}
        const isDuelResult = state.status === 'duel_result'
        const challenger = state.duel_challenger || ef.challenger || '???'
        const opponent   = state.duel_opponent   || ef.opponent   || '???'
        const winner     = isDuelResult ? state.first_answerer : null
        const loser      = isDuelResult ? (winner===challenger?opponent:challenger) : null
        return (
          <div style={{ position:'absolute', inset:0, zIndex:70, background:'rgba(0,0,0,.93)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', animation:'bgIn .3s ease' }}>
            <div style={{ position:'absolute', inset:0, background:'linear-gradient(135deg, rgba(255,45,120,.12) 0%, transparent 50%, rgba(123,47,255,.12) 100%)' }} />
            <div style={{ fontSize:'1.5vw', color:'#fff', fontFamily:'Share Tech Mono', letterSpacing:'.6em', marginBottom:'2vh' }}>{isDuelResult?'✦ RÉSULTAT DU DUEL ✦':'✦ DUEL ✦'}</div>
            {!isDuelResult && state.current_question && (
              <div style={{ maxWidth:'70vw', textAlign:'center', marginBottom:'3vh', padding:'1.5vh 3vw', background:'rgba(255,255,255,.04)', border:'1px solid rgba(255,255,255,.1)', borderRadius:'1vw', animation:'fadeIn .5s ease .5s both' }}>
                {state.current_category && <div style={{ fontSize:'.9vw', color:'#ff2d78', fontFamily:'Share Tech Mono', letterSpacing:'.3em', marginBottom:'.8vh' }}>{state.current_category.toUpperCase()}</div>}
                <div style={{ fontSize:'2.2vw', fontWeight:700, color:'#fff' }}>{state.current_question}</div>
              </div>
            )}
            <div style={{ display:'flex', alignItems:'center', width:'100%', justifyContent:'center', gap:'4vw' }}>
              <div style={{ flex:1, textAlign:'center', animation:'duelSlideL .5s cubic-bezier(.34,1.56,.64,1)' }}>
                <div style={{ fontSize:isDuelResult&&winner===challenger?'8vw':'5vw', marginBottom:'1.5vh' }}>{isDuelResult?(winner===challenger?'🏆':'💀'):'⚔️'}</div>
                <div style={{ fontSize:'3vw', fontWeight:900, color:isDuelResult&&loser===challenger?'rgba(255,45,120,.4)':'#ff2d78' }}>@{challenger}</div>
                <div style={{ fontSize:'1.2vw', color:'#fff', fontFamily:'Share Tech Mono', marginTop:'1vh', letterSpacing:'.2em' }}>CHALLENGER</div>
                {isDuelResult && <div style={{ fontSize:'2vw', fontWeight:900, marginTop:'1vh', color:winner===challenger?'#ffd700':'#ff3860', animation:'bigTextIn .5s ease .3s both' }}>{winner===challenger?'+3 CASES 🚀':'-3 CASES 💀'}</div>}
              </div>
              <div style={{ textAlign:'center', flexShrink:0 }}>
                <div style={{ fontSize:'9vw', fontWeight:900, color:isDuelResult?'#ffd700':'#fff', animation:'duelVS .6s cubic-bezier(.34,1.56,.64,1) .4s both' }}>{isDuelResult?'!':'VS'}</div>
              </div>
              <div style={{ flex:1, textAlign:'center', animation:'duelSlideR .5s cubic-bezier(.34,1.56,.64,1)' }}>
                <div style={{ fontSize:isDuelResult&&winner===opponent?'8vw':'5vw', marginBottom:'1.5vh' }}>{isDuelResult?(winner===opponent?'🏆':'💀'):'🛡️'}</div>
                <div style={{ fontSize:'3vw', fontWeight:900, color:isDuelResult&&loser===opponent?'rgba(123,47,255,.4)':'#7b2fff' }}>@{opponent}</div>
                <div style={{ fontSize:'1.2vw', color:'#fff', fontFamily:'Share Tech Mono', marginTop:'1vh', letterSpacing:'.2em' }}>EN TÊTE</div>
                {isDuelResult && <div style={{ fontSize:'2vw', fontWeight:900, marginTop:'1vh', color:winner===opponent?'#ffd700':'#ff3860', animation:'bigTextIn .5s ease .3s both' }}>{winner===opponent?'+3 CASES 🚀':'-3 CASES 💀'}</div>}
              </div>
            </div>
            {!isDuelResult && <div style={{ marginTop:'3vh', fontSize:'1.1vw', color:'#fff', fontFamily:'Share Tech Mono', letterSpacing:'.3em' }}>SEULS CES DEUX JOUEURS PEUVENT RÉPONDRE</div>}
            {isDuelResult && <div style={{ marginTop:'3vh', fontSize:'1.5vw', color:'#ffd700', fontFamily:'Share Tech Mono', letterSpacing:'.3em', animation:'subTextIn .5s ease .8s both' }}>🏆 @{winner} REMPORTE LE DUEL !</div>}
          </div>
        )
      })()}

      {/* ══ JEU NORMAL ══ */}
      {!isPodium && !isWaiting && !isDuel && !isWheel && state.status !== 'rules' && (
        <>
          {/* Classement ligne haut */}
          <div style={{ position:'absolute', top:0, left:0, right:0, height:'7vh', background:'rgba(0,0,0,.75)', borderBottom:'1px solid rgba(255,45,120,.2)', display:'flex', alignItems:'center', padding:'0 2vw', zIndex:20, gap:'1.2vw' }}>
            <div style={{ fontSize:'1.1vw', color:'#ff2d78', fontFamily:'Share Tech Mono', fontWeight:900, flexShrink:0 }}>🏆</div>
            {players.length === 0 ? (
              <div style={{ fontSize:'.9vw', color:'rgba(255,255,255,.3)', fontFamily:'Share Tech Mono' }}>En attente de joueurs...</div>
            ) : players.map((p,i) => (
              <div key={p.id} style={{ display:'flex', alignItems:'center', gap:'.5vw', padding:'.3vh .8vw', borderRadius:'2vw', background:i===0?'rgba(255,215,0,.08)':'rgba(255,255,255,.04)', border:`1px solid ${i===0?'rgba(255,215,0,.3)':p.color+'40'}`, flexShrink:0 }}>
                <div style={{ width:'.8vw', height:'.8vw', borderRadius:'50%', background:p.color, boxShadow:`0 0 4px ${p.color}` }} />
                <div style={{ fontSize:'1vw', fontWeight:900, color:i===0?'#ffd700':'#fff', fontFamily:'Share Tech Mono' }}>
                  {i===0?'🥇':i===1?'🥈':i===2?'🥉':`#${i+1}`} @{p.username}
                </div>
                <div style={{ fontSize:'.75vw', color:p.color, fontFamily:'Share Tech Mono' }}>c.{p.position}</div>
                {p.is_blocked && <span style={{ fontSize:'.7vw', color:'#ff2d78' }}>🔒</span>}
              </div>
            ))}
            {state.round_number > 0 && (
              <div style={{ marginLeft:'auto', fontSize:'.9vw', color:'#fff', fontFamily:'Share Tech Mono', letterSpacing:'.2em', flexShrink:0 }}>ROUND {state.round_number}</div>
            )}
          </div>

          {/* Circuit */}
          <canvas ref={canvasRef} width={1920} height={900}
            style={{ position:'absolute', top:'7vh', left:0, width:'100%', height:'77vh', zIndex:10 }} />

          {/* Barre bas */}
          <div style={{ position:'absolute', bottom:0, left:0, right:0, height:'16vh', background:'rgba(0,0,0,.9)', borderTop:'1px solid rgba(255,255,255,.07)', display:'flex', alignItems:'center', zIndex:25, padding:'0 2.5vw' }}>
            {isPlaying && state.current_question && (
              <>
                <div style={{ flexShrink:0, textAlign:'center', marginRight:'2vw', minWidth:'6vw' }}>
                  <div style={{ fontSize:'5.5vw', fontWeight:900, color:timer<=5?'#ff3860':'#00f5ff', lineHeight:1, animation:timer<=5?'pulse .5s infinite':'none' }}>{timer}</div>
                  <div style={{ fontSize:'.9vw', color:'#fff', fontFamily:'Share Tech Mono' }}>SEC</div>
                </div>
                <div style={{ width:1, height:'60%', background:'rgba(255,255,255,.1)', marginRight:'2vw' }} />
                <div style={{ flex:1 }}>
                  {state.current_category && <div style={{ fontSize:'1.1vw', color:'#ff2d78', fontFamily:'Share Tech Mono', letterSpacing:'.3em', marginBottom:'.4vh' }}>{state.current_category.toUpperCase()}</div>}
                  <div style={{ fontSize:'2.6vw', fontWeight:700, color:'#fff', lineHeight:1.3, animation:'qPulse 3s ease-in-out infinite' }}>{state.current_question}</div>
                </div>
                <div style={{ flexShrink:0, textAlign:'center', marginLeft:'2vw' }}>
                  <div style={{ fontSize:'.9vw', color:'#fff', fontFamily:'Share Tech Mono', marginBottom:'.4vh' }}>1ER CORRECT</div>
                  <div style={{ fontSize:'2.5vw', fontWeight:900, color:'#ffd700' }}>+3</div>
                  <div style={{ fontSize:'.8vw', color:'#fff', fontFamily:'Share Tech Mono' }}>CASES</div>
                  {state.first_answerer && <div style={{ marginTop:'.4vh', fontSize:'.9vw', color:'#ffd700', fontFamily:'Share Tech Mono', fontWeight:900 }}>🥇 @{state.first_answerer}</div>}
                </div>
              </>
            )}
            {isRevealed && !isDuel && (
              <div style={{ flex:1, display:'flex', alignItems:'center', gap:'2vw', animation:'fadeIn .5s ease' }}>
                <div style={{ fontSize:'1.8vw', color:'#fff', fontFamily:'Share Tech Mono', letterSpacing:'.4em', fontWeight:700 }}>✦ LA RÉPONSE ÉTAIT ✦</div>
                <div style={{ fontSize:'4vw', fontWeight:900, color:'#00ff88', textShadow:'0 0 20px rgba(0,255,136,.4)' }}>{state.current_answer}</div>
                {state.first_answerer && (
                  <div style={{ padding:'.6vh 1.5vw', background:'rgba(255,215,0,.08)', border:'1px solid rgba(255,215,0,.3)', borderRadius:'2vw', fontSize:'1.4vw', color:'#ffd700', fontFamily:'Share Tech Mono' }}>
                    🏆 @{state.first_answerer}
                  </div>
                )}
              </div>
            )}
            {state.status === 'idle' && (
              <div style={{ flex:1, textAlign:'center', color:'#fff', fontFamily:'Share Tech Mono', fontSize:'2vw', letterSpacing:'.3em', fontWeight:900 }}>EN ATTENTE DU PROCHAIN ROUND...</div>
            )}
          </div>

          {/* Effets spéciaux */}
          {effect && effect.type === 'bonus' && (
            <div style={{ position:'absolute', inset:0, zIndex:60, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'radial-gradient(ellipse at 50% 50%, rgba(255,215,0,.25) 0%, rgba(0,0,0,.85) 70%)', animation:'bgIn .3s ease' }}>
              {[...Array(14)].map((_,i)=><div key={i} style={{ position:'absolute', left:`${5+i*6.5}%`, bottom:'-5vh', width:`${.6+(i%3)*.4}vw`, height:`${1.5+(i%4)*.5}vw`, background:['#ffd700','#ff2d78','#00f5ff','#00ff88','#ff8c00'][i%5], borderRadius:'2px', animation:`confetti ${2.5+(i%4)*.5}s ease-in ${i*.12}s both`, transform:`rotate(${i*18}deg)`, opacity:0 }}/>)}
              <div style={{ fontSize:'12vw', animation:'bonusExp .7s cubic-bezier(.34,1.56,.64,1)', marginBottom:'2vh' }}>⭐</div>
              <div style={{ fontSize:'6vw', fontWeight:900, color:'#ffd700', letterSpacing:'.15em', animation:'bigTextIn .6s ease .3s both' }}>BONUS !</div>
              <div style={{ fontSize:'3.5vw', fontWeight:900, color:'#fff', animation:'bigTextIn .6s ease .5s both', marginTop:'1vh' }}>+{effect.value} CASES</div>
              <div style={{ fontSize:'2vw', color:'rgba(255,215,0,.8)', fontFamily:'Share Tech Mono', animation:'subTextIn .5s ease .8s both', marginTop:'1.5vh' }}>@{effect.player}</div>
            </div>
          )}
          {effect && effect.type === 'trap' && (
            <div style={{ position:'absolute', inset:0, zIndex:60, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'radial-gradient(ellipse at 50% 50%, rgba(255,30,30,.3) 0%, rgba(0,0,0,.9) 70%)', animation:'bgIn .2s ease' }}>
              <div style={{ animation:'trapShake .8s ease .3s', textAlign:'center' }}>
                <div style={{ fontSize:'11vw', animation:'bonusExp .6s cubic-bezier(.34,1.56,.64,1)', marginBottom:'2vh' }}>💀</div>
                <div style={{ fontSize:'5.5vw', fontWeight:900, color:'#ff3860', letterSpacing:'.15em', animation:'bigTextIn .6s ease .4s both' }}>PIÈGE !</div>
                <div style={{ fontSize:'3vw', fontWeight:900, color:'#fff', animation:'bigTextIn .6s ease .6s both', marginTop:'1vh' }}>{effect.value} CASES</div>
                <div style={{ fontSize:'2vw', color:'rgba(255,100,100,.8)', fontFamily:'Share Tech Mono', animation:'subTextIn .5s ease .9s both', marginTop:'1.5vh' }}>@{effect.player} recule !</div>
              </div>
            </div>
          )}
          {effect && effect.type === 'joker' && (
            <div style={{ position:'absolute', inset:0, zIndex:60, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'radial-gradient(ellipse at 50% 50%, rgba(0,245,255,.15) 0%, rgba(0,0,0,.9) 70%)', animation:'bgIn .3s ease' }}>
              <div style={{ fontSize:'13vw', animation:'jokerFlip .8s ease', marginBottom:'2vh' }}>🃏</div>
              <div style={{ fontSize:'5.5vw', fontWeight:900, color:'#00f5ff', letterSpacing:'.15em', animation:'bigTextIn .6s ease .4s both' }}>JOKER !</div>
              <div style={{ marginTop:'2.5vh', padding:'1.5vh 3vw', background:'rgba(255,45,120,.1)', border:'2px solid rgba(255,45,120,.6)', borderRadius:'1.5vw', animation:'bigTextIn .6s ease .7s both' }}>
                <div style={{ fontSize:'1.2vw', color:'#fff', fontFamily:'Share Tech Mono', letterSpacing:'.3em', marginBottom:'.8vh' }}>BLOQUÉ POUR UN ROUND</div>
                <div style={{ fontSize:'2.5vw', fontWeight:900, color:'#ff2d78' }}>🔒 @{effect.blocked}</div>
              </div>
              <div style={{ fontSize:'1.5vw', color:'rgba(0,245,255,.6)', fontFamily:'Share Tech Mono', animation:'subTextIn .5s ease 1s both', marginTop:'2vh', letterSpacing:'.2em' }}>Par @{effect.player}</div>
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
    { id:'blocked',  label:'Bloqué 1 tour',              emoji:'🔒', color:'#ff2d78' },
    { id:'advance1', label:'Avance 1 case',              emoji:'⬆️', color:'#00ff88' },
    { id:'back1',    label:'Recule 1 case',              emoji:'⬇️', color:'#ff8c00' },
    { id:'first',    label:'Passe devant tout le monde', emoji:'🚀', color:'#ffd700' },
    { id:'last',     label:'Passe derriere tout le monde', emoji:'🐢', color:'#00f5ff' },
    { id:'start',    label:'Retour au depart',           emoji:'🏠', color:'#a855f7' },
  ]
  const N = SEGMENTS.length
  const segAngle = 360 / N
  const resultIdx = SEGMENTS.findIndex(s => s.id === ef.result)
  const targetAngle = resultIdx >= 0 ? (360 - (resultIdx * segAngle + segAngle / 2)) : 0
  const totalSpin = 1800 + targetAngle

  useEffect(() => {
    if (state.status !== 'wheel') return
    const t = setTimeout(async () => {
      try { await fetch('https://blindtest-live.vercel.app/api/race-wheel-apply', { method:'POST', headers:{'Content-Type':'application/json'} }) }
      catch(e) { console.error(e) }
    }, 4000)
    return () => clearTimeout(t)
  }, [state.status])

  useEffect(() => {
    if (state.status !== 'wheel_result') return
    setShowResult(false)
    const t1 = setTimeout(() => setShowResult(true), 5500)
    const t2 = setTimeout(async () => {
      try {
        const { createClient } = await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm')
        const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
        await sb.from('race_state').update({ status:'revealed', updated_at: new Date().toISOString() }).eq('session_id','bulls-race')
      } catch(e) { console.error(e) }
    }, 8000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [state.status])

  return (
    <div style={{ position:'absolute', inset:0, zIndex:70, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,.95)' }}>
      <div style={{ fontSize:'1.3vw', color:'#fff', fontFamily:'Share Tech Mono', letterSpacing:'.5em', marginBottom:'.8vh', fontWeight:900 }}>🎡 CASE MYSTÈRE</div>
      <div style={{ fontSize:'2.5vw', fontWeight:900, color:'#a855f7', textShadow:'0 0 3vw rgba(168,85,247,.8)', letterSpacing:'.2em', marginBottom:'2vh' }}>@{state.wheel_player}</div>
      <div style={{ position:'relative', width:'28vw', height:'28vw', marginBottom:'2vh' }}>
        <div style={{ position:'absolute', top:'-1.8vw', left:'50%', transform:'translateX(-50%)', zIndex:10, fontSize:'2.5vw' }}>▼</div>
        <svg viewBox="0 0 400 400" style={{ width:'100%', height:'100%', transformOrigin:'50% 50%', animation: isResult ? `wheelSpin 5s cubic-bezier(.17,.67,.12,1) forwards` : 'wheelInfinite 1.5s linear infinite', '--spin-deg':`${totalSpin}deg` }}>
          {SEGMENTS.map((seg,i) => {
            const sa = (i*segAngle-90)*Math.PI/180, ea = ((i+1)*segAngle-90)*Math.PI/180
            const x1=200+190*Math.cos(sa), y1=200+190*Math.sin(sa)
            const x2=200+190*Math.cos(ea), y2=200+190*Math.sin(ea)
            const ma = ((i+.5)*segAngle-90)*Math.PI/180
            const tx=200+130*Math.cos(ma), ty=200+130*Math.sin(ma)
            return (
              <g key={seg.id}>
                <path d={`M200,200 L${x1},${y1} A190,190 0 0,1 ${x2},${y2} Z`} fill={seg.color} opacity=".9" stroke="#000" strokeWidth="2"/>
                <text x={tx} y={ty} textAnchor="middle" dominantBaseline="middle" fontSize="28">{seg.emoji}</text>
              </g>
            )
          })}
          <circle cx="200" cy="200" r="25" fill="#111" stroke="#fff" strokeWidth="3"/>
          <text x="200" y="200" textAnchor="middle" dominantBaseline="middle" fontSize="20">🎡</text>
        </svg>
      </div>
      {isResult && showResult && ef.emoji && (
        <div style={{ textAlign:'center', animation:'bigTextIn .5s ease' }}>
          <div style={{ fontSize:'4vw', marginBottom:'.8vh' }}>{ef.emoji}</div>
          <div style={{ fontSize:'3vw', fontWeight:900, color:'#fff' }}>{ef.label} !</div>
        </div>
      )}
      {!isResult && <div style={{ fontSize:'1.1vw', color:'rgba(255,255,255,.5)', fontFamily:'Share Tech Mono', letterSpacing:'.3em' }}>LA ROUE TOURNE...</div>}
    </div>
  )
}

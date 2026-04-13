import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../lib/supabase'

const SESSION_ID = 'bulls-race'

const BOARD = [
  { id:  0, type: 'start'  },
  { id:  1, type: 'normal' },
  { id:  2, type: 'bonus',  value: 2  },
  { id:  3, type: 'normal' },
  { id:  4, type: 'wheel'  },
  { id:  5, type: 'normal' },
  { id:  6, type: 'trap',   value: -2 },
  { id:  7, type: 'normal' },
  { id:  8, type: 'joker'  },
  { id:  9, type: 'normal' },
  { id: 10, type: 'wheel'  },
  { id: 11, type: 'normal' },
  { id: 12, type: 'trap',   value: -3 },
  { id: 13, type: 'wheel'  },
  { id: 14, type: 'bonus',  value: 2  },
  { id: 15, type: 'normal' },
  { id: 16, type: 'wheel'  },
  { id: 17, type: 'trap',   value: -2 },
  { id: 18, type: 'normal' },
  { id: 19, type: 'wheel'  },
  { id: 20, type: 'bonus',  value: 2  },
  { id: 21, type: 'joker'  },
  { id: 22, type: 'normal' },
  { id: 23, type: 'wheel'  },
  { id: 24, type: 'normal' },
  { id: 25, type: 'finish' },
]

const CIRCUIT_PTS = [
  {x:9,y:22},{x:19,y:22},{x:29,y:22},{x:39,y:22},{x:49,y:22},
  {x:59,y:22},{x:69,y:22},{x:79,y:22},{x:87,y:22},
  {x:94,y:36},{x:94,y:52},
  {x:87,y:64},{x:76,y:64},{x:65,y:64},{x:54,y:64},
  {x:43,y:64},{x:32,y:64},{x:21,y:64},{x:10,y:64},
  {x:3.5,y:76},
  {x:14,y:86},{x:28,y:86},{x:43,y:86},{x:58,y:86},{x:73,y:86},{x:87,y:86},
]
const BC={start:'#ff2d78',normal:'rgba(255,255,255,0.5)',bonus:'#ffd700',trap:'#ff3860',duel:'#7b2fff',joker:'#00f5ff',wheel:'#a855f7',finish:'#c8a96e'}
const BF={start:'rgba(255,45,120,0.3)',normal:'rgba(255,255,255,0.06)',bonus:'rgba(255,215,0,0.2)',trap:'rgba(255,60,60,0.2)',duel:'rgba(123,47,255,0.25)',joker:'rgba(0,245,255,0.2)',wheel:'rgba(168,85,247,0.25)',finish:'rgba(200,169,110,0.35)'}

const CASE_ICONS = { normal: '⬜', bonus: '⭐', trap: '💀', duel: '⚔️', joker: '🃏', wheel: '🎡', start: '🚀', finish: '🏁' }
const CASE_COLORS = { normal: 'rgba(255,255,255,.08)', bonus: 'rgba(255,215,0,.2)', trap: 'rgba(255,60,60,.2)', duel: 'rgba(123,47,255,.25)', joker: 'rgba(0,245,255,.2)', wheel: 'rgba(168,85,247,.25)', start: 'rgba(255,255,255,.05)', finish: 'rgba(200,169,110,.3)' }

export default function BullsRaceAdmin() {
  const [previousStatus, setPreviousStatus] = useState('idle')
  const [state,      setState]      = useState({ status: 'idle', current_question: '', current_answer: '', current_category: '', round_number: 0, first_answerer: null, duel_challenger: null, duel_opponent: null, case_effect: null, winner: null })
  const [players,    setPlayers]    = useState([])
  const [questions,  setQuestions]  = useState([])
  const [tab,        setTab]        = useState('control')
  const [loading,    setLoading]    = useState(false)
  const [generating, setGenerating] = useState(false)
  const [timer,      setTimer]      = useState(30)
  const timerRef = useRef(null)
  const adminCanvasRef = useRef(null)
  const [log,        setLog]        = useState([])

  useEffect(() => {
    loadAll()
    const ch1 = supabase.channel('race_state_ch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'race_state', filter: `session_id=eq.${SESSION_ID}` },
        p => { setState(p.new); addLog(p.new) })
      .subscribe()
    const ch2 = supabase.channel('race_players_ch')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'race_players', filter: `session_id=eq.${SESSION_ID}` },
        () => loadPlayers())
      .subscribe()
    return () => { supabase.removeChannel(ch1); supabase.removeChannel(ch2) }
  }, [])

  useEffect(() => {
    clearInterval(timerRef.current)
    if (state.status === 'playing' && state.timer_end) {
      timerRef.current = setInterval(() => {
        const remaining = Math.max(0, Math.round((new Date(state.timer_end) - Date.now()) / 1000))
        setTimer(remaining)
        if (remaining <= 0) { clearInterval(timerRef.current); handleReveal() }
      }, 500)
    }
    if (state.status === 'idle') setTimer(30)
    if (state.status === 'revealed') clearInterval(timerRef.current)
    return () => clearInterval(timerRef.current)
  }, [state.status, state.timer_end])

  function addLog(newState) {
    if (newState.first_answerer) {
      setLog(prev => [{
        text: `✅ ${newState.first_answerer} a trouvé en 1er ! (+3 cases)`,
        time: new Date().toLocaleTimeString()
      }, ...prev].slice(0, 20))
    }
    if (newState.case_effect) {
      const e = typeof newState.case_effect === 'string' ? JSON.parse(newState.case_effect) : newState.case_effect
      if (e) setLog(prev => [{
        text: formatEffect(e),
        time: new Date().toLocaleTimeString()
      }, ...prev].slice(0, 20))
    }
  }

  function formatEffect(e) {
    if (!e) return ''
    if (e.type === 'bonus')  return `⭐ ${e.player} tombe sur BONUS +${e.value} cases !`
    if (e.type === 'trap')   return `💀 ${e.player} tombe sur PIÈGE ${e.value} cases !`
    if (e.type === 'joker')  return `🃏 ${e.player} lance le dé : +${e.dice} cases !`
    if (e.type === 'duel')   return `⚔️ DUEL : ${e.challenger} vs ${e.opponent} !`
    return ''
  }

  async function loadAll() {
    await Promise.all([loadState(), loadPlayers(), loadQuestions()])
  }
  async function loadState() {
    const { data } = await supabase.from('race_state').select('*').eq('session_id', SESSION_ID).single()
    if (data) setState(data)
  }
  async function loadPlayers() {
    const { data } = await supabase.from('race_players').select('*').eq('session_id', SESSION_ID).order('position', { ascending: false })
    setPlayers(data || [])
  }
  async function loadQuestions() {
    const { data } = await supabase.from('race_questions').select('*').eq('session_id', SESSION_ID).order('position')
    if (data) {
      // Mélange les non-utilisées, garde les utilisées à la fin
      const unused = data.filter(q => !q.used).sort(() => Math.random() - 0.5)
      const used   = data.filter(q => q.used)
      setQuestions([...unused, ...used])
    } else {
      setQuestions([])
    }
  }

  const [newQuestion, setNewQuestion] = useState('')
  const [newAnswer,   setNewAnswer]   = useState('')
  const [newCategory, setNewCategory] = useState('général')

  async function handleManualAdd() {
    if (!newQuestion.trim() || !newAnswer.trim()) return
    const row = {
      session_id: SESSION_ID,
      question: newQuestion.trim(),
      answer: newAnswer.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim(),
      category: newCategory.trim() || 'général',
      used: false,
      position: questions.length
    }
    await supabase.from('race_questions').insert(row)
    setNewQuestion(''); setNewAnswer('')
    await loadQuestions()
  }

  async function handleCSVImport(e) {
    const file = e.target.files[0]
    if (!file) return
    const text = await file.text()
    const lines = text.split('\n').map(l => l.trim()).filter(Boolean)
    const rows = []
    for (const line of lines) {
      const sep = line.includes(';') ? ';' : ','
      const parts = line.split(sep).map(p => p.trim().replace(/^"|"$/g, ''))
      if (parts.length < 2) continue
      const question = parts[0], answer = parts[1], category = parts[2] || 'général'
      if (!question || !answer || question.toLowerCase() === 'question') continue
      rows.push({ session_id: SESSION_ID, question, answer: answer.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim(), category, used: false, position: questions.length + rows.length })
    }
    if (rows.length === 0) return alert('Aucune question valide')
    await supabase.from('race_questions').insert(rows)
    await loadQuestions()
    alert(`✅ ${rows.length} questions importées !`)
    e.target.value = ''
  }

  async function handleExcelImport(e) {
    const file = e.target.files[0]
    if (!file) return
    try {
      if (!window.XLSX) {
        await new Promise((res, rej) => {
          const s = document.createElement('script')
          s.src = 'https://cdn.jsdelivr.net/npm/xlsx/dist/xlsx.full.min.js'
          s.onload = res; s.onerror = rej
          document.head.appendChild(s)
        })
      }
      const data = await file.arrayBuffer()
      const wb = window.XLSX.read(data)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const json = window.XLSX.utils.sheet_to_json(ws, { header: 1 })
      const rows = []
      for (const row of json) {
        const question = String(row[0] || '').trim()
        const answer   = String(row[1] || '').trim()
        const category = String(row[2] || 'général').trim()
        if (!question || !answer || question.toLowerCase() === 'question') continue
        rows.push({ session_id: SESSION_ID, question, answer: answer.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim(), category, used: false, position: questions.length + rows.length })
      }
      if (rows.length === 0) return alert('Aucune question valide')
      await supabase.from('race_questions').insert(rows)
      await loadQuestions()
      alert(`✅ ${rows.length} questions importées !`)
    } catch(err) { alert('Erreur Excel : ' + err.message) }
    e.target.value = ''
  }

  async function handleGenerate() {
    if (generating) return
    setGenerating(true)
    try {
      const res = await fetch('/api/race-generate', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
      const data = await res.json()
      if (data.success) { await loadQuestions(); alert(`${data.count} questions générées !`) }
      else alert('Erreur : ' + data.error)
    } catch (e) { alert('Erreur réseau') }
    setGenerating(false)
  }

  async function handleOpenRegistration() {
    await supabase.from('race_state').update({ status: 'waiting', updated_at: new Date().toISOString() }).eq('session_id', SESSION_ID)
    await loadState()
  }

  async function handleStartRound() {
    if (loading) return
    const nextQ = questions.find(q => !q.used)
    if (!nextQ) return alert('Plus de questions disponibles ! Générez-en d\'autres.')
    setLoading(true)
    // Auto-génération désactivée — utiliser l'import CSV/Excel ou IA manuellement
    const timerEnd = new Date(Date.now() + 30 * 1000).toISOString()
    const newRound = (state.round_number || 0) + 1
    const newState = {
      status: 'playing',
      current_question: nextQ.question,
      current_answer: nextQ.answer,
      current_category: nextQ.category,
      round_number: newRound,
      first_answerer: null,
      duel_challenger: null,
      duel_opponent: null,
      case_effect: null,
      timer_end: timerEnd,
      timer_duration: 30,
      updated_at: new Date().toISOString()
    }
    await supabase.from('race_questions').update({ used: true }).eq('id', nextQ.id)
    await supabase.from('race_state').update(newState).eq('session_id', SESSION_ID)
    setState(prev => ({ ...prev, ...newState }))
    loadQuestions()
    setLoading(false)
  }

  async function handleReveal() {
    clearInterval(timerRef.current)
    if (state.status === 'revealed') return
    await supabase.from('race_state').update({ status: 'revealed', updated_at: new Date().toISOString() }).eq('session_id', SESSION_ID)
    await loadState()
  }

  async function handleIdle() {
    await supabase.from('race_state').update({ status: 'idle', current_question: null, current_answer: null, first_answerer: null, case_effect: null, updated_at: new Date().toISOString() }).eq('session_id', SESSION_ID)
  }

  async function handleEndGame() {
    if (!confirm('Terminer la partie et afficher le gagnant ?')) return
    const leader = players[0]
    await supabase.from('race_state').update({ status: 'finished', winner: leader?.username || null, updated_at: new Date().toISOString() }).eq('session_id', SESSION_ID)
  }

  async function handleStartDuel() {
    if (loading) return
    const nextQ = questions.find(q => !q.used)
    if (!nextQ) return alert('Plus de questions disponibles !')
    setLoading(true)
    const timerEnd = new Date(Date.now() + 30 * 1000).toISOString()
    const newState = {
      status: 'duel',
      current_question: nextQ.question,
      current_answer: nextQ.answer,
      current_category: nextQ.category,
      round_number: (state.round_number || 0) + 1,
      first_answerer: null,
      case_effect: null,
      timer_end: timerEnd,
      timer_duration: 30,
      updated_at: new Date().toISOString()
    }
    await supabase.from('race_questions').update({ used: true }).eq('id', nextQ.id)
    await supabase.from('race_state').update(newState).eq('session_id', SESSION_ID)
    setState(prev => ({ ...prev, ...newState }))
    loadQuestions()
    setLoading(false)
  }

  async function handleDeleteQuestion(id) {
    await supabase.from('race_questions').delete().eq('id', id)
    loadQuestions()
  }

  async function handleResetQuestion(id) {
    await supabase.from('race_questions').update({ used: false }).eq('id', id)
    loadQuestions()
  }

  async function handleResetAllQuestions() {
    if (!confirm('Remettre toutes les questions en disponible ?')) return
    await supabase.from('race_questions').update({ used: false }).eq('session_id', SESSION_ID).eq('used', true)
    loadQuestions()
  }

  async function handleShowRules() {
    setPreviousStatus(state.status)
    await supabase.from('race_state').update({ status: 'rules', updated_at: new Date().toISOString() }).eq('session_id', SESSION_ID)
    await loadState()
  }

  async function handleCloseRules() {
    await supabase.from('race_state').update({ status: previousStatus, updated_at: new Date().toISOString() }).eq('session_id', SESSION_ID)
    await loadState()
  }

  async function handleReset() {
    if (!confirm('Remettre à zéro toute la partie ? (joueurs, scores, état)')) return
    await supabase.from('race_players').delete().eq('session_id', SESSION_ID)
    await supabase.from('race_questions').update({ used: false }).eq('session_id', SESSION_ID)
    await supabase.from('race_state').update({
      status: 'idle', current_question: null, current_answer: null, current_category: null,
      round_number: 0, first_answerer: null, duel_challenger: null, duel_opponent: null,
      case_effect: null, winner: null, updated_at: new Date().toISOString()
    }).eq('session_id', SESSION_ID)
    setLog([])
    loadAll()
  }

  async function handleAdjustPosition(playerId, delta) {
    const p = players.find(x => x.id === playerId)
    if (!p) return
    const newPos = Math.max(0, Math.min(25, p.position + delta))
    await supabase.from('race_players').update({ position: newPos }).eq('id', playerId)
  }

  async function handleRemovePlayer(playerId) {
    const p = players.find(x => x.id === playerId)
    if (!p) return
    if (!confirm(`Retirer @${p.username} de la partie ?`)) return
    await supabase.from('race_players').delete().eq('id', playerId)
    loadPlayers()
  }

  const statusColor = { idle: '#888', waiting: '#ffd700', playing: '#00f5ff', revealed: '#00ff88', duel: '#ff2d78', duel_result: '#ff8c00', wheel: '#a855f7', wheel_result: '#a855f7', finished: '#c8a96e', rules: '#b388ff' }
  const statusLabel = { idle: '⏸ STANDBY', waiting: '👥 INSCRIPTIONS', playing: '🔴 EN DIRECT', revealed: '✅ RÉVÉLÉ', duel: '⚔️ DUEL', duel_result: '⚔️ RÉSULTAT DUEL', wheel: '🎡 ROUE', wheel_result: '🎡 RÉSULTAT ROUE', finished: '🏆 TERMINÉ', rules: '🔊 RÈGLES' }
  const unusedCount = questions.filter(q => !q.used).length

  useEffect(() => {
    const canvas = adminCanvasRef.current
    if (!canvas) return
    // Petit délai pour s'assurer que le canvas est bien rendu
    const draw = () => {
    const ctx = canvas.getContext('2d')
    const W = canvas.width, H = canvas.height
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = '#07070f'; ctx.fillRect(0, 0, W, H)
    const px = x => x/100*W, py = y => y/100*H
    const Y1=22, Y2=64, Y3=86, XL=9, XR=87
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = H*0.1
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(px(XL),py(Y1)); ctx.lineTo(px(XR),py(Y1))
    ctx.bezierCurveTo(px(XR+12),py(Y1),px(XR+12),py(Y2),px(XR),py(Y2))
    ctx.lineTo(px(XL),py(Y2))
    ctx.bezierCurveTo(px(XL-10),py(Y2),px(XL-10),py(Y3),px(XL+5),py(Y3))
    ctx.lineTo(px(XR),py(Y3))
    ctx.stroke()
    BOARD.forEach((c, i) => {
      if (i >= CIRCUIT_PTS.length) return
      const pt = CIRCUIT_PTS[i], cx = px(pt.x), cy = py(pt.y)
      const isS = c.type !== 'normal'
      const r = (c.type==='start'||c.type==='finish') ? H*0.085 : isS ? H*0.08 : H*0.065
      if (isS) { ctx.beginPath(); ctx.arc(cx,cy,r+H*0.015,0,Math.PI*2); ctx.fillStyle=BF[c.type]; ctx.fill() }
      ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle='#0f0f1e'; ctx.fill()
      ctx.strokeStyle = BC[c.type]; ctx.lineWidth = isS ? 3 : 1.5; ctx.stroke()
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      const fs = H*0.045
      if (c.type==='start') { ctx.fillStyle='#ff2d78'; ctx.font=`900 ${fs*.75}px Arial Black,Arial`; ctx.fillText('GO',cx,cy) }
      else if (c.type==='finish') { ctx.fillStyle='#ffd700'; ctx.font=`900 ${fs*.7}px Arial Black,Arial`; ctx.fillText('FIN',cx,cy) }
      else if (c.type==='normal') { ctx.fillStyle='rgba(255,255,255,0.5)'; ctx.font=`700 ${fs*.6}px Arial`; ctx.fillText(i,cx,cy) }
      else if (c.type==='bonus') { ctx.fillStyle='#ffd700'; ctx.font=`900 ${fs*.75}px Arial Black,Arial`; ctx.fillText('+'+c.value,cx,cy-r*.22); ctx.font=`${fs*.55}px Arial`; ctx.fillText('★',cx,cy+r*.4) }
      else if (c.type==='trap') { ctx.fillStyle='#ff3860'; ctx.font=`900 ${fs*.75}px Arial Black,Arial`; ctx.fillText(c.value,cx,cy-r*.22); ctx.font=`${fs*.55}px Arial`; ctx.fillText('☠',cx,cy+r*.4) }
      else if (c.type==='joker') { ctx.fillStyle='#00f5ff'; ctx.font=`900 ${fs*.5}px Arial Black,Arial`; ctx.fillText('JOKER',cx,cy-r*.25); ctx.font=`${fs*.6}px Arial`; ctx.fillText('J',cx,cy+r*.38) }
      else if (c.type==='wheel') { ctx.fillStyle='#a855f7'; ctx.font=`900 ${fs*.45}px Arial Black,Arial`; ctx.fillText('MYST.',cx,cy-r*.25); ctx.font=`${fs*.65}px Arial`; ctx.fillText('🎡',cx,cy+r*.38) }
      const here = players.filter(p => p.position === c.id)
      here.forEach((p, pi) => {
        const ox = (pi-(here.length-1)/2)*r*.6, pr = r*.38
        ctx.beginPath(); ctx.arc(cx+ox,cy,pr,0,Math.PI*2); ctx.fillStyle=p.color; ctx.fill()
        ctx.strokeStyle='#fff'; ctx.lineWidth=1.5; ctx.stroke()
        ctx.fillStyle='#000'; ctx.font=`900 ${pr*.9}px Arial`
        ctx.fillText(p.username.charAt(0).toUpperCase(),cx+ox,cy)
      })
    })
    }
    draw()
    const t = setTimeout(draw, 150)
    return () => clearTimeout(t)
  }, [players, state, tab])

  return (
    <div style={{ fontFamily: "'Orbitron', monospace", background: '#07070f', minHeight: '100vh', color: '#fff' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes pulse { 0%,100%{opacity:.5} 50%{opacity:1} }
        @keyframes slideIn { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:translateY(0)} }
        .tab-btn { background:transparent; border:none; border-bottom:2px solid transparent; color:rgba(255,255,255,.35); padding:12px 16px; font-family:'Orbitron',monospace; font-size:10px; cursor:pointer; transition:all .2s; text-transform:uppercase; letter-spacing:2px; }
        .tab-btn.active { color:#ff2d78; border-bottom-color:#ff2d78; }
        .btn { border:none; padding:12px 18px; border-radius:8px; font-family:'Orbitron',monospace; font-weight:700; font-size:11px; cursor:pointer; transition:all .18s; text-transform:uppercase; width:100%; }
        .btn:disabled { opacity:.3; cursor:not-allowed; }
        .btn-red  { background:linear-gradient(135deg,#ff2d78,#b0005f); color:#fff; }
        .btn-red:hover:not(:disabled)  { transform:translateY(-1px); box-shadow:0 6px 22px rgba(255,45,120,.5); }
        .btn-cyan { background:transparent; border:1.5px solid #00f5ff; color:#00f5ff; }
        .btn-cyan:hover:not(:disabled) { background:rgba(0,245,255,.08); }
        .btn-gold { background:transparent; border:1.5px solid #ffd700; color:#ffd700; }
        .btn-gold:hover:not(:disabled) { background:rgba(255,215,0,.08); }
        .btn-ghost { background:transparent; border:1px solid rgba(255,255,255,.15); color:rgba(255,255,255,.5); font-family:'Share Tech Mono',monospace; }
        .btn-ghost:hover:not(:disabled) { border-color:rgba(255,255,255,.4); color:#fff; }
        .card { background:rgba(255,255,255,.025); border:1px solid rgba(255,255,255,.08); border-radius:12px; padding:16px; margin-bottom:14px; }
        .label { font-size:9px; color:rgba(255,255,255,.3); font-family:'Share Tech Mono',monospace; letter-spacing:2.5px; text-transform:uppercase; margin-bottom:10px; display:block; }
        .player-row { display:flex; align-items:center; gap:10px; padding:10px 12px; border-radius:9px; margin-bottom:7px; border:1px solid rgba(255,255,255,.06); background:rgba(255,255,255,.02); animation:slideIn .2s ease; }
        .scroll::-webkit-scrollbar { width:3px; }
        .scroll::-webkit-scrollbar-thumb { background:rgba(255,45,120,.4); border-radius:2px; }
        .log-row { padding:7px 10px; border-radius:6px; margin-bottom:4px; font-family:'Share Tech Mono',monospace; font-size:11px; background:rgba(255,255,255,.02); border:1px solid rgba(255,255,255,.05); animation:slideIn .2s ease; }
        .case-cell { border-radius:7px; display:flex; flex-direction:column; align-items:center; justify-content:center; border:1px solid rgba(255,255,255,.08); font-size:10px; padding:4px 2px; cursor:default; }
        .mini-btn { background:transparent; border:1px solid rgba(255,255,255,.15); color:rgba(255,255,255,.5); width:24px; height:24px; border-radius:5px; cursor:pointer; font-size:13px; display:flex; align-items:center; justify-content:center; transition:all .15s; }
        .mini-btn:hover { border-color:rgba(255,255,255,.4); color:#fff; }
      `}</style>

      {/* Header */}
      <div style={{ padding: '13px 20px', borderBottom: '1px solid rgba(255,45,120,.2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(255,45,120,.03)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,#ff2d78,#7b2fff)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, boxShadow: '0 0 14px rgba(255,45,120,.5)' }}>🎲</div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 13, letterSpacing: 3 }}>BULLS<span style={{ color: '#ff2d78' }}>RACE</span></div>
            <div style={{ fontSize: 8, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', letterSpacing: 2 }}>PANNEAU ADMIN</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono' }}>
            ROUND {state.round_number} • {unusedCount} Q restantes
          </div>
          <div style={{ padding: '6px 14px', borderRadius: 20, border: `1px solid ${statusColor[state.status] || '#888'}40`, background: `${statusColor[state.status] || '#888'}10`, fontSize: 10, fontFamily: 'Share Tech Mono', color: statusColor[state.status] || '#888' }}>
            <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: statusColor[state.status] || '#888', marginRight: 6, animation: state.status === 'playing' ? 'pulse 1s infinite' : 'none' }} />
            {statusLabel[state.status] || state.status}
          </div>
          {state.status === 'rules' ? (
            <button className="btn btn-ghost" style={{ width: 'auto', padding: '7px 12px', fontSize: 10, color: '#b388ff', borderColor: 'rgba(179,136,255,.4)' }} onClick={handleCloseRules}>✕ FERMER RÈGLES</button>
          ) : (
            <button className="btn btn-ghost" style={{ width: 'auto', padding: '7px 12px', fontSize: 10, color: '#b388ff', borderColor: 'rgba(179,136,255,.4)' }} onClick={handleShowRules}>🔊 RÈGLES DU JEU</button>
          )}
          <button className="btn btn-ghost" style={{ width: 'auto', padding: '7px 12px', fontSize: 10 }} onClick={handleReset}>🔄 Reset</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,.07)', padding: '0 20px', display: 'flex' }}>
        {[['control','🎮 JEU'],['questions','❓ Questions']].map(([id, label]) => (
          <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div style={{ padding: '18px', maxWidth: 1200, margin: '0 auto' }}>

        {/* ═══ CONTRÔLE ═══ */}
        {tab === 'control' && (
          <div style={{ display: 'grid', gridTemplateColumns: '230px 1fr', gap: 14, alignItems: 'start' }}>

            {/* ── Colonne gauche : Actions + Question ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="card">
                <span className="label">📋 état de la partie</span>
                <div style={{ display: 'grid', gap: 8 }}>
                  {state.status === 'idle' && (
                    <>
                      <button className="btn btn-gold" onClick={handleOpenRegistration}>👥 OUVRIR LES INSCRIPTIONS</button>
                      <button className="btn btn-red" disabled={players.length === 0} onClick={handleStartRound}>▶ LANCER LE 1ER ROUND</button>
                    </>
                  )}
                  {state.status === 'waiting' && (
                    <>
                      <div style={{ textAlign: 'center', padding: '8px 0', color: '#ffd700', fontFamily: 'Share Tech Mono', fontSize: 12 }}>
                        👥 {players.length}/10 joueurs inscrits
                      </div>
                      <div style={{ padding: '6px 10px', background: 'rgba(255,215,0,.05)', border: '1px solid rgba(255,215,0,.2)', borderRadius: 8, fontSize: 10, color: 'rgba(255,255,255,.4)', fontFamily: 'Share Tech Mono' }}>
                        Les viewers tapent <strong style={{ color: '#ffd700' }}>!join</strong> sur TikTok
                      </div>
                      <button className="btn btn-red" disabled={players.length === 0 || unusedCount === 0} onClick={handleStartRound}>▶ DÉMARRER LA PARTIE</button>
                    </>
                  )}
                  {state.status === 'playing' && (
                    <>
                      <div style={{ textAlign: 'center', padding: '10px 0' }}>
                        <div style={{ fontSize: 44, fontWeight: 900, color: timer <= 5 ? '#ff3860' : '#00f5ff', lineHeight: 1 }}>{timer}</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', marginTop: 3 }}>secondes restantes</div>
                      </div>
                      <button className="btn btn-cyan" onClick={handleReveal}>👁 RÉVÉLER LA RÉPONSE</button>
                    </>
                  )}
                  {state.status === 'revealed' && (
                    <>
                      <button className="btn btn-red" disabled={unusedCount === 0} onClick={handleStartRound}>▶ QUESTION SUIVANTE</button>
                      <button className="btn btn-ghost" onClick={handleIdle}>⏸ PAUSE</button>
                      <button className="btn btn-gold" onClick={handleEndGame}>🏆 TERMINER LA PARTIE</button>
                    </>
                  )}
                  {state.status === 'duel' && (
                    <>
                      <div style={{ padding: '8px 10px', background: 'rgba(255,45,120,.06)', border: '1px solid rgba(255,45,120,.3)', borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', fontFamily: 'Share Tech Mono', marginBottom: 4 }}>⚔️ DUEL EN COURS</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#ff2d78' }}>@{state.duel_challenger}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', margin: '3px 0' }}>VS</div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#7b2fff' }}>@{state.duel_opponent || '???'}</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.2)', fontFamily: 'Share Tech Mono', marginTop: 4 }}>Seuls ces 2 joueurs peuvent répondre</div>
                      </div>
                      <button className="btn btn-cyan" onClick={handleReveal}>👁 RÉVÉLER LA RÉPONSE</button>
                    </>
                  )}
                  {state.status === 'duel_result' && (
                    <>
                      <div style={{ padding: '8px 10px', background: 'rgba(255,140,0,.06)', border: '1px solid rgba(255,140,0,.3)', borderRadius: 8, textAlign: 'center' }}>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', fontFamily: 'Share Tech Mono', marginBottom: 4 }}>🏆 RÉSULTAT DUEL</div>
                        <div style={{ fontSize: 12, fontWeight: 700, color: '#ffd700' }}>🥇 @{state.first_answerer} +3</div>
                        <div style={{ fontSize: 11, color: '#ff3860', marginTop: 3 }}>💀 adversaire -3</div>
                      </div>
                      <button className="btn btn-red" disabled={unusedCount === 0} onClick={handleStartRound}>▶ QUESTION SUIVANTE</button>
                      <button className="btn btn-gold" onClick={handleEndGame}>🏆 TERMINER LA PARTIE</button>
                    </>
                  )}
                  {(state.status === 'wheel' || state.status === 'wheel_result') && (() => {
                    const ef = state.case_effect ? (typeof state.case_effect === 'string' ? JSON.parse(state.case_effect) : state.case_effect) : {}
                    return (
                      <>
                        <div style={{ padding: '8px 10px', background: 'rgba(168,85,247,.06)', border: '1px solid rgba(168,85,247,.3)', borderRadius: 8, textAlign: 'center' }}>
                          <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', fontFamily: 'Share Tech Mono', marginBottom: 4 }}>🎡 ROUE MYSTÈRE</div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: '#a855f7' }}>@{state.wheel_player}</div>
                          {state.status === 'wheel_result' && ef.emoji && (
                            <div style={{ marginTop: 6, fontSize: 12, color: '#fff', fontFamily: 'Share Tech Mono' }}>{ef.emoji} {ef.label}</div>
                          )}
                        </div>
                        {state.status === 'wheel_result' && (
                          <>
                            <button className="btn btn-red" disabled={unusedCount === 0} onClick={handleStartRound}>▶ QUESTION SUIVANTE</button>
                            <button className="btn btn-gold" onClick={handleEndGame}>🏆 TERMINER LA PARTIE</button>
                          </>
                        )}
                      </>
                    )
                  })()}
                  {state.status === 'finished' && (
                    <div style={{ textAlign: 'center', padding: '12px 0' }}>
                      <div style={{ fontSize: 28, marginBottom: 6 }}>🏆</div>
                      <div style={{ fontWeight: 900, color: '#ffd700', fontSize: 16 }}>{state.winner}</div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', marginTop: 4 }}>A GAGNÉ !</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Question en cours + suivante */}
              <div className="card">
                <span className="label">❓ question en cours</span>
                {state.current_question ? (
                  <>
                    <div style={{ fontSize: 9, color: '#ff2d78', fontFamily: 'Share Tech Mono', letterSpacing: 2, marginBottom: 8 }}>{state.current_category?.toUpperCase()}</div>
                    <div style={{ fontSize: 14, fontWeight: 700, lineHeight: 1.5, marginBottom: 10 }}>{state.current_question}</div>
                    {state.current_answer && (
                      <div style={{ padding: '8px 12px', background: state.status === 'revealed' || state.status === 'duel_result' ? 'rgba(0,255,136,.06)' : 'rgba(255,215,0,.04)', border: `1px solid ${state.status === 'revealed' || state.status === 'duel_result' ? 'rgba(0,255,136,.3)' : 'rgba(255,215,0,.2)'}`, borderRadius: 8 }}>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.4)', fontFamily: 'Share Tech Mono', marginBottom: 3 }}>RÉPONSE</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: state.status === 'revealed' || state.status === 'duel_result' ? '#00ff88' : '#ffd700' }}>{state.current_answer}</div>
                      </div>
                    )}
                    {state.first_answerer && (
                      <div style={{ marginTop: 8, padding: '6px 10px', background: 'rgba(255,215,0,.06)', border: '1px solid rgba(255,215,0,.25)', borderRadius: 8, fontSize: 11, color: '#ffd700', fontFamily: 'Share Tech Mono' }}>
                        🥇 1er : @{state.first_answerer}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: 'rgba(255,255,255,.15)', fontFamily: 'Share Tech Mono', fontSize: 10 }}>
                    Aucune question en cours
                  </div>
                )}
              </div>

              {/* Question suivante */}
              {(() => {
                const nextQ = questions.filter(q => !q.used && q.question !== state.current_question)[0]
                if (!nextQ) return null
                return (
                  <div className="card" style={{ border: '1px solid rgba(255,255,255,.06)', background: 'rgba(255,255,255,.02)' }}>
                    <span className="label" style={{ color: 'rgba(255,255,255,.25)' }}>👁 question suivante</span>
                    <div style={{ fontSize: 9, color: 'rgba(255,45,120,.5)', fontFamily: 'Share Tech Mono', letterSpacing: 2, marginBottom: 6 }}>{nextQ.category?.toUpperCase()}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.5, marginBottom: 8, color: 'rgba(255,255,255,.7)' }}>{nextQ.question}</div>
                    <div style={{ padding: '6px 10px', background: 'rgba(255,255,255,.03)', border: '1px solid rgba(255,255,255,.08)', borderRadius: 8 }}>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.25)', fontFamily: 'Share Tech Mono', marginBottom: 3 }}>RÉPONSE</div>
                      <div style={{ fontSize: 15, fontWeight: 900, color: 'rgba(255,215,0,.6)' }}>{nextQ.answer}</div>
                    </div>
                  </div>
                )
              })()}

              {/* Événements */}
              <div className="card">
                <span className="label">📋 événements</span>
                <div className="scroll" style={{ maxHeight: 160, overflowY: 'auto' }}>
                  {log.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: 'rgba(255,255,255,.1)', fontFamily: 'Share Tech Mono', fontSize: 10 }}>Aucun événement</div>
                  ) : log.map((l, i) => (
                    <div key={i} className="log-row">
                      <span style={{ color: '#ff2d78', marginRight: 6, fontSize: 10 }}>{l.time}</span>
                      {l.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* ── Colonne droite : Circuit + Joueurs ── */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="card" style={{ padding: 10 }}>
                <span className="label" style={{ marginBottom: 6 }}>🗺 plateau — 25 cases</span>
                <canvas ref={adminCanvasRef} width={1800} height={750}
                  style={{ width: '100%', borderRadius: 8, display: 'block' }} />
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8 }}>
                  {[['bonus','⭐ Bonus'],['trap','💀 Piège'],['joker','🃏 Joker'],['wheel','🎡 Mystère'],['finish','🏁 Arrivée']].map(([type, label]) => (
                    <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'rgba(255,255,255,.6)', fontFamily: 'Share Tech Mono' }}>
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: CASE_COLORS[type] }} />
                      {label}
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <span className="label" style={{ marginBottom: 0 }}>👥 joueurs ({players.length}/10)</span>
                  <span style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono' }}>{unusedCount} Q restantes</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                  {players.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '16px 0', color: 'rgba(255,255,255,.15)', fontFamily: 'Share Tech Mono', fontSize: 11, gridColumn: 'span 2' }}>
                      Aucun joueur — tapent !join
                    </div>
                  ) : players.map((p, i) => (
                    <div key={p.id} className="player-row">
                      <div style={{ width: 9, height: 9, borderRadius: '50%', background: p.color, flexShrink: 0, boxShadow: `0 0 5px ${p.color}` }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}@{p.username}
                          {p.is_blocked && <span style={{ marginLeft: 4, fontSize: 9, color: '#ff2d78' }}>🔒</span>}
                        </div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', marginTop: 1 }}>
                          c.{p.position} — {CASE_ICONS[BOARD[p.position]?.type || 'normal']}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 3, alignItems: 'center', flexShrink: 0 }}>
                        <button className="mini-btn" onClick={() => handleAdjustPosition(p.id, -1)}>−</button>
                        <span style={{ fontSize: 12, fontWeight: 900, color: p.color, minWidth: 20, textAlign: 'center' }}>{p.position}</span>
                        <button className="mini-btn" onClick={() => handleAdjustPosition(p.id, 1)}>+</button>
                        <button className="mini-btn" style={{ borderColor: 'rgba(255,60,60,.6)', color: '#ff3860', background: 'rgba(255,60,60,.1)' }} onClick={() => handleRemovePlayer(p.id)} title="Retirer ce joueur">✕</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ QUESTIONS ═══ */}
        {tab === 'questions' && (
          <div style={{ maxWidth: 800 }}>
            <div className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <div>
                  <span className="label" style={{ marginBottom: 4 }}>❓ banque de questions</span>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono' }}>
                    {unusedCount} disponibles · {questions.length - unusedCount} utilisées
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" style={{ width: 'auto', padding: '8px 14px', fontSize: 10 }} onClick={handleResetAllQuestions}>↺ Reset toutes</button>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <label style={{ padding: '9px 14px', background: 'rgba(0,245,255,.1)', border: '1px solid rgba(0,245,255,.4)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Share Tech Mono', fontSize: 11, color: '#00f5ff', letterSpacing: '.1em', whiteSpace: 'nowrap' }}>
                      📥 CSV
                      <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={handleCSVImport} />
                    </label>
                    <label style={{ padding: '9px 14px', background: 'rgba(0,255,136,.08)', border: '1px solid rgba(0,255,136,.4)', borderRadius: 8, cursor: 'pointer', fontFamily: 'Share Tech Mono', fontSize: 11, color: '#00ff88', letterSpacing: '.1em', whiteSpace: 'nowrap' }}>
                      📊 EXCEL
                      <input type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={handleExcelImport} />
                    </label>
                    <button className="btn btn-red" style={{ width: 'auto', padding: '9px 16px' }} onClick={handleGenerate} disabled={generating}>
                      {generating ? '⏳' : '🤖 IA'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Ajout manuel */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 110px auto', gap: 8, marginBottom: 14, paddingBottom: 14, borderBottom: '1px solid rgba(255,255,255,.06)' }}>
                <input className="inp" placeholder="Question..." value={newQuestion} onChange={e => setNewQuestion(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleManualAdd()} />
                <input className="inp" placeholder="Réponse..." value={newAnswer} onChange={e => setNewAnswer(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleManualAdd()} />
                <input className="inp" placeholder="Catégorie" value={newCategory} onChange={e => setNewCategory(e.target.value)} />
                <button className="btn btn-pink" style={{ width: 'auto', padding: '10px 14px' }} onClick={handleManualAdd} disabled={!newQuestion.trim() || !newAnswer.trim()}>+ ADD</button>
              </div>

              {questions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,.1)', fontFamily: 'Share Tech Mono', fontSize: 12, lineHeight: 2.2 }}>
                  Aucune question.<br />Cliquez sur "Générer" pour créer la banque de questions via IA.
                </div>
              ) : (
                <div className="scroll" style={{ maxHeight: 600, overflowY: 'auto' }}>
                  {questions.map((q, i) => (
                    <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, marginBottom: 6, background: q.used ? 'rgba(255,255,255,.01)' : 'rgba(255,255,255,.025)', border: `1px solid ${q.used ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.08)'}`, opacity: q.used ? 0.5 : 1 }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.2)', fontFamily: 'Share Tech Mono', minWidth: 24 }}>#{i+1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{q.question}</div>
                        <div style={{ fontSize: 10, color: '#00ff88', fontFamily: 'Share Tech Mono', marginTop: 3 }}>→ {q.answer}</div>
                      </div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono' }}>{q.category}</div>
                      {q.used && (
                        <button onClick={() => handleResetQuestion(q.id)} style={{ background: 'transparent', border: '1px solid rgba(0,245,255,.3)', color: '#00f5ff', padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 10, fontFamily: 'Share Tech Mono', whiteSpace: 'nowrap' }}>↺ reset</button>
                      )}
                      <button onClick={() => handleDeleteQuestion(q.id)} style={{ background: 'transparent', border: '1px solid rgba(255,60,60,.3)', color: 'rgba(255,60,60,.6)', padding: '3px 8px', borderRadius: 5, cursor: 'pointer', fontSize: 10, flexShrink: 0 }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function formatEffect(e) {
  if (!e) return ''
  if (e.type === 'bonus')  return `⭐ ${e.player} — BONUS +${e.value} cases !`
  if (e.type === 'trap')   return `💀 ${e.player} — PIÈGE ${e.value} cases !`
  if (e.type === 'joker')  return `🃏 ${e.player} lance le dé : +${e.dice} cases !`
  if (e.type === 'duel')   return `⚔️ DUEL — ${e.challenger} vs ${e.opponent} !`
  return ''
}

function renderBoardCell(id, players) {
  const BOARD = [
  { id:  0, type: 'start'  },
  { id:  1, type: 'normal' },
  { id:  2, type: 'bonus',  value: 2  },
  { id:  3, type: 'normal' },
  { id:  4, type: 'wheel'  },
  { id:  5, type: 'normal' },
  { id:  6, type: 'trap',   value: -2 },
  { id:  7, type: 'normal' },
  { id:  8, type: 'joker'  },
  { id:  9, type: 'normal' },
  { id: 10, type: 'wheel'  },
  { id: 11, type: 'normal' },
  { id: 12, type: 'trap',   value: -3 },
  { id: 13, type: 'wheel'  },
  { id: 14, type: 'bonus',  value: 2  },
  { id: 15, type: 'normal' },
  { id: 16, type: 'wheel'  },
  { id: 17, type: 'trap',   value: -2 },
  { id: 18, type: 'normal' },
  { id: 19, type: 'wheel'  },
  { id: 20, type: 'bonus',  value: 2  },
  { id: 21, type: 'joker'  },
  { id: 22, type: 'normal' },
  { id: 23, type: 'wheel'  },
  { id: 24, type: 'normal' },
  { id: 25, type: 'finish' },
]
  const CASE_ICONS  = { normal: '⬜', bonus: '⭐', trap: '💀', duel: '⚔️', joker: '🃏', start: '🚀', finish: '🏁' }
  const CASE_COLORS = { normal: 'rgba(255,255,255,.05)', bonus: 'rgba(255,215,0,.15)', trap: 'rgba(255,60,60,.15)', duel: 'rgba(123,47,255,.2)', joker: 'rgba(0,245,255,.15)', finish: 'rgba(200,169,110,.25)' }
  const c = BOARD[id]
  const playersHere = players.filter(p => p.position === id)
  return (
    <div key={id} style={{ background: CASE_COLORS[c.type] || CASE_COLORS.normal, border: `1px solid ${playersHere.length > 0 ? 'rgba(255,255,255,.3)' : 'rgba(255,255,255,.08)'}`, borderRadius: 6, padding: '4px 2px', minHeight: 54, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', position: 'relative' }}>
      <div style={{ fontSize: 8, color: 'rgba(255,255,255,.25)', fontFamily: 'Share Tech Mono' }}>{id}</div>
      <div style={{ fontSize: 14 }}>{CASE_ICONS[c.type]}</div>
      <div style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
        {playersHere.map(p => (
          <div key={p.id} style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, boxShadow: `0 0 4px ${p.color}` }} title={p.username} />
        ))}
      </div>
    </div>
  )
}

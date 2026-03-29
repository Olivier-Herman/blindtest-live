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

const CASE_ICONS = { normal: '⬜', bonus: '⭐', trap: '💀', duel: '⚔️', joker: '🃏', start: '🚀', finish: '🏁' }
const CASE_COLORS = { normal: 'rgba(255,255,255,.08)', bonus: 'rgba(255,215,0,.2)', trap: 'rgba(255,60,60,.2)', duel: 'rgba(123,47,255,.25)', joker: 'rgba(0,245,255,.2)', start: 'rgba(255,255,255,.05)', finish: 'rgba(200,169,110,.3)' }

export default function BullsRaceAdmin() {
  const [state,      setState]      = useState({ status: 'idle', current_question: '', current_answer: '', current_category: '', round_number: 0, first_answerer: null, duel_challenger: null, duel_opponent: null, case_effect: null, winner: null })
  const [players,    setPlayers]    = useState([])
  const [questions,  setQuestions]  = useState([])
  const [tab,        setTab]        = useState('control')
  const [loading,    setLoading]    = useState(false)
  const [generating, setGenerating] = useState(false)
  const [timer,      setTimer]      = useState(30)
  const timerRef = useRef(null)
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
    if (e.type === 'joker')  return `🃏 ${e.player} bloque ${e.blocked} !`
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
    setQuestions(data || [])
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

  async function handleShowRules() {
    await supabase.from('race_state').update({ status: 'rules', updated_at: new Date().toISOString() }).eq('session_id', SESSION_ID)
    await loadState()
  }

  async function handleCloseRules() {
    await supabase.from('race_state').update({ status: 'idle', updated_at: new Date().toISOString() }).eq('session_id', SESSION_ID)
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
    const newPos = Math.max(0, Math.min(30, p.position + delta))
    await supabase.from('race_players').update({ position: newPos }).eq('id', playerId)
  }

  async function handleRemovePlayer(playerId) {
    await supabase.from('race_players').delete().eq('id', playerId)
  }

  const statusColor = { idle: '#888', waiting: '#ffd700', playing: '#00f5ff', revealed: '#00ff88', duel: '#ff2d78', finished: '#c8a96e', rules: '#b388ff' }
  const statusLabel = { idle: '⏸ STANDBY', waiting: '👥 INSCRIPTIONS', playing: '🔴 EN DIRECT', revealed: '✅ RÉVÉLÉ', duel: '⚔️ DUEL', finished: '🏆 TERMINÉ', rules: '🔊 RÈGLES' }
  const unusedCount = questions.filter(q => !q.used).length

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
        {[['control','🎮 Contrôle'],['plateau','🗺 Plateau'],['questions','❓ Questions']].map(([id, label]) => (
          <button key={id} className={`tab-btn ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>
        ))}
      </div>

      <div style={{ padding: '18px', maxWidth: 1200, margin: '0 auto' }}>

        {/* ═══ CONTRÔLE ═══ */}
        {tab === 'control' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

            {/* Colonne 1 — Actions */}
            <div>
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
                      <div style={{ textAlign: 'center', padding: '10px 0', color: '#ffd700', fontFamily: 'Share Tech Mono', fontSize: 12 }}>
                        👥 {players.length}/10 joueurs inscrits
                      </div>
                      <div style={{ padding: '8px 12px', background: 'rgba(255,215,0,.05)', border: '1px solid rgba(255,215,0,.2)', borderRadius: 8, fontSize: 10, color: 'rgba(255,255,255,.4)', fontFamily: 'Share Tech Mono' }}>
                        Les viewers tapent <strong style={{ color: '#ffd700' }}>!join</strong> sur TikTok
                      </div>
                      <button className="btn btn-red" disabled={players.length === 0 || unusedCount === 0} onClick={handleStartRound}>▶ DÉMARRER LA PARTIE</button>
                    </>
                  )}
                  {state.status === 'playing' && (
                    <>
                      <div style={{ textAlign: 'center', padding: '14px 0' }}>
                        <div style={{ fontSize: 48, fontWeight: 900, color: timer <= 5 ? '#ff3860' : '#00f5ff', lineHeight: 1 }}>{timer}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', marginTop: 4 }}>secondes restantes</div>
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
                  {state.status === 'finished' && (
                    <div style={{ textAlign: 'center', padding: '16px 0' }}>
                      <div style={{ fontSize: 32, marginBottom: 8 }}>🏆</div>
                      <div style={{ fontWeight: 900, color: '#ffd700', fontSize: 18 }}>{state.winner}</div>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', marginTop: 6 }}>A GAGNÉ LA PARTIE !</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Webhook URL info */}
              <div className="card">
                <span className="label">🔗 TikFinity webhook URL</span>
                <div style={{ padding: '8px 10px', background: 'rgba(0,0,0,.3)', borderRadius: 6, fontFamily: 'Share Tech Mono', fontSize: 10, color: 'rgba(255,255,255,.5)', wordBreak: 'break-all' }}>
                  {window.location.origin}/api/race-webhook
                </div>
                <div style={{ marginTop: 8, fontSize: 9, color: 'rgba(255,255,255,.2)', fontFamily: 'Share Tech Mono' }}>
                  Champ: content • Format: application/x-www-form-urlencoded
                </div>
              </div>
            </div>

            {/* Colonne 2 — Question en cours */}
            <div>
              <div className="card">
                <span className="label">❓ question en cours</span>
                {state.current_question ? (
                  <>
                    <div style={{ fontSize: 9, color: '#ff2d78', fontFamily: 'Share Tech Mono', letterSpacing: 2, marginBottom: 10 }}>{state.current_category?.toUpperCase()}</div>
                    <div style={{ fontSize: 16, fontWeight: 700, lineHeight: 1.5, marginBottom: 14 }}>{state.current_question}</div>
                    {state.status === 'revealed' && (
                      <div style={{ padding: '10px 14px', background: 'rgba(0,255,136,.06)', border: '1px solid rgba(0,255,136,.3)', borderRadius: 8 }}>
                        <div style={{ fontSize: 9, color: 'rgba(0,255,136,.6)', fontFamily: 'Share Tech Mono', marginBottom: 4 }}>RÉPONSE</div>
                        <div style={{ fontSize: 20, fontWeight: 900, color: '#00ff88' }}>{state.current_answer}</div>
                      </div>
                    )}
                    {state.first_answerer && (
                      <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(255,215,0,.06)', border: '1px solid rgba(255,215,0,.25)', borderRadius: 8, fontSize: 12, color: '#ffd700', fontFamily: 'Share Tech Mono' }}>
                        🥇 1er : @{state.first_answerer}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(255,255,255,.15)', fontFamily: 'Share Tech Mono', fontSize: 11 }}>
                    Aucune question en cours
                  </div>
                )}
              </div>

              {/* Case effect */}
              {state.case_effect && (
                <div className="card" style={{ border: '1px solid rgba(255,45,120,.3)', background: 'rgba(255,45,120,.04)' }}>
                  <span className="label">⚡ dernier effet de case</span>
                  <div style={{ fontSize: 13, fontFamily: 'Share Tech Mono', color: '#fff' }}>
                    {formatEffect(typeof state.case_effect === 'string' ? JSON.parse(state.case_effect) : state.case_effect)}
                  </div>
                </div>
              )}
            </div>

            {/* Colonne 3 — Log des événements */}
            <div>
              <div className="card" style={{ height: 500 }}>
                <span className="label">📋 événements</span>
                <div className="scroll" style={{ height: 440, overflowY: 'auto' }}>
                  {log.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: '40px 0', color: 'rgba(255,255,255,.1)', fontFamily: 'Share Tech Mono', fontSize: 11 }}>
                      Aucun événement
                    </div>
                  ) : log.map((l, i) => (
                    <div key={i} className="log-row">
                      <span style={{ color: '#ff2d78', marginRight: 8 }}>{l.time}</span>
                      {l.text}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═══ PLATEAU ═══ */}
        {tab === 'plateau' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>
            {/* Board grid */}
            <div className="card">
              <span className="label">🗺 plateau de jeu — 30 cases</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, marginBottom: 12 }}>
                {/* Row 0 (top): cases 25-30 */}
                {[25,26,27,28,29,30].map(id => renderBoardCell(id, players))}
                {/* Row 1: cases 19-24 right to left */}
                {[24,23,22,21,20,19].map(id => renderBoardCell(id, players))}
                {/* Row 2: cases 13-18 */}
                {[13,14,15,16,17,18].map(id => renderBoardCell(id, players))}
                {/* Row 3: cases 7-12 right to left */}
                {[12,11,10,9,8,7].map(id => renderBoardCell(id, players))}
                {/* Row 4 (bottom): cases 1-6 */}
                {[1,2,3,4,5,6].map(id => renderBoardCell(id, players))}
              </div>
              {/* Légende */}
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', borderTop: '1px solid rgba(255,255,255,.06)', paddingTop: 10 }}>
                {[['bonus','⭐ Bonus +cases'],['trap','💀 Piège -cases'],['duel','⚔️ Duel'],['joker','🃏 Joker']].map(([type, label]) => (
                  <div key={type} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'rgba(255,255,255,.4)', fontFamily: 'Share Tech Mono' }}>
                    <div style={{ width: 14, height: 14, borderRadius: 3, background: CASE_COLORS[type] }} />
                    {label}
                  </div>
                ))}
              </div>
            </div>

            {/* Player list */}
            <div>
              <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span className="label" style={{ marginBottom: 0 }}>👥 joueurs ({players.length}/10)</span>
                </div>
                {players.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px 0', color: 'rgba(255,255,255,.15)', fontFamily: 'Share Tech Mono', fontSize: 11 }}>
                    Aucun joueur inscrit<br />Les viewers tapent !join
                  </div>
                ) : players.map((p, i) => (
                  <div key={p.id} className="player-row">
                    <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.color, flexShrink: 0, boxShadow: `0 0 6px ${p.color}` }} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 12, fontWeight: 700 }}>
                        {i === 0 ? '🥇 ' : i === 1 ? '🥈 ' : i === 2 ? '🥉 ' : ''}@{p.username}
                        {p.is_blocked && <span style={{ marginLeft: 6, fontSize: 9, color: '#ff2d78', fontFamily: 'Share Tech Mono' }}>BLOQUÉ</span>}
                      </div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.3)', fontFamily: 'Share Tech Mono', marginTop: 2 }}>
                        Case {p.position}/30 — {CASE_ICONS[BOARD[p.position]?.type || 'normal']} {BOARD[p.position]?.type}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      <button className="mini-btn" onClick={() => handleAdjustPosition(p.id, -1)}>−</button>
                      <span style={{ fontSize: 13, fontWeight: 900, color: p.color, minWidth: 26, textAlign: 'center' }}>{p.position}</span>
                      <button className="mini-btn" onClick={() => handleAdjustPosition(p.id, 1)}>+</button>
                      <button className="mini-btn" style={{ borderColor: 'rgba(255,60,60,.3)', color: 'rgba(255,60,60,.5)' }} onClick={() => handleRemovePlayer(p.id)}>✕</button>
                    </div>
                  </div>
                ))}
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
                <button className="btn btn-red" style={{ width: 'auto', padding: '10px 20px' }} onClick={handleGenerate} disabled={generating}>
                  {generating ? '⏳ GÉNÉRATION...' : '🤖 GÉNÉRER 40 QUESTIONS'}
                </button>
              </div>

              {questions.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 0', color: 'rgba(255,255,255,.1)', fontFamily: 'Share Tech Mono', fontSize: 12, lineHeight: 2.2 }}>
                  Aucune question.<br />Cliquez sur "Générer" pour créer la banque de questions via IA.
                </div>
              ) : (
                <div className="scroll" style={{ maxHeight: 600, overflowY: 'auto' }}>
                  {questions.map((q, i) => (
                    <div key={q.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 8, marginBottom: 6, background: q.used ? 'rgba(255,255,255,.01)' : 'rgba(255,255,255,.025)', border: `1px solid ${q.used ? 'rgba(255,255,255,.04)' : 'rgba(255,255,255,.08)'}`, opacity: q.used ? 0.4 : 1 }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,.2)', fontFamily: 'Share Tech Mono', minWidth: 24 }}>#{i+1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 600 }}>{q.question}</div>
                        <div style={{ fontSize: 10, color: '#00ff88', fontFamily: 'Share Tech Mono', marginTop: 3 }}>→ {q.answer}</div>
                      </div>
                      <div style={{ fontSize: 9, color: 'rgba(255,255,255,.2)', fontFamily: 'Share Tech Mono' }}>{q.category}</div>
                      {q.used && <div style={{ fontSize: 9, color: 'rgba(255,255,255,.2)', fontFamily: 'Share Tech Mono' }}>✓ utilisée</div>}
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
  if (e.type === 'joker')  return `🃏 ${e.player} bloque ${e.blocked} !`
  if (e.type === 'duel')   return `⚔️ DUEL — ${e.challenger} vs ${e.opponent} !`
  return ''
}

function renderBoardCell(id, players) {
  const BOARD = [
    { id: 0, type: 'start' }, { id: 1, type: 'normal' }, { id: 2, type: 'bonus', value: 2 },
    { id: 3, type: 'normal' }, { id: 4, type: 'normal' }, { id: 5, type: 'trap', value: -2 },
    { id: 6, type: 'normal' }, { id: 7, type: 'duel' }, { id: 8, type: 'normal' },
    { id: 9, type: 'normal' }, { id: 10, type: 'bonus', value: 2 }, { id: 11, type: 'normal' },
    { id: 12, type: 'trap', value: -3 }, { id: 13, type: 'normal' }, { id: 14, type: 'joker' },
    { id: 15, type: 'normal' }, { id: 16, type: 'bonus', value: 3 }, { id: 17, type: 'normal' },
    { id: 18, type: 'normal' }, { id: 19, type: 'trap', value: -2 }, { id: 20, type: 'normal' },
    { id: 21, type: 'duel' }, { id: 22, type: 'normal' }, { id: 23, type: 'bonus', value: 2 },
    { id: 24, type: 'normal' }, { id: 25, type: 'trap', value: -3 }, { id: 26, type: 'joker' },
    { id: 27, type: 'normal' }, { id: 28, type: 'duel' }, { id: 29, type: 'bonus', value: 2 },
    { id: 30, type: 'finish' },
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

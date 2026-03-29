import { useNavigate } from 'react-router-dom'
import { GAMES } from '../games.config'

export default function Dashboard() {
  const navigate = useNavigate()

  return (
    <div style={{ minHeight: '100vh', background: '#0a0a0f', fontFamily: "'Orbitron', monospace", display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #0a0a0f !important; }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes shimmer { 0%,100%{text-shadow:0 0 20px rgba(200,169,110,.4)} 50%{text-shadow:0 0 40px rgba(200,169,110,.8), 0 0 80px rgba(200,169,110,.3)} }
        .game-card {
          background: rgba(255,255,255,.03);
          border: 1px solid rgba(255,255,255,.08);
          border-radius: 16px;
          padding: 28px;
          cursor: pointer;
          transition: all .2s ease;
          animation: fadeIn .5s ease both;
        }
        .game-card:hover {
          background: rgba(255,255,255,.06);
          border-color: rgba(255,255,255,.2);
          transform: translateY(-2px);
        }
        .game-card.soon {
          opacity: .4;
          cursor: default;
        }
        .game-card.soon:hover {
          background: rgba(255,255,255,.03);
          border-color: rgba(255,255,255,.08);
          transform: none;
        }
        .btn-overlay {
          background: rgba(255,255,255,.05);
          border: 1px solid rgba(255,255,255,.12);
          color: rgba(255,255,255,.5);
          padding: 8px 14px;
          border-radius: 8px;
          cursor: pointer;
          font-family: 'Share Tech Mono', monospace;
          font-size: 11px;
          letter-spacing: .1em;
          transition: all .2s;
          margin-top: 12px;
          width: 100%;
        }
        .btn-overlay:hover {
          background: rgba(255,255,255,.1);
          color: rgba(255,255,255,.8);
        }
      `}</style>

      {/* Background grid */}
      <div style={{ position: 'fixed', inset: 0, backgroundImage: 'linear-gradient(rgba(255,255,255,.015) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.015) 1px, transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' }} />

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 60, animation: 'fadeIn .5s ease' }}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.25)', fontFamily: 'Share Tech Mono', letterSpacing: '0.5em', marginBottom: 16 }}>
          BULLS AGENCY LIVE
        </div>
        <div style={{ fontSize: 48, fontWeight: 900, color: '#c8a96e', letterSpacing: '0.2em', animation: 'shimmer 3s ease-in-out infinite' }}>
          BULLS LIVE GAMES
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,.2)', fontFamily: 'Share Tech Mono', letterSpacing: '0.4em', marginTop: 14 }}>
          CHOISISSEZ VOTRE JEU
        </div>
      </div>

      {/* Games grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, maxWidth: 900, width: '100%' }}>
        {GAMES.map((game, i) => (
          <div
            key={game.id}
            className={`game-card ${game.status === 'soon' ? 'soon' : ''}`}
            style={{ animationDelay: `${i * 0.1}s`, borderColor: game.status === 'available' ? `${game.color}30` : undefined }}
            onClick={() => game.status === 'available' && navigate(game.adminPath)}
          >
            <div style={{ fontSize: 36, marginBottom: 14 }}>{game.emoji}</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: game.color }}>{game.name}</div>
              {game.status === 'soon' && (
                <span style={{ fontSize: 9, background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.3)', padding: '3px 8px', borderRadius: 20, fontFamily: 'Share Tech Mono', letterSpacing: '.1em' }}>
                  BIENTÔT
                </span>
              )}
              {game.status === 'available' && (
                <span style={{ fontSize: 9, background: `${game.color}20`, color: game.color, padding: '3px 8px', borderRadius: 20, fontFamily: 'Share Tech Mono', letterSpacing: '.1em', border: `1px solid ${game.color}40` }}>
                  DISPONIBLE
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.35)', fontFamily: 'Share Tech Mono', lineHeight: 1.6 }}>
              {game.description}
            </div>
            {game.status === 'available' && (
              <button
                className="btn-overlay"
                onClick={e => { e.stopPropagation(); window.open(game.overlayPath, '_blank') }}
              >
                🖥 OUVRIR L'OVERLAY OBS
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Live Overlay button */}
      <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, animation: 'fadeIn 1s ease .6s both' }}>
        <button
          onClick={() => window.open('/live-overlay', '_blank')}
          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 28px', background: 'rgba(255,45,120,.08)', border: '1px solid rgba(255,45,120,.3)', borderRadius: 10, cursor: 'pointer', fontFamily: 'Share Tech Mono', fontSize: 12, color: '#ff2d78', letterSpacing: '.2em', transition: 'all .2s' }}
          onMouseEnter={e => { e.currentTarget.style.background='rgba(255,45,120,.15)'; e.currentTarget.style.borderColor='rgba(255,45,120,.6)' }}
          onMouseLeave={e => { e.currentTarget.style.background='rgba(255,45,120,.08)'; e.currentTarget.style.borderColor='rgba(255,45,120,.3)' }}
        >
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ff2d78', display: 'inline-block', animation: 'pulse 1.5s ease-in-out infinite' }} />
          🎥 OVERLAY LIVE (ENTRE LES JEUX)
        </button>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,.15)', fontFamily: 'Share Tech Mono', letterSpacing: '.2em' }}>Ouvre dans un nouvel onglet — à capturer dans OBS</div>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 30, fontSize: 10, color: 'rgba(255,255,255,.1)', fontFamily: 'Share Tech Mono', letterSpacing: '0.3em', animation: 'fadeIn 1s ease .5s both' }}>
        BULLS LIVE GAMES • v2.0
      </div>
    </div>
  )
}

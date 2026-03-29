export default function LiveOverlay() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#050510', overflow: 'hidden', position: 'relative', fontFamily: "'Orbitron', monospace" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Share+Tech+Mono&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #050510 !important; }
        @keyframes rotate      { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes rotateCCW   { from{transform:rotate(0deg)} to{transform:rotate(-360deg)} }
        @keyframes shimmerPink { 0%,100%{text-shadow:0 0 30px rgba(255,45,120,.6),0 0 60px rgba(255,45,120,.2)} 50%{text-shadow:0 0 60px rgba(255,45,120,.9),0 0 120px rgba(255,45,120,.4)} }
        @keyframes shimmerGold { 0%,100%{text-shadow:0 0 20px rgba(200,169,110,.4)} 50%{text-shadow:0 0 40px rgba(200,169,110,.8),0 0 80px rgba(200,169,110,.3)} }
        @keyframes pulse       { 0%,100%{opacity:.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.06)} }
        @keyframes borderGlow  { 0%,100%{box-shadow:0 0 20px rgba(255,45,120,.35),inset 0 0 20px rgba(255,45,120,.08)} 50%{box-shadow:0 0 50px rgba(255,45,120,.7),inset 0 0 30px rgba(255,45,120,.15)} }
        @keyframes scanline    { 0%{transform:translateY(-100%)} 100%{transform:translateY(100vh)} }
        @keyframes particleUp  { 0%{transform:translateY(0) rotate(0);opacity:.7} 100%{transform:translateY(-100vh) rotate(360deg);opacity:0} }
        @keyframes fadeSlide   { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
        @keyframes livePulse   { 0%,100%{opacity:1} 50%{opacity:.4} }
        @keyframes ticker      { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
        @keyframes ringPulse   { 0%,100%{opacity:.5} 50%{opacity:.9} }
      `}</style>

      {/* Grille de fond */}
      <div style={{ position: 'absolute', inset: 0, backgroundImage: 'linear-gradient(rgba(255,45,120,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,45,120,.05) 1px, transparent 1px)', backgroundSize: '60px 60px', pointerEvents: 'none' }} />

      {/* Gradient radial en bas (autour cam) */}
      <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 92%, rgba(255,45,120,.22) 0%, rgba(123,47,255,.1) 35%, transparent 65%)', pointerEvents: 'none' }} />

      {/* Scanline */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '12%', background: 'linear-gradient(transparent, rgba(255,255,255,.003), transparent)', animation: 'scanline 12s linear infinite', pointerEvents: 'none', zIndex: 2 }} />

      {/* ══ COINS DÉCO ══ */}
      {[
        { top: '1.5vh', left: '1.5vw',  bt: 'top',    bl: 'left'  },
        { top: '1.5vh', right: '1.5vw', bt: 'top',    bl: 'right' },
        { bottom: '1.5vh', left: '1.5vw',  bt: 'bottom', bl: 'left'  },
        { bottom: '1.5vh', right: '1.5vw', bt: 'bottom', bl: 'right' },
      ].map((c, i) => (
        <div key={i} style={{ position: 'absolute', ...c, width: '4vw', height: '4vw', zIndex: 10, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', [c.bt]: 0, [c.bl]: 0, width: '100%', height: '2px', background: '#ff2d78' }} />
          <div style={{ position: 'absolute', [c.bt]: 0, [c.bl]: 0, width: '2px', height: '100%', background: '#ff2d78' }} />
        </div>
      ))}

      {/* ══ BADGE LIVE ══ */}
      <div style={{ position: 'absolute', top: '2.5vh', left: '3vw', zIndex: 20, display: 'flex', alignItems: 'center', gap: '.6vw' }}>
        <div style={{ width: '.7vw', height: '.7vw', borderRadius: '50%', background: '#ff2d78', animation: 'livePulse 1.2s ease-in-out infinite' }} />
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: '1.1vw', fontWeight: 900, color: '#ff2d78', letterSpacing: '.4em' }}>LIVE</div>
      </div>

      {/* ══ NOM TIKTOK ══ */}
      <div style={{ position: 'absolute', top: '5vh', left: 0, right: 0, textAlign: 'center', zIndex: 20 }}>
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: '1.1vw', color: 'rgba(255,255,255,.25)', letterSpacing: '.8em', marginBottom: '.8vh', animation: 'fadeSlide .8s ease' }}>
          BULLS AGENCY LIVE
        </div>
        <div style={{ fontSize: '6.5vw', fontWeight: 900, color: '#ffffff', letterSpacing: '.08em', lineHeight: 1, animation: 'shimmerPink 2.5s ease-in-out infinite' }}>
          @olimobi82
        </div>
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: '.95vw', color: 'rgba(255,255,255,.2)', letterSpacing: '.6em', marginTop: '1vh' }}>
          CRÉATEUR DE CONTENU TikTok LIVE
        </div>
      </div>

      {/* ══ ANNEAUX ROTATIFS (autour cam) ══ */}
      {/* Anneau 1 */}
      <div style={{ position: 'absolute', bottom: '-8vh', left: '50%', width: '58vw', height: '58vw', marginLeft: '-29vw', borderRadius: '50%', border: '1.5px solid rgba(255,45,120,.3)', animation: 'rotate 14s linear infinite, ringPulse 3s ease-in-out infinite', pointerEvents: 'none', zIndex: 5 }} />
      {/* Anneau 2 dashed */}
      <div style={{ position: 'absolute', bottom: '-12vh', left: '50%', width: '68vw', height: '68vw', marginLeft: '-34vw', borderRadius: '50%', border: '1px dashed rgba(123,47,255,.25)', animation: 'rotateCCW 20s linear infinite', pointerEvents: 'none', zIndex: 5 }} />
      {/* Anneau 3 fin */}
      <div style={{ position: 'absolute', bottom: '-18vh', left: '50%', width: '80vw', height: '80vw', marginLeft: '-40vw', borderRadius: '50%', border: '1px solid rgba(0,245,255,.1)', animation: 'rotate 30s linear infinite', pointerEvents: 'none', zIndex: 5 }} />

      {/* Points sur anneau 1 */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 6 }}>
        <circle cx="50%" cy="50%" r="0" fill="none" />
      </svg>

      {/* ══ ZONE CAMÉRA (grande, centrée bas) ══ */}
      <div style={{ position: 'absolute', bottom: '2vh', left: '50%', transform: 'translateX(-50%)', width: '52vw', height: '62vh', zIndex: 15 }}>
        {/* Frame caméra */}
        <div style={{ width: '100%', height: '100%', borderRadius: '1.5vw', background: 'rgba(0,0,0,.5)', border: '2px solid rgba(255,45,120,.5)', animation: 'borderGlow 3s ease-in-out infinite', position: 'relative', overflow: 'hidden' }}>
          {/* Coins intérieurs */}
          {[
            { top: '1vh', left: '1vw',   borderTop: '2px solid #ff2d78', borderLeft: '2px solid #ff2d78',   borderRadius: '4px 0 0 0' },
            { top: '1vh', right: '1vw',  borderTop: '2px solid #ff2d78', borderRight: '2px solid #ff2d78',  borderRadius: '0 4px 0 0' },
            { bottom: '1vh', left: '1vw',  borderBottom: '2px solid #ff2d78', borderLeft: '2px solid #ff2d78',   borderRadius: '0 0 0 4px' },
            { bottom: '1vh', right: '1vw', borderBottom: '2px solid #ff2d78', borderRight: '2px solid #ff2d78', borderRadius: '0 0 4px 0' },
          ].map((s, i) => (
            <div key={i} style={{ position: 'absolute', width: '2.5vw', height: '2.5vw', ...s }} />
          ))}
          {/* Label caméra */}
          <div style={{ position: 'absolute', top: '1.2vh', left: '50%', transform: 'translateX(-50%)', fontFamily: 'Share Tech Mono', fontSize: '.7vw', color: 'rgba(255,45,120,.5)', letterSpacing: '.4em', whiteSpace: 'nowrap' }}>
            ▼ CAMÉRA ▼
          </div>
          {/* Indicateur REC en bas */}
          <div style={{ position: 'absolute', bottom: '1.2vh', right: '1.5vw', display: 'flex', alignItems: 'center', gap: '.4vw' }}>
            <div style={{ width: '.5vw', height: '.5vw', borderRadius: '50%', background: '#ff2d78', animation: 'livePulse 1.2s ease-in-out infinite' }} />
            <div style={{ fontFamily: 'Share Tech Mono', fontSize: '.65vw', color: 'rgba(255,45,120,.6)', letterSpacing: '.2em' }}>REC</div>
          </div>
        </div>
      </div>

      {/* ══ SLOGAN GAUCHE ══ */}
      <div style={{ position: 'absolute', left: '3.5vw', top: '50%', transform: 'translateY(-50%)', zIndex: 20, textAlign: 'left' }}>
        <div style={{ fontSize: '2vw', fontWeight: 900, color: '#ffffff', lineHeight: 1.5, animation: 'fadeSlide .8s ease .2s both' }}>
          JOUE EN
          <br />
          <span style={{ color: '#ff2d78', fontSize: '2.8vw' }}>DIRECT</span>
          <br />
          AVEC MOI
        </div>
        <div style={{ width: '8vw', height: '2px', background: 'linear-gradient(90deg, #ff2d78, transparent)', marginTop: '1.5vh', marginBottom: '1.5vh' }} />
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: '.8vw', color: 'rgba(255,255,255,.3)', lineHeight: 2, letterSpacing: '.2em', animation: 'fadeSlide .8s ease .4s both' }}>
          INTERAGIS DANS LE CHAT<br />POUR PARTICIPER
        </div>
      </div>

      {/* ══ SLOGAN DROIT ══ */}
      <div style={{ position: 'absolute', right: '3.5vw', top: '50%', transform: 'translateY(-50%)', zIndex: 20, textAlign: 'right' }}>
        <div style={{ fontFamily: 'Share Tech Mono', fontSize: '.75vw', color: 'rgba(255,255,255,.2)', letterSpacing: '.6em', marginBottom: '1.5vh', animation: 'fadeSlide .8s ease .3s both' }}>BULLS AGENCY LIVE</div>
        <div style={{ fontSize: '2vw', fontWeight: 900, color: '#ffffff', lineHeight: 1.5, animation: 'fadeSlide .8s ease .5s both' }}>
          CONTENU<br /><span style={{ color: '#7b2fff', fontSize: '2.8vw' }}>LIVE</span><br />TIKTOK
        </div>
        <div style={{ width: '8vw', height: '2px', background: 'linear-gradient(270deg, #7b2fff, transparent)', marginTop: '1.5vh', marginLeft: 'auto' }} />
      </div>

      {/* ══ TICKER BAS ══ */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '3.5vh', background: 'rgba(0,0,0,.8)', borderTop: '1px solid rgba(255,45,120,.2)', overflow: 'hidden', zIndex: 25, display: 'flex', alignItems: 'center' }}>
        <div style={{ display: 'flex', gap: '8vw', animation: 'ticker 20s linear infinite', whiteSpace: 'nowrap', fontFamily: 'Share Tech Mono', fontSize: '.75vw', color: 'rgba(255,255,255,.3)', letterSpacing: '.4em' }}>
          {Array.from({length: 4}).map((_, i) => (
            <span key={i}>BULLS AGENCY LIVE  •  JEUX INTERACTIFS TIKTOK  •  PARTICIPE DANS LE CHAT  •  @olimobi82  •  BULLS LIVE GAMES  •  </span>
          ))}
        </div>
      </div>

      {/* ══ PARTICULES ══ */}
      {Array.from({length: 20}).map((_, i) => (
        <div key={i} style={{
          position: 'absolute',
          width: `${1.5 + (i%3)*.8}px`,
          height: `${1.5 + (i%3)*.8}px`,
          borderRadius: '50%',
          left: `${5 + i*4.5}%`,
          bottom: `${5 + (i%5)*8}%`,
          background: ['#ff2d78','#7b2fff','#00f5ff','#ffd700','#00ff88'][i%5],
          opacity: .4 + (i%3)*.2,
          animation: `particleUp ${5+i*.4}s ease-in ${i*.3}s infinite`,
          pointerEvents: 'none',
          zIndex: 1,
        }} />
      ))}
    </div>
  )
}

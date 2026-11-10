import { useCallback, useEffect, useRef, useState } from 'react'

const W = 360
const H = 540
const COLORS = ['#ff5c8a', '#ffd166', '#69e6ff']
const makeWave = (level) => {
  const rows = Math.min(3 + Math.floor((level - 1) / 2), 5)
  const cols = 7
  const enemies = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      enemies.push({ x: 40 + c * 42, y: 72 + r * 34, w: 22, h: 18, row: r, alive: true })
    }
  }
  return enemies
}

export default function App() {
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const keysRef = useRef({ left: false, right: false, fire: false })
  const [screen, setScreen] = useState('menu')
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [lives, setLives] = useState(3)
  const [best, setBest] = useState(() => Number(localStorage.getItem('spaceInvadersBest') || 0))
  const [muted, setMuted] = useState(true)

  const startGame = useCallback(() => {
    setScore(0); setLevel(1); setLives(3); setScreen('playing')
    gameRef.current = {
      player: { x: W / 2 - 15, y: H - 58, w: 30, h: 22 },
      enemies: makeWave(1), bullets: [], enemyBullets: [], particles: [],
      direction: 1, enemySpeed: 24, lastShot: 0, lastEnemyShot: 0,
      lastTime: 0, elapsed: 0, stars: Array.from({length: 65}, () => ({x: Math.random()*W,y:Math.random()*H,s:Math.random()*1.7+.4}))
    }
  }, [])

  useEffect(() => {
    if (screen !== 'playing') return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    let raf
    const state = gameRef.current
    const drawShip = (x, y, w, h) => {
      ctx.fillStyle = '#72f1ff'
      ctx.fillRect(x + w/2 - 3, y, 6, 7)
      ctx.fillRect(x + 4, y + 7, w - 8, 9)
      ctx.fillRect(x, y + 15, w, 7)
      ctx.fillStyle = '#eaffff'
      ctx.fillRect(x + w/2 - 1, y + 3, 2, 5)
    }
    const drawEnemy = (e) => {
      ctx.fillStyle = COLORS[e.row % COLORS.length]
      ctx.fillRect(e.x+5,e.y,12,4); ctx.fillRect(e.x+2,e.y+4,18,5)
      ctx.fillRect(e.x,e.y+9,22,5); ctx.fillRect(e.x+3,e.y+14,5,4)
      ctx.fillRect(e.x+14,e.y+14,5,4)
      ctx.fillStyle = '#08111f'
      ctx.fillRect(e.x+6,e.y+7,3,3); ctx.fillRect(e.x+14,e.y+7,3,3)
    }
    const loop = (time) => {
      const dt = Math.min((time - (state.lastTime || time)) / 1000, .04)
      state.lastTime = time
      state.elapsed += dt
      ctx.clearRect(0,0,W,H)
      ctx.fillStyle = '#050914'; ctx.fillRect(0,0,W,H)
      state.stars.forEach(star => {
        star.y += (12 + star.s * 12) * dt
        if (star.y > H) { star.y = 0; star.x = Math.random()*W }
        ctx.fillStyle = `rgba(160,205,255,${.25 + star.s/3})`
        ctx.fillRect(star.x,star.y,star.s,star.s)
      })

      const p = state.player
      if (keysRef.current.left) p.x -= 190 * dt
      if (keysRef.current.right) p.x += 190 * dt
      p.x = Math.max(8, Math.min(W-p.w-8,p.x))
      drawShip(p.x,p.y,p.w,p.h)

      if (keysRef.current.fire && time - state.lastShot > 270) {
        state.bullets.push({x:p.x+p.w/2-2,y:p.y-9,w:4,h:12})
        state.lastShot = time
      }
      state.bullets.forEach(b => b.y -= 360*dt)
      state.bullets = state.bullets.filter(b => b.y > -15)
      state.enemyBullets.forEach(b => b.y += 175*dt)
      state.enemyBullets = state.enemyBullets.filter(b => b.y < H+10)

      let minX = W, maxX = 0
      state.enemies.forEach(e => {
        if (!e.alive) return
        e.x += state.direction * state.enemySpeed * dt
        minX = Math.min(minX,e.x); maxX = Math.max(maxX,e.x+e.w)
      })
      if (maxX > W-12 || minX < 12) {
        state.direction *= -1
        state.enemies.forEach(e => { if (e.alive) e.y += 13 })
      }
      if (time - state.lastEnemyShot > Math.max(450, 1450 - level*75)) {
        const alive = state.enemies.filter(e => e.alive)
        if (alive.length) {
          const shooter = alive[Math.floor(Math.random()*alive.length)]
          state.enemyBullets.push({x:shooter.x+10,y:shooter.y+18,w:4,h:10})
        }
        state.lastEnemyShot = time
      }

      state.bullets.forEach(b => {
        state.enemies.forEach(e => {
          if (e.alive && b.x < e.x+e.w && b.x+b.w > e.x && b.y < e.y+e.h && b.y+b.h > e.y) {
            e.alive = false; b.y = -30
            setScore(s => s + (e.row === 0 ? 30 : e.row === 1 ? 20 : 10))
          }
        })
      })
      state.enemyBullets.forEach(b => {
        if (b.x < p.x+p.w && b.x+b.w > p.x && b.y < p.y+p.h && b.y+b.h > p.y) {
          b.y = H+20
          setLives(v => {
            if (v <= 1) { setScreen('gameover'); return 0 }
            return v-1
          })
          p.x = W/2-p.w/2
        }
      })
      state.bullets.forEach(b => {
        ctx.fillStyle = '#fff2a6'; ctx.shadowColor = '#ffd166'; ctx.shadowBlur = 10
        ctx.fillRect(b.x,b.y,b.w,b.h); ctx.shadowBlur = 0
      })
      state.enemyBullets.forEach(b => {
        ctx.fillStyle = '#ff6384'; ctx.fillRect(b.x,b.y,b.w,b.h)
      })
      state.enemies.forEach(e => { if (e.alive) drawEnemy(e) })

      if (state.enemies.every(e => !e.alive)) {
        setLevel(v => {
          const next = v + 1
          state.enemies = makeWave(next)
          state.enemySpeed = 24 + next * 5
          state.direction = next % 2 ? 1 : -1
          state.bullets = []; state.enemyBullets = []
          return next
        })
      }
      if (state.enemies.some(e => e.alive && e.y + e.h > p.y - 8)) setScreen('gameover')

      if (screen === 'playing') raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [screen, level])

  useEffect(() => {
    if (score > best) {
      setBest(score)
      localStorage.setItem('spaceInvadersBest', String(score))
    }
  }, [score, best])

  useEffect(() => {
    const down = e => {
      if (['ArrowLeft','ArrowRight',' ','a','d','A','D'].includes(e.key)) e.preventDefault()
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keysRef.current.left = true
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keysRef.current.right = true
      if (e.key === ' ') keysRef.current.fire = true
    }
    const up = e => {
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'a') keysRef.current.left = false
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 'd') keysRef.current.right = false
      if (e.key === ' ') keysRef.current.fire = false
    }
    window.addEventListener('keydown',down); window.addEventListener('keyup',up)
    return () => { window.removeEventListener('keydown',down); window.removeEventListener('keyup',up) }
  }, [])

  const hold = (key, value) => e => { e.preventDefault(); keysRef.current[key] = value }
  const backToMenu = () => { keysRef.current = {left:false,right:false,fire:false}; setScreen('menu') }

  return <main className="app">
    <header className="topbar">
      <div className="brand"><span className="brand-icon">✦</span><div><b>SPACE INVADERS</b><small>RETRO ARCADE</small></div></div>
      <button className="sound" onClick={() => setMuted(v => !v)} aria-label="So">{muted ? '♫̸' : '♫'}</button>
    </header>

    {screen === 'menu' && <section className="menu-screen">
      <div className="eyebrow">1980 · ARCADE CLASSIC</div>
      <h1>SPACE<br/><span>INVADERS</span></h1>
      <div className="hero-aliens"><span>▥</span><span>▥</span><span>▥</span><span>▥</span><span>▥</span></div>
      <div className="ship-art">▲</div>
      <button className="primary" onClick={startGame}>▶ &nbsp; JUGAR</button>
      <div className="best-score">RÈCORD PERSONAL <strong>{String(best).padStart(6,'0')}</strong></div>
      <p className="hint">Destrueix els invasors i protegeix la Terra</p>
      <div className="menu-footer">INSERT COIN · PRESS START</div>
    </section>}

    {screen === 'playing' && <section className="game-screen">
      <div className="hud">
        <div><small>PUNTUACIÓ</small><b>{String(score).padStart(6,'0')}</b></div>
        <div><small>NIVELL</small><b>{String(level).padStart(2,'0')}</b></div>
        <div><small>VIDES</small><b className="lives">{'♥ '.repeat(lives)}</b></div>
      </div>
      <div className="canvas-wrap"><canvas ref={canvasRef} width={W} height={H} /></div>
      <div className="controls">
        <button className="control move" onPointerDown={hold('left',true)} onPointerUp={hold('left',false)} onPointerLeave={hold('left',false)} onContextMenu={e=>e.preventDefault()}>◀</button>
        <button className="control move" onPointerDown={hold('right',true)} onPointerUp={hold('right',false)} onPointerLeave={hold('right',false)}>▶</button>
        <button className="control fire" onPointerDown={hold('fire',true)} onPointerUp={hold('fire',false)} onPointerLeave={hold('fire',false)}>FOC</button>
      </div>
      <button className="quit" onClick={backToMenu}>SORTIR</button>
    </section>}

    {screen === 'gameover' && <section className="end-screen">
      <div className="eyebrow">SENYAL PERDUT</div>
      <h2>GAME<br/><span>OVER</span></h2>
      <div className="final-score"><small>PUNTUACIÓ</small><strong>{String(score).padStart(6,'0')}</strong></div>
      <div className="best-score">RÈCORD PERSONAL <strong>{String(best).padStart(6,'0')}</strong></div>
      <button className="primary" onClick={startGame}>↻ &nbsp; TORNAR A JUGAR</button>
      <button className="secondary" onClick={backToMenu}>MENÚ PRINCIPAL</button>
    </section>}

    <footer className="footer">◈ &nbsp; EARTH DEFENSE SYSTEM &nbsp; ◈</footer>
  </main>
}

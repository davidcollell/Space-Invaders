import React, { useCallback, useEffect, useRef, useState } from 'react'

const W = 360, H = 540
const COLORS = ['#ff5c8a', '#ffd166', '#69e6ff']
const BEST_KEY = 'spaceInvadersBest'
const clamp = (n, min, max) => Math.max(min, Math.min(max, n))
const readBest = () => { try { return Number(localStorage.getItem(BEST_KEY) || 0) } catch { return 0 } }
const writeBest = value => { try { localStorage.setItem(BEST_KEY, String(value)) } catch {} }
const makeWave = level => {
  const rows = Math.min(3 + Math.floor((level - 1) / 2), 5)
  const cols = 7
  const formation = (level - 1) % 4
  const spacing = formation === 1 ? 39 : formation === 2 ? 45 : 43
  const startX = (W - (cols - 1) * spacing - 22) / 2
  return Array.from({ length: rows * cols }, (_, i) => {
    const row = Math.floor(i / cols), col = i % cols
    const tough = level >= 4 && row === 0
    const kind = level >= 3 && (i % 9 === 0 || (formation === 3 && row === 1 && col % 3 === 1)) ? 'attacker' : level >= 2 && (i % 4 === 0 || (formation === 2 && (col === 0 || col === cols - 1))) ? 'fast' : 'normal'
    let x = startX + col * spacing
    let y = 62 + row * 34
    if (formation === 1) y += Math.abs(col - 3) * 10
    if (formation === 2) x += row % 2 ? spacing * .32 : 0
    if (formation === 3) y += col % 2 ? 9 : -5
    const squad = Math.floor(col / 2)
    return { x, y, baseX: x, baseY: y, w: 22, h: 19, row, col, kind, formation, squad, diveOffset: 0, diveState: 'waiting', diveTimer: 2.5 + (i % 7) * .55, alive: true, hp: tough ? 2 : 1, maxHp: tough ? 2 : 1 }
  })
}
const makeBoss = level => ({ x: 126, y: 55, w: 108, h: 48, hp: 18 + level * 3, maxHp: 18 + level * 3, dir: 1, shotAt: 0, entry: 1.25 })

export default function App() {
  const canvasRef = useRef(null)
  const gameRef = useRef(null)
  const keys = useRef({ left: false, right: false, fire: false })
  const audioRef = useRef(null)
  const [screen, setScreen] = useState('menu')
  const [paused, setPaused] = useState(false)
  const [score, setScore] = useState(0)
  const [level, setLevel] = useState(1)
  const [lives, setLives] = useState(3)
  const [best, setBest] = useState(readBest)
  const [muted, setMuted] = useState(true)
  const [hud, setHud] = useState({ score: 0, level: 1, lives: 3, combo: 0, power: '' })
  const [notice, setNotice] = useState('')

  const beep = useCallback((frequency = 440, duration = .07, type = 'square') => {
    if (muted) return
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!audioRef.current) audioRef.current = new AudioContext()
      const ctx = audioRef.current
      if (ctx.state === 'suspended') ctx.resume()
      const now = ctx.currentTime
      const main = ctx.createOscillator(), body = ctx.createOscillator()
      const mainGain = ctx.createGain(), bodyGain = ctx.createGain()
      main.type = type; main.frequency.setValueAtTime(frequency * 1.12, now)
      main.frequency.exponentialRampToValueAtTime(frequency, now + Math.max(.025, duration))
      body.type = 'triangle'; body.frequency.value = frequency * .5
      mainGain.gain.setValueAtTime(.001, now)
      mainGain.gain.linearRampToValueAtTime(.032, now + .008)
      mainGain.gain.exponentialRampToValueAtTime(.001, now + duration + .035)
      bodyGain.gain.setValueAtTime(.001, now)
      bodyGain.gain.linearRampToValueAtTime(.014, now + .012)
      bodyGain.gain.exponentialRampToValueAtTime(.001, now + duration + .06)
      main.connect(mainGain); body.connect(bodyGain)
      mainGain.connect(ctx.destination); bodyGain.connect(ctx.destination)
      main.start(now); body.start(now)
      main.stop(now + duration + .04); body.stop(now + duration + .07)
    } catch {}
  }, [muted])

  useEffect(() => {
    if (muted || screen !== 'playing' || paused) return
    let ctx
    let timer
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext
      if (!audioRef.current) audioRef.current = new AudioContext()
      ctx = audioRef.current
      if (ctx.state === 'suspended') ctx.resume()
      const notes = [110, 164.81, 220, 164.81, 130.81, 196, 261.63, 196]
      let step = 0
      const playMusicNote = () => {
        if (!ctx || ctx.state !== 'running') return
        const now = ctx.currentTime
        const frequency = notes[step % notes.length]
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null
        osc.type = 'triangle'
        osc.frequency.setValueAtTime(frequency, now)
        gain.gain.setValueAtTime(.001, now)
        gain.gain.linearRampToValueAtTime(.014, now + .025)
        gain.gain.exponentialRampToValueAtTime(.001, now + .29)
        osc.connect(gain)
        if (pan) {
          pan.pan.value = step % 2 ? .18 : -.18
          gain.connect(pan); pan.connect(ctx.destination)
        } else gain.connect(ctx.destination)
        osc.start(now); osc.stop(now + .31)
        step++
      }
      playMusicNote()
      timer = window.setInterval(playMusicNote, 320)
    } catch {}
    return () => {
      if (timer) window.clearInterval(timer)
    }
  }, [screen, paused, muted])

  const startGame = useCallback(() => {
    keys.current = { left: false, right: false, fire: false }
    gameRef.current = {
      player: { x: W / 2 - 15, y: H - 58, w: 30, h: 22, invulnerable: 1.2 },
      enemies: makeWave(1), boss: null, bullets: [], enemyBullets: [], particles: [], drops: [], effects: [],
      shields: [0, 1, 2].map(i => ({ x: 36 + i * 112, y: 405, w: 42, hp: 5 })),
      direction: 1, enemySpeed: 26, currentEnemySpeed: 26, descentRemaining: 0, lastShot: 0, lastEnemyShot: 0, lastHud: 0,
      elapsed: 0, starLayers: [
        { speed: 9, stars: Array.from({ length: 42 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: .45 + Math.random() * .45, a: .2 + Math.random() * .22 })) },
        { speed: 22, stars: Array.from({ length: 28 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: .8 + Math.random() * .65, a: .3 + Math.random() * .3 })) },
        { speed: 43, stars: Array.from({ length: 15 }, () => ({ x: Math.random() * W, y: Math.random() * H, s: 1.35 + Math.random() * .8, a: .48 + Math.random() * .38 })) }
      ],
      combo: 0, comboUntil: 0, power: '', powerUntil: 0, nextExtraLife: 1200,
      waveCleared: false, level: 1, score: 0, lives: 3, paused: false, shake: 0
    }
    setScore(0); setLevel(1); setLives(3); setHud({ score: 0, level: 1, lives: 3, combo: 0, power: '' })
    setNotice(''); setPaused(false); setScreen('playing')
  }, [])

  const finishGame = useCallback(() => {
    keys.current = { left: false, right: false, fire: false }
    setPaused(false); setScreen('gameover')
  }, [])

  useEffect(() => {
    if (screen !== 'playing' || paused) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const s = gameRef.current
    if (!s) return
    let raf, alive = true
    const drawShip = (x, y, w, h, shielded) => {
      ctx.save()
      const cx=x+w/2
      if (shielded) {
        const aura=ctx.createRadialGradient(cx,y+h/2,8,cx,y+h/2,31)
        aura.addColorStop(0,'rgba(60,235,255,.05)');aura.addColorStop(1,'rgba(60,235,255,0)')
        ctx.fillStyle=aura;ctx.beginPath();ctx.arc(cx,y+h/2,31,0,Math.PI*2);ctx.fill()
        ctx.strokeStyle='#8ff8ff';ctx.lineWidth=2;ctx.shadowColor='#35eaff';ctx.shadowBlur=18
        ctx.beginPath();ctx.arc(cx,y+h/2,25,0,Math.PI*2);ctx.stroke()
      }
      ctx.shadowColor='#26eaff';ctx.shadowBlur=17
      const hull=ctx.createLinearGradient(x,y,x,y+h)
      hull.addColorStop(0,'#f3ffff');hull.addColorStop(.28,'#78f4ff');hull.addColorStop(1,'#1689c9')
      ctx.fillStyle=hull
      ctx.beginPath();ctx.moveTo(cx,y-5);ctx.lineTo(x+w-1,y+h-2);ctx.lineTo(x+w-8,y+h-2);ctx.lineTo(cx,y+h-8);ctx.lineTo(x+8,y+h-2);ctx.lineTo(x+1,y+h-2);ctx.closePath();ctx.fill()
      ctx.fillStyle='#ffffff';ctx.fillRect(cx-2,y+3,4,9)
      ctx.fillStyle='#ffcf70';ctx.shadowColor='#ff8c42';ctx.shadowBlur=12
      ctx.beginPath();ctx.moveTo(cx-4,y+h-3);ctx.lineTo(cx,y+h+8+Math.random()*4);ctx.lineTo(cx+4,y+h-3);ctx.fill()
      ctx.restore()
    }
    const drawEnemy = e => {
      const y=e.y+(e.diveOffset||0)
      const color=e.kind==='attacker'?'#d18aff':e.kind==='fast'?'#8dff9b':COLORS[e.row%3]
      ctx.save();ctx.shadowColor=color;ctx.shadowBlur=12
      const g=ctx.createLinearGradient(e.x,y,e.x,y+20)
      g.addColorStop(0,'#ffffff');g.addColorStop(.22,color);g.addColorStop(1,color)
      ctx.fillStyle=g
      ctx.beginPath();ctx.moveTo(e.x+5,y);ctx.lineTo(e.x+17,y);ctx.lineTo(e.x+20,y+5);ctx.lineTo(e.x+22,y+14);ctx.lineTo(e.x+17,y+14);ctx.lineTo(e.x+17,y+19);ctx.lineTo(e.x+13,y+19);ctx.lineTo(e.x+11,y+15);ctx.lineTo(e.x+9,y+19);ctx.lineTo(e.x+5,y+19);ctx.lineTo(e.x+5,y+14);ctx.lineTo(e.x,y+14);ctx.lineTo(e.x+2,y+5);ctx.closePath();ctx.fill()
      ctx.shadowBlur=0;ctx.fillStyle='#071020'
      ctx.fillRect(e.x+5,y+7,4,4);ctx.fillRect(e.x+14,y+7,4,4)
      ctx.fillStyle='#ffffff';ctx.fillRect(e.x+6,y+7,2,2);ctx.fillRect(e.x+15,y+7,2,2)
      if(e.kind!=='normal'){ctx.strokeStyle='#ffffffaa';ctx.lineWidth=1;ctx.strokeRect(e.x+1,y+1,20,17)}
      if(e.hp>1){ctx.fillStyle='#fff';ctx.fillRect(e.x+7,y-5,8,2)}
      ctx.restore()
    }
    const drawPowerUp = d => {
      const colors = { triple: '#ffd166', laser: '#55eaff', bomb: '#ff884d', shield: '#69e6ff', rapid: '#a7ff8a', double: '#ffe18a', life: '#ff6c9a' }
      const color = colors[d.type] || '#ffe18a'
      const cx = d.x + 8, cy = d.y + 8
      ctx.save()
      ctx.shadowColor = color; ctx.shadowBlur = 13
      ctx.fillStyle = '#091426'; ctx.strokeStyle = color; ctx.lineWidth = 2
      ctx.beginPath(); ctx.roundRect(d.x, d.y, 16, 16, 4); ctx.fill(); ctx.stroke()
      ctx.shadowBlur = 0; ctx.fillStyle = color
      if (d.type === 'triple') {
        ctx.fillRect(cx-1,cy-6,2,12); ctx.fillRect(cx-5,cy-3,2,9); ctx.fillRect(cx+3,cy-3,2,9)
        ctx.fillRect(cx-7,cy+4,4,2); ctx.fillRect(cx+3,cy+4,4,2)
      } else if (d.type === 'laser') {
        ctx.fillRect(cx-2,cy-6,4,12); ctx.fillRect(cx-5,cy-2,2,6); ctx.fillRect(cx+3,cy-2,2,6)
        ctx.fillStyle = '#efffff'; ctx.fillRect(cx-1,cy-5,2,9)
      } else if (d.type === 'bomb') {
        ctx.beginPath(); ctx.arc(cx,cy+1,5,0,Math.PI*2); ctx.fill()
        ctx.strokeStyle = '#ffe4a8'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(cx+2,cy-4); ctx.lineTo(cx+5,cy-7); ctx.stroke()
        ctx.fillStyle = '#fff3c4'; ctx.fillRect(cx+4,cy-8,2,2)
      } else if (d.type === 'shield') {
        ctx.beginPath(); ctx.moveTo(cx,cy-6); ctx.lineTo(cx+5,cy-3); ctx.lineTo(cx+4,cy+3); ctx.lineTo(cx,cy+6); ctx.lineTo(cx-4,cy+3); ctx.lineTo(cx-5,cy-3); ctx.closePath(); ctx.fill()
      } else if (d.type === 'life') {
        ctx.font = 'bold 15px sans-serif'; ctx.fillText('♥',cx-7,cy+5)
      } else {
        ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText(d.type === 'rapid' ? 'R' : '2',cx,cy+1)
      }
      ctx.restore()
    }
    const burst = (x, y, color, count = 9, intensity = 1) => {
      for (let i=0;i<count;i++) {
        const a = Math.random()*Math.PI*2, speed = (35+Math.random()*110)*intensity
        const life = (.35+Math.random()*.4)*Math.min(1.5,intensity)
        s.particles.push({ x, y, vx: Math.cos(a)*speed, vy: Math.sin(a)*speed, life, max: life, color, size: (2+Math.random()*2)*Math.min(1.8,intensity) })
      }
    }
    const flash = (x, y, color, radius = 34) => s.effects.push({ type: 'flash', x, y, color, r: radius, life: .18, max: .18 })
    const hit = () => {
      const p = s.player
      if (p.invulnerable > 0 || s.power === 'shield') return
      s.lives--; p.invulnerable = 1.5; p.x = W/2-p.w/2
      s.combo = 0; beep(130,.18,'sawtooth')
      if (navigator.vibrate) navigator.vibrate(45)
      setLives(s.lives); setHud(v => ({ ...v, lives: s.lives, combo: 0 }))
      if (s.lives <= 0) finishGame()
    }
    const award = points => {
      s.score += points * (s.combo >= 5 ? 2 : 1)
      s.combo++; s.comboUntil = s.elapsed + 2.5
      setScore(s.score)
      if (s.score >= s.nextExtraLife) {
        s.nextExtraLife += 1200; s.lives++; setLives(s.lives); setNotice('VIDA EXTRA!')
        setTimeout(() => setNotice(''), 1200)
      }
    }
    const spawnDrop = (x,y) => {
      if (Math.random() < .17) {
        const types = ['rapid','double','triple','laser','bomb','shield','life']
        const type = types[Math.floor(Math.random()*types.length)]
        s.drops.push({ x, y, type, vy: 70 })
      }
    }
    const nextWave = () => {
      s.level++; s.waveCleared = true; s.bullets = []; s.enemyBullets = []; s.drops = []
      s.player.invulnerable = 1.8
      if (s.level % 5 === 0) s.boss = makeBoss(s.level)
      else { s.boss = null; s.enemies = makeWave(s.level); s.enemySpeed = 26 + s.level * 5; s.currentEnemySpeed = s.enemySpeed }
      setLevel(s.level); setNotice(s.level % 5 === 0 ? 'CAP FINAL!' : (s.level % 3 === 0 ? 'ALERTA: ONADA PERILLOSA' : `NIVELL ${s.level}`))
      s.effects.push({ type: 'alert', label: s.level % 5 === 0 ? 'CAP FINAL' : (s.level % 3 === 0 ? 'ONADA PERILLOSA' : `NIVELL ${s.level}`), color: s.level % 5 === 0 ? '#ff77bd' : '#72eaff', life: 1.35, max: 1.35 })
      if(s.level % 5 === 0){s.effects.push({type:'flash',x:W/2,y:90,color:'#ff75c7',r:150,life:.42,max:.42});s.shake=Math.max(s.shake,4)}
      setTimeout(() => setNotice(''), 1500)
      beep(660,.12); setTimeout(() => beep(880,.14),130)
    }
    const loop = time => {
      if (!alive) return
      const dt = Math.min((time-(s.lastTime || time))/1000,.035)
      s.lastTime = time; s.elapsed += dt
      s.shake = Math.max(0, s.shake - dt * 34)
      ctx.save()
      if (s.shake > 0) ctx.translate((Math.random()-.5)*s.shake, (Math.random()-.5)*s.shake)
      const atmospheres = [
        ['#080d25','#101432','#07152b','#5335a6','#196fa6'],
        ['#071b2b','#102b43','#07152b','#176b91','#2879a8'],
        ['#190d2c','#2b1740','#100b25','#873f9d','#4d3b9c'],
        ['#241027','#3a1836','#120d28','#a33d70','#563a9e'],
        ['#081e2b','#103c46','#07152b','#238b9b','#4264b5']
      ]
      const atmosphere = atmospheres[Math.floor((s.level - 1) / 2) % atmospheres.length]
      const space=ctx.createLinearGradient(0,0,W,H)
      space.addColorStop(0,atmosphere[0]);space.addColorStop(.48,atmosphere[1]);space.addColorStop(1,atmosphere[2])
      ctx.fillStyle=space;ctx.fillRect(0,0,W,H)
      const nebulaX = 180 + Math.sin(s.elapsed * .13) * 105
      const nebulaY = 230 + Math.cos(s.elapsed * .1) * 85
      const nebula=ctx.createRadialGradient(nebulaX,nebulaY,8,nebulaX,nebulaY,235)
      nebula.addColorStop(0,atmosphere[3]+'55');nebula.addColorStop(.48,atmosphere[4]+'22');nebula.addColorStop(1,'rgba(0,0,0,0)')
      ctx.fillStyle=nebula;ctx.fillRect(0,0,W,H)
      const distantX = 45 + Math.cos(s.elapsed * .09) * 95
      const distantY = 390 + Math.sin(s.elapsed * .12) * 70
      const distantNebula=ctx.createRadialGradient(distantX,distantY,4,distantX,distantY,155)
      distantNebula.addColorStop(0,atmosphere[4]+'30');distantNebula.addColorStop(1,'rgba(0,0,0,0)')
      ctx.fillStyle=distantNebula;ctx.fillRect(0,0,W,H)
      s.starLayers.forEach((layer,index)=>{
        layer.stars.forEach(st=>{
          st.y+=layer.speed*dt
          if(st.y>H+3){st.y=-3;st.x=Math.random()*W}
          ctx.fillStyle=`rgba(190,226,255,${st.a})`
          ctx.fillRect(st.x,st.y,st.s,st.s)
          if(index===2){
            ctx.fillStyle=`rgba(91,218,255,${st.a*.2})`
            ctx.fillRect(st.x-1,st.y-3,st.s+2,st.s+6)
          }
        })
      })
      ctx.save();ctx.strokeStyle='rgba(83,151,210,.12)';ctx.lineWidth=1
      for(let y=0;y<H;y+=45){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke()}
      ctx.restore()
      const p=s.player
      if(keys.current.left) p.x-=220*dt
      if(keys.current.right) p.x+=220*dt
      p.x=clamp(p.x,8,W-p.w-8)
      if(p.invulnerable>0) p.invulnerable-=dt
      drawShip(p.x,p.y,p.w,p.h,s.power==='shield')
      if(keys.current.fire && time-s.lastShot>(s.power==='rapid'?115:260)){
        const offsets=s.power==='triple'?[-10,0,10]:s.power==='double'?[-8,8]:[0]
        offsets.forEach(o=>s.bullets.push({x:p.x+p.w/2-2+o,y:p.y-9,w:s.power==='laser'?8:4,h:s.power==='laser'?24:12,pierce:s.power==='laser',hitIds:[]}))
        s.lastShot=time; if(!muted) beep(520,.035)
      }
      s.bullets.forEach(b=>b.y-=410*dt); s.bullets=s.bullets.filter(b=>b.y>-15)
      s.enemyBullets.forEach(b=>{b.x+=(b.vx||0)*dt;b.y+=(b.vy||190)*dt}); s.enemyBullets=s.enemyBullets.filter(b=>b.y<H+10&&b.x>-20&&b.x<W+20)
      s.shields.forEach(sh=>{
        if(sh.hp<=0)return
        ctx.save();ctx.shadowColor='#46eaff';ctx.shadowBlur=13
        const sg=ctx.createLinearGradient(sh.x,sh.y,sh.x,sh.y+14)
        sg.addColorStop(0,'#b9ffff');sg.addColorStop(.4,'#4bdfff');sg.addColorStop(1,'#1768b5')
        ctx.fillStyle=sg;ctx.globalAlpha=.45+sh.hp*.1
        ctx.beginPath();ctx.moveTo(sh.x+4,sh.y+10);ctx.lineTo(sh.x+8,sh.y);ctx.lineTo(sh.x+sh.w-8,sh.y);ctx.lineTo(sh.x+sh.w-4,sh.y+10);ctx.closePath();ctx.fill()
        ctx.restore()
      })
      if(s.boss){
        const b=s.boss
        if(b.entry>0)b.entry=Math.max(0,b.entry-dt)
        const bossY=b.y-70*(b.entry/1.25)
        b.x+=b.dir*(48+s.level*2)*dt
        if(b.x<12||b.x+b.w>W-12)b.dir*=-1
        ctx.save();ctx.shadowColor='#ff397f';ctx.shadowBlur=22
        const bg=ctx.createLinearGradient(b.x,bossY,b.x,bossY+b.h)
        bg.addColorStop(0,'#ffd0f0');bg.addColorStop(.25,'#ff5c9c');bg.addColorStop(1,'#8d236d')
        ctx.fillStyle=bg
        ctx.translate(0,bossY-b.y)
        if(b.entry>0){ctx.globalAlpha=1-b.entry/1.7;ctx.strokeStyle='#ffb7e5';ctx.lineWidth=2;ctx.shadowColor='#ff5cba';ctx.shadowBlur=22;ctx.beginPath();ctx.ellipse(b.x+b.w/2,b.y+b.h/2+12,65+(1.25-b.entry)*28,16+(1.25-b.entry)*8,0,0,Math.PI*2);ctx.stroke()}
        ctx.beginPath();ctx.moveTo(b.x+25,b.y);ctx.lineTo(b.x+b.w-25,b.y);ctx.lineTo(b.x+b.w-8,b.y+15);ctx.lineTo(b.x+b.w,b.y+39);ctx.lineTo(b.x+b.w-17,b.y+44);ctx.lineTo(b.x+17,b.y+44);ctx.lineTo(b.x,b.y+39);ctx.lineTo(b.x+8,b.y+15);ctx.closePath();ctx.fill()
        ctx.shadowBlur=0;ctx.fillStyle='#fff';ctx.fillRect(b.x+27,b.y+16,15,8);ctx.fillRect(b.x+b.w-42,b.y+16,15,8)
        ctx.fillStyle='#27102e';ctx.fillRect(b.x+31,b.y+18,7,5);ctx.fillRect(b.x+b.w-38,b.y+18,7,5)
        ctx.fillStyle='#ffe18a';ctx.fillRect(b.x+48,b.y+33,12,4);ctx.fillRect(b.x+b.w-60,b.y+33,12,4)
        ctx.restore()
        ctx.save();ctx.fillStyle='#35133c';ctx.fillRect(45,22,270,9);ctx.fillStyle='#ff5c8a';ctx.shadowColor='#ff4c9a';ctx.shadowBlur=10;ctx.fillRect(45,22,270*(b.hp/b.maxHp),9);ctx.strokeStyle='#ffd5ef';ctx.strokeRect(45,22,270,9);ctx.restore()
        const enraged=b.hp<=b.maxHp*.5
        if(time-b.shotAt>(enraged?610:900)){
          const sx=b.x+b.w/2, sy=b.y+b.h, tx=p.x+p.w/2, ty=p.y+p.h/2
          const angle=Math.atan2(ty-sy,tx-sx), speed=enraged?225:205
          const spread=enraged?[-.28,0,.28]:[0]
          spread.forEach(offset=>{
            const a=angle+offset
            s.enemyBullets.push({x:sx-3,y:sy,w:6,h:12,vx:Math.cos(a)*speed,vy:Math.sin(a)*speed})
          })
          b.shotAt=time
        }
      } else {
        let minX=W,maxX=0,any=false
        const aliveCount = s.enemies.reduce((count,e)=>count+(e.alive?1:0),0)
        const totalCount = s.enemies.length || 1
        const targetSpeed = s.enemySpeed * (1 + (1 - aliveCount / totalCount) * .65)
        s.currentEnemySpeed += (targetSpeed - s.currentEnemySpeed) * Math.min(1, 2.2 * dt)
        if(s.descentRemaining>0){
          const descentSpeed = s.level === 1 ? 30 : 65
          const step=Math.min(s.descentRemaining,descentSpeed*dt)
          s.enemies.forEach(e=>{if(e.alive)e.y+=step})
          s.descentRemaining-=step
        } else {
          s.enemies.forEach(e=>{
            if(!e.alive)return
            any=true
            const speedFactor = e.kind === 'fast' ? 1.65 : 1
            const squadWave = Math.sin(s.elapsed * (0.85 + s.level * .025) + e.squad * 1.7 + e.row * .45)
            const formationDrift = e.formation === 3 ? Math.sin(s.elapsed * .72 + e.col * .7) * 8 : 0
            e.x+=s.direction*s.currentEnemySpeed*speedFactor*dt + (e.kind === 'attacker' && e.diveState === 'diving' ? 0 : squadWave * 5 * dt) + formationDrift * dt
            if (e.kind === 'attacker') {
              if (e.diveState === 'waiting') {
                e.diveTimer -= dt
                if (e.diveTimer <= 0) {
                  const squadMates = s.enemies.filter(other => other.alive && other.kind === 'attacker' && other.squad === e.squad && other !== e)
                  const squadReady = squadMates.length === 0 || squadMates.every(other => other.diveState === 'waiting' && other.diveTimer < 1.2)
                  if (squadReady) {
                    e.diveState = 'diving'
                    e.diveTimer = 2.5
                    squadMates.forEach(other => { other.diveTimer = Math.min(other.diveTimer, .28 + Math.random() * .3) })
                  } else e.diveTimer = .25
                }
              } else if (e.diveState === 'diving') {
                e.diveOffset = Math.min(82, e.diveOffset + 125 * dt)
                e.x += Math.sign((p.x + p.w / 2) - (e.x + e.w / 2)) * 42 * dt
                if (e.diveOffset >= 82) e.diveState = 'rising'
              } else {
                e.diveOffset = Math.max(0, e.diveOffset - 105 * dt)
                if (e.diveOffset <= 0) {
                  e.diveState = 'waiting'
                  e.diveTimer = 3.5 + (e.row % 3) * .7
                }
              }
            }
            minX=Math.min(minX,e.x)
            maxX=Math.max(maxX,e.x+e.w)
          })
          const edgeMargin = s.level === 1 ? 2 : 10
          if(any&&(maxX>W-edgeMargin||minX<edgeMargin)){
            s.direction*=-1
            s.descentRemaining = s.level === 1 ? 6 : 14
          }
        }
        if(time-s.lastEnemyShot>Math.max(420,1450-s.level*65)){
          const shooters=s.enemies.filter(e=>e.alive)
          if(shooters.length){const e=shooters[Math.floor(Math.random()*shooters.length)];s.enemyBullets.push({x:e.x+10,y:e.y+(e.diveOffset||0)+18,w:4,h:10})}
          s.lastEnemyShot=time
        }
        s.enemies.forEach(e=>{if(e.alive)drawEnemy(e)})
      }
      // Player shots hit enemies or boss
      s.bullets.forEach(b=>{
        if(s.boss && (!b.hitIds || !b.hitIds.includes('boss')) && b.x<s.boss.x+s.boss.w&&b.x+b.w>s.boss.x&&b.y<s.boss.y+s.boss.h&&b.y+b.h>s.boss.y){
          if(!b.pierce)b.y=-30;else {b.hitIds.push('boss');b.y-=1} s.boss.hp--;burst(b.x,b.y,'#ff9ab8',3);award(5);beep(250,.04)
          if(s.boss.hp<=0){const cx=s.boss.x+s.boss.w/2,cy=s.boss.y+20;burst(cx,cy,'#ff5c8a',62,1.65);burst(cx,cy,'#ffe18a',28,1.25);flash(cx,cy,'#ff75b5',115);s.shake=13;if(navigator.vibrate)navigator.vibrate([55,35,100]);s.boss=null;award(500);s.enemies=makeWave(s.level);s.enemySpeed=30+s.level*5;s.currentEnemySpeed=s.enemySpeed}
        } else s.enemies.forEach(e=>{
          if(e.alive&&(!b.hitIds||!b.hitIds.includes(e))&&b.x<e.x+e.w&&b.x+b.w>e.x&&b.y<e.y+(e.diveOffset||0)+e.h&&b.y+b.h>e.y+(e.diveOffset||0)){
            if(!b.pierce)b.y=-30;else b.hitIds.push(e);e.hp--;burst(e.x+11,e.y+(e.diveOffset||0)+9,COLORS[e.row%3],4)
            if(e.hp<=0){e.alive=false;const ex=e.x+11,ey=e.y+(e.diveOffset||0)+9;const style=e.kind==='attacker'?{color:'#d18aff',count:23,power:1.25}:e.kind==='fast'?{color:'#8dff9b',count:17,power:1.05}:{color:COLORS[e.row%3],count:13,power:.9};burst(ex,ey,style.color,style.count,style.power);burst(ex,ey,'#fff4cf',5,.65);flash(ex,ey,style.color,e.kind==='attacker'?48:32);s.shake=Math.max(s.shake,e.kind==='attacker'?3:1.5);award(e.row===0?30:e.row===1?20:10);spawnDrop(e.x,e.y);beep(300+e.row*80,.055)}
          }
        })
      })
      s.enemyBullets.forEach(b=>{
        if(b.x<p.x+p.w&&b.x+b.w>p.x&&b.y<p.y+p.h&&b.y+b.h>p.y){b.y=H+20;hit()}
        s.shields.forEach(sh=>{if(sh.hp>0&&b.x<sh.x+sh.w&&b.x+b.w>sh.x&&b.y<sh.y+14&&b.y+b.h>sh.y){b.y=H+20;sh.hp--}})
      })
      s.bullets.forEach(b=>s.shields.forEach(sh=>{if(sh.hp>0&&b.x<sh.x+sh.w&&b.x+b.w>sh.x&&b.y<sh.y+14&&b.y+b.h>sh.y){b.y=-30;sh.hp--}}))
      s.drops.forEach(d=>{
        d.y+=d.vy*dt;drawPowerUp(d)
        if(d.x<p.x+p.w&&d.x+16>p.x&&d.y<p.y+p.h&&d.y+16>p.y){
          d.y=H+20
          if(d.type==='life')s.lives=Math.min(5,s.lives+1)
          else {s.power=d.type;s.powerUntil=s.elapsed+8}
          if(d.type==='bomb'){
            s.effects.push({type:'bomb',x:W/2,y:H/2,r:12,life:.58,max:.58})
            burst(p.x+p.w/2,p.y+8,'#ff9a4d',30)
            s.enemies.forEach(e=>{if(e.alive){e.alive=false;burst(e.x+11,e.y+9,'#ffe18a',8);award(e.row===0?30:e.row===1?20:10)}})
            if(s.boss){s.boss.hp-=8;burst(s.boss.x+s.boss.w/2,s.boss.y+20,'#ffe18a',18);if(s.boss.hp<=0){s.boss=null;award(500)}}
          }
          setLives(s.lives);setNotice(d.type==='life'?'VIDA +1':d.type==='shield'?'ESCUT ACTIVAT':d.type==='double'?'DISPAR DOBLE':d.type==='triple'?'DISPAR TRIPLE':d.type==='laser'?'LÀSER ACTIVAT':d.type==='bomb'?'BOMBA!':'DISPAR RÀPID')
          setTimeout(()=>setNotice(''),1100);beep(880,.12,'triangle')
        }
      })
      s.drops=s.drops.filter(d=>d.y<H+20)
      if(s.power&&s.elapsed>s.powerUntil)s.power=''
      if(s.elapsed>s.comboUntil)s.combo=0
      s.particles.forEach(pt=>{pt.x+=pt.vx*dt;pt.y+=pt.vy*dt;pt.life-=dt;ctx.globalAlpha=clamp(pt.life/pt.max,0,1);ctx.fillStyle=pt.color;ctx.fillRect(pt.x,pt.y,pt.size,pt.size)})
      ctx.globalAlpha=1;s.particles=s.particles.filter(pt=>pt.life>0)
      s.effects.forEach(fx=>{
        fx.life-=dt
        const alpha=clamp(fx.life/fx.max,0,1)
        ctx.save();ctx.globalAlpha=alpha
        if(fx.type==='flash'){
          const radius=fx.r*(1-alpha*.45)
          const glow=ctx.createRadialGradient(fx.x,fx.y,0,fx.x,fx.y,radius)
          glow.addColorStop(0,'rgba(255,255,255,.95)');glow.addColorStop(.24,fx.color+'cc');glow.addColorStop(1,'rgba(255,255,255,0)')
          ctx.fillStyle=glow;ctx.beginPath();ctx.arc(fx.x,fx.y,radius,0,Math.PI*2);ctx.fill()
        } else if(fx.type==='alert'){
          ctx.globalAlpha=alpha
          ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='900 18px sans-serif'
          ctx.shadowColor=fx.color;ctx.shadowBlur=18;ctx.fillStyle=fx.color
          ctx.fillText(fx.label,W/2,150+(1-alpha)*12)
          ctx.strokeStyle=fx.color;ctx.lineWidth=1.5;ctx.globalAlpha=alpha*.55
          ctx.beginPath();ctx.moveTo(48,166);ctx.lineTo(112,166);ctx.moveTo(248,166);ctx.lineTo(312,166);ctx.stroke()
        } else {
          fx.r+=520*dt;ctx.strokeStyle='#ff9b4d';ctx.lineWidth=5;ctx.shadowColor='#ff6b35';ctx.shadowBlur=24
          ctx.beginPath();ctx.arc(fx.x,fx.y,fx.r,0,Math.PI*2);ctx.stroke()
          ctx.strokeStyle='#ffe7a3';ctx.lineWidth=2;ctx.beginPath();ctx.arc(fx.x,fx.y,fx.r*.72,0,Math.PI*2);ctx.stroke()
        }
        ctx.restore()
      })
      s.effects=s.effects.filter(fx=>fx.life>0)
      s.enemyBullets.forEach(b=>{
        ctx.save();ctx.shadowColor='#ff4d8d';ctx.shadowBlur=14
        ctx.fillStyle='#ff5d91';ctx.beginPath();ctx.ellipse(b.x+b.w/2,b.y+b.h/2,b.w/2+1,b.h/2+2,0,0,Math.PI*2);ctx.fill()
        ctx.fillStyle='#ffe6f2';ctx.fillRect(b.x+b.w/2-1,b.y+2,2,4);ctx.restore()
      })
      s.bullets.forEach(b=>{
        if(b.pierce){
          ctx.save();ctx.shadowColor='#36eaff';ctx.shadowBlur=20
          ctx.fillStyle='#31dfff';ctx.fillRect(b.x-3,b.y-2,b.w+6,b.h+4)
          ctx.fillStyle='#eaffff';ctx.fillRect(b.x+2,b.y,b.w-4,b.h)
          ctx.fillStyle='#70f4ff';ctx.fillRect(b.x+1,b.y+b.h-5,b.w-2,5)
          ctx.restore()
        } else {
          ctx.save();ctx.shadowColor='#ffd166';ctx.shadowBlur=10
          ctx.fillStyle='#fff2a6';ctx.fillRect(b.x,b.y,b.w,b.h)
          ctx.fillStyle='#ffffff';ctx.fillRect(b.x+1,b.y+1,2,Math.max(3,b.h-3))
          ctx.restore()
        }
      })
      if(!s.boss&&s.enemies.every(e=>!e.alive))nextWave()
      if(!s.boss&&s.enemies.some(e=>e.alive&&e.y+(e.diveOffset||0)+e.h>p.y-8))finishGame()
      if(time-s.lastHud>140){s.lastHud=time;setHud({score:s.score,level:s.level,lives:s.lives,combo:s.combo,power:s.power})}
      ctx.restore()
      if(alive&&screen==='playing'&&s.lives>0)raf=requestAnimationFrame(loop)
    }
    raf=requestAnimationFrame(loop)
    return()=>{alive=false;cancelAnimationFrame(raf)}
  },[screen,paused,muted,beep,finishGame])

  useEffect(()=>{if(score>best){setBest(score);writeBest(score)}},[score,best])
  useEffect(()=>{
    const down=e=>{
      const k=e.key.toLowerCase()
      if(['arrowleft','arrowright',' ','a','d'].includes(k))e.preventDefault()
      if(k==='arrowleft'||k==='a')keys.current.left=true
      if(k==='arrowright'||k==='d')keys.current.right=true
      if(k===' ')keys.current.fire=true
      if(k==='escape'||k==='p'){if(screen==='playing')setPaused(v=>!v)}
    }
    const up=e=>{const k=e.key.toLowerCase();if(k==='arrowleft'||k==='a')keys.current.left=false;if(k==='arrowright'||k==='d')keys.current.right=false;if(k===' ')keys.current.fire=false}
    window.addEventListener('keydown',down);window.addEventListener('keyup',up)
    return()=>{window.removeEventListener('keydown',down);window.removeEventListener('keyup',up)}
  },[screen])
  useEffect(()=>{
    const onVisibilityChange=()=>{
      if(document.hidden){
        keys.current={left:false,right:false,fire:false}
        if(screen==='playing')setPaused(true)
      }
    }
    document.addEventListener('visibilitychange',onVisibilityChange)
    return()=>document.removeEventListener('visibilitychange',onVisibilityChange)
  },[screen])

  const hold=(key,value)=>e=>{e.preventDefault();keys.current[key]=value}
  const exit=()=>{keys.current={left:false,right:false,fire:false};setPaused(false);setScreen('menu')}
  const pause=()=>{keys.current={left:false,right:false,fire:false};setPaused(v=>!v)}

  return <main className="app">
    <header className="topbar">
      <div className="brand"><span className="brand-icon">✦</span><div><b>SPACE INVADERS</b><small>RETRO ARCADE</small></div></div>
      <button className="sound" onClick={()=>setMuted(v=>!v)} aria-label="Activar o desactivar so">{muted?'♫̸':'♫'}</button>
    </header>
    {screen==='menu'&&<section className="menu-screen">
      <div className="eyebrow">1980 · ARCADE CLASSIC</div><h1>SPACE<br/><span>INVADERS</span></h1>
      <div className="hero-scene" aria-hidden="true">
        <div className="hero-planet"><i></i></div>
        <div className="hero-orbit"></div>
        <div className="hero-aliens"><span>✦</span><span>✹</span><span>✦</span><span>✹</span><span>✦</span></div>
        <div className="ship-art"><span className="ship-flame"></span><span className="ship-hull">▲</span></div>
        <span className="scene-spark spark-one">✧</span><span className="scene-spark spark-two">✦</span><span className="scene-spark spark-three">·</span>
      </div><button className="primary" onClick={startGame}>▶ &nbsp; JUGAR</button>
      <div className="best-score">RÈCORD PERSONAL <strong>{String(best).padStart(6,'0')}</strong></div>
      <p className="hint">Destrueix els invasors i protegeix la Terra</p><p className="menu-tip">RECOLLIR BONUS · COMBO x2 · CAP CADA 5 NIVELLS</p>
      <div className="menu-footer">INSERT COIN · PRESS START</div>
    </section>}
    {screen==='playing'&&<section className="game-screen">
      <div className="hud">
        <div><small>PUNTUACIÓ</small><b>{String(hud.score).padStart(6,'0')}</b></div>
        <div><small>NIVELL</small><b>{String(hud.level).padStart(2,'0')}</b></div>
        <div><small>VIDES</small><b className="lives">{'♥ '.repeat(hud.lives)}</b></div>
      </div>
      <div className="canvas-wrap"><canvas ref={canvasRef} width={W} height={H} aria-label="Camp de joc Space Invaders"/></div>
      <div className="game-meta"><span>{hud.combo>=5?`COMBO x2 · ${hud.combo}`:'ELIMINA TOTS ELS INVASORS'}</span><span>{hud.power?`BONUS: ${hud.power.toUpperCase()}`:'BONUS ALEATORIS'}</span></div>
      {notice&&<div className="notice">{notice}</div>}
      <div className="controls">
        <button className="control move" onPointerDown={hold('left',true)} onPointerUp={hold('left',false)} onPointerCancel={hold('left',false)} onPointerLeave={hold('left',false)}>◀</button>
        <button className="control move" onPointerDown={hold('right',true)} onPointerUp={hold('right',false)} onPointerCancel={hold('right',false)} onPointerLeave={hold('right',false)}>▶</button>
        <button className="control fire" onPointerDown={hold('fire',true)} onPointerUp={hold('fire',false)} onPointerCancel={hold('fire',false)} onPointerLeave={hold('fire',false)}>FOC</button>
      </div>
      <div className="game-actions"><button className="quit" onClick={pause}>{paused?'CONTINUAR':'Ⅱ PAUSA'}</button><button className="quit" onClick={exit}>SORTIR</button></div>
      {paused&&<div className="pause-overlay"><div><h2>PAUSA</h2><button className="primary" onClick={pause}>CONTINUAR</button><button className="secondary" onClick={exit}>SORTIR AL MENÚ</button></div></div>}
    </section>}
    {screen==='gameover'&&<section className="end-screen">
      <div className="eyebrow">SENYAL PERDUT</div><h2>GAME<br/><span>OVER</span></h2>
      <div className="final-score"><small>PUNTUACIÓ</small><strong>{String(score).padStart(6,'0')}</strong></div>
      <div className="best-score">RÈCORD PERSONAL <strong>{String(best).padStart(6,'0')}</strong></div>
      <button className="primary" onClick={startGame}>↻ &nbsp; TORNAR A JUGAR</button><button className="secondary" onClick={exit}>MENÚ PRINCIPAL</button>
    </section>}
    <footer className="footer">◈ &nbsp; EARTH DEFENSE SYSTEM &nbsp; ◈</footer>
  </main>
}

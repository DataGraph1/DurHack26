import { Controller } from "./components/Controller"
import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

// phone url:  http://localhost:5173/?player=player1
const PLAYER_ID = new URLSearchParams(window.location.search).get('player') ?? 'player1'
// where this player stands inside the ghost circle (radius 2); [0, 0] = centre
const PLAYER_OFFSET: [number, number] = [0, 0]
// goes through the vite proxy on the same host/port, so it works over http and https
const SERVER_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws?player_id=${PLAYER_ID}`

const LEVELS = ['far', 'medium', 'close']

// sound effects live in public/sounds/<name>_sound.mp3; the server says which to play
const SOUND_NAMES = ['spawn_ghost', 'ghost_kill', 'time_left_120', 'time_left_60', 'time_left_30', 'game_over']
const SOUNDS: Record<string, HTMLAudioElement> = Object.fromEntries(
  SOUND_NAMES.map((name) => [name, new Audio(`/sounds/${name}_sound.mp3`)]))

function playSound(name?: string | null) {
  const audio = name ? SOUNDS[name] : undefined
  if (!audio) return
  audio.currentTime = 0
  audio.play().catch(() => {})  // blocked until the user has tapped something
}

// phones only allow audio after a tap: on the first tap, play+pause every sound silently
let audioUnlocked = false
function unlockAudio() {
  if (audioUnlocked) return
  audioUnlocked = true
  for (const audio of Object.values(SOUNDS)) {
    audio.muted = true
    audio.play().then(() => { audio.pause(); audio.currentTime = 0; audio.muted = false })
      .catch(() => { audio.muted = false })
  }
}

// how many degrees off the phone can point and still count as medium / close
const MEDIUM_DEG = 45
const CLOSE_DEG = 15

function levelFromDif(dif: number | null) {
  if (dif === null) return 0
  const off = Math.abs(dif)
  if (off <= CLOSE_DEG) return 2
  if (off <= MEDIUM_DEG) return 1
  return 0
}

function App() {
  const [status, setStatus] = useState('connecting...')
  const [hint, setHint] = useState('')   // small feedback line under the catch button
  const [announcement, setAnnouncement] = useState('')
  const [ghosts, setGhosts] = useState<Record<string, number>>({})  // ghost id -> angle
  const [scores, setScores] = useState<Record<string, number>>({})  // player id -> ghosts caught
  const [timeLeft, setTimeLeft] = useState<number | null>(null)     // seconds, from the server
  const webSocketRef = useRef<WebSocket | null>(null)
  const [target, setTarget] = useState<{ dif: number | null, id: string | null }>({ dif: null, id: null })
  const level = levelFromDif(target.dif)       // 0 = far, 1 = med, 2 = close
  const [flash, setFlash] = useState(false)    // flash enabled

  // feedback for the player (only the latest line is shown)
  function log(line: string) {
    setHint(line)
  }

  useEffect(() => {
    let stopped = false 
    let gameFull = false

    function connect() {
      const ws = new WebSocket(SERVER_URL)
      webSocketRef.current = ws

      ws.onopen = () => {
        setStatus('connected')
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'ghosts') {
          setGhosts(data.ghosts)
          setScores(data.scores ?? {})
          setTimeLeft(data.time_left ?? null)
          return
        }
        if (data.type === 'announcement') {
          setAnnouncement(data.message)
          playSound(data.sound)
          return
        }
        if (data.type === 'error') gameFull = true

        if (data.type === 'error') log(data.message)
      }

      ws.onclose = () => {
        if (stopped) return
        if (gameFull) {
          setStatus('game full :(')
          return
        }
        // auto reconnect ever 2 sec
        setStatus('disconnected... reconnecting')
        setTimeout(connect, 2000)
      }
    }

    connect()
    return () => {
      stopped = true
      webSocketRef.current?.close()
    }
  }, [])

  function buzz(pattern: number | number[]) {
    navigator.vibrate?.(pattern)
    setFlash(true)
    setTimeout(() => setFlash(false), 80)
  }

  // every button click: tiny buzz + flash, and unlocks sound on phones
  function tap(line: string) {
    unlockAudio()
    buzz(30)
    log(line)
  }

  // send a message to the server; returns false (and logs why) if not connected
  function sendToServer(message: object) {
    if (webSocketRef.current?.readyState !== WebSocket.OPEN) {
      log('not connected')
      return false
    }
    webSocketRef.current.send(JSON.stringify(message))
    return true
  }

  // catch the ghost the phone is pointing at, but only when it's close
  function catchGhost() {
    if (target.id === null) { tap('no ghosts right now'); return }
    if (level !== 2) { tap(`missed! ${Math.abs(target.dif ?? 0).toFixed(0)}° off`); return }
    tap('caught!')
    sendToServer({ type: 'catch', ghost_id: target.id })
  }

  // the Controller reports the closest ghost every 100ms; only re-render if it changed
  const onCompassUpdate = useCallback((dif: number | null, id: string | null) => {
    const rounded = dif === null ? null : Math.round(dif)
    setTarget((old) => (old.dif === rounded && old.id === id ? old : { dif: rounded, id }))
  }, [])

  const gameOver = timeLeft === 0
  const myScore = scores[PLAYER_ID] ?? 0
  const ranking = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const clock = timeLeft === null ? '-:--' : `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`

  // the nearer we are the faster it buzzes and flashes
  useEffect(() => {
    if (level === 0 || gameOver) return
    const gap = [0, 800, 200][level]  // buzz lvl
    const id = setInterval(() => buzz(80), gap)
    return () => clearInterval(id)
  }, [level, gameOver])


  return (
    <main className={`game ${flash ? 'flash' : ''}`}>
      <header className="top">
        <div><span className="label">time</span><b className={timeLeft !== null && timeLeft <= 30 ? 'urgent' : ''}>{clock}</b></div>
        <div className="me">{PLAYER_ID}</div>
        <div><span className="label">score</span><b>{myScore}</b></div>
      </header>

      {status !== 'connected' && <p className="banner">{status}</p>}
      <p className="announcement">{announcement || '\u00a0'}</p>

      {gameOver ? (
        <div className="over">
          <ol className="scores">
            {ranking.map(([p, n]) => <li key={p} className={p === PLAYER_ID ? 'you' : ''}><span>{p}</span><b>{n}</b></li>)}
          </ol>
          <button className="catch" onClick={() => { tap('new game'); sendToServer({ type: 'reset' }) }}>play again</button>
        </div>
      ) : (
        <>
          <div className={`signal level-${level}`}>{target.id === null ? 'no ghosts' : LEVELS[level]}</div>
          <button className="catch" onClick={catchGhost}>catch</button>
          <p className="hint">{hint || '\u00a0'}</p>
          <Controller ghosts={ghosts} player_offset={PLAYER_OFFSET} onUpdate={onCompassUpdate} />
        </>
      )}

      <footer>
        {!gameOver && ranking.length > 0 && (
          <ol className="scores">
            {ranking.map(([p, n]) => <li key={p} className={p === PLAYER_ID ? 'you' : ''}><span>{p}</span><b>{n}</b></li>)}
          </ol>
        )}
        <button className="link" onClick={() => { tap('new game'); sendToServer({ type: 'reset' }) }}>new game</button>
      </footer>
    </main>
  )
}

// phone to pi
// // {
//     "type": "location_update",
//     "player_id": "player1",
//     "latitude": ,
//     "longitude": ,
//     "timestamp":
// }
//
// pi to phone
// // {
//     "type": "proximity_update",
//     "distance": ,
//     "proximity": ""
// }

export default App

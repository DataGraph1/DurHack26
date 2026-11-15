import { Controller } from "./components/Controller"
import { useState, useEffect, useRef, useCallback } from 'react'
import './App.css'

// everyone joins the same room: they type this code + their name on the join screen
const ROOM_CODE = 'GHOST'
const NAME_KEY = 'ghost-game-name'  // remembered so a page reload rejoins automatically
// where this player stands inside the ghost circle (radius 2); [0, 0] = centre
const PLAYER_OFFSET: [number, number] = [0, 0]
// goes through the vite proxy on the same host/port, so it works over http and https
const serverUrl = (name: string, room: string) =>
  `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws` +
  `?player_id=${encodeURIComponent(name)}&room=${encodeURIComponent(room)}`

function loadSavedName() {
  try { return localStorage.getItem(NAME_KEY) } catch { return null }
}
function saveName(name: string | null) {
  try { if (name) localStorage.setItem(NAME_KEY, name); else localStorage.removeItem(NAME_KEY) } catch { /* private mode */ }
}

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

type GameState = 'lobby' | 'playing' | 'over'

// join screen: room code + name
function JoinScreen({ error, onJoin }: { error: string, onJoin: (name: string, room: string) => void }) {
  const [room, setRoom] = useState(ROOM_CODE)
  const [name, setName] = useState('')
  return (
    <main className="game">
      <h1 className="title">ghost hunt</h1>
      <form className="join" onSubmit={(e) => { e.preventDefault(); unlockAudio(); if (name.trim()) onJoin(name.trim(), room.trim().toUpperCase()) }}>
        <label><span className="label">room code</span>
          <input value={room} onChange={(e) => setRoom(e.target.value.toUpperCase())} autoCapitalize="characters" />
        </label>
        <label><span className="label">your name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={12} placeholder="name" autoFocus />
        </label>
        <p className="hint error">{error || ' '}</p>
        <button className="catch" type="submit" disabled={!name.trim()}>join</button>
      </form>
    </main>
  )
}

function App() {
  const [me, setMe] = useState<{ name: string, room: string } | null>(() => {
    const saved = loadSavedName()
    return saved ? { name: saved, room: ROOM_CODE } : null
  })
  const [joinError, setJoinError] = useState('')

  // stable callback so Game's connection effect doesn't reconnect on every render
  const leave = useCallback((error: string) => { saveName(null); setJoinError(error); setMe(null) }, [])

  if (!me) return <JoinScreen error={joinError} onJoin={(name, room) => { setJoinError(''); setMe({ name, room }) }} />
  return <Game key={me.name} name={me.name} room={me.room} onLeave={leave} />
}

function Game({ name, room, onLeave }: { name: string, room: string, onLeave: (error: string) => void }) {
  const [status, setStatus] = useState('connecting...')
  const [hint, setHint] = useState('')   // small feedback line under the catch button
  const [announcement, setAnnouncement] = useState('')
  const [ghosts, setGhosts] = useState<Record<string, number>>({})  // ghost id -> angle
  const [scores, setScores] = useState<Record<string, number>>({})  // player id -> ghosts caught
  const [players, setPlayers] = useState<string[]>([])
  const [gameState, setGameState] = useState<GameState>('lobby')
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
    let rejected = false

    function connect() {
      const ws = new WebSocket(serverUrl(name, room))
      webSocketRef.current = ws

      ws.onopen = () => setStatus('connected')

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'ghosts') {
          setGhosts(data.ghosts)
          setScores(data.scores ?? {})
          setTimeLeft(data.time_left ?? null)
          setPlayers(data.players ?? [])
          setGameState(data.state ?? 'playing')
          return
        }
        if (data.type === 'welcome') saveName(name)  // joined: remember for reloads
        if (data.type === 'announcement') {
          setAnnouncement(data.message)
          playSound(data.sound)
          return
        }
        // wrong code / name taken / room full: back to the join screen
        if (data.type === 'error') { rejected = true; stopped = true; onLeave(data.message) }
      }

      ws.onclose = () => {
        if (stopped || rejected) return
        // auto reconnect every 2 sec
        setStatus('disconnected... reconnecting')
        setTimeout(connect, 2000)
      }
    }

    connect()
    return () => {
      stopped = true
      webSocketRef.current?.close()
    }
  }, [name, room, onLeave])

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

  function startGame() { tap(''); sendToServer({ type: 'start' }) }
  function backToLobby() { tap(''); sendToServer({ type: 'lobby' }) }

  // the Controller reports the closest ghost every 100ms; only re-render if it changed
  const onCompassUpdate = useCallback((dif: number | null, id: string | null) => {
    const rounded = dif === null ? null : Math.round(dif)
    setTarget((old) => (old.dif === rounded && old.id === id ? old : { dif: rounded, id }))
  }, [])

  const playing = gameState === 'playing'
  const myScore = scores[name] ?? 0
  const ranking = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const clock = timeLeft === null ? '-:--' : `${Math.floor(timeLeft / 60)}:${String(timeLeft % 60).padStart(2, '0')}`

  // the nearer we are the faster it buzzes and flashes
  useEffect(() => {
    if (level === 0 || !playing) return
    const gap = [0, 800, 200][level]  // buzz lvl
    const id = setInterval(() => buzz(80), gap)
    return () => clearInterval(id)
  }, [level, playing])

  const scoreList = (
    <ol className="scores">
      {ranking.map(([p, n]) => <li key={p} className={p === name ? 'you' : ''}><span>{p}</span><b>{n}</b></li>)}
    </ol>
  )

  return (
    <main className={`game ${flash && playing ? 'flash' : ''}`}>
      <header className="top">
        <div><span className="label">time</span><b className={playing && timeLeft !== null && timeLeft <= 30 ? 'urgent' : ''}>{clock}</b></div>
        <div className="me">{name}</div>
        <div><span className="label">score</span><b>{myScore}</b></div>
      </header>

      {status !== 'connected' && <p className="banner">{status}</p>}

      {gameState === 'lobby' && (
        <div className="lobby">
          <div><span className="label">room code</span><div className="code">{room}</div></div>
          <div>
            <span className="label">players ({players.length})</span>
            <ul className="scores">
              {players.map((p) => <li key={p} className={p === name ? 'you' : ''}><span>{p}{p === name && ' (you)'}</span></li>)}
            </ul>
          </div>
          <Controller ghosts={ghosts} player_offset={PLAYER_OFFSET} onUpdate={onCompassUpdate} />
          <button className="catch" onClick={startGame}>start</button>
          <p className="hint">everyone joined? press start</p>
        </div>
      )}

      {gameState === 'over' && (
        <div className="over">
          <p className="announcement">{announcement || 'game over'}</p>
          {scoreList}
          <button className="catch" onClick={startGame}>play again</button>
          <button className="link" onClick={backToLobby}>back to lobby</button>
        </div>
      )}

      {playing && (
        <>
          <p className="announcement">{announcement || ' '}</p>
          <div className={`signal level-${level}`}>{target.id === null ? 'no ghosts' : LEVELS[level]}</div>
          <button className="catch" onClick={catchGhost}>catch</button>
          <p className="hint">{hint || ' '}</p>
          <Controller ghosts={ghosts} player_offset={PLAYER_OFFSET} onUpdate={onCompassUpdate} />
          <footer>
            {ranking.length > 0 && scoreList}
            <button className="link" onClick={backToLobby}>end game</button>
          </footer>
        </>
      )}

      {gameState === 'lobby' && (
        <footer><button className="link" onClick={() => { webSocketRef.current?.close(); onLeave('') }}>leave room</button></footer>
      )}
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

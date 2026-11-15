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
  const [messages, setMessages] = useState<string[]>([])   // the log, newest first
  const [text, setText] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [ghosts, setGhosts] = useState<Record<string, number>>({})  // ghost id -> angle
  const [scores, setScores] = useState<Record<string, number>>({})  // player id -> ghosts caught
  const webSocketRef = useRef<WebSocket | null>(null)
  const [target, setTarget] = useState<{ dif: number | null, id: string | null }>({ dif: null, id: null })
  const level = levelFromDif(target.dif)       // 0 = far, 1 = med, 2 = close
  const [flash, setFlash] = useState(false)    // flash enabled
  const [buzzOn, setBuzzOn] = useState(false)

  // add a line to the log (newest on top, keep the last 30)
  function log(line: string) {
    const time = new Date().toLocaleTimeString()
    setMessages((old) => [`${time}  ${line}`, ...old].slice(0, 30))
  }

  useEffect(() => {
    let stopped = false 
    let gameFull = false

    function connect() {
      const ws = new WebSocket(SERVER_URL)
      webSocketRef.current = ws

      ws.onopen = () => {
        setStatus('connected :)')
        log('connected to server')
      }

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
        if (data.type === 'ghosts') {
          setGhosts(data.ghosts)
          setScores(data.scores ?? {})
          return
        }
        if (data.type === 'announcement') {
          setAnnouncement(data.message)
          log( data.message)
          return
        }
        if (data.type === 'error') gameFull = true

        log('server: ' + data.message)
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

  // every button click: tiny buzz + flash + a log line, so you always see it worked
  function tap(line: string) {
    buzz(30)
    log('you: ' + line)
  }

  // send a message to the server; returns false (and logs why) if not connected
  function sendToServer(message: object) {
    if (webSocketRef.current?.readyState !== WebSocket.OPEN) {
      log('not connected, nothing sent')
      return false
    }
    webSocketRef.current.send(JSON.stringify(message))
    return true
  }

  function send() {
    if (!text) { tap('send (box is empty)'); return }
    tap('send "' + text + '"')
    if (sendToServer({ type: 'test', message: text })) setText('')
  }

  // catch the ghost the phone is pointing at, but only when it's close
  function catchGhost() {
    if (target.id === null) { tap('catch (no ghosts right now)'); return }
    if (level !== 2) { tap(`catch missed: ghost ${target.id} is ${Math.abs(target.dif ?? 0).toFixed(0)}° off`); return }
    tap('catch ghost ' + target.id)
    sendToServer({ type: 'catch', ghost_id: target.id })
  }

  // the Controller reports the closest ghost every 100ms; only re-render if it changed
  const onCompassUpdate = useCallback((dif: number | null, id: string | null) => {
    const rounded = dif === null ? null : Math.round(dif)
    setTarget((old) => (old.dif === rounded && old.id === id ? old : { dif: rounded, id }))
  }, [])

  function toggleHunting() {
    tap(buzzOn ? 'stop hunting' : 'start hunting')
    setBuzzOn(!buzzOn)
  }

  const ghostCount = Object.keys(ghosts).length

  // the near we are the faster it buzzes and flashes 
  useEffect(() => {
    if (!buzzOn || level === 0) return
    const gap = [0, 800, 200][level]  // buzz lvl
    const id = setInterval(() => buzz(80), gap)
    return () => clearInterval(id)
  }, [buzzOn, level])


  return (
    <div style={{ padding: 20, background: flash ? '#ff000033' : undefined }}>
      <h1>ghost game</h1>
      {announcement && <h2> {announcement}</h2>}

      {/* status: who am I, am I connected, what's the game doing */}
      <section>
        <h3>status</h3>
        <p>player: <b>{PLAYER_ID}</b></p>
        <p>server: <b>{status}</b></p>
        <p>ghosts available: <b>{ghostCount}</b></p>
      </section>

      {/* scoreboard: sent by the server with every ghost update */}
      <section>
        <h3>scores</h3>
        {Object.keys(scores).length === 0 ? <p>no catches yet</p> : (
          <ol>
            {Object.entries(scores).sort((a, b) => b[1] - a[1]).map(([p, n]) => (
              <li key={p}>{p === PLAYER_ID ? <b>{p} (you)</b> : p}: {n}</li>
            ))}
          </ol>
        )}
        <button onClick={() => { tap('new game'); sendToServer({ type: 'reset' }) }}>new game</button>
      </section>

      {/* claude: hunting: vibration test + catching */}
      <section>
        <h3>hunting</h3>
        <p>
          <button onClick={toggleHunting}>{buzzOn ? 'stop hunting' : 'start hunting'}</button>
          {' '}<b>{buzzOn ? 'hunting' : 'not hunting'}</b>
        </p>
        <p>
          level: <b>{LEVELS[level]}</b>
          {target.id !== null && <> (ghost {target.id}, {target.dif}° off)</>}
        </p>
        <p><button onClick={catchGhost}>catch a ghost</button></p>
      </section>

      {/* log: announcements, server replies, and every click, newest first */}
      <section>
        <h3>log</h3>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="test message" />
        <button onClick={send}>send</button>
        <ul>{messages.map((m, i) => <li key={i}>{m}</li>)}</ul>
      </section>
      
      <Controller ghosts={ghosts} player_offset={PLAYER_OFFSET} onUpdate={onCompassUpdate} />
    </div>
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

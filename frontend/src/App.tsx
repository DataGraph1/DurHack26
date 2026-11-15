import { Controller } from "./components/Controller"
import { useState, useEffect, useRef } from 'react'
import './App.css'

// phone url:  http://localhost:5173/?player=player1
const PLAYER_ID = new URLSearchParams(window.location.search).get('player') ?? 'player1'
const SERVER_URL = `ws://${window.location.hostname}:8000/ws?player_id=${PLAYER_ID}`

const LEVELS = ['far', 'medium', 'close']

function App() {
  const [status, setStatus] = useState('connecting...')
  const [messages, setMessages] = useState<string[]>([])   // the log, newest first
  const [text, setText] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [ghosts, setGhosts] = useState<Record<string, number>>({})  // ghost id -> angle
  const webSocketRef = useRef<WebSocket | null>(null)
  const [level, setLevel] = useState(1)        // 0 = far, 1= med, 2 = close
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

  // catch whichever ghost exists (until the compass picks the one you're pointing at)
  function catchGhost() {
    const ids = Object.keys(ghosts)
    if (ids.length === 0) { tap('catch (no ghosts right now)'); return }
    tap('catch ghost ' + ids[0])
    sendToServer({ type: 'catch', ghost_id: ids[0] })
  }

  function toggleHunting() {
    tap(buzzOn ? 'stop hunting' : 'start hunting')
    setBuzzOn(!buzzOn)
  }

  function pickLevel(i: number) {
    tap('level ' + LEVELS[i])
    setLevel(i)
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
        <p>ghosts available: <b>{ghostCount}</b>{ghostCount >= 5 && ' (full: catch one to spawn more)'}</p>
      </section>

      {/* claude: hunting: vibration test + catching */}
      <section>
        <h3>hunting</h3>
        <p>
          <button onClick={toggleHunting}>{buzzOn ? 'stop hunting' : 'start hunting'}</button>
          {' '}<b>{buzzOn ? 'hunting' : 'not hunting'}</b>
        </p>
        <p>
          {LEVELS.map((name, i) => (
            <button key={i} onClick={() => pickLevel(i)}
                    style={{ fontWeight: level === i ? 'bold' : 'normal', outline: level === i ? '2px solid' : 'none' }}>
              {name}
            </button>
          ))}
          {' '}level: <b>{LEVELS[level]}</b>
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
      
      <Controller ghosts={ghosts} player_offset={[0, 0]} />
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

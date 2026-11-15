import Controller from "./components/Controller.tsx"
import { useState, useEffect, useRef } from 'react'
import './App.css'

// phone url:  http://localhost:5173/?player=player1
const PLAYER_ID = new URLSearchParams(window.location.search).get('player') ?? 'player1'
const SERVER_URL = `ws://${window.location.hostname}:8000/ws?player_id=${PLAYER_ID}`

function App() {
  return (
    <>
      <Controller/>
    </>
  const [status, setStatus] = useState('connecting...')
  const [messages, setMessages] = useState<string[]>([])
  const [text, setText] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const webSocketRef = useRef<WebSocket | null>(null)
  const [level, setLevel] = useState(1)        // 0 = far, 1= med, 2 = close
  const [flash, setFlash] = useState(false)    // flash enabled 
  const [buzzOn, setBuzzOn] = useState(false) 


  useEffect(() => {
    let stopped = false 
    let gameFull = false

    function connect() {
      const ws = new WebSocket(SERVER_URL)
      webSocketRef.current = ws

      ws.onopen = () => setStatus('connected :)')

      ws.onmessage = (event) => {
      const data = JSON.parse(event.data)
        if (data.type === 'ghosts')
          return
        if (data.type === 'announcement') {
          setAnnouncement(data.message);
          return
        }
        if (data.type === 'error') gameFull = true

        setMessages((old) => [...old, data.message])
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

  function send() {
    if (webSocketRef.current?.readyState === WebSocket.OPEN) {
      webSocketRef.current.send(JSON.stringify({ type: 'test', message: text }))
      setText('')
    }
  }

  function buzz(pattern: number | number[]) {
    navigator.vibrate?.(pattern)
    setFlash(true)
    setTimeout(() => setFlash(false), 80)
  }

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
      {announcement && <h2>{announcement}</h2>}
      <p>player: <b>{PLAYER_ID}</b></p>
      <p>server: <b>{status}</b></p>

      <input value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={send}>send</button>
      
      {/* tmp test button*/}
      <button onClick={() => webSocketRef.current?.send(JSON.stringify({ type: 'catch', ghost_id: 0 }))}>
        catch ghost 0
      </button>

      <p>
        <button onClick={() => { buzz(50); setBuzzOn(!buzzOn) }}>
          {buzzOn ? 'stop hunting' : 'start hunting'}
        </button>
      </p>
      <p>
        {['far', 'medium', 'close'].map((name, i) => (
          <button key={i} onClick={() => setLevel(i)} disabled={level === i}>{name}</button>
        ))}
      </p>
      <p>level: <b>{['far', 'medium', 'close'][level]}</b></p>

      <ul>{messages.map((m, i) => <li key={i}>{m}</li>)}</ul>
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

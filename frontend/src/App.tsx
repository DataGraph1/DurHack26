import { useState, useEffect, useRef } from 'react'
import './App.css'

// phone url:  http://localhost:5173/?player=player1
const PLAYER_ID = new URLSearchParams(window.location.search).get('player') ?? 'player1'
const SERVER_URL = `ws://${window.location.hostname}:8000/ws?player_id=${PLAYER_ID}`

function App() {
  const [status, setStatus] = useState('connecting...')
  const [messages, setMessages] = useState<string[]>([])
  const [text, setText] = useState('')
  const webSocketRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    let stopped = false 
    let gameFull = false

    function connect() {
      const ws = new WebSocket(SERVER_URL)
      webSocketRef.current = ws

      ws.onopen = () => setStatus('connected :)')

      ws.onmessage = (event) => {
        const data = JSON.parse(event.data)
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

  return (
    <div style={{ padding: 20 }}>
      <h1>ghost game</h1>
      <p>player: <b>{PLAYER_ID}</b></p>
      <p>server: <b>{status}</b></p>

      <input value={text} onChange={(e) => setText(e.target.value)} />
      <button onClick={send}>send</button>

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

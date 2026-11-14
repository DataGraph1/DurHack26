from fastapi import APIRouter, WebSocket, WebSocketDisconnect

router = APIRouter()

# buffer for storing the ghost kills through pi
MAX_PLAYERS = 3
players = {}


# send a msg to one player
async def send_to(player_id, message):
    ws = players.get(player_id)
    if ws:
        await ws.send_json(message)


# send a msg to everyone
async def broadcast(message):
    for player_id in list(players):
        await send_to(player_id, message)


# just to check who is connected -> localhost:8000/players
@router.get("/players")
async def list_players():
    return {"connected": list(players)}


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, player_id: str):
    await websocket.accept()


    if player_id not in players and len(players) >= MAX_PLAYERS:
        await websocket.send_json({"type": "error", "message": "game is full"})
        await websocket.close()
        return

    players[player_id] = websocket
    print(player_id, "connected", len(players), "/", MAX_PLAYERS)
    await send_to(player_id, {"type": "welcome", "message": "hi " + player_id})

    try:
        while True:
            # wait for the phone to send something
            data = await websocket.receive_json()
            print(player_id, "sent:", data)

            # reply back to that phone
            await send_to(player_id, {"type": "reply", "message": "server got: " + str(data.get("message"))})

    except WebSocketDisconnect:
        print(player_id, "disconnected")
    finally:
        if players.get(player_id) is websocket:
            del players[player_id]

from fastapi import FastAPI
import asyncio, random, time
from contextlib import asynccontextmanager
from ghost import Ghost
from network import router, broadcast, ghost_kill_buffer, reset_requested, lobby_requested, players # connectning web socket to ghost


TICK_RATE = 1/20 #20 times a second
GAME_LENGTH = 60.0 # seconds
TIME_WARNINGS = [30] # announce + play a sound when the timer passes these

# sounds are played by the phones (frontend/public/sounds/<name>_sound.mp3), not the server:
# messages carry "sound": "<name>" and the browser plays it

class Game():

    def __init__(self, max_ghosts: int) -> None:
        self.max_ghosts : int = max_ghosts
        self.ghosts = {}
        self.time_for_next_ghost_spawn : float = 0.0
        self.ghost_id_counter : int = 0
        self.ghost_kill_buffer : list[tuple[str, int]] = ghost_kill_buffer # same list as network.py; (player_id, ghost_id) catches
        self.scores : dict[str, int] = {}  # player_id -> ghosts caught
        self.events : list[tuple[str, str | None]] = []  # (announcement, sound) to send this tick
        self.time_left : float = GAME_LENGTH
        self.warnings_left : list[int] = list(TIME_WARNINGS)
        self.state : str = "lobby"  # "lobby" (waiting for start) -> "playing" -> "over"

    def to_lobby(self):
        self.state = "lobby"
        self.ghosts.clear()
        self.scores.clear()
        self.ghost_kill_buffer.clear()
        self.time_left = GAME_LENGTH

    def new_game(self):
        self.state = "playing"
        self.ghosts.clear()
        self.scores.clear()
        self.ghost_kill_buffer.clear()
        self.time_left = GAME_LENGTH
        self.warnings_left = list(TIME_WARNINGS)
        self.time_for_next_ghost_spawn = 0.0
        self.events.append(("game started! find the ghosts", None))

    def game_over_message(self) -> str:
        if not self.scores:
            return "game over! nobody caught a ghost"
        best = max(self.scores.values())
        winners = [p for p, n in self.scores.items() if n == best]
        return f"game over! winner: {' & '.join(winners)} with {best}"

    def spawn_ghost(self):
        # if current number of ghosts is less than max ghosts, add a ghost to dictionary and increment ID counter
        if (len(self.ghosts) < self.max_ghosts):
            self.ghosts.update({self.ghost_id_counter : Ghost()})
            self.ghost_id_counter += 1
            self.events.append(("ghost appeared", "spawn_ghost"))

        # reset spawn timer
        self.time_for_next_ghost_spawn = float(random.randint(3, 6))

        

    def update(self, dt) -> None:
        if reset_requested[0]:
            reset_requested[0] = False
            self.new_game()
        if lobby_requested[0]:
            lobby_requested[0] = False
            self.to_lobby()

        # lobby / game over: nothing moves until someone presses start
        if self.state != "playing":
            self.ghost_kill_buffer.clear()
            return

        # timer tick down; announce each warning once when we pass it
        self.time_left -= dt
        while self.warnings_left and self.time_left <= self.warnings_left[0]:
            secs = self.warnings_left.pop(0)
            label = f"{secs // 60} minute{'s' if secs >= 120 else ''} left" if secs % 60 == 0 else f"{secs} seconds left"
            self.events.append((label, f"time_left_{secs}"))
        if self.time_left <= 0:
            self.time_left = 0
            self.state = "over"
            self.ghosts.clear()
            self.events.append((self.game_over_message(), "game_over"))
            return

        # decrease time until next ghost spawns
        self.time_for_next_ghost_spawn -= dt

        # if timer is up, attempt to spawn ghost
        if (self.time_for_next_ghost_spawn <= 0):
            self.spawn_ghost()

        # iterate through ghosts, and if a ghost is moving, its angle_pos changes a bit
        for ghost in self.ghosts.values():
            if (ghost.type == "moving"):
                ghost.angle_pos = (ghost.angle_pos + (5 * dt)) % 360 # makes sure it never exceeds 360 degress

        # go through buffer of ghost kills; first player to catch a ghost gets the point
        for player_id, ghost_id in self.ghost_kill_buffer:
            if self.ghosts.pop(ghost_id, None) is not None: # None = already caught by someone else
                self.scores[player_id] = self.scores.get(player_id, 0) + 1
                self.events.append((f"{player_id} caught a ghost! ({self.scores[player_id]} total)", "ghost_kill"))
        self.ghost_kill_buffer.clear()

    def to_message(self) -> dict:
                # ghost sending in nums, cant send in json
                return {"type": "ghosts",
                        "ghosts": {gid: g.angle_pos for gid, g in self.ghosts.items()},
                        "scores": self.scores,
                        "time_left": round(self.time_left),
                        "state": self.state,
                        "players": list(players)}

game = Game(max_ghosts = 3) #static num (the one in the pi)

async def game_loop():
    pre_time = time.monotonic()
    next_tick = pre_time

    while True: # runs forever; the Game itself handles game over + new game
        now = time.monotonic()
        dt = now - pre_time
        pre_time = now

        game.update(dt)

        try:
            for message, sound in game.events:
                await broadcast({"type": "announcement", "message": message, "sound": sound})
            game.events.clear()
            await broadcast(game.to_message())
        except Exception as e:
            print("broadcast failed:", e)

        # claude generated I dont really understand it but I think its
        # if a tick takes longer, the next is shorter to accommodate
        # I'm disappointed in you - Seg
        next_tick += TICK_RATE
        await asyncio.sleep(max(0, next_tick - time.monotonic()))

# runs when code starts
@asynccontextmanager
async def lifespan(app: FastAPI):
    t = asyncio.create_task(game_loop())
    yield # wait until code ends
    t.cancel()


app = FastAPI(
    title="Backend",
    version="0.1.0",
    lifespan=lifespan
)
app.include_router(router)

@app.get("/health")
async def health():
    return {"status": "ok"}

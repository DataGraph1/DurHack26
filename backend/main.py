from fastapi import FastAPI
import asyncio, random, time
from contextlib import asynccontextmanager
from ghost import Ghost
from network import router, broadcast, ghost_kill_buffer # connectning web socket to ghost
from playsound import playsound


TICK_RATE = 1/20 #20 times a second

class Game():

    def __init__(self, max_ghosts: int) -> None:
        self.max_ghosts : int = max_ghosts
        self.ghosts = {}
        self.time_for_next_ghost_spawn : float = 0.0
        self.ghost_id_counter : int = 0
        self.ghost_kill_buffer : list[int] = ghost_kill_buffer # same list as network.py; list that should contain ints representing the ghost IDs of ghosts to be killed
        self.time_left : float = 180.0

    def spawn_ghost(self):
        # if current number of ghosts is less than max ghosts, add a ghost to dictionary and increment ID counter
        if (len(self.ghosts) < self.max_ghosts):
            self.ghosts.update({self.ghost_id_counter : Ghost()})
            self.ghost_id_counter += 1
            playsound("sounds/spawn_ghost_sound.mp3")

        # reset spawn timer
        self.time_for_next_ghost_spawn = float(random.randint(3, 6))

        

    def update(self, dt) -> None:
        # decrease time until next ghost spawns
        self.time_for_next_ghost_spawn -= dt

        # if timer is up, attempt to spawn ghost
        if (self.time_for_next_ghost_spawn <= 0):
            self.spawn_ghost()

        # iterate through ghosts, and if a ghost is moving, its angle_pos changes a bit
        for ghost in self.ghosts.values():
            if (ghost.type == "moving"):
                ghost.angle_pos = (ghost.angle_pos + (5 * dt)) % 360 # makes sure it never exceeds 360 degress

        # go through buffer of ghost kills, and remove any ghosts which have been killed
        for ghost_id in self.ghost_kill_buffer:
            self.ghosts.pop(ghost_id, None) # no crash if the ghost is already gone
            playsound("sounds/ghost_kill_sound.mp3")
        self.ghost_kill_buffer.clear()

        # timer tick down
        self.time_left -= dt


    def to_message(self) -> dict:
                # ghost sending in nums, cant send in json
                return {"type": "ghosts",
                        "ghosts": {gid: g.angle_pos for gid, g in self.ghosts.items()}}

game = Game(max_ghosts = 5) #static num (the one in the pi)

async def game_loop():
    pre_time = time.monotonic()
    next_tick = pre_time

    while (game.time_left > 0): # check if game ended
        now = time.monotonic()
        dt = now - pre_time
        pre_time = now

        before = len(game.ghosts)
        game.update(dt)

        try:
            if len(game.ghosts) > before:
                await broadcast({"type": "announcement", "message": " ghost appeared"})
            await broadcast(game.to_message())
        except Exception as e:
            print("broadcast failed:", e)

        # At this point the server should send the ghost dictionary to each client so they update themselves accordingly

        # claude generated I dont really understand it but I think its
        # if a tick takes longer, the next is shorter to accommodate
        # I'm disappointed in you - Seg
        next_tick += TICK_RATE
        await asyncio.sleep(max(0, next_tick - time.monotonic()))

        # announce time left
        match game.time_left:
            case 120:
                try:
                    await broadcast({"type": "announcement", "message": " 2 minutes left"})
                except Exception as e:
                    print("broadcast failed:", e)
                playsound("sounds/time_left_120_sound.mp3")
            case 60:
                try:
                    await broadcast({"type": "announcement", "message": "1 minute left"})
                except Exception as e:
                    print("broadcast failed:", e)
                playsound("sounds/time_left_60_sound.mp3")
            case 30:
                try:
                    await broadcast({"type": "announcement", "message": "30 seconds left"})
                except Exception as e:
                    print("broadcast failed:", e)
                playsound("sounds/time_left_30_sound.mp3")
        
        
    # end of game announcement
    try:
        await broadcast({"type": "announcement", "message": " game over"})
    except Exception as e:
        print("broadcast failed:", e)
    playsound("sounds/game_over_sound.mp3")

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

from fastapi import FastAPI
import asyncio, random, time
from contextlib import asynccontextmanager
from .ghost import Ghost

TICK_RATE = 1/20 #20 times a second


class Game():
    
    def __init__(self, max_ghosts: int) -> None:
        self.max_ghosts : int = max_ghosts
        self.ghosts = {}
        self.time_for_next_ghost_spawn : float = 0.0
        self.ghost_id_counter : int = 0

    def spawn_ghost(self):
        # if current number of ghosts is less than max ghosts, add a ghost to dictionary and increment ID counter
        if (len(self.ghosts) < self.max_ghosts):
            self.ghosts.update({ghost_id_counter : Ghost()})
            self.ghost_id_counter++
        
        # reset spawn timer
        self.time_for_next_ghost_spawn = float(random.randint(3, 6))

    def update(self, dt) -> None:
        # decrease time until next ghost spawns
        self.time_for_next_ghost_spawn -= dt

        # if timer is up, attempt to spawn ghost
        if (self.time_for_next_ghost_spawn <= 0):
            spawn_ghost(self)
        
        # go through buffer of ghost kills, and remove any ghosts which have been killed
        # this is todo




# runs when code starts
@asynccontextmanager
async def lifespan(app: FastAPI):
    # asyncio.create_task(game_loop())
    
    yield # wait until code ends

app = FastAPI(
    title="Backend",
    version="0.1.0",
    lifespan=lifespan
)


@app.get("/health")
async def health():
    return {"status": "ok"}


async def game_loop(game):
    pre_time = time.monotonic()
    next_tick = pre_time

    while True:
        now = time.monotonic()
        dt = now - pre_time
        pre_time = now

        game.update(dt)

        # At this point the server should send the ghost dictionary to each client so they update themselves accordingly

        # claude generated I dont really understand it but I think its
        # if a tick takes longer, the next is shorter to accommodate
        # I'm disappointed in you - Seg
        next_tick += TICK_RATE
        await asyncio.sleep(max(0, next_tick - time.monotonic()))
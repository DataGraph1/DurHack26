from fastapi import FastAPI
import asyncio, random, time
from contextlib import asynccontextmanager
from .ghost import Ghost

TICK_RATE = 1/20 #20 times a second


class Game():
    time_for_next_ghost_spawn : int = 0

    def __init__(self, max_ghosts: int) -> None:
        self.max_ghosts : int = max_ghosts
        self.ghosts : list[Ghost] = []
        

    def spawn_ghost(self):
        self.ghosts.append(Ghost())
        time_for_next_ghost_spawn = random.randint(3, 10)

    def update(self, dt) -> None:
        pass




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

        # claude generated I dont really understand it but I think its
        # if a tick takes longer, the next is shorter to accommodate
        next_tick += TICK_RATE
        await asyncio.sleep(max(0, next_tick - time.monotonic()))
import random


class Ghost():
    def __init__(self) -> None:
        self.angle_pos = random.randint(0, 359)
        if (random.randint(1,4) == 4):
            self.type = "moving"
        else:
            self.type = "static"
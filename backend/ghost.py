import random


class Ghost():
    def __init__(self) -> None:
        self.angle_pos = random.randint(0, 359)
#!/usr/bin/env python3
"""GPIO bridge for the Leash agent app.

stdin commands (one per line):  light <off|blue|amber|green|red|purple>  |  buzz <ms>
stdout events (one per line):   ready  |  press <talk|approve|cancel>  |  release <talk|approve|cancel>
Pins come from environment variables (BCM numbering).
"""
import os
import sys
import threading
import time

from gpiozero import Button, OutputDevice, RGBLED

PINS = {
    "talk": int(os.environ.get("PIN_BUTTON_TALK", "17")),
    "approve": int(os.environ.get("PIN_BUTTON_APPROVE", "27")),
    "cancel": int(os.environ.get("PIN_BUTTON_CANCEL", "22")),
}
LED = RGBLED(
    red=int(os.environ.get("PIN_LED_R", "5")),
    green=int(os.environ.get("PIN_LED_G", "6")),
    blue=int(os.environ.get("PIN_LED_B", "13")),
    active_high=os.environ.get("LED_COMMON_ANODE", "0") != "1",
)
MOTOR = OutputDevice(int(os.environ.get("PIN_BUZZER", "26")))

COLORS = {
    "off": (0, 0, 0),
    "blue": (0, 0, 1),
    "amber": (1, 0.35, 0),
    "green": (0, 1, 0),
    "red": (1, 0, 0),
    "purple": (0.6, 0, 1),
}

lock = threading.Lock()


def emit(line):
    with lock:
        sys.stdout.write(line + "\n")
        sys.stdout.flush()


buttons = []
for name, pin in PINS.items():
    button = Button(pin, pull_up=True, bounce_time=0.03)
    button.when_pressed = lambda n=name: emit(f"press {n}")
    button.when_released = lambda n=name: emit(f"release {n}")
    buttons.append(button)


def buzz(ms):
    MOTOR.on()
    time.sleep(ms / 1000)
    MOTOR.off()


emit("ready")
for raw in sys.stdin:
    parts = raw.strip().split()
    if not parts:
        continue
    if parts[0] == "light" and len(parts) == 2 and parts[1] in COLORS:
        LED.color = COLORS[parts[1]]
    elif parts[0] == "buzz" and len(parts) == 2 and parts[1].isdigit():
        threading.Thread(target=buzz, args=(int(parts[1]),), daemon=True).start()
    else:
        sys.stderr.write(f"unknown command: {raw}")

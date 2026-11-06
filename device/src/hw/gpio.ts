import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { EventEmitter } from "node:events";
import path from "node:path";
import { createInterface } from "node:readline";
import { config, DEVICE_ROOT } from "../config.js";
import type { Light } from "../state.js";

export type ButtonName = "talk" | "approve" | "cancel";

class Gpio extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private held = new Set<ButtonName>();

  async start() {
    if (!config.hardware.enabled) return;
    const proc = spawn(config.hardware.pythonBin, [path.join(DEVICE_ROOT, "hw", "gpio_helper.py")], {
      env: process.env,
    });
    this.proc = proc;
    proc.stderr.on("data", (chunk) => process.stderr.write(`[gpio] ${chunk}`));
    proc.on("exit", (code) => {
      this.proc = null;
      console.error(`[gpio] helper exited with code ${code}; buttons and lights are offline`);
    });

    const lines = createInterface({ input: proc.stdout });
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("GPIO helper did not start within 10s")), 10_000);
      lines.on("line", (line) => {
        const [kind, name] = line.trim().split(" ") as [string, ButtonName];
        if (kind === "ready") {
          clearTimeout(timer);
          resolve();
        } else if (kind === "press") {
          this.held.add(name);
          this.emit("press", name);
        } else if (kind === "release") {
          this.held.delete(name);
          this.emit("release", name);
        }
      });
      proc.once("exit", () => reject(new Error("GPIO helper exited during startup")));
    });
  }

  get available() {
    return this.proc !== null;
  }

  isHeld(name: ButtonName) {
    return this.held.has(name);
  }

  light(color: Light) {
    this.proc?.stdin.write(`light ${color}\n`);
  }

  buzz(ms = 250) {
    this.proc?.stdin.write(`buzz ${Math.round(ms)}\n`);
  }

  /** Resolves with the next button pressed among `names`, or null on timeout. */
  waitForPress(names: ButtonName[], timeoutMs: number, signal?: AbortSignal): Promise<ButtonName | null> {
    return new Promise((resolve) => {
      const onPress = (name: ButtonName) => {
        if (names.includes(name)) done(name);
      };
      const done = (result: ButtonName | null) => {
        clearTimeout(timer);
        this.off("press", onPress);
        signal?.removeEventListener("abort", onAbort);
        resolve(result);
      };
      const onAbort = () => done(null);
      const timer = setTimeout(() => done(null), timeoutMs);
      this.on("press", onPress);
      signal?.addEventListener("abort", onAbort);
    });
  }
}

export const gpio = new Gpio();

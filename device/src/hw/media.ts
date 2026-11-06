import { execFile, spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { config } from "../config.js";

const run = promisify(execFile);

/** Records 16 kHz mono WAV from the mic until `stop()` is called. */
export async function startRecording() {
  const dir = await mkdtemp(path.join(tmpdir(), "leash-voice-"));
  const file = path.join(dir, "speech.wav");
  const proc: ChildProcess = spawn(
    "arecord",
    ["-D", config.hardware.micDevice, "-f", "S16_LE", "-r", "16000", "-c", "1", "-t", "wav", file],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
  let stderr = "";
  proc.stderr?.on("data", (c) => (stderr += c));
  const exited = new Promise<number | null>((resolve) => proc.on("exit", resolve));
  proc.on("error", (err) => {
    stderr += String(err);
  });

  return {
    async stop(): Promise<string> {
      proc.kill("SIGINT");
      const code = await exited;
      if (code !== 0 && code !== null && code !== 1) {
        throw new Error(`arecord failed (${code}): ${stderr.trim()}`);
      }
      return file;
    },
    async cleanup() {
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/** Local speech to text with whisper.cpp. Nothing leaves the device. */
export async function transcribe(wavFile: string): Promise<string> {
  const { stdout } = await run(
    config.hardware.whisperBin,
    ["-m", config.hardware.whisperModel, "-f", wavFile, "-nt", "-np", "-l", "en", "-t", "4"],
    { timeout: 60_000, maxBuffer: 1024 * 1024 },
  );
  return stdout
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Takes a still with the Pi camera and returns the decoded QR / barcode text, or null if there is none. */
export async function scanCode(): Promise<string | null> {
  const dir = await mkdtemp(path.join(tmpdir(), "leash-cam-"));
  const file = path.join(dir, "frame.jpg");
  try {
    await run(config.hardware.cameraBin, ["-n", "-t", "800", "--width", "1640", "--height", "1232", "-o", file], {
      timeout: 15_000,
    });
    try {
      const { stdout } = await run("zbarimg", ["--raw", "-q", file], { timeout: 10_000 });
      const text = stdout.trim();
      return text || null;
    } catch (err) {
      // zbarimg exits with code 4 when no symbol is found
      if ((err as { code?: number }).code === 4) return null;
      throw err;
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function captureJpeg(): Promise<Buffer> {
  const dir = await mkdtemp(path.join(tmpdir(), "leash-cam-"));
  const file = path.join(dir, "frame.jpg");
  try {
    await run(config.hardware.cameraBin, ["-n", "-t", "800", "--width", "1024", "--height", "768", "-o", file], {
      timeout: 15_000,
    });
    return await readFile(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

let speaking: ChildProcess | null = null;

export function say(text: string) {
  if (!config.hardware.enabled) {
    console.log(`[speaker] ${text}`);
    return;
  }
  speaking?.kill();
  const proc = spawn(config.hardware.ttsBin, ["-s", "165", text], { stdio: "ignore" });
  proc.on("error", (err) => console.error(`[speaker] ${err.message}`));
  speaking = proc;
}

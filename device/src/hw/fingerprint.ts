import { SerialPort } from "serialport";
import { config } from "../config.js";

const HEADER = 0xef01;
const ADDRESS = 0xffffffff;
const PID_COMMAND = 0x01;
const PID_ACK = 0x07;

const CMD = {
  genImg: 0x01,
  img2Tz: 0x02,
  search: 0x04,
  regModel: 0x05,
  store: 0x06,
  verifyPassword: 0x13,
  templateCount: 0x1d,
  auraLed: 0x35,
} as const;

const OK = 0x00;
const NO_FINGER = 0x02;
const NOT_FOUND = 0x09;

export const AURA = { breathing: 0x01, flashing: 0x02, on: 0x03, off: 0x04 } as const;
export const AURA_COLOR = { red: 0x01, blue: 0x02, purple: 0x03 } as const;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Driver for the R503 / R307 / AS608 family over USB-serial. The sensor matches the thumb itself and answers yes/no. */
export class FingerprintSensor {
  private port: SerialPort;
  private buffer = Buffer.alloc(0);
  private waiter: ((packet: Buffer) => void) | null = null;

  private constructor(port: SerialPort) {
    this.port = port;
    port.on("data", (chunk: Buffer) => {
      this.buffer = Buffer.concat([this.buffer, chunk]);
      this.drain();
    });
  }

  static async open(): Promise<FingerprintSensor> {
    const path = config.hardware.fingerprintPort;
    if (!path) throw new Error("FINGERPRINT_PORT is not set; the fingerprint sensor is required for over-limit payments");
    const port = await new Promise<SerialPort>((resolve, reject) => {
      const p = new SerialPort({ path, baudRate: config.hardware.fingerprintBaud }, (err) =>
        err ? reject(new Error(`Cannot open fingerprint sensor on ${path}: ${err.message}`)) : resolve(p),
      );
    });
    const sensor = new FingerprintSensor(port);
    const [code] = await sensor.command(CMD.verifyPassword, [0, 0, 0, 0]);
    if (code !== OK) throw new Error(`Fingerprint sensor rejected the handshake (code ${code})`);
    return sensor;
  }

  private drain() {
    while (this.buffer.length >= 9) {
      const start = this.buffer.indexOf(Buffer.from([0xef, 0x01]));
      if (start < 0) {
        this.buffer = Buffer.alloc(0);
        return;
      }
      if (start > 0) this.buffer = this.buffer.subarray(start);
      if (this.buffer.length < 9) return;
      const length = this.buffer.readUInt16BE(7);
      const total = 9 + length;
      if (this.buffer.length < total) return;
      const packet = this.buffer.subarray(0, total);
      this.buffer = this.buffer.subarray(total);
      if (packet[6] === PID_ACK && this.waiter) {
        const resolve = this.waiter;
        this.waiter = null;
        resolve(packet.subarray(9, total - 2));
      }
    }
  }

  private async command(instruction: number, params: number[] = [], timeoutMs = 3000): Promise<Buffer> {
    const data = [instruction, ...params];
    const length = data.length + 2;
    const packet = Buffer.alloc(9 + length);
    packet.writeUInt16BE(HEADER, 0);
    packet.writeUInt32BE(ADDRESS, 2);
    packet[6] = PID_COMMAND;
    packet.writeUInt16BE(length, 7);
    Buffer.from(data).copy(packet, 9);
    let sum = PID_COMMAND + (length >> 8) + (length & 0xff);
    for (const b of data) sum += b;
    packet.writeUInt16BE(sum & 0xffff, 9 + data.length);

    const reply = new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(new Error(`Fingerprint sensor did not answer instruction 0x${instruction.toString(16)}`));
      }, timeoutMs);
      this.waiter = (p) => {
        clearTimeout(timer);
        resolve(p);
      };
    });
    this.port.write(packet);
    return reply;
  }

  async aura(mode: number, color: number, speed = 0x80, times = 0) {
    await this.command(CMD.auraLed, [mode, speed, color, times]).catch(() => undefined);
  }

  async templateCount(): Promise<number> {
    const reply = await this.command(CMD.templateCount);
    if (reply[0] !== OK) throw new Error(`Template count failed (code ${reply[0]})`);
    return reply.readUInt16BE(1);
  }

  /** Waits for a finger and captures it into char buffer 1 or 2. Returns false on timeout/abort. */
  private async capture(bufferId: 1 | 2, deadline: number, signal?: AbortSignal): Promise<boolean> {
    while (Date.now() < deadline && !signal?.aborted) {
      const [code] = await this.command(CMD.genImg);
      if (code === NO_FINGER) {
        await sleep(120);
        continue;
      }
      if (code !== OK) {
        await sleep(200);
        continue;
      }
      const [tz] = await this.command(CMD.img2Tz, [bufferId]);
      if (tz === OK) return true;
      await sleep(200);
    }
    return false;
  }

  /** Resolves true only if an enrolled finger is matched by the sensor before the timeout. */
  async verify(timeoutMs: number, signal?: AbortSignal): Promise<{ matched: boolean; pageId?: number; score?: number }> {
    await this.aura(AURA.breathing, AURA_COLOR.blue);
    const deadline = Date.now() + timeoutMs;
    try {
      while (Date.now() < deadline && !signal?.aborted) {
        if (!(await this.capture(1, deadline, signal))) break;
        const reply = await this.command(CMD.search, [1, 0, 0, 0x00, 0xc8]);
        if (reply[0] === OK) {
          await this.aura(AURA.flashing, AURA_COLOR.purple, 0x30, 2);
          return { matched: true, pageId: reply.readUInt16BE(1), score: reply.readUInt16BE(3) };
        }
        if (reply[0] === NOT_FOUND) {
          await this.aura(AURA.flashing, AURA_COLOR.red, 0x30, 3);
          return { matched: false };
        }
      }
      return { matched: false };
    } finally {
      await sleep(400);
      await this.aura(AURA.off, AURA_COLOR.blue);
    }
  }

  /** Two presses of the same finger, merged and stored at `pageId`. */
  async enroll(pageId: number, prompt: (msg: string) => void): Promise<void> {
    const deadline = () => Date.now() + 30_000;
    prompt("Place your thumb on the sensor");
    if (!(await this.capture(1, deadline()))) throw new Error("No finger detected");
    prompt("Lift your thumb");
    while ((await this.command(CMD.genImg))[0] !== NO_FINGER) await sleep(150);
    prompt("Place the same thumb again");
    if (!(await this.capture(2, deadline()))) throw new Error("No finger detected");
    const [merge] = await this.command(CMD.regModel);
    if (merge !== OK) throw new Error(`The two scans did not match (code ${merge}); try again`);
    const [stored] = await this.command(CMD.store, [1, pageId >> 8, pageId & 0xff]);
    if (stored !== OK) throw new Error(`Could not store the template (code ${stored})`);
  }

  async close() {
    await new Promise<void>((resolve) => this.port.close(() => resolve()));
  }
}

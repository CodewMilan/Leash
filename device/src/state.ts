import { EventEmitter } from "node:events";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { config } from "./config.js";

export type Phase =
  | "idle"
  | "listening"
  | "transcribing"
  | "scanning"
  | "thinking"
  | "saving_memory"
  | "requesting"
  | "awaiting_thumb"
  | "awaiting_world"
  | "paying"
  | "logging"
  | "paid"
  | "refused"
  | "answered"
  | "safe_mode"
  | "error";

export type Light = "off" | "blue" | "amber" | "green" | "red" | "purple";

/** What the device's own screen shows. `payment` is only ever filled from the transaction the device is about to sign. */
export interface ScreenState {
  phase: Phase;
  headline: string;
  detail?: string;
  light: Light;
  brainOnline: boolean;
  payment?: {
    amountUsdc: string;
    payTo: string;
    payToName?: string;
    merchant: string;
    overLimit: boolean;
  };
  worldApproval?: { url: string; qrSvg: string; expiresAt?: string };
  episodeId?: string;
  updatedAt: string;
}

export interface EpisodeRecord {
  id: string;
  startedAt: string;
  finishedAt?: string;
  heard?: string;
  saw?: string;
  outcome?: "paid" | "refused" | "answered" | "safe_mode" | "error";
  reason?: string;
  decision?: unknown;
  zg?: { requestId: string; model: string };
  memory?: { rootHash: string; txHash: string };
  payment?: {
    amountUsdc: string;
    payTo: string;
    merchant: string;
    resource: string;
    overLimit: boolean;
    hederaTxId?: string;
  };
  approvals?: { fingerprint?: boolean; world?: { verified: boolean; reference?: string } };
  spendLog?: { topicId: string; sequenceNumber: string };
}

class DeviceState extends EventEmitter {
  screen: ScreenState = {
    phase: "idle",
    headline: "Hold the button and speak",
    light: "off",
    brainOnline: false,
    updatedAt: new Date().toISOString(),
  };

  private episodes: EpisodeRecord[] = [];
  private readonly logFile = path.join(config.dataDir, "episodes.jsonl");

  setScreen(next: Partial<ScreenState> & Pick<ScreenState, "phase" | "headline">) {
    this.screen = {
      brainOnline: this.screen.brainOnline,
      light: this.screen.light,
      ...next,
      updatedAt: new Date().toISOString(),
    };
    this.emit("screen", this.screen);
  }

  setBrainOnline(online: boolean) {
    if (this.screen.brainOnline === online) return;
    this.screen = { ...this.screen, brainOnline: online, updatedAt: new Date().toISOString() };
    this.emit("screen", this.screen);
  }

  async loadHistory() {
    await mkdir(config.dataDir, { recursive: true });
    const raw = await readFile(this.logFile, "utf8").catch(() => "");
    this.episodes = raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as EpisodeRecord)
      .slice(-200);
  }

  async recordEpisode(episode: EpisodeRecord) {
    this.episodes.push(episode);
    if (this.episodes.length > 200) this.episodes.shift();
    await mkdir(config.dataDir, { recursive: true });
    await appendFile(this.logFile, JSON.stringify(episode) + "\n");
    this.emit("episode", episode);
  }

  history(): EpisodeRecord[] {
    return [...this.episodes].reverse();
  }
}

export const state = new DeviceState();

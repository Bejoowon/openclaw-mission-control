import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export type CrewChatLogEntry = Record<string, unknown>;

const MAX_TAIL_BYTES = 256 * 1024;
let appendChain: Promise<void> = Promise.resolve();

export function crewChatLogPath() {
  return path.join(os.homedir(), ".openclaw", "dashboard", "crew-chat-log.jsonl");
}

async function ensureLogFile(filePath: string) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "", "utf8");
  }
}

export async function appendCrewChatLog(entry: CrewChatLogEntry) {
  const file = crewChatLogPath();
  await ensureLogFile(file);

  appendChain = appendChain.then(async () => {
    await fs.appendFile(file, JSON.stringify(entry) + "\n", "utf8");
  });

  return appendChain;
}

export async function readRecentCrewChatLines(limit = 200): Promise<string[]> {
  const file = crewChatLogPath();
  await ensureLogFile(file);

  const stat = await fs.stat(file);
  const readSize = Math.min(stat.size, MAX_TAIL_BYTES);
  if (readSize <= 0) return [];

  const start = Math.max(0, stat.size - readSize);
  const fh = await fs.open(file, "r");
  try {
    const buf = Buffer.alloc(readSize);
    await fh.read(buf, 0, readSize, start);
    const raw = buf.toString("utf8");
    const lines = raw.split(/\r?\n/).filter(Boolean);
    return lines.slice(-limit);
  } finally {
    await fh.close();
  }
}

export function parseCrewChatLines(lines: string[]) {
  return lines
    .map((line) => {
      try {
        return JSON.parse(line) as CrewChatLogEntry;
      } catch {
        return null;
      }
    })
    .filter((v): v is CrewChatLogEntry => Boolean(v));
}

export async function findRecentByRequestId(requestId: string, maxLines = 400) {
  const lines = await readRecentCrewChatLines(maxLines);
  const entries = parseCrewChatLines(lines);
  return entries.find((entry) => {
    const metadata = entry.metadata as { requestId?: string } | undefined;
    return metadata?.requestId === requestId;
  });
}

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";

function logPath() {
  return path.join(os.homedir(), ".openclaw", "dashboard", "crew-chat-log.jsonl");
}

async function ensureFile(file: string) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  try {
    await fs.access(file);
  } catch {
    await fs.writeFile(file, "", "utf8");
  }
}

export async function GET() {
  try {
    const file = logPath();
    await ensureFile(file);
    const raw = await fs.readFile(file, "utf8");
    const lines = raw
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(-200);

    const messages = lines
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    return NextResponse.json({ messages });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "read failed" },
      { status: 500 },
    );
  }
}

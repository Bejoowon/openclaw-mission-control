import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { NextResponse } from "next/server";

const execFileAsync = promisify(execFile);

type SendBody = {
  from?: string;
  mode?: "direct" | "group";
  to?: string;
  targets?: string[];
  text?: string;
};

function logPath() {
  return path.join(os.homedir(), ".openclaw", "dashboard", "crew-chat-log.jsonl");
}

function configPath() {
  return path.join(os.homedir(), ".openclaw", "openclaw.json");
}

async function appendLog(entry: Record<string, unknown>) {
  const file = logPath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.appendFile(file, JSON.stringify(entry) + "\n", "utf8");
}

async function getAgentIds() {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    const parsed = JSON.parse(raw) as { agents?: { list?: Array<{ id?: string }> } };
    return (parsed.agents?.list ?? [])
      .map((a) => a.id)
      .filter((id): id is string => Boolean(id));
  } catch {
    return [];
  }
}

async function askAgent(agentId: string, message: string) {
  const startedAt = new Date().toISOString();
  try {
    const { stdout } = await execFileAsync(
      "openclaw",
      ["agent", "--agent", agentId, "--message", message, "--json"],
      { timeout: 60000 },
    );

    const json = JSON.parse(stdout) as {
      result?: { payloads?: Array<{ text?: string | null }> };
      status?: string;
    };

    const text = json.result?.payloads?.map((p) => p.text).filter(Boolean).join("\n\n") || "(응답 없음)";

    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      room: "crew",
      type: "agent-reply",
      from: agentId,
      to: "user",
      text,
      status: json.status ?? "ok",
      startedAt,
    };
    await appendLog(msg);
    return msg;
  } catch (error) {
    const msg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      room: "crew",
      type: "agent-reply",
      from: agentId,
      to: "user",
      text: error instanceof Error ? error.message : "agent call failed",
      status: "error",
      startedAt,
    };
    await appendLog(msg);
    return msg;
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as SendBody;
    const from = body.from || "user";
    const mode = body.mode || "group";
    const text = (body.text || "").trim();

    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    let targets: string[] = [];
    if (mode === "direct") {
      if (!body.to) return NextResponse.json({ error: "to is required for direct" }, { status: 400 });
      targets = [body.to];
    } else {
      if (body.targets && body.targets.length > 0) {
        targets = body.targets;
      } else {
        targets = await getAgentIds();
      }
    }

    const userMsg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      room: mode === "group" ? "crew" : `dm:${targets[0]}`,
      type: "user",
      from,
      to: mode === "group" ? "all" : targets[0],
      text,
      status: "sent",
    };
    await appendLog(userMsg);

    const prompt =
      mode === "group"
        ? `[Crew Group Chat] ${from} says: ${text}`
        : `[Direct Message from ${from}] ${text}`;

    const replies = await Promise.all(targets.map((agentId) => askAgent(agentId, prompt)));

    return NextResponse.json({ ok: true, sent: userMsg, repliesCount: replies.length });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "send failed" },
      { status: 500 },
    );
  }
}

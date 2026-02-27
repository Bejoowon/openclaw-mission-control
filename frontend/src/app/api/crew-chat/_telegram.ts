import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

type SessionIndexEntry = {
  sessionId?: string;
  updatedAt?: number;
  sessionFile?: string;
};

type TelegramSyncMessage = {
  id: string;
  ts: string;
  room: string;
  type: "user" | "assistant";
  from: string;
  to: string;
  text: string;
  status: "ok";
  source: "telegram";
  readonly: true;
};

type TelegramSyncResult = {
  available: boolean;
  notice?: string;
  messages: TelegramSyncMessage[];
  sessionKey?: string;
};

function expandHome(input: string) {
  if (input.startsWith("~/")) return path.join(os.homedir(), input.slice(2));
  return input;
}

function sessionsIndexPath() {
  const configured = process.env.CREW_CHAT_SESSIONS_INDEX?.trim();
  if (configured) return expandHome(configured);

  const agentId = process.env.CREW_CHAT_AGENT_ID?.trim() || "8lomi-ai";
  return path.join(os.homedir(), ".openclaw", "agents", agentId, "sessions", "sessions.json");
}

function extractText(message: unknown): string {
  if (!message || typeof message !== "object") return "";
  const content = (message as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";

  const parts = content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const p = part as { type?: unknown; text?: unknown };
      if (p.type !== "text") return "";
      return typeof p.text === "string" ? p.text : "";
    })
    .filter(Boolean);

  return parts.join("\n\n").trim();
}

function sanitizeUserText(text: string) {
  // OpenClaw telegram inbound wrapper 제거
  const marker = "```\n\n";
  const idx = text.indexOf(marker);
  if (text.startsWith("Conversation info (untrusted metadata):") && idx >= 0) {
    return text.slice(idx + marker.length).trim();
  }
  return text;
}

export async function readTelegramSyncedMessages(limit = 200): Promise<TelegramSyncResult> {
  try {
    const indexPath = sessionsIndexPath();
    const raw = await fs.readFile(indexPath, "utf8");
    const index = JSON.parse(raw) as Record<string, SessionIndexEntry>;

    const candidates = Object.entries(index)
      .filter(([key]) => key.includes(":telegram:direct:"))
      .map(([key, value]) => ({ key, value }))
      .sort((a, b) => (b.value.updatedAt ?? 0) - (a.value.updatedAt ?? 0));

    if (candidates.length === 0) {
      return {
        available: false,
        notice: "텔레그램 대화 기록을 찾지 못했어요.",
        messages: [],
      };
    }

    const target = candidates[0];
    const filePath = target.value.sessionFile;
    if (!filePath) {
      return {
        available: false,
        notice: "텔레그램 세션 파일 경로를 찾지 못했어요.",
        messages: [],
        sessionKey: target.key,
      };
    }

    const lines = (await fs.readFile(filePath, "utf8")).split(/\r?\n/).filter(Boolean);
    const out: TelegramSyncMessage[] = [];

    for (const line of lines) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(line);
      } catch {
        continue;
      }

      if (!parsed || typeof parsed !== "object") continue;
      const row = parsed as {
        type?: unknown;
        id?: unknown;
        timestamp?: unknown;
        message?: { role?: unknown; content?: unknown };
      };
      if (row.type !== "message") continue;

      const role = row.message?.role;
      if (role !== "user" && role !== "assistant") continue;

      const text = extractText(row.message);
      const cleaned = role === "user" ? sanitizeUserText(text) : text;
      if (!cleaned) continue;

      const ts = typeof row.timestamp === "string" ? row.timestamp : new Date().toISOString();
      const lineId = typeof row.id === "string" ? row.id : `${ts}-${out.length}`;

      out.push({
        id: `tg:${target.value.sessionId ?? "session"}:${lineId}`,
        ts,
        room: "telegram:direct",
        type: role,
        from: role === "user" ? "주원" : "방울이",
        to: role === "user" ? "방울이" : "주원",
        text: cleaned,
        status: "ok",
        source: "telegram",
        readonly: true,
      });
    }

    return {
      available: true,
      messages: out.slice(-limit),
      sessionKey: target.key,
    };
  } catch (error) {
    return {
      available: false,
      notice: error instanceof Error ? `텔레그램 동기화 실패: ${error.message}` : "텔레그램 동기화 실패",
      messages: [],
    };
  }
}

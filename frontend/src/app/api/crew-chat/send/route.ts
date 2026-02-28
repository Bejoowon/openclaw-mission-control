import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { NextResponse } from "next/server";
import { isValidCrewPin, readCrewPinFromRequest } from "../_auth";
import { appendCrewChatLog, findRecentByRequestId } from "../_log";

const execFileAsync = promisify(execFile);

const ACK_VERSION = "2026-02-crew-chat-v2";

type SendBody = {
  from?: string;
  mode?: "direct" | "group";
  to?: string;
  targets?: string[];
  text?: string;
  requestId?: string;
};

function configPath() {
  return path.join(os.homedir(), ".openclaw", "openclaw.json");
}

function apiError(status: number, code: string, message: string, details?: Record<string, unknown>) {
  return NextResponse.json(
    {
      ok: false,
      error: message,
      errorInfo: { code, message, retryable: status >= 500, ...(details ? { details } : {}) },
    },
    { status },
  );
}

function normalizeRequestId(req: Request, body: SendBody) {
  const headerKey = req.headers.get("x-idempotency-key")?.trim();
  const bodyKey = body.requestId?.trim();
  const key = headerKey || bodyKey;
  if (key && key.length > 0) return key.slice(0, 128);
  return `auto-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

async function getAgentIds() {
  try {
    const raw = await fs.readFile(configPath(), "utf8");
    const parsed = JSON.parse(raw) as { agents?: { list?: Array<{ id?: string }> } };
    return (parsed.agents?.list ?? [])
      .map((a) => a.id)
      .filter((id): id is string => Boolean(id) && id !== "main");
  } catch {
    return [];
  }
}

async function askAgent(agentId: string, message: string, room: string, requestId: string) {
  const startedAt = new Date().toISOString();
  try {
    const { stdout } = await execFileAsync(
      "openclaw",
      ["agent", "--agent", agentId, "--message", message, "--json"],
      { timeout: 180_000 },
    );

    const json = JSON.parse(stdout) as {
      result?: { payloads?: Array<{ text?: string | null }> };
      status?: string;
    };

    const text = json.result?.payloads?.map((p) => p.text).filter(Boolean).join("\n\n") || "";

    if (!text.trim()) {
      return;
    }

    await appendCrewChatLog({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      room,
      type: "agent-reply",
      from: agentId,
      to: "user",
      text,
      status: json.status ?? "ok",
      startedAt,
      metadata: { requestId },
    });
  } catch (error) {
    await appendCrewChatLog({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      room,
      type: "agent-reply",
      from: agentId,
      to: "user",
      text: error instanceof Error ? error.message : "agent call failed",
      status: "error",
      startedAt,
      metadata: { requestId },
    });
  }
}

function fireAndForgetAgentCalls(targets: string[], prompt: string, room: string, requestId: string) {
  void Promise.all(targets.map((agentId) => askAgent(agentId, prompt, room, requestId))).catch(async (error) => {
    await appendCrewChatLog({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      room,
      type: "system",
      from: "crew-chat-api",
      to: "user",
      text: error instanceof Error ? error.message : "async dispatch failed",
      status: "error",
      metadata: { requestId },
    });
  });
}

export async function POST(req: Request) {
  try {
    const pin = readCrewPinFromRequest(req);
    if (!isValidCrewPin(pin)) {
      return apiError(401, "UNAUTHORIZED", "인증이 필요해요.");
    }

    const body = (await req.json().catch(() => ({}))) as SendBody;
    const from = body.from || "user";
    const mode = body.mode || "group";
    const text = (body.text || "").trim();
    const requestId = normalizeRequestId(req, body);

    if (!text) {
      return apiError(400, "VALIDATION_ERROR", "text is required", { field: "text" });
    }

    const duplicated = await findRecentByRequestId(requestId);
    if (duplicated) {
      return NextResponse.json({
        ok: true,
        ack: {
          accepted: true,
          duplicate: true,
          requestId,
          contract: ACK_VERSION,
        },
      });
    }

    let targets: string[] = [];
    if (mode === "direct") {
      if (!body.to) return apiError(400, "VALIDATION_ERROR", "to is required for direct", { field: "to" });
      targets = [body.to];
    } else {
      targets = body.targets && body.targets.length > 0 ? body.targets : await getAgentIds();
    }

    if (targets.length === 0) {
      return apiError(404, "NO_TARGETS", "메시지를 받을 에이전트를 찾지 못했어요.");
    }

    const room = mode === "group" ? "crew" : `dm:${targets[0]}`;
    const userMsg = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ts: new Date().toISOString(),
      room,
      type: "user",
      from,
      to: mode === "group" ? "all" : targets[0],
      text,
      status: "sent",
      metadata: { requestId },
    };

    await appendCrewChatLog(userMsg);

    const prompt = mode === "group" ? `[크루 단체방] ${from}: ${text}` : `[개인 메시지 - 보낸 사람 ${from}] ${text}`;

    fireAndForgetAgentCalls(targets, prompt, room, requestId);

    return NextResponse.json({
      ok: true,
      ack: {
        accepted: true,
        duplicate: false,
        requestId,
        room,
        targets,
        queuedAt: new Date().toISOString(),
        contract: ACK_VERSION,
      },
      sent: userMsg,
    });
  } catch (error) {
    return apiError(500, "SEND_FAILED", error instanceof Error ? error.message : "send failed");
  }
}

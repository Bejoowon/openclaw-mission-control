import { NextResponse } from "next/server";

import { isValidCrewPin, readCrewPinFromRequest } from "../_auth";
import { parseCrewChatLines, readRecentCrewChatLines } from "../_log";
import { readTelegramSyncedMessages } from "../_telegram";

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

function dedupeById<T extends { id?: unknown }>(items: T[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const id = typeof item.id === "string" ? item.id : "";
    if (!id || seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

export async function GET(req: Request) {
  try {
    const pin = readCrewPinFromRequest(req);
    if (!isValidCrewPin(pin)) {
      return apiError(401, "UNAUTHORIZED", "인증이 필요해요.");
    }

    const { searchParams } = new URL(req.url);
    const view = searchParams.get("view") || "crew";

    const crewLines = await readRecentCrewChatLines(250);
    const crewMessages = parseCrewChatLines(crewLines);

    const telegram = await readTelegramSyncedMessages(250);

    const messages =
      view === "telegram"
        ? telegram.messages
        : view === "merged"
          ? [...crewMessages, ...telegram.messages].sort((a, b) => {
              const ta = new Date((a as { ts?: string }).ts ?? 0).getTime();
              const tb = new Date((b as { ts?: string }).ts ?? 0).getTime();
              return ta - tb;
            })
          : crewMessages;

    return NextResponse.json({
      ok: true,
      view,
      messages: dedupeById(messages),
      telegram: {
        available: telegram.available,
        notice: telegram.notice,
        sessionKey: telegram.sessionKey,
      },
    });
  } catch (error) {
    return apiError(500, "READ_FAILED", error instanceof Error ? error.message : "read failed");
  }
}

import { NextResponse } from "next/server";

import { isValidCrewPin, readCrewPinFromRequest } from "../_auth";
import { parseCrewChatLines, readRecentCrewChatLines } from "../_log";

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

export async function GET(req: Request) {
  try {
    const pin = readCrewPinFromRequest(req);
    if (!isValidCrewPin(pin)) {
      return apiError(401, "UNAUTHORIZED", "인증이 필요해요.");
    }

    const lines = await readRecentCrewChatLines(200);
    const messages = parseCrewChatLines(lines);

    return NextResponse.json({ ok: true, messages });
  } catch (error) {
    return apiError(500, "READ_FAILED", error instanceof Error ? error.message : "read failed");
  }
}

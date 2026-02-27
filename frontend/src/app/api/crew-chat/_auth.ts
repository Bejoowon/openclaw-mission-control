export function isValidCrewPin(pin?: string | null) {
  const required = process.env.CREW_CHAT_PIN?.trim();
  if (!required) return true; // disabled when not configured
  return Boolean(pin) && pin === required;
}

export function readCrewPinFromRequest(req: Request) {
  const fromHeader = req.headers.get("x-crew-pin");
  if (fromHeader) return fromHeader;

  const cookie = req.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|; )crew_chat_pin=([^;]+)/);
  if (!m) return null;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return m[1];
  }
}

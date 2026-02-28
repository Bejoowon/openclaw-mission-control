"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";

type CrewSnapshot = {
  agents: Array<{ id: string; name: string }>;
  generatedAt?: string;
};

type ChatMsg = {
  id: string;
  ts: string;
  room: string;
  from: string;
  text: string;
  status?: string;
};

const avatarById: Record<string, string> = {
  "8lomi-ai": "😺",
  isul: "🐶",
  lini: "🦢",
  주원: "🧑",
};

function avatar(id: string) {
  return avatarById[id] || "🤖";
}

function fmt(ts?: string) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

export default function CrewChatPage() {
  const [snapshot, setSnapshot] = useState<CrewSnapshot | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [mode, setMode] = useState<"group" | "direct">("group");
  const [target, setTarget] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [showRooms, setShowRooms] = useState(false);

  const [pin, setPin] = useState("");
  const [pinDraft, setPinDraft] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const load = async (pinOverride?: string) => {
    const usePin = pinOverride ?? pin;
    const headers: HeadersInit = usePin ? { "x-crew-pin": usePin } : {};

    try {
      setLoadError(null);
      const [s, mRes] = await Promise.all([
        fetch("/api/crew-snapshot", { cache: "no-store" }).then((r) => r.json()),
        fetch("/api/crew-chat/messages", { cache: "no-store", headers }),
      ]);

      const normalized = {
        ...s,
        agents: (s?.agents ?? []).filter((a: { id: string }) => a.id !== "main"),
      };
      setSnapshot(normalized);
      if (!target && normalized?.agents?.[0]?.id) setTarget(normalized.agents[0].id);

      if (mRes.status === 401) {
        setUnlocked(false);
        setMessages([]);
        return;
      }

      const m = await mRes.json();
      const cleaned = (m.messages ?? []).filter(
        (msg: ChatMsg) => !(typeof msg.text === "string" && msg.text.startsWith("Command failed: openclaw agent")),
      );
      setMessages(cleaned);
      setUnlocked(true);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "불러오기 실패");
    }
  };

  useEffect(() => {
    void load("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!unlocked) return;
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked, pin]);

  const roomMessages = useMemo(() => {
    if (mode === "group") return messages.filter((m) => m.room === "crew");
    return messages.filter((m) => m.room === `dm:${target}`);
  }, [messages, mode, target]);

  const send = async () => {
    const trimmed = text.trim();
    if (!trimmed || !unlocked) return;
    if (mode === "direct" && !target) return;
    if (inFlight.current) return;

    inFlight.current = true;
    setBusy(true);
    const current = trimmed;
    setText("");

    try {
      const requestId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const res = await fetch("/api/crew-chat/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(pin ? { "x-crew-pin": pin } : {}),
          "x-idempotency-key": requestId,
        },
        body: JSON.stringify(
          mode === "group"
            ? { mode: "group", from: "주원", text: current, requestId }
            : { mode: "direct", from: "주원", to: target, text: current, requestId },
        ),
      });

      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.errorInfo?.message || j?.error || "전송 실패");
      }

      await load();
    } catch {
      // 실패 시 복구
      setText(current);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const unlock = async () => {
    setPinError(null);
    if (!/^\d{6}$/.test(pinDraft)) {
      setPinError("PIN 6자리를 입력해줘");
      return;
    }
    await load(pinDraft);
    setPin(pinDraft);
  };

  if (!unlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.2em] text-violet-500">CREW CHAT</p>
          <h1 className="mt-2 text-lg font-semibold text-slate-900">잠금 해제</h1>
          <p className="mt-1 text-xs text-slate-500">PIN 6자리 입력 후 입장</p>
          <div className="mt-3 flex gap-2">
            <input
              value={pinDraft}
              onChange={(e) => setPinDraft(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              pattern="[0-9]*"
              type="password"
              className="h-11 flex-1 rounded-lg border border-slate-300 px-3 text-sm"
              placeholder="숫자 6자리"
              onKeyDown={(e) => {
                if (e.key === "Enter") void unlock();
              }}
            />
            <button onClick={() => void unlock()} className="h-11 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white">
              입장
            </button>
          </div>
          {pinError ? <p className="mt-2 text-xs text-rose-600">{pinError}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <DashboardShell>
      <div className="hidden lg:block">
        <DashboardSidebar />
      </div>

      <main className="grid h-[calc(100vh-64px)] w-full grid-cols-1 bg-white lg:grid-cols-[260px_1fr_220px]">
        <section className="border-b border-slate-200 bg-white px-4 py-3 lg:col-span-3 lg:border-b">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold tracking-[0.2em] text-violet-500">BANG'S CREW</p>
              <p className="text-sm font-semibold text-slate-900">크루 채팅</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowRooms((v) => !v)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs">
                방 목록
              </button>
              <button onClick={() => void load()} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs">
                새로고침
              </button>
            </div>
          </div>
        </section>
        <aside className="hidden border-r border-slate-200 bg-slate-50 lg:block">
          <div className="p-3">
            <p className="mb-2 text-xs font-semibold text-slate-500">대화방</p>
            <button
              onClick={() => setMode("group")}
              className={`mb-2 w-full rounded-lg px-3 py-2 text-left text-sm ${mode === "group" ? "bg-violet-600 text-white" : "bg-white"}`}
            >
              👥 단체방
            </button>
            {(snapshot?.agents ?? []).map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setMode("direct");
                  setTarget(a.id);
                }}
                className={`mb-2 w-full rounded-lg px-3 py-2 text-left text-sm ${mode === "direct" && target === a.id ? "bg-violet-100 text-violet-800" : "bg-white"}`}
              >
                {avatar(a.id)} {a.name}
              </button>
            ))}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col">
          {showRooms ? (
            <div className="border-b border-slate-200 p-3 lg:hidden">
              <div className="mb-2 flex gap-2">
                <button onClick={() => setMode("group")} className={`rounded-full px-3 py-1 text-xs ${mode === "group" ? "bg-violet-600 text-white" : "bg-slate-100"}`}>단체</button>
                <button onClick={() => setMode("direct")} className={`rounded-full px-3 py-1 text-xs ${mode === "direct" ? "bg-violet-600 text-white" : "bg-slate-100"}`}>개인</button>
              </div>
              {mode === "direct" ? (
                <select value={target} onChange={(e) => setTarget(e.target.value)} className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm">
                  {(snapshot?.agents ?? []).map((a) => (
                    <option key={a.id} value={a.id}>{a.name}</option>
                  ))}
                </select>
              ) : null}
            </div>
          ) : null}

          <div className="flex-1 overflow-y-auto bg-slate-50 p-3">
            {loadError ? <div className="mb-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700">{loadError}</div> : null}
            {roomMessages.map((m) => {
              const mine = m.from === "주원";
              return (
                <div key={m.id} className={`mb-3 flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className="max-w-[82%]">
                    <div className="mb-1 text-[11px] text-slate-500">{avatar(m.from)} {m.from} · {fmt(m.ts)}</div>
                    <div className={`rounded-2xl px-3 py-2 text-sm ${mine ? "bg-amber-100" : "bg-violet-100"}`}>
                      {m.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="border-t border-slate-200 bg-white p-3">
            <div className="mb-2 flex flex-wrap gap-1">
              {(snapshot?.agents ?? []).map((a) => (
                <button key={a.id} onClick={() => setText((t) => `${t}${t ? " " : ""}@${a.name} `)} className="rounded-full border border-violet-200 bg-violet-50 px-2 py-1 text-xs text-violet-700">
                  @{a.name}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <textarea
                rows={2}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="min-h-[56px] flex-1 resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="메시지 입력"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              <button
                onClick={() => void send()}
                disabled={busy || !text.trim()}
                className="h-11 rounded-lg bg-violet-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? "전송중" : "보내기"}
              </button>
            </div>
          </div>
        </section>

        <aside className="hidden border-l border-slate-200 bg-slate-50 p-3 lg:block">
          <p className="text-xs font-semibold text-slate-500">정보</p>
          <div className="mt-2 rounded-lg bg-white p-3 text-sm">에이전트: {snapshot?.agents.length ?? 0}명</div>
          <div className="mt-2 rounded-lg bg-white p-3 text-sm">현재 메시지: {roomMessages.length}개</div>
        </aside>
      </main>
    </DashboardShell>
  );
}

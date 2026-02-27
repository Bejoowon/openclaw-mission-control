"use client";

import { useEffect, useMemo, useState } from "react";

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
  type: string;
  from: string;
  to: string;
  text: string;
  status?: string;
};

const avatarById: Record<string, string> = {
  "8lomi-ai": "😺",
  isul: "🐶",
  lini: "🦢",
  user: "🧑",
  주원: "🧑",
};

function getAvatar(idOrName: string) {
  return avatarById[idOrName] || "🤖";
}

export default function CrewChatPage() {
  const [snapshot, setSnapshot] = useState<CrewSnapshot | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [mode, setMode] = useState<"group" | "direct">("group");
  const [target, setTarget] = useState<string>("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [pin, setPin] = useState("");
  const [unlocked, setUnlocked] = useState(false);

  const load = async () => {
    const headers: HeadersInit = pin ? { "x-crew-pin": pin } : {};
    const [s, mRes] = await Promise.all([
      fetch("/api/crew-snapshot", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/crew-chat/messages", { cache: "no-store", headers }),
    ]);

    setSnapshot(s);
    if (!target && s?.agents?.[0]?.id) setTarget(s.agents[0].id);

    if (mRes.status === 401) {
      setUnlocked(false);
      setMessages([]);
      return;
    }

    const m = await mRes.json();
    setMessages(m.messages ?? []);
    setUnlocked(true);
  };

  useEffect(() => {
    const saved = window.localStorage.getItem("crew_chat_pin") || "";
    if (saved) setPin(saved);
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  const rooms = useMemo(() => {
    const groupCount = messages.filter((m) => m.room === "crew").length;
    const directRooms = (snapshot?.agents ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      roomKey: `dm:${a.id}`,
      count: messages.filter((m) => m.room === `dm:${a.id}` || m.from === a.id).length,
    }));

    return {
      group: { key: "crew", name: "단체방", count: groupCount },
      directs: directRooms,
    };
  }, [messages, snapshot]);

  const filtered = useMemo(() => {
    if (!unlocked) return [];
    if (mode === "group") return messages.filter((m) => m.room === "crew");
    return messages.filter(
      (m) => m.room === `dm:${target}` || (m.from === target && m.to === "user"),
    );
  }, [messages, mode, target, unlocked]);

  const currentRoomTitle =
    mode === "group"
      ? "# 우리 단체방"
      : `${getAvatar(target)} ${snapshot?.agents.find((a) => a.id === target)?.name || target}`;

  const send = async () => {
    if (!text.trim() || !unlocked) return;
    setBusy(true);

    await fetch("/api/crew-chat/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(pin ? { "x-crew-pin": pin } : {}),
      },
      body: JSON.stringify(
        mode === "group"
          ? { mode: "group", from: "주원", text }
          : { mode: "direct", from: "주원", to: target, text },
      ),
    });

    setText("");
    setBusy(false);
    await load();
  };

  return (
    <DashboardShell>
      <DashboardSidebar />
      <main className="flex-1 overflow-hidden bg-[#f6f7fb] p-4">
        <div className="mb-3 rounded-2xl border border-slate-200 bg-white/90 px-5 py-4 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">에이전트 대화</h2>
          <p className="mt-1 text-sm text-slate-500">
            개인채팅 + 단체방을 한 화면에서 관리해요
          </p>
        </div>

        <div className="grid h-[calc(100vh-170px)] grid-cols-[280px_1fr_260px] gap-3">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">대화방</p>
            </div>
            <div className="space-y-2 p-3">
              <button
                onClick={() => setMode("group")}
                className={`w-full rounded-xl px-3 py-3 text-left transition ${
                  mode === "group"
                    ? "bg-violet-50 ring-1 ring-violet-200"
                    : "bg-slate-50 hover:bg-slate-100"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                    <span>👥</span> 단체방
                  </div>
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                    {rooms.group.count}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">모든 친구와 함께</p>
              </button>

              {(rooms.directs ?? []).map((a) => (
                <button
                  key={a.id}
                  onClick={() => {
                    setMode("direct");
                    setTarget(a.id);
                  }}
                  className={`w-full rounded-xl px-3 py-3 text-left transition ${
                    mode === "direct" && target === a.id
                      ? "bg-blue-50 ring-1 ring-blue-200"
                      : "bg-slate-50 hover:bg-slate-100"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <span>{getAvatar(a.id)}</span> {a.name}
                    </div>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs text-slate-600">
                      {a.count}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">개인 대화</p>
                </button>
              ))}
            </div>
          </section>

          <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-slate-900">{currentRoomTitle}</p>
                <p className="text-xs text-slate-500">실시간 동기화</p>
              </div>
              <button
                onClick={() => void load()}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
              >
                새로고침
              </button>
            </div>

            {!unlocked ? (
              <div className="m-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-medium text-amber-800">🔒 6자리 PIN을 입력하면 대화를 볼 수 있어요</p>
                <div className="mt-3 flex gap-2">
                  <input
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6자리 PIN"
                    className="w-40 rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
                  />
                  <button
                    onClick={() => {
                      window.localStorage.setItem("crew_chat_pin", pin);
                      document.cookie = `crew_chat_pin=${encodeURIComponent(pin)}; path=/`;
                      void load();
                    }}
                    className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white"
                  >
                    잠금 해제
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 space-y-3 overflow-y-auto bg-[#fcfcff] p-4">
                  {filtered.map((m) => {
                    const mine = m.from === "주원";
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[78%] ${mine ? "order-2" : "order-1"}`}>
                          <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-500">
                            <span>{getAvatar(m.from)}</span>
                            <span>{m.from}</span>
                            <span>·</span>
                            <span>{new Date(m.ts).toLocaleTimeString()}</span>
                          </div>
                          <div
                            className={`whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                              mine
                                ? "bg-amber-100 text-slate-900"
                                : "bg-violet-100 text-slate-900"
                            }`}
                          >
                            {m.text}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {filtered.length === 0 ? (
                    <div className="pt-8 text-center text-sm text-slate-400">아직 대화가 없어요. 첫 메시지를 보내봐요 ✨</div>
                  ) : null}
                </div>

                <div className="border-t border-slate-100 bg-white p-3">
                  <div className="flex items-center gap-2">
                    <input
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={
                        mode === "group"
                          ? "단체방에 메시지 보내기"
                          : `${snapshot?.agents.find((a) => a.id === target)?.name || target}에게 메시지 보내기`
                      }
                      className="h-11 flex-1 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-violet-400"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          void send();
                        }
                      }}
                    />
                    <button
                      onClick={() => void send()}
                      disabled={busy}
                      className="h-11 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:opacity-50"
                    >
                      {busy ? "보내는 중" : "보내기"}
                    </button>
                  </div>
                </div>
              </>
            )}
          </section>

          <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">요약 정보</p>
            </div>
            <div className="space-y-4 p-4 text-sm text-slate-700">
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">참여 에이전트</p>
                <p className="mt-1 text-lg font-semibold">{snapshot?.agents.length ?? 0}명</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">현재 방 메시지</p>
                <p className="mt-1 text-lg font-semibold">{filtered.length}개</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs text-slate-500">마지막 동기화</p>
                <p className="mt-1 text-sm font-medium">
                  {snapshot?.generatedAt
                    ? new Date(snapshot.generatedAt).toLocaleTimeString()
                    : "-"}
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </DashboardShell>
  );
}

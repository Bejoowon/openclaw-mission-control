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

const statusLabel: Record<string, string> = {
  ok: "정상",
  sent: "전송됨",
  error: "오류",
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
  const [pinDraft, setPinDraft] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinNotice, setPinNotice] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  const load = async (pinOverride?: string) => {
    const appliedPin = pinOverride ?? pin;
    const headers: HeadersInit = appliedPin ? { "x-crew-pin": appliedPin } : {};

    const [s, mRes] = await Promise.all([
      fetch("/api/crew-snapshot", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/crew-chat/messages", { cache: "no-store", headers }),
    ]);

    setSnapshot(s);
    if (!target && s?.agents?.[0]?.id) setTarget(s.agents[0].id);

    if (mRes.status === 401) {
      setUnlocked(false);
      setMessages([]);
      return { unauthorized: true as const };
    }

    const m = await mRes.json();
    setMessages(m.messages ?? []);
    setUnlocked(true);
    return { unauthorized: false as const };
  };

  useEffect(() => {
    const saved = window.localStorage.getItem("crew_chat_pin") || "";
    if (saved) {
      setPin(saved);
      setPinDraft(saved);
    }
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
      count: messages.filter((m) => m.room === `dm:${a.id}`).length,
    }));

    return {
      group: { key: "crew", name: "단체방", count: groupCount },
      directs: directRooms,
    };
  }, [messages, snapshot]);

  const filtered = useMemo(() => {
    if (!unlocked) return [];
    if (mode === "group") return messages.filter((m) => m.room === "crew");
    return messages.filter((m) => m.room === `dm:${target}`);
  }, [messages, mode, target, unlocked]);

  const currentRoomTitle =
    mode === "group"
      ? "# 우리 단체방"
      : `${getAvatar(target)} ${snapshot?.agents.find((a) => a.id === target)?.name || target}`;

  const mentionCandidates = useMemo(
    () => (snapshot?.agents ?? []).map((agent) => `@${agent.name}`),
    [snapshot],
  );

  const addMention = (mention: string) => {
    setText((prev) => {
      const base = prev.trimEnd();
      if (!base) return `${mention} `;
      if (base.includes(mention)) return `${base} `;
      return `${base} ${mention} `;
    });
  };

  const unlockWithPin = async () => {
    setPinError(null);
    setPinNotice(null);

    if (!pinDraft || pinDraft.length !== 6) {
      setPinError("PIN은 숫자 6자리로 입력해줘.");
      return;
    }

    const result = await load(pinDraft);
    if (result.unauthorized) {
      setPinError("PIN이 맞지 않아. 다시 확인해줘.");
      return;
    }

    setPin(pinDraft);
    window.localStorage.setItem("crew_chat_pin", pinDraft);
    document.cookie = `crew_chat_pin=${encodeURIComponent(pinDraft)}; path=/`;
    setPinNotice("잠금 해제 완료! 이 브라우저에 PIN을 저장했어.");
  };

  const clearSavedPin = async () => {
    setPin("");
    setPinDraft("");
    setUnlocked(false);
    setPinError(null);
    setPinNotice("저장된 PIN을 지웠어. 다시 잠금 상태야.");
    window.localStorage.removeItem("crew_chat_pin");
    document.cookie = "crew_chat_pin=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    await load("");
  };

  const send = async () => {
    if (!text.trim() || !unlocked || (mode === "direct" && !target)) return;
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

  if (!unlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f6f7fb] px-4">
        <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-slate-900">크루 채팅 잠금</h1>
          <p className="mt-1 text-sm text-slate-500">PIN 6자리를 입력하면 바로 대화 화면으로 들어가요.</p>

          <div className="mt-4 flex gap-2">
            <input
              value={pinDraft}
              onChange={(e) => {
                setPinDraft(e.target.value.replace(/\D/g, "").slice(0, 6));
                setPinError(null);
              }}
              placeholder="숫자 6자리 PIN"
              className="h-11 flex-1 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-violet-400"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void unlockWithPin();
                }
              }}
              autoFocus
            />
            <button
              onClick={() => void unlockWithPin()}
              className="h-11 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white hover:bg-violet-700"
            >
              입장
            </button>
          </div>

          {pinError ? <p className="mt-2 text-xs text-rose-600">{pinError}</p> : null}
          {pinNotice ? <p className="mt-2 text-xs text-emerald-700">{pinNotice}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <DashboardShell>
      <DashboardSidebar />
      <main className="flex-1 overflow-hidden bg-[#f6f7fb] p-4">
        <div className="grid h-[calc(100vh-80px)] grid-cols-[280px_1fr_260px] gap-3">
          <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="text-sm font-semibold text-slate-800">대화방 목록</p>
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
                <p className="mt-1 text-xs text-slate-500">모든 에이전트와 함께</p>
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
                <p className="text-xs text-slate-500">실시간으로 자동 동기화돼요</p>
              </div>
              <button
                onClick={() => void load()}
                className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100"
              >
                새로고침
              </button>
            </div>

            <>
              <div className="flex-1 space-y-3 overflow-y-auto bg-[#fcfcff] p-4">
                {filtered.map((m) => {
                  const mine = m.from === "주원";
                  const badge = statusLabel[m.status ?? ""];
                  return (
                    <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                      {!mine ? (
                        <div className="mb-1 h-8 w-8 shrink-0 rounded-full bg-violet-100 text-center text-lg leading-8">
                          {getAvatar(m.from)}
                        </div>
                      ) : null}
                      <div className={`max-w-[78%] ${mine ? "order-2" : "order-1"}`}>
                        <div className="mb-1 flex items-center gap-2 text-[11px] text-slate-500">
                          <span className="font-medium text-slate-600">{m.from}</span>
                          {badge ? (
                            <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-600">
                              {badge}
                            </span>
                          ) : null}
                          <span>·</span>
                          <span>{new Date(m.ts).toLocaleTimeString()}</span>
                        </div>
                        <div
                          className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                            mine ? "bg-amber-100 text-slate-900" : "bg-violet-100 text-slate-900"
                          }`}
                        >
                          {m.text}
                        </div>
                      </div>
                      {mine ? (
                        <div className="mb-1 h-8 w-8 shrink-0 rounded-full bg-amber-100 text-center text-lg leading-8">
                          {getAvatar(m.from)}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {filtered.length === 0 ? (
                  <div className="pt-8 text-center text-sm text-slate-400">아직 대화가 없어요. 첫 메시지를 남겨봐요 ✨</div>
                ) : null}
              </div>

              <div className="border-t border-slate-100 bg-white p-3">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-slate-500">멘션 빠르게 추가:</span>
                  {mentionCandidates.map((mention) => (
                    <button
                      key={mention}
                      onClick={() => addMention(mention)}
                      className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100"
                    >
                      {mention}
                    </button>
                  ))}
                </div>
                <div className="flex items-end gap-2">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={
                      mode === "group"
                        ? "단체방에 메시지를 남겨주세요"
                        : `${snapshot?.agents.find((a) => a.id === target)?.name || target}에게 보낼 메시지를 입력하세요`
                    }
                    rows={2}
                    className="min-h-[52px] flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-violet-400"
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
                    className="h-11 rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? "보내는 중" : "보내기"}
                  </button>
                </div>
              </div>
            </>
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
                  {snapshot?.generatedAt ? new Date(snapshot.generatedAt).toLocaleTimeString() : "-"}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-xs text-slate-500">보안</p>
                <button
                  onClick={() => void clearSavedPin()}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  저장된 PIN 해제하기
                </button>
              </div>
              {pinNotice ? <p className="text-xs text-emerald-700">{pinNotice}</p> : null}
            </div>
          </aside>
        </div>
      </main>
    </DashboardShell>
  );
}

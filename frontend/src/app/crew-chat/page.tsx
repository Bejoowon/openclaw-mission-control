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
  startedAt?: string;
};

type RoomFilter = "all" | "group" | "direct";

type RoomItem = {
  key: string;
  name: string;
  subtitle: string;
  isGroup: boolean;
  count: number;
  lastMessage?: ChatMsg;
  targetId?: string;
};

const avatarById: Record<string, string> = {
  "8lomi-ai": "😺",
  isul: "🐶",
  lini: "🦢",
  user: "🧑",
  주원: "🧑",
};

const statusLabel: Record<string, string> = {
  ok: "응답 완료",
  sent: "전송됨",
  error: "오류",
};

const statusTone: Record<string, string> = {
  ok: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-200",
  sent: "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200",
  error: "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-200",
};

function getAvatar(idOrName: string) {
  return avatarById[idOrName] || "🤖";
}

function formatTime(ts?: string) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
}

function formatDateTime(ts?: string) {
  if (!ts) return "-";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function elapsedLabel(startedAt?: string, endedAt?: string) {
  if (!startedAt || !endedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) return null;
  const ms = end - start;
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}초`;
}

export default function CrewChatPage() {
  const [snapshot, setSnapshot] = useState<CrewSnapshot | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [mode, setMode] = useState<"group" | "direct">("group");
  const [target, setTarget] = useState<string>("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const [roomFilter, setRoomFilter] = useState<RoomFilter>("all");
  const [roomKeyword, setRoomKeyword] = useState("");
  const [showRoomListMobile, setShowRoomListMobile] = useState(false);

  const [pin, setPin] = useState("");
  const [pinDraft, setPinDraft] = useState("");
  const [rememberPin, setRememberPin] = useState(true);
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinNotice, setPinNotice] = useState<string | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [pinFails, setPinFails] = useState(0);
  const [pinLockedUntil, setPinLockedUntil] = useState<number | null>(null);

  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = async (pinOverride?: string) => {
    const appliedPin = pinOverride ?? pin;
    const headers: HeadersInit = appliedPin ? { "x-crew-pin": appliedPin } : {};

    try {
      setLoadError(null);
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

      if (!mRes.ok) {
        const payload = (await mRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "대화 기록을 불러오지 못했어요.");
      }

      const m = (await mRes.json()) as { messages?: ChatMsg[] };
      setMessages(m.messages ?? []);
      setUnlocked(true);
      return { unauthorized: false as const };
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "대화 기록을 불러오지 못했어요.");
      return { unauthorized: false as const };
    }
  };

  useEffect(() => {
    const saved = window.localStorage.getItem("crew_chat_pin") || "";
    if (saved) {
      setPin(saved);
      setPinDraft(saved);
      setRememberPin(true);
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  useEffect(() => {
    if (!pinLockedUntil) return;
    const timer = setInterval(() => {
      if (Date.now() >= pinLockedUntil) {
        setPinLockedUntil(null);
        setPinFails(0);
      }
    }, 500);
    return () => clearInterval(timer);
  }, [pinLockedUntil]);

  const roomItems = useMemo(() => {
    const groupMessages = messages.filter((m) => m.room === "crew");
    const groupItem: RoomItem = {
      key: "crew",
      name: "우리 크루 라운지",
      subtitle: "모든 에이전트와 함께",
      isGroup: true,
      count: groupMessages.length,
      lastMessage: groupMessages[groupMessages.length - 1],
    };

    const directRooms: RoomItem[] = (snapshot?.agents ?? []).map((a) => {
      const roomKey = `dm:${a.id}`;
      const roomMessages = messages.filter((m) => m.room === roomKey);
      return {
        key: roomKey,
        name: a.name,
        subtitle: "개인 대화",
        isGroup: false,
        count: roomMessages.length,
        lastMessage: roomMessages[roomMessages.length - 1],
        targetId: a.id,
      };
    });

    return [groupItem, ...directRooms];
  }, [messages, snapshot]);

  const filteredRoomItems = useMemo(() => {
    const keyword = roomKeyword.trim().toLowerCase();
    return roomItems.filter((room) => {
      const byType =
        roomFilter === "all" ||
        (roomFilter === "group" && room.isGroup) ||
        (roomFilter === "direct" && !room.isGroup);
      if (!byType) return false;
      if (!keyword) return true;
      const haystack = `${room.name} ${room.subtitle} ${room.lastMessage?.text ?? ""}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [roomItems, roomFilter, roomKeyword]);

  const filtered = useMemo(() => {
    if (!unlocked) return [];
    if (mode === "group") return messages.filter((m) => m.room === "crew");
    return messages.filter((m) => m.room === `dm:${target}`);
  }, [messages, mode, target, unlocked]);

  const currentRoomTitle =
    mode === "group"
      ? "# 우리 크루 라운지"
      : `${getAvatar(target)} ${snapshot?.agents.find((a) => a.id === target)?.name || target}`;

  const mentionCandidates = useMemo(
    () => (snapshot?.agents ?? []).map((agent) => ({ id: agent.id, label: `@${agent.name}` })),
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

    if (pinLockedUntil && Date.now() < pinLockedUntil) {
      setPinError("잠시만요. PIN 입력을 너무 많이 시도했어요.");
      return;
    }

    if (!/^\d{6}$/.test(pinDraft)) {
      setPinError("PIN은 숫자 6자리로 입력해줘.");
      return;
    }

    const result = await load(pinDraft);
    if (result.unauthorized) {
      const nextFails = pinFails + 1;
      setPinFails(nextFails);
      if (nextFails >= 5) {
        setPinLockedUntil(Date.now() + 30_000);
        setPinError("5회 이상 틀렸어요. 30초 뒤 다시 시도해줘.");
      } else {
        setPinError(`PIN이 맞지 않아. 다시 확인해줘. (${nextFails}/5)`);
      }
      return;
    }

    setPin(pinDraft);
    setPinFails(0);
    setPinLockedUntil(null);

    if (rememberPin) {
      window.localStorage.setItem("crew_chat_pin", pinDraft);
      document.cookie = `crew_chat_pin=${encodeURIComponent(pinDraft)}; path=/`;
      setPinNotice("잠금 해제 완료! 이 브라우저에 PIN을 안전하게 저장했어.");
    } else {
      window.localStorage.removeItem("crew_chat_pin");
      document.cookie = "crew_chat_pin=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      setPinNotice("잠금 해제 완료! 이 브라우저에는 PIN을 저장하지 않았어.");
    }
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
    setSendError(null);

    try {
      const res = await fetch("/api/crew-chat/send", {
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

      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "메시지를 전송하지 못했어요.");
      }

      setText("");
      await load();
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "메시지를 전송하지 못했어요.");
    } finally {
      setBusy(false);
    }
  };

  const lockRemainSeconds = pinLockedUntil ? Math.max(0, Math.ceil((pinLockedUntil - Date.now()) / 1000)) : 0;

  if (!unlocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4 dark:bg-slate-950">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white/95 p-7 shadow-xl dark:border-slate-800 dark:bg-slate-900/95">
          <p className="text-xs font-semibold tracking-[0.22em] text-violet-500">CREW CHAT SECURE</p>
          <h1 className="mt-2 text-xl font-semibold text-slate-900 dark:text-slate-100">크루 채팅 잠금 해제</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            PIN 6자리를 입력하면, 너와 나의 대화창구로 바로 들어갈 수 있어요.
          </p>

          <div className="mt-5 flex gap-2">
            <input
              value={pinDraft}
              onChange={(e) => {
                setPinDraft(e.target.value.replace(/\D/g, "").slice(0, 6));
                setPinError(null);
              }}
              placeholder="숫자 6자리 PIN"
              className="h-12 flex-1 rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void unlockWithPin();
                }
              }}
              type="password"
              autoFocus
            />
            <button
              onClick={() => void unlockWithPin()}
              disabled={lockRemainSeconds > 0}
              className="h-12 rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              입장
            </button>
          </div>

          <label className="mt-3 flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
            <input
              type="checkbox"
              checked={rememberPin}
              onChange={(e) => setRememberPin(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            />
            이 브라우저에 PIN 저장하기
          </label>

          {lockRemainSeconds > 0 ? (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-300">보안을 위해 {lockRemainSeconds}초 후 다시 시도할 수 있어요.</p>
          ) : null}
          {pinError ? <p className="mt-2 text-xs text-rose-600">{pinError}</p> : null}
          {pinNotice ? <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">{pinNotice}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <DashboardShell>
      <DashboardSidebar />
      <main className="flex-1 overflow-hidden bg-slate-100 p-3 dark:bg-slate-950 lg:p-4">
        <div className="grid h-[calc(100vh-72px)] grid-cols-1 gap-3 lg:grid-cols-[290px_1fr_280px]">
          <section
            className={`overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${
              showRoomListMobile ? "block" : "hidden lg:block"
            }`}
          >
            <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">대화방</p>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">필터와 검색으로 빠르게 찾아보세요</p>
            </div>

            <div className="space-y-3 p-3">
              <input
                value={roomKeyword}
                onChange={(e) => setRoomKeyword(e.target.value)}
                placeholder="방 이름/메시지 검색"
                className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
              />

              <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 text-xs dark:bg-slate-800">
                {([
                  ["all", "전체"],
                  ["group", "단체"],
                  ["direct", "개인"],
                ] as const).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setRoomFilter(key)}
                    className={`rounded-lg px-2 py-1.5 font-medium transition ${
                      roomFilter === key
                        ? "bg-white text-violet-700 shadow-sm dark:bg-slate-900 dark:text-violet-300"
                        : "text-slate-500 hover:text-slate-700 dark:text-slate-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                {filteredRoomItems.map((room) => {
                  const active = room.isGroup ? mode === "group" : mode === "direct" && target === room.targetId;
                  return (
                    <button
                      key={room.key}
                      onClick={() => {
                        if (room.isGroup) {
                          setMode("group");
                        } else if (room.targetId) {
                          setMode("direct");
                          setTarget(room.targetId);
                        }
                        setShowRoomListMobile(false);
                      }}
                      className={`w-full rounded-xl border px-3 py-2.5 text-left transition ${
                        active
                          ? "border-violet-200 bg-violet-50 dark:border-violet-700 dark:bg-violet-900/30"
                          : "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                            {room.isGroup ? "👥" : getAvatar(room.targetId || "")} {room.name}
                          </p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {room.lastMessage?.text || room.subtitle}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] text-slate-400 dark:text-slate-500">{formatTime(room.lastMessage?.ts)}</p>
                          <p className="mt-1 inline-flex rounded-full bg-slate-200 px-2 py-0.5 text-[10px] text-slate-600 dark:bg-slate-700 dark:text-slate-200">
                            {room.count}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {filteredRoomItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500 dark:border-slate-700 dark:text-slate-400">
                    조건에 맞는 대화방이 없어요.
                  </div>
                ) : null}
              </div>
            </div>
          </section>

          <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{currentRoomTitle}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">실시간 동기화 · 응답 로그 자동 반영</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowRoomListMobile((v) => !v)}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 lg:hidden"
                >
                  방 목록
                </button>
                <button
                  onClick={() => void load()}
                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                >
                  새로고침
                </button>
              </div>
            </div>

            <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50/70 p-4 dark:bg-slate-950/30">
              {loadError ? (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                  기록 동기화 중 문제가 생겼어요: {loadError}
                </div>
              ) : null}

              {filtered.map((m) => {
                const mine = m.from === "주원";
                const badge = statusLabel[m.status ?? ""];
                const elapsed = elapsedLabel(m.startedAt, m.ts);

                return (
                  <div key={m.id} className={`flex items-end gap-2 ${mine ? "justify-end" : "justify-start"}`}>
                    {!mine ? (
                      <div className="mb-1 h-8 w-8 shrink-0 rounded-full bg-violet-100 text-center text-lg leading-8 dark:bg-violet-900/40">
                        {getAvatar(m.from)}
                      </div>
                    ) : null}

                    <div className={`max-w-[82%] ${mine ? "order-2" : "order-1"}`}>
                      <div className="mb-1 flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
                        <span className="font-medium text-slate-600 dark:text-slate-200">{m.from}</span>
                        {badge ? (
                          <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${statusTone[m.status ?? ""] || "bg-slate-200 text-slate-600"}`}>
                            {badge}
                          </span>
                        ) : null}
                        <span>·</span>
                        <span>{formatDateTime(m.ts)}</span>
                        {elapsed ? <span className="text-[10px] text-slate-400">({elapsed})</span> : null}
                      </div>

                      <div
                        className={`whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          mine
                            ? "bg-amber-100 text-slate-900 dark:bg-amber-900/40 dark:text-amber-50"
                            : "bg-violet-100 text-slate-900 dark:bg-violet-900/45 dark:text-violet-50"
                        }`}
                      >
                        {m.text}
                      </div>
                    </div>

                    {mine ? (
                      <div className="mb-1 h-8 w-8 shrink-0 rounded-full bg-amber-100 text-center text-lg leading-8 dark:bg-amber-900/40">
                        {getAvatar(m.from)}
                      </div>
                    ) : null}
                  </div>
                );
              })}

              {!loadError && filtered.length === 0 ? (
                <div className="pt-10 text-center">
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-300">아직 대화가 없어요.</p>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">첫 메시지를 보내면 여기서 실시간으로 이어져요 ✨</p>
                </div>
              ) : null}
            </div>

            <div className="border-t border-slate-100 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">멘션 빠른 삽입</span>
                {mentionCandidates.map((mention) => (
                  <button
                    key={mention.id}
                    onClick={() => addMention(mention.label)}
                    className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-1 text-xs font-medium text-violet-700 hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-900/30 dark:text-violet-200"
                  >
                    {mention.label}
                  </button>
                ))}
              </div>

              {sendError ? (
                <div className="mb-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-2 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                  전송 실패: {sendError}
                </div>
              ) : null}

              <div className="flex items-end gap-2">
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={
                    mode === "group"
                      ? "우리 크루에게 전할 메시지를 입력해줘"
                      : `${snapshot?.agents.find((a) => a.id === target)?.name || target}에게 보낼 메시지를 입력해줘`
                  }
                  rows={2}
                  className="min-h-[56px] flex-1 resize-none rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-violet-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
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
                  {busy ? "전송 중" : "보내기"}
                </button>
              </div>
            </div>
          </section>

          <aside className="hidden overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 lg:block">
            <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">대화 인사이트</p>
            </div>
            <div className="space-y-4 p-4 text-sm text-slate-700 dark:text-slate-200">
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">참여 에이전트</p>
                <p className="mt-1 text-lg font-semibold">{snapshot?.agents.length ?? 0}명</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">현재 방 메시지</p>
                <p className="mt-1 text-lg font-semibold">{filtered.length}개</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800">
                <p className="text-xs text-slate-500 dark:text-slate-400">마지막 동기화</p>
                <p className="mt-1 text-sm font-medium">{snapshot?.generatedAt ? formatDateTime(snapshot.generatedAt) : "-"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                <p className="text-xs text-slate-500 dark:text-slate-400">보안</p>
                <button
                  onClick={() => void clearSavedPin()}
                  className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-800"
                >
                  저장된 PIN 해제하기
                </button>
              </div>
              {pinNotice ? <p className="text-xs text-emerald-700 dark:text-emerald-300">{pinNotice}</p> : null}
            </div>
          </aside>
        </div>
      </main>
    </DashboardShell>
  );
}

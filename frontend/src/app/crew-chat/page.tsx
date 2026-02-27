"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { cn } from "@/lib/utils";

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
type ChatMode = "group" | "direct";

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

function getStatusVariant(status?: string): "success" | "accent" | "danger" | "default" {
  if (status === "ok") return "success";
  if (status === "sent") return "accent";
  if (status === "error") return "danger";
  return "default";
}

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
  const [mode, setMode] = useState<ChatMode>("group");
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

  const load = useCallback(async (pinOverride?: string) => {
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
        return { kind: "unauthorized" as const };
      }

      if (!mRes.ok) {
        const payload = (await mRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || "대화 기록을 불러오지 못했어요.");
      }

      const m = (await mRes.json()) as { messages?: ChatMsg[] };
      setMessages(m.messages ?? []);
      setUnlocked(true);
      return { kind: "ok" as const };
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "대화 기록을 불러오지 못했어요.");
      return { kind: "error" as const };
    }
  }, [pin, target]);

  useEffect(() => {
    let saved = "";
    try {
      saved = window.localStorage.getItem("crew_chat_pin") || "";
    } catch {
      saved = "";
    }
    if (saved) {
      setPin(saved);
      setPinDraft(saved);
      setRememberPin(true);
      void load(saved);
      return;
    }
    void load("");
  }, [load]);

  useEffect(() => {
    if (!unlocked) return;
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [load, unlocked]);

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
    if (result.kind === "unauthorized") {
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

    if (result.kind === "error") {
      setPinError("잠금 해제 중 문제가 생겼어요. 잠시 후 다시 시도해줘.");
      return;
    }

    setPin(pinDraft);
    setPinFails(0);
    setPinLockedUntil(null);

    if (rememberPin) {
      try {
        window.localStorage.setItem("crew_chat_pin", pinDraft);
      } catch {}
      document.cookie = `crew_chat_pin=${encodeURIComponent(pinDraft)}; path=/`;
      setPinNotice("잠금 해제 완료! 이 브라우저에 PIN을 안전하게 저장했어.");
    } else {
      try {
        window.localStorage.removeItem("crew_chat_pin");
      } catch {}
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
    try {
      window.localStorage.removeItem("crew_chat_pin");
    } catch {}
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
      <div className="flex min-h-screen items-center justify-center px-4 py-8">
        <Card className="w-full max-w-md border border-[color:var(--border)]">
          <CardHeader>
            <Badge variant="accent" className="w-fit">CREW CHAT SECURE</Badge>
            <h1 className="mt-3 text-xl font-semibold text-strong">크루 채팅 잠금 해제</h1>
            <p className="mt-1 text-sm text-muted">PIN 6자리를 입력하면 대화로 바로 들어갈 수 있어요.</p>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Input
                  value={pinDraft}
                  onChange={(e) => {
                    setPinDraft(e.target.value.replace(/\D/g, "").slice(0, 6));
                    setPinError(null);
                  }}
                  placeholder="숫자 6자리 PIN"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void unlockWithPin();
                    }
                  }}
                  type="password"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete="one-time-code"
                  autoFocus
                />
                <Button onClick={() => void unlockWithPin()} disabled={lockRemainSeconds > 0} className="shrink-0">
                  입장
                </Button>
              </div>

              <label className="flex items-center gap-2 text-xs text-muted">
                <input
                  type="checkbox"
                  checked={rememberPin}
                  onChange={(e) => setRememberPin(e.target.checked)}
                  className="h-4 w-4 rounded border-[color:var(--border)] text-[color:var(--accent)]"
                />
                이 브라우저에 PIN 저장하기
              </label>

              {lockRemainSeconds > 0 ? (
                <p className="text-xs text-[color:var(--warning)]">보안을 위해 {lockRemainSeconds}초 후 다시 시도할 수 있어요.</p>
              ) : null}
              {pinError ? <p className="text-xs text-[color:var(--danger)]">{pinError}</p> : null}
              {pinNotice ? <p className="text-xs text-[color:var(--success)]">{pinNotice}</p> : null}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <DashboardShell>
      <div className="hidden lg:block">
        <DashboardSidebar />
      </div>

      <main className="flex min-h-0 flex-1 p-3 md:p-4">
        <div className="grid h-[calc(100vh-88px)] w-full grid-cols-1 gap-3 lg:grid-cols-[300px_1fr_260px]">
          <Card
            className={cn(
              "min-h-0 overflow-hidden border border-[color:var(--border)]",
              showRoomListMobile ? "block" : "hidden lg:block",
            )}
          >
            <CardHeader>
              <p className="text-sm font-semibold text-strong">대화방</p>
              <p className="text-xs text-muted">필터/검색으로 빠르게 찾기</p>
            </CardHeader>
            <CardContent className="flex h-[calc(100%-88px)] flex-col gap-3 overflow-hidden">
              <Input
                value={roomKeyword}
                onChange={(e) => setRoomKeyword(e.target.value)}
                placeholder="방 이름/메시지 검색"
                className="h-10"
              />

              <div className="grid grid-cols-3 gap-1 rounded-xl bg-[color:var(--surface-muted)] p-1 text-xs">
                {([
                  ["all", "전체"],
                  ["group", "단체"],
                  ["direct", "개인"],
                ] as const).map(([key, label]) => (
                  <Button
                    key={key}
                    variant={roomFilter === key ? "primary" : "ghost"}
                    size="sm"
                    className="h-8 px-2"
                    onClick={() => setRoomFilter(key)}
                  >
                    {label}
                  </Button>
                ))}
              </div>

              <div className="min-h-0 space-y-2 overflow-y-auto pr-1">
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
                      className={cn(
                        "w-full rounded-xl border px-3 py-2 text-left transition",
                        active
                          ? "border-[color:var(--accent)] bg-[color:var(--accent-soft)]"
                          : "border-[color:var(--border)] bg-[color:var(--surface)] hover:border-[color:var(--accent)]",
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-strong">
                            {room.isGroup ? "👥" : getAvatar(room.targetId || "")} {room.name}
                          </p>
                          <p className="truncate text-xs text-muted">{room.lastMessage?.text || room.subtitle}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-[11px] text-muted">{formatTime(room.lastMessage?.ts)}</p>
                          <Badge className="mt-1 px-2 py-0.5 text-[10px] normal-case tracking-normal">{room.count}</Badge>
                        </div>
                      </div>
                    </button>
                  );
                })}
                {filteredRoomItems.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[color:var(--border)] p-4 text-center text-xs text-muted">
                    조건에 맞는 대화방이 없어요.
                  </div>
                ) : null}
              </div>
            </CardContent>
          </Card>

          <Card className="min-h-0 overflow-hidden border border-[color:var(--border)]">
            <CardHeader className="border-b border-[color:var(--border)] pb-4">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-strong">{currentRoomTitle}</p>
                  <p className="text-xs text-muted">실시간 동기화 · 응답 로그 자동 반영</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    className="lg:hidden"
                    onClick={() => setShowRoomListMobile((v) => !v)}
                  >
                    방 목록
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void load()}>
                    새로고침
                  </Button>
                  <Button variant="outline" size="sm" className="lg:hidden" onClick={() => void clearSavedPin()}>
                    PIN 잠금
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className="flex h-[calc(100%-92px)] min-h-0 flex-col p-0">
              <div className="flex-1 space-y-3 overflow-y-auto bg-[color:var(--surface-muted)]/40 px-3 py-4 md:px-4">
                {loadError ? (
                  <div className="rounded-xl border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 p-3 text-sm text-[color:var(--danger)]">
                    기록 동기화 중 문제가 생겼어요: {loadError}
                  </div>
                ) : null}

                {filtered.map((m) => {
                  const mine = m.from === "주원";
                  const badge = statusLabel[m.status ?? ""];
                  const elapsed = elapsedLabel(m.startedAt, m.ts);

                  return (
                    <div key={m.id} className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
                      {!mine ? (
                        <div className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--accent-soft)] text-lg">
                          {getAvatar(m.from)}
                        </div>
                      ) : null}

                      <div className={cn("max-w-[88%] md:max-w-[82%]", mine ? "order-2" : "order-1")}>
                        <div className="mb-1 flex items-center gap-1.5 text-[11px] text-muted">
                          <span className="font-medium text-strong">{m.from}</span>
                          {badge ? (
                            <Badge
                              variant={getStatusVariant(m.status)}
                              className="px-1.5 py-0.5 text-[10px] normal-case tracking-normal"
                            >
                              {badge}
                            </Badge>
                          ) : null}
                          <span>·</span>
                          <span>{formatDateTime(m.ts)}</span>
                          {elapsed ? <span className="text-[10px] text-muted">({elapsed})</span> : null}
                        </div>

                        <div
                          className={cn(
                            "whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                            mine
                              ? "bg-[color:rgba(251,191,36,0.25)] text-strong"
                              : "bg-[color:var(--accent-soft)] text-strong",
                          )}
                        >
                          {m.text}
                        </div>
                      </div>

                      {mine ? (
                        <div className="mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:rgba(251,191,36,0.25)] text-lg">
                          {getAvatar(m.from)}
                        </div>
                      ) : null}
                    </div>
                  );
                })}

                {!loadError && filtered.length === 0 ? (
                  <div className="pt-10 text-center">
                    <p className="text-sm font-medium text-muted">아직 대화가 없어요.</p>
                    <p className="mt-1 text-xs text-muted">첫 메시지를 보내면 여기서 실시간으로 이어져요 ✨</p>
                  </div>
                ) : null}
              </div>

              <div className="border-t border-[color:var(--border)] p-3 md:p-4">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted">멘션 빠른 삽입</span>
                  {mentionCandidates.map((mention) => (
                    <Button
                      key={mention.id}
                      variant="secondary"
                      size="sm"
                      className="h-7 rounded-full px-3 text-xs"
                      onClick={() => addMention(mention.label)}
                    >
                      {mention.label}
                    </Button>
                  ))}
                </div>

                {sendError ? (
                  <div className="mb-2 rounded-lg border border-[color:var(--danger)]/40 bg-[color:var(--danger)]/10 px-2.5 py-2 text-xs text-[color:var(--danger)]">
                    전송 실패: {sendError}
                  </div>
                ) : null}

                <div className="flex items-end gap-2">
                  <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={
                      mode === "group"
                        ? "우리 크루에게 전할 메시지를 입력해줘"
                        : `${snapshot?.agents.find((a) => a.id === target)?.name || target}에게 보낼 메시지를 입력해줘`
                    }
                    rows={2}
                    className="min-h-[58px] resize-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <Button onClick={() => void send()} disabled={busy || !text.trim()}>
                    {busy ? "전송 중" : "보내기"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="hidden min-h-0 overflow-hidden border border-[color:var(--border)] lg:block">
            <CardHeader>
              <p className="text-sm font-semibold text-strong">대화 인사이트</p>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="rounded-xl bg-[color:var(--surface-muted)] p-3">
                <p className="text-xs text-muted">참여 에이전트</p>
                <p className="mt-1 text-lg font-semibold text-strong">{snapshot?.agents.length ?? 0}명</p>
              </div>
              <div className="rounded-xl bg-[color:var(--surface-muted)] p-3">
                <p className="text-xs text-muted">현재 방 메시지</p>
                <p className="mt-1 text-lg font-semibold text-strong">{filtered.length}개</p>
              </div>
              <div className="rounded-xl bg-[color:var(--surface-muted)] p-3">
                <p className="text-xs text-muted">마지막 동기화</p>
                <p className="mt-1 text-sm font-medium text-strong">{snapshot?.generatedAt ? formatDateTime(snapshot.generatedAt) : "-"}</p>
              </div>
              <div className="rounded-xl border border-[color:var(--border)] bg-[color:var(--surface)] p-3">
                <p className="text-xs text-muted">보안</p>
                <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => void clearSavedPin()}>
                  저장된 PIN 해제하기
                </Button>
              </div>
              {pinNotice ? <p className="text-xs text-[color:var(--success)]">{pinNotice}</p> : null}
            </CardContent>
          </Card>
        </div>
      </main>
    </DashboardShell>
  );
}

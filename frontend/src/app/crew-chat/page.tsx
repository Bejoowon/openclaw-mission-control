"use client";

import { useEffect, useMemo, useState } from "react";

import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";

type CrewSnapshot = {
  agents: Array<{ id: string; name: string }>;
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

export default function CrewChatPage() {
  const [snapshot, setSnapshot] = useState<CrewSnapshot | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [mode, setMode] = useState<"group" | "direct">("group");
  const [target, setTarget] = useState<string>("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [s, m] = await Promise.all([
      fetch("/api/crew-snapshot", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/crew-chat/messages", { cache: "no-store" }).then((r) => r.json()),
    ]);
    setSnapshot(s);
    setMessages(m.messages ?? []);
    if (!target && s?.agents?.[0]?.id) setTarget(s.agents[0].id);
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 3000);
    return () => clearInterval(timer);
  }, []);

  const filtered = useMemo(() => {
    if (mode === "group") return messages.filter((m) => m.room === "crew");
    return messages.filter((m) => m.room === `dm:${target}` || (m.from === target && m.to === "user"));
  }, [messages, mode, target]);

  const send = async () => {
    if (!text.trim()) return;
    setBusy(true);
    await fetch("/api/crew-chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
      <main className="flex-1 overflow-y-auto bg-slate-50 p-6">
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-xl font-semibold text-slate-900">Crew Chat 💬</h2>
          <p className="mt-1 text-sm text-slate-500">개인채팅 + 단체방 실시간 보기</p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={() => setMode("group")}
              className={`rounded-md px-3 py-1.5 text-sm ${mode === "group" ? "bg-blue-600 text-white" : "bg-slate-100"}`}
            >
              단체방
            </button>
            <button
              onClick={() => setMode("direct")}
              className={`rounded-md px-3 py-1.5 text-sm ${mode === "direct" ? "bg-blue-600 text-white" : "bg-slate-100"}`}
            >
              개인채팅
            </button>
            {mode === "direct" ? (
              <select
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                {(snapshot?.agents ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.id})
                  </option>
                ))}
              </select>
            ) : null}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="max-h-[480px] space-y-3 overflow-y-auto pr-1">
            {filtered.map((m) => (
              <div key={m.id} className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${m.from === "주원" ? "ml-auto bg-blue-600 text-white" : "bg-slate-100 text-slate-800"}`}>
                <div className="mb-1 text-[11px] opacity-80">{m.from} · {new Date(m.ts).toLocaleTimeString()}</div>
                <div className="whitespace-pre-wrap">{m.text}</div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={mode === "group" ? "단체방에 메시지 보내기" : `${target}에게 메시지 보내기`}
              className="flex-1 rounded-md border border-slate-300 px-3 py-2 text-sm"
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
            />
            <button
              onClick={send}
              disabled={busy}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {busy ? "전송중..." : "전송"}
            </button>
          </div>
        </div>
      </main>
    </DashboardShell>
  );
}

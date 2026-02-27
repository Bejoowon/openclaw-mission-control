"use client";

import { useEffect } from "react";

export default function CrewChatError({ error, reset }: { error: Error; reset: () => void }) {
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[crew-chat-error]", error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-slate-800">크루 채팅에서 오류가 발생했어</p>
        <p className="mt-2 text-xs text-slate-500">새로고침 후 다시 시도해줘. 계속되면 아래 코드랑 같이 알려줘!</p>
        <p className="mt-2 rounded bg-slate-100 px-2 py-1 text-[11px] text-slate-700 break-all">
          {error?.message || "unknown_error"}
        </p>
        <button
          onClick={reset}
          className="mt-4 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white"
        >
          다시 시도
        </button>
      </div>
    </div>
  );
}

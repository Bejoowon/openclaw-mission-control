"use client";

export default function CrewChatError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <p className="text-sm font-semibold text-slate-800">크루 채팅에서 오류가 발생했어</p>
        <p className="mt-2 text-xs text-slate-500">새로고침 후 다시 시도해줘. 계속되면 나한테 바로 말해줘!</p>
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

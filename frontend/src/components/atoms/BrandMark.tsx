export function BrandMark() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-violet-600 to-fuchsia-700 text-xs font-semibold text-white shadow-sm">
        <span className="font-heading tracking-[0.12em]">B3</span>
      </div>
      <div className="leading-tight">
        <div className="font-heading text-sm uppercase tracking-[0.2em] text-strong">
          BANG'S TRIO
        </div>
        <div className="text-[11px] font-medium text-quiet">
          Family Mission Control
        </div>
      </div>
    </div>
  );
}

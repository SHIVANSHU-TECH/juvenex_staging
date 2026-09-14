export default function TelehealthLoading() {
  return (
    <div className="min-h-screen bg-[#FAF9F6] pb-24">
      {/* Header skeleton */}
      <div className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#E5EAE3]">
        <div className="px-4 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#E5EAE3] animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-32 rounded bg-[#E5EAE3] animate-pulse" />
            <div className="h-3 w-24 rounded bg-[#EEF1ED] animate-pulse" />
          </div>
        </div>
      </div>

      {/* Content skeleton */}
      <div className="px-4 py-4 space-y-4">
        <div className="h-32 rounded-2xl bg-[#E5EAE3] animate-pulse" />
        <div className="grid grid-cols-2 gap-3">
          <div className="h-24 rounded-2xl bg-[#EEF1ED] animate-pulse" />
          <div className="h-24 rounded-2xl bg-[#EEF1ED] animate-pulse" />
        </div>
        <div className="h-48 rounded-2xl bg-[#EEF1ED] animate-pulse" />
        <div className="h-48 rounded-2xl bg-[#EEF1ED] animate-pulse" />
      </div>
    </div>
  );
}

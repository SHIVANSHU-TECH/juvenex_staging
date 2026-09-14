export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-50">
      <div className="flex flex-col items-center gap-4">
        <div className="relative h-12 w-12">
          <div className="absolute inset-0 rounded-full border-4 border-emerald-200" />
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-emerald-600 animate-spin" />
        </div>
        <span className="text-sm font-medium text-emerald-700 tracking-wide">
          Loading...
        </span>
      </div>
    </div>
  )
}

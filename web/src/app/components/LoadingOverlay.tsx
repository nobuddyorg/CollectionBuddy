"use client";
export default function LoadingOverlay({
  label = "Wird geladen...",
}: {
  label?: string;
}) {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-black/60 backdrop-blur-sm">
      <div className="animate-spin h-8 w-8 rounded-full border-2 border-white/80 border-t-transparent" />
      <span className="text-white text-lg font-medium">{label}</span>
    </div>
  );
}

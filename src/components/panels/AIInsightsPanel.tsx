import { Sparkles, ListOrdered, Video, MessageSquare } from 'lucide-react';
import { AIInsightsResult } from '@/lib/ai-insights';
import { cn } from '@/lib/utils';

export function AIInsightsPanel({ data }: { data: AIInsightsResult | null }) {
  if (!data) return (
    <div className="flex flex-col items-center justify-center h-40 text-gray-500 gap-3">
      <Sparkles className="h-6 w-6 opacity-20" />
      <p className="text-xs">No AI insights generated yet.</p>
    </div>
  );

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-400 bg-green-400/10 border-green-400/20';
    if (score >= 50) return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
    return 'text-red-400 bg-red-400/10 border-red-400/20';
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      
      {/* Viral Hook Score */}
      <div className="bg-[#1A1A1A] rounded-xl border border-white/5 overflow-hidden">
        <div className="p-3 border-b border-white/5 flex items-center justify-between bg-black/20">
          <h3 className="text-xs font-semibold text-white flex items-center gap-1.5">
            <MessageSquare className="h-3.5 w-3.5 text-blue-400" /> Viral Hook Analysis
          </h3>
          <span className={cn("text-xs font-bold px-2 py-0.5 rounded-full border", getScoreColor(data.hookAnalysis?.score || 0))}>
            {data.hookAnalysis?.score || 0}/100
          </span>
        </div>
        <div className="p-3 space-y-2">
          <p className="text-[11px] text-gray-300">
            <span className="text-red-400 font-semibold block mb-0.5">Weakness:</span>
            {data.hookAnalysis?.whyLow || "N/A"}
          </p>
          <p className="text-[11px] text-gray-300">
            <span className="text-green-400 font-semibold block mb-0.5">How to Improve:</span>
            {data.hookAnalysis?.howToImprove || "N/A"}
          </p>
        </div>
      </div>

      {/* Highlights */}
      {data.highlights && data.highlights.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-white mb-2 flex items-center gap-1.5 px-1">
            <Video className="h-3.5 w-3.5 text-yellow-400" /> Auto Highlights
          </h3>
          <div className="space-y-2">
            {data.highlights.map((hl, i) => (
              <div key={i} className="bg-black/30 rounded-lg p-2.5 border border-white/5 flex items-start gap-3">
                <div className="shrink-0 bg-yellow-400/10 text-yellow-400 text-[10px] font-mono px-1.5 py-0.5 rounded">
                  {hl.start} - {hl.end}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[11px] text-gray-200 font-medium leading-tight mb-1">{hl.reason}</p>
                  <p className="text-[9px] text-gray-500">Duration: {hl.duration} • Score: {hl.score}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Chapters */}
      {data.chapters && data.chapters.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-white mb-2 flex items-center gap-1.5 px-1">
            <ListOrdered className="h-3.5 w-3.5 text-purple-400" /> AI Chapters
          </h3>
          <div className="bg-[#1A1A1A] rounded-lg border border-white/5 p-1">
            {data.chapters.map((ch, i) => (
              <div key={i} className="flex items-center gap-3 px-2 py-1.5 hover:bg-white/5 rounded-md transition-colors cursor-default">
                <span className="text-[10px] font-mono text-purple-400/80 w-8">{ch.time}</span>
                <span className="text-[11px] text-gray-300 truncate">{ch.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stats */}
      {data.fillerWordsRemoved > 0 && (
        <div className="bg-green-400/10 border border-green-400/20 text-green-400 rounded-lg p-2.5 flex items-center gap-2">
          <Sparkles className="h-4 w-4" />
          <p className="text-[11px] font-medium">Cleaned {data.fillerWordsRemoved} filler words from transcript.</p>
        </div>
      )}
    </div>
  );
}

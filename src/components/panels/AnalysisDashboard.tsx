import { Clock, Activity, FileVideo, HardDrive, DollarSign, List, VolumeX, Mic } from 'lucide-react';

interface AnalysisData {
  durationSec: number;
  resolution: string;
  fps: number;
  sampleRate: number;
  estimatedCuts: number;
  estimatedSilenceDuration: number;
  estimatedProcessingTime: string;
  estimatedApiCost: string;
  estimatedSubtitleCount: number;
  estimatedSpeakingSpeed: string;
}

export function AnalysisDashboard({ data }: { data: AnalysisData | null }) {
  if (!data) return null;

  const formatDuration = (sec: number) => {
    const mins = Math.floor(sec / 60);
    const secs = Math.floor(sec % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full bg-[#1A1A1A] border border-white/5 rounded-xl p-5 shadow-lg animate-in fade-in zoom-in-95">
      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        <Activity className="h-4 w-4 text-purple-400" />
        Pre-Processing Analysis
      </h3>
      
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-black/30 rounded-lg p-3 border border-white/5">
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5"><Clock className="h-3 w-3" /> Duration</p>
          <p className="text-sm font-medium text-gray-200">{formatDuration(data.durationSec)}</p>
        </div>
        
        <div className="bg-black/30 rounded-lg p-3 border border-white/5">
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5"><FileVideo className="h-3 w-3" /> Resolution</p>
          <p className="text-sm font-medium text-gray-200">{data.resolution} @ {data.fps}fps</p>
        </div>
        
        <div className="bg-black/30 rounded-lg p-3 border border-white/5">
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5"><VolumeX className="h-3 w-3" /> Est. Silence</p>
          <p className="text-sm font-medium text-yellow-400">{formatDuration(data.estimatedSilenceDuration)} ({data.estimatedCuts} cuts)</p>
        </div>
        
        <div className="bg-black/30 rounded-lg p-3 border border-white/5">
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5"><List className="h-3 w-3" /> Est. Subtitles</p>
          <p className="text-sm font-medium text-purple-400">~{data.estimatedSubtitleCount} lines</p>
        </div>

        <div className="bg-black/30 rounded-lg p-3 border border-white/5">
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5"><HardDrive className="h-3 w-3" /> Sample Rate</p>
          <p className="text-sm font-medium text-gray-200">{data.sampleRate} Hz</p>
        </div>

        <div className="bg-black/30 rounded-lg p-3 border border-white/5">
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5"><Mic className="h-3 w-3" /> Speaking Speed</p>
          <p className="text-sm font-medium text-gray-200">{data.estimatedSpeakingSpeed}</p>
        </div>

        <div className="bg-black/30 rounded-lg p-3 border border-white/5">
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5"><Clock className="h-3 w-3" /> Process Time</p>
          <p className="text-sm font-medium text-gray-200">~{data.estimatedProcessingTime}s</p>
        </div>

        <div className="bg-black/30 rounded-lg p-3 border border-white/5">
          <p className="text-xs text-gray-500 mb-1 flex items-center gap-1.5"><DollarSign className="h-3 w-3" /> API Cost</p>
          <p className="text-sm font-medium text-green-400">${data.estimatedApiCost}</p>
        </div>
      </div>
    </div>
  );
}

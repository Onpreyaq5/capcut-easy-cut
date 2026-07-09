'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Ban,
  CheckCircle2,
  Download,
  FileText,
  Film,
  Loader2,
  Package,
  Scissors,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
  Settings as SettingsIcon,
  Video
} from 'lucide-react';
import { Alert, Badge, Button, Input, Select } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApp } from '@/lib/store';
import type { ProviderId, Settings } from '@/lib/types';
import Link from 'next/link';
import { AnalysisDashboard } from './panels/AnalysisDashboard';
import { AdvancedSettings } from './panels/AdvancedSettings';
import { AIInsightsPanel } from './panels/AIInsightsPanel';
import type { AIInsightsResult } from '@/lib/ai-insights';
import JSZip from 'jszip';

type BusyMode = '' | 'zip' | 'capcut';

interface JobProgress {
  status: 'running' | 'done' | 'error' | 'canceled';
  progress: number;
  phase: string;
  log: string[];
  error?: string;
}

/** AI เจ้าฟรีสำหรับงานตรวจแก้ภาษาไทยในซับ (API มาตรฐาน OpenAI) */
const THAI_CHECK_PROVIDERS: Record<string, { label: string; model: string; keyUrl: string }> = {
  groq: { label: 'Groq (ฟรี · แนะนำ)', model: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys' },
  cerebras: { label: 'Cerebras (ฟรี 1M โทเคน/วัน)', model: 'llama-3.3-70b', keyUrl: 'https://cloud.cerebras.ai/' },
  openrouter: { label: 'OpenRouter (มีรุ่นฟรี)', model: 'meta-llama/llama-3.3-70b-instruct:free', keyUrl: 'https://openrouter.ai/keys' },
};

/** เลือก AI ที่ใช้ตรวจแก้ภาษาไทยในซับ (puter ใช้ไม่ได้ — ทำงานเฉพาะในเบราว์เซอร์) */
function pickThaiCheckLlm(settings: Settings) {
  // 1) ถ้าเลือก AI เฉพาะงานนี้ไว้ (Groq/Cerebras/OpenRouter) ใช้ตัวนั้นก่อน
  if (settings.thaiCheckProvider && settings.thaiCheckKey) {
    const meta = THAI_CHECK_PROVIDERS[settings.thaiCheckProvider];
    if (meta) return { provider: settings.thaiCheckProvider, key: settings.thaiCheckKey, model: meta.model, base: '' };
  }
  // 2) ไม่งั้นใช้ AI หลักจากหน้า "ตั้งค่า"
  const usable = (p: ProviderId) => p === 'local' || Boolean(settings.keys[p]);
  if (settings.activeProvider !== 'puter' && usable(settings.activeProvider)) {
    return {
      provider: settings.activeProvider,
      key: settings.keys[settings.activeProvider] || '',
      model: settings.models[settings.activeProvider],
      base: settings.activeProvider === 'local' ? settings.localBaseUrl : '',
    };
  }
  for (const p of ['gemini', 'openai', 'anthropic'] as ProviderId[]) {
    if (settings.keys[p]) return { provider: p, key: settings.keys[p], model: settings.models[p], base: '' };
  }
  return null;
}

const VIDEO_EXT = ['.mp4', '.mov', '.mkv', '.webm', '.m4v'];

function mb(size: number): string {
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function isVideo(file: File): boolean {
  const lower = file.name.toLowerCase();
  return file.type.startsWith('video/') || VIDEO_EXT.some((ext) => lower.endsWith(ext));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = /filename="?([^"]+)"?/i.exec(header);
  return match?.[1] || fallback;
}

const waveform = [34, 52, 28, 70, 44, 84, 36, 64, 48, 78, 32, 56, 40, 88, 46, 62, 30, 72];

export function EasyCutTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [projectName, setProjectName] = useState('CAPCUT_Easy_CUT');
  const [deadAir, setDeadAir] = useState(true);
  const [hookText, setHookText] = useState('');
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const thaiCheckLlm = pickThaiCheckLlm(settings);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<BusyMode>('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [job, setJob] = useState<JobProgress | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const jobIdRef = useRef<string>('');
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  
  const [activeTab, setActiveTab] = useState<'media' | 'settings'>('media');
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [aiInsights, setAiInsights] = useState<AIInsightsResult | null>(null);
  const [finalZipUrl, setFinalZipUrl] = useState('');
  const [showReview, setShowReview] = useState(false);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);
  const firstFile = files[0];
  const isBusy = Boolean(busy);

  const [previewUrl, setPreviewUrl] = useState('');
  useEffect(() => {
    if (!firstFile) {
      setPreviewUrl('');
      return;
    }
    const nextUrl = URL.createObjectURL(firstFile);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [firstFile]);

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list).filter(isVideo);
    if (!incoming.length) {
      setError('ไฟล์ที่เลือกยังไม่ใช่วิดีโอที่รองรับ');
      return;
    }
    setFiles((prev) => [...prev, ...incoming]);
    setError('');
    setSuccess('');
    setActiveTab('media');
    setAiInsights(null);
    setFinalZipUrl('');
    setShowReview(false);

    // Instant Client-side Analysis
    const first = incoming[0] || files[0];
    if (first) {
      const url = URL.createObjectURL(first);
      const vid = document.createElement('video');
      vid.preload = 'metadata';
      vid.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        const dur = vid.duration || 0;
        setAnalysisData({
          durationSec: dur,
          resolution: `${vid.videoWidth}x${vid.videoHeight}`,
          fps: 30, // Default assumption
          sampleRate: 44100, // Default assumption
          estimatedCuts: Math.max(1, Math.floor(dur / 10)),
          estimatedSilenceDuration: dur * 0.15,
          estimatedProcessingTime: (dur * 0.4).toFixed(1),
          estimatedApiCost: (dur * 0.0001).toFixed(4),
          estimatedSubtitleCount: Math.max(1, Math.floor(dur / 3)),
          estimatedSpeakingSpeed: 'Normal (140 wpm)',
        });
      };
      vid.src = url;
    }
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function buildFormData(mode: BusyMode): FormData {
    const fd = new FormData();
    fd.append('mode', mode);
    fd.append('name', projectName || 'CAPCUT_Easy_CUT');
    fd.append('deadAir', deadAir ? 'on' : 'off');
    fd.append('minSilence', settings.minSilence || '0.4');
    fd.append('pad', settings.pad || '0.08');
    fd.append('shorts', settings.generateShorts ? 'true' : 'false');
    fd.append('removeFillers', settings.removeFillers ? 'true' : 'false');
    fd.append('hook', hookText.trim());
    if (thaiCheckLlm) {
      fd.append('llmProvider', thaiCheckLlm.provider);
      fd.append('llmKey', thaiCheckLlm.key);
      fd.append('llmModel', thaiCheckLlm.model);
      fd.append('llmBase', thaiCheckLlm.base);
    }
    files.forEach((file) => fd.append('clips', file));
    return fd;
  }

  function capcutSuccessMessage(log: string[]): string {
    const infoLines = log
      .filter((l) => l.includes('[THAI]'))
      .map((l) => l.replace('[THAI]', 'ภาษาไทย:').trim())
      .join('\n');
    return (
      `สร้างโปรเจกต์ "${projectName || 'CAPCUT_Easy_CUT'}" ใน CapCut แล้ว ปิด CapCut ให้สนิทแล้วเปิดใหม่` +
      (infoLines ? `\n${infoLines}` : '')
    );
  }

  function pollStatus(jobId: string, mode: BusyMode) {
    const tick = async () => {
      if (jobIdRef.current !== jobId) return;
      try {
        const res = await fetch(`/api/easycut/status/${jobId}`, { cache: 'no-store' });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || 'ติดตามสถานะงานไม่สำเร็จ');
        }
        const s = (await res.json()) as JobProgress & { resultName?: string };
        setJob({ status: s.status, progress: s.progress, phase: s.phase, log: s.log || [], error: s.error });

        if (s.status === 'done') {
          if (mode === 'zip') {
            const r = await fetch(`/api/easycut/result/${jobId}`);
            if (!r.ok) throw new Error('ดาวน์โหลดผลลัพธ์ไม่สำเร็จ');
            const blob = await r.blob();
            
            // Extract AI Insights from ZIP
            try {
              const zip = await JSZip.loadAsync(blob);
              const aiFile = zip.file('ai_insights.json');
              if (aiFile) {
                const aiText = await aiFile.async('string');
                setAiInsights(JSON.parse(aiText));
              }
            } catch (e) {
              console.error('Failed to parse AI Insights from ZIP', e);
            }

            const url = URL.createObjectURL(blob);
            setFinalZipUrl(url);
            setShowReview(true);
            setSuccess('ประมวลผลเสร็จสิ้น กรุณาตรวจสอบผลลัพธ์ AI ก่อนดาวน์โหลด');
          } else {
            setSuccess(capcutSuccessMessage(s.log || []));
          }
          finishJob();
          return;
        }
        if (s.status === 'error') {
          const tail = (s.log || []).slice(-8).join('\n');
          setError((s.error || 'ประมวลผลไม่สำเร็จ') + (tail ? `\n\n${tail}` : ''));
          finishJob();
          return;
        }
        if (s.status === 'canceled') {
          setError('ยกเลิกงานแล้ว');
          finishJob();
          return;
        }
        pollRef.current = setTimeout(tick, 1000);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
        finishJob();
      }
    };
    pollRef.current = setTimeout(tick, 600);
  }

  function finishJob() {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = null;
    jobIdRef.current = '';
    setBusy('');
    setJob(null);
  }

  async function runJob(mode: BusyMode) {
    if (!files.length) {
      setError('ลากคลิปเข้ามาก่อน แล้วค่อยเริ่มประมวลผล');
      return;
    }
    setBusy(mode);
    setError('');
    setSuccess('');
    setJob({ status: 'running', progress: 0, phase: 'กำลังอัปโหลดคลิป...', log: [] });
    try {
      const res = await fetch(`/api/easycut/start?mode=${mode}`, { method: 'POST', body: buildFormData(mode) });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok || !body.jobId) {
        throw new Error(body?.error || 'เริ่มงานไม่สำเร็จ');
      }
      jobIdRef.current = body.jobId;
      pollStatus(body.jobId, mode);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      finishJob();
    }
  }

  async function cancelCurrentJob() {
    const id = jobIdRef.current;
    if (!id) return;
    setJob((j) => (j ? { ...j, phase: 'กำลังยกเลิก...' } : j));
    await fetch(`/api/easycut/cancel/${id}`, { method: 'POST' }).catch(() => undefined);
  }

  const downloadPackage = () => runJob('zip');
  const createCapCutProject = () => runJob('capcut');

  return (
    <div className="flex flex-col h-full w-full bg-[#141414] text-gray-300 font-sans selection:bg-primary/30 overflow-hidden">
      {/* Kapwing-style Top Bar */}
      <header className="h-14 border-b border-white/10 bg-[#1A1A1A] flex items-center justify-between px-4 shrink-0 shadow-sm z-20">
        <div className="flex items-center gap-4">
          <Input 
             value={projectName} 
             onChange={(e) => setProjectName(e.target.value)} 
             className="bg-transparent border-transparent hover:border-white/10 focus:border-primary/50 text-white font-semibold text-[15px] px-3 h-9 w-64 rounded-md transition-colors" 
             placeholder="Untitled Project"
          />
        </div>
        <div className="flex items-center gap-3">
            {isBusy && (
               <div className="flex items-center gap-2 text-xs font-medium text-gray-300 bg-white/5 px-3 py-1.5 rounded-md border border-white/10">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                  {job?.phase} <span className="text-white">{Math.round(job?.progress ?? 0)}%</span>
               </div>
            )}
            <Button variant="outline" size="sm" className="h-9 border-white/10 bg-transparent text-gray-200 hover:bg-white/5 hover:text-white transition-colors" disabled={!files.length || isBusy} onClick={createCapCutProject}>
              <Scissors className="h-4 w-4 mr-2" />
              Send to CapCut
            </Button>
            <Button variant="primary" size="sm" className="h-9 px-6 font-semibold bg-primary hover:bg-primary/90 text-white border-none shadow-lg shadow-primary/20 transition-all" disabled={!files.length || isBusy} onClick={downloadPackage}>
              Export
            </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* 1. Left Narrow Sidebar (Tools) */}
        <div className="w-[64px] flex-shrink-0 flex flex-col items-center border-r border-white/10 bg-[#1A1A1A] py-3 gap-2 z-10">
          <button 
            onClick={() => setActiveTab('media')} 
            className={cn(
              'flex flex-col items-center justify-center w-12 h-12 rounded-lg transition-all duration-200 group',
              activeTab === 'media' ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            )}
          >
            <Film className={cn("h-5 w-5 mb-1", activeTab === 'media' && "text-primary")} />
            <span className="text-[9px] font-medium">Media</span>
          </button>
          <button 
            onClick={() => setActiveTab('settings')} 
            className={cn(
              'flex flex-col items-center justify-center w-12 h-12 rounded-lg transition-all duration-200 group',
              activeTab === 'settings' ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5 hover:text-gray-200'
            )}
          >
            <Sparkles className={cn("h-5 w-5 mb-1", activeTab === 'settings' && "text-purple-400")} />
            <span className="text-[9px] font-medium">AI Subtitles</span>
          </button>
          
          <div className="mt-auto pb-2 w-full flex flex-col items-center">
            <Link
              href="/skills"
              className="flex flex-col items-center justify-center w-12 h-12 rounded-lg transition-all duration-200 text-gray-400 hover:bg-white/5 hover:text-gray-200"
            >
              <Package className="h-5 w-5 mb-1" />
              <span className="text-[9px] font-medium text-center leading-tight">Skill<br/>Editor</span>
            </Link>
          </div>
        </div>

        {/* 2. Contextual Panel */}
        <div className="w-[280px] flex-shrink-0 flex flex-col border-r border-white/10 bg-[#141414] overflow-y-auto z-0">
          <div className="p-4 flex-1">
            {activeTab === 'media' && (
              <div className="animate-in fade-in duration-300">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-white">Media</h2>
                </div>
                
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="w-full mb-4 flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-white/20 bg-white/5 p-6 hover:bg-white/10 hover:border-white/30 transition-colors text-gray-300"
                >
                  <UploadCloud className="h-6 w-6 text-gray-400" />
                  <span className="text-xs font-medium">Click to upload</span>
                </button>
                
                {files.length > 0 && (
                  <div className="space-y-2">
                    {files.map((file, index) => (
                      <div key={`${file.name}-${index}`} className="flex items-center gap-3 rounded-md bg-[#1A1A1A] p-2.5 border border-white/5 group hover:border-white/10 transition-colors cursor-pointer">
                        <div className="grid h-8 w-8 shrink-0 place-items-center rounded bg-black/40 text-gray-400">
                          <Video className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-xs font-medium text-gray-200">{file.name}</p>
                          <p className="text-[10px] text-gray-500">{mb(file.size)}</p>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); removeFile(index); }}
                          className="grid h-6 w-6 place-items-center rounded text-gray-500 hover:bg-red-500/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'settings' && (
              <div className="animate-in fade-in duration-300 space-y-6">
                <AdvancedSettings />
                
                <div className="space-y-4 pt-4 border-t border-white/5">
                  <h2 className="text-sm font-semibold text-white">AI Language Model</h2>
                  <div>
                    <label className="text-xs font-medium text-gray-400 block mb-1.5">LLM Provider</label>
                    <Select
                      value={settings.thaiCheckProvider}
                      onChange={(e) => setSettings({ thaiCheckProvider: e.target.value as Settings['thaiCheckProvider'] })}
                      className="w-full bg-[#1A1A1A] border-white/10 text-xs text-white"
                    >
                      <option value="" className="bg-[#1A1A1A] text-white">Raw transcription</option>
                      <option value="groq" className="bg-[#1A1A1A] text-white">Groq (Fast)</option>
                      <option value="cerebras" className="bg-[#1A1A1A] text-white">Cerebras</option>
                      <option value="openrouter" className="bg-[#1A1A1A] text-white">OpenRouter</option>
                    </Select>
                  </div>
                  {settings.thaiCheckProvider && (
                    <div className="animate-in slide-in-from-top-2">
                      <label className="text-xs font-medium text-gray-400 block mb-1.5">API Key</label>
                      <Input
                        value={settings.thaiCheckKey}
                        onChange={(e) => setSettings({ thaiCheckKey: e.target.value })}
                        placeholder="Enter API Key"
                        className="w-full bg-[#1A1A1A] border-white/10 text-xs h-8"
                      />
                      {showReview ? (
                      <Button onClick={() => {
                        const a = document.createElement('a');
                        a.href = finalZipUrl;
                        a.download = `${projectName || 'CAPCUT_Easy_CUT'}_package.zip`;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                      }} size="sm" className="bg-primary hover:bg-primary/90 text-white font-medium h-8 px-4 gap-2">
                        <Download className="h-4 w-4" /> Export All
                      </Button>
                    ) : (
                      <Button onClick={() => runJob('zip')} disabled={isBusy} size="sm" className="bg-primary hover:bg-primary/90 text-white font-medium h-8 px-4 gap-2">
                        {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Package className="h-4 w-4" />} 
                        {isBusy ? 'Processing...' : 'Process'}
                      </Button>
                    )}
                  </div>
                )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 3. Center Workspace (Canvas + Timeline) */}
        <div className="flex-1 flex flex-col min-w-0 bg-[#0A0A0A]">
          {/* Canvas */}
          <div 
            className="flex-1 relative flex items-center justify-center p-8 overflow-hidden"
            onDragEnter={(e) => { e.preventDefault(); setDragging(true); }}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files); }}
          >
            <input ref={fileRef} type="file" accept="video/*" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
            
            {files.length > 0 && previewUrl ? (
               <div className="relative w-full h-full max-w-4xl max-h-[600px] flex flex-col items-center justify-center gap-4">
                 {/* Analysis Dashboard */}
                 {!showReview && analysisData && (
                   <div className="w-full max-w-4xl">
                     <AnalysisDashboard data={analysisData} />
                   </div>
                 )}
                 <div className="relative w-full h-full shadow-2xl overflow-hidden flex items-center justify-center rounded-lg bg-black">
                   <video className="w-full h-full object-contain" src={previewUrl} controls playsInline />
                   {dragging && (
                     <div className="absolute inset-0 bg-primary/20 backdrop-blur-md flex items-center justify-center border-2 border-primary rounded-lg z-10">
                        <UploadCloud className="h-12 w-12 text-primary" />
                     </div>
                   )}
                 </div>
               </div>
            ) : (
              <div className={cn(
                "w-full max-w-2xl aspect-video rounded-xl border border-dashed flex flex-col items-center justify-center transition-all bg-[#141414]",
                dragging ? "border-primary bg-primary/5" : "border-white/10"
              )}>
                <UploadCloud className="h-10 w-10 text-gray-500 mb-4" />
                <p className="text-sm font-medium text-gray-300">Click to upload or drag and drop</p>
                <p className="text-xs text-gray-500 mt-1">MP4, MOV, WEBM</p>
                <Button onClick={() => fileRef.current?.click()} size="sm" variant="secondary" className="mt-6 bg-white/10 hover:bg-white/20 text-white border-none">
                  Browse Files
                </Button>
              </div>
            )}
          </div>
          
          {/* Bottom Timeline */}
          <div className="h-[220px] border-t border-white/10 bg-[#1A1A1A] flex flex-col shrink-0 shadow-[0_-4px_20px_rgba(0,0,0,0.2)] z-10">
             <div className="h-9 border-b border-white/5 flex items-center px-4 justify-between bg-[#141414]">
                <div className="flex items-center gap-4">
                  <span className="text-xs font-semibold text-gray-400">Timeline</span>
                  <div className="flex items-center gap-1">
                    <button className="p-1 hover:bg-white/10 rounded text-gray-400"><Scissors className="h-3.5 w-3.5" /></button>
                    <button className="p-1 hover:bg-white/10 rounded text-gray-400"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 font-mono">00:00:00:00</span>
                </div>
             </div>
             <div className="flex-1 relative p-4 overflow-hidden flex flex-col gap-2">
               {/* Time ruler */}
               <div className="h-4 border-b border-white/10 mb-2 flex items-end">
                 {[...Array(20)].map((_, i) => (
                   <div key={i} className="flex-1 border-l border-white/10 h-2"></div>
                 ))}
               </div>
               
               {/* Tracks */}
               {files.length > 0 ? (
                 <div className="w-full h-16 bg-[#2563EB]/20 rounded-md border border-[#3B82F6]/50 flex flex-col justify-center px-3 relative overflow-hidden group cursor-pointer hover:border-[#3B82F6] transition-colors">
                    <div className="absolute inset-y-0 left-0 bg-[#3B82F6]/20 w-[15%] border-r border-[#3B82F6]/50 pointer-events-none"></div>
                    <div className="flex items-center gap-2 z-10">
                      <Film className="h-3.5 w-3.5 text-[#60A5FA]" />
                      <span className="text-xs font-medium text-[#DBEAFE] truncate">{files[0].name}</span>
                    </div>
                    {/* Fake waveform */}
                    <div className="absolute bottom-1 left-0 right-0 h-4 flex items-end justify-between px-2 opacity-50 pointer-events-none">
                      {[...Array(50)].map((_, i) => (
                        <div key={i} className="w-1 bg-[#60A5FA]" style={{ height: `${20 + Math.random() * 80}%` }}></div>
                      ))}
                    </div>
                 </div>
               ) : (
                 <div className="w-full h-16 rounded-md border border-dashed border-white/10 flex items-center justify-center text-xs text-gray-600">
                    No media on timeline
                 </div>
               )}
               {files.length > 0 && hookText && (
                  <div className="w-[15%] h-6 bg-purple-500/20 rounded border border-purple-500/50 flex items-center px-2">
                    <FileText className="h-3 w-3 text-purple-400 mr-1" />
                    <span className="text-[9px] text-purple-200 truncate">{hookText}</span>
                  </div>
               )}
             </div>
          </div>
        </div>

        {/* 4. Right Sidebar (Properties / AI Review) */}
        <div className="w-[280px] flex-shrink-0 flex flex-col border-l border-white/10 bg-[#1A1A1A] overflow-y-auto z-10">
          <div className="p-4 flex flex-col h-full">
            {showReview ? (
              <>
                <h2 className="text-sm font-semibold text-white mb-4 flex items-center justify-between">
                  AI Review
                  <Button onClick={() => setShowReview(false)} size="sm" variant="ghost" className="h-6 px-2 text-xs">Back</Button>
                </h2>
                <AIInsightsPanel data={aiInsights} />
              </>
            ) : (
              <>
                <h2 className="text-sm font-semibold text-white mb-4">Properties</h2>
            
            <div className="space-y-5 flex-1">
              {/* Dead Air Toggle */}
              <div className="bg-[#141414] rounded-lg p-3 border border-white/5">
                <label className="flex items-center justify-between cursor-pointer group">
                  <div className="flex items-center gap-2">
                    <div className={cn("p-1.5 rounded-md transition-colors", deadAir ? "bg-primary/20 text-primary" : "bg-white/5 text-gray-400")}>
                      <AudioLines className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-medium text-gray-200 group-hover:text-white transition-colors">Cut Dead Air</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={deadAir}
                    onChange={(e) => setDeadAir(e.target.checked)}
                    className="h-4 w-4 accent-primary rounded bg-[#1A1A1A] border-white/20"
                  />
                </label>
              </div>

              {/* Hook Text Input */}
              <div>
                <label className="text-xs font-medium text-gray-400 block mb-1.5">Hook Text (Optional)</label>
                <Input
                  value={hookText}
                  onChange={(e) => setHookText(e.target.value)}
                  placeholder="Large text at start..."
                  className="w-full bg-[#141414] border-white/10 text-xs h-8 focus:border-primary/50 text-white"
                />
              </div>

              {error && (
                <div className="p-3 rounded-md bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                  {error}
                </div>
              )}
              {success && (
                <div className="p-3 rounded-md bg-green-500/10 border border-green-500/20 text-green-400 text-xs">
                  {success}
                </div>
              )}
            </div>
            
            <div className="mt-4 pt-4 border-t border-white/5">
               <div className="rounded-lg bg-[#141414] p-3 border border-white/5 flex items-start gap-2">
                 <ShieldCheck className="h-4 w-4 text-green-400 mt-0.5 shrink-0" />
                 <div>
                   <p className="text-xs font-medium text-gray-200">Local Privacy</p>
                   <p className="text-[10px] text-gray-500 mt-0.5 leading-snug">Media stays on your device. Only transcriptions use AI if enabled.</p>
                 </div>
               </div>
              </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

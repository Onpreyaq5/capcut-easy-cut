'use client';

import { useEffect, useRef, useState } from 'react';
import { UploadCloud, Film, Music, ImageIcon, FileQuestion, ArrowUp, ArrowDown, X, Package, Combine, Info, Clapperboard } from 'lucide-react';
import { useApp } from '@/lib/store';
import { downloadOrderedPackage, type AssetItem, type AssetKind } from '@/lib/export/assemble';
import { mergeAndDownload } from '@/lib/mergeVideo';
import { Card, Button, Badge, Alert } from '@/components/ui';
import { uid } from '@/lib/utils';
import { cn } from '@/lib/utils';

function kindOf(f: File): AssetKind {
  if (f.type.startsWith('video/')) return 'video';
  if (f.type.startsWith('audio/')) return 'audio';
  if (f.type.startsWith('image/')) return 'image';
  return 'other';
}
const KIND_ICON = { video: Film, audio: Music, image: ImageIcon, other: FileQuestion };
const KIND_TH = { video: 'วิดีโอ', audio: 'เสียง', image: 'รูป', other: 'ไฟล์' };

export default function AssemblePage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const storyboard = useApp((s) => s.project.storyboard);

  const [items, setItems] = useState<AssetItem[]>([]);
  const [busy, setBusy] = useState<'' | 'zip' | 'merge' | 'capcut'>('');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState('');
  const [capcutMsg, setCapcutMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function reorder(list: AssetItem[]): AssetItem[] {
    return list.map((it, i) => ({ ...it, order: i + 1 }));
  }

  function addFiles(files: FileList | null) {
    if (!files) return;
    const next = Array.from(files).map((f) => ({ id: uid('a'), file: f, kind: kindOf(f), order: 0, label: '' }));
    setItems((prev) => reorder([...prev, ...next]));
  }

  function move(i: number, dir: -1 | 1) {
    setItems((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return reorder(copy);
    });
  }
  function remove(id: string) {
    setItems((prev) => reorder(prev.filter((x) => x.id !== id)));
  }

  async function doZip() {
    setError('');
    setBusy('zip');
    try {
      await downloadOrderedPackage(items, storyboard);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy('');
    }
  }

  async function doMerge() {
    setError('');
    const vids = items.filter((i) => i.kind === 'video').sort((a, b) => a.order - b.order).map((i) => i.file);
    if (vids.length < 2) {
      setError('ต้องมีวิดีโออย่างน้อย 2 คลิปถึงจะรวมได้');
      return;
    }
    setBusy('merge');
    setProgress(0);
    try {
      await mergeAndDownload(vids, `${(storyboard?.videoTitle || 'thanyakij')}_รวมคลิป.mp4`, setProgress);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setBusy('');
    }
  }

  async function doCapcut() {
    setError('');
    setCapcutMsg('');
    const vids = items.filter((i) => i.kind === 'video').sort((a, b) => a.order - b.order).map((i) => i.file);
    if (vids.length < 1) {
      setError('ต้องมีวิดีโออย่างน้อย 1 คลิป');
      return;
    }
    setBusy('capcut');
    try {
      const fd = new FormData();
      const title = (storyboard?.videoTitle || 'clip').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 30);
      fd.append('name', title);
      if (storyboard?.scenes?.length) {
        fd.append('script', JSON.stringify({ scenes: storyboard.scenes.map((s) => ({ voiceoverTH: s.voiceoverTH })) }));
      }
      vids.forEach((f) => fd.append('clips', f));
      const res = await fetch('/api/capcut/build', { method: 'POST', body: fd });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || 'สร้างไม่สำเร็จ');
      setCapcutMsg(`สร้างโปรเจกต์ “${j.name}” เรียบร้อย — ปิด CapCut ให้สนิทแล้วเปิดใหม่ เลือกโปรเจกต์ตัวบนสุดได้เลย`);
    } catch (e: any) {
      setError('สร้าง CapCut ไม่สำเร็จ: ' + String(e?.message ?? e) + ' — ปุ่มนี้ใช้ได้เฉพาะตอนรันเว็บในเครื่อง (npm run dev) และติดตั้งเครื่องมือใน tools/capcut-auto แล้ว');
    } finally {
      setBusy('');
    }
  }

  if (!mounted) return <div className="container-page py-16 text-text-muted">กำลังโหลด…</div>;

  const videoCount = items.filter((i) => i.kind === 'video').length;

  return (
    <div className="container-page max-w-3xl py-10">
      <div className="mb-6">
        <h1 className="font-heading text-3xl font-bold">รวม & จัดเรียงไฟล์ → CapCut</h1>
        <p className="mt-1 text-text-secondary">
          โหลดคลิปจาก Flow + เสียงจาก Botnoi มาแล้ว อัปที่นี่ → เว็บจัดลำดับ ตั้งชื่อ ใส่ซับ ให้พร้อมตัดต่อ เสียเวลาน้อยที่สุด
        </p>
      </div>

      {storyboard ? (
        <Alert tone="success">
          เจอ storyboard “{storyboard.videoTitle}” ({storyboard.scenes.length} ช็อต) — ระบบจะตั้งชื่อไฟล์ตามจังหวะ + แนบ subtitles.srt ให้อัตโนมัติ
        </Alert>
      ) : (
        <Alert tone="info">ยังไม่มี storyboard ในเครื่อง — ยังจัดลำดับไฟล์ได้ปกติ แต่จะไม่มีซับ .srt อัตโนมัติ (ไปทำที่ “สตูดิโอ” ก่อนได้)</Alert>
      )}

      {/* upload */}
      <div className="mt-5">
        <button
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface-muted/40 py-10 text-text-muted transition-colors hover:border-primary hover:bg-primary-soft/30"
        >
          <UploadCloud className="h-9 w-9" />
          <span className="font-medium text-text-secondary">คลิกเพื่ออัปโหลดไฟล์ (วิดีโอ + เสียง + รูป)</span>
          <span className="text-xs">เลือกหลายไฟล์พร้อมกันได้</span>
        </button>
        <input ref={fileRef} type="file" accept="video/*,audio/*,image/*" multiple hidden onChange={(e) => addFiles(e.target.files)} />
      </div>

      {error && <div className="mt-4"><Alert tone="danger">{error}</Alert></div>}

      {/* list */}
      {items.length > 0 && (
        <Card className="mt-5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading font-bold">ลำดับไทม์ไลน์ ({items.length} ไฟล์)</h2>
            <Badge tone="muted">{videoCount} วิดีโอ</Badge>
          </div>
          <div className="space-y-2">
            {items.map((it, i) => {
              const Icon = KIND_ICON[it.kind];
              return (
                <div key={it.id} className="flex items-center gap-3 rounded-md border border-border p-2.5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">{it.order}</span>
                  <Icon className="h-4 w-4 shrink-0 text-text-muted" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm text-text-primary">{it.file.name}</p>
                    <p className="text-[11px] text-text-muted">{KIND_TH[it.kind]} · {(it.file.size / 1024 / 1024).toFixed(1)} MB</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => move(i, -1)} disabled={i === 0} className="grid h-7 w-7 place-items-center rounded-sm text-text-muted hover:bg-surface-muted disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                    <button onClick={() => move(i, 1)} disabled={i === items.length - 1} className="grid h-7 w-7 place-items-center rounded-sm text-text-muted hover:bg-surface-muted disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                    <button onClick={() => remove(it.id)} className="grid h-7 w-7 place-items-center rounded-sm text-text-muted hover:text-danger"><X className="h-4 w-4" /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* CapCut อัตโนมัติ (ฟีเจอร์หลัก) */}
      {items.length > 0 && (
        <Card className="mt-5 border-primary/40 bg-primary-soft/20 p-5">
          <div className="flex items-start gap-3">
            <Clapperboard className="mt-0.5 h-7 w-7 shrink-0 text-primary" />
            <div className="min-w-0 flex-1">
              <h3 className="font-heading font-bold">สร้างโปรเจกต์ CapCut อัตโนมัติ ⚡ (แนะนำ)</h3>
              <p className="mb-1 mt-1 text-sm text-text-secondary">
                รวมคลิปทุกช็อต + ตัด dead air + ใส่ซับไทย (จากบทที่เขียนไว้ จับเวลาให้ตรงด้วย whisper) + เน้นสีคำ + ทรานสิชันซูมรอยต่อฉาก → เปิดเป็นโปรเจกต์ใน CapCut ได้เลย ไม่ต้อง import เอง
              </p>
              <p className="mb-3 text-xs text-text-muted">
                ใช้ได้เฉพาะตอนรันเว็บในเครื่อง (npm run dev) และติดตั้งเครื่องมือใน <code>tools/capcut-auto</code> แล้ว
              </p>
              {capcutMsg && <div className="mb-3"><Alert tone="success">{capcutMsg}</Alert></div>}
              <Button variant="primary" loading={busy === 'capcut'} onClick={doCapcut}>
                {busy === 'capcut' ? 'กำลังสร้าง… (ถอดเสียง+รวมคลิป อาจใช้เวลาสักครู่)' : 'สร้างโปรเจกต์ CapCut'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* actions */}
      {items.length > 0 && (
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <Card className="p-5">
            <Package className="mb-2 h-6 w-6 text-primary" />
            <h3 className="font-heading font-bold">แพ็กเกจจัดเรียง (.zip)</h3>
            <p className="mb-3 text-sm text-text-secondary">ไฟล์เรียงเลข 01,02,03 + เสียง + subtitles.srt + คู่มือ → ลากเข้า CapCut ตามเลขได้เลย (แนะนำ)</p>
            <Button variant="primary" className="w-full" loading={busy === 'zip'} onClick={doZip}>ดาวน์โหลด .zip</Button>
          </Card>
          <Card className="p-5">
            <Combine className="mb-2 h-6 w-6 text-ai" />
            <h3 className="font-heading font-bold">รวมคลิปเป็นไฟล์เดียว</h3>
            <p className="mb-3 text-sm text-text-secondary">ต่อวิดีโอทุกช็อตเป็น .mp4 เดียวในเบราว์เซอร์ (ฟรี) — เครื่องสเปคต่ำอาจช้า ใช้เป็นพรีวิว/ร่างได้</p>
            {busy === 'merge' && (
              <div className="mb-2 h-2 w-full overflow-hidden rounded-full bg-surface-muted">
                <div className="h-full bg-ai transition-all" style={{ width: `${Math.round(progress * 100)}%` }} />
              </div>
            )}
            <Button variant="ai" className="w-full" loading={busy === 'merge'} onClick={doMerge}>
              {busy === 'merge' ? `กำลังรวม ${Math.round(progress * 100)}%` : 'รวมเป็น .mp4 เดียว'}
            </Button>
          </Card>
        </div>
      )}

      <p className="mt-6 flex items-start gap-2 rounded-md bg-bg-subtle p-3 text-xs text-text-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        ไฟล์ทั้งหมดประมวลผลในเครื่องคุณเอง (ไม่อัปขึ้นเซิร์ฟเวอร์) ปลอดภัย · ถ้าจะตัดต่อละเอียดแนะนำใช้ “แพ็กเกจจัดเรียง” แล้วไปต่อใน CapCut
      </p>
    </div>
  );
}

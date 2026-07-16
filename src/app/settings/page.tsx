'use client';

import { useEffect, useState } from 'react';
import { KeyRound, Cpu, Mic, UserSquare2, Building2, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { useApp } from '@/lib/store';
import { PROVIDERS } from '@/lib/llm';
import type { ProviderId } from '@/lib/types';
import { Card, Field, Input, Select, Label, Badge, Button, Alert } from '@/components/ui';
import { VoicePicker } from '@/components/VoicePicker';

export default function SettingsPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { settings, setSettings, setKey, setModel } = useApp();
  const [show, setShow] = useState<Record<string, boolean>>({});

  if (!mounted) return <div className="container-page py-16 text-text-muted">กำลังโหลด…</div>;

  const providerIds = Object.keys(PROVIDERS) as ProviderId[];

  return (
    <div className="container-page max-w-3xl py-10">
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold">ตั้งค่า</h1>
        <p className="mt-1 text-text-secondary">API key จัดเก็บในเบราว์เซอร์ของคุณ (localStorage) และส่งผ่านเซิร์ฟเวอร์ของแอปเฉพาะเมื่อเรียกผู้ให้บริการ AI — ไม่บันทึกลงฐานข้อมูล</p>
      </div>

      {/* เลือก provider */}
      <Card className="mb-6 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Cpu className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-lg font-bold">สมอง AI ที่ใช้ (3 เอเจนต์)</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          {providerIds.map((id) => {
            const active = settings.activeProvider === id;
            const ready = id === 'local' || id === 'puter' ? true : Boolean(settings.keys[id]);
            return (
              <button
                key={id}
                onClick={() => setSettings({ activeProvider: id })}
                className={`rounded-md border p-4 text-left transition-all ${
                  active ? 'border-primary bg-primary-soft shadow-sm' : 'border-border hover:border-border-strong'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-text-primary">{PROVIDERS[id].label}</span>
                  <span className={`h-2.5 w-2.5 rounded-full ${ready ? 'bg-success' : 'bg-border-strong'}`} />
                </div>
                <span className="text-xs text-text-muted">{id === 'puter' ? 'ฟรี ไม่ต้องตั้งค่า' : id === 'local' ? 'ฟรี ไม่มีโควตา' : ready ? 'พร้อมใช้' : 'ยังไม่มี key'}</span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* keys + model ของแต่ละ provider */}
      <Card className="mb-6 p-6">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-lg font-bold">API Key & โมเดล</h2>
        </div>
        <div className="space-y-5">
          {providerIds.map((id) => {
            const p = PROVIDERS[id];
            return (
              <div key={id} className="rounded-md border border-border p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="font-semibold">{p.label}</span>
                  {settings.activeProvider === id && <Badge tone="primary">กำลังใช้</Badge>}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {id === 'puter' ? (
                    <Field label="API Key" hint={p.keyHint}>
                      <div className="flex h-[46px] items-center rounded-sm border border-primary/30 bg-primary-soft/40 px-3.5 text-sm font-medium text-primary">
                        ✓ ไม่ต้องใช้ key — ใช้ได้เลย
                      </div>
                    </Field>
                  ) : id === 'local' ? (
                    <Field label="Base URL" hint={p.keyHint}>
                      <Input
                        value={settings.localBaseUrl}
                        onChange={(e) => setSettings({ localBaseUrl: e.target.value })}
                        placeholder="http://localhost:11434/v1"
                        autoComplete="off"
                      />
                    </Field>
                  ) : (
                    <Field label="API Key" hint={p.keyHint}>
                      <div className="relative">
                        <Input
                          type={show[id] ? 'text' : 'password'}
                          value={settings.keys[id]}
                          onChange={(e) => setKey(id, e.target.value)}
                          placeholder="วาง API key ที่นี่"
                          className="pr-10"
                          autoComplete="off"
                        />
                        <button
                          type="button"
                          onClick={() => setShow((s) => ({ ...s, [id]: !s[id] }))}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary"
                        >
                          {show[id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </Field>
                  )}
                  <Field label="โมเดล">
                    <Select value={settings.models[id]} onChange={(e) => setModel(id, e.target.value)}>
                      {p.models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                      {!p.models.includes(settings.models[id]) && <option value={settings.models[id]}>{settings.models[id]}</option>}
                    </Select>
                  </Field>
                </div>
                <a href={p.keyUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-xs text-accent hover:underline">
                  {id === 'local' ? 'ดาวน์โหลด Ollama' : id === 'puter' ? 'เกี่ยวกับ Puter (ฟรี)' : 'ขอ API key'} <ExternalLink className="h-3 w-3" />
                </a>
                {id === 'puter' && (
                  <div className="mt-3 rounded-md bg-primary-soft/40 p-3 text-xs leading-relaxed text-text-secondary">
                    <p className="mb-1 font-semibold text-text-primary">⚡ โหมดฟรี — เริ่มใช้ได้ทันที (แนะนำสำหรับเครื่องสเปคต่ำ)</p>
                    <p>AI ทำงานบนคลาวด์ของ Puter ฟรี ไม่ต้องสมัคร ไม่ต้องใส่ key และไม่กินทรัพยากรเครื่อง</p>
                    <p>ต้องมีอินเทอร์เน็ต · ครั้งแรกอาจเด้งหน้าต่าง Puter ให้ยืนยันสั้นๆ แล้วใช้ฟรีต่อได้เลย</p>
                    <p className="mt-1 text-text-muted">เลือกรุ่นในช่อง “โมเดล” ได้: gpt-4o-mini (เร็ว) · gpt-4o/claude (ไทยดีกว่า)</p>
                  </div>
                )}
                {id === 'local' && (
                  <div className="mt-3 rounded-md bg-bg-subtle p-3 text-xs leading-relaxed text-text-secondary">
                    <p className="mb-1 font-semibold text-text-primary">🖥️ ตั้งครั้งเดียว — รัน AI ฟรีบนเครื่องตัวเอง (ไม่มีโควตา)</p>
                    <p>1) โหลด <b>Ollama</b> จากลิงก์บน → ติดตั้ง</p>
                    <p>
                      2) เปิด Command Prompt พิมพ์: <code className="rounded bg-surface-muted px-1">ollama pull {settings.models.local || 'qwen2.5:7b'}</code> (โหลดรุ่น AI ครั้งเดียว)
                    </p>
                    <p>3) Ollama จะรันเองที่ <code className="rounded bg-surface-muted px-1">localhost:11434</code> — เลือก provider นี้แล้วใช้ได้เลย</p>
                    <p className="mt-1 text-text-muted">รุ่นใหญ่ขึ้น (เช่น qwen2.5:14b) ภาษาไทยดีกว่า แต่ต้องการ RAM/การ์ดจอแรงขึ้น</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* TTS */}
      <Card className="mb-6 p-6">
        <div className="mb-4 flex items-center gap-2">
          <Mic className="h-5 w-5 text-secondary" />
          <h2 className="font-heading text-lg font-bold">เสียงพากย์ไทย (TTS)</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="บริการเสียง">
            <Select value={settings.ttsProvider} onChange={(e) => setSettings({ ttsProvider: e.target.value as any })}>
              <option value="browser">เบราว์เซอร์ (ฟรี ไม่ต้องมี key — เล่นพรีวิวได้)</option>
              <option value="elevenlabs">ElevenLabs (ได้ไฟล์เสียง .mp3)</option>
              <option value="google">Google Cloud TTS (ได้ไฟล์เสียง .mp3)</option>
            </Select>
          </Field>
          <Field label="Voice ID (ถ้ามี)" hint="เว้นว่างได้ ระบบใช้เสียงเริ่มต้น">
            <Input value={settings.ttsVoiceId} onChange={(e) => setSettings({ ttsVoiceId: e.target.value })} placeholder="เช่น th-TH-Neural2-C" />
          </Field>
          {settings.ttsProvider !== 'browser' && (
            <div className="sm:col-span-2">
              <Field label="API Key ของบริการเสียง">
                <Input type="password" value={settings.ttsKey} onChange={(e) => setSettings({ ttsKey: e.target.value })} placeholder="วาง key" autoComplete="off" />
              </Field>
            </div>
          )}
        </div>

        {/* ฟังเสียงแต่ละ Voice ID แล้วกดเลือก */}
        <VoicePicker />
      </Card>

      {/* Avatar */}
      <Card className="mb-6 p-6">
        <div className="mb-4 flex items-center gap-2">
          <UserSquare2 className="h-5 w-5 text-ai" />
          <h2 className="font-heading text-lg font-bold">ตัวละครพูด (อวตาร)</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="โหมดตัวละครพูด">
            <Select value={settings.avatarProvider} onChange={(e) => setSettings({ avatarProvider: e.target.value as any })}>
              <option value="prompt-only">Prompt-only — สร้าง prompt พร้อมผลิตไปเข้า Google Flow เอง (แนะนำ)</option>
              <option value="heygen">HeyGen — เตรียม Prompt/บทให้ (ยังไม่เรนเดอร์อัตโนมัติ)</option>
              <option value="did">D-ID — เตรียม Prompt/บทให้ (ยังไม่เรนเดอร์อัตโนมัติ)</option>
            </Select>
          </Field>
          {settings.avatarProvider !== 'prompt-only' && (
            <Field label="API Key อวตาร">
              <Input type="password" value={settings.avatarKey} onChange={(e) => setSettings({ avatarKey: e.target.value })} placeholder="วาง key" autoComplete="off" />
            </Field>
          )}
        </div>
        <Alert tone="info">
          <span className="font-medium">แนะนำ:</span> เริ่มที่โหมด Prompt-only — เว็บจะสร้าง prompt ตัวละครพูด + บทพากย์ พร้อมก๊อปไปวางใน Google Flow ได้ทันที
        </Alert>
      </Card>

      {/* Brand defaults */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h2 className="font-heading text-lg font-bold">ค่าเริ่มต้นแบรนด์</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="ชื่อช่อง/แบรนด์">
            <Input value={settings.brandName} onChange={(e) => setSettings({ brandName: e.target.value })} />
          </Field>
          <Field label="สไตล์ภาพเริ่มต้น">
            <Input value={settings.visualStyle} onChange={(e) => setSettings({ visualStyle: e.target.value })} />
          </Field>
        </div>
        <div className="mt-5">
          <Button variant="primary" onClick={() => alert('บันทึกอัตโนมัติแล้ว ✓ ทุกอย่างเก็บในเครื่องคุณ')}>บันทึก (อัตโนมัติอยู่แล้ว)</Button>
        </div>
      </Card>
    </div>
  );
}

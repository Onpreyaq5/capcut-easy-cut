// ตรวจว่ารันอยู่ที่ไหน — เครื่องผู้ใช้ (Windows มี CapCut/whisper) หรือคลาวด์ (Render/Linux)
// EASYCUT_FORCE_CLOUD=1 ไว้จำลองโหมดคลาวด์ตอนเทสในเครื่อง
export function isCloud(): boolean {
  return process.platform !== 'win32' || process.env.EASYCUT_FORCE_CLOUD === '1';
}

export interface Capabilities {
  capcut: boolean;       // ส่งเข้า CapCut ได้ (ต้องรันบนเครื่อง Windows ที่มี CapCut)
  localEngine: boolean;  // ตัด dead air + whisper ในเครื่อง (โหมดตัดออโต้เต็มรูปแบบ)
  groq: boolean;         // ถอดเสียงผ่านคลาวด์ (Groq)
  render: boolean;       // เรนเดอร์วิดีโอฝังซับ (ffmpeg)
}

export function capabilities(): Capabilities {
  const cloud = isCloud();
  return {
    capcut: !cloud,
    localEngine: !cloud,
    groq: !!process.env.GROQ_API_KEY,
    render: true, // ffmpeg มีทั้งในเครื่อง (auto-discovery) และใน Docker
  };
}

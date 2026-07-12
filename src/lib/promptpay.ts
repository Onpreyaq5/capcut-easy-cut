// สร้าง PromptPay QR (มาตรฐาน EMVCo ของไทย) — ลูกค้าสแกนจ่ายเข้าบัญชีพร้อมเพย์ของเจ้าของเว็บ
// เบอร์/ชื่อพร้อมเพย์ตั้งใน .env.local (EASYCUT_PROMPTPAY_ID, EASYCUT_PROMPTPAY_NAME) — ไม่ commit ขึ้น repo
function tlv(tag: string, value: string): string {
  const len = value.length.toString().padStart(2, '0');
  return `${tag}${len}${value}`;
}

// CRC16-CCITT (poly 0x1021, init 0xFFFF) ตามสเปก EMVCo
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

// เบอร์มือถือ 10 หลัก -> 0066 + 9 หลัก (13 ตัว) | เลขบัตร ปชช. 13 หลัก -> ใช้ tag 02
function formatTarget(id: string): { tag: '01' | '02'; value: string } {
  const digits = (id || '').replace(/\D/g, '');
  if (digits.length >= 13) return { tag: '02', value: digits.slice(0, 13) };
  // เบอร์: ตัด 0 นำหน้าออก แล้วเติม 0066 -> 13 หลัก
  const local = digits.replace(/^0/, '');
  return { tag: '01', value: ('0066' + local).padStart(13, '0') };
}

export function promptPayPayload(id: string, amount?: number): string {
  const t = formatTarget(id);
  const merchant = tlv('00', 'A000000677010111') + tlv(t.tag, t.value);
  let payload =
    tlv('00', '01') + // Payload Format Indicator
    tlv('01', amount && amount > 0 ? '12' : '11') + // 12=dynamic(มีจำนวนเงิน) 11=static
    tlv('29', merchant) +
    tlv('53', '764') + // สกุลเงิน THB
    (amount && amount > 0 ? tlv('54', amount.toFixed(2)) : '') +
    tlv('58', 'TH');
  payload += '6304'; // tag CRC + len ก่อนคำนวณ
  return payload + crc16(payload);
}

export function promptPayConfigured(): boolean {
  return !!process.env.EASYCUT_PROMPTPAY_ID;
}

export function promptPayInfo() {
  return {
    id: process.env.EASYCUT_PROMPTPAY_ID || '',
    name: process.env.EASYCUT_PROMPTPAY_NAME || '',
  };
}

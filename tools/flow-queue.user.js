// ==UserScript==
// @name         ธัญกิจ · Flow Queue (ป้อน prompt เข้า Google Flow ทีละช็อต)
// @namespace    thanyakij.ai.web
// @version      1.0
// @description  วางลิสต์ prompt (บล็อกละช็อต คั่นด้วยบรรทัดว่าง) แล้วกดวางทีละช็อตเข้า Google Flow — ไม่ใช้ API
// @match        https://labs.google/fx/tools/flow*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/*
  วิธีใช้ (สั้นๆ):
  1) ติดตั้งส่วนเสริม Tampermonkey (หรือ Violentmonkey) ในเบราว์เซอร์
  2) เพิ่มสคริปต์นี้ (Dashboard > Create a new script > วางทั้งไฟล์นี้ > Save)
  3) เปิด Google Flow จะเห็นกล่อง "ธัญกิจ · Flow Queue" มุมขวาล่าง
  4) ในเว็บธัญกิจ กด "คัดลอก Bulk Prompts" แล้ววางในกล่อง > กด "โหลดคิว"
  5) ตั้งค่า Flow (Video · Omni Flash · 9:16/16:9 · 10s) เองครั้งเดียว
  6) กด "วางช็อตถัดไป ▶" ทีละช็อต (หรือเปิด auto-submit ให้กด Generate ให้)

  หมายเหตุ: นี่คือการช่วยพิมพ์แทนคุณบนหน้าเว็บ Flow ของบัญชีคุณเอง ไม่ได้ใช้ API
  การทำงานอัตโนมัติบนเว็บของผู้ให้บริการอาจขัด ToS ใช้ด้วยความรับผิดชอบของคุณเอง
*/

(function () {
  'use strict';

  let queue = [];
  let idx = 0;

  // ---------- หา input ของ Flow ----------
  function findPromptField() {
    const cands = [
      ...document.querySelectorAll('textarea'),
      ...document.querySelectorAll('[contenteditable="true"]'),
    ].filter((el) => el.offsetParent !== null); // มองเห็นได้
    if (!cands.length) return null;
    // เลือกอันที่ placeholder/area สื่อว่าเป็นช่อง prompt หรืออันที่ใหญ่สุด
    const byHint = cands.find((el) => /create|want|prompt|describe|พิมพ์|สร้าง/i.test((el.getAttribute('placeholder') || '') + (el.getAttribute('aria-label') || '')));
    if (byHint) return byHint;
    return cands.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
  }

  // ตั้งค่าแบบ React-friendly
  function setValue(el, text) {
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
      setter.call(el, text);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      el.focus();
      el.textContent = text;
      el.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
    }
  }

  function findGenerateButton(field) {
    // หา submit/arrow button ใกล้ๆ ช่อง prompt
    const all = [...document.querySelectorAll('button')].filter((b) => !b.disabled && b.offsetParent !== null);
    const byLabel = all.find((b) => /generate|create|send|สร้าง/i.test((b.getAttribute('aria-label') || '') + b.textContent));
    if (byLabel) return byLabel;
    // ปุ่มที่อยู่ใกล้ field มากที่สุด (เช่นปุ่มลูกศร)
    if (field) {
      const fr = field.getBoundingClientRect();
      let best = null, bestD = 1e9;
      for (const b of all) {
        const r = b.getBoundingClientRect();
        const d = Math.hypot(r.left - fr.right, r.top - fr.top);
        if (d < bestD && r.width < 80) { bestD = d; best = b; }
      }
      if (bestD < 200) return best;
    }
    return null;
  }

  function pasteNext(autoSubmit) {
    if (idx >= queue.length) { setStatus('ครบทุกช็อตแล้ว ✓'); return; }
    const field = findPromptField();
    if (!field) { setStatus('หาช่อง prompt ไม่เจอ — คลิกที่ช่องสร้างของ Flow ก่อน'); return; }
    setValue(field, queue[idx]);
    setStatus(`วางช็อต ${idx + 1}/${queue.length} แล้ว` + (autoSubmit ? ' · กำลังกด Generate…' : ' · กด Generate ใน Flow เองได้เลย'));
    idx++;
    if (autoSubmit) {
      setTimeout(() => {
        const btn = findGenerateButton(field);
        if (btn) btn.click();
        else setStatus('กด Generate เองนะ (หาปุ่มอัตโนมัติไม่เจอ)');
      }, 400);
    }
    updateCounter();
  }

  // ---------- UI ----------
  let statusEl, counterEl;
  function setStatus(t) { if (statusEl) statusEl.textContent = t; }
  function updateCounter() { if (counterEl) counterEl.textContent = `${idx}/${queue.length}`; }

  function buildPanel() {
    const box = document.createElement('div');
    box.style.cssText =
      'position:fixed;right:16px;bottom:16px;z-index:999999;width:300px;background:#1a2316;color:#ecf1e4;' +
      'border:1px solid #3c4d31;border-radius:14px;padding:12px;font-family:system-ui,sans-serif;font-size:13px;box-shadow:0 12px 32px rgba(0,0,0,.4)';
    box.innerHTML =
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
      '<b style="color:#5fc174">🌾 ธัญกิจ · Flow Queue</b><span id="tqc" style="font-size:12px;color:#8c977c">0/0</span></div>' +
      '<textarea id="tqp" placeholder="วาง Bulk Prompts ที่คัดลอกจากเว็บธัญกิจ (บล็อกละช็อต)" ' +
      'style="width:100%;height:70px;box-sizing:border-box;background:#10160e;color:#ecf1e4;border:1px solid #2c3a24;border-radius:8px;padding:6px;font-size:12px;resize:vertical"></textarea>' +
      '<div style="display:flex;gap:6px;margin-top:8px">' +
      '<button id="tqload" style="flex:1;background:#212c1b;color:#c0cbb2;border:1px solid #3c4d31;border-radius:8px;padding:7px;cursor:pointer">โหลดคิว</button>' +
      '<button id="tqnext" style="flex:2;background:#5fc174;color:#08210e;border:none;border-radius:8px;padding:7px;font-weight:700;cursor:pointer">วางช็อตถัดไป ▶</button>' +
      '</div>' +
      '<label style="display:flex;align-items:center;gap:6px;margin-top:8px;color:#c0cbb2"><input type="checkbox" id="tqauto"> กด Generate อัตโนมัติด้วย</label>' +
      '<div style="display:flex;gap:6px;margin-top:6px">' +
      '<button id="tqreset" style="flex:1;background:transparent;color:#8c977c;border:1px solid #2c3a24;border-radius:8px;padding:5px;cursor:pointer;font-size:12px">เริ่มใหม่</button></div>' +
      '<div id="tqs" style="margin-top:8px;color:#8c977c;font-size:12px;min-height:16px"></div>';
    document.body.appendChild(box);

    statusEl = box.querySelector('#tqs');
    counterEl = box.querySelector('#tqc');
    box.querySelector('#tqload').onclick = () => {
      const raw = box.querySelector('#tqp').value.trim();
      queue = raw.split(/\n\s*\n/).map((s) => s.replace(/^ช็อต\s*\d+\s*\|\s*/, '').trim()).filter(Boolean);
      idx = 0;
      updateCounter();
      setStatus(`โหลด ${queue.length} ช็อตแล้ว — ตั้งค่า Flow แล้วกดวางช็อตถัดไป`);
    };
    box.querySelector('#tqnext').onclick = () => pasteNext(box.querySelector('#tqauto').checked);
    box.querySelector('#tqreset').onclick = () => { idx = 0; updateCounter(); setStatus('รีเซ็ตกลับช็อตแรก'); };
  }

  const t = setInterval(() => {
    if (document.body) { clearInterval(t); buildPanel(); }
  }, 500);
})();

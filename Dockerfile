# CAPCUT Easy CUT — Docker image สำหรับ deploy บน Render (Node + ffmpeg + Python)
# บนเว็บ: ถอดเสียงใช้ Groq (ไม่ต้อง torch/whisper), เรนเดอร์วิดีโอใช้ ffmpeg, Python สำหรับ render_video.py
FROM node:20-slim

# ffmpeg (เรนเดอร์/ฝังซับ) + python3 (สคริปต์ engine) + ฟอนต์ไทยระบบ + Pillow (เผื่อฟีเจอร์ที่ใช้ PIL)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 python3-pil fonts-thai-tlwg ca-certificates \
    && ln -sf /usr/bin/python3 /usr/bin/python \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# ติดตั้ง node deps (แคชเลเยอร์)
COPY package.json package-lock.json* ./
RUN npm ci

# โค้ดทั้งหมด + build
COPY . .
RUN npm run build

ENV NODE_ENV=production
ENV EASYCUT_PYTHON=python3
ENV EASYCUT_FFMPEG=ffmpeg
ENV PORT=10000
EXPOSE 10000

# next start อ่านพอร์ตจาก $PORT (Render กำหนดให้อัตโนมัติ)
CMD ["npm", "start"]

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // อนุญาตให้ body ของ API route ใหญ่ขึ้น (รองรับการแนบรูป/ไฟล์อ้างอิงแบบ base64)
  experimental: {
    serverActions: {
      bodySizeLimit: '15mb',
    },
  },
};

export default nextConfig;

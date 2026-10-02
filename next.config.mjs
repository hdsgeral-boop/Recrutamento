/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // googleapis e nodemailer são pacotes Node puros: não devem ser empacotados
  // pelo bundler do servidor, senão rebentam no build da Vercel.
  experimental: {
    serverComponentsExternalPackages: ["googleapis", "nodemailer", "exceljs"],
  },
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;

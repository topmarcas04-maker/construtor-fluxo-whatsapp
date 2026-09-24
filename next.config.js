/** @type {import('next').NextConfig} */
const nextConfig = {
  // ffmpeg (compressão dos vídeos) roda direto do node_modules
  serverExternalPackages: ["ffmpeg-static"],
  experimental: {
    // Envio de fotos/áudios pelo painel (arquivo de até 8 MB vira ~11 MB em base64)
    proxyClientMaxBodySize: "16mb",
  },
};

module.exports = nextConfig;

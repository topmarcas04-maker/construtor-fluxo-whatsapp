/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Envio de fotos/áudios pelo painel (arquivo de até 8 MB vira ~11 MB em base64)
    proxyClientMaxBodySize: "16mb",
  },
};

module.exports = nextConfig;

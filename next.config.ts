import type { NextConfig } from "next";

// Bypass SSL verification on Windows dev only (some local dev setups fail TLS).
// In production (Linux/Docker), keep TLS strict — do not set this var.
if (process.platform === 'win32' && process.env.NODE_ENV !== 'production') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
}

const nextConfig: NextConfig = {
  // Builds a self-contained server bundle, ideal for Docker/EasyPanel deploys
  output: 'standalone',

  // Esconde "X-Powered-By: Next.js" (evita info disclosure)
  poweredByHeader: false,

  // Security headers padrão pra todas as rotas
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Impede outros sites de carregarem o app em iframe (anti-clickjacking)
          { key: 'X-Frame-Options', value: 'DENY' },
          // Impede browsers de "adivinhar" o MIME type (anti-XSS)
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Não envia o referer pra outros domínios (privacidade)
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Restringe APIs do browser (camera, mic, geo) pra ninguém
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          // HSTS: força HTTPS por 2 anos (só faz efeito em produção HTTPS)
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        ],
      },
    ]
  },
};

export default nextConfig;

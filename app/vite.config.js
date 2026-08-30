import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  // O site é hospedado na RAIZ do Firebase Hosting (databaserpg-5595b.web.app), não num
  // subcaminho como GitHub Pages — "base" tem que ser "/", senão os arquivos JS/manifest são
  // referenciados em /rpgReferencias/... (que não existe no servidor) e o rewrite de SPA do
  // Firebase (firebase.json) devolve index.html no lugar, quebrando o carregamento dos módulos.
  base: '/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate', 
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'masked-icon.svg'],
      manifest: {
        name: 'Multiverso RPG Anime System',
        short_name: 'RPG System',
        description: 'Painel do Mestre e Fichas de Personagem Interativas',
        theme_color: '#050505',
        background_color: '#050505',
        display: 'standalone', 
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable'
          }
        ]
      }
    })
  ],
  test: {
    environment: 'jsdom',
  }
});
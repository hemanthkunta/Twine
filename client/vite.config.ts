import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    plugins: [react(), tailwindcss()],
    server: {
        port: 3000,
        proxy: {
            '/api': {
                target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000',
                changeOrigin: true,
            },
            '/uploads': {
                target: process.env.VITE_PROXY_TARGET || 'http://localhost:4000',
                changeOrigin: true,
            },
            '/ws': {
                target: (process.env.VITE_PROXY_TARGET || 'http://localhost:4000').replace(/^http/, 'ws'),
                ws: true,
                changeOrigin: true,
            },
        },
    },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite'; // 1. 引入刚才安装的插件
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss() // 2. 把 Tailwind 编译器加到 Vite 里面
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    allowedHosts: ['*']
  }
});
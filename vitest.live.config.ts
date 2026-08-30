import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

/**
 * 真实后端（live）测试配置：VITE_USE_MOCK=false。
 *
 * 仅用于标准1 生产菜单真实响应链测试（tool-production-menu-chain-live.spec.ts）：
 * request 层 VITE_USE_MOCK=false → 走真实 axios → 直连 http://localhost:8080/api。
 * 需先启动真实后端（dev profile + SW_CIPHER_KEY）。
 */
export default defineConfig({
  plugins: [
    {
      name: 'sw-web:mock-css',
      enforce: 'pre',
      resolveId(id) {
        if (id.includes('element-plus') && id.includes('/style/css')) return '\0mock-css:' + id
        if (id.endsWith('.css') && !id.includes('?')) return '\0mock-css:' + id
      },
      load(id) {
        if (id.startsWith('\0mock-css:')) return ''
      },
    },
    vue(),
    AutoImport({
      resolvers: [ElementPlusResolver({ importStyle: false })],
      dts: 'src/types/auto-imports.d.ts',
    }),
    Components({
      resolvers: [ElementPlusResolver({ importStyle: false })],
      dts: 'src/types/components.d.ts',
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // jsdom 下 axios(XHR) 直连绝对地址受 CORS 拦截；走相对路径 /api 由 vitest
    // 内置 server 代理到真实后端，绕过 CORS（生产同构：vite dev 代理同一行为）。
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    css: false,
    // 真实后端：关闭 mock 分发，request 走相对 /api 经 server proxy → 8080
    env: {
      VITE_USE_MOCK: 'false',
      VITE_API_BASE_URL: '/api',
    },
    // 真实 HTTP 请求 + 组件渲染，放宽默认超时
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
})

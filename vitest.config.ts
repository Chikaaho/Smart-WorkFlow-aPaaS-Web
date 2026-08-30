import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'

export default defineConfig({
  plugins: [
    // 拦截 CSS 文件请求，返回空模块——测试不需要样式。
    // EP 的 CSS 通过包子路径导入（如 element-plus/es/.../style/css），
    // resolveId 收到的是裸 specifier 而非 .css 路径，需同时匹配两者。
    {
      name: 'sw-web:mock-css',
      enforce: 'pre',
      resolveId(id) {
        // EP 包子路径导入（element-plus/es/.../style/css）
        if (id.includes('element-plus') && id.includes('/style/css')) return '\0mock-css:' + id
        // 直接的 .css 文件路径（不含 ? 的才是真实文件，避免拦截 .vue SFC style 子请求）
        if (id.endsWith('.css') && !id.includes('?')) return '\0mock-css:' + id
      },
      load(id) {
        if (id.startsWith('\0mock-css:')) return ''
      },
    },
    vue(),
    // 测试环境同样按需自动注册 Element Plus 组件，使布局/侧边栏组件可直接挂载渲染。
    // importStyle: false —— 测试不需要真实样式，关掉可避免 node_modules 内 .css 被 Node 直接加载报错。
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
  test: {
    environment: 'jsdom',
    globals: true,
    css: false,
    // 激活 mock dispatch 链：API 函数 → request → dispatchMock → handlers.ts
    env: {
      VITE_USE_MOCK: 'true',
    },
  },
})

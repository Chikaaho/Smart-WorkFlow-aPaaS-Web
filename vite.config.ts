import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Plugin, type PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import Components from 'unplugin-vue-components/vite'
import { ElementPlusResolver } from 'unplugin-vue-components/resolvers'
import { CSP_POLICY } from './src/security/csp.ts'

// Element Plus 按需自动导入：组件经 ElementPlusResolver 全局注册、ElMessage 等 API 自动引入，
// 业务页无需手写 `import { ElXxx } from 'element-plus'`——天然绕开 modules 直引三方库的边界限制。
// 生成的 dts（src/types/auto-imports.d.ts / components.d.ts）为产物，已纳入 eslint/prettier 忽略。
const elementPlusAutoImport = (): PluginOption[] => [
  AutoImport({
    resolvers: [ElementPlusResolver({ importStyle: 'css' })],
    dts: 'src/types/auto-imports.d.ts',
  }),
  Components({
    resolvers: [ElementPlusResolver({ importStyle: 'css' })],
    dts: 'src/types/components.d.ts',
  }),
]

function cspMetaPlugin(): Plugin {
  return {
    name: 'sw-web:csp-meta',
    transformIndexHtml(html) {
      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP_POLICY}" />`,
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    base: env.VITE_APP_BASE_URL || '/',
    plugins: [vue(), ...elementPlusAutoImport(), cspMetaPlugin()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      proxy: {
        '/api': {
          target: env.VITE_PROXY_TARGET || 'http://localhost:8080',
          changeOrigin: true,
        },
      },
      headers: {
        'Content-Security-Policy': CSP_POLICY,
      },
    },
    preview: {
      headers: {
        'Content-Security-Policy': CSP_POLICY,
      },
    },
  }
})

import { createApp } from 'vue'
// Element Plus 全量 CSS，确保 API 调用组件（ElMessageBox、ElMessage、ElNotification 等）样式可用。
import 'element-plus/dist/index.css'
// 品牌色单源主题，覆盖 Element Plus 默认 token，须在 Element Plus 样式之后导入。
import './styles/tokens.css'

import App from './App.vue'
import { pinia } from './stores'
import { router } from './router'
import { i18n } from './locales'
import { permissionDirective } from './foundation/permission'

async function bootstrap(): Promise<void> {
  // 仅开发构建按显式环境变量动态载入，生产构建不生成该入口或 debug 模块。
  if (import.meta.env.DEV && import.meta.env.VITE_DEBUG_AUTH_ENABLED === 'true') {
    const { initializeDevDebugAuth } = await import('./foundation/auth/dev-debug')
    initializeDevDebugAuth()
  }

  const app = createApp(App)

  app.use(pinia)
  app.use(router)
  app.use(i18n)
  app.directive('perm', permissionDirective)

  app.mount('#app')
}

void bootstrap()

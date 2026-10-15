import { createApp, watch } from 'vue'
// Element Plus 全量 CSS，确保 API 调用组件（ElMessageBox、ElMessage、ElNotification 等）样式可用。
import 'element-plus/dist/index.css'
// 品牌色单源主题，覆盖 Element Plus 默认 token，须在 Element Plus 样式之后导入。
import './styles/tokens.css'

import App from './App.vue'
import { pinia } from './stores'
import { router } from './router'
import { applyDocumentTitle } from './router/page-title'
import { i18n } from './locales'
import { permissionDirective } from './foundation/permission'
import { installCompositionEscapeGuard } from './foundation/keyboard/composition-escape-guard'

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

  // BF20261013-017：全局弹窗 ESC 关闭的输入法保护（组合态 ESC 只取消候选、不关弹窗）
  installCompositionEscapeGuard()

  // BF20261013-047：页签标题 = 当前页面所属一级页签功能（路由切换与语言切换同步刷新）
  router.afterEach((to) => applyDocumentTitle(to))
  watch(i18n.global.locale, () => applyDocumentTitle(router.currentRoute.value))
  applyDocumentTitle(router.currentRoute.value)

  app.mount('#app')
}

void bootstrap()

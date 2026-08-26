import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { authGuard, clearDynamicRoutes, ROOT_LAYOUT_NAME } from './guard'
import { setUnauthorizedHandler, setRefreshHandler } from '@/foundation/request'
import { findFirstLeafPath } from '@/foundation/menu'
import { useMenuStore } from '@/stores/menu'
import { refresh } from '@/foundation/auth'

/**
 * 解析登录后默认落地的第一个可访问叶子。
 * 从菜单 store（已由守卫装载）取整棵过滤后菜单树，DFS 找首个可落地 MENU 节点；
 * 取不到时兜底 /404，避免空菜单用户卡在空白根路由。
 * 复用的 findFirstLeafPath 与目录 redirect 逻辑同源（单一实现）。
 */
export function resolveDefaultRedirect(): string {
  const menu = useMenuStore().menu
  const firstLeaf = findFirstLeafPath(menu)
  return firstLeaf ?? '/404'
}

// 只保留常量路由：登录、错误页、根布局。7 个业务模块的路由由 router/guard.ts
// 在会话确立后经 loadMenu() 占位载荷动态 addRoute，不在此静态聚合（决策文档 v2 §4）。
export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: ROOT_LAYOUT_NAME,
    component: () => import('@/layouts/BasicLayout.vue'),
    // 默认落地页 redirect 不在路由定义层处理：Vue Router 的 redirect 在 beforeEach 之前
    // 解析，此时菜单 store 为空（冷启动未登录），必然回退 /404，导致用户看不到登录页。
    // 实际落地逻辑移入 router/guard.ts 在动态路由构建完成后执行。
    // 参数化的低代码表单页作为静态子路由挂在根布局下,
    // 直达 URL 可进,受 authGuard 保护,无需纳入后端菜单树。
    children: [
      {
        path: 'form/form-designer/:id?',
        name: 'form-designer',
        component: () => import('@/modules/form/views/FormDesigner.vue'),
        meta: { title: '表单设计器' },
      },
      {
        path: 'form/form-render/:formKey',
        name: 'form-render',
        component: () => import('@/modules/form/views/FormRender.vue'),
        meta: { title: '表单渲染' },
      },
      {
        path: 'form/form-data/:formKey',
        name: 'form-data',
        component: () => import('@/modules/form/views/FormData.vue'),
        meta: { title: '表单数据' },
      },
      {
        path: 'form/form-def-list',
        name: 'form-def-list',
        component: () => import('@/modules/form/views/FormDefList.vue'),
        meta: { title: '表单管理' },
      },
      {
        path: 'agent/graph-designer/:id',
        name: 'agent-graph-designer',
        component: () => import('@/modules/agent/views/GraphDesigner.vue'),
        meta: { title: '图设计器' },
      },
      {
        path: 'workflow/task/:taskId',
        name: 'TaskDetail',
        component: () => import('@/modules/workflow/views/TaskDetail.vue'),
        meta: { title: '任务详情' },
      },
      {
        path: 'workflow/processed',
        name: 'ProcessedList',
        component: () => import('@/modules/workflow/views/ProcessedList.vue'),
        meta: { title: '已办任务' },
      },
      {
        path: 'workflow/instances',
        name: 'ProcessInstanceList',
        component: () => import('@/modules/workflow/views/ProcessInstanceList.vue'),
        meta: { title: '流程监控' },
      },
      {
        path: 'agent/executions/list',
        name: 'agent-execution-list',
        component: () => import('@/modules/agent/views/ExecutionList.vue'),
        meta: { title: '执行历史' },
      },
      {
        path: 'agent/executions/detail/:executionId',
        name: 'agent-execution-detail',
        component: () => import('@/modules/agent/views/ExecutionDetail.vue'),
        meta: { title: '执行详情', authority: ['agent:model:view'] },
      },
      // M07-F04-02: 会话历史路由
      {
        path: 'agent/conversations/list',
        name: 'agent-conversation-list',
        component: () => import('@/modules/agent/views/ConversationList.vue'),
        meta: { title: '会话历史', authority: ['agent:model:view'] },
      },
      {
        path: 'agent/conversations/detail/:sessionId',
        name: 'agent-conversation-detail',
        component: () => import('@/modules/agent/views/ConversationDetail.vue'),
        meta: { title: '会话消息', authority: ['agent:model:view'] },
      },
      {
        path: 'agent/debug/:sessionId',
        name: 'agent-debug-session',
        component: () => import('@/modules/agent/views/DebugSessionView.vue'),
        meta: { title: '单步调试', authority: ['agent:model:view'] },
      },
      {
        path: 'agent/tool',
        name: 'agent-tool-list',
        component: () => import('@/modules/agent/views/ToolList.vue'),
        meta: { title: '工具管理', authority: ['agent:tool:view'] },
      },
      {
        // 消息模板管理页（P36/M05-F02-01）：菜单树经 V38 seed（notify/templates），
        // 静态路由保证直达 URL 可进，authority 对齐 notify:template:view。
        path: 'notify/template',
        name: 'notify-template-list',
        component: () => import('@/modules/notify/views/NotifyTemplateList.vue'),
        meta: { title: '消息模板', authority: ['notify:template:view'] },
      },
    ],
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/LoginPage.vue'),
    meta: { public: true },
  },
  {
    path: '/403',
    name: 'forbidden',
    component: () => import('@/views/ErrorPage.vue'),
    meta: { public: true, errorCode: 403, title: '无权限访问' },
  },
  {
    path: '/404',
    name: 'not-found',
    component: () => import('@/views/ErrorPage.vue'),
    meta: { public: true, errorCode: 404, title: '页面不存在' },
  },
  {
    path: '/500',
    name: 'server-error',
    component: () => import('@/views/ErrorPage.vue'),
    meta: { public: true, errorCode: 500, title: '服务异常' },
  },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
})

router.beforeEach((to, from, next) => authGuard(router, to, from, next))

setUnauthorizedHandler((redirectPath) => {
  clearDynamicRoutes(router)
  router.push({
    path: '/login',
    query: redirectPath && redirectPath !== '/login' ? { redirect: redirectPath } : undefined,
  })
})

// 注入 refresh 函数供请求拦截器到期刷新使用（依赖反转，避免循环依赖）
setRefreshHandler(refresh)

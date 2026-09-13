import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { authGuard, clearDynamicRoutes, ROOT_LAYOUT_NAME } from './guard'
import { setUnauthorizedHandler, setRefreshHandler } from '@/foundation/request'
import { refresh } from '@/foundation/auth'

/**
 * 登录后默认落地工作台（v0.0.2 P54/P55：三类身份统一进入工作台）。
 * 工作台为常量路由，无需菜单授权；旧「菜单首叶」逻辑仅供目录 redirect 复用。
 */
export function resolveDefaultRedirect(): string {
  return '/workspace'
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
        // v0.0.2 P54：工作台 = 三类身份登录后的默认首页（个性化组件承载）。
        path: 'workspace',
        name: 'workspace',
        component: () => import('@/modules/workflow/views/WorkspaceHome.vue'),
        meta: { title: '工作台' },
      },
      {
        // v0.0.2 P4 流程中心（前台普通视角）：按分类/关键词浏览本人可发起事项。
        // 独立命名（-static 后缀）：菜单动态路由同名 addRoute 会按名替换静态路由
        // （历史深链失效根因），静态与动态路由名必须错开。
        path: 'workflow/catalog/:processKey?',
        name: 'process-catalog-static',
        component: () => import('@/modules/workflow/views/ProcessCatalog.vue'),
        meta: { title: '流程中心' },
      },
      {
        // v0.0.2 P4 流程中心后台管理（分类/事项归属/发布状态）。
        path: 'workflow/catalog-admin',
        name: 'process-catalog-admin',
        component: () => import('@/modules/workflow/views/ProcessCatalogAdmin.vue'),
        meta: { title: '事项管理', authority: ['workflow:catalog:manage'] },
      },
      {
        // v0.0.2 P4 个人办理：抄送我的（只读，不含审批操作权）。命名对齐 menu -static 规避同名替换。
        path: 'workflow/my-cc',
        name: 'my-cc-static',
        component: () => import('@/modules/workflow/views/MyCc.vue'),
        meta: { title: '抄送我的' },
      },
      {
        // P52：表单设计器工作台。路径与菜单种子（form/designer）同段，但带 :id 段且
        // 独立命名 —— 菜单动态路由（name=form-designer，path=form/designer）addRoute
        // 会按名替换同名的静态路由，历史上这正是 :id 深链失效的根因；工作台路由
        // 必须独立命名，避免被动态路由顶掉。
        path: 'form/designer/:id?',
        name: 'form-designer-workbench',
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
        meta: {
          title: '表单数据',
          authority: ['form:data:template', 'form:data:import', 'form:data:export'],
        },
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
        // I3 第一方流程设计器：统一节点能力端点构建面板与配置，ProcessGraph 单一图契约。
        path: 'workflow/defs/:defId/design',
        name: 'workflow-def-designer',
        component: () => import('@/modules/workflow/views/ProcessDesigner.vue'),
        meta: { title: '流程设计器', authority: ['workflow:def:design'] },
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
        // I4 §3.2 流程模板中心：复制后编辑并发布
        path: 'workflow/templates',
        name: 'TemplateCenter',
        component: () => import('@/modules/workflow/views/TemplateCenter.vue'),
        meta: { title: '流程模板中心' },
      },
      {
        // I4 §3.3 实例监控与受控干预（服务端权限+数据范围）
        path: 'workflow/monitor',
        name: 'InstanceMonitor',
        component: () => import('@/modules/workflow/views/InstanceMonitor.vue'),
        meta: { title: '实例监控干预' },
      },
      {
        // I4 §3.3 流程基础分析
        path: 'workflow/analytics',
        name: 'ProcessAnalytics',
        component: () => import('@/modules/workflow/views/ProcessAnalytics.vue'),
        meta: { title: '流程分析' },
      },
      {
        // I4 §3.5 批量审批
        path: 'workflow/batch-approval',
        name: 'BatchApproval',
        component: () => import('@/modules/workflow/views/BatchApproval.vue'),
        meta: { title: '批量审批' },
      },
      {
        // I4 §3.6 流程交接
        path: 'workflow/handover',
        name: 'TaskHandover',
        component: () => import('@/modules/workflow/views/TaskHandover.vue'),
        meta: { title: '流程交接' },
      },
      {
        // I4 §3.7 统一工作台（待办/已办/发起/草稿/抄送/消息入口）
        path: 'workflow/center',
        name: 'WorkflowCenter',
        component: () => import('@/modules/workflow/views/WorkflowCenter.vue'),
        meta: { title: '工作台' },
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
      {
        // 批量发送通知页：独立发送权限 notify:batch:send。
        path: 'notify/batch-send',
        name: 'notify-batch-send',
        component: () => import('@/modules/notify/views/NotifyBatchSend.vue'),
        meta: { title: '发送通知', authority: ['notify:batch:send'] },
      },
      {
        // v0.0.2 P3：通知发送记录（有权管理者），发送记录查询/失败重发/关联日志。
        path: 'notify/record',
        name: 'notify-record-list',
        component: () => import('@/modules/notify/views/NotifyRecordList.vue'),
        meta: { title: '发送记录', authority: ['notify:record:view'] },
      },
    ],
  },
  {
    // I2 移动 Web 表单入口：同一表单契约、同一服务端校验与权限，
    // 移动视口响应式重排（不删字段、不放宽校验）；不承担表单设计。
    // 顶层独立路由：不进桌面 BasicLayout（侧边栏/顶栏），375px 视口下单列满宽。
    path: '/m/form/:formKey',
    name: 'mobile-form-render',
    component: () => import('@/modules/form/views/MobileFormRender.vue'),
    meta: { title: '移动填报' },
  },
  {
    // I4 §3.7 移动端工作台（响应式 H5）：发起入口/待办办理/草稿/结果查询
    path: '/m/workflow',
    name: 'mobile-workflow-center',
    component: () => import('@/modules/workflow/views/MobileWorkspace.vue'),
    meta: { title: '移动工作台' },
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
  history: createWebHistory(import.meta.env.BASE_URL),
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

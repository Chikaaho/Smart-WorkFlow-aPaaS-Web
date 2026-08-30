# Smart-WorkFlow-Web（前端）

> 低代码 OA + AI Agent 平台的前端单应用（SPA）。
> 配套后端 [Smart-WorkFlow](../Smart-WorkFlow/)（Java 21 / Spring Boot 3.4，`:8080/api`）；规划知识库 [Smart-WorkFlow-Knowledge](../)。
> 本仓库是 Smart-WorkFlow 三仓之一。

---

## 技术栈

### 运行时

| 包                                 | 版本            | 用途                                 |
| ---------------------------------- | --------------- | ------------------------------------ |
| vue                                | ^3.5.38         | 框架                                 |
| vue-router                         | ^5.1.0          | 路由                                 |
| pinia                              | ^3.0.4          | 状态管理                             |
| vue-i18n                           | ^11.4.6         | 国际化                               |
| element-plus                       | ^2.14.2         | UI 组件库                            |
| axios                              | ^1.18.1         | HTTP 请求                            |
| dompurify                          | ^3.4.11         | HTML 安全过滤                        |
| expr-eval-fork                     | ^3.0.3          | 安全表达式求值（expr-eval 修复分支） |
| @form-create/designer + element-ui | ^3.5.0 / ^3.3.1 | 表单设计器 / 渲染器                  |
| bpmn-js                            | ^18.18.0        | BPMN 查看器                          |
| @vue-flow/core                     | ^1.48.2         | 流程图（adapter 已就绪）             |
| vue-draggable-plus                 | ^0.6.1          | 拖拽排序                             |

### 开发工具链

| 包                 | 版本    | 用途                |
| ------------------ | ------- | ------------------- |
| typescript         | ~6.0.2  | 语言                |
| vite               | ^8.1.0  | 构建                |
| vue-tsc            | ^3.3.5  | 类型检查            |
| eslint             | ^10.5.0 | 代码规范 + 架构边界 |
| prettier           | ^3.8.4  | 格式化              |
| vitest             | ^4.1.9  | 单测                |
| @vue/test-utils    | ^2.4.11 | Vue 组件测试        |
| openapi-typescript | ^7.13.0 | 后端类型生成        |

---

## 目录分层

```
src/
├─ contracts/          我方稳定类型契约（业务层只认这里）
│   ├─ session.ts      会话规范态（superAdmin 等）
│   ├─ menu.ts         菜单树规范态
│   ├─ form-schema.ts  表单 schema 类型
│   ├─ bpm.ts / notify.ts / job.ts / storage.ts / agent.ts  各模块契约
│   └─ api-types/      后端生成产物（do-not-edit）
│
├─ foundation/         运行时横切基础设施
│   ├─ request/        唯一 axios 出口（全局只此一处直引 axios）
│   ├─ auth/           token 策略（仅内存，不落 storage）
│   ├─ session/       getInfo 会话
│   ├─ menu/           菜单树 seam + 动态路由构建
│   ├─ permission/     v-perm 指令、hasPerm/hasRole、superadmin 豁免
│   ├─ dict/           字典接口 + DictSelect/DictTag
│   └─ mock/           MSW mock 服务器（dev:mock 模式用）
│
├─ security/           安全层
│   ├─ csp.ts          CSP 策略字符串
│   ├─ sanitize.ts     dompurify 封装
│   ├─ safe-eval.ts    expr-eval-fork 封装
│   └─ SafeHtml.vue    v-html 唯一出口
│
├─ adapters/           易变第三方库防腐层
│   ├─ form-designer/  form-create 防腐层
│   ├─ bpmn/           bpmn-js 查看器防腐层
│   └─ flow-graph/     Vue Flow 防腐层
│
├─ modules/            业务模块（对应后端 sw-biz-*）
│   ├─ form/           表单（设计器 + 渲染 + 列表 + 数据）
│   ├─ system/         系统管理（字典/用户/角色/部门/岗位）
│   ├─ workflow/       工作流（待办/流程定义/流程监控）
│   ├─ notify/         通知
│   ├─ storage/        文件管理
│   ├─ job/            定时任务
│   ├─ agent/          AI Agent
│   ├─ iot/            IoT
│   └─ openapi/        OpenAPI
│
├─ components/         全局组件（BlankPage / DynamicField / page-layout）
├─ layouts/            布局壳（BasicLayout + AppLogo/Sidebar/Topbar）
├─ router/             常量路由表 + 动态路由守卫
├─ stores/             Pinia（user / menu / app）
├─ views/              登录页、错误页
├─ styles/             CSS 变量单一源
└─ locales/            国际化
```

> `types/`（auto-imports / components 自动生成）Git 忽略，不在仓库内维护。

---

## 启动与运行模式

采用**契约先行 + 前后端并行**：前端不等后端就绪，拿 Mock 推页面，后端 seam 点亮后接真数据。

| 命令            | 模式 | 说明                                                                                   |
| --------------- | ---- | -------------------------------------------------------------------------------------- |
| `pnpm install`  | —    | 安装依赖                                                                               |
| `pnpm dev`      | real | 直连后端 `/api`（Vite 代理 → `http://localhost:8080`），后端 seam 未就绪显示「待上线」 |
| `pnpm dev:mock` | mock | 全 Mock 模式（`VITE_USE_MOCK=true`），MSW 拦截请求，零后端依赖，用于肉眼验收           |
| `pnpm build`    | —    | 生产构建（`vue-tsc -b && vite build`）                                                 |
| `pnpm preview`  | —    | 构建产物短时冒烟验证                                                                   |

- 开发端口 `:5173`；后端 `:8080`、context `/api`。
- `VITE_PROXY_TARGET` 可覆盖代理目标（默认 `http://localhost:8080`）。
- Mock 仅在 `dev:mock` 激活，生产构建 tree-shake 后不进入产物。

---

## 校验命令

> ⚠️ 所有 `pnpm`/`npm`/`node` 命令必须带 `NODE_OPTIONS="--max-old-space-size=2048"`（硬约束，最大 2G）；**前后端编译互斥**——编译/测试前需检测后端是否在编译（见规划知识库 `knowledge/shared-constraints.md` §9）。

```bash
NODE_OPTIONS="--max-old-space-size=2048" pnpm typecheck    # vue-tsc -b --noEmit 类型检查
NODE_OPTIONS="--max-old-space-size=2048" pnpm lint         # eslint . 代码规范 + 架构边界
NODE_OPTIONS="--max-old-space-size=2048" pnpm test         # vitest run 单元测试
NODE_OPTIONS="--max-old-space-size=2048" pnpm build        # vue-tsc -b && vite build 生产构建
```

**当前正式基线：typecheck / lint / test / build 全绿；`110 spec files / 1060 tests / 0 skipped`。**

> `pnpm dev` 不做阻塞式校验（无确定退出码）；提交前走上述四连门。

---

## 鉴权、菜单、路由与边界

- **token 仅内存**：全仓库无 localStorage/sessionStorage 写 token（`foundation/auth`）；刷新即重登录。
- **superAdmin = boolean**：由后端按角色 code 集合含 `superadmin` 判定后下发 `superAdmin` 布尔，前端消费该布尔（`foundation/auth` 对空 permissions/roles 豁免放行）；**不用 `*:*:*` 通配串，旧口径 `userId==1` 已废弃**。
- **前端不发租户头**：tenantId 由后端从 JWT 解码注入。
- **菜单单一数据源**：同一份 `loadMenu()` 喂动态路由与侧边栏 store。
- **业务模块边界**：`modules/*` 禁直引 axios、dompurify、expr-eval-fork、form-create、bpmn-js、@vue-flow/\*，只走 `foundation/`、`security/`、`adapters/`、`contracts/`；`modules/A` 禁 import `modules/B`。
- **安全单出口**：`v-html` 仅 `security/SafeHtml.vue`；表达式求值仅 `security/safe-eval`；CSP 由 `vite.config.ts` 注入 `index.html`。

---

## 已验证闭环（当前实现面）

- **登录/认证**：双 token 管线（access 内存 + refresh），静默续期；字典接口已联通（DictSelect/DictTag）。
- **表单设计器 + 渲染**：8 类字段拖拽设计、配置面板、子表、预览、草案持久化；运行时渲染、REFERENCE 选择器、动态字段分发。
- **系统管理**：字典 / 用户 / 角色 / 部门 / 岗位 CRUD。
- **工作流**：流程定义列表/编辑、待办、流程实例监控、任务详情；流程审批闭环。
- **通知 / 存储 / 定时任务**：通知列表 + 标记已读；文件上传/列表/下载/删除；JobList CRUD + JobLog。
- **BPMN / Vue Flow 防腐层**：bpmn-js 查看器 + 流程监控高亮；Vue Flow adapter 就绪。
- **占位模块**：IoT / Agent / OpenAPI 路由与菜单已注册，能力待扩展。

> 各模块精确契约与 seam 现状见规划知识库；本 README 不维护逐功能变更日志。

---

## 权威文档导航

| 需求                          | 入口                                                                                         |
| ----------------------------- | -------------------------------------------------------------------------------------------- |
| 前端工程宪法（硬约束）        | [`docs/governance/engineering-constitution.md`](docs/governance/engineering-constitution.md) |
| 工作区治理（角色/权限/流程）  | 上级目录 [`system.md`](../system.md)                                                         |
| 当前项目状态（唯一权威）      | 上级目录 `knowledge/current-status.md`                                                       |
| 架构 / 已知问题 / 决策 / 约束 | 上级目录 `knowledge/`                                                                        |
| ESLint 边界规则               | [`eslint.config.js`](eslint.config.js)                                                       |
| 构建 / 代理 / CSP             | [`vite.config.ts`](vite.config.ts)                                                           |

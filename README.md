# Smart-WorkFlow-aPaaS-Web

Smart-WorkFlow-aPaaS-Web 是 CH-aPaaS 的 Vue 单页应用，为低代码表单、流程审批、组织权限、通知、存储、任务、IoT 与 AI Agent 提供统一的浏览器端交互入口。

配套入口：[Smart-WorkFlow-sPaaS-server](../Smart-WorkFlow-Server/README.md) · [项目知识中心](../README.md)

## 核心能力

- 登录会话、动态菜单、路由与权限控制。
- 表单设计、表单渲染、数据填写和业务数据列表。
- 流程定义、待办审批与流程实例监控。
- 用户、角色、部门、岗位和字典管理。
- 通知、文件、定时任务、IoT 与 Agent 管理界面。
- 真实后端 API 与 Mock 两种本地开发模式。

## 技术栈

| 类别         | 技术                              |
| ------------ | --------------------------------- |
| 应用框架     | Vue 3、TypeScript、Vite           |
| 路由与状态   | Vue Router、Pinia                 |
| UI 与国际化  | Element Plus、vue-i18n            |
| HTTP 与 Mock | Axios、MSW                        |
| 表单与流程   | form-create、bpmn-js、Vue Flow    |
| 工程质量     | vue-tsc、ESLint、Prettier、Vitest |

## 目录结构

```text
src/
├── contracts/       稳定类型与 API 契约
├── foundation/      请求、会话、菜单、权限与 Mock 基础设施
├── security/        内容净化、表达式求值与安全组件
├── adapters/        表单设计器、BPMN 与流程图防腐层
├── modules/         表单、系统、流程、通知、存储、任务、Agent、IoT 等业务模块
├── components/      全局组件
├── layouts/         应用布局
├── router/          路由与导航守卫
├── stores/          Pinia 状态
└── views/           登录与错误页
```

业务模块通过 `contracts`、`foundation`、`security` 和 `adapters` 使用公共能力。完整分层与导入边界见[前端工程宪法](docs/governance/engineering-constitution.md)。

## 环境要求

- Node.js
- pnpm
- 真实 API 模式需要可访问的 Smart-WorkFlow-sPaaS-server

环境配置入口：

- [`.env`](.env)：默认开发环境配置。
- [`.env.mock`](.env.mock)：Mock 开发模式配置。
- [`vite.config.ts`](vite.config.ts)：开发服务器、代理与构建配置。

## 开发模式

`pnpm dev` 使用真实 API，浏览器请求 `/api`，默认由 Vite 代理到 `http://localhost:8080`。可通过 `VITE_PROXY_TARGET` 指定其他后端地址。

`pnpm dev:mock` 启用本地 Mock，用于前端独立开发和页面交互调试。

## 快速开始

安装依赖：

```bash
pnpm install
```

启动真实 API 模式：

```bash
pnpm dev
```

或启动 Mock 模式：

```bash
pnpm dev:mock
```

开发服务器默认地址为 `http://localhost:5173`。

## 常用开发命令

类型检查：

```bash
pnpm typecheck
```

代码检查：

```bash
pnpm lint
```

运行测试：

```bash
pnpm test
```

生产构建：

```bash
pnpm build
```

预览构建产物：

```bash
pnpm preview
```

生成后端 API 类型：

```bash
pnpm gen:api-types
```

## 进一步阅读

| 主题                 | 入口                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------- |
| 前端架构与工程规范   | [`docs/governance/engineering-constitution.md`](docs/governance/engineering-constitution.md) |
| 平台整体架构         | [`../knowledge/architecture.md`](../knowledge/architecture.md)                               |
| 后端与 API 入口      | [`../Smart-WorkFlow-Server/README.md`](../Smart-WorkFlow-Server/README.md)                   |
| 工作区治理入口       | [`../system.md`](../system.md)                                                               |
| ESLint 架构边界      | [`eslint.config.js`](eslint.config.js)                                                       |
| Vite、代理与构建配置 | [`vite.config.ts`](vite.config.ts)                                                           |

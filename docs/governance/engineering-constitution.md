# Smart-WorkFlow 前端工程宪法

> 本文件定位：**前端工程的「怎么干」**——协作方式、执行纪律、设计系统规范、不可破的约束。
> **「现状是什么」**不在本文件维护：跨端架构见工作区 `knowledge/architecture.md`，当前状态见 `knowledge/current-status.md`，正式功能 ID 见 `Smart-WorkFlow/功能清单.md`。本文件**不记进度**。
> 后端工程由相邻的 `Smart-WorkFlow/` executor sublayer 独立治理；前端执行会话不得读取或操作该子层。功能 ID 见工作区正式功能清单。

---

## 0. 一句话项目

低代码 OA + AI Agent。模块化单体后端（Java 21 / Spring Boot 3.4 / MyBatis-Plus / Flowable），
前端 Vue 3 + TS 单应用（自有架构，**不继承 vben**）。单人项目，作者后端背景、不逐行读前端代码。

### 0.0 角色定位：执行层（硬约束）

本仓入口的角色门禁、Executor 权限、任务闭环、终态与重复失败纪律，唯一分别见工作区根 `system.md` §0.2 与 `roles/executor.md`；本工程宪法不复制或改写这些公共规则，只定义前端工程专属约束。

### 0.1 本仓库范围（硬约束）

**本仓库（`Smart-WorkFlow-Web`）只做前端，不碰后端。**

- ❌ **禁止** 读取、修改、构建、运行或分析 `Smart-WorkFlow/` 中的任何后端代码（Java、Flyway、配置文件等）
- ❌ **禁止** 执行后端命令（`mvn`、`gradle`、后端测试等）
- ❌ **禁止** 向后端仓库提交或推送代码
- ✅ 只关注前端代码：Vue 3 / TypeScript / Vite / Element Plus
- ✅ 只在前端目录下执行命令（`pnpm` 系命令）

前端 Seam 契约以本仓库知识库为准，后端端点形状和错误码由对方负责，超出范围一律视为后端事务不予处理。

---

## 1. 协作方式（新会话先读）

### 1.1 任务处理强度

任务处理强度和重复失败协议只引用根 `roles/executor.md` §5 与 §4.4；本工程宪法不另定义分级或会话行为。

### 1.2 工作节奏（不可乱序）

1. 先锁定契约形状、安全边界和真实签名。
2. prompt 明示 TDZ、循环依赖、租户注入、存 id/显示 value 等易错不变量。
3. 按任务等级完成对应验证；L/XL 的每个工程节点四连全绿并按需完成肉眼验收后再进入下一个。
4. 可见交付应可人工验收；运行时不便时使用静态检查与确定性校验，不以前台常驻服务充当 gate。

### 1.3 铁律

- **以实际代码为准**：prompt 与现实冲突时信现实（prompt 里必带「以实际为准」「先读真实签名再写」）。
- **move-not-copy**：重构是移动不是并存两套；改完 `grep` 旧名零命中为硬证。
- **文档整篇替换，不做 diff**。
- **不挖地基**：做完美不应付——小的未来变更不该需要重构地基（rearchitect foundations）。横切基础设施先于业务。

---

## 2. 执行纪律（硬约束）

### 2.1 分级验证门

执行前先按工作区 `knowledge/shared-constraints.md` §6 检查后端进程，保持前后端编译互斥。

验证强度遵循根 `system.md` §3.5：

- **S**：聚焦检查改动文件和实际可见结果；纯样式/文案修改不强制全量四连。
- **M**：至少执行 typecheck、与受影响范围对应的 lint/目标测试；影响打包、路由或构建配置时补 build。
- **L/XL**：执行以下完整四连，全部通过且具有确定退出码；可见交付按需补肉眼验收。

```bash
NODE_OPTIONS="--max-old-space-size=2048" pnpm typecheck && NODE_OPTIONS="--max-old-space-size=2048" pnpm lint && NODE_OPTIONS="--max-old-space-size=2048" pnpm test && NODE_OPTIONS="--max-old-space-size=2048" pnpm build
```

- ❌ **`pnpm dev` 当阻塞校验门是明确反模式**——它没有确定退出码。
- ❌ 资源受限环境**禁前台常驻起服务**当 gate。
- ✅ `pnpm dev` / `pnpm dev:mock` 只用于**人工肉眼验收**。

**dev:mock 按可见风险使用**：仅当改动产出可见 UI 且需肉眼验时才起（典型：新页面、弹层、
运行时字符串解析如菜单 component / glob 白名单——这些 typecheck 抓不到，必须肉眼过）。
纯逻辑 / 纯函数 / 工具刀**不要求** dev:mock，回执里它最多是可选附注，不与四连并列成 gate。

### 2.2 结构件配常驻回归测试

凡是「单一数据源」「导入边界」「接缝不串」这类不变量，都要有**常驻回归测试**钉死，
防止后续改动悄悄破坏。已有的几条不变量（菜单单源、导入边界、token 不落 storage、
redirect 同源、mock 不污染 modules）不允许在没有等价替代时删除。
**重构改名时同步改测试断言只换名、不弱化断言强度。**

### 2.3 prompt 自带自查证据

S/M 在对话结果中提交改动文件与对应验证；L/XL 的正式回执提交改动文件清单、开关/用法、四连结果与测试计数、易错点反向断言。

---

## 3. 开发模式：契约先行 + 前后端并行

**这是标准并行节奏，不是权宜之计：前端不等后端就绪，拿契约和 mock 把页面/样式/交互全推起来，
后端 seam 点亮后零改动接真数据。**

- **直连**：后端已就绪的端点，前端真接。
- **seam**：后端未就绪的端点，前端按「约定形状」写实，上线即通。
  - **real 模式（`pnpm dev`）下 seam 行为 = 显示「后端端点待上线」可读态，不 mock 假数据。**
- **mock 验收台（`pnpm dev:mock`）**：全 mock，后端零参与，页面血肉全亮，专用于肉眼验收。
- **mock 双门**：`import.meta.env.DEV && VITE_USE_MOCK`（或等价 `MODE==='mock'`），prod build 已
  tree-shake，假数据不进产物。mock 数据须标注临时。

> seam 的延迟契约形状以**现状知识库 §7** 为准。

---

## 4. 不可破的工程约束（沿用，改动需重新决策）

- **token 仅内存**，全仓库无 localStorage/sessionStorage 写 token；刷新=重登录（refresh seam 未实现，非 bug）。
- **superAdmin = 布尔**（后端按角色 code 集合包含 `superadmin` 判定），不用历史身份硬编码或 `*:*:*` 通配串。
- **前端不发租户头**：多租户从登录态（token→userId→tenantId）后端注入。
- **菜单单一数据源**：同一份 `loadMenu()` 同时喂 router 与侧边栏 store，**禁止给侧边栏单独拉菜单**（有回归测试钉死）。
- **组件解析走 `import.meta.glob` 白名单**，禁止字符串拼路径 `import()`。
- **单一请求层**：业务层禁直引 axios，全部走 `foundation/request`。
- **CSP**：`script-src` 严格（禁 unsafe-inline/eval）；`style-src` 放 `unsafe-inline`（Element Plus 弹层必需，理由记于 `csp.ts` 与 README）。
- **表达式求值只走 `security/safe-eval`**，禁 `eval`/`new Function`。
- **v-html 唯一出口** `sanitizeHtml`/`<SafeHtml>`；**open-redirect** 必做同源校验。
- **DICT 字段走 `foundation/dict` 的 `useDict` 通道**，`__dictType__` 元数据由 `toFormCreateRule` 埋入，渲染层据此填选项；禁止字段层自行 fetch / 硬编码选项。
- **form-designer 防腐层**：form-create 原生 schema 不得泄漏进 `modules/`（ESLint 导入边界强制）。
- **暗态 gating**：权限集为空时 `v-perm` 放行展示（no-data=放行），非安全洞，后端权限装配上线后自然切回真实拦截。
- **REFERENCE「存 id 显示 value」不混（红线）**：REFERENCE 字段提交/入库带的是目标记录 **id**
  （对后端 `ref_{name}_id` 列），UI 显示的是**显示名**（value）。v-model 实际值=id，显示文案另走
  computed/display 字段；二者绝不可混，混了即脏数据进库。

### 4.1 配置接缝层（本阶段沉淀，设计器将喂数据进来）

凡「将来设计时可自定义」的取值逻辑（列表展示哪些字段 / 可搜字段 / 字段排序 / 列宽 /
引用选择器展示列 / 引用显示字段…），一律收进 `modules/form/utils/` 下的**可替换纯函数**，
带显式 TODO 接缝注释「数据源 definition→配置 时只换此函数，页面/组件零改」。

现有接缝函数（纯函数 + 单测）：
`deriveColumns` / `deriveFilterFields` / `deriveReferenceColumns` / `deriveDisplayField` /
`deriveSearchFields` / `resolveReferenceDisplay`（id→显示名，v1 当场单查、取不到回退 refId）。

**约定**：新增「设计时可自定义」类需求，先抽这层纯函数留接缝，不在组件里写死；
将来设计器产出配置元数据时，只换这层函数数据源（猜 definition → 读配置），消费方零改。

---

## 5. 设计系统（视觉单一源 · 全局 token）

> 来源：设计系统产出的《页型规范》原型。**所有视觉值取自此处，禁止逐页硬编码颜色/间距/圆角。**
> 工程落地 = 把下列 token 转为一套全局 CSS 变量（单一源 `--sw-*`），页型组件与所有模块页一律引用变量。

### 5.1 品牌主色阶（紫莓 #7e306b · 唯一主色源）

| 档               | 值            | 用途                |
| ---------------- | ------------- | ------------------- |
| 深 Dark          | `#652656`     | 按下 / active 态    |
| **主色 Primary** | **`#7e306b`** | 按钮·链接·选中·强调 |
| 浅 1             | `#a56e97`     | hover · 次级强调    |
| 浅 2             | `#bf98b5`     | 禁用主色 · 辅助     |
| 浅 3             | `#d8c1d3`     | 强调边框 · 标签底   |
| 浅 4             | `#e5d6e1`     | 选中行底 · hover 底 |
| 浅 5             | `#f2eaf0`     | 最浅底 · focus 光晕 |

### 5.2 中性色（文本 / 边框 / 填充）

主文本 `#303133` · 常规文本 `#606266` · 次要文本 `#909399` · 占位文本 `#a8abb2` ·
一级边框 `#dcdfe6` · 二级边框 `#e4e7ed` · 浅边框 `#ebeef5` · 填充底 `#f5f7fa`。

### 5.3 语义色（状态反馈，文字色 / 底色）

成功 `#67c23a` / `#f0f9eb` · 警告 `#e6a23c` / `#fdf6ec` ·
危险 `#f56c6c` / `#fef0f0` · 信息 `#909399` / `#f4f4f5`。

### 5.4 字号阶梯

| px  | 字重 | 角色         | 用途                   |
| --- | ---- | ------------ | ---------------------- |
| 20  | 600  | 页标题 H1    | 页面主标题             |
| 16  | 600  | 区块标题 H2  | 卡片 / 分组标题        |
| 14  | 500  | 强调正文     | 字段标签 · 按钮        |
| 14  | 400  | 正文 Body    | 控件内容 · 表格        |
| 13  | 400  | 次要         | 辅助说明 · 分页        |
| 12  | 400  | 辅助 Caption | 表头 · 标签 · 校验提示 |

### 5.5 圆角 / 间距 / 阴影

- **圆角**：小 `2px` · **控件默认 `4px`** · 卡片 `6px` · 弹窗/大卡 `8px`。
- **间距（4 的倍数）**：`4 / 8 / 12 / 16 / 20 / 24 / 32 px`。
- **阴影**：卡片 `0 1px 8px rgba(0,0,0,.04)` · 浮层 `0 4px 16px rgba(0,0,0,.08)` · 弹窗 `0 12px 32px rgba(0,0,0,.12)`。

### 5.6 控件密度

- 控件高度（大/默认/小）：`40 / 32 / 28 px`。
- 表单行间距：`22 px`。表格行高（默认/紧凑）：`50 / 40 px`。
- 单元格水平内边距：`16 px`；卡片内边距：`24 px`；区块间距：`20 px`。

### 5.7 范围约束

**只做桌面端宽屏 + 亮色。** 移动端响应式、暗色模式均为明确延后项，本阶段不做。

---

## 6. 两大主要页型规范（先钉模板再铺模块）

### 6.1 页型 A — 表单填写/渲染页（最高频）

- **容器**：外层 `max-width: 920px` 居中。
- **结构**：页标题区（H1 + 「带 \* 为必填项」）→ 顶部 alert 提示条 → 卡片（圆角 6px、卡片阴影、内边距 22~28px）。
- **分组**：卡片内按业务分组，组标题用主色 `#7e306b`、13px/600、下边框分隔。
- **栅格**：组内字段双列（列间距 28px、行间距 22px）；多行文本/子表格跨整行。
- **字段**：标签在上（14px、下间距 6px），必填红星前置；控件高度 32px、圆角 4px。focus 态主色边框 + `0 0 0 2px #f2eaf0` 光晕。
- **8 类字段落法**：
  TEXT→input；RICH_TEXT→textarea（降级，TODO 富文本）；NUMBER→inputNumber（带步进）；
  DATE→datePicker（valueFormat `YYYY-MM-DD`，提交 ISO）；BOOL→switch；
  DICT→select（选项走 useDict；renderAs=radio 走 el-radio-group）；
  **REFERENCE→只读输入框 + 选择按钮 + 弹窗选择器**（存 id 显示 value）；
  TABLE→内嵌子表（可增删行，子字段按 type 分发控件）。
- **只读模式**：渲染页 mode=view 时 readonly 贯穿各控件（不可改、TABLE 隐藏增删行、隐藏提交）。
- **校验**：required 仅前端 UX 提示，**不拦死提交**（真校验在后端，返 1401/1403 等业务码 → 映射中文）。

### 6.2 页型 B — 数据列表页（第二高频）

- **结构**：页标题 → 顶部筛选/搜索栏（查询主色实底、重置描边）→ 表格卡片 → 底部分页。
- **表格**：表头底 `#fafafa`、表头 13px/600；行高默认 50px；单元格内边距 16px；操作列（查看/编辑/删除）置行尾。
- **表头条**：列表标题 + 右侧「共 N 条记录」。**空态**：无数据给空态占位。**分页**：底部 13px 次要文本。

### 6.3 一致性

两页型是同一套设计语言的两个面：配色/圆角/阴影/字号/间距/主色运用必须统一，全部引用 §5 的全局 token，改一处全局跟随。

### 6.4 落地纪律

- 两页型先沉淀为**可复用页型组件**（`StandardFormTemplate` / `StandardListTemplate`）+ 全局 token，
  再铺其余模块页（系统管理/流程/通知/IoT/openapi 都是这两种页型的实例）。

---

## 7. 常用命令

```bash
NODE_OPTIONS="--max-old-space-size=2048" pnpm install                    # 安装依赖
NODE_OPTIONS="--max-old-space-size=2048" pnpm dev                        # 开发服务器（直连后端）
NODE_OPTIONS="--max-old-space-size=2048" pnpm dev:mock                   # Mock 模式
NODE_OPTIONS="--max-old-space-size=2048" pnpm typecheck                  # vue-tsc 类型检查
NODE_OPTIONS="--max-old-space-size=2048" pnpm lint                       # ESLint + 架构边界规则
NODE_OPTIONS="--max-old-space-size=2048" pnpm lint --fix                 # 自动修复
NODE_OPTIONS="--max-old-space-size=2048" pnpm test                       # vitest run 全量单测
NODE_OPTIONS="--max-old-space-size=2048" pnpm test -- -t "UserList"      # 按名称过滤测试
NODE_OPTIONS="--max-old-space-size=2048" pnpm test src/modules/system/views/UserList.spec.ts  # 单个测试文件
NODE_OPTIONS="--max-old-space-size=2048" pnpm test -- --watch            # watch 模式
NODE_OPTIONS="--max-old-space-size=2048" pnpm build                      # 生产构建
NODE_OPTIONS="--max-old-space-size=2048" pnpm preview                    # 预览构建产物
NODE_OPTIONS="--max-old-space-size=2048" pnpm gen:api-types              # 生成 API 类型
NODE_OPTIONS="--max-old-space-size=2048" pnpm audit --registry https://registry.npmjs.org/  # 安全审计
```

> **`pnpm dev`/`pnpm dev:mock` 不允许做阻塞式校验**——它没有确定退出码。
> L/XL 完整校验门是上述带 2G 环境变量的四连全绿；S/M 按 §2.1 使用比例验证。
>
> **编译命令必须限制最大内存（硬约束 🔒）**：所有 `pnpm`/`npm` 命令一律带 `NODE_OPTIONS="--max-old-space-size=2048"`，上限 2G，禁止无限制内存直接编译/构建。

---

## 8. 强制内部边界（ESLint）

`eslint.config.js` 定义了以下架构边界规则，所有代码必须遵守：

- `modules/*` 禁止直引 `axios`、`dompurify`、`expr-eval-fork`、`form-create`、`@form-create/*`、`bpmn-js`、`@vue-flow/*`，只能走 `foundation/*`、`security/*`、`adapters/*`、`contracts/*`。
- `modules/A` 禁止 import `modules/B`（业务模块之间不允许横向耦合）。
- `axios` 全局只允许在 `foundation/request/**` 内出现。
- `dompurify`、`expr-eval-fork` 全局只允许在 `security/**` 内出现。
- `v-html` 全局禁止，唯一例外是 `security/SafeHtml.vue`。
- `src/contracts/api-types/**` 标记为生成产物，禁止手动编辑。
- **Element Plus 经按需自动导入**（`unplugin-vue-components` + `unplugin-auto-import` + `ElementPlusResolver`）：组件全局按需注册、`ElMessage` 等 API 自动引入，`modules/*` 里不出现 `element-plus` 的显式 import 语句。

---

## 9. 安全基线

- **ESLint 全局禁 `eval`/`new Function`**，禁业务层裸 `v-html`。
- **CSP**：`vite.config.ts` 通过 `cspMetaPlugin` 向 `index.html` 注入 `<meta http-equiv="Content-Security-Policy">`。`script-src 'self'` 严格（禁 `unsafe-inline`/`unsafe-eval`）；`style-src 'self' 'unsafe-inline'`（Element Plus 弹层运行时用内联 style）。
- **token 仅内存**：全仓库无 `localStorage`/`sessionStorage` 写入。
- **单一请求层**：`foundation/request` 已区分 401（清态跳登录）与其他状态码。
- **表达式安全**：`security/safe-eval` 封装 `expr-eval-fork`，禁 `eval`/`new Function`。
- **v-html 唯一出口**：`security/SafeHtml.vue`，经 dompurify 过滤。
- **open redirect 防护**：路由守卫同源校验。

---

## 10. Mock 系统架构

来自 `foundation/mock/`，在 `dev:mock` 模式下激活，经过 tree-shake 不进入生产构建产物。

### 核心机制

- **MockHandler 签名**：`(params: Record<string, string>, query: Record<string, string>, body: unknown) => ApiResponse<T>`
- **MockRegistration**：`{ method: MockMethod; pattern: \`/${string}\`; handler: MockHandler }`
- **注册机制**：`handlers.ts` 导出 `mockRegistrations: MockRegistration[]`；`index.ts` 集中注册到 `Map<RegistryKey, MockHandler>`
- **路径匹配**：支持 `:param` 占位符（如 `/api/system/user/:id`），匹配基于 `${METHOD} ${resolvedPathname}`
- **URL 拼接**：`baseURL(/api) + url` → 完整路径
- **响应形状**：`{ code: number, message: string, data: T | null }` — 即 `ApiResponse<T>`
- **激活条件**：`import.meta.env.DEV && import.meta.env.VITE_USE_MOCK === 'true'`

### 新增 Handler 模式

```typescript
export const mockRegistrations: MockRegistration[] = [
  ...,
  {
    method: 'POST',
    pattern: '/api/system/user/page',
    handler: (_params, query, body) => {
      // query.pageNum / query.pageSize — URL 查询参数
      // body — POST 请求体（filter 对象）
      return { code: 0, message: 'ok', data: { records, total, pageNum, pageSize } }
    },
  },
]
```

### 可变数据原则

种子数据在 `seeds.ts` 中用 `const` 声明数组/Map，handler 中通过 `.push()`/`.splice()`/索引赋值原地 mutate。
Delete handler 应幂等（不存在的记录也返回 `code: 0`）。
Update handler 应合并字段而非整体替换（保留 `createTime`/`isAdmin`/`builtIn` 等不可变字段）。

---

## 11. 测试模式（常驻回归测试）

### 页面组件测试模式

所有列表页测试（`*List.spec.ts`）遵循以下模式：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'

// Mock API 层
vi.mock('@/modules/system/api/user')

// 最小桩组件（StandardListTemplate 等页型组件不需要渲染全量 DOM）
const minimalStubs = {
  StandardListTemplate: {
    template:
      '<div><slot name="toolbar-actions"/><slot name="filter"/><slot name="filter-actions"/><slot/><slot name="empty-action"/></div>',
    props: ['title', 'total', 'pageNum', 'pageSize', 'empty'],
  },
  StandardFormTemplate: {
    template: '<div><slot name="alert"/><slot/></div>',
    props: ['title', 'embedded'],
  },
  'el-dialog': {
    template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>',
    props: ['modelValue'],
  },
  'el-table': { template: '<div><slot/></div>', props: ['data'] },
  'el-button': { template: '<button><slot/></button>', props: ['disabled'] },
}

describe('UserList', () => {
  it('mounts and calls pageUsers', async () => {
    const wrapper = mount(await import('@/modules/system/views/UserList.vue'), {
      global: { stubs: minimalStubs },
    })
    expect(pageUsers).toHaveBeenCalledTimes(1)
  })
})
```

### 测试断言要点

- `wrapper.vm` 的暴露方法通过 `wrapper.vm as unknown as { methodName: ... }` 类型断言调用
- API mock 使用 `mockResolvedValue` 控制返回值，断言 `toHaveBeenCalledWith` 验证参数
- 删除操作测试：先 mock `ElMessageBox.confirm` 为 `mockResolvedValue(undefined)`，再断言 API 调用
- DeptList（树形表格）不使用 `StandardListTemplate`，手写布局测试，桩更少

### 重要不变量（常驻回归测试）

以下不变量有专门测试钉死，重构改名时同步更新断言，不弱化强度：

- sanitize 过滤 `<script>` 标签 — `security/sanitize`
- safeEval 隔离全局变量 — `security/safe-eval`
- token 不进入 localStorage/sessionStorage — `foundation/auth/token`
- redirect 同源校验（open-redirect 防护）
- 菜单单一数据源（同一份 `loadMenu()` 喂路由和侧边栏）
- 导入边界（modules 禁互引、禁直引危险库）
- 路由守卫（不循环、404-last、rebuild 幂等）

---

## 12. 编码规范（硬约束）

### 12.1 工具库：优先成熟开源

- 需要工具能力时优先选社区活跃、易维护的成熟开源库，不自造轮子、不引冷门库。
- 受**单一请求层**约束：HTTP 一律走 `foundation/request`（封装 axios），业务层禁直引第三方 HTTP 库。
- 受**防腐层**约束：易变/危险第三方（form-create、bpmn-js、vue-flow、dompurify、求值器）一律套自有薄接口，原生 API 不得泄漏到业务层。

### 12.2 命名与目录

- `src/modules/lowcode/` 已整体重命名为 **`src/modules/form/`**（目录、组件名去 `Lowcode` 前缀、
  路由 name/path 去 `lowcode`、菜单 component 路径、glob 覆盖、测试断言全部对齐 form）。
  新建表单相关文件一律落 `modules/form/`，不得复活 lowcode 命名。

---

## 13. 工程交付纪律

会话授权、角色终态与任务分级只引用根 `system.md` 和 `roles/executor.md`，本节不另定义。

- S/M 提供与受影响范围相称的验证；L/XL 四连全绿并提供可复算测试计数，增减须能精确对应实际改动。
- 工程证据按等级包含改动文件、实际验证、开关/用法和必要反向断言；L/XL 回执格式见根 `roles/executor.md` §8。

---

## 14. 详细看哪

| 要什么                             | 看哪                                 |
| ---------------------------------- | ------------------------------------ |
| 跨项目架构与前端分层               | 工作区 `knowledge/architecture.md`   |
| 当前状态与唯一下一动作             | 工作区 `knowledge/current-status.md` |
| 设计 token 与页型工程规范          | 本文件 §5—§6                         |
| 功能 ID（Mxx-Fyy-zz）              | 工作区 `Smart-WorkFlow/功能清单.md`  |
| 怎么协作 / 执行纪律 / 设计系统规范 | **本文件**                           |

---

## 15. 信息分层铁律（与根 system.md §0.4 一致）

信息分层、当前状态与 memory 摘要规则唯一见根 `system.md` §0.4/§0.8；本工程宪法不保留镜像正文。

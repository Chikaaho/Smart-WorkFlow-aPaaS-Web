/**
 * Mock 种子数据 —— 共享常量，供 handlers.ts 多 handler 引用同一份假数据源。
 *
 * 本文件存放跨 handler 复用的假数据（字典选项、表单定义、提交记录等），
 * 各 handler 只 import 所需常量，避免内联重复。
 */

import type { AgentModelConfig } from '@/contracts/agent'

/** 用户种子（登录/会话放行用）。身份语义与 MOCK_SESSION_DATA* 一一对应。 */
export const MOCK_USERS = [
  { username: 'superadmin', displayName: '超级管理员', password: 'admin123' },
  { username: 'admin', displayName: '管理员', password: 'admin123' },
  { username: 'user', displayName: '普通用户', password: 'user123' },
]

/** mock GET /system/auth/me 响应的会话形状（对齐后端 SessionDTO）。 */
export interface MockSessionData {
  user: {
    id: string
    username: string
    displayName: string
    deptId: string
    tenantId: string
    avatar: string | null
  }
  permissions: string[]
  roles: string[]
  superAdmin: boolean
}

/**
 * 按会话角色码集合求该会话各角色的「按钮行 permission 并集」（来自 MOCK_ROLE_MENU_BINDINGS）。
 * 对齐真实后端 UserDetailsProviderImpl 的权限装配：非超管经 sys_role_menu 取按钮行 permission。
 */
function collectSessionPermissions(roles: string[]): string[] {
  const roleIds = MOCK_ROLES_LIST.filter((r) => roles.includes(r.code)).map((r) => Number(r.id))
  const bindings = roleIds.flatMap((id) => MOCK_ROLE_MENU_BINDINGS[String(id)] ?? [])
  const idSet = new Set(bindings)
  const perms = new Set<string>()
  const walk = (nodes: MockMenuNode[]): void => {
    for (const node of nodes) {
      if (idSet.has(Number(node.id)) && node.menuType === 2 && node.permission) {
        perms.add(node.permission)
      }
      if (node.children?.length) walk(node.children)
    }
  }
  walk(MOCK_MENU_TREE as MockMenuNode[])
  return [...perms]
}

/**
 * mock GET /system/auth/me 响应（超管会话，username=superadmin）。
 * 身份语义对齐真实后端双角色契约：superadmin（code 旁路，roles=['superadmin']、superAdmin=true），
 * 与普通 admin（roles=['admin']、superAdmin=false，permissions 由 admin 角色绑定装配）严格区分。
 */
export const MOCK_SESSION_DATA: MockSessionData = {
  user: {
    id: '1',
    username: 'superadmin',
    displayName: '超级管理员',
    deptId: '101',
    tenantId: '1',
    avatar: null,
  },
  permissions: [
    'system:view',
    'form:view',
    'form:form:view',
    'workflow:view',
    'notify:view',
    'system:user:list',
    'system:role:list',
    'system:dept:list',
    'system:post:list',
    'system:userGroup:list',
    'system:userGroup:manage',
    'storage:view',
    'job:view',
    'job:list',
    'job:log',
    'agent:view',
    'agent:model:view',
    'agent:model:manage',
    'agent:model:test',
  ],
  roles: ['superadmin'],
  superAdmin: true,
}

/**
 * 普通管理员会话（非超管，username=admin / password=admin123）。
 * 对齐后端 V31 seed：admin 角色（id=2，built_in=false）显式绑定全量菜单+按钮；
 * superAdmin=false，权限与菜单完全由 MOCK_ROLE_MENU_BINDINGS['2'] 装配
 * （与真实后端 UserDetailsProviderImpl 非超管装配一致，无任何 code 旁路）。
 */
export const MOCK_SESSION_DATA_ADMIN: MockSessionData = {
  user: {
    id: '1',
    username: 'admin',
    displayName: '管理员',
    deptId: '101',
    tenantId: '1',
    avatar: null,
  },
  // 权限在文件底部依赖声明完备后补齐（collectSessionPermissions 依赖 MOCK_ROLES_LIST /
  // MOCK_ROLE_MENU_BINDINGS，此处处于 TDZ 之前不可调用）
  permissions: [],
  roles: ['admin'],
  superAdmin: false,
}

/**
 * 普通用户会话（非超管）：用户名 user / 密码 user123（MOCK_USERS 中已存在的固定用户）。
 *
 * 供「当前用户」切会话演示与测试：登录 user 后，/auth/me 与 /auth/menus 走非超管语义
 * （菜单/按钮按 MOCK_ROLE_MENU_BINDINGS 过滤，与真实后端 SysMenuServiceImpl.getMenuTree
 * 非超管分支一致）。user 的 roleIds = ['3']（普通用户角色，空绑定），
 * 演示/测试「无绑定 → 空树」。
 *
 * 说明：mock 层固定三个会话（superadmin 超管 / admin 普通管理员 / user 普通用户），
 * 身份语义与真实后端双角色契约一致（见 MOCK_SESSION_DATA / MOCK_SESSION_DATA_ADMIN）。
 * 无前端登录页以外的运行时「切换用户」入口（方向范围内不需要）；
 * 测试通过直接调 switchMockSession 驱动。
 */
export const MOCK_SESSION_DATA_USER: MockSessionData = {
  user: {
    id: '2',
    username: 'user',
    displayName: '普通用户',
    deptId: '101',
    tenantId: '1',
    avatar: null,
  },
  permissions: [],
  roles: ['user'],
  superAdmin: false,
}

/**
 * 当前 mock 会话（可变状态，handlers.ts 原地替换）。
 * 与 MOCK_ROLE_MENU_BINDINGS 同模式：种子声明 + handler/测试原地 mutate。
 * 登录 handler 按 username 切会话：superadmin → MOCK_SESSION_DATA（超管旁路）、
 * admin → MOCK_SESSION_DATA_ADMIN（普通管理员，非超管）、user → MOCK_SESSION_DATA_USER；
 * 其他用户名回退超管（登录 handler 不校验密码，仅按 username 演示会话）。
 */
export let MOCK_CURRENT_SESSION: MockSessionData = MOCK_SESSION_DATA

/** 切换当前 mock 会话（按登录用户名选择会话快照）。 */
export function switchMockSession(username: string): void {
  if (username === 'admin') {
    MOCK_CURRENT_SESSION = MOCK_SESSION_DATA_ADMIN
  } else if (username === 'user') {
    MOCK_CURRENT_SESSION = MOCK_SESSION_DATA_USER
  } else {
    // 默认 / superadmin / 其他 → 超管会话
    MOCK_CURRENT_SESSION = MOCK_SESSION_DATA
  }
}

/** mock GET /system/auth/menus 菜单树，与交付体一致。 */
export interface MockMenuNode {
  id: string
  parentId: string | null
  name: string
  title: string
  path: string
  component: string | null
  icon?: string
  sort: number
  menuType: number
  permission?: string
  hidden?: boolean
  children?: MockMenuNode[]
}

export const MOCK_MENU_TREE: MockMenuNode[] = [
  {
    id: '1',
    parentId: null,
    name: 'system',
    title: '系统管理',
    path: 'system',
    component: null,
    icon: 'Setting',
    sort: 1,
    menuType: 0,
    permission: 'system:view',
    hidden: false,
    children: [
      {
        id: '10',
        parentId: '1',
        name: 'dict',
        title: '字典管理',
        path: 'system/dict',
        component: 'system/views/DictTypeList',
        icon: 'Collection',
        sort: 1,
        menuType: 1,
        permission: 'system:dict:view',
        hidden: false,
      },
      {
        id: '11',
        parentId: '1',
        name: 'User',
        title: '用户管理',
        path: 'system/user',
        component: 'system/views/UserList',
        icon: 'User',
        sort: 2,
        menuType: 1,
        permission: 'system:user:list',
        hidden: false,
        children: [
          {
            id: '110',
            parentId: '11',
            name: 'UserAdd',
            title: '新增用户',
            path: '',
            component: null,
            sort: 1,
            menuType: 2,
            permission: 'system:user:add',
            hidden: true,
          },
          {
            id: '111',
            parentId: '11',
            name: 'UserEdit',
            title: '编辑用户',
            path: '',
            component: null,
            sort: 2,
            menuType: 2,
            permission: 'system:user:edit',
            hidden: true,
          },
          {
            id: '112',
            parentId: '11',
            name: 'UserRemove',
            title: '删除用户',
            path: '',
            component: null,
            sort: 3,
            menuType: 2,
            permission: 'system:user:remove',
            hidden: true,
          },
        ],
      },
      {
        id: '12',
        parentId: '1',
        name: 'Role',
        title: '角色管理',
        path: 'system/role',
        component: 'system/views/RoleList',
        icon: 'Avatar',
        sort: 3,
        menuType: 1,
        permission: 'system:role:list',
        hidden: false,
        children: [
          {
            id: '120',
            parentId: '12',
            name: 'RoleAdd',
            title: '新增角色',
            path: '',
            component: null,
            sort: 1,
            menuType: 2,
            permission: 'system:role:add',
            hidden: true,
          },
          {
            id: '121',
            parentId: '12',
            name: 'RoleEdit',
            title: '编辑角色',
            path: '',
            component: null,
            sort: 2,
            menuType: 2,
            permission: 'system:role:edit',
            hidden: true,
          },
          {
            id: '122',
            parentId: '12',
            name: 'RoleRemove',
            title: '删除角色',
            path: '',
            component: null,
            sort: 3,
            menuType: 2,
            permission: 'system:role:remove',
            hidden: true,
          },
        ],
      },
      {
        id: '13',
        parentId: '1',
        name: 'Dept',
        title: '部门管理',
        path: 'system/dept',
        component: 'system/views/DeptList',
        icon: 'OfficeBuilding',
        sort: 4,
        menuType: 1,
        permission: 'system:dept:list',
        hidden: false,
      },
      {
        id: '14',
        parentId: '1',
        name: 'Post',
        title: '岗位管理',
        path: 'system/post',
        component: 'system/views/PostList',
        icon: 'Tickets',
        sort: 5,
        menuType: 1,
        permission: 'system:post:list',
        hidden: false,
      },
      {
        id: '18',
        parentId: '1',
        name: 'UserGroup',
        title: '用户组管理',
        path: 'system/user-group',
        component: 'system/views/UserGroupList',
        icon: 'UserFilled',
        sort: 6,
        menuType: 1,
        permission: 'system:userGroup:list',
        hidden: false,
      },
    ],
  },
  {
    id: '2',
    parentId: null,
    name: 'form-designer',
    title: '表单设计器',
    path: 'form/designer',
    component: 'form/views/FormDesigner',
    icon: 'EditPen',
    sort: 2,
    menuType: 1,
    permission: 'form:design:view',
  },
  {
    id: '3',
    parentId: null,
    name: 'workflow',
    title: '流程引擎',
    path: 'workflow',
    component: null,
    icon: 'Share',
    sort: 3,
    menuType: 0,
    permission: 'workflow:view',
    hidden: false,
    children: [
      {
        id: '30',
        parentId: '3',
        name: 'todo-list',
        title: '我的待办',
        path: 'workflow/todo',
        component: 'workflow/views/TodoList',
        icon: 'List',
        sort: 1,
        menuType: 1,
        permission: 'workflow:view',
        hidden: false,
      },
      {
        id: '31',
        parentId: '3',
        name: 'process-def-list',
        title: '流程定义',
        path: 'workflow/defs',
        component: 'workflow/views/ProcessDefList',
        icon: 'Document',
        sort: 2,
        menuType: 1,
        permission: 'workflow:view',
        hidden: false,
      },
      {
        id: '32',
        parentId: '3',
        name: 'processed-list',
        title: '已办任务',
        path: 'workflow/processed',
        component: 'workflow/views/ProcessedList',
        icon: 'Checked',
        sort: 3,
        menuType: 1,
        permission: 'workflow:view',
        hidden: false,
      },
    ],
  },
  {
    id: '4',
    parentId: null,
    name: 'notify',
    title: '通知',
    path: 'notify',
    component: 'notify/views/NotifyHome',
    icon: 'Bell',
    sort: 4,
    menuType: 1,
    permission: 'notify:view',
  },
  {
    // 「智能体」已按 V26 生产形态矫正为目录（menu_type=0, component=NULL），
    // 二级菜单：图定义管理（V26）+ 大模型管理（M07-F01，对齐 V26 图定义管理节点形态）。
    id: '5',
    parentId: null,
    name: 'agent',
    title: '智能体',
    path: 'agent',
    component: null,
    icon: 'MagicStick',
    sort: 5,
    menuType: 0,
    permission: 'agent:view',
    hidden: false,
    children: [
      {
        id: '15',
        parentId: '5',
        name: 'AgentGraphDef',
        title: '图定义管理',
        path: 'agent/graph-def',
        component: 'agent/views/GraphDefList',
        icon: 'Share',
        sort: 10,
        menuType: 1,
        permission: 'agent:model:view',
        hidden: false,
      },
      {
        id: '16',
        parentId: '5',
        name: 'AgentModelList',
        title: '大模型管理',
        path: 'agent/model',
        component: 'agent/views/ModelList',
        icon: 'Cpu',
        sort: 20,
        menuType: 1,
        permission: 'agent:model:view',
        hidden: false,
      },
    ],
  },
  {
    id: '6',
    parentId: null,
    name: 'iot',
    title: '物联网',
    path: 'iot',
    component: 'iot/views/IotHome',
    icon: 'Cpu',
    sort: 6,
    menuType: 1,
    permission: 'iot:view',
  },
  {
    id: '7',
    parentId: null,
    name: 'openapi',
    title: '开放接口',
    path: 'openapi',
    component: 'openapi/views/OpenapiHome',
    icon: 'Connection',
    sort: 7,
    menuType: 1,
    permission: 'openapi:view',
  },
  {
    id: '8',
    parentId: null,
    name: 'form-def-list',
    title: '表单管理',
    path: 'form/form-def-list',
    component: 'form/views/FormDefList',
    icon: 'Document',
    sort: 8,
    menuType: 1,
    permission: 'form:view',
  },
  {
    id: '9',
    parentId: null,
    name: 'storage',
    title: '文件管理',
    path: 'storage',
    component: 'storage/views/StorageList',
    icon: 'FolderOpened',
    sort: 9,
    menuType: 1,
    permission: 'storage:view',
  },
  {
    id: '20',
    parentId: null,
    name: 'job',
    title: '定时任务',
    path: 'job',
    component: null,
    icon: 'Clock',
    sort: 10,
    menuType: 0,
    permission: 'job:view',
    hidden: false,
    children: [
      {
        id: '100',
        parentId: '20',
        name: 'job-list',
        title: '任务管理',
        path: 'job/list',
        component: 'job/views/JobList',
        icon: 'List',
        sort: 1,
        menuType: 1,
        permission: 'job:list',
        hidden: false,
      },
      {
        id: '101',
        parentId: '20',
        name: 'job-log',
        title: '执行日志',
        path: 'job/log',
        component: 'job/views/JobLog',
        icon: 'Document',
        sort: 2,
        menuType: 1,
        permission: 'job:log',
        hidden: false,
      },
    ],
  },
]

/** 示例字典种子：value 字段名 code（对齐 {@link DictItemDTO}）。 */
export const MOCK_DICT_DATA: Record<string, { label: string; code: string }[]> = {
  sex: [
    { label: '男', code: 'MALE' },
    { label: '女', code: 'FEMALE' },
  ],
  status: [
    { label: '待审批', code: 'PENDING' },
    { label: '已通过', code: 'APPROVED' },
    { label: '已驳回', code: 'REJECTED' },
  ],
  dept: [
    { label: '技术部', code: 'TECH' },
    { label: '产品部', code: 'PRODUCT' },
    { label: '设计部', code: 'DESIGN' },
    { label: '人事部', code: 'HR' },
  ],
  leave_type: [
    { label: '事假', code: 'PERSONAL' },
    { label: '病假', code: 'SICK' },
    { label: '年假', code: 'ANNUAL' },
    { label: '调休', code: 'COMPENSATORY' },
    { label: '婚假', code: 'MARRIAGE' },
  ],
}

/**
 * 示例字典类型清单种子（对齐后端 SysDictType 子集：code/name）。
 * 供表单设计器 DICT 字段「绑定字典」下拉的 mock 验收使用；code 与 MOCK_DICT_DATA 的键对齐。
 */
export const MOCK_DICT_TYPES: { code: string; name: string }[] = [
  { code: 'sex', name: '性别' },
  { code: 'status', name: '审批状态' },
  { code: 'dept', name: '部门' },
  { code: 'leave_type', name: '请假类型' },
]

// ─── 演示表单「demo-form」定义 ──────────────────────────────

/** 固定 formKey，仅供验收使用。 */
export const DEMO_FORM_KEY = 'demo-form'

/**
 * 后端裸 definition JSON 对象（非 serialized）。
 * 与 foundation/mock 解耦：此数据经 index.ts handler 做 JSON.stringify 后返回，
 * 再由 form service → parseDefinition 解析为 FormSchema。
 */
export const MOCK_DEMO_FORM_DEFINITION = {
  title: '请假申请单',
  fields: [
    { name: 'applicant', label: '申请人', type: 'TEXT', required: true },
    { name: 'department', label: '部门', type: 'DICT', required: true, dictType: 'dept' },
    { name: 'leaveType', label: '请假类型', type: 'DICT', required: true, dictType: 'leave_type' },
    { name: 'leaveDate', label: '请假日期', type: 'DATE', required: true },
    { name: 'days', label: '天数', type: 'NUMBER', required: true },
    { name: 'urgent', label: '是否加急', type: 'BOOL' },
    { name: 'reason', label: '事由', type: 'RICH_TEXT' },
    { name: 'relatedRecord', label: '关联单号', type: 'REFERENCE', targetFormId: 'demo-form' },
    {
      name: 'attachments',
      label: '附件',
      type: 'TABLE',
      subFields: [
        { name: 'fileName', type: 'TEXT' },
        { name: 'fileSize', type: 'TEXT' },
        { name: 'fileType', type: 'TEXT' },
      ],
    },
  ],
}

/** demo-form 假提交记录列表（与字段定义对应）。 */
export const MOCK_DEMO_SUBMISSIONS = [
  {
    id: 'rec_001',
    applicant: '张三',
    department: 'TECH',
    leaveType: 'SICK',
    leaveDate: '2026-06-20',
    days: 2,
    urgent: false,
    reason: '感冒发烧，需要休息',
    attachments: JSON.stringify([{ fileName: '诊断书.jpg', fileSize: '2.3MB', fileType: '图片' }]),
  },
  {
    id: 'rec_002',
    applicant: '李四',
    department: 'PRODUCT',
    leaveType: 'ANNUAL',
    leaveDate: '2026-06-21',
    days: 5,
    urgent: true,
    reason: '年假出游，已安排工作交接',
    attachments: JSON.stringify([]),
  },
  {
    id: 'rec_003',
    applicant: '王五',
    department: 'DESIGN',
    leaveType: 'PERSONAL',
    leaveDate: '2026-06-25',
    days: 1,
    urgent: false,
    reason: '家里有事需要处理',
    attachments: JSON.stringify([
      { fileName: '申请说明.docx', fileSize: '0.5MB', fileType: '文档' },
    ]),
  },
  {
    id: 'rec_004',
    applicant: '赵六',
    department: 'TECH',
    leaveType: 'COMPENSATORY',
    leaveDate: '2026-06-28',
    days: 0.5,
    urgent: false,
    reason: '调休半天',
    attachments: JSON.stringify([]),
  },
  {
    id: 'rec_005',
    applicant: '陈七',
    department: 'HR',
    leaveType: 'MARRIAGE',
    leaveDate: '2026-07-01',
    days: 15,
    urgent: false,
    reason: '婚假申请',
    attachments: JSON.stringify([
      { fileName: '结婚证.jpg', fileSize: '3.1MB', fileType: '图片' },
      { fileName: '请假申请单.pdf', fileSize: '1.2MB', fileType: '文档' },
    ]),
  },
]

/**
 * 表单数据查询 mock 记录（与 MOCK_DEMO_FORM_DEFINITION 字段对齐）。
 * 每个 record 包含 id + create_time + 所有业务列 + ref 列。
 * 临时数据，上线后由后端真实数据替换。
 */
export const MOCK_FORM_DATA_RECORDS: Record<string, unknown>[] = [
  {
    id: 'fd_001',
    version: 1,
    applicant: '张三',
    department: 'TECH',
    leaveType: 'SICK',
    leaveDate: '2026-06-20',
    days: 2,
    urgent: 1,
    reason: '感冒发烧，需要休息',
    ref_relatedRecord_id: null,
    attachments: JSON.stringify([{ fileName: '诊断书.jpg', fileSize: '2.3MB', fileType: '图片' }]),
    create_time: '2026-06-20 08:30:00',
  },
  {
    id: 'fd_002',
    version: 1,
    applicant: '李四',
    department: 'PRODUCT',
    leaveType: 'ANNUAL',
    leaveDate: '2026-06-21',
    days: 5,
    urgent: 0,
    reason: '年假出游，已安排工作交接',
    ref_relatedRecord_id: null,
    attachments: JSON.stringify([]),
    create_time: '2026-06-21 09:15:00',
  },
  {
    id: 'fd_003',
    version: 1,
    applicant: '王五',
    department: 'DESIGN',
    leaveType: 'PERSONAL',
    leaveDate: '2026-06-25',
    days: 1,
    urgent: 0,
    reason: '家里有事需要处理',
    ref_relatedRecord_id: null,
    attachments: JSON.stringify([
      { fileName: '申请说明.docx', fileSize: '0.5MB', fileType: '文档' },
    ]),
    create_time: '2026-06-25 10:00:00',
  },
  {
    id: 'fd_004',
    version: 1,
    applicant: '赵六',
    department: 'TECH',
    leaveType: 'COMPENSATORY',
    leaveDate: '2026-06-28',
    days: 0.5,
    urgent: 0,
    reason: '调休半天',
    ref_relatedRecord_id: null,
    attachments: JSON.stringify([]),
    create_time: '2026-06-28 14:20:00',
  },
  {
    id: 'fd_005',
    version: 1,
    applicant: '陈七',
    department: 'HR',
    leaveType: 'MARRIAGE',
    leaveDate: '2026-07-01',
    days: 15,
    urgent: 1,
    reason: '婚假申请',
    ref_relatedRecord_id: null,
    attachments: JSON.stringify([
      { fileName: '结婚证.jpg', fileSize: '3.1MB', fileType: '图片' },
      { fileName: '请假申请单.pdf', fileSize: '1.2MB', fileType: '文档' },
    ]),
    create_time: '2026-07-01 07:45:00',
  },
]

/**
 * 通用表单假记录（对齐 handlers.ts 中 generic definition 的字段）。
 * 供 REFERENCE 选择器在目标表单非 demo-form 时也有数据可展示。
 * 字段：id, name(TEXT), department(DICT dept), date(DATE), amount(NUMBER),
 *       remark(RICH_TEXT), create_time。
 * 临时数据，上线后由后端真实数据替换。
 */
export const MOCK_GENERIC_FORM_RECORDS: Record<string, unknown>[] = [
  {
    id: 'gen_001',
    version: 1,
    name: '张三',
    department: 'TECH',
    date: '2026-06-20',
    amount: 1500,
    remark: '通用记录一，用于测试关联选择器',
    create_time: '2026-06-20 08:30:00',
  },
  {
    id: 'gen_002',
    version: 1,
    name: '李四',
    department: 'PRODUCT',
    date: '2026-06-21',
    amount: 3200,
    remark: '通用记录二，用于测试关联选择器',
    create_time: '2026-06-21 09:15:00',
  },
  {
    id: 'gen_003',
    version: 1,
    name: '王五',
    department: 'DESIGN',
    date: '2026-06-22',
    amount: 800,
    remark: '通用记录三，用于测试关联选择器',
    create_time: '2026-06-22 10:00:00',
  },
]

/**
 * Mock 表单定义草稿存储（内存，供 form-def mock handlers 读写）。
 *
 * 新建草稿 → createFormDef 在此插入一条；存 definition → saveFormConfig 在此更新；
 * 取 definition → getFormDefinitionById 在此读取；发布 → publishFormDef 在此更新状态。
 * 临时数据，后端真实端点就绪后下线。
 */
export const MOCK_FORM_DEF_STORE: Map<
  string,
  {
    id: string
    formKey: string
    name: string
    status: 'DRAFT' | 'PUBLISHED'
    definition: string
  }
> = new Map()

// ─── MOCK_FORM_DEF_STORE 种子数据 ───────────────────────────
// 临时数据，对齐分页接口 handler 的响应形状预期。
// 与第四刀 create handler 共用同一 store：设计器新建的草稿自动出现在列表。
// 种子包含 DRAFT + PUBLISHED 各至少一条，供列表页验收状态标签色。

export const MOCK_FORM_DEF_SEEDS: Array<{
  id: string
  formKey: string
  name: string
  status: 'DRAFT' | 'PUBLISHED'
  definition: string
}> = [
  {
    id: 'seed-def-001',
    formKey: 'leave-request',
    name: '请假申请单',
    status: 'PUBLISHED',
    definition: JSON.stringify(MOCK_DEMO_FORM_DEFINITION),
  },
  {
    id: 'seed-def-002',
    formKey: 'expense-report',
    name: '费用报销单',
    status: 'DRAFT',
    definition: JSON.stringify({ title: '费用报销单', fields: [] }),
  },
  {
    id: 'seed-def-003',
    formKey: 'purchase-order',
    name: '采购订单',
    status: 'PUBLISHED',
    definition: JSON.stringify({ title: '采购订单', fields: [] }),
  },
  {
    id: 'seed-def-004',
    formKey: 'travel-reimbursement',
    name: '差旅报销',
    status: 'DRAFT',
    definition: JSON.stringify({ title: '差旅报销', fields: [] }),
  },
  {
    id: 'seed-def-005',
    formKey: 'contract-approval',
    name: '合同审批',
    status: 'PUBLISHED',
    definition: JSON.stringify({ title: '合同审批', fields: [] }),
  },
]

function initFormDefStore(): void {
  if (MOCK_FORM_DEF_STORE.size === 0) {
    for (const seed of MOCK_FORM_DEF_SEEDS) {
      MOCK_FORM_DEF_STORE.set(seed.id, seed)
    }
  }
}
initFormDefStore()

// ─── 待办任务 Mock 种子 ──────────────────────────────
export const MOCK_TODO_TASKS: Array<{
  taskId: string
  processInstanceId: string
  processName: string
  formKey: string
  businessKey: string
  createTime: string
}> = [
  {
    taskId: 'mock-task-001',
    processInstanceId: 'mock-proc-001',
    processName: '请假审批流程',
    formKey: 'leave-request',
    businessKey: 'fd_001',
    createTime: '2026-07-10T09:15:00',
  },
  {
    taskId: 'mock-task-002',
    processInstanceId: 'mock-proc-002',
    processName: '采购审批流程',
    formKey: 'purchase-order',
    businessKey: 'fd_003',
    createTime: '2026-07-11T14:30:00',
  },
  {
    taskId: 'mock-task-003',
    processInstanceId: 'mock-proc-003',
    processName: '合同审批流程',
    formKey: 'contract-approval',
    businessKey: 'fd_005',
    createTime: '2026-07-12T10:00:00',
  },
  {
    taskId: 'mock-task-004',
    processInstanceId: 'mock-proc-004',
    processName: '费用报销流程',
    formKey: 'expense-report',
    businessKey: 'gen_001',
    createTime: '2026-07-13T08:45:00',
  },
  {
    taskId: 'mock-task-005',
    processInstanceId: 'mock-proc-005',
    processName: '请假审批流程',
    formKey: 'leave-request',
    businessKey: 'gen_002',
    createTime: '2026-07-14T11:20:00',
  },
]

// ─── 流程定义 Mock 种子 ──────────────────────────────
export const MOCK_PROCESS_DEFS: Array<{
  id: number
  processKey: string
  name: string
  formKey: string
  defVersion: number
  status: 'DRAFT' | 'PUBLISHED'
  createTime: string
  updateTime: string
}> = [
  {
    id: 1,
    processKey: 'skeleton_approval',
    name: '单节点审批流程',
    formKey: 'it_application',
    defVersion: 1,
    status: 'PUBLISHED',
    createTime: '2026-07-05 10:00:00',
    updateTime: '2026-07-05 10:00:00',
  },
  {
    id: 2,
    processKey: 'leave_approval',
    name: '请假审批流程',
    formKey: 'leave-request',
    defVersion: 1,
    status: 'PUBLISHED',
    createTime: '2026-07-08 14:20:00',
    updateTime: '2026-07-09 09:10:00',
  },
  {
    id: 3,
    processKey: 'contract_approval',
    name: '合同审批流程',
    formKey: 'contract-approval',
    defVersion: 1,
    status: 'PUBLISHED',
    createTime: '2026-07-06 16:30:00',
    updateTime: '2026-07-10 11:00:00',
  },
  {
    id: 4,
    processKey: 'purchase_draft',
    name: '采购审批（草稿）',
    formKey: 'purchase-order',
    defVersion: 1,
    status: 'DRAFT',
    createTime: '2026-07-12 08:00:00',
    updateTime: '2026-07-12 08:00:00',
  },
  {
    id: 5,
    processKey: 'expense_approval',
    name: '费用报销流程',
    formKey: 'expense-report',
    defVersion: 1,
    status: 'PUBLISHED',
    createTime: '2026-07-09 13:45:00',
    updateTime: '2026-07-11 15:30:00',
  },
]

// ─── 已办任务 Mock 种子 ──────────────────────────────
export const MOCK_PROCESSED_TASKS: Array<{
  taskId: string
  taskName: string
  processInstanceId: string
  processName: string | null
  formKey: string
  businessKey: string
  createTime: string
  endTime: string | null
}> = [
  {
    taskId: 'processed-001',
    taskName: '请假审批',
    processInstanceId: 'proc-001',
    processName: '请假审批流程',
    formKey: 'leave-request',
    businessKey: 'fd_010',
    createTime: '2026-07-10T08:00:00',
    endTime: '2026-07-10T15:30:00',
  },
  {
    taskId: 'processed-002',
    taskName: '报销审批',
    processInstanceId: 'proc-002',
    processName: '费用报销流程',
    formKey: 'expense-report',
    businessKey: 'fd_011',
    createTime: '2026-07-12T09:00:00',
    endTime: '2026-07-12T17:00:00',
  },
  {
    taskId: 'processed-003',
    taskName: '合同审批',
    processInstanceId: 'proc-003',
    processName: null,
    formKey: 'contract-approval',
    businessKey: 'fd_012',
    createTime: '2026-07-14T10:00:00',
    endTime: null,
  },
]

// ─── 通知消息 Mock 种子 ──────────────────────────────
export const MOCK_NOTIFY_MESSAGES: Array<{
  id: number
  recipientId: number
  title: string
  content: string
  bizType: 'WF_TODO' | 'WF_APPROVED'
  bizId: string | null
  read: boolean
  createTime: string
  createBy: number | null
  updateTime: string
  updateBy: number | null
  tenantId: number
}> = [
  {
    id: 1,
    recipientId: 1,
    title: '新待办任务：请假申请审批',
    content: '张三提交了请假申请，等待您审批。请假日期：2026-07-10，共2天。',
    bizType: 'WF_TODO',
    bizId: 'mock-task-001',
    read: false,
    createTime: '2026-07-15T09:00:00',
    createBy: null,
    updateTime: '2026-07-15T09:00:00',
    updateBy: null,
    tenantId: 1,
  },
  {
    id: 2,
    recipientId: 1,
    title: '审批结果：采购订单已通过',
    content: '您提交的采购订单已通过审批，请查看详情。',
    bizType: 'WF_APPROVED',
    bizId: 'mock-task-002',
    read: false,
    createTime: '2026-07-14T16:30:00',
    createBy: null,
    updateTime: '2026-07-14T16:30:00',
    updateBy: null,
    tenantId: 1,
  },
  {
    id: 3,
    recipientId: 1,
    title: '新待办任务：合同审批流程',
    content: '李四提交了合同审批申请，请尽快处理。合同编号：CT-2026-0712。',
    bizType: 'WF_TODO',
    bizId: 'mock-task-003',
    read: false,
    createTime: '2026-07-14T10:15:00',
    createBy: null,
    updateTime: '2026-07-14T10:15:00',
    updateBy: null,
    tenantId: 1,
  },
  {
    id: 4,
    recipientId: 1,
    title: '会议通知：项目复盘会',
    content: '项目复盘会定于7月16日14:00在3楼会议室召开，请准时参加。',
    bizType: 'WF_TODO',
    bizId: null,
    read: true,
    createTime: '2026-07-13T08:00:00',
    createBy: null,
    updateTime: '2026-07-13T08:00:00',
    updateBy: null,
    tenantId: 1,
  },
  {
    id: 5,
    recipientId: 1,
    title: '审批结果：费用报销已驳回',
    content: '您提交的费用报销单因缺少发票附件被驳回，请补充后重新提交。',
    bizType: 'WF_APPROVED',
    bizId: 'mock-task-004',
    read: true,
    createTime: '2026-07-12T15:45:00',
    createBy: null,
    updateTime: '2026-07-12T15:45:00',
    updateBy: null,
    tenantId: 1,
  },
  {
    id: 6,
    recipientId: 1,
    title: '新待办任务：差旅报销审批',
    content: '王五提交了差旅报销申请，金额3,200元，请审批。',
    bizType: 'WF_TODO',
    bizId: 'mock-task-005',
    read: true,
    createTime: '2026-07-11T11:20:00',
    createBy: null,
    updateTime: '2026-07-11T11:20:00',
    updateBy: null,
    tenantId: 1,
  },
  {
    id: 7,
    recipientId: 1,
    title: '系统通知：密码即将过期',
    content: '您的登录密码将于7天后过期，请及时修改密码以保障账户安全。',
    bizType: 'WF_TODO',
    bizId: null,
    read: false,
    createTime: '2026-07-10T09:00:00',
    createBy: null,
    updateTime: '2026-07-10T09:00:00',
    updateBy: null,
    tenantId: 1,
  },
  {
    id: 8,
    recipientId: 1,
    title: '审批结果：请假申请已通过',
    content: '您提交的请假申请（2026-07-10）已通过审批，请合理安排工作。',
    bizType: 'WF_APPROVED',
    bizId: 'fd_001',
    read: true,
    createTime: '2026-07-10T08:30:00',
    createBy: null,
    updateTime: '2026-07-10T08:30:00',
    updateBy: null,
    tenantId: 1,
  },
]

// ─── 系统管理 CRUD mock 数据（可变数组，handler 中原地 mutate） ───

// ─── 用户组 Mock 种子（D112：P28/I36） ──────────────────────
// 语义与真实接口一致：groupCode 租户内唯一、status 0=启用 1=停用、
// memberIds 引用 MOCK_USERS_LIST 的 id；含停用用户（赵六 status=1）演示失效成员。
export const MOCK_USER_GROUPS_LIST: Array<{
  id: string
  groupCode: string
  groupName: string
  status: number
  remark: string | null
  memberIds: string[]
  createTime: string
  updateTime: string
}> = [
  {
    id: '1',
    groupCode: 'G-TECH',
    groupName: '技术委员会',
    status: 0,
    remark: '跨部门技术骨干归集',
    memberIds: ['2', '3'],
    createTime: '2026-08-18 10:00:00',
    updateTime: '2026-08-18 10:00:00',
  },
  {
    id: '2',
    groupCode: 'G-HR',
    groupName: '人事专项组',
    status: 0,
    remark: '人事流程协作',
    memberIds: ['3', '4'],
    createTime: '2026-08-18 11:00:00',
    updateTime: '2026-08-18 11:00:00',
  },
  {
    id: '3',
    groupCode: 'G-OLD',
    groupName: '历史归档组',
    status: 1,
    remark: '已停用，保留配置',
    memberIds: ['5'], // 成员为停用用户（赵六 status=1）→ 失效成员展示
    createTime: '2026-08-18 12:00:00',
    updateTime: '2026-08-18 12:00:00',
  },
]

export const MOCK_USERS_LIST = [
  {
    id: '1',
    username: 'admin',
    realName: '系统管理员',
    email: 'admin@example.com',
    phone: '13800000001',
    sex: 1,
    status: 0,
    deptId: '1',
    roleIds: ['2'],
    postIds: ['1'],
    isAdmin: true,
    avatar: null,
    createTime: '2026-06-01 10:00:00',
    updateTime: '2026-07-01 10:00:00',
  },
  {
    id: '2',
    username: 'zhangsan',
    realName: '张三',
    email: 'zhangsan@example.com',
    phone: '13800000002',
    sex: 1,
    status: 0,
    deptId: '2',
    roleIds: ['3'],
    postIds: ['3'],
    isAdmin: false,
    avatar: null,
    createTime: '2026-06-15 09:00:00',
    updateTime: '2026-07-10 14:00:00',
  },
  {
    id: '3',
    username: 'lisi',
    realName: '李四',
    email: 'lisi@example.com',
    phone: '13800000003',
    sex: 2,
    status: 0,
    deptId: '2',
    roleIds: ['3'],
    postIds: ['3', '4'],
    isAdmin: false,
    avatar: null,
    createTime: '2026-06-20 11:00:00',
    updateTime: '2026-07-12 16:00:00',
  },
  {
    id: '4',
    username: 'wangwu',
    realName: '王五',
    email: 'wangwu@example.com',
    phone: '13800000004',
    sex: 1,
    status: 0,
    deptId: '3',
    // MOCK_ROLES_LIST 重复 id 修正后 HR 专员为 id '5'；保持原绑定语义（HR 专员）
    roleIds: ['5'],
    postIds: ['4'],
    isAdmin: false,
    avatar: null,
    createTime: '2026-07-01 08:00:00',
    updateTime: '2026-07-15 10:00:00',
  },
  {
    id: '5',
    username: 'zhaoliu',
    realName: '赵六',
    email: 'zhaoliu@example.com',
    phone: '13800000005',
    sex: 2,
    status: 1,
    deptId: '3',
    roleIds: [],
    postIds: ['5'],
    isAdmin: false,
    avatar: null,
    createTime: '2026-07-05 13:00:00',
    updateTime: '2026-07-08 09:00:00',
  },
]

export const MOCK_ROLES_LIST = [
  {
    id: '1',
    name: '超级管理员',
    code: 'superadmin',
    sort: 1,
    status: 1,
    // 后端 DataScope ordinal：ALL=0（V31 seed 中 superadmin/admin 均为 0）。
    // 旧值 5 是越界陈旧值（会掩盖权限缺陷），已按后端契约修正为 0。
    dataScope: 0,
    builtIn: true,
    description: '系统内置超级管理员角色',
    createTime: '2026-06-01 10:00:00',
    updateTime: '2026-06-01 10:00:00',
  },
  {
    id: '2',
    name: '管理员',
    code: 'admin',
    sort: 2,
    status: 1,
    dataScope: 0,
    builtIn: false,
    description: '系统初始化普通管理员角色',
    createTime: '2026-08-18 00:00:00',
    updateTime: '2026-08-18 00:00:00',
  },
  {
    id: '3',
    name: '普通用户',
    code: 'user',
    sort: 2,
    status: 1,
    dataScope: 1,
    builtIn: true,
    description: '系统内置普通用户角色',
    createTime: '2026-06-01 10:00:00',
    updateTime: '2026-06-01 10:00:00',
  },
  {
    id: '4',
    name: '部门经理',
    code: 'manager',
    sort: 3,
    status: 1,
    dataScope: 3,
    builtIn: false,
    description: '部门级管理权限',
    createTime: '2026-06-15 09:00:00',
    updateTime: '2026-07-01 14:00:00',
  },
  {
    id: '5',
    name: 'HR 专员',
    code: 'hr',
    sort: 4,
    status: 1,
    dataScope: 2,
    builtIn: false,
    description: '人事管理权限',
    createTime: '2026-07-01 08:00:00',
    updateTime: '2026-07-10 10:00:00',
  },
]

/**
 * 角色菜单/按钮权限绑定夹具（按角色 id 存储，值=已绑定 menuId 数字数组）。
 *
 * 语义与 V31 真实 seed 对齐：
 * - id=2 admin：显式绑全量（含目录/页面/按钮），页面回填可演示；
 * - id=1 superadmin：不依赖绑定（真实后端超管按 code 旁路，sys_role_menu 无 superadmin 行）；
 * - id=3 user：空绑定（真实 V31 未给 user 角色 seed 绑定）。
 *
 * GET/PUT /system/role/{id}/menus 的 mock handler 对该对象做真实内存更新，
 * 保存后的状态可被后续 GET 与页面回填观察（方向 §5 风险 1 防护）。
 */
export const MOCK_ROLE_MENU_BINDINGS: Record<string, number[]> = {
  // admin：全量菜单树叶子（目录 1、页面 11/12/13/14/18 + 按钮 110/111/112/120/121/122）
  '2': [1, 11, 12, 13, 14, 18, 110, 111, 112, 120, 121, 122],
  // superadmin：无绑定行（超管旁路，与真实 seed 一致）
  // user：空绑定
}

// 依赖完备后补齐普通管理员会话的按钮权限（admin 角色绑定 → permission 并集）。
// 需在 MOCK_ROLE_MENU_BINDINGS 声明之后执行，避免 TDZ。
MOCK_SESSION_DATA_ADMIN.permissions = collectSessionPermissions(['admin'])

export const MOCK_DEPTS_LIST = [
  {
    id: '1',
    parentId: '0',
    name: '总公司',
    code: 'HQ',
    sort: 1,
    status: 0,
    createTime: '2026-06-01 10:00:00',
    updateTime: '2026-06-01 10:00:00',
  },
  {
    id: '2',
    parentId: '1',
    name: '技术部',
    code: 'TECH',
    sort: 1,
    status: 0,
    createTime: '2026-06-01 10:00:00',
    updateTime: '2026-06-15 09:00:00',
  },
  {
    id: '3',
    parentId: '1',
    name: '产品部',
    code: 'PRODUCT',
    sort: 2,
    status: 0,
    createTime: '2026-06-01 10:00:00',
    updateTime: '2026-07-01 14:00:00',
  },
  {
    id: '4',
    parentId: '1',
    name: '人事部',
    code: 'HR',
    sort: 3,
    status: 0,
    createTime: '2026-06-01 10:00:00',
    updateTime: '2026-07-10 10:00:00',
  },
  {
    id: '5',
    parentId: '2',
    name: '前端组',
    code: 'TECH-FE',
    sort: 1,
    status: 0,
    createTime: '2026-06-15 09:00:00',
    updateTime: '2026-07-01 10:00:00',
  },
  {
    id: '6',
    parentId: '2',
    name: '后端组',
    code: 'TECH-BE',
    sort: 2,
    status: 0,
    createTime: '2026-06-15 09:00:00',
    updateTime: '2026-07-01 10:00:00',
  },
  {
    id: '7',
    parentId: '1',
    name: '财务部',
    code: 'FIN',
    sort: 4,
    status: 1,
    createTime: '2026-06-01 10:00:00',
    updateTime: '2026-07-01 10:00:00',
  },
]

export const MOCK_POSTS_LIST = [
  {
    id: '1',
    code: 'CEO',
    name: '首席执行官',
    sort: 1,
    status: 1,
    description: '公司最高决策者',
    createTime: '2026-06-01 10:00:00',
    updateTime: '2026-06-01 10:00:00',
  },
  {
    id: '2',
    code: 'CTO',
    name: '首席技术官',
    sort: 2,
    status: 1,
    description: '技术方向负责人',
    createTime: '2026-06-01 10:00:00',
    updateTime: '2026-06-01 10:00:00',
  },
  {
    id: '3',
    code: 'DEV',
    name: '开发工程师',
    sort: 3,
    status: 1,
    description: '软件开发',
    createTime: '2026-06-15 09:00:00',
    updateTime: '2026-07-01 10:00:00',
  },
  {
    id: '4',
    code: 'PM',
    name: '产品经理',
    sort: 4,
    status: 1,
    description: '产品规划与需求管理',
    createTime: '2026-06-20 11:00:00',
    updateTime: '2026-07-10 14:00:00',
  },
  {
    id: '5',
    code: 'QA',
    name: '测试工程师',
    sort: 5,
    status: 0,
    description: '质量保障（已停用）',
    createTime: '2026-07-01 08:00:00',
    updateTime: '2026-07-15 10:00:00',
  },
]

// ─── 定时任务 Mock 种子 ──────────────────────────────

export const MOCK_JOB_INFOS: Array<{
  id: number
  jobName: string
  jobGroup: string
  jobType: 'BEAN' | 'FLOW'
  cronExpression: string
  status: 'NORMAL' | 'PAUSED'
  concurrent: boolean
  misfirePolicy: number
  description: string
  beanName: string | null
  beanParams: string | null
  flowDefKey: string | null
  formData: string | null
  lastFireTime: string | null
  nextFireTime: string | null
  createTime: string
  updateTime: string
  createBy: number
  updateBy: number
}> = [
  {
    id: 1,
    jobName: '每日数据备份',
    jobGroup: 'DEFAULT',
    jobType: 'BEAN',
    cronExpression: '0 0 2 * * ?',
    status: 'NORMAL',
    concurrent: false,
    misfirePolicy: 1,
    description: '每日凌晨2点执行数据库备份',
    beanName: 'dataBackupHandler',
    beanParams: '{"backupType": "full", "compress": true}',
    flowDefKey: null,
    formData: null,
    lastFireTime: '2026-07-21T02:00:00',
    nextFireTime: '2026-07-22T02:00:00',
    createTime: '2026-07-15T00:00:00',
    updateTime: '2026-07-15T00:00:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 2,
    jobName: '周报自动生成',
    jobGroup: 'DEFAULT',
    jobType: 'FLOW',
    cronExpression: '0 0 9 ? * MON',
    status: 'NORMAL',
    concurrent: false,
    misfirePolicy: 0,
    description: '每周一9点发起周报提交流程',
    beanName: null,
    beanParams: null,
    flowDefKey: 'weekly-report-process',
    formData: '{"templateType": "weekly", "notifyUsers": [1, 2]}',
    lastFireTime: '2026-07-20T09:00:00',
    nextFireTime: '2026-07-27T09:00:00',
    createTime: '2026-07-10T00:00:00',
    updateTime: '2026-07-10T00:00:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 3,
    jobName: '临时数据清理',
    jobGroup: 'DEFAULT',
    jobType: 'BEAN',
    cronExpression: '0 30 1 * * ?',
    status: 'PAUSED',
    concurrent: false,
    misfirePolicy: 2,
    description: '清理超过30天的临时文件',
    beanName: 'tempFileCleanupHandler',
    beanParams: '{"maxAgeDays": 30, "dryRun": false}',
    flowDefKey: null,
    formData: null,
    lastFireTime: '2026-07-19T01:30:00',
    nextFireTime: null,
    createTime: '2026-07-08T00:00:00',
    updateTime: '2026-07-18T00:00:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 4,
    jobName: '系统健康检查',
    jobGroup: 'SYSTEM',
    jobType: 'BEAN',
    cronExpression: '0/30 * * * * ?',
    status: 'NORMAL',
    concurrent: true,
    misfirePolicy: 1,
    description: '每30秒检查系统各组件健康状态并发送告警',
    beanName: 'healthCheckHandler',
    beanParams: '{"checks": ["db", "redis", "disk"], "alertThreshold": 3}',
    flowDefKey: null,
    formData: null,
    lastFireTime: '2026-07-21T10:00:30',
    nextFireTime: '2026-07-21T10:01:00',
    createTime: '2026-06-01T00:00:00',
    updateTime: '2026-06-01T00:00:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 5,
    jobName: '请假到期自动审批',
    jobGroup: 'DEFAULT',
    jobType: 'FLOW',
    cronExpression: '0 0 10 * * ?',
    status: 'NORMAL',
    concurrent: false,
    misfirePolicy: 1,
    description: '每日10点检查逾期未审批的请假申请并自动通过',
    beanName: null,
    beanParams: null,
    flowDefKey: 'leave-auto-approve',
    formData: '{"maxOverdueDays": 3, "autoApproveType": "LEAVE"}',
    lastFireTime: '2026-07-21T10:00:00',
    nextFireTime: '2026-07-22T10:00:00',
    createTime: '2026-07-05T00:00:00',
    updateTime: '2026-07-05T00:00:00',
    createBy: 1,
    updateBy: 1,
  },
]

export const MOCK_JOB_LOGS: Array<{
  id: number
  jobId: number
  jobName: string
  jobGroup: string
  triggerType: 'AUTO' | 'MANUAL'
  jobParams: string | null
  execStatus: 'RUNNING' | 'SUCCESS' | 'FAILED'
  startTime: string
  endTime: string | null
  duration: number | null
  resultMsg: string | null
  exceptionStack: string | null
  createTime: string
}> = [
  {
    id: 1,
    jobId: 1,
    jobName: '每日数据备份',
    jobGroup: 'DEFAULT',
    triggerType: 'AUTO',
    jobParams: '{"backupType": "full", "compress": true}',
    execStatus: 'SUCCESS',
    startTime: '2026-07-21T02:00:00',
    endTime: '2026-07-21T02:05:32',
    duration: 332000,
    resultMsg: '备份完成，文件大小 2.3GB，已上传至 OSS',
    exceptionStack: null,
    createTime: '2026-07-21T02:05:32',
  },
  {
    id: 2,
    jobId: 1,
    jobName: '每日数据备份',
    jobGroup: 'DEFAULT',
    triggerType: 'AUTO',
    jobParams: '{"backupType": "full", "compress": true}',
    execStatus: 'SUCCESS',
    startTime: '2026-07-20T02:00:00',
    endTime: '2026-07-20T02:04:58',
    duration: 298000,
    resultMsg: '备份完成，文件大小 2.1GB，已上传至 OSS',
    exceptionStack: null,
    createTime: '2026-07-20T02:04:58',
  },
  {
    id: 3,
    jobId: 4,
    jobName: '系统健康检查',
    jobGroup: 'SYSTEM',
    triggerType: 'AUTO',
    jobParams: '{"checks": ["db", "redis", "disk"], "alertThreshold": 3}',
    execStatus: 'SUCCESS',
    startTime: '2026-07-21T10:00:30',
    endTime: '2026-07-21T10:00:31',
    duration: 1200,
    resultMsg: '所有组件正常',
    exceptionStack: null,
    createTime: '2026-07-21T10:00:31',
  },
  {
    id: 4,
    jobId: 4,
    jobName: '系统健康检查',
    jobGroup: 'SYSTEM',
    triggerType: 'AUTO',
    jobParams: '{"checks": ["db", "redis", "disk"], "alertThreshold": 3}',
    execStatus: 'FAILED',
    startTime: '2026-07-21T10:00:00',
    endTime: '2026-07-21T10:00:05',
    duration: 5012,
    resultMsg: '磁盘使用率超过阈值：92%',
    exceptionStack:
      'java.lang.RuntimeException: Disk usage 92% exceeds threshold 90%\n\tat com.example.health.DiskCheck.run(DiskCheck.java:42)\n\tat com.example.health.HealthCheckHandler.execute(HealthCheckHandler.java:28)',
    createTime: '2026-07-21T10:00:05',
  },
  {
    id: 5,
    jobId: 2,
    jobName: '周报自动生成',
    jobGroup: 'DEFAULT',
    triggerType: 'AUTO',
    jobParams: '{"templateType": "weekly", "notifyUsers": [1, 2]}',
    execStatus: 'SUCCESS',
    startTime: '2026-07-20T09:00:00',
    endTime: '2026-07-20T09:00:15',
    duration: 15000,
    resultMsg: '已发起周报流程，分配审批人：张三',
    exceptionStack: null,
    createTime: '2026-07-20T09:00:15',
  },
  {
    id: 6,
    jobId: 1,
    jobName: '每日数据备份',
    jobGroup: 'DEFAULT',
    triggerType: 'MANUAL',
    jobParams: '{"backupType": "incremental", "compress": false}',
    execStatus: 'SUCCESS',
    startTime: '2026-07-21T09:15:00',
    endTime: '2026-07-21T09:17:45',
    duration: 165000,
    resultMsg: '增量备份完成，文件大小 340MB',
    exceptionStack: null,
    createTime: '2026-07-21T09:17:45',
  },
  {
    id: 7,
    jobId: 5,
    jobName: '请假到期自动审批',
    jobGroup: 'DEFAULT',
    triggerType: 'AUTO',
    jobParams: '{"maxOverdueDays": 3, "autoApproveType": "LEAVE"}',
    execStatus: 'SUCCESS',
    startTime: '2026-07-21T10:00:00',
    endTime: '2026-07-21T10:00:03',
    duration: 3200,
    resultMsg: '自动审批完成：3条请假申请已通过',
    exceptionStack: null,
    createTime: '2026-07-21T10:00:03',
  },
  {
    id: 8,
    jobId: 3,
    jobName: '临时数据清理',
    jobGroup: 'DEFAULT',
    triggerType: 'MANUAL',
    jobParams: '{"maxAgeDays": 15, "dryRun": true}',
    execStatus: 'RUNNING',
    startTime: '2026-07-21T10:05:00',
    endTime: null,
    duration: null,
    resultMsg: null,
    exceptionStack: null,
    createTime: '2026-07-21T10:05:00',
  },
]

// ─── 文件存储 Mock 种子 ──────────────────────────────

export const MOCK_STORAGE_FILES: Array<{
  id: number
  originalName: string
  storageKey: string
  storageName: string
  fileSize: number
  contentType: string
  fileExt: string
  providerType: string
  bucketName: string
  storageUrl: string
  createTime: string
  updateTime: string
  createBy: number
  updateBy: number
}> = [
  {
    id: 1,
    originalName: '请假申请单模板.pdf',
    storageKey: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890.pdf',
    storageName: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890.pdf',
    fileSize: 245760,
    contentType: 'application/pdf',
    fileExt: 'pdf',
    providerType: 'minio',
    bucketName: 'sw-files',
    storageUrl: '/files/a1b2c3d4-e5f6-7890-abcd-ef1234567890.pdf',
    createTime: '2026-07-15T09:00:00',
    updateTime: '2026-07-15T09:00:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 2,
    originalName: '产品原型截图.png',
    storageKey: 'b2c3d4e5-f6a7-8901-bcde-f12345678901.png',
    storageName: 'b2c3d4e5-f6a7-8901-bcde-f12345678901.png',
    fileSize: 1572864,
    contentType: 'image/png',
    fileExt: 'png',
    providerType: 'cos',
    bucketName: 'sw-images-1250000000',
    storageUrl: 'https://sw-images-1250000000.cos.ap-guangzhou.myqcloud.com/files/b2c3d4e5.png',
    createTime: '2026-07-15T14:30:00',
    updateTime: '2026-07-15T14:30:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 3,
    originalName: '2026年Q2工作总结.docx',
    storageKey: 'c3d4e5f6-a7b8-9012-cdef-123456789012.docx',
    storageName: 'c3d4e5f6-a7b8-9012-cdef-123456789012.docx',
    fileSize: 51200,
    contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    fileExt: 'docx',
    providerType: 'local',
    bucketName: 'default',
    storageUrl: '/upload/c3d4e5f6-a7b8-9012-cdef-123456789012.docx',
    createTime: '2026-07-16T10:15:00',
    updateTime: '2026-07-16T10:15:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 4,
    originalName: '项目进度表.xlsx',
    storageKey: 'd4e5f6a7-b8c9-0123-defa-234567890123.xlsx',
    storageName: 'd4e5f6a7-b8c9-0123-defa-234567890123.xlsx',
    fileSize: 1048576,
    contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    fileExt: 'xlsx',
    providerType: 'qiniu',
    bucketName: 'sw-docs',
    storageUrl: 'https://cdn.example.com/files/d4e5f6a7-b8c9-0123-defa-234567890123.xlsx',
    createTime: '2026-07-16T16:45:00',
    updateTime: '2026-07-16T16:45:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 5,
    originalName: '团建合影.jpg',
    storageKey: 'e5f6a7b8-c9d0-1234-efab-345678901234.jpg',
    storageName: 'e5f6a7b8-c9d0-1234-efab-345678901234.jpg',
    fileSize: 3145728,
    contentType: 'image/jpeg',
    fileExt: 'jpg',
    providerType: 'cos',
    bucketName: 'sw-images-1250000000',
    storageUrl: 'https://sw-images-1250000000.cos.ap-guangzhou.myqcloud.com/files/e5f6a7b8.jpg',
    createTime: '2026-07-17T08:00:00',
    updateTime: '2026-07-17T08:00:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 6,
    originalName: '会议纪要.txt',
    storageKey: 'f6a7b8c9-d0e1-2345-fabc-456789012345.txt',
    storageName: 'f6a7b8c9-d0e1-2345-fabc-456789012345.txt',
    fileSize: 2048,
    contentType: 'text/plain',
    fileExt: 'txt',
    providerType: 'local',
    bucketName: 'default',
    storageUrl: '/upload/f6a7b8c9-d0e1-2345-fabc-456789012345.txt',
    createTime: '2026-07-17T11:30:00',
    updateTime: '2026-07-17T11:30:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 7,
    originalName: '系统架构图.svg',
    storageKey: 'a7b8c9d0-e1f2-3456-abcd-567890123456.svg',
    storageName: 'a7b8c9d0-e1f2-3456-abcd-567890123456.svg',
    fileSize: 45056,
    contentType: 'image/svg+xml',
    fileExt: 'svg',
    providerType: 'minio',
    bucketName: 'sw-files',
    storageUrl: '/files/a7b8c9d0-e1f2-3456-abcd-567890123456.svg',
    createTime: '2026-07-18T09:45:00',
    updateTime: '2026-07-18T09:45:00',
    createBy: 1,
    updateBy: 1,
  },
  {
    id: 8,
    originalName: 'API接口文档.pdf',
    storageKey: 'b8c9d0e1-f2a3-4567-bcde-678901234567.pdf',
    storageName: 'b8c9d0e1-f2a3-4567-bcde-678901234567.pdf',
    fileSize: 2097152,
    contentType: 'application/pdf',
    fileExt: 'pdf',
    providerType: 'qiniu',
    bucketName: 'sw-docs',
    storageUrl: 'https://cdn.example.com/files/b8c9d0e1-f2a3-4567-bcde-678901234567.pdf',
    createTime: '2026-07-18T15:20:00',
    updateTime: '2026-07-18T15:20:00',
    createBy: 1,
    updateBy: 1,
  },
]

// ─── 流程实例 mock ──────────────────────────────────
// processDefKey 引用 MOCK_PROCESS_DEFS 中的 PUBLISHED 条目（leave_approval / skeleton_approval / contract_approval）
export const MOCK_INSTANCES: Array<{
  id: number
  processInstanceId: string
  processDefKey: string
  processName: string | null
  businessKey: string
  formKey: string
  initiatorId: number
  status: 'RUNNING' | 'APPROVED' | 'REJECTED'
  createTime: string
}> = [
  {
    id: 1,
    processInstanceId: 'proc-001',
    processDefKey: 'leave_approval',
    processName: '请假审批流程',
    businessKey: 'rec-leave-001',
    formKey: 'leave-request',
    initiatorId: 1,
    status: 'RUNNING',
    createTime: '2026-07-20T09:30:00',
  },
  {
    id: 2,
    processInstanceId: 'proc-002',
    processDefKey: 'skeleton_approval',
    processName: '单节点审批流程',
    businessKey: 'rec-it-002',
    formKey: 'it_application',
    initiatorId: 2,
    status: 'APPROVED',
    createTime: '2026-07-15T14:00:00',
  },
  {
    id: 3,
    processInstanceId: 'proc-003',
    processDefKey: 'contract_approval',
    processName: '合同审批流程',
    businessKey: 'rec-contract-003',
    formKey: 'contract-approval',
    initiatorId: 3,
    status: 'REJECTED',
    createTime: '2026-07-18T11:15:00',
  },
  {
    id: 4,
    processInstanceId: 'proc-004',
    processDefKey: 'leave_approval',
    processName: '请假审批流程',
    businessKey: 'rec-leave-004',
    formKey: 'leave-request',
    initiatorId: 1,
    status: 'RUNNING',
    createTime: '2026-07-22T08:45:00',
  },
  {
    id: 5,
    processInstanceId: 'proc-005',
    processDefKey: 'skeleton_approval',
    processName: '单节点审批流程',
    businessKey: 'rec-it-005',
    formKey: 'it_application',
    initiatorId: 4,
    status: 'APPROVED',
    createTime: '2026-07-10T16:30:00',
  },
  {
    id: 6,
    processInstanceId: 'proc-006',
    processDefKey: 'leave_approval',
    processName: '请假审批流程',
    businessKey: 'rec-leave-006',
    formKey: 'leave-request',
    initiatorId: 2,
    status: 'RUNNING',
    createTime: '2026-07-25T13:20:00',
  },
]

// ─── 流程实例详情 mock（按 processInstanceId 索引） ──
// activeNodeIds 中的 ID 对应 BPMN XML mock 中的 activity ID
export const MOCK_INSTANCE_DETAILS: Record<
  string,
  {
    activeNodeIds: string[]
    flowTrace: Array<{
      activityId: string
      activityName: string | null
      activityType: string
      startTime: string | null
      endTime: string | null
      assignee: string | null
      taskId: string | null
    }>
  }
> = {
  'proc-001': {
    // RUNNING — 活跃节点：部门审批
    activeNodeIds: ['Activity_approve1'],
    flowTrace: [
      {
        activityId: 'StartEvent_1',
        activityName: '开始',
        activityType: 'startEvent',
        startTime: '2026-07-20T09:30:00',
        endTime: '2026-07-20T09:30:00',
        assignee: null,
        taskId: null,
      },
      {
        activityId: 'Flow_submit2approve',
        activityName: null,
        activityType: 'sequenceFlow',
        startTime: '2026-07-20T09:30:00',
        endTime: '2026-07-20T09:30:00',
        assignee: null,
        taskId: null,
      },
      {
        activityId: 'Activity_submit',
        activityName: '提交申请',
        activityType: 'userTask',
        startTime: '2026-07-20T09:30:00',
        endTime: '2026-07-20T10:15:00',
        assignee: '1',
        taskId: 'task-submit-001',
      },
      {
        activityId: 'Flow_submit2approve1',
        activityName: null,
        activityType: 'sequenceFlow',
        startTime: '2026-07-20T10:15:00',
        endTime: '2026-07-20T10:15:00',
        assignee: null,
        taskId: null,
      },
      {
        activityId: 'Activity_approve1',
        activityName: '部门经理审批',
        activityType: 'userTask',
        startTime: '2026-07-20T10:15:00',
        endTime: null,
        assignee: '2',
        taskId: 'task-approve1-001',
      },
    ],
  },
  'proc-002': {
    // APPROVED — 已完成（无活跃节点）
    activeNodeIds: [],
    flowTrace: [
      {
        activityId: 'StartEvent_1',
        activityName: '开始',
        activityType: 'startEvent',
        startTime: '2026-07-15T14:00:00',
        endTime: '2026-07-15T14:00:00',
        assignee: null,
        taskId: null,
      },
      {
        activityId: 'Activity_submit',
        activityName: '提交申请',
        activityType: 'userTask',
        startTime: '2026-07-15T14:00:00',
        endTime: '2026-07-15T15:30:00',
        assignee: '2',
        taskId: 'task-submit-002',
      },
      {
        activityId: 'Activity_approve1',
        activityName: '部门经理审批',
        activityType: 'userTask',
        startTime: '2026-07-15T15:30:00',
        endTime: '2026-07-16T09:00:00',
        assignee: '3',
        taskId: 'task-approve1-002',
      },
      {
        activityId: 'EndEvent_1',
        activityName: '结束',
        activityType: 'endEvent',
        startTime: '2026-07-16T09:00:00',
        endTime: '2026-07-16T09:00:00',
        assignee: null,
        taskId: null,
      },
    ],
  },
  'proc-003': {
    // REJECTED — 已驳回（无活跃节点）
    activeNodeIds: [],
    flowTrace: [
      {
        activityId: 'StartEvent_1',
        activityName: '开始',
        activityType: 'startEvent',
        startTime: '2026-07-18T11:15:00',
        endTime: '2026-07-18T11:15:00',
        assignee: null,
        taskId: null,
      },
      {
        activityId: 'Activity_submit',
        activityName: '提交申请',
        activityType: 'userTask',
        startTime: '2026-07-18T11:15:00',
        endTime: '2026-07-18T14:00:00',
        assignee: '3',
        taskId: 'task-submit-003',
      },
      {
        activityId: 'Activity_approve1',
        activityName: '部门经理审批',
        activityType: 'userTask',
        startTime: '2026-07-18T14:00:00',
        endTime: '2026-07-18T16:00:00',
        assignee: '4',
        taskId: 'task-approve1-003',
      },
      {
        activityId: 'EndEvent_1',
        activityName: '结束',
        activityType: 'endEvent',
        startTime: '2026-07-18T16:00:00',
        endTime: '2026-07-18T16:00:00',
        assignee: null,
        taskId: null,
      },
    ],
  },
  'proc-004': {
    // RUNNING — 刚启动（仅提交节点完成，部门审批活跃）
    activeNodeIds: ['Activity_approve1'],
    flowTrace: [
      {
        activityId: 'StartEvent_1',
        activityName: '开始',
        activityType: 'startEvent',
        startTime: '2026-07-22T08:45:00',
        endTime: '2026-07-22T08:45:00',
        assignee: null,
        taskId: null,
      },
      {
        activityId: 'Activity_submit',
        activityName: '提交申请',
        activityType: 'userTask',
        startTime: '2026-07-22T08:45:00',
        endTime: '2026-07-22T09:00:00',
        assignee: '1',
        taskId: 'task-submit-004',
      },
      {
        activityId: 'Activity_approve1',
        activityName: '部门经理审批',
        activityType: 'userTask',
        startTime: '2026-07-22T09:00:00',
        endTime: null,
        assignee: '2',
        taskId: 'task-approve1-004',
      },
    ],
  },
  'proc-005': {
    // APPROVED
    activeNodeIds: [],
    flowTrace: [
      {
        activityId: 'StartEvent_1',
        activityName: '开始',
        activityType: 'startEvent',
        startTime: '2026-07-10T16:30:00',
        endTime: '2026-07-10T16:30:00',
        assignee: null,
        taskId: null,
      },
      {
        activityId: 'Activity_submit',
        activityName: '提交申请',
        activityType: 'userTask',
        startTime: '2026-07-10T16:30:00',
        endTime: '2026-07-10T17:45:00',
        assignee: '4',
        taskId: 'task-submit-005',
      },
      {
        activityId: 'Activity_approve1',
        activityName: '部门经理审批',
        activityType: 'userTask',
        startTime: '2026-07-10T17:45:00',
        endTime: '2026-07-11T10:00:00',
        assignee: '2',
        taskId: 'task-approve1-005',
      },
      {
        activityId: 'EndEvent_1',
        activityName: '结束',
        activityType: 'endEvent',
        startTime: '2026-07-11T10:00:00',
        endTime: '2026-07-11T10:00:00',
        assignee: null,
        taskId: null,
      },
    ],
  },
  'proc-006': {
    // RUNNING — 多活跃节点（并行网关后的两个审批）
    activeNodeIds: ['Activity_approve1', 'Activity_approve2'],
    flowTrace: [
      {
        activityId: 'StartEvent_1',
        activityName: '开始',
        activityType: 'startEvent',
        startTime: '2026-07-25T13:20:00',
        endTime: '2026-07-25T13:20:00',
        assignee: null,
        taskId: null,
      },
      {
        activityId: 'Activity_submit',
        activityName: '提交申请',
        activityType: 'userTask',
        startTime: '2026-07-25T13:20:00',
        endTime: '2026-07-25T14:00:00',
        assignee: '2',
        taskId: 'task-submit-006',
      },
      {
        activityId: 'Activity_approve1',
        activityName: '部门经理审批',
        activityType: 'userTask',
        startTime: '2026-07-25T14:00:00',
        endTime: null,
        assignee: '3',
        taskId: 'task-approve1-006',
      },
      {
        activityId: 'Activity_approve2',
        activityName: 'HR 审批',
        activityType: 'userTask',
        startTime: '2026-07-25T14:00:00',
        endTime: null,
        assignee: '4',
        taskId: 'task-approve2-006',
      },
    ],
  },
}

// ─── 大模型接入配置 Mock 种子（M07-F01） ──────────────────────
// 安全约束（硬边界）：种子与 handler 内存中只存 apiKeyMasked 脱敏展示值，
// 绝不出现明文 Key、绝不出现 apiKeyCipher 密文字段——与后端 AgentModelConfigDTO
// 出参形状严格一致（DTO 注释：明文生命周期仅在 ServiceImpl 内部）。
// 覆盖矩阵：openai 带 Key（sk****abcd 形态）/ ollama 无 Key（apiKeyMasked=null）/
// other / 同 groupKey 多条（不同 sort）/ 一条 lockedUntil 未来时间（运行态锁定中）/
// 一条 lockedUntil 过去时间（已解锁）/ enabled 有 true/false。
export const MOCK_AGENT_MODELS: AgentModelConfig[] = [
  {
    id: 1,
    name: 'OpenAI GPT-4o 主模型',
    protocolType: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    modelName: 'gpt-4o',
    apiKeyMasked: 'sk****abcd',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1,
    timeoutSeconds: 60,
    retryCount: 2,
    enabled: true,
    remark: '生产主模型',
    groupKey: null,
    sort: 0,
    lockedUntil: null,
    quotaCooldownSeconds: 60,
    createTime: '2026-07-10 10:00:00',
    updateTime: '2026-07-10 10:00:00',
  },
  {
    id: 2,
    name: 'Ollama 本地 Llama3',
    protocolType: 'ollama',
    baseUrl: 'http://127.0.0.1:11434',
    modelName: 'llama3',
    apiKeyMasked: null,
    temperature: 0.5,
    maxTokens: 2048,
    topP: 0.9,
    timeoutSeconds: 30,
    retryCount: 0,
    enabled: true,
    remark: '本地部署，无需鉴权',
    groupKey: null,
    sort: 0,
    lockedUntil: null,
    quotaCooldownSeconds: 60,
    createTime: '2026-07-11 09:00:00',
    updateTime: '2026-07-11 09:00:00',
  },
  {
    id: 3,
    name: 'Azure OpenAI 备用',
    protocolType: 'other',
    baseUrl: 'https://your-resource.openai.azure.com',
    modelName: 'gpt-4o-mini',
    apiKeyMasked: 'sk****dcba',
    temperature: 0.3,
    maxTokens: 8192,
    topP: 0.95,
    timeoutSeconds: 120,
    retryCount: 3,
    enabled: false,
    remark: '备用通道，当前停用',
    groupKey: null,
    sort: 0,
    lockedUntil: null,
    quotaCooldownSeconds: 60,
    createTime: '2026-07-12 14:00:00',
    updateTime: '2026-07-13 11:30:00',
  },
  {
    id: 4,
    name: '多Key轮询-主Key',
    protocolType: 'openai',
    baseUrl: 'https://api.example.com/v1',
    modelName: 'gpt-4o',
    apiKeyMasked: 'sk****1111',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1,
    timeoutSeconds: 60,
    retryCount: 2,
    enabled: true,
    remark: '轮询分组 primary，sort 最小优先',
    groupKey: 'gpt4o-pool',
    sort: 1,
    // 未来时间：演示「限流临时锁定中」运行态（只读展示）
    lockedUntil: '2030-01-01T00:00:00',
    quotaCooldownSeconds: 300,
    createTime: '2026-07-14 10:00:00',
    updateTime: '2026-07-15 08:00:00',
  },
  {
    id: 5,
    name: '多Key轮询-备Key',
    protocolType: 'openai',
    baseUrl: 'https://api.example.com/v1',
    modelName: 'gpt-4o',
    apiKeyMasked: 'sk****2222',
    temperature: 0.7,
    maxTokens: 4096,
    topP: 1,
    timeoutSeconds: 60,
    retryCount: 2,
    enabled: true,
    remark: '轮询分组 primary，sort 大者兜底',
    groupKey: 'gpt4o-pool',
    sort: 2,
    // 过去时间：演示「已解锁」运行态（只读展示）
    lockedUntil: '2026-01-01T00:00:00',
    quotaCooldownSeconds: 300,
    createTime: '2026-07-14 10:00:00',
    updateTime: '2026-07-15 08:00:00',
  },
  {
    id: 6,
    name: 'DeepSeek 对话模型',
    protocolType: 'openai',
    baseUrl: 'https://api.deepseek.com/v1',
    modelName: 'deepseek-chat',
    apiKeyMasked: 'sk****efgh',
    temperature: 1,
    maxTokens: 4096,
    topP: null,
    timeoutSeconds: 90,
    retryCount: 1,
    enabled: false,
    remark: '待灰度验证',
    groupKey: null,
    sort: 0,
    lockedUntil: null,
    quotaCooldownSeconds: 60,
    createTime: '2026-07-16 15:00:00',
    updateTime: '2026-07-16 15:00:00',
  },
]

// ─── 图定义 Mock 种子（MockGraphDefEntry，用于演示 prompt 配置） ──

/**
 * Mock 图定义（仅用于演示 prompt 配置，不做完整 CRUD）。
 * 包含：简单 LLM 图（无 prompt）、带 systemPrompt 的 LLM 图、带 userPromptTemplate 的 LLM 图、
 * 引用未定义变量的 LLM 图（用于演示失败语义）。
 */
export interface MockGraphDefEntry {
  id: number
  name: string
  graphKey: string
  description?: string
  defVersion: number
  status: 'DRAFT' | 'PUBLISHED'
  graphJson: {
    graphKey: string
    name: string
    version: number
    canvas: Record<string, unknown>
    elements: Array<{
      id: string
      kind: 'node' | 'edge'
      type?: string
      source?: string
      target?: string
      config?: Record<string, unknown>
      style?: Record<string, unknown>
    }>
  }
}

export const MOCK_GRAPH_DEFS: MockGraphDefEntry[] = [
  {
    // 历史图：无 prompt 配置（验证默认回退：input 直接穿透）
    id: 1001,
    name: '简单意图识别',
    graphKey: 'simple-intent',
    defVersion: 1,
    status: 'PUBLISHED',
    graphJson: {
      graphKey: 'simple-intent',
      name: '简单意图识别',
      version: 1,
      canvas: {},
      elements: [
        { id: 'start_1', kind: 'node', type: 'START', style: { x: 0, y: 0 } },
        {
          id: 'llm_1',
          kind: 'node',
          type: 'LLM',
          config: { agentModelConfigId: 1 }, // 无 systemPrompt / userPromptTemplate
          style: { x: 200, y: 0 },
        },
        { id: 'end_1', kind: 'node', type: 'END', style: { x: 400, y: 0 } },
        { id: 'e1', kind: 'edge', type: undefined, source: 'start_1', target: 'llm_1' },
        { id: 'e2', kind: 'edge', type: undefined, source: 'llm_1', target: 'end_1' },
      ],
    },
  },
  {
    // 带 systemPrompt 的图
    id: 1002,
    name: '角色设定示例',
    graphKey: 'role-system-prompt',
    defVersion: 1,
    status: 'PUBLISHED',
    graphJson: {
      graphKey: 'role-system-prompt',
      name: '角色设定示例',
      version: 1,
      canvas: {},
      elements: [
        { id: 'start_1', kind: 'node', type: 'START', style: { x: 0, y: 0 } },
        {
          id: 'llm_1',
          kind: 'node',
          type: 'LLM',
          config: {
            agentModelConfigId: 1,
            systemPrompt: '你是一名专业的中文翻译助手。',
          },
          style: { x: 200, y: 0 },
        },
        { id: 'end_1', kind: 'node', type: 'END', style: { x: 400, y: 0 } },
        { id: 'e1', kind: 'edge', type: undefined, source: 'start_1', target: 'llm_1' },
        { id: 'e2', kind: 'edge', type: undefined, source: 'llm_1', target: 'end_1' },
      ],
    },
  },
  {
    // 带 userPromptTemplate 的图（成功插值：所有变量 {{input}} + {{tone}} 均可解析）
    id: 1003,
    name: '多变量模板示例',
    graphKey: 'multi-var-template',
    defVersion: 1,
    status: 'PUBLISHED',
    graphJson: {
      graphKey: 'multi-var-template',
      name: '多变量模板示例',
      version: 1,
      canvas: {},
      elements: [
        { id: 'start_1', kind: 'node', type: 'START', style: { x: 0, y: 0 } },
        {
          id: 'llm_1',
          kind: 'node',
          type: 'LLM',
          config: {
            agentModelConfigId: 1,
            systemPrompt: '你是一名文案生成专家。',
            userPromptTemplate: '请根据以下关键词生成一段文案：{{input}}。语气：{{tone}}。',
            outputVar: 'result',
          },
          style: { x: 200, y: 0 },
        },
        {
          id: 'end_1',
          kind: 'node',
          type: 'END',
          config: { inputVar: 'result' },
          style: { x: 400, y: 0 },
        },
        { id: 'e1', kind: 'edge', type: undefined, source: 'start_1', target: 'llm_1' },
        { id: 'e2', kind: 'edge', type: undefined, source: 'llm_1', target: 'end_1' },
      ],
    },
  },
  {
    // 引用未定义变量的图（执行失败：{{undefinedVar}} 无法解析）
    id: 1004,
    name: '未定义变量示例',
    graphKey: 'undefined-var',
    defVersion: 1,
    status: 'PUBLISHED',
    graphJson: {
      graphKey: 'undefined-var',
      name: '未定义变量示例',
      version: 1,
      canvas: {},
      elements: [
        { id: 'start_1', kind: 'node', type: 'START', style: { x: 0, y: 0 } },
        {
          id: 'llm_1',
          kind: 'node',
          type: 'LLM',
          config: {
            agentModelConfigId: 1,
            userPromptTemplate: '请翻译：{{undefinedVar}}',
          },
          style: { x: 200, y: 0 },
        },
        { id: 'end_1', kind: 'node', type: 'END', style: { x: 400, y: 0 } },
        { id: 'e1', kind: 'edge', type: undefined, source: 'start_1', target: 'llm_1' },
        { id: 'e2', kind: 'edge', type: undefined, source: 'llm_1', target: 'end_1' },
      ],
    },
  },
]

// ─── 图执行历史 Mock 种子（AgentGraphExecution） ──────────────
export const MOCK_AGENT_GRAPH_EXECUTIONS: Array<{
  id: number
  graphDefId: number
  graphKey: string
  graphName: string
  defVersion: number
  status: string // 'SUCCESS' | 'FAILED' | 'RUNNING'
  success: boolean
  latencyMs: number
  traceId: string
  createTime: string
  updateTime?: string
  input: string
  output: string
  errorMessage?: string
  errorCategory?: string
  nodeDetails: Array<{
    nodeSeq: number
    branchId: string
    nodeId: string
    nodeType: string // 'START' | 'LLM' | 'END' | 'FORK' | 'JOIN' | 'LOOP' | 'CONDITION'
    nodeName: string
    status: string
    success: boolean
    nodeLatencyMs?: number
    buildTime?: string
    input?: string
    output?: string
    errorMessage?: string
  }>
}> = [
  {
    id: 1,
    graphDefId: 1,
    graphKey: 'CUSTOMER_ROUTING_V2',
    graphName: '客服分流图 V2',
    defVersion: 3,
    status: 'SUCCESS',
    success: true,
    latencyMs: 2350,
    traceId: 'trace-cust-001',
    createTime: '2026-08-20 10:00:00',
    updateTime: '2026-08-20 10:00:05',
    input: JSON.stringify({ query: '我想查询订单状态' }),
    output: JSON.stringify({ response: '您的订单 #12345 已发货...' }),
    nodeDetails: [
      {
        nodeSeq: 1,
        branchId: '0',
        nodeId: 'start_1',
        nodeType: 'START',
        nodeName: '开始',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 5,
      },
      {
        nodeSeq: 2,
        branchId: '0',
        nodeId: 'llm_1',
        nodeType: 'LLM',
        nodeName: '意图识别',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 800,
        input: JSON.stringify({ query: '我想查询订单状态' }),
        output: JSON.stringify({ intent: 'ORDER_QUERY' }),
      },
      {
        nodeSeq: 3,
        branchId: '0',
        nodeId: 'check_1',
        nodeType: 'CONDITION',
        nodeName: '条件判断',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 10,
      },
      {
        nodeSeq: 4,
        branchId: '0',
        nodeId: 'end_1',
        nodeType: 'END',
        nodeName: '结束',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 2,
      },
    ],
  },
  {
    id: 2,
    graphDefId: 1,
    graphKey: 'CUSTOMER_ROUTING_V2',
    graphName: '客服分流图 V2',
    defVersion: 3,
    status: 'FAILED',
    success: false,
    latencyMs: 5100,
    traceId: 'trace-cust-002',
    createTime: '2026-08-20 11:00:00',
    updateTime: '2026-08-20 11:00:10',
    input: JSON.stringify({ query: '帮我生成营销文案' }),
    output: '',
    errorMessage: '模型调用超时：LLM API 响应超过 5 秒',
    errorCategory: 'MODEL_CALL_TIMEOUT',
    nodeDetails: [
      {
        nodeSeq: 1,
        branchId: '0',
        nodeId: 'start_2',
        nodeType: 'START',
        nodeName: '开始',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 3,
      },
      {
        nodeSeq: 2,
        branchId: '0',
        nodeId: 'llm_2',
        nodeType: 'LLM',
        nodeName: '文案生成',
        status: 'FAILED',
        success: false,
        nodeLatencyMs: 5000,
        errorMessage: 'Timeout after 5000ms',
      },
      {
        nodeSeq: 3,
        branchId: '0',
        nodeId: 'end_2',
        nodeType: 'END',
        nodeName: '错误处理',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 10,
      },
    ],
  },
  {
    id: 3,
    graphDefId: 2,
    graphKey: 'DATA_ANALYSIS_PIPE',
    graphName: '数据分析管线',
    defVersion: 1,
    status: 'SUCCESS',
    success: true,
    latencyMs: 4200,
    traceId: 'trace-data-001',
    createTime: '2026-08-20 12:00:00',
    updateTime: '2026-08-20 12:00:08',
    input: JSON.stringify({ table: 'sales_q3', metrics: ['revenue', 'count'] }),
    output: JSON.stringify({ results: { revenue: 125000, count: 342 } }),
    nodeDetails: [
      {
        nodeSeq: 1,
        branchId: '0',
        nodeId: 'start_3',
        nodeType: 'START',
        nodeName: '开始',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 5,
      },
      {
        nodeSeq: 2,
        branchId: '0',
        nodeId: 'fork_1',
        nodeType: 'FORK',
        nodeName: '扇出计算',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 2,
      },
      {
        nodeSeq: 3,
        branchId: 'branch-a',
        nodeId: 'calc_rev',
        nodeType: 'LLM',
        nodeName: '收入计算',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 2100,
      },
      {
        nodeSeq: 4,
        branchId: 'branch-b',
        nodeId: 'calc_cnt',
        nodeType: 'LLM',
        nodeName: '计数计算',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 1900,
      },
      {
        nodeSeq: 5,
        branchId: '0',
        nodeId: 'join_1',
        nodeType: 'JOIN',
        nodeName: '汇合结果',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 15,
      },
      {
        nodeSeq: 6,
        branchId: '0',
        nodeId: 'end_3',
        nodeType: 'END',
        nodeName: '结束',
        status: 'SUCCESS',
        success: true,
        nodeLatencyMs: 2,
      },
    ],
  },
]

// ═══════════════════════════════════════════════════════════════════
// M07-F04-02：Agent 会话历史 Mock 数据（对齐 AgentConversationDTO /
// AgentConversationMessageDTO 契约；覆盖确定/未知/部分 usage 三种语义）
// ═══════════════════════════════════════════════════════════════════

export interface MockConversation {
  id: number
  agentModelConfigId: number
  title?: string
  status: string
  createTime: string
}

export interface MockConversationMessage {
  id: number
  role: string
  content: string
  msgOrder: number
  inputTokens: number | null
  outputTokens: number | null
  createTime: string
}

export const MOCK_CONVERSATIONS: MockConversation[] = [
  {
    id: 1,
    agentModelConfigId: 10,
    title: '客服咨询会话',
    status: 'ACTIVE',
    createTime: '2026-08-22 09:00:00',
  },
  {
    id: 2,
    agentModelConfigId: 11,
    title: '未知用量会话',
    status: 'ACTIVE',
    createTime: '2026-08-22 08:30:00',
  },
  {
    id: 3,
    agentModelConfigId: 12,
    title: '部分用量会话',
    status: 'ACTIVE',
    createTime: '2026-08-22 08:00:00',
  },
]

export const MOCK_CONVERSATION_MESSAGES: Record<number, MockConversationMessage[]> = {
  1: [
    {
      id: 101,
      role: 'USER',
      content: '第一轮：如何退款？',
      msgOrder: 0,
      inputTokens: null,
      outputTokens: null,
      createTime: '2026-08-22 09:00:01',
    },
    {
      id: 102,
      role: 'ASSISTANT',
      content: '第一轮回复：请提供订单号。',
      msgOrder: 1,
      inputTokens: 10,
      outputTokens: 20,
      createTime: '2026-08-22 09:00:02',
    },
    {
      id: 103,
      role: 'USER',
      content: '第二轮：订单号 12345。',
      msgOrder: 2,
      inputTokens: null,
      outputTokens: null,
      createTime: '2026-08-22 09:00:05',
    },
    {
      id: 104,
      role: 'ASSISTANT',
      content: '第二轮回复：已为您发起退款。',
      msgOrder: 3,
      inputTokens: 30,
      outputTokens: 40,
      createTime: '2026-08-22 09:00:06',
    },
  ],
  2: [
    {
      id: 201,
      role: 'USER',
      content: '未知用量会话提问',
      msgOrder: 0,
      inputTokens: null,
      outputTokens: null,
      createTime: '2026-08-22 08:30:01',
    },
    {
      id: 202,
      role: 'ASSISTANT',
      content: '供应商未返回 usage 的回复',
      msgOrder: 1,
      inputTokens: null,
      outputTokens: null,
      createTime: '2026-08-22 08:30:02',
    },
  ],
  3: [
    {
      id: 301,
      role: 'USER',
      content: '部分用量会话提问',
      msgOrder: 0,
      inputTokens: null,
      outputTokens: null,
      createTime: '2026-08-22 08:00:01',
    },
    {
      id: 302,
      role: 'ASSISTANT',
      content: '仅返回输入 token 的回复',
      msgOrder: 1,
      inputTokens: 50,
      outputTokens: null,
      createTime: '2026-08-22 08:00:02',
    },
  ],
}

// ═══════════════════════════════════════════════════════════════════
// M07-F02-04：图单步调试 Mock 数据（AgentGraphDebugSession / AgentGraphDebugNode）
// ═══════════════════════════════════════════════════════════════════

export interface MockDebugSession {
  id: number
  graphDefId: number
  graphDefVersion: number
  status: 'PAUSED' | 'COMPLETED' | 'FAILED' | 'STOPPED' | 'EXPIRED' | string
  input: string
  breakpoints: string[]
  variables: Record<string, string>
  traceCount: number
  nextNodeId: string | null
  nextBranchId: string | null
  resultText?: string | null
  errorCategory?: string | null
  errorMessage?: string | null
  latencyMs?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
  expiresAt: string
  createTime: string
  updateTime: string
  version: number
}

export interface MockDebugNode {
  id: number
  debugSessionId: number
  nodeSeq: number
  branchId: string
  nodeId: string
  nodeType: string
  nodeLatencyMs: number
  variableSnapshot: string | null
  inputTokens?: number | null
  outputTokens?: number | null
}

export const MOCK_DEBUG_SESSIONS: MockDebugSession[] = [
  {
    id: 1,
    graphDefId: 1001,
    graphDefVersion: 1,
    status: 'PAUSED',
    input: 'hello debug',
    breakpoints: ['llm_1'],
    variables: { input: 'hello debug' },
    traceCount: 1,
    nextNodeId: 'llm_1',
    nextBranchId: '0',
    resultText: null,
    errorCategory: null,
    errorMessage: null,
    latencyMs: null,
    inputTokens: null,
    outputTokens: null,
    expiresAt: '2030-08-22 10:30:00',
    createTime: '2026-08-22 09:00:00',
    updateTime: '2026-08-22 09:00:05',
    version: 1,
  },
  {
    id: 2,
    graphDefId: 1002,
    graphDefVersion: 1,
    status: 'COMPLETED',
    input: 'completed input',
    breakpoints: [],
    variables: { input: 'completed input', result: 'completed input -> [llm_1 output]' },
    traceCount: 3,
    nextNodeId: null,
    nextBranchId: null,
    resultText: 'completed input -> [llm_1 output]',
    errorCategory: null,
    errorMessage: null,
    latencyMs: 95,
    inputTokens: 10,
    outputTokens: 20,
    expiresAt: '2030-08-22 11:00:00',
    createTime: '2026-08-22 08:00:00',
    updateTime: '2026-08-22 08:00:10',
    version: 3,
  },
]

export const MOCK_DEBUG_NODES: Record<number, MockDebugNode[]> = {
  1: [
    {
      id: 101,
      debugSessionId: 1,
      nodeSeq: 1,
      branchId: '0',
      nodeId: 'start_1',
      nodeType: 'START',
      nodeLatencyMs: 5,
      variableSnapshot: JSON.stringify({ input: 'hello debug' }),
      inputTokens: null,
      outputTokens: null,
    },
  ],
  2: [
    {
      id: 201,
      debugSessionId: 2,
      nodeSeq: 1,
      branchId: '0',
      nodeId: 'start_1',
      nodeType: 'START',
      nodeLatencyMs: 5,
      variableSnapshot: JSON.stringify({ input: 'completed input' }),
      inputTokens: null,
      outputTokens: null,
    },
    {
      id: 202,
      debugSessionId: 2,
      nodeSeq: 2,
      branchId: '0',
      nodeId: 'llm_1',
      nodeType: 'LLM',
      nodeLatencyMs: 80,
      variableSnapshot: JSON.stringify({
        input: 'completed input',
        result: 'completed input -> [llm_1 output]',
      }),
      inputTokens: 10,
      outputTokens: 20,
    },
    {
      id: 203,
      debugSessionId: 2,
      nodeSeq: 3,
      branchId: '0',
      nodeId: 'end_1',
      nodeType: 'END',
      nodeLatencyMs: 10,
      variableSnapshot: JSON.stringify({
        input: 'completed input',
        result: 'completed input -> [llm_1 output]',
      }),
      inputTokens: null,
      outputTokens: null,
    },
  ],
}

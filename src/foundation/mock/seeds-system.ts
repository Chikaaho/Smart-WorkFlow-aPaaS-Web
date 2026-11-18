/**
 * 系统管理种子：用户/角色/部门/岗位列表与角色-菜单绑定。
 * 从 seeds.ts 按域拆出（行为零变化）；seeds.ts 聚合 re-export。
 */

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
    posts: [{ postId: '1', deptId: '1' }],
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
    posts: [{ postId: '3', deptId: '2' }],
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
    posts: [
      { postId: '3', deptId: '2' },
      { postId: '4', deptId: '2' },
    ],
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
    posts: [{ postId: '4', deptId: '3' }],
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
    posts: [{ postId: '5', deptId: '3' }],
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

export const MOCK_ROLE_MENU_BINDINGS: Record<string, number[]> = {
  // admin：全量菜单树（目录 1/2/3/5 + 页面 11/12/13/14/15/16/17/18 + 按钮 110/111/112/120/121/122/170）
  // 目录 id 必须一并绑定：buildMockMenuTree 按「父不在集合 → 子树整体丢弃」过滤（对齐真实后端），
  // 缺 agent 目录(5) 会导致智能体整棵子树不可见。
  // P48/V37：工具管理页 17 + 按钮 170（agent:tool:view / agent:tool:manage），
  // 对齐真实后端 V37 seed（页面 id=212、按钮 id=213）与 admin 角色菜单绑定契约。
  // P32/V43：表单数据导入导出按钮 230/231/232（form:data:template/import/export），
  // 对齐真实后端 V43 seed 与 admin 角色菜单绑定契约（/auth/me 与菜单树同源装配）。
  '2': [
    1, 2, 3, 5, 11, 12, 13, 14, 15, 16, 17, 18, 43, 430, 110, 111, 112, 120, 121, 122, 170, 230,
    231, 232,
  ],
  // superadmin：无绑定行（超管旁路，与真实 seed 一致）
  // user：空绑定
}

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

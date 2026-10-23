/**
 * 应用中心与表单分类统一契约（应用 → 目录 → 表单）。
 * <p>
 * 后端：`/form/app/manage`（后台，form:app:manage）、`/form/app/center`（用户端，登录即可）。
 * 应用承担原表单一级分类的管理职责；目录为应用内二级分类（单层，只属于一个应用）。
 * 用户端表单可用性 = 应用可见范围 + 既有表单发布/可见性规则；数据查询继续走既有
 * form:data:query 与行权限（应用可见性不扩大数据范围）。
 */

/** 业务应用。 */
export interface FormApp {
  id: string
  name: string
  icon?: string | null
  color?: string | null
  sortNo: number
  /** ALL=本租户全部用户；SPECIFIED=按维度指定（维度集合全空=无人可见）。 */
  visibleScopeType: 'ALL' | 'SPECIFIED'
  /** SPECIFIED 时的指定用户集合（USER 维度；ALL 时为 null）。 */
  visibleUserIds?: Array<number | string> | null
  /** 指定可见部门集合（0.1.7 #1；DEPT 维度，按用户主属部门命中）。 */
  visibleDeptIds?: number[] | null
  /** 指定可见角色 code 集合（0.1.7 #1；ROLE 维度）。 */
  visibleRoleCodes?: string[] | null
  /** 指定可见岗位集合（0.1.7 #1；POST 维度）。 */
  visiblePostIds?: number[] | null
  /** 指定可见租户集合（0.1.7 #1；TENANT 维度，整租户可见）。 */
  visibleTenantIds?: number[] | null
  status: 'ENABLED' | 'DISABLED'
  /** MANUAL=后台新建；LEGACY_CATEGORY/LEGACY_UNCATEGORIZED=存量承接（只读追溯）。 */
  source: 'MANUAL' | 'LEGACY_CATEGORY' | 'LEGACY_UNCATEGORIZED'
  legacyCategoryId?: number | null
  formCount?: number
  dirCount?: number
  createTime?: string
  updateTime?: string
}

/** 应用新建/更新请求。 */
export interface FormAppSaveReq {
  name: string
  icon?: string | null
  color?: string | null
  sortNo?: number
  visibleScopeType: 'ALL' | 'SPECIFIED'
  /** USER 维度：指定可见用户。 */
  userIds?: Array<number | string>
  /** DEPT 维度：指定可见部门（0.1.7 #1）。 */
  deptIds?: number[]
  /** ROLE 维度：指定可见角色 code（0.1.7 #1）。 */
  roleCodes?: string[]
  /** POST 维度：指定可见岗位（0.1.7 #1）。 */
  postIds?: number[]
  /** TENANT 维度：指定可见租户（0.1.7 #1）。 */
  tenantIds?: number[]
}

/** 应用内目录（二级分类）。 */
export interface FormAppDir {
  id: string
  appId: string
  name: string
  sortNo: number
  formCount?: number
  /** 内容查询时填充（管理视角=全部业务表单；用户端=过滤后的可用表单）。 */
  forms?: FormAppFormItem[] | null
}

/** 目录新建/更新请求。 */
export interface FormAppDirSaveReq {
  name: string
  sortNo?: number
}

/** 应用内容中的表单条目。 */
export interface FormAppFormItem {
  formId: string
  formKey: string
  name: string
  status: 'DRAFT' | 'PUBLISHED' | 'DISABLED'
  /** 归属目录 ID（null=直接归属应用）。 */
  dirId?: string | null
  formVersion?: number
}

/** 应用内容：目录（含目录内表单）+ 应用内直接归属表单。 */
export interface FormAppContent {
  app: FormApp
  dirs: FormAppDir[]
  directForms: FormAppFormItem[]
}

/** 表单归属调整请求（显式操作；失败保持原归属）。 */
export interface FormAppMembershipReq {
  appId: string
  dirId?: string | null
}

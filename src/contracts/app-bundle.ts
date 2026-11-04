/**
 * 应用整包导入导出契约（0.2.2 F2，D022-10～15）。
 *
 * 后台：/form/app/manage/bundle（导出 form:app:export；导入/记录 form:app:import）。
 * 与后端 FormAppBundleDocument / FormBundlePreviewResult / FormBundleImportReport
 * JSON 结构一一对应（NON_NULL 字段以可选表达）。
 */

/** 导入第一步：预检结果。 */
export interface FormBundlePreviewResult {
  packageName: string
  bundleFormatVersion?: number | null
  systemVersion?: string | null
  exportedAt?: string | null
  app: BundleAppPreview
  dirs: BundleDirPreview[]
  forms: BundleFormPreview[]
  processes: BundleProcessPreview[]
  opinionForms: BundleOpinionFormPreview[]
  dictTypes: BundleDictTypePreview[]
  /** 外部引用匹配结果（matched=false 导入时置空并记入报告） */
  externalRefs: BundleExternalRefPreview[]
  counts: BundleCounts
}

export interface BundleAppPreview {
  name: string
  icon?: string | null
  color?: string | null
  sortNo?: number | null
  visibleScopeType?: 'ALL' | 'SPECIFIED' | null
  /** true = 目标租户已有同名应用，导入时自动加后缀 */
  nameConflict?: boolean | null
}

export interface BundleDirPreview {
  name: string
  sortNo?: number | null
}

export interface BundleFormPreview {
  formKey: string
  name: string
  /** true = 目标租户已有同 key 表单，导入时自动重新生成 */
  keyConflict?: boolean | null
}

export interface BundleProcessPreview {
  name: string
  formKey?: string | null
}

/** 审批意见表单（D022-12）：冲突项必须由用户确认新 key 后才能导入。 */
export interface BundleOpinionFormPreview {
  formKey: string
  name?: string | null
  conflict?: boolean | null
  /** 冲突项默认随机新 key（可直接采用或手动修改） */
  suggestedKey?: string | null
}

/** 字典处置：REUSE 同编码复用 / CREATE 缺失新建 / OCCUPIED 被他租户占用（记入报告）。 */
export interface BundleDictTypePreview {
  code: string
  name?: string | null
  action: 'REUSE' | 'CREATE' | 'OCCUPIED'
}

export interface BundleExternalRefPreview {
  /** ROLE / POST / DATASOURCE / CATEGORY / FIXED_USER / DEPT / FORM / PROCESS / QUERY */
  kind: string
  value?: string | null
  location?: string | null
  /** USER/DEPT 恒为 false（置空） */
  matched?: boolean | null
  matchedTo?: string | null
}

export interface BundleCounts {
  dirs: number
  forms: number
  processes: number
  opinionForms: number
  dictTypes: number
  txnActions: number
  extQueries: number
}

/** 意见表单冲突解决：包内原 key → 用户确认的新 key。 */
export interface BundleOpinionKeyDecision {
  formKey: string
  newKey: string
}

/** 导入第二步：确认导入报告。 */
export interface FormBundleImportReport {
  packageName: string
  importedAt?: string | null
  operatorName?: string | null
  /** 新建应用 id（重名自动加后缀后的最终应用） */
  appId: string
  appName?: string | null
  createdDirs?: BundleCreatedMapping[]
  createdForms?: BundleCreatedMapping[]
  createdOpinionForms?: BundleCreatedMapping[]
  createdProcesses?: BundleCreatedProcess[]
  createdTxnActions?: BundleCreatedTxnAction[]
  createdExtQueries?: BundleCreatedQuery[]
  reusedDictTypes?: BundleReusedObject[]
  reusedOpinionKeys?: BundleReusedObject[]
  matchedDatasources?: BundleReusedObject[]
  matchedRoles?: BundleReusedObject[]
  matchedPosts?: BundleReusedObject[]
  matchedCategories?: BundleReusedObject[]
  regeneratedFormKeys?: BundleCreatedMapping[]
  regeneratedQueryKeys?: BundleCreatedMapping[]
  finalAppName?: string | null
  /** 置空的外部引用（发布前须管理员补配） */
  clearedRefs: BundleClearedRef[]
}

export interface BundleCreatedMapping {
  oldKey?: string | null
  newKey?: string | null
  oldId?: string | null
  newId?: string | null
  name?: string | null
}

export interface BundleCreatedProcess {
  name?: string | null
  oldProcessKey?: string | null
  newProcessKey?: string | null
  newDefId?: number | null
  formKey?: string | null
}

export interface BundleCreatedTxnAction {
  formKey?: string | null
  actionKey?: string | null
  name?: string | null
  newActionId?: string | null
}

export interface BundleCreatedQuery {
  formKey?: string | null
  oldQueryKey?: string | null
  newQueryKey?: string | null
  queryVersion?: number | null
  datasourceName?: string | null
  datasourceId?: number | null
}

export interface BundleReusedObject {
  value?: string | null
  name?: string | null
  id?: number | null
}

export interface BundleClearedRef {
  /** FIXED_USER / DEPT / ROLE / POST / DEPT_POST / DATASOURCE / CATEGORY / FORM / PROCESS / DICT_OCCUPIED / FORM_USER_SCOPE / IOT_DEVICE */
  kind: string
  originalValue?: string | null
  location?: string | null
}

/** 导入记录（sw_form_app_import_record 行；操作人=createBy、时间=createTime，报告 JSON 随行下发）。 */
export interface FormAppImportRecord {
  id: string
  packageName: string
  fileName?: string | null
  appId?: string | null
  appName?: string | null
  result: 'SUCCESS'
  reportJson?: string | null
  createTime?: string | null
}

import { request } from '@/foundation/request'
import type { PageQuery, PageResult } from '@/contracts/common'
import { parseDefinition } from '@/adapters/form-designer'
import type { FormSchema, FormSchemaField } from '@/contracts/form-schema'

export interface FormDefDTO {
  formKey: string
  formName: string
}

/** 后端分页响应原始形状:字段名为 records(区别于前端契约的 list)。 */
interface BackendPageResult<T> {
  records: T[]
  total: number
  pageNum: number
  pageSize: number
}

/** 直连: GET /api/form/def/by-key/{formKey} */
export async function getFormDef(formKey: string): Promise<FormDefDTO> {
  return request<FormDefDTO>({
    method: 'GET',
    url: `/form/def/by-key/${formKey}`,
  })
}

/** 直连: GET /api/form/def/by-key/{formKey}/definition → 裸 JSON 字符串经防腐层解析为 FormSchema */
export async function getFormDefinition(formKey: string): Promise<FormSchema> {
  const rawJson = await request<string>({
    method: 'GET',
    url: `/form/def/by-key/${formKey}/definition`,
  })
  return parseDefinition(rawJson)
}

/**
 * seam: 后端端点未就绪,形状已锁,上线即通。
 * POST /api/form/data/{formKey}
 * 请求体: Map<字段名,值>  返回: R<recordId>(经 request() 解包)
 *
 * 可选的 fields 参数:传入 schema 字段列表后,提交前自动按字段 type 归一
 * (BOOL→1/0、DATE→ISO 串),否则需调用方自行 normalizeSubmitData。
 */
export async function submitForm(
  formKey: string,
  data: Record<string, unknown>,
  fields?: FormSchemaField[],
): Promise<string> {
  const payload = fields ? normalizeSubmitData(data, fields) : data
  return request<string>({
    method: 'POST',
    url: `/form/data/${formKey}`,
    data: payload,
  })
}

/**
 * 提交前归一层：按字段 type 转换值，对齐后端期望格式。
 *
 * - BOOL: true/false → 1/0
 * - DATE: 确保为 ISO 串 (YYYY-MM-DD)
 * - 其余类型: 原值透传
 * - 缺失字段: 补空串
 *
 * 纯函数，可独立使用，有单测覆盖。
 * TODO(P3-1b): TABLE 子字段按 subField type 递归归一。
 */
export function normalizeSubmitData(
  data: Record<string, unknown>,
  fields: FormSchemaField[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const field of fields) {
    const value = data[field.name]
    if (value === undefined || value === null) {
      result[field.name] = field.type === 'TABLE' ? [] : ''
      continue
    }

    switch (field.type) {
      case 'BOOL':
        result[field.name] = value ? 1 : 0
        break
      case 'DATE':
        // 可选日期未填写时传 null，避免动态 TIMESTAMP 列收到空字符串而被数据库拒绝。
        result[field.name] = String(value).trim() ? String(value) : null
        break
      case 'TABLE': {
        const rows = Array.isArray(value) ? (value as Record<string, unknown>[]) : []
        result[field.name] = rows.map(({ _rowAction, _rowId, ...clean }) => clean)
        break
      }
      default:
        result[field.name] = value
    }
  }
  return result
}

/**
 * seam: 后端端点未就绪,形状已锁,上线即通。
 * GET /api/form/submit/by-key/{formKey}/list  query: pageNum, pageSize
 * 返回: PageResult<Record<string, unknown>>
 */
/**
 * seam: 后端端点未就绪，形状已锁，上线即通。
 * POST /api/form/data/{formKey}/query
 * 请求: { pageNum, pageSize, filters: [{field, op, value}] }
 * 响应: R<PageResult<Map>>  PageResult 中的 records 字段映射为 list
 *
 * 错误码: 1500 表单不存在/未发布 · 1501 字段未知 · 1502 不可筛选
 *         1503 op×type 不匹配 · 1504 op 不支持
 */
export interface QueryFilter {
  field: string
  op: 'EQ' | 'LIKE' | 'GE' | 'LE'
  value: string
}

export interface QueryRequest {
  pageNum: number
  pageSize: number
  filters: QueryFilter[]
}

/** 子表行变动动作类型（对齐后端 SubTableRowAction.action） */
export type SubTableRowActionType = 'ADD' | 'UPDATE' | 'DELETE' | 'UNCHANGED'

/** 子表行变动描述（对齐后端 SubTableRowAction） */
export interface SubTableRowAction {
  action: SubTableRowActionType
  id?: string
  data?: Record<string, unknown>
}

/** 更新请求体 */
export interface UpdateFormDataPayload {
  data: Record<string, unknown>
  version: number
  subTableRows: Record<string, SubTableRowAction[]>
}

export async function queryFormData(
  formKey: string,
  query: QueryRequest,
): Promise<PageResult<Record<string, unknown>>> {
  const raw = await request<BackendPageResult<Record<string, unknown>>>({
    method: 'POST',
    url: `/form/data/${formKey}/query`,
    data: query,
  })
  return {
    list: raw.records,
    total: raw.total,
    pageNum: raw.pageNum,
    pageSize: raw.pageSize,
  }
}

/**
 * DELETE /api/form/data/{formKey}/{recordId}
 * 删除指定表单数据记录。
 * 幂等:删不存在/已删也返成功。
 * 错误码:1505 记录被其他表单引用,不能删除。
 */
export async function deleteFormData(formKey: string, recordId: string): Promise<void> {
  return request<void>({
    method: 'DELETE',
    url: `/form/data/${formKey}/${recordId}`,
  })
}

/**
 * 直连: GET /api/form/data/{formKey}/{recordId}
 * 返回: R<Map> 含 id / version / 审计列 / 业务字段 / 子表行（每行带行 id）
 */
export async function getFormData(
  formKey: string,
  recordId: string,
): Promise<Record<string, unknown>> {
  return request<Record<string, unknown>>({
    method: 'GET',
    url: `/form/data/${formKey}/${recordId}`,
  })
}

/**
 * 直连: PUT /api/form/data/{formKey}/{recordId}
 * 请求: { data, version, subTableRows }
 * 错误码: 1507 记录不存在/已删 · 1508 版本冲突
 */
export async function updateFormData(
  formKey: string,
  recordId: string,
  payload: UpdateFormDataPayload,
): Promise<void> {
  return request<void>({
    method: 'PUT',
    url: `/form/data/${formKey}/${recordId}`,
    data: payload,
  })
}

export async function listSubmissions(
  formKey: string,
  page: PageQuery,
): Promise<PageResult<Record<string, unknown>>> {
  const raw = await request<BackendPageResult<Record<string, unknown>>>({
    method: 'GET',
    url: `/form/submit/by-key/${formKey}/list`,
    params: page,
  })
  return {
    list: raw.records,
    total: raw.total,
    pageNum: raw.pageNum,
    pageSize: raw.pageSize,
  }
}

/**
 * 下载表单模板。
 * GET /api/form/data/{formKey}/template
 * 返回: Blob（.xlsx 文件）
 */
export async function downloadFormTemplate(formKey: string): Promise<Blob> {
  const response = await request<Blob>({
    method: 'GET',
    url: `/form/data/${formKey}/template`,
    responseType: 'blob',
  })
  return response
}

/**
 * 导入表单数据。
 * POST /api/form/data/{formKey}/import
 * 请求: FormData（包含 file 字段）
 * 返回: ImportResult
 */
export interface ImportResult {
  totalRows: number
  successCount: number
  errorCount: number
  successIds: string[]
  errors: Array<{
    rowNum: number
    message: string
  }>
}

export async function importFormData(formKey: string, file: File): Promise<ImportResult> {
  const formData = new FormData()
  formData.append('file', file)

  return request<ImportResult>({
    method: 'POST',
    url: `/form/data/${formKey}/import`,
    data: formData,
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })
}

/**
 * 导出表单数据。
 * POST /api/form/data/{formKey}/export
 * 请求: QueryRequest（可选）
 * 返回: Blob（.xlsx 文件）
 */
export async function exportFormData(formKey: string, query?: QueryRequest): Promise<Blob> {
  const response = await request<Blob>({
    method: 'POST',
    url: `/form/data/${formKey}/export`,
    data: query,
    responseType: 'blob',
  })
  return response
}

import { request } from '@/foundation/request'
import { parseDefinition } from '@/adapters/form-designer'
import type { FormSchema } from '@/contracts/form-schema'
import type { PageQuery, PageResult } from '@/contracts/common'

/**
 * 表单定义 API 模块（设计器草稿保存 / 发布接线 / 列表查询 / 历史版本快照）。
 *
 * 全部走 foundation/request，禁直引 axios。
 */

/** 后端 sw_form_def 记录状态。 */
export type FormDefStatus = 'DRAFT' | 'PUBLISHED'

/** 建草稿请求体。 */
export interface FormCreateReq {
  formKey: string
  name: string
}

/** 表单定义 DTO（后端返回）。 */
export interface FormDefDTO {
  id: string
  formKey: string
  name?: string
  status: FormDefStatus
  /** 当前发布版本号（P52 工作台展示用；发布成功后服务端递增）。 */
  formVersion?: number
}

/**
 * 表单定义列表项 DTO（比 FormDefDTO 多字段，来自分页端点）。
 * GET /api/form/def/page 返回的行数据。
 */
export interface FormDefListItem {
  id: string
  formKey: string
  name: string
  logicalTableName: string
  status: FormDefStatus
  physicalTableName: string
  formVersion: number
  description: string
  createTime: string
  updateTime: string
}

/**
 * 后端分页原始形状（records 字段，与前端的 list 不同）。
 */
interface BackendPageResult<T> {
  records: T[]
  total: number
  pageNum: number
  pageSize: number
}

function adaptPage<T>(raw: BackendPageResult<T>): PageResult<T> {
  return {
    list: raw.records,
    total: raw.total,
    pageNum: raw.pageNum,
    pageSize: raw.pageSize,
  }
}

/** 存 definition 请求体。 */
export interface FormConfigSaveReq {
  definition: string
}

/** 表单历史版本快照（列表行，不含 definition）。 */
export interface FormSnapshotDTO {
  formVersion: number
  createTime: string
}

/** 表单历史版本快照详情（只读预览用，含完整 definition）。 */
export interface FormSnapshotDetailDTO extends FormSnapshotDTO {
  definition: string
}

/**
 * 新建草稿。
 * POST /api/form/def
 * 入参 FormCreateReq，返 FormDefDTO（status=DRAFT）。
 */
export async function createFormDef(req: FormCreateReq): Promise<FormDefDTO> {
  return request<FormDefDTO>({
    method: 'POST',
    url: '/form/def',
    data: req,
  })
}

/**
 * 保存表单定义（可反复调，不校验、不动状态）。
 * POST /api/form/def/{id}/config
 * 入参 FormConfigSaveReq（definition = FormSchema JSON 字符串）。
 */
export async function saveFormConfig(id: string, definition: string): Promise<void> {
  return request<void>({
    method: 'POST',
    url: `/form/def/${id}/config`,
    data: { definition } satisfies FormConfigSaveReq,
  })
}

/**
 * 取已存表单定义。
 * GET /api/form/def/{id}/definition
 * 返 definition JSON 字符串，经防腐层 parseDefinition 解析为 FormSchema。
 */
export async function getFormDefinitionById(id: string): Promise<FormSchema> {
  const rawJson = await request<string>({
    method: 'GET',
    url: `/form/def/${id}/definition`,
  })
  return parseDefinition(rawJson)
}

/**
 * 发布表单定义。
 * POST /api/form/def/{id}/publish
 * 后端从库读 definition 做校验 → 建表 DDL → status 改 PUBLISHED → 存快照。
 * 返更新后的 FormDefDTO（status=PUBLISHED）。
 *
 * 红线：后端不接前端传的 definition，所以调用方必须先调 saveFormConfig 再调本接口。
 */
export async function publishFormDef(id: string): Promise<FormDefDTO> {
  return request<FormDefDTO>({
    method: 'POST',
    url: `/form/def/${id}/publish`,
  })
}

/**
 * 分页查询表单定义列表。
 * GET /api/form/def/page?pageNum=&pageSize=&keyword=
 * 返 PageResult<FormDefListItem>，排序 update_time DESC。
 * keyword 为可选模糊搜索词（匹配 name / formKey）。
 */
export async function pageFormDefs(
  page: PageQuery,
  keyword?: string,
): Promise<PageResult<FormDefListItem>> {
  const params: Record<string, unknown> = { ...page }
  if (keyword) params.keyword = keyword
  const raw = await request<BackendPageResult<FormDefListItem>>({
    method: 'GET',
    url: '/form/def/page',
    params,
  })
  return adaptPage(raw)
}

/**
 * 根据 ID 获取表单定义 DTO（含 formKey/name/status/formVersion）。
 * GET /api/form/def/{id}
 * 工作台用：表单身份的唯一权威来源（稳定业务标识 formKey 由此取得）。
 * 表单不存在/已删除/无权 → 后端 code 1000。
 */
export async function getFormDefById(id: string): Promise<FormDefDTO> {
  return request<FormDefDTO>({
    method: 'GET',
    url: `/form/def/${id}`,
  })
}

/**
 * 查询表单历史版本快照列表（版本号倒序，只读）。
 * GET /api/form/def/{id}/snapshots
 * 只返版本元数据，不含 definition；从未发布过 → 空数组。
 */
export async function listFormSnapshots(id: string): Promise<FormSnapshotDTO[]> {
  return request<FormSnapshotDTO[]>({
    method: 'GET',
    url: `/form/def/${id}/snapshots`,
  })
}

/**
 * 读取指定版本的快照详情（只读预览）。
 * GET /api/form/def/{id}/snapshots/{formVersion}
 * 返该版本完整 definition；版本不存在 → code 1301。
 * 只读契约：不提供任何回写路径，历史内容不得覆盖当前草稿。
 */
export async function getFormSnapshotDefinition(
  id: string,
  formVersion: number,
): Promise<FormSnapshotDetailDTO> {
  return request<FormSnapshotDetailDTO>({
    method: 'GET',
    url: `/form/def/${id}/snapshots/${formVersion}`,
  })
}

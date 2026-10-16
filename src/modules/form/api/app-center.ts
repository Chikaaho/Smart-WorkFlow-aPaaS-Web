/**
 * 应用中心 API（应用 → 目录 → 表单）。
 *
 * 后台管理（form:app:manage）：/form/app/manage；
 * 用户端应用中心（登录即可）：/form/app/center。
 * 全部走 foundation/request（业务层禁直引 axios）。
 */
import { request } from '@/foundation/request'
import type {
  FormApp,
  FormAppContent,
  FormAppDir,
  FormAppDirSaveReq,
  FormAppMembershipReq,
  FormAppSaveReq,
} from '@/contracts/app-center'

// ==================== 后台管理 ====================

/** 租户选项（0.1.7 #1：可见范围 TENANT 维度候选）。 */
export interface TenantOption {
  id: number
  name: string
}

/** 租户选项列表（后端只读查询；失败由调用方兜底为空）。 */
export async function listTenantOptions(): Promise<TenantOption[]> {
  return request<TenantOption[]>({
    method: 'GET',
    url: '/form/app/manage/tenants',
  })
}

/** 应用列表（含停用与承接应用）。 */
export async function listFormApps(keyword?: string): Promise<FormApp[]> {
  return request<FormApp[]>({
    method: 'GET',
    url: '/form/app/manage/list',
    params: keyword ? { keyword } : undefined,
  })
}

/** 新建应用。 */
export async function createFormApp(req: FormAppSaveReq): Promise<FormApp> {
  return request<FormApp>({ method: 'POST', url: '/form/app/manage', data: req })
}

/** 更新应用（含可见范围整体重配）。 */
export async function updateFormApp(id: string, req: FormAppSaveReq): Promise<FormApp> {
  return request<FormApp>({ method: 'PUT', url: `/form/app/manage/${id}`, data: req })
}

/** 删除应用（有目录或表单引用时后端拒绝）。 */
export async function deleteFormApp(id: string): Promise<void> {
  return request<void>({ method: 'DELETE', url: `/form/app/manage/${id}` })
}

/** 停用应用（阻止新增入口，保留数据与历史）。 */
export async function disableFormApp(id: string): Promise<void> {
  return request<void>({ method: 'POST', url: `/form/app/manage/${id}/disable` })
}

/** 恢复应用。 */
export async function enableFormApp(id: string): Promise<void> {
  return request<void>({ method: 'POST', url: `/form/app/manage/${id}/enable` })
}

/** 应用内容（管理视角：全部业务表单，目录 + 直接归属分组）。 */
export async function getFormAppContent(appId: string): Promise<FormAppContent> {
  return request<FormAppContent>({ method: 'GET', url: `/form/app/manage/${appId}/content` })
}

/** 新建目录。 */
export async function createFormAppDir(appId: string, req: FormAppDirSaveReq): Promise<FormAppDir> {
  return request<FormAppDir>({ method: 'POST', url: `/form/app/manage/${appId}/dirs`, data: req })
}

/** 更新目录名称/排序。 */
export async function updateFormAppDir(dirId: string, req: FormAppDirSaveReq): Promise<FormAppDir> {
  return request<FormAppDir>({ method: 'PUT', url: `/form/app/manage/dirs/${dirId}`, data: req })
}

/** 删除目录（目录下有表单时后端拒绝）。 */
export async function deleteFormAppDir(dirId: string): Promise<void> {
  return request<void>({ method: 'DELETE', url: `/form/app/manage/dirs/${dirId}` })
}

/** 表单归属调整（显式操作；目标须为租户内启用应用）。 */
export async function assignFormMembership(
  formId: string,
  req: FormAppMembershipReq,
): Promise<void> {
  return request<void>({
    method: 'PUT',
    url: `/form/app/manage/forms/${formId}/membership`,
    data: req,
  })
}

// ==================== 用户端应用中心 ====================

/** 当前用户可见的应用（启用 + 可见范围命中）。 */
export async function listAppCenterApps(): Promise<FormApp[]> {
  return request<FormApp[]>({ method: 'GET', url: '/form/app/center/apps' })
}

/** 可见应用内容：目录与可用表单（未发布/停用/不可见表单不下发）。 */
export async function getAppCenterContent(appId: string): Promise<FormAppContent> {
  return request<FormAppContent>({ method: 'GET', url: `/form/app/center/apps/${appId}` })
}

/**
 * 租户管理前端类型 —— 镜像后端 TenantView（0.2.0 T020）。
 * id/编码保持后端字符串形态（Long 经全局 Jackson 字符串化）。
 */

export interface SysTenant {
  id?: string
  code?: string
  name: string
  adminUserId?: string | null
  adminUsername?: string | null
  status?: number
  createTime?: string
}

export interface TenantFilter {
  name?: string
  status?: number
}

export interface TenantCreatePayload {
  name: string
  adminUsername: string
  adminPassword: string
}

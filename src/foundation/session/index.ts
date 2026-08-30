import type { Session } from '@/contracts/session'
import { request } from '@/foundation/request'

// ─── 后端响应 DTO ──────────────────────────────────────────

/** GET /system/auth/me 返回的 user 字段形状。 */
interface SessionUserDTO {
  id: string
  username: string
  displayName: string
  deptId: string
  tenantId: string
  avatar: string | null
}

/** GET /system/auth/me 返回的顶层形状。 */
interface SessionDTO {
  user: SessionUserDTO
  permissions: string[]
  roles: string[]
  superAdmin: boolean
}

// ─── Adapter ────────────────────────────────────────────────

/**
 * 后端 DTO → 前端 Session 契约映射。
 * 数组转 Set、数字 id 转字符串、null avatar 转 undefined，
 * 不让后端形状泄漏进业务层（§2 防腐层）。
 */
function mapSession(dto: SessionDTO): Session {
  return {
    user: {
      id: String(dto.user.id),
      username: dto.user.username,
      displayName: dto.user.displayName,
      deptId: dto.user.deptId != null ? String(dto.user.deptId) : null,
      tenantId: dto.user.tenantId != null ? String(dto.user.tenantId) : null,
      avatar: dto.user.avatar ?? undefined,
    },
    permissions: new Set(dto.permissions ?? []),
    roles: new Set(dto.roles ?? []),
    superAdmin: dto.superAdmin,
  }
}

// 为单测导出（纯函数，无副作用）
export { mapSession }

// ─── 公开 API ──────────────────────────────────────────────

/**
 * 加载当前用户会话。
 * - pnpm dev:mock 模式：请求被 mock 调度器拦截，返回假数据；
 * - pnpm dev/prod 模式：请求穿透到后端 GET /system/auth/me 真端点。
 */
export async function loadSession(): Promise<Session> {
  const dto = await request<SessionDTO>({
    method: 'GET',
    url: '/system/auth/me',
  })
  return mapSession(dto)
}

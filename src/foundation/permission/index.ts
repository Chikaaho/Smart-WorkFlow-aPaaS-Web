import type { Directive } from 'vue'
import type { DataScope } from '@/contracts/common'
import { useUserStore } from '@/stores/user'

/**
 * 前端权限仅用于 UX 显隐，真实鉴权必须在后端校验。
 */

export function hasPerm(code: string): boolean {
  const session = useUserStore()
  return session.superAdmin || session.permissions.has(code)
}

export function hasRole(role: string): boolean {
  const session = useUserStore()
  return session.superAdmin || session.roles.has(role)
}

/**
 * 数据权限非安全定性，仅供 UI 展示参考；本轮不实现任何 scope 过滤，恒真。
 */
export function checkDataScope(_scope: DataScope): boolean {
  return true
}

export function usePermission() {
  return { hasPerm, hasRole, checkDataScope }
}

/**
 * 会话整体仍是占位态（permissions/roles 皆空且非超管，即 getInfo 尚未真接入）时不拦截，
 * 避免空权限集合把整个 UI 锁死。getInfo 真接入后，真实用户通常会有非空权限集合，
 * 该指令自然切回真实拦截，不需要再改代码（决策文档 v2 §3）。
 */
function isSessionPlaceholder(): boolean {
  const session = useUserStore()
  return !session.superAdmin && session.permissions.size === 0 && session.roles.size === 0
}

export function isPermVisible(code: string): boolean {
  return isSessionPlaceholder() || hasPerm(code)
}

export const permissionDirective: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    el.style.display = isPermVisible(binding.value) ? '' : 'none'
  },
  updated(el, binding) {
    el.style.display = isPermVisible(binding.value) ? '' : 'none'
  },
}

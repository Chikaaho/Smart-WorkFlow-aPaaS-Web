import type { Directive } from 'vue'
import type { DataScope } from '@/contracts/common'
import { useUserStore } from '@/stores/user'

/**
 * 前端权限仅用于 UX 显隐，真实鉴权必须在后端校验。
 * I5 收口：真实会话为空权限时默认隐藏受控入口（fail closed），
 * 不再保留「placeholder 恒真」的 fail-open 回退。
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

export function isPermVisible(code: string): boolean {
  return hasPerm(code)
}

export const permissionDirective: Directive<HTMLElement, string> = {
  mounted(el, binding) {
    el.style.display = isPermVisible(binding.value) ? '' : 'none'
  },
  updated(el, binding) {
    el.style.display = isPermVisible(binding.value) ? '' : 'none'
  },
}

import { defineStore } from 'pinia'
import type { Session, SessionUser } from '@/contracts/session'

export const useUserStore = defineStore('user', {
  state: () => ({
    user: null as SessionUser | null,
    permissions: new Set<string>(),
    roles: new Set<string>(),
    superAdmin: false,
  }),
  actions: {
    setSession(session: Session): void {
      this.user = session.user
      this.permissions = session.permissions
      this.roles = session.roles
      this.superAdmin = session.superAdmin
    },
    clearSession(): void {
      this.user = null
      this.permissions = new Set()
      this.roles = new Set()
      this.superAdmin = false
    },
  },
})

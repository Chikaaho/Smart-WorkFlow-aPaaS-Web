<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { exchangeSsoTicket } from '@/foundation/auth/sso'

/**
 * SSO 回跳页（I5）：Provider 回调完成后服务端 302 到本页并携带一次性 ticket；
 * 本页立即兑换会话（与第一方登录同一 TokenResponse 契约），随后进入工作台。
 * ticket 限时一次性，兑换失败展示可判定错误。
 */
const route = useRoute()
const router = useRouter()
const errorMessage = ref('')
const exchanging = ref(true)

function safeRedirect(raw: unknown): string {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

onMounted(async () => {
  const ticket = typeof route.query.sso_ticket === 'string' ? route.query.sso_ticket : ''
  if (!ticket) {
    errorMessage.value = t('view.ssoTicketMissing')
    exchanging.value = false
    return
  }
  try {
    await exchangeSsoTicket(ticket)
    await router.push(safeRedirect(route.query.redirect))
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('view.ssoLoginFailed')
    exchanging.value = false
  }
})
</script>

<template>
  <div class="sso-return">
    <div class="card">
      <template v-if="exchanging">
        <p class="title">{{ t('view.completingThirdPartyLogin') }}</p>
        <p class="hint">{{ t('view.establishingLocalSession') }}</p>
      </template>
      <template v-else>
        <p class="title error">{{ t('view.ssoLoginIncomplete') }}</p>
        <p class="hint">{{ errorMessage }}</p>
        <router-link class="link" to="/login">{{ t('view.backToPasswordLogin') }}</router-link>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sso-return {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--sw-fill, #f5f7fa);
}
.card {
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  padding: 32px;
  min-width: 320px;
  text-align: center;
}
.title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 8px;
}
.title.error {
  color: #f56c6c;
}
.hint {
  font-size: 13px;
  color: #909399;
  margin: 0 0 16px;
}
.link {
  font-size: 14px;
  color: #7e306b;
  text-decoration: none;
}
</style>

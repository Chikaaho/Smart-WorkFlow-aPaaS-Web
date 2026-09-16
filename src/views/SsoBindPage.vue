<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { request } from '@/foundation/request'
import { getAccessToken } from '@/foundation/auth/token'

/**
 * SSO 绑定确认页（I5）：Provider 回调后未绑定时服务端 302 到本页并携带
 * 一次性候选 ticket；本页兑换外部身份候选并展示确认绑定。绑定动作需已认证
 * 会话——未登录时引导先登录（绑定键含租户，登录后租户上下文成立）。
 */
const route = useRoute()
const router = useRouter()
const errorMessage = ref('')
const externalDigestPrefix = ref('')
const ticket = ref('')
const binding = ref(false)

interface CandidateDTO {
  provider: string
  externalDigestPrefix: string
}

onMounted(async () => {
  ticket.value = typeof route.query.ticket === 'string' ? route.query.ticket : ''
  if (!ticket.value) {
    errorMessage.value = t('view.ssoBindTicketMissing')
    return
  }
  try {
    const candidate = await request<CandidateDTO>({
      method: 'POST',
      url: '/auth/sso/candidate',
      data: { ticket: ticket.value },
    })
    externalDigestPrefix.value = candidate.externalDigestPrefix
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('view.ssoBindCandidateExpired')
  }
})

async function onBind(): Promise<void> {
  if (!getAccessToken()) {
    // 未登录：引导先登录（同源 redirect 回本页）
    await router.push({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  binding.value = true
  try {
    await request<null>({
      method: 'POST',
      url: '/auth/sso/bind-candidate',
      data: { ticket: ticket.value },
    })
    await router.push('/workspace')
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('view.ssoBindFailed')
  } finally {
    binding.value = false
  }
}
</script>

<template>
  <div class="sso-bind">
    <div class="card">
      <p class="title">{{ t('view.bindThirdPartyAccount') }}</p>
      <template v-if="errorMessage">
        <p class="hint error">{{ errorMessage }}</p>
        <router-link class="link" to="/login">{{ t('view.backToLogin') }}</router-link>
      </template>
      <template v-else>
        <p class="hint">
          {{ t('auth.ssoBindLead') }} <code>{{ externalDigestPrefix || '…' }}</code
          >{{ t('auth.ssoBindTail') }}
        </p>
        <button class="btn" :disabled="binding" @click="onBind">
          {{ binding ? t('view.binding') : t('view.confirmBind') }}
        </button>
      </template>
    </div>
  </div>
</template>

<style scoped>
.sso-bind {
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
  min-width: 360px;
  text-align: center;
}
.title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 12px;
}
.hint {
  font-size: 13px;
  color: #606266;
  margin: 0 0 16px;
  line-height: 1.6;
}
.hint.error {
  color: #f56c6c;
}
.btn {
  background: #7e306b;
  color: #fff;
  border: none;
  border-radius: 4px;
  padding: 8px 24px;
  font-size: 14px;
  cursor: pointer;
}
.btn:disabled {
  background: #bf98b5;
  cursor: not-allowed;
}
.link {
  font-size: 14px;
  color: #7e306b;
  text-decoration: none;
}
</style>

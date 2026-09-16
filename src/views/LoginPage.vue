<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/foundation/auth'
import type { LoginChallengeDTO } from '@/foundation/auth'
import { SSO_PROVIDERS, startSsoLoginAuthorize } from '@/foundation/auth/sso'
import type { SsoProvider } from '@/foundation/auth/sso'
import { useI18n } from '@/locales'
import LocaleSwitch from '@/components/LocaleSwitch.vue'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const { fetchChallenge, login } = useAuth()

const username = ref('')
const password = ref('')
const captcha = ref('')
const challenge = ref<LoginChallengeDTO | null>(null)
const submitting = ref(false)
const errorMessage = ref('')

// 第三方登录（登录前安全发起：显式租户，服务端校验后重定向到 Provider）
const ssoProvider = ref<SsoProvider>('WECOM')
const ssoTenantId = ref('')
const ssoBusy = ref(false)
const ssoError = ref('')

function safeRedirect(raw: unknown): string {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

/** 签发新挑战（首载与每次登录失败后调用；旧挑战已一次性消费/作废） */
async function reloadChallenge(): Promise<void> {
  captcha.value = ''
  try {
    challenge.value = await fetchChallenge()
  } catch {
    challenge.value = null
    errorMessage.value = t('errors.network')
  }
}

onMounted(() => {
  void reloadChallenge()
})

async function onSubmit(): Promise<void> {
  errorMessage.value = ''
  if (!challenge.value) {
    errorMessage.value = t('auth.captchaNotReady')
    return
  }
  submitting.value = true
  try {
    await login({
      username: username.value,
      password: password.value,
      captcha: captcha.value,
      challenge: challenge.value,
    })
    await router.push(safeRedirect(route.query.redirect))
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : t('auth.signIn')
    // 挑战是一次性的：无论失败原因，旧挑战已消费/作废，必须换新挑战再试
    password.value = ''
    await reloadChallenge()
  } finally {
    submitting.value = false
  }
}

async function onSsoLogin(): Promise<void> {
  ssoError.value = ''
  const tenant = Number(ssoTenantId.value)
  if (!Number.isInteger(tenant) || tenant < 0) {
    ssoError.value = t('auth.tenantIdInvalid')
    return
  }
  ssoBusy.value = true
  try {
    const redirect = safeRedirect(route.query.redirect)
    const start = await startSsoLoginAuthorize(ssoProvider.value, tenant, redirect)
    // 服务端重定向到 Provider 授权页；state 由服务端签发，前端不持久化
    globalThis.location.href = start.authorizeUrl
  } catch (error) {
    ssoError.value = error instanceof Error ? error.message : t('errors.network')
  } finally {
    ssoBusy.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <form class="login-page__form" @submit.prevent="onSubmit">
      <div class="login-page__top">
        <h1>CH-aPaaS</h1>
        <LocaleSwitch />
      </div>
      <label>
        {{ t('common.username') }}
        <input v-model="username" type="text" autocomplete="username" required />
      </label>
      <label>
        {{ t('common.password') }}
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>
      <label>
        {{ t('auth.captcha') }}
        <div class="login-page__captcha-row">
          <input v-model="captcha" type="text" autocomplete="off" required maxlength="8" />
          <img
            v-if="challenge"
            class="login-page__captcha"
            alt=""
            :title="t('auth.refreshCaptcha')"
            :src="challenge.captchaImage"
            @click="reloadChallenge"
          />
          <span
            v-else
            class="login-page__captcha login-page__captcha--loading"
            @click="reloadChallenge"
          >
            {{ t('auth.refresh') }}
          </span>
        </div>
      </label>
      <p v-if="errorMessage" class="login-page__error">{{ errorMessage }}</p>
      <button type="submit" :disabled="submitting || !challenge">
        {{ submitting ? t('auth.signingIn') : t('auth.signIn') }}
      </button>
      <div class="login-page__sso">
        <p class="login-page__sso-title">{{ t('auth.thirdParty') }}</p>
        <div class="login-page__sso-row">
          <select v-model="ssoProvider" :aria-label="t('auth.chooseProvider')">
            <option v-for="p in SSO_PROVIDERS" :key="p.key" :value="p.key">{{ p.label }}</option>
          </select>
          <input
            v-model="ssoTenantId"
            type="number"
            min="0"
            :placeholder="t('auth.tenantId')"
            :aria-label="t('auth.tenantId')"
          />
          <button type="button" :disabled="ssoBusy" @click="onSsoLogin">
            {{ ssoBusy ? t('auth.redirecting') : t('auth.goToAuthorize') }}
          </button>
        </div>
        <p v-if="ssoError" class="login-page__error">{{ ssoError }}</p>
      </div>
    </form>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
}
.login-page__form {
  display: flex;
  flex-direction: column;
  gap: 12px;
  width: 280px;
  padding: 24px;
  border: 1px solid #eee;
  border-radius: 8px;
}
.login-page__form label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 14px;
}
.login-page__captcha-row {
  display: flex;
  gap: 8px;
  align-items: stretch;
}
.login-page__captcha {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 72px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  background: #f5f7fa;
  user-select: none;
  cursor: pointer;
}
img.login-page__captcha {
  height: 36px;
  padding: 0;
}
.login-page__captcha--loading {
  color: #909399;
  font-size: 13px;
  letter-spacing: normal;
}
.login-page__error {
  color: #d33;
  font-size: 13px;
  margin: 0;
}
.login-page__sso {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid #f0f0f0;
}
.login-page__sso-title {
  font-size: 12px;
  color: #909399;
  margin: 0;
}
.login-page__sso-row {
  display: flex;
  gap: 6px;
}
.login-page__sso-row select,
.login-page__sso-row input {
  flex: 1;
  min-width: 0;
  height: 30px;
  border: 1px solid #dcdfe6;
  border-radius: 4px;
  padding: 0 6px;
  font-size: 13px;
}
.login-page__sso-hint {
  color: #909399;
  font-size: 12px;
  line-height: 1.6;
  margin: 12px 0 0;
}
</style>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/foundation/auth'
import type { LoginChallengeDTO } from '@/foundation/auth'
import { SSO_PROVIDERS, startSsoLoginAuthorize } from '@/foundation/auth/sso'
import type { SsoProvider } from '@/foundation/auth/sso'
import { useI18n } from '@/locales'
import { Share, Document, MagicStick } from '@element-plus/icons-vue'
import LocaleSwitch from '@/components/LocaleSwitch.vue'
import logoUrl from '@/assets/brand/logo-mark.png'

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
    <section class="login-page__brand" aria-hidden="true">
      <div class="login-page__brand-head">
        <img class="login-page__brand-logo" :src="logoUrl" alt="" />
        <div>
          <strong>CH-aPaaS</strong>
          <span>{{ t('login.brandTagline') }}</span>
        </div>
      </div>
      <span class="login-page__badge">{{ t('login.brandBadge') }}</span>
      <h1 class="login-page__headline">{{ t('login.brandHeadline') }}</h1>
      <p class="login-page__brand-sub">{{ t('login.brandSub') }}</p>
      <div class="login-page__pills">
        <span class="login-page__pill">
          <el-icon :size="18" class="login-page__pill-icon"><Share /></el-icon>
          <span class="login-page__pill-title">{{ t('login.brandPillFlowTitle') }}</span>
          <span class="login-page__pill-sub">{{ t('login.brandPillFlowSub') }}</span>
        </span>
        <span class="login-page__pill">
          <el-icon :size="18" class="login-page__pill-icon"><Document /></el-icon>
          <span class="login-page__pill-title">{{ t('login.brandPillDataTitle') }}</span>
          <span class="login-page__pill-sub">{{ t('login.brandPillDataSub') }}</span>
        </span>
        <span class="login-page__pill">
          <el-icon :size="18" class="login-page__pill-icon"><MagicStick /></el-icon>
          <span class="login-page__pill-title">{{ t('login.brandPillAgentTitle') }}</span>
          <span class="login-page__pill-sub">{{ t('login.brandPillAgentSub') }}</span>
        </span>
      </div>
      <div class="login-page__footnote">
        <span class="login-page__footnote-dot" />{{ t('login.brandFootnote') }}
      </div>
    </section>

    <section class="login-page__panel">
      <form class="login-page__form" @submit.prevent="onSubmit">
        <div class="login-page__top">
          <h2 class="login-page__welcome">{{ t('login.welcome') }}</h2>
          <span class="login-page__secure">{{ t('login.secureBadge') }}</span>
          <LocaleSwitch class="login-page__locale" />
        </div>
        <p class="login-page__welcome-sub">{{ t('login.welcomeSub') }}</p>
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
        <p v-if="errorMessage" class="login-page__error" role="alert">{{ errorMessage }}</p>
        <button type="submit" class="login-page__submit" :disabled="submitting || !challenge">
          {{ submitting ? t('auth.signingIn') : t('auth.signIn') }}
        </button>
        <div class="login-page__sso">
          <p class="login-page__sso-title">
            <span class="login-page__sso-rule" />{{ t('login.ssoDivider') }}
          </p>
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
          <p class="login-page__sso-hint">{{ t('login.tenantHint') }}</p>
          <p v-if="ssoError" class="login-page__error" role="alert">{{ ssoError }}</p>
        </div>
      </form>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  min-height: 100vh;
  background: var(--sw-surface-page);
}
/* ── 左侧品牌区（深色渐变） ── */
.login-page__brand {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 20px;
  flex: 1 1 50%;
  padding: 64px 72px;
  background:
    radial-gradient(640px 640px at 78% -8%, rgba(111, 45, 255, 0.55), transparent 62%),
    radial-gradient(900px 500px at 0% 110%, rgba(32, 184, 205, 0.12), transparent 60%),
    linear-gradient(160deg, #16143e 0%, #1a204c 55%, #23254c 100%);
  color: #ffffff;
}
.login-page__brand-head {
  display: flex;
  align-items: center;
  gap: 14px;
}
.login-page__brand-logo {
  box-sizing: border-box;
  width: 56px;
  height: 56px;
  padding: 9px;
  object-fit: contain;
  background: #ffffff;
  border-radius: 14px;
}
.login-page__brand-head strong {
  display: block;
  font-size: 24px;
  letter-spacing: 0.5px;
}
.login-page__brand-head span {
  display: block;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.72);
}
.login-page__badge {
  align-self: flex-start;
  padding: 6px 14px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 999px;
  font-size: 12px;
  letter-spacing: 2px;
  color: rgba(255, 255, 255, 0.85);
}
.login-page__headline {
  margin: 8px 0 0;
  max-width: 560px;
  font-size: 34px;
  line-height: 1.35;
  font-weight: 700;
}
.login-page__brand-sub {
  margin: 0;
  max-width: 520px;
  font-size: 14px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.78);
}
.login-page__pills {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  max-width: 640px;
}
.login-page__pills span {
  padding: 14px 16px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: var(--sw-radius-base);
  background: rgba(255, 255, 255, 0.06);
  font-size: 13px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.88);
}
.login-page__pill {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.login-page__pill-icon {
  color: var(--sw-color-primary-light);
}
.login-page__pill-title {
  font-size: 14px;
  font-weight: 600;
  color: #ffffff;
}
.login-page__pill-sub {
  font-style: normal;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
}
.login-page__footnote {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 10px 16px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.08);
  width: fit-content;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
}
.login-page__footnote-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--sw-success);
}
/* ── 右侧表单区 ── */
.login-page__panel {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 50%;
  /* 允许 flex 项收缩到视口内：固定宽表单会抬高 min-content 导致 375 横向滚动 */
  min-width: 0;
  padding: 40px 24px;
}
.login-page__form {
  display: flex;
  flex-direction: column;
  gap: 14px;
  width: 100%;
  box-sizing: border-box;
  /* 无全局 border-box 复位：显式声明，保证 max-width 将内边距计入视口内 */
  max-width: 420px;
  padding: 36px 32px;
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-lg);
  box-shadow: var(--sw-shadow-modal);
}
.login-page__top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.login-page__form .login-page__locale {
  position: absolute;
  top: 18px;
  right: 20px;
  margin-left: 0;
}
.login-page__form {
  position: relative;
  padding-top: 64px;
}
.login-page__welcome {
  margin: 0;
  font-size: 28px;
  font-weight: 700;
  color: var(--sw-text-primary);
  /* 375 下顶行被语言选择器挤压时保持整词换行，不逐字竖排 */
  flex-shrink: 1;
  min-width: 0;
}
.login-page__secure {
  padding: 3px 10px;
  border-radius: 999px;
  background: var(--sw-color-primary-soft);
  color: var(--sw-color-primary);
  font-size: 12px;
  white-space: nowrap;
}
.login-page__locale {
  margin-left: auto;
}
.login-page__welcome-sub {
  margin: -6px 0 4px;
  font-size: 13px;
  color: var(--sw-text-secondary);
}
.login-page__form label {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
  font-weight: 500;
  color: var(--sw-text-regular);
}
.login-page__form input {
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  font-size: 14px;
  color: var(--sw-text-primary);
  background: var(--sw-surface-card);
}
.login-page__form input:focus {
  outline: none;
  border-color: var(--sw-color-primary);
  box-shadow: 0 0 0 2px var(--sw-color-primary-soft);
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
  min-width: 96px;
  border: 1px solid var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  background: var(--sw-fill-base);
  user-select: none;
  cursor: pointer;
}
img.login-page__captcha {
  height: 38px;
  padding: 0;
}
.login-page__captcha--loading {
  color: var(--sw-text-secondary);
  font-size: 13px;
}
.login-page__error {
  color: var(--sw-danger);
  font-size: 13px;
  margin: 0;
}
.login-page__submit {
  height: 42px;
  border: none;
  border-radius: var(--sw-radius-base);
  background: var(--sw-color-primary);
  color: #ffffff;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
}
.login-page__submit:hover {
  background: var(--sw-color-primary-dark);
}
.login-page__submit:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}
.login-page__sso {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 6px;
}
.login-page__sso-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 0;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.login-page__sso-rule {
  flex: 1;
  height: 1px;
  background: var(--sw-border-lighter);
}
.login-page__sso-row {
  display: flex;
  gap: 6px;
}
.login-page__sso-row select,
.login-page__sso-row input {
  flex: 1;
  min-width: 0;
  height: 34px;
  border: 1px solid var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  padding: 0 8px;
  font-size: 13px;
  color: var(--sw-text-primary);
  background: var(--sw-surface-card);
}
.login-page__sso-row button {
  flex: 0 0 auto;
  height: 34px;
  padding: 0 14px;
  border: none;
  border-radius: var(--sw-radius-base);
  background: var(--sw-color-primary-soft);
  color: var(--sw-color-primary);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.login-page__sso-row button:hover {
  background: var(--sw-color-primary-softer);
}
.login-page__sso-row button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
.login-page__sso-hint {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: var(--sw-text-secondary);
}
/* 375 视口：品牌区隐藏，表单满宽可用（方向 §4.5） */
@media (max-width: 767px) {
  .login-page__brand {
    display: none;
  }
  .login-page__panel {
    padding: 24px 16px;
  }
  /* 顶行空间不足：标题整行换行，语言选择器独占一行（避免标题逐字竖排） */
  .login-page__top {
    flex-wrap: wrap;
    row-gap: 8px;
  }
  .login-page__locale {
    margin-left: 0;
  }
}
</style>

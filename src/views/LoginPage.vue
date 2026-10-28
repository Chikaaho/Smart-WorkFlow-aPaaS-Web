<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/foundation/auth'
import type { LoginChallengeDTO } from '@/foundation/auth'
import { SSO_PROVIDERS, startSsoLoginAuthorize } from '@/foundation/auth/sso'
import type { SsoProvider } from '@/foundation/auth/sso'
import { useI18n } from '@/locales'
import { Lock, House, User, View, Hide, OfficeBuilding } from '@element-plus/icons-vue'
import LocaleSwitch from '@/components/LocaleSwitch.vue'

// SSO 徽标字：label 经 i18n 解析，徽标按 provider key 固定映射（WECOM=企业微信）
const SSO_MARKS: Record<SsoProvider, string> = { WECOM: '企', FEISHU: '飞', DINGTALK: '钉' }
import logoUrl from '@/assets/brand/logo-mark.png'

const { t } = useI18n()

const route = useRoute()
const router = useRouter()
const { fetchChallenge, login } = useAuth()

const username = ref('')
const tenantCode = ref('')
const tenantCodeVisible = ref(false)
const password = ref('')
const passwordVisible = ref(false)
const captcha = ref('')
const challenge = ref<LoginChallengeDTO | null>(null)
const challengeLoadFailed = ref(false)
const submitting = ref(false)
const errorMessage = ref('')

// 第三方登录（登录前安全发起：显式租户，服务端校验后重定向到 Provider）
const ssoProvider = ref<SsoProvider>('WECOM')
const ssoTenantName = ref('')
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
    if (challengeLoadFailed.value) errorMessage.value = ''
    challengeLoadFailed.value = false
  } catch {
    challengeLoadFailed.value = true
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
      tenantCode: tenantCode.value || undefined,
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
  // V012-BUG-019：租户只按名称精确匹配，服务端解析唯一租户；不再手填数值 ID
  const tenantName = ssoTenantName.value.trim()
  if (!tenantName) {
    ssoError.value = t('auth.tenantNameRequired')
    return
  }
  ssoBusy.value = true
  try {
    const redirect = safeRedirect(route.query.redirect)
    const start = await startSsoLoginAuthorize(ssoProvider.value, tenantName, redirect)
    // 服务端重定向到 Provider 授权页；state 由服务端签发，前端不持久化
    globalThis.location.href = start.authorizeUrl
  } catch (error) {
    ssoError.value = error instanceof Error ? error.message : t('errors.network')
  } finally {
    ssoBusy.value = false
  }
}

/** SSO Provider 选择：显式方法，避免模板内联多语句被格式化工具重排 */
function onSsoProviderSelect(key: SsoProvider): void {
  ssoProvider.value = key
  void onSsoLogin()
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
          <span class="login-page__pill-icon" aria-hidden="true">↗</span>
          <span class="login-page__pill-title">{{ t('login.brandPillFlowTitle') }}</span>
          <span class="login-page__pill-sub">{{ t('login.brandPillFlowSub') }}</span>
        </span>
        <span class="login-page__pill">
          <span class="login-page__pill-icon" aria-hidden="true">▤</span>
          <span class="login-page__pill-title">{{ t('login.brandPillDataTitle') }}</span>
          <span class="login-page__pill-sub">{{ t('login.brandPillDataSub') }}</span>
        </span>
        <span class="login-page__pill">
          <span class="login-page__pill-icon" aria-hidden="true">✧</span>
          <span class="login-page__pill-title">{{ t('login.brandPillAgentTitle') }}</span>
          <span class="login-page__pill-sub">{{ t('login.brandPillAgentSub') }}</span>
        </span>
      </div>
      <div class="login-page__footnote">
        {{ t('login.brandFootnote') }}
      </div>
    </section>

    <section class="login-page__panel">
      <form class="login-page__form" @submit.prevent="onSubmit">
        <div class="login-page__top">
          <h2 class="login-page__welcome">{{ t('login.welcome') }}</h2>
          <LocaleSwitch class="login-page__locale" />
        </div>
        <p class="login-page__welcome-sub">{{ t('login.welcomeSub') }}</p>
        <label for="login-account">
          <span class="login-page__label-row">
            <span id="login-account-label">账号</span>
            <button
              type="button"
              class="login-page__tenant-toggle"
              :aria-expanded="tenantCodeVisible"
              aria-controls="login-tenant-code"
              :aria-label="t('tenantAdmin.loginCode')"
              @click="tenantCodeVisible = !tenantCodeVisible"
            >
              {{ t('tenantAdmin.loginCode') }}
            </button>
          </span>
          <span class="login-page__input-wrap">
            <el-icon class="login-page__input-icon"><User /></el-icon>
            <input
              id="login-account"
              v-model="username"
              aria-labelledby="login-account-label"
              type="text"
              autocomplete="username"
              placeholder="请输入账号"
              required
            />
          </span>
        </label>
        <label v-if="tenantCodeVisible" id="login-tenant-code">
          {{ t('tenantAdmin.loginCode') }}
          <span class="login-page__input-wrap">
            <el-icon class="login-page__input-icon"><OfficeBuilding /></el-icon>
            <input
              v-model="tenantCode"
              type="text"
              autocomplete="organization"
              :placeholder="t('tenantAdmin.loginCodePlaceholder')"
            />
          </span>
        </label>
        <label>
          {{ t('common.password') }}
          <span class="login-page__input-wrap">
            <el-icon class="login-page__input-icon"><Lock /></el-icon>
            <input
              v-model="password"
              class="login-page__input-secret"
              :type="passwordVisible ? 'text' : 'password'"
              autocomplete="current-password"
              placeholder="请输入密码"
              required
            />
            <el-icon
              class="login-page__input-action login-page__input-action--toggle"
              role="button"
              :aria-label="passwordVisible ? '隐藏密码' : '查看密码'"
              @click="passwordVisible = !passwordVisible"
            >
              <component :is="passwordVisible ? Hide : View" />
            </el-icon>
          </span>
        </label>
        <label>
          {{ t('auth.captcha') }}
          <div class="login-page__captcha-row">
            <span class="login-page__input-wrap">
              <el-icon class="login-page__input-icon"><Lock /></el-icon>
              <input
                v-model="captcha"
                type="text"
                autocomplete="off"
                :placeholder="t('auth.captchaPlaceholder')"
                required
                maxlength="8"
              />
            </span>
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
          <!-- V012-BUG-019：租户以名称精确匹配，输入只服务于 SSO 授权；账号登录无需填写 -->
          <label class="login-page__sso-tenant">
            <span>{{ t('auth.tenantName') }}</span>
            <span class="login-page__input-wrap">
              <el-icon class="login-page__input-icon"><House /></el-icon>
              <input
                v-model="ssoTenantName"
                type="text"
                autocomplete="organization"
                :placeholder="t('auth.tenantNamePlaceholder')"
              />
            </span>
          </label>
          <div class="login-page__sso-row">
            <button
              v-for="(provider, index) in SSO_PROVIDERS"
              :key="provider.key"
              type="button"
              class="login-page__sso-provider"
              :class="`is-provider-${index + 1}`"
              :disabled="ssoBusy"
              @click="onSsoProviderSelect(provider.key)"
            >
              <span class="login-page__sso-provider-mark" aria-hidden="true">{{
                SSO_MARKS[provider.key]
              }}</span>
              {{ provider.label }}
            </button>
          </div>
          <p v-if="ssoError" class="login-page__error" role="alert">{{ ssoError }}</p>
        </div>
        <p class="login-page__legal">登录即表示同意《用户协议》与《隐私政策》</p>
        <a
          class="login-page__icp"
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noopener noreferrer"
          >粤ICP备2026093622号-1</a
        >
      </form>
    </section>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  min-height: 100vh;
  overflow: hidden;
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
    radial-gradient(
      circle 280px at 84.52% 10.74%,
      color-mix(in srgb, var(--sw-color-primary) 42%, transparent),
      transparent 100%
    ),
    radial-gradient(circle 310px at 10.71% 90.82%, rgba(35, 199, 217, 0.26), transparent 100%),
    linear-gradient(
      111.75deg,
      #0c1533 0%,
      color-mix(in srgb, var(--sw-color-primary) 32%, #0c1533) 52%,
      #102b4b 100%
    );
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
  background: rgba(255, 255, 255, 0.01);
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
  color: #c4cce5;
}
.login-page__trustline {
  margin: 0;
  font-size: 12px;
  line-height: 17px;
  color: #99a6cb;
}
.login-page__pills {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  max-width: 640px;
}
.login-page__pills > span {
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
.login-page__pill:nth-child(1) .login-page__pill-icon {
  color: #74e2ec;
}
.login-page__pill:nth-child(2) .login-page__pill-icon {
  color: #91e7c9;
}
.login-page__pill:nth-child(3) .login-page__pill-icon {
  color: var(--sw-color-primary-light);
}
.login-page__pill-title {
  font-size: 14px;
  font-weight: 500;
  color: #ffffff;
}
.login-page__pill-sub {
  font-style: normal;
  font-size: 12px;
  color: #aab5d5;
}
.login-page__footnote {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 10px 16px;
  border-radius: 999px;
  background: rgba(9, 21, 45, 0.194);
  width: fit-content;
  font-size: 12px;
  color: #b8c2e2;
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
  /* 行距 12px：与下方 1280+ 面板内距共同保证备案行落在 1280×768/1024×768 类常用视口内 */
  gap: 12px;
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
.login-page__input-wrap {
  position: relative;
  display: block;
}
.login-page__input-icon,
.login-page__input-action {
  position: absolute;
  top: 50%;
  z-index: 1;
  transform: translateY(-50%);
  color: #8996b0;
}
.login-page__input-icon {
  left: 14px;
}
.login-page__input-action {
  right: 14px;
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
.login-page__input-wrap > input {
  position: relative;
  z-index: 0;
  width: 100%;
  box-sizing: border-box;
  padding-left: 42px;
}
.login-page__input-wrap > input[type='password'],
.login-page__input-wrap > input.login-page__input-secret {
  padding-right: 42px;
}
.login-page__input-action--toggle {
  cursor: pointer;
  color: var(--sw-text-secondary);
}
.login-page__input-action--toggle:hover {
  color: var(--sw-color-primary);
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
.login-page__captcha-row > .login-page__input-wrap {
  flex: 1 1 0;
  min-width: 0;
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
  font-weight: 400;
  line-height: 18px;
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
.login-page__sso-tenant {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
  color: var(--sw-text-regular);
}
.login-page__sso-provider {
  display: inline-flex;
  flex: 1 1 0;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 34px;
  padding: 0 8px;
  border: 1px solid var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  color: var(--sw-text-regular);
  background: var(--sw-surface-card);
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
  cursor: pointer;
}
.login-page__sso-provider-mark {
  font-weight: 700;
  color: var(--sw-color-primary);
}
.login-page__sso-provider-mark {
  font-size: 0;
}
.login-page__sso-provider-mark::before {
  content: '◉';
  font-size: 15px;
}
.login-page__sso-provider.is-provider-1 .login-page__sso-provider-mark {
  color: #07c160;
}
.login-page__sso-provider.is-provider-2 .login-page__sso-provider-mark {
  color: #1677ff;
}
.login-page__sso-provider.is-provider-3 .login-page__sso-provider-mark {
  color: #3370ff;
}
.login-page__sso-provider:disabled {
  opacity: 0.6;
  cursor: not-allowed;
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
.login-page__sso-hint::before {
  content: '◉';
  margin-right: 6px;
  color: #00ad83;
}
.login-page__legal {
  margin: 0;
  color: var(--sw-text-secondary);
  font-size: 12px;
  text-align: center;
}
/* R015-01 备案链接：legal 行下方独立一行，窄屏不挤压表单 */
.login-page__icp {
  margin: -4px 0 0;
  color: var(--sw-text-secondary);
  font-size: 12px;
  text-align: center;
  text-decoration: none;
}
.login-page__icp:hover {
  color: var(--sw-color-primary);
  text-decoration: underline;
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
}

/* 原生登录控件与页面使用同一套字体。 */
.login-page input,
.login-page button {
  font-family: inherit;
}
/* 桌面参考 1920×1080；较小桌面保持流式列宽和完整登录能力。 */
.login-page__label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.login-page__tenant-toggle {
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--sw-color-primary);
  font: inherit;
  cursor: pointer;
}
.login-page__tenant-toggle:focus-visible {
  outline: 2px solid var(--sw-color-primary);
  outline-offset: 2px;
}
@media (min-width: 1280px) {
  .login-page {
    display: grid;
    grid-template-columns: 61.458333% minmax(0, 1fr);
  }
  .login-page__brand {
    position: relative;
    display: block;
    overflow: hidden;
    box-sizing: border-box;
    min-width: 0;
    padding: clamp(64px, 15.740741vh, 170px) clamp(40px, 4.375vw, 84px);
    background: url('@/assets/brand/login-background-020.svg') center / 100% 100% no-repeat;
  }
  .login-page__brand > * {
    position: relative;
  }
  .login-page__brand-head {
    gap: 24px;
  }
  .login-page__brand-logo {
    width: 84px;
    height: 88px;
    padding: 28px 27px;
    margin-top: -2px;
    margin-bottom: -2px;
    border-radius: 6px;
  }
  .login-page__brand-head strong {
    font-size: 38px;
    line-height: 48px;
    letter-spacing: 0;
  }
  .login-page__brand-head span {
    font-size: 16px;
    line-height: 24px;
    margin-top: 4px;
    font-weight: 500;
    color: var(--sw-nav-topbar-text);
  }
  .login-page__badge {
    display: block;
    margin-top: 28px;
    padding: 0;
    border: 0;
    border-radius: 0;
    background: transparent;
    font-size: 12px;
    line-height: 18px;
    color: var(--sw-nav-topbar-text);
  }
  .login-page__headline {
    max-width: 960px;
    margin: 28px 0 0;
    font-size: 42px;
    line-height: 60px;
    white-space: pre-line;
  }
  .login-page__brand-sub {
    max-width: 900px;
    margin-top: 28px;
    line-height: 22px;
    color: var(--sw-nav-topbar-text);
  }
  .login-page__pills {
    max-width: 896px;
    margin-top: 30px;
    gap: 16px;
  }
  .login-page__pills > span {
    box-sizing: border-box;
    min-height: 128px;
    padding: 20px 20px 18px;
    border: 0;
    border-radius: 12px;
    background: #27345c;
  }
  .login-page__pill {
    gap: 8px;
  }
  .login-page__pill-icon {
    height: 28px;
    font-size: 20px;
    font-weight: 700;
    line-height: 28px;
  }
  .login-page__pill-icon,
  .login-page__pill:nth-child(1) .login-page__pill-icon,
  .login-page__pill:nth-child(2) .login-page__pill-icon,
  .login-page__pill:nth-child(3) .login-page__pill-icon {
    color: var(--sw-nav-topbar-text);
  }
  .login-page__pill-title {
    font-size: 16px;
    line-height: 24px;
  }
  .login-page__pill-sub {
    font-size: 14px;
    line-height: 22px;
    color: var(--sw-nav-topbar-text);
  }
  .login-page__footnote {
    margin-top: 30px;
    padding: 0;
    background: transparent;
    line-height: 18px;
    color: var(--sw-nav-topbar-text);
  }
  .login-page__panel {
    box-sizing: border-box;
    padding: 40px 24px;
    background: #f4f6fb;
  }
  .login-page__form {
    position: relative;
    gap: 0;
    max-width: 500px;
    padding: 40px 38px 40px 40px;
    border-color: var(--sw-border-light);
    border-radius: 10px;
    box-shadow: 0 16px 48px rgba(20.4, 28.05, 53.55, 0.1);
  }
  .login-page__locale {
    flex: 0 0 155px;
    width: 155px;
  }
  .login-page__locale :deep(.el-select__wrapper) {
    min-height: 32px;
    padding: 0 12px;
    font-size: 14px;
  }
  .login-page__locale :deep(.el-select__selected-item) {
    font-size: 14px;
    line-height: 22px;
  }
  .login-page__top {
    min-height: 42px;
  }
  .login-page__welcome {
    font-size: 28px;
    line-height: 28px;
    color: var(--sw-text-primary);
    white-space: nowrap;
  }
  .login-page__welcome-sub {
    margin: 18px 0 0;
    font-size: 14px;
    line-height: 22px;
  }
  .login-page__form > label {
    margin-top: 18px;
    gap: 6px;
    line-height: 22px;
    color: var(--sw-text-regular);
    font-size: 14px;
  }
  .login-page__form input {
    height: 48px;
    border-color: var(--sw-border-light);
    border-radius: 6px;
    background: #fff;
  }
  .login-page__input-icon {
    display: none;
  }
  .login-page__input-wrap > input {
    padding-left: 12px;
  }
  .login-page__captcha-row {
    gap: 12px;
  }
  .login-page__captcha {
    box-sizing: border-box;
    width: 144px;
    min-width: 144px;
    height: 48px;
    border: 0;
    border-radius: 6px;
  }
  img.login-page__captcha {
    height: 48px;
    object-fit: contain;
  }
  .login-page__submit {
    margin-top: 18px;
    height: 48px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
  }
  .login-page__sso {
    margin-top: 18px;
    gap: 0;
  }
  .login-page__sso-title {
    /* 文字行盒 18px；上下各补 3px 保持表单总高与其余文字位置不变 */
    line-height: 18px;
    padding: 3px 0;
    text-align: center;
    gap: 12px;
    max-width: 324px;
  }
  .login-page__sso-rule,
  .login-page__sso-title::after {
    flex: 1;
    height: 1px;
    background: #e8edf7;
  }
  .login-page__sso-title::after {
    content: '';
  }
  .login-page__sso-tenant {
    margin-top: 18px;
    line-height: 22px;
    font-size: 14px;
  }
  .login-page__form label.login-page__sso-tenant {
    font-size: 14px;
    font-weight: 500;
    line-height: 22px;
    color: var(--sw-text-regular);
  }
  .login-page__sso-row {
    margin-top: 18px;
    gap: 8px;
  }
  .login-page__sso-row .login-page__sso-provider {
    flex: 1 1 0;
    height: 44px;
    font-size: 14px;
    font-weight: 500;
    line-height: 22px;
    border: 1px solid var(--sw-border-light);
    border-radius: 6px;
    background: #fff;
    color: var(--sw-text-regular);
  }
  /* 参考 32:2：第三个 SSO 文字中心比等分按钮中心左移 2px（仅文字对齐，不改外框） */
  .login-page__sso-row .login-page__sso-provider.is-provider-3 {
    padding-right: 16px;
  }
  .login-page__sso-provider-mark {
    display: none;
  }
  .login-page__legal {
    margin-top: 18px;
    line-height: 18px;
  }
  .login-page__icp {
    position: absolute;
    top: calc(100% + 14px);
    left: 0;
    right: 0;
    margin: 0;
    line-height: 18px;
  }
  .login-page__error {
    margin-top: 12px;
  }
}
</style>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/foundation/auth'
import type { LoginChallengeDTO } from '@/foundation/auth'
import { SSO_PROVIDERS, startSsoLoginAuthorize } from '@/foundation/auth/sso'
import type { SsoProvider } from '@/foundation/auth/sso'
import { useI18n } from '@/locales'
import { Lock, Share, Document, House, MagicStick, User, View } from '@element-plus/icons-vue'
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
      <p class="login-page__trustline">{{ t('login.brandFootnote') }}</p>
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
          账号
          <span class="login-page__input-wrap">
            <el-icon class="login-page__input-icon"><User /></el-icon>
            <input v-model="username" type="text" autocomplete="username" placeholder="请输入账号" required />
          </span>
        </label>
        <label>
          {{ t('common.password') }}
          <span class="login-page__input-wrap">
            <el-icon class="login-page__input-icon"><Lock /></el-icon>
            <input v-model="password" type="password" autocomplete="current-password" placeholder="请输入密码" required />
            <el-icon class="login-page__input-action"><View /></el-icon>
          </span>
        </label>
        <label>
          {{ t('auth.captcha') }}
          <div class="login-page__captcha-row">
            <span class="login-page__input-wrap">
              <el-icon class="login-page__input-icon"><Lock /></el-icon>
              <input v-model="captcha" type="text" autocomplete="off" :placeholder="t('auth.captcha')" required maxlength="8" />
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
          <!-- 既有 SSO 契约（方向 §4.4 / EV-06 口径）：租户 ID 输入只服务于 SSO 授权，账号登录无需填写 -->
          <label class="login-page__sso-tenant">
            <span>{{ t('auth.tenantId') }}</span>
            <span class="login-page__input-wrap">
              <el-icon class="login-page__input-icon"><House /></el-icon>
              <input
                v-model="ssoTenantId"
                type="number"
                min="0"
                autocomplete="organization"
                :placeholder="t('auth.tenantId')"
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
              @click="ssoProvider = provider.key; void onSsoLogin()"
            >
              <span class="login-page__sso-provider-mark" aria-hidden="true">{{ ['微', '飞', '钉'][index] }}</span>
              {{ ['微信', '飞书', '钉钉'][index] }}
            </button>
          </div>
          <p v-if="ssoError" class="login-page__error" role="alert">{{ ssoError }}</p>
        </div>
        <p class="login-page__sso-hint">{{ t('login.tenantSecurityNote') }}</p>
        <p class="login-page__legal">登录即表示同意《用户协议》与《隐私政策》</p>
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
    radial-gradient(circle 280px at 84.52% 10.74%, rgba(111, 45, 255, 0.42), transparent 100%),
    radial-gradient(circle 310px at 10.71% 90.82%, rgba(35, 199, 217, 0.26), transparent 100%),
    linear-gradient(111.75deg, #0c1533 0%, #25134e 52%, #102b4b 100%);
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
  color: #bfa7ff;
}
.login-page__pill-title {
  font-size: 14px;
  font-weight: 600;
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
.login-page__input-wrap > input[type='password'] {
  padding-right: 42px;
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
  font-size: 13px;
  font-weight: 500;
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
  color: var(--sw-text-primary);
  background: var(--sw-surface-card);
  font-size: 13px;
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

/* ── P53 设计（节点06）像素网格：≥1280px 视口按锁定坐标对齐（840/600 分栏、卡 80,92 440×840） ── */
@media (min-width: 1280px) {
  .login-page__brand {
    position: relative;
    display: block;
    flex: 0 0 840px;
    padding: 0;
  }
  /* 装饰：品牌区右上紫圆 / 左下青圆（设计稿色值） */
  .login-page__brand::before {
    content: '';
    position: absolute;
    top: -160px;
    right: -120px;
    width: 560px;
    height: 560px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(111, 45, 255, 0.5) 0%, rgba(111, 45, 255, 0) 70%);
  }
  .login-page__brand::after {
    content: '';
    position: absolute;
    bottom: -180px;
    left: -140px;
    width: 520px;
    height: 520px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(32, 184, 205, 0.18) 0%, rgba(32, 184, 205, 0) 70%);
  }
  .login-page__brand > * {
    position: relative;
  }
  /* 品牌区锁定坐标：head(112,96 徽标 78×82 白底 radius 10)、badge(254, 高 36)、
     headline(337, 34px)、sub(470)、pills(640, 3×194 高 117 radius 12)、foot(802, 高 34) */
  .login-page__brand-head {
    position: absolute;
    top: 112px;
    left: 96px;
    margin: 0;
    gap: 22px;
  }
  .login-page__brand-logo {
    box-sizing: border-box;
    width: 78px;
    height: 82px;
    padding: 13px;
    border-radius: 10px;
  }
  .login-page__brand-head strong {
    font-size: 30px;
    letter-spacing: 0.3px;
  }
  .login-page__brand-head span {
    margin-top: 4px;
    font-size: 14px;
  }
  .login-page__badge {
    position: absolute;
    top: 254px;
    left: 96px;
    box-sizing: border-box;
    height: 36px;
    padding: 8px 16px;
    letter-spacing: 1px;
    color: #dcd4ff;
  }
  .login-page__headline {
    position: absolute;
    top: 337px;
    left: 96px;
    margin: 0;
    letter-spacing: 0.2px;
  }
  .login-page__brand-sub {
    position: absolute;
    top: 470px;
    left: 96px;
  }
  .login-page__trustline {
    position: absolute;
    top: 570px;
    left: 96px;
    margin: 0;
    color: #99a6cb;
  }
  .login-page__pills {
    position: absolute;
    top: 640px;
    left: 96px;
    grid-template-columns: repeat(3, 194px);
    gap: 14px;
    max-width: none;
  }
  .login-page__pills > span {
    box-sizing: border-box;
    height: 117px;
    border-color: rgba(255, 255, 255, 0.02);
    border-radius: 12px;
    background: rgba(111, 45, 255, 0.058);
  }
  .login-page__pills > span:nth-child(2) {
    background: rgba(15, 175, 194, 0.058);
  }
  .login-page__pills > span:nth-child(3) {
    background: rgba(21, 168, 127, 0.058);
  }
  .login-page__pill {
    gap: 5px;
  }
  .login-page__pill-icon {
    color: #bfa7ff;
  }
  .login-page__footnote {
    position: absolute;
    top: 802px;
    left: 96px;
    box-sizing: border-box;
    height: 34px;
    margin: 0;
    padding: 9px 16px;
    color: #b8c2e2;
  }
  .login-page__footnote-dot {
    background: #3dd6a5;
  }
  .login-page__panel {
    display: block;
    position: relative;
    flex: 0 0 600px;
    padding: 0;
    background: #f5f7fc;
  }
  /* 表单卡：(80,92) 440×840 radius 22 border #e0e5ef shadow 0 16px 32px rgba(32,44,72,.12) */
  .login-page__form {
    position: absolute;
    top: 92px;
    left: 80px;
    width: 440px;
    height: 840px;
    max-width: none;
    margin: 0;
    padding: 40px;
    border-color: #e6e8f0;
    border-radius: 22px;
    box-shadow: 0 16px 32px rgba(32, 44, 72, 0.12);
  }
  .login-page__form::after {
    content: '';
    position: absolute;
    left: 281px;
    top: 403px;
    width: 108px;
    height: 1px;
    background: rgba(32, 174, 191, 0.423);
    transform: rotate(12deg);
    transform-origin: left center;
    pointer-events: none;
  }
  /* 语言切换保留功能：置于卡内右上角（安全徽章 top 42 之上留出间距） */
  .login-page__form .login-page__locale {
    display: none;
  }
  /* head(42)：welcome 28px + 安全徽章（底 #f0e8ff 字 #6f2dff radius 999）右对齐 */
  .login-page__top {
    position: absolute;
    top: 42px;
    left: 40px;
    right: 40px;
    justify-content: space-between;
  }
  .login-page__welcome {
    color: #182037;
  }
  .login-page__secure {
    padding: 8px 13px;
    background: #f0ecff;
    color: #6f2dff;
  }
  .login-page__welcome-sub {
    position: absolute;
    top: 91px;
    left: 40px;
    margin: 0;
    color: #7a849e;
  }
  /* 字段 label：账号 247 / 密码 345 / 验证码 444；输入 360×52 radius 9 border #d2dbea bg #fbfcff */
  .login-page__form > label {
    position: absolute;
    left: 40px;
    width: 360px;
    gap: 7px;
    color: #344164;
  }
  .login-page__form label input {
    height: 52px;
    padding: 0 14px;
    border-color: #dce1ec;
    border-radius: 9px;
    background: #fbfcff;
  }
  .login-page__form label input::placeholder {
    color: #9aa3b7;
  }
  /* 安全口径（方向 §4.4 / EV-06）：删除设计稿中的租户/记住/忘记三处未授权能力后，
     保留原 98px 字段节奏整体上移：账号 147 / 密码 245 / 验证码 343 */
  .login-page__form > label:nth-of-type(1) {
    top: 147px;
  }
  .login-page__form > label:nth-of-type(2) {
    top: 245px;
  }
  .login-page__form > label:nth-of-type(3) {
    top: 343px;
  }
  .login-page__captcha-row {
    gap: 10px;
  }
  .login-page__captcha-row input {
    flex: 1 1 0;
    min-width: 0;
  }
  .login-page__captcha {
    min-width: 128px;
    border-color: #d9d3f4;
    border-radius: 9px;
    background: #eef5ff;
  }
  img.login-page__captcha {
    height: 52px;
    width: 128px;
    min-width: 128px;
    object-fit: fill;
  }
  /* 提交(584) 360×52 底 #7132ff radius 9 */
  .login-page__submit {
    position: absolute;
    top: 480px;
    left: 40px;
    width: 360px;
    height: 52px;
    background: #7132ff;
    border-radius: 9px;
  }
  .login-page__submit:hover {
    background: color-mix(in srgb, #7132ff 85%, black);
  }
  /* 表单错误提示落在验证码（止于 420）与提交（480）之间，双行错误也不叠压 */
  .login-page__form > .login-page__error {
    position: absolute;
    top: 424px;
    left: 40px;
    width: 360px;
    margin: 0;
  }
  /* SSO 区块整体上移 104：分隔线(595)、SSO 租户输入、Provider 行；租户提示占安全说明位(546 居中) */
  .login-page__sso {
    position: absolute;
    top: 595px;
    left: 40px;
    width: 360px;
    margin: 0;
  }
  .login-page__sso-title {
    justify-content: center;
    line-height: 18px;
    color: #8a93a8;
  }
  .login-page__sso-title::after {
    content: '';
    flex: 1;
    height: 1px;
    background: #e1e5ee;
  }
  .login-page__sso-rule {
    background: #16a47a;
  }
  .login-page__sso-row select,
  .login-page__sso-row input {
    height: 52px;
    border-color: #dce1ec;
    border-radius: 9px;
    background: #ffffff;
    color: #354260;
  }
  .login-page__sso-row .login-page__sso-provider {
    flex: 1 1 0;
    height: 52px;
    padding: 0 8px;
    border-color: #ccd5e5 !important;
    border-radius: 9px;
    background: #ffffff;
    color: #303a55;
  }
  .login-page__sso-row input::placeholder {
    color: #9aa3b7;
  }
  .login-page__sso-row button {
    height: 52px;
    padding: 0 14px;
    border: 1px solid #dce1ec;
    border-radius: 9px;
    background: #ffffff;
    color: #354260;
  }
  .login-page__sso-row button:hover {
    background: var(--sw-fill-base);
  }
  .login-page__sso-hint {
    position: absolute;
    top: 546px;
    left: 40px;
    width: 360px;
    margin: 0;
    text-align: center;
    color: #7f8da8;
  }
  .login-page__legal {
    position: absolute;
    right: 40px;
    bottom: 16px;
    left: 40px;
  }
}
</style>

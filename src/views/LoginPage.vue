<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/foundation/auth'
import type { LoginChallengeDTO } from '@/foundation/auth'

const route = useRoute()
const router = useRouter()
const { fetchChallenge, login } = useAuth()

const username = ref('')
const password = ref('')
const captcha = ref('')
const challenge = ref<LoginChallengeDTO | null>(null)
const submitting = ref(false)
const errorMessage = ref('')

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
    errorMessage.value = '无法获取登录挑战，请检查网络'
  }
}

onMounted(() => {
  void reloadChallenge()
})

async function onSubmit(): Promise<void> {
  errorMessage.value = ''
  if (!challenge.value) {
    errorMessage.value = '登录挑战未就绪，请刷新验证码'
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
    errorMessage.value = error instanceof Error ? error.message : '登录失败'
    // 挑战是一次性的：无论失败原因，旧挑战已消费/作废，必须换新挑战再试
    password.value = ''
    await reloadChallenge()
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <div class="login-page">
    <form class="login-page__form" @submit.prevent="onSubmit">
      <h1>Smart-WorkFlow</h1>
      <label>
        用户名
        <input v-model="username" type="text" autocomplete="username" required />
      </label>
      <label>
        密码
        <input v-model="password" type="password" autocomplete="current-password" required />
      </label>
      <label>
        验证码
        <div class="login-page__captcha-row">
          <input v-model="captcha" type="text" autocomplete="off" required maxlength="8" />
          <img
            v-if="challenge"
            class="login-page__captcha"
            alt=""
            title="点击刷新验证码"
            :src="challenge.captchaImage"
            @click="reloadChallenge"
          />
          <span
            v-else
            class="login-page__captcha login-page__captcha--loading"
            @click="reloadChallenge"
          >
            刷新
          </span>
        </div>
      </label>
      <p v-if="errorMessage" class="login-page__error">{{ errorMessage }}</p>
      <button type="submit" :disabled="submitting || !challenge">
        {{ submitting ? '登录中...' : '登录' }}
      </button>
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
</style>

<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '@/foundation/auth'

const route = useRoute()
const router = useRouter()
const { login } = useAuth()

const username = ref('')
const password = ref('')
const submitting = ref(false)
const errorMessage = ref('')

function safeRedirect(raw: unknown): string {
  return typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
}

async function onSubmit(): Promise<void> {
  errorMessage.value = ''
  submitting.value = true
  try {
    await login({ username: username.value, password: password.value })
    await router.push(safeRedirect(route.query.redirect))
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '登录失败'
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
      <p v-if="errorMessage" class="login-page__error">{{ errorMessage }}</p>
      <button type="submit" :disabled="submitting">{{ submitting ? '登录中...' : '登录' }}</button>
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
.login-page__error {
  color: #d33;
  font-size: 13px;
  margin: 0;
}
</style>

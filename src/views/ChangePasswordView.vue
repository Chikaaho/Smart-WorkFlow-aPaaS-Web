<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { changePassword } from '@/foundation/auth'
import { setMustChangePassword } from '@/foundation/auth/token'
import { useI18n } from '@/locales'

/**
 * 首登强制改密页（1.0.0 F1-4）：改密闭环外的业务接口由服务端 403 拦截，
 * 路由由守卫收敛至此。改密成功即解除标记、原地继续使用当前会话。
 */
const { t } = useI18n()
const router = useRouter()
const form = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })
const submitting = ref(false)
const error = ref('')

async function submit() {
  if (submitting.value) return
  if (!form.oldPassword) {
    error.value = t('auth.oldPasswordRequired')
    return
  }
  if (form.newPassword.length < 8) {
    error.value = t('auth.newPasswordLength')
    return
  }
  if (form.newPassword === form.oldPassword) {
    error.value = '新密码不能与当前密码相同'
    return
  }
  if (form.newPassword !== form.confirmPassword) {
    error.value = t('auth.passwordMismatch')
    return
  }

  submitting.value = true
  error.value = ''
  try {
    await changePassword({
      oldPassword: form.oldPassword,
      newPassword: form.newPassword,
    })
    setMustChangePassword(false)
    ElMessage.success(t('auth.passwordChanged'))
    void router.push('/workspace')
  } catch (err) {
    error.value = err instanceof ApiError ? err.msg : t('auth.passwordChangeFailed')
  } finally {
    submitting.value = false
  }
}

async function leave() {
  // 不改密只能登出离开（服务端已拦截其余业务接口）
  await import('@/foundation/auth').then((mod) => mod.logout())
  void router.push('/login')
}
</script>

<template>
  <div class="change-password-page">
    <div class="change-password-card">
      <h1 class="title">修改密码</h1>
      <p class="hint">
        首次登录请先设置新密码（至少 8 位，且不能与当前密码相同），修改后即可正常使用系统。
      </p>
      <el-form label-position="top" @submit.prevent="submit">
        <el-form-item label="当前密码" required>
          <el-input
            v-model="form.oldPassword"
            type="password"
            autocomplete="current-password"
            show-password
          />
        </el-form-item>
        <el-form-item label="新密码" required>
          <el-input
            v-model="form.newPassword"
            type="password"
            autocomplete="new-password"
            show-password
          />
        </el-form-item>
        <el-form-item label="确认新密码" required>
          <el-input
            v-model="form.confirmPassword"
            type="password"
            autocomplete="new-password"
            show-password
            @keyup.enter="submit"
          />
        </el-form-item>
      </el-form>
      <div v-if="error" class="error" role="alert">{{ error }}</div>
      <div class="actions">
        <el-button @click="leave">退出登录</el-button>
        <el-button type="primary" :loading="submitting" @click="submit">确认修改</el-button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.change-password-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #f5f7fa;
}
.change-password-card {
  width: 440px;
  background: #fff;
  border-radius: 8px;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.12);
  padding: 32px;
}
.title {
  margin: 0 0 8px;
  font-size: 20px;
  font-weight: 600;
}
.hint {
  margin: 0 0 18px;
  font-size: 13px;
  color: #909399;
  line-height: 1.6;
}
.error {
  margin: 4px 0 10px;
  font-size: 13px;
  color: #f56c6c;
}
.actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
</style>

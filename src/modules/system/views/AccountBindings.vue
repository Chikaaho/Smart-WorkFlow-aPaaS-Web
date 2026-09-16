<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
import { onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
import {
  fetchSsoBindings,
  unbindSso,
  SSO_PROVIDERS,
  type SsoBindingItem,
} from '@/foundation/auth/sso'

/**
 * 账号绑定管理页（I5）：展示当前账号在三个 Provider 的有效绑定（摘要前 8 位），
 * 支持解绑；绑定动作经各 Provider 授权发起（服务端 URL）完成。
 */
const bindings = ref<SsoBindingItem[]>([])
const loading = ref(false)
const unbinding = ref('')

async function reload(): Promise<void> {
  loading.value = true
  try {
    const data = await fetchSsoBindings()
    bindings.value = data.bindings
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('system.bindingLoadFailed'))
  } finally {
    loading.value = false
  }
}

function boundOf(provider: string): SsoBindingItem | undefined {
  return bindings.value.find((b) => b.provider === provider)
}

async function onUnbind(provider: string): Promise<void> {
  unbinding.value = provider
  try {
    await unbindSso(provider as never)
    ElMessage.success(t('system.unbound'))
    await reload()
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('system.unbindFailed'))
  } finally {
    unbinding.value = ''
  }
}

async function onStartBind(provider: string): Promise<void> {
  try {
    const { request } = await import('@/foundation/request')
    const data = await request<{ authorizeUrl: string }>({
      method: 'GET',
      url: `/auth/sso/${provider}/authorize`,
      params: { redirect: '/account/bindings' },
    })
    // 服务端授权发起：整页跳转到 Provider 授权页（服务端回调后回跳）
    globalThis.location.href = data.authorizeUrl
  } catch (error) {
    ElMessage.error(error instanceof Error ? error.message : t('system.authorizeFailed'))
  }
}

onMounted(() => {
  void reload()
})
</script>

<template>
  <div class="account-bindings">
    <h2>{{ t('auth.accountBindings') }}</h2>
    <p class="desc">{{ t('auth.ssoBindingNote') }}</p>
    <div v-loading="loading" class="provider-list">
      <div v-for="p in SSO_PROVIDERS" :key="p.key" class="provider-row">
        <div class="provider-name">{{ p.label }}</div>
        <div class="provider-state">
          <template v-if="boundOf(p.key)">
            <span class="bound-tag">{{ t('system.bound') }}</span>
            <span class="digest">{{
              t('auth.digestPrefixLabel', { digest: boundOf(p.key)!.externalDigestPrefix })
            }}</span>
          </template>
          <template v-else>
            <span class="unbound-tag">{{ t('system.notBound') }}</span>
          </template>
        </div>
        <div class="provider-actions">
          <button
            v-if="boundOf(p.key)"
            class="btn btn--danger"
            :disabled="unbinding === p.key"
            @click="onUnbind(p.key)"
          >
            {{ unbinding === p.key ? t('system.unbinding') : t('system.unbind') }}
          </button>
          <button v-else class="btn" @click="onStartBind(p.key)">
            {{ t('workflow.binding') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.account-bindings {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px;
}
h2 {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
  margin: 0 0 8px;
}
.desc {
  font-size: 13px;
  color: #909399;
  margin: 0 0 20px;
}
.provider-list {
  background: #fff;
  border-radius: 6px;
  box-shadow: 0 1px 8px rgba(0, 0, 0, 0.04);
}
.provider-row {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 16px 24px;
  border-bottom: 1px solid #ebeef5;
}
.provider-row:last-child {
  border-bottom: none;
}
.provider-name {
  width: 96px;
  font-size: 14px;
  font-weight: 500;
  color: #303133;
}
.provider-state {
  flex: 1;
  font-size: 13px;
  color: #606266;
}
.bound-tag {
  color: #67c23a;
  margin-right: 8px;
}
.unbound-tag {
  color: #909399;
}
.digest {
  color: #909399;
  font-size: 12px;
}
.btn {
  border: 1px solid #7e306b;
  color: #7e306b;
  background: #fff;
  border-radius: 4px;
  padding: 6px 16px;
  font-size: 13px;
  cursor: pointer;
}
.btn--danger {
  border-color: #f56c6c;
  color: #f56c6c;
}
.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>

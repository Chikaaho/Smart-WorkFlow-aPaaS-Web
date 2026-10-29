<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import {
  fetchSsoBindings,
  unbindSso,
  SSO_PROVIDERS,
  type SsoBindingItem,
} from '@/foundation/auth/sso'

/**
 * 账号绑定浮层（I5 / 273:1563）：920×390 居中浮层展示当前账号三个 Provider 的绑定状态，
 * 支持解绑；绑定动作经各 Provider 授权发起（服务端 URL）完成。关闭回退来源页。
 */
const router = useRouter()
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

/** 关闭浮层：回退来源页；直达进入时回工作台（旧路由保持兼容可再进）。 */
function close(): void {
  if (globalThis.history.length > 1) router.back()
  else void router.replace('/workspace')
}

onMounted(() => {
  void reload()
})
</script>

<template>
  <el-dialog
    :model-value="true"
    class="account-bindings-dialog"
    align-center
    width="920px"
    :close-on-click-modal="false"
    :show-close="true"
    @update:model-value="close"
  >
    <template #header>
      <h2 class="account-bindings-dialog__title">{{ t('auth.accountBindings') }}</h2>
    </template>

    <div v-loading="loading" class="provider-list">
      <div v-for="p in SSO_PROVIDERS" :key="p.key" class="provider-row">
        <span class="provider-name">{{ p.label }}</span>
        <span class="provider-state">
          <template v-if="boundOf(p.key)">
            <span class="bound-tag">{{ t('system.bound') }}</span>
            <span class="digest">{{
              t('auth.digestPrefixLabel', { digest: boundOf(p.key)!.externalDigestPrefix })
            }}</span>
          </template>
          <template v-else>
            <span class="unbound-tag">{{ t('system.notBound') }}</span>
          </template>
        </span>
        <span class="provider-actions">
          <el-button
            v-if="boundOf(p.key)"
            class="provider-btn provider-btn--danger"
            :disabled="unbinding === p.key"
            @click="onUnbind(p.key)"
          >
            {{ unbinding === p.key ? t('system.unbinding') : t('system.unbind') }}
          </el-button>
          <el-button v-else class="provider-btn" @click="onStartBind(p.key)">
            {{ t('workflow.binding') }}
          </el-button>
        </span>
      </div>
    </div>

    <template #footer>
      <el-button class="account-bindings-dialog__close" @click="close">
        {{ t('common.close') }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.account-bindings-dialog__title {
  margin: 0;
  color: var(--sw-text-primary);
  font-size: 16px;
  font-weight: 600;
}
.provider-row {
  display: flex;
  align-items: center;
  height: 66px;
  margin-bottom: 18px;
  padding: 0;
}
.provider-name {
  font-size: 14px;
  font-weight: 500;
  line-height: 22px;
  color: var(--sw-text-primary);
}
.provider-state {
  flex: 1;
  text-align: right;
  font-size: 12px;
  line-height: 20px;
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
}
.provider-actions {
  display: inline-flex;
  margin-left: 16px;
}
</style>

<style>
/* 273:1563：920×390@(500,345)，右上关闭、右下关闭。 */
.account-bindings-dialog.el-dialog {
  box-sizing: border-box;
  display: flex;
  height: 390px;
  flex-direction: column;
  padding: 0;
  border: 1px solid var(--sw-border-light);
  border-radius: 8px;
}
.account-bindings-dialog .el-dialog__header {
  box-sizing: border-box;
  margin: 0;
  padding: 28px 25px 0;
}
.account-bindings-dialog .el-dialog__title,
.account-bindings-dialog__title {
  color: var(--sw-text-primary);
  font-size: 16px;
  font-weight: 600;
  line-height: 24px;
}
.account-bindings-dialog .el-dialog__headerbtn {
  top: 25px;
  right: 25px;
  width: 32px;
  height: 32px;
}
.account-bindings-dialog .el-dialog__body {
  flex: 1 1 auto;
  min-height: 0;
  /* 273:1563（执行提示14）：三行内容组下移 19px——绑定按钮顶 438/522/606；标题/页脚不动 */
  padding: 23px 25px 0;
}
.account-bindings-dialog .el-dialog__footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin: 0;
  padding: 37px 25px 27px;
}
.account-bindings-dialog .el-dialog__footer .el-button {
  width: 80px;
  height: 32px;
  margin: 0;
}
.account-bindings-dialog .provider-btn {
  width: 72px;
  height: 32px;
  margin: 0;
}
</style>

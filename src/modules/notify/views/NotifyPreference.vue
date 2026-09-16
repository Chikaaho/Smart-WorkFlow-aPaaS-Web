<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * NotifyPreference — 订阅偏好页（I6）。
 * 普通用户只能在允许范围内调整可选外部渠道/非强制事件；必须送达项由服务端拒绝关闭。
 */
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { StandardListTemplate } from '@/components/page-layout'
import { ApiError } from '@/foundation/request'
import { getNotifySubscription, saveNotifySubscription } from '@/modules/notify/api'
import type { NotifySubscriptionItem } from '@/contracts/notify'

const items = ref<NotifySubscriptionItem[]>([])
const loading = ref(false)
const saving = ref(false)
const errorMsg = ref('')

async function loadPreferences() {
  loading.value = true
  errorMsg.value = ''
  try {
    items.value = await getNotifySubscription()
  } catch (err) {
    if (err instanceof ApiError) errorMsg.value = err.msg
    else errorMsg.value = t('notify.preferencesLoadFailed')
    ElMessage.error(errorMsg.value)
  } finally {
    loading.value = false
  }
}

async function handleSave() {
  saving.value = true
  try {
    await saveNotifySubscription(
      items.value.map((i) => ({ eventType: i.eventType, channel: i.channel, enabled: i.enabled })),
    )
    ElMessage.success(t('notify.preferencesSaved'))
    await loadPreferences()
  } catch (err) {
    if (err instanceof ApiError) ElMessage.error(err.msg)
    else ElMessage.error(t('common.saveFailed'))
  } finally {
    saving.value = false
  }
}

onMounted(loadPreferences)
</script>

<template>
  <StandardListTemplate
    :title="t('notify.subscriptionPreferences')"
    :total="items.length"
    :page-num="1"
    :page-size="50"
    :empty="items.length === 0 && !loading"
  >
    <template #page-action>
      <el-button type="primary" :loading="saving" @click="handleSave">{{
        t('notify.savePreferences')
      }}</el-button>
    </template>
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />
    <el-table v-loading="loading" :data="items" stripe style="width: 100%">
      <el-table-column prop="eventType" :label="t('common.event')" min-width="180" />
      <el-table-column prop="channel" :label="t('common.channel')" width="140" />
      <el-table-column :label="t('notify.receiveNotification')" width="120">
        <template #default="{ row }">
          <el-switch v-model="row.enabled" />
        </template>
      </el-table-column>
    </el-table>
    <el-alert
      :title="t('notify.preferencesHint')"
      type="info"
      :closable="false"
      show-icon
      style="margin-top: 12px"
    />
  </StandardListTemplate>
</template>

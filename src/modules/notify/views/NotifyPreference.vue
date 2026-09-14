<script setup lang="ts">
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
    else errorMsg.value = '加载订阅偏好失败'
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
    ElMessage.success('订阅偏好已保存')
    await loadPreferences()
  } catch (err) {
    if (err instanceof ApiError) ElMessage.error(err.msg)
    else ElMessage.error('保存失败')
  } finally {
    saving.value = false
  }
}

onMounted(loadPreferences)
</script>

<template>
  <StandardListTemplate
    title="订阅偏好"
    :total="items.length"
    :page-num="1"
    :page-size="50"
    :empty="items.length === 0 && !loading"
  >
    <template #page-action>
      <el-button type="primary" :loading="saving" @click="handleSave">保存偏好</el-button>
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
      <el-table-column prop="eventType" label="事件" min-width="180" />
      <el-table-column prop="channel" label="渠道" width="140" />
      <el-table-column label="接收该通知" width="120">
        <template #default="{ row }">
          <el-switch v-model="row.enabled" />
        </template>
      </el-table-column>
    </el-table>
    <el-alert
      title="订阅变化只影响之后的投递，不改变已产生的通知；必须送达的待办与安全/状态通知（站内信）不可关闭。"
      type="info"
      :closable="false"
      show-icon
      style="margin-top: 12px"
    />
  </StandardListTemplate>
</template>

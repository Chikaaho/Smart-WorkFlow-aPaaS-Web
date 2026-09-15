<script setup lang="ts">
/**
 * NotifyChannelList — 渠道配置页（I6）。
 * 渠道启停（租户级）；启用前由服务端完成装配/配置完整性判定，缺失配置启用会被拒绝。
 */
import { ref, onMounted } from 'vue'
import { ElMessage } from 'element-plus'
import { StandardListTemplate } from '@/components/page-layout'
import { ApiError } from '@/foundation/request'
import { listNotifyChannels, updateNotifyChannel } from '@/modules/notify/api'
import type { NotifyChannelStatus } from '@/contracts/notify'

const list = ref<NotifyChannelStatus[]>([])
const loading = ref(false)
const errorMsg = ref('')

const CHANNEL_LABEL: Record<string, string> = {
  IN_APP: '站内信',
  SMS: '短信',
  EMAIL: '邮件',
  FEISHU: '飞书卡片',
  DINGTALK: '钉钉通知',
  WECHAT_WORK: '企业微信卡片',
}

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    list.value = await listNotifyChannels()
  } catch (err) {
    if (err instanceof ApiError) errorMsg.value = err.msg
    else errorMsg.value = '加载渠道状态失败'
    ElMessage.error(errorMsg.value)
  } finally {
    loading.value = false
  }
}

const savingChannel = ref<string | null>(null)

async function handleToggle(row: NotifyChannelStatus, enabled: boolean) {
  savingChannel.value = row.channel
  try {
    await updateNotifyChannel(row.channel, {
      tenantEnabled: enabled,
      senderDisplay: row.senderDisplay ?? undefined,
      configSummary: row.configSummary ?? undefined,
    })
    ElMessage.success(enabled ? '渠道已启用' : '渠道已停用')
    await loadList()
  } catch (err) {
    if (err instanceof ApiError) ElMessage.error(err.msg)
    else ElMessage.error('操作失败')
    await loadList()
  } finally {
    savingChannel.value = null
  }
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    title="渠道配置"
    :total="list.length"
    :page-num="1"
    :page-size="50"
    :empty="list.length === 0 && !loading"
  >
    <template #page-action><span /></template>
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />
    <el-table v-loading="loading" :data="list" stripe style="width: 100%">
      <el-table-column label="渠道" width="160">
        <template #default="{ row }">
          {{ CHANNEL_LABEL[row.channel] ?? row.channel }}（{{ row.channel }}）
        </template>
      </el-table-column>
      <el-table-column label="系统级装配" width="120">
        <template #default="{ row }">
          <el-tag
            :type="row.systemConfigured ? 'success' : 'danger'"
            size="small"
            disable-transitions
          >
            {{ row.systemConfigured ? '已装配' : '未装配' }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="senderDisplay" label="发件标识" min-width="140" />
      <el-table-column prop="configSummary" label="配置摘要" min-width="180" />
      <el-table-column label="租户级启用" width="140">
        <template #default="{ row }">
          <el-switch
            v-if="row.channel !== 'IN_APP'"
            :model-value="row.tenantEnabled"
            :loading="savingChannel === row.channel"
            @update:model-value="
              (v: unknown) => handleToggle(row as NotifyChannelStatus, v === true)
            "
          />
          <el-tag v-else type="success" size="small" disable-transitions>恒启用</el-tag>
        </template>
      </el-table-column>
    </el-table>
  </StandardListTemplate>
</template>

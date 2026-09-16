<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
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
  get IN_APP() {
    return t('notify.channelInApp')
  },
  get SMS() {
    return t('notify.channelSms')
  },
  get EMAIL() {
    return t('notify.channelEmail')
  },
  get FEISHU() {
    return t('notify.channelFeishu')
  },
  get DINGTALK() {
    return t('notify.channelDingtalk')
  },
  get WECHAT_WORK() {
    return t('notify.channelWechatWork')
  },
}

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    list.value = await listNotifyChannels()
  } catch (err) {
    if (err instanceof ApiError) errorMsg.value = err.msg
    else errorMsg.value = t('notify.channelStatusLoadFailed')
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
    ElMessage.success(enabled ? t('notify.channelEnabled') : t('notify.channelDisabled'))
    await loadList()
  } catch (err) {
    if (err instanceof ApiError) ElMessage.error(err.msg)
    else ElMessage.error(t('common.operationFailed'))
    await loadList()
  } finally {
    savingChannel.value = null
  }
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    :title="t('notify.channelConfig')"
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
      <el-table-column :label="t('common.channel')" width="160">
        <template #default="{ row }">
          {{ CHANNEL_LABEL[row.channel] ?? row.channel }}（{{ row.channel }}）
        </template>
      </el-table-column>
      <el-table-column :label="t('notify.systemConfigured')" width="120">
        <template #default="{ row }">
          <el-tag
            :type="row.systemConfigured ? 'success' : 'danger'"
            size="small"
            disable-transitions
          >
            {{ row.systemConfigured ? t('notify.configured') : t('notify.notConfigured') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="senderDisplay" :label="t('notify.senderDisplay')" min-width="140" />
      <el-table-column prop="configSummary" :label="t('notify.configSummary')" min-width="180" />
      <el-table-column :label="t('notify.tenantEnabled')" width="140">
        <template #default="{ row }">
          <el-switch
            v-if="row.channel !== 'IN_APP'"
            :model-value="row.tenantEnabled"
            :loading="savingChannel === row.channel"
            @update:model-value="
              (v: unknown) => handleToggle(row as NotifyChannelStatus, v === true)
            "
          />
          <el-tag v-else type="success" size="small" disable-transitions>{{
            t('notify.alwaysEnabled')
          }}</el-tag>
        </template>
      </el-table-column>
    </el-table>
  </StandardListTemplate>
</template>

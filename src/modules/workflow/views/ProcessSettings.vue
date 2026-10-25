<script setup lang="ts">
/**
 * 流程设置（50:88）：结束通知对象/渠道/其他接收人，保存进 ProcessGraph.notification，
 * 随流程定义发布冻结；旧定义缺省保持原通知行为。
 */
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ArrowLeft } from '@element-plus/icons-vue'
import { useI18n } from '@/locales'
import UserRemoteSelect from '@/components/UserRemoteSelect.vue'
import {
  getProcessDefDefinition,
  saveProcessDefGraph,
  type ProcessGraphPayload,
} from '@/modules/workflow/api'

const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const defId = computed(() => String(route.params.defId ?? ''))
const activeTab = ref<'notify' | 'listeners'>('notify')
const loading = ref(false)
const saving = ref(false)
const graph = ref<ProcessGraphPayload | null>(null)
const legacy = ref(true)
const form = reactive({
  initiator: true,
  approvers: false,
  channels: ['IN_APP'] as string[],
  otherRecipientIds: [] as string[],
})

const listeners = computed(() =>
  (graph.value?.triggers ?? []).map((trigger) => ({
    id: trigger.triggerId,
    name: trigger.name || trigger.triggerId,
    event: trigger.event,
    enabled: trigger.enabled !== false,
  })),
)

function errorText(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) return error.message
  return fallback
}

async function load(): Promise<void> {
  loading.value = true
  try {
    const payload = await getProcessDefDefinition(defId.value)
    graph.value = payload
    const notification = payload.notification
    legacy.value = !notification
    if (notification) {
      form.initiator = notification.initiator === true
      form.approvers = notification.approvers === true
      form.channels =
        notification.channels && notification.channels.length > 0
          ? [...notification.channels]
          : ['IN_APP']
      form.otherRecipientIds = (notification.otherRecipientIds ?? []).map(String)
    }
  } catch (error) {
    ElMessage.error(errorText(error, t('workflow.processSettingsLoadFailed')))
  } finally {
    loading.value = false
  }
}

async function save(): Promise<void> {
  if (!graph.value) return
  if (!form.initiator && !form.approvers && form.otherRecipientIds.length === 0) {
    ElMessage.warning(t('workflow.processSettingsNoTarget'))
    return
  }
  if (form.channels.length === 0) {
    ElMessage.warning(t('workflow.processSettingsNoChannel'))
    return
  }
  const otherRecipientIds = form.otherRecipientIds
    .map((id) => Number(id))
    .filter((id) => Number.isFinite(id) && id > 0)
  saving.value = true
  try {
    const payload: ProcessGraphPayload = {
      ...graph.value,
      notification: {
        initiator: form.initiator,
        approvers: form.approvers,
        channels: [...form.channels],
        otherRecipientIds,
      },
    }
    await saveProcessDefGraph(defId.value, payload)
    graph.value = payload
    legacy.value = false
    ElMessage.success(t('workflow.processSettingsSaved'))
  } catch (error) {
    ElMessage.error(errorText(error, t('workflow.processSettingsSaveFailed')))
  } finally {
    saving.value = false
  }
}

function backToDesigner(): void {
  void router.push(`/workflow/defs/${defId.value}/design`)
}

onMounted(load)
</script>

<template>
  <div v-loading="loading" class="ps-page">
    <header class="ps-header">
      <button type="button" class="ps-back" @click="backToDesigner">
        <el-icon :size="16"><ArrowLeft /></el-icon>
        <span>{{ t('common.back') }}</span>
      </button>
      <h1>{{ t('workflow.processSettings') }}</h1>
      <el-button type="primary" :loading="saving" @click="save">
        {{ t('common.save') }}
      </el-button>
    </header>

    <div class="ps-body">
      <aside class="ps-nav">
        <button
          type="button"
          class="ps-nav__item"
          :class="{ 'is-active': activeTab === 'notify' }"
          @click="activeTab = 'notify'"
        >
          {{ t('workflow.processSettingsNotify') }}
        </button>
        <button
          type="button"
          class="ps-nav__item"
          :class="{ 'is-active': activeTab === 'listeners' }"
          @click="activeTab = 'listeners'"
        >
          {{ t('workflow.processSettingsListeners') }}
        </button>
      </aside>

      <section v-if="activeTab === 'notify'" class="ps-card">
        <h2>{{ t('workflow.processSettingsNotify') }}</h2>
        <p v-if="legacy" class="ps-hint">{{ t('workflow.processSettingsLegacyHint') }}</p>

        <div class="ps-field">
          <span class="ps-label">{{ t('workflow.processSettingsEndEvent') }}</span>
          <div class="ps-checkrow">
            <el-checkbox v-model="form.initiator">
              {{ t('workflow.processSettingsInitiator') }}
            </el-checkbox>
            <el-checkbox v-model="form.approvers">
              {{ t('workflow.processSettingsApprovers') }}
            </el-checkbox>
          </div>
        </div>

        <div class="ps-field">
          <span class="ps-label">{{ t('workflow.processSettingsChannels') }}</span>
          <div class="ps-checkrow">
            <el-checkbox-group v-model="form.channels">
              <el-checkbox label="IN_APP">{{
                t('workflow.processSettingsChannelInApp')
              }}</el-checkbox>
              <el-checkbox label="EMAIL">{{
                t('workflow.processSettingsChannelEmail')
              }}</el-checkbox>
            </el-checkbox-group>
          </div>
          <p class="ps-hint">{{ t('workflow.processSettingsEmailHint') }}</p>
        </div>

        <div class="ps-field">
          <span class="ps-label">{{ t('workflow.processSettingsOtherRecipients') }}</span>
          <UserRemoteSelect
            v-model="form.otherRecipientIds"
            multiple
            :placeholder="t('workflow.processSettingsOtherPlaceholder')"
          />
        </div>
      </section>

      <section v-else class="ps-card">
        <h2>{{ t('workflow.processSettingsListeners') }}</h2>
        <p class="ps-hint">{{ t('workflow.processSettingsListenersHint') }}</p>
        <p v-if="listeners.length === 0" class="ps-empty">
          {{ t('workflow.processSettingsNoListeners') }}
        </p>
        <ul v-else class="ps-listeners">
          <li v-for="listener in listeners" :key="listener.id">
            <strong>{{ listener.name }}</strong>
            <span>{{ listener.event }}</span>
            <span>{{ listener.enabled ? '启用' : '停用' }}</span>
          </li>
        </ul>
        <el-button @click="backToDesigner">{{
          t('workflow.processSettingsOpenDesigner')
        }}</el-button>
      </section>
    </div>
  </div>
</template>

<style scoped>
.ps-page {
  box-sizing: border-box;
  min-height: 100%;
  padding: 20px 20px 32px;
  background: var(--sw-surface-page);
  color: var(--sw-text-primary);
}
.ps-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 18px;
}
.ps-header h1 {
  flex: 1;
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.ps-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--sw-color-primary);
  font-size: 14px;
  cursor: pointer;
}
.ps-body {
  display: flex;
  align-items: flex-start;
  gap: 36px;
}
.ps-nav {
  box-sizing: border-box;
  display: flex;
  flex: 0 0 188px;
  flex-direction: column;
  gap: 4px;
  padding: 8px;
  border-radius: var(--sw-radius-card, 10px);
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
}
.ps-nav__item {
  height: 38px;
  padding: 0 16px;
  border: 0;
  border-radius: var(--sw-radius-base);
  background: transparent;
  color: var(--sw-text-primary);
  font-size: 14px;
  text-align: left;
  cursor: pointer;
}
.ps-nav__item.is-active {
  background: var(--sw-color-primary);
  color: #fff;
  font-weight: 500;
}
.ps-card {
  box-sizing: border-box;
  flex: 1;
  min-width: 0;
  max-width: 1158px;
  padding: 24px;
  border-radius: var(--sw-radius-card, 10px);
  background: var(--sw-surface-card);
  border: 1px solid var(--sw-border-light);
}
.ps-card h2 {
  margin: 0 0 20px;
  font-size: 16px;
  font-weight: 600;
}
.ps-field {
  margin-bottom: 24px;
}
.ps-label {
  display: block;
  margin-bottom: 10px;
  font-size: 14px;
  color: var(--sw-text-secondary);
}
.ps-checkrow {
  display: flex;
  align-items: center;
  gap: 28px;
  min-height: 32px;
}
.ps-hint {
  margin: 8px 0 0;
  color: var(--sw-text-tertiary, var(--sw-text-secondary));
  font-size: 12px;
  line-height: 18px;
}
.ps-empty {
  margin: 18px 0;
  color: var(--sw-text-secondary);
  font-size: 13px;
}
.ps-listeners {
  margin: 12px 0 20px;
  padding: 0;
  list-style: none;
}
.ps-listeners li {
  display: grid;
  grid-template-columns: 1fr 160px 60px;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid var(--sw-border-light);
  font-size: 13px;
}
.ps-listeners li span {
  color: var(--sw-text-secondary);
}
</style>

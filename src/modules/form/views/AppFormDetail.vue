<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { StandardListTemplate } from '@/components/page-layout'
import AppIcon from '@/modules/form/components/AppIcon.vue'
import { getFormAppContent } from '@/modules/form/api/app-center'
import { getFormDefById } from '@/modules/form/api/form-def'
import { pageProcessDefs } from '@/adapters/process-catalog'
import type { FormApp } from '@/contracts/app-center'
import type { ProcessDef } from '@/contracts/bpm'
import { useI18n } from '@/locales'
import { getErrorMessage } from '@/foundation/request/error-code-map'

/**
 * 表单管理上下文（应用内）：
 * 提供「表单设计」「流程设计」入口（进入设计器定位当前表单及其关联流程，保存后返回本上下文），
 * 并列出该表单的关联流程与数据列表入口。
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()

const appId = computed(() => String(route.params.appId ?? ''))
const formId = computed(() => String(route.params.formId ?? ''))

const app = ref<FormApp | null>(null)
const appName = ref('')
const dirName = ref('')
const formName = ref('')
const formKey = ref('')
const formStatus = ref('DRAFT')
const formVersion = ref<number | null>(null)

const processes = ref<ProcessDef[]>([])
const loading = ref(false)
const errorMsg = ref('')

const isEmpty = computed(() => !loading.value && !errorMsg.value && processes.value.length === 0)

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const def = await getFormDefById(formId.value)
    formName.value = def.name ?? ''
    formKey.value = def.formKey
    formStatus.value = def.status
    formVersion.value = def.formVersion ?? null

    if (appId.value) {
      try {
        const content = await getFormAppContent(appId.value)
        app.value = content.app
        appName.value = content.app.name
        const dir = content.dirs.find((d) => (d.forms ?? []).some((f) => f.formId === formId.value))
        dirName.value = dir?.name ?? ''
      } catch {
        app.value = null
      }
    }
    try {
      const page = await pageProcessDefs({ pageNum: 1, pageSize: 50 }, def.formKey)
      processes.value = page.list
    } catch {
      processes.value = []
    }
  } catch (err: unknown) {
    const errObj = err as { code?: number; message?: string }
    errorMsg.value = getErrorMessage(errObj.code ?? 0, errObj.message)
  } finally {
    loading.value = false
  }
}

// ==================== 入口 ====================

function enterFormDesign() {
  void router.push({
    path: `/form/designer/${formId.value}`,
    query: { from: 'app-form', appId: appId.value },
  })
}

function enterProcessDesign() {
  void router.push({
    path: `/form/designer/${formId.value}`,
    query: { tab: 'processes', from: 'app-form', appId: appId.value },
  })
}

function enterFormData() {
  void router.push({
    path: `/form/form-data/${formKey.value}`,
    query: { from: 'app-form', appId: appId.value },
  })
}

function enterProcessDesigner(r: unknown) {
  const def = r as ProcessDef
  void router.push(
    `/workflow/defs/${def.id}/design?from=app-form&appId=${appId.value}&formId=${formId.value}`,
  )
}

function backToWorkspace() {
  void router.push({ name: 'form-app-manage-workspace', params: { appId: appId.value } })
}

// ==================== 展示辅助 ====================

function processStatusLabel(status: ProcessDef['status']): string {
  switch (status) {
    case 'PUBLISHED':
      return t('form.appCenter.processStatusPublished')
    case 'SUSPENDED':
      return t('form.appCenter.processStatusSuspended')
    case 'DISABLED':
      return t('form.appCenter.formStatusDisabled')
    default:
      return t('form.appCenter.formStatusDraft')
  }
}

function processStatusType(status: ProcessDef['status']): 'success' | 'info' | 'warning' {
  if (status === 'PUBLISHED') return 'success'
  if (status === 'SUSPENDED' || status === 'DISABLED') return 'info'
  return 'warning'
}

function formStatusLabel(): string {
  switch (formStatus.value) {
    case 'PUBLISHED':
      return t('form.appCenter.formStatusPublished')
    case 'DISABLED':
      return t('form.appCenter.formStatusDisabled')
    default:
      return t('form.appCenter.formStatusDraft')
  }
}

onMounted(() => {
  void load()
})
</script>

<template>
  <StandardListTemplate
    :show-toolbar-total="true"
    :total="processes.length"
    :page-num="1"
    :page-size="processes.length || 10"
    :empty="isEmpty"
  >
    <template #toolbar-actions>
      <!-- 0.1.7 #11：冗长「返回应用」按钮收敛为左上角返回箭头 -->
      <el-button
        class="context-back"
        :icon="ArrowLeft"
        circle
        data-testid="app-form-back"
        :title="t('form.appCenter.backToWorkspace')"
        @click="backToWorkspace"
      />
      <AppIcon v-if="app" :icon="app.icon" :color="app.color" :size="14" />
      <span class="context-path">
        {{ appName }}<template v-if="dirName"> / {{ dirName }}</template> /
        {{ formName }}
      </span>
      <el-button data-testid="enter-form-design" @click="enterFormDesign">
        {{ t('form.appCenter.enterFormDesign') }}
      </el-button>
      <el-button type="primary" data-testid="enter-process-design" @click="enterProcessDesign">
        {{ t('form.appCenter.enterProcessDesign') }}
      </el-button>
      <el-button data-testid="enter-form-data" @click="enterFormData">
        {{ t('form.appCenter.enterFormData') }}
      </el-button>
    </template>

    <div v-loading="loading" class="form-context">
      <div v-if="errorMsg" class="form-context__error">{{ errorMsg }}</div>

      <el-descriptions v-if="!errorMsg" :column="4" border size="small" class="form-context__desc">
        <el-descriptions-item :label="t('form.appCenter.colFormName')">
          <span data-testid="form-context-name">{{ formName }}</span>
        </el-descriptions-item>
        <el-descriptions-item :label="t('form.appCenter.colFormKey')">{{
          formKey
        }}</el-descriptions-item>
        <el-descriptions-item :label="t('form.appCenter.colFormStatus')">
          <el-tag
            size="small"
            :type="
              formStatus === 'PUBLISHED'
                ? 'success'
                : formStatus === 'DISABLED'
                  ? 'info'
                  : 'warning'
            "
          >
            {{ formStatusLabel() }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('form.appCenter.colFormVersion')">
          {{ formVersion ?? '-' }}
        </el-descriptions-item>
      </el-descriptions>

      <div class="form-context__section-title">{{ t('form.appCenter.relatedProcesses') }}</div>
      <el-table :data="processes" stripe style="width: 100%">
        <el-table-column prop="name" :label="t('form.appCenter.colProcessName')" min-width="200" />
        <el-table-column :label="t('form.appCenter.colProcessStatus')" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="processStatusType(row.status)">
              {{ processStatusLabel(row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="defVersion"
          :label="t('form.appCenter.colFormVersion')"
          width="100"
        />
        <el-table-column prop="updateTime" :label="t('common.updateTime')" min-width="160" />
        <el-table-column :label="t('common.actions')" width="140" fixed="right">
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              data-testid="enter-process-designer"
              @click="enterProcessDesigner(row)"
            >
              {{ t('form.appCenter.enterProcessDesigner') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <template #empty-action>
      <el-button type="primary" @click="enterProcessDesign">
        {{ t('form.appCenter.enterProcessDesign') }}
      </el-button>
    </template>
  </StandardListTemplate>
</template>

<style scoped>
.form-context {
  display: flex;
  flex-direction: column;
  gap: 16px;
  min-height: 80px;
}
.form-context__error {
  color: #f56c6c;
  padding: 12px 0;
}
.form-context__section-title {
  font-weight: 600;
  color: #303133;
}
.context-path {
  font-size: 13px;
  color: #909399;
  margin-right: 8px;
}
</style>

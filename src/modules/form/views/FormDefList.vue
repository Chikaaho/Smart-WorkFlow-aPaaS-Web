<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * FormDefList — 表单定义列表页（页型B）。
 *
 * 套 StandardListTemplate，接 GET /api/form/def/page 分页端点。
 * 提供「新建」「编辑」入口，跳转 form-designer 路由。
 *
 * 本页面不碰第四刀核心逻辑（draft-actions / definition-convert / FormDesigner 灰化逻辑）。
 */
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { pageFormDefs, updateFormVisibility } from '@/modules/form/api/form-def'
import { disableFormDef, enableFormDef } from '@/modules/form/api/i2-choices'
import { getFormDefStatusLabel, getFormDefStatusType } from '@/modules/form/utils/form-def-status'
import type { FormDefListItem } from '@/modules/form/api/form-def'
import type { PageQuery } from '@/contracts/common'
import { StandardListTemplate } from '@/components/page-layout'

const router = useRouter()

// ─── 列表状态 ───

const list = ref<FormDefListItem[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

// 搜索
const keyword = ref('')
const currentKeyword = ref('')

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const pageQuery: PageQuery = { pageNum: pageNum.value, pageSize: pageSize.value }
    const result = await pageFormDefs(pageQuery, currentKeyword.value || undefined)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = t('form.defListLoadFailed')
    }
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  currentKeyword.value = keyword.value.trim()
  pageNum.value = 1
  void loadList()
}

function handleReset() {
  keyword.value = ''
  currentKeyword.value = ''
  pageNum.value = 1
  void loadList()
}

function handlePageNumChange(p: number) {
  pageNum.value = p
  void loadList()
}

function handlePageSizeChange(s: number) {
  pageSize.value = s
  pageNum.value = 1
  void loadList()
}

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)

// ─── 操作 ───

function goCreate() {
  // P52：用 path 而非 name —— 菜单动态路由与工作台静态路由不同名，
  // path 直达带 :id 的工作台路由，避免同名替换导致的参数丢失。
  void router.push('/form/designer')
}

function goEdit(row: FormDefListItem) {
  void router.push(`/form/designer/${row.id}`)
}

// el-table row slot 的 DefaultRow 类型不兼容，桥接函数
function editRow(r: unknown) {
  goEdit(r as FormDefListItem)
}

const visibilityDialogVisible = ref(false)
const visibilityForm = ref<FormDefListItem | null>(null)
const visibilityUserIds = ref('')
const visibilitySaving = ref(false)

// I2 生命周期：停用/启用（PUBLISHED ↔ DISABLED），成功后刷新列表
async function toggleLifecycleRow(r: unknown, action: 'disable' | 'enable') {
  const row = r as FormDefListItem
  try {
    if (action === 'disable') {
      await disableFormDef(row.id, '管理员停用')
      ElMessage.success(t('form.disabledNotice'))
    } else {
      await enableFormDef(row.id, '管理员启用')
      ElMessage.success(t('form.enabledNotice'))
    }
    await loadList()
  } catch (err) {
    ElMessage.error(
      err instanceof ApiError
        ? err.msg
        : action === 'disable'
          ? t('common.disableFailed')
          : t('common.enableFailed'),
    )
  }
}

function openVisibility(row: FormDefListItem) {
  visibilityForm.value = row
  try {
    const parsed = row.visibilityScope ? JSON.parse(row.visibilityScope) : null
    const ids = Array.isArray(parsed?.userIds) ? parsed.userIds : []
    visibilityUserIds.value = ids.join(',')
  } catch {
    visibilityUserIds.value = ''
  }
  visibilityDialogVisible.value = true
}

// el-table row slot 的 DefaultRow 类型不兼容，桥接函数
function openVisibilityRow(r: unknown) {
  openVisibility(r as FormDefListItem)
}

async function saveVisibility() {
  if (!visibilityForm.value) return
  const raw = visibilityUserIds.value.trim()
  const userIds = raw ? raw.split(',').map((value) => Number(value.trim())) : []
  if (userIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    errorMsg.value = t('form.visibilityUserIdInvalid')
    return
  }
  visibilitySaving.value = true
  try {
    await updateFormVisibility(visibilityForm.value.id, userIds)
    ElMessage.success(t('form.visibilityScopeSaved'))
    visibilityDialogVisible.value = false
    await loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('form.visibilityScopeSaveFailed'))
  } finally {
    visibilitySaving.value = false
  }
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    :title="t('form.managementTitle')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 工具栏：新建按钮 -->
    <template #toolbar-actions>
      <el-button type="primary" @click="goCreate">{{ t('form.newForm') }}</el-button>
    </template>

    <!-- 筛选区：名称搜索 -->
    <template #filter>
      <el-input
        v-model="keyword"
        :placeholder="t('form.searchFormPlaceholder')"
        clearable
        style="width: 240px"
        @keyup.enter="handleQuery"
      />
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleQuery">{{ t('common.query') }}</el-button>
      <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
    </template>

    <!-- 表格 -->
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column prop="name" :label="t('common.formName')" min-width="160" />
      <el-table-column prop="formKey" :label="t('common.businessKey')" min-width="140" />
      <el-table-column prop="status" :label="t('common.status')" width="100">
        <template #default="{ row }">
          <el-tag :type="getFormDefStatusType(row.status)" size="small">
            {{ getFormDefStatusLabel(row.status) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="updateTime" :label="t('common.updateTime')" width="180" />
      <el-table-column :label="t('common.actions')" width="250" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="editRow(row)">{{
            t('common.edit')
          }}</el-button>
          <el-button size="small" link type="primary" @click="openVisibilityRow(row)">
            {{ t('form.initiationScope') }}
          </el-button>
          <!-- I2 生命周期：停用/启用（服务端审计；前端按钮不替代服务端状态检查） -->
          <el-button
            v-if="row.status === 'PUBLISHED'"
            size="small"
            link
            type="danger"
            @click="toggleLifecycleRow(row, 'disable')"
            >{{ t('common.disable') }}</el-button
          >
          <el-button
            v-if="row.status === 'DISABLED'"
            size="small"
            link
            type="success"
            @click="toggleLifecycleRow(row, 'enable')"
            >{{ t('common.enable') }}</el-button
          >
        </template>
      </el-table-column>
    </el-table>

    <!-- 空态 -->
    <template #empty-action>
      <el-button type="primary" @click="goCreate">{{ t('form.newForm') }}</el-button>
    </template>
  </StandardListTemplate>

  <el-dialog
    v-model="visibilityDialogVisible"
    :title="t('form.startVisibilityScope')"
    width="520px"
  >
    <p v-if="visibilityForm" class="visibility-form__hint">
      {{ visibilityForm.name }}（{{ visibilityForm.formKey }}）
    </p>
    <el-input
      v-model="visibilityUserIds"
      :placeholder="t('form.startVisibilityPlaceholder')"
      clearable
    />
    <p class="visibility-form__hint">
      {{ t('form.initiationScopeNote') }}
    </p>
    <template #footer>
      <el-button @click="visibilityDialogVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="visibilitySaving" @click="saveVisibility">{{
        t('common.save')
      }}</el-button>
    </template>
  </el-dialog>
</template>

<style scoped>
.visibility-form__hint {
  color: var(--sw-color-text-secondary);
  font-size: var(--sw-font-size-sm);
  margin: 0 0 12px;
}
</style>

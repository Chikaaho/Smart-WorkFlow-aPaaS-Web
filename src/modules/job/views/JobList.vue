<script setup lang="ts">
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * JobList — 定时任务管理列表页（页型 B）。
 *
 * 提供任务的 CRUD 操作和调度控制（暂停/恢复/手动触发）。
 * 使用 StandardListTemplate 槽位模板。
 */
import { ref, reactive, computed, onMounted } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { ApiError } from '@/foundation/request'
import { StandardListTemplate } from '@/components/page-layout'
import {
  pageJobInfos,
  createJobInfo,
  updateJobInfo,
  deleteJobInfo,
  pauseJob,
  resumeJob,
  triggerJob,
} from '@/modules/job/api'
import type { JobInfo, JobStatus, JobType } from '@/contracts/job'

// ─── 列表状态 ───

const list = ref<JobInfo[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMsg = ref('')

// ─── 筛选状态（双对象模式） ───
// filter 绑定输入 v-model，currentFilter 在「查询」按钮点击时同步
const filter = reactive({ jobName: '', status: '' as JobStatus | '', jobType: '' as JobType | '' })
const currentFilter = reactive({
  jobName: '',
  status: '' as JobStatus | '',
  jobType: '' as JobType | '',
})

// ─── 弹窗状态 ───

const dialogVisible = ref(false)
const dialogTitle = ref(t('common.newTask'))
const dialogLoading = ref(false)
const dialogError = ref('')
const editingId = ref<number | null>(null) // null = 创建模式

// ─── 表单数据 ───

const form = reactive<JobInfo>({
  jobName: '',
  cronExpression: '',
  jobGroup: 'DEFAULT',
  jobType: 'BEAN',
  status: 'NORMAL',
  concurrent: false,
  misfirePolicy: 0,
  description: '',
  beanName: '',
  beanParams: '',
  flowDefKey: '',
  formData: '',
})

// ─── 操作防重复 ───

const operatingId = ref<number | null>(null)

// ─── 计算属性 ───

const isEmpty = computed(() => !loading.value && !errorMsg.value && list.value.length === 0)
const showBeanFields = computed(() => form.jobType === 'BEAN')
const showFlowFields = computed(() => form.jobType === 'FLOW')

// ─── 列表加载 ───

async function loadList() {
  loading.value = true
  errorMsg.value = ''
  try {
    const query: Partial<Pick<JobInfo, 'jobName' | 'jobType' | 'status'>> = {}
    if (currentFilter.jobName) query.jobName = currentFilter.jobName
    if (currentFilter.jobType) query.jobType = currentFilter.jobType as JobType
    if (currentFilter.status) query.status = currentFilter.status as JobStatus

    const result = await pageJobInfos(pageNum.value, pageSize.value, query)
    list.value = result.list
    total.value = result.total
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = t('job.jobListLoadFailed')
    }
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  currentFilter.jobName = filter.jobName
  currentFilter.status = filter.status
  currentFilter.jobType = filter.jobType
  pageNum.value = 1
  void loadList()
}

function handleReset() {
  filter.jobName = ''
  filter.status = ''
  filter.jobType = ''
  currentFilter.jobName = ''
  currentFilter.status = ''
  currentFilter.jobType = ''
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

// ─── 弹窗逻辑 ───

function resetForm() {
  form.jobName = ''
  form.cronExpression = ''
  form.jobGroup = 'DEFAULT'
  form.jobType = 'BEAN'
  form.status = 'NORMAL'
  form.concurrent = false
  form.misfirePolicy = 0
  form.description = ''
  form.beanName = ''
  form.beanParams = ''
  form.flowDefKey = ''
  form.formData = ''
}

function openCreate() {
  editingId.value = null
  dialogTitle.value = t('common.newTask')
  dialogError.value = ''
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: JobInfo) {
  editingId.value = row.id ?? null
  dialogTitle.value = t('job.editJob')
  dialogError.value = ''
  form.jobName = row.jobName
  form.cronExpression = row.cronExpression
  form.jobGroup = row.jobGroup ?? 'DEFAULT'
  form.jobType = (row.jobType ?? 'BEAN') as JobType
  form.status = (row.status ?? 'NORMAL') as JobStatus
  form.concurrent = row.concurrent ?? false
  form.misfirePolicy = row.misfirePolicy ?? 0
  form.description = row.description ?? ''
  form.beanName = row.beanName ?? ''
  form.beanParams = row.beanParams ?? ''
  form.flowDefKey = row.flowDefKey ?? ''
  form.formData = row.formData ?? ''
  dialogVisible.value = true
}

function closeDialog() {
  dialogVisible.value = false
  dialogError.value = ''
  dialogLoading.value = false
}

async function handleSave() {
  if (!form.jobName.trim()) {
    dialogError.value = t('job.jobNameRequired')
    return
  }
  if (!form.cronExpression.trim()) {
    dialogError.value = t('job.cronRequired')
    return
  }

  dialogLoading.value = true
  dialogError.value = ''
  try {
    if (editingId.value === null) {
      await createJobInfo(form)
      ElMessage.success(t('common.createSuccess'))
    } else {
      await updateJobInfo({ ...form, id: editingId.value })
      ElMessage.success(t('common.updateSuccess'))
    }
    closeDialog()
    void loadList()
  } catch (err) {
    if (err instanceof ApiError) {
      dialogError.value = err.msg
    } else {
      dialogError.value =
        editingId.value === null ? t('workflow.createFailed') : t('job.updateFailed')
    }
  } finally {
    dialogLoading.value = false
  }
}

// ─── 操作逻辑 ───

async function handleDelete(row: JobInfo) {
  try {
    await ElMessageBox.confirm(
      t('job.confirmDeleteJob', { jobName: row.jobName }),
      t('common.deleteConfirmTitle'),
      {
        get confirmButtonText() {
          return t('common.confirm')
        },
        get cancelButtonText() {
          return t('common.cancel')
        },
        type: 'warning',
      },
    )
  } catch {
    return
  }

  try {
    await deleteJobInfo(row.id!)
    ElMessage.success(t('common.deleteSuccess'))
    void loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('common.deleteFailed'))
  }
}

async function handlePause(row: JobInfo) {
  if (operatingId.value !== null) return
  operatingId.value = row.id!
  try {
    await pauseJob(row.id!)
    ElMessage.success(t('job.jobPaused'))
    void loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('common.operationFailed'))
  } finally {
    operatingId.value = null
  }
}

async function handleResume(row: JobInfo) {
  if (operatingId.value !== null) return
  operatingId.value = row.id!
  try {
    await resumeJob(row.id!)
    ElMessage.success(t('job.jobResumed'))
    void loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('common.operationFailed'))
  } finally {
    operatingId.value = null
  }
}

async function handleTrigger(row: JobInfo) {
  try {
    await ElMessageBox.confirm(
      t('job.confirmTriggerJob', { jobName: row.jobName }),
      t('job.triggerManualTitle'),
      {
        get confirmButtonText() {
          return t('common.confirm')
        },
        get cancelButtonText() {
          return t('common.cancel')
        },
        type: 'info',
      },
    )
  } catch {
    return
  }

  try {
    await triggerJob(row.id!)
    ElMessage.success(t('job.triggerSucceeded'))
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : t('job.triggerFailed'))
  }
}

// ─── 类型桥接 ───

function editRow(r: unknown) {
  openEdit(r as JobInfo)
}
function deleteRow(r: unknown) {
  handleDelete(r as JobInfo)
}
function pauseRow(r: unknown) {
  handlePause(r as JobInfo)
}
function resumeRow(r: unknown) {
  handleResume(r as JobInfo)
}
function triggerRow(r: unknown) {
  handleTrigger(r as JobInfo)
}

// ─── 辅助 ───

function statusTagType(status: JobStatus): 'success' | 'warning' {
  return status === 'NORMAL' ? 'success' : 'warning'
}

function statusLabel(status: JobStatus): string {
  return status === 'NORMAL' ? t('common.statusRunning') : t('common.statusPaused')
}

function jobTypeLabel(type: JobType): string {
  return type === 'BEAN' ? 'Bean' : t('common.process')
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    :title="t('job.scheduledJobs')"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 工具栏：新建按钮 -->
    <template #toolbar-actions>
      <el-button type="primary" @click="openCreate">{{ t('common.newTask') }}</el-button>
    </template>

    <!-- 筛选区 -->
    <template #filter>
      <el-input
        v-model="filter.jobName"
        :placeholder="t('common.taskName')"
        clearable
        style="width: 200px"
        @keyup.enter="handleQuery"
      />
      <el-select
        v-model="filter.status"
        :placeholder="t('common.status')"
        clearable
        style="width: 120px"
      >
        <el-option :label="t('common.statusRunning')" value="NORMAL" />
        <el-option :label="t('common.statusPaused')" value="PAUSED" />
      </el-select>
      <el-select
        v-model="filter.jobType"
        :placeholder="t('common.type')"
        clearable
        style="width: 120px"
      >
        <el-option label="Bean" value="BEAN" />
        <el-option :label="t('common.process')" value="FLOW" />
      </el-select>
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleQuery">{{ t('common.query') }}</el-button>
      <el-button @click="handleReset">{{ t('common.reset') }}</el-button>
    </template>

    <!-- 错误提示 -->
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 12px"
    />

    <!-- 表格 -->
    <el-table v-loading="loading" :data="list" stripe>
      <el-table-column
        prop="jobName"
        :label="t('common.taskName')"
        min-width="160"
        show-overflow-tooltip
      />
      <el-table-column prop="jobGroup" :label="t('job.jobGroup')" width="100" />
      <el-table-column :label="t('common.type')" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="row.jobType === 'FLOW' ? 'warning' : 'info'">
            {{ jobTypeLabel(row.jobType as JobType) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="cronExpression" :label="t('job.cronExpression')" width="160" />
      <el-table-column :label="t('common.status')" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="statusTagType(row.status as JobStatus)">
            {{ statusLabel(row.status as JobStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="lastFireTime" :label="t('job.lastFireTime')" width="170" />
      <el-table-column prop="nextFireTime" :label="t('job.nextFireTime')" width="170" />
      <el-table-column prop="createTime" :label="t('common.createTime')" width="170" />
      <el-table-column :label="t('common.actions')" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="editRow(row)">{{
            t('common.edit')
          }}</el-button>
          <el-button
            v-if="(row as JobInfo).status === 'NORMAL'"
            size="small"
            link
            type="warning"
            :loading="operatingId === (row as JobInfo).id"
            :disabled="operatingId !== null"
            @click="pauseRow(row)"
            >{{ t('job.pause') }}</el-button
          >
          <el-button
            v-else
            size="small"
            link
            type="success"
            :loading="operatingId === (row as JobInfo).id"
            :disabled="operatingId !== null"
            @click="resumeRow(row)"
            >{{ t('common.resume') }}</el-button
          >
          <el-button size="small" link type="info" @click="triggerRow(row)">{{
            t('iot.trigger')
          }}</el-button>
          <el-button size="small" link type="danger" @click="deleteRow(row)">{{
            t('common.delete')
          }}</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 空态操作 -->
    <template #empty-action>
      <el-button type="primary" @click="openCreate">{{ t('common.newTask') }}</el-button>
    </template>
  </StandardListTemplate>

  <!-- 新建/编辑弹窗 -->
  <el-dialog
    v-model="dialogVisible"
    :title="dialogTitle"
    :close-on-click-modal="false"
    destroy-on-close
    width="560px"
    @closed="closeDialog"
  >
    <el-alert
      v-if="dialogError"
      :title="dialogError"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    />
    <el-form label-position="top" :model="form">
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item :label="t('common.taskName')" required>
            <el-input v-model="form.jobName" :placeholder="t('job.jobNamePlaceholder')" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item :label="t('job.jobGroup')">
            <el-input v-model="form.jobGroup" placeholder="DEFAULT" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item :label="t('job.cronExpression')" required>
        <el-input v-model="form.cronExpression" placeholder="0/30 * * * * ?" />
      </el-form-item>
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item :label="t('job.jobType')">
            <el-select v-model="form.jobType" style="width: 100%">
              <el-option :label="t('job.jobTypeBean')" value="BEAN" />
              <el-option :label="t('job.jobTypeFlow')" value="FLOW" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item :label="t('job.initialStatus')">
            <el-select v-model="form.status" style="width: 100%">
              <el-option :label="t('common.statusRunning')" value="NORMAL" />
              <el-option :label="t('common.statusPaused')" value="PAUSED" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <!-- Bean 配置（jobType=BEAN 时显示） -->
      <template v-if="showBeanFields">
        <el-form-item :label="t('agent.beanName')">
          <el-input v-model="form.beanName" :placeholder="t('agent.beanNamePlaceholder')" />
        </el-form-item>
        <el-form-item :label="t('job.beanParams')">
          <el-input
            v-model="form.beanParams"
            type="textarea"
            :rows="2"
            placeholder='{"key": "value"}'
          />
        </el-form-item>
      </template>
      <!-- Flow 配置（jobType=FLOW 时显示） -->
      <template v-if="showFlowFields">
        <el-form-item :label="t('common.processDefKey')">
          <el-input v-model="form.flowDefKey" :placeholder="t('common.processDefKey')" />
        </el-form-item>
        <el-form-item :label="t('router.formData')">
          <el-input
            v-model="form.formData"
            type="textarea"
            :rows="2"
            placeholder='{"field": "value"}'
          />
        </el-form-item>
      </template>
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item :label="t('job.concurrentExecution')">
            <el-switch
              v-model="form.concurrent"
              :active-text="t('common.allow')"
              :inactive-text="t('common.forbid')"
            />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item :label="t('job.misfirePolicy')">
            <el-select v-model="form.misfirePolicy" style="width: 100%">
              <el-option :label="t('job.misfireIgnore')" :value="0" />
              <el-option :label="t('job.misfireFireOnce')" :value="1" />
              <el-option :label="t('job.misfireDiscard')" :value="2" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item :label="t('job.jobDescription')">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="2"
          :placeholder="t('job.descriptionPlaceholder')"
        />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="closeDialog">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="dialogLoading" @click="handleSave">{{
        t('common.save')
      }}</el-button>
    </template>
  </el-dialog>
</template>

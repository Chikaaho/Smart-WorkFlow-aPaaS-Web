<script setup lang="ts">
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
const dialogTitle = ref('新建任务')
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
      errorMsg.value = '加载任务列表失败'
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
  dialogTitle.value = '新建任务'
  dialogError.value = ''
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: JobInfo) {
  editingId.value = row.id ?? null
  dialogTitle.value = '编辑任务'
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
    dialogError.value = '任务名称不能为空'
    return
  }
  if (!form.cronExpression.trim()) {
    dialogError.value = 'Cron 表达式不能为空'
    return
  }

  dialogLoading.value = true
  dialogError.value = ''
  try {
    if (editingId.value === null) {
      await createJobInfo(form)
      ElMessage.success('创建成功')
    } else {
      await updateJobInfo({ ...form, id: editingId.value })
      ElMessage.success('更新成功')
    }
    closeDialog()
    void loadList()
  } catch (err) {
    if (err instanceof ApiError) {
      dialogError.value = err.msg
    } else {
      dialogError.value = editingId.value === null ? '创建失败' : '更新失败'
    }
  } finally {
    dialogLoading.value = false
  }
}

// ─── 操作逻辑 ───

async function handleDelete(row: JobInfo) {
  try {
    await ElMessageBox.confirm(`确定要删除任务"${row.jobName}"吗？删除后不可恢复。`, '删除确认', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'warning',
    })
  } catch {
    return
  }

  try {
    await deleteJobInfo(row.id!)
    ElMessage.success('删除成功')
    void loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '删除失败')
  }
}

async function handlePause(row: JobInfo) {
  if (operatingId.value !== null) return
  operatingId.value = row.id!
  try {
    await pauseJob(row.id!)
    ElMessage.success('任务已暂停')
    void loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '操作失败')
  } finally {
    operatingId.value = null
  }
}

async function handleResume(row: JobInfo) {
  if (operatingId.value !== null) return
  operatingId.value = row.id!
  try {
    await resumeJob(row.id!)
    ElMessage.success('任务已恢复')
    void loadList()
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '操作失败')
  } finally {
    operatingId.value = null
  }
}

async function handleTrigger(row: JobInfo) {
  try {
    await ElMessageBox.confirm(`确定要手动触发任务"${row.jobName}"吗？`, '手动触发', {
      confirmButtonText: '确定',
      cancelButtonText: '取消',
      type: 'info',
    })
  } catch {
    return
  }

  try {
    await triggerJob(row.id!)
    ElMessage.success('触发成功，请查看执行日志')
  } catch (err) {
    ElMessage.error(err instanceof ApiError ? err.msg : '触发失败')
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
  return status === 'NORMAL' ? '运行中' : '已暂停'
}

function jobTypeLabel(type: JobType): string {
  return type === 'BEAN' ? 'Bean' : '流程'
}

onMounted(loadList)
</script>

<template>
  <StandardListTemplate
    title="定时任务"
    :total="total"
    :page-num="pageNum"
    :page-size="pageSize"
    :empty="isEmpty"
    @update:page-num="handlePageNumChange"
    @update:page-size="handlePageSizeChange"
  >
    <!-- 工具栏：新建按钮 -->
    <template #toolbar-actions>
      <el-button type="primary" @click="openCreate">新建任务</el-button>
    </template>

    <!-- 筛选区 -->
    <template #filter>
      <el-input
        v-model="filter.jobName"
        placeholder="任务名称"
        clearable
        style="width: 200px"
        @keyup.enter="handleQuery"
      />
      <el-select v-model="filter.status" placeholder="状态" clearable style="width: 120px">
        <el-option label="运行中" value="NORMAL" />
        <el-option label="已暂停" value="PAUSED" />
      </el-select>
      <el-select v-model="filter.jobType" placeholder="类型" clearable style="width: 120px">
        <el-option label="Bean" value="BEAN" />
        <el-option label="流程" value="FLOW" />
      </el-select>
    </template>
    <template #filter-actions>
      <el-button type="primary" @click="handleQuery">查询</el-button>
      <el-button @click="handleReset">重置</el-button>
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
      <el-table-column prop="jobName" label="任务名称" min-width="160" show-overflow-tooltip />
      <el-table-column prop="jobGroup" label="任务组" width="100" />
      <el-table-column label="类型" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="row.jobType === 'FLOW' ? 'warning' : 'info'">
            {{ jobTypeLabel(row.jobType as JobType) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="cronExpression" label="Cron 表达式" width="160" />
      <el-table-column label="状态" width="80" align="center">
        <template #default="{ row }">
          <el-tag size="small" :type="statusTagType(row.status as JobStatus)">
            {{ statusLabel(row.status as JobStatus) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="lastFireTime" label="上次执行" width="170" />
      <el-table-column prop="nextFireTime" label="下次执行" width="170" />
      <el-table-column prop="createTime" label="创建时间" width="170" />
      <el-table-column label="操作" width="280" fixed="right">
        <template #default="{ row }">
          <el-button size="small" link type="primary" @click="editRow(row)">编辑</el-button>
          <el-button
            v-if="(row as JobInfo).status === 'NORMAL'"
            size="small"
            link
            type="warning"
            :loading="operatingId === (row as JobInfo).id"
            :disabled="operatingId !== null"
            @click="pauseRow(row)"
            >暂停</el-button
          >
          <el-button
            v-else
            size="small"
            link
            type="success"
            :loading="operatingId === (row as JobInfo).id"
            :disabled="operatingId !== null"
            @click="resumeRow(row)"
            >恢复</el-button
          >
          <el-button size="small" link type="info" @click="triggerRow(row)">触发</el-button>
          <el-button size="small" link type="danger" @click="deleteRow(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 空态操作 -->
    <template #empty-action>
      <el-button type="primary" @click="openCreate">新建任务</el-button>
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
          <el-form-item label="任务名称" required>
            <el-input v-model="form.jobName" placeholder="请输入任务名称" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="任务组">
            <el-input v-model="form.jobGroup" placeholder="DEFAULT" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="Cron 表达式" required>
        <el-input v-model="form.cronExpression" placeholder="0/30 * * * * ?" />
      </el-form-item>
      <el-row :gutter="20">
        <el-col :span="12">
          <el-form-item label="任务类型">
            <el-select v-model="form.jobType" style="width: 100%">
              <el-option label="Bean（Spring Bean 处理器）" value="BEAN" />
              <el-option label="流程（定时发起流程）" value="FLOW" />
            </el-select>
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="初始状态">
            <el-select v-model="form.status" style="width: 100%">
              <el-option label="运行中" value="NORMAL" />
              <el-option label="已暂停" value="PAUSED" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <!-- Bean 配置（jobType=BEAN 时显示） -->
      <template v-if="showBeanFields">
        <el-form-item label="Bean 名称">
          <el-input v-model="form.beanName" placeholder="Spring Bean 名称" />
        </el-form-item>
        <el-form-item label="Bean 参数">
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
        <el-form-item label="流程定义 Key">
          <el-input v-model="form.flowDefKey" placeholder="流程定义 Key" />
        </el-form-item>
        <el-form-item label="表单数据">
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
          <el-form-item label="并发执行">
            <el-switch v-model="form.concurrent" active-text="允许" inactive-text="禁止" />
          </el-form-item>
        </el-col>
        <el-col :span="12">
          <el-form-item label="Misfire 策略">
            <el-select v-model="form.misfirePolicy" style="width: 100%">
              <el-option label="忽略" :value="0" />
              <el-option label="立即触发一次" :value="1" />
              <el-option label="放弃执行" :value="2" />
            </el-select>
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label="任务描述">
        <el-input v-model="form.description" type="textarea" :rows="2" placeholder="可选描述" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="closeDialog">取消</el-button>
      <el-button type="primary" :loading="dialogLoading" @click="handleSave">保存</el-button>
    </template>
  </el-dialog>
</template>

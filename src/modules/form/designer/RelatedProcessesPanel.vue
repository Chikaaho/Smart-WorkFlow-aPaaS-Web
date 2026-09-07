<script setup lang="ts">
/**
 * RelatedProcessesPanel — 表单工作台「关联流程」工作区（P52）。
 *
 * 契约（方向 §3.4）：
 *   - 只展示与当前表单稳定标识（formKey，持久化于后端 sw_bpm_process_def.form_key）
 *     关联的流程；过滤由后端执行，前端不做本地筛选；
 *   - 一个表单可关联多个流程；列表展示名称 / 状态 / 版本 / 最近更新时间；
 *   - 创建关联流程：自动带入当前表单身份，服务端持久化（POST /workflow/defs
 *     校验表单存在并落库），不靠前端路由参数形成伪关联；
 *   - 复用现有流程创建 / 设计 / 发布能力，不建平行流程管理体系；
 *     本轮后端无挂起/激活能力，不提供对应按钮（不伪装支持）。
 */
import { ref, computed, watch } from 'vue'
import { ElMessage } from 'element-plus'
import { createProcessDef, pageProcessDefs } from '@/modules/workflow/api'
import type { ProcessDef } from '@/contracts/bpm'

const props = defineProps<{ formId: string; formKey: string }>()
const emit = defineEmits<{ (e: 'enter-process', def: ProcessDef): void }>()

const records = ref<ProcessDef[]>([])
const total = ref(0)
const pageNum = ref(1)
const pageSize = ref(10)
const loading = ref(false)
/** 迟到响应防护：只应用最后一次请求的结果。 */
let requestSeq = 0

const hasFormKey = computed(() => props.formKey.trim().length > 0)

async function load() {
  if (!hasFormKey.value) return
  const seq = ++requestSeq
  loading.value = true
  try {
    const result = await pageProcessDefs(
      { pageNum: pageNum.value, pageSize: pageSize.value },
      props.formKey,
    )
    // 迟到响应不得覆盖当前列表（快速切换表单/多标签页防串位）
    if (seq !== requestSeq) return
    records.value = result.list
    total.value = result.total
  } catch {
    if (seq !== requestSeq) return
    ElMessage.error('加载关联流程失败')
  } finally {
    if (seq === requestSeq) loading.value = false
  }
}

watch(
  () => props.formKey,
  () => {
    pageNum.value = 1
    records.value = []
    total.value = 0
    load()
  },
  { immediate: true },
)

/* ── 创建关联流程 ── */
const createVisible = ref(false)
const newName = ref('')
const creating = ref(false)

function openCreate() {
  newName.value = ''
  createVisible.value = true
}

async function submitCreate() {
  const name = newName.value.trim()
  if (!name) {
    ElMessage.warning('请输入流程名称')
    return
  }
  creating.value = true
  try {
    await createProcessDef({ name, formKey: props.formKey })
    ElMessage.success('关联流程已创建')
    createVisible.value = false
    pageNum.value = 1
    await load()
  } catch {
    // 错误信息已经统一请求层/业务码提示
  } finally {
    creating.value = false
  }
}

// el-table row slot 的 DefaultRow 类型不兼容，桥接函数（对齐 ProcessDefList 先例）
function procRow(r: unknown) {
  return r as ProcessDef
}

function handlePageChange(page: number) {
  pageNum.value = page
  load()
}
</script>

<template>
  <div class="related-processes">
    <p class="related-processes__hint">
      与当前表单「{{ formKey }}」关联的全部流程。创建流程时自动绑定当前表单，关联由服务端持久化。
    </p>

    <div v-if="!hasFormKey" class="related-processes__empty">
      当前表单尚未保存，暂无稳定表单标识。请先在「表单设计」区保存草稿后再管理关联流程。
    </div>

    <template v-else>
      <div class="related-processes__toolbar">
        <el-button type="primary" @click="openCreate">创建关联流程</el-button>
        <span class="related-processes__total">共 {{ total }} 条</span>
      </div>

      <el-table v-loading="loading" :data="records">
        <el-table-column prop="name" label="流程名称" min-width="180" />
        <el-table-column label="状态" width="110">
          <template #default="{ row }">
            <el-tag :type="row.status === 'PUBLISHED' ? 'success' : 'info'" size="small">
              {{ row.status === 'PUBLISHED' ? '已发布' : '草稿' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="defVersion" label="版本" width="80" />
        <el-table-column prop="updateTime" label="最近更新时间" min-width="160" />
        <el-table-column label="操作" width="140" align="right">
          <template #default="{ row }">
            <el-button link type="primary" @click="emit('enter-process', procRow(row))">
              进入管理 / 编辑
            </el-button>
          </template>
        </el-table-column>
      </el-table>

      <div class="related-processes__pager">
        <el-pagination
          layout="prev, pager, next"
          :total="total"
          :page-size="pageSize"
          :current-page="pageNum"
          @current-change="handlePageChange"
        />
      </div>
    </template>

    <el-dialog v-model="createVisible" title="创建关联流程" width="480px" append-to-body>
      <el-form label-width="90px" @submit.prevent>
        <el-form-item label="表单标识">
          <el-input :model-value="formKey" disabled />
        </el-form-item>
        <el-form-item label="流程名称" required>
          <el-input v-model="newName" placeholder="请输入流程名称" maxlength="100" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="createVisible = false">取消</el-button>
        <el-button type="primary" :loading="creating" @click="submitCreate">创建</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped>
.related-processes {
  flex: 1;
  min-height: 0;
  padding: var(--sw-space-16) var(--sw-space-24);
  overflow: auto;
}

.related-processes__hint {
  margin: 0 0 var(--sw-space-12);
  font-size: 13px;
  color: var(--sw-text-secondary, #909399);
}

.related-processes__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--sw-space-12);
}

.related-processes__total {
  font-size: 13px;
  color: var(--sw-text-secondary, #909399);
}

.related-processes__empty {
  padding: var(--sw-space-32) 0;
  text-align: center;
  font-size: 13px;
  color: var(--sw-text-secondary, #909399);
}

.related-processes__pager {
  display: flex;
  justify-content: flex-end;
  padding-top: var(--sw-space-12);
}
</style>

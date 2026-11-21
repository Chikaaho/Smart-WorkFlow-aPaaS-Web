<template>
  <div class="log-level-page">
    <h1 class="page-title">日志等级</h1>
    <el-card shadow="never" class="level-card">
      <!-- E2-4：重启语义必须写明（调整重启后不保留） -->
      <el-alert
        type="info"
        :closable="false"
        show-icon
        class="restart-hint"
        title="调整立即生效，仅对本次运行有效；重启后恢复配置文件中的日志等级。"
        data-testid="loglevel-restart-hint"
      />

      <div class="filter-bar">
        <el-input
          v-model="keyword"
          placeholder="按 logger 名称搜索（包或类）"
          clearable
          class="filter-input"
          @input="applyFilter"
          @keyup.enter="applyFilter"
        />
        <el-button type="primary" @click="reset">查询</el-button>
        <el-button @click="reset">重置</el-button>
      </div>

      <div class="render-hint" data-testid="loglevel-total">
        匹配 {{ total }} 个 logger{{
          total > RENDER_LIMIT ? '，当前展示前 ' + RENDER_LIMIT + ' 个' : ''
        }}
      </div>
      <el-table v-loading="loading" :data="rows" class="level-table">
        <el-table-column label="Logger" prop="name" min-width="280" show-overflow-tooltip>
          <template #default="{ row }">
            <el-tag v-if="row.name === 'ROOT'" size="small" type="warning">ROOT</el-tag>
            <span class="logger-name">{{ row.name }}</span>
          </template>
        </el-table-column>
        <el-table-column label="配置等级" width="120">
          <template #default="{ row }">
            <span v-if="row.configuredLevel" class="configured">{{ row.configuredLevel }}</span>
            <span v-else class="inherited">默认</span>
          </template>
        </el-table-column>
        <el-table-column label="生效等级" prop="effectiveLevel" width="120" />
        <el-table-column label="操作" width="260">
          <template #default="{ row }">
            <el-select
              :model-value="row.configuredLevel ?? ''"
              size="small"
              placeholder="调整等级"
              class="level-select"
              :data-testid="`loglevel-select-${row.name}`"
              @change="(level: string) => adjust(row as LogLevelEntry, level)"
            >
              <el-option v-for="level in LEVELS" :key="level" :label="level" :value="level" />
            </el-select>
            <el-button
              size="small"
              :disabled="!row.configuredLevel"
              :data-testid="`loglevel-reset-${row.name}`"
              @click="adjust(row as LogLevelEntry, null)"
            >
              恢复默认
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>
  </div>
</template>

<script setup lang="ts">
/**
 * SystemLogLevelList — 1.2.0 P41（E2）日志等级管理页。
 *
 * 查看全部 logger（配置等级 vs 生效等级）+ 即时调整/恢复默认（LoggingSystem 内存态，
 * 重启恢复配置文件等级）；ROOT 调 DEBUG/TRACE 时二次确认（E2-5：日志量会显著增大）。
 * 权限：独立权限点 system:loglevel:manage（查看与调整共用；菜单种子见 V1.2.0 迁移，
 * 默认不授任何角色，超管经旁路默认可见可调）。
 */
import { onMounted, ref } from 'vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { listLogLevels, setLogLevel } from '../api/logLevel'
import type { LogLevelEntry } from '../api/logLevel'

const LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'OFF']

const keyword = ref('')
const allRows = ref<LogLevelEntry[]>([])
const rows = ref<LogLevelEntry[]>([])
const total = ref(0)
const loading = ref(false)

/** Log4j2 运行期 logger 数量可达数千；全量渲染会冻结主线程，展示层限流 200 行，
 *  服务端 keyword 过滤先行，前端再本地过滤兜底（E2-1：按名称搜索）。 */
const RENDER_LIMIT = 200

function applyFilter() {
  const needle = keyword.value.trim().toLowerCase()
  const source = needle
    ? allRows.value.filter((row) => row.name.toLowerCase().includes(needle))
    : allRows.value
  total.value = source.length
  rows.value = source.slice(0, RENDER_LIMIT)
}

async function load() {
  loading.value = true
  try {
    allRows.value = (await listLogLevels()) ?? []
    applyFilter()
  } catch {
    allRows.value = []
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function reset() {
  keyword.value = ''
  applyFilter()
}

/** 调整（level=null 恢复默认）；ROOT 调 DEBUG/TRACE 先二次确认（E2-5）。 */
async function adjust(entry: LogLevelEntry, level: string | null) {
  try {
    if (entry.name === 'ROOT' && (level === 'DEBUG' || level === 'TRACE')) {
      await ElMessageBox.confirm(
        `根 logger 调整为 ${level} 后日志量会显著增大（全部包都会输出），确认继续吗？`,
        '调整根日志等级',
        { type: 'warning', confirmButtonText: '确认调整', cancelButtonText: '取消' },
      )
    }
    await setLogLevel(entry.name, level)
    ElMessage.success(level ? `${entry.name} → ${level}` : `${entry.name} 已恢复默认`)
    await load()
  } catch (err) {
    if (err !== 'cancel' && (err as { toString(): string })?.toString !== undefined) {
      const message = err instanceof Error ? err.message : ''
      if (message) ElMessage.error(message)
    }
  }
}

onMounted(() => {
  void load()
})
</script>

<style scoped>
.log-level-page {
  padding: 16px;
}

.page-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 12px;
}

.level-card {
  width: 100%;
}

.restart-hint {
  margin-bottom: 12px;
}

.filter-bar {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.filter-input {
  width: 280px;
}

.logger-name {
  font-family: var(--el-font-family-mono, monospace);
}

.configured {
  font-weight: 600;
}

.inherited {
  color: var(--el-text-color-secondary);
}

.render-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-bottom: 8px;
}

.level-select {
  width: 120px;
  margin-right: 8px;
}
</style>

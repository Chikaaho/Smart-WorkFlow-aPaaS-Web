<script setup lang="ts">
/**
 * DesignerGraphExecPanel — 1.2.0 P67（E1-1）Graph 执行器节点面板：
 * 绑定已发布图 + 固定版本 → 按版本参数声明编辑入参/出参映射（不手写参数名）。
 * 状态与数据装载在 use-designer-graph-exec（主文件装配，本组件纯投影）。
 */
import { useI18n } from '@/locales'
import type { ComputedRef, Ref } from 'vue'
import type {
  AgentGraphDef,
  AgentGraphSnapshot,
  AgentGraphVersionBinding,
} from '@/adapters/agent-graph-catalog'
import type { GraphExecInputRow, GraphExecOutputRow } from '../composables/use-designer-graph-exec'

/** Graph 执行器面板绑定包（主文件装配）。 */
export interface DesignerGraphExecPanelApi {
  /** 当前节点是否 Graph 执行器（属性面板渲染开关）。 */
  graphExecActive: ComputedRef<boolean>
  /** 失败策略（R2-ui：CONTINUE 时写明条件分流方式）。 */
  failureStrategy: ComputedRef<string>
  graphs: Ref<AgentGraphDef[]>
  graphsLoading: Ref<boolean>
  versions: Ref<AgentGraphSnapshot[]>
  binding: Ref<AgentGraphVersionBinding | null>
  bindingLoading: Ref<boolean>
  bindingError: Ref<string>
  graphDefId: Ref<string>
  graphDefVersion: Ref<string>
  inputRows: Ref<GraphExecInputRow[]>
  outputRows: Ref<GraphExecOutputRow[]>
  variableOptions: ComputedRef<string[]>
  onGraphChange: (id: string) => Promise<void>
  onVersionChange: (version: string) => Promise<void>
  applyGraphExec: () => void
}

const props = defineProps<{ api: DesignerGraphExecPanelApi }>()
const {
  failureStrategy,
  graphs,
  graphsLoading,
  versions,
  binding,
  bindingLoading,
  bindingError,
  graphDefId,
  graphDefVersion,
  inputRows,
  outputRows,
  variableOptions,
  onGraphChange,
  onVersionChange,
  applyGraphExec,
} = props.api
const { t } = useI18n()
</script>

<template>
  <div class="graph-exec-panel" data-testid="graph-exec-panel">
    <el-form-item :label="t('workflow.graphExecGraph')">
      <el-select
        :model-value="graphDefId"
        filterable
        :loading="graphsLoading"
        :placeholder="t('workflow.graphExecGraphPlaceholder')"
        data-testid="graph-exec-graph-select"
        @update:model-value="onGraphChange(String($event))"
      >
        <el-option
          v-for="graph in graphs"
          :key="graph.id"
          :value="String(graph.id)"
          :label="`${graph.name} (${graph.graphKey})`"
        />
      </el-select>
    </el-form-item>

    <el-form-item :label="t('workflow.graphExecVersion')">
      <el-select
        :model-value="graphDefVersion"
        :disabled="!graphDefId"
        :placeholder="t('workflow.graphExecVersionPlaceholder')"
        data-testid="graph-exec-version-select"
        @update:model-value="onVersionChange(String($event))"
      >
        <el-option
          v-for="version in versions"
          :key="version.defVersion"
          :value="String(version.defVersion)"
          :label="`v${version.defVersion} · ${version.createTime ?? ''}`"
        />
      </el-select>
    </el-form-item>

    <!-- R2-ui：CONTINUE = 异常分支（下游条件节点按状态变量分流） -->
    <el-alert
      v-if="failureStrategy === 'CONTINUE'"
      type="info"
      :closable="false"
      class="continue-hint"
      :title="t('workflow.graphExecContinueHint')"
      data-testid="graph-exec-continue-hint"
    />
    <el-alert
      v-if="binding?.containsHumanNode"
      type="warning"
      :closable="false"
      :title="t('workflow.graphExecHumanWarning')"
      data-testid="graph-exec-human-warning"
    />

    <el-alert v-if="bindingError" type="error" :closable="false" :title="bindingError" />

    <div v-if="binding" class="graph-exec-binding-meta">
      {{ t('workflow.graphExecTimeoutLimit') }}: {{ binding.executionTimeoutSeconds }}s
    </div>

    <template v-if="inputRows.length">
      <div class="props-section">{{ t('workflow.graphExecInputSection') }}</div>
      <el-form-item
        v-for="row in inputRows"
        :key="`in-${row.name}`"
        :label="row.required ? `${row.name} *` : row.name"
      >
        <el-select
          v-model="row.source"
          filterable
          allow-create
          default-first-option
          :placeholder="t('workflow.graphExecSourcePlaceholder')"
          :data-testid="`graph-exec-input-${row.name}`"
          @change="applyGraphExec()"
        >
          <el-option
            v-for="variable in variableOptions"
            :key="variable"
            :value="variable"
            :label="variable"
          />
        </el-select>
        <small v-if="row.description" class="participant-hint">{{ row.description }}</small>
      </el-form-item>
    </template>

    <template v-if="outputRows.length">
      <div class="props-section">{{ t('workflow.graphExecOutputSection') }}</div>
      <el-form-item v-for="row in outputRows" :key="`out-${row.source}`" :label="row.source">
        <el-select
          v-model="row.target"
          filterable
          allow-create
          default-first-option
          :placeholder="t('workflow.graphExecTargetPlaceholder')"
          :data-testid="`graph-exec-output-${row.source}`"
          @change="applyGraphExec()"
        >
          <el-option
            v-for="variable in variableOptions"
            :key="variable"
            :value="variable"
            :label="variable"
          />
        </el-select>
        <small v-if="row.description" class="participant-hint">{{ row.description }}</small>
      </el-form-item>
    </template>

    <div
      v-if="bindingLoading"
      class="graph-exec-binding-meta"
      data-testid="graph-exec-binding-loading"
    >
      {{ t('workflow.graphExecBindingLoading') }}
    </div>
  </div>
</template>

<style scoped>
.graph-exec-panel {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.graph-exec-binding-meta {
  color: var(--el-text-color-secondary);
  font-size: 12px;
  margin-bottom: 4px;
}
</style>

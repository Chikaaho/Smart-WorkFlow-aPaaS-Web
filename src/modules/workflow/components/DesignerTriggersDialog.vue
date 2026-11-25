<script setup lang="ts">
/**
 * DesignerTriggersDialog — P64 阶段Ⅰ 触发规则配置弹窗。
 * 审查28 Q10：设计器工具栏「触发器」调用方——1120 宽、标题「流程触发器」；
 * 表头底色带 42 高、字段 32 高，编辑区按原图「触发时机 → 判断脚本 → 结果分区」排布。
 * 流程设置页的事件监听（ProcessSettings）是另一消费者，本组件不改。
 * （自 ProcessDesigner.vue 原地迁出，行为不变。）
 */
import { useI18n } from '@/locales'
import HintTip from '@/components/HintTip.vue'
import { ListActionsColumn } from '@/components/page-layout'
import { CHILD_WAIT_POLICIES } from '@/modules/workflow/utils/p64-orchestration'
import type { TriggerDraft } from '@/modules/workflow/utils/p64-orchestration'
import type { ListAction } from '@/components/page-layout/ListActionsColumn.vue'
import type { Ref } from 'vue'
import type { DesignerGraph } from '../composables/designer-graph'

const { t } = useI18n()

/** 触发规则弹窗绑定包（主文件装配；子组件解构后模板与原实现一致）。 */
export interface DesignerTriggersDialogApi {
  /** 弹窗可见性。 */
  triggersVisible: Ref<boolean>
  /** 图文档（触发规则表/变量候选）。 */
  graph: Ref<DesignerGraph | null>
  /** 触发器草稿。 */
  triggerDraft: Ref<TriggerDraft>
  /** 编辑中的触发器下标（null=新增）。 */
  triggerEditIndex: Ref<number | null>
  /** 草稿校验错误。 */
  triggerErrors: Ref<string[]>
  /** 行操作列（上移/下移/编辑/删除）。 */
  triggerActions: (row: unknown) => ListAction[]
  /** 重置草稿（新增监听）。 */
  resetTriggerDraft: () => void
  /** 校验并保存到图文档。 */
  saveTrigger: () => void
  /** 触发时机/结果类型/发起方式/继续条件展示名。 */
  TRIGGER_EVENT_LABELS: Record<string, string>
  MATCH_TYPE_LABELS: Record<string, string>
  ACTION_TYPE_LABELS: Record<string, string>
  WAIT_POLICY_LABELS: Record<string, string>
  /** 枚举值 → 展示名。 */
  labelOf: (labels: Record<string, string>, value: string | undefined) => string
  /** 触发表源节点列。 */
  graphNodeName: (nodeKey?: string) => string
  /** 已发布目标选项（目标流程/表单候选）。 */
  publishedTargetOptions: Ref<{
    defs: Array<{ key: string; name: string; formKey?: string }>
    forms: Array<{ key: string; name: string }>
  }>
  /** 目标表单字段候选。 */
  formFieldOptions: (formKey?: string) => Array<{ name: string; type: string; label?: string }>
  /** 目标表单字段展示名。 */
  formFieldLabel: (field: { name: string; label?: string }) => string
  /** 字段缓存装载（目标字段下拉展开时）。 */
  ensureFormFields: (formKey?: string) => Promise<void>
  /** 统一脚本编辑弹窗（触发器判断脚本）。 */
  openProcessScriptDialog: (title: string, code: string, target: { kind: 'triggerDraft' }) => void
  /** 结果分支/动作/映射编辑。 */
  addTriggerBranch: () => void
  addTriggerAction: (branchIndex: number) => void
  addChildWbField: (branchIndex: number, actionIndex: number, kind: 'row' | 'main') => void
  removeChildWbField: (
    branchIndex: number,
    actionIndex: number,
    kind: 'row' | 'main',
    index: number,
  ) => void
  addTriggerMapping: (branchIndex: number, actionIndex: number) => void
}

const props = defineProps<{
  api: DesignerTriggersDialogApi
}>()

const {
  triggersVisible,
  graph,
  triggerDraft,
  triggerEditIndex,
  triggerErrors,
  triggerActions,
  resetTriggerDraft,
  saveTrigger,
  TRIGGER_EVENT_LABELS,
  MATCH_TYPE_LABELS,
  ACTION_TYPE_LABELS,
  WAIT_POLICY_LABELS,
  labelOf,
  graphNodeName,
  publishedTargetOptions,
  formFieldOptions,
  formFieldLabel,
  ensureFormFields,
  openProcessScriptDialog,
  addTriggerBranch,
  addTriggerAction,
  addChildWbField,
  removeChildWbField,
  addTriggerMapping,
} = props.api
</script>

<template>
  <!-- ═══ P64 阶段Ⅰ：触发规则配置弹窗 ═══ -->
  <!-- 审查28 Q10：设计器工具栏「触发器」调用方——1120 宽、标题「流程触发器」；
     表头底色带 42 高、字段 32 高，编辑区按原图「触发时机 → 判断脚本 → 结果分区」排布。
     流程设置页的事件监听（ProcessSettings）是另一消费者，本批不改。 -->
  <el-dialog
    v-model="triggersVisible"
    title="流程触发器"
    width="min(1120px, 94vw)"
    class="p64-dialog"
    append-to-body
  >
    <div class="p64-toolbar">
      <el-button size="small" type="primary" @click="resetTriggerDraft">新增监听</el-button>
      <HintTip :content="t('workflow.listenerTimingHelp')" />
    </div>
    <el-table :data="graph?.triggers ?? []" size="small" class="p64-table">
      <el-table-column label="顺序" width="60">
        <template #default="{ $index }">{{ $index + 1 }}</template>
      </el-table-column>
      <el-table-column prop="name" label="名称" width="150" />
      <el-table-column label="启用" width="80">
        <template #default="{ row }">
          <el-switch v-model="row.enabled" :active-value="true" :inactive-value="false" />
        </template>
      </el-table-column>
      <el-table-column label="触发时机" width="190">
        <template #default="{ row }">{{ labelOf(TRIGGER_EVENT_LABELS, row.event) }}</template>
      </el-table-column>
      <el-table-column label="源节点" width="140">
        <template #default="{ row }">{{ graphNodeName(row.nodeKey) }}</template>
      </el-table-column>
      <el-table-column label="分支" min-width="160">
        <template #default="{ row }">
          {{
            (row.branches ?? [])
              .map(
                (b: { branchId: string; matchType: string; matchValue: string }) =>
                  `${b.branchId}（${labelOf(MATCH_TYPE_LABELS, b.matchType)}=${b.matchValue}）`,
              )
              .join('；')
          }}
        </template>
      </el-table-column>
      <!-- B021-012：操作列复用 ListActionsColumn——上移/下移/编辑直显，删除收进 ⋯ -->
      <ListActionsColumn :actions="triggerActions" :width="140" />
    </el-table>
    <el-divider />
    <!-- 审查28 Q10：去掉 small 尺寸（字段统一 32 高）；
       分区按原图排布——触发时机（+可读取变量）在前，规则标识等次之，随后判断脚本与结果分支。 -->
    <el-form label-position="top">
      <div class="p64-grid">
        <el-form-item label="触发时机">
          <el-select v-model="triggerDraft.event">
            <el-option
              v-for="item in ['PROCESS_START', 'PROCESS_COMPLETED']"
              :key="item"
              :label="labelOf(TRIGGER_EVENT_LABELS, item)"
              :value="item"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="可读取变量">
          <el-select v-model="triggerDraft.variables" multiple filterable>
            <el-option
              v-for="item in graph?.variables ?? []"
              :key="item.varId"
              :label="item.name || '未命名变量'"
              :value="item.varId"
            />
          </el-select>
        </el-form-item>
      </div>
      <div class="p64-grid">
        <el-form-item label="规则标识">
          <el-input
            v-model="triggerDraft.triggerId"
            :disabled="triggerEditIndex !== null"
            placeholder="trg_example"
          />
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="triggerDraft.name" />
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="triggerDraft.enabled" />
        </el-form-item>
      </div>
      <el-form-item label="判断脚本">
        <div class="participant-picker-row">
          <el-button
            @click="
              openProcessScriptDialog('触发器判断脚本', triggerDraft.script, {
                kind: 'triggerDraft',
              })
            "
          >
            {{ triggerDraft.script?.trim() ? '编辑脚本' : '编写脚本' }}
          </el-button>
          <small v-if="triggerDraft.script?.trim()" class="p64-hint"> 已配置 </small>
        </div>
      </el-form-item>
      <div class="p64-toolbar">
        <span class="p64-subtitle">结果分支</span>
        <el-button size="small" @click="addTriggerBranch">添加分支</el-button>
      </div>
      <div
        v-for="(branch, branchIndex) in triggerDraft.branches"
        :key="branchIndex"
        class="p64-branch-card"
      >
        <div class="p64-grid">
          <el-form-item label="分支标识">
            <el-input v-model="branch.branchId" />
          </el-form-item>
          <el-form-item label="结果类型">
            <el-select v-model="branch.matchType">
              <el-option
                v-for="item in ['NUMBER', 'STRING', 'BOOLEAN']"
                :key="item"
                :label="labelOf(MATCH_TYPE_LABELS, item)"
                :value="item"
              />
            </el-select>
          </el-form-item>
          <el-form-item label="结果值">
            <el-input v-model="branch.matchValue" />
          </el-form-item>
        </div>
        <div class="p64-toolbar">
          <span class="p64-subtitle">命中后执行的动作</span>
          <el-button size="small" @click="addTriggerAction(branchIndex)">添加动作</el-button>
        </div>
        <div
          v-for="(action, actionIndex) in branch.actions"
          :key="actionIndex"
          class="p64-action-card"
        >
          <div class="p64-grid">
            <el-form-item label="动作标识">
              <el-input v-model="action.actionId" />
            </el-form-item>
            <el-form-item label="发起方式">
              <el-select v-model="action.type">
                <el-option
                  v-for="item in ['START_SINGLE', 'START_EACH', 'START_GROUPED']"
                  :key="item"
                  :label="labelOf(ACTION_TYPE_LABELS, item)"
                  :value="item"
                />
              </el-select>
            </el-form-item>
            <el-form-item v-if="action.type !== 'START_SINGLE'" label="集合变量">
              <el-select v-model="action.sourceVariable" filterable>
                <el-option
                  v-for="item in graph?.variables ?? []"
                  :key="item.varId"
                  :label="item.name || '未命名变量'"
                  :value="item.varId"
                />
              </el-select>
            </el-form-item>
            <el-form-item v-if="action.type === 'START_GROUPED'" label="分组字段（按该字段值分组）">
              <el-input v-model="action.groupBy" placeholder="id" />
            </el-form-item>
          </div>
          <div class="p64-grid">
            <el-form-item label="目标流程">
              <el-select
                v-model="action.targetProcessDefKey"
                filterable
                allow-create
                default-first-option
                placeholder="选择流程"
              >
                <el-option
                  v-for="item in publishedTargetOptions.defs"
                  :key="item.key"
                  :label="item.name || '未命名表单'"
                  :value="item.key"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="目标表单">
              <el-select
                v-model="action.targetFormKey"
                filterable
                allow-create
                default-first-option
                placeholder="选择已发布表单（或输入表单标识）"
              >
                <el-option
                  v-for="item in publishedTargetOptions.forms"
                  :key="item.key"
                  :label="item.name || '未命名表单'"
                  :value="item.key"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="单次最多发起（1-200）">
              <el-input-number v-model="action.maxDispatch" :min="1" :max="200" />
            </el-form-item>
          </div>
          <div class="p64-toolbar">
            <span class="p64-subtitle">带入目标流程的数据</span>
            <el-button size="small" @click="addTriggerMapping(branchIndex, actionIndex)"
              >添加映射</el-button
            >
          </div>
          <div
            v-for="(mapping, mappingIndex) in action.mapping"
            :key="mappingIndex"
            class="p64-grid"
          >
            <el-form-item label="目标表单字段">
              <el-select
                v-model="mapping.targetField"
                filterable
                allow-create
                default-first-option
                placeholder="选择目标表单字段"
                @visible-change="
                  (visible: boolean) => visible && ensureFormFields(action.targetFormKey)
                "
              >
                <el-option
                  v-for="field in formFieldOptions(action.targetFormKey)"
                  :key="field.name"
                  :label="formFieldLabel(field)"
                  :value="field.name"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="取变量值">
              <el-select v-model="mapping.sourceVarId" clearable filterable>
                <el-option
                  v-for="item in graph?.variables ?? []"
                  :key="item.varId"
                  :label="item.name || '未命名变量'"
                  :value="item.varId"
                />
              </el-select>
            </el-form-item>
            <el-form-item label="取集合行字段">
              <el-input v-model="mapping.itemField" placeholder="如 id（集合行的字段名）" />
            </el-form-item>
            <el-form-item label="固定值">
              <el-input v-model="mapping.literal" placeholder="与上面两种来源任选一种" />
            </el-form-item>
          </div>
          <!-- P64 阶段Ⅱ：子流程（主子流程）配置 -->
          <div class="p64-grid">
            <el-form-item label="子流程模式">
              <el-checkbox
                :model-value="action.orchestration === 'CHILD'"
                @update:model-value="
                  (v: boolean | string | number) => {
                    action.orchestration = v === true ? 'CHILD' : ''
                  }
                "
              >
                按主子流程编排（发起后按「继续条件」推进，并可把子流程结果回填到本表单）
              </el-checkbox>
            </el-form-item>
            <template v-if="action.orchestration === 'CHILD'">
              <el-form-item label="继续条件">
                <el-select v-model="action.waitPolicy">
                  <el-option
                    v-for="item in CHILD_WAIT_POLICIES"
                    :key="item"
                    :label="labelOf(WAIT_POLICY_LABELS, item)"
                    :value="item"
                  />
                </el-select>
              </el-form-item>
              <el-form-item v-if="action.waitPolicy === 'COUNT'" label="完成数量（达到即继续）">
                <el-input-number v-model="action.waitCount" :min="1" :max="action.maxDispatch" />
              </el-form-item>
              <el-form-item label="结果回填">
                <el-checkbox v-model="action.wbEnabled">把子流程结果回填到本表单</el-checkbox>
              </el-form-item>
            </template>
          </div>
          <template v-if="action.orchestration === 'CHILD' && action.wbEnabled">
            <div class="p64-grid">
              <el-form-item label="结果节点">
                <el-input
                  v-model="action.wbResultNodeKey"
                  placeholder="子流程中产出结果的节点（如 node_result）"
                />
              </el-form-item>
              <el-form-item label="子表单结果表">
                <el-input
                  v-model="action.wbTableField"
                  placeholder="行级回填时填写（子表单里的表格字段）"
                />
              </el-form-item>
              <el-form-item label="来源行标识列">
                <el-input v-model="action.wbRowKeyField" placeholder="记录来源行标识的列名" />
              </el-form-item>
              <el-form-item label="本表单的来源表">
                <el-input
                  v-model="action.wbParentTableField"
                  placeholder="本表单承载来源行的表格字段"
                />
              </el-form-item>
            </div>
            <div class="p64-toolbar">
              <span class="p64-subtitle">行级回填对应（子表列 → 本表单列）</span>
              <el-button size="small" @click="addChildWbField(branchIndex, actionIndex, 'row')"
                >添加一行</el-button
              >
            </div>
            <div v-for="(f, fi) in action.wbFields" :key="'wr' + fi" class="p64-grid">
              <el-form-item label="子表列">
                <el-input v-model="f.fromField" />
              </el-form-item>
              <el-form-item label="本表单列">
                <el-input v-model="f.toField" />
              </el-form-item>
              <el-form-item label=" ">
                <el-button
                  size="small"
                  link
                  type="danger"
                  @click="removeChildWbField(branchIndex, actionIndex, 'row', fi)"
                  >删除</el-button
                >
              </el-form-item>
            </div>
            <div class="p64-toolbar">
              <span class="p64-subtitle">主记录回填对应（子表单字段 → 本表单字段）</span>
              <el-button size="small" @click="addChildWbField(branchIndex, actionIndex, 'main')"
                >添加一行</el-button
              >
            </div>
            <div v-for="(f, fi) in action.wbMainFields" :key="'wm' + fi" class="p64-grid">
              <el-form-item label="子表单字段">
                <el-input v-model="f.fromField" />
              </el-form-item>
              <el-form-item label="本表单字段">
                <el-input v-model="f.toField" />
              </el-form-item>
              <el-form-item label=" ">
                <el-button
                  size="small"
                  link
                  type="danger"
                  @click="removeChildWbField(branchIndex, actionIndex, 'main', fi)"
                  >删除</el-button
                >
              </el-form-item>
            </div>
          </template>
        </div>
      </div>
      <div v-if="triggerErrors.length" class="p64-errors">
        <p v-for="item in triggerErrors" :key="item" role="alert">{{ item }}</p>
      </div>
      <el-button size="small" type="primary" @click="saveTrigger">
        {{ triggerEditIndex === null ? '添加' : '保存修改' }}
      </el-button>
    </el-form>
  </el-dialog>
</template>

<style scoped>
/* ── P64 弹窗内分区样式（与变量弹窗同源；随弹窗模板迁入本组件） ── */
.p64-toolbar {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}
/* P64 宽/矮视口可达性（审查02 P1-03b）：弹窗不超出视口，内容区滚动，
   关闭/保存/映射等控件在大变量与多分支配置下仍可到达。append-to-body 传送后
   弹窗不带 scoped 属性，外壳规则见全局样式块。 */
.p64-hint {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
.p64-subtitle {
  font-size: 13px;
  font-weight: 600;
  color: var(--sw-color-primary);
}
.p64-table {
  width: 100%;
}
.p64-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  column-gap: 16px;
}
.p64-branch-card,
.p64-action-card {
  border: 1px solid var(--el-border-color-lighter, #e4e7ed);
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}
.p64-errors {
  margin: 8px 0;
  color: var(--el-color-danger, #f56c6c);
  font-size: 12px;
}
.p64-errors p {
  margin: 2px 0;
}
</style>

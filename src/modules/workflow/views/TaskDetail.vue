<script setup lang="ts">
import PrintActions from '@/modules/workflow/components/PrintActions.vue'
import { useI18n } from '@/locales'

const { t } = useI18n()
/**
 * TaskDetail — 任务详情页。
 *
 * 展示任务详情信息、流程变量、审批历史，提供通过/驳回操作。
 * 路由参数：taskId。页面只做编排：状态在 ../composables/use-task-*.ts，
 * 大块模板段在 ../components/Task*.vue。
 */
import { onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft } from '@element-plus/icons-vue'
import { queryTaskDetail } from '@/modules/workflow/api'
import { ApiError } from '@/foundation/request'
import HintTip from '@/components/HintTip.vue'
import InstanceFlowPanel from '../components/InstanceFlowPanel.vue'
import BusinessFormReadonly from '@/components/business-detail/BusinessFormReadonly.vue'
import TaskIotReservationCard from '../components/TaskIotReservationCard.vue'
import TaskIotCancelDialog from '../components/TaskIotCancelDialog.vue'
import TaskOpinionFields from '../components/TaskOpinionFields.vue'
import TaskNodeFormFields from '../components/TaskNodeFormFields.vue'
import TaskApprovalActionBar from '../components/TaskApprovalActionBar.vue'
import TaskLifecycleDialog from '../components/TaskLifecycleDialog.vue'
import TaskAgreeDialog from '../components/TaskAgreeDialog.vue'
import TaskRejectDialog from '../components/TaskRejectDialog.vue'
import TaskReturnDialog from '../components/TaskReturnDialog.vue'
import TaskUrgeDialog from '../components/TaskUrgeDialog.vue'
import TaskValidationDialog from '../components/TaskValidationDialog.vue'
import { useTaskFormRecord } from '../composables/use-task-form-record'
import { useTaskOpinionForm } from '../composables/use-task-opinion-form'
import type { OpinionFieldRenderApi } from '../composables/use-task-opinion-form'
import { useTaskNodeForm } from '../composables/use-task-node-form'
import { useIotReservations } from '../composables/use-iot-reservations'
import { useTaskNavigation } from '../composables/use-task-navigation'
import { useTaskApprovalActions } from '../composables/use-task-approval-actions'
import { useTaskUrge } from '../composables/use-task-urge'
import { useTaskLifecycle } from '../composables/use-task-lifecycle'
import { useStickyActionsCard } from '../composables/use-sticky-actions-card'
import type { TaskDetail } from '@/contracts/bpm'

const route = useRoute()

/**
 * 同一套任务详情既作为独立办理页，也嵌入统一详情弹窗：
 * 列表传入 taskId；路由直达时回退读取路由参数。
 */
const props = withDefaults(
  defineProps<{
    taskId?: string
    embedded?: boolean
  }>(),
  { taskId: '', embedded: false },
)
const emit = defineEmits<{ completed: [] }>()

const taskId = props.taskId || (route.params.taskId as string)

// ─── 页面状态 ───
const detail = ref<TaskDetail | null>(null)
const loading = ref(false)
const errorMsg = ref('')

// ── 设计 300:1808 校验提示弹窗：提交前必填缺失聚合为清单（红条目 + 说明行） ──
const validationDialogVisible = ref(false)
const validationItems = ref<string[]>([])

function openValidationDialog(items: string[]): boolean {
  if (items.length === 0) return true
  validationItems.value = items
  validationDialogVisible.value = true
  return false
}

const { formRecord, formRecordLoading, loadFormRecord } = useTaskFormRecord(detail)

const {
  opinionComment,
  opinionData,
  opinionDraftSaving,
  opinionDraftRestored,
  loadOpinionDraft,
  saveOpinionDraft,
  initializeOpinionData,
  visibleOpinionFields,
  opinionFieldValue,
  opinionTextValue,
  opinionInputValue,
  opinionInputType,
  setOpinionFieldValue,
  opinionFieldInvalid,
  ensureOpinionData,
} = useTaskOpinionForm({ taskId, detail, openValidationDialog })

const opinionFieldApi: OpinionFieldRenderApi = {
  valueOf: opinionFieldValue,
  textOf: opinionTextValue,
  inputOf: opinionInputValue,
  inputTypeOf: opinionInputType,
  isInvalid: opinionFieldInvalid,
  set: setOpinionFieldValue,
}

const {
  nodeFormModel,
  nodeFormErrors,
  nodeFormSavingDraft,
  nodeFormBound,
  nodeFormSubmitted,
  nodeFormEditable,
  nodeFormHiddenAll,
  nodeFormRenderFields,
  nodeFieldReadonly,
  loadNodeForm,
  validateNodeFormRequired,
  nodeFormMissingItems,
  handleNodeFormDraft,
} = useTaskNodeForm({ taskId, detail, formRecord })

const {
  reservations,
  reservationsLoading,
  loadReservations,
  cancelDialogVisible,
  cancelReason,
  cancelSubmitting,
  openCancelReservation,
  submitCancelReservation,
} = useIotReservations(detail)

const { goBack, backLabel, navigateAfterAction } = useTaskNavigation({
  embedded: () => props.embedded,
  emitCompleted: () => emit('completed'),
})

const {
  acting,
  canAct,
  nodeAllows,
  canApprove,
  negativeAction,
  canReturn,
  returnTargets,
  actionPayload,
  agreeDialogVisible,
  agreeSubmitting,
  handleApprove,
  confirmAgree,
  rejectDialogVisible,
  rejectReason,
  rejectSubmitting,
  handleReject,
  confirmReject,
  returnDialogVisible,
  returnSubmitting,
  returnComment,
  returnTargetNodeId,
  handleReturn,
  confirmReturn,
  lastExpired,
  loadLastExpired,
} = useTaskApprovalActions({
  taskId,
  detail,
  navigateAfterAction,
  openValidationDialog,
  ensureOpinionData,
  opinionComment,
  opinionData,
  visibleOpinionFields,
  nodeFormBound,
  nodeFormSubmitted,
  nodeFormHiddenAll,
  nodeFormModel,
  validateNodeFormRequired,
  nodeFormMissingItems,
})

const {
  canUrge,
  urgeDialogVisible,
  urgeMessage,
  urgeRecipientOptions,
  urgeRecipientIds,
  openUrgeDialog,
  confirmUrge,
} = useTaskUrge({ detail, acting, canAct })

const {
  lifecycleDialog,
  lifecycleDialogVisible,
  lifecycleDialogTitle,
  lifecycleSubmitting,
  submitLifecycle,
  approvalMoreActions,
  handleApprovalMore,
  setLifecycleTargetUserId,
  setLifecycleReceivers,
  setLifecycleParticipants,
  setLifecycleMessage,
  setLifecycleMode,
  setLifecycleSignPosition,
} = useTaskLifecycle({
  taskId,
  detail,
  acting,
  opinionComment,
  actionPayload,
  navigateAfterAction,
  canAct,
  nodeAllows,
  canUrge,
  openUrgeDialog,
})

const { actionsCardRef, syncActionsCardHeight, detailScrollStyle } = useStickyActionsCard({
  embedded: () => props.embedded,
})
// G4-1：actionsCardRef 由模板字符串 ref 绑定（vue-tsc 跟踪不到该用法），
// syncActionsCardHeight 是测试/外部手动重算入口；两者保留为 setup 暴露绑定。
void actionsCardRef
void syncActionsCardHeight

async function loadDetail() {
  loading.value = true
  errorMsg.value = ''
  opinionDraftRestored.value = false
  try {
    detail.value = await queryTaskDetail(taskId)
    initializeOpinionData(detail.value)
    void loadOpinionDraft()
    void loadFormRecord()
    void loadReservations()
    void loadLastExpired()
    void loadNodeForm()
  } catch (err) {
    if (err instanceof ApiError) {
      errorMsg.value = err.msg
    } else {
      errorMsg.value = t('workflow.mobileTaskDetailLoadFailed')
    }
  } finally {
    loading.value = false
  }
}

onMounted(loadDetail)
</script>

<template>
  <div
    v-loading="loading"
    class="task-detail"
    :class="{ 'task-detail--embedded': embedded }"
    :style="detailScrollStyle"
  >
    <!-- 0.1.7 #18：页头只留左上角返回箭头，标题/状态/发起人等噪音全部去掉 -->
    <div v-if="!embedded" class="detail-header">
      <button
        type="button"
        class="detail-header__arrow"
        data-testid="task-detail-back"
        :title="backLabel"
        @click="goBack"
      >
        <el-icon><ArrowLeft /></el-icon>
      </button>
      <!-- 1.0.0 F2：任务详情打印/PDF（内容与详情一致；PDF 走服务端权限过滤链） -->
      <PrintActions
        v-if="detail?.formKey && detail?.businessKey"
        :form-key="detail.formKey"
        :record-id="detail.businessKey"
        :process-instance-id="detail.processInstanceId"
        class="detail-header__print"
      />
    </div>

    <!-- 错误提示 -->
    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      style="margin-bottom: 16px"
    />

    <!-- 0.1.7 #18：去掉右侧流程状态轨，主区单列——表单画布铺满，设计器里有什么就展示什么 -->
    <div v-if="detail" class="task-main">
      <el-alert
        v-if="lastExpired"
        class="g05b-expired-alert"
        type="warning"
        :closable="false"
        show-icon
      >
        <p>
          {{
            t('workflow.approvalExpired', {
              reason: lastExpired.reason || t('workflow.approvalExpiredDefault'),
            })
          }}
        </p>
        <p>{{ t('workflow.approvalExpiredRetry') }}</p>
      </el-alert>

      <!-- 本次提交的表单数据：与抄送详情共用同一套业务表单只读展示 -->
      <BusinessFormReadonly
        v-if="detail.formKey && detail.businessKey"
        :form-key="detail.formKey"
        :record-id="detail.businessKey"
        :record="formRecord"
        :loading="formRecordLoading"
      />

      <TaskIotReservationCard
        v-if="reservations.length > 0"
        :rows="reservations"
        :loading="reservationsLoading"
        @cancel="openCancelReservation"
      />
    </div>

    <!-- 流程信息作为表单详情的外挂组件：与表单详情/任务详情共用同一控制面 -->
    <!-- 审批结果映射（流转记录/审批详情在 InstanceFlowPanel 内共享同一份派生） -->
    <InstanceFlowPanel
      v-if="detail"
      :approval-history="detail.approvalHistory"
      :process-definition-key="detail.processDefinitionKey"
      :current-node-key="detail.nodeKey"
    />

    <!-- 0.1.7 #18：审批意见在下方，全部操作按钮右下角；发起人常驻催办入口 -->
    <el-card
      v-if="detail && (canAct || canUrge)"
      ref="actionsCardRef"
      class="detail-card detail-card--actions"
    >
      <template v-if="canAct" #header>
        <span class="detail-actions__title">{{ t('workflow.approvalSection') }}</span>
      </template>
      <div class="detail-actions">
        <!-- P64 节点审批表单：并入审批区，只呈现字段组件，不显示表单名称 -->
        <TaskNodeFormFields
          v-if="canAct && nodeFormBound"
          :fields="nodeFormRenderFields"
          :data="nodeFormModel"
          :errors="nodeFormErrors"
          :saving="nodeFormSavingDraft"
          :editable="nodeFormEditable"
          :acting="acting"
          :is-readonly="nodeFieldReadonly"
          @set="(name, value) => (nodeFormModel[name] = value)"
          @save-draft="handleNodeFormDraft"
        />
        <TaskOpinionFields
          v-if="canAct && visibleOpinionFields.length > 0"
          :fields="visibleOpinionFields"
          :api="opinionFieldApi"
        />
        <textarea
          v-if="canAct && !nodeFormBound && visibleOpinionFields.length === 0"
          v-model="opinionComment"
          class="opinion-input"
          rows="3"
          :placeholder="t('workflow.remarkOptional')"
        />
        <div v-if="canAct" class="opinion-draft-actions">
          <el-button size="small" :loading="opinionDraftSaving" @click="saveOpinionDraft">
            {{ t('workflow.saveOpinionDraft') }}
          </el-button>
          <span v-if="opinionDraftRestored">{{ t('workflow.opinionDraftRestored') }}</span>
          <HintTip :content="t('workflow.opinionDraftNote')" />
        </div>
        <TaskApprovalActionBar
          :can-act="canAct"
          :can-return="canReturn"
          :has-return-targets="returnTargets.length > 0"
          :negative-action="negativeAction"
          :can-approve="canApprove"
          :acting="acting"
          :more-actions="approvalMoreActions"
          @return="handleReturn"
          @reject="handleReject"
          @approve="handleApprove"
          @more="handleApprovalMore"
        />
      </div>
    </el-card>

    <!-- I3 生命周期动作弹窗；转办/委托/沟通/加签按设计 273:1877/1901/1925/1949 统一
         640 宽（左右 25 → 内容 590）与 32 高输入、80×32 底栏 -->
    <TaskLifecycleDialog
      v-model="lifecycleDialogVisible"
      :title="lifecycleDialogTitle"
      :kind="lifecycleDialog?.kind ?? null"
      :target-user-id="lifecycleDialog?.targetUserId ?? ''"
      :receivers="lifecycleDialog?.receivers ?? ''"
      :participants="lifecycleDialog?.participants ?? ''"
      :message="lifecycleDialog?.message ?? ''"
      :mode="lifecycleDialog?.mode ?? 'PARALLEL'"
      :sign-position="lifecycleDialog?.signPosition ?? 'BEFORE'"
      :submitting="lifecycleSubmitting"
      :comment="opinionComment"
      @update:comment="(value: string) => (opinionComment = value)"
      @update:target-user-id="setLifecycleTargetUserId"
      @update:receivers="setLifecycleReceivers"
      @update:participants="setLifecycleParticipants"
      @update:message="setLifecycleMessage"
      @update:mode="setLifecycleMode"
      @update:sign-position="setLifecycleSignPosition"
      @submit="submitLifecycle"
    />

    <TaskIotCancelDialog
      v-model="cancelDialogVisible"
      v-model:reason="cancelReason"
      :submitting="cancelSubmitting"
      @submit-cancel="submitCancelReservation"
    />

    <!-- 同意申请弹窗（设计 272:1767）：560 宽 / 用户语言确认句 / 底栏 取消·确定 80×32；
         打开后取消即关闭，不提交同意。 -->
    <TaskAgreeDialog
      v-model="agreeDialogVisible"
      :submitting="agreeSubmitting"
      @confirm="confirmAgree"
    />

    <!-- 驳回申请弹窗（设计 272:1746）：驳回原因可选，确认后直提 REJECT；560 宽 / 输入 510×32 / 底栏按钮 80×32 -->
    <TaskRejectDialog
      v-model="rejectDialogVisible"
      v-model:reason="rejectReason"
      :submitting="rejectSubmitting"
      @confirm="confirmReject"
    />

    <!-- 退回申请弹窗（设计 273:2001）：退回目标选择 + 轮次说明 -->
    <TaskReturnDialog
      v-model="returnDialogVisible"
      v-model:target="returnTargetNodeId"
      v-model:comment="returnComment"
      :targets="returnTargets"
      :submitting="returnSubmitting"
      @confirm="confirmReturn"
    />

    <!-- 催办弹窗（设计 273:2025）：说明 + 催办留言（可空）；与转办等同构 640 宽 / 80×32 底栏 -->
    <TaskUrgeDialog
      v-model="urgeDialogVisible"
      v-model:recipient-ids="urgeRecipientIds"
      v-model:message="urgeMessage"
      :recipient-options="urgeRecipientOptions"
      @confirm="confirmUrge"
    />

    <!-- 校验提示弹窗（设计 300:1808）：必填缺失清单（红条目 + 说明行） -->
    <TaskValidationDialog v-model="validationDialogVisible" :items="validationItems" />
  </div>
</template>

<style scoped>
/* 0.1.7 #18：全屏数据表单画布——不渲染通用侧边栏与页面自有顶栏，只留左上角返回箭头 */
.task-detail {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  overflow-y: auto;
  padding: 12px 24px 24px;
  background: var(--sw-surface-page, #f5f7fa);
}
.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  position: sticky;
  top: 0;
  z-index: 5;
  display: flex;
  align-items: center;
  padding: 4px 0 10px;
  background: var(--sw-surface-page, #f5f7fa);
}
/* 嵌入统一详情弹窗：取消整页定位，由弹窗正文滚动；操作栏仍吸底靠右。 */
.task-detail--embedded {
  position: static;
  inset: auto;
  z-index: auto;
  overflow: visible;
  padding: 0;
  background: transparent;
}
.detail-header__arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border: 1px solid var(--sw-border-base, #dcdfe6);
  border-radius: 50%;
  background: #fff;
  color: var(--sw-text-regular, #606266);
  cursor: pointer;
}
.detail-header__arrow:hover {
  color: var(--el-color-primary);
  border-color: var(--el-color-primary-light-7, #c6e2ff);
  background: var(--el-color-primary-light-9, #ecf5ff);
}
/* 0.1.7 #30 回归：内容按自然高度自上而下排列——表单卡不撑高，
   流程信息面板紧贴表单（12px），不出现中间大块空白。 */
.task-main {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 0 0 auto;
}
/* W-b：页面为 flex 列容器，el-card 默认可被压缩且 overflow 裁切，
   流程信息/操作卡按自然高度参与滚动，不随 1440×900 视口被压扁。 */
.task-detail :deep(.instance-flow-panel),
.task-detail :deep(.detail-card--actions) {
  flex: 0 0 auto;
  margin-top: 12px;
}
.detail-card {
  margin-bottom: 0;
}
.detail-card :deep(.el-card__body) {
  padding: 28px 24px 24px;
}
/* 数据表单画布：24 栅格与设计器同构（0.1.7 #18） */
.form-canvas {
  min-height: 120px;
}
.form-canvas__grid {
  display: grid;
  grid-template-columns: repeat(24, minmax(0, 1fr));
  gap: 12px 16px;
}
.form-canvas__field {
  min-width: 0;
}
/* 数据表单与发起页同款（V012-BUG-013）：字段名在上，值落入带边框灰底只读盒 */
.data-rows {
  margin-top: -10px;
  display: flex;
  flex-direction: column;
}
.data-row {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 14px;
  padding: 0;
  font-size: 13px;
}
.data-row:last-child {
  margin-bottom: 0;
}
.data-row__label {
  color: var(--sw-text-secondary);
}
.data-row__value {
  box-sizing: border-box;
  min-height: 40px;
  padding: 9px 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: 4px;
  background: #f3f4f8;
  color: #17213a;
  line-height: 20px;
  word-break: break-all;
  white-space: pre-wrap;
}
/* 设计（节点20）：附件值呈现为图标+主色链接样式 */
.data-row__file {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--sw-color-primary);
}
/* 设计（节点20）：标题行状态标签为品牌紫底 */
/* X1：操作卡固定在**视口底部**（不是内容流末端）——页面滚到任何位置都不盖住
   表单内容；滚动容器按实测高度预留 padding-bottom，滚到底时明细最后一行
   完整露出在操作卡上方。表格贴条形按钮区，卡片不再悬浮在页面中部。 */
.detail-card--actions {
  position: fixed;
  left: 24px;
  right: 24px;
  bottom: 0;
  z-index: 5;
  border-radius: 8px 8px 0 0;
  box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.08);
}
/* 嵌入统一详情弹窗：由弹窗正文滚动，操作栏回到容器内吸底。 */
.task-detail--embedded .detail-card--actions {
  position: sticky;
  left: auto;
  right: auto;
  bottom: 0;
  border-radius: 0 0 8px 8px;
}
.detail-actions__title {
  color: var(--sw-color-primary);
  font-size: 13px;
  font-weight: 600;
}
/* 审批操作栏收敛为紧凑尺寸；按钮宽度跟随文字，整体靠右。 */
.detail-card--actions :deep(.el-button) {
  flex: 0 0 auto;
  width: auto;
  min-width: 0;
  height: 30px;
  padding: 0 12px;
  font-size: 13px;
  justify-content: center;
}
.detail-card--actions :deep(.el-select__wrapper) {
  min-height: 30px;
}
.detail-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.opinion-input {
  box-sizing: border-box;
  width: 100%;
  padding: 8px;
  border: 1px solid var(--sw-border-base);
  border-radius: var(--sw-radius-base);
  resize: vertical;
}
.opinion-draft-actions {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 4px 0 12px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
/* 审批详情列表：按节点分组 */
.people-group {
  margin-bottom: 18px;
}
.people-group__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  padding: 8px 12px;
  border-radius: var(--sw-radius-base);
  background: var(--sw-fill-base);
}
.people-group__name {
  font-size: 13px;
  font-weight: 600;
  color: var(--sw-text-primary);
}
.people-group__pending {
  font-size: 12px;
  color: #a5adbe;
}

.p53-reject-action,
.p53-reject-action :deep(span) {
  color: #ef5d71 !important;
  --el-button-text-color: #ef5d71;
}
.task-detail :deep(.p53-sign-dialog) {
  margin-top: 207px !important;
  border-radius: 14px;
}
.task-detail :deep(.p53-sign-dialog.el-dialog) {
  padding: 0;
}
.task-detail :deep(.p53-sign-dialog .el-dialog__header) {
  box-sizing: border-box;
  min-height: 88px;
  padding: 22px 27px 12px;
  margin-right: 0;
  border-bottom: 1px solid var(--sw-border-light);
}
.p53-sign-dialog__head h2 {
  margin: 0;
  font-size: 20px;
  color: var(--sw-text-primary);
}
.p53-sign-dialog__head p {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
.task-detail :deep(.p53-sign-dialog .el-dialog__body) {
  max-height: 460px;
  padding: 17px 27px 0;
  overflow: auto;
}
.p53-sign-summary {
  margin: 0 0 27px;
  font-size: 15px;
  color: var(--sw-color-primary);
}
.p53-sign-table :deep(.el-table__header-wrapper th) {
  height: 50px;
  background: var(--sw-fill-base);
  color: var(--sw-text-secondary);
  font-weight: 400;
}
.p53-sign-table :deep(.el-table__header-wrapper .cell) {
  padding-left: 21px;
  line-height: 20px;
  transform: translateY(4px);
}
.p53-sign-table :deep(.el-table__body td) {
  height: 74px;
}
.p53-sign-table :deep(.p53-sign-time) {
  display: block;
  white-space: pre-line;
  line-height: 20px;
}
.p53-sign-table :deep(.el-button) {
  width: 76px;
  height: 26px;
  padding: 0;
}
.task-detail :deep(.p53-sign-dialog .el-dialog__footer) {
  display: flex;
  justify-content: flex-end;
  padding: 0 27px 23px;
}
.p53-sign-note {
  margin: 27px 0 0;
  font-size: 12px;
  color: var(--sw-text-secondary);
}
/* 窄屏双栏退化为单列（方向 §4.5：不留裁切） */
@media (max-width: 991px) {
  .task-main {
    grid-template-columns: 1fr;
  }
}
/* 设计 272:1746 驳回申请弹窗：560 宽 / 原因输入 510×32（左右内边距 25px，输入随表单整宽、
   默认尺寸 32 高）/ 底栏 取消/确定 80×32。表单已从 small 回到默认尺寸。 */
.task-detail :deep(.reject-dialog.el-dialog) {
  padding: var(--el-dialog-padding-primary) 25px;
}
.task-detail :deep(.reject-dialog .el-dialog__footer .el-button) {
  width: 80px;
  height: 32px;
}
/* 设计 272:1767 同意申请弹窗：560 宽 / 正文 14-22 / 底栏 取消·确定 80×32。 */
.task-detail :deep(.agree-dialog.el-dialog) {
  padding: var(--el-dialog-padding-primary) 25px;
}
.task-detail :deep(.agree-dialog .el-dialog__footer .el-button) {
  box-sizing: border-box;
  width: 80px;
  height: 32px;
}
/* 设计 273:1877/1901/1925/1949/2025 生命周期动作弹窗（转办/委托/沟通/加签/催办）：
   640 宽（左右 25 → 内容 590）/ 输入类控件 32 高（多行文本沿原行数）/
   底栏 取消·确定 80×32；候选与选择入口沿用 UserRemoteSelect。 */
.task-detail :deep(.action-dialog.el-dialog) {
  padding: var(--el-dialog-padding-primary) 25px;
}
.task-detail :deep(.action-dialog .el-form-item__label) {
  height: 22px;
  line-height: 22px;
  margin-bottom: 6px;
}
.task-detail :deep(.action-dialog .el-select__wrapper),
.task-detail :deep(.action-dialog .el-input__wrapper) {
  box-sizing: border-box;
  min-height: 32px;
  height: 32px;
}
/* Q61（273:1925）/Q65（273:2025）：沟通内容/催办留言视觉外框 32 高，长文本在框内滚动不丢值 */
.task-detail :deep(.action-dialog .el-textarea__inner) {
  box-sizing: border-box;
  height: 32px;
  min-height: 32px;
  padding: 5px 11px;
  overflow-y: auto;
}
.task-detail :deep(.action-dialog .el-dialog__footer .el-button) {
  box-sizing: border-box;
  width: 80px;
  height: 32px;
}
</style>

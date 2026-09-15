<script setup lang="ts">
/* global HTMLElement, SVGElement, SVGSVGElement, WheelEvent, PointerEvent, DragEvent, KeyboardEvent, MouseEvent, window, document */
/**
 * ProcessDesigner — 第一方流程设计器页（I3 §4.1：节点拖入/移动/连线/选择/删除/
 * 属性配置/缩放平移适配/撤销/保存/校验/发布/错误定位）。
 *
 * 节点面板与配置字段全部来自统一节点能力端点的服务端契约；
 * 前端不维护平行节点目录，也不解释引擎私有格式。
 * 图契约 = ProcessGraph（contractVersion=2 显式坐标），保存/校验/发布/查看同权威。
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  getProcessDefDefinition,
  getProcessNodeCapabilities,
  saveProcessDefGraph,
  publishProcessDef,
  validateProcessDefGraph,
} from '@/modules/workflow/api'
import type { GraphValidationError } from '@/modules/workflow/api'
import type { BpmNodeCapability } from '@/contracts/bpm-node'
import type { ProcessGraphDocument } from '@/contracts/process-graph'
import {
  createDesignerModel,
  NODE_HEIGHT,
  NODE_WIDTH,
  buildEdgePath,
} from '@/adapters/process-graph'
import type { DesignerModel, PositionedNode } from '@/adapters/process-graph'

const route = useRoute()
const router = useRouter()
const defId = computed(() => String(route.params.defId))

const loading = ref(false)
const errorMsg = ref('')
const graph = ref<ProcessGraphDocument | null>(null)
const capabilities = ref<BpmNodeCapability[]>([])

let model: DesignerModel | null = null
const version = ref(0) // 触发视图刷新的快照 serial

const SNAP_X = 20
const SNAP_Y = 20

function snapshot() {
  version.value++
}

/* ─────────── 画布视口 ─────────── */
const CANVAS_W = 1200
const CANVAS_H = 620
const viewBox = ref({ x: -40, y: -40, w: CANVAS_W, h: CANVAS_H })
const panSession = ref<{
  px: number
  py: number
  vb: { x: number; y: number; w: number; h: number }
} | null>(null)

function screenToGraph(event: MouseEvent): { x: number; y: number } {
  const svgEl = svgRef.value
  if (!svgEl) return { x: 0, y: 0 }
  const rect = svgEl.getBoundingClientRect()
  return {
    x: viewBox.value.x + ((event.clientX - rect.left) / rect.width) * viewBox.value.w,
    y: viewBox.value.y + ((event.clientY - rect.top) / rect.height) * viewBox.value.h,
  }
}

function zoomView(factor: number) {
  const current = viewBox.value
  const cx = current.x + current.w / 2
  const cy = current.y + current.h / 2
  const w = Math.min(6000, Math.max(240, current.w * factor))
  const h = (w / current.w) * current.h
  viewBox.value = { x: cx - w / 2, y: cy - h / 2, w, h }
}

function fitViewport() {
  if (!model) return
  const state0 = model.state()
  const xs = state0.nodes.map((n) => n.x)
  const ys = state0.nodes.map((n) => n.y)
  if (!xs.length) {
    viewBox.value = { x: -40, y: -40, w: CANVAS_W, h: CANVAS_H }
    return
  }
  const pad = 80
  const w = Math.max(Math.max(...xs) - Math.min(...xs) + pad * 2, 320)
  const h = Math.max(Math.max(...ys) - Math.min(...ys) + pad * 2, 240)
  const ratio = Math.min(CANVAS_W / w, CANVAS_H / h)
  const vw = CANVAS_W / ratio
  const vh = CANVAS_H / ratio
  viewBox.value = {
    x: (Math.min(...xs) + Math.max(...xs)) / 2 - vw / 2,
    y: (Math.min(...ys) + Math.max(...ys)) / 2 - vh / 2,
    w: vw,
    h: vh,
  }
}

const svgRef = ref<SVGSVGElement | null>(null)

/* ─────────── 节点/连线交互状态 ─────────── */

const selectionId = ref<string | null>(null)
const dragState = ref<{ id: string; dx: number; dy: number; type: 'node' | 'edge' } | null>(null)
const pendingConnectNode = ref<string | null>(null)
const pendingConnectPos = ref<{ x: number; y: number } | null>(null)
const pendingConnectTarget = ref<{ x: number; y: number } | null>(null)
/** 点选式连线的起点屏幕坐标（区分“点了锚”与“拖了线”）。 */
const pendingConnectStartScreen = ref<{ x: number; y: number } | null>(null)

function onWheel(event: WheelEvent) {
  event.preventDefault()
  zoomView(event.deltaY > 0 ? 1.1 : 1 / 1.1)
}

function onBgPointerDown(event: PointerEvent) {
  const target = event.target as SVGElement
  if (target.tagName === 'svg' || target.classList.contains('pg-bg')) {
    pendingConnectNode.value = null
    pendingConnectTarget.value = null
    pendingConnectStartScreen.value = null
    model?.select(null)
    panSession.value = { px: event.clientX, py: event.clientY, vb: { ...viewBox.value } }
  }
}

function onPointerMove(event: PointerEvent) {
  if (panSession.value) {
    const svgEl = svgRef.value
    if (!svgEl) return
    const rect = svgEl.getBoundingClientRect()
    const ratio = panSession.value.vb.w / rect.width
    viewBox.value = {
      ...panSession.value.vb,
      x: panSession.value.vb.x - (event.clientX - panSession.value.px) * ratio,
      y: panSession.value.vb.y - (event.clientY - panSession.value.py) * ratio,
    }
    return
  }
  // 拖动节点
  if (dragState.value && model) {
    const point = screenToGraph(event)
    const snapped = {
      x: Math.round(point.x / SNAP_X) * SNAP_X,
      y: Math.round(point.y / SNAP_Y) * SNAP_Y,
    }
    model.moveNode(dragState.value?.id ?? '', snapped.x, snapped.y)
    snapshot()
    return
  }
  // 连线拖拽：跟随指针更新预览终点
  if (pendingConnectNode.value) {
    pendingConnectTarget.value = screenToGraph(event)
  }
}

function clickedOnSourcePort(start: { x: number; y: number } | null, event: PointerEvent): boolean {
  return !!start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 6
}

/** 统一落点判定：DOM 命中优先，透明命中路径遮挡时回退图坐标就近节点（60px）。 */
function resolveConnectDropTarget(event: PointerEvent): string | null {
  if (!model) return null
  const element = document.elementFromPoint(event.clientX, event.clientY)
  const domTarget = element?.closest('g[data-node-id]')?.getAttribute('data-node-id') ?? null
  if (domTarget) return domTarget
  const svgEl = svgRef.value
  if (!svgEl) return null
  const rect = svgEl.getBoundingClientRect()
  const point = {
    x: viewBox.value.x + ((event.clientX - rect.left) / rect.width) * viewBox.value.w,
    y: viewBox.value.y + ((event.clientY - rect.top) / rect.height) * viewBox.value.h,
  }
  let bestDistance = Number.MAX_SAFE_INTEGER
  let target: string | null = null
  for (const node of model.state().nodes) {
    const distance = Math.hypot(node.x - point.x, node.y - point.y)
    if (distance < 60 && distance < bestDistance) {
      bestDistance = distance
      target = node.id
    }
  }
  return target
}

function onPointerUp(event: PointerEvent) {
  // 连线落点统一判定（拖放与 sticky 点选共用）：
  // 命中其他节点 → 建立连线；仍点在源锚上 → sticky 挂起；其余 → 取消
  if (pendingConnectNode.value && model) {
    const onSourcePort = clickedOnSourcePort(pendingConnectStartScreen.value, event)
    const targetId = resolveConnectDropTarget(event)
    if (targetId && targetId !== pendingConnectNode.value) {
      model.connect(pendingConnectNode.value, targetId)
      pendingConnectNode.value = null
      pendingConnectTarget.value = null
      pendingConnectStartScreen.value = null
      snapshot()
    } else if (onSourcePort) {
      // sticky：保持挂起，等待目标节点点击
    } else {
      pendingConnectNode.value = null
      pendingConnectTarget.value = null
      pendingConnectStartScreen.value = null
    }
  }
  panSession.value = null
  dragState.value = null
}

function selectNode(id: string | null) {
  selectionId.value = id
  model?.select(id)
}

const canvasNodes = computed(() => {
  void version.value
  return (model?.state().nodes ?? []) as PositionedNode[]
})
const canvasEdges = computed(() => {
  void version.value
  return model?.state().edges ?? []
})

function startNodeDrag(event: PointerEvent, node: PositionedNode) {
  const point = screenToGraph(event)
  dragState.value = { id: node.id, dx: point.x - node.x, dy: point.y - node.y, type: 'node' }
  selectNode(node.id)
}

function onNodePointerUp(event: PointerEvent, node: PositionedNode) {
  // 连线拖拽（pending 模式）结束时落到节点 → connect
  if (pendingConnectNode.value && pendingConnectNode.value !== node.id && model) {
    model.connect(pendingConnectNode.value, node.id)
    pendingConnectNode.value = null
    pendingConnectPos.value = null
    pendingConnectTarget.value = null
    pendingConnectStartScreen.value = null
    snapshot()
  }
  void event
}

/** 从节点右侧连接锚发起连线（§4.1 连线建立）。
 * 双模式：拖到目标节点放下，或点击锚后（sticky）再点击目标节点完成连接。 */
function startConnect(event: PointerEvent, node: PositionedNode) {
  event.stopPropagation()
  const point = screenToGraph(event)
  pendingConnectNode.value = node.id
  pendingConnectPos.value = { x: node.x, y: node.y }
  pendingConnectTarget.value = point
  pendingConnectStartScreen.value = { x: event.clientX, y: event.clientY }
}

/** 点击连线选中（删除所选可移除）。 */
function selectEdge(event: PointerEvent, edgeId: string) {
  event.stopPropagation()
  selectionId.value = edgeId
  model?.select(edgeId)
}

/* ─────────── 面板/属性 ─────────── */

const selectedNode = computed(() =>
  selectionId.value ? (canvasNodes.value.find((n) => n.id === selectionId.value) ?? null) : null,
)
/** 能力 configFields → 表单草稿（object 类型拆 participant.strategy/value） */
const propForm = ref<Record<string, unknown>>({})

watch(selectedNode, (node) => {
  // object 类型字段（configFields.type === 'object'）回显为 JSON 文本，
  // 避免输入框显示 [object Object]；applyProps 提交前解析回对象。
  if (!node) {
    propForm.value = {}
    return
  }
  const draft: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(node.config ?? {})) {
    const field = selectedCapability.value?.configFields.find((f) => f.key === key)
    draft[key] =
      field?.type === 'object' && value !== null && typeof value === 'object'
        ? JSON.stringify(value)
        : value
  }
  propForm.value = draft
})

function applyProps() {
  if (!selectedNode.value || !model) return
  const patch: Record<string, unknown> = { ...propForm.value }
  // object 类型字段以 JSON 文本编辑，提交前解析回对象（服务端契约要求对象形态）
  for (const field of selectedCapability.value?.configFields ?? []) {
    const raw = patch[field.key]
    if (field.type === 'object' && typeof raw === 'string') {
      try {
        patch[field.key] = JSON.parse(raw) as unknown
      } catch {
        // 保留字符串，由服务端校验报错（错误定位回画布）
      }
    }
  }
  model.updateNodeConfig(selectedNode.value.id, patch)
  ElMessage.success('属性已更新（保存后生效）')
}

function removeSelected() {
  if (!model || !selectionId.value) return
  model.removeSelection()
  selectionId.value = null
  snapshot()
}

function undoEdit() {
  model?.undo()
  selectionId.value = null
  snapshot()
}

interface PaletteDrag {
  capability: BpmNodeCapability
}

function onPaletteDragStart(event: DragEvent, capability: BpmNodeCapability) {
  const drag: PaletteDrag = { capability }
  event.dataTransfer?.setData('application/json', JSON.stringify(drag))
}

function onCanvasDrop(event: DragEvent) {
  event.preventDefault()
  const raw = event.dataTransfer?.getData('application/json')
  if (!raw) return
  let capability: BpmNodeCapability | null
  try {
    capability = (JSON.parse(raw) as PaletteDrag).capability ?? null
  } catch {
    capability = null
  }
  if (!capability || !model) return
  const point = screenToGraph(event)
  const x = Math.round(point.x / SNAP_X) * SNAP_X
  const y = Math.round(point.y / SNAP_Y) * SNAP_Y
  const id = model.addNode(capability.type, capability.displayName, x, y)
  selectNode(id)
  snapshot()
}

/* ─────────── 保存 / 校验 / 发布 ─────────── */

const saving = ref(false)
const validating = ref(false)
const publishing = ref(false)
const validationErrors = ref<GraphValidationError[]>([])

async function save() {
  if (!model || !graph.value || !defId.value) return
  saving.value = true
  errorMsg.value = ''
  try {
    await saveProcessDefGraph(defId.value, model.serialize())
    ElMessage.success('草稿已保存')
  } catch (err) {
    errorMsg.value = (err as { msg?: string }).msg ?? '保存失败'
  } finally {
    saving.value = false
  }
}

async function validate() {
  if (!model || !defId.value) return
  validating.value = true
  validationErrors.value = []
  try {
    // 先保存草稿再校验，保证服务端查询到最新图
    await saveProcessDefGraph(defId.value, model.serialize())
    validationErrors.value = await validateProcessDefGraph(defId.value)
    if (validationErrors.value.length === 0) {
      ElMessage.success('校验通过：可判定错误 0 条')
    }
  } catch (err) {
    errorMsg.value = (err as { msg?: string }).msg ?? '校验失败'
  } finally {
    validating.value = false
  }
}

async function publish() {
  if (!defId.value) return
  try {
    await ElMessageBox.confirm(
      '发布将按服务端完整校验冻结当前草稿为新版本；任何校验错误都会零部署拒绝。继续？',
      '发布确认',
      { confirmButtonText: '确定发布', cancelButtonText: '取消', type: 'warning' },
    )
  } catch {
    return
  }
  publishing.value = true
  try {
    await publishProcessDef(defId.value)
    ElMessage.success('发布成功：图、节点配置、表单与函数版本已冻结')
    await load()
  } catch (err) {
    ElMessage.error((err as { msg?: string }).msg ?? '发布失败（零部署）')
  } finally {
    publishing.value = false
  }
}

/** 错误定位：聚焦错误对象（节点/边居中并高亮选择）。 */
function focusError(error: GraphValidationError) {
  const elementId = error.nodeKey ?? error.edgeKey ?? error.elementId ?? ''
  if (!elementId) return
  if (error.edgeKey) {
    selectionId.value = null
    return
  }
  selectNode(elementId)
  const node = canvasNodes.value.find((n) => n.id === elementId)
  if (node) {
    const current = viewBox.value
    viewBox.value = {
      ...current,
      x: node.x - current.w / 2,
      y: node.y - current.h / 2,
    }
  }
}

/* ─────────── 参与人策略（来源：服务端能力 validation.strategies，非前端手抄） ─────────── */

const selectedCapability = computed(() => {
  const node = selectedNode.value as PositionedNode | null
  return node ? (capabilities.value.find((cap) => cap.type === node.type) ?? null) : null
})

const canUndoFlag = computed(() => {
  void version.value
  return model != null && model.canUndo()
})

/* ─────────── 加载 ─────────── */

async function load() {
  loading.value = true
  errorMsg.value = ''
  try {
    const [definition, caps] = await Promise.all([
      getProcessDefDefinition(defId.value),
      getProcessNodeCapabilities(),
    ])
    capabilities.value = caps
    graph.value = {
      processKey: definition.processKey,
      name: definition.name ?? '',
      formKey: definition.formKey ?? '',
      version: definition.version,
      contractVersion: (definition as { contractVersion?: number }).contractVersion,
      elements: (definition.elements ??
        []) as import('@/contracts/process-graph').ProcessGraphElement[],
      canvas: definition.canvas ?? {},
    }
    await nextTick()
    if (!graph.value) {
      errorMsg.value = '流程定义图数据为空'
      return
    }
    model = createDesignerModel(graph.value)
    selectNode(null)
    snapshot()
    fitViewport()
  } catch (err) {
    errorMsg.value = (err as { msg?: string }).msg ?? '加载流程定义失败'
  } finally {
    loading.value = false
  }
}

watch(defId, () => void load(), { immediate: true })

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
})

function onKeydown(event: KeyboardEvent) {
  if ((event.target as HTMLElement)?.tagName?.match?.(/input|textarea|select/i)) return
  if (event.key === 'Delete' || event.key === 'Backspace') {
    if (selectionId.value) {
      event.preventDefault()
      removeSelected()
    }
  }
}

function backToList() {
  router.push('/workflow/defs')
}
</script>

<template>
  <div class="designer-page">
    <div class="designer-toolbar">
      <el-button size="small" @click="backToList">返回定义列表</el-button>
      <el-divider direction="vertical" />
      <span class="designer-title">{{ graph?.name ?? '流程设计器' }}</span>
      <span class="designer-key">{{ graph?.processKey ? `(${graph.processKey})` : '' }}</span>
      <el-tag v-if="graph?.version" size="small" type="info" class="designer-version">
        草稿版本 v{{ graph.version }}
      </el-tag>
      <span class="spacer" />
      <el-button size="small" :disabled="!canUndoFlag" @click="undoEdit">撤销</el-button>
      <el-button size="small" type="warning" :disabled="!selectionId" @click="removeSelected">
        删除所选
      </el-button>
      <el-button size="small" @click="fitViewport">适配</el-button>
      <el-button size="small" :loading="validating" @click="validate">校验</el-button>
      <el-button size="small" type="primary" :loading="saving" @click="save">保存草稿</el-button>
      <el-button size="small" type="success" :loading="publishing" @click="publish">发布</el-button>
    </div>

    <el-alert
      v-if="errorMsg"
      :title="errorMsg"
      type="error"
      :closable="false"
      show-icon
      class="designer-alert"
    />

    <div class="designer-body">
      <!-- 节点面板：只展示统一能力端点声明为可设计的节点 -->
      <div class="designer-palette">
        <div class="palette-title">节点（来自服务端能力契约）</div>
        <div
          v-for="cap in capabilities"
          :key="cap.type"
          class="palette-item"
          draggable="true"
          @dragstart="onPaletteDragStart($event, cap)"
        >
          <span class="palette-name">{{ cap.displayName }}</span>
          <span class="palette-type">{{ cap.type }}</span>
        </div>
      </div>

      <!-- 画布 -->
      <div class="designer-canvas-wrap">
        <svg
          ref="svgRef"
          class="pg-svg"
          :width="'100%'"
          :height="'100%'"
          :viewBox="`${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}`"
          @wheel="onWheel"
          @pointerdown="onBgPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
          @dragover.prevent
          @drop="onCanvasDrop"
        >
          <rect class="pg-bg" x="0" y="0" width="100000" height="100000" />
          <template v-for="edge in canvasEdges" :key="edge.id">
            <path
              :d="edge.path"
              fill="none"
              class="designer-edge"
              :class="{ 'designer-edge-selected': selectionId === edge.id }"
              stroke-width="10"
              stroke="transparent"
              @pointerdown.stop="selectEdge($event, edge.id)"
            />
            <path
              :d="edge.path"
              fill="none"
              class="designer-edge-visual"
              :class="{ 'designer-edge-selected': selectionId === edge.id }"
              stroke-width="2"
              pointer-events="none"
            />
          </template>
          <path
            v-if="pendingConnectTarget"
            :d="
              buildEdgePath(
                { x: pendingConnectPos?.x ?? 0, y: pendingConnectPos?.y ?? 0 },
                { x: pendingConnectTarget.x, y: pendingConnectTarget.y },
                [],
              )
            "
            fill="none"
            class="designer-edge-pending"
            stroke-dasharray="6 4"
          />
          <g
            v-for="node in canvasNodes"
            :key="node.id"
            :transform="`translate(${node.x - NODE_WIDTH / 2}, ${node.y - NODE_HEIGHT / 2})`"
            class="designer-node"
            :class="{
              'designer-node-selected': selectionId === node.id,
              'designer-node-error': validationErrors.some((e) => e.nodeKey === node.id),
            }"
            :data-node-id="node.id"
            @pointerdown="startNodeDrag($event, node)"
            @pointerup="onNodePointerUp($event, node)"
          >
            <rect :width="NODE_WIDTH" :height="NODE_HEIGHT" rx="8" class="designer-node-rect" />
            <circle
              :cx="NODE_WIDTH"
              :cy="NODE_HEIGHT / 2"
              r="6"
              class="designer-node-port"
              @pointerdown.stop="startConnect($event, node)"
            />
            <text
              :x="NODE_WIDTH / 2"
              :y="NODE_HEIGHT / 2 - 4"
              text-anchor="middle"
              class="designer-node-label"
            >
              {{ node.label }}
            </text>
            <text
              :x="NODE_WIDTH / 2"
              :y="NODE_HEIGHT / 2 + 14"
              text-anchor="middle"
              class="designer-node-type"
            >
              {{ node.type }}
            </text>
          </g>
        </svg>
      </div>

      <!-- 属性面板：字段由服务端能力 configFields + 参与人策略驱动 -->
      <div class="designer-props">
        <template v-if="selectedNode">
          <div class="props-title">{{ selectedNode.label }}（{{ selectedNode.type }}）</div>
          <el-form label-position="top" size="small">
            <el-form-item label="节点名称">
              <el-input v-model="propForm.name as string" @change="applyProps" />
            </el-form-item>
            <template v-for="field in selectedCapability?.configFields ?? []" :key="field.key">
              <el-form-item v-if="field.type === 'object'" :label="field.label">
                <el-input
                  v-model="propForm[field.key] as string"
                  placeholder="对象配置（JSON 文本）"
                  @change="applyProps"
                  @blur="applyProps"
                />
              </el-form-item>
              <el-form-item v-else-if="field.type === 'string'" :label="field.label">
                <el-input
                  v-model="propForm[field.key] as string"
                  @change="applyProps"
                  @blur="applyProps"
                />
              </el-form-item>
              <el-form-item v-else :label="field.label">
                <el-input
                  v-model="propForm[field.key] as string"
                  @change="applyProps"
                  @blur="applyProps"
                />
              </el-form-item>
            </template>
            <el-form-item
              v-if="validationErrors.some((e) => e.nodeKey === selectionId)"
              label="校验问题"
            >
              <el-alert
                v-for="err in validationErrors.filter((e) => e.nodeKey === selectionId)"
                :key="String(err.nodeKey) + err.errorCode"
                type="error"
                :closable="false"
                :title="err.message"
              />
            </el-form-item>
          </el-form>
        </template>
        <el-empty v-else description="选择或拖入节点后配置属性" />
      </div>
    </div>

    <!-- 校验错误面板（含 nodeKey/edgeKey 定位入口） -->
    <el-card v-if="validationErrors.length" class="designer-errors">
      <template #header
        ><span>校验结果：{{ validationErrors.length }} 条可判定错误</span></template
      >
      <div v-for="(err, index) in validationErrors" :key="index" class="designer-error-row">
        <el-tag size="small" type="danger">{{ err.errorCode }}</el-tag>
        <span class="error-message">{{ err.message }}</span>
        <el-button size="small" link type="primary" @click="focusError(err)">
          定位 {{ err.nodeKey ?? err.edgeKey ?? '-' }}
        </el-button>
      </div>
    </el-card>
  </div>
</template>

<style scoped>
.designer-page {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 120px);
  min-height: 560px;
}
.designer-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--el-border-color-light);
}
.designer-title {
  font-size: 16px;
  font-weight: 600;
  color: var(--el-color-primary);
}
.designer-key,
.designer-version {
  color: #909399;
  font-size: 13px;
}
.spacer {
  flex: 1;
}
.designer-alert {
  margin: 8px 12px;
}
.designer-body {
  display: flex;
  flex: 1;
  min-height: 0;
}
.designer-palette {
  width: 200px;
  border-right: 1px solid var(--el-border-color-light);
  overflow: auto;
  padding: 8px;
}
.palette-title {
  font-size: 12px;
  color: #909399;
  margin-bottom: 8px;
}
.palette-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 10px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  margin-bottom: 8px;
  cursor: grab;
  background: #fff;
  font-size: 13px;
}
.palette-item:active {
  cursor: grabbing;
}
.palette-name {
  font-weight: 500;
}
.palette-type {
  font-size: 11px;
  color: #909399;
}
.designer-canvas-wrap {
  flex: 1;
  min-width: 0;
}
.pg-bg {
  fill: #fafafa;
}
.designer-node .designer-node-rect {
  fill: #fff;
  stroke: var(--el-border-color);
  stroke-width: 1.5;
}
.designer-node-selected .designer-node-rect {
  fill: var(--el-color-primary-light-9);
  stroke: var(--el-color-primary);
  stroke-width: 2.5;
}
.designer-node-error .designer-node-rect {
  stroke: var(--el-color-danger);
  stroke-width: 2.5;
}
.designer-node {
  cursor: move;
}
.designer-node-label {
  font-size: 13px;
  font-weight: 500;
  fill: #303133;
  pointer-events: none;
}
.designer-node-type {
  font-size: 11px;
  fill: #909399;
  pointer-events: none;
}
.designer-edge {
  cursor: pointer;
  /* stroke="transparent" 不参与 visiblePainted 命中；显式按描边命中 */
  pointer-events: stroke;
}
.designer-edge-visual {
  stroke: var(--el-border-color);
  pointer-events: none;
}
.designer-node-port {
  fill: var(--el-color-primary);
  stroke: #fff;
  stroke-width: 1.5;
  cursor: crosshair;
}
.designer-edge-selected {
  stroke: var(--el-color-primary);
  stroke-width: 3;
}
.designer-edge-pending {
  stroke: var(--el-color-warning);
}
.designer-props {
  width: 280px;
  border-left: 1px solid var(--el-border-color-light);
  padding: 10px;
  overflow: auto;
}
.props-title {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 8px;
}
.designer-errors {
  max-height: 180px;
  overflow: auto;
  margin: 0 12px 8px;
}
.designer-error-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter);
  font-size: 13px;
}
</style>

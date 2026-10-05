import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { i18n } from '@/locales'
import { createPinia } from 'pinia'

// request 桩：按 (method, url) 路由返回；组件直接调用 request 拉 defs 与保存 action
vi.mock('@/foundation/request', () => ({
  request: vi.fn(),
  ApiError: class MockApiError extends Error {
    code: number
    msg: string
    constructor(code: number, msg: string) {
      super(msg)
      this.code = code
      this.msg = msg
    }
  },
}))

vi.mock('../api', () => ({
  listEligibleDevices: vi.fn(),
}))

vi.mock('element-plus', async (importOriginal) => {
  const actual = await importOriginal()
  return {
    ...(actual as object),
    ElMessage: {
      success: vi.fn(),
      error: vi.fn(),
      warning: vi.fn(),
    },
  }
})

import { request } from '@/foundation/request'
import { listEligibleDevices } from '../api'
import { ElMessage } from 'element-plus'
import IotFlowActions from './IotFlowActions.vue'

type RequestConfigLike = { url?: string; method?: string; data?: unknown }

/** 按 (method, url) 路由装配 request 返回值；POST /iot-device-action 回显写入的 action。 */
function stubRequest(baseDefs: unknown[]) {
  vi.mocked(request).mockImplementation((async (config: unknown) => {
    const cfg = (config ?? {}) as RequestConfigLike
    const method = cfg.method ?? 'GET'
    const url = cfg.url ?? ''
    if (method === 'POST' && url.includes('/iot-device-action')) {
      const action = (cfg.data as { action?: unknown } | undefined)?.action
      return { id: 1, iotDeviceActionJson: JSON.stringify(action ?? null) }
    }
    return { records: baseDefs }
  }) as unknown as typeof request)
}

/** 已发布且允许 IoT 接入的模板行（未配置设备动作）。 */
function defRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    processKey: 'leave_approval',
    name: '请假审批流程',
    status: 'PUBLISHED',
    formKey: 'leave-request',
    iotAccessEnabled: true,
    iotDeviceActionJson: null,
    ...overrides,
  }
}

/** 已存 RESERVATION 配置的模板行（回显用）。 */
function reservationDefRow() {
  return defRow({
    id: 2,
    processKey: 'contract_approval',
    name: '合同审批流程',
    formKey: 'contract-approval',
    iotDeviceActionJson: JSON.stringify({
      enabled: true,
      deviceSource: 'FIXED',
      deviceId: 11,
      commandKey: 'iot_action',
      failurePolicy: 'BLOCK',
      deliveryMode: 'RESERVATION',
      reservation: {
        dueField: 'plan_start_time',
        timezoneId: 'Asia/Shanghai',
        lateWindowSeconds: 120,
      },
    }),
  })
}

const stubs = {
  ListActionsColumn: { template: '<div/>', props: ['actions', 'width'] },
  ListPagination: { template: '<div/>', props: ['total', 'pageNum', 'pageSize'] },
  'el-table': { template: '<div><slot/></div>', props: ['data'] },
  'el-table-column': { template: '<div/>', props: ['label', 'prop'] },
  'el-dialog': {
    template: '<div v-if="modelValue"><slot/><slot name="footer"/></div>',
    props: ['modelValue'],
  },
  'el-form': { template: '<form><slot/></form>' },
  'el-form-item': { template: '<div><slot/></div>', props: ['label'] },
  'el-switch': { template: '<input type="checkbox"/>', props: ['modelValue'] },
  'el-radio-group': { template: '<div><slot/></div>', props: ['modelValue'] },
  'el-radio': { template: '<label><slot/></label>', props: ['value'] },
  'el-select': { template: '<select><slot/></select>', props: ['modelValue'] },
  'el-option': { template: '<option/>', props: ['label', 'value'] },
  'el-input': { template: '<input/>', props: ['modelValue', 'placeholder'] },
  'el-autocomplete': { template: '<input/>', props: ['modelValue', 'fetchSuggestions'] },
  'el-input-number': { template: '<input type="number"/>', props: ['modelValue', 'min', 'max'] },
  'el-alert': { template: '<div>{{ title }}</div>', props: ['title'] },
  'el-empty': { template: '<div/>', props: ['description'] },
  'el-tag': { template: '<span><slot/></span>' },
  'el-button': {
    template: '<button @click="$emit(\'click\')"><slot/></button>',
    emits: ['click'],
  },
}

interface VmLike {
  form: {
    deliveryMode: 'IMMEDIATE' | 'RESERVATION'
    reservationDueField: string
    reservationTimezone: string
    reservationLateWindow: number
    deviceId?: number
    deviceSource: string
  }
  openEdit: (row: unknown) => void
  save: () => Promise<void>
}

async function mountPage(defs: unknown[]) {
  stubRequest(defs)
  vi.mocked(listEligibleDevices).mockResolvedValue([])
  const wrapper = mount(IotFlowActions, {
    global: { plugins: [i18n, createPinia()], stubs, directives: { loading: {} } },
  })
  await flushPromises()
  return wrapper
}

function postActions(): Record<string, unknown>[] {
  return vi
    .mocked(request)
    .mock.calls.filter((call) => (call[0] as RequestConfigLike).method === 'POST')
    .map(
      (call) => ((call[0] as RequestConfigLike).data as { action: Record<string, unknown> }).action,
    )
}

describe('IotFlowActions P63 下发方式配置', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('IMMEDIATE 缺省：未配置 deliveryMode 的行打开对话框回显 IMMEDIATE，保存不写 deliveryMode/reservation', async () => {
    const wrapper = await mountPage([defRow()])
    const vm = wrapper.vm as unknown as VmLike
    vm.openEdit(defRow())
    await flushPromises()

    expect(vm.form.deliveryMode).toBe('IMMEDIATE')
    vm.form.deviceId = 11
    await vm.save()

    const actions = postActions()
    expect(actions).toHaveLength(1)
    expect(actions[0]).toMatchObject({ enabled: true, deviceSource: 'FIXED', deviceId: 11 })
    // 缺省语义：既有 action JSON 零变化，不新增 P63 字段
    expect(actions[0].deliveryMode).toBeUndefined()
    expect(actions[0].reservation).toBeUndefined()
    expect(ElMessage.success).toHaveBeenCalled()
  })

  it('预约下发：填写预约配置随 action 保存，迟到秒数收敛到 1-3600', async () => {
    const wrapper = await mountPage([defRow()])
    const vm = wrapper.vm as unknown as VmLike
    vm.openEdit(defRow())
    await flushPromises()

    vm.form.deliveryMode = 'RESERVATION'
    vm.form.reservationDueField = ' plan_start_time '
    vm.form.reservationTimezone = 'Asia/Tokyo'
    vm.form.reservationLateWindow = 5000
    vm.form.deviceId = 11
    await vm.save()

    const actions = postActions()
    expect(actions).toHaveLength(1)
    expect(actions[0].deliveryMode).toBe('RESERVATION')
    expect(actions[0].reservation).toEqual({
      // 字段名按原文去首尾空白后提交
      dueField: 'plan_start_time',
      timezoneId: 'Asia/Tokyo',
      // 服务端约束 1-3600：5000 收敛为 3600
      lateWindowSeconds: 3600,
    })
  })

  it('预约回显：已存 RESERVATION 配置打开对话框恢复字段名/时区/迟到窗口', async () => {
    const row = reservationDefRow()
    const wrapper = await mountPage([row])
    const vm = wrapper.vm as unknown as VmLike
    vm.openEdit(row)
    await flushPromises()

    expect(vm.form.deliveryMode).toBe('RESERVATION')
    expect(vm.form.reservationDueField).toBe('plan_start_time')
    expect(vm.form.reservationTimezone).toBe('Asia/Shanghai')
    expect(vm.form.reservationLateWindow).toBe(120)
  })

  it('预约下发缺预约时间字段：提示且不提交', async () => {
    const wrapper = await mountPage([defRow()])
    const vm = wrapper.vm as unknown as VmLike
    vm.openEdit(defRow())
    await flushPromises()

    vm.form.deliveryMode = 'RESERVATION'
    vm.form.reservationDueField = '   '
    vm.form.deviceId = 11
    await vm.save()

    expect(ElMessage.warning).toHaveBeenCalled()
    expect(postActions()).toHaveLength(0)
  })
})

<script setup lang="ts">
import type { IotReservationView } from '@/adapters/iot-reservation'

/**
 * TaskIotReservationCard — P63 IoT 预约卡（实例维度）。
 *
 * 行式只读展示预约状态/时间/时区/窗口；取消入口按 v-perm 显隐，
 * 服务端仍是最终权威。取消原因的填写与提交由页面持有（TaskIotCancelDialog）。
 */
defineProps<{
  rows: IotReservationView[]
  loading: boolean
}>()

const emit = defineEmits<{
  cancel: [row: IotReservationView]
}>()

/** 预约状态中文标签与标签色：待触发/下发处理中/已下发/已取消/已过期/下发失败。 */
const RESERVATION_STATUS_META: Record<
  string,
  { label: string; tag: 'primary' | 'success' | 'info' | 'warning' | 'danger' }
> = {
  PENDING: { label: '待触发', tag: 'warning' },
  DISPATCHING: { label: '下发处理中', tag: 'primary' },
  DISPATCHED: { label: '已下发', tag: 'success' },
  CANCELED: { label: '已取消', tag: 'info' },
  EXPIRED: { label: '已过期', tag: 'info' },
  FAILED: { label: '下发失败', tag: 'danger' },
}

function reservationStatusLabel(status: string): string {
  return RESERVATION_STATUS_META[status]?.label ?? status
}

function reservationStatusTag(
  status: string,
): 'primary' | 'success' | 'info' | 'warning' | 'danger' {
  return RESERVATION_STATUS_META[status]?.tag ?? 'info'
}
</script>

<template>
  <!-- P63 IoT 预约（实例维度）：有数据才渲染；取消入口按 v-perm 显隐，服务端仍是最终权威 -->
  <el-card class="detail-card detail-card--iot-reservations">
    <template #header>
      <div class="card-head">
        <span>IoT 预约</span>
      </div>
    </template>
    <div v-loading="loading" class="iot-reservations">
      <div v-for="row in rows" :key="row.id" class="iot-reservation">
        <div class="iot-reservation__head">
          <span class="iot-reservation__device">{{ row.deviceName || row.deviceKey || '-' }}</span>
          <el-tag :type="reservationStatusTag(row.status)" size="small">
            {{ reservationStatusLabel(row.status) }}
          </el-tag>
        </div>
        <div class="iot-reservation__row">
          <span class="iot-reservation__label">预约时间</span>
          <span class="iot-reservation__value"
            >{{ row.dueLocalText || row.dueAtUtc }}（{{ row.timezoneId }}）</span
          >
        </div>
        <div class="iot-reservation__row">
          <span class="iot-reservation__label">迟到窗口</span>
          <span class="iot-reservation__value">{{ row.lateWindowSeconds }} 秒</span>
        </div>
        <div class="iot-reservation__row">
          <span class="iot-reservation__label">设备能力</span>
          <span class="iot-reservation__value"
            >{{ row.commandKey || '-' }}（{{ row.commandType || '-' }}）</span
          >
        </div>
        <div v-if="row.commandId != null" class="iot-reservation__row">
          <span class="iot-reservation__label">命令记录</span>
          <span class="iot-reservation__value"
            >命令 #{{ row.commandId }}（执行结果见「IoT 运行记录 · 设备命令」）</span
          >
        </div>
        <div v-if="row.rejectReason" class="iot-reservation__row">
          <span class="iot-reservation__label">失败原因</span>
          <span class="iot-reservation__value">{{ row.rejectReason }}</span>
        </div>
        <div v-if="row.status === 'CANCELED'" class="iot-reservation__row">
          <span class="iot-reservation__label">取消信息</span>
          <span class="iot-reservation__value">
            {{ row.cancelBy || '-'
            }}<template v-if="row.cancelTime"> · {{ row.cancelTime }}</template
            ><template v-if="row.cancelReason"> · {{ row.cancelReason }}</template>
          </span>
        </div>
        <div v-if="row.status === 'PENDING'" class="iot-reservation__actions">
          <el-button
            v-perm="'iot:reservation:cancel'"
            size="small"
            type="danger"
            plain
            @click="emit('cancel', row)"
          >
            取消预约
          </el-button>
        </div>
      </div>
    </div>
  </el-card>
</template>

<style scoped>
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 0;
}
/* ─── P63 IoT 预约卡（实例维度）：行式只读布局；双栏窄屏已随上方规则退化单列 ─── */
.iot-reservations {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.iot-reservation {
  padding: 10px 12px;
  border: 1px solid var(--sw-border-light);
  border-radius: var(--sw-radius-base);
  background: #f7fafc;
}
.iot-reservation__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}
.iot-reservation__device {
  font-size: 14px;
  font-weight: 600;
  color: #19233b;
  word-break: break-all;
}
.iot-reservation__row {
  display: flex;
  gap: 8px;
  font-size: 12px;
  line-height: 20px;
}
.iot-reservation__label {
  flex: 0 0 64px;
  color: var(--sw-text-secondary);
}
.iot-reservation__value {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--sw-text-primary);
  word-break: break-all;
  white-space: pre-wrap;
}
.iot-reservation__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
/* 窄屏（<768px）：标签与值纵向堆叠，避免长文本横向裁切 */
@media (max-width: 767px) {
  .iot-reservation__row {
    flex-direction: column;
    gap: 2px;
  }
  .iot-reservation__label {
    flex-basis: auto;
  }
}
</style>

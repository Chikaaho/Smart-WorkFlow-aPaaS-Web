/**
 * design-fixtures 各设计节点 fixture 工厂（dev-only，随 mock 模块 tree-shake）。
 *
 * 从 design-fixtures.ts 的 OVERRIDES 内联对象原样搬移；仅注入数据/状态，
 * handler 语义与惰性求值时机（返回闭包，被调用时才取数）保持不变。
 */

import { ok, type DesignMockHandler } from './design-fixtures-shared'
import {
  catalogItemRows,
  designerFormFixtures,
  processDesignerGraphFixtures,
  taskGraphPayload,
} from './design-fixtures-designer'

// 设计节点01：工作台设计密度（布局组件显隐 + 待办/已办/发起演示行与徽标计数）。
// 仅注入数据/状态；生产工作台按同一接口形状渲染。
export function node01Fixtures(): Record<string, DesignMockHandler> {
  return {
    'GET /api/system/workspace/layout': () =>
      ok({
        custom: true,
        cardTypes: [
          {
            id: 9401,
            typeCode: 'todo',
            displayName: '我的待办',
            rendererKey: 'todo',
            metadataJson: '{}',
            defaultSpan: 1,
            defaultOrder: 2,
            status: 0,
          },
          {
            id: 9402,
            typeCode: 'stats',
            displayName: '统计概览',
            rendererKey: 'stats',
            metadataJson: '{}',
            defaultSpan: 2,
            defaultOrder: 1,
            status: 0,
          },
          {
            id: 9403,
            typeCode: 'favoriteItems',
            displayName: '快捷发起',
            rendererKey: 'favorites',
            metadataJson: '{}',
            defaultSpan: 1,
            defaultOrder: 3,
            status: 0,
          },
          {
            id: 9404,
            typeCode: 'activity',
            displayName: '业务动态',
            rendererKey: 'activity',
            metadataJson: '{}',
            defaultSpan: 1,
            defaultOrder: 4,
            status: 0,
          },
          {
            id: 9405,
            typeCode: 'efficiency',
            displayName: '流程效能',
            rendererKey: 'efficiency',
            metadataJson: '{}',
            defaultSpan: 1,
            defaultOrder: 5,
            status: 0,
          },
          {
            id: 9406,
            typeCode: 'drafts',
            displayName: '草稿',
            rendererKey: 'drafts',
            metadataJson: '{}',
            defaultSpan: 1,
            defaultOrder: 6,
            status: 0,
          },
          {
            id: 9407,
            typeCode: 'messages',
            displayName: '消息',
            rendererKey: 'messages',
            metadataJson: '{}',
            defaultSpan: 1,
            defaultOrder: 7,
            status: 0,
          },
        ],
        layout: {
          cards: [
            { typeCode: 'stats', visible: true, order: 1, span: 2 },
            { typeCode: 'todo', visible: true, order: 2 },
            { typeCode: 'favoriteItems', visible: true, order: 3 },
            { typeCode: 'activity', visible: true, order: 4 },
            { typeCode: 'efficiency', visible: true, order: 5 },
            { typeCode: 'drafts', visible: false, order: 6 },
            { typeCode: 'messages', visible: false, order: 7 },
          ],
          favoriteItemKeys: [
            'TRAVEL_EXPENSE',
            'ASSET_PURCHASE',
            'DR_DRILL',
            'IOT_ACCESS',
            'KB_PERMISSION',
          ],
        },
      }),
    'GET /api/workflow/tasks/todo': () =>
      ok({
        records: [
          {
            taskId: 'fx-todo-1',
            name: '灾备演练申请',
            nodeName: '科技负责人会签',
            assigneeName: '林悦',
            dueText: '09-16 09:28',
          },
          {
            taskId: 'fx-todo-2',
            name: '采购付款申请',
            nodeName: '财务复核',
            assigneeName: '周明',
            dueText: '09-15 17:40',
          },
          {
            taskId: 'fx-todo-3',
            name: 'IoT 设备接入',
            nodeName: '设备接入审批',
            assigneeName: '王海',
            dueText: '09-14 13:06',
          },
        ],
        total: 6,
        pageNum: 1,
        pageSize: 5,
        badge: '2 项临期',
        urgentTotal: 2,
      }),
    'GET /api/workflow/my/processed': () =>
      ok({
        records: [
          {
            taskId: 'fx-p-3',
            taskName: '灾备演练申请进入「科技负责人会签」',
            action: '流程审批 · 林悦',
            endTime: '2026-09-16 09:32:00',
            createTime: '2026-09-16 09:32:00',
          },
          {
            taskId: 'fx-p-1',
            taskName: '采购付款申请已通过财务复核',
            action: '审批完成 · 周明',
            endTime: '2026-09-15 18:20:00',
            createTime: '2026-09-15 18:20:00',
          },
          {
            taskId: 'fx-p-2',
            taskName: 'IoT 设备接入申请已完成会签',
            action: '设备管理 · 智慧校园',
            endTime: '2026-09-14 11:06:00',
            createTime: '2026-09-14 11:06:00',
          },
        ],
        total: 27,
        pageNum: 1,
        pageSize: 5,
        badge: '较上周 +12%',
      }),
    'GET /api/workflow/my/copies': () =>
      ok({
        records: [
          {
            id: 1,
            processInstanceId: 'fx-copy-1',
            processDefKey: 'p1_incident',
            formKey: 'p1-incident',
            businessKey: 'SW202609150901',
            taskName: '校园北门异常流量工单抄送给你',
            action: '抄送消息 · P1 工单',
            createTime: '2026-09-15 16:05:00',
          },
        ],
        total: 4,
        pageNum: 1,
        pageSize: 5,
      }),
    'GET /api/workflow/drafts': () =>
      ok({
        records: [
          {
            id: 1,
            formKey: 'travel-expense',
            title: '差旅报销申请',
            status: 'DRAFT',
            updateTime: '2026-09-15 10:12:00',
          },
          {
            id: 2,
            formKey: 'asset-purchase',
            title: '资产采购申请',
            status: 'DRAFT',
            updateTime: '2026-09-14 16:40:00',
          },
          {
            id: 3,
            formKey: 'kb-permission',
            title: '知识库权限申请',
            status: 'DRAFT',
            updateTime: '2026-09-13 09:05:00',
          },
        ],
        total: 3,
        pageNum: 1,
        pageSize: 5,
        badge: '继续编辑',
      }),
    'GET /api/workflow/monitor/analytics/summary': () =>
      ok({
        launched: 12,
        completed: 7,
        running: 3,
        rejected: 2,
        avgDurationMs: 23040000,
        p50DurationMs: 5400000,
        p90DurationMs: 10800000,
        durationSample: 7,
        handlerWorkload: { '2': 5, '3': 3 },
        nodeStats: {
          dept_approve: { count: 12, avgStayMs: 7200000, p90StayMs: 9000000 },
          finance_review: { count: 7, avgStayMs: 5760000, p90StayMs: 8100000 },
        },
      }),
    'GET /api/workflow/catalog/items': () =>
      ok({ records: catalogItemRows(), total: 6, pageNum: 1, pageSize: 60 }),
    'GET /api/workflow/my/instances': () =>
      ok({
        records: [
          {
            id: 1,
            processInstanceId: 'fi-1',
            processDefKey: 'dr_drill',
            processName: '灾备演练申请',
            businessKey: 'SW202609160018',
            formKey: 'dr-drill',
            status: 'RUNNING',
            currentNode: '科技负责人会签',
            createTime: '2026-09-16T09:28:00',
          },
        ],
        total: 18,
        pageNum: 1,
        pageSize: 5,
        badge: '3 项进行中',
      }),
  }
}

// 设计节点02：我发起的列表（六行演示数据；currentNode 为列表契约可选展示字段）
export function node02Fixtures(): Record<string, DesignMockHandler> {
  return {
    'GET /api/workflow/my/instances': () =>
      ok({
        records: [
          {
            id: 1,
            processInstanceId: 'fi-1',
            processDefKey: 'dr_drill',
            processName: '灾备演练申请',
            businessKey: 'SW202609160018',
            formKey: 'dr-drill',
            initiatorId: 1,
            initiatorName: '陈曦',
            status: 'RUNNING',
            createTime: '2026-09-16T09:28:00',
            currentNode: '科技负责人会签',
          },
          {
            id: 2,
            processInstanceId: 'fi-2',
            processDefKey: 'purchase_pay',
            processName: '采购付款申请',
            businessKey: 'SW202609150097',
            formKey: 'purchase-pay',
            initiatorId: 1,
            initiatorName: '陈曦',
            status: 'RUNNING',
            createTime: '2026-09-15T16:42:00',
            currentNode: '财务复核',
          },
          {
            id: 3,
            processInstanceId: 'fi-3',
            processDefKey: 'iot_access',
            processName: 'IoT 设备接入申请',
            businessKey: 'SW202609140065',
            formKey: 'iot-access',
            initiatorId: 1,
            initiatorName: '陈曦',
            status: 'APPROVED',
            createTime: '2026-09-14T11:08:00',
            currentNode: '已完成',
          },
          {
            id: 4,
            processInstanceId: 'fi-4',
            processDefKey: 'kb_permission',
            processName: '知识库权限申请',
            businessKey: 'SW202609120041',
            formKey: 'kb-permission',
            initiatorId: 1,
            initiatorName: '陈曦',
            status: 'REJECTED',
            createTime: '2026-09-12T14:18:00',
            currentNode: '部门负责人审批',
          },
          {
            id: 5,
            processInstanceId: 'fi-5',
            processDefKey: 'travel_expense',
            processName: '差旅报销申请',
            businessKey: 'SW202609100025',
            formKey: 'travel-expense',
            initiatorId: 1,
            initiatorName: '陈曦',
            status: 'APPROVED',
            createTime: '2026-09-10T10:32:00',
            currentNode: '归档',
          },
          {
            id: 6,
            processInstanceId: 'fi-6',
            processDefKey: 'room_change',
            processName: '机房变更申请',
            businessKey: 'SW202609080009',
            formKey: 'room-change',
            initiatorId: 1,
            initiatorName: '陈曦',
            status: 'REJECTED',
            createTime: '2026-09-08T09:05:00',
            currentNode: '信息安全审核',
          },
        ],
        total: 18,
        pageNum: 1,
        pageSize: 10,
      }),
  }
}

// 设计节点03：数据详情（灾备演练申请演示实例；表单 KV + 五行流转记录）
export function node03Fixtures(): Record<string, DesignMockHandler> {
  return {
    'GET /api/workflow/tasks/:taskId': () =>
      ok({
        taskId: 'mock-task-001',
        taskName: '灾备演练申请审批',
        nodeKey: 'joint-sign',
        assigneeName: '王海',
        initiatorName: '林悦',
        processInstanceId: 'fi-dr-001',
        processDefinitionKey: 'dr_drill',
        processName: '灾备演练申请',
        formKey: 'dr-drill',
        businessKey: 'SW202609160018',
        assignee: '2',
        initiatorId: 1,
        createTime: '2026-09-16T09:28:00',
        processVariables: { formKey: 'dr-drill' },
        approvalHistory: [
          {
            taskId: 'h-0',
            taskName: '提交申请',
            assignee: '',
            assigneeName: '林悦',
            createTime: '2026-09-16 09:28:00',
            endTime: '2026-09-16 09:28:00',
            approvalResult: null,
            opinionData: { comment: '提交灾备演练申请，进入部门负责人审批' },
          },
          {
            taskId: 'h-1',
            nodeKey: 'dept-head',
            taskName: '部门负责人审批',
            assignee: '',
            assigneeName: '周明',
            createTime: '2026-09-16 09:28:00',
            endTime: '2026-09-16 10:06:00',
            approvalResult: 'APPROVED',
            assigneeDept: '科技运营部',
            opinionFormId: '部门审批意见表单',
            opinionFormVersion: '1.0',
            opinionData: {
              comment:
                '同意按计划开展灾备演练。请科技负责人会签确认技术方案，并落实演练期间的值守与回退安排。',
              审批结论: '同意',
              风险评估: '风险可控',
              是否补充演练: '否',
              值守负责人: '周明',
              已确认检查项: ['主备状态检查', '回退预案确认', '值守安排确认'],
              附件: '部门审核清单.pdf',
            },
          },
          {
            taskId: 'h-2',
            nodeKey: 'joint-sign',
            taskName: '科技负责人会签',
            assignee: '',
            assigneeName: '系统',
            createTime: '2026-09-16 10:12:00',
            endTime: '2026-09-16 10:12:00',
            approvalResult: null,
            opinionData: { comment: '并行送达陈曦、李宁、王海、赵辰' },
          },
          {
            taskId: 'h-3',
            nodeKey: 'joint-sign',
            taskName: '科技负责人会签',
            assignee: '',
            assigneeName: '陈曦',
            assigneeDept: '科技运营部',
            createTime: '2026-09-16 10:12:00',
            endTime: '2026-09-16 10:24:00',
            approvalResult: 'APPROVED',
            opinionFormId: '灾备会签意见表单',
            opinionFormVersion: '1.2',
            opinionData: {
              comment:
                '验证方案满足主备切换要求；建议演练前完成设备检查及回退验证，并确认所有值守人员到位。',
              审批结论: '同意',
              风险评估: '风险可控',
              是否补充演练: '否',
              值守负责人: '陈曦',
              已确认检查项: ['主备状态检查', '回退预案确认', '值守安排确认'],
              附件: '灾备会签检查单.pdf',
            },
          },
          {
            taskId: 'h-4',
            nodeKey: 'joint-sign',
            taskName: '科技负责人会签',
            assignee: '',
            assigneeName: '李宁',
            assigneeDept: '基础设施部',
            createTime: '2026-09-16 10:12:00',
            endTime: '2026-09-16 10:38:00',
            approvalResult: 'APPROVED',
            opinionFormId: '灾备会签意见表单',
            opinionFormVersion: '1.2',
            opinionData: {
              comment:
                '基础设施检查已完成，主设备与机房电力状态正常。确认回退预案与值守安排，同意执行本次演练。',
              审批结论: '同意',
              风险评估: '风险可控',
              是否补充演练: '否',
              值守负责人: '李宁',
              已确认检查项: ['主备状态检查', '回退预案确认', '值守安排确认'],
              附件: '基础设施会签检查单.pdf',
            },
          },
          {
            taskId: 'h-5',
            nodeKey: 'joint-sign',
            taskName: '科技负责人会签',
            assignee: '',
            assigneeName: '王海',
            assigneeDept: '网络运维部',
            createTime: '2026-09-16 10:12:00',
            endTime: null,
            approvalResult: null,
            opinionData: { comment: '已送达 · 09-16 10:12' },
          },
          {
            taskId: 'h-6',
            nodeKey: 'joint-sign',
            taskName: '科技负责人会签',
            assignee: '',
            assigneeName: '赵辰',
            assigneeDept: '信息安全部',
            createTime: '2026-09-16 10:12:00',
            endTime: null,
            approvalResult: null,
            opinionData: { comment: '已送达 · 09-16 10:12' },
          },
        ],
      }),
    'GET /api/form/data/:formKey/:recordId': () =>
      ok({
        演练名称: '深圳中心 2026 年度灾备切换演练',
        演练时间: '2026-09-20 02:00 — 06:00',
        牵头部门: '科技运营部',
        影响范围: '核心交易灾备链路、机房电力与告警系统',
        风险等级: 'P1 · 需多部门会签',
        说明: '验证主备切换、断电告警、MQTT 指令执行与回切能力。',
        附件: '灾备演练方案_v3.pdf',
      }),
    'GET /api/workflow/defs/by-key/:processKey': () => ok(taskGraphPayload()),
  }
}

export function node12Fixtures(): Record<string, DesignMockHandler> {
  return {
    ...processDesignerGraphFixtures(),
    'GET /api/workflow/defs/approver-candidates': () =>
      ok([
        { id: 2, username: 'chika', realName: '陈曦', department: '资产管理员' },
        { id: 103, username: 'wanghai', realName: '王海', department: '资产管理员' },
        { id: 104, username: 'linyue', realName: '林悦', department: '综合管理部' },
        { id: 105, username: 'zhaochen', realName: '赵辰', department: '采购与合约部' },
        { id: 106, username: 'zhouming', realName: '周明', department: '综合管理部负责人' },
      ]),
    'GET /api/system/dept/tree': () =>
      ok([
        { id: '1', parentId: '0', name: '总部' },
        { id: '2', parentId: '1', name: '综合管理部' },
        { id: '3', parentId: '1', name: '资产管理部' },
        { id: '4', parentId: '1', name: '财务管理部' },
        { id: '5', parentId: '1', name: '科技运营部' },
        { id: '6', parentId: '1', name: '采购与合约部' },
        { id: '7', parentId: '0', name: '深圳分公司' },
        { id: '8', parentId: '0', name: '广州分公司' },
      ]),
  }
}

// 设计节点08：关联流程列表。数据仍走 ProcessDef 列表契约，只补充该表单的真实绑定记录。
export function node08Fixtures(): Record<string, DesignMockHandler> {
  return {
    ...designerFormFixtures(),
    'GET /api/workflow/defs': () =>
      ok({
        records: [
          {
            id: 801,
            processKey: 'PROC_ASSET_PURCHASE',
            name: '资产采购审批',
            formKey: 'asset-purchase',
            defVersion: 3,
            status: 'PUBLISHED',
            versionLabel: '3.2',
            createTime: '2026-09-10 09:20',
            updateTime: '2026-09-10 09:20',
            updatedBy: '陈曦',
          },
          {
            id: 802,
            processKey: 'PROC_ASSET_URGENT',
            name: '紧急采购审批',
            formKey: 'asset-purchase',
            defVersion: 2,
            status: 'PUBLISHED',
            versionLabel: '2.1',
            createTime: '2026-09-12 14:32',
            updateTime: '2026-09-12 14:32',
            updatedBy: '林悦',
          },
          {
            id: 803,
            processKey: 'PROC_ASSET_LARGE',
            name: '大额采购会签',
            formKey: 'asset-purchase',
            defVersion: 1,
            status: 'DISABLED',
            versionLabel: '1.4',
            createTime: '2026-09-14 11:06',
            updateTime: '2026-09-14 11:06',
            updatedBy: '王海',
          },
          {
            id: 804,
            processKey: 'PROC_ASSET_PURCHASE_DRAFT',
            name: '资产采购审批（草稿）',
            formKey: 'asset-purchase',
            defVersion: 3,
            status: 'DRAFT',
            versionLabel: '3.3-draft',
            createTime: '2026-09-16 10:18',
            updateTime: '2026-09-16 10:18',
            updatedBy: '陈曦',
          },
        ],
        total: 4,
        pageNum: 1,
        pageSize: 10,
      }),
  }
}

export function node27Fixtures(): Record<string, DesignMockHandler> {
  return {
    'GET /api/form/def/by-key/:formKey/definition': () =>
      ok(
        JSON.stringify({
          title: '灾备演练申请',
          fields: [
            {
              name: 'exerciseName',
              label: '演练名称',
              type: 'TEXT',
              required: true,
              placeholder: '请输入演练名称',
            },
            {
              name: 'exerciseTime',
              label: '演练时间',
              type: 'DATE',
              required: true,
              placeholder: '请选择演练时间段',
            },
            {
              name: 'leadDepartment',
              label: '牵头部门',
              type: 'DICT',
              dictType: 'dept',
              required: true,
              defaultValue: 'TECH_OPS',
              placeholder: '科技运营部',
            },
            {
              name: 'impactScope',
              label: '影响范围',
              type: 'TEXT',
              required: true,
              placeholder: '请选择影响范围',
            },
            {
              name: 'riskLevel',
              label: '风险等级',
              type: 'DICT',
              dictType: 'risk_level',
              required: true,
              defaultValue: 'P1',
              placeholder: 'P1 · 需多部门会签',
            },
            {
              name: 'description',
              label: '说明',
              type: 'TEXT',
              placeholder: '填写灾演练说明与回切计划',
            },
            {
              name: 'attachment',
              label: '附件',
              type: 'TEXT',
              placeholder: '上传附件 · PDF / Word · 单个不超过 20MB',
            },
          ],
        }),
      ),
  }
}

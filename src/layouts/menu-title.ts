import { computed, type Ref } from 'vue'
import { useI18n } from '@/locales'
import type { MenuNode } from '@/contracts/menu'

/**
 * 菜单/权限节点标题的本地化（P61 R8b）。
 *
 * 节点的 name/title 来自服务端 sys_menu 种子，只有中文；直接渲染会让英文界面出现
 * 「一半英文一半中文」的同屏混语（可见浏览器验收已实拍）。侧边栏、面包屑、角色授权树
 * 三处消费同一份树，因此统一在这里按 name 映射语义键，未命中回退服务端标题——
 * 运行期自建菜单/权限没有键，仍显示作者填写的标题，不猜测、不隐藏。
 *
 * 键的取值遵循单一语义键：源码已引用的既有键（如 form.tabDesign、workflow.todoTasks）
 * 直接复用，不另立 menu./perm. 同义键。
 *
 * 取值必须在渲染期进行：模块加载期预求值会把语言固化（同类缺陷已在 WorkspaceHome 复现并修复）。
 */
export const NODE_TITLE_KEYS: Record<string, string> = {
  Agent: 'menu.agent',
  AgentGraphDef: 'agent.graphDefManagement',
  AgentModel: 'agent.modelManagement',
  AgentModelManage: 'perm.AgentModelManage',
  AgentModelTest: 'perm.AgentModelTest',
  AgentTool: 'router.toolManagement',
  AgentToolManage: 'perm.AgentToolManage',
  BatchApproval: 'workflow.batchApproval',
  CatalogManage: 'perm.CatalogManage',
  Dept: 'system.deptManagement',
  DeptCreate: 'perm.DeptCreate',
  DeptDelete: 'perm.DeptDelete',
  DeptUpdate: 'perm.DeptUpdate',
  DictManage: 'system.dictManagement',
  ds_execute: 'perm.ds_execute',
  ds_manage: 'perm.ds_manage',
  Form: 'menu.lowcode',
  FormDataDelete: 'perm.FormDataDelete',
  FormDataEdit: 'perm.FormDataEdit',
  FormDataExport: 'perm.FormDataExport',
  FormDataImport: 'perm.FormDataImport',
  FormDataQuery: 'perm.FormDataQuery',
  FormDataSubmit: 'perm.FormDataSubmit',
  FormDataTemplate: 'form.downloadTemplate',
  FormDesigner: 'form.tabDesign',
  FormDesignPublish: 'perm.FormDesignPublish',
  FormDesignSave: 'perm.FormDesignSave',
  FormOverview: 'menu.lowcodeHome',
  InstanceMonitor: 'router.instanceMonitor',
  InstanceMonitorManage: 'perm.InstanceMonitorManage',
  Iot: 'menu.iot',
  IotConnectionList: 'iot.connectionConfig',
  IotDeviceList: 'iot.deviceManagement',
  IotFlowActions: 'iot.processDeviceActions',
  IotProductList: 'menu.IotProductList',
  IotRuleList: 'iot.eventRules',
  IotRuntimeLogs: 'iot.runtimeLogsTitle',
  IotScriptList: 'iot.scriptListTitle',
  IotTopicList: 'iot.topicConfig',
  Job: 'job.scheduledJobs',
  JobCreate: 'perm.JobCreate',
  JobDelete: 'perm.JobDelete',
  JobList: 'menu.jobList',
  JobLog: 'job.executionLog',
  JobPause: 'perm.JobPause',
  JobResume: 'perm.JobResume',
  JobTrigger: 'perm.JobTrigger',
  JobUpdate: 'perm.JobUpdate',
  Lowcode: 'menu.lowcode',
  LowcodeForm: 'form.tabDesign',
  LowcodeHome: 'menu.lowcodeHome',
  Notify: 'menu.notify',
  NotifyBatchSend: 'menu.NotifyBatchSend',
  NotifyBatchSendAction: 'perm.NotifyBatchSendAction',
  NotifyChannel: 'notify.channelConfig',
  NotifyChannelManage: 'perm.NotifyChannelManage',
  NotifyInbox: 'menu.notifyInbox',
  NotifyPreference: 'notify.subscriptionPreferences',
  NotifyRecord: 'router.sendRecords',
  NotifyRecordDetail: 'perm.NotifyRecordDetail',
  NotifyRecordResend: 'perm.NotifyRecordResend',
  NotifyRule: 'notify.rules',
  NotifyRuleManage: 'perm.NotifyRuleManage',
  NotifyTemplate: 'router.messageTemplate',
  NotifyTemplateManage: 'perm.NotifyTemplateManage',
  Openapi: 'menu.openapi',
  Post: 'system.postManagement',
  PostCreate: 'perm.PostCreate',
  PostDelete: 'perm.PostDelete',
  PostUpdate: 'perm.PostUpdate',
  ProcessAnalytics: 'workflow.processAnalytics',
  ProcessCatalog: 'workflow.processCenter',
  Role: 'system.roleManagement',
  RoleCreate: 'perm.RoleCreate',
  RoleDelete: 'perm.RoleDelete',
  RoleUpdate: 'perm.RoleUpdate',
  sso_audit: 'perm.sso_audit',
  Storage: 'storage.fileManagement',
  StorageDelete: 'perm.StorageDelete',
  StorageDownload: 'perm.StorageDownload',
  StorageUpload: 'perm.StorageUpload',
  System: 'menu.system',
  TaskHandover: 'workflow.handoverTitle',
  TemplateCenter: 'router.processTemplateCenter',
  TemplateCopy: 'perm.TemplateCopy',
  TemplateCreate: 'perm.TemplateCreate',
  TemplateDelete: 'perm.TemplateDelete',
  TemplateSave: 'perm.TemplateSave',
  TemplateView: 'perm.TemplateView',
  User: 'system.userManagement',
  UserCreate: 'perm.UserCreate',
  UserDelete: 'perm.UserDelete',
  UserUpdate: 'perm.UserUpdate',
  Workflow: 'menu.workflow',
  WorkflowDefCreate: 'menu.WorkflowDefCreate',
  WorkflowDefDelete: 'perm.WorkflowDefDelete',
  WorkflowDefPublish: 'perm.WorkflowDefPublish',
  WorkflowDefs: 'common.processDef',
  WorkflowDefSave: 'perm.WorkflowDefSave',
  WorkflowDefSuspend: 'perm.WorkflowDefSuspend',
  WorkflowDefValidate: 'perm.WorkflowDefValidate',
  WorkflowDesigner: 'menu.WorkflowDesigner',
  WorkflowInstances: 'workflow.monitor',
  WorkflowMyCc: 'router.myCc',
  WorkflowMyDrafts: 'workflow.myDrafts',
  WorkflowMyInstances: 'common.startedByMe',
  WorkflowMyProcessed: 'workflow.myProcessed',
  WorkflowP0Dispatch: 'perm.WorkflowP0Dispatch',
  WorkflowProcessed: 'workflow.processedTasks',
  WorkflowTaskAddSign: 'perm.WorkflowTaskAddSign',
  WorkflowTaskAuthorize: 'perm.WorkflowTaskAuthorize',
  WorkflowTaskCommunicate: 'workflow.consult',
  WorkflowTaskDelegate: 'perm.WorkflowTaskDelegate',
  WorkflowTaskDiscard: 'perm.WorkflowTaskDiscard',
  WorkflowTaskManage: 'perm.WorkflowTaskManage',
  WorkflowTaskTransfer: 'perm.WorkflowTaskTransfer',
  WorkflowTaskWithdraw: 'perm.WorkflowTaskWithdraw',
  WorkflowTodo: 'workflow.todoTasks',
  WorkflowUrge: 'workflow.urge',
}

/** 渲染期解析单个节点标题。 */
export function useNodeTitle(): (node: { name: string; title: string }) => string {
  const { t, te } = useI18n()
  return (node) => {
    const key = NODE_TITLE_KEYS[node.name]
    return key && te(key) ? t(key) : node.title
  }
}

/** 递归本地化整棵树（computed 包裹后随语言切换重新求值）。 */
export function useLocalizedMenu(): (nodes: MenuNode[]) => MenuNode[] {
  const resolve = useNodeTitle()
  return function localize(nodes: MenuNode[]): MenuNode[] {
    return nodes.map((n) => ({
      ...n,
      title: resolve(n),
      children: n.children?.length ? localize(n.children) : n.children,
    }))
  }
}

/** 由响应式菜单源得到本地化树。 */
export function useLocalizedMenuTree(source: Ref<MenuNode[]>) {
  const localize = useLocalizedMenu()
  return computed(() => localize(source.value ?? []))
}

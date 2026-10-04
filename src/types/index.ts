// ============================================================
// 领域模型：城市瑜伽馆私教全流程
// 会员 / 顾问 / 教练 三角色围绕「同一套训练记录」协作
// ============================================================

export type Role = 'member' | 'consultant' | 'coach'

export interface Account {
  id: string
  role: Role
  name: string
  password: string
  phone: string
}

// ---------------- 体验课预约（会员填写） ----------------
export type FitnessBase = '零基础' | '偶尔运动' | '规律运动' | '长期训练'
export type Flexibility = '很僵硬' | '偏僵硬' | '一般' | '较好'

export interface PainInfo {
  part: string          // 部位，如 膝盖/腰椎/肩颈
  level: number         // 0-10 疼痛等级
  note: string
}

export interface ExperienceBooking {
  id: string
  memberId: string
  createdAt: string
  fitnessBase: FitnessBase
  pains: PainInfo[]
  flexibility: Flexibility
  goals: string[]               // 减脂塑形/体态矫正/柔韧提升/康复舒缓/减压助眠
  goalNote: string
  availableSlots: string[]      // 可上课时间，如 ['周一 19:00-20:00']
  budget: string                // 预算区间
  mindOppositeGenderCoach: boolean  // 是否介意异性教练
  status: '待安排' | '已安排' | '已完成测评' | '已购课' | '已取消'
  note: string
}

// ---------------- 体验课测评（教练填写，专业档案，顾问只读） ----------------
export interface Assessment {
  id: string
  bookingId: string
  memberId: string
  coachId: string
  createdAt: string
  posture: string          // 体态评估
  movementLimits: string   // 动作限制
  courseAdvice: string     // 课程建议
  riskNotice: string       // 风险提示（医疗边界声明）
  recommendedPackage: string  // 推荐套餐
  coachSignedAt: string    // 教练签名确认时间（签名后内容锁定，顾问不可改）
}

// ---------------- 课包与排课 ----------------
export interface CoursePackage {
  id: string
  memberId: string
  coachId: string
  name: string             // 如「私教 24 节 · 体态矫正」
  totalSessions: number
  usedSessions: number
  startDate: string
  expiryDate: string
  status: '进行中' | '已用完' | '已过期' | '已续费衔接' | '已退课' | '已转团课'
  leaveRule: LeaveRule
  createdAt: string
}

export interface LeaveRule {
  maxLeavePerMonth: number     // 每月最多请假次数
  advanceHours: number         // 需提前多少小时请假
  note: string
}

// 排课计划：每周固定时段
export interface SchedulePlan {
  id: string
  packageId: string
  memberId: string
  coachId: string
  weekday: number          // 0-6
  time: string             // '19:00-20:00'
  active: boolean
}

export type SessionStatus = '待上课' | '已完成' | '会员请假' | '教练请假' | '已改期' | '已取消'

export interface Session {
  id: string
  packageId: string
  memberId: string
  coachId: string
  date: string             // YYYY-MM-DD
  time: string
  kind: '体验课' | '私教课'
  status: SessionStatus
  focus: string            // 本节课重点（教练基于上节反馈制定）
  isExperience: boolean
  bookingId?: string
}

// ---------------- 课后训练记录（教练填写） ----------------
export interface PainChange {
  part: string
  before: number   // 课前 0-10
  after: number    // 课后 0-10
}

export interface SessionRecord {
  id: string
  sessionId: string
  memberId: string
  coachId: string
  createdAt: string
  completedMoves: string[]   // 完成动作
  memberFeel: number         // 会员体感 1-10（RPE）
  feelNote: string
  painChanges: PainChange[]  // 疼痛变化
  homePractice: string       // 家庭练习布置
  coachNote: string          // 教练备注（下节课依据）
}

// ---------------- 请假 ----------------
export interface LeaveRequest {
  id: string
  sessionId: string
  byRole: 'member' | 'coach'
  byId: string
  reason: string
  createdAt: string
  status: '待处理' | '已批准' | '已拒绝'
  withinRule: boolean        // 是否符合请假规则（提前时长/当月次数）
}

// ---------------- 异常工单（六类场景统一处理） ----------------
export type TicketType =
  | '会员不适'       // 如膝盖不适
  | '教练请假'
  | '临时改期'
  | '进度落后'
  | '更换教练'
  | '课包到期'

export interface Ticket {
  id: string
  type: TicketType
  memberId: string
  coachId?: string
  sessionId?: string
  title: string
  detail: string
  createdAt: string
  status: '待处理' | '处理中' | '已解决'
  resolution: string         // 处理结论（写回训练记录）
}

// ---------------- 续费 ----------------
export interface RenewalFollowUp {
  id: string
  memberId: string
  consultantId: string
  createdAt: string
  summary: string            // 顾问基于训练进度撰写的沟通纪要
  result: '跟进中' | '已续费' | '暂缓'
}

// ---------------- 投诉 ----------------
export interface Complaint {
  id: string
  memberId: string
  content: string
  createdAt: string
  status: '待处理' | '已回复' | '已关闭'
  reply: string
}

// ---------------- 转教练换教练交接（结构化试运行流程） ----------------
export type TransferStatus =
  | '待新教练确认'   // 顾问已发起并整理交接记录，等待新教练需阅读并确认
  | '试运行中'       // 新教练已确认接手，首节试课与试运行跟踪进行中
  | '待顾问定夺'     // 首课适配反馈已提交，等待顾问决定是否稳定转入
  | '已稳定转入'     // 顾问确认稳定转入，流程完成
  | '已终止'         // 仍不适配：退课 / 转团课 / 换目标方案 / 回原教练

/** 发起交接时由系统整理的交接快照（冻结保存，不随后续数据变化） */
export interface HandoverSnapshot {
  goals: string            // 训练目标（含备注）
  completedCount: number   // 已完成课程数
  totalCount: number       // 课包总节数
  recentCourses: string[]  // 最近课程摘要（重点 + 体感 + 疼痛）
  painSummary: string      // 疼痛变化趋势
  preferences: string      // 会员偏好（性别倾向 / 可上课时间 / 预算 / 风格诉求）
  complaintReason: string  // 投诉与换教练原因
}

/** 试运行期间顾问的跟踪记录：会员满意度 + 新教练反馈 */
export interface TransferCheckIn {
  id: string
  at: string
  by: string               // 顾问姓名
  satisfaction: number     // 会员满意度 1-10
  coachNote: string        // 新教练反馈摘要
  note: string             // 顾问跟踪备注
}

/** 新教练第一节课结束后的适配反馈 */
export interface TransferFeedback {
  at: string
  adaptation: number       // 适配度评分 1-10
  memberReaction: string   // 会员课堂反应
  plan: string             // 后续计划建议
  recommend: '建议转入' | '建议观察' | '建议终止'
}

/** 双方沟通记录（会员 / 新教练 / 顾问同一条线程） */
export interface TransferMessage {
  id: string
  at: string
  fromRole: Role
  fromName: string
  content: string
}

export interface CoachTransfer {
  id: string
  memberId: string
  fromCoachId: string
  toCoachId: string
  ticketId?: string          // 关联的「更换教练」工单
  createdAt: string
  createdBy: string          // 发起顾问姓名
  reason: string             // 顾问整理的转教练原因
  snapshot: HandoverSnapshot // 交接快照
  status: TransferStatus
  // 新教练确认
  confirmedAt?: string
  confirmNote?: string       // 新教练确认时填写的接手计划
  // 第一节课适配反馈
  firstSessionId?: string
  feedback?: TransferFeedback
  // 试运行跟踪
  checkIns: TransferCheckIn[]
  // 双方沟通记录
  messages: TransferMessage[]
  // 顾问定夺
  decision?: {
    at: string
    by: string
    result: '稳定转入' | '退课' | '转团课' | '换目标方案' | '回原教练'
    note: string
  }
}

// ---------------- 统一训练时间线（三方共享的同一套记录） ----------------
export type TimelineKind =
  | '预约体验' | '安排体验' | '体验测评' | '购课' | '排课'
  | '上课记录' | '请假' | '改期' | '不适上报' | '课程调整'
  | '更换教练' | '转教练交接' | '续费' | '投诉' | '工单处理'

export interface TimelineEvent {
  id: string
  memberId: string
  at: string
  kind: TimelineKind
  actorRole: Role
  actorName: string
  title: string
  detail: string
  professional?: boolean     // true = 教练专业记录，顾问端只读展示
}

// ---------------- 教练档案 ----------------
export interface CoachProfile {
  id: string
  name: string
  gender: '女' | '男'
  specialties: string[]      // 理疗瑜伽/体态矫正/力量流/阴瑜伽...
  bio: string
}

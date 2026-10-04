import { defineStore } from 'pinia'
import type {
  Account, Assessment, CoachProfile, CoachTransfer, Complaint, CoursePackage, ExperienceBooking,
  HandoverSnapshot, LeaveRequest, PainChange, RenewalFollowUp, SchedulePlan, Session, SessionRecord,
  Ticket, TicketType, TimelineEvent, TimelineKind,
} from '../types'
import { buildSeed, SEED_VERSION, type SeedState } from '../data/seed'
import { addDays, daysBetween, nextWeekday, nowStr, today, uid, weekdayCn } from '../utils/date'

const KEY = `yoga_db_v${SEED_VERSION}`

export interface WeekdaySlot { weekday: number; time: string }

export const useDataStore = defineStore('data', {
  state: (): SeedState => buildSeed(),

  getters: {
    accountById: (s) => (id: string): Account | undefined => s.accounts.find(a => a.id === id),
    coachById: (s) => (id: string): CoachProfile | undefined => s.coaches.find(c => c.id === id),
    nameOf(): (id: string) => string {
      return (id) => this.accountById(id)?.name ?? this.coachById(id)?.name ?? id
    },

    memberIds: (s) => s.accounts.filter(a => a.role === 'member').map(a => a.id),

    activePackage: (s) => (memberId: string): CoursePackage | undefined =>
      s.packages.find(p => p.memberId === memberId && p.status === '进行中'),

    packagesOf: (s) => (memberId: string) =>
      s.packages.filter(p => p.memberId === memberId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),

    sessionsOf: (s) => (memberId: string) =>
      s.sessions.filter(x => x.memberId === memberId).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),

    coachSessions: (s) => (coachId: string) =>
      s.sessions.filter(x => x.coachId === coachId).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),

    upcomingSessions: (s) => (memberId: string) =>
      s.sessions.filter(x => x.memberId === memberId && x.status === '待上课' && x.date >= today())
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)),

    recordOf: (s) => (sessionId: string) => s.records.find(r => r.sessionId === sessionId),

    recordsOf: (s) => (memberId: string) =>
      s.records.filter(r => r.memberId === memberId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),

    timelineOf: (s) => (memberId: string) =>
      s.timeline.filter(e => e.memberId === memberId).sort((a, b) => b.at.localeCompare(a.at)),

    latestAssessment: (s) => (memberId: string): Assessment | undefined =>
      s.assessments.filter(a => a.memberId === memberId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],

    bookingOf: (s) => (memberId: string) =>
      s.bookings.filter(b => b.memberId === memberId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0],

    // ---- 顾问看板 ----
    funnel: (s) => {
      const c = { 待安排: 0, 已安排: 0, 已完成测评: 0, 已购课: 0, 已取消: 0 }
      s.bookings.forEach(b => { c[b.status] += 1 })
      return c
    },
    openTickets: (s) => s.tickets.filter(t => t.status !== '已解决'),
    pendingLeaves: (s) => s.leaves.filter(l => l.status === '待处理'),
    openComplaints: (s) => s.complaints.filter(c => c.status !== '已关闭'),

    /** 课包消耗进度：expected = 按时间线性应消耗 */
    progressOf: () => (p: CoursePackage) => {
      const totalDays = Math.max(1, daysBetween(p.startDate, p.expiryDate))
      const elapsed = Math.min(totalDays, Math.max(0, daysBetween(p.startDate, today())))
      const expected = (p.totalSessions * elapsed) / totalDays
      const remaining = p.totalSessions - p.usedSessions
      const daysLeft = daysBetween(today(), p.expiryDate)
      const behind = p.status === '进行中' && elapsed / totalDays > 0.15 && p.usedSessions < expected * 0.7
      const expiringSoon = p.status === '进行中' && (daysLeft <= 21 || remaining <= 4)
      return { totalDays, elapsed, expected: Math.round(expected * 10) / 10, remaining, daysLeft, behind, expiringSoon }
    },

    renewalAlerts(): { pkg: CoursePackage; remaining: number; daysLeft: number }[] {
      return this.packages
        .filter(p => p.status === '进行中')
        .map(p => ({ pkg: p, ...this.progressOf(p) }))
        .filter(x => x.expiringSoon)
        .map(x => ({ pkg: x.pkg, remaining: x.remaining, daysLeft: x.daysLeft }))
    },

    /** 会员疼痛趋势（续费沟通用真实数据） */
    painTrend: (s) => (memberId: string) => {
      const out: { date: string; part: string; before: number; after: number }[] = []
      s.records
        .filter(r => r.memberId === memberId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        .forEach(r => r.painChanges.forEach(pc => out.push({ date: r.createdAt, part: pc.part, before: pc.before, after: pc.after })))
      return out
    },

    attendanceOf: (s) => (memberId: string) => {
      const ss = s.sessions.filter(x => x.memberId === memberId && !x.isExperience)
      return {
        done: ss.filter(x => x.status === '已完成').length,
        leave: ss.filter(x => x.status === '会员请假').length,
        upcoming: ss.filter(x => x.status === '待上课').length,
      }
    },

    // ---- 转教练交接 ----
    transfersOf: (s) => (memberId: string) =>
      s.transfers.filter(t => t.memberId === memberId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),

    /** 会员当前进行中的交接（未稳定转入也未终止） */
    activeTransferOf: (s) => (memberId: string): CoachTransfer | undefined =>
      s.transfers.find(t => t.memberId === memberId && t.status !== '已稳定转入' && t.status !== '已终止'),

    transfersForCoach: (s) => (coachId: string) =>
      s.transfers.filter(t => t.toCoachId === coachId || t.fromCoachId === coachId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),

    /** 新教练待阅读确认的交接 */
    pendingTransferConfirms: (s) => (coachId: string) =>
      s.transfers.filter(t => t.toCoachId === coachId && t.status === '待新教练确认'),

    /** 发起交接时自动整理的交接快照：训练目标 / 已完成课程 / 疼痛变化 / 会员偏好 / 投诉原因 */
    snapshotPreview(): (memberId: string, ticketId?: string) => HandoverSnapshot {
      return (memberId, ticketId) => {
        const booking = this.bookingOf(memberId)
        const records = this.recordsOf(memberId)
        const trend = this.painTrend(memberId)
        const pkg = this.activePackage(memberId)
        const openComplaints = this.complaints.filter(c => c.memberId === memberId && c.status !== '已关闭')
        const ticket = ticketId ? this.tickets.find(t => t.id === ticketId) : undefined

        // 训练目标
        const goals = booking
          ? `${booking.goals.join('、')}${booking.goalNote ? `（${booking.goalNote}）` : ''}`
          : pkg ? pkg.name.replace(/^私教 \d+ 节 · /, '') : '未填写目标'

        // 已完成课程摘要（最近 3 条课后记录）
        const recentCourses = records.slice(0, 3).map(r => {
          const pain = r.painChanges.length ? `，${r.painChanges.map(p => `${p.part}${p.before}→${p.after}分`).join('，')}` : ''
          return `${r.createdAt.slice(0, 10)}：体感 ${r.memberFeel}/10${pain}；${r.coachNote}`
        })

        // 疼痛变化：按部位汇总首次 → 最近
        let painSummary = '无疼痛记录'
        if (trend.length) {
          const parts = [...new Set(trend.map(t => t.part))]
          painSummary = parts.map(part => {
            const list = trend.filter(t => t.part === part)
            return `${part} 首次 ${list[0].before} 分 → 最近 ${list[list.length - 1].after} 分（${list.length} 次记录）`
          }).join('；')
        }

        // 会员偏好
        const prefParts: string[] = []
        if (booking) {
          prefParts.push(booking.mindOppositeGenderCoach ? '介意异性教练' : '不介意教练性别')
          prefParts.push(`可上课时间：${booking.availableSlots.join('、') || '未填写'}`)
          prefParts.push(`预算：${booking.budget}`)
        }
        if (ticket) prefParts.push(`换教练诉求：${ticket.detail}`)
        const preferences = prefParts.join('；') || '未登记偏好'

        // 投诉与换教练原因
        const reasonParts: string[] = []
        if (ticket) reasonParts.push(`换教练申请：${ticket.detail}`)
        openComplaints.forEach(c => reasonParts.push(`投诉（${c.createdAt.slice(0, 10)}）：${c.content}`))
        const complaintReason = reasonParts.join('；') || '无投诉记录'

        return {
          goals,
          completedCount: pkg?.usedSessions ?? records.filter(r => !this.sessions.find(x => x.id === r.sessionId)?.isExperience).length,
          totalCount: pkg?.totalSessions ?? 0,
          recentCourses,
          painSummary,
          preferences,
          complaintReason,
        }
      }
    },
  },

  actions: {
    init() {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as SeedState
          Object.assign(this, parsed)
          return
        } catch { /* fallthrough */ }
      }
      this.resetDemo()
    },
    persist() {
      localStorage.setItem(KEY, JSON.stringify(this.$state))
    },
    resetDemo() {
      Object.assign(this, buildSeed())
      this.persist()
    },

    log(memberId: string, kind: TimelineKind, actorRole: 'member' | 'consultant' | 'coach', actorName: string, title: string, detail: string, professional = false) {
      this.timeline.push({ id: uid('tl'), memberId, at: nowStr(), kind, actorRole, actorName, title, detail, professional })
    },

    openTicket(type: TicketType, memberId: string, title: string, detail: string, coachId?: string, sessionId?: string) {
      this.tickets.unshift({ id: uid('tk'), type, memberId, coachId, sessionId, title, detail, createdAt: nowStr(), status: '待处理', resolution: '' })
    },

    // ---------- 会员：预约体验课 ----------
    bookExperience(memberId: string, payload: Omit<ExperienceBooking, 'id' | 'memberId' | 'createdAt' | 'status'>) {
      const b: ExperienceBooking = { ...payload, id: uid('bk'), memberId, createdAt: nowStr(), status: '待安排' }
      this.bookings.unshift(b)
      const m = this.accountById(memberId)
      this.log(memberId, '预约体验', 'member', m?.name ?? '', '预约体验课',
        `运动基础：${payload.fitnessBase}；疼痛：${payload.pains.map(p => `${p.part}${p.level}分`).join('、') || '无'}；柔韧性：${payload.flexibility}；目标：${payload.goals.join('、')}；预算：${payload.budget}；${payload.mindOppositeGenderCoach ? '介意异性教练' : '不介意教练性别'}。`)
      this.persist()
    },

    // ---------- 顾问：安排体验课 ----------
    arrangeExperience(bookingId: string, coachId: string, date: string, time: string, consultantName: string) {
      const b = this.bookings.find(x => x.id === bookingId)
      if (!b || b.status !== '待安排') return
      b.status = '已安排'
      this.sessions.push({
        id: uid('ss'), packageId: '', memberId: b.memberId, coachId, date, time,
        kind: '体验课', status: '待上课', focus: '体态评估与基础筛查', isExperience: true, bookingId: b.id,
      })
      const coach = this.coachById(coachId)
      this.log(b.memberId, '安排体验', 'consultant', consultantName, '安排体验课',
        `匹配${coach?.name}教练（${coach?.specialties.join('/')}），时间 ${date}（${weekdayCn(date)}）${time}。`)
      this.persist()
    },

    // ---------- 教练：填写体验测评（签名后锁定，顾问只读） ----------
    submitAssessment(bookingId: string, coachId: string, payload: { posture: string; movementLimits: string; courseAdvice: string; riskNotice: string; recommendedPackage: string }) {
      const b = this.bookings.find(x => x.id === bookingId)
      if (!b) return
      b.status = '已完成测评'
      const coach = this.coachById(coachId)
      this.assessments.push({
        id: uid('as'), bookingId, memberId: b.memberId, coachId, createdAt: nowStr(),
        ...payload, coachSignedAt: nowStr(),
      })
      this.log(b.memberId, '体验测评', 'coach', coach?.name ?? '', '完成体验课测评',
        `${payload.posture.slice(0, 60)}…；建议：${payload.recommendedPackage}；风险提示已签署。`, true)
      this.persist()
    },

    // ---------- 会员：确认购课 → 生成课包 + 排课计划 + 请假规则 + 续费提醒基线 ----------
    purchasePackage(memberId: string, coachId: string, name: string, totalSessions: number, validDays: number, slots: WeekdaySlot[], memberName: string) {
      const pkg: CoursePackage = {
        id: uid('pk'), memberId, coachId, name, totalSessions, usedSessions: 0,
        startDate: today(), expiryDate: addDays(today(), validDays), status: '进行中',
        leaveRule: { maxLeavePerMonth: 2, advanceHours: 12, note: '每月最多请假 2 次，需提前 12 小时；超出视同消课。' },
        createdAt: nowStr(),
      }
      this.packages.push(pkg)
      slots.forEach((s, i) => {
        this.plans.push({ id: uid('pl'), packageId: pkg.id, memberId, coachId, weekday: s.weekday, time: s.time, active: true })
        // 生成未来 3 周课程
        for (let w = 0; w < 3; w++) {
          const date = addDays(nextWeekday(today(), s.weekday), w * 7)
          this.sessions.push({
            id: uid('ss'), packageId: pkg.id, memberId, coachId, date, time: s.time,
            kind: '私教课', status: '待上课', focus: i === 0 && w === 0 ? '开课评估与目标对齐' : '待上节课反馈后确定', isExperience: false,
          })
        }
      })
      const b = this.bookingOf(memberId)
      if (b && b.status === '已完成测评') b.status = '已购课'
      this.log(memberId, '购课', 'member', memberName, '确认购买课包',
        `${name}，共 ${totalSessions} 节，有效期至 ${pkg.expiryDate}；请假规则：每月最多 2 次、提前 12 小时。`)
      this.log(memberId, '排课', 'consultant', '系统', '生成排课计划',
        slots.map(s => `每周${'日一二三四五六'[s.weekday]} ${s.time}`).join('、') + '；课包剩余 4 节或到期前 21 天将自动提醒续费。')
      this.persist()
    },

    // ---------- 教练：课后记录 ----------
    completeSession(sessionId: string, payload: { completedMoves: string[]; memberFeel: number; feelNote: string; painChanges: PainChange[]; homePractice: string; coachNote: string; nextFocus?: string }, coachName: string) {
      const ss = this.sessions.find(x => x.id === sessionId)
      if (!ss || ss.status !== '待上课') return
      ss.status = '已完成'
      this.records.push({
        id: uid('rc'), sessionId, memberId: ss.memberId, coachId: ss.coachId, createdAt: nowStr(),
        completedMoves: payload.completedMoves, memberFeel: payload.memberFeel, feelNote: payload.feelNote,
        painChanges: payload.painChanges, homePractice: payload.homePractice, coachNote: payload.coachNote,
      })
      if (!ss.isExperience) {
        const pkg = this.packages.find(p => p.id === ss.packageId)
        if (pkg) pkg.usedSessions += 1
      }
      if (payload.nextFocus) {
        const next = this.sessions
          .filter(x => x.memberId === ss.memberId && x.status === '待上课' && (x.date + x.time) > (ss.date + ss.time))
          .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0]
        if (next) next.focus = payload.nextFocus
      }
      const pain = payload.painChanges.map(p => `${p.part} ${p.before}→${p.after} 分`).join('，')
      this.log(ss.memberId, '上课记录', 'coach', coachName, `${ss.kind}完成`,
        `完成动作：${payload.completedMoves.join('、')}；体感 ${payload.memberFeel}/10${pain ? `；疼痛变化：${pain}` : ''}；家庭练习：${payload.homePractice}`, true)
      this.persist()
    },

    // ---------- 请假 ----------
    requestLeave(sessionId: string, byRole: 'member' | 'coach', byId: string, reason: string) {
      const ss = this.sessions.find(x => x.id === sessionId)
      if (!ss || ss.status !== '待上课') return
      let withinRule = true
      if (byRole === 'member') {
        const pkg = this.packages.find(p => p.id === ss.packageId)
        if (pkg) {
          const month = ss.date.slice(0, 7)
          const used = this.leaves.filter(l => l.byRole === 'member' && l.status === '已批准'
            && this.sessions.find(x => x.id === l.sessionId)?.date.slice(0, 7) === month
            && this.sessions.find(x => x.id === l.sessionId)?.memberId === ss.memberId).length
          const hoursAhead = (new Date(ss.date + 'T' + ss.time.slice(0, 5)).getTime() - Date.now()) / 3600000
          withinRule = used < pkg.leaveRule.maxLeavePerMonth && hoursAhead >= pkg.leaveRule.advanceHours
        }
      }
      this.leaves.unshift({ id: uid('lv'), sessionId, byRole, byId, reason, createdAt: nowStr(), status: '待处理', withinRule })
      const name = this.nameOf(byId)
      if (byRole === 'coach') {
        this.openTicket('教练请假', ss.memberId, `${name}教练请假`, `教练请假：${reason}。${ss.date} ${ss.time} 课程需要改期或换教练代课。`, ss.coachId, sessionId)
        this.log(ss.memberId, '请假', 'coach', name, '教练请假', `${ss.date} ${ss.time} 课程待协调：${reason}`)
      } else {
        this.log(ss.memberId, '请假', 'member', name, '会员请假申请', `${ss.date} ${ss.time}：${reason}${withinRule ? '' : '（超出请假规则，请顾问确认）'}`)
      }
      this.persist()
    },

    decideLeave(leaveId: string, approve: boolean, actorName: string) {
      const lv = this.leaves.find(l => l.id === leaveId)
      if (!lv || lv.status !== '待处理') return
      lv.status = approve ? '已批准' : '已拒绝'
      const ss = this.sessions.find(x => x.id === lv.sessionId)
      if (ss && approve) ss.status = lv.byRole === 'member' ? '会员请假' : '教练请假'
      if (ss) {
        this.log(ss.memberId, '请假', 'consultant', actorName, `请假${approve ? '已批准' : '已拒绝'}`,
          `${ss.date} ${ss.time}，${lv.byRole === 'member' ? '会员' : '教练'}请假：${lv.reason}${lv.withinRule ? '' : '（超出请假规则）'}`)
      }
      this.persist()
    },

    // ---------- 改期 ----------
    rescheduleSession(sessionId: string, newDate: string, newTime: string, actorRole: 'member' | 'consultant' | 'coach', actorName: string) {
      const ss = this.sessions.find(x => x.id === sessionId)
      // 允许对「待上课」以及「教练请假」的课程改期（教练请假后补课）
      if (!ss || (ss.status !== '待上课' && ss.status !== '教练请假')) return
      const old = `${ss.date}（${weekdayCn(ss.date)}）${ss.time}`
      const wasCoachLeave = ss.status === '教练请假'
      ss.date = newDate
      ss.time = newTime
      ss.status = '待上课'
      this.log(ss.memberId, '改期', actorRole, actorName, wasCoachLeave ? '教练请假课程补课改期' : '课程改期',
        `${old} → ${newDate}（${weekdayCn(newDate)}）${newTime}`)
      this.persist()
    },

    // ---------- 会员：不适上报 ----------
    reportDiscomfort(memberId: string, detail: string, memberName: string) {
      const pkg = this.activePackage(memberId)
      this.openTicket('会员不适', memberId, '会员身体不适上报', detail, pkg?.coachId)
      this.log(memberId, '不适上报', 'member', memberName, '上报身体不适', detail)
      this.persist()
    },

    // ---------- 教练：课程调整（专业记录） ----------
    adjustPlan(memberId: string, coachId: string, note: string, nextFocus: string | undefined, coachName: string) {
      this.log(memberId, '课程调整', 'coach', coachName, '调整训练计划', note, true)
      if (nextFocus) {
        const next = this.upcomingSessions(memberId)[0]
        if (next) next.focus = nextFocus
      }
      // 关联的不适工单推进为处理中
      const tk = this.tickets.find(t => t.memberId === memberId && t.type === '会员不适' && t.status !== '已解决')
      if (tk) tk.status = '处理中'
      this.persist()
    },

    // ---------- 会员：申请换教练 ----------
    requestCoachChange(memberId: string, reason: string, memberName: string) {
      const pkg = this.activePackage(memberId)
      this.openTicket('更换教练', memberId, '会员申请更换教练', reason, pkg?.coachId)
      this.log(memberId, '更换教练', 'member', memberName, '申请更换教练', reason)
      this.persist()
    },

    // ---------- 顾问：发起转教练交接（整理交接快照，新教练确认前课程仍归原教练） ----------
    initiateTransfer(memberId: string, toCoachId: string, reason: string, consultantName: string, ticketId?: string) {
      const pkg = this.activePackage(memberId)
      if (!pkg) return
      if (this.activeTransferOf(memberId)) return // 已有进行中的交接
      const snapshot = this.snapshotPreview(memberId, ticketId)
      const tr: CoachTransfer = {
        id: uid('tr'), memberId, fromCoachId: pkg.coachId, toCoachId, ticketId,
        createdAt: nowStr(), createdBy: consultantName, reason, snapshot,
        status: '待新教练确认', checkIns: [], messages: [],
      }
      this.transfers.unshift(tr)
      const nc = this.coachById(toCoachId)
      const tk = ticketId ? this.tickets.find(t => t.id === ticketId) : undefined
      if (tk && tk.status === '待处理') tk.status = '处理中'
      this.log(memberId, '转教练交接', 'consultant', consultantName, '发起转教练交接',
        `已整理交接记录：训练目标、${snapshot.completedCount} 节已完成课程、疼痛变化、会员偏好与投诉原因；匹配${nc?.name}教练，待其阅读确认。`)
      this.persist()
    },

    // ---------- 新教练：阅读交接记录并确认接手（确认后未来课程转入其名下） ----------
    confirmTransfer(transferId: string, coachId: string, note: string, coachName: string) {
      const tr = this.transfers.find(t => t.id === transferId)
      if (!tr || tr.status !== '待新教练确认' || tr.toCoachId !== coachId) return
      tr.status = '试运行中'
      tr.confirmedAt = nowStr()
      tr.confirmNote = note
      const pkg = this.activePackage(tr.memberId)
      if (pkg) pkg.coachId = tr.toCoachId
      this.plans.filter(p => p.memberId === tr.memberId && p.active).forEach(p => { p.coachId = tr.toCoachId })
      const future = this.sessions
        .filter(s => s.memberId === tr.memberId && s.status === '待上课')
        .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
      future.forEach(s => { s.coachId = tr.toCoachId })
      const first = future[0]
      if (first) {
        tr.firstSessionId = first.id
        first.focus = `交接首课 · ${note ? note.slice(0, 30) : '按交接记录过渡'}`
      }
      this.log(tr.memberId, '转教练交接', 'coach', coachName, '新教练确认接手',
        `已阅读交接记录（训练目标/已完成课程/疼痛变化/会员偏好/投诉原因），接手计划：${note}；首节试课 ${first ? `${first.date} ${first.time}` : '待排'}。`, true)
      this.persist()
    },

    // ---------- 新教练：首节试课结束后填写适配反馈 ----------
    submitTransferFeedback(transferId: string, payload: { adaptation: number; memberReaction: string; plan: string; recommend: '建议转入' | '建议观察' | '建议终止' }, coachName: string) {
      const tr = this.transfers.find(t => t.id === transferId)
      if (!tr || tr.status !== '试运行中') return
      const first = tr.firstSessionId ? this.sessions.find(s => s.id === tr.firstSessionId) : undefined
      if (first && first.status !== '已完成') return // 首节试课完成后才能填写
      tr.feedback = { at: nowStr(), ...payload }
      tr.status = '待顾问定夺'
      this.log(tr.memberId, '转教练交接', 'coach', coachName, '首课适配反馈',
        `适配度 ${payload.adaptation}/10；会员课堂反应：${payload.memberReaction}；后续计划：${payload.plan}；${payload.recommend}。`, true)
      this.persist()
    },

    // ---------- 顾问：试运行期间跟踪（会员满意度 + 新教练反馈） ----------
    addTransferCheckIn(transferId: string, satisfaction: number, coachNote: string, note: string, consultantName: string) {
      const tr = this.transfers.find(t => t.id === transferId)
      if (!tr || (tr.status !== '试运行中' && tr.status !== '待顾问定夺')) return
      tr.checkIns.push({ id: uid('ck'), at: nowStr(), by: consultantName, satisfaction, coachNote, note })
      this.log(tr.memberId, '转教练交接', 'consultant', consultantName, '试运行跟踪',
        `会员满意度 ${satisfaction}/10；新教练反馈：${coachNote}；${note}`)
      this.persist()
    },

    // ---------- 顾问：定夺（稳定转入 / 仍不适配则退课、转团课、换目标方案或回原教练） ----------
    decideTransfer(transferId: string, result: '稳定转入' | '退课' | '转团课' | '换目标方案' | '回原教练', note: string, consultantName: string) {
      const tr = this.transfers.find(t => t.id === transferId)
      if (!tr || tr.status === '已稳定转入' || tr.status === '已终止') return
      tr.decision = { at: nowStr(), by: consultantName, result, note }
      const pkg = this.activePackage(tr.memberId)
      const cancelFuture = () => {
        this.sessions.filter(s => s.memberId === tr.memberId && s.status === '待上课').forEach(s => { s.status = '已取消' })
        this.plans.filter(p => p.memberId === tr.memberId && p.active).forEach(p => { p.active = false })
      }
      if (result === '稳定转入') {
        tr.status = '已稳定转入'
      } else if (result === '退课') {
        if (pkg) pkg.status = '已退课'
        cancelFuture()
        tr.status = '已终止'
      } else if (result === '转团课') {
        if (pkg) pkg.status = '已转团课'
        cancelFuture()
        tr.status = '已终止'
      } else if (result === '换目标方案') {
        // 会员继续跟随当前（新）教练，按新目标方案过渡
        const b = this.bookingOf(tr.memberId)
        if (b) b.goalNote = `${b.goalNote ? b.goalNote + '；' : ''}转教练后调整：${note}`
        const next = this.upcomingSessions(tr.memberId)[0]
        if (next) next.focus = `新目标方案过渡课 · ${note.slice(0, 30)}`
        tr.status = '已终止'
      } else if (result === '回原教练') {
        if (pkg) pkg.coachId = tr.fromCoachId
        this.plans.filter(p => p.memberId === tr.memberId && p.active).forEach(p => { p.coachId = tr.fromCoachId })
        this.sessions.filter(s => s.memberId === tr.memberId && s.status === '待上课').forEach(s => { s.coachId = tr.fromCoachId })
        tr.status = '已终止'
      }
      // 关联的「更换教练」工单办结
      const tk = tr.ticketId
        ? this.tickets.find(t => t.id === tr.ticketId)
        : this.tickets.find(t => t.memberId === tr.memberId && t.type === '更换教练' && t.status !== '已解决')
      if (tk) { tk.status = '已解决'; tk.resolution = `转教练交接定夺：${result}。${note}` }
      this.log(tr.memberId, '转教练交接', 'consultant', consultantName, `转教练定夺：${result}`, note)
      this.persist()
    },

    // ---------- 三方：交接沟通记录（会员 / 新教练 / 顾问同一条线程） ----------
    postTransferMessage(transferId: string, fromRole: 'member' | 'consultant' | 'coach', fromName: string, content: string) {
      const tr = this.transfers.find(t => t.id === transferId)
      if (!tr) return
      tr.messages.push({ id: uid('msg'), at: nowStr(), fromRole, fromName, content })
      this.persist()
    },

    // ---------- 顾问：工单处理 ----------
    resolveTicket(ticketId: string, resolution: string, consultantName: string) {
      const tk = this.tickets.find(t => t.id === ticketId)
      if (!tk) return
      tk.status = '已解决'
      tk.resolution = resolution
      this.log(tk.memberId, '工单处理', 'consultant', consultantName, `处理「${tk.title}」`, resolution)
      this.persist()
    },

    // ---------- 顾问：续费跟进（基于真实训练进度） ----------
    followUpRenewal(memberId: string, consultantId: string, summary: string, result: '跟进中' | '已续费' | '暂缓', consultantName: string, renew?: { name: string; totalSessions: number; validDays: number; slots: WeekdaySlot[] }) {
      this.renewals.unshift({ id: uid('rn'), memberId, consultantId, createdAt: nowStr(), summary, result })
      this.log(memberId, '续费', 'consultant', consultantName, '续费跟进', summary)
      if (result === '已续费' && renew) {
        const old = this.activePackage(memberId)
        if (old) old.status = '已续费衔接'
        this.purchasePackage(memberId, old?.coachId ?? '', renew.name, renew.totalSessions, renew.validDays, renew.slots, consultantName)
        // purchasePackage 内部已 persist
      }
      const tk = this.tickets.find(t => t.memberId === memberId && t.type === '课包到期' && t.status !== '已解决')
      if (tk && result !== '跟进中') { tk.status = '已解决'; tk.resolution = `续费跟进结果：${result}` }
      this.persist()
    },

    // ---------- 投诉 ----------
    addComplaint(memberId: string, content: string, memberName: string) {
      this.complaints.unshift({ id: uid('cp'), memberId, content, createdAt: nowStr(), status: '待处理', reply: '' })
      this.log(memberId, '投诉', 'member', memberName, '提交投诉', content)
      this.persist()
    },
    replyComplaint(id: string, reply: string, consultantName: string) {
      const c = this.complaints.find(x => x.id === id)
      if (!c) return
      c.status = '已回复'
      c.reply = reply
      this.log(c.memberId, '工单处理', 'consultant', consultantName, '回复投诉', reply)
      this.persist()
    },

    setSessionFocus(sessionId: string, focus: string) {
      const ss = this.sessions.find(x => x.id === sessionId)
      if (ss) { ss.focus = focus; this.persist() }
    },
  },
})

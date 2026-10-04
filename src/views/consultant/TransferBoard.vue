<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import type { CoachProfile, CoachTransfer } from '../../types'

const route = useRoute()
const auth = useAuthStore()
const data = useDataStore()
const myName = auth.current!.name

// ---------- 发起交接 ----------
const initForm = reactive({
  memberId: (route.query.memberId as string) || '',
  ticketId: (route.query.ticketId as string) || '',
  toCoachId: '',
  reason: '',
})
const msg = ref('')

function flash(t: string) {
  msg.value = t
  setTimeout(() => (msg.value = ''), 3000)
}

/** 可发起交接的会员：有进行中课包且当前无进行中的交接 */
const candidates = computed(() =>
  data.memberIds
    .filter(id => data.activePackage(id) && !data.activeTransferOf(id))
    .map(id => ({ id, name: data.nameOf(id), pkg: data.activePackage(id)! }))
)

const pickedMember = computed(() => candidates.value.find(c => c.id === initForm.memberId))
const pickedBooking = computed(() => initForm.memberId ? data.bookingOf(initForm.memberId) : undefined)

/** 关联的待处理「更换教练」工单（用于把工单与交接关联） */
const memberTicket = computed(() => {
  if (initForm.ticketId) return data.tickets.find(t => t.id === initForm.ticketId)
  return data.tickets.find(t => t.memberId === initForm.memberId && t.type === '更换教练' && t.status !== '已解决')
})

/** 自动整理的交接快照预览 */
const snapshot = computed(() =>
  initForm.memberId ? data.snapshotPreview(initForm.memberId, memberTicket.value?.id) : null
)

const goalToSpecialty: Record<string, string[]> = {
  体态矫正: ['体态矫正'],
  康复舒缓: ['理疗瑜伽', '膝关节养护', '脊柱保养'],
  柔韧提升: ['阴瑜伽'],
  减压助眠: ['减压助眠', '阴瑜伽'],
  减脂塑形: ['减脂塑形', '力量流'],
  力量提升: ['力量流', '阿斯汤加'],
}

/** 新教练候选：排除当前教练；介意异性 → 仅女教练；按目标匹配度排序 */
const coachOptions = computed<CoachProfile[]>(() => {
  if (!pickedMember.value) return []
  let list = data.coaches.filter(c => c.id !== pickedMember.value!.pkg.coachId)
  if (pickedBooking.value?.mindOppositeGenderCoach) list = list.filter(c => c.gender === '女')
  const wanted = (pickedBooking.value?.goals ?? []).flatMap(g => goalToSpecialty[g] ?? [])
  return [...list].sort((a, z) => {
    const am = a.specialties.some(s => wanted.includes(s)) ? 0 : 1
    const zm = z.specialties.some(s => wanted.includes(s)) ? 0 : 1
    return am - zm
  })
})

function isRecommended(c: CoachProfile) {
  const wanted = (pickedBooking.value?.goals ?? []).flatMap(g => goalToSpecialty[g] ?? [])
  return wanted.length > 0 && c.specialties.some(s => wanted.includes(s))
}

function initiate() {
  if (!initForm.memberId) { alert('请选择会员'); return }
  if (!initForm.toCoachId) { alert('请选择新教练'); return }
  if (!initForm.reason.trim()) { alert('请填写转教练原因（将写入交接记录）'); return }
  data.initiateTransfer(initForm.memberId, initForm.toCoachId, initForm.reason, myName, memberTicket.value?.id)
  flash('交接已发起：快照已整理，等待新教练阅读并确认')
  initForm.memberId = ''
  initForm.ticketId = ''
  initForm.toCoachId = ''
  initForm.reason = ''
}

// ---------- 交接单列表 ----------
const transfers = computed(() =>
  [...data.transfers].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
)

const statusClass: Record<string, string> = {
  待新教练确认: 'amber', 试运行中: 'clay', 待顾问定夺: 'danger', 已稳定转入: '', 已终止: 'gray',
}

const steps = ['发起交接', '新教练确认', '首节试课', '适配反馈', '顾问定夺']
function stepOf(t: CoachTransfer): number {
  if (t.status === '待新教练确认') return 1
  if (t.status === '试运行中') return t.firstSessionId && data.sessions.find(s => s.id === t.firstSessionId)?.status === '已完成' ? 3 : 2
  if (t.status === '待顾问定夺') return 4
  return 5
}

function firstSessionOf(t: CoachTransfer) {
  return t.firstSessionId ? data.sessions.find(s => s.id === t.firstSessionId) : undefined
}

/** 仍不适配判定：适配反馈建议终止 / 适配度 ≤4 / 最近满意度 ≤5 */
function notFitting(t: CoachTransfer): boolean {
  if (t.feedback && (t.feedback.recommend === '建议终止' || t.feedback.adaptation <= 4)) return true
  const last = t.checkIns[t.checkIns.length - 1]
  return !!last && last.satisfaction <= 5
}

// ---------- 试运行跟踪 ----------
const checkIns = reactive<Record<string, { satisfaction: number; coachNote: string; note: string }>>({})
function checkInOf(id: string) {
  if (!checkIns[id]) checkIns[id] = { satisfaction: 7, coachNote: '', note: '' }
  return checkIns[id]
}
function addCheckIn(t: CoachTransfer) {
  const f = checkInOf(t.id)
  if (!f.coachNote.trim() || !f.note.trim()) { alert('请填写新教练反馈与跟踪备注'); return }
  data.addTransferCheckIn(t.id, f.satisfaction, f.coachNote, f.note, myName)
  checkIns[t.id] = { satisfaction: 7, coachNote: '', note: '' }
  flash('跟踪记录已保存')
}

// ---------- 定夺 ----------
const decisions = reactive<Record<string, { result: '稳定转入' | '退课' | '转团课' | '换目标方案' | '回原教练'; note: string }>>({})
function decisionOf(t: CoachTransfer) {
  if (!decisions[t.id]) decisions[t.id] = { result: notFitting(t) ? '退课' : '稳定转入', note: '' }
  return decisions[t.id]
}
function decide(t: CoachTransfer) {
  const d = decisionOf(t)
  if (!d.note.trim()) { alert('请填写定夺说明（将写入训练记录）'); return }
  const label = { 稳定转入: '确认稳定转入', 退课: '办理退课', 转团课: '转为团课', 换目标方案: '更换目标方案', 回原教练: '退回原教练' }[d.result]
  if (!confirm(`确定${label}吗？该操作会写入会员训练记录。`)) return
  data.decideTransfer(t.id, d.result, d.note, myName)
  flash(`已定夺：${d.result}`)
}

// ---------- 沟通记录 ----------
const drafts = reactive<Record<string, string>>({})
function post(t: CoachTransfer) {
  const c = drafts[t.id]?.trim()
  if (!c) { alert('请填写沟通内容'); return }
  data.postTransferMessage(t.id, 'consultant', myName, c)
  drafts[t.id] = ''
}

const roleLabel: Record<string, string> = { member: '会员', coach: '教练', consultant: '顾问' }
</script>

<template>
  <div class="page">
    <h2 class="page-title">转教练交接</h2>
    <p class="page-sub">会员认为教练风格不合适时，在这里发起结构化交接：自动整理训练目标、已完成课程、疼痛变化、会员偏好与投诉原因；新教练阅读确认后进入试运行，首节试课后提交适配反馈，顾问跟踪满意度并定夺。</p>

    <div v-if="msg" class="banner warn">{{ msg }}</div>

    <!-- 发起交接 -->
    <div class="card">
      <h3>发起转教练交接</h3>
      <div class="grid cols-2">
        <div class="form-row">
          <label>选择会员（有进行中课包）</label>
          <select v-model="initForm.memberId">
            <option value="" disabled>请选择</option>
            <option v-for="c in candidates" :key="c.id" :value="c.id">
              {{ c.name }} · {{ c.pkg.name }}（{{ c.pkg.usedSessions }}/{{ c.pkg.totalSessions }} 节）
            </option>
          </select>
        </div>
        <div class="form-row">
          <label>新教练{{ pickedBooking?.mindOppositeGenderCoach ? '（会员介意异性教练 → 仅女教练）' : '' }}</label>
          <select v-model="initForm.toCoachId" :disabled="!initForm.memberId">
            <option value="" disabled>请选择</option>
            <option v-for="c in coachOptions" :key="c.id" :value="c.id">
              {{ c.name }}（{{ c.gender }} · {{ c.specialties.join('/') }}）{{ isRecommended(c) ? '★ 目标匹配' : '' }}
            </option>
          </select>
        </div>
      </div>

      <!-- 自动整理的交接快照 -->
      <div v-if="snapshot" class="locked mb8">
        <div class="lock-head">📋 交接记录自动整理（新教练接手前需阅读并确认）</div>
        <dl class="kv">
          <dt>训练目标</dt><dd>{{ snapshot.goals }}</dd>
          <dt>已完成课程</dt><dd>{{ snapshot.completedCount }} / {{ snapshot.totalCount }} 节</dd>
          <dt>最近课程</dt>
          <dd>
            <div v-for="(r, i) in snapshot.recentCourses" :key="i" style="font-size: 13px">{{ r }}</div>
            <span v-if="!snapshot.recentCourses.length" class="muted">暂无课后记录</span>
          </dd>
          <dt>疼痛变化</dt><dd>{{ snapshot.painSummary }}</dd>
          <dt>会员偏好</dt><dd>{{ snapshot.preferences }}</dd>
          <dt>投诉原因</dt><dd>{{ snapshot.complaintReason }}</dd>
        </dl>
      </div>
      <div v-if="memberTicket" class="banner warn mb8">
        🔗 将关联工单「{{ memberTicket.title }}」，交接定夺后该工单自动办结。
      </div>

      <div class="form-row">
        <label>转教练原因（顾问整理，写入交接记录）</label>
        <textarea v-model="initForm.reason" placeholder="如：会员反馈课程强度偏大、沟通节奏不适应，希望更换为女教练；电话沟通确认后发起交接。"></textarea>
      </div>
      <button :disabled="!candidates.length" @click="initiate">发起交接（等待新教练确认）</button>
      <div v-if="!candidates.length" class="muted mt8">暂无可发起交接的会员（需有进行中课包且无进行中的交接）。</div>
    </div>

    <!-- 交接单列表 -->
    <div v-if="!transfers.length" class="card"><div class="empty">暂无转教练交接单</div></div>

    <div v-for="t in transfers" :key="t.id" class="card">
      <div class="between">
        <h3 style="margin: 0">
          {{ data.nameOf(t.memberId) }}
          <span class="muted" style="font-weight: 400">{{ data.coachById(t.fromCoachId)?.name }} → {{ data.coachById(t.toCoachId)?.name }}</span>
          <span class="tag" :class="statusClass[t.status]">{{ t.status }}</span>
        </h3>
        <span class="muted">{{ t.createdAt }} · {{ t.createdBy }} 发起</span>
      </div>

      <!-- 流程进度 -->
      <div class="steps mt8 mb8">
        <span v-for="(s, i) in steps" :key="s" class="step" :class="{ done: i < stepOf(t), now: i === stepOf(t) - 1 && !['已稳定转入', '已终止'].includes(t.status) }">{{ s }}</span>
      </div>

      <p style="margin: 4px 0 8px"><b>转教练原因：</b>{{ t.reason }}</p>

      <!-- 交接快照 -->
      <details class="mb8">
        <summary style="cursor: pointer; color: var(--sage-deep); font-size: 14px">📋 交接记录快照（发起时整理）</summary>
        <dl class="kv mt8">
          <dt>训练目标</dt><dd>{{ t.snapshot.goals }}</dd>
          <dt>已完成课程</dt><dd>{{ t.snapshot.completedCount }} / {{ t.snapshot.totalCount }} 节</dd>
          <dt>最近课程</dt>
          <dd>
            <div v-for="(r, i) in t.snapshot.recentCourses" :key="i" style="font-size: 13px">{{ r }}</div>
            <span v-if="!t.snapshot.recentCourses.length" class="muted">暂无课后记录</span>
          </dd>
          <dt>疼痛变化</dt><dd>{{ t.snapshot.painSummary }}</dd>
          <dt>会员偏好</dt><dd>{{ t.snapshot.preferences }}</dd>
          <dt>投诉原因</dt><dd>{{ t.snapshot.complaintReason }}</dd>
        </dl>
      </details>

      <!-- 新教练确认 -->
      <div v-if="t.confirmedAt" class="banner mb8">
        ✅ 新教练 {{ data.coachById(t.toCoachId)?.name }} 已于 {{ t.confirmedAt }} 阅读交接记录并确认接手。接手计划：{{ t.confirmNote }}
        <div v-if="firstSessionOf(t)" class="muted mt8">
          首节试课：{{ firstSessionOf(t)!.date }} {{ firstSessionOf(t)!.time }}（{{ firstSessionOf(t)!.status }}）
        </div>
      </div>

      <!-- 首课适配反馈 -->
      <div v-if="t.feedback" class="banner mb8" :class="notFitting(t) ? 'danger' : 'warn'">
        📝 首课适配反馈（{{ t.feedback.at }}）：适配度 <b>{{ t.feedback.adaptation }}/10</b> · {{ t.feedback.recommend }}<br />
        会员课堂反应：{{ t.feedback.memberReaction }}<br />
        后续计划：{{ t.feedback.plan }}
      </div>

      <!-- 试运行跟踪 -->
      <div class="mb8">
        <h3 style="margin: 0 0 8px; font-size: 14px">试运行跟踪（会员满意度 + 新教练反馈）</h3>
        <div v-for="c in t.checkIns" :key="c.id" class="mb8" style="border-bottom: 1px dashed var(--line); padding-bottom: 6px; font-size: 13px">
          <span class="tag" :class="c.satisfaction <= 5 ? 'danger' : ''">满意度 {{ c.satisfaction }}/10</span>
          <span class="muted">{{ c.at }} · {{ c.by }}</span>
          <div>新教练反馈：{{ c.coachNote }}</div>
          <div class="muted">{{ c.note }}</div>
        </div>
        <div v-if="!t.checkIns.length" class="muted" style="font-size: 13px">暂无跟踪记录</div>

        <div v-if="t.status === '试运行中' || t.status === '待顾问定夺'" class="row mt8">
          <label style="margin: 0">满意度 {{ checkInOf(t.id).satisfaction }}</label>
          <input v-model.number="checkInOf(t.id).satisfaction" type="range" min="1" max="10" style="width: 120px" />
          <input v-model="checkInOf(t.id).coachNote" placeholder="新教练反馈摘要" style="flex: 1; min-width: 160px" />
          <input v-model="checkInOf(t.id).note" placeholder="跟踪备注（如：会员课后感受）" style="flex: 1; min-width: 160px" />
          <button class="small" @click="addCheckIn(t)">保存跟踪</button>
        </div>
      </div>

      <!-- 顾问定夺 -->
      <div v-if="t.status === '试运行中' || t.status === '待顾问定夺'" class="locked mb8">
        <div class="lock-head">⚖️ 顾问定夺</div>
        <div v-if="notFitting(t)" class="banner danger mb8">
          ⚠️ 仍不适配信号：{{ t.feedback?.recommend === '建议终止' ? '新教练建议终止' : '' }}{{ t.feedback && t.feedback.adaptation <= 4 ? '适配度偏低' : '' }}{{ t.checkIns[t.checkIns.length - 1]?.satisfaction <= 5 ? '会员满意度偏低' : '' }}。
          建议：
          <button class="small danger" @click="decisionOf(t).result = '退课'">退课</button>
          <button class="small warn" @click="decisionOf(t).result = '转团课'">转团课</button>
          <button class="small ghost" @click="decisionOf(t).result = '换目标方案'">换目标方案</button>
        </div>
        <div class="checks mb8">
          <label v-for="r in (['稳定转入', '退课', '转团课', '换目标方案', '回原教练'] as const)" :key="r" :class="{ on: decisionOf(t).result === r }">
            <input type="radio" :value="r" v-model="decisionOf(t).result" />{{ r }}
          </label>
        </div>
        <div class="row">
          <input v-model="decisionOf(t).note" placeholder="定夺说明（写入训练记录，如：剩余 18 节折算团课季卡 / 调整目标为减压舒缓）" style="flex: 1" />
          <button class="small" @click="decide(t)">提交定夺</button>
        </div>
      </div>

      <!-- 定夺结果 -->
      <div v-if="t.decision" class="banner mb8" :class="t.decision.result === '稳定转入' ? '' : 'warn'">
        ⚖️ 定夺：{{ t.decision.result }}（{{ t.decision.at }} · {{ t.decision.by }}）—— {{ t.decision.note }}
      </div>

      <!-- 双方沟通记录 -->
      <div>
        <h3 style="margin: 0 0 8px; font-size: 14px">双方沟通记录（{{ t.messages.length }}）</h3>
        <div v-for="m in t.messages" :key="m.id" class="mb8" style="font-size: 13px">
          <span class="tag" :class="m.fromRole === 'member' ? 'amber' : m.fromRole === 'coach' ? 'clay' : ''">{{ m.fromName }} · {{ roleLabel[m.fromRole] }}</span>
          <span class="muted">{{ m.at }}</span>
          <div>{{ m.content }}</div>
        </div>
        <div v-if="!t.messages.length" class="muted" style="font-size: 13px">暂无沟通记录</div>
        <div class="row mt8">
          <input v-model="drafts[t.id]" placeholder="以顾问身份留言（会员与新教练可见）" style="flex: 1" @keyup.enter="post(t)" />
          <button class="small" @click="post(t)">发送</button>
        </div>
      </div>

      <div class="row mt8">
        <router-link :to="`/consultant/member/${t.memberId}`">
          <button class="small ghost">查看 {{ data.nameOf(t.memberId) }} 的完整训练记录 →</button>
        </router-link>
      </div>
    </div>
  </div>
</template>

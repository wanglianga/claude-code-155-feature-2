<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import type { CoachTransfer } from '../../types'

const auth = useAuthStore()
const data = useDataStore()
const coachId = auth.current!.id
const coachName = auth.current!.name

const msg = ref('')
function flash(t: string) {
  msg.value = t
  setTimeout(() => (msg.value = ''), 3000)
}

/** 转入我的交接（待确认 / 试运行 / 待定夺 / 历史） */
const incoming = computed(() => data.transfersForCoach(coachId).filter(t => t.toCoachId === coachId))
const outgoing = computed(() => data.transfersForCoach(coachId).filter(t => t.fromCoachId === coachId && t.toCoachId !== coachId))

const pending = computed(() => incoming.value.filter(t => t.status === '待新教练确认'))
const inTrial = computed(() => incoming.value.filter(t => t.status === '试运行中' || t.status === '待顾问定夺'))
const closed = computed(() => incoming.value.filter(t => t.status === '已稳定转入' || t.status === '已终止'))

const statusClass: Record<string, string> = {
  待新教练确认: 'amber', 试运行中: 'clay', 待顾问定夺: 'danger', 已稳定转入: '', 已终止: 'gray',
}

function firstSessionOf(t: CoachTransfer) {
  return t.firstSessionId ? data.sessions.find(s => s.id === t.firstSessionId) : undefined
}

// ---------- 确认接手 ----------
const confirmNotes = reactive<Record<string, string>>({})
function confirm(t: CoachTransfer) {
  const note = confirmNotes[t.id]?.trim()
  if (!note) { alert('请填写接手计划（将同步为首节试课重点）'); return }
  data.confirmTransfer(t.id, coachId, note, coachName)
  confirmNotes[t.id] = ''
  flash('已确认接手：未来课程已转入你的课表，首节试课重点已更新')
}

// ---------- 首课适配反馈 ----------
const feedbacks = reactive<Record<string, { adaptation: number; memberReaction: string; plan: string; recommend: '建议转入' | '建议观察' | '建议终止' }>>({})
function feedbackOf(id: string) {
  if (!feedbacks[id]) feedbacks[id] = { adaptation: 7, memberReaction: '', plan: '', recommend: '建议转入' }
  return feedbacks[id]
}
function submitFeedback(t: CoachTransfer) {
  const f = feedbackOf(t.id)
  if (!f.memberReaction.trim() || !f.plan.trim()) { alert('请填写会员课堂反应与后续计划'); return }
  data.submitTransferFeedback(t.id, { ...f }, coachName)
  flash('适配反馈已提交，等待顾问定夺')
}

// ---------- 沟通记录 ----------
const drafts = reactive<Record<string, string>>({})
function post(t: CoachTransfer) {
  const c = drafts[t.id]?.trim()
  if (!c) { alert('请填写沟通内容'); return }
  data.postTransferMessage(t.id, 'coach', coachName, c)
  drafts[t.id] = ''
}

const roleLabel: Record<string, string> = { member: '会员', coach: '教练', consultant: '顾问' }
</script>

<template>
  <div class="page">
    <h2 class="page-title">交接任务 · {{ coachName }}</h2>
    <p class="page-sub">接手新会员前，请先完整阅读顾问整理的交接记录（训练目标 / 已完成课程 / 疼痛变化 / 会员偏好 / 投诉原因），确认后进入试运行；首节试课结束后填写适配反馈。</p>

    <div v-if="msg" class="banner warn">{{ msg }}</div>

    <!-- 待确认交接 -->
    <div v-for="t in pending" :key="t.id" class="card">
      <div class="between">
        <h3 style="margin: 0">
          📥 待确认交接：{{ data.nameOf(t.memberId) }}
          <span class="tag amber">待新教练确认</span>
        </h3>
        <span class="muted">{{ t.createdAt }} · 顾问 {{ t.createdBy }} 发起</span>
      </div>
      <p style="margin: 8px 0"><b>转教练原因：</b>{{ t.reason }}</p>

      <div class="locked mb8">
        <div class="lock-head">📋 交接记录（请完整阅读后确认接手）</div>
        <dl class="kv">
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
        <div class="mt8">
          <router-link :to="`/coach/member/${t.memberId}`">
            <button class="small ghost">查看 {{ data.nameOf(t.memberId) }} 的完整训练档案（测评 / 课后记录 / 疼痛趋势）→</button>
          </router-link>
        </div>
      </div>

      <div class="form-row">
        <label>接手计划（确认后同步为首节试课重点）</label>
        <textarea v-model="confirmNotes[t.id]" placeholder="如：首课以体态复测与低强度序列为主，节奏放缓，先建立信任；沿用既有疼痛养护方案。"></textarea>
      </div>
      <button @click="confirm(t)">已阅读交接记录，确认接手</button>
    </div>

    <!-- 试运行中 / 待顾问定夺 -->
    <div v-for="t in inTrial" :key="t.id" class="card">
      <div class="between">
        <h3 style="margin: 0">
          {{ data.nameOf(t.memberId) }} · 试运行
          <span class="tag" :class="statusClass[t.status]">{{ t.status }}</span>
        </h3>
        <span class="muted">确认于 {{ t.confirmedAt }}</span>
      </div>

      <div class="banner mb8 mt8">
        首节试课：
        <template v-if="firstSessionOf(t)">
          {{ firstSessionOf(t)!.date }} {{ firstSessionOf(t)!.time }}（{{ firstSessionOf(t)!.status }}）
          <router-link v-if="firstSessionOf(t)!.status === '待上课'" :to="'/coach/session/' + firstSessionOf(t)!.id">
            <button class="small">去上课并填写课后记录 →</button>
          </router-link>
        </template>
        <span v-else>待排课</span>
      </div>

      <!-- 适配反馈表单：首节试课完成后可填 -->
      <div v-if="t.status === '试运行中'">
        <div v-if="firstSessionOf(t)?.status === '已完成'" class="locked">
          <div class="lock-head">📝 首节试课适配反馈（提交后顾问定夺）</div>
          <div class="grid cols-2">
            <div class="form-row">
              <label>适配度评分（1 很不适配 - 10 非常适配）：{{ feedbackOf(t.id).adaptation }}</label>
              <input v-model.number="feedbackOf(t.id).adaptation" type="range" min="1" max="10" />
            </div>
            <div class="form-row">
              <label>建议</label>
              <div class="checks">
                <label v-for="r in (['建议转入', '建议观察', '建议终止'] as const)" :key="r" :class="{ on: feedbackOf(t.id).recommend === r }">
                  <input type="radio" :value="r" v-model="feedbackOf(t.id).recommend" />{{ r }}
                </label>
              </div>
            </div>
          </div>
          <div class="form-row">
            <label>会员课堂反应</label>
            <textarea v-model="feedbackOf(t.id).memberReaction" placeholder="如：会员对节奏适应良好，主动沟通增多；前半段仍有些拘谨。"></textarea>
          </div>
          <div class="form-row">
            <label>后续计划建议</label>
            <textarea v-model="feedbackOf(t.id).plan" placeholder="如：沿用低强度序列，2 周后复测；每周三 20:00 固定。"></textarea>
          </div>
          <button @click="submitFeedback(t)">提交适配反馈</button>
        </div>
        <div v-else class="banner warn">首节试课完成后，在这里填写适配反馈。</div>
      </div>

      <!-- 已提交的反馈 -->
      <div v-if="t.feedback" class="banner warn mb8">
        ✅ 适配反馈已提交（{{ t.feedback.at }}）：适配度 {{ t.feedback.adaptation }}/10 · {{ t.feedback.recommend }}，等待顾问定夺。
      </div>

      <!-- 沟通记录 -->
      <h3 style="margin: 12px 0 8px; font-size: 14px">双方沟通记录（{{ t.messages.length }}）</h3>
      <div v-for="m in t.messages" :key="m.id" class="mb8" style="font-size: 13px">
        <span class="tag" :class="m.fromRole === 'member' ? 'amber' : m.fromRole === 'coach' ? 'clay' : ''">{{ m.fromName }} · {{ roleLabel[m.fromRole] }}</span>
        <span class="muted">{{ m.at }}</span>
        <div>{{ m.content }}</div>
      </div>
      <div class="row mt8">
        <input v-model="drafts[t.id]" placeholder="留言（会员与顾问可见）" style="flex: 1" @keyup.enter="post(t)" />
        <button class="small" @click="post(t)">发送</button>
      </div>
    </div>

    <!-- 已结束 -->
    <div v-if="closed.length" class="card">
      <h3>已结束的交接</h3>
      <div v-for="t in closed" :key="t.id" class="mb8" style="border-bottom: 1px solid var(--line); padding-bottom: 8px">
        <div>
          <b>{{ data.nameOf(t.memberId) }}</b>
          <span class="tag" :class="statusClass[t.status]">{{ t.status }}</span>
          <span v-if="t.decision" class="tag" :class="t.decision.result === '稳定转入' ? '' : 'gray'">{{ t.decision.result }}</span>
        </div>
        <div v-if="t.decision" class="muted">定夺：{{ t.decision.note }}（{{ t.decision.at }} · {{ t.decision.by }}）</div>
      </div>
    </div>

    <!-- 我转出的会员 -->
    <div v-if="outgoing.length" class="card">
      <h3>我转出的会员（交接记录已完整移交）</h3>
      <div v-for="t in outgoing" :key="t.id" class="mb8" style="font-size: 14px">
        <b>{{ data.nameOf(t.memberId) }}</b> → {{ data.coachById(t.toCoachId)?.name }}
        <span class="tag" :class="statusClass[t.status]">{{ t.status }}</span>
        <div class="muted">{{ t.reason }}</div>
      </div>
    </div>

    <div v-if="!incoming.length && !outgoing.length" class="card"><div class="empty">暂无交接任务</div></div>
  </div>
</template>

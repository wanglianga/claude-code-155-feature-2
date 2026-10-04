<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import TransferSteps from '../../components/TransferSteps.vue'
import ProfessionalProfile from '../../components/ProfessionalProfile.vue'
import { weekdayCn } from '../../utils/date'
import type { TransferDecision } from '../../types'

const route = useRoute()
const auth = useAuthStore()
const data = useDataStore()
const myName = auth.current!.name

const tr = computed(() => data.transferById(route.params.id as string))
const member = computed(() => tr.value ? data.accountById(tr.value.memberId) : undefined)
const firstSession = computed(() => tr.value?.firstSessionId ? data.sessions.find(s => s.id === tr.value!.firstSessionId) : undefined)
const trend = computed(() => tr.value ? data.painTrend(tr.value.memberId) : [])
const doneSessions = computed(() =>
  tr.value ? data.sessionsOf(tr.value.memberId).filter(s => s.status === '已完成')
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + b.time)) : [],
)
const latestSatisfaction = computed(() => tr.value?.satisfactions[0])

// 反馈倾向不适配 → 页面建议退课 / 转团课 / 换目标方案
const unfitSignal = computed(() => {
  const t = tr.value
  if (!t) return false
  return t.adaptFeedback?.fitness === '不适配' || (latestSatisfaction.value?.score ?? 5) <= 2
})

const canDecide = computed(() => tr.value?.status === '试运行中' || tr.value?.status === '待顾问决定')

const decide = reactive({ result: '稳定转入' as TransferDecision, note: '' })
const decideOpts: { key: TransferDecision; desc: string; bad?: boolean }[] = [
  { key: '稳定转入', desc: '试运行适配，会员正式转入新教练名下继续训练' },
  { key: '退课', desc: '结束课包，剩余课时按规则退费，待上课程取消', bad: true },
  { key: '转团课', desc: '私教转为团课方案，剩余私教课时取消', bad: true },
  { key: '换目标方案', desc: '课包继续，与会员重新对齐训练目标与计划', bad: true },
]
const msg = ref('')

function submitDecision() {
  if (!decide.note.trim()) { alert('请填写决定说明（将写入训练记录并保留沟通记录）'); return }
  data.decideTransfer(tr.value!.id, decide.result, decide.note.trim(), myName)
  decide.note = ''
  msg.value = '已保存决定，流程完结'
  setTimeout(() => (msg.value = ''), 2500)
}

const noteText = ref('')
function addNote() {
  if (!noteText.value.trim()) return
  data.addTransferNote(tr.value!.id, 'consultant', auth.current!.id, noteText.value.trim())
  noteText.value = ''
}

const roleLabel: Record<string, string> = { member: '会员', coach: '教练', consultant: '顾问' }
</script>

<template>
  <div class="page" v-if="tr && member">
    <div class="between">
      <div>
        <h2 class="page-title">转教练交接 · {{ member.name }}</h2>
        <p class="page-sub">
          {{ data.coachById(tr.fromCoachId)?.name }} → {{ data.coachById(tr.toCoachId)?.name }}
          · 顾问 {{ data.nameOf(tr.consultantId) }} 发起于 {{ tr.createdAt }}
        </p>
      </div>
      <router-link :to="`/consultant/member/${tr.memberId}`"><button class="small ghost">会员 360° →</button></router-link>
    </div>

    <div class="card"><TransferSteps :status="tr.status" /></div>
    <div v-if="msg" class="banner warn">{{ msg }}</div>

    <!-- 交接资料 -->
    <div class="card">
      <h3>交接资料（顾问整理，新教练接手前已阅读）</h3>
      <dl class="kv">
        <dt>转教练原因</dt><dd>{{ tr.reason }}</dd>
        <dt>训练目标</dt><dd><span v-for="g in tr.goals" :key="g" class="tag">{{ g }}</span></dd>
        <dt>会员偏好</dt><dd>{{ tr.preference || '—' }}</dd>
        <dt>投诉与不适</dt><dd style="white-space: pre-line">{{ tr.complaintSummary || '无' }}</dd>
        <dt>交接说明</dt><dd>{{ tr.handoverNote }}</dd>
      </dl>
    </div>

    <!-- 训练数据摘要 -->
    <div class="card">
      <h3>已完成课程与疼痛变化（{{ doneSessions.length }} 节已完成）</h3>
      <div class="grid cols-2">
        <div>
          <div v-for="s in doneSessions.slice(0, 5)" :key="s.id" class="mb8" style="font-size: 13px; border-bottom: 1px dashed var(--line); padding-bottom: 6px">
            <b>{{ s.date }}（{{ weekdayCn(s.date) }}）</b> {{ s.focus }}
            <div v-if="data.recordOf(s.id)" class="muted">
              体感 {{ data.recordOf(s.id)!.memberFeel }}/10
              <span v-if="data.recordOf(s.id)!.painChanges.length">
                · {{ data.recordOf(s.id)!.painChanges.map(p => `${p.part}${p.before}→${p.after}`).join('，') }}
              </span>
              · {{ data.recordOf(s.id)!.coachNote }}
            </div>
          </div>
          <div v-if="!doneSessions.length" class="empty">暂无已完成课程</div>
        </div>
        <div>
          <template v-if="trend.length">
            <div v-for="(t, i) in trend" :key="i" class="pain-bar mb8">
              <span class="muted" style="width: 90px">{{ t.date.slice(0, 10) }}</span>
              <span style="width: 50px">{{ t.part }}</span>
              <span class="pain-dots"><i v-for="n in 10" :key="n" :class="{ on: n <= t.after }"></i></span>
              <span>{{ t.before }}→{{ t.after }}</span>
            </div>
          </template>
          <div v-else class="empty">无疼痛记录</div>
        </div>
      </div>
      <ProfessionalProfile :member-id="tr.memberId" viewer-role="consultant" />
    </div>

    <!-- 试运行跟踪 -->
    <div class="card">
      <h3>试运行跟踪</h3>
      <dl class="kv">
        <dt>新教练确认</dt>
        <dd v-if="tr.coachConfirmedAt">{{ tr.coachConfirmedAt }} 已阅读交接记录并确认接手<span v-if="tr.coachConfirmNote">：{{ tr.coachConfirmNote }}</span></dd>
        <dd v-else><span class="tag amber">待 {{ data.coachById(tr.toCoachId)?.name }} 阅读确认</span></dd>
        <dt>试运行首课</dt>
        <dd v-if="firstSession">{{ firstSession.date }}（{{ weekdayCn(firstSession.date) }}）{{ firstSession.time }} · {{ firstSession.status }}</dd>
        <dd v-else>—</dd>
        <dt>首课适配反馈</dt>
        <dd v-if="tr.adaptFeedback">
          <span class="tag" :class="tr.adaptFeedback.fitness === '不适配' ? 'danger' : ''">{{ tr.adaptFeedback.fitness }}</span>
          {{ tr.adaptFeedback.note }}<span class="muted">（{{ tr.adaptFeedback.at }}）</span>
        </dd>
        <dd v-else><span class="muted">待新教练在首课结束后填写</span></dd>
      </dl>
      <h3 class="mt16">会员满意度打卡（{{ tr.satisfactions.length }}）</h3>
      <div v-if="tr.satisfactions.length">
        <div v-for="s in tr.satisfactions" :key="s.id" class="pain-bar mb8">
          <span class="muted" style="width: 130px">{{ s.at }}</span>
          <span class="pain-dots"><i v-for="n in 5" :key="n" :class="{ on: n <= s.score }"></i></span>
          <span>{{ s.score }}/5</span>
          <span class="muted">{{ s.note }}</span>
        </div>
      </div>
      <div v-else class="empty">试运行期间会员暂未打卡，可提醒会员在主页反馈</div>
    </div>

    <!-- 不适配建议 -->
    <div v-if="canDecide && unfitSignal" class="banner danger">
      ⚠️ 反馈倾向不适配（{{ tr.adaptFeedback?.fitness === '不适配' ? '新教练反馈不适配' : `会员满意度 ${latestSatisfaction?.score}/5` }}），
      建议考虑：<b>退课</b>（剩余课时退费）、<b>转团课</b>（转为团课方案）或 <b>换目标方案</b>（重新对齐训练目标）。
    </div>

    <!-- 顾问决定 -->
    <div v-if="canDecide" class="card">
      <h3>顾问决定</h3>
      <p v-if="tr.status === '试运行中'" class="muted" style="margin-top: 0">首课适配反馈尚未提交，建议等待反馈后再决定；如情况紧急也可现在处理。</p>
      <div class="decide-opts">
        <div v-for="o in decideOpts" :key="o.key" class="decide-opt" :class="{ on: decide.result === o.key, bad: o.bad && decide.result === o.key }" @click="decide.result = o.key">
          <b>{{ o.key }}</b>{{ o.desc }}
        </div>
      </div>
      <div class="form-row">
        <label>决定说明（写入训练记录，会员与教练可见）</label>
        <textarea v-model="decide.note" placeholder="如：首课反馈适配、会员满意度 4/5，稳定转入苏晴名下；或：仍不适配，协商剩余课时退费"></textarea>
      </div>
      <button :class="{ danger: decide.result !== '稳定转入' }" @click="submitDecision">确认{{ decide.result }}</button>
    </div>

    <!-- 完结信息 -->
    <div v-if="tr.decision" class="card">
      <h3>流程完结</h3>
      <div class="banner" :class="tr.status === '已稳定转入' ? 'warn' : 'danger'" style="margin-bottom: 0">
        <b>{{ tr.decision.result === '稳定转入' ? '已稳定转入' : `不适配处理：${tr.decision.result}` }}</b>
        · {{ tr.decision.at }}<br />{{ tr.decision.note }}
      </div>
    </div>

    <!-- 双方沟通记录 -->
    <div class="card">
      <h3>双方沟通记录（{{ tr.notes.length }}，流程结束后保留）</h3>
      <div v-for="n in tr.notes" :key="n.id" class="note-item">
        <div class="note-head">{{ n.at }} · {{ n.byName }}（{{ roleLabel[n.byRole] }}）</div>
        <div>{{ n.content }}</div>
      </div>
      <div v-if="!tr.notes.length" class="empty">暂无沟通记录</div>
      <div class="row mt8">
        <input v-model="noteText" placeholder="记录与会员 / 教练的沟通（如电话沟通结论）" style="flex: 1" @keyup.enter="addNote" />
        <button class="small" @click="addNote">添加记录</button>
      </div>
    </div>
  </div>
  <div v-else class="page"><div class="empty">交接流程不存在</div></div>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import TransferSteps from '../../components/TransferSteps.vue'
import ProfessionalProfile from '../../components/ProfessionalProfile.vue'
import { weekdayCn } from '../../utils/date'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const data = useDataStore()
const coachId = auth.current!.id
const myName = auth.current!.name

const tr = computed(() => data.transferById(route.params.id as string))
const isToCoach = computed(() => tr.value?.toCoachId === coachId)
const isFromCoach = computed(() => tr.value?.fromCoachId === coachId)
const member = computed(() => tr.value ? data.accountById(tr.value.memberId) : undefined)
const firstSession = computed(() => tr.value?.firstSessionId ? data.sessions.find(s => s.id === tr.value!.firstSessionId) : undefined)
const trend = computed(() => tr.value ? data.painTrend(tr.value.memberId) : [])
const doneSessions = computed(() =>
  tr.value ? data.sessionsOf(tr.value.memberId).filter(s => s.status === '已完成')
    .sort((a, b) => (b.date + b.time).localeCompare(a.date + b.time)) : [],
)

// 首课已完成且尚未提交适配反馈 → 开放填写
const canFeedback = computed(() =>
  tr.value?.status === '试运行中' && isToCoach.value && firstSession.value?.status === '已完成' && !tr.value.adaptFeedback,
)

const confirmNote = ref('')
const feedback = reactive({ fitness: '基本适配' as '适配' | '基本适配' | '不适配', note: '' })
const noteText = ref('')

function confirm() {
  data.confirmTransfer(tr.value!.id, coachId, confirmNote.value.trim(), myName)
}

function submitFeedback() {
  if (!feedback.note.trim()) { alert('请填写适配反馈说明'); return }
  data.submitAdaptFeedback(tr.value!.id, feedback.fitness, feedback.note.trim(), myName)
}

function addNote() {
  if (!noteText.value.trim()) return
  data.addTransferNote(tr.value!.id, 'coach', coachId, noteText.value.trim())
  noteText.value = ''
}

const roleLabel: Record<string, string> = { member: '会员', coach: '教练', consultant: '顾问' }
</script>

<template>
  <div class="page" v-if="tr && member && (isToCoach || isFromCoach)">
    <h2 class="page-title">转教练交接 · {{ member.name }}</h2>
    <p class="page-sub">
      {{ data.coachById(tr.fromCoachId)?.name }} → {{ data.coachById(tr.toCoachId)?.name }}
      <span v-if="isFromCoach">（你转出的会员，交接资料只读）</span>
    </p>

    <div class="card"><TransferSteps :status="tr.status" /></div>

    <!-- 交接资料：新教练接手前必读 -->
    <div class="card">
      <h3>交接资料{{ isToCoach && tr.status === '待新教练确认' ? '（接手前请完整阅读）' : '' }}</h3>
      <dl class="kv">
        <dt>转教练原因</dt><dd>{{ tr.reason }}</dd>
        <dt>训练目标</dt><dd><span v-for="g in tr.goals" :key="g" class="tag">{{ g }}</span></dd>
        <dt>会员偏好</dt><dd>{{ tr.preference || '—' }}</dd>
        <dt>投诉与不适</dt><dd style="white-space: pre-line">{{ tr.complaintSummary || '无' }}</dd>
        <dt>顾问交接说明</dt><dd>{{ tr.handoverNote }}</dd>
      </dl>
    </div>

    <div class="card">
      <h3>已完成课程与疼痛变化（{{ doneSessions.length }} 节已完成，记录完整交接）</h3>
      <div class="grid cols-2">
        <div>
          <div v-for="s in doneSessions.slice(0, 6)" :key="s.id" class="mb8" style="font-size: 13px; border-bottom: 1px dashed var(--line); padding-bottom: 6px">
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
      <ProfessionalProfile :member-id="tr.memberId" viewer-role="coach" />
    </div>

    <!-- 新教练确认接手 -->
    <div v-if="tr.status === '待新教练确认' && isToCoach" class="card">
      <h3>确认接手</h3>
      <p class="muted" style="margin-top: 0">
        确认后进入试运行：该会员的课包、排课计划与待上课程将转到你的名下，历史测评与课后记录已在上方完整交接。
      </p>
      <div class="form-row">
        <label>确认备注（可选，如：已了解会员偏好，首课计划）</label>
        <input v-model="confirmNote" placeholder="如：已阅读全部记录，首课以相互适应与目标对齐为主" />
      </div>
      <button @click="confirm">已阅读交接记录，确认接手</button>
    </div>

    <!-- 试运行：首课适配反馈 -->
    <div v-if="tr.status === '试运行中' && isToCoach" class="card">
      <h3>首课适配反馈</h3>
      <template v-if="firstSession">
        <p class="muted" style="margin-top: 0">
          试运行首课：{{ firstSession.date }}（{{ weekdayCn(firstSession.date) }}）{{ firstSession.time }} · {{ firstSession.status }}
        </p>
        <div v-if="canFeedback" >
          <div class="form-row">
            <label>适配结论</label>
            <div class="checks">
              <label v-for="f in (['适配', '基本适配', '不适配'] as const)" :key="f" :class="{ on: feedback.fitness === f }">
                <input type="radio" :value="f" v-model="feedback.fitness" />{{ f }}
              </label>
            </div>
          </div>
          <div class="form-row">
            <label>反馈说明（会员状态、沟通配合、训练建议，顾问将据此决定是否稳定转入）</label>
            <textarea v-model="feedback.note" placeholder="如：会员能跟上节奏，沟通顺畅，建议保持低强度力量入门两周"></textarea>
          </div>
          <button @click="submitFeedback">提交适配反馈</button>
        </div>
        <div v-else-if="firstSession.status === '待上课'" class="banner warn" style="margin-bottom: 0">
          第一节课尚未进行。课后请先到
          <a href="javascript:;" @click="router.push(`/coach/session/${firstSession.id}`)">填写课后记录</a>，
          再回到本页提交适配反馈。
        </div>
      </template>
      <div v-else class="empty">该会员暂无待上课程，请联系顾问先排课</div>
    </div>

    <!-- 已提交的适配反馈 -->
    <div v-if="tr.adaptFeedback" class="card">
      <h3>首课适配反馈（已提交）</h3>
      <div>
        <span class="tag" :class="tr.adaptFeedback.fitness === '不适配' ? 'danger' : ''">{{ tr.adaptFeedback.fitness }}</span>
        {{ tr.adaptFeedback.note }}<span class="muted">（{{ tr.adaptFeedback.at }}）</span>
      </div>
      <div v-if="tr.status === '待顾问决定'" class="muted mt8">已提交顾问，等待是否稳定转入的决定。</div>
    </div>

    <!-- 会员满意度（试运行跟踪） -->
    <div v-if="tr.satisfactions.length" class="card">
      <h3>会员满意度打卡</h3>
      <div v-for="s in tr.satisfactions" :key="s.id" class="pain-bar mb8">
        <span class="muted" style="width: 130px">{{ s.at }}</span>
        <span class="pain-dots"><i v-for="n in 5" :key="n" :class="{ on: n <= s.score }"></i></span>
        <span>{{ s.score }}/5</span>
        <span class="muted">{{ s.note }}</span>
      </div>
    </div>

    <!-- 顾问决定结果 -->
    <div v-if="tr.decision" class="card">
      <h3>顾问决定</h3>
      <div class="banner" :class="tr.status === '已稳定转入' ? 'warn' : 'danger'" style="margin-bottom: 0">
        <b>{{ tr.decision.result === '稳定转入' ? '已稳定转入你的名下' : `不适配处理：${tr.decision.result}` }}</b>
        · {{ tr.decision.at }}<br />{{ tr.decision.note }}
      </div>
    </div>

    <!-- 双方沟通记录 -->
    <div class="card">
      <h3>双方沟通记录（{{ tr.notes.length }}）</h3>
      <div v-for="n in tr.notes" :key="n.id" class="note-item">
        <div class="note-head">{{ n.at }} · {{ n.byName }}（{{ roleLabel[n.byRole] }}）</div>
        <div>{{ n.content }}</div>
      </div>
      <div v-if="!tr.notes.length" class="empty">暂无沟通记录</div>
      <div class="row mt8">
        <input v-model="noteText" placeholder="补充交接沟通（如与会员沟通的训练注意事项）" style="flex: 1" @keyup.enter="addNote" />
        <button class="small" @click="addNote">添加记录</button>
      </div>
    </div>
  </div>
  <div v-else class="page"><div class="empty">交接流程不存在或与当前教练无关</div></div>
</template>

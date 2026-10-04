<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import ProfessionalProfile from '../../components/ProfessionalProfile.vue'
import { weekdayCn } from '../../utils/date'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const data = useDataStore()
const mid = route.params.memberId as string
const ticketId = route.query.ticket as string | undefined
const myName = auth.current!.name

const member = computed(() => data.accountById(mid))
const pkg = computed(() => data.activePackage(mid))
const existing = computed(() => data.activeTransferOf(mid))
const booking = computed(() => data.bookingOf(mid))
const records = computed(() => data.recordsOf(mid))
const trend = computed(() => data.painTrend(mid))
const complaints = computed(() => data.complaints.filter(c => c.memberId === mid && c.status !== '已关闭'))
const changeTicket = computed(() =>
  data.tickets.find(t => t.id === ticketId && t.type === '更换教练')
  ?? data.tickets.find(t => t.memberId === mid && t.type === '更换教练' && t.status !== '已解决'),
)

// 已完成课程（交接给新教练的真实进度）
const doneSessions = computed(() =>
  data.sessionsOf(mid).filter(s => s.status === '已完成').sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time)),
)

// —— 表单：能自动整理的字段全部预填，顾问可修改 ——
const form = reactive({
  toCoachId: '',
  reason: changeTicket.value?.detail ?? '',
  goalsText: (booking.value?.goals ?? []).join('、'),
  preference: booking.value
    ? `${booking.value.mindOppositeGenderCoach ? '介意异性教练' : '不介意教练性别'}；可上课时间：${booking.value.availableSlots.join('、')}；预算 ${booking.value.budget}`
    : '',
  complaintSummary: [
    ...complaints.value.map(c => `投诉（${c.createdAt.slice(0, 10)}）：${c.content}`),
    ...(changeTicket.value ? [`换教练申请：${changeTicket.value.detail}`] : []),
  ].join('\n'),
  handoverNote: '',
})

// 目标 → 专长匹配（与安排体验课同一套推荐逻辑）
const goalToSpecialty: Record<string, string[]> = {
  体态矫正: ['体态矫正'],
  康复舒缓: ['理疗瑜伽', '膝关节养护', '脊柱保养'],
  柔韧提升: ['阴瑜伽'],
  减压助眠: ['减压助眠', '阴瑜伽'],
  减脂塑形: ['减脂塑形', '力量流'],
  力量提升: ['力量流', '阿斯汤加'],
}

const coachOptions = computed(() => {
  const wanted = form.goalsText.split(/[、,，\s]/).filter(Boolean).flatMap(g => goalToSpecialty[g] ?? [])
  const list = data.coaches.filter(c => c.id !== pkg.value?.coachId)
  return list
    .map(c => ({ coach: c, match: c.specialties.some(s => wanted.includes(s)) }))
    .sort((a, b) => Number(b.match) - Number(a.match))
})

function submit() {
  const goals = form.goalsText.split(/[、,，\s]/).map(x => x.trim()).filter(Boolean)
  if (!form.toCoachId) { alert('请选择新教练'); return }
  if (!goals.length) { alert('请整理训练目标'); return }
  if (!form.reason.trim()) { alert('请填写转教练原因'); return }
  if (!form.handoverNote.trim()) { alert('请填写交接说明（新教练接手前会阅读）'); return }
  const id = data.startTransfer(mid, form.toCoachId, {
    reason: form.reason.trim(),
    goals,
    preference: form.preference.trim(),
    complaintSummary: form.complaintSummary.trim(),
    handoverNote: form.handoverNote.trim(),
  }, auth.current!.id, myName, changeTicket.value?.id)
  if (id) router.push(`/consultant/transfer/${id}`)
}
</script>

<template>
  <div class="page" v-if="member">
    <h2 class="page-title">发起转教练 · {{ member.name }}</h2>
    <p class="page-sub">页面已自动整理训练目标、已完成课程、疼痛变化、会员偏好与投诉原因；顾问确认后，新教练需阅读并确认交接记录方可接手。</p>

    <div v-if="existing" class="banner warn">
      该会员已有进行中的转教练流程（{{ existing.status }}）。
      <router-link :to="`/consultant/transfer/${existing.id}`">前往跟踪 →</router-link>
    </div>
    <div v-else-if="!pkg" class="banner danger">该会员当前没有进行中的课包，无法发起转教练。</div>

    <template v-else>
      <!-- 自动整理的训练档案（只读事实） -->
      <div class="card">
        <h3>已完成课程与疼痛变化（来自教练课后记录，自动汇总）</h3>
        <div class="grid cols-2">
          <div>
            <div class="muted mb8">已完成 {{ doneSessions.length }} 节课 · {{ records.length }} 条课后记录</div>
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
            <div class="muted mb8">疼痛趋势</div>
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
      </div>

      <div class="card">
        <h3>教练专业档案（随交接完整转移，不从零开始）</h3>
        <ProfessionalProfile :member-id="mid" viewer-role="consultant" />
      </div>

      <!-- 交接资料整理（预填可改） -->
      <div class="card">
        <h3>整理交接资料</h3>
        <div class="form-row">
          <label>转教练原因（会员诉求 / 投诉背景）</label>
          <textarea v-model="form.reason"></textarea>
        </div>
        <div class="grid cols-2">
          <div class="form-row">
            <label>训练目标（顿号分隔，将用于推荐新教练）</label>
            <input v-model="form.goalsText" placeholder="如：力量提升、减脂塑形" />
          </div>
          <div class="form-row">
            <label>会员偏好（教练性别 / 风格 / 时段）</label>
            <input v-model="form.preference" placeholder="如：希望女教练；节奏放缓；周三晚间" />
          </div>
        </div>
        <div class="form-row">
          <label>投诉与不适原因摘要</label>
          <textarea v-model="form.complaintSummary" placeholder="无正式投诉可注明；如有投诉/不适上报请汇总"></textarea>
        </div>
        <div class="form-row">
          <label>交接说明（新教练接手前必读：进度、注意事项、沟通建议）</label>
          <textarea v-model="form.handoverNote" placeholder="如：已完成 3 节基础课，建议前 2 周以动作质量为主，避免大强度间歇"></textarea>
        </div>
        <div class="form-row">
          <label>选择新教练（按训练目标匹配排序）</label>
          <select v-model="form.toCoachId" style="max-width: 420px">
            <option value="" disabled>选择新教练（现任：{{ data.coachById(pkg.coachId)?.name }}）</option>
            <option v-for="o in coachOptions" :key="o.coach.id" :value="o.coach.id">
              {{ o.coach.name }}（{{ o.coach.gender }} · {{ o.coach.specialties.join('/') }}）{{ o.match ? '★ 目标匹配' : '' }}
            </option>
          </select>
          <div v-if="booking?.mindOppositeGenderCoach" class="muted mt8">会员预约时标注「介意异性教练」，请优先匹配同性别教练。</div>
        </div>
        <button @click="submit">发起转教练流程（待新教练确认）</button>
      </div>
    </template>
  </div>
  <div v-else class="page"><div class="empty">会员不存在</div></div>
</template>

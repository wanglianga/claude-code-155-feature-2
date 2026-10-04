<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import { addDays, fmt, today, WEEKDAY_CN } from '../../utils/date'
import type { Session } from '../../types'

const auth = useAuthStore()
const data = useDataStore()
const router = useRouter()
const coachId = auth.current!.id

const weekOffset = ref(0)

function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  const wd = (d.getDay() + 6) % 7 // 周一=0
  d.setDate(d.getDate() - wd)
  return fmt(d)
}

const weekDays = computed(() => {
  const mon = addDays(mondayOf(today()), weekOffset.value * 7)
  return Array.from({ length: 7 }, (_, i) => addDays(mon, i))
})

const mySessions = computed(() => data.coachSessions(coachId))

// 转教练交接收件箱：待我确认 / 试运行中待我反馈
const transferInbox = computed(() => data.coachTransferInbox(coachId))

function transferHint(t: (typeof transferInbox.value)[number]): string {
  if (t.status === '待新教练确认') return '待你阅读交接记录并确认接手'
  if (t.status === '试运行中') {
    const first = t.firstSessionId ? data.sessions.find(s => s.id === t.firstSessionId) : undefined
    if (first?.status === '已完成' && !t.adaptFeedback) return '首课已完成，请填写适配反馈'
    return '试运行中，首课结束后请填写适配反馈'
  }
  return '适配反馈已提交，等待顾问决定'
}

function sessionsOn(date: string): Session[] {
  return mySessions.value.filter(s => s.date === date)
}

// 我的会员（有进行中课包或体验课待测评）
const myMembers = computed(() => {
  const ids = new Set<string>()
  mySessions.value.forEach(s => ids.add(s.memberId))
  return [...ids].map(id => {
    const pkg = data.activePackage(id)
    const recs = data.recordsOf(id)
    const last = recs[0]
    const next = data.upcomingSessions(id).find(s => s.coachId === coachId)
    const booking = data.bookingOf(id)
    return { id, name: data.nameOf(id), pkg, last, next, goals: booking?.goals ?? [], prog: pkg ? data.progressOf(pkg) : null }
  })
})

function openSession(s: Session) {
  if (s.isExperience && s.status === '待上课') {
    router.push(`/coach/session/${s.id}`)
  } else if (s.status === '待上课') {
    router.push(`/coach/session/${s.id}`)
  } else {
    router.push(`/coach/member/${s.memberId}`)
  }
}

function coachLeave(s: Session) {
  const reason = prompt(`请填写请假原因（${s.date} ${s.time} ${data.nameOf(s.memberId)} 的课程将待顾问协调）`)
  if (reason) data.requestLeave(s.id, 'coach', coachId, reason)
}

const statusClass: Record<string, string> = { 待上课: '', 已完成: 'off', 会员请假: 'off', 教练请假: 'off', 已取消: 'off', 已改期: 'off' }
</script>

<template>
  <div class="page">
    <div class="between">
      <div>
        <h2 class="page-title">本周课表 · {{ auth.current?.name }}</h2>
        <p class="page-sub">{{ weekDays[0] }} ~ {{ weekDays[6] }}</p>
      </div>
      <div class="row">
        <button class="ghost small" @click="weekOffset--">← 上一周</button>
        <button class="ghost small" @click="weekOffset = 0">本周</button>
        <button class="ghost small" @click="weekOffset++">下一周 →</button>
      </div>
    </div>

    <!-- 转教练交接 -->
    <div v-if="transferInbox.length" class="card" style="border-color: var(--clay)">
      <h3>🔄 转教练交接（{{ transferInbox.length }}）</h3>
      <div v-for="t in transferInbox" :key="t.id" class="between mb8" style="border-bottom: 1px dashed var(--line); padding-bottom: 8px">
        <div>
          <b>{{ data.nameOf(t.memberId) }}</b>
          <span class="muted">{{ data.coachById(t.fromCoachId)?.name }} → 你</span>
          <span class="tag clay">{{ t.status }}</span>
          <div class="muted">{{ transferHint(t) }}</div>
        </div>
        <router-link :to="`/coach/transfer/${t.id}`">
          <button class="small">{{ t.status === '待新教练确认' ? '阅读交接并确认 →' : '查看交接 →' }}</button>
        </router-link>
      </div>
    </div>

    <div class="week-grid">
      <div v-for="d in weekDays" :key="d" class="day-col" :class="{ today: d === today() }">
        <div class="day-head">
          <span>{{ WEEKDAY_CN[new Date(d + 'T00:00:00').getDay()] }}</span>
          <span>{{ d.slice(5) }}</span>
        </div>
        <div v-for="s in sessionsOn(d)" :key="s.id" class="session-chip" :class="[statusClass[s.status], { exp: s.isExperience }]" @click="openSession(s)">
          <div class="who">{{ s.time.slice(0, 5) }} {{ data.nameOf(s.memberId) }}</div>
          <div>{{ s.kind }} · {{ s.status }}</div>
          <div style="color: var(--muted)">{{ s.focus }}</div>
          <div v-if="s.status === '待上课'" class="mt8">
            <button class="small ghost" @click.stop="coachLeave(s)">请假</button>
          </div>
        </div>
        <div v-if="!sessionsOn(d).length" class="muted" style="font-size: 12px">—</div>
      </div>
    </div>

    <div class="card mt16">
      <h3>我的会员（目标 / 上节课反馈 / 本节课重点）</h3>
      <table class="plain">
        <thead>
          <tr><th>会员</th><th>课包进度</th><th>训练目标</th><th>上节课反馈</th><th>本节课重点</th><th></th></tr>
        </thead>
        <tbody>
          <tr v-for="m in myMembers" :key="m.id">
            <td><b>{{ m.name }}</b></td>
            <td>
              <template v-if="m.pkg && m.prog">
                {{ m.pkg.usedSessions }}/{{ m.pkg.totalSessions }} 节
                <span v-if="m.prog.behind" class="tag clay">落后</span>
                <span v-if="m.prog.expiringSoon" class="tag danger">将到期</span>
              </template>
              <span v-else class="tag clay">体验课</span>
            </td>
            <td>{{ m.goals.join('、') || '—' }}</td>
            <td style="max-width: 240px">
              <template v-if="m.last">
                体感 {{ m.last.memberFeel }}/10
                <span v-if="m.last.painChanges.length">；{{ m.last.painChanges.map(p => `${p.part}${p.before}→${p.after}`).join('，') }}</span>
                <div class="muted">{{ m.last.coachNote }}</div>
              </template>
              <span v-else class="muted">—</span>
            </td>
            <td style="max-width: 200px">{{ m.next?.focus ?? '—' }}</td>
            <td><router-link :to="`/coach/member/${m.id}`"><button class="small ghost">档案</button></router-link></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

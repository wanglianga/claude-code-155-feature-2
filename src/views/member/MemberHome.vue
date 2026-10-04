<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import PackageCard from '../../components/PackageCard.vue'
import ProfessionalProfile from '../../components/ProfessionalProfile.vue'
import { weekdayCn } from '../../utils/date'

const auth = useAuthStore()
const data = useDataStore()
const mid = auth.current!.id

const pkg = computed(() => data.activePackage(mid))
const upcoming = computed(() => data.upcomingSessions(mid))
const booking = computed(() => data.bookingOf(mid))
const assessment = computed(() => data.latestAssessment(mid))
const prog = computed(() => pkg.value ? data.progressOf(pkg.value) : null)

// ---- 确认购课 ----
const showPurchase = ref(false)
const purchase = reactive({ name: '', totalSessions: 16, validDays: 90, weekday: 2, time: '19:00-20:00' })
const canPurchase = computed(() => booking.value?.status === '已完成测评' && !pkg.value)

function openPurchase() {
  purchase.name = assessment.value?.recommendedPackage ?? '私教 16 节'
  const m = assessment.value?.recommendedPackage.match(/(\d+)\s*节/)
  if (m) purchase.totalSessions = Number(m[1])
  showPurchase.value = true
}

function confirmPurchase() {
  if (!assessment.value) return
  data.purchasePackage(mid, assessment.value.coachId, purchase.name, purchase.totalSessions, purchase.validDays,
    [{ weekday: purchase.weekday, time: purchase.time }], auth.current!.name)
  showPurchase.value = false
}

const expSession = computed(() => upcoming.value.find(s => s.isExperience))

// ---- 转教练交接进度 ----
const transfer = computed(() => data.activeTransferOf(mid))
const lastTransfer = computed(() => data.transfersOf(mid)[0])
const shownTransfer = computed(() => transfer.value ?? (lastTransfer.value?.decision ? lastTransfer.value : undefined))
const transferMsg = ref('')
const transferSteps = ['发起交接', '新教练确认', '首节试课', '适配反馈', '顾问定夺']
function transferStep(): number {
  const t = transfer.value
  if (!t) return 5
  if (t.status === '待新教练确认') return 1
  if (t.status === '试运行中') {
    const first = t.firstSessionId ? data.sessions.find(s => s.id === t.firstSessionId) : undefined
    return first?.status === '已完成' ? 3 : 2
  }
  if (t.status === '待顾问定夺') return 4
  return 5
}
function postTransferMsg() {
  const c = transferMsg.value.trim()
  if (!c || !shownTransfer.value) return
  data.postTransferMessage(shownTransfer.value.id, 'member', auth.current!.name, c)
  transferMsg.value = ''
}
const roleLabel: Record<string, string> = { member: '会员', coach: '教练', consultant: '顾问' }
</script>

<template>
  <div class="page">
    <h2 class="page-title">你好，{{ auth.current?.name }}</h2>
    <p class="page-sub">你的每一次疼痛、请假与训练效果，都会成为后续排课的依据。</p>

    <!-- 续费 / 到期提醒 -->
    <div v-if="prog?.expiringSoon" class="banner danger">
      ⏰ 课包续费提醒：剩余 <b>{{ prog.remaining }}</b> 节，有效期还剩 <b>{{ prog.daysLeft }}</b> 天。
      顾问会结合你的真实训练进度与你沟通续费方案，你也可以主动联系顾问。
    </div>
    <div v-if="prog?.behind" class="banner warn">
      📉 课消进度落后：按当前上课频率，课包到期前可能上不完，建议与顾问协商加课或调整排课。
    </div>

    <!-- 体验课流程状态 -->
    <div v-if="booking && booking.status === '待安排'" class="banner warn">
      ✅ 体验课预约已提交，顾问正在为你匹配教练（已记录：{{ booking.mindOppositeGenderCoach ? '介意异性教练' : '不介意教练性别' }}、{{ booking.availableSlots.join(' / ') }} 可上课）。
    </div>
    <div v-if="expSession" class="banner">
      🗓 体验课已安排：<b>{{ expSession.date }}（{{ weekdayCn(expSession.date) }}）{{ expSession.time }}</b>，
      教练：{{ data.coachById(expSession.coachId)?.name }}
    </div>

    <!-- 确认购课 -->
    <div v-if="canPurchase" class="card">
      <h3>体验测评已完成，确认购课后自动生成课包与排课计划</h3>
      <ProfessionalProfile :member-id="mid" viewer-role="member" />
      <div class="mt16" v-if="!showPurchase">
        <button @click="openPurchase">确认购买推荐套餐</button>
      </div>
      <div v-else class="mt16">
        <div class="grid cols-2">
          <div class="form-row"><label>课包名称</label><input v-model="purchase.name" /></div>
          <div class="form-row"><label>总课时</label><input v-model.number="purchase.totalSessions" type="number" min="1" /></div>
          <div class="form-row"><label>有效期（天）</label><input v-model.number="purchase.validDays" type="number" min="7" /></div>
          <div class="form-row">
            <label>固定上课时段</label>
            <div class="row">
              <select v-model.number="purchase.weekday" style="width: auto">
                <option v-for="(w, i) in ['周日','周一','周二','周三','周四','周五','周六']" :key="i" :value="i">{{ w }}</option>
              </select>
              <select v-model="purchase.time" style="width: auto">
                <option>10:00-11:00</option><option>14:00-15:00</option>
                <option>19:00-20:00</option><option>20:00-21:00</option>
              </select>
            </div>
          </div>
        </div>
        <div class="banner">请假规则：每月最多请假 2 次，需提前 12 小时；课包剩余 4 节或到期前 21 天自动提醒续费。</div>
        <div class="row">
          <button @click="confirmPurchase">确认购买并生成排课</button>
          <button class="ghost" @click="showPurchase = false">再想想</button>
        </div>
      </div>
    </div>

    <!-- 转教练交接进度 -->
    <div v-if="shownTransfer" class="card">
      <div class="between">
        <h3 style="margin: 0">转教练进度 <span class="tag clay">{{ shownTransfer.status }}</span></h3>
        <span class="muted">{{ data.coachById(shownTransfer.fromCoachId)?.name }} → {{ data.coachById(shownTransfer.toCoachId)?.name }}</span>
      </div>
      <div class="steps mt8 mb8">
        <span v-for="(s, i) in transferSteps" :key="s" class="step" :class="{ done: i < transferStep(), now: i === transferStep() - 1 && !['已稳定转入', '已终止'].includes(shownTransfer.status) }">{{ s }}</span>
      </div>
      <p class="muted" style="margin: 4px 0">
        <template v-if="shownTransfer.status === '待新教练确认'">顾问已为你整理训练目标、已完成课程、疼痛变化与偏好，等待 {{ data.coachById(shownTransfer.toCoachId)?.name }} 教练阅读确认。</template>
        <template v-else-if="shownTransfer.status === '试运行中'">{{ data.coachById(shownTransfer.toCoachId)?.name }} 教练已确认接手，首节试课进行中，顾问会跟踪你的满意度。</template>
        <template v-else-if="shownTransfer.status === '待顾问定夺'">首节试课反馈已提交，顾问正在评估是否稳定转入。</template>
        <template v-else-if="shownTransfer.decision">已定夺：{{ shownTransfer.decision.result }} —— {{ shownTransfer.decision.note }}</template>
      </p>
      <div v-if="shownTransfer.messages.length" class="mt8">
        <div v-for="m in shownTransfer.messages" :key="m.id" class="mb8" style="font-size: 13px">
          <span class="tag" :class="m.fromRole === 'member' ? 'amber' : m.fromRole === 'coach' ? 'clay' : ''">{{ m.fromName }} · {{ roleLabel[m.fromRole] }}</span>
          <span class="muted">{{ m.at }}</span>
          <div>{{ m.content }}</div>
        </div>
      </div>
      <div class="row mt8">
        <input v-model="transferMsg" placeholder="给顾问或新教练留言（双方沟通记录会保留）" style="flex: 1" @keyup.enter="postTransferMsg" />
        <button class="small" @click="postTransferMsg">发送</button>
      </div>
    </div>

    <!-- 当前课包 -->
    <div v-if="pkg" class="card">
      <h3>当前课包</h3>
      <PackageCard :pkg="pkg" />
    </div>

    <!-- 近期课程 -->
    <div class="card">
      <h3>近期课程</h3>
      <table v-if="upcoming.length" class="plain">
        <thead><tr><th>日期</th><th>时间</th><th>类型</th><th>教练</th><th>本节课重点</th><th>状态</th></tr></thead>
        <tbody>
          <tr v-for="s in upcoming.slice(0, 6)" :key="s.id">
            <td>{{ s.date }}（{{ weekdayCn(s.date) }}）</td>
            <td>{{ s.time }}</td>
            <td><span class="tag" :class="s.isExperience ? 'clay' : ''">{{ s.kind }}</span></td>
            <td>{{ data.coachById(s.coachId)?.name }}</td>
            <td>{{ s.focus }}</td>
            <td><span class="tag">{{ s.status }}</span></td>
          </tr>
        </tbody>
      </table>
      <div v-else class="empty">暂无待上课程</div>
    </div>
  </div>
</template>

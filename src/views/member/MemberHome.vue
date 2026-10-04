<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import PackageCard from '../../components/PackageCard.vue'
import ProfessionalProfile from '../../components/ProfessionalProfile.vue'
import TransferSteps from '../../components/TransferSteps.vue'
import { weekdayCn } from '../../utils/date'

const auth = useAuthStore()
const data = useDataStore()
const mid = auth.current!.id

const pkg = computed(() => data.activePackage(mid))
const upcoming = computed(() => data.upcomingSessions(mid))
const booking = computed(() => data.bookingOf(mid))
const assessment = computed(() => data.latestAssessment(mid))
const prog = computed(() => pkg.value ? data.progressOf(pkg.value) : null)

// ---- 转教练交接 ----
const transfer = computed(() => data.activeTransferOf(mid))
const lastClosedTransfer = computed(() =>
  data.transfersOf(mid).find(t => t.status === '已稳定转入' || t.status === '已结束-不适配'),
)
const sat = reactive({ score: 4, note: '' })
const noteText = ref('')
const transferMsg = ref('')

function flashTransfer(t: string) {
  transferMsg.value = t
  setTimeout(() => (transferMsg.value = ''), 2500)
}

function submitSatisfaction() {
  if (!transfer.value) return
  data.submitSatisfaction(transfer.value.id, sat.score, sat.note.trim(), auth.current!.name)
  sat.note = ''
  flashTransfer('满意度已提交，顾问会持续跟踪试运行情况')
}

function addTransferNote() {
  if (!transfer.value || !noteText.value.trim()) return
  data.addTransferNote(transfer.value.id, 'member', mid, noteText.value.trim())
  noteText.value = ''
}

const roleLabel: Record<string, string> = { member: '会员', coach: '教练', consultant: '顾问' }

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

    <!-- 转教练交接进行中 -->
    <div v-if="transfer" class="card" style="border-color: var(--clay)">
      <h3>🔄 转教练进行中：{{ data.coachById(transfer.fromCoachId)?.name }} → {{ data.coachById(transfer.toCoachId)?.name }}</h3>
      <TransferSteps :status="transfer.status" />
      <div v-if="transferMsg" class="banner warn mt8" style="margin-bottom: 0">{{ transferMsg }}</div>
      <p class="muted mt8">
        <template v-if="transfer.status === '待新教练确认'">顾问已整理你的训练目标、课后记录与偏好，等待 {{ data.coachById(transfer.toCoachId)?.name }} 教练阅读确认后接手。</template>
        <template v-else-if="transfer.status === '试运行中'">新教练已接手，目前为试运行阶段——你的训练记录已完整交接，无需从零开始。</template>
        <template v-else-if="transfer.status === '待顾问决定'">新教练已提交首课适配反馈，顾问将结合你的满意度决定是否稳定转入。</template>
      </p>

      <!-- 试运行满意度打卡 -->
      <div v-if="transfer.status === '试运行中' || transfer.status === '待顾问决定'" class="mt8">
        <label>对新教练的满意度（可多次打卡，顾问会持续跟踪）：{{ sat.score }}/5</label>
        <div class="row">
          <input v-model.number="sat.score" type="range" min="1" max="5" style="max-width: 220px" />
          <input v-model="sat.note" placeholder="说说感受，如：节奏合适 / 强度还是偏大" style="flex: 1" />
          <button class="small" @click="submitSatisfaction">提交满意度</button>
        </div>
      </div>

      <!-- 双方沟通记录 -->
      <div v-if="transfer.notes.length" class="mt16">
        <label>沟通记录</label>
        <div v-for="n in transfer.notes" :key="n.id" class="note-item">
          <div class="note-head">{{ n.at }} · {{ n.byName }}（{{ roleLabel[n.byRole] }}）</div>
          <div style="font-size: 14px">{{ n.content }}</div>
        </div>
      </div>
      <div class="row mt8">
        <input v-model="noteText" placeholder="给顾问 / 教练留言（沟通记录会保留在交接档案中）" style="flex: 1" @keyup.enter="addTransferNote" />
        <button class="small ghost" @click="addTransferNote">留言</button>
      </div>
    </div>

    <!-- 最近一次转教练结果 -->
    <div v-else-if="lastClosedTransfer" class="banner" :class="lastClosedTransfer.status === '已稳定转入' ? 'warn' : 'danger'">
      🔄 转教练{{ lastClosedTransfer.decision?.result === '稳定转入' ? '已稳定转入' : `已按「${lastClosedTransfer.decision?.result}」处理` }}：
      {{ lastClosedTransfer.decision?.note }}
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

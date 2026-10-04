<script setup lang="ts">
import { computed, reactive } from 'vue'
import { useAuthStore } from '../../stores/auth'
import { useDataStore } from '../../stores/data'
import type { Ticket } from '../../types'

const auth = useAuthStore()
const data = useDataStore()
const myName = auth.current!.name

const open = computed(() => data.tickets.filter(t => t.status !== '已解决'))
const done = computed(() => data.tickets.filter(t => t.status === '已解决'))

const resolutions = reactive<Record<string, string>>({})
const reDate = reactive<Record<string, string>>({})
const reTime = reactive<Record<string, string>>({})

const typeClass: Record<string, string> = {
  会员不适: 'danger', 教练请假: 'clay', 临时改期: 'amber',
  进度落后: 'amber', 更换教练: 'clay', 课包到期: 'danger',
}

function resolve(t: Ticket) {
  const r = resolutions[t.id]?.trim()
  if (!r) { alert('请填写处理结论（将写入会员训练记录）'); return }
  data.resolveTicket(t.id, r, myName)
}

function doReschedule(t: Ticket) {
  if (!t.sessionId || !reDate[t.id]) { alert('请选择新日期'); return }
  data.rescheduleSession(t.sessionId, reDate[t.id], reTime[t.id] || '19:00-20:00', 'consultant', myName)
  data.resolveTicket(t.id, `已将会员课程改期至 ${reDate[t.id]} ${reTime[t.id] || '19:00-20:00'}，并通知会员与教练。`, myName)
}

function sessionOf(t: Ticket) {
  return t.sessionId ? data.sessions.find(s => s.id === t.sessionId) : undefined
}
</script>

<template>
  <div class="page">
    <h2 class="page-title">异常工单</h2>
    <p class="page-sub">会员不适、教练请假、临时改期、进度落后、换教练、课包到期 —— 处理结论全部写回同一份训练记录。</p>

    <div v-if="!open.length" class="card"><div class="empty">暂无待处理工单 🎉</div></div>

    <div v-for="t in open" :key="t.id" class="card">
      <div class="between">
        <h3 style="margin: 0">
          <span class="tag" :class="typeClass[t.type]">{{ t.type }}</span>
          {{ t.title }}
        </h3>
        <span class="muted">{{ t.createdAt }} · {{ t.status }}</span>
      </div>
      <p style="margin: 8px 0">{{ t.detail }}</p>
      <div class="row mb8">
        <router-link :to="`/consultant/member/${t.memberId}`">
          <button class="small ghost">查看 {{ data.nameOf(t.memberId) }} 的完整训练记录 →</button>
        </router-link>
        <span v-if="sessionOf(t)" class="muted">
          关联课程：{{ sessionOf(t)!.date }} {{ sessionOf(t)!.time }}（{{ sessionOf(t)!.status }}）
        </span>
      </div>

      <!-- 更换教练：走转教练交接流程（整理资料 → 新教练确认 → 试运行 → 顾问决定） -->
      <div v-if="t.type === '更换教练'" class="row mb8">
        <template v-if="data.activeTransferOf(t.memberId)">
          <span class="tag clay">交接{{ data.activeTransferOf(t.memberId)!.status }}</span>
          <router-link :to="`/consultant/transfer/${data.activeTransferOf(t.memberId)!.id}`">
            <button class="small">跟踪转教练交接 →</button>
          </router-link>
        </template>
        <router-link v-else :to="`/consultant/transfer/new/${t.memberId}?ticket=${t.id}`">
          <button class="small">发起转教练交接（自动整理训练目标 / 课后记录 / 疼痛变化 / 会员偏好）→</button>
        </router-link>
      </div>

      <!-- 教练请假：直接改期受影响课程（含已批准请假后的补课） -->
      <div v-if="t.type === '教练请假' && ['待上课', '教练请假'].includes(sessionOf(t)?.status ?? '')" class="row mb8">
        <input v-model="reDate[t.id]" type="date" style="width: 170px" />
        <select v-model="reTime[t.id]" style="width: 150px">
          <option>10:00-11:00</option><option>14:00-15:00</option>
          <option>19:00-20:00</option><option>20:00-21:00</option>
        </select>
        <button class="small" @click="doReschedule(t)">改期并办结</button>
      </div>

      <!-- 课包到期：去续费跟进 -->
      <div v-if="t.type === '课包到期'" class="mb8">
        <router-link :to="`/consultant/member/${t.memberId}`">
          <button class="small">基于训练进度发起续费沟通 →</button>
        </router-link>
      </div>

      <div class="row">
        <input v-model="resolutions[t.id]" placeholder="处理结论（写回训练记录，会员与教练可见）" style="flex: 1" />
        <button class="small" @click="resolve(t)">办结工单</button>
      </div>
    </div>

    <div v-if="done.length" class="card">
      <h3>已解决</h3>
      <div v-for="t in done" :key="t.id" class="mb8" style="border-bottom: 1px solid var(--line); padding-bottom: 8px">
        <div>
          <span class="tag gray">{{ t.type }}</span>
          <b>{{ t.title }}</b>
          <span class="muted"> · {{ data.nameOf(t.memberId) }}</span>
        </div>
        <div class="muted">处理结论：{{ t.resolution }}</div>
      </div>
    </div>
  </div>
</template>

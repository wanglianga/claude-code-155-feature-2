<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDataStore } from '../../stores/data'
import TransferSteps from '../../components/TransferSteps.vue'

const data = useDataStore()
const router = useRouter()

const open = computed(() => data.openTransfers)
const closed = computed(() =>
  data.transfers
    .filter(t => ['已稳定转入', '已结束-不适配'].includes(t.status))
    .sort((a, b) => (b.decision?.at ?? '').localeCompare(a.decision?.at ?? '')),
)

// 可发起转教练的会员：有进行中课包且当前没有进行中的交接流程
const candidates = computed(() =>
  data.accounts
    .filter(a => a.role === 'member' && data.activePackage(a.id) && !data.activeTransferOf(a.id))
    .map(a => ({ id: a.id, name: a.name, coach: data.coachById(data.activePackage(a.id)!.coachId)?.name ?? '' })),
)
const picked = ref('')

function latestScore(t: (typeof open.value)[number]) {
  return t.satisfactions[0]
}

function go() {
  if (!picked.value) { alert('请选择会员'); return }
  router.push(`/consultant/transfer/new/${picked.value}`)
}
</script>

<template>
  <div class="page">
    <h2 class="page-title">转教练交接</h2>
    <p class="page-sub">顾问发起并整理交接资料 → 新教练阅读确认 → 试运行跟踪满意度与首课反馈 → 顾问决定稳定转入或不适配处理。</p>

    <!-- 发起新流程 -->
    <div class="card">
      <h3>发起转教练流程</h3>
      <div class="row">
        <select v-model="picked" style="width: 320px">
          <option value="" disabled>选择会员（当前有进行中课包）</option>
          <option v-for="c in candidates" :key="c.id" :value="c.id">{{ c.name }}（现任教练：{{ c.coach }}）</option>
        </select>
        <button :disabled="!candidates.length" @click="go">整理交接资料并发起 →</button>
      </div>
      <div v-if="!candidates.length" class="muted mt8">暂无可发起的会员（需有进行中课包且无进行中的交接流程）。</div>
    </div>

    <!-- 进行中 -->
    <div class="card">
      <h3>进行中（{{ open.length }}）</h3>
      <div v-if="!open.length" class="empty">暂无进行中的转教练流程</div>
      <div v-for="t in open" :key="t.id" class="mb8" style="border-bottom: 1px solid var(--line); padding-bottom: 12px">
        <div class="between">
          <div>
            <b>{{ data.nameOf(t.memberId) }}</b>
            <span class="muted">{{ data.coachById(t.fromCoachId)?.name }} → {{ data.coachById(t.toCoachId)?.name }}</span>
          </div>
          <router-link :to="`/consultant/transfer/${t.id}`"><button class="small">跟踪与处理 →</button></router-link>
        </div>
        <div class="mt8"><TransferSteps :status="t.status" /></div>
        <div class="row mt8 muted">
          <span>发起于 {{ t.createdAt }}</span>
          <span v-if="t.adaptFeedback">首课反馈：<b :style="{ color: t.adaptFeedback.fitness === '不适配' ? 'var(--danger)' : 'var(--sage-deep)' }">{{ t.adaptFeedback.fitness }}</b></span>
          <span v-if="latestScore(t)">会员满意度：{{ latestScore(t)!.score }}/5（{{ t.satisfactions.length }} 次打卡）</span>
          <span v-else-if="t.status !== '待新教练确认'">会员暂未打卡满意度</span>
        </div>
      </div>
    </div>

    <!-- 已完结 -->
    <div v-if="closed.length" class="card">
      <h3>已完结</h3>
      <table class="plain">
        <thead><tr><th>会员</th><th>教练变更</th><th>结果</th><th>完结时间</th><th></th></tr></thead>
        <tbody>
          <tr v-for="t in closed" :key="t.id">
            <td><b>{{ data.nameOf(t.memberId) }}</b></td>
            <td>{{ data.coachById(t.fromCoachId)?.name }} → {{ data.coachById(t.toCoachId)?.name }}</td>
            <td>
              <span class="tag" :class="t.status === '已稳定转入' ? '' : 'danger'">
                {{ t.decision?.result === '稳定转入' ? '稳定转入' : `不适配 · ${t.decision?.result}` }}
              </span>
            </td>
            <td class="muted">{{ t.decision?.at }}</td>
            <td><router-link :to="`/consultant/transfer/${t.id}`"><button class="small ghost">详情</button></router-link></td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

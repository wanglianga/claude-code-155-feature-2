<script setup lang="ts">
import { computed } from 'vue'
import type { TransferStatus } from '../types'

/** 转教练流程步骤条：待新教练确认 → 试运行中 → 待顾问决定 → 稳定转入 / 不适配结束 */
const props = defineProps<{ status: TransferStatus }>()

const flow = ['待新教练确认', '试运行中', '待顾问决定']
const idx = computed(() => flow.indexOf(props.status))
const done = computed(() => props.status === '已稳定转入' || props.status === '已结束-不适配')
</script>

<template>
  <div class="steps">
    <template v-for="(s, i) in flow" :key="s">
      <span class="step" :class="{ done: done || i < idx, on: i === idx }">{{ s }}</span>
      <span class="step-arrow">→</span>
    </template>
    <span v-if="status === '已稳定转入'" class="step done">已稳定转入</span>
    <span v-else-if="status === '已结束-不适配'" class="step bad">已结束 · 不适配</span>
    <span v-else class="step">顾问决定</span>
  </div>
</template>

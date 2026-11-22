<template>
  <div v-loading="loading">
    <div class="page-header">
      <div>
        <h2 class="page-title">规则参数</h2>
        <div class="page-subtitle">本组业务规则卡参数，学期内只读，不得在页面修改</div>
      </div>
      <el-button :icon="Refresh" @click="load">刷新</el-button>
    </div>

    <el-alert
      type="info"
      :closable="false"
      show-icon
      title="规则参数以签字确认单为准"
      description="最小预约粒度 30 分钟；单次最长 4 小时；允许首尾相接；仅可预约今天和明天；开始后 15 分钟未签到自动释放；近 30 天累计 3 次爽约停权 7 天。"
      style="margin-bottom: 16px"
    />

    <div class="rule-grid">
      <div v-for="item in ruleItems" :key="item.label" class="rule-card">
        <div class="rule-label">{{ item.label }}</div>
        <div class="rule-value">{{ item.value }}</div>
        <div class="rule-note">{{ item.note }}</div>
      </div>
    </div>

    <div class="page-card" style="margin-top: 16px">
      <h3 style="margin-top: 0">补充业务规则</h3>
      <ul class="rule-list">
        <li>禁止跨天预约，预约起止必须在同一自然日内。</li>
        <li>场地维护时段内禁止预约；维护时段由授权管理员设置。</li>
        <li>同一场地预约不得重叠，但允许前一笔结束时刻等于后一笔开始时刻。</li>
        <li>续约视为相邻的新预约，每笔仍不超过 4 小时，连续使用可超过 4 小时。</li>
        <li>管理员可核实后辅助签到；预约已自动释放的不得补记正常签到，只能走异常申诉（C-09）。</li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { api, errorMessage } from '../api';

const loading = ref(false);
const rules = ref({});

const ruleItems = computed(() => [
  {
    label: '最小预约粒度',
    value: `${rules.value.slotMinutes || 30} 分钟`,
    note: '开始与结束必须是 30 分钟整数倍',
  },
  {
    label: '单次最长时长',
    value: `${(rules.value.maxBookingMinutes || 240) / 60} 小时`,
    note: '续约另计，每笔仍不超过 4 小时',
  },
  {
    label: '相邻时段',
    value: rules.value.adjacentLabel || '允许首尾相接',
    note: '10:00-11:00 与 11:00-12:00 可共存',
  },
  {
    label: '提前预约窗口',
    value: `${rules.value.advanceDays || 1} 天`,
    note: rules.value.advanceDaysLabel || '仅可预约今日及明日',
  },
  {
    label: '未签到自动释放',
    value: `${rules.value.checkinGraceMinutes || 15} 分钟`,
    note: '定时任务按分钟级扫描',
  },
  {
    label: '爽约停权',
    value: `${rules.value.noShowLimit || 3} 次 / ${rules.value.suspensionDays || 7} 天`,
    note: rules.value.suspensionLabel || '近 30 天累计 3 次停权 7 天',
  },
]);

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/rules');
    rules.value = data.rules;
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.rule-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 14px;
}
.rule-card {
  background: #fff;
  border-radius: 12px;
  padding: 18px;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.06);
}
.rule-label {
  color: #6b7280;
  font-size: 13px;
}
.rule-value {
  font-size: 23px;
  font-weight: 700;
  margin: 6px 0;
  color: #1d4ed8;
}
.rule-note {
  color: #9ca3af;
  font-size: 12px;
  line-height: 1.5;
}
.rule-list {
  margin: 0;
  padding-left: 20px;
  color: #4b5563;
  line-height: 1.9;
}
</style>

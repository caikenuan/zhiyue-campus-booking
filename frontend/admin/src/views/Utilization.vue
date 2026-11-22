<template>
  <div v-loading="loading">
    <div class="page-header">
      <div>
        <h2 class="page-title">利用率统计</h2>
        <div class="page-subtitle">按场地的开放时长与实际预约时长计算</div>
      </div>
      <el-button :icon="Refresh" @click="load">刷新</el-button>
    </div>

    <div class="page-card">
      <div class="toolbar">
        <el-date-picker
          v-model="range"
          type="daterange"
          value-format="YYYY-MM-DD"
          start-placeholder="开始日期"
          end-placeholder="结束日期"
          :clearable="false"
          @change="load"
        />
        <span class="muted">共 {{ items[0]?.days || 0 }} 天</span>
      </div>

      <div class="stat-grid" style="margin-bottom: 16px">
        <div class="stat-card">
          <div class="stat-label">总预约时长</div>
          <div class="stat-value">{{ totalBookedMinutes }}</div>
          <div class="stat-hint">分钟</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">平均利用率</div>
          <div class="stat-value">{{ averageRate }}</div>
          <div class="stat-hint">各场地利用率的平均值</div>
        </div>
      </div>

      <el-table :data="items" size="small">
        <el-table-column prop="resourceName" label="场地" min-width="160" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">{{ TYPE_LABELS[row.type] || row.type }}</template>
        </el-table-column>
        <el-table-column prop="bookingCount" label="预约数" width="90" />
        <el-table-column prop="bookedMinutes" label="预约分钟" width="110" />
        <el-table-column prop="capacityMinutes" label="可用分钟" width="110" />
        <el-table-column label="利用率" min-width="220">
          <template #default="{ row }">
            <el-progress
              :percentage="Math.min(100, Number(row.utilizationRate || 0) * 100)"
              :stroke-width="14"
              :format="() => percent(row.utilizationRate)"
            />
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && items.length === 0" description="暂无统计数据" />
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { api, errorMessage } from '../api';
import { TYPE_LABELS } from '../constants';
import { percent } from '../utils/format';

function formatDate(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const loading = ref(false);
const items = ref([]);
const range = ref([formatDate(new Date(Date.now() - 6 * 86400000)), formatDate(new Date())]);

const totalBookedMinutes = computed(() =>
  items.value.reduce((sum, item) => sum + Number(item.bookedMinutes || 0), 0),
);
const averageRate = computed(() => {
  if (items.value.length === 0) return '0.0%';
  const total = items.value.reduce((sum, item) => sum + Number(item.utilizationRate || 0), 0);
  return percent(total / items.value.length);
});

async function load() {
  if (!range.value?.[0] || !range.value?.[1]) return;
  loading.value = true;
  try {
    const { data } = await api.get('/admin/stats/utilization', {
      params: { from: range.value[0], to: range.value[1] },
    });
    items.value = data.items;
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

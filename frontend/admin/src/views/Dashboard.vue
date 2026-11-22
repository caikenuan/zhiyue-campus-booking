<template>
  <div v-loading="loading">
    <div class="page-header">
      <div>
        <h2 class="page-title">运营仪表盘</h2>
        <div class="page-subtitle">今日预约、签到与爽约概览</div>
      </div>
      <el-button :icon="Refresh" @click="load">刷新</el-button>
    </div>

    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-label">今日预约</div>
        <div class="stat-value">{{ stats.todayBookings }}</div>
        <div class="stat-hint">含待签到、已签到与已释放</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">待签到</div>
        <div class="stat-value">{{ stats.pendingCheckin }}</div>
        <div class="stat-hint">今日开始、仍为待签到的预约</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">今日超时释放</div>
        <div class="stat-value">{{ stats.releasedToday }}</div>
        <div class="stat-hint">超过 15 分钟未签到</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">开放场地</div>
        <div class="stat-value">{{ stats.activeResources }}</div>
        <div class="stat-hint">当前状态为开放的场地数</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">停权用户</div>
        <div class="stat-value">{{ stats.suspendedUsers }}</div>
        <div class="stat-hint">停权截止时间晚于当前时间</div>
      </div>
    </div>

    <div class="page-card" style="margin-top: 18px">
      <div class="page-header" style="margin-bottom: 8px">
        <h3 class="page-title" style="font-size: 16px">最近预约</h3>
        <el-button text type="primary" @click="$router.push('/bookings')">查看全部</el-button>
      </div>
      <el-table :data="recentBookings" size="small">
        <el-table-column prop="id" label="预约号" width="80" />
        <el-table-column prop="user_name" label="学生" width="110" />
        <el-table-column prop="resource_name" label="场地" min-width="150" />
        <el-table-column label="时段" min-width="190">
          <template #default="{ row }">{{ shortDateTime(row.start_at) }} ~ {{ row.end_at.slice(11, 16) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="STATUS_TYPES[row.status]" size="small">{{ STATUS_LABELS[row.status] }}</el-tag>
          </template>
        </el-table-column>
      </el-table>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { api, errorMessage } from '../api';
import { STATUS_LABELS, STATUS_TYPES } from '../constants';
import { shortDateTime } from '../utils/format';

const loading = ref(false);
const stats = ref({
  todayBookings: 0,
  pendingCheckin: 0,
  releasedToday: 0,
  activeResources: 0,
  suspendedUsers: 0,
});
const recentBookings = ref([]);

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/dashboard');
    stats.value = data.stats;
    recentBookings.value = data.recentBookings;
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

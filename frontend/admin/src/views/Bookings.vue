<template>
  <div v-loading="loading">
    <div class="page-header">
      <div>
        <h2 class="page-title">预约审批</h2>
        <div class="page-subtitle">查看预约、辅助签到与审批</div>
      </div>
      <el-button :icon="Refresh" @click="load">刷新</el-button>
    </div>

    <div class="page-card">
      <div class="toolbar">
        <el-select v-model="filters.status" clearable placeholder="全部状态" style="width: 150px" @change="load">
          <el-option v-for="(label, value) in STATUS_LABELS" :key="value" :label="label" :value="value" />
        </el-select>
        <el-date-picker
          v-model="filters.date"
          type="date"
          value-format="YYYY-MM-DD"
          placeholder="按日期筛选"
          clearable
          @change="load"
        />
        <el-button @click="resetFilters">重置</el-button>
      </div>

      <el-table :data="bookings" size="small">
        <el-table-column prop="id" label="预约号" width="80" />
        <el-table-column label="学生" width="130">
          <template #default="{ row }">{{ row.userName }}<div class="muted mono">{{ row.studentNo }}</div></template>
        </el-table-column>
        <el-table-column label="场地" min-width="150">
          <template #default="{ row }">{{ row.resourceName }}<div class="muted">{{ row.building }} {{ row.room }}</div></template>
        </el-table-column>
        <el-table-column label="时段" min-width="190">
          <template #default="{ row }">{{ shortDateTime(row.startAt) }} ~ {{ row.endAt.slice(11, 16) }}</template>
        </el-table-column>
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag :type="STATUS_TYPES[row.status]" size="small">{{ STATUS_LABELS[row.status] }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="240" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="showDetail(row)">详情</el-button>
            <el-button
              v-if="row.status === 'PENDING' && withinCheckinWindow(row)"
              text
              type="warning"
              size="small"
              @click="assistedCheckin(row)"
            >辅助签到</el-button>
            <template v-if="row.status === 'PENDING_APPROVAL'">
              <el-button text type="success" size="small" @click="review(row, 'APPROVE')">通过</el-button>
              <el-button text type="danger" size="small" @click="review(row, 'REJECT')">驳回</el-button>
            </template>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-drawer v-model="detailVisible" title="预约详情" size="420px">
      <el-descriptions v-if="current" :column="1" border size="small">
        <el-descriptions-item label="预约号">{{ current.id }}</el-descriptions-item>
        <el-descriptions-item label="学生">{{ current.userName }}（{{ current.studentNo }}）</el-descriptions-item>
        <el-descriptions-item label="场地">{{ current.resourceName }}</el-descriptions-item>
        <el-descriptions-item label="位置">{{ current.building }} {{ current.room }}</el-descriptions-item>
        <el-descriptions-item label="开始">{{ shortDateTime(current.startAt) }}</el-descriptions-item>
        <el-descriptions-item label="结束">{{ shortDateTime(current.endAt) }}</el-descriptions-item>
        <el-descriptions-item label="状态">{{ STATUS_LABELS[current.status] }}</el-descriptions-item>
        <el-descriptions-item label="来源">{{ current.source === 'ADMIN' ? '管理端' : '小程序' }}</el-descriptions-item>
        <el-descriptions-item label="签到时间">{{ shortDateTime(current.checkedInAt) }}</el-descriptions-item>
        <el-descriptions-item label="取消原因">{{ current.cancelReason || '-' }}</el-descriptions-item>
      </el-descriptions>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { api, errorMessage } from '../api';
import { STATUS_LABELS, STATUS_TYPES } from '../constants';
import { shortDateTime } from '../utils/format';

const loading = ref(false);
const bookings = ref([]);
const filters = reactive({ status: '', date: '' });
const detailVisible = ref(false);
const current = ref(null);

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/bookings', {
      params: {
        status: filters.status || undefined,
        date: filters.date || undefined,
      },
    });
    bookings.value = data.items;
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  filters.status = '';
  filters.date = '';
  load();
}

function showDetail(row) {
  current.value = row;
  detailVisible.value = true;
}

function withinCheckinWindow(row) {
  if (row.status !== 'PENDING') return false;
  const start = new Date(row.startAt.replace(' ', 'T')).getTime();
  const now = Date.now();
  return now >= start && now <= start + 15 * 60 * 1000;
}

async function assistedCheckin(row) {
  try {
    await ElMessageBox.confirm(
      `确认已线下核实 ${row.userName} 到场，并为其辅助签到？`,
      '辅助签到',
      { type: 'warning' },
    );
    await api.post(`/admin/bookings/${row.id}/assisted-checkin`);
    ElMessage.success('辅助签到成功');
    await load();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(errorMessage(error));
  }
}

async function review(row, decision) {
  try {
    let reason = '';
    if (decision === 'REJECT') {
      const result = await ElMessageBox.prompt('请输入驳回原因', '驳回预约', {
        inputPlaceholder: '例如：场地临时检修',
      });
      reason = result.value || '';
    }
    await api.post(`/admin/bookings/${row.id}/review`, { decision, reason });
    ElMessage.success(decision === 'APPROVE' ? '已通过' : '已驳回');
    await load();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(errorMessage(error));
  }
}

onMounted(load);
</script>

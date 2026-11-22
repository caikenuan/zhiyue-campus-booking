<template>
  <div v-loading="loading">
    <div class="page-header">
      <div>
        <h2 class="page-title">操作日志</h2>
        <div class="page-subtitle">只读审计记录，不提供修改和删除入口</div>
      </div>
      <el-button :icon="Refresh" @click="load">刷新</el-button>
    </div>

    <div class="page-card">
      <el-table :data="items" size="small">
        <el-table-column type="expand">
          <template #default="{ row }">
            <pre class="detail">{{ pretty(row.detail) }}</pre>
          </template>
        </el-table-column>
        <el-table-column prop="id" label="ID" width="70" />
        <el-table-column label="操作" width="130">
          <template #default="{ row }">{{ ACTION_LABELS[row.action] || row.action }}</template>
        </el-table-column>
        <el-table-column label="操作人" width="110">
          <template #default="{ row }">{{ row.actor_name || '系统' }}</template>
        </el-table-column>
        <el-table-column label="对象" width="150">
          <template #default="{ row }">{{ row.target_type }} #{{ row.target_id }}</template>
        </el-table-column>
        <el-table-column label="场地" min-width="140">
          <template #default="{ row }">{{ row.resource_name || '-' }}</template>
        </el-table-column>
        <el-table-column label="时间" min-width="160">
          <template #default="{ row }">{{ shortDateTime(row.created_at) }}</template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && items.length === 0" description="暂无日志" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { api, errorMessage } from '../api';
import { ACTION_LABELS } from '../constants';
import { shortDateTime } from '../utils/format';

const loading = ref(false);
const items = ref([]);

function pretty(detail) {
  if (!detail) return '无附加信息';
  try {
    return JSON.stringify(typeof detail === 'string' ? JSON.parse(detail) : detail, null, 2);
  } catch {
    return String(detail);
  }
}

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/logs', { params: { limit: 200 } });
    items.value = data.items;
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.detail {
  margin: 0;
  padding: 10px 16px;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 8px;
  font-size: 12px;
  overflow: auto;
}
</style>

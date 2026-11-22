<template>
  <div v-loading="loading">
    <div class="page-header">
      <div>
        <h2 class="page-title">爽约名单</h2>
        <div class="page-subtitle">近 30 天累计 3 次爽约自动停权 7 天</div>
      </div>
      <el-button :icon="Refresh" @click="load">刷新</el-button>
    </div>

    <div class="page-card">
      <el-table :data="items" size="small">
        <el-table-column prop="student_no" label="学号" width="150" />
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column prop="no_show_count" label="有效爽约次数" width="120" />
        <el-table-column prop="credit_score" label="信用分" width="90" />
        <el-table-column label="最近爽约" min-width="150">
          <template #default="{ row }">{{ shortDateTime(row.last_no_show_at) }}</template>
        </el-table-column>
        <el-table-column label="停权截止" min-width="160">
          <template #default="{ row }">
            <el-tag v-if="row.suspended_until" type="danger" size="small">
              {{ shortDateTime(row.suspended_until) }}
            </el-tag>
            <span v-else class="muted">未停权</span>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && items.length === 0" description="暂无爽约记录" />
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { api, errorMessage } from '../api';
import { shortDateTime } from '../utils/format';

const loading = ref(false);
const items = ref([]);

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/no-shows');
    items.value = data.items;
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    loading.value = false;
  }
}

onMounted(load);
</script>

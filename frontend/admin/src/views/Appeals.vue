<template>
  <div v-loading="loading">
    <div class="page-header">
      <div>
        <h2 class="page-title">申诉处理</h2>
        <div class="page-subtitle">学生申诉通过后撤销对应爽约记录并恢复信用分</div>
      </div>
      <el-button :icon="Refresh" @click="load">刷新</el-button>
    </div>

    <div class="page-card">
      <el-table :data="items" size="small">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column label="学生" width="130">
          <template #default="{ row }">{{ row.student_name }}<div class="muted mono">{{ row.student_no }}</div></template>
        </el-table-column>
        <el-table-column prop="resource_name" label="场地" min-width="140" />
        <el-table-column label="预约时段" min-width="190">
          <template #default="{ row }">{{ shortDateTime(row.start_at) }} ~ {{ row.end_at.slice(11, 16) }}</template>
        </el-table-column>
        <el-table-column prop="reason" label="申诉理由" min-width="200" show-overflow-tooltip />
        <el-table-column label="状态" width="100">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'PENDING' ? 'warning' : row.status === 'APPROVED' ? 'success' : 'info'">
              {{ row.status === 'PENDING' ? '待处理' : row.status === 'APPROVED' ? '已通过' : '已驳回' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="result" label="处理结果" min-width="150" show-overflow-tooltip />
        <el-table-column label="操作" width="100" fixed="right">
          <template #default="{ row }">
            <el-button v-if="row.status === 'PENDING'" text type="primary" size="small" @click="openHandle(row)">
              处理
            </el-button>
          </template>
        </el-table-column>
      </el-table>
      <el-empty v-if="!loading && items.length === 0" description="暂无申诉" />
    </div>

    <el-dialog v-model="dialogVisible" title="处理申诉" width="460px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="决定">
          <el-radio-group v-model="form.decision">
            <el-radio value="APPROVED">通过并撤销爽约</el-radio>
            <el-radio value="REJECTED">驳回</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="说明">
          <el-input v-model="form.result" type="textarea" :rows="3" placeholder="填写处理说明" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="submit">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { api, errorMessage } from '../api';
import { shortDateTime } from '../utils/format';

const loading = ref(false);
const saving = ref(false);
const items = ref([]);
const dialogVisible = ref(false);
const currentId = ref(null);
const form = reactive({ decision: 'APPROVED', result: '' });

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/appeals');
    items.value = data.items;
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    loading.value = false;
  }
}

function openHandle(row) {
  currentId.value = row.id;
  form.decision = 'APPROVED';
  form.result = '';
  dialogVisible.value = true;
}

async function submit() {
  saving.value = true;
  try {
    await api.post(`/admin/appeals/${currentId.value}/handle`, form);
    ElMessage.success('申诉已处理');
    dialogVisible.value = false;
    await load();
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    saving.value = false;
  }
}

onMounted(load);
</script>

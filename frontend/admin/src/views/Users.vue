<template>
  <div v-loading="loading">
    <div class="page-header">
      <div>
        <h2 class="page-title">用户与角色</h2>
        <div class="page-subtitle">仅学院管理员可调整角色与账号状态</div>
      </div>
      <el-button :icon="Refresh" @click="load">刷新</el-button>
    </div>

    <div class="page-card">
      <div class="toolbar">
        <el-input
          v-model="filters.keyword"
          placeholder="搜索姓名或学号"
          clearable
          style="width: 220px"
          @keyup.enter="load"
        />
        <el-select v-model="filters.role" clearable placeholder="全部角色" style="width: 150px" @change="load">
          <el-option v-for="(label, value) in ROLE_LABELS" :key="value" :label="label" :value="value" />
        </el-select>
        <el-button @click="load">查询</el-button>
      </div>

      <el-table :data="users" size="small">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="student_no" label="账号 / 学号" width="150" />
        <el-table-column prop="name" label="姓名" width="120" />
        <el-table-column label="角色" width="120">
          <template #default="{ row }">
            <el-tag size="small" :type="row.role === 'COLLEGE_ADMIN' ? 'danger' : row.role === 'VENUE_ADMIN' ? 'warning' : 'info'">
              {{ ROLE_LABELS[row.role] }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === 'ACTIVE' ? 'success' : 'info'">
              {{ row.status === 'ACTIVE' ? '正常' : '停用' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="credit_score" label="信用分" width="80" />
        <el-table-column label="停权截止" min-width="150">
          <template #default="{ row }">{{ shortDateTime(row.suspended_until) }}</template>
        </el-table-column>
        <el-table-column label="操作" width="100">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" title="编辑用户" width="420px">
      <el-form :model="form" label-width="80px">
        <el-form-item label="姓名"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="角色">
          <el-select v-model="form.role" style="width: 100%">
            <el-option v-for="(label, value) in ROLE_LABELS" :key="value" :label="label" :value="value" />
          </el-select>
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio value="ACTIVE">正常</el-radio>
            <el-radio value="DISABLED">停用</el-radio>
          </el-radio-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import { Refresh } from '@element-plus/icons-vue';
import { api, errorMessage } from '../api';
import { ROLE_LABELS } from '../constants';
import { shortDateTime } from '../utils/format';

const loading = ref(false);
const saving = ref(false);
const users = ref([]);
const filters = reactive({ keyword: '', role: '' });
const dialogVisible = ref(false);
const editingId = ref(null);
const form = reactive({ name: '', role: 'STUDENT', status: 'ACTIVE' });

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/users', {
      params: {
        keyword: filters.keyword || undefined,
        role: filters.role || undefined,
      },
    });
    users.value = data.items;
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    loading.value = false;
  }
}

function openEdit(row) {
  editingId.value = row.id;
  Object.assign(form, { name: row.name, role: row.role, status: row.status });
  dialogVisible.value = true;
}

async function save() {
  saving.value = true;
  try {
    await api.patch(`/admin/users/${editingId.value}`, form);
    ElMessage.success('用户已更新');
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

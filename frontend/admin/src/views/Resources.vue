<template>
  <div v-loading="loading">
    <div class="page-header">
      <div>
        <h2 class="page-title">场地与时段</h2>
        <div class="page-subtitle">维护场地信息、开放时间与维护窗口</div>
      </div>
      <div class="toolbar" style="margin: 0">
        <el-button :icon="Refresh" @click="load">刷新</el-button>
        <el-button v-if="auth.isCollegeAdmin" type="primary" :icon="Plus" @click="openCreate">
          新增场地
        </el-button>
      </div>
    </div>

    <div class="page-card">
      <el-table :data="resources" size="small">
        <el-table-column prop="id" label="ID" width="60" />
        <el-table-column prop="name" label="场地名称" min-width="150" />
        <el-table-column label="类型" width="100">
          <template #default="{ row }">{{ row.typeLabel }}</template>
        </el-table-column>
        <el-table-column label="位置" min-width="140">
          <template #default="{ row }">{{ row.building }} {{ row.room }}</template>
        </el-table-column>
        <el-table-column prop="capacity" label="容量" width="70" />
        <el-table-column label="开放时间" width="140">
          <template #default="{ row }">{{ row.openFrom }} - {{ row.openTo }}</template>
        </el-table-column>
        <el-table-column label="状态" width="90">
          <template #default="{ row }">
            <el-tag :type="row.status === 'OPEN' ? 'success' : 'info'" size="small">
              {{ row.status === 'OPEN' ? '开放' : '关闭' }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column label="操作" width="220" fixed="right">
          <template #default="{ row }">
            <el-button text type="primary" size="small" @click="openEdit(row)">编辑</el-button>
            <el-button text type="warning" size="small" @click="openMaintenance(row)">维护时段</el-button>
            <el-button
              v-if="auth.isCollegeAdmin"
              text
              type="danger"
              size="small"
              @click="remove(row)"
            >删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </div>

    <el-dialog v-model="dialogVisible" :title="editingId ? '编辑场地' : '新增场地'" width="560px">
      <el-form :model="form" label-width="90px">
        <el-form-item label="名称"><el-input v-model="form.name" /></el-form-item>
        <el-form-item label="类型">
          <el-select v-model="form.type" style="width: 100%">
            <el-option v-for="(label, value) in TYPE_LABELS" :key="value" :label="label" :value="value" />
          </el-select>
        </el-form-item>
        <el-form-item label="楼栋"><el-input v-model="form.building" /></el-form-item>
        <el-form-item label="房间"><el-input v-model="form.room" /></el-form-item>
        <el-form-item label="容量"><el-input-number v-model="form.capacity" :min="1" :max="500" /></el-form-item>
        <el-form-item label="开放时间">
          <el-time-picker v-model="form.openFrom" format="HH:mm" value-format="HH:mm" placeholder="开始" />
          <span style="margin: 0 8px">至</span>
          <el-time-picker v-model="form.openTo" format="HH:mm" value-format="HH:mm" placeholder="结束" />
        </el-form-item>
        <el-form-item label="状态">
          <el-radio-group v-model="form.status">
            <el-radio value="OPEN">开放</el-radio>
            <el-radio value="CLOSED">关闭</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="说明"><el-input v-model="form.description" type="textarea" :rows="2" /></el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <el-drawer v-model="maintenanceVisible" :title="`维护时段 · ${currentResource?.name || ''}`" size="520px">
      <el-form :model="maintenanceForm" label-width="90px" class="maintenance-form">
        <el-form-item label="开始">
          <el-date-picker
            v-model="maintenanceForm.startAt"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            placeholder="选择开始时间"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="结束">
          <el-date-picker
            v-model="maintenanceForm.endAt"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            placeholder="选择结束时间"
            style="width: 100%"
          />
        </el-form-item>
        <el-form-item label="原因"><el-input v-model="maintenanceForm.reason" /></el-form-item>
        <el-form-item>
          <el-button type="primary" :loading="maintenanceSaving" @click="addMaintenance">添加维护时段</el-button>
        </el-form-item>
      </el-form>
      <el-table :data="maintenanceList" size="small">
        <el-table-column label="开始" min-width="150">
          <template #default="{ row }">{{ shortDateTime(row.start_at) }}</template>
        </el-table-column>
        <el-table-column label="结束" min-width="150">
          <template #default="{ row }">{{ shortDateTime(row.end_at) }}</template>
        </el-table-column>
        <el-table-column prop="reason" label="原因" min-width="100" />
        <el-table-column label="操作" width="70">
          <template #default="{ row }">
            <el-button text type="danger" size="small" @click="removeMaintenance(row)">删除</el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-drawer>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { Plus, Refresh } from '@element-plus/icons-vue';
import { api, errorMessage } from '../api';
import { useAuthStore } from '../stores/auth';
import { TYPE_LABELS } from '../constants';
import { shortDateTime } from '../utils/format';

const auth = useAuthStore();
const loading = ref(false);
const saving = ref(false);
const resources = ref([]);
const dialogVisible = ref(false);
const editingId = ref(null);
const form = reactive(defaultForm());

const maintenanceVisible = ref(false);
const currentResource = ref(null);
const maintenanceList = ref([]);
const maintenanceForm = reactive({ startAt: '', endAt: '', reason: '' });
const maintenanceSaving = ref(false);

function defaultForm() {
  return {
    name: '',
    type: 'SEMINAR',
    building: '',
    room: '',
    capacity: 4,
    openFrom: '08:00',
    openTo: '22:00',
    status: 'OPEN',
    description: '',
  };
}

function resetForm(data = defaultForm()) {
  Object.assign(form, data);
}

async function load() {
  loading.value = true;
  try {
    const { data } = await api.get('/admin/resources');
    resources.value = data.items;
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  editingId.value = null;
  resetForm();
  dialogVisible.value = true;
}

function openEdit(row) {
  editingId.value = row.id;
  resetForm({
    name: row.name,
    type: row.type,
    building: row.building,
    room: row.room,
    capacity: row.capacity,
    openFrom: row.openFrom,
    openTo: row.openTo,
    status: row.status,
    description: row.description || '',
  });
  dialogVisible.value = true;
}

async function save() {
  saving.value = true;
  try {
    if (editingId.value) {
      await api.put(`/admin/resources/${editingId.value}`, form);
      ElMessage.success('场地已更新');
    } else {
      await api.post('/admin/resources', form);
      ElMessage.success('场地已新增');
    }
    dialogVisible.value = false;
    await load();
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    saving.value = false;
  }
}

async function remove(row) {
  try {
    await ElMessageBox.confirm(`确认删除「${row.name}」？已有预约的场地不能删除。`, '删除场地', {
      type: 'warning',
    });
    await api.delete(`/admin/resources/${row.id}`);
    ElMessage.success('已删除');
    await load();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(errorMessage(error));
  }
}

async function openMaintenance(row) {
  currentResource.value = row;
  maintenanceVisible.value = true;
  Object.assign(maintenanceForm, { startAt: '', endAt: '', reason: '' });
  await loadMaintenance();
}

async function loadMaintenance() {
  try {
    const { data } = await api.get(`/admin/resources/${currentResource.value.id}/maintenance`);
    maintenanceList.value = data.items;
  } catch (error) {
    ElMessage.error(errorMessage(error));
  }
}

async function addMaintenance() {
  if (!maintenanceForm.startAt || !maintenanceForm.endAt) {
    ElMessage.warning('请选择开始和结束时间');
    return;
  }
  maintenanceSaving.value = true;
  try {
    await api.post(`/admin/resources/${currentResource.value.id}/maintenance`, maintenanceForm);
    ElMessage.success('维护时段已添加');
    Object.assign(maintenanceForm, { startAt: '', endAt: '', reason: '' });
    await loadMaintenance();
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    maintenanceSaving.value = false;
  }
}

async function removeMaintenance(row) {
  try {
    await ElMessageBox.confirm('确认删除该维护时段？', '删除维护时段', { type: 'warning' });
    await api.delete(`/admin/maintenance/${row.id}`);
    ElMessage.success('已删除');
    await loadMaintenance();
  } catch (error) {
    if (error !== 'cancel' && error !== 'close') ElMessage.error(errorMessage(error));
  }
}

onMounted(load);
</script>

<style scoped>
.maintenance-form {
  margin-bottom: 8px;
}
</style>

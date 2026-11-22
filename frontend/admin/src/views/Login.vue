<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand">
        <div class="logo">智约</div>
        <h1>校园共享空间管理后台</h1>
        <p>《专业基础实践》课程项目 · 本地演示</p>
      </div>

      <el-form :model="form" label-position="top" @submit.prevent="submit">
        <el-form-item label="账号">
          <el-input v-model="form.studentNo" size="large" placeholder="管理员账号" autocomplete="username" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input
            v-model="form.password"
            size="large"
            type="password"
            show-password
            placeholder="密码"
            autocomplete="current-password"
            @keyup.enter="submit"
          />
        </el-form-item>
        <el-button type="primary" size="large" class="submit" :loading="loading" @click="submit">
          登录
        </el-button>
      </el-form>

      <div class="demo">
        <div class="demo-title">演示账号</div>
        <button class="demo-row" @click="fill('admin', 'admin123')">
          <span>学院管理员</span><code>admin / admin123</code>
        </button>
        <button class="demo-row" @click="fill('manager', 'manager123')">
          <span>场地管理员</span><code>manager / manager123</code>
        </button>
      </div>
      <p class="note">学生端请使用微信开发者工具打开 <code>frontend/mini-program</code>。</p>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ElMessage } from 'element-plus';
import { useAuthStore } from '../stores/auth';
import { errorMessage } from '../api';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();
const loading = ref(false);
const form = reactive({ studentNo: 'admin', password: 'admin123' });

function fill(studentNo, password) {
  form.studentNo = studentNo;
  form.password = password;
}

async function submit() {
  if (!form.studentNo || !form.password) {
    ElMessage.warning('请输入账号和密码');
    return;
  }
  loading.value = true;
  try {
    const user = await auth.login(form.studentNo, form.password);
    if (user.role === 'STUDENT') {
      auth.logout();
      ElMessage.error('学生账号请使用小程序端');
      return;
    }
    ElMessage.success(`欢迎，${user.name}`);
    router.push(route.query.redirect || '/dashboard');
  } catch (error) {
    ElMessage.error(errorMessage(error));
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.login-page {
  min-height: 100vh;
  display: grid;
  place-items: center;
  background:
    radial-gradient(circle at 15% 20%, rgba(37, 99, 235, 0.18), transparent 40%),
    radial-gradient(circle at 85% 80%, rgba(14, 165, 233, 0.16), transparent 45%),
    #f8fafc;
  padding: 20px;
}
.login-card {
  width: min(420px, 100%);
  background: #fff;
  border-radius: 18px;
  padding: 34px 32px 26px;
  box-shadow: 0 20px 50px rgba(15, 23, 42, 0.12);
}
.brand {
  text-align: center;
  margin-bottom: 24px;
}
.logo {
  width: 64px;
  height: 64px;
  margin: 0 auto 12px;
  border-radius: 18px;
  background: linear-gradient(135deg, #2563eb, #0ea5e9);
  color: #fff;
  font-size: 24px;
  font-weight: 700;
  display: grid;
  place-items: center;
  letter-spacing: 2px;
}
h1 {
  font-size: 19px;
  margin: 0 0 6px;
}
p {
  margin: 0;
  color: #6b7280;
  font-size: 13px;
}
.submit {
  width: 100%;
  margin-top: 6px;
}
.demo {
  margin-top: 22px;
  border-top: 1px dashed #e5e7eb;
  padding-top: 16px;
}
.demo-title {
  font-size: 12px;
  color: #9ca3af;
  margin-bottom: 8px;
}
.demo-row {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  border: 1px solid #e5e7eb;
  background: #f9fafb;
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 8px;
  cursor: pointer;
  font-size: 13px;
  color: #374151;
}
.demo-row:hover {
  border-color: #93c5fd;
  background: #eff6ff;
}
.demo-row code {
  color: #2563eb;
}
.note {
  margin-top: 14px;
  font-size: 12px;
  color: #9ca3af;
  line-height: 1.6;
  text-align: center;
}
</style>

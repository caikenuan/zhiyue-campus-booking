<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="brand">
        <div class="brand-mark">智约</div>
        <div class="brand-sub">校园空间管理后台</div>
      </div>
      <el-menu :default-active="route.path" router class="menu">
        <el-menu-item index="/dashboard">
          <el-icon><DataBoard /></el-icon><span>运营仪表盘</span>
        </el-menu-item>
        <el-menu-item index="/resources">
          <el-icon><OfficeBuilding /></el-icon><span>场地与时段</span>
        </el-menu-item>
        <el-menu-item index="/bookings">
          <el-icon><Calendar /></el-icon><span>预约审批</span>
        </el-menu-item>
        <el-menu-item v-if="auth.isCollegeAdmin" index="/users">
          <el-icon><User /></el-icon><span>用户与角色</span>
        </el-menu-item>
        <el-menu-item index="/no-shows">
          <el-icon><Warning /></el-icon><span>爽约名单</span>
        </el-menu-item>
        <el-menu-item index="/stats">
          <el-icon><TrendCharts /></el-icon><span>利用率统计</span>
        </el-menu-item>
        <el-menu-item index="/appeals">
          <el-icon><ChatLineSquare /></el-icon><span>申诉处理</span>
        </el-menu-item>
        <el-menu-item index="/logs">
          <el-icon><Document /></el-icon><span>操作日志</span>
        </el-menu-item>
        <el-menu-item index="/rules">
          <el-icon><Setting /></el-icon><span>规则参数</span>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div>
          <span class="header-title">{{ route.meta.title || '管理后台' }}</span>
          <span class="header-tip">本地演示环境</span>
        </div>
        <el-dropdown @command="onCommand">
          <span class="user-chip">
            <el-icon><UserFilled /></el-icon>
            {{ auth.user?.name }} · {{ roleLabel }}
            <el-icon><ArrowDown /></el-icon>
          </span>
          <template #dropdown>
            <el-dropdown-menu>
              <el-dropdown-item command="logout">退出登录</el-dropdown-item>
            </el-dropdown-menu>
          </template>
        </el-dropdown>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import { ROLE_LABELS } from '../constants';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const roleLabel = computed(() => ROLE_LABELS[auth.user?.role] || '');

function onCommand(command) {
  if (command === 'logout') {
    auth.logout();
    router.push('/login');
  }
}
</script>

<style scoped>
.layout {
  height: 100vh;
}
.aside {
  background: #0f172a;
  color: #e2e8f0;
  display: flex;
  flex-direction: column;
}
.brand {
  padding: 22px 20px 16px;
  border-bottom: 1px solid rgba(148, 163, 184, 0.18);
}
.brand-mark {
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 2px;
}
.brand-sub {
  margin-top: 4px;
  font-size: 12px;
  color: #94a3b8;
}
.menu {
  border-right: none;
  background: transparent;
  --el-menu-bg-color: transparent;
  --el-menu-text-color: #cbd5e1;
  --el-menu-hover-bg-color: rgba(148, 163, 184, 0.12);
  --el-menu-active-color: #ffffff;
}
.menu :deep(.el-menu-item.is-active) {
  background: #2563eb;
  border-radius: 8px;
  margin: 4px 10px;
}
.menu :deep(.el-menu-item) {
  margin: 4px 10px;
  border-radius: 8px;
}
.header {
  background: #fff;
  border-bottom: 1px solid #e5e7eb;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.header-title {
  font-size: 17px;
  font-weight: 600;
}
.header-tip {
  margin-left: 12px;
  font-size: 12px;
  color: #9ca3af;
}
.user-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  color: #374151;
  font-size: 13px;
}
.main {
  padding: 20px;
  overflow-y: auto;
}
</style>

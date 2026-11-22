import { createRouter, createWebHistory } from 'vue-router';
import { useAuthStore } from '../stores/auth';
import Layout from '../views/Layout.vue';
import Login from '../views/Login.vue';
import Dashboard from '../views/Dashboard.vue';
import Resources from '../views/Resources.vue';
import Bookings from '../views/Bookings.vue';
import Users from '../views/Users.vue';
import NoShows from '../views/NoShows.vue';
import Utilization from '../views/Utilization.vue';
import Logs from '../views/Logs.vue';
import Appeals from '../views/Appeals.vue';
import Rules from '../views/Rules.vue';

const routes = [
  { path: '/login', component: Login, meta: { public: true, title: '登录' } },
  {
    path: '/',
    component: Layout,
    children: [
      { path: '', redirect: '/dashboard' },
      { path: 'dashboard', component: Dashboard, meta: { title: '运营仪表盘' } },
      { path: 'resources', component: Resources, meta: { title: '场地与时段' } },
      { path: 'bookings', component: Bookings, meta: { title: '预约审批' } },
      {
        path: 'users',
        component: Users,
        meta: { title: '用户与角色', roles: ['COLLEGE_ADMIN'] },
      },
      { path: 'no-shows', component: NoShows, meta: { title: '爽约名单' } },
      { path: 'stats', component: Utilization, meta: { title: '利用率统计' } },
      { path: 'logs', component: Logs, meta: { title: '操作日志' } },
      { path: 'appeals', component: Appeals, meta: { title: '申诉处理' } },
      { path: 'rules', component: Rules, meta: { title: '规则参数' } },
    ],
  },
  { path: '/:pathMatch(.*)*', redirect: '/dashboard' },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to) => {
  const auth = useAuthStore();
  if (to.meta.public) return true;
  if (!auth.token) {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  if (!auth.user) {
    try {
      await auth.loadMe();
    } catch {
      auth.logout();
      return { path: '/login', query: { redirect: to.fullPath } };
    }
  }
  if (auth.user.role === 'STUDENT') {
    auth.logout();
    return { path: '/login' };
  }
  if (to.meta.roles && !to.meta.roles.includes(auth.user.role)) {
    return { path: '/dashboard' };
  }
  return true;
});

export default router;

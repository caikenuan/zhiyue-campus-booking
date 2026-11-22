import { defineStore } from 'pinia';
import { api, TOKEN_KEY } from '../api';

export const useAuthStore = defineStore('auth', {
  state: () => ({
    token: localStorage.getItem(TOKEN_KEY) || '',
    user: null,
  }),
  getters: {
    isLoggedIn: (state) => Boolean(state.token),
    isCollegeAdmin: (state) => state.user?.role === 'COLLEGE_ADMIN',
  },
  actions: {
    async login(studentNo, password) {
      const { data } = await api.post('/auth/login', { studentNo, password });
      this.token = data.token;
      this.user = data.user;
      localStorage.setItem(TOKEN_KEY, data.token);
      return data.user;
    },
    async loadMe() {
      if (!this.token) return null;
      const { data } = await api.get('/auth/me');
      this.user = data.user;
      return data.user;
    },
    logout() {
      this.token = '';
      this.user = null;
      localStorage.removeItem(TOKEN_KEY);
    },
  },
});

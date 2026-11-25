import axios from 'axios';

const TOKEN_KEY = 'zhiyue_admin_token';

// 默认同源 /api（Nginx 反代）；静态托管（Cloudflare Pages 等）时
// 构建前设置 VITE_API_BASE=https://your-api.onrender.com/api
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api',
  timeout: 15000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem(TOKEN_KEY);
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export function errorMessage(error) {
  return error?.response?.data?.error?.message || error?.message || '请求失败';
}

export { TOKEN_KEY };

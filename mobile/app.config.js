// Demo builds (EXPO_PUBLIC_DEMO=1) are hosted as a handful of static files, so every screen goes in one
// bundle instead of being loaded on demand from absolute URLs.
module.exports = ({ config }) =>
  process.env.EXPO_PUBLIC_DEMO === '1'
    ? { ...config, plugins: config.plugins.map((p) => (p === 'expo-router' ? ['expo-router', { asyncRoutes: false }] : p)) }
    : config;

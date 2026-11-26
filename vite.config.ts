import { defineConfig } from 'vite';

const PORTAL_SDK_SCRIPTS: Record<string, string> = {
  crazygames: '<script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>',
  poki: '<script src="https://game-cdn.poki.com/scripts/v2/poki-sdk.js"></script>',
  gamedistribution: '<script src="https://html5.api.gamedistribution.com/main.min.js"></script>',
  yandex: '<script src="https://yandex.ru/games/sdk/v2"></script>',
  standalone: '',
  mock: '',
};

export default defineConfig(({ mode }) => {
  const platform = process.env.VITE_PLATFORM || mode || 'mock';
  const outDir = process.env.VITE_OUT_DIR || `dist/${platform}`;
  const sdkScript = PORTAL_SDK_SCRIPTS[platform] ?? '';

  return {
    base: './',
    define: {
      __DEV_MODE__: JSON.stringify(mode === 'development' || platform === 'mock'),
      __PLATFORM__: JSON.stringify(platform),
    },
    build: {
      outDir,
      emptyOutDir: true,
      assetsInlineLimit: 4096,
      minify: 'esbuild',
      target: 'es2020',
      rollupOptions: {
        output: {
          manualChunks: undefined,
        },
      },
    },
    plugins: [
      {
        name: 'inject-portal-sdk',
        transformIndexHtml(html) {
          return html.replace('<!-- PORTAL_SDK_SCRIPT -->', sdkScript);
        },
      },
    ],
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
    },
  };
});

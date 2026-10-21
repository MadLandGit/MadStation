import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function developmentCsp(): Plugin {
  return {
    name: 'mad-station-development-csp',
    transformIndexHtml(html, context) {
      if (!context.server) return html;
      return html
        .replace("script-src 'self'", "script-src 'self' http://127.0.0.1:5173")
        .replace("style-src 'self'", "style-src 'self' 'unsafe-inline' http://127.0.0.1:5173")
        .replace("connect-src 'none'", "connect-src 'self' http://127.0.0.1:5173 ws://127.0.0.1:5173");
    },
  };
}

export default defineConfig({
  root: resolve(__dirname, 'src'),
  base: './',
  plugins: [react(), developmentCsp()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    open: false,
  },
  build: {
    outDir: resolve(__dirname, 'build'),
    emptyOutDir: true,
    target: 'chrome152',
    rollupOptions: {
      input: {
        toolbar: resolve(__dirname, 'src/toolbar.html'),
        'home-companions-react': resolve(__dirname, 'src/renderer-react/home-companions.tsx'),
        'home-mini-apps-react': resolve(__dirname, 'src/renderer-react/home-mini-apps.tsx'),
        'accounts-react': resolve(__dirname, 'src/renderer-react/account-list.tsx'),
        'ai-hub-management-forms-react': resolve(__dirname, 'src/renderer-react/ai-hub-management-forms.tsx'),
        'ai-hub-management-lists-react': resolve(__dirname, 'src/renderer-react/ai-hub-management-lists.tsx'),
        'ai-hub-account-navigation-react': resolve(__dirname, 'src/renderer-react/ai-hub-account-navigation.tsx'),
        'context-menu-react': resolve(__dirname, 'src/renderer-react/context-menu.tsx'),
        'rename-account-modal-react': resolve(__dirname, 'src/renderer-react/rename-account-modal.tsx'),
        'password-modal-react': resolve(__dirname, 'src/renderer-react/password-modal.tsx'),
        'lock-screen-react': resolve(__dirname, 'src/renderer-react/lock-screen.tsx'),
        'utility-lists-react': resolve(__dirname, 'src/renderer-react/utility-lists.tsx'),
        'utility-workspaces-react': resolve(__dirname, 'src/renderer-react/utility-workspaces.tsx'),
        'home-customizer-react': resolve(__dirname, 'src/renderer-react/home-customizer.tsx'),
        'home-widgets-react': resolve(__dirname, 'src/renderer-react/home-widgets.tsx'),
        'image-hub-sidebar-react': resolve(__dirname, 'src/renderer-react/image-hub-sidebar.tsx'),
        'image-hub-discovery-react': resolve(__dirname, 'src/renderer-react/image-hub-discovery.tsx'),
        'image-hub-workspace-toolbar-react': resolve(__dirname, 'src/renderer-react/image-hub-workspace-toolbar.tsx'),
        'image-hub-workspace-chrome-react': resolve(__dirname, 'src/renderer-react/image-hub-workspace-chrome.tsx'),
        'image-hub-sidebar-chrome-react': resolve(__dirname, 'src/renderer-react/image-hub-sidebar-chrome.tsx'),
        'image-hub-settings-react': resolve(__dirname, 'src/renderer-react/image-hub-settings.tsx'),
        'image-hub-browser-state-react': resolve(__dirname, 'src/renderer-react/image-hub-browser-state.tsx'),
        'notes-workspace-react': resolve(__dirname, 'src/renderer-react/notes-workspace.tsx'),
        'video-hub-sites-react': resolve(__dirname, 'src/renderer-react/video-hub-sites.tsx'),
        'video-hub-provider-tiles-react': resolve(__dirname, 'src/renderer-react/video-hub-provider-tiles.tsx'),
        'video-hub-sidebar-controls-react': resolve(__dirname, 'src/renderer-react/video-hub-sidebar-controls.tsx'),
        'video-hub-account-list-react': resolve(__dirname, 'src/renderer-react/video-hub-account-list.tsx'),
        'video-hub-recent-react': resolve(__dirname, 'src/renderer-react/video-hub-recent.tsx'),
        'notifications-react': resolve(__dirname, 'src/renderer-react/notifications.tsx'),
        'downloads-list-react': resolve(__dirname, 'src/renderer-react/downloads-list.tsx'),
        'memory-process-table-react': resolve(__dirname, 'src/renderer-react/memory-process-table.tsx'),
        'memory-monitor-react': resolve(__dirname, 'src/renderer-react/memory-monitor.tsx'),
        'video-hub-providers-react': resolve(__dirname, 'src/renderer-react/video-hub-providers.tsx'),
        'video-hub-workspace-chrome-react': resolve(__dirname, 'src/renderer-react/video-hub-workspace-chrome.tsx'),
        'video-hub-browser-state-react': resolve(__dirname, 'src/renderer-react/video-hub-browser-state.tsx'),
        'video-hub-settings-react': resolve(__dirname, 'src/renderer-react/video-hub-settings.tsx'),
        'video-hub-setup-forms-react': resolve(__dirname, 'src/renderer-react/video-hub-setup-forms.tsx'),
        'appearance-controls-react': resolve(__dirname, 'src/renderer-react/appearance-controls.tsx'),
        'remaining-settings-panels-react': resolve(__dirname, 'src/renderer-react/remaining-settings-panels.tsx'),
        'global-settings-panels-react': resolve(__dirname, 'src/renderer-react/global-settings-panels.tsx'),
        'system-settings-panels-react': resolve(__dirname, 'src/renderer-react/system-settings-panels.tsx'),
        'information-security-panels-react': resolve(__dirname, 'src/renderer-react/information-security-panels.tsx'),
        'ai-playground-api-arena-react': resolve(__dirname, 'src/renderer-react/ai-playground-api-arena.tsx'),
        'ai-playground-api-model-settings-react': resolve(__dirname, 'src/renderer-react/ai-playground-api-model-settings.tsx'),
        'ai-playground-browser-arenas-react': resolve(__dirname, 'src/renderer-react/ai-playground-browser-arenas.tsx'),
        'ai-playground-arena-management-react': resolve(__dirname, 'src/renderer-react/ai-playground-arena-management.tsx'),
        'instruction-forge-accounts-react': resolve(__dirname, 'src/renderer-react/instruction-forge-accounts.tsx'),
        'instruction-forge-settings-react': resolve(__dirname, 'src/renderer-react/instruction-forge-settings.tsx'),
        'instruction-forge-composer-react': resolve(__dirname, 'src/renderer-react/instruction-forge-composer.tsx'),
        'ai-playground-settings-react': resolve(__dirname, 'src/renderer-react/ai-playground-settings.tsx'),
        'ai-playground-arena-setup-react': resolve(__dirname, 'src/renderer-react/ai-playground-arena-setup.tsx'),
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { allowedHosts } from './scripts/devEnv.mjs';

export default defineConfig({
  plugins: [react()],
  // Use relative asset paths in the built index.html so the bundle
  // works no matter what subpath it's deployed at (foo.com/, foo.com/warp/,
  // file:///…, etc.). Combined with the dataLoader's './preprocessed/'
  // path, this keeps the whole site self-contained.
  base: './',
  server: {
    port: 5173,
    host: '0.0.0.0',
    // Set WARP_ALLOWED_HOSTS in .env.local (gitignored) to add your
    // own dev hostnames — see .env.local.example.
    allowedHosts,
    // The docs site is its own Vite project (VitePress) — nothing in
    // docs/ is imported by the viewer's module graph, so HMR has no
    // reason to watch it. Skipping the whole tree also avoids a
    // chokidar crash (errno -116) on NFS-style filesystems when
    // `scripts/bundle.sh` wipes docs/.vitepress/dist/ mid-flight.
    watch: {
      ignored: ['**/docs/**'],
    },
  },
  assetsInclude: ['**/*.glsl', '**/*.vert', '**/*.frag'],
  build: {
    // BrainViewer pulls in three + @react-three/*, which lands around
    // 850 kB minified (≈225 kB gzipped). It's already lazy-loaded, and
    // shrinking it further isn't worth the churn — raise the warning
    // threshold so builds stay quiet.
    chunkSizeWarningLimit: 900,
  },
});

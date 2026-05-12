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
  },
  assetsInclude: ['**/*.glsl', '**/*.vert', '**/*.frag'],
});

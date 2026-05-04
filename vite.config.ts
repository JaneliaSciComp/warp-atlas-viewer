import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: '0.0.0.0',
    allowedHosts: ['rokickik-dev.int.janelia.org', '.int.janelia.org', 'localhost'],
  },
  assetsInclude: ['**/*.glsl', '**/*.vert', '**/*.frag'],
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

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
    allowedHosts: ['rokickik-dev.int.janelia.org', '.int.janelia.org', 'localhost'],
  },
  assetsInclude: ['**/*.glsl', '**/*.vert', '**/*.frag'],
});

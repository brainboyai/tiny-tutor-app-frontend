        import { defineConfig } from 'vite';
        import react from '@vitejs/plugin-react-swc';

        // https://vitejs.dev/config/
        export default defineConfig({
          plugins: [react()],
          // This 'base' option is crucial for deployments to static hosts
          // It ensures that all asset paths (like your JavaScript bundles)
          // are generated relative to the index.html file itself.
          base: './',
          build: {
            // Default output directory is 'dist'.
            // When Render/Netlify's Publish Directory is 'dist', it expects the built files here.
            outDir: 'dist',
            // *** IMPORTANT: Removed rollupOptions.input. Vite should automatically process public/index.html. ***
          }
        });
        
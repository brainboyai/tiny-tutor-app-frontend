        import { defineConfig } from 'vite';
        import react from '@vitejs/plugin-react-swc';
        import path from 'path';

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
            rollupOptions: {
              // Point to index.html inside the 'public' folder.
              // __dirname is the current directory (tiny-tutor-frontend-local).
              input: {
                main: path.resolve(__dirname, 'public/index.html') // <--- Corrected path for public/index.html
              }
            }
          }
        });
        
        import { defineConfig } from 'vite';
        import react from '@vitejs/plugin-react-swc';
        import path from 'path'; // path is needed for resolve

        // https://vitejs.dev/config/
        export default defineConfig({
          plugins: [react()],
          // Set the project root to the 'public' directory.
          // This tells Vite where to find your index.html and other static assets.
          root: 'public', // <--- IMPORTANT CHANGE
          // This 'base' option is crucial for deployments to static hosts
          // It ensures that all asset paths (like your JavaScript bundles)
          // are generated relative to the index.html file itself.
          base: './',
          build: {
            // Output directory for the build. This will be 'dist' at the top level
            // of your repository, because 'root: public' changes the context.
            outDir: '../dist', // <--- IMPORTANT CHANGE: Output one level up from 'public'
            rollupOptions: {
              // Explicitly define the entry point for the build.
              // Now it's just 'index.html' because 'root' is set to 'public'.
              input: {
                main: path.resolve(__dirname, 'public/index.html') // <--- Corrected path for public/index.html
              }
            }
          }
        });
        
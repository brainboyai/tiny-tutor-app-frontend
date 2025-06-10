import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [react()],
    // Set the project root to the directory containing index.html and other static assets.
    // This tells Vite where to find the main entry point for the HTML.
    root: path.resolve(__dirname, 'public'), // IMPORTANT: Explicitly set root to 'public'
    // This 'base' option is crucial for deployments to static hosts
    // It ensures that all asset paths (like your JavaScript bundles)
    // are generated relative to the index.html file itself.
    base: './',
    build: {
        // Output directory for the build.
        // Since 'root' is 'public', 'outDir: '../dist'' means the 'dist' folder
        // will be created one level up from 'public', i.e., in 'tiny-tutor-frontend-local/dist'.
        outDir: '../dist', // IMPORTANT: Output one level up from the 'root' (public)
        // Ensure the output directory is emptied before each build.
        emptyOutDir: true, // <--- NEW: Added to ensure clean build
        // No need for rollupOptions.input when 'root' is correctly set and
        // index.html is directly within that root. Vite handles it automatically.
    }
});

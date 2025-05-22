import React from 'react';
import ReactDOM from 'react-dom/client';
import App, { AuthProvider } from './App.tsx'; // Import AuthProvider along with App
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider> {/* Wrap the App component with AuthProvider */}
      <App />
    </AuthProvider>
  </React.StrictMode>,
);

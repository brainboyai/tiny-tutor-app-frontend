import React, { useState } from 'react';
import { Home, KeyRound, Palette, Trash2, Shield, Bell, BellOff } from 'lucide-react';

interface SettingsPageProps {
  onNavigateBack: () => void;
  customApiKey: string;
  setCustomApiKey: (key: string) => void;
  onValidateAndSaveApiKey: () => Promise<void>;
  isApiKeyValidating: boolean;
  apiKeyValidationStatus: { message: string; type: 'success' | 'error' | 'idle' };
  onDeleteAccount: () => void; // Function to trigger account deletion
}

const SettingsPageComponent: React.FC<SettingsPageProps> = ({
  onNavigateBack,
  customApiKey,
  setCustomApiKey,
  onValidateAndSaveApiKey,
  isApiKeyValidating,
  apiKeyValidationStatus,
  onDeleteAccount
}) => {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [theme, setTheme] = useState('dark');
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleThemeChange = (selectedTheme: string) => {
    setTheme(selectedTheme);
    // In a real implementation, you would apply the theme globally
    // For now, we just manage the state.
    console.log("Theme changed to:", selectedTheme);
  };
  
  const renderPrivacyModal = () => {
      if (!showPrivacyModal) return null;
      return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-[--background-secondary] p-8 rounded-xl shadow-2xl w-full max-w-2xl">
                 <h3 className="font-bold text-2xl text-[--text-primary] mb-4">Privacy Notice</h3>
                 <div className="text-[--text-secondary] space-y-2 max-h-[60vh] overflow-y-auto pr-4">
                    <p>Your privacy is important to us. This notice explains what data we collect and how we use it.</p>
                    <p><strong className="text-[--text-primary]">User-Provided API Keys:</strong> If you provide your own Gemini API key, it is stored exclusively in your browser's local storage. It is sent directly to Google's Gemini API for your requests and is NEVER stored on our servers.</p>
                    <p><strong className="text-[--text-primary]">Authentication:</strong> When you sign up and log in, we store your username, email, and a securely hashed version of your password in our Firebase database to manage your account.</p>
                    <p><strong className="text-[--text-primary]">Learning History (Pro Users):</strong> For Pro users, we save your explored words, favorited words, and streak history to provide you with a personalized experience on your Profile Page. This data is associated with your user account.</p>
                    <p><strong className="text-[--text-primary]">Data Deletion:</strong> You can permanently delete your account and all associated data at any time using the "Delete Account" feature on this page.</p>
                 </div>
                 <div className="flex justify-end mt-6">
                    <button onClick={() => setShowPrivacyModal(false)} className="py-2 px-6 rounded-md bg-[--accent-primary] text-black font-semibold">Close</button>
                 </div>
            </div>
        </div>
      );
  };
  
  const renderDeleteConfirmModal = () => {
      if (!showDeleteConfirm) return null;
       return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-red-900/50 p-8 rounded-xl shadow-2xl w-full max-w-md border border-red-600">
                 <h3 className="font-bold text-2xl text-red-200 mb-2">Are you absolutely sure?</h3>
                 <p className="text-red-300 mb-6">This action cannot be undone. All your data, including profile, learning history, and streaks will be permanently deleted.</p>
                 <div className="flex justify-end gap-4">
                    <button onClick={() => setShowDeleteConfirm(false)} className="py-2 px-4 rounded-md text-sm hover:bg-slate-700/50">Cancel</button>
                    <button onClick={() => { onDeleteAccount(); setShowDeleteConfirm(false); }} className="py-2 px-4 rounded-md text-sm bg-red-600 hover:bg-red-500 text-white font-semibold">Yes, Delete My Account</button>
                 </div>
            </div>
        </div>
      );
  }

  return (
    <div className="w-full animate-fadeIn">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[--background-default] py-4 -mt-8 pt-8 mb-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-[--text-primary]">Settings</h1>
          <button
            onClick={onNavigateBack}
            className="flex items-center px-4 py-2 bg-[--accent-primary] hover:bg-[--accent-secondary] text-black rounded-lg transition-colors font-semibold"
          >
            <Home size={20} className="mr-2" /> Back to Explorer
          </button>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="space-y-8">

        {/* API Key Section */}
        <div className="bg-[--background-secondary] p-6 rounded-lg shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <KeyRound className="w-6 h-6 text-[--accent-primary]" />
            <h2 className="text-xl font-semibold text-[--text-primary]">API Key</h2>
          </div>
          <p className="text-[--text-tertiary] mb-4 text-sm">Provide your own Google Gemini API key to bypass the free daily usage limits.</p>
          <input
              id="api-key-input"
              type="password"
              value={customApiKey}
              onChange={(e) => setCustomApiKey(e.target.value)}
              className="w-full p-3 bg-[--background-input] border border-[--border-color] rounded-lg text-[--text-primary] focus:ring-2 focus:ring-[--accent-primary] outline-none"
              placeholder="Enter your Google AI API Key"
          />
          {apiKeyValidationStatus.type !== 'idle' && (
              <p className={`text-sm mt-2 ${apiKeyValidationStatus.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                  {apiKeyValidationStatus.message}
              </p>
          )}
          <div className="flex justify-end mt-4">
              <button onClick={onValidateAndSaveApiKey} className="py-2 px-6 rounded-md text-sm bg-[--accent-primary] text-black font-semibold disabled:opacity-50" disabled={isApiKeyValidating}>
                  {isApiKeyValidating ? 'Validating...' : 'Save Key'}
              </button>
          </div>
        </div>

        {/* UI & Sound Section */}
        <div className="bg-[--background-secondary] p-6 rounded-lg shadow-xl">
            <div className="flex items-center gap-3 mb-4">
                <Palette className="w-6 h-6 text-[--accent-primary]" />
                <h2 className="text-xl font-semibold text-[--text-primary]">Appearance & Sound</h2>
            </div>
            <div className="space-y-4">
                {/* Sound Toggle */}
                <div className="flex items-center justify-between">
                    <label className="text-[--text-secondary]">Application Sounds</label>
                    <button onClick={() => setSoundEnabled(!soundEnabled)} className="flex items-center gap-2 text-sm p-2 rounded-md hover:bg-[--hover-bg-color]">
                        {soundEnabled ? <><Bell size={18} /> On</> : <><BellOff size={18} /> Off</>}
                    </button>
                </div>
                {/* Theme Selection */}
                <div className="flex items-center justify-between">
                    <label className="text-[--text-secondary]">UI Theme</label>
                    <div className="flex items-center gap-2 bg-[--background-input] p-1 rounded-md">
                        <button onClick={() => handleThemeChange('light')} className={`px-3 py-1 text-sm rounded ${theme === 'light' ? 'bg-[--accent-primary] text-black' : ''}`}>Light</button>
                        <button onClick={() => handleThemeChange('dark')} className={`px-3 py-1 text-sm rounded ${theme === 'dark' ? 'bg-[--accent-primary] text-black' : ''}`}>Dark</button>
                    </div>
                </div>
            </div>
        </div>

        {/* Account Section */}
        <div className="bg-[--background-secondary] p-6 rounded-lg shadow-xl border border-red-500/30">
          <div className="flex items-center gap-3 mb-4">
            <Trash2 className="w-6 h-6 text-red-400" />
            <h2 className="text-xl font-semibold text-red-300">Account Actions</h2>
          </div>
           <div className="flex items-center justify-between">
                <p className="text-[--text-tertiary] text-sm">Permanently delete your account and all data.</p>
                <button onClick={() => setShowDeleteConfirm(true)} className="py-2 px-4 rounded-md text-sm bg-red-600 hover:bg-red-500 text-white font-semibold">
                    Delete Account
                </button>
            </div>
        </div>
        
        {/* Legal Section */}
        <div className="bg-[--background-secondary] p-6 rounded-lg shadow-xl">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-6 h-6 text-[--accent-primary]" />
            <h2 className="text-xl font-semibold text-[--text-primary]">Legal</h2>
          </div>
           <div className="flex items-center justify-between">
                <p className="text-[--text-tertiary] text-sm">Review our data usage and privacy policies.</p>
                <button onClick={() => setShowPrivacyModal(true)} className="py-2 px-4 rounded-md text-sm bg-[--hover-bg-color] hover:bg-[--border-color] font-semibold">
                    Show Privacy Notice
                </button>
            </div>
        </div>
      </div>
      
      {/* Modals */}
      {renderPrivacyModal()}
      {renderDeleteConfirmModal()}
    </div>
  );
};

export default SettingsPageComponent;
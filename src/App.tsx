import React, { useState, useEffect, useCallback, FormEvent, useRef } from 'react';
import {
  Heart, Lightbulb, LogIn, LogOut, Sparkles, User, X,
  MessageSquareQuote, Home, Settings, Menu, Plus
} from 'lucide-react';
import './index.css'; // Ensure global styles are imported
import ProfilePageComponent from './ProfilePage';

// --- Types (Keep all existing types as they are) ---
interface CurrentUser { username: string; email: string; id: string; }
interface ParsedQuizQuestion { question: string; options: { [key: string]: string }; correctOptionKey: string; explanation?: string; originalString?: string; }
interface GeneratedContentItem { explanation?: string; fact?: string; image_prompt?: string; image_url?: string; deep_dive?: string; is_favorite?: boolean; first_explored_at?: string; last_explored_at?: string; modes_generated?: string[]; }
interface GeneratedContent { [wordId: string]: GeneratedContentItem; }
interface LiveStreak { score: number; words: string[]; }
interface StreakRecord { id: string; words: string[]; score: number; completed_at: string; }
interface ExploredWordEntry { word: string; last_explored_at: string; is_favorite: boolean; first_explored_at?: string; }
interface UserProfileData { username: string; email: string; totalWordsExplored: number; exploredWords: ExploredWordEntry[]; favoriteWords: ExploredWordEntry[]; streakHistory: StreakRecord[]; quiz_points?: number; total_quiz_questions_answered?: number; total_quiz_questions_correct?: number; }
type ContentMode = 'explain' | 'quiz';
interface StreakQuizItem { word: string; originalExplanation: string; quizQuestion: ParsedQuizQuestion; attempted: boolean; selectedOptionKey?: string; isCorrect?: boolean; }


// --- Helper Functions (Keep existing helpers as they are) ---
const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';
const sanitizeWordForId = (word: string): string => { if (typeof word !== 'string') return "invalid_word_input"; return word.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''); };
const parseQuizStringToArray = (quizStringsFromBackend: any): ParsedQuizQuestion[] => { /* ... no changes here ... */ return [];};


function App() {
  // --- STATE MANAGEMENT (Keep all existing state variables) ---
  const [inputValue, setInputValue] = useState('');
  const [currentFocusWord, setCurrentFocusWord] = useState<string | null>(null);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeContentMode, setActiveContentMode] = useState<ContentMode>('explain');
  const [startMode, setStartMode] = useState<'word_game' | 'story_mode'>('word_game');
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authUsername, setAuthUsername] = useState(''); const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState(''); const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMessage, setAuthSuccessMessage] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem('authToken'));
  const [liveStreak, setLiveStreak] = useState<LiveStreak | null>(null);
  const [userProfileData, setUserProfileData] =useState<UserProfileData | null>(null);
  const [activeView, setActiveView] = useState<'main' | 'profile'>('main');
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true); // Default to open on desktop
  
  // Refs for scrolling and focus
  const chatEndRef = useRef<HTMLDivElement>(null);


  // --- CORE LOGIC FUNCTIONS (Keep all existing logic functions as they are) ---
  // e.g., handleGenerateExplanation, fetchUserProfile, handleLogout, etc.
  // No changes needed to the internal logic of these functions for the UI redesign.
  const getDisplayWord = useCallback(() => currentFocusWord, [currentFocusWord]);
  const handleGenerateExplanation = async (
    wordToFetch: string,
    isNewPrimaryWordSearch: boolean = false
    // ... rest of function is unchanged
  ) => {/* ... */};
  const fetchUserProfile = async (token: string | null) => {/* ... */};
  const handleLogout = async () => {/* ... */};
  // ... all other logic functions remain the same

  useEffect(() => {
    // Scroll to bottom of chat when content changes
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [generatedContent, currentFocusWord]);


  // --- RENDER FUNCTIONS (These will be updated or created new) ---

  const renderContent = () => {
    // This function will now only render the "chat bubbles" for the content
    if (!currentFocusWord) {
      return (
        <div className="text-center text-5xl font-medium text-slate-500">
          Tiny Tutor <span className="text-sky-400">AI</span>
        </div>
      );
    }
    
    if (isLoading && Object.keys(generatedContent).length === 0) {
        return <div className="text-center p-10 text-slate-400">Generating...</div>;
    }

    // This is a simplified version for brevity. The full quiz logic, etc. would go here.
    const wordId = sanitizeWordForId(currentFocusWord);
    const contentItem = generatedContent[wordId];
    
    return (
        <div className="p-4 bg-transparent rounded-lg">
             <h2 className="text-2xl font-bold text-sky-400 mb-4 capitalize">{currentFocusWord}</h2>
             {contentItem?.explanation && (
                 <div className="prose prose-invert max-w-none text-slate-200 leading-relaxed">
                     <p>{contentItem.explanation}</p>
                 </div>
             )}
             {/* Future content like quiz will be rendered here as chat bubbles */}
        </div>
    );
  };

  const resetChat = () => {
    setCurrentFocusWord(null);
    setInputValue('');
    setLiveStreak(null);
    // ... reset other relevant states
  };

  return (
    <div className="flex h-full w-full bg-[--background-default] text-[--text-primary]">
      {/* --- SIDEBAR --- */}
      <aside className={`bg-[--background-secondary] flex-shrink-0 transition-all duration-300 ${isSidebarOpen ? 'w-64 p-4' : 'w-0 p-0'} overflow-hidden`}>
          <button onClick={resetChat} className="flex items-center w-full p-2 mb-4 rounded-md text-sm hover:bg-[--hover-bg-color]">
              <Plus size={16} className="mr-2"/> New Chat
          </button>
          {/* Add more sidebar items like history here */}
      </aside>

      {/* --- MAIN CONTAINER --- */}
      <div className="flex flex-col flex-grow h-full">
        {/* --- HEADER --- */}
        <header className="flex items-center justify-between p-2 flex-shrink-0">
            <div className="flex items-center">
                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-full hover:bg-[--hover-bg-color]">
                    <Menu size={20} />
                </button>
                <h1 className="text-lg font-medium ml-2">Tiny Tutor AI</h1>
            </div>

            <div className="relative">
                <button onClick={() => setShowUserMenu(!showUserMenu)} className="p-1 rounded-full bg-sky-500 text-white flex items-center justify-center h-8 w-8">
                    {currentUser ? currentUser.username.charAt(0).toUpperCase() : <User size={20}/>}
                </button>

                {showUserMenu && (
                    <div className="absolute top-10 right-0 w-48 bg-[--background-tertiary] rounded-md shadow-lg py-1 z-50">
                        {currentUser ? (
                          <>
                            <button onClick={() => { setActiveView('profile'); setShowUserMenu(false); }} className="flex items-center w-full text-left px-4 py-2 text-sm text-[--text-primary] hover:bg-[--hover-bg-color]">
                                <User size={16} className="mr-2"/> Profile
                            </button>
                            <button className="flex items-center w-full text-left px-4 py-2 text-sm text-[--text-primary] hover:bg-[--hover-bg-color]">
                                <Settings size={16} className="mr-2"/> Settings
                            </button>
                            <button onClick={() => { handleLogout(); setShowUserMenu(false); }} className="flex items-center w-full text-left px-4 py-2 text-sm text-[--text-primary] hover:bg-[--hover-bg-color]">
                                <LogOut size={16} className="mr-2"/> Logout
                            </button>
                          </>
                        ) : (
                             <button onClick={() => { setShowAuthModal(true); setAuthMode('login'); setShowUserMenu(false);}} className="flex items-center w-full text-left px-4 py-2 text-sm text-[--text-primary] hover:bg-[--hover-bg-color]">
                                <LogIn size={16} className="mr-2"/> Login / Signup
                            </button>
                        )}
                    </div>
                )}
            </div>
        </header>

        {/* --- SCROLLABLE CONTENT AREA --- */}
        <main className="flex-grow overflow-y-auto p-4">
          <div className="max-w-4xl mx-auto">
            {activeView === 'main' && renderContent()}
            {activeView === 'profile' && (
              <ProfilePageComponent 
                currentUser={currentUser!} 
                userProfileData={userProfileData}
                onWordSelect={() => {}}
                onToggleFavorite={async () => {}}
                onNavigateBack={() => setActiveView('main')}
                generatedContent={generatedContent}
              />
            )}
             <div ref={chatEndRef} />
          </div>
        </main>

        {/* --- BOTTOM INPUT FORM --- */}
        <footer className="p-4 flex-shrink-0">
          <div className="max-w-4xl mx-auto">
            <form onSubmit={(e) => {
                e.preventDefault();
                if(startMode === 'word_game') handleGenerateExplanation(inputValue, true);
              }}
              className="bg-[--background-input] rounded-full p-2 flex items-center shadow-lg border border-[--border-color]">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={`Enter a prompt for ${startMode === 'word_game' ? 'Word Game' : 'Story Mode'}...`}
                className="w-full bg-transparent px-4 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="p-2 rounded-full bg-[--hover-bg-color] disabled:opacity-50"
                >
                <Sparkles size={20} />
              </button>
            </form>
            <div className="flex items-center justify-center gap-2 mt-2">
                 <button
                    onClick={() => setStartMode('word_game')}
                    className={`py-1 px-3 rounded-full text-xs font-medium transition-colors ${startMode === 'word_game' ? 'bg-sky-500 text-white' : 'bg-[--background-tertiary] hover:bg-[--hover-bg-color] text-[--text-secondary]'}`}
                  >
                    Word Game
                  </button>
                  <button
                    onClick={() => setStartMode('story_mode')}
                    className={`py-1 px-3 rounded-full text-xs font-medium transition-colors ${startMode === 'story_mode' ? 'bg-sky-500 text-white' : 'bg-[--background-tertiary] hover:bg-[--hover-bg-color] text-[--text-secondary]'}`}
                  >
                    Story Mode
                  </button>
            </div>
          </div>
        </footer>
      </div>
      
      {/* MODALS (Unchanged) */}
      {showAuthModal && (
          <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
              {/* ... The full modal JSX code remains unchanged ... */}
          </div>
      )}
    </div>
  );
}

export default App;
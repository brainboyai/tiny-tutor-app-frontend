// src/App.tsx

import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  useRef,
  useCallback,
} from 'react';
import { jwtDecode } from 'jwt-decode';

// --- Constants ---
// const API_BASE_URL = 'http://127.0.0.1:5001'; // Local Flask dev
const API_BASE_URL = 'https://tiny-tutor-app.onrender.com'; // Deployed backend

// --- Types ---
interface User {
  username: string;
  email: string;
  tier: string;
}

interface DecodedToken extends User {
  exp: number;
}

interface AuthContextType {
  user: User | null;
  authLoadingGlobal: boolean;
  authError: string | null;
  login: (usernameOrEmailInput: string, passwordInput: string) => Promise<void>;
  signup: (usernameInput: string, emailInput: string, passwordInput: string) => Promise<void>;
  logout: () => void;
  getAuthHeaders: () => Record<string, string>;
}

interface GeneratedContent {
  explain?: string;
  image?: string;
  fact?: string;
  quiz?: string;
  deep?: string;
}

interface ExploredWord {
  id: string;
  word: string;
  is_favorite: boolean;
  last_explored_at: string;
  explicit_connections?: string[];
  modes_generated?: string[];
  generated_content_cache?: Partial<GeneratedContent>;
}

interface ProfileData {
  username: string;
  tier: string;
  explored_words_count: number;
  explored_words_list: ExploredWord[];
  favorite_words_list: ExploredWord[];
  streak_history: Streak[];
}

type ContentMode = 'explain' | 'image' | 'fact' | 'quiz' | 'deep';

interface Streak {
  id?: string;
  words: string[];
  score: number;
  completed_at?: string;
}

type ProfileAccordionSection = 'explored' | 'favorites' | 'streaks' | null;


// --- Auth Context ---
const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// --- AuthProvider Component ---
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [authLoadingGlobal, setAuthLoadingGlobal] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('tinyTutorToken');
    if (token) {
      try {
        const decodedToken = jwtDecode<DecodedToken>(token);
        if (decodedToken.exp * 1000 > Date.now()) {
          setUser({
            username: decodedToken.username,
            email: decodedToken.email,
            tier: decodedToken.tier,
          });
        } else {
          localStorage.removeItem('tinyTutorToken');
        }
      } catch (error) {
        console.error('Failed to decode token:', error);
        localStorage.removeItem('tinyTutorToken');
      }
    }
    setAuthLoadingGlobal(false);
  }, []);

  const login = async (usernameOrEmailInput: string, passwordInput: string) => {
    setAuthLoadingGlobal(true);
    setAuthError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernameOrEmail: usernameOrEmailInput,
          password: passwordInput,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }
      localStorage.setItem('tinyTutorToken', data.token);
      const decodedToken = jwtDecode<DecodedToken>(data.token);
      setUser({
        username: decodedToken.username,
        email: decodedToken.email,
        tier: decodedToken.tier,
      });
      setAuthError(null); // Clear error on successful login
    } catch (error: any) {
      console.error('Login failed:', error);
      setAuthError(error.message || 'Login failed. Please try again.');
    } finally {
      setAuthLoadingGlobal(false);
    }
  };

  const signup = async (usernameInput: string, emailInput: string, passwordInput: string) => {
    setAuthLoadingGlobal(true);
    setAuthError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: usernameInput,
          email: emailInput,
          password: passwordInput,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }
      setAuthError(null); // Clear error on successful signup
      alert('Signup successful! Please login.');
    } catch (error: any) {
      console.error('Signup failed:', error);
      setAuthError(error.message || 'Signup failed. Please try again.');
    } finally {
      setAuthLoadingGlobal(false);
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('tinyTutorToken');
  };

  const getAuthHeaders = (): Record<string, string> => {
    const token = localStorage.getItem('tinyTutorToken');
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
    return {};
  };

  return (
    <AuthContext.Provider
      value={{ user, authLoadingGlobal, authError, login, signup, logout, getAuthHeaders }}
    >
      {children}
    </AuthContext.Provider>
  );
};


// --- Helper: HighlightedContentRenderer Component ---
interface HighlightedContentRendererProps {
  text: string;
  onWordClick: (word: string) => void;
}

const HighlightedContentRenderer: React.FC<HighlightedContentRendererProps> = ({ text, onWordClick }) => {
  if (!text) return null;
  const parts = text.split(/(<click>.*?<\/click>)/g);
  return (
    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
      {parts.map((part, index) => {
        const clickMatch = part.match(/<click>(.*?)<\/click>/);
        if (clickMatch && clickMatch[1]) {
          const word = clickMatch[1];
          return (
            <button
              key={index}
              onClick={() => onWordClick(word)}
              className="text-blue-500 dark:text-blue-400 hover:underline focus:outline-none font-semibold mx-1"
            >
              {word}
            </button>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </p>
  );
};

// --- AuthModal Component (largely unchanged, ensure unique IDs for inputs if needed) ---
interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: 'login' | 'signup';
}
const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, initialMode = 'login' }) => {
  const [mode, setMode] = useState<'login' | 'signup'>(initialMode);
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const { login, signup, authError, authLoadingGlobal, user } = useAuth(); // Added user

  useEffect(() => {
    setMode(initialMode); setUsername(''); setEmail(''); setPassword('');
  }, [isOpen, initialMode]);

  useEffect(() => { // Close modal if login/signup was successful
    if (user && !authError && !authLoadingGlobal && isOpen) {
      onClose();
    }
  }, [user, authError, authLoadingGlobal, isOpen, onClose]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') await login(username, password);
    else await signup(username, email, password);
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-md relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl" aria-label="Close">&times;</button>
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800 dark:text-gray-100">{mode === 'login' ? 'Login' : 'Sign Up'}</h2>
        {authError && <p className="bg-red-100 dark:bg-red-700 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-100 px-4 py-3 rounded relative mb-4 text-sm" role="alert">{authError}</p>}
        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="mb-4">
              <label htmlFor="email-auth-modal" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input type="email" id="email-auth-modal" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required />
            </div>
          )}
          <div className="mb-4">
            <label htmlFor="username-auth-modal" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{mode === 'login' ? 'Username or Email' : 'Username'}</label>
            <input type={mode === 'login' && username.includes('@') ? 'email' : 'text'} id="username-auth-modal" value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required />
          </div>
          <div className="mb-6">
            <label htmlFor="password-auth-modal" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
            <input type="password" id="password-auth-modal" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required />
          </div>
          <button type="submit" disabled={authLoadingGlobal} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:shadow-outline disabled:opacity-50 transition duration-150 ease-in-out">
            {authLoadingGlobal ? (<div className="flex items-center justify-center"><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Processing...</div>) : (mode === 'login' ? 'Login' : 'Sign Up')}
          </button>
        </form>
        <p className="mt-6 text-center text-sm">
          {mode === 'login' ? (<>Need an account? <button onClick={() => { setMode('signup'); setAuthError(null); }} className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">Sign Up</button></>) : (<>Already have an account? <button onClick={() => { setMode('login'); setAuthError(null); }} className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">Login</button></>)}
        </p>
      </div>
    </div>
  );
};

// --- ProfileModal Components (largely unchanged) ---
interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileData: ProfileData | null;
  isLoading: boolean;
  error: string | null;
  onWordClick: (word: string, cachedContentComplete?: Partial<GeneratedContent>) => void;
  onToggleFavorite: (wordId: string, currentIsFavorite: boolean) => Promise<void>;
}

const CompactWordListItem: React.FC<{
  item: ExploredWord;
  onWordClick: () => void;
  onToggleFavorite: (event?: React.MouseEvent) => Promise<void>; // Pass event for stopPropagation
  isFavoriteList?: boolean;
}> = ({ item, onWordClick, onToggleFavorite, isFavoriteList }) => {
  const [isFavoritedOptimistic, setIsFavoritedOptimistic] = useState(item.is_favorite);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => { setIsFavoritedOptimistic(item.is_favorite); }, [item.is_favorite]);

  const handleToggleFavoriteInternal = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent click from bubbling to the li
    setIsToggling(true);
    const newFavStatus = !isFavoritedOptimistic;
    setIsFavoritedOptimistic(newFavStatus); // Optimistic update
    try {
      await onToggleFavorite(e); // Call the prop function
    } catch (error) {
      console.error("Failed to toggle favorite from item:", error);
      setIsFavoritedOptimistic(item.is_favorite); // Revert on error
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <li className={`p-3 mb-2 rounded-lg shadow hover:shadow-md transition-all duration-200 cursor-pointer flex justify-between items-center ${isFavoriteList ? 'bg-yellow-50 dark:bg-yellow-900 border-l-4 border-yellow-400' : 'bg-gray-50 dark:bg-gray-700'}`} onClick={onWordClick}>
      <div>
        <span className="font-semibold text-indigo-600 dark:text-indigo-400 block text-md">{item.word}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">Last seen: {new Date(item.last_explored_at).toLocaleDateString()}</span>
      </div>
      <button onClick={handleToggleFavoriteInternal} disabled={isToggling} className={`p-1 rounded-full transition-colors duration-150 focus:outline-none ${isFavoritedOptimistic ? 'text-red-500 hover:text-red-600' : 'text-gray-400 hover:text-red-400'} ${isToggling ? 'opacity-50 cursor-not-allowed' : ''}`} aria-label={isFavoritedOptimistic ? 'Unfavorite' : 'Favorite'}>{isFavoritedOptimistic ? '♥' : '♡'}</button>
    </li>
  );
};

const AccordionSection: React.FC<{ title: string; count: number; isActive: boolean; onClick: () => void; children: React.ReactNode; }> = ({ title, count, isActive, onClick, children }) => (
  <div className="border-b border-gray-200 dark:border-gray-700">
    <button
      onClick={onClick}
      className="w-full flex justify-between items-center py-4 px-2 text-left text-lg font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none"
    >
      <span>{title} ({count})</span>
      <span className={`transform transition-transform duration-200 ${isActive ? 'rotate-180' : 'rotate-0'}`}>▼</span>
    </button>
    {isActive && <div className="p-4 bg-gray-50 dark:bg-gray-750 max-h-[40vh] overflow-y-auto">{children}</div>}
  </div>
);

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, profileData, isLoading, error, onWordClick, onToggleFavorite }) => {
  const [activeSection, setActiveSection] = useState<ProfileAccordionSection>(null);

  useEffect(() => {
    if (isOpen && profileData) setActiveSection('explored');
    else if (!isOpen) setActiveSection(null);
  }, [isOpen, profileData]);

  if (!isOpen) return null;

  const handleWordClickInProfileLocal = (wordItem: ExploredWord) => {
    onWordClick(wordItem.word, wordItem.generated_content_cache);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-40">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">User Profile</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl" aria-label="Close">&times;</button>
        </div>
        {isLoading && <p className="text-center text-gray-600 dark:text-gray-300 py-4">Loading profile...</p>}
        {error && <p className="text-center text-red-500 dark:text-red-400 py-4">Error: {error}</p>}
        {profileData && (
          <div className="flex-grow overflow-y-auto">
            <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900 rounded-lg shadow">
              <p className="text-lg"><span className="font-semibold text-indigo-700 dark:text-indigo-300">Username:</span> {profileData.username}</p>
              <p className="text-sm text-indigo-600 dark:text-indigo-400"><span className="font-semibold">Tier:</span> {profileData.tier}</p>
              <p className="text-sm text-indigo-600 dark:text-indigo-400"><span className="font-semibold">Words Explored:</span> {profileData.explored_words_count}</p>
            </div>
            <AccordionSection title="All Explored Words" count={profileData.explored_words_list.length} isActive={activeSection === 'explored'} onClick={() => setActiveSection(activeSection === 'explored' ? null : 'explored')}>
              {profileData.explored_words_list.length > 0 ? (
                <ul className="space-y-1 pr-1">
                  {profileData.explored_words_list.map((item) => (<CompactWordListItem key={`explored-${item.id}`} item={item} onWordClick={() => handleWordClickInProfileLocal(item)} onToggleFavorite={() => onToggleFavorite(item.id, item.is_favorite)} />))}
                </ul>
              ) : (<p className="text-gray-500 dark:text-gray-400">No words explored yet.</p>)}
            </AccordionSection>
            <AccordionSection title="Favorite Words" count={profileData.favorite_words_list.length} isActive={activeSection === 'favorites'} onClick={() => setActiveSection(activeSection === 'favorites' ? null : 'favorites')}>
              {profileData.favorite_words_list.length > 0 ? (
                <ul className="space-y-1 pr-1">
                  {profileData.favorite_words_list.map((item) => (<CompactWordListItem key={`fav-${item.id}`} item={item} onWordClick={() => handleWordClickInProfileLocal(item)} onToggleFavorite={() => onToggleFavorite(item.id, item.is_favorite)} isFavoriteList={true} />))}
                </ul>
              ) : (<p className="text-gray-500 dark:text-gray-400">No favorite words yet.</p>)}
            </AccordionSection>
            <AccordionSection title="Streak History" count={profileData.streak_history.length} isActive={activeSection === 'streaks'} onClick={() => setActiveSection(activeSection === 'streaks' ? null : 'streaks')}>
              {profileData.streak_history.length > 0 ? (
                <ul className="space-y-2 pr-1">
                  {profileData.streak_history.sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime()).map((streak, index) => ( // Sort here for display
                    <li key={streak.id || `streak-${index}`} className="p-3 bg-gray-100 dark:bg-gray-600 rounded-md shadow">
                      <p className="font-semibold text-indigo-600 dark:text-indigo-400">Score: {streak.score}</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">Words: {streak.words.join(' → ')}</p>
                      {streak.completed_at && (<p className="text-xs text-gray-500 dark:text-gray-400">Completed: {new Date(streak.completed_at).toLocaleString()}</p>)}
                    </li>
                  ))}
                </ul>
              ) : (<p className="text-gray-500 dark:text-gray-400">No completed streaks yet.</p>)}
            </AccordionSection>
          </div>
        )}
      </div>
    </div>
  );
};

// --- TinyTutorAppContent Component (Main Tutor View) ---
const TinyTutorAppContent: React.FC = () => {
  const { user, logout, getAuthHeaders } = useAuth();
  const [inputQuestion, setInputQuestion] = useState('');
  const [generatedContents, setGeneratedContents] = useState<Partial<GeneratedContent>>({});
  const [activeMode, setActiveMode] = useState<ContentMode>('explain');
  const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');

  const [isExplainGeneratedForCurrentWord, setIsExplainGeneratedForCurrentWord] = useState(false);

  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentTutorWordIsFavorite, setCurrentTutorWordIsFavorite] = useState(false);
  const [currentStreak, setCurrentStreak] = useState<Streak>({ words: [], score: 0 });

  const lastSubmittedQuestionRef = useRef<string | null>(null);
  const isReviewingStreakWordRef = useRef<boolean>(false);

  useEffect(() => {
    if (user && showAuthModal) setShowAuthModal(false);
  }, [user, showAuthModal]);

  useEffect(() => {
    if (inputQuestion && profileData) {
      const foundWord = profileData.explored_words_list.find(w => w.word.toLowerCase().trim() === inputQuestion.toLowerCase().trim());
      setCurrentTutorWordIsFavorite(foundWord ? foundWord.is_favorite : false);
    } else {
      setCurrentTutorWordIsFavorite(false);
    }
  }, [inputQuestion, profileData]);

  const handleEndStreak = useCallback(async (reason: string) => {
    console.log(`Streak end triggered. Reason: ${reason}. Current score: ${currentStreak.score}, Words: ${currentStreak.words.join(', ')}`);
    if (user && currentStreak.words.length > 0 && currentStreak.score >= 2) {
      try {
        const response = await fetch(`${API_BASE_URL}/save_streak`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ words: currentStreak.words, score: currentStreak.score }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to save streak');

        setProfileData(prev => {
          if (!prev) return null;
          const newStreakEntry = { words: currentStreak.words, score: currentStreak.score, completed_at: new Date().toISOString(), id: result.streak_id || `temp-${Date.now()}` };
          return { ...prev, streak_history: [newStreakEntry, ...(prev.streak_history || [])] };
        });
      } catch (error) {
        console.error('Error saving streak:', error);
        setAiError(`Could not save streak: ${(error as Error).message}`);
      }
    }
    setCurrentStreak({ words: [], score: 0 });
    isReviewingStreakWordRef.current = false;
  }, [user, currentStreak, getAuthHeaders]);

  // REVISED generateContent
  const generateContent = async (
    question: string,
    mode: ContentMode,
    isExplicitNewWordAction: boolean = false, // Renamed for clarity: true if "Generate Expl." or "Refresh" clicked
    isReview: boolean = false,
    forceRefresh: boolean = false
  ) => {
    if (!user) {
      setAuthModalMode('login'); setShowAuthModal(true); setAiError("Please login to generate content."); return;
    }
    if (!question.trim()) {
      setAiError("Please enter a word or concept."); return;
    }

    setIsLoadingExplanation(true); setAiError(null);
    isReviewingStreakWordRef.current = isReview;

    if (isExplicitNewWordAction) { // This is key: only clear/reset for explicit user actions
      setGeneratedContents({}); // Clear local cache for this word to ensure fresh load or forced generation
      setIsExplainGeneratedForCurrentWord(false);
      await handleEndStreak(forceRefresh ? `Refresh button for ${question}` : `Generate Explanation for ${question}`);
      if (mode === 'explain' && !forceRefresh && !isReview) { // Start new streak only for "Generate Explanation"
        setCurrentStreak({ words: [question], score: 1 });
      }
    }

    // No local frontend cache check here; backend is the source of truth for cache.
    // Frontend `generatedContents` is populated by `data.full_cache` from backend.

    try {
      const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, mode, force_refresh: forceRefresh }),
      });
      const data = await response.json();
      if (!response.ok) {
        // If backend returns full_cache even on error, use it.
        if (data.full_cache) setGeneratedContents(data.full_cache);
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      if (data.full_cache) {
        setGeneratedContents(data.full_cache);
      } else { // Fallback if full_cache isn't returned (should not happen with updated backend)
        setGeneratedContents((prev) => ({ ...prev, [mode]: data.content }));
      }

      setActiveMode(mode);

      // Update isExplainGeneratedForCurrentWord based on the new full_cache
      setIsExplainGeneratedForCurrentWord(!!(data.full_cache && data.full_cache.explain));

      if (!isReview) {
        lastSubmittedQuestionRef.current = question;
      }
      // Update favorite status based on the potentially new word being active
      if (profileData) {
        const foundWord = profileData.explored_words_list.find(w => w.word.toLowerCase().trim() === question.toLowerCase().trim());
        setCurrentTutorWordIsFavorite(foundWord ? foundWord.is_favorite : false);
      } else if (user && !profileData && !isLoadingProfile) { // Fetch profile if not available, to get favorite status
        handleOpenProfileModal(); // This will fetch and setProfileData
      }


    } catch (error: any) {
      console.error(`Error generating ${mode} for ${question}:`, error);
      setAiError(error.message || `Failed to generate ${mode}.`);
      if (mode === 'explain') setIsExplainGeneratedForCurrentWord(false); // Reflect failure for explain
    } finally {
      setIsLoadingExplanation(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuestion = e.target.value;
    setInputQuestion(newQuestion);
    if (!newQuestion.trim()) { // Input cleared
      setGeneratedContents({}); setIsExplainGeneratedForCurrentWord(false); setAiError(null); setCurrentTutorWordIsFavorite(false);
      if (!isReviewingStreakWordRef.current) handleEndStreak("Input cleared by user");
      lastSubmittedQuestionRef.current = null;
    } else if (isReviewingStreakWordRef.current && newQuestion.toLowerCase().trim() !== (lastSubmittedQuestionRef.current || '').toLowerCase().trim()) {
      // User started typing a different word while in review mode
      handleEndStreak("New input typed during review");
      isReviewingStreakWordRef.current = false; // Exit review mode
    }
  };

  // REVISED handleGenerateClick (Main "Generate Explanation" button)
  const handleGenerateClick = () => {
    if (inputQuestion.trim() && user) {
      isReviewingStreakWordRef.current = false; // Not a review
      // isExplicitNewWordAction = true (this is an explicit action to get/generate 'explain')
      // forceRefresh = false (backend checks its cache first for 'explain')
      generateContent(inputQuestion.trim(), 'explain', true, false, false);
    } else if (!user) {
      setAuthModalMode('login'); setShowAuthModal(true);
    }
  };

  // REVISED handleRefreshContent (Refresh button)
  const handleRefreshContent = () => {
    const questionToRefresh = lastSubmittedQuestionRef.current || inputQuestion.trim();
    if (questionToRefresh && activeMode && user) {
      isReviewingStreakWordRef.current = false; // Not a review
      // isExplicitNewWordAction = true (this is an explicit action to refresh the current mode)
      // forceRefresh = true (backend bypasses its cache for the activeMode)
      generateContent(questionToRefresh, activeMode, true, false, true);
    } else if (!user) {
      setAuthModalMode('login'); setShowAuthModal(true);
    }
  };

  // REVISED handleModeToggle (Stricter: only show if in frontend's generatedContents)
  const handleModeToggle = (newMode: ContentMode) => {
    const currentQuestionForModes = lastSubmittedQuestionRef.current; // Rely on lastSubmittedQuestionRef for current context
    if (!currentQuestionForModes || !user) {
      if (!user) { setAuthModalMode('login'); setShowAuthModal(true); }
      return;
    }
    setAiError(null); // Clear previous errors

    if (generatedContents[newMode]) { // Check if content for this mode is in the current frontend state
      setActiveMode(newMode);
    } else {
      // Content for this mode is not available in the frontend state.
      // DO NOT generate. User must use "Generate Explanation" or "Refresh" for the word first.
      setActiveMode(newMode); // Switch mode to show placeholder/message
      // The render logic will show "Content for this mode is not available."
      console.log(`Content for '${newMode}' mode is not in generatedContents for "${currentQuestionForModes}". Displaying placeholder.`);
    }
  };

  // REVISED handleWordClickFromExplanation (Clicked on a <click>word</click> in explanation)
  const handleWordClickFromExplanation = (word: string) => {
    if (!user) {
      setAuthModalMode('login'); setShowAuthModal(true); return;
    }
    if (isReviewingStreakWordRef.current) {
      handleEndStreak("Explored new word from a reviewed explanation");
    }
    isReviewingStreakWordRef.current = false;
    setInputQuestion(word); // Update input field to the new word
    // This is like a new "Generate Explanation" for the clicked sub-word.
    // isExplicitNewWordAction = true (it's a new focus word)
    // forceRefresh = false (backend checks its cache for this new word's 'explain' mode)
    generateContent(word, 'explain', true, false, false);
  };

  // REVISED handleWordClickFromProfile
  const handleWordClickFromProfile = (word: string, cachedContentComplete?: Partial<GeneratedContent>) => {
    if (!user) {
      setShowAuthModal(true); setAuthModalMode('login'); return;
    }
    isReviewingStreakWordRef.current = false;
    setInputQuestion(word);
    handleEndStreak("Clicked word from profile");
    setAiError(null);


    if (cachedContentComplete && Object.keys(cachedContentComplete).length > 0) {
      setGeneratedContents(cachedContentComplete);
      const initialMode = cachedContentComplete.explain
        ? 'explain'
        : (Object.keys(cachedContentComplete)[0] as ContentMode | undefined) || 'explain';
      setActiveMode(initialMode);
      setIsExplainGeneratedForCurrentWord(!!cachedContentComplete.explain);
      lastSubmittedQuestionRef.current = word;
      if (initialMode === 'explain') { // Start new streak only if landing on 'explain'
        setCurrentStreak({ words: [word], score: 1 });
      } else {
        setCurrentStreak({ words: [], score: 0 }); // Clear streak if not starting with explain
      }
      const foundWord = profileData?.explored_words_list.find(w => w.word.toLowerCase().trim() === word.toLowerCase().trim());
      setCurrentTutorWordIsFavorite(foundWord ? foundWord.is_favorite : false);
    } else {
      // If profile data for some reason didn't have the cache, treat as new "Generate Explanation"
      generateContent(word, 'explain', true, false, false);
    }
    setShowProfileModal(false);
  };

  // REVISED handleReviewStreakWordClick
  const handleReviewStreakWordClick = (wordFromStreak: string) => {
    if (!user) {
      setShowAuthModal(true); setAuthModalMode('login'); return;
    }
    setInputQuestion(wordFromStreak);
    isReviewingStreakWordRef.current = true;
    setAiError(null);

    const wordData = profileData?.explored_words_list.find(w => w.word.toLowerCase().trim() === wordFromStreak.toLowerCase().trim());
    const cachedContentsForWord = wordData?.generated_content_cache;

    if (cachedContentsForWord && Object.keys(cachedContentsForWord).length > 0) {
      setGeneratedContents(cachedContentsForWord);
      const initialMode = cachedContentsForWord.explain
        ? 'explain'
        : (Object.keys(cachedContentsForWord)[0] as ContentMode | undefined) || 'explain';
      setActiveMode(initialMode);
      setIsExplainGeneratedForCurrentWord(!!cachedContentsForWord.explain);
      setCurrentTutorWordIsFavorite(wordData?.is_favorite || false);
      lastSubmittedQuestionRef.current = wordFromStreak;
    } else {
      // This means the word from streak history has no cache in profileData.
      // This is an inconsistency. For strict caching, we should not generate.
      // We'll set generatedContents to empty and let the render logic show "not available".
      console.warn(`No cache found for streak review word: ${wordFromStreak}. Displaying placeholder.`);
      setGeneratedContents({});
      setActiveMode('explain'); // Default to explain, it will show placeholder
      setIsExplainGeneratedForCurrentWord(false);
      setCurrentTutorWordIsFavorite(false);
      lastSubmittedQuestionRef.current = wordFromStreak;
    }
  };

  const handleOpenProfileModal = async () => {
    if (!user) { setShowAuthModal(true); setAuthModalMode('login'); return; }
    setShowProfileModal(true); setIsLoadingProfile(true); setProfileError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/profile`, { method: 'GET', headers: getAuthHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch profile');
      setProfileData(data);
    } catch (error: any) {
      console.error('Error fetching profile:', error); setProfileError(error.message);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const handleToggleFavoriteOnTutorPage = async () => {
    const wordToToggle = lastSubmittedQuestionRef.current; // Only act on a confirmed, submitted word
    if (!user || !wordToToggle || !isExplainGeneratedForCurrentWord) { // Ensure 'explain' was generated for context
      if (!user) setShowAuthModal(true);
      return;
    }

    const newFavoriteStatus = !currentTutorWordIsFavorite;
    setCurrentTutorWordIsFavorite(newFavoriteStatus); // Optimistic UI

    try {
      const response = await fetch(`${API_BASE_URL}/toggle_favorite`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: wordToToggle, is_favorite: newFavoriteStatus }),
      });
      const data = await response.json();
      if (!response.ok) {
        setCurrentTutorWordIsFavorite(!newFavoriteStatus); // Revert on error
        throw new Error(data.error || 'Failed to toggle favorite');
      }
      // Update profileData if it's loaded
      if (profileData) {
        setProfileData(prev => {
          if (!prev) return null;
          const updatedExplored = prev.explored_words_list.map(w =>
            w.word.toLowerCase().trim() === wordToToggle.toLowerCase().trim() ? { ...w, is_favorite: newFavoriteStatus } : w
          );
          return {
            ...prev,
            explored_words_list: updatedExplored,
            favorite_words_list: updatedExplored.filter(w => w.is_favorite)
              .sort((a, b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime())
          };
        });
      }
    } catch (error) {
      console.error("Error toggling favorite on tutor page:", error);
      setAiError((error as Error).message || "Could not update favorite status.");
      setCurrentTutorWordIsFavorite(!newFavoriteStatus); // Revert
    }
  };

  const handleToggleFavoriteInProfile = async (wordIdSanitized: string, currentIsFavorite: boolean) => {
    const wordEntry = profileData?.explored_words_list.find(w => w.id === wordIdSanitized);
    if (!wordEntry || !user) return;

    const originalWord = wordEntry.word;
    const newFavoriteStatus = !currentIsFavorite;

    setProfileData(prev => { // Optimistic update
      if (!prev) return null;
      const updatedList = prev.explored_words_list.map(w => w.id === wordIdSanitized ? { ...w, is_favorite: newFavoriteStatus } : w);
      return { ...prev, explored_words_list: updatedList, favorite_words_list: updatedList.filter(w => w.is_favorite).sort((a, b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime()) };
    });
    if (lastSubmittedQuestionRef.current?.toLowerCase() === originalWord.toLowerCase()) {
      setCurrentTutorWordIsFavorite(newFavoriteStatus);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/toggle_favorite`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: originalWord, is_favorite: newFavoriteStatus }),
      });
      const data = await response.json();
      if (!response.ok) { // Revert on error
        setProfileData(prev => {
          if (!prev) return null;
          const revertedList = prev.explored_words_list.map(w => w.id === wordIdSanitized ? { ...w, is_favorite: currentIsFavorite } : w);
          return { ...prev, explored_words_list: revertedList, favorite_words_list: revertedList.filter(w => w.is_favorite).sort((a, b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime()) };
        });
        if (lastSubmittedQuestionRef.current?.toLowerCase() === originalWord.toLowerCase()) {
          setCurrentTutorWordIsFavorite(currentIsFavorite);
        }
        throw new Error(data.error || 'Failed to toggle favorite in profile');
      }
    } catch (error) {
      console.error("Error toggling favorite from profile:", error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col items-center p-4 transition-colors duration-300">
      <header className="w-full max-w-3xl mb-6 flex justify-between items-center">
        <h1 className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">Tiny Tutor</h1>
        <div className="space-x-2">
          {user ? (
            <>
              <span className="text-sm hidden sm:inline">Welcome, {user.username}!</span>
              <button onClick={handleOpenProfileModal} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600">Profile</button>
              <button onClick={() => { handleEndStreak("Logout"); logout(); setGeneratedContents({}); setInputQuestion(''); lastSubmittedQuestionRef.current = null; setIsExplainGeneratedForCurrentWord(false); setAiError(null); }} className="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-100 rounded-md hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:text-indigo-200 dark:bg-indigo-700 dark:hover:bg-indigo-800">Logout</button>
            </>
          ) : (
            <button onClick={() => { setAuthModalMode('login'); setShowAuthModal(true); }} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600">Login / Sign Up</button>
          )}
        </div>
      </header>

      <main className="w-full max-w-3xl bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-lg shadow-xl">
        <div className="mb-6">
          <label htmlFor="conceptInputMain" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Enter a word or concept:</label>
          <div className="relative">
            <input type="text" id="conceptInputMain" value={inputQuestion} onChange={handleInputChange} placeholder="e.g., Photosynthesis" className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-gray-100" />
            {inputQuestion && (<button onClick={() => { setInputQuestion(''); setGeneratedContents({}); setIsExplainGeneratedForCurrentWord(false); setAiError(null); setCurrentTutorWordIsFavorite(false); if (!isReviewingStreakWordRef.current) handleEndStreak("Input cleared by X button"); lastSubmittedQuestionRef.current = null; }} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl" aria-label="Clear input">&times;</button>)}
          </div>
        </div>

        <button onClick={handleGenerateClick} disabled={isLoadingExplanation || !inputQuestion.trim() || !user} className="w-full sm:w-auto bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-md focus:outline-none focus:shadow-outline disabled:opacity-50 transition duration-150 ease-in-out mb-4 text-lg">
          {isLoadingExplanation && (lastSubmittedQuestionRef.current === inputQuestion) ? 'Generating...' : 'Generate Explanation'}
        </button>

        {user && lastSubmittedQuestionRef.current && ( // Show mode toggles only if a word has been submitted
          <div className="my-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-md shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              {(['explain', 'image', 'fact', 'quiz', 'deep'] as ContentMode[]).map((mode) => (
                <button key={mode} onClick={() => handleModeToggle(mode)}
                  disabled={isLoadingExplanation || !lastSubmittedQuestionRef.current} // Disable if no word context or loading
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors 
                                    ${activeMode === mode ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500'} 
                                    ${(!lastSubmittedQuestionRef.current || isLoadingExplanation) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
              {isExplainGeneratedForCurrentWord && lastSubmittedQuestionRef.current && ( // Ensure there's a context for refresh/favorite
                <>
                  <button onClick={handleRefreshContent} disabled={isLoadingExplanation} className="p-2 text-gray-600 hover:text-indigo-600 dark:text-gray-300 dark:hover:text-indigo-400 rounded-full focus:outline-none disabled:opacity-50" title="Refresh content">
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                  </button>
                  <button onClick={handleToggleFavoriteOnTutorPage} disabled={isLoadingExplanation} className={`p-1.5 rounded-full transition-colors duration-150 focus:outline-none disabled:opacity-50 ${currentTutorWordIsFavorite ? 'text-red-500 hover:text-red-600' : 'text-gray-400 hover:text-red-400'}`} title={currentTutorWordIsFavorite ? 'Unfavorite' : 'Favorite'}>
                    {currentTutorWordIsFavorite ? '♥' : '♡'}
                  </button>
                </>
              )}
            </div>
            {currentStreak.score >= 2 && (
              <div className="mt-2 text-sm font-semibold text-purple-600 dark:text-purple-400">
                Streak: {currentStreak.score} (
                {currentStreak.words.map((word, index) => (
                  <React.Fragment key={index}>
                    <button
                      onClick={() => handleReviewStreakWordClick(word)}
                      className="hover:underline focus:outline-none disabled:no-underline disabled:text-gray-400"
                      disabled={isLoadingExplanation || (word.toLowerCase().trim() === inputQuestion.toLowerCase().trim() && isReviewingStreakWordRef.current)}
                    >
                      {word}
                    </button>
                    {index < currentStreak.words.length - 1 && ' → '}
                  </React.Fragment>
                ))}
                )
              </div>
            )}
          </div>
        )}

        {aiError && (<div className="mt-4 p-3 bg-red-100 dark:bg-red-800 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 rounded-md text-sm"><p><strong>Error:</strong> {aiError}</p></div>)}

        {isLoadingExplanation && !generatedContents[activeMode] && lastSubmittedQuestionRef.current && (
          <div className="mt-6 flex justify-center items-center h-32"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div></div>
        )}

        {lastSubmittedQuestionRef.current && generatedContents[activeMode] && (
          <div className="mt-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 shadow">
            {activeMode === 'explain' ? (
              <HighlightedContentRenderer text={generatedContents.explain!} onWordClick={handleWordClickFromExplanation} />
            ) : ( /* For other modes, just display the text simply */
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{generatedContents[activeMode]}</p>
            )}
          </div>
        )}
        {/* Placeholder for modes if content not in generatedContents */}
        {lastSubmittedQuestionRef.current && !isLoadingExplanation && !generatedContents[activeMode] && (
          <div className="mt-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 shadow">
            <p className="text-gray-500 dark:text-gray-400">Content for '{activeMode}' mode is not available for "{lastSubmittedQuestionRef.current}". Use 'Generate Explanation' or 'Refresh' to create content.</p>
          </div>
        )}
      </main>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} initialMode={authModalMode} />
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        profileData={profileData}
        isLoading={isLoadingProfile}
        error={profileError}
        onWordClick={handleWordClickFromProfile}
        onToggleFavorite={handleToggleFavoriteInProfile}
      />
    </div>
  );
};

function App() {
  return (<AuthProvider><TinyTutorAppContent /></AuthProvider>);
}

export default App;

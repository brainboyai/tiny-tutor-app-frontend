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
  setAuthError: (error: string | null) => void;
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
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Login failed with status: " + response.status }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      localStorage.setItem('tinyTutorToken', data.token);
      const decodedToken = jwtDecode<DecodedToken>(data.token);
      setUser({
        username: decodedToken.username,
        email: decodedToken.email,
        tier: decodedToken.tier,
      });
      setAuthError(null);
    } catch (error: any) {
      console.error('Login failed:', error);
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        setAuthError("Failed to connect to the server. Please check your internet connection or try again later.");
      } else {
        setAuthError(error.message || 'Login failed. Please try again.');
      }
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
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Signup failed with status: " + response.status }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      setAuthError(null);
      alert('Signup successful! Please login.');
    } catch (error: any) {
      console.error('Signup failed:', error);
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        setAuthError("Failed to connect to the server. Please check your internet connection or try again later.");
      } else {
        setAuthError(error.message || 'Signup failed. Please try again.');
      }
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
      value={{ user, authLoadingGlobal, authError, setAuthError, login, signup, logout, getAuthHeaders }}
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

// --- AuthModal Component ---
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
  const { login, signup, authError, setAuthError, authLoadingGlobal, user } = useAuth();

  useEffect(() => {
    setMode(initialMode); setUsername(''); setEmail(''); setPassword('');
    if (isOpen) {
      setAuthError(null);
    }
  }, [isOpen, initialMode, setAuthError]);

  useEffect(() => {
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

// --- ProfileModal Components ---
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
  onToggleFavorite: (event?: React.MouseEvent) => Promise<void>;
  isFavoriteList?: boolean;
}> = ({ item, onWordClick, onToggleFavorite, isFavoriteList }) => {
  const [isToggling, setIsToggling] = useState(false);

  const handleToggleFavoriteInternal = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsToggling(true);
    try {
      await onToggleFavorite(e);
    } catch (error) {
      console.error("Failed to toggle favorite from item:", error);
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
      <button onClick={handleToggleFavoriteInternal} disabled={isToggling} className={`p-1 rounded-full transition-colors duration-150 focus:outline-none ${item.is_favorite ? 'text-red-500 hover:text-red-600' : 'text-gray-400 hover:text-red-400'} ${isToggling ? 'opacity-50 cursor-not-allowed' : ''}`} aria-label={item.is_favorite ? 'Unfavorite' : 'Favorite'}>{item.is_favorite ? '♥' : '♡'}</button>
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
              <p className="text-sm text-indigo-600 dark:text-indigo-400"><span className="font-semibold">Words Explored:</span> {profileData.explored_words_list?.length || 0}</p>
            </div>
            <AccordionSection title="All Explored Words" count={profileData.explored_words_list?.length || 0} isActive={activeSection === 'explored'} onClick={() => setActiveSection(activeSection === 'explored' ? null : 'explored')}>
              {(profileData.explored_words_list && profileData.explored_words_list.length > 0) ? (
                <ul className="space-y-1 pr-1">
                  {profileData.explored_words_list.map((item) => (<CompactWordListItem key={`explored-${item.id}`} item={item} onWordClick={() => handleWordClickInProfileLocal(item)} onToggleFavorite={() => onToggleFavorite(item.id, item.is_favorite)} />))}
                </ul>
              ) : (<p className="text-gray-500 dark:text-gray-400">No words explored yet.</p>)}
            </AccordionSection>
            <AccordionSection title="Favorite Words" count={profileData.favorite_words_list?.length || 0} isActive={activeSection === 'favorites'} onClick={() => setActiveSection(activeSection === 'favorites' ? null : 'favorites')}>
              {(profileData.favorite_words_list && profileData.favorite_words_list.length > 0) ? (
                <ul className="space-y-1 pr-1">
                  {profileData.favorite_words_list.map((item) => (<CompactWordListItem key={`fav-${item.id}`} item={item} onWordClick={() => handleWordClickInProfileLocal(item)} onToggleFavorite={() => onToggleFavorite(item.id, item.is_favorite)} isFavoriteList={true} />))}
                </ul>
              ) : (<p className="text-gray-500 dark:text-gray-400">No favorite words yet.</p>)}
            </AccordionSection>
            <AccordionSection title="Streak History" count={profileData.streak_history?.length || 0} isActive={activeSection === 'streaks'} onClick={() => setActiveSection(activeSection === 'streaks' ? null : 'streaks')}>
              {(profileData.streak_history && profileData.streak_history.length > 0) ? (
                <ul className="space-y-2 pr-1">
                  {[...(profileData.streak_history || [])].sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime()).map((streak, index) => (
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

  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [isLoadingProfile, setIsLoadingProfile] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [currentTutorWordIsFavorite, setCurrentTutorWordIsFavorite] = useState(false);
  const [currentStreak, setCurrentStreak] = useState<Streak>({ words: [], score: 0 });

  const lastSubmittedQuestionRef = useRef<string | null>(null);
  const isReviewingStreakWordRef = useRef<boolean>(false);
  const isContinuingStreakRef = useRef<boolean>(false); // New ref to manage streak continuation

  const fetchProfileDataSilently = useCallback(async (force: boolean = false) => {
    if (!user || (isLoadingProfile && !force)) return;
    if (!force && profileData && profileData.username === user.username) return;

    console.log("Fetching profile data silently...");
    setIsLoadingProfile(true);
    try {
      const response = await fetch(`${API_BASE_URL}/profile`, { method: 'GET', headers: getAuthHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch profile');
      setProfileData(data);
      setProfileError(null);
    } catch (error: any) {
      console.error('Silent profile fetch failed:', error);
    } finally {
      setIsLoadingProfile(false);
    }
  }, [user, getAuthHeaders, isLoadingProfile, profileData]);

  useEffect(() => {
    if (user && (!profileData || profileData.username !== user.username)) {
      fetchProfileDataSilently(true);
    }
  }, [user, profileData, fetchProfileDataSilently]);


  useEffect(() => {
    if (user && showAuthModal) setShowAuthModal(false);
  }, [user, showAuthModal]);

  useEffect(() => {
    if (lastSubmittedQuestionRef.current && profileData) {
      const foundWord = profileData.explored_words_list.find(w => w.word.toLowerCase().trim() === lastSubmittedQuestionRef.current!.toLowerCase().trim());
      setCurrentTutorWordIsFavorite(foundWord ? foundWord.is_favorite : false);
    } else {
      setCurrentTutorWordIsFavorite(false);
    }
  }, [lastSubmittedQuestionRef.current, profileData]);


  const handleEndStreak = useCallback(async (reason: string, streakToSave?: Streak) => {
    const streak = streakToSave || currentStreak; // Use provided streak or current one
    console.log(`Streak end triggered. Reason: ${reason}. Score: ${streak.score}, Words: ${streak.words.join(', ')}`);

    if (user && streak.words.length > 0 && streak.score >= 2) {
      try {
        const response = await fetch(`${API_BASE_URL}/save_streak`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ words: streak.words, score: streak.score }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to save streak');

        setProfileData(prev => {
          const newStreakEntry: Streak = {
            words: [...streak.words],
            score: streak.score,
            completed_at: new Date().toISOString(),
            id: result.streak_id || `temp-${Date.now()}`
          };
          if (!prev) {
            return {
              username: user.username, tier: user.tier, explored_words_count: 0,
              explored_words_list: [], favorite_words_list: [],
              streak_history: [newStreakEntry]
            };
          }
          return {
            ...prev,
            streak_history: [newStreakEntry, ...(prev.streak_history || [])]
          };
        });
      } catch (error) {
        console.error('Error saving streak:', error);
        setAiError(`Could not save streak: ${(error as Error).message}`);
      }
    }
    // Only reset currentStreak if the streak being ended is the current one
    if (!streakToSave || streakToSave === currentStreak) {
      setCurrentStreak({ words: [], score: 0 });
    }
    isReviewingStreakWordRef.current = false;
  }, [user, currentStreak, getAuthHeaders]);


  const generateContent = async (
    question: string,
    mode: ContentMode,
    isNewWordContext: boolean = false,
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

    if (isNewWordContext) {
      // If it's a new word context AND we are not specifically continuing a streak, end the old one.
      if (!isContinuingStreakRef.current && (lastSubmittedQuestionRef.current !== question || forceRefresh)) {
        await handleEndStreak(forceRefresh ? `Refresh for ${question}` : `New word context: ${question}`);
      }
      lastSubmittedQuestionRef.current = question;
      setGeneratedContents({});
      // Start a new streak only if it's 'explain' mode, not a refresh, not a review, and not explicitly continuing
      if (mode === 'explain' && !forceRefresh && !isReview && !isContinuingStreakRef.current) {
        setCurrentStreak({ words: [question], score: 1 });
      }
    }
    isContinuingStreakRef.current = false; // Reset after use

    try {
      const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, mode, force_refresh: forceRefresh }),
      });
      const data = await response.json();

      if (!response.ok) {
        if (data.full_cache) setGeneratedContents(data.full_cache);
        else setGeneratedContents({});
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      setGeneratedContents(data.full_cache || {});
      setActiveMode(mode);

      if (isNewWordContext && mode === 'explain' && data.source === 'generated') {
        fetchProfileDataSilently(true);
      } else if (user && !profileData && !isLoadingProfile) {
        fetchProfileDataSilently();
      } else if (profileData && lastSubmittedQuestionRef.current) {
        const foundWord = profileData.explored_words_list.find(w => w.word.toLowerCase().trim() === lastSubmittedQuestionRef.current!.toLowerCase().trim());
        setCurrentTutorWordIsFavorite(foundWord ? foundWord.is_favorite : false);
      }

    } catch (error: any) {
      console.error(`Error generating ${mode} for ${question}:`, error);
      setAiError(error.message || `Failed to generate ${mode}.`);
    } finally {
      setIsLoadingExplanation(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuestion = e.target.value;
    setInputQuestion(newQuestion);
    if (!newQuestion.trim()) {
      if (currentStreak.score > 0 && !isReviewingStreakWordRef.current) {
        handleEndStreak("Input cleared by user");
      }
    } else if (isReviewingStreakWordRef.current && newQuestion.toLowerCase().trim() !== (lastSubmittedQuestionRef.current || '').toLowerCase().trim()) {
      handleEndStreak("New input typed during review");
      isReviewingStreakWordRef.current = false;
    }
  };

  const handleGenerateClick = () => {
    if (inputQuestion.trim() && user) {
      isReviewingStreakWordRef.current = false;
      isContinuingStreakRef.current = false; // Explicitly not continuing a streak here
      generateContent(inputQuestion.trim(), 'explain', true, false, false);
    } else if (!user) {
      setAuthModalMode('login'); setShowAuthModal(true);
    }
  };

  const handleRefreshContent = () => {
    const questionToRefresh = lastSubmittedQuestionRef.current;
    if (questionToRefresh && activeMode && user) {
      isReviewingStreakWordRef.current = false;
      isContinuingStreakRef.current = false; // Refreshing ends current streak path for this word
      generateContent(questionToRefresh, activeMode, true, false, true);
    } else if (!user) {
      setAuthModalMode('login'); setShowAuthModal(true);
    }
  };

  const handleModeToggle = (newMode: ContentMode) => {
    const currentQuestionForModes = lastSubmittedQuestionRef.current;
    if (!currentQuestionForModes || !user) {
      if (!user) { setAuthModalMode('login'); setShowAuthModal(true); }
      return;
    }
    setAiError(null);
    setActiveMode(newMode);

    if (!generatedContents[newMode]) {
      console.log(`Content for '${newMode}' for "${currentQuestionForModes}" not in local cache. Fetching...`);
      isContinuingStreakRef.current = false; // Toggling mode for aux content does not continue streak.
      generateContent(currentQuestionForModes, newMode, false, false, false);
    } else {
      console.log(`Content for '${newMode}' for "${currentQuestionForModes}" already in local cache. Displaying.`);
    }
  };

  // MODIFIED: handleWordClickFromExplanation
  const handleWordClickFromExplanation = (word: string) => {
    if (!user) {
      setAuthModalMode('login'); setShowAuthModal(true); return;
    }

    const newWords = currentStreak.words.includes(word) ? currentStreak.words : [...currentStreak.words, word];
    const newScore = currentStreak.words.includes(word) ? currentStreak.score : currentStreak.score + 1;

    // If this is the first word of any streak (i.e. currentStreak was empty or for a different root)
    // OR if the current streak's root word (currentStreak.words[0]) is different from the *previous* focus word (lastSubmittedQuestionRef.current)
    // then we need to end the old streak before setting the new one.
    if (currentStreak.words.length === 0 || (lastSubmittedQuestionRef.current && currentStreak.words[0] !== lastSubmittedQuestionRef.current)) {
      if (currentStreak.score >= 2) handleEndStreak("Starting new streak from sub-topic", currentStreak); // Save old if valid
      setCurrentStreak({ words: [lastSubmittedQuestionRef.current || inputQuestion.trim(), word], score: 2 });
    } else {
      setCurrentStreak({ words: newWords, score: newScore });
    }

    isReviewingStreakWordRef.current = false;
    setInputQuestion(word);
    isContinuingStreakRef.current = true; // Signal that generateContent should not reset this streak
    generateContent(word, 'explain', true, false, false); // isNewWordContext = true
  };

  const handleWordClickFromProfile = (word: string, cachedContentComplete?: Partial<GeneratedContent>) => {
    if (!user) {
      setShowAuthModal(true); setAuthModalMode('login'); return;
    }
    isReviewingStreakWordRef.current = false;
    setInputQuestion(word);
    setAiError(null);
    isContinuingStreakRef.current = false; // Clicking from profile starts a new streak context

    if (cachedContentComplete && Object.keys(cachedContentComplete).length > 0) {
      lastSubmittedQuestionRef.current = word;
      setGeneratedContents(cachedContentComplete);
      const initialMode = cachedContentComplete.explain
        ? 'explain'
        : (Object.keys(cachedContentComplete)[0] as ContentMode | undefined) || 'explain';
      setActiveMode(initialMode);
      // Call generateContent to correctly handle streak start & profile fetch if needed,
      // even if serving from cache, to ensure consistent logic.
      // isNewWordContext = true, forceRefresh = false
      generateContent(word, initialMode, true, false, false);
    } else {
      generateContent(word, 'explain', true, false, false);
    }
    setShowProfileModal(false);
  };

  const handleReviewStreakWordClick = (wordFromStreak: string) => {
    if (!user) {
      setShowAuthModal(true); setAuthModalMode('login'); return;
    }
    setInputQuestion(wordFromStreak);
    isReviewingStreakWordRef.current = true;
    setAiError(null);

    lastSubmittedQuestionRef.current = wordFromStreak;

    const wordData = profileData?.explored_words_list.find(w => w.word.toLowerCase().trim() === wordFromStreak.toLowerCase().trim());
    const cachedContentsForWord = wordData?.generated_content_cache;

    if (cachedContentsForWord && Object.keys(cachedContentsForWord).length > 0) {
      setGeneratedContents(cachedContentsForWord);
      const initialMode = cachedContentsForWord.explain
        ? 'explain'
        : (Object.keys(cachedContentsForWord)[0] as ContentMode | undefined) || 'explain';
      setActiveMode(initialMode);
    } else {
      console.warn(`No cache found for streak review word: ${wordFromStreak}. Displaying placeholder.`);
      setGeneratedContents({});
      setActiveMode('explain');
    }
  };

  const handleOpenProfileModal = async () => {
    if (!user) { setShowAuthModal(true); setAuthModalMode('login'); return; }
    setShowProfileModal(true);
    fetchProfileDataSilently(true);
  };

  const handleToggleFavoriteOnTutorPage = async () => {
    const wordToToggle = lastSubmittedQuestionRef.current;
    if (!user || !wordToToggle) {
      if (!user) setShowAuthModal(true);
      return;
    }

    const newFavoriteStatus = !currentTutorWordIsFavorite;
    setCurrentTutorWordIsFavorite(newFavoriteStatus);

    try {
      const response = await fetch(`${API_BASE_URL}/toggle_favorite`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: wordToToggle, is_favorite: newFavoriteStatus }),
      });
      const data = await response.json();
      if (!response.ok) {
        setCurrentTutorWordIsFavorite(!newFavoriteStatus);
        throw new Error(data.error || 'Failed to toggle favorite');
      }
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
      setCurrentTutorWordIsFavorite(!newFavoriteStatus);
    }
  };

  const handleToggleFavoriteInProfile = async (wordIdSanitized: string, currentIsFavorite: boolean) => {
    const wordEntry = profileData?.explored_words_list.find(w => w.id === wordIdSanitized);
    if (!wordEntry || !user) return;

    const originalWord = wordEntry.word;
    const newFavoriteStatus = !currentIsFavorite;

    setProfileData(prev => {
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
      if (!response.ok) {
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
              <button onClick={() => { handleEndStreak("Logout"); logout(); setGeneratedContents({}); setInputQuestion(''); lastSubmittedQuestionRef.current = null; setAiError(null); }} className="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-100 rounded-md hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:text-indigo-200 dark:bg-indigo-700 dark:hover:bg-indigo-800">Logout</button>
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
            {inputQuestion && (<button onClick={() => { setInputQuestion(''); if (currentStreak.score > 0 && !isReviewingStreakWordRef.current) { handleEndStreak("Input cleared by X button"); } }} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl" aria-label="Clear input">&times;</button>)}
          </div>
        </div>

        <button onClick={handleGenerateClick} disabled={isLoadingExplanation || !inputQuestion.trim() || !user} className="w-full sm:w-auto bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-md focus:outline-none focus:shadow-outline disabled:opacity-50 transition duration-150 ease-in-out mb-4 text-lg">
          {isLoadingExplanation && (lastSubmittedQuestionRef.current === inputQuestion.trim()) ? 'Generating...' : 'Generate Explanation'}
        </button>

        {user && lastSubmittedQuestionRef.current && (
          <div className="my-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-md shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              {(['explain', 'image', 'fact', 'quiz', 'deep'] as ContentMode[]).map((mode) => (
                <button key={mode} onClick={() => handleModeToggle(mode)}
                  disabled={isLoadingExplanation || !lastSubmittedQuestionRef.current}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors 
                                    ${activeMode === mode ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500'} 
                                    ${(!lastSubmittedQuestionRef.current || isLoadingExplanation) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
              {lastSubmittedQuestionRef.current && generatedContents.explain && (
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
            {currentStreak.words.length > 0 && currentStreak.score > 0 && (
              <div className="mt-2 text-sm font-semibold text-purple-600 dark:text-purple-400">
                Streak: {currentStreak.score} (
                {currentStreak.words.map((word, index) => (
                  <React.Fragment key={`streak-${index}-${word}`}>
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

        {lastSubmittedQuestionRef.current && generatedContents[activeMode] && !isLoadingExplanation && (
          <div className="mt-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 shadow">
            {activeMode === 'explain' && generatedContents.explain ? (
              <HighlightedContentRenderer text={generatedContents.explain} onWordClick={handleWordClickFromExplanation} />
            ) : (
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{generatedContents[activeMode]}</p>
            )}
          </div>
        )}
        {lastSubmittedQuestionRef.current && !isLoadingExplanation && !generatedContents[activeMode] && (
          <div className="mt-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 shadow">
            <p className="text-gray-500 dark:text-gray-400">Content for '{activeMode}' mode is not available for "{lastSubmittedQuestionRef.current}". Click the '{activeMode.charAt(0).toUpperCase() + activeMode.slice(1)}' tab again to generate it.</p>
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

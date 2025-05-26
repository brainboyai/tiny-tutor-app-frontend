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
          {mode === 'login' ? (<>Need an account? <button onClick={() => {setMode('signup'); setAuthError(null);}} className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">Sign Up</button></>) : (<>Already have an account? <button onClick={() => {setMode('login'); setAuthError(null);}} className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">Login</button></>)}
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
  onToggleFavorite: (wordId: string, currentIsFavoriteState: boolean) => Promise<void>;
  onPastStreakWordClick: (word: string) => void;
}

interface CompactWordListItemProps { // Define props for CompactWordListItem
  item: ExploredWord;
  onWordClick: () => void;
  onToggleFavorite: () => Promise<void>; // Changed: No event param needed by the prop itself
  isFavoriteList?: boolean;
}

const CompactWordListItem: React.FC<CompactWordListItemProps> = ({ item, onWordClick, onToggleFavorite, isFavoriteList }) => {
  const [isToggling, setIsToggling] = useState(false);

  const handleToggleFavoriteInternal = async (event: React.MouseEvent) => { // event is from onClick
    event.stopPropagation(); // Use the event here for stopPropagation
    setIsToggling(true);
    try {
      await onToggleFavorite(); // Call prop which doesn't expect an event
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

const AccordionSection: React.FC<{title: string; count: number; isActive: boolean; onClick: () => void; children: React.ReactNode;}> = ({ title, count, isActive, onClick, children }) => (
  <div className="border-b border-gray-200 dark:border-gray-700">
    <button onClick={onClick} className="w-full flex justify-between items-center py-4 px-2 text-left text-lg font-semibold text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none">
      <span>{title} ({count})</span><span className={`transform transition-transform duration-200 ${isActive ? 'rotate-180' : 'rotate-0'}`}>▼</span>
    </button>
    {isActive && <div className="p-4 bg-gray-50 dark:bg-gray-750 max-h-[40vh] overflow-y-auto">{children}</div>}
  </div>
);

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, profileData, isLoading, error, onWordClick, onToggleFavorite, onPastStreakWordClick }) => {
  const [activeSection, setActiveSection] = useState<ProfileAccordionSection>(null);
  useEffect(() => { if (isOpen && profileData) setActiveSection('explored'); else if (!isOpen) setActiveSection(null); }, [isOpen, profileData]);
  if (!isOpen) return null;
  const handleWordClickInProfileLocal = (wordItem: ExploredWord) => { onWordClick(wordItem.word, wordItem.generated_content_cache); onClose(); };
  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-40">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4"><h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">User Profile</h2><button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl" aria-label="Close">&times;</button></div>
        {isLoading && <p className="text-center text-gray-600 dark:text-gray-300 py-4">Loading profile...</p>}
        {error && <p className="text-center text-red-500 dark:text-red-400 py-4">Error: {error}</p>}
        {profileData && (
          <div className="flex-grow overflow-y-auto">
            <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900 rounded-lg shadow"><p className="text-lg"><span className="font-semibold text-indigo-700 dark:text-indigo-300">Username:</span> {profileData.username}</p><p className="text-sm text-indigo-600 dark:text-indigo-400"><span className="font-semibold">Tier:</span> {profileData.tier}</p><p className="text-sm text-indigo-600 dark:text-indigo-400"><span className="font-semibold">Words Explored:</span> {profileData.explored_words_list?.length || 0}</p></div>
            <AccordionSection title="All Explored Words" count={profileData.explored_words_list?.length || 0} isActive={activeSection === 'explored'} onClick={() => setActiveSection(activeSection === 'explored' ? null : 'explored')}>
              {(profileData.explored_words_list && profileData.explored_words_list.length > 0) ? (<ul className="space-y-1 pr-1">{profileData.explored_words_list.map((item) => (<CompactWordListItem key={`explored-${item.id}`} item={item} onWordClick={() => handleWordClickInProfileLocal(item)} onToggleFavorite={() => onToggleFavorite(item.id, item.is_favorite)} />))}</ul>) : (<p className="text-gray-500 dark:text-gray-400">No words explored yet.</p>)}
            </AccordionSection>
            <AccordionSection title="Favorite Words" count={profileData.favorite_words_list?.length || 0} isActive={activeSection === 'favorites'} onClick={() => setActiveSection(activeSection === 'favorites' ? null : 'favorites')}>
              {(profileData.favorite_words_list && profileData.favorite_words_list.length > 0) ? (<ul className="space-y-1 pr-1">{profileData.favorite_words_list.map((item) => (<CompactWordListItem key={`fav-${item.id}`} item={item} onWordClick={() => handleWordClickInProfileLocal(item)} onToggleFavorite={() => onToggleFavorite(item.id, item.is_favorite)} isFavoriteList={true} />))}</ul>) : (<p className="text-gray-500 dark:text-gray-400">No favorite words yet.</p>)}
            </AccordionSection>
            <AccordionSection title="Streak History" count={profileData.streak_history?.length || 0} isActive={activeSection === 'streaks'} onClick={() => setActiveSection(activeSection === 'streaks' ? null : 'streaks')}>
              {(profileData.streak_history && profileData.streak_history.length > 0) ? (
                <ul className="space-y-2 pr-1">{[...(profileData.streak_history || [])].sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime()).map((streak) => (
                    <li key={streak.id || streak.words.join('-')} className="p-3 bg-gray-100 dark:bg-gray-600 rounded-md shadow">
                      <p className="font-semibold text-indigo-600 dark:text-indigo-400">Score: {streak.score}</p>
                      <p className="text-sm text-gray-700 dark:text-gray-300">Words: {streak.words.map((word, idx) => (<React.Fragment key={`${streak.id}-word-${idx}-${word}`}><button onClick={() => {onClose(); onPastStreakWordClick(word);}} className="text-blue-500 hover:text-blue-700 hover:underline disabled:text-gray-400">{word}</button>{idx < streak.words.length - 1 && ' → '}</React.Fragment>))}</p>
                      {streak.completed_at && (<p className="text-xs text-gray-500 dark:text-gray-400">Completed: {new Date(streak.completed_at).toLocaleString()}</p>)}
                    </li>))}</ul>
              ) : (<p className="text-gray-500 dark:text-gray-400">No completed streaks yet.</p>)}
            </AccordionSection>
          </div>)}
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
    if (lastSubmittedQuestionRef.current && profileData?.explored_words_list) {
      const foundWord = profileData.explored_words_list.find(w => w.word.toLowerCase().trim() === lastSubmittedQuestionRef.current!.toLowerCase().trim());
      setCurrentTutorWordIsFavorite(foundWord ? foundWord.is_favorite : false);
    } else {
      setCurrentTutorWordIsFavorite(false);
    }
  }, [lastSubmittedQuestionRef.current, profileData]);

  const handleEndStreak = useCallback(async (reason: string, streakToSave?: Streak) => {
    const streak = streakToSave || currentStreak;
    console.log(`Streak end. Reason: ${reason}. Score: ${streak.score}, Words: ${streak.words.join(', ')}`);
    
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
            words: [...streak.words], score: streak.score, 
            completed_at: new Date().toISOString(), id: result.streak_id || `temp-${Date.now()}` 
          };
          if (!prev) {
            return { 
              username: user.username, tier: user.tier, explored_words_count: 0, 
              explored_words_list: [], favorite_words_list: [], 
              streak_history: [newStreakEntry] 
            };
          }
          const existingHistory = Array.isArray(prev.streak_history) ? prev.streak_history : [];
          return { ...prev, streak_history: [newStreakEntry, ...existingHistory] };
        });
      } catch (error) {
        console.error('Error saving streak:', error);
        setAiError(`Could not save streak: ${(error as Error).message}`);
      }
    }
     if (!streakToSave || (streakToSave.words.join(',') === currentStreak.words.join(',') && streakToSave.score === currentStreak.score)) {
        setCurrentStreak({ words: [], score: 0 });
    }
    isReviewingStreakWordRef.current = false;
  }, [user, currentStreak, getAuthHeaders]);


  const generateContent = async (
    question: string,
    mode: ContentMode,
    options: {
        isNewPrimaryFocus?: boolean;
        triggeredBy?: 'generate_btn' | 'refresh_btn' | 'sub_topic_click' | 'profile_click' | 'mode_toggle' | 'review_click' | 'past_streak_click';
        isReview?: boolean;
        preserveCurrentStreak?: boolean; 
    } = {}
  ) => {
    const {
        isNewPrimaryFocus = false,
        triggeredBy = 'mode_toggle',
        isReview = false,
        preserveCurrentStreak = false, 
    } = options;
    const forceRefresh = triggeredBy === 'refresh_btn';

    if (!user) { setAuthModalMode('login'); setShowAuthModal(true); setAiError("Please login to generate content."); return; }
    if (!question.trim()) { setAiError("Please enter a word or concept."); return; }

    setIsLoadingExplanation(true); setAiError(null);
    isReviewingStreakWordRef.current = isReview;

    if (isNewPrimaryFocus) {
        if (!preserveCurrentStreak && (lastSubmittedQuestionRef.current !== question || forceRefresh) && !isReview) {
            await handleEndStreak(forceRefresh ? `Refresh for ${question}` : `New primary focus: ${question}`, currentStreak);
        }
        lastSubmittedQuestionRef.current = question;
        setGeneratedContents({});
    }
    
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
      
      if (isNewPrimaryFocus && mode === 'explain' && data.source === 'generated') {
          fetchProfileDataSilently(true);
      } else if (user && !profileData && !isLoadingProfile) {
          fetchProfileDataSilently();
      } else if (profileData && lastSubmittedQuestionRef.current) {
        const currentWordForFavoriteCheck = isReviewingStreakWordRef.current ? inputQuestion : lastSubmittedQuestionRef.current;
        const foundWord = profileData.explored_words_list.find(w => w.word.toLowerCase().trim() === currentWordForFavoriteCheck!.toLowerCase().trim());
        setCurrentTutorWordIsFavorite(foundWord ? foundWord.is_favorite : false);
      }
    } catch (error: any) {
      console.error(`Error generating ${mode} for ${question}:`, error);
      setAiError(error.message || `Failed to generate ${mode}.`);
    } finally {
      setIsLoadingExplanation(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { setInputQuestion(e.target.value); };

  const handleGenerateClick = () => {
    if (inputQuestion.trim() && user) {
      isReviewingStreakWordRef.current = false;
      handleEndStreak("Generate Explanation button clicked", currentStreak);
      setCurrentStreak({ words: [inputQuestion.trim()], score: 1 });
      generateContent(inputQuestion.trim(), 'explain', { isNewPrimaryFocus: true, triggeredBy: 'generate_btn' });
    } else if (!user) { setAuthModalMode('login'); setShowAuthModal(true); }
  };

  const handleRefreshContent = () => {
    const questionToRefresh = isReviewingStreakWordRef.current ? inputQuestion : lastSubmittedQuestionRef.current; // Refresh the reviewed word if in review mode
    if (questionToRefresh && activeMode && user) {
      // If refreshing a reviewed word, it should not reset the main streak's lastSubmittedQuestionRef
      // It should also not end the current streak, but force a regeneration for the *reviewed* word.
      const isNewPrimaryFocusForRefresh = !isReviewingStreakWordRef.current;
      
      if (isReviewingStreakWordRef.current) {
         console.log(`Refreshing reviewed word: ${questionToRefresh} for mode ${activeMode}`);
         generateContent(questionToRefresh, activeMode, { 
            isNewPrimaryFocus: false, // Do not change primary focus
            triggeredBy: 'refresh_btn', 
            isReview: true, // Stay in review mode
            preserveCurrentStreak: true // Keep the main streak
        });
      } else {
        console.log(`Refreshing primary word: ${questionToRefresh} for mode ${activeMode}`);
        // This case (not reviewing) implies we are refreshing the main focus word.
        // It's okay to treat it as a new primary focus for caching/UI update purposes,
        // but we should decide if it ends the current streak or not.
        // Original behavior: handleEndStreak is called inside generateContent if isNewPrimaryFocus and not preserveCurrentStreak
        // Let's make it explicit: refresh should not end a streak, it just refreshes content for the current focus.
        generateContent(questionToRefresh, activeMode, { 
            isNewPrimaryFocus: true, // This will clear local cache for this word and make it primary.
            triggeredBy: 'refresh_btn',
            preserveCurrentStreak: true // Explicitly preserve streak on refresh.
        });
      }
    } else if (!user) { 
        setAuthModalMode('login'); 
        setShowAuthModal(true); 
    }
  };
  
  const handleModeToggle = (newMode: ContentMode) => {
    // *** MODIFICATION START ***
    const currentQuestionForModes = isReviewingStreakWordRef.current ? inputQuestion : lastSubmittedQuestionRef.current;
    // *** MODIFICATION END ***

    if (!currentQuestionForModes || !user) { 
      if (!user) { 
        setAuthModalMode('login'); 
        setShowAuthModal(true); 
      } 
      return; 
    }
    
    setAiError(null); 
    setActiveMode(newMode);

    if (!generatedContents[newMode] || (isReviewingStreakWordRef.current && (!generatedContents[newMode]))) {
      console.log(`Content for '${newMode}' for "${currentQuestionForModes}" not in local cache. Fetching... (Review Mode: ${isReviewingStreakWordRef.current})`);
      generateContent(currentQuestionForModes, newMode, { 
        isNewPrimaryFocus: false, // Mode toggle should not change the primary focus word of the streak
        triggeredBy: 'mode_toggle', 
        preserveCurrentStreak: true, // Always preserve streak on mode toggle
        isReview: isReviewingStreakWordRef.current // Pass the current review state
      });
    } else { 
      console.log(`Content for '${newMode}' for "${currentQuestionForModes}" already in local cache. Displaying. (Review Mode: ${isReviewingStreakWordRef.current})`);
    }
  };
  
  const handleWordClickFromExplanation = (clickedWord: string) => {
    if (!user) { setAuthModalMode('login'); setShowAuthModal(true); return; }
    
    const currentFocusWord = lastSubmittedQuestionRef.current; // This is the word whose explanation was clicked
    
    isReviewingStreakWordRef.current = false; // Clicking a sub-topic always exits review mode
    setInputQuestion(clickedWord); // Update input to the new focus

    if (!currentFocusWord) { // Should ideally not happen if an explanation is visible
        handleEndStreak("Sub-topic click with no prior focus (edge case)", currentStreak);
        setCurrentStreak({ words: [clickedWord], score: 1 });
        generateContent(clickedWord, 'explain', { isNewPrimaryFocus: true, triggeredBy: 'sub_topic_click' });
        return;
    }

    setCurrentStreak(prevStreak => {
        // If streak is empty, or if the last word of the streak isn't the word we just clicked from (currentFocusWord),
        // it implies we are branching off or starting fresh relative to currentFocusWord.
        if (prevStreak.words.length === 0 || 
            (prevStreak.words.length > 0 && prevStreak.words[prevStreak.words.length - 1].toLowerCase() !== currentFocusWord.toLowerCase())) {
            
            // If there was an old streak with score >= 2, save it before starting new branch
            if (prevStreak.score >= 2) {
                handleEndStreak(`Starting new streak branch from ${currentFocusWord}. Old streak was ${prevStreak.words.join('->')}`, prevStreak);
            }
            console.log(`Streak: Starting new branch from ${currentFocusWord} -> ${clickedWord}`);
            return { words: [currentFocusWord, clickedWord], score: 2 };
        } else { // We are continuing the streak from currentFocusWord
            if (prevStreak.words[prevStreak.words.length - 1].toLowerCase() !== clickedWord.toLowerCase()) { // Avoid adding same word twice
                console.log(`Streak: Continuing ${prevStreak.words.join(' -> ')} -> ${clickedWord}`);
                return { words: [...prevStreak.words, clickedWord], score: prevStreak.score + 1 };
            }
        }
        return prevStreak; // No change if clickedWord is same as last word in streak
    });
    
    // Generate content for the new clickedWord, making it the new primary focus
    // and preserving the (now updated) current streak.
    generateContent(clickedWord, 'explain', { 
        isNewPrimaryFocus: true, 
        triggeredBy: 'sub_topic_click', 
        preserveCurrentStreak: true 
    });
  };

  const handleWordClickFromProfile = (word: string, cachedContentComplete?: Partial<GeneratedContent>) => {
    if (!user) { setAuthModalMode('login'); setShowAuthModal(true); return; }
    isReviewingStreakWordRef.current = false;
    setInputQuestion(word); setAiError(null);
    
    handleEndStreak("Clicked word from profile", currentStreak);
    setCurrentStreak({ words: [word], score: 1 });

    const initialModeToLoad = cachedContentComplete?.explain ? 'explain' : (Object.keys(cachedContentComplete || {})[0] as ContentMode | undefined) || 'explain';

    if (cachedContentComplete && Object.keys(cachedContentComplete).length > 0) {
      lastSubmittedQuestionRef.current = word; // Set primary focus
      setGeneratedContents(cachedContentComplete); // Load cache
      setActiveMode(initialModeToLoad);
      // Fetch to confirm/update explored status, don't force refresh unless needed
      // The generateContent call below will handle setting lastSubmittedQuestionRef correctly
      // and checking for favorite status.
      generateContent(word, initialModeToLoad, {isNewPrimaryFocus: true, triggeredBy: 'profile_click'}); 
    } else {
      generateContent(word, 'explain', {isNewPrimaryFocus: true, triggeredBy: 'profile_click'});
    }
    setShowProfileModal(false);
  };

  const handleReviewStreakWordClick = (wordFromStreak: string) => {
    if (!user) { setAuthModalMode('login'); setShowAuthModal(true); return; }
    
    // If already reviewing this word, or if it's the current primary focus and not in review mode, do nothing to avoid re-renders/fetches
    if ((isReviewingStreakWordRef.current && inputQuestion.toLowerCase() === wordFromStreak.toLowerCase()) ||
        (!isReviewingStreakWordRef.current && lastSubmittedQuestionRef.current?.toLowerCase() === wordFromStreak.toLowerCase())) {
        // If it's the primary focus but we are *not* in review mode, clicking it should enter review mode for *it*.
        if (!isReviewingStreakWordRef.current && lastSubmittedQuestionRef.current?.toLowerCase() === wordFromStreak.toLowerCase()) {
             // This means user clicked the *last* word of the streak display, which is also the primary focus.
             // We should still allow "reviewing" it to set the flag correctly for mode toggles.
        } else {
            console.log("Already viewing/reviewing this word from streak:", wordFromStreak);
            return;
        }
    }
    
    setInputQuestion(wordFromStreak); // Set input to the word being reviewed
    isReviewingStreakWordRef.current = true; // Enter review mode
    setAiError(null);
    
    // Try to find the word's cached content from profileData (which should be up-to-date)
    const wordData = profileData?.explored_words_list.find(w => w.word.toLowerCase().trim() === wordFromStreak.toLowerCase().trim());
    const cachedContentsForWord = wordData?.generated_content_cache;

    if (cachedContentsForWord && Object.keys(cachedContentsForWord).length > 0) {
        console.log(`Reviewing '${wordFromStreak}' from streak. Loading from cache.`);
        setGeneratedContents(cachedContentsForWord); 
        const initialMode = cachedContentsForWord.explain ? 'explain' : (Object.keys(cachedContentsForWord)[0] as ContentMode | undefined) || 'explain';
        setActiveMode(initialMode);
        setCurrentTutorWordIsFavorite(wordData?.is_favorite || false); 
        // DO NOT change lastSubmittedQuestionRef.current - the primary streak end remains the same.
        // DO NOT call generateContent here if cache is found, as it might overwrite with stale data or trigger unwanted fetches.
    } else {
      console.warn(`No local cache for streak review word: ${wordFromStreak}. Fetching 'explain'.`);
      // Fetch content for the reviewed word. This won't change primary focus.
      generateContent(wordFromStreak, 'explain', { 
        isNewPrimaryFocus: false, // Not a new primary focus
        isReview: true,           // Mark as review
        triggeredBy: 'review_click', 
        preserveCurrentStreak: true // Keep the main streak
      });
    }
  };

  const handlePastStreakWordClicked = (word: string) => {
    if (!user) { setAuthModalMode('login'); setShowAuthModal(true); return; }
    
    setInputQuestion(word);
    isReviewingStreakWordRef.current = false; // Clicking from past streak starts a new primary focus
    setAiError(null);

    handleEndStreak("Clicked word from past streak history", currentStreak);
    setCurrentStreak({ words: [word], score: 1 });

    const wordData = profileData?.explored_words_list.find(w => w.word.toLowerCase().trim() === word.toLowerCase().trim());
    const initialModeToLoad = wordData?.generated_content_cache?.explain ? 'explain' : (Object.keys(wordData?.generated_content_cache || {})[0] as ContentMode | undefined) || 'explain';

    if (wordData?.generated_content_cache && Object.keys(wordData.generated_content_cache).length > 0) {
        // lastSubmittedQuestionRef.current = word; // Will be set by generateContent
        setGeneratedContents(wordData.generated_content_cache);
        setActiveMode(initialModeToLoad);
        generateContent(word, initialModeToLoad, {isNewPrimaryFocus: true, triggeredBy: 'past_streak_click'});
    } else {
        generateContent(word, 'explain', {isNewPrimaryFocus: true, triggeredBy: 'past_streak_click'});
    }
  };


  const handleOpenProfileModal = async () => {
    if (!user) { setShowAuthModal(true); setAuthModalMode('login'); return; }
    setShowProfileModal(true);
    fetchProfileDataSilently(true); // Force fetch fresh profile data
  };
  
  const handleToggleFavoriteOnTutorPage = async () => {
    const wordToToggle = isReviewingStreakWordRef.current ? inputQuestion : lastSubmittedQuestionRef.current;
    if (!wordToToggle || !user) return;

    const newFavoriteStatus = !currentTutorWordIsFavorite;
    setCurrentTutorWordIsFavorite(newFavoriteStatus); // Optimistic UI update

    // Also update in profileData if it exists there
    setProfileData(prev => {
        if (!prev) return null;
        const listToUpdate = prev.explored_words_list.map(w => 
            w.word.toLowerCase() === wordToToggle.toLowerCase() ? { ...w, is_favorite: newFavoriteStatus } : w
        );
        return { 
            ...prev, 
            explored_words_list: listToUpdate,
            favorite_words_list: listToUpdate.filter(w => w.is_favorite).sort((a,b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime())
        };
    });

    try {
      const response = await fetch(`${API_BASE_URL}/toggle_favorite`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: wordToToggle, is_favorite: newFavoriteStatus }),
      });
      const data = await response.json();
      if (!response.ok) {
        setCurrentTutorWordIsFavorite(!newFavoriteStatus); // Revert on error
        setProfileData(prev => { // Revert in profileData
            if (!prev) return null;
            const listToRevert = prev.explored_words_list.map(w => 
                w.word.toLowerCase() === wordToToggle.toLowerCase() ? { ...w, is_favorite: !newFavoriteStatus } : w
            );
            return { 
                ...prev, 
                explored_words_list: listToRevert,
                favorite_words_list: listToRevert.filter(w => w.is_favorite).sort((a,b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime())
            };
        });
        throw new Error(data.error || 'Failed to toggle favorite');
      }
      // Success, profile data should be refetched if it was modified to get correct IDs etc.
      // or rely on the optimistic update. For now, optimistic is fine.
      // fetchProfileDataSilently(true); // Optionally refetch to ensure consistency
    } catch (error) {
      console.error("Error toggling favorite:", error);
      setAiError(`Could not toggle favorite: ${(error as Error).message}`);
    }
  };
  
  const handleToggleFavoriteInProfile = async (wordId: string, isCurrentlyFavorite: boolean) => {
    const wordEntry = profileData?.explored_words_list.find(w => w.id === wordId);
    if (!wordEntry || !user) return;
    
    const originalWord = wordEntry.word;
    const newFavoriteStatus = !isCurrentlyFavorite;

    setProfileData(prev => { // Optimistic update for profile modal
        if (!prev) return null;
        const updatedList = prev.explored_words_list.map(w => w.id === wordId ? { ...w, is_favorite: newFavoriteStatus } : w);
        return { 
            ...prev, 
            explored_words_list: updatedList, 
            favorite_words_list: updatedList.filter(w => w.is_favorite).sort((a,b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime())
        };
    });
    // If the word being toggled in profile is the one currently displayed in the tutor:
    const currentTutorDisplayWord = isReviewingStreakWordRef.current ? inputQuestion : lastSubmittedQuestionRef.current;
    if (currentTutorDisplayWord?.toLowerCase() === originalWord.toLowerCase()) {
      setCurrentTutorWordIsFavorite(newFavoriteStatus);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/toggle_favorite`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: originalWord, is_favorite: newFavoriteStatus }), // Send originalWord (name)
      });
      const data = await response.json();
      if (!response.ok) { // Revert on error
        setProfileData(prev => { 
            if (!prev) return null;
            const revertedList = prev.explored_words_list.map(w => w.id === wordId ? { ...w, is_favorite: isCurrentlyFavorite } : w);
            return { 
                ...prev, 
                explored_words_list: revertedList, 
                favorite_words_list: revertedList.filter(w => w.is_favorite).sort((a,b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime())
            };
        });
        if (currentTutorDisplayWord?.toLowerCase() === originalWord.toLowerCase()) {
          setCurrentTutorWordIsFavorite(isCurrentlyFavorite);
        }
        throw new Error(data.error || 'Failed to toggle favorite in profile');
      }
      // fetchProfileDataSilently(true); // Optionally refetch, but optimistic should be okay.
    } catch (error) {
      console.error("Error toggling favorite from profile:", error);
       setAiError(`Failed to update favorite for "${originalWord}": ${(error as Error).message}`);
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
              <button onClick={() => { handleEndStreak("Logout", currentStreak); logout(); setGeneratedContents({}); setInputQuestion(''); lastSubmittedQuestionRef.current = null; setAiError(null); setCurrentStreak({ words: [], score: 0 }); isReviewingStreakWordRef.current = false; }} className="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-100 rounded-md hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:text-indigo-200 dark:bg-indigo-700 dark:hover:bg-indigo-800">Logout</button>
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
            {inputQuestion && (<button onClick={() => { setInputQuestion(''); if (currentStreak.score > 0 && !isReviewingStreakWordRef.current) { handleEndStreak("Input cleared by X button", currentStreak);} }} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl" aria-label="Clear input">&times;</button>)}
          </div>
        </div>

        <button onClick={handleGenerateClick} disabled={isLoadingExplanation || !inputQuestion.trim() || (!user && !inputQuestion.trim())} className="w-full sm:w-auto bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-md focus:outline-none focus:shadow-outline disabled:opacity-50 transition duration-150 ease-in-out mb-4 text-lg">
           {isLoadingExplanation && (isReviewingStreakWordRef.current ? inputQuestion.toLowerCase() : lastSubmittedQuestionRef.current?.toLowerCase()) === inputQuestion.toLowerCase().trim() ? 'Generating...' : 'Generate Explanation'}
        </button>

        {user && (lastSubmittedQuestionRef.current || isReviewingStreakWordRef.current) && ( // Show controls if logged in AND there's a focus word OR reviewing
          <div className="my-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-md shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              {(['explain', 'image', 'fact', 'quiz', 'deep'] as ContentMode[]).map((mode) => (
                <button key={mode} onClick={() => handleModeToggle(mode)}
                        disabled={isLoadingExplanation || !(isReviewingStreakWordRef.current ? inputQuestion : lastSubmittedQuestionRef.current)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                                    ${activeMode === mode ? 'bg-indigo-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500'}
                                    ${(!(isReviewingStreakWordRef.current ? inputQuestion : lastSubmittedQuestionRef.current) || isLoadingExplanation) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  {mode.charAt(0).toUpperCase() + mode.slice(1)}
                </button>
              ))}
              {(isReviewingStreakWordRef.current ? inputQuestion : lastSubmittedQuestionRef.current) && generatedContents.explain && (
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
                  <React.Fragment key={`live-streak-${index}-${word}`}>
                    <button
                      onClick={() => handleReviewStreakWordClick(word)}
                      className="hover:underline focus:outline-none disabled:no-underline disabled:text-gray-400"
                      disabled={isLoadingExplanation || (isReviewingStreakWordRef.current && inputQuestion.toLowerCase().trim() === word.toLowerCase().trim())}
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
        
        {/* Determine current word for loading/display based on review state */}
        {(() => {
          const displayWord = isReviewingStreakWordRef.current ? inputQuestion : lastSubmittedQuestionRef.current;
          if (isLoadingExplanation && !generatedContents[activeMode] && displayWord) {
            return <div className="mt-6 flex justify-center items-center h-32"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div></div>;
          }
          if (displayWord && generatedContents[activeMode] && !isLoadingExplanation) {
            return (
              <div className="mt-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 shadow">
                {activeMode === 'explain' && generatedContents.explain ? (
                  <HighlightedContentRenderer text={generatedContents.explain} onWordClick={handleWordClickFromExplanation} />
                ) : (
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{generatedContents[activeMode]}</p>
                )}
              </div>
            );
          }
          if (displayWord && !isLoadingExplanation && !generatedContents[activeMode]) {
            return (
              <div className="mt-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 shadow">
                <p className="text-gray-500 dark:text-gray-400">Content for '{activeMode}' mode is not available for "{displayWord}". Click the '{activeMode.charAt(0).toUpperCase() + activeMode.slice(1)}' tab again to generate it.</p>
              </div>
            );
          }
          return null;
        })()}
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
        onPastStreakWordClick={handlePastStreakWordClicked}
      />
    </div>
  );
};

function App() {
  return (<AuthProvider><TinyTutorAppContent /></AuthProvider>);
}

export default App;
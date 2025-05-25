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
import { HelpCircle, Lightbulb, CheckSquare, RefreshCw, Heart, X } from 'lucide-react'; // Icons

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
  cached_explain_content?: string;
  explicit_connections?: string[];
  modes_generated?: string[];
  generated_content_cache?: Partial<GeneratedContent>; // Cache for all modes
}

interface ProfileData {
  username: string;
  tier: string;
  explored_words_count: number;
  explored_words_list: ExploredWord[];
  favorite_words_list: ExploredWord[];
  streak_history: Streak[];
}

type ContentMode = 'explain' | 'fact' | 'quiz';
const AVAILABLE_MODES: ContentMode[] = ['explain', 'fact', 'quiz'];


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
    console.log('Frontend attempting to login with:', {
      usernameOrEmail: usernameOrEmailInput,
      password: passwordInput,
    });
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
      setAuthError(null);
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
      setAuthError(null);
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
  const parts = text.split(/<click>(.*?)<\/click>/g);
  return (
    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
      {parts.map((part, index) => {
        if (index % 2 === 1) {
          return (
            <button
              key={index}
              onClick={() => onWordClick(part)}
              className="text-blue-500 dark:text-blue-400 hover:underline focus:outline-none font-semibold mx-1"
            >
              {part}
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
  const { login, signup, authError, authLoadingGlobal } = useAuth();

  useEffect(() => {
    setMode(initialMode); setUsername(''); setEmail(''); setPassword('');
  }, [isOpen, initialMode]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') await login(username, password);
    else await signup(username, email, password);
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-md relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl" aria-label="Close"><X size={28}/></button>
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800 dark:text-gray-100">{mode === 'login' ? 'Login' : 'Sign Up'}</h2>
        {authError && <p className="bg-red-100 dark:bg-red-700 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-100 px-4 py-3 rounded relative mb-4 text-sm" role="alert">{authError}</p>}
        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="mb-4">
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input type="email" id="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required />
            </div>
          )}
          <div className="mb-4">
            <label htmlFor="username" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{mode === 'login' ? 'Username or Email' : 'Username'}</label>
            <input type={mode === 'login' && username.includes('@') ? 'email' : 'text'} id="username" value={username} onChange={(e) => setUsername(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required />
          </div>
          <div className="mb-6">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
            <input type="password" id="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100" required />
          </div>
          <button type="submit" disabled={authLoadingGlobal} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:shadow-outline disabled:opacity-50 transition duration-150 ease-in-out">
            {authLoadingGlobal ? (<div className="flex items-center justify-center"><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Processing...</div>) : (mode === 'login' ? 'Login' : 'Sign Up')}
          </button>
        </form>
        <p className="mt-6 text-center text-sm">
          {mode === 'login' ? (<>Need an account? <button onClick={() => setMode('signup')} className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">Sign Up</button></>) : (<>Already have an account? <button onClick={() => setMode('login')} className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">Login</button></>)}
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
  onWordClick: (word: string, cachedContent?: Partial<GeneratedContent>) => void;
  onToggleFavorite: (wordId: string, currentIsFavorite: boolean) => Promise<void>;
}

const CompactWordListItem: React.FC<{
  item: ExploredWord;
  onWordClick: () => void;
  onToggleFavorite: (event?: React.MouseEvent) => Promise<void>;
  isFavoriteList?: boolean;
}> = ({ item, onWordClick, onToggleFavorite, isFavoriteList }) => {
  const [isFavoritedOptimistic, setIsFavoritedOptimistic] = useState(item.is_favorite);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => { setIsFavoritedOptimistic(item.is_favorite); }, [item.is_favorite]);

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation(); setIsToggling(true); setIsFavoritedOptimistic(!isFavoritedOptimistic);
    try { await onToggleFavorite(e); }
    catch (error) { console.error("Failed to toggle favorite from item:", error); setIsFavoritedOptimistic(item.is_favorite); }
    finally { setIsToggling(false); }
  };

  return (
    <li className={`p-3 mb-2 rounded-lg shadow hover:shadow-md transition-all duration-200 cursor-pointer flex justify-between items-center ${isFavoriteList ? 'bg-yellow-100 dark:bg-yellow-800 border-l-4 border-yellow-500 dark:border-yellow-600' : 'bg-gray-100 dark:bg-gray-700'}`} onClick={onWordClick}>
      <div>
        <span className="font-semibold text-indigo-700 dark:text-indigo-400 block text-md">{item.word}</span>
        <span className="text-xs text-gray-600 dark:text-gray-400">Last seen: {new Date(item.last_explored_at).toLocaleDateString()}</span>
      </div>
      <button onClick={handleToggleFavorite} disabled={isToggling} className={`p-1 rounded-full transition-colors duration-150 focus:outline-none ${isFavoritedOptimistic ? 'text-red-500 hover:text-red-600' : 'text-gray-400 hover:text-red-400'} ${isToggling ? 'opacity-50 cursor-not-allowed' : ''}`} aria-label={isFavoritedOptimistic ? 'Unfavorite' : 'Favorite'}><Heart fill={isFavoritedOptimistic ? 'currentColor' : 'none'} size={20}/></button>
    </li>
  );
};

const AccordionSection: React.FC<{title: string; count: number; isActive: boolean; onClick: () => void; children: React.ReactNode;}> = ({ title, count, isActive, onClick, children }) => (
  <div className="border-b border-gray-300 dark:border-gray-700 last:border-b-0">
    <button
      onClick={onClick}
      className="w-full flex justify-between items-center py-4 px-1 text-left text-lg font-medium text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none transition-colors duration-150"
    >
      <span>{title} ({count})</span>
      <span className={`transform transition-transform duration-300 ease-in-out ${isActive ? 'rotate-180' : 'rotate-0'}`}>
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
      </span>
    </button>
    <div className={`overflow-hidden transition-all duration-500 ease-in-out ${isActive ? 'opacity-100' : 'max-h-0 opacity-0'} ${isActive ? 'max-h-[20rem]' : 'max-h-0'}`}>
      <div className="p-4 pt-2 bg-white dark:bg-gray-800 h-full">
        {children}
      </div>
    </div>
  </div>
);


const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, profileData, isLoading, error, onWordClick, onToggleFavorite }) => {
  const [activeSection, setActiveSection] = useState<ProfileAccordionSection>('explored');

  useEffect(() => {
    if (!isOpen) setActiveSection(null);
    else if (isOpen && !activeSection && profileData) setActiveSection('explored');
  }, [isOpen, profileData, activeSection]);

  if (!isOpen) return null;

  const handleWordClickInProfile = (wordItem: ExploredWord) => {
    onWordClick(wordItem.word, wordItem.generated_content_cache);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4 z-40 transition-opacity duration-300">
      <div className="bg-white dark:bg-gray-850 p-6 rounded-xl shadow-2xl w-full max-w-2xl md:max-w-3xl lg:max-w-4xl max-h-[90vh] flex flex-col transform transition-all duration-300 scale-95 opacity-0 animate-modalFadeIn">
        <style>{`
          @keyframes modalFadeIn { to { opacity: 1; transform: scale(1); } }
          .animate-modalFadeIn { animation: modalFadeIn 0.3s forwards; }
          .dark .dark\\:bg-gray-850 { background-color: #182130; }
        `}</style>
        <div className="flex justify-between items-center mb-6 pb-4 border-b border-gray-300 dark:border-gray-700">
          <h2 className="text-3xl font-bold text-gray-800 dark:text-gray-100">User Profile</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-gray-100 text-2xl p-1 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors" aria-label="Close"><X size={28}/></button>
        </div>

        {isLoading && <p className="text-center text-gray-600 dark:text-gray-300 py-8">Loading profile...</p>}
        {error && <p className="text-center text-red-600 dark:text-red-400 py-8 text-lg">Error: {error}</p>}

        {profileData && (
          <div className="flex-grow overflow-y-auto custom-scrollbar pr-2">
             <style>{`
              .custom-scrollbar::-webkit-scrollbar { width: 8px; }
              .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
              .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #cbd5e1; border-radius: 10px; border: 2px solid transparent; background-clip: content-box;}
              .dark .custom-scrollbar::-webkit-scrollbar-thumb { background-color: #4a5568; }
            `}</style>
            <div className="mb-6 p-4 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg shadow-md">
              <p className="text-xl"><span className="font-semibold text-indigo-700 dark:text-indigo-300">Username:</span> {profileData.username}</p>
              <p className="text-md text-indigo-600 dark:text-indigo-400"><span className="font-semibold">Tier:</span> {profileData.tier}</p>
              <p className="text-md text-indigo-600 dark:text-indigo-400"><span className="font-semibold">Words Explored:</span> {profileData.explored_words_count}</p>
            </div>

            <div className="rounded-lg overflow-hidden shadow-lg border border-gray-200 dark:border-gray-700">
                <AccordionSection title="All Explored Words" count={profileData.explored_words_list.length} isActive={activeSection === 'explored'} onClick={() => setActiveSection(activeSection === 'explored' ? null : 'explored')}>
                  <ul className="space-y-1 h-[18rem] overflow-y-auto custom-scrollbar pr-1">
                    {profileData.explored_words_list.length > 0 ? profileData.explored_words_list.map((item) => (<CompactWordListItem key={`explored-${item.id}`} item={item} onWordClick={() => handleWordClickInProfile(item)} onToggleFavorite={(e?: React.MouseEvent) => { if (e) e.stopPropagation(); return onToggleFavorite(item.id, item.is_favorite); }} />)) : (<p className="text-gray-500 dark:text-gray-400 py-3">No words explored yet.</p>)}
                  </ul>
                </AccordionSection>

                <AccordionSection title="Favorite Words" count={profileData.favorite_words_list.length} isActive={activeSection === 'favorites'} onClick={() => setActiveSection(activeSection === 'favorites' ? null : 'favorites')}>
                  <ul className="space-y-1 h-[18rem] overflow-y-auto custom-scrollbar pr-1">
                    {profileData.favorite_words_list.length > 0 ? profileData.favorite_words_list.map((item) => (<CompactWordListItem key={`fav-${item.id}`} item={item} onWordClick={() => handleWordClickInProfile(item)} onToggleFavorite={(e?: React.MouseEvent) => { if (e) e.stopPropagation(); return onToggleFavorite(item.id, item.is_favorite); }} isFavoriteList={true} />)) : (<p className="text-gray-500 dark:text-gray-400 py-3">No favorite words yet.</p>)}
                  </ul>
                </AccordionSection>

                <AccordionSection title="Streak History" count={profileData.streak_history.length} isActive={activeSection === 'streaks'} onClick={() => setActiveSection(activeSection === 'streaks' ? null : 'streaks')}>
                  <ul className="space-y-3 h-[18rem] overflow-y-auto custom-scrollbar pr-1">
                    {profileData.streak_history.length > 0 ? profileData.streak_history.map((streak, index) => (<li key={streak.id || `streak-${index}`} className="p-3 bg-gray-100 dark:bg-gray-700 rounded-md shadow"><p className="font-semibold text-indigo-600 dark:text-indigo-400">Score: {streak.score}</p><p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed">Words: {streak.words.join(' → ')}</p>{streak.completed_at && (<p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Completed: {new Date(streak.completed_at).toLocaleString()}</p>)}</li>)) : (<p className="text-gray-500 dark:text-gray-400 py-3">No completed streaks yet.</p>)}
                  </ul>
                </AccordionSection>
            </div>
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
  const [generatedContents, setGeneratedContents] = useState<GeneratedContent>({});
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
  
  const lastSubmittedQuestionRef = useRef<string | null>(null); // Word for which content was last EXPLICITLY fetched (not review)
  const currentDisplayWordRef = useRef<string | null>(null); // Word whose content is currently being displayed (could be a reviewed word)
  const isReviewingStreakWordRef = useRef<boolean>(false);


  useEffect(() => {
    if (user && showAuthModal) setShowAuthModal(false);
  }, [user, showAuthModal]);

  useEffect(() => {
    // Update favorite status based on currentDisplayWordRef and profileData
    const wordToConsider = currentDisplayWordRef.current || inputQuestion;
    if (wordToConsider && profileData) {
      const foundWord = profileData.explored_words_list.find(w => w.word.toLowerCase().trim() === wordToConsider.toLowerCase().trim());
      setCurrentTutorWordIsFavorite(foundWord ? foundWord.is_favorite : false);
    } else {
      setCurrentTutorWordIsFavorite(false);
    }
  }, [inputQuestion, currentDisplayWordRef.current, profileData]);

  const handleEndStreak = useCallback(async (reason: string) => {
    console.log(`Ending streak. Reason: ${reason}. Current streak:`, currentStreak);
    if (currentStreak.words.length > 0 && currentStreak.score >= 2) {
      console.log("Valid streak to save:", currentStreak);
      try {
        const response = await fetch(`${API_BASE_URL}/save_streak`, {
          method: 'POST',
          headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ words: currentStreak.words, score: currentStreak.score }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to save streak');
        console.log('Streak saved successfully:', result);
        if (profileData) {
            setProfileData(prev => prev ? ({
                ...prev,
                streak_history: [
                    { words: currentStreak.words, score: currentStreak.score, completed_at: new Date().toISOString(), id: result.streak_id || `temp-${Date.now()}` },
                     ...(prev.streak_history || [])
                    ].sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())
            }) : null);
        }
      } catch (error) {
        console.error('Error saving streak:', error);
      }
    } else {
      console.log("Streak not saved (score < 2 or no words).");
    }
    setCurrentStreak({ words: [], score: 0 });
    isReviewingStreakWordRef.current = false; 
  }, [currentStreak, getAuthHeaders, profileData]);

  const generateContent = async (question: string, mode: ContentMode, isExplicitNewSubmission: boolean = false) => {
    if (!user) {
      setAuthModalMode('login'); setShowAuthModal(true); setAiError("Please login to generate content."); return;
    }
    if (!question.trim()) {
      setAiError("Please enter a word or concept."); return;
    }

    setIsLoadingExplanation(true); setAiError(null);
    currentDisplayWordRef.current = question; // This is the word we are now focusing on

    // If it's an explicit new submission (main generate button or refresh)
    if (isExplicitNewSubmission) {
        isReviewingStreakWordRef.current = false; // Not a review
        // If the question is different from the last *submitted* question, or if it's an 'explain' refresh
        if (question !== lastSubmittedQuestionRef.current || mode === 'explain') {
            setGeneratedContents({}); // Clear all previous modes' content for this new context
            setIsExplainGeneratedForCurrentWord(false);
        }
        await handleEndStreak(question !== lastSubmittedQuestionRef.current ? "New root word submitted" : "Refreshing current word's explain");
        if (mode === 'explain') { 
            setCurrentStreak({ words: [question], score: 1 });
        }
        lastSubmittedQuestionRef.current = question; // This is now the primary word of exploration
    }

    // Check cache: If content for this mode and currentDisplayWord (question) is already in generatedContents
    if (generatedContents[mode] && question.toLowerCase() === (currentDisplayWordRef.current || '').toLowerCase()) {
        setActiveMode(mode);
        setIsExplainGeneratedForCurrentWord(!!generatedContents.explain); // Ensure this is set based on current generatedContents
        setIsLoadingExplanation(false);
        return;
    }

    try {
      console.log(`Fetching API for: ${question}, mode: ${mode}`);
      const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, mode }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `HTTP error! status: ${response.status}`);

      setGeneratedContents((prev) => ({ ...prev, [mode]: data.content }));
      setActiveMode(mode);

      if (mode === 'explain') {
        setIsExplainGeneratedForCurrentWord(true);
      }
      // Update favorite status based on the currentDisplayWordRef
      if (profileData) {
        const foundWord = profileData.explored_words_list.find(w => w.word.toLowerCase().trim() === (currentDisplayWordRef.current || '').toLowerCase().trim());
        setCurrentTutorWordIsFavorite(foundWord ? foundWord.is_favorite : false);
      }

    } catch (error: any) {
      console.error(`Error generating ${mode} for ${question}:`, error);
      setAiError(error.message || `Failed to generate ${mode}.`);
      if (mode === 'explain' && question.toLowerCase() === (currentDisplayWordRef.current || '').toLowerCase()) {
          setIsExplainGeneratedForCurrentWord(false);
      }
    } finally {
      setIsLoadingExplanation(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuestion = e.target.value;
    setInputQuestion(newQuestion); // Always update input field

    if (!newQuestion.trim()) { // If input is cleared
      setGeneratedContents({}); 
      setIsExplainGeneratedForCurrentWord(false); 
      setAiError(null); 
      setCurrentTutorWordIsFavorite(false);
      if (!isReviewingStreakWordRef.current) { // Only end streak if not in middle of review
          handleEndStreak("Input cleared");
      }
      lastSubmittedQuestionRef.current = null;
      currentDisplayWordRef.current = null;
    } else if (isReviewingStreakWordRef.current && newQuestion.toLowerCase() !== (currentDisplayWordRef.current || '').toLowerCase()) {
      // If user starts typing a new word DIFFERENT from the one being reviewed, end the review and current streak.
      handleEndStreak("New input typed during review");
      // isReviewingStreakWordRef is reset in handleEndStreak
      lastSubmittedQuestionRef.current = null; // New context will be set by generateContent
    }
  };

  const handleGenerateClick = () => { // Main "Generate Explanation" button
    if (inputQuestion.trim()) {
      generateContent(inputQuestion.trim(), 'explain', true);
    }
  };

  const handleModeToggle = (newMode: ContentMode) => {
    const questionForMode = currentDisplayWordRef.current || inputQuestion.trim();
    if (!questionForMode) return;

    // If content for this newMode and current display word is already in generatedContents, just switch.
    if (generatedContents[newMode] && questionForMode.toLowerCase() === (currentDisplayWordRef.current || '').toLowerCase()) {
      setActiveMode(newMode);
    } else if (isExplainGeneratedForCurrentWord || newMode === 'explain') {
      // Fetch if 'explain' was generated for the current display word, or if trying to get 'explain' for it.
      // isExplicitNewSubmission is false because this is a mode toggle.
      generateContent(questionForMode, newMode, false);
    }
  };
  
  const handleRefreshContent = () => {
    const questionToRefresh = currentDisplayWordRef.current || inputQuestion.trim();
    if (questionToRefresh && activeMode) {
      // Refreshing is like an explicit new generation for the current word and active mode.
      generateContent(questionToRefresh, activeMode, true); 
    }
  };

  const handleWordClickFromExplanation = (word: string) => { // Click on <click>word</click>
    // This action always signifies continuing or starting a NEW exploration path, ending any review.
    if (isReviewingStreakWordRef.current) {
        handleEndStreak("Explored from reviewed word's content");
    } // isReviewingStreakWordRef is reset in handleEndStreak

    setInputQuestion(word); // Update the input field to the new word
    // Streak logic:
    if (currentStreak.words.length > 0 && !currentStreak.words.includes(word)) {
      setCurrentStreak(prev => ({ words: [...prev.words, word], score: prev.score + 1 }));
    } else if (currentStreak.words.length === 0 && currentDisplayWordRef.current) { 
      // If no active streak, start one with the previous display word and this new one
      setCurrentStreak({ words: [currentDisplayWordRef.current, word], score: 2 });
    } else if (currentStreak.words.length === 0 && !currentDisplayWordRef.current) {
        // Edge case: if somehow currentDisplayWordRef was null, use inputQuestion as base
        setCurrentStreak({ words: [inputQuestion, word], score: 2});
    }
    // This is a new exploration step, so isExplicitNewSubmission = true, but it's for the *newly clicked word*
    // The old streak (if any) was handled. Now, generate content for 'word', setting it as the new primary context.
    generateContent(word, 'explain', true); 
  };

  const handleReviewStreakWordClick = (wordFromStreak: string) => {
    console.log("Reviewing streak word:", wordFromStreak);
    setInputQuestion(wordFromStreak); 
    isReviewingStreakWordRef.current = true; 
    currentDisplayWordRef.current = wordFromStreak; // This is the word we are now focusing on
    lastSubmittedQuestionRef.current = wordFromStreak; // For mode toggles to work correctly with cache

    const wordDataFromProfile = profileData?.explored_words_list.find(w => w.word.toLowerCase() === wordFromStreak.toLowerCase());
    console.log("Found word data in profile for review:", wordDataFromProfile);

    let contentToLoad: Partial<GeneratedContent> = {};
    let explainAvailableInCache = false;

    if (wordDataFromProfile?.generated_content_cache && Object.keys(wordDataFromProfile.generated_content_cache).length > 0) {
        console.log("Loading full cache for reviewed word:", wordDataFromProfile.generated_content_cache);
        contentToLoad = { ...wordDataFromProfile.generated_content_cache }; // Create a copy
        explainAvailableInCache = !!contentToLoad.explain;
    } else if (wordDataFromProfile?.cached_explain_content) { 
        console.log("Loading only cached_explain_content for reviewed word:", wordDataFromProfile.cached_explain_content);
        contentToLoad.explain = wordDataFromProfile.cached_explain_content;
        explainAvailableInCache = true;
    }
    
    setGeneratedContents(contentToLoad); // Set this first

    if (Object.keys(contentToLoad).length > 0) {
        const newActiveMode = explainAvailableInCache ? 'explain' : (Object.keys(contentToLoad)[0] as ContentMode | undefined) || 'explain';
        setActiveMode(newActiveMode);
        setIsExplainGeneratedForCurrentWord(explainAvailableInCache); 
        setCurrentTutorWordIsFavorite(wordDataFromProfile?.is_favorite || false);
        setIsLoadingExplanation(false); 
        console.log("Loaded from cache for review. New activeMode:", newActiveMode, "GeneratedContents now:", contentToLoad);
    } else {
        console.log("No cache found for reviewed word, fetching 'explain'.");
        // Call generateContent, but isExplicitNewSubmission is false as it's a review context setup
        generateContent(wordFromStreak, 'explain', false); 
    }
    // IMPORTANT: DO NOT modify currentStreak here. This is just a review.
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
    const wordToToggle = currentDisplayWordRef.current || inputQuestion.trim(); // Use current display word
    if (!user || !wordToToggle || !isExplainGeneratedForCurrentWord) return;

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
          const updatedExplored = prev.explored_words_list.map(w => w.word.toLowerCase().trim() === wordToToggle.toLowerCase() ? { ...w, is_favorite: newFavoriteStatus } : w);
          return { ...prev, explored_words_list: updatedExplored, favorite_words_list: updatedExplored.filter(w => w.is_favorite) };
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
    if (!wordEntry) { console.error("Word not found for toggling favorite."); return; }
    const originalWord = wordEntry.word;
    const newFavoriteStatus = !currentIsFavorite;

    try {
      const response = await fetch(`${API_BASE_URL}/toggle_favorite`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ word: originalWord, is_favorite: newFavoriteStatus }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to toggle favorite in profile');
      
      setProfileData(prev => {
        if (!prev) return null;
        const updatedList = prev.explored_words_list.map(w => w.id === wordIdSanitized ? { ...w, is_favorite: newFavoriteStatus } : w);
        return { ...prev, explored_words_list: updatedList, favorite_words_list: updatedList.filter(w => w.is_favorite) };
      });
      if ((currentDisplayWordRef.current || inputQuestion.trim()).toLowerCase() === originalWord.toLowerCase()) {
        setCurrentTutorWordIsFavorite(newFavoriteStatus);
      }
    } catch (error) {
      console.error("Error toggling favorite from profile:", error);
      alert(`Failed to update favorite: ${(error as Error).message}`);
    }
  };

  const handleWordClickFromProfile = (word: string, cachedContent?: Partial<GeneratedContent>) => {
    setInputQuestion(word); // Update input field
    currentDisplayWordRef.current = word; // Set display context
    isReviewingStreakWordRef.current = false; // Clicking from profile is a new context, not review
    handleEndStreak("Clicked from profile"); // End any existing streak

    if (cachedContent && Object.keys(cachedContent).length > 0) {
      setGeneratedContents(cachedContent);
      const defaultMode = cachedContent.explain ? 'explain' : (Object.keys(cachedContent)[0] as ContentMode | undefined) || 'explain';
      setActiveMode(defaultMode);
      setIsExplainGeneratedForCurrentWord(!!cachedContent.explain);
      lastSubmittedQuestionRef.current = word; // This is a new submission context
      setCurrentStreak({ words: [word], score: 1 }); // Start new streak
    } else {
      generateContent(word, 'explain', true); // Fetch if no cache, isExplicitNewSubmission = true
    }
    setShowProfileModal(false);
  };
  
  const modeIcons: Record<ContentMode, React.ElementType> = {
    explain: Lightbulb,
    fact: CheckSquare,
    quiz: HelpCircle,
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col items-center p-4 transition-colors duration-300 font-sans">
      <header className="w-full max-w-3xl mb-6 flex justify-between items-center">
        <h1 className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">Tiny Tutor</h1>
        <div className="space-x-2">
          {user ? (
            <>
              <span className="text-sm hidden sm:inline mr-2">Welcome, {user.username}!</span>
              <button onClick={handleOpenProfileModal} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600 transition-colors">Profile</button>
              <button onClick={() => { handleEndStreak("Logout"); logout(); }} className="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-100 rounded-md hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:text-indigo-200 dark:bg-indigo-700 dark:hover:bg-indigo-800 transition-colors">Logout</button>
            </>
          ) : (
            <button onClick={() => { setAuthModalMode('login'); setShowAuthModal(true); }} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600 transition-colors">Login / Sign Up</button>
          )}
        </div>
      </header>

      <main className="w-full max-w-3xl bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-lg shadow-xl">
        <div className="mb-6">
          <label htmlFor="conceptInput" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Enter a word or concept:</label>
          <div className="relative">
            <input type="text" id="conceptInput" value={inputQuestion} onChange={handleInputChange} placeholder="e.g., Photosynthesis" className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-gray-100 text-lg" />
            {inputQuestion && (<button onClick={() => { setInputQuestion(''); setGeneratedContents({}); setIsExplainGeneratedForCurrentWord(false); setAiError(null); setCurrentTutorWordIsFavorite(false); if(!isReviewingStreakWordRef.current) handleEndStreak("Input cleared by X"); lastSubmittedQuestionRef.current = null; currentDisplayWordRef.current = null;}} className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl p-1" aria-label="Clear input"><X size={24}/></button>)}
          </div>
        </div>

        <button onClick={handleGenerateClick} disabled={isLoadingExplanation || !inputQuestion.trim() || !user} className="w-full sm:w-auto bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-md focus:outline-none focus:shadow-outline disabled:opacity-50 transition duration-150 ease-in-out mb-4 text-lg">
          {isLoadingExplanation && generatedContents.explain && currentDisplayWordRef.current === inputQuestion ? 'Refreshing...' : (isLoadingExplanation ? 'Generating...' : 'Generate Explanation')}
        </button>

        {user && inputQuestion.trim() && (currentDisplayWordRef.current || isExplainGeneratedForCurrentWord) && ( // Show toggles if there's a display word or explain is generated
          <div className="my-6 p-4 bg-gray-100 dark:bg-gray-700/50 rounded-lg shadow">
            <div className="flex flex-wrap items-center gap-3">
              {AVAILABLE_MODES.map((mode) => {
                const Icon = modeIcons[mode];
                return (
                <button 
                    key={mode} 
                    onClick={() => handleModeToggle(mode)} 
                    disabled={isLoadingExplanation || (mode !== 'explain' && !isExplainGeneratedForCurrentWord && !generatedContents.explain)} 
                    className={`flex items-center space-x-2 px-4 py-2 text-sm font-medium rounded-full shadow-sm transition-all duration-200 ease-in-out transform hover:scale-105
                        ${activeMode === mode 
                            ? 'bg-indigo-600 text-white ring-2 ring-indigo-400 dark:ring-indigo-500' 
                            : 'bg-white text-gray-700 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600 border border-gray-300 dark:border-gray-600'} 
                        ${(isLoadingExplanation || (mode !== 'explain' && !isExplainGeneratedForCurrentWord && !generatedContents.explain)) ? 'opacity-60 cursor-not-allowed hover:scale-100' : ''}`}
                >
                  <Icon size={16} className={`${activeMode === mode ? 'text-white' : 'text-indigo-500 dark:text-indigo-400'}`} />
                  <span>{mode.charAt(0).toUpperCase() + mode.slice(1)}</span>
                </button>
              )})}
              {(isExplainGeneratedForCurrentWord || generatedContents.explain) && ( // Show refresh/fav if explain content is available for current display word
                <>
                  <button onClick={handleRefreshContent} disabled={isLoadingExplanation} className="p-2 text-gray-600 hover:text-indigo-600 dark:text-gray-300 dark:hover:text-indigo-400 rounded-full focus:outline-none disabled:opacity-60 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors" title="Refresh content">
                    <RefreshCw size={20}/>
                  </button>
                  <button onClick={handleToggleFavoriteOnTutorPage} disabled={isLoadingExplanation} className={`p-2 rounded-full transition-colors duration-150 focus:outline-none disabled:opacity-60 hover:bg-red-100 dark:hover:bg-red-900/50 ${currentTutorWordIsFavorite ? 'text-red-500' : 'text-gray-400 hover:text-red-400'}`} title={currentTutorWordIsFavorite ? 'Unfavorite' : 'Favorite'}>
                    <Heart size={20} fill={currentTutorWordIsFavorite ? 'currentColor' : 'none'}/>
                  </button>
                </>
              )}
            </div>
            {currentStreak.score >= 2 && (
              <div className="mt-4 pt-3 border-t border-gray-200 dark:border-gray-600 text-sm font-medium text-purple-600 dark:text-purple-400">
                <span className="font-semibold">Streak: {currentStreak.score}</span> (
                {currentStreak.words.map((word, index) => (
                  <React.Fragment key={index}>
                    <button
                      onClick={() => handleReviewStreakWordClick(word)}
                      className="hover:underline focus:outline-none disabled:no-underline disabled:text-gray-500 dark:disabled:text-gray-400 px-1"
                      disabled={isLoadingExplanation || (word === inputQuestion && isReviewingStreakWordRef.current)}
                    >
                      {word}
                    </button>
                    {index < currentStreak.words.length - 1 && <span className="mx-0.5">→</span>}
                  </React.Fragment>
                ))}
                )
              </div>
            )}
          </div>
        )}

        {aiError && (<div className="mt-4 p-3 bg-red-100 dark:bg-red-800 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 rounded-md text-sm"><p><strong>Error:</strong> {aiError}</p></div>)}
        {isLoadingExplanation && !generatedContents[activeMode] && (<div className="mt-6 flex justify-center items-center h-32"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div></div>)}
        
        {/* Display content if available for the active mode and current display word */}
        {currentDisplayWordRef.current && generatedContents[activeMode] && (
          <div className="mt-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-750 shadow-inner">
            <div className="prose dark:prose-invert max-w-none">
              {activeMode === 'explain' && generatedContents.explain ? (
                <HighlightedContentRenderer text={generatedContents.explain} onWordClick={handleWordClickFromExplanation} />
              ) : (
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{generatedContents[activeMode]}</p>
              )}
            </div>
          </div>
        )}
      </main>

      <AuthModal isOpen={showAuthModal} onClose={() => setShowAuthModal(false)} initialMode={authModalMode} />
      <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} profileData={profileData} isLoading={isLoadingProfile} error={profileError} onWordClick={handleWordClickFromProfile} onToggleFavorite={handleToggleFavoriteInProfile} />
    </div>
  );
};

function App() {
  return (<AuthProvider><TinyTutorAppContent /></AuthProvider>);
}

export default App;

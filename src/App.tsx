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
  signup: (usernameInput: string, emailInput: string, passwordInput: string) => Promise<boolean>;
  logout: () => void;
  getAuthHeaders: () => Record<string, string>;
}

interface GeneratedContent {
  explain?: string;
  image?: string;
  fact?: string;
  quiz?: string[]; // Expecting an array of quiz strings from backend
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

interface QuizOption {
  key: string;
  text: string;
}
interface ParsedQuiz {
  question: string;
  options: QuizOption[];
  correctAnswerKey: string;
}


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

  const signup = async (usernameInput: string, emailInput: string, passwordInput: string): Promise<boolean> => {
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
      console.log('Signup successful! User should now login.');
      return true;
    } catch (error: any) {
      console.error('Signup failed:', error);
       if (error instanceof TypeError && error.message === "Failed to fetch") {
        setAuthError("Failed to connect to the server. Please check your internet connection or try again later.");
      } else {
        setAuthError(error.message || 'Signup failed. Please try again.');
      }
      return false;
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
  const [signupSuccessMessage, setSignupSuccessMessage] = useState<string | null>(null);


  useEffect(() => {
    setMode(initialMode); setUsername(''); setEmail(''); setPassword(''); setSignupSuccessMessage(null);
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
    setSignupSuccessMessage(null);
    if (mode === 'login') {
        await login(username, password);
    } else {
        const success = await signup(username, email, password);
        if (success) {
            setSignupSuccessMessage("Signup successful! Please login.");
            setMode('login');
            setEmail('');
            setPassword('');
        }
    }
  };

  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-md relative">
        <button onClick={onClose} className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl" aria-label="Close">&times;</button>
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800 dark:text-gray-100">{mode === 'login' ? 'Login' : 'Sign Up'}</h2>
        {authError && <p className="bg-red-100 dark:bg-red-700 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-100 px-4 py-3 rounded relative mb-4 text-sm" role="alert">{authError}</p>}
        {signupSuccessMessage && <p className="bg-green-100 dark:bg-green-700 border border-green-400 dark:border-green-600 text-green-700 dark:text-green-100 px-4 py-3 rounded relative mb-4 text-sm" role="alert">{signupSuccessMessage}</p>}
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
          {mode === 'login' ? (<>Need an account? <button onClick={() => {setMode('signup'); setAuthError(null); setSignupSuccessMessage(null);}} className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">Sign Up</button></>) : (<>Already have an account? <button onClick={() => {setMode('login'); setAuthError(null); setSignupSuccessMessage(null);}} className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300">Login</button></>)}
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

interface CompactWordListItemProps {
  item: ExploredWord;
  onWordClick: () => void;
  onToggleFavorite: () => Promise<void>;
  isFavoriteList?: boolean;
}

const CompactWordListItem: React.FC<CompactWordListItemProps> = ({ item, onWordClick, onToggleFavorite, isFavoriteList }) => {
  const [isToggling, setIsToggling] = useState(false);

  const handleToggleFavoriteInternal = async (event: React.MouseEvent) => {
    event.stopPropagation();
    setIsToggling(true);
    try {
      await onToggleFavorite();
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

// --- InteractiveQuiz Component ---
interface InteractiveQuizProps {
  quizText: string;
  onLoadNextQuestion: () => void;
  onQuestionAnswered: (isCorrect: boolean) => void; // New prop
  canLoadNext: boolean;
  questionNumber: number;
  totalQuestionsInSet: number; // Total questions available in the current set for the word
}

const InteractiveQuiz: React.FC<InteractiveQuizProps> = ({ quizText, onLoadNextQuestion, onQuestionAnswered, canLoadNext, questionNumber, totalQuestionsInSet }) => {
  const [parsedQuiz, setParsedQuiz] = useState<ParsedQuiz | null>(null);
  const [selectedOptionKey, setSelectedOptionKey] = useState<string | null>(null);
  const [isAnswered, setIsAnswered] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string>('');

  useEffect(() => {
    setSelectedOptionKey(null);
    setIsAnswered(false);
    setFeedbackMessage('');

    const parseQuiz = (text: string): ParsedQuiz | null => {
      if (!text || typeof text !== 'string' || text.trim().length < 10 || !text.toLowerCase().includes('question:') || !text.toLowerCase().includes('correct:')) {
        console.error("InteractiveQuiz: Invalid or incomplete quiz text received:", text);
        return null;
      }
      const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
      let question = '';
      const options: QuizOption[] = [];
      let correctAnswerKey = '';
      const qLine = lines.find(line => line.toLowerCase().startsWith('question:'));
      if (qLine) question = qLine.substring(qLine.indexOf(':') + 1).trim();
      const optionRegex = /^([A-Da-d])\)\s*(.*)/;
      lines.forEach(line => {
        const optionMatch = line.match(optionRegex);
        if (optionMatch && optionMatch[1] && optionMatch[2]) options.push({ key: optionMatch[1].toUpperCase(), text: optionMatch[2].trim() });
      });
      const correctLine = lines.find(line => line.toLowerCase().startsWith('correct:'));
      if (correctLine) {
        const correctMatch = correctLine.match(/Correct:\s*([A-Da-d])\.?/i);
        if (correctMatch && correctMatch[1]) correctAnswerKey = correctMatch[1].toUpperCase();
      }
      if (question && options.length >= 2 && correctAnswerKey && options.some(opt => opt.key === correctAnswerKey)) {
        return { question, options, correctAnswerKey };
      }
      console.error("InteractiveQuiz: Failed to parse quiz string or insufficient data after initial checks:", text, {question, options, correctAnswerKey});
      return null;
    };
    setParsedQuiz(parseQuiz(quizText));
  }, [quizText]);

  const handleOptionSelect = (optionKey: string) => {
    if (isAnswered || !parsedQuiz) return;
    setSelectedOptionKey(optionKey);
    setIsAnswered(true);
    const isCorrect = optionKey === parsedQuiz.correctAnswerKey;
    onQuestionAnswered(isCorrect); // Notify parent about the answer

    if (isCorrect) {
      setFeedbackMessage('Correct Answer!');
    } else {
      const correctOption = parsedQuiz.options.find(opt => opt.key === parsedQuiz.correctAnswerKey);
      setFeedbackMessage(`Wrong Answer. The correct answer was ${parsedQuiz.correctAnswerKey}) ${correctOption?.text || ''}`);
    }
  };

  if (!parsedQuiz) {
    return <p className="text-red-500 dark:text-red-400">Could not load quiz. The data might be missing or in an incorrect format.</p>;
  }

  return (
    <div className="space-y-4">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
        Quiz Question {questionNumber} of {totalQuestionsInSet}: {parsedQuiz.question}
      </h3>
      <div className="space-y-2">
        {parsedQuiz.options.map((option) => {
          const isSelected = selectedOptionKey === option.key;
          const isCorrect = option.key === parsedQuiz.correctAnswerKey;
          let buttonClass = "w-full text-left p-3 border rounded-md transition-all duration-150 flex justify-between items-center ";
          if (isAnswered) {
            if (isCorrect) buttonClass += "bg-green-100 dark:bg-green-700 border-green-500 dark:border-green-400 text-green-700 dark:text-green-200 font-semibold";
            else if (isSelected && !isCorrect) buttonClass += "bg-red-100 dark:bg-red-700 border-red-500 dark:border-red-400 text-red-700 dark:text-red-200";
            else buttonClass += "bg-gray-100 dark:bg-gray-600 border-gray-300 dark:border-gray-500 text-gray-700 dark:text-gray-300 cursor-not-allowed opacity-70";
          } else {
            buttonClass += "bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-500 hover:bg-indigo-50 dark:hover:bg-indigo-900 hover:border-indigo-300 dark:hover:border-indigo-700";
          }
          return (
            <button key={option.key} onClick={() => handleOptionSelect(option.key)} disabled={isAnswered} className={buttonClass}>
              <span>{option.key}) {option.text}</span>
              {isAnswered && isCorrect && <span className="text-green-600 dark:text-green-300 text-xl ml-2">✓</span>}
              {isAnswered && isSelected && !isCorrect && <span className="text-red-600 dark:text-red-300 text-xl ml-2">✗</span>}
            </button>
          );
        })}
      </div>
      {isAnswered && (
        <div className="mt-3 text-center">
            <p className={`text-sm font-semibold mb-3 ${selectedOptionKey === parsedQuiz.correctAnswerKey ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
            {feedbackMessage}
            </p>
            {canLoadNext && (
            <button onClick={onLoadNextQuestion} className="bg-indigo-500 hover:bg-indigo-600 text-white font-semibold py-2 px-4 rounded-md transition-colors">
                Next Question ({questionNumber + 1} of {totalQuestionsInSet})
            </button>
            )}
            {!canLoadNext && ( <p className="text-sm text-gray-600 dark:text-gray-400">You've completed all questions for this word!</p> )}
        </div>
      )}
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
  
  // State for multi-quiz feature & scoring
  const [currentQuizDisplayIndex, setCurrentQuizDisplayIndex] = useState<number>(0); // 0-indexed for the current quiz in the set
  const [quizSessionScores, setQuizSessionScores] = useState<boolean[]>([]); // Stores true/false for each answered quiz in the current set

  const resetQuizState = () => {
    setCurrentQuizDisplayIndex(0);
    setQuizSessionScores([]);
  };

  const fetchProfileDataSilently = useCallback(async (force: boolean = false) => { /* ... same ... */ 
    if (!user || (isLoadingProfile && !force)) return;
    if (!force && profileData && profileData.username === user.username) return;
    setIsLoadingProfile(true);
    try {
      const response = await fetch(`${API_BASE_URL}/profile`, { method: 'GET', headers: getAuthHeaders() });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to fetch profile');
      setProfileData(data);
      setProfileError(null);
    } catch (error: any) { console.error('Silent profile fetch failed:', error); } finally { setIsLoadingProfile(false); }
  }, [user, getAuthHeaders, isLoadingProfile, profileData]);

  useEffect(() => { /* ... same ... */ 
    if (user && (!profileData || profileData.username !== user.username)) {
        fetchProfileDataSilently(true);
    }
  }, [user, profileData, fetchProfileDataSilently]);
  useEffect(() => { /* ... same ... */ 
    if (user && showAuthModal) setShowAuthModal(false);
  }, [user, showAuthModal]);
  useEffect(() => { /* ... same ... */ 
    const wordForFavoriteCheck = isReviewingStreakWordRef.current ? inputQuestion : lastSubmittedQuestionRef.current;
    if (wordForFavoriteCheck && profileData?.explored_words_list) {
      const foundWord = profileData.explored_words_list.find(w => w.word.toLowerCase().trim() === wordForFavoriteCheck.toLowerCase().trim());
      setCurrentTutorWordIsFavorite(foundWord ? foundWord.is_favorite : false);
    } else { setCurrentTutorWordIsFavorite(false); }
  }, [inputQuestion, lastSubmittedQuestionRef.current, isReviewingStreakWordRef.current, profileData, activeMode]);

  const handleEndStreak = useCallback(async (reason: string, streakToSave?: Streak) => { /* ... same ... */ 
    const streak = streakToSave || currentStreak;
    console.log(`Streak end. Reason: ${reason}. Score: ${streak.score}, Words: ${streak.words.join(', ')}`);
    if (user && streak.words.length > 0 && streak.score >= 2) {
      try {
        const response = await fetch(`${API_BASE_URL}/save_streak`, { method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ words: streak.words, score: streak.score }), });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Failed to save streak');
        setProfileData(prev => {
          const newStreakEntry: Streak = { words: [...streak.words], score: streak.score, completed_at: new Date().toISOString(), id: result.streak_id || `temp-${Date.now()}` };
          if (!prev) { return { username: user.username, tier: user.tier, explored_words_count: 0, explored_words_list: [], favorite_words_list: [], streak_history: [newStreakEntry] }; }
          const existingHistory = Array.isArray(prev.streak_history) ? prev.streak_history : [];
          return { ...prev, streak_history: [newStreakEntry, ...existingHistory] };
        });
      } catch (error) { console.error('Error saving streak:', error); setAiError(`Could not save streak: ${(error as Error).message}`); }
    }
     if (!streakToSave || (streakToSave.words.join(',') === currentStreak.words.join(',') && streakToSave.score === currentStreak.score)) { setCurrentStreak({ words: [], score: 0 }); }
    isReviewingStreakWordRef.current = false;
  }, [user, currentStreak, getAuthHeaders]);

  const generateContent = async ( question: string, mode: ContentMode, options: { isNewPrimaryFocus?: boolean; triggeredBy?: 'generate_btn' | 'refresh_btn' | 'sub_topic_click' | 'profile_click' | 'mode_toggle' | 'review_click' | 'past_streak_click'; isReview?: boolean; preserveCurrentStreak?: boolean; } = {} ) => { 
    const { isNewPrimaryFocus = false, triggeredBy = 'mode_toggle', isReview = false, preserveCurrentStreak = false, } = options;
    const forceRefresh = triggeredBy === 'refresh_btn';
    if (!user) { setAuthModalMode('login'); setShowAuthModal(true); setAiError("Please login to generate content."); return; }
    if (!question.trim()) { setAiError("Please enter a word or concept."); return; }
    setIsLoadingExplanation(true); setAiError(null);
    isReviewingStreakWordRef.current = isReview;
    if (isNewPrimaryFocus) {
        if (!preserveCurrentStreak && (lastSubmittedQuestionRef.current?.toLowerCase() !== question.toLowerCase() || forceRefresh) && !isReview) {
            await handleEndStreak(forceRefresh ? `Refresh for ${question}` : `New primary focus: ${question}`, currentStreak);
        }
        lastSubmittedQuestionRef.current = question;
        setGeneratedContents({}); 
        resetQuizState(); // Reset quiz state for new primary focus
    }
    try {
      const response = await fetch(`${API_BASE_URL}/generate_explanation`, { method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ question, mode, force_refresh: forceRefresh }), });
      const data = await response.json(); 
      if (!response.ok) {
        if (data.full_cache) setGeneratedContents(data.full_cache);
        else setGeneratedContents({});
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }
      setGeneratedContents(data.full_cache || {});
      setActiveMode(mode);
      if (mode === 'quiz' && data.full_cache?.quiz) { 
        resetQuizState(); // Reset for newly fetched quiz set
      }
      if (isNewPrimaryFocus && mode === 'explain' && data.source === 'generated') { fetchProfileDataSilently(true); } 
      else if (user && !profileData && !isLoadingProfile) { fetchProfileDataSilently(); }
      const wordForFavoriteCheck = isReviewingStreakWordRef.current ? inputQuestion : lastSubmittedQuestionRef.current;
      if (wordForFavoriteCheck && profileData?.explored_words_list) {
        const foundWord = profileData.explored_words_list.find(w => w.word.toLowerCase().trim() === wordForFavoriteCheck.toLowerCase().trim());
        setCurrentTutorWordIsFavorite(foundWord ? foundWord.is_favorite : false);
      }
    } catch (error: any) { console.error(`Error generating ${mode} for ${question}:`, error); setAiError(error.message || `Failed to generate ${mode}.`); } 
    finally { setIsLoadingExplanation(false); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { setInputQuestion(e.target.value); };
  const handleGenerateClick = () => { 
    if (inputQuestion.trim() && user) {
      isReviewingStreakWordRef.current = false;
      handleEndStreak("Generate Explanation button clicked", currentStreak);
      setCurrentStreak({ words: [inputQuestion.trim()], score: 1 });
      resetQuizState();
      generateContent(inputQuestion.trim(), 'explain', { isNewPrimaryFocus: true, triggeredBy: 'generate_btn' });
    } else if (!user) { setAuthModalMode('login'); setShowAuthModal(true); }
  };
  const handleRefreshContent = () => { 
    const questionToRefresh = isReviewingStreakWordRef.current ? inputQuestion : lastSubmittedQuestionRef.current;
    if (questionToRefresh && activeMode && user) {
      if (activeMode === 'quiz') { resetQuizState(); } // Reset quiz state on refresh
      if (isReviewingStreakWordRef.current) { generateContent(questionToRefresh, activeMode, { isNewPrimaryFocus: false, triggeredBy: 'refresh_btn', isReview: true, preserveCurrentStreak: true }); } 
      else { generateContent(questionToRefresh, activeMode, { isNewPrimaryFocus: true, triggeredBy: 'refresh_btn', preserveCurrentStreak: true }); }
    } else if (!user) { setAuthModalMode('login'); setShowAuthModal(true); }
  };
  
  const handleModeToggle = (newMode: ContentMode) => { 
    const currentQuestionForModes = isReviewingStreakWordRef.current ? inputQuestion : lastSubmittedQuestionRef.current;
    if (!currentQuestionForModes || !user) { if (!user) { setAuthModalMode('login'); setShowAuthModal(true); } return; }
    setAiError(null); 
    const oldActiveMode = activeMode;
    setActiveMode(newMode);
    if (newMode === 'quiz' && oldActiveMode !== 'quiz') { 
        resetQuizState(); // Reset quiz state when switching to quiz mode
    }
    const contentIsMissing = newMode === 'quiz' ? !generatedContents.quiz : !generatedContents[newMode];
    const reviewContentMissing = isReviewingStreakWordRef.current && contentIsMissing;
    if (contentIsMissing || reviewContentMissing) {
      generateContent(currentQuestionForModes, newMode, { isNewPrimaryFocus: false, triggeredBy: 'mode_toggle', preserveCurrentStreak: true, isReview: isReviewingStreakWordRef.current });
    } else if (newMode === 'quiz' && generatedContents.quiz && oldActiveMode !== 'quiz') {
        resetQuizState(); // Also reset if data is there but we just switched
    }
  };
  
  const handleQuizQuestionAnswered = (isCorrect: boolean) => {
    setQuizSessionScores(prevScores => [...prevScores, isCorrect]);
  };

  const handleLoadNextQuizQuestion = () => {
    if (generatedContents.quiz && currentQuizDisplayIndex < generatedContents.quiz.length - 1) {
        setCurrentQuizDisplayIndex(prevIndex => prevIndex + 1);
    }
  };

  const handleWordClickFromExplanation = (clickedWord: string) => { 
    if (!user) { setAuthModalMode('login'); setShowAuthModal(true); return; }
    const currentFocusWord = lastSubmittedQuestionRef.current;
    isReviewingStreakWordRef.current = false;
    setInputQuestion(clickedWord);
    resetQuizState(); 
    if (!currentFocusWord) {
        handleEndStreak("Sub-topic click with no prior focus (edge case)", currentStreak);
        setCurrentStreak({ words: [clickedWord], score: 1 });
        generateContent(clickedWord, 'explain', { isNewPrimaryFocus: true, triggeredBy: 'sub_topic_click' });
        return;
    }
    setCurrentStreak(prevStreak => { 
        if (prevStreak.words.length === 0 || (prevStreak.words.length > 0 && prevStreak.words[prevStreak.words.length - 1].toLowerCase() !== currentFocusWord.toLowerCase())) {
            if (prevStreak.score >= 2) { handleEndStreak(`Starting new streak branch from ${currentFocusWord}. Old streak was ${prevStreak.words.join('->')}`, prevStreak); }
            return { words: [currentFocusWord, clickedWord], score: 2 };
        } else { if (prevStreak.words[prevStreak.words.length - 1].toLowerCase() !== clickedWord.toLowerCase()) { return { words: [...prevStreak.words, clickedWord], score: prevStreak.score + 1 }; } }
        return prevStreak;
    });
    generateContent(clickedWord, 'explain', { isNewPrimaryFocus: true, triggeredBy: 'sub_topic_click', preserveCurrentStreak: true });
  };
  const handleWordClickFromProfile = (word: string, cachedContentComplete?: Partial<GeneratedContent>) => { 
    if (!user) { setAuthModalMode('login'); setShowAuthModal(true); return; }
    isReviewingStreakWordRef.current = false;
    setInputQuestion(word); setAiError(null);
    resetQuizState();
    handleEndStreak("Clicked word from profile", currentStreak);
    setCurrentStreak({ words: [word], score: 1 });
    const initialModeToLoad = cachedContentComplete?.explain ? 'explain' : (Object.keys(cachedContentComplete || {})[0] as ContentMode | undefined) || 'explain';
    if (cachedContentComplete && Object.keys(cachedContentComplete).length > 0) {
      setGeneratedContents(cachedContentComplete);
      setActiveMode(initialModeToLoad);
      generateContent(word, initialModeToLoad, {isNewPrimaryFocus: true, triggeredBy: 'profile_click', preserveCurrentStreak: true}); 
    } else { generateContent(word, 'explain', {isNewPrimaryFocus: true, triggeredBy: 'profile_click', preserveCurrentStreak: true}); }
    setShowProfileModal(false);
  };
  const handleReviewStreakWordClick = (wordFromStreak: string) => { 
    if (!user) { setAuthModalMode('login'); setShowAuthModal(true); return; }
    if (isReviewingStreakWordRef.current && inputQuestion.toLowerCase() === wordFromStreak.toLowerCase()) return;
    setInputQuestion(wordFromStreak);
    isReviewingStreakWordRef.current = true;
    setAiError(null);
    resetQuizState();
    const wordData = profileData?.explored_words_list.find(w => w.word.toLowerCase().trim() === wordFromStreak.toLowerCase().trim());
    const cachedContentsForWord = wordData?.generated_content_cache;
    if (cachedContentsForWord && Object.keys(cachedContentsForWord).length > 0) {
        setGeneratedContents(cachedContentsForWord); 
        const initialMode = cachedContentsForWord.explain ? 'explain' : (Object.keys(cachedContentsForWord)[0] as ContentMode | undefined) || 'explain';
        setActiveMode(initialMode);
        setCurrentTutorWordIsFavorite(wordData?.is_favorite || false);
        if (initialMode === 'quiz' && cachedContentsForWord.quiz) { resetQuizState(); }
    } else { generateContent(wordFromStreak, 'explain', { isNewPrimaryFocus: false, isReview: true, triggeredBy: 'review_click', preserveCurrentStreak: true }); }
  };
  const handlePastStreakWordClicked = (word: string) => { 
    if (!user) { setAuthModalMode('login'); setShowAuthModal(true); return; }
    setInputQuestion(word);
    isReviewingStreakWordRef.current = false;
    setAiError(null);
    resetQuizState();
    handleEndStreak("Clicked word from past streak history", currentStreak);
    setCurrentStreak({ words: [word], score: 1 });
    const wordData = profileData?.explored_words_list.find(w => w.word.toLowerCase().trim() === word.toLowerCase().trim());
    const initialModeToLoad = wordData?.generated_content_cache?.explain ? 'explain' : (Object.keys(wordData?.generated_content_cache || {})[0] as ContentMode | undefined) || 'explain';
    if (wordData?.generated_content_cache && Object.keys(wordData.generated_content_cache).length > 0) {
        setGeneratedContents(wordData.generated_content_cache);
        setActiveMode(initialModeToLoad);
        generateContent(word, initialModeToLoad, {isNewPrimaryFocus: true, triggeredBy: 'past_streak_click', preserveCurrentStreak: true});
    } else { generateContent(word, 'explain', {isNewPrimaryFocus: true, triggeredBy: 'past_streak_click', preserveCurrentStreak: true}); }
  };
  const handleOpenProfileModal = async () => { /* ... same ... */ if (!user) { setShowAuthModal(true); setAuthModalMode('login'); return; } setShowProfileModal(true); fetchProfileDataSilently(true); };
  const handleToggleFavoriteOnTutorPage = async () => { /* ... same ... */ const wordToToggle = isReviewingStreakWordRef.current ? inputQuestion : lastSubmittedQuestionRef.current; if (!wordToToggle || !user) return; const newFavoriteStatus = !currentTutorWordIsFavorite; setCurrentTutorWordIsFavorite(newFavoriteStatus); setProfileData(prev => { if (!prev) return null; const listToUpdate = prev.explored_words_list.map(w => w.word.toLowerCase() === wordToToggle.toLowerCase() ? { ...w, is_favorite: newFavoriteStatus } : w ); return { ...prev, explored_words_list: listToUpdate, favorite_words_list: listToUpdate.filter(w => w.is_favorite).sort((a,b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime()) }; }); try { const response = await fetch(`${API_BASE_URL}/toggle_favorite`, { method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ word: wordToToggle, is_favorite: newFavoriteStatus }), }); const data = await response.json(); if (!response.ok) { setCurrentTutorWordIsFavorite(!newFavoriteStatus); setProfileData(prev => { if (!prev) return null; const listToRevert = prev.explored_words_list.map(w => w.word.toLowerCase() === wordToToggle.toLowerCase() ? { ...w, is_favorite: !newFavoriteStatus } : w ); return { ...prev, explored_words_list: listToRevert, favorite_words_list: listToRevert.filter(w => w.is_favorite).sort((a,b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime()) }; }); throw new Error(data.error || 'Failed to toggle favorite'); } } catch (error) { console.error("Error toggling favorite:", error); setAiError(`Could not toggle favorite for "${wordToToggle}": ${(error as Error).message}`); } };
  const handleToggleFavoriteInProfile = async (wordId: string, isCurrentlyFavorite: boolean) => { /* ... same ... */ const wordEntry = profileData?.explored_words_list.find(w => w.id === wordId); if (!wordEntry || !user) return; const originalWord = wordEntry.word; const newFavoriteStatus = !isCurrentlyFavorite; setProfileData(prev => { if (!prev) return null; const updatedList = prev.explored_words_list.map(w => w.id === wordId ? { ...w, is_favorite: newFavoriteStatus } : w); return { ...prev, explored_words_list: updatedList, favorite_words_list: updatedList.filter(w => w.is_favorite).sort((a,b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime()) }; }); const currentTutorDisplayWord = isReviewingStreakWordRef.current ? inputQuestion : lastSubmittedQuestionRef.current; if (currentTutorDisplayWord?.toLowerCase() === originalWord.toLowerCase()) { setCurrentTutorWordIsFavorite(newFavoriteStatus); } try { const response = await fetch(`${API_BASE_URL}/toggle_favorite`, { method: 'POST', headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ word: originalWord, is_favorite: newFavoriteStatus }), }); const data = await response.json(); if (!response.ok) {  setProfileData(prev => { if (!prev) return null; const revertedList = prev.explored_words_list.map(w => w.id === wordId ? { ...w, is_favorite: isCurrentlyFavorite } : w); return { ...prev, explored_words_list: revertedList, favorite_words_list: revertedList.filter(w => w.is_favorite).sort((a,b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime()) }; }); if (currentTutorDisplayWord?.toLowerCase() === originalWord.toLowerCase()) { setCurrentTutorWordIsFavorite(isCurrentlyFavorite); } throw new Error(data.error || 'Failed to toggle favorite in profile'); } } catch (error) { console.error("Error toggling favorite from profile:", error); setAiError(`Failed to update favorite for "${originalWord}" from profile: ${(error as Error).message}`); } };
  
  // Calculate quiz score
  const correctQuizAnswers = quizSessionScores.filter(score => score).length;
  const totalQuizzesInSet = generatedContents.quiz?.length || 0;
  const quizScoreDisplay = totalQuizzesInSet > 0 ? `Score: ${correctQuizAnswers}/${quizSessionScores.length} (out of ${totalQuizzesInSet} available)` : '';


  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col items-center p-4 transition-colors duration-300">
      <header className="w-full max-w-3xl mb-6 flex justify-between items-center">
        <h1 className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">Tiny Tutor</h1>
        <div className="space-x-2">
          {user ? (
            <>
              <span className="text-sm hidden sm:inline">Welcome, {user.username}!</span>
              <button onClick={handleOpenProfileModal} className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600">Profile</button>
              <button onClick={() => { handleEndStreak("Logout", currentStreak); logout(); setGeneratedContents({}); setInputQuestion(''); lastSubmittedQuestionRef.current = null; setAiError(null); setCurrentStreak({ words: [], score: 0 }); isReviewingStreakWordRef.current = false; setProfileData(null); resetQuizState();}} className="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-100 rounded-md hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:text-indigo-200 dark:bg-indigo-700 dark:hover:bg-indigo-800">Logout</button>
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

        <button 
          onClick={handleGenerateClick} 
          disabled={isLoadingExplanation || !inputQuestion.trim() || (!user && !inputQuestion.trim())} 
          className="w-full sm:w-auto bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-md focus:outline-none focus:shadow-outline disabled:opacity-50 transition duration-150 ease-in-out mb-4 text-lg"
        >
           {isLoadingExplanation && (isReviewingStreakWordRef.current ? inputQuestion.toLowerCase() : lastSubmittedQuestionRef.current?.toLowerCase()) === inputQuestion.toLowerCase().trim() ? 'Generating...' : 'Generate Explanation'}
        </button>

        {user && (lastSubmittedQuestionRef.current || isReviewingStreakWordRef.current) && (
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
              {(isReviewingStreakWordRef.current ? inputQuestion : lastSubmittedQuestionRef.current) && 
               (activeMode === 'quiz' ? generatedContents.quiz?.[currentQuizDisplayIndex] : generatedContents[activeMode]) && (
                <button onClick={handleToggleFavoriteOnTutorPage} disabled={isLoadingExplanation} className={`p-1.5 rounded-full transition-colors duration-150 focus:outline-none disabled:opacity-50 ${currentTutorWordIsFavorite ? 'text-red-500 hover:text-red-600' : 'text-gray-400 hover:text-red-400'}`} title={currentTutorWordIsFavorite ? 'Unfavorite' : 'Favorite'}>
                    {currentTutorWordIsFavorite ? '♥' : '♡'}
                </button>
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
            {/* Quiz Score Display */}
            {activeMode === 'quiz' && totalQuizzesInSet > 0 && (
                <div className="mt-2 text-sm font-medium text-blue-600 dark:text-blue-400">
                    {quizScoreDisplay}
                </div>
            )}
          </div>
        )}

        {aiError && (<div className="mt-4 p-3 bg-red-100 dark:bg-red-800 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 rounded-md text-sm"><p><strong>Error:</strong> {aiError}</p></div>)}
        
        {(() => {
          const displayWord = isReviewingStreakWordRef.current ? inputQuestion : lastSubmittedQuestionRef.current;
          const currentQuizTextToShow = (activeMode === 'quiz' && generatedContents.quiz && Array.isArray(generatedContents.quiz) && generatedContents.quiz.length > currentQuizDisplayIndex) 
                                        ? generatedContents.quiz[currentQuizDisplayIndex] 
                                        : null;

          if (isLoadingExplanation && (!currentQuizTextToShow && activeMode ==='quiz') && 
              !(activeMode !== 'quiz' && generatedContents[activeMode]) && 
              displayWord) {
            return <div className="mt-6 flex justify-center items-center h-32"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div></div>;
          }

          if (displayWord && !isLoadingExplanation) {
            if (activeMode === 'quiz') {
              if (currentQuizTextToShow) {
                return (
                  <div className="mt-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 shadow">
                    <InteractiveQuiz
                      key={`${displayWord}-quiz-${currentQuizDisplayIndex}`}
                      quizText={currentQuizTextToShow}
                      onLoadNextQuestion={handleLoadNextQuizQuestion}
                      onQuestionAnswered={handleQuizQuestionAnswered}
                      canLoadNext={generatedContents.quiz ? currentQuizDisplayIndex < generatedContents.quiz.length - 1 : false}
                      questionNumber={currentQuizDisplayIndex + 1}
                      totalQuestionsInSet={generatedContents.quiz?.length || 0}
                    />
                  </div>
                );
              } else if (generatedContents.quiz === null || (Array.isArray(generatedContents.quiz) && generatedContents.quiz.length === 0)){
                 return ( <div className="mt-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 shadow">
                    <p className="text-gray-500 dark:text-gray-400">No quiz questions available for "{displayWord}".</p>
                </div>);
              } else if (isLoadingExplanation && !currentQuizTextToShow) { 
                return <div className="mt-6 flex justify-center items-center h-32"><div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div></div>;
              }
            } else if (generatedContents[activeMode]) {
              if (activeMode === 'explain' && generatedContents.explain) {
                return (
                  <div className="mt-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 shadow">
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-grow mr-2">
                        <HighlightedContentRenderer text={generatedContents.explain} onWordClick={handleWordClickFromExplanation} />
                      </div>
                      {(isReviewingStreakWordRef.current ? inputQuestion : lastSubmittedQuestionRef.current) && generatedContents.explain && (
                        <button onClick={handleRefreshContent} disabled={isLoadingExplanation} className="p-2 text-gray-600 hover:text-indigo-600 dark:text-gray-300 dark:hover:text-indigo-400 rounded-full focus:outline-none disabled:opacity-50 flex-shrink-0" title="Refresh explanation" >
                          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" /></svg>
                        </button>
                      )}
                    </div>
                  </div> );
              }
              return ( <div className="mt-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 shadow">
                  <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{generatedContents[activeMode]}</p>
                </div> );
            }
          }
          if (displayWord && !isLoadingExplanation && !generatedContents[activeMode] && !(activeMode === 'quiz' && generatedContents.quiz && Array.isArray(generatedContents.quiz) && generatedContents.quiz.length > 0) ) {
            return (
              <div className="mt-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 shadow">
                <p className="text-gray-500 dark:text-gray-400">Content for '{activeMode}' mode is not available for "{displayWord}".</p>
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

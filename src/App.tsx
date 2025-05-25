// src/App.tsx

import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  useRef,
  useCallback,
} from 'react';
import { jwtDecode } from 'jwt-decode'; // Correct import

// --- Constants ---
// const API_BASE_URL = 'http://127.0.0.1:5001'; // Local Flask dev
const API_BASE_URL = 'https://tiny-tutor-app.onrender.com'; // Deployed backend

// --- Types ---
interface User {
  username: string;
  email: string;
  tier: string;
  // Add other user properties if needed
}

interface DecodedToken extends User {
  exp: number;
  // Add other token properties if needed
}

interface AuthContextType {
  user: User | null;
  authLoadingGlobal: boolean; // Renamed for clarity
  authError: string | null; // Renamed for clarity
  login: (usernameOrEmailInput: string, passwordInput: string) => Promise<void>;
  signup: (usernameInput: string, emailInput: string, passwordInput: string) => Promise<void>;
  logout: () => void;
  getAuthHeaders: () => Record<string, string>; // Corrected type
}

interface GeneratedContent {
  explain?: string;
  image?: string;
  fact?: string;
  quiz?: string;
  deep?: string;
}

interface ExploredWord {
  id: string; // sanitized_word_id from backend
  word: string; // original word
  is_favorite: boolean;
  last_explored_at: string; // ISO string date
  cached_explain_content?: string;
  explicit_connections?: string[];
  modes_generated?: string[];
}

interface ProfileData {
  username: string;
  tier: string;
  explored_words_count: number;
  explored_words_list: ExploredWord[];
  favorite_words_list: ExploredWord[];
  streak_history: Streak[]; // Added for streak history
}

type ContentMode = 'explain' | 'image' | 'fact' | 'quiz' | 'deep';

interface Streak {
  id?: string; // Optional, if fetched from DB
  words: string[];
  score: number;
  completed_at?: string; // Optional, if fetched from DB
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
  const [authLoadingGlobal, setAuthLoadingGlobal] = useState<boolean>(true); // Start true to check token
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
          localStorage.removeItem('tinyTutorToken'); // Token expired
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

    // ADD THIS CONSOLE.LOG:
    console.log('Frontend attempting to login with:', {
      usernameOrEmail: usernameOrEmailInput,
      password: passwordInput,
    });

    try {
      const response = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernameOrEmail: usernameOrEmailInput, // Key should match backend expectation
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
      setAuthError(null); // Clear any previous errors
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
      // Optionally, log the user in directly after signup or prompt them to login
      setAuthError(null); // Clear any previous errors
      // For now, just show success, user can login separately
      alert('Signup successful! Please login.'); // Replace with a better notification
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
    // Potentially clear other app-specific states if needed
  };

  const getAuthHeaders = (): Record<string, string> => { // Ensure consistent return type
    const token = localStorage.getItem('tinyTutorToken');
    if (token) {
      return { Authorization: `Bearer ${token}` };
    }
    return {}; // Return empty object if no token
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
        if (index % 2 === 1) { // This is the content within <click> tags
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
        return <span key={index}>{part}</span>; // Regular text
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
    setMode(initialMode); // Reset mode when initialMode changes (e.g., modal reopens)
    setUsername('');
    setEmail('');
    setPassword('');
    // Do not clear authError here, it's global and might be from other actions
  }, [isOpen, initialMode]);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'login') {
      await login(username, password); // For login, username can be username or email
                                      // The backend /login endpoint expects 'usernameOrEmail'
                                      // So, the 'username' state here will be sent as 'usernameOrEmail'
    } else {
      await signup(username, email, password);
    }
    // Only close modal if there's no error AND not loading
    // This check is now handled by checking `user` in TinyTutorAppContent
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-md relative">
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
          aria-label="Close"
        >
          &times;
        </button>
        <h2 className="text-2xl font-bold mb-6 text-center text-gray-800 dark:text-gray-100">
          {mode === 'login' ? 'Login' : 'Sign Up'}
        </h2>
        {authError && (
          <p className="bg-red-100 dark:bg-red-700 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-100 px-4 py-3 rounded relative mb-4 text-sm" role="alert">
            {authError}
          </p>
        )}
        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <div className="mb-4">
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
              >
                Email
              </label>
              <input
                type="email"
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                required
              />
            </div>
          )}
          <div className="mb-4">
            <label
              htmlFor="username"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              {mode === 'login' ? 'Username or Email' : 'Username'}
            </label>
            <input
              type={mode === 'login' && username.includes('@') ? 'email' : 'text'}
              id="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              required
            />
          </div>
          <div className="mb-6">
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
              required
            />
          </div>
          <button
            type="submit"
            disabled={authLoadingGlobal}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:shadow-outline disabled:opacity-50 transition duration-150 ease-in-out"
          >
            {authLoadingGlobal ? (
              <div className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </div>
            ) : (mode === 'login' ? 'Login' : 'Sign Up')}
          </button>
        </form>
        <p className="mt-6 text-center text-sm">
          {mode === 'login' ? (
            <>
              Need an account?{' '}
              <button
                onClick={() => setMode('signup')}
                className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Sign Up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => setMode('login')}
                className="font-medium text-indigo-600 hover:text-indigo-500 dark:text-indigo-400 dark:hover:text-indigo-300"
              >
                Login
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
};

// --- ProfileModal Component ---
interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileData: ProfileData | null;
  isLoading: boolean;
  error: string | null;
  onWordClick: (word: string, cachedContent?: string, connections?: string[], modesGenerated?: string[]) => void;
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

  useEffect(() => {
    setIsFavoritedOptimistic(item.is_favorite);
  }, [item.is_favorite]);

  const handleToggleFavorite = async (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent word click when clicking heart
    setIsToggling(true);
    setIsFavoritedOptimistic(!isFavoritedOptimistic); // Optimistic update
    try {
      await onToggleFavorite(e); // Pass the event if needed by the handler
      // Actual state will be updated by parent re-fetching or prop update
    } catch (error) {
      console.error("Failed to toggle favorite from item:", error);
      setIsFavoritedOptimistic(item.is_favorite); // Revert on error
    } finally {
      setIsToggling(false);
    }
  };


  return (
    <li
      className={`p-3 mb-2 rounded-lg shadow hover:shadow-md transition-all duration-200 cursor-pointer flex justify-between items-center
        ${isFavoriteList ? 'bg-yellow-50 dark:bg-yellow-900 border-l-4 border-yellow-400' : 'bg-gray-50 dark:bg-gray-700'}`}
      onClick={onWordClick}
    >
      <div>
        <span className="font-semibold text-indigo-600 dark:text-indigo-400 block text-md">{item.word}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400">
          Last seen: {new Date(item.last_explored_at).toLocaleDateString()}
        </span>
      </div>
      <button
        onClick={handleToggleFavorite}
        disabled={isToggling}
        className={`p-1 rounded-full transition-colors duration-150 focus:outline-none 
          ${isFavoritedOptimistic ? 'text-red-500 hover:text-red-600' : 'text-gray-400 hover:text-red-400'}
          ${isToggling ? 'opacity-50 cursor-not-allowed' : ''}`}
        aria-label={isFavoritedOptimistic ? 'Unfavorite' : 'Favorite'}
      >
        {isFavoritedOptimistic ? '♥' : '♡'}
      </button>
    </li>
  );
};


const ProfileModal: React.FC<ProfileModalProps> = ({
  isOpen,
  onClose,
  profileData,
  isLoading,
  error,
  onWordClick,
  onToggleFavorite,
}) => {
  if (!isOpen) return null;

  const handleWordClick = (wordItem: ExploredWord) => {
    onWordClick(wordItem.word, wordItem.cached_explain_content, wordItem.explicit_connections, wordItem.modes_generated);
    onClose(); // Close profile modal after clicking a word
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-40">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">User Profile</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {isLoading && <p className="text-center text-gray-600 dark:text-gray-300">Loading profile...</p>}
        {error && <p className="text-center text-red-500 dark:text-red-400">Error: {error}</p>}

        {profileData && (
          <>
            <div className="mb-6 p-4 bg-indigo-50 dark:bg-indigo-900 rounded-lg shadow">
              <p className="text-lg"><span className="font-semibold text-indigo-700 dark:text-indigo-300">Username:</span> {profileData.username}</p>
              <p className="text-sm text-indigo-600 dark:text-indigo-400"><span className="font-semibold">Tier:</span> {profileData.tier}</p>
              <p className="text-sm text-indigo-600 dark:text-indigo-400"><span className="font-semibold">Words Explored:</span> {profileData.explored_words_count}</p>
            </div>

            <div className="flex-grow overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Explored Words List */}
              <div>
                <h3 className="text-xl font-semibold mb-3 text-gray-700 dark:text-gray-200">All Explored Words ({profileData.explored_words_list.length})</h3>
                {profileData.explored_words_list.length > 0 ? (
                  <ul className="space-y-2 pr-2 max-h-[55vh] overflow-y-auto">
                    {profileData.explored_words_list.map((item) => (
                      <CompactWordListItem
                        key={`explored-${item.id}`}
                        item={item}
                        onWordClick={() => handleWordClick(item)}
                        onToggleFavorite={(e?: React.MouseEvent) => {
                           if (e) e.stopPropagation();
                           return onToggleFavorite(item.id, item.is_favorite);
                        }}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">No words explored yet.</p>
                )}
              </div>

              {/* Favorite Words List */}
              <div>
                <h3 className="text-xl font-semibold mb-3 text-gray-700 dark:text-gray-200">Favorite Words ({profileData.favorite_words_list.length})</h3>
                {profileData.favorite_words_list.length > 0 ? (
                  <ul className="space-y-2 pr-2 max-h-[55vh] overflow-y-auto">
                    {profileData.favorite_words_list.map((item) => (
                       <CompactWordListItem
                        key={`fav-${item.id}`}
                        item={item}
                        onWordClick={() => handleWordClick(item)}
                        onToggleFavorite={(e?: React.MouseEvent) => {
                           if (e) e.stopPropagation();
                           return onToggleFavorite(item.id, item.is_favorite);
                        }}
                        isFavoriteList={true}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500 dark:text-gray-400">No favorite words yet.</p>
                )}
              </div>
            </div>
             {/* Streak History Section - to be populated when data is available */}
            {profileData.streak_history && profileData.streak_history.length > 0 && (
                <div className="mt-6">
                    <h3 className="text-xl font-semibold mb-3 text-gray-700 dark:text-gray-200">Streak History</h3>
                    <ul className="space-y-2 pr-2 max-h-[30vh] overflow-y-auto bg-gray-50 dark:bg-gray-700 p-3 rounded-md">
                        {profileData.streak_history.map((streak, index) => (
                            <li key={streak.id || `streak-${index}`} className="p-2 border-b border-gray-200 dark:border-gray-600">
                                <p className="font-semibold text-indigo-600 dark:text-indigo-400">Score: {streak.score}</p>
                                <p className="text-sm text-gray-600 dark:text-gray-300">Words: {streak.words.join(' → ')}</p>
                                {streak.completed_at && (
                                    <p className="text-xs text-gray-500 dark:text-gray-400">
                                        Completed: {new Date(streak.completed_at).toLocaleString()}
                                    </p>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// --- WordStreakHistoryModal Component ---
interface WordStreakHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  streaks: Streak[]; // Expecting completed streaks
  onWordClick: (word: string) => void; // To navigate to tutor view
}

const WordStreakHistoryModal: React.FC<WordStreakHistoryModalProps> = ({ isOpen, onClose, streaks, onWordClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawStreaks = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !streaks || streaks.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const padding = 20;
    const streakHeight = 60; // Height for each streak display area
    const wordCircleRadius = 18;
    const wordSpacing = 50; // Horizontal spacing between word centers
    const scoreBoxWidth = 40;
    const scoreBoxHeight = 25;
    // const lineHeight = 20; // For text within streak display (not used directly here, but good to keep in mind)

    // Calculate canvas dimensions
    let maxStreakWidth = 0;
    streaks.forEach(streak => {
        const width = (streak.words.length * wordSpacing) + scoreBoxWidth + padding * 2;
        if (width > maxStreakWidth) maxStreakWidth = width;
    });
    
    canvas.width = maxStreakWidth > 300 ? maxStreakWidth : 300; // Min width
    canvas.height = streaks.length * streakHeight + padding * 2;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#1f2937'; // Tailwind gray-800 (dark mode bg)
    ctx.fillRect(0,0, canvas.width, canvas.height);


    streaks.forEach((streak, streakIndex) => {
      const startY = padding + streakIndex * streakHeight;
      let currentX = padding + scoreBoxWidth / 2;

      // Draw Score Box
      ctx.fillStyle = '#4f46e5'; // Indigo
      ctx.fillRect(padding, startY + (streakHeight - scoreBoxHeight) / 2, scoreBoxWidth, scoreBoxHeight);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 14px Arial';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(streak.score), padding + scoreBoxWidth / 2, startY + streakHeight / 2);

      currentX += scoreBoxWidth / 2 + wordSpacing / 2; // Adjust for first word

      // Draw words and connecting lines
      streak.words.forEach((word, wordIndex) => {
        if (wordIndex > 0) {
          // Draw connecting line
          ctx.strokeStyle = '#6b7280'; // Gray
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(currentX - wordSpacing + wordCircleRadius, startY + streakHeight / 2);
          ctx.lineTo(currentX - wordCircleRadius, startY + streakHeight / 2);
          ctx.stroke();
        }

        // Draw word circle
        ctx.beginPath();
        ctx.arc(currentX, startY + streakHeight / 2, wordCircleRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#3b82f6'; // Blue
        ctx.fill();

        // Draw word text
        ctx.fillStyle = 'white';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(word.substring(0, 5) + (word.length > 5 ? '...' : ''), currentX, startY + streakHeight / 2); // Truncate word if too long

        currentX += wordSpacing;
      });
    });
  }, [streaks]);

  useEffect(() => {
    if (isOpen) {
      drawStreaks();
    }
  }, [isOpen, streaks, drawStreaks]);

  // Basic click handler for demonstration - needs refinement for accuracy
  const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !streaks) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const padding = 20;
    const streakHeight = 60;
    const wordCircleRadius = 18;
    const wordSpacing = 50;
    const scoreBoxWidth = 40;

    for (let streakIndex = 0; streakIndex < streaks.length; streakIndex++) {
        const streak = streaks[streakIndex];
        const startY = padding + streakIndex * streakHeight;
        let currentX = padding + scoreBoxWidth + wordSpacing / 2; // Start of first word circle center

        for (let wordIndex = 0; wordIndex < streak.words.length; wordIndex++) {
            const wordCenterX = currentX;
            const wordCenterY = startY + streakHeight / 2;

            // Check if click is within this word's circle
            const distance = Math.sqrt(Math.pow(x - wordCenterX, 2) + Math.pow(y - wordCenterY, 2));
            if (distance <= wordCircleRadius) {
                onWordClick(streak.words[wordIndex]);
                onClose(); // Close modal after clicking a word
                return;
            }
            currentX += wordSpacing;
        }
    }
  };


  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-40">
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-xl max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Word Streak History</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-2xl"
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        {streaks && streaks.length > 0 ? (
          <div className="overflow-auto">
            <canvas ref={canvasRef} onClick={handleCanvasClick} className="border border-gray-300 dark:border-gray-600 rounded-md cursor-pointer"></canvas>
          </div>
        ) : (
          <p className="text-gray-600 dark:text-gray-400 text-center py-8">No completed streaks (score 2+) recorded yet.</p>
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

  // Streak System State
  const [currentStreak, setCurrentStreak] = useState<Streak>({ words: [], score: 0 });
  const [completedStreaks, setCompletedStreaks] = useState<Streak[]>([]); // Loaded from profile
  const [showStreakHistoryModal, setShowStreakHistoryModal] = useState(false);
  
  const lastSubmittedQuestionRef = useRef<string | null>(null);


  // Close AuthModal if user logs in successfully
  useEffect(() => {
    if (user && showAuthModal) {
      setShowAuthModal(false);
    }
  }, [user, showAuthModal]);

  // Effect to update currentTutorWordIsFavorite when inputQuestion or profileData changes
  useEffect(() => {
    if (inputQuestion && profileData) {
      const currentWordSanitized = inputQuestion.toLowerCase().trim(); // Basic sanitization for matching
      const foundWord = profileData.explored_words_list.find(
        (w) => w.word.toLowerCase().trim() === currentWordSanitized
      );
      setCurrentTutorWordIsFavorite(foundWord ? foundWord.is_favorite : false);
    } else {
      setCurrentTutorWordIsFavorite(false); // Reset if no question or profile data
    }
  }, [inputQuestion, profileData]);


  const handleEndStreak = useCallback(async (reason: string) => {
    console.log(`Attempting to end streak. Reason: ${reason}. Current streak score: ${currentStreak.score}, words: ${currentStreak.words.join(', ')}`);
    if (currentStreak.words.length > 0 && currentStreak.score >= 2) {
        console.log("Valid streak to save:", currentStreak);
        // Save to backend
        try {
            const response = await fetch(`${API_BASE_URL}/save_streak`, {
                method: 'POST',
                headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ words: currentStreak.words, score: currentStreak.score }),
            });
            const result = await response.json();
            if (!response.ok) {
                throw new Error(result.error || 'Failed to save streak');
            }
            console.log('Streak saved successfully:', result);
            // Add to local completedStreaks for immediate UI update (optional, if profile re-fetch is slow)
            // Or rely on next profile fetch to get all streaks including the new one.
            // For now, we'll rely on the profile fetch.
        } catch (error) {
            console.error('Error saving streak:', error);
            // Handle error (e.g., show a notification to the user)
        }
    } else {
        console.log("Streak not saved (score < 2 or no words).");
    }
    setCurrentStreak({ words: [], score: 0 }); // Reset current streak
  }, [currentStreak, getAuthHeaders]);


  const generateContent = async (question: string, mode: ContentMode, isExplicitNewWord: boolean = false) => {
    if (!user) {
      setAuthModalMode('login');
      setShowAuthModal(true);
      setAiError("Please login to generate content.");
      return;
    }
    if (!question.trim()) {
      setAiError("Please enter a word or concept.");
      return;
    }

    setIsLoadingExplanation(true);
    setAiError(null);
    // Only clear all generated content if it's a new root word submission or refresh of explain
    if (isExplicitNewWord || (mode === 'explain' && question !== lastSubmittedQuestionRef.current)) {
        setGeneratedContents({});
        setIsExplainGeneratedForCurrentWord(false); // Reset this flag for a new word
    }


    // Streak Handling:
    // If it's an explicit new word (typed or from profile/streak history) OR a refresh, end current streak.
    if (isExplicitNewWord || (mode === 'explain' && question === inputQuestion)) { // Refresh case
        await handleEndStreak(isExplicitNewWord ? "New root word" : "Refresh current word");
        // Start new streak with this word if it's an 'explain' generation
        if (mode === 'explain') {
            setCurrentStreak({ words: [question], score: 1 });
        }
    }


    try {
      const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, mode }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `HTTP error! status: ${response.status}`);
      }

      setGeneratedContents((prev) => ({ ...prev, [mode]: data.content }));
      setActiveMode(mode); // Set the current mode as active

      if (mode === 'explain') {
        setIsExplainGeneratedForCurrentWord(true);
        lastSubmittedQuestionRef.current = question; // Update ref only on successful explain
         // Check favorite status for this newly explained word
        if (profileData) {
            const foundWord = profileData.explored_words_list.find(
                (w) => w.word.toLowerCase().trim() === question.toLowerCase().trim()
            );
            setCurrentTutorWordIsFavorite(foundWord ? foundWord.is_favorite : false);
        }
      }

    } catch (error: any) {
      console.error(`Error generating ${mode}:`, error);
      setAiError(error.message || `Failed to generate ${mode}.`);
      if (mode === 'explain') {
        setIsExplainGeneratedForCurrentWord(false); // Ensure this is false on error
      }
    } finally {
      setIsLoadingExplanation(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuestion = e.target.value;
    setInputQuestion(newQuestion);
    if (!newQuestion.trim()) { // If input is cleared
        setGeneratedContents({});
        setIsExplainGeneratedForCurrentWord(false);
        setAiError(null);
        setCurrentTutorWordIsFavorite(false);
        handleEndStreak("Input cleared"); // End streak if input is cleared
        lastSubmittedQuestionRef.current = null;
    }
  };

  const handleGenerateClick = () => {
    if (inputQuestion.trim()) {
      generateContent(inputQuestion.trim(), 'explain', true); // Always true for main button click
    }
  };

  const handleModeToggle = (newMode: ContentMode) => {
    if (newMode === activeMode && generatedContents[newMode]) return; // Already active and content exists
    if (inputQuestion.trim()) {
        // If switching to 'explain' for the same word, it's like a refresh if content already exists
        // Otherwise, it's fetching a new mode. Streak continues unless it's a refresh of 'explain'.
        const isRefreshingExplain = newMode === 'explain' && inputQuestion === lastSubmittedQuestionRef.current;
        generateContent(inputQuestion.trim(), newMode, isRefreshingExplain);
    }
  };
  
  const handleRefreshContent = () => {
    if (inputQuestion.trim() && activeMode) {
        // Refreshing content always starts a new streak with the current word.
        generateContent(inputQuestion.trim(), activeMode, true);
    }
  };

  const handleWordClickFromExplanation = (word: string) => {
    setInputQuestion(word); // Update input field
    // Streak continuation:
    if (currentStreak.words.length > 0 && !currentStreak.words.includes(word)) {
        setCurrentStreak(prev => ({
            words: [...prev.words, word],
            score: prev.score + 1,
        }));
    } else if (currentStreak.words.length === 0) { // Should not happen if explain was generated
        setCurrentStreak({ words: [inputQuestion, word], score: 2 }); // inputQuestion is the root
    }
    generateContent(word, 'explain', false); // 'false' because it's a click-to-explore, not a new root word
  };

  const handleOpenProfileModal = async () => {
    if (!user) {
      setShowAuthModal(true);
      setAuthModalMode('login');
      return;
    }
    setShowProfileModal(true);
    setIsLoadingProfile(true);
    setProfileError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/profile`, {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to fetch profile');
      }
      setProfileData(data);
      // Load completed streaks from profile into state
      if (data.streak_history) {
        setCompletedStreaks(data.streak_history);
      }

    } catch (error: any) {
      console.error('Error fetching profile:', error);
      setProfileError(error.message);
    } finally {
      setIsLoadingProfile(false);
    }
  };

  const handleToggleFavoriteOnTutorPage = async () => {
    if (!user || !inputQuestion.trim() || !isExplainGeneratedForCurrentWord) return;

    const newFavoriteStatus = !currentTutorWordIsFavorite;
    // Optimistic update for tutor page heart
    setCurrentTutorWordIsFavorite(newFavoriteStatus);

    try {
        const response = await fetch(`${API_BASE_URL}/toggle_favorite`, {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ word: inputQuestion.trim(), is_favorite: newFavoriteStatus }),
        });
        const data = await response.json();
        if (!response.ok) {
            setCurrentTutorWordIsFavorite(!newFavoriteStatus); // Revert on error
            throw new Error(data.error || 'Failed to toggle favorite');
        }
        // Optionally, refresh profile data in background or just update the specific word if profileData is complex
        if (profileData) {
            setProfileData(prev => {
                if (!prev) return null;
                const updatedExplored = prev.explored_words_list.map(w => 
                    w.word.toLowerCase().trim() === inputQuestion.trim().toLowerCase() ? { ...w, is_favorite: newFavoriteStatus } : w
                );
                const updatedFavorites = updatedExplored.filter(w => w.is_favorite);
                return { ...prev, explored_words_list: updatedExplored, favorite_words_list: updatedFavorites };
            });
        }

    } catch (error) {
        console.error("Error toggling favorite on tutor page:", error);
        setAiError((error as Error).message || "Could not update favorite status.");
        setCurrentTutorWordIsFavorite(!newFavoriteStatus); // Revert on error
    }
  };
  
  const handleToggleFavoriteInProfile = async (wordIdSanitized: string, currentIsFavorite: boolean) => {
    // wordIdSanitized is the sanitized_word_id from the backend
    // We need the original word string to send to the backend if our /toggle_favorite expects original word
    // Assuming wordIdSanitized is what we need for the call, or we find original word from profileData
    const wordEntry = profileData?.explored_words_list.find(w => w.id === wordIdSanitized);
    if (!wordEntry) {
        console.error("Word not found in profile data for toggling favorite.");
        return;
    }
    const originalWord = wordEntry.word;
    const newFavoriteStatus = !currentIsFavorite;

    try {
        const response = await fetch(`${API_BASE_URL}/toggle_favorite`, {
            method: 'POST',
            headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ word: originalWord, is_favorite: newFavoriteStatus }),
        });
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || 'Failed to toggle favorite in profile');
        }
        // Refresh profile data to reflect the change
        // This is an optimistic update, actual data will come from re-fetch
        setProfileData(prev => {
            if (!prev) return null;
            const updatedList = prev.explored_words_list.map(w =>
                w.id === wordIdSanitized ? { ...w, is_favorite: newFavoriteStatus } : w
            );
            return {
                ...prev,
                explored_words_list: updatedList,
                favorite_words_list: updatedList.filter(w => w.is_favorite)
            };
        });
        // If the currently displayed tutor word is the one toggled, update its heart too
        if (inputQuestion.trim().toLowerCase() === originalWord.toLowerCase()) {
            setCurrentTutorWordIsFavorite(newFavoriteStatus);
        }

    } catch (error) {
        console.error("Error toggling favorite from profile:", error);
        // Potentially show an error message in the profile modal
        // Revert optimistic update is handled by CompactWordListItem itself for its local state
        // but here we might need to ensure global profileData is accurate if we don't re-fetch immediately
        alert(`Failed to update favorite: ${(error as Error).message}`); // Basic error feedback
    }
  };

  const handleWordClickFromProfile = (word: string, cachedContent?: string, _connections?: string[], _modesGenerated?: string[]) => {
    setInputQuestion(word);
    if (cachedContent) {
        setGeneratedContents({ explain: cachedContent });
        setActiveMode('explain');
        setIsExplainGeneratedForCurrentWord(true);
        lastSubmittedQuestionRef.current = word; // Set this as if it was just explained
        // Update favorite status for this word
        if (profileData) {
            const foundWord = profileData.explored_words_list.find(w => w.word.toLowerCase().trim() === word.toLowerCase().trim());
            setCurrentTutorWordIsFavorite(foundWord ? foundWord.is_favorite : false);
        }
         // Start a new streak
        handleEndStreak("Clicked from profile");
        setCurrentStreak({ words: [word], score: 1 });

    } else {
        // If no cached content, fetch it (this will also handle streak start)
        generateContent(word, 'explain', true);
    }
    setShowProfileModal(false); // Close profile modal
  };
  
  const handleOpenStreakHistoryModal = async () => {
    if (!user) {
        setShowAuthModal(true);
        setAuthModalMode('login');
        return;
    }
    // Fetch latest profile data which includes streaks, or ensure profileData is fresh
    await handleOpenProfileModal(); // This fetches profile and sets completedStreaks
    setShowStreakHistoryModal(true);
  };

  const handleWordClickFromStreakHistory = (word: string) => {
    setInputQuestion(word);
    // This is a new exploration root, so fetch 'explain' and start a new streak
    generateContent(word, 'explain', true);
    setShowStreakHistoryModal(false); // Close streak history modal
  };


  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 flex flex-col items-center p-4 transition-colors duration-300">
      {/* Header */}
      <header className="w-full max-w-3xl mb-6 flex justify-between items-center">
        <h1 className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">Tiny Tutor</h1>
        <div className="space-x-2">
          {user ? (
            <>
              <span className="text-sm hidden sm:inline">Welcome, {user.username}!</span>
              <button
                onClick={handleOpenProfileModal}
                className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600"
              >
                Profile
              </button>
               <button
                onClick={handleOpenStreakHistoryModal}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-purple-500 dark:bg-purple-500 dark:hover:bg-purple-600"
              >
                Streaks
              </button>
              <button
                onClick={() => {
                    handleEndStreak("Logout"); // End streak on logout
                    logout();
                }}
                className="px-4 py-2 text-sm font-medium text-indigo-700 bg-indigo-100 rounded-md hover:bg-indigo-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:text-indigo-200 dark:bg-indigo-700 dark:hover:bg-indigo-800"
              >
                Logout
              </button>
            </>
          ) : (
            <button
              onClick={() => {
                setAuthModalMode('login');
                setShowAuthModal(true);
              }}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 dark:bg-indigo-500 dark:hover:bg-indigo-600"
            >
              Login / Sign Up
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-3xl bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-lg shadow-xl">
        {/* Input Section */}
        <div className="mb-6">
          <label htmlFor="conceptInput" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Enter a word or concept:
          </label>
          <div className="relative">
            <input
              type="text"
              id="conceptInput"
              value={inputQuestion}
              onChange={handleInputChange}
              placeholder="e.g., Photosynthesis, Quantum Entanglement"
              className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:ring-indigo-500 focus:border-indigo-500 dark:bg-gray-700 dark:text-gray-100"
            />
            {inputQuestion && (
                 <button
                    onClick={() => {
                        setInputQuestion('');
                        setGeneratedContents({});
                        setIsExplainGeneratedForCurrentWord(false);
                        setAiError(null);
                        setCurrentTutorWordIsFavorite(false);
                        handleEndStreak("Input cleared by X button");
                        lastSubmittedQuestionRef.current = null;
                    }}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 text-xl"
                    aria-label="Clear input"
                >
                    &times;
                </button>
            )}
          </div>
        </div>

        <button
          onClick={handleGenerateClick}
          disabled={isLoadingExplanation || !inputQuestion.trim() || !user}
          className="w-full sm:w-auto bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-md focus:outline-none focus:shadow-outline disabled:opacity-50 transition duration-150 ease-in-out mb-4 text-lg"
        >
          {isLoadingExplanation && generatedContents.explain ? 'Refreshing...' : (isLoadingExplanation ? 'Generating...' : 'Generate Explanation')}
        </button>

        {/* Toggle Buttons & Actions - Only show if a question is entered and user is logged in */}
        {user && inputQuestion.trim() && (
            <div className="my-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-md shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                    {(['explain', 'image', 'fact', 'quiz', 'deep'] as ContentMode[]).map((mode) => (
                        <button
                        key={mode}
                        onClick={() => handleModeToggle(mode)}
                        disabled={isLoadingExplanation || (mode !== 'explain' && !isExplainGeneratedForCurrentWord)}
                        className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors
                            ${activeMode === mode
                                ? 'bg-indigo-600 text-white'
                                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-600 dark:text-gray-200 dark:hover:bg-gray-500'}
                            ${(isLoadingExplanation || (mode !== 'explain' && !isExplainGeneratedForCurrentWord)) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        </button>
                    ))}
                    {/* Refresh and Favorite buttons - active only after initial 'explain' */}
                    {isExplainGeneratedForCurrentWord && (
                        <>
                        <button
                            onClick={handleRefreshContent}
                            disabled={isLoadingExplanation}
                            className="p-2 text-gray-600 hover:text-indigo-600 dark:text-gray-300 dark:hover:text-indigo-400 rounded-full focus:outline-none disabled:opacity-50"
                            title="Refresh content"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                            </svg>
                        </button>
                        <button
                            onClick={handleToggleFavoriteOnTutorPage}
                            disabled={isLoadingExplanation}
                            className={`p-1.5 rounded-full transition-colors duration-150 focus:outline-none disabled:opacity-50
                                ${currentTutorWordIsFavorite ? 'text-red-500 hover:text-red-600' : 'text-gray-400 hover:text-red-400'}`}
                            title={currentTutorWordIsFavorite ? 'Unfavorite' : 'Favorite'}
                        >
                            {currentTutorWordIsFavorite ? '♥' : '♡'} <span className="text-lg leading-none relative -top-px">{currentTutorWordIsFavorite ? '' : ''}</span>
                        </button>
                        </>
                    )}
                </div>
                {/* Live Streak Display */}
                {currentStreak.score >= 2 && (
                    <div className="mt-2 text-sm font-semibold text-purple-600 dark:text-purple-400">
                        Streak: {currentStreak.score} ({currentStreak.words.join(' → ')})
                    </div>
                )}
            </div>
        )}


        {/* AI Error Display */}
        {aiError && (
          <div className="mt-4 p-3 bg-red-100 dark:bg-red-800 border border-red-400 dark:border-red-600 text-red-700 dark:text-red-200 rounded-md text-sm">
            <p><strong>Error:</strong> {aiError}</p>
          </div>
        )}

        {/* Generated Content Display */}
        {isLoadingExplanation && !generatedContents[activeMode] && (
          <div className="mt-6 flex justify-center items-center h-32">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
          </div>
        )}

        {generatedContents[activeMode] && (
          <div className="mt-6 p-4 border border-gray-200 dark:border-gray-700 rounded-lg bg-gray-50 dark:bg-gray-700 shadow">
            {/* Heading for content type is removed as per report */}
            {activeMode === 'explain' ? (
              <HighlightedContentRenderer
                text={generatedContents.explain!}
                onWordClick={handleWordClickFromExplanation}
              />
            ) : (
              <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {generatedContents[activeMode]}
              </p>
            )}
          </div>
        )}
      </main>

      {/* Modals */}
      <AuthModal
        isOpen={showAuthModal}
        onClose={() => setShowAuthModal(false)}
        initialMode={authModalMode}
      />
      <ProfileModal
        isOpen={showProfileModal}
        onClose={() => setShowProfileModal(false)}
        profileData={profileData}
        isLoading={isLoadingProfile}
        error={profileError}
        onWordClick={handleWordClickFromProfile}
        onToggleFavorite={handleToggleFavoriteInProfile}
      />
      <WordStreakHistoryModal
        isOpen={showStreakHistoryModal}
        onClose={() => setShowStreakHistoryModal(false)}
        streaks={completedStreaks} // Pass completed streaks from profileData or state
        onWordClick={handleWordClickFromStreakHistory}
      />

    </div>
  );
};


// --- App Component (Root) ---
function App() {
  return (
    <AuthProvider>
      <TinyTutorAppContent />
    </AuthProvider>
  );
}

export default App;

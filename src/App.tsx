// App.tsx
// (Ensure all necessary imports from the original App.tsx are present)
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { User, LogIn, LogOut, Search, Send, RefreshCw, Heart, Star, List, BookOpen, CheckCircle, XCircle, ChevronLeft, ChevronRight, Image as ImageIcon, Brain, Menu, X, User as UserIcon, Settings, Info, Moon, Sun, Sparkles, FileText, Edit2 } from 'lucide-react';
import './App.css'; // Main app styles
import './index.css'; // Tailwind base styles

// Import the new ProfilePage component
import ProfilePage from './ProfilePage'; // Assuming ProfilePage.tsx is in the same src/ directory

// --- Constants (from original App.tsx, ensure these are defined) ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'; // Ensure this is correctly set in .env

// --- Type Definitions (from original App.tsx, ensure these are defined) ---
interface CurrentUser {
  username: string;
  email: string;
  id: string;
  // Add other fields like account_tier if available
}

interface GeneratedContent {
  explain?: string;
  quiz?: QuizQuestion[];
  fact?: string[];
  image?: string; // URL or base64 string
  deep_dive?: string;
  // Store favorite status here as well, associated with the word
  is_favorite?: boolean;
  quiz_progress?: QuizAttempt[];
  // Add other content modes as needed
}

interface QuizQuestion {
  question: string;
  options: { [key: string]: string };
  correctOptionKey: string;
  explanation?: string;
}

interface QuizAttempt {
  question_index: number;
  selected_option_key: string;
  is_correct: boolean;
  timestamp: string;
}

interface LiveStreak {
  score: number;
  words: string[];
}

interface WordHistoryEntry {
  id: string; // The word itself, sanitized
  word: string; // The original word
  last_explored_at: string | Date; // Or Firestore Timestamp
  is_favorite: boolean;
  first_explored_at?: string | Date;
  // any other relevant fields from your Firestore structure
}

interface StreakHistoryEntry {
  id: string; // Firestore document ID
  words: string[];
  score: number;
  completed_at: string | Date; // Or Firestore Timestamp
}

interface UserProfileData {
  exploredWords: WordHistoryEntry[];
  favoriteWords: WordHistoryEntry[];
  streakHistory: StreakHistoryEntry[];
  totalWordsExplored: number;
  isLoading: boolean;
  error: string | null;
  username?: string;
  email?: string;
}

// --- Helper Functions (from original App.tsx, ensure these are defined) ---
const sanitizeWordForId = (word: string): string => {
  return word.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};


// --- Main App Component ---
function App() {
  const [inputValue, setInputValue] = useState('');
  const [currentFocusWord, setCurrentFocusWord] = useState<string | null>(null);
  const [generatedContent, setGeneratedContent] = useState<{ [key: string]: GeneratedContent }>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeContentMode, setActiveContentMode] = useState<'explain' | 'quiz' | 'fact' | 'image' | 'deep_dive'>('explain');

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem('authToken'));
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMessage, setAuthSuccessMessage] = useState<string | null>(null);

  // Profile related states
  const [activeView, setActiveView] = useState<'main' | 'profile'>('main'); // 'main' or 'profile'
  const [userProfileData, setUserProfileData] = useState<UserProfileData>({
    exploredWords: [],
    favoriteWords: [],
    streakHistory: [],
    totalWordsExplored: 0,
    isLoading: false,
    error: null,
  });

  // Quiz states
  const [currentQuizQuestionIndex, setCurrentQuizQuestionIndex] = useState(0);
  const [selectedQuizOption, setSelectedQuizOption] = useState<string | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<{ message: string, isCorrect: boolean } | null>(null);
  const [isQuizAttempted, setIsQuizAttempted] = useState(false); // For current question display

  // Streak states
  const [liveStreak, setLiveStreak] = useState<LiveStreak | null>(null);
  const [wordForReview, setWordForReview] = useState<string | null>(null); // Word being reviewed from streak/profile
  const [isReviewingStreakWord, setIsReviewingStreakWord] = useState(false);

  const [isMenuOpen, setIsMenuOpen] = useState(false); // For mobile menu
  const [darkMode, setDarkMode] = useState(() => {
    const savedMode = localStorage.getItem('darkMode');
    return savedMode ? JSON.parse(savedMode) : window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const contentEndRef = useRef<HTMLDivElement>(null); // For scrolling
  const mainInputRef = useRef<HTMLInputElement>(null);


  // --- Dark Mode Effect ---
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  // --- Auth Token Effect ---
  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      setAuthToken(token);
      // fetchUserProfile(token); // Moved to separate useEffect to avoid race with setCurrentUser
    }
    mainInputRef.current?.focus();
  }, []); 


  // --- Scroll to bottom of content ---
   useEffect(() => {
    if (activeView === 'main' && (activeContentMode !== 'quiz' || quizFeedback)) { 
        contentEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [generatedContent, currentFocusWord, activeContentMode, quizFeedback, activeView]);


  // --- Fetch User Profile ---
  const fetchUserProfile = useCallback(async (token: string | null) => {
    if (!token) {
        // If no token, ensure user is logged out and profile data is cleared
        setCurrentUser(null);
        setUserProfileData({ exploredWords: [], favoriteWords: [], streakHistory: [], totalWordsExplored: 0, isLoading: false, error: null, username: undefined, email: undefined });
        return;
    }
    setUserProfileData(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetch(`${API_BASE_URL}/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        if (response.status === 401) { 
          // Use a more direct way to logout if handleLogout causes dependency issues here
          localStorage.removeItem('authToken');
          setAuthToken(null);
          setCurrentUser(null);
          setUserProfileData({ exploredWords: [], favoriteWords: [], streakHistory: [], totalWordsExplored: 0, isLoading: false, error: null, username: undefined, email: undefined });
          setActiveView('main');
          setShowAuthModal(true); // Prompt login
          setAuthError("Session expired. Please login again.");
          throw new Error("Session expired. Please login again.");
        }
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to fetch profile: ${response.statusText}`);
      }
      const data = await response.json();
      setCurrentUser({ username: data.username, email: data.email, id: data.user_id });
      setUserProfileData({
        exploredWords: data.explored_words_history || [],
        favoriteWords: data.favorite_words_history || [],
        streakHistory: data.streak_history || [],
        totalWordsExplored: data.total_words_explored || 0,
        username: data.username,
        email: data.email,
        isLoading: false,
        error: null,
      });
    } catch (err: any) {
      console.error("Error fetching profile:", err);
      setUserProfileData(prev => ({ ...prev, isLoading: false, error: err.message }));
      if (err.message.includes("Session expired") && !showAuthModal) { // Avoid multiple auth modals
        setError("Session expired. Please login again."); 
      }
    }
  }, [showAuthModal]); // Added showAuthModal to dependencies

  // --- Initial data fetch if token exists ---
  useEffect(() => {
    if (authToken && (!currentUser || !userProfileData.username)) { // Fetch if token exists but crucial user data is missing
      fetchUserProfile(authToken);
    }
  }, [authToken, currentUser, userProfileData.username, fetchUserProfile]);


  // --- Authentication Handlers (login, signup, logout) ---
  const handleAuthAction = async (e: React.FormEvent, type: 'login' | 'signup', formData: any) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccessMessage(null);
    // setIsLoading(true); // Using a local var for button state in renderAuthModal
    
    const endpoint = type === 'login' ? '/login' : '/signup';
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `Failed to ${type}`);
      }

      if (type === 'signup') {
        setAuthSuccessMessage('Signup successful! Please login.');
        setAuthMode('login'); 
      } else { 
        localStorage.setItem('authToken', data.token);
        setAuthToken(data.token);
        // setCurrentUser(data.user); // User data will be fully fetched by fetchUserProfile
        setShowAuthModal(false);
        setError(null); 
        await fetchUserProfile(data.token); 
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      // setIsLoading(false);
    }
  };

  const handleLogout = useCallback(async (saveCurrentStreak = true) => {
    const currentAuthToken = authToken; // Capture token before it's cleared
    if (saveCurrentStreak && liveStreak && liveStreak.score >= 2 && currentAuthToken) {
      try {
        await fetch(`${API_BASE_URL}/save_streak`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${currentAuthToken}`,
          },
          body: JSON.stringify({ words: liveStreak.words, score: liveStreak.score }),
        });
      } catch (err) {
        console.error("Failed to save streak on logout:", err);
      }
    }

    localStorage.removeItem('authToken');
    setAuthToken(null);
    setCurrentUser(null);
    setCurrentFocusWord(null);
    setGeneratedContent({});
    setLiveStreak(null);
    setWordForReview(null);
    setIsReviewingStreakWord(false);
    setUserProfileData({ exploredWords: [], favoriteWords: [], streakHistory: [], totalWordsExplored: 0, isLoading: false, error: null, username: undefined, email: undefined });
    setActiveView('main'); 
    setShowAuthModal(false); 
    mainInputRef.current?.focus();
  }, [liveStreak, authToken]); 


  // --- Content Generation and Management ---
  const handleGenerateExplanation = async (
    wordToFetch: string,
    isProfileWordClick = false, 
    isRefreshClick = false,     
    isSubTopicClick = false,    
    modeToFetch: typeof activeContentMode = activeContentMode, 
    isNewPrimaryWordSearch = false 
  ) => {
    if (!wordToFetch.trim()) {
      setError("Please enter a word or concept.");
      return;
    }
    if (!authToken) {
      setShowAuthModal(true);
      setAuthMode('login');
      return;
    }

    setIsLoading(true);
    setError(null);
    
    if ((isNewPrimaryWordSearch || isProfileWordClick) && liveStreak && liveStreak.score >= 2 && authToken) { 
      try {
        await fetch(`${API_BASE_URL}/save_streak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
          body: JSON.stringify({ words: liveStreak.words, score: liveStreak.score }),
        });
        setLiveStreak(null); 
         if (userProfileData.username && authToken) fetchUserProfile(authToken); 
      } catch (err) {
        console.error("Failed to save previous streak:", err);
      }
    }

    if (isNewPrimaryWordSearch || isProfileWordClick) {
        setCurrentFocusWord(wordToFetch);
        setLiveStreak({ score: 1, words: [wordToFetch] });
        setIsReviewingStreakWord(false); 
        setWordForReview(null);
        setActiveContentMode(modeToFetch === 'quiz' ? 'quiz' : 'explain'); 
    } else if (isSubTopicClick) {
        setCurrentFocusWord(wordToFetch); 
        if (liveStreak && liveStreak.words[liveStreak.words.length - 1] !== wordToFetch) {
            setLiveStreak(prev => prev ? { score: prev.score + 1, words: [...prev.words, wordToFetch] } : { score: 1, words: [wordToFetch] });
        } else if (!liveStreak) {
            setLiveStreak({ score: 1, words: [wordToFetch] });
        }
        setIsReviewingStreakWord(false);
        setWordForReview(null);
        setActiveContentMode('explain'); 
    }
    
    const effectiveWord = isReviewingStreakWord && wordForReview ? wordForReview : wordToFetch;
    const effectiveWordId = sanitizeWordForId(effectiveWord);

    try {
      if (!isRefreshClick && activeContentMode !== modeToFetch) { 
          setActiveContentMode(modeToFetch);
      }

      const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          word: effectiveWord,
          mode: modeToFetch,
          refresh_cache: isRefreshClick,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
         if (response.status === 401 && authToken) { 
            handleLogout(false); // Logout if token is invalid
            // No need to throw again if handleLogout redirects or shows modal
            return; // Stop further processing
        }
        throw new Error(errorData.error || `Failed to generate content for ${modeToFetch}`);
      }

      const data = await response.json();

      setGeneratedContent(prev => {
        const newContentForWord = { ...(prev[effectiveWordId] || {}) };
        if (modeToFetch === 'explain') newContentForWord.explain = data.explanation;
        else if (modeToFetch === 'quiz') {
            newContentForWord.quiz = data.quiz_questions;
            if (isRefreshClick || !newContentForWord.quiz_progress || data.quiz_questions_refreshed) { 
                 newContentForWord.quiz_progress = [];
            }
            setCurrentQuizQuestionIndex(0); 
            setSelectedQuizOption(null);
            setQuizFeedback(null);
            setIsQuizAttempted(false);
        }
        else if (modeToFetch === 'fact') newContentForWord.fact = data.facts;
        else if (modeToFetch === 'image') newContentForWord.image = data.image_url; 
        else if (modeToFetch === 'deep_dive') newContentForWord.deep_dive = data.deep_dive_content;

        if (data.is_favorite !== undefined) {
            newContentForWord.is_favorite = data.is_favorite;
        }
         if (data.word_data && data.word_data.quiz_progress) { 
            newContentForWord.quiz_progress = data.word_data.quiz_progress;
        }
        return { ...prev, [effectiveWordId]: newContentForWord };
      });

      if (isNewPrimaryWordSearch) setInputValue(''); 

    } catch (err: any) {
      console.error(`Error fetching ${modeToFetch}:`, err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModeChange = (mode: typeof activeContentMode) => {
    if (isLoading) return; 
    const displayWord = getDisplayWord();
    if (!displayWord) {
      setError("No word is currently in focus.");
      return;
    }

    const wordId = sanitizeWordForId(displayWord);
    const contentForWord = generatedContent[wordId];

    if (mode === 'quiz') {
        setSelectedQuizOption(null);
        setQuizFeedback(null);
        setIsQuizAttempted(false);
        const progress = contentForWord?.quiz_progress || [];
        const quizSetLength = contentForWord?.quiz?.length || 0;
        let nextQuestion = 0;
        if (progress.length > 0 && quizSetLength > 0) {
            const answeredIndices = new Set(progress.map(p => p.question_index));
            while(nextQuestion < quizSetLength && answeredIndices.has(nextQuestion)) {
                nextQuestion++;
            }
        }
        setCurrentQuizQuestionIndex(nextQuestion);
    }

    if (!contentForWord || !contentForWord[mode] || (mode === 'quiz' && (!contentForWord.quiz?.length || contentForWord.quiz?.length === 0 ))) {
      handleGenerateExplanation(displayWord, false, false, false, mode, false);
    } else {
      setActiveContentMode(mode); 
    }
  };

  const handleToggleFavorite = async () => {
    const displayWord = getDisplayWord();
    if (!displayWord || !authToken) return;

    const wordId = sanitizeWordForId(displayWord);
    const currentIsFavorite = generatedContent[wordId]?.is_favorite || false;

    setGeneratedContent(prev => ({
      ...prev,
      [wordId]: { ...(prev[wordId] || {}), is_favorite: !currentIsFavorite }
    }));

    try {
      const response = await fetch(`${API_BASE_URL}/toggle_favorite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ word: displayWord }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update favorite status");
      }
      if (activeView === 'profile' && authToken) fetchUserProfile(authToken); 
    } catch (err: any) {
      setError(err.message);
      setGeneratedContent(prev => ({
        ...prev,
        [wordId]: { ...(prev[wordId] || {}), is_favorite: currentIsFavorite }
      }));
    }
  };

  // --- Quiz Interaction Handlers ---
    const handleQuizOptionSelect = (optionKey: string) => {
        const displayWord = getDisplayWord();
        if (!displayWord || isQuizAttempted) return; 

        const wordId = sanitizeWordForId(displayWord);
        const quizSet = generatedContent[wordId]?.quiz;
        if (!quizSet || !quizSet[currentQuizQuestionIndex]) return;

        const question = quizSet[currentQuizQuestionIndex];
        const isCorrect = question.correctOptionKey === optionKey;

        setSelectedQuizOption(optionKey);
        setQuizFeedback({ message: isCorrect ? "Correct!" : `Incorrect. The correct answer was ${question.options[question.correctOptionKey]}. ${question.explanation || ''}`, isCorrect });
        setIsQuizAttempted(true); 

        if (authToken) {
            saveQuizAttempt(displayWord, currentQuizQuestionIndex, optionKey, isCorrect);
        }
    };

    const saveQuizAttempt = async (word: string, questionIndex: number, selectedOptionKey: string, isCorrect: boolean) => {
        if (!authToken) return;
        try {
            const response = await fetch(`${API_BASE_URL}/save_quiz_attempt`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify({
                    word: word,
                    question_index: questionIndex,
                    selected_option_key: selectedOptionKey,
                    is_correct: isCorrect,
                }),
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || "Failed to save quiz attempt");
            }
            const data = await response.json();
            const wordId = sanitizeWordForId(word);
            setGeneratedContent(prev => {
                const updatedWordContent = { ...(prev[wordId] || {}) }; // Ensure prev[wordId] exists
                updatedWordContent.quiz_progress = data.quiz_progress;
                return { ...prev, [wordId]: updatedWordContent };
            });
        } catch (err: any) {
            console.error("Error saving quiz attempt:", err);
        }
    };

    const handleNextQuestion = () => {
        const displayWord = getDisplayWord();
        if (!displayWord) return;
        const wordId = sanitizeWordForId(displayWord);
        const quizSet = generatedContent[wordId]?.quiz;
        if (!quizSet) return;

        setSelectedQuizOption(null);
        setQuizFeedback(null);
        setIsQuizAttempted(false); 

        const progress = generatedContent[wordId]?.quiz_progress || [];
        let nextQuestion = currentQuizQuestionIndex + 1;
        const answeredIndices = new Set(progress.map(p => p.question_index));

        while(nextQuestion < quizSet.length && answeredIndices.has(nextQuestion)) {
            nextQuestion++;
        }
        setCurrentQuizQuestionIndex(nextQuestion);
    };

    const handleFetchNewQuizSet = () => {
        const displayWord = getDisplayWord();
        if(!displayWord) return;
        handleGenerateExplanation(displayWord, false, true, false, 'quiz', false);
    };


  // --- Streak Interaction Handlers ---
  const handleSubTopicClick = (subTopic: string) => {
    if (isLoading) return;
    setIsReviewingStreakWord(false); 
    setWordForReview(null);
    handleGenerateExplanation(subTopic, false, false, true, 'explain', false);
  };

  const handleStreakWordClick = (word: string) => {
    if (isLoading || getDisplayWord() === word) return;

    setIsReviewingStreakWord(true);
    setWordForReview(word);
    
    const wordId = sanitizeWordForId(word);
    if (!generatedContent[wordId] || !generatedContent[wordId]?.explain) {
      handleGenerateExplanation(word, false, false, false, 'explain', false);
    } else {
        setActiveContentMode('explain'); 
    }
  };


  // --- Profile Navigation and Interaction ---
  const handleToggleProfileView = () => {
    if (activeView === 'profile') {
      setActiveView('main');
      mainInputRef.current?.focus();
    } else {
      if (!authToken) {
        setShowAuthModal(true); 
        setAuthMode('login');
        return;
      }
      if (authToken && !userProfileData.isLoading) {
          fetchUserProfile(authToken);
      }
      setActiveView('profile');
    }
  };

  const handleNavigateToWordFromProfile = (word: string) => {
    setActiveView('main'); 
    setInputValue(word); 
    handleGenerateExplanation(word, true, false, false, 'explain', true); 
    mainInputRef.current?.focus();
  };


  // --- Helper to get the word currently being displayed ---
  const getDisplayWord = useCallback(() => {
    return isReviewingStreakWord && wordForReview ? wordForReview : currentFocusWord;
  }, [isReviewingStreakWord, wordForReview, currentFocusWord]);


  // --- Render Functions ---
  const renderAuthModal = () => {
    if (!showAuthModal) return null;
    let isProcessingAuth = false; 
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 dark:bg-opacity-80">
        <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-md relative">
          <button onClick={() => { setShowAuthModal(false); setAuthError(null); setAuthSuccessMessage(null);}} className="absolute top-3 right-3 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
            <X size={24} />
          </button>
          <h2 className="text-2xl sm:text-3xl font-bold mb-6 text-center text-slate-700 dark:text-slate-100">{authMode === 'login' ? 'Login' : 'Sign Up'}</h2>
          {authError && <p className="mb-4 text-red-500 dark:text-red-400 text-sm bg-red-100 dark:bg-red-900 dark:bg-opacity-30 p-3 rounded-md">{authError}</p>}
          {authSuccessMessage && <p className="mb-4 text-green-600 dark:text-green-400 text-sm bg-green-100 dark:bg-green-700 dark:bg-opacity-20 p-3 rounded-md">{authSuccessMessage}</p>}
          <form onSubmit={async (e) => { 
            const formButton = (e.nativeEvent.submitter as HTMLButtonElement);
            if(formButton) formButton.disabled = true; // Disable button on submit
            isProcessingAuth = true; 
            e.preventDefault(); 
            const target = e.target as typeof e.target & {
              username?: { value: string };
              email: { value: string };
              password: { value: string };
            };
            const email = target.email.value;
            const password = target.password.value;
            const username = authMode === 'signup' ? target.username?.value : undefined;
            await handleAuthAction(e, authMode, { username, email, password }); 
            isProcessingAuth = false; 
            if(formButton) formButton.disabled = false; // Re-enable button
          }}>
            {authMode === 'signup' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1" htmlFor="username">Username</label>
                <input type="text" name="username" id="username" required className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 outline-none bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100" />
              </div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1" htmlFor="email">Email</label>
              <input type="email" name="email" id="email" required className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 outline-none bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100" />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-600 dark:text-slate-300 mb-1" htmlFor="password">Password</label>
              <input type="password" name="password" id="password" required className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 outline-none bg-slate-50 dark:bg-slate-700 text-slate-800 dark:text-slate-100" />
            </div>
            <button type="submit" className="w-full bg-sky-600 hover:bg-sky-700 text-white font-semibold py-3 px-4 rounded-lg transition duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 dark:focus:ring-offset-slate-800 disabled:opacity-70 flex items-center justify-center">
              {/* Icon logic can be more complex if tied to a rapidly changing state, consider simplifying or using CSS for spin */}
              {authMode === 'login' ? <LogIn size={20} className="mr-2"/> : <UserIcon size={20} className="mr-2"/>}
              {authMode === 'login' ? 'Login' : 'Sign Up'}
            </button>
          </form>
          <p className="mt-6 text-center text-sm">
            {authMode === 'login' ? (
              <span className="text-slate-600 dark:text-slate-400">Need an account? </span>
            ) : (
              <span className="text-slate-600 dark:text-slate-400">Already have an account? </span>
            )}
            <button onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(null); setAuthSuccessMessage(null); }} className="font-semibold text-sky-600 hover:text-sky-500 dark:text-sky-400 dark:hover:text-sky-300">
              {authMode === 'login' ? 'Sign Up' : 'Login'}
            </button>
          </p>
        </div>
      </div>
    );
  };


  const renderContent = () => {
    const displayWord = getDisplayWord();
    if (!displayWord && !isLoading && !error && activeView === 'main') { 
        return (
            <div className="text-center text-slate-500 dark:text-slate-400 mt-12 flex flex-col items-center">
                <Sparkles size={48} className="mb-4 text-sky-500" />
                <p className="text-lg">Welcome to Tiny Tutor AI!</p>
                <p>Enter a word or concept above to start learning.</p>
                {currentUser && <p className="mt-2">Happy learning, {currentUser.username}!</p>}
            </div>
        );
    }
    if (!displayWord) return null;


    const wordId = sanitizeWordForId(displayWord);
    const content = generatedContent[wordId];

    if (isLoading && (!content || !content[activeContentMode])) { 
      return (
        <div className="flex justify-center items-center h-64">
          <RefreshCw size={32} className="animate-spin text-sky-500" />
          <p className="ml-3 text-slate-600 dark:text-slate-300">Generating content for "{displayWord}" ({activeContentMode})...</p>
        </div>
      );
    }
     if (error && activeView === 'main' && (!content || !content[activeContentMode])) { 
        const isContentSpecificError = error.toLowerCase().includes(displayWord.toLowerCase()) || error.toLowerCase().includes(activeContentMode);
        if (isContentSpecificError || !error.toLowerCase().includes("quiz")) { 
            return <p className="text-red-500 dark:text-red-400 bg-red-100 dark:bg-red-900 dark:bg-opacity-30 p-4 rounded-lg text-center my-4">{error}</p>;
        }
    }


    if (!content && !isLoading && activeView === 'main') return <p className="text-center text-slate-500 dark:text-slate-400 mt-8">No content generated yet for "{displayWord}". Try generating an explanation first.</p>;


    switch (activeContentMode) {
      case 'explain':
        if (!content?.explain && isLoading) return <div className="flex justify-center items-center h-32"><RefreshCw size={24} className="animate-spin text-sky-500" /> <span className="ml-2">Loading explanation...</span></div>;
        if (!content?.explain) return <p className="text-center text-slate-500 dark:text-slate-400 mt-4">No explanation available. Try regenerating.</p>;
        const explanationParts = content.explain.split(/<<([^>]+)>>/g); 
        return (
            <div className="prose dark:prose-invert max-w-none leading-relaxed text-slate-700 dark:text-slate-200">
                {explanationParts.map((part, index) => {
                    if (index % 2 === 1) { 
                        return (
                        <button
                            key={index}
                            onClick={() => handleSubTopicClick(part)}
                            className="text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 font-semibold underline hover:bg-sky-100 dark:hover:bg-sky-700 dark:hover:bg-opacity-30 px-1 py-0.5 rounded transition-colors duration-150 mx-0.5"
                        >
                            {part}
                        </button>
                        );
                    }
                    return part.split('\n').map((line, lineIndex, arr) => ( 
                        <React.Fragment key={`${index}-${lineIndex}`}>
                            {line}
                            {lineIndex < arr.length - 1 && <br />}
                        </React.Fragment>
                    ));
                })}
            </div>
        );

      case 'quiz':
        const quizSet = content?.quiz;
        const quizProgress = content?.quiz_progress || [];

        if (!quizSet || quizSet.length === 0) {
            if (isLoading) return <div className="flex justify-center items-center h-32"><RefreshCw size={24} className="animate-spin text-sky-500" /> <span className="ml-2">Loading quiz...</span></div>;
            return <div className="text-center p-4">
                <p className="text-slate-500 dark:text-slate-400">No quiz questions available for "{displayWord}".</p>
                <button onClick={handleFetchNewQuizSet} className="mt-4 bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-4 rounded-lg transition flex items-center mx-auto">
                    <RefreshCw size={18} className="mr-2"/> Generate New Quiz
                </button>
            </div>;
        }

        if (currentQuizQuestionIndex >= quizSet.length) {
            const relevantAttempts = quizProgress.filter(att => att.question_index < quizSet.length);
            const correctRelevantAttempts = relevantAttempts.filter(att => att.is_correct).length;

            return (
                <div className="p-2 sm:p-4 bg-slate-50 dark:bg-slate-800 rounded-lg shadow">
                    <h3 className="text-xl sm:text-2xl font-bold mb-3 sm:mb-4 text-slate-700 dark:text-slate-100">Quiz Summary for "{displayWord}"</h3>
                    <p className="text-lg mb-4 text-slate-600 dark:text-slate-300">Your Score: <span className="font-bold text-sky-600 dark:text-sky-400">{correctRelevantAttempts} / {quizSet.length}</span></p>
                    <ul className="space-y-3 mb-6">
                        {quizSet.map((q, index) => {
                            const attempt = relevantAttempts.find(a => a.question_index === index);
                            const selectedOptText = attempt ? q.options[attempt.selected_option_key] : "Not Answered";
                            return (
                                <li key={index} className="p-3 border border-slate-200 dark:border-slate-700 rounded-md bg-white dark:bg-slate-700 dark:bg-opacity-50">
                                    <p className="font-semibold text-slate-700 dark:text-slate-200 mb-1">{index + 1}. {q.question}</p>
                                    <p className={`text-sm ${attempt?.is_correct ? 'text-green-600 dark:text-green-400' : 'text-red-500 dark:text-red-400'}`}>
                                        Your answer: {selectedOptText} {attempt && (attempt.is_correct ? <CheckCircle size={16} className="inline ml-1" /> : <XCircle size={16} className="inline ml-1" />)}
                                    </p>
                                    {attempt && !attempt.is_correct && <p className="text-sm text-slate-500 dark:text-slate-400">Correct answer: {q.options[q.correctOptionKey]}</p>}
                                </li>
                            );
                        })}
                    </ul>
                    <button onClick={handleFetchNewQuizSet} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2.5 px-4 rounded-lg transition flex items-center justify-center">
                        <RefreshCw size={18} className="mr-2"/> More Questions for "{displayWord}"
                    </button>
                </div>
            );
        }

        const question = quizSet[currentQuizQuestionIndex];
        if (!question) return <p className="text-center">Error loading question.</p>;
        const currentQuestionAttempt = quizProgress.find(a => a.question_index === currentQuizQuestionIndex);
        const questionIsAlreadyAnswered = !!currentQuestionAttempt;


        return (
            <div className="p-3 sm:p-4 bg-slate-50 dark:bg-slate-800 rounded-lg shadow">
                <p className="text-sm text-slate-500 dark:text-slate-400 mb-1">Question {currentQuizQuestionIndex + 1} of {quizSet.length}</p>
                <h3 className="text-lg sm:text-xl font-semibold mb-4 text-slate-800 dark:text-slate-100">{question.question}</h3>
                <div className="space-y-2.5 mb-4">
                    {Object.entries(question.options).map(([key, text]) => {
                        const isSelectedUserChoice = selectedQuizOption === key;
                        const isSavedAttemptChoice = currentQuestionAttempt?.selected_option_key === key;
                        const isCorrectAnswer = question.correctOptionKey === key;
                        
                        let buttonClass = "w-full text-left p-3 rounded-lg border transition-all duration-150 ease-in-out text-slate-700 dark:text-slate-200 ";

                        if (isQuizAttempted || questionIsAlreadyAnswered) { 
                            if ((isSelectedUserChoice && quizFeedback?.isCorrect) || (isSavedAttemptChoice && currentQuestionAttempt?.is_correct)) {
                                buttonClass += "bg-green-100 dark:bg-green-700 dark:bg-opacity-40 border-green-400 dark:border-green-500 ring-2 ring-green-500"; 
                            } else if ((isSelectedUserChoice && !quizFeedback?.isCorrect) || (isSavedAttemptChoice && !currentQuestionAttempt?.is_correct)) {
                                buttonClass += "bg-red-100 dark:bg-red-700 dark:bg-opacity-40 border-red-400 dark:border-red-500 ring-2 ring-red-500"; 
                            } else if (isCorrectAnswer) {
                                buttonClass += "bg-green-50 dark:bg-green-600 dark:bg-opacity-30 border-green-300 dark:border-green-600"; 
                            } else {
                                 buttonClass += "bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 opacity-70"; 
                            }
                        } else { 
                             buttonClass += "bg-white dark:bg-slate-700 border-slate-300 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-600 focus:ring-2 focus:ring-sky-500 dark:focus:ring-sky-400 outline-none";
                        }
                        return (
                            <button
                                key={key}
                                onClick={() => handleQuizOptionSelect(key)}
                                disabled={isQuizAttempted || questionIsAlreadyAnswered} 
                                className={buttonClass}
                            >
                                {text}
                            </button>
                        );
                    })}
                </div>
                {quizFeedback && (
                    <div className={`p-3 rounded-md text-sm mb-4 ${quizFeedback.isCorrect ? 'bg-green-100 dark:bg-green-800 dark:bg-opacity-50 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-800 dark:bg-opacity-50 text-red-700 dark:text-red-300'}`}>
                        {quizFeedback.message}
                    </div>
                )}
                {(isQuizAttempted || questionIsAlreadyAnswered) && (
                    <button onClick={handleNextQuestion} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2.5 px-4 rounded-lg transition">
                        {currentQuizQuestionIndex < quizSet.length - 1 ? 'Next Question' : 'View Summary'} <ChevronRight size={18} className="inline ml-1"/>
                    </button>
                )}
            </div>
        );

      case 'fact':
        if (!content?.fact && isLoading) return <div className="flex justify-center items-center h-32"><RefreshCw size={24} className="animate-spin text-sky-500" /> <span className="ml-2">Loading facts...</span></div>;
        if (!content?.fact || content.fact.length === 0) return <p className="text-center text-slate-500 dark:text-slate-400 mt-4">No facts available. Try regenerating.</p>;
        return (
          <ul className="space-y-3 list-disc list-inside pl-2 text-slate-700 dark:text-slate-200">
            {content.fact.map((f, index) => (
              <li key={index} className="bg-slate-50 dark:bg-slate-700 dark:bg-opacity-40 p-3 rounded-md shadow-sm">{f}</li>
            ))}
          </ul>
        );

      case 'image':
        if (!content?.image && isLoading) return <div className="flex justify-center items-center h-64"><RefreshCw size={24} className="animate-spin text-sky-500" /> <span className="ml-2">Loading image...</span></div>;
        if (!content?.image) return <p className="text-center text-slate-500 dark:text-slate-400 mt-4">No image available. Try regenerating.</p>;
        return (
            <div className="flex justify-center items-center bg-slate-100 dark:bg-slate-800 p-2 rounded-lg shadow-md">
                <img
                    src={content.image}
                    alt={`Generated image for ${displayWord}`}
                    className="max-w-full max-h-[70vh] h-auto rounded-md object-contain"
                    onError={(e) => {
                        (e.target as HTMLImageElement).src = `https://placehold.co/600x400/E2E8F0/475569?text=Image+Not+Found`;
                        (e.target as HTMLImageElement).alt = `Placeholder for ${displayWord} - Image failed to load`;
                    }}
                />
            </div>
        );
      case 'deep_dive':
        if (!content?.deep_dive && isLoading) return <div className="flex justify-center items-center h-32"><RefreshCw size={24} className="animate-spin text-sky-500" /> <span className="ml-2">Loading deep dive...</span></div>;
        if (!content?.deep_dive) return <p className="text-center text-slate-500 dark:text-slate-400 mt-4">No deep dive content available. Try regenerating.</p>;
        const deepDiveParts = content.deep_dive.split(/<<([^>]+)>>/g);
        return (
            <div className="prose dark:prose-invert max-w-none leading-relaxed text-slate-700 dark:text-slate-200">
                {deepDiveParts.map((part, index) => {
                    if (index % 2 === 1) {
                        return (
                        <button
                            key={index}
                            onClick={() => handleSubTopicClick(part)}
                            className="text-sky-600 dark:text-sky-400 hover:text-sky-700 dark:hover:text-sky-300 font-semibold underline hover:bg-sky-100 dark:hover:bg-sky-700 dark:hover:bg-opacity-30 px-1 py-0.5 rounded transition-colors duration-150 mx-0.5"
                        >
                            {part}
                        </button>
                        );
                    }
                    return part.split('\n').map((line, lineIndex, arr) => ( 
                        <React.Fragment key={`${index}-${lineIndex}`}>
                            {line}
                            {lineIndex < arr.length - 1 && <br />}
                        </React.Fragment>
                    ));
                })}
            </div>
        );
      default:
        return <p className="text-center">Select a content mode.</p>;
    }
  };


  // --- Main App JSX ---
  return (
    <div className={`min-h-screen flex flex-col font-sans transition-colors duration-300 ${darkMode ? 'dark bg-slate-900 text-slate-100' : 'bg-slate-100 text-slate-900'}`}>
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white dark:bg-slate-800 shadow-md">
        <div className="container mx-auto px-4 sm:px-6 py-3 flex justify-between items-center">
          <div className="flex items-center">
            <Brain size={28} className="text-sky-500 mr-2" />
            <h1 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100">Tiny Tutor AI</h1>
          </div>
          <div className="flex items-center space-x-2 sm:space-x-3">
            <button onClick={() => setDarkMode(!darkMode)} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" aria-label="Toggle dark mode">
              {darkMode ? <Sun size={20} /> : <Moon size={20} />}
            </button>
            {currentUser ? (
              <>
                <button onClick={handleToggleProfileView} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" aria-label="View Profile">
                  <UserIcon size={20} />
                </button>
                <button onClick={() => handleLogout()} className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors" aria-label="Logout">
                  <LogOut size={20} className="text-red-500 dark:text-red-400" />
                </button>
              </>
            ) : (
              <button onClick={() => { setShowAuthModal(true); setAuthMode('login'); }} className="flex items-center bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-3 sm:px-4 rounded-lg transition-colors text-sm sm:text-base">
                <LogIn size={18} className="mr-1 sm:mr-2" /> Login
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Conditional Rendering for Main View or Profile Page */}
      {activeView === 'main' ? (
        <main className="flex-grow container mx-auto px-4 sm:px-6 py-6 sm:py-8 flex flex-col">
          {/* Input Area */}
          <div className="mb-6 sm:mb-8">
            <form onSubmit={(e) => { e.preventDefault(); handleGenerateExplanation(inputValue, false, false, false, 'explain', true);}} className="flex items-center gap-2 sm:gap-3 bg-white dark:bg-slate-800 p-2 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
              <Search size={20} className="text-slate-400 dark:text-slate-500 ml-2" />
              <input
                ref={mainInputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Enter a word or concept (e.g., photosynthesis)"
                className="flex-grow p-2.5 sm:p-3 bg-transparent focus:outline-none text-slate-800 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 text-sm sm:text-base"
                disabled={isLoading && !getDisplayWord()}
              />
              <button type="submit" disabled={isLoading && !getDisplayWord()} className="bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2.5 px-4 sm:px-5 rounded-lg transition-colors flex items-center disabled:opacity-70">
                { (isLoading && !getDisplayWord()) ? <RefreshCw size={18} className="animate-spin sm:mr-2" /> : <Send size={18} className="sm:mr-2" /> }
                <span className="hidden sm:inline">Generate</span>
              </button>
            </form>
          </div>

          {/* Live Streak Display */}
          {liveStreak && liveStreak.score > 0 && (
            <div className="mb-4 p-3 bg-sky-50 dark:bg-sky-900 dark:bg-opacity-50 border border-sky-200 dark:border-sky-700 rounded-lg text-sm text-sky-700 dark:text-sky-300 shadow">
              <span className="font-semibold">Live Streak: {liveStreak.score}</span>
              <div className="mt-1 flex flex-wrap gap-1 items-center">
                {liveStreak.words.map((word, index) => (
                  <React.Fragment key={index}>
                    <button
                      onClick={() => handleStreakWordClick(word)}
                      className={`px-1.5 py-0.5 rounded hover:bg-sky-100 dark:hover:bg-sky-700 transition-colors ${getDisplayWord() === word ? 'font-bold ring-1 ring-sky-500 bg-sky-100 dark:bg-sky-700' : ''}`}
                    >
                      {word}
                    </button>
                    {index < liveStreak.words.length - 1 && <ChevronRight size={14} className="opacity-50" />}
                  </React.Fragment>
                ))}
              </div>
               {isReviewingStreakWord && wordForReview && <p className="mt-1 text-xs italic opacity-80">(Reviewing: {wordForReview})</p>}
            </div>
          )}

          {/* Content Area Header (Word, Favorite, Refresh) */}
          {getDisplayWord() && (
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 p-3 bg-white dark:bg-slate-800 rounded-lg shadow border border-slate-200 dark:border-slate-700">
                <div className="flex items-center mb-2 sm:mb-0">
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-800 dark:text-slate-100 mr-3 capitalize">
                        {getDisplayWord()}
                    </h2>
                    <button onClick={handleToggleFavorite} className={`p-1.5 rounded-full transition-colors ${generatedContent[sanitizeWordForId(getDisplayWord()!)]?.is_favorite ? 'text-pink-500 dark:text-pink-400 hover:bg-pink-100 dark:hover:bg-pink-700 dark:hover:bg-opacity-40' : 'text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`} aria-label="Toggle favorite">
                        <Heart size={20} fill={generatedContent[sanitizeWordForId(getDisplayWord()!)]?.is_favorite ? 'currentColor' : 'none'} />
                    </button>
                </div>
                <div className="flex items-center space-x-2">
                    <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">Content Actions:</span>
                    <button
                        onClick={() => {
                            const currentWord = getDisplayWord();
                            if (currentWord) {
                                handleGenerateExplanation(currentWord, false, true, false, activeContentMode, false);
                            }
                        }}
                        disabled={isLoading}
                        className="p-1.5 sm:p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 disabled:opacity-50"
                        title="Regenerate Current Content"
                        aria-label="Regenerate Current Content"
                    >
                        <RefreshCw size={18} className={isLoading && getDisplayWord() && generatedContent[sanitizeWordForId(getDisplayWord()!)]?.[activeContentMode] ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>
          )}

          {/* Content Mode Buttons */}
          {getDisplayWord() && (
            <div className="mb-4 sm:mb-6 flex flex-wrap gap-2 sm:gap-3">
              {(['explain', 'quiz', 'fact', 'image', 'deep_dive'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => handleModeChange(mode)}
                  disabled={isLoading}
                  className={`px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ease-in-out flex items-center disabled:opacity-60
                    ${activeContentMode === mode
                      ? 'bg-sky-500 text-white shadow-md ring-2 ring-sky-300 dark:ring-sky-600'
                      : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 border border-slate-300 dark:border-slate-600 focus:ring-2 focus:ring-sky-400 dark:focus:ring-sky-500 outline-none'
                    }`}
                >
                  {mode === 'explain' && <FileText size={16} className="mr-1.5" />}
                  {mode === 'quiz' && <Edit2 size={16} className="mr-1.5" />}
                  {mode === 'fact' && <Info size={16} className="mr-1.5" />}
                  {mode === 'image' && <ImageIcon size={16} className="mr-1.5" />}
                  {mode === 'deep_dive' && <Sparkles size={16} className="mr-1.5" />}
                  {mode.charAt(0).toUpperCase() + mode.slice(1).replace('_', ' ')}
                </button>
              ))}
            </div>
          )}

          {/* Main Content Display Area */}
          <div className="flex-grow bg-white dark:bg-slate-800 p-4 sm:p-6 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-y-auto min-h-[300px]"> 
            {renderContent()}
            <div ref={contentEndRef} /> 
          </div>

        </main>
      ) : (
        <ProfilePage
          currentUser={currentUser}
          userProfileData={userProfileData}
          onSelectWord={handleNavigateToWordFromProfile}
          onNavigateBack={() => { setActiveView('main'); mainInputRef.current?.focus(); }}
          onRefreshProfile={() => authToken ? fetchUserProfile(authToken) : null}
        />
      )}

      {renderAuthModal()}

      {error && activeView === 'main' && (!getDisplayWord() || !error.toLowerCase().includes(getDisplayWord()!.toLowerCase() || '___')) && ( 
        <div className="fixed bottom-4 right-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg shadow-md z-50 dark:bg-red-900 dark:text-red-300 dark:border-red-700" role="alert">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
          <button onClick={() => setError(null)} className="absolute top-0 bottom-0 right-0 px-3 py-2">
            <X size={18} />
          </button>
        </div>
      )}

    </div>
  );
}

export default App;



import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Heart, BookOpen, User as UserIconLucide, LogOut, LogIn, HelpCircle, Loader2, Image as ImageIcon, FileText, Brain, PlusCircle } from 'lucide-react';
import ProfilePage from './ProfilePage'; // Assuming ProfilePage.tsx is in the same directory or ./pages/ProfilePage.tsx
import './App.css';

// --- Constants ---
const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';
const AUTO_ADVANCE_DELAY = 1500; // ms

// --- Types ---
interface UserProfile {
  username: string;
  email?: string;
  tier?: string; // free or premium
  total_words_explored?: number;
  explored_words?: WordHistoryEntry[];
  favorite_words?: WordHistoryEntry[];
  streak_history?: StreakEntry[];
  created_at?: string;
}

interface WordHistoryEntry {
  id: string; // sanitized word
  word: string; // original word
  first_explored_at: string;
  last_explored_at: string;
  is_favorite: boolean;
  modes_generated?: string[];
  quiz_progress?: QuizAttempt[];
}

interface StreakEntry {
  id: string;
  words_explored_count: number;
  date: string;
}

interface QuizAnswer {
  questionIndex: number;
  selectedOptionKey: string;
  isCorrect: boolean;
}

interface QuizAttempt {
  question_index: number;
  selected_option_key: string;
  is_correct: boolean;
  timestamp: string;
}

interface WordContent {
  explain?: string;
  image?: string; // URL or base64
  fact?: string;
  quiz?: QuizQuestion[];
  deep_dive?: string;
}

interface QuizQuestion {
  question: string;
  options: { [key: string]: string };
  correct_answer_key: string;
  explanation?: string;
}

type AppView = 'main' | 'profile' | 'auth';

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('main');
  const [searchTerm, setSearchTerm] = useState('');
  const [displayWord, setDisplayWord] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<string>('explain');
  const [wordContent, setWordContent] = useState<WordContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  const [currentQuizQuestionIndex, setCurrentQuizQuestionIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([]);
  const [showQuizResult, setShowQuizResult] = useState(false);
  const [quizScore, setQuizScore] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);

  const modes = [
    { id: 'explain', label: 'Explain', icon: FileText },
    { id: 'image', label: 'Image', icon: ImageIcon },
    { id: 'fact', label: 'Fact', icon: HelpCircle },
    { id: 'quiz', label: 'Quiz', icon: Brain },
    { id: 'deep_dive', label: 'Deep Dive', icon: BookOpen },
  ];

  useEffect(() => {
    if (currentView === 'main' && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [currentView]);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      fetchUserProfile(token);
    }
  }, []);

  useEffect(() => {
    if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
    }
    if (selectedMode !== 'quiz' || (wordContent && !wordContent.quiz)) {
        resetQuizState();
    }
  }, [selectedMode, displayWord, wordContent]);

  const getSanitizedWord = (word: string) => word.trim().toLowerCase();
  const getDisplayWord = () => displayWord || '';

  const fetchApi = useCallback(async (endpoint: string, method: string = 'GET', body: any = null, token?: string | null) => {
    setIsLoading(true);
    setError(null);
    setAuthError(null);

    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    const currentToken = token || localStorage.getItem('authToken');
    if (currentToken) {
      headers['Authorization'] = `Bearer ${currentToken}`;
    }

    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : null,
      });

      if (response.status === 401) {
        handleLogout();
        setAuthError("Session expired. Please log in again.");
        setCurrentView('auth');
        setIsAuthModalOpen(true);
        return null;
      }
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      return await response.json();
    } catch (err: any) {
      console.error(`API Error (${method} ${endpoint}):`, err);
      const message = err.message || 'An unexpected error occurred.';
      setError(message);
      if (endpoint.includes('/users/profile') || endpoint.includes('/auth')) {
        setAuthError(message);
      }
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchWordContent = useCallback(async (word: string, mode: string) => {
    if (!word) return;
    const sanitizedWord = getSanitizedWord(word);
    const data = await fetchApi(`/words/${sanitizedWord}/${mode}`);
    if (data && data.content) {
      setWordContent(prev => ({ ...prev, [mode]: data.content }));
      if (mode === 'quiz' && data.content) {
        resetQuizState();
        if (Array.isArray(data.content) && data.content.every((q: any) => q.question && q.options && q.correct_answer_key)) {
            // Correct format
        } else {
            console.warn("Received quiz content in unexpected format.");
            setError("Quiz data is not in the expected format.");
            setWordContent(prev => ({ ...prev, quiz: undefined }));
        }
      }
      if (userProfile) {
        fetchUserProfile(localStorage.getItem('authToken'));
      }
    } else if (data && data.message && mode === 'image') {
        setWordContent(prev => ({ ...prev, image: data.message }));
    } else {
      setWordContent(prev => ({ ...prev, [mode]: undefined }));
    }
  }, [fetchApi, userProfile]);

  const fetchUserProfile = useCallback(async (token: string | null) => {
    if (!token) {
      setUserProfile(null);
      return;
    }
    const data = await fetchApi('/users/profile', 'GET', null, token);
    if (data && data.user) {
      setUserProfile(data.user);
    }
  }, [fetchApi]);

  const handleSearch = async (e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    if (!searchTerm.trim() || isLoading) return;
    setDisplayWord(searchTerm.trim());
    setSelectedMode('explain');
    setWordContent(null);
    resetQuizState();
    await fetchWordContent(searchTerm.trim(), 'explain');
  };

  const handleModeChange = (mode: string) => {
    if (isLoading) return;
    setSelectedMode(mode);
    if (displayWord && (!wordContent || !wordContent[mode as keyof WordContent])) {
      fetchWordContent(displayWord, mode);
    }
  };

  const handleToggleFavorite = async (word: string | null) => {
    if (!word || !userProfile) {
      setAuthError("Please log in to save favorites.");
      setCurrentView('auth');
      setIsAuthModalOpen(true);
      setAuthMode('login');
      return;
    }
    const sanitizedWord = getSanitizedWord(word);
    const isCurrentlyFavorite = userProfile.favorite_words?.some(favWord => favWord.id === sanitizedWord);
    const endpoint = `/users/favorites/${sanitizedWord}`;
    const method = isCurrentlyFavorite ? 'DELETE' : 'POST';
    const result = await fetchApi(endpoint, method);
    if (result) {
      fetchUserProfile(localStorage.getItem('authToken'));
    }
  };

  const handleAuthAction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const email = (form.elements.namedItem('email') as HTMLInputElement)?.value;
    const password = (form.elements.namedItem('password') as HTMLInputElement)?.value;
    const username = (form.elements.namedItem('username') as HTMLInputElement)?.value;
    const endpoint = authMode === 'login' ? '/auth/login' : '/auth/signup';
    const payload: any = { email, password };
    if (authMode === 'signup') payload.username = username;

    const data = await fetchApi(endpoint, 'POST', payload);
    if (data && data.token) {
      localStorage.setItem('authToken', data.token);
      await fetchUserProfile(data.token);
      setIsAuthModalOpen(false);
      setCurrentView('main');
      setAuthError(null);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('authToken');
    setUserProfile(null);
    setDisplayWord(null);
    setWordContent(null);
    setCurrentView('main');
    setError(null);
    setAuthError(null);
    console.log("User logged out");
  };

  const resetQuizState = () => {
    setCurrentQuizQuestionIndex(0);
    setQuizAnswers([]);
    setShowQuizResult(false);
    setQuizScore(0);
  };

  const handleQuizOptionSelect = (questionIndex: number, selectedOptionKey: string) => {
    if (!wordContent?.quiz || !wordContent.quiz[questionIndex]) return;
    const currentQuestion = wordContent.quiz[questionIndex];
    const isCorrect = currentQuestion.correct_answer_key === selectedOptionKey;

    const newAnswer: QuizAnswer = { questionIndex, selectedOptionKey, isCorrect };
    setQuizAnswers(prevAnswers => {
      const existingAnswerIndex = prevAnswers.findIndex(ans => ans.questionIndex === questionIndex);
      if (existingAnswerIndex > -1) {
        const updatedAnswers = [...prevAnswers];
        updatedAnswers[existingAnswerIndex] = newAnswer;
        return updatedAnswers;
      }
      return [...prevAnswers, newAnswer];
    });

    if (userProfile && displayWord) {
        fetchApi(`/words/${getSanitizedWord(displayWord)}/quiz/attempt`, 'POST', {
            question_index: questionIndex,
            selected_option_key: selectedOptionKey,
            is_correct: isCorrect
        });
    }

    if (questionIndex < wordContent.quiz.length - 1) {
      setTimeout(() => setCurrentQuizQuestionIndex(questionIndex + 1), AUTO_ADVANCE_DELAY);
    } else {
      setTimeout(() => {
        let finalScore = 0;
        
        // Ensure the latest answer is part of the calculation
        let currentAnswersForScore = [...quizAnswers];
        const justAnsweredIndex = currentAnswersForScore.findIndex(a => a.questionIndex === questionIndex);
        
        // Update or add the newAnswer to currentAnswersForScore for accurate scoring
        if (justAnsweredIndex > -1) {
            currentAnswersForScore[justAnsweredIndex] = newAnswer; 
        } else {
            // If newAnswer for the current questionIndex is not found, add it.
            currentAnswersForScore.push(newAnswer);
        }
        
        currentAnswersForScore.forEach((ans: QuizAnswer) => {
            if (ans.isCorrect) finalScore++;
        });
        setQuizScore(finalScore);
        setShowQuizResult(true);
      }, AUTO_ADVANCE_DELAY);
    }
  };

  const handleRetakeQuiz = () => {
    resetQuizState();
  };

  const renderAuthModal = () => {
    if (!isAuthModalOpen && currentView !== 'auth') return null;
    if (currentView === 'auth' && !isAuthModalOpen) setIsAuthModalOpen(true);

    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
        <div className="bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-md relative">
          <button onClick={() => { setIsAuthModalOpen(false); if (currentView === 'auth') setCurrentView('main'); }} className="absolute top-3 right-3 text-slate-400 hover:text-slate-200 transition-colors">&times;</button>
          <h2 className="text-2xl font-semibold text-center text-slate-100 mb-6">{authMode === 'login' ? 'Login' : 'Sign Up'}</h2>
          {authError && <p className="bg-red-500/20 text-red-400 border border-red-500/30 p-3 rounded-md text-sm mb-4">{authError}</p>}
          <form onSubmit={handleAuthAction}>
            {authMode === 'signup' && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-slate-300 mb-1" htmlFor="username">Username</label>
                <input type="text" name="username" id="username" required className="w-full p-2.5 rounded-md bg-slate-700 text-slate-100 border border-slate-600 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none" />
              </div>
            )}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-300 mb-1" htmlFor="email">Email</label>
              <input type="email" name="email" id="email" required className="w-full p-2.5 rounded-md bg-slate-700 text-slate-100 border border-slate-600 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none" />
            </div>
            <div className="mb-6">
              <label className="block text-sm font-medium text-slate-300 mb-1" htmlFor="password">Password</label>
              <input type="password" name="password" id="password" required className="w-full p-2.5 rounded-md bg-slate-700 text-slate-100 border border-slate-600 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none" />
            </div>
            <button type="submit" disabled={isLoading} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold p-3 rounded-md transition-colors duration-150 ease-in-out disabled:opacity-60 flex items-center justify-center">
              {isLoading && <Loader2 size={20} className="animate-spin mr-2" />}
              {authMode === 'login' ? 'Login' : 'Sign Up'}
            </button>
          </form>
          <p className="text-center text-sm text-slate-400 mt-6">
            {authMode === 'login' ? "Don't have an account? " : "Already have an account? "}
            <button onClick={() => { setAuthMode(authMode === 'login' ? 'signup' : 'login'); setAuthError(null); }} className="text-purple-400 hover:text-purple-300 font-semibold">
              {authMode === 'login' ? 'Sign Up' : 'Login'}
            </button>
          </p>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (isLoading && !wordContent) return <div className="flex justify-center items-center h-64"><Loader2 size={32} className="animate-spin text-purple-500" /> <span className="ml-3 text-slate-600">Loading content...</span></div>;
    if (error && selectedMode !== 'image') return <div className="text-red-500 bg-red-500/10 p-4 rounded-md border border-red-500/20">Error: {error}</div>;
    if (!displayWord && !error && !authError) return <div className="text-center text-slate-500 py-10 px-4">Enter a word above and press Enter or click Search to begin exploring.</div>;

    switch (selectedMode) {
      case 'explain':
        const explainContent = wordContent?.explain;
        return <div className="prose prose-sm sm:prose-base max-w-none text-slate-700 whitespace-pre-wrap">{explainContent || (isLoading ? 'Loading explanation...' : 'No explanation available.')}</div>;
      case 'image':
        const imageContent = wordContent?.image;
        if (isLoading && !imageContent) return <div className="flex justify-center items-center h-64"><Loader2 size={32} className="animate-spin text-purple-500" /> <span className="ml-3 text-slate-600">Generating image... This may take a moment.</span></div>;
        if (error && !imageContent) return <div className="text-red-500 bg-red-500/10 p-4 rounded-md border border-red-500/20">Error generating image: {error}</div>;
        if (typeof imageContent === 'string' && imageContent.startsWith('data:image')) {
            return <img src={imageContent} alt={`Generated image for ${displayWord}`} className="rounded-md shadow-md max-w-full h-auto mx-auto" onError={(e) => e.currentTarget.src = 'https://placehold.co/600x400/E2E8F0/AAAAAA?text=Image+Error'}/>;
        }
        if (typeof imageContent === 'string' && imageContent.includes("generating")) {
            return <div className="text-center text-slate-600 py-10"><Loader2 size={24} className="animate-spin inline mr-2" />{imageContent}</div>;
        }
        return <div className="text-slate-500">No image available or still loading. Try refreshing if it takes too long.</div>;
      case 'fact':
        const factContent = wordContent?.fact;
        return <div className="prose prose-sm sm:prose-base max-w-none text-slate-700 whitespace-pre-wrap">{factContent || (isLoading ? 'Loading fact...' : 'No fact available.')}</div>;
      case 'quiz':
        if (isLoading && !wordContent?.quiz) return <div className="flex justify-center items-center h-64"><Loader2 size={32} className="animate-spin text-purple-500" /> <span className="ml-3 text-slate-600">Loading quiz...</span></div>;
        if (!wordContent?.quiz || wordContent.quiz.length === 0) return <div className="text-slate-500">No quiz available for this word.</div>;

        const quizQuestions = wordContent.quiz as QuizQuestion[];

        if (showQuizResult) {
          return (
            <div className="text-center">
              <h3 className="text-xl font-semibold mb-3 text-slate-700">Quiz Completed!</h3>
              <p className="text-lg mb-4 text-slate-600">Your score: <span className="font-bold text-purple-600">{quizScore}</span> / {quizQuestions.length}</p>
              <div className="mb-6 space-y-3">
                {quizQuestions.map((q: QuizQuestion, idx: number) => {
                  const userAnswer = quizAnswers.find(a => a.questionIndex === idx);
                  return (
                    <div key={idx} className={`p-3 rounded-md text-left ${userAnswer?.isCorrect ? 'bg-green-500/10 border-l-4 border-green-500' : 'bg-red-500/10 border-l-4 border-red-500'}`}>
                      <p className="font-medium text-sm text-slate-700">{q.question}</p>
                      <p className="text-xs text-slate-500">Your answer: {userAnswer ? q.options[userAnswer.selectedOptionKey] : 'Not answered'} ({userAnswer?.isCorrect ? 'Correct' : 'Incorrect'})</p>
                      {!userAnswer?.isCorrect && <p className="text-xs text-green-600">Correct: {q.options[q.correct_answer_key]}</p>}
                    </div>
                  );
                })}
              </div>
              <button onClick={handleRetakeQuiz} className="bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-6 rounded-md transition-colors">
                Retake Quiz
              </button>
            </div>
          );
        }

        const currentQuestion = quizQuestions[currentQuizQuestionIndex];
        if (!currentQuestion) return <div className="text-slate-500">Loading question...</div>;
        const userAnsweredThis = quizAnswers.find(ans => ans.questionIndex === currentQuizQuestionIndex);

        return (
          <div>
            <p className="text-sm text-slate-500 mb-1">Question {currentQuizQuestionIndex + 1} of {quizQuestions.length}</p>
            <h3 className="text-md sm:text-lg font-semibold mb-4 text-slate-700">{currentQuestion.question}</h3>
            <div className="space-y-2.5">
              {Object.entries(currentQuestion.options).map(([key, optionText]) => {
                const isSelected = userAnsweredThis?.selectedOptionKey === key;
                let buttonClass = "w-full text-left p-3 rounded-md border transition-all duration-150 ease-in-out text-sm ";
                if (userAnsweredThis) {
                  if (isSelected && userAnsweredThis.isCorrect) buttonClass += "bg-green-500/20 border-green-600 text-green-700 font-medium";
                  else if (isSelected && !userAnsweredThis.isCorrect) buttonClass += "bg-red-500/20 border-red-600 text-red-700 font-medium";
                  else if (currentQuestion.correct_answer_key === key) buttonClass += "bg-green-500/10 border-green-500/50 text-slate-600";
                  else buttonClass += "bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200/70";
                } else {
                  buttonClass += "bg-white border-slate-300 text-slate-700 hover:bg-purple-500/10 hover:border-purple-500";
                }

                return (
                  <button
                    key={key}
                    onClick={() => !userAnsweredThis && handleQuizOptionSelect(currentQuizQuestionIndex, key)}
                    disabled={!!userAnsweredThis || isLoading}
                    className={buttonClass}
                  >
                    <span className={`font-semibold mr-2 ${isSelected && userAnsweredThis ? '' : 'text-purple-600'}`}>{key}.</span> {optionText}
                  </button>
                );
              })}
            </div>
          </div>
        );

      case 'deep_dive':
        const deepDiveContent = wordContent?.deep_dive;
        return <div className="prose prose-sm sm:prose-base max-w-none text-slate-700 whitespace-pre-wrap">{deepDiveContent || (isLoading ? 'Loading deep dive...' : 'No deep dive available.')}</div>;
      default:
        return <div className="text-slate-500">Select a mode to see content.</div>;
    }
  };

  const isFavoriteCurrent = userProfile?.favorite_words?.some(favWord => favWord.id === getSanitizedWord(getDisplayWord())) || false;

  if (currentView === 'profile') {
    return <ProfilePage userProfile={userProfile} onNavigateBack={() => setCurrentView('main')} onLogout={handleLogout} fetchUserProfile={() => fetchUserProfile(localStorage.getItem('authToken'))} />;
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center p-2 sm:p-4 md:p-6 font-sans">
      <header className="w-full max-w-3xl mb-4 sm:mb-6 flex justify-between items-center">
        <div className="flex items-center">
          <Brain size={28} className="text-purple-400 mr-2" />
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight bg-gradient-to-r from-purple-400 to-pink-500 text-transparent bg-clip-text">Tiny Tutor AI</h1>
        </div>
        <div className="flex items-center space-x-2 sm:space-x-3">
          {userProfile ? (
            <>
              <button onClick={() => setCurrentView('profile')} title="View Profile" className="p-2 rounded-full hover:bg-white/10 transition-colors">
                <UserIconLucide size={20} className="text-slate-300" />
              </button>
              <button onClick={handleLogout} title="Logout" className="p-2 rounded-full hover:bg-white/10 transition-colors">
                <LogOut size={20} className="text-slate-300" />
              </button>
            </>
          ) : (
            <button onClick={() => { setCurrentView('auth'); setAuthMode('login'); setIsAuthModalOpen(true); }} title="Login" className="p-2 rounded-full hover:bg-white/10 transition-colors">
              <LogIn size={20} className="text-slate-300" />
            </button>
          )}
        </div>
      </header>

      <main className="w-full max-w-3xl">
        <form onSubmit={handleSearch} className="flex items-center mb-3 sm:mb-4 p-1 bg-slate-800 rounded-full shadow-lg focus-within:ring-2 focus-within:ring-purple-500 transition-all">
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Enter a word (e.g., Photosynthesis, Gravity)"
            className="flex-grow p-2.5 sm:p-3 bg-transparent text-sm sm:text-base text-slate-100 focus:outline-none rounded-full pl-4"
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading || !searchTerm.trim()} className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-4 sm:px-6 py-2 sm:py-2.5 rounded-full text-sm transition-colors duration-150 ease-in-out disabled:opacity-60 flex items-center">
            {isLoading && !wordContent ? <Loader2 size={18} className="animate-spin mr-2" /> : <PlusCircle size={16} className="mr-1.5" />}
            Search
          </button>
        </form>

        {(error && !displayWord) && <p className="text-center text-red-400 bg-red-500/10 p-3 rounded-md mb-4">{error}</p>}
        {(authError && !userProfile) && <p className="text-center text-yellow-400 bg-yellow-500/10 p-3 rounded-md mb-4">{authError}</p>}

        {(displayWord || error || authError) && (
          <div className="bg-slate-800/70 backdrop-blur-md rounded-lg shadow-xl overflow-hidden">
            <div className="p-3 sm:p-4 border-b border-slate-700 flex flex-col sm:flex-row justify-between items-center">
              <div className="flex items-center mb-2 sm:mb-0">
                {displayWord && <h2 className="text-lg sm:text-xl font-semibold text-slate-100 mr-3">{displayWord}</h2>}
                {isLoading && wordContent && <Loader2 size={18} className="animate-spin text-purple-400" />}
              </div>
              <div className="flex items-center space-x-1 sm:space-x-1.5">
                {modes.map(modeInfo => (
                  <button
                    key={modeInfo.id}
                    onClick={() => handleModeChange(modeInfo.id)}
                    disabled={(!displayWord && !error && !authError) || isLoading}
                    title={modeInfo.label}
                    className={`flex items-center text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-full transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50
                            ${selectedMode === modeInfo.id ? 'bg-purple-500 text-white shadow-md' : 'bg-white/10 hover:bg-white/20 text-slate-300 hover:text-slate-100'}
                            ${(!displayWord && !error && !authError) ? 'opacity-50 cursor-not-allowed' : ''}
                            ${isLoading && selectedMode !== modeInfo.id ? 'opacity-70 cursor-wait' : ''} 
                            `}
                  >
                    <modeInfo.icon size={12} className="mr-1 sm:mr-1.5" /> {modeInfo.label}
                  </button>
                ))}
                 {displayWord && userProfile && (
                    <button
                    onClick={() => handleToggleFavorite(getDisplayWord())}
                    title={isFavoriteCurrent ? "Remove from favorites" : "Add to favorites"}
                    className="p-1.5 sm:p-2 rounded-full hover:bg-white/20 transition-colors disabled:opacity-50 ml-1 sm:ml-2"
                    disabled={isLoading}
                    >
                    <Heart size={18} className={`${isFavoriteCurrent ? 'text-red-500 fill-current' : 'text-slate-400 hover:text-red-400'}`} />
                    </button>
                )}
              </div>
            </div>

            <div ref={contentScrollRef} className="p-3 sm:p-5 text-slate-800 bg-slate-50 rounded-b-lg max-h-[60vh] overflow-y-auto custom-scrollbar">
              {renderContent()}
            </div>
          </div>
        )}

        {renderAuthModal()}

      </main>
      <footer className="mt-6 sm:mt-8 text-center text-xs text-slate-500">
        <p>&copy; {new Date().getFullYear()} Tiny Tutor AI. Learning enhanced by AI.</p>
      </footer>
    </div>
  );
}

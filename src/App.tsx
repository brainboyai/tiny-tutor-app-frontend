import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Heart, BookOpen, User as UserIconLucide, LogOut, LogIn, HelpCircle, Loader2, Image as ImageIcon, FileText, Brain, PlusCircle, RefreshCw, TrendingUp } from 'lucide-react';
import ProfilePage from './ProfilePage';
import './App.css';
// Import shared types from types.ts
import {
  UserProfile,
  // WordHistoryEntry, // WordHistoryEntry is part of UserProfile
  // StreakEntry, // StreakEntry is part of UserProfile
  LiveStreak,
  QuizAnswer,
  WordContent,
  QuizQuestion,
  AppView,
  ContentMode
} from './types'; // Assuming types.ts is in the src directory

// --- Constants ---
const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';
const AUTO_ADVANCE_DELAY = 1500;

export default function App() {
  const [currentView, setCurrentView] = useState<AppView>('main');
  const [searchTerm, setSearchTerm] = useState('');
  const [displayWord, setDisplayWord] = useState<string | null>(null);
  const [selectedMode, setSelectedMode] = useState<ContentMode>('explain');
  const [wordContent, setWordContent] = useState<WordContent | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [liveStreak, setLiveStreak] = useState<LiveStreak | null>(null);
  const [isReviewingStreakWord, setIsReviewingStreakWord] = useState<boolean>(false);
  const [wordForReview, setWordForReview] = useState<string>('');
  const [currentQuizQuestionIndex, setCurrentQuizQuestionIndex] = useState(0);
  const [quizAnswers, setQuizAnswers] = useState<QuizAnswer[]>([]);
  const [showQuizResult, setShowQuizResult] = useState(false);
  const [quizScore, setQuizScore] = useState(0);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const contentScrollRef = useRef<HTMLDivElement>(null);
  const autoAdvanceTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const modes: { id: ContentMode, label: string, icon: React.ElementType }[] = [
    { id: 'explain', label: 'Explain', icon: FileText },
    { id: 'image', label: 'Image', icon: ImageIcon },
    { id: 'fact', label: 'Fact', icon: HelpCircle },
    { id: 'quiz', label: 'Quiz', icon: Brain },
    { id: 'deep_dive', label: 'Deep Dive', icon: BookOpen },
  ];

  const getSanitizedWord = (word: string) => word.trim().toLowerCase();
  const getCurrentDisplayWord = () => isReviewingStreakWord ? wordForReview : displayWord || '';

  useEffect(() => {
    if (currentView === 'main' && searchInputRef.current) searchInputRef.current.focus();
  }, [currentView]);
  
  useEffect(() => {
    return () => { if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current); };
  }, []);

  const resetQuizState = useCallback((): void => {
    setCurrentQuizQuestionIndex(0); setQuizAnswers([]);
    setShowQuizResult(false); setQuizScore(0);
    if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
  }, []);

  type FetchUserProfileType = (token: string | null) => Promise<void>;
  type EndCurrentStreakIfNeededType = (forceEnd?: boolean) => Promise<void>;
  type HandleLogoutType = () => void;

  const fetchApi = useCallback(async (
    endpoint: string, 
    method: string = 'GET', 
    body: any = null, 
    token?: string | null
  ): Promise<any | null> => {
    setIsLoading(true); setError(null); 
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    const currentToken = token || localStorage.getItem('authToken');
    if (currentToken) headers['Authorization'] = `Bearer ${currentToken}`;
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, { method, headers, body: body ? JSON.stringify(body) : null });
      if (response.status === 401) {
        localStorage.removeItem('authToken');
        setUserProfile(null); setDisplayWord(null); setWordContent(null);
        setCurrentView('main'); setError(null); 
        setLiveStreak(null); setIsReviewingStreakWord(false); setWordForReview('');
        resetQuizState();
        setAuthError("Session expired. Please log in again.");
        setCurrentView('auth'); setIsAuthModalOpen(true); 
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
      if (endpoint.includes('/auth/')) setAuthError(message); else setError(message);
      return null;
    } finally { setIsLoading(false); }
  }, [resetQuizState]); 

  const fetchUserProfile: FetchUserProfileType = useCallback(async (token) => {
    if (!token) { setUserProfile(null); return; }
    const data = await fetchApi('/users/profile', 'GET', null, token);
    if (data && data.user) setUserProfile(data.user);
  }, [fetchApi]);

  const endCurrentStreakIfNeeded: EndCurrentStreakIfNeededType = useCallback(async (forceEnd = false) => {
    const currentLiveStreak = liveStreak;
    let streakWasSaved = false;
    const token = localStorage.getItem('authToken');

    if (currentLiveStreak && currentLiveStreak.score >= 1 && token) {
      console.log(`Attempting to save streak (Score: ${currentLiveStreak.score}, Words: ${currentLiveStreak.words.join(', ')})`);
      try {
        const response = await fetch(`${API_BASE_URL}/save_streak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ words: currentLiveStreak.words, score: currentLiveStreak.score }),
        });
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Failed to save streak. Status: ${response.status}, Body: ${errorText}`);
        } else {
            console.log("Streak saved successfully.");
            streakWasSaved = true;
            if (token) fetchUserProfile(token); 
        }
      } catch (err) { console.error('Network error or other exception saving streak:', err); }
    }
    if (forceEnd || (currentLiveStreak && (currentLiveStreak.score >= 1 || currentLiveStreak.score < 1))) { 
      console.log(`Resetting live streak. Force: ${forceEnd}, Previous Score: ${currentLiveStreak?.score}, Saved: ${streakWasSaved}`);
      setLiveStreak(null);
    }
  }, [liveStreak, fetchUserProfile]);

  const handleLogout: HandleLogoutType = useCallback(() => {
    endCurrentStreakIfNeeded(true);
    localStorage.removeItem('authToken');
    setUserProfile(null); setDisplayWord(null); setWordContent(null);
    setCurrentView('main'); setError(null); setAuthError(null);
    setLiveStreak(null); setIsReviewingStreakWord(false); setWordForReview('');
    resetQuizState();
    console.log("User logged out");
  }, [endCurrentStreakIfNeeded, resetQuizState]);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) fetchUserProfile(token);
  }, [fetchUserProfile]);

  const fetchWordContent = useCallback(async (word: string, mode: ContentMode, forceRefresh: boolean = false) => {
    if (!word) return;
    const sanitizedWord = getSanitizedWord(word);
    const token = localStorage.getItem('authToken');
    if (!token) { 
        setAuthError("Please log in to explore content."); 
        setCurrentView('auth'); setIsAuthModalOpen(true); return; 
    }
    if (!forceRefresh && userProfile) {
        const exploredWordEntry = userProfile.explored_words?.find(ew => ew.id === sanitizedWord);
        const cachedModeContent = exploredWordEntry?.content?.[mode];
        if (cachedModeContent !== undefined) {
            setWordContent(prev => ({ ...prev, [mode]: cachedModeContent }));
            if (mode === 'quiz') resetQuizState();
            setUserProfile(prev => prev ? ({ ...prev, explored_words: prev.explored_words?.map(ew => ew.id === sanitizedWord ? {...ew, last_explored_at: new Date().toISOString()} : ew)}) : null);
            return;
        }
    }
    const data = await fetchApi(`/words/${sanitizedWord}/${mode}`);
    if (data && data.content !== undefined) {
      setWordContent(prev => ({ ...prev, [mode]: data.content }));
      if (mode === 'quiz' && data.content) resetQuizState();
      if (userProfile) fetchUserProfile(token);
    } else if (data && data.message && mode === 'image') {
      setWordContent(prev => ({ ...prev, image: data.message }));
    } else if (data && data.error) {
      setError(data.error); setWordContent(prev => ({ ...prev, [mode]: undefined }));
    } else {
      setError(`Failed to load content for ${mode}.`); setWordContent(prev => ({ ...prev, [mode]: undefined }));
    }
  }, [fetchApi, userProfile, fetchUserProfile, resetQuizState]);


  const handleSearch = useCallback(async (wordToSearch: string, e?: React.FormEvent<HTMLFormElement>) => {
    e?.preventDefault();
    const trimmedWord = wordToSearch.trim();
    if (!trimmedWord || isLoading) return;
    await endCurrentStreakIfNeeded(true); 
    setIsReviewingStreakWord(false); setWordForReview('');
    setDisplayWord(trimmedWord); setSelectedMode('explain');
    setWordContent(null); resetQuizState();
    await fetchWordContent(trimmedWord, 'explain');
    setSearchTerm(''); 
    if (currentView !== 'main') setCurrentView('main');
    setLiveStreak({ score: 1, words: [trimmedWord] });
  }, [isLoading, fetchWordContent, currentView, endCurrentStreakIfNeeded, resetQuizState]);

  const handleSubTopicClick = (subTopic: string) => {
    setIsReviewingStreakWord(false); setWordForReview('');
    if (liveStreak && liveStreak.words[liveStreak.words.length - 1]?.toLowerCase() !== subTopic.toLowerCase()) {
        setLiveStreak(prev => ({ score: (prev?.score || 0) + 1, words: [...(prev?.words || []), subTopic] }));
    } else if (!liveStreak && displayWord) {
        setLiveStreak({score: 1, words: [subTopic]});
    }
    setDisplayWord(subTopic); setSelectedMode('explain');
    setWordContent(null); resetQuizState();
    fetchWordContent(subTopic, 'explain');
  };
  
  const handleStreakWordClick = (word: string) => {
    const currentDisplay = getCurrentDisplayWord();
    if (word.toLowerCase() === currentDisplay.toLowerCase() && isReviewingStreakWord) return;
    setIsReviewingStreakWord(true); setWordForReview(word);
    resetQuizState(); 
    const sanitizedReviewWord = getSanitizedWord(word);
    const exploredWordEntry = userProfile?.explored_words?.find(ew => ew.id === sanitizedReviewWord);
    const cachedExplainContent = exploredWordEntry?.content?.explain;
    if (cachedExplainContent) {
        setDisplayWord(word); setSelectedMode('explain');
        setWordContent({ explain: cachedExplainContent });
    } else {
        handleSearch(word); 
    }
  };

  const handleModeChange = (mode: ContentMode) => {
    if (isLoading) return;
    setSelectedMode(mode);
    const currentWord = getCurrentDisplayWord();
    if (currentWord && (!wordContent || wordContent[mode] === undefined || (mode === 'quiz' && !wordContent.quiz))) {
      fetchWordContent(currentWord, mode);
    } else if (mode === 'quiz' && currentWord) {
        resetQuizState();
    }
  };

  const handleToggleFavorite = async (word: string | null) => {
    if (!word || !userProfile) {
      setAuthError("Please log in to save favorites.");
      setCurrentView('auth'); setIsAuthModalOpen(true); setAuthMode('login'); return;
    }
    const sanitizedWord = getSanitizedWord(word);
    const isCurrentlyFavorite = userProfile.explored_words?.find(ew => ew.id === sanitizedWord)?.is_favorite;
    const endpoint = `/users/favorites/${sanitizedWord}`;
    const method = isCurrentlyFavorite ? 'DELETE' : 'POST';
    const result = await fetchApi(endpoint, method);
    if (result) fetchUserProfile(localStorage.getItem('authToken'));
  };

  const handleAuthAction = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); setAuthError(null);
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
      setIsAuthModalOpen(false); setCurrentView('main');
    }
  };

  const handleQuizOptionSelect = (questionIndex: number, selectedOptionKey: string) => {
    if (!wordContent?.quiz || !wordContent.quiz[questionIndex]) return;
    const currentQuestion = wordContent.quiz[questionIndex];
    const isCorrect = currentQuestion.correct_answer_key === selectedOptionKey;
    const newAnswer: QuizAnswer = { questionIndex, selectedOptionKey, isCorrect };
    setQuizAnswers(prev => {
      const existingIndex = prev.findIndex(ans => ans.questionIndex === questionIndex);
      if (existingIndex > -1) { const updated = [...prev]; updated[existingIndex] = newAnswer; return updated; }
      return [...prev, newAnswer];
    });
    if (userProfile && displayWord) {
      fetchApi(`/words/${getSanitizedWord(displayWord)}/quiz/attempt`, 'POST', {
        question_index: questionIndex, selected_option_key: selectedOptionKey, is_correct: isCorrect
      });
    }
    if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
    autoAdvanceTimeoutRef.current = setTimeout(() => {
        if (questionIndex < wordContent.quiz!.length - 1) {
            setCurrentQuizQuestionIndex(qIdx => qIdx + 1);
        } else {
            let score = 0;
            const finalAnswersSet = new Map<number, QuizAnswer>();
            setQuizAnswers(currentAnswers => {
                const allAnswers = [...currentAnswers];
                const lastAnswerIdx = allAnswers.findIndex(a => a.questionIndex === newAnswer.questionIndex);
                if(lastAnswerIdx > -1) allAnswers[lastAnswerIdx] = newAnswer;
                else if (!allAnswers.some(a => a.questionIndex === newAnswer.questionIndex)) {
                     allAnswers.push(newAnswer);
                }
                
                allAnswers.forEach(ans => finalAnswersSet.set(ans.questionIndex, ans));
                finalAnswersSet.forEach(ans => { if (ans.isCorrect) score++; });
                setQuizScore(score);
                return allAnswers;
            });
            setShowQuizResult(true);
        }
    }, AUTO_ADVANCE_DELAY);
  };

  const handleRetakeQuiz = () => {
    resetQuizState();
    const currentWord = getCurrentDisplayWord();
    if (currentWord) fetchWordContent(currentWord, 'quiz', true);
  };
  
  const handleRefreshContent = () => {
    const wordToRefresh = getCurrentDisplayWord();
    if (wordToRefresh && selectedMode !== 'quiz' && selectedMode !== 'image') {
      fetchWordContent(wordToRefresh, selectedMode, true);
    }
  };

  const renderClickableExplanation = (text: string) => {
    const parts = text.split(/<click>(.*?)<\/click>/g);
    return parts.map((part, index) => {
      if (index % 2 === 1) {
        return ( <button key={index} onClick={() => handleSubTopicClick(part)}
            className="text-purple-500 hover:text-purple-700 underline font-semibold focus:outline-none focus:ring-2 focus:ring-purple-300 rounded mx-0.5 px-0.5">
            {part} </button> );
      }
      return <span key={index}>{part}</span>;
    });
  };
  
  const handleProfileWordClick = (word: string) => {
    setCurrentView('main');
    handleSearch(word);
  };

  const renderAuthModal = (): JSX.Element | null => { 
    if (!isAuthModalOpen && currentView !== 'auth') return null;
    if (currentView === 'auth' && !isAuthModalOpen) {
        Promise.resolve().then(() => setIsAuthModalOpen(true));
    }
    if (!isAuthModalOpen) return null;
    return (
      <div className="fixed inset-0 bg-black/70 flex items-center justify-center p-4 z-50 backdrop-blur-sm">
        <div className="bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-md relative">
          <button onClick={() => { setIsAuthModalOpen(false); if (currentView === 'auth') setCurrentView('main'); setAuthError(null);}} 
            className="absolute top-3 right-3 text-slate-400 hover:text-slate-200 transition-colors text-2xl leading-none" aria-label="Close">
            &times;
          </button>
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
    const currentWordForContent = getCurrentDisplayWord();
    const contentForSelectedMode = wordContent?.[selectedMode];

    if (isLoading && contentForSelectedMode === undefined) return <div className="flex justify-center items-center h-64"><Loader2 size={32} className="animate-spin text-purple-500" /> <span className="ml-3 text-slate-600">Loading {selectedMode}...</span></div>;
    if (error && selectedMode !== 'image' && contentForSelectedMode === undefined) return <div className="text-red-500 bg-red-500/10 p-4 rounded-md border border-red-500/20">Error: {error}</div>;
    if (!currentWordForContent && !error && !authError) return <div className="text-center text-slate-500 py-10 px-4">Enter a word above and press Enter or click Search to begin exploring.</div>;

    switch (selectedMode) {
      case 'explain':
        const explainText = wordContent?.explain;
        return <div className="prose prose-sm sm:prose-base max-w-none text-slate-700 whitespace-pre-wrap">{explainText ? renderClickableExplanation(explainText) : (isLoading ? 'Loading explanation...' : 'No explanation available.')}
         {explainText && !isLoading && <button onClick={handleRefreshContent} className="mt-2 text-xs text-purple-500 hover:text-purple-700 flex items-center"><RefreshCw size={12} className="mr-1"/>Regenerate</button>}
        </div>;
      case 'image':
        const imageText = wordContent?.image;
        if (isLoading && !imageText) return <div className="flex justify-center items-center h-64"><Loader2 size={32} className="animate-spin text-purple-500" /> <span className="ml-3 text-slate-600">Generating image...</span></div>;
        if (error && !imageText) return <div className="text-red-500 bg-red-500/10 p-4 rounded-md border border-red-500/20">Error generating image: {error}</div>;
        if (typeof imageText === 'string' && imageText.startsWith('data:image')) {
            return <img src={imageText} alt={`Generated for ${currentWordForContent}`} className="rounded-md shadow-md max-w-full h-auto mx-auto" onError={(e) => e.currentTarget.src = 'https://placehold.co/600x400/E2E8F0/AAAAAA?text=Image+Error'}/>;
        }
        if (typeof imageText === 'string' && imageText.includes("generating")) {
            return <div className="text-center text-slate-600 py-10"><Loader2 size={24} className="animate-spin inline mr-2" />{imageText}</div>;
        }
        return <div className="text-slate-500">No image available or still loading.</div>;
      case 'fact':
        const factText = wordContent?.fact;
        return <div className="prose prose-sm sm:prose-base max-w-none text-slate-700 whitespace-pre-wrap">{factText || (isLoading ? 'Loading fact...' : 'No fact available.')}
         {factText && !isLoading && <button onClick={handleRefreshContent} className="mt-2 text-xs text-purple-500 hover:text-purple-700 flex items-center"><RefreshCw size={12} className="mr-1"/>Regenerate</button>}
        </div>;
      case 'quiz':
        if (isLoading && !wordContent?.quiz) return <div className="flex justify-center items-center h-64"><Loader2 size={32} className="animate-spin text-purple-500" /> <span className="ml-3 text-slate-600">Loading quiz...</span></div>;
        const quizQuestions = wordContent?.quiz;
        if (!quizQuestions || quizQuestions.length === 0) return <div className="text-slate-500">No quiz available for this word. <button onClick={handleRetakeQuiz} className="ml-2 text-xs text-purple-500 hover:underline">Try generating new questions?</button></div>;
        if (showQuizResult) { 
            return (
            <div className="text-center">
              <h3 className="text-xl font-semibold mb-3 text-slate-700">Quiz Completed!</h3>
              <p className="text-lg mb-4 text-slate-600">Your score: <span className="font-bold text-purple-600">{quizScore}</span> / {quizQuestions.length}</p>
              <div className="mb-6 space-y-3 max-h-60 overflow-y-auto custom-scrollbar pr-2">
                {quizQuestions.map((q: QuizQuestion, idx: number) => {
                  const userAnswer = quizAnswers.find(a => a.questionIndex === idx);
                  return (
                    <div key={idx} className={`p-3 rounded-md text-left text-sm ${userAnswer?.isCorrect ? 'bg-green-500/10 border-l-4 border-green-500' : 'bg-red-500/10 border-l-4 border-red-500'}`}>
                      <p className="font-medium text-slate-700">{q.question}</p>
                      <p className="text-xs text-slate-500">Your answer: {userAnswer ? q.options[userAnswer.selectedOptionKey] : 'Not answered'} ({userAnswer?.isCorrect ? 'Correct' : 'Incorrect'})</p>
                      {!userAnswer?.isCorrect && q.explanation && <p className="text-xs text-blue-600 mt-1">Explanation: {q.explanation}</p>}
                      {!userAnswer?.isCorrect && !q.explanation && <p className="text-xs text-green-600 mt-1">Correct: {q.options[q.correct_answer_key]}</p>}
                    </div>
                  );
                })}
              </div>
              <button onClick={handleRetakeQuiz} className="bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-6 rounded-md transition-colors">
                Retake Quiz (New Questions)
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
                  if (isSelected && userAnsweredThis.isCorrect) buttonClass += "bg-green-500/20 border-green-600 text-green-700 font-medium ring-2 ring-green-500";
                  else if (isSelected && !userAnsweredThis.isCorrect) buttonClass += "bg-red-500/20 border-red-600 text-red-700 font-medium ring-2 ring-red-500";
                  else if (currentQuestion.correct_answer_key === key) buttonClass += "bg-green-500/10 border-green-500/50 text-slate-600";
                  else buttonClass += "bg-slate-100 border-slate-300 text-slate-600 hover:bg-slate-200/70";
                } else {
                  buttonClass += "bg-white border-slate-300 text-slate-700 hover:bg-purple-500/10 hover:border-purple-500";
                }
                return (
                  <button key={key} onClick={() => !userAnsweredThis && handleQuizOptionSelect(currentQuizQuestionIndex, key)}
                    disabled={!!userAnsweredThis || isLoading} className={buttonClass}>
                    <span className={`font-semibold mr-2 ${isSelected && userAnsweredThis ? '' : 'text-purple-600'}`}>{key}.</span> {optionText}
                  </button>
                );
              })}
            </div>
            {userAnsweredThis && currentQuestion.explanation && (
                <p className={`mt-3 text-xs p-2 rounded-md ${userAnsweredThis.isCorrect ? 'bg-green-500/10 text-green-700' : 'bg-blue-500/10 text-blue-700'}`}>
                    Explanation: {currentQuestion.explanation}
                </p>
            )}
          </div>
        );
      case 'deep_dive':
        const deepDiveText = wordContent?.deep_dive;
        return <div className="prose prose-sm sm:prose-base max-w-none text-slate-700 whitespace-pre-wrap">{deepDiveText || (isLoading ? 'Loading deep dive...' : 'No deep dive available.')}
         {deepDiveText && !isLoading && <button onClick={handleRefreshContent} className="mt-2 text-xs text-purple-500 hover:text-purple-700 flex items-center"><RefreshCw size={12} className="mr-1"/>Regenerate</button>}
        </div>;
      default:
        return <div className="text-slate-500">Select a mode to see content.</div>;
    }
  };
  
  if (currentView === 'profile') {
    return <ProfilePage 
              userProfile={userProfile} 
              onNavigateBack={() => setCurrentView('main')} 
              onLogout={handleLogout} 
              fetchUserProfile={() => fetchUserProfile(localStorage.getItem('authToken'))}
              onWordClick={handleProfileWordClick}
           />;
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
              <button onClick={() => { if (userProfile) fetchUserProfile(localStorage.getItem('authToken')); setCurrentView('profile');}} title="Profile" className="p-2 rounded-full hover:bg-white/10 transition-colors"><UserIconLucide size={20} className="text-slate-300" /></button>
              <button onClick={handleLogout} title="Logout" className="p-2 rounded-full hover:bg-white/10 transition-colors"><LogOut size={20} className="text-slate-300" /></button>
            </>
          ) : (
            <button onClick={() => { setCurrentView('auth'); setAuthMode('login'); setIsAuthModalOpen(true); }} title="Login" className="p-2 rounded-full hover:bg-white/10 transition-colors"><LogIn size={20} className="text-slate-300" /></button>
          )}
        </div>
      </header>

      <main className="w-full max-w-3xl">
        <form onSubmit={(e) => handleSearch(searchTerm, e)} className="flex items-center mb-3 sm:mb-4 p-1 bg-slate-800 rounded-full shadow-lg focus-within:ring-2 focus-within:ring-purple-500 transition-all">
          <input
            ref={searchInputRef} type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Enter a word (e.g., Photosynthesis)"
            className="flex-grow p-2.5 sm:p-3 bg-transparent text-sm sm:text-base text-slate-100 focus:outline-none rounded-full pl-4"
            disabled={isLoading}
          />
          <button type="submit" disabled={isLoading || !searchTerm.trim()} className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-4 sm:px-6 py-2 sm:py-2.5 rounded-full text-sm transition-colors duration-150 ease-in-out disabled:opacity-60 flex items-center">
            {isLoading && !wordContent ? <Loader2 size={18} className="animate-spin mr-2" /> : <PlusCircle size={16} className="mr-1.5" />}
            Search
          </button>
        </form>

        {liveStreak && liveStreak.score > 0 && (
          <div className="mb-4 p-3 bg-slate-800/80 rounded-lg text-sm shadow-lg text-purple-300 flex items-center justify-center">
            <TrendingUp size={18} className="mr-2 text-yellow-400"/>
            <span className="font-semibold">Live Streak: {liveStreak.score} </span>
            <span className="text-slate-400 mx-1">-</span>
            <span className="italic truncate max-w-[200px] sm:max-w-xs md:max-w-sm">
              {liveStreak.words.map((word, index) => (
                <React.Fragment key={index}>
                  <span
                    onClick={() => handleStreakWordClick(word)}
                    className={`cursor-pointer hover:underline ${(isReviewingStreakWord && wordForReview.toLowerCase() === word.toLowerCase()) || (!isReviewingStreakWord && displayWord && displayWord.toLowerCase() === word.toLowerCase()) ? 'font-bold text-purple-200' : 'text-slate-300'}`}
                  >
                    {word}
                  </span>
                  {index < liveStreak.words.length - 1 && <span className="text-slate-500"> → </span>}
                </React.Fragment>
              ))}
            </span>
            {isReviewingStreakWord && <span className="ml-2 text-xs italic text-slate-500">(Reviewing: {wordForReview})</span>}
          </div>
        )}

        {(error && !getCurrentDisplayWord()) && <p className="text-center text-red-400 bg-red-500/10 p-3 rounded-md mb-4">{error}</p>}
        {(authError && !userProfile && !isAuthModalOpen && currentView !== 'auth') && 
            <p className="text-center text-yellow-400 bg-yellow-500/10 p-3 rounded-md mb-4">{authError}</p>}

        {(getCurrentDisplayWord() || (error && selectedMode !== 'image') || (authError && !isAuthModalOpen && currentView !=='auth' )) && (
          <div className="bg-slate-800/70 backdrop-blur-md rounded-lg shadow-xl overflow-hidden">
            <div className="p-3 sm:p-4 border-b border-slate-700 flex flex-col sm:flex-row justify-between items-center">
              <div className="flex items-center mb-2 sm:mb-0">
                {getCurrentDisplayWord() && <h2 className="text-lg sm:text-xl font-semibold text-slate-100 mr-3">{getCurrentDisplayWord()}</h2>}
                {isLoading && wordContent && <Loader2 size={18} className="animate-spin text-purple-400" />}
              </div>
              <div className="flex items-center space-x-1 sm:space-x-1.5">
                {modes.map(modeInfo => (
                  <button
                    key={modeInfo.id} onClick={() => handleModeChange(modeInfo.id)}
                    disabled={(!getCurrentDisplayWord() && !error && !authError) || isLoading} title={modeInfo.label}
                    className={`flex items-center text-xs sm:text-sm px-2.5 sm:px-3 py-1.5 rounded-full transition-all duration-150 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50
                            ${selectedMode === modeInfo.id ? 'bg-purple-500 text-white shadow-md' : 'bg-white/10 hover:bg-white/20 text-slate-300 hover:text-slate-100'}
                            ${(!getCurrentDisplayWord() && !error && !authError) ? 'opacity-50 cursor-not-allowed' : ''}
                            ${isLoading && selectedMode !== modeInfo.id ? 'opacity-70 cursor-wait' : ''} `}>
                    <modeInfo.icon size={12} className="mr-1 sm:mr-1.5" /> {modeInfo.label}
                  </button>
                ))}
                 {getCurrentDisplayWord() && userProfile && (
                    <button onClick={() => handleToggleFavorite(getCurrentDisplayWord())}
                      title={userProfile.explored_words?.find(ew => ew.id === getSanitizedWord(getCurrentDisplayWord()))?.is_favorite ? "Remove from favorites" : "Add to favorites"}
                      className="p-1.5 sm:p-2 rounded-full hover:bg-white/20 transition-colors disabled:opacity-50 ml-1 sm:ml-2"
                      disabled={isLoading}>
                    <Heart size={18} className={`${userProfile.explored_words?.find(ew => ew.id === getSanitizedWord(getCurrentDisplayWord()))?.is_favorite ? 'text-red-500 fill-current' : 'text-slate-400 hover:text-red-400'}`} />
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

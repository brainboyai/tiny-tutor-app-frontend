// src/App.tsx
import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { jwtDecode } from 'jwt-decode';
import './App.css';
import './index.css';

type ContentMode = "explain" | "image" | "fact" | "quiz" | "deep_dive";

interface User {
  userId: string;
  username: string;
}

interface DecodedToken extends User {
  exp: number;
}

interface QuizQuestion {
  question: string;
  options: { key: string; text: string }[];
  correctAnswerKey: string;
  userSelectedOptionKey?: string;
  isCorrect?: boolean;
}

interface WordInfo {
  word: string;
  generated_content_cache: Partial<Record<ContentMode, any>>;
  modes_generated: ContentMode[];
  is_favorite: boolean;
  quiz_progress: { question_index: number; selected_option_key: string; is_correct: boolean }[];
}

interface ProfileData {
  username: string;
  email: string;
  tier: string;
  total_words_explored: number;
  explored_words: Array<{ id: string; word: string; last_explored_at: string; is_favorite: boolean; }>;
  favorite_words: Array<{ id: string; word: string; last_explored_at: string; is_favorite: boolean; }>;
  streak_history: Array<{ id: string; words: string[]; score: number; completed_at: string; }>;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://tiny-tutor-app.onrender.com';

function App() {
  const [inputValue, setInputValue] = useState('');
  const [currentWord, setCurrentWord] = useState<string | null>(null); // The word currently in focus for content display
  const [focusWordInfo, setFocusWordInfo] = useState<WordInfo | null>(null);
  const [activeMode, setActiveMode] = useState<ContentMode>('explain');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [pendingGenerationWord, setPendingGenerationWord] = useState<string | null>(null);

  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuizQuestionIndex, setCurrentQuizQuestionIndex] = useState(0);
  const [quizFeedback, setQuizFeedback] = useState<string | null>(null);
  const [showQuizSummary, setShowQuizSummary] = useState(false);

  const [liveStreak, setLiveStreak] = useState<{ words: string[]; score: number }>({ words: [], score: 0 });

  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  const getToken = () => localStorage.getItem('token');

  useEffect(() => {
    const token = getToken();
    if (token) {
      try {
        const decodedToken = jwtDecode<DecodedToken>(token);
        if (decodedToken.exp * 1000 > Date.now()) {
          setUser({ userId: decodedToken.userId, username: decodedToken.username });
        } else {
          localStorage.removeItem('token');
        }
      } catch (error) {
        console.error("Invalid token:", error);
        localStorage.removeItem('token');
      }
    }
  }, []);

  const apiFetch = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    const token = getToken();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    try {
      const response = await fetch(`${API_BASE_URL}${endpoint}`, { ...options, headers });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
        throw new Error(errorData.error || `Request failed with status ${response.status}`);
      }
      return await response.json();
    } catch (error: any) {
      console.error(`API fetch error to ${endpoint}:`, error);
      setErrorMessage(error.message || 'An unexpected network error occurred.');
      throw error;
    }
  }, []);

  const endCurrentStreakIfNeeded = useCallback(async (isLogout = false) => {
    if (liveStreak.score >= 2) {
      try {
        console.log("Attempting to save streak:", liveStreak);
        await apiFetch('/save_streak', {
          method: 'POST',
          body: JSON.stringify({ words: liveStreak.words, score: liveStreak.score }),
        });
        console.log("Streak saved successfully:", liveStreak);
      } catch (error) {
        console.error("Failed to save streak:", error);
      }
    }
    // Reset streak unless it's a logout where we might want to keep words for a moment
    if (!isLogout) {
      setLiveStreak({ words: [], score: 0 });
    } else {
      // On logout, clear score but words might persist briefly if UI needs them before clearing user session
      setLiveStreak(prev => ({ ...prev, score: 0 }));
    }
  }, [liveStreak, apiFetch]);

  // Core content fetching and state update logic
  const fetchAndSetWordContent = useCallback(async (
    wordToFetch: string,
    modeToFetch: ContentMode,
    isRefresh: boolean
  ) => {
    setIsLoading(true);
    setErrorMessage(null);
    if (modeToFetch === 'quiz') {
      setQuizQuestions([]);
      setCurrentQuizQuestionIndex(0);
      setShowQuizSummary(false);
      setQuizFeedback(null);
    }

    try {
      const data: WordInfo = await apiFetch('/generate_explanation', {
        method: 'POST',
        body: JSON.stringify({ word: wordToFetch, mode: modeToFetch, refresh_cache: isRefresh }),
      });

      setCurrentWord(wordToFetch); // Update the main focus word
      setFocusWordInfo(data);
      setActiveMode(modeToFetch);

      if (modeToFetch === 'quiz' && data.generated_content_cache.quiz) {
        parseAndSetQuiz(data.generated_content_cache.quiz, data.quiz_progress || []);
      }
    } catch (error: any) {
      console.error("Failed to fetch/set word content:", error.message);
      // Error message is set by apiFetch
    } finally {
      setIsLoading(false);
    }
  }, [apiFetch]); // Removed parseAndSetQuiz from here, it's called internally

  const handlePrimarySearch = useCallback((word: string) => {
    if (!word.trim()) return;
    if (!user) {
      setPendingGenerationWord(word);
      setAuthMode('login');
      setIsAuthModalOpen(true);
      return;
    }
    // This is a new primary search, so end any existing streak.
    endCurrentStreakIfNeeded(false);
    // Start a new streak
    setLiveStreak({ words: [word], score: 1 });
    fetchAndSetWordContent(word, 'explain', false);
    setInputValue(word); // Keep input in sync or clear it based on preference
  }, [user, endCurrentStreakIfNeeded, fetchAndSetWordContent]);


  const handleAuthSuccess = (token: string, username: string, userId: string) => {
    localStorage.setItem('token', token);
    setUser({ userId, username });
    setIsAuthModalOpen(false);
    setErrorMessage(null);
    if (pendingGenerationWord) {
      handlePrimarySearch(pendingGenerationWord); // Treat as a new primary search post-auth
      setPendingGenerationWord(null);
    }
  };

  const handleLogout = () => {
    endCurrentStreakIfNeeded(true);
    localStorage.removeItem('token');
    setUser(null);
    setCurrentWord(null);
    setFocusWordInfo(null);
    setInputValue('');
    setLiveStreak({ words: [], score: 0 });
  };

  const handleSubTopicClick = (subTopic: string) => {
    if (!subTopic.trim() || !user) return;

    // Extend the current live streak
    setLiveStreak(prev => {
      // Prevent adding the same sub-topic back-to-back if it somehow happens
      if (prev.words.length > 0 && prev.words[prev.words.length - 1] === subTopic) {
        return prev;
      }
      return {
        words: [...prev.words, subTopic],
        score: prev.score + 1,
      };
    });
    // Fetch content for the sub-topic. This does NOT break the streak.
    fetchAndSetWordContent(subTopic, 'explain', false);
    setInputValue(subTopic); // Update input field to reflect current focus
  };

  const handleModeChange = async (newMode: ContentMode) => {
    setActiveMode(newMode);
    setErrorMessage(null);

    if (currentWord && focusWordInfo) {
      const contentAlreadyAvailable = focusWordInfo.generated_content_cache &&
        focusWordInfo.generated_content_cache[newMode] &&
        ((newMode === 'quiz' && (focusWordInfo.generated_content_cache[newMode] as QuizQuestion[]).length > 0) ||
          (newMode !== 'quiz' && focusWordInfo.generated_content_cache[newMode]));
      if (!contentAlreadyAvailable) {
        console.log(`Content for ${newMode} not found for ${currentWord}. Fetching.`);
        // This fetch is for the currentWord, which could be a primary word or a sub-topic.
        // It does not inherently break or start a streak; it's just fetching a different mode.
        await fetchAndSetWordContent(currentWord, newMode, false);
      } else if (newMode === 'quiz' && focusWordInfo.generated_content_cache.quiz) {
        parseAndSetQuiz(focusWordInfo.generated_content_cache.quiz, focusWordInfo.quiz_progress || []);
        setCurrentQuizQuestionIndex(0);
        setShowQuizSummary(false);
        setQuizFeedback(null);
      }
    } else if (currentWord) { // currentWord exists but no focusWordInfo (e.g., after an error)
      console.log(`FocusWordInfo missing for ${currentWord}, but mode changed to ${newMode}. Fetching.`);
      await fetchAndSetWordContent(currentWord, newMode, false);
    }
  };

  const handleStreakWordClick = async (wordToReview: string) => {
    if (!user || !currentWord) return; // Need a current context
    // This is a REVIEW action. It should NOT affect the liveStreak.
    // It temporarily changes focusWordInfo and currentWord for display.
    console.log(`Reviewing streak word: ${wordToReview}. Live streak (${liveStreak.score}): ${liveStreak.words.join(" -> ")} preserved.`);

    // Fetch content for the word being reviewed.
    // The main 'currentWord' for streak purposes doesn't change here.
    // We need a temporary display state or handle this carefully.
    // For simplicity, let's just fetch and display. If user clicks subtopic from here, it's a new interaction.

    // To avoid complexity, clicking a streak word will *break* the current streak and start focus on that word.
    // If true review without breaking is needed, state management would be more complex (e.g. a separate 'reviewingWord' state).
    // Based on "the only way a streak breaks is...", clicking a streak word for review *should not* break it.
    // This means we need to load its content without altering `liveStreak` or the `currentWord` that the streak is based on.
    // This is tricky. Let's assume for now the project report's "Reviewing Live Streak Words... without breaking" is the goal.

    // To achieve "review without breaking":
    // 1. Fetch content for 'wordToReview'
    // 2. Display it (perhaps in a temporary state or by updating focusWordInfo but being careful)
    // 3. If user clicks a sub-topic from this reviewed word, *that* should break the old liveStreak and start a new one from the sub-topic.

    // Simpler approach for now: Clicking a streak word loads it, but doesn't affect the *live* streak that's forming.
    // The `currentWord` state will change to `wordToReview` for display.
    // The `liveStreak` object itself remains untouched by this specific action.
    await fetchAndSetWordContent(wordToReview, 'explain', false);
    // The active `liveStreak` is still in memory. If the user then clicks a sub-topic from `wordToReview`
    // `handleSubTopicClick` would need to know if it should extend the old `liveStreak` or start fresh.
    // This interaction is complex.

    // Per report: "Clicking words in the live streak display allows users to review their content ... without breaking the current live streak."
    // This means `fetchAndSetWordContent` should NOT alter `liveStreak` if called from here.
    // `fetchAndSetWordContent` itself doesn't touch `liveStreak`. `handlePrimarySearch` and `handleSubTopicClick` do.
    // So, this call is "safe" for the streak.
  };

  const parseQuizString = (quizStr: string): QuizQuestion[] => {
    if (!quizStr || typeof quizStr !== 'string') {
      console.error("Invalid quiz string provided:", quizStr);
      setErrorMessage("Error: Received invalid quiz data format.");
      return [];
    }
    const questionBlocks = quizStr.split("---QUIZ_SEPARATOR---").map(b => b.trim()).filter(b => b);
    const parsedQs: QuizQuestion[] = [];

    questionBlocks.forEach((block, index) => {
      const lines = block.split('\n').map(l => l.trim()).filter(l => l);
      if (lines.length < 5) {
        console.warn(`Skipping malformed quiz block ${index + 1}: Not enough lines.`);
        return;
      }
      let questionText = "";
      const options: { key: string; text: string }[] = [];
      let correctAnswerKey = "";
      const qLineRegex = /^(?:Question\s*\d*[:.]?\s*)?(.*)/i;
      let lineIdx = 0;
      let match = lines[lineIdx]?.match(qLineRegex);
      if (match && match[1]) {
        questionText = match[1].trim();
        lineIdx++;
      } else {
        if (lines[lineIdx]?.match(/^[A-D][).:]?\s+/i)) {
          questionText = "Question not clearly parsed";
        } else {
          questionText = lines[lineIdx] || "Question not parsed";
          lineIdx++;
        }
      }
      const optionRegex = /^([A-D])[\s.)：:]*\s*(.*)/i;
      for (let i = 0; i < 4 && lineIdx < lines.length; i++) {
        match = lines[lineIdx]?.match(optionRegex);
        if (match) {
          options.push({ key: match[1].toUpperCase(), text: match[2].trim() });
          lineIdx++;
        } else {
          if (!lines[lineIdx]?.toLowerCase().includes('correct answer')) {
            if (options.length > 0) options[options.length - 1].text += " " + lines[lineIdx];
          }
          break;
        }
      }
      const correctAnswerRegex = /(?:Correct Answer|Answer)[:\s]*([A-D])/i;
      let foundCorrect = false;
      for (let k = lineIdx; k < lines.length; k++) {
        match = lines[k].match(correctAnswerRegex);
        if (match) {
          correctAnswerKey = match[1].toUpperCase();
          foundCorrect = true;
          break;
        }
      }
      if (!foundCorrect && options.length > 0) {
        const lastOptionText = options[options.length - 1].text;
        match = lastOptionText.match(correctAnswerRegex);
        if (match) {
          correctAnswerKey = match[1].toUpperCase();
          options[options.length - 1].text = lastOptionText.replace(correctAnswerRegex, "").trim();
          foundCorrect = true;
        }
      }
      if (questionText && options.length > 0 && correctAnswerKey) {
        parsedQs.push({ question: questionText, options, correctAnswerKey });
      } else {
        console.warn(`Skipping quiz block ${index + 1} due to missing parts.`);
      }
    });
    if (parsedQs.length === 0 && questionBlocks.length > 0) {
      setErrorMessage("Failed to parse quiz questions. The format might be unexpected.");
    }
    return parsedQs;
  };

  const parseAndSetQuiz = (quizData: any, progress: WordInfo['quiz_progress']) => {
    let questions: QuizQuestion[];
    if (typeof quizData === 'string') {
      questions = parseQuizString(quizData);
    } else if (Array.isArray(quizData) && quizData.every(q => q.question && q.options && q.correctAnswerKey)) {
      questions = quizData as QuizQuestion[];
    } else {
      questions = [];
    }
    const questionsWithProgress = questions.map((q, idx) => {
      const attempt = progress.find(p => p.question_index === idx);
      return attempt ? { ...q, userSelectedOptionKey: attempt.selected_option_key, isCorrect: attempt.is_correct } : q;
    });
    setQuizQuestions(questionsWithProgress);
    setCurrentQuizQuestionIndex(0);
    setShowQuizSummary(false);
    setQuizFeedback(null);
  };

  const handleAnswerSubmit = async (selectedOptionKey: string) => {
    if (showQuizSummary || !quizQuestions[currentQuizQuestionIndex]) return;
    const currentQuestion = quizQuestions[currentQuizQuestionIndex];
    const isCorrect = currentQuestion.correctAnswerKey === selectedOptionKey;
    setQuizFeedback(isCorrect ? "Correct!" : `Wrong! Correct answer: ${currentQuestion.correctAnswerKey}`);
    const updatedQuestions = [...quizQuestions];
    updatedQuestions[currentQuizQuestionIndex] = { ...currentQuestion, userSelectedOptionKey: selectedOptionKey, isCorrect: isCorrect };
    setQuizQuestions(updatedQuestions);

    if (currentWord && user) {
      try {
        await apiFetch('/save_quiz_attempt', {
          method: 'POST',
          body: JSON.stringify({ word: currentWord, question_index: currentQuizQuestionIndex, selected_option_key: selectedOptionKey, is_correct: isCorrect }),
        });
        if (focusWordInfo) {
          const newProgress = [...(focusWordInfo.quiz_progress || [])];
          const existingAttemptIdx = newProgress.findIndex(p => p.question_index === currentQuizQuestionIndex);
          const attemptData = { question_index: currentQuizQuestionIndex, selected_option_key: selectedOptionKey, is_correct: isCorrect };
          if (existingAttemptIdx > -1) newProgress[existingAttemptIdx] = attemptData;
          else newProgress.push(attemptData);
          setFocusWordInfo(prev => prev ? { ...prev, quiz_progress: newProgress } : null);
        }
      } catch (error) { console.error("Failed to save quiz attempt:", error); }
    }
    setTimeout(() => {
      setQuizFeedback(null);
      if (currentQuizQuestionIndex < quizQuestions.length - 1) setCurrentQuizQuestionIndex(prevIndex => prevIndex + 1);
      else setShowQuizSummary(true);
    }, 1500);
  };

  const handleMoreQuizQuestions = async () => {
    if (currentWord) {
      await fetchAndSetWordContent(currentWord, 'quiz', true);
    }
  };

  const fetchProfileData = useCallback(async () => {
    if (!user) return;
    setProfileLoading(true);
    setProfileError(null);
    try {
      const data: ProfileData = await apiFetch('/profile');
      setProfileData(data);
    } catch (error: any) { setProfileError(error.message || "Failed to load profile."); }
    finally { setProfileLoading(false); }
  }, [user, apiFetch]);

  const openProfileModal = () => {
    fetchProfileData();
    setIsProfileModalOpen(true);
  };

  const handleProfileWordClick = async (word: string) => {
    setIsProfileModalOpen(false);
    if (!user) return;
    // Clicking a word from profile breaks any current live streak and starts focus on this word.
    endCurrentStreakIfNeeded(false);
    // This will set currentWord, focusWordInfo, etc.
    // It will NOT start a new "live streak" automatically, but next primary search will.
    // Or, if we want profile clicks to start a new streak:
    setLiveStreak({ words: [word], score: 1 }); // Option: Start new streak from profile word
    await fetchAndSetWordContent(word, 'explain', false);
    setInputValue(word);
  };

  const handleToggleFavorite = async () => {
    if (!currentWord || !user || !focusWordInfo) return;
    try {
      const response = await apiFetch('/toggle_favorite', { method: 'POST', body: JSON.stringify({ word: currentWord }) });
      setFocusWordInfo(prev => prev ? { ...prev, is_favorite: response.is_favorite } : null);
    } catch (error) { setErrorMessage("Could not update favorite status."); }
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    handlePrimarySearch(inputValue); // Use the dedicated handler
  };

  useEffect(() => {
    // This effect for clearing input is tricky and might be too aggressive.
    // The report mentioned: "ends ... on clearing input field while streak is active"
    // A more controlled way is to end streak on a new primary search.
    // If inputValue is empty AND there was a streak related to a previous currentWord,
    // and that currentWord is no longer the focus, the streak should have been ended.
    // For now, `endCurrentStreakIfNeeded` is called by `handlePrimarySearch` and `handleProfileWordClick`.
  }, [inputValue, liveStreak.score, currentWord, endCurrentStreakIfNeeded]);

  const renderClickableText = (textWithTags: string) => {
    if (!textWithTags || typeof textWithTags !== 'string') return textWithTags;
    const parts = textWithTags.split(/<\/?click>/g);
    return parts.map((part, index) =>
      index % 2 === 1 ? (
        <button key={index} onClick={() => handleSubTopicClick(part)}
          className="text-purple-600 hover:text-purple-800 font-semibold underline decoration-dotted hover:decoration-solid">
          {part}
        </button>
      ) : (<span key={index}>{part}</span>)
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-indigo-700 text-white flex flex-col items-center p-4 font-sans">
      <header className="w-full max-w-3xl mb-6 flex justify-between items-center">
        <h1 className="text-4xl font-bold">Tiny Tutor AI</h1>
        <div>
          {user ? (
            <>
              {/* FIX 3: Removed User ID from display */}
              <span className="mr-4">Welcome, {user.username}!</span>
              <button onClick={openProfileModal} className="bg-purple-500 hover:bg-purple-400 text-white font-semibold py-2 px-4 rounded-lg mr-2 transition-colors">Profile</button>
              <button onClick={handleLogout} className="bg-red-500 hover:bg-red-400 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Logout</button>
            </>
          ) : (
            <>
              <button onClick={() => { setAuthMode('login'); setIsAuthModalOpen(true); }} className="bg-green-500 hover:bg-green-400 text-white font-semibold py-2 px-4 rounded-lg mr-2 transition-colors">Login</button>
              <button onClick={() => { setAuthMode('signup'); setIsAuthModalOpen(true); }} className="bg-blue-500 hover:bg-blue-400 text-white font-semibold py-2 px-4 rounded-lg transition-colors">Sign Up</button>
            </>
          )}
        </div>
      </header>

      <form onSubmit={handleSubmit} className="w-full max-w-xl mb-6">
        <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)}
          placeholder="Enter a word or concept..."
          className="w-full p-3 rounded-lg text-gray-800 bg-white/90 focus:ring-2 focus:ring-purple-400 focus:outline-none shadow-md"
          disabled={isLoading} />
        <button type="submit"
          className="w-full mt-3 bg-yellow-500 hover:bg-yellow-400 text-gray-800 font-semibold py-3 px-4 rounded-lg shadow-md transition-colors disabled:opacity-50"
          disabled={isLoading || !inputValue.trim()}>
          {isLoading && !currentWord ? 'Authenticating...' : isLoading ? 'Generating...' : 'Generate Explanation'}
        </button>
      </form>

      {errorMessage && <div className="w-full max-w-xl bg-red-200 text-red-700 p-3 rounded-lg mb-4 text-center shadow">{errorMessage}</div>}

      {liveStreak.score > 0 && (
        <div className="w-full max-w-xl bg-white/20 p-3 rounded-lg mb-4 text-sm">
          <span className="font-semibold">Live Streak ({liveStreak.score}): </span>
          {liveStreak.words.map((word, index) => (
            <React.Fragment key={word + index}>
              <button onClick={() => handleStreakWordClick(word)}
                className={`hover:underline ${word === currentWord ? 'font-bold text-yellow-300' : ''}`}>
                {word}
              </button>
              {index < liveStreak.words.length - 1 && " → "}
            </React.Fragment>
          ))}
        </div>
      )}

      {currentWord && focusWordInfo && (
        <div className="w-full max-w-xl bg-white text-gray-800 p-6 rounded-lg shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-3xl font-semibold text-purple-700">{focusWordInfo.word}</h2>
            {user && (
              <button onClick={handleToggleFavorite} title={focusWordInfo.is_favorite ? "Remove from favorites" : "Add to favorites"} className="text-2xl">
                {focusWordInfo.is_favorite ? '❤️' : '🤍'}
              </button>
            )}
          </div>
          <div className="flex space-x-2 mb-4 border-b pb-2">
            {(["explain", "fact", "quiz", "image", "deep_dive"] as ContentMode[]).map(mode => (
              <button key={mode} onClick={() => handleModeChange(mode)}
                className={`py-2 px-4 rounded-t-lg font-medium transition-colors ${activeMode === mode ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-purple-100'}`}>
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>
          {isLoading && <div className="text-center p-4">Loading content...</div>}
          {!isLoading && activeMode === 'explain' && focusWordInfo.generated_content_cache.explain && (<div>{renderClickableText(focusWordInfo.generated_content_cache.explain)}</div>)}
          {!isLoading && activeMode === 'fact' && focusWordInfo.generated_content_cache.fact && (<div>{focusWordInfo.generated_content_cache.fact}</div>)}
          {!isLoading && activeMode === 'image' && (<div>{focusWordInfo.generated_content_cache.image || "Image content will appear here."}</div>)}
          {!isLoading && activeMode === 'deep_dive' && (<div>{focusWordInfo.generated_content_cache.deep_dive || "Deep dive content will appear here."}</div>)}
          {!isLoading && activeMode === 'quiz' && (
            <div>
              {quizQuestions.length > 0 ? (
                !showQuizSummary ? (
                  <div>
                    <h3 className="text-xl font-semibold mb-3">{quizQuestions[currentQuizQuestionIndex]?.question}</h3>
                    <div className="space-y-2">
                      {quizQuestions[currentQuizQuestionIndex]?.options.map(opt => (
                        <button key={opt.key} onClick={() => handleAnswerSubmit(opt.key)}
                          disabled={!!quizFeedback || !!quizQuestions[currentQuizQuestionIndex]?.userSelectedOptionKey}
                          className={`w-full text-left p-3 border rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-70 ${quizQuestions[currentQuizQuestionIndex]?.userSelectedOptionKey === opt.key ? (quizQuestions[currentQuizQuestionIndex]?.isCorrect ? 'bg-green-200 border-green-400' : 'bg-red-200 border-red-400') : 'border-gray-300'}`}>
                          {opt.key}) {opt.text}
                        </button>
                      ))}
                    </div>
                    {quizFeedback && <div className={`mt-3 p-2 rounded text-center ${quizFeedback.startsWith("Correct") ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{quizFeedback}</div>}
                  </div>
                ) : (
                  <div>
                    <h3 className="text-2xl font-semibold mb-4 text-purple-700">Quiz Summary for "{currentWord}"</h3>
                    {quizQuestions.map((q, idx) => (
                      <div key={idx} className="mb-4 p-3 border rounded-lg bg-gray-50">
                        <p className="font-medium">Q{idx + 1}: {q.question}</p>
                        <p className={`text-sm ${q.isCorrect ? 'text-green-600' : 'text-red-600'}`}> Your answer: {q.userSelectedOptionKey} ({q.options.find(o => o.key === q.userSelectedOptionKey)?.text}) - {q.isCorrect ? "Correct" : "Wrong"} </p>
                        {!q.isCorrect && <p className="text-sm text-gray-600">Correct answer: {q.correctAnswerKey} ({q.options.find(o => o.key === q.correctAnswerKey)?.text})</p>}
                      </div>
                    ))}
                    <p className="text-lg font-semibold mt-4"> Overall Score: {quizQuestions.filter(q => q.isCorrect).length} / {quizQuestions.length} </p>
                    <button onClick={handleMoreQuizQuestions} className="mt-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"> More Questions for "{currentWord}" </button>
                  </div>
                )
              ) : (<p>No quiz questions available for this topic, or quiz is loading.</p>)}
            </div>
          )}
        </div>
      )}

      {isAuthModalOpen && (
        <AuthModal isOpen={isAuthModalOpen} onClose={() => { setIsAuthModalOpen(false); if (!user) setPendingGenerationWord(null); }}
          mode={authMode} setMode={setAuthMode} onAuthSuccess={handleAuthSuccess} apiBaseUrl={API_BASE_URL} />
      )}
      {isProfileModalOpen && (
        <ProfileModal isOpen={isProfileModalOpen} onClose={() => setIsProfileModalOpen(false)}
          profileData={profileData} isLoading={profileLoading} error={profileError} onWordClick={handleProfileWordClick} />
      )}
    </div>
  );
}

interface AuthModalProps { /* ... as before ... */ }
const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, mode, setMode, onAuthSuccess, apiBaseUrl }) => {
  // ... (implementation as before, ensure it calls onAuthSuccess with userId)
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoadingModal, setIsLoadingModal] = useState(false); // Renamed to avoid conflict
  const [errorModal, setErrorModal] = useState<string | null>(null); // Renamed

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoadingModal(true);
    setErrorModal(null);
    const endpoint = mode === 'login' ? '/login' : '/signup';
    const payload = mode === 'login'
      ? { email_or_username: emailOrUsername.trim(), password: password }
      : { username: username.trim(), email: email.trim(), password: password };
    try {
      const response = await fetch(`${apiBaseUrl}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || `Failed to ${mode}`);
      onAuthSuccess(data.token, data.username, data.userId); // Ensure userId is passed
      setEmailOrUsername(''); setUsername(''); setEmail(''); setPassword('');
    } catch (err: any) { setErrorModal(err.message); }
    finally { setIsLoadingModal(false); }
  };
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md text-gray-800">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-purple-700">{mode === 'login' ? 'Login' : 'Sign Up'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
        </div>
        {errorModal && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{errorModal}</div>}
        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (<>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1" htmlFor="signup-username">Username</label>
              <input type="text" id="signup-username" value={username} onChange={e => setUsername(e.target.value)} required className="w-full p-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
            </div>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1" htmlFor="signup-email">Email</label>
              <input type="email" id="signup-email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full p-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
            </div> </>
          )}
          {mode === 'login' && (<div className="mb-4">
            <label className="block text-sm font-medium mb-1" htmlFor="login-email-username">Email or Username</label>
            <input type="text" id="login-email-username" value={emailOrUsername} onChange={e => setEmailOrUsername(e.target.value)} required className="w-full p-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
          </div>
          )}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-1" htmlFor="password">Password</label>
            <input type="password" id="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full p-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
          </div>
          <button type="submit" disabled={isLoadingModal} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:opacity-50">
            {isLoadingModal ? 'Processing...' : (mode === 'login' ? 'Login' : 'Sign Up')}
          </button>
        </form>
        <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="mt-4 text-sm text-purple-600 hover:underline">
          {mode === 'login' ? "Don't have an account? Sign Up" : "Already have an account? Login"}
        </button>
      </div>
    </div>
  );
};

interface ProfileModalProps { /* ... as before ... */ }
const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, profileData, isLoading, error, onWordClick }) => {
  // ... (implementation as before)
  if (!isOpen) return null;
  const AccordionSection: React.FC<{ title: string; items: Array<{ id: string, name: string, details?: string, subItems?: string[] }> | null; itemName?: string, onNameClick: (name: string) => void }> = ({ title, items, itemName, onNameClick }) => {
    const [isOpenAcc, setIsOpenAcc] = useState(false);
    return (<div className="mb-2 border rounded-md overflow-hidden">
      <button onClick={() => setIsOpenAcc(!isOpenAcc)} className="w-full p-3 text-left bg-gray-100 hover:bg-gray-200 font-medium flex justify-between items-center"> {title} <span>{isOpenAcc ? '−' : '+'}</span> </button>
      {isOpenAcc && (<div className="p-3 bg-white max-h-60 overflow-y-auto"> {items && items.length > 0 ? items.map(item => (
        <div key={item.id || item.name} className="py-1 text-sm">
          <button onClick={() => onNameClick(item.name)} className="font-semibold text-purple-600 hover:underline">{item.name}</button>
          {item.details && <span className="text-gray-500 ml-2">({item.details})</span>}
          {item.subItems && item.subItems.length > 0 && (<span className="text-gray-500 ml-1 text-xs"> ({item.subItems.join(', ')})</span>)}
        </div>)) : <p className="text-xs text-gray-500">No {itemName || 'items'} yet.</p>} </div>)}
    </div>);
  };
  return (<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
    <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg text-gray-800 max-h-[90vh] flex flex-col">
      <div className="flex justify-between items-center mb-4"> <h2 className="text-xl font-semibold text-purple-700">User Profile</h2> <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button> </div>
      {isLoading && <p>Loading profile...</p>} {error && <p className="text-red-500">{error}</p>}
      {profileData && !isLoading && !error && (<div className="overflow-y-auto">
        <p className="mb-1"><span className="font-semibold">Username:</span> {profileData.username}</p> <p className="mb-1"><span className="font-semibold">Email:</span> {profileData.email}</p> <p className="mb-3"><span className="font-semibold">Tier:</span> {profileData.tier}</p> <p className="mb-3"><span className="font-semibold">Total Words Explored:</span> {profileData.total_words_explored}</p>
        <AccordionSection title={`All Explored Words (${profileData.explored_words?.length || 0})`} items={profileData.explored_words?.map(w => ({ id: w.id, name: w.word, details: new Date(w.last_explored_at).toLocaleDateString() })) || []} itemName="explored words" onNameClick={onWordClick} />
        <AccordionSection title={`Favorite Words (${profileData.favorite_words?.length || 0})`} items={profileData.favorite_words?.map(w => ({ id: w.id, name: w.word, details: new Date(w.last_explored_at).toLocaleDateString() })) || []} itemName="favorite words" onNameClick={onWordClick} />
        <AccordionSection title={`Streak History (${profileData.streak_history?.length || 0})`} items={profileData.streak_history?.map(s => ({ id: s.id, name: `Score: ${s.score}`, details: new Date(s.completed_at).toLocaleDateString(), subItems: s.words })) || []} itemName="streaks" onNameClick={(streakName) => { if (profileData.streak_history.find(s => `Score: ${s.score}` === streakName)?.words[0]) onWordClick(profileData.streak_history.find(s => `Score: ${s.score}` === streakName)!.words[0]) }} />
      </div>)}
    </div> </div>);
};
export default App;

// src/App.tsx
import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import { jwtDecode } from 'jwt-decode'; // Correct import for named export
import './App.css'; // Your custom styles
import './index.css'; // Tailwind base styles

// Define types (condensed for brevity, expand as needed based on your actual types)
type ContentMode = "explain" | "image" | "fact" | "quiz" | "deep_dive";

interface User {
  userId: string;
  username: string;
  // Add other user fields if needed
}

interface DecodedToken extends User {
  exp: number;
  // Add other token fields
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
  generated_content_cache: Partial<Record<ContentMode, any>>; // 'any' for quiz string or fact string
  modes_generated: ContentMode[];
  is_favorite: boolean;
  quiz_progress: { question_index: number; selected_option_key: string; is_correct: boolean }[];
  // Add other fields like first_explored_at, last_explored_at if needed by UI directly
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


// --- Constants ---
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://tiny-tutor-app.onrender.com'; // Ensure this is in your .env

// --- Main App Component ---
function App() {
  const [inputValue, setInputValue] = useState('');
  const [currentWord, setCurrentWord] = useState<string | null>(null);
  const [focusWordInfo, setFocusWordInfo] = useState<WordInfo | null>(null);
  const [activeMode, setActiveMode] = useState<ContentMode>('explain');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [user, setUser] = useState<User | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');

  // FIX 1: State for pending word generation after authentication
  const [pendingGenerationWord, setPendingGenerationWord] = useState<string | null>(null);

  // Quiz State
  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [currentQuizQuestionIndex, setCurrentQuizQuestionIndex] = useState(0);
  const [quizFeedback, setQuizFeedback] = useState<string | null>(null);
  const [showQuizSummary, setShowQuizSummary] = useState(false);

  // Streak State
  const [liveStreak, setLiveStreak] = useState<{ words: string[]; score: number }>({ words: [], score: 0 });

  // Profile Modal State
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Helper to get token
  const getToken = () => localStorage.getItem('token');

  // --- Authentication Effects and Functions ---
  useEffect(() => {
    const token = getToken();
    if (token) {
      try {
        const decodedToken = jwtDecode<DecodedToken>(token);
        if (decodedToken.exp * 1000 > Date.now()) {
          setUser({ userId: decodedToken.userId, username: decodedToken.username });
        } else {
          localStorage.removeItem('token'); // Token expired
        }
      } catch (error) {
        console.error("Invalid token:", error);
        localStorage.removeItem('token');
      }
    }
  }, []);

  const handleAuthSuccess = (token: string, username: string, userId: string) => {
    localStorage.setItem('token', token);
    setUser({ userId, username });
    setIsAuthModalOpen(false);
    setErrorMessage(null); // Clear any previous auth errors

    // FIX 1: Process pending word generation
    if (pendingGenerationWord) {
      console.log("Auth success, processing pending word:", pendingGenerationWord);
      handleGenerateExplanation(pendingGenerationWord, 'explain');
      setPendingGenerationWord(null);
    }
  };

  const handleLogout = () => {
    endCurrentStreakIfNeeded(true); // End streak on logout
    localStorage.removeItem('token');
    setUser(null);
    setCurrentWord(null);
    setFocusWordInfo(null);
    setInputValue('');
    setLiveStreak({ words: [], score: 0 });
    // Reset other states as needed
  };

  // --- API Call Abstraction ---
  const apiFetch = useCallback(async (endpoint: string, options: RequestInit = {}) => {
    const token = getToken();
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers,
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
      throw error; // Re-throw to be caught by calling function if needed
    }
  }, []);


  // --- Content Generation and Handling (Incorporates FIX 1 and FIX 2 logic) ---
  const handleGenerateExplanation = useCallback(async (wordToGenerate: string, mode: ContentMode, refreshCache = false, isReviewContextFetch = false) => {
    if (!wordToGenerate.trim()) return;
    if (!user) { // FIX 1: If user not logged in, set pending word and open auth modal
      setPendingGenerationWord(wordToGenerate);
      setAuthMode('login'); // Or 'signup' depending on context
      setIsAuthModalOpen(true);
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    if (mode === 'quiz') { // Reset quiz state before fetching new quiz
      setQuizQuestions([]);
      setCurrentQuizQuestionIndex(0);
      setShowQuizSummary(false);
      setQuizFeedback(null);
    }

    try {
      // If not a review context fetch and the word is different from current focus, it's a new primary search.
      if (!isReviewContextFetch && currentWord !== wordToGenerate) {
        endCurrentStreakIfNeeded(false); // End streak for new primary word, not for logout
        setCurrentWord(wordToGenerate); // Set as new focus word
        // Start new streak
        setLiveStreak({ words: [wordToGenerate], score: 1 });
      } else if (isReviewContextFetch) {
        // This is a fetch for a word being reviewed (e.g., from streak or profile)
        // currentWord should already be set to this reviewed word by handleStreakWordClick or handleProfileWordClick
        console.log(`Review context fetch for ${wordToGenerate}, mode ${mode}. Current streak:`, liveStreak);
      }


      const data: WordInfo = await apiFetch('/generate_explanation', { // Assuming WordInfo is the expected response type
        method: 'POST',
        body: JSON.stringify({ word: wordToGenerate, mode, refresh_cache: refreshCache }),
      });

      setFocusWordInfo(data); // Update with the full data from backend
      setActiveMode(mode); // Ensure active mode is set to what was fetched

      if (mode === 'quiz' && data.generated_content_cache.quiz) {
        parseAndSetQuiz(data.generated_content_cache.quiz, data.quiz_progress || []);
      }

      // If it was a new primary word generation (not review, not sub-topic click)
      // and streak was just started, this is fine.
      // If it was a sub-topic click, handleExtendStreak would have been called before this.

    } catch (error: any) {
      // Error message is set by apiFetch
      console.error("Failed to generate content:", error.message);
      // If it was a new word attempt that failed, reset currentWord and streak
      if (!isReviewContextFetch && currentWord === wordToGenerate) {
        // setCurrentWord(null); // Or keep it to allow retry?
        // setLiveStreak({ words: [], score: 0 });
      }
    } finally {
      setIsLoading(false);
    }
  }, [user, apiFetch, currentWord]); // Added currentWord to dependencies for streak logic

  const handleSubTopicClick = (subTopic: string) => {
    if (!subTopic.trim()) return;

    // Extend streak
    if (liveStreak.score > 0 && !liveStreak.words.includes(subTopic)) {
      setLiveStreak(prev => ({
        words: [...prev.words, subTopic],
        score: prev.score + 1,
      }));
    } else if (liveStreak.score === 0) { // Should not happen if a word is already displayed
      setLiveStreak({ words: [subTopic], score: 1 });
    }

    setCurrentWord(subTopic); // Set new focus word
    setInputValue(subTopic); // Update input field as well
    handleGenerateExplanation(subTopic, 'explain', false, false); // isReviewContextFetch is false
  };

  // FIX 2: handleModeChange to fetch content if not available, especially for reviewed words
  const handleModeChange = async (newMode: ContentMode) => {
    setActiveMode(newMode);
    setErrorMessage(null); // Clear previous errors

    if (currentWord && focusWordInfo) {
      const contentAlreadyAvailable = focusWordInfo.generated_content_cache &&
        focusWordInfo.generated_content_cache[newMode] &&
        ((newMode === 'quiz' && (focusWordInfo.generated_content_cache[newMode] as QuizQuestion[]).length > 0) ||
          (newMode !== 'quiz' && focusWordInfo.generated_content_cache[newMode]));

      if (!contentAlreadyAvailable) {
        console.log(`Content for ${newMode} not found for ${currentWord}. Fetching (review context).`);
        // true for isReviewContextFetch, assuming currentWord is the one being reviewed
        await handleGenerateExplanation(currentWord, newMode, false, true);
      } else if (newMode === 'quiz' && focusWordInfo.generated_content_cache.quiz) {
        // Content is available, parse and set if it's quiz
        parseAndSetQuiz(focusWordInfo.generated_content_cache.quiz, focusWordInfo.quiz_progress || []);
        setCurrentQuizQuestionIndex(0); // Reset to first question
        setShowQuizSummary(false);
        setQuizFeedback(null);
      }
      // For other modes like 'fact', 'explain', if contentAvailable, it's already in focusWordInfo and will be rendered.
    } else if (currentWord && newMode !== 'explain') {
      // Edge case: currentWord is set, but focusWordInfo is somehow null, and user clicks a mode tab.
      // This implies we need to fetch the base explanation first or the specific mode.
      console.log(`FocusWordInfo missing for ${currentWord}, but mode changed to ${newMode}. Fetching.`);
      await handleGenerateExplanation(currentWord, newMode, false, true); // Treat as review context
    }
  };

  // --- Streak Management ---
  const endCurrentStreakIfNeeded = useCallback(async (isLogout = false) => {
    if (liveStreak.score >= 2) { // Only save meaningful streaks
      try {
        await apiFetch('/save_streak', {
          method: 'POST',
          body: JSON.stringify({ words: liveStreak.words, score: liveStreak.score }),
        });
        console.log("Streak saved:", liveStreak);
      } catch (error) {
        console.error("Failed to save streak:", error);
        // Don't set error message for this, it's a background task
      }
    }
    if (!isLogout) { // Don't reset streak words if logging out, just clear score
      setLiveStreak({ words: [], score: 0 });
    } else {
      setLiveStreak(prev => ({ ...prev, score: 0 })); // Keep words for display until UI clears, but score is 0
    }
  }, [liveStreak, apiFetch]);

  const handleStreakWordClick = async (word: string, index: number) => {
    if (!user) return; // Should not happen if streak is visible
    // Don't break the current live streak. This is a review.
    console.log(`Reviewing streak word: ${word}. Current live streak will be preserved.`);

    // Temporarily set this as the focus, but don't alter the "liveStreak" state itself.
    // Fetch its full info if not already loaded or if it's different from current focus.
    // We need to get its WordInfo to display content.
    setIsLoading(true);
    setErrorMessage(null);
    try {
      // Fetch this word's data as if it's a fresh primary load but in a review context
      // The backend's /generate_explanation can serve from cache.
      // We want its full WordInfo.
      const data: WordInfo = await apiFetch('/generate_explanation', {
        method: 'POST',
        // Fetch 'explain' by default for review, user can then change mode.
        body: JSON.stringify({ word: word, mode: 'explain', refresh_cache: false }),
      });
      setCurrentWord(word); // Set current word to the one being reviewed
      setFocusWordInfo(data);
      setActiveMode('explain'); // Default to explain view for reviewed word
      // If quiz data is part of this initial fetch, prepare it
      if (data.generated_content_cache.quiz) {
        parseAndSetQuiz(data.generated_content_cache.quiz, data.quiz_progress || []);
      }

    } catch (error) {
      console.error("Failed to load streak word for review:", error);
      setErrorMessage("Could not load content for the selected word.");
    } finally {
      setIsLoading(false);
    }
  };


  // --- Quiz Parsing and Logic ---
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
      if (lines.length < 5) { // Min: 1 Q, 4 Opts, 1 Correct Ans
        console.warn(`Skipping malformed quiz block ${index + 1}: Not enough lines.`);
        return;
      }

      let questionText = "";
      const options: { key: string; text: string }[] = [];
      let correctAnswerKey = "";

      // Try to find question (often the first line, but can be prefixed)
      const qLineRegex = /^(?:Question\s*\d*[:.]?\s*)?(.*)/i;
      let lineIdx = 0;

      // Question
      let match = lines[lineIdx]?.match(qLineRegex);
      if (match && match[1]) {
        questionText = match[1].trim();
        lineIdx++;
      } else {
        // Fallback if first line doesn't match typical question start, but might be an option
        if (lines[lineIdx]?.match(/^[A-D][).:]?\s+/i)) {
          console.warn(`Quiz block ${index + 1}: Assuming first line is an option due to no clear question start.`);
          questionText = "Question not clearly parsed"; // Placeholder
        } else {
          questionText = lines[lineIdx] || "Question not parsed"; // Fallback
          lineIdx++;
        }
      }


      // Options (A, B, C, D)
      const optionRegex = /^([A-D])[\s.)：:]*\s*(.*)/i; // Handles A) Text, A. Text, A Text, A: Text
      for (let i = 0; i < 4 && lineIdx < lines.length; i++) {
        match = lines[lineIdx]?.match(optionRegex);
        if (match) {
          options.push({ key: match[1].toUpperCase(), text: match[2].trim() });
          lineIdx++;
        } else {
          // If an option line is missing or malformed, we might misinterpret subsequent lines.
          // This part is tricky if Gemini format varies wildly.
          console.warn(`Quiz block ${index + 1}: Option line ${i + 1} (line content: "${lines[lineIdx]}") did not match regex. Attempting fallback.`);
          // Fallback: if it doesn't look like "Correct Answer:", assume it's part of the last option or a new one.
          if (!lines[lineIdx]?.toLowerCase().includes('correct answer')) {
            if (options.length > 0) options[options.length - 1].text += " " + lines[lineIdx]; // Append to previous
            // Or, if you expect strictly 4 options, this could be an error.
          }
          // lineIdx++; // Consume line even if not perfectly parsed as an option
          break; // Stop parsing options for this question if format breaks
        }
      }

      if (options.length !== 4) {
        console.warn(`Skipping quiz block ${index + 1}: Did not find 4 options. Found:`, options.map(o => o.key));
        // return; // Strict: skip if not 4 options
      }


      // Correct Answer
      // It might be on the same line as the last option or on a new line.
      const correctAnswerRegex = /(?:Correct Answer|Answer)[:\s]*([A-D])/i;
      let foundCorrect = false;
      for (let k = lineIdx; k < lines.length; k++) { // Search remaining lines
        match = lines[k].match(correctAnswerRegex);
        if (match) {
          correctAnswerKey = match[1].toUpperCase();
          foundCorrect = true;
          break;
        }
      }
      // Check last option line again if not found on separate line
      if (!foundCorrect && options.length > 0) {
        const lastOptionText = options[options.length - 1].text;
        match = lastOptionText.match(correctAnswerRegex);
        if (match) {
          correctAnswerKey = match[1].toUpperCase();
          // Clean the "Correct Answer: X" part from the option text
          options[options.length - 1].text = lastOptionText.replace(correctAnswerRegex, "").trim();
          foundCorrect = true;
        }
      }

      if (questionText && options.length > 0 && correctAnswerKey) { // Be more lenient on option count if needed
        parsedQs.push({ question: questionText, options, correctAnswerKey });
      } else {
        console.warn(`Skipping quiz block ${index + 1} due to missing parts: Q: ${!!questionText}, Opts: ${options.length}, Ans: ${!!correctAnswerKey}`);
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
      questions = quizData as QuizQuestion[]; // Already parsed (e.g. from cache refresh)
    } else {
      console.error("Unsupported quiz data format:", quizData);
      setErrorMessage("Received quiz in an unexpected format.");
      questions = [];
    }

    // Apply progress
    const questionsWithProgress = questions.map((q, idx) => {
      const attempt = progress.find(p => p.question_index === idx);
      if (attempt) {
        return { ...q, userSelectedOptionKey: attempt.selected_option_key, isCorrect: attempt.is_correct };
      }
      return q;
    });

    setQuizQuestions(questionsWithProgress);
    setCurrentQuizQuestionIndex(0); // Start from the first question
    setShowQuizSummary(false);
    setQuizFeedback(null);
  };

  const handleAnswerSubmit = async (selectedOptionKey: string) => {
    if (showQuizSummary || !quizQuestions[currentQuizQuestionIndex]) return;

    const currentQuestion = quizQuestions[currentQuizQuestionIndex];
    const isCorrect = currentQuestion.correctAnswerKey === selectedOptionKey;
    setQuizFeedback(isCorrect ? "Correct!" : `Wrong! Correct answer: ${currentQuestion.correctAnswerKey}`);

    // Update question state with user's answer
    const updatedQuestions = [...quizQuestions];
    updatedQuestions[currentQuizQuestionIndex] = {
      ...currentQuestion,
      userSelectedOptionKey: selectedOptionKey,
      isCorrect: isCorrect,
    };
    setQuizQuestions(updatedQuestions);

    // Save attempt to backend
    if (currentWord && user) {
      try {
        await apiFetch('/save_quiz_attempt', {
          method: 'POST',
          body: JSON.stringify({
            word: currentWord,
            question_index: currentQuizQuestionIndex,
            selected_option_key: selectedOptionKey,
            is_correct: isCorrect,
          }),
        });
        // Update local focusWordInfo.quiz_progress if needed, or rely on next full fetch
        if (focusWordInfo) {
          const newProgress = [...(focusWordInfo.quiz_progress || [])];
          const existingAttemptIdx = newProgress.findIndex(p => p.question_index === currentQuizQuestionIndex);
          if (existingAttemptIdx > -1) {
            newProgress[existingAttemptIdx] = { question_index: currentQuizQuestionIndex, selected_option_key: selectedOptionKey, is_correct: isCorrect };
          } else {
            newProgress.push({ question_index: currentQuizQuestionIndex, selected_option_key: selectedOptionKey, is_correct: isCorrect });
          }
          setFocusWordInfo(prev => prev ? { ...prev, quiz_progress: newProgress } : null);
        }


      } catch (error) {
        console.error("Failed to save quiz attempt:", error);
        // Show error to user?
      }
    }

    // Auto-advance after a short delay
    setTimeout(() => {
      setQuizFeedback(null);
      if (currentQuizQuestionIndex < quizQuestions.length - 1) {
        setCurrentQuizQuestionIndex(prevIndex => prevIndex + 1);
      } else {
        setShowQuizSummary(true);
      }
    }, 1500); // 1.5 seconds feedback display
  };

  const handleMoreQuizQuestions = async () => {
    if (currentWord) {
      // This will call handleGenerateExplanation with refreshCache = true for quiz mode
      await handleGenerateExplanation(currentWord, 'quiz', true, true); // true for refresh, true for review context
      // Quiz state (questions, index, summary) will be reset within handleGenerateExplanation or parseAndSetQuiz
    }
  };

  // --- Profile Modal ---
  const fetchProfileData = useCallback(async () => {
    if (!user) return;
    setProfileLoading(true);
    setProfileError(null);
    try {
      const data: ProfileData = await apiFetch('/profile');
      setProfileData(data);
    } catch (error: any) {
      setProfileError(error.message || "Failed to load profile.");
    } finally {
      setProfileLoading(false);
    }
  }, [user, apiFetch]);

  const openProfileModal = () => {
    fetchProfileData(); // Fetch fresh data when opening
    setIsProfileModalOpen(true);
  };

  const handleProfileWordClick = async (word: string) => {
    setIsProfileModalOpen(false); // Close profile modal
    // This is a review context. Preserve live streak.
    console.log(`Reviewing profile word: ${word}. Current live streak will be preserved.`);

    setIsLoading(true);
    setErrorMessage(null);
    try {
      const data: WordInfo = await apiFetch('/generate_explanation', {
        method: 'POST',
        body: JSON.stringify({ word: word, mode: 'explain', refresh_cache: false }),
      });
      setCurrentWord(word);
      setFocusWordInfo(data);
      setActiveMode('explain');
      setInputValue(word); // Update main input field
      if (data.generated_content_cache.quiz) {
        parseAndSetQuiz(data.generated_content_cache.quiz, data.quiz_progress || []);
      }
    } catch (error) {
      console.error("Failed to load profile word for review:", error);
      setErrorMessage("Could not load content for the selected word.");
    } finally {
      setIsLoading(false);
    }
  };

  // --- Favorite Toggle ---
  const handleToggleFavorite = async () => {
    if (!currentWord || !user || !focusWordInfo) return;
    try {
      const response = await apiFetch('/toggle_favorite', {
        method: 'POST',
        body: JSON.stringify({ word: currentWord }),
      });
      setFocusWordInfo(prev => prev ? { ...prev, is_favorite: response.is_favorite } : null);
    } catch (error) {
      console.error("Failed to toggle favorite:", error);
      setErrorMessage("Could not update favorite status.");
    }
  };

  // --- Input Handling and Form Submission ---
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (inputValue.trim() && user) { // If user exists, directly generate
      handleGenerateExplanation(inputValue.trim(), 'explain');
    } else if (inputValue.trim() && !user) { // FIX 1: If no user, this path triggers auth flow
      handleGenerateExplanation(inputValue.trim(), 'explain');
    }
  };

  // Clear streak if input is cleared while a streak is active
  useEffect(() => {
    if (inputValue.trim() === '' && liveStreak.score > 0 && currentWord && !liveStreak.words.includes(currentWord)) {
      // This condition means input was cleared AFTER a sub-topic was clicked, but before new primary search
      // Or if currentWord is part of streak and input is cleared.
      // More robust: end streak if input is cleared and no generation is in progress for a new word.
      // This might be too aggressive. Consider if clearing input should always end streak.
      // The project report says: "ends ... on clearing input field while streak is active"
      // Let's assume if input is empty and there was a streak, end it.
      // But ensure it doesn't end if user is just typing a new word.
    }
    // A better place for ending streak on input clear might be tied to the "Generate" button for a *new* word
    // or if the input is cleared and focus shifts.
    // For now, relying on endCurrentStreakIfNeeded before new primary search.
  }, [inputValue, liveStreak.score, currentWord]);


  // --- Render Helper for Clickable Text ---
  const renderClickableText = (textWithTags: string) => {
    if (!textWithTags || typeof textWithTags !== 'string') return textWithTags;
    const parts = textWithTags.split(/<\/?click>/g);
    return parts.map((part, index) =>
      index % 2 === 1 ? (
        <button
          key={index}
          onClick={() => handleSubTopicClick(part)}
          className="text-purple-600 hover:text-purple-800 font-semibold underline decoration-dotted hover:decoration-solid"
        >
          {part}
        </button>
      ) : (
        <span key={index}>{part}</span>
      )
    );
  };

  // --- JSX Structure ---
  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-600 to-indigo-700 text-white flex flex-col items-center p-4 font-sans">
      {/* Header */}
      <header className="w-full max-w-3xl mb-6 flex justify-between items-center">
        <h1 className="text-4xl font-bold">Tiny Tutor AI</h1>
        <div>
          {user ? (
            <>
              <span className="mr-4">Welcome, {user.username}! (ID: {user.userId})</span>
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

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="w-full max-w-xl mb-6">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Enter a word or concept..."
          className="w-full p-3 rounded-lg text-gray-800 bg-white/90 focus:ring-2 focus:ring-purple-400 focus:outline-none shadow-md"
          disabled={isLoading}
        />
        <button
          type="submit"
          className="w-full mt-3 bg-yellow-500 hover:bg-yellow-400 text-gray-800 font-semibold py-3 px-4 rounded-lg shadow-md transition-colors disabled:opacity-50"
          disabled={isLoading || !inputValue.trim()}
        >
          {isLoading && !currentWord ? 'Authenticating...' : isLoading ? 'Generating...' : 'Generate Explanation'}
        </button>
      </form>

      {/* Error Message Display */}
      {errorMessage && <div className="w-full max-w-xl bg-red-200 text-red-700 p-3 rounded-lg mb-4 text-center shadow">{errorMessage}</div>}

      {/* Live Streak Display */}
      {liveStreak.score > 0 && (
        <div className="w-full max-w-xl bg-white/20 p-3 rounded-lg mb-4 text-sm">
          <span className="font-semibold">Live Streak ({liveStreak.score}): </span>
          {liveStreak.words.map((word, index) => (
            <React.Fragment key={index}>
              <button
                onClick={() => handleStreakWordClick(word, index)}
                className={`hover:underline ${word === currentWord ? 'font-bold text-yellow-300' : ''}`}
              >
                {word}
              </button>
              {index < liveStreak.words.length - 1 && " → "}
            </React.Fragment>
          ))}
        </div>
      )}


      {/* Content Area */}
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

          {/* Mode Toggles */}
          <div className="flex space-x-2 mb-4 border-b pb-2">
            {(["explain", "fact", "quiz", "image", "deep_dive"] as ContentMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => handleModeChange(mode)}
                className={`py-2 px-4 rounded-t-lg font-medium transition-colors
                  ${activeMode === mode ? 'bg-purple-600 text-white' : 'text-gray-600 hover:bg-purple-100'}`}
              >
                {mode.charAt(0).toUpperCase() + mode.slice(1)}
              </button>
            ))}
          </div>

          {/* Loading Indicator for Content Area */}
          {isLoading && <div className="text-center p-4">Loading content...</div>}

          {/* Content Display */}
          {!isLoading && activeMode === 'explain' && focusWordInfo.generated_content_cache.explain && (
            <div>{renderClickableText(focusWordInfo.generated_content_cache.explain)}</div>
          )}
          {!isLoading && activeMode === 'fact' && focusWordInfo.generated_content_cache.fact && (
            <div>{focusWordInfo.generated_content_cache.fact}</div>
          )}
          {!isLoading && activeMode === 'image' && (
            <div>{focusWordInfo.generated_content_cache.image || "Image content will appear here."}</div>
          )}
          {!isLoading && activeMode === 'deep_dive' && (
            <div>{focusWordInfo.generated_content_cache.deep_dive || "Deep dive content will appear here."}</div>
          )}

          {/* Quiz Display */}
          {!isLoading && activeMode === 'quiz' && (
            <div>
              {quizQuestions.length > 0 ? (
                !showQuizSummary ? (
                  <div className="quiz-question-container">
                    <h3 className="text-xl font-semibold mb-3">{quizQuestions[currentQuizQuestionIndex]?.question}</h3>
                    <div className="space-y-2">
                      {quizQuestions[currentQuizQuestionIndex]?.options.map(opt => (
                        <button
                          key={opt.key}
                          onClick={() => handleAnswerSubmit(opt.key)}
                          disabled={!!quizFeedback || !!quizQuestions[currentQuizQuestionIndex]?.userSelectedOptionKey}
                          className={`w-full text-left p-3 border rounded-lg hover:bg-purple-100 transition-colors disabled:opacity-70
                            ${quizQuestions[currentQuizQuestionIndex]?.userSelectedOptionKey === opt.key
                              ? (quizQuestions[currentQuizQuestionIndex]?.isCorrect ? 'bg-green-200 border-green-400' : 'bg-red-200 border-red-400')
                              : 'border-gray-300'
                            }`}
                        >
                          {opt.key}) {opt.text}
                        </button>
                      ))}
                    </div>
                    {quizFeedback && <div className={`mt-3 p-2 rounded text-center ${quizFeedback.startsWith("Correct") ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{quizFeedback}</div>}
                  </div>
                ) : (
                  // Quiz Summary
                  <div className="quiz-summary-container">
                    <h3 className="text-2xl font-semibold mb-4 text-purple-700">Quiz Summary for "{currentWord}"</h3>
                    {quizQuestions.map((q, idx) => (
                      <div key={idx} className="mb-4 p-3 border rounded-lg bg-gray-50">
                        <p className="font-medium">Q{idx + 1}: {q.question}</p>
                        <p className={`text-sm ${q.isCorrect ? 'text-green-600' : 'text-red-600'}`}>
                          Your answer: {q.userSelectedOptionKey} ({q.options.find(o => o.key === q.userSelectedOptionKey)?.text}) - {q.isCorrect ? "Correct" : "Wrong"}
                        </p>
                        {!q.isCorrect && <p className="text-sm text-gray-600">Correct answer: {q.correctAnswerKey} ({q.options.find(o => o.key === q.correctAnswerKey)?.text})</p>}
                      </div>
                    ))}
                    <p className="text-lg font-semibold mt-4">
                      Overall Score: {quizQuestions.filter(q => q.isCorrect).length} / {quizQuestions.length}
                    </p>
                    <button
                      onClick={handleMoreQuizQuestions}
                      className="mt-4 bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                    >
                      More Questions for "{currentWord}"
                    </button>
                  </div>
                )
              ) : (
                <p>No quiz questions available for this topic, or quiz is loading.</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Authentication Modal */}
      {isAuthModalOpen && (
        <AuthModal
          isOpen={isAuthModalOpen}
          onClose={() => {
            setIsAuthModalOpen(false);
            if (!user) setPendingGenerationWord(null); // Clear pending word if modal closed without auth
          }}
          mode={authMode}
          setMode={setAuthMode}
          onAuthSuccess={handleAuthSuccess}
          apiBaseUrl={API_BASE_URL}
        />
      )}

      {/* Profile Modal */}
      {isProfileModalOpen && (
        <ProfileModal
          isOpen={isProfileModalOpen}
          onClose={() => setIsProfileModalOpen(false)}
          profileData={profileData}
          isLoading={profileLoading}
          error={profileError}
          onWordClick={handleProfileWordClick} // Pass handler
        />
      )}

    </div>
  );
}


// --- AuthModal Component (Placeholder Structure) ---
interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  mode: 'login' | 'signup';
  setMode: (mode: 'login' | 'signup') => void;
  onAuthSuccess: (token: string, username: string, userId: string) => void;
  apiBaseUrl: string;
}

const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, mode, setMode, onAuthSuccess, apiBaseUrl }) => {
  const [emailOrUsername, setEmailOrUsername] = useState('');
  const [username, setUsername] = useState(''); // For signup
  const [email, setEmail] = useState(''); // For signup
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

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
      if (!response.ok) {
        throw new Error(data.error || `Failed to ${mode}`);
      }
      onAuthSuccess(data.token, data.username, data.userId);
      // Clear form fields on success
      setEmailOrUsername(''); setUsername(''); setEmail(''); setPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md text-gray-800">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-purple-700">{mode === 'login' ? 'Login' : 'Sign Up'}</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
        </div>

        {error && <div className="bg-red-100 text-red-700 p-3 rounded mb-4">{error}</div>}

        <form onSubmit={handleSubmit}>
          {mode === 'signup' && (
            <>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1" htmlFor="signup-username">Username</label>
                <input type="text" id="signup-username" value={username} onChange={e => setUsername(e.target.value)} required className="w-full p-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
              </div>
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1" htmlFor="signup-email">Email</label>
                <input type="email" id="signup-email" value={email} onChange={e => setEmail(e.target.value)} required className="w-full p-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
              </div>
            </>
          )}
          {mode === 'login' && (
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1" htmlFor="login-email-username">Email or Username</label>
              <input type="text" id="login-email-username" value={emailOrUsername} onChange={e => setEmailOrUsername(e.target.value)} required className="w-full p-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
            </div>
          )}
          <div className="mb-6">
            <label className="block text-sm font-medium mb-1" htmlFor="password">Password</label>
            <input type="password" id="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full p-2 border border-gray-300 rounded-md focus:ring-purple-500 focus:border-purple-500" />
          </div>
          <button type="submit" disabled={isLoading} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-semibold py-2 px-4 rounded-md transition-colors disabled:opacity-50">
            {isLoading ? 'Processing...' : (mode === 'login' ? 'Login' : 'Sign Up')}
          </button>
        </form>
        <button onClick={() => setMode(mode === 'login' ? 'signup' : 'login')} className="mt-4 text-sm text-purple-600 hover:underline">
          {mode === 'login' ? "Don't have an account? Sign Up" : "Already have an account? Login"}
        </button>
      </div>
    </div>
  );
};


// --- ProfileModal Component (Placeholder Structure) ---
interface ProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileData: ProfileData | null;
  isLoading: boolean;
  error: string | null;
  onWordClick: (word: string) => void; // Handler for clicking words in lists
}

const ProfileModal: React.FC<ProfileModalProps> = ({ isOpen, onClose, profileData, isLoading, error, onWordClick }) => {
  if (!isOpen) return null;

  const AccordionSection: React.FC<{ title: string; items: Array<{ id: string, name: string, details?: string, subItems?: string[] }> | null; itemName?: string, onNameClick: (name: string) => void }> = ({ title, items, itemName, onNameClick }) => {
    const [isOpen, setIsOpen] = useState(false);
    return (
      <div className="mb-2 border rounded-md overflow-hidden">
        <button onClick={() => setIsOpen(!isOpen)} className="w-full p-3 text-left bg-gray-100 hover:bg-gray-200 font-medium flex justify-between items-center">
          {title}
          <span>{isOpen ? '−' : '+'}</span>
        </button>
        {isOpen && (
          <div className="p-3 bg-white max-h-60 overflow-y-auto">
            {items && items.length > 0 ? items.map(item => (
              <div key={item.id || item.name} className="py-1 text-sm">
                <button onClick={() => onNameClick(item.name)} className="font-semibold text-purple-600 hover:underline">{item.name}</button>
                {item.details && <span className="text-gray-500 ml-2">({item.details})</span>}
                {item.subItems && item.subItems.length > 0 && (
                  <span className="text-gray-500 ml-1 text-xs"> ({item.subItems.join(', ')})</span>
                )}
              </div>
            )) : <p className="text-xs text-gray-500">No {itemName || 'items'} yet.</p>}
          </div>
        )}
      </div>
    );
  };


  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg text-gray-800 max-h-[90vh] flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-purple-700">User Profile</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">&times;</button>
        </div>

        {isLoading && <p>Loading profile...</p>}
        {error && <p className="text-red-500">{error}</p>}

        {profileData && !isLoading && !error && (
          <div className="overflow-y-auto">
            <p className="mb-1"><span className="font-semibold">Username:</span> {profileData.username}</p>
            <p className="mb-1"><span className="font-semibold">Email:</span> {profileData.email}</p>
            <p className="mb-3"><span className="font-semibold">Tier:</span> {profileData.tier}</p>
            <p className="mb-3"><span className="font-semibold">Total Words Explored:</span> {profileData.total_words_explored}</p>

            <AccordionSection
              title={`All Explored Words (${profileData.explored_words?.length || 0})`}
              items={profileData.explored_words?.map(w => ({ id: w.id, name: w.word, details: new Date(w.last_explored_at).toLocaleDateString() })) || []}
              itemName="explored words"
              onNameClick={onWordClick}
            />
            <AccordionSection
              title={`Favorite Words (${profileData.favorite_words?.length || 0})`}
              items={profileData.favorite_words?.map(w => ({ id: w.id, name: w.word, details: new Date(w.last_explored_at).toLocaleDateString() })) || []}
              itemName="favorite words"
              onNameClick={onWordClick}
            />
            <AccordionSection
              title={`Streak History (${profileData.streak_history?.length || 0})`}
              items={profileData.streak_history?.map(s => ({ id: s.id, name: `Score: ${s.score}`, details: new Date(s.completed_at).toLocaleDateString(), subItems: s.words })) || []}
              itemName="streaks"
              onNameClick={(streakName) => { /* Clicking streak title might not do anything, or show first word */ if (profileData.streak_history.find(s => `Score: ${s.score}` === streakName)?.words[0]) onWordClick(profileData.streak_history.find(s => `Score: ${s.score}` === streakName)!.words[0]) }}
            />
          </div>
        )}
      </div>
    </div>
  );
};


export default App;


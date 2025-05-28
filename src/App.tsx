import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Heart, BookOpen, User, LogOut, LogIn, RefreshCw, HelpCircle, Loader2, MessageSquare, Image as ImageIcon, FileText, Brain, PlusCircle, Award, TrendingUp, List, Star, Mail, ShieldCheck, CalendarDays } from 'lucide-react';
import './App.css';

// --- Constants ---
const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';
const AUTO_ADVANCE_DELAY = 1500; // ms

// --- Types ---
interface UserProfile {
  username: string;
  email?: string;
  tier?: string;
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
}

interface StreakEntry {
  id: string;
  words: string[];
  score: number;
  completed_at: string;
}

interface QuizAttempt {
  question_index: number;
  selected_option_key: string;
  is_correct: boolean;
  timestamp: string;
}

interface WordContent {
  explain?: string;
  image?: string;
  fact?: string;
  quiz?: string[];
  deep_dive?: string;
  is_favorite?: boolean;
  quiz_progress?: QuizAttempt[];
  explicit_connections?: string[];
  modes_generated?: string[];
}

interface GeneratedContent {
  [key: string]: WordContent;
}

type ContentMode = 'explain' | 'image' | 'fact' | 'quiz' | 'deep_dive';

interface LiveStreak {
  score: number;
  words: string[];
}

interface ParsedQuizQuestion {
  questionText: string;
  options: { key: string; text: string }[];
  correctOptionKey: string;
  originalString: string;
}

// --- Helper Functions ---
const sanitizeWordForId = (word: string): string => {
  return word.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
};

// Parser v10: Improved state machine for options and question text.
const parseQuizString = (quizStr: string): ParsedQuizQuestion | null => {
  if (!quizStr || typeof quizStr !== 'string') {
    console.error("Invalid quiz string for parsing (null or not string):", quizStr);
    return null;
  }

  const allRawLines = quizStr.trim().split('\n');
  const lines = allRawLines.map(line => line.trim()).filter(line => line.length > 0);

  if (lines.length < 3) {
    console.warn("Quiz string has too few lines after cleaning (v10):", lines.length, "Original:", quizStr);
    return null;
  }

  let questionText = '';
  const optionsMap: Map<string, string[]> = new Map(); // Store option lines here
  let correctOptionKey = '';

  const questionHeaderRegex = /^(\*\*?)?Question\s*\d*[:.)]?\s*(\*\*?)?$/i;
  const optionRegex = /^\s*([A-D])\s*[.)]\s*(.*)|^\s*([A-D])\s+(.*)/i; // Key then text
  const correctAnswerRegex = /(?:Correct Answer[:\s]*|Answer[:\s]*|Correct[:\s]*)([A-D])(?:[.,]?\s*.*)?$/i;

  let lineIndex = 0;
  let questionTextLines: string[] = [];

  // 1. Identify and extract question text
  while (lineIndex < lines.length) {
    const line = lines[lineIndex];
    if (line.match(questionHeaderRegex) && line.replace(questionHeaderRegex, '').trim().length === 0) {
      lineIndex++;
      continue;
    }
    if (line.match(optionRegex) || line.match(correctAnswerRegex)) {
      break;
    }
    const potentialQuestionPart = line.replace(questionHeaderRegex, '').trim();
    if (potentialQuestionPart) {
      questionTextLines.push(potentialQuestionPart);
    }
    lineIndex++;
  }
  questionText = questionTextLines.join(' ').trim();

  // 2. Parse options and correct answer
  let currentOptionKeyInternal: string | null = null;

  for (; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];
    const correctAnswerMatch = line.match(correctAnswerRegex);

    if (correctAnswerMatch) {
      correctOptionKey = correctAnswerMatch[1].toUpperCase();
      break; // Found answer, stop processing
    }

    const optionMatch = line.match(optionRegex);
    const keyFromResult = optionMatch ? (optionMatch[1] || optionMatch[3])?.toUpperCase() : null;
    const textFromResult = optionMatch ? (optionMatch[2] || optionMatch[4])?.trim() : null;

    if (keyFromResult && textFromResult !== null) { // Start of a new option
      currentOptionKeyInternal = keyFromResult;
      if (!optionsMap.has(currentOptionKeyInternal)) {
        optionsMap.set(currentOptionKeyInternal, []);
      }
      if (textFromResult) { // Add first line of text if present
        optionsMap.get(currentOptionKeyInternal)?.push(textFromResult);
      }
    } else if (currentOptionKeyInternal && optionsMap.has(currentOptionKeyInternal)) {
      // Continuation of current option's text
      optionsMap.get(currentOptionKeyInternal)?.push(line);
    }
  }

  const options: { key: string, text: string }[] = [];
  const optionOrder = ['A', 'B', 'C', 'D'];
  for (const key of optionOrder) {
    if (optionsMap.has(key)) {
      options.push({ key, text: optionsMap.get(key)!.join(' ').trim() });
    }
  }

  if (!questionText || options.length !== 4 || !correctOptionKey) {
    console.warn("Could not parse quiz string fully (v10):", {
      questionText,
      optionsCount: options.length,
      optionsCollected: options.map(o => ({ key: o.key, text: o.text.substring(0, 30) })),
      correctOptionKey,
      original: quizStr,
    });
    return null;
  }

  if (!options.find(opt => opt.key === correctOptionKey)) {
    console.warn(`Correct option key "${correctOptionKey}" not found among parsed option keys (v10). Parsed Keys:`, options.map(o => o.key), "Question:", questionText, "Original String:", quizStr);
    return null;
  }

  console.log("Successfully parsed quiz (v10):", { questionText, options, correctOptionKey });
  return { questionText, options, correctOptionKey, originalString: quizStr };
};


function App() {
  const [inputValue, setInputValue] = useState<string>('');
  const [currentFocusWord, setCurrentFocusWord] = useState<string>('');
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent>({});
  const [activeContentMode, setActiveContentMode] = useState<ContentMode>('explain');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem('authToken'));
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState<string | null>(null);

  const [authInputUsername, setAuthInputUsername] = useState('');
  const [authInputEmail, setAuthInputEmail] = useState('');
  const [authInputPassword, setAuthInputPassword] = useState('');

  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);

  const [liveStreak, setLiveStreak] = useState<LiveStreak | null>(null);
  const [isReviewingStreakWord, setIsReviewingStreakWord] = useState<boolean>(false);
  const [wordForReview, setWordForReview] = useState<string>('');

  // Quiz State
  const [currentQuizQuestionIndex, setCurrentQuizQuestionIndex] = useState<number>(0);
  const [selectedQuizOption, setSelectedQuizOption] = useState<string | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<{ message: string; isCorrect: boolean } | null>(null);
  const [isQuizAttemptedThisQuestion, setIsQuizAttemptedThisQuestion] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const autoAdvanceTimeoutRef = useRef<NodeJS.Timeout | null>(null);


  const getDisplayWord = useCallback(() => isReviewingStreakWord ? wordForReview : currentFocusWord, [isReviewingStreakWord, wordForReview, currentFocusWord]);
  const getDisplayWordSanitized = useCallback(() => sanitizeWordForId(getDisplayWord()), [getDisplayWord]);

  useEffect(() => {
    return () => {
      if (autoAdvanceTimeoutRef.current) {
        clearTimeout(autoAdvanceTimeoutRef.current);
      }
    };
  }, []);


  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) {
      setAuthToken(token);
      fetchUserProfile(token);
    }
  }, []);

  const fetchUserProfile = async (token: string) => {
    if (!token) return;
    console.log(`Fetching user profile from: ${API_BASE_URL}/profile`);
    try {
      const response = await fetch(`${API_BASE_URL}/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        if (response.status === 401 || response.status === 422) {
          console.warn("Token validation failed or token expired. Logging out.");
          handleLogout();
          return;
        }
        const errorData = await response.json().catch(() => ({ error: 'Failed to fetch profile' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data: UserProfile = await response.json();
      setCurrentUser(data);
    } catch (err) {
      console.error("Error fetching profile:", err);
    }
  };

  const handleAuthSuccess = (token: string, userDetails?: UserProfile) => {
    localStorage.setItem('authToken', token);
    setAuthToken(token);
    if (userDetails) {
      setCurrentUser(userDetails);
    } else {
      fetchUserProfile(token);
    }
    setShowAuthModal(false);
    setAuthError(null);
    setAuthInputUsername('');
    setAuthInputEmail('');
    setAuthInputPassword('');
  };

  const handleLogout = () => {
    endCurrentStreakIfNeeded(true);
    localStorage.removeItem('authToken');
    setAuthToken(null);
    setCurrentUser(null);
    setCurrentFocusWord('');
    setGeneratedContent({});
    setError(null);
    setAuthError(null);
    setShowAuthModal(false);
    setShowProfileModal(false);
    setAuthInputUsername('');
    setAuthInputEmail('');
    setAuthInputPassword('');
    setIsReviewingStreakWord(false);
    setWordForReview('');
    setCurrentQuizQuestionIndex(0);
    setSelectedQuizOption(null);
    setQuizFeedback(null);
    setIsQuizAttemptedThisQuestion(false);
    if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
  };

  const endCurrentStreakIfNeeded = useCallback(async (forceEnd: boolean = false) => {
    const currentLiveStreak = liveStreak;
    if (currentLiveStreak && currentLiveStreak.score >= 2 && authToken) {
      console.log(`Attempting to save streak (Score: ${currentLiveStreak.score}, Words: ${currentLiveStreak.words.join(', ')}) to: ${API_BASE_URL}/save_streak`);
      try {
        const response = await fetch(`${API_BASE_URL}/save_streak`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ words: currentLiveStreak.words, score: currentLiveStreak.score }),
        });
        if (!response.ok) {
          const errorText = await response.text();
          console.error(`Failed to save streak. Status: ${response.status}, Body: ${errorText}`);
        } else {
          console.log("Streak saved successfully.");
          if (showProfileModal && authToken) {
            fetchUserProfile(authToken);
          }
        }
      } catch (err) {
        console.error('Network error or other exception saving streak:', err);
      }
    }

    if (forceEnd || (currentLiveStreak && currentLiveStreak.score !== 0)) {
      console.log(`Resetting live streak. Force: ${forceEnd}, Previous Score: ${currentLiveStreak?.score}`);
      setLiveStreak(null);
    }
  }, [liveStreak, authToken, showProfileModal]);

  const resetQuizStateForWord = (wordId: string) => {
    console.log(`Resetting UI quiz state for word ID: ${wordId}`);
    setCurrentQuizQuestionIndex(0);
    setSelectedQuizOption(null);
    setQuizFeedback(null);
    setIsQuizAttemptedThisQuestion(false);
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
  };

  const handleGenerateExplanation = async (
    wordToFetch: string,
    isSubTopicClick: boolean = false,
    isRefreshClick: boolean = false,
    isProfileWordClick: boolean = false,
    targetMode: ContentMode = 'explain'
  ) => {
    if (!wordToFetch.trim()) {
      setError("Please enter a word.");
      return;
    }
    if (!authToken) {
      setShowAuthModal(true);
      setAuthMode('login');
      setAuthError("Please log in to generate content.");
      return;
    }

    const sanitizedWordToFetchId = sanitizeWordForId(wordToFetch);

    setIsLoading(true);
    setError(null);
    setAuthError(null);

    if (targetMode === 'quiz') {
      console.log(`Preparing to fetch quiz for "${sanitizedWordToFetchId}". Clearing existing quiz data from UI state.`);
      setGeneratedContent(prev => ({
        ...prev,
        [sanitizedWordToFetchId]: {
          ...(prev[sanitizedWordToFetchId] || {}),
          quiz: undefined,
          quiz_progress: []
        }
      }));
      resetQuizStateForWord(sanitizedWordToFetchId);
    }

    const isNewPrimaryWordSearch = !isSubTopicClick && !isRefreshClick && !isProfileWordClick;

    if (isNewPrimaryWordSearch || isProfileWordClick) {
      await endCurrentStreakIfNeeded(true);
      setIsReviewingStreakWord(false);
      setWordForReview('');
    }

    console.log(`Generating content for "${wordToFetch}", mode "${targetMode}" from: ${API_BASE_URL}/generate_explanation`);
    try {
      const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          word: wordToFetch.trim(),
          mode: targetMode,
          refresh_cache: isRefreshClick,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "An unknown error occurred." }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data: WordContent & { word: string; is_favorite: boolean; full_cache?: WordContent } = await response.json();
      const dataWord = data.word;
      const contentToStore = data.full_cache || data;
      const sanitizedFetchedWordId = sanitizeWordForId(dataWord);

      if (isNewPrimaryWordSearch || isProfileWordClick) {
        setCurrentFocusWord(dataWord);
      } else if (isSubTopicClick) {
        setCurrentFocusWord(dataWord);
      }

      setGeneratedContent(prev => {
        const newWordContent: WordContent = {
          ...(prev[sanitizedFetchedWordId] || {}),
          ...contentToStore,
          is_favorite: data.is_favorite,
        };
        if (targetMode === 'quiz' && contentToStore.quiz && contentToStore.quiz.length > 0) {
          console.log(`New quiz data received for "${dataWord}" (mode: ${targetMode}, refresh: ${isRefreshClick}). Ensuring quiz_progress is empty.`);
          newWordContent.quiz_progress = [];
        } else if (targetMode === 'quiz' && (!contentToStore.quiz || contentToStore.quiz.length === 0)) {
          console.log(`Quiz mode requested for "${dataWord}" but no questions received. Ensuring quiz_progress is empty.`);
          newWordContent.quiz_progress = [];
        }
        return {
          ...prev,
          [sanitizedFetchedWordId]: newWordContent,
        };
      });

      setActiveContentMode(targetMode);

      if (targetMode === 'quiz') {
        resetQuizStateForWord(sanitizedFetchedWordId);
      }


      if (!isSubTopicClick && !isProfileWordClick) {
        setInputValue('');
      }

      if (isSubTopicClick && liveStreak) {
        if (liveStreak.words[liveStreak.words.length - 1]?.toLowerCase() !== dataWord.toLowerCase()) {
          setLiveStreak(prev => ({
            score: (prev?.score || 0) + 1,
            words: [...(prev?.words || []), dataWord],
          }));
        }
      } else if (isNewPrimaryWordSearch || isProfileWordClick) {
        setLiveStreak({ score: 1, words: [dataWord] });
      }

    } catch (err) {
      console.error("Error generating content:", err);
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFetchNewQuizSet = () => {
    const wordForNewQuiz = getDisplayWord();
    if (wordForNewQuiz && authToken) {
      console.log(`Fetching new quiz set for "${wordForNewQuiz}" via "More Questions" button.`);
      handleGenerateExplanation(wordForNewQuiz, false, true, false, 'quiz');
    } else if (!authToken) {
      setShowAuthModal(true);
      setAuthMode('login');
      setAuthError("Please log in to get more questions.");
    }
  };

  const handleModeChange = async (mode: ContentMode) => {
    setActiveContentMode(mode);
    const wordInFocus = getDisplayWord();
    const sanitizedWordInFocus = getDisplayWordSanitized();

    if (mode !== 'quiz') {
      resetQuizStateForWord(sanitizedWordInFocus);
    }

    if (!wordInFocus) {
      if (!getDisplayWord()) {
        setError("Please search for a word first or select a word from your history/streak.");
      }
      return;
    }

    const currentWordDataForModeCheck = generatedContent[sanitizedWordInFocus];

    if (
      authToken &&
      sanitizedWordInFocus &&
      (!currentWordDataForModeCheck ||
        !currentWordDataForModeCheck[mode] ||
        (mode === 'quiz' && (!currentWordDataForModeCheck.quiz || currentWordDataForModeCheck.quiz.length === 0))
      )
    ) {
      setIsLoading(true);
      if (mode === 'quiz') {
        console.log(`Fetching quiz for "${sanitizedWordInFocus}" first time or due to missing data. Clearing UI quiz questions.`);
        setGeneratedContent(prev => ({
          ...prev,
          [sanitizedWordInFocus]: {
            ...(prev[sanitizedWordInFocus] || {}),
            quiz: undefined,
            quiz_progress: []
          }
        }));
        resetQuizStateForWord(sanitizedWordInFocus);
      }
      setError(null);

      console.log(`Fetching content for mode "${mode}" for word "${wordInFocus}" from: ${API_BASE_URL}/generate_explanation`);
      try {
        const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ word: wordInFocus.trim(), mode: mode, refresh_cache: mode === 'quiz' }),
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: `Failed to fetch content for ${mode}` }));
          throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        const data: WordContent & { word: string; is_favorite: boolean; full_cache?: WordContent } = await response.json();
        const contentToStore = data.full_cache || data;

        setGeneratedContent(prev => {
          const existingWordContent = prev[sanitizedWordInFocus] || {};
          const updatedWordContent: WordContent = {
            ...existingWordContent,
            ...contentToStore,
            is_favorite: data.is_favorite !== undefined ? data.is_favorite : existingWordContent.is_favorite,
          };
          if (mode === 'quiz' && contentToStore.quiz && contentToStore.quiz.length > 0) {
            console.log(`New quiz data received for "${wordInFocus}" during mode change. Ensuring quiz_progress is empty.`);
            updatedWordContent.quiz_progress = [];
          } else if (mode === 'quiz' && (!contentToStore.quiz || contentToStore.quiz.length === 0)) {
            updatedWordContent.quiz_progress = [];
          }
          return {
            ...prev,
            [sanitizedWordInFocus]: updatedWordContent,
          };
        });
        if (mode === 'quiz') {
          resetQuizStateForWord(sanitizedWordInFocus);
        }

      } catch (err) {
        console.error(`Error fetching ${mode} for ${wordInFocus}:`, err);
        setError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    } else if (mode === 'quiz') {
      resetQuizStateForWord(sanitizedWordInFocus);
    }
  };

  const handleToggleFavorite = async (wordToFavorite: string, currentIsFavoriteStatus?: boolean) => {
    const sanitizedWordId = sanitizeWordForId(wordToFavorite);
    const actualCurrentFavoriteStatus = currentIsFavoriteStatus !== undefined
      ? currentIsFavoriteStatus
      : (generatedContent[sanitizedWordId]?.is_favorite || false);

    if (!authToken) return;

    setGeneratedContent(prev => ({
      ...prev,
      [sanitizedWordId]: {
        ...(prev[sanitizedWordId] || { word: wordToFavorite } as WordContent),
        is_favorite: !actualCurrentFavoriteStatus,
      }
    }));
    if (currentUser && currentUser.explored_words) {
      setCurrentUser(prevUser => {
        if (!prevUser) return null;
        const updatedExploredWords = prevUser.explored_words?.map(w =>
          w.word === wordToFavorite ? { ...w, is_favorite: !actualCurrentFavoriteStatus } : w
        );
        const updatedFavoriteWords = updatedExploredWords?.filter(w => w.is_favorite);
        return { ...prevUser, explored_words: updatedExploredWords, favorite_words: updatedFavoriteWords };
      });
    }


    console.log(`Toggling favorite for "${wordToFavorite}" to ${!actualCurrentFavoriteStatus} at: ${API_BASE_URL}/toggle_favorite`);
    try {
      const response = await fetch(`${API_BASE_URL}/toggle_favorite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ word: wordToFavorite.trim() }),
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to toggle favorite on backend: ${errorText}`);
      }
      if (showProfileModal && authToken) {
        fetchUserProfile(authToken); // Re-fetch to ensure profile modal has latest from DB
      }
    } catch (err) {
      console.error("Error toggling favorite:", err);
      setGeneratedContent(prev => ({
        ...prev,
        [sanitizedWordId]: {
          ...(prev[sanitizedWordId] || { word: wordToFavorite } as WordContent),
          is_favorite: actualCurrentFavoriteStatus,
        }
      }));
      if (currentUser && currentUser.explored_words) {
        setCurrentUser(prevUser => {
          if (!prevUser) return null;
          const revertedExploredWords = prevUser.explored_words?.map(w =>
            w.word === wordToFavorite ? { ...w, is_favorite: actualCurrentFavoriteStatus } : w
          );
          const revertedFavoriteWords = revertedExploredWords?.filter(w => w.is_favorite);
          return { ...prevUser, explored_words: revertedExploredWords, favorite_words: revertedFavoriteWords };
        });
      }
      setError("Failed to update favorite status. Please try again.");
    }
  };


  const handleSubTopicClick = (subTopic: string) => {
    setIsReviewingStreakWord(false);
    setWordForReview('');
    setInputValue(subTopic);
    handleGenerateExplanation(subTopic, true, false, false, 'explain');
  };

  const handleRefreshContent = () => {
    const wordToRefresh = getDisplayWord();
    if (wordToRefresh) {
      handleGenerateExplanation(wordToRefresh, false, true, false, activeContentMode);
    }
  };

  const handleWordSelectionFromProfile = (word: string) => {
    setShowProfileModal(false);
    setInputValue(word);
    handleGenerateExplanation(word, false, false, true, 'explain');
  };

  const handleStreakWordClick = (word: string) => {
    const currentDisplayWord = getDisplayWord();
    if (word.toLowerCase() === currentDisplayWord.toLowerCase()) {
      return;
    }
    setIsReviewingStreakWord(true);
    setWordForReview(word);
    const sanitizedReviewWord = sanitizeWordForId(word);
    resetQuizStateForWord(sanitizedReviewWord);


    if (generatedContent[sanitizedReviewWord]?.explain) {
      setActiveContentMode('explain');
    } else {
      handleFetchContentForReview(word);
    }
  };

  const handleFetchContentForReview = async (wordToReview: string) => {
    if (!authToken) return;
    setIsLoading(true);
    setError(null);
    console.log(`Fetching 'explain' content for review word "${wordToReview}" from: ${API_BASE_URL}/generate_explanation`);
    try {
      const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ word: wordToReview.trim(), mode: 'explain' }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: `Failed to fetch content for review: ${wordToReview}` }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data: WordContent & { word: string; is_favorite: boolean; full_cache?: WordContent } = await response.json();
      const contentToStore = data.full_cache || data;
      const sanitizedReviewedWordId = sanitizeWordForId(data.word);

      setGeneratedContent(prev => ({
        ...prev,
        [sanitizedReviewedWordId]: {
          ...(prev[sanitizedReviewedWordId] || {}),
          ...contentToStore,
          is_favorite: data.is_favorite !== undefined ? data.is_favorite : prev[sanitizedReviewedWordId]?.is_favorite,
        },
      }));
      setActiveContentMode('explain');
    } catch (err) {
      console.error(`Error fetching 'explain' for review word ${wordToReview}:`, err);
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const wordId = getDisplayWordSanitized();
    if (activeContentMode === 'quiz' && wordId && generatedContent[wordId]?.quiz) {
      const wordData = generatedContent[wordId];
      const quizQuestions = wordData.quiz!;
      const progress = wordData.quiz_progress || [];

      const newQuestionIndex = progress.length;

      console.log(`useEffect for quiz init: wordId=${wordId}, quizQuestions.length=${quizQuestions.length}, progress.length=${progress.length}, calculated newQuestionIndex=${newQuestionIndex}`);

      setCurrentQuizQuestionIndex(newQuestionIndex);
      setSelectedQuizOption(null);
      setQuizFeedback(null);
      setIsQuizAttemptedThisQuestion(false);
      if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);

      const attemptForCurrentQuestion = progress.find(p => p.question_index === newQuestionIndex);
      if (attemptForCurrentQuestion && (newQuestionIndex < quizQuestions.length)) {
        setSelectedQuizOption(attemptForCurrentQuestion.selected_option_key);
        setQuizFeedback({
          message: attemptForCurrentQuestion.is_correct ? "Correct!" : "Incorrect.",
          isCorrect: attemptForCurrentQuestion.is_correct
        });
        setIsQuizAttemptedThisQuestion(true);
      }
    }
  }, [activeContentMode, getDisplayWordSanitized, generatedContent]);


  const handleSaveQuizAttempt = async (questionIndex: number, optionKey: string, isCorrect: boolean) => {
    const wordBeingQuizzed = getDisplayWord();
    const sanitizedWordBeingQuizzed = getDisplayWordSanitized();

    if (!authToken || !sanitizedWordBeingQuizzed) return;

    console.log(`Saving quiz attempt for "${wordBeingQuizzed}" (Q${questionIndex + 1}) to backend.`);
    try {
      const response = await fetch(`${API_BASE_URL}/save_quiz_attempt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          word: wordBeingQuizzed.trim(),
          question_index: questionIndex,
          selected_option_key: optionKey,
          is_correct: isCorrect,
        }),
      });
      if (!response.ok) {
        const responseText = await response.text();
        console.error("Backend save_quiz_attempt failed. Status:", response.status, "Response Text:", responseText);
        if (response.status === 0 || response.type === 'opaque' || responseText.toLowerCase().includes("cors")) {
          setError(`Failed to save answer: Network or CORS error with /save_quiz_attempt. Status: ${response.status}. Please check server configuration.`);
        } else {
          try {
            const errorData = JSON.parse(responseText);
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
          } catch (parseError) {
            throw new Error(`HTTP error! status: ${response.status}. Response: ${responseText.substring(0, 100)}`);
          }
        }
        return;
      }

      const newAttempt: QuizAttempt = {
        question_index: questionIndex,
        selected_option_key: optionKey,
        is_correct: isCorrect,
        timestamp: new Date().toISOString()
      };

      setGeneratedContent(prev => {
        const existingWordData = prev[sanitizedWordBeingQuizzed] || {};
        const existingProgress = existingWordData.quiz_progress || [];

        const updatedProgress = existingProgress.filter(att => att.question_index !== questionIndex);
        updatedProgress.push(newAttempt);
        updatedProgress.sort((a, b) => a.question_index - b.question_index);

        console.log(`Frontend updated quiz_progress for "${sanitizedWordBeingQuizzed}". New length: ${updatedProgress.length}`);

        return {
          ...prev,
          [sanitizedWordBeingQuizzed]: {
            ...existingWordData,
            quiz_progress: updatedProgress,
          },
        };
      });

      if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = setTimeout(() => {
        handleNextQuestion();
      }, AUTO_ADVANCE_DELAY);

    } catch (err) {
      console.error("Error in handleSaveQuizAttempt (fetch or subsequent logic):", err);
      if (!error) {
        setError("Failed to save your answer. " + (err as Error).message);
      }
      if (autoAdvanceTimeoutRef.current) clearTimeout(autoAdvanceTimeoutRef.current);
    }
  };

  const handleQuizOptionSelect = (optionKey: string, correctKey: string, questionIdx: number) => {
    if (isQuizAttemptedThisQuestion) return;

    const isCorrect = optionKey === correctKey;
    setSelectedQuizOption(optionKey);
    setQuizFeedback({ message: isCorrect ? "Correct!" : "Incorrect.", isCorrect });
    setIsQuizAttemptedThisQuestion(true);
    handleSaveQuizAttempt(questionIdx, optionKey, isCorrect);
  };

  const handleNextQuestion = () => {
    if (autoAdvanceTimeoutRef.current) {
      clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }

    const wordBeingQuizzedSanitized = getDisplayWordSanitized();
    const currentWordData = generatedContent[wordBeingQuizzedSanitized];

    if (currentWordData?.quiz && currentWordData.quiz_progress) {
      const quizSet = currentWordData.quiz;
      const progress = currentWordData.quiz_progress;
      const nextQuestionToShowIndex = progress.length;

      console.log(`handleNextQuestion: quizSet.length=${quizSet.length}, progress.length=${progress.length}, nextQuestionToShowIndex=${nextQuestionToShowIndex}`);

      if (nextQuestionToShowIndex < quizSet.length) {
        setCurrentQuizQuestionIndex(nextQuestionToShowIndex);
        setSelectedQuizOption(null);
        setQuizFeedback(null);
        setIsQuizAttemptedThisQuestion(false);
      } else {
        setCurrentQuizQuestionIndex(quizSet.length);
        setSelectedQuizOption(null);
        setQuizFeedback(null);
        setIsQuizAttemptedThisQuestion(false);
      }
    } else {
      console.warn("handleNextQuestion called but quiz data or frontend progress is missing/inconsistent.");
      setCurrentQuizQuestionIndex(0);
      setSelectedQuizOption(null);
      setQuizFeedback(null);
      setIsQuizAttemptedThisQuestion(false);
    }
  };


  const currentDisplayWordData = generatedContent[getDisplayWordSanitized()];
  const explanationHTML = { __html: currentDisplayWordData?.explain?.replace(/<click>(.*?)<\/click>/g, '<strong class="text-blue-500 hover:text-blue-700 cursor-pointer underline">$1</strong>') || '' };

  const renderContent = () => {
    const displayWordStr = getDisplayWord();
    const isQuizContentLoading = activeContentMode === 'quiz' && isLoading && (!currentDisplayWordData?.quiz || currentDisplayWordData.quiz.length === 0);

    if (isQuizContentLoading && displayWordStr) {
      return <div className="flex justify-center items-center h-32"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /> <span className="ml-2 text-gray-700">Loading new quiz for "{displayWordStr}"...</span></div>;
    }
    if (isLoading && !isQuizContentLoading && !currentDisplayWordData?.[activeContentMode] && displayWordStr) {
      return <div className="flex justify-center items-center h-32"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /> <span className="ml-2 text-gray-700">Loading {activeContentMode} for "{displayWordStr}"...</span></div>;
    }

    if (error && !(activeContentMode === 'quiz' && isQuizContentLoading)) {
      if (activeContentMode !== 'explain' || (activeContentMode === 'explain' && !currentDisplayWordData?.explain)) {
        return <div className="text-red-500 p-4 bg-red-100 rounded-md">{error}</div>;
      }
    }

    const displayData = currentDisplayWordData;
    if (!displayData && displayWordStr) return <div className="text-gray-500 p-4">Select a mode or generate content for "{displayWordStr}".</div>;
    if (!displayData && !displayWordStr) return <div className="text-gray-500 p-4">Enter a word and click "Generate Explanation".</div>;


    switch (activeContentMode) {
      case 'explain':
        if (error && !displayData?.explain) return <div className="text-red-500 p-4 bg-red-100 rounded-md">{error}</div>;
        return (
          <div className="prose max-w-none p-1 text-gray-800" onClick={(e) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'STRONG' && target.classList.contains('text-blue-500')) {
              handleSubTopicClick(target.innerText);
            }
          }}>
            <div dangerouslySetInnerHTML={explanationHTML} />
            {displayData?.explain && (
              <button
                onClick={handleRefreshContent}
                className="mt-2 text-xs text-blue-500 hover:text-blue-700 flex items-center"
                title="Refresh explanation"
              >
                <RefreshCw size={12} className="mr-1" /> Regenerate
              </button>
            )}
          </div>
        );
      case 'fact':
        if (error && !displayData?.fact) return <div className="text-red-500 p-4 bg-red-100 rounded-md">{error}</div>;
        return <div className="prose max-w-none p-1 text-gray-800">{displayData?.fact || `No fact available yet for "${displayWordStr}". Try generating it.`}</div>;
      case 'image':
        if (error && !displayData?.image) return <div className="text-red-500 p-4 bg-red-100 rounded-md">{error}</div>;
        return <div className="prose max-w-none p-1 text-gray-800">{displayData?.image || "Image feature coming soon."}</div>;
      case 'deep_dive':
        if (error && !displayData?.deep_dive) return <div className="text-red-500 p-4 bg-red-100 rounded-md">{error}</div>;
        return <div className="prose max-w-none p-1 text-gray-800">{displayData?.deep_dive || "Deep dive feature coming soon."}</div>;
      case 'quiz':
        if (error && (!displayData?.quiz || displayData.quiz.length === 0) && !isQuizContentLoading) {
          return <div className="text-red-500 p-4 bg-red-100 rounded-md">{error}</div>;
        }

        const quizSet = displayData?.quiz;
        const quizProgress = displayData?.quiz_progress || [];

        if (!quizSet || quizSet.length === 0) {
          if (!isQuizContentLoading) {
            return <div className="p-4 text-gray-500">No quiz available for "{displayWordStr}" yet. Try generating it or refreshing.</div>;
          }
          return null;
        }

        console.log(`Render Quiz: currentQuizQuestionIndex=${currentQuizQuestionIndex}, quizSet.length=${quizSet.length}, quizProgress.length=${quizProgress.length}`);

        if (currentQuizQuestionIndex >= quizSet.length) {
          let correctCount = 0;
          quizProgress.forEach(attempt => {
            if (attempt.is_correct) correctCount++;
          });

          return (
            <div className="p-4 space-y-4 text-gray-800">
              <h3 className="text-xl font-semibold text-gray-700 mb-2">Quiz Summary for "{getDisplayWord()}"</h3>
              <p className="text-lg font-medium mb-3">Your Score: {correctCount} / {quizSet.length}</p>
              <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                {quizSet.map((quizString, index) => {
                  const parsedQuestion = parseQuizString(quizString);
                  if (!parsedQuestion) return <div key={index} className="text-red-500 text-sm p-2 bg-red-50 rounded-md">Error displaying summary for question {index + 1}. <details><summary className="text-xs cursor-pointer">Details</summary><pre className="text-xs whitespace-pre-wrap break-all mt-1 p-1 bg-red-100">{quizString}</pre></details></div>;

                  const attempt = quizProgress.find(p => p.question_index === index);
                  const userSelectedOption = attempt ? parsedQuestion.options.find(o => o.key === attempt.selected_option_key) : null;
                  const correctOption = parsedQuestion.options.find(o => o.key === parsedQuestion.correctOptionKey);

                  return (
                    <div key={index} className={`p-3 border rounded-lg shadow-sm text-sm ${attempt?.is_correct ? 'bg-green-50 border-green-300' : (attempt ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-300')}`}>
                      <p className="font-semibold text-gray-800 mb-1.5">Q{index + 1}: {parsedQuestion.questionText}</p>
                      {attempt ? (
                        <>
                          <p className="text-xs">Your Answer: <span className={`font-medium ${attempt.is_correct ? 'text-green-700' : 'text-red-700'}`}>({attempt.selected_option_key}) {userSelectedOption?.text || 'N/A'}</span>
                            {attempt.is_correct ? <span className="text-green-700 font-semibold ml-1">(Correct)</span> : <span className="text-red-700 font-semibold ml-1">(Incorrect)</span>}
                          </p>
                          {!attempt.is_correct && correctOption && (
                            <p className="text-xs mt-1">Correct Answer: <span className="font-medium text-green-700">({correctOption.key}) {correctOption.text}</span></p>
                          )}
                        </>
                      ) : (
                        <p className="text-xs text-orange-600">Not attempted. Correct: ({parsedQuestion.correctOptionKey}) {correctOption?.text || 'N/A'}</p>
                      )}
                    </div>
                  );
                })}
              </div>
              <button
                onClick={handleFetchNewQuizSet}
                disabled={isLoading}
                className="w-full mt-4 bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2.5 px-4 rounded-lg transition duration-150 flex items-center justify-center disabled:opacity-60"
              >
                {isLoading ? <Loader2 className="animate-spin mr-2" size={18} /> : <PlusCircle size={18} className="mr-2" />}
                More Questions for "{getDisplayWord()}"
              </button>
            </div>
          );
        }

        const currentQuestionString = quizSet[currentQuizQuestionIndex];
        const parsedQuestion = parseQuizString(currentQuestionString);

        if (!parsedQuestion) {
          return <div className="text-red-500 p-4">Error loading question. Please try refreshing. Original string: <pre className="text-xs whitespace-pre-wrap break-all">{currentQuestionString}</pre></div>;
        }

        return (
          <div className="p-4 space-y-4 text-gray-800">
            <p className="font-semibold text-lg text-gray-700">Question {currentQuizQuestionIndex + 1} of {quizSet.length}:</p>
            <p className="text-gray-800">{parsedQuestion.questionText}</p>
            <div className="space-y-2">
              {parsedQuestion.options.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => handleQuizOptionSelect(opt.key, parsedQuestion.correctOptionKey, currentQuizQuestionIndex)}
                  disabled={isQuizAttemptedThisQuestion}
                  className={`w-full text-left p-3 rounded-lg border transition-all duration-150 text-gray-700
                    ${(selectedQuizOption === opt.key && isQuizAttemptedThisQuestion) ?
                      (quizFeedback?.isCorrect ? 'bg-green-200 border-green-400 ring-2 ring-green-500' : 'bg-red-200 border-red-400 ring-2 ring-red-500')
                      : 'bg-white hover:bg-gray-100 border-gray-300'
                    }
                    ${(isQuizAttemptedThisQuestion && opt.key === parsedQuestion.correctOptionKey && selectedQuizOption !== opt.key) ? 'border-green-500 border-2 animate-pulse-border-green' : ''} 
                    disabled:opacity-70 disabled:cursor-not-allowed
                  `}
                >
                  ({opt.key}) {opt.text}
                </button>
              ))}
            </div>
            {isQuizAttemptedThisQuestion && quizFeedback && (
              <div className={`p-2 rounded-md text-sm ${quizFeedback.isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {quizFeedback.message}
                {!quizFeedback.isCorrect && ` Correct answer was: ${parsedQuestion.correctOptionKey}`}
              </div>
            )}
            <div className="text-xs text-gray-500 mt-2">
              Progress: {quizProgress.filter(p => p.question_index < currentQuizQuestionIndex).length + (isQuizAttemptedThisQuestion ? 1 : 0)} / {quizSet.length} answered.
              Score: {quizProgress.filter(p => p.is_correct).length} correct.
            </div>
          </div>
        );
      default:
        return <div className="p-4 text-gray-500">Select a content mode.</div>;
    }
  };

  const renderProfileModal = () => {
    if (!showProfileModal || !currentUser) return null;

    const ProfileStatCard: React.FC<{ icon: React.ElementType, label: string, value: string | number | undefined, colorClass: string }> = ({ icon: Icon, label, value, colorClass }) => (
      <div className={`bg-opacity-10 ${colorClass.replace('text-', 'bg-').replace('-500', '-100')} p-4 rounded-xl shadow-md flex items-center space-x-3`}>
        <div className={`p-2 rounded-full ${colorClass.replace('text-', 'bg-').replace('-500', '-200')}`}>
          <Icon size={20} className={colorClass} />
        </div>
        <div>
          <p className="text-xs text-gray-500">{label}</p>
          <p className="text-lg font-semibold text-gray-800">{value ?? 'N/A'}</p>
        </div>
      </div>
    );

    const ListSection: React.FC<{ title: string, items: any[] | undefined, renderItem: (item: any, index: number) => JSX.Element, icon: React.ElementType, emptyText?: string }> = ({ title, items, renderItem, icon: Icon, emptyText = "Nothing here yet." }) => (
      <div className="bg-white/50 p-4 rounded-lg shadow">
        <h4 className="text-md font-semibold text-gray-700 mb-3 flex items-center"><Icon size={18} className="mr-2 text-purple-600" />{title} ({items?.length || 0})</h4>
        {items && items.length > 0 ? (
          <ul className="max-h-48 overflow-y-auto space-y-1.5 custom-scrollbar pr-1">
            {items.map(renderItem)}
          </ul>
        ) : <p className="text-xs text-gray-500 italic">{emptyText}</p>}
      </div>
    );

    return (
      <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center p-4 z-50 transition-opacity duration-300">
        <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-6 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto text-gray-800 custom-scrollbar">
          <div className="flex justify-between items-center mb-6 pb-3 border-b border-gray-300">
            <div className="flex items-center">
              <div className="p-3 bg-purple-500 rounded-full mr-3 shadow">
                <User size={24} className="text-white" />
              </div>
              <div>
                <h3 className="text-2xl font-bold text-purple-700">{currentUser.username}</h3>
                <p className="text-xs text-gray-500 flex items-center"><Mail size={12} className="mr-1" />{currentUser.email || 'Email not provided'}</p>
              </div>
            </div>
            <button onClick={() => setShowProfileModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">&times;</button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <ProfileStatCard icon={BookOpen} label="Total Words Explored" value={currentUser.total_words_explored} colorClass="text-blue-500" />
            <ProfileStatCard icon={ShieldCheck} label="Account Tier" value={currentUser.tier || 'Standard'} colorClass="text-green-500" />
            {currentUser.created_at && <ProfileStatCard icon={CalendarDays} label="Member Since" value={new Date(currentUser.created_at).toLocaleDateString()} colorClass="text-indigo-500" />}
          </div>

          <div className="space-y-4">
            <ListSection
              title="Explored Words History"
              icon={List}
              items={currentUser.explored_words?.sort((a, b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime())}
              renderItem={(wh: WordHistoryEntry) => (
                <li key={wh.id}
                  className="p-2.5 bg-white hover:bg-purple-50 rounded-md cursor-pointer flex justify-between items-center text-sm text-gray-700 shadow-sm transition-all hover:shadow-md">
                  <span onClick={() => handleWordSelectionFromProfile(wh.word)} className="flex-grow hover:underline">
                    {wh.word} <span className="text-xs text-gray-400">({new Date(wh.last_explored_at).toLocaleDateString()})</span>
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggleFavorite(wh.word, wh.is_favorite); }}
                    title={wh.is_favorite ? "Remove from favorites" : "Add to favorites"}
                    className="p-1.5 rounded-full hover:bg-red-100"
                  >
                    <Heart size={16} className={`${wh.is_favorite ? 'text-red-500 fill-current' : 'text-gray-400 hover:text-red-400'}`} />
                  </button>
                </li>
              )}
            />
            <ListSection
              title="Favorite Words"
              icon={Star}
              items={currentUser.favorite_words?.sort((a, b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime())}
              renderItem={(wh: WordHistoryEntry) => (
                <li key={wh.id}
                  className="p-2.5 bg-white hover:bg-purple-50 rounded-md cursor-pointer flex justify-between items-center text-sm text-gray-700 shadow-sm transition-all hover:shadow-md">
                  <span onClick={() => handleWordSelectionFromProfile(wh.word)} className="flex-grow hover:underline">
                    {wh.word} <span className="text-xs text-gray-400">({new Date(wh.last_explored_at).toLocaleDateString()})</span>
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleToggleFavorite(wh.word, wh.is_favorite); }}
                    title={wh.is_favorite ? "Remove from favorites" : "Add to favorites"}
                    className="p-1.5 rounded-full hover:bg-red-100"
                  >
                    <Heart size={16} className={`${wh.is_favorite ? 'text-red-500 fill-current' : 'text-gray-400 hover:text-red-400'}`} />
                  </button>
                </li>
              )}
              emptyText="No favorite words yet."
            />
            <ListSection
              title="Streak History"
              icon={TrendingUp}
              items={currentUser.streak_history?.sort((a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())}
              renderItem={(streak: StreakEntry) => (
                <li key={streak.id} className="p-2.5 bg-white hover:bg-purple-50 rounded-md text-sm text-gray-700 shadow-sm transition-all hover:shadow-md">
                  <span className="font-medium text-purple-600">Score {streak.score}:</span> {streak.words.map((w, i) => (
                    <span key={i} onClick={() => handleWordSelectionFromProfile(w)} className="cursor-pointer hover:underline">{w}</span>
                  )).reduce((prev, curr) => <>{prev} <span className="text-purple-400">→</span> {curr}</>)}
                  <span className="text-xs text-gray-400 ml-2">({new Date(streak.completed_at).toLocaleDateString()})</span>
                </li>
              )}
              emptyText="No past streaks recorded."
            />
          </div>

          <button onClick={() => setShowProfileModal(false)} className="mt-6 w-full bg-purple-600 text-white py-2.5 px-4 rounded-lg hover:bg-purple-700 transition-colors font-semibold shadow hover:shadow-md">Close</button>
        </div>
      </div>
    );
  };


  const renderAuthModal = () => {
    if (!showAuthModal) return null;

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setAuthError(null);

      const currentAuthInputUsername = authInputUsername.trim();
      const currentAuthInputEmail = authInputEmail.trim();
      const currentAuthInputPassword = authInputPassword.trim();

      let endpoint = '';
      let payload = {};

      if (authMode === 'login') {
        if (!currentAuthInputUsername || !currentAuthInputPassword) {
          setAuthError("Username/Email and Password are required for login.");
          return;
        }
        endpoint = '/login';
        payload = { email_or_username: currentAuthInputUsername, password: currentAuthInputPassword };
      } else {
        if (!currentAuthInputUsername || !currentAuthInputEmail || !currentAuthInputPassword) {
          setAuthError("Username, Email, and Password are required for signup.");
          return;
        }
        endpoint = '/signup';
        payload = { email: currentAuthInputEmail, username: currentAuthInputUsername, password: currentAuthInputPassword };
      }

      setIsLoading(true);
      console.log(`Attempting ${authMode} to: ${API_BASE_URL}${endpoint}`);
      try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || `${authMode.charAt(0).toUpperCase() + authMode.slice(1)} failed. Status: ${response.status}`);
        }
        if (authMode === 'signup') {
          setAuthMode('login');
          setAuthInputUsername(currentAuthInputUsername);
          setAuthInputEmail('');
          setAuthInputPassword('');
          setAuthError("Signup successful! Please login with your new credentials.");
        } else {
          handleAuthSuccess(data.access_token, data.user);
        }
      } catch (err) {
        console.error("Auth error:", err);
        setAuthError((err as Error).message);
      } finally {
        setIsLoading(false);
      }
    };

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-sm text-gray-800">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold">{authMode === 'login' ? 'Login' : 'Sign Up'}</h3>
            <button
              onClick={() => {
                setShowAuthModal(false);
                setAuthError(null);
                setAuthInputUsername('');
                setAuthInputEmail('');
                setAuthInputPassword('');
              }}
              className="text-gray-500 hover:text-gray-700"
            >&times;</button>
          </div>
          {authError && <p className="text-red-600 text-sm mb-3 bg-red-100 p-2 rounded-md border border-red-300">{authError}</p>}
          <form onSubmit={handleSubmit} className="space-y-4">
            {authMode === 'signup' && (
              <>
                <input
                  type="text"
                  name="username_signup"
                  autoComplete="username"
                  placeholder="Username"
                  value={authInputUsername}
                  onChange={(e) => setAuthInputUsername(e.target.value)}
                  required
                  className="w-full p-2 border border-gray-300 rounded text-gray-900 placeholder-gray-500 focus:ring-purple-500 focus:border-purple-500"
                />
                <input
                  type="email"
                  name="email_signup"
                  autoComplete="email"
                  placeholder="Email"
                  value={authInputEmail}
                  onChange={(e) => setAuthInputEmail(e.target.value)}
                  required
                  className="w-full p-2 border border-gray-300 rounded text-gray-900 placeholder-gray-500 focus:ring-purple-500 focus:border-purple-500"
                />
              </>
            )}
            {authMode === 'login' && (
              <input
                type="text"
                name="username_login"
                autoComplete="username"
                placeholder="Username or Email"
                value={authInputUsername}
                onChange={(e) => setAuthInputUsername(e.target.value)}
                required
                className="w-full p-2 border border-gray-300 rounded text-gray-900 placeholder-gray-500 focus:ring-purple-500 focus:border-purple-500"
              />
            )}
            <input
              type="password"
              name="password"
              autoComplete={authMode === 'login' ? "current-password" : "new-password"}
              placeholder="Password"
              value={authInputPassword}
              onChange={(e) => setAuthInputPassword(e.target.value)}
              required
              className="w-full p-2 border border-gray-300 rounded text-gray-900 placeholder-gray-500 focus:ring-purple-500 focus:border-purple-500"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-500 text-white py-2.5 px-4 rounded-lg hover:bg-blue-600 disabled:bg-blue-300 transition-colors duration-150 font-semibold"
            >
              {isLoading ? 'Processing...' : (authMode === 'login' ? 'Login' : 'Sign Up')}
            </button>
          </form>
          <button
            onClick={() => {
              setAuthMode(authMode === 'login' ? 'signup' : 'login');
              setAuthError(null);
              setAuthInputUsername('');
              setAuthInputEmail('');
              setAuthInputPassword('');
            }}
            className="mt-4 text-sm text-blue-500 hover:underline w-full text-center"
          >
            {authMode === 'login' ? "Need an account? Sign Up" : "Already have an account? Login"}
          </button>
        </div>
      </div>
    );
  };


  const displayWord = getDisplayWord();
  const displayWordSanitized = getDisplayWordSanitized();
  const isFavoriteCurrent = generatedContent[displayWordSanitized]?.is_favorite || false;

  const contentModes: { id: ContentMode, label: string, icon: React.ElementType }[] = [
    { id: 'explain', label: 'Explain', icon: MessageSquare },
    { id: 'quiz', label: 'Quiz', icon: HelpCircle },
    { id: 'fact', label: 'Fact', icon: Brain },
    { id: 'image', label: 'Image', icon: ImageIcon },
    { id: 'deep_dive', label: 'Deep Dive', icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-gray-100 flex flex-col items-center p-4 font-sans">
      <div className="w-full max-w-3xl bg-white/10 backdrop-blur-md shadow-2xl rounded-xl p-6 md:p-8">
        <header className="flex flex-col sm:flex-row justify-between items-center mb-6 pb-4 border-b border-white/20">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 mb-2 sm:mb-0">
            Tiny Tutor AI
          </h1>
          <div className="flex items-center space-x-3">
            {currentUser && <span className="text-sm">Hi, {currentUser.username}!</span>}
            {authToken ? (
              <>
                <button onClick={() => { if (authToken) fetchUserProfile(authToken); setShowProfileModal(true); }} title="Profile" className="p-2 rounded-full hover:bg-white/20 transition-colors"><User size={20} /></button>
                <button onClick={handleLogout} title="Logout" className="p-2 rounded-full hover:bg-white/20 transition-colors"><LogOut size={20} /></button>
              </>
            ) : (
              <button onClick={() => { setShowAuthModal(true); setAuthMode('login'); setAuthError(null); }} title="Login" className="p-2 rounded-full hover:bg-white/20 transition-colors"><LogIn size={20} /></button>
            )}
          </div>
        </header>

        <div className="mb-6">
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleGenerateExplanation(inputValue, false, false, false, 'explain')}
              placeholder="Enter a word or concept..."
              className="flex-grow p-3 rounded-lg bg-white/20 border border-white/30 focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none placeholder-gray-300 text-white"
            />
            <button
              onClick={() => handleGenerateExplanation(inputValue, false, false, false, 'explain')}
              disabled={isLoading || !inputValue.trim()}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-3 px-6 rounded-lg shadow-md hover:shadow-lg transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {isLoading && !currentDisplayWordData && inputValue.trim() ? <Loader2 className="animate-spin mr-2" size={20} /> : <BookOpen size={20} className="mr-2" />}
              Generate Explanation
            </button>
          </div>
        </div>

        {liveStreak && liveStreak.score > 0 && (
          <div className="mb-4 p-3 bg-white/10 rounded-lg text-sm">
            <span className="font-semibold">Live Streak: {liveStreak.score} </span>
            <span>
              (
              {liveStreak.words.map((word, index) => (
                <React.Fragment key={index}>
                  <span
                    onClick={() => handleStreakWordClick(word)}
                    className={`cursor-pointer hover:underline ${(isReviewingStreakWord && wordForReview.toLowerCase() === word.toLowerCase()) || (!isReviewingStreakWord && currentFocusWord.toLowerCase() === word.toLowerCase()) ? 'font-bold text-purple-300' : ''}`}
                  >
                    {word}
                  </span>
                  {index < liveStreak.words.length - 1 && ' → '}
                </React.Fragment>
              ))}
              )
            </span>
            {isReviewingStreakWord && <span className="ml-2 text-xs italic">(Reviewing: {wordForReview})</span>}
          </div>
        )}

        {(displayWord || (error && activeContentMode !== 'explain' && activeContentMode !== 'quiz') || authError) && (
          <div className="bg-white/5 backdrop-blur-sm shadow-inner rounded-lg min-h-[200px]">
            <div className="flex flex-wrap items-center justify-between p-3 border-b border-white/20">
              <div className="flex flex-wrap gap-1">
                {contentModes.map(modeInfo => (
                  <button
                    key={modeInfo.id}
                    onClick={() => handleModeChange(modeInfo.id)}
                    disabled={!displayWord && !error && !authError && !isLoading}
                    className={`px-3 py-1.5 text-xs sm:text-sm rounded-md transition-colors flex items-center
                            ${activeContentMode === modeInfo.id ? 'bg-purple-500 text-white shadow-md' : 'bg-white/10 hover:bg-white/20 text-gray-200'}
                            ${(!displayWord && !error && !authError) ? 'opacity-50 cursor-not-allowed' : ''}
                            ${isLoading ? 'opacity-70 cursor-wait' : ''} 
                            `}
                  >
                    <modeInfo.icon size={14} className="mr-1.5" /> {modeInfo.label}
                  </button>
                ))}
              </div>
              {displayWord && (
                <button
                  onClick={() => handleToggleFavorite(getDisplayWord())}
                  title={isFavoriteCurrent ? "Remove from favorites" : "Add to favorites"}
                  className="p-2 rounded-full hover:bg-white/20 transition-colors disabled:opacity-50"
                  disabled={isLoading}
                >
                  <Heart size={20} className={`${isFavoriteCurrent ? 'text-red-500 fill-current' : 'text-gray-400'}`} />
                </button>
              )}
            </div>

            <div className="p-2 sm:p-4 text-gray-800 bg-white rounded-b-lg">
              {renderContent()}
            </div>
          </div>
        )}

        {renderAuthModal()}
        {renderProfileModal()}

      </div>
      <footer className="mt-8 text-center text-xs text-gray-400">
        <p>&copy; {new Date().getFullYear()} Tiny Tutor AI. Learning enhanced by AI.</p>
      </footer>
    </div>
  );
}

  export default App;
```

Secondly, the **`app.py` (Backend)** prompt refinement:


```python
# app.py
from flask import Flask, request, jsonify, current_app 
from flask_cors import CORS
import os
import re
  from dotenv import load_dotenv
import firebase_admin
  from firebase_admin import credentials, firestore
import json
import base64
import google.generativeai as genai
import jwt
  from datetime import datetime, timedelta, timezone
from werkzeug.security import generate_password_hash, check_password_hash
from functools import wraps
  from flask_limiter import Limiter
  from flask_limiter.util import get_remote_address

load_dotenv()

app = Flask(__name__)

CORS(app,
  resources = {
    r"/*": {
      "origins": [
        "https://tiny-tutor-app-frontend.onrender.com",
        "http://localhost:5173",
        "http://127.0.0.1:5173"
      ]
    }
  },
  supports_credentials = True,
  expose_headers = ["Content-Type", "Authorization"],
  allow_headers = ["Content-Type", "Authorization", "X-Requested-With"]
)

app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'fallback_secret_key_for_dev_only_change_me')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(hours = 24)

service_account_key_base64 = os.getenv('FIREBASE_SERVICE_ACCOUNT_KEY_BASE64')
db = None
if service_account_key_base64:
  try:
decoded_key_bytes = base64.b64decode(service_account_key_base64)
decoded_key_str = decoded_key_bytes.decode('utf-8')
service_account_info = json.loads(decoded_key_str)
if not firebase_admin._apps:
cred = credentials.Certificate(service_account_info)
firebase_admin.initialize_app(cred)
app.logger.info("Firebase Admin SDK initialized successfully from Base64.")
        else:
app.logger.info("Firebase Admin SDK already initialized.")
db = firestore.client()
    except Exception as e:
app.logger.error(f"Failed to initialize Firebase Admin SDK from Base64: {e}")
db = None
else:
app.logger.warning("FIREBASE_SERVICE_ACCOUNT_KEY_BASE64 not found. Firebase Admin SDK not initialized.")

gemini_api_key = os.getenv('GEMINI_API_KEY')
if gemini_api_key:
  try:
genai.configure(api_key = gemini_api_key)
app.logger.info("Google Gemini API configured successfully.")
    except Exception as e:
app.logger.error(f"Failed to configure Google Gemini API: {e}")
else:
app.logger.warning("GEMINI_API_KEY not found. Google Gemini API not configured.")

limiter = Limiter(
  get_remote_address,
  app = app,
  default_limits = ["200 per day", "50 per hour"],
  storage_uri = "memory://",
)

def sanitize_word_for_id(word: str) -> str:
if not isinstance(word, str): return "invalid_input"
sanitized = word.lower()
sanitized = re.sub(r'\s+', '_', sanitized)
sanitized = re.sub(r'[^a-z0-9_]', '', sanitized)
return sanitized if sanitized else "empty_word"

def token_required(f):
@wraps(f)
    def decorated_function(* args, ** kwargs):
if request.method == 'OPTIONS':
  app.logger.info(f"OPTIONS request received for: {request.path}, allowing through for CORS handling.")
response = current_app.make_default_options_response()
return response

token = None
auth_header = request.headers.get('Authorization')
if auth_header and auth_header.startswith('Bearer '):
try:
token = auth_header.split(" ")[1]
            except IndexError:
app.logger.warning(f"Malformed Bearer token for {request.path}.")
return jsonify({ "error": "Bearer token malformed" }), 401

if not token:
  app.logger.warning(f"Token is missing for {request.method} request to {request.path}.")
return jsonify({ "error": "Token is missing" }), 401

try:
payload = jwt.decode(token, app.config['JWT_SECRET_KEY'], algorithms = ['HS256'], leeway = timedelta(seconds = 30))
current_user_id = payload['user_id']
        except jwt.ExpiredSignatureError:
app.logger.warning(f"Expired token for {request.path}.")
return jsonify({ "error": "Token has expired" }), 401
        except jwt.InvalidTokenError:
app.logger.warning(f"Invalid token for {request.path}.")
return jsonify({ "error": "Token is invalid" }), 401
        except Exception as e:
app.logger.error(f"Token validation error for {request.path}: {e}")
return jsonify({ "error": "Token validation failed" }), 401

return f(current_user_id, * args, ** kwargs)
return decorated_function


@app.route('/')
def home():
return "Tiny Tutor Backend is running!"

@app.route('/signup', methods = ['POST'])
@limiter.limit("5 per hour") 
def signup_user():
if not db: return jsonify({ "error": "Database not configured" }), 500
data = request.get_json()
if not data: return jsonify({ "error": "No input data provided" }), 400
username = data.get('username', '').strip()
email = data.get('email', '').strip().lower()
password = data.get('password', '')
if not username or not email or not password: return jsonify({ "error": "Username, email, and password are required" }), 400
try:
users_ref = db.collection('users')
existing_user_username = users_ref.where('username_lowercase', '==', username.lower()).limit(1).stream()
if len(list(existing_user_username)) > 0: return jsonify({ "error": "Username already exists" }), 409
existing_user_email = users_ref.where('email', '==', email).limit(1).stream()
if len(list(existing_user_email)) > 0: return jsonify({ "error": "Email already registered" }), 409
password_hash = generate_password_hash(password)
user_doc_ref = users_ref.document()
user_doc_ref.set({
  'username': username, 'username_lowercase': username.lower(), 'email': email,
  'password_hash': password_hash, 'tier': 'standard', 'created_at': firestore.SERVER_TIMESTAMP
})
return jsonify({ "message": "User created successfully. Please login." }), 201
    except Exception as e:
app.logger.error(f"Error during signup for {username}: {e}")
return jsonify({ "error": f"Signup failed: {e}"}), 500


@app.route('/login', methods = ['POST'])
@limiter.limit("10 per minute") 
def login_user():
if not db: return jsonify({ "error": "Database not configured" }), 500
data = request.get_json()
if not data: return jsonify({ "error": "No input data provided" }), 400
identifier = str(data.get('email_or_username', '')).strip()
password = str(data.get('password', ''))
if not identifier or not password: return jsonify({ "error": "Missing username/email or password" }), 400
try:
is_email = '@' in identifier
user_ref = db.collection('users')
query = user_ref.where('email' if is_email else 'username_lowercase', '==', identifier.lower()).limit(1)
docs = list(query.stream())
if not docs: return jsonify({ "error": "Invalid credentials" }), 401
user_doc = docs[0]
user_data = user_doc.to_dict()
if not user_data or not check_password_hash(user_data.get('password_hash', ''), password):
return jsonify({ "error": "Invalid credentials" }), 401
token_payload = {
  'user_id': user_doc.id, 'username': user_data.get('username'), 'email': user_data.get('email'),
  'tier': user_data.get('tier', 'standard'),
  'exp': datetime.now(timezone.utc) + app.config['JWT_ACCESS_TOKEN_EXPIRES']
}
access_token = jwt.encode(token_payload, app.config['JWT_SECRET_KEY'], algorithm = 'HS256')
return jsonify({
  "message": "Login successful", "access_token": access_token,
  "user": { "username": user_data.get('username'), "email": user_data.get('email'), "tier": user_data.get('tier') }
}), 200
    except Exception as e:
app.logger.error(f"Login error for '{identifier}': {e}", exc_info = True)
return jsonify({ "error": "Login failed." }), 500

@app.route('/generate_explanation', methods = ['POST', 'OPTIONS'])
@token_required
@limiter.limit("60/hour")
def generate_explanation_route(current_user_id):
if not db: return jsonify({ "error": "Database not configured" }), 500
if not gemini_api_key: return jsonify({ "error": "AI service not configured" }), 500
data = request.get_json()
if not data: return jsonify({ "error": "No input data provided" }), 400
word = data.get('word', '').strip()
mode = data.get('mode', 'explain').strip().lower()
force_refresh = data.get('refresh_cache', False)
if not word: return jsonify({ "error": "Word/concept is required" }), 400

sanitized_word_id = sanitize_word_for_id(word)
user_word_history_ref = db.collection('users').document(current_user_id).collection('word_history').document(sanitized_word_id)

try:
word_doc = user_word_history_ref.get()
cached_content = {}
is_favorite_status = False
quiz_progress_data = []
modes_already_generated = []

if word_doc.exists:
  word_data = word_doc.to_dict()
cached_content = word_data.get('generated_content_cache', {})
is_favorite_status = word_data.get('is_favorite', False)
quiz_progress_data = word_data.get('quiz_progress', []) # Load existing progress
modes_already_generated = word_data.get('modes_generated', [])
if mode in cached_content and not force_refresh:
user_word_history_ref.set({ 'last_explored_at': firestore.SERVER_TIMESTAMP, 'word': word }, merge = True)
return jsonify({
  "word": word, mode: cached_content[mode], "source": "cache", "is_favorite": is_favorite_status,
  "full_cache": cached_content, "quiz_progress": quiz_progress_data, "modes_generated": modes_already_generated
}), 200

app.logger.info(f"Generating '{mode}' for '{word}' for user '{current_user_id}' (Force refresh: {force_refresh})")

generated_text_content = None
prompt = ""
if mode == 'explain':
  prompt = f"Explain the concept of '{word}' in 2 simple sentences with words or sub-topics that could extend the learning. If relevant, identify up to 2 key words or sub-topics within your explanation that can progress the concept along the learning curve to deepen the understanding and wrap them in <click>tags</click> like this: <click>sub-topic</click>."
        elif mode == 'fact':
prompt = f"Tell me one very interesting and concise fun fact about '{word}'."
        elif mode == 'quiz':
            # -- - REFINED QUIZ PROMPT-- -
  prompt = (
    f"Generate a set of exactly 3 distinct multiple-choice quiz questions about '{word}'. "
"For each question, strictly follow this format:\n"
"**Question [Number]:** [Your Question Text Here]\n"
"A) [Option A Text]\n"
"B) [Option B Text]\n"
"C) [Option C Text]\n"
"D) [Option D Text]\n"
"Correct Answer: [Single Letter A, B, C, or D]\n"
"Ensure option keys are unique (A, B, C, D) for each question. "
"Do not include option markers like 'A)' or 'B)' within the text of the options themselves. "
"Separate each complete question block (question, options, answer) with '---QUIZ_SEPARATOR---'."
            )
        elif mode == 'image':
generated_text_content = f"Placeholder image description for {word}. Actual image generation to be implemented."
        elif mode == 'deep_dive':
generated_text_content = f"Placeholder for a deep dive into {word}. More detailed content to come."

if mode in ['explain', 'fact', 'quiz'] and prompt:
gemini_model = genai.GenerativeModel('gemini-1.5-flash-latest')
response = gemini_model.generate_content(prompt)
generated_text_content = response.text
if mode == 'quiz':
  quiz_questions_array = [q.strip() for q in generated_text_content.split('---QUIZ_SEPARATOR---') if q.strip()]
                # Basic validation: ensure we got roughly 3 questions if separator worked
if not(1 <= len(quiz_questions_array) <= 3) and '---QUIZ_SEPARATOR---' in generated_text_content :
app.logger.warning(f"Quiz separator found, but split resulted in {len(quiz_questions_array)} questions for '{word}'. Using raw output as single block if non-empty.")
quiz_questions_array = [generated_text_content.strip()] if generated_text_content.strip() else[]
                elif not quiz_questions_array and generated_text_content.strip(): # No separator, but content exists
quiz_questions_array = [generated_text_content.strip()]

cached_content[mode] = quiz_questions_array
                # When new quiz questions are generated, quiz_progress should be reset for this word.
                # The frontend will handle this by starting with an empty progress array.
                # We send back the current(potentially old) quiz_progress, but frontend will ignore it if quiz array changes.
                # Or, we can explicitly clear it here if `force_refresh` is true for quiz mode.
                if force_refresh: # If regenerating quiz, clear its progress on the backend too.
  quiz_progress_data = []
            else:
cached_content[mode] = generated_text_content
        elif mode in ['image', 'deep_dive'] and generated_text_content:
cached_content[mode] = generated_text_content


if mode not in modes_already_generated: modes_already_generated.append(mode)

payload = {
  'word': word, 'last_explored_at': firestore.SERVER_TIMESTAMP,
  'generated_content_cache': cached_content, 'is_favorite': is_favorite_status,
  'modes_generated': modes_already_generated
}
if not word_doc.exists:
payload.update({ 'first_explored_at': firestore.SERVER_TIMESTAMP, 'is_favorite': False, 'quiz_progress': [] })
        
        # If it's a quiz refresh, ensure the quiz_progress is reset in the payload to be saved
if mode == 'quiz' and force_refresh:
payload['quiz_progress'] = []

user_word_history_ref.set(payload, merge = True)

return jsonify({
  "word": word, mode: cached_content.get(mode), "source": "generated",
  "is_favorite": payload.get('is_favorite', False), "full_cache": cached_content,
  "quiz_progress": payload.get('quiz_progress', quiz_progress_data), # Return the latest progress
            "modes_generated": modes_already_generated
}), 200

    except Exception as e:
app.logger.error(f"Error in /generate_explanation for '{word}', user '{current_user_id}': {e}", exc_info = True)
return jsonify({ "error": f"Internal error: {e}"}), 500


@app.route('/profile', methods = ['GET', 'OPTIONS'])
@token_required
def get_user_profile(current_user_id):
if not db: return jsonify({ "error": "Database not configured" }), 500
try:
user_doc_ref = db.collection('users').document(current_user_id)
user_doc = user_doc_ref.get()
if not user_doc.exists: return jsonify({ "error": "User not found" }), 404
user_data = user_doc.to_dict()

word_history_list = []
favorite_words_list = []
word_history_query = user_doc_ref.collection('word_history').order_by('last_explored_at', direction = firestore.Query.DESCENDING).stream()
for doc in word_history_query:
  entry = doc.to_dict()
entry_data = {
  "id": doc.id,
  "word": entry.get("word"),
  "is_favorite": entry.get("is_favorite", False),
  "last_explored_at": entry.get("last_explored_at").isoformat() if entry.get("last_explored_at") else None,
  "modes_generated": entry.get("modes_generated", [])
}
word_history_list.append(entry_data)
if entry_data["is_favorite"]:
  favorite_words_list.append(entry_data)

streak_history_list = []
streak_history_query = user_doc_ref.collection('streaks').order_by('completed_at', direction = firestore.Query.DESCENDING).limit(50).stream()
for doc in streak_history_query:
  streak = doc.to_dict()
streak_history_list.append({
  "id": doc.id,
  "words": streak.get("words", []),
  "score": streak.get("score", 0),
  "completed_at": streak.get("completed_at").isoformat() if streak.get("completed_at") else None
})

return jsonify({
  "username": user_data.get("username"), "email": user_data.get("email"), "tier": user_data.get("tier"),
  "total_words_explored": len(word_history_list), "explored_words": word_history_list,
  "favorite_words": favorite_words_list, "streak_history": streak_history_list,
  "created_at": user_data.get("created_at").isoformat() if user_data.get("created_at") else None
}), 200
    except Exception as e:
app.logger.error(f"Error fetching profile for user '{current_user_id}': {e}", exc_info = True)
return jsonify({ "error": f"Failed to fetch profile: {e}"}), 500

@app.route('/toggle_favorite', methods = ['POST', 'OPTIONS'])
@token_required
def toggle_favorite_word(current_user_id):
if not db: return jsonify({ "error": "Database not configured" }), 500
data = request.get_json()
word_to_toggle = data.get('word', '').strip()
if not word_to_toggle: return jsonify({ "error": "Word is required" }), 400
sanitized_word_id = sanitize_word_for_id(word_to_toggle)
word_ref = db.collection('users').document(current_user_id).collection('word_history').document(sanitized_word_id)
try:
word_doc = word_ref.get()
if not word_doc.exists: 
            # If word doesn't exist in history, create it and mark as favorite
app.logger.info(f"Word '{word_to_toggle}' not in history for user '{current_user_id}'. Creating and favoriting.")
word_ref.set({
  'word': word_to_toggle,
  'first_explored_at': firestore.SERVER_TIMESTAMP,
  'last_explored_at': firestore.SERVER_TIMESTAMP,
  'is_favorite': True, # Set as favorite
                'generated_content_cache': {}, # Initialize cache
                'quiz_progress': [],
  'modes_generated': []
}, merge = True)
return jsonify({ "message": "Word added to history and favorited", "word": word_to_toggle, "is_favorite": True }), 200

current_is_favorite = word_doc.to_dict().get('is_favorite', False)
new_favorite_status = not current_is_favorite
word_ref.update({ 'is_favorite': new_favorite_status, 'last_explored_at': firestore.SERVER_TIMESTAMP })
return jsonify({ "message": "Favorite status updated", "word": word_to_toggle, "is_favorite": new_favorite_status }), 200
    except Exception as e:
app.logger.error(f"Error toggling favorite for '{word_to_toggle}': {e}", exc_info = True)
return jsonify({ "error": f"Failed to toggle favorite: {e}"}), 500


@app.route('/save_streak', methods = ['POST', 'OPTIONS'])
@token_required
def save_user_streak(current_user_id):
if not db: return jsonify({ "error": "Database not configured" }), 500
data = request.get_json()
streak_words = data.get('words')
streak_score = data.get('score')
if not isinstance(streak_words, list) or not streak_words or not isinstance(streak_score, int) or streak_score < 2:
return jsonify({ "error": "Invalid streak data" }), 400
try:
streaks_collection_ref = db.collection('users').document(current_user_id).collection('streaks')
streak_doc_ref = streaks_collection_ref.document()
streak_doc_ref.set({ 'words': streak_words, 'score': streak_score, 'completed_at': firestore.SERVER_TIMESTAMP })
return jsonify({ "message": "Streak saved", "streak_id": streak_doc_ref.id }), 201
    except Exception as e:
app.logger.error(f"Error saving streak for user '{current_user_id}': {e}", exc_info = True)
return jsonify({ "error": f"Failed to save streak: {e}"}), 500


@app.route('/save_quiz_attempt', methods = ['POST', 'OPTIONS'])
@token_required 
def save_quiz_attempt_route(current_user_id):
if not db: return jsonify({ "error": "Database not configured" }), 500
data = request.get_json()
if not data:
  return jsonify({ "error": "No data provided" }), 400

word = data.get('word', '').strip()
question_index = data.get('question_index')
selected_option_key = data.get('selected_option_key', '').strip()
is_correct = data.get('is_correct')

if not word or question_index is None or not selected_option_key or is_correct is None:
return jsonify({ "error": "Missing required fields" }), 400

sanitized_word_id = sanitize_word_for_id(word)
word_history_ref = db.collection('users').document(current_user_id).collection('word_history').document(sanitized_word_id)

try:
word_doc = word_history_ref.get()
quiz_progress = [] # Default to empty if no doc or no progress in doc
if word_doc.exists:
  quiz_progress = word_doc.to_dict().get('quiz_progress', [])
else:
app.logger.warning(f"Word history for '{sanitized_word_id}' not found for user '{current_user_id}' during quiz save. Creating it.")
word_history_ref.set({
  'word': word, 'first_explored_at': firestore.SERVER_TIMESTAMP,
  'last_explored_at': firestore.SERVER_TIMESTAMP, 'is_favorite': False,
  'quiz_progress': [], 'modes_generated': ['quiz'] # Assume quiz mode was just generated
})

new_attempt = {
  "question_index": question_index,
  "selected_option_key": selected_option_key,
  "is_correct": is_correct,
  "timestamp": datetime.now(timezone.utc).isoformat()
}

attempt_updated = False
for i, attempt in enumerate(quiz_progress):
  if attempt.get('question_index') == question_index:
    quiz_progress[i] = new_attempt
attempt_updated = True
break
if not attempt_updated:
  quiz_progress.append(new_attempt)

quiz_progress.sort(key = lambda x: x['question_index'])

word_history_ref.update({ "quiz_progress": quiz_progress, "last_explored_at": firestore.SERVER_TIMESTAMP })

app.logger.info(f"Quiz attempt saved for user '{current_user_id}', word '{word}', q_idx {question_index}. New progress length: {len(quiz_progress)}")
        # IMPORTANT: Return the quiz_progress as it is stored in the DB for this word.
        # The frontend will use this to determine the next question.
return jsonify({ "message": "Quiz attempt saved", "quiz_progress": quiz_progress }), 200

    except Exception as e:
app.logger.error(f"Error saving quiz attempt for user '{current_user_id}', word '{word}': {e}", exc_info = True)
return jsonify({ "error": f"Failed to save quiz attempt: {e}"}), 500


if __name__ == '__main__':
  port = int(os.environ.get('PORT', 5001))
app.run(host = '0.0.0.0', port = port, debug = os.environ.get('FLASK_DEBUG', 'False').lower() == 'true')


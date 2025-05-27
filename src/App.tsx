import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Heart, BookOpen, User, LogOut, LogIn, RefreshCw, CheckCircle, XCircle, HelpCircle, Loader2, MessageSquare, Image as ImageIcon, FileText, Brain, PlusCircle } from 'lucide-react';
import './App.css';

// --- Constants ---
const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';

// --- Types ---
interface UserProfile {
  username: string;
  email?: string;
  tier?: string;
  total_words_explored?: number;
  explored_words?: WordHistoryEntry[];
  favorite_words?: WordHistoryEntry[];
  streak_history?: StreakEntry[];
}

interface WordHistoryEntry {
  id: string;
  word: string;
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

const parseQuizString = (quizStr: string): ParsedQuizQuestion | null => {
  if (!quizStr || typeof quizStr !== 'string') {
    console.error("Invalid quiz string for parsing:", quizStr);
    return null;
  }
  let lines = quizStr.trim().split('\n').map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length > 0 && lines[0].match(/^(\*\*?)?Question\s*\d*:(\*\*?)?$/i)) {
    lines.shift();
    if (lines.length > 0 && lines[0].trim() === '') {
        lines.shift();
    }
  }
  lines = lines.filter(line => line.trim().length > 0);
  if (lines.length < 6) {
    console.warn("Quiz string has too few content lines after cleaning:", lines.length, "Original:", quizStr, "Cleaned:", lines);
    return null;
  }
  const questionText = lines[0].replace(/^Question:\s*/i, '').trim();
  const options: { key: string; text: string }[] = [];
  const optionRegex = /^\s*([A-D])\)\s*(.*)/i;
  let correctOptionKey = '';
  for (let i = 1; i <= 4; i++) {
    if (!lines[i]) {
        console.warn("Missing option line for quiz:", i, "Original:", quizStr, "Cleaned:", lines);
        return null;
    }
    const match = lines[i].match(optionRegex);
    if (match && match[1] && match[2] !== undefined) {
      options.push({ key: match[1].toUpperCase(), text: match[2].trim() });
    } else {
      const key = String.fromCharCode(64 + (i - 1) + 1);
      const textContent = lines[i].trim().startsWith(`${key})`) ? lines[i].trim().substring(3).trim() : lines[i].trim();
      options.push({ key, text: textContent });
      console.warn(`Option line ${i} did not match regex, fallback parsing:`, lines[i]);
    }
  }
  let correctAnswerLine = lines.find(line => line.toLowerCase().includes('correct answer:'));
  if (!correctAnswerLine && lines[5]) {
      correctAnswerLine = lines[5];
  }
  if (correctAnswerLine) {
    const correctMatch = correctAnswerLine.match(/(?:Correct Answer:\s*|^\s*)([A-D])(?:[.)]?\s*.*)?$/i);
    if (correctMatch && correctMatch[1]) {
      correctOptionKey = correctMatch[1].toUpperCase();
    } else {
        console.warn("Could not extract correct option key from line:", correctAnswerLine);
    }
  }
  if (options.length !== 4 || !correctOptionKey || !questionText) {
    console.warn("Could not parse quiz string fully after cleaning:", "Original:", quizStr, "Cleaned:", lines, { questionText, options, correctOptionKey });
    return null;
  }
  if (!options.find(opt => opt.key === correctOptionKey)) {
    const foundOptByText = options.find(opt => opt.text.toLowerCase() === correctOptionKey.toLowerCase());
    if (foundOptByText) {
        correctOptionKey = foundOptByText.key;
    } else {
        console.warn(`Correct option key "${correctOptionKey}" not found in options for: ${questionText}.`);
    }
  }
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

  const [currentQuizQuestionIndex, setCurrentQuizQuestionIndex] = useState<number>(0);
  const [selectedQuizOption, setSelectedQuizOption] = useState<string | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<{ message: string; isCorrect: boolean } | null>(null);
  const [isQuizAttempted, setIsQuizAttempted] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const getDisplayWord = useCallback(() => isReviewingStreakWord ? wordForReview : currentFocusWord, [isReviewingStreakWord, wordForReview, currentFocusWord]);
  const getDisplayWordSanitized = useCallback(() => sanitizeWordForId(getDisplayWord()), [getDisplayWord]);


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
    setLiveStreak(null);
    setError(null);
    setAuthError(null);
    setShowAuthModal(false);
    setShowProfileModal(false);
    setAuthInputUsername('');
    setAuthInputEmail('');
    setAuthInputPassword('');
    setIsReviewingStreakWord(false);
    setWordForReview('');
  };

  const endCurrentStreakIfNeeded = useCallback(async (forceEnd: boolean = false) => {
    if (liveStreak && liveStreak.score >= 2 && authToken) {
      console.log(`Attempting to save streak to: ${API_BASE_URL}/save_streak`);
      try {
        await fetch(`${API_BASE_URL}/save_streak`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${authToken}`,
          },
          body: JSON.stringify({ words: liveStreak.words, score: liveStreak.score }),
        });
      } catch (err) {
        console.error('Failed to save streak:', err);
      }
    }
    if (forceEnd || (liveStreak && liveStreak.score < 2)) {
      setLiveStreak(null);
    }
  }, [liveStreak, authToken]);

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

    setIsLoading(true);
    setError(null);
    setAuthError(null);

    if (targetMode === 'quiz' || (!isSubTopicClick && !isRefreshClick && !isProfileWordClick)) {
        setSelectedQuizOption(null);
        setQuizFeedback(null);
        setIsQuizAttempted(false);
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
      const contentToStore = data.full_cache || data;
      const sanitizedWordId = sanitizeWordForId(data.word);

      if (isNewPrimaryWordSearch || isProfileWordClick) {
        setCurrentFocusWord(data.word);
      }
      
      setGeneratedContent(prev => {
        const newWordContent = {
            ...(prev[sanitizedWordId] || {}), 
            ...contentToStore,
            is_favorite: data.is_favorite, 
        };
        if (targetMode === 'quiz' && contentToStore.quiz) {
            newWordContent.quiz_progress = [];
        }
        return {
            ...prev,
            [sanitizedWordId]: newWordContent,
        };
      });

      setActiveContentMode(targetMode);
      if (targetMode === 'quiz') {
          setCurrentQuizQuestionIndex(0);
      }

      if (!isSubTopicClick && !isProfileWordClick) {
        setInputValue('');
      }

      if (isSubTopicClick && liveStreak) {
        if (liveStreak.words[liveStreak.words.length - 1]?.toLowerCase() !== data.word.toLowerCase()) {
          setLiveStreak(prev => ({
            score: (prev?.score || 0) + 1,
            words: [...(prev?.words || []), data.word],
          }));
        }
      } else if (isNewPrimaryWordSearch || isProfileWordClick) {
        setLiveStreak({ score: 1, words: [data.word] });
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
        console.log(`Fetching new quiz set for "${wordForNewQuiz}"`);
        handleGenerateExplanation(wordForNewQuiz, false, true, false, 'quiz');
    } else if (!authToken) {
        setShowAuthModal(true);
        setAuthMode('login');
        setAuthError("Please log in to get more questions.");
    }
  };
  
  const handleModeChange = async (mode: ContentMode) => {
    setActiveContentMode(mode);
    if (mode !== 'quiz') {
        setSelectedQuizOption(null);
        setQuizFeedback(null);
        setIsQuizAttempted(false);
    }

    const wordInFocus = getDisplayWord(); // This variable is used below
    const sanitizedWordInFocus = getDisplayWordSanitized();

    if (!wordInFocus) { // Check if wordInFocus has a value
        if (!getDisplayWord()) { // Redundant check, but safe
            setError("Please search for a word first or select a word from your history/streak.");
        }
        return;
    }

    const currentWordDataForModeCheck = generatedContent[sanitizedWordInFocus];
    
    if (
        authToken &&
        sanitizedWordInFocus && // This implies wordInFocus is also valid
        (!currentWordDataForModeCheck ||
         !currentWordDataForModeCheck[mode] ||
         (mode === 'quiz' && (!currentWordDataForModeCheck.quiz || currentWordDataForModeCheck.quiz.length === 0))
        )
    ) {
        setIsLoading(true);
        setError(null);
        console.log(`Fetching content for mode "${mode}" for word "${wordInFocus}" from: ${API_BASE_URL}/generate_explanation`); // wordInFocus used here
        try {
            const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify({ word: wordInFocus.trim(), mode: mode }), // wordInFocus used here
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `Failed to fetch content for ${mode}` }));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const data: WordContent & { word: string; is_favorite: boolean; full_cache?: WordContent } = await response.json();
            const contentToStore = data.full_cache || data;

            setGeneratedContent(prev => {
                const existingWordContent = prev[sanitizedWordInFocus] || {};
                const updatedWordContent = {
                    ...existingWordContent,
                    ...contentToStore,
                    is_favorite: data.is_favorite !== undefined ? data.is_favorite : existingWordContent.is_favorite,
                };
                if (mode === 'quiz' && contentToStore.quiz) {
                    updatedWordContent.quiz_progress = [];
                }
                return {
                    ...prev,
                    [sanitizedWordInFocus]: updatedWordContent,
                };
            });

            if (mode === 'quiz' && contentToStore.quiz) {
                setCurrentQuizQuestionIndex(0);
                setSelectedQuizOption(null);
                setQuizFeedback(null);
                setIsQuizAttempted(false);
            }

        } catch (err) {
            console.error(`Error fetching ${mode} for ${wordInFocus}:`, err); // wordInFocus used here for logging
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    }
  };

  const handleToggleFavorite = async () => {
    const wordToFavorite = getDisplayWord();
    const sanitizedWordToFavorite = getDisplayWordSanitized();

    if (!authToken || !sanitizedWordToFavorite) return;

    const currentIsFavorite = generatedContent[sanitizedWordToFavorite]?.is_favorite || false;
    
    setGeneratedContent(prev => ({
      ...prev,
      [sanitizedWordToFavorite]: {
        ...(prev[sanitizedWordToFavorite] || { word: wordToFavorite }), 
        is_favorite: !currentIsFavorite,
      }
    }));

    console.log(`Toggling favorite for "${wordToFavorite}" to ${!currentIsFavorite} at: ${API_BASE_URL}/toggle_favorite`);
    try {
      await fetch(`${API_BASE_URL}/toggle_favorite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ word: wordToFavorite.trim() }),
      });
      if (showProfileModal && authToken) fetchUserProfile(authToken);
    } catch (err) {
      console.error("Error toggling favorite:", err);
      setGeneratedContent(prev => ({
        ...prev,
        [sanitizedWordToFavorite]: {
          ...(prev[sanitizedWordToFavorite] || { word: wordToFavorite }),
          is_favorite: currentIsFavorite,
        }
      }));
      setError("Failed to update favorite status.");
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
    // const wordInFocus = getDisplayWord(); // This line was causing the "declared but not read" error.
    const sanitizedWordInFocus = getDisplayWordSanitized(); // This is used.

    if (activeContentMode === 'quiz' && sanitizedWordInFocus && generatedContent[sanitizedWordInFocus]?.quiz) {
        const wordData = generatedContent[sanitizedWordInFocus];
        const quizQuestions = wordData.quiz!;
        const progress = wordData.quiz_progress || [];

        const newQuizQuestionIndex = progress.length >= quizQuestions.length ? quizQuestions.length : progress.length;
        setCurrentQuizQuestionIndex(newQuizQuestionIndex);
        
        setSelectedQuizOption(null);
        setQuizFeedback(null);
        setIsQuizAttempted(false);
        
        const attemptForCurrentQuestion = progress.find(p => p.question_index === newQuizQuestionIndex);
        if(attemptForCurrentQuestion && (newQuizQuestionIndex < quizQuestions.length)){
            setSelectedQuizOption(attemptForCurrentQuestion.selected_option_key);
            setQuizFeedback({ 
                message: attemptForCurrentQuestion.is_correct ? "Correct!" : "Incorrect.", 
                isCorrect: attemptForCurrentQuestion.is_correct 
            });
            setIsQuizAttempted(true);
        }
    }
  }, [
      activeContentMode,
      getDisplayWord, 
      getDisplayWordSanitized, 
      generatedContent,
  ]);

  const handleSaveQuizAttempt = async (questionIndex: number, optionKey: string, isCorrect: boolean) => {
    const wordBeingQuizzed = getDisplayWord();
    const sanitizedWordBeingQuizzed = getDisplayWordSanitized();

    if (!authToken || !sanitizedWordBeingQuizzed) return;

    const currentAttempts = generatedContent[sanitizedWordBeingQuizzed]?.quiz_progress || [];
    if (currentAttempts.find(att => att.question_index === questionIndex)) {
        console.warn("Attempt for this question already saved in frontend state.");
        return;
    }
    console.log(`Saving quiz attempt for "${wordBeingQuizzed}" to: ${API_BASE_URL}/save_quiz_attempt`);
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
        const errorData = await response.json().catch(() => ({ error: 'Failed to save quiz attempt' }));
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }
      const data: { message: string, quiz_progress: QuizAttempt[] } = await response.json();

      setGeneratedContent(prev => ({
        ...prev,
        [sanitizedWordBeingQuizzed]: {
          ...(prev[sanitizedWordBeingQuizzed] || {}),
          quiz_progress: data.quiz_progress,
        },
      }));
    } catch (err) {
      console.error("Error saving quiz attempt:", err);
      setError("Failed to save your answer. " + (err as Error).message);
    }
  };

  const handleQuizOptionSelect = (optionKey: string, correctKey: string, questionIdx: number) => {
    const wordBeingQuizzedSanitized = getDisplayWordSanitized();
    const progress = generatedContent[wordBeingQuizzedSanitized]?.quiz_progress || [];
    const existingAttempt = progress.find(p => p.question_index === questionIdx);

    if (existingAttempt) {
        console.warn("This question was already answered.");
        return;
    }
    if (isQuizAttempted) return;

    const isCorrect = optionKey === correctKey;
    setSelectedQuizOption(optionKey);
    setQuizFeedback({ message: isCorrect ? "Correct!" : "Incorrect.", isCorrect });
    setIsQuizAttempted(true);

    handleSaveQuizAttempt(questionIdx, optionKey, isCorrect);
  };

  const handleNextQuestion = () => {
    const wordBeingQuizzed = getDisplayWord();
    const sanitizedWordBeingQuizzed = sanitizeWordForId(wordBeingQuizzed);
    const currentWordData = generatedContent[sanitizedWordBeingQuizzed];

    if(currentWordData?.quiz) {
        const quizSet = currentWordData.quiz;
        const progressLength = currentWordData.quiz_progress?.length || 0;

        if (progressLength < quizSet.length) {
            setCurrentQuizQuestionIndex(progressLength);
        } else {
            setCurrentQuizQuestionIndex(quizSet.length);
        }
        setSelectedQuizOption(null);
        setQuizFeedback(null);
        setIsQuizAttempted(false);
    }
  };


  const currentDisplayWordData = generatedContent[getDisplayWordSanitized()];
  const explanationHTML = { __html: currentDisplayWordData?.explain?.replace(/<click>(.*?)<\/click>/g, '<strong class="text-blue-500 hover:text-blue-700 cursor-pointer underline">$1</strong>') || '' };

  const renderContent = () => {
    const displayWordStr = getDisplayWord();
    const generalErrorToDisplay = error && activeContentMode !== 'explain' && activeContentMode !== 'quiz';

    if (isLoading && !currentDisplayWordData?.[activeContentMode] && displayWordStr) return <div className="flex justify-center items-center h-32"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /> <span className="ml-2 text-gray-700">Loading {activeContentMode} for "{displayWordStr}"...</span></div>;
    if (generalErrorToDisplay && !currentDisplayWordData?.[activeContentMode]) {
        return <div className="text-red-500 p-4 bg-red-100 rounded-md">{error}</div>;
    }

    const displayData = currentDisplayWordData;
    if (!displayData && displayWordStr) return <div className="text-gray-500 p-4">Select a mode or generate content for "{displayWordStr}".</div>;
    if (!displayData && !displayWordStr) return <div className="text-gray-500 p-4">Enter a word and click "Generate Explanation".</div>;


    switch (activeContentMode) {
      case 'explain':
        if (isLoading && !displayData?.explain && displayWordStr) return <div className="flex justify-center items-center h-32"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /> <span className="ml-2 text-gray-700">Loading explanation...</span></div>;
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
        if (isLoading && !displayData?.fact && displayWordStr) return <div className="flex justify-center items-center h-32"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /> <span className="ml-2 text-gray-700">Loading fact...</span></div>;
        if (error && !displayData?.fact) return <div className="text-red-500 p-4 bg-red-100 rounded-md">{error}</div>;
        return <div className="prose max-w-none p-1 text-gray-800">{displayData?.fact || `No fact available yet for "${displayWordStr}". Try generating it.`}</div>;
      case 'image':
        if (isLoading && !displayData?.image && displayWordStr) return <div className="flex justify-center items-center h-32"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /> <span className="ml-2 text-gray-700">Loading image...</span></div>;
        if (error && !displayData?.image) return <div className="text-red-500 p-4 bg-red-100 rounded-md">{error}</div>;
        return <div className="prose max-w-none p-1 text-gray-800">{displayData?.image || "Image feature coming soon."}</div>;
      case 'deep_dive':
        if (isLoading && !displayData?.deep_dive && displayWordStr) return <div className="flex justify-center items-center h-32"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /> <span className="ml-2 text-gray-700">Loading deep dive...</span></div>;
        if (error && !displayData?.deep_dive) return <div className="text-red-500 p-4 bg-red-100 rounded-md">{error}</div>;
        return <div className="prose max-w-none p-1 text-gray-800">{displayData?.deep_dive || "Deep dive feature coming soon."}</div>;
      case 'quiz':
        if (isLoading && !displayData?.quiz && displayWordStr) return <div className="flex justify-center items-center h-32"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /> <span className="ml-2 text-gray-700">Loading quiz...</span></div>;
        const quizSpecificError = error && !displayData?.quiz;
        if (quizSpecificError) return <div className="text-red-500 p-4 bg-red-100 rounded-md">{error}</div>;

        const quizSet = displayData?.quiz;
        const quizProgress = displayData?.quiz_progress || [];

        if (!quizSet || quizSet.length === 0) {
          return <div className="p-4 text-gray-500">No quiz available for "{displayWordStr}" yet. Try generating it or refreshing.</div>;
        }

        if (currentQuizQuestionIndex >= quizSet.length) { 
            let correctCount = 0;
            quizProgress.forEach(attempt => {
                if (attempt.is_correct) correctCount++;
            });

            return (
                <div className="p-4 space-y-4 text-gray-800">
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">Quiz Summary for "{getDisplayWord()}"</h3>
                    <p className="text-lg font-medium mb-3">Your Score: {correctCount} / {quizSet.length}</p>
                    <div className="max-h-[50vh] overflow-y-auto space-y-3 pr-2">
                        {quizSet.map((quizString, index) => {
                            const parsedQuestion = parseQuizString(quizString);
                            if (!parsedQuestion) return <div key={index} className="text-red-500 text-sm p-2 bg-red-50 rounded">Error displaying question {index + 1}.</div>;

                            const attempt = quizProgress.find(p => p.question_index === index);
                            const selectedOptionInfo = attempt ? parsedQuestion.options.find(opt => opt.key === attempt.selected_option_key) : null;

                            return (
                                <div key={index} className="p-3 border rounded-lg shadow-sm bg-white">
                                    <p className="font-semibold text-gray-700 text-sm mb-1">Q{index + 1}: {parsedQuestion.questionText}</p>
                                    <ul className="space-y-1 text-xs">
                                        {parsedQuestion.options.map(opt => (
                                            <li key={opt.key} className={`p-1.5 rounded border
                                                ${opt.key === parsedQuestion.correctOptionKey ? 'bg-green-50 border-green-200 font-medium text-green-700' : 'text-gray-600'}
                                                ${attempt && opt.key === attempt.selected_option_key && opt.key !== parsedQuestion.correctOptionKey ? 'bg-red-50 border-red-200 text-red-700' : ''}
                                                ${attempt && opt.key === attempt.selected_option_key ? 'ring-1' : ''}
                                                ${opt.key === parsedQuestion.correctOptionKey ? 'ring-green-400' : (attempt && opt.key === attempt.selected_option_key ? 'ring-red-400' : 'ring-transparent')}
                                            `}>
                                                ({opt.key}) {opt.text}
                                                {opt.key === parsedQuestion.correctOptionKey && <CheckCircle size={12} className="inline ml-1 text-green-500" />}
                                                {attempt && opt.key === attempt.selected_option_key && opt.key !== parsedQuestion.correctOptionKey && <XCircle size={12} className="inline ml-1 text-red-500" />}
                                            </li>
                                        ))}
                                    </ul>
                                    {attempt && !attempt.is_correct && (
                                        <p className="mt-1 text-xs text-gray-500">Your answer: ({attempt.selected_option_key}) {selectedOptionInfo?.text || 'N/A'}. Correct: ({parsedQuestion.correctOptionKey})</p>
                                    )}
                                    {attempt && attempt.is_correct && (
                                        <p className="mt-1 text-xs text-green-600">You answered correctly: ({attempt.selected_option_key})</p>
                                    )}
                                    {!attempt && <p className="mt-1 text-xs text-orange-400">Not attempted.</p>}
                                </div>
                            );
                        })}
                    </div>
                     <button
                        onClick={handleFetchNewQuizSet}
                        disabled={isLoading}
                        className="w-full bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg transition duration-150 flex items-center justify-center disabled:opacity-60"
                    >
                       {isLoading ? <Loader2 className="animate-spin mr-2" size={18}/> : <PlusCircle size={18} className="mr-2" />}
                        More Questions for "{getDisplayWord()}"
                    </button>
                </div>
            );
        }

        const currentQuestionString = quizSet[currentQuizQuestionIndex];
        const parsedQuestion = parseQuizString(currentQuestionString);

        if (!parsedQuestion) {
          return <div className="text-red-500 p-4">Error loading question. Please try refreshing. Original string: <pre className="text-xs whitespace-pre-wrap">{currentQuestionString}</pre></div>;
        }

        const attemptForThisQuestion = quizProgress.find(p => p.question_index === currentQuizQuestionIndex);
        const hasThisQuestionBeenAnswered = !!attemptForThisQuestion;

        return (
          <div className="p-4 space-y-4 text-gray-800">
            <p className="font-semibold text-lg text-gray-700">Question {currentQuizQuestionIndex + 1} of {quizSet.length}:</p>
            <p className="text-gray-800">{parsedQuestion.questionText}</p>
            <div className="space-y-2">
              {parsedQuestion.options.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => handleQuizOptionSelect(opt.key, parsedQuestion.correctOptionKey, currentQuizQuestionIndex)}
                  disabled={hasThisQuestionBeenAnswered || isQuizAttempted}
                  className={`w-full text-left p-3 rounded-lg border transition-all duration-150 text-gray-700
                    ${(selectedQuizOption === opt.key && isQuizAttempted) ? 
                        (quizFeedback?.isCorrect ? 'bg-green-200 border-green-400 ring-2 ring-green-500' : 'bg-red-200 border-red-400 ring-2 ring-red-500')
                        : (hasThisQuestionBeenAnswered && attemptForThisQuestion!.selected_option_key === opt.key) ? 
                            (attemptForThisQuestion!.is_correct ? 'bg-green-200 border-green-400' : 'bg-red-200 border-red-400')
                            : 'bg-white hover:bg-gray-100 border-gray-300'
                    }
                    ${(hasThisQuestionBeenAnswered && opt.key === parsedQuestion.correctOptionKey && (!attemptForThisQuestion || attemptForThisQuestion.selected_option_key !== opt.key)) ? 'border-green-500 border-2' : ''}
                    disabled:opacity-70 disabled:cursor-not-allowed
                  `}
                >
                  ({opt.key}) {opt.text}
                </button>
              ))}
            </div>
            {(isQuizAttempted || hasThisQuestionBeenAnswered) && quizFeedback && ( 
              <div className={`p-2 rounded-md text-sm ${quizFeedback.isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {quizFeedback.message}
                {!quizFeedback.isCorrect && ` Correct answer was: ${parsedQuestion.correctOptionKey}`}
              </div>
            )}
            {(isQuizAttempted || hasThisQuestionBeenAnswered) && (
              <button
                onClick={handleNextQuestion}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition duration-150"
              >
                {currentQuizQuestionIndex < quizSet.length - 1 ? 'Next Question' : 'View Summary'}
              </button>
            )}
             <div className="text-xs text-gray-500 mt-2">
                Progress: {quizProgress.length} / {quizSet.length} answered. Score: {quizProgress.filter(p=>p.is_correct).length} correct.
            </div>
          </div>
        );
      default:
        return <div className="p-4 text-gray-500">Select a content mode.</div>;
    }
  };

  const renderProfileModal = () => {
    if (!showProfileModal || !currentUser) return null;

    const renderWordList = (title: string, words: WordHistoryEntry[] | undefined) => (
      <div className="mb-4">
        <h4 className="font-semibold text-gray-700 mb-1">{title} ({words?.length || 0})</h4>
        {words && words.length > 0 ? (
          <ul className="max-h-40 overflow-y-auto text-sm space-y-1">
            {words.map(wh => (
              <li key={wh.id}
                  onClick={() => handleWordSelectionFromProfile(wh.word)}
                  className="p-1.5 hover:bg-gray-200 rounded cursor-pointer flex justify-between items-center text-gray-800">
                <span>{wh.word} <span className="text-xs text-gray-500">({new Date(wh.last_explored_at).toLocaleDateString()})</span></span>
                {wh.is_favorite && <Heart size={14} className="text-red-500 fill-current" />}
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-gray-500">No words in this list yet.</p>}
      </div>
    );

    const renderStreakList = (streaks: StreakEntry[] | undefined) => (
      <div className="mb-4">
        <h4 className="font-semibold text-gray-700 mb-1">Streak History ({streaks?.length || 0})</h4>
        {streaks && streaks.length > 0 ? (
          <ul className="max-h-40 overflow-y-auto text-sm space-y-1">
            {streaks.map(streak => (
              <li key={streak.id} className="p-1.5 hover:bg-gray-200 rounded text-gray-800">
                <span className="font-medium">Score {streak.score}:</span> {streak.words.map((w, i) => (
                  <span key={i} onClick={() => handleWordSelectionFromProfile(w)} className="cursor-pointer hover:underline">{w}</span>
                )).reduce((prev, curr) => <>{prev} → {curr}</>)}
                <span className="text-xs text-gray-500 ml-2">({new Date(streak.completed_at).toLocaleDateString()})</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-gray-500">No past streaks recorded.</p>}
      </div>
    );

    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
        <div className="bg-white p-6 rounded-lg shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto text-gray-800">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-semibold">User Profile</h3>
            <button onClick={() => setShowProfileModal(false)} className="text-gray-500 hover:text-gray-700">&times;</button>
          </div>
          <p><strong>Username:</strong> {currentUser.username}</p>
          <p><strong>Email:</strong> {currentUser.email || 'N/A'}</p>
          <p><strong>Account Tier:</strong> {currentUser.tier || 'Standard'}</p>
          <p className="mb-4"><strong>Total Words Explored:</strong> {currentUser.total_words_explored || 0}</p>

          {renderWordList("All Explored Words", currentUser.explored_words?.sort((a,b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime()))}
          {renderWordList("Favorite Words", currentUser.favorite_words?.sort((a,b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime()))}
          {renderStreakList(currentUser.streak_history?.sort((a,b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()))}

          <button onClick={() => setShowProfileModal(false)} className="mt-4 w-full bg-blue-500 text-white py-2 px-4 rounded hover:bg-blue-600">Close</button>
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
      <div className="w-full max-w-2xl bg-white/10 backdrop-blur-md shadow-2xl rounded-xl p-6 md:p-8">
        <header className="flex flex-col sm:flex-row justify-between items-center mb-6 pb-4 border-b border-white/20">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 mb-2 sm:mb-0">
            Tiny Tutor AI
          </h1>
          <div className="flex items-center space-x-3">
            {currentUser && <span className="text-sm">Hi, {currentUser.username}!</span>}
            {authToken ? (
              <>
                <button onClick={() => { if(authToken) fetchUserProfile(authToken); setShowProfileModal(true);}} title="Profile" className="p-2 rounded-full hover:bg-white/20 transition-colors"><User size={20} /></button>
                <button onClick={handleLogout} title="Logout" className="p-2 rounded-full hover:bg-white/20 transition-colors"><LogOut size={20} /></button>
              </>
            ) : (
              <button onClick={() => {setShowAuthModal(true); setAuthMode('login'); setAuthError(null);}} title="Login" className="p-2 rounded-full hover:bg-white/20 transition-colors"><LogIn size={20} /></button>
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
              {isLoading && !currentDisplayWordData && inputValue.trim() ? <Loader2 className="animate-spin mr-2" size={20}/> : <BookOpen size={20} className="mr-2" />}
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

        { (displayWord || (error && activeContentMode !== 'explain' && activeContentMode !== 'quiz') || authError ) && (
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
                      onClick={handleToggleFavorite} 
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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Heart, BookOpen, User, LogOut, LogIn, RefreshCw, CheckCircle, XCircle, HelpCircle, Loader2, MessageSquare, Image as ImageIcon, FileText, Brain } from 'lucide-react';
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
  const lines = quizStr.trim().split('\n');
  if (lines.length < 6) { 
    console.warn("Quiz string has too few lines:", lines.length, quizStr);
    return null;
  }

  const questionText = lines[0].replace(/^Question:\s*/i, '').trim();
  const options: { key: string; text: string }[] = [];
  const optionRegex = /^\(([A-D])\)\s*(.*)/i;
  let correctOptionKey = '';

  for (let i = 1; i <= 4; i++) {
    if (!lines[i]) {
        console.warn("Missing option line for quiz:", i, quizStr);
        return null;
    }
    const match = lines[i].match(optionRegex);
    if (match) {
      options.push({ key: match[1].toUpperCase(), text: match[2].trim() });
    } else {
      const key = String.fromCharCode(64 + i); 
      const textContent = lines[i].trim().length > 3 ? lines[i].trim().substring(3).trim() : lines[i].trim();
      options.push({ key, text: textContent });
      console.warn(`Option line ${i} did not match regex, fallback parsing:`, lines[i]);
    }
  }

  const correctAnswerLine = lines.find(line => line.toLowerCase().startsWith('correct answer:'));
  if (correctAnswerLine) {
    correctOptionKey = correctAnswerLine.replace(/Correct Answer:\s*/i, '').trim().toUpperCase();
  } else if (lines[5]) { 
     correctOptionKey = lines[5].trim().toUpperCase();
     console.warn("Correct answer line prefix missing, fallback to line 5:", lines[5]);
  }

  if (options.length !== 4 || !correctOptionKey || !questionText) {
    console.warn("Could not parse quiz string fully:", quizStr, { questionText, options, correctOptionKey });
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
  // Main App State
  const [inputValue, setInputValue] = useState<string>('');
  const [currentFocusWord, setCurrentFocusWord] = useState<string>(''); 
  const [currentFocusWordSanitized, setCurrentFocusWordSanitized] = useState<string>('');
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent>({});
  const [activeContentMode, setActiveContentMode] = useState<ContentMode>('explain');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null); // General error for non-auth operations

  // Auth State
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem('authToken'));
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [showAuthModal, setShowAuthModal] = useState<boolean>(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authError, setAuthError] = useState<string | null>(null); // Specific error for auth operations
  
  // Auth Modal Input State (lifted from renderAuthModal)
  const [authInputUsername, setAuthInputUsername] = useState('');
  const [authInputEmail, setAuthInputEmail] = useState('');
  const [authInputPassword, setAuthInputPassword] = useState('');

  // Profile Modal State
  const [showProfileModal, setShowProfileModal] = useState<boolean>(false);
  // Note: Profile data fetching logic is within fetchUserProfile and handleOpenProfileModal

  // Streak State
  const [liveStreak, setLiveStreak] = useState<LiveStreak | null>(null);
  const [isReviewingStreakWord, setIsReviewingStreakWord] = useState<boolean>(false);
  const [wordForReview, setWordForReview] = useState<string>(''); 

  // Quiz State
  const [currentQuizQuestionIndex, setCurrentQuizQuestionIndex] = useState<number>(0);
  const [selectedQuizOption, setSelectedQuizOption] = useState<string | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<{ message: string; isCorrect: boolean } | null>(null);
  const [isQuizAttempted, setIsQuizAttempted] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement>(null);

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
      // setAuthError("Could not fetch profile. " + (err as Error).message); // Avoid setting general error for this
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
    // Clear auth modal inputs
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
    setCurrentFocusWordSanitized('');
    setGeneratedContent({});
    setLiveStreak(null);
    setError(null); 
    setAuthError(null);
    setShowAuthModal(false); 
    setShowProfileModal(false); 
    setAuthInputUsername(''); // Clear auth inputs on logout too
    setAuthInputEmail('');
    setAuthInputPassword('');
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
    isProfileWordClick: boolean = false 
  ) => {
    if (!wordToFetch.trim()) {
      setError("Please enter a word.");
      return;
    }
    if (!authToken) {
      setShowAuthModal(true);
      setAuthMode('login');
      setAuthError("Please log in to generate content."); // Use authError
      return;
    }

    setIsLoading(true);
    setError(null); // Clear general error
    setAuthError(null); // Clear auth error
    setSelectedQuizOption(null);
    setQuizFeedback(null);
    setIsQuizAttempted(false);

    const isNewPrimaryWordSearch = !isSubTopicClick && !isRefreshClick && !isProfileWordClick;

    if (isNewPrimaryWordSearch || isProfileWordClick) {
      await endCurrentStreakIfNeeded(true); 
    }
    
    console.log(`Generating explanation for "${wordToFetch}" from: ${API_BASE_URL}/generate_explanation`);
    try {
      const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          word: wordToFetch.trim(), 
          mode: 'explain', 
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

      setCurrentFocusWord(data.word); 
      setCurrentFocusWordSanitized(sanitizedWordId);
      setGeneratedContent(prev => ({
        ...prev,
        [sanitizedWordId]: {
          ...prev[sanitizedWordId], 
          ...contentToStore,
          is_favorite: data.is_favorite, 
        },
      }));
      setActiveContentMode('explain'); 
      setInputValue(''); 
      setIsReviewingStreakWord(false); 
      setWordForReview('');

      if (isSubTopicClick && liveStreak) {
        if (liveStreak.words[liveStreak.words.length - 1]?.toLowerCase() !== wordToFetch.toLowerCase()) {
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
  
  const handleModeChange = async (mode: ContentMode) => {
    setActiveContentMode(mode);
    setSelectedQuizOption(null);
    setQuizFeedback(null);
    setIsQuizAttempted(false);

    const currentWordData = generatedContent[currentFocusWordSanitized];
    if (
        currentFocusWordSanitized && 
        (!currentWordData || !currentWordData[mode] || (mode === 'quiz' && !currentWordData.quiz)) &&
        authToken
    ) {
        setIsLoading(true);
        setError(null);
        console.log(`Fetching content for mode "${mode}" for word "${currentFocusWord}" from: ${API_BASE_URL}/generate_explanation`);
        try {
            const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${authToken}`,
                },
                body: JSON.stringify({ word: currentFocusWord.trim(), mode: mode }), 
            });
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({ error: `Failed to fetch content for ${mode}` }));
                throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
            }
            const data: WordContent & { word: string; is_favorite: boolean; full_cache?: WordContent } = await response.json();
            const contentToStore = data.full_cache || data;

            setGeneratedContent(prev => ({
                ...prev,
                [currentFocusWordSanitized]: {
                    ...prev[currentFocusWordSanitized],
                    ...contentToStore,
                    is_favorite: data.is_favorite !== undefined ? data.is_favorite : prev[currentFocusWordSanitized]?.is_favorite,
                },
            }));
        } catch (err) {
            console.error(`Error fetching ${mode}:`, err);
            setError((err as Error).message);
        } finally {
            setIsLoading(false);
        }
    }
  };

  const handleToggleFavorite = async () => {
    if (!authToken || !currentFocusWordSanitized) return;
    const currentIsFavorite = generatedContent[currentFocusWordSanitized]?.is_favorite || false;
    setGeneratedContent(prev => ({
      ...prev,
      [currentFocusWordSanitized]: {
        ...prev[currentFocusWordSanitized],
        is_favorite: !currentIsFavorite,
      }
    }));
    console.log(`Toggling favorite for "${currentFocusWord}" to ${!currentIsFavorite} at: ${API_BASE_URL}/toggle_favorite`);
    try {
      await fetch(`${API_BASE_URL}/toggle_favorite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ word: currentFocusWord.trim() }), 
      });
      if (showProfileModal && authToken) fetchUserProfile(authToken);
    } catch (err) {
      console.error("Error toggling favorite:", err);
      setGeneratedContent(prev => ({
        ...prev,
        [currentFocusWordSanitized]: {
          ...prev[currentFocusWordSanitized],
          is_favorite: currentIsFavorite,
        }
      }));
      setError("Failed to update favorite status.");
    }
  };

  const handleSubTopicClick = (subTopic: string) => {
    setInputValue(subTopic); 
    handleGenerateExplanation(subTopic, true);
  };

  const handleRefreshContent = () => {
    if (currentFocusWord) {
      handleGenerateExplanation(currentFocusWord, false, true);
    }
  };
  
  const handleWordSelectionFromProfile = (word: string) => {
    setShowProfileModal(false); 
    setInputValue(word); 
    handleGenerateExplanation(word, false, false, true);
  };

  const handleStreakWordClick = (word: string) => {
    if (word.toLowerCase() === (isReviewingStreakWord ? wordForReview : currentFocusWord).toLowerCase()) return; 

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
    console.log(`Fetching content for review word "${wordToReview}" from: ${API_BASE_URL}/generate_explanation`);
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
        setGeneratedContent(prev => ({
            ...prev,
            [sanitizeWordForId(data.word)]: { ...prev[sanitizeWordForId(data.word)], ...contentToStore, is_favorite: data.is_favorite },
        }));
        setActiveContentMode('explain');
    } catch (err) {
        setError((err as Error).message);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    const wordInFocus = isReviewingStreakWord ? wordForReview : currentFocusWord;
    const sanitizedWordInFocus = sanitizeWordForId(wordInFocus);

    if (activeContentMode === 'quiz' && sanitizedWordInFocus && generatedContent[sanitizedWordInFocus]?.quiz) {
        const wordData = generatedContent[sanitizedWordInFocus];
        const quizQuestions = wordData.quiz!; 
        const progress = wordData.quiz_progress || [];

        if (quizQuestions.length > 0) {
            if (progress.length >= quizQuestions.length) {
                setCurrentQuizQuestionIndex(quizQuestions.length); 
            } else {
                setCurrentQuizQuestionIndex(progress.length); 
            }
        } else {
            setCurrentQuizQuestionIndex(0); 
        }
        setSelectedQuizOption(null);
        setQuizFeedback(null);
        setIsQuizAttempted(false);
    }
  }, [
      activeContentMode, 
      currentFocusWord, 
      wordForReview, 
      isReviewingStreakWord, 
      generatedContent, 
  ]);

  const handleSaveQuizAttempt = async (questionIndex: number, optionKey: string, isCorrect: boolean) => {
    const wordBeingQuizzed = isReviewingStreakWord ? wordForReview : currentFocusWord;
    const sanitizedWordBeingQuizzed = sanitizeWordForId(wordBeingQuizzed);

    if (!authToken || !sanitizedWordBeingQuizzed) return;

    const currentAttempts = generatedContent[sanitizedWordBeingQuizzed]?.quiz_progress || [];
    if (currentAttempts.find(att => att.question_index === questionIndex)) {
        console.warn("Attempt for this question already saved.");
        const quizQuestions = generatedContent[sanitizedWordBeingQuizzed]?.quiz;
        if (quizQuestions) {
             if (currentQuizQuestionIndex < quizQuestions.length -1 ) {
                setCurrentQuizQuestionIndex(prev => prev + 1);
             } else {
                setCurrentQuizQuestionIndex(quizQuestions.length); 
             }
        }
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
          ...prev[sanitizedWordBeingQuizzed],
          quiz_progress: data.quiz_progress,
        },
      }));
    } catch (err) {
      console.error("Error saving quiz attempt:", err);
      setError("Failed to save your answer. " + (err as Error).message); // Use general error
    }
  };

  const handleQuizOptionSelect = (optionKey: string, correctKey: string, questionIdx: number) => {
    if (isQuizAttempted) return; 

    const isCorrect = optionKey === correctKey;
    setSelectedQuizOption(optionKey);
    setQuizFeedback({ message: isCorrect ? "Correct!" : "Incorrect.", isCorrect });
    setIsQuizAttempted(true); 

    handleSaveQuizAttempt(questionIdx, optionKey, isCorrect);
  };

  const handleNextQuestion = () => {
    setSelectedQuizOption(null);
    setQuizFeedback(null);
    setIsQuizAttempted(false);
    const wordBeingQuizzed = isReviewingStreakWord ? wordForReview : currentFocusWord;
    const sanitizedWordBeingQuizzed = sanitizeWordForId(wordBeingQuizzed);
    const currentWordData = generatedContent[sanitizedWordBeingQuizzed];
    if(currentWordData?.quiz) {
        const progressLength = currentWordData.quiz_progress?.length || 0;
        if (progressLength < currentWordData.quiz.length) {
            setCurrentQuizQuestionIndex(progressLength);
        } else {
            setCurrentQuizQuestionIndex(currentWordData.quiz.length); 
        }
    }
  };

  const getDisplayWord = () => isReviewingStreakWord ? wordForReview : currentFocusWord;
  const getDisplayWordSanitized = () => sanitizeWordForId(getDisplayWord());

  const currentDisplayWordData = generatedContent[getDisplayWordSanitized()];
  const explanationHTML = { __html: currentDisplayWordData?.explain?.replace(/<click>(.*?)<\/click>/g, '<strong class="text-blue-500 hover:text-blue-700 cursor-pointer underline">$1</strong>') || '' };

  const renderContent = () => {
    const generalErrorToDisplay = error && activeContentMode !== 'explain' && activeContentMode !== 'quiz';

    if (isLoading && !currentDisplayWordData?.[activeContentMode]) return <div className="flex justify-center items-center h-32"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /> <span className="ml-2 text-gray-700">Loading content...</span></div>;
    if (generalErrorToDisplay && !currentDisplayWordData?.[activeContentMode]) { 
        return <div className="text-red-500 p-4 bg-red-100 rounded-md">{error}</div>;
    }

    const displayData = currentDisplayWordData;
    if (!displayData && getDisplayWord()) return <div className="text-gray-500 p-4">Select a mode or generate content for "{getDisplayWord()}".</div>;
    if (!displayData && !getDisplayWord()) return <div className="text-gray-500 p-4">Enter a word and click "Generate Explanation".</div>;

    switch (activeContentMode) {
      case 'explain':
        if (isLoading && !displayData?.explain) return <div className="flex justify-center items-center h-32"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /> <span className="ml-2 text-gray-700">Loading explanation...</span></div>;
        if (error && !displayData?.explain) return <div className="text-red-500 p-4 bg-red-100 rounded-md">{error}</div>; // Show error if specific to explain
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
        return <div className="prose max-w-none p-1 text-gray-800">{displayData?.fact || "No fact available yet."}</div>;
      case 'image':
        return <div className="prose max-w-none p-1 text-gray-800">{displayData?.image || "Image feature coming soon."}</div>;
      case 'deep_dive':
        return <div className="prose max-w-none p-1 text-gray-800">{displayData?.deep_dive || "Deep dive feature coming soon."}</div>;
      case 'quiz':
        if (isLoading && !displayData?.quiz) return <div className="flex justify-center items-center h-32"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /> <span className="ml-2 text-gray-700">Loading quiz...</span></div>;
        if (error && !displayData?.quiz) return <div className="text-red-500 p-4 bg-red-100 rounded-md">{error}</div>; // Show error if specific to quiz
        
        const quizSet = displayData?.quiz;
        const quizProgress = displayData?.quiz_progress || [];

        if (!quizSet || quizSet.length === 0) {
          return <div className="p-4 text-gray-500">No quiz available for this topic yet. Try generating content first.</div>;
        }
        
        if (currentQuizQuestionIndex >= quizSet.length) {
            let correctCount = 0;
            quizProgress.forEach(attempt => {
                if (attempt.is_correct) correctCount++;
            });

            return (
                <div className="p-4 space-y-6 text-gray-800"> 
                    <h3 className="text-xl font-semibold text-gray-700">Quiz Summary for "{getDisplayWord()}"</h3>
                    <p className="text-lg font-medium">Your Score: {correctCount} / {quizSet.length}</p>
                    {quizSet.map((quizString, index) => {
                        const parsedQuestion = parseQuizString(quizString);
                        if (!parsedQuestion) return <div key={index} className="text-red-500">Error displaying question {index + 1}.</div>;
                        
                        const attempt = quizProgress.find(p => p.question_index === index);
                        const selectedOptionInfo = attempt ? parsedQuestion.options.find(opt => opt.key === attempt.selected_option_key) : null;

                        return (
                            <div key={index} className="p-4 border rounded-lg shadow-sm bg-white"> 
                                <p className="font-semibold text-gray-800 mb-2">Q{index + 1}: {parsedQuestion.questionText}</p>
                                <ul className="space-y-1">
                                    {parsedQuestion.options.map(opt => (
                                        <li key={opt.key} className={`p-2 rounded-md border text-sm text-gray-700 
                                            ${opt.key === parsedQuestion.correctOptionKey ? 'bg-green-100 border-green-300 font-medium' : ''}
                                            ${attempt && opt.key === attempt.selected_option_key && opt.key !== parsedQuestion.correctOptionKey ? 'bg-red-100 border-red-300' : ''}
                                            ${attempt && opt.key === attempt.selected_option_key ? 'ring-2 ring-offset-1' : ''}
                                            ${opt.key === parsedQuestion.correctOptionKey ? 'ring-green-500' : (attempt && opt.key === attempt.selected_option_key ? 'ring-red-500' : 'ring-transparent')}
                                        `}>
                                            ({opt.key}) {opt.text}
                                            {opt.key === parsedQuestion.correctOptionKey && <CheckCircle size={16} className="inline ml-2 text-green-600" />}
                                            {attempt && opt.key === attempt.selected_option_key && opt.key !== parsedQuestion.correctOptionKey && <XCircle size={16} className="inline ml-2 text-red-600" />}
                                        </li>
                                    ))}
                                </ul>
                                {attempt && !attempt.is_correct && (
                                    <p className="mt-2 text-xs text-gray-600">Your answer: ({attempt.selected_option_key}) {selectedOptionInfo?.text}. Correct: ({parsedQuestion.correctOptionKey})</p>
                                )}
                                 {attempt && attempt.is_correct && (
                                    <p className="mt-2 text-xs text-green-700">You answered correctly: ({attempt.selected_option_key})</p>
                                )}
                                {!attempt && <p className="mt-2 text-xs text-orange-500">Not attempted in this session.</p>}
                            </div>
                        );
                    })}
                     <button 
                        onClick={() => {
                            const sanitizedWordToReset = getDisplayWordSanitized();
                            setGeneratedContent(prev => ({
                                ...prev,
                                [sanitizedWordToReset]: {
                                    ...prev[sanitizedWordToReset],
                                    quiz_progress: [], 
                                }
                            }));
                            setCurrentQuizQuestionIndex(0); 
                            alert("Quiz progress reset locally. You can retake the quiz now. For permanent reset, backend changes would be needed.");
                        }}
                        className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg transition duration-150"
                    >
                        Retake Quiz for "{getDisplayWord()}"
                    </button>
                </div>
            );
        }
        
        const currentQuestionString = quizSet[currentQuizQuestionIndex];
        const parsedQuestion = parseQuizString(currentQuestionString);

        if (!parsedQuestion) {
          return <div className="text-red-500 p-4">Error loading question. Please try refreshing.</div>;
        }
        
        const attemptForThisQuestion = quizProgress.find(p => p.question_index === currentQuizQuestionIndex);
        const alreadyAnsweredThisQuestion = !!attemptForThisQuestion;

        return (
          <div className="p-4 space-y-4 text-gray-800"> 
            <p className="font-semibold text-lg text-gray-700">Question {currentQuizQuestionIndex + 1} of {quizSet.length}:</p>
            <p className="text-gray-800">{parsedQuestion.questionText}</p>
            <div className="space-y-2">
              {parsedQuestion.options.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => !alreadyAnsweredThisQuestion && handleQuizOptionSelect(opt.key, parsedQuestion.correctOptionKey, currentQuizQuestionIndex)}
                  disabled={alreadyAnsweredThisQuestion || isQuizAttempted}
                  className={`w-full text-left p-3 rounded-lg border transition-all duration-150 text-gray-700 
                    ${selectedQuizOption === opt.key ? (quizFeedback?.isCorrect ? 'bg-green-200 border-green-400 ring-2 ring-green-500' : 'bg-red-200 border-red-400 ring-2 ring-red-500') : 'bg-white hover:bg-gray-100 border-gray-300'}
                    ${alreadyAnsweredThisQuestion && opt.key === attemptForThisQuestion!.selected_option_key ? (attemptForThisQuestion!.is_correct ? 'bg-green-200 border-green-400' : 'bg-red-200 border-red-400') : ''}
                    ${alreadyAnsweredThisQuestion && opt.key === parsedQuestion.correctOptionKey && opt.key !== attemptForThisQuestion!.selected_option_key ? 'border-green-500 border-2' : ''}
                    disabled:opacity-70 disabled:cursor-not-allowed
                  `}
                >
                  ({opt.key}) {opt.text}
                </button>
              ))}
            </div>
            {(isQuizAttempted || alreadyAnsweredThisQuestion) && quizFeedback && (
              <div className={`p-2 rounded-md text-sm ${quizFeedback.isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                {quizFeedback.message}
                {!quizFeedback.isCorrect && ` Correct answer was: ${parsedQuestion.correctOptionKey}`}
              </div>
            )}
            {(isQuizAttempted || alreadyAnsweredThisQuestion) && (
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
    // This function now uses authInputUsername, setAuthInputUsername, etc. from App's scope
    if (!showAuthModal) return null;
  
    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      setAuthError(null); // Clear previous auth errors
  
      const trimmedPassword = authInputPassword.trim();
      let endpoint = '';
      let payload = {};
  
      if (authMode === 'login') {
        const trimmedUsernameOrEmail = authInputUsername.trim(); 
        if (!trimmedUsernameOrEmail || !trimmedPassword) {
          setAuthError("Username/Email and Password are required for login.");
          return;
        }
        endpoint = '/login';
        payload = { email_or_username: trimmedUsernameOrEmail, password: trimmedPassword };
      } else { // signup
        const trimmedUsername = authInputUsername.trim(); 
        const trimmedEmail = authInputEmail.trim();
        if (!trimmedUsername || !trimmedEmail || !trimmedPassword) {
          setAuthError("Username, Email, and Password are required for signup.");
          return;
        }
        endpoint = '/signup';
        payload = { email: trimmedEmail, username: trimmedUsername, password: trimmedPassword };
      }
  
      setIsLoading(true); 
      console.log(`Attempting ${authMode} to: ${API_BASE_URL}${endpoint} with payload:`, payload);
      try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        const data = await response.json(); // Attempt to parse JSON regardless of status
        if (!response.ok) {
          throw new Error(data.error || `${authMode.charAt(0).toUpperCase() + authMode.slice(1)} failed. Status: ${response.status}`);
        }
        if (authMode === 'signup') {
            alert("Signup successful! Please login.");
            setAuthMode('login'); 
            setAuthInputUsername(''); 
            setAuthInputEmail('');
            setAuthInputPassword('');
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
                  placeholder="Username" 
                  value={authInputUsername} // Use state from App component
                  onChange={(e) => setAuthInputUsername(e.target.value)}
                  required 
                  className="w-full p-2 border border-gray-300 rounded text-gray-900 placeholder-gray-500 focus:ring-purple-500 focus:border-purple-500" 
                />
                <input 
                  type="email" 
                  name="email_signup" 
                  placeholder="Email" 
                  value={authInputEmail} // Use state from App component
                  onChange={(e) => setAuthInputEmail(e.target.value)}
                  required 
                  className="w-full p-2 border border-gray-300 rounded text-gray-900 placeholder-gray-500 focus:ring-purple-500 focus:border-purple-500" 
                />
              </>
            )}
            {authMode === 'login' && (
                 <input 
                    type="text" 
                    name="email_login" 
                    placeholder="Username or Email" 
                    value={authInputUsername} // Use state from App component (serves as username/email for login)
                    onChange={(e) => setAuthInputUsername(e.target.value)}
                    required 
                    className="w-full p-2 border border-gray-300 rounded text-gray-900 placeholder-gray-500 focus:ring-purple-500 focus:border-purple-500" 
                />
            )}
            <input 
              type="password" 
              name="password" 
              placeholder="Password" 
              value={authInputPassword} // Use state from App component
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
              onKeyPress={(e) => e.key === 'Enter' && handleGenerateExplanation(inputValue)}
              placeholder="Enter a word or concept..."
              className="flex-grow p-3 rounded-lg bg-white/20 border border-white/30 focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none placeholder-gray-300 text-white"
            />
            <button
              onClick={() => handleGenerateExplanation(inputValue)}
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
                        disabled={!displayWord && !error && !authError} 
                        className={`px-3 py-1.5 text-xs sm:text-sm rounded-md transition-colors flex items-center
                            ${activeContentMode === modeInfo.id ? 'bg-purple-500 text-white shadow-md' : 'bg-white/10 hover:bg-white/20 text-gray-200'}
                            ${(!displayWord && !error && !authError) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                        <modeInfo.icon size={14} className="mr-1.5" /> {modeInfo.label}
                        </button>
                    ))}
                </div>
                {displayWord && (
                    <button onClick={handleToggleFavorite} title={isFavoriteCurrent ? "Remove from favorites" : "Add to favorites"} className="p-2 rounded-full hover:bg-white/20 transition-colors">
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

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Heart, BookOpen, User, LogOut, LogIn, RefreshCw, CheckCircle, XCircle, HelpCircle, Loader2, MessageSquare, Image as ImageIcon, FileText, Brain, PlusCircle } from 'lucide-react';
import './App.css';

// --- Constants ---
const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';

// --- Types ---
interface UserProfile {
  username: string;
  userId?: string; 
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

type BackendRawModeContent = string;

interface BackendGeneratedContentCache {
  explain?: BackendRawModeContent;
  image?: BackendRawModeContent;
  fact?: BackendRawModeContent;
  quiz?: BackendRawModeContent; 
  deep_dive?: BackendRawModeContent;
}

interface WordDataInState {
  explain?: string;
  image?: string;
  fact?: string;
  quiz?: string[]; 
  deep_dive?: string;
  is_favorite?: boolean;
  quiz_progress?: QuizAttempt[];
  modes_generated?: string[];
}

interface GeneratedContent {
  [key: string]: WordDataInState; 
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

interface BackendExplanationResponse {
  word: string; 
  mode: ContentMode; 
  content: BackendRawModeContent; 
  generated_content_cache: BackendGeneratedContentCache; 
  modes_generated: string[];
  is_favorite: boolean;
  quiz_progress: QuizAttempt[];
}

// --- Helper Functions ---
const sanitizeWordForId = (word: string): string => { /* ... (Your existing function) ... */ 
  return word.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
};
const parseQuizString = (quizStr: string): ParsedQuizQuestion | null => { /* ... (Your existing function) ... */ 
  if (!quizStr || typeof quizStr !== 'string') { console.error("Invalid quiz string for parsing:", quizStr); return null; }
  let lines = quizStr.trim().split('\n').map(line => line.trim()).filter(line => line.length > 0);
  if (lines.length > 0 && lines[0].match(/^(\*\*?)?Question\s*\d*:(\*\*?)?$/i)) { lines.shift(); if (lines.length > 0 && lines[0].trim() === '') { lines.shift(); } }
  lines = lines.filter(line => line.trim().length > 0);
  if (lines.length < 6) { console.warn("Quiz string has too few content lines after cleaning:", lines.length, "Original:", quizStr, "Cleaned:", lines); return null; }
  const questionText = lines[0].replace(/^Question:\s*/i, '').trim();
  const options: { key: string; text: string }[] = [];
  const optionRegex = /^\s*([A-D])\)\s*(.*)/i; let correctOptionKey = '';
  for (let i = 1; i <= 4; i++) {
    if (!lines[i]) { console.warn("Missing option line for quiz:", i, "Original:", quizStr, "Cleaned:", lines); return null; }
    const match = lines[i].match(optionRegex);
    if (match && match[1] && match[2] !== undefined) { options.push({ key: match[1].toUpperCase(), text: match[2].trim() });
    } else { const key = String.fromCharCode(64 + (i - 1) + 1); const textContent = lines[i].trim().startsWith(`${key})`) ? lines[i].trim().substring(3).trim() : lines[i].trim(); options.push({ key, text: textContent }); console.warn(`Option line ${i} did not match regex, fallback parsing:`, lines[i]); }
  }
  let correctAnswerLine = lines.find(line => line.toLowerCase().includes('correct answer:'));
  if (!correctAnswerLine && lines[5]) { correctAnswerLine = lines[5]; }
  if (correctAnswerLine) { const correctMatch = correctAnswerLine.match(/(?:Correct Answer:\s*|^\s*)([A-D])(?:[.)]?\s*.*)?$/i); if (correctMatch && correctMatch[1]) { correctOptionKey = correctMatch[1].toUpperCase(); } else { console.warn("Could not extract correct option key from line:", correctAnswerLine); } }
  if (options.length !== 4 || !correctOptionKey || !questionText) { console.warn("Could not parse quiz string fully after cleaning:", "Original:", quizStr, "Cleaned:", lines, { questionText, options, correctOptionKey }); return null;  }
  if (!options.find(opt => opt.key === correctOptionKey)) { const foundOptByText = options.find(opt => opt.text.toLowerCase() === correctOptionKey.toLowerCase()); if (foundOptByText) { correctOptionKey = foundOptByText.key; } else { console.warn(`Correct option key "${correctOptionKey}" not found in options for: ${questionText}.`); } }
  return { questionText, options, correctOptionKey, originalString: quizStr };
};

function App() {
  const [inputValue, setInputValue] = useState<string>('');
  const [currentFocusWord, setCurrentFocusWord] = useState<string>(''); 
  const [currentFocusWordSanitized, setCurrentFocusWordSanitized] = useState<string>('');
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

  const [liveStreak, setLiveStreak] = useState<LiveStreak>({ score: 0, words: [] });
  const [isReviewingStreakWord, setIsReviewingStreakWord] = useState<boolean>(false);
  const [wordForReview, setWordForReview] = useState<string>(''); 

  const [currentQuizQuestionIndex, setCurrentQuizQuestionIndex] = useState<number>(0);
  const [selectedQuizOption, setSelectedQuizOption] = useState<string | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<{ message: string; isCorrect: boolean } | null>(null);
  const [isQuizAttempted, setIsQuizAttempted] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const token = localStorage.getItem('authToken');
    if (token) { setAuthToken(token); fetchUserProfile(token); }
  }, []);

  const fetchUserProfile = async (token: string) => { /* ... (Your existing logic) ... */ 
    if (!token) return;
    try { const response = await fetch(`${API_BASE_URL}/profile`, { headers: { 'Authorization': `Bearer ${token}` } });
      if (!response.ok) { if (response.status === 401 || response.status === 422) { handleLogout(); return; } const errorData = await response.json().catch(() => ({ error: 'Failed to fetch profile' })); throw new Error(errorData.error || `HTTP error! status: ${response.status}`); }
      const data: UserProfile = await response.json(); setCurrentUser(data);
    } catch (err) { console.error("Error fetching profile:", err); }
  };
  
  const handleAuthSuccess = (token: string, userDetails?: {username: string, userId: string, email?:string} ) => { /* ... (Your existing logic) ... */ 
    localStorage.setItem('authToken', token); setAuthToken(token);
    if (userDetails) { const profile: UserProfile = { username: userDetails.username, userId: userDetails.userId, email: userDetails.email }; setCurrentUser(profile); } 
    else { fetchUserProfile(token);  }
    setShowAuthModal(false); setAuthError(null); setAuthInputUsername(''); setAuthInputEmail(''); setAuthInputPassword('');
    if (inputValue.trim() && !currentFocusWord) { handleGenerateExplanation(inputValue, false, false, false, false, 'explain'); } // Added isModeChangeFetch = false
  };

  const endCurrentStreakIfNeeded = useCallback(async (isLogoutAction: boolean = false) => { /* ... (Your existing logic) ... */ 
    if (liveStreak.score >= 2 && authToken) {
      try { await fetch(`${API_BASE_URL}/save_streak`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ words: liveStreak.words, score: liveStreak.score }), }); } 
      catch (err) { console.error('Failed to save streak:', err); }
    } if (!isLogoutAction) { setLiveStreak({ score: 0, words: [] }); }
  }, [liveStreak, authToken]);

  const handleLogout = () => { /* ... (Your existing logic) ... */ 
    endCurrentStreakIfNeeded(true); localStorage.removeItem('authToken'); setAuthToken(null); setCurrentUser(null);
    setCurrentFocusWord(''); setCurrentFocusWordSanitized(''); setGeneratedContent({});
    setLiveStreak({ score: 0, words: [] }); setError(null); setAuthError(null);
    setShowAuthModal(false); setShowProfileModal(false); setAuthInputUsername(''); setAuthInputEmail(''); setAuthInputPassword('');
  };
  
  const handleGenerateExplanation = async (
    wordToFetch: string,
    isSubTopicClick: boolean = false,
    isRefreshClick: boolean = false,
    isProfileWordClick: boolean = false,
    isModeChangeFetch: boolean = false, // FIX 1: New flag
    targetMode: ContentMode = 'explain'
  ) => {
    if (!wordToFetch.trim()) { setError("Please enter a word."); return; }
    if (!authToken) { setShowAuthModal(true); setAuthMode('login'); setAuthError("Please log in."); return; }

    setIsLoading(true); setError(null); setAuthError(null); 
    if (targetMode === 'quiz' && !isModeChangeFetch) { // Only reset quiz UI if it's not just a mode change fetching existing data
        setSelectedQuizOption(null); setQuizFeedback(null); setIsQuizAttempted(false);
    }
    
    // Streak logic should only be affected by NEW primary searches, profile clicks, or sub-topic clicks
    // NOT by mode changes or refreshes for the current word.
    const isNewPrimaryWordSearch = !isSubTopicClick && !isRefreshClick && !isProfileWordClick && !isModeChangeFetch;

    if (isNewPrimaryWordSearch || isProfileWordClick) { 
      await endCurrentStreakIfNeeded(false); 
    }
    
    try {
      const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify({ word: wordToFetch.trim(), mode: targetMode, refresh_cache: isRefreshClick }),
      });
      if (!response.ok) { const errorData = await response.json().catch(() => ({ error: "Unknown error." })); throw new Error(errorData.error || `HTTP error! status: ${response.status}`); }

      const data: BackendExplanationResponse = await response.json();
      const wordFromResponse = data.word; const sanitizedWordId = sanitizeWordForId(wordFromResponse);

      setCurrentFocusWord(wordFromResponse); setCurrentFocusWordSanitized(sanitizedWordId);
      
      setGeneratedContent(prev => {
        const existingWordData = prev[sanitizedWordId] || {};
        const newWordStateData: WordDataInState = {
            explain: data.generated_content_cache.explain ?? existingWordData.explain,
            fact: data.generated_content_cache.fact ?? existingWordData.fact,
            image: data.generated_content_cache.image ?? existingWordData.image,
            deep_dive: data.generated_content_cache.deep_dive ?? existingWordData.deep_dive,
            quiz: data.generated_content_cache.quiz ? data.generated_content_cache.quiz.split("---QUIZ_SEPARATOR---").map(b => b.trim()).filter(b => b) : existingWordData.quiz,
            is_favorite: data.is_favorite, modes_generated: data.modes_generated, quiz_progress: data.quiz_progress,
        };
        if (data.mode === 'quiz') { newWordStateData.quiz = data.content.split("---QUIZ_SEPARATOR---").map(b => b.trim()).filter(b => b); } 
        else { newWordStateData[data.mode] = data.content; }
        return { ...prev, [sanitizedWordId]: newWordStateData };
      });

      setActiveContentMode(data.mode); 
      if (data.mode === 'quiz') { setCurrentQuizQuestionIndex(0); }

      // FIX 1: Streak logic adjustment
      if (isNewPrimaryWordSearch) { setLiveStreak({ score: 1, words: [wordFromResponse] }); setInputValue('');  } 
      else if (isProfileWordClick) { setLiveStreak({ score: 1, words: [wordFromResponse] }); } 
      else if (isSubTopicClick) {
        setLiveStreak(prev => {
            if (prev.words.length > 0 && prev.words[prev.words.length - 1].toLowerCase() === wordFromResponse.toLowerCase()) return prev;
            return { score: prev.score + 1, words: [...prev.words, wordFromResponse] };
        });
      }
      // isRefreshClick and isModeChangeFetch do NOT alter streak.

      if (!isModeChangeFetch) { // Only reset review state if not a silent mode change fetch
        setIsReviewingStreakWord(false); setWordForReview('');
      }

    } catch (err) { console.error("Error generating content:", err); setError((err as Error).message);
    } finally { setIsLoading(false); }
  };
  
  const handleFetchNewQuizSet = () => { /* ... (Calls HGE with isRefreshClick=true) ... */ 
    const wordForNewQuiz = getDisplayWord();
    if (wordForNewQuiz && authToken) { handleGenerateExplanation(wordForNewQuiz, false, true, false, false, 'quiz'); } 
    else if (!authToken) { setShowAuthModal(true); setAuthMode('login'); setAuthError("Please log in."); }
  };
  
  const handleModeChange = async (mode: ContentMode) => {
    setActiveContentMode(mode);
    if (mode !== 'quiz') { setSelectedQuizOption(null); setQuizFeedback(null); setIsQuizAttempted(false); }

    const currentWordData = generatedContent[currentFocusWordSanitized];
    // FIX 1: Pass isModeChangeFetch = true if fetching for mode change
    if ( currentFocusWordSanitized && authToken && (!currentWordData || !currentWordData[mode] || (mode === 'quiz' && (!currentWordData.quiz || currentWordData.quiz.length === 0))) ) {
        await handleGenerateExplanation(currentFocusWord, false, false, false, true, mode); // true for isModeChangeFetch
    } else if (mode === 'quiz' && currentWordData?.quiz && currentWordData.quiz.length > 0) {
        setCurrentQuizQuestionIndex(0); setSelectedQuizOption(null); setQuizFeedback(null); setIsQuizAttempted(false);
    }
  };

  const handleToggleFavorite = async () => { /* ... (Your existing logic) ... */ };
  const handleSubTopicClickInternal = (subTopic: string) => { /* ... (Calls HGE with isSubTopicClick=true) ... */ 
    setInputValue(subTopic); handleGenerateExplanation(subTopic, true, false, false, false, 'explain');
  };
  const handleRefreshContent = () => { /* ... (Calls HGE with isRefreshClick=true) ... */ 
    if (currentFocusWord) { handleGenerateExplanation(currentFocusWord, false, true, false, false, activeContentMode); }
  };
  const handleWordSelectionFromProfile = (word: string) => { /* ... (Calls HGE with isProfileWordClick=true) ... */ 
    setShowProfileModal(false); setInputValue(word); handleGenerateExplanation(word, false, false, true, false, 'explain');
  };
  const handleStreakWordClick = (word: string) => { /* ... (Your existing logic, calls handleFetchContentForReview) ... */ 
    if (word.toLowerCase() === getDisplayWord().toLowerCase() && !isReviewingStreakWord) return; 
    setIsReviewingStreakWord(true); setWordForReview(word); 
    const sanitizedReviewWord = sanitizeWordForId(word);
    if (generatedContent[sanitizedReviewWord]?.explain) { setCurrentFocusWord(word); setCurrentFocusWordSanitized(sanitizedReviewWord); setActiveContentMode('explain'); } 
    else { handleFetchContentForReview(word); }
  };
  const handleFetchContentForReview = async (wordToReview: string) => { /* ... (Your existing logic) ... */ };
  useEffect(() => { /* ... (Your existing quiz useEffect logic) ... */ }, [activeContentMode, currentFocusWord, wordForReview, isReviewingStreakWord, generatedContent]);
  const handleSaveQuizAttempt = async (questionIndex: number, optionKey: string, isCorrect: boolean) => { /* ... (Your existing logic) ... */ };
  const handleQuizOptionSelect = (optionKey: string, correctKey: string, questionIdx: number) => { /* ... (Your existing logic) ... */ };
  const handleNextQuestion = () => { /* ... (Your existing logic) ... */ };
  const getDisplayWord = () => isReviewingStreakWord ? wordForReview : currentFocusWord;
  const getDisplayWordSanitized = () => sanitizeWordForId(getDisplayWord());
  const currentDisplayWordData = generatedContent[getDisplayWordSanitized()];
  const explanationHTML = { __html: currentDisplayWordData?.explain?.replace(/<click>(.*?)<\/click>/g, (_match, p1) => `<button class="text-purple-600 hover:text-purple-800 font-semibold underline decoration-dotted hover:decoration-solid" data-subtopic="${p1}">${p1}</button>`) || '' };
  
  const renderContent = () => {
    const wordToDisplay = getDisplayWord(); 
    const displayData = generatedContent[sanitizeWordForId(wordToDisplay)];
    const generalErrorToDisplay = error && activeContentMode !== 'explain' && activeContentMode !== 'quiz';

    if (isLoading && !displayData?.[activeContentMode]) return <div className="flex JCC AIC h-32"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /> <span className="ml-2 text-gray-700">Loading...</span></div>;
    if (generalErrorToDisplay && !displayData?.[activeContentMode]) return <div className="text-red-500 p-4 bg-red-100 RNDMD">{error}</div>;
    if (!displayData && wordToDisplay) return <div className="text-gray-500 p-4">Select mode or generate for "{wordToDisplay}".</div>;
    if (!displayData && !wordToDisplay) return <div className="text-gray-500 p-4">Enter word & "Generate".</div>;

    switch (activeContentMode) {
      case 'explain': /* ... (Your existing explain case) ... */
        if (isLoading && !displayData?.explain) return <div className="flex JCC AIC h-32"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /> <span className="ml-2 text-gray-700">Loading...</span></div>;
        if (error && !displayData?.explain) return <div className="text-red-500 p-4 bg-red-100 RNDMD">{error}</div>; 
        return ( <div className="prose max-w-none p-1 text-gray-800" onClick={(e) => {  const target = e.target as HTMLElement; if (target.tagName === 'BUTTON' && target.dataset.subtopic) { handleSubTopicClickInternal(target.dataset.subtopic); } }}>
            <div dangerouslySetInnerHTML={explanationHTML} />
            {displayData?.explain && ( <button onClick={handleRefreshContent} className="mt-2 text-xs text-blue-500 hover:text-blue-700 flex AIC" title="Refresh"> <RefreshCw size={12} className="mr-1" /> Regenerate </button> )} </div> );
      case 'fact': /* ... */ return <div className="prose max-w-none p-1 text-gray-800">{displayData?.fact || "No fact."}</div>;
      case 'image': /* ... */ return <div className="prose max-w-none p-1 text-gray-800">{displayData?.image || "Image soon."}</div>;
      case 'deep_dive': /* ... */ return <div className="prose max-w-none p-1 text-gray-800">{displayData?.deep_dive || "Deep dive soon."}</div>;
      case 'quiz':
        if (isLoading && !displayData?.quiz) return <div className="flex JCC AIC h-32"><Loader2 className="animate-spin h-8 w-8 text-blue-500" /> <span className="ml-2 text-gray-700">Loading quiz...</span></div>;
        const quizSpecificError = error && !displayData?.quiz; if (quizSpecificError) return <div className="text-red-500 p-4 bg-red-100 RNDMD">{error}</div>;
        const quizSet = displayData?.quiz; const quizProgress = displayData?.quiz_progress || [];
        if (!quizSet || quizSet.length === 0) return <div className="p-4 text-gray-500">No quiz.</div>;
        
        // FIX 3: Ensure quiz summary is rendered only once, in the correct place.
        // The logic to show summary is `currentQuizQuestionIndex >= quizSet.length`
        if (currentQuizQuestionIndex >= quizSet.length) { 
            let correctCount = quizProgress.filter(attempt => attempt.is_correct).length;
            return ( 
                <div className="p-4 space-y-4 text-gray-800">
                    <h3 className="text-xl font-semibold text-gray-700 mb-2">Quiz Summary for "{wordToDisplay}"</h3>
                    <p className="text-lg font-medium mb-3">Your Score: {correctCount} / {quizSet.length}</p>
                    {/* FIX 3: Added max-h-60 and overflow-y-auto for scrollable summary questions */}
                    <div className="max-h-[60vh] overflow-y-auto space-y-3 pr-2 custom-scrollbar"> 
                        {quizSet.map((quizString, index) => {
                            const parsedQuestion = parseQuizString(quizString);
                            if (!parsedQuestion) return <div key={index} className="text-red-500 text-sm p-2 bg-red-50 rounded">Error Q{index + 1}.</div>;
                            const attempt = quizProgress.find(p => p.question_index === index);
                            return ( 
                                <div key={index} className="p-3 border rounded-lg shadow-sm bg-white">
                                    <p className="font-semibold text-gray-700 text-sm mb-1">Q{index + 1}: {parsedQuestion.questionText}</p>
                                    <ul className="space-y-1 text-xs">
                                        {parsedQuestion.options.map(opt => (
                                            <li key={opt.key} className={`p-1.5 rounded border ${opt.key === parsedQuestion.correctOptionKey ? 'bg-green-50 border-green-200 font-medium text-green-700' : 'text-gray-600'} ${attempt && opt.key === attempt.selected_option_key && opt.key !== parsedQuestion.correctOptionKey ? 'bg-red-50 border-red-200 text-red-700' : ''} `}>
                                                ({opt.key}) {opt.text}
                                                {opt.key === parsedQuestion.correctOptionKey && <CheckCircle size={12} className="inline ml-1 text-green-500" />}
                                                {attempt && opt.key === attempt.selected_option_key && opt.key !== parsedQuestion.correctOptionKey && <XCircle size={12} className="inline ml-1 text-red-500" />}
                                            </li>
                                        ))}
                                    </ul>
                                    {attempt ? (attempt.is_correct ? <p className="mt-1 text-xs text-green-600">Correct.</p> : <p className="mt-1 text-xs text-red-600">Incorrect. Correct: ({parsedQuestion.correctOptionKey})</p>) : <p className="mt-1 text-xs text-orange-400">Not attempted.</p>}
                                </div>
                            );
                        })}
                    </div>
                    <button onClick={handleFetchNewQuizSet} disabled={isLoading} className="w-full bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center justify-center disabled:opacity-60">
                       {isLoading ? <Loader2 className="animate-spin mr-2" size={18}/> : <PlusCircle size={18} className="mr-2" />} More Questions for "{wordToDisplay}"
                    </button>
                </div>
            );
        }
        // If not summary, render current question (your existing logic for this part)
        const currentQuestionString = quizSet[currentQuizQuestionIndex]; const parsedQuestion = parseQuizString(currentQuestionString);
        if (!parsedQuestion) return <div className="text-red-500 p-4">Error loading question.</div>;
        const attemptForThisQuestion = quizProgress.find(p => p.question_index === currentQuizQuestionIndex); const alreadyAnsweredThisQuestion = !!attemptForThisQuestion;
        return ( /* ... (Your existing active question rendering logic) ... */ 
             <div className="p-4 SPACY4 text-gray-800"> <p className="font-semibold text-lg text-gray-700">Q {currentQuizQuestionIndex + 1}/{quizSet.length}:</p> <p className="text-gray-800">{parsedQuestion.questionText}</p> <div className="SPACY2"> {parsedQuestion.options.map(opt => ( <button key={opt.key} onClick={() => !alreadyAnsweredThisQuestion && handleQuizOptionSelect(opt.key, parsedQuestion.correctOptionKey, currentQuizQuestionIndex)} disabled={alreadyAnsweredThisQuestion || isQuizAttempted} className={`w-full text-left p-3 RNDLG BRDR TALLD150 text-gray-700 ${selectedQuizOption === opt.key ? (quizFeedback?.isCorrect ? 'bg-green-200 BRDRGRN4 RING2 RINGGRN5' : 'bg-red-200 BRDRRD4 RING2 RINGRD5') : 'bg-white hover:bg-gray-100 border-gray-300'} ${alreadyAnsweredThisQuestion && opt.key === attemptForThisQuestion!.selected_option_key ? (attemptForThisQuestion!.is_correct ? 'bg-green-200 BRDRGRN4' : 'bg-red-200 BRDRRD4') : ''} ${alreadyAnsweredThisQuestion && opt.key === parsedQuestion.correctOptionKey && opt.key !== attemptForThisQuestion!.selected_option_key ? 'BRDRGRN5 border-2' : ''} DSBLOP70 DSBLCRSNA`}> ({opt.key}) {opt.text} </button> ))} </div> {(isQuizAttempted || alreadyAnsweredThisQuestion) && quizFeedback && ( <div className={`p-2 RNDMD TXTsm ${quizFeedback.isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}> {quizFeedback.message} {!quizFeedback.isCorrect && ` Correct: ${parsedQuestion.correctOptionKey}`} </div> )} {(isQuizAttempted || alreadyAnsweredThisQuestion) && ( <button onClick={handleNextQuestion} className="w-full bg-blue-500 hover:bg-blue-600 text-white font-semibold py-2 px-4 RNDLG T"> {currentQuizQuestionIndex < quizSet.length - 1 ? 'Next Question' : 'View Summary'} </button> )} <div className="TXTxs text-gray-500 mt-2"> Progress: {quizProgress.length}/{quizSet.length}. Score: {quizProgress.filter(p=>p.is_correct).length}. </div> </div>
        );
      default: return <div className="p-4 text-gray-500">Select content mode.</div>;
    }
  };
  
  const renderProfileModal = () => {
    if (!showProfileModal || !currentUser) return null;
    
    // FIX 2: Improved Profile Modal Styling
    const Section: React.FC<{title: string, count?: number, children: React.ReactNode}> = ({title, count, children}) => {
        const [isOpen, setIsOpen] = useState(true); // Default to open or based on preference
        return (
            <div className="mb-3 border border-gray-700 rounded-lg shadow-sm bg-white/5">
                <button 
                    onClick={() => setIsOpen(!isOpen)}
                    className="w-full flex justify-between items-center p-3 text-left font-semibold text-gray-200 hover:bg-white/10"
                >
                    {title} {count !== undefined && `(${count})`}
                    <span className={`transform transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>▼</span>
                </button>
                {isOpen && <div className="p-3 border-t border-gray-700">{children}</div>}
            </div>
        );
    };

    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-slate-800 p-6 rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col text-gray-100"> 
          <div className="flex justify-between items-center mb-6 pb-3 border-b border-slate-700">
            <h3 className="text-2xl font-semibold text-purple-400">User Profile</h3>
            <button onClick={() => setShowProfileModal(false)} className="text-gray-400 hover:text-white text-2xl">&times;</button>
          </div>
          
          <div className="overflow-y-auto flex-grow custom-scrollbar pr-2 space-y-2"> {/* Added space-y-2 for spacing between items */}
            <div className="mb-4 p-3 bg-slate-700/50 rounded-lg">
                <p><strong className="text-gray-300">Username:</strong> {currentUser.username}</p>
                <p><strong className="text-gray-300">Email:</strong> {currentUser.email || 'N/A'}</p>
                <p><strong className="text-gray-300">Account Tier:</strong> {currentUser.tier || 'Standard'}</p>
                <p><strong className="text-gray-300">Total Words Explored:</strong> {currentUser.total_words_explored || 0}</p>
            </div>
            
            <Section title="All Explored Words" count={currentUser.explored_words?.length || 0}>
              {currentUser.explored_words && currentUser.explored_words.length > 0 ? (
                <ul className="space-y-1.5 text-sm">
                  {currentUser.explored_words.sort((a,b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime()).map((wh: WordHistoryEntry) => (
                    <li key={wh.id} onClick={() => handleWordSelectionFromProfile(wh.word)}
                        className="p-2 hover:bg-slate-700 rounded cursor-pointer flex justify-between items-center"> 
                      <span>{wh.word} <span className="text-xs text-gray-400">({new Date(wh.last_explored_at).toLocaleDateString()})</span></span>
                      {wh.is_favorite && <Heart size={14} className="text-red-400 fill-current" />}
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-gray-400">No words explored yet.</p>}
            </Section>

            <Section title="Favorite Words" count={currentUser.favorite_words?.length || 0}>
              {currentUser.favorite_words && currentUser.favorite_words.length > 0 ? (
                <ul className="space-y-1.5 text-sm">
                  {currentUser.favorite_words.sort((a,b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime()).map((wh: WordHistoryEntry) => (
                    <li key={wh.id} onClick={() => handleWordSelectionFromProfile(wh.word)}
                        className="p-2 hover:bg-slate-700 rounded cursor-pointer flex justify-between items-center">
                      <span>{wh.word} <span className="text-xs text-gray-400">({new Date(wh.last_explored_at).toLocaleDateString()})</span></span>
                      <Heart size={14} className="text-red-400 fill-current" />
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-gray-400">No favorite words yet.</p>}
            </Section>

            <Section title="Streak History" count={currentUser.streak_history?.length || 0}>
              {currentUser.streak_history && currentUser.streak_history.length > 0 ? (
                <ul className="space-y-1.5 text-sm">
                  {currentUser.streak_history.sort((a,b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()).map((streak: StreakEntry) => (
                    <li key={streak.id} className="p-2 hover:bg-slate-700 rounded"> 
                      <span className="font-medium text-purple-300">Score {streak.score}:</span> {streak.words.map((w: string, i: number) => (
                        <span key={i} onClick={() => handleWordSelectionFromProfile(w)} className="cursor-pointer hover:underline text-gray-300">{w}</span>
                      )).reduce((prev, curr) => <>{prev} <span className="text-gray-500">→</span> {curr}</>)}
                      <span className="text-xs text-gray-500 ml-2">({new Date(streak.completed_at).toLocaleDateString()})</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-gray-400">No past streaks recorded.</p>}
            </Section>
          </div>
          
          <button onClick={() => setShowProfileModal(false)} className="mt-6 w-full bg-purple-600 text-white py-2.5 px-4 rounded-lg hover:bg-purple-700 transition-colors font-semibold">Close</button>
        </div>
      </div>
    );
  };

  const renderAuthModal = () => { /* ... (Your existing renderAuthModal logic) ... */ };
  
  // ... (rest of your App component, ensure all functions are correctly defined and used)

  const displayWord = getDisplayWord();
  const displayWordSanitized = getDisplayWordSanitized();
  const isFavoriteCurrent = generatedContent[displayWordSanitized]?.is_favorite || false;

  const contentModes: { id: ContentMode, label: string, icon: React.ElementType }[] = [
    { id: 'explain', label: 'Explain', icon: MessageSquare }, { id: 'quiz', label: 'Quiz', icon: HelpCircle },
    { id: 'fact', label: 'Fact', icon: Brain }, { id: 'image', label: 'Image', icon: ImageIcon },
    { id: 'deep_dive', label: 'Deep Dive', icon: FileText },
  ];

  return ( /* ... (Your existing main JSX return structure from App.tsx, ensure it uses the updated streak display and no user ID) ... */ 
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-gray-100 flex flex-col items-center p-4 font-sans">
      <div className="w-full max-w-2xl bg-white/10 backdrop-blur-md shadow-2xl rounded-xl p-6 md:p-8">
        <header className="flex flex-col sm:flex-row justify-between items-center mb-6 pb-4 border-b border-white/20">
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-400 to-orange-400 mb-2 sm:mb-0"> Tiny Tutor AI </h1>
          <div className="flex items-center space-x-3"> {currentUser && <span className="text-sm">Hi, {currentUser.username}!</span>} {authToken ? ( <> <button onClick={() => { if(authToken) fetchUserProfile(authToken); setShowProfileModal(true);}} title="Profile" className="p-2 rounded-full hover:bg-white/20 TCOL"><User size={20} /></button> <button onClick={handleLogout} title="Logout" className="p-2 rounded-full hover:bg-white/20 TCOL"><LogOut size={20} /></button> </> ) : ( <button onClick={() => {setShowAuthModal(true); setAuthMode('login'); setAuthError(null);}} title="Login" className="p-2 rounded-full hover:bg-white/20 TCOL"><LogIn size={20} /></button> )} </div>
        </header>
        <div className="mb-6"> <div className="flex flex-col sm:flex-row gap-2"> <input ref={inputRef} type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleGenerateExplanation(inputValue, false, false, false, false, 'explain')} placeholder="Enter a word or concept..." className="flex-grow p-3 RNDLG bg-white/20 BRDR BRDRWH30 focus:RING2 focus:RINGPU4 focus:BRDRPU4 outline-none PLHGR3 text-white" /> <button onClick={() => handleGenerateExplanation(inputValue, false, false, false, false, 'explain')} disabled={isLoading || !inputValue.trim()} className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-semibold py-3 px-6 RNDLG SHMD hover:SHLG TALL D150 DSBLOP50 DSBLCRSNA flex AIC JCC"> {isLoading && !currentDisplayWordData && inputValue.trim() ? <Loader2 className="animate-spin mr-2" size={20}/> : <BookOpen size={20} className="mr-2" />} Generate Explanation </button> </div> </div>
        {liveStreak.score > 0 && ( <div className="mb-4 p-3 bg-white/10 RNDLG TXTsm"> <span className="font-semibold">Live Streak: {liveStreak.score} </span> <span> ({liveStreak.words.map((word, index) => ( <React.Fragment key={word + index}> <span onClick={() => handleStreakWordClick(word)} className={`CRS PNT hover:underline ${ (isReviewingStreakWord && wordForReview.toLowerCase() === word.toLowerCase()) || (!isReviewingStreakWord && currentFocusWord.toLowerCase() === word.toLowerCase()) ? 'font-bold text-purple-300' : '' }`}> {word} </span> {index < liveStreak.words.length - 1 && ' → '} </React.Fragment> ))}) </span> {isReviewingStreakWord && <span className="ml-2 TXTxs italic">(Reviewing: {wordForReview})</span>} </div> )}
        { (getDisplayWord() || (error && activeContentMode !== 'explain' && activeContentMode !== 'quiz') || authError ) && ( <div className="bg-white/5 backdrop-blur-sm SHINR RNDLG min-h-[200px]"> <div className="flex flex-wrap AIC JCSB p-3 BRDRB BRDRWH20"> <div className="flex flex-wrap gap-1"> {contentModes.map(modeInfo => ( <button key={modeInfo.id} onClick={() => handleModeChange(modeInfo.id)} disabled={!getDisplayWord() && !error && !authError} className={`px-3 py-1.5 TXTxs sm:TXTsm RNDMD TCOL flex AIC ${activeContentMode === modeInfo.id ? 'bg-purple-500 text-white SHMD' : 'bg-white/10 hover:bg-white/20 text-gray-200'} ${(!getDisplayWord() && !error && !authError) ? 'OP50 CRSNA' : ''}`}> <modeInfo.icon size={14} className="mr-1.5" /> {modeInfo.label} </button> ))} </div> {getDisplayWord() && ( <button onClick={handleToggleFavorite} title={isFavoriteCurrent ? "Remove from favorites" : "Add to favorites"} className="p-2 RNDFL hover:bg-white/20 TCOL"> <Heart size={20} className={`${isFavoriteCurrent ? 'text-red-500 fill-current' : 'text-gray-400'}`} /> </button> )} </div> <div className="p-2 sm:p-4 text-gray-800 bg-white RNDBBLG"> {renderContent()} </div> </div> )}
        {renderAuthModal()} {renderProfileModal()}
      </div> <footer className="mt-8 text-center TXTxs text-gray-400"> <p>&copy; {new Date().getFullYear()} Tiny Tutor AI.</p> </footer>
    </div> 
  );
}
export default App;

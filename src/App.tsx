import React, { useState, useEffect, useCallback, FormEvent } from 'react';
import {
  BookOpen,
  Heart,
  ImageIcon,
  Lightbulb,
  LogIn,
  LogOut,
  RefreshCw,
  Sparkles,
  User,
  X,
  MessageSquareQuote,
  Brain,
  Home,
  HelpCircle, 
  ChevronRight, 
  CheckCircle, 
  XCircle, 
  FileText 
} from 'lucide-react';
import './App.css';
import './index.css';
import ProfilePageComponent from './ProfilePage';

// --- Types ---
interface CurrentUser {
  username: string;
  email: string;
  id: string;
}

interface ParsedQuizQuestion {
  question: string;
  options: { [key: string]: string };
  correctOptionKey: string;
  explanation?: string; 
  originalString?: string;
}

interface GeneratedContentItem { 
  explanation?: string;
  fact?: string;
  image_prompt?: string;
  image_url?: string;
  deep_dive?: string;
  is_favorite?: boolean;
  first_explored_at?: string;
  last_explored_at?: string;
  modes_generated?: string[];
}

interface GeneratedContent {
  [wordId: string]: GeneratedContentItem;
}

interface LiveStreak {
  score: number;
  words: string[];
}

interface StreakRecord {
  id: string;
  words: string[];
  score: number;
  completed_at: string;
}

interface ExploredWordEntry {
  word: string;
  last_explored_at: string;
  is_favorite: boolean;
  first_explored_at?: string;
}

interface UserProfileData {
  username: string;
  email: string;
  totalWordsExplored: number;
  exploredWords: ExploredWordEntry[];
  favoriteWords: ExploredWordEntry[];
  streakHistory: StreakRecord[];
  quiz_points?: number;
  total_quiz_questions_answered?: number;
  total_quiz_questions_correct?: number;
}

type ContentMode = 'explain' | 'quiz' | 'fact' | 'image' | 'deep_dive';

interface StreakQuizItem {
  word: string;
  originalExplanation: string; 
  quizQuestion: ParsedQuizQuestion;
  attempted: boolean;
  selectedOptionKey?: string;
  isCorrect?: boolean;
}

const API_BASE_URL = 'https://tiny-tutor-app.onrender.com'; // Ensure this is your correct backend URL

const sanitizeWordForId = (word: string): string => {
  if (typeof word !== 'string') return "invalid_word_input";
  return word.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
};

const parseQuizStringToArray = (quizStringsFromBackend: any): ParsedQuizQuestion[] => {
    if (!Array.isArray(quizStringsFromBackend)) {
        console.error("Quiz data from backend is not an array:", quizStringsFromBackend);
        return [];
    }
    return quizStringsFromBackend.map((quizStr: string, index: number) => {
        if (typeof quizStr !== 'string') {
            console.error(`Quiz item at index ${index} is not a string:`, quizStr);
            return null; 
        }
        const lines = quizStr.trim().split('\n').map(line => line.trim()).filter(line => line);
        if (lines.length < 3 && !lines.some(l => l.startsWith("**Question"))) { 
            if(lines.length > 0 && lines.some(l => l.includes("A)") || l.includes("B)"))) {/* Attempt to salvage */} else { return null;}
        }
        let question = ""; const options: { [key: string]: string } = {}; let correctOptionKey = "";
        let explanationForAnswer = ""; let parsingState: 'question' | 'options' | 'answer' | 'explanation' = 'question';
        let questionLines: string[] = [];
        for (const line of lines) {
            const questionMatch = line.match(/^\*\*Question \d*:\*\*(.*)/i);
            if (questionMatch) {
                if (questionLines.length > 0 && !question) question = questionLines.join(" ").trim();
                questionLines = []; question = questionMatch[1].trim(); parsingState = 'options'; continue;
            }
            const optionMatch = line.match(/^([A-D])\)\s*(.*)/i);
            if (optionMatch) {
                if (parsingState === 'question' && questionLines.length > 0) { question = questionLines.join(" ").trim(); questionLines = []; }
                options[optionMatch[1].toUpperCase()] = optionMatch[2].trim(); parsingState = 'options'; continue;
            }
            const correctMatch = line.match(/^Correct Answer:\s*([A-D])/i);
            if (correctMatch) {
                if (parsingState === 'question' && questionLines.length > 0) { question = questionLines.join(" ").trim(); questionLines = []; }
                correctOptionKey = correctMatch[1].toUpperCase(); parsingState = 'explanation'; explanationForAnswer = ""; continue;
            }
            const explanationKeywordMatch = line.match(/^Explanation:\s*(.*)/i);
            if (explanationKeywordMatch) {
                 if (parsingState === 'question' && questionLines.length > 0) { question = questionLines.join(" ").trim(); questionLines = []; }
                explanationForAnswer = explanationKeywordMatch[1].trim(); parsingState = 'explanation'; continue;
            }
            if (parsingState === 'question') { questionLines.push(line);
            } else if (parsingState === 'explanation') { explanationForAnswer += (explanationForAnswer ? " " : "") + line.trim(); }
        }
        if (questionLines.length > 0 && !question) question = questionLines.join(" ").trim();
        explanationForAnswer = explanationForAnswer.trim();
        if (!question || Object.keys(options).length < 2 || !correctOptionKey || !options[correctOptionKey]) {
             console.warn(`Incomplete parse for quiz item ${index}. Q: "${question}", Opts: ${Object.keys(options).length}, CorrectKey: "${correctOptionKey}", HasKey: ${!!options[correctOptionKey]}`, "Original:", quizStr);
             return question ? { question, options: options || {}, correctOptionKey: correctOptionKey || '', explanation: explanationForAnswer || undefined, originalString: quizStr } : null;
        }
        return { question, options, correctOptionKey, explanation: explanationForAnswer || undefined, originalString: quizStr };
    }).filter(q => q !== null) as ParsedQuizQuestion[]; 
};

function App() {
  const [inputValue, setInputValue] = useState('');
  const [currentFocusWord, setCurrentFocusWord] = useState<string | null>(null);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeContentMode, setActiveContentMode] = useState<ContentMode>('explain');

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authUsername, setAuthUsername] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMessage, setAuthSuccessMessage] = useState<string | null>(null);

  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem('authToken'));

  const [liveStreak, setLiveStreak] = useState<LiveStreak | null>(null);
  const [userProfileData, setUserProfileData] = useState<UserProfileData | null>(null);

  const [activeView, setActiveView] = useState<'main' | 'profile'>('main');

  const [currentSingleWordQuiz, setCurrentSingleWordQuiz] = useState<ParsedQuizQuestion[] | null>(null);
  const [currentSingleWordQuizIdx, setCurrentSingleWordQuizIdx] = useState(0);
  const [singleWordQuizFeedback, setSingleWordQuizFeedback] = useState<{ message: string; isCorrect: boolean } | null>(null);
  const [singleWordSelectedOption, setSingleWordSelectedOption] = useState<string | null>(null);
  const [singleWordQuizAttempted, setSingleWordQuizAttempted] = useState(false);

  const [liveStreakQuizQueue, setLiveStreakQuizQueue] = useState<StreakQuizItem[]>([]);
  const [currentStreakQuizItemIndex, setCurrentStreakQuizItemIndex] = useState<number>(0);
  const [showStreakQuizItemExplanation, setShowStreakQuizItemExplanation] = useState(false);
  const [isViewingStreakQuizSummary, setIsViewingStreakQuizSummary] = useState(false);

  const [wordForReview, setWordForReview] = useState<string | null>(null);
  const [isReviewingStreakWord, setIsReviewingStreakWord] = useState(false);

  const [isFetchingProfile, setIsFetchingProfile] = useState(false);
  const [initialLoadDone, setInitialLoadDone] = useState(false);

  const getDisplayWord = useCallback(() => {
    return isReviewingStreakWord && wordForReview ? wordForReview : currentFocusWord;
  }, [isReviewingStreakWord, wordForReview, currentFocusWord]);

  const saveStreakToServer = useCallback(async (streakToSave: LiveStreak, token: string | null) => {
    if (!token || !streakToSave || streakToSave.score < 2) return;
    try {
      await fetch(`${API_BASE_URL}/save_streak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ words: streakToSave.words, score: streakToSave.score }),
      });
    } catch (err: any) {
      console.error('Error saving streak:', err.message);
    }
  }, []);

  const handleLogout = useCallback(async () => {
    if (liveStreak && liveStreak.score >= 2 && authToken) {
        await saveStreakToServer(liveStreak, authToken);
    }
    localStorage.removeItem('authToken'); setAuthToken(null); setCurrentUser(null);
    setUserProfileData(null); setLiveStreak(null); setCurrentFocusWord(null);
    setGeneratedContent({}); setActiveContentMode('explain'); setError(null);
    setAuthError(null); setAuthSuccessMessage(null); setShowAuthModal(false);
    setActiveView('main'); setInitialLoadDone(false); setLiveStreakQuizQueue([]);
    setCurrentStreakQuizItemIndex(0); setShowStreakQuizItemExplanation(false);
    setIsViewingStreakQuizSummary(false); console.log("User logged out");
  }, [liveStreak, authToken, saveStreakToServer]);

  const fetchUserProfile = useCallback(async (token: string | null) => {
    if (!token) { setUserProfileData(null); setCurrentUser(null); return; }
    setIsFetchingProfile(true);
    try {
      const response = await fetch(`${API_BASE_URL}/profile`, { headers: { 'Authorization': `Bearer ${token}` }});
      if (!response.ok) {
        if (response.status === 401) { handleLogout(); 
        } else if (response.status === 429) { setError("Too many requests to fetch profile. Please try again later."); setUserProfileData(null); setCurrentUser(null); 
        } else {
            let errorMsg = `Failed to fetch profile (${response.status})`;
            try {
                const errText = await response.text(); 
                if (errText.trim().startsWith("<!doctype") || errText.trim().startsWith("<html")) { setError(errorMsg + ". The server returned an unexpected response.");
                } else { const errData = JSON.parse(errText); errorMsg = errData.error || errorMsg; setError(errorMsg); }
            } catch (parseError) { setError(errorMsg + ". Server response was not understandable.");}
        } return; 
      }
      const data = await response.json(); 
      const processedExploredWords: ExploredWordEntry[] = (data.exploredWords || []).map((w: any): ExploredWordEntry | null => (w && typeof w.word === 'string' ? { word: w.word as string, last_explored_at: w.last_explored_at as string, is_favorite: w.is_favorite as boolean, first_explored_at: w.first_explored_at as string | undefined } : null)).filter((item: ExploredWordEntry | null): item is ExploredWordEntry => item !== null && typeof item.word === 'string' && item.word.trim() !== '');
      const processedFavoriteWords: ExploredWordEntry[] = (data.favoriteWords || []).map((w: any): ExploredWordEntry | null => (w && typeof w.word === 'string' ? { word: w.word as string, last_explored_at: w.last_explored_at as string, is_favorite: w.is_favorite as boolean, first_explored_at: w.first_explored_at as string | undefined } : null)).filter((item: ExploredWordEntry | null): item is ExploredWordEntry => item !== null && typeof item.word === 'string' && item.word.trim() !== '');
      setUserProfileData({ username: data.username, email: data.email, totalWordsExplored: data.totalWordsExplored, exploredWords: processedExploredWords, favoriteWords: processedFavoriteWords, streakHistory: (data.streakHistory || []).sort((a:any, b:any) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()), quiz_points: data.quiz_points, total_quiz_questions_answered: data.total_quiz_questions_answered, total_quiz_questions_correct: data.total_quiz_questions_correct });
      setCurrentUser({ username: data.username, email: data.email, id: data.user_id || (currentUser?.id || '') });
      setError(null); 
    } catch (err: any) { if (!error) setError((err as Error).message); } 
    finally { setIsFetchingProfile(false); }
  }, [currentUser?.id, error, handleLogout]);

  useEffect(() => {
    const storedToken = localStorage.getItem('authToken');
    if (storedToken) {
      if (!authToken) setAuthToken(storedToken);
      if (!initialLoadDone && !currentUser && !userProfileData && !isFetchingProfile) {
        fetchUserProfile(storedToken).finally(() => setInitialLoadDone(true));
      } else if ((currentUser || userProfileData) && !initialLoadDone) { setInitialLoadDone(true); }
    } else {
      if (currentUser || userProfileData || authToken) { setCurrentUser(null); setUserProfileData(null); setAuthToken(null); setInitialLoadDone(false);}
    }
  }, [authToken, currentUser, userProfileData, isFetchingProfile, initialLoadDone, fetchUserProfile]);

  const handleAuthAction = async (e: FormEvent) => {
    e.preventDefault(); setAuthError(null); setAuthSuccessMessage(null); setIsLoading(true); setInitialLoadDone(false); 
    const url = authMode === 'signup' ? `${API_BASE_URL}/signup` : `${API_BASE_URL}/login`;
    let payload = {};
    if (authMode === 'signup') { payload = { username: authUsername, email: authEmail, password: authPassword };
    } else { payload = { email_or_username: authUsername, password: authPassword };}
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (!response.ok) { throw new Error(data.error || `${authMode === 'signup' ? 'Signup' : 'Login'} failed`);}
      if (authMode === 'signup') { setAuthSuccessMessage('Signup successful! Please login.'); setAuthMode('login'); setAuthEmail(''); setAuthPassword(''); 
      } else { 
        localStorage.setItem('authToken', data.access_token); setAuthToken(data.access_token); 
        setCurrentUser({ username: data.user.username, email: data.user.email, id: data.user.id }); 
        setShowAuthModal(false); setAuthSuccessMessage('Login successful!');
        await fetchUserProfile(data.access_token); setInitialLoadDone(true); 
        setAuthEmail(''); setAuthPassword(''); setAuthUsername(''); 
      }
    } catch (err: any) { setAuthError((err as Error).message); setInitialLoadDone(true); 
    } finally { setIsLoading(false); if (authMode === 'signup') setAuthPassword(''); }
  };
  
  const handleSaveQuizAttempt = useCallback(async (word: string, questionIdx: number, optionKey: string | null, isCorrect: boolean) => {
    if (!authToken) return;
    try {
        await fetch(`${API_BASE_URL}/save_quiz_attempt`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ word, question_index: questionIdx, selected_option_key: optionKey || "", is_correct: isCorrect }),
        });
        if (authToken) await fetchUserProfile(authToken); 
    } catch (err: any) { console.error("Error saving quiz attempt stats:", err); setError("Could not save quiz points."); }
  }, [authToken, fetchUserProfile]);

  const handleGenerateExplanation = useCallback(async (
    wordToFetch: string,
    isNewPrimaryWordSearch: boolean = false,
    isRefreshClick: boolean = false, 
    isSubTopicClick: boolean = false,
    modeOverride?: ContentMode,
    isProfileWordClick: boolean = false
  ) => {
    if (!wordToFetch.trim()) { setError("Please enter a word or concept."); return; }
    if (!authToken) { setShowAuthModal(true); setAuthError("Please login to generate content."); return; }

    setIsLoading(true);
    setError(null);
    
    const targetModeForThisCall = modeOverride || activeContentMode;

    if (targetModeForThisCall !== 'quiz' || (targetModeForThisCall === 'quiz' && liveStreakQuizQueue.length > 0) ) {
        setCurrentSingleWordQuiz(null); setCurrentSingleWordQuizIdx(0);
        setSingleWordQuizFeedback(null); setSingleWordSelectedOption(null); setSingleWordQuizAttempted(false);
    }
    if (activeContentMode === 'quiz' && targetModeForThisCall !== 'quiz') {
        setShowStreakQuizItemExplanation(false); setIsViewingStreakQuizSummary(false); 
    }
    
    const wordId = sanitizeWordForId(wordToFetch);
    let streakContextForAPI: string[] = [];

    if (isNewPrimaryWordSearch || isProfileWordClick) {
        streakContextForAPI = []; setLiveStreakQuizQueue([]); 
        setCurrentStreakQuizItemIndex(0); setShowStreakQuizItemExplanation(false); setIsViewingStreakQuizSummary(false);
    } else if (isSubTopicClick || (isReviewingStreakWord && wordForReview === wordToFetch)) {
        if (liveStreak && liveStreak.words.length > 0) {
            const targetWordForContext = isReviewingStreakWord && wordForReview ? wordForReview : wordToFetch;
            const wordIndexInStreak = liveStreak.words.indexOf(targetWordForContext);
            if (isSubTopicClick && (!liveStreak.words.includes(wordToFetch) || wordToFetch === liveStreak.words[liveStreak.words.length - 1])) {
                 streakContextForAPI = [...liveStreak.words];
            } else if (wordIndexInStreak !== -1) { streakContextForAPI = liveStreak.words.slice(0, wordIndexInStreak);
            } else if (isSubTopicClick) { streakContextForAPI = [...liveStreak.words]; }
        }
    } else if (currentFocusWord && !isNewPrimaryWordSearch && !isProfileWordClick) {
        if (liveStreak && liveStreak.words.includes(currentFocusWord)) {
             const currentFocusWordIndex = liveStreak.words.indexOf(currentFocusWord);
             if (currentFocusWordIndex > 0) streakContextForAPI = liveStreak.words.slice(0, currentFocusWordIndex);
        }
    }
    // Define isContextualExplainCall here, based on the target mode and context
    const isContextualExplainCall = targetModeForThisCall === 'explain' && streakContextForAPI.length > 0;


    if ((isNewPrimaryWordSearch || isProfileWordClick) && liveStreak && liveStreak.score >= 1 && authToken) {
        if (liveStreak.score >= 2) await saveStreakToServer(liveStreak, authToken);
        setLiveStreak(null);
    }
    
    if (isNewPrimaryWordSearch || isProfileWordClick) {
        setCurrentFocusWord(wordToFetch); setIsReviewingStreakWord(false); setWordForReview(null);
    } else if (isSubTopicClick && (!liveStreak || !liveStreak.words.includes(wordToFetch) || (liveStreak.words.includes(wordToFetch) && wordToFetch !== currentFocusWord && !isReviewingStreakWord))) {
        setCurrentFocusWord(wordToFetch); setIsReviewingStreakWord(false); setWordForReview(null);
    }

    if (targetModeForThisCall === 'quiz' && liveStreakQuizQueue.length === 0) {
        let explanationForQuiz = generatedContent[wordId]?.explanation;
        if (!explanationForQuiz || explanationForQuiz.trim() === '') {
            if (!generatedContent[wordId]?.explanation && activeContentMode !== 'explain') {
                 console.log(`Quiz mode for ${wordToFetch} needs explanation. Fetching explanation first.`);
                 try {
                    const explResponse = await fetch(`${API_BASE_URL}/generate_explanation`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ word: wordToFetch, mode: 'explain', refresh_cache: true, streakContext: streakContextForAPI }), });
                    if (!explResponse.ok) throw new Error((await explResponse.json()).error || 'Failed to fetch explanation for quiz');
                    const explData = await explResponse.json();
                    const newExplanation = explData.explain;
                    setGeneratedContent(prev => ({...prev, [wordId]: {...(prev[wordId] || {}), explanation: newExplanation, last_explored_at: new Date().toISOString(), modes_generated: Array.from(new Set([...(prev[wordId]?.modes_generated || []), 'explain'])) }}));
                    explanationForQuiz = newExplanation; // Use the newly fetched explanation
                    // Now fetch quiz with the new explanation
                     if (explanationForQuiz) { // Check if explanationForQuiz is now valid
                        const quizResponse = await fetch(`${API_BASE_URL}/generate_explanation`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ word: wordToFetch, mode: 'quiz', explanation_text: explanationForQuiz, refresh_cache: true }), });
                        if (!quizResponse.ok) { throw new Error((await quizResponse.json()).error || 'Failed to fetch quiz'); }
                        const data = await quizResponse.json();
                        const parsedQuiz = parseQuizStringToArray(data.quiz);
                        setCurrentSingleWordQuiz(parsedQuiz.length > 0 ? parsedQuiz : null);
                        setCurrentSingleWordQuizIdx(0); setSingleWordQuizFeedback(null); setSingleWordSelectedOption(null); setSingleWordQuizAttempted(false);
                        setActiveContentMode('quiz');
                    } else {
                        setError(`Failed to get explanation for "${wordToFetch}" to generate quiz.`);
                    }
                 } catch (err: any) { setError((err as Error).message); console.error("Error pre-fetching explanation for quiz:", err); }
                 finally { setIsLoading(false); }
                 return;
            } else { 
                 setError(`Explanation for "${wordToFetch}" is needed to generate a quiz. Please view or generate it first.`);
                 setIsLoading(false); return;
            }
        }
        try {
            console.log(`Fetching FRESH single-word quiz for: ${wordToFetch}`);
            const response = await fetch(`${API_BASE_URL}/generate_explanation`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ word: wordToFetch, mode: 'quiz', explanation_text: explanationForQuiz, refresh_cache: true }), });
            if (!response.ok) { throw new Error((await response.json()).error || 'Failed to fetch quiz'); }
            const data = await response.json();
            const parsedQuiz = parseQuizStringToArray(data.quiz);
            setCurrentSingleWordQuiz(parsedQuiz.length > 0 ? parsedQuiz : null);
            setCurrentSingleWordQuizIdx(0); setSingleWordQuizFeedback(null); setSingleWordSelectedOption(null); setSingleWordQuizAttempted(false);
            setActiveContentMode('quiz');
        } catch (err: any) { setError((err as Error).message); console.error("Error fetching single word quiz:", err); }
        finally { setIsLoading(false); }
        return; 
    }
    
    let serveFromCache = false;
    if (!isRefreshClick && targetModeForThisCall !== 'quiz') {
        const currentWordItem = generatedContent[wordId];
        if (currentWordItem) {
            if (targetModeForThisCall === 'explain' && typeof currentWordItem.explanation === 'string' && !isContextualExplainCall /* Only use cache for non-contextual explain */) {
                serveFromCache = true;
            } else if (targetModeForThisCall === 'fact' && typeof currentWordItem.fact === 'string') {
                serveFromCache = true;
            } else if (targetModeForThisCall === 'deep_dive' && typeof currentWordItem.deep_dive === 'string') {
                serveFromCache = true;
            } else if (targetModeForThisCall === 'image' && ((typeof currentWordItem.image_url === 'string' && currentWordItem.image_url.length > 0) || (typeof currentWordItem.image_prompt === 'string' && currentWordItem.image_prompt.length > 0))) {
                serveFromCache = true;
            }
        }
    }

    if (serveFromCache) {
        console.log(`Serving '${targetModeForThisCall}' for '${wordToFetch}' from frontend cache.`);
        setActiveContentMode(targetModeForThisCall);
        if ((isNewPrimaryWordSearch || isProfileWordClick) && currentFocusWord !== wordToFetch) { setCurrentFocusWord(wordToFetch); }
        if (isNewPrimaryWordSearch || isProfileWordClick) {
             if (!liveStreak || liveStreak.words[0] !== wordToFetch) {
                setLiveStreak({ score: 1, words: [wordToFetch] });
                setLiveStreakQuizQueue([]); setCurrentStreakQuizItemIndex(0);
             }
        }
        setIsLoading(false); return;
    }

    try {
        const finalRefreshPolicyForAPI = isRefreshClick || isContextualExplainCall; // API refresh for explicit refresh or contextual explain
        const requestBody: any = { 
            word: wordToFetch, mode: targetModeForThisCall, 
            refresh_cache: finalRefreshPolicyForAPI, 
            streakContext: streakContextForAPI 
        };

        console.log(`Fetching content via API for "${wordToFetch}", mode "${targetModeForThisCall}", API refresh: ${finalRefreshPolicyForAPI}`);
        const response = await fetch(`${API_BASE_URL}/generate_explanation`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify(requestBody),});
        if (!response.ok) { throw new Error((await response.json()).error || `Failed to generate ${targetModeForThisCall}`); }
        const data = await response.json();
        
        let fetchedExplanationForQuiz: string | undefined = undefined;
            
        setGeneratedContent(prev => { 
            const existingWordData = prev[wordId] || {};
            const newWordData: GeneratedContentItem = { ...existingWordData };
            if (targetModeForThisCall === 'explain' && data.explain !== undefined) {
                newWordData.explanation = data.explain;
                fetchedExplanationForQuiz = data.explain; // Capture for potential quiz fetch
            } else if (targetModeForThisCall === 'fact' && data.fact !== undefined) newWordData.fact = data.fact;
            else if (targetModeForThisCall === 'deep_dive' && data.deep_dive !== undefined) newWordData.deep_dive = data.deep_dive;
            else if (targetModeForThisCall === 'image') { /* ... image logic ... */ }
            
            if (data.is_favorite !== undefined) newWordData.is_favorite = data.is_favorite;
            newWordData.first_explored_at = existingWordData.first_explored_at || data.first_explored_at || new Date().toISOString();
            newWordData.last_explored_at = data.last_explored_at || new Date().toISOString();
            const currentModesGenerated = new Set(existingWordData.modes_generated || []);
            currentModesGenerated.add(targetModeForThisCall);
            if(data.modes_generated && Array.isArray(data.modes_generated)) data.modes_generated.forEach((m: string) => currentModesGenerated.add(m));
            newWordData.modes_generated = Array.from(currentModesGenerated);
            return { ...prev, [wordId]: newWordData };
        });

        const isStreakProgressAction = isNewPrimaryWordSearch || isProfileWordClick || (isSubTopicClick && (!liveStreak || !liveStreak.words.includes(wordToFetch)));
        
        if (targetModeForThisCall === 'explain' && fetchedExplanationForQuiz && authToken && isStreakProgressAction) {
            try {
                const quizResponse = await fetch(`${API_BASE_URL}/generate_explanation`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ word: wordToFetch, mode: 'quiz', explanation_text: fetchedExplanationForQuiz, refresh_cache: true }), });
                if (!quizResponse.ok) { console.error("Failed to fetch quiz for streak item:", (await quizResponse.json()).error); }
                else {
                    const quizData = await quizResponse.json();
                    const parsedQuiz = parseQuizStringToArray(quizData.quiz);
                    if (parsedQuiz.length > 0) {
                        const newStreakQuizItem: StreakQuizItem = { word: wordToFetch, originalExplanation: fetchedExplanationForQuiz, quizQuestion: parsedQuiz[0], attempted: false,};
                        setLiveStreakQuizQueue(prevQueue => [...prevQueue, newStreakQuizItem]);
                    } else { console.warn(`No quiz questions parsed for streak word: ${wordToFetch}`); }
                }
            } catch (quizErr: any) { console.error(`Error fetching quiz for streak word ${wordToFetch}:`, quizErr.message); }
        }

        if (isNewPrimaryWordSearch || isProfileWordClick) {
            setCurrentFocusWord(wordToFetch);
            setLiveStreak({ score: 1, words: [wordToFetch] });
            setIsReviewingStreakWord(false); setWordForReview(null);
        } else if (isSubTopicClick) {
             if (!liveStreak || !liveStreak.words.includes(wordToFetch) || (liveStreak.words.includes(wordToFetch) && wordToFetch !== currentFocusWord && !isReviewingStreakWord)) {
                setIsReviewingStreakWord(false); setWordForReview(null);
                setLiveStreak(prevStreak => {
                    if (!prevStreak) return { score: 1, words: [wordToFetch] };
                    if (!prevStreak.words.includes(wordToFetch)) {
                         return { score: prevStreak.score + 1, words: [...prevStreak.words, wordToFetch] };
                    }
                    return prevStreak;
                });
            }
        }
        setActiveContentMode(targetModeForThisCall);

    } catch (err: any) {
        if (!error) setError((err as Error).message); console.error("Error generating content (API block):", err);
    } finally { setIsLoading(false); if (isNewPrimaryWordSearch) setInputValue('');}
  }, [authToken, activeContentMode, generatedContent, liveStreak, saveStreakToServer, handleLogout, currentFocusWord, isReviewingStreakWord, wordForReview, error, liveStreakQuizQueue.length]);

  const handleStreakWordClick = useCallback((clickedWord: string) => {
    if (isReviewingStreakWord && wordForReview === clickedWord && activeContentMode === 'explain') { return; }
    setIsReviewingStreakWord(true); setWordForReview(clickedWord);
    setCurrentSingleWordQuiz(null); setSingleWordQuizFeedback(null); setSingleWordSelectedOption(null); setSingleWordQuizAttempted(false);
    setIsViewingStreakQuizSummary(false);

    if (activeContentMode === 'quiz') {
        const itemIndex = liveStreakQuizQueue.findIndex(item => item.word === clickedWord);
        if (itemIndex !== -1) { setCurrentStreakQuizItemIndex(itemIndex); setShowStreakQuizItemExplanation(false); }
        else { handleGenerateExplanation(clickedWord, false, false, true, 'explain');  }
    } else { handleGenerateExplanation(clickedWord, false, false, false, 'explain'); } // Pass isRefreshClick as false
  }, [ isReviewingStreakWord, wordForReview, activeContentMode, handleGenerateExplanation, liveStreakQuizQueue]);

  const handleSubTopicClick = useCallback((subTopic: string) => {
    if (subTopic === currentFocusWord && !isReviewingStreakWord) { handleGenerateExplanation(subTopic, false, true, false, 'explain'); return; }
    if (liveStreak && liveStreak.words.includes(subTopic)) { handleStreakWordClick(subTopic); } 
    else { handleGenerateExplanation(subTopic, false, false, true, 'explain'); }
  }, [currentFocusWord, liveStreak, handleGenerateExplanation, handleStreakWordClick, isReviewingStreakWord]); 
  
  const handleModeChange = useCallback((newMode: ContentMode) => {
    const wordToUse = getDisplayWord() || inputValue; 
    if (!wordToUse && newMode !== 'explain') { setError(newMode === 'quiz' ? "Please enter a word to get a quiz." : "No word is currently in focus."); return;  }
    setError(null); 
    setActiveContentMode(newMode); setIsViewingStreakQuizSummary(false); setShowStreakQuizItemExplanation(false);

    if (newMode === 'quiz') {
        if (liveStreakQuizQueue.length > 0) {
            const firstUnattemptedIdx = liveStreakQuizQueue.findIndex(item => !item.attempted);
            setCurrentStreakQuizItemIndex(firstUnattemptedIdx !== -1 ? firstUnattemptedIdx : 0);
        } else if (wordToUse) { 
            handleGenerateExplanation(wordToUse, false, true, false, 'quiz'); 
        }
    } else if (wordToUse) { 
        // For non-quiz modes, fetch with isRefreshClick=false to allow cache usage
        handleGenerateExplanation(wordToUse, false, false, false, newMode);
    } else if (newMode === 'explain') { setActiveContentMode('explain');}
  }, [getDisplayWord, inputValue, handleGenerateExplanation, liveStreakQuizQueue]);
  
  const handleRefreshContent = useCallback(() => { 
    const wordToUse = getDisplayWord(); if (!wordToUse) return;
    if (activeContentMode === 'explain') { handleGenerateExplanation(wordToUse, false, true, false, 'explain');}
  }, [getDisplayWord, activeContentMode, handleGenerateExplanation]);

  const handleToggleFavorite = useCallback(async (word: string, currentStatus: boolean) => {
    // ... (same)
    if (!authToken || !word) return; const wordId = sanitizeWordForId(word);
    setGeneratedContent(prev => { const ci = prev[wordId] || {}; return { ...prev, [wordId]: { ...ci, is_favorite: !currentStatus, last_explored_at: ci.last_explored_at || new Date().toISOString(), first_explored_at: ci.first_explored_at || new Date().toISOString() }}; });
    if (userProfileData) { setUserProfileData(prevP => { if (!prevP) return null; const nE = prevP.exploredWords.map(w => w.word === word ? { ...w, is_favorite: !currentStatus } : w ); let nF: ExploredWordEntry[]; const eE = prevP.exploredWords.find(ew => ew.word === word); if (!currentStatus) { let eTF: ExploredWordEntry; if (eE) eTF = { ...eE, is_favorite: true, last_explored_at: new Date().toISOString() }; else { const gci = generatedContent[wordId]; eTF = { word, last_explored_at: new Date().toISOString(), is_favorite: true, first_explored_at: gci?.first_explored_at || new Date().toISOString()};} nF = [ ...prevP.favoriteWords.filter(fw => fw.word !== word), eTF ]; } else nF = prevP.favoriteWords.filter(fw => fw.word !== word); return { ...prevP, exploredWords: nE, favoriteWords: nF.sort((a, b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime())}; });}
    try { const r = await fetch(`${API_BASE_URL}/toggle_favorite`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ word }) }); if (!r.ok) throw new Error((await r.json()).error || 'Toggle favorite failed'); const d = await r.json(); setGeneratedContent(prev => ({ ...prev, [wordId]: { ...(prev[wordId] || {}), is_favorite: d.is_favorite }})); if (authToken) await fetchUserProfile(authToken);
    } catch (err: any) { setError((err as Error).message); if (authToken) await fetchUserProfile(authToken); }
  }, [authToken, fetchUserProfile, userProfileData, generatedContent]);
  
  const handleWordSelectionFromProfile = useCallback((word: string) => {
    setActiveView('main'); setInputValue(word); 
    handleGenerateExplanation(word, true, false, false, 'explain', true);
  }, [handleGenerateExplanation]); 

  const handleStreakQuizOptionSelect = useCallback((optionKey: string) => {
    if (currentStreakQuizItemIndex >= liveStreakQuizQueue.length || liveStreakQuizQueue[currentStreakQuizItemIndex].attempted) return;
    const currentItem = liveStreakQuizQueue[currentStreakQuizItemIndex];
    const isCorrect = currentItem.quizQuestion.correctOptionKey === optionKey;
    const updatedQueue = liveStreakQuizQueue.map((item, index) => index === currentStreakQuizItemIndex ? { ...item, selectedOptionKey: optionKey, isCorrect, attempted: true } : item);
    setLiveStreakQuizQueue(updatedQueue);
    handleSaveQuizAttempt(currentItem.word, currentStreakQuizItemIndex, optionKey, isCorrect); 
  }, [liveStreakQuizQueue, currentStreakQuizItemIndex, handleSaveQuizAttempt]);

  const handleNextStreakQuizItem = useCallback(() => {
    setShowStreakQuizItemExplanation(false); 
    if (currentStreakQuizItemIndex < liveStreakQuizQueue.length - 1) { setCurrentStreakQuizItemIndex(prevIdx => prevIdx + 1);
    } else { setIsViewingStreakQuizSummary(true); }
  }, [currentStreakQuizItemIndex, liveStreakQuizQueue.length]);
  
  const handleSingleWordQuizOptionSelect = useCallback((optionKey: string) => {
    if (!currentSingleWordQuiz || currentSingleWordQuizIdx >= currentSingleWordQuiz.length || singleWordQuizAttempted || !currentFocusWord) return;
    const currentQuestion = currentSingleWordQuiz[currentSingleWordQuizIdx]; const isCorrect = currentQuestion.correctOptionKey === optionKey;
    setSingleWordSelectedOption(optionKey); setSingleWordQuizFeedback({ message: isCorrect ? "Correct!" : `Incorrect. Correct: ${currentQuestion.options[currentQuestion.correctOptionKey]}`, isCorrect });
    setSingleWordQuizAttempted(true); handleSaveQuizAttempt(currentFocusWord, currentSingleWordQuizIdx, optionKey, isCorrect);
  }, [currentSingleWordQuiz, currentSingleWordQuizIdx, singleWordQuizAttempted, currentFocusWord, handleSaveQuizAttempt]);

  const handleNextSingleWordQuizQuestion = useCallback(() => {
    if (!currentSingleWordQuiz) return;
    if (currentSingleWordQuizIdx < currentSingleWordQuiz.length - 1) {
      setCurrentSingleWordQuizIdx(prev => prev + 1); setSingleWordSelectedOption(null); setSingleWordQuizFeedback(null); setSingleWordQuizAttempted(false);
    } else { setCurrentSingleWordQuiz(null); } 
  }, [currentSingleWordQuiz, currentSingleWordQuizIdx]);

  const renderAuthModal = () => { /* ... (same) ... */ 
    if (!showAuthModal) return null;
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-md relative">
          <button onClick={() => { setShowAuthModal(false); setAuthError(null); setAuthSuccessMessage(null);}} className="absolute top-4 right-4 text-slate-400 hover:text-slate-200">
            <X size={24} />
          </button>
          <h2 className="text-3xl font-bold text-center text-sky-400 mb-6">{authMode === 'login' ? 'Login' : 'Sign Up'}</h2>
          {authError && <p className="bg-red-500/20 text-red-400 p-3 rounded-md mb-4 text-sm">{authError}</p>}
          {authSuccessMessage && <p className="bg-green-500/20 text-green-400 p-3 rounded-md mb-4 text-sm">{authSuccessMessage}</p>}
          <form onSubmit={handleAuthAction}>
            {authMode === 'signup' && ( <div className="mb-4"> <label className="block text-slate-300 mb-1" htmlFor="signup-username">Username</label> <input type="text" id="signup-username" value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none" required /> </div> )}
            {authMode === 'signup' && ( <div className="mb-4"> <label className="block text-slate-300 mb-1" htmlFor="signup-email">Email</label> <input type="email" id="signup-email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none" required /> </div> )}
            {authMode === 'login' && ( <div className="mb-4"> <label className="block text-slate-300 mb-1" htmlFor="login-identifier">Username or Email</label> <input type="text"  id="login-identifier" value={authUsername}  onChange={(e) => setAuthUsername(e.target.value)} className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none" required /> </div> )}
            <div className="mb-6"> <label className="block text-slate-300 mb-1" htmlFor="password">Password</label> <input type="password" id="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none" required /> </div>
            <button type="submit" disabled={isLoading} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold p-3 rounded-lg transition-colors disabled:opacity-50"> {isLoading ? 'Processing...' : (authMode === 'login' ? 'Login' : 'Sign Up')} </button>
          </form>
          <p className="text-center text-slate-400 mt-6 text-sm"> {authMode === 'login' ? ( <> Need an account? <button onClick={() => {setAuthMode('signup'); setAuthError(null); setAuthSuccessMessage(null); setAuthUsername(''); setAuthEmail(''); setAuthPassword('');}} className="text-sky-400 hover:underline">Sign Up</button> </> ) : ( <> Already have an account? <button onClick={() => {setAuthMode('login'); setAuthError(null); setAuthSuccessMessage(null); setAuthUsername(''); setAuthEmail(''); setAuthPassword('');}} className="text-sky-400 hover:underline">Login</button> </> )} </p>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    const wordToUse = getDisplayWord(); 
    if (activeContentMode === 'quiz') {
        if (liveStreakQuizQueue.length > 0 && !isViewingStreakQuizSummary) {
            const currentItem = liveStreakQuizQueue[currentStreakQuizItemIndex];
            if (!currentItem) { return <div className="text-center p-10 text-slate-400">Loading streak quiz question...</div>; }
            const { word, quizQuestion, attempted, selectedOptionKey, isCorrect, originalExplanation } = currentItem;
            return ( <div className="bg-slate-700 p-4 sm:p-6 rounded-lg shadow-xl mt-1 relative text-slate-200"><p className="text-sm text-sky-300 mb-2 font-semibold">Streak Quiz: Question {currentStreakQuizItemIndex + 1} of {liveStreakQuizQueue.length} (Word: {word})</p><h3 className="text-lg font-semibold mb-4">{quizQuestion.question}</h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">{Object.entries(quizQuestion.options).map(([key, optionText]) => ( <button key={key} onClick={() => handleStreakQuizOptionSelect(key)} disabled={attempted} className={`p-3 rounded-lg text-left transition-all duration-200 ease-in-out ${attempted ? (key === selectedOptionKey ? (isCorrect ? 'bg-green-500/80 ring-2 ring-green-400' : 'bg-red-500/80 ring-2 ring-red-400') : (key === quizQuestion.correctOptionKey ? 'bg-green-500/50' : 'bg-slate-600 opacity-60')) : 'bg-slate-650 hover:bg-slate-600 focus:ring-2 focus:ring-sky-500'} ${attempted && 'cursor-not-allowed'} ${!attempted && 'cursor-pointer'}`}>{optionText}</button>))}</div>{attempted && (<div className={`p-3 rounded-md my-4 text-sm ${isCorrect ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>{isCorrect ? <><CheckCircle className="inline mr-2"/>Correct!</> : <><XCircle className="inline mr-2"/>Incorrect.</>}{!isCorrect && quizQuestion.options[quizQuestion.correctOptionKey] && (<span className="block mt-1">Correct Answer: {quizQuestion.options[quizQuestion.correctOptionKey]}</span>)}{quizQuestion.explanation && (<p className="mt-1 text-xs italic">Explanation: {quizQuestion.explanation}</p>)}</div>)}<div className="mt-4 flex flex-col sm:flex-row gap-2 justify-between items-center"><button onClick={() => setShowStreakQuizItemExplanation(!showStreakQuizItemExplanation)} className="text-sm text-sky-400 hover:text-sky-300 underline p-1 flex items-center"><HelpCircle size={16} className="mr-1"/> {showStreakQuizItemExplanation ? "Hide" : "Show"} Word Explanation</button>{attempted && (<button onClick={handleNextStreakQuizItem} className="bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center">{currentStreakQuizItemIndex < liveStreakQuizQueue.length - 1 ? (<>Next Question <ChevronRight size={20} className="ml-1"/></>) : (<>View Streak Summary <FileText size={18} className="ml-1"/></>)}</button>)}</div>{showStreakQuizItemExplanation && (<div className="mt-4 p-3 bg-slate-800 rounded prose prose-invert prose-sm max-w-none text-slate-300 leading-relaxed"><h4 className="font-semibold text-sky-400">Explanation for "{word}"</h4><p dangerouslySetInnerHTML={{ __html: originalExplanation.replace(/\n/g, '<br />') }} /></div>)}</div>);
        } else if (isViewingStreakQuizSummary) { const correctAnswers = liveStreakQuizQueue.filter(item => item.isCorrect).length; const totalAnswered = liveStreakQuizQueue.filter(item => item.attempted).length; return (<div className="bg-slate-700 p-4 sm:p-6 rounded-lg shadow-xl mt-1 text-slate-200 text-center"><h3 className="text-2xl font-bold text-sky-400 mb-4">Streak Quiz Summary</h3><p className="text-lg mb-2">You answered <span className="font-bold text-emerald-400">{correctAnswers}</span> out of <span className="font-bold text-sky-300">{totalAnswered}</span> questions correctly!</p><p className="text-lg mb-6">Points Earned: <span className="font-bold text-amber-400">{correctAnswers * 10}</span></p><button onClick={() => {setIsViewingStreakQuizSummary(false); setActiveContentMode('explain'); if(currentFocusWord) handleGenerateExplanation(currentFocusWord, false, false, false, 'explain');}} className="bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-6 rounded-lg">Done</button></div>);}
        else if (currentSingleWordQuiz && currentSingleWordQuiz.length > 0 && currentFocusWord) { const quizSet = currentSingleWordQuiz; const cq = quizSet[currentSingleWordQuizIdx]; if (!cq || !cq.options) return <p className="text-red-400">Error: Quiz data invalid.</p>; return (<div className="bg-slate-700 p-4 sm:p-6 rounded-lg shadow-xl mt-1 relative text-slate-200"><p className="text-sm text-slate-400 mb-2">Quiz for "{currentFocusWord}" (Question {currentSingleWordQuizIdx + 1} of {quizSet.length})</p><h3 className="text-lg font-semibold mb-4">{cq.question}</h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">{Object.entries(cq.options).map(([k, o]) => ( <button key={k} onClick={() => handleSingleWordQuizOptionSelect(k)} disabled={singleWordQuizAttempted} className={`p-3 rounded-lg text-left transition-all duration-200 ease-in-out ${singleWordSelectedOption === k ? (singleWordQuizFeedback?.isCorrect ? 'bg-green-500 hover:bg-green-600 ring-2 ring-green-400' : 'bg-red-500 hover:bg-red-600 ring-2 ring-red-400') : 'bg-slate-650 hover:bg-slate-600 focus:ring-2 focus:ring-sky-500'} ${singleWordQuizAttempted && 'cursor-not-allowed'}`}>{o}</button>))}</div>{singleWordQuizFeedback && (<div className={`p-3 rounded-md my-4 text-sm ${singleWordQuizFeedback.isCorrect ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>{singleWordQuizFeedback.message}{!singleWordQuizFeedback.isCorrect && cq.explanation && <p className="mt-1 text-xs">{cq.explanation}</p>}</div>)}{singleWordQuizAttempted && currentSingleWordQuizIdx < quizSet.length -1 && (<button onClick={handleNextSingleWordQuizQuestion} className="w-full sm:w-auto bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-4 rounded-lg mt-4">Next Question</button>)}{singleWordQuizAttempted && currentSingleWordQuizIdx === quizSet.length -1 && (<p className="text-center text-slate-400 mt-4 p-2">End of this quiz. Click 'Quiz' tab again for new questions.</p>)}</div>);}
        else if (isLoading && currentFocusWord) { return <div className="text-center p-10 text-slate-400">Generating quiz for "{currentFocusWord}"...</div>; }
        else if (currentFocusWord) { return <div className="text-center p-10 text-slate-400">Click 'Quiz' tab to get questions for "{currentFocusWord}".</div>;}
        else { return <div className="text-center p-10 text-slate-400">Explore a word to start a quiz!</div>;}
    }
    if (!wordToUse && isLoading) return <div className="text-center p-10 text-slate-400">Loading...</div>;
    if (!wordToUse) return <div className="text-center p-10 text-slate-400 text-lg">Enter a word or concept to begin!</div>;
    const wordIdForContent = sanitizeWordForId(wordToUse); const contentItem = generatedContent[wordIdForContent]; 
    let modeContentAvailable = false;
    if (contentItem) {
        if (activeContentMode === 'explain') modeContentAvailable = typeof contentItem.explanation === 'string' && contentItem.explanation.length > 0;
        else if (activeContentMode === 'fact') modeContentAvailable = typeof contentItem.fact === 'string' && contentItem.fact.length > 0;
        else if (activeContentMode === 'deep_dive') modeContentAvailable = typeof contentItem.deep_dive === 'string' && contentItem.deep_dive.length > 0;
        else if (activeContentMode === 'image') modeContentAvailable = (typeof contentItem.image_url === 'string' && contentItem.image_url.length > 0) || (typeof contentItem.image_prompt === 'string' && contentItem.image_prompt.length > 0);
    }
    if (isLoading && !modeContentAvailable) return <div className="text-center p-10 text-slate-400">Generating {activeContentMode} for "{wordToUse}"...</div>;
    if (error && !modeContentAvailable) return <div className="text-center p-10 text-red-400">Error: {error}</div>;
    if (!contentItem && activeContentMode !== 'explain') return <div className="text-center p-10 text-slate-400">No content for "{wordToUse}" yet. Try generating.</div>;
    if (!modeContentAvailable && !isLoading && activeContentMode !== 'explain') { return <div className="text-center p-10 text-slate-400">No {activeContentMode} content for "{wordToUse}". Try generating.</div>;}
    const currentIsFavorite = contentItem?.is_favorite || false;
    const renderClickableText = (text: string | undefined) => { if (!text) return null; const parts = text.split(/(<click>.*?<\/click>)/g); return parts.map((part, index) => { const clickMatch = part.match(/<click>(.*?)<\/click>/); if (clickMatch && clickMatch[1]) { const subTopic = clickMatch[1]; return ( <button key={`${subTopic}-${index}`} onClick={() => handleSubTopicClick(subTopic)} className="text-sky-400 hover:text-sky-300 underline font-semibold transition-colors mx-1" title={`Explore: ${subTopic}`} > {subTopic} </button> );} return <span key={`text-${index}`} dangerouslySetInnerHTML={{ __html: part.replace(/\n/g, '<br />') }} />; });};
    let modeContentElement = null;
    switch (activeContentMode) {
      case 'explain': modeContentElement = contentItem?.explanation ? (<div className="prose prose-invert prose-sm sm:prose-base max-w-none text-slate-200 leading-relaxed">{renderClickableText(contentItem.explanation)}</div>) : (isLoading ? <p>Generating explanation...</p> : <p>No explanation available. Click 'Explain' to generate.</p>); break;
      case 'fact': modeContentElement = contentItem?.fact ? <p className="text-lg text-amber-300 italic leading-relaxed">{renderClickableText(contentItem.fact)}</p> : <p>No fact.</p>; break;
      case 'image': modeContentElement = (<div>{(contentItem?.image_url?.length)?(<img src={contentItem.image_url} alt={`For ${wordToUse}`} className="rounded-lg shadow-lg mx-auto max-w-full h-auto max-h-[400px] object-contain"/>):(contentItem?.image_prompt?.length)?(<p className="text-slate-400 italic">{contentItem.image_prompt}</p>):(<p>No image.</p>)}</div>); break;
      case 'deep_dive': modeContentElement = contentItem?.deep_dive ? <div className="prose prose-invert max-w-none text-slate-200 leading-relaxed">{renderClickableText(contentItem.deep_dive)}</div> : <p>No deep dive.</p>; break;
      default: modeContentElement = <p>Select a mode to view content.</p>; 
    }
    return ( <div key={wordToUse + activeContentMode} className="bg-slate-700 p-4 sm:p-6 rounded-lg shadow-xl mt-1 relative"> <div className="absolute top-3 right-3 flex items-center space-x-2"> <button onClick={() => handleToggleFavorite(wordToUse, currentIsFavorite)} className={`p-1.5 rounded-full hover:bg-slate-600 transition-colors ${currentIsFavorite?'text-pink-500':'text-slate-400'}`} title={currentIsFavorite?"Unfavorite":"Favorite"}><Heart size={20} fill={currentIsFavorite?'currentColor':'none'}/></button> {activeContentMode==='explain'&&(<button onClick={handleRefreshContent} className="p-1.5 rounded-full text-slate-400 hover:text-sky-300 hover:bg-slate-600 transition-colors" title={`Regen ${activeContentMode}`}><RefreshCw size={18}/></button>)} </div> <h2 className="text-2xl sm:text-3xl font-bold text-sky-400 mb-4 capitalize">{wordToUse} - <span className="text-sky-500">{activeContentMode}</span></h2> {modeContentElement} </div> );
  };

  const modeButtons: { mode: ContentMode; label: string; icon: React.ElementType }[] = [ 
    { mode: 'explain', label: 'Explain', icon: MessageSquareQuote }, { mode: 'quiz', label: 'Quiz', icon: Lightbulb },
    { mode: 'fact', label: 'Fact', icon: Sparkles }, { mode: 'image', label: 'Image', icon: ImageIcon },
    { mode: 'deep_dive', label: 'Deep Dive', icon: Brain },
  ];
  const unattemptedStreakQuizCount = liveStreakQuizQueue.filter(item => !item.attempted).length;

  return ( 
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <header className="bg-slate-800 shadow-md p-3 sm:p-4 sticky top-0 z-40"> <div className="container mx-auto flex justify-between items-center max-w-6xl"> <div className="text-2xl sm:text-3xl font-bold text-sky-400 cursor-pointer hover:text-sky-300 transition-colors" onClick={() => { setActiveView('main'); setActiveContentMode('explain'); setIsViewingStreakQuizSummary(false); }} title="Tiny Tutor Home" > Tiny Tutor AI </div> <div className="flex items-center space-x-2 sm:space-x-3"> {currentUser ? ( <> <span className="text-sm sm:text-base hidden md:inline">Hi, {currentUser.username}!</span> <button onClick={() => { if (activeView === 'profile') {setActiveView('main'); setActiveContentMode('explain');} else { if (authToken) fetchUserProfile(authToken); setActiveView('profile');} setIsViewingStreakQuizSummary(false);}} className={`p-2 rounded-full hover:bg-slate-700 transition-colors ${activeView === 'profile' ? 'text-sky-400 bg-slate-700' : 'text-slate-300'}`} title={activeView === 'profile' ? "Back to Explorer" : "View Profile"} > {activeView === 'profile' ? <Home size={20} /> : <User size={20} />} </button> <button onClick={handleLogout} className="p-2 rounded-full text-slate-300 hover:bg-slate-700 hover:text-red-400 transition-colors" title="Logout"> <LogOut size={20} /> </button> </> ) : ( <button onClick={() => { setShowAuthModal(true); setAuthMode('login');}} className="p-2 rounded-full text-slate-300 hover:bg-slate-700 hover:text-sky-400 transition-colors" title="Login/Signup"> <LogIn size={20} /> </button> )} </div> </div> </header>
      {activeView === 'main' && ( <main className="container mx-auto p-3 sm:p-4 md:p-6 flex-grow max-w-3xl w-full"> 
        <form onSubmit={(e) => { e.preventDefault(); handleGenerateExplanation(inputValue, true, false, false, 'explain'); }} className="mb-6 flex flex-col sm:flex-row items-stretch gap-2"> 
            <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Enter a word or concept (e.g., photosynthesis)" className="flex-grow p-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none placeholder-slate-500" /> 
            <button type="submit" disabled={isLoading || !inputValue.trim()} className="bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 px-4 sm:px-6 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50" > <BookOpen size={20} className="mr-2 hidden sm:inline" /> Generate </button> 
        </form> 
        {error && !isLoading && <div className="bg-red-500/20 text-red-400 p-3 rounded-md mb-4 text-sm animate-fadeIn">{error}</div>} 
        {liveStreak && liveStreak.score > 0 && currentFocusWord && ( <div className="mb-4 p-3 bg-slate-800 rounded-lg shadow text-sm text-emerald-400"> <span className="font-semibold">Live Streak: {liveStreak.score} </span> <span>({liveStreak.words.map((word, index) => ( <React.Fragment key={word + index}> <span className={`cursor-pointer hover:text-emerald-300 ${getDisplayWord() === word ? 'font-bold underline' : ''}`} onClick={() => handleStreakWordClick(word)} title={`Review: ${word}`} >{word}</span> {index < liveStreak.words.length - 1 && ' → '} </React.Fragment> ))} ) </span> {isReviewingStreakWord && wordForReview && <span className="ml-2 text-xs text-slate-400">(Reviewing: {wordForReview})</span>} </div> )} 
        {(getDisplayWord() || (activeContentMode === 'quiz' && liveStreakQuizQueue.length > 0)) && (
             <div className="mb-6 flex flex-wrap justify-center gap-2 sm:gap-3"> 
                {modeButtons.map(({ mode, label, icon: Icon }) => ( 
                    <button key={mode} onClick={() => handleModeChange(mode)} disabled={isLoading && activeContentMode !== mode && !(mode === 'quiz' && liveStreakQuizQueue.length > 0)} className={`relative flex items-center py-2 px-3 sm:px-4 rounded-lg text-sm font-medium transition-all duration-200 ease-in-out transform hover:scale-105 ${activeContentMode === mode ? 'bg-sky-500 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-sky-300'} disabled:opacity-70 disabled:cursor-not-allowed`} title={label} >
                        <Icon size={16} className="mr-1.5" /> {label}
                        {mode === 'quiz' && unattemptedStreakQuizCount > 0 && (<span className="absolute -top-2 -right-2 bg-pink-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">{unattemptedStreakQuizCount}</span>)}
                    </button> 
                ))} 
            </div>
        )} 
        <div className="animate-fadeIn">{renderContent()}</div> 
      </main> )}
      {activeView === 'profile' && currentUser && userProfileData && ( <ProfilePageComponent currentUser={currentUser} userProfileData={userProfileData} onWordSelect={handleWordSelectionFromProfile} onToggleFavorite={handleToggleFavorite} onNavigateBack={() => {setActiveView('main'); setActiveContentMode('explain');}} generatedContent={generatedContent} /> )}
      {activeView === 'profile' && (isLoading || isFetchingProfile) && !userProfileData && ( <div className="flex-grow flex items-center justify-center text-slate-400">Loading profile...</div> )}
      {activeView === 'profile' && !currentUser && !isFetchingProfile && ( <div className="flex-grow flex flex-col items-center justify-center text-slate-400 p-6"> <p className="mb-4 text-lg">Please log in to view your profile.</p> <button onClick={() => { setShowAuthModal(true); setAuthMode('login');}} className="bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors" >Login</button> </div> )}
      {renderAuthModal()}
      <footer className="bg-slate-800 text-center p-4 text-xs text-slate-500 border-t border-slate-700 mt-auto"> © {new Date().getFullYear()} Tiny Tutor AI. All rights reserved. </footer>
    </div>
  );
}
export default App;


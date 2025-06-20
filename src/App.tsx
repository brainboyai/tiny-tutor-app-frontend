import React, { useState, useEffect, useCallback, FormEvent, useRef } from 'react';
import {
  Heart, LogOut, RefreshCw, Sparkles, SendHorizontal, User, X,
  Settings, Menu, Plus, Flame, HelpCircle, Mic, BookText, FileText, Gamepad2, Lock, AlertTriangle
} from 'lucide-react';
import './App.css';
import './index.css';
import ProfilePageComponent from './ProfilePage.tsx';
import StoryModeComponent from './StoryMode.tsx';
import GameModeComponent from './GameMode.tsx';
import SettingsPageComponent from './SettingsPage.tsx';
import WebContextDisplay from './WebContextDisplay.tsx'; // Import the new Web Context component

// --- Types and Helpers ---
interface CurrentUser { username: string; email: string; id: string; }
interface ParsedQuizQuestion { question: string; options: { [key: string]: string }; correctOptionKey: string; explanation?: string; }
interface GeneratedContentItem { explanation?: string; imageUrl?: string; is_favorite?: boolean; first_explored_at?: string; last_explored_at?: string; }
interface GeneratedContent { [wordId: string]: GeneratedContentItem; }
interface LiveStreak { score: number; words: string[]; }
interface StreakRecord { id: string; words: string[]; score: number; completed_at: string; }
interface ExploredWordEntry { word: string; last_explored_at: string; is_favorite: boolean; first_explored_at?: string; }
interface UserProfileData { username: string; email: string; tier?: string; totalWordsExplored: number; exploredWords: ExploredWordEntry[]; favoriteWords: ExploredWordEntry[]; streakHistory: StreakRecord[]; quiz_points?: number; total_quiz_questions_answered?: number; total_quiz_questions_correct?: number; }
interface StreakQuizItem { word: string; originalExplanation: string; quizQuestion: ParsedQuizQuestion; attempted: boolean; selectedOptionKey?: string; isCorrect?: boolean; }
interface WebContextItem { type: 'read' | 'watch' | 'service' | 'info'; title: string; snippet: string; url: string; }
const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';
const sanitizeWordForId = (word: string): string => { if (typeof word !== 'string') return "invalid_word_input"; return word.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''); };
const parseQuizStringToArray = (quizStringsFromBackend: any): ParsedQuizQuestion[] => { if (!Array.isArray(quizStringsFromBackend)) { return []; } return quizStringsFromBackend.map((quizStr: string) => { if (typeof quizStr !== 'string') { return null; } const lines = quizStr.trim().split('\n').map(line => line.trim()).filter(line => line); if (lines.length < 3) return null; let question = ""; const options: { [key: string]: string } = {}; let correctOptionKey = ""; let explanationForAnswer = ""; let parsingState: 'question' | 'options' | 'answer' | 'explanation' = 'question'; let questionLines: string[] = []; for (const line of lines) { const questionMatch = line.match(/^\*\*Question \d*:\*\*(.*)/i); if (questionMatch) { if (questionLines.length > 0 && !question) question = questionLines.join(" ").trim(); questionLines = []; question = questionMatch[1].trim(); parsingState = 'options'; continue; } const optionMatch = line.match(/^([A-D])\)\s*(.*)/i); if (optionMatch) { if (parsingState === 'question') { question = questionLines.join(" ").trim(); questionLines = []; } options[optionMatch[1].toUpperCase()] = optionMatch[2].trim(); continue; } const correctMatch = line.match(/^Correct Answer:\s*([A-D])/i); if (correctMatch) { if (parsingState === 'question') { question = questionLines.join(" ").trim(); questionLines = []; } correctOptionKey = correctMatch[1].toUpperCase(); parsingState = 'explanation'; explanationForAnswer = ""; continue; } const explanationKeywordMatch = line.match(/^Explanation:\s*(.*)/i); if (explanationKeywordMatch) { if (parsingState === 'question') { question = questionLines.join(" ").trim(); questionLines = []; } explanationForAnswer = explanationKeywordMatch[1].trim(); parsingState = 'explanation'; continue; } if (parsingState === 'question') { questionLines.push(line); } else if (parsingState === 'explanation') { explanationForAnswer += " " + line.trim(); } } if (questionLines.length > 0 && !question) question = questionLines.join(" ").trim(); explanationForAnswer = explanationForAnswer.trim(); if (!question || Object.keys(options).length < 2 || !correctOptionKey || !options[correctOptionKey]) { return null; } return { question, options, correctOptionKey, explanation: explanationForAnswer || undefined }; }).filter(q => q !== null) as ParsedQuizQuestion[]; };

function App() {
  // --- State Definitions ---
  const [activeView, setActiveView] = useState<'main' | 'profile' | 'settings'>('main');
  const [isResumingFromRateLimit, setIsResumingFromRateLimit] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [currentFocusWord, setCurrentFocusWord] = useState<string | null>(null);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>('en');
  const [startMode, setStartMode] = useState<'explore_mode' | 'story_mode' | 'game_mode'>('explore_mode');
  const [activeGameMode, setActiveGameMode] = useState<'explore_mode' | 'story_mode' | 'game_mode' | null>(null);
  const [activeTopic, setActiveTopic] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
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
  const [liveStreakQuizQueue, setLiveStreakQuizQueue] = useState<StreakQuizItem[]>([]);
  const [currentStreakQuizItemIndex, setCurrentStreakQuizItemIndex] = useState<number>(0);
  const [wordForReview, setWordForReview] = useState<string | null>(null);
  const [isReviewingStreakWord, setIsReviewingStreakWord] = useState(false);
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);
  const [profileFetchFailed, setProfileFetchFailed] = useState(false);
  const [isQuizVisible, setIsQuizVisible] = useState(false);
  const [isInitialView, setIsInitialView] = useState(true);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningAction, setWarningAction] = useState<{ action: () => void } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const unattemptedStreakQuizCount = liveStreakQuizQueue.filter(item => !item.attempted).length;
  const [customApiKey, setCustomApiKey] = useState<string>(localStorage.getItem('customApiKey') || '');
  const [showRateLimitModal, setShowRateLimitModal] = useState(false);
  const [isApiKeyValidating, setIsApiKeyValidating] = useState(false);
  const [apiKeyValidationStatus, setApiKeyValidationStatus] = useState<{ message: string, type: 'success' | 'error' | 'idle' }>({ message: '', type: 'idle' });
  const [guestGenerations, setGuestGenerations] = useState<number>(() => {
    return parseInt(sessionStorage.getItem('guestGenerationCount') || '0', 10);
  });
  const [storyGuestGenerations, setStoryGuestGenerations] = useState<number>(() => {
    return parseInt(sessionStorage.getItem('storyGuestGenerationCount') || '0', 10);
  });
  const GUEST_GENERATION_LIMIT = 3;

  // Replace the single webContext state with a cache
  const [webContextCache, setWebContextCache] = useState<{ [key: string]: WebContextItem[] }>({});
  const [isWebContextLoading, setIsWebContextLoading] = useState(false);


  // --- Core Logic Functions ---
  const handleRateLimit = () => {
    setShowRateLimitModal(true);
  };

  const handleGuestLimitExceeded = (message: string) => {
    setAuthError(message);
    setShowAuthModal(true);
  };
    
  const getDisplayWord = useCallback(() => isReviewingStreakWord && wordForReview ? wordForReview : currentFocusWord, [isReviewingStreakWord, wordForReview, currentFocusWord]);
  const saveStreakToServer = useCallback(async (streakToSave: LiveStreak, token: string | null): Promise<StreakRecord[] | null> => { if (!token || !streakToSave || streakToSave.score < 2) return null; try { const response = await fetch(`${API_BASE_URL}/save_streak`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ words: streakToSave.words, score: streakToSave.score }), }); if (!response.ok) { console.error("Failed to save streak. Status:", response.status); return null; } const data = await response.json(); return data.streakHistory; } catch (err: any) { console.error('Error saving streak:', err.message); return null; }}, []);
  const handleLogout = useCallback(async () => {
    if (liveStreak && liveStreak.score >= 2 && authToken) {
      await saveStreakToServer(liveStreak, authToken);
    }
    localStorage.removeItem('authToken');
    localStorage.removeItem('customApiKey');
    localStorage.removeItem('tiny-tutor-language');
    sessionStorage.removeItem('storyModeState');
    sessionStorage.removeItem('storyPendingAction');
    sessionStorage.removeItem('explorePendingAction');
    sessionStorage.removeItem('tiny-tutor-guest-state');
    sessionStorage.removeItem('guestGenerationCount');
    sessionStorage.removeItem('storyGuestGenerationCount');
    setAuthToken(null);
    setCustomApiKey('');
    setCurrentUser(null);
    setUserProfileData(null);
    setLiveStreak(null);
    setCurrentFocusWord(null);
    setGeneratedContent({});
    setError(null);
    setAuthError(null);
    setAuthSuccessMessage(null);
    setShowAuthModal(false);
    setActiveView('main');
    setLiveStreakQuizQueue([]);
    setActiveGameMode(null);
    setActiveTopic(null);
    setIsInitialView(true);
    setGuestGenerations(0);
    setStoryGuestGenerations(0);
    setLanguage('en');
    setWebContextCache({});
  }, [liveStreak, authToken, saveStreakToServer]);
  const fetchUserProfile = useCallback(async (token: string | null) => { if (!token || profileFetchFailed) { setUserProfileData(null); setCurrentUser(null); return; } setIsFetchingProfile(true); try { const response = await fetch(`${API_BASE_URL}/profile`, { headers: { 'Authorization': `Bearer ${token}` }}); if (!response.ok) { if (response.status === 401) { handleLogout(); } else if (response.status === 429) { setError("API limit reached. Please wait and try again later.");} else { setError(`Profile fetch failed with status: ${response.status}`);}  setProfileFetchFailed(true); return; } const data = await response.json(); const pE: ExploredWordEntry[]=(data.exploredWords||[]).map((w:any)=>(w&&typeof w.word==='string'?{...w}:null)).filter(Boolean); const pF:ExploredWordEntry[]=(data.favoriteWords||[]).map((w:any)=>(w&&typeof w.word==='string'?{...w}:null)).filter(Boolean); setUserProfileData({...data, exploredWords: pE, favoriteWords: pF, streakHistory: (data.streakHistory||[]).sort((a:any,b:any)=>new Date(b.completed_at).getTime()-new Date(a.completed_at).getTime())}); setCurrentUser({username:data.username, email:data.email, id:data.user_id||''}); setError(null); setProfileFetchFailed(false);} catch(e){console.error("Profile fetch error:", e); setError("Could not connect to the server. Please check your connection."); setProfileFetchFailed(true);if(typeof e === 'string') setError(e); else if (e instanceof Error) setError(e.message)}finally{setIsFetchingProfile(false);}}, [profileFetchFailed, handleLogout]);
  useEffect(() => { const storedToken = localStorage.getItem('authToken'); if (storedToken) { if (!authToken) setAuthToken(storedToken); if (!currentUser && !isFetchingProfile && !profileFetchFailed) { fetchUserProfile(storedToken); } } else { setCurrentUser(null); setUserProfileData(null); setAuthToken(null); }}, [authToken, currentUser, isFetchingProfile, fetchUserProfile, profileFetchFailed]);
  const saveGuestStateToSession = () => { if (!authToken && liveStreak && liveStreak.words.length > 0) { const guestState = { liveStreak, liveStreakQuizQueue, currentFocusWord, generatedContent, activeTopic, isInitialView: false, }; sessionStorage.setItem('tiny-tutor-guest-state', JSON.stringify(guestState)); } };
  const handleAuthAction = async (e: FormEvent) => { e.preventDefault(); setAuthError(null); setAuthSuccessMessage(null); setIsLoading(true); const url = authMode === 'signup' ? `${API_BASE_URL}/signup` : `${API_BASE_URL}/login`; let payload = {}; if (authMode === 'signup') { payload = { username: authUsername, email: authEmail, password: authPassword }; } else { payload = { email_or_username: authUsername, password: authPassword };} try { const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const data = await response.json(); if (!response.ok) { throw new Error(data.error || 'Request failed');} if (authMode === 'signup') { setAuthSuccessMessage('Signup successful! Please login.'); setAuthMode('login'); setAuthEmail(''); setAuthPassword(''); } else { localStorage.setItem('authToken', data.access_token); setAuthToken(data.access_token); setCurrentUser({ username: data.user.username, email: data.user.email, id: data.user.id }); setShowAuthModal(false); setAuthSuccessMessage('Login successful!'); await fetchUserProfile(data.access_token); const savedStateJSON = sessionStorage.getItem('tiny-tutor-guest-state'); if (savedStateJSON) { const savedState = JSON.parse(savedStateJSON); setLiveStreak(savedState.liveStreak); setLiveStreakQuizQueue(savedState.liveStreakQuizQueue); setCurrentFocusWord(savedState.currentFocusWord); setGeneratedContent(savedState.generatedContent); setActiveTopic(savedState.activeTopic); setIsInitialView(savedState.isInitialView); sessionStorage.removeItem('tiny-tutor-guest-state'); } setAuthEmail(''); setAuthPassword(''); setAuthUsername(''); } } catch (err) { if (err instanceof Error) setAuthError(err.message); } finally { setIsLoading(false); if (authMode === 'signup') setAuthPassword(''); }};
  const handleSaveQuizAttempt = useCallback(async (word: string, isCorrect: boolean) => { if (!authToken) return; try { await fetch(`${API_BASE_URL}/save_quiz_attempt`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ word, is_correct: isCorrect, question_index: 0, selected_option_key: '' }), }); if (authToken) await fetchUserProfile(authToken); } catch (err: any) { console.error("Error saving quiz attempt stats:", err); }}, [authToken, fetchUserProfile]);
  
  const handleGenerateExplanation = useCallback(async (wordToFetch: string, isNewPrimaryWordSearch: boolean = false, isUserRefreshClick: boolean = false, isSubTopicClick: boolean = false) => {
    if (!wordToFetch.trim()) return;

    if (!authToken && guestGenerations >= GUEST_GENERATION_LIMIT) {
        handleGuestLimitExceeded("Sign in to continue exploring for free with your own API key.");
        return;
    }

    const wordId = sanitizeWordForId(wordToFetch);
    setError(null);
    setWebContextCache(prev => ({ ...prev, [wordId]: [] })); // Clear context for this word immediately

    if (isNewPrimaryWordSearch) {
        setIsInitialView(false);
        setActiveGameMode('explore_mode');
        setActiveTopic(wordToFetch);
        setLiveStreak({ score: 1, words: [wordToFetch] });
        setCurrentFocusWord(wordToFetch);
        setIsReviewingStreakWord(false);
        setLiveStreakQuizQueue([]);
        setCurrentStreakQuizItemIndex(0);
        setIsQuizVisible(false);
    } else if (isSubTopicClick) {
        setCurrentFocusWord(wordToFetch);
        setIsReviewingStreakWord(false);
    }
    setIsLoading(true);
    let streakContextForAPI: string[] = [];
    if (isSubTopicClick && liveStreak) {
        streakContextForAPI = [...liveStreak.words];
    }
    const isActuallyContextualExplain = streakContextForAPI.length > 0;
    if (!isUserRefreshClick && authToken && generatedContent[wordId]?.explanation && !isActuallyContextualExplain) {
        if(isNewPrimaryWordSearch && (!liveStreak || !liveStreak.words.includes(wordToFetch))) {
            setLiveStreak({ score: 1, words: [wordToFetch] });
        } else if (isSubTopicClick && liveStreak) {
            setLiveStreak(prev => prev ? { score: prev.score + 1, words: [...prev.words, wordToFetch] } : { score: 1, words: [wordToFetch] });
        }
        setIsLoading(false);
        return;
    }
    const RATE_LIMIT_ERROR_MESSAGE = "Free daily limit reached.";
    try {
        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        if (authToken) { headers['Authorization'] = `Bearer ${authToken}`; }
        if (customApiKey) { headers['X-User-API-Key'] = customApiKey; }
        const requestBody = { word: wordToFetch, mode: 'explain', refresh_cache: isUserRefreshClick || isActuallyContextualExplain, streakContext: streakContextForAPI, language: language };
        const response = await fetch(`${API_BASE_URL}/generate_explanation`, { method: 'POST', headers: headers, body: JSON.stringify(requestBody) });
        if (!response.ok) {
            if (response.status === 429) {
                const pendingAction = { wordToFetch, isNewPrimaryWordSearch, isUserRefreshClick, isSubTopicClick };
                sessionStorage.setItem('explorePendingAction', JSON.stringify(pendingAction));
                handleRateLimit(); 
                throw new Error(RATE_LIMIT_ERROR_MESSAGE);
            }
            throw new Error((await response.json()).error || 'Failed to generate content');
        }
        
        sessionStorage.removeItem('explorePendingAction');

        if (!authToken) {
            const newCount = guestGenerations + 1;
            setGuestGenerations(newCount);
            sessionStorage.setItem('guestGenerationCount', String(newCount));
        }

        const apiData = await response.json();
        const explanationJustFetched = apiData.explain;
        const imageUrlFetched = apiData.image_url; // <-- Grab the new image URL
        const isNewWordBeingAddedToStreak = isNewPrimaryWordSearch || (isSubTopicClick && (!liveStreak || !liveStreak.words.includes(wordToFetch)));
        if (isNewWordBeingAddedToStreak && !isNewPrimaryWordSearch) { setLiveStreak(prev => prev ? { score: prev.score + 1, words: [...prev.words, wordToFetch] } : { score: 1, words: [wordToFetch] }); }
        setGeneratedContent(prev => { const existing = prev[wordId] || {}; const newGC: GeneratedContentItem = {...existing, explanation: explanationJustFetched, imageUrl: imageUrlFetched, is_favorite: apiData.is_favorite, first_explored_at: (prev[wordId]?.first_explored_at || new Date().toISOString()), last_explored_at: new Date().toISOString() }; return {...prev, [wordId]: newGC }; });
        
        setIsWebContextLoading(true);
        fetch(`${API_BASE_URL}/fetch_web_context`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ topic: wordToFetch }),
        })
        .then(res => res.json())
        .then(data => {
            if (data.web_context) {
              // Add the result to the cache instead of a single state
              setWebContextCache(prevCache => ({
                ...prevCache,
                [sanitizeWordForId(wordToFetch)]: data.web_context
              }));
            }
        })
        .catch(err => console.error("Failed to fetch web context:", err))
        .finally(() => setIsWebContextLoading(false));

        if (authToken && isNewPrimaryWordSearch && userProfileData) {
            const newWordEntry: ExploredWordEntry = { word: wordToFetch, last_explored_at: new Date().toISOString(), is_favorite: apiData.is_favorite, first_explored_at: new Date().toISOString() };
            const wordExists = userProfileData.exploredWords.some(w => w.word === wordToFetch);
            if (!wordExists) { setUserProfileData(prev => { if (!prev) return null; return { ...prev, exploredWords: [newWordEntry, ...prev.exploredWords], totalWordsExplored: prev.totalWordsExplored + 1, }; }); }
        }
        if (explanationJustFetched && isNewWordBeingAddedToStreak) {
            try {
                const quizResp = await fetch(`${API_BASE_URL}/generate_explanation`, { method: 'POST', headers: headers, body: JSON.stringify({ word: wordToFetch, mode: 'quiz', explanation_text: explanationJustFetched, language: language, }) });
                if (quizResp.ok) { const streakQuizData = await quizResp.json(); const parsedQs = parseQuizStringToArray(streakQuizData.quiz); if (parsedQs.length > 0) { setLiveStreakQuizQueue(prevQ => [...prevQ, { word: wordToFetch, originalExplanation: explanationJustFetched, quizQuestion: parsedQs[0], attempted: false }]); } }
            } catch (qErr) { console.error("Error fetching streak quiz item:", qErr); }
        }
    } catch (err) {
        if (err instanceof Error && err.message !== RATE_LIMIT_ERROR_MESSAGE) { setError(err.message); } 
        else { console.error(err); }
    } finally {
        setIsLoading(false);
        if (isNewPrimaryWordSearch) setInputValue('');
    }
  }, [authToken, customApiKey, generatedContent, liveStreak, userProfileData, language, guestGenerations]);
  
  useEffect(() => {
    if (isResumingFromRateLimit) {
        if (activeGameMode === 'explore_mode' || (isInitialView && startMode === 'explore_mode')) {
            const pendingActionJSON = sessionStorage.getItem('explorePendingAction');
            if (pendingActionJSON) {
                const pendingAction = JSON.parse(pendingActionJSON);
                handleGenerateExplanation( pendingAction.wordToFetch, pendingAction.isNewPrimaryWordSearch, pendingAction.isUserRefreshClick, pendingAction.isSubTopicClick );
                sessionStorage.removeItem('explorePendingAction');
            }
        }
        setIsResumingFromRateLimit(false);
    }
  }, [isResumingFromRateLimit, activeGameMode, isInitialView, startMode, handleGenerateExplanation]);

  const handleStreakWordClick = useCallback((clickedWord: string) => {
    setIsQuizVisible(false);
    setCurrentFocusWord(clickedWord);
    setIsReviewingStreakWord(true);
    setWordForReview(clickedWord);

    const wordId = sanitizeWordForId(clickedWord);
    // Only fetch if not already in cache
    if (!webContextCache[wordId] || webContextCache[wordId].length === 0) {
      setIsWebContextLoading(true);
      fetch(`${API_BASE_URL}/fetch_web_context`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: clickedWord })
      })
      .then(res => res.json())
      .then(data => {
        setWebContextCache(prevCache => ({
          ...prevCache,
          [wordId]: data.web_context || []
        }));
      })
      .catch(err => console.error("Web context fetch failed for streak word", err))
      .finally(() => setIsWebContextLoading(false));
    }
  }, [webContextCache]);
  const handleSubTopicClick = useCallback((subTopic: string) => { setIsQuizVisible(false); if (liveStreak && liveStreak.words.includes(subTopic)) { handleStreakWordClick(subTopic); } else { handleGenerateExplanation(subTopic, false, false, true); } }, [liveStreak, handleGenerateExplanation, handleStreakWordClick]);
  const handleRefreshContent = useCallback(() => { const wordToUse = getDisplayWord(); if (!wordToUse) return; handleGenerateExplanation(wordToUse, false, true);}, [getDisplayWord, handleGenerateExplanation]);
  const handleToggleFavorite = useCallback(async (word: string, currentStatus: boolean) => { if (!authToken || !userProfileData) return; const wordId = sanitizeWordForId(word); setGeneratedContent(prev => ({...prev, [wordId]: { ...(prev[wordId] || {}), is_favorite: !currentStatus }})); setUserProfileData(prev => { if (!prev) return null; const updatedExplored = prev.exploredWords.map(w => w.word === word ? { ...w, is_favorite: !currentStatus } : w); const wordEntry = updatedExplored.find(w => w.word === word); let updatedFavorites = prev.favoriteWords.filter(fw => fw.word !== word); if (!currentStatus && wordEntry) { updatedFavorites = [wordEntry, ...updatedFavorites]; } return { ...prev, exploredWords: updatedExplored, favoriteWords: updatedFavorites, }; }); try { await fetch(`${API_BASE_URL}/toggle_favorite`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ word }) }); } catch (err: any) { console.error("Error toggling favorite:", err); if (authToken) await fetchUserProfile(authToken); } }, [authToken, userProfileData, fetchUserProfile]);
  const handleWordSelectionFromProfile = useCallback((word: string) => { const action = async () => { if (liveStreak && authToken) { const newHistory = await saveStreakToServer(liveStreak, authToken); if (newHistory && userProfileData) { setUserProfileData(prev => { if (!prev) return null; return { ...prev, streakHistory: newHistory }; }); } } setActiveView('main'); handleGenerateExplanation(word, true); }; if (liveStreak && liveStreak.score >= 2) { setWarningAction({ action }); setShowWarningModal(true); } else { action(); } }, [liveStreak, authToken, userProfileData, saveStreakToServer, handleGenerateExplanation]);
  const handlePopupQuizAnswer = (optionKey: string) => { const currentItem = liveStreakQuizQueue[currentStreakQuizItemIndex]; if (!currentItem || currentItem.attempted) return; const isCorrect = currentItem.quizQuestion.correctOptionKey === optionKey; handleSaveQuizAttempt(currentItem.word, isCorrect); setLiveStreakQuizQueue(prev => prev.map((item, index) => index === currentStreakQuizItemIndex ? { ...item, attempted: true, selectedOptionKey: optionKey, isCorrect } : item )); };
  useEffect(() => { const storedLang = localStorage.getItem('tiny-tutor-language'); if (storedLang) { setLanguage(storedLang); } }, []);
  const handleLanguageChange = (lang: string) => { setLanguage(lang); localStorage.setItem('tiny-tutor-language', lang); };
  const resetChat = useCallback(() => { const action = async () => { if (liveStreak && authToken && activeGameMode === 'explore_mode') { const newHistory = await saveStreakToServer(liveStreak, authToken); if (newHistory && userProfileData) { setUserProfileData(prev => ({...prev!, streakHistory: newHistory})); } } setInputValue(''); setCurrentFocusWord(null); setLiveStreak(null); setLiveStreakQuizQueue([]); setError(null); setIsReviewingStreakWord(false); setIsQuizVisible(false); setIsInitialView(true); setActiveGameMode(null); setActiveTopic(null); setWebContextCache({}); }; if (liveStreak && liveStreak.score >= 2 && activeGameMode === 'explore_mode') { setWarningAction({ action }); setShowWarningModal(true); } else { action(); } }, [liveStreak, authToken, saveStreakToServer, userProfileData, activeGameMode]);
  const confirmWarning = () => { if (warningAction) { warningAction.action(); } setShowWarningModal(false); setWarningAction(null); };
  const handleFormSubmit = (e: FormEvent) => { e.preventDefault(); if (!inputValue.trim()) return; if (startMode === 'explore_mode') { handleGenerateExplanation(inputValue, true); } else if (startMode === 'story_mode') { setIsInitialView(false); setActiveGameMode('story_mode'); setActiveTopic(inputValue); setInputValue(''); } else if (startMode === 'game_mode') { setIsInitialView(false); setActiveGameMode('game_mode'); setActiveTopic(inputValue); setInputValue(''); } };
  useEffect(() => { const handleBeforeUnload = (e: BeforeUnloadEvent) => { if (liveStreak && liveStreak.score >= 2 && authToken) {e.preventDefault(); e.returnValue = "Your live streak will end if the page is refreshed."; const data = JSON.stringify({ words: liveStreak.words, score: liveStreak.score }); const blob = new Blob([data], { type: 'application/json; charset=UTF-8' }); navigator.sendBeacon(`${API_BASE_URL}/save_streak`, blob); } }; window.addEventListener('beforeunload', handleBeforeUnload); return () => { window.removeEventListener('beforeunload', handleBeforeUnload); }; }, [liveStreak, authToken]);
  const showLoginModal = () => { saveGuestStateToSession(); setShowAuthModal(true); };

  const handleValidateAndSaveApiKey = async () => {
    if (!customApiKey) {
        localStorage.removeItem('customApiKey');
        setApiKeyValidationStatus({ message: 'Key removed from local storage.', type: 'success' });
        return;
    }
    setIsApiKeyValidating(true);
    setApiKeyValidationStatus({ message: '', type: 'idle' });
    try {
        const response = await fetch(`${API_BASE_URL}/validate_api_key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: customApiKey })
        });
        const data = await response.json();
        if (!response.ok) { throw new Error(data.message || 'Validation failed'); }
        localStorage.setItem('customApiKey', customApiKey);
        setApiKeyValidationStatus({ message: data.message, type: 'success' });
        setIsResumingFromRateLimit(true); 
        setTimeout(() => {
            setApiKeyValidationStatus({ message: '', type: 'idle' });
            setShowRateLimitModal(false); 
            setActiveView('main');
        }, 1500); 
    } catch (err) {
        if (err instanceof Error) { setApiKeyValidationStatus({ message: err.message, type: 'error' }); }
        else { setApiKeyValidationStatus({ message: 'An unknown error occurred.', type: 'error' }); }
    } finally {
        setIsApiKeyValidating(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!authToken) {
      alert("You must be logged in to delete your account.");
      return;
    }
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/delete_account`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${authToken}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to delete account.");
      alert("Account deleted successfully.");
      handleLogout();
    } catch (err) {
      if (err instanceof Error) alert(`Error: ${err.message}`);
      else alert("An unknown error occurred during account deletion.");
    } finally {
      setIsLoading(false);
    }
  };

  // --- RENDER FUNCTIONS ---
  const renderAuthModal = () => { if (!showAuthModal) return null; return (<div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-[--background-secondary] p-8 rounded-xl shadow-2xl w-full max-w-md relative"><button onClick={() => { setShowAuthModal(false); setAuthError(null); setAuthSuccessMessage(null);}} className="absolute top-4 right-4 text-[--text-tertiary] hover:text-[--text-primary]"><X size={24} /></button><h2 className="text-3xl font-bold text-center text-[--text-primary] mb-6">{authMode === 'login' ? 'Login' : 'Sign Up'}</h2>{authError && <p className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4 text-sm">{authError}</p>}{authSuccessMessage && <p className="bg-green-900/50 text-green-300 p-3 rounded-md mb-4 text-sm">{authSuccessMessage}</p>}<form onSubmit={handleAuthAction}>{authMode === 'signup' && ( <div className="mb-4"> <label className="block text-[--text-secondary] mb-1" htmlFor="signup-username">Username</label> <input type="text" id="signup-username" value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} className="w-full p-3 bg-[--background-input] border border-[--border-color] rounded-lg text-[--text-primary] focus:ring-2 focus:ring-[--accent-primary] outline-none" required /> </div> )}{authMode === 'signup' && ( <div className="mb-4"> <label className="block text-[--text-secondary] mb-1" htmlFor="signup-email">Email</label> <input type="email" id="signup-email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className="w-full p-3 bg-[--background-input] border border-[--border-color] rounded-lg text-[--text-primary] focus:ring-2 focus:ring-[--accent-primary] outline-none" required /> </div> )}{authMode === 'login' && ( <div className="mb-4"> <label className="block text-[--text-secondary] mb-1" htmlFor="login-identifier">Username or Email</label> <input type="text"  id="login-identifier" value={authUsername}  onChange={(e) => setAuthUsername(e.target.value)} className="w-full p-3 bg-[--background-input] border border-[--border-color] rounded-lg text-[--text-primary] focus:ring-2 focus:ring-[--accent-primary] outline-none" required /> </div> )}<div className="mb-6"> <label className="block text-[--text-secondary] mb-1" htmlFor="password">Password</label> <input type="password" id="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="w-full p-3 bg-[--background-input] border border-[--border-color] rounded-lg text-[--text-primary] focus:ring-2 focus:ring-[--accent-primary] outline-none" required /> </div><button type="submit" disabled={isLoading} className="w-full bg-[--accent-primary] hover:bg-[--accent-secondary] text-black font-semibold p-3 rounded-lg transition-colors disabled:opacity-50"> {isLoading ? 'Processing...' : (authMode === 'login' ? 'Login' : 'Sign Up')} </button></form><p className="text-center text-[--text-tertiary] mt-6 text-sm"> {authMode === 'login' ? ( <> Need an account? <button onClick={() => {setAuthMode('signup'); setAuthError(null); setAuthSuccessMessage(null); setAuthUsername(''); setAuthEmail(''); setAuthPassword('');}} className="text-[--accent-primary] hover:underline">Sign Up</button> </> ) : ( <> Already have an account? <button onClick={() => {setAuthMode('login'); setAuthError(null); setAuthSuccessMessage(null); setAuthUsername(''); setAuthEmail(''); setAuthPassword('');}} className="text-[--accent-primary] hover:underline">Login</button> </> )} </p></div></div>);};
  const renderExploreModeContent = () => {
    const wordToUse = getDisplayWord();
    if (isInitialView) {
      return (<div className="text-center text-4xl font-medium text-slate-500 flex flex-col items-center justify-center h-full pt-16 animate-fadeIn"><span className="p-4 bg-sky-500/10 rounded-full mb-4"><Sparkles size={32} className="text-sky-400"/></span><span>Enter a Concept or a Word you want to learn about</span></div>);
    }
    if (isLoading && !generatedContent[sanitizeWordForId(wordToUse!)]) {
      return <div className="text-center p-10 text-slate-400">Generating...</div>;
    }
    if (error) return <div className="text-center p-10 text-red-400">Error: {error}</div>;
    if (!wordToUse) return null;
    const wordId = sanitizeWordForId(wordToUse);
    const contentItem = generatedContent[wordId];
    if (!contentItem?.explanation) return null;
    const currentIsFavorite = contentItem?.is_favorite || false;
    const currentWebContext = webContextCache[wordId]; // Get context from cache
    const topicImageUrl = contentItem.imageUrl; // Get the image URL from state

    const renderClickableText = (text: string | undefined) => {
      if (!text) return null;
      const parts = text.split(/(<click>.*?<\/click>)/g);
      return parts.map((part, index) => {
        const clickMatch = part.match(/<click>(.*?)<\/click>/);
        if (clickMatch && clickMatch[1]) {
          const subTopic = clickMatch[1];
          return (
            <button key={`${subTopic}-${index}`} onClick={() => handleSubTopicClick(subTopic)} className="text-[--accent-primary] hover:text-[--accent-secondary] underline font-semibold transition-colors mx-1" title={`Explore: ${subTopic}`}>
              {subTopic}
            </button>
          );
        }
        return <span key={`text-${index}`} dangerouslySetInnerHTML={{ __html: part.replace(/\n/g, '<br />') }} />;
      });
    };
    return (
      
      <div className="bg-transparent p-1 animate-fadeIn">
        <div className="md:col-span-1">
            <div className="aspect-w-4 aspect-h-3 rounded-lg overflow-hidden bg-slate-800">
              {topicImageUrl ? (
                <img src={topicImageUrl} alt={wordToUse} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-800 to-slate-900">
                  <Sparkles className="w-10 h-10 text-slate-600" />
                </div>
              )}
            </div>
          </div>
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-2xl sm:text-3xl font-bold text-[--text-primary] capitalize">{wordToUse}</h2>
          {authToken && <div className="flex items-center space-x-2">
            <button onClick={() => handleToggleFavorite(wordToUse, currentIsFavorite)} className={`p-1.5 rounded-full hover:bg-[--hover-bg-color] transition-colors ${currentIsFavorite?'text-pink-500':'text-[--text-tertiary]'}`} title={currentIsFavorite?"Unfavorite":"Favorite"}><Heart size={20} fill={currentIsFavorite?'currentColor':'none'}/></button>
            <button onClick={handleRefreshContent} className="p-1.5 rounded-full text-[--text-tertiary] hover:text-[--text-primary] hover:bg-[--hover-bg-color] transition-colors" title="Regenerate Explanation"><RefreshCw size={18}/></button>
          </div>}
        </div>
        <div className="prose prose-invert max-w-none text-[--text-secondary] leading-relaxed text-lg">
          {renderClickableText(contentItem.explanation)}
        </div>
        <WebContextDisplay
          webContext={currentWebContext}
          isLoading={isWebContextLoading && (!currentWebContext || currentWebContext.length === 0)}
        />
      </div>
    );
  };
  const renderQuizPopup = () => { if (!isQuizVisible) return null; const currentItem = liveStreakQuizQueue[currentStreakQuizItemIndex]; if (!currentItem) return null; const { quizQuestion, attempted, selectedOptionKey } = currentItem; const isLastQuestion = currentStreakQuizItemIndex >= liveStreakQuizQueue.length - 1; const handleOptionClick = (key: string) => { if (!authToken) { showLoginModal(); return; } if (attempted) return; handlePopupQuizAnswer(key); }; return ( <div className="absolute top-4 right-4 w-full max-w-md bg-[--background-secondary] rounded-lg shadow-2xl p-6 z-20 border border-[--border-color] animate-fadeIn"> <div className="flex justify-between items-center mb-4"> <h3 className="font-semibold text-lg text-[--text-primary]"> {!authToken ? "Quiz Preview" : "Quiz Time!"} </h3> <button onClick={() => setIsQuizVisible(false)} className="text-[--text-tertiary] hover:text-[--text-primary]"><X size={20}/></button> </div> <p className="text-[--text-secondary] mb-1 text-sm">Question {currentStreakQuizItemIndex + 1} of {liveStreakQuizQueue.length} (for "{currentItem.word}")</p> <p className="text-[--text-primary] mb-4">{quizQuestion.question}</p> <div className="space-y-2"> {Object.entries(quizQuestion.options).map(([key, text]) => { let buttonColor = "bg-[--hover-bg-color] hover:bg-[--border-color]"; if (authToken && attempted) { if (key === quizQuestion.correctOptionKey) { buttonColor = "bg-green-800/80"; } else if (key === selectedOptionKey) { buttonColor = "bg-red-800/80"; } else { buttonColor = "bg-[--hover-bg-color] opacity-60"; } } return ( <button key={key} onClick={() => handleOptionClick(key)} disabled={!!(authToken && attempted)} className={`w-full text-left p-3 rounded-md transition-colors ${buttonColor} ${!authToken ? 'cursor-pointer hover:bg-[--border-color]' : 'disabled:cursor-not-allowed'}`} title={!authToken ? "Login to interact with the quiz" : ""}> {text} </button> ); })} </div> {(authToken && attempted) && ( <div className="flex justify-end mt-4"> {isLastQuestion ? ( <button onClick={() => setIsQuizVisible(false)} className="bg-sky-600 hover:bg-sky-500 text-white font-semibold py-2 px-4 rounded-md"> Finish </button> ) : ( <button onClick={() => setCurrentStreakQuizItemIndex(i => i + 1)} className="bg-[--accent-primary] text-black font-semibold py-2 px-4 rounded-md"> Next </button> )} </div> )} {!authToken && ( <div className="text-center mt-4 p-3 bg-amber-900/30 rounded-md"> <p className="text-amber-300 font-semibold">Please log in to solve quizzes and track your progress!</p> </div> )} </div> ); };
  const renderWarningModal = () => { if (!showWarningModal) return null; return ( <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"> <div className="bg-[--background-secondary] p-8 rounded-xl shadow-2xl w-full max-w-sm"> <h3 className="font-bold text-lg text-amber-400 mb-2">End Streak?</h3> <p className="text-[--text-secondary] mb-6">Your current streak progress will be lost. Are you sure you want to continue?</p> <div className="flex justify-end gap-4"> <button onClick={() => setShowWarningModal(false)} className="py-2 px-4 rounded-md text-sm hover:bg-[--hover-bg-color]">No, continue streak</button> <button onClick={confirmWarning} className="py-2 px-4 rounded-md text-sm bg-amber-600 hover:bg-amber-500 text-white font-semibold">Yes, end streak</button> </div> </div> </div> ); };
  const renderRateLimitModal = () => {
    if (!showRateLimitModal) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-[--background-secondary] p-8 rounded-xl shadow-2xl w-full max-w-md relative">
                <button onClick={() => setShowRateLimitModal(false)} className="absolute top-4 right-4 text-[--text-tertiary] hover:text-[--text-primary]"><X size={24} /></button>
                <div className="text-center">
                    <AlertTriangle className="mx-auto h-12 w-12 text-amber-400 mb-4" />
                    <h2 className="text-2xl font-bold text-center text-[--text-primary] mb-4">Daily Limit Reached</h2>
                    <p className="text-[--text-secondary] mb-6">You've used all your free generations for today. Provide your own key for unlimited use or upgrade to Pro.</p>
                </div>
                <div className="flex flex-col space-y-3">
                    <button 
                      onClick={() => { setShowRateLimitModal(false); setActiveView('settings'); }}
                      className="w-full bg-[--accent-primary] hover:bg-[--accent-secondary] text-black font-semibold p-3 rounded-lg transition-colors"
                    >
                        Use Your Own API Key
                    </button>
                    <button 
                      onClick={() => { alert("Upgrade to Pro coming soon!"); setShowRateLimitModal(false); }}
                      className="w-full bg-amber-600 hover:bg-amber-500 text-white font-bold p-3 rounded-lg transition-colors"
                    >
                        Upgrade to Pro
                    </button>
                </div>
            </div>
        </div>
    );
  };
  
  const renderMainContent = () => {
    if (activeView === 'profile') {
      return <ProfilePageComponent currentUser={currentUser!} userProfileData={userProfileData} onWordSelect={handleWordSelectionFromProfile} onNavigateBack={() => setActiveView('main')} onToggleFavorite={handleToggleFavorite} />;
    }
    if (activeView === 'settings') {
        return <SettingsPageComponent 
            onNavigateBack={() => setActiveView('main')}
            customApiKey={customApiKey}
            setCustomApiKey={setCustomApiKey}
            onValidateAndSaveApiKey={handleValidateAndSaveApiKey}
            isApiKeyValidating={isApiKeyValidating}
            apiKeyValidationStatus={apiKeyValidationStatus}
            onDeleteAccount={handleDeleteAccount}
        />;
    }
    if (activeGameMode === 'story_mode' && activeTopic) {
      return <StoryModeComponent 
        topic={activeTopic} 
        authToken={authToken} 
        onStoryEnd={resetChat} 
        language={language} 
        onRateLimitExceeded={handleRateLimit}
        isResuming={isResumingFromRateLimit}
        customApiKey={customApiKey}
        guestGenerations={storyGuestGenerations}
        setGuestGenerations={setStoryGuestGenerations}
        guestGenerationLimit={GUEST_GENERATION_LIMIT}
        onGuestLimitExceeded={handleGuestLimitExceeded}
      />;
    }
    if (activeGameMode === 'game_mode' && activeTopic) {
        return <div className="h-[calc(100vh-80px)] w-full"><GameModeComponent topic={activeTopic} authToken={authToken} onGameEnd={resetChat} /></div>;
    }
    return ( <div className="space-y-6"> {liveStreak && liveStreak.score > 0 && ( <div className="flex items-center gap-2 flex-wrap p-3 bg-gradient-to-r from-slate-800/50 to-slate-900/20 rounded-xl border border-slate-700/50"> <Flame className="text-orange-500 flex-shrink-0 animate-pulse" /> {liveStreak.words.map((word, index) => ( <React.Fragment key={word + index}> <button className={`py-1 px-3 rounded-full text-sm font-medium transition-all duration-300 shadow-md animate-fadeIn ${getDisplayWord() === word ? 'bg-sky-600 text-white' : 'bg-[--background-secondary] hover:bg-[--hover-bg-color]'}`} onClick={() => handleStreakWordClick(word)}> {word} </button> {index < liveStreak.words.length - 1 && <span className="text-slate-500">→</span>} </React.Fragment> ))} </div> )} {renderExploreModeContent()} </div> );
  };
  
  // --- Main Return Block ---
  return (
      <div className="flex h-dvh w-full bg-[--background-default] text-[--text-primary] font-sans">
        <aside className={`bg-[--background-secondary] flex-shrink-0 transition-all duration-300 flex flex-col ${isSidebarOpen ? 'w-64 p-2' : 'w-0 p-0'} overflow-hidden`}>
          <div className="flex-grow space-y-1">
            {currentUser && (
              <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center w-full p-2 rounded-md text-sm hover:bg-[--hover-bg-color]">
                  <div className="p-1 rounded-full bg-sky-500 text-white flex items-center justify-center h-8 w-8 mr-3 flex-shrink-0"> {currentUser.username.charAt(0).toUpperCase()} </div>
                  <span className="truncate font-semibold">{currentUser.username}</span>
              </button>
            )}
            <button onClick={resetChat} className="flex items-center w-full p-2 rounded-md text-sm hover:bg-[--hover-bg-color]"> <Plus size={16} className="mr-3"/> New Chat </button>
            {currentUser && (
              <>
                <button onClick={() => { setActiveView('profile'); }} className="flex items-center w-full p-2 rounded-md text-sm hover:bg-[--hover-bg-color]"> <User size={16} className="mr-3"/> Profile </button>
                <button onClick={() => setActiveView('settings')} className="flex items-center w-full p-2 rounded-md text-sm hover:bg-[--hover-bg-color]"> <Settings size={16} className="mr-3"/> Settings </button>
              </>
            )}
          </div>
          <div> {currentUser && ( <button onClick={() => { handleLogout(); }} className="flex items-center w-full p-2 rounded-md text-sm hover:bg-[--hover-bg-color]"> <LogOut size={16} className="mr-3"/> Logout </button> )} </div>
      </aside>
        <div className="flex flex-col flex-grow h-full max-h-screen">
          <header className="flex items-center p-2 pr-4 flex-shrink-0 border-b border-[--border-color]">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-full hover:bg-[--hover-bg-color]"> <Menu size={20} /> </button>
            <h1 className="text-lg font-medium ml-2 truncate">{activeView === 'profile' ? 'Profile' : activeView === 'settings' ? 'Settings' : (activeTopic || getDisplayWord() || "Tiny Tutor AI")}</h1>
            <div className="ml-4"> <select value={language} onChange={(e) => handleLanguageChange(e.target.value)} className="bg-transparent border border-gray-600 rounded-md p-1 text-sm"> <option value="en">English</option> <option value="es">Español</option> <option value="fr">Français</option> <option value="zh">中文</option> <option value="hi">हिन्दी</option> <option value="te">తెలుగు</option> </select> </div>
            <div className="ml-auto"> {!currentUser && ( <button onClick={showLoginModal} className="bg-[#a8c7fa] hover:bg-[#89b4fa] text-black font-semibold py-1.5 px-5 rounded-full transition-colors text-sm"> Sign in </button> )} </div>
        </header>

          <div className="flex-grow flex flex-col relative overflow-hidden">
            <main className="flex-grow overflow-y-auto">
                <div className="max-w-4xl mx-auto px-4 pt-8 pb-48"> {renderMainContent()} <div ref={chatEndRef} /> </div>
                {renderQuizPopup()}
            </main>
            {activeView === 'main' && activeGameMode === null && ( <div className={`absolute bottom-0 left-0 w-full p-4 bg-gradient-to-t from-[--background-default] to-transparent`}> <div className="max-w-4xl mx-auto"> <form onSubmit={handleFormSubmit} className="bg-[--background-input] rounded-3xl p-4 flex flex-col shadow-lg border border-transparent focus-within:border-[--accent-primary] transition-colors"> <div className="flex items-center w-full"> <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder={startMode === 'explore_mode' ? "Enter a word to explore..." : startMode === 'story_mode' ? "Enter a topic for a story..." : "Enter a topic for a game..."} className="w-full bg-transparent px-2 focus:outline-none text-lg" disabled={activeGameMode !== null} /> {inputValue.trim() && activeGameMode === null ? ( <button type="submit" disabled={isLoading} className="p-2 rounded-full bg-[--hover-bg-color] disabled:opacity-50 disabled:cursor-not-allowed"> <SendHorizontal size={22} /> </button> ) : ( <div className="p-2 text-[--text-tertiary]"> <Mic size={22} /> </div> )} </div> <div className="flex items-center gap-4 mt-3"> <button type="button" onClick={() => setStartMode('explore_mode')} disabled={activeGameMode !== null} className={`flex items-center gap-2 py-1 px-3 rounded-lg text-sm font-medium transition-colors ${ startMode === 'explore_mode' ? 'bg-[--accent-primary] text-black' : 'text-[--text-secondary] hover:bg-[--hover-bg-color] hover:text-[--text-primary]' } disabled:opacity-50 disabled:cursor-not-allowed`} > <BookText size={16} /> Explore Mode </button> <button type="button" onClick={() => setStartMode('story_mode')} disabled={activeGameMode !== null} className={`flex items-center gap-2 py-1 px-3 rounded-lg text-sm font-medium transition-colors ${ startMode === 'story_mode' ? 'bg-[--accent-primary] text-black' : 'text-[--text-secondary] hover:bg-[--hover-bg-color] hover:text-[--text-primary]' } disabled:opacity-50 disabled:cursor-not-allowed`} > <FileText size={16} /> Story Mode </button> <button type="button" onClick={() => setStartMode('game_mode')} disabled={activeGameMode !== null} className={`flex items-center gap-2 py-1 px-3 rounded-lg text-sm font-medium transition-colors ${ startMode === 'game_mode' ? 'bg-[--accent-primary] text-black' : 'text-[--text-secondary] hover:bg-[--hover-bg-color] hover:text-[--text-primary]' } disabled:opacity-50 disabled:cursor-not-allowed`} > <Gamepad2 size={16} /> Game Mode </button> </div> </form> </div> </div> )}
          </div>
        </div>
        {renderRateLimitModal()}
        {showAuthModal && renderAuthModal()}
        {renderWarningModal()}
        {activeGameMode === 'explore_mode' && !isInitialView && unattemptedStreakQuizCount > 0 && ( <button onClick={() => setIsQuizVisible(true)} className="fixed bottom-10 right-10 z-30 flex items-center justify-center h-16 w-16 bg-sky-600 text-white rounded-full shadow-lg hover:bg-sky-500 transition-all transform hover:scale-110" title={authToken ? `${unattemptedStreakQuizCount} questions available` : "Login to access quizzes"} > {authToken ? <HelpCircle size={32} /> : <Lock size={28} />} <span className="absolute -top-1 -right-1 bg-pink-500 text-white text-xs font-bold rounded-full h-6 w-6 flex items-center justify-center border-2 border-[--background-default]"> {unattemptedStreakQuizCount} </span> </button> )}
      </div>
  );
}

export default App;
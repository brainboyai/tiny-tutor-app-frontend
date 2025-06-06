import { useState, useEffect, useCallback, FormEvent, useRef } from 'react';
import {
  Heart, Lightbulb, LogIn, LogOut, RefreshCw, Sparkles, User, X,
  MessageSquareQuote, Home, HelpCircle, ChevronRight, CheckCircle, XCircle, FileText, Settings, Menu, Plus
} from 'lucide-react';
import './App.css';
import './index.css';
import ProfilePageComponent from './ProfilePage';

// --- Types (No Changes) ---
interface CurrentUser { username: string; email: string; id: string; }
interface ParsedQuizQuestion { question: string; options: { [key: string]: string }; correctOptionKey: string; explanation?: string; originalString?: string; }
interface GeneratedContentItem { explanation?: string; is_favorite?: boolean; first_explored_at?: string; last_explored_at?: string; modes_generated?: string[]; }
interface GeneratedContent { [wordId: string]: GeneratedContentItem; }
interface LiveStreak { score: number; words: string[]; }
interface StreakRecord { id: string; words: string[]; score: number; completed_at: string; }
interface ExploredWordEntry { word: string; last_explored_at: string; is_favorite: boolean; first_explored_at?: string; }
interface UserProfileData { username: string; email: string; totalWordsExplored: number; exploredWords: ExploredWordEntry[]; favoriteWords: ExploredWordEntry[]; streakHistory: StreakRecord[]; quiz_points?: number; total_quiz_questions_answered?: number; total_quiz_questions_correct?: number; }
type ContentMode = 'explain' | 'quiz';
interface StreakQuizItem { word: string; originalExplanation: string; quizQuestion: ParsedQuizQuestion; attempted: boolean; selectedOptionKey?: string; isCorrect?: boolean; }

const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';

// --- Helper Functions (No Changes) ---
const sanitizeWordForId = (word: string): string => { if (typeof word !== 'string') return "invalid_word_input"; return word.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''); };
const parseQuizStringToArray = (quizStringsFromBackend: any): ParsedQuizQuestion[] => { if (!Array.isArray(quizStringsFromBackend)) { return []; } return quizStringsFromBackend.map((quizStr: string, index: number) => { if (typeof quizStr !== 'string') { return null;  } const lines = quizStr.trim().split('\n').map(line => line.trim()).filter(line => line); if (lines.length < 3 && !lines.some(l => l.startsWith("**Question"))) { if(lines.length > 0 && lines.some(l => l.includes("A)") || l.includes("B)"))) {} else { return null;} } let question = ""; const options: { [key: string]: string } = {}; let correctOptionKey = ""; let explanationForAnswer = ""; let parsingState: 'question' | 'options' | 'answer' | 'explanation' = 'question'; let questionLines: string[] = []; for (const line of lines) { const questionMatch = line.match(/^\*\*Question \d*:\*\*(.*)/i); if (questionMatch) { if (questionLines.length > 0 && !question) question = questionLines.join(" ").trim(); questionLines = []; question = questionMatch[1].trim(); parsingState = 'options'; continue; } const optionMatch = line.match(/^([A-D])\)\s*(.*)/i); if (optionMatch) { if (parsingState === 'question' && questionLines.length > 0) { question = questionLines.join(" ").trim(); questionLines = []; } options[optionMatch[1].toUpperCase()] = optionMatch[2].trim(); parsingState = 'options'; continue; } const correctMatch = line.match(/^Correct Answer:\s*([A-D])/i); if (correctMatch) { if (parsingState === 'question' && questionLines.length > 0) { question = questionLines.join(" ").trim(); questionLines = []; } correctOptionKey = correctMatch[1].toUpperCase(); parsingState = 'explanation'; explanationForAnswer = ""; continue; } const explanationKeywordMatch = line.match(/^Explanation:\s*(.*)/i); if (explanationKeywordMatch) { if (parsingState === 'question' && questionLines.length > 0) { question = questionLines.join(" ").trim(); questionLines = []; } explanationForAnswer = explanationKeywordMatch[1].trim(); parsingState = 'explanation'; continue; } if (parsingState === 'question') { questionLines.push(line); } else if (parsingState === 'explanation') { explanationForAnswer += (explanationForAnswer ? " " : "") + line.trim(); } } if (questionLines.length > 0 && !question) question = questionLines.join(" ").trim(); explanationForAnswer = explanationForAnswer.trim(); if (!question || Object.keys(options).length < 2 || !correctOptionKey || !options[correctOptionKey]) { return question ? { question, options: options || {}, correctOptionKey: correctOptionKey || '', explanation: explanationForAnswer || undefined, originalString: quizStr } : null; } return { question, options, correctOptionKey, explanation: explanationForAnswer || undefined, originalString: quizStr }; }).filter(q => q !== null) as ParsedQuizQuestion[]; };

function App() {
  // --- State (No Changes) ---
  const [inputValue, setInputValue] = useState('');
  const [currentFocusWord, setCurrentFocusWord] = useState<string | null>(null);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeContentMode, setActiveContentMode] = useState<ContentMode>('explain');
  const [startMode, setStartMode] = useState<'word_game' | 'story_mode'>('word_game');
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
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
  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- Logic Functions (No Changes) ---
  const getDisplayWord = useCallback(() => isReviewingStreakWord && wordForReview ? wordForReview : currentFocusWord, [isReviewingStreakWord, wordForReview, currentFocusWord]);
  const saveStreakToServer = useCallback(async (streakToSave: LiveStreak, token: string | null) => { if (!token || !streakToSave || streakToSave.score < 2) return; try { await fetch(`${API_BASE_URL}/save_streak`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ words: streakToSave.words, score: streakToSave.score }), }); } catch (err: any) { console.error('Error saving streak:', err.message); }}, []);
  const handleLogout = useCallback(async () => { if (liveStreak && liveStreak.score >= 2 && authToken) { await saveStreakToServer(liveStreak, authToken); } localStorage.removeItem('authToken'); setAuthToken(null); setCurrentUser(null); setUserProfileData(null); setLiveStreak(null); setCurrentFocusWord(null); setGeneratedContent({}); setActiveContentMode('explain'); setError(null); setAuthError(null); setAuthSuccessMessage(null); setShowAuthModal(false); setActiveView('main'); setInitialLoadDone(false); setLiveStreakQuizQueue([]); setCurrentStreakQuizItemIndex(0); setShowStreakQuizItemExplanation(false); setIsViewingStreakQuizSummary(false); }, [liveStreak, authToken, saveStreakToServer]);
  const fetchUserProfile = useCallback(async (token: string | null) => { if (!token) { setUserProfileData(null); setCurrentUser(null); return; } setIsFetchingProfile(true); try { const response = await fetch(`${API_BASE_URL}/profile`, { headers: { 'Authorization': `Bearer ${token}` }}); if (!response.ok) { if (response.status === 401) { handleLogout(); } else { setError(`Profile fetch failed`);} return; } const data = await response.json(); const pE: ExploredWordEntry[]=(data.exploredWords||[]).map((w:any)=>(w&&typeof w.word==='string'?{...w}:null)).filter(Boolean); const pF:ExploredWordEntry[]=(data.favoriteWords||[]).map((w:any)=>(w&&typeof w.word==='string'?{...w}:null)).filter(Boolean); setUserProfileData({...data, exploredWords: pE, favoriteWords: pF, streakHistory: (data.streakHistory||[]).sort((a:any,b:any)=>new Date(b.completed_at).getTime()-new Date(a.completed_at).getTime())}); setCurrentUser({username:data.username, email:data.email, id:data.user_id||currentUser?.id||''}); setError(null);} catch(e){if(!error)setError((e as Error).message);}finally{setIsFetchingProfile(false);}}, [currentUser?.id, error, handleLogout]);
  useEffect(() => {  const storedToken = localStorage.getItem('authToken'); if (storedToken) { if (!authToken) setAuthToken(storedToken); if (!initialLoadDone && !currentUser && !userProfileData && !isFetchingProfile) { fetchUserProfile(storedToken).finally(() => setInitialLoadDone(true)); } } else { if (currentUser || userProfileData || authToken) { setCurrentUser(null); setUserProfileData(null); setAuthToken(null); setInitialLoadDone(false);}}}, [authToken, currentUser, userProfileData, isFetchingProfile, initialLoadDone, fetchUserProfile]);
  const handleAuthAction = async (e: FormEvent) => { e.preventDefault(); setAuthError(null); setAuthSuccessMessage(null); setIsLoading(true); setInitialLoadDone(false);  const url = authMode === 'signup' ? `${API_BASE_URL}/signup` : `${API_BASE_URL}/login`; let payload = {}; if (authMode === 'signup') { payload = { username: authUsername, email: authEmail, password: authPassword }; } else { payload = { email_or_username: authUsername, password: authPassword };} try { const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const data = await response.json(); if (!response.ok) { throw new Error(data.error || `${authMode === 'signup' ? 'Signup' : 'Login'} failed`);} if (authMode === 'signup') { setAuthSuccessMessage('Signup successful! Please login.'); setAuthMode('login'); setAuthEmail(''); setAuthPassword('');  } else { localStorage.setItem('authToken', data.access_token); setAuthToken(data.access_token); setCurrentUser({ username: data.user.username, email: data.user.email, id: data.user.id }); setShowAuthModal(false); setAuthSuccessMessage('Login successful!'); await fetchUserProfile(data.access_token); setInitialLoadDone(true); setAuthEmail(''); setAuthPassword(''); setAuthUsername('');  } } catch (err: any) { setAuthError((err as Error).message); setInitialLoadDone(true);  } finally { setIsLoading(false); if (authMode === 'signup') setAuthPassword(''); }};
  const handleSaveQuizAttempt = useCallback(async (word: string, questionIdx: number, optionKey: string | null, isCorrect: boolean) => { if (!authToken) return; try { await fetch(`${API_BASE_URL}/save_quiz_attempt`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ word, question_index: questionIdx, selected_option_key: optionKey || "", is_correct: isCorrect }), }); if (authToken) await fetchUserProfile(authToken);  } catch (err: any) { console.error("Error saving quiz attempt stats:", err); }}, [authToken, fetchUserProfile]);
  const handleGenerateExplanation = useCallback(async (wordToFetch: string, isNewPrimaryWordSearch: boolean = false, isUserRefreshClick: boolean = false, isSubTopicClick: boolean = false, modeOverride?: ContentMode, isProfileWordClick: boolean = false) => { if (!wordToFetch.trim()) { return; } if (!authToken) { setShowAuthModal(true); setAuthError("Please login to generate content."); return; } const targetMode = modeOverride || 'explain'; const wordId = sanitizeWordForId(wordToFetch); setError(null); if (targetMode !== 'quiz') { setCurrentSingleWordQuiz(null); } if (isNewPrimaryWordSearch || isProfileWordClick) { if (liveStreak && liveStreak.score >= 2 && authToken) { await saveStreakToServer(liveStreak, authToken); } setLiveStreak(null); setCurrentFocusWord(wordToFetch); setActiveContentMode('explain'); setIsReviewingStreakWord(false); setWordForReview(null); setLiveStreakQuizQueue([]); setCurrentStreakQuizItemIndex(0); setIsViewingStreakQuizSummary(false); } else if (isSubTopicClick) { setCurrentFocusWord(wordToFetch); setActiveContentMode('explain'); setIsReviewingStreakWord(false); setWordForReview(null); } setIsLoading(true); let streakContextForAPI: string[] = []; if (isSubTopicClick && liveStreak) { streakContextForAPI = [...liveStreak.words]; } const isActuallyContextualExplain = targetMode === 'explain' && streakContextForAPI.length > 0; if (!isUserRefreshClick && targetMode === 'explain' && generatedContent[wordId]?.explanation && !isActuallyContextualExplain) { if(isNewPrimaryWordSearch && (!liveStreak || !liveStreak.words.includes(wordToFetch))) { setLiveStreak({ score: 1, words: [wordToFetch] }); } setIsLoading(false); return; } try { const backendShouldRefresh = isUserRefreshClick || isActuallyContextualExplain; const requestBody = { word: wordToFetch, mode: targetMode, refresh_cache: backendShouldRefresh, streakContext: streakContextForAPI }; const response = await fetch(`${API_BASE_URL}/generate_explanation`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}`}, body: JSON.stringify(requestBody) }); if (!response.ok) throw new Error((await response.json()).error || `Failed to generate ${targetMode}`); const apiData = await response.json(); let explanationJustFetched: string | null = null; if (targetMode === 'explain' && apiData.explain !== undefined) { explanationJustFetched = apiData.explain; } const isNewWordBeingAddedToStreakLogic = isNewPrimaryWordSearch || isProfileWordClick || (isSubTopicClick && (!liveStreak || !liveStreak.words.includes(wordToFetch))); if (isNewWordBeingAddedToStreakLogic && targetMode === 'explain') { if (isNewPrimaryWordSearch || isProfileWordClick) { setLiveStreak({ score: 1, words: [wordToFetch] }); } else if (isSubTopicClick) { setLiveStreak(prev => prev ? { score: prev.score + 1, words: [...prev.words, wordToFetch] } : { score: 1, words: [wordToFetch] }); } } setGeneratedContent(prev => { const existing = prev[wordId] || {}; const newGC: GeneratedContentItem = {...existing}; if(targetMode === 'explain' && apiData.explain !== undefined) newGC.explanation = apiData.explain; newGC.is_favorite = apiData.is_favorite !== undefined ? apiData.is_favorite : (existing.is_favorite || false); newGC.first_explored_at = existing.first_explored_at || new Date().toISOString(); newGC.last_explored_at = new Date().toISOString(); const modes = new Set(existing.modes_generated || []); modes.add(targetMode); if(apiData.modes_generated) apiData.modes_generated.forEach((m:string)=>modes.add(m)); newGC.modes_generated = Array.from(modes); return {...prev, [wordId]: newGC }; }); if (explanationJustFetched && authToken && isNewWordBeingAddedToStreakLogic) { try { const quizResp = await fetch(`${API_BASE_URL}/generate_explanation`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ word: wordToFetch, mode: 'quiz', explanation_text: explanationJustFetched, refresh_cache: true }) }); if (quizResp.ok) { const streakQuizData = await quizResp.json(); const parsedQs = parseQuizStringToArray(streakQuizData.quiz); if (parsedQs.length > 0) { const newStreakItem: StreakQuizItem = { word: wordToFetch, originalExplanation: explanationJustFetched, quizQuestion: parsedQs[0], attempted: false,}; setLiveStreakQuizQueue(prevQ => [...prevQ, newStreakItem]); } } } catch (qErr) { console.error("Error fetching streak quiz item:", qErr); } } } catch (err: any) { setError((err as Error).message); } finally { setIsLoading(false); if (isNewPrimaryWordSearch) setInputValue(''); } }, [authToken, generatedContent, liveStreak, saveStreakToServer, handleLogout, currentFocusWord, isReviewingStreakWord]);
  const handleStreakWordClick = useCallback((clickedWord: string) => { setIsViewingStreakQuizSummary(false); setCurrentFocusWord(clickedWord); setIsReviewingStreakWord(true); setWordForReview(clickedWord); setActiveContentMode('explain'); }, []);
  const handleSubTopicClick = useCallback((subTopic: string) => { if (liveStreak && liveStreak.words.includes(subTopic)) { handleStreakWordClick(subTopic); } else { handleGenerateExplanation(subTopic, false, false, true, 'explain'); } }, [liveStreak, handleGenerateExplanation, handleStreakWordClick]);
  const handleModeChange = useCallback((newMode: ContentMode) => { setActiveContentMode(newMode); }, []);
  const handleRefreshContent = useCallback(() => { const wordToUse = getDisplayWord(); if (!wordToUse) return; handleGenerateExplanation(wordToUse, false, true, false, 'explain');}, [getDisplayWord, handleGenerateExplanation]);
  const handleToggleFavorite = useCallback(async (word: string, currentStatus: boolean) => { if (!authToken || !word) return; const wordId = sanitizeWordForId(word); setGeneratedContent(prev => ({...prev, [wordId]: { ...(prev[wordId] || {}), is_favorite: !currentStatus }})); if (userProfileData) { setUserProfileData(prevP => { if (!prevP) return null; const nE = prevP.exploredWords.map(w => w.word === word ? { ...w, is_favorite: !currentStatus } : w ); let nF = prevP.favoriteWords.filter(fw => fw.word !== word); if (!currentStatus) { const eE = prevP.exploredWords.find(ew => ew.word === word); if (eE) nF.push({ ...eE, is_favorite: true }); } return { ...prevP, exploredWords: nE, favoriteWords: nF }; });} try { await fetch(`${API_BASE_URL}/toggle_favorite`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ word }) }); if (authToken) await fetchUserProfile(authToken); } catch (err: any) { if (authToken) await fetchUserProfile(authToken); } }, [authToken, fetchUserProfile, userProfileData]);
  const handleWordSelectionFromProfile = useCallback((word: string) => { setActiveView('main'); setInputValue(word); handleGenerateExplanation(word, true, false, false, 'explain', true); }, [handleGenerateExplanation]);
  const handleStreakQuizOptionSelect = useCallback((optionKey: string) => { if (currentStreakQuizItemIndex >= liveStreakQuizQueue.length || liveStreakQuizQueue[currentStreakQuizItemIndex].attempted) return; const currentItem = liveStreakQuizQueue[currentStreakQuizItemIndex]; const isCorrect = currentItem.quizQuestion.correctOptionKey === optionKey; const updatedQueue = liveStreakQuizQueue.map((item, index) => index === currentStreakQuizItemIndex ? { ...item, selectedOptionKey: optionKey, isCorrect, attempted: true } : item); setLiveStreakQuizQueue(updatedQueue); handleSaveQuizAttempt(currentItem.word, currentStreakQuizItemIndex, optionKey, isCorrect);  }, [liveStreakQuizQueue, currentStreakQuizItemIndex, handleSaveQuizAttempt]);
  const handleNextStreakQuizItem = useCallback(() => { setShowStreakQuizItemExplanation(false);  if (currentStreakQuizItemIndex < liveStreakQuizQueue.length - 1) { setCurrentStreakQuizItemIndex(prevIdx => prevIdx + 1); } else { setIsViewingStreakQuizSummary(true); } }, [currentStreakQuizItemIndex, liveStreakQuizQueue.length]);
  const handleSingleWordQuizOptionSelect = useCallback((optionKey: string) => { if (!currentSingleWordQuiz || singleWordQuizAttempted || !currentFocusWord) return; const currentQuestion = currentSingleWordQuiz[currentSingleWordQuizIdx]; const isCorrect = currentQuestion.correctOptionKey === optionKey; setSingleWordSelectedOption(optionKey); setSingleWordQuizFeedback({ message: isCorrect ? "Correct!" : `Incorrect.`, isCorrect }); setSingleWordQuizAttempted(true); handleSaveQuizAttempt(currentFocusWord, currentSingleWordQuizIdx, optionKey, isCorrect); }, [currentSingleWordQuiz, singleWordQuizAttempted, currentFocusWord, handleSaveQuizAttempt, currentSingleWordQuizIdx]);
  const handleNextSingleWordQuizQuestion = useCallback(() => { if (!currentSingleWordQuiz) return; if (currentSingleWordQuizIdx < currentSingleWordQuiz.length - 1) { setCurrentSingleWordQuizIdx(prev => prev + 1); setSingleWordSelectedOption(null); setSingleWordQuizFeedback(null); setSingleWordQuizAttempted(false); } else { setCurrentSingleWordQuiz(null); }  }, [currentSingleWordQuiz, currentSingleWordQuizIdx]);
  
  // RENDER FUNCTIONS
  const renderAuthModal = () => { if (!showAuthModal) return null; return (<div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-[--background-secondary] p-8 rounded-xl shadow-2xl w-full max-w-md relative"><button onClick={() => { setShowAuthModal(false); setAuthError(null); setAuthSuccessMessage(null);}} className="absolute top-4 right-4 text-[--text-tertiary] hover:text-[--text-primary]"><X size={24} /></button><h2 className="text-3xl font-bold text-center text-[--text-primary] mb-6">{authMode === 'login' ? 'Login' : 'Sign Up'}</h2>{authError && <p className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4 text-sm">{authError}</p>}{authSuccessMessage && <p className="bg-green-900/50 text-green-300 p-3 rounded-md mb-4 text-sm">{authSuccessMessage}</p>}<form onSubmit={handleAuthAction}>{authMode === 'signup' && ( <div className="mb-4"> <label className="block text-[--text-secondary] mb-1" htmlFor="signup-username">Username</label> <input type="text" id="signup-username" value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} className="w-full p-3 bg-[--background-input] border border-[--border-color] rounded-lg text-[--text-primary] focus:ring-2 focus:ring-[--accent-primary] outline-none" required /> </div> )}{authMode === 'signup' && ( <div className="mb-4"> <label className="block text-[--text-secondary] mb-1" htmlFor="signup-email">Email</label> <input type="email" id="signup-email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className="w-full p-3 bg-[--background-input] border border-[--border-color] rounded-lg text-[--text-primary] focus:ring-2 focus:ring-[--accent-primary] outline-none" required /> </div> )}{authMode === 'login' && ( <div className="mb-4"> <label className="block text-[--text-secondary] mb-1" htmlFor="login-identifier">Username or Email</label> <input type="text"  id="login-identifier" value={authUsername}  onChange={(e) => setAuthUsername(e.target.value)} className="w-full p-3 bg-[--background-input] border border-[--border-color] rounded-lg text-[--text-primary] focus:ring-2 focus:ring-[--accent-primary] outline-none" required /> </div> )}<div className="mb-6"> <label className="block text-[--text-secondary] mb-1" htmlFor="password">Password</label> <input type="password" id="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="w-full p-3 bg-[--background-input] border border-[--border-color] rounded-lg text-[--text-primary] focus:ring-2 focus:ring-[--accent-primary] outline-none" required /> </div><button type="submit" disabled={isLoading} className="w-full bg-[--accent-primary] hover:bg-[--accent-secondary] text-black font-semibold p-3 rounded-lg transition-colors disabled:opacity-50"> {isLoading ? 'Processing...' : (authMode === 'login' ? 'Login' : 'Sign Up')} </button></form><p className="text-center text-[--text-tertiary] mt-6 text-sm"> {authMode === 'login' ? ( <> Need an account? <button onClick={() => {setAuthMode('signup'); setAuthError(null); setAuthSuccessMessage(null); setAuthUsername(''); setAuthEmail(''); setAuthPassword('');}} className="text-[--accent-primary] hover:underline">Sign Up</button> </> ) : ( <> Already have an account? <button onClick={() => {setAuthMode('login'); setAuthError(null); setAuthSuccessMessage(null); setAuthUsername(''); setAuthEmail(''); setAuthPassword('');}} className="text-[--accent-primary] hover:underline">Login</button> </> )} </p></div></div>);};
  const renderWordGameContent = () => {
    const wordToUse = getDisplayWord();
    if (!wordToUse) {
      return (
        <div className="text-center text-5xl font-medium text-slate-500 flex flex-col items-center justify-center h-full">
            <span className="p-4 bg-sky-500/20 rounded-full mb-4">
                <Sparkles size={40} className="text-sky-400"/>
            </span>
            <span>How can I help you today?</span>
        </div>
      );
    }
  
    if (isLoading && !generatedContent[sanitizeWordForId(wordToUse)]) {
        return <div className="text-center p-10 text-slate-400">Generating...</div>;
    }

    if (error) return <div className="text-center p-10 text-red-400">Error: {error}</div>;

    const wordId = sanitizeWordForId(wordToUse);
    const contentItem = generatedContent[wordId];
    if (!contentItem) return null;

    const currentIsFavorite = contentItem?.is_favorite || false;
    const renderClickableText = (text: string | undefined) => { if (!text) return null; const parts = text.split(/(<click>.*?<\/click>)/g); return parts.map((part, index) => { const clickMatch = part.match(/<click>(.*?)<\/click>/); if (clickMatch && clickMatch[1]) { const subTopic = clickMatch[1]; return ( <button key={`${subTopic}-${index}`} onClick={() => handleSubTopicClick(subTopic)} className="text-[--accent-primary] hover:text-[--accent-secondary] underline font-semibold transition-colors mx-1" title={`Explore: ${subTopic}`} > {subTopic} </button> );} return <span key={`text-${index}`} dangerouslySetInnerHTML={{ __html: part.replace(/\n/g, '<br />') }} />; });};
    
    return (
      <div className="bg-[--background-secondary] p-6 rounded-lg shadow-lg">
          <div className="flex justify-between items-start mb-4">
            <h2 className="text-2xl sm:text-3xl font-bold text-[--text-primary] capitalize">{wordToUse}</h2>
            <div className="flex items-center space-x-2">
                <button onClick={() => handleToggleFavorite(wordToUse, currentIsFavorite)} className={`p-1.5 rounded-full hover:bg-[--hover-bg-color] transition-colors ${currentIsFavorite?'text-pink-500':'text-[--text-tertiary]'}`} title={currentIsFavorite?"Unfavorite":"Favorite"}><Heart size={20} fill={currentIsFavorite?'currentColor':'none'}/></button>
                <button onClick={handleRefreshContent} className="p-1.5 rounded-full text-[--text-tertiary] hover:text-[--text-primary] hover:bg-[--hover-bg-color] transition-colors" title="Regenerate Explanation"><RefreshCw size={18}/></button>
            </div>
          </div>
          <div className="prose prose-invert max-w-none text-[--text-secondary] leading-relaxed">
            {renderClickableText(contentItem.explanation)}
          </div>
      </div>
    );
  };
  
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [generatedContent, currentFocusWord, liveStreak]);

  // UPDATE: This is now the only mode button needed
  const unattemptedStreakQuizCount = liveStreakQuizQueue.filter(item => !item.attempted).length;

  const resetChat = () => {
    setInputValue('');
    setCurrentFocusWord(null);
    setLiveStreak(null);
    setLiveStreakQuizQueue([]);
    setActiveContentMode('explain');
    setError(null);
    setIsReviewingStreakWord(false);
  }

  return (
    <div className="flex h-full w-full bg-[--background-default] text-[--text-primary] font-sans">
      <aside className={`bg-[--background-secondary] flex-shrink-0 transition-all duration-300 flex flex-col ${isSidebarOpen ? 'w-64 p-4' : 'w-0 p-0'} overflow-hidden`}>
          <div className="flex-grow">
            <button onClick={resetChat} className="flex items-center w-full p-2 mb-4 rounded-md text-sm hover:bg-[--hover-bg-color]">
                <Plus size={16} className="mr-2"/> New Chat
            </button>
          </div>
          <div className="relative">
              <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center w-full p-2 rounded-md text-sm hover:bg-[--hover-bg-color]">
                  <div className="p-1 rounded-full bg-sky-500 text-white flex items-center justify-center h-8 w-8 mr-2">
                      {currentUser ? currentUser.username.charAt(0).toUpperCase() : <User size={20}/>}
                  </div>
                  <span>{currentUser ? currentUser.username : "Guest"}</span>
              </button>
              {showUserMenu && (
                  <div className="absolute bottom-12 left-0 w-full bg-[--background-tertiary] rounded-md shadow-lg py-1 z-50">
                      {currentUser ? (
                        <>
                          <button onClick={() => { setActiveView('profile'); setShowUserMenu(false); }} className="flex items-center w-full text-left px-4 py-2 text-sm text-[--text-primary] hover:bg-[--hover-bg-color]">
                              <User size={16} className="mr-2"/> Profile
                          </button>
                          <button className="flex items-center w-full text-left px-4 py-2 text-sm text-[--text-primary] hover:bg-[--hover-bg-color]">
                              <Settings size={16} className="mr-2"/> Settings
                          </button>
                          <button onClick={() => { handleLogout(); setShowUserMenu(false); }} className="flex items-center w-full text-left px-4 py-2 text-sm text-[--text-primary] hover:bg-[--hover-bg-color]">
                              <LogOut size={16} className="mr-2"/> Logout
                          </button>
                        </>
                      ) : (
                           <button onClick={() => { setShowAuthModal(true); setAuthMode('login'); setShowUserMenu(false);}} className="flex items-center w-full text-left px-4 py-2 text-sm text-[--text-primary] hover:bg-[--hover-bg-color]">
                              <LogIn size={16} className="mr-2"/> Login / Signup
                          </button>
                      )}
                  </div>
              )}
          </div>
      </aside>

      <div className="flex flex-col flex-grow h-full max-h-screen">
        <header className="flex items-center p-2 flex-shrink-0 border-b border-[--border-color]">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-full hover:bg-[--hover-bg-color]">
                <Menu size={20} />
            </button>
            <h1 className="text-lg font-medium ml-2">{getDisplayWord() || "Tiny Tutor AI"}</h1>
        </header>

        <main className="flex-grow overflow-y-auto p-4">
            <div className="max-w-4xl mx-auto">
              {activeView === 'main' ? renderWordGameContent() : (
                <ProfilePageComponent 
                  currentUser={currentUser!} 
                  userProfileData={userProfileData}
                  onWordSelect={handleWordSelectionFromProfile}
                  onToggleFavorite={handleToggleFavorite}
                  onNavigateBack={() => setActiveView('main')}
                  generatedContent={generatedContent}
                />
              )}
              <div ref={chatEndRef} />
            </div>
        </main>
        
        <footer className="p-4 flex-shrink-0">
          <div className="max-w-4xl mx-auto">
            {currentFocusWord && startMode === 'word_game' && (
                <div className="mb-4 space-y-4">
                  {liveStreak && liveStreak.score > 0 && (
                    <div className="p-3 bg-[--background-secondary] rounded-lg shadow text-sm text-emerald-400">
                      <span className="font-semibold">Live Streak: {liveStreak.score} </span>
                      <span>({liveStreak.words.map((word, index) => (
                        <span key={word + index}>
                          <button className={`cursor-pointer hover:text-emerald-300 ${getDisplayWord() === word ? 'font-bold underline' : ''}`} onClick={() => handleStreakWordClick(word)} title={`Review: ${word}`}>
                            {word}
                          </button>
                          {index < liveStreak.words.length - 1 && ' → '}
                        </span>
                      ))}) </span>
                      {isReviewingStreakWord && wordForReview && <span className="ml-2 text-xs text-slate-400">(Reviewing: {wordForReview})</span>}
                    </div>
                  )}
                  <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                    <button
                        key="quiz"
                        onClick={() => handleModeChange('quiz')}
                        disabled={isLoading}
                        className={`relative flex items-center py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200 ease-in-out transform hover:scale-105 ${activeContentMode === 'quiz' ? 'bg-sky-500 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-sky-300'} disabled:opacity-70 disabled:cursor-not-allowed`}
                        title="Quiz"
                      >
                        <Lightbulb size={16} className="mr-1.5" />
                        Quiz
                        {unattemptedStreakQuizCount > 0 && (<span className="absolute -top-2 -right-2 bg-pink-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">{unattemptedStreakQuizCount}</span>)}
                      </button>
                  </div>
                </div>
              )}
            
            <form onSubmit={(e) => { e.preventDefault(); if (startMode === 'word_game') { handleGenerateExplanation(inputValue, true); } else { setError("Story Mode is coming soon!"); } }}
              className="bg-[--background-input] rounded-full p-2 flex items-center shadow-lg border border-transparent focus-within:border-[--accent-primary] transition-colors">
              <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Enter a word or concept..."
                className="w-full bg-transparent px-4 focus:outline-none"
              />
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="p-2 rounded-full bg-[--hover-bg-color] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Sparkles size={20} />
              </button>
            </form>

            <div className="flex items-center justify-center gap-2 mt-3">
                 <button
                    onClick={() => setStartMode('word_game')}
                    className={`py-1 px-3 rounded-full text-xs font-medium transition-colors ${startMode === 'word_game' ? 'bg-[--accent-primary] text-black' : 'bg-[--background-tertiary] hover:bg-[--hover-bg-color] text-[--text-secondary]'}`}
                  >
                    Word Game
                  </button>
                  <button
                    onClick={() => setStartMode('story_mode')}
                    className={`py-1 px-3 rounded-full text-xs font-medium transition-colors ${startMode === 'story_mode' ? 'bg-[--accent-primary] text-black' : 'bg-[--background-tertiary] hover:bg-[--hover-bg-color] text-[--text-secondary]'}`}
                  >
                    Story Mode
                  </button>
            </div>
          </div>
        </footer>
      </div>

      {showAuthModal && renderAuthModal()}
    </div>
  );
}

export default App;
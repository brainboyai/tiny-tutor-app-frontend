import { useState, useEffect, useCallback, FormEvent, useRef } from 'react';
import {
  Heart, Lightbulb, LogIn, LogOut, RefreshCw, Sparkles, User, X,
  Settings, Menu, Plus
} from 'lucide-react';
import './App.css';
import './index.css';
import ProfilePageComponent from './ProfilePage';

// --- Types (No Changes) ---
interface CurrentUser { username: string; email: string; id: string; }
interface ParsedQuizQuestion { question: string; options: { [key: string]: string }; correctOptionKey: string; explanation?: string; }
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
const parseQuizStringToArray = (quizStringsFromBackend: any): ParsedQuizQuestion[] => { if (!Array.isArray(quizStringsFromBackend)) { return []; } return quizStringsFromBackend.map((quizStr: string) => { if (typeof quizStr !== 'string') { return null; } const lines = quizStr.trim().split('\n').map(line => line.trim()).filter(line => line); if (lines.length < 3 && !lines.some(l => l.startsWith("**Question"))) { return null; } let question = ""; const options: { [key: string]: string } = {}; let correctOptionKey = ""; let explanationForAnswer = ""; let parsingState: 'question' | 'options' | 'answer' | 'explanation' = 'question'; let questionLines: string[] = []; for (const line of lines) { const questionMatch = line.match(/^\*\*Question \d*:\*\*(.*)/i); if (questionMatch) { if (questionLines.length > 0 && !question) question = questionLines.join(" ").trim(); questionLines = []; question = questionMatch[1].trim(); parsingState = 'options'; continue; } const optionMatch = line.match(/^([A-D])\)\s*(.*)/i); if (optionMatch) { if (parsingState === 'question') { question = questionLines.join(" ").trim(); questionLines = []; } options[optionMatch[1].toUpperCase()] = optionMatch[2].trim(); continue; } const correctMatch = line.match(/^Correct Answer:\s*([A-D])/i); if (correctMatch) { if (parsingState === 'question') { question = questionLines.join(" ").trim(); questionLines = []; } correctOptionKey = correctMatch[1].toUpperCase(); parsingState = 'explanation'; explanationForAnswer = ""; continue; } const explanationKeywordMatch = line.match(/^Explanation:\s*(.*)/i); if (explanationKeywordMatch) { if (parsingState === 'question') { question = questionLines.join(" ").trim(); questionLines = []; } explanationForAnswer = explanationKeywordMatch[1].trim(); parsingState = 'explanation'; continue; } if (parsingState === 'question') { questionLines.push(line); } else if (parsingState === 'explanation') { explanationForAnswer += " " + line.trim(); } } if (questionLines.length > 0 && !question) question = questionLines.join(" ").trim(); explanationForAnswer = explanationForAnswer.trim(); if (!question || Object.keys(options).length < 2 || !correctOptionKey || !options[correctOptionKey]) { return null; } return { question, options, correctOptionKey, explanation: explanationForAnswer || undefined }; }).filter(q => q !== null) as ParsedQuizQuestion[]; };


function App() {
  // --- State (No Changes) ---
  const [inputValue, setInputValue] = useState('');
  const [currentFocusWord, setCurrentFocusWord] = useState<string | null>(null);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
  const [liveStreakQuizQueue, setLiveStreakQuizQueue] = useState<StreakQuizItem[]>([]);
  const [currentStreakQuizItemIndex, setCurrentStreakQuizItemIndex] = useState<number>(0);
  const [wordForReview, setWordForReview] = useState<string | null>(null);
  const [isReviewingStreakWord, setIsReviewingStreakWord] = useState(false);
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);
  const [isQuizVisible, setIsQuizVisible] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // --- Logic Functions (Largely Unchanged) ---
  const getDisplayWord = useCallback(() => isReviewingStreakWord && wordForReview ? wordForReview : currentFocusWord, [isReviewingStreakWord, wordForReview, currentFocusWord]);
  const saveStreakToServer = useCallback(async (streakToSave: LiveStreak, token: string | null) => { if (!token || !streakToSave || streakToSave.score < 2) return; try { await fetch(`${API_BASE_URL}/save_streak`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ words: streakToSave.words, score: streakToSave.score }), }); } catch (err: any) { console.error('Error saving streak:', err.message); }}, []);
  const handleLogout = useCallback(async () => { if (liveStreak && liveStreak.score >= 2 && authToken) { await saveStreakToServer(liveStreak, authToken); } localStorage.removeItem('authToken'); setAuthToken(null); setCurrentUser(null); setUserProfileData(null); setLiveStreak(null); setCurrentFocusWord(null); setGeneratedContent({}); setError(null); setAuthError(null); setAuthSuccessMessage(null); setShowAuthModal(false); setActiveView('main'); setLiveStreakQuizQueue([]); }, [liveStreak, authToken, saveStreakToServer]);
  const fetchUserProfile = useCallback(async (token: string | null) => { if (!token) { setUserProfileData(null); setCurrentUser(null); return; } setIsFetchingProfile(true); try { const response = await fetch(`${API_BASE_URL}/profile`, { headers: { 'Authorization': `Bearer ${token}` }}); if (!response.ok) { if (response.status === 401) { handleLogout(); } else { setError(`Profile fetch failed`);} return; } const data = await response.json(); const pE: ExploredWordEntry[]=(data.exploredWords||[]).map((w:any)=>(w&&typeof w.word==='string'?{...w}:null)).filter(Boolean); const pF:ExploredWordEntry[]=(data.favoriteWords||[]).map((w:any)=>(w&&typeof w.word==='string'?{...w}:null)).filter(Boolean); setUserProfileData({...data, exploredWords: pE, favoriteWords: pF, streakHistory: (data.streakHistory||[]).sort((a:any,b:any)=>new Date(b.completed_at).getTime()-new Date(a.completed_at).getTime())}); setCurrentUser({username:data.username, email:data.email, id:data.user_id||''}); setError(null);} catch(e){if(typeof e === 'string') setError(e); else if (e instanceof Error) setError(e.message)}finally{setIsFetchingProfile(false);}}, [currentUser?.id, error, handleLogout]);
  useEffect(() => { const storedToken = localStorage.getItem('authToken'); if (storedToken) { if (!authToken) setAuthToken(storedToken); if (!currentUser && !isFetchingProfile) { fetchUserProfile(storedToken); } } else { setCurrentUser(null); setUserProfileData(null); setAuthToken(null); }}, [authToken, currentUser, isFetchingProfile, fetchUserProfile]);
  const handleAuthAction = async (e: FormEvent) => { e.preventDefault(); setAuthError(null); setAuthSuccessMessage(null); setIsLoading(true); const url = authMode === 'signup' ? `${API_BASE_URL}/signup` : `${API_BASE_URL}/login`; let payload = {}; if (authMode === 'signup') { payload = { username: authUsername, email: authEmail, password: authPassword }; } else { payload = { email_or_username: authUsername, password: authPassword };} try { const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const data = await response.json(); if (!response.ok) { throw new Error(data.error || 'Request failed');} if (authMode === 'signup') { setAuthSuccessMessage('Signup successful! Please login.'); setAuthMode('login'); setAuthEmail(''); setAuthPassword(''); } else { localStorage.setItem('authToken', data.access_token); setAuthToken(data.access_token); setCurrentUser({ username: data.user.username, email: data.user.email, id: data.user.id }); setShowAuthModal(false); setAuthSuccessMessage('Login successful!'); await fetchUserProfile(data.access_token); setAuthEmail(''); setAuthPassword(''); setAuthUsername(''); } } catch (err) { if (err instanceof Error) setAuthError(err.message); } finally { setIsLoading(false); if (authMode === 'signup') setAuthPassword(''); }};
  const handleSaveQuizAttempt = useCallback(async (word: string, isCorrect: boolean) => { if (!authToken) return; try { await fetch(`${API_BASE_URL}/save_quiz_attempt`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ word, is_correct: isCorrect }), }); if (authToken) await fetchUserProfile(authToken); } catch (err: any) { console.error("Error saving quiz attempt stats:", err); }}, [authToken, fetchUserProfile]);
  const handleGenerateExplanation = useCallback(async (wordToFetch: string, isNewPrimaryWordSearch: boolean = false, isUserRefreshClick: boolean = false, isSubTopicClick: boolean = false) => { if (!wordToFetch.trim()) return; if (!authToken) { setShowAuthModal(true); setAuthError("Please login to generate content."); return; } const wordId = sanitizeWordForId(wordToFetch); setError(null); if (isNewPrimaryWordSearch) { if (liveStreak && liveStreak.score >= 2 && authToken) { await saveStreakToServer(liveStreak, authToken); } setLiveStreak(null); setCurrentFocusWord(wordToFetch); setIsReviewingStreakWord(false); setLiveStreakQuizQueue([]); setCurrentStreakQuizItemIndex(0); setIsQuizVisible(false); } else if (isSubTopicClick) { setCurrentFocusWord(wordToFetch); setIsReviewingStreakWord(false); } setIsLoading(true); let streakContextForAPI: string[] = []; if (isSubTopicClick && liveStreak) { streakContextForAPI = [...liveStreak.words]; } const isActuallyContextualExplain = streakContextForAPI.length > 0; if (!isUserRefreshClick && generatedContent[wordId]?.explanation && !isActuallyContextualExplain) { if(isNewPrimaryWordSearch && (!liveStreak || !liveStreak.words.includes(wordToFetch))) { setLiveStreak({ score: 1, words: [wordToFetch] }); } setIsLoading(false); return; } try { const requestBody = { word: wordToFetch, mode: 'explain', refresh_cache: isUserRefreshClick || isActuallyContextualExplain, streakContext: streakContextForAPI }; const response = await fetch(`${API_BASE_URL}/generate_explanation`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}`}, body: JSON.stringify(requestBody) }); if (!response.ok) throw new Error((await response.json()).error || 'Failed to generate content'); const apiData = await response.json(); const explanationJustFetched = apiData.explain; const isNewWordBeingAddedToStreak = isNewPrimaryWordSearch || (isSubTopicClick && (!liveStreak || !liveStreak.words.includes(wordToFetch))); if (isNewWordBeingAddedToStreak) { if (isNewPrimaryWordSearch) { setLiveStreak({ score: 1, words: [wordToFetch] }); } else if (isSubTopicClick) { setLiveStreak(prev => prev ? { score: prev.score + 1, words: [...prev.words, wordToFetch] } : { score: 1, words: [wordToFetch] }); } } setGeneratedContent(prev => ({ ...prev, [wordId]: { ...(prev[wordId] || {}), explanation: explanationJustFetched, is_favorite: apiData.is_favorite, first_explored_at: (prev[wordId]?.first_explored_at || new Date().toISOString()), last_explored_at: new Date().toISOString() }})); if (explanationJustFetched && authToken && isNewWordBeingAddedToStreak) { try { const quizResp = await fetch(`${API_BASE_URL}/generate_explanation`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ word: wordToFetch, mode: 'quiz', explanation_text: explanationJustFetched }) }); if (quizResp.ok) { const streakQuizData = await quizResp.json(); const parsedQs = parseQuizStringToArray(streakQuizData.quiz); if (parsedQs.length > 0) { setLiveStreakQuizQueue(prevQ => [...prevQ, { word: wordToFetch, originalExplanation: explanationJustFetched, quizQuestion: parsedQs[0], attempted: false }]); } } } catch (qErr) { console.error("Error fetching streak quiz item:", qErr); } } } catch (err) { if(err instanceof Error) setError(err.message); } finally { setIsLoading(false); if (isNewPrimaryWordSearch) setInputValue(''); } }, [authToken, generatedContent, liveStreak, saveStreakToServer, handleLogout]);
  const handleStreakWordClick = useCallback((clickedWord: string) => { setIsQuizVisible(false); setCurrentFocusWord(clickedWord); setIsReviewingStreakWord(true); setWordForReview(clickedWord); }, []);
  const handleSubTopicClick = useCallback((subTopic: string) => { setIsQuizVisible(false); if (liveStreak && liveStreak.words.includes(subTopic)) { handleStreakWordClick(subTopic); } else { handleGenerateExplanation(subTopic, false, false, true); } }, [liveStreak, handleGenerateExplanation, handleStreakWordClick]);
  const handleRefreshContent = useCallback(() => { const wordToUse = getDisplayWord(); if (!wordToUse) return; handleGenerateExplanation(wordToUse, false, true);}, [getDisplayWord, handleGenerateExplanation]);
  const handleToggleFavorite = useCallback(async (word: string, currentStatus: boolean) => { if (!authToken || !word) return; const wordId = sanitizeWordForId(word); setGeneratedContent(prev => ({...prev, [wordId]: { ...(prev[wordId] || {}), is_favorite: !currentStatus }})); try { await fetch(`${API_BASE_URL}/toggle_favorite`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ word }) }); if (authToken) await fetchUserProfile(authToken); } catch (err: any) { if (authToken) await fetchUserProfile(authToken); } }, [authToken, fetchUserProfile]);
  const handleWordSelectionFromProfile = useCallback((word: string) => { setActiveView('main'); setInputValue(word); handleGenerateExplanation(word, true); }, [handleGenerateExplanation]);
  const handlePopupQuizAnswer = (optionKey: string) => { const currentItem = liveStreakQuizQueue[currentStreakQuizItemIndex]; if (!currentItem || currentItem.attempted) return; const isCorrect = currentItem.quizQuestion.correctOptionKey === optionKey; handleSaveQuizAttempt(currentItem.word, isCorrect); setLiveStreakQuizQueue(prev => prev.map((item, index) => index === currentStreakQuizItemIndex ? { ...item, attempted: true, selectedOptionKey: optionKey, isCorrect } : item )); };
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [generatedContent, currentFocusWord, liveStreak, isQuizVisible]);
  const unattemptedStreakQuizCount = liveStreakQuizQueue.filter(item => !item.attempted).length;
  const resetChat = () => { setInputValue(''); setCurrentFocusWord(null); setLiveStreak(null); setLiveStreakQuizQueue([]); setError(null); setIsReviewingStreakWord(false); setIsQuizVisible(false); }

  const renderWordGameContent = () => { const wordToUse = getDisplayWord(); if (!wordToUse) { return (<div className="text-center text-4xl font-medium text-slate-500 flex flex-col items-center justify-center h-full"><span className="p-4 bg-sky-500/10 rounded-full mb-4"><Sparkles size={32} className="text-sky-400"/></span><span>How can I help you today?</span></div>); } if (isLoading && !generatedContent[sanitizeWordForId(wordToUse)]) { return <div className="text-center p-10 text-slate-400">Generating...</div>; } if (error) return <div className="text-center p-10 text-red-400">Error: {error}</div>; const wordId = sanitizeWordForId(wordToUse); const contentItem = generatedContent[wordId]; if (!contentItem?.explanation) return null; const currentIsFavorite = contentItem?.is_favorite || false; const renderClickableText = (text: string | undefined) => { if (!text) return null; const parts = text.split(/(<click>.*?<\/click>)/g); return parts.map((part, index) => { const clickMatch = part.match(/<click>(.*?)<\/click>/); if (clickMatch && clickMatch[1]) { const subTopic = clickMatch[1]; return ( <button key={`${subTopic}-${index}`} onClick={() => handleSubTopicClick(subTopic)} className="text-[--accent-primary] hover:text-[--accent-secondary] underline font-semibold transition-colors mx-1" title={`Explore: ${subTopic}`} > {subTopic} </button> );} return <span key={`text-${index}`} dangerouslySetInnerHTML={{ __html: part.replace(/\n/g, '<br />') }} />; });}; return ( <div className="bg-transparent p-1"> <div className="flex justify-between items-start mb-4"> <h2 className="text-2xl sm:text-3xl font-bold text-[--text-primary] capitalize">{wordToUse}</h2> <div className="flex items-center space-x-2"> <button onClick={() => handleToggleFavorite(wordToUse, currentIsFavorite)} className={`p-1.5 rounded-full hover:bg-[--hover-bg-color] transition-colors ${currentIsFavorite?'text-pink-500':'text-[--text-tertiary]'}`} title={currentIsFavorite?"Unfavorite":"Favorite"}><Heart size={20} fill={currentIsFavorite?'currentColor':'none'}/></button> <button onClick={handleRefreshContent} className="p-1.5 rounded-full text-[--text-tertiary] hover:text-[--text-primary] hover:bg-[--hover-bg-color] transition-colors" title="Regenerate Explanation"><RefreshCw size={18}/></button> </div> </div> <div className="prose prose-invert max-w-none text-[--text-secondary] leading-relaxed text-lg"> {renderClickableText(contentItem.explanation)} </div> </div> ); };
  const renderQuizPopup = () => { if (!isQuizVisible || unattemptedStreakQuizCount === 0) return null; const currentItem = liveStreakQuizQueue[currentStreakQuizItemIndex]; if (!currentItem) return null; const { quizQuestion, attempted, selectedOptionKey, isCorrect } = currentItem; return ( <div className="absolute top-4 right-4 w-full max-w-md bg-[--background-secondary] rounded-lg shadow-2xl p-6 z-20 border border-[--border-color]"> <div className="flex justify-between items-center mb-4"> <h3 className="font-semibold text-lg text-[--text-primary]">Quiz Time!</h3> <button onClick={() => setIsQuizVisible(false)} className="text-[--text-tertiary] hover:text-[--text-primary]"><X size={20}/></button> </div> <p className="text-[--text-secondary] mb-1 text-sm">Question {currentStreakQuizItemIndex + 1} of {liveStreakQuizQueue.length} (for "{currentItem.word}")</p> <p className="text-[--text-primary] mb-4">{quizQuestion.question}</p> <div className="space-y-2"> {Object.entries(quizQuestion.options).map(([key, text]) => { let buttonColor = "bg-[--hover-bg-color] hover:bg-[--border-color]"; if (attempted) { if (key === quizQuestion.correctOptionKey) { buttonColor = "bg-green-800/80"; } else if (key === selectedOptionKey) { buttonColor = "bg-red-800/80"; } else { buttonColor = "bg-[--hover-bg-color] opacity-60"; } } return (<button key={key} onClick={() => handlePopupQuizAnswer(key)} disabled={attempted} className={`w-full text-left p-3 rounded-md transition-colors ${buttonColor}`}> {text} </button>); })} </div> {attempted && ( <div className="flex justify-end mt-4"> <button onClick={() => { if(currentStreakQuizItemIndex < liveStreakQuizQueue.length - 1) { setCurrentStreakQuizItemIndex(i => i + 1); } else { setIsQuizVisible(false); } }} className="bg-[--accent-primary] text-black font-semibold py-2 px-4 rounded-md"> Next </button> </div> )} </div> ); };

  return (
    <div className="flex h-dvh w-full bg-[--background-default] text-[--text-primary] font-sans">
      <aside className={`bg-[--background-secondary] flex-shrink-0 transition-all duration-300 flex flex-col ${isSidebarOpen ? 'w-64 p-2' : 'w-0 p-0'} overflow-hidden`}>
          <div className="flex-grow">
            <button onClick={resetChat} className="flex items-center w-full p-2 mb-2 rounded-md text-sm hover:bg-[--hover-bg-color]">
                <Plus size={16} className="mr-3"/> New Chat
            </button>
          </div>
          <div className="relative">
              <button onClick={() => setShowUserMenu(!showUserMenu)} className="flex items-center w-full p-2 rounded-md text-sm hover:bg-[--hover-bg-color]">
                  <div className="p-1 rounded-full bg-sky-500 text-white flex items-center justify-center h-8 w-8 mr-2 flex-shrink-0">
                      {currentUser ? currentUser.username.charAt(0).toUpperCase() : <User size={20}/>}
                  </div>
                  <span className="truncate">{currentUser ? currentUser.username : "Guest"}</span>
              </button>
              {showUserMenu && (
                  <div className="absolute bottom-12 left-2 w-[calc(100%-1rem)] bg-[--background-tertiary] rounded-md shadow-lg py-1 z-50">
                      {currentUser ? ( <> <button onClick={() => { setActiveView('profile'); setShowUserMenu(false); }} className="flex items-center w-full text-left px-3 py-2 text-sm text-[--text-primary] hover:bg-[--hover-bg-color] rounded-md"> <User size={16} className="mr-2"/> Profile </button> <button className="flex items-center w-full text-left px-3 py-2 text-sm text-[--text-primary] hover:bg-[--hover-bg-color] rounded-md"> <Settings size={16} className="mr-2"/> Settings </button> <button onClick={() => { handleLogout(); setShowUserMenu(false); }} className="flex items-center w-full text-left px-3 py-2 text-sm text-[--text-primary] hover:bg-[--hover-bg-color] rounded-md"> <LogOut size={16} className="mr-2"/> Logout </button> </> ) : ( <button onClick={() => { setShowAuthModal(true); setAuthMode('login'); setShowUserMenu(false);}} className="flex items-center w-full text-left px-3 py-2 text-sm text-[--text-primary] hover:bg-[--hover-bg-color] rounded-md"> <LogIn size={16} className="mr-2"/> Login / Signup </button> )}
                  </div>
              )}
          </div>
      </aside>

      <div className="flex flex-col flex-grow h-full max-h-screen">
        <header className="flex items-center p-2 flex-shrink-0 border-b border-[--border-color]">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-full hover:bg-[--hover-bg-color]"> <Menu size={20} /> </button>
            <h1 className="text-lg font-medium ml-2 truncate">{getDisplayWord() || "Tiny Tutor AI"}</h1>
        </header>

        <main className="flex-grow overflow-y-auto relative">
            <div className="max-w-4xl mx-auto px-4 pt-8 pb-24">
              {activeView === 'main' ? renderWordGameContent() : (<ProfilePageComponent currentUser={currentUser!} userProfileData={userProfileData} onWordSelect={handleWordSelectionFromProfile} onToggleFavorite={handleToggleFavorite} onNavigateBack={() => setActiveView('main')} generatedContent={generatedContent} /> )}
              <div ref={chatEndRef} />
            </div>
            {renderQuizPopup()}
        </main>
        
        <footer className="p-4 flex-shrink-0 bg-gradient-to-t from-[--background-default] to-transparent">
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
                  {unattemptedStreakQuizCount > 0 && (
                     <div className="flex flex-wrap justify-center gap-2 sm:gap-3">
                      <button onClick={() => setIsQuizVisible(true)} className="relative flex items-center py-2 px-4 rounded-lg text-sm font-medium transition-all duration-200 ease-in-out transform hover:scale-105 bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-sky-300">
                        <Lightbulb size={16} className="mr-1.5" /> Quiz
                        <span className="absolute -top-2 -right-2 bg-pink-500 text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">{unattemptedStreakQuizCount}</span>
                      </button>
                    </div>
                  )}
                </div>
              )}
            
            <form onSubmit={(e) => { e.preventDefault(); if (startMode === 'word_game') { handleGenerateExplanation(inputValue, true); } else { setError("Story Mode is coming soon!"); } }} className="bg-[--background-input] rounded-full p-2 flex items-center shadow-lg border border-transparent focus-within:border-[--accent-primary] transition-colors">
              <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Enter a word or concept..." className="w-full bg-transparent px-4 focus:outline-none"/>
              <button type="submit" disabled={isLoading || !inputValue.trim()} className="p-2 rounded-full bg-[--hover-bg-color] disabled:opacity-50 disabled:cursor-not-allowed"> <Sparkles size={20} /> </button>
            </form>

            <div className="flex items-center justify-center gap-2 mt-3">
                 <button onClick={() => setStartMode('word_game')} className={`py-1 px-3 rounded-full text-xs font-medium transition-colors ${startMode === 'word_game' ? 'bg-[--accent-primary] text-black' : 'bg-[--background-tertiary] hover:bg-[--hover-bg-color] text-[--text-secondary]'}`}> Word Game </button>
                 <button onClick={() => setStartMode('story_mode')} className={`py-1 px-3 rounded-full text-xs font-medium transition-colors ${startMode === 'story_mode' ? 'bg-[--accent-primary] text-black' : 'bg-[--background-tertiary] hover:bg-[--hover-bg-color] text-[--text-secondary]'}`}> Story Mode </button>
            </div>
          </div>
        </footer>
      </div>

      {showAuthModal && renderAuthModal()}
    </div>
  );
}

export default App;
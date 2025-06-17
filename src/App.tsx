import React, { useState, useEffect, useCallback, FormEvent, useRef } from 'react';
import {
  Heart, LogOut, RefreshCw, Sparkles, SendHorizontal, User, X,
  Settings, Menu, Plus, Flame, HelpCircle, Mic, BookText, FileText, Gamepad2, Lock, AlertTriangle
} from 'lucide-react';
import ProfilePageComponent from './ProfilePage';
import StoryModeComponent from './StoryMode';
import GameModeComponent from './GameMode';

// --- Types ---
interface CurrentUser { username: string; email: string; id: string; }
interface ParsedQuizQuestion { question: string; options: { [key: string]: string }; correctOptionKey: string; explanation?: string; }
interface GeneratedContentItem { explanation?: string; is_favorite?: boolean; first_explored_at?: string; last_explored_at?: string; }
interface GeneratedContent { [wordId: string]: GeneratedContentItem; }
interface LiveStreak { score: number; words: string[]; }
interface StreakRecord { id: string; words: string[]; score: number; completed_at: string; }
interface ExploredWordEntry { word: string; last_explored_at: string; is_favorite: boolean; first_explored_at?: string; }
interface UserProfileData { username: string; email: string; tier?: string; totalWordsExplored: number; exploredWords: ExploredWordEntry[]; favoriteWords: ExploredWordEntry[]; streakHistory: StreakRecord[]; quiz_points?: number; total_quiz_questions_answered?: number; total_quiz_questions_correct?: number; }
interface StreakQuizItem { word: string; originalExplanation: string; quizQuestion: ParsedQuizQuestion; attempted: boolean; selectedOptionKey?: string; isCorrect?: boolean; }

const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';

const sanitizeWordForId = (word: string): string => { if (typeof word !== 'string') return "invalid_word_input"; return word.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''); };
const parseQuizStringToArray = (quizStringsFromBackend: any): ParsedQuizQuestion[] => { if (!Array.isArray(quizStringsFromBackend)) { return []; } return quizStringsFromBackend.map((quizStr: string) => { if (typeof quizStr !== 'string') { return null; } const lines = quizStr.trim().split('\n').map(line => line.trim()).filter(line => line); if (lines.length < 3) return null; let question = ""; const options: { [key: string]: string } = {}; let correctOptionKey = ""; let explanationForAnswer = ""; let parsingState: 'question' | 'options' | 'answer' | 'explanation' = 'question'; let questionLines: string[] = []; for (const line of lines) { const questionMatch = line.match(/^\*\*Question \d*:\*\*(.*)/i); if (questionMatch) { if (questionLines.length > 0 && !question) question = questionLines.join(" ").trim(); questionLines = []; question = questionMatch[1].trim(); parsingState = 'options'; continue; } const optionMatch = line.match(/^([A-D])\)\s*(.*)/i); if (optionMatch) { if (parsingState === 'question') { question = questionLines.join(" ").trim(); questionLines = []; } options[optionMatch[1].toUpperCase()] = optionMatch[2].trim(); continue; } const correctMatch = line.match(/^Correct Answer:\s*([A-D])/i); if (correctMatch) { if (parsingState === 'question') { question = questionLines.join(" ").trim(); questionLines = []; } correctOptionKey = correctMatch[1].toUpperCase(); parsingState = 'explanation'; explanationForAnswer = ""; continue; } const explanationKeywordMatch = line.match(/^Explanation:\s*(.*)/i); if (explanationKeywordMatch) { if (parsingState === 'question') { question = questionLines.join(" ").trim(); questionLines = []; } explanationForAnswer = explanationKeywordMatch[1].trim(); parsingState = 'explanation'; continue; } if (parsingState === 'question') { questionLines.push(line); } else if (parsingState === 'explanation') { explanationForAnswer += " " + line.trim(); } } if (questionLines.length > 0 && !question) question = questionLines.join(" ").trim(); explanationForAnswer = explanationForAnswer.trim(); if (!question || Object.keys(options).length < 2 || !correctOptionKey || !options[correctOptionKey]) { return null; } return { question, options, correctOptionKey, explanation: explanationForAnswer || undefined }; }).filter(q => q !== null) as ParsedQuizQuestion[]; };

function App() {
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
  const [profileFetchFailed, setProfileFetchFailed] = useState(false);
  const [isQuizVisible, setIsQuizVisible] = useState(false);
  const [isInitialView, setIsInitialView] = useState(true);
  const [showWarningModal, setShowWarningModal] = useState(false);
  const [warningAction, setWarningAction] = useState<{ action: () => void } | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [customApiKey, setCustomApiKey] = useState<string>(localStorage.getItem('customApiKey') || '');
  const [showRateLimitModal, setShowRateLimitModal] = useState(false);
  const unattemptedStreakQuizCount = liveStreakQuizQueue.filter(item => !item.attempted).length;

  const getDisplayWord = useCallback(() => isReviewingStreakWord && wordForReview ? wordForReview : currentFocusWord, [isReviewingStreakWord, wordForReview, currentFocusWord]);
  const saveStreakToServer = useCallback(async (streakToSave: LiveStreak, token: string | null): Promise<StreakRecord[] | null> => { if (!token || !streakToSave || streakToSave.score < 2) return null; try { const response = await fetch(`${API_BASE_URL}/save_streak`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }, body: JSON.stringify({ words: streakToSave.words, score: streakToSave.score }), }); if (!response.ok) { console.error("Failed to save streak. Status:", response.status); return null; } const data = await response.json(); return data.streakHistory; } catch (err: any) { console.error('Error saving streak:', err.message); return null; }}, []);
  const handleLogout = useCallback(async () => { if (liveStreak && liveStreak.score >= 2 && authToken) { await saveStreakToServer(liveStreak, authToken); } localStorage.removeItem('authToken'); localStorage.removeItem('customApiKey'); setAuthToken(null); setCustomApiKey(''); setCurrentUser(null); setUserProfileData(null); setLiveStreak(null); setCurrentFocusWord(null); setGeneratedContent({}); setError(null); setAuthError(null); setAuthSuccessMessage(null); setShowAuthModal(false); setActiveView('main'); setLiveStreakQuizQueue([]); }, [liveStreak, authToken, saveStreakToServer]);
  const fetchUserProfile = useCallback(async (token: string | null) => { if (!token || profileFetchFailed) { setUserProfileData(null); setCurrentUser(null); return; } setIsFetchingProfile(true); try { const response = await fetch(`${API_BASE_URL}/profile`, { headers: { 'Authorization': `Bearer ${token}` }}); if (!response.ok) { if (response.status === 401) { handleLogout(); } else { setError(`Profile fetch failed with status: ${response.status}`);}  setProfileFetchFailed(true); return; } const data = await response.json(); const pE: ExploredWordEntry[]=(data.exploredWords||[]).map((w:any)=>(w&&typeof w.word==='string'?{...w}:null)).filter(Boolean); const pF:ExploredWordEntry[]=(data.favoriteWords||[]).map((w:any)=>(w&&typeof w.word==='string'?{...w}:null)).filter(Boolean); setUserProfileData({...data, exploredWords: pE, favoriteWords: pF, streakHistory: (data.streakHistory||[]).sort((a:any,b:any)=>new Date(b.completed_at).getTime()-new Date(a.completed_at).getTime())}); setCurrentUser({username:data.username, email:data.email, id:data.user_id||''}); setError(null); setProfileFetchFailed(false);} catch(e){console.error("Profile fetch error:", e); setError("Could not connect to the server. Please check your connection."); setProfileFetchFailed(true);if(typeof e === 'string') setError(e); else if (e instanceof Error) setError(e.message)}finally{setIsFetchingProfile(false);}}, [profileFetchFailed, handleLogout]);
  useEffect(() => { const storedToken = localStorage.getItem('authToken'); if (storedToken) { if (!authToken) setAuthToken(storedToken); if (!currentUser && !isFetchingProfile && !profileFetchFailed) { fetchUserProfile(storedToken); } } else { setCurrentUser(null); setUserProfileData(null); setAuthToken(null); }}, [authToken, currentUser, isFetchingProfile, fetchUserProfile, profileFetchFailed]);
  const saveGuestStateToSession = () => { if (!authToken && liveStreak && liveStreak.words.length > 0) { const guestState = { liveStreak, liveStreakQuizQueue, currentFocusWord, generatedContent, activeTopic, isInitialView: false, }; sessionStorage.setItem('tiny-tutor-guest-state', JSON.stringify(guestState)); } };
  const handleAuthAction = async (e: FormEvent) => { e.preventDefault(); setAuthError(null); setAuthSuccessMessage(null); setIsLoading(true); const url = authMode === 'signup' ? `${API_BASE_URL}/signup` : `${API_BASE_URL}/login`; let payload = {}; if (authMode === 'signup') { payload = { username: authUsername, email: authEmail, password: authPassword }; } else { payload = { email_or_username: authUsername, password: authPassword };} try { const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const data = await response.json(); if (!response.ok) { throw new Error(data.error || 'Request failed');} if (authMode === 'signup') { setAuthSuccessMessage('Signup successful! Please login.'); setAuthMode('login'); setAuthEmail(''); setAuthPassword(''); } else { localStorage.setItem('authToken', data.access_token); setAuthToken(data.access_token); setCurrentUser({ username: data.user.username, email: data.user.email, id: data.user.id }); setShowAuthModal(false); setAuthSuccessMessage('Login successful!'); await fetchUserProfile(data.access_token); const savedStateJSON = sessionStorage.getItem('tiny-tutor-guest-state'); if (savedStateJSON) { const savedState = JSON.parse(savedStateJSON); setLiveStreak(savedState.liveStreak); setLiveStreakQuizQueue(savedState.liveStreakQuizQueue); setCurrentFocusWord(savedState.currentFocusWord); setGeneratedContent(savedState.generatedContent); setActiveTopic(savedState.activeTopic); setIsInitialView(savedState.isInitialView); sessionStorage.removeItem('tiny-tutor-guest-state'); } setAuthEmail(''); setAuthPassword(''); setAuthUsername(''); } } catch (err) { if (err instanceof Error) setAuthError(err.message); } finally { setIsLoading(false); if (authMode === 'signup') setAuthPassword(''); }};
  const handleSaveQuizAttempt = useCallback(async (word: string, isCorrect: boolean) => { if (!authToken) return; try { await fetch(`${API_BASE_URL}/save_quiz_attempt`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ word, is_correct: isCorrect, question_index: 0, selected_option_key: '' }), }); if (authToken) await fetchUserProfile(authToken); } catch (err: any) { console.error("Error saving quiz attempt stats:", err); }}, [authToken, fetchUserProfile]);
  
  const handleGeneration = async (generationFn: () => Promise<any>) => {
    setError(null);
    setIsLoading(true);
    try {
      await generationFn();
    } catch (err) {
      if (err instanceof Error) {
        if (err.message.includes('429')) {
          setShowRateLimitModal(true);
        } else {
          setError(err.message);
        }
      } else {
        setError("An unknown error occurred.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
  
    const generationFn = async () => {
        const headers: HeadersInit = { 'Content-Type': 'application/json' };
        if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
        if (customApiKey) headers['X-User-API-Key'] = customApiKey;
      
        if (startMode === 'explore_mode') {
            const topic = inputValue;
            setLiveStreak({ score: 1, words: [topic] });
            setCurrentFocusWord(topic);
            setIsInitialView(false);
            setActiveGameMode('explore_mode');
            setActiveTopic(topic);
            setLiveStreakQuizQueue([]);
            setGeneratedContent({});
            setInputValue('');

            const response = await fetch(`${API_BASE_URL}/generate_explanation`, { method: 'POST', headers, body: JSON.stringify({ word: topic, mode: 'explain', language }) });
            if (!response.ok) {
                const errText = (await response.json().catch(() => ({}))).error || `Request failed with status ${response.status}`;
                throw new Error(`${response.status}: ${errText}`);
            }
            const apiData = await response.json();
            const explanationJustFetched = apiData.explain;
            setGeneratedContent(prev => ({ ...prev, [sanitizeWordForId(topic)]: { explanation: explanationJustFetched } }));
            
            try {
                const quizResp = await fetch(`${API_BASE_URL}/generate_explanation`, { method: 'POST', headers, body: JSON.stringify({ word: topic, mode: 'quiz', explanation_text: explanationJustFetched, language }) });
                if (quizResp.ok) {
                    const streakQuizData = await quizResp.json();
                    const parsedQs = parseQuizStringToArray(streakQuizData.quiz);
                    if (parsedQs.length > 0) {
                        setLiveStreakQuizQueue(prevQ => [...prevQ, { word: topic, originalExplanation: explanationJustFetched, quizQuestion: parsedQs[0], attempted: false }]);
                    }
                }
            } catch (qErr) { console.error("Error fetching quiz", qErr); }

        } else if (startMode === 'story_mode' || startMode === 'game_mode') {
            setIsInitialView(false);
            setActiveGameMode(startMode);
            setActiveTopic(inputValue);
            setInputValue('');
        }
    };
  
    handleGeneration(generationFn);
  };
  
  useEffect(() => { const storedLang = localStorage.getItem('tiny-tutor-language'); if (storedLang) { setLanguage(storedLang); } }, []);
  const handleLanguageChange = (lang: string) => { setLanguage(lang); localStorage.setItem('tiny-tutor-language', lang); };
  const showLoginModal = () => { saveGuestStateToSession(); setShowAuthModal(true); };

  const renderSettingsModal = () => {
    if (!showSettingsModal) return null;
    const handleSave = () => { localStorage.setItem('customApiKey', customApiKey); setShowSettingsModal(false); };
    const handleClear = () => { localStorage.removeItem('customApiKey'); setCustomApiKey(''); setShowSettingsModal(false); };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-[--background-secondary] p-8 rounded-xl shadow-2xl w-full max-w-lg relative">
                <button onClick={() => setShowSettingsModal(false)} className="absolute top-4 right-4 text-[--text-tertiary] hover:text-[--text-primary]"><X size={24} /></button>
                <h2 className="text-3xl font-bold text-center text-[--text-primary] mb-6">Settings</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-[--text-secondary] mb-1 font-semibold" htmlFor="api-key-input">Your Gemini API Key</label>
                        <input id="api-key-input" type="password" value={customApiKey} onChange={(e) => setCustomApiKey(e.target.value)} className="w-full p-3 bg-[--background-input] border border-[--border-color] rounded-lg text-[--text-primary] focus:ring-2 focus:ring-[--accent-primary] outline-none" placeholder="Enter your own API key for unlimited generations"/>
                        <p className="text-xs text-[--text-tertiary] mt-2">Providing your own key bypasses the free daily limit. Your key is stored only in your browser.</p>
                    </div>
                    <div className="flex justify-end gap-4 pt-4">
                        <button onClick={handleClear} className="py-2 px-4 rounded-md text-sm hover:bg-[--hover-bg-color]">Clear Key</button>
                        <button onClick={handleSave} className="py-2 px-6 rounded-md text-sm bg-[--accent-primary] text-black font-semibold">Save</button>
                    </div>
                </div>
            </div>
        </div>
    );
  };

  const renderRateLimitModal = () => {
    if (!showRateLimitModal) return null;
    const message = authToken 
        ? "Free daily limit reached. Please upgrade to Pro or provide your own API key in Settings for unlimited generations." 
        : "Free daily limit reached. Please sign in to use your own API key for unlimited generations.";
    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-[--background-secondary] p-8 rounded-xl shadow-2xl w-full max-w-md text-center">
              <AlertTriangle className="mx-auto h-16 w-16 text-amber-500 mb-4" />
              <h3 className="font-bold text-xl text-amber-400 mb-2">Daily Limit Reached</h3>
              <p className="text-[--text-secondary] mb-6">{message}</p>
              <div className="flex flex-col sm:flex-row justify-center gap-4">
                  <button onClick={() => setShowRateLimitModal(false)} className="py-2 px-4 rounded-md w-full sm:w-auto bg-amber-600 hover:bg-amber-500 text-white font-semibold">Upgrade to Pro</button>
                  <button 
                    onClick={() => { 
                        setShowRateLimitModal(false);
                        if (authToken) {
                            setShowSettingsModal(true); 
                        } else {
                            showLoginModal();
                        }
                    }} 
                    className="py-2 px-4 rounded-md w-full sm:w-auto hover:bg-[--hover-bg-color]"
                  >
                    {authToken ? 'Use Own API Key' : 'Sign In'}
                  </button>
              </div>
              <button onClick={() => setShowRateLimitModal(false)} className="text-xs text-[--text-tertiary] mt-6 hover:text-white">Close</button>
          </div>
      </div>
    );
  };
  
  return (
    <div className="flex h-dvh w-full bg-[--background-default] text-[--text-primary] font-sans">
        <aside className={`bg-[--background-secondary] flex-shrink-0 transition-all duration-300 flex flex-col ${isSidebarOpen ? 'w-64 p-2' : 'w-0 p-0'} overflow-hidden`}>
            {currentUser && (
              <button onClick={() => {}} className="flex items-center w-full p-2 rounded-md text-sm hover:bg-[--hover-bg-color]">
                  <div className="p-1 rounded-full bg-sky-500 text-white flex items-center justify-center h-8 w-8 mr-3 flex-shrink-0"> {currentUser.username.charAt(0).toUpperCase()} </div>
                  <span className="truncate font-semibold">{currentUser.username}</span>
              </button>
            )}
            {currentUser && (
              <>
                <button onClick={() => { setActiveView('profile'); }} className="flex items-center w-full p-2 rounded-md text-sm hover:bg-[--hover-bg-color]"> <User size={16} className="mr-3"/> Profile </button>
                <button onClick={() => setShowSettingsModal(true)} className="flex items-center w-full p-2 rounded-md text-sm hover:bg-[--hover-bg-color]"> <Settings size={16} className="mr-3"/> Settings </button>
              </>
            )}
        </aside>
        <div className="flex flex-col flex-grow h-full max-h-screen">
          <header className="flex items-center p-2 pr-4 flex-shrink-0 border-b border-[--border-color]">
            <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 rounded-full hover:bg-[--hover-bg-color]"> <Menu size={20} /> </button>
            <h1 className="text-lg font-medium ml-2 truncate">{activeView === 'profile' ? 'Profile' : (activeTopic || "Tiny Tutor AI")}</h1>
            <div className="ml-4">
              <select value={language} onChange={(e) => handleLanguageChange(e.target.value)} className="bg-transparent border border-gray-600 rounded-md p-1 text-sm">
                <option value="en">English</option>
                <option value="es">Español</option>
                <option value="fr">Français</option>
                <option value="zh">中文</option>
                <option value="hi">हिन्दी</option>
                <option value="te">తెలుగు</option>
              </select>
            </div>
            <div className="ml-auto">
              {!currentUser && (
                <button onClick={showLoginModal} className="bg-[#a8c7fa] hover:bg-[#89b4fa] text-black font-semibold py-1.5 px-5 rounded-full transition-colors text-sm">
                  Sign in
                </button>
              )}
            </div>
          </header>
          <main className="flex-grow overflow-y-auto">
            <div className="max-w-4xl mx-auto px-4 pt-8 pb-48">
              {/* Main content rendering logic based on activeGameMode etc. */}
            </div>
          </main>
          {/* Form and other elements */}
        </div>
        {renderSettingsModal()}
        {renderAuthModal()}
        {renderRateLimitModal()}
    </div>
  );
}

export default App;

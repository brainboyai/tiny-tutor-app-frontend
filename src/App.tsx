import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { jwtDecode, JwtPayload } from 'jwt-decode';

// --- Constants ---
const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';

// --- Types ---
interface CustomJwtPayload extends JwtPayload { user_id: string; username: string; tier: string; }
interface User { id: string; username: string; tier: string; exp?: number; }
interface AuthContextType { user: User | null; loading: boolean; login: (username: string, password: string) => Promise<User | null>; signup: (username: string, email: string, password: string) => Promise<boolean>; logout: () => Promise<void>; }
type Page = 'tutor' | 'profile';
type ContentMode = 'explain' | 'image' | 'fact' | 'quiz' | 'deep';

interface ExploredWord {
    id: string; word: string; is_favorite: boolean; last_explored_at?: string;
    generated_content_cache?: Partial<Record<ContentMode, string>>;
    modes_generated?: string[]; explicit_connections?: string[];
}
interface ProfileData {
    username: string; tier: string; explored_words_count: number;
    explored_words_list: ExploredWord[]; favorite_words_list: ExploredWord[];
}

// --- Streak Types ---
interface CompletedStreak {
    id: string;
    words: string[];
    score: number;
}
interface WordMapModalData { // For displaying completed streaks
    streaks: CompletedStreak[];
}

// --- Auth Context ---
const AuthContext = createContext<AuthContextType | undefined>(undefined);
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const login = async (username: string, password: string): Promise<User | null> => {
        setLoading(true); try {
            const response = await fetch(`${API_BASE_URL}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }), });
            if (response.ok) {
                const data = await response.json(); localStorage.setItem('access_token', data.access_token);
                const decodedUser: CustomJwtPayload = jwtDecode(data.access_token);
                const newUser = { id: decodedUser.user_id, username: decodedUser.username, tier: decodedUser.tier, exp: decodedUser.exp };
                setUser(newUser); return newUser;
            } console.error('Login failed:', await response.text()); return null;
        } catch (error) { console.error('Network error during login:', error); return null; }
        finally { setLoading(false); }
    };
    const signup = async (username: string, email: string, password: string): Promise<boolean> => {
        setLoading(true); try {
            const response = await fetch(`${API_BASE_URL}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, email, password }), });
            if (response.ok) return true;
            console.error('Signup failed:', await response.text()); return false;
        } catch (error) { console.error('Network error during signup:', error); return false; }
        finally { setLoading(false); }
    };
    const logout = async (): Promise<void> => { localStorage.removeItem('access_token'); setUser(null); };
    useEffect(() => {
        const checkAuthStatus = () => {
            setLoading(true); try {
                const token = localStorage.getItem('access_token');
                if (token) {
                    const decodedUser: CustomJwtPayload = jwtDecode(token);
                    if (decodedUser.exp && decodedUser.exp * 1000 < Date.now()) { localStorage.removeItem('access_token'); setUser(null); }
                    else { setUser({ id: decodedUser.user_id, username: decodedUser.username, tier: decodedUser.tier, exp: decodedUser.exp }); }
                } else { setUser(null); }
            } catch (error) { localStorage.removeItem('access_token'); setUser(null); }
            finally { setLoading(false); }
        };
        checkAuthStatus();
        const handleStorageChange = (event: StorageEvent) => { if (event.key === 'access_token' && !event.newValue) setUser(null); };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);
    return <AuthContext.Provider value={{ user, loading, login, signup, logout }}>{children}</AuthContext.Provider>;
};

// --- Auth Modal Component ---
interface AuthModalProps { onClose: () => void; onLoginSuccess: (loggedInUser: User, question: string) => Promise<void>; initialQuestion: string; initialMode: 'login' | 'signup'; }
const AuthModal: React.FC<AuthModalProps> = ({ onClose, onLoginSuccess, initialQuestion, initialMode }) => {
    const { login, signup, loading: authHookLoading } = useAuth();
    const [isLoginMode, setIsLoginMode] = useState(initialMode === 'login');
    const [username, setUsername] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null); const [isLoading, setIsLoading] = useState(false);
    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault(); setError(null); setIsLoading(true);
        if (isLoginMode) {
            const loggedInUser = await login(username, password);
            if (loggedInUser) await onLoginSuccess(loggedInUser, initialQuestion); else setError('Login failed. Invalid credentials or server error.');
        } else {
            const signedUp = await signup(username, email, password);
            if (signedUp) { setError('Signup successful! Please log in.'); setIsLoginMode(true); setPassword(''); } else setError('Signup failed. User might already exist or data is invalid.');
        }
        setIsLoading(false);
    };
    return (<div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-white p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-md relative"><button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-2xl" aria-label="Close modal">&times;</button><h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">{isLoginMode ? 'Login' : 'Sign Up'}</h2><form onSubmit={handleSubmit}><div className="mb-4"><label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="modal-username">Username</label><input type="text" id="modal-username" className="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" value={username} onChange={(e) => setUsername(e.target.value)} required /></div>{!isLoginMode && (<div className="mb-4"><label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="modal-email">Email</label><input type="email" id="modal-email" className="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" value={email} onChange={(e) => setEmail(e.target.value)} required={!isLoginMode} /></div>)}<div className="mb-6"><label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="modal-password">Password</label><input type="password" id="modal-password" className="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>{error && <p className="text-red-500 text-xs italic mb-4 text-center">{error}</p>}<div className="flex flex-col sm:flex-row items-center justify-between gap-4"><button type="submit" className="w-full sm:w-auto bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded focus:outline-none focus:shadow-outline transition-colors duration-150 flex items-center justify-center" disabled={isLoading || authHookLoading}>{isLoading || authHookLoading ? <><svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Processing...</> : (isLoginMode ? 'Login' : 'Sign Up')}</button><button type="button" onClick={() => { setIsLoginMode(!isLoginMode); setError(null); }} className="w-full sm:w-auto font-bold text-sm text-blue-500 hover:text-blue-800">{isLoginMode ? 'Need an account? Sign Up' : 'Already have an account? Login'}</button></div></form></div></div>);
};

// --- Highlighted Content Renderer Component ---
interface HighlightedContentRendererProps { content: string; onWordClick: (word: string) => void; }
const HighlightedContentRenderer: React.FC<HighlightedContentRendererProps> = ({ content, onWordClick }) => {
    if (!content) return null;
    const parts = content.split(/<\/?click>/g);
    return (<>{parts.map((part, index) => {
        if (index % 2 === 1) {
            const trimmedPart = part.trim();
            if (!trimmedPart) return null;
            return (<button key={`${index}-${trimmedPart}`} onClick={() => onWordClick(trimmedPart)} className="text-blue-600 font-semibold hover:underline focus:outline-none p-0 m-0 bg-transparent border-none cursor-pointer">{trimmedPart}</button>);
        }
        return <span key={index}>{part}</span>;
    })}</>);
};

// --- Word Streak History Modal Component ---
interface WordStreakHistoryModalProps { isOpen: boolean; onClose: () => void; modalData: WordMapModalData | null; }
const WordStreakHistoryModal: React.FC<WordStreakHistoryModalProps> = ({ isOpen, onClose, modalData }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const modalContentRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!isOpen || !modalData || !modalData.streaks.length || !canvasRef.current || !modalContentRef.current) return;
        const canvas = canvasRef.current; const ctx = canvas.getContext('2d'); if (!ctx) return;
        const nodeRadius = 20; const verticalSpacingBetweenNodes = 50; const verticalSpacingBetweenStreaks = 40;
        const textOffsetY = 30; const nodePaddingX = 10; let totalCanvasHeight = 20;
        modalData.streaks.forEach(streak => { totalCanvasHeight += textOffsetY; totalCanvasHeight += streak.words.length * verticalSpacingBetweenNodes; totalCanvasHeight += verticalSpacingBetweenStreaks; });
        totalCanvasHeight = Math.max(300, totalCanvasHeight);
        const containerWidth = modalContentRef.current.clientWidth - 48;
        canvas.width = Math.max(400, containerWidth); canvas.height = totalCanvasHeight;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const nodeColor = '#A5B4FC'; const lineColor = '#6B7280'; const textColor = '#111827'; const titleColor = '#374151';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; let currentY = 20;
        modalData.streaks.forEach((streak, streakIndex) => {
            currentY += textOffsetY; ctx.font = 'bold 14px Arial'; ctx.fillStyle = titleColor;
            ctx.fillText(`Streak ${streakIndex + 1} (Score: ${streak.score})`, canvas.width / 2, currentY);
            currentY += 20;
            streak.words.forEach((word, wordIndex) => {
                const nodeX = canvas.width / 2; const nodeY = currentY + wordIndex * verticalSpacingBetweenNodes;
                ctx.font = '12px Arial'; const textMetrics = ctx.measureText(word);
                const nodeWidth = textMetrics.width + 2 * nodePaddingX; const nodeRectHeight = nodeRadius * 2;
                ctx.fillStyle = nodeColor; ctx.strokeStyle = '#6B7280'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(nodeX - nodeWidth / 2 + nodeRadius, nodeY - nodeRectHeight / 2);
                ctx.arcTo(nodeX + nodeWidth / 2, nodeY - nodeRectHeight / 2, nodeX + nodeWidth / 2, nodeY + nodeRectHeight / 2, nodeRadius);
                ctx.arcTo(nodeX + nodeWidth / 2, nodeY + nodeRectHeight / 2, nodeX - nodeWidth / 2, nodeY + nodeRectHeight / 2, nodeRadius);
                ctx.arcTo(nodeX - nodeWidth / 2, nodeY + nodeRectHeight / 2, nodeX - nodeWidth / 2, nodeY - nodeRectHeight / 2, nodeRadius);
                ctx.arcTo(nodeX - nodeWidth / 2, nodeY - nodeRectHeight / 2, nodeX + nodeWidth / 2, nodeY - nodeRectHeight / 2, nodeRadius);
                ctx.closePath(); ctx.fill(); ctx.stroke();
                ctx.fillStyle = textColor; ctx.fillText(word, nodeX, nodeY);
                if (wordIndex < streak.words.length - 1) {
                    const nextNodeY = currentY + (wordIndex + 1) * verticalSpacingBetweenNodes;
                    ctx.beginPath(); ctx.moveTo(nodeX, nodeY + nodeRectHeight / 2); ctx.lineTo(nodeX, nextNodeY - nodeRectHeight / 2);
                    ctx.strokeStyle = lineColor; ctx.lineWidth = 2; ctx.stroke();
                    const headlen = 8; const angle = Math.PI / 2;
                    ctx.beginPath(); ctx.moveTo(nodeX, nextNodeY - nodeRectHeight / 2);
                    ctx.lineTo(nodeX - headlen * Math.cos(angle - Math.PI / 6), (nextNodeY - nodeRectHeight / 2) - headlen * Math.sin(angle - Math.PI / 6));
                    ctx.lineTo(nodeX - headlen * Math.cos(angle + Math.PI / 6), (nextNodeY - nodeRectHeight / 2) - headlen * Math.sin(angle + Math.PI / 6));
                    ctx.closePath(); ctx.fillStyle = lineColor; ctx.fill();
                }
            });
            currentY += streak.words.length * verticalSpacingBetweenNodes + verticalSpacingBetweenStreaks - verticalSpacingBetweenNodes;
        });
    }, [isOpen, modalData]);
    if (!isOpen) return null;
    return (<div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-[60] p-4"><div ref={modalContentRef} className="bg-white p-6 rounded-lg shadow-xl w-full max-w-lg md:max-w-xl relative flex flex-col max-h-[90vh]"><div className="flex justify-between items-center mb-4 flex-shrink-0"><h3 className="text-xl font-semibold text-gray-800">Word Exploration Streak History</h3><button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl" aria-label="Close modal">&times;</button></div><div className="flex-grow overflow-auto">{modalData && modalData.streaks.length > 0 ? (<canvas ref={canvasRef} className="rounded"></canvas>) : (<p className="text-gray-500 text-center py-10">No completed streaks to display yet. Start exploring!</p>)}</div></div></div>);
};

// --- Tiny Tutor App Content Component ---
interface TinyTutorAppContentProps {
    inputQuestion: string;
    onInputChange: (value: string) => void;
    onClearInput: () => void;
    generatedContents: Record<ContentMode, string>;
    activeMode: ContentMode; setActiveMode: React.Dispatch<React.SetStateAction<ContentMode>>;
    triggerGenerateExplanation: (question: string, mode: ContentMode, isNewRootWord: boolean, isRefresh: boolean) => Promise<void>;
    isLoadingExplanation: boolean;
    aiError: string | null;
    setAiError: React.Dispatch<React.SetStateAction<string | null>>; // FIX: Added this prop
    currentUser: User | null;
    setShowLoginModal: (question: string) => void;
    setShowSignupModal: (question: string) => void;
    isExplainGeneratedForCurrentWord: boolean;
    onToggleFavorite: (currentWordDisplay: string, currentFavStatus: boolean) => Promise<void>;
    currentWordIsFavorite: boolean | null;
    handleHighlightedWordClick: (word: string) => void;
    onShowStreakHistory: () => void;
    handleRefreshCurrentWord: () => void;
}
const TinyTutorAppContent: React.FC<TinyTutorAppContentProps> = ({
    inputQuestion, onInputChange, onClearInput, generatedContents, activeMode, setActiveMode,
    triggerGenerateExplanation, isLoadingExplanation, aiError, setAiError, // FIX: Destructure setAiError
    currentUser, setShowLoginModal, setShowSignupModal, isExplainGeneratedForCurrentWord,
    onToggleFavorite, currentWordIsFavorite, handleHighlightedWordClick, onShowStreakHistory, handleRefreshCurrentWord
}) => {
    const loggedIn = currentUser !== null;
    const mainGenerateClick = () => {
        if (inputQuestion.trim() === '') {
            setAiError('Please enter a concept.'); // FIX: Use setAiError prop
            return;
        }
        triggerGenerateExplanation(inputQuestion, 'explain', true, false);
    };
    const currentExplanationContent = generatedContents[activeMode];
    const canShowStreakHistoryButton = loggedIn;

    return (
        <div className="bg-white p-4 md:p-5 rounded-xl shadow-2xl w-full max-w-lg sm:max-w-xl md:max-w-2xl lg:max-w-3xl mx-auto flex flex-col min-h-[600px] max-h-[85vh] sm:max-h-[700px] overflow-hidden">
            <div className="flex-shrink-0">
                <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-center text-gray-800 mb-1 sm:mb-2">Tiny Tutor {loggedIn && currentUser?.username && <span className="text-indigo-600">({currentUser.username})</span>}</h2>
                {loggedIn && currentUser && (<p className="text-center text-gray-600 text-xs sm:text-sm mb-2 sm:mb-3">Your tier: <span className="font-semibold text-blue-600">{currentUser.tier}</span></p>)}
            </div>
            <div className="mb-2 sm:mb-3 p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200 flex-shrink-0">
                <label htmlFor="question-input-main" className="block text-gray-700 text-sm sm:text-base md:text-lg font-bold mb-1 sm:mb-2">Enter a word or concept:</label>
                <div className="relative">
                    <input type="text" id="question-input-main" className="w-full px-3 py-2 sm:py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-400 text-xs sm:text-sm md:text-base" placeholder="e.g., Photosynthesis" value={inputQuestion} onChange={(e) => onInputChange(e.target.value)} disabled={isLoadingExplanation} />
                    {inputQuestion && (<button onClick={onClearInput} className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 text-base sm:text-lg md:text-xl" aria-label="Clear input">&times;</button>)}
                </div>
                <button onClick={mainGenerateClick} className="mt-2.5 sm:mt-3 w-full sm:w-auto sm:mx-auto sm:px-6 md:px-8 bg-indigo-600 text-white py-2 sm:py-2.5 px-4 rounded-lg font-bold text-sm sm:text-base hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-300 transition active:scale-95 shadow-lg flex items-center justify-center" disabled={isLoadingExplanation || inputQuestion.trim() === ''}>{isLoadingExplanation && activeMode === 'explain' ? <><svg className="animate-spin -ml-1 mr-2 h-4 w-4 sm:h-5 sm:w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle opacity="25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path opacity="75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Generating...</> : 'Generate Explanation'}</button>
                {aiError && <p className="text-red-600 text-center text-xs font-medium mt-1 sm:mt-1.5">{aiError}</p>}
                {!loggedIn && !aiError && (<p className="text-gray-600 text-center text-xs mt-1 sm:mt-1.5"><button onClick={() => setShowSignupModal(inputQuestion)} className="font-semibold text-blue-600 hover:underline">Sign up</button>{' '}or{' '}<button onClick={() => setShowLoginModal(inputQuestion)} className="font-semibold text-blue-600 hover:underline">Login</button>{' '}to generate explanations.</p>)}
            </div>
            <div className={`flex-shrink-0 flex flex-wrap justify-center items-center gap-1 sm:gap-1.5 mb-2 sm:mb-3 transition-all duration-300 ${loggedIn && inputQuestion.trim() !== '' && isExplainGeneratedForCurrentWord ? 'opacity-100 h-auto mt-1 sm:mt-2' : 'opacity-0 h-0 mt-0 pointer-events-none'}`}>
                {(['explain', 'image', 'fact', 'quiz', 'deep'] as ContentMode[]).map(mode => (<button key={mode} onClick={async () => { if (!loggedIn || !isExplainGeneratedForCurrentWord || inputQuestion.trim() === '') return; setActiveMode(mode); if (!generatedContents[mode] || (mode === 'image' && generatedContents.image.startsWith('Image generation feature coming soon!')) || (mode === 'deep' && generatedContents.deep.startsWith('In-depth explanation feature coming soon!'))) { await triggerGenerateExplanation(inputQuestion, mode, false, false); } }} className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full font-semibold text-xs sm:text-sm transition-all duration-200 ${activeMode === mode ? 'bg-blue-600 text-white shadow-md scale-105' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'} ${mode !== 'explain' && !isExplainGeneratedForCurrentWord ? 'opacity-50 cursor-not-allowed' : ''} `} disabled={(isLoadingExplanation && activeMode !== mode) || (mode !== 'explain' && !isExplainGeneratedForCurrentWord)}>{mode.charAt(0).toUpperCase() + mode.slice(1)}{isLoadingExplanation && activeMode === mode && <svg className="animate-spin ml-1 sm:ml-1.5 -mr-0.5 h-3 w-3 sm:h-3.5 sm:w-3.5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle opacity="25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path opacity="75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}</button>))}
                {loggedIn && isExplainGeneratedForCurrentWord && inputQuestion.trim() !== '' && generatedContents[activeMode] && (<button onClick={handleRefreshCurrentWord} className="ml-2 p-2 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-60 transition-colors duration-150" title={`Refresh ${activeMode} content`} disabled={isLoadingExplanation}><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.493-4.269A5.502 5.502 0 0 1 9.5 2.5a5.5 5.5 0 0 1 5.005 3.873A.75.75 0 0 1 15.312 11.424ZM18 10a8 8 0 1 1-14.638-4.597A.75.75 0 0 1 4.583 6.27A6.5 6.5 0 1 0 10 3.5V2a.75.75 0 0 1 1.5 0v1.75A.75.75 0 0 1 10.75 4.5V6a.75.75 0 0 1-1.5 0V4.84A8.001 8.001 0 0 1 18 10Z" clipRule="evenodd" /></svg></button>)}
                {loggedIn && isExplainGeneratedForCurrentWord && inputQuestion.trim() !== '' && currentWordIsFavorite !== null && (<button onClick={() => onToggleFavorite(inputQuestion, !!currentWordIsFavorite)} className={`p-1.5 rounded-full text-xl ml-2 transition-colors duration-150 ${currentWordIsFavorite ? 'text-red-500 hover:text-red-600' : 'text-gray-400 hover:text-red-500'} focus:outline-none focus:ring-1 focus:ring-red-400`} title={currentWordIsFavorite ? "Remove from favorites" : "Add to favorites"}>{currentWordIsFavorite ? '♥' : '♡'}</button>)}
                {canShowStreakHistoryButton && (<button onClick={onShowStreakHistory} className="ml-2 py-1.5 px-3 bg-purple-500 text-white rounded-full text-xs sm:text-sm font-semibold hover:bg-purple-600 transition-colors duration-150 shadow" title="View Streak History" disabled={isLoadingExplanation}>Streak History</button>)}
            </div>
            <div className="flex-grow p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200 shadow-inner overflow-y-auto overflow-x-hidden relative min-h-[250px] sm:min-h-[300px] md:min-h-[320px]">
                {currentExplanationContent ? (<div className="prose prose-sm sm:prose-base md:prose-lg max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap break-words pt-1">{isLoadingExplanation ? (<div className="flex items-center justify-center text-gray-500"><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle opacity="25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path opacity="75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Generating {activeMode} content...</div>) : (activeMode === 'explain' ? <HighlightedContentRenderer content={currentExplanationContent} onWordClick={handleHighlightedWordClick} /> : currentExplanationContent)}</div>) : (<div className="flex items-center justify-center h-full"><p className="text-gray-400 text-center text-sm sm:text-base">{loggedIn ? (aiError || "Enter a concept or select a mode.") : (aiError || "Login to see explanations.")}</p></div>)}
            </div>
        </div>
    );
};

// --- Profile Page Component ---
interface ProfilePageProps { setCurrentPage: (page: Page) => void; getAuthHeaders: () => Record<string, string>; user: User | null; onWordClick: (word: string, cachedContent?: Partial<Record<ContentMode, string>>) => void; handleToggleFavoriteApp: (currentWordDisplay: string, currentFavStatus: boolean) => Promise<void>; profileDataHook: [ProfileData | null, React.Dispatch<React.SetStateAction<ProfileData | null>>]; }
const ProfilePage: React.FC<ProfilePageProps> = ({ setCurrentPage, getAuthHeaders, user, onWordClick, handleToggleFavoriteApp, profileDataHook }) => {
    const [profileData, setProfileData] = profileDataHook; const [isLoadingProfile, setIsLoadingProfile] = useState(false); const [profileError, setProfileError] = useState<string | null>(null);
    useEffect(() => {
        if (!user) { setCurrentPage('tutor'); return; }
        if (profileData === null && !isLoadingProfile) {
            const fetchProfileData = async () => {
                setIsLoadingProfile(true); setProfileError(null);
                try {
                    const response = await fetch(`${API_BASE_URL}/profile`, { headers: getAuthHeaders(), });
                    if (response.ok) { setProfileData(await response.json()); }
                    else { const errData = await response.json().catch(() => ({ error: "Failed to fetch profile, server error." })); setProfileError(errData.error || "Could not load profile data."); }
                } catch (err) { setProfileError("Network error fetching profile."); console.error(err); }
                finally { setIsLoadingProfile(false); }
            }; fetchProfileData();
        }
    }, [user, getAuthHeaders, setCurrentPage, profileData, setProfileData, isLoadingProfile]);
    const WordListItem: React.FC<{ item: ExploredWord, onToggleFavorite: () => void, onWordItemClick: () => void }> = ({ item, onToggleFavorite, onWordItemClick }) => (<li className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex justify-between items-center hover:bg-gray-100 transition-colors duration-150 group"><div className="flex-1 min-w-0 mr-2 cursor-pointer group-hover:text-indigo-600" onClick={onWordItemClick} title={`View details for "${item.word}"`}><span className="font-medium text-gray-700 block truncate group-hover:underline">{item.word}</span><p className="text-xs text-gray-400">Last seen: {item.last_explored_at ? new Date(item.last_explored_at).toLocaleDateString() : 'N/A'}</p></div><button onClick={onToggleFavorite} className={`text-xl p-1 rounded-full hover:bg-red-100 transition-colors duration-150 ${item.is_favorite ? 'text-red-500' : 'text-gray-300 hover:text-red-400'}`} title={item.is_favorite ? "Remove from favorites" : "Add to favorites"}>{item.is_favorite ? '♥' : '♡'}</button></li>);
    if (isLoadingProfile && !profileData) return <div className="text-center p-10 text-white text-lg">Loading profile... <svg className="animate-spin inline h-5 w-5 text-white ml-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>;
    if (profileError) return <div className="text-center p-10 text-red-300 bg-red-800 bg-opacity-30 rounded-lg">Error: {profileError} <button onClick={() => setCurrentPage('tutor')} className="text-blue-300 hover:underline ml-2">Go Back</button></div>;
    if (!profileData) return <div className="text-center p-10 text-white">No profile data found yet. Explore some words! <button onClick={() => setCurrentPage('tutor')} className="text-blue-300 hover:underline ml-2">Go Back</button></div>;
    return (<div className="bg-white p-4 md:p-6 rounded-xl shadow-2xl w-full max-w-xl md:max-w-2xl lg:max-w-3xl mx-auto min-h-[600px] max-h-[85vh] sm:max-h-[700px] flex flex-col overflow-hidden"><div className="flex justify-between items-center mb-3 sm:mb-4 flex-shrink-0"><h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 truncate">{profileData.username}'s Profile</h2><button onClick={() => setCurrentPage('tutor')} className="py-1.5 px-3 sm:py-2 sm:px-4 bg-indigo-600 text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-indigo-700 transition">&larr; Back to Tutor</button></div><p className="text-gray-600 mb-0.5 text-xs sm:text-sm">Tier: <span className="font-semibold">{profileData.tier}</span></p><p className="text-gray-600 mb-3 sm:mb-4 text-xs sm:text-sm">Words Explored: <span className="font-semibold">{profileData.explored_words_count}</span></p><div className="flex-grow overflow-y-auto space-y-4 sm:space-y-6 pr-1"><div><h3 className="text-lg sm:text-xl font-semibold text-gray-700 mb-1.5 sm:mb-2 sticky top-0 bg-white py-1 z-10 border-b">Favorite Words ({profileData.favorite_words_list.length})</h3>{profileData.favorite_words_list.length > 0 ? (<ul className="space-y-2">{profileData.favorite_words_list.map(item => (<WordListItem key={`fav-${item.id}`} item={item} onToggleFavorite={() => handleToggleFavoriteApp(item.word, item.is_favorite)} onWordItemClick={() => onWordClick(item.word, item.generated_content_cache)} />))}</ul>) : <p className="text-gray-500 text-sm px-1">No favorite words yet. Use the ♡ icon to add some!</p>}</div><div><h3 className="text-lg sm:text-xl font-semibold text-gray-700 mb-1.5 sm:mb-2 sticky top-0 bg-white py-1 z-10 border-b">All Explored Words ({profileData.explored_words_list.length})</h3>{profileData.explored_words_list.length > 0 ? (<ul className="space-y-2">{profileData.explored_words_list.map(item => (<WordListItem key={`exp-${item.id}`} item={item} onToggleFavorite={() => handleToggleFavoriteApp(item.word, item.is_favorite)} onWordItemClick={() => onWordClick(item.word, item.generated_content_cache)} />))}</ul>) : <p className="text-gray-500 text-sm px-1">No words explored yet.</p>}</div></div></div>);
};

// --- Main App Component ---
const App: React.FC = () => {
    const { user, loading: authLoadingGlobal, logout: authLogout } = useAuth();
    const [currentPage, setCurrentPage] = useState<Page>('tutor');
    const [inputQuestion, setInputQuestion] = useState('');
    const [generatedContents, setGeneratedContents] = useState<Record<ContentMode, string>>({ explain: '', image: 'Image generation feature coming soon!', fact: '', quiz: '', deep: 'In-depth explanation feature coming soon!' });
    const [activeMode, setActiveMode] = useState<ContentMode>('explain');
    const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [showAuthModal, setShowAuthModal] = useState(false); const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');
    const questionBeforeModalRef = useRef('');
    const [isExplainGeneratedForCurrentWord, setIsExplainGeneratedForCurrentWord] = useState(false);
    const [currentTutorWordIsFavorite, setCurrentTutorWordIsFavorite] = useState<boolean | null>(null);
    const [profileData, setProfileData] = useState<ProfileData | null>(null);

    const [currentStreak, setCurrentStreak] = useState<string[]>([]);
    const [completedStreaks, setCompletedStreaks] = useState<CompletedStreak[]>([]);
    const [showStreakHistoryModal, setShowStreakHistoryModal] = useState(false);
    const [streakHistoryModalData, setStreakHistoryModalData] = useState<WordMapModalData | null>(null);

    const finalizeCurrentStreak = () => {
        if (currentStreak.length > 0) {
            setCompletedStreaks(prev => [...prev, {
                id: Date.now().toString() + Math.random().toString(36).substring(2, 7),
                words: [...currentStreak],
                score: currentStreak.length
            }]);
            // setCurrentStreak([]); // Clearing is handled by the action that triggers finalization
        }
    };

    const getAuthHeaders = () => {
        const token = localStorage.getItem('access_token'); const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`; return headers;
    };
    const refreshProfileData = async () => {
        if (!user) { setProfileData(null); setCurrentTutorWordIsFavorite(null); return; }
        try {
            const response = await fetch(`${API_BASE_URL}/profile`, { headers: getAuthHeaders() });
            if (response.ok) {
                const data: ProfileData = await response.json(); setProfileData(data);
                if (inputQuestion && data.explored_words_list) {
                    const currentWordSanitizedId = inputQuestion.trim().toLowerCase().replace(/[/*\[\]]/g, '_').substring(0, 100);
                    const foundWord = data.explored_words_list.find(w => w.id === currentWordSanitizedId);
                    setCurrentTutorWordIsFavorite(foundWord ? foundWord.is_favorite : false);
                } else { setCurrentTutorWordIsFavorite(null); }
            } else { console.error("Failed to refresh profile data"); }
        } catch (error) { console.error("Error refreshing profile data:", error); }
    };
    useEffect(() => { if (user) refreshProfileData(); else { setProfileData(null); setCurrentTutorWordIsFavorite(null); } }, [user]);
    useEffect(() => {
        if (inputQuestion && profileData?.explored_words_list) {
            const currentWordSanitizedId = inputQuestion.trim().toLowerCase().replace(/[/*\[\]]/g, '_').substring(0, 100);
            const foundWord = profileData.explored_words_list.find(w => w.id === currentWordSanitizedId);
            setCurrentTutorWordIsFavorite(foundWord ? foundWord.is_favorite : false);
        } else if (!inputQuestion) setCurrentTutorWordIsFavorite(null);
    }, [inputQuestion, profileData]);

    const triggerGenerateExplanation = async (question: string, mode: ContentMode, isNewRootWord: boolean, isRefresh: boolean, forceCheckUser?: User | null) => {
        const currentUserToCheck = forceCheckUser !== undefined ? forceCheckUser : user;
        if (!currentUserToCheck) {
            setAiError("Please login to generate explanations.");
            if (forceCheckUser === undefined) handleShowLoginModal(question);
            setIsLoadingExplanation(false);
            return;
        }

        if (isNewRootWord || isRefresh) {
            finalizeCurrentStreak();
            setCurrentStreak([question]);
        }

        setAiError(null); setIsLoadingExplanation(true);
        setActiveMode(mode);
        setGeneratedContents(prev => ({ ...prev, [mode]: '' }));

        if (mode === 'explain' && (isNewRootWord || isRefresh)) {
            setIsExplainGeneratedForCurrentWord(false);
        }

        if (mode === 'image' || mode === 'deep') {
            setGeneratedContents(cc => ({ ...cc, [mode]: mode === 'image' ? `Image generation feature coming soon! You can imagine an image of '${question}'.` : `In-depth explanation feature coming soon! We're working on providing more detailed insights for '${question}'.` }));
            setIsLoadingExplanation(false);
            fetch(`${API_BASE_URL}/generate_explanation`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ question, content_type: mode }) }).then(() => refreshProfileData()).catch(console.error); return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/generate_explanation`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ question, content_type: mode }), signal: AbortSignal.timeout(30000) });
            if (response.ok) {
                const data = await response.json();
                setGeneratedContents(cc => ({ ...cc, [mode]: data.explanation }));
                if (mode === 'explain' && data.explanation && data.explanation.trim() !== '') {
                    setIsExplainGeneratedForCurrentWord(true);
                }
                await refreshProfileData();
            } else {
                const errorData = await response.json().catch(() => ({ error: "Error parsing server response" }));
                let errorMessage = errorData.error || `Failed to generate content: ${response.status}`;
                if (response.status === 401) errorMessage = "Your session may have expired. Please login again.";
                setAiError(errorMessage);
                if (mode === 'explain') setIsExplainGeneratedForCurrentWord(false);
            }
        } catch (error: any) {
            setAiError(error.name === 'TimeoutError' ? `Request for ${mode} content timed out. Please try again.` : `Network error fetching ${mode} content.`);
            console.error(`Error fetching AI content for ${mode}:`, error);
            if (mode === 'explain') setIsExplainGeneratedForCurrentWord(false);
        } finally {
            setIsLoadingExplanation(false);
        }
    };

    const handleToggleFavoriteApp = async (currentWordDisplay: string, currentFavStatus: boolean) => {
        if (!user) { setAiError("Please login to favorite words."); handleShowLoginModal(currentWordDisplay); return; }
        if (inputQuestion === currentWordDisplay) setCurrentTutorWordIsFavorite(!currentFavStatus);
        try {
            const response = await fetch(`${API_BASE_URL}/toggle_favorite`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ word: currentWordDisplay }) });
            if (response.ok) await refreshProfileData();
            else { if (inputQuestion === currentWordDisplay) setCurrentTutorWordIsFavorite(currentFavStatus); const errData = await response.json().catch(() => ({ error: "Failed to toggle favorite on server" })); setAiError(errData.error || "Could not update favorite status."); await refreshProfileData(); }
        } catch (err) { if (inputQuestion === currentWordDisplay) setCurrentTutorWordIsFavorite(currentFavStatus); setAiError("Network error toggling favorite."); await refreshProfileData(); }
    };

    const handleHighlightedWordClick = (word: string) => {
        if (!user) { handleShowLoginModal(word); return; }
        setCurrentStreak(prevStreak => [...prevStreak, word]);
        setInputQuestion(word);
        setGeneratedContents({ explain: '', image: 'Image generation feature coming soon!', fact: '', quiz: '', deep: 'In-depth explanation feature coming soon!' });
        setActiveMode('explain'); setIsExplainGeneratedForCurrentWord(false); setAiError(null); setCurrentTutorWordIsFavorite(null);
        triggerGenerateExplanation(word, 'explain', false, false, undefined);
    };

    const handleAppSetInputQuestion = (value: string) => {
        if (inputQuestion.trim() !== value.trim() && value.trim() !== '') {
            finalizeCurrentStreak();
            setCurrentStreak([]);
        } else if (value.trim() === '' && inputQuestion.trim() !== '') {
            finalizeCurrentStreak();
            setCurrentStreak([]);
        }
        setInputQuestion(value);
        setAiError(null); setIsExplainGeneratedForCurrentWord(false);
        setGeneratedContents({ explain: '', image: 'Image generation feature coming soon!', fact: '', quiz: '', deep: 'In-depth explanation feature coming soon!' });
        setActiveMode('explain');
    };

    const handleAppClearInput = () => {
        finalizeCurrentStreak();
        setInputQuestion(''); setCurrentStreak([]);
        setGeneratedContents({ explain: '', image: 'Image generation feature coming soon!', fact: '', quiz: '', deep: 'In-depth explanation feature coming soon!' });
        setActiveMode('explain'); setAiError(null); setIsExplainGeneratedForCurrentWord(false);
    };

    const handleRefreshCurrentWord = () => {
        if (!inputQuestion.trim()) return;
        triggerGenerateExplanation(inputQuestion, activeMode, false, true, undefined);
    };

    const handleShowLoginModal = (question: string) => { questionBeforeModalRef.current = question; setAuthModalMode('login'); setShowAuthModal(true); };
    const handleShowSignupModal = (question: string) => { questionBeforeModalRef.current = question; setAuthModalMode('signup'); setShowAuthModal(true); };
    const handleLogout = () => {
        finalizeCurrentStreak();
        authLogout(); setCurrentPage('tutor'); setInputQuestion('');
        setGeneratedContents({ explain: '', image: 'Image generation feature coming soon!', fact: '', quiz: '', deep: 'In-depth explanation feature coming soon!' });
        setActiveMode('explain'); setAiError(null); setIsExplainGeneratedForCurrentWord(false); setProfileData(null); setCurrentTutorWordIsFavorite(null);
        setShowStreakHistoryModal(false); setStreakHistoryModalData(null); setCompletedStreaks([]);
    };
    const handleWordClickFromProfile = (word: string, cachedContent?: Partial<Record<ContentMode, string>>) => {
        finalizeCurrentStreak();
        setInputQuestion(word); setCurrentStreak([word]);
        const initialContent = { explain: cachedContent?.explain || '', image: cachedContent?.image || 'Image generation feature coming soon!', fact: cachedContent?.fact || '', quiz: cachedContent?.quiz || '', deep: cachedContent?.deep || 'In-depth explanation feature coming soon!', };
        setGeneratedContents(initialContent);
        if (initialContent.explain && initialContent.explain.trim() !== '') { setActiveMode('explain'); setIsExplainGeneratedForCurrentWord(true); }
        else { setActiveMode('explain'); setIsExplainGeneratedForCurrentWord(false); }
        setCurrentPage('tutor');
    };

    const handleShowStreakHistory = () => {
        setStreakHistoryModalData({ streaks: [...completedStreaks] });
        setShowStreakHistoryModal(true);
    };

    useEffect(() => { if (!user && currentPage === 'profile') setCurrentPage('tutor'); }, [user, currentPage]);
    if (authLoadingGlobal) return <div className="flex items-center justify-center min-h-screen bg-gray-100 text-2xl">Loading Application...</div>;

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-blue-800 font-inter text-gray-900 p-2 sm:p-4 overflow-y-auto">
            <header className="w-full max-w-5xl mx-auto py-2.5 px-2 sm:px-4 flex justify-end items-center sticky top-0 z-30 bg-blue-800/95 backdrop-blur-sm">
                {user && (<div className="flex items-center gap-2 sm:gap-3">{currentPage === 'tutor' && (<button onClick={() => { finalizeCurrentStreak(); setProfileData(null); setCurrentPage('profile'); }} className="py-1 px-3 sm:py-2 sm:px-4 bg-white/20 text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-white/30 shadow">View Profile</button>)}<button onClick={handleLogout} className="py-1 px-3 sm:py-2 sm:px-4 bg-red-500 text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-red-600 shadow">Logout</button></div>)}
            </header>
            <main className="w-full flex justify-center items-center flex-grow mt-2 mb-auto">
                {currentPage === 'tutor' ? (
                    <TinyTutorAppContent
                        inputQuestion={inputQuestion}
                        onInputChange={handleAppSetInputQuestion}
                        onClearInput={handleAppClearInput}
                        generatedContents={generatedContents}
                        activeMode={activeMode} setActiveMode={setActiveMode}
                        triggerGenerateExplanation={triggerGenerateExplanation}
                        isLoadingExplanation={isLoadingExplanation}
                        aiError={aiError}
                        setAiError={setAiError} // Pass setAiError
                        currentUser={user}
                        setShowLoginModal={handleShowLoginModal}
                        setShowSignupModal={setShowSignupModal}
                        isExplainGeneratedForCurrentWord={isExplainGeneratedForCurrentWord}
                        onToggleFavorite={handleToggleFavoriteApp} currentWordIsFavorite={currentTutorWordIsFavorite}
                        handleHighlightedWordClick={handleHighlightedWordClick}
                        onShowStreakHistory={handleShowStreakHistory}
                        handleRefreshCurrentWord={handleRefreshCurrentWord}
                    />
                ) : (
                    <ProfilePage setCurrentPage={setCurrentPage} getAuthHeaders={getAuthHeaders} user={user} onWordClick={handleWordClickFromProfile} handleToggleFavoriteApp={handleToggleFavoriteApp} profileDataHook={[profileData, setProfileData]} />
                )}
            </main>
            {showAuthModal && (<AuthModal onClose={() => { setShowAuthModal(false); }}
                onLoginSuccess={async (loggedInUserFromModal, questionAfterLogin) => {
                    setShowAuthModal(false); setAiError(null);
                    if (questionAfterLogin.trim() !== '') {
                        setInputQuestion(questionAfterLogin);
                        finalizeCurrentStreak();
                        setCurrentStreak([questionAfterLogin]);
                        await triggerGenerateExplanation(questionAfterLogin, 'explain', true, false, loggedInUserFromModal);
                    } else {
                        setGeneratedContents(prev => ({ ...prev, explain: "Welcome! Enter a concept to get started." }));
                        setIsExplainGeneratedForCurrentWord(false);
                        finalizeCurrentStreak();
                        setCurrentStreak([]);
                    }
                    questionBeforeModalRef.current = '';
                }}
                initialQuestion={questionBeforeModalRef.current} initialMode={authModalMode} />)}
            <WordStreakHistoryModal isOpen={showStreakHistoryModal} onClose={() => { setShowStreakHistoryModal(false); }} modalData={streakHistoryModalData} />
            <footer className="text-center py-2 text-xs text-blue-200 flex-shrink-0">Tiny Tutor App &copy; {new Date().getFullYear()}</footer>
        </div>
    );
};

const AppWithAuthProvider: React.FC = () => (<AuthProvider><App /></AuthProvider>);
export default AppWithAuthProvider;

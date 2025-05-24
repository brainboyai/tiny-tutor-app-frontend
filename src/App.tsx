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
    id: string;
    word: string;
    is_favorite: boolean;
    last_explored_at?: string;
    generated_content_cache?: Partial<Record<ContentMode, string>>;
    modes_generated?: string[];
}

interface ProfileData {
    username: string;
    tier: string;
    explored_words_count: number;
    explored_words_list: ExploredWord[];
    favorite_words_list: ExploredWord[];
}

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
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }), });
            if (response.ok) {
                const data = await response.json(); localStorage.setItem('access_token', data.access_token);
                const decodedUser: CustomJwtPayload = jwtDecode(data.access_token);
                const newUser = { id: decodedUser.user_id, username: decodedUser.username, tier: decodedUser.tier, exp: decodedUser.exp };
                setUser(newUser); return newUser;
            }
            console.error('Login failed:', await response.text()); return null;
        } catch (error) { console.error('Network error during login:', error); return null; }
        finally { setLoading(false); }
    };
    const signup = async (username: string, email: string, password: string): Promise<boolean> => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/signup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, email, password }), });
            if (response.ok) return true;
            console.error('Signup failed:', await response.text()); return false;
        } catch (error) { console.error('Network error during signup:', error); return false; }
        finally { setLoading(false); }
    };
    const logout = async (): Promise<void> => { localStorage.removeItem('access_token'); setUser(null); };

    useEffect(() => {
        const checkAuthStatus = () => {
            setLoading(true);
            try {
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
            if (loggedInUser) await onLoginSuccess(loggedInUser, initialQuestion); else setError('Login failed. Invalid credentials.');
        } else {
            const signedUp = await signup(username, email, password);
            if (signedUp) { setError('Signup successful! Please log in.'); setIsLoginMode(true); setPassword(''); } else setError('Signup failed. User might exist or data invalid.');
        }
        setIsLoading(false);
    };
    return (<div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4"><div className="bg-white p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-md relative"><button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-2xl" aria-label="Close modal">&times;</button><h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">{isLoginMode ? 'Login' : 'Sign Up'}</h2><form onSubmit={handleSubmit}><div className="mb-4"><label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="modal-username">Username</label><input type="text" id="modal-username" className="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" value={username} onChange={(e) => setUsername(e.target.value)} required /></div>{!isLoginMode && (<div className="mb-4"><label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="modal-email">Email</label><input type="email" id="modal-email" className="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" value={email} onChange={(e) => setEmail(e.target.value)} required={!isLoginMode} /></div>)}<div className="mb-6"><label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="modal-password">Password</label><input type="password" id="modal-password" className="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500" value={password} onChange={(e) => setPassword(e.target.value)} required /></div>{error && <p className="text-red-500 text-xs italic mb-4 text-center">{error}</p>}<div className="flex flex-col sm:flex-row items-center justify-between gap-4"><button type="submit" className="w-full sm:w-auto bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded focus:outline-none focus:shadow-outline transition-colors duration-150 flex items-center justify-center" disabled={isLoading || authHookLoading}>{isLoading || authHookLoading ? <><svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Processing...</> : (isLoginMode ? 'Login' : 'Sign Up')}</button><button type="button" onClick={() => { setIsLoginMode(!isLoginMode); setError(null); }} className="w-full sm:w-auto font-bold text-sm text-blue-500 hover:text-blue-800">{isLoginMode ? 'Need an account? Sign Up' : 'Already have an account? Login'}</button></div></form></div></div>);
};

interface TinyTutorAppContentProps {
    inputQuestion: string; setInputQuestion: React.Dispatch<React.SetStateAction<string>>;
    generatedContents: Record<ContentMode, string>; setGeneratedContents: React.Dispatch<React.SetStateAction<Record<ContentMode, string>>>;
    activeMode: ContentMode; setActiveMode: React.Dispatch<React.SetStateAction<ContentMode>>;
    generateExplanation: (question: string, mode: ContentMode, forceCheckUser?: User | null) => Promise<void>;
    isLoadingExplanation: boolean; aiError: string | null; setAiError: React.Dispatch<React.SetStateAction<string | null>>;
    currentUser: User | null; setShowLoginModal: (question: string) => void; setShowSignupModal: (question: string) => void;
    isExplainGeneratedForCurrentWord: boolean; setIsExplainGeneratedForCurrentWord: React.Dispatch<React.SetStateAction<boolean>>;
}
const TinyTutorAppContent: React.FC<TinyTutorAppContentProps> = ({
    inputQuestion, setInputQuestion, generatedContents, setGeneratedContents, activeMode, setActiveMode,
    generateExplanation, isLoadingExplanation, aiError, setAiError, currentUser,
    setShowLoginModal, setShowSignupModal, isExplainGeneratedForCurrentWord, setIsExplainGeneratedForCurrentWord
}) => {
    const loggedIn = currentUser !== null;
    const questionBeforeModalRef = useRef('');

    const handleGenerateExplanationClick = () => {
        setAiError(null);
        if (!loggedIn) { questionBeforeModalRef.current = inputQuestion; setShowLoginModal(inputQuestion); return; }
        if (inputQuestion.trim() === '') { setAiError('Please enter a concept.'); return; }
        setGeneratedContents({ explain: '', image: 'Image generation feature coming soon!', fact: '', quiz: '', deep: 'In-depth explanation feature coming soon!' });
        setActiveMode('explain'); setIsExplainGeneratedForCurrentWord(false);
        generateExplanation(inputQuestion, 'explain');
    };
    const handleClearInput = () => { setInputQuestion(''); setGeneratedContents({ explain: '', image: 'Image generation feature coming soon!', fact: '', quiz: '', deep: 'In-depth explanation feature coming soon!' }); setActiveMode('explain'); setAiError(null); setIsExplainGeneratedForCurrentWord(false); };
    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => { setInputQuestion(e.target.value); setAiError(null); if (isExplainGeneratedForCurrentWord) { setIsExplainGeneratedForCurrentWord(false); } setGeneratedContents({ explain: '', image: 'Image generation feature coming soon!', fact: '', quiz: '', deep: 'In-depth explanation feature coming soon!' }); setActiveMode('explain'); };
    const currentExplanationContent = generatedContents[activeMode];
    const showContentBoxStructure = loggedIn || aiError || (!loggedIn && inputQuestion.trim() !== '');

    return (
        <div className="bg-white p-4 md:p-5 rounded-xl shadow-2xl w-full max-w-lg sm:max-w-xl md:max-w-2xl lg:max-w-3xl mx-auto flex flex-col min-h-[600px] max-h-[85vh] sm:max-h-[700px] overflow-hidden">
            <div className="flex-shrink-0">
                <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-center text-gray-800 mb-1 sm:mb-2">Tiny Tutor {loggedIn && currentUser?.username && <span className="text-indigo-600">({currentUser.username})</span>}</h2>
                {loggedIn && currentUser && (<p className="text-center text-gray-600 text-xs sm:text-sm mb-2 sm:mb-3">Your tier: <span className="font-semibold text-blue-600">{currentUser.tier}</span></p>)}
            </div>
            <div className="mb-2 sm:mb-3 p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200 flex-shrink-0">
                <label htmlFor="question-input-main" className="block text-gray-700 text-sm sm:text-base md:text-lg font-bold mb-1 sm:mb-2">Enter a word or concept:</label>
                <div className="relative"><input type="text" id="question-input-main" className="w-full px-3 py-2 sm:py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-400 text-xs sm:text-sm md:text-base" placeholder="e.g., Photosynthesis" value={inputQuestion} onChange={handleInputChange} disabled={isLoadingExplanation} />{inputQuestion && (<button onClick={handleClearInput} className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 text-base sm:text-lg md:text-xl" aria-label="Clear input">&times;</button>)}</div>
                <button onClick={handleGenerateExplanationClick} className="mt-2.5 sm:mt-3 w-full sm:w-auto sm:mx-auto sm:px-6 md:px-8 bg-indigo-600 text-white py-2 sm:py-2.5 px-4 rounded-lg font-bold text-sm sm:text-base hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-300 transition active:scale-95 shadow-lg flex items-center justify-center" disabled={isLoadingExplanation || inputQuestion.trim() === ''}>{isLoadingExplanation && activeMode === 'explain' ? <><svg className="animate-spin -ml-1 mr-2 h-4 w-4 sm:h-5 sm:w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle opacity="25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path opacity="75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Generating...</> : 'Generate Explanation'}</button>
                {aiError && <p className="text-red-600 text-center text-xs font-medium mt-1 sm:mt-1.5">{aiError}</p>}
                {!loggedIn && !aiError && (<p className="text-gray-600 text-center text-xs mt-1 sm:mt-1.5"><button onClick={() => setShowSignupModal(inputQuestion)} className="font-semibold text-blue-600 hover:underline">Sign up</button>{' '}or{' '}<button onClick={() => setShowLoginModal(inputQuestion)} className="font-semibold text-blue-600 hover:underline">Login</button>{' '}to generate explanations.</p>)}
            </div>
            <div className={`flex-shrink-0 flex flex-wrap justify-center gap-1 sm:gap-1.5 mb-2 sm:mb-3 transition-all duration-300 ${loggedIn && inputQuestion.trim() !== '' && isExplainGeneratedForCurrentWord ? 'opacity-100 h-auto mt-1 sm:mt-2' : 'opacity-0 h-0 mt-0 pointer-events-none'}`}>
                {(['explain', 'image', 'fact', 'quiz', 'deep'] as ContentMode[]).map(mode => (<button key={mode} onClick={async () => { if (!loggedIn || !isExplainGeneratedForCurrentWord || inputQuestion.trim() === '') return; setAiError(null); setActiveMode(mode); if (!generatedContents[mode] || mode === 'explain' || (mode === 'image' && generatedContents.image === 'Image generation feature coming soon!') || (mode === 'deep' && generatedContents.deep === 'In-depth explanation feature coming soon!')) { await generateExplanation(inputQuestion, mode); } }} className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full font-semibold text-xs sm:text-sm transition-all duration-200 ${activeMode === mode ? 'bg-blue-600 text-white shadow-md scale-105' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'} ${mode !== 'explain' && !isExplainGeneratedForCurrentWord ? 'opacity-50 cursor-not-allowed' : ''} `} disabled={(isLoadingExplanation && activeMode !== mode) || (mode !== 'explain' && !isExplainGeneratedForCurrentWord)}>{mode.charAt(0).toUpperCase() + mode.slice(1)}{isLoadingExplanation && activeMode === mode && <svg className="animate-spin ml-1 sm:ml-1.5 -mr-0.5 h-3 w-3 sm:h-3.5 sm:w-3.5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle opacity="25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path opacity="75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}</button>))}
            </div>
            <div className="flex-grow p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200 shadow-inner overflow-y-auto overflow-x-hidden relative min-h-[250px] sm:min-h-[300px] md:min-h-[320px]">
                {showContentBoxStructure ? (<div className="prose prose-sm sm:prose-base md:prose-lg max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap break-words pt-1">{isLoadingExplanation && !currentExplanationContent ? (<div className="flex items-center justify-center text-gray-500"><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle opacity="25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path opacity="75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Generating {activeMode} content...</div>) : (currentExplanationContent || (loggedIn && aiError ? <p className="text-red-600">{aiError}</p> : <p className="text-gray-500">{loggedIn ? "Enter a concept or select a mode." : "Login to see explanations."}</p>))}</div>) : (<div className="flex items-center justify-center h-full"><p className="text-gray-400 text-center text-sm sm:text-base">{loggedIn ? "Your generated content will appear here." : "Login to see explanations."}</p></div>)}
            </div>
        </div>
    );
};

interface ProfilePageProps {
    setCurrentPage: (page: Page) => void;
    getAuthHeaders: () => Record<string, string>;
    user: User | null;
    onWordClick: (word: string, cachedContent?: Partial<Record<ContentMode, string>>) => void;
}
const ProfilePage: React.FC<ProfilePageProps> = ({ setCurrentPage, getAuthHeaders, user, onWordClick }) => {
    const [profileData, setProfileData] = useState<ProfileData | null>(null);
    const [isLoadingProfile, setIsLoadingProfile] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) { setCurrentPage('tutor'); return; }
        const fetchProfileData = async () => {
            setIsLoadingProfile(true); setProfileError(null);
            try {
                const response = await fetch(`${API_BASE_URL}/profile`, { headers: getAuthHeaders(), });
                if (response.ok) { setProfileData(await response.json()); }
                else { const errData = await response.json().catch(() => ({ error: "Failed to fetch profile" })); setProfileError(errData.error || "Could not load profile data."); }
            } catch (err) { setProfileError("Network error fetching profile."); console.error(err); }
            finally { setIsLoadingProfile(false); }
        };
        fetchProfileData();
    }, [user, getAuthHeaders, setCurrentPage]);

    const handleToggleFavorite = async (wordId: string, currentWordDisplay: string, currentFavStatus: boolean) => {
        const originalProfileData = profileData ? JSON.parse(JSON.stringify(profileData)) : null;
        if (profileData) {
            const updatedExploredList = profileData.explored_words_list.map(w => w.id === wordId ? { ...w, is_favorite: !currentFavStatus } : w);
            const wordForFavList = updatedExploredList.find(w => w.id === wordId);
            let updatedFavoriteList;
            if (!currentFavStatus && wordForFavList) { updatedFavoriteList = [...profileData.favorite_words_list, wordForFavList].sort((a, b) => (b.last_explored_at || "").localeCompare(a.last_explored_at || "")); }
            else { updatedFavoriteList = profileData.favorite_words_list.filter(w => w.id !== wordId); }
            setProfileData({ ...profileData, explored_words_list: updatedExploredList, favorite_words_list: updatedFavoriteList });
        }
        try {
            const response = await fetch(`${API_BASE_URL}/toggle_favorite`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ word: currentWordDisplay }) });
            if (!response.ok) { setProfileData(originalProfileData); const errData = await response.json().catch(() => ({ error: "Failed to toggle favorite" })); setProfileError(errData.error || "Could not update favorite status."); }
            else { console.log("Favorite toggled:", (await response.json()).message); }
        } catch (err) { setProfileData(originalProfileData); setProfileError("Network error toggling favorite."); }
    };

    const WordListItem: React.FC<{ item: ExploredWord, onToggleFavorite: () => void, onWordItemClick: () => void }> = ({ item, onToggleFavorite, onWordItemClick }) => (
        <li className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex justify-between items-center hover:bg-gray-100 transition-colors duration-150 group">
            <div className="flex-1 min-w-0 mr-2 cursor-pointer group-hover:text-indigo-600" onClick={onWordItemClick} title={`View details for "${item.word}"`}>
                <span className="font-medium text-gray-700 block truncate group-hover:underline">{item.word}</span>
                <p className="text-xs text-gray-400">Last seen: {item.last_explored_at ? new Date(item.last_explored_at).toLocaleDateString() : 'N/A'}</p>
            </div>
            <button onClick={onToggleFavorite} className={`text-xl p-1 rounded-full hover:bg-yellow-200 ${item.is_favorite ? 'text-yellow-500' : 'text-gray-300 hover:text-yellow-400'}`} title={item.is_favorite ? "Remove from favorites" : "Add to favorites"}>
                {item.is_favorite ? '\u2605' : '\u2606'}
            </button>
        </li>
    );

    if (isLoadingProfile) return <div className="text-center p-10 text-white text-lg">Loading profile... <svg className="animate-spin inline h-5 w-5 text-white ml-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>;
    if (profileError) return <div className="text-center p-10 text-red-300 bg-red-800 bg-opacity-30 rounded-lg">Error: {profileError} <button onClick={() => setCurrentPage('tutor')} className="text-blue-300 hover:underline ml-2">Go Back</button></div>;
    if (!profileData) return <div className="text-center p-10 text-white">No profile data found. <button onClick={() => setCurrentPage('tutor')} className="text-blue-300 hover:underline ml-2">Go Back</button></div>;

    return (<div className="bg-white p-4 md:p-6 rounded-xl shadow-2xl w-full max-w-xl md:max-w-2xl lg:max-w-3xl mx-auto min-h-[600px] max-h-[85vh] sm:max-h-[700px] flex flex-col overflow-hidden"><div className="flex justify-between items-center mb-3 sm:mb-4 flex-shrink-0"><h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 truncate">{profileData.username}'s Profile</h2><button onClick={() => setCurrentPage('tutor')} className="py-1.5 px-3 sm:py-2 sm:px-4 bg-indigo-600 text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-indigo-700 transition">&larr; Back to Tutor</button></div><p className="text-gray-600 mb-0.5 text-xs sm:text-sm">Tier: <span className="font-semibold">{profileData.tier}</span></p><p className="text-gray-600 mb-3 sm:mb-4 text-xs sm:text-sm">Words Explored: <span className="font-semibold">{profileData.explored_words_count}</span></p><div className="flex-grow overflow-y-auto space-y-4 sm:space-y-6 pr-1"><div><h3 className="text-lg sm:text-xl font-semibold text-gray-700 mb-1.5 sm:mb-2 sticky top-0 bg-white py-1 z-10 border-b">Favorite Words ({profileData.favorite_words_list.length})</h3>{profileData.favorite_words_list.length > 0 ? (<ul className="space-y-2">{profileData.favorite_words_list.map(item => (<WordListItem key={`fav-${item.id}`} item={item} onToggleFavorite={() => handleToggleFavorite(item.id, item.word, item.is_favorite)} onWordItemClick={() => onWordClick(item.word, item.generated_content_cache)} />))}</ul>) : <p className="text-gray-500 text-sm px-1">No favorite words yet.</p>}</div><div><h3 className="text-lg sm:text-xl font-semibold text-gray-700 mb-1.5 sm:mb-2 sticky top-0 bg-white py-1 z-10 border-b">All Explored Words ({profileData.explored_words_list.length})</h3>{profileData.explored_words_list.length > 0 ? (<ul className="space-y-2">{profileData.explored_words_list.map(item => (<WordListItem key={`exp-${item.id}`} item={item} onToggleFavorite={() => handleToggleFavorite(item.id, item.word, item.is_favorite)} onWordItemClick={() => onWordClick(item.word, item.generated_content_cache)} />))}</ul>) : <p className="text-gray-500 text-sm px-1">No words explored yet.</p>}</div></div></div>);
};

const App: React.FC = () => {
    const { user, loading: authLoadingGlobal, logout: authLogout } = useAuth();
    const [currentPage, setCurrentPage] = useState<Page>('tutor');
    const [inputQuestion, setInputQuestion] = useState('');
    const [generatedContents, setGeneratedContents] = useState<Record<ContentMode, string>>({ explain: '', image: 'Image generation feature coming soon!', fact: '', quiz: '', deep: 'In-depth explanation feature coming soon!' });
    const [activeMode, setActiveMode] = useState<ContentMode>('explain');
    const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');
    const questionBeforeModalRef = useRef('');
    const [isExplainGeneratedForCurrentWord, setIsExplainGeneratedForCurrentWord] = useState(false);

    const getAuthHeaders = () => {
        const token = localStorage.getItem('access_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    };

    const generateExplanation = async (questionToGenerate: string, mode: ContentMode, forceCheckUser?: User | null) => {
        const currentUserToCheck = forceCheckUser !== undefined ? forceCheckUser : user;
        if (!currentUserToCheck) {
            setAiError("Please login to generate explanations.");
            if (forceCheckUser === undefined) handleShowLoginModal(questionToGenerate);
            return;
        }
        setAiError(null); setIsLoadingExplanation(true);

        if (mode === 'image') {
            setGeneratedContents(cc => ({ ...cc, image: 'Image generation feature coming soon!' }));
            setIsLoadingExplanation(false);
            fetch(`${API_BASE_URL}/generate_explanation`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ question: questionToGenerate, content_type: 'image' }) }).catch(console.error);
            return;
        }
        if (mode === 'deep') {
            setGeneratedContents(cc => ({ ...cc, deep: 'In-depth explanation feature coming soon!' }));
            setIsLoadingExplanation(false);
            fetch(`${API_BASE_URL}/generate_explanation`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify({ question: questionToGenerate, content_type: 'deep' }) }).catch(console.error);
            return;
        }

        try {
            const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
                method: 'POST', headers: getAuthHeaders(),
                body: JSON.stringify({ question: questionToGenerate, content_type: mode }),
                signal: AbortSignal.timeout(30000)
            });
            if (response.ok) {
                const data = await response.json();
                setGeneratedContents(cc => ({ ...cc, [mode]: data.explanation }));
                if (mode === 'explain' && data.explanation && data.explanation.trim() !== '') {
                    setIsExplainGeneratedForCurrentWord(true);
                }
            } else {
                const errorData = await response.json().catch(() => ({ error: "Parse error" }));
                let errorMessage = errorData.error || `Failed: ${response.status}`;
                if (response.status === 401) errorMessage = "Session expired. Please login again.";
                setAiError(errorMessage);
                if (mode === 'explain') setIsExplainGeneratedForCurrentWord(false);
            }
        } catch (error: any) {
            setAiError(error.name === 'TimeoutError' ? `Request for ${mode} content timed out.` : `Network error for ${mode}.`);
            console.error(`Error fetching AI for ${mode}:`, error);
            if (mode === 'explain') setIsExplainGeneratedForCurrentWord(false);
        } finally {
            setIsLoadingExplanation(false);
        }
    };

    const handleShowLoginModal = (question: string) => { questionBeforeModalRef.current = question; setAuthModalMode('login'); setShowAuthModal(true); };
    const handleShowSignupModal = (question: string) => { questionBeforeModalRef.current = question; setAuthModalMode('signup'); setShowAuthModal(true); };
    const handleLogout = () => { authLogout(); setCurrentPage('tutor'); setInputQuestion(''); setGeneratedContents({ explain: '', image: 'Image generation feature coming soon!', fact: '', quiz: '', deep: 'In-depth explanation feature coming soon!' }); setActiveMode('explain'); setAiError(null); setIsExplainGeneratedForCurrentWord(false); };

    const handleWordClickFromProfile = (word: string, cachedContent?: Partial<Record<ContentMode, string>>) => {
        setInputQuestion(word);
        const initialContent = {
            explain: cachedContent?.explain || '',
            image: cachedContent?.image || 'Image generation feature coming soon!',
            fact: cachedContent?.fact || '',
            quiz: cachedContent?.quiz || '',
            deep: cachedContent?.deep || 'In-depth explanation feature coming soon!',
        };
        setGeneratedContents(initialContent);

        if (initialContent.explain) {
            setActiveMode('explain');
            setIsExplainGeneratedForCurrentWord(true);
        } else {
            // If no cached 'explain', user will need to click "Generate Explanation"
            setActiveMode('explain'); // Default to explain tab
            setIsExplainGeneratedForCurrentWord(false);
        }
        setCurrentPage('tutor');
    };

    useEffect(() => { if (!user && currentPage === 'profile') { setCurrentPage('tutor'); } }, [user, currentPage]);

    if (authLoadingGlobal) return <div className="flex items-center justify-center min-h-screen bg-gray-100 text-2xl">Loading...</div>;

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-blue-700 font-inter text-gray-900 p-2 sm:p-4 overflow-y-auto"> {/* Solid darker blue bg */}
            <header className="w-full max-w-5xl mx-auto py-2.5 px-2 sm:px-4 flex justify-end items-center sticky top-0 z-30 bg-blue-700/80 backdrop-blur-sm"> {/* Slightly more opaque header */}
                {user && (
                    <div className="flex items-center gap-2 sm:gap-3">
                        {currentPage === 'tutor' && (
                            <button onClick={() => setCurrentPage('profile')} className="py-1 px-3 sm:py-2 sm:px-4 bg-white/20 text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-white/30 shadow">
                                View Profile
                            </button>
                        )}
                        {/* Only show "Back to Tutor" if on profile page, otherwise only Logout */}
                        {currentPage === 'profile' && (
                            <button onClick={() => setCurrentPage('tutor')} className="py-1 px-3 sm:py-2 sm:px-4 bg-white/20 text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-white/30 shadow">
                                &larr; Back to Tutor
                            </button>
                        )}
                        <button onClick={handleLogout} className="py-1 px-3 sm:py-2 sm:px-4 bg-red-500 text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-red-600 shadow">
                            Logout
                        </button>
                    </div>
                )}
            </header>
            <main className="w-full flex justify-center items-center flex-grow mt-2 mb-auto">
                {currentPage === 'tutor' ? (
                    <TinyTutorAppContent
                        inputQuestion={inputQuestion} setInputQuestion={setInputQuestion}
                        generatedContents={generatedContents} setGeneratedContents={setGeneratedContents}
                        activeMode={activeMode} setActiveMode={setActiveMode}
                        generateExplanation={generateExplanation} isLoadingExplanation={isLoadingExplanation}
                        aiError={aiError} setAiError={setAiError} currentUser={user}
                        setShowLoginModal={handleShowLoginModal} setShowSignupModal={handleShowSignupModal}
                        isExplainGeneratedForCurrentWord={isExplainGeneratedForCurrentWord}
                        setIsExplainGeneratedForCurrentWord={setIsExplainGeneratedForCurrentWord}
                    />
                ) : (
                    <ProfilePage
                        setCurrentPage={setCurrentPage}
                        getAuthHeaders={getAuthHeaders}
                        user={user}
                        onWordClick={handleWordClickFromProfile}
                    />
                )}
            </main>
            {showAuthModal && (<AuthModal onClose={() => { setShowAuthModal(false); }} onLoginSuccess={async (loggedInUser, questionAfterLogin) => { setShowAuthModal(false); setAiError(null); if (questionAfterLogin.trim() !== '') { setInputQuestion(questionAfterLogin); await generateExplanation(questionAfterLogin, 'explain', loggedInUser); } else { setGeneratedContents(prev => ({ ...prev, explain: "Welcome! Enter a concept." })); setIsExplainGeneratedForCurrentWord(false); } questionBeforeModalRef.current = ''; }} initialQuestion={questionBeforeModalRef.current} initialMode={authModalMode} />)}
            <footer className="text-center py-2 text-xs text-blue-200 flex-shrink-0">Tiny Tutor App &copy; {new Date().getFullYear()}</footer>
        </div>
    );
};

const AppWithAuthProvider: React.FC = () => <AuthProvider><App /></AuthProvider>;
export default AppWithAuthProvider;

import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { jwtDecode, JwtPayload } from 'jwt-decode';

// --- Constants ---
const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';

// --- AuthContext Definition ---
interface CustomJwtPayload extends JwtPayload {
    username: string;
    tier: string;
}

interface User {
    username: string;
    tier: string;
    exp?: number;
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (username: string, password: string) => Promise<User | null>;
    signup: (username: string, email: string, password: string) => Promise<boolean>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    const login = async (username: string, password: string): Promise<User | null> => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });
            if (response.ok) {
                const data = await response.json();
                localStorage.setItem('access_token', data.access_token);
                const decodedUser: CustomJwtPayload = jwtDecode(data.access_token);
                const newUser = { username: decodedUser.username, tier: decodedUser.tier, exp: decodedUser.exp };
                setUser(newUser);
                return newUser;
            }
            console.error('Login failed:', await response.text());
            return null;
        } catch (error) {
            console.error('Network error during login:', error);
            return null;
        } finally {
            setLoading(false);
        }
    };

    const signup = async (username: string, email: string, password: string): Promise<boolean> => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password }),
            });
            if (response.ok) return true;
            console.error('Signup failed:', await response.text());
            return false;
        } catch (error) {
            console.error('Network error during signup:', error);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const logout = async (): Promise<void> => {
        localStorage.removeItem('access_token');
        setUser(null);
    };

    useEffect(() => {
        const checkAuthStatus = () => {
            setLoading(true);
            try {
                const token = localStorage.getItem('access_token');
                if (token) {
                    const decodedUser: CustomJwtPayload = jwtDecode(token);
                    if (decodedUser.exp && decodedUser.exp * 1000 < Date.now()) {
                        localStorage.removeItem('access_token');
                        setUser(null);
                    } else {
                        setUser({ username: decodedUser.username, tier: decodedUser.tier, exp: decodedUser.exp });
                    }
                } else {
                    setUser(null);
                }
            } catch (error) {
                localStorage.removeItem('access_token');
                setUser(null);
            } finally {
                setLoading(false);
            }
        };
        checkAuthStatus();
        const handleStorageChange = (event: StorageEvent) => {
            if (event.key === 'access_token' && !event.newValue) setUser(null);
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    return <AuthContext.Provider value={{ user, loading, login, signup, logout }}>{children}</AuthContext.Provider>;
};

interface AuthModalProps {
    onClose: () => void;
    onLoginSuccess: (loggedInUser: User, question: string) => Promise<void>;
    initialQuestion: string;
    initialMode: 'login' | 'signup';
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose, onLoginSuccess, initialQuestion, initialMode }) => {
    const { login, signup, loading: authHookLoading } = useAuth();
    const [isLoginMode, setIsLoginMode] = useState(initialMode === 'login');
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null); setIsLoading(true);
        if (isLoginMode) {
            const loggedInUser = await login(username, password);
            if (loggedInUser) await onLoginSuccess(loggedInUser, initialQuestion);
            else setError('Login failed. Invalid credentials.');
        } else {
            const signedUp = await signup(username, email, password);
            if (signedUp) { setError('Signup successful! Please log in.'); setIsLoginMode(true); setPassword(''); }
            else setError('Signup failed. User might exist or data invalid.');
        }
        setIsLoading(false);
    };

    return (
        <div className="fixed inset-0 bg-gray-800 bg-opacity-75 flex items-center justify-center z-50 p-4">
            <div className="bg-white p-6 sm:p-8 rounded-lg shadow-xl w-full max-w-md relative">
                <button onClick={onClose} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 text-2xl" aria-label="Close modal">&times;</button>
                <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">{isLoginMode ? 'Login' : 'Sign Up'}</h2>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="modal-username">Username</label>
                        <input type="text" id="modal-username" className="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" value={username} onChange={(e) => setUsername(e.target.value)} required />
                    </div>
                    {!isLoginMode && (
                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="modal-email">Email</label>
                            <input type="email" id="modal-email" className="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500" value={email} onChange={(e) => setEmail(e.target.value)} required={!isLoginMode} />
                        </div>
                    )}
                    <div className="mb-6">
                        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="modal-password">Password</label>
                        <input type="password" id="modal-password" className="shadow appearance-none border rounded w-full py-3 px-4 text-gray-700 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500" value={password} onChange={(e) => setPassword(e.target.value)} required />
                    </div>
                    {error && <p className="text-red-500 text-xs italic mb-4 text-center">{error}</p>}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                        <button type="submit" className="w-full sm:w-auto bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded focus:outline-none focus:shadow-outline transition-colors duration-150 flex items-center justify-center" disabled={isLoading || authHookLoading}>
                            {isLoading || authHookLoading ? <><svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Processing...</> : (isLoginMode ? 'Login' : 'Sign Up')}
                        </button>
                        <button type="button" onClick={() => { setIsLoginMode(!isLoginMode); setError(null); }} className="w-full sm:w-auto font-bold text-sm text-blue-500 hover:text-blue-800">
                            {isLoginMode ? 'Need an account? Sign Up' : 'Already have an account? Login'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

type ContentMode = 'explain' | 'image' | 'fact' | 'quiz' | 'deep';

interface TinyTutorAppContentProps {
    inputQuestion: string;
    setInputQuestion: React.Dispatch<React.SetStateAction<string>>;
    generatedContents: Record<ContentMode, string>;
    setGeneratedContents: React.Dispatch<React.SetStateAction<Record<ContentMode, string>>>;
    activeMode: ContentMode;
    setActiveMode: React.Dispatch<React.SetStateAction<ContentMode>>;
    generateExplanation: (question: string, mode: ContentMode, forceCheckUser?: User | null) => Promise<void>;
    isLoadingExplanation: boolean;
    aiError: string | null;
    setAiError: React.Dispatch<React.SetStateAction<string | null>>;
    currentUser: User | null;
    setShowLoginModal: (question: string) => void;
    setShowSignupModal: (question: string) => void;
}

const TinyTutorAppContent: React.FC<TinyTutorAppContentProps> = ({
    inputQuestion, setInputQuestion, generatedContents, setGeneratedContents,
    activeMode, setActiveMode, generateExplanation, isLoadingExplanation,
    aiError, setAiError, currentUser, setShowLoginModal, setShowSignupModal,
}) => {
    const loggedIn = currentUser !== null;
    const questionBeforeModalRef = useRef('');

    const handleGenerateExplanationClick = () => {
        setAiError(null);
        if (!loggedIn) {
            questionBeforeModalRef.current = inputQuestion;
            setShowLoginModal(inputQuestion);
            return;
        }
        if (inputQuestion.trim() === '') {
            setAiError('Please enter a concept.');
            return;
        }
        setGeneratedContents({ explain: '', image: 'Image generation feature coming soon!', fact: '', quiz: '', deep: '' });
        setActiveMode('explain');
        generateExplanation(inputQuestion, 'explain');
    };

    const handleClearInput = () => {
        setInputQuestion('');
        setGeneratedContents({ explain: '', image: 'Image generation feature coming soon!', fact: '', quiz: '', deep: '' });
        setActiveMode('explain');
        setAiError(null);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputQuestion(e.target.value);
        setAiError(null);
    };

    const currentExplanationContent = generatedContents[activeMode];
    // Show content box structure if logged in, or if there's an AI error, or if not logged in but input is present.
    const showContentBoxStructure = loggedIn || aiError || (!loggedIn && inputQuestion.trim() !== '');


    return (
        // Main Content Card: Adjusting width and height for a more balanced look.
        // Using max-w- for width control, and a combination of min/max height.
        // overflow-hidden on this parent is crucial for child overflow-y-auto to work without expanding parent.
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-2xl w-full max-w-xl lg:max-w-2xl xl:max-w-3xl mx-auto flex flex-col min-h-[580px] sm:min-h-[620px] max-h-[90vh] sm:max-h-[750px] overflow-hidden">
            <div className="flex-shrink-0"> {/* Header section */}
                <h2 className="text-2xl sm:text-3xl font-extrabold text-center text-gray-800 mb-1 sm:mb-2">
                    Tiny Tutor {loggedIn && currentUser?.username && <span className="text-indigo-600">({currentUser.username})</span>}
                </h2>
                {loggedIn && currentUser && (
                    <p className="text-center text-gray-600 text-xs sm:text-sm mb-2 sm:mb-3">
                        Your tier: <span className="font-semibold text-blue-600">{currentUser.tier}</span>
                    </p>
                )}
            </div>

            <div className="mb-3 sm:mb-4 p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200 flex-shrink-0"> {/* Input section */}
                <label htmlFor="question-input-main" className="block text-gray-700 text-base sm:text-lg font-bold mb-1 sm:mb-2">
                    Enter a word or concept:
                </label>
                <div className="relative">
                    <input
                        type="text" id="question-input-main"
                        className="w-full px-3 py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-400 text-sm sm:text-base"
                        placeholder="e.g., Photosynthesis" value={inputQuestion}
                        onChange={handleInputChange} disabled={isLoadingExplanation}
                    />
                    {inputQuestion && (
                        <button onClick={handleClearInput} className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg sm:text-xl" aria-label="Clear input">
                            &times;
                        </button>
                    )}
                </div>
                <button
                    onClick={handleGenerateExplanationClick}
                    className="mt-3 w-full sm:w-auto sm:mx-auto sm:px-8 bg-indigo-600 text-white py-2.5 px-5 rounded-lg font-bold text-base hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-300 transition active:scale-95 shadow-lg flex items-center justify-center"
                    disabled={isLoadingExplanation || inputQuestion.trim() === ''}
                >
                    {isLoadingExplanation && activeMode === 'explain' ? <><svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle opacity="25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path opacity="75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Generating...</> : 'Generate Explanation'}
                </button>
                {aiError && <p className="text-red-600 text-center text-xs font-medium mt-1.5">{aiError}</p>}
                {!loggedIn && !aiError && (
                    <p className="text-gray-600 text-center text-xs mt-1.5">
                        <button onClick={() => setShowSignupModal(inputQuestion)} className="font-semibold text-blue-600 hover:underline">Sign up</button>
                        {' '}or{' '}
                        <button onClick={() => setShowLoginModal(inputQuestion)} className="font-semibold text-blue-600 hover:underline">Login</button>
                        {' '}to generate explanations.
                    </p>
                )}
            </div>

            <div className={`flex-shrink-0 flex flex-wrap justify-center gap-1.5 sm:gap-2 mb-2 sm:mb-3 transition-all duration-300 ${loggedIn && inputQuestion.trim() !== '' ? 'opacity-100 h-auto mt-1 sm:mt-2' : 'opacity-0 h-0 mt-0'}`}> {/* Toggle buttons */}
                {(['explain', 'image', 'fact', 'quiz', 'deep'] as ContentMode[]).map(mode => (
                    <button
                        key={mode}
                        onClick={async () => {
                            if (!loggedIn || inputQuestion.trim() === '') return;
                            setAiError(null); setActiveMode(mode);
                            if (!generatedContents[mode] && mode !== 'image') await generateExplanation(inputQuestion, mode);
                            else if (mode === 'image') setGeneratedContents(prev => ({ ...prev, image: 'Image generation feature coming soon!' }));
                        }}
                        className={`px-3 py-1.5 rounded-full font-semibold text-xs sm:text-sm transition-all duration-200 ${activeMode === mode ? 'bg-blue-600 text-white shadow-md scale-105' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
                        disabled={isLoadingExplanation && activeMode !== mode}
                    >
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        {isLoadingExplanation && activeMode === mode && <svg className="animate-spin ml-1.5 -mr-0.5 h-3.5 w-3.5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle opacity="25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path opacity="75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                    </button>
                ))}
            </div>

            {/* Explanation Box: Removed the H3 heading, increased text size, ensured scrolling */}
            <div className="flex-grow p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200 shadow-inner overflow-y-auto relative min-h-[200px] sm:min-h-[280px]"> {/* Increased min-h */}
                {showContentBoxStructure ? (
                    <>
                        {/* REMOVED: <h3 className="text-lg sm:text-xl font-bold text-blue-800 mb-2 sticky top-0 bg-blue-50 py-1.5 z-10">{activeMode.charAt(0).toUpperCase() + activeMode.slice(1)}:</h3> */}
                        {/* Increased text size using prose-lg, and prose-xl on larger screens */}
                        <div className="prose prose-base sm:prose-lg md:prose-xl max-w-none text-gray-800 leading-relaxed whitespace-pre-wrap break-words pt-1"> {/* Added pt-1 for a little space if heading was removed */}
                            {isLoadingExplanation && !currentExplanationContent ? (
                                <div className="flex items-center justify-center text-gray-500"><svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle opacity="25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path opacity="75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Generating {activeMode} content...</div>
                            ) : (
                                currentExplanationContent || (loggedIn && aiError ? <p className="text-red-600">{aiError}</p> : <p className="text-gray-500">{loggedIn ? "Enter a concept or select a mode." : "Login to see explanations."}</p>)
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex items-center justify-center h-full"><p className="text-gray-400 text-center text-sm sm:text-base">{loggedIn ? "Your generated content will appear here." : "Login to see explanations."}</p></div>
                )}
            </div>
        </div>
    );
};

const App: React.FC = () => {
    const { user, loading: authLoadingGlobal, logout: authLogout } = useAuth();
    const [inputQuestion, setInputQuestion] = useState('');
    const [generatedContents, setGeneratedContents] = useState<Record<ContentMode, string>>({
        explain: '', image: 'Image generation feature coming soon!', fact: '', quiz: '', deep: '',
    });
    const [activeMode, setActiveMode] = useState<ContentMode>('explain');
    const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');
    const questionBeforeModalRef = useRef('');

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
        try {
            const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
                method: 'POST', headers: getAuthHeaders(),
                body: JSON.stringify({ question: questionToGenerate, content_type: mode }),
                signal: AbortSignal.timeout(30000)
            });
            if (response.ok) {
                const data = await response.json();
                setGeneratedContents(cc => ({ ...cc, [mode]: data.explanation }));
            } else {
                const errorData = await response.json().catch(() => ({ error: "Parse error" }));
                let errorMessage = errorData.error || `Failed: ${response.status}`;
                if (response.status === 401) errorMessage = "Session expired. Please login again.";
                setAiError(errorMessage);
            }
        } catch (error: any) {
            setAiError(error.name === 'TimeoutError' ? `Request for ${mode} content timed out.` : `Network error for ${mode}.`);
            console.error(`Error fetching AI for ${mode}:`, error);
        } finally {
            setIsLoadingExplanation(false);
        }
    };

    const handleShowLoginModal = (question: string) => {
        questionBeforeModalRef.current = question; setAuthModalMode('login'); setShowAuthModal(true);
    };
    const handleShowSignupModal = (question: string) => {
        questionBeforeModalRef.current = question; setAuthModalMode('signup'); setShowAuthModal(true);
    };
    const handleLogout = () => {
        authLogout(); setInputQuestion('');
        setGeneratedContents({ explain: '', image: 'Image generation feature coming soon!', fact: '', quiz: '', deep: '' });
        setActiveMode('explain'); setAiError(null);
    };

    if (authLoadingGlobal) return <div className="flex items-center justify-center min-h-screen bg-gray-100 text-2xl">Loading...</div>;

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 font-inter text-gray-900 p-2 sm:p-4 overflow-hidden">
            <div className="absolute top-3 right-3 sm:top-4 sm:right-4 z-20">
                {user && (
                    <button onClick={handleLogout} className="py-1 px-3 sm:py-2 sm:px-4 bg-red-500 text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-red-600 shadow">
                        Logout
                    </button>
                )}
            </div>
            <main className="w-full flex justify-center items-center">
                <TinyTutorAppContent
                    inputQuestion={inputQuestion} setInputQuestion={setInputQuestion}
                    generatedContents={generatedContents} setGeneratedContents={setGeneratedContents}
                    activeMode={activeMode} setActiveMode={setActiveMode}
                    generateExplanation={generateExplanation} isLoadingExplanation={isLoadingExplanation}
                    aiError={aiError} setAiError={setAiError} currentUser={user}
                    setShowLoginModal={handleShowLoginModal} setShowSignupModal={handleShowSignupModal}
                />
            </main>
            {showAuthModal && (
                <AuthModal
                    onClose={() => { setShowAuthModal(false); }}
                    onLoginSuccess={async (loggedInUser, questionAfterLogin) => {
                        setShowAuthModal(false); setAiError(null);
                        if (questionAfterLogin.trim() !== '') {
                            setInputQuestion(questionAfterLogin);
                            await generateExplanation(questionAfterLogin, 'explain', loggedInUser);
                        } else {
                            setGeneratedContents(prev => ({ ...prev, explain: "Welcome! Enter a concept." }));
                        }
                        questionBeforeModalRef.current = '';
                    }}
                    initialQuestion={questionBeforeModalRef.current} initialMode={authModalMode}
                />
            )}
            <footer className="text-center py-2 text-xs text-blue-200 flex-shrink-0">Tiny Tutor App &copy; {new Date().getFullYear()}</footer>
        </div>
    );
};

const AppWithAuthProvider: React.FC = () => <AuthProvider><App /></AuthProvider>;
export default AppWithAuthProvider;

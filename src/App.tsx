import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { jwtDecode, JwtPayload } from 'jwt-decode';

// --- Constants ---
const API_BASE_URL = 'https://tiny-tutor-app.onrender.com'; // Ensure this is your correct backend URL

// --- Types ---
interface CustomJwtPayload extends JwtPayload {
    user_id: string;
    username: string;
    tier: string;
}

interface User {
    id: string;
    username: string;
    tier: string;
    exp?: number; // Expiration time from JWT
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (username: string, password: string) => Promise<User | null>;
    signup: (username: string, email: string, password: string) => Promise<boolean>;
    logout: () => Promise<void>;
}

type Page = 'tutor' | 'profile';
type ContentMode = 'explain' | 'image' | 'fact' | 'quiz' | 'deep';

interface ExploredWord {
    id: string; // Sanitized word ID
    word: string; // Original word
    is_favorite: boolean;
    last_explored_at?: string; // ISO string date
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

// --- Auth Context ---
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

    // Login function
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
                const newUser = { id: decodedUser.user_id, username: decodedUser.username, tier: decodedUser.tier, exp: decodedUser.exp };
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

    // Signup function
    const signup = async (username: string, email: string, password: string): Promise<boolean> => {
        setLoading(true);
        try {
            const response = await fetch(`${API_BASE_URL}/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password }),
            });
            if (response.ok) {
                return true;
            }
            console.error('Signup failed:', await response.text());
            return false;
        } catch (error) {
            console.error('Network error during signup:', error);
            return false;
        } finally {
            setLoading(false);
        }
    };

    // Logout function
    const logout = async (): Promise<void> => {
        localStorage.removeItem('access_token');
        setUser(null);
    };

    // Effect to check auth status on mount and on storage change
    useEffect(() => {
        const checkAuthStatus = () => {
            setLoading(true);
            try {
                const token = localStorage.getItem('access_token');
                if (token) {
                    const decodedUser: CustomJwtPayload = jwtDecode(token);
                    // Check if token is expired
                    if (decodedUser.exp && decodedUser.exp * 1000 < Date.now()) {
                        localStorage.removeItem('access_token'); // Token expired
                        setUser(null);
                    } else {
                        setUser({ id: decodedUser.user_id, username: decodedUser.username, tier: decodedUser.tier, exp: decodedUser.exp });
                    }
                } else {
                    setUser(null);
                }
            } catch (error) {
                // Invalid token or other error
                localStorage.removeItem('access_token');
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        checkAuthStatus();

        // Listen for storage changes (e.g., logout in another tab)
        const handleStorageChange = (event: StorageEvent) => {
            if (event.key === 'access_token' && !event.newValue) {
                setUser(null); // Token removed from another tab
            }
        };
        window.addEventListener('storage', handleStorageChange);
        return () => window.removeEventListener('storage', handleStorageChange);
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
            {children}
        </AuthContext.Provider>
    );
};


// --- Auth Modal Component ---
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
    const [isLoading, setIsLoading] = useState(false); // Local loading for form submission

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);
        if (isLoginMode) {
            const loggedInUser = await login(username, password);
            if (loggedInUser) {
                await onLoginSuccess(loggedInUser, initialQuestion);
            } else {
                setError('Login failed. Invalid credentials or server error.');
            }
        } else {
            const signedUp = await signup(username, email, password);
            if (signedUp) {
                setError('Signup successful! Please log in.');
                setIsLoginMode(true);
                setPassword(''); // Clear password for login
            } else {
                setError('Signup failed. User might already exist or data is invalid.');
            }
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
                            {isLoading || authHookLoading ? (
                                <><svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Processing...</>
                            ) : (isLoginMode ? 'Login' : 'Sign Up')}
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

// --- Tiny Tutor App Content Component (Main Tutor View) ---
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
    isExplainGeneratedForCurrentWord: boolean;
    setIsExplainGeneratedForCurrentWord: React.Dispatch<React.SetStateAction<boolean>>;
    onToggleFavorite: (currentWordDisplay: string, currentFavStatus: boolean) => Promise<void>;
    currentWordIsFavorite: boolean | null;
}

const TinyTutorAppContent: React.FC<TinyTutorAppContentProps> = ({
    inputQuestion, setInputQuestion, generatedContents, setGeneratedContents, activeMode, setActiveMode,
    generateExplanation, isLoadingExplanation, aiError, setAiError, currentUser,
    setShowLoginModal, setShowSignupModal, isExplainGeneratedForCurrentWord, setIsExplainGeneratedForCurrentWord,
    onToggleFavorite, currentWordIsFavorite
}) => {
    const loggedIn = currentUser !== null;
    // const questionBeforeModalRef = useRef(''); // This ref is in App component now

    const handleGenerateExplanationClick = () => {
        setAiError(null);
        if (!loggedIn) {
            // questionBeforeModalRef.current = inputQuestion; // Managed by App component
            setShowLoginModal(inputQuestion);
            return;
        }
        if (inputQuestion.trim() === '') {
            setAiError('Please enter a concept.');
            return;
        }
        // Reset contents for a new word, always fetch 'explain' first
        setGeneratedContents({ explain: '', image: 'Image generation feature coming soon!', fact: '', quiz: '', deep: 'In-depth explanation feature coming soon!' });
        setActiveMode('explain');
        setIsExplainGeneratedForCurrentWord(false); // Mark that explain needs to be generated for this new word
        generateExplanation(inputQuestion, 'explain');
    };

    const handleClearInput = () => {
        setInputQuestion('');
        setGeneratedContents({ explain: '', image: 'Image generation feature coming soon!', fact: '', quiz: '', deep: 'In-depth explanation feature coming soon!' });
        setActiveMode('explain');
        setAiError(null);
        setIsExplainGeneratedForCurrentWord(false);
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInputQuestion(e.target.value);
        setAiError(null);
        // If user types a new word, reset the 'explain generated' flag and content
        if (isExplainGeneratedForCurrentWord) {
            setIsExplainGeneratedForCurrentWord(false);
        }
        // Optionally, clear all generated content when input changes significantly or reset to initial state
        setGeneratedContents({ explain: '', image: 'Image generation feature coming soon!', fact: '', quiz: '', deep: 'In-depth explanation feature coming soon!' });
        setActiveMode('explain'); // Default to explain mode for new input
    };

    const currentExplanationContent = generatedContents[activeMode];
    const showContentBoxStructure = loggedIn || aiError || (!loggedIn && inputQuestion.trim() !== '');


    return (
        <div className="bg-white p-4 md:p-5 rounded-xl shadow-2xl w-full max-w-lg sm:max-w-xl md:max-w-2xl lg:max-w-3xl mx-auto flex flex-col min-h-[600px] max-h-[85vh] sm:max-h-[700px] overflow-hidden">
            {/* Header Section */}
            <div className="flex-shrink-0">
                <h2 className="text-xl sm:text-2xl md:text-3xl font-extrabold text-center text-gray-800 mb-1 sm:mb-2">
                    Tiny Tutor {loggedIn && currentUser?.username && <span className="text-indigo-600">({currentUser.username})</span>}
                </h2>
                {loggedIn && currentUser && (
                    <p className="text-center text-gray-600 text-xs sm:text-sm mb-2 sm:mb-3">
                        Your tier: <span className="font-semibold text-blue-600">{currentUser.tier}</span>
                    </p>
                )}
            </div>

            {/* Input Section */}
            <div className="mb-2 sm:mb-3 p-3 sm:p-4 bg-gray-50 rounded-lg border border-gray-200 flex-shrink-0">
                <label htmlFor="question-input-main" className="block text-gray-700 text-sm sm:text-base md:text-lg font-bold mb-1 sm:mb-2">
                    Enter a word or concept:
                </label>
                <div className="relative">
                    <input
                        type="text"
                        id="question-input-main"
                        className="w-full px-3 py-2 sm:py-2.5 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-400 text-xs sm:text-sm md:text-base"
                        placeholder="e.g., Photosynthesis"
                        value={inputQuestion}
                        onChange={handleInputChange}
                        disabled={isLoadingExplanation}
                    />
                    {inputQuestion && (
                        <button
                            onClick={handleClearInput}
                            className="absolute right-2 sm:right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 text-base sm:text-lg md:text-xl"
                            aria-label="Clear input"
                        >
                            &times;
                        </button>
                    )}
                </div>
                <button
                    onClick={handleGenerateExplanationClick}
                    className="mt-2.5 sm:mt-3 w-full sm:w-auto sm:mx-auto sm:px-6 md:px-8 bg-indigo-600 text-white py-2 sm:py-2.5 px-4 rounded-lg font-bold text-sm sm:text-base hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-300 transition active:scale-95 shadow-lg flex items-center justify-center"
                    disabled={isLoadingExplanation || inputQuestion.trim() === ''}
                >
                    {isLoadingExplanation && activeMode === 'explain' ? ( // Show loading only if 'explain' is being generated by this button
                        <><svg className="animate-spin -ml-1 mr-2 h-4 w-4 sm:h-5 sm:w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle opacity="25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path opacity="75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Generating...</>
                    ) : 'Generate Explanation'}
                </button>
                {aiError && <p className="text-red-600 text-center text-xs font-medium mt-1 sm:mt-1.5">{aiError}</p>}
                {!loggedIn && !aiError && (
                    <p className="text-gray-600 text-center text-xs mt-1 sm:mt-1.5">
                        <button onClick={() => setShowSignupModal(inputQuestion)} className="font-semibold text-blue-600 hover:underline">Sign up</button>
                        {' '}or{' '}
                        <button onClick={() => setShowLoginModal(inputQuestion)} className="font-semibold text-blue-600 hover:underline">Login</button>
                        {' '}to generate explanations.
                    </p>
                )}
            </div>

            {/* Toggle Buttons, Refresh, and Favorite Section */}
            <div className={`flex-shrink-0 flex flex-wrap justify-center items-center gap-1 sm:gap-1.5 mb-2 sm:mb-3 transition-all duration-300 ${loggedIn && inputQuestion.trim() !== '' && isExplainGeneratedForCurrentWord ? 'opacity-100 h-auto mt-1 sm:mt-2' : 'opacity-0 h-0 mt-0 pointer-events-none'}`}>
                {(['explain', 'image', 'fact', 'quiz', 'deep'] as ContentMode[]).map(mode => (
                    <button
                        key={mode}
                        onClick={async () => {
                            if (!loggedIn || !isExplainGeneratedForCurrentWord || inputQuestion.trim() === '') return;
                            setAiError(null);
                            setActiveMode(mode);
                            // ** FIX APPLIED HERE for "Explain" toggle **
                            // Fetch only if content for this mode is not already loaded, or if it's a placeholder for image/deep
                            if (!generatedContents[mode] ||
                                (mode === 'image' && generatedContents.image === 'Image generation feature coming soon!') ||
                                (mode === 'deep' && generatedContents.deep === 'In-depth explanation feature coming soon!')) {
                                await generateExplanation(inputQuestion, mode);
                            }
                        }}
                        className={`px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-full font-semibold text-xs sm:text-sm transition-all duration-200 
                                    ${activeMode === mode ? 'bg-blue-600 text-white shadow-md scale-105' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'} 
                                    ${mode !== 'explain' && !isExplainGeneratedForCurrentWord ? 'opacity-50 cursor-not-allowed' : ''} `}
                        disabled={(isLoadingExplanation && activeMode !== mode) || (mode !== 'explain' && !isExplainGeneratedForCurrentWord)}
                    >
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        {isLoadingExplanation && activeMode === mode && <svg className="animate-spin ml-1 sm:ml-1.5 -mr-0.5 h-3 w-3 sm:h-3.5 sm:w-3.5 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle opacity="25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path opacity="75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>}
                    </button>
                ))}

                {/* REFRESH BUTTON - ADDED HERE */}
                {loggedIn && isExplainGeneratedForCurrentWord && inputQuestion.trim() !== '' && generatedContents[activeMode] && (
                    <button
                        onClick={() => {
                            if (inputQuestion.trim() === '') return;
                            setAiError(null);
                            generateExplanation(inputQuestion, activeMode);
                        }}
                        className="ml-2 p-2 rounded-full bg-gray-200 text-gray-700 hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-60 transition-colors duration-150" // Applied new styles
                        title={`Refresh ${activeMode} content`}
                        disabled={isLoadingExplanation}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"> {/* Standard icon size */}
                            <path fillRule="evenodd" d="M15.312 11.424a5.5 5.5 0 0 1-9.493-4.269A5.502 5.502 0 0 1 9.5 2.5a5.5 5.5 0 0 1 5.005 3.873A.75.75 0 0 1 15.312 11.424ZM18 10a8 8 0 1 1-14.638-4.597A.75.75 0 0 1 4.583 6.27A6.5 6.5 0 1 0 10 3.5V2a.75.75 0 0 1 1.5 0v1.75A.75.75 0 0 1 10.75 4.5V6a.75.75 0 0 1-1.5 0V4.84A8.001 8.001 0 0 1 18 10Z" clipRule="evenodd" />
                        </svg>
                    </button>
                )}

                {/* Favorite Button */}
                {loggedIn && isExplainGeneratedForCurrentWord && inputQuestion.trim() !== '' && currentWordIsFavorite !== null && (
                    <button
                        onClick={() => onToggleFavorite(inputQuestion, !!currentWordIsFavorite)}
                        className={`p-1.5 rounded-full text-xl ml-2 transition-colors duration-150 
                                    ${currentWordIsFavorite ? 'text-red-500 hover:text-red-600' : 'text-gray-400 hover:text-red-500'} 
                                    focus:outline-none focus:ring-1 focus:ring-red-400`}
                        title={currentWordIsFavorite ? "Remove from favorites" : "Add to favorites"}
                    >
                        {currentWordIsFavorite ? '♥' : '♡'}
                    </button>
                )}
            </div>


            {/* Content Display Box */}
            <div className="flex-grow p-3 sm:p-4 bg-blue-50 rounded-lg border border-blue-200 shadow-inner overflow-y-auto overflow-x-hidden relative min-h-[250px] sm:min-h-[300px] md:min-h-[320px]">
                {showContentBoxStructure ? (
                    <div className="prose prose-sm sm:prose-base md:prose-lg max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap break-words pt-1">
                        {isLoadingExplanation && !currentExplanationContent ? ( // Show general loading if no content yet for active mode
                            <div className="flex items-center justify-center text-gray-500">
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle opacity="25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path opacity="75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                Generating {activeMode} content...
                            </div>
                        ) : (
                            currentExplanationContent || (loggedIn && aiError ? <p className="text-red-600">{aiError}</p> : <p className="text-gray-500">{loggedIn ? "Enter a concept or select a mode." : "Login to see explanations."}</p>)
                        )}
                    </div>
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-gray-400 text-center text-sm sm:text-base">
                            {loggedIn ? "Your generated content will appear here." : "Login to see explanations."}
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};


// --- Profile Page Component ---
interface ProfilePageProps {
    setCurrentPage: (page: Page) => void;
    getAuthHeaders: () => Record<string, string>;
    user: User | null;
    onWordClick: (word: string, cachedContent?: Partial<Record<ContentMode, string>>) => void;
    handleToggleFavoriteApp: (currentWordDisplay: string, currentFavStatus: boolean) => Promise<void>;
    profileDataHook: [ProfileData | null, React.Dispatch<React.SetStateAction<ProfileData | null>>];
}

const ProfilePage: React.FC<ProfilePageProps> = ({ setCurrentPage, getAuthHeaders, user, onWordClick, handleToggleFavoriteApp, profileDataHook }) => {
    const [profileData, setProfileData] = profileDataHook;
    const [isLoadingProfile, setIsLoadingProfile] = useState(false);
    const [profileError, setProfileError] = useState<string | null>(null);

    useEffect(() => {
        if (!user) {
            setCurrentPage('tutor'); // Redirect if user logs out while on profile
            return;
        }
        // Fetch profile data if it's not already loaded or if forced by nulling profileData
        if (profileData === null && !isLoadingProfile) {
            const fetchProfileData = async () => {
                setIsLoadingProfile(true);
                setProfileError(null);
                try {
                    const response = await fetch(`${API_BASE_URL}/profile`, {
                        headers: getAuthHeaders(),
                    });
                    if (response.ok) {
                        setProfileData(await response.json());
                    } else {
                        const errData = await response.json().catch(() => ({ error: "Failed to fetch profile, server error." }));
                        setProfileError(errData.error || "Could not load profile data.");
                    }
                } catch (err) {
                    setProfileError("Network error fetching profile.");
                    console.error(err);
                } finally {
                    setIsLoadingProfile(false);
                }
            };
            fetchProfileData();
        }
    }, [user, getAuthHeaders, setCurrentPage, profileData, setProfileData, isLoadingProfile]);


    const WordListItem: React.FC<{ item: ExploredWord, onToggleFavorite: () => void, onWordItemClick: () => void }> = ({ item, onToggleFavorite, onWordItemClick }) => (
        <li className="p-3 bg-gray-50 border border-gray-200 rounded-lg flex justify-between items-center hover:bg-gray-100 transition-colors duration-150 group">
            <div className="flex-1 min-w-0 mr-2 cursor-pointer group-hover:text-indigo-600" onClick={onWordItemClick} title={`View details for "${item.word}"`}>
                <span className="font-medium text-gray-700 block truncate group-hover:underline">{item.word}</span>
                <p className="text-xs text-gray-400">Last seen: {item.last_explored_at ? new Date(item.last_explored_at).toLocaleDateString() : 'N/A'}</p>
            </div>
            <button
                onClick={onToggleFavorite}
                className={`text-xl p-1 rounded-full hover:bg-red-100 transition-colors duration-150 ${item.is_favorite ? 'text-red-500' : 'text-gray-300 hover:text-red-400'}`}
                title={item.is_favorite ? "Remove from favorites" : "Add to favorites"}
            >
                {item.is_favorite ? '♥' : '♡'}
            </button>
        </li>
    );

    if (isLoadingProfile && !profileData) return <div className="text-center p-10 text-white text-lg">Loading profile... <svg className="animate-spin inline h-5 w-5 text-white ml-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg></div>;
    if (profileError) return <div className="text-center p-10 text-red-300 bg-red-800 bg-opacity-30 rounded-lg">Error: {profileError} <button onClick={() => setCurrentPage('tutor')} className="text-blue-300 hover:underline ml-2">Go Back</button></div>;
    if (!profileData) return <div className="text-center p-10 text-white">No profile data found yet. Explore some words! <button onClick={() => setCurrentPage('tutor')} className="text-blue-300 hover:underline ml-2">Go Back</button></div>;


    return (
        <div className="bg-white p-4 md:p-6 rounded-xl shadow-2xl w-full max-w-xl md:max-w-2xl lg:max-w-3xl mx-auto min-h-[600px] max-h-[85vh] sm:max-h-[700px] flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-3 sm:mb-4 flex-shrink-0">
                <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 truncate">{profileData.username}'s Profile</h2>
                <button onClick={() => setCurrentPage('tutor')} className="py-1.5 px-3 sm:py-2 sm:px-4 bg-indigo-600 text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-indigo-700 transition">&larr; Back to Tutor</button>
            </div>
            <p className="text-gray-600 mb-0.5 text-xs sm:text-sm">Tier: <span className="font-semibold">{profileData.tier}</span></p>
            <p className="text-gray-600 mb-3 sm:mb-4 text-xs sm:text-sm">Words Explored: <span className="font-semibold">{profileData.explored_words_count}</span></p>

            <div className="flex-grow overflow-y-auto space-y-4 sm:space-y-6 pr-1"> {/* Added pr-1 for scrollbar space */}
                <div>
                    <h3 className="text-lg sm:text-xl font-semibold text-gray-700 mb-1.5 sm:mb-2 sticky top-0 bg-white py-1 z-10 border-b">Favorite Words ({profileData.favorite_words_list.length})</h3>
                    {profileData.favorite_words_list.length > 0 ? (
                        <ul className="space-y-2">
                            {profileData.favorite_words_list.map(item => (
                                <WordListItem key={`fav-${item.id}`} item={item}
                                    onToggleFavorite={() => handleToggleFavoriteApp(item.word, item.is_favorite)}
                                    onWordItemClick={() => onWordClick(item.word, item.generated_content_cache)}
                                />
                            ))}
                        </ul>
                    ) : <p className="text-gray-500 text-sm px-1">No favorite words yet. Use the ♡ icon to add some!</p>}
                </div>
                <div>
                    <h3 className="text-lg sm:text-xl font-semibold text-gray-700 mb-1.5 sm:mb-2 sticky top-0 bg-white py-1 z-10 border-b">All Explored Words ({profileData.explored_words_list.length})</h3>
                    {profileData.explored_words_list.length > 0 ? (
                        <ul className="space-y-2">
                            {profileData.explored_words_list.map(item => (
                                <WordListItem key={`exp-${item.id}`} item={item}
                                    onToggleFavorite={() => handleToggleFavoriteApp(item.word, item.is_favorite)}
                                    onWordItemClick={() => onWordClick(item.word, item.generated_content_cache)}
                                />
                            ))}
                        </ul>
                    ) : <p className="text-gray-500 text-sm px-1">No words explored yet.</p>}
                </div>
            </div>
        </div>
    );
};


// --- Main App Component ---
const App: React.FC = () => {
    const { user, loading: authLoadingGlobal, logout: authLogout } = useAuth(); // Get user and global auth loading state
    const [currentPage, setCurrentPage] = useState<Page>('tutor');
    const [inputQuestion, setInputQuestion] = useState('');
    const [generatedContents, setGeneratedContents] = useState<Record<ContentMode, string>>({
        explain: '', image: 'Image generation feature coming soon!', fact: '', quiz: '', deep: 'In-depth explanation feature coming soon!'
    });
    const [activeMode, setActiveMode] = useState<ContentMode>('explain');
    const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);

    // Auth Modal State
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');
    const questionBeforeModalRef = useRef(''); // Store question if user needs to login/signup first

    // Tutor Page Specific State
    const [isExplainGeneratedForCurrentWord, setIsExplainGeneratedForCurrentWord] = useState(false);
    const [currentTutorWordIsFavorite, setCurrentTutorWordIsFavorite] = useState<boolean | null>(null);

    // Profile Page Specific State
    const [profileData, setProfileData] = useState<ProfileData | null>(null);


    // Helper to get auth headers
    const getAuthHeaders = () => {
        const token = localStorage.getItem('access_token');
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    };

    // Function to refresh profile data (used after actions like favoriting or generating content)
    const refreshProfileData = async () => {
        if (!user) {
            setProfileData(null);
            setCurrentTutorWordIsFavorite(null); // Clear favorite status if no user
            return;
        }
        try {
            const response = await fetch(`${API_BASE_URL}/profile`, { headers: getAuthHeaders() });
            if (response.ok) {
                const data: ProfileData = await response.json();
                setProfileData(data);
                // Update favorite status for the current word on the tutor page
                if (inputQuestion && data.explored_words_list) {
                    const currentWordSanitizedId = inputQuestion.trim().toLowerCase().replace(/[/*\[\]]/g, '_').substring(0, 100);
                    const foundWord = data.explored_words_list.find(w => w.id === currentWordSanitizedId);
                    setCurrentTutorWordIsFavorite(foundWord ? foundWord.is_favorite : false);
                } else {
                    setCurrentTutorWordIsFavorite(null); // No input question or no words
                }
            } else {
                console.error("Failed to refresh profile data during general refresh");
                // Optionally set an error state or keep stale data
            }
        } catch (error) {
            console.error("Error refreshing profile data:", error);
        }
    };

    // Effect to fetch/refresh profile data when user changes or page loads
    useEffect(() => {
        if (user) {
            refreshProfileData();
        } else {
            setProfileData(null); // Clear profile data if no user
            setCurrentTutorWordIsFavorite(null);
        }
    }, [user]); // Runs when user object changes (login/logout)

    // Effect to update favorite status on tutor page when inputQuestion or profileData changes
    useEffect(() => {
        if (inputQuestion && profileData?.explored_words_list) {
            const currentWordSanitizedId = inputQuestion.trim().toLowerCase().replace(/[/*\[\]]/g, '_').substring(0, 100);
            const foundWord = profileData.explored_words_list.find(w => w.id === currentWordSanitizedId);
            setCurrentTutorWordIsFavorite(foundWord ? foundWord.is_favorite : false);
        } else if (!inputQuestion) {
            setCurrentTutorWordIsFavorite(null); // Clear if no input question
        }
    }, [inputQuestion, profileData]);


    // Main function to generate AI content
    const generateExplanation = async (questionToGenerate: string, mode: ContentMode, forceCheckUser?: User | null) => {
        const currentUserToCheck = forceCheckUser !== undefined ? forceCheckUser : user; // Use provided user or current auth user

        if (!currentUserToCheck) {
            setAiError("Please login to generate explanations.");
            if (forceCheckUser === undefined) handleShowLoginModal(questionToGenerate); // Show login modal only if not forced by login success
            return;
        }
        setAiError(null);
        setIsLoadingExplanation(true);

        // Handle placeholders for image and deep modes
        if (mode === 'image' || mode === 'deep') {
            setGeneratedContents(cc => ({
                ...cc,
                [mode]: mode === 'image' ? `Image generation feature coming soon! You can imagine an image of '${questionToGenerate}'.` : `In-depth explanation feature coming soon! We're working on providing more detailed insights for '${questionToGenerate}'.`
            }));
            setIsLoadingExplanation(false);
            // Still log the interaction with the backend for these modes
            fetch(`${API_BASE_URL}/generate_explanation`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ question: questionToGenerate, content_type: mode })
            }).then(() => refreshProfileData()) // Refresh profile to update explored words
                .catch(console.error);
            return;
        }

        // Fetch actual content for other modes
        try {
            const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ question: questionToGenerate, content_type: mode }),
                signal: AbortSignal.timeout(30000) // 30-second timeout
            });

            if (response.ok) {
                const data = await response.json();
                setGeneratedContents(cc => ({ ...cc, [mode]: data.explanation }));
                if (mode === 'explain' && data.explanation && data.explanation.trim() !== '') {
                    setIsExplainGeneratedForCurrentWord(true);
                }
                await refreshProfileData(); // Refresh profile to update explored words and cache
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

    // Function to toggle favorite status (used by both Tutor and Profile pages)
    const handleToggleFavoriteApp = async (currentWordDisplay: string, currentFavStatus: boolean) => {
        if (!user) {
            setAiError("Please login to favorite words.");
            handleShowLoginModal(currentWordDisplay); // Prompt login
            return;
        }
        // Optimistic UI update for the Tutor page's heart icon
        if (inputQuestion === currentWordDisplay) {
            setCurrentTutorWordIsFavorite(!currentFavStatus);
        }
        try {
            const response = await fetch(`${API_BASE_URL}/toggle_favorite`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ word: currentWordDisplay })
            });
            if (response.ok) {
                await refreshProfileData(); // Refresh to get updated lists and favorite status
            } else {
                // Revert optimistic update on failure
                if (inputQuestion === currentWordDisplay) {
                    setCurrentTutorWordIsFavorite(currentFavStatus);
                }
                const errData = await response.json().catch(() => ({ error: "Failed to toggle favorite on server" }));
                setAiError(errData.error || "Could not update favorite status.");
                await refreshProfileData(); // Refresh even on error to sync state
            }
        } catch (err) {
            // Revert optimistic update on network error
            if (inputQuestion === currentWordDisplay) {
                setCurrentTutorWordIsFavorite(currentFavStatus);
            }
            setAiError("Network error toggling favorite.");
            await refreshProfileData(); // Refresh to try and sync state
        }
    };


    // --- Modal Handlers ---
    const handleShowLoginModal = (question: string) => {
        questionBeforeModalRef.current = question; // Save current question
        setAuthModalMode('login');
        setShowAuthModal(true);
    };
    const handleShowSignupModal = (question: string) => {
        questionBeforeModalRef.current = question;
        setAuthModalMode('signup');
        setShowAuthModal(true);
    };

    // --- Logout Handler ---
    const handleLogout = () => {
        authLogout();
        setCurrentPage('tutor'); // Go back to tutor page
        // Reset all relevant states
        setInputQuestion('');
        setGeneratedContents({ explain: '', image: 'Image generation feature coming soon!', fact: '', quiz: '', deep: 'In-depth explanation feature coming soon!' });
        setActiveMode('explain');
        setAiError(null);
        setIsExplainGeneratedForCurrentWord(false);
        setProfileData(null);
        setCurrentTutorWordIsFavorite(null);
    };

    // --- Navigation from Profile to Tutor ---
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

        if (initialContent.explain && initialContent.explain.trim() !== '') {
            setActiveMode('explain');
            setIsExplainGeneratedForCurrentWord(true);
        } else {
            // If no cached 'explain', set it to be generated, or rely on main button
            setActiveMode('explain');
            setIsExplainGeneratedForCurrentWord(false); // This will disable other toggles until 'explain' is there
            // Optionally, you could auto-fetch 'explain' here if it's missing:
            // if (!initialContent.explain) generateExplanation(word, 'explain');
        }
        setCurrentPage('tutor');
    };

    // Effect to redirect to tutor page if user logs out while on profile page
    useEffect(() => {
        if (!user && currentPage === 'profile') {
            setCurrentPage('tutor');
        }
    }, [user, currentPage]);


    // Global loading state (e.g., while checking auth token)
    if (authLoadingGlobal) {
        return <div className="flex items-center justify-center min-h-screen bg-gray-100 text-2xl">Loading Application...</div>;
    }

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-blue-800 font-inter text-gray-900 p-2 sm:p-4 overflow-y-auto">
            <header className="w-full max-w-5xl mx-auto py-2.5 px-2 sm:px-4 flex justify-end items-center sticky top-0 z-30 bg-blue-800/95 backdrop-blur-sm">
                {user && (
                    <div className="flex items-center gap-2 sm:gap-3">
                        {currentPage === 'tutor' && (
                            <button
                                onClick={() => {
                                    setProfileData(null); // Force refresh of profile data when navigating
                                    setCurrentPage('profile');
                                }}
                                className="py-1 px-3 sm:py-2 sm:px-4 bg-white/20 text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-white/30 shadow"
                            >
                                View Profile
                            </button>
                        )}
                        {/* The "Back to Tutor" button is on the ProfilePage component itself */}
                        <button
                            onClick={handleLogout}
                            className="py-1 px-3 sm:py-2 sm:px-4 bg-red-500 text-white rounded-lg text-xs sm:text-sm font-semibold hover:bg-red-600 shadow"
                        >
                            Logout
                        </button>
                    </div>
                )}
            </header>

            <main className="w-full flex justify-center items-center flex-grow mt-2 mb-auto">
                {currentPage === 'tutor' ? (
                    <TinyTutorAppContent
                        inputQuestion={inputQuestion}
                        setInputQuestion={setInputQuestion}
                        generatedContents={generatedContents}
                        setGeneratedContents={setGeneratedContents}
                        activeMode={activeMode}
                        setActiveMode={setActiveMode}
                        generateExplanation={generateExplanation}
                        isLoadingExplanation={isLoadingExplanation}
                        aiError={aiError}
                        setAiError={setAiError}
                        currentUser={user}
                        setShowLoginModal={handleShowLoginModal}
                        setShowSignupModal={handleShowSignupModal}
                        isExplainGeneratedForCurrentWord={isExplainGeneratedForCurrentWord}
                        setIsExplainGeneratedForCurrentWord={setIsExplainGeneratedForCurrentWord}
                        onToggleFavorite={handleToggleFavoriteApp}
                        currentWordIsFavorite={currentTutorWordIsFavorite}
                    />
                ) : (
                    <ProfilePage
                        setCurrentPage={setCurrentPage}
                        getAuthHeaders={getAuthHeaders}
                        user={user}
                        onWordClick={handleWordClickFromProfile}
                        handleToggleFavoriteApp={handleToggleFavoriteApp}
                        profileDataHook={[profileData, setProfileData]} // Pass state and setter
                    />
                )}
            </main>

            {showAuthModal && (
                <AuthModal
                    onClose={() => { setShowAuthModal(false); }}
                    onLoginSuccess={async (loggedInUser, questionAfterLogin) => {
                        setShowAuthModal(false);
                        setAiError(null); // Clear any previous errors
                        if (questionAfterLogin.trim() !== '') {
                            setInputQuestion(questionAfterLogin); // Set the question that was pending
                            // Automatically generate 'explain' for the pending question after successful login
                            await generateExplanation(questionAfterLogin, 'explain', loggedInUser);
                        } else {
                            // If no specific question was pending, just show a welcome or clear state
                            setGeneratedContents(prev => ({ ...prev, explain: "Welcome! Enter a concept to get started." }));
                            setIsExplainGeneratedForCurrentWord(false);
                        }
                        questionBeforeModalRef.current = ''; // Clear the ref
                    }}
                    initialQuestion={questionBeforeModalRef.current} // Pass the question that triggered the modal
                    initialMode={authModalMode}
                />
            )}
            <footer className="text-center py-2 text-xs text-blue-200 flex-shrink-0">
                Tiny Tutor App &copy; {new Date().getFullYear()}
            </footer>
        </div>
    );
};

// Wrap App with AuthProvider for export
const AppWithAuthProvider: React.FC = () => (
    <AuthProvider>
        <App />
    </AuthProvider>
);

export default AppWithAuthProvider;

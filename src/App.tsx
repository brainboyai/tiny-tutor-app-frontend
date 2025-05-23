import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { jwtDecode, JwtPayload } from 'jwt-decode';

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
    login: (username: string, password: string) => Promise<boolean>;
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

    const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';

    const getAuthHeaders = () => {
        const token = localStorage.getItem('access_token');
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    };

    const login = async (username: string, password: string): Promise<boolean> => {
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
                setUser({ username: decodedUser.username, tier: decodedUser.tier, exp: decodedUser.exp });
                console.log('Login successful for user:', decodedUser.username);
                return true;
            } else {
                const errorData = await response.json();
                console.error('Login failed:', errorData.error);
                return false;
            }
        } catch (error) {
            console.error('Network or other error during login:', error);
            return false;
        }
    };

    const signup = async (username: string, email: string, password: string): Promise<boolean> => {
        try {
            const response = await fetch(`${API_BASE_URL}/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password }),
            });

            if (response.ok) {
                console.log('Signup successful!');
                return true;
            } else {
                const errorData = await response.json();
                console.error('Signup failed:', errorData.error);
                return false;
            }
        } catch (error) {
            console.error('Network or other error during signup:', error);
            return false;
        }
    };

    const logout = async (): Promise<void> => {
        try {
            localStorage.removeItem('access_token');
            setUser(null);
            console.log('Logged out successfully.');
        } catch (error) {
            console.error('Error during logout:', error);
        }
    };

    useEffect(() => {
        const checkAuthStatus = () => {
            try {
                const token = localStorage.getItem('access_token');
                if (token) {
                    const decodedUser: CustomJwtPayload = jwtDecode(token);
                    if (decodedUser.exp && decodedUser.exp * 1000 < Date.now()) {
                        console.log('Token expired. Logging out automatically.');
                        localStorage.removeItem('access_token');
                        setUser(null);
                    } else {
                        setUser({ username: decodedUser.username, tier: decodedUser.tier, exp: decodedUser.exp });
                    }
                }
            } catch (error) {
                console.error('Error decoding token or token invalid. Clearing local storage.', error);
                localStorage.removeItem('access_token');
                setUser(null);
            } finally {
                setLoading(false);
            }
        };

        checkAuthStatus();
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

// --- AuthModal Component ---
interface AuthModalProps {
    onClose: () => void;
    onLoginSuccess: (question: string) => Promise<void>;
    initialQuestion: string;
    initialMode: 'login' | 'signup'; // Added initialMode prop
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose, onLoginSuccess, initialQuestion, initialMode }) => {
    const { login, signup, loading: authLoading } = useAuth();
    const [isLoginMode, setIsLoginMode] = useState(initialMode === 'login'); // Use initialMode
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        let success = false;
        if (isLoginMode) {
            success = await login(username, password);
        } else {
            success = await signup(username, email, password);
        }

        if (success) {
            if (isLoginMode) {
                await onLoginSuccess(initialQuestion);
            } else {
                setError('Signup successful! Please log in with your new credentials.');
                setIsLoginMode(true);
            }
        } else {
            setError(isLoginMode ? 'Login failed. Invalid username or password.' : 'Signup failed. Username or email might already exist, or invalid data.');
        }
        setIsLoading(false);
    };

    return (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white p-8 rounded-lg shadow-xl w-full max-w-md mx-4 relative">
                <button
                    onClick={onClose}
                    className="absolute top-2 right-2 text-gray-500 hover:text-gray-700 text-2xl font-bold"
                >
                    &times;
                </button>
                <h2 className="text-2xl font-bold text-gray-800 mb-6 text-center">
                    {isLoginMode ? 'Login' : 'Sign Up'}
                </h2>
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="username">
                            Username
                        </label>
                        <input
                            type="text"
                            id="username"
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                        />
                    </div>
                    {!isLoginMode && (
                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">
                                Email
                            </label>
                            <input
                                type="email"
                                id="email"
                                className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 leading-tight focus:outline-none focus:shadow-outline"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required={!isLoginMode}
                            />
                        </div>
                    )}
                    <div className="mb-6">
                        <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">
                            Password
                        </label>
                        <input
                            type="password"
                            id="password"
                            className="shadow appearance-none border rounded w-full py-2 px-3 text-gray-700 mb-3 leading-tight focus:outline-none focus:shadow-outline"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                        />
                    </div>
                    {error && <p className="text-red-500 text-xs italic mb-4">{error}</p>}
                    <div className="flex items-center justify-between">
                        <button
                            type="submit"
                            className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded focus:outline-none focus:shadow-outline"
                            disabled={isLoading || authLoading}
                        >
                            {isLoading ? 'Loading...' : (isLoginMode ? 'Login' : 'Sign Up')}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setIsLoginMode(!isLoginMode);
                                setError(null); // Clear error when toggling mode
                            }}
                            className="inline-block align-baseline font-bold text-sm text-blue-500 hover:text-blue-800"
                        >
                            {isLoginMode ? 'Need an account? Sign Up' : 'Already have an account? Login'}
                        </button>
                    </div>
                </form>
                <div className="text-center mt-4">
                    {/* Removed explicit close button, using X icon */}
                </div>
            </div>
        </div>
    );
};


// --- TinyTutorAppContent Component ---
type ContentMode = 'explain' | 'image' | 'fact' | 'quiz' | 'deep';

interface TinyTutorAppContentProps {
    inputQuestion: string;
    setInputQuestion: React.Dispatch<React.SetStateAction<string>>;
    generatedContents: Record<ContentMode, string>;
    setGeneratedContents: React.Dispatch<React.SetStateAction<Record<ContentMode, string>>>;
    activeMode: ContentMode;
    setActiveMode: React.Dispatch<React.SetStateAction<ContentMode>>;
    setShowAuthModal: React.Dispatch<React.SetStateAction<boolean>>; // Corrected type
    questionBeforeModalRef: React.MutableRefObject<string>;
    generateExplanation: (question: string, mode: ContentMode) => Promise<void>;
    isLoadingExplanation: boolean;
    aiError: string | null;
    loggedIn: boolean;
    // Removed explanation and setExplanation as they are now managed by generatedContents
}

const TinyTutorAppContent: React.FC<TinyTutorAppContentProps> = ({
    inputQuestion,
    setInputQuestion,
    generatedContents,
    setGeneratedContents,
    activeMode,
    setActiveMode,
    setShowAuthModal,
    questionBeforeModalRef,
    generateExplanation,
    isLoadingExplanation,
    aiError,
    loggedIn,
}) => {
    const { logout } = useAuth(); // Only logout needed here

    const handleGenerateExplanationClick = () => {
        if (!loggedIn) {
            questionBeforeModalRef.current = inputQuestion; // Store question before showing modal
            setShowAuthModal(true);
            return;
        }

        if (inputQuestion.trim() === '') {
            // Set an error or message if input is empty
            setGeneratedContents(prev => ({ ...prev, explain: 'Please enter a concept to generate an explanation.' }));
            setActiveMode('explain'); // Ensure 'explain' tab is active for the message
            return;
        }

        // Clear all generated content and set active mode to 'explain' for new generation
        setGeneratedContents({
            explain: '',
            image: 'Image generation feature coming soon! You can imagine an image of...',
            fact: '',
            quiz: '',
            deep: '',
        });
        setActiveMode('explain');
        generateExplanation(inputQuestion, 'explain');
    };

    // Conditional rendering for explanation box content
    const currentExplanationContent = generatedContents[activeMode];
    const showExplanationContent = currentExplanationContent || isLoadingExplanation || aiError;


    return (
        <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-3xl relative"> {/* Main content card */}
            {loggedIn && (
                <button
                    onClick={() => {
                        logout();
                        setInputQuestion('');
                        setGeneratedContents({ // Clear all content on logout
                            explain: '',
                            image: 'Image generation feature coming soon! You can imagine an image of...',
                            fact: '',
                            quiz: '',
                            deep: '',
                        });
                        setActiveMode('explain'); // Reset active mode on logout
                    }}
                    className="absolute top-4 right-4 p-2 bg-red-100 text-red-600 rounded-full text-sm font-semibold hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-300 transition duration-300"
                >
                    Logout
                </button>
            )}

            <h2 className="text-4xl font-extrabold text-center text-gray-800 mb-6">
                Welcome to Tiny Tutor! {loggedIn && user?.username && `(${user.username})`}
            </h2>
            {loggedIn && user && (
                <p className="text-center text-gray-600 text-lg mb-8">
                    Your tier: <span className="font-semibold text-blue-600">{user.tier}</span>
                </p>
            )}

            <div className="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
                <label htmlFor="question-input" className="block text-gray-700 text-xl font-bold mb-3">
                    Enter a word or concept:
                </label>
                <input
                    type="text"
                    id="question-input"
                    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200 text-lg"
                    placeholder="e.g., Photosynthesis, Quantum Computing, Democracy"
                    value={inputQuestion}
                    onChange={(e) => {
                        setInputQuestion(e.target.value);
                        setGeneratedContents((_prev) => ({ // Clear all content on input change
                            explain: '',
                            image: 'Image generation feature coming soon! You can imagine an image of...',
                            fact: '',
                            quiz: '',
                            deep: '',
                        }));
                        setActiveMode('explain'); // Reset to explain tab on input change
                    }}
                    disabled={isLoadingExplanation}
                />
                <button
                    onClick={handleGenerateExplanationClick}
                    className="mt-4 w-full bg-indigo-600 text-white py-3 rounded-lg font-bold text-xl hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-300 transition duration-300 transform hover:scale-100 active:scale-95 shadow-lg flex items-center justify-center"
                    disabled={isLoadingExplanation || inputQuestion.trim() === ''}
                >
                    {isLoadingExplanation && activeMode === 'explain' ? (
                        <>
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Generating...
                        </>
                    ) : (
                        'Generate Explanation'
                    )}
                </button>
                {aiError && !loggedIn && ( // Show AI error only if not logged in and it's an AI error
                    <p className="text-red-600 text-center text-sm font-medium mt-4">{aiError}</p>
                )}
                {!loggedIn && ( // Only show signup/login links if not logged in
                    <p className="text-gray-600 text-center text-sm mt-4">
                        <a
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                questionBeforeModalRef.current = inputQuestion; // Store question
                                setShowAuthModal(true); // Open modal for signup
                            }}
                            className="font-semibold text-blue-600 hover:underline"
                        >
                            Sign up
                        </a>{' '}
                        or{' '}
                        <a
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                questionBeforeModalRef.current = inputQuestion; // Store question
                                setShowAuthModal(true); // Open modal for login
                            }}
                            className="font-semibold text-blue-600 hover:underline"
                        >
                            Login
                        </a>{' '}
                        to generate explanations.
                    </p>
                )}
            </div>

            {/* NEW: Toggle Buttons - only show if logged in AND a question has been entered */}
            {loggedIn && inputQuestion.trim() !== '' && (
                <div className="flex justify-center space-x-2 mt-6 mb-4">
                    {(['explain', 'image', 'fact', 'quiz', 'deep'] as ContentMode[]).map(mode => (
                        <button
                            key={mode}
                            onClick={async () => {
                                setActiveMode(mode);
                                // If content for this mode isn't already generated AND it's not the image placeholder,
                                // AND there's a question, trigger generation.
                                if (inputQuestion.trim() !== '' && !generatedContents[mode] && mode !== 'image') {
                                    await generateExplanation(inputQuestion, mode);
                                }
                            }}
                            className={`px-4 py-2 rounded-full font-semibold text-sm transition-colors duration-200
                                        ${activeMode === mode
                                            ? 'bg-blue-600 text-white shadow-md'
                                            : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                                        }`}
                        >
                            {mode.charAt(0).toUpperCase() + mode.slice(1)}
                        </button>
                    ))}
                </div>
            )}

            {/* Explanation/Content Display Area - only show if there's content, loading, or an error */}
            {showExplanationContent && (
                <div className="mt-8 p-6 bg-blue-50 rounded-lg border border-blue-200 shadow-inner max-w-2xl mx-auto">
                    <h3 className="text-2xl font-bold text-blue-800 mb-4">
                        {activeMode.charAt(0).toUpperCase() + activeMode.slice(1)}:
                    </h3>
                    <div className="prose prose-lg max-w-none text-gray-800 leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
                        {isLoadingExplanation && !currentExplanationContent ? ( // Only show spinner if actively loading AND no content yet
                             <div className="flex items-center justify-center">
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Generating {activeMode} content...
                            </div>
                        ) : (
                            currentExplanationContent || (aiError ? (
                                <p className="text-red-600">{aiError}</p>
                            ) : (
                                <p className="text-gray-500">Enter a concept and click "Generate Explanation" to get started.</p>
                            ))
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};


// --- Main App Component ---
const App: React.FC = () => {
    const { user, loading: authLoading, logout } = useAuth();
    const [inputQuestion, setInputQuestion] = useState('');
    // Removed explanation and setExplanation as they are now managed by generatedContents
    const [generatedContents, setGeneratedContents] = useState<Record<ContentMode, string>>({
        explain: '',
        image: 'Image generation feature coming soon! You can imagine an image of...',
        fact: '',
        quiz: '',
        deep: '',
    });
    const [activeMode, setActiveMode] = useState<ContentMode>('explain');

    const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);
    const [aiError, setAiError] = useState<string | null>(null);
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');

    const questionBeforeModalRef = useRef('');

    const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';

    const getAuthHeaders = () => {
        const token = localStorage.getItem('access_token');
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    };

    const generateExplanation = async (questionToGenerate: string, mode: ContentMode) => {
        setAiError(null);
        setIsLoadingExplanation(true);

        console.log(`generateExplanation called for mode '${mode}' with question:`, questionToGenerate);

        try {
            const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ question: questionToGenerate, content_type: mode }),
            });

            if (response.ok) {
                const data = await response.json();
                const newContent = data.explanation;

                setGeneratedContents((currentContents) => ({
                    ...currentContents,
                    [mode]: newContent,
                }));
                console.log(`'${mode}' content generated.`);
            } else {
                const errorData = await response.json();
                const errorMessage = errorData.error || `Failed to generate ${mode} content.`;
                setAiError(errorMessage);
                console.error(`AI Generation Error for ${mode}:`, errorData);
                setGeneratedContents((currentContents) => ({
                    ...currentContents,
                    [mode]: '',
                }));
            }
        } catch (error) {
            setAiError(`Network error or unexpected response for ${mode}.`);
            console.error(`Error fetching AI explanation for ${mode}:`, error);
            setGeneratedContents((currentContents) => ({
                ...currentContents,
                [mode]: '',
            }));
        } finally {
            setIsLoadingExplanation(false);
        }
    };

    const handleShowLoginModal = (question: string) => {
        questionBeforeModalRef.current = question;
        setAuthModalMode('login');
        setShowAuthModal(true);
    };

    const handleShowSignupModal = (question: string) => {
        questionBeforeModalRef.current = question;
        setAuthModalMode('signup');
        setShowAuthModal(true);
    };

    if (authLoading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 text-gray-700 text-2xl font-semibold">
                Loading application...
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 font-inter text-gray-900 overflow-x-hidden p-4 relative">
            {/* Login/Signup or Logout button at top right of the overall app container */}
            <div className="absolute top-4 right-4 z-10">
                {user ? (
                    <button
                        onClick={() => {
                            logout();
                            setInputQuestion('');
                            setGeneratedContents({ // Clear all content on logout
                                explain: '',
                                image: 'Image generation feature coming soon! You can imagine an image of...',
                                fact: '',
                                quiz: '',
                                deep: '',
                            });
                            setActiveMode('explain'); // Reset active mode on logout
                        }}
                        className="p-2 bg-red-100 text-red-600 rounded-full text-sm font-semibold hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-red-300 transition duration-300"
                    >
                        Logout
                    </button>
                ) : (
                    <button
                        onClick={() => handleShowLoginModal(inputQuestion)} // Default to login when clicking this button
                        className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors duration-200"
                    >
                        Login / Signup
                    </button>
                )}
            </div>

            <div className="w-full max-w-3xl mx-auto my-8"> {/* This div now acts as the main content wrapper */}
                <TinyTutorAppContent
                    inputQuestion={inputQuestion}
                    setInputQuestion={setInputQuestion}
                    generatedContents={generatedContents}
                    setGeneratedContents={setGeneratedContents}
                    activeMode={activeMode}
                    setActiveMode={setActiveMode}
                    setShowAuthModal={setShowAuthModal}
                    questionBeforeModalRef={questionBeforeModalRef}
                    generateExplanation={generateExplanation}
                    isLoadingExplanation={isLoadingExplanation}
                    aiError={aiError}
                    loggedIn={user !== null}
                />
            </div>

            {showAuthModal && (
                <AuthModal
                    onClose={() => {
                        setShowAuthModal(false);
                    }}
                    onLoginSuccess={async (questionAfterLogin) => {
                        setShowAuthModal(false);
                        if (questionAfterLogin.trim() !== '') {
                            setInputQuestion(questionAfterLogin);
                            await generateExplanation(questionAfterLogin, 'explain');
                            questionBeforeModalRef.current = '';
                        }
                    }}
                    initialQuestion={questionBeforeModalRef.current}
                    initialMode={authModalMode}
                />
            )}
        </div>
    );
};

export default App;

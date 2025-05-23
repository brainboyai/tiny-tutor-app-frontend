import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { jwtDecode } from 'jwt-decode';

// --- AuthContext Definition ---
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

    useEffect(() => {
        const checkLoginStatus = async () => {
            setLoading(true);
            const token = localStorage.getItem('access_token');

            if (token) {
                try {
                    const decoded: User = jwtDecode(token);
                    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
                        localStorage.removeItem('access_token');
                        setUser(null);
                    } else {
                        setUser(decoded);
                    }
                } catch (error) {
                    console.error('AuthContext: Error decoding JWT:', error);
                    localStorage.removeItem('access_token');
                    setUser(null);
                }
            } else {
                setUser(null);
            }
            setLoading(false);
        };

        checkLoginStatus();
    }, []);

    const login = async (username: string, password: string) => {
        try {
            setLoading(true);
            const response = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password }),
            });

            if (response.ok) {
                const data = await response.json();
                const token = data.access_token;
                if (token) {
                    localStorage.setItem('access_token', token);
                    const decoded: User = jwtDecode(token);
                    setUser(decoded);
                    return true;
                }
                return false;
            } else {
                return false;
            }
        } catch (error) {
            console.error('AuthContext: Error during login:', error);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const signup = async (username: string, email: string, password: string) => {
        try {
            setLoading(true);
            const response = await fetch(`${API_BASE_URL}/signup`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, email, password }),
            });

            if (response.ok) {
                return true;
            } else {
                return false;
            }
        } catch (error) {
            console.error('AuthContext: Error during signup:', error);
            return false;
        } finally {
            setLoading(false);
        }
    };

    const logout = async () => {
        try {
            setLoading(true);
            localStorage.removeItem('access_token');
            setUser(null);
            await fetch(`${API_BASE_URL}/logout`, { method: 'POST', headers: getAuthHeaders() });
        } catch (error) {
            console.error('AuthContext: Error during logout:', error);
        } finally {
            setLoading(false);
        }
    };

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
    initialMode: 'login' | 'signup';
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose, onLoginSuccess, initialQuestion, initialMode }) => {
    const [showLogin, setShowLogin] = useState(initialMode === 'login');

    const handleLoginSuccess = async () => {
        await onLoginSuccess(initialQuestion);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md transform transition-all duration-300 scale-100 relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 text-2xl font-bold"
                >
                    &times;
                </button>
                {showLogin ? (
                    <LoginForm inModal={true} onLoginSuccess={handleLoginSuccess} onToggleSignup={() => setShowLogin(false)} />
                ) : (
                    <SignupForm inModal={true} onSignupSuccess={() => setShowLogin(true)} onToggleLogin={() => setShowLogin(true)} />
                )}
            </div>
        </div>
    );
};

// --- LoginForm Component ---
interface LoginFormProps {
    inModal?: boolean;
    onLoginSuccess?: () => void;
    onToggleSignup?: () => void;
}

const LoginForm: React.FC<LoginFormProps> = ({ inModal = false, onLoginSuccess, onToggleSignup }) => {
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);
        const success = await login(username, password);
        if (success) {
            onLoginSuccess?.();
        } else {
            setError('Invalid username or password. Please try again.');
        }
        setIsSubmitting(false);
    };

    return (
        <div className={!inModal ? "flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 p-4" : ""}>
            <div className={!inModal ? "bg-white p-8 rounded-xl shadow-2xl w-full max-w-md transform transition-all duration-300 hover:scale-105" : "p-8"}>
                <h2 className="text-4xl font-extrabold text-center text-gray-800 mb-8">Login</h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="username" className="block text-gray-700 text-sm font-semibold mb-2">
                            Username
                        </label>
                        <input
                            type="text"
                            id="username"
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200"
                            placeholder="Enter your username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            disabled={isSubmitting}
                        />
                    </div>
                    <div>
                        <label htmlFor="password" className="block text-gray-700 text-sm font-semibold mb-2">
                            Password
                        </label>
                        <input
                            type="password"
                            id="password"
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200"
                            placeholder="Enter your password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            disabled={isSubmitting}
                        />
                    </div>
                    {error && (
                        <p className="text-red-600 text-center text-sm font-medium -mt-2">{error}</p>
                    )}
                    <button
                        type="submit"
                        className="w-full bg-blue-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-300 transition duration-300 transform hover:scale-100 active:scale-95 shadow-lg"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Logging in...' : 'Login'}
                    </button>
                </form>
                {onToggleSignup && (
                    <p className="text-center text-gray-600 text-sm mt-6">
                        Don't have an account?{' '}
                        <a href="#" onClick={onToggleSignup} className="text-blue-600 hover:underline font-semibold">
                            Sign Up.
                        </a>
                    </p>
                )}
                {!inModal && (
                    <p className="text-center text-gray-600 text-sm mt-6">
                        Don't have an account?{' '}
                        <a href="#" onClick={() => window.location.hash = '#signup'} className="text-blue-600 hover:underline font-semibold">
                            Sign Up.
                        </a>
                    </p>
                )}
            </div>
        </div>
    );
};

// --- SignupForm Component ---
interface SignupFormProps {
    inModal?: boolean;
    onSignupSuccess?: () => void;
    onToggleLogin?: () => void;
}

const SignupForm: React.FC<SignupFormProps> = ({ inModal = false, onSignupSuccess, onToggleLogin }) => {
    const { signup } = useAuth();
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSuccessMessage('');
        setIsSubmitting(true);

        const success = await signup(username, email, password);
        if (success) {
            setSuccessMessage('Registration successful! Please log in.');
            setUsername('');
            setEmail('');
            setPassword('');
            onSignupSuccess?.();
        } else {
            setError('Registration failed. Username or email might already be taken, or inputs are invalid.');
        }
        setIsSubmitting(false);
    };

    return (
        <div className={!inModal ? "flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-green-500 to-teal-600 p-4" : ""}>
            <div className={!inModal ? "bg-white p-8 rounded-xl shadow-2xl w-full max-w-md transform transition-all duration-300 hover:scale-105" : "p-8"}>
                <h2 className="text-4xl font-extrabold text-center text-gray-800 mb-8">Sign Up</h2>
                <form onSubmit={handleSubmit} className="space-y-6">
                    <div>
                        <label htmlFor="signup-username" className="block text-gray-700 text-sm font-semibold mb-2">
                            Username
                        </label>
                        <input
                            type="text"
                            id="signup-username"
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-400 focus:border-transparent transition duration-200"
                            placeholder="Choose a username"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            required
                            disabled={isSubmitting}
                        />
                    </div>
                    <div>
                        <label htmlFor="signup-email" className="block text-gray-700 text-sm font-semibold mb-2">
                            Email
                        </label>
                        <input
                            type="email"
                            id="signup-email"
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-400 focus:border-transparent transition duration-200"
                            placeholder="Enter your email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            required
                            disabled={isSubmitting}
                        />
                    </div>
                    <div>
                        <label htmlFor="signup-password" className="block text-gray-700 text-sm font-semibold mb-2">
                            Password
                        </label>
                        <input
                            type="password"
                            id="signup-password"
                            className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-green-400 focus:border-transparent transition duration-200"
                            placeholder="Create a password (min 6 characters)"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            required
                            disabled={isSubmitting}
                        />
                    </div>
                    {error && (
                        <p className="text-red-600 text-center text-sm font-medium -mt-2">{error}</p>
                    )}
                    {successMessage && (
                        <p className="text-green-600 text-center text-sm font-medium -mt-2">{successMessage}</p>
                    )}
                    <button
                        type="submit"
                        className="w-full bg-green-600 text-white py-3 rounded-lg font-bold text-lg hover:bg-green-700 focus:outline-none focus:ring-4 focus:ring-green-300 transition duration-300 transform hover:scale-100 active:scale-95 shadow-lg"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? 'Registering...' : 'Sign Up'}
                    </button>
                </form>
                {onToggleLogin && (
                    <p className="text-center text-gray-600 text-sm mt-6">
                        Already have an account?{' '}
                        <a href="#" onClick={onToggleLogin} className="text-green-600 hover:underline font-semibold">
                            Login.
                        </a>
                    </p>
                )}
                {!inModal && (
                    <p className="text-center text-gray-600 text-sm mt-6">
                        Already have an account?{' '}
                        <a href="#" onClick={() => window.location.hash = '#login'} className="text-blue-600 hover:underline font-semibold">
                            Login.
                        </a>
                    </p>
                )}
            </div>
        </div>
    );
};


// --- TinyTutorAppContent Component ---
// Define a type for the content modes
type ContentMode = 'explain' | 'image' | 'fact' | 'quiz' | 'deep';

interface TinyTutorAppContentProps {
    inputQuestion: string;
    setInputQuestion: React.Dispatch<React.SetStateAction<string>>;
    generatedContents: Record<ContentMode, string>; // New prop for all generated content
    setGeneratedContents: React.Dispatch<React.SetStateAction<Record<ContentMode, string>>>; // New prop
    activeMode: ContentMode; // New prop for current active mode
    setActiveMode: React.Dispatch<React.SetStateAction<ContentMode>>; // New prop
    setShowLoginModal: (question: string) => void;
    setShowSignupModal: (question: string) => void;
    generateExplanation: (question: string, mode: ContentMode) => Promise<void>; // Modified prop
    isLoadingExplanation: boolean;
    aiError: string;
}

const TinyTutorAppContent: React.FC<TinyTutorAppContentProps> = ({
    inputQuestion,
    setInputQuestion,
    generatedContents,
    setGeneratedContents,
    activeMode,
    setActiveMode,
    setShowLoginModal,
    setShowSignupModal,
    generateExplanation,
    isLoadingExplanation,
    aiError,
}) => {
    const { user, logout } = useAuth();

    const handleGenerateExplanationClick = () => {
        console.log('Generate Explanation button clicked. Current user:', user);
        if (!user) {
            setShowLoginModal(inputQuestion);
            return;
        }
        console.log('User logged in. Generating explanation for:', inputQuestion);
        // Corrected: Remove 'prev =>' as we're not using previous state to compute new state
        setGeneratedContents({
            explain: '',
            image: 'Image generation feature coming soon! You can imagine an image of...',
            fact: '',
            quiz: '',
            deep: '',
        });
        setActiveMode('explain'); // Ensure 'explain' tab is active on initial generate
        generateExplanation(inputQuestion, 'explain'); // Explicitly generate 'explain' content
    };

    return (
        <div className="flex flex-col items-center w-full">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-3xl relative">
                {user && (
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
                    Welcome to Tiny Tutor! {user?.username && `(${user.username})`}
                </h2>
                {user && (
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
                            // Corrected: Use _prev to satisfy TS6133
                            setGeneratedContents((_prev) => ({
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
                        {isLoadingExplanation && activeMode === 'explain' ? ( // Only show spinner if actively loading 'explain'
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
                    {aiError && (
                        <p className="text-red-600 text-center text-sm font-medium mt-4">{aiError}</p>
                    )}
                    {!user && (
                        <p className="text-gray-600 text-center text-sm mt-4">
                            <a
                                href="#"
                                onClick={(e) => {
                                    e.preventDefault();
                                    setShowSignupModal(inputQuestion);
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
                                    setShowLoginModal(inputQuestion);
                                }}
                                className="font-semibold text-blue-600 hover:underline"
                            >
                                Login
                            </a>{' '}
                            to generate explanations.
                        </p>
                    )}
                </div>

                {/* NEW: Toggle Buttons */}
                {inputQuestion.trim() !== '' && ( // Only show buttons if a question has been entered
                    <div className="flex justify-center space-x-2 mt-6 mb-4">
                        {(['explain', 'image', 'fact', 'quiz', 'deep'] as ContentMode[]).map(mode => (
                            <button
                                key={mode}
                                onClick={async () => {
                                    setActiveMode(mode);
                                    // If content for this mode isn't already generated AND it's not the image placeholder,
                                    // AND there's a question, trigger generation.
                                    // The 'image' content is a fixed placeholder, so no API call needed for it.
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
                                {mode.charAt(0).toUpperCase() + mode.slice(1)} {/* Capitalize first letter */}
                            </button>
                        ))}
                    </div>
                )}


                {/* Explanation/Content Display Area */}
                {inputQuestion.trim() !== '' && ( // Only show explanation box if a question has been entered
                    <div className="mt-8 p-6 bg-blue-50 rounded-lg border border-blue-200 shadow-inner max-w-2xl mx-auto">
                        <h3 className="text-2xl font-bold text-blue-800 mb-4">
                            {activeMode.charAt(0).toUpperCase() + activeMode.slice(1)}: {/* Title based on active mode */}
                        </h3>
                        <div className="prose prose-lg max-w-none text-gray-800 leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
                            {isLoadingExplanation && generatedContents[activeMode] === '' && inputQuestion.trim() !== '' ? (
                                 <div className="flex items-center justify-center">
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Generating {activeMode} content...
                                </div>
                            ) : (
                                generatedContents[activeMode] || aiError || (inputQuestion.trim() === '' ? (
                                    <p className="text-gray-500">Enter a concept and click "Generate Explanation" to get started.</p>
                                ) : (
                                    <p className="text-gray-500">Select a tab above to generate more content.</p>
                                ))
                            )}
                            {/* Display AI error if present for current mode */}
                            {aiError && activeMode === 'explain' && <p className="text-red-600 text-sm mt-2">{aiError}</p>}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};


// --- Main App Component ---
const App: React.FC = () => {
    const { loading } = useAuth();
    const [inputQuestion, setInputQuestion] = useState('');
    // NEW: State to hold all generated contents by type
    const [generatedContents, setGeneratedContents] = useState<Record<ContentMode, string>>({
        explain: '',
        image: 'Image generation feature coming soon! You can imagine an image of...', // Initial placeholder
        fact: '',
        quiz: '',
        deep: '',
    });
    // NEW: State to track the currently active content mode (tab)
    const [activeMode, setActiveMode] = useState<ContentMode>('explain');

    const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);
    const [aiError, setAiError] = useState('');
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [authModalMode, setAuthModalMode] = useState<'login' | 'signup'>('login');

    const questionBeforeModalRef = useRef(''); // Used to store question when modal pops up

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

    // MODIFIED: generateExplanation now takes 'mode' as an argument
    const generateExplanation = async (questionToGenerate: string, mode: ContentMode) => {
        setAiError(''); // Clear error on new generation attempt
        setIsLoadingExplanation(true); // Set loading for any AI generation

        console.log(`generateExplanation called for mode '${mode}' with question:`, questionToGenerate);

        try {
            const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ question: questionToGenerate, content_type: mode }), // Pass content_type
            });

            if (response.ok) {
                const data = await response.json();
                const newContent = data.explanation;

                // Corrected: Changed '_prev' to 'currentContents' to satisfy TS6133
                setGeneratedContents((currentContents) => ({
                    ...currentContents,
                    [mode]: newContent,
                }));
                console.log(`'${mode}' content generated.`);
            } else {
                const errorData = await response.json();
                setAiError(errorData.error || `Failed to generate ${mode} content. Please try again.`);
                console.error(`AI Generation Error for ${mode}:`, errorData);
                // Also clear content for the errored mode
                setGeneratedContents((currentContents) => ({
                    ...currentContents,
                    [mode]: '',
                }));
            }
        } catch (error) {
            setAiError(`Network error or unexpected response for ${mode}.`);
            console.error(`Error fetching AI explanation for ${mode}:`, error);
            // Also clear content for the errored mode
            setGeneratedContents((currentContents) => ({
                ...currentContents,
                [mode]: '',
            }));
        } finally {
            setIsLoadingExplanation(false); // Reset loading
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

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 text-gray-700 text-2xl font-semibold">
                Loading application...
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 font-inter text-gray-900 overflow-x-hidden p-4">
            <div className="w-full max-w-3xl mx-auto my-8">
                <TinyTutorAppContent
                    inputQuestion={inputQuestion}
                    setInputQuestion={setInputQuestion}
                    generatedContents={generatedContents} // Pass new state
                    setGeneratedContents={setGeneratedContents} // Pass new state setter
                    activeMode={activeMode} // Pass new state
                    setActiveMode={setActiveMode} // Pass new state setter
                    setShowLoginModal={handleShowLoginModal}
                    setShowSignupModal={handleShowSignupModal}
                    generateExplanation={generateExplanation} // Pass modified function
                    isLoadingExplanation={isLoadingExplanation}
                    aiError={aiError}
                />
            </div>

            {showAuthModal && (
                <AuthModal
                    onClose={() => {
                        setShowAuthModal(false);
                    }}
                    // Corrected: Use the 'questionToGenerateAfterLogin' parameter directly
                    onLoginSuccess={async (questionToGenerateAfterLogin) => {
                        setShowAuthModal(false);
                        if (questionToGenerateAfterLogin.trim() !== '') {
                            setInputQuestion(questionToGenerateAfterLogin);
                            // After login, automatically generate the initial 'explain' content
                            await generateExplanation(questionToGenerateAfterLogin, 'explain');
                            questionBeforeModalRef.current = ''; // Clear ref after use
                        }
                    }}
                    initialQuestion={questionBeforeModalRef.current} // Pass the question from the ref
                    initialMode={authModalMode}
                />
            )}
        </div>
    );
};

export default App;

import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { jwtDecode } from 'jwt-decode'; // Import jwt-decode library

// --- AuthContext Definition ---
interface User {
    username: string;
    tier: string;
    exp?: number; // Expiration timestamp from JWT
}

interface AuthContextType {
    user: User | null;
    loading: boolean;
    login: (username: string, password: string) => Promise<boolean>;
    signup: (username: string, email: string, password: string) => Promise<boolean>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Custom hook to easily use AuthContext
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

// AuthProvider component: Handles login, signup, logout, and checks auth status on load.
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true); // Initial loading state for auth check

    // Base URL for your backend API
    const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';

    // Helper to get authorization headers with JWT
    const getAuthHeaders = () => {
        const token = localStorage.getItem('access_token');
        const headers: Record<string, string> = { // Explicitly type as Record<string, string>
            'Content-Type': 'application/json',
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`; // Only add if token exists
        }
        return headers;
    };

    // Function to check login status from the backend (now uses JWT)
    useEffect(() => {
        console.log('AuthContext: useEffect triggered to check login status (JWT).');
        const checkLoginStatus = async () => {
            setLoading(true);
            const token = localStorage.getItem('access_token');

            if (token) {
                try {
                    const decoded: User = jwtDecode(token);
                    // Check if token is expired
                    if (decoded.exp && decoded.exp * 1000 < Date.now()) {
                        console.log('AuthContext: JWT expired, clearing token.');
                        localStorage.removeItem('access_token');
                        setUser(null);
                    } else {
                        setUser(decoded);
                        console.log('AuthContext: User restored from JWT:', decoded.username);
                        // Optionally, hit /status to ensure backend also recognizes the token
                        // This is good practice, but for JWTs, the token itself is often enough.
                        // const response = await fetch(`${API_BASE_URL}/status`, { headers: getAuthHeaders() });
                        // if (!response.ok) {
                        //     localStorage.removeItem('access_token');
                        //     setUser(null);
                        //     console.log('AuthContext: Backend status check failed, token likely invalid.');
                        // }
                    }
                } catch (error) {
                    console.error('AuthContext: Error decoding JWT:', error);
                    localStorage.removeItem('access_token');
                    setUser(null);
                }
            } else {
                console.log('AuthContext: No JWT found in localStorage.');
                setUser(null);
            }
            setLoading(false);
            console.log('AuthContext: Loading status check complete. setLoading(false).');
        };

        checkLoginStatus();
    }, []); // Run only once on mount

    // Function to handle user login
    const login = async (username: string, password: string) => {
        try {
            setLoading(true);
            console.log('AuthContext: Attempting login for:', username);
            const response = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            });

            if (response.ok) {
                const data = await response.json();
                console.log('AuthContext: Login response data:', data);
                const token = data.access_token;
                if (token) {
                    localStorage.setItem('access_token', token);
                    const decoded: User = jwtDecode(token);
                    setUser(decoded);
                    console.log('AuthContext: Login successful for:', decoded.username, 'Token stored.');
                    return true;
                } else {
                    console.error('AuthContext: Login successful but no token received.');
                    return false;
                }
            } else {
                const errorData = await response.json();
                console.error('AuthContext: Login failed:', errorData.error);
                return false;
            }
        } catch (error) {
            console.error('AuthContext: Error during login:', error);
            return false;
        } finally {
            setLoading(false);
        }
    };

    // Function to handle user signup
    const signup = async (username: string, email: string, password: string) => {
        try {
            setLoading(true);
            console.log('AuthContext: Attempting signup for:', username);
            const response = await fetch(`${API_BASE_URL}/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, email, password }),
            });

            if (response.ok) {
                console.log('AuthContext: Signup successful.');
                return true;
            } else {
                const errorData = await response.json();
                console.error('AuthContext: Signup failed:', errorData.error);
                return false;
            }
        } catch (error) {
            console.error('AuthContext: Error during signup:', error);
            return false;
        } finally {
            setLoading(false);
        }
    };

    // Function to handle user logout
    const logout = async () => {
        try {
            setLoading(true);
            console.log('AuthContext: Attempting logout (client-side JWT removal).');
            // For JWT, logout is primarily removing the token from client storage
            localStorage.removeItem('access_token');
            setUser(null);
            console.log('AuthContext: Logout successful.');
            // Optionally, you can still hit a backend logout endpoint if it performs server-side cleanup
            await fetch(`${API_BASE_URL}/logout`, {
                method: 'POST',
                headers: getAuthHeaders(), // Send token just in case backend expects it for logging
            });
        } catch (error) {
            console.error('AuthContext: Error during logout:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        console.log('AuthContext: User state changed to:', user);
    }, [user]);

    useEffect(() => {
        console.log('AuthContext: Loading state changed to:', loading);
    }, [loading]);

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
    // NEW: Prop to control which form is initially shown
    initialMode: 'login' | 'signup';
}

const AuthModal: React.FC<AuthModalProps> = ({ onClose, onLoginSuccess, initialQuestion, initialMode }) => {
    // NEW: Initialize showLogin based on initialMode prop
    const [showLogin, setShowLogin] = useState(initialMode === 'login');

    const handleLoginSuccess = async () => {
        console.log('AuthModal: handleLoginSuccess triggered. Initial question:', initialQuestion);
        // AWAIT the parent's async callback which now also handles closing the modal
        await onLoginSuccess(initialQuestion);
        // REMOVED: onClose(); // This is now handled by the parent (App component)
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
        console.log('LoginForm: Submitting login form.');
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
        console.log('SignupForm: Submitting signup form.');
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
interface TinyTutorAppContentProps {
    inputQuestion: string;
    setInputQuestion: React.Dispatch<React.SetStateAction<string>>;
    explanation: string;
    setExplanation: React.Dispatch<React.SetStateAction<string>>;
    setShowLoginModal: (question: string) => void;
    setShowSignupModal: (question: string) => void;
    generateExplanation: (question: string) => Promise<void>;
    isLoadingExplanation: boolean;
    aiError: string;
}

const TinyTutorAppContent: React.FC<TinyTutorAppContentProps> = ({
    inputQuestion,
    setInputQuestion,
    explanation,
    setExplanation,
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
        generateExplanation(inputQuestion);
    };

    return (
        <div className="flex flex-col items-center w-full">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-3xl relative"> {/* Added 'relative' here */}
                {user && ( // Moved Logout button here, and added styling
                    <button
                        onClick={() => {
                            logout();
                            setInputQuestion('');
                            setExplanation('');
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
                            setExplanation('');
                        }}
                        disabled={isLoadingExplanation}
                    />
                    <button
                        onClick={handleGenerateExplanationClick}
                        className="mt-4 w-full bg-indigo-600 text-white py-3 rounded-lg font-bold text-xl hover:bg-indigo-700 focus:outline-none focus:ring-4 focus:ring-indigo-300 transition duration-300 transform hover:scale-100 active:scale-95 shadow-lg flex items-center justify-center"
                        disabled={isLoadingExplanation || inputQuestion.trim() === ''}
                    >
                        {isLoadingExplanation ? (
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

                {explanation && (
                    <div className="mt-8 p-6 bg-blue-50 rounded-lg border border-blue-200 shadow-inner max-w-2xl mx-auto">
                        <h3 className="text-2xl font-bold text-blue-800 mb-4">Explanation:</h3>
                        <div className="prose prose-lg max-w-none text-gray-800 leading-relaxed whitespace-pre-wrap max-h-80 overflow-y-auto">
                            {explanation}
                        </div>
                    </div>
                )}
                {/* The old position of the logout button is now empty, removed */}
            </div>
        </div>
    );
};


// --- Main App Component ---
const App: React.FC = () => {
    const { loading } = useAuth();
    const [inputQuestion, setInputQuestion] = useState('');
    const [explanation, setExplanation] = useState('');
    const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);
    const [aiError, setAiError] = useState('');
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

    const generateExplanation = async (questionToGenerate: string) => {
        setAiError('');
        setIsLoadingExplanation(true);
        setExplanation('');

        console.log('generateExplanation called with:', questionToGenerate);

        try {
            const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ question: questionToGenerate }),
            });

            if (response.ok) {
                const data = await response.json();
                setExplanation(data.explanation);
                console.log('Explanation generated:', data.explanation);
            } else {
                const errorData = await response.json();
                setAiError(errorData.error || 'Failed to generate explanation. Please try again.');
                console.error('AI Explanation Error:', errorData);
            }
        } catch (error) {
            setAiError('Network error or unexpected response from AI service.');
            console.error('Error fetching AI explanation:', error);
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

    console.log('App: Rendering. Loading:', loading);

    if (loading) {
        console.log('App: Showing loading message.');
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 text-gray-700 text-2xl font-semibold">
                Loading application...
            </div>
        );
    }

    console.log('App: Loading complete, showing TinyTutorAppContent.');
    return (
        <div className="flex flex-col items-center min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 font-inter text-gray-900 overflow-x-hidden p-4">
            <div className="w-full max-w-3xl mx-auto my-8">
                <TinyTutorAppContent
                    inputQuestion={inputQuestion}
                    setInputQuestion={setInputQuestion}
                    explanation={explanation}
                    setExplanation={setExplanation}
                    setShowLoginModal={handleShowLoginModal}
                    setShowSignupModal={handleShowSignupModal}
                    generateExplanation={generateExplanation}
                    isLoadingExplanation={isLoadingExplanation}
                    aiError={aiError}
                />
            </div>

            {showAuthModal && (
                <AuthModal
                    onClose={() => {
                        console.log('AuthModal: onClose called.');
                        setShowAuthModal(false);
                    }}
                    onLoginSuccess={async (question) => {
                        console.log('App: onLoginSuccess handler called with question:', question);
                        setShowAuthModal(false);

                        if (questionBeforeModalRef.current.trim() !== '') {
                            setInputQuestion(questionBeforeModalRef.current);
                            await generateExplanation(questionBeforeModalRef.current);
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

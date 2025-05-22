import React, { useState, useEffect, createContext, useContext } from 'react';

// --- AuthContext Definition (from previous steps) ---
// This context manages user authentication state across the app.
interface AuthContextType {
    user: { username: string; tier: string } | null;
    loading: boolean;
    login: (username: string, password: string) => Promise<boolean>;
    signup: (username: string, email: string, password: string) => Promise<boolean>;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// AuthProvider component: Handles login, signup, logout, and checks auth status on load.
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<{ username: string; tier: string } | null>(null);
    const [loading, setLoading] = useState(true); // Initial loading state for auth check

    // Base URL for your backend API
    const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';

    // Function to check login status from the backend
    useEffect(() => {
        console.log('AuthContext: useEffect triggered to check login status.');
        const checkLoginStatus = async () => {
            try {
                setLoading(true);
                console.log('AuthContext: Fetching status from backend...');
                const response = await fetch(`${API_BASE_URL}/status`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    // Crucial for session cookies to be sent and received
                    credentials: 'include',
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log('AuthContext: Status response data:', data);
                    if (data.logged_in) {
                        setUser({ username: data.username, tier: data.tier });
                        console.log('AuthContext: User state changed to:', { username: data.username, tier: data.tier });
                    } else {
                        setUser(null);
                        console.log('AuthContext: User is NOT logged in.');
                    }
                } else {
                    // Handle cases where status check fails (e.g., server error)
                    console.error('AuthContext: Failed to check login status:', response.status);
                    setUser(null);
                }
            } catch (error) {
                console.error('AuthContext: Error checking login status:', error);
                setUser(null); // Ensure user is null on network errors
            } finally {
                setLoading(false);
                console.log('AuthContext: Loading status check complete. setLoading(false).');
            }
        };

        checkLoginStatus();
    }, []); // Empty dependency array means this runs once on mount

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
                credentials: 'include', // Crucial for session cookies
            });

            if (response.ok) {
                const data = await response.json();
                console.log('AuthContext: Login response data:', data);
                setUser({ username: data.username, tier: data.tier });
                console.log('AuthContext: Login successful for:', data.username);
                return true;
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
                credentials: 'include', // Crucial for session cookies
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
            console.log('AuthContext: Attempting logout.');
            const response = await fetch(`${API_BASE_URL}/logout`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include', // Crucial for session cookies
            });

            if (response.ok) {
                setUser(null);
                console.log('AuthContext: Logout successful.');
            } else {
                console.error('AuthContext: Logout failed.');
            }
        } catch (error) {
            console.error('AuthContext: Error during logout:', error);
        } finally {
            setLoading(false);
        }
    };

    // Log user and loading state changes
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

// Custom hook to easily use AuthContext
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

// --- LoginForm Component ---
const LoginForm: React.FC = () => {
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
        if (!success) {
            setError('Invalid username or password. Please try again.');
        }
        setIsSubmitting(false);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-500 to-purple-600 p-4">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md transform transition-all duration-300 hover:scale-105">
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
                <p className="text-center text-gray-600 text-sm mt-6">
                    Don't have an account?{' '}
                    <a href="#" onClick={() => window.location.hash = '#signup'} className="text-blue-600 hover:underline font-semibold">
                        Sign Up.
                    </a>
                </p>
            </div>
        </div>
    );
};

// --- SignupForm Component ---
const SignupForm: React.FC = () => {
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
        } else {
            setError('Registration failed. Username or email might already be taken, or inputs are invalid.');
        }
        setIsSubmitting(false);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-green-500 to-teal-600 p-4">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-md transform transition-all duration-300 hover:scale-105">
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
                <p className="text-center text-gray-600 text-sm mt-6">
                    Already have an account?{' '}
                    <a href="#" onClick={() => window.location.hash = '#login'} className="text-green-600 hover:underline font-semibold">
                        Login.
                    </a>
                </p>
            </div>
        </div>
    );
};

// --- TinyTutorAppContent Component (New) ---
const TinyTutorAppContent: React.FC = () => {
    const { user, logout } = useAuth();
    const [inputQuestion, setInputQuestion] = useState('');
    const [explanation, setExplanation] = useState('');
    const [isLoadingExplanation, setIsLoadingExplanation] = useState(false);

    const handleGenerateExplanation = async () => {
        setIsLoadingExplanation(true);
        setExplanation(''); // Clear previous explanation

        // Simulate API call to LLM
        await new Promise(resolve => setTimeout(resolve, 2000)); // Simulate network delay

        // Placeholder explanation - we'll replace this with actual LLM call later
        const dummyExplanation = `
      You asked about "${inputQuestion}". Here's a placeholder explanation for now:

      The concept of "${inputQuestion}" is a fundamental topic in [relevant field]. It involves [briefly explain what it involves]. Its significance lies in [mention why it's important].

      We will integrate a powerful AI model here soon to provide detailed and accurate explanations tailored to your questions!
    `;
        setExplanation(dummyExplanation);
        setIsLoadingExplanation(false);
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-br from-blue-600 to-purple-700 p-4 font-inter text-gray-900">
            <div className="bg-white p-8 rounded-xl shadow-2xl w-full max-w-3xl transform transition-all duration-300 hover:scale-105">
                <h2 className="text-4xl font-extrabold text-center text-gray-800 mb-6">
                    Welcome, {user?.username}!
                </h2>
                <p className="text-center text-gray-600 text-lg mb-8">
                    Your tier: <span className="font-semibold text-blue-600">{user?.tier}</span>
                </p>

                <div className="mb-8 p-6 bg-gray-50 rounded-lg border border-gray-200">
                    <label htmlFor="question-input" className="block text-gray-700 text-xl font-bold mb-3">
                        Ask Tiny Tutor:
                    </label>
                    <textarea
                        id="question-input"
                        className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-400 focus:border-transparent transition duration-200 text-lg resize-y min-h-[120px]"
                        placeholder="e.g., 'Explain photosynthesis in simple terms' or 'What is quantum computing?'"
                        value={inputQuestion}
                        onChange={(e) => setInputQuestion(e.target.value)}
                        rows={5}
                        disabled={isLoadingExplanation}
                    ></textarea>
                    <button
                        onClick={handleGenerateExplanation}
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
                </div>

                {explanation && (
                    <div className="mt-8 p-6 bg-blue-50 rounded-lg border border-blue-200 shadow-inner">
                        <h3 className="text-2xl font-bold text-blue-800 mb-4">Explanation:</h3>
                        <div className="prose prose-lg max-w-none text-gray-800 leading-relaxed whitespace-pre-wrap">
                            {explanation}
                        </div>
                    </div>
                )}

                <button
                    onClick={logout}
                    className="mt-10 px-6 py-3 bg-red-500 text-white rounded-lg font-bold text-lg hover:bg-red-600 focus:outline-none focus:ring-4 focus:ring-red-300 transition duration-300 transform hover:scale-100 active:scale-95 shadow-lg"
                >
                    Logout
                </button>
            </div>
        </div>
    );
};

// --- Main App Component ---
const App: React.FC = () => {
    const { user, loading } = useAuth();

    console.log('App: Rendering. Loading:', loading, 'User:', user);

    if (loading) {
        console.log('App: Showing loading message.');
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-100 text-gray-700 text-2xl font-semibold">
                Loading application...
            </div>
        );
    }

    if (user) {
        console.log('App: User is logged in, showing TinyTutorAppContent.');
        return <TinyTutorAppContent />;
    } else {
        console.log('App: User is NOT logged in, showing authentication forms.');
        // Simple routing based on URL hash
        const currentHash = window.location.hash;
        if (currentHash === '#signup') {
            return <SignupForm />;
        }
        return <LoginForm />;
    }
};

export default App;

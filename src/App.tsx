import React, { useState, useEffect, createContext, useContext, useRef } from 'react';
import { jwtDecode, JwtPayload } from 'jwt-decode'; // Import JwtPayload

// --- AuthContext Definition ---
// Extend JwtPayload to include custom fields like 'username' and 'tier'
interface CustomJwtPayload extends JwtPayload {
    username: string;
    tier: string;
}

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
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };
        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }
        return headers;
    };

    // --- Authentication Functions ---
    const login = async (username: string, password: string): Promise<boolean> => {
        try {
            const response = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
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
                headers: {
                    'Content-Type': 'application/json',
                },
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
            // Optional: Call backend logout if server-side session invalidation is needed
            // await fetch(`${API_BASE_URL}/logout`, { method: 'POST', headers: getAuthHeaders() });
            localStorage.removeItem('access_token');
            setUser(null);
            console.log('Logged out successfully.');
        } catch (error) {
            console.error('Error during logout:', error);
        }
    };

    // --- Effect for Initial Auth Check ---
    useEffect(() => {
        const checkAuthStatus = () => {
            try {
                const token = localStorage.getItem('access_token');
                if (token) {
                    const decodedUser: CustomJwtPayload = jwtDecode(token);
                    // Check if token is expired
                    if (decodedUser.exp && decodedUser.exp * 1000 < Date.now()) {
                        console.log('Token expired. Logging out automatically.');
                        localStorage.removeItem('access_token'); // Clear expired token
                        setUser(null);
                    } else {
                        setUser({ username: decodedUser.username, tier: decodedUser.tier, exp: decodedUser.exp });
                    }
                }
            } catch (error) {
                console.error('Error decoding token or token invalid. Clearing local storage.', error);
                localStorage.removeItem('access_token'); // Clear any invalid or malformed token
                setUser(null);
            } finally {
                setLoading(false); // Authentication check is complete
            }
        };

        checkAuthStatus();
    }, []); // Empty dependency array means this runs once on mount

    return (
        <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

// --- TinyTutorAppContent Component ---
interface TinyTutorAppContentProps {
    inputQuestion: string;
    setInputQuestion: (question: string) => void;
    explanation: string;
    setExplanation: (explanation: string) => void;
    setShowAuthModal: (show: boolean) => void;
    questionBeforeModalRef: React.MutableRefObject<string>;
    generateExplanation: (question: string, mode: ContentMode) => Promise<void>; // Added mode parameter
    isLoadingExplanation: boolean;
    aiError: string | null;
    loggedIn: boolean; // Added loggedIn prop
}

type ContentMode = 'explain' | 'fact' | 'quiz' | 'deep' | 'image';

const TinyTutorAppContent: React.FC<TinyTutorAppContentContentProps> = ({
    inputQuestion,
    setInputQuestion,
    explanation,
    setExplanation,
    setShowAuthModal,
    questionBeforeModalRef,
    generateExplanation,
    isLoadingExplanation,
    aiError,
    loggedIn // Receive the loggedIn prop
}) => {
    const [selectedMode, setSelectedMode] = useState<ContentMode>('explain'); // Default to 'explain'
    const [showExplanationBox, setShowExplanationBox] = useState(false); // Control visibility of explanation box

    const buttonMap: { [key in ContentMode]: string } = {
        explain: 'Explain',
        fact: 'Fact',
        quiz: 'Quiz',
        deep: 'Deep Dive',
        image: 'Generate Image (future)'
    };

    const handleGenerateExplanation = async () => {
        console.log('Generate Explanation button clicked. Current user:', loggedIn ? 'logged in' : 'null');
        if (!loggedIn) {
            questionBeforeModalRef.current = inputQuestion;
            setShowAuthModal(true);
            return;
        }

        if (inputQuestion.trim() === '') {
            setExplanation('Please enter a question to generate an explanation.');
            setShowExplanationBox(true); // Show box for error message
            return;
        }

        setShowExplanationBox(true); // Always show explanation box when generating
        await generateExplanation(inputQuestion, selectedMode); // Pass selectedMode
    };

    // Effect to hide explanation box when question or explanation changes to empty,
    // or when user logs out/is not logged in and there's no question.
    useEffect(() => {
        if (!loggedIn && inputQuestion === '' && explanation === '') {
            setShowExplanationBox(false);
        } else if (inputQuestion !== '' || explanation !== '') {
            // Keep box visible if there's content or a question typed
            // You might want to refine this to only show if there's actual explanation content,
            // but for now, if inputQuestion is present, it implies user interaction.
        }
    }, [loggedIn, inputQuestion, explanation]);


    return (
        <div className="tiny-tutor-container bg-white p-8 rounded-lg shadow-lg w-full max-w-2xl text-center">
            <h1 className="text-4xl font-bold text-gray-800 mb-6">Tiny Tutor</h1>

            <input
                type="text"
                placeholder="Ask me anything..."
                className="w-full p-3 border border-gray-300 rounded-lg mb-4 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
                value={inputQuestion}
                onChange={(e) => setInputQuestion(e.target.value)}
                onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                        handleGenerateExplanation();
                    }
                }}
            />

            {/* Conditional rendering for buttons and explanation box */}
            {loggedIn ? ( // ONLY render these if loggedIn is true
                <>
                    <div className="button-group flex flex-wrap justify-center gap-2 mb-4">
                        {Object.keys(buttonMap).map((key) => (
                            <button
                                key={key}
                                className={`px-4 py-2 rounded-lg transition-colors duration-200 ${
                                    selectedMode === key
                                        ? 'bg-blue-500 text-white'
                                        : 'bg-gray-200 text-gray-800 hover:bg-blue-200'
                                }`}
                                onClick={() => setSelectedMode(key as ContentMode)}
                            >
                                {buttonMap[key as ContentMode]}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={handleGenerateExplanation}
                        className="bg-green-500 text-white px-6 py-3 rounded-lg hover:bg-green-600 transition-colors duration-200 text-lg font-semibold mb-4"
                        disabled={isLoadingExplanation}
                    >
                        {isLoadingExplanation ? 'Generating...' : 'Generate Explanation'}
                    </button>

                    {showExplanationBox && (
                        <div className="explanation-box border border-gray-300 p-4 rounded-lg bg-gray-50 text-left">
                            {isLoadingExplanation ? (
                                <p>Generating explanation...</p>
                            ) : aiError ? (
                                <p className="text-red-500">{aiError}</p>
                            ) : (
                                <p>{explanation}</p>
                            )}
                        </div>
                    )}
                </>
            ) : (
                <p className="text-gray-600 mb-4">Please log in to generate explanations.</p>
            )}
        </div>
    );
};


// --- Main App Component ---
const App: React.FC = () => {
    const { user, loading: authLoading, login, signup, logout } = useAuth();
    const [inputQuestion, setInputQuestion] = useState('');
    const [explanation, setExplanation] = useState('');
    const [showAuthModal, setShowAuthModal] = useState(false);
    const [isLoadingExplanation, setIsLoadingExplanation] = useState(false); // Loading state for AI generation
    const [aiError, setAiError] = useState<string | null>(null); // State for AI generation errors
    const questionBeforeModalRef = useRef<string>(''); // Ref to store question before showing auth modal

    // Base URL for your backend API
    const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';

    // Helper to get authorization headers with JWT
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


    const generateExplanation = async (question: string, mode: ContentMode = 'explain') => {
        setIsLoadingExplanation(true);
        setAiError(null); // Clear previous errors
        try {
            console.log(`generateExplanation called for mode '${mode}' with question: ${question}`);
            const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({ question, content_type: mode }),
            });

            if (response.ok) {
                const data = await response.json();
                setExplanation(data.explanation);
                console.log('Explanation generated successfully.');
            } else {
                const errorData = await response.json();
                const errorMessage = errorData.error || 'Unknown AI generation error.';
                setExplanation(''); // Clear previous explanation
                setAiError(`AI Generation Error for ${mode}: ${errorMessage}`);
                console.error(`AI Generation Error for ${mode}:`, errorData);
            }
        } catch (error) {
            setExplanation(''); // Clear previous explanation
            setAiError('Network or server error during AI generation.');
            console.error('Error during AI generation:', error);
        } finally {
            setIsLoadingExplanation(false);
        }
    };


    // If auth is still loading, show a loading message or spinner
    if (authLoading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100 text-gray-700">Loading authentication...</div>;
    }


    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
            <div className="main-app-container">
                <nav className="absolute top-4 right-4">
                    {user ? (
                        <div className="flex items-center space-x-4">
                            <span className="text-gray-700 font-medium">Welcome, {user.username}!</span>
                            <button
                                onClick={logout}
                                className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition-colors duration-200"
                            >
                                Logout
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={() => setShowAuthModal(true)}
                            className="bg-blue-500 text-white px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors duration-200"
                        >
                            Login / Signup
                        </button>
                    )}
                </nav>

                <TinyTutorAppContent
                    inputQuestion={inputQuestion}
                    setInputQuestion={setInputQuestion}
                    explanation={explanation}
                    setExplanation={setExplanation}
                    setShowAuthModal={setShowAuthModal}
                    questionBeforeModalRef={questionBeforeModalRef}
                    generateExplanation={generateExplanation}
                    isLoadingExplanation={isLoadingExplanation} // Pass the state value as prop
                    aiError={aiError} // Pass the state value as prop
                    loggedIn={user !== null} // Pass the loggedIn status to TinyTutorAppContent
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
                        // Immediately close the modal as soon as login is successful
                        setShowAuthModal(false);

                        // Only attempt to generate explanation if there was a question typed before modal
                        if (question.trim() !== '') {
                            setInputQuestion(question);
                            // After login, set a timeout to allow state updates and re-renders to settle,
                            // then generate explanation using the 'explain' mode (or default)
                            setTimeout(() => {
                                generateExplanation(question, 'explain'); // Default to 'explain' after login
                            }, 100); // Small delay
                        }
                    }}
                    initialQuestion={questionBeforeModalRef.current} // Use the ref for initial question
                />
            )}
        </div>
    );
};

export default App;

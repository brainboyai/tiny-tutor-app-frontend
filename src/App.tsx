// src/App.tsx
// This is the main React application component.
// It handles showing either the authentication forms or the main app content
// based on the user's login status.

// Import necessary React hooks and types
import React, { useState, useEffect, createContext, useContext } from 'react';
// Import ReactNode specifically as a type
import type { ReactNode } from 'react';


// --- Tailwind CSS is assumed to be configured in your project ---
// For a simple setup, you might include the CDN script in your public/index.html
// <script src="https://cdn.tailwindcss.com"></script>

// --- Placeholder UI Components (Basic HTML elements with Tailwind classes) ---
// These components mimic the appearance of shadcn/ui using standard HTML and Tailwind.
// We are adding basic TypeScript types to the props.
// If you install shadcn/ui, delete these definitions and use the actual imports.

// Define types for common props
interface CommonProps {
    className?: string;
    children?: ReactNode; // Represents any valid React child (elements, strings, etc.)
}

interface InputProps extends CommonProps {
    type?: string;
    placeholder?: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void; // Explicit type for change event
    id?: string;
    required?: boolean;
    minLength?: number; // Use number for minLength
}

interface ButtonProps extends CommonProps {
    onClick?: (e?: React.MouseEvent<HTMLButtonElement>) => void; // Explicit type for click event
    type?: "button" | "submit" | "reset"; // Specific string literal types for button type
    variant?: "default" | "link"; // Example variants
}

interface CardProps extends CommonProps { }
interface CardHeaderProps extends CommonProps { }
interface CardTitleProps extends CommonProps { }
interface CardDescriptionProps extends CommonProps { }
interface CardContentProps extends CommonProps { }

interface LabelProps extends CommonProps {
    htmlFor?: string;
}


const Input: React.FC<InputProps> = ({ type = "text", placeholder, value, onChange, className, id, required, minLength }) => (
    <input
        type={type}
        id={id}
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        required={required}
        minLength={minLength}
        className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    />
);

const Button: React.FC<ButtonProps> = ({ onClick, children, className, type = "button", variant, ...props }) => (
    <button
        onClick={onClick}
        type={type}
        className={`inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2
                ${variant === 'link' ? 'text-primary underline-offset-4 hover:underline' : 'bg-primary text-primary-foreground hover:bg-primary/90'}
                ${className}`}
        {...props} // Spread any additional props
    >
        {children}
    </button>
);

const Card: React.FC<CardProps> = ({ children, className }) => <div className={`rounded-xl border bg-card text-card-foreground shadow ${className}`}>{children}</div>;
const CardHeader: React.FC<CardHeaderProps> = ({ children, className }) => <div className={`flex flex-col space-y-1.5 p-6 ${className}`}>{children}</div>;
const CardTitle: React.FC<CardTitleProps> = ({ children, className }) => <h3 className={`font-semibold leading-none tracking-tight ${className}`}>{children}</h3>;
const CardDescription: React.FC<CardDescriptionProps> = ({ children, className }) => <p className={`text-sm text-muted-foreground ${className}`}>{children}</p>;
const CardContent: React.FC<CardContentProps> = ({ children, className }) => <div className={`p-6 pt-0 ${className}`}>{children}</div>;
const Label: React.FC<LabelProps> = ({ htmlFor, children, className }) => <label htmlFor={htmlFor} className={`text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 ${className}`}>{children}</label>;


// --- Authentication Context ---
// Define the type for the user object
interface User {
    username: string;
    tier: string; // Assuming tier is a string like 'free' or 'pro'
}

// Define the type for the AuthContext value
interface AuthContextType {
    user: User | null; // User can be a User object or null
    loading: boolean;
    login: (username: string, password: string) => Promise<{ success: boolean; message?: string; error?: string }>;
    signup: (username: string, email: string, password: string) => Promise<{ success: boolean; message?: string; error?: string }>;
    logout: () => Promise<{ success: boolean; message?: string; error?: string }>;
}

// Create the AuthContext with a default value of null
const AuthContext = createContext<AuthContextType | null>(null);

// Custom hook to easily access the AuthContext
export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === null) { // Check for null explicitly
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

// --- Auth Provider Component ---
// Wraps the main application to provide authentication state and functions.
const AuthProvider: React.FC<CommonProps> = ({ children }) => {
    // State to hold logged-in user information (null if not logged in)
    const [user, setUser] = useState<User | null>(null); // Explicitly type the state
    // State to indicate if the app is currently checking login status
    const [loading, setLoading] = useState(true);

    // *** IMPORTANT: Replace 'YOUR_RENDER_BACKEND_URL' with the actual URL of your Render backend service ***
    const backendBaseUrl = 'https://tiny-tutor-app.onrender.com'; // <--- UPDATED HERE

    // Effect to check login status when the component mounts
    useEffect(() => {
        console.log('AuthContext: useEffect triggered to check login status.'); // Debug log
        const checkLoginStatus = async () => {
            try {
                console.log('AuthContext: Fetching status from backend...'); // Debug log
                const response = await fetch(`${backendBaseUrl}/status`, {
                    method: 'GET',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    credentials: 'include'
                });

                if (response.ok) {
                    const data = await response.json();
                    console.log('AuthContext: Status response data:', data); // Debug log
                    if (data.logged_in) {
                        if (data.username && data.tier) {
                            setUser({ username: data.username, tier: data.tier });
                            console.log('AuthContext: User is logged in:', data.username); // Debug log
                        } else {
                            console.error('AuthContext: Status response missing username or tier');
                            setUser(null);
                        }
                    } else {
                        setUser(null);
                        console.log('AuthContext: User is NOT logged in.'); // Debug log
                    }
                } else {
                    console.error('AuthContext: Failed to fetch login status:', response.status); // Debug log
                    setUser(null);
                }
            } catch (error) {
                console.error('AuthContext: Error checking login status:', error); // Debug log
                setUser(null);
            } finally {
                setLoading(false);
                console.log('AuthContext: Loading status check complete. setLoading(false).'); // Debug log
            }
        };

        checkLoginStatus();
    }, [backendBaseUrl]);

    // Debug logs for user and loading state changes
    useEffect(() => {
        console.log('AuthContext: User state changed to:', user);
    }, [user]);

    useEffect(() => {
        console.log('AuthContext: Loading state changed to:', loading);
    }, [loading]);


    // Login function
    const login = async (username: string, password: string) => {
        console.log('AuthContext: Attempting login for:', username); // Debug log
        try {
            const response = await fetch(`${backendBaseUrl}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                credentials: 'include',
                body: JSON.stringify({ username, password }),
            });

            const data = await response.json();
            console.log('AuthContext: Login response data:', data); // Debug log

            if (response.ok) {
                if (data.username && data.tier) {
                    setUser({ username: data.username, tier: data.tier });
                    console.log('AuthContext: Login successful for:', data.username); // Debug log
                    return { success: true, message: data.message };
                } else {
                    console.error('AuthContext: Login success response missing username or tier');
                    return { success: false, error: 'Unexpected response from server.' };
                }

            } else {
                console.error('AuthContext: Login failed:', data.error); // Debug log
                return { success: false, error: data.error || 'Login failed' };
            }
        } catch (error) {
            console.error('AuthContext: Error during login:', error); // Debug log
            return { success: false, error: 'Network error during login.' };
        }
    };

    // Signup function
    const signup = async (username: string, email: string, password: string) => {
        console.log('AuthContext: Attempting signup for:', username); // Debug log
        try {
            const response = await fetch(`${backendBaseUrl}/signup`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, email, password }),
            });

            const data = await response.json();
            console.log('AuthContext: Signup response data:', data); // Debug log

            if (response.ok) {
                console.log('AuthContext: Signup successful for:', username); // Debug log
                return { success: true, message: data.message };
            } else {
                console.error('AuthContext: Signup failed:', data.error); // Debug log
                return { success: false, error: data.error || 'Signup failed' };
            }
        } catch (error) {
            console.error('AuthContext: Error during signup:', error); // Debug log
            return { success: false, error: 'Network error during signup.' };
        }
    };

    // Logout function
    const logout = async () => {
        console.log('AuthContext: Attempting logout.'); // Debug log
        try {
            const response = await fetch(`${backendBaseUrl}/logout`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
            });

            if (response.ok) {
                setUser(null);
                console.log('AuthContext: Logout successful.'); // Debug log
                return { success: true, message: 'Logout successful' };
            } else {
                console.error('AuthContext: Logout failed:', response.status); // Debug log
                return { success: false, error: 'Logout failed' };
            }
        } catch (error) {
            console.error('AuthContext: Error during logout:', error); // Debug log
            return { success: false, error: 'Network error during logout.' };
        }
    };


    return (
        <AuthContext.Provider value={{ user, loading, login, signup, logout }}>
            {children}
        </AuthContext.Provider>
    );
};


// --- Login Form Component ---
interface LoginFormProps {
    switchToSignup?: () => void; // Optional function prop
}

const LoginForm: React.FC<LoginFormProps> = ({ switchToSignup }) => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const { login } = useAuth();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        setMessage('');
        console.log('LoginForm: Submitting login form.'); // Debug log
        const result = await login(username, password);
        if (!result.success) {
            setError(result.error || 'Login failed');
        } else {
            setMessage(result.message || 'Login successful');
            // App component handles navigation on success
        }
    };

    return (
        <Card className="w-[350px]">
            <CardHeader>
                <CardTitle>Login</CardTitle>
                <CardDescription>Log in to your Tiny Tutor account.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit}>
                    <div className="grid w-full items-center gap-4">
                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="username">Username</Label>
                            <Input
                                id="username"
                                placeholder="Enter your username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>
                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                placeholder="Enter your password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                            />
                        </div>
                        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                        {message && <p className="text-green-500 text-sm text-center">{message}</p>}
                        <Button type="submit" className="w-full">Login</Button>
                        {/* Button to switch to signup form */}
                        {switchToSignup && (
                            <Button type="button" variant="link" onClick={switchToSignup} className="mt-4 w-full text-center">
                                Don't have an account? Sign Up.
                            </Button>
                        )}
                    </div>
                </form>
            </CardContent>
        </Card>
    );
};

// --- Signup Form Component ---
interface SignupFormProps {
    switchToLogin?: () => void; // Optional function prop
}

const SignupForm: React.FC<SignupFormProps> = ({ switchToLogin }) => {
    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const { signup } = useAuth();

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setError('');
        setMessage('');
        console.log('SignupForm: Submitting signup form.'); // Debug log
        const result = await signup(username, email, password);
        if (!result.success) {
            setError(result.error || 'Signup failed');
        } else {
            setMessage(result.message || 'Signup successful' + " You can now log in.");
            setUsername('');
            setEmail('');
            setPassword('');
            if (switchToLogin) switchToLogin();
        }
    };

    return (
        <Card className="w-[350px]">
            <CardHeader>
                <CardTitle>Sign Up</CardTitle>
                <CardDescription>Create a new Tiny Tutor account.</CardDescription>
            </CardHeader>
            <CardContent>
                <form onSubmit={handleSubmit}>
                    <div className="grid w-full items-center gap-4">
                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="signup-username">Username</Label>
                            <Input
                                id="signup-username"
                                placeholder="Choose a username"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                required
                            />
                        </div>
                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="signup-email">Email</Label>
                            <Input
                                id="signup-email"
                                type="email"
                                placeholder="Enter your email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>
                        <div className="flex flex-col space-y-1.5">
                            <Label htmlFor="signup-password">Password</Label>
                            <Input
                                id="signup-password"
                                type="password"
                                placeholder="Choose a password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                required
                                minLength={6}
                            />
                        </div>
                        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
                        {message && <p className="text-green-500 text-sm text-center">{message}</p>}
                        <Button type="submit" className="w-full">Sign Up</Button>
                        {/* Button to switch to login form */}
                        {switchToLogin && (
                            <Button type="button" variant="link" onClick={switchToLogin} className="mt-2 w-full text-center">
                                Already have an account? Login.
                            </Button>
                        )}
                    </div>
                </form>
            </CardContent>
        </Card>
    );
};


// --- Main Tiny Tutor App Content Component ---
const TinyTutorAppContent: React.FC = () => {
    const { user, logout } = useAuth();
    console.log('TinyTutorAppContent: Rendering for user:', user?.username);

    return (
        <Card className="w-[600px] text-center">
            <CardHeader>
                <CardTitle>Welcome, {user?.username}!</CardTitle>
                <CardDescription>Your tier: {user?.tier}</CardDescription>
            </CardHeader>
            <CardContent>
                <p>This is where the Tiny Tutor app content will go (input, button, explanation, etc.).</p>
                <Button onClick={logout} className="mt-4">Logout</Button>
            </CardContent>
        </Card>
    );
};


// --- Root App Component ---
const App: React.FC = () => {
    const { user, loading } = useAuth();
    const [showLogin, setShowLogin] = useState(true);

    console.log('App: Rendering. Loading:', loading, 'User:', user);

    if (loading) {
        console.log('App: Showing loading message.');
        return <div className="flex justify-center items-center min-h-screen">Loading...</div>;
    }

    return (
        <div className="flex justify-center items-center min-h-screen bg-gray-100 p-4">
            {user ? (
                <>
                    {console.log('App: User is logged in, showing TinyTutorAppContent.')}
                    <TinyTutorAppContent />
                </>
            ) : (
                <>
                    {console.log('App: User is NOT logged in, showing authentication forms.')}
                    <div className="flex flex-col items-center">
                        {showLogin ? (
                            <LoginForm switchToSignup={() => setShowLogin(false)} />
                        ) : (
                            <SignupForm switchToLogin={() => setShowLogin(true)} />
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

// Export the App component wrapped in AuthProvider
const RootApp: React.FC = () => (
    <AuthProvider>
        <App />
    </AuthProvider>
);

export default RootApp;

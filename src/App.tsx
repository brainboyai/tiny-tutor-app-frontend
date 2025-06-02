import React, { useState, useEffect, useCallback, FormEvent, useRef } from 'react';
import {
  BookOpen,
  Heart,
  ImageIcon,
  Lightbulb,
  LogIn,
  LogOut,
  RefreshCw,
  Sparkles,
  User,
  X,
  MessageSquareQuote,
  Brain,
  RotateCcw,
  Home
} from 'lucide-react';
import './App.css'; 
import './index.css'; 
import ProfilePageComponent from './ProfilePage'; 

// --- Types ---
interface CurrentUser {
  username: string;
  email: string;
  id: string;
}

interface ParsedQuizQuestion {
  question: string;
  options: { [key: string]: string }; 
  correctOptionKey: string; 
  explanation?: string; 
  originalString?: string; 
}

interface GeneratedContentItem {
  explanation?: string;
  quiz?: ParsedQuizQuestion[]; 
  fact?: string;
  image_prompt?: string; 
  image_url?: string;    
  deep_dive?: string;
  is_favorite?: boolean;
  first_explored_at?: string;
  last_explored_at?: string;
  quiz_progress?: QuizAttempt[];
  modes_generated?: string[];
}

interface GeneratedContent {
  [wordId: string]: GeneratedContentItem;
}

interface QuizAttempt {
  question_index: number;
  selected_option_key: string;
  is_correct: boolean;
  timestamp: string;
}

interface LiveStreak {
  score: number;
  words: string[]; 
}

interface StreakRecord {
  id: string; 
  words: string[];
  score: number;
  completed_at: string; 
}

interface UserProfileData {
  username: string;
  email: string;
  totalWordsExplored: number;
  exploredWords: { word: string; last_explored_at: string; is_favorite: boolean; first_explored_at?: string }[];
  favoriteWords: { word: string; last_explored_at: string; is_favorite: boolean; first_explored_at?: string }[];
  streakHistory: StreakRecord[];
}

type ContentMode = 'explain' | 'quiz' | 'fact' | 'image' | 'deep_dive';

const API_BASE_URL = 'https://tiny-tutor-app.onrender.com'; 

const sanitizeWordForId = (word: string): string => {
  if (typeof word !== 'string') return "invalid_word_input"; 
  return word.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
};

const parseQuizStringToArray = (quizStringsFromBackend: any): ParsedQuizQuestion[] => {
    if (!Array.isArray(quizStringsFromBackend)) {
        console.error("Quiz data from backend is not an array:", quizStringsFromBackend);
        return [];
    }

    return quizStringsFromBackend.map((quizStr: string, index: number) => {
        if (typeof quizStr !== 'string') {
            console.error(`Quiz item at index ${index} is not a string:`, quizStr);
            return null; 
        }
        
        const lines = quizStr.trim().split('\n').map(line => line.trim()).filter(line => line);
        if (lines.length < 3) { 
            console.warn(`Quiz string for item ${index} has too few lines:`, lines.length, "Content:", quizStr);
            return null;
        }

        let question = "";
        const options: { [key: string]: string } = {};
        let correctOptionKey = "";
        let explanation = "";
        let parsingState: 'question' | 'options' | 'answer' | 'explanation' = 'question';

        for (const line of lines) {
            if (line.match(/^\*\*Question \d*:\*\*/i)) {
                question = line.replace(/^\*\*Question \d*:\*\*\s*/i, '').trim();
                parsingState = 'options';
                continue;
            }
            if (parsingState === 'question' && !question) { 
                question = line;
                parsingState = 'options';
                continue;
            }

            const optionMatch = line.match(/^([A-D])\)\s*(.*)/i);
            if (optionMatch) {
                options[optionMatch[1].toUpperCase()] = optionMatch[2].trim();
                parsingState = 'options'; 
                continue;
            }

            const correctMatch = line.match(/^Correct Answer:\s*([A-D])/i);
            if (correctMatch) {
                correctOptionKey = correctMatch[1].toUpperCase();
                parsingState = 'explanation'; 
                continue;
            }
            
            const explanationMatch = line.match(/^Explanation:\s*(.*)/i);
            if (explanationMatch) {
                explanation = explanationMatch[1].trim();
                parsingState = 'explanation';
                continue;
            }
            if (parsingState === 'question' && question) {
                question += " " + line;
            }
        }
        
        if (!question || Object.keys(options).length === 0 || !correctOptionKey || !options[correctOptionKey]) {
             console.warn(`Incomplete parse for quiz item ${index}. Q: "${question}", Opts: ${Object.keys(options).length}, CorrectKey: "${correctOptionKey}", OptionsHasKey: ${!!options[correctOptionKey]}`, "Original:", quizStr);
             return question ? { question, options: options || {}, correctOptionKey: correctOptionKey || '', originalString: quizStr } : null;
        }

        return { question, options, correctOptionKey, explanation, originalString: quizStr };
    }).filter(q => q !== null) as ParsedQuizQuestion[]; 
};


function App() {
  const [inputValue, setInputValue] = useState('');
  const [currentFocusWord, setCurrentFocusWord] = useState<string | null>(null);
  const [generatedContent, setGeneratedContent] = useState<GeneratedContent>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeContentMode, setActiveContentMode] = useState<ContentMode>('explain');

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [authUsername, setAuthUsername] = useState(''); 
  const [authEmail, setAuthEmail] = useState(''); 
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authSuccessMessage, setAuthSuccessMessage] = useState<string | null>(null);
  const modeFetchGuardRef = useRef<string | null>(null);
  
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [authToken, setAuthToken] = useState<string | null>(localStorage.getItem('authToken'));

  const [liveStreak, setLiveStreak] = useState<LiveStreak | null>(null);
  const [userProfileData, setUserProfileData] = useState<UserProfileData | null>(null);
  
  const [activeView, setActiveView] = useState<'main' | 'profile'>('main');

  const [currentQuizQuestionIndex, setCurrentQuizQuestionIndex] = useState(0);
  const [selectedQuizOption, setSelectedQuizOption] = useState<string | null>(null);
  const [quizFeedback, setQuizFeedback] = useState<{ message: string; isCorrect: boolean } | null>(null);
  const [isQuizAttempted, setIsQuizAttempted] = useState(false); 

  const [wordForReview, setWordForReview] = useState<string | null>(null);
  const [isReviewingStreakWord, setIsReviewingStreakWord] = useState(false);
  
  const [isFetchingProfile, setIsFetchingProfile] = useState(false);

  const getDisplayWord = useCallback(() => {
    return isReviewingStreakWord && wordForReview ? wordForReview : currentFocusWord;
  }, [isReviewingStreakWord, wordForReview, currentFocusWord]);


  const fetchUserProfile = useCallback(async (token: string | null) => {
    if (!token) {
      setUserProfileData(null);
      setCurrentUser(null); 
      return;
    }
    setIsFetchingProfile(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        if (response.status === 401) { 
          localStorage.removeItem('authToken');
          setAuthToken(null);
          setCurrentUser(null);
          setUserProfileData(null);
          setLiveStreak(null);
          setCurrentFocusWord(null);
          setShowAuthModal(true);
          setAuthError("Session expired. Please login again.");
        } else {
          const errData = await response.json();
          throw new Error(errData.error || `Failed to fetch profile (${response.status})`);
        }
        return;
      }
      const data = await response.json();
      console.log("Raw profile data from backend:", data); 

      // Ensure 'word' field exists and is a non-empty string
      const processedExploredWords = (data.explored_words || [])
        .map((w: any) => ({ 
            word: w.word as string, 
            last_explored_at: w.last_explored_at,
            is_favorite: w.is_favorite,
            first_explored_at: w.first_explored_at 
        }))
        .filter((w: any) => typeof w.word === 'string' && w.word.trim() !== '')
        .sort((a:any, b:any) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime());

      const processedFavoriteWords = (data.favorite_words || [])
        .map((w: any) => ({ 
            word: w.word as string, 
            last_explored_at: w.last_explored_at,
            is_favorite: w.is_favorite,
            first_explored_at: w.first_explored_at 
        }))
        .filter((w: any) => typeof w.word === 'string' && w.word.trim() !== '')
        .sort((a:any, b:any) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime());
      
      console.log("Processed Explored Words for Profile:", processedExploredWords);
      console.log("Processed Favorite Words for Profile:", processedFavoriteWords);

      setUserProfileData({
        username: data.username,
        email: data.email,
        totalWordsExplored: data.total_words_explored, 
        exploredWords: processedExploredWords,
        favoriteWords: processedFavoriteWords,
        streakHistory: (data.streak_history || []).sort((a:any, b:any) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()),
      });
      setCurrentUser({ username: data.username, email: data.email, id: data.user_id });
    } catch (err: any) {
      setError(err.message);
      console.error("Error fetching profile:", err);
    } finally {
      setIsFetchingProfile(false);
    }
  }, []); 

  useEffect(() => {
    const storedToken = localStorage.getItem('authToken');
    if (storedToken) {
      setAuthToken(storedToken);
      if (!currentUser && !userProfileData) { 
         fetchUserProfile(storedToken);
      }
    }
  }, [fetchUserProfile, currentUser, userProfileData]); 


  const handleAuthAction = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccessMessage(null);
    setIsLoading(true);

    const url = authMode === 'signup' ? `${API_BASE_URL}/signup` : `${API_BASE_URL}/login`;
    let payload = {};

    if (authMode === 'signup') {
        payload = { username: authUsername, email: authEmail, password: authPassword };
    } else { 
        payload = { email_or_username: authUsername, password: authPassword };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || `${authMode === 'signup' ? 'Signup' : 'Login'} failed`);
      }

      if (authMode === 'signup') {
        setAuthSuccessMessage('Signup successful! Please login.');
        setAuthMode('login'); 
        setAuthEmail(''); 
        setAuthPassword(''); 
      } else { 
        localStorage.setItem('authToken', data.access_token); 
        setAuthToken(data.access_token);
        setCurrentUser({ username: data.user.username, email: data.user.email, id: data.user.id || '' }); 
        setShowAuthModal(false);
        setAuthSuccessMessage('Login successful!');
        await fetchUserProfile(data.access_token); 
        setAuthEmail(''); 
        setAuthPassword('');
        setAuthUsername(''); 
      }
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setIsLoading(false);
      if (authMode === 'signup') setAuthPassword(''); 
    }
  };

  const saveStreakToServer = useCallback(async (streakToSave: LiveStreak, token: string | null) => {
    if (!token || !streakToSave || streakToSave.score < 2) {
        return;
    }
    try {
        const response = await fetch(`${API_BASE_URL}/save_streak`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({ words: streakToSave.words, score: streakToSave.score }),
        });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save streak');
        }
    } catch (err: any) {
        console.error('Error saving streak:', err.message);
    }
  }, []);


  const handleLogout = useCallback(async () => {
    if (liveStreak && liveStreak.score >= 2 && authToken) {
        await saveStreakToServer(liveStreak, authToken);
    }
    localStorage.removeItem('authToken');
    setAuthToken(null);
    setCurrentUser(null);
    setUserProfileData(null);
    setLiveStreak(null);
    setCurrentFocusWord(null);
    setGeneratedContent({});
    setActiveContentMode('explain');
    setError(null);
    setAuthError(null);
    setAuthSuccessMessage(null);
    setShowAuthModal(false);
    setActiveView('main'); 
    console.log("User logged out");
  }, [liveStreak, authToken, saveStreakToServer]);

// ... (end of imports and other functions remain the same) ...

  const handleGenerateExplanation = useCallback(async (
    wordToFetch: string,
    isNewPrimaryWordSearch: boolean = false,
    isRefreshClick: boolean = false,
    isSubTopicClick: boolean = false,
    modeOverride?: ContentMode,
    isProfileWordClick: boolean = false
  ) => {
    // ... (initial checks for wordToFetch, authToken, setIsLoading, etc. remain the same) ...

    const wordId = sanitizeWordForId(wordToFetch);
    const modeToFetch = modeOverride || activeContentMode;

    // --- Construct streakContextForAPI (Existing logic is good) ---
    let streakContextForAPI: string[] = [];
    if (isNewPrimaryWordSearch || isProfileWordClick) {
        streakContextForAPI = [];
    } else if (isSubTopicClick) {
        if (liveStreak && liveStreak.words.length > 0) {
            streakContextForAPI = [...liveStreak.words];
        }
    } else if (isReviewingStreakWord && wordForReview) {
        if (liveStreak && liveStreak.words.includes(wordForReview)) {
            const reviewWordIndex = liveStreak.words.indexOf(wordForReview);
            if (reviewWordIndex > 0) {
                streakContextForAPI = liveStreak.words.slice(0, reviewWordIndex);
            }
        }
    } else if (currentFocusWord && !isNewPrimaryWordSearch && !isProfileWordClick && !isSubTopicClick) {
        if (liveStreak && liveStreak.words.includes(currentFocusWord)) {
             const currentFocusWordIndex = liveStreak.words.indexOf(currentFocusWord);
             if (currentFocusWordIndex > 0) {
                streakContextForAPI = liveStreak.words.slice(0, currentFocusWordIndex);
             }
        } else if (liveStreak && liveStreak.words.length === 1 && liveStreak.words[0] === currentFocusWord) {
            streakContextForAPI = [];
        }
    }
    // --- END: Construct streakContextForAPI ---

    // Logic for saving previous streak (Existing logic is good)
    if ((isNewPrimaryWordSearch || isProfileWordClick) && liveStreak && liveStreak.score >=1 && authToken) {
        if (liveStreak.score >=2) await saveStreakToServer(liveStreak, authToken);
        setLiveStreak(null); 
    }
    
    // Logic for setting focus on new primary word (Existing logic is good)
    if (isNewPrimaryWordSearch || isProfileWordClick) {
        setCurrentFocusWord(wordToFetch);
        setIsReviewingStreakWord(false); 
        setWordForReview(null);
    }

    try {
// Inside handleGenerateExplanation > try block
      // --- REFINED Frontend Cache Check Logic ---
      const wordItem = generatedContent[wordId]; // Get the item for the wordId once

      let contentActuallyAlreadyInFrontend = wordItem &&
                                 (modeToFetch === 'image' ?
                                   (wordItem.image_url || wordItem.image_prompt) :
                                   wordItem[modeToFetch as keyof GeneratedContentItem]);

      // For quiz, if 'quiz' array exists but is empty, consider content as NOT existing for fetching purposes.
      if (modeToFetch === 'quiz' && wordItem && wordItem.quiz && wordItem.quiz.length === 0) {
          contentActuallyAlreadyInFrontend = false;
      }

      const shouldFetchFromBackend = isRefreshClick ||
                                     isNewPrimaryWordSearch ||
                                     isProfileWordClick ||
                                     !contentActuallyAlreadyInFrontend; // Use the refined check

      if (!shouldFetchFromBackend) {
        // Serve from frontend cache
        if (modeToFetch === 'quiz') {
            // If we are here for quiz, contentActuallyAlreadyInFrontend was true,
            // meaning wordItem.quiz is defined and wordItem.quiz.length > 0.
            const existingQuizData = wordItem.quiz!; // Assert non-null as it passed the check
            const existingProgress = wordItem.quiz_progress || [];
            const nextQuestionIdx = existingProgress.length >= existingQuizData.length ? existingQuizData.length : existingProgress.length;
            setCurrentQuizQuestionIndex(nextQuestionIdx);
            // Reset attempt state when serving quiz from cache to ensure fresh interaction for the question
            setSelectedQuizOption(null);
            setQuizFeedback(null);
            setIsQuizAttempted(false);
        }
        
        if (!isSubTopicClick && !isProfileWordClick && !isNewPrimaryWordSearch && !isReviewingStreakWord) {
            setCurrentFocusWord(wordToFetch);
        }
        setActiveContentMode(modeToFetch); // Ensure mode is set if HGE was called with override
        setIsLoading(false);
        console.log(`Serving '${modeToFetch}' for '${wordToFetch}' from frontend cache (session).`);
        return;
      }
      // --- END: REFINED Frontend Cache Check Logic ---

      // If we reach here, we are fetching from the backend.
      // The 'refresh_cache' sent to backend should ONLY be true if it's an explicit user refresh action.
      const backendApiForceRefresh = isRefreshClick;

      console.log(`Fetching content for "${wordToFetch}", mode "${modeToFetch}", context: [${streakContextForAPI.join(', ')}] from backend. BackendForceRefresh: ${backendApiForceRefresh}`);
      const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ 
            word: wordToFetch, 
            mode: modeToFetch, 
            refresh_cache: backendApiForceRefresh, // Use the refined flag
            streakContext: streakContextForAPI 
        }),
      });

      // ... (rest of the response handling, setGeneratedContent, setLiveStreak, etc. remains largely the same) ...
      // The setGeneratedContent logic correctly uses data[modeToFetch] for the current mode,
      // which is good. It will store the (potentially contextual) explanation fetched for this session.
      if (!response.ok) {
        let errorMessage = `Failed to generate content (${response.status})`;
        if (response.status === 429) {
            errorMessage = "Too many requests. Please try again in a little while. 🐢";
        } else {
            try {
                const errData = await response.json(); // Try to parse JSON error first
                errorMessage = errData.error || errorMessage;
            } catch (e) {
                // If response.json() fails, it means the error response wasn't JSON
                const textError = await response.text(); // Get the response as text
                console.error("Non-JSON error response from server:", textError);
                // You might not want to show the full HTML textError to the user.
                // So, stick with a generic message or a specific one for common statuses.
            }
        }
        if (response.status === 401) { // Specific handling for 401
            handleLogout(); 
            setShowAuthModal(true);
            setAuthError("Session expired. Please login again.");
            // Don't throw here, as handleLogout will redirect or show modal
            // but set an error for the user to see briefly if needed.
            setError("Your session has expired. Please log in.");
            return; // Exit after handling 401
        }
        throw new Error(errorMessage);
      }

      const data = await response.json(); 
      console.log("Data received from backend:", data);
      
// Inside the try...catch block of handleGenerateExplanation, after `const data = await response.json();`
      setGeneratedContent(prev => {
        const wordIdToUpdate = sanitizeWordForId(data.word); 
        const existingWordData = prev[wordIdToUpdate] || {};
        
        const newWordData: GeneratedContentItem = { 
            ...existingWordData,
            is_favorite: data.is_favorite !== undefined ? data.is_favorite : (existingWordData.is_favorite || false),
            last_explored_at: data.last_explored_at || new Date().toISOString(),
            first_explored_at: existingWordData.first_explored_at || data.first_explored_at || new Date().toISOString(),
        };

        if (modeToFetch === 'explain' && data.explain !== undefined) {
            newWordData.explanation = data.explain;
        }
        if (modeToFetch === 'fact' && data.fact !== undefined) {
            newWordData.fact = data.fact;
        }
        if (modeToFetch === 'deep_dive' && data.deep_dive !== undefined) {
            newWordData.deep_dive = data.deep_dive;
        }
        if (modeToFetch === 'image') {
            if (data.image_url !== undefined) {
                newWordData.image_url = data.image_url;
                newWordData.image_prompt = data.image_prompt !== undefined ? data.image_prompt : existingWordData.image_prompt;
            } else if (data.image !== undefined) { 
                newWordData.image_prompt = data.image;
                newWordData.image_url = undefined; 
            }
        }
        if (modeToFetch === 'quiz' && data.quiz !== undefined) {
            const quizStrings = data.quiz; 
            if (quizStrings && Array.isArray(quizStrings)) {
                newWordData.quiz = parseQuizStringToArray(quizStrings);
                let resolvedQuizProgress: QuizAttempt[] = existingWordData.quiz_progress || [];
                if (data.quiz_progress && Array.isArray(data.quiz_progress)) {
                    const backendQuizProgressIsValid = data.quiz_progress.every((item: any) =>
                        typeof item.question_index === 'number' &&
                        typeof item.selected_option_key === 'string' &&
                        typeof item.is_correct === 'boolean' &&
                        typeof item.timestamp === 'string'
                    );
                    if (backendQuizProgressIsValid) {
                        resolvedQuizProgress = data.quiz_progress as QuizAttempt[];
                    }
                }
                newWordData.quiz_progress = (isRefreshClick || (data.quiz && !data.quiz_progress?.length && !resolvedQuizProgress.length)) 
                                            ? [] 
                                            : resolvedQuizProgress;
                setCurrentQuizQuestionIndex(0); 
            } else { 
                newWordData.quiz = existingWordData.quiz || []; 
                newWordData.quiz_progress = existingWordData.quiz_progress || [];
            }
        }

        let combinedModes: string[] = [];
        if (existingWordData.modes_generated && Array.isArray(existingWordData.modes_generated)) {
            combinedModes = [...existingWordData.modes_generated];
        }
        if (data.modes_generated && Array.isArray(data.modes_generated)) {
            const backendModes = data.modes_generated.filter((m: any): m is string => typeof m === 'string');
            combinedModes = Array.from(new Set([...combinedModes, ...backendModes]));
        }
        const modesSet = new Set<string>(combinedModes);
        modesSet.add(modeToFetch);
        newWordData.modes_generated = Array.from(modesSet);
        
        console.log("Processed newWordData for", wordIdToUpdate, ":", newWordData);
        return { ...prev, [wordIdToUpdate]: newWordData };
      });

      if (isNewPrimaryWordSearch || isProfileWordClick) {
        setCurrentFocusWord(wordToFetch); 
        setLiveStreak({ score: 1, words: [wordToFetch] });
        setIsReviewingStreakWord(false);
        setWordForReview(null);
      } else if (isSubTopicClick) {
        setCurrentFocusWord(wordToFetch); 
        setIsReviewingStreakWord(false); 
        setWordForReview(null);
        
        setLiveStreak(prevStreak => {
            if (!prevStreak) return { score: 1, words: [wordToFetch] }; 
            if (prevStreak.words.length === 0 || prevStreak.words[prevStreak.words.length -1] !== wordToFetch) {
                 return {
                    score: prevStreak.score + 1,
                    words: [...prevStreak.words, wordToFetch],
                };
            }
            return prevStreak; 
        });
      }
      setActiveContentMode(modeToFetch);

    } catch (err: any) {
      // ... (error handling) ...
      setError(err.message);
      console.error("Error generating content:", err);
    } finally {
      // ... (finally block) ...
      setIsLoading(false);
      if (isNewPrimaryWordSearch) setInputValue(''); 
    }
  }, [authToken, activeContentMode, liveStreak, saveStreakToServer, handleLogout, currentFocusWord, isReviewingStreakWord, wordForReview]);
  // Make sure all dependencies for useCallback are listed if they are used inside.
  
// Place this useEffect AFTER getDisplayWord and handleGenerateExplanation are defined

// The useEffect hook that should be using modeFetchGuardRef:

useEffect(() => {
    const wordToUse = getDisplayWord();
    const currentMode = activeContentMode;

    if (!wordToUse) {
        modeFetchGuardRef.current = null; 
        return;
    }

    const wordId = sanitizeWordForId(wordToUse);
    const currentFetchKey = `${wordId}-${currentMode}`;

    const contentItem = generatedContent[wordId];
    let contentForModeExists = contentItem &&
                             (currentMode === 'image' ?
                               (contentItem.image_url || contentItem.image_prompt) :
                               contentItem[currentMode as keyof GeneratedContentItem]);
    if (currentMode === 'quiz' && contentItem?.quiz && contentItem.quiz.length === 0) {
        contentForModeExists = false;
    }

    console.log(`[EFFECT] Check for: ${currentFetchKey}. ContentExists: ${!!contentForModeExists}, IsLoading: ${isLoading}, Guard: ${modeFetchGuardRef.current}`);

    if (!contentForModeExists && !isLoading) {
        if (modeFetchGuardRef.current === currentFetchKey) {
            console.log(`[EFFECT] Guarded: Fetch for ${currentFetchKey} likely already initiated by this effect. Waiting for state.`);
            return; 
        }
        console.log(`[EFFECT] ---> Triggering fetch for ${currentFetchKey}. Setting guard.`);
        modeFetchGuardRef.current = currentFetchKey; 
        handleGenerateExplanation(
            wordToUse, false, false, false, currentMode, false
        );
        // Return after initiating fetch to prevent quiz setup logic from running with stale data
        return; 
    } else if (contentForModeExists) {
        if (modeFetchGuardRef.current === currentFetchKey) {
            console.log(`[EFFECT] Content for ${currentFetchKey} now exists. Clearing guard.`);
            modeFetchGuardRef.current = null;
        }
        // Quiz UI setup logic when mode is quiz and content exists
        if (currentMode === 'quiz' && contentItem?.quiz && contentItem.quiz.length > 0) {
            const progress = contentItem.quiz_progress || [];
            const quizSetLength = contentItem.quiz.length;
            let nextQuestionIdx = 0; 
            if (currentQuizQuestionIndex < quizSetLength && currentQuizQuestionIndex < progress.length) {
                nextQuestionIdx = currentQuizQuestionIndex;
            } else if (progress.length < quizSetLength) {
                nextQuestionIdx = progress.length;
            }
            if(currentQuizQuestionIndex >= quizSetLength && quizSetLength > 0) nextQuestionIdx = 0;

            if (currentQuizQuestionIndex !== nextQuestionIdx) {
                // setCurrentQuizQuestionIndex(nextQuestionIdx); // Let dedicated quiz UI effect handle this
            }
            setSelectedQuizOption(null); 
            setQuizFeedback(null);
            setIsQuizAttempted(false);
        }
    } else if (isLoading) {
        console.log(`[EFFECT] Currently isLoading for another request. Not fetching for ${currentFetchKey}.`);
    }

}, [activeContentMode, getDisplayWord, generatedContent, isLoading, handleGenerateExplanation, currentQuizQuestionIndex]);
// ... (rest of the App component: handleModeChange, handleRefreshContent, etc.) ...

// App.tsx
  const handleModeChange = (newMode: ContentMode) => {
    setActiveContentMode(newMode);

    // Reset specific UI states for quiz if not changing to quiz,
    // or if changing to quiz (the quiz UI useEffect will further refine if data already exists)
    if (newMode !== 'quiz') {
        setSelectedQuizOption(null);
        setQuizFeedback(null);
        setIsQuizAttempted(false); 
    } else {
        // When switching TO quiz, also reset these.
        setSelectedQuizOption(null);
        setQuizFeedback(null);
        setIsQuizAttempted(false);
    }
  };

  const handleRefreshContent = () => {
    const wordToUse = getDisplayWord();
    if (!wordToUse) return;
    handleGenerateExplanation(wordToUse, false, true, false, activeContentMode);
  };

  const handleToggleFavorite = useCallback(async (word: string, currentStatus: boolean) => {
    if (!authToken || !word) return;
    const wordId = sanitizeWordForId(word);

    setGeneratedContent(prev => ({
      ...prev,
      [wordId]: {
        ...(prev[wordId] || {}),
        is_favorite: !currentStatus,
      }
    }));
    if (userProfileData) {
        const newExploredWords = userProfileData.exploredWords.map(w => 
            w.word === word ? { ...w, is_favorite: !currentStatus } : w
        );
        const newFavoriteWords = !currentStatus 
            ? [...userProfileData.favoriteWords, { word, last_explored_at: new Date().toISOString(), is_favorite: true, first_explored_at: generatedContent[wordId]?.first_explored_at || new Date().toISOString() }]
            : userProfileData.favoriteWords.filter(w => w.word !== word);

        setUserProfileData(prev => prev ? ({
            ...prev,
            exploredWords: newExploredWords,
            favoriteWords: newFavoriteWords.sort((a,b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime()),
        }) : null);
    }

    try {
      const response = await fetch(`${API_BASE_URL}/toggle_favorite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ word }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || 'Failed to toggle favorite');
      }
      const data = await response.json();
      setGeneratedContent(prev => ({
        ...prev,
        [wordId]: {
          ...(prev[wordId] || {}),
          is_favorite: data.is_favorite,
        }
      }));
      if (activeView === 'profile' || userProfileData) {
          await fetchUserProfile(authToken);
      }

    } catch (err: any) {
      setError(err.message);
      setGeneratedContent(prev => ({
        ...prev,
        [wordId]: {
          ...(prev[wordId] || {}),
          is_favorite: currentStatus, 
        }
      }));
      if (userProfileData) { 
        const revertedExploredWords = userProfileData.exploredWords.map(w => 
            w.word === word ? { ...w, is_favorite: currentStatus } : w
        );
        const revertedFavoriteWords = currentStatus 
            ? [...userProfileData.favoriteWords, { word, last_explored_at: new Date().toISOString(), is_favorite: true, first_explored_at: generatedContent[wordId]?.first_explored_at || new Date().toISOString() }]
            : userProfileData.favoriteWords.filter(w => w.word !== word);
        setUserProfileData(prev => prev ? ({
            ...prev,
            exploredWords: revertedExploredWords,
            favoriteWords: revertedFavoriteWords.sort((a,b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime()),
        }) : null);
      }
    }
  }, [authToken, fetchUserProfile, activeView, userProfileData, generatedContent]);


  const handleSubTopicClick = (subTopic: string) => {
    if (!currentFocusWord) return; 
    setIsReviewingStreakWord(false);
    setWordForReview(null);
    handleGenerateExplanation(subTopic, false, false, true, 'explain');
  };

  const handleStreakWordClick = (clickedWord: string) => {
    if (getDisplayWord() === clickedWord) return; 

    setIsReviewingStreakWord(true);
    setWordForReview(clickedWord);
    setActiveContentMode('explain'); 
    setSelectedQuizOption(null);
    setQuizFeedback(null);
    setIsQuizAttempted(false);

    const wordId = sanitizeWordForId(clickedWord);
    if (!generatedContent[wordId] || !generatedContent[wordId].explanation) {
        handleGenerateExplanation(clickedWord, false, false, false, 'explain');
    }
    if (activeContentMode === 'quiz') {
        setCurrentQuizQuestionIndex(0);
    }
  };
  
  const handleWordSelectionFromProfile = (word: string) => {
    setActiveView('main'); 
    setInputValue(word); 
    handleGenerateExplanation(word, false, false, false, 'explain', true);
  };

// App.tsx

 // App.tsx
// Place AFTER handleGenerateExplanation and getDisplayWord are defined

 // App.tsx
// (Ensure this is the version of the quiz useEffect you are using)
// App.tsx - Quiz UI useEffect
  useEffect(() => {
    const wordToUse = getDisplayWord();
    if (activeContentMode === 'quiz' && wordToUse) {
        const wordId = sanitizeWordForId(wordToUse);
        const currentWordContent = generatedContent[wordId];
        const quizSet = currentWordContent?.quiz; 
        const progress = currentWordContent?.quiz_progress || [];

        if (quizSet && quizSet.length > 0) {
            if (currentQuizQuestionIndex < quizSet.length) { 
                const currentQuestion = quizSet[currentQuizQuestionIndex];
                const attemptedQuestion = progress.find(p => p.question_index === currentQuizQuestionIndex);
                if (attemptedQuestion && currentQuestion?.options && currentQuestion.options[currentQuestion.correctOptionKey] !== undefined) { 
                    setSelectedQuizOption(attemptedQuestion.selected_option_key);
                    setQuizFeedback({ 
                        message: attemptedQuestion.is_correct ? "Correct!" : `Incorrect. The correct answer was: ${currentQuestion.options[currentQuestion.correctOptionKey]}`,
                        isCorrect: attemptedQuestion.is_correct,
                    });
                    setIsQuizAttempted(true);
                } else if (currentQuestion) { 
                    setSelectedQuizOption(null);
                    setQuizFeedback(null);
                    setIsQuizAttempted(false);
                }
            }
        }
    }
    // Reset quiz UI state if not in quiz mode or no word is active
    if (activeContentMode !== 'quiz' || !wordToUse) {
        setSelectedQuizOption(null);
        setQuizFeedback(null);
        setIsQuizAttempted(false);
        // setCurrentQuizQuestionIndex(0); // Generally, don't reset index just because mode changed away.
    }
  }, [activeContentMode, getDisplayWord, generatedContent, currentQuizQuestionIndex]);
  const handleSaveQuizAttempt = useCallback(async (word: string, questionIdx: number, optionKey: string, isCorrect: boolean) => {
    if (!authToken) return;
    const wordId = sanitizeWordForId(word);
    try {
        const response = await fetch(`${API_BASE_URL}/save_quiz_attempt`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${authToken}`,
            },
            body: JSON.stringify({
                word: word,
                question_index: questionIdx,
                selected_option_key: optionKey,
                is_correct: isCorrect,
            }),
        });
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.error || 'Failed to save quiz attempt');
        }
        const data = await response.json();
        setGeneratedContent(prev => ({
            ...prev,
            [wordId]: {
                ...(prev[wordId] || {}),
                quiz_progress: data.quiz_progress,
            }
        }));
    } catch (err: any) {
        console.error("Error saving quiz attempt:", err);
        setError("Could not save your quiz progress. Please try again.");
    }
  }, [authToken]);

  const handleQuizOptionSelect = (optionKey: string) => {
    const wordToUse = getDisplayWord();
    if (!wordToUse) return;

    const wordId = sanitizeWordForId(wordToUse);
    const quizSet = generatedContent[wordId]?.quiz; 
    if (!quizSet || currentQuizQuestionIndex >= quizSet.length) return; 

    const progress = generatedContent[wordId]?.quiz_progress || [];
    const alreadyAnsweredInDb = progress.find(p => p.question_index === currentQuizQuestionIndex);
    if (alreadyAnsweredInDb || isQuizAttempted) return; 

    const currentQuestion = quizSet[currentQuizQuestionIndex];
    if (!currentQuestion || typeof currentQuestion.options !== 'object' || currentQuestion.options === null) { 
        console.error("Current quiz question or its options are invalid:", currentQuestion);
        setError("Error displaying quiz question options.");
        return;
    }
    const isCorrect = currentQuestion.correctOptionKey === optionKey;

    setSelectedQuizOption(optionKey);
    setQuizFeedback({
        message: isCorrect ? "Correct!" : `Incorrect. The correct answer was: ${currentQuestion.options[currentQuestion.correctOptionKey]}`,
        isCorrect: isCorrect,
    });
    setIsQuizAttempted(true); 

    handleSaveQuizAttempt(wordToUse, currentQuizQuestionIndex, optionKey, isCorrect);
  };

  const handleNextQuestion = () => {
    const wordToUse = getDisplayWord();
    if (!wordToUse) return;
    const wordId = sanitizeWordForId(wordToUse);
    const quizSet = generatedContent[wordId]?.quiz;

    if (quizSet) {
        setCurrentQuizQuestionIndex(prevIdx => prevIdx + 1);
        setSelectedQuizOption(null);
        setQuizFeedback(null);
        setIsQuizAttempted(false);
    }
  };
  
  const handleFetchNewQuizSet = () => {
    const wordToUse = getDisplayWord();
    if (!wordToUse) return;
    handleGenerateExplanation(wordToUse, false, true, false, 'quiz');
  };


  // Render Functions
  const renderAuthModal = () => {
    if (!showAuthModal) return null;

    return (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-md relative">
          <button onClick={() => { setShowAuthModal(false); setAuthError(null); setAuthSuccessMessage(null);}} className="absolute top-4 right-4 text-slate-400 hover:text-slate-200">
            <X size={24} />
          </button>
          <h2 className="text-3xl font-bold text-center text-sky-400 mb-6">{authMode === 'login' ? 'Login' : 'Sign Up'}</h2>
          {authError && <p className="bg-red-500/20 text-red-400 p-3 rounded-md mb-4 text-sm">{authError}</p>}
          {authSuccessMessage && <p className="bg-green-500/20 text-green-400 p-3 rounded-md mb-4 text-sm">{authSuccessMessage}</p>}
          <form onSubmit={handleAuthAction}>
            {authMode === 'signup' && (
              <div className="mb-4">
                <label className="block text-slate-300 mb-1" htmlFor="signup-username">Username</label>
                <input
                  type="text"
                  id="signup-username"
                  value={authUsername}
                  onChange={(e) => setAuthUsername(e.target.value)}
                  className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                  required
                />
              </div>
            )}
            {authMode === 'signup' && (
                 <div className="mb-4">
                    <label className="block text-slate-300 mb-1" htmlFor="signup-email">Email</label>
                    <input
                    type="email"
                    id="signup-email"
                    value={authEmail}
                    onChange={(e) => setAuthEmail(e.target.value)}
                    className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                    required
                    />
                </div>
            )}
            {authMode === 'login' && (
                 <div className="mb-4">
                    <label className="block text-slate-300 mb-1" htmlFor="login-identifier">Username or Email</label>
                    <input
                    type="text" 
                    id="login-identifier"
                    value={authUsername} 
                    onChange={(e) => setAuthUsername(e.target.value)}
                    className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                    required
                    />
                </div>
            )}
            <div className="mb-6">
              <label className="block text-slate-300 mb-1" htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none"
                required
              />
            </div>
            <button type="submit" disabled={isLoading} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold p-3 rounded-lg transition-colors disabled:opacity-50">
              {isLoading ? 'Processing...' : (authMode === 'login' ? 'Login' : 'Sign Up')}
            </button>
          </form>
          <p className="text-center text-slate-400 mt-6 text-sm">
            {authMode === 'login' ? (
              <>
                Need an account? <button onClick={() => {setAuthMode('signup'); setAuthError(null); setAuthSuccessMessage(null); setAuthUsername(''); setAuthEmail(''); setAuthPassword('');}} className="text-sky-400 hover:underline">Sign Up</button>
              </>
            ) : (
              <>
                Already have an account? <button onClick={() => {setAuthMode('login'); setAuthError(null); setAuthSuccessMessage(null); setAuthUsername(''); setAuthEmail(''); setAuthPassword('');}} className="text-sky-400 hover:underline">Login</button>
              </>
            )}
          </p>
        </div>
      </div>
    );
  };

  const renderContent = () => {
    const wordToUse = getDisplayWord();
    if (isLoading && !wordToUse) return <div className="text-center p-10 text-slate-400">Loading...</div>; 
    if (!wordToUse) return <div className="text-center p-10 text-slate-400 text-lg">Enter a word or concept above to begin your learning journey!</div>;

    const wordId = sanitizeWordForId(wordToUse);
    const content = generatedContent[wordId];

    const hasContentForMode = content && 
                            (activeContentMode === 'image' ? 
                              (content.image_url || content.image_prompt) : 
                              content[activeContentMode as keyof GeneratedContentItem]); 

    if (isLoading && !hasContentForMode) {
        return <div className="text-center p-10 text-slate-400">Generating {activeContentMode} for "{wordToUse}"...</div>;
    }
    if (error && !hasContentForMode) return <div className="text-center p-10 text-red-400">Error: {error}</div>;
    if (!content) return <div className="text-center p-10 text-slate-400">No content generated for "{wordToUse}" yet. Try generating an explanation.</div>;
    
    const currentIsFavorite = content.is_favorite || false;

    const renderClickableText = (text: string | undefined) => {
        if (!text) return null;
        const parts = text.split(/(<click>.*?<\/click>)/g);
        return parts.map((part, index) => {
            const clickMatch = part.match(/<click>(.*?)<\/click>/);
            if (clickMatch && clickMatch[1]) {
                const subTopic = clickMatch[1];
                return (
                    <button
                        key={`${subTopic}-${index}`} 
                        onClick={() => handleSubTopicClick(subTopic)}
                        className="text-sky-400 hover:text-sky-300 underline font-semibold transition-colors mx-1"
                        title={`Explore: ${subTopic}`}
                    >
                        {subTopic}
                    </button>
                );
            }
            return <span key={`text-${index}`} dangerouslySetInnerHTML={{ __html: part.replace(/\n/g, '<br />') }} />;
        });
    };


    let modeContentElement = null;
    switch (activeContentMode) {
      case 'explain':
        modeContentElement = content.explanation ? (
            <div className="prose prose-invert prose-sm sm:prose-base max-w-none text-slate-200 leading-relaxed">
                {renderClickableText(content.explanation)}
            </div>
        ) : <p className="text-slate-400">No explanation available. Try generating one.</p>;
        break;
      case 'quiz':
        const quizSet = content.quiz; 
        const progress = content.quiz_progress || [];

        if (!quizSet || quizSet.length === 0) {
            modeContentElement = <p className="text-slate-400">No quiz available for "{wordToUse}". Try generating one or refreshing.</p>;
            break;
        }
        if (currentQuizQuestionIndex >= quizSet.length) { 
            const score = progress.filter(p => p.is_correct).length;
            modeContentElement = (
                <div className="text-slate-200">
                    <h3 className="text-xl font-semibold mb-4 text-sky-300">Quiz Summary for "{wordToUse}"</h3>
                    <p className="text-lg mb-4">Your Score: <span className="font-bold text-emerald-400">{score}</span> / {quizSet.length}</p>
                    <ul className="space-y-3 mb-6 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                        {quizSet.map((parsedQ, idx) => { 
                            if (!parsedQ) return <li key={`error-${idx}`} className="text-red-400">Error displaying question {idx + 1}.</li>;
                            const attempt = progress.find(p => p.question_index === idx);
                            return (
                                <li key={idx} className={`p-3 rounded-md ${attempt ? (attempt.is_correct ? 'bg-green-500/20' : 'bg-red-500/20') : 'bg-slate-700'}`}>
                                    <p className="font-medium mb-1">Q{idx + 1}: {parsedQ.question}</p>
                                    <p className="text-xs">Your answer: {attempt && parsedQ.options && parsedQ.options[attempt.selected_option_key] ? parsedQ.options[attempt.selected_option_key] : (attempt ? 'N/A' : 'Not answered')}</p>
                                    {!attempt?.is_correct && parsedQ.options && parsedQ.options[parsedQ.correctOptionKey] && <p className="text-xs text-emerald-300">Correct: {parsedQ.options[parsedQ.correctOptionKey]}</p>}
                                </li>
                            );
                        })}
                    </ul>
                    <button
                        onClick={handleFetchNewQuizSet}
                        className="w-full sm:w-auto bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors flex items-center justify-center"
                    >
                       <RotateCcw size={18} className="mr-2" /> More Questions for "{wordToUse}"
                    </button>
                </div>
            );
        } else { 
            const currentQuestion = quizSet[currentQuizQuestionIndex]; 
            if (!currentQuestion || typeof currentQuestion.options !== 'object' || currentQuestion.options === null) {
                 modeContentElement = <p className="text-red-400">Error: Quiz question data is invalid or options are missing.</p>;
            } else {
                modeContentElement = (
                    <div className="text-slate-200">
                        <p className="text-sm text-slate-400 mb-2">Question {currentQuizQuestionIndex + 1} of {quizSet.length}</p>
                        <h3 className="text-lg font-semibold mb-4">{currentQuestion.question}</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                            {Object.entries(currentQuestion.options).map(([key, optionText]) => (
                                <button
                                    key={key}
                                    onClick={() => handleQuizOptionSelect(key)}
                                    disabled={isQuizAttempted || !!(progress.find(p => p.question_index === currentQuizQuestionIndex))}
                                    className={`p-3 rounded-lg text-left transition-all duration-200 ease-in-out
                                        ${selectedQuizOption === key 
                                            ? (quizFeedback?.isCorrect ? 'bg-green-500 hover:bg-green-600 ring-2 ring-green-400' : 'bg-red-500 hover:bg-red-600 ring-2 ring-red-400')
                                            : 'bg-slate-700 hover:bg-slate-600 focus:ring-2 focus:ring-sky-500'}
                                        ${(isQuizAttempted || !!(progress.find(p => p.question_index === currentQuizQuestionIndex))) && selectedQuizOption !== key ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}
                                    `}
                                >
                                    {optionText}
                                </button>
                            ))}
                        </div>
                        {quizFeedback && (
                            <div className={`p-3 rounded-md my-4 text-sm ${quizFeedback.isCorrect ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>
                                {quizFeedback.message}
                                {!quizFeedback.isCorrect && currentQuestion.explanation && <p className="mt-1 text-xs">{currentQuestion.explanation}</p>}
                            </div>
                        )}
                        {(isQuizAttempted || !!(progress.find(p => p.question_index === currentQuizQuestionIndex))) && (
                            <button
                                onClick={handleNextQuestion}
                                className="w-full sm:w-auto bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                            >
                                {currentQuizQuestionIndex === quizSet.length - 1 ? 'View Summary' : 'Next Question'}
                            </button>
                        )}
                    </div>
                );
            }
        }
        break;
      case 'fact':
        modeContentElement = content.fact ? <p className="text-lg text-amber-300 italic leading-relaxed">{renderClickableText(content.fact)}</p> : <p className="text-slate-400">No fun fact available.</p>;
        break;
      case 'image':
        modeContentElement = (
            <div>
                {content.image_url ? (
                    <img src={content.image_url} alt={`Generated for ${wordToUse}`} className="rounded-lg shadow-lg mx-auto max-w-full h-auto max-h-[400px] object-contain" />
                ) : content.image_prompt ? ( 
                    <p className="text-slate-400 italic">{content.image_prompt}</p>
                ) : (
                    <p className="text-slate-400">No image available. Try generating one.</p>
                )}
            </div>
        );
        break;
      case 'deep_dive':
        modeContentElement = content.deep_dive ? (
            <div className="prose prose-invert prose-sm sm:prose-base max-w-none text-slate-200 leading-relaxed">
                {renderClickableText(content.deep_dive)}
            </div>
        ) : <p className="text-slate-400">No deep dive available.</p>;
        break;
      default:
        modeContentElement = <p className="text-slate-400">Select a mode to view content.</p>;
    }

    return (
      <div className="bg-slate-700 p-4 sm:p-6 rounded-lg shadow-xl mt-1 relative">
        <div className="absolute top-3 right-3 flex items-center space-x-2">
            <button
                onClick={() => handleToggleFavorite(wordToUse, currentIsFavorite)}
                className={`p-1.5 rounded-full hover:bg-slate-600 transition-colors ${currentIsFavorite ? 'text-pink-500' : 'text-slate-400'}`}
                title={currentIsFavorite ? "Unfavorite" : "Favorite"}
            >
                <Heart size={20} fill={currentIsFavorite ? 'currentColor' : 'none'} />
            </button>
            {/* Conditionally render Refresh button only for 'explain' mode */}
            {activeContentMode === 'explain' && (
                <button 
                    onClick={handleRefreshContent}
                    className="p-1.5 rounded-full text-slate-400 hover:text-sky-300 hover:bg-slate-600 transition-colors"
                    title={`Regenerate ${activeContentMode}`}
                >
                    <RefreshCw size={18} />
                </button>
            )}
        </div>
        <h2 className="text-2xl sm:text-3xl font-bold text-sky-400 mb-4 capitalize">{wordToUse} - <span className="text-sky-500">{activeContentMode}</span></h2>
        {modeContentElement}
      </div>
    );
  };

  const modeButtons: { mode: ContentMode; label: string; icon: React.ElementType }[] = [
    { mode: 'explain', label: 'Explain', icon: MessageSquareQuote },
    { mode: 'quiz', label: 'Quiz', icon: Lightbulb },
    { mode: 'fact', label: 'Fact', icon: Sparkles },
    { mode: 'image', label: 'Image', icon: ImageIcon },
    { mode: 'deep_dive', label: 'Deep Dive', icon: Brain },
  ];


  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-slate-800 shadow-md p-3 sm:p-4 sticky top-0 z-40">
        <div className="container mx-auto flex justify-between items-center max-w-6xl">
          <div 
            className="text-2xl sm:text-3xl font-bold text-sky-400 cursor-pointer hover:text-sky-300 transition-colors"
            onClick={() => {
                setActiveView('main');
            }}
            title="Tiny Tutor Home"
          >
            Tiny Tutor AI
          </div>
          <div className="flex items-center space-x-2 sm:space-x-3">
            {currentUser ? (
              <>
                <span className="text-sm sm:text-base hidden md:inline">Hi, {currentUser.username}!</span>
                <button
                  onClick={() => {
                    if (activeView === 'profile') {
                        setActiveView('main');
                    } else {
                        if (authToken) fetchUserProfile(authToken); 
                        setActiveView('profile');
                    }
                  }}
                  className={`p-2 rounded-full hover:bg-slate-700 transition-colors ${activeView === 'profile' ? 'text-sky-400 bg-slate-700' : 'text-slate-300'}`}
                  title={activeView === 'profile' ? "Back to Explorer" : "View Profile"}
                >
                  {activeView === 'profile' ? <Home size={20} /> : <User size={20} />}
                </button>
                <button onClick={handleLogout} className="p-2 rounded-full text-slate-300 hover:bg-slate-700 hover:text-red-400 transition-colors" title="Logout">
                  <LogOut size={20} />
                </button>
              </>
            ) : (
              <button onClick={() => { setShowAuthModal(true); setAuthMode('login');}} className="p-2 rounded-full text-slate-300 hover:bg-slate-700 hover:text-sky-400 transition-colors" title="Login/Signup">
                <LogIn size={20} />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area - Conditional Rendering */}
      {activeView === 'main' && (
        <main className="container mx-auto p-3 sm:p-4 md:p-6 flex-grow max-w-3xl w-full">
            <form onSubmit={(e) => { e.preventDefault(); handleGenerateExplanation(inputValue, true, false, false, 'explain'); }} className="mb-6 flex flex-col sm:flex-row items-stretch gap-2">
                <input
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Enter a word or concept (e.g., photosynthesis)"
                className="flex-grow p-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none placeholder-slate-500"
                />
                <button 
                    type="submit" 
                    disabled={isLoading || !inputValue.trim()}
                    className="bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 px-4 sm:px-6 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50"
                >
                    <BookOpen size={20} className="mr-2 hidden sm:inline" />
                    Generate
                </button>
            </form>

            {error && !isLoading && <div className="bg-red-500/20 text-red-400 p-3 rounded-md mb-4 text-sm animate-fadeIn">{error}</div>}
            
            {liveStreak && liveStreak.score > 0 && currentFocusWord && (
                <div className="mb-4 p-3 bg-slate-800 rounded-lg shadow text-sm text-emerald-400">
                    <span className="font-semibold">Live Streak: {liveStreak.score} </span>
                    <span>
                        (
                        {liveStreak.words.map((word, index) => (
                        <React.Fragment key={word + index}>
                            <span
                                className={`cursor-pointer hover:text-emerald-300 ${getDisplayWord() === word ? 'font-bold underline' : ''}`}
                                onClick={() => handleStreakWordClick(word)}
                                title={`Review: ${word}`}
                            >
                            {word}
                            </span>
                            {index < liveStreak.words.length - 1 && ' → '}
                        </React.Fragment>
                        ))}
                        )
                    </span>
                    {isReviewingStreakWord && wordForReview && <span className="ml-2 text-xs text-slate-400">(Reviewing: {wordForReview})</span>}
                </div>
            )}

            {getDisplayWord() && (
            <div className="mb-6 flex flex-wrap justify-center gap-2 sm:gap-3">
                {modeButtons.map(({ mode, label, icon: Icon }) => (
                <button
                    key={mode}
                    onClick={() => handleModeChange(mode)}
                    disabled={isLoading && activeContentMode !== mode}
                    className={`flex items-center py-2 px-3 sm:px-4 rounded-lg text-sm font-medium transition-all duration-200 ease-in-out transform hover:scale-105
                                ${activeContentMode === mode ? 'bg-sky-500 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-sky-300'}
                                disabled:opacity-70 disabled:cursor-not-allowed`}
                    title={label}
                >
                    <Icon size={16} className="mr-1.5" /> {label}
                </button>
                ))}
            </div>
            )}

            <div className="animate-fadeIn">
              {renderContent()}
            </div>
        </main>
      )}

      {activeView === 'profile' && currentUser && userProfileData && (
        <ProfilePageComponent
            currentUser={currentUser}
            userProfileData={userProfileData}
            onWordSelect={handleWordSelectionFromProfile}
            onToggleFavorite={handleToggleFavorite}
            onNavigateBack={() => setActiveView('main')}
            generatedContent={generatedContent}
        />
      )}
      {activeView === 'profile' && (isLoading || isFetchingProfile) && !userProfileData && (
         <div className="flex-grow flex items-center justify-center text-slate-400">Loading profile...</div>
      )}
       {activeView === 'profile' && !currentUser && !isFetchingProfile && ( 
         <div className="flex-grow flex flex-col items-center justify-center text-slate-400 p-6">
            <p className="mb-4 text-lg">Please log in to view your profile.</p>
            <button 
                onClick={() => { setShowAuthModal(true); setAuthMode('login');}} 
                className="bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors"
            >
                Login
            </button>
         </div>
      )}

      {renderAuthModal()}

      <footer className="bg-slate-800 text-center p-4 text-xs text-slate-500 border-t border-slate-700 mt-auto">
        © {new Date().getFullYear()} Tiny Tutor AI. All rights reserved.
      </footer>
    </div>
  );
}

export default App;


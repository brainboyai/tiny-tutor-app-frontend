import React, { useState, useEffect, useCallback, FormEvent } from 'react';
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

interface ExploredWordEntry {
  word: string;
  last_explored_at: string;
  is_favorite: boolean;
  first_explored_at?: string;
}

interface UserProfileData {
  username: string;
  email: string;
  totalWordsExplored: number;
  exploredWords: ExploredWordEntry[];
  favoriteWords: ExploredWordEntry[];
  streakHistory: StreakRecord[];
  quiz_points?: number;
  total_quiz_questions_answered?: number;
  total_quiz_questions_correct?: number;
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
        if (lines.length < 3 && !lines.some(l => l.startsWith("**Question"))) { 
            if(lines.length > 0 && lines.some(l => l.includes("A)") || l.includes("B)"))) {
                // Attempt to salvage
            } else {
                 return null;
            }
        }

        let question = "";
        const options: { [key: string]: string } = {};
        let correctOptionKey = "";
        let explanation = "";
        let parsingState: 'question' | 'options' | 'answer' | 'explanation' = 'question';
        let questionLines: string[] = [];

        for (const line of lines) {
            const questionMatch = line.match(/^\*\*Question \d*:\*\*(.*)/i);
            if (questionMatch) {
                if (questionLines.length > 0 && !question) question = questionLines.join(" ").trim();
                questionLines = []; 
                question = questionMatch[1].trim();
                parsingState = 'options';
                continue;
            }
            
            const optionMatch = line.match(/^([A-D])\)\s*(.*)/i);
            if (optionMatch) {
                if (parsingState === 'question' && questionLines.length > 0) {
                    question = questionLines.join(" ").trim();
                    questionLines = [];
                }
                options[optionMatch[1].toUpperCase()] = optionMatch[2].trim();
                parsingState = 'options'; 
                continue;
            }

            const correctMatch = line.match(/^Correct Answer:\s*([A-D])/i);
            if (correctMatch) {
                if (parsingState === 'question' && questionLines.length > 0) {
                     question = questionLines.join(" ").trim();
                     questionLines = [];
                }
                correctOptionKey = correctMatch[1].toUpperCase();
                parsingState = 'explanation'; 
                explanation = ""; 
                continue;
            }
            
            const explanationKeywordMatch = line.match(/^Explanation:\s*(.*)/i);
            if (explanationKeywordMatch) {
                 if (parsingState === 'question' && questionLines.length > 0) {
                     question = questionLines.join(" ").trim();
                      questionLines = [];
                }
                explanation = explanationKeywordMatch[1].trim();
                parsingState = 'explanation';
                continue;
            }
            
            if (parsingState === 'question') {
                questionLines.push(line);
            } else if (parsingState === 'explanation') {
                explanation += (explanation ? " " : "") + line.trim();
            }
        }
        if (questionLines.length > 0 && !question) {
            question = questionLines.join(" ").trim();
        }
        explanation = explanation.trim();
        
        if (!question || Object.keys(options).length < 2 || !correctOptionKey || !options[correctOptionKey]) {
             console.warn(`Incomplete parse for quiz item ${index}. Q: "${question}", Opts: ${Object.keys(options).length}, CorrectKey: "${correctOptionKey}", HasKey: ${!!options[correctOptionKey]}`, "Original:", quizStr);
             return question ? { question, options: options || {}, correctOptionKey: correctOptionKey || '', explanation: explanation || undefined, originalString: quizStr } : null;
        }

        return { question, options, correctOptionKey, explanation: explanation || undefined, originalString: quizStr };
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
  const [initialLoadDone, setInitialLoadDone] = useState(false); 

  const getDisplayWord = useCallback(() => {
    return isReviewingStreakWord && wordForReview ? wordForReview : currentFocusWord;
  }, [isReviewingStreakWord, wordForReview, currentFocusWord]);

  // Forward declaration for handleLogout to be used in fetchUserProfile
  const handleLogout = useCallback(async () => { 
    // saveStreakToServer definition would be needed if used here
    // if (liveStreak && liveStreak.score >= 2 && authToken) {
    //     await saveStreakToServer(liveStreak, authToken); 
    // }
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
    setInitialLoadDone(false); 
    console.log("User logged out");
  }, [liveStreak, authToken /*, saveStreakToServer*/]);


  const fetchUserProfile = useCallback(async (token: string | null) => {
    if (!token) {
      setUserProfileData(null);
      setCurrentUser(null); 
      return;
    }
    setIsFetchingProfile(true);
    try {
      const response = await fetch(`${API_BASE_URL}/profile`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      if (!response.ok) {
        if (response.status === 401) { 
          handleLogout();
        } else if (response.status === 429) {
            console.error("Profile fetch failed: 429 Too Many Requests.");
            setError("Too many requests to fetch profile. Please try again later.");
            setUserProfileData(null); 
            setCurrentUser(null); 
        } else {
            let errorMsg = `Failed to fetch profile (${response.status})`;
            try {
                const errText = await response.text(); 
                if (errText.trim().startsWith("<!doctype") || errText.trim().startsWith("<html")) {
                    console.error("Profile fetch failed, received HTML error page.");
                    setError(errorMsg + ". The server returned an unexpected response.");
                } else {
                    const errData = JSON.parse(errText); 
                    errorMsg = errData.error || errorMsg;
                    setError(errorMsg);
                }
            } catch (parseError) {
                console.error("Profile fetch failed, and error response was not valid JSON.", parseError);
                setError(errorMsg + ". Server response was not understandable.");
            }
        }
        return; 
      }

      const data = await response.json(); 
      console.log("Raw profile data from backend:", data); 

      const processedExploredWords: ExploredWordEntry[] = (data.exploredWords || [])
        .map((w: Record<string, any>) => w && typeof w.word === 'string' ? ({ 
            word: w.word as string, 
            last_explored_at: w.last_explored_at as string,
            is_favorite: w.is_favorite as boolean,
            first_explored_at: w.first_explored_at as string | undefined
        }) : null)
        .filter((w): w is ExploredWordEntry => w !== null && w.word.trim() !== '');


      const processedFavoriteWords: ExploredWordEntry[] = (data.favoriteWords || [])
        .map((w: Record<string, any>) => w && typeof w.word === 'string' ? ({ 
            word: w.word as string, 
            last_explored_at: w.last_explored_at as string,
            is_favorite: w.is_favorite as boolean,
            first_explored_at: w.first_explored_at as string | undefined 
        }) : null)
        .filter((w): w is ExploredWordEntry => w !== null && w.word.trim() !== '');
      
      console.log("Processed Explored Words for Profile:", processedExploredWords);
      console.log("Processed Favorite Words for Profile:", processedFavoriteWords);

      setUserProfileData({
        username: data.username,
        email: data.email,
        totalWordsExplored: data.totalWordsExplored, 
        exploredWords: processedExploredWords,
        favoriteWords: processedFavoriteWords,
        streakHistory: (data.streakHistory || []).sort((a:any, b:any) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()),
        quiz_points: data.quiz_points,
        total_quiz_questions_answered: data.total_quiz_questions_answered,
        total_quiz_questions_correct: data.total_quiz_questions_correct,
      });
      setCurrentUser({ username: data.username, email: data.email, id: data.user_id || (currentUser?.id || '') });
      setError(null); 
    } catch (err: any) {
      console.error("Error fetching profile (catch block):", err);
      if (!error) setError(err.message); 
    } finally {
      setIsFetchingProfile(false);
    }
  }, [currentUser?.id, error, handleLogout]); 

  useEffect(() => {
    const storedToken = localStorage.getItem('authToken');
    if (storedToken) {
      if (!authToken) setAuthToken(storedToken); 
      
      if (!initialLoadDone && !currentUser && !userProfileData && !isFetchingProfile) {
        console.log("[useEffect initial load] Attempting to fetch user profile.");
        fetchUserProfile(storedToken).finally(() => {
          setInitialLoadDone(true); 
        });
      } else if ((currentUser || userProfileData) && !initialLoadDone) {
          setInitialLoadDone(true);
      }
    } else {
      if(currentUser || userProfileData || authToken) { 
        setCurrentUser(null);
        setUserProfileData(null);
        setAuthToken(null); 
        setInitialLoadDone(false);
      }
    }
  }, [authToken, currentUser, userProfileData, isFetchingProfile, initialLoadDone, fetchUserProfile]);


  const handleAuthAction = async (e: FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccessMessage(null);
    setIsLoading(true);
    setInitialLoadDone(false); 

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
        setCurrentUser({ username: data.user.username, email: data.user.email, id: data.user.id }); 
        setShowAuthModal(false);
        setAuthSuccessMessage('Login successful!');
        await fetchUserProfile(data.access_token); 
        setInitialLoadDone(true); 
        
        setAuthEmail(''); 
        setAuthPassword('');
        setAuthUsername(''); 
      }
    } catch (err: any) {
      setAuthError(err.message);
      setInitialLoadDone(true); 
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
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
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
  
  useEffect(() => {
    // This useEffect is just an example. saveStreakToServer is called in handleLogout and handleGenerateExplanation.
  }, [saveStreakToServer]);


  const handleGenerateExplanation = useCallback(async (
    wordToFetch: string,
    isNewPrimaryWordSearch: boolean = false,
    isRefreshClick: boolean = false,
    isSubTopicClick: boolean = false,
    modeOverride?: ContentMode,
    isProfileWordClick: boolean = false
  ) => {
    if (!wordToFetch.trim()) { setError("Please enter a word or concept."); return; }
    if (!authToken) { setShowAuthModal(true); setAuthError("Please login to generate content."); return; }

    setIsLoading(true);
    setError(null); 
    if (modeOverride !== 'quiz' && (modeOverride || activeContentMode) !== 'quiz') {
        setQuizFeedback(null); setSelectedQuizOption(null); setIsQuizAttempted(false);
    }

    const wordId = sanitizeWordForId(wordToFetch);
    const modeToFetch = modeOverride || activeContentMode;
    let streakContextForAPI: string[] = [];

    if (isNewPrimaryWordSearch || isProfileWordClick) {
        streakContextForAPI = [];
    } else if (isSubTopicClick || (isReviewingStreakWord && wordForReview === wordToFetch) ) { 
        if (liveStreak && liveStreak.words.length > 0) {
            const targetWordForContext = isReviewingStreakWord && wordForReview ? wordForReview : wordToFetch;
            const wordIndexInStreak = liveStreak.words.indexOf(targetWordForContext);

            if (isSubTopicClick && (!liveStreak.words.includes(wordToFetch) || wordToFetch === liveStreak.words[liveStreak.words.length -1] )) { 
                 streakContextForAPI = [...liveStreak.words];
            } else if (wordIndexInStreak !== -1) { 
                 streakContextForAPI = liveStreak.words.slice(0, wordIndexInStreak);
            } else if (isSubTopicClick) { 
                 streakContextForAPI = [...liveStreak.words];
            }
        }
    } else if (currentFocusWord && !isNewPrimaryWordSearch && !isProfileWordClick) { 
        if (liveStreak && liveStreak.words.includes(currentFocusWord)) {
             const currentFocusWordIndex = liveStreak.words.indexOf(currentFocusWord);
             if (currentFocusWordIndex > 0) streakContextForAPI = liveStreak.words.slice(0, currentFocusWordIndex);
        }
    }


    if ((isNewPrimaryWordSearch || isProfileWordClick) && liveStreak && liveStreak.score >=1 && authToken) {
        if (liveStreak.score >=2) await saveStreakToServer(liveStreak, authToken);
        setLiveStreak(null); 
    }
    
    if (isNewPrimaryWordSearch || isProfileWordClick) {
        setCurrentFocusWord(wordToFetch);
        setIsReviewingStreakWord(false); 
        setWordForReview(null);
    } else if (isSubTopicClick && (!liveStreak || !liveStreak.words.includes(wordToFetch) || (liveStreak.words.includes(wordToFetch) && wordToFetch !== currentFocusWord && !isReviewingStreakWord) ) ) {
        // If it's a sub-topic click for a genuinely new word OR a word that's in streak but not current focus (and not yet reviewing it)
        setCurrentFocusWord(wordToFetch);
        setIsReviewingStreakWord(false);
        setWordForReview(null);
    }


    try {
      let contentExistsInFrontendCache = false;
      const currentWordItem = generatedContent[wordId];
      if (currentWordItem) {
          if (modeToFetch === 'explain') contentExistsInFrontendCache = typeof currentWordItem.explanation === 'string';
          else if (modeToFetch === 'fact') contentExistsInFrontendCache = typeof currentWordItem.fact === 'string';
          else if (modeToFetch === 'deep_dive') contentExistsInFrontendCache = typeof currentWordItem.deep_dive === 'string';
          else if (modeToFetch === 'image') contentExistsInFrontendCache = (typeof currentWordItem.image_url === 'string' && currentWordItem.image_url.length > 0) || (typeof currentWordItem.image_prompt === 'string' && currentWordItem.image_prompt.length > 0);
          else if (modeToFetch === 'quiz') contentExistsInFrontendCache = Array.isArray(currentWordItem.quiz) && currentWordItem.quiz.length > 0;
      }
      
      const isContextualExplainCall = modeToFetch === 'explain' && streakContextForAPI.length > 0;

      if (!isRefreshClick && contentExistsInFrontendCache) {
        if (!isReviewingStreakWord && !isSubTopicClick && !isProfileWordClick) {
             if(isNewPrimaryWordSearch || (currentFocusWord === wordToFetch)){
                 setCurrentFocusWord(wordToFetch);
            }
        } else if (isSubTopicClick && !isReviewingStreakWord) { 
            setCurrentFocusWord(wordToFetch);
        }

        if(activeContentMode !== modeToFetch) setActiveContentMode(modeToFetch);
        setIsLoading(false);
        if (isNewPrimaryWordSearch || isProfileWordClick) { 
            setLiveStreak({ score: 1, words: [wordToFetch] });
        }
        console.log(`Serving '${modeToFetch}' for '${wordToFetch}' from frontend cache (handleGenerateExplanation).`);
        return;
      }

      const requestBody: any = { 
          word: wordToFetch, mode: modeToFetch, 
          refresh_cache: isRefreshClick || isContextualExplainCall,
          streakContext: streakContextForAPI 
      };

      if (modeToFetch === 'quiz') {
          const explanationForQuiz = generatedContent[wordId]?.explanation;
          if (explanationForQuiz && typeof explanationForQuiz === 'string' && explanationForQuiz.trim() !== '') {
              requestBody.explanation_text = explanationForQuiz;
          } else {
              setError(`Please view the explanation for "${wordToFetch}" first to generate a quiz.`);
              setIsLoading(false); return;
          }
      }

      console.log(`Fetching content for "${wordToFetch}", mode "${modeToFetch}", context: [${streakContextForAPI.join(', ')}] from backend.`);
      const response = await fetch(`${API_BASE_URL}/generate_explanation`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errData = await response.json();
        if (response.status === 401) { handleLogout(); setShowAuthModal(true); setAuthError("Session expired."); }
        else if (response.status === 429) setError("API rate limit reached. Please try again later.");
        else setError(errData.error || `Failed to generate content (${response.status})`);
        setIsLoading(false); return; 
      }

      const data = await response.json(); 
      console.log("Data received from backend:", data);
      
      setGeneratedContent(prev => { 
        const existingWordData = prev[wordId] || {};
        const newWordData: GeneratedContentItem = { ...existingWordData };
        if (modeToFetch === 'explain') { if (data.explain !== undefined) newWordData.explanation = data.explain; }
        else if (modeToFetch === 'fact') { if (data.fact !== undefined) newWordData.fact = data.fact; }
        else if (modeToFetch === 'deep_dive') { if (data.deep_dive !== undefined) newWordData.deep_dive = data.deep_dive; }
        else if (modeToFetch === 'image') {
          if (data.image_url !== undefined) { newWordData.image_url = data.image_url; if (data.image_prompt !== undefined) newWordData.image_prompt = data.image_prompt; }
          else if (data.image !== undefined) { newWordData.image_prompt = data.image; newWordData.image_url = undefined; }
        } else if (modeToFetch === 'quiz') {
          const quizStrings = data.quiz; 
          if (quizStrings && Array.isArray(quizStrings)) {
            newWordData.quiz = parseQuizStringToArray(quizStrings);
            newWordData.quiz_progress = (isRefreshClick || (data.quiz && !data.quiz_progress?.length)) ? [] : (data.quiz_progress || existingWordData.quiz_progress || []);
            setCurrentQuizQuestionIndex(0); setSelectedQuizOption(null); setQuizFeedback(null); setIsQuizAttempted(false);     
          }
        }
        if (data.is_favorite !== undefined) newWordData.is_favorite = data.is_favorite;
        newWordData.first_explored_at = existingWordData.first_explored_at || data.first_explored_at || new Date().toISOString();
        newWordData.last_explored_at = data.last_explored_at || new Date().toISOString(); 
        const currentModesGenerated = new Set(existingWordData.modes_generated || []);
        currentModesGenerated.add(modeToFetch);
        if (data.modes_generated && Array.isArray(data.modes_generated)) data.modes_generated.forEach((m: string) => currentModesGenerated.add(m));
        newWordData.modes_generated = Array.from(currentModesGenerated);
        console.log(`Processed newWordData for ${wordId} (mode: ${modeToFetch}):`, newWordData);
        return { ...prev, [wordId]: newWordData };
      });

      if (isNewPrimaryWordSearch || isProfileWordClick) {
        setCurrentFocusWord(wordToFetch); 
        setLiveStreak({ score: 1, words: [wordToFetch] });
        setIsReviewingStreakWord(false); setWordForReview(null);
      } else if (isSubTopicClick) {
        if (!liveStreak || !liveStreak.words.includes(wordToFetch) || (liveStreak.words.includes(wordToFetch) && wordToFetch !== currentFocusWord && !isReviewingStreakWord)) {
            // setCurrentFocusWord(wordToFetch); // This was already set above for new subtopics
            setIsReviewingStreakWord(false); setWordForReview(null); // Ensure not in review mode
            setLiveStreak(prevStreak => {
                if (!prevStreak) return { score: 1, words: [wordToFetch] }; 
                if (prevStreak.words[prevStreak.words.length -1] !== wordToFetch) { // Only add if it's a new tip for the streak
                     return { score: prevStreak.score + 1, words: [...prevStreak.words, wordToFetch] };
                }
                return prevStreak; 
            });
        }
      }
      setActiveContentMode(modeToFetch);

    } catch (err: any) {
      if (!error) setError(err.message);
      console.error("Error generating content:", err);
    } finally {
      setIsLoading(false);
      if (isNewPrimaryWordSearch) setInputValue(''); 
    }
  }, [authToken, activeContentMode, generatedContent, liveStreak, saveStreakToServer, handleLogout, currentFocusWord, isReviewingStreakWord, wordForReview, error]);

  const handleStreakWordClick = useCallback((clickedWord: string) => {
    if (isReviewingStreakWord && wordForReview === clickedWord && activeContentMode === 'explain') {
        console.log(`[handleStreakWordClick] Already reviewing ${clickedWord} in explain mode.`);
        return;
    }
    console.log(`[handleStreakWordClick] Reviewing: ${clickedWord}. Current focus (streak tip): ${currentFocusWord}`);
    
    setIsReviewingStreakWord(true);
    setWordForReview(clickedWord);
    // setActiveContentMode('explain'); // Let HGE handle mode setting
    
    setSelectedQuizOption(null);
    setQuizFeedback(null);
    setIsQuizAttempted(false);
    
    // Fetch explanation for the clickedWord in its specific context within the streak
    handleGenerateExplanation(clickedWord, false, false, false, 'explain'); 
  }, [ isReviewingStreakWord, wordForReview, activeContentMode, handleGenerateExplanation, currentFocusWord]); // Added currentFocusWord


  const handleSubTopicClick = useCallback((subTopic: string) => {
    console.log(`[handleSubTopicClick] Clicked sub-topic: "${subTopic}". Current focus: "${currentFocusWord}". Streak:`, liveStreak?.words);
    
    if (subTopic === currentFocusWord && !isReviewingStreakWord) {
        console.log("Sub-topic is the current focus word. Refreshing its explanation.");
        handleGenerateExplanation(subTopic, false, true, false, 'explain'); 
        return;
    }

    // If the subTopic is already in the streak (and it's not the current focus word), treat as review.
    if (liveStreak && liveStreak.words.includes(subTopic)) {
        console.log(`Sub-topic "${subTopic}" is already in streak. Switching to review.`);
        handleStreakWordClick(subTopic); 
    } else { // Sub-topic is new to the streak path
        console.log(`Sub-topic "${subTopic}" is new. Extending streak.`);
        // isSubTopicClick = true, will set currentFocusWord to subTopic and extend streak
        handleGenerateExplanation(subTopic, false, false, true, 'explain');
    }
  }, [currentFocusWord, liveStreak, handleGenerateExplanation, handleStreakWordClick, isReviewingStreakWord]); 
  

  const handleModeChange = useCallback((newMode: ContentMode) => {
    const wordToUse = getDisplayWord();
    if (!wordToUse) { setError("No word is currently in focus."); return; }
    const wordId = sanitizeWordForId(wordToUse);
    console.log(`[handleModeChange] Mode: ${newMode} for word: ${wordToUse}`);
    
    if (newMode !== 'quiz') { setSelectedQuizOption(null); setQuizFeedback(null); setIsQuizAttempted(false); }

    const item = generatedContent[wordId];
    let modeSpecificContentExists = false;
    if (item) {
        if (newMode === 'explain') modeSpecificContentExists = typeof item.explanation === 'string';
        else if (newMode === 'fact') modeSpecificContentExists = typeof item.fact === 'string';
        else if (newMode === 'deep_dive') modeSpecificContentExists = typeof item.deep_dive === 'string';
        else if (newMode === 'image') modeSpecificContentExists = (typeof item.image_url === 'string' && item.image_url.length > 0) || (typeof item.image_prompt === 'string' && item.image_prompt.length > 0);
        else if (newMode === 'quiz') modeSpecificContentExists = Array.isArray(item.quiz) && item.quiz.length > 0;
    }

    if (modeSpecificContentExists) {
        setActiveContentMode(newMode); 
        if (newMode === 'quiz' && item?.quiz) { 
            const progress = item.quiz_progress || [];
            const nextQuestionIdx = progress.length >= item.quiz.length ? item.quiz.length : progress.length;
            setCurrentQuizQuestionIndex(nextQuestionIdx);
            setSelectedQuizOption(null); setQuizFeedback(null); setIsQuizAttempted(false); 
        }
        console.log(`[handleModeChange] Serving ${newMode} for ${wordToUse} from cache.`);
    } else {
        console.log(`[handleModeChange] Content for ${newMode} for ${wordToUse} not found/invalid, calling HGE.`);
        handleGenerateExplanation(wordToUse, false, false, false, newMode); 
    }
  }, [getDisplayWord, generatedContent, handleGenerateExplanation]);
  
  const handleRefreshContent = useCallback(() => {
    const wordToUse = getDisplayWord();
    if (!wordToUse) return;
    handleGenerateExplanation(wordToUse, false, true, false, activeContentMode);
  }, [getDisplayWord, activeContentMode, handleGenerateExplanation]);

  const handleToggleFavorite = useCallback(async (word: string, currentStatus: boolean) => {
    if (!authToken || !word) return;
    const wordId = sanitizeWordForId(word);
    setGeneratedContent(prev => { const ci = prev[wordId] || {}; return { ...prev, [wordId]: { ...ci, is_favorite: !currentStatus, last_explored_at: ci.last_explored_at || new Date().toISOString(), first_explored_at: ci.first_explored_at || new Date().toISOString() }}; });
    if (userProfileData) {
      setUserProfileData(prevP => {
        if (!prevP) return null;
        const nE = prevP.exploredWords.map(w => w.word === word ? { ...w, is_favorite: !currentStatus } : w );
        let nF: ExploredWordEntry[]; const eE = prevP.exploredWords.find(ew => ew.word === word);
        if (!currentStatus) { let eTF: ExploredWordEntry; if (eE) eTF = { ...eE, is_favorite: true, last_explored_at: new Date().toISOString() }; else { const gci = generatedContent[wordId]; eTF = { word, last_explored_at: new Date().toISOString(), is_favorite: true, first_explored_at: gci?.first_explored_at || new Date().toISOString()};} nF = [ ...prevP.favoriteWords.filter(fw => fw.word !== word), eTF ];
        } else nF = prevP.favoriteWords.filter(fw => fw.word !== word);
        return { ...prevP, exploredWords: nE, favoriteWords: nF.sort((a, b) => new Date(b.last_explored_at).getTime() - new Date(a.last_explored_at).getTime())};
      });
    }
    try {
      const r = await fetch(`${API_BASE_URL}/toggle_favorite`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }, body: JSON.stringify({ word }) });
      if (!r.ok) throw new Error((await r.json()).error || 'Toggle favorite failed');
      const d = await r.json(); 
      setGeneratedContent(prev => ({ ...prev, [wordId]: { ...(prev[wordId] || {}), is_favorite: d.is_favorite }}));
      if (authToken) await fetchUserProfile(authToken);
    } catch (err: any) {
      setError((err as Error).message); if (authToken) await fetchUserProfile(authToken); 
    }
  }, [authToken, fetchUserProfile, userProfileData, generatedContent]);
  
  const handleWordSelectionFromProfile = useCallback((word: string) => {
    setActiveView('main'); setInputValue(word); 
    handleGenerateExplanation(word, false, false, false, 'explain', true);
  }, [handleGenerateExplanation]); 

  useEffect(() => {
    const wordToUse = getDisplayWord();
    if (activeContentMode === 'quiz' && wordToUse) {
        const wordId = sanitizeWordForId(wordToUse);
        const currentWordContent = generatedContent[wordId];
        if (currentWordContent) {
            const quizSet = currentWordContent.quiz; 
            const progress = currentWordContent.quiz_progress || [];
            if (quizSet && quizSet.length > 0) {
                const questionToDisplayIndex = currentQuizQuestionIndex < quizSet.length ? currentQuizQuestionIndex : progress.length;
                if (questionToDisplayIndex < quizSet.length) { 
                    const currentQuestion = quizSet[questionToDisplayIndex];
                    const attemptedQuestion = progress.find(p => p.question_index === questionToDisplayIndex);
                    if (attemptedQuestion && currentQuestion?.options) { 
                        setSelectedQuizOption(attemptedQuestion.selected_option_key);
                        setQuizFeedback({ message: attemptedQuestion.is_correct ? "Correct!" : `Incorrect. Correct: ${currentQuestion.options[currentQuestion.correctOptionKey]}`, isCorrect: attemptedQuestion.is_correct });
                        setIsQuizAttempted(true);
                    } else { setSelectedQuizOption(null); setQuizFeedback(null); setIsQuizAttempted(false); }
                }
            } else if (!isLoading && !error && (!quizSet || quizSet.length === 0)) { 
                const explanationForQuiz = currentWordContent.explanation;
                if(explanationForQuiz && typeof explanationForQuiz === 'string' && explanationForQuiz.trim() !== ''){
                    handleGenerateExplanation(wordToUse, false, false, false, 'quiz');
                } else if (!isLoading && !error) { 
                    handleGenerateExplanation(wordToUse, false, false, false, 'explain');
                }
            }
        } else if (!isLoading && !error) {
            handleGenerateExplanation(wordToUse, false, false, false, 'explain');
        }
    }
  }, [activeContentMode, getDisplayWord, generatedContent, currentQuizQuestionIndex, isLoading, error, handleGenerateExplanation]);


  const handleSaveQuizAttempt = useCallback(async (word: string, questionIdx: number, optionKey: string, isCorrect: boolean) => {
    if (!authToken) return;
    const wordId = sanitizeWordForId(word);
    try {
        const response = await fetch(`${API_BASE_URL}/save_quiz_attempt`, {
            method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
            body: JSON.stringify({ word, question_index: questionIdx, selected_option_key: optionKey, is_correct: isCorrect }),
        });
        if (!response.ok) throw new Error((await response.json()).error || 'Failed to save quiz attempt');
        const data = await response.json();
        setGeneratedContent(prev => ({ ...prev, [wordId]: { ...(prev[wordId] || {}), quiz_progress: data.quiz_progress }}));
        if (authToken) await fetchUserProfile(authToken); 
    } catch (err: any) { console.error("Error saving quiz attempt:", err); setError("Could not save quiz progress."); }
  }, [authToken, fetchUserProfile]); 

  const handleQuizOptionSelect = useCallback((optionKey: string) => {
    const wordToUse = getDisplayWord();
    if (!wordToUse) return;
    const wordId = sanitizeWordForId(wordToUse);
    const currentGeneratedContent = generatedContent[wordId]; 
    if (!currentGeneratedContent) return;
    const quizSet = currentGeneratedContent.quiz; 
    if (!quizSet || currentQuizQuestionIndex >= quizSet.length) return; 
    const progress = currentGeneratedContent.quiz_progress || [];
    if (progress.find(p => p.question_index === currentQuizQuestionIndex) || isQuizAttempted) return; 
    const currentQuestion = quizSet[currentQuizQuestionIndex];
    if (!currentQuestion?.options) return;
    const isCorrect = currentQuestion.correctOptionKey === optionKey;
    setSelectedQuizOption(optionKey);
    setQuizFeedback({ message: isCorrect ? "Correct!" : `Incorrect. Correct: ${currentQuestion.options[currentQuestion.correctOptionKey]}`, isCorrect });
    setIsQuizAttempted(true); 
    handleSaveQuizAttempt(wordToUse, currentQuizQuestionIndex, optionKey, isCorrect);
  }, [getDisplayWord, generatedContent, currentQuizQuestionIndex, isQuizAttempted, handleSaveQuizAttempt]);

  const handleNextQuestion = useCallback(() => {
    const wordToUse = getDisplayWord();
    if (!wordToUse) return;
    const quizSet = generatedContent[sanitizeWordForId(wordToUse)]?.quiz;
    if (quizSet) { 
        setCurrentQuizQuestionIndex(prevIdx => prevIdx < quizSet.length - 1 ? prevIdx + 1 : quizSet.length);
        setSelectedQuizOption(null); setQuizFeedback(null); setIsQuizAttempted(false);
    }
  }, [getDisplayWord, generatedContent]);
  
  const handleFetchNewQuizSet = useCallback(() => {
    const wordToUse = getDisplayWord();
    if (!wordToUse) return;
    handleGenerateExplanation(wordToUse, false, true, false, 'quiz');
  }, [getDisplayWord, handleGenerateExplanation]);

  // --- RENDER FUNCTIONS ---
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
            {authMode === 'signup' && ( <div className="mb-4"> <label className="block text-slate-300 mb-1" htmlFor="signup-username">Username</label> <input type="text" id="signup-username" value={authUsername} onChange={(e) => setAuthUsername(e.target.value)} className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none" required /> </div> )}
            {authMode === 'signup' && ( <div className="mb-4"> <label className="block text-slate-300 mb-1" htmlFor="signup-email">Email</label> <input type="email" id="signup-email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none" required /> </div> )}
            {authMode === 'login' && ( <div className="mb-4"> <label className="block text-slate-300 mb-1" htmlFor="login-identifier">Username or Email</label> <input type="text"  id="login-identifier" value={authUsername}  onChange={(e) => setAuthUsername(e.target.value)} className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none" required /> </div> )}
            <div className="mb-6"> <label className="block text-slate-300 mb-1" htmlFor="password">Password</label> <input type="password" id="password" value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} className="w-full p-3 bg-slate-700 border border-slate-600 rounded-lg text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none" required /> </div>
            <button type="submit" disabled={isLoading} className="w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold p-3 rounded-lg transition-colors disabled:opacity-50"> {isLoading ? 'Processing...' : (authMode === 'login' ? 'Login' : 'Sign Up')} </button>
          </form>
          <p className="text-center text-slate-400 mt-6 text-sm"> {authMode === 'login' ? ( <> Need an account? <button onClick={() => {setAuthMode('signup'); setAuthError(null); setAuthSuccessMessage(null); setAuthUsername(''); setAuthEmail(''); setAuthPassword('');}} className="text-sky-400 hover:underline">Sign Up</button> </> ) : ( <> Already have an account? <button onClick={() => {setAuthMode('login'); setAuthError(null); setAuthSuccessMessage(null); setAuthUsername(''); setAuthEmail(''); setAuthPassword('');}} className="text-sky-400 hover:underline">Login</button> </> )} </p>
        </div>
      </div>
    );
  };

  const renderContent = () => { 
    const wordToUse = getDisplayWord();
    if (!wordToUse && isLoading) return <div className="text-center p-10 text-slate-400">Loading...</div>; 
    if (!wordToUse) return <div className="text-center p-10 text-slate-400 text-lg">Enter a word or concept to begin!</div>;

    const wordIdForContent = sanitizeWordForId(wordToUse); 
    const content = generatedContent[wordIdForContent];
    let modeContentAvailable = false;
    if (content) {
        if (activeContentMode === 'explain') modeContentAvailable = typeof content.explanation === 'string' && content.explanation.length > 0;
        else if (activeContentMode === 'fact') modeContentAvailable = typeof content.fact === 'string' && content.fact.length > 0;
        else if (activeContentMode === 'deep_dive') modeContentAvailable = typeof content.deep_dive === 'string' && content.deep_dive.length > 0;
        else if (activeContentMode === 'image') modeContentAvailable = (typeof content.image_url === 'string' && content.image_url.length > 0) || (typeof content.image_prompt === 'string' && content.image_prompt.length > 0);
        else if (activeContentMode === 'quiz') modeContentAvailable = Array.isArray(content.quiz) && content.quiz.length > 0;
    }

    if (isLoading && !modeContentAvailable) return <div className="text-center p-10 text-slate-400">Generating {activeContentMode} for "{wordToUse}"...</div>;
    if (error && !modeContentAvailable) {
      if(activeContentMode === 'quiz' && error.includes("Explanation text is required")) return <div className="text-center p-10 text-red-400">Please view the explanation for "{wordToUse}" first.</div>;
      return <div className="text-center p-10 text-red-400">Error: {error}</div>;
    }
    if (!content) return <div className="text-center p-10 text-slate-400">No content for "{wordToUse}" yet. Try generating.</div>;
    if (!modeContentAvailable && !isLoading) { 
        if(activeContentMode === 'quiz' && (!content.explanation || content.explanation.trim() === '') && !isLoading) return <div className="text-center p-10 text-slate-400">Please generate an explanation first for "{wordToUse}".</div>;
        return <div className="text-center p-10 text-slate-400">No {activeContentMode} content for "{wordToUse}". Try generating.</div>;
    }
    
    const currentIsFavorite = content.is_favorite || false;
    const renderClickableText = (text: string | undefined) => { 
        if (!text) return null;
        const parts = text.split(/(<click>.*?<\/click>)/g);
        return parts.map((part, index) => {
            const clickMatch = part.match(/<click>(.*?)<\/click>/);
            if (clickMatch && clickMatch[1]) {
                const subTopic = clickMatch[1];
                return ( <button key={`${subTopic}-${index}`} onClick={() => handleSubTopicClick(subTopic)} className="text-sky-400 hover:text-sky-300 underline font-semibold transition-colors mx-1" title={`Explore: ${subTopic}`} > {subTopic} </button> );
            }
            return <span key={`text-${index}`} dangerouslySetInnerHTML={{ __html: part.replace(/\n/g, '<br />') }} />;
        });
    };
    let modeContentElement = null;
    switch (activeContentMode) {
      case 'explain': modeContentElement = content.explanation ? (<div className="prose prose-invert prose-sm sm:prose-base max-w-none text-slate-200 leading-relaxed">{renderClickableText(content.explanation)}</div>) : <p>No explanation.</p>; break;
      case 'quiz': 
        const quizSet = content.quiz; const progress = content.quiz_progress || [];
        if (!quizSet || quizSet.length === 0) { modeContentElement = <p>No quiz.</p>; break; }
        if (currentQuizQuestionIndex >= quizSet.length) { 
            const score = progress.filter(p => p.is_correct).length;
            modeContentElement = ( <div className="text-slate-200"> <h3 className="text-xl font-semibold mb-4 text-sky-300">Quiz Summary for "{wordToUse}"</h3> <p className="text-lg mb-4">Score: <span className="font-bold text-emerald-400">{score}</span> / {quizSet.length}</p> <ul className="space-y-3 mb-6 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">{quizSet.map((pq, i) => { if (!pq) return null; const att = progress.find(p=>p.question_index===i); return (<li key={i} className={`p-3 rounded-md ${att?(att.is_correct?'bg-green-500/20':'bg-red-500/20'):'bg-slate-700'}`}><p className="font-medium mb-1">Q{i+1}: {pq.question}</p><p className="text-xs">Ans: {att&&pq.options&&pq.options[att.selected_option_key]?pq.options[att.selected_option_key]:(att?'N/A':'Not answered')}</p>{!att?.is_correct&&pq.options&&pq.options[pq.correctOptionKey]&&<p className="text-xs text-emerald-300">Correct: {pq.options[pq.correctOptionKey]}</p>}{att&&!att.is_correct&&pq.explanation&&<p className="mt-1 text-xs text-slate-300"><i>Expl: {pq.explanation}</i></p>}</li>);})}</ul> <button onClick={handleFetchNewQuizSet} className="w-full sm:w-auto bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-4 rounded-lg"><RotateCcw size={18} className="mr-2"/>More Questions</button> </div> );
        } else { 
            const cq = quizSet[currentQuizQuestionIndex]; 
            if (!cq?.options) {modeContentElement = <p>Error: Quiz data invalid.</p>; break;}
            modeContentElement = ( <div className="text-slate-200"> <p className="text-sm text-slate-400 mb-2">Q {currentQuizQuestionIndex+1} of {quizSet.length}</p> <h3 className="text-lg font-semibold mb-4">{cq.question}</h3> <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">{Object.entries(cq.options).map(([k, o])=>(<button key={k} onClick={()=>handleQuizOptionSelect(k)} disabled={isQuizAttempted||!!progress.find(p=>p.question_index===currentQuizQuestionIndex)} className={`p-3 rounded-lg text-left transition-all duration-200 ease-in-out ${selectedQuizOption===k?(quizFeedback?.isCorrect?'bg-green-500 hover:bg-green-600 ring-2 ring-green-400':'bg-red-500 hover:bg-red-600 ring-2 ring-red-400'):'bg-slate-700 hover:bg-slate-600 focus:ring-2 focus:ring-sky-500'} ${(isQuizAttempted||!!progress.find(p=>p.question_index===currentQuizQuestionIndex))&&selectedQuizOption!==k?'opacity-60 cursor-not-allowed':'cursor-pointer'}`}>{o}</button>))}</div> {quizFeedback&&(<div className={`p-3 rounded-md my-4 text-sm ${quizFeedback.isCorrect?'bg-green-500/20 text-green-300':'bg-red-500/20 text-red-300'}`}>{quizFeedback.message}{!quizFeedback.isCorrect&&cq.explanation&&<p className="mt-1 text-xs">{cq.explanation}</p>}</div>)} {(isQuizAttempted||!!progress.find(p=>p.question_index===currentQuizQuestionIndex))&&(<button onClick={handleNextQuestion} className="w-full sm:w-auto bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-4 rounded-lg">{currentQuizQuestionIndex===quizSet.length-1?'View Summary':'Next Question'}</button>)} </div> );
        } break;
      case 'fact': modeContentElement = content.fact ? <p className="text-lg text-amber-300 italic leading-relaxed">{renderClickableText(content.fact)}</p> : <p>No fact.</p>; break;
      case 'image': modeContentElement = (<div>{(content.image_url?.length)?(<img src={content.image_url} alt={`For ${wordToUse}`} className="rounded-lg shadow-lg mx-auto max-w-full h-auto max-h-[400px] object-contain"/>):(content.image_prompt?.length)?(<p className="text-slate-400 italic">{content.image_prompt}</p>):(<p>No image.</p>)}</div>); break;
      case 'deep_dive': modeContentElement = content.deep_dive ? <div className="prose prose-invert max-w-none text-slate-200 leading-relaxed">{renderClickableText(content.deep_dive)}</div> : <p>No deep dive.</p>; break;
      default: modeContentElement = <p>Select mode.</p>;
    }
    return ( <div key={wordToUse + activeContentMode} className="bg-slate-700 p-4 sm:p-6 rounded-lg shadow-xl mt-1 relative"> <div className="absolute top-3 right-3 flex items-center space-x-2"> <button onClick={() => handleToggleFavorite(wordToUse, currentIsFavorite)} className={`p-1.5 rounded-full hover:bg-slate-600 transition-colors ${currentIsFavorite?'text-pink-500':'text-slate-400'}`} title={currentIsFavorite?"Unfavorite":"Favorite"}><Heart size={20} fill={currentIsFavorite?'currentColor':'none'}/></button> {activeContentMode==='explain'&&(<button onClick={handleRefreshContent} className="p-1.5 rounded-full text-slate-400 hover:text-sky-300 hover:bg-slate-600 transition-colors" title={`Regen ${activeContentMode}`}><RefreshCw size={18}/></button>)} </div> <h2 className="text-2xl sm:text-3xl font-bold text-sky-400 mb-4 capitalize">{wordToUse} - <span className="text-sky-500">{activeContentMode}</span></h2> {modeContentElement} </div> );
  };
  const modeButtons: { mode: ContentMode; label: string; icon: React.ElementType }[] = [  { mode: 'explain', label: 'Explain', icon: MessageSquareQuote },{ mode: 'quiz', label: 'Quiz', icon: Lightbulb },{ mode: 'fact', label: 'Fact', icon: Sparkles },{ mode: 'image', label: 'Image', icon: ImageIcon },{ mode: 'deep_dive', label: 'Deep Dive', icon: Brain },];

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col">
      <header className="bg-slate-800 shadow-md p-3 sm:p-4 sticky top-0 z-40"> <div className="container mx-auto flex justify-between items-center max-w-6xl"> <div className="text-2xl sm:text-3xl font-bold text-sky-400 cursor-pointer hover:text-sky-300 transition-colors" onClick={() => { setActiveView('main'); }} title="Tiny Tutor Home" > Tiny Tutor AI </div> <div className="flex items-center space-x-2 sm:space-x-3"> {currentUser ? ( <> <span className="text-sm sm:text-base hidden md:inline">Hi, {currentUser.username}!</span> <button onClick={() => { if (activeView === 'profile') setActiveView('main'); else { if (authToken) fetchUserProfile(authToken); setActiveView('profile');} }} className={`p-2 rounded-full hover:bg-slate-700 transition-colors ${activeView === 'profile' ? 'text-sky-400 bg-slate-700' : 'text-slate-300'}`} title={activeView === 'profile' ? "Back to Explorer" : "View Profile"} > {activeView === 'profile' ? <Home size={20} /> : <User size={20} />} </button> <button onClick={handleLogout} className="p-2 rounded-full text-slate-300 hover:bg-slate-700 hover:text-red-400 transition-colors" title="Logout"> <LogOut size={20} /> </button> </> ) : ( <button onClick={() => { setShowAuthModal(true); setAuthMode('login');}} className="p-2 rounded-full text-slate-300 hover:bg-slate-700 hover:text-sky-400 transition-colors" title="Login/Signup"> <LogIn size={20} /> </button> )} </div> </div> </header>
      {activeView === 'main' && ( <main className="container mx-auto p-3 sm:p-4 md:p-6 flex-grow max-w-3xl w-full"> <form onSubmit={(e) => { e.preventDefault(); handleGenerateExplanation(inputValue, true, false, false, 'explain'); }} className="mb-6 flex flex-col sm:flex-row items-stretch gap-2"> <input type="text" value={inputValue} onChange={(e) => setInputValue(e.target.value)} placeholder="Enter a word or concept (e.g., photosynthesis)" className="flex-grow p-3 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none placeholder-slate-500" /> <button type="submit" disabled={isLoading || !inputValue.trim()} className="bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 px-4 sm:px-6 rounded-lg transition-colors flex items-center justify-center disabled:opacity-50" > <BookOpen size={20} className="mr-2 hidden sm:inline" /> Generate </button> </form> {error && !isLoading && <div className="bg-red-500/20 text-red-400 p-3 rounded-md mb-4 text-sm animate-fadeIn">{error}</div>} {liveStreak && liveStreak.score > 0 && currentFocusWord && ( <div className="mb-4 p-3 bg-slate-800 rounded-lg shadow text-sm text-emerald-400"> <span className="font-semibold">Live Streak: {liveStreak.score} </span> <span>({liveStreak.words.map((word, index) => ( <React.Fragment key={word + index}> <span className={`cursor-pointer hover:text-emerald-300 ${getDisplayWord() === word ? 'font-bold underline' : ''}`} onClick={() => handleStreakWordClick(word)} title={`Review: ${word}`} >{word}</span> {index < liveStreak.words.length - 1 && ' → '} </React.Fragment> ))} ) </span> {isReviewingStreakWord && wordForReview && <span className="ml-2 text-xs text-slate-400">(Reviewing: {wordForReview})</span>} </div> )} {getDisplayWord() && ( <div className="mb-6 flex flex-wrap justify-center gap-2 sm:gap-3"> {modeButtons.map(({ mode, label, icon: Icon }) => ( <button key={mode} onClick={() => handleModeChange(mode)} disabled={isLoading && activeContentMode !== mode} className={`flex items-center py-2 px-3 sm:px-4 rounded-lg text-sm font-medium transition-all duration-200 ease-in-out transform hover:scale-105 ${activeContentMode === mode ? 'bg-sky-500 text-white shadow-lg' : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-sky-300'} disabled:opacity-70 disabled:cursor-not-allowed`} title={label} ><Icon size={16} className="mr-1.5" /> {label}</button> ))} </div> )} <div className="animate-fadeIn">{renderContent()}</div> </main> )}
      {activeView === 'profile' && currentUser && userProfileData && ( <ProfilePageComponent currentUser={currentUser} userProfileData={userProfileData} onWordSelect={handleWordSelectionFromProfile} onToggleFavorite={handleToggleFavorite} onNavigateBack={() => setActiveView('main')} generatedContent={generatedContent} /> )}
      {activeView === 'profile' && (isLoading || isFetchingProfile) && !userProfileData && ( <div className="flex-grow flex items-center justify-center text-slate-400">Loading profile...</div> )}
      {activeView === 'profile' && !currentUser && !isFetchingProfile && ( <div className="flex-grow flex flex-col items-center justify-center text-slate-400 p-6"> <p className="mb-4 text-lg">Please log in to view your profile.</p> <button onClick={() => { setShowAuthModal(true); setAuthMode('login');}} className="bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-6 rounded-lg transition-colors" >Login</button> </div> )}
      {renderAuthModal()}
      <footer className="bg-slate-800 text-center p-4 text-xs text-slate-500 border-t border-slate-700 mt-auto"> © {new Date().getFullYear()} Tiny Tutor AI. All rights reserved. </footer>
    </div>
  );
}
export default App;


import React, { useState, useEffect, useCallback } from 'react';
import { Loader, AlertTriangle, Image as ImageIcon, CheckCircle2 } from 'lucide-react';

// --- Types ---
interface StoryOption {
  text: string;
  leads_to: string;
  is_correct?: boolean;
}
interface StoryInteraction {
  type: 'Text-based Button Selection' | 'Image Selection' | 'Multi-Select Image Game';
  options: StoryOption[];
}
interface StoryNode {
  feedback_on_previous_answer: string;
  dialogue: string;
  image_prompts: string[];
  interaction: StoryInteraction;
}
interface StoryHistoryItem {
  type: 'AI' | 'USER';
  text: string;
}

interface StoryModeProps {
  topic: string;
  authToken: string | null;
  onStoryEnd: () => void;
  language: string; 
  onRateLimitExceeded: () => void;
  isResuming: boolean;
  customApiKey: string | null;
}

// --- NEW: Key for sessionStorage ---
const STORY_STATE_SESSION_KEY = 'storyModeState';

const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';

const StoryModeComponent: React.FC<StoryModeProps> = ({ topic, authToken, onStoryEnd, language, onRateLimitExceeded, isResuming, customApiKey }) => {
  
  // --- CHANGE #1: Initialize state from sessionStorage ---
  // The component now tries to load its state from sessionStorage on first render.
  // This allows it to "resume" exactly where the user left off in the same session.
  const [currentNode, setCurrentNode] = useState<StoryNode | null>(() => {
    const savedState = sessionStorage.getItem(STORY_STATE_SESSION_KEY);
    return savedState ? JSON.parse(savedState).currentNode : null;
  });

  const [history, setHistory] = useState<StoryHistoryItem[]>(() => {
    const savedState = sessionStorage.getItem(STORY_STATE_SESSION_KEY);
    return savedState ? JSON.parse(savedState).history : [];
  });
  
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGameAnswers, setSelectedGameAnswers] = useState<Set<string>>(new Set());

  // isHalted is no longer needed as the UI state itself prevents interaction.
  // The disabled={isLoading} on buttons handles this correctly.

  const RATE_LIMIT_ERROR_MESSAGE = "RATE_LIMIT_EXCEEDED";

  // --- CHANGE #2: Save state to sessionStorage on every update ---
  // This effect runs whenever the story state changes, saving it to sessionStorage.
  // This ensures that if the user navigates away, their progress is not lost.
  useEffect(() => {
    // We don't save the state if there's no history, to ensure a clean start for new stories.
    if (history.length > 0) {
      const stateToSave = {
        currentNode,
        history,
        topic, // Also save the topic to prevent resuming the wrong story
        language,
      };
      sessionStorage.setItem(STORY_STATE_SESSION_KEY, JSON.stringify(stateToSave));
    }
  }, [currentNode, history, topic, language]);


  const fetchNextNode = useCallback(async (selectedOption: { leads_to: string, text: string } | null = null, isRetry: boolean = false) => {
    setIsLoading(true);
    setError(null);

    if (!authToken) {
      setError("Authentication is required for Story Mode.");
      setIsLoading(false);
      return;
    }

    // --- CHANGE #3: Smart history handling for retries ---
    // We only add the user's choice to the history if it's a new action, not a retry.
    const newHistory: StoryHistoryItem[] = [...history];
    if (selectedOption && !isRetry) {
      newHistory.push({ type: 'USER', text: selectedOption.text });
    }

    try {
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
      };
      if (customApiKey) {
        headers['X-User-API-Key'] = customApiKey;
      } else if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
      }
      
      const response = await fetch(`${API_BASE_URL}/generate_story_node`, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify({
          topic: topic,
          history: newHistory,
          leads_to: selectedOption ? selectedOption.leads_to : null,
          language: language,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
            // --- CHANGE #4: Handle Rate Limit without clearing screen ---
            // Instead of halting, we save the failed action and trigger the parent component.
            // The UI will remain as is, with buttons disabled by `isLoading`.
            const pendingAction = { selectedOption };
            sessionStorage.setItem('storyPendingAction', JSON.stringify(pendingAction));
            onRateLimitExceeded();
            throw new Error(RATE_LIMIT_ERROR_MESSAGE);
        }
        const errData = await response.json().catch(() => ({ error: "An unexpected server error occurred." }));
        throw new Error(errData.error || `Request failed with status ${response.status}`);
      }

      // If the API call was successful, clear any pending action.
      sessionStorage.removeItem('storyPendingAction');

      const data: StoryNode = await response.json();
      const updatedHistory: StoryHistoryItem[] = [...newHistory];
      if (data.dialogue && data.dialogue.trim().length > 2) {
        updatedHistory.push({ type: 'AI', text: data.dialogue });
      } else {
        throw new Error("The AI narrator is currently unavailable. Please try again.");
      }

      setHistory(updatedHistory);
      setCurrentNode(data);
      setSelectedGameAnswers(new Set()); 

    } catch (err) {
      if (err instanceof Error && err.message !== RATE_LIMIT_ERROR_MESSAGE) {
          setError(err.message);
      } else {
          console.error("Rate limit exceeded in Story Mode, preserving UI.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [topic, authToken, customApiKey, history, language, onRateLimitExceeded]);

  
  // --- CHANGE #5: Unified starting and resuming logic ---
  useEffect(() => {
    // On mount, check if we should resume a story or start a new one.
    const savedState = JSON.parse(sessionStorage.getItem(STORY_STATE_SESSION_KEY) || 'null');
    const pendingAction = JSON.parse(sessionStorage.getItem('storyPendingAction') || 'null');

    if (isResuming && pendingAction) {
        // --- This handles the API key update flow ---
        console.log("Resuming and retrying pending action...");
        // Retrieve the action that failed and retry it.
        fetchNextNode(pendingAction.selectedOption, true); 
        sessionStorage.removeItem('storyPendingAction');
    } else if (savedState && savedState.topic === topic && savedState.language === language) {
        // If there's a saved state for the current topic/language, just show it.
        console.log("Restoring story from session.");
        setIsLoading(false);
    } else if (!authToken) {
        // No auth token, stop loading.
        setIsLoading(false);
    } else {
        // If no saved state, or topic/language mismatch, start a new story.
        console.log("Starting a new story.");
        sessionStorage.removeItem(STORY_STATE_SESSION_KEY);
        sessionStorage.removeItem('storyPendingAction');
        setHistory([]);
        setCurrentNode(null);
        fetchNextNode(null);
    }
  // We've added `isResuming` to the dependency array to properly trigger the retry logic.
  }, [isResuming, topic, language, authToken]);


  const handleGameItemClick = (optionText: string) => {
    setSelectedGameAnswers(prev => {
      const newSelection = new Set(prev);
      if (newSelection.has(optionText)) {
        newSelection.delete(optionText);
      } else {
        newSelection.add(optionText);
      }
      return newSelection;
    });
  };

  const handleSubmitGameAnswer = () => {
    if (!currentNode) return;
    const correctAnswers = new Set(currentNode.interaction.options.filter(opt => opt.is_correct).map(opt => opt.text));
    const isCorrect = correctAnswers.size === selectedGameAnswers.size && [...correctAnswers].every(answer => selectedGameAnswers.has(answer));
    fetchNextNode({
      leads_to: isCorrect ? 'Correct' : 'Incorrect',
      text: `Selected: ${[...selectedGameAnswers].join(', ') || 'None'}`,
    });
  };

  const handleOptionClick = (option: StoryOption) => {
    if (option.leads_to.toLowerCase().includes('end_story')) {
      // Clear session storage on story end for a clean slate next time.
      sessionStorage.removeItem(STORY_STATE_SESSION_KEY);
      sessionStorage.removeItem('storyPendingAction');
      onStoryEnd();
      return;
    }
    fetchNextNode(option);
  };
  
  // --- RENDER LOGIC (Minor changes to disable buttons) ---
  // The 'isHalted' state is no longer necessary. The 'isLoading' state now correctly
  // manages disabling buttons during API calls or after a rate-limit error,
  // preventing the user from making further actions until the situation is resolved.

  const renderContent = () => {
    if (isLoading && !currentNode) {
      return (
        <div className="flex flex-col items-center justify-center text-center p-10 animate-fadeIn h-full">
          <Loader className="animate-spin h-12 w-12 text-[--accent-primary] mb-4" />
          <p className="text-lg text-[--text-secondary]">Crafting your interactive story about "{topic}"...</p>
        </div>
      );
    }
    
    if (error) {
      return (
        <div className="flex flex-col items-center justify-center text-center p-10 bg-red-900/20 rounded-lg animate-fadeIn h-full">
          <AlertTriangle className="h-12 w-12 text-red-400 mb-4" />
          <h3 className="text-xl font-semibold text-red-300">Error</h3>
          <p className="text-red-300/80">{error}</p>
        </div>
      );
    }

    if (!currentNode) {
        return (
             <div className="flex flex-col items-center justify-center text-center p-10 h-full">
                 <AlertTriangle className="h-12 w-12 text-amber-400 mb-4" />
                 <h3 className="text-xl font-semibold text-amber-300">Authentication Required</h3>
                 <p className="text-amber-300/80">Please sign in to start a story.</p>
            </div>
        )
    }

    return (
      <div className="w-full max-w-4xl mx-auto p-4 animate-fadeIn">
        {currentNode.feedback_on_previous_answer && (
          <div className="mb-4 p-4 bg-green-900/30 border border-green-500/50 rounded-lg animate-fadeIn">
            <p className="text-lg font-semibold text-green-300">{currentNode.feedback_on_previous_answer}</p>
          </div>
        )}
        <div className="bg-[--background-secondary] p-6 rounded-lg shadow-xl mb-6">
          <p className="prose prose-invert max-w-none text-[--text-secondary] leading-relaxed text-lg">
            {currentNode.dialogue}
          </p>
        </div>
        {currentNode.interaction.type !== 'Multi-Select Image Game' && currentNode.image_prompts && currentNode.image_prompts.length > 0 && (
          <div className="mb-6 bg-[--hover-bg-color] p-4 rounded-lg border border-[--border-color]">
            <div className="flex items-center text-xs text-[--text-tertiary] mb-2">
                <ImageIcon size={14} className="mr-2"/>
                <span>IMAGE PROMPT (FOR TESTING)</span>
            </div>
            <p className="text-[--text-secondary]">{currentNode.image_prompts[0]}</p>
          </div>
        )}
        
        {currentNode.interaction.type === 'Text-based Button Selection' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentNode.interaction.options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleOptionClick(option)}
                disabled={isLoading}
                className="w-full text-left p-4 rounded-lg bg-[--hover-bg-color] hover:bg-[--border-color] transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-[--text-primary]"
              >
                {option.text}
              </button>
            ))}
          </div>
        )}

        {currentNode.interaction.type === 'Multi-Select Image Game' && (
          <div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
              {currentNode.interaction.options.map((option, index) => {
                const isSelected = selectedGameAnswers.has(option.text);
                return (
                  <button
                    key={index}
                    onClick={() => handleGameItemClick(option.text)}
                    disabled={isLoading}
                    className={`relative w-full aspect-square text-left p-2 rounded-lg transition-all border-2 ${isSelected ? 'border-[--accent-primary] scale-105' : 'border-[--border-color] hover:border-gray-600'} bg-[--hover-bg-color] disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                   {isSelected && (
                      <div className="absolute top-2 right-2 bg-[--accent-primary] rounded-full p-1">
                        <CheckCircle2 size={16} className="text-black" />
                      </div>
                    )}
                    <div className="flex flex-col h-full">
                      <div className="flex-grow flex items-center justify-center text-center text-xs text-[--text-tertiary] bg-black/20 rounded-md p-1">
                          <p className="text-[--text-secondary]">{currentNode.image_prompts[index] || 'Missing prompt'}</p>
                      </div>
                      <p className="mt-2 text-sm text-center text-[--text-primary] truncate">{option.text}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <button
              onClick={handleSubmitGameAnswer}
              disabled={isLoading || selectedGameAnswers.size === 0}
              className="w-full p-4 rounded-lg bg-[--accent-primary] text-black font-bold hover:bg-green-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Submit Answer
            </button>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center mt-6">
            <Loader className="animate-spin h-8 w-8 text-[--accent-primary]" />
          </div>
        )}
      </div>
    );
  };
  
  return renderContent();
};

export default StoryModeComponent;
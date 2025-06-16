import React, { useState, useEffect, useCallback } from 'react';
import { Loader, AlertTriangle, Image as ImageIcon, CheckCircle2 } from 'lucide-react';

// --- Types for the new game feature ---
interface StoryOption {
  text: string;
  leads_to: string;
  is_correct?: boolean; // Optional: Used for the new game type
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
}

const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';

const StoryModeComponent: React.FC<StoryModeProps> = ({ topic, authToken, onStoryEnd, language }) => {
     console.log("--- STORYMODE COMPONENT RENDERED - V2 ---");
  const [currentNode, setCurrentNode] = useState<StoryNode | null>(null);
  const [history, setHistory] = useState<StoryHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedGameAnswers, setSelectedGameAnswers] = useState<Set<string>>(new Set());

  const fetchNextNode = useCallback(async (selectedOption: { leads_to: string, text: string } | null = null) => {
    setIsLoading(true);
    setError(null);

    if (!authToken) {
      setError("Authentication is required for Story Mode.");
      setIsLoading(false);
      return;
    }

    const newHistory: StoryHistoryItem[] = [...history];
    if (selectedOption) {
      newHistory.push({ type: 'USER', text: selectedOption.text });
    }

    try {
      const response = await fetch(`${API_BASE_URL}/generate_story_node`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          topic: topic,
          history: newHistory,
          leads_to: selectedOption ? selectedOption.leads_to : null,
          language: language,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Request failed with status ${response.status}`);
      }

      const data: StoryNode = await response.json();

      // --- NEW: Detailed logging for debugging ---
      console.groupCollapsed(`%c🤖 AI RESPONSE RECEIVED`, 'color: #88c0d0; font-weight: bold; font-size: 14px;');
      console.log('Dialogue:', data.dialogue);
      console.log('Feedback:', data.feedback_on_previous_answer);
      // Log a clean copy of the arrays/objects for better inspection
      console.log('Image Prompts:', JSON.parse(JSON.stringify(data.image_prompts)));
      console.log('Interaction Type:', data.interaction.type);
      console.log('Options:', JSON.parse(JSON.stringify(data.interaction.options)));
      console.groupEnd();
      // --- END NEW LOGGING ---
      
      const updatedHistory: StoryHistoryItem[] = [...newHistory];
      if (data.dialogue && data.dialogue.trim().length > 2) {
        updatedHistory.push({ type: 'AI', text: data.dialogue });
      } else {
        // If the dialogue is blank, we should not proceed with this turn.
        // We throw an error to be caught below, preventing a state update with bad data.
        console.error("Received blank or invalid dialogue from AI:", data.dialogue);
        throw new Error("The AI narrator is currently unavailable. Please try again.");
      }

      setHistory(updatedHistory);
      setCurrentNode(data);
      setSelectedGameAnswers(new Set()); 

    } catch (err) {
      if (err instanceof Error) { setError(err.message); } 
      else { setError('An unknown error occurred.'); }
    } finally {
      setIsLoading(false);
    }
  }, [topic, authToken, history,language]);

  useEffect(() => {
    if (history.length === 0 && authToken) {
      fetchNextNode(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, authToken]);


  // --- HANDLERS FOR NEW GAME TYPE ---
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

    const correctAnswers = new Set(
      currentNode.interaction.options
        .filter(opt => opt.is_correct)
        .map(opt => opt.text)
    );

    const isCorrect = correctAnswers.size === selectedGameAnswers.size &&
                      [...correctAnswers].every(answer => selectedGameAnswers.has(answer));
    
    // --- NEW: Detailed logging for game submission ---
    console.groupCollapsed(`%c👤 USER ACTION (Game Submit):`, 'color: #a3be8c; font-weight: bold; font-size: 14px;');
    console.log('Selected Answers:', Array.from(selectedGameAnswers));
    console.log('Correct Answer Set:', Array.from(correctAnswers));
    console.log('Was Correct:', isCorrect);
    console.groupEnd();
    // --- END NEW LOGGING ---

    fetchNextNode({
      leads_to: isCorrect ? 'Correct' : 'Incorrect',
      text: `Selected: ${[...selectedGameAnswers].join(', ') || 'None'}`,
    });
  };

  // Standard handler for single-choice questions
  const handleOptionClick = (option: StoryOption) => {
    // --- NEW: Detailed logging for single choice ---
    console.log(`%c👤 USER ACTION (Single Choice):`, 'color: #a3be8c; font-weight: bold; font-size: 14px;', option);
    // --- END NEW LOGGING ---

    if (option.leads_to.toLowerCase().includes('end_story')) {
      onStoryEnd();
      return;
    }
    fetchNextNode(option);
  };


  const renderContent = () => {
    if (isLoading && !currentNode) {
      return (
        <div className="flex flex-col items-center justify-center text-center p-10 animate-fadeIn">
          <Loader className="animate-spin h-12 w-12 text-[--accent-primary] mb-4" />
          <p className="text-lg text-[--text-secondary]">Crafting your interactive story about "{topic}"...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col items-center justify-center text-center p-10 bg-red-900/20 rounded-lg animate-fadeIn">
          <AlertTriangle className="h-12 w-12 text-red-400 mb-4" />
          <h3 className="text-xl font-semibold text-red-300">Error</h3>
          <p className="text-red-300/80">{error}</p>
        </div>
      );
    }

    if (!currentNode) return null;

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
        
        {/* Renders a single image prompt for non-game turns */}
        {currentNode.interaction.type !== 'Multi-Select Image Game' && currentNode.image_prompts && currentNode.image_prompts.length > 0 && (
          <div className="mb-6 bg-[--hover-bg-color] p-4 rounded-lg border border-[--border-color]">
            <div className="flex items-center text-xs text-[--text-tertiary] mb-2">
                <ImageIcon size={14} className="mr-2"/>
                <span>IMAGE PROMPT (FOR TESTING)</span>
            </div>
            <p className="text-[--text-secondary]">{currentNode.image_prompts[0]}</p>
          </div>
        )}

        {/* --- RENDER LOGIC FOR STANDARD QUESTIONS --- */}
        {currentNode.interaction.type === 'Text-based Button Selection' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentNode.interaction.options.map((option, index) => (
              <button
                key={index}
                onClick={() => handleOptionClick(option)}
                disabled={isLoading}
                className="w-full text-left p-4 rounded-lg bg-[--hover-bg-color] hover:bg-[--border-color] transition-colors disabled:opacity-50 text-[--text-primary]"
              >
                {option.text}
              </button>
            ))}
          </div>
        )}

        {/* --- RENDER LOGIC FOR NEW MULTI-SELECT GAME --- */}
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
                    className={`relative w-full aspect-square text-left p-2 rounded-lg transition-all border-2 ${isSelected ? 'border-[--accent-primary] scale-105' : 'border-[--border-color] hover:border-gray-600'} bg-[--hover-bg-color]`}
                  >
                    {isSelected && (
                      <div className="absolute top-2 right-2 bg-[--accent-primary] rounded-full p-1">
                        <CheckCircle2 size={16} className="text-black" />
                      </div>
                    )}
                    <div className="flex flex-col h-full">
                      <div className="flex-grow flex items-center justify-center text-center text-xs text-[--text-tertiary] bg-black/20 rounded-md p-1">
                          {/* FIX: Corrected typo from image__prompts to image_prompts */}
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
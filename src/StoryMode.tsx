import React, { useState, useEffect, useCallback } from 'react';
import { Loader, AlertTriangle, Image as ImageIcon } from 'lucide-react';

// --- Types for the new, richer data structure ---
interface StoryOption {
  text: string;
  leads_to: string;
}

interface StoryInteraction {
  type: 'Text-based Button Selection' | 'Image Selection';
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
}

const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';

const StoryModeComponent: React.FC<StoryModeProps> = ({ topic, authToken, onStoryEnd }) => {
  const [currentNode, setCurrentNode] = useState<StoryNode | null>(null);
  const [history, setHistory] = useState<StoryHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNextNode = useCallback(async (selectedOption: StoryOption | null = null) => {
    setIsLoading(true);
    setError(null);

    if (!authToken) {
      setError("Authentication is required for Story Mode.");
      setIsLoading(false);
      return;
    }

    const newHistory = [...history];
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
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Request failed with status ${response.status}`);
      }

      const data: StoryNode = await response.json();
      
      // --- NEW: Detailed logging for debugging ---
      console.groupCollapsed(`%c🤖 AI RESPONSE RECEIVED`, 'color: #88c0d0; font-weight: bold;');
      console.log('Dialogue:', data.dialogue);
      console.log('Feedback:', data.feedback_on_previous_answer);
      console.log('Image Prompts:', data.image_prompts);
      console.log('Interaction Type:', data.interaction.type);
      console.log('Options:', data.interaction.options);
      console.groupEnd();
      // --- END NEW LOGGING ---

      const updatedHistory = [...newHistory];
      if (data.dialogue) {
        updatedHistory.push({ type: 'AI', text: data.dialogue });
      }
      setHistory(updatedHistory);
      setCurrentNode(data);

    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [topic, authToken, history]);

  useEffect(() => {
    if (history.length === 0) {
      fetchNextNode();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, authToken]); 

  const handleOptionClick = (option: StoryOption) => {
    // --- NEW: Detailed logging for debugging ---
    console.log(`%c👤 USER SELECTED:`, 'color: #a3be8c; font-weight: bold;', option);
    // --- END NEW LOGGING ---

    if (!option || typeof option.leads_to === 'undefined') {
        console.error("Invalid option clicked, ending story.", option);
        setError("A navigation error occurred. Ending story.");
        setTimeout(onStoryEnd, 2000);
        return;
    }

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
        
        {currentNode.image_prompts && currentNode.image_prompts.length > 0 && currentNode.interaction.type !== 'Image Selection' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {currentNode.image_prompts.map((prompt, index) => (
                <div key={index} className="bg-[--hover-bg-color] p-4 rounded-lg border border-[--border-color]">
                  <div className="flex items-center text-xs text-[--text-tertiary] mb-2">
                      <ImageIcon size={14} className="mr-2"/>
                      <span>IMAGE PROMPT (FOR TESTING)</span>
                  </div>
                  <p className="text-[--text-secondary]">{prompt}</p>
                </div>
            ))}
            </div>
        )}

        {currentNode.interaction && currentNode.interaction.options && (
          <div>
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

            {currentNode.interaction.type === 'Image Selection' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentNode.interaction.options.map((option, index) => (
                  <button
                    key={index}
                    onClick={() => handleOptionClick(option)}
                    disabled={isLoading}
                    className="w-full text-left p-4 rounded-lg bg-[--hover-bg-color] hover:bg-[--border-color] transition-colors disabled:opacity-50 flex flex-col"
                  >
                    <span className="font-bold text-[--text-primary] mb-2">{option.text}</span>
                    <div className="bg-black/20 p-2 rounded-md text-sm text-[--text-tertiary] border border-[--border-color]">
                      <div className="flex items-center text-xs text-[--text-tertiary] mb-2">
                        <ImageIcon size={14} className="mr-2"/>
                        <span>IMAGE PROMPT (FOR TESTING)</span>
                      </div>
                      <p className="text-[--text-secondary]">{currentNode.image_prompts[index]}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
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
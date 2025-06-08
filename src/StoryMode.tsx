import React, { useState, useEffect, useCallback } from 'react';
import { Loader, AlertTriangle, Image as ImageIcon } from 'lucide-react';

// --- Types for the new, richer data structure ---
interface StoryOption {
  text: string;
  leads_to: string;
}

interface StoryInteraction {
  type: string;
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
  const [feedback, setFeedback] = useState<string | null>(null);
  const [history, setHistory] = useState<StoryHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNextNode = useCallback(async (selectedOption: StoryOption | null = null) => {
    setIsLoading(true);
    setError(null);
    setFeedback(null); // Clear old feedback

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
      
      // Set new feedback and dialogue
      if (data.feedback_on_previous_answer) {
        setFeedback(data.feedback_on_previous_answer);
      }
      setHistory([...newHistory, { type: 'AI', text: data.dialogue }]);
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
    fetchNextNode();
  }, [topic, authToken]);

  const handleOptionClick = (option: StoryOption) => {
    if (!option || !option.leads_to) {
        console.error("Invalid option clicked, ending story.", option);
        onStoryEnd();
        return;
    }
    if (option.leads_to.toLowerCase().includes('end')) {
      onStoryEnd();
      return;
    }
    fetchNextNode(option);
  };

  const renderContent = () => {
    if (isLoading && !currentNode) {
      return ( <div className="flex flex-col items-center justify-center text-center p-10 animate-fadeIn"> <Loader className="animate-spin h-12 w-12 text-[--accent-primary] mb-4" /> <p className="text-lg text-[--text-secondary]">Crafting your interactive story about "{topic}"...</p> </div> );
    }

    if (error) {
      return ( <div className="flex flex-col items-center justify-center text-center p-10 bg-red-900/20 rounded-lg animate-fadeIn"> <AlertTriangle className="h-12 w-12 text-red-400 mb-4" /> <h3 className="text-xl font-semibold text-red-300">Error</h3> <p className="text-red-300/80">{error}</p> </div> );
    }

    if (!currentNode) return null;

    return (
      <div className="w-full max-w-4xl mx-auto p-4 animate-fadeIn">
        {feedback && (
            <div className="bg-sky-900/30 p-4 rounded-lg shadow-inner mb-4">
                <p className="text-sky-300 italic text-center">{feedback}</p>
            </div>
        )}
        <div className="bg-[--background-secondary] p-6 rounded-lg shadow-xl mb-6">
          <p className="prose prose-invert max-w-none text-[--text-secondary] leading-relaxed text-lg">
            {currentNode.dialogue}
          </p>
        </div>
        
        {currentNode.image_prompts && currentNode.image_prompts.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            {currentNode.image_prompts.map((prompt, index) => (
                <div key={index} className="bg-[--hover-bg-color] p-4 rounded-lg border border-[--border-color] text-sm text-[--text-tertiary]">
                <div className="flex items-center text-xs text-[--text-tertiary] mb-2"> <ImageIcon size={14} className="mr-2"/> <span>IMAGE PROMPT (FOR TESTING)</span> </div>
                <p className="text-[--text-secondary]">{prompt}</p>
                </div>
            ))}
            </div>
        )}

        {currentNode.interaction && currentNode.interaction.options && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentNode.interaction.options.map((option, index) => (
                <button key={index} onClick={() => handleOptionClick(option)} disabled={isLoading}
                className="w-full text-left p-4 rounded-lg bg-[--hover-bg-color] hover:bg-[--border-color] transition-colors disabled:opacity-50">
                {option.text}
                </button>
            ))}
            </div>
        )}
        
        {isLoading && ( <div className="flex justify-center mt-6"> <Loader className="animate-spin h-8 w-8 text-[--accent-primary]" /> </div> )}
      </div>
    );
  };
  
  return renderContent();
};

export default StoryModeComponent;
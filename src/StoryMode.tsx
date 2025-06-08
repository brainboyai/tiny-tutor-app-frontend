import React, { useState, useEffect, useCallback } from 'react';
import { Loader, AlertTriangle, Image as ImageIcon } from 'lucide-react';

// --- UPDATED Types ---
interface StoryOption {
  text: string;
  leads_to: string;
}

interface StoryInteraction {
  type: string;
  options: StoryOption[];
}

interface StoryNode {
  // feedback_on_previous_answer has been removed
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

  // Helper to generate a placeholder image URL
  const generatePlaceholderUrl = (prompt: string, size: string = "800x450") => {
    const text = encodeURIComponent(prompt);
    // Using placehold.co for dynamic placeholder images with text
    return `https://placehold.co/${size}/1e293b/ffffff/png?text=${text}&font=lato`;
  };

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
      // For image selections, the text might be empty, so use leads_to for history
      const historyText = selectedOption.text || `Selected Image: ${selectedOption.leads_to}`;
      newHistory.push({ type: 'USER', text: historyText });
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
    if (topic && authToken) {
        fetchNextNode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, authToken]); // fetchNextNode is memoized, so we only need to run this on initial load

  const handleOptionClick = (option: StoryOption) => {
    if (!option || !option.leads_to) {
        console.error("Invalid option clicked, ending story.", option);
        onStoryEnd();
        return;
    }
    if (option.leads_to.toLowerCase().includes('end') || option.leads_to.toLowerCase().includes('conclusion')) {
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

    const isImageSelection = currentNode.interaction.type === "Image Selection";
    
    return (
      <div className="w-full max-w-4xl mx-auto p-4 animate-fadeIn">
        {/* --- IMAGE DISPLAY AREA --- */}
        {/* Show a single image for non-image-selection turns */}
        {!isImageSelection && currentNode.image_prompts.length > 0 && (
            <div className="mb-6 rounded-lg overflow-hidden shadow-xl">
                <img src={generatePlaceholderUrl(currentNode.image_prompts[0])} alt={currentNode.image_prompts[0]} className="w-full h-auto object-cover"/>
            </div>
        )}

        {/* --- DIALOGUE AREA --- */}
        <div className="bg-[--background-secondary] p-6 rounded-lg shadow-xl mb-6">
          <p className="prose prose-invert max-w-none text-[--text-secondary] leading-relaxed text-lg whitespace-pre-wrap">
            {currentNode.dialogue}
          </p>
        </div>
        
        {/* --- INTERACTION AREA --- */}
        {isImageSelection ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                {currentNode.image_prompts.map((prompt, index) => (
                    <button key={index} onClick={() => handleOptionClick(currentNode.interaction.options[index])} disabled={isLoading}
                        className="group text-left rounded-lg bg-[--background-secondary] hover:bg-[--hover-bg-color] transition-all duration-300 disabled:opacity-50 border border-[--border-color] hover:border-[--accent-primary] overflow-hidden shadow-lg hover:shadow-2xl transform hover:-translate-y-1">
                        <img src={generatePlaceholderUrl(prompt, "600x400")} alt={prompt} className="w-full h-auto object-cover transition-transform duration-300 group-hover:scale-105"/>
                        <div className="p-3">
                            <div className="flex items-center text-xs text-[--text-tertiary] mb-1"> <ImageIcon size={14} className="mr-2 flex-shrink-0"/> <span>IMAGE PROMPT (FOR VISUALIZATION)</span> </div>
                            <p className="text-sm text-[--text-secondary] truncate">{prompt}</p>
                        </div>
                    </button>
                ))}
            </div>
        ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {currentNode.interaction.options.map((option, index) => (
                    <button key={index} onClick={() => handleOptionClick(option)} disabled={isLoading}
                    className="w-full text-left p-4 rounded-lg bg-[--hover-bg-color] hover:bg-[--border-color] transition-colors disabled:opacity-50 text-lg text-[--text-primary] text-center">
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
import React, { useState, useEffect, useCallback } from 'react';
// The unused 'Image as ImageIcon' has been removed from this line
import { Loader, AlertTriangle } from 'lucide-react';

// --- Types ---
interface StoryOption {
  text: string;
  leads_to: string;
}
interface StoryInteraction {
  type: string;
  options: StoryOption[];
}
interface StoryNode {
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

// --- New Component for Placeholder Image ---
const PlaceholderImage: React.FC<{ prompt: string }> = ({ prompt }) => {
  return (
    <div className="w-full h-full flex items-center justify-center bg-[#1e293b] rounded-lg p-4 overflow-hidden">
      <p className="text-white text-center text-lg break-words">{prompt}</p>
    </div>
  );
};

const StoryModeComponent: React.FC<StoryModeProps> = ({ topic, authToken, onStoryEnd }) => {
  const [currentNode, setCurrentNode] = useState<StoryNode | null>(null);
  const [history, setHistory] = useState<StoryHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchNextNode = useCallback(async (selectedOption: StoryOption | null = null) => {
    setIsLoading(true);
    setError(null);
    if (!authToken) {
      setError("Authentication is required.");
      setIsLoading(false);
      return;
    }
    const newHistory = [...history];
    if (selectedOption) {
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
        body: JSON.stringify({ topic, history: newHistory, leads_to: selectedOption ? selectedOption.leads_to : null }),
      });
      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Request failed`);
      }
      const data: StoryNode = await response.json();
      setHistory([...newHistory, { type: 'AI', text: data.dialogue }]);
      setCurrentNode(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  }, [topic, authToken, history]);

  useEffect(() => {
    if (topic && authToken) fetchNextNode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, authToken]);

  const handleOptionClick = (option: StoryOption) => {
    if (!option?.leads_to || option.leads_to.toLowerCase().includes('end')) {
      onStoryEnd();
      return;
    }
    fetchNextNode(option);
  };

  const renderContent = () => {
    if (isLoading && !currentNode) {
      return (
        <div className="flex flex-col h-screen items-center justify-center text-center p-10 animate-fadeIn">
          <Loader className="animate-spin h-12 w-12 text-[--accent-primary] mb-4" />
          <p className="text-lg text-[--text-secondary]">Crafting your interactive story about "{topic}"...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div className="flex flex-col h-screen items-center justify-center text-center p-10 bg-red-900/20 rounded-lg animate-fadeIn">
          <AlertTriangle className="h-12 w-12 text-red-400 mb-4" />
          <h3 className="text-xl font-semibold text-red-300">Error</h3>
          <p className="text-red-300/80">{error}</p>
        </div>
      );
    }

    if (!currentNode) return null;

    const isImageSelection = currentNode.interaction.type === "Image Selection";

    return (
      <div className="w-full max-w-4xl mx-auto p-4 animate-fadeIn flex flex-col h-screen">
        {/* --- Section 1: Dialogue (Top) --- */}
        <div className="flex-shrink-0 py-4">
          <div className="bg-[--background-secondary] p-6 rounded-lg shadow-xl">
            <p className="prose prose-invert max-w-none text-[--text-secondary] leading-relaxed text-lg text-center whitespace-pre-wrap">
              {currentNode.dialogue}
            </p>
          </div>
        </div>

        {/* --- Section 2: Media/Images (Middle, Flexible) --- */}
        <div className="flex-grow py-4 flex items-center justify-center min-h-0">
          {isImageSelection ? (
            <div className="w-full h-full grid grid-cols-1 md:grid-cols-2 gap-6">
              {currentNode.image_prompts.map((prompt, index) => (
                <button key={index} onClick={() => handleOptionClick(currentNode.interaction.options[index])} disabled={isLoading}
                  className="group rounded-lg transition-all duration-300 disabled:opacity-50 border-2 border-transparent hover:border-[--accent-primary] overflow-hidden shadow-lg hover:shadow-2xl transform hover:-translate-y-1">
                  <PlaceholderImage prompt={prompt} />
                </button>
              ))}
            </div>
          ) : (
            <div className="w-full h-full">
              {currentNode.image_prompts.length > 0 && <PlaceholderImage prompt={currentNode.image_prompts[0]} />}
            </div>
          )}
        </div>

        {/* --- Section 3: Options (Bottom) --- */}
        <div className="flex-shrink-0 py-4">
            {isLoading ? (
                <div className="flex justify-center mt-6"> <Loader className="animate-spin h-8 w-8 text-[--accent-primary]" /> </div>
            ) : (
                !isImageSelection && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {currentNode.interaction.options.map((option, index) => (
                        <button key={index} onClick={() => handleOptionClick(option)}
                            className="w-full p-4 rounded-lg bg-[--hover-bg-color] hover:bg-[--border-color] transition-colors text-lg text-[--text-primary] text-center">
                            {option.text}
                        </button>
                        ))}
                    </div>
                )
            )}
        </div>
      </div>
    );
  };

  return renderContent();
};

export default StoryModeComponent;
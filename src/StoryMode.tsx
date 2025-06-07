import React, { useState, useEffect, useCallback } from 'react';
import { Loader, AlertTriangle } from 'lucide-react';

// --- Types ---
interface StoryNode {
  ai_dialogue: string;
  user_option_1: string;
  user_option_2: string;
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

  const fetchNextNode = useCallback(async (selectedOption: string | null = null) => {
    setIsLoading(true);
    setError(null);

    if (!authToken) {
      setError("Authentication is required to start a story.");
      setIsLoading(false);
      return;
    }

    // Add the user's choice to the history before the next AI response
    const newHistory = [...history];
    if (selectedOption) {
      newHistory.push({ type: 'USER', text: selectedOption });
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
          history: newHistory, // Send the updated history
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Request failed with status ${response.status}`);
      }

      const data: StoryNode = await response.json();
      
      // Add the new AI dialogue to history and set the current node for display
      setHistory([...newHistory, { type: 'AI', text: data.ai_dialogue }]);
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

  // Initial fetch when the component mounts
  useEffect(() => {
    fetchNextNode();
  }, [topic, authToken]); // Dependency array simplified, fetchNextNode is stable

  const handleOptionClick = (optionText: string) => {
    // If the user clicks a "Thanks" button, end the story.
    if (optionText.toLowerCase().includes('thanks') || optionText.toLowerCase().includes('i get it')) {
      onStoryEnd();
      return;
    }
    fetchNextNode(optionText);
  };

  if (isLoading && !currentNode) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-10 animate-fadeIn">
        <Loader className="animate-spin h-12 w-12 text-[--accent-primary] mb-4" />
        <p className="text-lg text-[--text-secondary]">Crafting the beginning of your story about "{topic}"...</p>
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

  if (!currentNode) {
    return null; // Should not happen if error/loading states are handled
  }

  return (
    <div className="w-full max-w-4xl mx-auto p-4 animate-fadeIn">
      <div className="bg-[--background-secondary] p-6 rounded-lg shadow-xl">
        <div className="prose prose-invert max-w-none text-[--text-secondary] leading-relaxed text-lg mb-8">
          <p>{currentNode.ai_dialogue}</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={() => handleOptionClick(currentNode.user_option_1)}
            disabled={isLoading}
            className="w-full text-left p-4 rounded-lg bg-[--hover-bg-color] hover:bg-[--border-color] transition-colors disabled:opacity-50"
          >
            {currentNode.user_option_1}
          </button>
          <button
            onClick={() => handleOptionClick(currentNode.user_option_2)}
            disabled={isLoading}
            className="w-full text-left p-4 rounded-lg bg-[--hover-bg-color] hover:bg-[--border-color] transition-colors disabled:opacity-50"
          >
            {currentNode.user_option_2}
          </button>
        </div>
        {isLoading && (
          <div className="flex justify-center mt-6">
            <Loader className="animate-spin h-8 w-8 text-[--accent-primary]" />
          </div>
        )}
      </div>
    </div>
  );
};

export default StoryModeComponent;
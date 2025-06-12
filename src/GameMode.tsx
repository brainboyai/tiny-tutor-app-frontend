import React, { useState, useEffect, useCallback } from 'react';
import { Loader, AlertTriangle} from 'lucide-react';

const API_BASE_URL = 'https://tiny-tutor-app.onrender.com';

interface GameModeProps {
  topic: string;
  authToken: string | null;
  onGameEnd: () => void; // Function to call to return to the main screen
}

const GameModeComponent: React.FC<GameModeProps> = ({ topic, authToken, onGameEnd }) => {
  const [gameHtml, setGameHtml] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGame = useCallback(async () => {
    if (!authToken) {
      setError("Authentication is required to generate a game.");
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`${API_BASE_URL}/generate_game`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`,
        },
        body: JSON.stringify({ topic }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || `Request failed with status ${response.status}`);
      }

      const data = await response.json();
      if (!data.game_html) {
          throw new Error("The AI did not return valid game code.");
      }
      setGameHtml(data.game_html);

    } catch (err) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('An unknown error occurred while generating the game.');
      }
    } finally {
      setIsLoading(false);
    }
  }, [topic, authToken]);

  useEffect(() => {
    fetchGame();
  }, [fetchGame]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-10 animate-fadeIn">
        <Loader className="animate-spin h-12 w-12 text-[--accent-primary] mb-4" />
        <p className="text-lg text-[--text-secondary]">Your game about "{topic}" is being built by the AI...</p>
        <p className="text-sm text-[--text-tertiary] mt-2">This may take a moment.</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center text-center p-10 bg-red-900/20 rounded-lg animate-fadeIn">
        <AlertTriangle className="h-12 w-12 text-red-400 mb-4" />
        <h3 className="text-xl font-semibold text-red-300">Error Generating Game</h3>
        <p className="text-red-300/80 mb-6">{error}</p>
        <button
          onClick={onGameEnd}
          className="px-4 py-2 bg-[--accent-primary] hover:bg-[--accent-secondary] text-black rounded-lg transition-colors font-semibold"
        >
          Back to Home
        </button>
      </div>
    );
  }

  if (gameHtml) {
    return (
      <div className="w-full h-[calc(100vh-150px)] animate-fadeIn flex flex-col">
          <div className="flex-shrink-0 p-2 text-center">
              <h2 className="text-xl font-bold">Game Mode: <span className="text-[--accent-primary]">{topic}</span></h2>
          </div>
          <div className="flex-grow w-full h-full p-1 bg-black/20 rounded-lg">
            <iframe
                srcDoc={gameHtml}
                title={`Tiny Tutor Game - ${topic}`}
                className="w-full h-full border-0 rounded-md"
                sandbox="allow-scripts allow-pointer-lock allow-same-origin"
            />
          </div>
      </div>
    );
  }

  return null; // Should not be reached
};

export default GameModeComponent;
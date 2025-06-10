import React, { useState, useEffect, useCallback } from 'react';
import { Loader, AlertTriangle, ArrowLeft, Gamepad2 } from 'lucide-react';
import { useParams, useNavigate } from 'react-router-dom';

interface GameModeProps {
  authToken: string | null;
}

const API_BASE_URL = '[https://tiny-tutor-app.onrender.com](https://tiny-tutor-app.onrender.com)';

const GameModeComponent: React.FC<GameModeProps> = ({ authToken }) => {
  const { topic } = useParams<{ topic: string }>();
  const navigate = useNavigate();
  
  const [gameHtml, setGameHtml] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGame = useCallback(async () => {
    if (!topic || !authToken) {
      setError("Topic or authentication token is missing.");
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

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex flex-col items-center justify-center text-center p-10 animate-fadeIn">
          <Loader className="animate-spin h-12 w-12 text-[--accent-primary] mb-4" />
          <p className="text-lg text-[--text-secondary]">Building your custom game for "{topic}"...</p>
          <p className="text-sm text-[--text-tertiary]">This might take a moment!</p>
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
            onClick={() => navigate('/')}
            className="flex items-center px-4 py-2 bg-[--accent-primary] hover:bg-[--accent-secondary] text-black rounded-lg transition-colors font-semibold"
          >
            <ArrowLeft size={20} className="mr-2" /> Back to Home
          </button>
        </div>
      );
    }

    if (gameHtml) {
        return (
            <div className="w-full h-full flex flex-col bg-black rounded-lg overflow-hidden border border-[--border-color]">
                <iframe
                    srcDoc={gameHtml}
                    title={`Tiny Tutor Mini-Game: ${topic}`}
                    sandbox="allow-scripts" // Security: allows scripts to run inside the iframe but isolates them
                    className="w-full h-full flex-grow"
                    style={{ border: 'none' }}
                />
            </div>
        );
    }
    
    return null; // Should not be reached if logic is correct
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-4 animate-fadeIn h-[85vh] flex flex-col">
        <div className="flex justify-between items-center mb-4 flex-shrink-0">
            <div className="flex items-center">
                <Gamepad2 className="text-purple-400 mr-3" size={28}/>
                <h1 className="text-2xl font-bold text-[--text-primary] capitalize">
                    Game Mode: <span className="text-purple-400">{topic}</span>
                </h1>
            </div>
            <button
                onClick={() => navigate('/')}
                className="flex items-center px-4 py-2 bg-[--hover-bg-color] hover:bg-[--border-color] text-[--text-secondary] rounded-lg transition-colors font-semibold"
            >
                <ArrowLeft size={20} className="mr-2" /> End Game
            </button>
        </div>
        <div className="flex-grow w-full h-full">
            {renderContent()}
        </div>
    </div>
  );
};

export default GameModeComponent;
import React, { useState, useEffect } from 'react'; 
import { Heart, User, Home } from 'lucide-react';

// --- Helper Functions ---
const sanitizeWordForId = (word: string | undefined): string => { 
  if (typeof word !== 'string' || !word.trim()) {
    // console.warn("sanitizeWordForId received invalid word:", word);
    return `invalid_word_${Math.random().toString(36).substring(7)}`; 
  }
  return word.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
};


// --- Types --- 
interface CurrentUser {
  username: string;
  email: string;
  id: string;
}

// Assuming these types are defined in App.tsx or a shared types file
// and are consistent with what ProfilePageProps expects.
// For brevity, I'll list the ones directly used or crucial for context.
interface ParsedQuizQuestion {
  question: string;
  options: { [key: string]: string };
  correctOptionKey: string;
  explanation?: string;
}

interface QuizAttempt {
  question_index: number;
  selected_option_key: string;
  is_correct: boolean;
  timestamp: string;
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

interface StreakRecord {
  id: string; 
  words: string[];
  score: number;
  completed_at: string; 
}

interface UserProfileData {
  username: string;
  email: string;
  totalWordsExplored: number;
  exploredWords: { word: string; last_explored_at: string; is_favorite: boolean; first_explored_at?: string }[];
  favoriteWords: { word: string; last_explored_at: string; is_favorite: boolean; first_explored_at?: string }[];
  streakHistory: StreakRecord[];
}

interface ProfilePageProps {
  currentUser: CurrentUser;
  userProfileData: UserProfileData | null; 
  onWordSelect: (word: string) => void;
  onToggleFavorite: (word: string, currentStatus: boolean) => Promise<void>;
  onNavigateBack: () => void;
  generatedContent: GeneratedContent; 
}

const ProfilePageComponent: React.FC<ProfilePageProps> = ({
  currentUser,
  userProfileData,
  onWordSelect,
  onToggleFavorite,
  onNavigateBack,
  generatedContent
}) => {
  const [activeTab, setActiveTab] = useState<'explored' | 'favorites' | 'streaks'>('explored');

  useEffect(() => {
    console.log("ProfilePage received userProfileData:", userProfileData);
    if (userProfileData) {
        console.log("ProfilePage - Explored Words (count):", userProfileData.exploredWords?.length, userProfileData.exploredWords);
        console.log("ProfilePage - Favorite Words (count):", userProfileData.favoriteWords?.length, userProfileData.favoriteWords);
    }
  }, [userProfileData]);

  const renderWordItem = (wordData: { word: string; last_explored_at: string; is_favorite: boolean; first_explored_at?: string }, index: number, listName: string) => {
    console.log(`ProfilePage - ${listName} - Rendering item ${index}:`, wordData);
    if (!wordData || typeof wordData.word !== 'string' || !wordData.word.trim()) {
        console.warn(`ProfilePage - ${listName} - renderWordItem received invalid wordData at index ${index}:`, wordData);
        return <li key={`invalid-${listName}-${index}`} className="text-red-400 p-2">Error: Invalid word data item.</li>; 
    }
    const wordId = sanitizeWordForId(wordData.word); 
    const currentIsFavorite = generatedContent[wordId]?.is_favorite ?? wordData.is_favorite;

    return (
      <li key={wordId + (listName === 'Favorites' ? '-fav' : '-exp')} className="mb-3 p-3 bg-slate-700 rounded-lg shadow hover:bg-slate-600 transition-colors">
        <div className="flex justify-between items-center">
          <span
            className="text-sky-300 hover:text-sky-200 cursor-pointer font-medium flex-grow mr-2"
            onClick={() => onWordSelect(wordData.word)}
            title={`Explore "${wordData.word}"`}
          >
            {wordData.word}
          </span>
          <button
            onClick={() => onToggleFavorite(wordData.word, currentIsFavorite)}
            className={`p-1 rounded-full hover:bg-slate-500 transition-colors ${currentIsFavorite ? 'text-pink-500' : 'text-slate-400'}`}
            title={currentIsFavorite ? "Unfavorite" : "Favorite"}
          >
            <Heart size={18} fill={currentIsFavorite ? 'currentColor' : 'none'} />
          </button>
        </div>
        {wordData.last_explored_at && (
            <p className="text-xs text-slate-400 mt-1">
            Last explored: {new Date(wordData.last_explored_at).toLocaleDateString()}
            {wordData.first_explored_at && ` (First: ${new Date(wordData.first_explored_at).toLocaleDateString()})`}
            </p>
        )}
      </li>
    );
  };

  const renderStreakItem = (streak: StreakRecord) => (
    <li key={streak.id} className="mb-3 p-3 bg-slate-700 rounded-lg shadow">
      <div className="font-medium text-sky-300">Score: {streak.score}</div>
      {streak.completed_at && <p className="text-xs text-slate-400 mb-1">Completed: {new Date(streak.completed_at).toLocaleString()}</p>}
      <div className="text-sm text-slate-300">
        Words: {(streak.words || []).map((w, i) => (
          <span
            key={w + i} 
            className="hover:text-sky-200 cursor-pointer underline"
            onClick={() => {
                if (typeof w === 'string' && w.trim()) {
                    onWordSelect(w);
                } else {
                    console.warn("Attempted to select invalid word from streak:", w);
                }
            }}
          >
            {w || "N/A"}
          </span>
        )).reduce((prev, curr, index) => <>{prev}{index > 0 ? ' → ' : ''}{curr}</>, <></>)}
      </div>
    </li>
  );
  
  if (!userProfileData) { 
    return (
        <div className="p-4 md:p-6 bg-slate-800 text-slate-100 min-h-screen flex items-center justify-center">
            <p>Loading profile data...</p>
        </div>
    );
  }

  return (
    <div className="p-4 md:p-6 bg-slate-800 text-slate-100 min-h-screen">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-sky-400">Your Profile</h1>
          <button
            onClick={onNavigateBack}
            className="flex items-center px-4 py-2 bg-sky-500 hover:bg-sky-600 text-white rounded-lg transition-colors"
            title="Back to Word Explorer"
          >
            <Home size={20} className="mr-2" /> Back to Explorer
          </button>
        </div>

        <div className="bg-slate-700 p-6 rounded-lg shadow-xl mb-8">
          <div className="flex items-center mb-4">
            <User size={40} className="text-sky-400 mr-4" />
            <div>
              <h2 className="text-2xl font-semibold">{currentUser.username}</h2>
              <p className="text-slate-300">{currentUser.email}</p>
            </div>
          </div>
          <p className="text-slate-300">Total Words Explored: <span className="font-bold text-sky-300">{userProfileData.totalWordsExplored}</span></p>
        </div>

        <div className="mb-6">
          <div className="flex border-b border-slate-600">
            <button
              onClick={() => setActiveTab('explored')}
              className={`py-2 px-4 font-medium ${activeTab === 'explored' ? 'border-b-2 border-sky-400 text-sky-400' : 'text-slate-400 hover:text-sky-300'}`}
            >
              All Explored ({userProfileData.exploredWords?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('favorites')}
              className={`py-2 px-4 font-medium ${activeTab === 'favorites' ? 'border-b-2 border-sky-400 text-sky-400' : 'text-slate-400 hover:text-sky-300'}`}
            >
              Favorites ({userProfileData.favoriteWords?.length || 0})
            </button>
            <button
              onClick={() => setActiveTab('streaks')}
              className={`py-2 px-4 font-medium ${activeTab === 'streaks' ? 'border-b-2 border-sky-400 text-sky-400' : 'text-slate-400 hover:text-sky-300'}`}
            >
              Streak History ({userProfileData.streakHistory?.length || 0})
            </button>
          </div>
        </div>

        <div className="bg-slate-700 p-4 sm:p-6 rounded-lg shadow-xl min-h-[300px]">
          {activeTab === 'explored' && (
            <div>
              <h3 className="text-xl font-semibold mb-4 text-sky-300">All Explored Words</h3>
              {(userProfileData.exploredWords && userProfileData.exploredWords.length > 0) ? (
                <ul className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {userProfileData.exploredWords.map((wordData, index) => renderWordItem(wordData, index, "Explored"))}
                </ul>
              ) : (
                <p className="text-slate-400">No words explored yet. Start learning!</p>
              )}
            </div>
          )}
          {activeTab === 'favorites' && (
            <div>
              <h3 className="text-xl font-semibold mb-4 text-pink-400">Favorite Words</h3>
              {(userProfileData.favoriteWords && userProfileData.favoriteWords.length > 0) ? (
                <ul className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {userProfileData.favoriteWords.map((wordData, index) => renderWordItem(wordData, index, "Favorites"))}
                </ul>
              ) : (
                <p className="text-slate-400">You haven't favorited any words yet.</p>
              )}
            </div>
          )}
          {activeTab === 'streaks' && (
            <div>
              <h3 className="text-xl font-semibold mb-4 text-emerald-400">Streak History</h3>
              {(userProfileData.streakHistory && userProfileData.streakHistory.length > 0) ? (
                <ul className="max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
                  {userProfileData.streakHistory.map(renderStreakItem)}
                </ul>
              ) : (
                <p className="text-slate-400">No completed streaks yet. Keep learning to build them!</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ProfilePageComponent;

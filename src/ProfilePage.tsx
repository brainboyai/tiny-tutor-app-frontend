import React from 'react';
import { User, Home, Heart, Zap } from 'lucide-react';

// --- Types (No Changes) ---
interface CurrentUser { username: string; email: string; id: string; }
interface StreakRecord { id: string; words: string[]; score: number; completed_at: string; }
interface ExploredWordEntry { word: string; last_explored_at: string; is_favorite: boolean; first_explored_at?: string }
interface UserProfileData {
  username: string;
  email: string;
  tier?: string;
  totalWordsExplored: number;
  quiz_points?: number;
  total_quiz_questions_answered?: number;
  total_quiz_questions_correct?: number;
  exploredWords: ExploredWordEntry[];
  favoriteWords: ExploredWordEntry[];
  streakHistory: StreakRecord[];
}

interface ProfilePageProps {
  currentUser: CurrentUser;
  userProfileData: UserProfileData | null;
  onWordSelect: (word: string) => void;
  onNavigateBack: () => void;
  onToggleFavorite: (word: string, currentStatus: boolean) => void;
}

const UpgradePlaceholder: React.FC<{ message: string }> = ({ message }) => (
  <div className="text-center p-8 border-2 border-dashed border-[--border-color] rounded-lg bg-[--background-default]">
    <Zap className="mx-auto h-12 w-12 text-amber-500 mb-4" />
    <h4 className="text-lg font-semibold text-[--text-primary]">Unlock Pro Features</h4>
    <p className="text-[--text-tertiary]">{message}</p>
    <button className="mt-4 px-6 py-2 bg-amber-600 text-white font-bold rounded-lg hover:bg-amber-500 transition-colors">
      Upgrade to Pro
    </button>
  </div>
);


const ProfilePageComponent: React.FC<ProfilePageProps> = ({
  currentUser,
  userProfileData,
  onWordSelect,
  onNavigateBack,
  onToggleFavorite
}) => {
  const [activeTab, setActiveTab] = React.useState<'explored' | 'favorites' | 'streaks'>('explored');

  if (!userProfileData) {
    return (
      <div className="text-center p-10">
        <p>Loading profile data...</p>
      </div>
    );
  }

  const isProUser = userProfileData.tier === 'pro';

  const renderWordItem = (wordData: ExploredWordEntry) => {
    return (
      <li key={wordData.word} className="mb-3 p-4 bg-[--hover-bg-color] rounded-lg shadow-sm transition-colors hover:bg-[--border-color]">
        <div className="flex justify-between items-center">
          <button
            className="text-[--accent-primary] hover:text-[--accent-secondary] text-left font-medium flex-grow mr-2"
            onClick={() => onWordSelect(wordData.word)}
            title={`Explore "${wordData.word}"`}
          >
            {wordData.word}
          </button>
          <button onClick={() => onToggleFavorite(wordData.word, wordData.is_favorite)} className={`p-1.5 rounded-full hover:bg-slate-600 transition-colors ${wordData.is_favorite ?'text-pink-500':'text-[--text-tertiary]'}`} title={wordData.is_favorite?"Unfavorite":"Favorite"}>
            <Heart size={18} fill={wordData.is_favorite ?'currentColor':'none'}/>
          </button>
        </div>
        {wordData.last_explored_at && (
          <p className="text-xs text-[--text-tertiary] mt-1">
            Last explored: {new Date(wordData.last_explored_at).toLocaleDateString()}
          </p>
        )}
      </li>
    );
  };

  const renderStreakItem = (streak: StreakRecord) => (
    <li key={streak.id} className="mb-3 p-4 bg-[--hover-bg-color] rounded-lg shadow">
      <div className="font-medium text-[--accent-primary]">Score: {streak.score}</div>
      {streak.completed_at && <p className="text-xs text-[--text-tertiary] mb-2">Completed: {new Date(streak.completed_at).toLocaleString()}</p>}
      <div className="text-sm text-[--text-secondary] flex flex-wrap items-center gap-2">
        <span>Words:</span>
        {(streak.words || []).map((w, i) => (
          <React.Fragment key={w + i}>
            <button
              onClick={() => onWordSelect(w)}
              className="hover:text-[--accent-secondary] underline"
            >
              {w || "N/A"}
            </button>
            {i < streak.words.length - 1 && <span className="text-slate-500">→</span>}
          </React.Fragment>
        ))}
      </div>
    </li>
  );

  return (
    <div className="w-full">
      <div className="sticky top-0 z-10 bg-[--background-default] py-4 -mt-8 pt-8 mb-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold text-[--text-primary]">Your Profile</h1>
          <button
            onClick={onNavigateBack}
            className="flex items-center px-4 py-2 bg-[--accent-primary] hover:bg-[--accent-secondary] text-black rounded-lg transition-colors font-semibold"
          >
            <Home size={20} className="mr-2" /> Back to Explorer
          </button>
        </div>
      </div>

      <div className="bg-[--background-secondary] p-6 rounded-lg shadow-xl mb-8">
        <div className="flex items-center mb-4">
          <User size={40} className="text-[--accent-primary] mr-4" />
          <div>
            <h2 className="text-2xl font-semibold">{currentUser.username}</h2>
            <p className="text-[--text-tertiary]">{currentUser.email}</p>
          </div>
        </div>
        
        {/* CORRECTED: This entire block is now conditional */}
        {isProUser ? (
            <>
                <p className="text-[--text-secondary]">Total Words Explored: <span className="font-bold text-[--accent-primary]">{userProfileData.totalWordsExplored}</span></p>
                <div className="mt-4 pt-4 border-t border-[--border-color]">
                    <h3 className="text-lg font-semibold text-[--text-primary] mb-2">Quiz Stats</h3>
                    <p className="text-[--text-secondary]">Quiz Points: <span className="font-bold text-emerald-400">{userProfileData.quiz_points || 0}</span></p>
                    <p className="text-[--text-secondary]">Total Questions Answered: <span className="font-bold text-sky-300">{userProfileData.total_quiz_questions_answered || 0}</span></p>
                    <p className="text-[--text-secondary]">Correct Answers: <span className="font-bold text-green-400">{userProfileData.total_quiz_questions_correct || 0}</span></p>
                    {userProfileData.total_quiz_questions_answered && userProfileData.total_quiz_questions_answered > 0 ? (
                        <p className="text-[--text-secondary]">
                        Accuracy: <span className="font-bold text-amber-400">
                            {(((userProfileData.total_quiz_questions_correct || 0) / userProfileData.total_quiz_questions_answered) * 100).toFixed(1)}%
                        </span>
                        </p>
                    ) : (
                        <p className="text-[--text-secondary]">Accuracy: <span className="font-bold text-amber-400">N/A</span></p>
                    )}
                </div>
            </>
        ) : (
            <div className="mt-4 pt-4 border-t border-[--border-color]">
                 <UpgradePlaceholder message="Upgrade to Pro to track your quiz performance and learning stats." />
            </div>
        )}
      </div>

      <div className="mb-6">
        <div className="flex border-b border-[--border-color]">
          <button onClick={() => setActiveTab('explored')} className={`py-2 px-4 font-medium transition-colors ${activeTab === 'explored' ? 'border-b-2 border-[--accent-primary] text-[--accent-primary]' : 'text-[--text-tertiary] hover:text-[--text-primary]'}`}>
            All Explored ({isProUser ? userProfileData.exploredWords?.length : 0})
          </button>
          <button onClick={() => setActiveTab('favorites')} className={`py-2 px-4 font-medium transition-colors ${activeTab === 'favorites' ? 'border-b-2 border-pink-500 text-pink-500' : 'text-[--text-tertiary] hover:text-[--text-primary]'}`}>
            Favorites ({isProUser ? userProfileData.favoriteWords?.length : 0})
          </button>
          <button onClick={() => setActiveTab('streaks')} className={`py-2 px-4 font-medium transition-colors ${activeTab === 'streaks' ? 'border-b-2 border-emerald-500 text-emerald-500' : 'text-[--text-tertiary] hover:text-[--text-primary]'}`}>
            Streak History ({isProUser ? userProfileData.streakHistory?.length : 0})
          </button>
        </div>
      </div>

      <div className="bg-[--background-secondary] p-6 rounded-lg shadow-xl min-h-[400px]">
        {activeTab === 'explored' && (
          <div>
            <h3 className="text-xl font-semibold mb-4 text-[--text-primary]">All Explored Words</h3>
            {isProUser ? (
              (userProfileData.exploredWords && userProfileData.exploredWords.length > 0) ? (
                <ul className="max-h-[500px] overflow-y-auto pr-2">{userProfileData.exploredWords.map(word => renderWordItem(word))}</ul>
              ) : ( <p className="text-[--text-tertiary]">No words explored yet. Start learning!</p> )
            ) : ( <UpgradePlaceholder message="Upgrade to Pro to see and revisit every concept you've ever explored." /> )}
          </div>
        )}
        {activeTab === 'favorites' && (
          <div>
            <h3 className="text-xl font-semibold mb-4 text-pink-400">Favorite Words</h3>
            {isProUser ? (
              (userProfileData.favoriteWords && userProfileData.favoriteWords.length > 0) ? (
                <ul className="max-h-[500px] overflow-y-auto pr-2">{userProfileData.favoriteWords.map(word => renderWordItem(word))}</ul>
              ) : ( <p className="text-[--text-tertiary]">You haven't favorited any words yet.</p> )
            ) : ( <UpgradePlaceholder message="Upgrade to Pro to save your favorite concepts for quick access." /> )}
          </div>
        )}
        {activeTab === 'streaks' && (
          <div>
            <h3 className="text-xl font-semibold mb-4 text-emerald-400">Streak History</h3>
            {isProUser ? (
              (userProfileData.streakHistory && userProfileData.streakHistory.length > 0) ? (
                <ul className="max-h-[500px] overflow-y-auto pr-2">{userProfileData.streakHistory.map(renderStreakItem)}</ul>
              ) : ( <p className="text-[--text-tertiary]">No completed streaks yet. Keep learning to build them!</p> )
            ) : ( <UpgradePlaceholder message="Upgrade to Pro to track your learning streaks and review past sessions." /> )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProfilePageComponent;
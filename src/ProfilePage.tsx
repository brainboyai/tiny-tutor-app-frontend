import React, { useState, useEffect } from 'react';
import { Mail, ShieldCheck, TrendingUp, List, Star, CalendarDays, LogOut, ArrowLeft, Edit3, Save, XCircle } from 'lucide-react';

// Types (ensure these align with App.tsx and backend)
interface UserProfile {
  username: string;
  email?: string;
  tier?: string;
  total_words_explored?: number;
  explored_words?: WordHistoryEntry[];
  favorite_words?: WordHistoryEntry[];
  streak_history?: StreakEntry[];
  created_at?: string;
}

interface WordHistoryEntry {
  id: string; // sanitized word
  word: string; // original word
  first_explored_at: string;
  last_explored_at: string;
  is_favorite: boolean;
  // content and modes_generated might also be here if needed directly on profile
}

interface StreakEntry {
  id: string;
  date: string;
  words_explored_count: number;
}

interface ProfilePageProps {
  userProfile: UserProfile | null;
  onNavigateBack: () => void;
  onLogout: () => void;
  fetchUserProfile: () => void;
  onWordClick: (word: string) => void;
}

const formatDate = (dateString?: string) => {
  if (!dateString) return 'N/A';
  try {
    // Attempt to parse, assuming ISO 8601 or a format Date constructor understands
    const date = new Date(dateString);
    if (isNaN(date.getTime())) { // Check if date is valid
        return 'Invalid Date';
    }
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch (e) {
    console.error("Error formatting date:", dateString, e);
    return 'Invalid Date';
  }
};

const ProfilePage: React.FC<ProfilePageProps> = ({ userProfile, onNavigateBack, onLogout, fetchUserProfile, onWordClick }) => {
  const [isEditingUsername, setIsEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState(userProfile?.username || '');
  const [editError, setEditError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setNewUsername(userProfile.username);
    }
  }, [userProfile]);

  const handleUsernameUpdate = async () => {
    if (!newUsername.trim() || newUsername.trim() === userProfile?.username) {
      setIsEditingUsername(false);
      setEditError(null);
      return;
    }
    setIsLoading(true);
    setEditError(null);
    
    console.log("Attempting to update username to:", newUsername.trim());
    setTimeout(() => { 
        fetchUserProfile();
        setIsEditingUsername(false);
        setIsLoading(false);
    }, 1000);
  };

  if (!userProfile) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col items-center justify-center p-4">
        <p className="text-slate-700 text-lg">Loading profile or not logged in...</p>
        <button
          onClick={onNavigateBack}
          className="mt-4 flex items-center bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-4 rounded-md transition-colors"
        >
          <ArrowLeft size={18} className="mr-2" />
          Back to App
        </button>
      </div>
    );
  }

  const sortWordsByLastExplored = (words: WordHistoryEntry[] | undefined): WordHistoryEntry[] => {
    if (!Array.isArray(words)) return [];
    return [...words].sort((a, b) => {
        // Ensure last_explored_at are valid dates for comparison
        const dateA = a.last_explored_at ? new Date(a.last_explored_at).getTime() : 0;
        const dateB = b.last_explored_at ? new Date(b.last_explored_at).getTime() : 0;
        if (isNaN(dateA) || isNaN(dateB)) return 0; // Handle invalid dates gracefully
        return dateB - dateA; // Sort descending (newest first)
    });
  };
  
  const exploredWords = sortWordsByLastExplored(userProfile.explored_words);
  // Favorite words are derived by backend, but if frontend needs to filter and sort:
  // const favoriteWords = sortWordsByLastExplored(userProfile.favorite_words || userProfile.explored_words?.filter(w => w.is_favorite));
  // Assuming backend provides favorite_words already filtered, so just sort it:
  const favoriteWords = sortWordsByLastExplored(userProfile.favorite_words);
  const streakHistory = Array.isArray(userProfile.streak_history) ? userProfile.streak_history : [];


  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 p-4 sm:p-6 md:p-8">
      <header className="mb-6 sm:mb-8 flex items-center justify-between">
        <button
          onClick={onNavigateBack}
          className="flex items-center text-sm text-purple-600 hover:text-purple-800 font-medium transition-colors p-2 rounded-md hover:bg-purple-100"
        >
          <ArrowLeft size={20} className="mr-1.5" />
          Back to App
        </button>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-700">Your Profile</h1>
        <button
          onClick={onLogout}
          className="flex items-center text-sm text-red-500 hover:text-red-700 font-medium transition-colors p-2 rounded-md hover:bg-red-100"
        >
          <LogOut size={18} className="mr-1.5" />
          Logout
        </button>
      </header>

      <div className="max-w-4xl mx-auto space-y-6 sm:space-y-8">
        {/* User Info Card */}
        <div className="bg-white p-5 sm:p-6 rounded-xl shadow-lg">
          <div className="flex flex-col sm:flex-row items-center">
            <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-purple-500 flex items-center justify-center text-white text-3xl sm:text-4xl font-bold mb-4 sm:mb-0 sm:mr-6 shrink-0">
              {userProfile.username.substring(0, 1).toUpperCase()}
            </div>
            <div className="text-center sm:text-left flex-grow">
              {isEditingUsername ? (
                <div className="flex items-center space-x-2">
                  <input
                    type="text" value={newUsername} onChange={(e) => setNewUsername(e.target.value)}
                    className="p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-lg" autoFocus
                  />
                  <button onClick={handleUsernameUpdate} disabled={isLoading} className="p-2 bg-green-500 hover:bg-green-600 text-white rounded-md disabled:opacity-50"><Save size={20} /></button>
                  <button onClick={() => { setIsEditingUsername(false); setNewUsername(userProfile.username); setEditError(null); }} className="p-2 bg-slate-300 hover:bg-slate-400 text-slate-700 rounded-md"><XCircle size={20} /></button>
                </div>
              ) : (
                <div className="flex items-center">
                  <h2 className="text-2xl sm:text-3xl font-semibold text-slate-800 break-all">{userProfile.username}</h2>
                  <button onClick={() => setIsEditingUsername(true)} title="Edit username" className="ml-2 p-1 text-slate-500 hover:text-purple-600 shrink-0"><Edit3 size={16} /></button>
                </div>
              )}
              {editError && <p className="text-xs text-red-500 mt-1">{editError}</p>}
              <p className="text-slate-600 flex items-center mt-1 break-all"><Mail size={14} className="mr-2 text-slate-500 shrink-0" /> {userProfile.email || 'No email provided'}</p>
              <p className="text-slate-500 flex items-center mt-1 capitalize"><ShieldCheck size={14} className="mr-2 text-slate-500 shrink-0" /> Tier: {userProfile.tier || 'Free'}</p>
              <p className="text-xs text-slate-400 mt-1">Joined: {formatDate(userProfile.created_at)}</p>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div className="bg-white p-5 rounded-xl shadow-lg flex items-center">
                <TrendingUp size={28} className="mr-4 text-purple-500 shrink-0" />
                <div>
                    <p className="text-3xl font-bold text-slate-700">{userProfile.total_words_explored || 0}</p>
                    <p className="text-sm text-slate-500">Total Words Explored</p>
                </div>
            </div>
            <div className="bg-white p-5 rounded-xl shadow-lg flex items-center">
                <CalendarDays size={28} className="mr-4 text-orange-500 shrink-0" />
                <div>
                    <p className="text-3xl font-bold text-slate-700">{streakHistory.length > 0 ? `Current: ${streakHistory[streakHistory.length -1].words_explored_count} words` : 'N/A'}</p>
                    <p className="text-sm text-slate-500">Current Streak (Backend TBD)</p>
                </div>
            </div>
        </div>

        {/* Explored Words Section */}
        <div className="bg-white p-5 sm:p-6 rounded-xl shadow-lg">
          <h3 className="text-xl font-semibold text-slate-700 mb-4 flex items-center"><List size={22} className="mr-2 text-purple-500" /> Explored Words ({exploredWords.length})</h3>
          {exploredWords.length > 0 ? (
            <ul className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-2">
              {exploredWords.map(word => (
                <li key={word.id} className="p-3 bg-slate-50 rounded-md hover:bg-slate-100 transition-colors flex justify-between items-center">
                  <button 
                    onClick={() => onWordClick(word.word)} 
                    className="font-medium text-purple-600 hover:text-purple-800 hover:underline text-left"
                  >
                    {word.word}
                  </button>
                  <span className="text-xs text-slate-500 whitespace-nowrap">Last seen: {formatDate(word.last_explored_at)}</span>
                </li>
              ))}
            </ul>
          ) : (<p className="text-slate-500">You haven't explored any words yet. Start searching!</p>)}
        </div>

        {/* Favorite Words Section */}
        <div className="bg-white p-5 sm:p-6 rounded-xl shadow-lg">
          <h3 className="text-xl font-semibold text-slate-700 mb-4 flex items-center"><Star size={22} className="mr-2 text-yellow-500" /> Favorite Words ({favoriteWords.length})</h3>
          {favoriteWords.length > 0 ? (
            <ul className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar pr-2">
              {favoriteWords.map(word => (
                <li key={word.id} className="p-3 bg-slate-50 rounded-md hover:bg-slate-100 transition-colors flex justify-between items-center">
                   <button 
                    onClick={() => onWordClick(word.word)} 
                    className="font-medium text-purple-600 hover:text-purple-800 hover:underline text-left"
                  >
                    {word.word}
                  </button>
                  <span className="text-xs text-slate-500 whitespace-nowrap">Favorited: {formatDate(word.last_explored_at)}</span>
                </li>
              ))}
            </ul>
          ) : (<p className="text-slate-500">No favorite words yet. Click the heart icon on words you like!</p>)}
        </div>
        
        <div className="bg-white p-5 sm:p-6 rounded-xl shadow-lg">
          <h3 className="text-xl font-semibold text-slate-700 mb-4 flex items-center"><CalendarDays size={22} className="mr-2 text-green-500" /> Streak History (Backend Not Implemented)</h3>
          {streakHistory.length > 0 ? (
             <ul className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar pr-2">
             {streakHistory.slice(-10).reverse().map(streak => ( 
               <li key={streak.id} className="p-3 bg-slate-50 rounded-md text-sm">
                 Date: {formatDate(streak.date)}, Words: {streak.words_explored_count}
               </li>
             ))}
           </ul>
          ) : (<p className="text-slate-500">Your activity streak will be shown here once backend support is added.</p>)}
        </div>

        <div className="bg-white p-5 sm:p-6 rounded-xl shadow-lg">
          <h3 className="text-xl font-semibold text-slate-700 mb-3">Achievements (Coming Soon!)</h3>
          <p className="text-slate-500">Unlock badges and celebrate your learning milestones.</p>
        </div>

        <div className="bg-white p-5 sm:p-6 rounded-xl shadow-lg">
            <h3 className="text-xl font-semibold text-slate-700 mb-4">Account Settings</h3>
            <button onClick={onLogout} className="w-full sm:w-auto bg-red-500 hover:bg-red-600 text-white font-semibold py-2.5 px-6 rounded-md transition-colors flex items-center justify-center">
                <LogOut size={18} className="mr-2" /> Logout
            </button>
        </div>
      </div>
    </div>
  );
};

export default ProfilePage;

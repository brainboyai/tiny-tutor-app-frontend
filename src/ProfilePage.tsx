// ProfilePage.tsx (Corrected File - ensure filename is ProfilePage.tsx)
import React from 'react';
import { User as UserIcon, Mail, BookOpen, Star, ListChecks, ArrowLeft, RefreshCw, Heart, XCircle } from 'lucide-react';

interface CurrentUser {
    username: string;
    email: string;
    id: string;
}

interface WordHistoryEntry {
    id: string;
    word: string;
    last_explored_at: string | Date;
    is_favorite: boolean;
    first_explored_at?: string | Date;
}

interface StreakHistoryEntry {
    id: string;
    words: string[];
    score: number;
    completed_at: string | Date;
}

interface UserProfileData {
    exploredWords: WordHistoryEntry[];
    favoriteWords: WordHistoryEntry[];
    streakHistory: StreakHistoryEntry[];
    totalWordsExplored: number;
    isLoading: boolean;
    error: string | null;
    username?: string;
    email?: string;
}

interface ProfilePageProps {
    currentUser: CurrentUser | null;
    userProfileData: UserProfileData;
    onSelectWord: (word: string) => void;
    onNavigateBack: () => void;
    onRefreshProfile: () => void;
}

const formatDate = (dateInput: string | Date): string => {
    if (!dateInput) return 'N/A';
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

const ProfilePage: React.FC<ProfilePageProps> = ({
    currentUser,
    userProfileData,
    onSelectWord,
    onNavigateBack,
    onRefreshProfile,
}) => {

    if (userProfileData.isLoading && !userProfileData.username) {
        return (
            <div className="flex-grow container mx-auto px-4 sm:px-6 py-8 flex flex-col items-center justify-center">
                <RefreshCw size={48} className="animate-spin text-sky-500 mb-4" />
                <p className="text-xl text-slate-600 dark:text-slate-300">Loading Profile...</p>
            </div>
        );
    }

    if (userProfileData.error && !userProfileData.username) {
        return (
            <div className="flex-grow container mx-auto px-4 sm:px-6 py-8 flex flex-col items-center justify-center text-center">
                <XCircle size={48} className="text-red-500 mb-4" />
                <p className="text-xl text-red-600 dark:text-red-400">Error loading profile</p>
                <p className="text-slate-500 dark:text-slate-400 mb-4">{userProfileData.error}</p>
                <button
                    onClick={onRefreshProfile}
                    className="mt-4 bg-sky-500 hover:bg-sky-600 text-white font-semibold py-2 px-4 rounded-lg transition flex items-center"
                >
                    <RefreshCw size={18} className="mr-2" /> Try Again
                </button>
                <button
                    onClick={onNavigateBack}
                    className="mt-2 text-sky-600 dark:text-sky-400 hover:underline"
                >
                    Back to Main
                </button>
            </div>
        );
    }

    if (!currentUser && !userProfileData.username) {
        return (
            <div className="flex-grow container mx-auto px-4 sm:px-6 py-8 flex flex-col items-center justify-center text-center">
                <UserIcon size={48} className="text-slate-400 mb-4" />
                <p className="text-xl text-slate-600 dark:text-slate-300">Please login to view your profile.</p>
                <button
                    onClick={onNavigateBack}
                    className="mt-4 text-sky-600 dark:text-sky-400 hover:underline"
                >
                    Back to Main
                </button>
            </div>
        );
    }

    const renderWordItem = (item: WordHistoryEntry, isFavoriteList: boolean = false) => (
        <li key={item.id || item.word} className="p-3 sm:p-4 bg-white dark:bg-slate-700 dark:bg-opacity-50 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-150 border border-slate-200 dark:border-slate-600">
            <div className="flex justify-between items-center">
                <button
                    onClick={() => onSelectWord(item.word)}
                    className="text-sky-600 dark:text-sky-400 hover:underline font-semibold text-left capitalize text-base sm:text-lg"
                >
                    {item.word}
                </button>
                {!isFavoriteList && (
                    item.is_favorite ? <Heart size={18} className="text-pink-500 dark:text-pink-400" fill="currentColor" /> : <Heart size={18} className="text-slate-400 dark:text-slate-500" />
                )}
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                Last Explored: {formatDate(item.last_explored_at)}
            </p>
        </li>
    );

    const renderStreakItem = (streak: StreakHistoryEntry) => (
        <li key={streak.id} className="p-3 sm:p-4 bg-white dark:bg-slate-700 dark:bg-opacity-50 rounded-lg shadow-sm border border-slate-200 dark:border-slate-600">
            <p className="font-semibold text-base sm:text-lg text-slate-700 dark:text-slate-200">
                Streak Score: <span className="text-sky-600 dark:text-sky-400">{streak.score}</span>
            </p>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mb-1.5">
                Completed: {formatDate(streak.completed_at)}
            </p>
            <div className="flex flex-wrap gap-1.5">
                {streak.words.map((word, index) => (
                    <button
                        key={`${streak.id}-word-${index}`}
                        onClick={() => onSelectWord(word)}
                        className="text-xs capitalize bg-slate-100 dark:bg-slate-600 text-slate-700 dark:text-slate-200 px-2 py-1 rounded-md hover:bg-slate-200 dark:hover:bg-slate-500 transition-colors"
                    >
                        {word}
                    </button>
                ))}
            </div>
        </li>
    );

    return (
        <div className="flex-grow container mx-auto px-2 sm:px-4 md:px-6 py-6 sm:py-8">
            <header className="mb-6 sm:mb-8 flex items-center justify-between">
                <div className="flex items-center">
                    <button
                        onClick={onNavigateBack}
                        className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors mr-2 sm:mr-4"
                        aria-label="Back to main"
                    >
                        <ArrowLeft size={22} className="text-slate-700 dark:text-slate-200" />
                    </button>
                    <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 dark:text-slate-100">Your Profile</h1>
                </div>
                <button
                    onClick={onRefreshProfile}
                    disabled={userProfileData.isLoading}
                    className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors text-slate-600 dark:text-slate-300 disabled:opacity-50"
                    title="Refresh Profile Data"
                    aria-label="Refresh Profile Data"
                >
                    <RefreshCw size={20} className={userProfileData.isLoading ? 'animate-spin' : ''} />
                </button>
            </header>

            {userProfileData.error && (
                <div className="mb-4 p-3 bg-red-100 dark:bg-red-900 dark:bg-opacity-30 border border-red-300 dark:border-red-600 rounded-lg text-red-700 dark:text-red-300 text-sm">
                    Error refreshing profile data: {userProfileData.error}
                </div>
            )}

            {/* User Info Section */}
            <section className="mb-6 sm:mb-8 p-4 sm:p-6 bg-white dark:bg-slate-800 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700">
                <div className="flex items-center mb-3 sm:mb-4">
                    <UserIcon size={24} className="text-sky-500 mr-3" />
                    <h2 className="text-xl sm:text-2xl font-semibold text-slate-700 dark:text-slate-100">
                        {userProfileData.username || currentUser?.username || 'User'}
                    </h2>
                </div>
                <div className="flex items-center text-sm sm:text-base text-slate-600 dark:text-slate-300 mb-2">
                    <Mail size={18} className="mr-2.5 text-slate-400 dark:text-slate-500" />
                    <span>{userProfileData.email || currentUser?.email || 'No email provided'}</span>
                </div>
                <div className="flex items-center text-sm sm:text-base text-slate-600 dark:text-slate-300">
                    <BookOpen size={18} className="mr-2.5 text-slate-400 dark:text-slate-500" />
                    <span>Total Words Explored: <span className="font-bold">{userProfileData.totalWordsExplored || 0}</span></span>
                </div>
            </section>

            {/* Profile Sections in a Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 sm:gap-8">
                {/* All Explored Words */}
                <section className="xl:col-span-1 bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 flex flex-col">
                    <div className="flex items-center mb-3 sm:mb-4">
                        <ListChecks size={20} className="text-sky-500 mr-2.5" />
                        <h3 className="text-lg sm:text-xl font-semibold text-slate-700 dark:text-slate-200">All Explored Words</h3>
                    </div>
                    {userProfileData.exploredWords && userProfileData.exploredWords.length > 0 ? (
                        <ul className="space-y-2.5 sm:space-y-3 overflow-y-auto flex-grow max-h-[50vh] sm:max-h-[60vh] pr-1 app-scrollbar">
                            {userProfileData.exploredWords.map(item => renderWordItem(item))}
                        </ul>
                    ) : (
                        <p className="text-slate-500 dark:text-slate-400 text-sm text-center py-4">No words explored yet. Start learning!</p>
                    )}
                </section>

                {/* Favorite Words */}
                <section className="xl:col-span-1 bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 flex flex-col">
                    <div className="flex items-center mb-3 sm:mb-4">
                        <Star size={20} className="text-yellow-500 dark:text-yellow-400 mr-2.5" />
                        <h3 className="text-lg sm:text-xl font-semibold text-slate-700 dark:text-slate-200">Favorite Words</h3>
                    </div>
                    {userProfileData.favoriteWords && userProfileData.favoriteWords.length > 0 ? (
                        <ul className="space-y-2.5 sm:space-y-3 overflow-y-auto flex-grow max-h-[50vh] sm:max-h-[60vh] pr-1 app-scrollbar">
                            {userProfileData.favoriteWords.map(item => renderWordItem(item, true))}
                        </ul>
                    ) : (
                        <p className="text-slate-500 dark:text-slate-400 text-sm text-center py-4">You haven't favorited any words yet.</p>
                    )}
                </section>

                {/* Streak History */}
                <section className="lg:col-span-2 xl:col-span-1 bg-white dark:bg-slate-800 p-4 sm:p-5 rounded-xl shadow-lg border border-slate-200 dark:border-slate-700 flex flex-col">
                    <div className="flex items-center mb-3 sm:mb-4">
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-green-500 dark:text-green-400 mr-2.5">
                            <path fillRule="evenOdd" d="M12.963 2.286a.75.75 0 00-1.071 1.056 9.75 9.75 0 014.262 1.234 1.125 1.125 0 01-1.065 1.962A8.25 8.25 0 009.75 9.75c0 1.036.232 2.03.64 2.952-.313-.086-.636-.16-.972-.236a.75.75 0 00-.86.499l-.523 1.046a.75.75 0 00.282.952l4.077 2.826a.75.75 0 001-.077l1.805-2.406a.75.75 0 00-.326-1.008A12.031 12.031 0 0012.963 2.286z" clipRule="evenOdd" />
                            <path fillRule="evenOdd" d="M11.037 2.286a.75.75 0 011.071 1.056 9.75 9.75 0 00-4.262 1.234 1.125 1.125 0 001.065 1.962A8.25 8.25 0 0114.25 9.75c0 1.036-.232 2.03-.64 2.952.313-.086.636-.16.972-.236a.75.75 0 01.86.499l.523 1.046a.75.75 0 01-.282.952l-4.077 2.826a.75.75 0 01-1 .077l-1.805-2.406a.75.75 0 01.326-1.008A12.031 12.031 0 0111.037 2.286z" clipRule="evenOdd" />
                        </svg>
                        <h3 className="text-lg sm:text-xl font-semibold text-slate-700 dark:text-slate-200">Streak History</h3>
                    </div>
                    {userProfileData.streakHistory && userProfileData.streakHistory.length > 0 ? (
                        <ul className="space-y-3 sm:space-y-4 overflow-y-auto flex-grow max-h-[50vh] sm:max-h-[60vh] pr-1 app-scrollbar">
                            {userProfileData.streakHistory.map(renderStreakItem)}
                        </ul>
                    ) : (
                        <p className="text-slate-500 dark:text-slate-400 text-sm text-center py-4">No completed streaks (score 2+) yet.</p>
                    )}
                </section>
            </div>
        </div>
    );
};

export default ProfilePage;
/ src/types.ts

// --- User and Profile Related Types ---
export interface UserProfile {
  username: string;
  email?: string;
  tier?: string;
  total_words_explored?: number;
  explored_words?: WordHistoryEntry[];
  favorite_words?: WordHistoryEntry[]; // Derived by backend from explored_words
  streak_history?: StreakEntry[];     // From backend's /profile
  created_at?: string;
}

export interface WordHistoryEntry {
  id: string; // sanitized word
  word: string; // original word
  first_explored_at: string;
  last_explored_at: string;
  is_favorite: boolean;
  modes_generated?: string[];
  quiz_progress?: QuizAttempt[];
  content?: Partial<WordContent>; // For frontend caching of fetched content per word
}

export interface StreakEntry { // Aligned with backend's /profile response for streak_history
  id: string;
  words: string[]; // Array of words in this streak segment
  score: number;   // Score for this streak segment
  completed_at: string; // Timestamp when this streak segment was completed/saved
}

export interface LiveStreak { // For frontend tracking of an ongoing streak
  score: number;
  words: string[];
}

// --- Word Content and Quiz Related Types ---
export interface WordContent { // Content for a specific word/mode
  explain?: string;
  image?: string; // URL or base64 string
  fact?: string;
  quiz?: QuizQuestion[]; // Array of questions
  deep_dive?: string;
}

export interface QuizQuestion { // Structure of a single quiz question from backend
  question: string;
  options: { [key: string]: string }; // e.g., { "A": "Option A", "B": "Option B" }
  correct_answer_key: string;
  explanation?: string; // Explanation for the correct answer
}

export interface QuizAnswer { // For frontend state tracking of user's answers in current quiz
  questionIndex: number;
  selectedOptionKey: string;
  isCorrect: boolean;
}

export interface QuizAttempt { // For storing user's attempt history (as per backend)
  question_index: number;
  selected_option_key: string;
  is_correct: boolean;
  timestamp: string;
}

// --- App View and Mode Types ---
export type AppView = 'main' | 'profile' | 'auth';
export type ContentMode = 'explain' | 'image' | 'fact' | 'quiz' | 'deep_dive';

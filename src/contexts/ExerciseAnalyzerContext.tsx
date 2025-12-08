import React, { createContext, useContext, ReactNode } from 'react';
import { useExerciseAnalyzer } from '../hooks/useExerciseAnalyzer';

// Create the context
const ExerciseAnalyzerContext = createContext<ReturnType<typeof useExerciseAnalyzer> | null>(null);

// Provider component
export const ExerciseAnalyzerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const exerciseAnalyzer = useExerciseAnalyzer();

  return (
    <ExerciseAnalyzerContext.Provider value={exerciseAnalyzer}>
      {children}
    </ExerciseAnalyzerContext.Provider>
  );
};

// Custom hook to use the context
export const useExerciseAnalyzerContext = () => {
  const context = useContext(ExerciseAnalyzerContext);

  if (!context) {
    throw new Error('useExerciseAnalyzerContext must be used within an ExerciseAnalyzerProvider');
  }

  return context;
};

// Re-export old names for backwards compatibility during migration
/** @deprecated Use ExerciseAnalyzerProvider instead */
export const SwingAnalyzerProvider = ExerciseAnalyzerProvider;
/** @deprecated Use useExerciseAnalyzerContext instead */
export const useSwingAnalyzerContext = useExerciseAnalyzerContext;

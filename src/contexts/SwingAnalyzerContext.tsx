import type React from 'react';
import { createContext, type ReactNode, useContext } from 'react';
import { useSwingAnalyzer } from '../hooks/useSwingAnalyzer';

// Create the context
const SwingAnalyzerContext = createContext<ReturnType<
  typeof useSwingAnalyzer
> | null>(null);

// Provider component
export const SwingAnalyzerProvider: React.FC<{ children: ReactNode }> = ({
  children,
}) => {
  const swingAnalyzer = useSwingAnalyzer();

  return (
    <SwingAnalyzerContext.Provider value={swingAnalyzer}>
      {children}
    </SwingAnalyzerContext.Provider>
  );
};

// Custom hook to use the context
export const useSwingAnalyzerContext = () => {
  const context = useContext(SwingAnalyzerContext);

  if (!context) {
    throw new Error(
      'useSwingAnalyzerContext must be used within a SwingAnalyzerProvider'
    );
  }

  return context;
};

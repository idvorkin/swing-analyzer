import React, { createContext, useContext, ReactNode } from 'react';
import { useSwingAnalyzerV2 } from '../hooks/useSwingAnalyzerV2';

// Create the context
const SwingAnalyzerContext = createContext<ReturnType<typeof useSwingAnalyzerV2> | null>(null);

// Provider component
export const SwingAnalyzerProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const swingAnalyzer = useSwingAnalyzerV2();
  
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
    throw new Error('useSwingAnalyzerContext must be used within a SwingAnalyzerProvider');
  }
  
  return context;
}; 
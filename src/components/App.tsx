import React from 'react';
import { Link, Route, Routes } from 'react-router-dom';
import { SwingAnalyzerProvider } from '../contexts/SwingAnalyzerContext';
import AnalysisSection from './AnalysisSection';
import VideoSection from './VideoSection';
import './App.css';
import DebugModelLoaderPage from './DebugModelLoaderPage';

// Component for the main application layout and functionality
const MainApplication: React.FC = () => {
  console.log('MainApplication: Component rendering started.');
  
  return (
    <>
      <header>
        <h1>Swing Analyzer</h1>
      </header>

      <main>
        <VideoSection />
        <AnalysisSection />
      </main>
    </>
  );
};

// Main App component that sets up routing
export const App: React.FC = () => {
  console.log('App: Component rendering started, setting up routes.');
  
  return (
    <SwingAnalyzerProvider>
      <Routes>
        <Route path="/" element={<MainApplication />} />
        <Route path="/debug" element={<DebugModelLoaderPage />} />
      </Routes>
      <footer>
        <nav>
          <Link to="/">Home</Link> | <Link to="/debug">Debug Model Loader</Link>
        </nav>
      </footer>
    </SwingAnalyzerProvider>
  );
};

// If you want to keep the existing export default, you can alias it or change it.
// For simplicity, if App is the main export, we can do:
export default App;

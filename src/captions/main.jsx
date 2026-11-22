import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import CaptionsApp from './CaptionsApp.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import '../styles/tokens.css';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <CaptionsApp />
    </ErrorBoundary>
  </StrictMode>,
);

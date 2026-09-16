import React from 'react';
import './SpeakingIndicator.css';

interface SpeakingIndicatorProps {
  isPlaying: boolean;
  children: React.ReactNode;
}

const SpeakingIndicator: React.FC<SpeakingIndicatorProps> = ({ isPlaying, children }) => {
  return (
    <div className={`speaking-indicator ${isPlaying ? 'playing' : ''}`}>
      <div className="speaking-indicator-content">
        {children}
      </div>
    </div>
  );
};

export default SpeakingIndicator;
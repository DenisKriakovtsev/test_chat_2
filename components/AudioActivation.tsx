'use client';
import { useEffect } from "react";

const AudioActivation = () => {
  useEffect(() => {
    const activateAudio = () => {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('audioActivated', 'true');
        window.removeEventListener('click', activateAudio);
      }
    };
    window.addEventListener('click', activateAudio);
    return () => window.removeEventListener('click', activateAudio);
  }, []);
  return null;
};

export default AudioActivation; 
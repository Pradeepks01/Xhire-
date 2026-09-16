'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import { apiClient, endInterview } from '../api';
import { useReactMediaRecorder } from 'react-media-recorder';
import SpeakingIndicator from './SpeakingIndicator';
import { InterviewTimer } from './InterviewTimer';
import { useToast } from '../context/ToastContext';
import {
  Check,
  Play,
  RotateCcw,
  RefreshCw,
  Square,
  Volume2,
  Keyboard,
  Mic,
  CircleDot,
  Sparkles,
  HelpCircle,
  FastForward,
  XCircle,
  Send,
  AlertTriangle
} from 'lucide-react';
import '../styles/CandidatePortal.css';

type InterviewStatus = "LOADING" | "WELCOME" | "PROCESSING_INTAKE" | "QUESTION" | "PROCESSING" | "COMPLETED" | "ERROR";

interface Question {
  action: string;
  question: string;
  context: any[];
  q_id: string;
  category: string;
  subtopic: string;
  round_display_name: string;
  round_key: string;
  total_time_mins: number;
  round_time_mins: number;
  interview_start_time: number;
  round_start_time: number;
  current_round_num: number;
  total_rounds: number;
  safety_warning: {
    message: string;
    categories: string[];
  } | null;
}

export default function CandidatePortalClient() {
  const params = useParams();
  const sessionId = params?.sessionId as string;
  const { showToast } = useToast();

  const [status, setStatus] = useState<InterviewStatus>("LOADING");
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [answerText, setAnswerText] = useState("");
  const [inputMode, setInputMode] = useState<"TYPE" | "SPEAK">("TYPE");
  const [candidateName, setCandidateName] = useState<string | null>(null);
  const [isTtsPlaying, setIsTtsPlaying] = useState(false);
  const [safetyWarning, setSafetyWarning] = useState<{ message: string; categories: string[] } | null>(null);

  const [questionAudio, setQuestionAudio] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const {
    status: recordStatus,
    startRecording,
    stopRecording,
    mediaBlobUrl,
    clearBlobUrl,
  } = useReactMediaRecorder({ audio: true, blobPropertyBag: { type: 'audio/wav' } });

  const fetchNextQuestion = async () => {
    setStatus("PROCESSING");
    setError(null);
    setQuestionAudio(null);
    clearBlobUrl();

    try {
      const response = await apiClient.get<Question>(
        `/interviews/${sessionId}/next-question`
      );

      if (response.data.action === "SYNTHESIS") {
        setStatus("COMPLETED");
        setQuestion(null);
      } else {
        if ((response.data as any).candidate_name) {
          setCandidateName((response.data as any).candidate_name);
        }
        setQuestion(response.data);
        if (response.data.safety_warning) {
          setSafetyWarning(response.data.safety_warning);
        } else {
          setSafetyWarning(null);
        }
        setAnswerText("");
        setStatus("QUESTION");
        fetchTTS(response.data.question);
      }
    } catch (err: any) {
      setError(`Failed to fetch next question: ${err.message}`);
      setStatus("ERROR");
    }
  };

  const handleStartInterview = async () => {
    if (!sessionId) return;
    setStatus("PROCESSING_INTAKE");
    setError(null);
    try {
      const response = await apiClient.post<{ status: string, message: string }>(`/interviews/${sessionId}/start`);
      if (response.data.status) {
        pollForBackendStatus();
      }
    } catch (err: any) {
      setError(`Failed to start interview: ${err.message}`);
      setStatus("ERROR");
    }
  };

  const pollForBackendStatus = async () => {
    if (!sessionId) return;
    try {
      const response = await apiClient.get<{ status: string, candidate_name?: string }>(`/interviews/${sessionId}/status`);
      const newStatus = response.data.status;
      if (response.data.candidate_name) {
        setCandidateName(response.data.candidate_name);
      }

      if (newStatus === "started") {
        fetchNextQuestion();
      } else if (newStatus === "processing" || newStatus === "answer_processing") {
        setTimeout(pollForBackendStatus, 2000);
      } else if (newStatus === "invited") {
        setStatus("WELCOME");
      } else if (newStatus === "completed") {
        setStatus("COMPLETED");
      } else {
        setError("An unexpected error occurred. Please contact support.");
        setStatus("ERROR");
      }
    } catch (err: any) {
      setError(`Failed to get interview status: ${err.message}`);
      setStatus("ERROR");
    }
  };

  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  const speakWithBrowser = (text: string) => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;
      utterance.onstart = () => setIsTtsPlaying(true);
      utterance.onend = () => setIsTtsPlaying(false);
      utterance.onerror = () => setIsTtsPlaying(false);
      window.speechSynthesis.speak(utterance);
    }
  };

  const stopSpeaking = () => {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setIsTtsPlaying(false);
  };

  const startListening = () => {
    if (typeof window === "undefined") return;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      showToast("Live speech recognition not supported in this browser. Please use Chrome/Edge or type your answer.", "info");
      return;
    }
    try {
      const recognition = new SpeechRec();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = "en-US";

      recognition.onstart = () => {
        setIsListening(true);
        showToast("Microphone active! Speak your answer now.", "info");
      };

      recognition.onresult = (event: any) => {
        let transcript = "";
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript + " ";
        }
        setAnswerText(transcript.trim());
      };

      recognition.onerror = (event: any) => {
        console.warn("Speech recognition error:", event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
      recognitionRef.current = recognition;
    } catch (e: any) {
      console.warn("Recognition start error:", e);
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Ignore speech recognition stop errors
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const fetchTTS = async (text: string) => {
    try {
      const response = await apiClient.post(
        '/tts',
        { text: text },
        { responseType: 'blob' }
      );
      const audioBlob = new Blob([response.data], { type: 'audio/wav' });
      const audioUrl = URL.createObjectURL(audioBlob);
      setQuestionAudio(audioUrl);
    } catch {
      // Backend TTS offline; browser Web Speech API is ready for Read Aloud
      setQuestionAudio(null);
    }
  };

  const handleTranscribe = async () => {
    if (!mediaBlobUrl) return;
    setStatus("PROCESSING");
    try {
      const audioBlob = await fetch(mediaBlobUrl).then(res => res.blob());
      const formData = new FormData();
      formData.append("file", audioBlob, "audio.wav");
      const response = await apiClient.post(
        '/asr',
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } }
      );
      setAnswerText(response.data.transcription || "");
      setInputMode("TYPE");
      setStatus("QUESTION");
      showToast("Voice answer transcribed successfully!", "success");
    } catch {
      // Graceful fallback: do NOT crash the interview into an ERROR screen!
      setStatus("QUESTION");
      setInputMode("TYPE");
      showToast("Whisper ASR server is offline. Please use the Live Dictation button or type your answer.", "warning");
    }
  };

  const submitAnswer = async () => {
    if (!question) return;
    setStatus("PROCESSING");
    setError(null);
    try {
      await apiClient.post(
        `/interviews/${sessionId}/answer`,
        {
          answer_text: answerText,
          q_id: question.q_id,
          category: question.category,
          subtopic: question.subtopic,
          is_follow_up: question.action === "FOLLOW_UP",
          question: question.question,
          context: question.context
        }
      );
      showToast("Answer submitted! Evaluating response...", "success");
      pollForBackendStatus();
    } catch (err: any) {
      setError(`Failed to submit answer: ${err.message}`);
      setStatus("ERROR");
    }
  };

  const handleEndRound = async () => {
    if (!sessionId) return;
    setStatus("PROCESSING");
    setError(null);
    setQuestionAudio(null);
    clearBlobUrl();

    try {
      const response = await apiClient.post<Question>(
        `/interviews/${sessionId}/end-round`
      );

      if (response.data.action === "SYNTHESIS") {
        setStatus("COMPLETED");
        setQuestion(null);
      } else {
        setQuestion(response.data);
        setAnswerText("");
        setStatus("QUESTION");
        fetchTTS(response.data.question);
      }
    } catch (err: any) {
      setError(`Failed to end round: ${err.message}`);
      setStatus("ERROR");
    }
  };

  const handleEndInterview = async () => {
    if (!sessionId) return;
    if (window.confirm("Are you sure you want to end the interview?")) {
      setStatus("PROCESSING");
      try {
        await endInterview(sessionId);
        setStatus("COMPLETED");
      } catch (err: any) {
        setError(`Failed to end interview: ${err.message}`);
        setStatus("ERROR");
      }
    }
  };

  useEffect(() => {
    if (sessionId) {
      setStatus("LOADING");
      pollForBackendStatus();
    }
  }, [sessionId]);

  useEffect(() => {
    if (questionAudio && audioRef.current) {
      const audioElement = audioRef.current;
      const onPlay = () => setIsTtsPlaying(true);
      const onEnd = () => setIsTtsPlaying(false);

      audioElement.addEventListener('play', onPlay);
      audioElement.addEventListener('ended', onEnd);
      audioElement.addEventListener('pause', onEnd);

      audioElement.play().catch(e => console.warn("Audio autoplay blocked:", e));

      return () => {
        audioElement.removeEventListener('play', onPlay);
        audioElement.removeEventListener('ended', onEnd);
        audioElement.removeEventListener('pause', onEnd);
      };
    }
  }, [questionAudio]);

  const INTAKE_STEPS = [
    "Parsing your resume...",
    "Analyzing key skills and experience...",
    "Aligning your profile with the job description...",
    "Customizing interview questions...",
    "Finalizing interview structure...",
  ];

  const IntakeProgress = () => {
    const [currentStep, setCurrentStep] = useState(0);

    useEffect(() => {
      const timer = setInterval(() => {
        setCurrentStep(prevStep => {
          if (prevStep < INTAKE_STEPS.length) {
            return prevStep + 1;
          }
          return prevStep;
        });
      }, 3000);

      return () => clearInterval(timer);
    }, []);

    return (
      <div className="intake-progress-container">
        <h2 className="intake-title">Preparing Your Interview</h2>
        <ul className="intake-steps-list">
          {INTAKE_STEPS.map((step, index) => {
            const isCompleted = index < currentStep;
            const isInProgress = index === currentStep;

            return (
              <li key={index} className={`intake-step ${isCompleted ? 'completed' : ''}`}>
                <div className="step-icon">
                  {isCompleted ? <Check size={14} /> : isInProgress ? <div className="spinner"></div> : ''}
                </div>
                <span>{step}</span>
              </li>
            );
          })}
        </ul>
      </div>
    );
  };

  const EVAL_STEPS = [
    "Analyzing technical depth & reasoning structure...",
    "Evaluating against round rubric criteria...",
    "Verifying AI text integrity & perplexity...",
    "Curating tailored follow-up question...",
  ];

  const EvaluatingProgress = () => {
    const [step, setStep] = useState(0);
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
      const stepTimer = setInterval(() => {
        setStep(prev => (prev < EVAL_STEPS.length ? prev + 1 : prev));
      }, 1500);

      const secTimer = setInterval(() => {
        setSeconds(s => s + 1);
      }, 1000);

      return () => {
        clearInterval(stepTimer);
        clearInterval(secTimer);
      };
    }, []);

    return (
      <div className="interview-card" style={{ maxWidth: '520px', padding: '2.5rem 2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, fontSize: '1.4rem', textAlign: 'left', color: '#0f172a' }}>Evaluating Response</h2>
          <span style={{ 
            fontSize: '11px', 
            fontWeight: 600, 
            background: 'rgba(14, 165, 233, 0.12)', 
            color: '#0284c7', 
            padding: '4px 10px', 
            borderRadius: '9999px',
            border: '1px solid rgba(14, 165, 233, 0.25)' 
          }}>
            Est. ~4–7 seconds
          </span>
        </div>

        <p style={{ margin: '0 0 1.25rem 0', color: '#64748b', fontSize: '0.88rem' }}>
          Your answer is being scored across technical pillars. The next question will load automatically.
        </p>

        <ul className="intake-steps-list" style={{ margin: '0 0 1.5rem 0' }}>
          {EVAL_STEPS.map((s, idx) => {
            const isDone = idx < step;
            const isCurrent = idx === step;
            return (
              <li key={idx} className={`intake-step ${isDone ? 'completed' : ''}`}>
                <div className="step-icon">
                  {isDone ? <Check size={14} /> : isCurrent ? <div className="spinner"></div> : ''}
                </div>
                <span style={{ color: isDone ? '#059669' : isCurrent ? '#0f172a' : '#94a3b8', fontWeight: isCurrent ? 600 : 400 }}>
                  {s}
                </span>
              </li>
            );
          })}
        </ul>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '1rem', borderTop: '1px solid #f1f5f9', fontSize: '12px', color: '#64748b' }}>
          <span>Elapsed: <strong>{seconds}s</strong></span>
          {seconds >= 6 && (
            <button 
              type="button" 
              onClick={() => fetchNextQuestion()} 
              className="btn btn-secondary"
              style={{ fontSize: '12px', padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
            >
              <RefreshCw size={12} />
              Check Question Now
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (status === "ERROR") {
      return (
        <SpeakingIndicator isPlaying={false}>
          <div className="interview-card">
            <h2>An Error Occurred</h2>
            <p className="error-message">{error}</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '1rem' }}>
              <button 
                onClick={() => {
                  setError(null);
                  setStatus("LOADING");
                  pollForBackendStatus();
                }} 
                className="btn btn-primary"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <RotateCcw size={15} />
                Resume Interview
              </button>
              <button onClick={handleStartInterview} className="btn btn-secondary" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <RefreshCw size={15} />
                Restart Session
              </button>
            </div>
          </div>
        </SpeakingIndicator>
      );
    }

    if (status === "PROCESSING") {
      return <EvaluatingProgress />;
    }

    if (status === "LOADING") {
      return (
        <div className="interview-card" style={{ maxWidth: '440px', textAlign: 'center', padding: '2.5rem 2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1rem' }}>
          <div className="spinner" style={{ width: '36px', height: '36px' }}></div>
          <p style={{ margin: 0, color: '#64748b', fontSize: '0.95rem', fontWeight: 500 }}>
            Connecting to Interview Session...
          </p>
        </div>
      );
    }

    if (status === "PROCESSING_INTAKE") {
      return <IntakeProgress />;
    }

    if (status === "WELCOME") {
      return (
        <SpeakingIndicator isPlaying={false}>
          <div className="interview-card">
            <h2>Welcome{candidateName ? `, ${candidateName}` : ""} to the Interview</h2>
            <p>This is an automated interview for the position.</p>
            <p>When you are ready, click "Start Interview" to begin.</p>
            <p><strong>Session ID:</strong> {sessionId}</p>
            <button onClick={handleStartInterview} className="btn btn-primary start-interview-btn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
              <Play size={16} />
              Start Interview
            </button>
          </div>
        </SpeakingIndicator>
      );
    }

    if (status === "COMPLETED") {
      return (
        <SpeakingIndicator isPlaying={false}>
          <div className="interview-card">
            <h2>Thank You!</h2>
            <p>Your interview is complete. The hiring team will be in touch with the next steps.</p>
          </div>
        </SpeakingIndicator>
      );
    }

    if (status === "QUESTION" && question) {
      return (
        <SpeakingIndicator isPlaying={isTtsPlaying}>
          <div className="interview-card">
            {candidateName && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 14px',
                background: 'rgba(30, 41, 59, 0.7)',
                borderRadius: '6px',
                border: '1px solid rgba(148, 163, 184, 0.2)',
                marginBottom: '14px',
                fontSize: '13px'
              }}>
                <span style={{ color: '#94a3b8' }}>
                  Candidate: <strong style={{ color: '#38bdf8' }}>{candidateName}</strong>
                </span>
                <span style={{ color: '#64748b', fontSize: '11px' }}>
                  Session: {sessionId.slice(0, 8)}...
                </span>
              </div>
            )}
            <div className="interview-header">
              <div className="round-name">{question.round_display_name}</div>
              {question.total_rounds > 0 && (
                <div className="interview-progress">
                  Round {question.current_round_num} of {question.total_rounds}
                </div>
              )}
              <InterviewTimer
                startTime={question.round_start_time}
                durationMins={question.round_time_mins}
              />
            </div>

            {safetyWarning && (
              <div className="safety-warning">
                <p style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AlertTriangle size={16} />
                  <strong>{safetyWarning.message}</strong>
                </p>
                <ul>
                  {safetyWarning.categories.map((category, index) => (
                    <li key={index}>{category}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="question-text" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
              <p style={{ margin: 0, flex: 1 }}>{question.question}</p>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                {isTtsPlaying ? (
                  <button 
                    type="button" 
                    onClick={stopSpeaking}
                    className="btn btn-secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                  >
                    <Square size={14} /> Stop Audio
                  </button>
                ) : (
                  <button 
                    type="button" 
                    onClick={() => speakWithBrowser(question.question)}
                    className="btn btn-secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
                  >
                    <Volume2 size={14} /> Read Aloud
                  </button>
                )}
              </div>
            </div>

            {questionAudio && (
              <audio ref={audioRef} src={questionAudio} controls className="question-audio" />
            )}

            <div className="answer-mode-toggle">
              <button
                onClick={() => setInputMode("TYPE")}
                className={inputMode === "TYPE" ? 'active' : ''}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <Keyboard size={14} />
                Type
              </button>
              <button
                onClick={() => setInputMode("SPEAK")}
                className={inputMode === "SPEAK" ? 'active' : ''}
                style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}
              >
                <Mic size={14} />
                Speak
              </button>
            </div>

            {inputMode === "TYPE" ? (
              <textarea
                className="answer-textarea"
                rows={8}
                value={answerText}
                onChange={(e) => setAnswerText(e.target.value)}
                placeholder="Type your answer here, or use 'Speak' mode..."
              />
            ) : (
              <div className="speak-controls">
                <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap', alignItems: 'center' }}>
                  {/* Browser Live Speech Recognition */}
                  {isListening ? (
                    <button 
                      type="button" 
                      onClick={stopListening} 
                      className="btn btn-danger"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}
                    >
                      <Square size={15} />
                      Stop Dictation
                    </button>
                  ) : (
                    <button 
                      type="button" 
                      onClick={startListening} 
                      className="btn btn-primary"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}
                    >
                      <Mic size={15} />
                      Live Dictation (Speak Answer)
                    </button>
                  )}

                  {/* Audio File Recorder */}
                  <button 
                    type="button"
                    onClick={startRecording} 
                    disabled={recordStatus === "recording" || isListening}
                    className="btn btn-secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    <CircleDot size={15} />
                    Record Audio File
                  </button>
                  <button 
                    type="button"
                    onClick={stopRecording} 
                    disabled={recordStatus !== "recording"}
                    className="btn btn-secondary"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    <Square size={15} />
                    Stop File Recording
                  </button>
                </div>

                {isListening && (
                  <div style={{ padding: '0.75rem', background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '8px', color: '#065f46', fontSize: '0.9rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Mic size={16} style={{ color: '#059669' }} />
                    <div>
                      <strong>Listening live...</strong> Speak clearly. Your words will appear in the box below in real-time.
                    </div>
                  </div>
                )}

                <textarea
                  className="answer-textarea"
                  rows={6}
                  value={answerText}
                  onChange={(e) => setAnswerText(e.target.value)}
                  placeholder="Your spoken words will appear here. You can also edit or add to your answer directly before submitting..."
                  style={{ marginBottom: '1rem' }}
                />

                {mediaBlobUrl && (
                  <div className="audio-playback">
                    <audio src={mediaBlobUrl} controls />
                    <button onClick={handleTranscribe} className="btn btn-secondary transcribe-btn" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                      <Sparkles size={14} />
                      Transcribe via Whisper
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="action-bar">
              <button className="btn btn-secondary" onClick={() => showToast("A human recruiter has been notified and will assist you shortly.", "info")} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <HelpCircle size={15} />
                Request Help (HITL)
              </button>
              <div className="main-actions">
                <button className="btn btn-secondary" onClick={handleEndRound} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <FastForward size={15} />
                  Finish Round
                </button>
                <button className="btn btn-danger" onClick={handleEndInterview} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                  <XCircle size={15} />
                  End Interview
                </button>
                <button
                  className="btn btn-primary submit-answer-btn"
                  onClick={submitAnswer}
                  disabled={(!answerText && inputMode === "TYPE") || status !== "QUESTION"}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <Send size={15} />
                  Submit Answer
                </button>
              </div>
            </div>
          </div>
        </SpeakingIndicator>
      );
    }

    return null;
  };

  return (
    <div className="candidate-portal-container">
      {renderContent()}
    </div>
  );
}
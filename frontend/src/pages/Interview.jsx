import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Send, Clock, CheckCircle, Mic, MicOff, Volume2, VolumeX } from 'lucide-react';

export default function Interview() {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState(location.state?.interviewState || null);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [scoring, setScoring] = useState(false);
  
  // Voice & Metrics State
  const [isVoiceEnabled, setIsVoiceEnabled] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [metrics, setMetrics] = useState({ totalSpeakingTime: 0, fillerWordCount: 0 });
  const [speechSupported, setSpeechSupported] = useState(true);

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const speakingStartRef = useRef(null);
  
  const inputRef = useRef(input);
  useEffect(() => { inputRef.current = input; }, [input]);
  
  const isListeningRef = useRef(isListening);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

  useEffect(() => {
    if (!state) {
      navigate('/');
      return;
    }
    
    if (state.transcript.length === 0) {
      handleChat("Hello, I am ready to begin.");
    }
    
    // Initialize Speech Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      
      recognition.onstart = () => {
        setIsListening(true);
        speakingStartRef.current = Date.now();
      };
      
      recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';
        
        for (let i = 0; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            finalTranscript += event.results[i][0].transcript;
          } else {
            interimTranscript += event.results[i][0].transcript;
          }
        }
        
        setInput(finalTranscript + interimTranscript);
        
        // Silence Detection (2 seconds)
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
        silenceTimerRef.current = setTimeout(() => {
          recognition.stop();
          if (inputRef.current.trim()) {
            const msg = inputRef.current;
            setInput('');
            handleChat(msg);
          }
        }, 2000);
      };
      
      recognition.onerror = (e) => {
        console.error("Speech recognition error:", e.error);
        setIsListening(false);
      };
      
      recognition.onend = () => {
        setIsListening(false);
        if (speakingStartRef.current) {
          const duration = (Date.now() - speakingStartRef.current) / 1000;
          setMetrics(prev => ({ ...prev, totalSpeakingTime: prev.totalSpeakingTime + duration }));
          speakingStartRef.current = null;
        }
      };
      
      recognitionRef.current = recognition;
    } else {
      setSpeechSupported(false);
    }
    
    return () => {
      if (recognitionRef.current) recognitionRef.current.stop();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      window.speechSynthesis.cancel();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state?.transcript, isTyping]);

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => prev + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const speakText = (text) => {
    if (!isVoiceEnabled || !('speechSynthesis' in window)) return;
    
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      // Auto-listen after 500ms
      setTimeout(() => {
        if (recognitionRef.current && !isListeningRef.current) {
          try { recognitionRef.current.start(); } catch(e) {}
        }
      }, 500);
    };
    
    window.speechSynthesis.speak(utterance);
  };

  const toggleMic = () => {
    if (!recognitionRef.current) return;
    if (isListening) {
      recognitionRef.current.stop();
    } else {
      setInput(''); // Clear input when manually starting mic
      try { recognitionRef.current.start(); } catch(e) {}
    }
  };

  const handleChat = async (userMessage) => {
    if (!state) return;
    
    // Stop listening/timers if active
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current && isListeningRef.current) recognitionRef.current.stop();

    // Count filler words
    const fillers = (userMessage.match(/\b(um|uh|like|you know)\b/gi) || []).length;
    setMetrics(prev => ({ ...prev, fillerWordCount: prev.fillerWordCount + fillers }));

    if (userMessage !== "Hello, I am ready to begin.") {
      setState(prev => ({
        ...prev,
        transcript: [...prev.transcript, { role: 'student', content: userMessage }],
        history: [...prev.history, { role: 'user', content: userMessage }]
      }));
    }

    setIsTyping(true);
    setTimeLeft(0); 

    let nextStage = state.stage;
    const qCount = Math.floor(state.history.length / 2);
    if (qCount === 1) nextStage = "role-specific";
    else if (qCount === 5) nextStage = "behavioral";
    else if (qCount >= 6) nextStage = "closing";

    const payloadState = { ...state, stage: nextStage };
    if (userMessage !== "Hello, I am ready to begin.") {
        payloadState.history = [...payloadState.history, { role: 'user', content: userMessage }];
        payloadState.transcript = [...payloadState.transcript, { role: 'student', content: userMessage }];
    }

    try {
      const res = await fetch('http://localhost:3001/api/interview/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, state: payloadState })
      });
      const data = await res.json();
      
      setState(prev => ({
        ...prev,
        stage: nextStage,
        transcript: data.newTranscript,
        history: data.newHistory
      }));
      
      if (data.aiMessage) {
        speakText(data.aiMessage);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsTyping(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isTyping) return;
    const msg = input;
    setInput('');
    handleChat(msg);
  };

  const finishInterview = async () => {
    if (!confirm("Are you sure you want to finish the interview and get your score?")) return;
    setScoring(true);
    
    // Pass metrics to backend by attaching to state
    const finalState = { ...state, metrics };
    
    try {
      const res = await fetch('http://localhost:3001/api/interview/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: finalState })
      });
      const data = await res.json();
      navigate(`/report/${data.id}`);
    } catch (err) {
      console.error(err);
      setScoring(false);
    }
  };

  if (!state) return null;

  const getStageDisplay = () => {
    switch (state.stage) {
      case 'warm-up': return 'Introduction';
      case 'role-specific': return 'Role Specific';
      case 'behavioral': return 'Behavioral (STAR)';
      case 'closing': return 'Wrap Up';
      default: return 'Interview';
    }
  };

  return (
    <div className="interview-container">
      <div className="interview-header">
        <div>
          <h2 style={{ fontSize: '1.2rem', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            {state.role}
            <button 
              className="btn btn-secondary" 
              style={{ padding: '4px', borderRadius: '50%', background: 'transparent', border: 'none', color: isVoiceEnabled ? 'var(--text-primary)' : 'var(--text-secondary)' }}
              onClick={() => {
                if (isVoiceEnabled) window.speechSynthesis.cancel();
                setIsVoiceEnabled(!isVoiceEnabled);
              }}
              title={isVoiceEnabled ? "Mute Interviewer" : "Unmute Interviewer"}
            >
              {isVoiceEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          </h2>
          <span className="stage-indicator">{getStageDisplay()}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="timer" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={16} /> {formatTime(timeLeft)}
          </div>
          <button className="btn btn-primary" onClick={finishInterview} disabled={isTyping || scoring} style={{ padding: '0.5rem 1rem' }}>
            {scoring ? 'Scoring...' : <><CheckCircle size={16} /> Finish</>}
          </button>
        </div>
      </div>

      <div className="chat-box">
        {state.transcript.map((msg, i) => (
          <div key={i} className={`message message-${msg.role}`}>
            <div className="message-bubble" style={{ position: 'relative' }}>
              {msg.content}
              {msg.role === 'interviewer' && isSpeaking && i === state.transcript.length - 1 && (
                <span style={{
                  display: 'inline-block',
                  marginLeft: '8px',
                  width: '8px',
                  height: '8px',
                  backgroundColor: 'var(--accent-primary)',
                  borderRadius: '50%',
                  animation: 'pulse 1.5s infinite'
                }}></span>
              )}
            </div>
          </div>
        ))}
        {isTyping && (
          <div className="message message-interviewer">
            <div className="typing-indicator">
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
              <div className="typing-dot"></div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {!speechSupported && (
        <div style={{ fontSize: '0.8rem', color: 'var(--error-color)', padding: '0 1.5rem', marginBottom: '0.5rem' }}>
          * Speech recognition is not supported in this browser. Please type your answers.
        </div>
      )}

      <form className="chat-input-container" onSubmit={handleSubmit} style={{ alignItems: 'flex-end' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <textarea 
            className="chat-input"
            placeholder={isListening ? "Listening..." : "Type your answer here... (Press Enter to send)"}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            disabled={isTyping || isListening}
            style={{ width: '100%' }}
          />
        </div>
        
        {speechSupported && (
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={toggleMic}
            disabled={isTyping}
            style={{ height: '60px', width: '60px', padding: 0, position: 'relative' }}
          >
            {isListening ? (
              <>
                <Mic size={24} color="var(--error-color)" />
                <span style={{
                  position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px',
                  backgroundColor: 'var(--error-color)', borderRadius: '50%', animation: 'pulse 1.5s infinite'
                }}></span>
              </>
            ) : <MicOff size={24} />}
          </button>
        )}

        <button type="submit" className="btn btn-primary" disabled={!input.trim() || isTyping || isListening} style={{ height: '60px', width: '60px', padding: 0 }}>
          <Send size={24} />
        </button>
      </form>
    </div>
  );
}

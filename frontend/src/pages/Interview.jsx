import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Send, Clock, CheckCircle } from 'lucide-react';

export default function Interview() {
  const location = useLocation();
  const navigate = useNavigate();
  const [state, setState] = useState(location.state?.interviewState || null);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [scoring, setScoring] = useState(false);
  const messagesEndRef = useRef(null);

  useEffect(() => {
    if (!state) {
      navigate('/');
      return;
    }
    
    // Kick off with first interviewer message if transcript is empty
    if (state.transcript.length === 0) {
      handleChat("Hello, I am ready to begin.");
    }
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

  const handleChat = async (userMessage) => {
    if (!state) return;
    
    // Optimistic UI for user message (if it's not the auto-greeting)
    if (userMessage !== "Hello, I am ready to begin.") {
      setState(prev => ({
        ...prev,
        transcript: [...prev.transcript, { role: 'student', content: userMessage }],
        history: [...prev.history, { role: 'user', content: userMessage }]
      }));
    }

    setIsTyping(true);
    setTimeLeft(0); // Reset timer per question

    // Stage progression logic (simple heuristic based on history length)
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
    try {
      const res = await fetch('http://localhost:3001/api/interview/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state })
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
          <h2 style={{ fontSize: '1.2rem', margin: 0 }}>{state.role}</h2>
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
            <div className="message-bubble">
              {msg.content}
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

      <form className="chat-input-container" onSubmit={handleSubmit}>
        <textarea 
          className="chat-input"
          placeholder="Type your answer here... (Press Enter to send)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          disabled={isTyping}
        />
        <button type="submit" className="btn btn-primary" disabled={!input.trim() || isTyping} style={{ alignSelf: 'flex-end', height: '60px', width: '60px', padding: 0 }}>
          <Send size={24} />
        </button>
      </form>
    </div>
  );
}

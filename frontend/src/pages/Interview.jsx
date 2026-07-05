import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Send, Clock, CheckCircle, Mic, MicOff, Volume2, VolumeX, Camera, CameraOff } from 'lucide-react';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

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
  
  // Phase 3: Video Tracking State
  const [cameraStatus, setCameraStatus] = useState('prompt'); // prompt, granted, denied
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const faceLandmarkerRef = useRef(null);
  const requestAnimationFrameRef = useRef(null);
  const trackingDataRef = useRef({ framesProcessed: 0, facesDetected: 0, eyeContactFrames: 0, lastNosePos: null, totalMovement: 0 });
  const [bodyMetricsTimeline, setBodyMetricsTimeline] = useState([]);

  const messagesEndRef = useRef(null);
  const recognitionRef = useRef(null);
  const silenceTimerRef = useRef(null);
  const speakingStartRef = useRef(null);
  
  const inputRef = useRef(input);
  useEffect(() => { inputRef.current = input; }, [input]);
  
  const isListeningRef = useRef(isListening);
  useEffect(() => { isListeningRef.current = isListening; }, [isListening]);

  // Handle Camera Permission and Setup
  const initializeCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      setCameraStatus('granted');
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      
      // Setup Recording
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'video/webm' });
      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      mediaRecorderRef.current.start();
      
      // Setup MediaPipe
      const vision = await FilesetResolver.forVisionTasks(
        "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
      );
      faceLandmarkerRef.current = await FaceLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
          delegate: "GPU"
        },
        outputFaceBlendshapes: true,
        runningMode: "VIDEO",
        numFaces: 1
      });
      
      // Start Tracking Loop
      let lastVideoTime = -1;
      const predictWebcam = () => {
        if (videoRef.current && faceLandmarkerRef.current && videoRef.current.currentTime !== lastVideoTime) {
          lastVideoTime = videoRef.current.currentTime;
          const results = faceLandmarkerRef.current.detectForVideo(videoRef.current, performance.now());
          
          const t = trackingDataRef.current;
          t.framesProcessed++;
          
          if (results.faceLandmarks && results.faceLandmarks.length > 0) {
            t.facesDetected++;
            const landmarks = results.faceLandmarks[0];
            const nose = landmarks[1];
            
            if (t.lastNosePos) {
              const dx = nose.x - t.lastNosePos.x;
              const dy = nose.y - t.lastNosePos.y;
              t.totalMovement += Math.sqrt(dx*dx + dy*dy);
            }
            t.lastNosePos = { x: nose.x, y: nose.y };
            
            if (results.faceBlendshapes && results.faceBlendshapes.length > 0) {
              const shapes = results.faceBlendshapes[0].categories;
              const getScore = (name) => shapes.find(s => s.categoryName === name)?.score || 0;
              const lookDown = (getScore('eyeLookDownLeft') + getScore('eyeLookDownRight')) / 2;
              const lookOut = (getScore('eyeLookOutLeft') + getScore('eyeLookOutRight')) / 2;
              const lookIn = (getScore('eyeLookInLeft') + getScore('eyeLookInRight')) / 2;
              
              if (lookDown < 0.4 && lookOut < 0.4 && lookIn < 0.4) {
                t.eyeContactFrames++;
              }
            }
          } else {
            t.lastNosePos = null;
          }
        }
        requestAnimationFrameRef.current = requestAnimationFrame(predictWebcam);
      };
      predictWebcam();
      
    } catch (error) {
      console.error("Camera access denied or failed", error);
      setCameraStatus('denied');
    }
  };

  const startInterviewLogic = () => {
    if (state.transcript.length === 0) {
      handleChat("Hello, I am ready to begin.");
    }
  };

  useEffect(() => {
    if (!state) {
      navigate('/');
      return;
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
      if (requestAnimationFrameRef.current) cancelAnimationFrame(requestAnimationFrameRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
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

  const flushBodyMetrics = () => {
    const t = trackingDataRef.current;
    if (t.framesProcessed > 0) {
      const faceVisible = t.facesDetected / t.framesProcessed;
      const eyeContact = t.facesDetected > 0 ? t.eyeContactFrames / t.facesDetected : 0;
      const avgMovement = t.totalMovement / t.framesProcessed;
      const stillness = Math.max(0, 1 - (avgMovement / 0.05)); // simplistic stillness 0-1
      
      setBodyMetricsTimeline(prev => [...prev, { faceVisible, eyeContact, stillness }]);
    }
    // reset
    trackingDataRef.current = { framesProcessed: 0, facesDetected: 0, eyeContactFrames: 0, lastNosePos: null, totalMovement: 0 };
  };

  const handleChat = async (userMessage) => {
    if (!state) return;
    
    // Stop listening/timers if active
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (recognitionRef.current && isListeningRef.current) recognitionRef.current.stop();

    // Log metrics for this answer
    flushBodyMetrics();

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

  const getFinalVideoUrl = () => {
    return new Promise(resolve => {
      if (!mediaRecorderRef.current || mediaRecorderRef.current.state === 'inactive') {
        resolve(null);
        return;
      }
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        resolve(URL.createObjectURL(blob));
      };
      mediaRecorderRef.current.stop();
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    });
  };

  const finishInterview = async () => {
    if (!confirm("Are you sure you want to finish the interview and get your score?")) return;
    setScoring(true);
    flushBodyMetrics();
    
    const videoUrl = await getFinalVideoUrl();
    
    // Pass metrics to backend by attaching to state
    // Note: React state updates are async, so we use the local refs directly
    const finalTimeline = [...bodyMetricsTimeline];
    const t = trackingDataRef.current;
    if (t.framesProcessed > 0) {
      finalTimeline.push({
        faceVisible: t.facesDetected / t.framesProcessed,
        eyeContact: t.facesDetected > 0 ? t.eyeContactFrames / t.facesDetected : 0,
        stillness: Math.max(0, 1 - ((t.totalMovement / t.framesProcessed) / 0.05))
      });
    }

    const finalState = { ...state, metrics: { ...metrics, bodyMetricsTimeline: finalTimeline } };
    
    try {
      const res = await fetch('http://localhost:3001/api/interview/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: finalState })
      });
      const data = await res.json();
      navigate(`/report/${data.id}`, { state: { videoBlobUrl: videoUrl } });
    } catch (err) {
      console.error(err);
      setScoring(false);
    }
  };

  if (!state) return null;

  if (cameraStatus === 'prompt') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="card" style={{ maxWidth: '500px', textAlign: 'center' }}>
          <Camera size={48} color="var(--accent-primary)" style={{ marginBottom: '1rem' }} />
          <h2>Camera Access Needed</h2>
          <p style={{ color: 'var(--text-secondary)', margin: '1rem 0' }}>
            We request camera access to track your eye contact and body language (stillness) during the interview. 
            All processing is done locally on your device, and video is NOT sent to our servers.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={() => { setCameraStatus('denied'); startInterviewLogic(); }}>
              Continue without Camera
            </button>
            <button className="btn btn-primary" onClick={async () => { await initializeCamera(); startInterviewLogic(); }}>
              Allow Camera
            </button>
          </div>
        </div>
      </div>
    );
  }

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

      <div className="chat-box" style={{ position: 'relative' }}>
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
        
        {/* Floating Webcam Preview */}
        {cameraStatus === 'granted' && (
           <video 
             ref={videoRef} 
             autoPlay 
             muted 
             playsInline
             style={{ 
               position: 'absolute', 
               bottom: '20px', 
               right: '20px', 
               width: '160px', 
               height: '120px', 
               borderRadius: '12px',
               objectFit: 'cover',
               border: '2px solid var(--border-color)',
               boxShadow: 'var(--card-shadow)',
               transform: 'scaleX(-1)',
               backgroundColor: 'var(--bg-tertiary)'
             }} 
           />
        )}
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

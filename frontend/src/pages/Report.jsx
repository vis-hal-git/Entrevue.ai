import { useState, useEffect } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Report() {
  const { id } = useParams();
  const location = useLocation();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

  const videoBlobUrl = location.state?.videoBlobUrl;

  useEffect(() => {
    fetch(`http://localhost:3001/api/interviews/${id}`)
      .then(res => res.json())
      .then(data => {
        setReport(data);
        setLoading(false);
      })
      .catch(err => console.error(err));
  }, [id]);

  if (loading) return <div style={{ textAlign: 'center', marginTop: '3rem' }}>Loading your results...</div>;
  if (!report || !report.scoreReport) return <div style={{ textAlign: 'center', marginTop: '3rem' }}>Report not found</div>;

  const { scoreReport, transcript, metrics } = report;

  let wpm = 0;
  if (metrics?.totalSpeakingTime > 0) {
    const studentWords = transcript
      .filter(t => t.role === 'student')
      .map(t => t.content.trim().split(/\s+/).length)
      .reduce((a, b) => a + b, 0);
    const minutes = metrics.totalSpeakingTime / 60;
    wpm = Math.round(studentWords / minutes);
  }

  const bodyMetricsTimeline = metrics?.bodyMetricsTimeline;
  let bodyLanguageScore = 0;
  if (bodyMetricsTimeline && bodyMetricsTimeline.length > 0) {
    let sumFace = 0, sumEye = 0, sumStill = 0;
    bodyMetricsTimeline.forEach(m => {
      sumFace += m.faceVisible;
      sumEye += m.eyeContact;
      sumStill += m.stillness;
    });
    const len = bodyMetricsTimeline.length;
    bodyLanguageScore = Math.round(((sumEye / len) * 5 + (sumFace / len) * 3 + (sumStill / len) * 2) * 10) / 10;
  }

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto' }}>
      <Link to="/" className="btn btn-secondary" style={{ marginBottom: '2rem' }}>
        <ArrowLeft size={16} /> Back to Home
      </Link>
      
      <div className="report-header">
        <h1 style={{ marginBottom: '0.5rem' }}>Interview Results</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', marginBottom: '2rem' }}>{report.role}</p>
        
        <div className="score-circle">
          {scoreReport.overallScore}
        </div>
        <p style={{ fontSize: '1.1rem', fontWeight: 600 }}>Overall Score</p>
      </div>

      <div className="report-grid">
        <div className="card">
          <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 color="var(--success-color)" /> Key Strengths
          </h2>
          <ul className="feedback-list strengths">
            {scoreReport.strengths.map((strength, i) => (
              <li key={i}>{strength}</li>
            ))}
          </ul>
        </div>
        
        <div className="card">
          <h2 style={{ marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <AlertCircle color="var(--error-color)" /> Areas to Improve
          </h2>
          <ul className="feedback-list weaknesses">
            {scoreReport.areasToImprove.map((area, i) => (
              <li key={i}>{area}</li>
            ))}
          </ul>
        </div>
      </div>

      {bodyMetricsTimeline && bodyMetricsTimeline.length > 0 && (
        <>
          <h2 style={{ marginBottom: '1.5rem' }}>Body Language / Presence (Webcam Analysis)</h2>
          <div className="card" style={{ marginBottom: '3rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <div style={{ fontSize: '1.2rem', fontWeight: 600 }}>Overall Presence Score</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent-primary)' }}>{bodyLanguageScore}/10</div>
            </div>
            <p style={{ color: 'var(--text-secondary)', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
              *This score is approximate and based on local webcam heuristics (50% Eye Contact, 30% Face Visibility, 20% Stillness).
            </p>
            
            <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Eye Contact Timeline</h3>
            <div style={{ display: 'flex', gap: '4px', height: '60px', alignItems: 'flex-end', marginBottom: '1rem' }}>
              {bodyMetricsTimeline.map((m, i) => (
                <div key={i} style={{ flex: 1, backgroundColor: 'var(--bg-tertiary)', height: '100%', position: 'relative', borderRadius: '4px', overflow: 'hidden' }} title={`Question ${i + 1}: ${Math.round(m.eyeContact * 100)}% Eye Contact`}>
                   <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `${m.eyeContact * 100}%`, backgroundColor: 'var(--accent-primary)', transition: 'height 0.3s' }}></div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {videoBlobUrl && (
        <>
           <h2 style={{ marginBottom: '1.5rem' }}>Session Recording</h2>
           <div className="card" style={{ marginBottom: '3rem', textAlign: 'center' }}>
             <video src={videoBlobUrl} controls style={{ width: '100%', maxWidth: '800px', borderRadius: '8px' }}></video>
           </div>
        </>
      )}

      {metrics && (
        <>
          <h2 style={{ marginBottom: '1.5rem' }}>Speech Metrics</h2>
          <div className="report-grid" style={{ marginBottom: '3rem' }}>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>
                {wpm}
              </div>
              <p style={{ color: 'var(--text-secondary)' }}>Words Per Minute (Pace)</p>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 700, color: 'var(--accent-primary)', marginBottom: '0.5rem' }}>
                {metrics.fillerWordCount || 0}
              </div>
              <p style={{ color: 'var(--text-secondary)' }}>Filler Words Used</p>
            </div>
          </div>
        </>
      )}

      <h2 style={{ marginBottom: '1.5rem' }}>Detailed Breakdown</h2>
      <div className="criteria-list">
        {scoreReport.scores.map((scoreObj, i) => (
          <div key={i} className="criterion-item">
            <div className="criterion-header">
              <span>{scoreObj.criterion}</span>
              <span style={{ color: 'var(--accent-primary)' }}>{scoreObj.score}/10</span>
            </div>
            <div className="criterion-bar-bg">
              <div 
                className="criterion-bar-fill" 
                style={{ width: `${scoreObj.score * 10}%` }}
              ></div>
            </div>
            <p className="criterion-justification">{scoreObj.justification}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

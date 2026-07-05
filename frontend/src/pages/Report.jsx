import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Report() {
  const { id } = useParams();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);

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

  const { scoreReport } = report;

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

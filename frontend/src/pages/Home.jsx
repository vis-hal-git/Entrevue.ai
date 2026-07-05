import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Briefcase, ChevronRight } from 'lucide-react';

export default function Home() {
  const [rubrics, setRubrics] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    fetch('http://localhost:3001/api/rubrics')
      .then(res => res.json())
      .then(data => {
        setRubrics(data);
        setLoading(false);
      })
      .catch(err => console.error("Error loading rubrics:", err));
  }, []);

  const startInterview = async (roleId) => {
    try {
      const res = await fetch('http://localhost:3001/api/interview/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roleId })
      });
      const data = await res.json();
      if (data.id) {
        navigate('/interview', { state: { interviewState: data } });
      }
    } catch (err) {
      console.error("Error starting interview:", err);
    }
  };

  return (
    <div className="home-container">
      <div className="hero">
        <h1>Master Your Next Interview</h1>
        <p>Practice with our AI interviewer, get actionable feedback, and land your dream job.</p>
      </div>
      
      <h2>Select a Role to Practice</h2>
      <div style={{ marginTop: '1.5rem' }} className="roles-grid">
        {loading ? (
          <p>Loading roles...</p>
        ) : (
          rubrics.map(rubric => (
            <div key={rubric.id} className="card" onClick={() => startInterview(rubric.id)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
                <div style={{ background: 'var(--bg-tertiary)', padding: '0.5rem', borderRadius: '8px' }}>
                  <Briefcase size={24} color="var(--accent-primary)" />
                </div>
                <h3 style={{ margin: 0, fontSize: '1.2rem' }}>{rubric.role}</h3>
              </div>
              
              <div style={{ marginBottom: '1.5rem', minHeight: '80px' }}>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '0.5rem' }}>Key Criteria:</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {rubric.criteria.slice(0, 3).map((c, i) => (
                    <span key={i} style={{ background: 'var(--bg-tertiary)', padding: '0.2rem 0.6rem', borderRadius: '4px', fontSize: '0.8rem', border: '1px solid var(--border-color)' }}>
                      {c.name}
                    </span>
                  ))}
                  {rubric.criteria.length > 3 && <span style={{ padding: '0.2rem 0.6rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>+{rubric.criteria.length - 3} more</span>}
                </div>
              </div>
              
              <button className="btn btn-primary" style={{ width: '100%' }}>
                Start Interview <ChevronRight size={16} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

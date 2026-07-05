import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, History as HistoryIcon } from 'lucide-react';

export default function History() {
  const [interviews, setInterviews] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('http://localhost:3001/api/interviews')
      .then(res => res.json())
      .then(data => {
        setInterviews(data);
        setLoading(false);
      })
      .catch(err => console.error(err));
  }, []);

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
        <HistoryIcon size={32} color="var(--accent-primary)" />
        <h1 style={{ margin: 0 }}>Interview History</h1>
      </div>

      {loading ? (
        <p>Loading history...</p>
      ) : interviews.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', marginBottom: '1.5rem' }}>No past interviews found.</p>
          <Link to="/" className="btn btn-primary">Start an Interview</Link>
        </div>
      ) : (
        <div className="history-list">
          {interviews.map(interview => (
            <Link key={interview.id} to={`/report/${interview.id}`} className="history-item">
              <div className="history-info">
                <h3>{interview.role}</h3>
                <p>{new Date(interview.date).toLocaleString()}</p>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', margin: 0 }}>Score</p>
                  <span className="history-score">{interview.overallScore || 'N/A'}</span>
                </div>
                <ChevronRight color="var(--text-secondary)" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

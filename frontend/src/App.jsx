import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import { Bot } from 'lucide-react';
import Home from './pages/Home';
import Interview from './pages/Interview';
import Report from './pages/Report';
import History from './pages/History';
import './index.css';

function App() {
  return (
    <Router>
      <div className="app-container">
        <nav className="navbar">
          <Link to="/" className="navbar-brand">
            <Bot size={28} color="var(--accent-primary)" />
            AI Interviewer
          </Link>
          <div className="navbar-links">
            <Link to="/" className="navbar-link">Home</Link>
            <Link to="/history" className="navbar-link">History</Link>
          </div>
        </nav>
        
        <main className="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/interview" element={<Interview />} />
            <Route path="/report/:id" element={<Report />} />
            <Route path="/history" element={<History />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;

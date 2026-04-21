import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import ReactMarkdown from 'react-markdown';
import './ChatInterface.css';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const EXAMPLE_QUERIES = [
  { icon: '🫁', text: 'Latest treatment for lung cancer', disease: 'lung cancer' },
  { icon: '🧬', text: 'Clinical trials for diabetes', disease: 'diabetes' },
  { icon: '🧠', text: "Top researchers in Alzheimer's disease", disease: "alzheimer's disease" },
  { icon: '❤️', text: 'Recent studies on heart disease', disease: 'heart disease' },
];
const exportChatToPDF = async () => {
  const element = document.querySelector('.messages-list');
  if (!element) return;

  const originalHeight = element.style.height;
  const originalOverflow = element.style.overflow;

  element.style.height = 'auto';
  element.style.overflow = 'visible';
  element.classList.add('pdf-export-mode');
  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    scrollY: -window.scrollY,
    windowWidth: element.scrollWidth,
    windowHeight: element.scrollHeight
  });
  element.classList.remove('pdf-export-mode');

  element.style.height = originalHeight;
  element.style.overflow = originalOverflow;

  const imgData = canvas.toDataURL('image/png');

  const pdf = new jsPDF('p', 'mm', 'a4');

  const pdfWidth = 210;
  const pageHeight = 297;
  const imgWidth = pdfWidth;
  const imgHeight = (canvas.height * imgWidth) / canvas.width;

  let heightLeft = imgHeight;
  let position = 0;

  pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
  heightLeft -= pageHeight;

  while (heightLeft > 0) {
    position = heightLeft - imgHeight;
    pdf.addPage();
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
  }

  pdf.save('curalink-chat.pdf');
};
export default function ChatInterface({ sessionId, userContext, messages, setMessages, onResearchData }) {
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const [loadingProgress, setLoadingProgress] = useState(0);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendMessage = async (text) => {
    const msg = (text || input).trim();
    if (!msg) return;

    const userMessage = { role: 'user', content: msg, id: Date.now() };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setLoading(true);
    setLoadingStage('Expanding query...');
    setLoadingProgress(10);

    try {
      setTimeout(() => {
        setLoadingStage('Fetching PubMed publications...');
        setLoadingProgress(25);
      }, 800);
      
      setTimeout(() => {
        setLoadingStage('Searching OpenAlex database...');
        setLoadingProgress(45);
      }, 2000);
      
      setTimeout(() => {
        setLoadingStage('Retrieving clinical trials...');
        setLoadingProgress(65);
      }, 3500);
      
      setTimeout(() => {
        setLoadingStage('Ranking & filtering results...');
        setLoadingProgress(82);
      }, 5000);
      
      setTimeout(() => {
        setLoadingStage('Generating AI analysis...');
        setLoadingProgress(95);
      }, 7000);

      const res = await axios.post(`${API_BASE}/api/chat`, {
        sessionId,
        message: msg,
        userContext
      });

      const assistantMessage = {
        role: 'assistant',
        content: res.data.response,
        id: Date.now() + 1,
        publications: res.data.publications || [],
        clinicalTrials: res.data.clinicalTrials || [],
        expandedQuery: res.data.expandedQuery,
        retrievalStats: res.data.retrievalStats,
        llmUsed: res.data.llmUsed
      };

      setMessages(prev => [...prev, assistantMessage]);
      onResearchData({
        publications: res.data.publications,
        clinicalTrials: res.data.clinicalTrials,
        expandedQuery: res.data.expandedQuery,
        retrievalStats: res.data.retrievalStats
      });
    } catch (err) {
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `**Error:** ${err.response?.data?.error || err.message || 'Something went wrong. Please try again.'}`,
        id: Date.now() + 1,
        isError: true
      }]);
    } finally {
      setLoading(false);
      setLoadingStage('');
      setLoadingProgress(100);
      inputRef.current?.focus();
      
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="chat-container">
      {messages.length === 0 ? (
        <div className="welcome-screen">
          <div className="welcome-hero">
            <div className="hero-icon">
              <svg viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="30" cy="30" r="30" fill="url(#heroGrad)" opacity="0.15"/>
                <path d="M30 12 L30 48 M12 30 L48 30" stroke="url(#heroGrad)" strokeWidth="4" strokeLinecap="round"/>
                <circle cx="30" cy="30" r="10" fill="none" stroke="url(#heroGrad)" strokeWidth="3"/>
                <circle cx="30" cy="30" r="3" fill="url(#heroGrad)"/>
                <defs>
                  <linearGradient id="heroGrad" x1="0" y1="0" x2="60" y2="60">
                    <stop stopColor="#0ea5e9"/>
                    <stop offset="1" stopColor="#6366f1"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <h1>CuraLink Research Assistant</h1>
            <p>Evidence-based medical insights from PubMed, OpenAlex & ClinicalTrials.gov</p>
            {userContext.disease && (
              <div className="context-pill">
                <span className="ctx-dot-sm"></span>
                Tracking: <strong>{userContext.disease}</strong>
                {userContext.patientName && <> · {userContext.patientName}</>}
              </div>
            )}
          </div>
          <div className="example-queries">
            <p className="examples-label">Try these searches</p>
            <div className="examples-grid">
              {EXAMPLE_QUERIES.map((q, i) => (
                <button key={i} className="example-card" onClick={() => sendMessage(q.text)}>
                  <span className="example-icon">{q.icon}</span>
                  <span>{q.text}</span>
                  <svg className="arrow" viewBox="0 0 16 16" fill="none">
                    <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="messages-list">
          {messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))}
          {loading && <LoadingBubble stage={loadingStage} progress={loadingProgress} />}
          <div ref={endRef} />
        </div>
      )}
        <button className="export-btn" onClick={exportChatToPDF}>
          Export Chat PDF
        </button>
      <div className="chat-input-area">
        {messages.length > 0 && loading && (
          <div className="loading-indicator">
            <div className="loading-dots"><span/><span/><span/></div>
            <span>{loadingStage}</span>
          </div>
        )}
        <div className="input-wrapper">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={userContext.disease
              ? `Ask about ${userContext.disease}...`
              : "Ask about any medical condition, treatment, or research..."}
            rows={1}
            disabled={loading}
          />
          <button
            className={`send-btn ${input.trim() ? 'active' : ''}`}
            onClick={() => sendMessage()}
            disabled={!input.trim() || loading}
          >
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
        <p className="disclaimer">CuraLink provides research summaries only. Always consult a licensed physician for medical decisions.</p>
      </div>
    </div>
  );
}

function MessageBubble({ message }) {
  const [showSources, setShowSources] = useState(false);
  const hasSources = (message.publications?.length > 0) || (message.clinicalTrials?.length > 0);

  return (
    <div className={`message ${message.role} ${message.isError ? 'error' : ''}`}>
      {message.role === 'assistant' && (
        <div className="assistant-avatar">
          <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="12" fill="url(#aGrad)"/>
            <path d="M12 6 L12 18 M6 12 L18 12" stroke="white" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="12" cy="12" r="3" fill="none" stroke="white" strokeWidth="1.5"/>
            <defs><linearGradient id="aGrad" x1="0" y1="0" x2="24" y2="24">
              <stop stopColor="#0ea5e9"/><stop offset="1" stopColor="#6366f1"/>
            </linearGradient></defs>
          </svg>
        </div>
      )}
      <div className="message-content">
      <div className="message-main-content">
        <ReactMarkdown>{message.content}</ReactMarkdown>
      </div>

        {message.role === 'assistant' && message.retrievalStats && (
          <div className="retrieval-badge">
            <span>📊 {message.retrievalStats.totalPublicationsRetrieved} publications retrieved</span>
            <span>🧪 {message.retrievalStats.totalTrialsRetrieved} trials found</span>
            {message.expandedQuery && <span>🔀 Expanded: "{message.expandedQuery}"</span>}
            {message.llmUsed && <span>🤖 {message.llmUsed}</span>}
          </div>
        )}

        {hasSources && (
          <div className="sources-section">
            <button className="toggle-sources" onClick={() => setShowSources(!showSources)}>
              {showSources ? '▼' : '▶'} Sources ({(message.publications?.length || 0) + (message.clinicalTrials?.length || 0)})
            </button>
            {showSources && (
              <div className="sources-list">
                {message.publications?.length > 0 && (
                  <div className="source-group">
                    <h4>📚 Publications</h4>
                    {message.publications.map((pub, i) => (
                      <PublicationCard key={i} pub={pub} index={i + 1} />
                    ))}
                  </div>
                )}
                {message.clinicalTrials?.length > 0 && (
                  <div className="source-group">
                    <h4>🧪 Clinical Trials</h4>
                    {message.clinicalTrials.map((trial, i) => (
                      <TrialCard key={i} trial={trial} index={i + 1} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PublicationCard({ pub, index }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="pub-card">
      <div className="pub-header" onClick={() => setExpanded(!expanded)}>
        <span className="pub-num">[{index}]</span>
        <div>
          <div className="pub-title">{pub.title}</div>
          <div className="pub-meta">
            <span className={`source-badge ${pub.source?.toLowerCase().replace(' ', '-')}`}>{pub.source}</span>
            {pub.year && <span>{pub.year}</span>}
            {pub.authors?.[0] && <span>{pub.authors[0]}{pub.authors.length > 1 ? ` +${pub.authors.length - 1}` : ''}</span>}
            {pub.citationCount > 0 && <span>📌 {pub.citationCount} citations</span>}
          </div>
        </div>
        <span className="expand-icon">{expanded ? '−' : '+'}</span>
      </div>
      {expanded && (
        <div className="pub-body">
          {pub.abstract && <p className="pub-abstract">{pub.abstract.substring(0, 500)}{pub.abstract.length > 500 ? '...' : ''}</p>}
          {pub.url && (
            <a href={pub.url} target="_blank" rel="noopener noreferrer" className="pub-link">
              Read full paper →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function TrialCard({ trial, index }) {
  const [expanded, setExpanded] = useState(false);
  const statusColors = {
    'RECRUITING': 'status-recruiting',
    'ACTIVE_NOT_RECRUITING': 'status-active',
    'COMPLETED': 'status-completed',
    'TERMINATED': 'status-terminated'
  };
  return (
    <div className="trial-card">
      <div className="trial-header" onClick={() => setExpanded(!expanded)}>
        <span className="trial-num">[T{index}]</span>
        <div className="trial-title-area">
          <div className="trial-title">{trial.title}</div>
          <div className="trial-meta">
            <span className={`status-badge ${statusColors[trial.status] || ''}`}>{trial.status}</span>
            {trial.phase && trial.phase !== 'N/A' && <span>Phase {trial.phase}</span>}
            {trial.nctId && <span>{trial.nctId}</span>}
          </div>
        </div>
        <span className="expand-icon">{expanded ? '−' : '+'}</span>
      </div>
      {expanded && (
        <div className="trial-body">
          {trial.summary && <p>{trial.summary.substring(0, 400)}{trial.summary.length > 400 ? '...' : ''}</p>}
          {trial.locations?.length > 0 && (
            <div className="trial-locations">
              <strong>📍 Locations:</strong> {trial.locations.slice(0, 3).map(l => `${l.city || ''}, ${l.country || ''}`).join(' | ')}
            </div>
          )}
          {trial.contacts?.length > 0 && (
            <div className="trial-contacts">
              <strong>📞 Contact:</strong> {trial.contacts[0].name}
              {trial.contacts[0].email && ` · ${trial.contacts[0].email}`}
            </div>
          )}
          {trial.url && (
            <a href={trial.url} target="_blank" rel="noopener noreferrer" className="pub-link">
              View on ClinicalTrials.gov →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function LoadingBubble({ stage, progress }) {
  return (
    <div className="message assistant">
      <div className="assistant-avatar">
        <svg viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="12" fill="url(#aGrad2)" />
          <path d="M12 6 L12 18 M6 12 L18 12" stroke="white" strokeWidth="2" strokeLinecap="round" />
          <circle cx="12" cy="12" r="3" fill="none" stroke="white" strokeWidth="1.5" />
        </svg>
      </div>

      <div className="message-content loading-content">
        <div className="loading-stage-text">{stage}</div>

        <div className="loading-progress-row">
          <div className="loading-progress-bar">
            <div
              className="loading-progress-fill"
              style={{ width: `${progress}%` }}
            />
          </div>
          <span className="loading-progress-text">{progress}%</span>
        </div>
      </div>
    </div>
  );
}

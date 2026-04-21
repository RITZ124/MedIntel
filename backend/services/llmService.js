const axios = require('axios');

const OLLAMA_BASE = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.2';
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

/**
 * Primary: Use Ollama (local open-source LLM)
 */
async function callOllama(prompt, systemPrompt) {
  const res = await axios.post(`${OLLAMA_BASE}/api/generate`, {
    model: OLLAMA_MODEL,
    prompt: systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt,
    stream: false,
    keep_alive: "30m",
    options: {
      temperature: 0.2,
      top_p: 0.85,
      num_predict: 700,
      num_ctx: 2048
    }
  }, { timeout: 180000 });

  return res.data?.response || '';
}

async function callGroq(prompt, systemPrompt) {
  if (!GROQ_API_KEY) throw new Error('No Groq API key');

  const res = await axios.post(
    'https://api.groq.com/openai/v1/chat/completions',
    {
      model: GROQ_MODEL,
      messages: [
        {
          role: 'system',
          content: systemPrompt || 'You are a medical research assistant.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.2,
      max_tokens: 2000
    },
    {
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json'
      },
      timeout: 60000
    }
  );

  return res.data?.choices?.[0]?.message?.content || '';
}

/**
 * Build structured medical analysis prompt
 */
function buildMedicalPrompt(userMessage, context, publications, clinicalTrials, conversationHistory) {
  const historyText = conversationHistory.slice(-6).map(m =>
    `${m.role.toUpperCase()}: ${m.content.substring(0, 300)}`
  ).join('\n');

  const pubSummaries = publications.slice(0, 3).map((p, i) =>
    `[PUB ${i + 1}] "${p.title}" (${p.source}, ${p.year || 'N/A'})
    Authors: ${(p.authors || []).join(', ') || 'N/A'}
    Abstract: ${(p.abstract || '').substring(0, 120)}
    URL: ${p.url || 'N/A'}`
  ).join('\n\n');

  const trialSummaries = clinicalTrials.slice(0, 3).map((t, i) =>
    `[TRIAL ${i + 1}] "${t.title}"
    Status: ${t.status} | Phase: ${t.phase}
    Summary: ${(t.summary || '').substring(0, 120)}
    Locations: ${t.locations?.slice(0, 2).map(l => `${l.city}, ${l.country}`).join('; ') || 'N/A'}
    NCT ID: ${t.nctId} | URL: ${t.url}`
  ).join('\n\n');

  return `You are CuraLink, an expert AI Medical Research Assistant. Your role is to synthesize medical research and clinical trials into clear, structured, evidence-based insights.

PATIENT CONTEXT:
- Disease/Condition: ${context.disease || 'Not specified'}
- Patient Name: ${context.patientName || 'User'}
- Location: ${context.location || 'Not specified'}
- Query: ${userMessage}

CONVERSATION HISTORY:
${historyText || 'New conversation'}

RETRIEVED RESEARCH PUBLICATIONS (${publications.length} total retrieved, showing top 3):
${pubSummaries || 'No publications found'}

RETRIEVED CLINICAL TRIALS (${clinicalTrials.length} total retrieved, showing top 3):
${trialSummaries || 'No clinical trials found'}

INSTRUCTIONS:
1. Provide a comprehensive, structured medical research response
2. Reference specific publications with [PUB X] notation
3. Reference clinical trials with [TRIAL X] notation
4. Be specific and research-backed, not generic
5. Maintain context from conversation history for follow-up questions
6. Structure your response with clear sections
7. NEVER fabricate or hallucinate medical information
8. Always recommend consulting healthcare professionals for personal medical decisions
9. If this is a follow-up question, connect it to the previous context

Respond with a well-structured answer covering:
- Condition Overview (brief)
- Key Research Insights (with publication citations)
- Clinical Trial Findings (if relevant)
- Personalized Relevance (based on patient context)
- Important Caveats & Next Steps

USER QUESTION: ${userMessage}`;
}

/**
 * Main LLM call with fallback chain
 */
async function generateMedicalAnalysis(userMessage, context, publications, clinicalTrials, conversationHistory = []) {
  const systemPrompt = `You are CuraLink, an AI medical research assistant.

  Use only the provided publications and clinical trials.
  Never hallucinate facts.
  If information is missing, explicitly say so.
  Do not provide direct medical advice.
  Always recommend consulting a healthcare professional.

  Every response must follow this exact structure:

  ## Condition Overview
  Brief explanation of the disease or topic.

  ## Key Research Insights
  Summarize the most important findings from publications.
  Use bullet points when useful.
  Reference publications using [PUB X].

  ## Clinical Trial Findings
  Summarize relevant recruiting, active, or completed trials.
  Mention phase, status, and purpose.
  Reference trials using [TRIAL X].

  ## Personalized Relevance
  Explain how this information relates to the user's disease, location, or question.

  ## Important Caveats & Next Steps
  Mention limitations, risks, uncertainty, and next actions.

  ## Sources
  List the most important publications and trials used.
  `;

  const prompt = buildMedicalPrompt(userMessage, context, publications, clinicalTrials, conversationHistory);

  let response = '';
  let llmUsed = '';

  // Try Ollama first (local open-source LLM)
  try {
    console.log('🤖 Attempting Ollama...');
    response = await callOllama(prompt, systemPrompt);
    llmUsed = `Ollama (${OLLAMA_MODEL})`;
    console.log('✅ Ollama response received');
  } catch (ollamaErr) {
    console.log('⚠️ Ollama unavailable:', ollamaErr.message);

        if (!response) {
      try {
        console.log('🤖 Attempting Groq...');
        response = await callGroq(prompt, systemPrompt);
        llmUsed = `Groq (${GROQ_MODEL})`;
        console.log('✅ Groq response received');
      } catch (groqErr) {
        console.log('⚠️ Groq unavailable:', groqErr.message);
        response = generateFallbackResponse(context, publications, clinicalTrials);
        llmUsed = 'Rule-based fallback';
      }
    }
  }

  return { response, llmUsed };
}

/**
 * Rule-based fallback when all LLMs fail
 */
function generateFallbackResponse(context, publications, clinicalTrials) {
  const disease = context.disease || 'the condition';
  const pubList = publications.slice(0, 3).map(p =>
    `• "${p.title}" - ${p.authors?.[0] || 'Unknown'} (${p.year || 'N/A'}) - ${p.source}`
  ).join('\n');

  const trialList = clinicalTrials.slice(0, 3).map(t =>
    `• "${t.title}" - Status: ${t.status} - Phase: ${t.phase}`
  ).join('\n');

  return `## Medical Research Summary for ${disease}

**⚠️ AI Analysis Temporarily Unavailable**

I've retrieved relevant research data. Here's a summary:

### 📚 Top Publications Found (${publications.length} total retrieved)
${pubList || 'No publications retrieved'}

### 🧪 Clinical Trials (${clinicalTrials.length} total retrieved)  
${trialList || 'No trials retrieved'}

Please review the sources directly for detailed information. We recommend consulting a healthcare professional for personalized medical advice.`;
}

/**
 * Extract key intent from user message for query expansion
 */
function extractIntent(message) {
  const msg = message.toLowerCase();

  if (
    msg.includes('trial') ||
    msg.includes('study') ||
    msg.includes('experiment') ||
    msg.includes('clinical trial')
  ) {
    return 'trials';
  }

  if (
    msg.includes('treatment') ||
    msg.includes('therapy') ||
    msg.includes('drug') ||
    msg.includes('medication') ||
    msg.includes('cure') ||
    msg.includes('manage')
  ) {
    return 'treatment';
  }

  if (
    msg.includes('detect') ||
    msg.includes('diagnosis') ||
    msg.includes('screening') ||
    msg.includes('test') ||
    msg.includes('scan') ||
    msg.includes('biopsy')
  ) {
    return 'diagnosis';
  }

  if (
    msg.includes('symptom') ||
    msg.includes('sign') ||
    msg.includes('warning sign')
  ) {
    return 'symptoms';
  }

  if (
    msg.includes('cause') ||
    msg.includes('risk factor') ||
    msg.includes('why does')
  ) {
    return 'causes';
  }

  if (
    msg.includes('diet') ||
    msg.includes('food') ||
    msg.includes('vitamin') ||
    msg.includes('supplement') ||
    msg.includes('exercise')
  ) {
    return 'lifestyle';
  }

  if (
    msg.includes('survival') ||
    msg.includes('prognosis') ||
    msg.includes('life expectancy')
  ) {
    return 'prognosis';
  }

  if (
    msg.includes('side effect') ||
    msg.includes('complication')
  ) {
    return 'sideEffects';
  }

  if (
    msg.includes('latest') ||
    msg.includes('recent') ||
    msg.includes('new') ||
    msg.includes('advance')
  ) {
    return 'research';
  }

  if (
    msg.includes('researcher') ||
    msg.includes('scientist') ||
    msg.includes('expert') ||
    msg.includes('top doctor')
  ) {
    return 'researcher';
  }

  return 'general';
}

/**
 * Extract disease from conversation context
 */
function extractDiseaseFromContext(messages) {
  const combined = messages.map(m => m.content).join(' ').toLowerCase();

  const diseases = [
    'lung cancer', 'breast cancer', 'prostate cancer', 'colon cancer', 'skin cancer',
    "parkinson's disease", 'parkinson', 'alzheimer', 'dementia',
    'diabetes', 'heart disease', 'cardiovascular', 'hypertension',
    'depression', 'anxiety', 'schizophrenia',
    'arthritis', 'osteoporosis', 'multiple sclerosis',
    'stroke', 'epilepsy', 'asthma', 'copd',
    'hiv', 'aids', 'covid', 'hepatitis'
  ];

  for (const disease of diseases) {
    if (combined.includes(disease)) return disease;
  }
  return null;
}

module.exports = {
  generateMedicalAnalysis,
  extractIntent,
  extractDiseaseFromContext
};

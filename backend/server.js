require("dotenv").config();
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const OpenAI = require("openai");

const app = express();
app.use(cors());
app.use(express.json());

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const RUBRICS_DIR = path.join(__dirname, "rubrics");
const INTERVIEWS_DIR = path.join(__dirname, "data", "interviews");

// Utility to read JSON files safely
const readJsonFile = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading ${filePath}:`, error);
    return null;
  }
};

// --- Endpoints ---

// GET available rubrics
app.get("/api/rubrics", (req, res) => {
  try {
    const files = fs.readdirSync(RUBRICS_DIR);
    const rubrics = files
      .filter((file) => file.endsWith(".json"))
      .map((file) => readJsonFile(path.join(RUBRICS_DIR, file)))
      .filter(Boolean);
    res.json(rubrics);
  } catch (error) {
    res.status(500).json({ error: "Failed to load rubrics" });
  }
});

// GET past interviews
app.get("/api/interviews", (req, res) => {
  try {
    if (!fs.existsSync(INTERVIEWS_DIR)) {
      return res.json([]);
    }
    const files = fs.readdirSync(INTERVIEWS_DIR);
    const interviews = files
      .filter((file) => file.endsWith(".json"))
      .map((file) => {
        const data = readJsonFile(path.join(INTERVIEWS_DIR, file));
        if (data) {
           return {
             id: data.id,
             role: data.role,
             date: data.date,
             overallScore: data.scoreReport?.overallScore
           };
        }
        return null;
      })
      .filter(Boolean);
    
    // Sort by date descending
    interviews.sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(interviews);
  } catch (error) {
    res.status(500).json({ error: "Failed to load interviews" });
  }
});

// GET specific interview
app.get("/api/interviews/:id", (req, res) => {
  const filePath = path.join(INTERVIEWS_DIR, `${req.params.id}.json`);
  const data = readJsonFile(filePath);
  if (data) {
    res.json(data);
  } else {
    res.status(404).json({ error: "Interview not found" });
  }
});

// Start a new interview
app.post("/api/interview/start", (req, res) => {
  const { roleId } = req.body;
  const rubricPath = path.join(RUBRICS_DIR, `${roleId}.json`);
  const rubric = readJsonFile(rubricPath);

  if (!rubric) {
    return res.status(400).json({ error: "Invalid role or rubric not found" });
  }

  const interviewId = Date.now().toString();
  const initialState = {
    id: interviewId,
    role: rubric.role,
    rubric: rubric.criteria,
    date: new Date().toISOString(),
    stage: "warm-up",
    stageIndex: 0,
    history: [],
    transcript: []
  };

  res.json(initialState);
});

// Handle Chat Message
app.post("/api/interview/chat", async (req, res) => {
  try {
    const { message, state } = req.body;
    
    // Add user message to transcript and history
    const newTranscript = [...state.transcript, { role: "student", content: message }];
    const newHistory = [...state.history, { role: "user", content: message }];

    // Prepare system prompt for Claude
    const systemPrompt = `You are an expert, professional, and encouraging AI interviewer conducting a mock interview for the role of ${state.role}.
The interview structure is:
1. Warm-up (1 question)
2. Role-specific questions (4-5 questions)
3. Behavioral/STAR question (1 question)
4. Closing ("Do you have any questions for me?")

Current stage: ${state.stage}.
If the student's answer is vague or shallow, you may ask a natural follow-up question (max 1 follow-up per main question). If the answer is sufficient, acknowledge it briefly and move to the next question/stage. Keep your tone conversational and human-like. Adapt your difficulty: if they give strong answers, ask slightly harder questions next; if weak, keep it approachable. Keep your responses concise.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: systemPrompt },
        ...newHistory
      ],
      max_tokens: 500,
    });

    const aiMessage = response.choices[0].message.content;
    
    // Update state based on heuristics or AI logic. (For simplicity, we let the client track stage progression based on message count, or we can just send the AI message back and let the client manage it).
    
    res.json({
      aiMessage,
      newTranscript: [...newTranscript, { role: "interviewer", content: aiMessage }],
      newHistory: [...newHistory, { role: "assistant", content: aiMessage }]
    });

  } catch (error) {
    console.error("Chat error:", error);
    res.status(500).json({ error: "Failed to process chat message" });
  }
});

// Finish and Score Interview
app.post("/api/interview/score", async (req, res) => {
  try {
    const { state } = req.body;
    
    const systemPrompt = `You are an expert interviewer scoring a candidate for the role of ${state.role}.
You must evaluate the provided transcript against the following rubric:
${JSON.stringify(state.rubric, null, 2)}

Return your evaluation strictly in the following JSON format:
{
  "scores": [
    {
      "criterion": "Name of criterion",
      "score": <0-10 number>,
      "justification": "One sentence justification."
    }
  ],
  "overallScore": <0-100 number, weighted according to rubric>,
  "strengths": ["strength 1", "strength 2", "strength 3"],
  "areasToImprove": ["area 1", "area 2", "area 3"]
}
Output nothing but the JSON.`;

    // Extract text transcript for the prompt
    const transcriptText = state.transcript
      .map(t => `${t.role.toUpperCase()}: ${t.content}`)
      .join("\n");

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Here is the interview transcript:\n${transcriptText}\n\nPlease provide the score report in strict JSON.` }
      ],
      max_tokens: 1000,
    });

    const scoreContent = response.choices[0].message.content;
    
    let scoreReport;
    try {
      scoreReport = JSON.parse(scoreContent);
    } catch(e) {
      // Fallback: extract JSON if there's surrounding text
      const match = scoreContent.match(/\{[\s\S]*\}/);
      if (match) {
        scoreReport = JSON.parse(match[0]);
      } else {
        throw new Error("Could not parse JSON from Claude response");
      }
    }

    const finalData = {
      id: state.id,
      role: state.role,
      date: state.date,
      transcript: state.transcript,
      metrics: state.metrics || {},
      scoreReport
    };

    const savePath = path.join(INTERVIEWS_DIR, `${state.id}.json`);
    fs.writeFileSync(savePath, JSON.stringify(finalData, null, 2));

    res.json(finalData);

  } catch (error) {
    console.error("Scoring error:", error);
    res.status(500).json({ error: "Failed to generate score report" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});

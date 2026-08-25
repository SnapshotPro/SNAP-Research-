# ==================================================
# SNAP Research — AI Research Assistant
# Backend — Google Gemini (google-genai SDK)
# ==================================================

import os
import time
import json
from google import genai
from google.genai import types
from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
MODEL_ID = "gemini-3.5-flash"

# ── Mode-specific system prompts ──────────────────
MODE_PROMPTS = {
    "explain": """You are a world-class expert educator. Explain topics clearly and engagingly.
Your response MUST be a valid JSON object (no markdown, no code fences, pure JSON):
{
  "answer": "Thorough explanation using **bold** for key terms. 3-5 paragraphs.",
  "concepts": ["concept1", "concept2", "concept3", "concept4", "concept5"],
  "followups": ["Follow-up question 1?", "Follow-up question 2?", "Follow-up question 3?"],
  "sources": [
    {"name": "Source 1", "type": "Academic"},
    {"name": "Source 2", "type": "Book"},
    {"name": "Source 3", "type": "Website"}
  ],
  "confidence": "high"
}""",

    "deep": """You are a domain expert writing for fellow experts. Provide deep technical analysis.
Your response MUST be a valid JSON object (no markdown, no code fences, pure JSON):
{
  "answer": "Deep technical analysis with mechanisms, edge cases, current research. Use **bold** for terms. 4-6 paragraphs.",
  "concepts": ["technical concept 1", "concept 2", "concept 3", "concept 4", "concept 5", "concept 6"],
  "followups": ["Deep follow-up 1?", "Deep follow-up 2?", "Deep follow-up 3?", "Deep follow-up 4?"],
  "sources": [
    {"name": "Research Paper 1", "type": "Academic"},
    {"name": "Textbook 2", "type": "Book"},
    {"name": "Expert resource 3", "type": "Journal"}
  ],
  "confidence": "high"
}""",

    "compare": """You are a comparative analyst. Provide structured balanced comparisons.
Your response MUST be a valid JSON object (no markdown, no code fences, pure JSON):
{
  "answer": "Structured comparison: definitions, similarities, differences, use cases, trade-offs. Use **bold** for headings. 4-5 paragraphs.",
  "concepts": ["concept A", "concept B", "similarity", "difference", "use case"],
  "followups": ["Comparison follow-up 1?", "Comparison follow-up 2?", "Comparison follow-up 3?"],
  "sources": [
    {"name": "Comparative resource 1", "type": "Website"},
    {"name": "Reference book 2", "type": "Book"},
    {"name": "Research article 3", "type": "Academic"}
  ],
  "confidence": "high"
}""",

    "synth": """You are a synthesizer of ideas. Connect topics to broader themes and emerging ideas.
Your response MUST be a valid JSON object (no markdown, no code fences, pure JSON):
{
  "answer": "Synthesis connecting to other disciplines, emerging research, real-world applications, future implications. Use **bold** for connected concepts. 4-5 paragraphs.",
  "concepts": ["cross-domain concept", "connection", "implication", "emerging idea", "application"],
  "followups": ["Synthesis follow-up 1?", "Synthesis follow-up 2?", "Interdisciplinary follow-up 3?"],
  "sources": [
    {"name": "Interdisciplinary source 1", "type": "Journal"},
    {"name": "Cross-field book 2", "type": "Book"},
    {"name": "Emerging research 3", "type": "Academic"}
  ],
  "confidence": "medium"
}"""
}


def call_gemini(query, mode="explain", history=None):
    client = genai.Client(api_key=GEMINI_API_KEY)

    system_prompt = MODE_PROMPTS.get(mode, MODE_PROMPTS["explain"])

    conversation = []

    # System setup turn
    conversation.append(types.Content(
        role="user",
        parts=[types.Part(text=f"System Instructions:\n{system_prompt}\n\nPlease acknowledge your role.")]
    ))
    conversation.append(types.Content(
        role="model",
        parts=[types.Part(text="Acknowledged. I am SNAP Research AI Assistant. I will respond with structured JSON containing detailed research insights.")]
    ))

    # Add recent history if any
    if history:
        for msg in history[-6:]:
            role = "user" if msg.get("role") == "user" else "model"
            conversation.append(types.Content(
                role=role,
                parts=[types.Part(text=msg.get("content", ""))]
            ))

    # Current query
    conversation.append(types.Content(
        role="user",
        parts=[types.Part(text=f"Research topic: {query}")]
    ))

    response = client.models.generate_content(
        model=MODEL_ID,
        contents=conversation,
        config=types.GenerateContentConfig(
            temperature=0.7,
            max_output_tokens=2048,
            top_p=0.95,
        )
    )

    raw = response.text.strip()

    # Strip markdown code fences if present
    if raw.startswith("```"):
        raw = raw.replace("```json", "").replace("```", "").strip()

    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        # Fallback: return raw as answer
        return {
            "answer": raw,
            "concepts": [],
            "followups": [],
            "sources": [],
            "confidence": "medium"
        }


# ── Routes ────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/research", methods=["POST"])
def research():
    try:
        data    = request.get_json()
        query   = data.get("query", "").strip()
        mode    = data.get("mode", "explain").strip()
        history = data.get("history", [])

        if not query:
            return jsonify({"error": "Empty query"}), 400

        if not GEMINI_API_KEY:
            return jsonify({"error": "GEMINI_API_KEY missing in .env file"}), 500

        if mode not in MODE_PROMPTS:
            mode = "explain"

        result = call_gemini(query, mode, history)
        return jsonify({"result": result, "model": MODEL_ID, "mode": mode})

    except Exception as e:
        err = str(e)
        print(f"[ERROR] {err}")
        if "API_KEY" in err.upper() or "INVALID" in err.upper():
            err = "Invalid API Key. Check your .env file."
        elif "QUOTA" in err.upper():
            err = "API quota exceeded. Try again later."
        elif "NOT_FOUND" in err.upper():
            err = f"Model '{MODEL_ID}' not found. Check API access."
        return jsonify({"error": err}), 500


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({
        "status": "online",
        "model": MODEL_ID,
        "api_configured": bool(GEMINI_API_KEY),
        "timestamp": int(time.time())
    })


if __name__ == "__main__":
    print("\n" + "=" * 55)
    print("  SNAP Research — AI Research Assistant")
    print("=" * 55)
    print(f"  Model  : {MODEL_ID}")
    print(f"  Key    : {'SET [OK]' if GEMINI_API_KEY else 'MISSING [!!]'}")
    print(f"  URL    : http://localhost:5001")
    print("=" * 55 + "\n")
    app.run(debug=False, host="0.0.0.0", port=5001)

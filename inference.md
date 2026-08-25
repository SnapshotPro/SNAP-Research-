# Inference Pipelines and SDK Integrations

## Core Inference Code
The system processes inference payloads using the `genai.Client` class:

```python
from google import genai
from google.genai import types

client = genai.Client(api_key=GEMINI_API_KEY)

response = client.models.generate_content(
    model="gemini-3.5-flash",
    contents=conversation,
    config=types.GenerateContentConfig(
        temperature=0.7,
        max_output_tokens=2048,
    )
)
```

The parsed result returns raw text content representing JSON keys, which gets deserialized for client consumption.

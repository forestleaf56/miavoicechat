// api/chat.js
import { toFile } from 'openai'; // Helper (or we handle buffer manually)

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 1. Get the Audio Data (Base64) from frontend
  const { messages, audioInput } = req.body;

  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Missing API Key' });
  }

  try {
    let userMessageContent = "";

    // --- STEP A: Transcribe Audio (Whisper) if audioInput is present ---
    if (audioInput) {
      // Convert Base64 to Buffer
      const audioBuffer = Buffer.from(audioInput.split(',')[1], 'base64');
      
      // We need to send this buffer to OpenAI as a "file"
      // We create a File-like object with a name and type
      const file = await toFile(audioBuffer, 'input.webm', { type: 'audio/webm' });

      // Call Whisper API
      const transcription = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          // Note: Do NOT set Content-Type to application/json, 
          // fetch handles multipart boundary automatically when body is FormData
        },
        body: (() => {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('model', 'whisper-1');
            return formData;
        })()
      });

      const transData = await transcription.json();
      if (transData.error) throw new Error(transData.error.message);
      
      userMessageContent = transData.text;
    } else {
      // Fallback if just text was sent (e.g. typing)
      userMessageContent = messages[messages.length - 1].content;
    }

    // Don't process empty silence
    if (!userMessageContent || userMessageContent.trim() === "") {
        return res.status(200).json({ action: "ignore" });
    }

    // Add the new User Message to the array
    const newMessages = [...messages, { role: "user", content: userMessageContent }];

    // --- STEP B: Get Intelligence (GPT-4o) ---
    const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: newMessages,
        temperature: 0.7,
        max_tokens: 512
      })
    });

    const chatData = await chatResponse.json();
    const replyText = chatData.choices[0].message.content.trim();

    // --- STEP C: Generate Voice (TTS-1) ---
    const ttsResponse = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: 'nova',
        input: replyText
      })
    });

    const audioBufferOut = await ttsResponse.arrayBuffer();
    const audioBase64Out = Buffer.from(audioBufferOut).toString('base64');

    // Return everything
    return res.status(200).json({
      role: "assistant",
      user_transcript: userMessageContent, // Send back what it heard
      content: replyText,
      audio: `data:audio/mp3;base64,${audioBase64Out}`
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message });
  }
}

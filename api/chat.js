// api/chat.js
export default async function handler(req, res) {
  // 1. Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages } = req.body;

  // 2. Check for API Key in Vercel Environment Variables
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({ error: 'Missing API Key in Server Configuration' });
  }

  try {
    // --- Step A: Get Text Reply from GPT-4o ---
    const chatResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: messages,
        temperature: 0.7,
        max_tokens: 512
      })
    });

    const chatData = await chatResponse.json();
    if (chatData.error) throw new Error(chatData.error.message);
    
    const replyText = chatData.choices[0].message.content.trim();

    // --- Step B: Generate Audio from that Text (TTS-1) ---
    const ttsResponse = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'tts-1',
        voice: 'nova', // Options: alloy, echo, fable, onyx, nova, shimmer
        input: replyText
      })
    });

    if (!ttsResponse.ok) throw new Error('Error generating audio');

    // Convert audio buffer to base64 so we can send it in JSON
    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    // --- Step C: Return Both to Frontend ---
    return res.status(200).json({
      role: "assistant",
      content: replyText,
      audio: `data:audio/mp3;base64,${audioBase64}`
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Error processing request' });
  }
}

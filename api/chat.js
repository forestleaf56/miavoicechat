// api/chat.js
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { messages } = req.body;
  if (!process.env.OPENAI_API_KEY) return res.status(500).json({ error: 'Missing API Key' });

  try {
    // 1. Get Text Reply
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
    const replyText = chatData.choices[0].message.content.trim();

    // 2. Generate Audio (TTS)
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

    if (!ttsResponse.ok) throw new Error('TTS API Error');

    // Convert audio buffer to base64 string to send to frontend
    const audioBuffer = await ttsResponse.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    // 3. Return Text + Audio
    return res.status(200).json({
      role: "assistant",
      content: replyText,
      audio: `data:audio/mp3;base64,${audioBase64}`
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Error processing request' });
  }
}

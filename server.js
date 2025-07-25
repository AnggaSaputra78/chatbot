require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files (index.html, CSS, JS, dll)
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint utama
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint untuk menangani permintaan chat
app.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (!message || typeof message !== 'string' || message.trim() === '') {
    return res.status(400).json({ error: 'Pesan tidak boleh kosong.' });
  }

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'system',
            content:
              'Anda adalah asisten Desa Pongpongan. Jawablah dalam Bahasa Indonesia yang santun, jelas, dan informatif.'
          },
          {
            role: 'user',
            content: message.trim()
          }
        ],
        temperature: 0.7
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const botReply = response?.data?.choices?.[0]?.message?.content;

    if (!botReply) {
      console.error('⚠️ Format respons API tidak dikenali:', response.data);
      return res.status(500).json({ error: 'Bot tidak memberikan jawaban.' });
    }

    res.json({ reply: botReply.trim() });

  } catch (error) {
    const errMsg = error.response?.data || error.message;
    console.error('❌ Gagal mengambil respons dari API Groq:', errMsg);

    res.status(500).json({
      error: 'Terjadi kesalahan saat menghubungi AI.',
      detail: errMsg
    });
  }
});

// Menjalankan server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Chatbot Desa Pongpongan aktif di http://localhost:${PORT}`);
});
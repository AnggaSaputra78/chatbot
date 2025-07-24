require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Untuk serving file HTML statis di folder public
app.use(express.static(path.join(__dirname, 'public')));

// Endpoint halaman utama
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Endpoint untuk chat POST
app.post('/chat', async (req, res) => {
  const { message } = req.body;

  try {
    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: "llama3-8b-8192",
        messages: [
          { role: "system",
            content: "Anda adalah asisten Desa Pongpongan. Jawablah dalam Bahasa Indonesia yang santun dan jelas,jangan ngawur dan sebisa mungkin mirip seperti chat gpt,tetap gunakan bahasa indonesia."
          }
           ,
          {
            role: "user",
            content: message
          }
        ],
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const botReply = response.data.choices[0].message.content;
    res.json({ reply: botReply });

  } catch (error) {
    console.error('Error:', error.response?.data || error.message);
    res.status(500).json({ error: "Terjadi kesalahan pada server." });
  }
});

// Jalankan server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Chatbot Desa Pongpongan sedang berjalan di http://localhost:${PORT}`);
});
  
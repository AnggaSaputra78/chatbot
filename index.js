// index.js
const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { Configuration, OpenAIApi } = require('openai');
require('dotenv').config();

const app = express();
const PORT = 3000;

// Setup middleware
app.use(express.static('public'));
app.use(bodyParser.json());
app.set('view engine', 'ejs');

// OpenAI Setup
const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

// Route halaman utama
app.get('/', (req, res) => {
  res.render('index');
});

// Route chat
app.post('/chat', async (req, res) => {
  const userMessage = req.body.message;

  try {
    const completion = await openai.createChatCompletion({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: userMessage }],
    });

    const botReply = completion.data.choices[0].message.content;

    // Simpan ke chats.json
    const chatData = JSON.parse(fs.readFileSync('chats.json'));
    chatData.push({ user: userMessage, bot: botReply });
    fs.writeFileSync('chats.json', JSON.stringify(chatData, null, 2));

    res.json({ reply: botReply });

  } catch (error) {
    console.error('Error dari OpenAI:', error);
    res.json({ reply: "Maaf, bot sedang error atau API-nya belum aktif." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server jalan di http://localhost:${PORT}`);
});

require('dotenv').config();
const express = require('express');
const axios = require('axios');
const path = require('path');
const multer = require('multer');
const fs = require('fs');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const textract = require('textract');
const Tesseract = require('tesseract.js');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Static folder
app.use(express.static(path.join(__dirname, 'public')));

// ✅ Multer untuk upload file
const upload = multer({ dest: 'uploads/' });

// ✅ Fungsi ekstrak teks dari berbagai format file
async function extractTextFromFile(filePath, mimetype) {
  if (mimetype.startsWith('image/')) {
    const result = await Tesseract.recognize(filePath, 'ind');
    return result.data.text || '';
  } else if (mimetype === 'application/pdf') {
    const dataBuffer = fs.readFileSync(filePath);
    const pdfData = await pdfParse(dataBuffer);
    return pdfData.text || '';
  } else if (
    mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimetype === 'application/msword'
  ) {
    const buffer = fs.readFileSync(filePath);
    const result = await mammoth.extractRawText({ buffer });
    return result.value || '';
  } else if (
    mimetype === 'application/vnd.ms-powerpoint' ||
    mimetype === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    mimetype === 'application/vnd.ms-excel' ||
    mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ) {
    return new Promise((resolve) => {
      textract.fromFileWithPath(filePath, (error, text) => {
        if (error) resolve('');
        else resolve(text || '');
      });
    });
  } else if (mimetype === 'text/plain') {
    return fs.readFileSync(filePath, 'utf-8');
  } else {
    return '';
  }
}

// ✅ Halaman utama
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ✅ Endpoint Chatbot
app.post('/chat', upload.single('file'), async (req, res) => {
  const { message } = req.body;
  const file = req.file;

  if (!message && !file) {
    return res.status(400).json({ error: 'Pesan atau file harus ada.' });
  }

  try {
    let fileContent = '';
    if (file) {
      fileContent = await extractTextFromFile(file.path, file.mimetype);
      fs.unlinkSync(file.path);
    }

    const prompt = `
Anda adalah asisten Desa Pongpongan.
Jawablah dengan bahasa sopan dan informatif.

Pertanyaan pengguna:
${message || 'Tidak ada pesan.'}

Isi file:
${fileContent || 'Tidak ada file atau file kosong.'}
    `;

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: 'Anda adalah asisten pintar untuk warga desa.' },
          { role: 'user', content: prompt }
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
      return res.status(500).json({ error: 'Bot tidak memberikan jawaban.' });
    }

    res.json({ reply: botReply.trim() });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server jalan di http://localhost:${PORT}`));
require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const textract = require('textract');
const Tesseract = require('tesseract.js');
const cheerio = require('cheerio');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: 'uploads/' });

const dataCadangan = `... (isi tetap sama seperti di atas)`; // Gunakan yang sebelumnya

let riwayatPercakapan = [];

async function ambilDataDesa() {
  const cacheFile = path.join(__dirname, 'data.json');
  try {
    const url = 'https://pongpongan-merakurak.desa.id/';
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 15000
    });

    const $ = cheerio.load(data);
    let informasiDesa = '';
    $('p, h2').each((i, el) => {
      informasiDesa += $(el).text().trim() + '\n';
    });

    if (informasiDesa.trim().length > 0) {
      fs.writeFileSync(cacheFile, JSON.stringify({ info: informasiDesa }, null, 2));
      return informasiDesa;
    }
    throw new Error('Konten kosong');
  } catch (error) {
    console.warn('⚠ Gagal ambil data desa, gunakan cache/cadangan.');
    if (fs.existsSync(cacheFile)) {
      const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      return cacheData.info || dataCadangan;
    }
    return dataCadangan;
  }
}

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
      fs.unlinkSync(file.path); // hapus file setelah dibaca
    }

    const infoDesa = await ambilDataDesa();
    const groqKey = process.env.GROQ_API_KEY;
    if (!groqKey) throw new Error('API Key GROQ tidak ditemukan di .env');

    riwayatPercakapan.push({ role: 'user', content: message });

    const messages = [
      {
        role: 'system',
        content: `Anda adalah asisten cerdas untuk Desa Pongpongan. Jawablah pertanyaan dengan bahasa yang sopan, jelas,informatif dan sesingkat mungkin atau langsung ke point utama . Gunakan informasi berikut:\n\n${infoDesa}`,
      },
      ...riwayatPercakapan,
      {
        role: 'user',
        content: fileContent
          ? `${message}\n\n(Ini isi file yang diunggah:\n${fileContent})`
          : message,
      },
    ];

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        model: 'llama3-70b-8192', // atau mixtral-8x7b-32768
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      },
      {
        headers: {
          Authorization: `Bearer ${groqKey}`,
          'Content-Type': 'application/json',
        },
      }
    );

    const botReply = response.data.choices[0].message.content.trim();
    riwayatPercakapan.push({ role: 'assistant', content: botReply });

    res.json({ reply: botReply });
  } catch (error) {
    console.error('❌ Error:', error.response?.data || error.message);
    res.status(500).json({
      reply: '⚠ Terjadi kesalahan server. Gunakan informasi cadangan:\n' + dataCadangan
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server jalan di http://localhost:${PORT}`));
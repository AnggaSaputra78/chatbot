require('dotenv').config();
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const fsSync = require('fs');
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

// Konfigurasi upload dengan batasan file yang lebih jelas
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB (diperkecil dari 10MB)
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/msword',
      'text/plain'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Hanya file dengan jenis berikut yang diperbolehkan: ${allowedTypes.join(', ')}`), false);
    }
  }
}).single('file');

// Middleware untuk menangani error upload
const handleFileUpload = (req, res, next) => {
  upload(req, res, (err) => {
    if (err) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ 
          error: `Ukuran file terlalu besar. Maksimal ${MAX_FILE_SIZE/1024/1024}MB` 
        });
      } else if (err.message.includes('Jenis file tidak didukung')) {
        return res.status(415).json({ 
          error: err.message 
        });
      }
      return res.status(500).json({ 
        error: 'Gagal mengunggah file',
        details: err.message 
      });
    }
    next();
  });
};

const dataCadangan = `Informasi dasar tentang Desa Pongpongan:
- Lokasi: Kecamatan Merakurak, Kabupaten Tuban, Jawa Timur
- Luas wilayah: 250 hektar
- Jumlah penduduk: 3.200 jiwa
- Mata pencaharian utama: Pertanian dan peternakan
- Fasilitas umum: Kantor desa, SD Negeri, Puskesmas Pembantu, Lapangan Desa
- Potensi desa: Pertanian padi dan jagung, peternakan sapi dan kambing`;

let riwayatPercakapan = [];
const MAX_HISTORY = 5;

// Cache untuk data desa
let cacheDataDesa = {
  data: dataCadangan,
  lastUpdated: 0
};

// Pastikan folder uploads ada
const uploadDir = path.join(__dirname, 'uploads');
if (!fsSync.existsSync(uploadDir)) {
  fsSync.mkdirSync(uploadDir, { recursive: true });
}

async function ambilDataDesa() {
  // Gunakan cache jika belum expired (1 jam)
  if (cacheDataDesa.lastUpdated > Date.now() - 3600000) {
    return cacheDataDesa.data;
  }

  try {
    const url = 'https://pongpongan-merakurak.desa.id/';
    const { data } = await axios.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      timeout: 5000
    });

    const $ = cheerio.load(data);
    let informasiDesa = '';
    
    // Ambil hanya konten penting
    $('article p, .content-section').each((i, el) => {
      const text = $(el).text().trim();
      if (text.length > 50 && !informasiDesa.includes(text)) {
        informasiDesa += text + '\n\n';
      }
    });

    if (informasiDesa.trim().length > 0) {
      // Potong informasi jika terlalu panjang
      informasiDesa = informasiDesa.substring(0, 2000);
      cacheDataDesa = {
        data: informasiDesa,
        lastUpdated: Date.now()
      };
      return informasiDesa;
    }
    return dataCadangan;
  } catch (error) {
    console.warn('⚠ Gagal mengambil data desa:', error.message);
    return cacheDataDesa.data || dataCadangan;
  }
}

async function extractTextFromFile(filePath, mimetype) {
  try {
    let text = '';
    
    if (mimetype.startsWith('image/')) {
      const result = await Tesseract.recognize(filePath, 'ind');
      text = result.data.text || '';
    } else if (mimetype === 'application/pdf') {
      const dataBuffer = await fs.readFile(filePath);
      const pdfData = await pdfParse(dataBuffer);
      text = pdfData.text || '';
    } else if (mimetype.includes('wordprocessingml.document') || mimetype.includes('msword')) {
      const buffer = await fs.readFile(filePath);
      const result = await mammoth.extractRawText({ buffer });
      text = result.value || '';
    } else if (mimetype === 'text/plain') {
      text = await fs.readFile(filePath, 'utf-8');
    }

    // Potong teks jika terlalu panjang
    return text.substring(0, 3000);
  } catch (error) {
    console.warn('Gagal ekstrak teks:', error.message);
    return '';
  } finally {
    try {
      await fs.unlink(filePath);
    } catch (unlinkError) {
      console.warn('Gagal menghapus file:', unlinkError.message);
    }
  }
}

// Fungsi untuk mengoptimalkan pesan
function optimalkanPesan(messages) {
  return messages.map(msg => ({
    role: msg.role,
    content: msg.content.substring(0, 1500)
  }));
}

app.post('/chat', async (req, res) => {
  handleFileUpload(req, res, async () => {
    const { message } = req.body;
    const file = req.file;

    if (!message?.trim() && !file) {
      return res.status(400).json({ error: 'Harap masukkan pesan atau unggah file.' });
    }

    try {
      let fileContent = '';
      if (file) {
        fileContent = await extractTextFromFile(file.path, file.mimetype);
      }

      const infoDesa = await ambilDataDesa();
      const groqKey = process.env.GROQ_API_KEY;
      if (!groqKey) {
        console.error('GROQ_API_KEY tidak ditemukan');
        return res.status(500).json({ 
          reply: 'Konfigurasi sistem tidak lengkap. Silakan hubungi administrator.'
        });
      }

      // Batasi riwayat percakapan
      riwayatPercakapan.push({ 
        role: 'user', 
        content: message?.trim() || (fileContent ? '(Pesan dari file)' : '') 
      });
      
      if (riwayatPercakapan.length > MAX_HISTORY * 2) {
        riwayatPercakapan = riwayatPercakapan.slice(-MAX_HISTORY * 2);
      }

      const messages = [
        {
          role: 'system',
          content: `Anda adalah asisten cerdas untuk Desa Pongpongan. Jawablah pertanyaan dengan bahasa Indonesia yang sopan, jelas, dan informatif. Gunakan informasi berikut:\n\n${infoDesa.substring(0, 1000)}`
        },
        ...riwayatPercakapan,
        ...(fileContent ? [{
          role: 'user',
          content: `Isi file:\n${fileContent.substring(0, 1000)}`
        }] : []),
      ];

      const optimizedMessages = optimalkanPesan(messages);

      const response = await axios.post(
        'https://api.groq.com/openai/v1/chat/completions',
        {
          model: 'llama3-8b-8192',
          messages: optimizedMessages,
          temperature: 0.7,
          max_tokens: 800,
        },
        {
          headers: {
            Authorization: `Bearer ${groqKey}`,
            'Content-Type': 'application/json',
          },
          timeout: 10000
        }
      );

      const botReply = response.data.choices[0]?.message?.content?.trim() || 'Maaf, tidak dapat memproses permintaan Anda.';
      riwayatPercakapan.push({ role: 'assistant', content: botReply });

      return res.json({ reply: botReply });
    } catch (error) {
      console.error('❌ Error:', error.response?.data || error.message);
      
      let errorMessage = 'Maaf, terjadi kesalahan. Silakan coba lagi.';
      if (error.response?.data?.error?.code === 'rate_limit_exceeded') {
        errorMessage = 'Sistem sedang sibuk. Silakan coba beberapa saat lagi atau kurangi panjang pesan.';
      }

      return res.status(500).json({
        reply: `${errorMessage}\n\nBerikut informasi dasar:\n${dataCadangan.substring(0, 500)}`
      });
    }
  });
});

// Endpoint untuk membaca file
app.post('/read-file', async (req, res) => {
  handleFileUpload(req, res, async () => {
    const file = req.file;
    
    if (!file) {
      return res.status(400).json({ error: 'Harap unggah file terlebih dahulu.' });
    }

    try {
      const fileContent = await extractTextFromFile(file.path, file.mimetype);
      
      if (!fileContent.trim()) {
        return res.status(400).json({ error: 'Tidak dapat mengekstrak teks dari file atau file kosong.' });
      }

      return res.json({
        filename: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
        content: fileContent
      });
    } catch (error) {
      console.error('Error membaca file:', error);
      return res.status(500).json({ 
        error: 'Gagal memproses file',
        details: error.message 
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server berjalan di http://localhost:${PORT}`));

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});
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
const cheerio = require('cheerio');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

const upload = multer({ dest: 'uploads/' });

// ✅ Data cadangan jika gagal scrape
const dataCadangan = `
Profil Desa Pongpongan:
- Kecamatan: Merakurak
- Kabupaten: Tuban, Jawa Timur
- Kode Pos: 62355
- Luas Wilayah: 3,12 km²
- Jumlah Penduduk: ± 3.000 jiwa

Visi Desa:
"Terwujudnya Desa Pongpongan yang maju, mandiri, dan sejahtera berbasis gotong royong."

Misi Desa:
1. Peningkatan pelayanan publik.
2. Pengembangan ekonomi desa berbasis UMKM.
3. Pembangunan infrastruktur yang merata.
4. Penguatan nilai sosial dan budaya.

Layanan Desa:
- Surat Keterangan Domisili
- Surat Keterangan Usaha
- Surat Pengantar Nikah
- Informasi Bantuan Sosial
`;

// ✅ Ambil data dari situs desa (scraping)
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
    console.warn('⚠ Gagal ambil data desa, coba gunakan cache atau cadangan.');
    if (fs.existsSync(cacheFile)) {
      const cacheData = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      return cacheData.info || dataCadangan;
    }
    return dataCadangan;
  }
}

// ✅ Endpoint Chat
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

    const infoDesa = await ambilDataDesa();

    const prompt = `
Anda adalah asisten Desa Pongpongan.
Jawablah dengan bahasa sopan dan informatif.
Gunakan informasi resmi berikut:

${infoDesa}

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

    const botReply = response?.data?.choices?.[0]?.message?.content || 'Bot tidak bisa menjawab.';

    res.json({ reply: botReply });

  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({ error: 'Terjadi kesalahan server.' });
  }
});

// ✅ Fungsi ekstrak teks dari file
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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server jalan di http://localhost:${PORT}`));
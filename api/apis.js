const express = require('express');
const multer = require('multer');
const { createWorker } = require('tesseract.js');
const app = express();
const cors = require('cors');
app.use(cors());
const port = process.env.PORT || 3001;

// Set up storage for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

// OCR worker
const worker = createWorker();

app.post('/api/receipts/upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  try {
    // Initialize the OCR worker
    await worker.load();
    await worker.loadLanguage('eng');
    await worker.initialize('eng');

    // Perform OCR on the uploaded image buffer
    const { data: { text } } = await worker.recognize(req.file.buffer);

    // Log and send the OCR result
    console.log('OCR Result:', text);
    res.json({ text });

    // Clean up
    await worker.terminate();
  } catch (error) {
    console.error('OCR processing failed:', error);
    res.status(500).send('OCR processing failed.');
  }
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});


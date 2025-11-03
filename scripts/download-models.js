/**
 * Download ML models for local bundling
 * Run: node scripts/download-models.js
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, '..', 'lib', 'vendor', 'models');

// Model files to download from HuggingFace
const MODELS = {
  'embeddings': {
    repo: 'Xenova/all-MiniLM-L6-v2',
    files: [
      'onnx/model.onnx',
      'onnx/model_quantized.onnx',
      'tokenizer.json',
      'tokenizer_config.json',
      'config.json',
      'special_tokens_map.json'
    ]
  },
  'classification': {
    repo: 'Xenova/distilbert-base-uncased-mnli',
    files: [
      'onnx/model.onnx',
      'onnx/model_quantized.onnx',
      'tokenizer.json',
      'tokenizer_config.json',
      'config.json',
      'special_tokens_map.json',
      'vocab.txt'
    ]
  },
  'ner': {
    repo: 'Xenova/bert-base-NER',
    files: [
      'onnx/model.onnx',
      'onnx/model_quantized.onnx',
      'tokenizer.json',
      'tokenizer_config.json',
      'config.json',
      'special_tokens_map.json',
      'vocab.txt'
    ]
  }
};

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);

    https.get(url, (response) => {
      // Follow all redirect status codes
      if (response.statusCode === 301 || response.statusCode === 302 ||
          response.statusCode === 307 || response.statusCode === 308) {
        file.close();
        fs.unlinkSync(dest);
        // Follow redirect
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      const totalBytes = parseInt(response.headers['content-length'], 10);
      let downloadedBytes = 0;

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
        const progress = ((downloadedBytes / totalBytes) * 100).toFixed(1);
        process.stdout.write(`\r  Downloading: ${progress}%`);
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        process.stdout.write('\r  ✓ Downloaded\n');
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });
  });
}

async function downloadModel(modelName, modelConfig) {
  console.log(`\n📦 Downloading ${modelName} (${modelConfig.repo})...`);

  const modelDir = path.join(MODELS_DIR, modelName);
  fs.mkdirSync(modelDir, { recursive: true });
  fs.mkdirSync(path.join(modelDir, 'onnx'), { recursive: true });

  for (const file of modelConfig.files) {
    const url = `https://huggingface.co/${modelConfig.repo}/resolve/main/${file}`;
    const dest = path.join(modelDir, file);

    // Skip if already exists
    if (fs.existsSync(dest)) {
      console.log(`  ✓ ${file} (already exists)`);
      continue;
    }

    console.log(`  📥 ${file}`);
    try {
      await downloadFile(url, dest);
    } catch (error) {
      console.error(`  ✗ Failed to download ${file}:`, error.message);
    }
  }
}

async function main() {
  console.log('🤖 Downloading ML models for local bundling...');
  console.log(`📂 Target directory: ${MODELS_DIR}\n`);

  // Create models directory
  fs.mkdirSync(MODELS_DIR, { recursive: true });

  // Download each model
  for (const [name, config] of Object.entries(MODELS)) {
    await downloadModel(name, config);
  }

  console.log('\n✅ All models downloaded!');
  console.log('\n📊 Model sizes:');

  // Calculate sizes
  for (const [name] of Object.entries(MODELS)) {
    const modelDir = path.join(MODELS_DIR, name);
    if (fs.existsSync(modelDir)) {
      const size = getDirectorySize(modelDir);
      console.log(`  ${name}: ${(size / 1024 / 1024).toFixed(1)} MB`);
    }
  }
}

function getDirectorySize(dir) {
  let size = 0;
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const filePath = path.join(dir, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      size += getDirectorySize(filePath);
    } else {
      size += stats.size;
    }
  }

  return size;
}

main().catch(console.error);

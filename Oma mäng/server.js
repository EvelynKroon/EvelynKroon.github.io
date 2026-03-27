const express = require('express');
const cors = require('cors');
const fs = require('fs/promises');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DEFAULT_DATA_DIR = path.join(__dirname, 'data');
const DATA_DIR = process.env.LOCALAPPDATA
  ? path.join(process.env.LOCALAPPDATA, 'CyberDriveAdventure')
  : DEFAULT_DATA_DIR;
const SAVE_FILE = path.join(DATA_DIR, 'progress.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

async function ensureSaveFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    await fs.access(SAVE_FILE);
  } catch {
    await fs.writeFile(SAVE_FILE, JSON.stringify({ players: {} }, null, 2), 'utf8');
  }
}

async function readSaveData() {
  await ensureSaveFile();
  const raw = await fs.readFile(SAVE_FILE, 'utf8');
  return JSON.parse(raw);
}

async function writeSaveData(data) {
  await fs.writeFile(SAVE_FILE, JSON.stringify(data, null, 2), 'utf8');
}

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'save-server' });
});

app.get('/api/progress/:playerName', async (req, res) => {
  try {
    const playerName = String(req.params.playerName || '').trim();
    if (!playerName) {
      return res.status(400).json({ error: 'Player name is required.' });
    }

    const db = await readSaveData();
    const player = db.players[playerName];
    if (!player) {
      return res.status(404).json({ error: 'Save not found.' });
    }

    return res.json({ playerName, progress: player });
  } catch (error) {
    console.error('GET progress error:', error);
    return res.status(500).json({ error: 'Failed to load progress.' });
  }
});

app.post('/api/progress', async (req, res) => {
  try {
    const { playerName, progress } = req.body || {};
    const normalizedName = String(playerName || '').trim();

    if (!normalizedName) {
      return res.status(400).json({ error: 'Player name is required.' });
    }

    if (!progress || typeof progress !== 'object') {
      return res.status(400).json({ error: 'Progress object is required.' });
    }

    const db = await readSaveData();
    db.players[normalizedName] = {
      ...progress,
      savedAt: new Date().toISOString()
    };

    await writeSaveData(db);
    return res.json({ ok: true });
  } catch (error) {
    console.error('POST progress error:', error);
    return res.status(500).json({ error: 'Failed to save progress.' });
  }
});

app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

ensureSaveFile()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Game server listening on http://localhost:${PORT}`);
      console.log(`Save file: ${SAVE_FILE}`);
    });
  })
  .catch((error) => {
    console.error('Server startup failed:', error);
    process.exit(1);
  });

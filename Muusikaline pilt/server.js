const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Serve the frontend files from the public directory.
app.use(express.static(path.join(__dirname, 'public')));

// A tiny health endpoint that is useful when deploying or testing if the server is alive.
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.listen(PORT, () => {
  // Clear startup message so users know where to open the app.
  console.log(`Photo-to-Music app is running at http://localhost:${PORT}`);
});

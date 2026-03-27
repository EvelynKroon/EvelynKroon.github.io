const express = require("express");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const API_BASE = "https://starwars-databank-server.onrender.com/api/v1";

const ALLOWED_CATEGORIES = ["characters", "droids", "vehicles", "species", "locations"];

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  next();
});

app.use(express.static(path.join(__dirname, "public")));

function normalizeItems(payload) {
  if (Array.isArray(payload)) {
    return payload;
  }

  if (Array.isArray(payload.data)) {
    return payload.data;
  }

  if (Array.isArray(payload.results)) {
    return payload.results;
  }

  return [];
}

app.get("/api/:category", async (req, res) => {
  const { category } = req.params;

  if (!ALLOWED_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: "Invalid category" });
  }

  const url = `${API_BASE}/${category}?page=1&limit=8`;

  try {
    const response = await fetch(url);

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Failed to fetch ${category}`,
      });
    }

    const data = await response.json();
    const items = normalizeItems(data).slice(0, 8);

    return res.json({
      category,
      count: items.length,
      items,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Unexpected server error while calling external API",
      details: error.message,
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});

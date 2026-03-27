const express = require('express');
const app = express();
const PORT = process.env.PORT || 3001;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

app.use(express.static('public'));

// Cat data with local images
const catData = [
  {
    id: 1,
    name: 'Fluffy',
    breed: 'Persian',
    age: 3,
    description: 'A calm and gentle Persian cat who loves to nap in sunny spots.',
    image: '/kotik111.jpeg'
  },
  {
    id: 2,
    name: 'Whiskers',
    breed: 'Tabby',
    age: 2,
    description: 'Energetic and playful tabby with a curious personality.',
    image: '/kotik323.jpg'
  },
  {
    id: 3,
    name: 'Luna',
    breed: 'Siamese',
    age: 4,
    description: 'Elegant Siamese cat with bright blue eyes and a musical voice.',
    image: '/kotik453.jpg'
  },
  {
    id: 4,
    name: 'Shadow',
    breed: 'Tabby Mix',
    age: 1,
    description: 'Young and adorable kitten with white paws, full of energy and love.',
    image: '/milikotik.jpg'
  },
  {
    id: 5,
    name: 'Mittens',
    breed: 'Black Domestic',
    age: 5,
    description: 'Mysterious and loyal black cat who enjoys peaceful environments.',
    image: '/ezemilikotik.jpg'
  }
];

// API endpoint to get all cats
app.get('/api/cats', (req, res) => {
  res.json(catData);
});

// API endpoint to get a single cat by ID
app.get('/api/cats/:id', (req, res) => {
  const cat = catData.find(c => c.id === parseInt(req.params.id));
  if (cat) {
    res.json(cat);
  } else {
    res.status(404).json({ message: 'Cat not found' });
  }
});

app.listen(PORT, () => {
  console.log(`Cat Cards App is running on http://localhost:${PORT}`);
});

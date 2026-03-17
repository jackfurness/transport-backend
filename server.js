const express = require('express');
const cors = require('cors');
const getDepartures = require('./services/getDepartures');
const favourites = require('./config/favourites');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());

app.get('/', (req, res) => {
  res.json({ message: 'Transport backend is running' });
});

app.get('/api/departures', (req, res) => {
  res.json({
    message: 'Choose a favourite endpoint',
    availableFavourites: Object.keys(favourites)
  });
});

app.get('/api/departures/:favouriteId', async (req, res) => {
  try {
    const { favouriteId } = req.params;
    const result = await getDepartures(favouriteId);

    if (!result) {
      return res.status(404).json({ error: 'Favourite not found' });
    }

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
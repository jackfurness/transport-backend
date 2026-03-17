const express = require('express');
const mockDepartures = require('./data/mockDepartures');

const app = express();
const PORT = process.env.PORT || 3000;

// Root route, useful for checking if the server is alive
app.get('/', (req, res) => {
  res.json({
    message: 'Transport backend is running'
  });
});

// Main departures endpoint with mock data
app.get('/api/departures/centraal-26', (req, res) => {
  res.json({
    stopName: mockDepartures.stopName,
    updatedAt: new Date().toISOString(),
    departures: mockDepartures.departures
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
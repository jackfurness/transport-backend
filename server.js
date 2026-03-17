const express = require('express');

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
    stopName: 'Amsterdam Centraal',
    updatedAt: new Date().toISOString(),
    departures: [
      {
        line: '26',
        mode: 'tram',
        destination: 'IJburg',
        scheduledTime: '2026-03-17T10:14:00+01:00',
        expectedTime: '2026-03-17T10:15:00+01:00',
        delayMinutes: 1
      },
      {
        line: '26',
        mode: 'tram',
        destination: 'IJburg',
        scheduledTime: '2026-03-17T10:19:00+01:00',
        expectedTime: '2026-03-17T10:19:00+01:00',
        delayMinutes: 0
      },
      {
        line: '26',
        mode: 'tram',
        destination: 'IJburg',
        scheduledTime: '2026-03-17T10:24:00+01:00',
        expectedTime: '2026-03-17T10:26:00+01:00',
        delayMinutes: 2
      }
    ]
  });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
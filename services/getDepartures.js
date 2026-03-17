async function getDepartures(favouriteId) {
  if (favouriteId !== 'centraal-26') {
    return null;
  }

  return {
    favouriteId,
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
      }
    ]
  };
}

module.exports = getDepartures;

const favourites = require('../config/favourites');

async function getDepartures(favouriteId) {
  const favourite = favourites[favouriteId];

  if (!favourite) {
    return null;
  }

  const { sourceType, sourceCode, line, mode, stopName } = favourite;

  const url = `http://v0.ovapi.nl/${sourceType}/${sourceCode}/departures`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`OVapi request failed with status ${response.status}`);
  }

  const rawData = await response.json();

  const departures = extractDepartures(rawData, { line, mode });

  return {
    favouriteId,
    stopName,
    updatedAt: new Date().toISOString(),
    departures
  };
}

function extractDepartures(rawData, filters) {
  const allDepartures = [];

  for (const outerKey of Object.keys(rawData)) {
    const outerValue = rawData[outerKey];

    if (!outerValue || typeof outerValue !== 'object') {
      continue;
    }

    for (const innerKey of Object.keys(outerValue)) {
      const stopBlock = outerValue[innerKey];

      if (!stopBlock || typeof stopBlock !== 'object') {
        continue;
      }

      const passes = stopBlock.Passes;

      if (!passes || typeof passes !== 'object') {
        continue;
      }

      for (const passKey of Object.keys(passes)) {
        const pass = passes[passKey];

        if (!pass || typeof pass !== 'object') {
          continue;
        }

        const mapped = mapPassToDeparture(pass);

        if (!mapped) {
          continue;
        }

        if (filters.line && mapped.line !== filters.line) {
          continue;
        }

        if (filters.mode && mapped.mode !== filters.mode) {
          continue;
        }

        allDepartures.push(mapped);
      }
    }
  }

  allDepartures.sort((a, b) => {
    return new Date(a.expectedTime).getTime() - new Date(b.expectedTime).getTime();
  });

  return allDepartures.slice(0, 5);
}

function mapPassToDeparture(pass) {
  const line = pass.LinePublicNumber || null;

  const destination =
    pass.DestinationName50 ||
    pass.DestinationName16 ||
    pass.LineDestination ||
    'Unknown destination';

  const expectedTime =
    pass.ExpectedDepartureTime ||
    pass.TargetDepartureTime ||
    pass.PassingTime ||
    null;

  const scheduledTime =
    pass.TargetDepartureTime ||
    pass.ExpectedDepartureTime ||
    pass.PassingTime ||
    null;

  if (!expectedTime && !scheduledTime) {
    return null;
  }

  return {
    line,
    mode: inferMode(pass),
    destination,
    scheduledTime,
    expectedTime: expectedTime || scheduledTime,
    delayMinutes: getDelayMinutes(scheduledTime, expectedTime || scheduledTime)
  };
}

function inferMode(pass) {
  const transportType = `${pass.TransportType || ''}`.toLowerCase();
  const lineName = `${pass.LineName || ''}`.toLowerCase();

  if (transportType.includes('tram') || lineName.includes('tram')) return 'tram';
  if (transportType.includes('metro') || lineName.includes('metro')) return 'metro';
  if (transportType.includes('veer') || transportType.includes('ferry')) return 'ferry';
  if (transportType.includes('bus')) return 'bus';

  return 'unknown';
}

function getDelayMinutes(scheduledTime, expectedTime) {
  if (!scheduledTime || !expectedTime) {
    return 0;
  }

  const scheduled = new Date(scheduledTime).getTime();
  const expected = new Date(expectedTime).getTime();

  if (Number.isNaN(scheduled) || Number.isNaN(expected)) {
    return 0;
  }

  return Math.round((expected - scheduled) / 60000);
}

module.exports = getDepartures;
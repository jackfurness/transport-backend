const favourites = require('../config/favourites');
const { getCache, setCache } = require('../utils/cache');

async function getDepartures(favouriteId) {
  const cached = getCache(favouriteId);
  if (cached) {
    return cached;
  }

  const favourite = favourites[favouriteId];

  if (!favourite) {
    return null;
  }

  const {
    sourceType,
    sourceCode,
    line,
    mode,
    stopName,
    timingPointCode,
    destinationIncludes
  } = favourite;

  const url = `http://v0.ovapi.nl/${sourceType}/${sourceCode}/departures`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`OVapi request failed with status ${response.status}`);
  }

  const rawData = await response.json();

  const departures = extractDepartures(rawData, {
    line,
    mode,
    timingPointCode,
    destinationIncludes
  });

  const result = {
    favouriteId,
    stopName,
    updatedAt: new Date().toISOString(),
    departures
  };

  setCache(favouriteId, result, 30000);

  return result;
}

function extractDepartures(rawData, filters) {
  const allDepartures = [];
  const now = Date.now();

  for (const stopAreaKey of Object.keys(rawData)) {
    const stopArea = rawData[stopAreaKey];

    if (!stopArea || typeof stopArea !== 'object') {
      continue;
    }

    for (const timingPointKey of Object.keys(stopArea)) {
      const stopBlock = stopArea[timingPointKey];

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

        if (
          filters.timingPointCode &&
          mapped.timingPointCode !== filters.timingPointCode
        ) {
          continue;
        }

        if (
          filters.destinationIncludes &&
          !mapped.destination.toLowerCase().includes(filters.destinationIncludes.toLowerCase())
        ) {
          continue;
        }

        const expectedMs = new Date(mapped.expectedTime).getTime();

        if (Number.isNaN(expectedMs)) {
          continue;
        }

        // Drop departures already gone more than 1 minute ago
        if (expectedMs < now - 60000) {
          continue;
        }

        allDepartures.push(mapped);
      }
    }
  }

  allDepartures.sort((a, b) => {
    return new Date(a.expectedTime).getTime() - new Date(b.expectedTime).getTime();
  });

  return dedupeDepartures(allDepartures).slice(0, 5);
}

function mapPassToDeparture(pass) {
  const line = pass.LinePublicNumber || null;
  const destination = pass.DestinationName50 || 'Unknown destination';

  const scheduledTime = pass.TargetDepartureTime || null;
  const expectedTime = pass.ExpectedDepartureTime || pass.TargetDepartureTime || null;

  if (!expectedTime) {
    return null;
  }

  return {
    line,
    mode: inferMode(pass),
    destination,
    scheduledTime,
    expectedTime,
    delayMinutes: getDelayMinutes(scheduledTime, expectedTime),
    minutesUntil: getMinutesUntil(expectedTime),
    timingPointCode: pass.TimingPointCode || null,
    timingPointName: pass.TimingPointName || null,
    operator: pass.OperatorCode || null,
    tripStatus: pass.TripStopStatus || null
  };
}

function getMinutesUntil(expectedTime) {
  const expected = new Date(expectedTime).getTime();

  if (Number.isNaN(expected)) {
    return null;
  }

  return Math.max(0, Math.round((expected - Date.now()) / 60000));
}

function inferMode(pass) {
  const transportType = `${pass.TransportType || ''}`.toLowerCase();

  if (transportType.includes('tram')) return 'tram';
  if (transportType.includes('metro')) return 'metro';
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

function dedupeDepartures(departures) {
  const seen = new Set();
  const result = [];

  for (const dep of departures) {
    const key = `${dep.timingPointCode}-${dep.line}-${dep.destination}-${dep.expectedTime}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(dep);
  }

  return result;
}

module.exports = getDepartures;
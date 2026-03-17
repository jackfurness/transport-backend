const favourites = require('../config/favourites');
const { getCache, setCache } = require('../utils/cache');
const { DateTime } = require('luxon');

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
    updatedAt: getLocalIsoTime(),
    departures
  };

  setCache(favouriteId, result, 30000);

  return result;
}


function extractDepartures(rawData, filters) {
  const allDepartures = [];
  const now = DateTime.now().setZone('Europe/Amsterdam');

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

        const expected = DateTime.fromISO(mapped.expectedTime, {
          zone: 'Europe/Amsterdam'
        });

        if (!expected.isValid) {
          continue;
        }

        // Drop departures already gone more than 1 minute ago
        if (expected.toMillis() < now.toMillis() - 60000) {
          continue;
        }

        allDepartures.push(mapped);
      }
    }
  }

  allDepartures.sort((a, b) => {
    const aTime = DateTime.fromISO(a.expectedTime, {
      zone: 'Europe/Amsterdam'
    }).toMillis();

    const bTime = DateTime.fromISO(b.expectedTime, {
      zone: 'Europe/Amsterdam'
    }).toMillis();

    return aTime - bTime;
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
  if (!expectedTime) {
    return null;
  }

  const expected = DateTime.fromISO(expectedTime, {
    zone: 'Europe/Amsterdam'
  });

  if (!expected.isValid) {
    return null;
  }

  const now = DateTime.now().setZone('Europe/Amsterdam');
  const diffMinutes = expected.diff(now, 'minutes').minutes;

  return Math.max(0, Math.round(diffMinutes));
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

  const scheduled = DateTime.fromISO(scheduledTime, {
    zone: 'Europe/Amsterdam'
  });

  const expected = DateTime.fromISO(expectedTime, {
    zone: 'Europe/Amsterdam'
  });

  if (!scheduled.isValid || !expected.isValid) {
    return 0;
  }

  return Math.round(expected.diff(scheduled, 'minutes').minutes);
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

function getLocalIsoTime() {
  const now = new Date();

  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);

  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }

  const localString =
    `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}`;

  const utcDate = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }));
  const amsterdamDate = new Date(
    now.toLocaleString('en-US', { timeZone: 'Europe/Amsterdam' })
  );

  const offsetMinutes = Math.round((amsterdamDate - utcDate) / 60000);
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absMinutes = Math.abs(offsetMinutes);
  const offsetHours = String(Math.floor(absMinutes / 60)).padStart(2, '0');
  const offsetMins = String(absMinutes % 60).padStart(2, '0');

  return `${localString}${sign}${offsetHours}:${offsetMins}`;
}

module.exports = getDepartures;
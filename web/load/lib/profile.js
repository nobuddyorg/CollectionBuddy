// Per LOAD_PROFILE; seeds stay under the 50,000-entry owner quota and the local stack's 500 sign-ups per 5 minutes.
const PROFILES = {
  normal: {
    vusScale: 1,
    stages: [
      ['30s', 1],
      ['2m', 1],
      ['15s', 0],
    ],
    searchedItems: 10000,
    sharedItems: 300,
    population: { collectors: 50, entriesEach: 200 },
  },
  peak: {
    vusScale: 5,
    stages: [
      ['1m', 1],
      ['5m', 1],
      ['30s', 0],
    ],
    searchedItems: 25000,
    sharedItems: 1000,
    population: { collectors: 100, entriesEach: 250 },
  },
  stress: {
    vusScale: 20,
    stages: [
      ['2m', 0.25],
      ['2m', 0.5],
      ['2m', 1],
      ['2m', 1],
      ['1m', 0],
    ],
    searchedItems: 40000,
    sharedItems: 2000,
    population: { collectors: 200, entriesEach: 200 },
  },
};

export const PROFILE_NAME = __ENV.LOAD_PROFILE;
export const PROFILE = PROFILES[PROFILE_NAME];

if (!PROFILE) {
  throw new Error(
    `LOAD_PROFILE must be one of ${Object.keys(PROFILES).join(', ')}, not ${PROFILE_NAME}`,
  );
}

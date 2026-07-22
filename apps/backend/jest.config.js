/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          // Don't pollute the runtime config with the strict test setup.
          noUnusedLocals: false,
          noUnusedParameters: false,
        },
      },
    ],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Run tests serially so the in-memory mock state doesn't leak between specs.
  // Use --runInBand in CI to be safe.
  testTimeout: 10_000,
};

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/integration'],
  testRegex: '.*\\.integration-spec\\.ts$',
  maxWorkers: 1,
  testTimeout: 30000,
};

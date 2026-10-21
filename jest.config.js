module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testRegex: '.*\\.(spec|e2e-spec)\\.ts$',
  testPathIgnorePatterns: ['<rootDir>/test/integration/commerce.integration-spec.ts'],
  setupFiles: ['<rootDir>/test/mock-runtime-environment.cjs'],
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
};

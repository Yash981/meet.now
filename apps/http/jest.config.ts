import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',          // Use ts-jest to handle TS files
  testEnvironment: 'node',    // Node environment for Express
  testMatch: ['**/tests/**/*.test.ts'], // Where your tests live
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  verbose: true,
};

export default config;
import type { Config } from 'jest';

const config: Config = {
  testEnvironment: 'jest-environment-jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', {
      tsconfig: {
        jsx: 'react-jsx',
        esModuleInterop: true,
      },
    }],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    'lucide-react': '<rootDir>/src/__mocks__/lucide-react.tsx',
    '\\.(css|less|sass|scss)$': '<rootDir>/src/__mocks__/styleMock.ts',
    '\\.(jpg|jpeg|png|gif|svg|ico|webp)$': '<rootDir>/src/__mocks__/fileMock.ts',
  },
  testMatch: ['**/__tests__/**/*.test.(ts|tsx)'],
  transformIgnorePatterns: [
    '/node_modules/(?!(lucide-react|@radix-ui|firebase|@firebase|genkit|@genkit-ai)/)',
  ],
  moduleDirectories: ['node_modules', '<rootDir>/src'],
};

export default config;

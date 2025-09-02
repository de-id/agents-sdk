module.exports = {
    testEnvironment: 'jsdom',
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    roots: ['<rootDir>/src'],
    testMatch: ['**/**.spec.ts', '**/**.test.ts', '**/**.test.tsx'],
    transform: { '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.json' }] },
    extensionsToTreatAsEsm: ['.ts', '.tsx'],
    moduleNameMapper: { '^\\$/(.*)$': '<rootDir>/src/$1', '^%/(.*)$': '<rootDir>/src/types/$1' },
    setupFiles: ['<rootDir>/jest.setup.ts'],
    
    // CI/CD optimizations
    maxWorkers: process.env.CI ? 2 : '50%',
    testTimeout: process.env.CI ? 10000 : 5000,
    verbose: process.env.CI ? false : true,
};

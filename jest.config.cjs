module.exports = {
    testEnvironment: 'jsdom',
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    roots: ['<rootDir>/src'],
    testMatch: ['**/**.spec.ts', '**/**.test.ts', '**/**.test.tsx'],
    transform: { '^.+\\.tsx?$': ['ts-jest', { useESM: true, tsconfig: '<rootDir>/tsconfig.json' }] },
    extensionsToTreatAsEsm: ['.ts', '.tsx'],
    moduleNameMapper: { '^\\$/(.*)$': '<rootDir>/src/$1', '^%/(.*)$': '<rootDir>/src/types/$1' },
    setupFiles: ['<rootDir>/jest.setup.ts'],
    reporters: ['summary'],

    // Coverage configuration - only for files that have tests
    collectCoverage: false, // Only collect when explicitly requested
    collectCoverageFrom: [
        // Only collect coverage from files that have corresponding test files
        'src/services/agent-manager/index.ts',
        'src/services/agent-manager/connect-to-manager.ts',
        'src/services/streaming-manager/index.ts',
    ],
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'text-summary', 'json-summary'],
    coveragePathIgnorePatterns: [
        'node_modules',
        '.*/test-utils/*',
        '.*/types/*',
        '.*/config/environment.ts',
        '.*mock.*',
    ],
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 86,
            lines: 87,
            statements: 80,
        },
    },

    // CI/CD optimizations
    maxWorkers: process.env.CI ? 2 : '50%',
    testTimeout: process.env.CI ? 10000 : 5000,
    verbose: process.env.CI ? false : true,
};

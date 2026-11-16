import { defineConfig } from 'vitest/config';

export default defineConfig({
    resolve: {
        mainFields: ['browser', 'module', 'jsnext:main', 'jsnext'],
        conditions: ['browser', 'module', 'import', 'default']
    },
    test: {
        environment: 'jsdom',
        include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
        setupFiles: ['./tests/setup.ts'],
        testTimeout: 30000,
        hookTimeout: 30000,
        server: {
            deps: {
                inline: ['qrcode']
            }
        }
    }
});

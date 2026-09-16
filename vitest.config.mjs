import { defineConfig } from 'vitest/config';

/* Two projects, one runner.

   unit          one shipped script at a time, loaded exactly as a browser
                 loads it, and its logic pinned down.
   integration   the real index.html with the real scripts booted on top -
                 once as the desktop build, once as the phone build - to pin
                 down how the pieces behave together.

   Both run in jsdom. There is no build step to test against: the files in
   js/ ARE what ships, so the tests load those files directly. */
export default defineConfig({
  test: {
    environment: 'jsdom',
    restoreMocks: true,
    setupFiles: ['./tests/setup.mjs'],
    coverage: {
      provider: 'v8',
      include: ['js/**/*.js'],
      reporter: ['text-summary', 'html'],
    },
    projects: [
      {
        extends: true,
        test: { name: 'unit', include: ['tests/unit/**/*.test.mjs'] },
      },
      {
        extends: true,
        test: { name: 'integration', include: ['tests/integration/**/*.test.mjs'] },
      },
    ],
  },
});

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    // Setiap file tes membangun app & store sendiri, jadi aman berjalan paralel.
    pool: 'threads',
  },
});

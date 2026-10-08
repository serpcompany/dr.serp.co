import { fileURLToPath } from 'node:url'
import { configDefaults, defineConfig } from 'vitest/config'

// Component tests that click and type run in happy-dom; everything else runs in Node.
const domTests = 'src/**/*.dom.test.tsx'

export default defineConfig({
  // tsconfig.json keeps JSX for Next.js (`jsx: preserve`); tests compile it with React's runtime.
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    }
  },
  test: {
    clearMocks: true,
    restoreMocks: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          environment: 'node',
          exclude: [...configDefaults.exclude, domTests]
        }
      },
      {
        extends: true,
        test: { name: 'happy-dom', environment: 'happy-dom', include: [domTests] }
      }
    ]
  }
})

import { writeFileSync } from 'fs';
import { join } from 'path';

export const packageFixtures = {
  nextjsFrontend: {
    name: 'test-frontend',
    version: '1.0.0',
    description: 'A realistic Next.js frontend application for testing workspace generation',
    private: true,
    packageManager: 'npm@9.8.1',
    scripts: { 
      dev: 'next dev',
      build: 'next build && npm run analyze',
      'build:prod': 'NODE_ENV=production next build',
      start: 'next start',
      test: 'jest --coverage --watchAll=false',
      'test:watch': 'jest --watch',
      'test:e2e': 'playwright test',
      lint: 'eslint . --ext .ts,.tsx,.js,.jsx',
      'lint:fix': 'eslint . --ext .ts,.tsx,.js,.jsx --fix',
      'type-check': 'tsc --noEmit',
      analyze: 'cross-env ANALYZE=true next build',
      storybook: 'storybook dev -p 6006',
      'build-storybook': 'storybook build'
    },
    dependencies: {
      'next': '^14.0.0',
      'react': '^18.0.0',
      'react-dom': '^18.0.0',
      '@next/font': '^14.0.0',
      'styled-components': '^6.0.0',
      '@emotion/react': '^11.11.0',
      'framer-motion': '^10.16.0',
      'react-hook-form': '^7.45.0',
      'zustand': '^4.4.0'
    },
    devDependencies: {
      '@types/node': '^20.0.0',
      '@types/react': '^18.2.0',
      '@types/react-dom': '^18.2.0',
      'typescript': '^5.0.0',
      'eslint': '^8.0.0',
      'eslint-config-next': '^14.0.0',
      '@typescript-eslint/eslint-plugin': '^6.0.0',
      'jest': '^29.0.0',
      '@testing-library/react': '^14.0.0',
      '@testing-library/jest-dom': '^6.0.0',
      'playwright': '^1.40.0',
      '@storybook/nextjs': '^7.5.0',
      'cross-env': '^7.0.0',
      '@next/bundle-analyzer': '^14.0.0'
    },
    peerDependencies: {
      'react': '^18.0.0',
      'react-dom': '^18.0.0'
    },
    engines: {
      'node': '>=18.0.0',
      'npm': '>=9.0.0'
    }
  },

  reactCRA: {
    name: 'my-frontend',
    version: '2.1.0',
    description: 'React frontend with Create React App',
    private: true,
    scripts: { 
      dev: 'react-scripts start',
      build: 'react-scripts build',
      'build:analyze': 'npm run build && npx serve -s build',
      test: 'react-scripts test --coverage --watchAll=false',
      'test:watch': 'react-scripts test',
      eject: 'react-scripts eject',
      lint: 'eslint src/ --ext .js,.jsx,.ts,.tsx',
      'lint:fix': 'eslint src/ --ext .js,.jsx,.ts,.tsx --fix',
      prettier: 'prettier --write src/**/*.{js,jsx,ts,tsx,json,css,md}'
    },
    dependencies: {
      'react': '^18.2.0',
      'react-dom': '^18.2.0',
      'react-scripts': '5.0.1',
      '@reduxjs/toolkit': '^1.9.0',
      'react-redux': '^8.1.0',
      'react-router-dom': '^6.8.0',
      'axios': '^1.4.0',
      '@material-ui/core': '^4.12.0'
    },
    devDependencies: {
      '@testing-library/jest-dom': '^5.16.0',
      '@testing-library/react': '^13.4.0',
      '@testing-library/user-event': '^13.5.0',
      '@types/jest': '^27.5.0',
      '@types/node': '^16.18.0',
      '@types/react': '^18.2.0',
      '@types/react-dom': '^18.2.0',
      'eslint': '^8.0.0',
      'prettier': '^2.8.0',
      'typescript': '^4.9.0'
    },
    proxy: 'http://localhost:3001'
  },

  expressBackend: {
    name: 'my-backend',
    version: '1.5.2',
    description: 'Node.js API server with Express and TypeScript',
    main: 'dist/index.js',
    type: 'module',
    scripts: { 
      dev: 'nodemon --exec ts-node src/index.ts',
      'dev:watch': 'nodemon --watch src --ext ts --exec "npm run build && npm start"',
      build: 'tsc && npm run copy-assets',
      'copy-assets': 'cp -r src/assets dist/ || echo "No assets to copy"',
      start: 'node dist/index.js',
      'start:prod': 'NODE_ENV=production node dist/index.js',
      test: 'jest --coverage --forceExit',
      'test:watch': 'jest --watch',
      'test:integration': 'jest --testPathPattern=integration',
      'test:unit': 'jest --testPathPattern=unit',
      lint: 'eslint src/ --ext .ts',
      'lint:fix': 'eslint src/ --ext .ts --fix',
      'type-check': 'tsc --noEmit',
      'db:migrate': 'prisma migrate dev',
      'db:seed': 'tsx src/scripts/seed.ts'
    },
    dependencies: {
      'express': '^4.18.0',
      'cors': '^2.8.5',
      'helmet': '^7.0.0',
      'compression': '^1.7.4',
      '@prisma/client': '^5.0.0',
      'bcrypt': '^5.1.0',
      'jsonwebtoken': '^9.0.0',
      'joi': '^17.9.0',
      'winston': '^3.10.0',
      'dotenv': '^16.3.0'
    },
    devDependencies: {
      '@types/express': '^4.17.0',
      '@types/cors': '^2.8.0',
      '@types/bcrypt': '^5.0.0',
      '@types/jsonwebtoken': '^9.0.0',
      '@types/node': '^20.0.0',
      '@types/jest': '^29.5.0',
      'typescript': '^5.0.0',
      'ts-node': '^10.9.0',
      'nodemon': '^3.0.0',
      'jest': '^29.0.0',
      'supertest': '^6.3.0',
      '@types/supertest': '^2.0.12',
      'eslint': '^8.0.0',
      '@typescript-eslint/parser': '^6.0.0',
      '@typescript-eslint/eslint-plugin': '^6.0.0',
      'tsx': '^3.12.0',
      'prisma': '^5.0.0'
    },
    engines: {
      'node': '>=18.0.0',
      'yarn': '>=1.22.0'
    }
  },

  simple: {
    name: 'simple-test',
    version: '1.0.0',
    scripts: { dev: 'echo "simple"' }
  }
} as const;

/**
 * Helper function to create package.json files from fixtures
 */
export function createPackageJson(dir: string, fixture: keyof typeof packageFixtures): void {
  writeFileSync(
    join(dir, 'package.json'), 
    JSON.stringify(packageFixtures[fixture], null, 2)
  );
}
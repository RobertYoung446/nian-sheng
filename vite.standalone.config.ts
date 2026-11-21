import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { resolve } from 'node:path';
export default defineConfig({ root:resolve('standalone'), base:'./', plugins:[react()], css:{postcss:{plugins:[tailwindcss()]}}, build:{outDir:resolve('public/local'),emptyOutDir:false} });

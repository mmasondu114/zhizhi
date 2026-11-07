import fs from 'node:fs';
import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],define:{__APP_VERSION__:JSON.stringify(JSON.parse(fs.readFileSync(new URL('./package.json',import.meta.url),'utf8')).version)},build:{chunkSizeWarningLimit:900}});

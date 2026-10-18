import { defineConfig } from 'vite';
import manifest from '../../manifest.json';
export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 4174,
    strictPort: true,
    headers: { 'Content-Security-Policy': manifest.content_security_policy.extension_pages },
  },
});

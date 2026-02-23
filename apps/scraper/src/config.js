import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(__dirname, '..', '.env') });

export default {
  upseller: {
    url: process.env.UPSELLER_URL,
    email: process.env.UPSELLER_EMAIL,
    password: process.env.UPSELLER_PASSWORD,
  },
  anticaptcha: {
    key: process.env.ANTICAPTCHA_KEY,
  },
  imap: {
    host: process.env.IMAP_HOST || 'imap.gmail.com',
    port: Number(process.env.IMAP_PORT) || 993,
    user: process.env.IMAP_USER,
    pass: process.env.IMAP_PASS,
    from: process.env.IMAP_FROM,
  },
  server: {
    uploadUrl: process.env.SERVER_UPLOAD_URL || 'http://localhost:3000/api/upload',
  },
};

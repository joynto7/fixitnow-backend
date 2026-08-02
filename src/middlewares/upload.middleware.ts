import multer from 'multer';
import { AppError } from '../utils/AppError';

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Both profile photos and service media upload straight to Cloudflare R2, so
// both are buffered in memory rather than written to local disk - Render's
// disk is ephemeral and gets wiped on every redeploy.
export const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new AppError(400, 'Only JPEG, PNG, or WebP images are allowed'));
      return;
    }
    cb(null, true);
  },
}).single('photo');

const ALLOWED_MEDIA_MIME_TYPES = [...ALLOWED_MIME_TYPES, 'video/mp4', 'video/webm', 'video/quicktime'];

export const uploadMedia = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MEDIA_MIME_TYPES.includes(file.mimetype)) {
      cb(new AppError(400, 'Only JPEG/PNG/WebP images or MP4/WebM/MOV videos are allowed'));
      return;
    }
    cb(null, true);
  },
}).single('media');

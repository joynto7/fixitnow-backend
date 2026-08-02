import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { AppError } from '../utils/AppError';

const uploadDir = path.join(__dirname, '../../uploads/technician-photos');
fs.mkdirSync(uploadDir, { recursive: true });

const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${req.user!.id}-${Date.now()}${path.extname(file.originalname)}`),
});

export const uploadPhoto = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_MIME_TYPES.includes(file.mimetype)) {
      cb(new AppError(400, 'Only JPEG, PNG, or WebP images are allowed'));
      return;
    }
    cb(null, true);
  },
}).single('photo');

// Service media (work photos/videos) uploads straight to Cloudinary, so it's
// buffered in memory rather than written to local disk like the profile photo.
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

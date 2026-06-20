import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { Request, Response, NextFunction } from 'express';

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';

// Ensure upload directory exists locally
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer Disk Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Generate secure unique filename: timestamp + random characters + original extension
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

// Allowed MIME types
const ALLOWED_MIMETYPES = ['image/jpeg', 'image/png', 'image/webp'];

// File filter validator
const fileFilter = (req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  if (ALLOWED_MIMETYPES.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('INVALID_FILE_TYPE'));
  }
};

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5 MB limit
  },
  fileFilter: fileFilter
}).single('image');

/**
 * Express middleware wrapper to catch Multer errors and return clean structured JSON
 */
export function uploadMiddleware(req: Request, res: Response, next: NextFunction) {
  upload(req, res, (err: any) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            error: {
              code: 'FILE_TOO_LARGE',
              message: 'File size exceeds the 5 MB limit.'
            }
          });
        }
        return res.status(400).json({
          error: {
            code: 'UPLOAD_ERROR',
            message: `Multer upload error: ${err.message}`
          }
        });
      }
      
      if (err.message === 'INVALID_FILE_TYPE') {
        return res.status(400).json({
          error: {
            code: 'INVALID_FILE_TYPE',
            message: 'Only JPG, PNG, and WEBP formats are allowed.'
          }
        });
      }

      return res.status(400).json({
        error: {
          code: 'UPLOAD_ERROR',
          message: err.message || 'An error occurred during file upload.'
        }
      });
    }

    if (!req.file) {
      return res.status(400).json({
        error: {
          code: 'NO_FILE_UPLOADED',
          message: 'Please provide an image file to upload.'
        }
      });
    }

    return next();
  });
}
export default uploadMiddleware;

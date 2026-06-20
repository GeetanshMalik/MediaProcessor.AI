import fs from 'fs';
import path from 'path';

export class StorageService {
  /**
   * Generates the public access URL for a given file
   */
  static getFileUrl(filename: string): string {
    const port = process.env.PORT || 5000;
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${port}`;
    return `${backendUrl}/uploads/${filename}`;
  }

  /**
   * Handles file storage after upload.
   * Files are written directly to the uploads directory by Multer, so this returns the public URL.
   */
  static async uploadFile(filename: string, localFilePath: string): Promise<string> {
    return this.getFileUrl(filename);
  }

  /**
   * Deletes a file from local storage.
   */
  static async deleteFile(filename: string): Promise<void> {
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    const filePath = path.join(uploadDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
export default StorageService;

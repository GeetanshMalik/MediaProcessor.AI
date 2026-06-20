import fs from 'fs';
import path from 'path';

export class StorageService {
  /**
   * Generates the public access URL for a given file
   */
  static getFileUrl(filename: string): string {
    const provider = process.env.STORAGE_PROVIDER || 'local';

    if (provider === 'r2') {
      const publicUrl = process.env.R2_PUBLIC_URL || '';
      return `${publicUrl}/${filename}`;
    }

    // Default: Local Development
    const port = process.env.PORT || 5000;
    return `http://localhost:${port}/uploads/${filename}`;
  }

  /**
   * Handles uploading local temporary files to production storage (Cloudflare R2).
   * For local development, this is a no-op since Multer writes directly to the shared disk volume.
   */
  static async uploadFile(filename: string, localFilePath: string): Promise<string> {
    const provider = process.env.STORAGE_PROVIDER || 'local';

    if (provider === 'r2') {
      try {
        const endpoint = process.env.R2_ENDPOINT;
        const accessKeyId = process.env.R2_ACCESS_KEY_ID;
        const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
        const bucketName = process.env.R2_BUCKET_NAME;

        if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
          throw new Error('Missing Cloudflare R2 credentials in environment variables.');
        }

        // Dynamic require to avoid bundling @aws-sdk when not installed (local dev)
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

        const s3 = new S3Client({
          region: 'auto',
          endpoint,
          credentials: {
            accessKeyId,
            secretAccessKey
          }
        });

        const fileStream = fs.readFileSync(localFilePath);
        let contentType = 'image/jpeg';
        if (filename.toLowerCase().endsWith('.png')) contentType = 'image/png';
        if (filename.toLowerCase().endsWith('.webp')) contentType = 'image/webp';

        await s3.send(
          new PutObjectCommand({
            Bucket: bucketName,
            Key: filename,
            Body: fileStream,
            ContentType: contentType
          })
        );

        // Delete the local copy after successful Cloudflare R2 sync
        try {
          fs.unlinkSync(localFilePath);
        } catch (unlinkErr) {
          console.warn('Failed to delete temporary local file:', unlinkErr);
        }

        const publicUrl = process.env.R2_PUBLIC_URL || '';
        return `${publicUrl}/${filename}`;
      } catch (error: any) {
        console.error('[Storage Service] R2 Upload failed:', error.message);
        throw new Error(`Cloudflare R2 Upload failed: ${error.message}`);
      }
    }

    return this.getFileUrl(filename);
  }

  /**
   * Deletes a file from storage (local or R2).
   */
  static async deleteFile(filename: string): Promise<void> {
    const provider = process.env.STORAGE_PROVIDER || 'local';

    if (provider === 'r2') {
      try {
        const endpoint = process.env.R2_ENDPOINT;
        const accessKeyId = process.env.R2_ACCESS_KEY_ID;
        const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
        const bucketName = process.env.R2_BUCKET_NAME;

        if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) {
          throw new Error('Missing Cloudflare R2 credentials in environment variables.');
        }

        const { S3Client, DeleteObjectCommand } = require('@aws-sdk/client-s3');

        const s3 = new S3Client({
          region: 'auto',
          endpoint,
          credentials: { accessKeyId, secretAccessKey }
        });

        await s3.send(
          new DeleteObjectCommand({
            Bucket: bucketName,
            Key: filename
          })
        );
      } catch (error: any) {
        console.error('[Storage Service] R2 Delete failed:', error.message);
        throw new Error(`Cloudflare R2 Delete failed: ${error.message}`);
      }
    } else {
      // Local storage: delete from uploads directory
      const uploadDir = process.env.UPLOAD_DIR || 'uploads';
      const filePath = path.join(uploadDir, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }
}
export default StorageService;

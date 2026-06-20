import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';

function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    case '.gif':
      return 'image/gif';
    default:
      return 'application/octet-stream';
  }
}

export class StorageService {
  private static s3Client: S3Client | null = null;

  private static getS3Client(): S3Client {
    if (!this.s3Client) {
      const endpoint = process.env.S3_ENDPOINT;
      const accessKeyId = process.env.S3_ACCESS_KEY_ID;
      const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;

      if (!endpoint || !accessKeyId || !secretAccessKey) {
        throw new Error('S3-compatible storage is not fully configured. Please set S3_ENDPOINT, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.');
      }

      this.s3Client = new S3Client({
        endpoint,
        credentials: {
          accessKeyId,
          secretAccessKey
        },
        region: 'auto',
        forcePathStyle: true // Required for S3-compatibility API on B2/R2
      });
    }
    return this.s3Client;
  }

  /**
   * Generates the public access URL for a given file in local mode
   */
  static getFileUrl(filename: string): string {
    const port = process.env.PORT || 5000;
    const backendUrl = process.env.BACKEND_URL || `http://localhost:${port}`;
    return `${backendUrl}/uploads/${filename}`;
  }

  /**
   * Handles file storage after upload.
   * Uploads to S3/B2 if provider is 's3' or 'r2', else returns local server uploads URL.
   */
  static async uploadFile(filename: string, localFilePath: string): Promise<string> {
    const provider = process.env.STORAGE_PROVIDER || 'local';

    if (provider === 's3' || provider === 'r2') {
      const client = this.getS3Client();
      const bucketName = process.env.S3_BUCKET_NAME;
      if (!bucketName) {
        throw new Error('S3_BUCKET_NAME is not configured.');
      }

      const fileStream = fs.createReadStream(localFilePath);
      const mimeType = getMimeType(localFilePath);

      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: filename,
        Body: fileStream,
        ContentType: mimeType
      });

      await client.send(command);

      // Return public access URL
      if (process.env.S3_PUBLIC_URL) {
        const publicUrl = process.env.S3_PUBLIC_URL.replace(/\/$/, '');
        return `${publicUrl}/${filename}`;
      } else {
        const endpoint = process.env.S3_ENDPOINT?.replace(/\/$/, '');
        return `${endpoint}/${bucketName}/${filename}`;
      }
    } else {
      return this.getFileUrl(filename);
    }
  }

  /**
   * Deletes a file from the selected storage provider.
   */
  static async deleteFile(filename: string): Promise<void> {
    const provider = process.env.STORAGE_PROVIDER || 'local';

    if (provider === 's3' || provider === 'r2') {
      const client = this.getS3Client();
      const bucketName = process.env.S3_BUCKET_NAME;
      if (!bucketName) {
        throw new Error('S3_BUCKET_NAME is not configured.');
      }

      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: filename
      });

      await client.send(command);
    } else {
      const uploadDir = process.env.UPLOAD_DIR || 'uploads';
      const filePath = path.join(uploadDir, filename);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    }
  }

  /**
   * Downloads a file from S3 to the local filesystem for processing.
   * If running in local mode, it simply returns the path to the file in the uploads directory.
   */
  static async downloadFile(fileUrlOrKey: string, localDestPath: string): Promise<string> {
    const filename = path.basename(fileUrlOrKey);
    const provider = process.env.STORAGE_PROVIDER || 'local';

    if (provider === 's3' || provider === 'r2') {
      const client = this.getS3Client();
      const bucketName = process.env.S3_BUCKET_NAME;
      if (!bucketName) {
        throw new Error('S3_BUCKET_NAME is not configured.');
      }

      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: filename
      });

      const response = await client.send(command);
      const bodyStream = response.Body as Readable;
      const writeStream = fs.createWriteStream(localDestPath);

      await new Promise<void>((resolve, reject) => {
        bodyStream.pipe(writeStream)
          .on('finish', resolve)
          .on('error', reject);
      });

      return localDestPath;
    } else {
      const uploadDir = process.env.UPLOAD_DIR || 'uploads';
      const srcPath = path.join(uploadDir, filename);
      if (!fs.existsSync(srcPath)) {
        throw new Error(`Local file not found: ${srcPath}`);
      }
      return srcPath;
    }
  }

  /**
   * Streams a file from the configured storage provider to the Express response.
   */
  static async streamFile(filename: string, res: any): Promise<void> {
    const provider = process.env.STORAGE_PROVIDER || 'local';

    if (provider === 's3' || provider === 'r2') {
      const client = this.getS3Client();
      const bucketName = process.env.S3_BUCKET_NAME;
      if (!bucketName) {
        throw new Error('S3_BUCKET_NAME is not configured.');
      }

      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: filename
      });

      const response = await client.send(command);
      
      // Set response headers
      res.setHeader('Content-Type', response.ContentType || getMimeType(filename));
      if (response.ContentLength) {
        res.setHeader('Content-Length', response.ContentLength.toString());
      }
      
      const bodyStream = response.Body as Readable;
      await new Promise<void>((resolve, reject) => {
        bodyStream.pipe(res)
          .on('finish', resolve)
          .on('error', reject);
      });
    } else {
      const uploadDir = process.env.UPLOAD_DIR || 'uploads';
      const filePath = path.join(uploadDir, filename);
      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }
      res.sendFile(path.resolve(filePath));
    }
  }
}
export default StorageService;


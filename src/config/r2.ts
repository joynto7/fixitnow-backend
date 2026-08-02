import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { config } from './env';

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${config.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: config.r2.accessKeyId ?? '',
    secretAccessKey: config.r2.secretAccessKey ?? '',
  },
});

export const uploadBufferToR2 = async (
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> => {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: config.r2.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  );
  return `${config.r2.publicUrl}/${key}`;
};

export const deleteFromR2 = async (key: string): Promise<void> => {
  await r2Client.send(new DeleteObjectCommand({ Bucket: config.r2.bucketName, Key: key }));
};

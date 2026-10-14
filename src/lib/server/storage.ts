import "server-only";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";

/**
 * Private media storage (PRD 4): an S3-compatible bucket in the UK or EU. The browser uploads
 * straight to the bucket with presigned URLs and media is only ever read through signed links.
 *
 * Config: S3_BUCKET, S3_REGION (default eu-west-2), and S3_ENDPOINT for a local stand-in
 * (moto or MinIO). Credentials come from the usual AWS environment or role.
 */
const config = () => ({
  bucket: process.env.S3_BUCKET ?? "wes-media-dev",
  region: process.env.S3_REGION ?? "eu-west-2",
  endpoint: process.env.S3_ENDPOINT,
});

let client: S3Client | null = null;
function s3(): S3Client {
  const { region, endpoint } = config();
  client ??= new S3Client({ region, ...(endpoint ? { endpoint, forcePathStyle: true } : {}) });
  return client;
}

const bucket = () => config().bucket;
export const storageBucket = bucket;

/** Parts are 10 MB (S3's minimum is 5 MB). A 250 MB video is 25 parts. */
export const PART_SIZE = 10 * 1024 * 1024;
const UPLOAD_URL_TTL_S = 60 * 60;
/** Playback and download links (build plan section 12). */
export const READ_URL_TTL_S = 15 * 60;

export async function createMultipartUpload(key: string, contentType: string): Promise<string> {
  const res = await s3().send(
    new CreateMultipartUploadCommand({ Bucket: bucket(), Key: key, ContentType: contentType || "application/octet-stream" }),
  );
  if (!res.UploadId) throw new Error("No upload id from storage");
  return res.UploadId;
}

export function presignUploadPart(key: string, uploadId: string, partNumber: number): Promise<string> {
  return getSignedUrl(s3(), new UploadPartCommand({ Bucket: bucket(), Key: key, UploadId: uploadId, PartNumber: partNumber }), {
    expiresIn: UPLOAD_URL_TTL_S,
  });
}

export async function completeMultipartUpload(key: string, uploadId: string, parts: { partNumber: number; etag: string }[]) {
  await s3().send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket(),
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts.map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })) },
    }),
  );
}

export async function abortMultipartUpload(key: string, uploadId: string) {
  await s3().send(new AbortMultipartUploadCommand({ Bucket: bucket(), Key: key, UploadId: uploadId }));
}

export function presignRead(key: string, downloadName?: string, expiresIn = READ_URL_TTL_S): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({
      Bucket: bucket(),
      Key: key,
      ...(downloadName ? { ResponseContentDisposition: `attachment; filename="${downloadName.replace(/"/g, "")}"` } : {}),
    }),
    { expiresIn },
  );
}

export async function objectSize(key: string): Promise<number | null> {
  try {
    const res = await s3().send(new HeadObjectCommand({ Bucket: bucket(), Key: key }));
    return res.ContentLength ?? null;
  } catch {
    return null;
  }
}

export async function putObject(key: string, body: Buffer | string, contentType: string) {
  await s3().send(new PutObjectCommand({ Bucket: bucket(), Key: key, Body: body, ContentType: contentType }));
}

export async function downloadToFile(key: string, path: string) {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!res.Body) throw new Error(`Empty object: ${key}`);
  await pipeline(res.Body as Readable, createWriteStream(path));
}

export async function deleteObjects(keys: string[]) {
  const unique = [...new Set(keys.filter(Boolean))];
  if (!unique.length) return;
  await s3().send(new DeleteObjectsCommand({ Bucket: bucket(), Delete: { Objects: unique.map((Key) => ({ Key })) } }));
}

export async function getObjectText(key: string): Promise<string> {
  const res = await s3().send(new GetObjectCommand({ Bucket: bucket(), Key: key }));
  if (!res.Body) throw new Error(`Empty object: ${key}`);
  return res.Body.transformToString();
}

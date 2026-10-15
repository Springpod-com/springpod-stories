#!/usr/bin/env node
// Creates the media bucket with browser upload CORS on a local S3 stand-in (moto or MinIO).
// Usage: S3_ENDPOINT=http://localhost:4566 node scripts/dev-storage.mjs
import "dotenv/config";
import { CreateBucketCommand, PutBucketCorsCommand, S3Client } from "@aws-sdk/client-s3";

const endpoint = process.env.S3_ENDPOINT;
if (!endpoint) {
  console.error("S3_ENDPOINT is not set. This script is for local storage only.");
  process.exit(1);
}
const Bucket = process.env.S3_BUCKET ?? "wes-media-dev";
const client = new S3Client({ region: process.env.S3_REGION ?? "eu-west-2", endpoint, forcePathStyle: true });

try {
  await client.send(new CreateBucketCommand({ Bucket, CreateBucketConfiguration: { LocationConstraint: process.env.S3_REGION ?? "eu-west-2" } }));
} catch (e) {
  if (!/BucketAlready/.test(String(e?.name))) throw e;
}
await client.send(
  new PutBucketCorsCommand({
    Bucket,
    CORSConfiguration: {
      CORSRules: [
        {
          AllowedOrigins: (process.env.APP_ORIGINS ?? "http://localhost:3000,http://localhost:3100").split(","),
          AllowedMethods: ["PUT", "GET", "HEAD"],
          AllowedHeaders: ["*"],
          // The uploader needs each part's ETag to complete a multipart upload.
          ExposeHeaders: ["ETag"],
          MaxAgeSeconds: 3600,
        },
      ],
    },
  }),
);
console.log(`Bucket ${Bucket} ready at ${endpoint}`);

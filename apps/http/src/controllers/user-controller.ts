import { Request, Response } from "express";
import { s3Client } from "../services/s3-upload";
import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { abortMultiPartUploadSchema, completeMultipartUploadSchema, PreSignedUrlSchema, startMultiPartUploadSchema} from "@repo/shared-schema"

export const generatePresignedUrl = async (req: Request, res: Response) => {
    const parsedPreSignedUrlData = PreSignedUrlSchema.safeParse(req.query)
    if(!parsedPreSignedUrlData.success){
      res.status(400).json({error:parsedPreSignedUrlData.error})
      return;
    }
    const { key, uploadId, PartNumber } = parsedPreSignedUrlData.data;
  try {
    const command = new UploadPartCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: key as string,
      UploadId: uploadId as string,
      PartNumber: Number(PartNumber),
    });
    const signedUrl = await getSignedUrl(s3Client, command, { expiresIn: 300 });
    res.json({ url: signedUrl });
  } catch (error) {
    res.status(500).json({ error: "Failed to generate pre-signed URL", details: (error as Error).message });
  }
};

export const startMultiPartUpload = async (req: Request, res: Response) => {
  const parsedStartMultiPartUploadData = startMultiPartUploadSchema.safeParse(req.body)
  console.log(parsedStartMultiPartUploadData,"parsed")
  if(!parsedStartMultiPartUploadData.success){
    res.status(400).json({error:parsedStartMultiPartUploadData.error})
    return;
  }
  try {
    const { fileName, contentType } = parsedStartMultiPartUploadData.data;
    const command = new CreateMultipartUploadCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: fileName,
      ContentType: contentType,
    });
    const response = await s3Client.send(command);
    res.json({ uploadId: response.UploadId, key: response.Key });
  } catch (error) {
    res.status(500).json({ error: "Failed to start multipart upload", details: (error as Error).message });
  }
};

export const completeMultipartUpload = async (req: Request, res: Response) => {
  const parsedCompleteMultiPartUploadData = completeMultipartUploadSchema.safeParse(req.body)
  console.log(parsedCompleteMultiPartUploadData,req.body)
  if(!parsedCompleteMultiPartUploadData.success){
    res.status(400).json({error:parsedCompleteMultiPartUploadData.error})
    return;
  }
  try {
    
    const { key, uploadId, parts } = parsedCompleteMultiPartUploadData.data; // parts = [{ PartNumber, ETag }]

    const command = new CompleteMultipartUploadCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: { Parts: parts.map(p => ({ PartNumber: Number(p.PartNumber), ETag: String(p.ETag) })) },
    });

    const result = await s3Client.send(command);
    res.json({ location: result.Location });
  } catch (error) {
    res.status(500).json({ error: "Failed to complete multipart upload", details: (error as Error).message });
  }
};

export const abortMultiPartUpload = async (req: Request, res: Response) => {
  const parsedAbortMultiPartUploadData = abortMultiPartUploadSchema.safeParse(req.body)
  if(!parsedAbortMultiPartUploadData.success){
    res.status(400).json({error:parsedAbortMultiPartUploadData.error})
    return;
  }
  const { key, uploadId } = parsedAbortMultiPartUploadData.data;
  try {
    const command = new AbortMultipartUploadCommand({
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: key,
      UploadId: uploadId,
    });
    await s3Client.send(command);
    res.json({ message: "Multipart upload aborted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to abort multipart upload", details: (error as Error).message });
  }
};
import { z } from "zod";

export const PreSignedUrlSchema = z.object({
    key:z.string(),
    uploadId:z.string(),
    PartNumber:z.string()
}).strict()

export const startMultiPartUploadSchema = z.object({
    fileName:z.string(),
    contentType:z.string()
}).strict()

export const completeMultipartUploadSchema = z.object({
    key:z.string(),
    uploadId:z.string(),
    parts:z.array(z.object({PartNumber:z.number(),ETag:z.string()}))
}).strict()

export const abortMultiPartUploadSchema = z.object({
    key:z.string(),
    uploadId:z.string()
}).strict()
export type PreSignedUrlSchemaType = z.infer<typeof PreSignedUrlSchema>;
export type StartMultipartUploadSchemaType = z.infer<typeof startMultiPartUploadSchema>;
export type CompleteMultipartUploadSchemaType = z.infer<typeof completeMultipartUploadSchema>;
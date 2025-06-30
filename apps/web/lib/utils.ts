import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
export async function startMultipartUpload(filename: string, contentType: string) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_KEY}/start-multipart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: filename, contentType })
    });
    console.log(res,"resss")
    if (!res.ok) throw new Error('Failed to start multipart upload');
    return res.json();
}
export async function completeMultipartUpload(key: string, uploadId: string, parts: { PartNumber: number; ETag: string }[]) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_KEY}/complete-multipart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, uploadId, parts })
    });
    if (!res.ok) throw new Error('Failed to complete multipart upload');
    return res.json();
}
export async function abortMultipartUpload(key: string, uploadId: string) {
    const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_KEY}/abort-multipart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, uploadId })
    });
    if (!res.ok) throw new Error('Failed to abort multipart upload');
    return res.json();
    
}
export async function getPresignedUrl(key: string, uploadId: string, PartNumber: number) {
    const params = new URLSearchParams({ key, uploadId, PartNumber: String(PartNumber) });
    const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_API_KEY}/generate-presigned-url?${params}`);
    if (!res.ok) throw new Error('Failed to get presigned URL');
    return res.json();
}
"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { completeMultipartUpload, getPresignedUrl, startMultipartUpload, abortMultipartUpload } from "@/lib/utils";
import type { PeerClientState } from "../types";

export function useRecording(mediaSoupClientState: React.MutableRefObject<PeerClientState>) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingStatus, setRecordingStatus] = useState<string>("");
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const uploadSessionRef = useRef<{ uploadId: string; key: string; parts: { PartNumber: number; ETag: string }[] }>({ uploadId: '', key: '', parts: [] });
  const chunkCountRef = useRef(1);
  const SIZE_THRESHOLD = 5 * 1024 * 1024; // 5MB
  const bufferedChunks = useRef<BlobPart[]>([]);
  const bufferedSizeRef = useRef(0);

  async function uploadChunkToS3(blob: Blob, partNumber: number) {
    setRecordingStatus(`Uploading chunk ${partNumber}...`);
    try {
      const { key, uploadId } = uploadSessionRef.current;
      if (!key || !uploadId || !partNumber) return;
      const { url } = await getPresignedUrl(key, uploadId, partNumber);
      const res = await fetch(url, { method: 'PUT', body: blob, headers: { 'Content-Type': 'video/webm' } });
      if (!res.ok) throw new Error('Failed to upload chunk');
      const eTag = res.headers.get('ETag') || '';
      uploadSessionRef.current.parts.push({ PartNumber: partNumber, ETag: eTag });
      setUploadProgress((prev) => prev + 1);
    } catch (err) {
      setRecordingStatus('Chunk upload failed');
    }
  }

  const handleToggleRecording = async () => {
    if (isRecording) {
      if (mediaRecorderRef.current) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
        setRecordingStatus('Stopped recording');
      }
      return;
    }

    if (!mediaSoupClientState.current.localStream) {
      setRecordingStatus('No local stream to record');
      return;
    }

    setRecordingStatus('Starting recording...');
    setIsRecording(true);
    setUploadProgress(0);
    chunkCountRef.current = 1;
    uploadSessionRef.current = { uploadId: '', key: '', parts: [] };
    const filename = `meeting-recording-${Date.now()}.webm`;
    try {
      const { uploadId, key } = await startMultipartUpload(filename, 'video/webm');
      uploadSessionRef.current.uploadId = uploadId;
      uploadSessionRef.current.key = key;
    } catch (err) {
      setRecordingStatus('Failed to start upload session');
      setIsRecording(false);
      return;
    }

    try {
      const recorder = new MediaRecorder(mediaSoupClientState.current.localStream!, {
        mimeType: 'video/webm; codecs=vp9,opus',
        videoBitsPerSecond: 6_000_000,
        audioBitsPerSecond: 192_000
      });

      recorder.ondataavailable = async (event) => {
        if (event.data && event.data.size > 0 && recorder.state === 'recording') {
          bufferedChunks.current.push(event.data);
          bufferedSizeRef.current += event.data.size;
          if (bufferedSizeRef.current >= SIZE_THRESHOLD) {
            const bigBlob = new Blob(bufferedChunks.current, { type: event.data.type });
            await uploadChunkToS3(bigBlob, chunkCountRef.current++);
            bufferedChunks.current = [];
            bufferedSizeRef.current = 0;
          }
        }
      };

      recorder.onstart = () => { setRecordingStatus('Recording...') };

      recorder.onstop = async () => {
        setRecordingStatus('Finalizing...');
        if (bufferedChunks.current.length > 0) {
          const bigBlob = new Blob(bufferedChunks.current, { type: 'video/webm' });
          await uploadChunkToS3(bigBlob, chunkCountRef.current++);
          bufferedChunks.current = [];
          bufferedSizeRef.current = 0;
        }
        const { key, uploadId, parts } = uploadSessionRef.current;
        try {
          if (key && uploadId && parts.length > 0) {
            await completeMultipartUpload(key, uploadId, parts);
            setRecordingStatus('Upload complete!');
          } else {
            setRecordingStatus('No parts uploaded');
          }
        } catch (err) {
          await abortMultipartUpload(key, uploadId);
          setRecordingStatus('Failed to complete upload');
        }
        uploadSessionRef.current = { uploadId: '', key: '', parts: [] };
        chunkCountRef.current = 1;
        setIsRecording(false);
      };

      mediaRecorderRef.current = recorder;
      recorder.start(5000);
    } catch (err) {
      setRecordingStatus('Failed to start recording');
      setIsRecording(false);
    }
  };

  useEffect(() => {
    if (recordingStatus === "") return;
    toast.info(`Recording ${isRecording ? 'started' : 'stopped'}`, {
      duration: 3000,
      position: "top-center",
      style: { backgroundColor: "#ffffff", color: "#000000" }
    });
  }, [isRecording]);

  return { isRecording, recordingStatus, uploadProgress, handleToggleRecording } as const;
}



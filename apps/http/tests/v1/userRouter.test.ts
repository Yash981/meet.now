import request from "supertest";
import app from "../../src/index";
import {mockClient} from "aws-sdk-client-mock"
import { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand } from "@aws-sdk/client-s3";

const s3Mock = mockClient(S3Client);
beforeEach(() => {
    s3Mock.reset();
});
describe("User Router", () => {
    let presignedUrl = null;
    it("no filename on start multipart upload",async()=>{
        const parsedData = await request(app).post("/api/v1/start-multipart").send({contentType: "text/plain"})
        console.log(parsedData,"parsed")
        expect(parsedData.status).toBe(400)
    })
    it("no contentType on start multipart upload",async()=>{
        const parsedData = await request(app).post("/api/v1/start-multipart").send({fileName:"test2-file.txt"})
        console.log(parsedData,"parsed")
        expect(parsedData.status).toBe(400)
    })
    it("no contentType and no filename on start multipart upload",async()=>{
        const parsedData = await request(app).post("/api/v1/start-multipart").send({})
        console.log(parsedData,"parsed")
        expect(parsedData.status).toBe(400)
    })
    it("should start multipart upload", async () => {
        s3Mock.on(CreateMultipartUploadCommand).resolves({
            UploadId: "mockUploadId",
            Key: "mockKey" 
        });
        const response = await request(app)
            .post("/api/v1/start-multipart")
            .send({ fileName: "test-file.txt", contentType: "text/plain" });
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("uploadId", "mockUploadId");
        expect(response.body).toHaveProperty("key", "mockKey");
    });
    it("should generate presigned URL", async () => {
        s3Mock.on(UploadPartCommand).resolves({
            ETag: "mockETag"
        });
        const response = await request(app)
            .get("/api/v1/generate-presigned-url")
            .query({ key: "test-file.txt", uploadId: "mockUploadId", PartNumber: 1 });
        presignedUrl = response.body.url;
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("url");
        expect(typeof response.body.url).toBe("string");
        expect(response.body.url).toContain("https://");
        expect(response.body.url).toContain("X-Amz-Signature=");
    });
    it("should complete multipart upload", async () => {
        s3Mock.on(CompleteMultipartUploadCommand).resolves({
            Location: "mockLocation"
        });
        const response = await request(app)
            .post("/api/v1/complete-multipart")
            .send({
                key: "test-file.txt",
                uploadId: "mockUploadId",
                parts: [{ PartNumber: 1, ETag: "mockETag" }]
            });
        expect(response.status).toBe(200);
    });
    it.skip("should abort multipart upload", async () => {
        s3Mock.on(AbortMultipartUploadCommand).resolves({});
        const response = await request(app)
            .post("/api/v1/abort-multipart")
            .send({ key: "test-file.txt", uploadId: "mockUploadId" });
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty("message", "Multipart upload aborted successfully");
    });
});
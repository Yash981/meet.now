import {Router} from "express";
import { abortMultiPartUpload, completeMultipartUpload, generatePresignedUrl, startMultiPartUpload } from "../../controllers/user-controller";

const UserRouter = Router();
UserRouter.post("/start-multipart",startMultiPartUpload)
UserRouter.get("/generate-presigned-url",generatePresignedUrl)
UserRouter.post("/abort-multipart",abortMultiPartUpload)
UserRouter.post("/complete-multipart",completeMultipartUpload)
export default UserRouter
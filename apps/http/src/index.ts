import express from "express"
import UserRouter from "./routes/v1/user-router"
import cors from "cors";
import dotenv from "dotenv";
dotenv.config({ path: "../../.env" });
const app = express()
app.use(express.json())
app.use(cors({origin:"*",credentials:true}))
app.use("/api/v1",UserRouter)
const PORT = process.env.PORT || 9000
app.listen(PORT,()=>{
    console.log(`HTTP server is running on http://localhost:${PORT}`)
})
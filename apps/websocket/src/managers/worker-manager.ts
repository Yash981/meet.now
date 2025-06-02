import { createWorker, types } from "mediasoup";
import { workerSettings } from "../utils";

class WorkerManager {
    private worker?: types.Worker;
    private static instance: WorkerManager;

    private constructor() {}

    public static getInstance(): WorkerManager {
        if (!WorkerManager.instance) {
            WorkerManager.instance = new WorkerManager();
        }
        return WorkerManager.instance;
    }

    async init(): Promise<void> {
        if (this.worker) {
            console.log("Worker already initialized");
            return;
        }
        this.worker = await createWorker(workerSettings);
        this.worker.on("died", () => {
            console.error("MediaSoup worker has died");
            setTimeout(() => {
                process.exit(1);
            }, 2000);
        });
        console.log("Worker initialized");
    }

    getWorker(): types.Worker {
        if (!this.worker) {
            throw new Error("Worker has not been initialized. Call init() first.");
        }
        return this.worker;
    }

    async closeWorker(): Promise<void> {
        if (this.worker) {
            this.worker.close();
            console.log("MediaSoup worker closed");
        }
    }
}

export default WorkerManager;

import { createWorker, types } from "mediasoup";
import { workerSettings } from "../utils";

export class WorkerManager {
    private worker: types.Worker | undefined;

    constructor() {
        this.initWorker();
    }

    private async initWorker(): Promise<void> {
        this.worker = await createWorker(workerSettings);
    }

    getWorker(): types.Worker {
        if (!this.worker) {
            throw new Error('Worker is not initialized');
        }
        return this.worker;
    }

    async closeWorker(): Promise<void> {
        if (this.worker) {
            this.worker.on('died', () => {
                console.error('MediaSoup worker has died');
                setTimeout(() => {
                    process.exit(1);
                }, 2000);
            });
            this.worker.close();
            console.log('MediaSoup worker closed');
        }

    }
}

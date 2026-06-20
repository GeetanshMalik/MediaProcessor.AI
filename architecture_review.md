# Architecture Review: AI-Powered Media Processing Microservice

This document outlines the architectural transition of the MediaProcessor.AI platform from a monolithic-leaning shared-volume setup to a fully decoupled, cloud-native microservice architecture.

---

## 1. Current Architecture vs. New Architecture

```mermaid
graph TD
    subgraph Current Architecture (Before Refactor)
        C_Client[Client / Frontend] -->|HTTP Upload| C_API[API Service]
        C_API -->|Write File| C_Vol[(Shared Docker Volume)]
        C_API -->|Queue Job ID| C_Redis[(Redis Queue)]
        C_Worker[Worker Service] -.->|Read File| C_Vol
        C_Worker -->|Poll Queue| C_Redis
        C_API -.->|Inline Worker Listener| C_Worker
    end
```

```mermaid
graph TD
    subgraph New Architecture (After Refactor)
        N_Client[Client / Frontend] -->|HTTP Upload| N_API[API Service]
        N_API -->|Upload Object| N_S3[(Backblaze B2 S3-Compatible Storage)]
        N_API -->|Delete Temp File| N_APITemp[/API Local Temp/]
        N_API -->|Queue Job ID & Image URL| N_Redis[(Redis Queue)]
        N_Worker[Worker Service] -->|Poll Queue| N_Redis
        N_Worker -->|Download Object| N_S3
        N_Worker -->|Write Temp File| N_WTemp[/Worker Local Temp/]
        N_Worker -->|AI Pipelines| N_WTemp
        N_Worker -->|Cleanup Temp File| N_WTemp
    end
```

---

## 2. Problems in the Current Architecture & New Fixes

| Current Architecture Problems | New Architecture Fixes |
| :--- | :--- |
| **Shared Filesystem Dependency (`uploads_volume`)**: The API and Worker containers had to be co-located on the same physical server or cluster node to share a local Docker volume. This made cloud-native horizontal scaling (e.g. AWS ECS, Kubernetes, or serverless platforms like Google Cloud Run or AWS Fargate) extremely difficult or impossible without complex ReadWriteMany NFS setups. | **Cloud-Based Decoupled Storage**: Shared volumes are completely removed. The API uploads files directly to Backblaze B2 (using S3-compatible API). The Worker fetches files on-demand using the Backblaze B2 object URL/key. They can run on different physical machines, different cloud providers, or even different continents. |
| **Inline Worker Execution in API**: The API server code had a conditional `RUN_WORKER` block which ran the worker listener inside the API process. While convenient for free-tier setups, this meant resource exhaustion (high CPU/memory usage by Sharp or Llama/Inference calls) in worker threads could crash the main HTTP API, leading to downtime. | **Strict Process Isolation**: The inline worker listener block has been completely removed from the API codebase. The API server strictly serves HTTP traffic, manages authentication, and queues jobs. The Worker is a completely separate process that runs its own container, guaranteeing that a worker crash has zero impact on API availability. |
| **Queue Design Anti-pattern**: The Redis queue only contained the `jobId`. The worker had to query the database, parse the basename of the URL, and look for it on the local disk. If the database record was delayed or the filesystem lagged, the job would fail immediately. | **Event-Driven Queue Payload**: The enqueued BullMQ job data now contains both the `jobId` and the `imageReference` (the direct R2 object URL). This aligns with standard event-driven architecture where the event contains all required pointers for processing, rather than relying on shared local storage. |
| **Local Disk Pollution**: Files uploaded to the local uploads directory were never deleted unless manually deleted by the user, filling up the container's storage space over time. | **Automatic Ephemeral Storage Cleanup**: The API container deletes the local file immediately after uploading it to R2. The Worker downloads the file to the OS temp folder (`/tmp` inside the container), runs the AI models, and deletes the temp file in a `finally` block, keeping the local disk footprint of both services at zero. |

---

## 3. Microservice Architecture Re-Evaluation

Following the remediation pass, the resulting setup **fully qualifies as a microservice architecture**. Here is the re-evaluation against core microservice principles:

### A. Independent Deployability
The API service and the Worker service are built from distinct Docker configurations ([Dockerfile.api](file:///c:/Users/geeta/OneDrive/Desktop/interview_task/backend/Dockerfile.api) and [Dockerfile.worker](file:///c:/Users/geeta/OneDrive/Desktop/interview_task/backend/Dockerfile.worker)). They do not share libraries, process spaces, or files. They can be deployed to separate hosts (e.g. deploying the API to Render Web Services and the Worker to a separate container cluster or AWS ECS/Fargate) and updated independently without restarting the other.

### B. Loose Coupling via Messaging
Communication between services is asynchronous and message-based. The API does not invoke the Worker directly (no RPC, no HTTP calls to the worker). Instead, it publishes an event containing the job ID and the image reference to a Redis-backed queue ([job.queue.ts](file:///c:/Users/geeta/OneDrive/Desktop/interview_task/backend/src/queues/job.queue.ts)). The Worker pulls jobs when it has capacity. This ensures temporal decoupling: if the Worker service is offline or scaling down, the API continues to accept uploads and queue jobs.

### C. Single Responsibility
Each service has a single, well-defined domain:
- **API Service**: Manages client authentication, validates uploaded images, stores metadata in PostgreSQL, and handles dashboard queries.
- **Worker Service**: Manages asynchronous processing queue listeners, interacts with Hugging Face Inference endpoints, runs heavy image optimization routines, and performs classification/object detection.

### D. Elastic Horizontal Scaling
Under the previous setup, scaling the worker required scaling the API as well because they shared a local volume. Now, if the platform experiences a high volume of image processing requests, we can scale the Worker container horizontally (e.g. from 1 to 20 instances) to process the queue faster, while keeping the API service at 1 instance since its load (simple JSON/metadata transactions) remains low.

### E. Why Database Schema Synchronization is Removed from API Startup
Running database migrations (like `npx prisma db push` or `prisma migrate deploy`) inline within the API container startup script is an anti-pattern for horizontally scaled microservices. 
- **The Problem**: When scaling to **5 API instances**, all 5 containers boot concurrently. If they all execute database schema alterations or checks simultaneously, it creates a database race condition. This leads to migration lock conflicts, transaction timeouts, and database corruption or startup crashes.
- **The Solution**: Database schema synchronization is decoupled from the application lifecycle. It must be run as a single-instance release phase job in the deployment pipeline before rolling out the new API containers.

### F. Worker Startup Recovery Tradeoffs & Production Recommendation
During worker container boot, the process invokes `recoverInterruptedJobs()` to reset stale or stuck processing tasks to `pending` and re-enqueue them.
- **The Tradeoff**: If the system autoscales to **20 Worker instances** during a traffic surge, 20 boot processes will concurrently run the recovery logic. They will query the database for pending/stale jobs and try to push them back to Redis. This leads to duplicate enqueuing, redundant processing, and query lock contention on PostgreSQL.
- **Production Recommendation**: For high-load microservice deployments, startup-based recovery should be disabled. The recovery routine should be configured as a single-instance cron/scheduled event running every 10–15 minutes (e.g., via Cloudflare Worker Crons, Upstash QStash, or a single dedicated manager container task) rather than firing on every worker process startup.

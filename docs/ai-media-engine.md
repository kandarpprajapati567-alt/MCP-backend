# Futuristic System AI Media Engine

## Goal

Add a modular media-production subsystem to the existing Futuristic System MCP backend. The Android app remains the user-facing control surface. Render hosts the coordination API and job metadata; a separately deployed GPU worker performs model inference when GPU capacity is available.

The first milestone is a safe, provider-neutral foundation. It does not claim that video inference runs on Render or that a free Google Cloud GPU is guaranteed.

## Architecture boundaries

- **Android app:** project, character, episode, scene, prompt, and job controls.
- **Existing MCP backend:** owner authentication, planning, model catalog, project metadata, job lifecycle, audit events, and worker coordination.
- **Model adapters:** server-owned adapters selected from a catalog. Never accept arbitrary client-supplied provider URLs, model code, or credentials.
- **GPU worker:** separate process/service for video inference. It claims bounded jobs, downloads authorized inputs, runs a configured model, uploads outputs, and reports status.
- **Storage:** store metadata and asset references in Postgres; store large image/audio/video bytes in object storage, not database rows.

## Multi-model design

The catalog is server-owned and capability-based. A model declares its provider, runtime, capabilities, status, and license-review status. A model marked planned cannot receive generation jobs. NVIDIA model entries remain disabled until their exact weights, license, hardware requirements, and runtime adapter are verified.

The first runnable entry is mock.video.v1, used only for contract and workflow testing. It does not generate a real video.

## Initial request contract

A video-generation request includes:
- project UUID and optional scene UUID
- prompt and optional negative prompt
- server-catalog model ID
- duration from 1 to 15 seconds
- bounded width, height, and frame rate
- optional deterministic seed
- content rating metadata

The backend validates every field and resolves the model from its own catalog. The request cannot supply an endpoint URL or arbitrary model implementation.

## Job lifecycle target

queued -> claimed -> running -> completed | failed | cancelled

Workers must authenticate independently with a scoped worker credential. Job claims should use atomic database operations and a short lease; expired claims can be reclaimed. Result callbacks must be idempotent. A worker must never receive owner master tokens or provider secrets.

## Production phases

1. Media contracts, catalog, validation, and tests.
2. Owner-authenticated project, character, episode, and scene APIs.
3. Persistent generation jobs, event history, and worker claim/result contracts.
4. Mock worker integration and end-to-end tests.
5. Review NVIDIA model weights/licenses and add one GPU adapter at a time.
6. Character identity, continuity, audio/lip-sync, editing, and episode assembly.

## Content and rights

The system is designed for original fictional productions and appropriately authorized assets. For intimate scenes, character records and scene policy must verify fictional adult characters or documented consent for an adult real-person likeness. Do not use the system to create non-consensual sexual depictions. Track provenance and usage rights for reference assets.

## Cost controls

No GPU service should be provisioned automatically. Keep the mock runtime as the default until the owner explicitly enables a GPU worker and confirms the cost/quota. Model weights being open does not make GPU compute, storage, or bandwidth free.

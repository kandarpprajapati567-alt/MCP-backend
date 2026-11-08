# General Model MCP Architecture

## Purpose
Futuristic System MCP is the common control plane for multiple AI models, not a model itself and not a video-only backend. It exposes a stable MCP interface while providers can be added or replaced independently.

## Model families
- LLM: chat, reasoning, planning, structured output, tool calling.
- Vision: image understanding.
- Image: generation, editing, inpainting, upscaling.
- Video: generation, understanding, editing, interpolation.
- Audio: generation, transcription, speech and sound understanding.
- Embeddings and rerankers.
- 3D and spatial generation.

## Provider adapters
Each adapter declares its protocol and capabilities. Model selection uses server-owned IDs and capability checks. Clients cannot submit arbitrary endpoint URLs, executable code or provider credentials.

Initial adapter targets:
- OpenAI-compatible APIs for compatible hosted/self-hosted models.
- NVIDIA NIM.
- Google GenAI and Anthropic.
- Ollama, vLLM and Hugging Face TGI for self-hosted inference.
- ComfyUI for diffusion workflows on a separate GPU worker.
A catalog entry is not proof that every model in that family is implemented. Provider status must be ready before inference can be routed.

## MCP connection
The existing /api/mcp Streamable HTTP endpoint remains the single MCP entry point. It exposes discovery tools for provider adapters and capabilities. Existing planner/workflow routing remains in place for LLM tasks. Image/video/audio generation uses queued workers because it may take minutes and requires binary assets.

## Execution pipeline
MCP client -> owner authentication -> planner/tool policy -> model registry -> capability check -> provider adapter -> immediate response or queued job -> worker -> private object storage -> result event.

## Media data
MCP JSON-RPC carries task metadata and object-storage references. Do not put large media bytes into Postgres rows or MCP JSON-RPC payloads. Use private object storage and short-lived signed references.

## Security and cost
- Owner auth for MCP; separate scoped credentials for workers.
- Provider secrets remain server-side and are never returned by discovery APIs.
- Endpoint URLs are configured through server environment variables and allow-listed adapters; clients cannot supply arbitrary URLs.
- Per-provider/model allow-list, usage budgets, timeouts, retries and concurrency limits.
- Open weights do not mean free GPU compute or unrestricted licenses.
- No paid GPU resource is provisioned automatically.

export type ModelModality = "text" | "image" | "video" | "audio" | "speech" | "embedding" | "vision" | "3d" | "spatial";
export type ModelCapability = "chat" | "reasoning" | "structured-output" | "tool-calling" | "image-understanding" | "image-generation" | "image-editing" | "video-generation" | "video-understanding" | "video-editing" | "text-to-speech" | "speech-to-text" | "audio-generation" | "audio-understanding" | "embeddings" | "reranking" | "upscaling" | "lip-sync" | "3d-generation";
export type ProviderProtocol = "openai-compatible" | "anthropic" | "google-genai" | "nvidia-nim" | "ollama" | "vllm" | "huggingface-tgi" | "comfyui" | "custom-http";
export interface ProviderAdapterDefinition {
  id: string; name: string; protocol: ProviderProtocol;
  supportedModalities: readonly ModelModality[];
  supportedCapabilities: readonly ModelCapability[];
  endpointEnv?: string; apiKeyEnv?: string;
  configured: boolean; status: "ready" | "needs-configuration" | "adapter-planned";
  notes: string;
}
const envPresent = (name: string | undefined) => Boolean(name && process.env[name]?.trim());
const definitions: Omit<ProviderAdapterDefinition, "configured" | "status">[] = [
  { id:"openai-compatible", name:"OpenAI-compatible API", protocol:"openai-compatible", supportedModalities:["text","vision","image","audio","embedding"], supportedCapabilities:["chat","reasoning","structured-output","tool-calling","image-understanding","image-generation","text-to-speech","speech-to-text","embeddings"], endpointEnv:"AI_OPENAI_COMPATIBLE_BASE_URL", apiKeyEnv:"AI_OPENAI_COMPATIBLE_API_KEY", notes:"Generic hosted or self-hosted compatible endpoint; exact features depend on selected model." },
  { id:"nvidia-nim", name:"NVIDIA NIM", protocol:"nvidia-nim", supportedModalities:["text","vision","image","video","audio","embedding","3d"], supportedCapabilities:["chat","reasoning","structured-output","tool-calling","image-understanding","image-generation","video-generation","video-understanding","audio-generation","audio-understanding","embeddings","reranking","upscaling","3d-generation"], endpointEnv:"AI_NVIDIA_NIM_BASE_URL", apiKeyEnv:"AI_NVIDIA_NIM_API_KEY", notes:"NVIDIA-hosted or self-hosted NIM; validate each model, license and GPU requirement." },
  { id:"google-genai", name:"Google Gemini API", protocol:"google-genai", supportedModalities:["text","vision","image","video","audio","embedding"], supportedCapabilities:["chat","reasoning","structured-output","tool-calling","image-understanding","image-generation","video-understanding","audio-understanding","embeddings"], endpointEnv:"AI_GOOGLE_GENAI_BASE_URL", apiKeyEnv:"AI_GOOGLE_GENAI_API_KEY", notes:"Google GenAI adapter target; model-specific APIs and quotas apply." },
  { id:"anthropic", name:"Anthropic API", protocol:"anthropic", supportedModalities:["text","vision"], supportedCapabilities:["chat","reasoning","structured-output","tool-calling","image-understanding"], endpointEnv:"AI_ANTHROPIC_BASE_URL", apiKeyEnv:"AI_ANTHROPIC_API_KEY", notes:"Text and image-understanding workflows; not a video renderer." },
  { id:"ollama", name:"Ollama local runtime", protocol:"ollama", supportedModalities:["text","vision","embedding"], supportedCapabilities:["chat","reasoning","structured-output","tool-calling","image-understanding","embeddings"], endpointEnv:"AI_OLLAMA_BASE_URL", notes:"Local/self-hosted inference; backend worker must be able to reach the host." },
  { id:"vllm", name:"vLLM runtime", protocol:"vllm", supportedModalities:["text","vision","embedding"], supportedCapabilities:["chat","reasoning","structured-output","tool-calling","image-understanding","embeddings","reranking"], endpointEnv:"AI_VLLM_BASE_URL", notes:"Self-hosted high-throughput inference; capabilities depend on deployment." },
  { id:"huggingface-tgi", name:"Hugging Face TGI", protocol:"huggingface-tgi", supportedModalities:["text","embedding"], supportedCapabilities:["chat","reasoning","structured-output","embeddings"], endpointEnv:"AI_HF_TGI_BASE_URL", apiKeyEnv:"AI_HF_TGI_API_KEY", notes:"Text generation inference; other modalities require dedicated adapters." },
  { id:"comfyui", name:"ComfyUI workflow runtime", protocol:"comfyui", supportedModalities:["image","video","audio","3d"], supportedCapabilities:["image-generation","image-editing","video-generation","video-editing","audio-generation","upscaling","lip-sync","3d-generation"], endpointEnv:"AI_COMFYUI_BASE_URL", notes:"Diffusion workflow runtime on a separate GPU host." },
];
export const PROVIDER_ADAPTERS: readonly ProviderAdapterDefinition[] = definitions.map((definition) => {
  const configured = envPresent(definition.endpointEnv) && (!definition.apiKeyEnv || envPresent(definition.apiKeyEnv));
  return { ...definition, configured, status: configured ? "ready" : definition.endpointEnv ? "needs-configuration" : "adapter-planned" };
});
export function listProviderAdapters() {
  return PROVIDER_ADAPTERS.map(({id,name,protocol,supportedModalities,supportedCapabilities,configured,status,notes}) => ({id,name,protocol,supportedModalities,supportedCapabilities,configured,status,notes}));
}
export function getProviderAdapter(id: string) { return PROVIDER_ADAPTERS.find((provider) => provider.id === id) ?? null; }
export function listConfiguredProviders() { return PROVIDER_ADAPTERS.filter((provider) => provider.configured); }

# Technical Handover: CholoBot AI Microservice

This document is a technical specification for an AI system. It details the architecture, logic, and database schema of the `cholobot-microservice` to enable seamless integration into a SaaS multi-tenant environment.

## 1. System Architecture (Data Flow)

1.  **Ingress:** `WebhookController` receives WhatsApp events from Evolution API.
2.  **Transcription:** `AudioTranscriberService` handles `audioMessage` via OpenAI Whisper.
3.  **Throttling:** `DebouncerService` (Redis-backed) manages message buffering (Switch/Wait pattern) to prevent concurrent AI executions for the same `sessionId`.
4.  **Inference:** `AgentService` (LangChain) executes the logic using a `ToolCallingAgent`.
5.  **Memory:** `MemoryService` provides persistent context via `PostgresChatMessageHistory` (Table: `n8n_chat_histories`).
6.  **Egress:** `EvolutionService` sends the final response back to WhatsApp.

---

## 2. Database Schema (Supabase/PostgreSQL)

The AI tools interact with these core tables. In a SaaS migration, all tables must include a `business_id` (UUID).

### Core Tables:
| Table Name | Description | Key Columns |
| :--- | :--- | :--- |
| `sucursales` | Branch information | `id` (UUID), `nombre`, `horarios` (JSONB) |
| `barberos` | Staff members | `id` (UUID), `nombre`, `sucursal_id`, `activo` (bool) |
| `servicios` | Available cuts/treatments | `id` (UUID), `nombre`, `duracion_minutos`, `activo` (bool) |
| `citas` | Appointments | `id` (UUID), `barbero_id`, `servicio_id`, `cliente_nombre`, `cliente_telefono`, `timestamp_inicio` (UTC), `timestamp_fin` (UTC), `estado` ('confirmada', 'cancelada') |
| `bloqueos` | Staff unavailability | `id` (UUID), `barbero_id`, `fecha`, `hora_inicio`, `hora_fin` |
| `fotos_cortes` | Portfolio images | `url`, `barbero_id`, `servicio_id` |
| `n8n_chat_histories` | Conversational Memory | `id`, `session_id`, `message` (JSONB LangChain format) |

---

## 3. Logical Rules & Constraints (Agent Brain)

The `AgentService` operates under a strict finite-state machine logic defined in the `SYSTEM_PROMPT`:

### A. Pre-requisites (Strict)
- **Identity Check:** No tool execution or scheduling is allowed until the `cliente_nombre` is known.
- **Clock Synchronization:** Every turn starts with current `{current_date}` and `{current_time}` (Hermosillo MST UTC-7).
- **Stale Data Guard (`FreshContextHistory`):** Messages from history are flagged as "Stale". The agent **MUST** call `VALIDAR_HORA` and `DISPONIBILIDAD_HOY` every time a time-slot is mentioned, even if it was checked in a previous turn.

### B. Scheduling Protocol
1.  **`VALIDAR_HORA`**: Input raw time string. Output: `VALIDA` or `RECHAZADA` (reason: 'pasada' or 'menos_15').
2.  **`DISPONIBILIDAD_HOY`**: Checks actual slots in Supabase (overlaps with `citas` and `bloqueos`).
3.  **Confirmation Layer**: Single-turn confirmation check. Double confirmation is prohibited.
4.  **Execution**: `AGENDAR_CITA` inserts into `citas` only after final availability check.

---

## 4. Integration Protocol (SaaS Ready)

To wrap this into the existing SaaS system, the following mappings are required:

-   **Multi-Tenancy:**
    -   `tenant_id` must be injected into every `supabase` query.
    -   `EVOLUTION_INSTANCE` (in `.env`) must become dynamic based on the tenant.
-   **Rate Limiting:** IP-based and Phone-based limits are implemented via `express-rate-limit`.
-   **Security:** `DASHBOARD_TOKEN` protects management endpoints (`/api/config/*`).

## 5. Environment Configuration Summary
- `SUPABASE_URL` / `SUPABASE_KEY` / `DATABASE_URL` (Postgres).
- `REDIS_URL` (Debouncing).
- `EVOLUTION_API_URL` / `EVOLUTION_API_KEY`.
- `OPENAI_API_KEY` (Whisper + GPT).
- `AGENT_TIMEOUT_MS` (45s default).

---

> [!TIP]
> **AI Optimization:** The agent is designed to NEVER use Markdown formatting in WhatsApp responses to maintain a clean "Cholo" (informal/urban) aesthetic. It uses 12h AM/PM time format only. 

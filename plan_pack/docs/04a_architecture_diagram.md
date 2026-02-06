# Architecture Diagram (Mermaid)

```mermaid
flowchart LR
  U[User Browser] --> W[Web App React/Vite]
  W --> A[Hono API on Cloudflare Workers]
  A --> O[OpenAI API]
  A --> S[(Supabase Postgres/Auth)]
  ST[Stripe Checkout] --> U
  ST --> A
```

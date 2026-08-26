# Muntu COE — Portal P2P

Plataforma one-stop-shop P2P (Procure-to-Pay) do **Muntu Centre of Excellence**, para Angola, PALOP e África Subsaariana.

Aplicação full-stack em **Next.js 16** (App Router), com base de dados **SQLite** via **Drizzle ORM**.

## Estrutura

- `app/page.tsx` — frontend do portal (site institucional, login e workspace operacional).
- `app/api/**` — rotas de API (Next.js Route Handlers) que servem os dados ao frontend.
- `db/schema.ts` — modelo de dados (Drizzle).
- `db/index.ts` — ligação à base de dados SQLite local, com criação automática das tabelas.
- `db/seed-data.ts` — dados de demonstração semeados automaticamente na primeira execução.

## Executar localmente

Requisitos: Node.js ≥ 20.

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`. A base de dados SQLite (`data/muntu.db`) é criada e semeada automaticamente com dados de demonstração na primeira execução — não é necessário nenhum passo manual.

### Perfis de demonstração (login)

| Perfil | E-mail | Palavra-passe |
| --- | --- | --- |
| Cliente comprador | ana.manuel@operadora.ao | Muntu2026! |
| Aprovador | joao.sebastiao@operadora.ao | Muntu2026! |
| Operações Muntu | marta.miguel@muntucoe.ao | Muntu2026! |
| Fornecedor | carlos.mateus@kwanzaindustrial.ao | Muntu2026! |

## Rotas de API

| Rota | Métodos | Descrição |
| --- | --- | --- |
| `/api/auth/login` | `POST` | Autenticação por e-mail/palavra-passe |
| `/api/dashboard` | `GET` | Métricas agregadas do pipeline P2P |
| `/api/requests` | `GET`, `POST` | Listar/criar pedidos |
| `/api/requests/:id` | `GET`, `PATCH` | Detalhe e aprovar/rejeitar pedido |
| `/api/suppliers` | `GET`, `POST` | Listar/convidar fornecedores |
| `/api/purchase-orders` | `GET` | Ordens de compra |
| `/api/receipts` | `GET` | Recepções |
| `/api/receipts/:id` | `PATCH` | Confirmar recepção |
| `/api/invoices` | `GET` | Facturas e 3-way match |
| `/api/exceptions` | `GET` | Excepções |
| `/api/exceptions/:id` | `PATCH` | Resolver excepção |
| `/api/payments` | `GET` | Lotes de pagamento |
| `/api/payments/:id` | `PATCH` | Libertar pagamento |
| `/api/documents` | `GET`, `POST` | Repositório documental |

## Produção

```bash
npm run build
npm run start
```

## Base de dados

O schema (`db/schema.ts`) é aplicado automaticamente via `CREATE TABLE IF NOT EXISTS` ao arrancar a aplicação — não é necessário executar migrações manualmente em desenvolvimento.

Para gerar migrações versionadas (por exemplo, para produção com outra base de dados) use:

```bash
npm run db:generate
```

Para re-semear os dados de demonstração:

```bash
npm run db:seed
```

---

© 2026 Muntu COE — Luanda, Angola.

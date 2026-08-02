# Integração LouvorJA ↔ Integra7 — Proposta de contrato

**Status:** proposta · **Data:** 2026-08-02 · **Escopo:** importação do cronograma de culto do Integra7 para a liturgia do LouvorJA

---

## 1. Resumo executivo

O LouvorJA passará a **importar** o cronograma de culto já montado no Integra7, eliminando a digitação manual da liturgia pelo operador.

A integração usa o contrato existente `GET /integrations/schedule` (auth por `X-Integration-Token`, modelo *pull*). Este documento propõe **seis mudanças** nesse contrato. Duas delas são bloqueantes: sem elas a integração funciona no papel, mas entrega ao operador uma lista de textos que ele ainda precisa vincular à mão — o que anula o propósito.

| ID | Mudança | Prioridade |
|---|---|---|
| P0-1 | Listagem de eventos do dia autenticada só por `X-Integration-Token` | Bloqueante |
| P0-2 | Identidade determinística de música (`externalRef` = `id_music` do LouvorJA) | Bloqueante |
| P1-1 | Novo `kind: "scripture"` para referência bíblica estruturada | Alta |
| P1-2 | `itemId` estável por item | Alta |
| P2-1 | Timer em segundos, `primary`/`background` definidos, `HEADER` desduplicado | Média |
| P2-2 | `updatedAt` / `ETag` para refetch barato | Baixa |

---

## 2. Os dois lados

| | Integra7 | LouvorJA |
|---|---|---|
| O que é | Backend de planejamento (eventos, cronogramas, escalas) | App **desktop** de projeção (Electron + Vue 3) |
| Onde roda | Servidor, multi-tenant por igreja | Máquina do operador, na igreja |
| Autenticação | JWT (usuários) + `X-Integration-Token` (integração) | **Nenhuma** — sem login, sem sessão, sem usuário |
| Persistência | Banco relacional | `localStorage` local, por instalação |

A assimetria de autenticação é a origem do problema P0-1.

---

## 3. Descoberta central: os dois `type` são ortogonais

Os dois sistemas usam a palavra "tipo" para eixos diferentes:

- **`ScheduleItemType` (Integra7)** — `HINO`, `ORACAO`, `SERMAO`, `OFERTA`, `ANUNCIO`… descreve **o que o momento é** na liturgia. Semântica pastoral.
- **`type` (LouvorJA)** — `music`, `verse`, `media`, `link`, `timer`, `annotation`, `category` descreve **o que o operador projeta**. Mecânica de projeção.

Não há correspondência 1:1: um `SERMAO` sem anexo não projeta nada (vira `annotation`), mas um `SERMAO` com vídeo vira `media`. Um `ORACAO_REGENCIA` pode carregar um hino.

> **Conclusão de projeto:** o sinal de mapeamento é **`attachments[].kind`**, não `item.type`. O `type` alimenta título e ícone; o `kind` decide o comportamento.

Isso implica uma **camada de tradução no cliente** — e essa é a decisão correta. A alternativa (um `?format=louvorja` devolvendo o schema interno do LouvorJA) foi descartada: acoplaria a API a um cliente específico, contrariando a neutralidade deliberada do contrato atual.

---

## 4. Restrições do cliente (verificadas no código)

O que cada tipo do LouvorJA exige para ser **executável** (projetar/tocar), não apenas exibível:

| Tipo | Exige | Referência |
|---|---|---|
| `music` | `musicId` = `id_music` do catálogo **próprio** do LouvorJA | `src/modules/liturgy/interface/Index.vue:1441` |
| `verse` | `verseBookId` (id do livro no LouvorJA) + `verseChapter` + `verseNumbers` | `Index.vue:1450` |
| `media` | `filePath` = **caminho local de arquivo**. URL remota não funciona | `Index.vue:1499` |
| `timer` | `timerDuration` em **segundos** | `Index.vue:1515` |
| `link` | `url` — abre no navegador externo | `Index.vue:1507` |
| `category` | divisor visual, sem execução | `Index.vue:1325` |
| `annotation` | apenas texto | — |
| `random` | módulo de sorteio, sem equivalente externo — fora de escopo | `Index.vue:1523` |

Um item importado sem esses campos entra como texto morto: o operador vê o nome, mas precisa refazer o vínculo manualmente.

---

## 5. Mudanças propostas

### P0-1 · Listagem do dia autenticada só por token

**Problema.** O documento atual recomenda: "liste os eventos do dia via `GET /events` (JWT) e depois chame `/integrations/schedule?event_id=` para cada um". **Esse fluxo é impossível no LouvorJA** — o app não tem login, sessão nem usuário, logo nunca terá um JWT. Ele só pode carregar o `X-Integration-Token`.

Sobra apenas `GET /integrations/schedule` sem parâmetros, cujo fallback é "próximo evento" — exatamente o comportamento que a própria documentação do Integra7 marca com ⚠️ como provavelmente errado quando a igreja tem culto de manhã e de noite. Com dois cultos no mesmo dia, o operador da manhã que abrir o app às 10h receberia o cronograma da noite.

**Proposta.** Endpoint de listagem com a mesma autenticação do export:

```http
GET /integrations/schedules?date=2026-08-02
X-Integration-Token: <token da igreja>
```

```json
[
  {
    "scheduleId": 456,
    "eventId": 123,
    "eventTitle": "Culto de Domingo - Manhã",
    "eventDate": "2026-08-02",
    "eventTime": "09:00",
    "status": "finalizado",
    "itemCount": 12
  },
  {
    "scheduleId": 457,
    "eventId": 124,
    "eventTitle": "Culto de Domingo - Noite",
    "eventDate": "2026-08-02",
    "eventTime": "19:00",
    "status": "rascunho",
    "itemCount": 8
  }
]
```

Sem `items` no payload — a chamada fica barata e serve só para desambiguar. Com um resultado, o LouvorJA importa direto; com vários, mostra um seletor ("Manhã 09:00" / "Noite 19:00") antes de chamar `?event_id=`.

`date` omitido = eventos de hoje.

---

### P0-2 · Identidade determinística de música

**Problema.** É o item mais importante de um app de louvor, e é o mais frágil hoje.

O LouvorJA precisa de `id_music` — o identificador do **seu próprio** catálogo (`api.louvorja.com.br`). O Integra7 envia `hymnNumber` + `hymnAlbum`. Casar por string é estruturalmente frágil:

- O exemplo da documentação cita `"Harpa Cristã"` (hinário pentecostal).
- O LouvorJA indexa `"Hinário Adventista"` e `"Hinário Adventista 1996"` (`Index.vue:933`).

Os nomes de hinário vão divergir sistematicamente entre os dois lados, e o mesmo número de hino aponta para músicas diferentes em hinários diferentes. Adivinhar em silêncio é pior que não importar.

**Proposta.** Já existe a máquina certa: `PUT /integrations/client-catalog`, autenticado por `X-Integration-Token`. O fluxo:

1. O catálogo do LouvorJA é carregado no Integra7 (ver nota de arquitetura abaixo).
2. Ao montar o cronograma, quem planeja escolhe entradas reais do catálogo LouvorJA.
3. O anexo volta com `externalRef` = o `id_music` verdadeiro.
4. O import vira determinístico — zero heurística.

```json
{
  "kind": "hymn",
  "externalRef": "1042",
  "hymnNumber": 123,
  "hymnAlbum": "Hinário Adventista",
  "source": "reference"
}
```

**Nota de arquitetura — quem empurra o catálogo.** O modelo natural seria cada instalação do LouvorJA fazer `PUT` do seu catálogo. Não recomendamos, por três razões:

- O catálogo do LouvorJA é **global e público** — idêntico para todas as igrejas. Replicá-lo por tenant multiplica o mesmo dado.
- `PUT /integrations/client-catalog` é *delete+insert transacional*: duas máquinas da mesma igreja sincronizando ao mesmo tempo geram corrida.
- Enquanto nenhum operador tiver instalado o app, o catálogo não existe — e é justamente quem planeja (secretaria, sem o LouvorJA aberto) que precisa dele para montar o cronograma.

**Recomendação:** o Integra7 ingere o catálogo do LouvorJA **server-side**, uma vez, compartilhado entre todas as igrejas (job agendado lendo `GET /json_db/pt_musics`). O `PUT` por cliente continua útil para catálogos *realmente* locais (mídias e temas próprios da igreja).

**⚠️ Item de verificação:** o limite documentado é de **500 itens por lote**. O catálogo do LouvorJA (hinários completos + demais álbuns) muito provavelmente excede esse teto — não foi possível confirmar a contagem exata a partir deste ambiente. Se exceder, é preciso paginação ou sync em lotes com marcador de transação. Estrutura de cada música, conforme o código: `id_music`, `name`, `albums[]` com `{ type, name, pivot: { track } }`.

**Fallback (decidido).** Sem `externalRef` resolvível, o item é importado como `annotation` com o título e o número do hino preservados, marcado visualmente como *precisa vincular*. O operador vincula com um clique. **Nunca adivinhar em silêncio.**

---

### P1-1 · `kind: "scripture"` — lacuna no enum

**Problema.** O enum de `kind` é `hymn | video | image | audio | text | link | timer | speech | file`. **Não existe referência bíblica.**

O LouvorJA tem um módulo bíblico completo, com seleção de versão, e projeta a partir de `verseBookId` + `verseChapter` + `verseNumbers`. Hoje uma leitura bíblica chegaria como `text` e viraria anotação morta — o operador teria que abrir a Bíblia e navegar manualmente, item por item.

**Proposta.**

```json
{
  "kind": "scripture",
  "book": "Salmos",
  "bookCode": "PSA",
  "chapter": 23,
  "verses": "1-6",
  "source": "reference"
}
```

- `book` — nome canônico em pt-BR.
- `bookCode` — opcional mas recomendado; código estável (padrão OSIS) imune a variações de grafia e abreviação.
- `verses` — mesma sintaxe que o LouvorJA já aceita (`"1-6"`, `"1,3,5"`, `"7"`).

O cliente resolve `bookCode` (ou `book`) → `id_bible_book` contra a sua própria base.

---

### P1-2 · `itemId` estável

**Problema.** O item só tem `order`, que **muda** quando alguém insere ou remove uma linha no cronograma. Sem identidade estável, um reimport não consegue distinguir "item novo" de "item que desceu uma posição".

Consequência prática: toda reimportação é destrutiva — perde o que o operador já marcou como concluído (`done`) durante o culto. Se o cronograma for corrigido às 18h e o operador reimportar às 19h05 com o culto em andamento, ele perde o progresso.

**Proposta.** Adicionar `itemId` estável enquanto o item existir:

```json
{ "itemId": 8891, "order": 3, "type": "HINO", "title": "..." }
```

Permite reimport incremental: casar por `itemId`, atualizar conteúdo, preservar estado local.

---

### P2-1 · Higiene do contrato

| Ponto | Situação | Proposta |
|---|---|---|
| **Timer** | `durationMinutes` só em minutos; LouvorJA armazena segundos | anexo `kind:"timer"` carregar `durationSeconds` — contagens de 90s ou 30s são comuns e não cabem em minutos inteiros |
| **HEADER** | Duplicado: `type:"HEADER"` **e** `isHeader:true` | manter apenas `isHeader`; deprecar o valor no enum. Duas fontes de verdade divergem cedo ou tarde |
| **`background`** | Campo existe, semântica não definida para o consumidor | definir: `background:true` é **camada de fundo**, não gera item próprio na liturgia |
| **Múltiplos anexos** | 1 item Integra7 pode ter N anexos; itens do LouvorJA são single-purpose | marcar um anexo com `primary:true`. Ele define o item; os demais viram itens subsequentes preservando a ordem |
| **`durationMinutes`/`startTime`** | LouvorJA não tem linha do tempo | manter no contrato; o cliente exibe como informação no subtítulo |

### P2-2 · `updatedAt` / `ETag`

Não há webhook de saída — a integração é *pull*. Expor `updatedAt` no cronograma (ou suportar `ETag`/`If-None-Match`) permite ao cliente detectar mudança sem baixar o payload inteiro, e viabiliza no futuro um aviso do tipo "o cronograma mudou desde a sua importação".

---

## 6. Mapeamento de importação

`attachments[].kind` decide o tipo; `item.type` alimenta nome e ícone.

| Origem (Integra7) | Destino (LouvorJA) |
|---|---|
| `isHeader: true` | `category` |
| `kind: hymn` | `music` — `musicId` ← `externalRef` |
| `kind: scripture` *(proposto)* | `verse` — `verseBookId` / `verseChapter` / `verseNumbers` |
| `kind: video\|image\|audio` + `source: client_only` | `media` — `filePath` ← `externalRef` |
| `kind: video\|image\|audio` + `source: url` | `link` (fase 1) → `media` após download (fase 2) |
| `kind: link` | `link` — `url` |
| `kind: timer` | `timer` — `timerDuration` em segundos |
| `kind: text` / `speech` | `annotation` |
| item sem anexo (`ORACAO`, `SERMAO`, `FALA`…) | `annotation` |

**Campos comuns:** `title` → `name` · `personName ?? instruction` → `subtitle` · `id` gerado localmente.

Para `music`, `verse` e `media` o LouvorJA sobrescreve o `subtitle` com dados do próprio catálogo, como já faz na criação manual (`Index.vue:1224-1273`).

**Mídia por URL.** O LouvorJA só executa caminho local de arquivo. Baixar mídia remota para cache local é viável — a infraestrutura existe (protocolo `local://media/`, `$path.file()`, downloads em `electron/main.js`) — mas é escopo próprio. Na fase 1, `source:"url"` vira `link`.

**Status.** Só `status: "finalizado"` importa sem atrito. Nos demais estados o cliente avisa que o cronograma ainda pode mudar antes de sobrescrever.

---

## 7. Fases

**Fase 1 — cliente (LouvorJA), contrato atual + P0-1**
Helper de integração, configuração de URL base e token, botão de importação, seletor de evento, mapeamento completo, música não resolvida como anotação sinalizada.

**Fase 2 — identidade (P0-2, P1-1)**
Ingestão do catálogo LouvorJA no Integra7, `externalRef` populado, `kind: scripture`. É aqui que a integração deixa de ser "lista de textos" e passa a projetar de verdade.

**Fase 3 — refinamento (P1-2, P2)**
`itemId`, reimport incremental preservando `done`, download de mídia remota, `updatedAt`.

---

## 8. Checklist para o lado Integra7

- [ ] **P0-1** `GET /integrations/schedules?date=` autenticado por `X-Integration-Token`
- [ ] **P0-2** Ingestão server-side do catálogo LouvorJA, compartilhada entre igrejas
- [ ] **P0-2** Verificar o limite de 500 itens contra o tamanho real do catálogo; paginar se necessário
- [ ] **P0-2** Popular `externalRef` com `id_music` nos anexos `kind: hymn`
- [ ] **P1-1** Adicionar `kind: "scripture"` com `book` / `bookCode` / `chapter` / `verses`
- [ ] **P1-2** Adicionar `itemId` estável ao `ExportScheduleItem`
- [ ] **P2-1** `durationSeconds` no anexo `timer`; desduplicar `HEADER`; definir `background` e `primary`
- [ ] **P2-2** Expor `updatedAt` ou suportar `ETag`

## 9. Segurança

O `X-Integration-Token` é **por igreja** e fica armazenado na máquina do operador. Ele deve ser configurado **por instalação**, na tela de Configurações — nunca commitado em `.env`. (O `VITE_API_TOKEN` versionado hoje no repositório é um problema pré-existente, de escopo separado, mas não deve servir de precedente aqui.)

Como o token não expira sozinho, `POST /churches/mine/integration-token/regenerate` é o caminho para revogar o acesso de uma máquina perdida — lembrando que a regeneração invalida o token em **todas** as instalações da igreja.

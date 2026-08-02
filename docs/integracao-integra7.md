# Integração LouvorJA ↔ Integra7 — Proposta de contrato

**Status:** proposta · **Data:** 2026-08-02 · **Escopo:** importação do cronograma de culto do Integra7 para a liturgia do LouvorJA

---

## 1. Resumo executivo

O LouvorJA passará a **importar** o cronograma de culto já montado no Integra7, eliminando a digitação manual da liturgia pelo operador.

A integração usa o contrato existente `GET /integrations/schedule` (auth por `X-Integration-Token`, modelo *pull*). Este documento propõe **sete mudanças**. Três são bloqueantes: sem elas a integração funciona no papel, mas entrega ao operador uma lista de textos que ele ainda precisa vincular à mão — o que anula o propósito.

| ID | Mudança | Prioridade |
|---|---|---|
| P0-3 | **`format=louvorja`** — adaptador server-side versionado | Bloqueante |
| P0-1 | Listagem de eventos do dia autenticada só por `X-Integration-Token` | Bloqueante |
| P0-2 | Identidade determinística de música e livro bíblico (catálogo server-side) | Bloqueante |
| P1-1 | Novo `kind: "scripture"` no modelo de dados | Alta |
| P1-2 | `itemId` estável por item | Alta |
| P2-1 | Timer em segundos, `primary`/`background` definidos, `HEADER` desduplicado | Média |
| P2-2 | `updatedAt` / `ETag` para refetch barato | Baixa |

P0-3 reenquadra as demais: com a tradução no servidor, boa parte da complexidade sai do cliente.

---

## 2. Os dois lados

| | Integra7 | LouvorJA |
|---|---|---|
| O que é | Backend de planejamento (eventos, cronogramas, escalas) | App **desktop** de projeção (Electron + Vue 3) |
| Onde roda | Servidor, multi-tenant por igreja | Máquina do operador, na igreja |
| Ciclo de atualização | Deploy contínuo, controlado por vocês | **Instalação manual por igreja — lenta e imprevisível** |
| Autenticação | JWT (usuários) + `X-Integration-Token` (integração) | **Nenhuma** — sem login, sem sessão, sem usuário |
| Persistência | Banco relacional | `localStorage` local, por instalação |

Duas assimetrias governam o desenho: a de **autenticação** origina P0-1, e a de **ciclo de atualização** origina P0-3.

---

## 3. Descoberta central: os dois `type` são ortogonais

Os dois sistemas usam a palavra "tipo" para eixos diferentes:

- **`ScheduleItemType` (Integra7)** — `HINO`, `ORACAO`, `SERMAO`, `OFERTA`, `ANUNCIO`… descreve **o que o momento é** na liturgia. Semântica pastoral.
- **`type` (LouvorJA)** — `music`, `verse`, `media`, `link`, `timer`, `annotation`, `category` descreve **o que o operador projeta**. Mecânica de projeção.

Não há correspondência 1:1: um `SERMAO` sem anexo não projeta nada (vira `annotation`), mas um `SERMAO` com vídeo vira `media`. Um `ORACAO_REGENCIA` pode carregar um hino.

> **Conclusão de projeto:** o sinal de mapeamento é **`attachments[].kind`**, não `item.type`. O `type` alimenta título e ícone; o `kind` decide o comportamento.

Existe, portanto, uma tradução obrigatória entre os dois modelos. A questão é **onde ela mora** — e a resposta é o servidor (P0-3).

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

### P0-3 · `format=louvorja` — adaptador server-side versionado

**Decisão.** A tradução do modelo neutro para o modelo do LouvorJA acontece **no servidor**, exposta como uma projeção opcional sobre o contrato existente.

**Por quê.** O argumento decisivo é o ciclo de atualização. O LouvorJA é um app desktop instalado em cada igreja. Se a tradução morar no cliente:

- corrigir um mapeamento errado exige **novo build e atualização em cada igreja** — na prática, meses de defasagem, com versões diferentes rodando ao mesmo tempo;
- a resolução de hino teria que rodar no cliente, longe do catálogo indexado que já vive no servidor (P0-2);
- a lógica ficaria num codebase Vue sem testes automatizados.

Com o adaptador no servidor, uma correção é um deploy e todas as igrejas passam a receber o payload certo imediatamente — inclusive as que nunca atualizarem o app.

**Contra-argumento e como ele é resolvido.** Um adaptador por cliente significa N adaptadores no serviço, e faz a API conhecer o schema interno de um consumidor. Isso se administra com **camada e versionamento**, não evitando o adaptador:

1. O **contrato neutro continua canônico**. `format` omitido devolve exatamente o que devolve hoje — nada quebra para o cliente Holyrics existente.
2. O adaptador é uma **projeção de leitura** sobre o modelo neutro, não um segundo modelo de dados. Ele não pode ganhar campos que o neutro não saiba expressar; quando precisar, o campo entra primeiro no modelo neutro (é o caso de P1-1).
3. **`formatVersion` é obrigatório** na negociação, porque cliente desktop e servidor evoluem em ritmos diferentes.

**Negociação.**

```http
GET /integrations/schedule?event_id=123&format=louvorja&formatVersion=1
X-Integration-Token: <token da igreja>
X-Client-Version: 1.2.0
```

- `format` ausente → contrato neutro atual (padrão, inalterado).
- `formatVersion` ausente com `format` presente → assume `1`.
- `formatVersion` maior que o suportado → `400` com a lista de versões disponíveis, para o cliente renegociar em vez de quebrar.
- `X-Client-Version` é informativo, mas permite ao servidor contornar bugs de versões específicas já instaladas em campo — capacidade que só existe se a tradução for server-side.

**Resposta.**

```json
{
  "scheduleId": 456,
  "eventId": 123,
  "eventTitle": "Culto de Domingo - Noite",
  "eventDate": "2026-08-02",
  "eventTime": "19:00",
  "status": "finalizado",
  "formatVersion": 1,
  "items": [
    { "itemId": 8891, "type": "category", "name": "Abertura" },
    {
      "itemId": 8892, "type": "music", "name": "Hino 123 - Grato Sou",
      "subtitle": "Hinário Adventista", "musicId": 1042, "musicMode": "audio"
    },
    {
      "itemId": 8893, "type": "verse", "name": "Leitura Bíblica",
      "verseBookId": 19, "verseChapter": 23, "verseNumbers": "1-6"
    },
    { "itemId": 8894, "type": "timer", "name": "Intervalo", "timerDuration": 300 },
    { "itemId": 8895, "type": "link", "name": "Vídeo de encerramento", "url": "https://..." },
    { "itemId": 8896, "type": "annotation", "name": "Sermão", "subtitle": "Pr. João — 25 min" }
  ]
}
```

Os itens saem **prontos para uso**: `musicId` e `verseBookId` já resolvidos, timer já em segundos, header já como `category`.

**Item não resolvido.** Quando o servidor não conseguir resolver um vínculo, ele **não adivinha** — rebaixa para `annotation` e anexa o motivo, para o cliente renderizar a marca de *precisa vincular* com o contexto que ajuda o operador:

```json
{
  "itemId": 8897,
  "type": "annotation",
  "name": "Hino 45",
  "unresolved": {
    "reason": "music_not_found",
    "hymnNumber": 45,
    "hymnAlbum": "Harpa Cristã"
  }
}
```

`reason` sugerido: `music_not_found`, `music_ambiguous`, `book_not_found`, `media_unavailable`.

**Contratos do adaptador.** O cliente confia no payload, mas não cegamente:

- `itemId` é a identidade do **servidor**; o `id` local do LouvorJA continua sendo gerado no cliente.
- Um `type` desconhecido pelo cliente (versão nova do servidor) **degrada para `annotation`**, nunca quebra a tela. Essa é a única lógica de mapeamento que permanece obrigatoriamente no cliente.

---

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

`date` omitido = eventos de hoje. Independe de `format`: é listagem, não export.

---

### P0-2 · Identidade determinística (catálogo server-side)

**Problema.** É o item mais importante de um app de louvor, e o mais frágil.

O LouvorJA precisa de `id_music` — o identificador do **seu próprio** catálogo (`api.louvorja.com.br`). O Integra7 conhece `hymnNumber` + `hymnAlbum`. Casar por string é estruturalmente frágil:

- O exemplo da documentação cita `"Harpa Cristã"` (hinário pentecostal).
- O LouvorJA indexa `"Hinário Adventista"` e `"Hinário Adventista 1996"` (`Index.vue:933`).

Os nomes de hinário divergem sistematicamente entre os dois lados, e o mesmo número de hino aponta para músicas diferentes em hinários diferentes.

**Com P0-3, este problema é inteiramente do servidor** — o que é uma vantagem, não um custo: a resolução roda onde o catálogo está indexado, e melhorar o algoritmo de casamento não exige atualizar nenhuma igreja.

**Proposta — o Integra7 ingere o catálogo do LouvorJA server-side.** Duas tabelas, ambas públicas e globais:

| Fonte | Para resolver | Campos relevantes |
|---|---|---|
| `GET /json_db/pt_musics` | `musicId` | `id_music`, `name`, `albums[] { type, name, pivot.track }` |
| Livros bíblicos (`pt_bible_book`) | `verseBookId` | `id_bible_book`, `name` |

> **A tabela de livros bíblicos é um requisito novo que decorre de P0-3.** Se a tradução fosse no cliente, ele resolveria o livro contra a própria base. Com o adaptador no servidor, é o servidor que precisa emitir `verseBookId` — logo precisa conhecer os ids de livro do LouvorJA.

**Por que server-side e não `PUT` por instalação.** O caminho aparentemente natural seria cada LouvorJA empurrar seu catálogo via `PUT /integrations/client-catalog`. Não recomendamos:

- O catálogo é **global e público** — idêntico para todas as igrejas. Replicá-lo por tenant multiplica o mesmo dado.
- `PUT /integrations/client-catalog` é *delete+insert transacional*: duas máquinas da mesma igreja sincronizando ao mesmo tempo geram corrida.
- Enquanto nenhum operador tiver instalado o app, o catálogo não existe — e é justamente quem planeja (secretaria, sem o LouvorJA aberto) que precisa dele para montar o cronograma.

O `PUT` por cliente continua útil para catálogos **realmente locais**: mídias e temas próprios da igreja.

**⚠️ Item de verificação:** o limite documentado é de **500 itens por lote**. O catálogo do LouvorJA (hinários completos + demais álbuns) muito provavelmente excede esse teto — não foi possível confirmar a contagem exata a partir deste ambiente. Se a ingestão reaproveitar o mesmo caminho, é preciso paginação ou sync em lotes com marcador de transação.

**Fallback (decidido).** Sem resolução possível, o servidor emite `annotation` com `unresolved` preenchido (ver P0-3). O operador vincula com um clique no app. **Nunca adivinhar em silêncio.**

---

### P1-1 · `kind: "scripture"` — lacuna no modelo de dados

**Problema.** O enum de `kind` é `hymn | video | image | audio | text | link | timer | speech | file`. **Não existe referência bíblica.**

Esta mudança é necessária **mesmo com P0-3**, e é o exemplo da regra "o adaptador não inventa dados": o servidor só consegue emitir `verseBookId`/`verseChapter`/`verseNumbers` se o cronograma tiver capturado a referência de forma estruturada na origem. Hoje uma leitura bíblica é texto livre — e texto livre não vira projeção confiável em nenhum formato de saída.

**Proposta.** No modelo neutro:

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
- `verses` — mesma sintaxe já aceita pelo LouvorJA (`"1-6"`, `"1,3,5"`, `"7"`).

Implica também **entrada estruturada na UI de montagem do cronograma** (seletor de livro/capítulo/versículo), não um campo de texto.

---

### P1-2 · `itemId` estável

**Problema.** O item só tem `order`, que **muda** quando alguém insere ou remove uma linha no cronograma. Sem identidade estável, um reimport não consegue distinguir "item novo" de "item que desceu uma posição".

Consequência prática: toda reimportação é destrutiva — perde o que o operador já marcou como concluído (`done`) durante o culto. Se o cronograma for corrigido às 18h e o operador reimportar às 19h05 com o culto em andamento, ele perde o progresso.

**Proposta.** `itemId` estável enquanto o item existir, presente nos dois formatos. Permite reimport incremental: casar por `itemId`, atualizar conteúdo, preservar estado local.

---

### P2-1 · Higiene do contrato

Com P0-3, estes pontos deixam de bloquear o LouvorJA — o adaptador os normaliza na saída. Continuam valendo para a **saúde do contrato neutro** e para os demais clientes.

| Ponto | Situação | Proposta |
|---|---|---|
| **Timer** | `durationMinutes` só em minutos | anexo `kind:"timer"` carregar `durationSeconds` — contagens de 90s ou 30s não cabem em minutos inteiros |
| **HEADER** | Duplicado: `type:"HEADER"` **e** `isHeader:true` | manter apenas `isHeader`; duas fontes de verdade divergem cedo ou tarde |
| **`background`** | Campo existe, semântica não definida | definir: `background:true` é camada de fundo, não gera item próprio |
| **Múltiplos anexos** | 1 item pode ter N anexos; itens do LouvorJA são single-purpose | marcar um anexo `primary:true` — o adaptador precisa desse sinal para decidir qual anexo define o item |

O último ponto é o mais relevante: sem `primary`, o adaptador escolhe por heurística de ordem, e a escolha pode não ser a que quem planejou tinha em mente.

### P2-2 · `updatedAt` / `ETag`

Não há webhook de saída — a integração é *pull*. Expor `updatedAt` no cronograma (ou suportar `ETag`/`If-None-Match`) permite ao cliente detectar mudança sem baixar o payload inteiro, e viabiliza um aviso do tipo "o cronograma mudou desde a sua importação".

---

## 6. Especificação do adaptador `louvorja` v1

Regra de tradução que o servidor implementa. `attachments[].kind` decide o tipo; `item.type` alimenta nome e ícone.

| Origem (modelo neutro) | Saída (`format=louvorja`) |
|---|---|
| `isHeader: true` | `category` |
| `kind: hymn` resolvido | `music` — `musicId`, `musicMode: "audio"` |
| `kind: hymn` não resolvido | `annotation` + `unresolved.reason: "music_not_found"` |
| `kind: scripture` resolvido | `verse` — `verseBookId`, `verseChapter`, `verseNumbers` |
| `kind: video\|image\|audio` + `source: client_only` | `media` — `filePath` ← `externalRef` |
| `kind: video\|image\|audio` + `source: url` | `link` (v1) → `media` após download (fase 3) |
| `kind: link` | `link` — `url` |
| `kind: timer` | `timer` — `timerDuration` em segundos |
| `kind: text` / `speech` | `annotation` |
| item sem anexo (`ORACAO`, `SERMAO`, `FALA`…) | `annotation` |
| anexo com `background: true` | não gera item |

**Campos comuns:** `title` → `name` · `personName ?? instruction` → `subtitle`. Para `music` e `verse`, o adaptador preenche `subtitle` a partir do catálogo (hinário, referência da passagem), espelhando o que o app já faz na criação manual (`Index.vue:1224-1273`).

**Mídia por URL.** O LouvorJA só executa caminho local de arquivo (`Index.vue:1499`). Baixar mídia remota para cache local é viável — a infraestrutura existe (protocolo `local://media/`, `$path.file()`, downloads em `electron/main.js`) — mas é escopo próprio, deixado para a fase 3. Na v1 do adaptador, `source:"url"` sai como `link`.

**Status.** Só `status: "finalizado"` importa sem atrito. Nos demais estados o cliente avisa que o cronograma ainda pode mudar antes de sobrescrever.

---

## 7. Fases

**Fase 1 — P0-3 e P0-1**
Adaptador `louvorja` v1 no servidor (mapeamento estrutural, sem resolução de catálogo) e listagem do dia por token. No cliente: helper de integração, configuração de URL base e token, botão de importação, seletor de evento, degradação de `type` desconhecido. Nesta fase música e versículo já chegam como `annotation` com `unresolved` — a integração é útil para a estrutura do culto, ainda não para projetar.

**Fase 2 — P0-2 e P1-1**
Ingestão do catálogo (músicas + livros bíblicos), `kind: scripture` com entrada estruturada na UI de montagem, resolução ativa no adaptador. É aqui que a integração deixa de ser "lista de textos" e passa a projetar de verdade — **sem exigir atualização do app nas igrejas**, que é justamente o ganho de P0-3.

**Fase 3 — P1-2 e P2**
`itemId`, reimport incremental preservando `done`, download de mídia remota, `updatedAt`, higiene do contrato neutro.

---

## 8. Checklist para o lado Integra7

- [ ] **P0-3** Adaptador `?format=louvorja&formatVersion=1` como projeção sobre o modelo neutro
- [ ] **P0-3** `format` ausente continua devolvendo o contrato neutro atual, sem alteração
- [ ] **P0-3** `formatVersion` não suportado → `400` com as versões disponíveis
- [ ] **P0-3** Campo `unresolved` com `reason` para itens rebaixados a `annotation`
- [ ] **P0-1** `GET /integrations/schedules?date=` autenticado por `X-Integration-Token`
- [ ] **P0-2** Ingestão server-side de `pt_musics` **e** dos livros bíblicos, compartilhada entre igrejas
- [ ] **P0-2** Verificar o limite de 500 itens contra o tamanho real do catálogo; paginar se necessário
- [ ] **P1-1** `kind: "scripture"` no modelo neutro + entrada estruturada na UI de montagem
- [ ] **P1-2** `itemId` estável em ambos os formatos
- [ ] **P2-1** `primary:true` em anexos (o adaptador depende disso); `durationSeconds`; desduplicar `HEADER`; definir `background`
- [ ] **P2-2** Expor `updatedAt` ou suportar `ETag`

## 9. Segurança

O `X-Integration-Token` é **por igreja** e fica armazenado na máquina do operador. Ele deve ser configurado **por instalação**, na tela de Configurações — nunca commitado em `.env`. (O `VITE_API_TOKEN` versionado hoje no repositório é um problema pré-existente, de escopo separado, mas não deve servir de precedente aqui.)

Como o token não expira sozinho, `POST /churches/mine/integration-token/regenerate` é o caminho para revogar o acesso de uma máquina perdida — lembrando que a regeneração invalida o token em **todas** as instalações da igreja, exigindo recadastro nas demais.

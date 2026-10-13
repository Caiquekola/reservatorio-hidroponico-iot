# Entrega 5: Persistência de estado, histórico e presença (Redis)

Nesta entrega o gateway Node.js passa a gravar no **Redis** tudo o que recebe dos dispositivos pelo MQTT:

- o **estado atual** do dispositivo (última leitura e estado da bomba);
- o **histórico** de telemetria;
- a **presença**, ou seja, se o dispositivo está online e quando foi o último contato.

Também há um script de consulta que lê esses dados de volta, e um teste ponta a ponta que comprova o caminho completo **MQTT → gateway → Redis → consulta**.

## 1. Arquivos

| Arquivo | Função |
|---|---|
| `broker-mqtt/redis-store.js` | Conexão com o Redis, **modelagem das chaves** e funções de gravação e consulta |
| `broker-mqtt/gateway.js` | Assina os tópicos, valida as mensagens e chama a persistência |
| `broker-mqtt/consulta.js` | Consulta o estado, o histórico (últimas N leituras ou por período) e a presença |
| `broker-mqtt/teste-persistencia.js` | Teste automático ponta a ponta com 7 verificações |
| `broker-mqtt/publisher.js` | Dispositivo simulado (com Last Will, igual ao ESP32) |
| `broker-mqtt/docker-compose.yml` | Sobe um Redis local com persistência em disco (AOF) |
| `EvidenciasEtapas/Etapa5/` | Saídas reais das execuções (evidências) |

## 2. Tópicos MQTT tratados

O `deviceId` vem do **próprio tópico** (`{deviceId}/...`). É ele que separa os dados de cada dispositivo no Redis.

| Tópico | Payload | O que o gateway faz |
|---|---|---|
| `+/telemetry` | JSON com `deviceId`, `sensor`, `valid`, `value`, `unit`, `sequence`, `uptimeMs`, `wifiRssi`, `actuatorState` | Valida e grava estado + histórico + presença |
| `+/state` | JSON com `deviceId`, `actuator`, `state`, `requestId` | Valida e grava o estado da bomba + presença |
| `+/availability` | `online` / `offline` (texto; `offline` chega pelo Last Will) | Atualiza a presença |

Mensagens **inválidas** continuam indo só para `logs/mensagens-invalidas.log` e **não são gravadas** no Redis.

## 3. Estrutura de chaves

Padrão adotado: **`device:{deviceId}:{tipo}`**. O prefixo `device:` agrupa as chaves, o `deviceId` diferencia cada dispositivo e o sufixo diz o que a chave guarda. Com isso, `KEYS device:irrigacao01:*` (ou `SCAN`) traz tudo de um dispositivo.

| Chave | Tipo Redis | Conteúdo | Atualizada por |
|---|---|---|---|
| `devices` | SET | IDs de todos os dispositivos já vistos | toda mensagem válida |
| `device:{id}:state` | HASH | Estado atual: última telemetria + estado do atuador | `telemetry`, `state` |
| `device:{id}:history` | SORTED SET | Histórico de leituras (score = horário de recebimento em ms) | `telemetry` |
| `device:{id}:presence` | HASH | Status online/offline, último contato, último tópico | `telemetry`, `state`, `availability` |
| `device:{id}:heartbeat` | STRING com TTL | Existe só enquanto o dispositivo se comunica (expira em 30 s) | `telemetry`, `state`, `availability=online` |
| `device:{id}:commands` | *(reservada)* | Comandos e confirmações (próxima entrega) | — |

### 3.1 `device:{id}:state` (HASH)

Usei HASH para que cada campo possa ser lido ou alterado sozinho. Por exemplo, `HGET device:irrigacao01:state value` traz só o nível. Além disso, a telemetria e a confirmação do atuador atualizam campos diferentes da mesma chave sem um apagar o outro.

| Campo | Origem | Exemplo |
|---|---|---|
| `deviceId`, `sensor`, `valid`, `value`, `unit` | telemetry | `irrigacao01`, `ultrassonico`, `true`, `27.8`, `cm` |
| `sequence`, `uptimeMs`, `wifiRssi` | telemetry | `33717`, `140000`, `-54` |
| `actuatorState` | telemetry / state | `true` |
| `updatedAt`, `topic` | gateway | `2026-10-13T23:21:54.402Z`, `irrigacao01/telemetry` |
| `actuator`, `lastRequestId`, `actuatorUpdatedAt` | state | `bomba_simulada`, `cmd-1791933714552`, … |

> O Redis só guarda texto nos campos do HASH. Uma leitura inválida do sensor (`value: null`) é gravada como `"null"`, e o `consulta.js` converte de volta para `null`, número ou booleano.

### 3.2 `device:{id}:history` (SORTED SET)

Cada leitura é um membro JSON. O **score** é o horário de recebimento em milissegundos:

```json
{"receivedAt":"2026-10-13T23:21:54.402Z","sequence":33717,"valid":true,"value":27.8,"unit":"cm","wifiRssi":-54,"uptimeMs":140000,"actuatorState":true}
```

Por que SORTED SET e não LIST:

- os registros ficam **sempre ordenados por tempo**;
- dá para consultar **por período** (`ZRANGEBYSCORE chave inicio fim`), o que vai servir para o gráfico da API;
- dá para pegar **as últimas N** (`ZRANGE chave 0 N-1 REV`).

**Limite:** depois de cada inserção, `ZREMRANGEBYRANK chave 0 -(HISTORY_MAX+1)` apaga as leituras mais antigas e mantém só as **1000** mais recentes (o valor pode ser mudado pela variável `HISTORY_MAX`). Assim o histórico não cresce sem limite.

### 3.3 `device:{id}:presence` (HASH) + `device:{id}:heartbeat` (TTL)

| Campo | Significado |
|---|---|
| `status` | `online` ou `offline` (vem do tópico `availability` e do Last Will) |
| `lastSeen` / `lastSeenMs` | Último contato real do dispositivo (ISO e epoch ms) |
| `lastTopic` | Tópico da última mensagem |
| `offlineAt` | Quando o Last Will ("offline") chegou |

A presença usa **dois sinais**:

1. **Last Will (`availability = offline`)**: quando o ESP32 cai sem se desconectar, o broker publica `offline` e o gateway marca `status=offline` e apaga o heartbeat.
2. **Heartbeat com TTL**: toda mensagem válida faz `SETEX device:{id}:heartbeat 30 ...`. Se o dispositivo parar de publicar e o Last Will não chegar (broker reiniciado, rede travada), a chave **expira sozinha** em 30 s.

O dispositivo só é considerado **online** quando `status = online` **e** o heartbeat existe (`TTL > 0`). O valor de 30 s equivale a 6 ciclos de telemetria do ESP32 (que publica a cada 5 s) e pode ser mudado pela variável `PRESENCE_TTL_S`.

Mensagens **retidas** (`retain`) de `availability` atualizam só o `status`, sem renovar `lastSeen`, porque uma mensagem retida pode ser antiga e não prova que o dispositivo está vivo agora.

## 4. Operações por mensagem

Todas as gravações de uma mensagem são feitas em uma única transação **`MULTI/EXEC`**: ou tudo é gravado, ou nada.

**Telemetria válida (`irrigacao01/telemetry`):**

```text
MULTI
SADD   devices irrigacao01
HSET   device:irrigacao01:state  deviceId .. value 27.8 .. updatedAt ..
ZADD   device:irrigacao01:history 1791933714402 '{"receivedAt":...,"value":27.8,...}'
ZREMRANGEBYRANK device:irrigacao01:history 0 -1001
HSET   device:irrigacao01:presence status online lastSeen .. lastTopic ..
SETEX  device:irrigacao01:heartbeat 30 <agora>
EXEC
```

**Estado do atuador (`irrigacao01/state`):** `HSET state actuator/actuatorState/lastRequestId/actuatorUpdatedAt` + presença + heartbeat.

**Disponibilidade `offline` (Last Will):** `HSET presence status offline offlineAt ..` + `DEL heartbeat`.

### Falha do Redis

A conexão é aberta em segundo plano e se reconecta sozinha (espera crescente, até 5 s). Se o Redis estiver fora do ar, o gateway **continua recebendo e validando** o MQTT, mostra `!!! Falha ao persistir ...` e grava a falha em `logs/falhas-redis.log`. Quando o Redis volta, as gravações retornam sem precisar reiniciar o gateway (ver evidência 7).

## 5. Consultas

### Pelo script

```bash
node consulta.js                          # lista os dispositivos (SMEMBERS devices)
node consulta.js irrigacao01              # estado + presença + últimas 10 leituras
node consulta.js irrigacao01 estado
node consulta.js irrigacao01 presenca
node consulta.js irrigacao01 historico 20 # últimas 20 leituras
node consulta.js irrigacao01 periodo 10   # leituras dos últimos 10 minutos
```

### Direto no `redis-cli`

```text
SMEMBERS devices
HGETALL  device:irrigacao01:state
HGET     device:irrigacao01:state value
ZCARD    device:irrigacao01:history
ZRANGE   device:irrigacao01:history 0 4 REV           # 5 mais recentes
ZRANGEBYSCORE device:irrigacao01:history <ms_ini> <ms_fim>
HGETALL  device:irrigacao01:presence
TTL      device:irrigacao01:heartbeat                 # -2 = expirado/offline
```

## 6. Como executar (Windows)

1. **Redis.** Pode ser pelo Docker, dentro de `broker-mqtt`:
   ```bash
   docker compose up -d
   ```
   Sem Docker, use o Redis no WSL (`sudo apt install redis-server && redis-server`) ou o Memurai (compatível com Redis no Windows).
2. **Dependências**, dentro de `broker-mqtt`:
   ```bash
   npm install
   ```
   Isso instala o pacote oficial `redis` (node-redis v5), que foi incluído no `package.json`.
3. Em terminais separados, também dentro de `broker-mqtt`:
   ```bash
   npm run broker
   npm run gateway
   npm run publisher     # ou ligue o ESP32 (WifiMQQT.ino)
   ```
   No publisher: `send`, `auto`, `on`, `off`, `invalid`, `jsonbad`, `cair`.
4. Consulte com `npm run consulta -- irrigacao01`, ou rode o teste automático com `npm run teste`.

### Variáveis de ambiente (opcionais)

| Variável | Padrão |
|---|---|
| `MQTT_URL` | `mqtt://127.0.0.1:1883` |
| `REDIS_URL` | `redis://127.0.0.1:6379` |
| `HISTORY_MAX` | `1000` |
| `PRESENCE_TTL_S` | `30` |

No PowerShell: `$env:REDIS_URL="redis://192.168.0.10:6379"; npm run gateway`

## 7. Evidências (`EvidenciasEtapas/Etapa5/`)

| Arquivo | O que comprova |
|---|---|
| `01-teste-persistencia.txt` | Teste ponta a ponta com **7/7 verificações OK**: estado atual, confirmação do atuador, 5 leituras no histórico (a inválida foi descartada), ordem preservada, `value=null` registrado, presença ONLINE com último contato e **Last Will → OFFLINE** |
| `02-gateway.txt` | Console do gateway recebendo cada mensagem MQTT e mostrando os comandos Redis executados |
| `03-broker.txt` | Console do broker (conexões, assinaturas, publicações) |
| `04-redis-cli.txt` | Leitura direta no `redis-cli`: `KEYS`, `TYPE`, `HGETALL`, `ZRANGE ... WITHSCORES`, `TTL`, `SMEMBERS` |
| `05-consulta-*.txt` | Saídas do `consulta.js`: dispositivos, estado/presença/histórico, últimas N e por período |
| `06-gateway-redis-indisponivel.txt` | Redis derrubado: a mensagem é validada, a falha é registrada e, depois da reconexão automática, a gravação volta a funcionar |
| `logs-*.log` | Logs de mensagens válidas, inválidas e de falhas do Redis gerados na execução |

Resumo do teste automático:

```text
[OK]    Estado atual guarda a última leitura  ->  sequence=33717, value=27.8
[OK]    Estado atual guarda a confirmação do atuador  ->  actuatorState=true, lastRequestId=cmd-1791933714552
[OK]    Histórico recebeu exatamente as 5 leituras válidas (inválida descartada)  ->  ZCARD antes=0, depois=5
[OK]    Histórico recupera as leituras na ordem enviada  ->  enviadas=33713,...,33717 | recuperadas=33713,...,33717
[OK]    Leitura inválida do sensor ficou registrada como value=null
[OK]    Presença ONLINE com último contato recente  ->  status=online, ttl=29s
[OK]    Last Will marcou o dispositivo como OFFLINE e removeu o heartbeat
 RESULTADO: TODAS AS VERIFICAÇÕES PASSARAM
```

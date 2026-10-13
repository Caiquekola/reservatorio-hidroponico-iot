// ======================================================
// CAMADA DE PERSISTÊNCIA NO REDIS
// ------------------------------------------------------
// Centraliza a conexão com o Redis, a modelagem das
// chaves e as operações de gravação e consulta usadas
// pelo gateway e pelo script de consulta.
// ======================================================

import { createClient } from "redis";

export const REDIS_URL =
  process.env.REDIS_URL || "redis://127.0.0.1:6379";

// Quantidade máxima de leituras mantidas no histórico
// de cada dispositivo (as mais antigas são descartadas).
export const HISTORY_MAX =
  Number(process.env.HISTORY_MAX || 1000);

// Tempo (s) sem contato após o qual o dispositivo é
// considerado offline. O ESP32 publica a cada 5 s,
// então 30 s tolera a perda de algumas mensagens.
export const PRESENCE_TTL_S =
  Number(process.env.PRESENCE_TTL_S || 30);


// ======================================================
// MODELAGEM DAS CHAVES
// ------------------------------------------------------
// Padrão: device:{deviceId}:{tipo}
// O deviceId vem do tópico MQTT ({deviceId}/telemetry),
// o que permite distinguir cada dispositivo.
// ======================================================

export const KEYS = {
  // SET com todos os dispositivos já vistos
  devices: () => "devices",

  // HASH com a última telemetria + estado do atuador
  state: (id) => `device:${id}:state`,

  // SORTED SET (score = timestamp ms) com as leituras
  history: (id) => `device:${id}:history`,

  // HASH com status online/offline e último contato
  presence: (id) => `device:${id}:presence`,

  // STRING com TTL: existe enquanto o dispositivo
  // estiver se comunicando ("batimento")
  heartbeat: (id) => `device:${id}:heartbeat`
};


// ======================================================
// CONEXÃO
// ======================================================

// aguardar=false: inicia a conexão em segundo plano e
// devolve o cliente na hora (usado pelo gateway, que não
// deve parar de receber MQTT se o Redis estiver fora).
export async function conectarRedis({ log = console, aguardar = true } = {}) {

  const client = createClient({
    url: REDIS_URL,
    socket: {
      // Reconexão com espera crescente, limitada a 5 s
      reconnectStrategy: (tentativas) =>
        Math.min(tentativas * 500, 5000)
    }
  });

  client.on("error", (error) => {
    log.error(`Erro Redis: ${error.message}`);
  });

  client.on("reconnecting", () => {
    log.warn("Reconectando ao Redis...");
  });

  client.on("ready", () => {
    log.log(`Redis conectado: ${REDIS_URL}`);
  });

  const conexao = client.connect();

  if (aguardar) {
    await conexao;
  } else {
    conexao.catch((error) => {
      log.error(`Falha ao conectar no Redis: ${error.message}`);
    });
  }

  return client;
}

export async function fecharRedis(client) {

  if (typeof client.close === "function") {
    await client.close();
  } else {
    await client.quit();
  }
}


// ======================================================
// GRAVAÇÃO
// ======================================================

// Converte um objeto em campos string para o HASH.
// null é gravado como "null" para não perder a
// informação de "leitura inválida".
function paraHash(objeto) {

  const hash = {};

  for (const [campo, valor] of Object.entries(objeto)) {

    if (valor === undefined) {
      continue;
    }

    hash[campo] = String(valor);
  }

  return hash;
}

// Atualiza presença/último contato dentro de uma
// transação já aberta (MULTI).
function registrarContato(multi, deviceId, receivedAt, topic, status = "online") {

  multi.hSet(KEYS.presence(deviceId), {
    deviceId,
    status,
    lastSeen: receivedAt.toISOString(),
    lastSeenMs: String(receivedAt.getTime()),
    lastTopic: topic
  });

  multi.setEx(
    KEYS.heartbeat(deviceId),
    PRESENCE_TTL_S,
    receivedAt.toISOString()
  );
}

// Telemetria válida:
//   1) estado atual (HASH)          -> sobrescreve
//   2) histórico (SORTED SET)       -> acrescenta e limita
//   3) presença / último contato    -> atualiza
// Tudo em uma única transação MULTI/EXEC.
export async function salvarTelemetria(client, { topic, deviceId, mensagem, receivedAt = new Date() }) {

  const recebidoEm = receivedAt.toISOString();

  const estado = paraHash({
    deviceId,
    sensor: mensagem.sensor,
    valid: mensagem.valid,
    value: mensagem.value,
    unit: mensagem.unit,
    durationUs: mensagem.durationUs,
    sequence: mensagem.sequence,
    uptimeMs: mensagem.uptimeMs,
    wifiRssi: mensagem.wifiRssi,
    actuatorState: mensagem.actuatorState,
    updatedAt: recebidoEm,
    topic
  });

  const leitura = JSON.stringify({
    receivedAt: recebidoEm,
    sequence: mensagem.sequence,
    valid: mensagem.valid,
    value: mensagem.value,
    unit: mensagem.unit,
    wifiRssi: mensagem.wifiRssi,
    uptimeMs: mensagem.uptimeMs,
    actuatorState: mensagem.actuatorState ?? null
  });

  const multi = client.multi();

  multi.sAdd(KEYS.devices(), deviceId);

  multi.hSet(KEYS.state(deviceId), estado);

  multi.zAdd(KEYS.history(deviceId), {
    score: receivedAt.getTime(),
    value: leitura
  });

  // Mantém apenas as HISTORY_MAX leituras mais recentes
  multi.zRemRangeByRank(
    KEYS.history(deviceId),
    0,
    -(HISTORY_MAX + 1)
  );

  registrarContato(multi, deviceId, receivedAt, topic);

  await multi.exec();
}

// Confirmação de estado do atuador (tópico {id}/state)
export async function salvarEstadoAtuador(client, { topic, deviceId, mensagem, receivedAt = new Date() }) {

  const multi = client.multi();

  multi.sAdd(KEYS.devices(), deviceId);

  multi.hSet(KEYS.state(deviceId), paraHash({
    deviceId,
    actuator: mensagem.actuator,
    actuatorState: mensagem.state,
    lastRequestId: mensagem.requestId,
    actuatorUpdatedAt: receivedAt.toISOString()
  }));

  registrarContato(multi, deviceId, receivedAt, topic);

  await multi.exec();
}

// Disponibilidade (tópico {id}/availability):
// "online" ao conectar e "offline" via Last Will.
// Mensagens retidas (retain) atualizam apenas o status,
// pois não indicam contato recente do dispositivo.
export async function salvarDisponibilidade(client, { topic, deviceId, status, retained = false, receivedAt = new Date() }) {

  const multi = client.multi();

  multi.sAdd(KEYS.devices(), deviceId);

  if (status === "offline") {

    multi.hSet(KEYS.presence(deviceId), {
      deviceId,
      status: "offline",
      offlineAt: receivedAt.toISOString(),
      lastTopic: topic
    });

    multi.del(KEYS.heartbeat(deviceId));

  } else if (retained) {

    multi.hSet(KEYS.presence(deviceId), {
      deviceId,
      status
    });

  } else {

    registrarContato(multi, deviceId, receivedAt, topic, status);
  }

  await multi.exec();
}


// ======================================================
// CONSULTA
// ======================================================

// Converte os campos string do HASH de volta para
// tipos JavaScript (número, booleano e null).
function converterHash(hash) {

  const resultado = {};

  for (const [campo, texto] of Object.entries(hash)) {

    if (texto === "true" || texto === "false") {
      resultado[campo] = texto === "true";
    } else if (texto === "null") {
      resultado[campo] = null;
    } else if (texto !== "" && !Number.isNaN(Number(texto)) && !campo.endsWith("Id")) {
      resultado[campo] = Number(texto);
    } else {
      resultado[campo] = texto;
    }
  }

  return resultado;
}

export async function listarDispositivos(client) {

  const ids = await client.sMembers(KEYS.devices());

  return ids.sort();
}

export async function consultarEstado(client, deviceId) {

  const hash = await client.hGetAll(KEYS.state(deviceId));

  if (Object.keys(hash).length === 0) {
    return null;
  }

  return converterHash(hash);
}

// Últimas N leituras (mais recentes primeiro)
export async function consultarHistorico(client, deviceId, limite = 10) {

  const itens = await client.zRange(
    KEYS.history(deviceId),
    0,
    limite - 1,
    { REV: true }
  );

  return itens.map((item) => JSON.parse(item));
}

// Leituras entre duas datas (mais antigas primeiro)
export async function consultarHistoricoPeriodo(client, deviceId, inicio, fim = new Date()) {

  const itens = await client.zRangeByScore(
    KEYS.history(deviceId),
    inicio.getTime(),
    fim.getTime()
  );

  return itens.map((item) => JSON.parse(item));
}

export async function contarHistorico(client, deviceId) {

  return client.zCard(KEYS.history(deviceId));
}

// Presença: combina o HASH de presença com a existência
// da chave de heartbeat (TTL) para decidir se o
// dispositivo está realmente online.
export async function consultarPresenca(client, deviceId) {

  const [hash, ttl] = await Promise.all([
    client.hGetAll(KEYS.presence(deviceId)),
    client.ttl(KEYS.heartbeat(deviceId))
  ]);

  if (Object.keys(hash).length === 0) {
    return null;
  }

  const presenca = converterHash(hash);

  const batimentoAtivo = ttl > 0;

  presenca.heartbeatTtlS = batimentoAtivo ? ttl : 0;

  presenca.online =
    presenca.status === "online" && batimentoAtivo;

  if (presenca.lastSeenMs) {
    presenca.secondsSinceLastSeen = Math.round(
      (Date.now() - presenca.lastSeenMs) / 1000
    );
  }

  return presenca;
}

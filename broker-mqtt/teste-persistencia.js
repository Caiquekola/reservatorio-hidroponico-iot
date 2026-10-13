// ======================================================
// TESTE PONTA A PONTA: MQTT -> GATEWAY -> REDIS
// ------------------------------------------------------
// Pré-requisitos rodando: broker.js, gateway.js e Redis.
// Simula o ESP32 publicando no broker e depois consulta
// o Redis para conferir se tudo foi persistido.
//
//   node teste-persistencia.js
// ======================================================

import mqtt from "mqtt";

import {
  KEYS,
  HISTORY_MAX,
  conectarRedis,
  fecharRedis,
  consultarEstado,
  consultarHistorico,
  contarHistorico,
  consultarPresenca
} from "./redis-store.js";

const BROKER =
  process.env.MQTT_URL || "mqtt://127.0.0.1:1883";

const DEVICE_ID =
  process.env.DEVICE_ID || "irrigacao01";

const T = {
  telemetry: `${DEVICE_ID}/telemetry`,
  state: `${DEVICE_ID}/state`,
  availability: `${DEVICE_ID}/availability`
};

const esperar = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

let falhas = 0;

function verificar(descricao, condicao, detalhe = "") {

  if (!condicao) {
    falhas++;
  }

  console.log(
    `${condicao ? "[OK]   " : "[FALHA]"} ${descricao}` +
    (detalhe ? `  ->  ${detalhe}` : "")
  );
}

function titulo(texto) {

  console.log();
  console.log("========================================");
  console.log(` ${texto}`);
  console.log("========================================");
}


// ------------------------------------------------------
// Conexões
// ------------------------------------------------------

const redis = await conectarRedis({
  log: { log() {}, warn() {}, error: console.error }
});

// O "dispositivo" simulado conecta com Last Will igual
// ao do ESP32 (offline, retido, QoS 1).
const dispositivo = mqtt.connect(BROKER, {
  clientId: `${DEVICE_ID}-teste`,
  reconnectPeriod: 0,
  will: {
    topic: T.availability,
    payload: "offline",
    qos: 1,
    retain: true
  }
});

await new Promise((resolve, reject) => {
  dispositivo.once("connect", resolve);
  dispositivo.once("error", reject);
});

const publicar = (topico, payload, opcoes = {}) =>
  dispositivo.publishAsync(
    topico,
    typeof payload === "string" ? payload : JSON.stringify(payload),
    { qos: 1, ...opcoes }
  );

const totalAntes = await contarHistorico(redis, DEVICE_ID);


// ------------------------------------------------------
// 1) Dispositivo fica online
// ------------------------------------------------------

titulo("1) PUBLICANDO DISPONIBILIDADE ONLINE");

await publicar(T.availability, "online", { retain: true });
console.log(`-> ${T.availability}: online`);


// ------------------------------------------------------
// 2) Série de telemetrias (uma com sensor fora da faixa)
// ------------------------------------------------------

titulo("2) PUBLICANDO 5 TELEMETRIAS");

const base = Math.floor(Date.now() / 1000) % 100000;

const leituras = [
  { value: 42.3, valid: true, actuatorState: false },
  { value: 38.9, valid: true, actuatorState: false },
  { value: null, valid: false, actuatorState: false },
  { value: 31.4, valid: true, actuatorState: true },
  { value: 27.8, valid: true, actuatorState: true }
];

const enviadas = [];

for (const [i, l] of leituras.entries()) {

  const mensagem = {
    deviceId: DEVICE_ID,
    sensor: "ultrassonico",
    valid: l.valid,
    value: l.value,
    unit: "cm",
    sequence: base + i,
    uptimeMs: 120000 + i * 5000,
    wifiRssi: -50 - i,
    actuatorState: l.actuatorState
  };

  await publicar(T.telemetry, mensagem);
  enviadas.push(mensagem);

  console.log(
    `-> seq=${mensagem.sequence} value=${mensagem.value} valid=${mensagem.valid}`
  );

  await esperar(150);
}


// ------------------------------------------------------
// 3) Confirmação de estado do atuador
// ------------------------------------------------------

titulo("3) PUBLICANDO ESTADO DO ATUADOR");

const requestId = `cmd-${Date.now()}`;

await publicar(T.state, {
  deviceId: DEVICE_ID,
  actuator: "bomba_simulada",
  state: true,
  requestId
}, { retain: true });

console.log(`-> bomba_simulada = true (requestId ${requestId})`);


// ------------------------------------------------------
// 4) Mensagem inválida (não deve ir para o Redis)
// ------------------------------------------------------

titulo("4) PUBLICANDO TELEMETRIA INVÁLIDA");

await publicar(T.telemetry, {
  deviceId: DEVICE_ID,
  sensor: "ultrassonico",
  valid: true,
  value: "cinquenta",
  unit: "cm",
  sequence: -1,
  uptimeMs: 1,
  wifiRssi: "forte"
});

console.log("-> value=\"cinquenta\", sequence=-1 (inválida)");

await esperar(800);


// ------------------------------------------------------
// 5) Conferência no Redis
// ------------------------------------------------------

titulo("5) CONFERINDO O REDIS");

const ultima = enviadas.at(-1);

const estado = await consultarEstado(redis, DEVICE_ID);

console.log(`HGETALL ${KEYS.state(DEVICE_ID)}`);
console.log(JSON.stringify(estado, null, 2));

verificar(
  "Estado atual guarda a última leitura",
  estado?.sequence === ultima.sequence && estado?.value === ultima.value,
  `sequence=${estado?.sequence}, value=${estado?.value}`
);

verificar(
  "Estado atual guarda a confirmação do atuador",
  estado?.actuatorState === true && estado?.lastRequestId === requestId,
  `actuatorState=${estado?.actuatorState}, lastRequestId=${estado?.lastRequestId}`
);

const totalDepois = await contarHistorico(redis, DEVICE_ID);

verificar(
  "Histórico recebeu exatamente as 5 leituras válidas (inválida descartada)",
  totalDepois - totalAntes === 5 ||
    totalDepois === HISTORY_MAX,
  `ZCARD antes=${totalAntes}, depois=${totalDepois}`
);

const historico = await consultarHistorico(redis, DEVICE_ID, 5);

console.log();
console.log(`ZRANGE ${KEYS.history(DEVICE_ID)} 0 4 REV`);
console.table(historico);

const seqRecuperadas = historico.map((h) => h.sequence).reverse();
const seqEnviadas = enviadas.map((m) => m.sequence);

verificar(
  "Histórico recupera as leituras na ordem enviada",
  JSON.stringify(seqRecuperadas) === JSON.stringify(seqEnviadas),
  `enviadas=${seqEnviadas.join(",")} | recuperadas=${seqRecuperadas.join(",")}`
);

verificar(
  "Leitura inválida do sensor ficou registrada como value=null",
  historico.some((h) => h.valid === false && h.value === null)
);

let presenca = await consultarPresenca(redis, DEVICE_ID);

console.log();
console.log(`HGETALL ${KEYS.presence(DEVICE_ID)}  +  TTL ${KEYS.heartbeat(DEVICE_ID)}`);
console.log(JSON.stringify(presenca, null, 2));

verificar(
  "Presença ONLINE com último contato recente",
  presenca?.online === true && presenca.secondsSinceLastSeen <= 5,
  `status=${presenca?.status}, lastSeen=${presenca?.lastSeen}, ttl=${presenca?.heartbeatTtlS}s`
);


// ------------------------------------------------------
// 6) Queda do dispositivo -> Last Will "offline"
// ------------------------------------------------------

titulo("6) SIMULANDO QUEDA DO DISPOSITIVO (LAST WILL)");

// Fecha o socket sem DISCONNECT: o broker publica o LWT
dispositivo.stream.destroy();
console.log("-> conexão do dispositivo derrubada sem DISCONNECT");

await esperar(1500);

presenca = await consultarPresenca(redis, DEVICE_ID);

console.log(JSON.stringify(presenca, null, 2));

verificar(
  "Last Will marcou o dispositivo como OFFLINE e removeu o heartbeat",
  presenca?.online === false &&
    presenca?.status === "offline" &&
    presenca?.heartbeatTtlS === 0,
  `status=${presenca?.status}, offlineAt=${presenca?.offlineAt}, lastSeen=${presenca?.lastSeen}`
);


// ------------------------------------------------------
// Resultado
// ------------------------------------------------------

titulo(
  falhas === 0
    ? "RESULTADO: TODAS AS VERIFICAÇÕES PASSARAM"
    : `RESULTADO: ${falhas} VERIFICAÇÃO(ÕES) FALHARAM`
);

dispositivo.end(true);
await fecharRedis(redis);

process.exit(falhas === 0 ? 0 : 1);

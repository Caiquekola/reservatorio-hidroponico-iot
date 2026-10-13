import mqtt from "mqtt";
import fs from "node:fs";
import path from "node:path";

import {
  REDIS_URL,
  conectarRedis,
  salvarTelemetria,
  salvarEstadoAtuador,
  salvarDisponibilidade,
  fecharRedis
} from "./redis-store.js";

const BROKER =
  process.env.MQTT_URL || "mqtt://127.0.0.1:1883";

const CLIENT_ID = "gateway-node-iot3";

// Tópicos assinados ("+" = qualquer deviceId)
const TOPIC_TELEMETRY = "+/telemetry";
const TOPIC_STATE = "+/state";
const TOPIC_AVAILABILITY = "+/availability";

const TOPICOS = [
  TOPIC_TELEMETRY,
  TOPIC_STATE,
  TOPIC_AVAILABILITY
];

const LOG_DIR = path.resolve("logs");

const LOG_VALIDAS =
  path.join(LOG_DIR, "mensagens-validas.log");

const LOG_INVALIDAS =
  path.join(LOG_DIR, "mensagens-invalidas.log");

const LOG_FALHAS_REDIS =
  path.join(LOG_DIR, "falhas-redis.log");

fs.mkdirSync(LOG_DIR, {
  recursive: true
});


// ======================================================
// CONEXÃO COM O REDIS
// ------------------------------------------------------
// A conexão é iniciada em segundo plano: se o Redis
// estiver fora do ar, o gateway continua recebendo e
// validando MQTT e registra a falha em log.
// ======================================================

const redis = await conectarRedis({
  aguardar: false
});


// ======================================================
// CONEXÃO COM O BROKER MQTT
// ======================================================

const client = mqtt.connect(BROKER, {
  clientId: CLIENT_ID
});

client.on("connect", () => {

  console.log("========================================");
  console.log(" GATEWAY MQTT + REDIS INICIADO");
  console.log("========================================");

  console.log(`Broker: ${BROKER}`);
  console.log(`Redis: ${REDIS_URL}`);
  console.log(`Client ID: ${CLIENT_ID}`);

  client.subscribe(
    TOPICOS,
    {
      qos: 1
    },
    (error) => {

      if (error) {
        console.error(
          "Erro ao assinar tópicos:",
          error.message
        );

        return;
      }

      TOPICOS.forEach((topico) => {
        console.log(`Tópico assinado: ${topico}`);
      });

      console.log(
        "Aguardando mensagens..."
      );
    }
  );
});

client.on("message", (topic, payload, packet) => {

  console.log();
  console.log("========================================");
  console.log(" NOVA MENSAGEM MQTT");
  console.log("========================================");

  console.log(`Tópico: ${topic}`);

  const texto =
    payload.toString();

  const partes =
    topic.split("/");

  const tiposValidos = [
    "telemetry",
    "state",
    "availability"
  ];

  if (
    partes.length !== 2 ||
    !tiposValidos.includes(partes[1])
  ) {

    registrarInvalida({
      topic,
      payload: texto,
      erros: [
        "Estrutura de tópico inválida."
      ]
    });

    return;
  }

  const [deviceIdTopico, tipo] =
    partes;

  console.log(
    `Dispositivo identificado: ${deviceIdTopico}`
  );

  // ----------------------------------------------------
  // AVAILABILITY: texto simples "online" / "offline"
  // ----------------------------------------------------

  if (tipo === "availability") {

    tratarDisponibilidade(
      topic,
      deviceIdTopico,
      texto,
      packet.retain
    );

    return;
  }

  // ----------------------------------------------------
  // TELEMETRY e STATE: JSON
  // ----------------------------------------------------

  let mensagem;

  try {

    mensagem =
      JSON.parse(texto);

  } catch {

    registrarInvalida({
      topic,
      deviceId: deviceIdTopico,
      payload: texto,
      erros: [
        "Payload não contém JSON válido."
      ]
    });

    return;
  }

  const erros =
    tipo === "telemetry"
      ? validarTelemetria(mensagem, deviceIdTopico)
      : validarEstado(mensagem, deviceIdTopico);

  if (erros.length > 0) {

    registrarInvalida({
      topic,
      deviceId: deviceIdTopico,
      payload: mensagem,
      erros
    });

    return;
  }

  registrarValida(
    topic,
    deviceIdTopico,
    tipo,
    mensagem
  );

  if (tipo === "telemetry") {

    persistir(
      "telemetria",
      () => salvarTelemetria(redis, {
        topic,
        deviceId: deviceIdTopico,
        mensagem
      }),
      [
        `HSET  device:${deviceIdTopico}:state`,
        `ZADD  device:${deviceIdTopico}:history`,
        `HSET  device:${deviceIdTopico}:presence`,
        `SETEX device:${deviceIdTopico}:heartbeat`
      ]
    );

  } else {

    persistir(
      "estado do atuador",
      () => salvarEstadoAtuador(redis, {
        topic,
        deviceId: deviceIdTopico,
        mensagem
      }),
      [
        `HSET  device:${deviceIdTopico}:state (atuador)`,
        `HSET  device:${deviceIdTopico}:presence`,
        `SETEX device:${deviceIdTopico}:heartbeat`
      ]
    );
  }
});


// ======================================================
// VALIDAÇÕES
// ======================================================

function validarTelemetria(
  mensagem,
  deviceIdTopico
) {

  const erros = [];

  if (
    typeof mensagem !== "object" ||
    mensagem === null ||
    Array.isArray(mensagem)
  ) {

    return [
      "A mensagem deve ser um objeto JSON."
    ];
  }

  validarDeviceId(mensagem, deviceIdTopico, erros);

  if (
    typeof mensagem.sensor !== "string" ||
    mensagem.sensor.trim() === ""
  ) {

    erros.push(
      "Campo sensor ausente ou inválido."
    );
  }

  if (
    typeof mensagem.valid !== "boolean"
  ) {

    erros.push(
      "Campo valid deve ser boolean."
    );
  }

  if (
    typeof mensagem.unit !== "string"
  ) {

    erros.push(
      "Campo unit ausente ou inválido."
    );
  }

  if (mensagem.valid === true) {

    if (
      typeof mensagem.value !== "number" ||
      !Number.isFinite(mensagem.value)
    ) {

      erros.push(
        "Quando valid=true, value deve ser numérico."
      );
    }
  }

  if (
    mensagem.valid === false &&
    mensagem.value !== null
  ) {

    erros.push(
      "Quando valid=false, value deve ser null."
    );
  }

  if (
    !Number.isInteger(mensagem.sequence) ||
    mensagem.sequence < 0
  ) {

    erros.push(
      "sequence deve ser inteiro >= 0."
    );
  }

  if (
    typeof mensagem.uptimeMs !== "number" ||
    mensagem.uptimeMs < 0
  ) {

    erros.push(
      "uptimeMs ausente ou inválido."
    );
  }

  if (
    typeof mensagem.wifiRssi !== "number"
  ) {

    erros.push(
      "wifiRssi ausente ou inválido."
    );
  }

  return erros;
}

// Mensagem publicada pelo ESP32 em {id}/state
// { deviceId, actuator, state, requestId }
function validarEstado(
  mensagem,
  deviceIdTopico
) {

  const erros = [];

  if (
    typeof mensagem !== "object" ||
    mensagem === null ||
    Array.isArray(mensagem)
  ) {

    return [
      "A mensagem deve ser um objeto JSON."
    ];
  }

  validarDeviceId(mensagem, deviceIdTopico, erros);

  if (
    typeof mensagem.actuator !== "string" ||
    mensagem.actuator.trim() === ""
  ) {

    erros.push(
      "Campo actuator ausente ou inválido."
    );
  }

  if (
    typeof mensagem.state !== "boolean"
  ) {

    erros.push(
      "Campo state deve ser boolean."
    );
  }

  return erros;
}

function validarDeviceId(
  mensagem,
  deviceIdTopico,
  erros
) {

  if (
    typeof mensagem.deviceId !== "string" ||
    mensagem.deviceId.trim() === ""
  ) {

    erros.push(
      "Campo deviceId ausente ou inválido."
    );

  } else if (
    mensagem.deviceId !== deviceIdTopico
  ) {

    erros.push(
      "deviceId da mensagem não corresponde ao tópico."
    );
  }
}


// ======================================================
// DISPONIBILIDADE (online / offline / Last Will)
// ======================================================

function tratarDisponibilidade(
  topic,
  deviceId,
  texto,
  retained
) {

  let status =
    texto.trim().toLowerCase();

  // Aceita também {"status":"online"}
  if (status.startsWith("{")) {

    try {
      status = String(
        JSON.parse(texto).status
      ).toLowerCase();
    } catch {
      status = "";
    }
  }

  if (
    status !== "online" &&
    status !== "offline"
  ) {

    registrarInvalida({
      topic,
      deviceId,
      payload: texto,
      erros: [
        "Disponibilidade deve ser \"online\" ou \"offline\"."
      ]
    });

    return;
  }

  console.log();
  console.log(">>> DISPONIBILIDADE <<<");
  console.log(`Device ID: ${deviceId}`);
  console.log(
    `Status: ${status.toUpperCase()}` +
    (retained ? " (mensagem retida)" : "")
  );

  persistir(
    "disponibilidade",
    () => salvarDisponibilidade(redis, {
      topic,
      deviceId,
      status,
      retained
    }),
    [
      `HSET  device:${deviceId}:presence status=${status}`,
      status === "offline"
        ? `DEL   device:${deviceId}:heartbeat`
        : `SETEX device:${deviceId}:heartbeat`
    ]
  );
}


// ======================================================
// PERSISTÊNCIA COM TRATAMENTO DE FALHA
// ======================================================

async function persistir(
  descricao,
  operacao,
  comandos
) {

  if (!redis.isReady) {

    registrarFalhaRedis(
      descricao,
      "Redis indisponível no momento."
    );

    return;
  }

  try {

    await operacao();

    console.log(
      `Persistido no Redis (${descricao}):`
    );

    comandos.forEach((comando) => {
      console.log(`  ${comando}`);
    });

  } catch (error) {

    registrarFalhaRedis(
      descricao,
      error.message
    );
  }
}

function registrarFalhaRedis(
  descricao,
  motivo
) {

  console.error(
    `!!! Falha ao persistir ${descricao}: ${motivo}`
  );

  fs.appendFileSync(
    LOG_FALHAS_REDIS,
    JSON.stringify({
      at: new Date().toISOString(),
      operacao: descricao,
      motivo
    }) + "\n",
    "utf8"
  );
}


// ======================================================
// LOGS EM ARQUIVO
// ======================================================

function registrarValida(
  topic,
  deviceId,
  tipo,
  mensagem
) {

  const registro = {
    receivedAt:
      new Date().toISOString(),

    topic,
    deviceId,
    status: "VALIDA",
    data: mensagem
  };

  console.log();
  console.log(">>> MENSAGEM VÁLIDA <<<");

  console.log(
    `Device ID: ${deviceId}`
  );

  if (tipo === "telemetry") {

    console.log(
      `Sensor: ${mensagem.sensor}`
    );

    console.log(
      `Valor: ${
        mensagem.value === null
          ? "NULL"
          : mensagem.value
      } ${mensagem.unit}`
    );

    console.log(
      `Sequência: ${mensagem.sequence}`
    );

    console.log(
      `RSSI: ${mensagem.wifiRssi} dBm`
    );

  } else {

    console.log(
      `Atuador: ${mensagem.actuator} -> ${
        mensagem.state ? "LIGADO" : "DESLIGADO"
      }`
    );
  }

  fs.appendFileSync(
    LOG_VALIDAS,
    JSON.stringify(registro) + "\n",
    "utf8"
  );
}

function registrarInvalida({
  topic,
  deviceId = null,
  payload,
  erros
}) {

  const registro = {
    receivedAt:
      new Date().toISOString(),

    topic,
    deviceId,
    status: "INVALIDA",
    errors: erros,
    payload
  };

  console.log();
  console.log(">>> MENSAGEM INVÁLIDA <<<");

  erros.forEach((erro) => {
    console.log(`- ${erro}`);
  });

  fs.appendFileSync(
    LOG_INVALIDAS,
    JSON.stringify(registro) + "\n",
    "utf8"
  );

  console.log(
    "Registro salvo em logs/mensagens-invalidas.log (não persistido no Redis)"
  );
}

client.on("error", (error) => {

  console.error(
    "Erro MQTT:",
    error.message
  );
});


// ======================================================
// ENCERRAMENTO
// ======================================================

process.on("SIGINT", async () => {

  console.log();
  console.log("Encerrando gateway...");

  client.end();

  try {
    if (redis.isOpen) {
      await fecharRedis(redis);
    }
  } catch {
    // ignorado no encerramento
  }

  process.exit(0);
});

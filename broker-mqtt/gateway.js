import mqtt from "mqtt";
import fs from "node:fs";
import path from "node:path";

const BROKER = "mqtt://127.0.0.1:1883";
const CLIENT_ID = "gateway-node-iot3";

const TOPIC_TELEMETRY = "+/telemetry";

const client = mqtt.connect(BROKER, {
  clientId: CLIENT_ID
});

const LOG_DIR = path.resolve("logs");

const LOG_VALIDAS =
  path.join(LOG_DIR, "mensagens-validas.log");

const LOG_INVALIDAS =
  path.join(LOG_DIR, "mensagens-invalidas.log");

fs.mkdirSync(LOG_DIR, {
  recursive: true
});

client.on("connect", () => {

  console.log("========================================");
  console.log(" GATEWAY MQTT INICIADO");
  console.log("========================================");

  console.log(`Broker: ${BROKER}`);
  console.log(`Client ID: ${CLIENT_ID}`);

  client.subscribe(
    TOPIC_TELEMETRY,
    {
      qos: 1
    },
    (error) => {

      if (error) {
        console.error(
          "Erro ao assinar tópico:",
          error.message
        );

        return;
      }

      console.log(
        `Tópico assinado: ${TOPIC_TELEMETRY}`
      );

      console.log(
        "Aguardando mensagens..."
      );
    }
  );
});

client.on("message", (topic, payload) => {

  console.log();
  console.log("========================================");
  console.log(" NOVA MENSAGEM MQTT");
  console.log("========================================");

  console.log(`Tópico: ${topic}`);

  const texto =
    payload.toString();

  const partes =
    topic.split("/");

  if (
    partes.length !== 2 ||
    partes[1] !== "telemetry"
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

  const deviceIdTopico =
    partes[0];

  console.log(
    `Dispositivo identificado: ${deviceIdTopico}`
  );

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
    validarTelemetria(
      mensagem,
      deviceIdTopico
    );

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
    mensagem
  );
});

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

function registrarValida(
  topic,
  deviceId,
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

  fs.appendFileSync(
    LOG_VALIDAS,
    JSON.stringify(registro) + "\n",
    "utf8"
  );

  console.log(
    "Registro salvo em logs/mensagens-validas.log"
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
    "Registro salvo em logs/mensagens-invalidas.log"
  );
}

client.on("error", (error) => {

  console.error(
    "Erro MQTT:",
    error.message
  );
});
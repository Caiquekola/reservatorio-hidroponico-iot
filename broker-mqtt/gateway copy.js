import mqtt from "mqtt";
import fs from "node:fs";
import path from "node:path";

// ======================================================
// CONFIGURACAO MQTT
// ======================================================

const BROKER = "mqtt://127.0.0.1:1883";

const CLIENT_ID = "gateway-node-iot3";

// O + representa qualquer dispositivo.
// Assim:
// irrigacao01/telemetry
// reservatorio02/telemetry
// etc.
//
// O gateway consegue identificar o dispositivo
// pelo proprio topico.

const TOPIC_TELEMETRY = "+/telemetry";

const client = mqtt.connect(BROKER, {
  clientId: CLIENT_ID
});


// ======================================================
// ARQUIVOS DE LOG
// ======================================================

const LOG_DIR = path.resolve("logs");

const LOG_VALIDAS =
  path.join(LOG_DIR, "mensagens-validas.log");

const LOG_INVALIDAS =
  path.join(LOG_DIR, "mensagens-invalidas.log");


// Cria pasta logs caso nao exista

fs.mkdirSync(LOG_DIR, {
  recursive: true
});


// ======================================================
// CONEXAO COM BROKER
// ======================================================

client.on("connect", () => {

  console.log();
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
          "Erro ao assinar telemetria:",
          error.message
        );

        return;
      }

      console.log();
      console.log(
        `Assinatura realizada: ${TOPIC_TELEMETRY}`
      );

      console.log(
        "Aguardando mensagens dos dispositivos..."
      );

      console.log();
    }
  );
});


// ======================================================
// ERROS MQTT
// ======================================================

client.on("error", (error) => {

  console.error(
    "Erro MQTT:",
    error.message
  );
});


// ======================================================
// RECEPCAO MQTT
// ======================================================

client.on("message", (topic, payload) => {

  console.log();
  console.log("========================================");
  console.log(" NOVA MENSAGEM MQTT");
  console.log("========================================");

  console.log(`Topico: ${topic}`);

  const texto =
    payload.toString();


  // ----------------------------------------------------
  // IDENTIFICA DISPOSITIVO PELO TOPICO
  // ----------------------------------------------------

  const dadosTopico =
    extrairDadosTopico(topic);


  if (!dadosTopico) {

    registrarInvalida({
      topic,
      payload: texto,
      errors: [
        "Estrutura de topico invalida."
      ]
    });

    return;
  }


  const {
    deviceIdTopico,
    tipoMensagem
  } = dadosTopico;


  console.log(
    `Dispositivo identificado: ${deviceIdTopico}`
  );

  console.log(
    `Tipo de mensagem: ${tipoMensagem}`
  );


  // ----------------------------------------------------
  // INTERPRETA JSON
  // ----------------------------------------------------

  let mensagem;

  try {

    mensagem =
      JSON.parse(texto);

  } catch (error) {

    registrarInvalida({
      topic,
      deviceId: deviceIdTopico,
      payload: texto,
      errors: [
        "Payload nao possui JSON valido."
      ]
    });

    return;
  }


  // ----------------------------------------------------
  // VALIDA TELEMETRIA
  // ----------------------------------------------------

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
      errors: erros
    });

    return;
  }


  // ----------------------------------------------------
  // MENSAGEM VALIDA
  // ----------------------------------------------------

  registrarValida(
    topic,
    deviceIdTopico,
    mensagem
  );
});


// ======================================================
// EXTRAI INFORMACOES DO TOPICO
// ======================================================

function extrairDadosTopico(topic) {

  const partes =
    topic.split("/");


  // Esperado:
  // irrigacao01/telemetry

  if (partes.length !== 2) {
    return null;
  }


  const deviceIdTopico =
    partes[0];


  const tipoMensagem =
    partes[1];


  if (
    !deviceIdTopico ||
    tipoMensagem !== "telemetry"
  ) {

    return null;
  }


  return {
    deviceIdTopico,
    tipoMensagem
  };
}


// ======================================================
// VALIDACAO DA TELEMETRIA
// ======================================================

function validarTelemetria(
  mensagem,
  deviceIdTopico
) {

  const erros = [];


  // ----------------------------------------------------
  // JSON DEVE SER OBJETO
  // ----------------------------------------------------

  if (
    typeof mensagem !== "object" ||
    mensagem === null ||
    Array.isArray(mensagem)
  ) {

    return [
      "A mensagem deve ser um objeto JSON."
    ];
  }


  // ----------------------------------------------------
  // DEVICE ID
  // ----------------------------------------------------

  if (
    typeof mensagem.deviceId !== "string" ||
    mensagem.deviceId.trim() === ""
  ) {

    erros.push(
      "Campo deviceId ausente ou invalido."
    );

  } else if (
    mensagem.deviceId !== deviceIdTopico
  ) {

    erros.push(
      `deviceId '${mensagem.deviceId}' ` +
      `nao corresponde ao dispositivo ` +
      `do topico '${deviceIdTopico}'.`
    );
  }


  // ----------------------------------------------------
  // SENSOR
  // ----------------------------------------------------

  if (
    typeof mensagem.sensor !== "string" ||
    mensagem.sensor.trim() === ""
  ) {

    erros.push(
      "Campo sensor ausente ou invalido."
    );
  }


  // ----------------------------------------------------
  // VALID
  // ----------------------------------------------------

  if (
    typeof mensagem.valid !== "boolean"
  ) {

    erros.push(
      "Campo valid deve ser boolean."
    );
  }


  // ----------------------------------------------------
  // UNIT
  // ----------------------------------------------------

  if (
    typeof mensagem.unit !== "string"
  ) {

    erros.push(
      "Campo unit ausente ou invalido."
    );
  }


  // ----------------------------------------------------
  // VALUE
  // ----------------------------------------------------

  if (mensagem.valid === true) {

    if (
      typeof mensagem.value !== "number" ||
      !Number.isFinite(mensagem.value)
    ) {

      erros.push(
        "Quando valid=true, value deve ser numerico."
      );

    } else if (
      mensagem.sensor === "ultrassonico" &&
      (
        mensagem.value < 20 ||
        mensagem.value > 600
      )
    ) {

      erros.push(
        "Distancia ultrassonica fora da faixa esperada."
      );
    }

  } else if (
    mensagem.valid === false &&
    mensagem.value !== null
  ) {

    erros.push(
      "Quando valid=false, value deve ser null."
    );
  }


  // ----------------------------------------------------
  // SEQUENCE
  // ----------------------------------------------------

  if (
    !Number.isInteger(mensagem.sequence) ||
    mensagem.sequence < 0
  ) {

    erros.push(
      "Campo sequence deve ser inteiro >= 0."
    );
  }


  // ----------------------------------------------------
  // UPTIME
  // ----------------------------------------------------

  if (
    typeof mensagem.uptimeMs !== "number" ||
    mensagem.uptimeMs < 0
  ) {

    erros.push(
      "Campo uptimeMs ausente ou invalido."
    );
  }


  // ----------------------------------------------------
  // RSSI
  // ----------------------------------------------------

  if (
    typeof mensagem.wifiRssi !== "number"
  ) {

    erros.push(
      "Campo wifiRssi ausente ou invalido."
    );
  }


  // ----------------------------------------------------
  // ESTADO DO ATUADOR - OPCIONAL
  // ----------------------------------------------------

  if (
    "actuatorState" in mensagem &&
    typeof mensagem.actuatorState !== "boolean"
  ) {

    erros.push(
      "Campo actuatorState deve ser boolean."
    );
  }


  // ----------------------------------------------------
  // DURACAO DO SENSOR - OPCIONAL
  // ----------------------------------------------------

  if (
    "durationUs" in mensagem &&
    (
      typeof mensagem.durationUs !== "number" ||
      mensagem.durationUs < 0
    )
  ) {

    erros.push(
      "Campo durationUs invalido."
    );
  }


  return erros;
}


// ======================================================
// MENSAGEM VALIDA
// ======================================================

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

    status:
      "VALIDA",

    data:
      mensagem
  };


  console.log();
  console.log(">>> MENSAGEM VALIDA <<<");

  console.log(
    `Device ID: ${deviceId}`
  );

  console.log(
    `Sensor: ${mensagem.sensor}`
  );

  console.log(
    `Leitura valida: ${mensagem.valid}`
  );


  if (mensagem.valid) {

    console.log(
      `Valor: ${mensagem.value} ${mensagem.unit}`
    );

  } else {

    console.log(
      "Sensor informou leitura invalida."
    );
  }


  console.log(
    `Sequencia: ${mensagem.sequence}`
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
    "Registrada em logs/mensagens-validas.log"
  );
}


// ======================================================
// MENSAGEM INVALIDA
// ======================================================

function registrarInvalida({
  topic,
  deviceId = null,
  payload,
  errors
}) {

  const registro = {

    receivedAt:
      new Date().toISOString(),

    topic,

    deviceId,

    status:
      "INVALIDA",

    errors,

    payload
  };


  console.log();
  console.log(">>> MENSAGEM INVALIDA <<<");


  errors.forEach(
    (erro) => {

      console.log(
        `- ${erro}`
      );
    }
  );


  fs.appendFileSync(
    LOG_INVALIDAS,
    JSON.stringify(registro) + "\n",
    "utf8"
  );


  console.log(
    "Registrada em logs/mensagens-invalidas.log"
  );
}
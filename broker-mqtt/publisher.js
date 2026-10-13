import mqtt from "mqtt";
import readline from "node:readline";

const BROKER =
  "mqtt://127.0.0.1:1883";

const DEVICE_ID =
  "irrigacao01";

const TOPIC =
  `${DEVICE_ID}/telemetry`;

const TOPIC_AVAILABILITY =
  `${DEVICE_ID}/availability`;

const TOPIC_STATE =
  `${DEVICE_ID}/state`;

const client =
  mqtt.connect(BROKER, {
    clientId:
      "publisher-irrigacao01",

    // Igual ao ESP32: se a conexão cair, o broker
    // publica "offline" (Last Will) no tópico de
    // disponibilidade.
    will: {
      topic: TOPIC_AVAILABILITY,
      payload: "offline",
      qos: 1,
      retain: true
    }
  });

let bombaLigada = false;

let timerAuto = null;

let sequence = 0;

const rl =
  readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

client.on("connect", () => {

  console.log(
    "========================================"
  );

  console.log(
    " DISPOSITIVO MQTT CONECTADO"
  );

  console.log(
    "========================================"
  );

  console.log(
    `Device ID: ${DEVICE_ID}`
  );

  console.log(
    `Tópico: ${TOPIC}`
  );

  client.publish(
    TOPIC_AVAILABILITY,
    "online",
    { qos: 1, retain: true }
  );

  console.log(
    `Disponibilidade: online (${TOPIC_AVAILABILITY})`
  );

  console.log();

  console.log(
    "Comandos:"
  );

  console.log(
    "send -> enviar telemetria"
  );

  console.log(
    "invalid -> enviar telemetria inválida"
  );

  console.log(
    "jsonbad -> enviar JSON malformado"
  );

  console.log(
    "auto -> liga/desliga envio automático a cada 5 s"
  );

  console.log(
    "on / off -> publica estado da bomba (tópico state)"
  );

  console.log(
    "cair -> derruba a conexão (dispara o Last Will)"
  );

  console.log();
});

rl.on("line", (entrada) => {

  const comando =
    entrada
      .trim()
      .toLowerCase();

  if (comando === "send") {

    enviarTelemetriaValida();

  } else if (
    comando === "invalid"
  ) {

    enviarTelemetriaInvalida();

  } else if (
    comando === "jsonbad"
  ) {

    enviarJsonMalformado();

  } else if (
    comando === "auto"
  ) {

    alternarAutomatico();

  } else if (
    comando === "on" ||
    comando === "off"
  ) {

    publicarEstadoBomba(comando === "on");

  } else if (
    comando === "cair"
  ) {

    // Fecha o socket sem DISCONNECT
    client.options.reconnectPeriod = 0;
    client.stream.destroy();

    console.log(
      "Conexão derrubada. O broker deve publicar o Last Will (offline)."
    );

  } else {

    console.log(
      "Use: send, invalid, jsonbad, auto, on, off ou cair"
    );
  }
});

function enviarTelemetriaValida() {

  sequence++;

  const mensagem = {

    deviceId:
      DEVICE_ID,

    sensor:
      "ultrassonico",

    valid:
      true,

    durationUs:
      2915,

    // Distância simulada entre 20 e 80 cm
    value:
      Number((20 + Math.random() * 60).toFixed(1)),

    unit:
      "cm",

    sequence,

    uptimeMs:
      Date.now(),

    wifiRssi:
      -51,

    actuatorState:
      bombaLigada
  };

  publicar(mensagem);
}

function alternarAutomatico() {

  if (timerAuto) {

    clearInterval(timerAuto);
    timerAuto = null;

    console.log("Envio automático desligado.");
    return;
  }

  timerAuto = setInterval(
    enviarTelemetriaValida,
    5000
  );

  console.log("Envio automático ligado (5 s).");
}

function publicarEstadoBomba(estado) {

  bombaLigada = estado;

  const mensagem = {
    deviceId: DEVICE_ID,
    actuator: "bomba_simulada",
    state: estado,
    requestId: `manual-${Date.now()}`
  };

  client.publish(
    TOPIC_STATE,
    JSON.stringify(mensagem),
    { qos: 1, retain: true },
    () => {
      console.log(
        `Estado publicado em ${TOPIC_STATE}: bomba ${estado ? "LIGADA" : "DESLIGADA"}`
      );
    }
  );
}

function enviarTelemetriaInvalida() {

  sequence++;

  const mensagem = {

    deviceId:
      "dispositivo-incorreto",

    sensor:
      "ultrassonico",

    valid:
      true,

    value:
      "cinquenta",

    unit:
      "cm",

    sequence:
      -1,

    uptimeMs:
      Date.now(),

    wifiRssi:
      "forte"
  };

  publicar(mensagem);
}

function enviarJsonMalformado() {

  const mensagem =
    '{"deviceId":"irrigacao01","sensor":';

  client.publish(
    TOPIC,
    mensagem,
    {
      qos: 1
    },
    (error) => {

      if (error) {

        console.error(
          "Falha ao publicar:",
          error.message
        );

        return;
      }

      console.log();
      console.log(
        "Mensagem publicada."
      );

      console.log(
        `Tópico: ${TOPIC}`
      );
    }
  );
}

function publicar(mensagem) {

  const payload =
    JSON.stringify(mensagem);

  client.publish(
    TOPIC,
    payload,
    {
      qos: 1
    },
    (error) => {

      if (error) {

        console.error(
          "Falha ao publicar:",
          error.message
        );

        return;
      }

      console.log();
      console.log(
        "Mensagem publicada."
      );

      console.log(
        `Tópico: ${TOPIC}`
      );

      console.log(
        JSON.stringify(
          mensagem,
          null,
          2
        )
      );
    }
  );
}
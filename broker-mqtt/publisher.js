import mqtt from "mqtt";
import readline from "node:readline";

const BROKER =
  "mqtt://127.0.0.1:1883";

const DEVICE_ID =
  "irrigacao01";

const TOPIC =
  `${DEVICE_ID}/telemetry`;

const client =
  mqtt.connect(BROKER, {
    clientId:
      "publisher-irrigacao01"
  });

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

  } else {

    console.log(
      "Use: send, invalid ou jsonbad"
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

    value:
      50.0,

    unit:
      "cm",

    sequence,

    uptimeMs:
      Date.now(),

    wifiRssi:
      -51,

    actuatorState:
      false
  };

  publicar(mensagem);
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
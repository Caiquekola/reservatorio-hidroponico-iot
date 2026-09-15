import mqtt from "mqtt";
import readline from "node:readline";

const BROKER = "mqtt://127.0.0.1:1883";

const BASE =
  "irrigacao01";

const TOPIC_TELEMETRY =
  `${BASE}/telemetry`;

const TOPIC_COMMAND =
  `${BASE}/command`;

const TOPIC_STATE =
  `${BASE}/state`;

const TOPIC_AVAILABILITY =
  `${BASE}/availability`;

const client = mqtt.connect(BROKER, {
  clientId: "cliente-node-entrega3"
});

client.on("connect", () => {

  console.log("=================================");
  console.log(" CLIENTE MQTT CONECTADO");
  console.log("=================================");

  client.subscribe(`${BASE}/#`, {
    qos: 1
  }, (error) => {

    if (error) {
      console.error(
        "Erro ao assinar tópicos:",
        error.message
      );

      return;
    }

    console.log(
      `Observando: ${BASE}/#`
    );
  });

  console.log();
  console.log("Comandos disponíveis:");
  console.log("on  -> ligar bomba simulada");
  console.log("off -> desligar bomba simulada");
  console.log("bad -> enviar JSON inválido");
  console.log();
});

client.on("message", (topic, payload) => {

  console.log();
  console.log("<<<< MENSAGEM RECEBIDA >>>>");

  console.log(`Tópico: ${topic}`);

  const texto =
    payload.toString();

  try {

    const json =
      JSON.parse(texto);

    console.log(
      JSON.stringify(
        json,
        null,
        2
      )
    );

  } catch {

    console.log(
      `Payload: ${texto}`
    );
  }
});

client.on("error", (error) => {

  console.error(
    "Erro MQTT:",
    error.message
  );
});

client.on("close", () => {

  console.log(
    "Conexão MQTT encerrada."
  );
});

const rl =
  readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

rl.on("line", (entrada) => {

  const comando =
    entrada
      .trim()
      .toLowerCase();

  if (comando === "on") {

    enviarComando(true);

  } else if (comando === "off") {

    enviarComando(false);

  } else if (comando === "bad") {

    client.publish(
      TOPIC_COMMAND,
      "isso nao e json",
      {
        qos: 1
      },
      (error) => {

        if (error) {

          console.error(
            "Erro ao enviar:",
            error.message
          );

          return;
        }

        console.log(
          "JSON inválido enviado."
        );
      }
    );

  } else {

    console.log(
      "Comando desconhecido. Use: on, off ou bad"
    );
  }
});

function enviarComando(estado) {

  const comando = {

    action: "set",

    target: "bomba",

    value: estado,

    requestId:
      `cmd-${Date.now()}`
  };

  const payload =
    JSON.stringify(comando);

  client.publish(
    TOPIC_COMMAND,
    payload,
    {
      qos: 1
    },
    (error) => {

      if (error) {

        console.error(
          "Erro ao publicar comando:",
          error.message
        );

        return;
      }

      console.log();
      console.log(
        ">>>> COMANDO ENVIADO >>>>"
      );

      console.log(
        JSON.stringify(
          comando,
          null,
          2
        )
      );
    }
  );
}
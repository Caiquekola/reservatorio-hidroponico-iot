#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>

// ======================================================
// CONFIGURACAO DO WI-FI
// ======================================================

const char* ssid = "M55 de Caiquekola";
const char* senha = "12345678";

// ======================================================
// CONFIGURACAO MQTT
// ======================================================

const char* MQTT_HOST = "10.90.50.240";
const int MQTT_PORT = 1883;

const char* MQTT_USERNAME = "USUARIO";
const char* MQTT_PASSWORD = "SENHA";


// Identificador unico do dispositivo
const char* DEVICE_ID = "irrigacao01";


// ======================================================
// TOPICOS MQTT
// ======================================================

const char* TOPIC_TELEMETRY =
  "irrigacao01/telemetry";

const char* TOPIC_COMMAND =
  "irrigacao01/command";

const char* TOPIC_STATE =
  "irrigacao01/state";

const char* TOPIC_AVAILABILITY =
  "irrigacao01/availability";


// ======================================================
// PINOS
// ======================================================

#define LED_VERDE 25
#define LED_VERMELHO 33

const int txPin = 4;   // TX do sensor = ECHO
const int rxPin = 21;  // RX do sensor = TRIG


// ======================================================
// CLIENTES DE REDE E MQTT
// ======================================================

WiFiClient networkClient;
PubSubClient mqttClient(networkClient);


// ======================================================
// INTERVALOS
// ======================================================

const unsigned long WIFI_RETRY_MS = 10000;
const unsigned long MQTT_RETRY_MS = 5000;
const unsigned long TELEMETRY_INTERVAL_MS = 5000;
const unsigned long SENSOR_INTERVAL_MS = 1000;


// ======================================================
// CONTROLE DE TEMPO
// ======================================================

unsigned long ultimaTentativaWiFi = 0;
unsigned long ultimaTentativaMqtt = 0;
unsigned long ultimaTelemetria = 0;
unsigned long ultimaLeituraSensor = 0;


// ======================================================
// DADOS DO SENSOR
// ======================================================

float distanciaAtual = 0.0;
bool leituraValida = false;

unsigned long sequenceNumber = 0;


// ======================================================
// ESTADO DO ATUADOR
// ======================================================

// LED verde representa a futura bomba
bool bombaLigada = false;


// ======================================================
// STATUS DO WI-FI
// ======================================================

const char* obterStatusWiFi() {

  switch (WiFi.status()) {

    case WL_CONNECTED:
      return "CONECTADO";

    case WL_NO_SSID_AVAIL:
      return "REDE NAO ENCONTRADA";

    case WL_CONNECT_FAILED:
      return "FALHA NA CONEXAO";

    case WL_CONNECTION_LOST:
      return "CONEXAO PERDIDA";

    case WL_DISCONNECTED:
      return "DESCONECTADO";

    case WL_IDLE_STATUS:
      return "AGUARDANDO";

    default:
      return "STATUS DESCONHECIDO";
  }
}


// ======================================================
// MOSTRA DADOS DA REDE
// ======================================================

void mostrarDadosRede() {

  Serial.println();
  Serial.println("========== REDE ==========");

  Serial.print("Status: ");
  Serial.println(obterStatusWiFi());

  if (WiFi.status() == WL_CONNECTED) {

    Serial.print("IP: ");
    Serial.println(WiFi.localIP());

    Serial.print("Gateway: ");
    Serial.println(WiFi.gatewayIP());

    Serial.print("RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  }

  Serial.println("==========================");
}


// ======================================================
// CONEXAO WI-FI
// ======================================================

void conectarWiFi() {

  Serial.println();
  Serial.print("Conectando ao Wi-Fi: ");
  Serial.println(ssid);

  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid, senha);

  ultimaTentativaWiFi = millis();
}


// ======================================================
// MANTEM WI-FI
// ======================================================

void verificarWiFi() {

  if (WiFi.status() == WL_CONNECTED) {
    return;
  }

  unsigned long agora = millis();

  if (agora - ultimaTentativaWiFi >= WIFI_RETRY_MS) {

    ultimaTentativaWiFi = agora;

    Serial.println();
    Serial.println("Wi-Fi desconectado.");
    Serial.println("Tentando reconectar...");

    WiFi.disconnect();
    WiFi.begin(ssid, senha);
  }
}


// ======================================================
// PUBLICA ESTADO DO ATUADOR
// ======================================================

void publicarEstadoAtuador(
  bool estado,
  const char* requestId
) {

  if (!mqttClient.connected()) {
    return;
  }

  JsonDocument resposta;

  resposta["deviceId"] = DEVICE_ID;

  // Apesar de fisicamente ser LED,
  // ele representa a bomba do projeto.
  resposta["actuator"] = "bomba_simulada";

  resposta["state"] = estado;
  resposta["requestId"] = requestId;

  char payload[256];

  size_t tamanho =
    serializeJson(resposta, payload, sizeof(payload));

  bool publicado = mqttClient.publish(
    TOPIC_STATE,
    reinterpret_cast<const uint8_t*>(payload),
    tamanho,
    true
  );

  Serial.print("Estado publicado: ");
  Serial.print(payload);

  Serial.println(
    publicado ? " [OK]" : " [FALHOU]"
  );
}


// ======================================================
// PROCESSA COMANDO MQTT
// ======================================================

void onMqttMessage(
  char* topic,
  byte* payload,
  unsigned int length
) {

  Serial.println();
  Serial.println(">>> COMANDO MQTT RECEBIDO <<<");

  Serial.print("Topico: ");
  Serial.println(topic);


  // ----------------------------------------------------
  // INTERPRETA JSON
  // ----------------------------------------------------

  JsonDocument comando;

  DeserializationError erro =
    deserializeJson(
      comando,
      payload,
      length
    );

  if (erro) {

    Serial.print("JSON invalido: ");
    Serial.println(erro.c_str());

    return;
  }


  // ----------------------------------------------------
  // CAMPOS DO COMANDO
  // ----------------------------------------------------

  const char* action =
    comando["action"] | "";

  const char* target =
    comando["target"] | "";

  const char* requestId =
    comando["requestId"] | "sem-id";


  // ----------------------------------------------------
  // VALIDA ACAO
  // ----------------------------------------------------

  if (strcmp(action, "set") != 0) {

    Serial.println(
      "Comando rejeitado: action invalida."
    );

    return;
  }


  // ----------------------------------------------------
  // VALIDA ALVO
  // ----------------------------------------------------

  if (strcmp(target, "bomba") != 0) {

    Serial.println(
      "Comando rejeitado: target invalido."
    );

    return;
  }


  // ----------------------------------------------------
  // PEGA NOVO ESTADO
  // ----------------------------------------------------

  bool novoEstado =
    comando["value"] | false;


  // ----------------------------------------------------
  // ACIONA ATUADOR
  // ----------------------------------------------------

  bombaLigada = novoEstado;

  digitalWrite(
    LED_VERDE,
    bombaLigada ? HIGH : LOW
  );


  // LED vermelho indica bomba desligada
  digitalWrite(
    LED_VERMELHO,
    bombaLigada ? LOW : HIGH
  );


  Serial.print("Bomba simulada: ");

  Serial.println(
    bombaLigada ? "LIGADA" : "DESLIGADA"
  );


  // ----------------------------------------------------
  // CONFIRMA ESTADO
  // ----------------------------------------------------

  publicarEstadoAtuador(
    bombaLigada,
    requestId
  );
}


// ======================================================
// CONEXAO MQTT
// ======================================================

void conectarMqtt() {

  // Precisa ter Wi-Fi primeiro
  if (WiFi.status() != WL_CONNECTED) {
    return;
  }

  // Ja conectado
  if (mqttClient.connected()) {
    return;
  }

  unsigned long agora = millis();

  if (
    agora - ultimaTentativaMqtt
    < MQTT_RETRY_MS
  ) {
    return;
  }

  ultimaTentativaMqtt = agora;


  Serial.println();
  Serial.print("Conectando ao MQTT...");


  // ----------------------------------------------------
  // LAST WILL
  // ----------------------------------------------------

  bool conectado = mqttClient.connect(
    DEVICE_ID,
    MQTT_USERNAME,
    MQTT_PASSWORD,

    TOPIC_AVAILABILITY,

    1,       // QoS do Last Will
    true,    // retained

    "offline"
  );


  if (conectado) {

    Serial.println(" conectado!");

    // ----------------------------------------------
    // INFORMA QUE ESTA ONLINE
    // ----------------------------------------------

    mqttClient.publish(
      TOPIC_AVAILABILITY,
      "online",
      true
    );


    // ----------------------------------------------
    // ASSINA TOPICO DE COMANDO
    // ----------------------------------------------

    bool assinatura =
      mqttClient.subscribe(
        TOPIC_COMMAND,
        1
      );

    if (assinatura) {

      Serial.print(
        "Assinado: "
      );

      Serial.println(
        TOPIC_COMMAND
      );

    } else {

      Serial.println(
        "Falha na assinatura MQTT."
      );
    }


    // ----------------------------------------------
    // PUBLICA ESTADO INICIAL
    // ----------------------------------------------

    publicarEstadoAtuador(
      bombaLigada,
      "startup"
    );


  } else {

    Serial.print(
      " falhou. mqttClient.state() = "
    );

    Serial.println(
      mqttClient.state()
    );
  }
}


// ======================================================
// LEITURA DO SENSOR
// ======================================================

void lerSensor() {

  unsigned long agora = millis();

  if (
    agora - ultimaLeituraSensor
    < SENSOR_INTERVAL_MS
  ) {
    return;
  }

  ultimaLeituraSensor = agora;


  // ----------------------------------------------------
  // TRIGGER
  // ----------------------------------------------------

  digitalWrite(rxPin, LOW);
  delayMicroseconds(5);

  digitalWrite(rxPin, HIGH);
  delayMicroseconds(100);

  digitalWrite(rxPin, LOW);


  // ----------------------------------------------------
  // ECHO
  // ----------------------------------------------------

  unsigned long duracao =
    pulseIn(txPin, HIGH, 60000);


  if (duracao == 0) {

    leituraValida = false;

    Serial.println(
      "Sensor: sem leitura"
    );

    return;
  }


  float distancia =
    duracao * 0.0343 / 2.0;


  // Seu sensor vinha retornando ~900 cm.
  // Isso deve ser tratado como leitura invalida.
  if (
    distancia < 20 ||
    distancia > 600
  ) {

    leituraValida = false;

    Serial.print(
      "Leitura invalida: "
    );

    Serial.print(
      distancia,
      1
    );

    Serial.println(
      " cm"
    );

    return;
  }


  // ----------------------------------------------------
  // LEITURA VALIDA
  // ----------------------------------------------------

  distanciaAtual = distancia;
  leituraValida = true;

  Serial.print("Distancia: ");
  Serial.print(distanciaAtual, 1);
  Serial.println(" cm");
}


// ======================================================
// PUBLICA TELEMETRIA
// ======================================================

void publicarTelemetria() {

  if (!mqttClient.connected()) {
    return;
  }

  unsigned long agora = millis();

  if (
    agora - ultimaTelemetria
    < TELEMETRY_INTERVAL_MS
  ) {
    return;
  }

  ultimaTelemetria = agora;


  // ----------------------------------------------------
  // MONTA JSON
  // ----------------------------------------------------

  JsonDocument telemetria;

  telemetria["deviceId"] =
    DEVICE_ID;

  telemetria["sensor"] =
    "ultrassonico";

  telemetria["valid"] =
    leituraValida;


  // Só envia distância como valor válido
  // quando o sensor estiver dentro da faixa.
  if (leituraValida) {

    telemetria["value"] =
      distanciaAtual;

    telemetria["unit"] =
      "cm";

  } else {

    telemetria["value"] =
      nullptr;

    telemetria["unit"] =
      "cm";
  }


  telemetria["sequence"] =
    sequenceNumber++;

  telemetria["uptimeMs"] =
    agora;

  telemetria["wifiRssi"] =
    WiFi.RSSI();

  telemetria["actuatorState"] =
    bombaLigada;


  // ----------------------------------------------------
  // SERIALIZA JSON
  // ----------------------------------------------------

  char payload[384];

  size_t tamanho =
    serializeJson(
      telemetria,
      payload,
      sizeof(payload)
    );


  // ----------------------------------------------------
  // PUBLICA
  // ----------------------------------------------------

  bool publicado =
    mqttClient.publish(
      TOPIC_TELEMETRY,
      reinterpret_cast<const uint8_t*>(payload),
      tamanho,
      false
    );


  Serial.print("Telemetria MQTT: ");
  Serial.print(payload);

  Serial.println(
    publicado
      ? " [ENVIADA]"
      : " [FALHOU]"
  );
}


// ======================================================
// SETUP
// ======================================================

void setup() {

  Serial.begin(115200);

  delay(1000);


  Serial.println();
  Serial.println(
    "======================================"
  );

  Serial.println(
    " PROJETO IoT - MQTT"
  );

  Serial.println(
    " MONITORAMENTO + IRRIGACAO SIMULADA"
  );

  Serial.println(
    "======================================"
  );


  // ----------------------------------------------------
  // SENSOR
  // ----------------------------------------------------

  pinMode(
    rxPin,
    OUTPUT
  );

  pinMode(
    txPin,
    INPUT
  );

  digitalWrite(
    rxPin,
    LOW
  );


  // ----------------------------------------------------
  // LEDs
  // ----------------------------------------------------

  pinMode(
    LED_VERDE,
    OUTPUT
  );

  pinMode(
    LED_VERMELHO,
    OUTPUT
  );


  // Inicialmente:
  // bomba simulada desligada

  digitalWrite(
    LED_VERDE,
    LOW
  );

  digitalWrite(
    LED_VERMELHO,
    HIGH
  );


  // ----------------------------------------------------
  // MQTT
  // ----------------------------------------------------

  mqttClient.setServer(
    MQTT_HOST,
    MQTT_PORT
  );

  mqttClient.setCallback(
    onMqttMessage
  );

  mqttClient.setBufferSize(
    512
  );


  // ----------------------------------------------------
  // WI-FI
  // ----------------------------------------------------

  conectarWiFi();
}


// ======================================================
// LOOP
// ======================================================

void loop() {

  // Mantem Wi-Fi
  verificarWiFi();


  // Conecta/reconecta MQTT
  conectarMqtt();


  // MQTT precisa executar loop frequentemente
  if (mqttClient.connected()) {

    mqttClient.loop();
  }


  // Le sensor
  lerSensor();


  // Publica telemetria
  publicarTelemetria();


  // Pequena pausa apenas para estabilidade
  delay(10);
}
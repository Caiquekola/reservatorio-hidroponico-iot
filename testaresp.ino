#include <WiFi.h>

// ======================================================
// CONFIGURAÇÃO DO WI-FI
// ======================================================

const char* ssid = "M55 de Caiquekola";
const char* senha = "12345678";

// Tenta reconectar a cada 10 segundos
const unsigned long INTERVALO_RECONEXAO = 10000;

// Mostra diagnóstico da rede a cada 10 segundos
const unsigned long INTERVALO_DIAGNOSTICO = 10000;

unsigned long ultimaTentativaReconexao = 0;
unsigned long ultimoDiagnostico = 0;


// ======================================================
// PINOS DO PROJETO
// ======================================================

#define LED_VERDE 25
#define LED_VERMELHO 33

const int txPin = 4;   // TX do sensor = ECHO
const int rxPin = 21;  // RX do sensor = TRIG


// ======================================================
// CONVERTE STATUS DO WI-FI PARA TEXTO
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
  Serial.println("========== DIAGNOSTICO DA REDE ==========");

  Serial.print("Status: ");
  Serial.println(obterStatusWiFi());

  if (WiFi.status() == WL_CONNECTED) {

    Serial.print("SSID: ");
    Serial.println(WiFi.SSID());

    Serial.print("Endereco IP: ");
    Serial.println(WiFi.localIP());

    Serial.print("Gateway: ");
    Serial.println(WiFi.gatewayIP());

    Serial.print("Mascara: ");
    Serial.println(WiFi.subnetMask());

    Serial.print("RSSI: ");
    Serial.print(WiFi.RSSI());
    Serial.println(" dBm");
  }

  Serial.println("==========================================");
}


// ======================================================
// CONEXÃO INICIAL AO WI-FI
// ======================================================

void conectarWiFi() {

  Serial.println();
  Serial.println("Iniciando conexao Wi-Fi...");

  WiFi.mode(WIFI_STA);

  Serial.print("Rede: ");
  Serial.println(ssid);

  WiFi.begin(ssid, senha);

  unsigned long inicioTentativa = millis();

  // Aguarda no máximo 15 segundos
  while (
    WiFi.status() != WL_CONNECTED && millis() - inicioTentativa < 15000) {

    Serial.print(".");
    delay(500);
  }

  Serial.println();

  if (WiFi.status() == WL_CONNECTED) {

    Serial.println("Wi-Fi conectado com sucesso!");

    mostrarDadosRede();

  } else {

    Serial.println("Nao foi possivel conectar ao Wi-Fi.");
    Serial.println("O ESP32 continuara tentando automaticamente.");
  }
}


// ======================================================
// VERIFICA A CONEXÃO E TENTA RECONECTAR
// ======================================================

void verificarWiFi() {

  // Se estiver conectado
  if (WiFi.status() == WL_CONNECTED) {

    // Mostra diagnóstico periodicamente
    if (
      millis() - ultimoDiagnostico
      >= INTERVALO_DIAGNOSTICO) {

      ultimoDiagnostico = millis();

      mostrarDadosRede();
    }

    return;
  }


  // ====================================================
  // WI-FI DESCONECTADO
  // ====================================================

  if (
    millis() - ultimaTentativaReconexao
    >= INTERVALO_RECONEXAO) {

    ultimaTentativaReconexao = millis();

    Serial.println();
    Serial.println("!!! WI-FI DESCONECTADO !!!");

    Serial.print("Status: ");
    Serial.println(obterStatusWiFi());

    Serial.println("Tentando reconectar...");

    WiFi.disconnect();

    delay(100);

    WiFi.begin(ssid, senha);
  }
}


// ======================================================
// SETUP
// ======================================================

void setup() {

  Serial.begin(115200);

  delay(1000);

  Serial.println();
  Serial.println("========================================");
  Serial.println(" PROJETO IoT - ESP32");
  Serial.println(" SENSOR SR04M-2 + WI-FI");
  Serial.println("========================================");


  // ----------------------------------------------------
  // SENSOR
  // ----------------------------------------------------

  pinMode(rxPin, OUTPUT);
  pinMode(txPin, INPUT);

  digitalWrite(rxPin, LOW);


  // ----------------------------------------------------
  // LEDs
  // ----------------------------------------------------

  pinMode(LED_VERDE, OUTPUT);
  pinMode(LED_VERMELHO, OUTPUT);

  digitalWrite(LED_VERDE, LOW);
  digitalWrite(LED_VERMELHO, LOW);


  // ----------------------------------------------------
  // WI-FI
  // ----------------------------------------------------

  conectarWiFi();


  Serial.println();
  Serial.println("Iniciando teste SR04M-2...");
}


// ======================================================
// LOOP
// ======================================================

void loop() {

  // ====================================================
  // VERIFICA WI-FI
  // ====================================================

  verificarWiFi();


  // ====================================================
  // SENSOR ULTRASSÔNICO
  // ENVIA TRIGGER PARA RX
  // ====================================================

  digitalWrite(rxPin, LOW);

  delayMicroseconds(5);

  digitalWrite(rxPin, HIGH);

  delayMicroseconds(100);

  digitalWrite(rxPin, LOW);


  // ====================================================
  // RECEBE ECHO PELO TX
  // ====================================================

  unsigned long duracao =
    pulseIn(txPin, HIGH, 60000);


  // ====================================================
  // PROCESSA A LEITURA
  // ====================================================

  if (duracao == 0) {

    Serial.println("Sensor: Sem leitura");

    digitalWrite(LED_VERDE, LOW);
    digitalWrite(LED_VERMELHO, HIGH);

  } else {

    float distancia =
      duracao * 0.0343 / 2.0;


    if (distancia < 20 || distancia > 600) {
      Serial.print("Leitura invalida: ");
      Serial.print(distancia, 1);
      Serial.println(" cm");
    } else {
      Serial.print("Distancia: ");
      Serial.print(distancia, 1);
      Serial.println(" cm");
    }
  }


  delay(1000);
}
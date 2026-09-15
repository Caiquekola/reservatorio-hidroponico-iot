# reservatorio-hidroponico-iot
Reservatório Hidropônico utilizando IOT

ArduinoIDE:
ESP32
PubSubClient
ArduinoJson

Arquitetura atual:
SR04M-2
   ↓
 ESP32
   │
   │ Wi-Fi / MQTT
   ▼
Broker MQTT
   ▲
   │
MQTT Explorer
   │
   └──── comando remoto ────→ ESP32 ────→ LED


telemetry     ESP32 → broker      dados do sensor
command       broker → ESP32      comando remoto
state         ESP32 → broker      confirmação do atuador
availability  ESP32/broker        online/offline
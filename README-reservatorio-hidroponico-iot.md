# Reservatório Hidropônico IoT

Sistema IoT para **monitoramento do nível de um reservatório hidropônico** e **controle remoto de uma bomba d'água**, desenvolvido como projeto integrador da disciplina Internet das Coisas III.

> Nome sugerido para o repositório: `reservatorio-hidroponico-iot`

## Visão geral

O projeto utiliza um ESP32 para ler o nível da água do reservatório e publicar telemetria por MQTT. O sistema também recebe comandos remotos para ligar ou desligar uma bomba d'água — ou um LED, durante a fase de simulação.

Os dados são processados por um gateway em Node.js, armazenados no Redis e disponibilizados por uma API HTTP/JSON. Uma interface web permite acompanhar o nível, consultar o histórico, verificar a disponibilidade do dispositivo e controlar o atuador.

## Problema

Em sistemas hidropônicos, a falta de solução nutritiva no reservatório pode interromper a circulação e prejudicar as plantas. A verificação manual também pode ser repetitiva e sujeita a atrasos.

## Objetivo

Desenvolver uma solução IoT capaz de:

- monitorar o nível da água do reservatório;
- enviar telemetria periodicamente;
- armazenar o estado atual e o histórico;
- indicar se o dispositivo está online ou offline;
- permitir o controle remoto da bomba;
- confirmar a execução dos comandos;
- tratar falhas básicas de conexão.

## Arquitetura

```text
Sensor de nível
      ↓
    ESP32
      ↓ Wi-Fi / MQTT
 Broker MQTT
      ↓
Gateway Node.js
      ↓
    Redis
      ↓
API Node.js / Express
      ↓
 Sistema Web
      ↓
    Usuário
```

### Fluxo de telemetria

```text
Sensor → ESP32 → Broker MQTT → Gateway → Redis → API → Sistema Web
```

### Fluxo de comando

```text
Sistema Web → API → Gateway → Broker MQTT → ESP32 → Bomba
```

### Fluxo de confirmação

```text
ESP32 → Broker MQTT → Gateway → Redis → API → Sistema Web
```

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Dispositivo | ESP32 |
| Programação embarcada | Arduino Framework |
| Conectividade | Wi-Fi |
| Mensageria | MQTT |
| Formato das mensagens | JSON |
| Gateway | Node.js |
| Persistência | Redis |
| API | Node.js + Express |
| Frontend | HTML, CSS e JavaScript |
| Versionamento | Git e GitHub |

## Hardware previsto

- 1 ESP32;
- 1 sensor de nível;
- 1 bomba d'água de baixa tensão ou LED para simulação;
- 1 módulo relé ou driver adequado, caso seja usada uma bomba real;
- protoboard e cabos;
- fonte de alimentação compatível.

> Durante o desenvolvimento inicial, recomenda-se usar um LED para simular a bomba. A ligação de uma bomba real deve utilizar acionamento e alimentação adequados, sem conectar a carga diretamente ao ESP32.

## Funcionalidades planejadas

- [ ] conexão do ESP32 ao Wi-Fi;
- [ ] reconexão automática ao Wi-Fi;
- [ ] conexão ao broker MQTT;
- [ ] publicação periódica do nível;
- [ ] recepção de comandos MQTT;
- [ ] acionamento da bomba ou LED;
- [ ] confirmação da execução do comando;
- [ ] gateway Node.js para validação das mensagens;
- [ ] persistência de estado atual no Redis;
- [ ] persistência do histórico;
- [ ] registro de presença e último contato;
- [ ] API HTTP/JSON;
- [ ] painel web;
- [ ] indicador online/offline;
- [ ] autenticação básica;
- [ ] testes de integração e ponta a ponta.

## Tópicos MQTT

```text
hidroponia/reservatorio01/telemetria
hidroponia/reservatorio01/status
hidroponia/reservatorio01/comando
hidroponia/reservatorio01/confirmacao
```

### Telemetria

Tópico:

```text
hidroponia/reservatorio01/telemetria
```

Exemplo de mensagem:

```json
{
  "deviceId": "reservatorio01",
  "nivelPercentual": 68,
  "bombaLigada": false,
  "timestamp": "2026-08-05T18:30:00Z"
}
```

### Comando

Tópico:

```text
hidroponia/reservatorio01/comando
```

Exemplo:

```json
{
  "commandId": "cmd-1042",
  "acao": "ligar_bomba"
}
```

Valores previstos para `acao`:

```text
ligar_bomba
desligar_bomba
```

### Confirmação

Tópico:

```text
hidroponia/reservatorio01/confirmacao
```

Exemplo:

```json
{
  "deviceId": "reservatorio01",
  "commandId": "cmd-1042",
  "executado": true,
  "bombaLigada": true,
  "timestamp": "2026-08-05T18:31:00Z"
}
```

### Status e presença

Tópico:

```text
hidroponia/reservatorio01/status
```

Exemplo:

```json
{
  "deviceId": "reservatorio01",
  "status": "online",
  "timestamp": "2026-08-05T18:30:00Z"
}
```

## Modelo inicial no Redis

Sugestão de chaves:

```text
device:reservatorio01:state
device:reservatorio01:history
device:reservatorio01:presence
device:reservatorio01:commands
```

### Estado atual

```text
device:reservatorio01:state
```

Armazena a leitura mais recente, o estado da bomba e o horário da atualização.

### Histórico

```text
device:reservatorio01:history
```

Armazena as leituras anteriores para consultas e geração de gráfico.

### Presença

```text
device:reservatorio01:presence
```

Armazena o status do dispositivo e o último contato recebido.

## Endpoints planejados

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/api/devices/reservatorio01/state` | Retorna o estado atual |
| GET | `/api/devices/reservatorio01/history` | Retorna o histórico |
| GET | `/api/devices/reservatorio01/presence` | Retorna presença e último contato |
| POST | `/api/devices/reservatorio01/commands` | Envia comando para a bomba |

### Exemplo de envio de comando

```http
POST /api/devices/reservatorio01/commands
Content-Type: application/json
```

```json
{
  "acao": "ligar_bomba"
}
```

## Estrutura do repositório

```text
reservatorio-hidroponico-iot/
├── esp32/
│   └── reservatorio_iot/
├── gateway/
│   ├── src/
│   ├── package.json
│   └── .env.example
├── web/
│   ├── index.html
│   ├── css/
│   └── js/
├── docs/
│   ├── diagrama-arquitetura.png
│   ├── topicos-mqtt.md
│   └── plano-de-testes.md
├── .gitignore
├── .env.example
└── README.md
```

## Variáveis de ambiente

Crie um arquivo `.env` a partir do `.env.example`.

```env
MQTT_URL=mqtt://localhost:1883
MQTT_USERNAME=
MQTT_PASSWORD=
REDIS_URL=redis://localhost:6379
PORT=3000
DEVICE_ID=reservatorio01
```

> O arquivo `.env` não deve ser enviado ao GitHub.

## Execução prevista

### 1. Broker MQTT

Inicie ou configure o broker definido para o projeto.

### 2. Redis

Inicie uma instância local ou remota do Redis.

### 3. Gateway e API

```bash
cd gateway
npm install
npm run dev
```

### 4. ESP32

1. Abra o projeto na Arduino IDE ou no PlatformIO.
2. Configure as credenciais de Wi-Fi e MQTT.
3. Selecione a placa ESP32.
4. Compile e envie o firmware.
5. Abra o monitor serial para acompanhar a conexão.

### 5. Sistema web

Abra a aplicação web pelo servidor configurado no backend ou por um servidor local.

## Etapas de desenvolvimento

### Etapa 1 — ESP32, Wi-Fi e MQTT

- definir o sensor e o atuador;
- conectar o ESP32 ao Wi-Fi;
- implementar reconexão;
- publicar telemetria;
- receber comandos;
- acionar a bomba ou LED.

### Etapa 2 — Gateway e Redis

- conectar o Node.js ao broker;
- assinar os tópicos;
- validar mensagens JSON;
- identificar o dispositivo;
- armazenar estado, histórico e presença;
- enviar comandos;
- processar confirmações.

### Etapa 3 — API, web e testes

- criar endpoints HTTP/JSON;
- exibir nível atual;
- exibir histórico;
- mostrar online/offline;
- controlar a bomba;
- tratar erros;
- executar testes ponta a ponta;
- finalizar a documentação.

## Plano inicial de testes

| Teste | Resultado esperado |
|---|---|
| ESP32 conecta ao Wi-Fi | Endereço IP exibido no monitor serial |
| Wi-Fi é interrompido | ESP32 tenta reconectar automaticamente |
| Telemetria é publicada | Mensagem JSON recebida no tópico correto |
| JSON inválido é enviado | Gateway rejeita e registra o erro |
| Comando de ligar é enviado | Atuador liga |
| Comando de desligar é enviado | Atuador desliga |
| Comando é executado | Confirmação contém o mesmo `commandId` |
| Telemetria é recebida | Estado atual é atualizado no Redis |
| Novas leituras chegam | Histórico mantém registros anteriores |
| Dispositivo para de comunicar | Interface mostra status offline |
| API é consultada | Resposta HTTP contém dados válidos |
| Redis fica indisponível | Gateway registra e trata a falha |

## Segurança

- não armazenar credenciais diretamente no código;
- utilizar `.env` e `.env.example`;
- validar todas as mensagens recebidas;
- limitar os valores aceitos nos comandos;
- proteger as rotas de controle;
- não publicar senhas ou tokens no GitHub;
- utilizar autenticação no broker quando disponível.

## Limitações iniciais

- apenas um reservatório;
- apenas um sensor principal;
- controle simples de ligar e desligar;
- frontend sem recursos avançados;
- automação baseada inicialmente em regras simples;
- calibração do nível dependente do sensor escolhido.

## Trabalhos futuros

- suporte a vários reservatórios;
- gráfico em tempo real com WebSocket ou SSE;
- alertas de nível crítico;
- modo automático para acionamento da bomba;
- configuração de limites pelo painel;
- notificações por e-mail ou aplicativo;
- registro de consumo e tempo de funcionamento da bomba;
- inclusão de sensores de pH e condutividade elétrica.

## Autor

**Nome:** preencher  
**Curso/Turma:** preencher  
**Disciplina:** Internet das Coisas III  
**Instituição:** preencher  
**Professor:** preencher  

## Licença

Este projeto poderá utilizar a licença MIT. Adicione o arquivo `LICENSE` ao repositório antes da publicação.

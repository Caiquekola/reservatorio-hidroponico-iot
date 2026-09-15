# Documentação do broker MQTT em Node.js

Este código cria um broker MQTT usando a biblioteca `Aedes`, que é um servidor MQTT leve e fácil de usar em Node.js. Ele escuta conexões na porta `1883` e registra eventos de clientes, inscrições e mensagens publicadas.

## 1) Importações

```js
import { Aedes } from 'aedes';
import net from 'node:net';
```

### O que cada import faz:
- `Aedes`: classe principal do broker MQTT.
- `net`: módulo nativo do Node.js usado para criar um servidor TCP/Socket, que aceita conexões MQTT.

> O protocolo MQTT utiliza TCP como transporte, por isso o broker precisa de um socket para receber conexões dos clientes.

---

## 2) Porta do broker

```js
const PORT = 1883;
```

- `1883` é a porta padrão usada por servidores MQTT sem TLS.
- É a porta em que o broker fica ouvindo para receber conexões de dispositivos e clientes.

---

## 3) Criação do broker

```js
const aedes = await Aedes.createBroker();
```

### O que isso faz:
- Cria uma instância do broker MQTT.
- Esse objeto é responsável por:
  - aceitar conexões de clientes,
  - autenticar e autorizar clientes,
  - receber mensagens publicadas,
  - encaminhar mensagens para os tópicos corretos,
  - controlar as assinaturas dos clientes.

A palavra-chave `await` indica que a criação do broker é assíncrona, então o código espera até que ele esteja pronto antes de continuar.

---

## 4) Criação do servidor TCP

```js
const server = net.createServer(aedes.handle);
```

### Explicação:
- `net.createServer()` cria um servidor TCP.
- `aedes.handle` é a função do broker que trata cada nova conexão MQTT.

Ou seja, todo cliente que se conectar ao servidor vai ser passado para o Aedes, que interpreta o protocolo MQTT e trata a comunicação corretamente.

---

## 5) Inicialização do servidor

```js
server.listen(PORT, "0.0.0.0", () => {
  console.log("=================================");
  console.log(" Broker MQTT iniciado");
  console.log(` Porta: ${PORT}`);
  console.log("=================================");
});
```

### O que acontece:
- O servidor começa a escutar na porta `1883`.
- `"0.0.0.0"` significa que ele aceita conexões vindas de qualquer endereço IP acessível na máquina.
- Quando a porta está pronta, o callback imprime uma mensagem no console.

---

## 6) Evento de cliente conectado

```js
aedes.on("client", (client) => {
  console.log(`Cliente conectado: ${client?.id}`);
});
```

### Explicação:
- Sempre que um cliente MQTT se conecta ao broker, esse evento dispara.
- `client.id` é o identificador do cliente.
- `?.id` é o operador opcional chaining, que evita erro caso o cliente não exista ou não tenha ID.

---

## 7) Evento de cliente desconectado

```js
aedes.on("clientDisconnect", (client) => {
  console.log(`Cliente desconectado: ${client?.id}`);
});
```

### Explicação:
- Quando um cliente fecha a conexão ou cai, esse evento é disparado.
- O broker registra a saída do cliente no console.

---

## 8) Evento de inscrição em tópico

```js
aedes.on("subscribe", (subscriptions, client) => {
  console.log(`Cliente ${client?.id} assinou:`);

  subscriptions.forEach((subscription) => {
    console.log(`  ${subscription.topic}`);
  });
});
```

### Explicação:
- Quando um cliente faz `subscribe` em um ou mais tópicos, esse evento dispara.
- `subscriptions` é uma lista de tópicos aos quais o cliente se inscreveu.
- `subscription.topic` mostra o nome do tópico.

### Exemplo:
```js
client.subscribe('sensor/temperatura')
```

### Saída esperada:
```text
Cliente esp32-01 assinou:
  sensor/temperatura
```

---

## 9) Evento de mensagem recebida

```js
aedes.on("publish", (packet, client) => {
  if (!client) {
    return;
  }

  console.log();
  console.log("Mensagem recebida:");
  console.log(`Cliente: ${client.id}`);
  console.log(`Topico: ${packet.topic}`);
  console.log(`Payload: ${packet.payload.toString()}`);
});
```

### Explicação:
- Quando qualquer cliente publica uma mensagem, esse evento é acionado.
- `packet` contém os dados da mensagem.
- `packet.topic`: nome do tópico.
- `packet.payload`: conteúdo em bytes.
- `packet.payload.toString()` converte o payload para texto.

### Exemplo de mensagem:
- Tópico: `reservatorio/temperatura`
- Payload: `26.5`

### Saída esperada:
```text
Mensagem recebida:
Cliente: esp32-01
Topico: reservatorio/temperatura
Payload: 26.5
```

---

## Fluxo geral do código

1. O broker MQTT é criado.
2. O servidor TCP é montado em cima do broker.
3. O servidor fica ouvindo na porta `1883`.
4. Quando um cliente conecta, o evento `client` dispara.
5. Quando o cliente se inscreve em um tópico, o evento `subscribe` dispara.
6. Quando o cliente publica uma mensagem, o evento `publish` dispara.
7. O broker registra essas informações no console.

---

## Exemplo prático de uso

Um ESP32 pode publicar no tópico:

```js
reservatorio/temperatura
```

com o valor:

```js
26.5
```

O broker recebe e imprime:

```text
Mensagem recebida:
Cliente: esp32-01
Topico: reservatorio/temperatura
Payload: 26.5
```

Se outro cliente quiser receber essa informação, ele faz uma assinatura no mesmo tópico:

```js
subscribe('reservatorio/temperatura')
```

O broker então encaminha a mensagem para ele.

---

## Resumo

Esse código cria um broker MQTT funcional que:

- escuta conexões na porta `1883`;
- identifica clientes conectados e desconectados;
- monitora inscrições em tópicos;
- registra mensagens publicadas;
- serve como base para projetos de IoT, automação residencial e monitoramento de sensores.

Ele é ideal para aplicações como:
- sensores de temperatura e umidade;
- ESP32 e Arduino com MQTT;
- monitoramento de reservatórios;
- dashboard web em tempo real;
- automação residencial e industrial.

---

## Código completo

```js
import { Aedes } from 'aedes';
import net from 'node:net';

const PORT = 1883;
const aedes = await Aedes.createBroker();
const server = net.createServer(aedes.handle);

server.listen(PORT, "0.0.0.0", () => {
  console.log("=================================");
  console.log(" Broker MQTT iniciado");
  console.log(` Porta: ${PORT}`);
  console.log("=================================");
});

aedes.on("client", (client) => {
  console.log(`Cliente conectado: ${client?.id}`);
});

aedes.on("clientDisconnect", (client) => {
  console.log(`Cliente desconectado: ${client?.id}`);
});

aedes.on("subscribe", (subscriptions, client) => {
  console.log(`Cliente ${client?.id} assinou:`);

  subscriptions.forEach((subscription) => {
    console.log(`  ${subscription.topic}`);
  });
});

aedes.on("publish", (packet, client) => {
  if (!client) {
    return;
  }

  console.log();
  console.log("Mensagem recebida:");
  console.log(`Cliente: ${client.id}`);
  console.log(`Topico: ${packet.topic}`);
  console.log(`Payload: ${packet.payload.toString()}`);
});
```

Se quiser, posso transformar essa documentação em um `README.md` mais bonito e profissional para o projeto, com estrutura de título, requisitos, instalação e uso.
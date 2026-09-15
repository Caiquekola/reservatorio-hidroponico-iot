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
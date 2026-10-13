// ======================================================
// CONSULTA DOS DADOS PERSISTIDOS NO REDIS
// ------------------------------------------------------
// Uso:
//   node consulta.js                       -> lista dispositivos
//   node consulta.js irrigacao01           -> estado + presença + histórico
//   node consulta.js irrigacao01 estado
//   node consulta.js irrigacao01 historico 20
//   node consulta.js irrigacao01 periodo 10   (últimos 10 minutos)
//   node consulta.js irrigacao01 presenca
// ======================================================

import {
  KEYS,
  conectarRedis,
  fecharRedis,
  listarDispositivos,
  consultarEstado,
  consultarHistorico,
  consultarHistoricoPeriodo,
  contarHistorico,
  consultarPresenca
} from "./redis-store.js";

const [deviceId, acao = "tudo", parametro] =
  process.argv.slice(2);

const silencioso = {
  log: () => {},
  warn: () => {},
  error: (m) => console.error(m)
};

const redis = await conectarRedis({ log: silencioso });

try {

  if (!deviceId) {

    const ids = await listarDispositivos(redis);

    titulo(`DISPOSITIVOS (SMEMBERS ${KEYS.devices()})`);

    if (ids.length === 0) {
      console.log("Nenhum dispositivo registrado ainda.");
    }

    ids.forEach((id) => console.log(`- ${id}`));

  } else {

    if (acao === "estado" || acao === "tudo") {
      await mostrarEstado(deviceId);
    }

    if (acao === "presenca" || acao === "tudo") {
      await mostrarPresenca(deviceId);
    }

    if (acao === "historico" || acao === "tudo") {
      await mostrarHistorico(deviceId, Number(parametro || 10));
    }

    if (acao === "periodo") {
      await mostrarPeriodo(deviceId, Number(parametro || 10));
    }
  }

} finally {

  await fecharRedis(redis);
}


async function mostrarEstado(id) {

  titulo(`ESTADO ATUAL (HGETALL ${KEYS.state(id)})`);

  const estado = await consultarEstado(redis, id);

  console.log(
    estado
      ? JSON.stringify(estado, null, 2)
      : "Sem estado registrado."
  );
}

async function mostrarPresenca(id) {

  titulo(`PRESENÇA (HGETALL ${KEYS.presence(id)} + TTL ${KEYS.heartbeat(id)})`);

  const presenca = await consultarPresenca(redis, id);

  if (!presenca) {
    console.log("Sem registro de presença.");
    return;
  }

  console.log(JSON.stringify(presenca, null, 2));

  console.log();
  console.log(
    `=> Dispositivo ${presenca.online ? "ONLINE" : "OFFLINE"}` +
    (presenca.lastSeen ? ` | último contato: ${presenca.lastSeen}` : "")
  );
}

async function mostrarHistorico(id, limite) {

  const total = await contarHistorico(redis, id);

  titulo(
    `HISTÓRICO (ZRANGE ${KEYS.history(id)} 0 ${limite - 1} REV) — ${total} registros no total`
  );

  const leituras = await consultarHistorico(redis, id, limite);

  imprimirTabela(leituras);
}

async function mostrarPeriodo(id, minutos) {

  const fim = new Date();
  const inicio = new Date(fim.getTime() - minutos * 60_000);

  titulo(
    `HISTÓRICO DOS ÚLTIMOS ${minutos} MIN (ZRANGEBYSCORE ${KEYS.history(id)} ${inicio.getTime()} ${fim.getTime()})`
  );

  const leituras =
    await consultarHistoricoPeriodo(redis, id, inicio, fim);

  imprimirTabela(leituras);
}

function imprimirTabela(leituras) {

  if (leituras.length === 0) {
    console.log("Nenhuma leitura encontrada.");
    return;
  }

  console.table(
    leituras.map((l) => ({
      recebidoEm: l.receivedAt,
      seq: l.sequence,
      valida: l.valid,
      valor: l.value === null ? "NULL" : `${l.value} ${l.unit}`,
      rssi: l.wifiRssi,
      bomba: l.actuatorState === null ? "-" : (l.actuatorState ? "ON" : "OFF")
    }))
  );
}

function titulo(texto) {

  console.log();
  console.log("========================================");
  console.log(` ${texto}`);
  console.log("========================================");
}

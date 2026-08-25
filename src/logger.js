/**
 * Log em arquivo (tee): além do console, console.log/warn/error passam a gravar
 * em <dir>/gringo-printer.log. É esse arquivo que a opção "Ver terminal" da
 * bandeja exibe — e o único registro da sessão quando o app roda oculto
 * (tarefa agendada / exe sem janela).
 */
const fs = require("fs");
const path = require("path");
const util = require("util");

const DEFAULT_MAX_BYTES = 512 * 1024;

/**
 * Instala o tee no console. Rotação simples: se o log atual exceder maxBytes
 * na inicialização, vira .old (o anterior é descartado).
 * @returns {{file: string, stop: () => void}}
 */
function setupFileLogging({ dir, maxBytes = DEFAULT_MAX_BYTES }) {
  const file = path.join(dir, "gringo-printer.log");
  try {
    if (fs.statSync(file).size > maxBytes) {
      try {
        fs.unlinkSync(file + ".old");
      } catch {}
      fs.renameSync(file, file + ".old");
    }
  } catch {}

  const stamp = () => new Date().toLocaleString("pt-BR", { hour12: false });
  const original = { log: console.log, warn: console.warn, error: console.error };
  const wrap = (level) => {
    console[level] = (...args) => {
      original[level](...args);
      try {
        fs.appendFileSync(file, `[${stamp()}] [${level}] ${util.format(...args)}\n`);
      } catch {}
    };
  };
  ["log", "warn", "error"].forEach(wrap);

  return {
    file,
    stop() {
      ["log", "warn", "error"].forEach((level) => (console[level] = original[level]));
    },
  };
}

module.exports = { setupFileLogging };

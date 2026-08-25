/**
 * Estado local persistido (state.json):
 * - printedIds: ids já impressos nesta máquina (evita reimpressão em duplicidade)
 * - pendingIds: ids impressos no papel cujo PATCH mark-as-printed ainda falhou
 */
const fs = require("fs");
const path = require("path");
const { getDataDir } = require("./paths");

const DEFAULT_STATE_PATH = path.join(getDataDir(), "state.json");
const MAX_PRINTED_IDS = 500;

function createState(filePath = DEFAULT_STATE_PATH) {
  let state = { printedIds: [], pendingIds: [] };

  const load = () => {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      state = {
        printedIds: Array.isArray(parsed.printedIds) ? parsed.printedIds : [],
        pendingIds: Array.isArray(parsed.pendingIds) ? parsed.pendingIds : [],
      };
    } catch {
      // arquivo inexistente/corrompido: começa vazio
    }
  };

  const save = () => {
    try {
      fs.writeFileSync(filePath, JSON.stringify(state), "utf8");
    } catch (err) {
      console.error("[gringo-printer] falha ao salvar state.json:", err.message);
    }
  };

  load();

  return {
    isPrinted(id) {
      return state.printedIds.includes(id);
    },
    markPrinted(id) {
      if (!state.printedIds.includes(id)) {
        state.printedIds.push(id);
        if (state.printedIds.length > MAX_PRINTED_IDS) {
          state.printedIds.splice(0, state.printedIds.length - MAX_PRINTED_IDS);
        }
      }
      save();
    },
    addPending(id) {
      if (!state.pendingIds.includes(id)) {
        state.pendingIds.push(id);
        save();
      }
    },
    getPending() {
      return [...state.pendingIds];
    },
    clearPending(id) {
      const i = state.pendingIds.indexOf(id);
      if (i !== -1) {
        state.pendingIds.splice(i, 1);
        save();
      }
    },
  };
}

module.exports = { createState, MAX_PRINTED_IDS };

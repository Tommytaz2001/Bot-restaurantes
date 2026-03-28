// Estado global del bot — simple flag en memoria
// Si el servidor se reinicia, el bot vuelve a estar activo automáticamente.
let _activo = true;

function estaActivo() { return _activo; }
function pausarBot()  { _activo = false; console.log('[BotState] Bot PAUSADO — no responderá mensajes.'); }
function reanudarBot(){ _activo = true;  console.log('[BotState] Bot REANUDADO — respondiendo mensajes.'); }

module.exports = { estaActivo, pausarBot, reanudarBot };

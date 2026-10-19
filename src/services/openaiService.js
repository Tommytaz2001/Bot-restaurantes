const aiService = require('./aiService');

module.exports = {
  chatCompletion: aiService.chatCompletion,
  GUARDAR_PEDIDO_TOOL: aiService.GUARDAR_PEDIDO_TOOL,
  SOLICITAR_CAMBIO_TOOL: aiService.SOLICITAR_CAMBIO_TOOL,
  CANCELAR_PEDIDO_TOOL: aiService.CANCELAR_PEDIDO_TOOL,
  CONSULTAR_ESTADO_TOOL: aiService.CONSULTAR_ESTADO_TOOL,
};

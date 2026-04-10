require('dotenv').config();
const { sendWhatsAppMessage } = require('../src/whatsapp/metaSender');

// Cambia este número por tu WhatsApp personal (el que agregaste como destinatario en Meta)
const NUMERO_PRUEBA = '50577449468'; // ej: 50212345678

async function main() {
  console.log('Enviando mensaje de prueba...');
  try {
    const result = await sendWhatsAppMessage(NUMERO_PRUEBA, '✅ Prueba exitosa del bot de restaurantes 🍔');
    console.log('✓ Mensaje enviado:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('✗ Error:', err.message);
  }
}

main();

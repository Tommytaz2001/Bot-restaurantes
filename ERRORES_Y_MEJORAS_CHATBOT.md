# 🐛 ERRORES Y MEJORAS - CHATBOT DE PEDIDOS

**Fecha de reporte:** 2025-04-11  
**Prioridad:** Critical & Enhancement

---

## 1️⃣ ERROR CRÍTICO: Bot rechaza imagen de comprobante de transferencia

### Descripción del problema
- **Cuando sucede:** Usuario dice "voy a pagar con transferencia" → Bot da info bancaria → Usuario envía imagen del comprobante
- **Comportamiento actual:** Bot responde: "Hola 👋 Solo puedo atender pedidos por escrito. Por favor escríbeme qué deseas..."
- **Impacto:** Confunde al usuario, interrumpe el flujo de pago, pedido queda incompleto

### Root Cause
El bot está configurado para rechazar imágenes/medios, pero en el flujo de pago necesita aceptarlas como comprobantes de transferencia.

### Solución propuesta
**Agregar sección de "Comprobante de Pago"** dentro del módulo de pedidos:
1. Cuando usuario selecciona "Pagar por transferencia":
   - Bot envía info bancaria
   - Abre campo especial: "📸 Carga aquí la imagen del comprobante"
   - Bot acepta imagen en este contexto específico
   
2. Interfaz de validación (para el vendedor/chef):
   - Mostrar imagen del comprobante
   - Botón: **[✅ Aprobar pago]** 
   - Botón: **[❌ Rechazar - Solicitar nuevo]**
   - Campo de nota si rechaza

3. Flujo:
   - Imagen cargada → Estado: "Pendiente de validación de pago"
   - Vendedor aprueba → Estado: "Pago confirmado" → Avanza a "En preparación"
   - Vendedor rechaza → Notifica usuario para reenviar

---

## 2️⃣ ERROR: Botones de estado anidados (En camino + Entregado)

### Descripción del problema
- **Actual:** Después de "Confirmar pedido" aparecen directamente "Marcar en camino" y "Marcar entregado" uno después del otro
- **Comportamiento no deseado:** El vendedor podría marcar "Entregado" sin pasar por "En camino"
- **Impacto:** Historial confuso, falta de trazabilidad real del pedido

### Solución propuesta
**Cambiar a flujo secuencial de estados:**

```
Confirmado ✓
     ↓
[Marcar en camino] (único botón disponible)
     ↓
En camino 🚗
     ↓
[Marcar entregado] (único botón disponible)
     ↓
Entregado ✓
```

**Implementación:**
- Desactivar botón "Entregado" hasta que estado = "En camino"
- Mostrar solo el botón correspondiente al estado actual
- Historial debe reflejar todos los estados: Confirmado → En camino → Entregado

---

## 3️⃣ MEJORA: Agregar "Copy" en sección de Historial

### Descripción del problema
- **Actual:** Función copy (copiar pedido) solo disponible en sección "Delivery"
- **Usuario quiere:** Poder copiar pedidos anteriores desde el historial
- **Caso de uso:** Cliente que repite orden frecuente quiere clonarla desde historial

### Solución propuesta
- Agregar botón **[📋 Copiar pedido]** en cada item del historial
- Al clickear → Genera nuevo pedido con mismos items
- Usuario puede modificar cantidad/items antes de confirmar

---

## 4️⃣ ERROR: Bot no interpreta intención cuando hay pedido activo y usuario pide algo nuevo

### Descripción del problema
- **Escenario:** Usuario tiene pedido confirmado → Escribe "una hamburguesa"
- **Problema:** Bot no pregunta si es:
  - ¿Agregar al pedido actual?
  - ¿Crear pedido nuevo separado?
  - ¿Modificar el pedido existente?
- **Actual:** Bot procesa como nuevo input sin contexto
- **Impacto:** Confusión, pedidos fragmentados, pérdida de ventas

### Solución propuesta
**Implementar sistema de confirmación inteligente:**

1. **Detectar contexto de pedido activo:**
   - Si hay pedido en estado: Pendiente/Confirmado/En preparación
   - Y usuario envía nuevo item
   
2. **Preguntar intención:**
   ```
   Veo que tienes un pedido en curso 🛒
   ¿Deseas:
   [1️⃣ Agregar "hamburguesa" al pedido actual]
   [2️⃣ Crear un pedido nuevo separado]
   [3️⃣ Modificar el pedido actual]
   ```

3. **Reutilizar datos:**
   - Si es nuevo pedido → Mostrar dirección guardada: "¿Es la misma que: Calle X, Casa Y?"
   - Usuario solo valida (sí/no) en lugar de escribir de nuevo
   - Si es agregar → Automáticamente usa misma dirección

4. **Casos de reutilización:**
   - Dirección: Validar, no pedir de nuevo
   - Teléfono: Reutilizar automáticamente
   - Instrucciones especiales: Preguntar si aplican para nuevo item

---

## 5️⃣ ERROR: Bot pide dirección antigua cuando usuario marca mensaje viejo

### Descripción del problema
- **Escenario:** Usuario envió dirección hace 2 meses → Bot vuelve a pedirla → Usuario responde con mensaje antiguo (reacción emoji o quote)
- **Problema:** Bot no entiende la intención y le pide que escriba de nuevo
- **Actual:** Usuario confundido, proceso tedioso
- **Impacto:** Mala experiencia, abandono del pedido

### Solución propuesta
**Mejorar interpretación contextual:**

1. **Detectar referencias a mensajes antiguos:**
   - Si usuario usa quote/reply a mensaje de dirección anterior
   - Si usuario responde a sugerencia del bot de dirección guardada
   
2. **Acción automática:**
   - Validar dirección encontrada
   - Mostrar: "✓ Confirmo dirección: [Calle X, Casa Y, Ciudad]"
   - Botones: [✅ Correcto] [❌ Cambiar dirección]
   - No obligar a escribir de nuevo

3. **Mejora de UX:**
   - Guardar últimas 3 direcciones del usuario
   - Mostrar al inicio: "¿Envío a la misma dirección que la última vez?"
   - Quick buttons con direcciones guardadas

---

## 6️⃣ INCÓGNITA: Diferenciar usuario de "Motomandado" (repartidor tercero)

### Descripción del problema
- **Escenario:** A veces el que pone la orden NO es el cliente final
- **Actual:** Bot trata igual a cliente + motomandado
- **Problema:** Motomandados deberían tomar la orden (no el bot), datos duplicados
- **Impacto:** Confusión sobre responsable de la orden

### Solución propuesta
**Detectar tipo de usuario al inicio:**

1. **Preguntar en primer contacto:**
   ```
   Hola 👋 ¿Eres:
   [👤 Cliente (pido para mí/mi negocio)]
   [🏍️ Motomandado (traigo una orden)]
   ```

2. **Flujo para Motomandados:**
   - Tomar datos del cliente final (nombre, dirección, teléfono)
   - NO crear cuenta/perfil para motomandado
   - Al confirmar: "Pedido a nombre de: [cliente]"
   - Asociar a cliente original, no al motomandado
   - Motomandado recibe número de orden
   - Si vuelve a escribir → Reconocer si es mismo motomandado o diferente

3. **Beneficios:**
   - Historial correcto por cliente
   - Motomandados no crean perfiles fantasma
   - Trazabilidad clara
   - Puede haber múltiples órdenes por motomandado

---

## 7️⃣ ERROR: Notificaciones Push solo en primer pedido

### Descripción del problema
- **Actual:** Notificaciones Push funcionan para el 1er pedido
- **Luego:** Desaparecen en pedidos posteriores
- **Impacto:** Usuario no notificado de confirmación, en camino, entregado
- **Severidad:** CRÍTICO para tracking de pedidos

### Posibles causas:
- [ ] Fallo en renovación del token de FCM
- [ ] Bot no restablece conexión push después del 1er pedido
- [ ] App no refresca registro de dispositivo
- [ ] Error en subscripción a tópico

### Solución propuesta
**Revisar implementación de push notifications:**

1. **En el bot:**
   - Validar que renvía token FCM con cada nuevo pedido
   - Verificar que no hay límite de notificaciones por usuario
   - Confirmar que suscribe a tópico "pedidos_usuario_{id}"

2. **En la app:**
   - Refrescar token FCM al inicio de cada conversación
   - Verificar permisos de notificación cada vez
   - Log de intentos de push (para debugging)

3. **En el backend:**
   - Validar token antes de enviar
   - Guardar intent de notificación si falla
   - Reintentar con exponential backoff
   - Log de qué notificaciones se envían/fallan

---

## 📋 RESUMEN DE PRIORIDADES

| # | Tipo | Severidad | Tarea |
|---|------|-----------|-------|
| 1 | ERROR | 🔴 CRÍTICA | Aceptar imágenes de comprobante en flujo de pago |
| 7 | ERROR | 🔴 CRÍTICA | Notificaciones push en pedidos posteriores |
| 2 | ERROR | 🟠 ALTA | Secuencia correcta de estados (En camino → Entregado) |
| 4 | ERROR | 🟠 ALTA | Detectar intención cuando hay pedido activo |
| 5 | ERROR | 🟠 ALTA | Mejorar interpretación de direcciones antiguas |
| 6 | FEATURE | 🟠 ALTA | Diferenciar Cliente vs Motomandado |
| 3 | MEJORA | 🟡 MEDIA | Agregar copy en historial |

---

## 🔧 ORDEN RECOMENDADO PARAIMPLEMENTAR

### Fase 1 (Urgente - esta semana)
- #1: Sistema de comprobante de transferencia
- #7: Fix notificaciones push

### Fase 2 (Esta semana)
- #2: Secuencia de estados
- #4: Intención inteligente pedido activo

### Fase 3 (Próxima semana)
- #5: Direcciones guardadas
- #6: Detección cliente vs motomandado
- #3: Copy en historial

---

## 📝 NOTAS PARA EL DESARROLLO

### Puntos técnicos clave:
1. **Manejo de estados:** Implementar máquina de estados clara (Confirmado → En camino → Entregado)
2. **Contexto conversacional:** Mantener historial de pedido activo en memoria
3. **Validación de datos:** Guardar y reutilizar: dirección, teléfono, preferencias
4. **FCM/Push:** Revisar integración con Firebase Cloud Messaging
5. **Inteligencia de intención:** Usar NLP o rules-based para detectar: agregar, nuevo, modificar

---

## 📞 CONTACTO/PREGUNTAS

Cuando estés listo para implementar, preguntar sobre:
- ¿Qué plataforma de pago usa? (Stripe, PayPal, etc.)
- ¿Qué servicio de notificaciones? (FCM, OneSignal, etc.)
- ¿Base de datos actual? (Firebase, SQL, etc.)
- ¿Token de validación de pagos?


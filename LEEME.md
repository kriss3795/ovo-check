# Ovo Check

Registro diario de galpones de postura. El operario llena un checklist con números y fotos, y la información le llega al supervisor con respaldo de quién, cuándo y dónde. Es, ante todo, una mensajería estandarizada: el supervisor recibe los datos ordenados y con ellos llena sus propias planillas.

Es una sola app con dos formas de entrar: **operario** o **supervisor**. Se publica en Vercel y se instala en el teléfono desde el navegador: queda con su ícono, a pantalla completa, funciona sin señal y recibe notificaciones. En el computador se usa la misma dirección.

---

## Instalación (una sola vez)

Necesitas tres cuentas gratuitas: Supabase (guarda los datos), Vercel (publica la app) y el Gmail `ovocheck.avisos@gmail.com` (envía los códigos para recuperar claves).

### 1. Supabase: crear el servidor

1. En supabase.com abre tu proyecto y entra a **SQL Editor**.
2. Pega el contenido completo de `supabase/esquema.sql` y presiona **Run**. Si aparece una advertencia, confirma. Abajo debe decir *Ovo Check instalado*.
3. En **Project Settings > API Keys** vas a necesitar tres datos para el paso 3:
   - la dirección del proyecto (`https://xxxx.supabase.co`),
   - la clave pública: la *publishable* (empieza con `sb_publishable_`),
   - la clave secreta: la *secret* (empieza con `sb_secret_`). Esta no se comparte con nadie.

   Si la página no las muestra todavía, se crean ahí mismo con un botón. Las antiguas *anon* y *service_role* (empiezan con `eyJ`) también sirven, pero Supabase anunció que las retira a fines de 2026.

No hay que cambiar ni anotar nada del archivo. Se puede volver a ejecutar completo cuando haya una versión nueva, sin perder datos.

### 2. Gmail: permitir que la app envíe los códigos

1. Entra a `ovocheck.avisos@gmail.com` y activa la **verificación en dos pasos** (myaccount.google.com > Seguridad).
2. Abre myaccount.google.com/apppasswords, crea una contraseña de aplicación llamada "Ovo Check" y copia las 16 letras.

### 3. Vercel: publicar la app

1. Sube esta carpeta a un repositorio de GitHub (sin `node_modules`): en github.com, **New repository**, y luego **uploading an existing file**, arrastrando todo el contenido de la carpeta.
2. En vercel.com, **Add New > Project**, elige ese repositorio. Vercel reconoce solo que es un proyecto Vite.
3. Antes de presionar Deploy, abre **Environment Variables** y agrega estas siete:

   | Nombre | Valor |
   |---|---|
   | `VITE_SUPABASE_URL` | la dirección del proyecto de Supabase |
   | `VITE_SUPABASE_KEY` | la clave pública de Supabase |
   | `SUPABASE_SERVICE_KEY` | la clave secreta de Supabase |
   | `GMAIL_USER` | `ovocheck.avisos@gmail.com` |
   | `GMAIL_APP_PASSWORD` | las 16 letras de la contraseña de aplicación |
   | `VAPID_PUBLIC_KEY` | la clave pública de notificaciones |
   | `VAPID_PRIVATE_KEY` | la clave privada de notificaciones |

   Son datos de conexión entre los servicios, no claves de personas: se pegan una sola vez. Las dos de notificaciones no deben cambiarse después; si cambian, cada teléfono tiene que volver a activar las notificaciones.

4. Presiona **Deploy**. Si cambias una variable más adelante, hay que usar **Redeploy** para que se aplique.

### 4. Comprobar que quedó bien

1. Abre la dirección que te dio Vercel (algo como `https://ovo-check.vercel.app`).
2. Toca **Soy supervisor > Crear un plantel nuevo**.
3. Ve a **Ajustes > Probar conexión**. Deben salir en verde: servidor de datos, reloj, subida de fotos, correos para recuperar claves y notificaciones. Si algo sale mal, el mensaje dice qué variable revisar.
4. Ve a **Ajustes > Notificaciones**, actívalas y toca **Enviar una notificación de prueba**.

### 5. Instalarla como app en cada teléfono

En Android, abre la dirección en Chrome y toca **Instalar la app en este equipo** (el botón aparece en la primera pantalla y en Ajustes) o, en el menú de Chrome, **Agregar a pantalla de inicio**.

En iPhone: botón Compartir, **Agregar a inicio**. Hazlo antes de entrar al plantel, porque en iPhone la app instalada no comparte los datos con Safari, y las notificaciones solo funcionan si la app se abre desde ese ícono.

### 6. Google Play, cuando ya esté probada

Para Google Play se empaqueta esta misma app publicada en Vercel (como "Trusted Web Activity"), de modo que las notificaciones, la cámara y el trabajo sin señal siguen funcionando igual. La app ya cumple lo que Google exige para eso: se instala, funciona sin conexión, tiene sus íconos, su política de privacidad en `https://TU-APP.vercel.app/privacidad.html` y una forma de eliminar la cuenta desde la propia app (Ajustes > Plantel > Eliminar este plantel).

Pasos, cuando llegue el momento:

1. Define la dirección definitiva de la app (la de Vercel o un dominio propio). No debe cambiar después.
2. En pwabuilder.com escribe esa dirección y genera el paquete para Android. Entrega el archivo para subir a Google Play y un archivo `assetlinks.json`.
3. Guarda ese `assetlinks.json` en la carpeta `public/.well-known/` del proyecto y vuelve a publicar. Sin ese archivo la app se abre con la barra del navegador a la vista.
4. Sube el paquete a Google Play Console (la cuenta de desarrollador cuesta 25 dólares, una sola vez).

---

## Cómo se entra

La primera pantalla tiene dos botones: **Soy operario** y **Soy supervisor**.

**Supervisor.** Entra con su correo y su clave, desde cualquier teléfono o computador. Solo desde ahí se crea un plantel: quien lo crea queda como supervisor y elige el nombre del plantel, su propia clave y la **clave del plantel** que usarán sus operarios.

**Operario.**
1. Escribe el nombre exacto del plantel (no importan mayúsculas ni tildes). No existe ninguna lista de planteles: quien no sabe el nombre no lo encuentra.
2. Escribe la clave del plantel. Se hace una sola vez en cada teléfono.
3. Elige su nombre y crea su propio PIN de 4 números. Desde entonces entra solo con su nombre y su PIN.
4. Dentro de su sesión ve todos los galpones del plantel, los suyos primero. Toca el galpón donde está y registra; puede cambiar de galpón cuando quiera.

Para sumar operarios, el supervisor va a **Ajustes > Teléfonos > Enviar invitación**: se abre WhatsApp con el enlace y el nombre del plantel. La clave del plantel no va en el mensaje; se la da él.

Si el supervisor quiere una prueba de que el operario estuvo en cada galpón, puede agregar la tarea **Foto al entrar al galpón** desde la biblioteca de tareas: queda con hora, ubicación y nombre.

---

## Primer uso en un plantel

1. El supervisor crea el plantel.
2. La pantalla de inicio le muestra los pasos: agregar a los operarios, anotar las aves de cada galpón y sus encargados, revisar las tareas y sumar los teléfonos.
3. Cada operario entra desde su teléfono como se explica arriba.

Las tareas clásicas de postura vienen cargadas: temperatura mínima y máxima, lectura del medidor de agua, mortalidad, bebederos, comederos, pediluvio, huevos recolectados, alimento, nidos, y pesaje semanal. El supervisor puede editarlas, pausarlas, borrarlas, reordenarlas o agregar otras (hay una biblioteca con las más frecuentes). Solo el supervisor crea y elimina galpones, personas, supervisores y tareas.

---

## Lo que ve cada uno

**Operario.** Sus galpones primero, el checklist del día con botones grandes, la cámara de la app y el botón "Informar un problema". No ve rangos esperados, lecturas anteriores, consumos ni porcentajes: solo anota lo que mide.

**Supervisor.**
- **Hoy, por galpón:** avance, alertas y atrasos de cada galpón, y el detalle de cada tarea con su foto.
- **Hoy, por persona:** cuántas tareas lleva cada operario en los galpones a su cargo, cuáles le faltan y cuáles están atrasadas, y todo lo que registró.
- **Alertas:** problemas informados y lecturas de medidor menores que la anterior, para marcarlas como revisadas.
- **Historial:** cualquier día anterior, y un resumen por tarea (fechas por galpón) con los indicadores calculados: consumo del día, ml por ave, g por ave, % de postura.
- **Descargar datos:** todos los registros en un archivo que abre en Excel.
- **Descargar fotos:** un archivo .zip con las fotos, ordenadas por día y galpón.

---

## Fotos: se guardan 30 días

Las fotos se borran solas de la nube a los **30 días**. Los números y el historial no se borran nunca. Para conservar las fotos hay que descargarlas antes:

- **Historial > Fotos** (o Ajustes > Descargar fotos): las de hoy, las de los últimos 7 días o todas las que quedan, en un .zip.
- En cada registro, al abrir una foto: **Guardar en este equipo**.
- La app avisa en la pantalla de inicio del supervisor cuando hay fotos que se borran esa semana, y los lunes le llega una notificación.

El plazo se cambia en Supabase: `update oc_ajustes set valor = '45' where clave = 'dias_fotos';`

---

## Notificaciones

Cada persona las activa en su propio teléfono (la app lo propone al entrar).

| Qué | A quién | Cuándo |
|---|---|---|
| Problema informado, o revisión con "Hay un problema" | Supervisores | Al instante |
| Lectura de medidor menor que la anterior | Supervisores | Al instante |
| Entró un equipo nuevo al plantel | Supervisores | Al instante |
| Tareas de la mañana sin registrar | Supervisores y encargados | Después del mediodía |
| Tareas de la tarde sin registrar | Supervisores y encargados | En la noche |
| Fotos que se borran esa semana | Supervisores | Los lunes |

Con el plan gratuito de Vercel los dos recordatorios diarios salen dentro de una ventana de una hora (entre las 13 y las 15, y entre las 20 y las 22, según el horario de verano o invierno). Los avisos de problemas no dependen de eso: salen apenas el registro llega al servidor.

---

## Claves: quién crea cada una

Nadie tiene que entregar claves desde fuera. Cada una la crea la persona que la usa, dentro de la app.

| Clave | Quién la crea | Si se olvida |
|---|---|---|
| Clave del supervisor | El propio supervisor (mínimo 6 caracteres) | "Olvidé mi clave": le llega un código a su correo y elige una nueva |
| Clave de un supervisor nuevo | Otro supervisor le pone una temporal | La app lo obliga a cambiarla al entrar |
| Clave del plantel | El supervisor, al crear el plantel | La ve y la cambia en Ajustes > Teléfonos |
| PIN del operario | El propio operario, la primera vez | El supervisor toca "Reiniciar PIN" y el operario crea otro |

La app rechaza las claves fáciles de adivinar (123456, el nombre del plantel y similares).

Situaciones del día a día:

- **Operario con licencia:** Ajustes > Personas > su nombre > *Con licencia*. Deja de aparecer en el ingreso; al volver se marca *Activo* y conserva su PIN e historial.
- **Operario que deja el plantel:** *De baja*, o *Eliminar persona*. Sus registros anteriores se conservan con su nombre. Si usaba su propio teléfono, quítalo en Ajustes > Teléfonos y cambia la clave del plantel.
- **Teléfono perdido:** Ajustes > Teléfonos > *Desvincular*. Deja de funcionar de inmediato.
- **Operario que trabaja en dos planteles:** en la primera pantalla, *Entrar a otro plantel*. Un teléfono trabaja con un plantel a la vez; la app no lo deja cambiar mientras tenga datos sin enviar.

---

## Seguridad de los datos

- **Nadie lee las tablas directamente.** Todo pasa por funciones del servidor que comprueban quién pide cada cosa. Cada plantel solo ve lo suyo.
- **Los planteles no se pueden listar.** Solo se encuentra uno escribiendo su nombre exacto, y aun así hace falta la clave del plantel.
- **Frenos contra quien prueba claves.** Tras varios intentos fallidos (de la clave del plantel, de la clave de un supervisor o de nombres de plantel) el servidor deja de responder por un rato.
- **Equipos nuevos a la vista.** Cada teléfono o computador que entra al plantel le aparece destacado al supervisor, con notificación, hasta que dice "Lo conozco". Si no lo conoce, lo desvincula con un toque. También ve cuántas veces alguien escribió mal la clave del plantel.
- **La clave del supervisor se comprueba en el servidor** y no se guarda en los teléfonos de los operarios. Su sesión termina en el servidor al cerrar sesión y vence sola a los 30 días sin uso.
- **El servidor no confía en el teléfono.** El nombre de quien firma un registro lo pone el servidor; lo que firma un supervisor exige su sesión abierta con clave en ese equipo; un operario no puede anular registros ni anotar hoy algo con fecha antigua.
- **Las fotos solo se aceptan si pertenecen a un registro ya recibido** de ese plantel. Nadie de fuera puede llenar el espacio con archivos.
- **Cabeceras de seguridad en la publicación** (`vercel.json`): la app no se puede incrustar en otra página ni cargar código de otros sitios.
- **Los recordatorios salen una vez por turno**, aunque alguien abra su dirección a propósito muchas veces.

Límite conocido: el PIN del operario es de 4 números y se comprueba en el teléfono para poder trabajar sin señal. Sirve para firmar en un teléfono compartido; no es una clave fuerte.

---

## Cómo se asegura que la información sea creíble

- **Fotos solo desde la cámara de la app.** No hay acceso a la galería. Cada foto lleva quemados el galpón, la tarea, la fecha, la hora, el operario, el GPS y el código del registro.
- **La hora la pone el servidor.** Si el teléfono estaba sin señal, el servidor calcula la hora real restando el tiempo que el registro esperó, y avisa si el reloj del teléfono estaba corrido.
- **Atrasar el reloj no sirve.** La app recuerda la última hora que vio: si alguien cambia el reloj del teléfono hacia atrás sin señal, el registro no queda "más temprano" y llega marcado para verificar.
- **Ubicación.** Cada registro lleva la posición del teléfono. Si el supervisor guarda la ubicación del galpón, lo registrado a más de 300 m queda marcado. El GPS de un teléfono no distingue dos galpones que están uno al lado del otro; para eso sirve la foto de la puerta.
- **Nada se edita ni se borra.** Una corrección crea una versión nueva firmada y con motivo; la anterior queda a la vista. El supervisor puede corregir o anular, y también queda firmado; lo anulado sigue a la vista con su motivo.
- **Cada registro guarda las aves y el lote de ese día,** así los indicadores antiguos no cambian cuando el supervisor actualiza el galpón.
- **El operario no recibe pistas.** No ve rangos, lecturas anteriores ni cálculos, así que no puede ajustar un número para que "calce". El supervisor compara contra sus propios criterios.
- **Marcas para verificar.** Tarea de la tarde registrada en la mañana, registro lejos del galpón, tarea sin la foto pedida, tarea no realizada, reloj desajustado.
- **Nunca bloquea al operario.** Lo dudoso se guarda igual y se marca para que el supervisor lo revise.

---

## Capacidad, costos y qué pasa si se llena

### Para cuántos planteles alcanza gratis

La medida que importa es el **galpón en producción**, no el plantel. Con la rutina clásica, cada galpón genera al día unos 10 registros (12 KB) y unas 4 fotos (130 KB cada una, que se borran a los 30 días).

| Recurso de Supabase gratis | Lo que ocupa un galpón | Alcanza para |
|---|---|---|
| 1 GB para fotos | 16 MB, estable (las fotos rotan cada 30 días) | **unos 60 galpones al mismo tiempo** |
| 500 MB para los números | 4,3 MB por año, y se acumula | 60 galpones durante 1 año y medio; 30 galpones durante 3 años |

En planteles: **entre 12 y 15 avícolas de 4 galpones**, o 30 avícolas chicas de 2 galpones. Lo primero que se acaba es el espacio de fotos.

### Qué pasa si se llena, y cómo se protege sola

Si la base de datos gratuita de Supabase se pasa de su límite, Supabase la deja en modo solo lectura y nadie puede ni entrar. Para que eso no ocurra nunca, la app se mide a sí misma y frena antes, por etapas:

1. **Cupo por galpones.** Un plantel nuevo solo se acepta si sus galpones caben junto a los que ya están trabajando (tope: 60 galpones en producción). A quien no cabe, la app le dice que por ahora no quedan cupos.
2. **Pocos por día.** Se aceptan como máximo 8 planteles nuevos al día en todo el servidor, por si la app se hace conocida de golpe.
3. **Al 70 % del espacio** (de números o de fotos) se dejan de aceptar planteles nuevos. Los que ya existen siguen igual.
4. **Si se acaba el espacio de fotos,** los números siguen llegando y las fotos esperan en cada teléfono hasta que se libere espacio (todos los días se borran las que cumplen 30 días). Un solo plantel no puede ocupar más de 300 MB ni más de 3.000 fotos.
5. **Si se acaba el espacio de números** (450 MB, antes del límite real de 500), los registros nuevos esperan en cada teléfono, sin perderse, y se envían solos cuando hay espacio. Entrar, revisar y descargar siguen funcionando. Operarios y supervisores ven el aviso "El servidor está lleno".
6. **Contra el abuso:** un plantel no puede enviar más de 2.500 registros en 24 horas ni registros inflados, y un plantel creado para probar que quedó abandonado (ningún registro y ningún teléfono abierto en 60 días) se borra solo.

**Aviso por correo.** La tarea diaria mide el espacio y envía un correo a la cuenta de Gmail de la app cuando el uso pasa el 60 %, el 80 % y el 95 %, con el detalle y qué hacer. Para recibirlo además en otro correo, agrega en Vercel la variable `CORREO_DUENO` con esa dirección.

### Si se hace conocida y llega mucha gente

- La app en sí (Vercel) aguanta sin problema: son archivos que se sirven desde una red mundial.
- El servidor gratuito no se cae ni se corrompe: los cupos de arriba hacen que los primeros planteles sigan trabajando normal y los que llegan después reciban un "por ahora no quedan cupos".
- Para abrir más cupos se pasa el proyecto de Supabase al plan **Pro (25 dólares al mes)**: 100 GB de fotos y 8 GB de números, con respaldo diario. No hay que mover nada ni reinstalar. Después se ejecuta una línea en el SQL Editor para que la app use el espacio nuevo:

  ```sql
  select oc_soporte_plan('pro');
  ```

  Con eso caben unos **1.500 galpones** (300 a 400 avícolas).

### Otros límites

| Servicio | Qué da gratis | Qué pasa al llegar al límite |
|---|---|---|
| Vercel | Publicación de la app, las funciones y las tareas diarias | Ver la nota de abajo |
| Gmail | 500 correos al día | Sobra para recuperar claves |
| Notificaciones | Sin costo ni límite práctico | |

- Los topes viven en la tabla `oc_ajustes` de Supabase (`max_galpones`, `max_granjas`, `max_granjas_dia`, `max_mb_datos`, `max_mb_total`, `max_mb_fotos_granja`, `max_fotos_granja`, `max_registros_dia`, `dias_fotos`).
- Un plantel de prueba se borra en Ajustes > Plantel > Eliminar este plantel.
- Supabase pausa los proyectos gratuitos tras 7 días sin uso. La tarea diaria de Vercel lo mantiene despierto.
- El plan gratuito de Supabase no hace copias de respaldo. Conviene que cada supervisor use **Descargar datos** de vez en cuando.

**Nota sobre Vercel:** su plan gratuito está pensado para uso personal o no comercial. Para probar y mostrar la app sirve; si después la vendes a empresas, corresponde pasar al plan Pro (20 dólares al mes) o mover la publicación a otro servicio. Los datos no se ven afectados porque viven en Supabase.

---

## Lo que esta versión no hace

- **No envía datos con la app cerrada.** Lo pendiente sube al abrirla o apenas vuelve la señal con la app abierta. El operario ve siempre cuánto falta por enviar.
- **No lee los números de las fotos.** La planilla de pesaje llega como foto.
- **Un teléfono trabaja con un plantel a la vez.**
- **Si un teléfono se rompe antes de enviar,** se pierde lo que tenía pendiente.
- **No descuenta sola la mortalidad.** El número de aves de cada galpón lo actualiza el supervisor en Ajustes > Galpones; de él dependen el % de postura y los consumos por ave.

---

## Soporte

- Ver el uso de cada plantel, en el SQL Editor de Supabase: `select * from oc_soporte_uso;`
- Borrar un plantel completo desde ahí (por ejemplo, uno creado para abusar del espacio): `select oc_soporte_eliminar('Nombre del plantel');`
- Después de contratar el plan Pro de Supabase: `select oc_soporte_plan('pro');`
- Si un supervisor único perdió su clave y ya no tiene acceso a su correo: `select oc_soporte_clave('Nombre del plantel', 'Nombre Apellido', 'claveTemporal');`
- Para regenerar los íconos a partir de otro logo: reemplaza `recursos/logo-original.png` y ejecuta `python3 recursos/generar_iconos.py`.

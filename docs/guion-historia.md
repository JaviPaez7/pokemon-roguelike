# PokéRogue · H4 Historia: «El Eco del Norte»

> **Versión 2, implementada en el juego (H4).** Este documento es la fuente: `npm run story` genera `src/data/story.json` a partir de las secciones 5 a 7. Un test unitario avisa si los dos no coinciden.
>
> **Novedades del borrador 2:**
> - Los capítulos 1 a 3 ya no siguen el mismo molde: rescate (1), malentendido con el viento como enemigo (2) y encargo del tablón con una carta sin remite (3).
> - El protagonista tiene papel propio: el Eco le escucha porque fue quien contestó, y eso pesa en cada capítulo.
> - La explicación de Clefable se reparte entre Pidgeotto, Onix y Slowpoke.
> - Aldea Musgo reaparece en los capítulos 2, 4, 6 y 7.
> - Kecleon ofrece un monstersito, y si hay un Squirtle en el equipo, dice «¡Vamo' a hacesla!».
>
> Todo el texto es original. Cada escena tiene un código (P-2, 3-D…) para que puedas decir «cambia la 3-D» sin copiar nada.

---

## 1. La historia en un minuto

Una voz sin cuerpo hace preguntas en la oscuridad. Alguien del mundo de los humanos se para a contestarlas… y despierta en el camino de **Pueblo Raíz** con el cuerpo del Pokémon que dicen sus respuestas (el test de personalidad).

Le encuentra **{compañero}**, que acaba de huir de **Aldea Musgo**: hace tres noches el suelo se retorció y su aldea se convirtió en una mazmorra. Desde hace unas semanas baja del norte un viento que **habla** (el **Eco**). Las mazmorras cambian cada día y algunos Pokémon que lo oyen demasiado pierden el juicio. Nadie explora ya: el último equipo del pueblo, el **Equipo Centella**, se fue al norte hace diez años y nadie habla mucho de aquello.

Fundan el **{equipo}** y siguen el Eco hacia el norte, mazmorra a mazmorra, hasta el **Laboratorio Final**. Allí despertó a medias **Mewtwo**, a quien los humanos (los «Antiguos») dejaron dormido al marcharse. Su soledad es el Eco. Su pregunta, «¿Quién eres?», cruzó de un mundo a otro, y fue el protagonista quien contestó. Por eso el Eco le escucha: oye el viento mejor que nadie y, cuando le habla, el viento hace caso. Con el Mewtwo que grita en el laboratorio, no. La pregunta que no se atrevía a terminar era otra: **«¿Te quedarías?»**.

**Tema: tener un sitio al que volver.** El bucle del juego es el tema. El viento de las mazmorras empuja hacia fuera y el pueblo siempre trae al equipo de vuelta, incluso cuando cae. Mewtwo no tiene adónde volver, y el final consiste en ofrecérselo.

**Tono:** aventura amable con humor de pueblo y memes españoles de toda la vida (Kecleon, Slowpoke, Pidgey, Gengar, Persian), y momentos serios en los que no se bromea (Persian, Arcanine, Mewtwo). Los memes están en la sección 8. Nadie muere. Los jefes no son malos: a unos el Eco les amplifica un sentimiento y otros tienen sus motivos. La excepción es Gengar, que es un aprovechado.

### Cómo encaja con lo que ya hay en el juego

| Mecánica | Explicación dentro de la historia |
|---|---|
| Mazmorras procedurales que cambian | Son los sueños de Mewtwo. Onix lo nota («cada mañana es otra», 2-D) y Clefable lo confirma (4-D). |
| El viento que expulsa del piso | «Las mazmorras no quieren visitas» (1-B). El viento siempre baja al sur y se cansa en el valle (Pidgeotto, 1-E). |
| El protagonista y el viento | El Eco escucha a quien lo contestó: el protagonista le habla y el viento hace caso (1-D, 2-D, 3-D). |
| Misiones del tablón | El capítulo 3 empieza con un encargo de entrega sin remite, que ha colgado Persian. |
| Caer y aparecer en el pueblo | Desde el cap. 1, Pidgeotto promete «si caéis, os traigo de vuelta». |
| El banco y el almacén no se pierden | Es el juramento de Persian (6-E): «aquí lo que se guarda no se pierde». |
| Test de personalidad | Son las preguntas de la voz. Sus respuestas le dieron forma al protagonista. |
| Torre del Desafío (50 pisos de todas las zonas) | Mewtwo la levanta con lo que queda del Eco: «cincuenta pisos hechos de todos mis sueños». |

### Qué mueve a cada jefe

| Jefe | Qué le pasa | ¿Está bajo el Eco? |
|---|---|---|
| Pidgeotto | Confusión: «¿Quién eres? ¿Quién soy?» | Sí |
| Onix | Miedo por los demás: tapa la salida para que el viento no asuste a los pequeños de la cueva | No (es un malentendido) |
| Raichu | Rabia por el abandono | Sí, y además ya la tenía dentro |
| Clefable | Nada: la luna le protege. Es quien lo explica todo | No (combate de prueba) |
| Gengar | Se alimenta de las pesadillas que provoca el Eco | No (se aprovecha) |
| Arcanine | Culpa y deber: lleva diez años vigilando | No (cumple una promesa) |
| Mewtwo | Soledad: es el origen de todo | Es el Eco |

---

## 2. Cómo leer el guion

- **Marcadores:** `{héroe}` es la especie del protagonista, `{compañero}` la del compañero y `{equipo}` el nombre del equipo. En el juego se sustituyen por el nombre real.
- **Formato de cada línea:** **Personaje** · *Emoción* — texto. Cada línea es un cuadro de diálogo, con el retrato de quien habla. *Narración* va sin retrato y **???** es la voz sin cuerpo.
- **Emociones:** son las de los retratos de PMDCollab (Normal, Happy, Joyous, Inspired, Surprised, Determined, Angry, Shouting, Worried, Sad, Crying, Teary-Eyed, Pain, Sigh…). Un test comprueba que cada una existe para su personaje. Hay tres jefes con pocas caras y el guion solo usa las que tienen:
  - Onix: Normal y Surprised.
  - Pidgeotto: Normal y Worried.
  - Gengar: Normal, Happy, Surprised, Angry, Sad y Pain.
- **El protagonista habla poco:** frases cortas y dichas en voz alta, y pensamientos **entre paréntesis** que solo ve el jugador.
- **Género neutro para `{héroe}` y `{compañero}`:** pueden ser cualquier especie y el jugador no elige género. No se les aplican adjetivos ni pronombres con género («¿Estás bien?» sí, «¿Estás cansado?» no). Tampoco se les aplican plurales con género («vosotros», «juntos»): se habla del grupo como «el equipo» o con el verbo solo («Volved»).
- **Personajes con género en el guion:** Pidgey y Pidgeotto (hermanas), Kangaskhan, Persian, Raichu y Clefable son ellas. Kecleon, Slowpoke, Onix y Arcanine son ellos. Gengar y Mewtwo no tienen género: en sus propias frases se evita, y cuando otros hablan de ellos se usa el masculino genérico («lo despertamos»).

### Cuándo salta cada tipo de escena

Todas las escenas salen **una sola vez**. Al repetir una mazmorra ya completada, todo funciona como ahora.

| Letra | Momento |
|---|---|
| **A** · En el pueblo | Escenas del pueblo a mitad de capítulo: el sobre del tablón (3-A) y la víspera del laboratorio (7-A). |
| **B** · Entrada | La primera vez que el equipo entra en la mazmorra, en el piso 1. |
| **C** · Antes del jefe | La primera vez que el equipo llega al piso del jefe. |
| **D** · Después del jefe | Al derrotar al jefe por primera vez. |
| **E** · De vuelta | Al volver al pueblo tras completar la mazmorra por primera vez, después del resumen de la expedición. Cierra el capítulo y abre el siguiente. |

La historia no pone nuevos bloqueos: cada mazmorra se sigue abriendo al completar la anterior.

---

## 3. Personajes

| Personaje | Papel | Arco |
|---|---|---|
| **{héroe}** | Una persona del mundo humano, llamada sin querer por la pregunta de Mewtwo. Recuerda que era humana, pero no sabe por qué está aquí. | Descubre que el Eco le escucha (caps. 1 y 2), aprende a usarlo (3 y 5) y, al final, elige dónde está su casa («Todavía no»). |
| **{compañero}** | Viene de Aldea Musgo, que se convirtió en mazmorra. Tiene ganas, algo de miedo y mucho corazón. Habla por el equipo. | Pasa de no tener adónde volver a tener dos casas. Su aldea sigue presente: la cueva se la recuerda (2-D), Clefable le da esperanza (4-D), Persian también (6-E) y Mewtwo se la devuelve (7-D). |
| **Slowpoke** | El vecino más antiguo: lleva «treinta años» sentado en el mismo sitio. Cada capítulo empieza a contar la misma historia antigua y llega un poco más lejos (es un chiste recurrente y a la vez adelanta lo que pasará). | Gengar le secuestra (cap. 5). Termina la historia en el epílogo. |
| **Pidgey** | Joven, rápida, lleva el tablón y el correo desde que desapareció su hermana. Quiere explorar de mayor. | Recupera a su hermana (cap. 1). |
| **Pidgeotto** *(nueva)* | La hermana mayor de Pidgey, cartera entre pueblos. El Eco la confunde en el Bosque Verde. | Después promete rescatar al equipo si cae y hace de mensajera de la historia. |
| **Kecleon** | Comerciante parlanchín, un poco cobarde y buena gente. Sus carros llegan por la Cueva Oscura. | Pide abrir la cueva (cap. 2). Es el humor del pueblo. |
| **Kangaskhan** | Lleva el almacén. Es la madre del pueblo: «lo que se guarda aquí, aquí se queda». Guarda una caja cerrada desde hace diez años. | Abre la caja del Equipo Centella (cap. 6). |
| **Persian** | Banquera elegante, cortante y escéptica. **Fue del Equipo Centella** y es la única que volvió. Cuelga en el tablón, sin firmar, una carta para Raichu (cap. 3). | Pasa de la culpa y el silencio a la reconciliación con Arcanine y Raichu. |
| **Onix** | Gigante bondadoso de la Cueva Oscura, que cuida de los pequeños de la cueva. | Tapa la salida para que no entre el viento. Cuando ve que el protagonista puede hablarle, la abre «para todos». |
| **Raichu** | Del Equipo Centella. Volvió a su ruta y no se atrevió a regresar al pueblo. | De la rabia a la vergüenza y de ahí a la vuelta (epílogo). |
| **Clefable** | Guardiana del Monte Lunar. Lúcida y sabia. | Cuenta la verdad sobre los Antiguos, Mewtwo y el protagonista. |
| **Gengar** | Se alimenta de pesadillas y el Eco le ha dado un festín. Gamberro, divertido y sin escrúpulos. | Huye, y avisa de que el laboratorio da miedo hasta a él. |
| **Arcanine** | Líder del Equipo Centella. Se quedó en el volcán para que nadie volviera a asustar a Mewtwo. | Se rinde ante el equipo y le pide «escuchar, no vencer». Vuelve al pueblo en el epílogo. |
| **Mewtwo** | Creado por los Antiguos y abandonado dormido. El Eco es su soledad. | Deja de gritar, levanta la Torre y deja una puerta abierta para el protagonista. |

---

## 4. Estructura

| Cap. | Título | Mazmorra (pisos) | Jefe | Quién lo pide | Qué se descubre |
|---|---|---|---|---|---|
| Prólogo | Alguien contestó | Pueblo | — | — | La voz, el protagonista humano, Aldea Musgo, el Equipo Centella. |
| 1 | La cartera perdida | Bosque Verde (1-5) | **Pidgeotto** *(jefe nuevo, propuesto)* | Pidgey | El Eco confunde a quien lo oye y viene del norte. |
| 2 | Nadie entra, nadie sale | Cueva Oscura (6-10) | Onix | Kecleon | El Eco escucha al protagonista. La cueva cambia como Aldea Musgo. Raichu fue del Equipo Centella. |
| 3 | Carta sin remite | Ruta Eléctrica (11-15) | Raichu | Un sobre sin firmar en el tablón (lo ha colgado Persian) | Qué hizo el Equipo Centella y que Persian era parte de él. |
| 4 | Lo que dice la luna | Monte Lunar (16-20) | Clefable | Raichu | Los Antiguos, el laboratorio, Mewtwo, por qué está aquí el protagonista y que Aldea Musgo se puede recuperar. |
| 5 | La despensa de Gengar | Profundidades Oscuras (21-30) | Gengar | Pidgey y Kangaskhan (Slowpoke ha desaparecido) | Arcanine sigue en el volcán. |
| 6 | Diez años de guardia | Isla Volcánica (31-40) | Arcanine | Persian | La verdad de aquella noche, la caja y la nota del Equipo Centella. |
| 7 | ¿Te quedarías? | Laboratorio Final (41-50) | Mewtwo | Todo el pueblo | El Eco era soledad y la pregunta que faltaba. |
| Final | Antes de que anochezca | Pueblo | — | — | Epílogo, créditos y la Torre del Desafío. |

---

## 5. Guion

### Prólogo · «Alguien contestó»

Sustituye al mensaje de bienvenida actual, al terminar la nueva aventura (después de poner nombre al equipo).

**P-1 · La voz** *(fondo negro, sin retratos)*

- **???** — …¿Me oyes?
- **???** — He preguntado a las piedras, a los árboles y al viento. Nadie contesta. Tú sí.
- **???** — Tus respuestas dicen quién eres. Así serás aquí.
- **???** — Ahora… una última pregunta. ¿Te…
- *Narración* — La voz se deshace en una ráfaga fría antes de terminar.

**P-2 · El camino del sur** *(ya en el pueblo, junto a la salida)*

- *Narración* — Huele a hierba mojada. Alguien te zarandea.
- **{compañero}** · *Worried* — ¡Eh! ¡Eh! ¿Me oyes? ¡Abre los ojos!
- **{compañero}** · *Happy* — ¡Uf, menos mal! Estabas en mitad del camino, sin moverte. Creía que te había tirado el viento.
- **{héroe}** · *Surprised* — (Este cuerpo… no es el mío. Ayer era una persona. Lo último que recuerdo es una voz que hacía preguntas.)
- **{héroe}** · *Worried* — Yo no… no soy un Pokémon. Soy una persona. Del mundo de los humanos.
- **{compañero}** · *Surprised* — ¿De los humanos? ¿Como en los cuentos de los mayores?
- **{compañero}** · *Normal* — Pues para venir de un cuento, tienes una pinta de {héroe} impresionante.
- **{compañero}** · *Happy* — Tranquilidad. Si dices que eres una persona, te creo. Hoy todo es raro, así que una cosa rara más no me asusta.
- **{compañero}** · *Sad* — Vengo de Aldea Musgo, al este. Hace tres noches, el suelo se retorció y la aldea se convirtió en un laberinto que cambia de forma. Una mazmorra.
- **{compañero}** · *Sad* — En la aldea salimos corriendo, cada cual por su lado. Yo seguí el camino hasta aquí.
- **{compañero}** · *Determined* — Dicen que en Pueblo Raíz estaba el mejor equipo de exploración de la región. Si alguien sabe qué pasa, estará aquí.
- *Narración* — Baja del norte una ráfaga de viento. Por un momento, parece que habla.
- **{compañero}** · *Worried* — ¿Lo has oído? Desde que salí de casa, el viento suena así. Como alguien que llama desde muy lejos.
- **{héroe}** · *Worried* — (Es la misma voz. La de las preguntas.)

**P-3 · Pueblo Raíz**

- **Pidgey** · *Shouting* — ¡Eh, gente de fuera! ¡Esperad! ¿Venís a explorar? ¡Decid que sí, por favor!
- **{compañero}** · *Surprised* — Buscábamos al equipo de exploración del pueblo…
- **Pidgey** · *Sad* — Ya no hay. El último, el Equipo Centella, se fue al norte hace diez años. Yo ni había salido del huevo. Nadie habla mucho de aquello.
- **Pidgey** · *Teary-Eyed* — Mi hermana Pidgeotto reparte el correo entre los pueblos. Hace cuatro días entró en el Bosque Verde y no ha vuelto a salir.
- **Pidgey** · *Worried* — Desde que sopla el viento del norte, el bosque cambia cada mañana. Nadie se atreve a entrar.
- **{compañero}** · *Determined* — Entraremos.
- **{compañero}** · *Happy* — ¿Verdad? Tú no sabes adónde ir y yo no tengo adónde volver. Podríamos unir fuerzas. Un equipo de verdad.
- **{compañero}** · *Joyous* — ¡Desde hoy somos el {equipo}! Y a partir de ahora: ganar, ganar y volver a ganar.
- **Pidgey** · *Joyous* — ¡Gracias, gracias, gracias! La base del Equipo Centella está vacía: es vuestra.
- **Pidgey** · *Happy* — Kecleon vende provisiones. Kangaskhan os guarda lo que no queráis llevar encima. En el tablón irán saliendo encargos de los vecinos. Y Persian os guarda el dinero… y os lo recuerda.
- **Persian** · *Normal* — Un equipo de exploración. Qué romántico. Y qué caro. Cuando os quedéis sin Poké, ya sabéis dónde está el banco. Hacienda somos todos, pero el banco soy yo.
- **{compañero}** · *Normal* — Perdona, ¿por dónde se va al Bosque Verde?
- **Slowpoke** · *Normal* — ……
- **Slowpoke** · *Normal* — …Manzanas traigo.
- **Pidgey** · *Sigh* — No le hagáis caso. Slowpoke vive en Babia.
- **Slowpoke** · *Normal* — …Hace mucho tiempo…
- *Narración* — Slowpoke se ha dormido.
- **Pidgey** · *Determined* — El Bosque Verde está saliendo por el camino del sur. ¡Traed a mi hermana!

---

### Capítulo 1 · «La cartera perdida» · Bosque Verde (pisos 1-5)

Jefe: **Pidgeotto** (nuevo; propuesta: nivel 6 en el piso 5). El Eco le provoca confusión.

**1-B · Entrada**

- **{compañero}** · *Worried* — Así que esto es una mazmorra… Los árboles no están donde deberían y las escaleras se esconden.
- **{compañero}** · *Determined* — En Aldea Musgo decían que las mazmorras no quieren visitas: si te quedas mucho en el mismo piso, el viento te echa a empujones. ¡No nos entretengamos!

**1-C · Antes del jefe (piso 5)**

- *Narración* — Una silueta cae de las ramas y abre las alas. Tiene los ojos turbios, como quien sueña con los ojos abiertos.
- **{compañero}** · *Surprised* — ¿Pidgeotto? ¡Tu hermana te está buscando!
- **Pidgeotto** · *Worried* — ¿Quién eres? …No. ¿Quién soy yo? ¿Quién eres tú? ¿¡QUIÉN ERES!?
- **{héroe}** · *Worried* — (Esa pregunta… Es la de la voz.)

**1-D · Después del jefe**

- **Pidgeotto** · *Worried* — ¿Quién eres…? ¿Quién eres…?
- **{héroe}** · *Determined* — Soy {héroe}. Y tú eres Pidgeotto, la hermana de Pidgey. Te está esperando.
- *Narración* — La niebla de sus ojos se deshace, como si alguien hubiera abierto una ventana.
- **Pidgeotto** · *Worried* — Ugh… ¿Dónde…? Estaba repartiendo cartas y el viento empezó a hablarme. Preguntaba y preguntaba… y al final ni yo sabía quién era.
- **Pidgeotto** · *Normal* — Más perdida que un pulpo en un garaje, vamos.
- **{compañero}** · *Surprised* — ¿Cómo has hecho eso?
- **{héroe}** · *Worried* — (No lo sé. Solo he contestado a su pregunta.)
- **{compañero}** · *Happy* — Pidgey te espera en el pueblo.
- **Pidgeotto** · *Normal* — Mi hermana… Sí. Vamos a casa.

**1-E · De vuelta**

- **Pidgey** · *Joyous* — ¡¡Hermana!!
- **Pidgeotto** · *Normal* — Gracias, {equipo}. Os debo las alas.
- **Pidgeotto** · *Worried* — El viento que baja del norte no es normal. Lleva una voz dentro, y si la escuchas mucho rato, se te mete en la cabeza.
- **Pidgeotto** · *Normal* — Desde el cielo se ve de dónde viene: de más allá de la Cueva Oscura, de las montañas.
- **Pidgeotto** · *Normal* — Y siempre baja hacia el sur, hasta este valle, y aquí se cansa. Por eso aquí acaba todo lo que arrastra: hojas, cartas… y gente de fuera.
- **{héroe}** · *Worried* — (Gente de fuera… Como yo.)
- **Pidgeotto** · *Normal* — Y otra cosa: si alguna vez caéis ahí dentro, os traeré de vuelta. Es lo mínimo.
- **Kecleon** · *Shouting* — ¡Ruina! ¡Desastre! ¡Mis carros no llegan! ¡Esto es peor que la operación salida!
- **Kecleon** · *Worried* — Un Onix se ha tumbado en la salida de la Cueva Oscura y no deja pasar a nadie. Sin carros, la tienda se queda en cuatro manzanas y una baya mordida.
- **Kecleon** · *Happy* — Tenéis cara de valientes. ¡Y de clientes! Si abrís el paso, os lo agradeceré con mi mejor sonrisa comercial.
- **{compañero}** · *Determined* — La voz viene del norte, y la cueva es el camino al norte. ¡Vamos!

---

### Capítulo 2 · «Nadie entra, nadie sale» · Cueva Oscura (pisos 6-10)

Jefe: **Onix**. No está bajo el Eco: tapa la salida para que el viento no asuste a los pequeños de la cueva, y cree que el equipo trae la voz. El enemigo de verdad es el viento, y es el protagonista quien le planta cara.

**2-B · Entrada**

- **{compañero}** · *Worried* — Qué oscuro… Quédate cerca. No es que tenga miedo, ¿eh? Es por si lo tienes tú.
- **{héroe}** · *Normal* — (Aquí abajo la voz del viento se oye más fuerte. Viene del fondo, de arriba. Podría seguirla.)
- **{héroe}** · *Determined* — Por aquí.
- **{compañero}** · *Surprised* — ¿Cómo sabes por dónde se va? …Bueno, da igual. Yo sigo a quien sabe.

**2-C · Antes del jefe (piso 10)**

- *Narración* — La salida de la cueva está tapada por una montaña de roca. La montaña respira. Detrás, muy pegados a ella, tiemblan unos cuantos Pokémon pequeños.
- **Onix** · *Normal* — Fuera. Por esa salida entra el viento que habla, y los pequeños no pueden dormir. Nadie entra. Nadie sale.
- **{compañero}** · *Surprised* — ¡Solo queremos cruzar! Buscamos de dónde sale esa voz.
- **Onix** · *Normal* — Todo lo que viene de fuera trae la voz. Si os dejo pasar, la voz entrará detrás. No.
- **{compañero}** · *Determined* — Pues nada… ¡al ataquer!

**2-D · Después del jefe**

- **Onix** · *Surprised* — Uf… Me he movido. ¡Me he movido! La salida…
- *Narración* — Por el hueco entra una ráfaga helada. Los pequeños chillan. La cueva se llena de susurros: «¿Por qué se van todos? ¿Por qué nadie se queda?».
- **{compañero}** · *Worried* — ¡{héroe}! ¿Qué haces? ¡No te pongas delante!
- **{héroe}** · *Determined* — ¡Te oigo! ¡Te he oído desde el principio! ¡Ya vamos, pero déjalos en paz!
- *Narración* — El viento se detiene en seco. Durante un momento parece que escucha. Luego se retira por donde ha venido, despacio, como quien no quiere molestar.
- **Onix** · *Surprised* — …Nadie le había contestado nunca. Solo le tapábamos la boca.
- **Onix** · *Normal* — Esta cueva antes era una cueva. Desde que sopla ese viento, cada mañana es otra, como si alguien la soñara distinta cada noche.
- **{compañero}** · *Sad* — Igual que Aldea Musgo… Las casas amanecían cada día en otro sitio.
- **Onix** · *Normal* — La voz baja de arriba: de la Ruta Eléctrica y de más allá. Si de verdad podéis hablar con ella, pasad. El camino queda abierto. Para todos.

**2-E · De vuelta**

- **Kecleon** · *Joyous* — ¡Han llegado los carros! ¡Mercancía fresca! ¡Sois mi clientela favorita! Bueno, sois mi única clientela, pero lo digo igual.
- **Kecleon** · *Happy* — Para celebrarlo: ¿un monstersito o quéee? …Es un Elixir Máx., pero dicho así vende más.
- **Kecleon** · *Normal* — Y los carreteros traen noticias: en la Ruta Eléctrica hay una Raichu que ataca a todo el que pasa. Dicen que fue exploradora. De un equipo famoso. De aquí.
- **{compañero}** · *Sigh* — Primero un Onix y ahora una Raichu. De Guatemala a Guatepeor.
- **{compañero}** · *Surprised* — Espera… ¿Un equipo de aquí? ¿Del Equipo Centella?
- **Pidgey** · *Surprised* — ¡Persian! Tú conocías al Equipo Centella, ¿no?
- **Persian** · *Angry* — Conozco a mucha gente. Casi toda me debe dinero. Id a esa ruta si queréis, pero no volváis contando historias.
- **{compañero}** · *Worried* — …¿Has visto qué cara ha puesto? Aquí hay algo.

---

### Capítulo 3 · «Carta sin remite» · Ruta Eléctrica (pisos 11-15)

Jefe: **Raichu**. El Eco le aviva la rabia por el abandono. Este capítulo empieza en el tablón: alguien ha colgado sin firmar un encargo de entrega para Raichu. Es Persian, que quiere que deje pasar al equipo y que vuelva a casa, pero no se atreve a decirlo en persona.

**3-A · El sobre del tablón** *(la primera vez que se mira el tablón en este capítulo)*

- *Narración* — Entre los encargos del día hay un sobre cerrado, sin remite. Huele a perfume caro.
- **Pidgey** · *Surprised* — Esto no lo he colgado yo. Apareció anoche. Y el clavo tiene marcas de garras.
- *Narración* — «Entrega: llevad este sobre a Raichu, al final de la Ruta Eléctrica. No lo abráis. Pago: generoso.»
- **{compañero}** · *Normal* — Perfume caro, marcas de garras y pago generoso… ¿Quién podrá ser?
- **{héroe}** · *Sigh* — (Tengo una ligera sospecha.)
- **Pidgey** · *Happy* — ¡Encargo apuntado! Suerte en la ruta.

**3-B · Entrada**

- **{compañero}** · *Surprised* — ¡Hasta el aire da calambre! Y mira el cielo: caen rayos y no hay ni una nube.
- **{compañero}** · *Worried* — ¿Y si abrimos el sobre? Solo un poquito. Por la esquina.
- **{héroe}** · *Normal* — No.
- **{compañero}** · *Sigh* — Ya. Yo tampoco. Era por decir algo.

**3-C · Antes del jefe (piso 15)**

- *Narración* — Los relámpagos caen en círculo. En el centro, una Raichu echa chispas por las mejillas.
- **Raichu** · *Angry* — Venís de Pueblo Raíz. Lo huelo: a pan recién hecho y a promesas rotas.
- **Raichu** · *Angry* — ¿Sabéis quién soy yo? ¿Eh? ¿Lo sabéis?
- **{héroe}** · *Sigh* — (Primero «¿quién eres?» y ahora «¿sabéis quién soy yo?». En este mundo nadie sabe quién es nadie.)
- **{compañero}** · *Normal* — Traemos un sobre para ti.
- **Raichu** · *Shouting* — ¡Diez años sin una carta y ahora me mandan un sobre! ¡Nadie vino a buscarnos! ¡NADIE!
- **{héroe}** · *Worried* — (Debajo de los truenos se oye la voz del viento. No está enfadada con el equipo. Está esperando a que venga alguien.)
- **Raichu** · *Angry* — ¡Pagaréis por los que no vinieron!

**3-D · Después del jefe**

- **Raichu** · *Pain* — Ay… Hacía diez años que nadie me ganaba. Quien tuvo, retuvo… pero se ve que no tanto.
- **{héroe}** · *Determined* — Ya ha venido alguien. Aquí estamos.
- *Narración* — Los rayos dejan de caer. El cielo, por fin, se queda quieto.
- **Raichu** · *Sad* — La tormenta no era solo mía. El viento me gritaba por dentro, y yo ya tenía rabia de sobra guardada. Entre las dos la liamos parda.
- **Raichu** · *Normal* — A ver ese sobre…
- *Narración* — Dentro hay una sola línea: «El tablón vuelve a tener equipo. Déjales pasar. Y vuelve a casa, cabezota».
- **Raichu** · *Surprised* — Esta letra… Estas garras en el papel… ¡Persian!
- **Raichu** · *Normal* — Fui del Equipo Centella: Arcanine, Persian y yo. Fuimos al norte, al laboratorio de los Antiguos, porque de allí salía una luz. Dentro dormía alguien. Lo despertamos a medias… y el viento nos barrió.
- **Raichu** · *Sad* — Aparecí aquí, sin fuerzas. Esperé a que alguien viniera. No vino nadie. Y después me dio vergüenza volver.
- **Raichu** · *Teary-Eyed* — Y ahora me escribe «vuelve a casa». Diez años después. Con sello de urgente.
- **Raichu** · *Determined* — Si queréis respuestas, subid al Monte Lunar: Clefable nos vio pasar aquella noche. Y a Persian decidle que me lo pienso. Y que me explique por qué nadie vino a buscarnos.

**3-E · De vuelta**

- **Persian** · *Normal* — ¿Qué tal la ruta? No es que me importe. Es por el banco.
- **{compañero}** · *Normal* — Hemos entregado el sobre.
- **Persian** · *Surprised* — ¿Qué sobre? Yo no sé nada de ningún sobre.
- **{compañero}** · *Normal* — Raichu ha reconocido tu letra. Y tus garras.
- **Persian** · *Worried* — …¿Y qué ha dicho?
- **{compañero}** · *Normal* — Que se lo piensa. Y que le expliques por qué nadie fue a buscar al Equipo Centella.
- **Persian** · *Angry* — El banco cierra. Vuelva usted mañana.
- *Narración* — Persian se da la vuelta. Tarda mucho en entrar.
- **Slowpoke** · *Normal* — …Persian llora a veces… por las noches… detrás del banco.
- **Slowpoke** · *Sigh* — …Yo me duermo a mitad de todo… pero siempre me despierto justo a tiempo de oírla.
- **{compañero}** · *Sad* — …Mañana subiremos al Monte Lunar.

---

### Capítulo 4 · «Lo que dice la luna» · Monte Lunar (pisos 16-20)

Jefe: **Clefable** (es el jefe que ya figura en `floors.json`). No está bajo el Eco: es una prueba.

**4-B · Entrada**

- **{compañero}** · *Inspired* — Mira qué luna. Nunca la había visto tan cerca.
- **{compañero}** · *Worried* — Aquí el viento suena distinto. Más triste.

**4-C · Antes del jefe (piso 20)**

- *Narración* — En la cumbre, bajo la luna llena, una Clefable espera. Sus ojos están claros: sabía que ibais a venir.
- **Clefable** · *Normal* — Por fin, {equipo}. La luna me habló de vuestro equipo. Bueno, la luna y Pidgeotto, que sube el correo hasta aquí.
- **Clefable** · *Normal* — Y de ti, que hueles a otro cielo. No naciste en este mundo, ¿verdad? Y el viento te hace caso. Eso tampoco es de aquí.
- **{héroe}** · *Surprised* — ¿Sabes qué me pasó?
- **Clefable** · *Determined* — Lo sé. Pero la verdad pesa, y solo se la doy a quien puede cargarla. La última vez que alguien subió a preguntarme fue el Equipo Centella, y no escuchó. Veamos si este equipo sí. En guardia.

**4-D · Después del jefe**

- **Clefable** · *Happy* — Bien. Podéis cargarla.
- **Clefable** · *Normal* — Slowpoke ya os habrá contado lo de los Antiguos: seres sin cola que hacían casas de piedra. …Bueno, os habrá contado la mitad y se habrá dormido. Eran humanos, como tú.
- **Clefable** · *Normal* — Al norte, pasado el volcán, levantaron un laboratorio. Allí hicieron nacer a alguien y, al marcharse, lo dejaron dormido. Sus sueños son estas mazmorras. Ahora está despertando.
- **Clefable** · *Worried* — Y su pregunta ha crecido tanto que ha cruzado de un mundo a otro: «¿Quién eres?». Tú la oíste y contestaste. Por eso tienes esta forma, y por eso el Eco te escucha cuando le hablas.
- **{héroe}** · *Worried* — ¿Y por qué a mí?
- **Clefable** · *Sigh* — Quizá porque fuiste la única persona que se paró a contestar.
- **Clefable** · *Normal* — Y tu aldea, {compañero}, no se ha perdido. Está dentro de un sueño. Cuando quien sueña se calme, despertará con él.
- **{compañero}** · *Teary-Eyed* — …¿De verdad?
- **Clefable** · *Worried* — Una cosa más. En las Profundidades Oscuras hay alguien que se alimenta de pesadillas. Y últimamente come muchísimo.

**4-E · De vuelta**

- **Pidgey** · *Shouting* — ¡Bombazo! ¡Slowpoke ha desaparecido!
- **Kangaskhan** · *Worried* — Lleva treinta años sentado en el mismo sitio. Treinta. Y esta mañana el sitio estaba vacío.
- **Pidgey** · *Worried* — Anoche vi una sombra que se lo llevaba hacia las Profundidades Oscuras. ¡Una sombra que se reía! ¡Te lo juro por Snoopy!
- **Kecleon** · *Normal* — ¿Seguro que no se ha ido a dar un paseo? Es capaz de volver dentro de un mes contando batallitas, como el abuelo Cebolleta.
- **Kangaskhan** · *Angry* — Kecleon. Un poquito de por favor.
- **Kecleon** · *Sigh* — Vale, vale… Os deseo muchísima suerte. Es lo más valiente que sé hacer.
- **{compañero}** · *Determined* — Alguien que come pesadillas… Lo que dijo Clefable. ¡A las Profundidades Oscuras!

---

### Capítulo 5 · «La despensa de Gengar» · Profundidades Oscuras (pisos 21-30)

Jefe: **Gengar**. No está bajo el Eco: se aprovecha de él. **Slowpoke no está en el pueblo durante este capítulo.**

**5-B · Entrada**

- **{compañero}** · *Worried* — No veo ni dónde piso. Y el viento aquí no habla… se ríe.
- **{héroe}** · *Determined* — (Debajo de la risa hay otra cosa: un sueño lentísimo, que avanza una palabra cada mucho rato. Es Slowpoke. Puedo seguirlo.)

**5-B2 · Piso 25** *(opcional)*

- **???** — Ji, ji, ji… Qué valientes. ¿Tenéis miedo? Decid que sí. Me encanta el miedo recién hecho.

**5-C · Antes del jefe (piso 30)**

- *Narración* — Al fondo, Slowpoke duerme flotando sobre una nube de humo morado. A su lado, en la oscuridad, se abre una sonrisa enorme.
- **Gengar** · *Happy* — ¡Pasad, pasad a mi despensa! ¿Sabéis lo difícil que es encontrar a alguien con pesadillas tan largas? ¡Este tarda tres días en tener un mal sueño! ¡Esto es Jauja!
- **Gengar** · *Surprised* — ¿Y tú cómo has llegado hasta aquí sin perderte? …¿Oyes los sueños? ¡Qué envidia!
- **Gengar** · *Happy* — Desde que ese del norte empezó a soñar en voz alta, todo el valle tiene pesadillas. Nunca había comido tan bien.
- **{compañero}** · *Angry* — ¡Suelta a Slowpoke!
- **Gengar** · *Angry* — ¿Y volver a pasar hambre? Ni hablar. Si el del laboratorio despierta del todo, la noche no acabará nunca… ¡y la noche es mía!

**5-D · Después del jefe**

- **Gengar** · *Pain* — ¡Ay, ay, ay! Vale, vale. Quedaos con el lento. Ya encontraré otra despensa.
- **Gengar** · *Happy* — Pero cuando lleguéis al laboratorio, acordaos de mí: allí dentro hay pesadillas que ni yo me atrevo a probar. ¡Hasta luego, Lucas!
- *Narración* — La sonrisa se apaga en la oscuridad.
- **Slowpoke** · *Normal* — ……
- **Slowpoke** · *Normal* — …¿Eh? Ah. Hola. …¿Ya es de día?
- **{compañero}** · *Joyous* — ¡Slowpoke! ¿Estás bien?
- **Slowpoke** · *Normal* — He tenido un sueño muy largo… Salía un perro de fuego… en una isla que echaba humo… y decía todo el rato: «Nadie pasa».
- **Slowpoke** · *Sigh* — Y yo pensaba… qué aburrido, decir siempre lo mismo.
- **Slowpoke** · *Happy* — …Tengo más hambre que un caracol en un espejo. ¿Volvemos?

**5-E · De vuelta**

- **Kangaskhan** · *Joyous* — ¡Slowpoke! Ven aquí, que te he guardado el sitio. Literalmente: no he dejado que nadie se siente.
- **Slowpoke** · *Happy* — …Gracias.
- **Slowpoke** · *Normal* — Por cierto… en el sueño… el perro de fuego… llevaba un pañuelo con un rayo… y preguntaba por Persian.
- **Persian** · *Surprised* — ¿Qué has dicho?
- **Persian** · *Sad* — …Arcanine. Sigue allí. Diez años, y ese cabezota sigue allí.
- **Persian** · *Determined* — Id a la Isla Volcánica. No le hagáis daño. …Bueno, un poco sí. Si no, no escucha.

---

### Capítulo 6 · «Diez años de guardia» · Isla Volcánica (pisos 31-40)

Jefe: **Arcanine**. No está bajo el Eco: cumple una promesa.

**6-B · Entrada**

- **{compañero}** · *Worried* — Qué calor… Y el viento sopla hacia atrás, como si no quisiera que llegáramos arriba.

**6-C · Antes del jefe (piso 40)**

- *Narración* — En la cima, entre la ceniza, un Arcanine enorme os corta el paso. Lleva al cuello un pañuelo quemado con un rayo bordado.
- **Arcanine** · *Normal* — Hasta aquí. Detrás de esta montaña está el laboratorio. Nadie pasa. Hace diez años que nadie pasa.
- **{compañero}** · *Determined* — Venimos de Pueblo Raíz. Raichu nos habló de ti. Y Persian.
- **Arcanine** · *Surprised* — …Persian.
- **Arcanine** · *Determined* — Entonces sabéis lo que hay ahí dentro, y aun así queréis entrar. Lo siento. Hice una promesa. Si queréis pasar, tendréis que pasar por encima de mí.

**6-D · Después del jefe**

- **Arcanine** · *Pain* — …Sois fuertes. Más que nosotros entonces.
- **Arcanine** · *Surprised* — Y el viento se aparta a tu paso, {héroe}. A nosotros nos tiraba al suelo.
- **Arcanine** · *Sad* — Os contaré lo que Persian no os ha contado. Aquella noche lo despertamos. No era un monstruo: era alguien que abría los ojos por primera vez y se encontraba a tres desconocidos enseñando los dientes.
- **Arcanine** · *Sad* — Se asustó. Y el miedo de alguien tan fuerte es una tormenta. Raichu salió volando hacia el sur. A Persian le grité que corriera al pueblo a avisar. Yo me quedé aquí, para que nadie más volviera a asustarlo.
- **Arcanine** · *Normal* — Persian hizo lo que le pedí. Luego quiso volver a por nosotros, pero el viento no la dejó pasar de la cueva. Me temo que nunca se lo ha perdonado.
- **Arcanine** · *Determined* — Decidle que no fue culpa suya. …Y que su parte del último botín sigue siendo suya.
- **Arcanine** · *Normal* — Y si vais a entrar, no hagáis lo que hicimos. No entréis para vencerlo. Entrad para escucharlo.

**6-E · De vuelta**

- **Persian** · *Normal* — Lo habéis visto. Se os nota en la cara.
- **{compañero}** · *Normal* — Dice que no fue culpa tuya.
- **Persian** · *Teary-Eyed* — …Ese perro cabezota.
- **Persian** · *Sad* — Corrí. Corrí tanto que no paré hasta aquí. Y cuando quise volver, el viento de la cueva me tiraba al suelo una y otra vez. Así que me quedé.
- **Persian** · *Sad* — Y abrí un banco. ¿Sabéis por qué? Porque aquí lo que se guarda no se pierde. Aunque el equipo caiga, aunque el viento se lo lleve todo, lo que me dejáis sigue aquí cuando volvéis.
- **{compañero}** · *Sad* — Lo que se guarda no se pierde… Ojalá valga también para Aldea Musgo.
- **Persian** · *Normal* — Vale para todo lo que alguien se niega a dar por perdido. Hazme caso.
- **Persian** · *Determined* — Kangaskhan. Abre la caja.
- **Kangaskhan** · *Surprised* — ¿La del Equipo Centella? Lleva diez años cerrada. Nunca quisiste ni mirarla.
- **Kangaskhan** · *Normal* — …Aquí está. Un mapa del laboratorio, dibujado por Raichu. Y una nota.
- *Narración* — La nota dice: «Si alguien encuentra esto, que vuelva a casa antes de que anochezca. — Equipo Centella».
- **Persian** · *Happy* — Llevaos el mapa. Y volved antes de que anochezca. Es una orden del banco.

---

### Capítulo 7 · «¿Te quedarías?» · Laboratorio Final (pisos 41-50)

Jefe: **Mewtwo**. Es el origen del Eco: la soledad.

**7-A · La víspera** *(en el pueblo, al elegir el Laboratorio Final por primera vez, antes de entrar)*

- **Kecleon** · *Happy* — ¿Ya os vais? Cuando volváis, tiro la casa por la ventana: os invito a una manzana. Una. No se lo digáis a nadie, que tengo una reputación.
- **Kangaskhan** · *Worried* — Lo que dejéis aquí seguirá aquí. Pero lo que más quiero es que volváis, ¿me oís?
- **Pidgeotto** · *Normal* — Si caéis, os traeremos. Pero mejor no caigáis.
- **Slowpoke** · *Normal* — Suerte.
- **Pidgey** · *Surprised* — ¿¡Slowpoke ha dicho algo a la primera!?
- **Persian** · *Normal* — Antes de que anochezca.

**7-B · Entrada**

- **{compañero}** · *Worried* — Paredes lisas, luces que parpadean solas… Los Antiguos construían cosas muy raras.
- **{héroe}** · *Normal* — (No son raras. En mi mundo hay sitios así.)
- **{compañero}** · *Worried* — Aquí el viento no sopla. Respira.

**7-B2 · Piso 45** *(opcional)*

- **???** — ¿Quién eres?
- **{héroe}** · *Determined* — (Ahora la oigo clara. Está cerca.)

**7-C · Antes del jefe (piso 50)**

- *Narración* — En el centro de la última sala hay una cápsula de cristal rota. Sobre ella flota alguien que os mira sin parpadear.
- **Mewtwo** · *Normal* — Otra vez. Otra vez entran desconocidos en mi casa.
- **Mewtwo** · *Surprised* — …Tú. Te conozco. Tú contestaste.
- **Mewtwo** · *Angry* — Pregunté durante semanas y todos huían. Tú contestaste… y te fuiste con otros.
- **{compañero}** · *Determined* — ¡No venimos a pelear! Venimos a…
- **Mewtwo** · *Shouting* — ¡Eso dijeron los otros antes de enseñar los dientes!
- **{héroe}** · *Determined* — ¡Te oigo! ¡Te he oído desde el principio!
- *Narración* — Por primera vez, el viento no hace caso. El aire se parte en dos. No se puede escuchar a quien no para de gritar. Todavía no.

**7-D · Después del jefe**

- **Mewtwo** · *Pain* — …¿Por qué? El viento os empuja, os tira, os arrastra fuera. Y volvéis. Siempre volvéis. ¿Por qué?
- **{compañero}** · *Normal* — Porque tenemos adónde volver.
- **Mewtwo** · *Sad* — Yo no. Cuando abrí los ojos, aquí no había nadie. Solo cristal y silencio. Así que pregunté «¿quién eres?», por si alguien contestaba y así sabía yo quién era.
- **{héroe}** · *Determined* — La primera noche no terminaste la pregunta.
- **Mewtwo** · *Sad* — …No. Esa me daba miedo.
- **Mewtwo** · *Teary-Eyed* — «¿Te quedarías?».
- *Narración* — Por primera vez en semanas, el viento se calla.
- **{compañero}** · *Happy* — Aquí no nos podemos quedar: hace un frío horrible y las luces dan dolor de cabeza. Pero en Pueblo Raíz hay sitio. Slowpoke te deja su banco de la plaza. Si le das tres días para levantarse.
- **Mewtwo** · *Normal* — …Todavía no sé estar con otros. Os haría daño sin querer.
- **Mewtwo** · *Determined* — Pero puedo dejar de gritar. Recogeré el Eco. Quien lo oía volverá a dormir tranquilo. Las mazmorras seguirán ahí: son sueños viejos, y los sueños no se borran. Pero ya no hablarán.
- **{compañero}** · *Worried* — ¿Y los sitios que se tragó el sueño? ¿Aldea Musgo?
- **Mewtwo** · *Normal* — Despertarán conmigo. Ya no hace falta que nadie se pierda para que yo no esté a solas.
- **Mewtwo** · *Normal* — Y a ti te traje sin querer. Hay una puerta de vuelta a tu mundo. Solo se abre desde dentro: cuando de verdad quieras irte.
- **{héroe}** · *Normal* — (Miro a {compañero}. No dice nada. Tampoco se aparta de mi lado.)
- **{héroe}** · *Normal* — Todavía no.
- **Mewtwo** · *Happy* — Entonces la puerta esperará. Se me da bien esperar.
- **Mewtwo** · *Normal* — Una cosa más. Con lo que queda del Eco levantaré una torre: cincuenta pisos hechos de todos mis sueños. Si algún día queréis saber hasta dónde llegáis, subid. Arriba estaré.

---

### Final · «Antes de que anochezca»

**F-1 · De vuelta** *(sustituye a la escena E del capítulo 7)*

- *Narración* — Esa noche, el viento del norte deja de hablar. En todo el valle, muchos Pokémon duermen del tirón por primera vez en semanas.
- **Pidgey** · *Joyous* — ¡Han vuelto! ¡Y antes de que anochezca!
- **Persian** · *Happy* — Por los pelos. El banco toma nota.
- **Kangaskhan** · *Joyous* — Todo el mundo adentro, que hay tortilla.
- **Kecleon** · *Surprised* — ¿Con cebolla o sin cebolla?
- **Kangaskhan** · *Determined* — Con cebolla.
- **Kecleon** · *Shouting* — ¿¡CON CEBOLLA!?
- **Slowpoke** · *Normal* — …Yo sin. …Bueno, con. …Me da igual, tengo hambre.
- **Pidgey** · *Happy* — ¡Y mañana, fiesta en la plaza! Id a dormir, que hay que madrugar.

**F-2 · Epílogo** *(al día siguiente: al dormir en la base o al volver de la siguiente expedición)*

- **Pidgeotto** · *Normal* — ¡Correo! Una carta para {compañero}. Viene de Aldea Musgo.
- *Narración* — «La aldea vuelve a ser la aldea. Estamos todos bien. ¿Se puede saber dónde te has metido?»
- **{compañero}** · *Crying* — ¡Están bien! ¡Están bien de verdad!
- **{compañero}** · *Happy* — Iré a verlos. Pero volveré. Ahora esta también es mi casa. Aquí está mi equipo.
- **Raichu** · *Happy* — ¿Qué pasa aquí? ¿Hay fiesta y nadie me avisa?
- **Persian** · *Surprised* — ¿Raichu? ¿Ahora? ¿Y yo con estos pelos?
- **Arcanine** · *Happy* — Diez años tarde. Pero antes de que anochezca.
- **Persian** · *Teary-Eyed* — A buenas horas, mangas verdes. …Os he guardado vuestra parte del botín. Con intereses.
- **Pidgeotto** · *Normal* — Traigo más recados: Onix dice que la cueva queda abierta para quien quiera pasar. Y Clefable, que la luna os manda saludos.
- **Slowpoke** · *Normal* — …Hace mucho tiempo… en este valle… vivían los Antiguos… …que dejaron a alguien dormido en el norte… …que tenía miedo de quedarse sin nadie… …y un equipo muy joven fue a hacerle compañía.
- **Slowpoke** · *Happy* — …Fin.
- **Slowpoke** · *Surprised* — …Ah. Ya sabíais cómo acababa. Claro: lo habéis vivido.

**F-3 · Esa noche**

- *Narración* — Esa noche, junto a la base.
- **{compañero}** · *Normal* — Oye… ¿Echas de menos tu mundo?
- **{héroe}** · *Normal* — A veces.
- **{compañero}** · *Sad* — Si algún día te vas, dímelo antes. No quiero una despedida por carta.
- **{compañero}** · *Happy* — Y si te quedas… mañana hay encargos nuevos en el tablón.
- **{héroe}** · *Happy* — Mañana, entonces.
- *Narración* — Y en lo alto de una torre nueva, lejos al norte, alguien mira hacia Pueblo Raíz. Por primera vez, no pregunta nada.

**Créditos** (pantalla que va pasando sola)

1. «El Eco del Norte», una historia original de PokéRogue.
2. Guion y desarrollo: *(el nombre que quieras poner)*.
3. El aviso de juego de fans que ya está en `CreditsMenu` (Pokémon © Nintendo, Creatures Inc. y GAME FREAK inc.; Pokémon Mundo Misterioso es de Spike Chunsoft).
4. Sprites y retratos: PMDCollab, con la lista de artistas y la licencia CC BY-NC 4.0. **La licencia obliga a incluirlos**, así que se reutiliza lo que ya hay en `CreditsMenu`.
5. Motor y recursos: rot-js, Press Start 2P y el sonido sintetizado.
6. «Gracias por jugar».

**F-4 · Tras los créditos** *(después, el juego vuelve al pueblo y se sigue jugando)*

- **Mewtwo** · *Normal* — Cincuenta pisos. Sin ascensor. Os espero arriba.
- *Narración* — La Torre del Desafío os espera al norte.

---

## 6. Qué dicen los vecinos en cada capítulo

Son frases para cuando hablas con ellos. Las de Slowpoke y Pidgey sustituyen a las actuales, que se pueden seguir alternando como consejos. Las de Kecleon, Kangaskhan y Persian salen la primera vez que les hablas en cada capítulo, antes de abrir su menú. Las casillas con «—» mantienen el comportamiento actual.

**Slowpoke.** Es el chiste recurrente: en cada capítulo empieza la misma historia y llega un poco más lejos.

| Cap. | Frase |
|---|---|
| 1 | …Hace mucho tiempo… *(Se ha dormido.)* |
| 2 | …Hace mucho tiempo… en este valle… *(Se ha dormido.)* |
| 3 | …Hace mucho tiempo… en este valle… vivían unos seres… sin cola. *(Se ha dormido.)* |
| 4 | …Hace mucho tiempo… en este valle… vivían unos seres sin cola… que hacían casas de piedra… *(Se ha dormido.)* |
| 5 | *(No está en el pueblo.)* |
| 6 | …Hace mucho tiempo… en este valle… vivían unos seres sin cola… que hacían casas de piedra… y una muy grande… en el norte… *(Se ha dormido.)* |
| 7 | …y dentro… dejaron a alguien… …Ya casi estoy. |
| Después | …¿Otra vez? Vísteme despacio, que tengo prisa… Hace mucho tiempo… *(Se ha dormido.)* |

**Pidgey**

| Cap. | Frase |
|---|---|
| 1 | Por favor, traed a mi hermana. El Bosque Verde está saliendo por el camino del sur. |
| 2 | ¡Mi hermana vuelve a repartir el correo! Yo me encargo del tablón: cuantos más encargos cumpláis, más sube el rango del equipo. |
| 3 | Ojo al dato: en la Ruta Eléctrica caen rayos sin nubes. ¡Llevad Bayas Aranja de sobra! |
| 4 | Persian lleva días sin cobrarle intereses a nadie. Eso es muy mala señal. |
| 5 | ¡Vi la sombra! ¡Se reía! ¡Traed a Slowpoke, por favor! |
| 6 | De mayor quiero explorar como el {equipo}. Pidgeotto dice que antes tengo que aprender a volar en línea recta. |
| 7 | Pase lo que pase ahí dentro, mañana a primera hora sale el correo, que al que madruga, Pidgey le ayuda. Así que tenéis que estar aquí para recibirlo. ¿Entendido? |
| Después | ¿Habéis visto la torre nueva del norte? Pidgeotto intentó volar hasta arriba y no le vio el final. |

**Kecleon, Kangaskhan y Persian** *(antes de su menú)*

| Cap. | Kecleon | Kangaskhan | Persian |
|---|---|---|---|
| 1 | ¡Pasad, pasad! Hay poca cosa: sin carros, la tienda está medio vacía. Y hoy no se fía; mañana, sí. | Lo que guardéis aquí, aquí se queda aunque el equipo caiga. Palabra de Kangaskhan. | Lo que dejéis en el banco no se pierde, caigáis o no. Lo que llevéis encima… eso ya es otra historia. |
| 2 | Con este viento y la cueva cerrada, aquí no hay quien viva. No me pidáis milagros. | — | — |
| 3 | ¡Mercancía fresca! Y con cada compra, un rumor gratis. El de hoy: a Persian se le ha acabado la tinta. | En el almacén hay una caja que lleva diez años cerrada. No me preguntéis de quién es. …Bueno, preguntadle a Persian. | ¿Un sobre? ¿Qué sobre? Yo solo entiendo de números. |
| 4 | Dicen que en el Monte Lunar la luna habla. Yo no me lo creo, pero por si acaso no le contéis mis precios. | — | ¿Qué os dijo Raichu exactamente? …No. No me lo digáis. |
| 5 | Sin Slowpoke en la plaza, nadie me mira mientras coloco el género. Es inquietante. | Sin Slowpoke, la plaza se hace rara. Hasta echo de menos sus bostezos. | — |
| 6 | ¿A la Isla Volcánica? Tengo un primo que fue y volvió más moreno que nunca. Llevad bayas, que llevan agua dentro. Yo tengo bayas. | — | — |
| 7 | *(ver 7-A)* | *(ver 7-A)* | Si no volvéis, me quedo con vuestros ahorros. …Es broma. Volved. |
| Después | Desde que el viento calla, se vende el doble. Si es que yo ya lo decía. | Ahora que el viento calla, hasta la tortilla cuaja mejor. Con cebolla, claro. | El Equipo Centella ha vuelto a abrir cuenta. Tres titulares. Qué cosas. |

---

## 7. Variantes según la especie *(opcional)*

Cada frase sale solo si `{héroe}` o `{compañero}` es de esa especie. Se añade a la escena indicada sin quitar nada, salvo la de Squirtle, que sustituye al grito de antes del combate en la 2-C.

| Especie | Escena | Quién | Frase |
|---|---|---|---|
| Pikachu | 3-D | Raichu · *Happy* | Y tú, Pikachu: que nadie te diga que unas chispas no sirven para nada. Y ponte las pilas. |
| Meowth | P-3 | Persian · *Normal* | Un Meowth explorador. No sé si reírme u ofrecerte un préstamo. |
| Psyduck | 5-D | Slowpoke · *Normal* | …Tú también tienes dolor de cabeza… ¿verdad? …Se nota. |
| Charmander | 6-D | Arcanine · *Normal* | Esa llama de la cola… cuídala. Es lo único que el viento no puede apagar. |
| Squirtle | 2-C y 5-C | Squirtle · *Determined* | ¡Vamo' a hacesla! *(justo antes del combate; en la 2-C sustituye a «¡al ataquer!»)* |
| Squirtle | 2-D | Onix · *Surprised* | …Agua. No me mires así, que me pongo nervioso. |
| Bulbasaur | 4-D | Clefable · *Happy* | Llevas una semilla a cuestas. Como este mundo: todo empieza por algo pequeño. |
| Machop | 5-C | Gengar · *Happy* | ¿Puñetazos? ¿A mí? ¡Ji, ji! Qué cosquillas. |
| Cubone | 1-E | Kangaskhan · *Normal* | Si alguna vez necesitas que alguien te guarde algo… o que te guarde a ti… aquí estoy. |
| Eevee | 7-D | Mewtwo · *Normal* | Tú podrías haber sido muchas cosas. Y elegiste venir. |

---

## 8. Memes españoles

Son frases hechas y memes de toda la vida, cortos y aptos para cualquier edad. No hay política, ni tacos, ni nadie que imite a una persona real. Van solo en los personajes cómicos. Las escenas serias quedan limpias: 6-D, 6-E, 7-B, 7-C, 7-D y F-3. Tacha los que no te gusten.

| Meme | Quién | Dónde |
|---|---|---|
| «Ganar, ganar y volver a ganar» | {compañero} | P-3 |
| «Hacienda somos todos» (…pero el banco soy yo) | Persian | P-3 |
| «¿Dónde vas? Manzanas traigo» y «vivir en Babia» | Slowpoke y Pidgey | P-3 |
| «Más perdida que un pulpo en un garaje» | Pidgeotto | 1-D |
| «Peor que la operación salida» | Kecleon | 1-E |
| «¡Al ataquer!» | {compañero} | 2-C |
| «De Guatemala a Guatepeor» | {compañero} | 2-E |
| «¿Un monstersito o quéee?» (y resulta que es un Elixir Máx.) | Kecleon | 2-E |
| «¿Sabéis quién soy yo?» (y el protagonista que lo compara con «¿quién eres?») | Raichu y {héroe} | 3-C |
| «Quien tuvo, retuvo» y «liarla parda» | Raichu | 3-D |
| «Vuelva usted mañana» | Persian | 3-E |
| «¡Bombazo!» y «Te lo juro por Snoopy» | Pidgey | 4-E |
| «El abuelo Cebolleta» y sus batallitas | Kecleon | 4-E |
| «Un poquito de por favor» | Kangaskhan | 4-E |
| «¡Esto es Jauja!» | Gengar | 5-C |
| «¡Hasta luego, Lucas!» | Gengar | 5-D |
| «Más hambre que un caracol en un espejo» | Slowpoke | 5-D |
| «Tirar la casa por la ventana» (con una manzana) | Kecleon | 7-A |
| La tortilla, ¿con o sin cebolla? | Kangaskhan, Kecleon y Slowpoke | F-1 y vecinos |
| «¿Y yo con estos pelos?» y «A buenas horas, mangas verdes» | Persian | F-2 |
| «Cincuenta pisos. Sin ascensor.» | Mewtwo | Tras los créditos |
| Cuñadismo: «tengo un primo que…», «si es que yo ya lo decía» | Kecleon | Vecinos |
| «Hoy no se fía, mañana sí» y «aquí no hay quien viva» | Kecleon | Vecinos |
| «Ojo al dato» y «al que madruga…» | Pidgey | Vecinos |
| «Vísteme despacio, que tengo prisa» | Slowpoke | Vecinos |
| «Ponte las pilas» | Raichu | Variante de Pikachu |
| «¡Vamo' a hacesla!» | Squirtle | Variante de Squirtle (2-C y 5-C) |

---

## 9. Decisiones

Aplicadas con los valores recomendados. Cualquiera se puede cambiar.

1. **Premisa:** protagonista humano, llamado sin querer por la pregunta de Mewtwo. Encaja con el texto del test («Tu forma de ser decidirá quién eres en este mundo»).
2. **Bosque Verde:** el jefe es **Pidgeotto**, nivel 6 en el piso 5, con 1,5 veces los PS (`hpMultiplier` en `floors.json`).
3. **Monte Lunar:** se mantiene **Clefable**, el jefe que ya estaba en los datos, como combate de prueba.
4. **Final sin elección:** el protagonista dice «Todavía no» y la puerta queda abierta. La Torre del Desafío es la continuación.
5. **El protagonista habla poco:** frases cortas y pensamientos entre paréntesis.
6. **Sin bloqueos nuevos:** las mazmorras se abren como antes, al completar la anterior. Cada escena sale una sola vez.
7. **Slowpoke** no está en el pueblo durante el capítulo 5.
8. **El sobre del capítulo 3** es una misión de historia de entrega que se apunta sola en la escena 3-A. Sale al mirar el tablón o, si no se ha mirado, antes de ir a la Ruta Eléctrica. Paga lo mismo que una entrega normal en ese piso (500 Poké y 20 puntos), no se puede abandonar y se cumple al derrotar a Raichu. No hay objeto en la mochila: así no se puede perder al caer.
9. **El don del protagonista** (hablar con el viento) es solo narrativo.
10. **Partidas de antes (v4):** migran a v5 y siguen desde su capítulo, con las escenas de los capítulos anteriores marcadas como vistas. Quien ya había terminado no ve el final de golpe. No hay «Diario» para volver a verlas.
11. **Recompensas:** ninguna de juego; todo es texto. Quedan como ideas para más adelante el pañuelo del Equipo Centella, los susurros del Eco en los avisos del viento, «Pidgeotto os trajo de vuelta» al caer y Arcanine y Raichu como vecinos. Las variantes por especie de la sección 7 sí están.
12. **Créditos:** «Guion y desarrollo: JaviStudio» (`STORY_AUTHOR` en `src/ui/menus/CreditsMenu.js`). Cámbialo si prefieres otro nombre.

---

## 10. Cómo está implementado

- **Datos:** `src/data/story.json`, generado desde este guion con `npm run story` (`scripts/build-story.mjs`). Cada línea es `[hablante, emoción, texto, condición?]`. El convertidor añade lo que el guion no dice en sus líneas: cuándo salta cada escena, sus efectos, las emociones de las frases de los vecinos y dónde entran las variantes.
- **Lógica pura:** `src/core/Story.js` decide qué escenas tocan con cada evento, filtra las variantes por especie y sustituye `{héroe}`, `{compañero}` y `{equipo}`. Tiene tests en `tests/unit/story.test.js`.
- **Guardado:** `profile.story.seen`, con las escenas vistas y los saludos de cada capítulo, y `SAVE_VERSION` 5 con su migración. El capítulo no se guarda: sale de las mazmorras completadas.
- **Disparadores** (`src/core/StorySession.js`):
  - Empezar la aventura.
  - Entrar en una mazmorra.
  - Llegar a un piso intermedio o al del jefe.
  - Derrotar al jefe.
  - Volver al pueblo.
  - Mirar el tablón.
  - Elegir mazmorra.
  - Dormir.
  - Hablar con los vecinos.
- **Final:** F-1 al volver del laboratorio. Al día siguiente (durmiendo o tras otra expedición), F-2 y F-3, los créditos sobre negro y F-4.
- **Tests E2E:** `tests/e2e/story.spec.js` cubre el prólogo, el capítulo 1 con Pidgeotto, Squirtle y el monstersito, el sobre, la ausencia de Slowpoke y el final con los créditos.

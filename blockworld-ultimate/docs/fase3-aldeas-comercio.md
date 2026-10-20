# Fase 3 — Aldeas y comercio (especificación)

## 1. Generación de aldeas (estructuras de varios chunks)

- **Región de aldea**: 10×10 chunks. En cada región, con probabilidad 0,45 (determinista por semilla), se elige una casilla
  central (no en el borde de la región). La aldea se acepta si el bioma del centro es llanura, bosque, desierto, mesa,
  nevado o jungla, el centro está sobre el nivel del mar y el terreno es razonablemente llano (desnivel ≤ 10 en una
  rejilla de muestras de radio 28). El estilo (materiales) depende del bioma.
- **Plan determinista** (`planVillage(terrain, rx, rz)`, con caché por región): centro con pozo, 2–4 calles rectas en
  direcciones cardinales (20–34 bloques), parcelas a ambos lados de cada calle con la puerta hacia la calle. Cada parcela
  tiene tipo, rectángulo, altura de suelo (`terrain.column` en su centro) y orientación. Se descartan parcelas que se
  solapan, que caen al agua o con desnivel > 3.
- **Colocación por chunk**: cada chunk construye solo la parte de cada pieza que cae dentro de él (sello recortado), así
  que no hay costuras aunque los chunks se generen en distinto orden o en distintos workers. Cofres y aldeanos solo se
  devuelven en el chunk que contiene su posición.
- **Huellas**: los árboles y la flora no aparecen dentro de las parcelas ni sobre las calles (se usan las huellas de todas
  las aldeas cercanas, igual desde cualquier chunk).
- **Calles**: bloque de camino (15/16 de alto) de 3 de ancho siguiendo el terreno; puentes de tablones sobre el agua;
  farolas (valla + farol) cada ~8 bloques.
- **Piezas**: casa pequeña (cama, mesa, ventana), casa grande (2 camas, cofre, mesa de trabajo), granja (tierra arada con
  canal de agua y cultivos), herrería (horno, yunque, cofre con botín), biblioteca (librerías, atril), taller (telar,
  barril o mesa de alquimia), corral (vallas, puerta de valla y animales), torre de vigía (escalera de mano), pozo central
  con campana.
- `GENERATOR_VERSION` pasa a 2: los mundos antiguos avisan de que el terreno nuevo podría no encajar (solo cambian las
  zonas con aldea).

## 2. Bloques nuevos (IDs 300+; 67 pasa a ser la librería)

camino, paca de heno, barril (contenedor de 27), yunque (repara herramientas), farol de pie y colgante (luz 15),
compostador (convierte plantas en abono), atril, telar, mesa de alquimia, campana (da la alarma), yeso blanco, librería.

## 3. Aldeanos

- Entidad humanoide con túnica del color de su oficio y sombrero propio; nombre generado.
- Oficios (por estación de trabajo): granjero (compostador), herrero (yunque), erudito (atril), tejedor (telar),
  pescador (barril), curandero (mesa de alquimia). Sin estación cercana: sin oficio (puede tomar una estación libre que
  coloque el jugador).
- Rutina: de día deambulan cerca de su estación y del centro; al anochecer vuelven a su cama; huyen de los monstruos;
  al sonar la campana se refugian. Navegación con A* sobre celdas transitables (cruzan puertas de madera abriéndolas y
  cerrándolas).
- Persisten (se guardan por chunk). No se reproducen (fuera de alcance).

## 4. Comercio

- Moneda propia: **Moneda de sol**. Pantalla de comercio con las ofertas del aldeano (entrada → salida, usos restantes).
- Cada oficio tiene 3 niveles de ofertas; comerciar da experiencia al aldeano y desbloquea el siguiente nivel.
- Las ofertas se reponen al amanecer. Golpear aldeanos empeora la reputación (precios +1 y el guardián se enfada).

## 5. Guardián de piedra

Defensor de cada aldea: patrulla cerca del pozo y ataca a los monstruos en 14 bloques. Si el jugador ataca aldeanos o al
guardián, se vuelve hostil durante 60 s. Los monstruos nocturnos persiguen también a los aldeanos.

## 6. Extras

- Abono (del compostador): adelanta una etapa a un cultivo o intenta hacer crecer un brote.
- Papel (juncos), libro (papel + cuero), librería, vendas (curan al instante).
- Comando `/localizar aldea`.
- Logros: Vecinos (descubre una aldea), Trato hecho (comercia), Maestro artesano (aldeano a nivel 3),
  Abono natural (usa abono).

## 7. Pruebas

Unitarias: plan determinista e idéntico desde cualquier chunk, piezas sin solapes y dentro del radio, sin árboles en las
parcelas, cofres/aldeanos devueltos una sola vez, A* (rodea obstáculos, cruza puertas), ofertas y niveles de comercio,
reposición, reputación. E2E: localizar y visitar una aldea, comerciar con la interfaz, aldeanos vuelven a casa de noche,
guardián contra un monstruo, captura de pantalla.

## Encontrar aldeas (añadido después)
- Al crear un mundo, la opción **«Empezar junto a una aldea»** (activada por defecto, y siempre en el inicio rápido) pone el
  punto de aparición a unos 10 bloques de las casas de la aldea más cercana (en tierra firme, mirando hacia el pozo). Se
  calcula una vez y se guarda con el mundo (`meta.spawn`); los mundos anteriores no cambian. Sin la opción, la aldea más
  cercana queda de media a unos 330 bloques del inicio.
- La **brújula de aldeas** se fabrica con 4 lingotes de hierro y 1 fragmento de cristal (antes pedía una Moneda de sol, que
  solo se consigue comerciando en una aldea). Con ella en la mano se ve el nombre, la distancia y la dirección de la aldea
  más cercana.
- `/localizar aldea` da sus coordenadas.

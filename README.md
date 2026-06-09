# PokéRogue

**PokéRogue** es un juego roguelike por turnos inspirado en la franquicia Pokémon. Está diseñado para jugarse directamente en el navegador, con generación procedural de mazmorras (Mystery Dungeon style), combate táctico, mecánicas de evolución y un sistema complejo de IA para compañeros y enemigos.

## Características

- 🗺️ **Generación Procedural**: Cada piso de la mazmorra se genera dinámicamente con diferentes biomas, salas, pasillos, trampas e ítems.
- 🐾 **151 Pokémon**: Encuentra, recluta y lucha contra los 151 Pokémon originales.
- ⚔️ **Combate por Turnos**: Sistema táctico profundo basado en el movimiento por cuadrículas.
- 🧠 **IA Avanzada**:
  - Los enemigos toman decisiones basadas en su entorno y estado.
  - Los compañeros de equipo te siguen inteligentemente.
  - **Tácticas de Equipo**: Puedes cambiar las tácticas de tus seguidores ("Seguir", "Atacar a discreción", "Huir", "Mantener posición").
  - **Cambio de Líder**: Alterna el control en tiempo real entre los miembros de tu equipo.
- 🎒 **Sistema de Objetos**: Recoge y utiliza Pociones, Bayas, MTs (Máquinas Técnicas) para aprender nuevos movimientos, y semillas raras.
- ⛈️ **Climas Dinámicos**: Efectos climáticos que afectan el combate (Soleado, Lluvia, Tormenta Arena, Granizo).
- 🧬 **Habilidades Pasivas**: Habilidades únicas para cada Pokémon que cambian las reglas del juego.
- 🏆 **Jefes**: Enfréntate a Pokémon jefe desafiantes en pisos específicos.

## Tecnologías Utilizadas

- **HTML5 Canvas** para renderizado 2D.
- **JavaScript (ES6+)** puro (Vanilla JS), estructurado con módulos.
- **Vite** como entorno de desarrollo y bundler.
- Arquitectura **ECS (Entity-Component-System)** para gestionar la complejidad del juego y el rendimiento.

## Estructura del Proyecto

```text
├── public/                 # Assets estáticos (favicon, spritesheets base)
├── src/
│   ├── assets/             # Sistema de carga de imágenes y audio
│   ├── combat/             # Lógica de daño, clima, pasivas y experiencia
│   ├── core/               # Bucle principal, ECS, EventBus, TurnManager
│   ├── data/               # Bases de datos JSON (Pokémon, movimientos, ítems)
│   ├── entities/           # Entidades prefabricadas, componentes ECS
│   ├── input/              # Manejo de teclado/móvil
│   ├── map/                # Generación procedural (BSP/Autómatas), tipos de tiles
│   ├── render/             # Motor de renderizado Canvas, cámara
│   ├── systems/            # Sistemas ECS (Movimiento, IA, Combate, Trampas)
│   ├── ui/                 # Gestión de menús, HUD, logs, diálogos
│   ├── utils/              # RNG, funciones de ayuda matemáticas
│   ├── constants.js        # Constantes globales
│   ├── main.js             # Punto de entrada
│   └── style.css           # Estilos de UI
├── tests/                  # Tests E2E (Puppeteer)
├── package.json
└── vite.config.js
```

## Requisitos Previos

Necesitas tener instalado [Node.js](https://nodejs.org/) (versión 16 o superior).

## Instalación y Uso Local

1. Clona el repositorio.
2. Instala las dependencias:
   ```bash
   npm install
   ```
3. Inicia el servidor de desarrollo local:
   ```bash
   npm run dev
   ```
4. Abre tu navegador en la URL que indique Vite (usualmente `http://localhost:5173`).

## Pruebas (E2E)

El proyecto incluye tests end-to-end básicos utilizando Puppeteer para asegurar la estabilidad del juego.

Para ejecutar los tests:
```bash
npm run test
```

## Despliegue (Vercel / GitHub Pages)

El juego está diseñado para compilarse como un sitio estático.
Puedes compilar la versión de producción con:

```bash
npm run build
```

Los archivos resultantes en el directorio `dist/` se pueden subir a cualquier hosting estático (Vercel, Netlify, GitHub Pages). En Vercel, al tener el repositorio conectado, cada `commit` a la rama `main` disparará un despliegue automático.

## Créditos y Agradecimientos

Este proyecto es un homenaje "fan-made" (hecho por fans) a la saga *Pokémon Mystery Dungeon*. Todos los derechos de los personajes, nombres y marcas pertenecen a Nintendo / The Pokémon Company.

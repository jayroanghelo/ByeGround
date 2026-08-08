# Bye-Ground

Bye-Ground elimina fondos de color uniforme directamente en el navegador. La imagen no se sube a ningún servidor y la exportación conserva la transparencia en PNG.

## Funcionalidades

- Detección automática del color de fondo desde el perímetro.
- Recorte por fondo conectado o por color global.
- Antialias, contracción, feather y reconstrucción de bordes sin halo.
- Varita, borrado, restauración y deshacer.
- Comparador antes/después y fondos de previsualización.
- Exportación PNG a resolución completa, con recorte opcional al contenido.
- Tema claro/oscuro y controles accesibles por teclado.

## Desarrollo local

Requiere Node.js 20 o superior y Python 3 para el servidor estático incluido en los scripts.

```bash
npm run dev
```

Abre `http://localhost:4173`.

## Validación

```bash
npm test
npm run check
```

## Arquitectura

```text
.
├── index.html                     # Estructura semántica de la interfaz
├── src/
│   ├── core/
│   │   ├── background-processor.js # Pipeline y retoques de imagen
│   │   ├── config.js               # Límites, valores iniciales y presets
│   │   └── math.js                 # Utilidades puras reutilizables
│   ├── styles/                     # Tokens, base, componentes y editor
│   ├── ui/                         # Controles accesibles y tema
│   └── main.js                     # Orquestación entre DOM y motor
└── tests/                          # Pruebas unitarias del núcleo
```

El modo de fondo complejo permanece visible como extensión futura para un modelo local WebGPU/WASM/ONNX, igual que en la versión original; no se simula con el motor cromático.

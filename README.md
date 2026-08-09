<p align="center">
  <img src="favicon.svg" alt="Logo de Bye-Ground" width="112" height="112" />
</p>

<h1 align="center">Bye-Ground</h1>

<p align="center">
  <strong>Eliminación automática de fondos con IA local y retoque profesional.</strong><br />
  La imagen se procesa en el navegador y se exporta como PNG transparente.
</p>

## Qué incluye

- Recorte general mediante BiRefNet Lite 512 y ONNX Runtime Web.
- Protección de sujeto para recuperar zonas claras cerradas que pertenecen a la figura, sin rescatar elementos aislados del fondo.
- Aceleración WebGPU con fallback WASM.
- Modelo ejecutado en un Web Worker para mantener fluida la interfaz.
- Caché local del modelo; la primera ejecución descarga aproximadamente 94 MB y prioriza la calidad del recorte.
- Resultado cromático rápido disponible si la IA no puede iniciarse o el usuario prefiere continuar sin esperar.
- Varita con matting subpíxel, borrador, restauración y deshacer.
- Comparador antes/después, fondos de prueba y exportación PNG recortada al contenido.
- Interfaz responsive, accesible y con tema claro/oscuro.

## Desarrollo local

Requiere Node.js 20.19 o posterior.

```bash
npm install
npm run dev
```

Vite abrirá el proyecto en `http://127.0.0.1:4173` o en el siguiente puerto libre.

## Validación

```bash
npm run check
npm test
npm run build
npm audit
```

## Arquitectura

```text
.
├── index.html
├── src/
│   ├── core/
│   │   ├── alpha-matte.js           # Fusión semántica y protección del sujeto
│   │   ├── background-processor.js  # Composición, chroma y retoques
│   │   ├── config.js                # Límites, defaults y presets
│   │   └── math.js                  # Utilidades puras
│   ├── engines/
│   │   └── automatic-background-engine.js # API estable del motor IA
│   ├── workers/
│   │   └── background-removal.worker.js   # ONNX, pre/postproceso y caché
│   ├── ui/                          # DOM, tooltips, controles, temas y exportación
│   ├── styles/                      # Tokens, base, componentes y editor
│   └── main.js                      # Orquestación de la aplicación
└── tests/
```

El editor solo conoce la interfaz de `AutomaticBackgroundEngine`. El modelo puede cambiarse o trasladarse a un servicio remoto sin reescribir la UI ni el pipeline de retoque.

## Privacidad y licencias

Los píxeles no se envían a un servicio de inferencia: el navegador descarga el modelo y ejecuta el recorte localmente. El modelo y sus archivos se sirven desde Hugging Face en la primera ejecución.

Consulta [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) para las licencias del runtime y del modelo.

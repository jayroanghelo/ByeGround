<p align="center">
  <img src="favicon.svg" alt="Bye-Ground Logo" width="128" height="128" />
</p>

<h1 align="center">Bye-Ground</h1>

<p align="center">
  <strong>Elimina fondos de forma privada y al instante, ejecutado íntegramente en tu navegador.</strong><br>
  Sin servidores, sin demoras y conservando una transparencia de máxima calidad en PNG.
</p>

<p align="center">
  <a href="#funcionalidades">Funcionalidades</a> •
  <a href="#desarrollo-local">Desarrollo</a> •
  <a href="#arquitectura">Arquitectura</a>
</p>

---

## ✨ Funcionalidades

- **🔒 100% Privado**: Las imágenes nunca salen de tu dispositivo, todo ocurre en el cliente mediante Web APIs.
- **🎨 Detección inteligente de color**: Algoritmo que muestrea el perímetro (mediana) y recorta fondos conectados o por color global.
- **✂️ Recorte de Alta Precisión**: Antialias, contracción del borde, desenfoque (feather) y reconstrucción sin el temido efecto "halo".
- **🪄 Herramientas de retoque**: Varita mágica con matting subpíxel, pincel para borrar, herramienta de restauración total y sistema *Deshacer*.
- **👁️ UI/UX Moderna**: Interfaz amigable de 2026, tipografía _Outfit_, modo oscuro/claro nativo, comparador visual antes/después y fondos previsualizables.
- **🖼️ Exportación Optimizada**: Descarga tu PNG a resolución completa con la opción de auto-recortar al lienzo útil.

## 🚀 Desarrollo local

El entorno está preparado para ser ultra liviano. Requiere **Node.js 20+** y **Python 3** (para servir los estáticos localmente).

1. **Clona el repositorio** y entra en el directorio.
2. **Inicia el servidor local**:

```bash
npm run dev
```

El servidor estará disponible en `http://localhost:4173`.

## 🧪 Validación y Pruebas

Para asegurar la estabilidad del motor interno:

```bash
# Ejecutar la suite de tests unitarios:
npm test

# Validar la sintaxis y tipos del código base:
npm run check
```

## 🏗 Arquitectura del Proyecto

El código está estructurado para una escalabilidad de componentes puros sin necesidad de pesados frameworks frontend:

```text
.
├── favicon.svg                    # Logo y assets vectoriales
├── index.html                     # Estructura semántica de la UI
├── src/
│   ├── core/
│   │   ├── background-processor.js # Motor principal: pipeline y retoques
│   │   ├── config.js               # Límites, defaults y presets del motor
│   │   └── math.js                 # Utilidades algorítmicas puras
│   ├── styles/                     # Arquitectura CSS (Tokens, Base, Componentes)
│   ├── ui/                         # Controladores accesibles (Modo oscuro, eventos)
│   └── main.js                     # Orquestación central DOM <-> Motor
└── tests/                          # Suite de pruebas automatizadas
```

> [!NOTE]  
> **Extensibilidad futura (Fondo Complejo)**: La segmentación local para fotografías complejas está planteada en la arquitectura para integrar un modelo cliente (WebGPU / WASM / ONNX) en el futuro, manteniendo la filosofía *Zero-Server*.

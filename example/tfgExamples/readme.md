# Pruebas TFG — TimeWidget

Herramientas HTML para la validación funcional, el benchmark de rendimiento y la exploración interactiva de TimeWidget.

---

## Requisitos previos

| Requisito | Versión mínima |
|-----------|---------------|
| Node.js   | 18 LTS        |
| npm       | incluido con Node |
| Google Chrome | cualquier versión reciente con WebGPU activo |

---

## 1. Instalar dependencias

Desde la **raíz del repositorio** (`TimeWidget/`):

```bash
npm install
```

---

## 2. Compilar el bundle

Los archivos HTML cargan `../../dist/TimeWidget.js`. Hay que generarlo antes de abrir cualquier página:

```bash
npm run build
```

Esto genera `dist/TimeWidget.js`, `dist/TimeWidget.esm.js` y `dist/TimeWidget.min.js`.

> Si haces cambios en el código fuente (`src/`), vuelve a ejecutar `npm run build` antes de recargar el HTML.

---

## 3. Servir los archivos en local

Los archivos usan `<script type="module">` y WebGPU, por lo que **no se pueden abrir directamente** con `file://`. Necesitan un servidor HTTP local.

### Opción A — extensión VS Code (recomendada)

Instala **Live Server** en VS Code, haz clic derecho sobre el archivo HTML → *Open with Live Server*.

### Opción B — npx (sin instalar nada)

Desde la raíz del repositorio:

```bash
npx serve .
```

Luego abre en Chrome:
```
http://localhost:3000/example/tfgExamples/validacionFuncional.html
http://localhost:3000/example/tfgExamples/benchmark_fps_fluidez.html
http://localhost:3000/example/tfgExamples/ejemplo_interactivo.html
```

### Opción C — Python (si lo tienes instalado)

```bash
python -m http.server 8080
```

Luego abre:
```
http://localhost:8080/example/tfgExamples/validacionFuncional.html
```

---

## 4. Archivos disponibles

| Archivo | Descripción |
|---------|-------------|
| `validacionFuncional.html` | 8 escenarios de validación funcional (E1–E8). Requiere interacción manual. |
| `benchmark_fps_fluidez.html` | Benchmark de FPS real Canvas 2D vs WebGPU. Mide fotogramas por segundo durante renderizado continuo (`requestAnimationFrame`). Incluye tabla comparativa, gráfica exportable y automatización con Playwright (`benchmark_fps_runner.cjs`). |
| `ejemplo_interactivo.html` | Demo interactiva del widget: ajuste de N, renderer (Canvas/WebGPU), grupos de color y brushing. Útil para explorar el comportamiento visual antes de ejecutar los benchmarks formales. |

---

## 5. Verificar que WebGPU está activo

Abre `chrome://gpu` en Chrome y comprueba que la línea **WebGPU** dice `Hardware accelerated`.

Si aparece `Disabled` o `Software only`, prueba con:

```
chrome --enable-unsafe-webgpu --enable-features=Vulkan
```

---

## 6. Flujo de trabajo típico para la memoria

```bash
npm install
npm run build
npx serve .
```

1. **(Opcional)** Abre `ejemplo_interactivo.html` para explorar el widget y comprobar que Canvas 2D y WebGPU funcionan correctamente antes de medir.
2. Abre `validacionFuncional.html` → ejecuta E1–E8 → anota los conteos → pulsa "Verificar".
3. Abre `benchmark_fps_fluidez.html` → selecciona los N deseados → pulsa **"⟳ Medir todos"** → espera → pulsa **"📊 Generar gráfica"** para exportar el gráfico comparativo.

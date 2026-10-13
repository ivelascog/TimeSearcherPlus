/*
 * HelpSystem: sistema de ayuda integrado en el TimeWidget.
 *  - Botón "?" sobre el widget.
 *  - Popup (modal) con la documentación de todas las configuraciones e interacciones.
 *  - Demo guiada por pasos (tour) que recorre las partes de la herramienta.
 *
 * Uso desde TimeWidget:
 *   const help = HelpSystem({ container: divOverview, elements: {...} });
 *   help.showHelp();   // abre el popup de documentación
 *   help.startTour();  // inicia la demo guiada
 */

const STYLE_ID = "__tw_help_styles";

const CSS = `
.__tw-help-btn {
  position: absolute; top: 6px; right: 8px; z-index: 10;
  width: 26px; height: 26px; border-radius: 50%;
  border: 1px solid #bbb; background: #fff; color: #444;
  font: bold 14px/1 sans-serif; cursor: pointer;
  box-shadow: 0 1px 3px rgba(0,0,0,.25);
}
.__tw-help-btn:hover { background: #f0f4ff; border-color: #4a7bd0; color: #2a5bb8; }

.__tw-help-overlay {
  position: fixed; inset: 0; z-index: 999990;
  background: rgba(0,0,0,.45);
  display: flex; align-items: center; justify-content: center;
  font-family: sans-serif;
}
.__tw-help-modal {
  background: #fff; width: min(760px, 92vw); max-height: 85vh;
  border-radius: 8px; box-shadow: 0 8px 30px rgba(0,0,0,.35);
  display: flex; flex-direction: column; overflow: hidden;
}
.__tw-help-modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px; border-bottom: 1px solid #e3e3e3;
}
.__tw-help-modal-header h2 { margin: 0; font-size: 1.05rem; color: #222; }
.__tw-help-x {
  border: none; background: none; font-size: 1.3rem; line-height: 1;
  cursor: pointer; color: #666; padding: 2px 6px;
}
.__tw-help-x:hover { color: #000; }
.__tw-help-modal-body {
  padding: 12px 16px 18px; overflow-y: auto;
  font-size: .86rem; color: #333; line-height: 1.45;
}
.__tw-help-tour-cta {
  display: inline-block; margin-bottom: 12px; padding: 7px 14px;
  border: none; border-radius: 5px; background: #2a5bb8; color: #fff;
  font-size: .85rem; cursor: pointer;
}
.__tw-help-tour-cta:hover { background: #1d4796; }
.__tw-help-section { border: 1px solid #e3e3e3; border-radius: 6px; margin-bottom: 8px; }
.__tw-help-section summary {
  cursor: pointer; padding: 8px 10px; font-weight: bold; color: #2a3950;
}
.__tw-help-section[open] > summary { border-bottom: 1px solid #eee; }
.__tw-help-section-body { padding: 8px 12px; }
.__tw-help-section-body p { margin: 6px 0; }
.__tw-help-section-body ul { margin: 6px 0; padding-left: 18px; }
.__tw-help-table { border-collapse: collapse; width: 100%; font-size: .8rem; margin: 6px 0; }
.__tw-help-table th, .__tw-help-table td {
  border: 1px solid #ddd; padding: 4px 6px; text-align: left; vertical-align: top;
}
.__tw-help-table th { background: #f4f6fa; }
.__tw-kbd {
  display: inline-block; border: 1px solid #bbb; border-bottom-width: 2px;
  border-radius: 3px; padding: 0 5px; font-family: monospace;
  font-size: .78rem; background: #f7f7f7;
}

.__tw-tour-dim { position: fixed; inset: 0; z-index: 999990; }
.__tw-tour-highlight {
  position: fixed; z-index: 999991; border-radius: 6px;
  box-shadow: 0 0 0 9999px rgba(0,0,0,.5), 0 0 0 3px #4a90d9;
  pointer-events: none; transition: all .25s ease;
}
.__tw-tour-card {
  position: fixed; z-index: 999992; width: 340px; max-width: 92vw;
  background: #fff; border-radius: 8px; box-shadow: 0 6px 24px rgba(0,0,0,.4);
  font-family: sans-serif; font-size: .85rem; color: #333; line-height: 1.4;
}
.__tw-tour-card-header {
  display: flex; justify-content: space-between; align-items: baseline;
  padding: 10px 12px 0;
}
.__tw-tour-card-header h3 { margin: 0; font-size: .95rem; }
.__tw-tour-step-counter { color: #888; font-size: .75rem; margin-left: 8px; white-space: nowrap; }
.__tw-tour-card-body { padding: 8px 12px; }
.__tw-tour-card-body p { margin: 6px 0; }
.__tw-tour-card-body ul { margin: 6px 0; padding-left: 18px; }
.__tw-tour-card-footer {
  display: flex; justify-content: space-between; align-items: center;
  padding: 8px 12px 12px;
}
.__tw-tour-btn {
  padding: 5px 12px; border-radius: 4px; border: 1px solid #ccc;
  background: #fff; cursor: pointer; font-size: .8rem;
}
.__tw-tour-btn[disabled] { opacity: .4; cursor: default; }
.__tw-tour-btn.__tw-primary { background: #2a5bb8; border-color: #2a5bb8; color: #fff; }
.__tw-tour-exit {
  border: none; background: none; color: #888; cursor: pointer;
  font-size: .75rem; text-decoration: underline; padding: 4px;
}
.__tw-lang-switcher {
  display: flex; gap: 4px; align-items: center;
}
.__tw-lang-btn {
  padding: 2px 7px; border-radius: 3px; border: 1px solid #ccc;
  background: #fff; cursor: pointer; font-size: .75rem; color: #555;
  line-height: 1.4;
}
.__tw-lang-btn:hover { border-color: #4a7bd0; color: #2a5bb8; }
.__tw-lang-btn.__tw-lang-active {
  background: #2a5bb8; border-color: #2a5bb8; color: #fff; font-weight: bold;
}
`;

function injectStyles() {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    document.head.appendChild(style);
  }
}

function kbd(k) {
  return `<span class="__tw-kbd">${k}</span>`;
}

// ─── Contenido de la documentación ──────────────────────────────────────────
function buildDocSections() {
  return [
    {
      title: "¿Qué es TimeWidget?",
      open: true,
      html: `
        <p>TimeWidget es una herramienta interactiva para explorar colecciones de
        series temporales. Permite filtrar las series dibujando cajas de selección
        (<strong>TimeBoxes</strong>) directamente sobre el gráfico, organizar las
        selecciones en <strong>grupos</strong> y compararlas con
        <strong>curvas de referencia</strong>.</p>
        <p>Pulsa <em>«Iniciar demo guiada»</em> (arriba) para hacer un recorrido paso
        a paso por todas las partes de la herramienta.</p>`,
    },
    {
      title: "Vista general (el gráfico)",
      html: `
        <ul>
          <li>Las <strong>líneas grises</strong> son las series que no cumplen ninguna selección.</li>
          <li>Las <strong>líneas coloreadas</strong> son las series seleccionadas; el color es el del grupo al que pertenecen.</li>
          <li>La <strong>línea discontinua</strong> es la mediana de las series de cada grupo activo (se puede desactivar con <code>showGroupMedian</code>).</li>
          <li>El texto <em>«Groups + :»</em> sobre el gráfico crea un grupo nuevo al hacer clic.</li>
          <li>Con <code>showGrid</code> se muestra una rejilla de referencia y con <code>doubleYlegend</code> el eje Y se duplica a la derecha.</li>
        </ul>`,
    },
    {
      title: "TimeBoxes (cajas de selección)",
      html: `
        <p>Un TimeBox define un rectángulo [rango X] × [rango Y]. Las series que lo
        cumplen pasan a formar parte del grupo al que pertenece la caja.</p>
        <ul>
          <li><strong>Crear:</strong> haz clic y arrastra sobre una zona vacía del gráfico.</li>
          <li><strong>Mover:</strong> arrastra el interior de la caja. <strong>Redimensionar:</strong> arrastra sus bordes o esquinas.</li>
          <li><strong>Seleccionar:</strong> haz clic sobre una caja; la caja activa se resalta con una sombra y sus coordenadas aparecen en el panel de coordenadas.</li>
          <li><strong>Eliminar:</strong> con la caja seleccionada, pulsa ${kbd("R")}, ${kbd("Supr")} o ${kbd("Retroceso")}.</li>
        </ul>
        <p><strong>Menú contextual</strong> (clic derecho sobre la caja):</p>
        <ul>
          <li><strong>Mode → Intersect:</strong> selecciona las series que <em>tocan</em> la caja en algún punto.</li>
          <li><strong>Mode → Contains:</strong> selecciona solo las series cuyo tramo dentro del rango X queda <em>completamente contenido</em> en la caja.</li>
          <li><strong>Not:</strong> invierte la condición de la caja (excluye las series que la cumplen).</li>
          <li><strong>Aggregation → And:</strong> la serie debe cumplir <em>todas</em> las cajas del grupo.</li>
          <li><strong>Aggregation → Or:</strong> basta con que cumpla <em>una</em> de las cajas del grupo.</li>
        </ul>
        <p>Si <code>showBrushTooltip</code> está activo, al dibujar o mover una caja se
        muestra un tooltip con sus coordenadas.</p>`,
    },
    {
      title: "Grupos de selección",
      html: `
        <p>Cada grupo reúne uno o más TimeBoxes y tiene un color propio. El panel
        <em>Groups</em> permite gestionarlos:</p>
        <ul>
          <li><strong>Checkbox:</strong> activa o desactiva el grupo (sus series dejan de colorearse).</li>
          <li><strong>Cuadrado de color:</strong> haz clic para convertirlo en el grupo <em>activo</em> (borde negro); los nuevos TimeBoxes se añaden al grupo activo.</li>
          <li><strong>Nombre:</strong> editable directamente sobre el texto.</li>
          <li><strong>(n):</strong> número de series que cumplen actualmente la consulta del grupo.</li>
          <li><strong>✕:</strong> elimina el grupo y sus cajas.</li>
          <li><strong>Add Group:</strong> crea un grupo nuevo (también con la tecla ${kbd("+")} o el texto «Groups + :» del gráfico).</li>
          <li><strong>Non selected (n):</strong> muestra u oculta las series que no pertenecen a ningún grupo.</li>
        </ul>`,
    },
    {
      title: "Coordenadas del TimeBox",
      html: `
        <p>El panel de coordenadas muestra los límites de la caja seleccionada
        (X inicial/final e Y inferior/superior) y permite editarlos numéricamente
        para colocar la caja con precisión. El tamaño del paso se controla con
        <code>stepX</code> y <code>stepY</code>.</p>
        <p>Si seleccionas un <em>slider</em> de una curva de referencia, el panel pasa a
        mostrar (y editar) sus coordenadas X.</p>`,
    },
    {
      title: "Curvas de referencia",
      html: `
        <p>Las curvas de referencia (parámetro <code>referenceCurves</code>) son curvas
        o conjuntos de puntos que se dibujan sobre el gráfico y sirven tanto de
        referencia visual como de mecanismo de consulta. Pueden definirse con datos
        explícitos, una función <code>y = f(x)</code>, un polinomio o una curva paramétrica.</p>
        <p>En el panel <em>Reference Curves</em>, cada curva tiene:</p>
        <ul>
          <li><strong>Checkbox:</strong> muestra u oculta la curva.</li>
          <li><strong>Selector de color</strong> y <strong>nombre editable</strong>.</li>
          <li><strong>Add Slider</strong> (polilíneas): añade un slider asociado al grupo activo.</li>
          <li><strong>Add Association</strong> (curvas de puntos): asocia la curva al grupo activo.</li>
          <li><strong>Collision Tolerance</strong> (curvas de puntos): radio de tolerancia
            (en unidades del eje Y) con el que una serie se considera que «pasa por» un punto.</li>
        </ul>
        <p>Las <strong>asociaciones</strong> seleccionan las series que pasan a una distancia
        menor o igual que la tolerancia de los puntos de la curva. Cada asociación se puede
        activar/desactivar y combinar con <strong>AND / OR / NOT</strong> con el resto de
        condiciones del grupo.</p>`,
    },
    {
      title: "Sliders sobre curvas",
      html: `
        <p>Un slider delimita un tramo [izquierda, derecha] de una polilínea de referencia
        y selecciona las series que quedan <em>por encima</em> («above») o
        <em>por debajo</em> («below») de la curva en ese tramo.</p>
        <ul>
          <li><strong>Mover:</strong> arrastra el área sombreada del slider.</li>
          <li><strong>Ajustar extremos:</strong> arrastra las líneas verticales de los bordes.</li>
          <li><strong>Cambiar de lado:</strong> doble clic sobre el slider, o el botón ↑/↓ del panel.</li>
          <li><strong>Menú contextual</strong> (clic derecho): mismas opciones que los TimeBoxes
            (Intersect/Contains, Not, And/Or).</li>
          <li>Desde el panel también se puede renombrar, activar/desactivar o eliminar (✕).</li>
        </ul>`,
    },
    {
      title: "Grupos de datos (atributo color)",
      html: `
        <p>Si el widget se crea con el parámetro <code>color</code>, las series se colorean
        por categoría y aparece la fila <em>«Data groups»</em> con un botón por categoría.
        Haz clic en un botón para ocultar o volver a mostrar las series de esa categoría.</p>`,
    },
    {
      title: "Vista de detalles",
      html: `
        <p>Con <code>hasDetails</code> activo se muestra un panel con un gráfico individual
        por cada serie seleccionada del grupo activo (hasta <code>maxDetailsRecords</code>
        gráficos a la vez, con scroll para ver el resto).</p>`,
    },
    {
      title: "Atajos de teclado",
      html: `
        <p>Funcionan con el gráfico enfocado (haz clic sobre él primero):</p>
        <table class="__tw-help-table">
          <tr><th>Tecla</th><th>Acción</th></tr>
          <tr><td>${kbd("R")} / ${kbd("Supr")} / ${kbd("Retroceso")}</td><td>Elimina el TimeBox seleccionado</td></tr>
          <tr><td>${kbd("+")}</td><td>Añade un grupo nuevo</td></tr>
          <tr><td>${kbd("←")} ${kbd("→")} ${kbd("↑")} ${kbd("↓")}</td><td>Desplaza el TimeBox seleccionado (pasos de <code>stepX</code> / <code>stepY</code>)</td></tr>
          <tr><td>${kbd("I")}</td><td>Invierte la consulta del grupo seleccionado (NOT)</td></tr>
        </table>`,
    },
    {
      title: "Parámetros de configuración (API)",
      html: `
        <p>Principales opciones al crear el widget: <code>TimeWidget(data, opciones)</code>.</p>
        <p><strong>Datos y ejes</strong></p>
        <table class="__tw-help-table">
          <tr><th>Parámetro</th><th>Significado</th></tr>
          <tr><td><code>x</code>, <code>y</code>, <code>id</code></td><td>Atributos (o funciones) para el eje X, el eje Y y el identificador de cada serie.</td></tr>
          <tr><td><code>color</code></td><td>Atributo para colorear las series por categoría (crea los «Data groups»).</td></tr>
          <tr><td><code>referenceCurves</code></td><td>Array de curvas de referencia (datos, función, polinomio o paramétrica).</td></tr>
          <tr><td><code>filters</code></td><td>TimeBoxes iniciales con los que arranca el widget.</td></tr>
          <tr><td><code>xDomain</code> / <code>yDomain</code></td><td>Dominio de cada eje (por defecto, el rango de los datos).</td></tr>
          <tr><td><code>xScale</code> / <code>yScale</code></td><td>Escalas de d3 a usar en cada eje.</td></tr>
          <tr><td><code>fmtX</code> / <code>fmtY</code></td><td>Formato de los valores X/Y en tooltips y coordenadas.</td></tr>
          <tr><td><code>stepX</code> / <code>stepY</code></td><td>Paso usado por los spinboxes de coordenadas y las flechas del teclado.</td></tr>
          <tr><td><code>xTicks</code> / <code>yTicks</code>, <code>xLabel</code> / <code>yLabel</code></td><td>Etiquetas personalizadas de los ejes.</td></tr>
        </table>
        <p><strong>Apariencia</strong></p>
        <table class="__tw-help-table">
          <tr><th>Parámetro</th><th>Significado</th></tr>
          <tr><td><code>width</code> / <code>height</code></td><td>Tamaño del gráfico principal.</td></tr>
          <tr><td><code>detailsWidth</code> / <code>detailsHeight</code> / <code>detailsContainerHeight</code></td><td>Tamaño de la vista de detalles.</td></tr>
          <tr><td><code>margin</code>, <code>backgroundColor</code></td><td>Márgenes y color de fondo.</td></tr>
          <tr><td><code>defaultColor</code> / <code>selectedColor</code> / <code>noSelectedColor</code></td><td>Colores de las líneas (sin selección, seleccionadas, no seleccionadas) cuando no se usa <code>color</code>.</td></tr>
          <tr><td><code>defaultAlpha</code> / <code>selectedAlpha</code> / <code>noSelectedAlpha</code></td><td>Transparencias de las líneas en cada estado.</td></tr>
          <tr><td><code>colorScale</code> / <code>brushesColorScale</code></td><td>Escalas de color para las categorías de datos y para los grupos.</td></tr>
          <tr><td><code>showGrid</code>, <code>doubleYlegend</code>, <code>brushGroupSize</code>, <code>brushShadow</code></td><td>Rejilla, doble eje Y, tamaño de los selectores de grupo y sombra de la caja activa.</td></tr>
        </table>
        <p><strong>Comportamiento</strong></p>
        <table class="__tw-help-table">
          <tr><th>Parámetro</th><th>Significado</th></tr>
          <tr><td><code>hasDetails</code> / <code>showDetails</code></td><td>Calcula / muestra la vista de detalles.</td></tr>
          <tr><td><code>showBrushesControls</code> / <code>showBrushesCoordinates</code> / <code>showBrushTooltip</code></td><td>Muestra los paneles de grupos, de coordenadas y el tooltip de las cajas.</td></tr>
          <tr><td><code>showHelp</code></td><td>Muestra el botón «?» con esta ayuda y la demo guiada.</td></tr>
          <tr><td><code>showGroupMedian</code>, <code>medianNumBins</code>, <code>medianFn</code>, <code>medianMinRecordsPerBin</code></td><td>Mediana por grupo: si se muestra, número de bins, función de agregación y mínimo de registros por bin.</td></tr>
          <tr><td><code>autoUpdate</code></td><td>Si la selección se recalcula mientras se mueve la caja o solo al soltarla.</td></tr>
          <tr><td><code>fixAxis</code>, <code>maxTimelines</code>, <code>maxDetailsRecords</code></td><td>Ejes fijos al cambiar los datos, límite de series y de gráficos de detalle.</td></tr>
          <tr><td><code>updateCallback</code> / <code>statusCallback</code></td><td>Callbacks al cambiar la selección / el estado interno.</td></tr>
        </table>
        <p><strong>Rendimiento</strong></p>
        <table class="__tw-help-table">
          <tr><th>Parámetro</th><th>Significado</th></tr>
          <tr><td><code>renderer</code></td><td><code>'webgpu'</code> (por defecto, acelerado por GPU) o <code>'canvas'</code> (Canvas 2D clásico).</td></tr>
          <tr><td><code>xPartitions</code> / <code>yPartitions</code></td><td>Particiones del algoritmo de aceleración de colisiones.</td></tr>
          <tr><td><code>alphaScale</code></td><td>Escala que ajusta la transparencia según el número de elementos dibujados.</td></tr>
        </table>`,
    },
  ];
}

// ─── Pasos de la demo guiada ────────────────────────────────────────────────
// elements: mapa de getters que devuelven el elemento a resaltar (o null si no aplica).
function buildTourSteps(elements) {
  const el = (key) =>
    elements && typeof elements[key] === "function" ? elements[key] : null;

  return [
    {
      title: "Bienvenido a TimeWidget",
      element: null,
      html: `
        <p>Esta demo guiada recorre las partes principales de la herramienta en unos pocos pasos.</p>
        <p>Usa los botones o las flechas ${kbd("←")} ${kbd("→")} del teclado para navegar,
        y ${kbd("Esc")} o «Salir» para terminar en cualquier momento.</p>`,
    },
    {
      title: "La vista general",
      element: el("chart"),
      html: `
        <p>Aquí se dibujan todas las series temporales sobre los ejes X e Y.</p>
        <p>Las líneas <strong>grises</strong> son series sin seleccionar. Cuando crees una
        selección, las series que la cumplan se pintarán con el <strong>color de su
        grupo</strong>, y una línea discontinua mostrará su mediana.</p>`,
    },
    {
      title: "TimeBoxes: selecciona dibujando",
      element: el("chart"),
      html: `
        <p><strong>Haz clic y arrastra</strong> sobre el gráfico para crear un
        <em>TimeBox</em>: un rectángulo que selecciona las series que pasan por él.</p>
        <p>Puedes <strong>moverlo</strong> arrastrando su interior y
        <strong>redimensionarlo</strong> desde los bordes. Con
        <strong>clic derecho</strong> se abre un menú para elegir el modo
        (<em>Intersect</em>: la serie toca la caja / <em>Contains</em>: la serie queda
        contenida), negar la condición (<em>Not</em>) y combinar varias cajas
        (<em>And</em> / <em>Or</em>).</p>`,
    },
    {
      title: "Grupos de selección",
      element: el("groups"),
      html: `
        <p>Cada grupo reúne varios TimeBoxes y tiene su propio color.</p>
        <ul>
          <li>El <strong>checkbox</strong> activa o desactiva el grupo.</li>
          <li>Haz clic en el <strong>cuadrado de color</strong> para hacerlo el grupo activo
            (las nuevas cajas se añaden a él).</li>
          <li><strong>(n)</strong> indica cuántas series cumplen su consulta y
            <strong>✕</strong> lo elimina.</li>
          <li><em>«Non selected»</em> muestra u oculta las series sin seleccionar.</li>
        </ul>`,
    },
    {
      title: "Coordenadas del TimeBox",
      element: el("coordinates"),
      html: `
        <p>Estos campos muestran los límites (X e Y) de la caja seleccionada y permiten
        editarlos numéricamente para colocarla con precisión.</p>
        <p>También puedes desplazar la caja seleccionada con las
        <strong>flechas del teclado</strong>.</p>`,
    },
    {
      title: "Curvas de referencia",
      element: el("referenceCurves"),
      html: `
        <p>Las curvas de referencia se dibujan sobre el gráfico y sirven para consultar
        las series respecto a ellas.</p>
        <ul>
          <li>En las <strong>polilíneas</strong>, <em>«Add Slider»</em> añade un slider que
            selecciona las series por encima o por debajo de un tramo de la curva
            (doble clic sobre el slider cambia de lado).</li>
          <li>En las <strong>curvas de puntos</strong>, <em>«Add Association»</em> selecciona
            las series que pasan cerca de los puntos, con la tolerancia de
            <em>«Collision Tolerance»</em>.</li>
        </ul>`,
    },
    {
      title: "Grupos de datos",
      element: el("dataGroups"),
      html: `
        <p>Las series están coloreadas por categoría. Cada botón activa o desactiva
        las series de una categoría para centrarte solo en las que te interesen.</p>`,
    },
    {
      title: "Vista de detalles",
      element: el("details"),
      html: `
        <p>Aquí aparece un gráfico individual por cada serie seleccionada del grupo
        activo, para examinarlas una a una.</p>`,
    },
    {
      title: "Atajos de teclado",
      element: null,
      html: `
        <p>Con el gráfico enfocado (haz clic sobre él):</p>
        <ul>
          <li>${kbd("R")} / ${kbd("Supr")}: elimina la caja seleccionada.</li>
          <li>${kbd("+")}: añade un grupo nuevo.</li>
          <li>${kbd("←")} ${kbd("→")} ${kbd("↑")} ${kbd("↓")}: desplaza la caja seleccionada.</li>
          <li>${kbd("I")}: invierte la consulta del grupo (NOT).</li>
        </ul>`,
    },
    {
      title: "¡Listo!",
      element: null,
      html: `
        <p>Ya conoces las partes principales de TimeWidget.</p>
        <p>Puedes consultar la documentación completa en cualquier momento pulsando el
        botón <strong>«?»</strong> de la esquina superior derecha del widget.</p>`,
    },
  ];
}

// ─── English content ────────────────────────────────────────────────────────
function buildDocSectionsEN() {
  return [
    {
      title: "What is TimeWidget?",
      open: true,
      html: `
        <p>TimeWidget is an interactive tool for exploring collections of time series.
        It lets you filter series by drawing selection boxes (<strong>TimeBoxes</strong>)
        directly on the chart, organize selections into <strong>groups</strong>, and
        compare them against <strong>reference curves</strong>.</p>
        <p>Press <em>«Start guided tour»</em> (above) for a step-by-step walkthrough
        of every part of the tool.</p>`,
    },
    {
      title: "Overview (the chart)",
      html: `
        <ul>
          <li><strong>Grey lines</strong> are series that do not match any active selection.</li>
          <li><strong>Colored lines</strong> are selected series; the color corresponds to their group.</li>
          <li>The <strong>dashed line</strong> is the median of the series in each active group (toggle with <code>showGroupMedian</code>).</li>
          <li>The <em>«Groups + :»</em> label above the chart creates a new group on click.</li>
          <li><code>showGrid</code> shows a reference grid; <code>doubleYlegend</code> mirrors the Y axis on the right.</li>
        </ul>`,
    },
    {
      title: "TimeBoxes (selection boxes)",
      html: `
        <p>A TimeBox defines a rectangle [X range] × [Y range]. Series that satisfy it
        are assigned to the group that owns the box.</p>
        <ul>
          <li><strong>Create:</strong> click and drag on an empty area of the chart.</li>
          <li><strong>Move:</strong> drag the inside of the box. <strong>Resize:</strong> drag its edges or corners.</li>
          <li><strong>Select:</strong> click a box to make it active (highlighted with a shadow); its coordinates appear in the coordinates panel.</li>
          <li><strong>Delete:</strong> with the box selected, press ${kbd("R")}, ${kbd("Del")}, or ${kbd("Backspace")}.</li>
        </ul>
        <p><strong>Context menu</strong> (right-click on the box):</p>
        <ul>
          <li><strong>Mode → Intersect:</strong> selects series that <em>touch</em> the box at any point.</li>
          <li><strong>Mode → Contains:</strong> selects only series whose segment within the X range is fully <em>contained</em> in the box.</li>
          <li><strong>Not:</strong> inverts the box condition (excludes matching series).</li>
          <li><strong>Aggregation → And:</strong> a series must satisfy <em>all</em> boxes in the group.</li>
          <li><strong>Aggregation → Or:</strong> satisfying <em>any one</em> box in the group is enough.</li>
        </ul>
        <p>When <code>showBrushTooltip</code> is active, a tooltip with the box coordinates is shown while drawing or moving.</p>`,
    },
    {
      title: "Selection groups",
      html: `
        <p>Each group holds one or more TimeBoxes and has its own color. The
        <em>Groups</em> panel lets you manage them:</p>
        <ul>
          <li><strong>Checkbox:</strong> enables or disables the group (its series stop being colored).</li>
          <li><strong>Color square:</strong> click to make it the <em>active</em> group (black border); new TimeBoxes are added to the active group.</li>
          <li><strong>Name:</strong> editable directly in the field.</li>
          <li><strong>(n):</strong> number of series currently matching the group's query.</li>
          <li><strong>✕:</strong> removes the group and all its boxes.</li>
          <li><strong>Add Group:</strong> creates a new group (also via ${kbd("+")} or the «Groups + :» label on the chart).</li>
          <li><strong>Non selected (n):</strong> shows or hides series that belong to no group.</li>
        </ul>`,
    },
    {
      title: "TimeBox coordinates",
      html: `
        <p>The coordinates panel shows the bounds of the selected box
        (start/end X and bottom/top Y) and lets you edit them numerically
        for precise positioning. The step size is controlled by
        <code>stepX</code> and <code>stepY</code>.</p>
        <p>When a reference curve <em>slider</em> is selected, the panel
        switches to showing (and editing) its X coordinates.</p>`,
    },
    {
      title: "Reference curves",
      html: `
        <p>Reference curves (<code>referenceCurves</code> parameter) are curves or
        point sets drawn on the chart that act both as visual references and as
        query mechanisms. They can be defined with explicit data, a function
        <code>y = f(x)</code>, a polynomial, or a parametric curve.</p>
        <p>In the <em>Reference Curves</em> panel, each curve has:</p>
        <ul>
          <li><strong>Checkbox:</strong> shows or hides the curve.</li>
          <li><strong>Color picker</strong> and <strong>editable name</strong>.</li>
          <li><strong>Add Slider</strong> (polylines): adds a slider linked to the active group.</li>
          <li><strong>Add Association</strong> (point curves): associates the curve with the active group.</li>
          <li><strong>Collision Tolerance</strong> (point curves): proximity radius (in Y-axis units) within which a series is considered to «pass through» a point.</li>
        </ul>
        <p><strong>Associations</strong> select series that pass within the tolerance distance of the curve's points. Each association can be enabled/disabled and combined with <strong>AND / OR / NOT</strong> with the rest of the group's conditions.</p>`,
    },
    {
      title: "Sliders on curves",
      html: `
        <p>A slider delimits a [left, right] segment of a reference polyline and selects
        the series that lie <em>above</em> («above») or <em>below</em> («below») the
        curve in that range.</p>
        <ul>
          <li><strong>Move:</strong> drag the shaded area of the slider.</li>
          <li><strong>Adjust edges:</strong> drag the vertical edge lines.</li>
          <li><strong>Toggle side:</strong> double-click the slider, or use the ↑/↓ button in the panel.</li>
          <li><strong>Context menu</strong> (right-click): same options as TimeBoxes (Intersect/Contains, Not, And/Or).</li>
          <li>The panel also lets you rename, enable/disable, or delete (✕) a slider.</li>
        </ul>`,
    },
    {
      title: "Data groups (color attribute)",
      html: `
        <p>When the widget is created with the <code>color</code> parameter, series are
        colored by category and a <em>«Data groups»</em> row appears with one button per
        category. Click a button to hide or show the series of that category.</p>`,
    },
    {
      title: "Details view",
      html: `
        <p>When <code>hasDetails</code> is active, an individual chart is shown for each
        selected series in the active group (up to <code>maxDetailsRecords</code> charts
        at a time, with scroll for the rest).</p>`,
    },
    {
      title: "Keyboard shortcuts",
      html: `
        <p>Work with the chart focused (click on it first):</p>
        <table class="__tw-help-table">
          <tr><th>Key</th><th>Action</th></tr>
          <tr><td>${kbd("R")} / ${kbd("Del")} / ${kbd("Backspace")}</td><td>Delete the selected TimeBox</td></tr>
          <tr><td>${kbd("+")}</td><td>Add a new group</td></tr>
          <tr><td>${kbd("←")} ${kbd("→")} ${kbd("↑")} ${kbd("↓")}</td><td>Move the selected TimeBox (steps of <code>stepX</code> / <code>stepY</code>)</td></tr>
          <tr><td>${kbd("I")}</td><td>Invert the selected group's query (NOT)</td></tr>
        </table>`,
    },
    {
      title: "Configuration parameters (API)",
      html: `
        <p>Main options when creating the widget: <code>TimeWidget(data, options)</code>.</p>
        <p><strong>Data &amp; axes</strong></p>
        <table class="__tw-help-table">
          <tr><th>Parameter</th><th>Description</th></tr>
          <tr><td><code>x</code>, <code>y</code>, <code>id</code></td><td>Attributes (or functions) for the X axis, Y axis, and series identifier.</td></tr>
          <tr><td><code>color</code></td><td>Attribute to color series by category (creates «Data groups»).</td></tr>
          <tr><td><code>referenceCurves</code></td><td>Array of reference curves (data, function, polynomial, or parametric).</td></tr>
          <tr><td><code>filters</code></td><td>Initial TimeBoxes loaded when the widget starts.</td></tr>
          <tr><td><code>xDomain</code> / <code>yDomain</code></td><td>Domain for each axis (defaults to data extent).</td></tr>
          <tr><td><code>xScale</code> / <code>yScale</code></td><td>D3 scales to use for each axis.</td></tr>
          <tr><td><code>fmtX</code> / <code>fmtY</code></td><td>Format for X/Y values in tooltips and coordinates.</td></tr>
          <tr><td><code>stepX</code> / <code>stepY</code></td><td>Step used by the coordinate spinboxes and arrow keys.</td></tr>
          <tr><td><code>xTicks</code> / <code>yTicks</code>, <code>xLabel</code> / <code>yLabel</code></td><td>Custom axis tick labels and axis titles.</td></tr>
        </table>
        <p><strong>Appearance</strong></p>
        <table class="__tw-help-table">
          <tr><th>Parameter</th><th>Description</th></tr>
          <tr><td><code>width</code> / <code>height</code></td><td>Size of the main chart.</td></tr>
          <tr><td><code>detailsWidth</code> / <code>detailsHeight</code> / <code>detailsContainerHeight</code></td><td>Size of the details view.</td></tr>
          <tr><td><code>margin</code>, <code>backgroundColor</code></td><td>Margins and background color.</td></tr>
          <tr><td><code>defaultColor</code> / <code>selectedColor</code> / <code>noSelectedColor</code></td><td>Line colors (no selection / selected / unselected) when <code>color</code> is not used.</td></tr>
          <tr><td><code>defaultAlpha</code> / <code>selectedAlpha</code> / <code>noSelectedAlpha</code></td><td>Line opacity in each state.</td></tr>
          <tr><td><code>colorScale</code> / <code>brushesColorScale</code></td><td>Color scales for data categories and groups.</td></tr>
          <tr><td><code>showGrid</code>, <code>doubleYlegend</code>, <code>brushGroupSize</code>, <code>brushShadow</code></td><td>Grid, double Y axis, group selector size, and active box shadow.</td></tr>
        </table>
        <p><strong>Behavior</strong></p>
        <table class="__tw-help-table">
          <tr><th>Parameter</th><th>Description</th></tr>
          <tr><td><code>hasDetails</code> / <code>showDetails</code></td><td>Compute / show the details view.</td></tr>
          <tr><td><code>showBrushesControls</code> / <code>showBrushesCoordinates</code> / <code>showBrushTooltip</code></td><td>Show the groups panel, coordinates panel, and brush tooltip.</td></tr>
          <tr><td><code>showHelp</code></td><td>Shows the «?» button with this help and the guided tour.</td></tr>
          <tr><td><code>showGroupMedian</code>, <code>medianNumBins</code>, <code>medianFn</code>, <code>medianMinRecordsPerBin</code></td><td>Group median: whether to show it, number of bins, aggregation function, and minimum records per bin.</td></tr>
          <tr><td><code>autoUpdate</code></td><td>Whether selection is recomputed while dragging the box or only on release.</td></tr>
          <tr><td><code>fixAxis</code>, <code>maxTimelines</code>, <code>maxDetailsRecords</code></td><td>Fixed axes on data change, series limit, and detail chart limit.</td></tr>
          <tr><td><code>updateCallback</code> / <code>statusCallback</code></td><td>Callbacks on selection change / internal state change.</td></tr>
        </table>
        <p><strong>Performance</strong></p>
        <table class="__tw-help-table">
          <tr><th>Parameter</th><th>Description</th></tr>
          <tr><td><code>renderer</code></td><td><code>'webgpu'</code> (default, GPU-accelerated) or <code>'canvas'</code> (legacy Canvas 2D).</td></tr>
          <tr><td><code>xPartitions</code> / <code>yPartitions</code></td><td>Partitions for the collision acceleration algorithm.</td></tr>
          <tr><td><code>alphaScale</code></td><td>Scale that adjusts opacity based on the number of rendered elements.</td></tr>
        </table>`,
    },
  ];
}

function buildTourStepsEN(elements) {
  const el = (key) =>
    elements && typeof elements[key] === "function" ? elements[key] : null;

  return [
    {
      title: "Welcome to TimeWidget",
      element: null,
      html: `
        <p>This guided tour walks you through the main parts of the tool in just a few steps.</p>
        <p>Use the buttons or the ${kbd("←")} ${kbd("→")} arrow keys to navigate,
        and ${kbd("Esc")} or «Exit» to quit at any time.</p>`,
    },
    {
      title: "The overview chart",
      element: el("chart"),
      html: `
        <p>All time series are drawn here on the X and Y axes.</p>
        <p><strong>Grey</strong> lines are unselected series. Once you create a selection,
        matching series are painted in their <strong>group color</strong>, and a dashed
        line shows the group median.</p>`,
    },
    {
      title: "TimeBoxes: select by drawing",
      element: el("chart"),
      html: `
        <p><strong>Click and drag</strong> on the chart to create a <em>TimeBox</em>:
        a rectangle that selects all series passing through it.</p>
        <p>You can <strong>move</strong> it by dragging its interior and
        <strong>resize</strong> it from the edges. <strong>Right-click</strong> opens a
        menu to choose the mode (<em>Intersect</em>: the series touches the box /
        <em>Contains</em>: the series is fully inside), negate the condition
        (<em>Not</em>), and combine multiple boxes (<em>And</em> / <em>Or</em>).</p>`,
    },
    {
      title: "Selection groups",
      element: el("groups"),
      html: `
        <p>Each group holds several TimeBoxes and has its own color.</p>
        <ul>
          <li>The <strong>checkbox</strong> enables or disables the group.</li>
          <li>Click the <strong>color square</strong> to make it the active group
            (new boxes are added to it).</li>
          <li><strong>(n)</strong> shows how many series match its query and
            <strong>✕</strong> removes it.</li>
          <li><em>«Non selected»</em> shows or hides unselected series.</li>
        </ul>`,
    },
    {
      title: "TimeBox coordinates",
      element: el("coordinates"),
      html: `
        <p>These fields show the bounds (X and Y) of the selected box and let you
        edit them numerically for precise placement.</p>
        <p>You can also move the selected box with the
        <strong>arrow keys</strong>.</p>`,
    },
    {
      title: "Reference curves",
      element: el("referenceCurves"),
      html: `
        <p>Reference curves are drawn on the chart and let you query series relative to them.</p>
        <ul>
          <li>For <strong>polylines</strong>, <em>«Add Slider»</em> adds a slider that
            selects series above or below a segment of the curve
            (double-click the slider to toggle side).</li>
          <li>For <strong>point curves</strong>, <em>«Add Association»</em> selects
            series that pass near the points, within the <em>«Collision Tolerance»</em>.</li>
        </ul>`,
    },
    {
      title: "Data groups",
      element: el("dataGroups"),
      html: `
        <p>Series are colored by category. Each button enables or disables
        the series of a category so you can focus on what matters.</p>`,
    },
    {
      title: "Details view",
      element: el("details"),
      html: `
        <p>An individual chart is shown here for each selected series in the active
        group, so you can examine them one by one.</p>`,
    },
    {
      title: "Keyboard shortcuts",
      element: null,
      html: `
        <p>With the chart focused (click on it first):</p>
        <ul>
          <li>${kbd("R")} / ${kbd("Del")}: delete the selected box.</li>
          <li>${kbd("+")}: add a new group.</li>
          <li>${kbd("←")} ${kbd("→")} ${kbd("↑")} ${kbd("↓")}: move the selected box.</li>
          <li>${kbd("I")}: invert the group's query (NOT).</li>
        </ul>`,
    },
    {
      title: "All done!",
      element: null,
      html: `
        <p>You now know the main parts of TimeWidget.</p>
        <p>You can consult the full documentation at any time by clicking the
        <strong>«?»</strong> button in the top-right corner of the widget.</p>`,
    },
  ];
}

function isVisible(el) {
  if (!el || !el.getBoundingClientRect || !document.body.contains(el))
    return false;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  const style = window.getComputedStyle(el);
  return style.display !== "none" && style.visibility !== "hidden";
}

function HelpSystem({
  container,
  elements = {},
  docSections = null,
  tourSteps = null,
  showButton = true,
  lang = "es",
} = {}) {
  injectStyles();

  const isEN = lang === "en";
  const i18n = {
    helpTitle:     isEN ? "TimeWidget Help"          : "Ayuda de TimeWidget",
    close:         isEN ? "Close"                    : "Cerrar",
    tourCta:       isEN ? "▶ Start guided tour"      : "▶ Iniciar demo guiada",
    prev:          isEN ? "← Previous"               : "← Anterior",
    next:          isEN ? "Next →"                   : "Siguiente →",
    finish:        isEN ? "Finish ✓"                 : "Finalizar ✓",
    exit:          isEN ? "Exit"                     : "Salir",
    btnTitle:      isEN ? "Help & guided tour"       : "Ayuda y demo guiada",
    btnAriaLabel:  isEN ? "TimeWidget help"          : "Ayuda de TimeWidget",
    notActiveNote: isEN
      ? "⚠ This feature is not active in the current widget instance. You can enable it via the corresponding configuration parameters."
      : "⚠ Esta funcionalidad no está activa en la instancia actual del widget. Puedes habilitarla con los parámetros de configuración correspondientes.",
  };

  docSections = docSections || (isEN ? buildDocSectionsEN() : buildDocSections());
  tourSteps   = tourSteps   || (isEN ? buildTourStepsEN(elements) : buildTourSteps(elements));

  // ── Botón "?" ─────────────────────────────────────────────────────────────
  let helpBtn = null;
  if (showButton && container) {
    helpBtn = document.createElement("button");
    helpBtn.className = "__tw-help-btn";
    helpBtn.textContent = "?";
    helpBtn.title = i18n.btnTitle;
    helpBtn.setAttribute("aria-label", i18n.btnAriaLabel);
    helpBtn.addEventListener("click", showHelp);
    container.appendChild(helpBtn);
  }

  // ── Popup de documentación ────────────────────────────────────────────────
  let overlay = null;

  // Cambia el idioma activo y reconstruye modal + pasos del tour
  function switchLang(newLang) {
    if (newLang === activeLang) return;
    activeLang = newLang;
    const en = activeLang === "en";
    Object.assign(i18n, {
      helpTitle:     en ? "TimeWidget Help"          : "Ayuda de TimeWidget",
      close:         en ? "Close"                    : "Cerrar",
      tourCta:       en ? "▶ Start guided tour"      : "▶ Iniciar demo guiada",
      prev:          en ? "← Previous"               : "← Anterior",
      next:          en ? "Next →"                   : "Siguiente →",
      finish:        en ? "Finish ✓"                 : "Finalizar ✓",
      exit:          en ? "Exit"                     : "Salir",
      btnTitle:      en ? "Help & guided tour"       : "Ayuda y demo guiada",
      btnAriaLabel:  en ? "TimeWidget help"          : "Ayuda de TimeWidget",
      notActiveNote: en
        ? "⚠ This feature is not active in the current widget instance. You can enable it via the corresponding configuration parameters."
        : "⚠ Esta funcionalidad no está activa en la instancia actual del widget. Puedes habilitarla con los parámetros de configuración correspondientes.",
    });
    docSections = en ? buildDocSectionsEN() : buildDocSections();
    tourSteps   = en ? buildTourStepsEN(elements) : buildTourSteps(elements);
    // Fuerza reconstrucción del modal y actualiza el botón
    if (overlay && overlay.parentNode) {
      overlay.parentNode.removeChild(overlay);
      overlay = null;
      showHelp();
    } else {
      overlay = null;
    }
    if (helpBtn) {
      helpBtn.title = i18n.btnTitle;
      helpBtn.setAttribute("aria-label", i18n.btnAriaLabel);
    }
    // Actualiza estado visual de los botones de idioma
    if (langBtnES) langBtnES.classList.toggle("__tw-lang-active", activeLang === "es");
    if (langBtnEN) langBtnEN.classList.toggle("__tw-lang-active", activeLang === "en");
  }

  let activeLang = lang;
  let langBtnES = null, langBtnEN = null;

  function buildModal() {
    overlay = document.createElement("div");
    overlay.className = "__tw-help-overlay";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) hideHelp();
    });

    const modal = document.createElement("div");
    modal.className = "__tw-help-modal";

    const header = document.createElement("div");
    header.className = "__tw-help-modal-header";
    header.innerHTML = `<h2>${i18n.helpTitle}</h2>`;

    // Selector de idioma ES / EN
    const langSwitcher = document.createElement("div");
    langSwitcher.className = "__tw-lang-switcher";
    langBtnES = document.createElement("button");
    langBtnES.className = "__tw-lang-btn" + (activeLang === "es" ? " __tw-lang-active" : "");
    langBtnES.textContent = "ES";
    langBtnES.title = "Español";
    langBtnES.addEventListener("click", () => switchLang("es"));
    langBtnEN = document.createElement("button");
    langBtnEN.className = "__tw-lang-btn" + (activeLang === "en" ? " __tw-lang-active" : "");
    langBtnEN.textContent = "EN";
    langBtnEN.title = "English";
    langBtnEN.addEventListener("click", () => switchLang("en"));
    langSwitcher.appendChild(langBtnES);
    langSwitcher.appendChild(langBtnEN);

    const closeBtn = document.createElement("button");
    closeBtn.className = "__tw-help-x";
    closeBtn.innerHTML = "&times;";
    closeBtn.title = i18n.close;
    closeBtn.addEventListener("click", hideHelp);

    header.appendChild(langSwitcher);
    header.appendChild(closeBtn);

    const body = document.createElement("div");
    body.className = "__tw-help-modal-body";

    const tourCta = document.createElement("button");
    tourCta.className = "__tw-help-tour-cta";
    tourCta.textContent = i18n.tourCta;
    tourCta.addEventListener("click", () => {
      hideHelp();
      startTour();
    });
    body.appendChild(tourCta);

    docSections.forEach((section) => {
      const details = document.createElement("details");
      details.className = "__tw-help-section";
      if (section.open) details.open = true;
      const summary = document.createElement("summary");
      summary.textContent = section.title;
      const sectionBody = document.createElement("div");
      sectionBody.className = "__tw-help-section-body";
      sectionBody.innerHTML = section.html;
      details.appendChild(summary);
      details.appendChild(sectionBody);
      body.appendChild(details);
    });

    modal.appendChild(header);
    modal.appendChild(body);
    overlay.appendChild(modal);
  }

  function onModalKeydown(e) {
    if (e.key === "Escape") hideHelp();
  }

  function showHelp() {
    if (tourActive) endTour();
    if (!overlay) buildModal();
    if (!overlay.parentNode) document.body.appendChild(overlay);
    document.addEventListener("keydown", onModalKeydown, true);
  }

  function hideHelp() {
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    document.removeEventListener("keydown", onModalKeydown, true);
  }

  // ── Demo guiada (tour) ────────────────────────────────────────────────────
  let tourActive = false;
  let activeSteps = [];
  let stepIndex = 0;
  let dimEl = null,
    highlightEl = null,
    cardEl = null,
    cardTitle = null,
    cardCounter = null,
    cardBody = null,
    btnPrev = null,
    btnNext = null;

  function buildTourDom() {
    dimEl = document.createElement("div");
    dimEl.className = "__tw-tour-dim";

    highlightEl = document.createElement("div");
    highlightEl.className = "__tw-tour-highlight";

    cardEl = document.createElement("div");
    cardEl.className = "__tw-tour-card";

    const header = document.createElement("div");
    header.className = "__tw-tour-card-header";
    cardTitle = document.createElement("h3");
    cardCounter = document.createElement("span");
    cardCounter.className = "__tw-tour-step-counter";
    header.appendChild(cardTitle);
    header.appendChild(cardCounter);

    cardBody = document.createElement("div");
    cardBody.className = "__tw-tour-card-body";

    const footer = document.createElement("div");
    footer.className = "__tw-tour-card-footer";
    const exitBtn = document.createElement("button");
    exitBtn.className = "__tw-tour-exit";
    exitBtn.textContent = i18n.exit;
    exitBtn.addEventListener("click", endTour);
    const navDiv = document.createElement("div");
    btnPrev = document.createElement("button");
    btnPrev.className = "__tw-tour-btn";
    btnPrev.textContent = i18n.prev;
    btnPrev.style.marginRight = "6px";
    btnPrev.addEventListener("click", () => showStep(stepIndex - 1));
    btnNext = document.createElement("button");
    btnNext.className = "__tw-tour-btn __tw-primary";
    btnNext.addEventListener("click", () => {
      if (stepIndex >= activeSteps.length - 1) endTour();
      else showStep(stepIndex + 1);
    });
    navDiv.appendChild(btnPrev);
    navDiv.appendChild(btnNext);
    footer.appendChild(exitBtn);
    footer.appendChild(navDiv);

    cardEl.appendChild(header);
    cardEl.appendChild(cardBody);
    cardEl.appendChild(footer);
  }

  function onTourKeydown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      endTour();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      if (stepIndex >= activeSteps.length - 1) endTour();
      else showStep(stepIndex + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (stepIndex > 0) showStep(stepIndex - 1);
    }
  }

  function onTourReposition() {
    if (tourActive) positionStep(activeSteps[stepIndex]);
  }

  function startTour() {
    if (tourActive) return;
    hideHelp();

    // Se muestran todos los pasos siempre. Si el elemento de un paso no existe
    // o no es visible en esta instancia, la tarjeta aparece centrada sin resaltar
    // nada, informando al usuario de que esa funcionalidad existe pero no está activa.
    activeSteps = tourSteps;
    if (activeSteps.length === 0) return;

    if (!cardEl) buildTourDom();
    document.body.appendChild(dimEl);
    document.body.appendChild(highlightEl);
    document.body.appendChild(cardEl);
    document.addEventListener("keydown", onTourKeydown, true);
    window.addEventListener("resize", onTourReposition);
    window.addEventListener("scroll", onTourReposition, true);

    tourActive = true;
    showStep(0);
  }

  function endTour() {
    if (!tourActive) return;
    tourActive = false;
    [dimEl, highlightEl, cardEl].forEach((el) => {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    document.removeEventListener("keydown", onTourKeydown, true);
    window.removeEventListener("resize", onTourReposition);
    window.removeEventListener("scroll", onTourReposition, true);
  }

  function showStep(i) {
    stepIndex = Math.max(0, Math.min(i, activeSteps.length - 1));
    const step = activeSteps[stepIndex];

    cardTitle.textContent = step.title;
    cardCounter.textContent = `${stepIndex + 1} / ${activeSteps.length}`;

    const targetEl = step.element ? step.element() : null;
    const elementPresent = targetEl && isVisible(targetEl);
    const notActiveNote =
      step.element && !elementPresent
        ? `<p style="margin-top:8px;padding:5px 8px;background:#fff8e1;border-left:3px solid #f0c040;font-size:.8rem;color:#7a5c00;">
            ${i18n.notActiveNote}
           </p>`
        : "";
    cardBody.innerHTML = step.html + notActiveNote;

    btnPrev.disabled = stepIndex === 0;
    btnNext.textContent =
      stepIndex >= activeSteps.length - 1 ? i18n.finish : i18n.next;

    if (elementPresent) {
      targetEl.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
    positionStep(step);
  }

  function positionStep(step) {
    const targetEl = step && step.element ? step.element() : null;
    const pad = 6;

    if (targetEl && isVisible(targetEl)) {
      const r = targetEl.getBoundingClientRect();
      dimEl.style.background = "transparent"; // el sombreado lo aporta el box-shadow del resaltado
      highlightEl.style.display = "block";
      highlightEl.style.left = r.left - pad + "px";
      highlightEl.style.top = r.top - pad + "px";
      highlightEl.style.width = r.width + pad * 2 + "px";
      highlightEl.style.height = r.height + pad * 2 + "px";
      positionCardNear(r);
    } else {
      dimEl.style.background = "rgba(0,0,0,.5)";
      highlightEl.style.display = "none";
      centerCard();
    }
  }

  function centerCard() {
    const w = cardEl.offsetWidth;
    const h = cardEl.offsetHeight;
    cardEl.style.left = Math.max(8, (window.innerWidth - w) / 2) + "px";
    cardEl.style.top = Math.max(8, (window.innerHeight - h) / 2) + "px";
  }

  function positionCardNear(rect) {
    const gap = 14;
    const w = cardEl.offsetWidth;
    const h = cardEl.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left, top;
    if (rect.right + gap + w <= vw) {
      // a la derecha del elemento
      left = rect.right + gap;
      top = rect.top;
    } else if (rect.bottom + gap + h <= vh) {
      // debajo
      left = rect.left;
      top = rect.bottom + gap;
    } else if (rect.top - gap - h >= 0) {
      // encima
      left = rect.left;
      top = rect.top - gap - h;
    } else if (rect.left - gap - w >= 0) {
      // a la izquierda
      left = rect.left - gap - w;
      top = rect.top;
    } else {
      centerCard();
      return;
    }

    cardEl.style.left = Math.max(8, Math.min(left, vw - w - 8)) + "px";
    cardEl.style.top = Math.max(8, Math.min(top, vh - h - 8)) + "px";
  }

  function destroy() {
    endTour();
    hideHelp();
    if (helpBtn && helpBtn.parentNode) helpBtn.parentNode.removeChild(helpBtn);
  }

  return { showHelp, hideHelp, startTour, endTour, destroy, button: helpBtn };
}

export default HelpSystem;

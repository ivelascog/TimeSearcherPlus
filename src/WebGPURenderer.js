
// Clase principal del renderer usando la API WebGPU.
// Envía datos en bruto a la GPU y ejecuta pipelines de renderizado WGSL.

/**
 * Parsea un color CSS en formato #rrggbb o #rgb a un vector [r, g, b] normalizado [0-1].
 * Versión pura sin dependencias DOM, segura en entornos sin document.
 * Acepta cualquier string que el canvas 2D aceptaría, con fallback a blanco.
 * @param {string} colorStr
 * @returns {[number, number, number]}
 */
function parseCSSColorToVec3(colorStr) {
  if (!colorStr) return [1, 1, 1];
  const s = colorStr.trim();

  // Formato #rrggbb
  if (/^#[0-9a-fA-F]{6}$/.test(s)) {
    return [
      parseInt(s.slice(1, 3), 16) / 255,
      parseInt(s.slice(3, 5), 16) / 255,
      parseInt(s.slice(5, 7), 16) / 255,
    ];
  }
  // Formato #rgb (abreviado)
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return [
      parseInt(s[1] + s[1], 16) / 255,
      parseInt(s[2] + s[2], 16) / 255,
      parseInt(s[3] + s[3], 16) / 255,
    ];
  }
  // Formato rgb(r, g, b)
  const rgbMatch = s.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
  if (rgbMatch) {
    return [
      parseInt(rgbMatch[1]) / 255,
      parseInt(rgbMatch[2]) / 255,
      parseInt(rgbMatch[3]) / 255,
    ];
  }
  // Fallback: blanco
  return [1, 1, 1];
}

export default class WebGPURenderer {
  constructor() {
    this.device = null;
    this.context = null;
    this.pipeline = null;
    this.vertexBuffer = null;
    this.styleBuffer = null;
    this.uniformBuffer = null;
    this.bindGroup = null;
    // Inicializar como array vacío para que draw() pueda hacer null-checks seguros
    this.bindGroups = [];
    this.points = null;
    this.lineIndices = null;
    this.presentationFormat = navigator.gpu ? navigator.gpu.getPreferredCanvasFormat() : 'bgra8unorm';
    
    this.thickLinePipeline = null;
    this.medianVertexBuffer = null;
    this.medianStyleBuffer = null;
    this.medianBindGroup = null;
    this.medianVertexCount = 0;
    this.medianCount = 0;
    this.medianJointCount = 0;
    
    this.haloBindGroup = null;
    this.haloStyleBuffer = null;
    this.jointPipeline = null;
    this.medianJointBuffer = null;

    this.haloJointPipeline = null;
    this.haloThickPipeline = null;
    this.stencilTexture = null;
    this.stencilTextureView = null;

    this.msaaTexture = null;
    this.msaaTextureView = null;
    this.sampleCount = 4;

    this.indexBuffer = null;
    this.indexCount = 0;

    this._mainRenderBundle = null;
    this._renderBundleDirty = true;

    this._uniformData = new Float32Array(8);
    this._lastUniformKey = null;
  }

  // Inicialización asíncrona: primero pedimos el "adapter" (la GPU física)
  // y luego el "device" (la conexión lógica con ella). Si falla devolvemos false
  // para que el código que llame a esto pueda hacer fallback al canvas 2D.
  init(canvas) {
    if (!navigator.gpu) {
      console.error("WebGPU not supported on this browser.");
      return Promise.resolve(false);
    }

    return navigator.gpu.requestAdapter().then(adapter => {
        if (!adapter) {
            console.error("No WebGPU adapter found.");
            return Promise.resolve(false);
        }
        return adapter.requestDevice().then(device => {
            this.device = device;
            this.context = canvas.getContext("webgpu");

            if (!this.context) {
                console.error("Failed to get WebGPU context from canvas.");
                return false;
            }

            this.context.configure({
                device: this.device,
                format: this.presentationFormat,
                alphaMode: "opaque",
            });

            // Crear la textura MSAA al inicio con el tamaño actual del canvas
            this._createMSAATexture(canvas.width, canvas.height);

            return this.initPipeline().then(() => true);
        });
    });
  }

  // Aquí se compilan los shaders WGSL y se configuran los pipelines de renderizado.

  initPipeline() {
    // Shader compacto para líneas principales: lee solo color (vec4, 16 bytes/línea).
    // Reduce el style buffer de 32 bytes a 16 bytes, mejorando la tasa de acierto en
    // caché L2 de la GPU (crítico para N > 50k donde el buffer supera la capacidad L2).
    const compactShaderModule = this.device.createShaderModule({
      label: "Compact Line Shader (color only)",
      code: `
        struct Uniforms {
          domainX: vec2<f32>,
          domainY: vec2<f32>,
          screenSize: vec2<f32>,
          _pad: vec2<f32>,
        }

        @group(0) @binding(0) var<uniform> uniforms: Uniforms;
        @group(0) @binding(1) var<storage, read> lineColors: array<vec4<f32>>;

        struct VertexInput {
            @location(0) position: vec2<f32>,
            @location(1) lineIndex: f32,
        }

        struct VertexOutput {
            @builtin(position) position: vec4<f32>,
            @location(0) color: vec4<f32>,
        }

        @vertex
        fn vs_main(input: VertexInput) -> VertexOutput {
            var output: VertexOutput;
            let xNorm = (input.position.x - uniforms.domainX.x) / (uniforms.domainX.y - uniforms.domainX.x);
            let yNorm = (input.position.y - uniforms.domainY.x) / (uniforms.domainY.y - uniforms.domainY.x);
            output.position = vec4<f32>(-1.0 + 2.0 * xNorm, -1.0 + 2.0 * yNorm, 0.0, 1.0);
            output.color = lineColors[u32(input.lineIndex)];
            return output;
        }

        @fragment
        fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
            if (input.color.a <= 0.0) { discard; }
            return input.color;
        }
      `,
    });

    const shaderModule = this.device.createShaderModule({
      label: "Line Shader with Dash Support",
      code: `
        struct Uniforms {
          domainX: vec2<f32>,
          domainY: vec2<f32>,
          screenSize: vec2<f32>,
          _pad: vec2<f32>,
        }

        struct LineStyle {
            color: vec4<f32>,      // 16 bytes (offset 0)
            params: vec4<f32>,     // 16 bytes (offset 16)
            // params.x = dashOn (pixels)
            // params.y = dashOff (pixels)
            // params.z = lineWidth
            // params.w = selectionFlag (unused in single-pass renderer)
        }

        @group(0) @binding(0) var<uniform> uniforms: Uniforms;
        @group(0) @binding(1) var<storage, read> lineStyles: array<LineStyle>;

        struct VertexInput {
            @location(0) position: vec2<f32>,
            @location(1) lineIndex: f32,
        }

        struct VertexOutput {
            @builtin(position) position: vec4<f32>,
            @location(0) color: vec4<f32>,
            @location(1) worldPos: vec2<f32>,
            @location(2) lineLength: f32,
            @location(3) dashPattern: vec2<f32>, // (dashOn, dashOff)
        }

        @vertex
        fn vs_main(input: VertexInput) -> VertexOutput {
            var output: VertexOutput;

            let xNorm = (input.position.x - uniforms.domainX.x) / (uniforms.domainX.y - uniforms.domainX.x);
            let yNorm = (input.position.y - uniforms.domainY.x) / (uniforms.domainY.y - uniforms.domainY.x);

            let xClip = -1.0 + 2.0 * xNorm;
            // D3 y=0 is top; WebGPU clip y=1 is top — same direction, no flip needed
            let yClip = -1.0 + 2.0 * yNorm;

            output.position = vec4<f32>(xClip, yClip, 0.0, 1.0);
            output.worldPos = input.position;

            let style = lineStyles[u32(input.lineIndex)];
            // Color (rgba) and dash params already encode selection state — no pass filtering needed
            output.color = style.color;
            output.dashPattern = vec2<f32>(style.params.x, style.params.y);
            output.lineLength = 0.0;

            return output;
        }

        @fragment
        fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
            // Discard transparent lines (alpha == 0 means the style map didn't include this line)
            if (input.color.a <= 0.0) {
                discard;
            }

            // Dash pattern (dashOn > 0 activates it)
            if (input.dashPattern.x > 0.0) {
                let dashOn = input.dashPattern.x;
                let dashOff = input.dashPattern.y;
                let dashPeriod = dashOn + dashOff;
                let dist = input.position.x + input.position.y;
                let dashCycle = fract(dist / dashPeriod);
                let dashRatio = dashOn / dashPeriod;
                if (dashCycle > dashRatio) {
                    discard;
                }
            }

            return input.color;
        }

        struct ThickVertexInput {
            @location(0) position: vec2<f32>,
            @location(1) otherPosition: vec2<f32>,
            @location(2) side: f32,
            @location(3) lineIndex: f32,
            @location(4) t: f32,
        }

        struct ThickVertexOutput {
            @builtin(position) position: vec4<f32>,
            @location(0) color: vec4<f32>,
            @location(1) dashPattern: vec2<f32>,
            @location(2) uv: vec2<f32>,
        }

        @vertex
        fn vs_thick(input: ThickVertexInput) -> ThickVertexOutput {
            var output: ThickVertexOutput;
            
            let p1Norm = vec2<f32>(
                (input.position.x - uniforms.domainX.x) / (uniforms.domainX.y - uniforms.domainX.x),
                (input.position.y - uniforms.domainY.x) / (uniforms.domainY.y - uniforms.domainY.x)
            );
            let p2Norm = vec2<f32>(
                (input.otherPosition.x - uniforms.domainX.x) / (uniforms.domainX.y - uniforms.domainX.x),
                (input.otherPosition.y - uniforms.domainY.x) / (uniforms.domainY.y - uniforms.domainY.x)
            );

            let p1Screen = p1Norm * uniforms.screenSize;
            let p2Screen = p2Norm * uniforms.screenSize;
            
            let style = lineStyles[u32(input.lineIndex)];
            let width = style.params.z;
            
            var dir = p2Screen - p1Screen;
            if (length(dir) < 0.0001) {
                dir = vec2<f32>(1.0, 0.0);
            }
            let segLen = length(dir);
            let unitDir = normalize(dir);
            let unitNormal = vec2<f32>(-unitDir.y, unitDir.x);
            
            let offsetPos = p1Screen + unitNormal * input.side * (width / 2.0);
            let pClip = (offsetPos / uniforms.screenSize) * 2.0 - 1.0;
            
            output.position = vec4<f32>(pClip.x, pClip.y, 0.0, 1.0);
            output.color = style.color;
            output.dashPattern = vec2<f32>(style.params.x, style.params.y);
            output.uv = vec2<f32>(input.side, input.t * segLen);
            
            return output;
        }

        @fragment
        fn fs_thick(input: ThickVertexOutput) -> @location(0) vec4<f32> {
            if (input.dashPattern.x > 0.0) {
                let dashPeriod = input.dashPattern.x + input.dashPattern.y;
                let segDist = input.uv.y;
                if (fract(segDist / dashPeriod) > (input.dashPattern.x / dashPeriod)) {
                    discard;
                }
            }
            // Suavizado de borde sutil en los extremos laterales del quad
            let edgeFade = 1.0 - smoothstep(0.88, 1.0, abs(input.uv.x));
            var col = input.color;
            col.a = col.a * edgeFade;
            return col;
        }

        struct JointVertexInput {
            @location(0) position: vec2<f32>,
            @location(1) offset: vec2<f32>,
            @location(2) lineIndex: f32,
        }

        struct JointVertexOutput {
            @builtin(position) position: vec4<f32>,
            @location(0) color: vec4<f32>,
            @location(1) uv: vec2<f32>,
        }

        @vertex
        fn vs_joint(input: JointVertexInput) -> JointVertexOutput {
            var output: JointVertexOutput;
            
            let pNorm = vec2<f32>(
                (input.position.x - uniforms.domainX.x) / (uniforms.domainX.y - uniforms.domainX.x),
                (input.position.y - uniforms.domainY.x) / (uniforms.domainY.y - uniforms.domainY.x)
            );
            
            let style = lineStyles[u32(input.lineIndex)];
            let width = style.params.z; 
            
            let pScreen = pNorm * uniforms.screenSize;
            let offsetPos = pScreen + input.offset * (width / 2.0);
            
            let pClip = (offsetPos / uniforms.screenSize) * 2.0 - 1.0;
            
            output.position = vec4<f32>(pClip.x, pClip.y, 0.0, 1.0);
            output.color = style.color;
            output.uv = input.offset;
            
            return output;
        }

        @fragment
        fn fs_joint(input: JointVertexOutput) -> @location(0) vec4<f32> {
            // Draw as a circle
            if (length(input.uv) > 1.0) {
                discard;
            }
            return input.color;
        }
      `,
    });

    this.bindGroupLayout = this.device.createBindGroupLayout({
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "uniform" },
        },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
          buffer: { type: "read-only-storage" },
        },
      ],
    });

    const pipelineLayout = this.device.createPipelineLayout({
      bindGroupLayouts: [this.bindGroupLayout],
    });

    // Requerido porque el render pass ahora declara un adjunto de profundidad/stencil.
    const neutralDepthStencil = {
      format: 'depth24plus-stencil8',
      depthWriteEnabled: false,
      depthCompare: 'always',
      stencilFront: { compare: 'always', failOp: 'keep', depthFailOp: 'keep', passOp: 'keep' },
      stencilBack:  { compare: 'always', failOp: 'keep', depthFailOp: 'keep', passOp: 'keep' },
    };

    this.jointPipeline = this.device.createRenderPipeline({
      label: "Joint Render Pipeline",
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "vs_joint",
        buffers: [
          {
            arrayStride: 20,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 8, format: "float32x2" },
              { shaderLocation: 2, offset: 16, format: "float32" },
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_joint",
        targets: [
          {
            format: this.presentationFormat,
            blend: {
              color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            },
          },
        ],
      },
      depthStencil: neutralDepthStencil,
      primitive: { topology: "triangle-list" },
      multisample: { count: this.sampleCount },
    });

    const haloStencilState = {
      format: 'depth24plus-stencil8',
      depthWriteEnabled: false,
      depthCompare: 'always',
      stencilFront: { compare: 'not-equal', failOp: 'keep', depthFailOp: 'keep', passOp: 'replace' },
      stencilBack:  { compare: 'not-equal', failOp: 'keep', depthFailOp: 'keep', passOp: 'replace' },
    };

    // Pipeline de unión de halo
    this.haloJointPipeline = this.device.createRenderPipeline({
      label: "Halo Joint Pipeline (stencil)",
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "vs_joint",
        buffers: [{
          arrayStride: 20,
          attributes: [
            { shaderLocation: 0, offset: 0,  format: "float32x2" },
            { shaderLocation: 1, offset: 8,  format: "float32x2" },
            { shaderLocation: 2, offset: 16, format: "float32" },
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_joint",
        targets: [{
          format: this.presentationFormat,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one",       dstFactor: "one-minus-src-alpha", operation: "add" },
          },
        }],
      },
      depthStencil: haloStencilState,
      primitive: { topology: "triangle-list" },
      multisample: { count: this.sampleCount },
    });

    // Pipeline de línea gruesa para halo 
    this.haloThickPipeline = this.device.createRenderPipeline({
      label: "Halo Thick Line Pipeline (stencil)",
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "vs_thick",
        buffers: [{
          arrayStride: 28,
          attributes: [
            { shaderLocation: 0, offset: 0,  format: "float32x2" },
            { shaderLocation: 1, offset: 8,  format: "float32x2" },
            { shaderLocation: 2, offset: 16, format: "float32" },
            { shaderLocation: 3, offset: 20, format: "float32" },
            { shaderLocation: 4, offset: 24, format: "float32" },
          ],
        }],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_thick",
        targets: [{
          format: this.presentationFormat,
          blend: {
            color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
            alpha: { srcFactor: "one",       dstFactor: "one-minus-src-alpha", operation: "add" },
          },
        }],
      },
      depthStencil: haloStencilState,
      primitive: { topology: "triangle-list" },
      multisample: { count: this.sampleCount },
    });

    this.thickLinePipeline = this.device.createRenderPipeline({
      label: "Thick Line Render Pipeline",
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: "vs_thick",
        buffers: [
          {
            arrayStride: 28,
            attributes: [
              { shaderLocation: 0, offset: 0,  format: "float32x2" },
              { shaderLocation: 1, offset: 8,  format: "float32x2" },
              { shaderLocation: 2, offset: 16, format: "float32"   },
              { shaderLocation: 3, offset: 20, format: "float32"   },
              { shaderLocation: 4, offset: 24, format: "float32"   }, // t (0=start, 1=end)
            ],
          },
        ],
      },
      fragment: {
        module: shaderModule,
        entryPoint: "fs_thick",
        targets: [
          {
            format: this.presentationFormat,
            blend: {
              color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            },
          },
        ],
      },
      depthStencil: neutralDepthStencil,
      primitive: { topology: "triangle-list" },
      multisample: { count: this.sampleCount },
    });

    this.pipeline = this.device.createRenderPipeline({
      label: "Line Render Pipeline (compact style)",
      layout: pipelineLayout,
      vertex: {
        module: compactShaderModule,
        entryPoint: "vs_main",
        buffers: [
          {
            arrayStride: 12,
            attributes: [
              { shaderLocation: 0, offset: 0, format: "float32x2" },
              { shaderLocation: 1, offset: 8, format: "float32" },
            ],
          },
        ],
      },
      fragment: {
        module: compactShaderModule,
        entryPoint: "fs_main",
        targets: [
          {
            format: this.presentationFormat,
            blend: {
              color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
              alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" },
            },
          },
        ],
      },
      depthStencil: neutralDepthStencil,
      primitive: { topology: "line-list" },
      multisample: { count: this.sampleCount },
    });

    this.uniformBuffer = this.device.createBuffer({
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.uniformBuffers = [this.uniformBuffer];
    this.bindGroups = [];
    
    return Promise.resolve();
  }

  uploadData(data) {
    if (!this.device) return;

    // Index buffer: cada punto se almacena una sola vez en el vertex buffer.
    // Los índices forman pares (line-list) que referencian puntos compartidos entre
    // segmentos consecutivos. La GPU reutiliza vértices via post-transform vertex cache,
    // reduciendo las invocaciones del vertex shader ~48% para series de 30 muestras.
    const pointsAccumulator = [];
    const indexAccumulator  = [];

    this.idToIndex = new Map();
    let globalVertexOffset = 0;

    data.forEach((entry, index) => {
        this.idToIndex.set(entry.id, index);
        const pts = entry.points;

        for (let i = 0; i < pts.length; i++) {
            pointsAccumulator.push(pts[i][0], pts[i][1], index);
        }
        for (let i = 0; i < pts.length - 1; i++) {
            indexAccumulator.push(globalVertexOffset + i, globalVertexOffset + i + 1);
        }
        globalVertexOffset += pts.length;
    });

    if (pointsAccumulator.length === 0) return;

    const vertexData = new Float32Array(pointsAccumulator);
    this.vertexBuffer = this.device.createBuffer({
        size: vertexData.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    new Float32Array(this.vertexBuffer.getMappedRange()).set(vertexData);
    this.vertexBuffer.unmap();

    const indexData = new Uint32Array(indexAccumulator);
    this.indexBuffer = this.device.createBuffer({
        size: indexData.byteLength,
        usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
    });
    new Uint32Array(this.indexBuffer.getMappedRange()).set(indexData);
    this.indexBuffer.unmap();

    this.indexCount = indexData.length;
    this.lineCount = data.length;

    // Style buffer compacto: solo RGBA (16 bytes/línea vs 32 bytes con params).
    // El pipeline principal usa array<vec4<f32>>, reduciendo el buffer a la mitad
    // y mejorando la tasa de acierto en caché L2 de GPU para N > 50k.
    const styleBufferSize = this.lineCount * 16;
    this.styleBuffer = this.device.createBuffer({
        size: styleBufferSize,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Pre-alocar buffer reutilizable: 4 floats por línea (r, g, b, a)
    this._styleDataCache = new Float32Array(this.lineCount * 4);
    this._styleBaseFilled = false;
    this._bindGroupsDirty = true;
  }

  uploadMedians(medians, medianStyles, haloEnabled = true, haloConfig = {}) {
    if (!this.device || !medians || medians.length === 0) {
      this.medianVertexCount = 0;
      this.medianCount = 0;
      this.medianJointCount = 0;
      this.haloBindGroup = null;
      return;
    }

    let pointsAccumulator = [];
    let jointsAccumulator = [];
    
    medians.forEach((median, index) => {
      const points = median[1];
      for (let i = 0; i < points.length; i++) {
        const P = points[i];
        
        // Quad for joint (circle): 2 triangles
        jointsAccumulator.push(P[0], P[1], -1.0, -1.0, index);
        jointsAccumulator.push(P[0], P[1],  1.0, -1.0, index);
        jointsAccumulator.push(P[0], P[1], -1.0,  1.0, index);
        
        jointsAccumulator.push(P[0], P[1],  1.0, -1.0, index);
        jointsAccumulator.push(P[0], P[1], -1.0,  1.0, index);
        jointsAccumulator.push(P[0], P[1],  1.0,  1.0, index);

        if (i < points.length - 1) {
          const A = points[i];
          const B = points[i+1];
          pointsAccumulator.push(A[0], A[1], B[0], B[1], -1.0, index, 0.0); 
          pointsAccumulator.push(A[0], A[1], B[0], B[1],  1.0, index, 0.0); 
          pointsAccumulator.push(B[0], B[1], A[0], A[1], -1.0, index, 1.0); 
          
          pointsAccumulator.push(A[0], A[1], B[0], B[1],  1.0, index, 0.0); // A, side=+1, t=0
          pointsAccumulator.push(B[0], B[1], A[0], A[1], -1.0, index, 1.0); // B, side=-1, t=1
          pointsAccumulator.push(B[0], B[1], A[0], A[1],  1.0, index, 1.0); // B, side=+1, t=1
        }
      }
    });

    if (pointsAccumulator.length === 0) {
      this.medianVertexCount = 0;
      this.medianCount = 0;
      this.medianJointCount = 0;
      return;
    }

    // Segment Buffer
    const vertexData = new Float32Array(pointsAccumulator);
    this.medianVertexBuffer = this.device.createBuffer({
      size: vertexData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.medianVertexBuffer.getMappedRange()).set(vertexData);
    this.medianVertexBuffer.unmap();
    this.medianVertexCount = vertexData.length / 7; // 7 floats por vértice ahora (antes 6)

    // Joint Buffer
    const jointData = new Float32Array(jointsAccumulator);
    this.medianJointBuffer = this.device.createBuffer({
      size: jointData.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(this.medianJointBuffer.getMappedRange()).set(jointData);
    this.medianJointBuffer.unmap();
    this.medianJointCount = jointData.length / 5;  

    this.medianCount = medians.length;

    
    const styleBufferSize = this.medianCount * 32;
    this.medianStyleBuffer = this.device.createBuffer({
      size: styleBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.haloStyleBuffer = this.device.createBuffer({
      size: styleBufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Upload Styles
    const mainStyleData = new Float32Array(this.medianCount * 8);
    const haloStyleData = new Float32Array(this.medianCount * 8);

    medians.forEach((median, index) => {
      const groupId = median[0];
      const style = medianStyles.get(groupId) || {
        color: [0, 0, 0, 1],
        dashOn: 7,
        dashOff: 7,
        lineWidth: 2
      };
      
      const width = style.lineWidth || 2;
      
      // Main Line Style
      mainStyleData[index*8 + 0] = style.color[0];
      mainStyleData[index*8 + 1] = style.color[1];
      mainStyleData[index*8 + 2] = style.color[2];
      mainStyleData[index*8 + 3] = style.color[3];
      mainStyleData[index*8 + 4] = style.dashOn || 0;
      mainStyleData[index*8 + 5] = style.dashOff || 0;
      mainStyleData[index*8 + 6] = width;
      mainStyleData[index*8 + 7] = 0;

      const haloColorStr = (haloConfig && haloConfig.color) ? haloConfig.color : null;
      // Usar parseo CSS puro: evita dependencia DOM y es seguro en tests/workers
      const [haloR, haloG, haloB] = haloColorStr ? parseCSSColorToVec3(haloColorStr) : [1, 1, 1];
      const haloAlpha = (haloConfig && haloConfig.alpha != null) ? haloConfig.alpha : 0.8;
      const haloExtra = (haloConfig && haloConfig.size  != null) ? haloConfig.size  : 6.0;

      haloStyleData[index*8 + 0] = haloR;
      haloStyleData[index*8 + 1] = haloG;
      haloStyleData[index*8 + 2] = haloB;
      haloStyleData[index*8 + 3] = haloAlpha;
      haloStyleData[index*8 + 4] = 0;   // no dash
      haloStyleData[index*8 + 5] = 0;
      haloStyleData[index*8 + 6] = width + haloExtra;
      haloStyleData[index*8 + 7] = 0;
    });

    this.device.queue.writeBuffer(this.medianStyleBuffer, 0, mainStyleData);
    this.device.queue.writeBuffer(this.haloStyleBuffer, 0, haloStyleData);
    
    this.medianBindGroup = this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.medianStyleBuffer } },
      ]
    });

    if (haloEnabled) {
      this.haloBindGroup = this.device.createBindGroup({
        layout: this.bindGroupLayout,
        entries: [
          { binding: 0, resource: { buffer: this.uniformBuffer } },
          { binding: 1, resource: { buffer: this.haloStyleBuffer } },
        ]
      });
    } else {
      this.haloBindGroup = null;
    }


  }

  updateStyles(stylesMap, defaultColor = [0.5, 0.5, 0.5, 0.1]) {
      if (!this.device || !this.styleBuffer) return;

      if (stylesMap instanceof Float32Array) {
          // Fast path: raw data provided
          this.device.queue.writeBuffer(this.styleBuffer, 0, stylesMap);
          return;
      }
      
      if (!this.idToIndex) return;

      // Buffer compacto: 4 floats por línea (r, g, b, a). El pipeline principal usa
      // array<vec4<f32>>, así que solo escribimos el color sin params extra.
      if (!this._styleDataCache || this._styleDataCache.length !== this.lineCount * 4) {
          this._styleDataCache = new Float32Array(this.lineCount * 4);
          this._styleBaseFilled = false;
      }
      const styleData = this._styleDataCache;

      // Re-rellenar con color por defecto solo si cambió o si es la primera vez
      const dc = defaultColor;
      if (!this._styleBaseFilled ||
          this._cachedDC0 !== dc[0] || this._cachedDC1 !== dc[1] ||
          this._cachedDC2 !== dc[2] || this._cachedDC3 !== dc[3]) {
          for (let i = 0; i < this.lineCount; i++) {
              styleData[i*4 + 0] = dc[0];
              styleData[i*4 + 1] = dc[1];
              styleData[i*4 + 2] = dc[2];
              styleData[i*4 + 3] = dc[3];
          }
          this._styleBaseFilled = true;
          this._cachedDC0 = dc[0]; this._cachedDC1 = dc[1];
          this._cachedDC2 = dc[2]; this._cachedDC3 = dc[3];
          if (!this._styleBaseData || this._styleBaseData.length !== styleData.length) {
              this._styleBaseData = new Float32Array(styleData);
          } else {
              this._styleBaseData.set(styleData);
          }
      } else {
          styleData.set(this._styleBaseData);
      }

      stylesMap.forEach((style, id) => {
          if (this.idToIndex.has(id)) {
              const idx = this.idToIndex.get(id);
              if (style.color) {
                  styleData[idx*4 + 0] = style.color[0];
                  styleData[idx*4 + 1] = style.color[1];
                  styleData[idx*4 + 2] = style.color[2];
                  styleData[idx*4 + 3] = style.color[3];
              }
          }
      });

      this.device.queue.writeBuffer(this.styleBuffer, 0, styleData);
  }
  
  updateUniforms(domains, width, height, margins = {top:0, left:0, right:0, bottom:0}) {
      if (!this.device || !this.uniformBuffer) return;

      this.currentWidth = width;
      this.currentHeight = height;
      this.margins = margins;

      // Evitar writeBuffer si los valores no cambiaron (ahorra un IPC al GPU process por frame)
      const key = `${domains.x[0]},${domains.x[1]},${domains.y[0]},${domains.y[1]},${width},${height}`;
      if (key === this._lastUniformKey) return;
      this._lastUniformKey = key;

      this._uniformData[0] = domains.x[0]; this._uniformData[1] = domains.x[1];
      this._uniformData[2] = domains.y[0]; this._uniformData[3] = domains.y[1];
      this._uniformData[4] = width;         this._uniformData[5] = height;
      this._uniformData[6] = 0;             this._uniformData[7] = 0;
      this.device.queue.writeBuffer(this.uniformBuffer, 0, this._uniformData);
  }

  // Crea la textura de anti-aliasing MSAA y la textura de stencil para el halo
  _createMSAATexture(width, height) {
    if (!this.device) return;
    if (this.msaaTexture) this.msaaTexture.destroy();
    this.msaaTexture = this.device.createTexture({
      size: [width, height],
      sampleCount: this.sampleCount,
      format: this.presentationFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.msaaTextureView = this.msaaTexture.createView();

    if (this.stencilTexture) this.stencilTexture.destroy();
    this.stencilTexture = this.device.createTexture({
      size: [width, height],
      sampleCount: this.sampleCount,
      format: 'depth24plus-stencil8',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });
    this.stencilTextureView = this.stencilTexture.createView();

    this._msaaWidth = width;
    this._msaaHeight = height;
  }

  _ensureMSAATexture(width, height) {
    if (!this.msaaTexture || this._msaaWidth !== width || this._msaaHeight !== height) {
      this._createMSAATexture(width, height);
    }
  }

  // Pre-compila los comandos de draw de las líneas principales en un GPURenderBundle.
  // executeBundles() es sustancialmente más rápido que re-codificar los mismos comandos
  // cada frame: elimina validación de estado y reduce el IPC con el GPU process de Chrome.
  // Se construye una sola vez tras uploadData() y se reutiliza hasta que cambian datos/pipeline.
  _buildMainBundle() {
    if (!this.device || !this.pipeline || !this.vertexBuffer || !this.indexBuffer ||
        !this.bindGroups || !this.bindGroups[0]) return;

    const bundleEncoder = this.device.createRenderBundleEncoder({
      colorFormats: [this.presentationFormat],
      depthStencilFormat: 'depth24plus-stencil8',
      sampleCount: this.sampleCount,
    });

    bundleEncoder.setPipeline(this.pipeline);
    bundleEncoder.setBindGroup(0, this.bindGroups[0]);
    bundleEncoder.setVertexBuffer(0, this.vertexBuffer);
    bundleEncoder.setIndexBuffer(this.indexBuffer, 'uint32');
    bundleEncoder.drawIndexed(this.indexCount, 1, 0, 0, 0);

    this._mainRenderBundle = bundleEncoder.finish();
    this._renderBundleDirty = false;
  }

  draw(hasSelection = false, groupCount = 0) {
      if (!this.device || !this.pipeline || !this.vertexBuffer || !this.indexBuffer || !this.styleBuffer) return;
      if (!this.bindGroups) this.bindGroups = [];

      // Recrear bind group solo cuando cambia el style buffer (uploadData)
      if (this._bindGroupsDirty || !this.bindGroups.length) {
          this.bindGroups = [this.device.createBindGroup({
              layout: this.pipeline.getBindGroupLayout(0),
              entries: [
                  { binding: 0, resource: { buffer: this.uniformBuffer } },
                  { binding: 1, resource: { buffer: this.styleBuffer } },
              ]
          })];
          this.bindGroup = this.bindGroups[0];
          this._bindGroupsDirty = false;
          this._renderBundleDirty = true; // bind group cambió → bundle inválido
      }

      // Construir render bundle si es necesario (solo primera vez o tras cambio de datos)
      if (this._renderBundleDirty || !this._mainRenderBundle) {
          this._buildMainBundle();
      }

      const commandEncoder = this.device.createCommandEncoder();
      const canvasTexture = this.context.getCurrentTexture();
      const canvasTextureView = canvasTexture.createView();

      this._ensureMSAATexture(canvasTexture.width, canvasTexture.height);

      // Cuando sampleCount=1 (MSAA desactivado), renderizar directamente al canvas.
      // Con sampleCount>1, usar textura MSAA intermedia + resolveTarget al canvas.
      const useMSAA = this.sampleCount > 1;
      const renderPassDescriptor = useMSAA ? {
          colorAttachments: [
              {
                  view: this.msaaTextureView,
                  resolveTarget: canvasTextureView,
                  clearValue: { r: 1, g: 1, b: 1, a: 0 },
                  loadOp: "clear",
                  storeOp: "discard",
              },
          ],
          depthStencilAttachment: this.stencilTextureView ? {
              view: this.stencilTextureView,
              depthLoadOp: 'clear',  depthStoreOp: 'discard', depthClearValue: 1.0,
              stencilLoadOp: 'clear', stencilStoreOp: 'discard', stencilClearValue: 0,
          } : undefined,
      } : {
          colorAttachments: [
              {
                  view: canvasTextureView,
                  clearValue: { r: 1, g: 1, b: 1, a: 0 },
                  loadOp: "clear",
                  storeOp: "store",
              },
          ],
          depthStencilAttachment: this.stencilTextureView ? {
              view: this.stencilTextureView,
              depthLoadOp: 'clear',  depthStoreOp: 'discard', depthClearValue: 1.0,
              stencilLoadOp: 'clear', stencilStoreOp: 'discard', stencilClearValue: 0,
          } : undefined,
      };

      const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);

      if (this.margins && this.currentWidth && this.currentHeight) {
          const canvasWidth = canvasTexture.width;
          const canvasHeight = canvasTexture.height;
          const dpr = window.devicePixelRatio || 1;
          const x = Math.floor(this.margins.left * dpr);
          const y = Math.floor(this.margins.top * dpr);
          const w = Math.floor(Math.min(canvasWidth - x, this.currentWidth  - this.margins.left * dpr - this.margins.right  * dpr));
          const h = Math.floor(Math.min(canvasHeight - y, this.currentHeight - this.margins.top  * dpr - this.margins.bottom * dpr));
          passEncoder.setScissorRect(x, y, w, h);
      }

      // Render bundle: ejecuta los comandos pre-compilados de las líneas principales.
      // Elimina validación por frame y reduce mensajes IPC al GPU process de Chrome.
      passEncoder.executeBundles([this._mainRenderBundle]);
      
      if (this.medianVertexBuffer && this.medianBindGroup && this.medianVertexCount > 0 && this.thickLinePipeline && this.jointPipeline) {
        
        if (this.haloBindGroup && this.haloJointPipeline && this.haloThickPipeline) {
          passEncoder.setBindGroup(0, this.haloBindGroup);
          passEncoder.setStencilReference(1);

          // 1) Uniones primero → tapas redondeadas en cada vértice, marca los píxeles cubiertos (stencil→1)
          passEncoder.setPipeline(this.haloJointPipeline);
          passEncoder.setVertexBuffer(0, this.medianJointBuffer);
          passEncoder.draw(this.medianJointCount, 1, 0, 0);

          // 2) Segmentos → rellena entre uniones, omite los píxeles ya pintados por las uniones
          passEncoder.setPipeline(this.haloThickPipeline);
          passEncoder.setVertexBuffer(0, this.medianVertexBuffer);
          passEncoder.draw(this.medianVertexCount, 1, 0, 0);
        }
        
        passEncoder.setBindGroup(0, this.medianBindGroup);
        
        passEncoder.setPipeline(this.jointPipeline);
          passEncoder.setVertexBuffer(0, this.medianJointBuffer);
          passEncoder.draw(this.medianJointCount, 1, 0, 0);
        
        passEncoder.setPipeline(this.thickLinePipeline);
        passEncoder.setVertexBuffer(0, this.medianVertexBuffer);
        passEncoder.draw(this.medianVertexCount, 1, 0, 0);
      }

      
      passEncoder.end();

      this.device.queue.submit([commandEncoder.finish()]);
  }

  // Ajusta el nivel de MSAA según el número de líneas.
  // Para N > 10k, las líneas se superponen tanto que el anti-aliasing no aporta visualmente
  // pero sí cuesta 4× más en el fragment shader. Se llama una vez tras uploadData().
  setAdaptiveSampleCount(lineCount) {
    const optimal = lineCount > 10000 ? 1 : 4;
    if (this.sampleCount === optimal) return;
    this.sampleCount = optimal;
    // Recrear textura MSAA y stencil con el nuevo sample count
    if (this._msaaWidth && this._msaaHeight) {
      this._createMSAATexture(this._msaaWidth, this._msaaHeight);
    }
    // Recrear todos los pipelines (multisample.count está horneado en cada pipeline)
    this.initPipeline();
    this._bindGroupsDirty = true;
    this._renderBundleDirty = true;
    console.log(`%c[WebGPU] MSAA ajustado a ${optimal}× para ${lineCount.toLocaleString()} líneas`, 'color:#00aaff');
  }

  // Devuelve una Promise que resuelve cuando la GPU termina todos los comandos enviados.
  // Necesario para medir tiempos reales de GPU (submit() es asíncrono).
  syncGPU() {
    if (!this.device) return Promise.resolve();
    return this.device.queue.onSubmittedWorkDone();
  }

  /**
   * Libera todos los recursos GPU: buffers, texturas, device.
   * Llamar en el unmount del widget para evitar memory leaks.
   */
  destroy() {
    if (this.vertexBuffer) { this.vertexBuffer.destroy(); this.vertexBuffer = null; }
    if (this.indexBuffer)  { this.indexBuffer.destroy();  this.indexBuffer  = null; }
    if (this.styleBuffer) { this.styleBuffer.destroy(); this.styleBuffer = null; }
    if (this.medianVertexBuffer) { this.medianVertexBuffer.destroy(); this.medianVertexBuffer = null; }
    if (this.medianStyleBuffer) { this.medianStyleBuffer.destroy(); this.medianStyleBuffer = null; }
    if (this.haloStyleBuffer) { this.haloStyleBuffer.destroy(); this.haloStyleBuffer = null; }
    if (this.medianJointBuffer) { this.medianJointBuffer.destroy(); this.medianJointBuffer = null; }
    if (this.msaaTexture) { this.msaaTexture.destroy(); this.msaaTexture = null; }
    if (this.stencilTexture) { this.stencilTexture.destroy(); this.stencilTexture = null; }

    if (this.uniformBuffer) { this.uniformBuffer.destroy(); this.uniformBuffer = null; }
    this.uniformBuffers = null;

    // Limpiar el resto de referencias
    this.pipeline = null;
    this.thickLinePipeline = null;
    this.jointPipeline = null;
    this.haloJointPipeline = null;
    this.haloThickPipeline = null;
    this.bindGroup = null;
    this.bindGroups = [];
    this.medianBindGroup = null;
    this.haloBindGroup = null;
    this.bindGroupLayout = null;
    this.context = null;
    this.idToIndex = null;

    // El device se libera al final — invalidar referencia
    if (this.device) {
      this.device.destroy();
      this.device = null;
    }
  }
}

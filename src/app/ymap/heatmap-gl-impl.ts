import type {
  YMapCenterZoomLocation,
  PixelCoordinates,
  Projection,
  WorldCoordinates,
  VectorLayerImplementation,
  VectorLayerImplementationConstructor,
  VectorLayerImplementationRenderProps,
  LngLat
} from 'ymaps3';

export type Point = {coordinates: LngLat; value: number};

type FrameBuffer = {
  color: WebGLTexture;
  depth: WebGLTexture;
  buffer: WebGLFramebuffer;
  size: PixelCoordinates;
};

type Program = {
  attributes: Record<string, number>;
  uniforms: Record<string, WebGLUniformLocation>;
  program: WebGLProgram;
  vs: WebGLShader;
  fs: WebGLShader;
  vao: WebGLVertexArrayObjectOES;
};

type RenderWorldProps = Omit<VectorLayerImplementationRenderProps, 'worlds'> & {
  world: VectorLayerImplementationRenderProps['worlds'][0];
};

type DrawBuffer = {
  count: number;
  buffer: WebGLBuffer | null;
};

export const getHeatmapImpl = (
  projection: Projection,
  getData: () => Point[],
  options: {
    gradient: MappedGradient;
    density: number;
    max: number;
    blur: number;
    size: number;
  } = {
    gradient: gradientMapper(defaultGradient),
    density: 4,
    max: 1,
    blur: 1,
    size: 8
  }
): VectorLayerImplementationConstructor => {
  return class {
    private _requestRender: () => void;

    private _mainFrameBuffer: FrameBuffer;
    private _gradientFrameBuffer: FrameBuffer;

    private _gradientProgram: Program;
    private _heatmapProgram: Program;

    private _vertexBuffer: DrawBuffer;
    private _intensityBuffer: DrawBuffer;
    private _heatmapVertexBuffer: DrawBuffer;
    private _heatmapTextCoordBuffer: DrawBuffer;

    constructor(
      private readonly gl: WebGLRenderingContext,
      options: {size?: PixelCoordinates; requestRender: () => void}
    ) {
      this._requestRender = options.requestRender;

      // This one is used to main rendering
      this._mainFrameBuffer = this.__createFrameBuffer() as any;
      // This one is used to render the heatmap
      this._gradientFrameBuffer = this.__createFrameBuffer() as any;

      this._gradientProgram = createProgram(gl, GRADIENT_SHADERS.vertex, GRADIENT_SHADERS.fragment, {
        attributes: ['a_position', 'a_intensity'],
        uniforms: ['u_viewProjectionMatrix', 'u_lookAt', 'u_size', 'u_density', 'u_max', 'u_blur']
      });

      this._heatmapProgram = createProgram(gl, HEATMAP_SHADERS.vertex, HEATMAP_SHADERS.fragment, {
        attributes: ['a_position', 'a_texCoord'],
        uniforms: ['u_gradient', 'u_colorArr', 'u_offset', 'u_opacity']
      });

      const {vertexData, intensityData} = generateVertexData(projection, getData());

      // Buffers for gradient points rendering
      const vertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, vertexData, gl.STATIC_DRAW);
      this._vertexBuffer = {count: vertexData.length / 2, buffer: vertexBuffer};

      const intensityBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, intensityBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, intensityData, gl.STATIC_DRAW);
      this._intensityBuffer = {count: intensityData.length, buffer: intensityBuffer};

      // Buffers for heatmap rendering
      const heatmapVertexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, heatmapVertexBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0]),
        gl.STATIC_DRAW
      );
      this._heatmapVertexBuffer = {count: 6, buffer: heatmapVertexBuffer};

      const heatmapTexCoordBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, heatmapTexCoordBuffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([0.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 1.0, 1.0, 0.0, 1.0, 1.0]),
        gl.STATIC_DRAW
      );
      this._heatmapTextCoordBuffer = {count: 6, buffer: heatmapTexCoordBuffer};
    }

    /**
     * Create frame buffer with color and depth textures
     */
    private __createFrameBuffer(): FrameBuffer {
      const {gl} = this;

      const buffer = gl.createFramebuffer() as WebGLFramebuffer;
      const colorTexture = gl.createTexture() as WebGLTexture;
      const depthTexture = gl.createTexture() as WebGLTexture;

      gl.bindTexture(gl.TEXTURE_2D, colorTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.bindTexture(gl.TEXTURE_2D, null);

      gl.getExtension('WEBGL_depth_texture');
      gl.bindTexture(gl.TEXTURE_2D, depthTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

      gl.bindFramebuffer(gl.FRAMEBUFFER, buffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTexture, 0);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);

      return {
        color: colorTexture,
        depth: depthTexture,
        buffer,
        size: {x: 0, y: 0}
      };
    }

    destroy() {
      const {gl} = this;
      for (const buffer of [this._mainFrameBuffer, this._gradientFrameBuffer]) {
        gl.deleteFramebuffer(buffer.buffer);
        gl.deleteTexture(buffer.color);
        gl.deleteTexture(buffer.depth);
      }

      for (const program of [this._gradientProgram, this._heatmapProgram]) {
        gl.deleteProgram(program.program);
        gl.deleteShader(program.vs);
        gl.deleteShader(program.fs);
        gl.getExtension('OES_vertex_array_object')!.deleteVertexArrayOES(program.vao);
      }

      for (const buffer of [
        this._vertexBuffer,
        this._intensityBuffer,
        this._heatmapVertexBuffer,
        this._heatmapTextCoordBuffer
      ]) {
        gl.deleteBuffer(buffer.buffer);
      }
    }

    render({size, worlds}: Parameters<VectorLayerImplementation['render']>[0]) {
      const {gl} = this;

      for (const {lookAt, viewProjMatrix} of worlds) {
        this.__renderGradient(size, lookAt, viewProjMatrix);
        this.__renderHeatmap(size);
      }

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      gl.getExtension('OES_vertex_array_object')!.bindVertexArrayOES(null);

      return {
        color: this._mainFrameBuffer.color,
        depth: this._mainFrameBuffer.depth
      };
    }

    /**
     * Bind frame buffer and set viewport size
     */
    private __bindFrameBuffer(size: PixelCoordinates, fb: FrameBuffer) {
      const {gl} = this;
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb.buffer);
      gl.viewport(0, 0, size.x, size.y);

      if (fb.size.x === size.x && fb.size.y === size.y) {
        return;
      }

      fb.size = size;
      gl.bindTexture(gl.TEXTURE_2D, fb.color);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size.x, size.y, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindTexture(gl.TEXTURE_2D, fb.depth);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.DEPTH_COMPONENT,
        size.x,
        size.y,
        0,
        gl.DEPTH_COMPONENT,
        gl.UNSIGNED_INT,
        null
      );
    }

    /**
     * Drawing points in the form of circles with blur
     */
    private __renderGradient(
      size: PixelCoordinates,
      lookAt: WorldCoordinates,
      viewProjMatrix: RenderWorldProps['world']['viewProjMatrix']
    ) {
      const {gl} = this;

      this.__bindFrameBuffer(size, this._gradientFrameBuffer);

      gl.disable(gl.DEPTH_TEST);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.FUNC_ADD);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      const {vao, program, attributes, uniforms} = this._gradientProgram;
      gl.useProgram(program);

      gl.getExtension('OES_vertex_array_object')!.bindVertexArrayOES(vao);

      gl.uniformMatrix4fv(uniforms['u_viewProjectionMatrix'], false, viewProjMatrix as Float32List);
      gl.uniform2f(uniforms['u_lookAt'], -lookAt.x, -lookAt.y);

      gl.uniform1f(uniforms['u_density'], options.density);
      gl.uniform1f(uniforms['u_max'], options.max);
      gl.uniform1f(uniforms['u_size'], options.size);
      gl.uniform1f(uniforms['u_blur'], options.blur);

      // We can optimize this and set only once but for example purposes we set it every time
      // https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices#avoid_changing_vao_attachments_vertexattribpointer_disableenablevertexattribarray
      gl.bindBuffer(gl.ARRAY_BUFFER, this._vertexBuffer.buffer);
      gl.enableVertexAttribArray(attributes['a_position']);
      gl.vertexAttribPointer(attributes['a_position'], 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._intensityBuffer.buffer);
      gl.enableVertexAttribArray(attributes['a_intensity']);
      gl.vertexAttribPointer(attributes['a_intensity'], 1, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.POINTS, 0, this._vertexBuffer.count);
    }

    /**
     * Draw a rectangle on the entire screen and apply a texture from the framebuffer to it
     */
    private __renderHeatmap(size: PixelCoordinates) {
      const {gl} = this;
      const {vao, program, attributes, uniforms} = this._heatmapProgram;
      this.__bindFrameBuffer(size, this._mainFrameBuffer);

      gl.enable(gl.DEPTH_TEST);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

      gl.useProgram(program);

      gl.getExtension('OES_vertex_array_object')!.bindVertexArrayOES(vao);

      gl.uniform4fv(uniforms['u_colorArr'], options.gradient.value);
      gl.uniform1fv(uniforms['u_offset'], new Float32Array(options.gradient.offset));
      gl.uniform1f(uniforms['u_opacity'], 1);

      gl.activeTexture(gl.TEXTURE0 + 0);
      gl.bindTexture(gl.TEXTURE_2D, this._gradientFrameBuffer.color);
      gl.uniform1i(uniforms['u_gradient'], 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._heatmapVertexBuffer.buffer);
      gl.enableVertexAttribArray(attributes['a_position']);
      gl.vertexAttribPointer(attributes['a_position'], 2, gl.FLOAT, false, 0, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, this._heatmapTextCoordBuffer.buffer);
      gl.enableVertexAttribArray(attributes['a_texCoord']);
      gl.vertexAttribPointer(attributes['a_texCoord'], 2, gl.FLOAT, false, 0, 0);

      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
  };
};

/**
 * Create a program with vertex and fragment shaders
 */
function createProgram(
  gl: WebGLRenderingContext,
  vertexShader: string,
  fragmentShader: string,
  options: {
    attributes?: string[];
    uniforms?: string[];
  } = {}
): Program {
  const program = gl.createProgram()!;
  const vs = gl.createShader(gl.VERTEX_SHADER)!;
  const fs = gl.createShader(gl.FRAGMENT_SHADER)!;

  gl.shaderSource(vs, vertexShader);
  gl.compileShader(vs);
  gl.attachShader(program, vs);

  gl.shaderSource(fs, fragmentShader);
  gl.compileShader(fs);
  gl.attachShader(program, fs);

  gl.linkProgram(program);

  const attributes: Record<string, GLint> = {};
  for (const attribute of options.attributes ?? []) {
    attributes[attribute] = gl.getAttribLocation(program, attribute);
  }

  const uniforms: Record<string, WebGLUniformLocation> = {};
  for (const uniform of options.uniforms ?? []) {
    uniforms[uniform] = gl.getUniformLocation(program, uniform) as WebGLUniformLocation;
  }

  return {
    program,
    vs,
    fs,
    attributes,
    uniforms,
    vao: gl.getExtension('OES_vertex_array_object')!.createVertexArrayOES() as WebGLVertexArrayObjectOES
  };
}

// The shader draws dots on the screen and, depending on the intensity, blurs from the center to the edge
const GRADIENT_SHADERS = {
  vertex: `
        attribute vec2 a_position;
        attribute float a_intensity;

        uniform mat4 u_viewProjectionMatrix;
        uniform vec2 u_lookAt;
        uniform float u_size;
        uniform float u_density;

        varying float v_intensity;

        void main() {
            vec4 offsetPosition = vec4(a_position + u_lookAt, 0.000003, 1);
            vec4 position = u_viewProjectionMatrix * offsetPosition;
            gl_Position = position;

            gl_PointSize = u_size * u_density;
            v_intensity = a_intensity;
        }
    `,
  fragment: `
        precision mediump float;

        uniform float u_max;
        uniform float u_blur;

        varying float v_intensity;

        void main() {
            float r = 0.0;
            vec2 cxy = 2.0 * gl_PointCoord - 1.0;
            r = dot(cxy, cxy);
            if(r <= 1.0) {
                gl_FragColor = vec4(0, 0, 0, (v_intensity/u_max) * u_blur * (1.0 - sqrt(r)));
            }
        }
    `
};


export const LOCATION: YMapCenterZoomLocation = {
  zoom: 11.6,
  center: [30.3951, 59.9393]
};

export function getDefaultMapProps() {
  return {
    location: LOCATION,
    projection: ymaps3.projections.sphericalMercator
  };
}

const seed = (s: number) => (): number => {
  s = Math.sin(s) * 10000;
  return s - Math.floor(s);
};

export const rnd = seed(10000);

function rndSign(): number {
  return rnd() > 0.5 ? 1 : -1;
}

export function getRandomPoints(count: number, delta: number = 1.5): Point[] {
  const result: Point[] = [];

  for (let i = 0; i < count; i++) {
    const coordinates: LngLat = [
      LOCATION.center[0] + rnd() * delta * rndSign(),
      LOCATION.center[1] + rnd() * delta * rndSign()
    ];
    const value = rnd() * 1;
    result.push({coordinates, value});
  }

  return result;
}

/**
 * A shader that simply draws a rectangle on the entire screen and overlays a texture from the frame buffer on it
 */
const HEATMAP_SHADERS = {
  vertex: `
        attribute vec2 a_position;
        attribute vec2 a_texCoord;

        varying vec2 v_texCoord;

        void main() {
            gl_Position = vec4(a_position, 0.000001, 1);
            v_texCoord = a_texCoord;
        }
    `,
  fragment: `
        precision mediump float;

        uniform sampler2D u_gradient;
        uniform vec4 u_colorArr[11];
        uniform float u_offset[11];
        uniform float u_opacity;

        varying vec2 v_texCoord;

        float remap ( float minval, float maxval, float curval ) {
            return ( curval - minval ) / ( maxval - minval );
        }

        void main() {
            float alpha = texture2D(u_gradient, v_texCoord.xy).a;

            if (alpha > 0.0 && alpha <= 1.0) {
                vec4 color;

                if (alpha <= u_offset[0]) {
                    color = u_colorArr[0];
                } else if (alpha <= u_offset[1]) {
                    color = mix( u_colorArr[0], u_colorArr[1], remap( u_offset[0], u_offset[1], alpha ) );
                } else if (alpha <= u_offset[2]) {
                    color = mix( u_colorArr[1], u_colorArr[2], remap( u_offset[1], u_offset[2], alpha ) );
                } else if (alpha <= u_offset[3]) {
                    color = mix( u_colorArr[2], u_colorArr[3], remap( u_offset[2], u_offset[3], alpha ) );
                } else if (alpha <= u_offset[4]) {
                    color = mix( u_colorArr[3], u_colorArr[4], remap( u_offset[3], u_offset[4], alpha ) );
                } else if (alpha <= u_offset[5]) {
                    color = mix( u_colorArr[4], u_colorArr[5], remap( u_offset[4], u_offset[5], alpha ) );
                } else if (alpha <= u_offset[6]) {
                    color = mix( u_colorArr[5], u_colorArr[6], remap( u_offset[5], u_offset[6], alpha ) );
                } else if (alpha <= u_offset[7]) {
                    color = mix( u_colorArr[6], u_colorArr[7], remap( u_offset[6], u_offset[7], alpha ) );
                } else if (alpha <= u_offset[8]) {
                    color = mix( u_colorArr[7], u_colorArr[8], remap( u_offset[7], u_offset[8], alpha ) );
                } else if (alpha <= u_offset[9]) {
                    color = mix( u_colorArr[8], u_colorArr[9], remap( u_offset[8], u_offset[9], alpha ) );
                } else if (alpha <= u_offset[10]) {
                    color = mix( u_colorArr[9], u_colorArr[10], remap( u_offset[9], u_offset[10], alpha ) );
                } else {
                    color = vec4(0.0, 0.0, 0.0, 0.0);
                }

                color.a = color.a - (1.0 - u_opacity);

                if (color.a < 0.0) {
                    discard;
                }

                gl_FragColor = color;
            }
        }
    `
};

export interface Gradient {
  color: [number, number, number, number];
  offset: number;
}

interface MappedGradient {
  value: Float32Array;
  length: number;
  offset: number[];
}

const defaultGradient: Gradient[] = [
  {
    color: [255, 255, 255, 0.0],
    offset: 0
  },
  {
    color: [212, 225, 255, 1.0],
    offset: 0.2
  },
  {
    color: [166, 255, 115, 1.0],
    offset: 0.45
  },
  {
    color: [255, 255, 0, 0.5],
    offset: 0.75
  },
  {
    color: [255, 0, 0, 1.0],
    offset: 1.0
  }
];

function gradientMapper(grad: Gradient[]): MappedGradient {
  const arr: number[] = [];
  const gradLength = grad.length;
  const offSetsArray: number[] = [];

  grad.forEach(function (d) {
    arr.push(d.color[0] / 255);
    arr.push(d.color[1] / 255);
    arr.push(d.color[2] / 255);
    arr.push(d.color[3] === undefined ? 1.0 : d.color[3]);
    offSetsArray.push(d.offset);
  });

  return {
    value: new Float32Array(arr),
    length: gradLength,
    offset: offSetsArray
  };
}

/**
 * Generate vertex and intensity float32 data arrays
 */
function generateVertexData(projection: Projection, data: Point[]) {
  const vertexData = new Float32Array(data.length * 2); // 2 floats per vertex x an y
  for (let i = 0; i < data.length; i++) {
    const {x, y} = projection.toWorldCoordinates(data[i].coordinates);
    vertexData[i * 2] = x;
    vertexData[i * 2 + 1] = y;
  }
  return {vertexData, intensityData: new Float32Array(data.map((p) => p.value))};
}

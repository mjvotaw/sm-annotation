import { RenderTexture, Container, Geometry, Texture, Shader, Mesh, Sprite, Rectangle, BaseTexture } from "pixi.js"
import { App } from "../../App"

export class NoteTexture {
 
  static noop_frag: string
  static noop_vert: string
  static arrow_gradient_frag: string
  static mine_gradient_frag: string

  static arrow_parts_texture = BaseTexture.from('assets/noteskin/tap/parts.png')
  static mine_parts_texture = BaseTexture.from('assets/noteskin/mine/parts.png')

  static arrow_body_geometry: Geometry
  static arrow_frame_geometry: Geometry

  static mine_body_geometry: Geometry
  
  static arrow_tex = RenderTexture.create({ width: 192, height: 192, resolution: 4 })
  static arrow_container = new Container();
  static mine_tex = RenderTexture.create({ width: 64, height: 64, resolution: 4 })
  static mine_container = new Container();

  static async initArrowTex(app: App) {
    this.noop_frag = await fetch('assets/noteskin/shader/noop.frag').then(response => response.text())
    this.noop_vert = await fetch('assets/noteskin/shader/noop.vert').then(response => response.text())
    this.arrow_gradient_frag = await fetch('assets/noteskin/shader/arrow_gradient.frag').then(response => response.text())
    this.mine_gradient_frag = await fetch('assets/noteskin/shader/mine_gradient.frag').then(response => response.text())

    this.arrow_body_geometry = await this.loadGeometry('assets/noteskin/tap/body.txt')
    this.arrow_frame_geometry = await this.loadGeometry('assets/noteskin/tap/frame.txt')
    this.mine_body_geometry = await this.loadGeometry('assets/noteskin/mine/body.txt')
    
    {
      for (let i = 0; i < 8; i ++) {
        let shader_body = Shader.from(this.noop_vert, this.arrow_gradient_frag, 
          {sampler0: this.arrow_parts_texture, time: 0, quant: i}) 
        let arrow_body = new Mesh(NoteTexture.arrow_body_geometry, shader_body);
        arrow_body.x = (i % 3) * 64 + 32
        arrow_body.y = Math.floor(i/3) * 64 + 32
        arrow_body.rotation = -Math.PI/2
        NoteTexture.arrow_container.addChild(arrow_body)
      }
      let shader_frame = Shader.from(this.noop_vert, this.noop_frag, 
        {sampler0: this.arrow_parts_texture}) 
      let arrow_frame = new Mesh(NoteTexture.arrow_frame_geometry, shader_frame);
      arrow_frame.x = 2 * 64 + 32
      arrow_frame.y = 2 * 64 + 32
      arrow_frame.rotation = -Math.PI/2
      NoteTexture.arrow_container.addChild(arrow_frame)
    }
    {
      let shader_body = Shader.from(this.noop_vert, this.mine_gradient_frag, 
        {sampler0: this.mine_parts_texture, time: 0})
      let mine_body = new Mesh(NoteTexture.mine_body_geometry, shader_body);
      mine_body.x = 32
      mine_body.y = 32
      NoteTexture.mine_container.addChild(mine_body)
    }
    
    app.ticker.add(() => {
      app.renderer.render(NoteTexture.arrow_container, {renderTexture: NoteTexture.arrow_tex});
      app.renderer.render(NoteTexture.mine_container, {renderTexture: NoteTexture.mine_tex});
    });
  }

  private static async loadGeometry(url: string): Promise<Geometry> {
    try {
      let text = await fetch(url).then(response => response.text())
      let lines = text.split("\n")
      let numVertices = parseInt(lines[0])
      let numTriangles = parseInt(lines[numVertices+1])
      let vPos = []
      let vUvs = []
      let vIndex = []
      for (let i = 0; i < numVertices; i++) {
        let match = /(-?[0-9.]+)\s+(-?[0-9.]+)\s+(-?[0-9.]+)\s+(-?[0-9.]+)/.exec(lines[i+1])
        if (match) {
          vPos.push(parseFloat(match[1]))
          vPos.push(parseFloat(match[2]))
          vUvs.push(parseFloat(match[3]))
          vUvs.push(parseFloat(match[4]))
        }else throw Error("Failed to load vertex " + lines[i+1])
      }
      for (let i = 0; i < numTriangles; i++) {
        let match = /(-?[0-9.]+)\s+(-?[0-9.]+)\s+(-?[0-9.]+)/.exec(lines[i+2+numVertices])
        if (match) {
          vIndex.push(parseFloat(match[1]))
          vIndex.push(parseFloat(match[2]))
          vIndex.push(parseFloat(match[3]))
        }else throw Error("Failed to load triangle " + lines[i+2+numVertices])
      }
      return new Geometry().addAttribute('aVertexPosition', vPos, 2).addAttribute('aUvs', vUvs, 2).addIndex(vIndex)
    } catch (err) {
      console.error(err)
      return new Geometry()
    }
  }

  static setArrowTexTime(beat: number, second: number) {
    for (let i = 0; i < 8; i ++) {
      (<Mesh>NoteTexture.arrow_container.children[i]).shader.uniforms.time = beat
    }
    (<Mesh>NoteTexture.mine_container.children[0]).shader.uniforms.time = second
  }

  static getSpriteWithQuant(i: number) {
    i = Math.min(i,7)
    let arrow = new Container()
    let body = new Sprite(new Texture(NoteTexture.arrow_tex.baseTexture, new Rectangle((i % 3) * 64, Math.floor(i/3) * 64, 64, 64)))
    let frame = new Sprite(new Texture(NoteTexture.arrow_tex.baseTexture, new Rectangle(128, 128, 64, 64)))
    body.anchor.set(0.5)
    frame.anchor.set(0.5)
    arrow.addChild(body)
    arrow.addChild(frame)
    return arrow
  }

  static getMine() {
    let tt = new Sprite(NoteTexture.mine_tex)
    tt.anchor.set(0.5)
    return tt
  }
}
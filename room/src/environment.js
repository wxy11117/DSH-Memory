import * as T from 'three';

// A direction-sampled panorama: both longitude and elevation follow the orbit.
export function createPanorama(texture){
  texture.colorSpace=T.SRGBColorSpace;texture.wrapS=T.RepeatWrapping;
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-1,1,1,-1,0,1);
  const uniforms={uMap:{value:texture},uYaw:{value:0},uPitch:{value:0},uAspect:{value:1},uScale:{value:.64},uTint:{value:new T.Color('#ffffff')},uTime:{value:0}};
  const material=new T.ShaderMaterial({depthTest:false,depthWrite:false,toneMapped:false,uniforms,
    vertexShader:`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader:`uniform sampler2D uMap;uniform float uYaw;uniform float uPitch;uniform float uAspect;uniform float uScale;uniform vec3 uTint;uniform float uTime;varying vec2 vUv;
      void main(){
        vec2 screen=vUv*2.-1.;vec3 ray=normalize(vec3(screen.x*uAspect*uScale,screen.y*uScale,-1.));
        float cp=cos(uPitch),sp=sin(uPitch),cy=cos(uYaw),sy=sin(uYaw);
        ray=vec3(ray.x,cp*ray.y+sp*ray.z,-sp*ray.y+cp*ray.z);
        ray=vec3(cy*ray.x+sy*ray.z,ray.y,-sy*ray.x+cy*ray.z);
        vec2 uv=vec2(fract(.5+atan(-ray.x,-ray.z)/6.2831853),.5+asin(clamp(ray.y,-1.,1.))/3.14159265);
        // Only clouds drift; shore landmarks remain fixed in their world direction.
        uv.x+=sin(uTime*.012)*.0015*smoothstep(.51,.65,uv.y);
        // Explicit LOD prevents the longitude wrap from creating a false mip stripe.
        vec3 col=textureLod(uMap,uv,0.).rgb;
        // Feather the wrap join without duplicating a visible landscape seam.
        float seam=1.-smoothstep(0.,.035,min(uv.x,1.-uv.x));
        vec3 opposite=textureLod(uMap,vec2(1.-uv.x,uv.y),0.).rgb;
        gl_FragColor=vec4(mix(col,opposite,seam*.5)*uTint,1.);
        #include <colorspace_fragment>
      }`});
  const quad=new T.Mesh(new T.PlaneGeometry(2,2),material);quad.frustumCulled=false;scene.add(quad);
  return{scene,camera,material,uniforms,update(mainCamera,target,aspect,tint,dt,time){const offset=mainCamera.position.clone().sub(target);uniforms.uYaw.value=Math.atan2(offset.x,offset.z);uniforms.uPitch.value=Math.atan2(offset.y,Math.hypot(offset.x,offset.z));uniforms.uAspect.value=aspect;uniforms.uTint.value.lerp(tint,1-Math.exp(-dt*2.5));uniforms.uTime.value=time}};
}

export function createOceanMaterial(){
  return new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uTime:{value:0},uSea:{value:new T.Color('#6ab7ce')},uFoam:{value:new T.Color('#d0eef0')},uBg:{value:new T.Color('#eaf1f5')},uStorm:{value:0},uFocus:{value:new T.Vector3()},uForward:{value:new T.Vector3(0,0,-1)}},
    vertexShader:`uniform float uTime;varying vec3 vP;void main(){vec3 p=position;p.y+=sin(p.x*1.6+uTime*.65)*.025+cos(p.z*1.4+uTime*.5)*.025;vP=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`uniform float uTime;uniform vec3 uSea;uniform vec3 uFoam;uniform vec3 uBg;uniform float uStorm;uniform vec3 uFocus;uniform vec3 uForward;varying vec3 vP;
      void main(){
        float bend=2./(1.+exp(-2.*(vP.x-8.)/4.5))-1.;float coast=-6.7+vP.x*.14+2.8*bend;
        float offshore=coast-vP.z;
        float wave=sin(vP.x*2.7+sin(vP.z*.85+uTime*.3)*2.+uTime*.3)*sin(vP.z*5.+sin(vP.x*.72)*1.8+uTime*.65);
        float glow=pow(max(0.,wave),11.);
        vec3 col=mix(uSea,uFoam,.04+glow*.13*(1.-uStorm*.5));
        col=mix(col,uFoam,(1.-smoothstep(0.,6.,offshore))*.18);
        float distanceFade=1.-smoothstep(9.,26.,dot(vP-uFocus,uForward));
        col=mix(col,uBg,smoothstep(12.,50.,offshore)*.14);
        gl_FragColor=vec4(col,distanceFade);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`});
}

// Far ground recedes into the painted coast according to world-space distance,
// so rotating the camera reveals the appropriate inland or seaward horizon.
export function addDistanceHaze(object,uniforms){
  const m=object.material.clone();m.transparent=true;object.material=m;
  m.onBeforeCompile=shader=>{
    shader.uniforms.uFocus=uniforms.uFocus;shader.uniforms.uForward=uniforms.uForward;
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nuniform vec3 uFocus;uniform vec3 uForward;varying float vCoastDepth;').replace('#include <project_vertex>','#include <project_vertex>\nvCoastDepth=dot((modelMatrix*vec4(transformed,1.)).xyz-uFocus,uForward);');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>','#include <common>\nvarying float vCoastDepth;').replace('#include <opaque_fragment>','diffuseColor.a*=1.-smoothstep(9.,26.,vCoastDepth);\n#include <opaque_fragment>');
  };
  m.customProgramCacheKey=()=> 'coastal-atmosphere-v4';return m;
}

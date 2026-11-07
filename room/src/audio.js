export class OceanAudio{
  constructor(){this.context=null;this.enabled=false;this.volume=.08;this.master=null;this.sources=[]}
  async toggle(){
    if(!this.context){
      const AudioCtx=window.AudioContext||window.webkitAudioContext;if(!AudioCtx)throw new Error('当前浏览器不支持环境音');
      this.context=new AudioCtx();const ctx=this.context;this.master=ctx.createGain();this.master.gain.value=0;this.master.connect(ctx.destination);
      const buffer=ctx.createBuffer(1,ctx.sampleRate*8,ctx.sampleRate);const data=buffer.getChannelData(0);let brown=0;for(let i=0;i<data.length;i++){brown=(brown+Math.random()*.04-.02)/1.02;data[i]=brown*3.5}
      const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=1100;this.waveGain=ctx.createGain();this.waveGain.gain.value=.65;source.connect(filter);filter.connect(this.waveGain);this.waveGain.connect(this.master);source.start();this.sources.push(source);
    }
    await this.context.resume();this.enabled=!this.enabled;this.master.gain.setTargetAtTime(this.enabled?this.volume:0,this.context.currentTime,.5);return this.enabled;
  }
  update(time,balcony){if(!this.enabled)return;this.waveGain.gain.value=(.48+Math.sin(time*.38)*.2+Math.sin(time*.19)*.12)*(balcony?1.3:.7)}
}

import React, { useState, useRef, useEffect } from 'react';
import { MapaOlhoSextaFeira } from './MapaSextaFeira';
import { imagensDaFicha } from '../../core/avatar';
import { useImagemQueCarrega } from '../../hooks/useImagemQueCarrega';
import { VOLUME_MAXIMO_VOZ, lerVolumeVoz, salvarVolumeVoz } from '../../core/volumesVoz';
import {
    FFT_SIZE, LIMIAR_FALA_REMOTA, NIVEL_MAXIMO_EXIBIDO, SENSIBILIDADE_MAX, SENSIBILIDADE_MIN, SENSIBILIDADE_PADRAO,
    estadoPortao, faixaDeVoz, medirNivelDeVoz
} from '../../core/audioVoz';

// ==========================================
// 🧠 OUVINDO A MESA: O CÉREBRO DA SEXTA-FEIRA
// ==========================================
export function useOuvidoSextaFeira(meuNome, isPresente, mutado) {
    const [transcript, setTranscript] = useState('');

    useEffect(() => {
        // Se o jogador não está na call ou mutou o mic, a Sexta-Feira para de ouvir
        if (!isPresente || mutado) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            console.warn("Navegador não suporta transcrição nativa.");
            return;
        }

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'pt-BR'; // Pode trocar para pt-PT se preferir

        recognition.onresult = (event) => {
            const lastResultIndex = event.results.length - 1;
            const fraseDigitada = event.results[lastResultIndex][0].transcript.trim();
            
            if (fraseDigitada) {
                console.log(`[Sexta-Feira ouviu] ${meuNome}: ${fraseDigitada}`);
                // 🔥 NO FUTURO, DESCOMENTAREMOS AQUI PARA ENVIAR AO FIREBASE:
                // enviarMemoriaSextaFeira(meuNome, fraseDigitada);
            }
        };

        // Erros que nunca se resolvem sozinhos (ex.: 'network' no app desktop, que não tem o serviço
        // de voz do Google). Reiniciar nesses casos abre/fecha a captura do microfone em laço e
        // atrapalha o áudio da chamada — então o ouvido é desligado de vez.
        let desistiu = false;
        let reinicios = 0;
        let silencio = false;
        recognition.onerror = (e) => {
            console.log("Erro no ouvido da IA:", e.error);
            if (['network', 'not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(e.error)) desistiu = true;
            // Silêncio longo encerra a sessão normalmente: não conta como falha para o limite.
            if (e.error === 'no-speech') silencio = true;
        };

        // Reinicia se parar (para ficar sempre a escutar durante a sessão), com pausa crescente e limite.
        let timeoutReinicio;
        recognition.onend = () => {
            if (desistiu || !isPresente || mutado || reinicios >= 20) return;
            const espera = silencio ? 500 : Math.min(10000, 500 * 2 ** Math.min(reinicios, 5));
            if (!silencio) reinicios += 1;
            silencio = false;
            timeoutReinicio = setTimeout(() => { try { recognition.start(); } catch (err) { /* já iniciado */ } }, espera);
        };
        recognition.onresult = ((original) => (event) => { reinicios = 0; original(event); })(recognition.onresult);

        try { recognition.start(); } catch (err) { return; }

        return () => { clearTimeout(timeoutReinicio); recognition.onend = null; recognition.abort(); };
    }, [meuNome, isPresente, mutado]);

    return transcript;
}

// ==========================================
// 📡 FUNÇÕES ORIGINAIS DE ÁUDIO DO SISTEMA
// ==========================================

export function urlSeguraParaCss(url) {
    if (!url || typeof url !== 'string') return '';
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed) && !/^data:image\//i.test(trimmed)) return '';
    // Aspas e barras quebrariam o url("..."); parênteses são codificados (links como "arte (1).png" seguem válidos).
    return `url("${trimmed.replace(/["\\]/g, '').replace(/\)/g, '%29')}")`;
}

export function PlayerDeAudioRemoto({ stream, volume, surdo, sinkId }) {
    const audioRef = useRef(null);
    const ctxRef = useRef(null);
    const ganhoRef = useRef(null);

    // A voz passa por um GainNode (permite passar de 100%) e por um limitador que segura os picos para não
    // estourar. O <audio> continua ligado ao stream, mas mudo: o Chromium só entrega o áudio remoto ao
    // Web Audio se houver um elemento consumindo o stream. Sem Web Audio (ou sem AudioContext.setSinkId, que
    // é o que respeita a caixa de som escolhida), toca direto no elemento (até 100%).
    useEffect(() => {
        const audio = audioRef.current;
        if (!audio || !stream) return undefined;
        if (audio.srcObject !== stream) audio.srcObject = stream;
        const Contexto = typeof window !== 'undefined' ? (window.AudioContext || window.webkitAudioContext) : null;
        if (!Contexto) {
            audio.play().catch(() => console.warn('Clique na tela para ouvir os jogadores'));
            return undefined;
        }
        let ctx = null;
        let retomar = null;
        try {
            ctx = new Contexto();
            if (typeof ctx.setSinkId !== 'function') throw new Error('sem setSinkId');
            const fonte = ctx.createMediaStreamSource(stream);
            const ganho = ctx.createGain();
            const limitador = ctx.createDynamicsCompressor();
            limitador.threshold.value = -6;
            limitador.knee.value = 6;
            limitador.ratio.value = 12;
            limitador.attack.value = 0.003;
            limitador.release.value = 0.1;
            fonte.connect(ganho);
            ganho.connect(limitador);
            limitador.connect(ctx.destination);
            audio.muted = true;
            ctxRef.current = ctx;
            ganhoRef.current = ganho;
            if (ctx.state === 'suspended') ctx.resume().catch(() => {});
            // Se o navegador segurou o contexto até haver interação, retoma no primeiro toque/tecla.
            retomar = () => { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {}); };
            document.addEventListener('pointerdown', retomar, { once: true });
            document.addEventListener('keydown', retomar, { once: true });
            audio.play().catch(() => console.warn('Clique na tela para ouvir os jogadores'));
        } catch (e) {
            // Falhou no meio: volta para o elemento simples.
            if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
            ctx = null;
            ctxRef.current = null;
            ganhoRef.current = null;
            audio.muted = false;
            audio.play().catch(() => console.warn('Clique na tela para ouvir os jogadores'));
        }
        return () => {
            if (retomar) {
                document.removeEventListener('pointerdown', retomar);
                document.removeEventListener('keydown', retomar);
            }
            ganhoRef.current = null;
            ctxRef.current = null;
            if (ctx && ctx.state !== 'closed') ctx.close().catch(() => {});
        };
    }, [stream]);

    useEffect(() => {
        const alvo = surdo ? 0 : Math.min(VOLUME_MAXIMO_VOZ, Math.max(0, volume));
        if (ganhoRef.current) ganhoRef.current.gain.value = alvo;
        else if (audioRef.current) audioRef.current.volume = Math.min(1, alvo);
    }, [volume, surdo, stream]);

    useEffect(() => {
        if (!sinkId) return;
        const ctx = ctxRef.current;
        if (ctx && typeof ctx.setSinkId === 'function') {
            ctx.setSinkId(sinkId).catch(err => console.log('Bloqueio saída:', err));
        } else if (audioRef.current && typeof audioRef.current.setSinkId === 'function') {
            audioRef.current.setSinkId(sinkId).catch(err => console.log('Bloqueio saída:', err));
        }
    }, [sinkId, stream]);

    return <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />;
}

export function CalibradorDeVoz({ stream, sensibilidade, setSensibilidade }) {
    const barraRef = useRef(null);
    const marcaEfetivaRef = useRef(null);
    // A barra lê a sensibilidade por ref: arrastar o controle não recria o contexto de áudio.
    const sensibilidadeRef = useRef(sensibilidade);
    useEffect(() => { sensibilidadeRef.current = sensibilidade; }, [sensibilidade]);

    useEffect(() => {
        if (!stream) return undefined;
        let raf;
        const actx = new (window.AudioContext || window.webkitAudioContext)();
        try {
            const source = actx.createMediaStreamSource(stream);
            const analyser = actx.createAnalyser();
            analyser.fftSize = FFT_SIZE;
            analyser.smoothingTimeConstant = 0.5;
            source.connect(analyser);

            const faixa = faixaDeVoz(actx.sampleRate, FFT_SIZE);
            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const draw = () => {
                analyser.getByteFrequencyData(dataArray);
                // Mesma medida do portão de ruído: só a faixa da voz.
                const nivel = medirNivelDeVoz(dataArray, faixa);
                const percent = Math.min(100, (nivel / NIVEL_MAXIMO_EXIBIDO) * 100);
                // Com o portão ativo, a cor mostra se o microfone está de fato aberto (limiar efetivo).
                const passou = estadoPortao.ativo ? estadoPortao.aberto : nivel > sensibilidadeRef.current;

                if (barraRef.current) {
                    barraRef.current.style.width = `${percent}%`;
                    barraRef.current.style.backgroundColor = passou ? '#00ffcc' : '#ffcc00';
                }
                if (marcaEfetivaRef.current) {
                    marcaEfetivaRef.current.style.display = estadoPortao.ativo ? 'block' : 'none';
                    marcaEfetivaRef.current.style.left = `${Math.min(100, (estadoPortao.limiar / NIVEL_MAXIMO_EXIBIDO) * 100)}%`;
                }
                raf = requestAnimationFrame(draw);
            };
            draw();
            return () => { cancelAnimationFrame(raf); actx.close(); };
        } catch (e) { return undefined; }
    }, [stream]);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderLeft: '1px solid #444', paddingLeft: '15px' }} title="Arraste para ajustar o limiar mínimo do microfone. A marca tracejada é o limiar que está valendo agora: ele sobe sozinho quando a sala tem ruído de fundo.">
            <span style={{ color: '#aaa', fontSize: '0.8em' }}>Sensibilidade:</span>
            <div style={{ position: 'relative', width: '140px', height: '14px', background: '#000', borderRadius: '7px', border: '1px solid #333', overflow: 'hidden' }}>
                <div ref={barraRef} style={{ width: '0%', height: '100%', background: '#ffcc00', transition: 'width 0.05s ease-out' }} />
                <input type="range" min={SENSIBILIDADE_MIN} max={SENSIBILIDADE_MAX} value={sensibilidade} onChange={e => setSensibilidade(parseInt(e.target.value))} aria-label="Sensibilidade do microfone" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(sensibilidade / NIVEL_MAXIMO_EXIBIDO) * 100}%`, width: '2px', background: '#fff', boxShadow: '0 0 5px #fff', pointerEvents: 'none' }} />
                <div ref={marcaEfetivaRef} className="calibrador-marca-efetiva" style={{ display: 'none', left: '0%' }} />
            </div>
        </div>
    );
}

export function AvatarCardVoz({ nome, info, ficha, isMe, isConnected, streamParaTocar, streamAnalisador, mutado, surdo, fazerChamada, cardSize, fmt, selectedSpeaker }) {
    const [isSpeakingRemote, setIsSpeakingRemote] = useState(false);
    // Usa a primeira imagem que carrega (Forma/poder/base): um link quebrado não deixa mais o cartão preto.
    const imagemDoCartao = useImagemQueCarrega(ficha ? imagensDaFicha(ficha) : (info && info.img ? [info.img] : []));
    const [volume, setVolumeLocal] = useState(() => lerVolumeVoz(nome));
    // O áudio toca no player global (AudioVozGlobal); aqui só o controle de volume.
    const setVolume = (v) => { setVolumeLocal(v); salvarVolumeVoz(nome, v); };
    
    const [euEstouFalandoState, setEuEstouFalandoState] = useState(false);

    useEffect(() => {
        const targetStream = isMe ? streamAnalisador : streamParaTocar;
        if (!targetStream) return;
        let actx; let raf;

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            actx = new AudioContext();
            if (actx.state === 'suspended') actx.resume();

            const source = actx.createMediaStreamSource(targetStream);
            const analyser = actx.createAnalyser();
            analyser.fftSize = FFT_SIZE;
            analyser.smoothingTimeConstant = 0.4; 
            source.connect(analyser); 

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const faixa = faixaDeVoz(actx.sampleRate, FFT_SIZE);
            const limiarLocal = () => parseInt(localStorage.getItem('rpg_sensibilidade_voz_v2')) || SENSIBILIDADE_PADRAO;

            const checkVolume = () => {
                analyser.getByteFrequencyData(dataArray);
                const nivel = medirNivelDeVoz(dataArray, faixa);
                // Eu: brilha quando o portão de ruído está aberto (é isso que os outros ouvem).
                const falando = isMe
                    ? (estadoPortao.ativo ? estadoPortao.aberto : nivel > limiarLocal())
                    : nivel > LIMIAR_FALA_REMOTA;
                
                if (isMe) setEuEstouFalandoState(falando);
                else setIsSpeakingRemote(falando);
                
                raf = requestAnimationFrame(checkVolume);
            };
            checkVolume();
        } catch(err) {}

        return () => {
            if (raf) cancelAnimationFrame(raf);
            if (actx && actx.state !== 'closed') actx.close().catch(()=>{});
        };
    }, [streamAnalisador, streamParaTocar, isMe]);

    let boxShadowCard = '0 0 15px rgba(0,0,0,0.8)';
    let borderCard = '2px solid #333';
    let iconMic = '⏳';
    const isSpeakingFinal = isMe ? euEstouFalandoState : isSpeakingRemote;

    if (isConnected) {
        if (isMe && mutado) { borderCard = '2px solid #ff003c'; boxShadowCard = '0 0 20px rgba(255,0,60,0.4)'; iconMic = '🔇'; } 
        else if (isSpeakingFinal) { borderCard = '2px solid #00ffcc'; boxShadowCard = '0 0 35px #00ffcc, inset 0 0 20px rgba(0,255,204,0.4)'; iconMic = '🔊'; } 
        else if (!isMe && streamParaTocar) { borderCard = '2px solid #00aaff'; boxShadowCard = '0 0 20px rgba(0,170,255,0.4)'; iconMic = '🔊'; } 
        else { borderCard = '2px solid #005588'; boxShadowCard = '0 0 10px rgba(0,85,136,0.5)'; iconMic = '🎙️'; }
    } else if (!isMe) { borderCard = '2px dashed #444'; boxShadowCard = 'none'; iconMic = '🔄'; }

    return (
        <div className="fade-in" style={{ position: 'relative', width: cardSize, aspectRatio: '4/3', background: '#111', border: borderCard, borderRadius: 6, overflow: 'hidden', backgroundImage: urlSeguraParaCss(imagemDoCartao) || 'none', backgroundSize: 'cover', backgroundPosition: 'top center', boxShadow: boxShadowCard, transition: 'all 0.15s ease-out' }}>
            <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.8)', borderRadius: '50%', padding: '5px 8px', fontSize: '1.2em', border: borderCard }}>{iconMic}</div>
            
            {!isConnected && !isMe && (
                <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10 }}>
                    <button className="btn-neon btn-blue" onClick={(e) => { e.stopPropagation(); fazerChamada(nome); }} style={{ padding: '8px 15px', fontSize: '0.9em', fontWeight: 'bold', boxShadow: '0 0 10px #0088ff' }}>📞 FORÇAR LIGAÇÃO</button>
                </div>
            )}
            
            <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', display: 'flex', flexDirection: 'column', background: 'rgba(10,10,15,0.9)', borderTop: '2px solid #222', padding: '6px 10px', backdropFilter: 'blur(3px)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ color: isConnected ? (isSpeakingFinal ? '#00ffcc' : '#00aaff') : '#fff', fontWeight: 'bold', fontSize: '0.8em', textTransform: 'uppercase', letterSpacing: 1, textShadow: '1px 1px 2px #000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'color 0.2s', paddingRight: '5px' }}>{nome}</span>
                    {!isMe && isConnected && streamParaTocar && (
                        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '104px', background: 'rgba(0,0,0,0.5)', padding: '2px 5px', borderRadius: '10px', border: '1px solid #333' }} title={`Volume desta voz: ${Math.round(volume * 100)}% (vai até ${VOLUME_MAXIMO_VOZ * 100}%)`}>
                            <span style={{ fontSize: '9px', color: volume === 0 ? '#ff003c' : '#aaa' }}>{volume === 0 ? '🔇' : '🔉'}</span>
                            <input type="range" min="0" max={VOLUME_MAXIMO_VOZ} step="0.05" value={volume} onChange={e => setVolume(parseFloat(e.target.value))} aria-label={`Volume de ${nome}`} style={{ width: '100%', height: '3px', cursor: 'pointer', accentColor: volume > 1 ? '#ffcc00' : '#00ffcc' }} />
                            <span style={{ fontSize: '9px', color: '#aaa', minWidth: '26px', textAlign: 'right' }}>{Math.round(volume * 100)}%</span>
                        </div>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                    <span style={{ color: '#ff003c', fontSize: '0.6em', fontWeight: 'bold', width: '15px' }}>HP</span>
                    <div style={{ flex: 1, background: '#300', height: 6, border: '1px solid #000', position: 'relative' }}><div style={{ width: '100%', height: '100%', background: '#ff003c', boxShadow: '0 0 5px #ff003c' }}></div></div>
                    <span style={{ color: '#fff', fontSize: '0.6em', fontWeight: 'bold', minWidth: '35px', textAlign: 'right' }}>{fmt(ficha?.vida?.atual)}</span>
                </div>
            </div>
        </div>
    );
}

export function MapaSessaoRP({ chatCtx, meuNome, minhaFicha, personagens, cenario, isPresenteNaTaverna, togglePresencaTaverna, getAvatarInfo, fmt }) {
    const playerCount = cenario?.tavernaAtivos?.length || 0;
    const cardSize = playerCount === 1 ? '400px' : playerCount === 2 ? '350px' : '280px';
    const [radioLigado, setRadioLigado] = useState(false);

    // 🔥 OUVINDO A MESA: A Sexta-Feira agora está conectada!
    useOuvidoSextaFeira(meuNome, isPresenteNaTaverna, chatCtx.mutado);

    return (
        <>
            <MapaOlhoSextaFeira meuNome={meuNome} personagens={personagens} minhaFicha={minhaFicha} tavernaAtivos={cenario?.tavernaAtivos} meuStream={chatCtx.meuStream} conexoes={chatCtx.conexoes} />

            {!radioLigado ? (
                <div className="fade-in" style={{ minHeight: '60vh', background: 'radial-gradient(circle, rgba(30,10,20,0.9) 0%, rgba(0,0,0,1) 100%)', borderRadius: 5, border: '2px solid #ffcc00', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <h1 style={{ color: '#00ffcc' }}>SALA DE RÁDIO DA PARTY</h1>
                    <p style={{ color: '#aaa' }}>Fechem o vosso Discord e entrem no rádio para comunicarem por aqui.</p>
                    <button className="btn-neon btn-green" onClick={() => setRadioLigado(true)}>▶ ENTRAR NO RÁDIO</button>
                </div>
            ) : (
                <div className="fade-in" style={{ minHeight: '60vh', background: 'radial-gradient(circle, rgba(30,10,20,0.9) 0%, rgba(0,0,0,1) 100%)', borderRadius: 5, border: '2px solid #ffcc00', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <h1 style={{ color: '#ffcc00', margin: 0 }}>SESSÃO RP</h1>
                    
                    {isPresenteNaTaverna && (
                        <div style={{ display: 'flex', gap: '20px', alignItems: 'center', marginBottom: '20px', background: 'rgba(0,0,0,0.5)', padding: '10px 15px', borderRadius: '5px', border: '1px solid #333', flexWrap: 'wrap', justifyContent: 'center' }}>
                            <div style={{ color: '#00ffcc', fontSize: '0.85em', fontFamily: 'monospace' }}>📡 {chatCtx.voiceStatus}</div>
                            
                            {chatCtx.mics.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                    <span style={{ fontSize: '1.2em' }}>🎙️</span>
                                    <select className="input-neon" value={chatCtx.selectedMic} onChange={e => chatCtx.trocarMicrofone(e.target.value)} style={{ padding: '4px', fontSize: '0.8em', background: '#000', color: '#fff', borderColor: '#00ffcc', borderRadius: '5px', maxWidth: '200px' }}>
                                        {chatCtx.mics.map(m => <option key={m.deviceId} value={m.deviceId}>{m.label || `Mic ${m.deviceId.substring(0,4)}`}</option>)}
                                    </select>
                                </div>
                            )}
                            
                            {chatCtx.speakers.length > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 5, borderLeft: '1px solid #444', paddingLeft: '15px' }}>
                                    <span style={{ fontSize: '1.2em' }}>🎧</span>
                                    <select className="input-neon" value={chatCtx.selectedSpeaker} onChange={e => chatCtx.trocarSpeaker(e.target.value)} style={{ padding: '4px', fontSize: '0.8em', background: '#000', color: '#fff', borderColor: '#00aaff', borderRadius: '5px', maxWidth: '200px' }}>
                                        {chatCtx.speakers.map(s => <option key={s.deviceId} value={s.deviceId}>{s.label || `Saída ${s.deviceId.substring(0,4)}`}</option>)}
                                    </select>
                                </div>
                            )}
                            
                            <label style={{ color: '#00ffcc', fontSize: '0.8em', cursor: 'pointer', borderLeft: '1px solid #444', paddingLeft: '15px' }}>
                                <input type="checkbox" checked={chatCtx.supressorAtivo} onChange={e => chatCtx.setSupressorAtivo(e.target.checked)} /> Filtro de Eco
                            </label>

                            {chatCtx.streamAnalisador && <CalibradorDeVoz stream={chatCtx.streamAnalisador} sensibilidade={chatCtx.sensibilidadeVoz} setSensibilidade={chatCtx.setSensibilidadeVoz} />}
                        </div>
                    )}
                    
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '30px' }}>
                        <button onClick={chatCtx.toggleMute} disabled={!isPresenteNaTaverna} style={{ opacity: isPresenteNaTaverna ? 1 : 0.3, width: '45px', height: '45px', borderRadius: '50%', background: chatCtx.mutado ? '#ff003c' : '#00ffcc', color: '#000', cursor: 'pointer', border: 'none', boxShadow: `0 0 10px ${chatCtx.mutado ? '#ff003c' : '#00ffcc'}` }}>{chatCtx.mutado ? '🔇' : '🎙️'}</button>
                        <button onClick={chatCtx.toggleDeafen} disabled={!isPresenteNaTaverna} style={{ opacity: isPresenteNaTaverna ? 1 : 0.3, width: '45px', height: '45px', borderRadius: '50%', background: chatCtx.surdo ? '#ff003c' : 'rgba(255,255,255,0.1)', color: '#fff', cursor: 'pointer', border: 'none' }}>{chatCtx.surdo ? '🔕' : '🎧'}</button>
                        <button className={`btn-neon ${isPresenteNaTaverna ? 'btn-red' : 'btn-green'}`} onClick={togglePresencaTaverna}>{isPresenteNaTaverna ? 'SAIR DA TAVERNA' : 'SENTAR NA MESA'}</button>
                    </div>

                    <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: '25px', width: '100%' }}>
                        {Array.isArray(cenario?.tavernaAtivos) && cenario.tavernaAtivos.map(nome => {
                            const isMe = nome === meuNome;
                            const f = isMe ? minhaFicha : personagens?.[nome];
                            const info = getAvatarInfo(f);
                            const con = chatCtx.conexoes.find(c => c.id === `anime-rpg-${(nome||'').toLowerCase().replace(/[^a-z0-9]/g, '')}`);
                            
                            return (
                                <AvatarCardVoz 
                                    key={nome} nome={nome} info={info} ficha={f} isMe={isMe} 
                                    isConnected={isMe || !!con} streamParaTocar={con?.stream} streamAnalisador={isMe ? chatCtx.streamAnalisador : null} 
                                    mutado={chatCtx.mutado} surdo={chatCtx.surdo} fazerChamada={chatCtx.fazerChamada} 
                                    cardSize={cardSize} fmt={fmt} selectedSpeaker={chatCtx.selectedSpeaker} 
                                />
                            );
                        })}
                    </div>
                </div>
            )}
        </>
    );
}
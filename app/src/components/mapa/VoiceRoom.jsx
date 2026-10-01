import React, { useState, useRef, useEffect } from 'react';
import { urlSeguraParaCss } from './MapaFormContext';
import { ref, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { storage, functions } from '../../services/firebase-config';

export function PlayerDeAudioRemoto({ stream, volume, surdo, nome, sinkId }) {
    const audioRef = useRef(null);
    useEffect(() => {
        if (audioRef.current && stream && audioRef.current.srcObject !== stream) {
            audioRef.current.srcObject = stream;
            audioRef.current.play().catch(e => console.warn(`Clique na tela para ouvir ${nome}`));
        }
    }, [stream, nome]);

    useEffect(() => {
        if (audioRef.current) audioRef.current.volume = surdo ? 0 : Math.min(1, Math.max(0, volume));
    }, [volume, surdo]);

    useEffect(() => {
        if (audioRef.current && sinkId && typeof audioRef.current.setSinkId === 'function') {
            audioRef.current.setSinkId(sinkId).catch(err => console.log('O navegador bloqueou a troca de saída:', err));
        }
    }, [sinkId]);

    return <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />;
}

export function CalibradorDeVoz({ stream, sensibilidade, setSensibilidade }) {
    const barraRef = useRef(null);
    useEffect(() => {
        if (!stream) return;
        let raf;
        const actx = new (window.AudioContext || window.webkitAudioContext)();
        try {
            const source = actx.createMediaStreamSource(stream); 
            const analyser = actx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.5;
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const draw = () => {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0; for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
                const avg = sum / dataArray.length; 
                const percent = Math.min(100, (avg / 60) * 100); 
                
                if (barraRef.current) {
                    barraRef.current.style.width = `${percent}%`;
                    barraRef.current.style.backgroundColor = avg > sensibilidade ? '#00ffcc' : '#ffcc00';
                }
                raf = requestAnimationFrame(draw);
            };
            draw();
            return () => { cancelAnimationFrame(raf); actx.close(); };
        } catch(e) {}
    }, [stream, sensibilidade]);

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', borderLeft: '1px solid #444', paddingLeft: '15px' }}>
            <span style={{ color: '#aaa', fontSize: '0.8em' }}>Limiar:</span>
            <div style={{ position: 'relative', width: '120px', height: '14px', background: '#000', borderRadius: '7px', border: '1px solid #333', overflow: 'hidden' }}>
                <div ref={barraRef} style={{ width: '0%', height: '100%', background: '#ffcc00', transition: 'width 0.05s ease-out, background-color 0.1s' }} />
                <input type="range" min="1" max="50" value={sensibilidade} onChange={e => setSensibilidade(parseInt(e.target.value))} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }} />
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(sensibilidade / 60) * 100}%`, width: '2px', background: '#fff', boxShadow: '0 0 5px #fff', pointerEvents: 'none' }} />
            </div>
        </div>
    );
}

export function AvatarCardVoz({ nome, info, ficha, isMe, isConnected, streamParaTocar, streamAnalisador, mutado, surdo, fazerChamada, cardSize, fmt, selectedSpeaker }) {
    const [isSpeakingRemote, setIsSpeakingRemote] = useState(false);
    const [volume, setVolume] = useState(() => {
        const saved = localStorage.getItem(`rpg_vol_${nome}`);
        return saved !== null ? parseFloat(saved) : 1; 
    });
    useEffect(() => { try { localStorage.setItem(`rpg_vol_${nome}`, volume); } catch (e) { /* sem localStorage */ } }, [volume, nome]);
    
    const [euEstouFalandoState, setEuEstouFalandoState] = useState(false);

    useEffect(() => {
        const targetStream = isMe ? streamAnalisador : streamParaTocar;
        if (!targetStream) return;

        let actx;
        let raf;

        try {
            const AudioContext = window.AudioContext || window.webkitAudioContext;
            actx = new AudioContext();
            if (actx.state === 'suspended') actx.resume();

            const source = actx.createMediaStreamSource(targetStream);
            const analyser = actx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.4; 
            source.connect(analyser); 

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const getLimiar = () => isMe ? (parseInt(localStorage.getItem('rpg_sensibilidade_voz')) || 10) : 5;

            const checkVolume = () => {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0; for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                const falando = (sum / dataArray.length) > getLimiar();
                
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
        <div className="fade-in" style={{ position: 'relative', width: cardSize, aspectRatio: '4/3', background: '#111', border: borderCard, borderRadius: 6, overflow: 'hidden', backgroundImage: urlSeguraParaCss(info.img) || 'none', backgroundSize: 'cover', backgroundPosition: 'top center', boxShadow: boxShadowCard, transition: 'all 0.15s ease-out' }}>
            <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(0,0,0,0.8)', borderRadius: '50%', padding: '5px 8px', fontSize: '1.2em', border: borderCard, transition: 'all 0.15s ease-out' }}>{iconMic}</div>
            
            {!isConnected && !isMe && (
                <div style={{ position: 'absolute', top: '40%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 10 }}>
                    <button className="btn-neon btn-blue" onClick={(e) => { e.stopPropagation(); fazerChamada(nome); }} style={{ padding: '8px 15px', fontSize: '0.9em', fontWeight: 'bold', boxShadow: '0 0 10px #0088ff' }}>📞 FORÇAR LIGAÇÃO</button>
                </div>
            )}
            
            {!isMe && isConnected && streamParaTocar && (
                <PlayerDeAudioRemoto stream={streamParaTocar} volume={volume} surdo={surdo} nome={nome} sinkId={selectedSpeaker} />
            )}

            <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', display: 'flex', flexDirection: 'column', background: 'rgba(10,10,15,0.9)', borderTop: '2px solid #222', padding: '6px 10px', backdropFilter: 'blur(3px)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ color: isConnected ? (isSpeakingFinal ? '#00ffcc' : '#00aaff') : '#fff', fontWeight: 'bold', fontSize: '0.8em', textTransform: 'uppercase', letterSpacing: 1, textShadow: '1px 1px 2px #000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', transition: 'color 0.2s', paddingRight: '5px' }}>{nome}</span>
                    {!isMe && isConnected && streamParaTocar && (
                        <div onClick={e => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center', gap: '4px', width: '70px', background: 'rgba(0,0,0,0.5)', padding: '2px 5px', borderRadius: '10px', border: '1px solid #333' }}>
                            <span style={{ fontSize: '9px', color: volume === 0 ? '#ff003c' : '#aaa' }}>{volume === 0 ? '🔇' : '🔉'}</span>
                            <input type="range" min="0" max="1" step="0.05" value={volume} onChange={e => setVolume(parseFloat(e.target.value))} style={{ width: '100%', height: '3px', cursor: 'pointer', accentColor: '#00ffcc' }} />
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

export function MapaOlhoSextaFeira({ meuNome, personagens, minhaFicha, tavernaAtivos, meuStream, conexoes }) {
    const [gravando, setGravando] = useState(false);
    const [expandido, setExpandido] = useState(false);
    const [logs, setLogs] = useState(['Sexta-Feira: Olho de Escuta pronto.']);

    // 🔥 MÁSCARAS LIBERADAS PARA TODOS! SEM TRAVAS! 🔥
    const [mascaraMestre, setMascaraMestre] = useState('narrador'); 
    const [nomeNpc, setNomeNpc] = useState('');

    const mediaRecorderRef = useRef(null);
    const timerRef = useRef(null);
    const mixerCtxRef = useRef(null);
    const pedacoContadorRef = useRef(1);

    const perfisJogadores = (Array.isArray(tavernaAtivos) ? tavernaAtivos : []).map(nome => {
        const ficha = nome === meuNome ? minhaFicha : personagens?.[nome];
        return `${nome} (Classe: ${ficha?.bio?.classe || 'Mundano'}, Raça: ${ficha?.bio?.raca || 'Desconhecida'})`;
    });

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") mediaRecorderRef.current.stop();
            if (mixerCtxRef.current) mixerCtxRef.current.close();
        };
    }, []);

    const addLog = (msg) => { const hora = new Date().toLocaleTimeString(); setLogs(prev => [...prev.slice(-4), `[${hora}] ${msg}`]); };

    const iniciarGravacao = () => {
        if (!meuStream) return addLog("❌ Erro: Microfone offline.");
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            mixerCtxRef.current = audioCtx;
            const destination = audioCtx.createMediaStreamDestination();
            
            audioCtx.createMediaStreamSource(meuStream).connect(destination);
            let vozesExtras = 0;
            conexoes.forEach(c => { if (c.stream) { audioCtx.createMediaStreamSource(c.stream).connect(destination); vozesExtras++; } });
            
            const recorder = new MediaRecorder(destination.stream, { mimeType: 'audio/webm' });
            let chunks = [];
            pedacoContadorRef.current = 1;

            recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
            
            recorder.onstop = async () => {
                if (chunks.length === 0) return;
                const audioBlob = new Blob(chunks, { type: 'audio/webm' }); chunks = [];
                const num = pedacoContadorRef.current; pedacoContadorRef.current++;
                try {
                    const nomeArquivo = `sessao_mapa_${Date.now()}_pt${num}.webm`;
                    await uploadBytes(ref(storage, `audios_mesa/${nomeArquivo}`), audioBlob);
                    
                    // 🔥 DIRETRIZ DE MÁSCARA ENVIADA PARA A NUVEM 🔥
                    const instrucaoMestre = (mascaraMestre === 'npc' && nomeNpc.trim())
                        ? `[ATENÇÃO IA: O usuário (${meuNome}) está interpretando o NPC/Personagem "${nomeNpc.trim()}" nesta gravação. Atribua as falas e emoções a ele.]` 
                        : `[ATENÇÃO IA: O usuário (${meuNome}) está atuando como o Narrador do mundo. Contudo, se ele usar vozes ou mencionar nomes diferentes em diálogos, formate inteligentemente no padrão "[NPC - Nome]: Fala".]`;

                    const transcrever = httpsCallable(functions, 'transcreverAudioSextaFeira');
                    await transcrever({ 
                        fileName: nomeArquivo, 
                        nomesParticipantes: perfisJogadores, 
                        gravadorPrincipal: meuNome,
                        instrucaoMestre: instrucaoMestre 
                    });
                    addLog(`✅ P${num} gravada e salva!`);
                } catch(e) { addLog(`❌ Erro P${num}`); }
            };

            recorder.start();
            mediaRecorderRef.current = recorder;
            setGravando(true); setExpandido(false);
            addLog(`🎙️ A gravar Mic + ${vozesExtras} amigos!`);

            timerRef.current = setInterval(() => {
                if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
                recorder.start();
            }, 20 * 60 * 1000);
        } catch(e) { addLog("❌ Erro ao iniciar."); }
    };

    const pararGravacao = () => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
        if (mixerCtxRef.current) mixerCtxRef.current.close();
        setGravando(false); addLog("⏹️ Gravação parada.");
    };

    return (
        <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 99999, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '10px' }}>
            {expandido && (
                <div className="fade-in" style={{ background: 'rgba(10,10,15,0.95)', border: `2px solid ${gravando ? '#ff003c' : '#0088ff'}`, borderRadius: '10px', padding: '15px', width: '300px', boxShadow: `0 0 20px ${gravando ? 'rgba(255,0,60,0.4)' : 'rgba(0,136,255,0.4)'}` }}>
                    <div style={{ borderBottom: '1px solid #333', paddingBottom: '5px', display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ color: gravando ? '#ff003c' : '#0088ff', fontWeight: 'bold' }}>{gravando ? '🔴 Gravando...' : '📡 Sexta-Feira'}</span>
                        <button onClick={() => setExpandido(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer' }}>✕</button>
                    </div>

                    {/* 🔥 PAINEL DE MÁSCARA SEMPRE VISÍVEL PARA TODOS 🔥 */}
                    <div style={{ marginTop: '10px', padding: '10px', background: 'rgba(0,0,0,0.5)', borderRadius: '8px', border: '1px dashed #ffcc00' }}>
                        <span style={{ color: '#ffcc00', fontSize: '0.8em', fontWeight: 'bold', display: 'block', marginBottom: '5px', textAlign: 'center' }}>🎭 MÁSCARA DE GRAVAÇÃO</span>
                        <div style={{ display: 'flex', gap: '5px', marginBottom: mascaraMestre === 'npc' ? '8px' : '0' }}>
                            <button className={`btn-neon ${mascaraMestre === 'narrador' ? 'btn-gold' : ''}`} onClick={() => setMascaraMestre('narrador')} style={{ flex: 1, padding: '5px', fontSize: '0.75em', margin: 0, borderColor: '#ffcc00', color: mascaraMestre === 'narrador' ? '#fff' : '#ffcc00' }}>📖 Narrador</button>
                            <button className={`btn-neon ${mascaraMestre === 'npc' ? 'btn-blue' : ''}`} onClick={() => setMascaraMestre('npc')} style={{ flex: 1, padding: '5px', fontSize: '0.75em', margin: 0, borderColor: '#00aaff', color: mascaraMestre === 'npc' ? '#fff' : '#00aaff' }}>👺 NPC</button>
                        </div>
                        {mascaraMestre === 'npc' && (
                            <input className="input-neon fade-in" type="text" placeholder="Qual o nome do NPC agora?" value={nomeNpc} onChange={e => setNomeNpc(e.target.value)} style={{ width: '100%', padding: '6px', fontSize: '0.85em', borderColor: '#00aaff', color: '#00aaff', margin: 0, boxSizing: 'border-box' }} />
                        )}
                    </div>

                    {!gravando ? <button className="btn-neon btn-green" onClick={iniciarGravacao} style={{ marginTop: 10, width: '100%' }}>▶ INICIAR ESCUTA</button> : <button className="btn-neon btn-red" onClick={pararGravacao} style={{ marginTop: 10, width: '100%', animation: 'pulse 1.5s infinite' }}>⏹ ENCERRAR</button>}
                    
                    <div style={{ background: '#000', marginTop: 10, borderRadius: '5px', padding: '8px', fontSize: '0.7em', color: '#0f0', fontFamily: 'monospace', height: '80px', overflowY: 'auto', border: '1px solid #222' }}>
                        {logs.map((l, i) => <div key={i}>{l}</div>)}
                    </div>
                </div>
            )}
            <div onClick={() => setExpandido(!expandido)} style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(10,10,15,0.9)', border: '2px solid #0088ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '24px', cursor: 'pointer', boxShadow: gravando ? '0 0 15px #ff003c' : 'none' }}>{gravando ? '🎙️' : '👁️'}</div>
        </div>
    );
}

export function MapaSessaoRP({ chatCtx, meuNome, minhaFicha, personagens, cenario, isPresenteNaTaverna, togglePresencaTaverna, getAvatarInfo, fmt }) {
    const playerCount = cenario?.tavernaAtivos?.length || 0;
    const cardSize = playerCount === 1 ? '400px' : playerCount === 2 ? '350px' : '280px';
    const [radioLigado, setRadioLigado] = useState(false);

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
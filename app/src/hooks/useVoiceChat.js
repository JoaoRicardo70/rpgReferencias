import { useState, useRef, useEffect, useCallback } from 'react';
import Peer from 'peerjs';
import { montarIceServers, temTurnConfigurado } from '../core/iceServers';

// Vigia o estado da conexão WebRTC de uma chamada: quando o ICE falha (normalmente NAT sem
// TURN), o jogador vê o motivo na tela em vez de um rádio "conectado" que não transmite áudio.
function vigiarConexao(call, nomeAmigo, setVoiceStatus, aindaNaTaverna) {
    const pc = call.peerConnection;
    if (!pc) return;
    const anterior = pc.oniceconnectionstatechange;
    pc.oniceconnectionstatechange = (ev) => {
        if (anterior) anterior.call(pc, ev);
        console.log(`[VOZ] ICE com ${nomeAmigo}: ${pc.iceConnectionState}`);
        if (!aindaNaTaverna()) return;
        if (pc.iceConnectionState === 'failed') {
            setVoiceStatus(temTurnConfigurado(import.meta.env)
                ? `⚠️ Falha de rede na ligação com ${nomeAmigo}`
                : `⚠️ Sem rota direta com ${nomeAmigo}: a rede de vocês precisa de um servidor TURN`);
        } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            setVoiceStatus('Online na Taverna!');
        }
    };
}

const BLACKLIST_MIC = ['mixagem', 'stereo mix', 'wave out', 'loopback', 'virtual', 'cable', 'voicemeeter', 'what u hear', 'monitor', 'wasapi'];

function encontrarMelhorMic(audioInputs) {
    for (let mic of audioInputs) {
        if (mic.label && !BLACKLIST_MIC.some(bw => mic.label.toLowerCase().includes(bw))) {
            return mic.deviceId;
        }
    }
    return audioInputs[0]?.deviceId || null;
}

const getAudioConstraints = (deviceId, supressor) => ({
    deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation: true,
    noiseSuppression: supressor,
    autoGainControl: true,
    googEchoCancellation: true,
    googExperimentalEchoCancellation: true,
    googNoiseSuppression: supressor,
    googExperimentalNoiseSuppression: supressor,
    googHighpassFilter: true,
    googTypingNoiseDetection: true,
    googAudioMirroring: false
});

export function useVoiceChat(meuNome, tavernaAtivos, isPresenteNaTaverna) {
    const [peerObj, setPeerObj] = useState(null);
    const [tentativaPeer, setTentativaPeer] = useState(0);
    const [meuStream, setMeuStream] = useState(null);
    const [streamAnalisador, setStreamAnalisador] = useState(null);
    const [conexoes, setConexoes] = useState([]);

    const [voiceStatus, setVoiceStatus] = useState('Fora da Taverna');
    
    const [mics, setMics] = useState([]);
    const [speakers, setSpeakers] = useState([]);
    const [selectedMic, setSelectedMic] = useState('');
    const [selectedSpeaker, setSelectedSpeaker] = useState('');

    const [mutado, setMutado] = useState(false);
    const [surdo, setSurdo] = useState(false);
    const [supressorAtivo, setSupressorAtivo] = useState(true);
    
    // 🔥 O SEGREDO DO NOISE GATE: Guarda a sensibilidade no navegador
    const [sensibilidadeVoz, setSensibilidadeVoz] = useState(() => parseInt(localStorage.getItem('rpg_sensibilidade_voz')) || 10);

    const meuStreamRef = useRef(null);
    const conexoesRef = useRef([]);
    const chamadasEmAndamento = useRef(new Set());
    const rtcLigado = useRef(false);
    const tentativasFalhasRef = useRef(0);
    const supressorAtivoRef = useRef(supressorAtivo);

    const meuIDTelefone = meuNome ? meuNome.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

    useEffect(() => { conexoesRef.current = conexoes; }, [conexoes]);
    useEffect(() => { supressorAtivoRef.current = supressorAtivo; }, [supressorAtivo]);
    useEffect(() => { localStorage.setItem('rpg_sensibilidade_voz', sensibilidadeVoz); }, [sensibilidadeVoz]);

    // 1. INICIALIZA A ANTENA PEERJS
    useEffect(() => {
        if (!meuIDTelefone || peerObj) return;

        const ICE_SERVERS = montarIceServers(import.meta.env);

        console.log(`[VOZ] A ligar à Central de Rádio com ID: anime-rpg-${meuIDTelefone}`);
        
        const novoPeer = new Peer(`anime-rpg-${meuIDTelefone}`, {
            config: { iceServers: ICE_SERVERS },
            debug: 2 
        });

        let retryTimeout;
        let peerAberto = false;

        novoPeer.on('open', (id) => {
            peerAberto = true;
            tentativasFalhasRef.current = 0;
            console.log(`[VOZ] Ligação estabelecida com sucesso! ID Central: ${id}`);
            setPeerObj(novoPeer);
        });

        novoPeer.on('call', (call) => {
            console.log(`[VOZ] A receber chamada de: ${call.peer}`);
            
            const attemptAnswer = (tentativas = 0) => {
                if (meuStreamRef.current) {
                    console.log(`[VOZ] A atender chamada de ${call.peer}...`);
                    call.answer(meuStreamRef.current);
                    vigiarConexao(call, call.peer.replace(/^anime-rpg-/, ''), setVoiceStatus, () => rtcLigado.current);

                    call.on('stream', (remoteStream) => {
                        setConexoes(prev => {
                            const exists = prev.find(c => c.id === call.peer);
                            if (exists && exists.stream && exists.stream.active) return prev;
                            return [...prev.filter(c => c.id !== call.peer), { id: call.peer, stream: remoteStream }];
                        });
                    });
                    
                    call.on('close', () => setConexoes(prev => prev.filter(c => c.id !== call.peer)));
                    call.on('error', (err) => console.error(`[VOZ] Erro na chamada de ${call.peer}:`, err));
                } else {
                    if (tentativas < 10) setTimeout(() => attemptAnswer(tentativas + 1), 500);
                }
            };
            attemptAnswer();
        });

        novoPeer.on('disconnected', () => { if (!novoPeer.destroyed) novoPeer.reconnect(); });
        novoPeer.on('error', (err) => {
            // peer-unavailable = o amigo ainda não abriu o rádio; o auto-dialer tenta de novo sozinho.
            if (err.type === 'peer-unavailable') return;
            setVoiceStatus(`Erro de Ligação: ${err.type}`);
            // Erros fatais (ex.: unavailable-id, quando o servidor ainda guarda o ID da sessão
            // anterior) deixavam o rádio morto para sempre. Recria a antena após uma pausa.
            // Só recria se o peer nunca chegou a abrir, ou se o ID está ocupado: depois de aberto,
            // quedas de sinalização são tratadas por 'disconnected' -> reconnect(), e destruir o peer
            // cortaria as chamadas de voz que seguem funcionando ponto a ponto.
            const fatal = err.type === 'unavailable-id'
                || (!peerAberto && ['network', 'server-error', 'socket-error', 'socket-closed'].includes(err.type));
            if (fatal) {
                setPeerObj(null);
                novoPeer.destroy();
                // Espera 4s, 8s, 16s... até 60s, para não martelar o servidor de sinalização.
                const espera = Math.min(60000, 4000 * 2 ** tentativasFalhasRef.current);
                tentativasFalhasRef.current += 1;
                retryTimeout = setTimeout(() => setTentativaPeer(t => t + 1), espera);
            }
        });

        return () => { clearTimeout(retryTimeout); novoPeer.destroy(); };
    }, [meuIDTelefone, tentativaPeer]);

    // 2. LIGAR MICROFONE
    useEffect(() => {
        if (isPresenteNaTaverna && !rtcLigado.current) {
            rtcLigado.current = true;
            setVoiceStatus('A ligar Equipamentos...');

            navigator.mediaDevices.getUserMedia({
                audio: getAudioConstraints(null, supressorAtivoRef.current)
            }).then(async (stream) => {
                meuStreamRef.current = stream;
                setMeuStream(stream);
                
                const track = stream.getAudioTracks()[0];
                if (track) {
                    const cloneTrack = track.clone();
                    setStreamAnalisador(new MediaStream([cloneTrack]));
                }
                
                setVoiceStatus('Online na Taverna!');

                const devices = await navigator.mediaDevices.enumerateDevices();
                const audioInputs = devices.filter(d => d.kind === 'audioinput');
                const audioOutputs = devices.filter(d => d.kind === 'audiooutput');
                
                setMics(audioInputs);
                setSpeakers(audioOutputs);

                const bestMicId = encontrarMelhorMic(audioInputs);
                if (bestMicId) setSelectedMic(bestMicId);
                if (audioOutputs.length > 0) setSelectedSpeaker(audioOutputs[0].deviceId);

            }).catch((err) => {
                setVoiceStatus('Microfone Bloqueado!');
                rtcLigado.current = false;
            });

        } else if (!isPresenteNaTaverna && rtcLigado.current) {
            rtcLigado.current = false;
            if (meuStreamRef.current) meuStreamRef.current.getTracks().forEach(t => t.stop());
            if (streamAnalisador) streamAnalisador.getTracks().forEach(t => t.stop());

            meuStreamRef.current = null;
            setMeuStream(null);
            setStreamAnalisador(null);
            setConexoes([]);
            setVoiceStatus('Fora da Taverna');
        }
    }, [isPresenteNaTaverna, supressorAtivo]);

    // 3. AUTO-DIALER (CHAMADAS ATIVAS)
    const fazerChamada = useCallback((nomeDestino) => {
        if (!peerObj || !meuStreamRef.current || !nomeDestino) return;
        const idFormatado = `anime-rpg-${(nomeDestino || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
        
        if (chamadasEmAndamento.current.has(idFormatado)) return;
        chamadasEmAndamento.current.add(idFormatado);

        const call = peerObj.call(idFormatado, meuStreamRef.current);
        if (!call) { chamadasEmAndamento.current.delete(idFormatado); return; }
        vigiarConexao(call, nomeDestino, setVoiceStatus, () => rtcLigado.current);

        call.on('stream', (remoteStream) => {
            setConexoes(prev => {
                const exists = prev.find(c => c.id === idFormatado);
                if (exists && exists.stream && exists.stream.active) return prev;
                return [...prev.filter(c => c.id !== idFormatado), { id: idFormatado, stream: remoteStream }];
            });
            chamadasEmAndamento.current.delete(idFormatado);
        });
        
        call.on('close', () => { setConexoes(prev => prev.filter(c => c.id !== idFormatado)); chamadasEmAndamento.current.delete(idFormatado); });
        call.on('error', () => { setConexoes(prev => prev.filter(c => c.id !== idFormatado)); chamadasEmAndamento.current.delete(idFormatado); });
    }, [peerObj]);

    useEffect(() => {
        if (!peerObj || !isPresenteNaTaverna) return;
        const interval = setInterval(() => {
            const ativosAmigos = Array.isArray(tavernaAtivos) ? tavernaAtivos : [];
            ativosAmigos.forEach(nomeAmigo => {
                if (!nomeAmigo || nomeAmigo === meuNome) return;
                const meuId = `anime-rpg-${(meuNome || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`;
                const amigoId = `anime-rpg-${(nomeAmigo || '').toLowerCase().replace(/[^a-z0-9]/g, '')}`;

                if (meuId < amigoId) {
                    const exists = conexoesRef.current.find(c => c.id === amigoId);
                    if (!exists && !chamadasEmAndamento.current.has(amigoId)) {
                        fazerChamada(nomeAmigo);
                    }
                }
            });
        }, 4000); 
        return () => clearInterval(interval);
    }, [tavernaAtivos, peerObj, isPresenteNaTaverna, meuNome, fazerChamada]);

    // 🔥 4. O PODEROSO NOISE GATE (SUPRESSOR DE RUÍDO) 🔥
    useEffect(() => {
        if (!streamAnalisador || !meuStreamRef.current) return;
        
        // Se o supressor for desligado pelo jogador, garante que o mic fica sempre aberto
        if (!supressorAtivo) {
            const track = meuStreamRef.current.getAudioTracks()[0];
            if (track && !mutado) track.enabled = true;
            return;
        }

        let actx;
        let raf;
        let releaseTimeout;

        try {
            actx = new (window.AudioContext || window.webkitAudioContext)();
            const source = actx.createMediaStreamSource(streamAnalisador);
            const analyser = actx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.3; // Resposta super rápida aos picos de voz
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const noiseGateProcess = () => {
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                const avg = sum / dataArray.length;

                const track = meuStreamRef.current.getAudioTracks()[0];
                if (track && !mutado) { // Respeita o botão de Mute manual
                    if (avg > sensibilidadeVoz) {
                        // FALANDO: Abre o microfone na hora!
                        track.enabled = true;
                        if (releaseTimeout) {
                            clearTimeout(releaseTimeout);
                            releaseTimeout = null;
                        }
                    } else {
                        // SILÊNCIO: Aguarda 500ms antes de cortar o áudio (Release Time) para não picotar o fim das palavras
                        if (!releaseTimeout && track.enabled) {
                            releaseTimeout = setTimeout(() => {
                                if (meuStreamRef.current && !mutado) {
                                    const t = meuStreamRef.current.getAudioTracks()[0];
                                    if (t) t.enabled = false; // Muta fisicamente a faixa!
                                }
                            }, 500); 
                        }
                    }
                }
                raf = requestAnimationFrame(noiseGateProcess);
            };
            noiseGateProcess();
        } catch (err) {
            console.warn("[VOZ] Erro no Noise Gate:", err);
        }

        return () => {
            if (raf) cancelAnimationFrame(raf);
            if (releaseTimeout) clearTimeout(releaseTimeout);
            if (actx && actx.state !== 'closed') actx.close().catch(()=>{});
        };
    }, [streamAnalisador, supressorAtivo, sensibilidadeVoz, mutado]);

    const trocarMicrofone = useCallback(async (deviceId) => {
        try {
            setSelectedMic(deviceId);
            const newStream = await navigator.mediaDevices.getUserMedia({
                audio: getAudioConstraints(deviceId, supressorAtivoRef.current)
            });

            if (peerObj) {
                Object.values(peerObj.connections).forEach(conns => {
                    conns.forEach(conn => {
                        if (conn.peerConnection) {
                            const sender = conn.peerConnection.getSenders().find(s => s.track && s.track.kind === 'audio');
                            if (sender) sender.replaceTrack(newStream.getAudioTracks()[0]);
                        }
                    });
                });
            }

            if (meuStreamRef.current) meuStreamRef.current.getTracks().forEach(t => t.stop());
            if (streamAnalisador) streamAnalisador.getTracks().forEach(t => t.stop());

            meuStreamRef.current = newStream;
            setMeuStream(newStream);
            
            const newTrack = newStream.getAudioTracks()[0];
            if (newTrack) {
                const newClone = newTrack.clone();
                setStreamAnalisador(new MediaStream([newClone]));
            }
        } catch (err) { console.error("Erro ao trocar mic:", err); }
    }, [peerObj, streamAnalisador]);

    const trocarSpeaker = useCallback((deviceId) => { setSelectedSpeaker(deviceId); }, []);

    const toggleMute = useCallback(() => {
        setMutado(prev => {
            const isMutedNow = !prev;
            if (meuStreamRef.current && meuStreamRef.current.getAudioTracks()[0]) {
                meuStreamRef.current.getAudioTracks()[0].enabled = !isMutedNow;
            }
            return isMutedNow;
        });
    }, []);

    const toggleDeafen = useCallback(() => setSurdo(s => !s), []);

    return {
        meuStream, streamAnalisador, conexoes, mutado, surdo, voiceStatus, 
        mics, selectedMic, trocarMicrofone, 
        speakers, selectedSpeaker, trocarSpeaker,
        supressorAtivo, toggleMute, toggleDeafen, setSupressorAtivo, fazerChamada,
        sensibilidadeVoz, setSensibilidadeVoz // 🔥 EXPORTAÇÃO DO NOISE GATE PARA A UI
    };
}
import { useState, useRef, useEffect, useCallback } from 'react';
import Peer from 'peerjs';
import { montarIceServers, temTurnConfigurado } from '../core/iceServers';
import { idDeVoz } from '../core/volumesVoz';
import { ESPERA_ATENDER_MS, avaliarSaudeDaChamada, deveDiscar, ligacoesSemDono } from '../core/saudeChamada';
import {
    FFT_SIZE, SENSIBILIDADE_PADRAO, criarPortaoDeVoz, estadoPortao, faixaDeVoz, medirNivelDeVoz
} from '../core/audioVoz';

// Nem todo navegador chega a reportar 'failed': sem nenhum par de candidatos que funcione (o caso
// clássico de NAT sem TURN) o Chrome às vezes trava em 'checking' e pula direto pra 'disconnected'
// -- e fica lá pra sempre, já que 'disconnected' também cobre quedas passageiras de uma ligação que
// já funcionou (por isso não pode ser tratado como falha na hora). Depois desse tempo sem conectar
// nenhuma vez, trata como falha mesmo assim: melhor avisar tarde do que nunca.
const TEMPO_LIMITE_ICE_MS = 12000;

// Vigia o estado da conexão WebRTC de uma chamada: quando o ICE falha (normalmente NAT sem
// TURN), o jogador vê o motivo na tela em vez de um rádio "conectado" que não transmite áudio.
// Além do aviso em `voiceStatus` (uma frase só, que a próxima chamada sobrescreve), guarda o estado
// de CADA conexão em `conexoes[].iceState`: é o que os cartões da Sala da Party usam pra não mostrar
// "🔊 conectado" enquanto o áudio de fato não chegou (o stream já existe assim que o SDP é trocado,
// bem antes do ICE confirmar que o áudio realmente passa pela rede). Devolve uma função pra cancelar
// o cronômetro de timeout quando a chamada fechar (ex.: o jogador saiu da call antes de dar tempo).
function vigiarConexao(call, nomeAmigo, peerId, setVoiceStatus, setConexoes, aindaNaTaverna) {
    const pc = call.peerConnection;
    if (!pc) return () => {};
    let conectouAlgumaVez = false;
    const atualizarIceState = (estado) => setConexoes(prev => prev.map(c => (c.id === peerId ? { ...c, iceState: estado } : c)));
    const avisarFalha = () => setVoiceStatus(temTurnConfigurado(import.meta.env)
        ? `⚠️ Falha de rede na ligação com ${nomeAmigo}`
        : `⚠️ Sem rota direta com ${nomeAmigo}: a rede de vocês precisa de um servidor TURN`);
    atualizarIceState(pc.iceConnectionState);
    const anterior = pc.oniceconnectionstatechange;
    pc.oniceconnectionstatechange = (ev) => {
        if (anterior) anterior.call(pc, ev);
        console.log(`[VOZ] ICE com ${nomeAmigo}: ${pc.iceConnectionState}`);
        atualizarIceState(pc.iceConnectionState);
        if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') conectouAlgumaVez = true;
        if (!aindaNaTaverna()) return;
        if (pc.iceConnectionState === 'failed') {
            avisarFalha();
        } else if (pc.iceConnectionState === 'connected' || pc.iceConnectionState === 'completed') {
            setVoiceStatus('Online na Taverna!');
        }
    };
    const timeoutId = setTimeout(() => {
        if (conectouAlgumaVez || !aindaNaTaverna()) return;
        console.log(`[VOZ] ICE com ${nomeAmigo}: sem sucesso após ${TEMPO_LIMITE_ICE_MS / 1000}s (preso em "${pc.iceConnectionState}") -- tratando como falha de rede`);
        atualizarIceState('failed');
        avisarFalha();
    }, TEMPO_LIMITE_ICE_MS);
    return () => clearTimeout(timeoutId);
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

// Com o filtro ligado o ganho automático fica DESLIGADO: ele amplifica o ruído baixo e deixa o microfone
// "sensível demais". O cancelamento de eco e o supressor do navegador continuam ativos.
const getAudioConstraints = (deviceId, supressor) => ({
    deviceId: deviceId ? { exact: deviceId } : undefined,
    echoCancellation: true,
    noiseSuppression: supressor,
    autoGainControl: !supressor,
    voiceIsolation: supressor,
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
    const [sensibilidadeVoz, setSensibilidadeVoz] = useState(() => parseInt(localStorage.getItem('rpg_sensibilidade_voz_v2')) || SENSIBILIDADE_PADRAO);

    const meuStreamRef = useRef(null);
    const conexoesRef = useRef([]);
    const chamadasEmAndamento = useRef(new Set());
    // Ligação ativa de cada amigo (id -> call): é por aqui que se derruba uma ligação morta ou antiga.
    const chamadasRef = useRef(new Map());
    const ruimDesdeRef = useRef(new Map());     // id -> quando a ligação passou a ficar ruim
    const semConexaoDesdeRef = useRef(new Map()); // id -> desde quando o amigo está na sala sem ligação nossa
    const rtcLigado = useRef(false);
    // Cada pedido de microfone ganha um número: um pedido antigo que só responde depois (saiu e
    // voltou da Taverna rápido, desmontou, StrictMode) é descartado em vez de deixar o mic aberto.
    const geracaoMicRef = useRef(0);
    const tentativasFalhasRef = useRef(0);
    const supressorAtivoRef = useRef(supressorAtivo);

    const meuIDTelefone = meuNome ? meuNome.toLowerCase().replace(/[^a-z0-9]/g, '') : '';

    useEffect(() => { conexoesRef.current = conexoes; }, [conexoes]);
    useEffect(() => { supressorAtivoRef.current = supressorAtivo; }, [supressorAtivo]);
    useEffect(() => { try { localStorage.setItem('rpg_sensibilidade_voz_v2', sensibilidadeVoz); } catch (e) { /* sem localStorage */ } }, [sensibilidadeVoz]);
    // O portão lê a sensibilidade por ref: arrastar o controle não recria o contexto de áudio.
    const sensibilidadeRef = useRef(sensibilidadeVoz);
    useEffect(() => { sensibilidadeRef.current = sensibilidadeVoz; }, [sensibilidadeVoz]);
    const mutadoRef = useRef(false);

    // Trocar o filtro vale já para o microfone aberto (antes só na próxima vez que ele fosse aberto).
    useEffect(() => {
        const trilha = meuStreamRef.current && meuStreamRef.current.getAudioTracks()[0];
        if (!trilha || typeof trilha.applyConstraints !== 'function') return;
        // applyConstraints substitui o conjunto inteiro: reenvia o cancelamento de eco junto.
        Promise.resolve(trilha.applyConstraints({ echoCancellation: true, noiseSuppression: supressorAtivo, autoGainControl: !supressorAtivo, voiceIsolation: supressorAtivo })).catch(() => {});
    }, [supressorAtivo]);

    // Derruba a ligação de um amigo (se ainda for a mesma) e limpa tudo dele, para o discador poder refazê-la.
    const derrubarChamada = useCallback((id, call) => {
        const atual = chamadasRef.current.get(id);
        if (call && atual && atual !== call) { try { call.close(); } catch (e) { /* já fechada */ } return; }
        const alvo = call || atual;
        chamadasRef.current.delete(id);
        chamadasEmAndamento.current.delete(id);
        ruimDesdeRef.current.delete(id);
        setConexoes(prev => (prev.some(c => c.id === id) ? prev.filter(c => c.id !== id) : prev));
        if (alvo) { try { alvo.close(); } catch (e) { /* já fechada */ } }
    }, []);

    // Liga os eventos de uma ligação (nossa ou recebida). Uma ligação NOVA do mesmo amigo substitui a antiga (ele saiu e voltou),
    // e uma que não recebe áudio a tempo é descartada: antes ela ficava pendente para sempre e bloqueava novas tentativas.
    const registrarChamada = useCallback((call, id, nome) => {
        const anterior = chamadasRef.current.get(id);
        chamadasRef.current.set(id, call);
        ruimDesdeRef.current.delete(id);
        if (anterior && anterior !== call) { try { anterior.close(); } catch (e) { /* já fechada */ } }
        let recebeuAudio = false;
        const pararVigiaIce = vigiarConexao(call, nome, id, setVoiceStatus, setConexoes, () => rtcLigado.current);
        const temporizador = setTimeout(() => { if (!recebeuAudio && chamadasRef.current.get(id) === call) derrubarChamada(id, call); }, ESPERA_ATENDER_MS);
        const encerrar = () => { clearTimeout(temporizador); pararVigiaIce(); derrubarChamada(id, call); };

        call.on('stream', (remoteStream) => {
            recebeuAudio = true;
            clearTimeout(temporizador);
            chamadasEmAndamento.current.delete(id);
            if (chamadasRef.current.get(id) !== call) return; // ligação antiga que já foi substituída
            const iceState = (call.peerConnection && call.peerConnection.iceConnectionState) || 'new';
            setConexoes(prev => {
                const existente = prev.find(c => c.id === id);
                if (existente && existente.stream === remoteStream) return prev;
                return [...prev.filter(c => c.id !== id), { id, stream: remoteStream, iceState }];
            });
        });
        call.on('close', encerrar);
        call.on('error', (err) => { console.error(`[VOZ] Erro na chamada de ${id}:`, err); encerrar(); });
    }, [derrubarChamada]);

    // 1. INICIALIZA A ANTENA PEERJS
    useEffect(() => {
        // Sem checar o peer anterior: ao trocar de personagem o ID muda, e o efeito TEM que criar a antena nova
        // (o estado ainda guardava a antena antiga, já destruída, e a chamada nunca era refeita).
        if (!meuIDTelefone) return;

        const ICE_SERVERS = montarIceServers(import.meta.env);

        console.log(`[VOZ] A ligar à Central de Rádio com ID: anime-rpg-${meuIDTelefone}`);
        
        const novoPeer = new Peer(`anime-rpg-${meuIDTelefone}`, {
            config: { iceServers: ICE_SERVERS },
            debug: 2 
        });

        let retryTimeout;
        let peerAberto = false;
        let cancelado = false;

        novoPeer.on('open', (id) => {
            if (cancelado) return;
            peerAberto = true;
            tentativasFalhasRef.current = 0;
            console.log(`[VOZ] Ligação estabelecida com sucesso! ID Central: ${id}`);
            setPeerObj(novoPeer);
        });

        novoPeer.on('call', (call) => {
            console.log(`[VOZ] A receber chamada de: ${call.peer}`);
            // Marca já aqui (antes até de atender) pra "FORÇAR LIGAÇÃO"/o auto-dialer não discarem
            // por cima enquanto essa chamada recebida ainda está sendo negociada: com as duas pontas
            // ligando ao mesmo tempo, o app cria DUAS conexões WebRTC pro mesmo amigo, e qual delas
            // "vence" (e carrega o áudio de verdade) vira sorte -- é assim que um lado passa a ouvir
            // "conectado" só silêncio enquanto o outro lado escuta normalmente.
            chamadasEmAndamento.current.add(call.peer);

            const attemptAnswer = (tentativas = 0) => {
                if (meuStreamRef.current) {
                    console.log(`[VOZ] A atender chamada de ${call.peer}...`);
                    call.answer(meuStreamRef.current);
                    registrarChamada(call, call.peer, call.peer.replace(/^anime-rpg-/, ''));
                } else {
                    if (tentativas < 10) setTimeout(() => attemptAnswer(tentativas + 1), 500);
                    else { chamadasEmAndamento.current.delete(call.peer); try { call.close(); } catch (e) { /* já fechada */ } }
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

        return () => {
            cancelado = true;
            clearTimeout(retryTimeout);
            novoPeer.destroy();
            // A antena antiga morreu: nada de reaproveitar a chamada ou o peer dela com o ID novo.
            setPeerObj(null);
            setConexoes([]);
            chamadasEmAndamento.current.clear();
            chamadasRef.current.clear();
            ruimDesdeRef.current.clear();
            semConexaoDesdeRef.current.clear();
        };
    }, [meuIDTelefone, tentativaPeer]);

    // 2. LIGAR MICROFONE
    useEffect(() => {
        if (isPresenteNaTaverna && !rtcLigado.current) {
            if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
                setVoiceStatus('Microfone indisponível neste navegador');
                return;
            }
            rtcLigado.current = true;
            setVoiceStatus('A ligar Equipamentos...');
            const geracao = ++geracaoMicRef.current;

            navigator.mediaDevices.getUserMedia({
                audio: getAudioConstraints(null, supressorAtivoRef.current)
            }).then(async (stream) => {
                if (geracao !== geracaoMicRef.current || !rtcLigado.current) { stream.getTracks().forEach(t => t.stop()); return; }
                meuStreamRef.current = stream;
                setMeuStream(stream);
                
                const track = stream.getAudioTracks()[0];
                if (track) {
                    // O clone (portão de ruído) nasce antes de mutar: um clone mudo deixaria o portão
                    // em silêncio pra sempre depois de desmutar.
                    const cloneTrack = track.clone();
                    // Entrou mutado: o microfone novo também começa mudo.
                    if (mutadoRef.current) track.enabled = false;
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
                if (geracao !== geracaoMicRef.current) return;
                setVoiceStatus('Microfone Bloqueado!');
                rtcLigado.current = false;
            });

        } else if (!isPresenteNaTaverna && rtcLigado.current) {
            rtcLigado.current = false;
            geracaoMicRef.current += 1;
            if (meuStreamRef.current) meuStreamRef.current.getTracks().forEach(t => t.stop());
            if (streamAnalisador) streamAnalisador.getTracks().forEach(t => t.stop());

            meuStreamRef.current = null;
            setMeuStream(null);
            setStreamAnalisador(null);
            // Fecha as ligações: sem isso os amigos continuavam com uma ligação morta comigo e não refaziam quando eu voltava.
            Array.from(chamadasRef.current.values()).forEach(c => { try { c.close(); } catch (e) { /* já fechada */ } });
            chamadasRef.current.clear();
            chamadasEmAndamento.current.clear();
            ruimDesdeRef.current.clear();
            semConexaoDesdeRef.current.clear();
            setConexoes([]);
            setVoiceStatus('Fora da Taverna');
        }
    }, [isPresenteNaTaverna, supressorAtivo]);

    // Ao sair da mesa o provedor de voz é desmontado: sem isto o microfone continuava gravando
    // (indicador do navegador aceso) até recarregar a página.
    const streamAnalisadorRef = useRef(null);
    streamAnalisadorRef.current = streamAnalisador;
    useEffect(() => () => {
        rtcLigado.current = false;
        geracaoMicRef.current += 1;
        if (meuStreamRef.current) meuStreamRef.current.getTracks().forEach(t => t.stop());
        if (streamAnalisadorRef.current) streamAnalisadorRef.current.getTracks().forEach(t => t.stop());
        meuStreamRef.current = null;
    }, []);

    // 3. AUTO-DIALER (CHAMADAS ATIVAS)
    const fazerChamada = useCallback((nomeDestino) => {
        if (!peerObj || !meuStreamRef.current || !nomeDestino) return;
        const idFormatado = idDeVoz(nomeDestino);
        
        // Bloqueia tanto uma chamada já em andamento (nossa ou recebida dele, ver novoPeer.on('call'))
        // quanto um amigo já conectado: sem isso, "FORÇAR LIGAÇÃO" clicado enquanto a ligação dele já
        // está chegando cria uma segunda conexão pro mesmo amigo, e só uma das duas acaba carregando
        // áudio de verdade -- o outro lado "conecta" mas fica em silêncio.
        if (chamadasEmAndamento.current.has(idFormatado) || conexoesRef.current.some(c => c.id === idFormatado)) return;
        chamadasEmAndamento.current.add(idFormatado);

        const call = peerObj.call(idFormatado, meuStreamRef.current);
        if (!call) { chamadasEmAndamento.current.delete(idFormatado); return; }
        registrarChamada(call, idFormatado, nomeDestino);
    }, [peerObj, registrarChamada]);

    useEffect(() => {
        if (!peerObj || !isPresenteNaTaverna) return;
        const interval = setInterval(() => {
            const agora = Date.now();
            const ativosAmigos = Array.isArray(tavernaAtivos) ? tavernaAtivos : [];
            const meuId = idDeVoz(meuNome);
            const idsNaSala = ativosAmigos.map(idDeVoz);

            // 1) Ligações de quem já saiu da sala (ou ficou morta) são derrubadas: o amigo que volta entra com ligação nova.
            ligacoesSemDono(Array.from(chamadasRef.current.keys()), idsNaSala, meuId).forEach(id => derrubarChamada(id));
            chamadasRef.current.forEach((call, id) => {
                const pc = call.peerConnection;
                const conexao = conexoesRef.current.find(c => c.id === id);
                const trilhas = conexao && conexao.stream && typeof conexao.stream.getAudioTracks === 'function' ? conexao.stream.getAudioTracks() : [];
                const estadoIce = pc ? pc.iceConnectionState : undefined;
                const ruim = estadoIce === 'disconnected';
                if (ruim && !ruimDesdeRef.current.has(id)) ruimDesdeRef.current.set(id, agora);
                if (!ruim) ruimDesdeRef.current.delete(id);
                const veredito = avaliarSaudeDaChamada({
                    estadoIce,
                    todasTrilhasEncerradas: trilhas.length > 0 && trilhas.every(t => t.readyState === 'ended'),
                    ruimHaMs: ruimDesdeRef.current.has(id) ? agora - ruimDesdeRef.current.get(id) : 0
                });
                if (veredito === 'refazer') { console.log(`[VOZ] Refazendo a ligação com ${id} (estado ${estadoIce})`); derrubarChamada(id, call); }
            });

            Array.from(semConexaoDesdeRef.current.keys()).forEach(id => { if (!idsNaSala.includes(id)) semConexaoDesdeRef.current.delete(id); });

            // 2) Quem não tem ligação com um amigo na sala liga (o lado "menor" na hora; o outro só depois de um tempo sem resposta).
            ativosAmigos.forEach(nomeAmigo => {
                if (!nomeAmigo || nomeAmigo === meuNome) return;
                const amigoId = idDeVoz(nomeAmigo);
                const conectado = conexoesRef.current.some(c => c.id === amigoId);
                if (conectado) { semConexaoDesdeRef.current.delete(amigoId); return; }
                if (!semConexaoDesdeRef.current.has(amigoId)) semConexaoDesdeRef.current.set(amigoId, agora);
                if (chamadasEmAndamento.current.has(amigoId)) return;
                if (deveDiscar({ meuId, amigoId, semConexaoHaMs: agora - semConexaoDesdeRef.current.get(amigoId) })) fazerChamada(nomeAmigo);
            });
        }, 4000); 
        return () => clearInterval(interval);
    }, [tavernaAtivos, peerObj, isPresenteNaTaverna, meuNome, fazerChamada, derrubarChamada]);

    // 4. PORTÃO DE RUÍDO: abre o microfone só quando a FAIXA DA VOZ passa do piso de ruído da sala mais
    // uma margem (com histerese e tempo de espera), em vez de comparar a média de todas as frequências
    // com um limiar fixo baixo. Regras e números em core/audioVoz.js.
    // Atualizado no próprio render (não em efeito): o laço do portão nunca vê o mute com um quadro de atraso.
    mutadoRef.current = mutado;
    useEffect(() => {
        if (!streamAnalisador || !meuStreamRef.current) return;

        // Se o supressor for desligado pelo jogador, garante que o mic fica sempre aberto
        if (!supressorAtivo) {
            estadoPortao.ativo = false;
            const track = meuStreamRef.current.getAudioTracks()[0];
            if (track && !mutadoRef.current) track.enabled = true;
            return;
        }

        let actx;
        let raf;

        try {
            actx = new (window.AudioContext || window.webkitAudioContext)();
            const source = actx.createMediaStreamSource(streamAnalisador);
            const analyser = actx.createAnalyser();
            analyser.fftSize = FFT_SIZE;
            // Pouca suavização: com 0.3 o pico de um clique se espalhava por dois quadros e abria o portão.
            analyser.smoothingTimeConstant = 0.1;
            source.connect(analyser);

            const faixa = faixaDeVoz(actx.sampleRate, FFT_SIZE);
            const dados = new Uint8Array(analyser.frequencyBinCount);
            const portao = criarPortaoDeVoz();
            estadoPortao.ativo = true;

            const processar = () => {
                analyser.getByteFrequencyData(dados);
                const nivel = medirNivelDeVoz(dados, faixa);
                const r = portao.processar(nivel, sensibilidadeRef.current, performance.now());
                // Mutado não "fala": o brilho do cartão e a barra do calibrador não podem acender.
                estadoPortao.aberto = r.aberto && !mutadoRef.current;
                estadoPortao.piso = r.piso;
                estadoPortao.limiar = r.limiarAbrir;

                const track = meuStreamRef.current && meuStreamRef.current.getAudioTracks()[0];
                // Respeita o botão de Mute manual
                if (track && !mutadoRef.current && track.enabled !== r.aberto) track.enabled = r.aberto;
                raf = requestAnimationFrame(processar);
            };
            processar();
        } catch (err) {
            console.warn("[VOZ] Erro no Noise Gate:", err);
        }

        return () => {
            estadoPortao.ativo = false;
            estadoPortao.aberto = false;
            if (raf) cancelAnimationFrame(raf);
            if (actx && actx.state !== 'closed') actx.close().catch(()=>{});
        };
    }, [streamAnalisador, supressorAtivo]);

    const trocarMicrofone = useCallback(async (deviceId) => {
        try {
            setSelectedMic(deviceId);
            const newStream = await navigator.mediaDevices.getUserMedia({
                audio: getAudioConstraints(deviceId, supressorAtivoRef.current)
            });

            // Saiu da Taverna enquanto o navegador abria o microfone novo: descarta.
            if (!rtcLigado.current) { newStream.getTracks().forEach(t => t.stop()); return; }

            // Estando mutado, a trilha enviada nasce muda (antes o jogador voltava a ser ouvido). O
            // clone do portão de ruído é tirado ANTES de mutar, pra ele não nascer mudo também.
            const trilhaNova = newStream.getAudioTracks()[0];
            const cloneParaPortao = trilhaNova ? trilhaNova.clone() : null;
            if (mutadoRef.current && trilhaNova) trilhaNova.enabled = false;

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
            
            if (cloneParaPortao) setStreamAnalisador(new MediaStream([cloneParaPortao]));
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
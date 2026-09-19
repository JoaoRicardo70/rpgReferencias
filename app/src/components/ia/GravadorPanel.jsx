import React, { useState, useRef, useEffect, useContext } from 'react';
import useStore from '../../stores/useStore';
import { VoiceContext } from '../../hooks/VoiceContext';
import { haCapturaEmAndamento, registrarCapturaAtiva } from '../../core/estadoBuffer';
import {
    OPCOES_DURACAO_CLIPE, extrairCabecalhoWebm, montarClipe, nomeArquivoClipe, podarChunks
} from '../../core/clipes';

function sanitizarNomeArquivo(nome) {
    return (nome || 'Anonimo').replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function pararTracks(stream) {
    if (stream) stream.getTracks().forEach(track => track.stop());
}

function baixarBlob(blob, nomeArquivo) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeArquivo;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

const PREF_BUFFER_AUTO = 'rpg_clipe_buffer_auto';
const PREF_DURACAO_CLIPE = 'rpg_clipe_duracao';

function lerPreferencia(chave, padrao) {
    try {
        const v = localStorage.getItem(chave);
        return v === null ? padrao : v;
    } catch (e) { return padrao; }
}

function gravarPreferencia(chave, valor) {
    try { localStorage.setItem(chave, String(valor)); } catch (e) { /* sem storage: só não lembra */ }
}

function estaNoAppDesktop() {
    return typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent || '');
}

export default function GravadorPanel() {
    const [gravando, setGravando] = useState(false);
    const [guardarTudo, setGuardarTudo] = useState(false);
    const [duracaoClipe, setDuracaoClipe] = useState(() => {
        const salva = Number(lerPreferencia(PREF_DURACAO_CLIPE, '60'));
        return OPCOES_DURACAO_CLIPE.some(o => o.segundos === salva) ? salva : 60;
    });
    // Buffer de clipes ligado sozinho ao abrir o app desktop (lembra a última escolha do usuário).
    const [bufferAuto, setBufferAuto] = useState(() => lerPreferencia(PREF_BUFFER_AUTO, '0') === '1');
    const [logs, setLogs] = useState(['Gravador local pronto.']);

    // Pedaços recentes da gravação ({ blob, t }) e o cabeçalho do webm: base do "clipe".
    const chunksRef = useRef([]);
    const cabecalhoRef = useRef(null);
    const tipoRef = useRef('video/webm');
    const guardarTudoRef = useRef(false);
    const salvandoClipeRef = useRef(false);
    const salvarClipeRef = useRef(() => {});
    const iniciarCapturaRef = useRef(() => {});
    // Gravação da sessão iniciada com o buffer de clipes já ligado: usa um segundo gravador
    // (arquivo próprio, com linha do tempo própria) e o buffer continua rodando.
    const sessaoExtraRef = useRef(null);
    const streamFinalRef = useRef(null);
    const opcoesRef = useRef(null);

    const micProprioRef = useRef(null);
    const telaStreamRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const logsEndRef = useRef(null);

    // Mixagem: todas as vozes (meu mic + jogadores da Sala de Rádio) caem num único destino.
    const mixCtxRef = useRef(null);
    const destinoRef = useRef(null);
    const fontesRef = useRef(new Map());
    // Elementos <audio> mudos ligados às vozes remotas: o Chromium entrega silêncio ao
    // WebAudio quando um stream WebRTC remoto não está anexado a nenhum elemento de mídia.
    const ancorasRef = useRef(new Map());
    const falhasRef = useRef(new Set());
    const iniciandoRef = useRef(false);
    const ativoRef = useRef(true);

    const audioContextRef = useRef(null);
    const animationFrameRef = useRef(null);
    const volumeBarRef = useRef(null);

    const meuNome = useStore(s => s.meuNome);
    const voz = useContext(VoiceContext);

    const addLog = (msg) => {
        const hora = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, `[${hora}] ${msg}`]);
    };

    useEffect(() => {
        if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    // A gravação inteira só existe na memória até o clique em "Encerrar e Baixar" — não há
    // salvamento incremental na nuvem. Avisa antes de fechar/recarregar a aba para não
    // perder a sessão toda sem querer. Só vale para a gravação da sessão: o buffer de clipes é
    // descartável por natureza e (ligado sozinho) nunca pode impedir o app de fechar.
    useEffect(() => {
        const avisarAntesDeSair = (e) => {
            if (!guardarTudo) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', avisarAntesDeSair);
        return () => window.removeEventListener('beforeunload', avisarAntesDeSair);
    }, [guardarTudo]);

    // Avisa o resto do app (indicador no botão flutuante) que há captura de tela/voz em andamento.
    useEffect(() => {
        if (!gravando) return undefined;
        return registrarCapturaAtiva();
    }, [gravando]);

    // Libera tudo que o gravador abriu (tela, mic próprio, mixagem). Nunca encerra o
    // stream do microfone da Sala de Rádio (voz.meuStream): ele pertence ao useVoiceChat.
    const liberarRecursos = () => {
        pararTracks(telaStreamRef.current);
        telaStreamRef.current = null;
        pararTracks(micProprioRef.current);
        micProprioRef.current = null;
        fontesRef.current.forEach(fonte => { try { fonte.disconnect(); } catch (e) { /* já desconectada */ } });
        fontesRef.current.clear();
        ancorasRef.current.forEach(audio => { audio.pause(); audio.srcObject = null; });
        ancorasRef.current.clear();
        falhasRef.current.clear();
        if (mixCtxRef.current && mixCtxRef.current.state !== 'closed') {
            const fechando = mixCtxRef.current.close();
            if (fechando && fechando.catch) fechando.catch(() => {});
        }
        mixCtxRef.current = null;
        destinoRef.current = null;
    };

    useEffect(() => {
        ativoRef.current = true;
        return () => {
            ativoRef.current = false;
            if (sessaoExtraRef.current) {
                sessaoExtraRef.current.onstop = null;
                if (sessaoExtraRef.current.state === 'recording') sessaoExtraRef.current.stop();
                sessaoExtraRef.current = null;
            }
            if (mediaRecorderRef.current) mediaRecorderRef.current.onstop = null;
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop();
            liberarRecursos();
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            if (audioContextRef.current) audioContextRef.current.close();
        };
    }, []);

    // Mantém a mixagem em dia com a Sala de Rádio: quem entra na call durante a gravação
    // passa a ser gravado; quem sai deixa de ser ligado à mixagem.
    const sincronizarVozes = () => {
        const ctx = mixCtxRef.current;
        const destino = destinoRef.current;
        if (!ctx || !destino) return;

        const desejadas = new Map();
        const local = (voz && voz.meuStream) || micProprioRef.current;
        if (local) desejadas.set(`local:${local.id}`, { stream: local, rotulo: 'seu microfone' });
        ((voz && voz.conexoes) || []).forEach(c => {
            if (c.stream) desejadas.set(`${c.id}:${c.stream.id}`, { stream: c.stream, rotulo: c.id.replace(/^anime-rpg-/, '') });
        });

        fontesRef.current.forEach((fonte, chave) => {
            if (desejadas.has(chave)) return;
            try { fonte.disconnect(); } catch (e) { /* já desconectada */ }
            fontesRef.current.delete(chave);
            const ancora = ancorasRef.current.get(chave);
            if (ancora) { ancora.pause(); ancora.srcObject = null; ancorasRef.current.delete(chave); }
        });

        desejadas.forEach(({ stream, rotulo }, chave) => {
            if (fontesRef.current.has(chave) || falhasRef.current.has(chave) || stream.getAudioTracks().length === 0) return;
            try {
                if (chave.startsWith('anime-rpg-')) {
                    const ancora = new Audio();
                    ancora.muted = true;
                    ancora.srcObject = stream;
                    const tocando = ancora.play();
                    if (tocando && tocando.catch) tocando.catch(() => {});
                    ancorasRef.current.set(chave, ancora);
                }
                const fonte = ctx.createMediaStreamSource(stream);
                fonte.connect(destino);
                fontesRef.current.set(chave, fonte);
                addLog(`🔊 Captando voz: ${rotulo}`);
            } catch (err) {
                // Marca como falha para não tentar (e logar) de novo a cada sincronização.
                falhasRef.current.add(chave);
                const ancora = ancorasRef.current.get(chave);
                if (ancora) { ancora.pause(); ancora.srcObject = null; ancorasRef.current.delete(chave); }
                addLog(`⚠️ Não foi possível captar ${rotulo}: ${err.message}`);
            }
        });
    };

    useEffect(() => {
        if (gravando) sincronizarVozes();
    }, [gravando, voz && voz.meuStream, voz && voz.conexoes]);

    const iniciarVisualizador = (stream) => {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;

        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        audioContextRef.current = audioCtx;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);

        const desenharVolume = () => {
            analyser.getByteFrequencyData(dataArray);
            let soma = 0;
            for (let i = 0; i < bufferLength; i++) {
                soma += dataArray[i];
            }
            const media = soma / bufferLength;

            const volumePct = Math.min(100, Math.max(0, (media / 80) * 100));

            if (volumeBarRef.current) {
                volumeBarRef.current.style.width = `${volumePct}%`;

                if (volumePct > 85) {
                    volumeBarRef.current.style.backgroundColor = '#ff003c';
                    volumeBarRef.current.style.boxShadow = '0 0 15px #ff003c';
                } else if (volumePct > 50) {
                    volumeBarRef.current.style.backgroundColor = '#ffcc00';
                    volumeBarRef.current.style.boxShadow = '0 0 10px #ffcc00';
                } else {
                    volumeBarRef.current.style.backgroundColor = '#00ffcc';
                    volumeBarRef.current.style.boxShadow = '0 0 10px #00ffcc';
                }
            }

            animationFrameRef.current = requestAnimationFrame(desenharVolume);
        };
        desenharVolume();
    };

    const pararVisualizador = () => {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        if (volumeBarRef.current) {
            volumeBarRef.current.style.width = '0%';
            volumeBarRef.current.style.backgroundColor = '#333';
            volumeBarRef.current.style.boxShadow = 'none';
        }
    };

    // Salva o arquivo só no computador de quem gravou: cria um link de download temporário
    // e clica nele sozinho — nada é enviado para fora do navegador.
    const baixarGravacao = (blob) => {
        const carimbo = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const nomeArquivo = `gravacao_${sanitizarNomeArquivo(meuNome)}_${carimbo}.webm`;
        baixarBlob(blob, nomeArquivo);
        return nomeArquivo;
    };

    // Salva os últimos `duracaoClipe` segundos do que está sendo gravado (buffer contínuo).
    const salvarClipe = async () => {
        if (salvandoClipeRef.current || !mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return;
        salvandoClipeRef.current = true;
        try {
            // Pede o pedaço parcial mais recente para o clipe incluir até o último instante.
            const gravador = mediaRecorderRef.current;
            if (typeof gravador.requestData === 'function') {
                gravador.requestData();
                await new Promise(resolve => setTimeout(resolve, 150));
                if (gravador.state !== 'recording') { addLog('⚠️ A gravação foi encerrada antes de salvar o clipe.'); return; }
            }
            const clipe = await montarClipe(chunksRef.current, cabecalhoRef.current, duracaoClipe, Date.now(), tipoRef.current);
            if (!clipe) { addLog('⚠️ Ainda não há imagem suficiente no buffer para um clipe. Tente de novo em alguns segundos.'); return; }
            const nomeArquivo = nomeArquivoClipe(meuNome, duracaoClipe);
            baixarBlob(clipe.blob, nomeArquivo);
            addLog(`✂️ Clipe de ~${clipe.segundosReais}s salvo no seu computador como "${nomeArquivo}".`);
            if (clipe.semCabecalho) addLog('⚠️ Não foi possível ler o cabeçalho do vídeo: o clipe pode não abrir em todos os players.');
        } catch (err) {
            addLog(`❌ Erro ao salvar o clipe: ${err.message}`);
        } finally {
            salvandoClipeRef.current = false;
        }
    };
    salvarClipeRef.current = salvarClipe;

    // Atalho Alt+C: salva o clipe de qualquer aba do app (o gravador continua montado em segundo plano).
    useEffect(() => {
        const aoTeclar = (e) => {
            if (e.repeat || !e.altKey || e.ctrlKey || e.metaKey || (e.key !== 'c' && e.key !== 'C')) return;
            // Só "engole" o atalho quando há algo sendo gravado.
            if (!mediaRecorderRef.current || mediaRecorderRef.current.state !== 'recording') return;
            e.preventDefault();
            salvarClipeRef.current();
        };
        window.addEventListener('keydown', aoTeclar);
        return () => window.removeEventListener('keydown', aoTeclar);
    }, []);

    // Guarda o pedaço e, no modo clipe (sem gravar a sessão inteira), descarta o que passou da retenção.
    const registrarChunk = (blob) => {
        chunksRef.current.push({ blob, t: Date.now() });
        if (!cabecalhoRef.current && chunksRef.current.length <= 3) {
            const iniciais = chunksRef.current.map(c => c.blob);
            Promise.resolve()
                .then(() => extrairCabecalhoWebm(iniciais))
                .then(cab => { if (cab && !cabecalhoRef.current) cabecalhoRef.current = cab; })
                .catch(() => { /* sem cabeçalho: o clipe cai para o trecho cru */ });
        }
        if (!guardarTudoRef.current && (cabecalhoRef.current || chunksRef.current.length > 3)) {
            chunksRef.current = podarChunks(chunksRef.current, Date.now());
        }
    };

    // Começa a gravar a sessão inteira num arquivo próprio enquanto o buffer de clipes segue ligado.
    const iniciarSessaoExtra = () => {
        const stream = streamFinalRef.current;
        if (!stream || sessaoExtraRef.current) return;
        try {
            const partes = [];
            const tipo = tipoRef.current;
            const gravador = new MediaRecorder(stream, opcoesRef.current);
            gravador.ondataavailable = (event) => { if (event.data.size > 0) partes.push(event.data); };
            gravador.onstop = () => {
                if (partes.length === 0) { addLog('⚠️ Nada foi capturado.'); return; }
                const nomeArquivo = baixarGravacao(new Blob(partes, { type: tipo }));
                addLog(`💾 Gravação salva no seu computador como "${nomeArquivo}".`);
            };
            gravador.start(1000);
            sessaoExtraRef.current = gravador;
            setGuardarTudo(true);
            addLog('🎬 Gravação da sessão iniciada. O buffer de clipes continua ligado.');
        } catch (err) {
            sessaoExtraRef.current = null;
            addLog(`❌ Erro ao iniciar a gravação da sessão: ${err.message}`);
        }
    };

    // `silencioso`: início automático (sem clique do usuário) — não abre o microfone por conta própria.
    const iniciarCaptura = async (gravarSessaoInteira, { silencioso = false } = {}) => {
        // Buffer já ligado: "Iniciar gravação" só acrescenta a gravação da sessão.
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
            if (gravarSessaoInteira && !guardarTudoRef.current) iniciarSessaoExtra();
            return;
        }
        // O seletor de tela demora: um segundo clique nesse intervalo abriria uma segunda gravação.
        if (iniciandoRef.current) return;
        iniciandoRef.current = true;
        try {
            // Criado já no clique (antes dos awaits) para o navegador não deixar a mixagem suspensa.
            const mixCtx = new (window.AudioContext || window.webkitAudioContext)();
            if (mixCtx.resume) mixCtx.resume();
            mixCtxRef.current = mixCtx;
            destinoRef.current = mixCtx.createMediaStreamDestination();

            // 1. Tela: só a aba do próprio app (Chrome/Edge). Sem áudio de sistema, para não
            // duplicar as vozes que já entram pela mixagem.
            let telaStream = null;
            if (navigator.mediaDevices.getDisplayMedia) {
                try {
                    telaStream = await navigator.mediaDevices.getDisplayMedia({
                        video: { frameRate: 15 },
                        audio: false,
                        preferCurrentTab: true,
                        selfBrowserSurface: 'include',
                    });
                    const superficie = telaStream.getVideoTracks()[0]?.getSettings?.().displaySurface;
                    if (superficie && superficie !== 'browser') addLog('⚠️ Você compartilhou a tela/janela inteira. Para gravar só o app, escolha a aba do sistema.');
                } catch (err) {
                    // No app desktop antigo (sem o handler de captura) o pedido é recusado sempre.
                    addLog(estaNoAppDesktop()
                        ? '⚠️ O app desktop instalado é uma versão antiga e não consegue capturar a tela — instale o instalador mais recente. Gravando somente o áudio.'
                        : '⚠️ Captura de tela não autorizada — gravando somente o áudio.');
                }
            } else {
                addLog('⚠️ Este navegador não permite capturar a tela — gravando somente o áudio.');
            }
            telaStreamRef.current = telaStream;

            // 2. Voz: se você não está na Sala de Rádio, abre o microfone por conta própria.
            if (!(voz && voz.meuStream) && !silencioso) {
                micProprioRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            // Se o painel foi desmontado enquanto os pedidos de permissão estavam abertos, desiste.
            if (!ativoRef.current) { liberarRecursos(); return; }
            sincronizarVozes();
            if (voz && voz.meuStream) addLog(`🎧 Sala de Rádio: ${(voz.conexoes || []).length} jogador(es) conectado(s) serão gravados.`);
            else if (!silencioso) addLog('ℹ️ Você não está na Sala de Rádio: gravando só o seu microfone.');

            const audioMixado = destinoRef.current.stream;
            iniciarVisualizador(audioMixado);

            const webmVideoOk = typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported('video/webm');
            if (telaStream && !webmVideoOk) {
                pararTracks(telaStream);
                telaStreamRef.current = null;
                addLog('⚠️ Este navegador não grava vídeo webm — gravando somente o áudio.');
            }
            const gravaVideo = telaStream && webmVideoOk;
            const trilhas = [...(gravaVideo ? telaStream.getVideoTracks() : []), ...audioMixado.getAudioTracks()];
            const streamFinal = new MediaStream(trilhas);
            // Quadro-chave a cada 2s (Chromium recente; ignorado onde não existe): é onde um clipe pode
            // começar, então quanto mais frequente, mais perto do tempo pedido o clipe fica.
            const opcoes = gravaVideo
                ? { mimeType: 'video/webm', videoBitsPerSecond: 1500000, audioBitsPerSecond: 64000, videoKeyFrameIntervalDuration: 2000 }
                : { mimeType: 'audio/webm', audioBitsPerSecond: 32000 };

            chunksRef.current = [];
            cabecalhoRef.current = null;
            guardarTudoRef.current = gravarSessaoInteira;
            tipoRef.current = opcoes.mimeType;
            streamFinalRef.current = streamFinal;
            opcoesRef.current = opcoes;
            const recorder = new MediaRecorder(streamFinal, opcoes);
            const tipo = opcoes.mimeType;

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) registrarChunk(event.data);
            };

            recorder.onstop = () => {
                const chunks = chunksRef.current;
                chunksRef.current = [];
                cabecalhoRef.current = null;
                // No modo clipe o buffer é só para clipes: não há sessão inteira para baixar.
                if (!guardarTudoRef.current) return;
                if (chunks.length === 0) { addLog('⚠️ Nada foi capturado.'); return; }
                const blob = new Blob(chunks.map(c => c.blob), { type: tipo });
                const nomeArquivo = baixarGravacao(blob);
                addLog(`💾 Gravação salva no seu computador como "${nomeArquivo}".`);
            };

            // Se o usuário clicar em "Parar compartilhamento" do navegador, encerra e baixa.
            if (gravaVideo) telaStream.getVideoTracks()[0].onended = () => pararGravacao();

            // Pedaços de 1s: o clipe é montado a partir deles (a sessão inteira segue igual).
            recorder.start(1000);
            mediaRecorderRef.current = recorder;

            setGuardarTudo(gravarSessaoInteira);
            setGravando(true);
            const destino = gravaVideo ? 'tela do app + vozes' : 'somente áudio';
            addLog(gravarSessaoInteira
                ? `🎬 Gravando ${destino}. Tudo fica só neste computador — nada vai para a nuvem.`
                : `🎞️ Buffer de clipes ligado (${destino}): guardando os últimos minutos em segundo plano. Clique em "Salvar clipe agora" ou use Alt+C para salvar o que acabou de acontecer.`);
        } catch (err) {
            liberarRecursos();
            pararVisualizador();
            addLog(`❌ Erro ao iniciar a gravação: ${err.message}`);
        } finally {
            iniciandoRef.current = false;
        }
    };

    // Encerra só a gravação da sessão (arquivo próprio); o buffer de clipes continua ligado.
    const encerrarSessaoExtra = () => {
        const gravador = sessaoExtraRef.current;
        sessaoExtraRef.current = null;
        if (gravador && gravador.state === 'recording') gravador.stop();
        setGuardarTudo(false);
    };

    const pararGravacao = () => {
        if (sessaoExtraRef.current) encerrarSessaoExtra();
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop();
        liberarRecursos();
        pararVisualizador();
        setGravando(false);
        setGuardarTudo(false);
        addLog(guardarTudoRef.current ? '⏹️ Gravação encerrada.' : '⏹️ Buffer de clipes desligado.');
    };

    iniciarCapturaRef.current = iniciarCaptura;

    const encerrarGravacao = () => {
        if (sessaoExtraRef.current) {
            encerrarSessaoExtra();
            addLog('⏹️ Gravação da sessão encerrada.');
            return;
        }
        pararGravacao();
    };

    // Ligar/desligar na mão vale só para esta sessão: voltar sozinho ao abrir o app é uma escolha
    // explícita, feita no checkbox abaixo.
    const ligarBuffer = () => { iniciarCaptura(false); };
    const desligarBuffer = () => { pararGravacao(); };
    const alternarBufferAuto = (ligado) => {
        setBufferAuto(ligado);
        gravarPreferencia(PREF_BUFFER_AUTO, ligado ? '1' : '0');
    };
    const mudarDuracaoClipe = (segundos) => {
        setDuracaoClipe(segundos);
        gravarPreferencia(PREF_DURACAO_CLIPE, segundos);
    };

    // App desktop: religa o buffer sozinho ao abrir (sem seletor de tela: o Electron entrega o app direto).
    useEffect(() => {
        if (!estaNoAppDesktop() || lerPreferencia(PREF_BUFFER_AUTO, '0') !== '1') return undefined;
        // Se outra instância do Gravador (ex.: sub-aba do Oráculo) já está capturando, não duplica a captura.
        const espera = setTimeout(() => { if (!haCapturaEmAndamento()) iniciarCapturaRef.current(false, { silencioso: true }); }, 2500);
        return () => clearTimeout(espera);
    }, []);

    return (
        <div className="def-box" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
            <div style={{ borderBottom: '1px solid #333', paddingBottom: '10px' }}>
                <h3 style={{ color: '#00ffcc', margin: 0 }}>🎬 Gravação da Sessão (Tela + Vozes)</h3>
                <p style={{ color: '#aaa', fontSize: '0.85em', margin: '5px 0 0 0' }}>
                    Grava a tela do app e as vozes de todos na Sala de Rádio da Party. Ao encerrar, baixa um arquivo .webm direto no seu computador. Nada é enviado para a nuvem — só quem clicou em "Iniciar" fica com o arquivo. No app desktop a gravação continua mesmo com a janela minimizada.
                </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', padding: '0 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75em', color: '#aaa' }}>
                    <span>Captação de Áudio</span>
                    <span>{gravando ? 'Em direto' : 'Standby'}</span>
                </div>
                <div style={{ width: '100%', height: '8px', background: '#222', borderRadius: '4px', overflow: 'hidden' }}>
                    <div
                        ref={volumeBarRef}
                        style={{
                            width: '0%',
                            height: '100%',
                            background: '#333',
                            transition: 'width 0.1s ease, background-color 0.2s',
                            borderRadius: '4px'
                        }}
                    />
                </div>
            </div>

            <div className="gravador-clipe">
                <div className="gravador-clipe-titulo">✂️ Clipes instantâneos (estilo Medal)</div>
                <p className="gravador-clipe-texto">
                    Com o buffer ligado, o app guarda em segundo plano (só na memória deste computador, nada vai para a nuvem) os últimos minutos do app e das vozes. Quando algo épico acontecer, clique em salvar: você recebe um vídeo do que acabou de acontecer, sem ter apertado gravar antes. O clipe começa no quadro-chave mais próximo, então pode sair uns segundos maior que o pedido.
                </p>
                <div className={`gravador-buffer-status${gravando ? ' ligado' : ''}`}>
                    {gravando ? '● Buffer ligado: guardando os últimos minutos' : '○ Buffer desligado'}
                </div>
                <div className="gravador-clipe-linha">
                    {!gravando ? (
                        <button className="btn-neon btn-blue" onClick={ligarBuffer}>🎞️ LIGAR BUFFER DE CLIPES</button>
                    ) : (
                        <button className="btn-neon btn-red" onClick={desligarBuffer} disabled={guardarTudo}>⏹ DESLIGAR BUFFER</button>
                    )}
                    <label htmlFor="duracao-clipe">Duração:</label>
                    <select id="duracao-clipe" className="input-neon" value={duracaoClipe} onChange={e => mudarDuracaoClipe(Number(e.target.value))}>
                        {OPCOES_DURACAO_CLIPE.map(o => <option key={o.segundos} value={o.segundos}>{o.rotulo}</option>)}
                    </select>
                    <button className="btn-neon btn-green gravador-salvar-clipe" disabled={!gravando} onClick={salvarClipe}>✂️ SALVAR CLIPE AGORA</button>
                </div>
                <label className="gravador-clipe-auto">
                    <input type="checkbox" checked={bufferAuto} onChange={e => alternarBufferAuto(e.target.checked)} />
                    Ligar o buffer sozinho quando abrir o app desktop
                </label>
                <div className="gravador-clipe-atalho">Atalho: <kbd>Alt</kbd> + <kbd>C</kbd> (funciona em qualquer aba enquanto o buffer estiver ligado). No navegador o buffer precisa ser ligado a cada sessão.</div>
            </div>

            <div className="gravador-acoes">
                {!guardarTudo ? (
                    <button className="btn-neon btn-green" onClick={() => iniciarCaptura(true)}>▶ INICIAR GRAVAÇÃO</button>
                ) : (
                    <button className="btn-neon btn-red gravador-pulsando" onClick={encerrarGravacao}>⏹ ENCERRAR E BAIXAR</button>
                )}
            </div>

            <div style={{ flex: 1, background: '#0a0a0a', border: '1px solid #333', borderRadius: '5px', padding: '10px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ color: '#00ffcc', fontSize: '0.8em', borderBottom: '1px solid #222', paddingBottom: '5px', marginBottom: '10px', fontFamily: 'monospace' }}>&gt; GRAVADOR_LOGS</div>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px', fontFamily: 'monospace', fontSize: '0.85em', color: '#00ff00' }}>
                    {logs.map((log, i) => <div key={i} style={{ opacity: i === logs.length - 1 ? 1 : 0.7 }}>{log}</div>)}
                    <div ref={logsEndRef} />
                </div>
            </div>
            <style dangerouslySetInnerHTML={{__html: `@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(255, 0, 60, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(255, 0, 60, 0); } 100% { box-shadow: 0 0 0 0 rgba(255, 0, 60, 0); } }`}} />
        </div>
    );
}

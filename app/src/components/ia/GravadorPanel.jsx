import React, { useState, useRef, useEffect, useContext } from 'react';
import useStore from '../../stores/useStore';
import { VoiceContext } from '../../hooks/VoiceContext';
import { haCapturaEmAndamento, registrarCapturaAtiva } from '../../core/estadoBuffer';
import {
    OPCOES_DURACAO_CLIPE, extensaoDoTipo, extrairCabecalho, montarClipe, nomeArquivoClipe, podarChunks
} from '../../core/clipes';
import { criarPipelineDeVideo } from '../../core/pipelineVideo';

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

function tipoSuportado(tipo) {
    return typeof MediaRecorder !== 'undefined' && typeof MediaRecorder.isTypeSupported === 'function' && MediaRecorder.isTypeSupported(tipo);
}

// Formatos em ordem de preferência. MP4 (H.264 + AAC) toca em qualquer player (inclusive os do Windows);
// o WebM (VP8/VP9) muitas vezes abre só com áudio, sem imagem. WebM fica como reserva.
// Quadro-chave a cada 2s (Chromium recente; ignorado onde não existe): cada fragmento do MP4 começa num
// quadro-chave, e é onde um clipe pode começar — quanto mais frequente, mais perto do pedido ele fica.
function candidatosDeFormato(comVideo) {
    const lista = [];
    if (comVideo) {
        if (tipoSuportado('video/mp4;codecs=avc1.42E01E,mp4a.40.2')) {
            lista.push({
                mimeType: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', extensao: 'mp4',
                opcoes: { videoBitsPerSecond: 1500000, audioBitsPerSecond: 64000, videoKeyFrameIntervalDuration: 2000 },
            });
        }
        const webmOk = typeof MediaRecorder === 'undefined' || typeof MediaRecorder.isTypeSupported !== 'function' || MediaRecorder.isTypeSupported('video/webm');
        if (webmOk) {
            lista.push({
                mimeType: 'video/webm', extensao: 'webm',
                opcoes: { videoBitsPerSecond: 1500000, audioBitsPerSecond: 64000, videoKeyFrameIntervalDuration: 2000 },
            });
        }
        return lista;
    }
    if (tipoSuportado('audio/mp4;codecs=mp4a.40.2')) {
        lista.push({ mimeType: 'audio/mp4;codecs=mp4a.40.2', extensao: 'm4a', opcoes: { audioBitsPerSecond: 48000 } });
    }
    lista.push({ mimeType: 'audio/webm', extensao: 'webm', opcoes: { audioBitsPerSecond: 32000 } });
    return lista;
}

// Cria o gravador com o primeiro formato que o navegador aceitar de fato (isTypeSupported pode dizer
// que sim quando falta um codificador): devolve { recorder, formato }. Lança o último erro se nenhum servir.
function criarGravador(stream, candidatos) {
    let ultimoErro = null;
    for (const formato of candidatos) {
        try {
            return { recorder: new MediaRecorder(stream, { mimeType: formato.mimeType, ...formato.opcoes }), formato };
        } catch (err) {
            ultimoErro = err;
        }
    }
    throw ultimoErro || new Error('Nenhum formato de gravação disponível.');
}

function estaNoAppDesktop() {
    return typeof navigator !== 'undefined' && /Electron/i.test(navigator.userAgent || '');
}

export default function GravadorPanel() {
    const [gravando, setGravando] = useState(false);
    const [guardarTudo, setGuardarTudo] = useState(false);
    // Sem captura de tela os arquivos saem só com áudio: mostrado em destaque para não parecer defeito.
    const [semVideo, setSemVideo] = useState(false);
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
    const extensaoRef = useRef('webm');
    const semVideoRef = useRef(false);
    const pipelineVideoRef = useRef(null);
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
    // Áudio da própria página (música da Mesa de Som e as vozes como você as ouve), vindo da captura de tela.
    // Quando existe, as vozes remotas já estão nele: a mixagem delas fica muda para não gravar em dobro.
    const fontePaginaRef = useRef(null);
    const ganhoRemotasRef = useRef(null);
    const paginaTemAudioRef = useRef(false);
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

    const atualizarGanhoDasVozesRemotas = () => {
        const ganho = ganhoRemotasRef.current;
        if (!ganho) return;
        // Com o áudio da página na gravação, as vozes só entram pela mixagem se você estiver surdo
        // (surdo = mudo no seu alto-falante, então elas não estariam no áudio da página).
        ganho.gain.value = (paginaTemAudioRef.current && !(voz && voz.surdo)) ? 0 : 1;
    };

    const desligarAudioDaPagina = () => {
        if (fontePaginaRef.current) {
            try { fontePaginaRef.current.disconnect(); } catch (e) { /* já desconectada */ }
            fontePaginaRef.current = null;
        }
        paginaTemAudioRef.current = false;
        atualizarGanhoDasVozesRemotas();
    };

    // Libera tudo que o gravador abriu (tela, mic próprio, mixagem). Nunca encerra o
    // stream do microfone da Sala de Rádio (voz.meuStream): ele pertence ao useVoiceChat.
    const liberarRecursos = () => {
        if (pipelineVideoRef.current) {
            try { pipelineVideoRef.current.parar(); } catch (e) { /* já parado */ }
            pipelineVideoRef.current = null;
        }
        pararTracks(telaStreamRef.current);
        telaStreamRef.current = null;
        pararTracks(micProprioRef.current);
        micProprioRef.current = null;
        fontesRef.current.forEach(fonte => { try { fonte.disconnect(); } catch (e) { /* já desconectada */ } });
        fontesRef.current.clear();
        desligarAudioDaPagina();
        ganhoRemotasRef.current = null;
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
                fonte.connect(chave.startsWith('local:') ? destino : (ganhoRemotasRef.current || destino));
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

    useEffect(() => {
        if (gravando) atualizarGanhoDasVozesRemotas();
    }, [gravando, voz && voz.surdo]);

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
        const marcaAudio = semVideoRef.current ? '_somente-audio' : '';
        const nomeArquivo = `gravacao_${sanitizarNomeArquivo(meuNome)}_${carimbo}${marcaAudio}.${extensaoRef.current}`;
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
            const clipe = await montarClipe(chunksRef.current, cabecalhoRef.current, duracaoClipe, Date.now(), tipoRef.current.split(';')[0]);
            if (!clipe) { addLog('⚠️ Ainda não há imagem suficiente no buffer para um clipe. Tente de novo em alguns segundos.'); return; }
            const nomeArquivo = nomeArquivoClipe(meuNome, duracaoClipe, new Date(), extensaoDoTipo(tipoRef.current));
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
                .then(() => extrairCabecalho(iniciais, tipoRef.current))
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
                const nomeArquivo = baixarGravacao(new Blob(partes, { type: tipo.split(';')[0] }));
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
            ganhoRemotasRef.current = mixCtx.createGain();
            ganhoRemotasRef.current.connect(destinoRef.current);
            paginaTemAudioRef.current = false;

            // 1. Tela: só a aba do próprio app. Pede também o áudio da página (no app desktop é só o áudio do
            // próprio app, nunca o do sistema): é por ele que a música da Mesa de Som entra na gravação.
            let telaStream = null;
            if (navigator.mediaDevices.getDisplayMedia) {
                try {
                    telaStream = await navigator.mediaDevices.getDisplayMedia({
                        video: { frameRate: 15 },
                        // Só no app desktop: lá o handler entrega o áudio do próprio app. No navegador o áudio
                        // seria da aba que o usuário escolher (talvez outra), então a mixagem de vozes segue sozinha.
                        audio: estaNoAppDesktop(),
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

            const trilhasAudioPagina = telaStream && typeof telaStream.getAudioTracks === 'function' ? telaStream.getAudioTracks() : [];
            if (trilhasAudioPagina.length > 0) {
                try {
                    fontePaginaRef.current = mixCtx.createMediaStreamSource(new MediaStream(trilhasAudioPagina));
                    fontePaginaRef.current.connect(destinoRef.current);
                    paginaTemAudioRef.current = true;
                    atualizarGanhoDasVozesRemotas();
                    addLog('🎵 Áudio do app (música da Mesa de Som e vozes como você as ouve) incluído na gravação.');
                } catch (err) {
                    fontePaginaRef.current = null;
                    addLog(`⚠️ Não foi possível captar o áudio do app: ${err.message}`);
                }
            } else if (telaStream && estaNoAppDesktop()) {
                addLog('ℹ️ Sem áudio do app nesta captura: a música da Mesa de Som não vai na gravação (no app desktop, instale a versão mais recente).');
            }

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

            let gravaVideo = !!telaStream;
            let candidatos = candidatosDeFormato(gravaVideo);
            if (gravaVideo && candidatos.length === 0) {
                pararTracks(telaStream);
                telaStreamRef.current = null;
                desligarAudioDaPagina();
                gravaVideo = false;
                candidatos = candidatosDeFormato(false);
                addLog('⚠️ Este navegador não grava vídeo mp4 nem webm — gravando somente o áudio.');
            }
            // A tela passa por um canvas de tamanho fixo (a janela muda de tamanho; o MP4 não aguenta isso).
            const pipeline = gravaVideo ? criarPipelineDeVideo(telaStream) : null;
            pipelineVideoRef.current = pipeline;
            const trilhasVideo = gravaVideo ? (pipeline ? pipeline.trilhas : telaStream.getVideoTracks()) : [];
            const streamFinal = new MediaStream([...trilhasVideo, ...audioMixado.getAudioTracks()]);

            chunksRef.current = [];
            cabecalhoRef.current = null;
            guardarTudoRef.current = gravarSessaoInteira;
            const { recorder, formato } = criarGravador(streamFinal, candidatos);
            const tipo = formato.mimeType;
            tipoRef.current = tipo;
            extensaoRef.current = formato.extensao;
            semVideoRef.current = !gravaVideo;
            streamFinalRef.current = streamFinal;
            opcoesRef.current = { mimeType: tipo, ...formato.opcoes };

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
                const blob = new Blob(chunks.map(c => c.blob), { type: tipo.split(';')[0] });
                const nomeArquivo = baixarGravacao(blob);
                addLog(`💾 Gravação salva no seu computador como "${nomeArquivo}".`);
            };

            // Se o usuário clicar em "Parar compartilhamento" do navegador, encerra e baixa.
            if (gravaVideo) telaStream.getVideoTracks()[0].onended = () => pararGravacao();

            // Pedaços de 1s: o clipe é montado a partir deles (a sessão inteira segue igual).
            recorder.start(1000);
            mediaRecorderRef.current = recorder;

            setGuardarTudo(gravarSessaoInteira);
            setSemVideo(!gravaVideo);
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
        setSemVideo(false);
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
                    Grava a tela do app e as vozes de todos na Sala de Rádio da Party. Ao encerrar, baixa um vídeo (.mp4) direto no seu computador. Nada é enviado para a nuvem — só quem clicou em "Iniciar" fica com o arquivo. No app desktop a gravação continua mesmo com a janela minimizada.
                </p>
            </div>

            {gravando && semVideo && (
                <div className="gravador-aviso" role="alert">
                    ⚠️ Sem captura de tela: os arquivos desta gravação terão só áudio (sem imagem). No app desktop isso acontece quando o instalador é antigo; instale o mais recente.
                </div>
            )}

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

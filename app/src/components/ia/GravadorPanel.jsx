import React, { useState, useRef, useEffect, useContext } from 'react';
import useStore from '../../stores/useStore';
import { VoiceContext } from '../../hooks/VoiceContext';

function sanitizarNomeArquivo(nome) {
    return (nome || 'Anonimo').replace(/[^a-zA-Z0-9_-]+/g, '_');
}

function pararTracks(stream) {
    if (stream) stream.getTracks().forEach(track => track.stop());
}

export default function GravadorPanel() {
    const [gravando, setGravando] = useState(false);
    const [logs, setLogs] = useState(['Gravador local pronto.']);

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
    // perder a sessão toda sem querer.
    useEffect(() => {
        const avisarAntesDeSair = (e) => {
            if (!gravando) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', avisarAntesDeSair);
        return () => window.removeEventListener('beforeunload', avisarAntesDeSair);
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
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nomeArquivo;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return nomeArquivo;
    };

    const iniciarGravacao = async () => {
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
                } catch (err) { addLog('⚠️ Captura de tela não autorizada — gravando somente o áudio.'); }
            } else {
                addLog('⚠️ Este navegador não permite capturar a tela — gravando somente o áudio.');
            }
            telaStreamRef.current = telaStream;

            // 2. Voz: se você não está na Sala de Rádio, abre o microfone por conta própria.
            if (!(voz && voz.meuStream)) {
                micProprioRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            }
            // Se o painel foi desmontado enquanto os pedidos de permissão estavam abertos, desiste.
            if (!ativoRef.current) { liberarRecursos(); return; }
            sincronizarVozes();
            if (voz && voz.meuStream) addLog(`🎧 Sala de Rádio: ${(voz.conexoes || []).length} jogador(es) conectado(s) serão gravados.`);
            else addLog('ℹ️ Você não está na Sala de Rádio: gravando só o seu microfone.');

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
            const opcoes = gravaVideo
                ? { mimeType: 'video/webm', videoBitsPerSecond: 1500000, audioBitsPerSecond: 64000 }
                : { mimeType: 'audio/webm', audioBitsPerSecond: 32000 };

            let localChunks = [];
            const recorder = new MediaRecorder(streamFinal, opcoes);
            const tipo = opcoes.mimeType;

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) localChunks.push(event.data);
            };

            recorder.onstop = () => {
                if (localChunks.length === 0) { addLog('⚠️ Nada foi capturado.'); return; }
                const blob = new Blob(localChunks, { type: tipo });
                localChunks = [];
                const nomeArquivo = baixarGravacao(blob);
                addLog(`💾 Gravação salva no seu computador como "${nomeArquivo}".`);
            };

            // Se o usuário clicar em "Parar compartilhamento" do navegador, encerra e baixa.
            if (gravaVideo) telaStream.getVideoTracks()[0].onended = () => pararGravacao();

            recorder.start();
            mediaRecorderRef.current = recorder;

            setGravando(true);
            addLog(gravaVideo
                ? '🎬 Gravando tela do app + vozes. Tudo fica só neste navegador — nada vai para a nuvem.'
                : '🎙️ Gravando somente áudio. Tudo fica só neste navegador — nada vai para a nuvem.');
        } catch (err) {
            liberarRecursos();
            pararVisualizador();
            addLog(`❌ Erro ao iniciar a gravação: ${err.message}`);
        } finally {
            iniciandoRef.current = false;
        }
    };

    const pararGravacao = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop();
        liberarRecursos();
        pararVisualizador();
        setGravando(false);
        addLog('⏹️ Gravação encerrada.');
    };

    return (
        <div className="def-box" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
            <div style={{ borderBottom: '1px solid #333', paddingBottom: '10px' }}>
                <h3 style={{ color: '#00ffcc', margin: 0 }}>🎬 Gravação da Sessão (Tela + Vozes)</h3>
                <p style={{ color: '#aaa', fontSize: '0.85em', margin: '5px 0 0 0' }}>
                    Grava a tela do app e as vozes de todos na Sala de Rádio da Party. Ao encerrar, baixa um arquivo .webm direto no seu computador. Nada é enviado para a nuvem — só quem clicou em "Iniciar" fica com o arquivo.
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

            <div style={{ display: 'flex', gap: '15px', justifyContent: 'center', padding: '10px 0' }}>
                {!gravando ? (
                    <button className="btn-neon btn-green" onClick={iniciarGravacao} style={{ padding: '15px 30px', fontWeight: 'bold' }}>▶ INICIAR GRAVAÇÃO</button>
                ) : (
                    <button className="btn-neon btn-red" onClick={pararGravacao} style={{ padding: '15px 30px', fontWeight: 'bold', animation: 'pulse 1.5s infinite' }}>⏹ ENCERRAR E BAIXAR</button>
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

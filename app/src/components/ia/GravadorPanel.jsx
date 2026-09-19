import React, { useState, useRef, useEffect } from 'react';
import useStore from '../../stores/useStore';

function sanitizarNomeArquivo(nome) {
    return (nome || 'Anonimo').replace(/[^a-zA-Z0-9_-]+/g, '_');
}

export default function GravadorPanel() {
    const [gravando, setGravando] = useState(false);
    const [logs, setLogs] = useState(['Gravador de voz local pronto.']);

    const streamRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const logsEndRef = useRef(null);

    const audioContextRef = useRef(null);
    const animationFrameRef = useRef(null);
    const volumeBarRef = useRef(null);

    const meuNome = useStore(s => s.meuNome);

    const addLog = (msg) => {
        const hora = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, `[${hora}] ${msg}`]);
    };

    useEffect(() => {
        if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    // A gravação inteira só existe na memória até o clique em "Encerrar e Baixar" — não há
    // mais salvamento incremental na nuvem. Avisa antes de fechar/recarregar a aba para não
    // perder a sessão toda sem querer, e libera o microfone se o painel for desmontado.
    useEffect(() => {
        const avisarAntesDeSair = (e) => {
            if (!gravando) return;
            e.preventDefault();
            e.returnValue = '';
        };
        window.addEventListener('beforeunload', avisarAntesDeSair);
        return () => window.removeEventListener('beforeunload', avisarAntesDeSair);
    }, [gravando]);

    useEffect(() => {
        return () => {
            if (mediaRecorderRef.current) mediaRecorderRef.current.onstop = null;
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop();
            if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
        };
    }, []);

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

    // Salva o áudio só no computador de quem gravou: cria um link de download temporário
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
        try {
            if (!streamRef.current) streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });

            iniciarVisualizador(streamRef.current);

            let localChunks = [];
            const recorder = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm', audioBitsPerSecond: 32000 });

            recorder.ondataavailable = (event) => {
                if (event.data.size > 0) localChunks.push(event.data);
            };

            recorder.onstop = () => {
                if (localChunks.length === 0) { addLog('⚠️ Nenhum áudio foi capturado.'); return; }
                const audioBlob = new Blob(localChunks, { type: 'audio/webm' });
                localChunks = [];
                const nomeArquivo = baixarGravacao(audioBlob);
                addLog(`💾 Gravação salva no seu computador como "${nomeArquivo}".`);
            };

            recorder.start();
            mediaRecorderRef.current = recorder;

            setGravando(true);
            addLog('🎙️ Gravação iniciada! O áudio fica só neste navegador — nada é enviado para a nuvem.');
        } catch (err) { addLog(`❌ Erro de microfone: ${err.message}`); }
    };

    const pararGravacao = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') mediaRecorderRef.current.stop();
        if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }

        pararVisualizador();
        setGravando(false);
        addLog('⏹️ Gravação encerrada.');
    };

    return (
        <div className="def-box" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
            <div style={{ borderBottom: '1px solid #333', paddingBottom: '10px' }}>
                <h3 style={{ color: '#00ffcc', margin: 0 }}>🎙️ Gravação de Voz Local</h3>
                <p style={{ color: '#aaa', fontSize: '0.85em', margin: '5px 0 0 0' }}>
                    Grava o áudio da sessão e, ao encerrar, baixa um arquivo .webm direto no seu computador. Nada é enviado para a nuvem — só quem clicou em "Iniciar" fica com o arquivo.
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

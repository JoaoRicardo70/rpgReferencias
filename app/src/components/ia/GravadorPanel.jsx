import React, { useState, useRef, useEffect } from 'react';
import { ref, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { storage, functions } from '../../services/firebase-config';
import useStore from '../../stores/useStore'; 
import { useAIForm } from './AIFormContext';

export default function GravadorPanel() {
    const [gravando, setGravando] = useState(false);
    const [logs, setLogs] = useState(['Módulo de Escuta Contínua inicializado...']);
    
    const streamRef = useRef(null);
    const mediaRecorderRef = useRef(null);
    const timerRef = useRef(null);
    const logsEndRef = useRef(null);
    const pedacoContadorRef = useRef(1);

    const audioContextRef = useRef(null);
    const analyserRef = useRef(null);
    const animationFrameRef = useRef(null);
    const volumeBarRef = useRef(null);

    const cenario = useStore(s => s.cenario);
    const personagens = useStore(s => s.personagens); 
    const meuNome = useStore(s => s.meuNome); 
    const minhaFicha = useStore(s => s.minhaFicha); 

    const nomesAtivos = Array.isArray(cenario?.tavernaAtivos) ? cenario.tavernaAtivos : [];

    const perfisJogadores = nomesAtivos.map(nome => {
        const ficha = nome === meuNome ? minhaFicha : personagens?.[nome];
        const classe = ficha?.bio?.classe || 'Mundano';
        const raca = ficha?.bio?.raca || 'Desconhecida';
        return `${nome} (Classe: ${classe}, Raça: ${raca})`;
    });

    const ctx = useAIForm();
    const { capitulosPresente, capitulosFuturo, salvarNoRegistro, loreFoco } = ctx || {};
    const [destinoLore, setDestinoLore] = useState('novo_capitulo');

    const addLog = (msg) => {
        const hora = new Date().toLocaleTimeString();
        setLogs(prev => [...prev, `[${hora}] ${msg}`]);
    };

    useEffect(() => {
        if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    const iniciarVisualizador = (stream) => {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        
        const source = audioCtx.createMediaStreamSource(stream);
        source.connect(analyser);

        audioContextRef.current = audioCtx;
        analyserRef.current = analyser;

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

    const iniciarMediaRecorder = () => {
        // Sem audioBitsPerSecond explícito, o Chrome grava a 128kbps por padrão: um bloco de
        // 20 minutos (TEMPO_CORTE) vira ~24MB em base64, acima do limite de ~20MB de dados
        // inline da API do Gemini — por isso a transcrição falhava (sempre) nos cortes automáticos.
        // 32kbps é mais que suficiente para voz e mantém um bloco de 20min em ~6MB.
        const recorder = new MediaRecorder(streamRef.current, { mimeType: 'audio/webm', audioBitsPerSecond: 32000 });
        let localChunks = [];
        const numeroPedaco = pedacoContadorRef.current;
        pedacoContadorRef.current++; 

        recorder.ondataavailable = (event) => {
            if (event.data.size > 0) localChunks.push(event.data);
        };

        recorder.onstop = async () => {
            if (localChunks.length === 0) return;
            const audioBlob = new Blob(localChunks, { type: 'audio/webm' });
            localChunks = []; 
            
            addLog(`⏳ Processando Parte ${numeroPedaco}... Iniciando upload silencioso.`);
            
            try {
                const nomeArquivo = `sessao_${Date.now()}_pt${numeroPedaco}.webm`;
                const audioRef = ref(storage, `audios_mesa/${nomeArquivo}`);
                
                await uploadBytes(audioRef, audioBlob);
                addLog(`✅ Parte ${numeroPedaco} enviada. Sexta-Feira iniciou a transcrição...`);

                if (!functions) return addLog("❌ Erro: Firebase Functions offline.");

                const transcrever = httpsCallable(functions, 'transcreverAudioSextaFeira');
                
                const resultado = await transcrever({ 
                    fileName: nomeArquivo,
                    nomesParticipantes: perfisJogadores,
                    gravadorPrincipal: meuNome // 🔥 ETIQUETA VIP: Dizemos à IA quem é o dono deste microfone!
                });

                const textoGerado = resultado.data?.texto;

                if (textoGerado) {
                    addLog(`📜 Legendas da Parte ${numeroPedaco} geradas com sucesso! Salvando no Arco selecionado...`);
                    if (salvarNoRegistro) {
                        const dataHoje = new Date().toLocaleDateString('pt-BR');
                        // semPrompt: esta gravação é salva automaticamente (sem clique do
                        // usuário nesse instante) — nunca pode ficar esperando um window.prompt().
                        salvarNoRegistro(textoGerado, `Sessão ${dataHoje} - Parte ${numeroPedaco}`, destinoLore, loreFoco, { semPrompt: true });
                    }
                } else {
                    addLog(`⚠️ Parte ${numeroPedaco}: A IA não conseguiu extrair palavras.`);
                }

            } catch (erro) {
                addLog(`❌ ERRO na Parte ${numeroPedaco}: ${erro.message}`);
            }
        };

        recorder.start();
        mediaRecorderRef.current = recorder;
    };

    const iniciarGravacao = async () => {
        try {
            if (!streamRef.current) streamRef.current = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            iniciarVisualizador(streamRef.current); 
            
            pedacoContadorRef.current = 1;
            iniciarMediaRecorder();
            setGravando(true);
            addLog("🎙️ Gravação contínua iniciada! O sistema fará cortes automáticos a cada 20 minutos.");

            const TEMPO_CORTE = 20 * 60 * 1000; 
            
            timerRef.current = setInterval(() => {
                addLog("✂️ 20 minutos atingidos. Fechando o bloco atual e abrindo o próximo sem perder áudio...");
                if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") mediaRecorderRef.current.stop(); 
                iniciarMediaRecorder(); 
            }, TEMPO_CORTE);

        } catch (err) { addLog(`❌ Erro de microfone: ${err.message}`); }
    };

    const pararGravacao = () => {
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") mediaRecorderRef.current.stop(); 
        if (streamRef.current) { streamRef.current.getTracks().forEach(track => track.stop()); streamRef.current = null; }
        
        pararVisualizador();
        setGravando(false);
        addLog("⏹️ Gravação total encerrada pelo Mestre.");
    };

    const arcosDisponiveis = loreFoco === 'presente' ? (capitulosPresente || []) : (capitulosFuturo || []);

    return (
        <div className="def-box" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
            <div style={{ borderBottom: '1px solid #333', paddingBottom: '10px' }}>
                <h3 style={{ color: '#00ffcc', margin: 0 }}>🎙️ Escuta Contínua (Sessão Longa)</h3>
                <p style={{ color: '#aaa', fontSize: '0.85em', margin: '5px 0 0 0' }}>
                    O áudio será fatiado a cada 20 minutos e injetado diretamente no Arco que você escolher abaixo.
                </p>
            </div>

            <div style={{ background: 'rgba(0,0,0,0.5)', padding: '15px', borderRadius: '8px', border: '1px solid #444', display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                <strong style={{ color: '#00ffcc' }}>Destino das Gravações:</strong>
                <select className="input-neon" value={destinoLore} onChange={e => setDestinoLore(e.target.value)} style={{ flex: 1, minWidth: '200px', borderColor: '#00ffcc', color: '#fff' }}>
                    <option value="novo_capitulo">➕ Criar Novo Capítulo Inteiro a cada gravação</option>
                    {arcosDisponiveis.map(cap => (
                        <optgroup key={cap.id} label={`📖 ${cap.titulo}`}>
                            <option value={`novo_arco_${cap.id}`}>➕ Criar Novo Arco aqui dentro</option>
                            {cap.arcos.map(a => <option key={a.id} value={`${cap.id}_${a.id}`}>📂 Injetar no: {a.titulo}</option>)}
                        </optgroup>
                    ))}
                </select>
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
                    <button className="btn-neon btn-green" onClick={iniciarGravacao} style={{ padding: '15px 30px', fontWeight: 'bold' }}>▶ INICIAR SESSÃO</button>
                ) : (
                    <button className="btn-neon btn-red" onClick={pararGravacao} style={{ padding: '15px 30px', fontWeight: 'bold', animation: 'pulse 1.5s infinite' }}>⏹ ENCERRAR SESSÃO</button>
                )}
            </div>

            <div style={{ flex: 1, background: '#0a0a0a', border: '1px solid #333', borderRadius: '5px', padding: '10px', display: 'flex', flexDirection: 'column' }}>
                <div style={{ color: '#00ffcc', fontSize: '0.8em', borderBottom: '1px solid #222', paddingBottom: '5px', marginBottom: '10px', fontFamily: 'monospace' }}>&gt; AUTO_SLICER_LOGS</div>
                <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '5px', fontFamily: 'monospace', fontSize: '0.85em', color: '#00ff00' }}>
                    {logs.map((log, i) => <div key={i} style={{ opacity: i === logs.length - 1 ? 1 : 0.7 }}>{log}</div>)}
                    <div ref={logsEndRef} />
                </div>
            </div>
            <style dangerouslySetInnerHTML={{__html: `@keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(255, 0, 60, 0.7); } 70% { box-shadow: 0 0 0 15px rgba(255, 0, 60, 0); } 100% { box-shadow: 0 0 0 0 rgba(255, 0, 60, 0); } }`}} />
        </div>
    );
}
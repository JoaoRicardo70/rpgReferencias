import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom'; // 🔥 O FEITIÇO DE LEVITAÇÃO ABSOLUTA
import { ref, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { storage, functions } from '../../services/firebase-config';

export function MapaOlhoSextaFeira({ meuNome, personagens, minhaFicha, tavernaAtivos, meuStream, conexoes }) {
    const [gravando, setGravando] = useState(false);
    const [expandido, setExpandido] = useState(false);
    const [logs, setLogs] = useState(['Sexta-Feira: HUD de Inteligência Artificial online.']);

    const [mascaraMestre, setMascaraMestre] = useState('narrador'); 
    const [nomeNpc, setNomeNpc] = useState('');

    const mediaRecorderRef = useRef(null);
    const recognitionRef = useRef(null); // 🔥 O ouvido nativo do navegador
    const gravandoRef = useRef(false); // Para a IA saber se deve continuar a ouvir
    
    const timerRef = useRef(null);
    const mixerCtxRef = useRef(null);
    const pedacoContadorRef = useRef(1);
    const logsEndRef = useRef(null);

    const perfisJogadores = (Array.isArray(tavernaAtivos) ? tavernaAtivos : []).map(nome => {
        const ficha = nome === meuNome ? minhaFicha : personagens?.[nome];
        return `${nome} (Classe: ${ficha?.bio?.classe || 'Mundano'}, Raça: ${ficha?.bio?.raca || 'Desconhecida'})`;
    });

    useEffect(() => {
        if (logsEndRef.current) logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    useEffect(() => {
        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
            if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") mediaRecorderRef.current.stop();
            if (mixerCtxRef.current) mixerCtxRef.current.close();
            if (recognitionRef.current) {
                recognitionRef.current.onend = null;
                recognitionRef.current.abort();
            }
        };
    }, []);

    // Aumentei o histórico para 12 linhas para você ver os diálogos rolarem
    const addLog = (msg) => { 
        const hora = new Date().toLocaleTimeString('pt-BR', { hour12: false }); 
        setLogs(prev => [...prev.slice(-12), `[${hora}] ${msg}`]); 
    };

    const iniciarGravacao = () => {
        if (!meuStream) return addLog("❌ Erro: Microfone offline.");
        
        setGravando(true); 
        gravandoRef.current = true;
        setExpandido(true); // Mantém a HUD aberta para ver a mágica

        // ========================================================
        // 🧠 1. TRANSCRIÇÃO EM TEMPO REAL (O NOVO CÉREBRO)
        // ========================================================
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SpeechRecognition) {
            const recognition = new SpeechRecognition();
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = 'pt-BR'; // Mude para pt-PT se desejar sotaque lusitano

            recognition.onresult = (event) => {
                const frase = event.results[event.results.length - 1][0].transcript.trim();
                if (frase) {
                    const papel = mascaraMestre === 'npc' && nomeNpc ? nomeNpc : meuNome;
                    addLog(`🗣️ ${papel}: "${frase}"`);
                    // 🔥 FUTURO: Aqui chamaremos a função para salvar a frase no Firebase!
                }
            };

            recognition.onerror = (e) => {
                if (e.error !== 'no-speech') addLog(`⚠️ Alerta de Áudio: ${e.error}`);
            };
            
            // Se o navegador tentar desligar o ouvido por silêncio, nós forçamos a ligar de novo!
            recognition.onend = () => { if (gravandoRef.current) recognition.start(); };
            
            recognition.start();
            recognitionRef.current = recognition;
        } else {
            addLog("⚠️ Aviso: Navegador não suporta transcrição nativa.");
        }

        // ========================================================
        // 📼 2. BACKUP EM ÁUDIO (O SEU SISTEMA ORIGINAL INTACTO)
        // ========================================================
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
                    
                    const instrucaoMestre = (mascaraMestre === 'npc' && nomeNpc.trim())
                        ? `[ATENÇÃO IA: O usuário (${meuNome}) está interpretando o NPC "${nomeNpc.trim()}".]` 
                        : `[ATENÇÃO IA: O usuário (${meuNome}) é o Narrador.]`;

                    const transcrever = httpsCallable(functions, 'transcreverAudioSextaFeira');
                    await transcrever({ 
                        fileName: nomeArquivo, 
                        nomesParticipantes: perfisJogadores, 
                        gravadorPrincipal: meuNome,
                        instrucaoMestre: instrucaoMestre 
                    });
                    addLog(`📦 Backup P${num} consolidado na Nuvem!`);
                } catch(e) { 
                    addLog(`❌ Falha no Backup P${num} (Erro Servidor).`); 
                }
            };

            recorder.start();
            mediaRecorderRef.current = recorder;
            addLog(`🎙️ Escuta Ativa! Gravando Mic + ${vozesExtras} vozes.`);

            timerRef.current = setInterval(() => {
                if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
                recorder.start();
            }, 20 * 60 * 1000);
        } catch(e) { 
            addLog("❌ Erro ao iniciar mixer de áudio."); 
        }
    };

    const pararGravacao = () => {
        setGravando(false);
        gravandoRef.current = false;
        
        if (timerRef.current) clearInterval(timerRef.current);
        if (mediaRecorderRef.current?.state === "recording") mediaRecorderRef.current.stop();
        if (mixerCtxRef.current) mixerCtxRef.current.close();
        if (recognitionRef.current) {
            recognitionRef.current.onend = null;
            recognitionRef.current.abort();
        }
        addLog("⏹️ Escuta encerrada.");
    };

    // ========================================================
    // 🎨 UI HUD: RENDERIZADO NO PORTAL PARA FLUTUAR SEMPRE
    // ========================================================
    const hudSextaFeira = (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 2147483647, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '15px' }}>
            {/* BOTÃO REDONDO (O OLHO) */}
            <div onClick={() => setExpandido(!expandido)} style={{ width: '60px', height: '60px', borderRadius: '50%', background: 'rgba(0, 20, 40, 0.85)', backdropFilter: 'blur(10px)', border: `2px solid ${gravando ? '#ff003c' : '#00ffcc'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '26px', cursor: 'pointer', boxShadow: gravando ? '0 0 25px rgba(255,0,60,0.6)' : '0 0 15px rgba(0,255,204,0.4)', transition: 'all 0.3s ease' }}>
                {gravando ? '🎙️' : '👁️'}
            </div>

            {/* PAINEL HUD EXPANDIDO */}
            {expandido && (
                <div className="fade-in" style={{ background: 'rgba(0, 15, 30, 0.85)', backdropFilter: 'blur(15px)', border: `1px solid ${gravando ? '#ff003c' : 'rgba(0, 255, 204, 0.4)'}`, borderRadius: '12px', padding: '20px', width: '340px', boxShadow: gravando ? '0 0 30px rgba(255,0,60,0.3), inset 0 0 20px rgba(255,0,60,0.1)' : '0 0 25px rgba(0,255,204,0.2), inset 0 0 15px rgba(0,255,204,0.05)', transition: 'all 0.3s ease' }}>
                    
                    {/* CABEÇALHO */}
                    <div style={{ borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ color: gravando ? '#ff003c' : '#00ffcc', fontWeight: '900', letterSpacing: '1px', textTransform: 'uppercase', fontSize: '0.9em', textShadow: `0 0 10px ${gravando ? '#ff003c' : '#00ffcc'}` }}>
                            {gravando ? '🔴 TRANSMISSÃO ATIVA' : '📡 SEXTA-FEIRA OS'}
                        </span>
                        <button onClick={() => setExpandido(false)} style={{ background: 'none', border: 'none', color: '#fff', cursor: 'pointer', opacity: 0.5, fontSize: '1.2em' }}>✕</button>
                    </div>

                    {/* MÁSCARAS DE GRAVAÇÃO */}
                    <div style={{ marginTop: '15px', padding: '15px', background: 'rgba(0,0,0,0.4)', borderRadius: '8px', border: '1px dashed rgba(255,204,0,0.3)' }}>
                        <span style={{ color: '#ffcc00', fontSize: '0.75em', fontWeight: 'bold', display: 'block', marginBottom: '10px', textAlign: 'center', letterSpacing: '1px' }}>🎭 MÁSCARA DE IDENTIDADE</span>
                        
                        <div style={{ display: 'flex', gap: '8px', marginBottom: mascaraMestre === 'npc' ? '12px' : '0' }}>
                            <button onClick={() => setMascaraMestre('narrador')} style={{ flex: 1, padding: '8px', fontSize: '0.8em', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', border: `1px solid ${mascaraMestre === 'narrador' ? '#ffcc00' : '#444'}`, background: mascaraMestre === 'narrador' ? 'rgba(255,204,0,0.2)' : 'transparent', color: mascaraMestre === 'narrador' ? '#ffcc00' : '#888', transition: 'all 0.2s' }}>📖 NARRADOR</button>
                            <button onClick={() => setMascaraMestre('npc')} style={{ flex: 1, padding: '8px', fontSize: '0.8em', fontWeight: 'bold', borderRadius: '4px', cursor: 'pointer', border: `1px solid ${mascaraMestre === 'npc' ? '#00aaff' : '#444'}`, background: mascaraMestre === 'npc' ? 'rgba(0,170,255,0.2)' : 'transparent', color: mascaraMestre === 'npc' ? '#00aaff' : '#888', transition: 'all 0.2s' }}>👺 NPC</button>
                        </div>

                        {mascaraMestre === 'npc' && (
                            <input className="fade-in" type="text" placeholder="Nome do NPC atual..." value={nomeNpc} onChange={e => setNomeNpc(e.target.value)} style={{ width: '100%', padding: '8px 12px', fontSize: '0.9em', border: '1px solid #00aaff', background: 'rgba(0,20,40,0.6)', color: '#00ffcc', borderRadius: '4px', outline: 'none', boxSizing: 'border-box', boxShadow: 'inset 0 0 10px rgba(0,170,255,0.2)' }} />
                        )}
                    </div>

                    {/* BOTÃO DE AÇÃO */}
                    {!gravando ? (
                        <button onClick={iniciarGravacao} style={{ marginTop: '15px', width: '100%', padding: '12px', background: 'rgba(0, 255, 204, 0.1)', border: '1px solid #00ffcc', color: '#00ffcc', fontWeight: '900', letterSpacing: '2px', cursor: 'pointer', borderRadius: '6px', boxShadow: '0 0 15px rgba(0,255,204,0.2)', transition: 'all 0.2s' }}>▶ INICIAR ESCUTA</button>
                    ) : (
                        <button onClick={pararGravacao} style={{ marginTop: '15px', width: '100%', padding: '12px', background: 'rgba(255, 0, 60, 0.1)', border: '1px solid #ff003c', color: '#ff003c', fontWeight: '900', letterSpacing: '2px', cursor: 'pointer', borderRadius: '6px', boxShadow: '0 0 15px rgba(255,0,60,0.3)', animation: 'pulse 1.5s infinite' }}>⏹ ENCERRAR</button>
                    )}
                    
                    {/* TERMINAL DE LOGS */}
                    <div style={{ background: 'rgba(0,5,10,0.8)', marginTop: '15px', borderRadius: '6px', padding: '10px', fontSize: '0.75em', color: '#00ffcc', fontFamily: 'monospace', height: '140px', overflowY: 'auto', border: '1px solid rgba(0,255,204,0.2)', boxShadow: 'inset 0 0 10px rgba(0,0,0,0.8)', lineHeight: '1.4' }}>
                        {logs.map((l, i) => (
                            <div key={i} style={{ marginBottom: '4px', opacity: i === logs.length -1 ? 1 : 0.7 }}>{l}</div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                </div>
            )}
        </div>
    );

    // 🔥 O Feitiço de Levitação: Rende o componente diretamente no 'body' da página, sobrepondo-se a todos os mapas, CSS ou bloqueios visuais!
    return createPortal(hudSextaFeira, document.body);
}
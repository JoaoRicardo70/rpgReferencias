import { useEffect, useState } from 'react';
// Importe a sua função de enviar para o Firebase aqui
// import { enviarMemoriaSextaFeira } from '../../services/firebase-sync'; 

export function useOuvidoSextaFeira(meuNome, isPresente, mutado) {
    const [transcript, setTranscript] = useState('');

    useEffect(() => {
        // Se o jogador não está na call ou mutou o mic, a Sexta-Feira para de ouvir
        if (!isPresente || mutado) return;

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) return console.warn("Navegador não suporta transcrição nativa.");

        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'pt-BR'; // ou pt-PT

        recognition.onresult = (event) => {
            const lastResultIndex = event.results.length - 1;
            const fraseDigitada = event.results[lastResultIndex][0].transcript.trim();
            
            if (fraseDigitada) {
                console.log(`[Sexta-Feira ouviu] ${meuNome}: ${fraseDigitada}`);
                // 🔥 AQUI VOCÊ ATIRA PARA O FIREBASE:
                // enviarMemoriaSextaFeira(meuNome, fraseDigitada);
            }
        };

        recognition.onerror = (e) => console.log("Erro no ouvido da IA:", e.error);
        
        // Reinicia automaticamente se parar
        recognition.onend = () => { if (isPresente && !mutado) recognition.start(); };

        recognition.start();

        return () => { recognition.onend = null; recognition.abort(); };
    }, [meuNome, isPresente, mutado]);

    return transcript;
}
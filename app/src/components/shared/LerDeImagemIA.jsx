import React, { useRef, useState } from 'react';
import useStore from '../../stores/useStore';
import { MODELO_GEMINI_PADRAO } from '../../core/sextaFeira';
import { LIMITE_IMAGENS, TIPOS_IMAGEM_ACEITOS, montarPromptComImagens } from '../../core/imagemIA';
import { reduzirImagem, lerImagensComIA } from '../../services/lerImagemIA';

// 📷 "Ler de imagem": o jogador escolhe prints da ficha antiga, a Sexta-Feira (Gemini) lê o texto e devolve o JSON do importador,
// que segue para a prévia de sempre. `montarPrompt()` devolve o prompt do importador (com TEXTO_DAS_IMAGENS no lugar do texto);
// `onResposta(texto)` recebe a resposta crua da IA.
export default function LerDeImagemIA({ montarPrompt, onResposta }) {
    const config = useStore(s => s.sextaFeiraConfig);
    const inputRef = useRef(null);
    const [imagens, setImagens] = useState([]);
    const [lendo, setLendo] = useState(false);
    const [reduzindo, setReduzindo] = useState(false);
    const [erro, setErro] = useState('');
    const configurada = !!(config && config.chaveGemini);

    const escolher = async (e) => {
        const arquivos = Array.from((e.target && e.target.files) || []);
        if (e.target) e.target.value = '';
        if (arquivos.length === 0) return;
        setErro('');
        setReduzindo(true);
        const vagas = LIMITE_IMAGENS - imagens.length;
        if (vagas <= 0) { setErro(`No máximo ${LIMITE_IMAGENS} imagens por leitura.`); setReduzindo(false); return; }
        const novas = [];
        const problemas = [];
        for (const arq of arquivos.slice(0, vagas)) {
            try { novas.push(await reduzirImagem(arq)); } catch (err) { problemas.push(err.message || 'Imagem inválida.'); }
        }
        if (arquivos.length > vagas) problemas.push(`Só cabem ${LIMITE_IMAGENS} imagens: ignorei ${arquivos.length - vagas}.`);
        if (novas.length) setImagens(atual => [...atual, ...novas].slice(0, LIMITE_IMAGENS));
        if (problemas.length) setErro(problemas.join(' '));
        setReduzindo(false);
    };

    const ler = async () => {
        if (!configurada) { setErro('A Sexta-Feira ainda não foi configurada: o Mestre precisa cadastrar a chave do Gemini (aba Sexta-Feira, ⚙️ Config).'); return; }
        if (imagens.length === 0) { setErro('Escolha pelo menos uma imagem.'); return; }
        setErro('');
        setLendo(true);
        try {
            const texto = await lerImagensComIA({
                chave: config.chaveGemini, modelo: config.modelo || MODELO_GEMINI_PADRAO,
                prompt: montarPromptComImagens(montarPrompt()), imagens,
            });
            // Só descarta as imagens se a resposta foi aceita (senão o jogador tenta de novo sem pagar outra leitura).
            if (onResposta(texto) !== false) setImagens([]);
        } catch (err) {
            setErro(err && err.message ? err.message : 'Não consegui ler as imagens.');
        } finally {
            setLendo(false);
        }
    };

    return (
        <div className="importacao-imagens">
            <div className="importacao-imagens-titulo">📷 Ou leia direto de prints (a Sexta-Feira lê o texto das imagens)</div>
            <input ref={inputRef} type="file" multiple accept={TIPOS_IMAGEM_ACEITOS.join(',')} aria-label="Escolher imagens" onChange={escolher} className="importacao-imagens-input" />
            <button type="button" className="importacao-imagens-botao" onClick={() => inputRef.current && inputRef.current.click()} disabled={lendo || reduzindo || imagens.length >= LIMITE_IMAGENS}>+ Escolher imagens</button>
            {imagens.length > 0 && (
                <ul className="importacao-imagens-lista" aria-label="Imagens escolhidas">
                    {imagens.map((img, i) => (
                        <li key={`${img.nome}_${i}`}>🖼️ {img.nome} <button type="button" className="importacao-remover" aria-label={`Tirar ${img.nome}`} onClick={() => setImagens(atual => atual.filter((_, j) => j !== i))}>✕</button></li>
                    ))}
                </ul>
            )}
            <button type="button" className="importacao-imagens-botao" onClick={ler} disabled={lendo || reduzindo || imagens.length === 0}>{lendo ? 'Lendo as imagens…' : `Ler ${imagens.length || ''} imagem(ns) com a Sexta-Feira`}</button>
            <div className="importacao-imagens-dica">As imagens vão ao Gemini (Google) pela chave da mesa e não ficam guardadas. Máximo de {LIMITE_IMAGENS} por leitura. Confira tudo na prévia antes de gravar.</div>
            {erro && <div className="importacao-aviso" role="alert">⚠️ {erro}</div>}
        </div>
    );
}

import React from 'react';
import { MENSAGEM_SEM_CHAVE, descreverFalhas } from '../../core/transcricaoIA';

// ✨ Caminho principal do Círculo de Invocação: texto + "Ler com a IA" (progresso, cancelar, erro).
// Só apresenta; quem lê e guarda o estado é PoderesImportadorIA.
export default function LerTextoComIA({ texto, onTexto, configurada, lendo, progresso, erro, onLer, onCancelar }) {
    const vazio = !String(texto || '').trim();
    const pct = progresso && progresso.total > 0 ? Math.round(((progresso.indice - 1) / progresso.total) * 100) : 0;
    return (
        <div className="importador-ia">
            <textarea className="importador-ia-texto" value={texto} onChange={e => onTexto(e.target.value)} placeholder="Cole aqui os textos longos..." aria-label="Texto das habilidades" disabled={lendo} />
            {!configurada && <div className="importador-ia-semchave">{MENSAGEM_SEM_CHAVE}</div>}
            <div className="importador-ia-acoes">
                <button type="button" className="importador-ia-botao" onClick={onLer} disabled={!configurada || lendo || vazio}>
                    {lendo ? 'Lendo…' : '✨ Ler com a IA'}
                </button>
                {lendo && <button type="button" className="importador-ia-cancelar" onClick={onCancelar}>Cancelar</button>}
            </div>
            {lendo && progresso && (
                <div className="importador-ia-progresso" role="status" aria-live="polite">
                    <span>{progresso.texto}</span>
                    <div className="importador-ia-barra"><div className="importador-ia-barra-preenchida" style={{ width: `${pct}%` }} /></div>
                </div>
            )}
            <div className="importador-ia-dica">O texto será enviado ao Gemini (Google), pela chave da mesa, para ser lido. Confira tudo na prévia antes de gravar.</div>
            {erro && <div className="importacao-aviso" role="alert">⚠️ {erro}</div>}
        </div>
    );
}

// Partes do texto que a IA não conseguiu ler, com opção de tentar só aquela de novo.
export function AvisoPartesFalhas({ falhas, lendo, onTentarDeNovo }) {
    if (!Array.isArray(falhas) || falhas.length === 0) return null;
    const frases = descreverFalhas(falhas);
    return (
        <div className="importador-ia-falhas" role="alert">
            {falhas.map((f, i) => (
                <div key={`${f.indice}_${f.total}`} className="importador-ia-falha">
                    <span>⚠️ {frases[i]}</span>
                    <button type="button" disabled={lendo} onClick={() => onTentarDeNovo(f)}>Tentar de novo a parte {f.indice}</button>
                </div>
            ))}
        </div>
    );
}

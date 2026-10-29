import React, { useState } from 'react';
import { ICONES_PONTO, NOME_PONTO_MAX, ICONE_PADRAO, CATEGORIAS_PONTO, CATEGORIA_PADRAO } from '../../core/pontosInteresse';

// Janela do Mestre para criar ou editar um ponto de interesse (nome + ícone). `ponto` null = ponto novo.
export default function FormPonto({ regiao, ponto = null, onSalvar, onExcluir, onFechar }) {
    const [nome, setNome] = useState(ponto?.nome || '');
    const [icone, setIcone] = useState(ponto?.icone || ICONE_PADRAO);
    const [categoria, setCategoria] = useState(ponto?.categoria || CATEGORIA_PADRAO);
    const confirmar = () => { if (nome.trim()) onSalvar({ nome: nome.trim(), icone, categoria }); };

    return (
        <div className="ponto-form-fundo" onClick={onFechar}>
            <div className="ponto-form" role="dialog" aria-label={ponto ? 'Editar ponto de interesse' : 'Novo ponto de interesse'} onClick={(e) => e.stopPropagation()}>
                <button type="button" className="ponto-form-fechar" onClick={onFechar} aria-label="Fechar">✕</button>
                <h3>{ponto ? 'Editar ponto' : 'Novo ponto'} em {regiao}</h3>
                <input
                    type="text"
                    className="input-neon"
                    autoFocus
                    value={nome}
                    maxLength={NOME_PONTO_MAX}
                    onChange={(e) => setNome(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmar(); }}
                    placeholder="Nome do ponto de interesse..."
                    aria-label="Nome do ponto de interesse"
                />
                <div className="ponto-form-categorias" role="group" aria-label="Tipo de ponto">
                    {CATEGORIAS_PONTO.map((c) => (
                        <button key={c.id} type="button" className={`ponto-form-categoria${categoria === c.id ? ' ativo' : ''}`} onClick={() => { setCategoria(c.id); if (c.id === 'dungeon' && icone === ICONE_PADRAO) setIcone('masmorra'); }} aria-pressed={categoria === c.id}>{c.emoji} {c.id === 'dungeon' ? 'Entrada de dungeon' : 'Local'}</button>
                    ))}
                </div>
                <div className="ponto-form-icones" role="group" aria-label="Ícone">
                    {ICONES_PONTO.map((i) => (
                        <button key={i.id} type="button" className={`ponto-form-icone${icone === i.id ? ' ativo' : ''}`} onClick={() => setIcone(i.id)} aria-pressed={icone === i.id} title={i.nome} aria-label={i.nome}>{i.emoji}</button>
                    ))}
                </div>
                <div className="ponto-form-acoes">
                    {ponto && onExcluir && <button type="button" className="ponto-form-excluir" onClick={onExcluir}>🗑 Excluir</button>}
                    <button type="button" className="btn-neon" onClick={confirmar} disabled={!nome.trim()}>✅ Salvar</button>
                </div>
            </div>
        </div>
    );
}
